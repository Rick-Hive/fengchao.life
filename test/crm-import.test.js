// Recovering course orders from a Teams channel export (api/shared/teamsOrders.js)
// and reading the Equip base (api/shared/equip.js).
//
// Run with:  node test/crm-import.test.js
//
// The messages are produced by the real template code (api/shared/messages.js),
// so the parser is tested against exactly what the channel holds; a stale
// hand-written sample would drift. An order spanning two hives is announced
// twice and must come back as one record; the snapshot makes the items
// bilingual whichever language the family ordered in.
const assert = require("assert");
const path = require("path");
const Module = require("module");

const realResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (request === "@azure/storage-blob") return "@azure/storage-blob";
  return realResolve.call(this, request, parent, ...rest);
};
require.cache["@azure/storage-blob"] = { id: "@azure/storage-blob", filename: "@azure/storage-blob", loaded: true, exports: { BlobServiceClient: { fromConnectionString() { throw new Error("no storage in test"); } } } };
delete process.env.STORAGE_CONNECTION_STRING;

const { buildMessages } = require(path.join(__dirname, "..", "api", "shared", "messages.js"));
const T = require(path.join(__dirname, "..", "api", "shared", "teamsOrders.js"));

const snapshot = {
  generatedAt: "2026-09-28T00:00:00Z",
  tracks: [{ trackId: 2, name: "Domestic", nameZh: "国内路径", nameEn: "Domestic track" }],
  courses: [
    { id: 1, code: "KXC-MATH-7", nameZh: "七年级数学", nameEn: "Grade 7 Mathematics", classTypeZh: "直播课", classTypeEn: "Live Course", languageZh: "中文", languageEn: "Chinese", grades: ["G7"], teachers: ["张老师"], price: 1200, school: { name: "Kids X Center", abbr: "KXC" } },
    { id: 2, code: "WHA-BIBLE-9", nameZh: "九年级圣经", nameEn: "Grade 9 Bible", classTypeZh: "录播课", classTypeEn: "Prerecorded", languageZh: "英语", languageEn: "English", grades: ["G9"], teachers: [], price: null, school: { name: "WHA", abbr: "WHA" } },
  ],
};
const order = {
  orderId: "FC-20260831-MULTI-004", submittedAt: "2026-08-31T06:02:00.000Z", email: "Family@Gmail.com", teamsAccount: "kid@equipme.cloud", lang: "zh",
  track: { trackId: 2, name: "国内路径 / Domestic track", nameZh: "国内路径", nameEn: "Domestic track" },
  items: [
    { code: "KXC-MATH-7", name: "七年级数学 / Grade 7 Mathematics", nameZh: "七年级数学", nameEn: "Grade 7 Mathematics", price: 1200, priceTbd: false, schoolName: "Kids X Center", schoolAbbr: "KXC" },
    { code: "WHA-BIBLE-9", name: "九年级圣经 / Grade 9 Bible", nameZh: "九年级圣经", nameEn: "Grade 9 Bible", price: 0, priceTbd: true, schoolName: "WHA", schoolAbbr: "WHA" },
  ],
  itemCount: 2, totalPrice: 1200, currency: "CNY",
};
// One notification per hive, as api/order sends them.
function hiveMsg(items, lang, id, at) {
  const scoped = Object.assign({}, order, { items, itemCount: items.length, totalPrice: items.reduce((a, i) => a + (i.price || 0), 0), lang });
  const m = buildMessages(scoped, null, lang);
  return { id, createdDateTime: at, body: { contentType: "html", content: m.notifyHtml } };
}
const msgs = [
  hiveMsg([order.items[0]], "zh", "m1", "2026-08-31T06:02:10Z"),
  hiveMsg([order.items[1]], "zh", "m2", "2026-08-31T06:02:11Z"),
  { id: "m3", createdDateTime: "2026-08-30T01:00:00Z", body: { contentType: "html", content: "<div>Hello team, welcome to the channel.</div>" } },
];

const p1 = T.parseMessage(msgs[0]);
assert.strictEqual(p1.orderId, "FC-20260831-MULTI-004");
assert.strictEqual(p1.email, "family@gmail.com", "email read from the 家长联系方式 block, lower-cased");
assert.strictEqual(p1.teamsAccount, "kid@equipme.cloud");
assert.strictEqual(p1.lang, "zh");
assert.strictEqual(p1.submittedAt, "2026-08-31T06:02:00.000Z", "Beijing 14:02 → UTC 06:02");
assert.strictEqual(p1.track, "国内路径");
assert.deepStrictEqual(p1.items, [{ code: "KXC-MATH-7", name: "七年级数学", price: 1200, priceTbd: false }]);
assert.strictEqual(p1.total, 1200);
const p2 = T.parseMessage(msgs[1]);
assert.deepStrictEqual(p2.items, [{ code: "WHA-BIBLE-9", name: "九年级圣经", price: null, priceTbd: true }], "价格待定 is a TBD price, not ¥0");
assert.strictEqual(T.parseMessage(msgs[2]), null, "a message without an order id is not an order");

const { orders, skipped, messages } = T.parseExport({ value: msgs }, snapshot);
assert.strictEqual(messages, 3);
assert.strictEqual(skipped.length, 1);
assert.strictEqual(orders.length, 1, "two hive notifications → one order");
const o = orders[0];
assert.strictEqual(o.orderId, "FC-20260831-MULTI-004");
assert.strictEqual(o.source, "hive");
assert.strictEqual(o.status, "submitted");
assert.strictEqual(o.itemCount, 2);
assert.strictEqual(o.totalPrice, 1200);
assert.deepStrictEqual(o.track, { trackId: 2, nameZh: "国内路径", nameEn: "Domestic track" }, "the track is matched to the snapshot and stored bilingually");
assert.strictEqual(o.items[0].nameEn, "Grade 7 Mathematics", "enriched from the snapshot by code");
assert.strictEqual(o.items[0].nameZh, "七年级数学");
assert.strictEqual(o.items[0].classType, "直播课 / Live Course");
assert.strictEqual(o.items[0].schoolAbbr, "KXC");
assert.strictEqual(o.items[1].priceTbd, true);
assert.deepStrictEqual(o.hives.map((h) => h.abbr), ["KXC", "WHA"]);
assert.strictEqual(o.hives[0].subtotal, 1200);
assert.strictEqual(o.history[0].by, "import");
assert.deepStrictEqual(o.imported.messageIds, ["m1", "m2"]);
assert.strictEqual(o.notify.imported, true);

// An English-language order whose course the snapshot no longer knows keeps its name on both sides.
const en = { id: "m9", createdDateTime: "2026-09-01T02:00:00Z", body: { contentType: "html", content: buildMessages(Object.assign({}, order, { orderId: "FC-20260901-KXC-002", lang: "en", items: [{ code: "OLD-1", name: "Old course", nameZh: "", nameEn: "Old course", price: 500, priceTbd: false, schoolName: "KXC", schoolAbbr: "KXC" }], itemCount: 1, totalPrice: 500 }), null, "en").notifyHtml } };
const pe = T.parseMessage(en);
assert.strictEqual(pe.lang, "en");
assert.strictEqual(pe.items[0].name, "Old course");
const oe = T.parseExport([en], snapshot).orders[0];
assert.strictEqual(oe.items[0].nameEn, "Old course");
assert.strictEqual(oe.items[0].nameZh, "Old course", "no Chinese name known: the English one stands in rather than a blank");
assert.strictEqual(oe.track.nameEn, "Domestic track");

// Date parsing: both of formatWhen's shapes, and the fallback.
assert.strictEqual(T.parseWhen("2026/08/31 14:02"), "2026-08-31T06:02:00.000Z");
assert.strictEqual(T.parseWhen("31/08/2026, 14:02"), "2026-08-31T06:02:00.000Z");
assert.strictEqual(T.parseWhen("nonsense", "2026-01-01T00:00:00Z"), "2026-01-01T00:00:00Z");
assert.strictEqual(T.htmlToText("<p>a&nbsp;b</p><div>c<br>d</div>"), "a b\nc\nd");

// ---- Equip base normalisation, against a fake Airtable ----------------------
const equip = require(path.join(__dirname, "..", "api", "shared", "equip.js"));
const { AirtableBase } = require(path.join(__dirname, "..", "api", "shared", "airtable.js"));
const schema = [
  { id: "tblC", name: "Customers", primaryFieldId: "f1", fields: [{ id: "f1", name: "Personal Email", type: "email" }, { name: "Teams Account", type: "singleLineText" }, { name: "First Name", type: "singleLineText" }, { name: "Last Name", type: "singleLineText" }, { name: "Order IDs", type: "multipleRecordLinks", options: { linkedTableId: "tblO" } }, { name: "Is Active User", type: "checkbox" }, { name: "City", type: "singleLineText" }] },
  { id: "tblO", name: "Orders", primaryFieldId: "o1", fields: [{ id: "o1", name: "Order ID", type: "singleLineText" }, { name: "Order Date", type: "date" }, { name: "Order Amount", type: "currency" }, { name: "Received Amount", type: "currency" }, { name: "Customer Email", type: "singleLineText" }, { name: "Order Items", type: "multipleRecordLinks", options: { linkedTableId: "tblI" } }, { name: "Order Comments", type: "multilineText" }] },
  { id: "tblI", name: "Order Items", primaryFieldId: "i1", fields: [{ id: "i1", name: "OrderItem ID", type: "autoNumber" }, { name: "Order ID", type: "multipleRecordLinks", options: { linkedTableId: "tblO" } }, { name: "Curriculum SKU", type: "multipleRecordLinks", options: { linkedTableId: "tblK" } }, { name: "Quantity", type: "number" }, { name: "Unit Price", type: "currency" }, { name: "Total Price (RMB)", type: "formula" }, { name: "Royalty Rate", type: "percent" }, { name: "Royalty Amount", type: "formula" }] },
  { id: "tblK", name: "Curriculums", primaryFieldId: "k1", fields: [{ id: "k1", name: "SKU", type: "singleLineText" }, { name: "Product English Name", type: "singleLineText" }, { name: "Product Chinese Name", type: "singleLineText" }, { name: "Product Price", type: "currency" }, { name: "Category", type: "singleSelect" }, { name: "Subject", type: "singleSelect" }, { name: "Grade", type: "singleLineText" }, { name: "Language", type: "singleSelect" }, { name: "Publisher", type: "singleSelect" }, { name: "Royalty Rate (%)", type: "number" }, { name: "Available", type: "checkbox" }, { name: "Is this on Equipme.cloud?", type: "checkbox" }] },
  { id: "tblS", name: "Seminar list", primaryFieldId: "s1", fields: [{ id: "s1", name: "Email", type: "email" }, { name: "Name", type: "singleLineText" }, { name: "Seminar", type: "singleSelect" }] },
];
const rows = {
  tblC: [{ id: "recC1", createdTime: "2026-01-01T00:00:00Z", fields: { "Personal Email": " Mama@QQ.com ", "Teams Account": "mama@equipme.cloud (deleted)", "First Name": "Mei", "Last Name": "Wang", "Order IDs": ["recO1"], "Is Active User": true, "City": "南京" } }],
  tblO: [{ id: "recO1", createdTime: "2026-08-02T00:00:00Z", fields: { "Order ID": "Manual order 35", "Order Date": "2026-08-01", "Order Amount": 1296, "Received Amount": 1296, "Order Items": ["recI1", "recI2"], "Order Comments": "paid by transfer" } }],
  tblI: [
    { id: "recI1", fields: { "Order ID": ["recO1"], "Curriculum SKU": ["recK1"], Quantity: 1, "Unit Price": 648, "Total Price (RMB)": 648, "Royalty Rate": 0.15, "Royalty Amount": 97.2 } },
    { id: "recI2", fields: { "Order ID": ["recO1"], "Curriculum SKU": ["recK1"], Quantity: 1, "Unit Price": 648, "Total Price (RMB)": 648, "Royalty Rate": 0.15, "Royalty Amount": 97.2 } },
  ],
  tblK: [{ id: "recK1", fields: { SKU: "IEW-SSS1A-FP", "Product English Name": "IEW: SSS 1-A - Full Package", "Product Chinese Name": "IEW 结构和风格 1A - 全套", "Product Price": 648, Category: "Curriculum", Subject: "English Grammar and Writing", Grade: "G3, 4, 5", Language: "中文", Publisher: "IEW", "Royalty Rate (%)": 15, Available: true, "Is this on Equipme.cloud?": true } }],
  tblS: [{ id: "recS1", createdTime: "2026-05-01T00:00:00Z", fields: { Email: "Lead@Gmail.com", Name: "Lead One", Seminar: "2026-05 Classical" } }],
};
AirtableBase.prototype.schema = async function () { return schema; };
AirtableBase.prototype.list = async function (tableId) { return rows[tableId] || []; };
let written = null;
process.env.AIRTABLE_EQUIP_PAT = "pat_test";
(async () => {
  // Storage stubbed: the sync's final write is captured, and readEquip reads it back.
  const blobMod = require.cache["@azure/storage-blob"];
  blobMod.exports.BlobServiceClient.fromConnectionString = () => ({ getContainerClient: () => ({ createIfNotExists: async () => {}, getBlockBlobClient: () => ({ upload: async (body) => { written = JSON.parse(body); }, exists: async () => !!written, downloadToBuffer: async () => Buffer.from(JSON.stringify(written)) }) }) });
  process.env.STORAGE_CONNECTION_STRING = "UseDevelopmentStorage=true";
  const data = await equip.syncEquip({});
  assert.ok(written && written.syncedAt, "the sync wrote crm/equip/data.json");
  assert.deepStrictEqual(data.counts, { customers: 1, orders: 1, items: 2, curriculums: 1, seminar: 1 });
  const c = data.customers[0];
  assert.strictEqual(c.email, "mama@qq.com", "emails normalised");
  assert.strictEqual(c.teams, "mama@equipme.cloud", "(deleted) stripped");
  assert.strictEqual(c.emailTier, "replace", "a mainland mailbox is flagged");
  assert.strictEqual(c.name, "Mei Wang");
  const o = data.orders[0];
  assert.strictEqual(o.orderId, "Manual order 35");
  assert.strictEqual(o.email, "mama@qq.com", "the customer's email through the Order IDs link");
  assert.strictEqual(o.name, "Mei Wang");
  assert.strictEqual(o.amount, 1296);
  assert.strictEqual(o.itemCount, 2);
  assert.strictEqual(o.qty, 2);
  assert.deepStrictEqual(o.publishers, ["IEW"]);
  assert.strictEqual(o.items[0].sku, "IEW-SSS1A-FP");
  assert.strictEqual(o.items[0].nameZh, "IEW 结构和风格 1A - 全套");
  assert.strictEqual(o.items[0].total, 648);
  assert.deepStrictEqual(o.items[0].royalty, { "Royalty Rate": 0.15, "Royalty Amount": 97.2 }, "royalty columns travel in their own bag");
  const k = data.curriculums[0];
  assert.strictEqual(k.royaltyRate, 0.15, "15 (%) → 0.15");
  assert.strictEqual(k.grade, "G3, 4, 5", "Grade is copied as written — decision 10, nothing normalised here");
  assert.strictEqual(data.seminar[0].email, "lead@gmail.com");
  assert.strictEqual(data.warnings.filter((w) => /Teams Login Status|Teams Display name|CRM ID|Sales Amount|Customer Name|Publisher|Order Item Notes|Received Amount|Royalty Recipient/.test(w)).length, data.warnings.length, "only fields the fake base lacks are warned about: " + data.warnings.join(" | "));
  assert.ok(data.warnings.some((w) => /CRM ID/.test(w)), "the missing CRM ID field is reported (phase 0 step for Rick)");
  assert.strictEqual(equip.status(data).counts.orders, 1);
  console.log("crm-import: all assertions passed");
})().catch((e) => { console.error(e); process.exit(1); });
