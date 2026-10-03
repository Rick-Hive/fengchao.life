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
//  * account check  — every 30 minutes per account (HIVE_ACCOUNT_CHECK_MINUTES) the
//                     directory is asked whether the password changed after the
//                     session began or the account was disabled; either ends the
//                     session (401 session_expired, reason "password" | "disabled");
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
const { graph } = require("./graph");

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
    if (obj && obj.out === 1 && typeof obj.k === "string") return obj; // the sign-out marker
    return obj && typeof obj.u === "string" && Number.isFinite(obj.s) && Number.isFinite(obj.t) ? obj : null;
  } catch { return null; }
}

// Something that changes with every sign-in: Static Web Apps' own cookie, and the
// token's issue time (iat / auth_time) when the principal carries claims. Either
// is enough; both are hashed in case the platform forwards only one of them.
function signInKey(cookies, principal) {
  const claims = (principal && Array.isArray(principal.claims) ? principal.claims : []);
  const pick = (t) => { const c = claims.find((x) => x && (x.typ === t || String(x.typ).endsWith("/" + t))); return c ? String(c.val) : ""; };
  const stamp = pick("auth_time") || pick("iat") || "";
  return crypto.createHash("sha256").update(String(cookies.StaticWebAppsAuthCookie || "")).update("|").update(stamp).digest("base64url").slice(0, 16);
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
// 退出 that does not depend on Static Web Apps letting a function clear its cookie
// (on the live site it does not — Rick, 2026-10-02: after 退出 the header still said
// 我的账号): the browser's fc-sess becomes a signed "signed out" marker bound to the
// sign-in it ends (k). While that sign-in's cookie is still presented, every guarded
// call answers 401 signed_out and the header shows 登录. A new sign-in (new k) is
// not affected. The marker lives as long as a session may (maxMs).
function signedOutCookie(k) {
  return { name: COOKIE, value: encode({ out: 1, k, t: Date.now() }), path: "/", maxAge: Math.ceil(maxMs() / 1000), secure: true, httpOnly: true, sameSite: "Strict" };
}

// Every cookie that keeps a browser signed in to Hive, expired. Used here and by
// /api/logout. Static Web Apps' cookies are expired both as host-only and for the
// site's domain, since a cookie is only replaced by one with the same name, path
// and domain and the platform does not document which it sets.
function signOutCookies(k) {
  const out = SWA_COOKIES.map(expiredCookie);
  out.push(k ? signedOutCookie(k) : expiredCookie(COOKIE));
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

// ---- the account behind the session -------------------------------------------------
const ACCOUNT_CHECK_MS = Number(process.env.HIVE_ACCOUNT_CHECK_MINUTES || 30) * 60 * 1000;
const accountCache = new Map(); // upn → { at, enabled, passwordChangedAt }
// Never on the request's critical path: the first call for an account fetches the
// state in the background and answers from nothing; later calls answer from the
// cache and, once it is older than the window, refresh it in the background
// (stale-while-revalidate). So a password change takes effect on the person's
// next request after the refresh lands — seconds — and no request ever waits for
// Graph. Load: one small Graph read per active account per window, not per request.
const refreshing = new Map(); // upn → Promise
function refreshAccount(upn, context) {
  if (refreshing.has(upn)) return refreshing.get(upn);
  const p = graph("GET", `/users/${encodeURIComponent(upn)}?$select=accountEnabled,lastPasswordChangeDateTime`)
    .then((u) => { accountCache.set(upn, { at: Date.now(), enabled: u && u.accountEnabled !== false, passwordChangedAt: u && u.lastPasswordChangeDateTime ? Date.parse(u.lastPasswordChangeDateTime) : 0 }); })
    .catch((err) => { if (context && context.log && context.log.warn) context.log.warn(`session: account check for ${upn} skipped: ${err.message}`); })
    .then(() => { refreshing.delete(upn); });
  refreshing.set(upn, p);
  return p;
}
async function accountState(upn, context) {
  const hit = accountCache.get(upn);
  if (!hit) { refreshAccount(upn, context); return null; }
  if (Date.now() - hit.at >= ACCOUNT_CHECK_MS) refreshAccount(upn, context);
  return hit;
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
  // soft: never refuse — answer 200 { signedIn: false, reason } instead (the header's state check).
  const refuse = (status, body, cookies) => { if (o.soft) reply(context, 200, Object.assign({ signedIn: false }, body), cookies); else reply(context, status, body, cookies); return null; };
  const method = String(req.method || "GET").toUpperCase();
  const p = getPrincipal(req);
  const upn = String((p && p.userDetails) || "").trim().toLowerCase();
  if (!upn) return refuse(401, { error: "sign in first", code: "signed_out" });

  if (MUTATING.has(method) || o.strict) {
    const why = crossSite(req);
    if (why) return refuse(403, { error: "request refused: it did not come from this site (" + why + ")", code: "cross_site" });
  }

  const now = Date.now();
  const cookies = parseCookies(req);
  // The session is bound to this sign-in: `k` is a hash of Static Web Apps' own
  // cookie. A fresh sign-in gives a new cookie, so an fc-sess left over from an
  // earlier session (one that ended without /api/logout — Microsoft's page, a
  // closed browser) starts a new session instead of being judged idle and
  // sending the person straight back home (Rick, 2026-10-02: 「账号登录后自动
  // 返回主页面」). If the platform does not forward its cookie, k is constant.
  const k = signInKey(cookies, p);
  let sess = decode(cookies[COOKIE]);
  if (sess && sess.out === 1) {
    if (sess.k === k) return refuse(401, { error: "signed out — please sign in again", code: "signed_out", reason: "signed_out" }, [signedOutCookie(k)]);
    sess = null; // the marker belonged to an earlier sign-in: this is a new one
  }
  if (sess && sess.u !== upn) sess = null; // another account signed in on this browser: start afresh
  if (sess && sess.k !== k) sess = null; // a new sign-in: start afresh

  if (sess) {
    const idle = now - sess.t, age = now - sess.s;
    const reason = idle > idleMs() ? "idle" : age > maxMs() ? "age" : "";
    if (reason) {
      try { await audit(context, { actor: upn, action: "session.timeout", reason, idleMinutes: Math.round(idle / 60000), ageMinutes: Math.round(age / 60000), result: "ok" }); } catch { /* best effort */ }
      return refuse(401, {
        error: reason === "idle" ? "signed out after inactivity — please sign in again" : "the session reached its maximum age — please sign in again",
        code: "session_expired", reason,
      }, signOutCookies(k));
    }
  }
  // The account itself: a password changed after this session began, or an
  // account disabled meanwhile, ends the session (Rick, 2026-10-02: 「用户自助修改
  // 密码后……强制重新登录」). Microsoft does not notify the site, so the directory is
  // asked at most once per ACCOUNT_CHECK_MS per account; a Graph failure is not
  // the person's fault and is skipped.
  if (sess) {
    const state = await accountState(upn, context);
    if (state) {
      const reason = state.enabled === false ? "disabled" : (state.passwordChangedAt && state.passwordChangedAt > sess.s + 60000 ? "password" : "");
      if (reason) {
        try { await audit(context, { actor: upn, action: "session.timeout", reason, result: "ok" }); } catch { /* best effort */ }
        accountCache.delete(upn);
        return refuse(401, {
          error: reason === "password" ? "the password was changed — please sign in again" : "this account has been disabled",
          code: "session_expired", reason,
        }, signOutCookies(k));
      }
    }
  }
  const started = sess ? sess.s : now;
  const fresh = { u: upn, s: started, t: now, k };
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

module.exports = { guard, finish, describe, signOutCookies, signedOutCookie, signInKey, crossSite, parseCookies, COOKIE, _encode: encode, _decode: decode, _signInKey: signInKey, _accountCache: accountCache, _refreshAccount: refreshAccount };
