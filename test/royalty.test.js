// 版税结算表 (api/shared/royalty.js): per publisher per calendar quarter — sales,
// royalty due (Airtable's amount when present, else total × the SKU's rate), units.
const assert = require("assert");
const path = require("path");
const Module = require("module");
const realResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) { if (request === "@azure/storage-blob") return "@azure/storage-blob"; return realResolve.call(this, request, parent, ...rest); };
require.cache["@azure/storage-blob"] = { id: "@azure/storage-blob", filename: "@azure/storage-blob", loaded: true, exports: { BlobServiceClient: { fromConnectionString() { throw new Error("no storage in test"); } } } };
const R = require(path.join(__dirname, "..", "api", "shared", "royalty.js"));

const equip = {
  syncedAt: "2026-10-08T00:00:00Z",
  curriculums: [{ sku: "IEW-1", publisher: "IEW", royaltyRate: 0.15, royaltyRecipient: "IEW Inc." }, { sku: "CEFF-1", publisher: "CEFF", royaltyRate: 0 }, { sku: "OAK-1", publisher: "Oak Tree", royaltyRate: 0.75 }],
  orders: [
    { date: "2026-09-20", items: [{ sku: "IEW-1", publisher: "IEW", qty: 2, total: 1296, royalty: { "Royalty Rate": 0.15, "Royalty Amount": 194.4 } }, { sku: "CEFF-1", publisher: "CEFF", qty: 1, total: 58, royalty: { "Royalty Rate": 0 } }] },
    { date: "2026-07-02", items: [{ sku: "IEW-1", publisher: "IEW", qty: 1, total: 648, royalty: {} }] },          // no bag → SKU rate 0.15 → 97.2
    { date: "2026-04-10", items: [{ sku: "OAK-1", publisher: "Oak Tree", qty: 3, total: 300, royalty: {} }] },
    { date: "2026-04-11", items: [{ sku: "NEW-1", publisher: "Mystery", qty: 1, total: 100, royalty: {} }] },      // no rate anywhere → unknown
    { date: "2023-01-01", items: [{ sku: "IEW-1", publisher: "IEW", qty: 9, total: 9999, royalty: {} }] },        // outside the window
  ],
};
const t = R.build(equip, { quarters: 4, now: Date.parse("2026-10-08T00:00:00Z") });
assert.deepStrictEqual(t.quarters, ["2026 Q1", "2026 Q2", "2026 Q3", "2026 Q4"]);
const iew = t.publishers.find((p) => p.publisher === "IEW");
assert.strictEqual(iew.recipient, "IEW Inc.");
assert.deepStrictEqual(iew.rates, [0.15]);
assert.strictEqual(iew.cells["2026 Q3"].sales, 1944);
assert.ok(Math.abs(iew.cells["2026 Q3"].royalty - (194.4 + 97.2)) < 1e-9, "Airtable's amount where present, total × rate otherwise");
assert.strictEqual(iew.cells["2026 Q3"].units, 3);
assert.strictEqual(iew.total, 1944, "2023 is outside the window");
assert.strictEqual(t.publishers.find((p) => p.publisher === "CEFF").cells["2026 Q3"].royalty, 0, "own titles: nothing to pay");
assert.ok(Math.abs(t.publishers.find((p) => p.publisher === "Oak Tree").cells["2026 Q2"].royalty - 225) < 1e-9);
const m = t.publishers.find((p) => p.publisher === "Mystery");
assert.strictEqual(m.cells["2026 Q2"].unknown, 1, "a line with no rate anywhere is counted as unknown, not as zero royalty");
assert.strictEqual(t.totals["2026 Q2"].unknown, 1);
assert.strictEqual(t.totals["2026 Q3"].sales, 1944 + 58);
assert.strictEqual(t.publishers[0].publisher, "IEW", "largest first");
assert.strictEqual(R.quarterOf("2026-12-31"), "2026 Q4");
console.log("royalty: all assertions passed");
