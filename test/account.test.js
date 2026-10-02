// 我的账号 backend and the rolesSource function, driven against a fake Graph.
//
// Run with:  node test/account.test.js
//
// Checks the rules that protect people: the account is always the signed-in
// one; the last authenticator cannot be removed; a method is looked up on
// the account before it is deleted (a foreign id is 404, not a delete);
// QQ/163 are refused as a safe email; rolesSource gives the bootstrap admin
// `admin` and refuses a foreign tenant.
const assert = require("assert");
const path = require("path");
const Module = require("module");

const realResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (request === "@azure/storage-blob") return "@azure/storage-blob";
  return realResolve.call(this, request, parent, ...rest);
};
require.cache["@azure/storage-blob"] = { id: "@azure/storage-blob", filename: "@azure/storage-blob", loaded: true, exports: { BlobServiceClient: { fromConnectionString() { throw new Error("no storage in test"); } } } };

process.env.AZURE_TENANT_ID = "edb20124-7377-4368-acbc-d4be58fe59c3";
process.env.AZURE_CLIENT_ID = "client";
process.env.AZURE_CLIENT_SECRET = "secret";
delete process.env.STORAGE_CONNECTION_STRING;
delete process.env.HIVE_ADMINS;

const UID = "11111111-2222-3333-4444-555555555555";
let methods = [
  { "@odata.type": "#microsoft.graph.passwordAuthenticationMethod", id: "28c10230-6103-485e-b985-444c60001490" },
  { "@odata.type": "#microsoft.graph.microsoftAuthenticatorAuthenticationMethod", id: "auth-old-000001", displayName: "iPhone SE", deviceTag: "SoftwareTokenActivated", phoneAppVersion: "6.8.47", createdDateTime: "2025-05-30T02:00:00Z" },
  { "@odata.type": "#microsoft.graph.microsoftAuthenticatorAuthenticationMethod", id: "auth-new-000002", displayName: "iPhone 13", deviceTag: "SoftwareTokenActivated", phoneAppVersion: "6.8.55", createdDateTime: "2026-09-26T07:56:42Z" },
];
const calls = [];
global.fetch = async function (url, opts) {
  const u = new URL(String(url));
  const method = (opts && opts.method) || "GET";
  calls.push({ method, url: u.toString(), body: opts && opts.body });
  const json = (status, obj) => ({ ok: status < 400, status, headers: { get: () => null }, text: async () => (obj == null ? "" : JSON.stringify(obj)), json: async () => obj });
  if (u.hostname === "login.microsoftonline.com") return json(200, { access_token: "tok", expires_in: 3600 });
  const p = decodeURIComponent(u.pathname.replace(/^\/v1\.0/, ""));
  if (method === "GET" && /^\/users\/teacher\.h@example\.edu$/i.test(p)) {
    return json(200, { id: UID, userPrincipalName: "teacher.h@example.edu", displayName: "H Teacher", otherMails: ["h.safe@gmail.com"], postalCode: "210000", userType: "Member" });
  }
  if (method === "GET" && /^\/users\/nobody@example\.edu$/i.test(p)) return json(404, { error: { code: "Request_ResourceNotFound", message: "not found" } });
  if (method === "GET" && p === `/users/${UID}/authentication/methods`) return json(200, { value: methods });
  if (method === "DELETE" && p.startsWith(`/users/${UID}/authentication/microsoftAuthenticatorMethods/`)) {
    const id = p.split("/").pop();
    methods = methods.filter((m) => m.id !== id);
    return { ok: true, status: 204, headers: { get: () => null }, text: async () => "" };
  }
  if (method === "PATCH" && p === `/users/${UID}`) return { ok: true, status: 204, headers: { get: () => null }, text: async () => "" };
  if (method === "GET" && p === "/auditLogs/signIns") {
    const f = u.searchParams.get("$filter");
    assert.ok(f.includes(`userId eq '${UID}'`), "sign-ins filtered to the caller");
    return json(200, { value: [
      { createdDateTime: "2026-09-28T01:02:03Z", appDisplayName: "Microsoft Teams", clientAppUsed: "Mobile Apps and Desktop clients", ipAddress: "203.0.113.5", location: { city: "Nanjing", countryOrRegion: "CN" }, deviceDetail: { operatingSystem: "Ios 26.6.2" }, status: { errorCode: 0 } },
      { createdDateTime: "2026-09-27T01:02:03Z", appDisplayName: "My Signins", status: { errorCode: 50126, failureReason: "Invalid username or password." } },
    ] });
  }
  if (method === "GET" && p === "/auditLogs/directoryAudits") {
    const f = u.searchParams.get("$filter");
    if (f.includes("targetResources/any")) return json(200, { value: [{ id: "a1", activityDateTime: "2026-09-26T07:56:42Z", activityDisplayName: "User registered security info", result: "success", initiatedBy: { user: { userPrincipalName: "teacher.h@example.edu" } } }] });
    return json(200, { value: [{ id: "a1", activityDateTime: "2026-09-26T07:56:42Z", activityDisplayName: "User registered security info", result: "success" }, { id: "a2", activityDateTime: "2026-09-27T07:56:42Z", activityDisplayName: "Update user", result: "success" }] });
  }
  if (method === "GET" && p === `/users/${UID}/memberOf/microsoft.graph.group`) return json(200, { value: [
    { id: "g1", displayName: "G9 Science", groupTypes: ["Unified"], mailEnabled: true, securityEnabled: false, resourceProvisioningOptions: ["Team"] },
    { id: "g2", displayName: "All staff", groupTypes: [], mailEnabled: false, securityEnabled: true },
  ] });
  if (method === "GET" && p === `/users/${UID}/ownedObjects/microsoft.graph.group`) return json(200, { value: [{ id: "g1" }] });
  return json(500, { error: { code: "unhandled", message: method + " " + p } });
};

const meFn = require(path.join(__dirname, "..", "api", "me", "index.js"));
const rolesFn = require(path.join(__dirname, "..", "api", "auth-roles", "index.js"));

function principal(user) {
  return Buffer.from(JSON.stringify({ identityProvider: "aad", userId: "x", userDetails: user, userRoles: ["anonymous", "authenticated"] })).toString("base64");
}
async function call(fn, { action, id, method = "GET", body = null, user = "Teacher.H@example.edu" } = {}) {
  const context = { log: Object.assign(() => {}, { error() {}, warn() {} }), res: null };
  await fn(context, { method, params: { action, id }, query: {}, body, headers: user ? { "x-ms-client-principal": principal(user) } : {} });
  return context.res;
}

(async () => {
  // Not signed in / not in the directory.
  let r = await call(meFn, { action: "summary", user: null });
  assert.strictEqual(r.status, 401);
  r = await call(meFn, { action: "summary", user: "nobody@example.edu" });
  assert.strictEqual(r.status, 403);

  // Summary.
  r = await call(meFn, { action: "summary" });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.strictEqual(r.body.profile.safeEmail, "h.safe@gmail.com");
  assert.strictEqual(r.body.methods.filter((m) => m.kind === "authenticator").length, 2);
  assert.ok(r.body.methods.every((m) => !("_type" in m)), "internal type not leaked");
  assert.deepStrictEqual(r.body.roles, []);

  // Sign-ins, audits (deduplicated, newest first), groups (team first, owner flag).
  r = await call(meFn, { action: "signins" });
  assert.strictEqual(r.body.signins.length, 2);
  assert.strictEqual(r.body.signins[0].ok, true);
  assert.strictEqual(r.body.signins[0].place, "Nanjing, CN");
  assert.strictEqual(r.body.signins[1].code, 50126);
  r = await call(meFn, { action: "audits" });
  assert.deepStrictEqual(r.body.audits.map((a) => a.id), ["a2", "a1"]);
  r = await call(meFn, { action: "groups" });
  assert.strictEqual(r.body.groups[0].kind, "team");
  assert.strictEqual(r.body.groups[0].owner, true);
  assert.strictEqual(r.body.groups[1].kind, "security");

  // Profile validation and write.
  r = await call(meFn, { action: "profile", method: "PATCH", body: { safeEmail: "someone@qq.com" } });
  assert.strictEqual(r.status, 400);
  r = await call(meFn, { action: "profile", method: "PATCH", body: { safeEmail: "teacher.h@example.edu" } });
  assert.strictEqual(r.status, 400, "safe email must differ from the account");
  calls.length = 0;
  // The display name is the school's to set: an ordinary person is refused (Rick, 2026-10-02) …
  r = await call(meFn, { action: "profile", method: "PATCH", body: { displayName: "H 老师" } });
  assert.strictEqual(r.status, 400);
  assert.ok(/displayName: only/.test(r.body.problems.join(" ")));
  // … while the other fields go through.
  r = await call(meFn, { action: "profile", method: "PATCH", body: { safeEmail: "H.New@Outlook.com", postalCode: "210008" } });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  const patch = JSON.parse(calls.find((c) => c.method === "PATCH").body);
  assert.deepStrictEqual(patch, { postalCode: "210008", otherMails: ["h.new@outlook.com"] });
  // The school's IT administrator may set it (role on the sign-in principal).
  calls.length = 0;
  const context2 = { log: Object.assign(() => {}, { error() {}, warn() {} }), res: null };
  const itPrincipal = Buffer.from(JSON.stringify({ identityProvider: "aad", userId: "x", userDetails: "Teacher.H@example.edu", userRoles: ["anonymous", "authenticated", "domain_it:example.edu"] })).toString("base64");
  await meFn(context2, { method: "PATCH", params: { action: "profile" }, query: {}, body: { displayName: "H 老师" }, headers: { "x-ms-client-principal": itPrincipal, host: "fengchao.life", origin: "https://fengchao.life" } });
  assert.strictEqual(context2.res.status, 200, JSON.stringify(context2.res.body));
  assert.deepStrictEqual(JSON.parse(calls.find((c) => c.method === "PATCH").body), { displayName: "H 老师" });

  // Methods: a foreign id is 404; the old phone can go; then the last one cannot.
  r = await call(meFn, { action: "method", id: "someone-elses-method", method: "DELETE" });
  assert.strictEqual(r.status, 404);
  r = await call(meFn, { action: "method", id: "28c10230-6103-485e-b985-444c60001490", method: "DELETE" });
  assert.strictEqual(r.status, 400, "password method is not removable");
  r = await call(meFn, { action: "method", id: "auth-old-000001", method: "DELETE" });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.strictEqual(r.body.removed.name, "iPhone SE");
  r = await call(meFn, { action: "method", id: "auth-new-000002", method: "DELETE" });
  assert.strictEqual(r.status, 409, "the only authenticator stays");
  assert.ok(methods.some((m) => m.id === "auth-new-000002"));

  // rolesSource.
  const tid = { typ: "http://schemas.microsoft.com/identity/claims/tenantid", val: "edb20124-7377-4368-acbc-d4be58fe59c3" };
  r = await call(rolesFn, { method: "POST", user: null, body: { identityProvider: "aad", userDetails: "x", claims: [tid, { typ: "preferred_username", val: "Rick.Zhang@bes.qiaoliang.online" }] } });
  assert.deepStrictEqual(r.body.roles, ["admin"]);
  r = await call(rolesFn, { method: "POST", user: null, body: { claims: [tid, { typ: "preferred_username", val: "teacher.h@example.edu" }] } });
  assert.deepStrictEqual(r.body.roles, []);
  r = await call(rolesFn, { method: "POST", user: null, body: { claims: [{ typ: "tid", val: "00000000-0000-0000-0000-000000000000" }, { typ: "preferred_username", val: "rick.zhang@bes.qiaoliang.online" }] } });
  assert.deepStrictEqual(r.body.roles, [], "foreign tenant gets nothing");
  r = await call(rolesFn, { method: "POST", user: null, body: "garbage" });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.body.roles, []);

  console.log("account: all assertions passed");
})().catch((e) => { console.error(e); process.exit(1); });
