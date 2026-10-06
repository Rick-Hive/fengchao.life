// /api/crm/{action} — the CRM module (design doc "Hive CRM 设计", Rick 2026-10-06).
// Phase 1, first slice: Hive course orders with their fulfilment record.
//
//   GET    crm/access                 the caller's level on every data domain (accessMap)
//   GET    crm/orders                 every stored order, masked to the caller's levels, newest first,
//                                     each with `overdue` (null | {rule, days, limit}); plus counts per tab
//   GET    crm/order?id=FC-…          one order, masked the same way, with `next` = the statuses the
//                                     caller may move it to
//   PATCH  crm/order {orderId, status, note?}
//                                     move an order on (order manager / sysadmin); appends to `history`,
//                                     audit-logged; 409 when someone else changed it first — re-read and retry
//   GET    crm/equip-orders           the Equip (textbook) orders from the last Airtable sync, masked; royalty
//                                     columns only for finance (money rw) and the CEO (decision 6)
//   GET    crm/equip-status           when the Equip base was last synced, counts, warnings
//   POST   crm/sync                   read the Equip base now (sysadmin, or anyone with orders rw)
//   POST   crm/import {messages|value:[chatMessage…], dryRun?}
//                                     recover course orders from a "Hive Orders" Teams channel export
//                                     (sysadmin): parsed, enriched from the snapshot, stored unless they exist
//
// Access is the matrix in ../shared/crm.js: orders need at least `masked`
// to read and `rw` to change. Masking happens here, before the reply.
const { userRoles, normUser, isAdmin, staffFunctions } = require("../shared/roles");
const crm = require("../shared/crm");
const equip = require("../shared/equip");
const teamsOrders = require("../shared/teamsOrders");
const { readSnapshot } = require("../shared/blob");
const { audit } = require("../shared/audit");
const { guard, finish } = require("../shared/session");

// What a reader gets of an Equip order: contact details by `identity`, amounts by `money`,
// the royalty bag only for finance (money rw) or the CEO.
function maskEquip(o, acc, roles) {
  const seeWho = ["read", "rw"].includes(acc.identity);
  const seeMoney = ["read", "rw"].includes(acc.money);
  const seeRoyalty = acc.money === "rw" || staffFunctions(roles).includes("ceo");
  const out = Object.assign({}, o);
  if (!seeWho) { out.email = o.email ? "…@" + String(o.email).split("@")[1] : ""; out.name = o.name ? o.name.slice(0, 1) + "…" : ""; out.comments = ""; }
  if (!seeMoney) { out.amount = null; out.received = null; }
  out.items = (o.items || []).map((it) => {
    const r = Object.assign({}, it);
    if (!seeMoney) { r.unitPrice = null; r.total = null; r.received = null; }
    if (!seeRoyalty) delete r.royalty;
    return r;
  });
  return out;
}

function fail(context, status, error, extra) {
  context.res = { status, headers: { "Cache-Control": "no-store" }, body: Object.assign({ error }, extra || {}) };
}
function ok(context, body) {
  context.res = { status: 200, headers: { "Cache-Control": "no-store" }, body };
}

// Which tab an order belongs to on the 订单 page.
function tabsOf(order, od) {
  const t = [order.status];
  if (od) t.push("overdue");
  if (order.notify && order.notify.ok === false && !order.notify.pending) t.push("notifyFailed");
  return t;
}

async function handler(context, req) {
  const action = String((req.params && req.params.action) || "").toLowerCase();
  const method = String(req.method || "GET").toUpperCase();
  const { user, roles } = await userRoles(req);
  const acc = crm.accessMap(roles);

  if (method === "GET" && action === "access") { ok(context, { access: acc }); return; }

  if (!crm.atLeast(roles, "orders", "masked")) { fail(context, 403, "no_access"); return; }

  if (method === "GET" && action === "orders") {
    const now = Date.now();
    const all = await crm.listOrders();
    const counts = { all: all.length, submitted: 0, confirmed: 0, paid: 0, started: 0, cancelled: 0, overdue: 0, notifyFailed: 0 };
    const orders = all.map((o) => {
      const od = crm.overdue(o, now);
      for (const tb of tabsOf(o, od)) if (tb in counts) counts[tb]++;
      return Object.assign(crm.mask(o, acc), { overdue: od });
    });
    ok(context, { orders, counts, access: acc, statuses: crm.STATUS_LABELS, overdueDays: crm.OVERDUE_DAYS });
    return;
  }

  if (method === "GET" && action === "equip-status") { ok(context, equip.status(await equip.readEquip())); return; }

  if (method === "GET" && action === "equip-orders") {
    const data = await equip.readEquip();
    if (!data) { ok(context, { orders: [], status: equip.status(null), access: acc }); return; }
    ok(context, { orders: data.orders.map((o) => maskEquip(o, acc, roles)), status: equip.status(data), access: acc });
    return;
  }

  if (method === "POST" && action === "sync") {
    if (!isAdmin(roles) && !crm.atLeast(roles, "orders", "rw")) { fail(context, 403, "no_access"); return; }
    try {
      const data = await equip.syncEquip({ log: (m) => context.log(m) });
      await audit(context, { action: "crm.equip.sync", by: normUser(user), counts: data.counts, warnings: data.warnings.length });
      ok(context, { ok: true, status: equip.status(data) });
    } catch (err) {
      if (err.code === "no_pat") { fail(context, 503, "no_pat", { message: err.message }); return; }
      throw err;
    }
    return;
  }

  if (method === "POST" && action === "import") {
    if (!isAdmin(roles)) { fail(context, 403, "no_access"); return; }
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const snapshot = await readSnapshot();
    const { orders, skipped, messages } = teamsOrders.parseExport(body, snapshot);
    const dry = body.dryRun === true;
    const created = [], existing = [];
    for (const o of orders) {
      if (!crm.ID_RE.test(o.orderId)) { skipped.push({ id: o.orderId, preview: "order id of an unknown shape" }); continue; }
      if (await crm.readOrder(o.orderId)) { existing.push(o.orderId); continue; }
      if (!dry) await crm.writeOrder(o);
      created.push(o.orderId);
    }
    if (!dry) await audit(context, { action: "crm.orders.import", by: normUser(user), messages, created: created.length, existing: existing.length, skipped: skipped.length });
    ok(context, { ok: true, dryRun: dry, messages, parsed: orders.length, created, existing, skipped, preview: dry ? orders.slice(0, 50) : undefined });
    return;
  }

  if (action === "order") {
    const id = String((method === "GET" ? req.query && req.query.id : req.body && req.body.orderId) || "").trim();
    if (!crm.ID_RE.test(id)) { fail(context, 400, "bad_id"); return; }
    const cur = await crm.readOrder(id);
    if (!cur) { fail(context, 404, "not_found"); return; }

    if (method === "GET") {
      ok(context, { order: Object.assign(crm.mask(cur.order, acc), { overdue: crm.overdue(cur.order) }), next: crm.atLeast(roles, "orders", "rw") ? crm.nextStatuses(cur.order.status, roles) : [] });
      return;
    }

    // PATCH: a status change.
    if (!crm.atLeast(roles, "orders", "rw")) { fail(context, 403, "no_access"); return; }
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const to = String(body.status || "").toLowerCase();
    if (!crm.STATUSES.includes(to)) { fail(context, 400, "bad_status", { statuses: crm.STATUSES }); return; }
    let next;
    try {
      next = crm.transition(cur.order, to, user, body.note, roles);
    } catch (err) {
      if (err.code === "bad_transition") { fail(context, 400, "bad_transition", { from: cur.order.status, to, allowed: err.allowed }); return; }
      throw err;
    }
    try {
      await crm.writeOrder(next, cur.etag);
    } catch (err) {
      if (err && (err.statusCode === 412 || err.statusCode === 409)) { fail(context, 409, "changed_meanwhile"); return; }
      throw err;
    }
    await audit(context, { action: "crm.order.status", by: normUser(user), orderId: id, from: cur.order.status, to, note: String(body.note || "").slice(0, 500) });
    ok(context, { ok: true, order: Object.assign(crm.mask(next, acc), { overdue: crm.overdue(next) }), next: crm.nextStatuses(next.status, roles) });
    return;
  }

  fail(context, 404, "unknown_action");
}

module.exports = async function (context, req) {
  const s = await guard(context, req);
  if (!s) return;
  try {
    await handler(context, req);
  } catch (err) {
    context.log.error("crm: " + ((err && err.stack) || err));
    fail(context, 500, String((err && err.message) || err));
  }
  finish(context, s);
};
