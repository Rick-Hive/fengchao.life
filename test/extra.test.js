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
  assert.deepStrictEqual(r.body.hive.vocab.models, ["古典教育", "BJU", "Abeka", "混合", "其它"]);
  assert.ok(r.body.hive.vocab.needs.includes("双学分/AP课程"));

  // 2. Validation: unknown vocabulary, 其它 without text, own account, unknown account, guest.
  r = await call({ action: "extra", method: "PATCH", body: { city: "南京", needs: ["教材", "瑜伽"], children: [{ age: 10, grade: "5", model: "其它" }, { account: PARENT }, { account: "nobody@example.edu" }, { account: "guest_gmail.com#EXT#@example.edu" }] } });
  assert.strictEqual(r.status, 400);
  const pr = r.body.problems.join("\n");
  assert.ok(/needs: unknown item 瑜伽/.test(pr), pr);
  assert.ok(/modelOther/.test(pr), pr);
  assert.ok(/your own account/.test(pr), pr);
  assert.ok(/nobody@example.edu is not an account/.test(pr), pr);
  assert.ok(/guest account/.test(pr), pr);
  assert.strictEqual(store.people[PARENT], undefined, "nothing written on a refused form");

  // 3. A good save: stored, parent ↔ children linked, identities defaulted, empty child card dropped.
  r = await call({ action: "extra", method: "PATCH", body: {
    needs: ["教材", "其它", "教材"], needsOther: "英文写作辅导",
    children: [
      { name: "大宝", age: "12", grade: "6", schooling: "在家教育", model: "古典教育", higherEd: "海外上大学", account: "Kid.One@example.edu" },
      { age: 8, grade: "2", schooling: "基督教学校", model: "其它", modelOther: "Sonlight", higherEd: "未定", account: "kid.two@example.edu" },
      {},
    ] } });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.deepStrictEqual(r.body.extra.needs, ["教材", "其它"]);
  assert.strictEqual(r.body.extra.needsOther, "英文写作辅导");
  assert.strictEqual(r.body.extra.children.length, 2);
  assert.strictEqual(r.body.extra.children[0].age, 12);
  assert.strictEqual(r.body.extra.children[0].account, "kid.one@example.edu");
  assert.strictEqual(r.body.extra.children[1].modelOther, "Sonlight");
  assert.deepStrictEqual(r.body.linked, ["kid.one@example.edu", "kid.two@example.edu"]);
  assert.strictEqual(r.body.identity, "家长");
  assert.deepStrictEqual(r.body.childNames, { "kid.one@example.edu": "Kid One", "kid.two@example.edu": "Kid Two" });
  assert.deepStrictEqual(store.people["kid.one@example.edu"].linked, ["admin.linked@example.edu", PARENT], "admin's link kept, parent added");
  assert.deepStrictEqual(store.people["kid.two@example.edu"].linked, [PARENT]);
  assert.strictEqual(store.people["kid.two@example.edu"].identity, "学生");

  // 4. The summary now shows it.
  r = await call({ action: "summary" });
  assert.strictEqual(r.body.hive.identity, "家长");
  assert.strictEqual(r.body.hive.extra.children.length, 2);
  assert.deepStrictEqual(r.body.hive.linked, ["kid.one@example.edu", "kid.two@example.edu"]);

  // 5. Taking kid.two off the form unlinks both ways; kid.one and the admin's link stay.
  r = await call({ action: "extra", method: "PATCH", body: { needs: [], children: [{ name: "大宝", age: 12, account: "kid.one@example.edu" }] } });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.deepStrictEqual(r.body.linked, ["kid.one@example.edu"]);
  assert.deepStrictEqual(store.people["kid.two@example.edu"].linked, [], "kid.two unlinked (the 学生 identity it was given stays)");
  assert.deepStrictEqual(store.people["kid.one@example.edu"].linked, ["admin.linked@example.edu", PARENT]);
  assert.strictEqual(r.body.extra.needsOther, "", "其它 text dropped when 其它 is not ticked");

  // 6. Too many children.
  r = await call({ action: "extra", method: "PATCH", body: { children: Array.from({ length: 9 }, (_, i) => ({ age: i + 3 })) } });
  assert.strictEqual(r.status, 400);

  console.log("extra: all assertions passed");
})().catch((e) => { console.error(e); process.exit(1); });
