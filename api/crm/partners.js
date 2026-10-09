// /api/crm/{partners|partner|project|people-search|org-search|contact|partner-config}
// — the 合作伙伴 module (design 「合作伙伴模块设计 v2」, Rick 2026-10-08). Split out of
// index.js, which calls handle() first; true = handled.
//
//   GET  crm/partners?type=it[&all=1]   the type page: relationships with health, stages, kinds, summary
//   GET  crm/partner?id=REL-…           one relationship with its projects and party
//   POST crm/partner {op: create|move|update|note|close|reopen, …}
//   POST crm/project {op: create|update|status|milestone|addMilestone|removeMilestone|participant|note, …}
//   GET  crm/people-search?q=           the people picker (name / email / UPN / CRM ID)
//   GET  crm/org-search?q=              the organization picker (机构 rows of the hub)
//   POST crm/contact {name,email,org,lang} a person entered by hand → the people hub
//   GET/POST crm/partner-config          exclusions and thresholds (system administrator)
//
// Who may do what (design §14): everyone with partners ≥ read sees the pages (the
// fundraising type, the one confidential type, left for Zoohu — Rick, 2026-10-09).
// Moves and edits: partners rw, the system administrator, the CEO, or the type's owning
// function (community for course providers, curriculum for curriculum developers).
const P = require("../shared/partners");
const hub = require("../shared/hub");
const crm = require("../shared/crm");
const { normUser, isAdmin, staffFunctions } = require("../shared/roles");
const { audit } = require("../shared/audit");

const ACTIONS = new Set(["partners", "partner", "project", "people-search", "org-search", "contact", "partner-config", "partners-seed"]);

function canEditType(roles, type) {
  const f = staffFunctions(roles);
  if (isAdmin(roles) || crm.atLeast(roles, "partners", "rw") || f.includes("ceo")) return true;
  const owner = P.TYPES[type] && P.TYPES[type].owner;
  return !!(owner && f.includes(owner)) || (type === "publisher" && f.includes("curriculum"));
}
function canSeeType(roles, type) { return !!P.TYPES[type]; }

// The institution rows of the hub, by key, for party names and metrics.
async function orgIndex() {
  const h = await hub.readHub().catch(() => null);
  const m = new Map();
  for (const i of (h && h.institutions) || []) m.set(i.key || i.domain, i);
  return { map: m, people: (h && h.people) || [] };
}
function metricsFor(rel, idx) {
  if (!rel.party || rel.party.kind !== "org") return null;
  const i = idx.map.get(rel.party.key);
  if (!i) return null;
  return { accounts: i.accounts || 0, active: i.active || 0, customers: i.customers || 0, courses: i.courses || 0, hiveOrders: i.hiveOrders || 0 };
}
function partyName(rel, idx) {
  if (!rel.party) return "";
  if (rel.party.kind === "org") { const i = idx.map.get(rel.party.key); return (i && (i.name || i.nameEn)) || rel.party.name || rel.party.key; }
  const p = idx.people.find((x) => x.crmId === rel.party.id);
  return (p && p.name) || rel.party.name || rel.party.id;
}
// Who can be 我方负责人: our staff — admins, staff:<function> holders and anyone with
// partners rw — from roles.json (Rick, 2026-10-08: the 出版社 row had a primary contact
// but 负责人 still 待分配 — the two are different people: ours and theirs).
async function ownerCandidates() {
  const doc = await require("../shared/roles").readRoles().catch(() => ({ entries: [] }));
  const out = new Set();
  for (const e of (doc && doc.entries) || []) {
    const rs = e.roles || [];
    if (rs.some((r) => r === "admin" || /^staff:/.test(r)) || crm.atLeast(rs, "partners", "rw")) out.add(normUser(e.user));
  }
  return Array.from(out).filter(Boolean).sort();
}
// A person field may arrive as a CRM id (the people-hub picker, for a viewer who may
// not see accounts): it is stored as the person's account — Teams UPN, else email,
// else the name — so owner fields stay plain strings a digest can address.
async function resolvePeople(body) {
  const paths = [["owner"], ["fields", "owner"], ["fields", "sponsor"], ["next", "owner"], ["fields", "next", "owner"]];
  const ids = [];
  const at = (o, p) => p.slice(0, -1).reduce((x, k) => (x && typeof x === "object" ? x[k] : undefined), o);
  for (const p of paths) { const o = at(body, p); const v = o && o[p[p.length - 1]]; if (typeof v === "string" && /^HC-\d+$/i.test(v.trim())) ids.push([o, p[p.length - 1], v.trim().toUpperCase()]); }
  if (!ids.length) return;
  const h = await hub.readHub();
  const byId = new Map(((h && h.people) || []).map((x) => [x.crmId, x]));
  for (const [o, k, id] of ids) {
    const x = byId.get(id); if (!x) continue;
    o[k] = (x.facets.accounts || []).map((a) => a.upn).find(Boolean) || x.primaryEmail || x.name || id;
  }
}
function rowOf(rel, idx, projects) {
  const mine = projects.filter((p) => p.relationship === rel.id);
  const primary = (rel.contacts || []).find((c) => c.primary) || (rel.contacts || [])[0] || null;
  return Object.assign({}, rel, { partyName: partyName(rel, idx), contactName: primary ? primary.name || primary.person : "", contactCount: (rel.contacts || []).length, metrics: metricsFor(rel, idx), projects: mine.length, activeProjects: mine.filter((p) => p.status === "active").length, overdueMilestones: mine.reduce((a, p) => a + (p.milestones || []).filter((m) => !m.doneAt && m.due && m.due < new Date().toISOString().slice(0, 10)).length, 0) });
}

async function handle(context, req, ctx) {
  const { action, method, user, roles, acc, ok, fail } = ctx;
  if (!ACTIONS.has(action)) return false;
  if (!crm.atLeast(roles, "partners", "read")) { fail(context, 403, "no_access"); return true; }
  const by = normUser(user);
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const q = req.query || {};

  if (action === "partner-config") {
    if (!isAdmin(roles)) { fail(context, 403, "no_access"); return true; }
    if (method === "GET") { ok(context, { config: await P.readConfig(), defaults: { exclude: P.DEFAULT_EXCLUDE, stages: P.STAGES } }); return true; }
    const { doc } = await P.updateConfig((c) => {
      if (Array.isArray(body.exclude)) c.exclude = body.exclude.map((x) => String(x).trim().slice(0, 120)).filter(Boolean).slice(0, 200);
      if (body.thresholds && typeof body.thresholds === "object") { c.thresholds = {}; for (const [k, v] of Object.entries(body.thresholds)) if (/^[a-z_]+\.[a-z_]+$/.test(k) && Number.isInteger(v) && v >= 0 && v <= 3650) c.thresholds[k] = v; }
    });
    await audit(context, { action: "crm.partner.config", by });
    ok(context, { ok: true, config: doc });
    return true;
  }

  // 自动填入 (design v2 §13): run the seeding now; GET shows the last runs.
  if (action === "partners-seed") {
    if (!(isAdmin(roles) || crm.atLeast(roles, "partners", "rw"))) { fail(context, 403, "no_access"); return true; }
    if (method === "GET") { ok(context, { runs: (await P.readSeedLog()).runs || [] }); return true; }
    const r = await P.runSeed({ by, log: (m) => context.log(m) });
    await audit(context, { action: "crm.partner.seed", by, created: r.created.length, excluded: r.excluded.length });
    ok(context, { ok: true, created: r.created, excluded: r.excluded, skipped: r.skipped.length, renamed: r.renamed.length, filed: r.filed.length, unnamed: r.skipped.filter((k) => /:unnamed$/.test(k)).length, at: r.at });
    return true;
  }

  if (method === "GET" && action === "people-search") {
    const s = String(q.q || "").trim().toLowerCase();
    if (s.length < 2) { ok(context, { people: [] }); return true; }
    const h = await hub.readHub();
    const seeWho = ["read", "rw"].includes(acc.identity);
    const hit = (p) => [p.name, p.crmId, ...(p.keys || [])].some((k) => String(k || "").toLowerCase().includes(s));
    const people = ((h && h.people) || []).filter(hit).slice(0, 12).map((p) => {
      const upn = (p.facets.accounts || []).map((a) => a.upn).find(Boolean) || "";
      const ident = (p.facets.accounts || []).map((a) => a.identity).find(Boolean) || (p.sources.contact ? "外部" : "");
      const org = (p.facets.accounts || []).map((a) => a.domain).find(Boolean) || ((p.facets.contacts || []).map((c) => c.org).find(Boolean)) || "";
      return { crmId: p.crmId, name: p.name, email: seeWho ? p.primaryEmail : (p.primaryEmail ? "…@" + p.primaryEmail.split("@")[1] : ""), upn: seeWho ? upn : "", identity: ident, org, stage: p.stage };
    });
    ok(context, { people });
    return true;
  }

  if (method === "GET" && action === "org-search") {
    const s = String(q.q || "").trim().toLowerCase();
    const idx = await orgIndex();
    const orgs = await P.readOrgs();
    const rows = Array.from(idx.map.values()).filter((i) => !s || [i.key, i.domain, i.name, i.nameEn, i.abbr].some((k) => String(k || "").toLowerCase().includes(s))).slice(0, 15).map((i) => ({ key: i.key || i.domain, name: i.name || i.nameEn || i.key, nameEn: i.nameEn || "", domain: i.domain || "", kind: i.kind, type: i.type || "", region: i.region || "", country: i.country || "", orgId: orgs.byKey[i.key || i.domain] || null }));
    ok(context, { orgs: rows });
    return true;
  }

  if (method === "POST" && action === "contact") {
    const canCreate = isAdmin(roles) || crm.atLeast(roles, "partners", "rw") || crm.atLeast(roles, "identity", "rw") || staffFunctions(roles).some((f) => ["community", "curriculum", "partnership", "ceo"].includes(f));
    if (!canCreate) { fail(context, 403, "no_access"); return true; }
    try {
      const r = await hub.addContact(body, by);
      await audit(context, { action: "crm.contact.create", by, crmId: r.crmId, existing: r.existing });
      ok(context, { ok: true, person: r });
    } catch (err) { if (err.code === "bad_contact") { fail(context, 400, "bad_contact"); return true; } throw err; }
    return true;
  }

  if (method === "GET" && action === "partners") {
    const type = String(q.type || "it");
    if (!canSeeType(roles, type)) { fail(context, 403, "no_access"); return true; }
    const cfg = await P.readConfig();
    const now = Date.now();
    let doc = await P.readRels();
    // Automatic transitions (the renewal window) are applied by the first editor who looks.
    if (canEditType(roles, type) && P.autoTransitions(JSON.parse(JSON.stringify(doc)), now, cfg).length) {
      const r = await P.updateRels((d) => { const ch = P.autoTransitions(d, now, cfg); return ch.length > 0; });
      doc = r.doc;
    }
    const [idx, prj, owners] = await Promise.all([orgIndex(), P.readProjects(), ownerCandidates()]);
    const projects = Object.values(prj.items || {});
    const rels = P.listByType(doc, type, cfg, now, String(q.all || "") === "1").map((r) => rowOf(r, idx, projects));
    const counts = {};
    for (const t of P.visibleTypes()) counts[t] = Object.values(doc.items || {}).filter((r) => r.type === t && !r.closed).length;
    ok(context, { type, rows: rels, summary: P.summary(rels, now), stages: P.STAGES[type].map((s) => Object.assign({}, s, { days: (cfg.thresholds && cfg.thresholds[type + "." + s.k]) || s.days })), kinds: P.PROJECT_KINDS[type] || {}, contactRoles: P.CONTACT_ROLES[type] || [], regions: P.REGION_LABELS, types: P.TYPES, counts, owners, canEdit: canEditType(roles, type), access: acc });
    return true;
  }

  if (method === "GET" && action === "partner") {
    const id = String(q.id || "").toUpperCase();
    const doc = await P.readRels();
    const rel = doc.items[id];
    if (!rel || !canSeeType(roles, rel.type)) { fail(context, 404, "not_found"); return true; }
    const [idx, prj, cfg, owners] = await Promise.all([orgIndex(), P.readProjects(), P.readConfig(), ownerCandidates()]);
    const projects = Object.values(prj.items || {}).filter((p) => p.relationship === id).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    const row = rowOf(Object.assign({}, rel, { health: P.health(rel, Date.now(), cfg) }), idx, projects);
    ok(context, { relationship: row, projects, stages: P.STAGES[rel.type], kinds: P.PROJECT_KINDS[rel.type] || {}, contactRoles: P.CONTACT_ROLES[rel.type] || [], owners, canEdit: canEditType(roles, rel.type), access: acc });
    return true;
  }

  if (method === "POST" && action === "partner") {
    const op = String(body.op || "");
    await resolvePeople(body);
    if (op === "create") {
      const type = String(body.type || "");
      if (!P.TYPES[type]) { fail(context, 400, "bad_type"); return true; }
      if (!canEditType(roles, type)) { fail(context, 403, "no_access"); return true; }
      // The party: an organization by its 机构 key (an ORG id is minted on first use) or a person.
      let party = null;
      if (body.party && body.party.key) {
        const idx = await orgIndex();
        const i = idx.map.get(String(body.party.key));
        const info = i ? { name: i.name || i.nameEn || "", nameEn: i.nameEn || "", region: i.region || "" } : { name: String(body.party.name || "").slice(0, 200) };
        if (!i && !info.name) { fail(context, 400, "bad_party"); return true; }
        const { doc: orgs } = await P.updateOrgs((o) => { P.orgIdFor(o, String(body.party.key), info); });
        party = { id: orgs.byKey[String(body.party.key)], key: String(body.party.key), name: info.name };
      } else if (body.party && body.party.id) {
        const h = await hub.readHub();
        const p = h && h.people.find((x) => x.crmId === String(body.party.id).toUpperCase());
        if (!p) { fail(context, 400, "bad_party"); return true; }
        party = { id: p.crmId, name: p.name };
      }
      let created = null;
      try {
        const { doc } = await P.updateRels((d) => { const id = P.pad(d.next++); created = P.newRelationship(Object.assign({}, body, { party }), by, id); d.items[id] = created; });
        created = doc.items[created.id];
      } catch (err) { if (err.code) { fail(context, 400, err.code); return true; } throw err; }
      await audit(context, { action: "crm.partner.create", by, id: created.id, type, party: created.party.id });
      ok(context, { ok: true, relationship: created });
      return true;
    }
    const id = String(body.id || "").toUpperCase();
    const cur = (await P.readRels()).items[id];
    if (!cur) { fail(context, 404, "not_found"); return true; }
    if (!canEditType(roles, cur.type)) { fail(context, 403, "no_access"); return true; }
    const projects = Object.values((await P.readProjects()).items || {});
    let problem = null, saved = null;
    const { doc } = await P.updateRels((d) => {
      const r = d.items[id]; if (!r) { problem = { status: 404, error: "not_found" }; return false; }
      const now = new Date().toISOString();
      if (op === "move") {
        const to = String(body.to || "");
        const chk = P.moveCheck(r, to, body, projects);
        if (!chk.ok) { problem = { status: 409, error: chk.error, problems: chk.problems }; return false; }
        if (body.contacts) r.contacts = P.cleanContacts(body.contacts);
        if (chk.stage.handover && body.owner) { if (r.owner !== body.owner) r.log.push(P.logEntry(by, "owner", String(body.handoverNote || "").slice(0, 500), { from: r.owner, to: String(body.owner).slice(0, 120) })); r.owner = String(body.owner).slice(0, 120); }
        r.log.push(P.logEntry(by, "stage", body.reason || body.note || "", { from: r.stage, to, back: chk.backward || undefined }));
        r.stage = to; r.stageAt = now; r.stageBy = by; r.updatedAt = now; r.confirmed = true;
        if (chk.stage.closed) r.closed = { at: now, reason: String(body.reason || "completed").slice(0, 200), by };
        const nx = P.cleanNext(body.next); if (nx) { r.log.push(P.logEntry(by, "next", nx.action, { due: nx.due })); r.next = nx; }
        return true;
      }
      if (op === "update") {
        const f = body.fields && typeof body.fields === "object" ? body.fields : {};
        if (f.region && P.REGIONS.includes(f.region)) r.region = f.region;
        if (["CNY", "USD"].includes(f.currency)) r.currency = f.currency;
        if (["zh", "en"].includes(f.lang)) r.lang = f.lang;
        if (typeof f.owner === "string" && f.owner.trim() !== (r.owner || "")) { r.log.push(P.logEntry(by, "owner", String(f.handoverNote || "").slice(0, 500), { from: r.owner, to: f.owner.trim().slice(0, 120) })); r.owner = f.owner.trim().slice(0, 120); }
        if (typeof f.sponsor === "string") r.sponsor = f.sponsor.trim().slice(0, 120);
        if ("next" in f) { const nx = P.cleanNext(f.next); r.log.push(P.logEntry(by, "next", nx ? nx.action : "", { due: nx ? nx.due : "", cleared: !nx || undefined })); r.next = nx; }
        if ("agreement" in f) { const ag = P.cleanAgreement(f.agreement); r.log.push(P.logEntry(by, "agreement", ag ? [ag.kind, ag.startAt, ag.endAt].filter(Boolean).join(" · ") : "", { from: r.agreement && r.agreement.endAt, to: ag && ag.endAt })); r.agreement = ag; }
        if ("terms" in f) { r.terms = P.cleanTerms(f.terms); r.log.push(P.logEntry(by, "terms", Object.keys(r.terms).join(", "))); }
        if ("contacts" in f) { r.contacts = P.cleanContacts(f.contacts); r.log.push(P.logEntry(by, "contacts", r.contacts.map((c) => c.name + (c.role ? " (" + c.role + ")" : "")).join(", "))); }
        if (typeof f.partyName === "string" && r.party) r.party.name = f.partyName.slice(0, 200);
        r.updatedAt = now; r.confirmed = true;
        return true;
      }
      if (op === "note") { const text = String(body.text || "").trim(); if (!text) { problem = { status: 400, error: "empty" }; return false; } r.log.push(P.logEntry(by, "note", text, { via: ["call", "meeting", "email", "other"].includes(body.via) ? body.via : "other" })); r.updatedAt = now; return true; }
      if (op === "close") { const reason = String(body.reason || "").trim(); if (!["completed", "lost", "paused", "merged"].includes(reason)) { problem = { status: 400, error: "bad_reason" }; return false; } r.closed = { at: now, reason, by, note: String(body.note || "").slice(0, 500), stage: r.stage }; r.log.push(P.logEntry(by, "closed", body.note || "", { reason })); r.updatedAt = now; return true; }
      if (op === "reopen") { if (!r.closed) { problem = { status: 409, error: "not_closed" }; return false; } const back = r.closed.stage && P.stageOf(r.type, r.closed.stage) && !P.stageOf(r.type, r.closed.stage).closed ? r.closed.stage : P.STAGES[r.type][0].k; r.log.push(P.logEntry(by, "reopened", "", { to: back })); r.closed = null; r.stage = back; r.stageAt = now; r.stageBy = by; r.updatedAt = now; return true; }
      problem = { status: 400, error: "bad_op" }; return false;
    });
    if (problem) { fail(context, problem.status, problem.error, problem.problems ? { problems: problem.problems } : undefined); return true; }
    saved = doc.items[id];
    await audit(context, { action: "crm.partner." + op, by, id, stage: saved.stage });
    ok(context, { ok: true, relationship: Object.assign({}, saved, { health: P.health(saved, Date.now(), await P.readConfig()) }) });
    return true;
  }

  if (method === "POST" && action === "project") {
    const op = String(body.op || "");
    await resolvePeople(body);
    if (op === "create") {
      const relId = String(body.relationship || "").toUpperCase();
      const rel = (await P.readRels()).items[relId];
      if (!rel) { fail(context, 404, "not_found"); return true; }
      if (!canEditType(roles, rel.type)) { fail(context, 403, "no_access"); return true; }
      let created = null;
      try {
        const { doc } = await P.updateProjects((d) => { const id = P.padP(d.next++); created = P.newProject(rel, body, by, id); d.items[id] = created; });
        created = doc.items[created.id];
      } catch (err) { if (err.code) { fail(context, 400, err.code); return true; } throw err; }
      await P.updateRels((d) => { const r = d.items[relId]; if (!r) return false; r.log.push(P.logEntry(by, "project", created.name, { project: created.id })); r.updatedAt = new Date().toISOString(); return true; });
      await audit(context, { action: "crm.project.create", by, id: created.id, relationship: relId });
      ok(context, { ok: true, project: created });
      return true;
    }
    const id = String(body.id || "").toUpperCase();
    const cur = (await P.readProjects()).items[id];
    if (!cur) { fail(context, 404, "not_found"); return true; }
    const rel = (await P.readRels()).items[cur.relationship];
    if (!rel || !canEditType(roles, rel.type)) { fail(context, 403, "no_access"); return true; }
    let problem = null, removed = null;
    const { doc } = await P.updateProjects((d) => {
      const p = d.items[id]; if (!p) { problem = { status: 404, error: "not_found" }; return false; }
      const now = new Date().toISOString();
      const dt = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) ? v : "");
      if (op === "update") {
        const f = body.fields && typeof body.fields === "object" ? body.fields : {};
        if (typeof f.name === "string" && f.name.trim()) p.name = f.name.trim().slice(0, 200);
        if (typeof f.nameEn === "string") p.nameEn = f.nameEn.trim().slice(0, 200);
        if ("startAt" in f) p.startAt = dt(f.startAt);
        if ("endAt" in f) p.endAt = dt(f.endAt);
        if (typeof f.owner === "string") p.owner = f.owner.trim().slice(0, 120);
        if ("terms" in f) p.terms = P.cleanTerms(f.terms);
        if ("participants" in f) p.participants = P.cleanContacts(f.participants);
        if (f.public && typeof f.public === "object") p.public = { listed: !!f.public.listed, slug: String(f.public.slug || "").slice(0, 80), summary: String(f.public.summary || "").slice(0, 500) };
        p.log.push(P.logEntry(by, "updated", Object.keys(f).join(", "))); p.updatedAt = now; return true;
      }
      if (op === "status") {
        const to = String(body.status || "");
        if (!["planning", "active", "on_hold", "completed", "cancelled"].includes(to)) { problem = { status: 400, error: "bad_status" }; return false; }
        if (to === "completed" && p.milestones.some((m) => m.kind === "gate" && !m.doneAt)) { problem = { status: 409, error: "gates_open" }; return false; }
        p.log.push(P.logEntry(by, "status", body.reason || "", { from: p.status, to })); p.status = to; p.updatedAt = now; return true;
      }
      if (op === "milestone") {
        const m = p.milestones.find((x) => x.id === String(body.mid || ""));
        if (!m) { problem = { status: 404, error: "no_milestone" }; return false; }
        if ("done" in body) m.doneAt = body.done ? (dt(body.doneAt) || now.slice(0, 10)) : "";
        if ("due" in body) m.due = dt(body.due);
        if (typeof body.name === "string" && body.name.trim()) m.name = body.name.trim().slice(0, 120);
        if (typeof body.nameEn === "string") m.nameEn = body.nameEn.trim().slice(0, 120);
        if (typeof body.owner === "string") m.owner = body.owner.trim().slice(0, 120);
        if (typeof body.note === "string") m.note = body.note.slice(0, 500);
        if (["gate", "deliverable", "date"].includes(body.kind)) m.kind = body.kind;
        p.log.push(P.logEntry(by, "milestone", m.name, { milestone: m.id, done: !!m.doneAt, due: m.due })); p.updatedAt = now; return true;
      }
      if (op === "addMilestone") {
        const name = String(body.name || "").trim().slice(0, 120); if (!name) { problem = { status: 400, error: "empty" }; return false; }
        const n = p.milestones.reduce((a, m) => Math.max(a, Number(String(m.id).slice(1)) || 0), 0) + 1;
        p.milestones.push({ id: "m" + n, name, nameEn: String(body.nameEn || name).slice(0, 120), kind: ["gate", "deliverable", "date"].includes(body.kind) ? body.kind : "deliverable", due: dt(body.due), doneAt: "", owner: String(body.owner || "").slice(0, 120), note: "" });
        p.log.push(P.logEntry(by, "milestone", name, { added: true })); p.updatedAt = now; return true;
      }
      if (op === "removeMilestone") { const i = p.milestones.findIndex((x) => x.id === String(body.mid || "")); if (i < 0) { problem = { status: 404, error: "no_milestone" }; return false; } p.log.push(P.logEntry(by, "milestone", p.milestones[i].name, { removed: true })); p.milestones.splice(i, 1); p.updatedAt = now; return true; }
      if (op === "note") { const text = String(body.text || "").trim(); if (!text) { problem = { status: 400, error: "empty" }; return false; } p.log.push(P.logEntry(by, "note", text)); p.updatedAt = now; return true; }
      // A project that never went anywhere may be deleted (Rick, 2026-10-09: 「How to
      // delete a project in a partnership?」); one with a milestone done or already
      // completed is history and is cancelled instead, so the record stays.
      if (op === "delete") {
        if (p.status === "completed" || p.milestones.some((m) => m.doneAt)) { problem = { status: 409, error: "has_progress" }; return false; }
        removed = p; delete d.items[id]; return true;
      }
      problem = { status: 400, error: "bad_op" }; return false;
    });
    if (problem) { fail(context, problem.status, problem.error); return true; }
    if (removed) {
      await P.updateRels((d) => { const r = d.items[removed.relationship]; if (!r) return false; r.log.push(P.logEntry(by, "project", removed.name + " " + (removed.nameEn && removed.nameEn !== removed.name ? "/ " + removed.nameEn + " " : "") + "(" + id + ")", { deleted: true })); r.updatedAt = new Date().toISOString(); return true; });
    }
    await audit(context, { action: "crm.project." + op, by, id });
    ok(context, { ok: true, project: doc.items[id] || null, deleted: !!removed });
    return true;
  }

  fail(context, 405, "method_not_allowed");
  return true;
}

module.exports = { handle, canEditType, canSeeType };
