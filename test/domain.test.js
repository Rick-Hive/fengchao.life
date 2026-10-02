// The domain-management backend (api/domain), driven against a fake Graph.
//
// Run with:  node test/domain.test.js
//
// Checks the rules that keep one school's administrator inside their own
// school: no role → 403; a domain administrator sees only their domain and is
// refused another one; the directory cache is filled by budgeted sync slices
// (and the scheduler endpoint drives them for every domain); the users view
// then comes from the cache with 身份 overlaid; identity edits are validated and
// limited to accounts in the domain (域蜂巢管理员 / staff only); deleting a
// verifier is for 域管理员（IT）, refused for accounts outside the domain, and
// the reply reports how many verifiers remain; a Hive admin sees every domain.
const assert = require("assert");
const path = require("path");
const Module = require("module");

const realResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (request === "@azure/storage-blob") return "@azure/storage-blob";
  return realResolve.call(this, request, parent, ...rest);
};
// roles.json / people.json live in blob storage; in the test there is none, so
// roles come from HIVE_ADMINS only and people.json is empty.
require.cache["@azure/storage-blob"] = { id: "@azure/storage-blob", filename: "@azure/storage-blob", loaded: true, exports: { BlobServiceClient: { fromConnectionString() { throw new Error("no storage in test"); } } } };

process.env.AZURE_TENANT_ID = "edb20124-7377-4368-acbc-d4be58fe59c3";
process.env.AZURE_CLIENT_ID = "client";
process.env.AZURE_CLIENT_SECRET = "secret";
process.env.HIVE_ADMINS = "hive.admin@fengchao.life";
delete process.env.STORAGE_CONNECTION_STRING;

const DOMAIN = "bes.example.edu";
const users = [
  { id: "u-elaine", userPrincipalName: `elaine@${DOMAIN}`, displayName: "Elaine Chen", accountEnabled: true, createdDateTime: "2026-08-01T00:00:00Z", userType: "Member", jobTitle: "家长" },
  { id: "u-lei", userPrincipalName: `lei@${DOMAIN}`, displayName: "Lei Dong", accountEnabled: true, createdDateTime: "2026-08-02T00:00:00Z", userType: "Member", signInActivity: { lastSignInDateTime: "2026-09-28T01:00:00Z" } },
  { id: "u-guest", userPrincipalName: `guest_gmail.com#EXT#@${DOMAIN}`, displayName: "A Guest", userType: "Guest" },
];
let leiMethods = [
  { "@odata.type": "#microsoft.graph.passwordAuthenticationMethod", id: "pw" },
  { "@odata.type": "#microsoft.graph.microsoftAuthenticatorAuthenticationMethod", id: "auth-lei-1", displayName: "iPhone 13", phoneAppVersion: "6.8.55", createdDateTime: "2026-09-26T07:56:42Z" },
  { "@odata.type": "#microsoft.graph.microsoftAuthenticatorAuthenticationMethod", id: "auth-lei-2", displayName: "iPad", phoneAppVersion: "6.8.55", createdDateTime: "2026-09-27T07:56:42Z" },
];
const groupsOf = {
  "u-elaine": [{ id: "g1", displayName: "G5 English", description: "Fifth grade", groupTypes: ["Unified"], mailEnabled: true, securityEnabled: false, resourceProvisioningOptions: ["Team"], visibility: "Private" }],
  "u-lei": [
    { id: "g1", displayName: "G5 English", description: "Fifth grade", groupTypes: ["Unified"], mailEnabled: true, securityEnabled: false, resourceProvisioningOptions: ["Team"], visibility: "Private" },
    { id: "g2", displayName: "All staff", groupTypes: [], mailEnabled: false, securityEnabled: true },
  ],
};
const calls = [];
global.fetch = async function (url, opts) {
  const u = new URL(String(url));
  const method = (opts && opts.method) || "GET";
  calls.push({ method, url: u.toString(), body: opts && opts.body });
  const json = (status, obj) => ({ ok: status < 400, status, headers: { get: () => null }, text: async () => (obj == null ? "" : JSON.stringify(obj)), json: async () => obj });
  if (u.hostname === "login.microsoftonline.com") return json(200, { access_token: "tok", expires_in: 3600 });
  const p = decodeURIComponent(u.pathname.replace(/^\/v1\.0/, ""));
  if (method === "GET" && p === "/users/delta") {
    if (u.searchParams.get("$deltatoken") === "latest") return json(200, { value: [], "@odata.deltaLink": "https://graph.microsoft.com/v1.0/users/delta?$deltatoken=T1" });
    const tok = u.searchParams.get("$deltatoken");
    if (tok === "T1") return json(200, { value: deltaChanges, "@odata.deltaLink": "https://graph.microsoft.com/v1.0/users/delta?$deltatoken=T2" });
    return json(200, { value: [], "@odata.deltaLink": "https://graph.microsoft.com/v1.0/users/delta?$deltatoken=" + tok });
  }
  if (method === "GET" && p === "/domains") return json(200, { value: [
    { id: DOMAIN, isVerified: true, isDefault: true, isInitial: false },
    { id: "other.example.edu", isVerified: true, isDefault: false, isInitial: false },
    { id: "pending.example.edu", isVerified: false },
  ] });
  if (method === "GET" && p === "/users") {
    const f = u.searchParams.get("$filter") || "";
    assert.ok(f.includes(`endsWith(userPrincipalName,'@${DOMAIN}')`) || f.includes("other.example.edu"), "users filtered to the domain");
    assert.strictEqual(opts.headers.ConsistencyLevel, "eventual", "advanced query header sent");
    if (f.includes("other.example.edu")) return json(200, { value: [] });
    const since = (f.match(/createdDateTime ge (\S+)/) || [])[1];
    const rows = users.filter((x) => !since || Date.parse(x.createdDateTime || 0) >= Date.parse(since));
    return json(200, { value: rows });
  }
  if (method === "POST" && p === "/$batch") {
    const reqs = JSON.parse(opts.body).requests;
    return json(200, { responses: reqs.map((r) => {
      const m = r.url.match(/^\/users\/([^/]+)\/(authentication\/methods|memberOf)/);
      if (!m) {
        const b = r.url.match(/^\/users\/([^/?]+)\?/);
        if (b) { const hit = users.find((x) => x.id === b[1]); return hit ? { id: r.id, status: 200, body: hit } : { id: r.id, status: 404, body: {} }; }
        return { id: r.id, status: 404, body: {} };
      }
      if (m[2] === "authentication/methods") return { id: r.id, status: 200, body: { value: m[1] === "u-lei" ? leiMethods : [{ "@odata.type": "#microsoft.graph.passwordAuthenticationMethod", id: "pw" }] } };
      return { id: r.id, status: 200, body: { value: groupsOf[m[1]] || [] } };
    }) });
  }
  if (method === "GET" && p === "/users/lei@" + DOMAIN + "/authentication/methods") return json(200, { value: leiMethods });
  if (method === "GET" && /^\/users\/lei@/.test(p) && p.endsWith("/authentication/methods")) return json(200, { value: leiMethods });
  if (method === "GET" && /^\/users\/[^/]+$/.test(p)) {
    const upn = p.slice("/users/".length).toLowerCase();
    const hit = users.find((x) => x.userPrincipalName.toLowerCase() === upn);
    return hit ? json(200, hit) : json(404, { error: { code: "Request_ResourceNotFound" } });
  }
  if (method === "GET" && /^\/users\/[^/]+\/authentication\/methods$/.test(p)) {
    const id = p.split("/")[2];
    return json(200, { value: id === "u-lei" || id === `lei@${DOMAIN}` ? leiMethods : [] });
  }
  if (method === "DELETE" && /\/authentication\/microsoftAuthenticatorMethods\//.test(p)) {
    const id = p.split("/").pop();
    leiMethods = leiMethods.filter((m) => m.id !== id);
    return { ok: true, status: 204, headers: { get: () => null }, text: async () => "" };
  }
  return json(500, { error: { code: "unhandled", message: method + " " + p } });
};

const dir = require(path.join(__dirname, "..", "api", "shared", "directory.js"));
let blobs = {};
dir._store.read = async (n) => (blobs[n] ? JSON.parse(blobs[n]) : null);
dir._store.write = async (n, o) => { blobs[n] = JSON.stringify(o); };
const domainFn = require(path.join(__dirname, "..", "api", "domain", "index.js"));
const schedFn = require(path.join(__dirname, "..", "api", "directory-sync", "index.js"));
process.env.HIVE_SYNC_KEY = "a-long-enough-shared-secret-for-tests";
let deltaChanges = []; // what /users/delta reports since token T1

function principal(user, roles) {
  return Buffer.from(JSON.stringify({ identityProvider: "aad", userId: "x", userDetails: user, userRoles: ["anonymous", "authenticated"].concat(roles || []) })).toString("base64");
}
async function call({ action, method = "GET", query = {}, body = null, user, roles }) {
  const context = { log: Object.assign(() => {}, { error() {}, warn() {} }), res: null };
  await domainFn(context, { method, params: { action }, query, body, headers: user ? { "x-ms-client-principal": principal(user, roles) } : {} });
  return context.res;
}

const ADMIN = "hive.admin@fengchao.life";
const DOMADMIN = `principal@${DOMAIN}`;
const DOMROLE = [`domain_admin:${DOMAIN}`]; // old name = IT + Hive; principal roles stand in for roles.json in the test
const IT = [`domain_it:${DOMAIN}`], HIVE = [`domain_hive:${DOMAIN}`];

(async () => {
  // 1. Signed in with no management role → 403.
  let r = await call({ action: "domains", user: `teacher@${DOMAIN}` });
  assert.strictEqual(r.status, 403);

  // 2. A domain administrator sees only their own domain; the unverified one never appears.
  r = await call({ action: "domains", user: DOMADMIN, roles: DOMROLE });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.body.domains.map((d) => d.domain), [DOMAIN]);
  assert.strictEqual(r.body.all, false);
  assert.strictEqual(r.body.mine, DOMAIN);

  // 3. The Hive admin sees every verified domain.
  r = await call({ action: "domains", user: ADMIN });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.body.domains.map((d) => d.domain), [DOMAIN, "other.example.edu"]);
  assert.strictEqual(r.body.all, true);

  // 4. Another domain is refused; a malformed one is 400.
  r = await call({ action: "users", query: { domain: "other.example.edu" }, user: DOMADMIN, roles: DOMROLE });
  assert.strictEqual(r.status, 403);
  r = await call({ action: "users", query: { domain: "not a domain" }, user: DOMADMIN, roles: DOMROLE });
  assert.strictEqual(r.status, 400);

  // 5a. Before any sync the table is empty but the reply says so (no 500, no live walk).
  r = await call({ action: "users", query: { domain: DOMAIN }, user: DOMADMIN, roles: DOMROLE });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.deepStrictEqual(r.body.users, []);
  assert.strictEqual(r.body.sync.syncedAt, null);
  assert.ok(!calls.some((c) => c.url.includes("/$batch")), "no per-account Graph calls on a read");

  // 5b. A full sync by the domain administrator is refused (sysadmin / nightly only); "new" is allowed.
  r = await call({ action: "sync", method: "POST", body: { domain: DOMAIN, mode: "full" }, user: DOMADMIN, roles: DOMROLE });
  assert.strictEqual(r.status, 403);
  r = await call({ action: "sync", method: "POST", body: { domain: DOMAIN, mode: "new" }, user: DOMADMIN, roles: DOMROLE });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.strictEqual(r.body.done, true);
  assert.strictEqual(r.body.users, 2, "guest dropped");
  assert.strictEqual(r.body.added, 2);
  assert.ok(r.body.syncedAt);

  // 5c. The sync works in slices: with a tiny budget one call does one batch and reports done:false.
  blobs = {}; calls.length = 0;
  let st = await dir.syncSlice(DOMAIN, "full", { budgetMs: -1 });
  assert.strictEqual(st.done, false);
  assert.strictEqual(st.remaining, 2, "listed, nothing read yet within a spent budget");
  st = await dir.syncSlice(DOMAIN, "full", { budgetMs: 20000 });
  assert.strictEqual(st.done, true);
  assert.strictEqual(st.users, 2);
  assert.ok(st.fullAt);

  // 5. The users view: guests dropped, verification and devices from the methods, groups and 身份 filled in.
  r = await call({ action: "users", query: { domain: DOMAIN }, user: DOMADMIN, roles: DOMROLE });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.strictEqual(r.body.domain, DOMAIN);
  assert.ok(r.body.sync.syncedAt);
  assert.deepStrictEqual(r.body.users.map((x) => x.upn), [`elaine@${DOMAIN}`, `lei@${DOMAIN}`], "sorted, no guest");
  const elaine = r.body.users[0], lei = r.body.users[1];
  assert.strictEqual(elaine.verified, false);
  assert.deepStrictEqual(elaine.devices, []);
  assert.strictEqual(elaine.identity, "家长", "identity falls back to Entra jobTitle");
  assert.strictEqual(elaine.identitySource, "entra");
  assert.strictEqual(lei.verified, true);
  assert.strictEqual(lei.devices.length, 2);
  assert.strictEqual(lei.devices[0].name, "iPhone 13");
  assert.strictEqual(lei.lastSignIn, "2026-09-28T01:00:00Z");
  assert.deepStrictEqual(lei.groups.map((g) => g.kind), ["team", "security"]);
  assert.strictEqual(lei.identity, "");
  assert.strictEqual(r.body.partial, false);

  // 6. The groups view: per group, how many of this domain's members.
  r = await call({ action: "groups", query: { domain: DOMAIN }, user: DOMADMIN, roles: DOMROLE });
  assert.strictEqual(r.status, 200);
  const g1 = r.body.groups.find((g) => g.id === "g1");
  assert.strictEqual(g1.kind, "team");
  assert.strictEqual(g1.domainMembers, 2);
  assert.deepStrictEqual(g1.members, [`elaine@${DOMAIN}`, `lei@${DOMAIN}`]);
  assert.strictEqual(r.body.groups[0].kind, "team", "teams listed first");

  // 7. Identity edits: outside account refused; bad identity refused; a good one is accepted
  //    (it cannot be persisted without storage, so expect 200 or a 5xx that names storage — never a silent success for the bad ones).
  r = await call({ action: "person", method: "PATCH", body: { domain: DOMAIN, user: `lei@${DOMAIN}`, identity: "学生" }, user: DOMADMIN, roles: IT });
  assert.strictEqual(r.status, 403, "IT does not edit 身份");
  r = await call({ action: "person", method: "PATCH", body: { domain: DOMAIN, user: "someone@other.example.edu", identity: "学生" }, user: DOMADMIN, roles: DOMROLE });
  assert.strictEqual(r.status, 400);
  r = await call({ action: "person", method: "PATCH", body: { domain: DOMAIN, user: `lei@${DOMAIN}`, identity: "校长" }, user: DOMADMIN, roles: DOMROLE });
  assert.strictEqual(r.status, 400);
  r = await call({ action: "person", method: "PATCH", body: { domain: DOMAIN, user: `lei@${DOMAIN}`, linked: `lei@${DOMAIN}` }, user: DOMADMIN, roles: DOMROLE });
  assert.strictEqual(r.status, 400, "an account cannot be linked to itself");

  // 8. Deleting a verifier: outside account refused; unknown id 404; a real one is deleted; the reply counts what remains.
  r = await call({ action: "method", method: "DELETE", body: { domain: DOMAIN, user: `lei@${DOMAIN}`, id: "auth-lei-1" }, user: DOMADMIN, roles: HIVE });
  assert.strictEqual(r.status, 403, "域蜂巢管理员 does not remove devices");
  r = await call({ action: "method", method: "DELETE", body: { domain: DOMAIN, user: "someone@other.example.edu", id: "auth-lei-1" }, user: DOMADMIN, roles: DOMROLE });
  assert.strictEqual(r.status, 400);
  r = await call({ action: "method", method: "DELETE", body: { domain: DOMAIN, user: `lei@${DOMAIN}`, id: "not-a-real-method-id" }, user: DOMADMIN, roles: DOMROLE });
  assert.strictEqual(r.status, 404, JSON.stringify(r.body));
  r = await call({ action: "method", method: "DELETE", body: { domain: DOMAIN, user: `lei@${DOMAIN}`, id: "auth-lei-1" }, user: DOMADMIN, roles: DOMROLE });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.ok(calls.some((c) => c.method === "DELETE" && c.url.includes("microsoftAuthenticatorMethods/auth-lei-1")), "Graph delete issued");
  assert.strictEqual(leiMethods.length, 2);
  r = await call({ action: "users", query: { domain: DOMAIN }, user: DOMADMIN, roles: IT });
  assert.strictEqual(r.body.users[1].devices.length, 1, "cached row updated without a sync");
  // Unlike one's own account (api/me), an administrator may remove the last device
  // (a lost phone); the reply says how many strong methods remain so the UI can warn.
  r = await call({ action: "method", method: "DELETE", body: { domain: DOMAIN, user: `lei@${DOMAIN}`, id: "auth-lei-2" }, user: DOMADMIN, roles: DOMROLE });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.strictEqual(r.body.remainingStrong, 0);
  assert.strictEqual(leiMethods.length, 1);

  // 9. Nothing in the whole run touched an account of the other domain on Graph.
  assert.ok(!calls.some((c) => /someone@other\.example\.edu/.test(c.url)), "no Graph call for the other domain's account");

  // 10. 同步变动: the delta since the last token — one created, one renamed, one deleted —
  //     applied to the cache; only the changed accounts are re-read from Graph.
  assert.ok(blobs["_delta.json"] && blobs["_delta.json"].includes("T1"), "the full sync took a delta token");
  users.push({ id: "u-new", userPrincipalName: `newbie@${DOMAIN}`, displayName: "New Person", accountEnabled: true, createdDateTime: new Date().toISOString(), userType: "Member" });
  users.find((x) => x.id === "u-elaine").displayName = "Elaine Chen-Wang";
  deltaChanges = [
    { id: "u-new", userPrincipalName: `newbie@${DOMAIN}` },
    { id: "u-elaine", userPrincipalName: `elaine@${DOMAIN}`, displayName: "Elaine Chen-Wang" },
    { id: "u-lei", "@removed": { reason: "deleted" } },
    { id: "u-other", userPrincipalName: "x@other.example.edu" },
  ];
  calls.length = 0;
  r = await call({ action: "sync", method: "POST", body: { domain: DOMAIN, mode: "changes" }, user: DOMADMIN, roles: IT });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.strictEqual(r.body.done, true);
  assert.strictEqual(r.body.removed, 1, "Lei's deletion applied");
  assert.strictEqual(r.body.users, 2, "elaine + newbie");
  const batches = calls.filter((c) => c.url.includes("/$batch"));
  assert.strictEqual(batches.length, 1);
  assert.ok(batches[0].body.includes("u-new") && batches[0].body.includes("u-elaine") && !batches[0].body.includes("u-lei"), "only changed accounts re-read");
  assert.ok(blobs["_delta.json"].includes("T2"), "token advanced");
  r = await call({ action: "users", query: { domain: DOMAIN }, user: DOMADMIN, roles: IT });
  assert.deepStrictEqual(r.body.users.map((x) => x.displayName), ["Elaine Chen-Wang", "New Person"]);
  // Running it again with nothing new is a no-op that still stamps the time.
  deltaChanges = [];
  r = await call({ action: "sync", method: "POST", body: { domain: DOMAIN, mode: "changes" }, user: DOMADMIN, roles: IT });
  assert.strictEqual(r.body.done, true);
  assert.strictEqual(r.body.users, 2);
  // restore for the scheduler section
  users.splice(users.findIndex((x) => x.id === "u-new"), 1);

  // 11. The scheduler endpoint: wrong key → 403; right key loops over every verified domain until done.
  let c = { log: Object.assign(() => {}, { error() {}, warn() {} }), res: null };
  await schedFn(c, { method: "POST", headers: {}, body: { mode: "full", key: "nope" } });
  assert.strictEqual(c.res.status, 403);
  let guardN = 0, last;
  do {
    c = { log: Object.assign(() => {}, { error() {}, warn() {} }), res: null };
    await schedFn(c, { method: "POST", headers: { "x-hive-sync-key": process.env.HIVE_SYNC_KEY }, body: { mode: "full" } });
    assert.strictEqual(c.res.status, 200, JSON.stringify(c.res.body));
    last = c.res.body;
  } while (!last.done && ++guardN < 20);
  assert.strictEqual(last.done, true);
  assert.deepStrictEqual(last.finished, [DOMAIN, "other.example.edu"]);
  assert.ok(blobs["_run.json"].includes('"last"'), "run summary kept");
  // 11b. A call right after a finished run does not start the tenant over (the
  //      circular re-sync of 2026-10-02); fresh:true does.
  calls.length = 0;
  c = { log: Object.assign(() => {}, { error() {}, warn() {} }), res: null };
  await schedFn(c, { method: "POST", headers: { "x-hive-sync-key": process.env.HIVE_SYNC_KEY }, body: { mode: "full" } });
  assert.strictEqual(c.res.body.done, true);
  assert.strictEqual(c.res.body.alreadyDone, true);
  assert.ok(!calls.some((x) => x.url.includes("/$batch") || x.url.includes("/domains")), "no Graph work for an already-finished run");
  c = { log: Object.assign(() => {}, { error() {}, warn() {} }), res: null };
  await schedFn(c, { method: "POST", headers: { "x-hive-sync-key": process.env.HIVE_SYNC_KEY }, body: { mode: "full", fresh: true } });
  assert.strictEqual(c.res.body.alreadyDone, undefined);
  assert.ok(calls.some((x) => x.url.includes("/domains")), "fresh:true starts a new run");
  // finish that fresh run so the checks below see a completed state
  for (let g = 0; g < 20 && !c.res.body.done; g++) {
    c = { log: Object.assign(() => {}, { error() {}, warn() {} }), res: null };
    await schedFn(c, { method: "POST", headers: { "x-hive-sync-key": process.env.HIVE_SYNC_KEY }, body: { mode: "full" } });
  }
  assert.strictEqual(c.res.body.done, true);
  assert.strictEqual(JSON.parse(blobs[`${DOMAIN}.json`]).error, null, "no stale error left on the domain");

  const otherDoc = JSON.parse(blobs["other.example.edu.json"]);
  assert.strictEqual(otherDoc.users.length, 0);
  assert.ok(otherDoc.fullAt);

  console.log("domain: all assertions passed");
})().catch((e) => { console.error(e); process.exit(1); });
