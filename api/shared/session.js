// Hive's own session rules on top of Static Web Apps' sign-in cookie.
//
// Static Web Apps keeps a browser signed in for as long as its own cookie
// lives, and offers no idle timeout, no maximum age and no CSRF check. This
// module adds them for every signed-in API (Rick, 2026-10-02: 「超时候自动退出」):
//
//  * idle timeout   — no request for HIVE_IDLE_MINUTES (default 30) ends the session;
//  * maximum age    — a session older than HIVE_SESSION_HOURS (default 12) ends,
//                     however active, so a forgotten browser is signed out by the
//                     next morning;
//  * CSRF           — a request that changes something (POST/PATCH/PUT/DELETE) must
//                     come from this site: an Origin or Sec-Fetch-Site header that
//                     says otherwise is refused. Requests without either header
//                     (tests, scripts) are allowed — browsers always send one.
//
// The session is a signed, HttpOnly cookie `fc-sess` = base64url(json) "." hmac,
// json = { u: upn, s: startedAt(ms), t: lastSeenAt(ms) }. It is created on the
// first signed-in API call after sign-in and refreshed (t) on every allowed
// call. A missing, foreign or tampered cookie starts a new session — it cannot
// grant anything, since the person must already hold Static Web Apps' own
// sign-in cookie to get this far. When a session has expired the reply is
// 401 { code: "session_expired", reason: "idle" | "age" } and every session
// cookie, Static Web Apps' included, is expired in the same reply, so the
// browser is signed out of Hive; the page then shows 重新登录.
//
// Signing key: HIVE_SESSION_SECRET, else AZURE_CLIENT_SECRET (always set on the
// site). Without either the guard still runs, with an unsigned cookie — only in
// local development.
const crypto = require("crypto");
const { getPrincipal } = require("./auth");
const { audit } = require("./audit");

const COOKIE = "fc-sess";
const SWA_COOKIES = ["StaticWebAppsAuthCookie", "StaticWebAppsAuthContextCookie"];
const MUTATING = new Set(["POST", "PATCH", "PUT", "DELETE"]);

function num(name, dflt, min, max) {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v >= min && v <= max ? v : dflt;
}
function idleMs() { return num("HIVE_IDLE_MINUTES", 30, 1, 24 * 60) * 60 * 1000; }
function maxMs() { return num("HIVE_SESSION_HOURS", 12, 1, 24 * 7) * 60 * 60 * 1000; }
function secret() { return process.env.HIVE_SESSION_SECRET || process.env.AZURE_CLIENT_SECRET || ""; }

function sign(payload) {
  const k = secret();
  if (!k) return "";
  return crypto.createHmac("sha256", k).update(payload).digest("base64url");
}
function encode(obj) {
  const payload = Buffer.from(JSON.stringify(obj), "utf8").toString("base64url");
  return payload + "." + sign(payload);
}
function decode(value) {
  if (!value) return null;
  const i = value.lastIndexOf(".");
  if (i < 0) return null;
  const payload = value.slice(0, i), sig = value.slice(i + 1);
  const want = sign(payload);
  if (want.length !== sig.length || (want && !crypto.timingSafeEqual(Buffer.from(want), Buffer.from(sig)))) return null;
  try {
    const obj = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return obj && typeof obj.u === "string" && Number.isFinite(obj.s) && Number.isFinite(obj.t) ? obj : null;
  } catch { return null; }
}

function parseCookies(req) {
  const out = {};
  const raw = (req.headers && (req.headers.cookie || req.headers.Cookie)) || "";
  for (const part of String(raw).split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (k && !(k in out)) out[k] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function expiredCookie(name) {
  return { name, value: "", path: "/", expires: new Date(0), maxAge: 0, secure: true, httpOnly: true, sameSite: "Lax" };
}
// Every cookie that keeps a browser signed in to Hive, expired. Used here and by
// /api/logout. Static Web Apps' cookies are expired both as host-only and for the
// site's domain, since a cookie is only replaced by one with the same name, path
// and domain and the platform does not document which it sets.
function signOutCookies() {
  const out = SWA_COOKIES.concat(COOKIE).map(expiredCookie);
  const host = String(process.env.HIVE_HOST || "fengchao.life").toLowerCase();
  for (const name of SWA_COOKIES) out.push(Object.assign(expiredCookie(name), { domain: host }));
  return out;
}
function sessionCookie(sess) {
  // Strict: the cookie is only read by same-origin fetches from Hive's own pages.
  return { name: COOKIE, value: encode(sess), path: "/", maxAge: Math.ceil(maxMs() / 1000), secure: true, httpOnly: true, sameSite: "Strict" };
}

function requestHost(req) {
  const h = req.headers || {};
  return String(h["x-forwarded-host"] || h.host || "").split(",")[0].trim().toLowerCase();
}

// Is this a browser request from another site? (CSRF)
function crossSite(req) {
  const h = req.headers || {};
  const sfs = String(h["sec-fetch-site"] || "").toLowerCase();
  if (sfs && sfs !== "same-origin" && sfs !== "same-site" && sfs !== "none") return `Sec-Fetch-Site ${sfs}`;
  const origin = String(h.origin || "").toLowerCase();
  if (origin && origin !== "null") {
    let oh = "";
    try { oh = new URL(origin).host.toLowerCase(); } catch { return `Origin ${origin}`; }
    const host = requestHost(req);
    if (host && oh !== host) return `Origin ${origin}`;
  } else if (origin === "null") {
    return "Origin null";
  }
  return "";
}

function reply(context, status, body, cookies) {
  context.res = { status, headers: { "Cache-Control": "no-store" }, body };
  if (cookies) context.res.cookies = cookies;
}

// The guard. Returns { principal, upn, session } when the request may go on;
// otherwise writes the refusal to context.res and returns null. The caller
// must merge `session.cookies` into its own response (see `finish`), so the
// refreshed cookie reaches the browser — or call `finish(context, s)` at the end.
async function guard(context, req, opts) {
  const o = opts || {};
  const method = String(req.method || "GET").toUpperCase();
  const p = getPrincipal(req);
  const upn = String((p && p.userDetails) || "").trim().toLowerCase();
  if (!upn) { reply(context, 401, { error: "sign in first", code: "signed_out" }); return null; }

  if (MUTATING.has(method) || o.strict) {
    const why = crossSite(req);
    if (why) { reply(context, 403, { error: "request refused: it did not come from this site (" + why + ")", code: "cross_site" }); return null; }
  }

  const now = Date.now();
  const cookies = parseCookies(req);
  let sess = decode(cookies[COOKIE]);
  if (sess && sess.u !== upn) sess = null; // another account signed in on this browser: start afresh

  if (sess) {
    const idle = now - sess.t, age = now - sess.s;
    const reason = idle > idleMs() ? "idle" : age > maxMs() ? "age" : "";
    if (reason) {
      try { await audit(context, { actor: upn, action: "session.timeout", reason, idleMinutes: Math.round(idle / 60000), ageMinutes: Math.round(age / 60000), result: "ok" }); } catch { /* best effort */ }
      reply(context, 401, {
        error: reason === "idle" ? "signed out after inactivity — please sign in again" : "the session reached its maximum age — please sign in again",
        code: "session_expired", reason,
      }, signOutCookies());
      return null;
    }
  }
  const started = sess ? sess.s : now;
  const fresh = { u: upn, s: started, t: now };
  const session = {
    startedAt: started, lastSeenAt: now,
    idleMs: idleMs(), maxMs: maxMs(),
    expiresAt: Math.min(now + idleMs(), started + maxMs()),
    cookies: [sessionCookie(fresh)],
    isNew: !sess,
  };
  return { principal: p, upn, session };
}

// Attach the refreshed session cookie to whatever response the function built.
function finish(context, s) {
  if (!s || !context.res) return;
  const res = context.res;
  res.cookies = (res.cookies || []).concat(s.session.cookies);
  res.headers = Object.assign({}, res.headers || {}, { "Cache-Control": "no-store" });
}

// What the browser needs to run its own idle timer in step with the server.
function describe(s) {
  return {
    user: s.upn,
    startedAt: new Date(s.session.startedAt).toISOString(),
    lastSeenAt: new Date(s.session.lastSeenAt).toISOString(),
    expiresAt: new Date(s.session.expiresAt).toISOString(),
    idleSeconds: Math.round(s.session.idleMs / 1000),
    maxSeconds: Math.round(s.session.maxMs / 1000),
  };
}

module.exports = { guard, finish, describe, signOutCookies, crossSite, parseCookies, COOKIE, _encode: encode, _decode: decode };
