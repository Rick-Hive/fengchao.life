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
//   POST   crm/import-teams {team?, dryRun?}
//                                     the same, but reading the team's channels with the app identity
//                                     (needs the Hive CRM Teams app installed in that team — see teams-app);
//                                     403 teams_forbidden until then
//   GET    crm/teams-app              the Teams app package (zip) that grants that read, for upload in Teams
//
// Access is the matrix in ../shared/crm.js: orders need at least `masked`
// to read and `rw` to change. Masking happens here, before the reply.
const { userRoles, normUser, isAdmin, staffFunctions } = require("../shared/roles");
const crm = require("../shared/crm");
const equip = require("../shared/equip");
const teamsOrders = require("../shared/teamsOrders");
const teamsFetch = require("../shared/teamsFetch");
const hub = require("../shared/hub");
const digest = require("../shared/digest");
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
      let people = null;
      try { people = (await hub.rebuild({ log: (m) => context.log(m) })).stats; } catch (err) { context.log.error("crm: hub rebuild after sync failed: " + ((err && err.stack) || err)); }
      ok(context, { ok: true, status: equip.status(data), people });
    } catch (err) {
      if (err.code === "no_pat") { fail(context, 503, "no_pat", { message: err.message }); return; }
      if (err.code === "bad_pat") { fail(context, 503, "bad_pat", { message: err.message }); return; }
      throw err;
    }
    return;
  }

  // Parsed messages → stored orders (shared by the two import routes).
  async function importMessages(input, dry, source) {
    const snapshot = await readSnapshot();
    const { orders, skipped, messages } = teamsOrders.parseExport(input, snapshot);
    const created = [], existing = [];
    for (const o of orders) {
      if (!crm.ID_RE.test(o.orderId)) { skipped.push({ id: o.orderId, preview: "order id of an unknown shape" }); continue; }
      if (await crm.readOrder(o.orderId)) { existing.push(o.orderId); continue; }
      if (!dry) await crm.writeOrder(o);
      created.push(o.orderId);
    }
    if (!dry) await audit(context, { action: "crm.orders.import", by: normUser(user), source, messages, created: created.length, existing: existing.length, skipped: skipped.length });
    return { ok: true, dryRun: dry, messages, parsed: orders.length, created, existing, skipped, preview: dry ? orders.slice(0, 50) : undefined };
  }

  if (method === "POST" && action === "import") {
    if (!isAdmin(roles)) { fail(context, 403, "no_access"); return; }
    const body = req.body && typeof req.body === "object" ? req.body : {};
    ok(context, await importMessages(body, body.dryRun === true, "file"));
    return;
  }

  if (method === "POST" && action === "import-teams") {
    if (!isAdmin(roles)) { fail(context, 403, "no_access"); return; }
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const teamName = String(body.team || process.env.HIVE_ORDERS_TEAM || "Hive Orders").slice(0, 80);
    let fetched;
    try {
      fetched = await teamsFetch.fetchChannelMessages(teamName);
    } catch (err) {
      if (err.code === "teams_forbidden") { fail(context, 403, "teams_forbidden", { team: err.team, channel: err.channel, message: err.message }); return; }
      if (err.code === "no_team") { fail(context, 404, "no_team", { team: teamName }); return; }
      throw err;
    }
    const result = await importMessages(fetched.messages, body.dryRun === true, "teams:" + fetched.team.name);
    ok(context, Object.assign(result, { team: fetched.team.name, channels: fetched.channels }));
    return;
  }

  if (method === "GET" && action === "teams-app") {
    if (!isAdmin(roles)) { fail(context, 403, "no_access"); return; }
    const zipBuf = teamsFetch.teamsApp();
    context.res = { status: 200, headers: { "Content-Type": "application/zip", "Content-Disposition": 'attachment; filename="hive-crm-teams-app.zip"', "Cache-Control": "no-store" }, body: zipBuf, isRaw: true };
    return;
  }

  // ---- 人员库 (api/shared/hub.js) ----------------------------------------
  // GET people          the hub, every person masked by the reader's access map
  // GET person?id=      one person (same masking)
  // GET queue           the merge suggestions (level 3) still waiting for a verdict
  // POST queue          { key, verdict: "same" | "different" } → stored, hub rebuilt
  // POST people-rebuild rebuild from the current sources (orders rw or sysadmin)
  if (method === "GET" && action === "people") {
    const h = await hub.readHub();
    if (!h) { ok(context, { people: [], queue: [], stats: null, generatedAt: null, access: acc }); return; }
    const canMerge = isAdmin(roles) || crm.atLeast(roles, "orders", "rw");
    ok(context, { people: h.people.map((p) => hub.maskPerson(p, acc)), queue: canMerge ? h.queue : [], stats: h.stats, generatedAt: h.generatedAt, sources: h.sources, access: acc, canMerge });
    return;
  }
  if (method === "GET" && action === "person") {
    const id = String((req.query && req.query.id) || "").trim().toUpperCase();
    if (!/^HC-\d{6}$/.test(id)) { fail(context, 400, "bad_id"); return; }
    const h = await hub.readHub();
    const p = h && h.people.find((x) => x.crmId === id);
    if (!p) { fail(context, 404, "not_found"); return; }
    ok(context, { person: hub.maskPerson(p, acc), access: acc });
    return;
  }
  if (action === "queue") {
    if (!isAdmin(roles) && !crm.atLeast(roles, "orders", "rw")) { fail(context, 403, "no_access"); return; }
    if (method === "GET") { const h = await hub.readHub(); ok(context, { queue: (h && h.queue) || [], generatedAt: h && h.generatedAt }); return; }
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const key = String(body.key || "");
    const verdict = String(body.verdict || "");
    if (!/^(account|customer):[^|]+\|(account|customer):[^|]+$/.test(key) || !["same", "different"].includes(verdict)) { fail(context, 400, "bad_verdict"); return; }
    const d = await hub.readDecisions();
    d.pairs[key] = { verdict, by: normUser(user), at: new Date().toISOString() };
    await hub.writeDecisions(d);
    await audit(context, { action: "crm.people.merge", by: normUser(user), key, verdict });
    const h = await hub.rebuild({ log: (m) => context.log(m) });
    ok(context, { ok: true, stats: h.stats, queue: h.queue });
    return;
  }
  // CRM ID write-back to the Airtable Customers (decision 3: the only write, confirmed each
  // run). dryRun lists what would be written; a real run writes empty CRM ID fields only.
  if (method === "POST" && action === "writeback") {
    if (!isAdmin(roles) && !crm.atLeast(roles, "orders", "rw")) { fail(context, 403, "no_access"); return; }
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const h = await hub.readHub();
    if (!h) { fail(context, 409, "no_hub"); return; }
    const pairs = [];
    for (const p of h.people) for (const recId of p.writeBack || []) { const c = (p.facets.customers || []).find((x) => x.recId === recId) || {}; pairs.push({ recId, crmId: p.crmId, name: c.name || p.name, email: p.primaryEmail }); }
    if (body.dryRun === true) { ok(context, { ok: true, dryRun: true, count: pairs.length, preview: pairs.slice(0, 50).map((x) => ({ crmId: x.crmId, name: x.name })) }); return; }
    let result;
    try {
      result = await equip.writeBackCrmIds(pairs.map((x) => ({ recId: x.recId, crmId: x.crmId })), { log: (m) => context.log(m) });
    } catch (err) {
      if (err.code === "no_pat" || err.code === "bad_pat" || err.code === "no_write" || err.code === "no_field") { fail(context, err.code === "no_field" ? 409 : 503, err.code, { message: err.message }); return; }
      throw err;
    }
    await audit(context, { action: "crm.people.writeback", by: normUser(user), written: result.written.length, already: result.already.length, conflicts: result.conflicts.length, missing: result.missing.length });
    let stats = null;
    try { stats = (await hub.rebuild({ log: (m) => context.log(m) })).stats; } catch (err) { context.log.error("crm: hub rebuild after write-back failed: " + ((err && err.stack) || err)); }
    ok(context, { ok: true, written: result.written.length, already: result.already.length, conflicts: result.conflicts, missing: result.missing.length, stats });
    return;
  }

  // 待处理与异常 digest to the order manager: GET previews (what would be sent, to whom,
  // when it last went), POST sends now (force).
  if (action === "digest") {
    if (!isAdmin(roles) && !crm.atLeast(roles, "orders", "rw")) { fail(context, 403, "no_access"); return; }
    if (method === "GET") {
      const d = await digest.collect();
      const to = await digest.recipients().catch(() => []);
      const m = digest.compose(d, new Date().toISOString().slice(0, 10));
      ok(context, { summary: { total: d.total, overdue: d.overdue.length, notifyFailed: d.notifyFailed.length, queue: d.queue, replace: d.replace, replaceWithOrders: d.replaceWithOrders, writeBack: d.writeBack }, to, text: m.text, subject: m.subject, last: await digest.readLast().catch(() => null), configured: !!process.env.POWER_AUTOMATE_URL, channel: !!(process.env.CRM_DIGEST_CHANNEL_ID || process.env.DEFAULT_TEAMS_CHANNEL_ID) });
      return;
    }
    try {
      const r = await digest.run({ force: true, log: (m) => context.log(m) });
      await audit(context, { action: "crm.digest", by: normUser(user), to: r.to, total: r.summary.total, status: r.status });
      ok(context, { ok: r.ok !== false, sent: !!r.sent, to: r.to, status: r.status, total: r.summary.total });
    } catch (err) {
      if (err.code === "no_flow" || err.code === "no_recipient") { fail(context, 503, err.code, { message: err.message }); return; }
      throw err;
    }
    return;
  }

  if (method === "POST" && action === "people-rebuild") {
    if (!isAdmin(roles) && !crm.atLeast(roles, "orders", "rw")) { fail(context, 403, "no_access"); return; }
    const h = await hub.rebuild({ log: (m) => context.log(m) });
    await audit(context, { action: "crm.people.rebuild", by: normUser(user), stats: h.stats });
    ok(context, { ok: true, stats: h.stats, generatedAt: h.generatedAt });
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
