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
function cookieFor(obj) { return `${S.COOKIE}=${encodeURIComponent(S._encode(Object.assign({ k: S._signInKey({}) }, obj)))}`; }
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

  // 6b. An fc-sess left over from an earlier sign-in (different Static Web Apps cookie)
  //     starts a fresh session instead of being judged idle — the "signed in, sent
  //     straight home" bug.
  const oldSwa = "StaticWebAppsAuthCookie=OLD-SESSION";
  c = ctx();
  s = await S.guard(c, req({ cookie: oldSwa + "; " + cookieFor({ u: UPN, s: now - 2 * HOUR, t: now - MIN }) }));
  const k1 = S._decode(s.session.cookies[0].value).k;
  const stale = S._encode({ u: UPN, s: now - 3 * HOUR, t: now - 2 * HOUR, k: k1 });
  c = ctx();
  assert.strictEqual(await S.guard(c, req({ cookie: oldSwa + "; " + S.COOKIE + "=" + encodeURIComponent(stale) })), null, "same sign-in, idle → expired");
  assert.strictEqual(c.res.body.reason, "idle");
  c = ctx();
  s = await S.guard(c, req({ cookie: "StaticWebAppsAuthCookie=NEW-SESSION; " + S.COOKIE + "=" + encodeURIComponent(stale) }));
  assert.ok(s && s.session.isNew, "new sign-in with a stale fc-sess → fresh session, not a timeout");

  //     …and the same when only the token's issue time differs (claims in the principal).
  function principalWith(iat) { return Buffer.from(JSON.stringify({ identityProvider: "aad", userId: "x", userDetails: UPN, userRoles: ["anonymous", "authenticated"], claims: [{ typ: "iat", val: String(iat) }] })).toString("base64"); }
  c = ctx();
  s = await S.guard(c, { method: "GET", headers: { host: "fengchao.life", "x-ms-client-principal": principalWith(1000) }, params: {}, query: {}, body: null });
  const k2 = S._decode(s.session.cookies[0].value).k;
  const stale2 = S._encode({ u: UPN, s: now - 3 * HOUR, t: now - 2 * HOUR, k: k2 });
  c = ctx();
  assert.strictEqual(await S.guard(c, { method: "GET", headers: { host: "fengchao.life", "x-ms-client-principal": principalWith(1000), cookie: S.COOKIE + "=" + encodeURIComponent(stale2) }, params: {}, query: {}, body: null }), null, "same iat, idle → expired");
  c = ctx();
  s = await S.guard(c, { method: "GET", headers: { host: "fengchao.life", "x-ms-client-principal": principalWith(2000), cookie: S.COOKIE + "=" + encodeURIComponent(stale2) }, params: {}, query: {}, body: null });
  assert.ok(s && s.session.isNew, "new iat → fresh session");

  // 6c. The account behind the session: a password changed after the session began,
  //     or a disabled account, ends it; the directory is asked at most once per window.
  process.env.AZURE_TENANT_ID = "t"; process.env.AZURE_CLIENT_ID = "c";
  let graphCalls = 0, account = { accountEnabled: true, lastPasswordChangeDateTime: new Date(now - 24 * HOUR).toISOString() };
  global.fetch = async (url) => {
    const u = new URL(String(url));
    if (u.hostname === "login.microsoftonline.com") return { ok: true, status: 200, headers: { get: () => null }, text: async () => JSON.stringify({ access_token: "tok", expires_in: 3600 }), json: async () => ({ access_token: "tok", expires_in: 3600 }) };
    graphCalls++;
    return { ok: true, status: 200, headers: { get: () => null }, text: async () => JSON.stringify(account), json: async () => account };
  };
  const SESS = () => req({ cookie: cookieFor({ u: UPN, s: now - 2 * HOUR, t: now - MIN }) });
  const settle = () => new Promise((r) => setTimeout(r, 20)); // let the background refresh land
  S._accountCache.clear();
  c = ctx();
  s = await S.guard(c, SESS());
  assert.ok(s && !s.session.isNew, "first call answers at once (state fetched in the background)");
  await settle();
  assert.strictEqual(graphCalls, 1);
  c = ctx();
  s = await S.guard(c, SESS());
  assert.ok(s, "old password change → session fine");
  assert.strictEqual(graphCalls, 1, "cached: no second directory call within the window");
  // the password changes during the session: the cache expires, a background refresh runs, the NEXT request is refused
  account = { accountEnabled: true, lastPasswordChangeDateTime: new Date(now - 10 * MIN).toISOString() };
  S._accountCache.get(UPN).at = Date.now() - 31 * MIN; // past the 30-minute window
  c = ctx();
  assert.ok(await S.guard(c, SESS()), "the request that triggers the refresh is not delayed");
  await settle();
  assert.strictEqual(graphCalls, 2);
  c = ctx();
  assert.strictEqual(await S.guard(c, SESS()), null, "password changed during the session → out");
  assert.strictEqual(c.res.body.reason, "password");
  assert.deepStrictEqual(names(c.res.cookies), ["StaticWebAppsAuthCookie", "StaticWebAppsAuthContextCookie", S.COOKIE].sort());
  S._accountCache.clear();
  account = { accountEnabled: false, lastPasswordChangeDateTime: new Date(now - 24 * HOUR).toISOString() };
  await S._refreshAccount(UPN);
  c = ctx();
  assert.strictEqual(await S.guard(c, SESS()), null);
  assert.strictEqual(c.res.body.reason, "disabled");
  // a Graph failure is skipped: the session continues on the last known state (none here)
  S._accountCache.clear(); global.fetch = async () => { throw new Error("network"); };
  c = ctx();
  s = await S.guard(c, SESS());
  await settle();
  assert.ok(s && !S._accountCache.has(UPN), "directory unreachable → session continues, nothing cached");
  delete global.fetch;

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
