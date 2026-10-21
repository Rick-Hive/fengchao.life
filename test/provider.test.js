// 蜂巢课程负责人 / Hive Course Leader (api/shared/provider.js, v3 第二批 ③): the explicit provider:<key> role and the
// school leader's inference give the same hives; the role is assignable by the system administrator only, labelled,
// and makes the account a "school account" (no family orders).
//
// Run with:  node test/provider.test.js
const assert = require("assert");
const path = require("path");
const Module = require("module");
const realResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) { if (request === "@azure/storage-blob") return "@azure/storage-blob"; return realResolve.call(this, request, parent, ...rest); };
require.cache["@azure/storage-blob"] = { id: "@azure/storage-blob", filename: "@azure/storage-blob", loaded: true, exports: { BlobServiceClient: { fromConnectionString() { throw new Error("no storage in tests"); } } } };
const R = (...p) => path.join(__dirname, "..", ...p);
const P = require(R("api", "shared", "provider.js"));
const roles = require(R("api", "shared", "roles.js"));

const snap = { courses: [{ id: "c1", code: "KXC-MATH-7", school: { name: "Kids X Center", abbr: "KXC" } }, { id: "c2", code: "IEW-W-1", school: { name: "IEW Inc.", abbr: "IEW" } }, { id: "c3", code: "X", school: null }],
  private: { schoolRouting: { KXC: { name: "Kids X Center", abbr: "KXC", domain: "kxc.edu" }, IEW: { name: "IEW Inc.", abbr: "IEW", domain: "" }, BES: { name: "BES", abbr: "BES", domain: "bes.edu" } } } };

assert.deepStrictEqual(P.hivesOf(["provider:IEW", "x"], snap), [{ key: "IEW", name: "IEW Inc.", abbr: "IEW", domain: "", via: "role" }], "the explicit role");
assert.deepStrictEqual(P.hivesOf(["domain_leader:kxc.edu"], snap).map((h) => [h.key, h.via]), [["KXC", "leader"]], "the school's leader by the routing domain");
assert.deepStrictEqual(P.hivesOf(["provider:KXC", "domain_leader:kxc.edu", "provider:IEW"], snap).map((h) => h.key), ["KXC", "IEW"], "once each, explicit first");
assert.deepStrictEqual(P.hivesOf(["provider:NEW"], snap), [{ key: "NEW", name: "", abbr: "", domain: "", via: "role" }], "a key not routed yet still counts (the sync fills the name later)");
assert.deepStrictEqual(P.keysOf(["staff:sales"], snap), []);
assert.deepStrictEqual(P.domainsOf(["provider:KXC", "provider:IEW"], snap), ["kxc.edu"], "domains: only the hives that have one");
assert.ok(P.isProvider(["provider:IEW"], snap) && !P.isProvider(["domain_it:kxc.edu"], snap), "IT administrators are not leaders");
assert.ok(P.ownsCourse(["KXC"], snap.courses[0]) && !P.ownsCourse(["KXC"], snap.courses[1]) && !P.ownsCourse(["KXC"], snap.courses[2]) && !P.ownsCourse(["KXC"], null));
assert.ok(P.ownsOrder(["KXC"], { hives: [{ key: "KXC" }] }) && !P.ownsOrder(["KXC"], { hives: [{ key: "BES" }] }) && !P.ownsOrder([], { hives: [{ key: "KXC" }] }));
assert.deepStrictEqual(P.allHives(snap).map((h) => h.key), ["BES", "IEW", "KXC"], "the picker's list, by abbreviation");
assert.strictEqual(P.courseKey({ school: { name: "Kids' X-Center" } }), "KIDSXCENTER", "the key is hive.hiveKey() of the abbreviation or name");

// the role itself
assert.ok(roles.isAssignable("provider:KXC") && roles.isAssignable("provider:中文"), "assignable");
assert.ok(!roles.isAssignable("provider:kxc") && !roles.isAssignable("provider:"), "keys are upper-case hive keys");
assert.strictEqual(roles.roleLabel("provider:KXC", "zh"), "蜂巢课程负责人 · KXC"); assert.strictEqual(roles.roleLabel("provider:KXC", "en"), "Hive Course Leader · KXC");
assert.ok(roles.canAssign(["admin"], "provider:KXC") && !roles.canAssign(["staff:ceo"], "provider:KXC"), "the system administrator gives it, the CEO does not");
assert.ok(roles.isSchoolAccount(["provider:IEW"]), "a leader never orders for a family");
assert.deepStrictEqual(roles.managedDomains(["provider:KXC"]), [], "no accounts by this role");
console.log("provider: all assertions passed");
