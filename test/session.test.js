// Hive's session rules (api/shared/session.js) and the sign-out endpoint.
//
// Run with:  node test/session.test.js
//
// Idle timeout and maximum age end a session with 401 session_expired and
// expire every sign-in cookie; a request from another site that changes
// something is refused; a tampered or foreign cookie starts a fresh session
// (never extends one); /api/me/session describes the timer; /api/logout
// clears all three cookies and refuses cross-site callers.
const assert = require("assert");
const path = require("path");
const Module = require("module");

const realResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (request === "@azure/storage-blob") return "@azure/storage-blob";
  return realResolve.call(this, request, parent, ...rest);
};
require.cache["@azure/storage-blob"] = { id: "@azure/storage-blob", filename: "@azure/storage-blob", loaded: true, exports: { BlobServiceClient: { fromConnectionString() { throw new Error("no storage in test"); } } } };

process.env.AZURE_CLIENT_SECRET = "test-secret";
process.env.HIVE_IDLE_MINUTES = "30";
process.env.HIVE_SESSION_HOURS = "12";
delete process.env.HIVE_SESSION_SECRET;
delete process.env.STORAGE_CONNECTION_STRING;

const S = require(path.join(__dirname, "..", "api", "shared", "session.js"));
const logoutFn = require(path.join(__dirname, "..", "api", "logout", "index.js"));

const UPN = "teacher.h@example.edu";
function principal(user) {
  return Buffer.from(JSON.stringify({ identityProvider: "aad", userId: "x", userDetails: user, userRoles: ["anonymous", "authenticated"] })).toString("base64");
}
function ctx() { return { log: Object.assign(() => {}, { error() {}, warn() {} }), res: null }; }
function req({ method = "GET", user = UPN, cookie, headers = {} } = {}) {
  const h = Object.assign({ host: "fengchao.life" }, headers);
  if (user) h["x-ms-client-principal"] = principal(user);
  if (cookie) h.cookie = cookie;
  return { method, headers: h, params: {}, query: {}, body: null };
}
const MIN = 60 * 1000, HOUR = 60 * MIN;
function cookieFor(obj) { return `${S.COOKIE}=${encodeURIComponent(S._encode(obj))}`; }
function names(cookies) { return Array.from(new Set((cookies || []).map((c) => c.name))).sort(); }

(async () => {
  // 1. No principal → 401 signed_out.
  let c = ctx();
  assert.strictEqual(await S.guard(c, req({ user: null })), null);
  assert.strictEqual(c.res.status, 401);
  assert.strictEqual(c.res.body.code, "signed_out");

  // 2. First call: a new session, cookie issued, Strict + HttpOnly.
  c = ctx();
  let s = await S.guard(c, req());
  assert.ok(s && s.session.isNew);
  assert.strictEqual(s.upn, UPN);
  const issued = s.session.cookies[0];
  assert.strictEqual(issued.name, S.COOKIE);
  assert.strictEqual(issued.httpOnly, true);
  assert.strictEqual(issued.sameSite, "Strict");
  const decoded = S._decode(issued.value);
  assert.strictEqual(decoded.u, UPN);
  assert.ok(Math.abs(decoded.s - Date.now()) < 5000);

  // 3. An active session is refreshed, keeps its start.
  const now = Date.now();
  c = ctx();
  s = await S.guard(c, req({ cookie: cookieFor({ u: UPN, s: now - 2 * HOUR, t: now - 10 * MIN }) }));
  assert.ok(s && !s.session.isNew);
  assert.strictEqual(s.session.startedAt, now - 2 * HOUR);
  assert.ok(S._decode(s.session.cookies[0].value).t >= now);
  const d = S.describe(s);
  assert.strictEqual(d.idleSeconds, 1800);
  assert.strictEqual(d.maxSeconds, 12 * 3600);
  assert.ok(new Date(d.expiresAt) - Date.now() <= 30 * MIN + 1000);

  // 4. Idle too long → 401 session_expired/idle and all sign-in cookies expired.
  c = ctx();
  assert.strictEqual(await S.guard(c, req({ cookie: cookieFor({ u: UPN, s: now - HOUR, t: now - 31 * MIN }) })), null);
  assert.strictEqual(c.res.status, 401);
  assert.strictEqual(c.res.body.code, "session_expired");
  assert.strictEqual(c.res.body.reason, "idle");
  assert.deepStrictEqual(names(c.res.cookies), ["StaticWebAppsAuthCookie", "StaticWebAppsAuthContextCookie", S.COOKIE].sort());
  assert.ok(c.res.cookies.every((k) => k.maxAge === 0));

  // 5. Too old, even if active → reason age.
  c = ctx();
  assert.strictEqual(await S.guard(c, req({ cookie: cookieFor({ u: UPN, s: now - 13 * HOUR, t: now - MIN }) })), null);
  assert.strictEqual(c.res.body.reason, "age");

  // 6. A tampered cookie cannot extend a session: it is ignored and a new one starts.
  const good = S._encode({ u: UPN, s: now - 13 * HOUR, t: now - MIN });
  const tampered = Buffer.from(JSON.stringify({ u: UPN, s: now, t: now }), "utf8").toString("base64url") + "." + good.split(".")[1];
  c = ctx();
  s = await S.guard(c, req({ cookie: `${S.COOKIE}=${encodeURIComponent(tampered)}` }));
  assert.ok(s && s.session.isNew, "tampered → fresh session");
  // …and so does another account's cookie.
  c = ctx();
  s = await S.guard(c, req({ cookie: cookieFor({ u: "someone.else@example.edu", s: now - HOUR, t: now - MIN }) }));
  assert.ok(s && s.session.isNew, "foreign → fresh session");

  // 7. Cross-site writes are refused; reads are not; same-site is fine; no header is fine.
  c = ctx();
  assert.strictEqual(await S.guard(c, req({ method: "POST", headers: { origin: "https://evil.example" } })), null);
  assert.strictEqual(c.res.status, 403);
  assert.strictEqual(c.res.body.code, "cross_site");
  c = ctx();
  assert.strictEqual(await S.guard(c, req({ method: "DELETE", headers: { "sec-fetch-site": "cross-site" } })), null);
  assert.strictEqual(c.res.status, 403);
  c = ctx();
  assert.ok(await S.guard(c, req({ method: "GET", headers: { origin: "https://evil.example" } })), "a GET changes nothing");
  c = ctx();
  assert.ok(await S.guard(c, req({ method: "POST", headers: { origin: "https://fengchao.life", "sec-fetch-site": "same-origin" } })));
  c = ctx();
  assert.ok(await S.guard(c, req({ method: "POST", headers: { origin: "https://fengchao.life", "x-forwarded-host": "fengchao.life", host: "internal" } })), "forwarded host wins");
  c = ctx();
  assert.ok(await S.guard(c, req({ method: "POST" })), "no Origin / Sec-Fetch-Site (script) is allowed");

  // 8. finish() attaches the cookie and no-store.
  c = ctx();
  s = await S.guard(c, req());
  c.res = { status: 200, body: { ok: true } };
  S.finish(c, s);
  assert.deepStrictEqual(names(c.res.cookies), [S.COOKIE]);
  assert.strictEqual(c.res.headers["Cache-Control"], "no-store");

  // 9. /api/logout clears all three cookies; a cross-site caller is refused.
  c = ctx();
  await logoutFn(c, req({ method: "POST", headers: { origin: "https://fengchao.life" } }));
  assert.strictEqual(c.res.status, 204);
  assert.deepStrictEqual(names(c.res.cookies), ["StaticWebAppsAuthCookie", "StaticWebAppsAuthContextCookie", S.COOKIE].sort());
  c = ctx();
  await logoutFn(c, req({ method: "POST", headers: { origin: "https://evil.example" } }));
  assert.strictEqual(c.res.status, 403);

  // 10. Settings are clamped to sane ranges.
  process.env.HIVE_IDLE_MINUTES = "0";
  c = ctx(); s = await S.guard(c, req());
  assert.strictEqual(S.describe(s).idleSeconds, 1800, "0 minutes falls back to the default");
  process.env.HIVE_IDLE_MINUTES = "15";
  c = ctx(); s = await S.guard(c, req());
  assert.strictEqual(S.describe(s).idleSeconds, 900);

  console.log("session: all assertions passed");
})().catch((e) => { console.error(e); process.exit(1); });
