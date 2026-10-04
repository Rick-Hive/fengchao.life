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
  if (method === "POST" && p === "/$batch") {
    const reqs = JSON.parse(opts.body).requests;
    return json(200, { responses: reqs.map((r) => r.url.startsWith("/teams/g1") ? { id: r.id, status: 200, body: { id: "g1", specialization: "educationClass" } } : r.url.includes("/members/$count") ? { id: r.id, status: 200, body: "7" } : { id: r.id, status: 404, body: {} }) });
  }
  // Profile photo: none at first (404), then whatever was PUT.
  if (method === "GET" && p === `/users/${UID}/photo/$value`) {
    if (!photoBytes) return { ok: false, status: 404, headers: { get: () => null }, text: async () => "", arrayBuffer: async () => new ArrayBuffer(0) };
    return { ok: true, status: 200, headers: { get: (h) => (h === "content-type" ? "image/jpeg" : null) }, arrayBuffer: async () => photoBytes.buffer.slice(photoBytes.byteOffset, photoBytes.byteOffset + photoBytes.length) };
  }
  if (method === "PUT" && p === `/users/${UID}/photo/$value`) { photoBytes = Buffer.from(opts.body); photoType = opts.headers["Content-Type"]; return { ok: true, status: 200, headers: { get: () => null }, arrayBuffer: async () => new ArrayBuffer(0), text: async () => "" }; }
  return json(500, { error: { code: "unhandled", message: method + " " + p } });
};
let photoBytes = null, photoType = "";
// Minimal valid JPEG header (SOI, SOF0 with the given size, then EOI) and PNG (IHDR only).
function fakeJpeg(w, h) { const sof = Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, (h >> 8) & 255, h & 255, (w >> 8) & 255, w & 255, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]); return Buffer.concat([Buffer.from([0xff, 0xd8]), sof, Buffer.from([0xff, 0xd9])]); }
function fakePng(w, h) { const b = Buffer.alloc(33); Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b); b.writeUInt32BE(13, 8); b.write("IHDR", 12); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20); return b; }
const dataUrl = (type, buf) => `data:${type};base64,${buf.toString("base64")}`;

const meFn = require(path.join(__dirname, "..", "api", "me", "index.js"));
const rolesFn = require(path.join(__dirname, "..", "api", "auth-roles", "index.js"));

function principal(user) {
  return Buffer.from(JSON.stringify({ identityProvider: "aad", userId: "x", userDetails: user, userRoles: ["anonymous", "authenticated"] })).toString("base64");
}
async function call(fn, { action, id, method = "GET", body = null, user = "Teacher.H@example.edu", query = {} } = {}) {
  const context = { log: Object.assign(() => {}, { error() {}, warn() {} }), res: null };
  await fn(context, { method, params: { action, id }, query, body, headers: user ? { "x-ms-client-principal": principal(user) } : {} });
  return context.res;
}

(async () => {
  // Not signed in / not in the directory.
  let r = await call(meFn, { action: "summary", user: null });
  assert.strictEqual(r.status, 403);
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
  assert.strictEqual(r.body.groups[0].kind, "class", "a team with specialization educationClass is a 班级团队");
  assert.strictEqual(r.body.groups[0].owner, true);
  assert.strictEqual(r.body.groups[0].members, 7);
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
  assert.strictEqual(r.status, 409, "the only authenticator needs a confirmation");
  assert.ok(methods.some((m) => m.id === "auth-new-000002"));
  // …and goes when confirmed (the phone may be lost — Rick, 2026-10-02).
  r = await call(meFn, { action: "method", id: "auth-new-000002", method: "DELETE", query: { confirm: "1" } });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.ok(!methods.some((m) => m.id === "auth-new-000002"));

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

  // Profile photo (2026-10-04): none → 204; a square JPEG is written to Graph as-is;
  // non-square, too large, wrong type and non-image are refused before Graph.
  r = await call(meFn, { action: "photo" });
  assert.strictEqual(r.status, 204, "no photo yet");
  r = await call(meFn, { action: "photo", method: "PUT", body: { image: dataUrl("image/jpeg", fakeJpeg(648, 400)) } });
  assert.strictEqual(r.status, 400, "non-square refused: " + JSON.stringify(r.body));
  r = await call(meFn, { action: "photo", method: "PUT", body: { image: dataUrl("image/jpeg", fakeJpeg(2000, 2000)) } });
  assert.strictEqual(r.status, 400, "over 1024 px refused");
  r = await call(meFn, { action: "photo", method: "PUT", body: { image: dataUrl("image/png", fakeJpeg(648, 648)) } });
  assert.strictEqual(r.status, 400, "declared PNG but JPEG bytes refused");
  r = await call(meFn, { action: "photo", method: "PUT", body: { image: "data:image/gif;base64,R0lGODlh" } });
  assert.strictEqual(r.status, 400, "GIF refused");
  r = await call(meFn, { action: "photo", method: "PUT", body: { image: dataUrl("image/jpeg", fakeJpeg(648, 648)) } });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.strictEqual(r.body.px, 648);
  assert.strictEqual(photoType, "image/jpeg");
  assert.ok(photoBytes && photoBytes[0] === 0xff && photoBytes[1] === 0xd8, "JPEG bytes reached Graph");
  r = await call(meFn, { action: "photo", method: "PUT", body: { image: dataUrl("image/png", fakePng(96, 96)) } });
  assert.strictEqual(r.status, 200, "a square PNG is accepted too");
  assert.strictEqual(photoType, "image/png");
  r = await call(meFn, { action: "photo" });
  assert.strictEqual(r.status, 200);
  assert.ok(r.isRaw && Buffer.isBuffer(r.body) && r.body.length === photoBytes.length, "photo served back as bytes");

  console.log("account: all assertions passed");
})().catch((e) => { console.error(e); process.exit(1); });
