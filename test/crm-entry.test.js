// The EquipMe order entry backend, driven against a fake Airtable.
//
// Run with:  node test/crm-entry.test.js
//
// What matters here is invisible from the code: which columns a write carries
// depends on the live schema. So the fake serves a schema shaped like the
// real CRM base — a formula "Total Price (RMB)", link fields on both sides,
// an autonumber primary on Order Items — and the assertions check that the
// writes skip the computed columns, fill the links with record ids, and stop
// with a 502 that names what was already written when the third step fails.
const assert = require("assert");
const path = require("path");

// @azure/storage-blob may not be installed where this runs; roles.js only
// needs it when storage is configured, so stub the module.
const Module = require("module");
const realResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (request === "@azure/storage-blob") return "@azure/storage-blob";
  return realResolve.call(this, request, parent, ...rest);
};
require.cache["@azure/storage-blob"] = { id: "@azure/storage-blob", filename: "@azure/storage-blob", loaded: true, exports: { BlobServiceClient: { fromConnectionString() { throw new Error("no storage in test"); } } } };

process.env.AIRTABLE_CRM_PAT = "pat.test";
delete process.env.STORAGE_CONNECTION_STRING;

const BASE = "appae5kpY1qXn6XLq";
const T = { customers: "tblCust", orders: "tblOrd", items: "tblItem", cur: "tblCur" };
function fld(name, type, options) { return { id: "fld" + name.replace(/\W/g, ""), name, type, options }; }
const schema = {
  tables: [
    { id: T.customers, name: "Customers", primaryFieldId: "fldPersonalEmail", fields: [
      fld("Personal Email", "email"), fld("Teams Account", "singleLineText"), fld("First Name", "singleLineText"),
      fld("Last Name", "singleLineText"), fld("Teams Display name", "singleLineText"), fld("City", "singleLineText"),
      fld("Order IDs", "multipleRecordLinks", { linkedTableId: T.orders }), fld("Sales Amount", "rollup"),
      fld("Is Active User", "checkbox"), fld("Teams Login Status", "singleSelect"),
    ] },
    { id: T.orders, name: "Orders", primaryFieldId: "fldOrderID", fields: [
      fld("Order ID", "singleLineText"), fld("Order Amount", "currency"), fld("Received Amount", "currency"),
      fld("Order Date", "date"), fld("Customer Email", "singleLineText"), fld("Customer Name", "singleLineText"),
      fld("Order Comments", "multilineText"), fld("Order Items", "multipleRecordLinks", { linkedTableId: T.items }),
      fld("Customers", "multipleRecordLinks", { linkedTableId: T.customers }), fld("Publisher", "multipleLookupValues"),
    ] },
    { id: T.items, name: "Order Items", primaryFieldId: "fldOrderItemID", fields: [
      fld("OrderItem ID", "autoNumber"), fld("Order ID", "multipleRecordLinks", { linkedTableId: T.orders }),
      fld("Curriculum SKU", "multipleRecordLinks", { linkedTableId: T.cur }), fld("Quantity", "number"),
      fld("Unit Price", "currency"), fld("Total Price (RMB)", "formula"), fld("Received Amount", "currency"),
      fld("Order Item Notes", "multilineText"), fld("Publisher", "multipleLookupValues"),
    ] },
    { id: T.cur, name: "Curriculums", primaryFieldId: "fldSKU", fields: [
      fld("SKU", "singleLineText"), fld("Product English Name", "singleLineText"), fld("Product Chinese Name", "singleLineText"),
      fld("Product Price", "currency"), fld("Royalty Recipient", "singleSelect"), fld("Available", "checkbox"),
    ] },
  ],
};

const calls = [];
let failItems = false;
let nextId = 1;
global.fetch = async function (url, opts) {
  const u = typeof url === "string" ? new URL(url) : url;
  const method = (opts && opts.method) || "GET";
  const body = opts && opts.body ? JSON.parse(opts.body) : null;
  calls.push({ method, path: u.pathname, query: Object.fromEntries(u.searchParams), body });
  const json = (status, obj) => ({ ok: status < 400, status, text: async () => JSON.stringify(obj), json: async () => obj });

  if (u.pathname === `/v0/meta/bases/${BASE}/tables`) return json(200, schema);
  const m = /^\/v0\/app[^/]+\/([^/]+)(?:\/(rec[^/]+))?$/.exec(u.pathname);
  if (!m) return json(404, { error: "no route" });
  const table = m[1];
  if (method === "GET" && m[2]) return json(200, { id: m[2], fields: { "Personal Email": "old@example.com", "Order IDs": ["recOLD1234567890"] } });
  if (method === "GET") {
    const f = u.searchParams.get("filterByFormula") || "";
    if (table === T.customers) {
      if (/old@example\.com/.test(f)) return json(200, { records: [{ id: "recCUST0000000001", fields: { "Personal Email": "old@example.com", "First Name": "Old", "Last Name": "Hand", "Teams Account": "old.hand@equipme.cloud" } }] });
      return json(200, { records: [] });
    }
    if (table === T.orders) {
      if (/FIND\('manual order'/.test(f)) return json(200, { records: [{ id: "r1", fields: { "Order ID": "Manual order 35" } }, { id: "r2", fields: { "Order ID": "Manual order 7" } }] });
      if (/Manual order 36/.test(f)) return json(200, { records: [] });
      if (/DUPLICATE/.test(f)) return json(200, { records: [{ id: "recDUP", fields: { "Order ID": "DUPLICATE" } }] });
      return json(200, { records: [] });
    }
    if (table === T.cur) return json(200, { records: [{ id: "recCUR00000000001", fields: { SKU: "EF-0K-S-TB-FP-C-10001", "Product English Name": "TALES Phonics - Full Package", "Product Chinese Name": "英语童话自然拼读", "Product Price": 788, "Royalty Recipient": "CEFF", Available: true } }] });
    return json(200, { records: [] });
  }
  if (method === "POST") {
    if (table === T.items && failItems) return json(422, { error: { type: "INVALID_VALUE_FOR_COLUMN", message: "boom" } });
    if (body.records) return json(200, { records: body.records.map((r) => ({ id: "recITEM" + String(nextId++).padStart(9, "0"), fields: r.fields })) });
    return json(200, { id: "rec" + table.replace("tbl", "").toUpperCase().padEnd(14, "0"), fields: body.fields });
  }
  if (method === "PATCH") return json(200, { id: m[2], fields: body.fields });
  return json(500, { error: "unhandled" });
};

const crm = require(path.join(__dirname, "..", "api", "crm", "index.js"));

function principal(roles, user) {
  return Buffer.from(JSON.stringify({ identityProvider: "aad", userId: "x", userDetails: user || "rick@ceff.us", userRoles: ["anonymous", "authenticated"].concat(roles) })).toString("base64");
}
async function call(action, { method = "GET", query = {}, body = null, roles = ["admin"] } = {}) {
  const context = { log: Object.assign((m) => {}, { error() {}, warn() {} }), res: null };
  await crm(context, { method, params: { action }, query, body, headers: { "x-ms-client-principal": principal(roles) } });
  return context.res;
}

(async () => {
  // Access: a plain signed-in account is refused, an admin passes.
  let r = await call("customer", { query: { q: "old@example.com" }, roles: [] });
  assert.strictEqual(r.status, 403, "no role → 403");
  r = await call("me", { roles: [] });
  assert.strictEqual(r.body.allowed, false);

  // Lookups.
  r = await call("customer", { query: { q: "old@example.com" } });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.exact.length, 1);
  assert.strictEqual(r.body.exact[0].teams, "old.hand@equipme.cloud");

  r = await call("curriculums", { query: { q: "tales" } });
  assert.strictEqual(r.body.results[0].price, 788);
  assert.strictEqual(r.body.results[0].publisher, "CEFF");

  r = await call("next-order-id");
  assert.strictEqual(r.body.orderId, "Manual order 36");

  r = await call("schema");
  assert.ok(r.body.items.skips.some((s) => /Total Price/.test(s)), "formula column reported as skipped");
  assert.ok(r.body.items.writes.some((s) => /Curriculum SKU \(link\)/.test(s)));
  assert.ok(r.body.orders.writes.some((s) => /Customers \(link\)/.test(s)));

  // Validation.
  r = await call("entry", { method: "POST", body: { customer: { email: "nope" }, order: {}, items: [] } });
  assert.strictEqual(r.status, 400);
  assert.ok(r.body.problems.length >= 4, r.body.problems.join(" | "));

  // Duplicate order id.
  r = await call("entry", { method: "POST", body: { customer: { email: "old@example.com" }, order: { orderId: "DUPLICATE", date: "2026-09-29", amount: 1 }, items: [{ curriculumId: "recCUR00000000001", quantity: 1, unitPrice: 1 }] } });
  assert.strictEqual(r.status, 409);

  // A full entry: existing customer found by email, order + 2 items.
  calls.length = 0;
  r = await call("entry", { method: "POST", body: {
    customer: { email: "OLD@example.com" },
    order: { orderId: "Manual order 36", date: "2026-09-29", amount: "1576", received: "", comments: "test" },
    items: [
      { curriculumId: "recCUR00000000001", quantity: 2, unitPrice: 788, notes: "two sets" },
      { curriculumId: "recCUR00000000001", quantity: 1, unitPrice: 0 },
    ],
  } });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.strictEqual(r.body.customer.created, false);
  assert.strictEqual(r.body.customer.name, "Old Hand");
  assert.strictEqual(r.body.items.length, 2);
  const orderPost = calls.find((c) => c.method === "POST" && c.path.endsWith("/" + T.orders));
  assert.deepStrictEqual(orderPost.body.fields["Customers"], ["recCUST0000000001"], "order links the customer");
  assert.strictEqual(orderPost.body.fields["Order Amount"], 1576);
  assert.strictEqual(orderPost.body.fields["Customer Name"], "Old Hand");
  assert.ok(!("Received Amount" in orderPost.body.fields), "blank received not sent");
  const itemPost = calls.find((c) => c.method === "POST" && c.path.endsWith("/" + T.items));
  const it0 = itemPost.body.records[0].fields;
  assert.deepStrictEqual(it0["Order ID"], ["recORD00000000000"], "item links the order");
  assert.deepStrictEqual(it0["Curriculum SKU"], ["recCUR00000000001"]);
  assert.strictEqual(it0["Quantity"], 2);
  assert.strictEqual(it0["Unit Price"], 788);
  assert.ok(!("Total Price (RMB)" in it0), "formula column not sent");
  assert.ok(!("OrderItem ID" in it0), "autonumber not sent");
  assert.ok(r.body.skipped.items.some((s) => /Total Price/.test(s)));
  assert.ok(!calls.some((c) => c.method === "PATCH"), "no customer patch when Orders carries the link");

  // A new customer is created first.
  calls.length = 0;
  r = await call("entry", { method: "POST", body: {
    customer: { email: "new@example.com", first: "New", last: "Person", teams: "new.person@equipme.cloud", city: "Nanjing" },
    order: { orderId: "Manual order 36", date: "2026-09-29", amount: 788 },
    items: [{ curriculumId: "recCUR00000000001", quantity: 1, unitPrice: 788 }],
  } });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.strictEqual(r.body.customer.created, true);
  const custPost = calls.find((c) => c.method === "POST" && c.path.endsWith("/" + T.customers));
  assert.strictEqual(custPost.body.fields["Personal Email"], "new@example.com");
  assert.strictEqual(custPost.body.fields["City"], "Nanjing");
  assert.ok(!("Sales Amount" in custPost.body.fields));

  // Failure in step 3 reports what was written in steps 1–2.
  failItems = true;
  r = await call("entry", { method: "POST", body: {
    customer: { email: "new@example.com" },
    order: { orderId: "Manual order 36", date: "2026-09-29", amount: 788 },
    items: [{ curriculumId: "recCUR00000000001", quantity: 1, unitPrice: 788 }],
  } });
  assert.strictEqual(r.status, 502);
  assert.strictEqual(r.body.written.length, 2, "customer + order were written before items failed");
  assert.ok(/boom/.test(r.body.error));
  failItems = false;

  console.log("crm-entry: all assertions passed");
})().catch((e) => { console.error(e); process.exit(1); });
