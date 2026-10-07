// 许可池与分配 (design §7, phase 5 first cut — the foundation of Hive's own DRM).
// A pool = which SKU, how many seats, valid from/to, who holds it (Hive itself, a
// school, a distribution partner), which order it came from, and its parent pool
// when it was carved out of another. An allocation = from which pool, to whom (a
// person, or an institution — which creates a child pool), how many, when, by whom.
// Revocation is a reverse record, so every seat traces back to its source order and
// any pool shows its balance, expiry and downstream. Nothing here touches Vitrium;
// "allocation = membership of a DRM user group" is the DRM system's job later.
// crm/licenses.json { pools: [], allocations: [], nextPool, nextAlloc }
const { BlobServiceClient } = require("@azure/storage-blob");
const { snapshotBlob } = require("./config");

const BLOB = "crm/licenses.json";
const DAY = 24 * 3600 * 1000;
const HOLDER_TYPES = ["hive", "institution", "partner"];
const REGIONS = ["cn", "intl-cn", "africa", "south-america", "other"];
const INST_TYPES = ["school", "hive", "publisher", "distributor"];

function container() {
  const conn = process.env.STORAGE_CONNECTION_STRING;
  if (!conn) throw new Error("STORAGE_CONNECTION_STRING app setting is not configured");
  return BlobServiceClient.fromConnectionString(conn).getContainerClient(snapshotBlob.container);
}
async function readDoc() {
  const b = container().getBlockBlobClient(BLOB);
  if (!(await b.exists())) return { pools: [], allocations: [], nextPool: 1, nextAlloc: 1 };
  try { const d = JSON.parse((await b.downloadToBuffer()).toString("utf8")); return Object.assign({ pools: [], allocations: [], nextPool: 1, nextAlloc: 1 }, d); } catch { return { pools: [], allocations: [], nextPool: 1, nextAlloc: 1 }; }
}
async function writeDoc(doc) {
  const c = container(); await c.createIfNotExists();
  const body = JSON.stringify(doc);
  await c.getBlockBlobClient(BLOB).upload(body, Buffer.byteLength(body), { blobHTTPHeaders: { blobContentType: "application/json; charset=utf-8" } });
}

const pad = (n) => String(n).padStart(6, "0");
function activeAllocations(doc, poolId) { return doc.allocations.filter((a) => a.poolId === poolId && !a.revokedAt); }
function allocated(doc, poolId) { return activeAllocations(doc, poolId).reduce((s, a) => s + a.qty, 0); }
function balance(doc, pool) { return pool.qty - allocated(doc, pool.id); }
function expired(pool, now) { return !!pool.validTo && Date.parse(pool.validTo + "T23:59:59Z") < (now || Date.now()); }

// Create a pool. input { sku, title, qty, validFrom, validTo, holder: {type, domain, name}, source: {orderRec, orderId}, parent, note }, by.
function createPool(doc, input, by, now) {
  const qty = Math.floor(Number(input.qty));
  if (!input.sku) throw Object.assign(new Error("sku required"), { code: "bad_request" });
  if (!(qty > 0)) throw Object.assign(new Error("qty must be a positive integer"), { code: "bad_request" });
  const holder = input.holder || { type: "hive" };
  if (!HOLDER_TYPES.includes(holder.type)) throw Object.assign(new Error("holder type"), { code: "bad_request" });
  for (const d of [input.validFrom, input.validTo]) if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) throw Object.assign(new Error("dates are YYYY-MM-DD"), { code: "bad_request" });
  if (input.validFrom && input.validTo && input.validTo < input.validFrom) throw Object.assign(new Error("validTo before validFrom"), { code: "bad_request" });
  if (input.parent && !doc.pools.find((p) => p.id === input.parent)) throw Object.assign(new Error("parent pool not found"), { code: "not_found" });
  const pool = { id: "LP-" + pad(doc.nextPool++), sku: String(input.sku).toUpperCase(), title: String(input.title || "").slice(0, 160), qty, validFrom: input.validFrom || null, validTo: input.validTo || null,
    holder: { type: holder.type, domain: String(holder.domain || "").toLowerCase(), name: String(holder.name || "").slice(0, 120) }, source: { orderRec: String((input.source && input.source.orderRec) || ""), orderId: String((input.source && input.source.orderId) || "").slice(0, 80) },
    parent: input.parent || null, note: String(input.note || "").slice(0, 500), by, at: new Date(now || Date.now()).toISOString() };
  doc.pools.push(pool);
  return pool;
}

// Allocate seats. input { poolId, to: { type: "person", crmId, name } | { type: "institution", domain, name }, qty, note }, by.
// To an institution → a child pool of the same SKU and dates is created for it.
function allocate(doc, input, by, now) {
  const pool = doc.pools.find((p) => p.id === input.poolId);
  if (!pool) throw Object.assign(new Error("pool not found"), { code: "not_found" });
  const qty = Math.floor(Number(input.qty));
  if (!(qty > 0)) throw Object.assign(new Error("qty must be a positive integer"), { code: "bad_request" });
  if (expired(pool, now)) throw Object.assign(new Error("pool has expired"), { code: "expired" });
  if (qty > balance(doc, pool)) throw Object.assign(new Error(`only ${balance(doc, pool)} seat(s) left in ${pool.id}`), { code: "insufficient", balance: balance(doc, pool) });
  const to = input.to || {};
  if (!["person", "institution"].includes(to.type)) throw Object.assign(new Error("allocation target"), { code: "bad_request" });
  if (to.type === "person" && !/^HC-\d{6}$/.test(String(to.crmId || ""))) throw Object.assign(new Error("person crmId"), { code: "bad_request" });
  if (to.type === "institution" && !to.domain) throw Object.assign(new Error("institution domain"), { code: "bad_request" });
  const at = new Date(now || Date.now()).toISOString();
  const alloc = { id: "LA-" + pad(doc.nextAlloc++), poolId: pool.id, to: { type: to.type, crmId: to.crmId || "", domain: String(to.domain || "").toLowerCase(), name: String(to.name || "").slice(0, 120) }, qty, note: String(input.note || "").slice(0, 300), by, at, childPool: null };
  if (to.type === "institution") {
    const child = createPool(doc, { sku: pool.sku, title: pool.title, qty, validFrom: pool.validFrom, validTo: pool.validTo, holder: { type: "institution", domain: to.domain, name: to.name }, source: pool.source, parent: pool.id, note: "← " + pool.id }, by, now);
    alloc.childPool = child.id;
  }
  doc.allocations.push(alloc);
  return alloc;
}

// Revoke an allocation (a reverse record). A child pool is revoked only when it has no active allocations of its own.
function revoke(doc, allocId, by, now, note) {
  const a = doc.allocations.find((x) => x.id === allocId);
  if (!a) throw Object.assign(new Error("allocation not found"), { code: "not_found" });
  if (a.revokedAt) throw Object.assign(new Error("already revoked"), { code: "bad_request" });
  if (a.childPool && activeAllocations(doc, a.childPool).length) throw Object.assign(new Error("the institution has allocated seats from this pool; revoke those first"), { code: "has_children" });
  a.revokedAt = new Date(now || Date.now()).toISOString(); a.revokedBy = by; a.revokeNote = String(note || "").slice(0, 300);
  if (a.childPool) { const c = doc.pools.find((p) => p.id === a.childPool); if (c) c.revokedAt = a.revokedAt; }
  return a;
}

// A reader's view: pools with balances, and the totals for the dashboard's 许可 panel.
// regionOf(domain) → region code, from the institutions' partner data.
function view(doc, opts) {
  const now = (opts && opts.now) || Date.now(), regionOf = (opts && opts.regionOf) || (() => "other");
  const pools = doc.pools.filter((p) => !p.revokedAt).map((p) => Object.assign({}, p, { allocated: allocated(doc, p.id), balance: balance(doc, p), expired: expired(p, now), expiringSoon: !!p.validTo && !expired(p, now) && Date.parse(p.validTo + "T23:59:59Z") - now <= 90 * DAY, children: doc.pools.filter((c) => c.parent === p.id && !c.revokedAt).length }));
  const roots = pools.filter((p) => !p.parent);
  const personAllocs = doc.allocations.filter((a) => !a.revokedAt && a.to.type === "person");
  const byPerson = new Map(); for (const a of personAllocs) byPerson.set(a.to.crmId, (byPerson.get(a.to.crmId) || 0) + a.qty);
  const byRegion = {}; for (const a of personAllocs) { const pool = doc.pools.find((p) => p.id === a.poolId); const r = regionOf(pool && pool.holder && pool.holder.domain) || "other"; byRegion[r] = (byRegion[r] || 0) + 1; }
  const months = []; for (let i = 11; i >= 0; i--) { const d = new Date(now); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - i); months.push(d.toISOString().slice(0, 7)); }
  const growth = months.map((m) => new Set(personAllocs.filter((a) => a.at.slice(0, 7) <= m).map((a) => a.to.crmId)).size);
  const bySku = {}; for (const p of roots) { if (!bySku[p.sku]) bySku[p.sku] = { sku: p.sku, title: p.title, qty: 0, allocated: 0 }; bySku[p.sku].qty += p.qty; bySku[p.sku].allocated += p.qty - p.balance; }
  return {
    pools, allocations: doc.allocations,
    summary: { pools: roots.length, seats: roots.reduce((s, p) => s + p.qty, 0), allocated: roots.reduce((s, p) => s + p.qty - p.balance, 0), balance: roots.reduce((s, p) => s + p.balance, 0), expiringSoon: pools.filter((p) => p.expiringSoon).length, expired: pools.filter((p) => p.expired).length, users: byPerson.size, byRegion, growth: { months, users: growth }, bySku: Object.values(bySku).sort((a, b) => b.qty - a.qty) },
  };
}

module.exports = { BLOB, HOLDER_TYPES, REGIONS, INST_TYPES, readDoc, writeDoc, createPool, allocate, revoke, view, balance, allocated };
