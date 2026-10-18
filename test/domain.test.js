// The domain-management backend (api/domain), driven against a fake Graph.
//
// Run with:  node test/domain.test.js
//
// Checks the rules that keep one school's administrator inside their own
// school: no role → 403; a domain administrator sees only their domain and is
// refused another one; the directory cache is filled by budgeted sync slices
// (and the scheduler endpoint drives them for every domain); the users view
// then comes from the cache with 身份 overlaid; identity edits are validated and
// limited to accounts in the domain (IT 管理员, the old 域蜂巢管理员, staff); deleting a
// verifier is for the IT 管理员, refused for accounts outside the domain, and
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
    { id: "g3", displayName: "Science Bug Lab", groupTypes: ["Unified"], mailEnabled: true, securityEnabled: false, resourceProvisioningOptions: ["Team"], visibility: "Private" },
    { id: "g4", displayName: "K4 (abandoned)", groupTypes: ["Unified"], mailEnabled: true, securityEnabled: false, resourceProvisioningOptions: ["Team"], visibility: "Private" },
  ],
};
// Owners per group (Rick, 2026-10-09: only groups OWNED here are the school's): g1 by lei,
// g2 by no one and g4 by no one (orphans), g3 by a teacher at another school.
const ownersOf = { g1: [{ id: "u-lei", userPrincipalName: "lei@" + DOMAIN }], g2: [], g3: [{ id: "u-x", userPrincipalName: "anna@sciencebug.net" }], g4: [] };
const calls = [];
const createdUsers = [], licenseCalls = [], deletedIds = [];
global.fetch = async function (url, opts) {
  const u = new URL(String(url));
  const method = (opts && opts.method) || "GET";
  calls.push({ method, url: u.toString(), body: opts && opts.body });
  const json = (status, obj) => ({ ok: status < 400, status, headers: { get: () => null }, text: async () => (obj == null ? "" : JSON.stringify(obj)), json: async () => obj });
  if (u.hostname === "login.microsoftonline.com") return json(200, { access_token: "tok", expires_in: 3600 });
  const p = decodeURIComponent(u.pathname.replace(/^\/v1\.0/, ""));
  { const t = fakeTeams(method, p, u, opts, json); if (t) return t; } // 新建 Teams 群组 routes (section 15)
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
    { id: "tenant.onmicrosoft.com", isVerified: true, isDefault: false, isInitial: true }, // hidden: the tenant's own domain
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
      if (r.url.startsWith("/teams/")) { const id = r.url.split("/")[2].split("?")[0]; return { id: r.id, status: 200, body: { id, specialization: id === "g1" ? "educationClass" : "educationStandard" } }; }
      const ow = r.url.match(/^\/groups\/([^/]+)\/owners/); if (ow) return { id: r.id, status: 200, body: { value: ownersOf[ow[1]] || [] } };
      const m = r.url.match(/^\/users\/([^/]+)\/(authentication\/methods|memberOf)/);
      if (!m) {
        const b = r.url.match(/^\/users\/([^/?]+)\?/);
        if (b) { const hit = users.find((x) => x.id === b[1] || x.userPrincipalName.toLowerCase() === decodeURIComponent(b[1]).toLowerCase()); return hit ? { id: r.id, status: 200, body: hit } : { id: r.id, status: 404, body: {} }; }
        return { id: r.id, status: 404, body: {} };
      }
      if (m[2] === "authentication/methods") return { id: r.id, status: 200, body: { value: m[1] === "u-lei" ? leiMethods : [{ "@odata.type": "#microsoft.graph.passwordAuthenticationMethod", id: "pw" }].concat(m[1] === "u-elaine" ? elaineMethods : []) } };
      return { id: r.id, status: 200, body: { value: groupsOf[m[1]] || [] } };
    }) });
  }
  if (method === "GET" && p === "/users/lei@" + DOMAIN + "/authentication/methods") return json(200, { value: leiMethods });
  if (method === "GET" && /^\/users\/lei@/.test(p) && p.endsWith("/authentication/methods")) return json(200, { value: leiMethods });
  if (method === "GET" && p === "/subscribedSkus") return json(200, { value: [
    { skuId: "94763226-9b3c-4e75-a931-5c89701abe66", skuPartNumber: "STANDARDWOFFPACK_FACULTY", capabilityStatus: "Enabled", prepaidUnits: { enabled: 500 }, consumedUnits: 12 },
    { skuId: "314c4481-f395-4525-be8b-2ec4bb1e9d91", skuPartNumber: "STANDARDWOFFPACK_STUDENT", capabilityStatus: "Enabled", prepaidUnits: { enabled: 1000 }, consumedUnits: studentSeatsUsed },
    { skuId: "0000-dead", skuPartNumber: "OLD_PLAN", capabilityStatus: "Suspended", prepaidUnits: { enabled: 5 }, consumedUnits: 0 },
    { skuId: "f30db892-07e9-47e9-837c-80727f46fd3d", skuPartNumber: "FLOW_FREE", capabilityStatus: "Enabled", prepaidUnits: { enabled: 10000 }, consumedUnits: 3 },
    { skuId: "e2be619b-b125-455f-8660-fb503e431a5d", skuPartNumber: "ENTERPRISEPACK", capabilityStatus: "Enabled", prepaidUnits: { enabled: 5 }, consumedUnits: 0 },
  ] });
  if (method === "POST" && p === "/users") {
    const b = JSON.parse(opts.body); createdUsers.push(b);
    const u = Object.assign({ id: "u-" + b.mailNickname, createdDateTime: "2026-10-04T00:00:00Z", userType: "Member" }, b); delete u.passwordProfile; users.push(u);
    return json(201, u);
  }
  if (method === "POST" && /^\/users\/[^/]+\/assignLicense$/.test(p)) {
    const id = p.split("/")[2], b = JSON.parse(opts.body); licenseCalls.push({ id, body: b });
    const hit = users.find((x) => x.id === id);
    if (hit) hit.assignedLicenses = (hit.assignedLicenses || []).filter((l) => !(b.removeLicenses || []).includes(l.skuId)).concat((b.addLicenses || []).map((l) => ({ skuId: l.skuId })));
    return json(200, { id });
  }
  if (method === "DELETE" && /^\/users\/[^/]+$/.test(p)) { const id = p.split("/")[2]; deletedIds.push(id); const i = users.findIndex((x) => x.id === id); if (i >= 0) users.splice(i, 1); return { ok: true, status: 204, headers: { get: () => null }, text: async () => "" }; }
  if (method === "GET" && /^\/users\/[^/]+$/.test(p)) {
    const upn = decodeURIComponent(p.slice("/users/".length)).toLowerCase();
    const hit = users.find((x) => x.userPrincipalName.toLowerCase() === upn || x.id === upn);
    return hit ? json(200, hit) : json(404, { error: { code: "Request_ResourceNotFound" } });
  }
  if (method === "GET" && /^\/users\/[^/]+\/authentication\/methods$/.test(p)) {
    const id = p.split("/")[2];
    return json(200, { value: id === "u-lei" || id === `lei@${DOMAIN}` ? leiMethods : id === "u-elaine" ? elaineMethods : [] });
  }
  if (method === "PATCH" && /^\/users\/[^/]+$/.test(p) && refuseDept && p === `/users/${refuseDept}` && "department" in JSON.parse(opts.body || "{}")) return json(403, { error: { code: "Authorization_RequestDenied", message: "Insufficient privileges to complete the operation." } });
  if (method === "PATCH" && /^\/users\/[^/]+$/.test(p) && refusePatch && p === `/users/${refusePatch}`) return json(403, { error: { code: "Authorization_RequestDenied", message: "Insufficient privileges to complete the operation." } });
  if (method === "PATCH" && /^\/users\/[^/]+$/.test(p)) {
    const id = p.split("/")[2], b = JSON.parse(opts.body || "{}"); userPatches.push({ id, body: b });
    const hit = users.find((x) => x.id === id); if (hit && !("department" in b)) Object.assign(hit, b);
    return { ok: true, status: 204, headers: { get: () => null }, text: async () => "" };
  }
  if (method === "DELETE" && /\/authentication\/microsoftAuthenticatorMethods\//.test(p)) {
    const id = p.split("/").pop();
    leiMethods = leiMethods.filter((m) => m.id !== id);
    return { ok: true, status: 204, headers: { get: () => null }, text: async () => "" };
  }
  return json(500, { error: { code: "unhandled", message: method + " " + p } });
};

// ---- a fake Teams / groups side of Graph for section 15 ----------------------------------------------
const teamCalls = []; // every write, in order: { method, path, body }
const groupsDb = {};  // id → { id, displayName, description, visibility, groupTypes, resourceProvisioningOptions, owners:[{id,userPrincipalName,displayName}], members:[…], specialization }
let teamSeq = 0, opState = "succeeded", failCreate = null;
function fakeTeams(method, p, u, opts, json) {
  const empty = (status) => ({ ok: true, status, headers: { get: () => null }, text: async () => "" });
  if (method === "POST" && p === "/teams") {
    const body = JSON.parse(opts.body); teamCalls.push({ method, path: p, body });
    if (failCreate) return json(failCreate, { error: { code: "Forbidden", message: "Insufficient privileges to complete the operation." } });
    const id = "00000000-0000-4000-8000-" + String(++teamSeq).padStart(12, "0"), op = "11111111-1111-4111-8111-" + String(teamSeq).padStart(12, "0");
    const tpl = /teamsTemplates\('([^']+)'\)/.exec(body["template@odata.bind"])[1];
    const ownerRef = /users\('([^']+)'\)/.exec(body.members[0]["user@odata.bind"])[1];
    const owner = users.find((x) => x.id === ownerRef);
    groupsDb[id] = { id, displayName: body.displayName, description: body.description || "", visibility: tpl === "educationClass" ? "HiddenMembership" : (body.visibility || "Public"), groupTypes: ["Unified"], mailEnabled: true, securityEnabled: false, resourceProvisioningOptions: ["Team"], specialization: tpl === "educationClass" ? "educationClass" : "none", owners: [{ id: owner.id, userPrincipalName: owner.userPrincipalName, displayName: owner.displayName }], members: [{ id: owner.id, userPrincipalName: owner.userPrincipalName, displayName: owner.displayName }] };
    return { ok: true, status: 202, headers: { get: (n) => ({ location: `/teams('${id}')/operations('${op}')`, "content-location": `/teams('${id}')` })[String(n).toLowerCase()] || null }, text: async () => "" };
  }
  let m = /^\/teams\/([^/]+)\/operations\/([^/]+)$/.exec(p);
  if (method === "GET" && m) return json(200, { id: m[2], status: opState });
  m = /^\/teams\/([^/]+)$/.exec(p);
  if (method === "GET" && m) { const g = groupsDb[m[1]]; return g ? json(200, { id: g.id, specialization: g.specialization || "none", isArchived: !!g.archived }) : json(404, { error: { code: "NotFound" } }); }
  m = /^\/teams\/([^/]+)\/(archive|unarchive)$/.exec(p);
  if (method === "POST" && m) { const g = groupsDb[m[1]]; if (!g) return json(404, { error: { code: "NotFound" } }); teamCalls.push({ method, path: p }); g.archived = m[2] === "archive"; return { ok: true, status: 202, headers: { get: () => null }, text: async () => "" }; }
  if (method === "GET" && p === "/users" && u.searchParams.get("$search")) {
    const q = u.searchParams.get("$search").match(/displayName:([^"]+)"/)[1].toLowerCase();
    return json(200, { value: users.filter((x) => (x.displayName + x.userPrincipalName).toLowerCase().includes(q)) });
  }
  m = /^\/groups\/([^/]+)(?:\/(owners|members)(?:\/([^/]+))?(?:\/(\$ref))?)?$/.exec(p);
  if (!m) return null;
  const g = groupsDb[m[1]];
  if (method === "GET") {
    if (!g) return json(404, { error: { code: "Request_ResourceNotFound" } });
    if (m[2]) return json(200, { value: m[2] === "owners" ? g.owners : g.members });
    return json(200, g);
  }
  if (!g) return json(404, { error: { code: "Request_ResourceNotFound", message: "not found" } });
  teamCalls.push({ method, path: p, body: opts.body ? JSON.parse(opts.body) : null });
  const person = (id) => users.find((x) => x.id === id);
  const rec = (id) => { const x = person(id); return { id: x.id, userPrincipalName: x.userPrincipalName, displayName: x.displayName }; };
  if (method === "PATCH" && !m[2]) { for (const ref of JSON.parse(opts.body)["members@odata.bind"] || []) { const id = ref.split("/").pop(); if (!g.members.some((x) => x.id === id)) g.members.push(rec(id)); } return empty(204); }
  if (method === "POST" && m[2] && m[3] === "$ref") {
    const id = JSON.parse(opts.body)["@odata.id"].split("/").pop(), list = m[2] === "owners" ? g.owners : g.members;
    if (list.some((x) => x.id === id)) return json(400, { error: { code: "Request_BadRequest", message: "One or more added object references already exist for the following modified properties: 'members'." } });
    list.push(rec(id)); return empty(204);
  }
  if (method === "DELETE" && m[2] && m[4] === "$ref") { const k = m[2]; g[k] = g[k].filter((x) => x.id !== m[3]); return empty(204); }
  if (method === "DELETE" && !m[2]) { delete groupsDb[m[1]]; return empty(204); }
  return null;
}

const people = require(path.join(__dirname, "..", "api", "shared", "people.js"));
let institutions = { institutions: {} };
let refuseDept = null;
let refusePatch = null;
let studentSeatsUsed = 999; // of 1000 A1 for students seats // a user id whose every PATCH Microsoft refuses (an administrator account)
const userPatches = [];
let elaineMethods = []; // Elaine registers an authenticator in 10d // a user id whose department PATCH Microsoft refuses
people.readInstitutions = async () => JSON.parse(JSON.stringify(institutions));
people.writeInstitutions = async (doc) => { institutions = JSON.parse(JSON.stringify(doc)); };
let peopleStore = { people: {} };
people.readPeople = async () => JSON.parse(JSON.stringify(peopleStore));
people.writePeople = async (doc) => { peopleStore = JSON.parse(JSON.stringify(doc)); };
// Writes go through jsonstore.update (read → change → write under the ETag); here it is the same in-memory pair.
let gnamesStore = { groups: {} };
const jsonstore = require(path.join(__dirname, "..", "api", "shared", "jsonstore.js"));
jsonstore.update = async (name, fallback, mutate) => {
  const box = { "people.json": [() => peopleStore, (d) => { peopleStore = d; }], "institutions.json": [() => institutions, (d) => { institutions = d; }], "groupnames.json": [() => gnamesStore, (d) => { gnamesStore = d; }] }[name];
  if (!box) throw new Error("unexpected blob " + name);
  const doc = JSON.parse(JSON.stringify(box[0]()));
  const result = await mutate(doc);
  if (result !== false) box[1](JSON.parse(JSON.stringify(doc)));
  return { doc, result, written: result !== false };
};
people.readGroupNames = async () => JSON.parse(JSON.stringify(gnamesStore));
const rolesMod = require(path.join(__dirname, "..", "api", "shared", "roles.js"));
rolesMod.readRoles = async () => ({ entries: [{ user: `lei@${DOMAIN}`, roles: [`domain_it:${DOMAIN}`], by: "x", at: "2026-10-01T00:00:00Z" }] });
const dir = require(path.join(__dirname, "..", "api", "shared", "directory.js"));
let blobs = {};
dir._store.read = async (n) => (blobs[n] ? JSON.parse(blobs[n]) : null);
dir._store.write = async (n, o) => { blobs[n] = JSON.stringify(o); };
const auditMod = require(path.join(__dirname, "..", "api", "shared", "audit.js"));
const auditLines = []; auditMod.audit = async (ctx, e) => { auditLines.push(e); };
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
const IT = [`domain_it:${DOMAIN}`], HIVE = [`domain_hive:${DOMAIN}`]; // HIVE: the deleted 域蜂巢管理员 (2026-10-12) — grants nothing

(async () => {
  // 1. Signed in with no management role → 403.
  let r = await call({ action: "domains", user: `teacher@${DOMAIN}` });
  assert.strictEqual(r.status, 403);
  r = await call({ action: "domains", user: `old.contractor@${DOMAIN}`, roles: ["staff:contractor"] });
  assert.strictEqual(r.status, 403, "a sign-in still carrying the deleted contractor role is no one");

  // 2. A domain administrator sees only their own domain; the unverified one never appears.
  r = await call({ action: "domains", user: DOMADMIN, roles: DOMROLE });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.body.domains.map((d) => d.domain), [DOMAIN]);
  assert.strictEqual(r.body.all, false);
  assert.strictEqual(r.body.mine, DOMAIN);

  // 3. The Hive admin sees every verified domain.
  r = await call({ action: "domains", user: ADMIN });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.body.domains.map((d) => d.domain), [DOMAIN, "other.example.edu"], "the initial *.onmicrosoft.com domain is hidden");
  assert.strictEqual(r.body.all, true);

  // 4. Another domain is refused; a malformed one is 400.
  r = await call({ action: "users", query: { domain: "other.example.edu" }, user: DOMADMIN, roles: DOMROLE });
  assert.strictEqual(r.status, 403);
  r = await call({ action: "users", query: { domain: "not a domain" }, user: DOMADMIN, roles: DOMROLE });
  assert.strictEqual(r.status, 400);

  // 4b. An 教育领袖 holds the school for its 课程方案 only: it is listed (can.plan, not can.view), its accounts are refused.
  r = await call({ action: "domains", user: `leader@${DOMAIN}`, roles: [`domain_leader:${DOMAIN}`] });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.body.domains.map((d) => [d.domain, d.can.view, d.can.plan]), [[DOMAIN, false, true]]);
  r = await call({ action: "users", query: { domain: DOMAIN }, user: `leader@${DOMAIN}`, roles: [`domain_leader:${DOMAIN}`] });
  assert.strictEqual(r.status, 403, "a leader does not see the accounts");
  assert.strictEqual(r.body.code, "forbidden");
  r = await call({ action: "domains", user: DOMADMIN, roles: DOMROLE });
  assert.deepStrictEqual([r.body.domains[0].can.view, r.body.domains[0].can.plan], [true, false], "the IT 管理员 sees accounts, not the plan");

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
  assert.ok(require("../api/shared/people").IDENTITIES.includes("教育顾问"), "教育顾问 is a 身份 (Rick 2026-10-06)");
  assert.strictEqual(elaine.identitySource, "entra");
  assert.strictEqual(lei.verified, true);
  assert.strictEqual(lei.devices.length, 2);
  assert.strictEqual(lei.devices[0].name, "iPhone 13");
  assert.strictEqual(lei.lastSignIn, "2026-09-28T01:00:00Z");
  assert.deepStrictEqual(lei.groups.map((g) => g.kind), ["class", "security", "team", "team"], "g1 is a class team (Teams specialization educationClass)");
  assert.strictEqual(lei.identity, "");
  assert.strictEqual(r.body.partial, false);

  // 5d. Rows carry the person's Hive roles, safe email and city (for the side panel).
  assert.deepStrictEqual(lei.roles.map((x) => x.role), [`domain_it:${DOMAIN}`]);
  assert.ok(lei.roles[0].zh.indexOf("IT 管理员") === 0);
  assert.strictEqual(typeof lei.safeEmail, "string");
  assert.strictEqual(typeof lei.city, "string");

  // 5e. Institution names: set by the system administrator only, shown to everyone in `domains`.
  r = await call({ action: "institution", method: "PUT", body: { domain: DOMAIN, name: "示例学校" }, user: DOMADMIN, roles: DOMROLE });
  assert.strictEqual(r.status, 403, "a domain administrator cannot name schools");
  r = await call({ action: "institution", method: "PUT", body: { domain: DOMAIN, name: " 示例学校 ", nameEn: " Example School " }, user: ADMIN });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.strictEqual(r.body.name, "示例学校");
  assert.strictEqual(r.body.nameEn, "Example School");
  r = await call({ action: "domains", user: DOMADMIN, roles: DOMROLE });
  assert.strictEqual(r.body.domains[0].name, "示例学校");
  assert.strictEqual(r.body.domains[0].nameEn, "Example School");
  assert.strictEqual(r.body.showDomains, false, "a domain administrator is not shown raw domains");
  r = await call({ action: "domains", user: ADMIN });
  assert.strictEqual(r.body.showDomains, true);
  assert.strictEqual(r.body.domains[0].can.institutions, true);
  r = await call({ action: "institution", method: "PUT", body: { domain: DOMAIN, name: "", nameEn: "" }, user: ADMIN });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(institutions.institutions, {}, "empty names clear the entry");

  // 6. The groups view: per group, how many of this domain's members.
  r = await call({ action: "groups", query: { domain: DOMAIN }, user: DOMADMIN, roles: DOMROLE });
  assert.strictEqual(r.status, 200);
  const g1 = r.body.groups.find((g) => g.id === "g1");
  assert.strictEqual(g1.kind, "class");
  assert.strictEqual(g1.domainMembers, 2);
  assert.deepStrictEqual(g1.members, [`elaine@${DOMAIN}`, `lei@${DOMAIN}`]);
  assert.strictEqual(r.body.groups[0].kind, "class", "class teams listed first");
  // Only the school's own groups: g1 (owned by lei), g2 and g4 (no owner at all); g3, owned
  // at Science Bug, is counted under `elsewhere` but not listed (Rick, 2026-10-09).
  assert.deepStrictEqual(r.body.groups.map((g) => g.id).sort(), ["g1", "g2", "g4"], "owned or orphan groups only: " + JSON.stringify(r.body.groups.map((g) => g.id)));
  assert.deepStrictEqual(g1.owners, [`lei@${DOMAIN}`]); assert.strictEqual(g1.ownedHere, true); assert.strictEqual(g1.orphan, false);
  assert.strictEqual(r.body.groups.find((g) => g.id === "g4").orphan, true, "an ownerless team is flagged");
  assert.deepStrictEqual(r.body.elsewhere.map((g) => [g.id, g.ownerDomains]), [["g3", ["sciencebug.net"]]], "the other school's team is counted, with its owners' domain");
  assert.strictEqual(r.body.ownersKnown, true);

  // 7. Identity edits: outside account refused; bad identity refused; a good one is accepted
  //    (it cannot be persisted without storage, so expect 200 or a 5xx that names storage — never a silent success for the bad ones).
  r = await call({ action: "person", method: "PATCH", body: { domain: DOMAIN, user: `lei@${DOMAIN}`, identity: "学生" }, user: DOMADMIN, roles: IT });
  assert.strictEqual(r.status, 200, "the IT 管理员 edits 身份 too (one school role since 2026-10-12)");
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
  // A 域管理员（IT）alone (the role an Entra User Administrator is mapped to) removes an
  // ordinary user's device in their own domain — and nothing in another domain.
  r = await call({ action: "method", method: "DELETE", body: { domain: "other.example.edu", user: "x@other.example.edu", id: "auth-lei-1" }, user: DOMADMIN, roles: IT });
  assert.strictEqual(r.status, 403, "IT of one domain cannot touch another domain");
  r = await call({ action: "method", method: "DELETE", body: { domain: DOMAIN, user: `lei@${DOMAIN}`, id: "auth-lei-1" }, user: DOMADMIN, roles: IT });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.ok(calls.some((c) => c.method === "DELETE" && c.url.includes("microsoftAuthenticatorMethods/auth-lei-1")), "Graph delete issued");
  assert.strictEqual(leiMethods.length, 2);
  r = await call({ action: "users", query: { domain: DOMAIN }, user: DOMADMIN, roles: IT });
  assert.strictEqual(r.body.users[1].devices.length, 1, "cached row updated without a sync");
  // 8b. 重置密码: IT of the domain gives an ordinary user a temporary password that must
  // be changed at the next sign-in; the value comes back once and is never logged.
  calls.length = 0;
  r = await call({ action: "password", method: "POST", body: { domain: DOMAIN, user: `lei@${DOMAIN}` }, user: DOMADMIN, roles: HIVE });
  assert.strictEqual(r.status, 403, "域蜂巢管理员 does not reset passwords");
  r = await call({ action: "password", method: "POST", body: { domain: DOMAIN, user: "x@other.example.edu" }, user: DOMADMIN, roles: IT });
  assert.strictEqual(r.status, 400, "account must be in this domain");
  r = await call({ action: "password", method: "POST", body: { domain: DOMAIN, user: DOMADMIN }, user: DOMADMIN, roles: IT });
  assert.strictEqual(r.status, 400, "not one's own password");
  r = await call({ action: "password", method: "POST", body: { domain: DOMAIN, user: `lei@${DOMAIN}` }, user: DOMADMIN, roles: IT });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.ok(/^[A-Za-z0-9!#%&*+=?@]{14}$/.test(r.body.password), "14-char temporary password: " + r.body.password);
  assert.ok(/[A-Z]/.test(r.body.password) && /[a-z]/.test(r.body.password) && /[0-9]/.test(r.body.password) && /[!#%&*+=?@]/.test(r.body.password), "all four classes");
  assert.strictEqual(r.body.mustChange, true);
  const pwPatch = calls.find((c) => c.method === "PATCH" && /\/users\/u-lei$/.test(c.url));
  assert.ok(pwPatch, "Graph PATCH issued on the account");
  const pp = JSON.parse(pwPatch.body).passwordProfile;
  assert.strictEqual(pp.password, r.body.password);
  assert.strictEqual(pp.forceChangePasswordNextSignIn, true);
  assert.ok(!auditLines.some((l) => JSON.stringify(l).includes(r.body.password)), "the password is not in the audit log");
  assert.ok(auditLines.some((l) => l.action === "password.reset" && l.target === `lei@${DOMAIN}` && l.result === "ok"), "audited");
  // Two resets never give the same password.
  const r2 = await call({ action: "password", method: "POST", body: { domain: DOMAIN, user: `lei@${DOMAIN}` }, user: DOMADMIN, roles: IT });
  assert.notStrictEqual(r2.body.password, r.body.password);

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
  const deltaTok = () => (blobs["_delta.json"] ? new URL(JSON.parse(blobs["_delta.json"]).deltaLink).searchParams.get("$deltatoken") : ""); // (a plain includes("T2") matched the ISO timestamp "T20:…" after 20:00 UTC)
  assert.strictEqual(deltaTok(), "T1", "the full sync took a delta token");
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
  const batches = calls.filter((c) => c.url.includes("/$batch") && c.body.includes("/users/"));
  assert.strictEqual(batches.length, 1, "one per-account batch (the other batch is the class-team lookup)");
  assert.ok(batches[0].body.includes("u-new") && batches[0].body.includes("u-elaine") && !batches[0].body.includes("u-lei"), "only changed accounts re-read");
  // A 域管理员（IT）'s sync is scoped to their school: the other domain's cache is not
  // created or touched and the tenant delta token stays where it was (Rick, 2026-10-03).
  assert.strictEqual(deltaTok(), "T1", "domain-scoped sync keeps the delta token");
  assert.strictEqual(blobs["other.example.edu.json"], undefined, "other domain untouched by an IT admin's sync");
  // The system administrator's sync is tenant-wide: token advances.
  r = await call({ action: "sync", method: "POST", body: { domain: DOMAIN, mode: "changes" }, user: ADMIN, roles: ["admin"] });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.strictEqual(deltaTok(), "T2", "token advanced by the system administrator");
  r = await call({ action: "users", query: { domain: DOMAIN }, user: DOMADMIN, roles: IT });
  assert.deepStrictEqual(r.body.users.map((x) => x.displayName), ["Elaine Chen-Wang", "New Person"]);
  // Running it again with nothing new is a no-op that still stamps the time.
  deltaChanges = [];
  r = await call({ action: "sync", method: "POST", body: { domain: DOMAIN, mode: "changes" }, user: DOMADMIN, roles: IT });
  assert.strictEqual(r.body.done, true);
  assert.strictEqual(r.body.users, 2);
  // restore for the scheduler section
  users.splice(users.findIndex((x) => x.id === "u-new"), 1);

  // 10b. Entra's department (Rick, 2026-10-10): the school's name is never written;
  // each domain's departments are cleared once (「只要清空一次就可以」) — an identity
  // the department carried goes into Hive's record first, an account Microsoft
  // refuses (a privileged admin) is not tried again — and once the domain is
  // recorded as done, a department set afterwards is left alone.
  delete blobs["_departments.json"]; // earlier syncs here found nothing and recorded the domain as done
  institutions = { institutions: { [DOMAIN]: { name: "示例学校", by: ADMIN, at: "x" } } };
  users.find((x) => x.id === "u-elaine").department = "老师";
  users.find((x) => x.id === "u-lei").department = "示例学校";
  const elaineRec = peopleStore.people[`elaine@${DOMAIN}`];
  if (elaineRec) delete elaineRec.identity;
  refuseDept = "u-lei";
  calls.length = 0;
  blobs[`${DOMAIN}.json`] = undefined; delete blobs[`${DOMAIN}.json`];
  st = await dir.syncSlice(DOMAIN, "full", { budgetMs: 20000 });
  assert.strictEqual(st.done, true);
  const deptPatches = () => calls.filter((c) => c.method === "PATCH" && /\/users\//.test(c.url) && "department" in JSON.parse(c.body)).map((c) => [c.url.split("/users/")[1], JSON.parse(c.body).department]).sort();
  assert.deepStrictEqual(deptPatches(), [["u-elaine", null], ["u-lei", null]], "every department is cleared, nothing is written");
  let cached = JSON.parse(blobs[`${DOMAIN}.json`]).users;
  assert.strictEqual(cached.find((x) => x.id === "u-elaine").department, "", "cleared in the cache too");
  assert.strictEqual(cached.find((x) => x.id === "u-lei").departmentRefused, "示例学校", "a refused account is remembered");
  assert.strictEqual(peopleStore.people[`elaine@${DOMAIN}`].identity, "老师", "the identity the department carried is kept in Hive");
  delete users.find((x) => x.id === "u-elaine").department; // Microsoft now has it empty
  calls.length = 0;
  st = await dir.syncSlice(DOMAIN, "full", { budgetMs: 20000 });
  assert.strictEqual(st.done, true);
  assert.deepStrictEqual(deptPatches(), [], "the refused account is not tried again, the cleared one needs nothing");
  const deptDone = JSON.parse(blobs["_departments.json"]).domains[DOMAIN];
  assert.ok(deptDone && deptDone.at, "the domain is recorded as cleared once");
  assert.deepStrictEqual(deptDone.refused, [`lei@${DOMAIN}`], "the refused account is listed for a manual fix");
  users.find((x) => x.id === "u-elaine").department = "行政"; // the school sets one itself afterwards
  calls.length = 0;
  st = await dir.syncSlice(DOMAIN, "full", { budgetMs: 20000 });
  assert.deepStrictEqual(deptPatches(), [], "cleared once: a later department stays");
  assert.strictEqual(JSON.parse(blobs[`${DOMAIN}.json`]).users.find((x) => x.id === "u-elaine").department, "行政");
  refuseDept = null;
  institutions = { institutions: {} };
  delete users.find((x) => x.id === "u-elaine").department;
  delete users.find((x) => x.id === "u-lei").department;

  // 10c. The clearing does not depend on time left over (2026-10-11: a night left
  // 智慧园书院's accounts untouched). A slice with no time for it keeps the run
  // open ("departments" phase) and the next call clears; a "changes" sync with
  // nothing queued for the domain clears too.
  const setCachedDept = (vals) => { const d = JSON.parse(blobs[`${DOMAIN}.json`]); for (const r of d.users) { if (vals[r.id] !== undefined) { r.department = vals[r.id]; delete r.departmentRefused; } } blobs[`${DOMAIN}.json`] = JSON.stringify(d); };
  delete blobs["_departments.json"];
  setCachedDept({ "u-elaine": "智慧园书院", "u-lei": "智慧园书院" });
  deltaChanges = [];
  calls.length = 0;
  st = await dir.syncSlice(DOMAIN, "changes", { budgetMs: -1, scope: "tenant", recheck: false }); // a slice whose time is already spent
  assert.strictEqual(st.done, false, "no time this slice: the run stays open");
  assert.strictEqual(st.phase, "departments");
  assert.strictEqual(st.departmentsLeft, 2);
  assert.deepStrictEqual(deptPatches(), [], "nothing tried without time");
  st = await dir.syncSlice(DOMAIN, "changes", { budgetMs: 20000, scope: "tenant", recheck: false });
  assert.strictEqual(st.done, true, JSON.stringify(st));
  assert.deepStrictEqual(deptPatches(), [["u-elaine", null], ["u-lei", null]], "the next call clears them all");
  assert.ok(JSON.parse(blobs["_departments.json"]).domains[DOMAIN], "and records the domain");
  assert.ok(JSON.parse(blobs[`${DOMAIN}.json`]).users.every((r) => !r.department), "cache cleared");

  // 10d. An authenticator registered in Entra shows without waiting for the nightly
  // full read (Rick, 2026-10-12: Linda H.): /users/delta does not report it, so
  // (a) the person panel's GET domain/user reads the account live, and (b) a
  // "changes" sync re-reads every account without an authenticator.
  let cachedRow = (id) => JSON.parse(blobs[`${DOMAIN}.json`]).users.find((x) => x.id === id);
  assert.strictEqual(cachedRow("u-elaine").verified, false, "Elaine has none yet");
  elaineMethods = [{ "@odata.type": "#microsoft.graph.microsoftAuthenticatorAuthenticationMethod", id: "ma-e1", displayName: "iPhone 13", createdDateTime: "2026-10-12T01:00:00Z" }];
  r = await call({ action: "user", query: { domain: DOMAIN, upn: `elaine@${DOMAIN}` }, user: DOMADMIN, roles: IT });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.strictEqual(r.body.user.verified, true, "read live");
  assert.deepStrictEqual(r.body.user.devices.map((x) => x.name), ["iPhone 13"]);
  assert.strictEqual(cachedRow("u-elaine").verified, true, "and written into the cache");
  r = await call({ action: "user", query: { domain: DOMAIN, upn: "someone@other.example.edu" }, user: DOMADMIN, roles: IT });
  assert.strictEqual(r.status, 400, "only an account of this domain");
  // (b) back to "none" in the cache; Entra has one; a changes sync with nothing in the delta finds it.
  { const d = JSON.parse(blobs[`${DOMAIN}.json`]); const e = d.users.find((x) => x.id === "u-elaine"); e.verified = false; e.devices = []; blobs[`${DOMAIN}.json`] = JSON.stringify(d); }
  deltaChanges = [];
  let guard10d = 0;
  do { st = await dir.syncSlice(DOMAIN, "changes", { budgetMs: 20000, scope: "tenant" }); } while (!st.done && ++guard10d < 5);
  assert.strictEqual(st.done, true);
  assert.strictEqual(cachedRow("u-elaine").verified, true, "the changes sync re-read the account without an authenticator");
  elaineMethods = [];

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

  // 11b. 新建账号: the two A1 plans + the always-on extra; the account is created with the
  // chosen plan and Power Automate Free, 身份, city and postcode, and appears in the cache.
  r = await call({ action: "licenses", query: { domain: DOMAIN }, user: DOMADMIN, roles: HIVE });
  assert.strictEqual(r.status, 403, "域蜂巢管理员 does not create accounts");
  r = await call({ action: "licenses", query: { domain: DOMAIN }, user: DOMADMIN, roles: IT });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.strictEqual(r.body.faculty.name, "Office 365 A1 for faculty"); assert.strictEqual(r.body.faculty.free, 488);
  assert.strictEqual(r.body.student.name, "Office 365 A1 for students"); assert.strictEqual(r.body.student.free, 1);
  assert.deepStrictEqual(r.body.extras.map((x) => x.name), ["Power Automate Free"], "always-on extra listed; E3 and suspended plans are not offered");
  const base = { domain: DOMAIN, account: "Li.Ming", givenName: "明", surname: "李", identity: "老师", city: "南京", postalCode: "210000", plan: "faculty" };
  r = await call({ action: "user", method: "POST", body: Object.assign({}, base, { city: "" }), user: DOMADMIN, roles: IT });
  assert.strictEqual(r.status, 400, "city required"); assert.ok(r.body.problems.join().includes("city"));
  r = await call({ action: "user", method: "POST", body: Object.assign({}, base, { postalCode: "" }), user: DOMADMIN, roles: IT });
  assert.strictEqual(r.status, 400, "postal code required");
  r = await call({ action: "user", method: "POST", body: Object.assign({}, base, { identity: "" }), user: DOMADMIN, roles: IT });
  assert.strictEqual(r.status, 400, "identity required");
  r = await call({ action: "user", method: "POST", body: Object.assign({}, base, { plan: "student" }), user: DOMADMIN, roles: IT });
  assert.strictEqual(r.status, 400, "students plan refused for a teacher"); assert.ok(r.body.problems.join().includes("学生 only"));
  r = await call({ action: "user", method: "POST", body: Object.assign({}, base, { identity: "学生", plan: "faculty" }), user: DOMADMIN, roles: IT });
  assert.strictEqual(r.status, 400, "faculty plan refused for a student");
  institutions = { institutions: { [DOMAIN]: { name: "示例学校", by: ADMIN, at: "x" } } };
  r = await call({ action: "user", method: "POST", body: base, user: DOMADMIN, roles: IT });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.strictEqual(r.body.user, `li.ming@${DOMAIN}`);
  institutions = { institutions: {} };
  assert.ok(!("department" in createdUsers[createdUsers.length - 1]), "the school's name is not written to a new account");
  assert.strictEqual(r.body.displayName, "李明", "CJK display name = surname + given name, no space");
  assert.ok(/^[A-Za-z0-9!#%&*+=?@]{14}$/.test(r.body.password), "temporary password");
  assert.deepStrictEqual(r.body.licence, { ok: true, plans: ["Office 365 A1 for faculty", "Power Automate Free"] });
  const cu = createdUsers[createdUsers.length - 1];
  assert.strictEqual(cu.userPrincipalName, `li.ming@${DOMAIN}`);
  assert.strictEqual(cu.city, "南京"); assert.strictEqual(cu.postalCode, "210000"); assert.strictEqual(cu.usageLocation, "CN");
  assert.strictEqual(cu.passwordProfile.forceChangePasswordNextSignIn, true);
  assert.deepStrictEqual(licenseCalls[licenseCalls.length - 1].body.addLicenses.map((x) => x.skuId), ["94763226-9b3c-4e75-a931-5c89701abe66", "f30db892-07e9-47e9-837c-80727f46fd3d"], "A1 faculty + Power Automate Free in one call");
  r = await call({ action: "users", query: { domain: DOMAIN }, user: DOMADMIN, roles: IT });
  const newRow = r.body.users.find((x) => x.upn === `li.ming@${DOMAIN}`);
  assert.ok(newRow && newRow.displayName === "李明" && newRow.identity === "老师" && newRow.verified === false && newRow.city === "南京", "new account in the cache with 身份: " + JSON.stringify(newRow));
  r = await call({ action: "user", method: "POST", body: Object.assign({}, base, { displayName: "Again" }), user: DOMADMIN, roles: IT });
  assert.strictEqual(r.status, 409, "existing account refused");
  r = await call({ action: "user", method: "POST", body: Object.assign({}, base, { account: "bad name!" }), user: DOMADMIN, roles: IT });
  assert.strictEqual(r.status, 400);
  r = await call({ action: "user", method: "POST", body: Object.assign({}, base, { domain: "other.example.edu", account: "x" }), user: DOMADMIN, roles: IT });
  assert.strictEqual(r.status, 403, "not another domain");
  r = await call({ action: "user", method: "POST", body: { domain: DOMAIN, account: "ann.lee", givenName: "Ann", surname: "Lee", identity: "学生", city: "Nanjing", postalCode: "210000", plan: "student" }, user: ADMIN, roles: ["admin"] });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.strictEqual(r.body.displayName, "Ann Lee", "Latin display name = given name + surname");
  assert.deepStrictEqual(licenseCalls[licenseCalls.length - 1].body.addLicenses.map((x) => x.skuId), ["314c4481-f395-4525-be8b-2ec4bb1e9d91", "f30db892-07e9-47e9-837c-80727f46fd3d"], "student plan for a 学生");
  users.splice(users.findIndex((x) => x.userPrincipalName === `li.ming@${DOMAIN}`), 1); users.splice(users.findIndex((x) => x.userPrincipalName === `ann.lee@${DOMAIN}`), 1);

  // 11c. 删除账号: IT deletes an ordinary account of the domain; not oneself, not a role
  // holder, not another domain; the cache row goes at once.
  r = await call({ action: "user", method: "DELETE", body: { domain: DOMAIN, user: `elaine@${DOMAIN}` }, user: DOMADMIN, roles: HIVE });
  assert.strictEqual(r.status, 403, "域蜂巢管理员 does not delete accounts");
  r = await call({ action: "user", method: "DELETE", body: { domain: DOMAIN, user: DOMADMIN }, user: DOMADMIN, roles: IT });
  assert.strictEqual(r.status, 400, "not oneself");
  r = await call({ action: "user", method: "DELETE", body: { domain: DOMAIN, user: `lei@${DOMAIN}` }, user: DOMADMIN, roles: IT });
  assert.strictEqual(r.status, 403, "a role holder is refused: " + JSON.stringify(r.body)); assert.strictEqual(r.body.code, "has_roles");
  r = await call({ action: "user", method: "DELETE", body: { domain: "other.example.edu", user: "x@other.example.edu" }, user: DOMADMIN, roles: IT });
  assert.strictEqual(r.status, 403, "not another domain");
  r = await call({ action: "user", method: "DELETE", body: { domain: DOMAIN, user: `elaine@${DOMAIN}` }, user: DOMADMIN, roles: IT });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.strictEqual(r.body.restorableDays, 30);
  assert.deepStrictEqual(deletedIds, ["u-elaine"], "Graph DELETE issued on the account");
  r = await call({ action: "users", query: { domain: DOMAIN }, user: DOMADMIN, roles: IT });
  assert.ok(!r.body.users.some((x) => x.upn === `elaine@${DOMAIN}`), "row gone from the cache");
  // put Elaine back for the sections that follow
  users.push({ id: "u-elaine", userPrincipalName: `elaine@${DOMAIN}`, displayName: "Elaine Chen-Wang", accountEnabled: true, userType: "Member", createdDateTime: "2026-01-01T00:00:00Z" });
  await dir.syncSlice(DOMAIN, "full", { budgetMs: 20000 });

  // 12. /api/roles: the 角色分配 page's search reads the directory caches (no Graph),
  // and the entries carry the person's name and school.
  let stored = { entries: [{ user: `lei@${DOMAIN}`, roles: [`domain_it:${DOMAIN}`], by: ADMIN, at: "2026-10-01T00:00:00Z" }] };
  rolesMod.readRoles = async () => JSON.parse(JSON.stringify(stored));
  rolesMod.writeRoles = async (doc) => { stored = JSON.parse(JSON.stringify(doc)); };
  rolesMod.updateRoles = async (mutate) => { const doc = JSON.parse(JSON.stringify(stored)); const result = await mutate(doc); stored = JSON.parse(JSON.stringify(doc)); return { doc, result, written: true }; };
  const rolesApi = require(path.join(__dirname, "..", "api", "roles", "index.js")); // after the stubs: it destructures them at load
  async function rcall(opts) {
    const context = { log: Object.assign(() => {}, { error() {}, warn() {} }), res: null };
    await rolesApi(context, Object.assign({ method: "GET", params: {}, query: {}, body: null, headers: { "x-ms-client-principal": principal(ADMIN, ["admin"]) } }, opts));
    return context.res;
  }
  if (!blobs[`${DOMAIN}.json`]) { await dir.syncSlice(DOMAIN, "full", { budgetMs: 20000 }); }
  r = await rcall({ query: { q: "lei" } });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.ok(r.body.people.some((p) => p.upn === `lei@${DOMAIN}` && p.domain === DOMAIN && p.displayName), "search finds Lei by account: " + JSON.stringify(r.body.people));
  r = await rcall({ query: { q: "elaine" } });
  assert.ok(r.body.people.length >= 1 && /elaine/i.test(r.body.people[0].displayName + r.body.people[0].upn), "search by name");
  r = await rcall({ query: { q: "zzzz-nobody" } });
  assert.deepStrictEqual(r.body.people, []);
  r = await rcall({});
  assert.strictEqual(r.status, 200);
  const leiEntry = r.body.entries.find((e) => e.user === `lei@${DOMAIN}`);
  assert.ok(leiEntry && leiEntry.displayName && leiEntry.domain === DOMAIN && leiEntry.inDirectory === true, "entry joined with the directory: " + JSON.stringify(leiEntry));
  r = await rcall({ method: "POST", body: { user: `Elaine@${DOMAIN}`, roles: [`domain_hive:${DOMAIN}`, "staff:sales"] } });
  assert.strictEqual(r.status, 400, "the deleted 域蜂巢管理员 cannot be assigned: " + JSON.stringify(r.body));
  r = await rcall({ method: "POST", body: { user: `Elaine@${DOMAIN}`, roles: ["staff:contractor"] } });
  assert.strictEqual(r.status, 400, "the deleted contractor cannot be assigned: " + JSON.stringify(r.body));
  r = await rcall({ method: "POST", body: { user: `Elaine@${DOMAIN}`, roles: [`domain_it:${DOMAIN}`, "staff:sales"] } });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.ok(stored.entries.some((e) => e.user === `elaine@${DOMAIN}` && e.roles.length === 2), "saved lowercase with both roles");
  r = await rcall({ method: "POST", body: { user: `x@${DOMAIN}`, roles: ["domain_it:not-a-domain"] } });
  assert.strictEqual(r.status, 400);
  r = await rcall({ headers: { "x-ms-client-principal": principal(`lei@${DOMAIN}`, IT) } });
  assert.strictEqual(r.status, 403, "a domain administrator does not see 角色分配");

  // 13. domain=* — the users of every managed school, merged server side, each row with its domain.
  dir._store.listDomains = async () => Object.keys(blobs).filter((n) => /^[a-z0-9.-]+\.json$/.test(n) && !/^(delta|roles)/.test(n)).map((n) => ({ domain: n.replace(/\.json$/, ""), isDefault: false, isInitial: false }));
  blobs["other.example.edu.json"] = JSON.stringify({ domain: "other.example.edu", syncedAt: "2026-10-01T00:00:00Z", users: [{ upn: "a@other.example.edu", displayName: "A", groups: [], methods: [], verified: true, enabled: true }], pending: [] });
  r = await call({ action: "users", query: { domain: "*" }, user: DOMADMIN, roles: [`domain_it:${DOMAIN}`] });
  assert.strictEqual(r.status, 403, "one managed school: no all-schools view: " + JSON.stringify(r.body));
  r = await call({ action: "users", query: { domain: "*" }, user: ADMIN, roles: ["admin"] });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.ok(r.body.domains.includes(DOMAIN) && r.body.domains.includes("other.example.edu"), "both verified schools listed: " + r.body.domains);
  assert.ok(r.body.users.some((u) => u.domain === "other.example.edu" && u.upn === "a@other.example.edu") && r.body.users.some((u) => u.domain === DOMAIN), "rows carry their domain");
  // 14. 修改资料 and 换许可证 (Rick, 2026-10-12): the IT 管理员 edits an account in
  //     Microsoft 365 and switches its A1 plan; the old 域蜂巢管理员 cannot.
  const FAC = "94763226-9b3c-4e75-a931-5c89701abe66", STU = "314c4481-f395-4525-be8b-2ec4bb1e9d91", FLOW = "f30db892-07e9-47e9-837c-80727f46fd3d";
  const elaine14 = users.find((x) => x.id === "u-elaine");
  Object.assign(elaine14, { usageLocation: "CN", assignedLicenses: [{ skuId: FAC }] });
  r = await call({ action: "user", method: "PATCH", body: { domain: DOMAIN, user: `elaine@${DOMAIN}`, jobTitle: "数学老师" }, user: DOMADMIN, roles: HIVE });
  assert.strictEqual(r.status, 403, "the old 域蜂巢管理员 does not edit Microsoft accounts");
  r = await call({ action: "user", method: "PATCH", body: { domain: DOMAIN, user: `elaine@${DOMAIN}`, safeEmail: "elaine@qq.com", postalCode: "x" }, user: DOMADMIN, roles: IT });
  assert.strictEqual(r.status, 400);
  assert.ok(r.body.problems.some((x) => /mainland/.test(x)) && r.body.problems.some((x) => /postal/.test(x)), JSON.stringify(r.body));
  r = await call({ action: "user", method: "PATCH", body: { domain: DOMAIN, user: "x@other.example.edu", jobTitle: "a" }, user: DOMADMIN, roles: IT });
  assert.strictEqual(r.status, 400, "only this school's accounts");
  r = await call({ action: "user", method: "PATCH", body: { domain: DOMAIN, user: `elaine@${DOMAIN}` }, user: DOMADMIN, roles: IT });
  assert.strictEqual(r.status, 400, "nothing to change");
  userPatches.length = 0;
  r = await call({ action: "user", method: "PATCH", body: { domain: DOMAIN, user: `elaine@${DOMAIN}`, displayName: "Elaine C.", jobTitle: "数学老师", city: "南京", postalCode: "210000", safeEmail: "Elaine@Gmail.com", surname: "", department: "智慧园书院" }, user: DOMADMIN, roles: IT });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.deepStrictEqual(userPatches[0].body, { surname: null, displayName: "Elaine C.", jobTitle: "数学老师", city: "南京", postalCode: "210000", otherMails: ["elaine@gmail.com"] }, "written to Microsoft — never the department");
  assert.ok(r.body.user && r.body.user.displayName === "Elaine C." && r.body.user.jobTitle === "数学老师", "the row comes back fresh: " + JSON.stringify(r.body.user));
  refusePatch = "u-elaine";
  r = await call({ action: "user", method: "PATCH", body: { domain: DOMAIN, user: `elaine@${DOMAIN}`, jobTitle: "x" }, user: DOMADMIN, roles: IT });
  assert.strictEqual(r.status, 403); assert.strictEqual(r.body.code, "privileged");
  refusePatch = null;
  r = await call({ action: "user", query: { domain: DOMAIN, upn: `elaine@${DOMAIN}`, full: "1" }, user: DOMADMIN, roles: IT });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.body.profile && [r.body.profile.displayName, r.body.profile.postalCode, r.body.profile.safeEmail, r.body.profile.usageLocation], ["Elaine C.", "210000", "elaine@gmail.com", "CN"], "the edit form's live values");
  // Licence: Elaine's 身份 is 家长 (job title / Hive), so not the student plan.
  peopleStore.people[`elaine@${DOMAIN}`] = Object.assign({}, peopleStore.people[`elaine@${DOMAIN}`], { identity: "家长" });
  r = await call({ action: "licence", method: "POST", body: { domain: DOMAIN, user: `elaine@${DOMAIN}`, plan: "student" }, user: DOMADMIN, roles: IT });
  assert.strictEqual(r.status, 400); assert.strictEqual(r.body.code, "identity");
  r = await call({ action: "licence", method: "POST", body: { domain: DOMAIN, user: `elaine@${DOMAIN}`, plan: "faculty" }, user: DOMADMIN, roles: IT });
  assert.strictEqual(r.status, 200); assert.strictEqual(r.body.unchanged, true, "already on faculty");
  peopleStore.people[`elaine@${DOMAIN}`].identity = "学生";
  r = await call({ action: "licence", method: "POST", body: { domain: DOMAIN, user: `elaine@${DOMAIN}`, plan: "student" }, user: DOMADMIN, roles: HIVE });
  assert.strictEqual(r.status, 403, "the old 域蜂巢管理员 does not change licences");
  studentSeatsUsed = 1000;
  r = await call({ action: "licence", method: "POST", body: { domain: DOMAIN, user: `elaine@${DOMAIN}`, plan: "student" }, user: DOMADMIN, roles: IT });
  assert.strictEqual(r.status, 409, "no free student seat");
  assert.strictEqual(r.body.code, "no_seats");
  // A seat frees up: faculty out, students in, Power Automate kept — one call.
  licenseCalls.length = 0;
  studentSeatsUsed = 10;
  r = await call({ action: "licence", method: "POST", body: { domain: DOMAIN, user: `elaine@${DOMAIN}`, plan: "student" }, user: DOMADMIN, roles: IT });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.deepStrictEqual(licenseCalls[0].body.removeLicenses, [FAC], "the faculty plan removed");
  assert.deepStrictEqual(licenseCalls[0].body.addLicenses.map((x) => x.skuId), [STU, FLOW], "the student plan added, with Power Automate Free");
  assert.strictEqual(r.body.user.plan, "student", "the row shows the new plan");
  delete elaine14.usageLocation; elaine14.assignedLicenses = [];
  r = await call({ action: "licence", method: "POST", body: { domain: DOMAIN, user: `elaine@${DOMAIN}`, plan: "student" }, user: DOMADMIN, roles: IT });
  assert.strictEqual(r.body.code, "no_usage_location");

  // 15. 新建 Teams 群组 (Rick, 2026-10-16): the IT 管理员 creates a school's team and manages its
  //     people, so the tenant can stop ordinary users creating groups. Types as Teams for
  //     Education offers them; 其它 chooses 公开/私有; the IT 管理员 adds only the school's own
  //     accounts unless the system administrator opened the tenant to that school.
  const tg = require(path.join(__dirname, "..", "api", "shared", "teamGroups.js"));
  tg.WAIT.create = 0; tg.WAIT.check = 0; tg.WAIT.step = 1;
  for (const [id, upn, name, ident] of [["u-t1", "t.wang@" + DOMAIN, "Wang Teacher", "老师"], ["u-t2", "t.li@" + DOMAIN, "Li Teacher", "老师"], ["u-k1", "kid.one@" + DOMAIN, "Kid One", "学生"], ["u-k2", "kid.two@" + DOMAIN, "Kid Two", "学生"]]) {
    users.push({ id, userPrincipalName: upn, displayName: name, accountEnabled: true, userType: "Member", createdDateTime: "2026-09-01T00:00:00Z" });
    peopleStore.people[upn] = { identity: ident };
    if (id !== "u-k2") await dir.addUser(DOMAIN, users[users.length - 1]); // kid.two is deliberately not in the cache yet
  }
  users.push({ id: "u-ox", userPrincipalName: "x@other.example.edu", displayName: "Xavier Other", accountEnabled: true, userType: "Member" });
  users.push({ id: "u-g2", userPrincipalName: "g2_gmail.com#EXT#@" + DOMAIN, displayName: "Guest Two", userType: "Guest" });
  const T1 = "t.wang@" + DOMAIN, T2 = "t.li@" + DOMAIN, K1 = "kid.one@" + DOMAIN, K2 = "kid.two@" + DOMAIN, OX = "x@other.example.edu";
  const O365 = (id, name, extra) => Object.assign({ id, displayName: name, groupTypes: ["Unified"], resourceProvisioningOptions: ["Team"], visibility: "Private", owners: [], members: [] }, extra || {});
  const G1 = "aaaaaaaa-aaaa-4aaa-8aaa-000000000001", G2 = "aaaaaaaa-aaaa-4aaa-8aaa-000000000002", G3 = "aaaaaaaa-aaaa-4aaa-8aaa-000000000003", G5 = "aaaaaaaa-aaaa-4aaa-8aaa-000000000005";
  groupsDb[G1] = O365(G1, "G5 English", { owners: [{ id: "u-lei", userPrincipalName: "lei@" + DOMAIN, displayName: "Lei Dong" }], members: [{ id: "u-lei", userPrincipalName: "lei@" + DOMAIN, displayName: "Lei Dong" }, { id: "u-elaine", userPrincipalName: "elaine@" + DOMAIN, displayName: "Elaine" }] });
  groupsDb[G2] = { id: G2, displayName: "All staff", groupTypes: [], securityEnabled: true, mailEnabled: false, owners: [], members: [] };
  groupsDb[G3] = O365(G3, "Science Bug Lab", { owners: [{ id: "u-x", userPrincipalName: "anna@sciencebug.net", displayName: "Anna" }] });
  groupsDb[G5] = O365(G5, "Role group", { isAssignableToRole: true });
  const body15 = (o) => Object.assign({ domain: DOMAIN, type: "class", name: "G5 Math 2026", description: "Fifth grade maths", owners: [T1], members: [K1, K2] }, o || {});
  const post = (action, b, who, rl) => call({ action, method: "POST", body: b, user: who || DOMADMIN, roles: rl || IT });
  const writes = () => teamCalls.filter((c) => c.method !== "GET");

  // Who: a teacher with no role, the deleted 域蜂巢管理员 and an 教育领袖 may not; IT 管理员 and sysadmin may.
  for (const rl of [[], HIVE, [`domain_leader:${DOMAIN}`]]) { r = await post("group", body15(), `teacher@${DOMAIN}`, rl); assert.ok(r.status === 403, "no teams without the IT role: " + r.status); }
  r = await call({ action: "groupoptions", query: { domain: DOMAIN }, user: DOMADMIN, roles: IT });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.body.types.map((x) => x.id), ["class", "plc", "staff", "standard"], "Teams' own four types, in its order");
  assert.deepStrictEqual(r.body.types.map((x) => x.privacy), ["hidden", "private", "private", "choose"], "only 其它 chooses public or private");
  assert.strictEqual(r.body.tenantUsers, false); assert.strictEqual(r.body.canSetScope, false);

  // The form is validated before anything reaches Microsoft.
  teamCalls.length = 0;
  r = await post("group", { domain: DOMAIN, type: "club", name: "", owners: [] });
  assert.strictEqual(r.status, 400);
  assert.ok(r.body.problems.some((x) => /type/.test(x)) && r.body.problems.some((x) => /name is required/.test(x)) && r.body.problems.some((x) => /owner/.test(x)), JSON.stringify(r.body));
  r = await post("group", body15({ name: "a<b>" })); assert.strictEqual(r.status, 400);
  r = await post("group", body15({ type: "standard", visibility: "Secret" })); assert.strictEqual(r.status, 400);
  r = await post("group", body15({ members: [OX] }));
  assert.strictEqual(r.status, 400); assert.ok(r.body.problems.some((x) => /not an account of this school/.test(x)), "another school's account is refused: " + JSON.stringify(r.body));
  r = await post("group", body15({ members: ["g2_gmail.com#EXT#@" + DOMAIN] }));
  assert.strictEqual(r.status, 400); assert.ok(r.body.problems.some((x) => /guest/.test(x)), "guests are never added: " + JSON.stringify(r.body));
  r = await post("group", body15({ members: ["nobody@" + DOMAIN] }));
  assert.strictEqual(r.status, 400); assert.ok(r.body.problems.some((x) => /does not exist/.test(x)));
  r = await post("group", body15({ owners: [K1] }));
  assert.strictEqual(r.status, 400); assert.ok(r.body.problems.some((x) => /student/.test(x)), "a student cannot own a class team: " + JSON.stringify(r.body));
  assert.strictEqual(writes().length, 0, "nothing was sent to Microsoft for a bad form");

  // A class team: the template, no visibility (hiddenMembership by design), the first owner in the call,
  // the other owner and the members added after; the cache lists it at once.
  r = await post("group", body15({ owners: [T1, T2] }));
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.ok(r.body.ok && !r.body.pending && r.body.owners === 2 && r.body.members === 2 && !r.body.failed.length, JSON.stringify(r.body));
  let made = teamCalls.find((c) => c.path === "/teams").body;
  assert.ok(/teamsTemplates\('educationClass'\)/.test(made["template@odata.bind"]), "the Education class template");
  assert.ok(!("visibility" in made), "a class team is not given a visibility");
  assert.deepStrictEqual([made.displayName, made.description, made.members.length, made.members[0].roles], ["G5 Math 2026", "Fifth grade maths", 1, ["owner"]]);
  assert.ok(/users\('u-t1'\)/.test(made.members[0]["user@odata.bind"]), "the first owner goes in at creation");
  let gid = r.body.id;
  assert.deepStrictEqual(groupsDb[gid].owners.map((x) => x.id).sort(), ["u-t1", "u-t2"], "the second owner added");
  assert.deepStrictEqual(groupsDb[gid].members.map((x) => x.id).sort(), ["u-k1", "u-k2", "u-t1", "u-t2"], "owners are also members, and the students");
  r = await call({ action: "groups", query: { domain: DOMAIN }, user: DOMADMIN, roles: IT });
  let mine = r.body.groups.find((x) => x.id === gid);
  assert.ok(mine && mine.kind === "class" && mine.name === "G5 Math 2026" && mine.owners.length === 2, "listed without a sync: " + JSON.stringify(mine));
  assert.ok(auditLines.some((a) => a.action === "group.create" && a.target === gid && a.type === "class" && a.result === "ok"), "audited");

  // 其它 chooses 公开 or 私有; PLC and staff are private whatever is sent.
  teamCalls.length = 0;
  r = await post("group", body15({ type: "standard", name: "Chess club", visibility: "Public", owners: [T1], members: [K1] }));
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  made = teamCalls.find((c) => c.path === "/teams").body;
  assert.ok(/teamsTemplates\('standard'\)/.test(made["template@odata.bind"]) && made.visibility === "Public", JSON.stringify(made));
  assert.strictEqual(groupsDb[r.body.id].visibility, "Public");
  for (const [type, tpl] of [["plc", "educationProfessionalLearningCommunity"], ["staff", "educationStaff"]]) {
    teamCalls.length = 0;
    r = await post("group", body15({ type, name: type + " team", visibility: "Public", owners: [T1], members: [T2] }));
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    made = teamCalls.find((c) => c.path === "/teams").body;
    assert.ok(made["template@odata.bind"].includes(`('${tpl}')`) && made.visibility === "Private", type + ": " + JSON.stringify(made));
  }
  r = await post("group", body15({ type: "standard", name: "Private club", owners: [K1] })); // a student may own an "other" team
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.strictEqual(teamCalls.filter((c) => c.path === "/teams").pop().body.visibility, "Private", "private is the default");

  // Microsoft refuses (the app lacks Team.Create): a plain message naming the permission, audited as failed.
  failCreate = 403;
  r = await post("group", body15());
  failCreate = null;
  assert.strictEqual(r.status, 403); assert.strictEqual(r.body.code, "app_permission"); assert.ok(/Team\.Create/.test(r.body.error));
  assert.ok(auditLines.some((a) => a.action === "group.create" && a.result === "failed"));

  // Creation still under way: the first answer is pending; the page asks again with the people left to add.
  opState = "inProgress"; teamCalls.length = 0;
  r = await post("group", body15({ name: "Slow team", owners: [T1], members: [K1] }));
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.ok(r.body.pending && r.body.id && r.body.op, JSON.stringify(r.body));
  assert.ok(!writes().some((c) => c.path.startsWith("/groups/")), "nobody added before the team exists");
  const slow = r.body;
  r = await post("groupop", { domain: DOMAIN, id: slow.id, op: slow.op, owners: [T1, T2], members: [K1] });
  assert.ok(r.status === 200 && r.body.pending === true, "still pending");
  opState = "succeeded";
  r = await post("groupop", { domain: DOMAIN, id: slow.id, op: slow.op, owners: [T1, T2], members: [K1] });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.ok(r.body.ok && !r.body.pending);
  assert.deepStrictEqual(groupsDb[slow.id].owners.map((x) => x.id).sort(), ["u-t1", "u-t2"]);
  assert.deepStrictEqual(groupsDb[slow.id].members.map((x) => x.id).sort(), ["u-k1", "u-t1", "u-t2"], "added once it succeeded");
  opState = "failed";
  r = await post("groupop", { domain: DOMAIN, id: slow.id, op: slow.op, owners: [T1], members: [] });
  assert.strictEqual(r.status, 502); opState = "succeeded";
  const OTHER = "33333333-3333-4333-8333-333333333333";
  groupsDb[OTHER] = O365(OTHER, "Elsewhere", { owners: [{ id: "u-x", userPrincipalName: "anna@sciencebug.net", displayName: "Anna" }] });
  r = await post("groupop", { domain: DOMAIN, id: OTHER, op: slow.op, owners: [T1], members: [K1] });
  assert.ok(r.status === 403, "a finished creation cannot be pointed at another school's group: " + r.status);

  // Reading a team: the school's own, Teams or Microsoft 365 groups only.
  r = await call({ action: "group", query: { domain: DOMAIN, id: gid }, user: DOMADMIN, roles: IT });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.deepStrictEqual([r.body.group.name, r.body.group.kind, r.body.owners.length, r.body.members.length], ["G5 Math 2026", "class", 2, 4]);
  assert.ok(r.body.members.every((m) => m.editable), "the school's own accounts are editable");
  r = await call({ action: "group", query: { domain: DOMAIN, id: G3 }, user: DOMADMIN, roles: IT });
  assert.strictEqual(r.status, 403, "another school's team");
  r = await call({ action: "group", query: { domain: DOMAIN, id: G2 }, user: DOMADMIN, roles: IT });
  assert.strictEqual(r.status, 400, "a security group is not managed here");
  r = await call({ action: "group", query: { domain: DOMAIN, id: G5 }, user: ADMIN, roles: ["admin"] });
  assert.strictEqual(r.status, 400, "never a role-assignable group, not even for the sysadmin");
  r = await call({ action: "group", query: { domain: DOMAIN, id: G3 }, user: ADMIN, roles: ["admin"] });
  assert.strictEqual(r.status, 200, "the system administrator may read any team");

  // People: the IT 管理员 adds the school's accounts, not another school's; removes only the school's own; keeps an owner.
  teamCalls.length = 0;
  r = await post("groupmembers", { domain: DOMAIN, id: G1, addMembers: [OX] });
  assert.strictEqual(r.status, 400); assert.ok(r.body.problems.some((x) => /not an account of this school/.test(x)));
  r = await post("groupmembers", { domain: DOMAIN, id: G1, addMembers: [K1, K2], addOwners: [T1] });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.deepStrictEqual(groupsDb[G1].members.map((x) => x.id).sort(), ["u-elaine", "u-k1", "u-k2", "u-lei", "u-t1"]);
  assert.deepStrictEqual(groupsDb[G1].owners.map((x) => x.id).sort(), ["u-lei", "u-t1"]);
  r = await post("groupmembers", { domain: DOMAIN, id: G1, removeMembers: [K2] });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.ok(!groupsDb[G1].members.some((x) => x.id === "u-k2"), "removed");
  r = await post("groupmembers", { domain: DOMAIN, id: G1, removeOwners: ["lei@" + DOMAIN, T1] });
  assert.strictEqual(r.status, 400); assert.ok(r.body.problems.some((x) => /keeps an owner/.test(x)), "the last owner stays: " + JSON.stringify(r.body));
  r = await post("groupmembers", { domain: DOMAIN, id: G1, removeOwners: [T1] });
  assert.strictEqual(r.status, 200); assert.ok(groupsDb[G1].members.some((x) => x.id === "u-t1"), "demoted, still a member");
  r = await post("groupmembers", { domain: DOMAIN, id: G1, removeMembers: ["ghost@" + DOMAIN] });
  assert.strictEqual(r.status, 400, "not in the team");
  r = await post("groupmembers", { domain: DOMAIN, id: G3, addMembers: [K1] });
  assert.strictEqual(r.status, 403, "another school's team");
  r = await post("groupmembers", { domain: DOMAIN, id: G2, addMembers: [K1] });
  assert.strictEqual(r.status, 400, "not a security group");
  r = await post("groupmembers", { domain: DOMAIN, id: G1 });
  assert.strictEqual(r.status, 400, "nothing to change");
  r = await call({ action: "groupmembers", method: "POST", body: { domain: DOMAIN, id: G1, addMembers: [K1] }, user: `teacher@${DOMAIN}`, roles: [] });
  assert.strictEqual(r.status, 403, "no role, no management");

  // 归档 / 删除团队 (Rick, 2026-10-18): the system administrator only; the exact name confirms a delete;
  // the deleted group leaves every school's cache at once.
  r = await call({ action: "group", query: { domain: DOMAIN, id: G1 }, user: ADMIN, roles: ["admin"] });
  assert.strictEqual(r.body.archived, false); assert.strictEqual(r.body.canDelete, true);
  r = await call({ action: "group", query: { domain: DOMAIN, id: G1 }, user: DOMADMIN, roles: IT }); assert.strictEqual(r.body.canDelete, false, "the IT 管理员 sees no delete");
  r = await post("grouparchive", { domain: DOMAIN, id: G1, archive: true });
  assert.strictEqual(r.status, 403, "the IT 管理员 cannot archive");
  r = await post("grouparchive", { domain: DOMAIN, id: G1, archive: true }, ADMIN, ["admin"]);
  assert.strictEqual(r.status, 200, JSON.stringify(r.body)); assert.strictEqual(groupsDb[G1].archived, true);
  r = await call({ action: "group", query: { domain: DOMAIN, id: G1 }, user: ADMIN, roles: ["admin"] }); assert.strictEqual(r.body.archived, true);
  r = await call({ action: "groups", query: { domain: DOMAIN }, user: ADMIN, roles: ["admin"] });
  assert.ok(r.body.groups.some((g) => g.id === G1 && g.archived === true), "the list shows the archived team: " + JSON.stringify(r.body.groups.map((g) => [g.id, g.archived])));
  r = await post("grouparchive", { domain: DOMAIN, id: G1, archive: false }, ADMIN, ["admin"]);
  assert.strictEqual(r.status, 200); assert.strictEqual(groupsDb[G1].archived, false);
  r = await post("grouparchive", { domain: DOMAIN, id: G2, archive: true }, ADMIN, ["admin"]); assert.strictEqual(r.status, 400, "a security group is not a team");
  const G9 = "aaaaaaaa-aaaa-4aaa-8aaa-000000000009";
  groupsDb[G9] = O365(G9, "Old club", { owners: [{ id: "u-lei", userPrincipalName: "lei@" + DOMAIN, displayName: "Lei Dong" }], members: [{ id: "u-lei", userPrincipalName: "lei@" + DOMAIN, displayName: "Lei Dong" }] });
  { const d = JSON.parse(blobs[DOMAIN + ".json"]); d.users.forEach((x) => { if (x.upn === "lei@" + DOMAIN) x.groups = (x.groups || []).concat([{ id: G9, name: "Old club", kind: "team" }]); }); blobs[DOMAIN + ".json"] = JSON.stringify(d); }
  r = await call({ action: "group", method: "DELETE", body: { domain: DOMAIN, id: G9 }, user: DOMADMIN, roles: IT });
  assert.strictEqual(r.status, 403, "the IT 管理员 cannot delete"); assert.ok(groupsDb[G9]);
  assert.ok(JSON.parse(blobs[DOMAIN + ".json"]).users.some((x) => (x.groups || []).some((g) => g.id === G9)), "the cache lists the team before");
  r = await call({ action: "group", method: "DELETE", body: { domain: DOMAIN, id: G9 }, user: ADMIN, roles: ["admin"] });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body)); assert.ok(!groupsDb[G9], "deleted at Microsoft"); assert.strictEqual(r.body.name, "Old club");
  assert.ok(!JSON.parse(blobs[DOMAIN + ".json"]).users.some((x) => (x.groups || []).some((g) => g.id === G9)), "and gone from the school's cache at once");
  assert.ok(auditLines.some((e) => e.action === "group.delete" && e.target === G9 && e.name === "Old club" && e.owners.includes("lei@" + DOMAIN)), "audited with the name and owners");
  r = await call({ action: "group", method: "DELETE", body: { domain: DOMAIN, id: G9 }, user: ADMIN, roles: ["admin"] });
  assert.strictEqual(r.status, 404, "deleting twice: Microsoft no longer knows it");

  // Searching for people to add: the school's own cache; tenant-wide only when allowed.
  r = await call({ action: "usersearch", query: { domain: DOMAIN, q: "lei" }, user: DOMADMIN, roles: IT });
  assert.strictEqual(r.status, 200); assert.ok(r.body.tenant === false && r.body.users.some((x) => x.upn === "lei@" + DOMAIN) && r.body.users.every((x) => x.upn.endsWith("@" + DOMAIN)), JSON.stringify(r.body));

  // The system administrator opens the tenant to this school: now another school's account may be added.
  r = await call({ action: "groupscope", method: "PUT", body: { domain: DOMAIN, tenantUsers: true }, user: DOMADMIN, roles: IT });
  assert.strictEqual(r.status, 403, "the IT 管理员 cannot widen their own reach");
  r = await call({ action: "groupscope", method: "PUT", body: { domain: DOMAIN, tenantUsers: true }, user: ADMIN, roles: ["admin"] });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.strictEqual(institutions.institutions[DOMAIN].groupTenant, true);
  r = await call({ action: "domains", user: DOMADMIN, roles: IT });
  assert.deepStrictEqual([r.body.domains[0].can.groups, r.body.domains[0].can.groupTenant, r.body.domains[0].can.groupScope], [true, true, false]);
  // the switch shows the school's stored setting, not the caller's own reach (Rick, 2026-10-18: it looked
  // ticked again for the system administrator, whose groupTenant is always true)
  r = await call({ action: "groupscope", method: "PUT", body: { domain: DOMAIN, tenantUsers: false }, user: ADMIN, roles: ["admin"] });
  r = await call({ action: "domains", user: ADMIN, roles: ["admin"] });
  assert.deepStrictEqual([r.body.domains[0].can.groupTenant, r.body.domains[0].can.groupTenantSchool], [true, false], "admin may add anyone, yet the school's switch is off");
  r = await call({ action: "groupscope", method: "PUT", body: { domain: DOMAIN, tenantUsers: true }, user: ADMIN, roles: ["admin"] });
  r = await call({ action: "domains", user: ADMIN, roles: ["admin"] }); assert.strictEqual(r.body.domains[0].can.groupTenantSchool, true);
  r = await call({ action: "groupoptions", query: { domain: DOMAIN }, user: DOMADMIN, roles: IT });
  assert.ok(r.body.tenantUsers && r.body.allowedByAdmin && !r.body.canSetScope);
  r = await call({ action: "usersearch", query: { domain: DOMAIN, q: "xavier" }, user: DOMADMIN, roles: IT });
  assert.ok(r.body.tenant && r.body.users.some((x) => x.upn === OX), "tenant-wide search: " + JSON.stringify(r.body));
  r = await post("groupmembers", { domain: DOMAIN, id: G1, addMembers: [OX] });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.ok(groupsDb[G1].members.some((x) => x.id === "u-ox"));
  r = await post("group", body15({ type: "standard", name: "Joint club", members: [OX] }));
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  r = await post("groupmembers", { domain: DOMAIN, id: G1, addMembers: ["g2_gmail.com#EXT#@" + DOMAIN] });
  assert.strictEqual(r.status, 400, "guests stay refused even with tenant scope");
  r = await call({ action: "institution", method: "PUT", body: { domain: DOMAIN, name: "智慧园书院", nameEn: "Wisdom Garden" }, user: ADMIN, roles: ["admin"] });
  assert.strictEqual(r.status, 200); assert.strictEqual(institutions.institutions[DOMAIN].groupTenant, true, "renaming the school keeps its group scope");
  r = await call({ action: "groupscope", method: "PUT", body: { domain: DOMAIN, tenantUsers: false }, user: ADMIN, roles: ["admin"] });
  assert.strictEqual(r.status, 200); assert.ok(!institutions.institutions[DOMAIN].groupTenant && institutions.institutions[DOMAIN].name === "智慧园书院", "switched off, the names stay");
  r = await post("groupmembers", { domain: DOMAIN, id: G1, addMembers: [OX] });
  assert.strictEqual(r.status, 400, "back to the school's own accounts");

  console.log("domain: all assertions passed");
})().catch((e) => { console.error(e); process.exit(1); });
