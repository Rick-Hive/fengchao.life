// 补充资料 (api/me extra) and the family link in people.json, against a fake
// Graph and an in-memory people.json.
//
// Run with:  node test/extra.test.js
//
// The vocabularies are enforced; a child's account must be a real, non-guest
// account of the directory and not the parent's own; saving links parent and
// child both ways and gives each a default 身份; taking a child off the form
// unlinks that child but keeps links an administrator made; the summary
// carries hive.extra and the vocabularies.
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

// In-memory people.json.
const people = require(path.join(__dirname, "..", "api", "shared", "people.js"));
let store = { people: { "kid.one@example.edu": { identity: "学生", linked: ["admin.linked@example.edu"], by: "admin", at: "2026-09-01T00:00:00Z" } } };
people.readPeople = async () => JSON.parse(JSON.stringify(store));
people.writePeople = async (doc) => { store = JSON.parse(JSON.stringify(doc)); };
const jsonstore = require(path.join(__dirname, "..", "api", "shared", "jsonstore.js"));
jsonstore.update = async (name, fallback, mutate) => { const doc = JSON.parse(JSON.stringify(store)); const result = await mutate(doc); if (result !== false) store = JSON.parse(JSON.stringify(doc)); return { doc, result, written: result !== false }; };

const PARENT = "parent.one@example.edu", PID = "p-0001";
const users = {
  [PARENT]: { id: PID, userPrincipalName: PARENT, displayName: "Parent One", userType: "Member", otherMails: [] },
  "kid.one@example.edu": { id: "k1", userPrincipalName: "kid.one@example.edu", displayName: "Kid One", userType: "Member" },
  "kid.two@example.edu": { id: "k2", userPrincipalName: "kid.two@example.edu", displayName: "Kid Two", userType: "Member" },
  "guest_gmail.com#ext#@example.edu": { id: "g1", userPrincipalName: "guest_gmail.com#EXT#@example.edu", displayName: "G", userType: "Guest" },
};
global.fetch = async function (url, opts) {
  const u = new URL(String(url));
  const method = (opts && opts.method) || "GET";
  const json = (status, obj) => ({ ok: status < 400, status, headers: { get: () => null }, text: async () => (obj == null ? "" : JSON.stringify(obj)), json: async () => obj });
  if (u.hostname === "login.microsoftonline.com") return json(200, { access_token: "tok", expires_in: 3600 });
  const p = decodeURIComponent(u.pathname.replace(/^\/v1\.0/, ""));
  const m = p.match(/^\/users\/([^/]+)$/);
  if (method === "GET" && m) { const hit = users[m[1].toLowerCase()]; return hit ? json(200, hit) : json(404, { error: { code: "Request_ResourceNotFound" } }); }
  if (method === "GET" && p === `/users/${PID}/authentication/methods`) return json(200, { value: [{ "@odata.type": "#microsoft.graph.passwordAuthenticationMethod", id: "pw" }] });
  return json(500, { error: { code: "unhandled", message: method + " " + p } });
};

const meFn = require(path.join(__dirname, "..", "api", "me", "index.js"));
function principal(user) { return Buffer.from(JSON.stringify({ identityProvider: "aad", userId: "x", userDetails: user, userRoles: ["anonymous", "authenticated"] })).toString("base64"); }
async function call({ action, method = "GET", body = null }) {
  const context = { log: Object.assign(() => {}, { error() {}, warn() {} }), res: null };
  await meFn(context, { method, params: { action }, query: {}, body, headers: { "x-ms-client-principal": principal(PARENT), host: "fengchao.life", origin: "https://fengchao.life" } });
  return context.res;
}

(async () => {
  // 1. Summary carries the Hive block and vocabularies.
  let r = await call({ action: "summary" });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.strictEqual(r.body.hive.extra, null);
  assert.deepStrictEqual(r.body.hive.vocab.models, ["古典教育", "BJU", "Abeka", "混合教学法", "不清楚", "其它"]);
  assert.deepStrictEqual(r.body.hive.vocab.topics, ["教材", "课程", "教师培训", "家长-亲子培训", "海外留学", "大学路径", "双学分/AP课程", "标化考试", "其它"]);
  assert.ok(r.body.hive.vocab.higherEd.includes("2+2混合制大学"));
  assert.strictEqual(r.body.hive.canEditName, false, "an ordinary person does not edit the display name");

  // 1b. Display name: refused for an ordinary person, the server is the gate.
  r = await call({ action: "profile", method: "PATCH", body: { displayName: "Someone Else" } });
  assert.strictEqual(r.status, 400);
  assert.ok(/displayName: only/.test(r.body.problems.join("\n")));

  // 2. Validation: unknown vocabulary, 其它 without text, own account, unknown account, guest, other-account checks.
  r = await call({ action: "extra", method: "PATCH", body: { roles: ["家长", "校长"], topics: ["教师培训", "瑜伽", "其它"], otherAccounts: [PARENT, "nobody@example.edu"], children: [{ age: 10, grade: "5", model: "其它" }, { account: PARENT }, { account: "guest_gmail.com#EXT#@example.edu" }, { higherEd: ["其它"] }] } });
  assert.strictEqual(r.status, 400);
  const pr = r.body.problems.join("\n");
  assert.ok(/roles: unknown item 校长/.test(pr), pr);
  assert.ok(/topics: unknown item 瑜伽/.test(pr), pr);
  assert.ok(/topicsOther: please say which/.test(pr), pr);
  assert.ok(/modelOther/.test(pr), pr);
  assert.ok(/higherEdOther/.test(pr), pr);
  assert.ok(/your own account/.test(pr), pr);
  assert.ok(/otherAccounts: that is this account itself/.test(pr), pr);
  assert.ok(/otherAccounts: nobody@example.edu is not an account/.test(pr), pr);
  assert.ok(/guest account/.test(pr), pr);
  assert.strictEqual(store.people[PARENT], undefined, "nothing written on a refused form");

  // 3. A good save: stored, parent ↔ children linked, other account linked, identities defaulted, empty child card dropped.
  r = await call({ action: "extra", method: "PATCH", body: {
    roles: ["家长", "其它"], rolesOther: "教会同工", topics: ["教材", "标化考试", "教材", "其它"], topicsOther: "科学实验",
    otherAccounts: ["Kid.Two@example.edu", "", "kid.two@example.edu"],
    children: [
      { name: "大宝", age: "12", grade: "6", schooling: "在家教育", model: "古典教育", higherEd: ["欧美大学", "2+2混合制大学"], account: "Kid.One@example.edu" },
      { age: 8, grade: "2", schooling: "国际学校", model: "其它", modelOther: "Sonlight", higherEd: ["未定"] },
      {},
    ] } });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.deepStrictEqual(r.body.extra.roles, ["家长", "其它"]);
  assert.strictEqual(r.body.extra.rolesOther, "教会同工");
  assert.deepStrictEqual(r.body.extra.topics, ["教材", "标化考试", "其它"]);
  assert.strictEqual(r.body.extra.topicsOther, "科学实验");
  assert.deepStrictEqual(r.body.extra.otherAccounts, ["kid.two@example.edu"]);
  assert.strictEqual(r.body.extra.children.length, 2);
  assert.strictEqual(r.body.extra.children[0].age, 12);
  assert.deepStrictEqual(r.body.extra.children[0].higherEd, ["欧美大学", "2+2混合制大学"]);
  assert.strictEqual(r.body.extra.children[0].account, "kid.one@example.edu");
  assert.strictEqual(r.body.extra.children[1].modelOther, "Sonlight");
  assert.deepStrictEqual(r.body.linked.sort(), ["kid.one@example.edu", "kid.two@example.edu"]);
  assert.strictEqual(r.body.identity, "家长");
  assert.deepStrictEqual(store.people["kid.one@example.edu"].linked, ["admin.linked@example.edu", PARENT], "admin's link kept, parent added");
  assert.deepStrictEqual(store.people["kid.two@example.edu"].linked, [PARENT], "the other account points back");
  assert.strictEqual(store.people["kid.two@example.edu"].identity, undefined, "an own account gets no identity");

  // 4. The summary now shows it.
  r = await call({ action: "summary" });
  assert.strictEqual(r.body.hive.identity, "家长");
  assert.strictEqual(r.body.hive.extra.children.length, 2);

  // 5. Taking the other account and a child off the form unlinks them; kid.one and the admin's link stay.
  r = await call({ action: "extra", method: "PATCH", body: { roles: ["家长"], topics: [], otherAccounts: [], children: [{ name: "大宝", age: 12, account: "kid.one@example.edu" }] } });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.deepStrictEqual(r.body.linked, ["kid.one@example.edu"]);
  assert.deepStrictEqual(store.people["kid.two@example.edu"].linked, [], "other account unlinked");
  assert.deepStrictEqual(store.people["kid.one@example.edu"].linked, ["admin.linked@example.edu", PARENT]);
  assert.strictEqual(r.body.extra.rolesOther, "", "其它 text dropped when 其它 is not ticked");

  // 6. Too many children.
  r = await call({ action: "extra", method: "PATCH", body: { children: Array.from({ length: 9 }, (_, i) => ({ age: i + 3 })) } });
  assert.strictEqual(r.status, 400);

  console.log("extra: all assertions passed");
})().catch((e) => { console.error(e); process.exit(1); });
