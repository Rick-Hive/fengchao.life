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
//   crm/partners, partner, project, people-search, org-search, contact, partner-config
//                                     the 合作伙伴 module — see ./partners.js
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
const royalty = require("../shared/royalty");
const licenses = require("../shared/licenses");
const { readSnapshot } = require("../shared/blob");
const { audit } = require("../shared/audit");
const { guard, finish } = require("../shared/session");
const partnersApi = require("./partners");

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

  // 合作伙伴 (api/crm/partners.js): partners ≥ read, not tied to orders.
  if (await partnersApi.handle(context, req, { action, method, user, roles, acc, ok, fail })) return;

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
  // The textbook catalogue with each SKU's last sale (catalogue ≥ read): the long tail
  // — available titles nobody bought in a year — is the curriculum director's panel.
  if (method === "GET" && action === "catalogue") {
    if (!crm.atLeast(roles, "catalogue", "read")) { fail(context, 403, "no_access"); return; }
    const data = await equip.readEquip();
    if (!data) { ok(context, { skus: [], syncedAt: null }); return; }
    const last = new Map(), units = new Map();
    for (const o of data.orders || []) for (const it of o.items || []) { if (!it.sku) continue; const d = String(o.date || "").slice(0, 10); if (!last.has(it.sku) || d > last.get(it.sku)) last.set(it.sku, d); units.set(it.sku, (units.get(it.sku) || 0) + (it.qty || 0)); }
    const skus = (data.curriculums || []).map((c) => ({ sku: c.sku, nameZh: c.nameZh, nameEn: c.nameEn, publisher: c.publisher, category: c.category, subject: c.subject, grade: c.grade, language: c.language, available: c.available, onEquipme: c.onEquipme, price: ["read", "rw"].includes(acc.money) ? c.price : null, lastSale: last.get(c.sku) || null, unitsEver: units.get(c.sku) || 0 }));
    ok(context, { skus, syncedAt: data.syncedAt || null });
    return;
  }

  if (method === "GET" && action === "equip-orders") {
    const data = await equip.readEquip();
    if (!data) { ok(context, { orders: [], status: equip.status(null), access: acc }); return; }
    ok(context, { orders: data.orders.map((o) => maskEquip(o, acc, roles)), status: equip.status(data), access: acc });
    return;
  }

  if (method === "POST" && action === "sync") {
    if (!isAdmin(roles) && !crm.atLeast(roles, "orders", "rw")) { fail(context, 403, "no_access"); return; }
    try {
      // force (system administrator only) overrides the suspicious-drop guard when the deletions are real.
      const force = !!(req.body && req.body.force) && isAdmin(roles);
      const data = await equip.syncEquip({ log: (m) => context.log(m), force });
      await audit(context, { action: "crm.equip.sync", by: normUser(user), counts: data.counts, warnings: data.warnings.length, force });
      let people = null;
      try { people = (await hub.rebuild({ log: (m) => context.log(m) })).stats; } catch (err) { context.log.error("crm: hub rebuild after sync failed: " + ((err && err.stack) || err)); }
      ok(context, { ok: true, status: equip.status(data), people });
    } catch (err) {
      if (err.code === "no_pat") { fail(context, 503, "no_pat", { message: err.message }); return; }
      if (err.code === "bad_pat") { fail(context, 503, "bad_pat", { message: err.message }); return; }
      if (err.code === "suspicious_drop") { fail(context, 409, "suspicious_drop", { message: err.message, drops: err.drops, canForce: isAdmin(roles) }); return; }
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
    const canMark = isAdmin(roles) || crm.atLeast(roles, "identity", "rw");
    const marks = await hub.readMarks().catch(() => ({ marks: {} }));
    const famById = new Map((h.families || []).map((f) => [f.id, f]));
    const people = hub.withMarks(h.people, marks).map((p) => hub.maskPerson(p.familyId && famById.has(p.familyId) ? Object.assign({}, p, { family: famById.get(p.familyId) }) : p, acc));
    ok(context, { people, queue: canMerge ? h.queue : [], stats: Object.assign({}, h.stats, hub.markStats(h.people, marks)), generatedAt: h.generatedAt, sources: h.sources, access: acc, canMerge, canMark });
    return;
  }
  // 机构 (phase 3): one row per school domain with its names, partnership stage, accounts,
  // customers and this school year's sales. partners ≥ read; the stage is set by partners rw.
  if (action === "institutions") {
    if (!crm.atLeast(roles, "partners", "read")) { fail(context, 403, "no_access"); return; }
    const canEdit = isAdmin(roles) || crm.atLeast(roles, "partners", "rw");
    const seeMoney = ["read", "rw"].includes(acc.money);
    const peopleMod = require("../shared/people");
    const P = require("../shared/partners");
    let [h, inst, partners, data, relsDoc, orgsDoc] = await Promise.all([hub.readHub(), peopleMod.readInstitutions().catch(() => ({ institutions: {} })), hub.readPartners().catch(() => ({ partners: {} })), equip.readEquip().catch(() => null), P.readRels().catch(() => ({ items: {} })), P.readOrgs().catch(() => ({ byKey: {}, orgs: {} }))]);
    // A people.json built by an older version has no institutions (Rick, 2026-10-08:
    // 「为什么机构里还是空的？」— the hub is rebuilt after a sync, and none had run since
    // the deploy). Rebuild once here instead of showing an empty page.
    // Also when the stored rows predate the Hive-workspace join (no `kind`), and on
    // 刷新 with ?rebuild=1 (anyone who may edit partnerships): the rows are rebuilt from
    // the tenant's directories and the Schools table before they are returned.
    const wantRebuild = method === "GET" && String((req.query && req.query.rebuild) || "") === "1" && canEdit;
    const stale = method === "GET" && h && h.people && h.people.length && (!Array.isArray(h.institutions) || !h.institutions.some((i) => i.kind));
    if (wantRebuild || stale) {
      try { h = await hub.rebuild({ log: (m) => context.log(m) }); } catch (err) { context.log.error("crm: hub rebuild for institutions failed: " + ((err && err.stack) || err)); }
    }
    if (method === "POST") {
      if (!canEdit) { fail(context, 403, "no_access"); return; }
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const rawKey = String(body.key || body.domain || "").trim();
      // 内部 (design v2 §13): our own entities never become partners; the flag lives on the ORG record.
      if (typeof body.internal === "boolean") {
        const k = /^hive:/i.test(rawKey) ? "hive:" + rawKey.slice(5).toUpperCase() : rawKey.toLowerCase();
        const row = ((h && h.institutions) || []).find((i) => (i.key || i.domain) === k);
        if (!row) { fail(context, 404, "not_found"); return; }
        const { doc } = await P.updateOrgs((o) => { const id = P.orgIdFor(o, k, { name: row.name || row.nameEn || "" }); o.orgs[id].internal = body.internal; });
        await audit(context, { action: "crm.institution.internal", by: normUser(user), key: k, internal: body.internal });
        ok(context, { ok: true, internal: body.internal, orgId: doc.byKey[k] });
        return;
      }
      const domain = /^hive:/i.test(rawKey) ? "hive:" + rawKey.slice(5).toUpperCase() : rawKey.toLowerCase(), stage = String(body.stage || "");
      if (!(/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain) || /^hive:[A-Z0-9\u4e00-\u9fff]{1,12}$/.test(domain)) || (stage && !hub.PARTNER_STAGES.includes(stage))) { fail(context, 400, "bad_request"); return; }
      const type = String(body.type || ""), region = String(body.region || "");
      if ((type && !licenses.INST_TYPES.includes(type)) || (region && !licenses.REGIONS.includes(region))) { fail(context, 400, "bad_request"); return; }
      const saved = await hub.updatePartners((d) => {
        if (stage || body.note || body.owner || type || region) d.partners[domain] = { stage, note: String(body.note || "").slice(0, 500), owner: String(body.owner || "").slice(0, 120), type, region, by: normUser(user), at: new Date().toISOString() };
        else delete d.partners[domain];
      });
      await audit(context, { action: "crm.partner.update", by: normUser(user), domain, stage });
      ok(context, { ok: true, partner: saved.doc.partners[domain] || null });
      return;
    }
    // this school year's Equip sales per institution: the customers' orders in the FY
    const now = new Date(), fy = now.getMonth() + 1 >= 8 ? now.getFullYear() : now.getFullYear() - 1, fyStart = fy + "-08";
    const custPerson = new Map(); for (const p of (h && h.people) || []) for (const c of p.facets.customers || []) custPerson.set(c.recId, p.crmId);
    const fySales = new Map(), fyOrders = new Map();
    for (const o of (data && data.orders) || []) { if (String(o.date || "").slice(0, 7) < fyStart) continue; const id = custPerson.get(o.customerRec); if (!id) continue; fySales.set(id, (fySales.get(id) || 0) + (o.amount || 0)); fyOrders.set(id, (fyOrders.get(id) || 0) + 1); }
    // A row's key is its tenant domain, or "hive:<abbr>" for a Hive-workspace institution without one.
    const rows = ((h && h.institutions) || []).map((i) => {
      const key = i.key || i.domain;
      const n = (i.domain && inst.institutions[i.domain]) || {}, pt = partners.partners[key] || null;
      const fySum = (i.customerIds || []).reduce((a, id) => a + (fySales.get(id) || 0), 0), fyN = (i.customerIds || []).reduce((a, id) => a + (fyOrders.get(id) || 0), 0);
      const orgId = orgsDoc.byKey[key] || null, org = orgId ? orgsDoc.orgs[orgId] : null;
      const rels = Object.values(relsDoc.items || {}).filter((r) => r.party && r.party.kind === "org" && (r.party.key === key || (orgId && r.party.id === orgId)) && P.TYPES[r.type]).map((r) => ({ id: r.id, type: r.type, stage: r.stage, closed: !!r.closed, owner: r.owner || "" }));
      return { key, domain: i.domain || "", kind: i.kind || "tenant", name: n.name || i.name || "", nameEn: n.nameEn || i.nameEn || "", abbr: i.abbr || "", type: i.type || "", region: i.region || "", country: i.country || "", city: i.city || "", website: i.website || "", courses: i.courses || 0, partner: pt, orgId, internal: !!(org && org.internal), rels, accounts: i.accounts, active: i.active, people: i.people, customers: i.customers, buyers: i.buyers, leads: i.leads, families: i.families, orders: i.orders, hiveOrders: i.hiveOrders, spend: seeMoney ? i.spend : null, fyOrders: fyN, fySales: seeMoney ? fySum : null };
    });
    ok(context, { rows, fy, canEdit, stages: hub.PARTNER_STAGES, types: P.TYPES, stageLabels: Object.fromEntries(Object.entries(P.STAGES).map(([t, st]) => [t, Object.fromEntries(st.map((x) => [x.k, [x.zh, x.en]]))])), generatedAt: h && h.generatedAt, hiveRows: rows.filter((r) => r.kind !== "tenant").length, rebuilt: !!(wantRebuild || stale), access: acc });
    return;
  }
  // 待替换邮箱 marks: POST { crmId, status: "notified" | "replaced" | "" , note } (identity rw or sysadmin).
  if (method === "POST" && action === "email-replace") {
    if (!isAdmin(roles) && !crm.atLeast(roles, "identity", "rw")) { fail(context, 403, "no_access"); return; }
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const id = String(body.crmId || "").toUpperCase(), status = String(body.status || "");
    if (!/^HC-\d{6}$/.test(id) || !["notified", "replaced", ""].includes(status)) { fail(context, 400, "bad_request"); return; }
    const h = await hub.readHub();
    const p = h && h.people.find((x) => x.crmId === id);
    if (!p) { fail(context, 404, "not_found"); return; }
    const email = hub.replaceEmailOf(p);
    if (!email) { fail(context, 409, "no_replace_email"); return; }
    const { doc } = await hub.updateMarks((d) => {
      if (!status) delete d.marks[email]; else d.marks[email] = { status, by: normUser(user), at: new Date().toISOString(), note: String(body.note || "").slice(0, 200) };
    });
    await audit(context, { action: "crm.email.replace", by: normUser(user), crmId: id, status: status || "cleared" });
    ok(context, { ok: true, mark: status ? Object.assign({ email }, doc.marks[email]) : null, stats: hub.markStats(h.people, doc) });
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
    await hub.updateDecisions((d) => { d.pairs[key] = { verdict, by: normUser(user), at: new Date().toISOString() }; });
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
      const ch = await digest.channel().catch(() => ({ id: "", from: "" }));
      const m = digest.compose(d, new Date().toISOString().slice(0, 10));
      ok(context, { summary: { total: d.total, overdue: d.overdue.length, notifyFailed: d.notifyFailed.length, queue: d.queue, replace: d.replace, replaceWithOrders: d.replaceWithOrders, writeBack: d.writeBack }, to, text: m.text, subject: m.subject, last: await digest.readLast().catch(() => null), configured: !!process.env.POWER_AUTOMATE_URL, channel: !!ch.id, channelFrom: ch.from });
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

  // 版税结算表: finance (money rw) and the CEO; paid marks by finance only.
  if (action === "royalty") {
    const canSee = crm.atLeast(roles, "money", "rw") || staffFunctions(roles).includes("ceo");
    if (!canSee) { fail(context, 403, "no_access"); return; }
    const canPay = crm.atLeast(roles, "money", "rw");
    if (method === "GET") {
      const data = await equip.readEquip();
      const table = royalty.build(data, { quarters: Number((req.query && req.query.quarters) || 8) || 8 });
      ok(context, Object.assign(table, { paid: (await royalty.readPaid()).paid || {}, canPay }));
      return;
    }
    if (!canPay) { fail(context, 403, "no_access"); return; }
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const pub = String(body.key || body.publisher || "").slice(0, 80), q = String(body.quarter || "");
    if (!pub || !/^\d{4} Q[1-4]$/.test(q)) { fail(context, 400, "bad_request"); return; }
    const key = pub + "|" + q;
    const { doc } = await royalty.updatePaid((d) => {
      if (body.paid) d.paid[key] = { by: normUser(user), at: new Date().toISOString(), note: String(body.note || "").slice(0, 200), amount: typeof body.amount === "number" ? body.amount : null };
      else delete d.paid[key];
    });
    await audit(context, { action: "crm.royalty.paid", by: normUser(user), publisher: pub, quarter: q, paid: !!body.paid, amount: body.amount });
    ok(context, { ok: true, key, mark: doc.paid[key] || null });
    return;
  }

  // ---- 录入 (phase 4): orders rw. POST entry { customer: { recId | new: {first,last,email,teams,city} },
  // date, comments, received, items: [{sku, qty, unitPrice}] } → Airtable, then a sync + rebuild.
  if (method === "POST" && action === "entry") {
    if (!crm.atLeast(roles, "orders", "rw")) { fail(context, 403, "no_access"); return; }
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const c = body.customer || {};
    try {
      let customerRec = String(c.recId || "");
      let newCustomer = false;
      if (!customerRec && c.new) {
        const nc = c.new;
        if (!nc.email && !nc.teams) { fail(context, 400, "bad_request", { message: "a new customer needs an email or a Teams account" }); return; }
        customerRec = await equip.createCustomer({ email: nc.email, teams: nc.teams, first: nc.first, last: nc.last, city: nc.city }, { log: (m) => context.log(m) });
        newCustomer = true;
      }
      if (!customerRec) { fail(context, 400, "bad_request", { message: "customer missing" }); return; }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(body.date || ""))) { fail(context, 400, "bad_request", { message: "date must be YYYY-MM-DD" }); return; }
      const r = await equip.createOrder({ customerRec, date: body.date, comments: String(body.comments || "").slice(0, 500), received: typeof body.received === "number" ? body.received : undefined, items: body.items || [] }, { log: (m) => context.log(m) });
      await audit(context, { action: "crm.entry.order", by: normUser(user), orderId: r.orderId, orderRec: r.orderRec, customerRec, newCustomer, lines: (body.items || []).length });
      let status = null;
      try { const data = await equip.syncEquip({ log: (m) => context.log(m) }); status = equip.status(data); await hub.rebuild({ log: (m) => context.log(m) }); } catch (err) { context.log.warn("crm: sync after entry failed: " + ((err && err.message) || err)); }
      ok(context, { ok: true, orderId: r.orderId, orderRec: r.orderRec, customerRec, newCustomer, lines: r.itemRecs.length, status });
    } catch (err) {
      if (["no_pat", "bad_pat", "no_write", "no_field", "bad_sku", "bad_request"].includes(err.code)) { fail(context, err.code === "no_write" || err.code === "no_pat" ? 503 : 400, err.code, { message: err.message, sku: err.sku }); return; }
      throw err;
    }
    return;
  }
  // 标收款: POST received { recId, received } → Airtable "Received Amount" (orders rw or money rw).
  if (method === "POST" && action === "received") {
    if (!crm.atLeast(roles, "orders", "rw") && !crm.atLeast(roles, "money", "rw")) { fail(context, 403, "no_access"); return; }
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const recId = String(body.recId || ""), received = Number(body.received);
    if (!/^rec[A-Za-z0-9]+$/.test(recId) || !Number.isFinite(received) || received < 0) { fail(context, 400, "bad_request"); return; }
    try {
      await equip.setReceived(recId, received, { log: (m) => context.log(m) });
      const data = await equip.readEquip();
      if (data) { const o = (data.orders || []).find((x) => x.recId === recId); if (o) { o.received = received; await equip.writeEquip(data); } }
      await audit(context, { action: "crm.entry.received", by: normUser(user), orderRec: recId, received });
      ok(context, { ok: true });
    } catch (err) {
      if (["no_pat", "bad_pat", "no_write", "no_field"].includes(err.code)) { fail(context, 503, err.code, { message: err.message }); return; }
      throw err;
    }
    return;
  }
  // 动态 (feed): the CRM's own audit lines, newest first (orders ≥ read; names masked below identity read).
  if (method === "GET" && action === "feed") {
    const limit = Math.min(200, Number((req.query && req.query.limit) || 50) || 50);
    const { readAudit } = require("../shared/audit");
    const lines = await readAudit({ months: 2, filter: (e) => /^crm\./.test(String(e.action || "")) });
    const seeWho = ["read", "rw"].includes(acc.identity);
    const out = lines.slice(0, limit).map((e) => { const o = Object.assign({}, e); if (!seeWho) { for (const k of ["target", "email"]) if (o[k]) o[k] = "…"; } return o; });
    ok(context, { feed: out, access: acc });
    return;
  }

  // ---- 许可 (phase 5 first cut): pools and allocations. drm ≥ read to see; drm rw to change.
  if (action === "licenses") {
    if (!crm.atLeast(roles, "drm", "read")) { fail(context, 403, "no_access"); return; }
    const canEdit = isAdmin(roles) || crm.atLeast(roles, "drm", "rw");
    const partners = await hub.readPartners().catch(() => ({ partners: {} }));
    const regionOf = (domain) => (domain && partners.partners[domain] && partners.partners[domain].region) || "other";
    const doc = await licenses.readDoc();
    if (method === "GET") {
      const v = licenses.view(doc, { regionOf });
      const person = String((req.query && req.query.person) || "");
      if (person) { ok(context, { allocations: doc.allocations.filter((a) => a.to.type === "person" && a.to.crmId === person).map((a) => Object.assign({}, a, { pool: v.pools.find((p) => p.id === a.poolId) || doc.pools.find((p) => p.id === a.poolId) })) }); return; }
      const seeWho = ["read", "rw"].includes(acc.identity);
      if (!seeWho) v.allocations = v.allocations.map((a) => a.to.type === "person" ? Object.assign({}, a, { to: Object.assign({}, a.to, { name: a.to.name ? a.to.name.slice(0, 1) + "…" : "" }) }) : a);
      ok(context, Object.assign(v, { canEdit, regions: licenses.REGIONS, instTypes: licenses.INST_TYPES, access: acc }));
      return;
    }
    if (!canEdit) { fail(context, 403, "no_access"); return; }
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const by = normUser(user);
    if (!["pool", "allocate", "revoke"].includes(body.op)) { fail(context, 400, "bad_request"); return; }
    try {
      // The balance check and the write happen on the same copy, under the ETag: two
      // allocations racing for the last seats cannot both succeed.
      const saved = await licenses.updateDoc((d) => {
        if (body.op === "pool") return licenses.createPool(d, body, by);
        if (body.op === "allocate") return licenses.allocate(d, body, by);
        return licenses.revoke(d, String(body.id || ""), by, undefined, body.note);
      });
      const result = saved.result;
      await audit(context, { action: "crm.license." + body.op, by, id: result.id, poolId: result.poolId || result.id, qty: result.qty, to: result.to, sku: result.sku });
      ok(context, { ok: true, result, view: licenses.view(saved.doc, { regionOf }) });
    } catch (err) {
      if (["bad_request", "not_found", "expired", "insufficient", "has_children"].includes(err.code)) { fail(context, err.code === "not_found" ? 404 : 400, err.code, { message: err.message, balance: err.balance }); return; }
      throw err;
    }
    return;
  }

  if (method === "POST" && action === "people-rebuild") {
    if (!isAdmin(roles) && !crm.atLeast(roles, "orders", "rw")) { fail(context, 403, "no_access"); return; }
    // 重新匹配 re-reads Airtable first (Rick, 2026-10-08: edited customers in Airtable,
    // pressed 重新匹配, the rows did not change — the hub was rebuilt from the Equip
    // copy of the day before). A sync failure does not stop the rebuild; it is reported.
    let synced = null, syncError = "";
    try { const data = await equip.syncEquip({ log: (m) => context.log(m) }); synced = equip.status(data); } catch (err) { syncError = (err && err.message) || String(err); context.log.warn("crm: sync before rebuild failed: " + syncError); }
    const h = await hub.rebuild({ log: (m) => context.log(m) });
    await audit(context, { action: "crm.people.rebuild", by: normUser(user), stats: h.stats, synced: !!synced });
    ok(context, { ok: true, stats: h.stats, generatedAt: h.generatedAt, synced, syncError });
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
