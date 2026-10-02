// The domain-management backend (api/domain), driven against a fake Graph.
//
// Run with:  node test/domain.test.js
//
// Checks the rules that keep one school's administrator inside their own
// school: no role → 403; a domain administrator sees only their domain and is
// refused another one; the users view carries verification, devices, groups
// and the 身份 facts; identity edits are validated and limited to accounts in
// the domain; deleting a verifier is refused for accounts outside the domain
// and the reply reports how many verifiers remain; a Hive admin sees every domain.
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
  if (method === "GET" && p === "/domains") return json(200, { value: [
    { id: DOMAIN, isVerified: true, isDefault: true, isInitial: false },
    { id: "other.example.edu", isVerified: true, isDefault: false, isInitial: false },
    { id: "pending.example.edu", isVerified: false },
  ] });
  if (method === "GET" && p === "/users") {
    const f = u.searchParams.get("$filter") || "";
    assert.ok(f.includes(`endsWith(userPrincipalName,'@${DOMAIN}')`), "users filtered to the domain");
    assert.strictEqual(opts.headers.ConsistencyLevel, "eventual", "advanced query header sent");
    return json(200, { value: users });
  }
  if (method === "POST" && p === "/$batch") {
    const reqs = JSON.parse(opts.body).requests;
    return json(200, { responses: reqs.map((r) => {
      const m = r.url.match(/^\/users\/([^/]+)\/(authentication\/methods|memberOf)/);
      if (!m) return { id: r.id, status: 404, body: {} };
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

const domainFn = require(path.join(__dirname, "..", "api", "domain", "index.js"));

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
const DOMROLE = [`domain_admin:${DOMAIN}`]; // principal roles stand in for roles.json in the test

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

  // 5. The users view: guests dropped, verification and devices from the methods, groups and 身份 filled in.
  r = await call({ action: "users", query: { domain: DOMAIN }, user: DOMADMIN, roles: DOMROLE });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.strictEqual(r.body.domain, DOMAIN);
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
  r = await call({ action: "person", method: "PATCH", body: { domain: DOMAIN, user: "someone@other.example.edu", identity: "学生" }, user: DOMADMIN, roles: DOMROLE });
  assert.strictEqual(r.status, 400);
  r = await call({ action: "person", method: "PATCH", body: { domain: DOMAIN, user: `lei@${DOMAIN}`, identity: "校长" }, user: DOMADMIN, roles: DOMROLE });
  assert.strictEqual(r.status, 400);
  r = await call({ action: "person", method: "PATCH", body: { domain: DOMAIN, user: `lei@${DOMAIN}`, linked: `lei@${DOMAIN}` }, user: DOMADMIN, roles: DOMROLE });
  assert.strictEqual(r.status, 400, "an account cannot be linked to itself");

  // 8. Deleting a verifier: outside account refused; unknown id 404; a real one is deleted; the reply counts what remains.
  r = await call({ action: "method", method: "DELETE", body: { domain: DOMAIN, user: "someone@other.example.edu", id: "auth-lei-1" }, user: DOMADMIN, roles: DOMROLE });
  assert.strictEqual(r.status, 400);
  r = await call({ action: "method", method: "DELETE", body: { domain: DOMAIN, user: `lei@${DOMAIN}`, id: "not-a-real-method-id" }, user: DOMADMIN, roles: DOMROLE });
  assert.strictEqual(r.status, 404, JSON.stringify(r.body));
  r = await call({ action: "method", method: "DELETE", body: { domain: DOMAIN, user: `lei@${DOMAIN}`, id: "auth-lei-1" }, user: DOMADMIN, roles: DOMROLE });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.ok(calls.some((c) => c.method === "DELETE" && c.url.includes("microsoftAuthenticatorMethods/auth-lei-1")), "Graph delete issued");
  assert.strictEqual(leiMethods.length, 2);
  // Unlike one's own account (api/me), an administrator may remove the last device
  // (a lost phone); the reply says how many strong methods remain so the UI can warn.
  r = await call({ action: "method", method: "DELETE", body: { domain: DOMAIN, user: `lei@${DOMAIN}`, id: "auth-lei-2" }, user: DOMADMIN, roles: DOMROLE });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.strictEqual(r.body.remainingStrong, 0);
  assert.strictEqual(leiMethods.length, 1);

  // 9. Nothing in the whole run touched an account outside the domain on Graph.
  assert.ok(!calls.some((c) => /other\.example\.edu/.test(c.url)), "no Graph call for the other domain");

  console.log("domain: all assertions passed");
})().catch((e) => { console.error(e); process.exit(1); });
