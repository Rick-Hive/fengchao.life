// The Equip (EquipMe textbook) base, read into the CRM: Customers, Orders,
// Order Items, Curriculums and the Seminar list, copied whole into
// crm/equip/data.json (design §8 "同步怎么走": Airtable stays the system of
// record until the entry point switches; the CRM reads, never writes — the
// one write-back, CRM ID, is a later phase and a separate function).
//
// The base is a different workspace from the Hive course base, built by hand,
// so nothing here pins a table or field id: everything is found by name with
// the tolerant matcher of ./airtable.js, and a field that cannot be found
// becomes a warning in the sync's meta rather than a crash. Field names as
// exported 2026-09-28 (fengchao-crm-entry-tool) are the specs below.
//
// Token: AIRTABLE_EQUIP_PAT (read-only, scoped to this base), or the older
// AIRTABLE_CRM_PAT if that is what the app still has. Never the Hive base's PAT.
const { BlobServiceClient } = require("@azure/storage-blob");
const { AirtableBase } = require("./airtable");
const { snapshotBlob } = require("./config");
const { normalizeEmail, tier } = require("./emailTier");

const BASE_ID = process.env.AIRTABLE_EQUIP_BASE_ID || process.env.AIRTABLE_CRM_BASE_ID || "appae5kpY1qXn6XLq";
const BLOB = "crm/equip/data.json";

function pat() { return process.env.AIRTABLE_EQUIP_PAT || process.env.AIRTABLE_CRM_PAT || ""; }
function patSetting() { return process.env.AIRTABLE_EQUIP_PAT ? "AIRTABLE_EQUIP_PAT" : process.env.AIRTABLE_CRM_PAT ? "AIRTABLE_CRM_PAT (the old setting; AIRTABLE_EQUIP_PAT is preferred)" : ""; }

const TABLES = {
  customers: ["Customers", "Customer", "客户"],
  orders: ["Orders", "Order", "订单"],
  items: ["Order Items", "OrderItems", "Order Item", "订单明细"],
  curriculums: ["Curriculums", "Curriculum", "教材"],
  seminar: ["Seminar list", "Seminar", "Seminars", "研讨会", "讲座"],
};
const FIELDS = {
  customers: { email: "Personal Email", teams: "Teams Account", first: "First Name", last: "Last Name", display: "Teams Display name", active: "Is Active User", login: "Teams Login Status", city: "City", orders: "Order IDs", crmId: "CRM ID", sales: "Sales Amount" },
  orders: { id: "Order ID", date: "Order Date", amount: "Order Amount", received: "Received Amount", email: "Customer Email", name: "Customer Name", items: "Order Items", comments: "Order Comments", publisher: "Publisher" },
  items: { order: "Order ID", sku: "Curriculum SKU", qty: "Quantity", unit: "Unit Price", total: "Total Price", received: "Received Amount", notes: "Order Item Notes" },
  curriculums: { nameEn: "Product English Name", nameZh: "Product Chinese Name", price: "Product Price", category: "Category", subject: "Subject", grade: "Grade", language: "Language", publisher: "Publisher", royaltyRecipient: "Royalty Recipient", royaltyRate: /royalty.*(rate|%)/i, available: "Available", onEquipme: /on\s*Equipme/i },
  seminar: { email: /e-?mail|邮箱/i, name: /^(name|姓名|full name)/i, session: /seminar|session|讲座|场次|topic/i },
};

function s(v) { return v == null ? "" : Array.isArray(v) ? v.map(s).filter(Boolean).join(", ") : typeof v === "object" ? (v.name || v.email || v.url || "") : String(v).trim(); }
function n(v) { if (typeof v === "number") return v; if (Array.isArray(v)) return n(v[0]); const x = parseFloat(String(v == null ? "" : v).replace(/[^0-9.\-]/g, "")); return Number.isFinite(x) ? x : null; }
function ids(v) { return (Array.isArray(v) ? v : v ? [v] : []).map(String).filter((x) => /^rec/.test(x)); }

// Resolve a table's field specs to the live field names once; unresolved ones are warnings.
function resolve(table, specs, warnings, label) {
  const out = {};
  for (const [key, spec] of Object.entries(specs)) {
    const f = AirtableBase.field(table, spec);
    if (f) out[key] = f.name;
    else warnings.push(`${label}: field "${spec instanceof RegExp ? spec.source : spec}" not found (${key})`);
  }
  return out;
}
const get = (rec, map, key) => (map[key] ? rec.fields[map[key]] : undefined);

async function syncEquip(opts) {
  const log = (opts && opts.log) || (() => {});
  const token = pat();
  if (!token) throw Object.assign(new Error("AIRTABLE_EQUIP_PAT app setting is not configured"), { code: "no_pat" });
  const base = new AirtableBase(BASE_ID, token);
  const warnings = [];
  const started = new Date().toISOString();

  // The schema is the first call. A token Airtable rejects (401/403) must stop the
  // sync here — with a reason — rather than "complete" with five empty tables and
  // overwrite the last good copy (Rick, 2026-10-07: five identical 401 notes and 0 of
  // everything).
  try {
    await base.schema(true);
  } catch (err) {
    const status = err && err.status;
    if (status === 401 || status === 403) {
      throw Object.assign(new Error(`Airtable rejected the token in ${patSetting()} (HTTP ${status}: ${String(err.message || "").replace(/^.*HTTP \d+: /, "")}). Create a personal access token with scopes data.records:read and schema.bases:read, access limited to the Equip base, and save it as AIRTABLE_EQUIP_PAT.`), { code: "bad_pat", status });
    }
    throw err;
  }

  async function read(key) {
    let table;
    try { table = await base.table(TABLES[key]); } catch (err) { warnings.push(String(err.message || err)); return { table: null, records: [], map: {} }; }
    const map = resolve(table, FIELDS[key], warnings, table.name);
    const records = await base.list(table.id);
    log(`equip: ${table.name}: ${records.length} records`);
    return { table, records, map };
  }
  const [cu, or, it, cr, se] = await Promise.all([read("customers"), read("orders"), read("items"), read("curriculums"), read("seminar")]);

  // Curriculums: SKU = the primary field.
  const skuField = cr.table ? (cr.table.fields.find((f) => f.id === cr.table.primaryFieldId) || {}).name : null;
  const curriculums = cr.records.map((r) => {
    const rate = n(get(r, cr.map, "royaltyRate"));
    return {
      recId: r.id, sku: s(skuField ? r.fields[skuField] : ""), nameEn: s(get(r, cr.map, "nameEn")), nameZh: s(get(r, cr.map, "nameZh")),
      price: n(get(r, cr.map, "price")), category: s(get(r, cr.map, "category")), subject: s(get(r, cr.map, "subject")), grade: s(get(r, cr.map, "grade")),
      language: s(get(r, cr.map, "language")), publisher: s(get(r, cr.map, "publisher")), royaltyRecipient: s(get(r, cr.map, "royaltyRecipient")),
      royaltyRate: rate == null ? null : rate > 1 ? rate / 100 : rate, available: !!get(r, cr.map, "available"), onEquipme: !!get(r, cr.map, "onEquipme"),
    };
  });
  const bySku = new Map(curriculums.map((c) => [c.recId, c]));

  // Order items, keyed by order record id.
  const itemsByOrder = new Map();
  const items = it.records.map((r) => {
    const skuRec = ids(get(r, it.map, "sku"))[0] || "";
    const sku = bySku.get(skuRec) || null;
    const row = {
      recId: r.id, orderRec: ids(get(r, it.map, "order"))[0] || "", skuRec, sku: sku ? sku.sku : s(get(r, it.map, "sku")),
      nameEn: sku ? sku.nameEn : "", nameZh: sku ? sku.nameZh : "", publisher: sku ? sku.publisher : "", category: sku ? sku.category : "", subject: sku ? sku.subject : "", grade: sku ? sku.grade : "", language: sku ? sku.language : "",
      qty: n(get(r, it.map, "qty")) || 0, unitPrice: n(get(r, it.map, "unit")), total: n(get(r, it.map, "total")), received: n(get(r, it.map, "received")), notes: s(get(r, it.map, "notes")),
      royalty: {},
    };
    // Every royalty column travels in its own bag; the API strips the bag for everyone but finance.
    for (const [name, v] of Object.entries(r.fields)) if (/royalty|版税/i.test(name) && !/recipient/i.test(name)) row.royalty[name] = typeof v === "number" ? v : s(v);
    if (row.orderRec) { if (!itemsByOrder.has(row.orderRec)) itemsByOrder.set(row.orderRec, []); itemsByOrder.get(row.orderRec).push(row); }
    return row;
  });

  // Customers.
  const customers = cu.records.map((r) => {
    const email = normalizeEmail(get(r, cu.map, "email"));
    const teams = normalizeEmail(get(r, cu.map, "teams"));
    return {
      recId: r.id, email, teams, emailTier: tier(email), first: s(get(r, cu.map, "first")), last: s(get(r, cu.map, "last")), display: s(get(r, cu.map, "display")),
      name: [s(get(r, cu.map, "first")), s(get(r, cu.map, "last"))].filter(Boolean).join(" ") || s(get(r, cu.map, "display")),
      active: !!get(r, cu.map, "active"), login: s(get(r, cu.map, "login")), city: s(get(r, cu.map, "city")), orderRecs: ids(get(r, cu.map, "orders")),
      crmId: s(get(r, cu.map, "crmId")), sales: n(get(r, cu.map, "sales")), createdTime: r.createdTime || null,
    };
  });
  const customerByOrder = new Map();
  for (const c of customers) for (const o of c.orderRecs) customerByOrder.set(o, c);
  const customerLink = or.table ? AirtableBase.linkTo(or.table, cu.table && cu.table.id) : null;

  // Orders, with their items embedded.
  const orders = or.records.map((r) => {
    const linked = customerLink ? ids(r.fields[customerLink.name])[0] : "";
    const cust = (linked && customers.find((c) => c.recId === linked)) || customerByOrder.get(r.id) || null;
    const rows = itemsByOrder.get(r.id) || [];
    const email = normalizeEmail(get(r, or.map, "email")) || (cust ? cust.email : "");
    return {
      source: "equip", recId: r.id, orderId: s(get(r, or.map, "id")) || r.id, date: s(get(r, or.map, "date")) || (r.createdTime || "").slice(0, 10),
      amount: n(get(r, or.map, "amount")), received: n(get(r, or.map, "received")), email, name: s(get(r, or.map, "name")) || (cust ? cust.name : ""),
      customerRec: cust ? cust.recId : "", customerCrmId: cust ? cust.crmId : "", comments: s(get(r, or.map, "comments")),
      publishers: Array.from(new Set(rows.map((x) => x.publisher).filter(Boolean))), itemCount: rows.length, qty: rows.reduce((a, x) => a + (x.qty || 0), 0),
      items: rows, createdTime: r.createdTime || null,
    };
  });
  orders.sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.createdTime || "").localeCompare(String(a.createdTime || "")));

  const seminar = se.records.map((r) => ({ recId: r.id, email: normalizeEmail(get(r, se.map, "email")), name: s(get(r, se.map, "name")), session: s(get(r, se.map, "session")), createdTime: r.createdTime || null }));

  const data = {
    syncedAt: new Date().toISOString(), startedAt: started, baseId: BASE_ID, warnings,
    counts: { customers: customers.length, orders: orders.length, items: items.length, curriculums: curriculums.length, seminar: seminar.length },
    customers, orders, curriculums, seminar,
  };
  await writeEquip(data);
  return data;
}

// ---- storage ----
function blob() {
  const conn = process.env.STORAGE_CONNECTION_STRING;
  if (!conn) throw new Error("STORAGE_CONNECTION_STRING app setting is not configured");
  const container = BlobServiceClient.fromConnectionString(conn).getContainerClient(snapshotBlob.container);
  return { container, blob: container.getBlockBlobClient(BLOB) };
}
async function writeEquip(data) {
  const { container, blob: b } = blob();
  await container.createIfNotExists();
  const body = JSON.stringify(data);
  await b.upload(body, Buffer.byteLength(body), { blobHTTPHeaders: { blobContentType: "application/json; charset=utf-8" } });
}
async function readEquip() {
  const { blob: b } = blob();
  if (!(await b.exists())) return null;
  const buf = await b.downloadToBuffer();
  return JSON.parse(buf.toString("utf8"));
}
// The sync's status without the data (for the page's footer and the 数据同步 page).
function status(data) {
  return data ? { syncedAt: data.syncedAt, counts: data.counts, warnings: data.warnings || [] } : { syncedAt: null, counts: null, warnings: [], configured: !!pat() };
}

module.exports = { BASE_ID, BLOB, TABLES, FIELDS, pat, patSetting, syncEquip, readEquip, writeEquip, status };
