// 版税结算表 (design §5, the finance director's own table): by publisher, by
// quarter — sales, royalty due, paid or not. Royalty per line = the Order Items'
// "Royalty Amount" when Airtable computed one, else total × the SKU's rate
// (Curriculums' royalty rate, 0.15 for IEW, 0 for CEFF's own titles …). Quarters
// are calendar quarters (2026 Q3 = Jul–Sep) — the school year is for sales
// comparisons; settlements with publishers go by calendar quarter.
// Paid marks: crm/royalty-paid.json { paid: { "<publisher key>|<quarter>": { by, at, note, amount } } }.
// The publisher key is the Publishers record id when the catalogue carries one (a
// renamed publisher keeps its marks — self-review 2026-10-08: marks made while
// publishers showed as numbers were keyed "13"), else the display name.
const { BlobServiceClient } = require("@azure/storage-blob");
const { snapshotBlob } = require("./config");

const BLOB = "crm/royalty-paid.json";
function container() {
  const conn = process.env.STORAGE_CONNECTION_STRING;
  if (!conn) throw new Error("STORAGE_CONNECTION_STRING app setting is not configured");
  return BlobServiceClient.fromConnectionString(conn).getContainerClient(snapshotBlob.container);
}
async function readPaid() {
  const b = container().getBlockBlobClient(BLOB);
  if (!(await b.exists())) return { paid: {} };
  try { return JSON.parse((await b.downloadToBuffer()).toString("utf8")); } catch { return { paid: {} }; }
}
async function writePaid(doc) {
  const c = container(); await c.createIfNotExists();
  const body = JSON.stringify(doc);
  await c.getBlockBlobClient(BLOB).upload(body, Buffer.byteLength(body), { blobHTTPHeaders: { blobContentType: "application/json; charset=utf-8" } });
}

function quarterOf(date) { const p = String(date || "").split("-"); if (p.length < 2) return ""; return p[0] + " Q" + (Math.floor((+p[1] - 1) / 3) + 1); }
function quarterKey(y, q) { return y + " Q" + q; }
function lastQuarters(n, now) {
  const d = new Date(now || Date.now()); let y = d.getUTCFullYear(), q = Math.floor(d.getUTCMonth() / 3) + 1; const out = [];
  for (let i = 0; i < n; i++) { out.unshift(quarterKey(y, q)); q--; if (q === 0) { q = 4; y--; } }
  return out;
}
function rateOf(item, skuRates) {
  const bag = item.royalty || {};
  for (const [k, v] of Object.entries(bag)) if (/rate|%/i.test(k) && typeof v === "number") return v > 1 ? v / 100 : v;
  const r = skuRates[item.sku]; return typeof r === "number" ? r : null;
}
function amountOf(item, skuRates) {
  const bag = item.royalty || {};
  for (const [k, v] of Object.entries(bag)) if (/amount|金额/i.test(k) && typeof v === "number") return v;
  const rate = rateOf(item, skuRates);
  return rate == null ? null : (item.total || 0) * rate;
}

// equip = crm/equip/data.json (unmasked). Returns { quarters, publishers:[{publisher, recipient, rate, cells:{q:{sales, royalty, units, items, unknown}}}], totals:{q:{sales, royalty}} }
function build(equip, opts) {
  const n = (opts && opts.quarters) || 8;
  const quarters = lastQuarters(n, opts && opts.now);
  const skuRates = {}, recipients = {}, recOf = {};
  for (const c of (equip && equip.curriculums) || []) { if (c.sku) { if (typeof c.royaltyRate === "number") skuRates[c.sku] = c.royaltyRate; if (c.royaltyRecipient) recipients[c.publisher || ""] = c.royaltyRecipient; if (c.publisher && c.publisherRec && !recOf[c.publisher]) recOf[c.publisher] = c.publisherRec; } }
  for (const o of (equip && equip.orders) || []) for (const it of o.items || []) if (it.publisher && it.publisherRec && !recOf[it.publisher]) recOf[it.publisher] = it.publisherRec;
  const pubs = new Map();
  for (const o of (equip && equip.orders) || []) {
    const q = quarterOf(o.date); if (!quarters.includes(q)) continue;
    for (const it of o.items || []) {
      const name = it.publisher || "?", key = it.publisherRec || recOf[name] || name;
      if (!pubs.has(key)) pubs.set(key, { key, publisher: name, recipient: recipients[name] || "", rates: new Set(), cells: {} });
      const p = pubs.get(key);
      if (!p.cells[q]) p.cells[q] = { sales: 0, royalty: 0, units: 0, items: 0, unknown: 0 };
      const c = p.cells[q];
      c.sales += it.total || 0; c.units += it.qty || 0; c.items++;
      const a = amountOf(it, skuRates);
      if (a == null) c.unknown++; else c.royalty += a;
      const r = rateOf(it, skuRates); if (r != null) p.rates.add(r);
    }
  }
  const publishers = Array.from(pubs.values()).map((p) => ({ key: p.key, publisher: p.publisher, recipient: p.recipient, rates: Array.from(p.rates).sort(), cells: p.cells, total: Object.values(p.cells).reduce((a, c) => a + c.sales, 0), royaltyTotal: Object.values(p.cells).reduce((a, c) => a + c.royalty, 0) }))
    .sort((a, b) => b.total - a.total);
  const totals = {};
  for (const q of quarters) totals[q] = publishers.reduce((acc, p) => { const c = p.cells[q]; if (c) { acc.sales += c.sales; acc.royalty += c.royalty; acc.unknown += c.unknown; } return acc; }, { sales: 0, royalty: 0, unknown: 0 });
  return { quarters, publishers, totals, syncedAt: (equip && equip.syncedAt) || null };
}

const updatePaid = (mutate) => require("./jsonstore").update(BLOB, { paid: {} }, mutate);
module.exports = { BLOB, readPaid, writePaid, updatePaid, build, quarterOf, lastQuarters };
