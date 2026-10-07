// 许可池与分配 (api/shared/licenses.js): pools, allocations to people and to institutions
// (child pools), balances, revocation, expiry, and the dashboard view.
const assert = require("assert");
const path = require("path");
const Module = require("module");
const realResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) { if (request === "@azure/storage-blob") return "@azure/storage-blob"; return realResolve.call(this, request, parent, ...rest); };
require.cache["@azure/storage-blob"] = { id: "@azure/storage-blob", filename: "@azure/storage-blob", loaded: true, exports: { BlobServiceClient: { fromConnectionString() { throw new Error("no storage in test"); } } } };
const L = require(path.join(__dirname, "..", "api", "shared", "licenses.js"));

const now = Date.parse("2026-10-08T00:00:00Z");
const doc = { pools: [], allocations: [], nextPool: 1, nextAlloc: 1 };
// CEFF issues BES 100 seats of a title, valid a year
const root = L.createPool(doc, { sku: "ceff-csb", title: "儿童圣经故事", qty: 100, validFrom: "2026-09-01", validTo: "2027-08-31", holder: { type: "hive", name: "Hive" }, source: { orderId: "Manual order 40" } }, "pd", now);
assert.strictEqual(root.id, "LP-000001"); assert.strictEqual(root.sku, "CEFF-CSB");
assert.strictEqual(L.balance(doc, root), 100);
// 30 to an African partner → a child pool held by them, same dates, parent set
const toPartner = L.allocate(doc, { poolId: root.id, to: { type: "institution", domain: "partner.africa", name: "Africa Partner" }, qty: 30 }, "pd", now);
assert.strictEqual(toPartner.childPool, "LP-000002");
const child = doc.pools.find((p) => p.id === "LP-000002");
assert.strictEqual(child.parent, root.id); assert.strictEqual(child.qty, 30); assert.strictEqual(child.validTo, "2027-08-31"); assert.strictEqual(child.holder.domain, "partner.africa");
assert.strictEqual(L.balance(doc, root), 70);
// the partner gives 2 seats to a person; a person allocation from the root too
L.allocate(doc, { poolId: child.id, to: { type: "person", crmId: "HC-000010", name: "Amara" }, qty: 2 }, "partner-admin", now + 1);
L.allocate(doc, { poolId: root.id, to: { type: "person", crmId: "HC-000001", name: "Mei Wang" }, qty: 1 }, "om", now + 2);
assert.strictEqual(L.balance(doc, child), 28); assert.strictEqual(L.balance(doc, root), 69);
// more than the balance → refused with the balance
assert.throws(() => L.allocate(doc, { poolId: child.id, to: { type: "person", crmId: "HC-000011" }, qty: 50 }, "x", now), (e) => e.code === "insufficient" && e.balance === 28);
// revoking the partner's pool while it still has allocations is refused; revoking the person's seat first works
assert.throws(() => L.revoke(doc, toPartner.id, "pd", now), (e) => e.code === "has_children");
const amara = doc.allocations.find((a) => a.to.crmId === "HC-000010");
L.revoke(doc, amara.id, "partner-admin", now + 3, "left the school");
assert.ok(amara.revokedAt && amara.revokeNote === "left the school");
assert.strictEqual(L.balance(doc, child), 30, "a revoked seat returns to the pool");
L.revoke(doc, toPartner.id, "pd", now + 4);
assert.ok(child.revokedAt, "the child pool goes with its allocation");
assert.strictEqual(L.balance(doc, root), 99);
// expiry
const old = L.createPool(doc, { sku: "IEW-1", qty: 5, validTo: "2026-01-31" }, "pd", now);
assert.throws(() => L.allocate(doc, { poolId: old.id, to: { type: "person", crmId: "HC-000001" }, qty: 1 }, "x", now), (e) => e.code === "expired");
const soon = L.createPool(doc, { sku: "IEW-1", qty: 5, validTo: "2026-12-01" }, "pd", now);
// the view
const v = L.view(doc, { now, regionOf: (d) => (d === "partner.africa" ? "africa" : "cn") });
assert.strictEqual(v.pools.length, 3, "root, expired, soon — the revoked child is out");
assert.deepStrictEqual(v.summary.bySku.map((s) => [s.sku, s.qty, s.allocated]), [["CEFF-CSB", 100, 1], ["IEW-1", 10, 0]]);
assert.strictEqual(v.summary.users, 1, "Mei is the one person with a seat");
assert.strictEqual(v.summary.expiringSoon, 1); assert.strictEqual(v.summary.expired, 1);
assert.strictEqual(v.summary.growth.months.length, 12); assert.strictEqual(v.summary.growth.users[11], 1);
assert.deepStrictEqual(v.summary.byRegion, { cn: 1 });
console.log("licenses: all assertions passed");
