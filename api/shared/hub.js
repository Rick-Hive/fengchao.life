// 人员库 — the People Hub (design §3 "统一人员模型"): one record per person, built
// from the sources the CRM reads and never writing to any of them.
//
// Sources (each stays authoritative for its own data):
//   Equip Airtable (crm/equip/data.json)  customers, orders, the seminar list
//   the directory cache (directory/*)     every school's tenant accounts
//   Hive course orders (crm/orders/*)      the website's orders
//
// How people are matched (§3 "怎么把三处对上"; decisions 1–3):
//   level 0  a customer already carrying a CRM ID  → that person, no recomputation
//   level 1  identical email (any of a person's addresses, normalised)  → merged
//            (a tenant account's recovery email is NOT an address of the person:
//            on a child's account it is the parent's — suggestion only, level 3)
//   level 2  the customer's Teams account = a tenant account's UPN     → merged
//   level 3  same name + same school domain, or recovery email = customer email
//            (non-student accounts)                                    → suggested only:
//            the pair goes to the merge queue, a person says 是同一个人 / 不是,
//            and the verdict is kept (crm/merge-decisions.json) and applied
//   No matching by WeChat or phone — they are not recorded.
//
// CRM IDs are minted here (HC-000001, …) and never reused: a person keeps the id
// across rebuilds through the keys (emails, UPNs) they were first known by.
// Rebuilt after every Equip sync and on demand; the result is crm/people.json.
const { BlobServiceClient } = require("@azure/storage-blob");
const { snapshotBlob } = require("./config");
const { normalizeEmail, tier, primaryEmail } = require("./emailTier");

const PEOPLE_BLOB = "crm/people.json";
const DECISIONS_BLOB = "crm/merge-decisions.json";
const DAY = 24 * 3600 * 1000;

// ---- storage --------------------------------------------------------------
function container() {
  const conn = process.env.STORAGE_CONNECTION_STRING;
  if (!conn) throw new Error("STORAGE_CONNECTION_STRING app setting is not configured");
  return BlobServiceClient.fromConnectionString(conn).getContainerClient(snapshotBlob.container);
}
async function readJson(name, fallback) {
  const b = container().getBlockBlobClient(name);
  if (!(await b.exists())) return fallback;
  try { return JSON.parse((await b.downloadToBuffer()).toString("utf8")); } catch { return fallback; }
}
async function writeJson(name, obj) {
  const c = container();
  await c.createIfNotExists();
  const body = JSON.stringify(obj);
  await c.getBlockBlobClient(name).upload(body, Buffer.byteLength(body), { blobHTTPHeaders: { blobContentType: "application/json; charset=utf-8" } });
}
const store = require("./jsonstore");
const readHub = () => readJson(PEOPLE_BLOB, null);
const readDecisions = () => readJson(DECISIONS_BLOB, { pairs: {} });
const writeDecisions = (d) => writeJson(DECISIONS_BLOB, d);
// Hand-maintained records change through update*(mutate): read with ETag, change, write
// with If-Match, retry on a concurrent write (jsonstore.js).
const updateDecisions = (mutate) => store.update(DECISIONS_BLOB, { pairs: {} }, mutate);
// 待替换邮箱 progress (decision 14: prompt, never force): a mark per mainland address —
// notified / replaced — kept by the address so it survives rebuilds. crm/email-replace.json.
const MARKS_BLOB = "crm/email-replace.json";
// 合作伙伴 (phase 3): the partnership stage and note per institution — crm/partners.json
// { partners: { "<domain>": { stage, note, owner, by, at } } }. Stages: contact → trial → partner → paused.
const PARTNERS_BLOB = "crm/partners.json";
const PARTNER_STAGES = ["contact", "trial", "partner", "paused"];
const hiveKeyOf = (raw) => String(raw || "").toUpperCase().replace(/[^A-Z0-9一-鿿]/g, "").slice(0, 12); // = hiveKey in ./hive.js
const readPartners = () => readJson(PARTNERS_BLOB, { partners: {} });
const writePartners = (d) => writeJson(PARTNERS_BLOB, d);
const updatePartners = (mutate) => store.update(PARTNERS_BLOB, { partners: {} }, mutate);
const readMarks = () => readJson(MARKS_BLOB, { marks: {} });
const writeMarks = (d) => writeJson(MARKS_BLOB, d);
const updateMarks = (mutate) => store.update(MARKS_BLOB, { marks: {} }, mutate);
// The mainland address a person is still on (the one the mark is kept by).
function replaceEmailOf(p) { const e = (p.emails || []).find((x) => x.tier === "replace"); return e ? e.email : ""; }
// People with their mark attached, plus the month's counts for the dashboard.
function withMarks(people, doc) {
  const marks = (doc && doc.marks) || {};
  return people.map((p) => { const e = replaceEmailOf(p); const m = e && marks[e]; return m ? Object.assign({}, p, { replaceMark: Object.assign({ email: e }, m) }) : p; });
}
function markStats(people, doc, now) {
  const marks = (doc && doc.marks) || {}, ym = new Date(now || Date.now()).toISOString().slice(0, 7);
  let notified = 0, replaced = 0, replacedThisMonth = 0;
  for (const p of people) { if (p.primaryTier !== "replace") continue; const m = marks[replaceEmailOf(p)]; if (!m) continue; if (m.status === "notified") notified++; if (m.status === "replaced") { replaced++; if (String(m.at || "").slice(0, 7) === ym) replacedThisMonth++; } }
  return { notified, replaced, replacedThisMonth };
}

// ---- helpers --------------------------------------------------------------
function normName(s) { return String(s || "").toLowerCase().replace(/[\s·.,，、_\-]+/g, ""); }
function domainOf(e) { const i = String(e || "").lastIndexOf("@"); return i > 0 ? String(e).slice(i + 1) : ""; }
function pairKey(a, b) { return [a, b].sort().join("|"); }

// Union–find over facet indexes.
function uf(n) {
  const p = Array.from({ length: n }, (_, i) => i);
  const find = (x) => (p[x] === x ? x : (p[x] = find(p[x])));
  const union = (a, b) => { a = find(a); b = find(b); if (a !== b) p[b] = a; };
  return { find, union };
}

// ---- the build ------------------------------------------------------------
// `src` = { equip, domains: [{domain, users:[row]}], hiveOrders, prev, decisions, now }
function build(src) {
  const now = src.now ? +src.now : Date.now();
  const equip = src.equip || { customers: [], orders: [], seminar: [] };
  const decisions = (src.decisions && src.decisions.pairs) || {};
  const facets = [];
  const add = (f) => { f.keys = Array.from(new Set((f.keys || []).map(normalizeEmail).filter((k) => k.includes("@")))); facets.push(f); return facets.length - 1; };

  // Orders per customer record (amounts, dates).
  const ordersByCust = new Map();
  for (const o of equip.orders || []) {
    const key = o.customerRec || ("email:" + o.email);
    if (!ordersByCust.has(key)) ordersByCust.set(key, []);
    ordersByCust.get(key).push(o);
  }
  for (const c of equip.customers || []) {
    const os = (ordersByCust.get(c.recId) || []).concat(c.email ? ordersByCust.get("email:" + c.email) || [] : []);
    add({ kind: "customer", id: c.recId, keys: [c.email, c.teams], name: c.name, teams: c.teams, crmId: c.crmId || "", city: c.city, active: c.active, login: c.login, createdTime: c.createdTime,
      orders: os.length, spend: os.reduce((a, o) => a + (o.amount || 0), 0), received: os.reduce((a, o) => a + (o.received || 0), 0), lastOrder: os.map((o) => o.date).sort().pop() || "", firstOrder: os.map((o) => o.date).sort()[0] || "" });
  }
  for (const d of src.domains || []) for (const u of d.users || []) {
    // Only the UPN is a key. The recovery email (otherMails) is the household's contact
    // address — on a child's account it is the parent's — so it must not join accounts
    // to each other (Rick, 2026-10-08: four siblings had become one person) nor merge an
    // account into a customer on its own; it is a suggestion at most (level 3 below).
    add({ kind: "account", id: u.upn, keys: [u.upn], name: u.displayName, domain: d.domain, upn: u.upn, safeEmail: normalizeEmail(u.safeEmail), identity: u.identity || "", lastSignIn: u.lastSignIn || null, enabled: u.enabled !== false, verified: typeof u.verified === "boolean" ? u.verified : null, created: u.created || null, jobTitle: u.jobTitle || "", linked: (u.linked || []).map(normalizeEmail).filter(Boolean) });
  }
  for (const l of equip.seminar || []) add({ kind: "lead", id: l.recId, keys: [l.email], name: l.name, session: l.session, createdTime: l.createdTime });
  for (const o of src.hiveOrders || []) add({ kind: "hive", id: o.orderId, keys: [o.email, o.teamsAccount], name: "", orderId: o.orderId, status: o.status, total: o.totalPrice, at: o.submittedAt, hives: (o.hives || []).map((h) => h.abbr || h.name).filter(Boolean) });

  // Levels 1 and 2: any shared key (email or UPN) joins facets. Level 0: a customer's
  // CRM ID joins it to whichever facets the previous build knew under that id.
  const { find, union } = uf(facets.length);
  const byKey = new Map();
  facets.forEach((f, i) => { for (const k of f.keys) { if (byKey.has(k)) union(byKey.get(k), i); else byKey.set(k, i); } });
  const prevIdByKey = new Map();
  for (const p of (src.prev && src.prev.people) || []) for (const k of p.keys || []) prevIdByKey.set(k, p.crmId);
  const byCrm = new Map();
  facets.forEach((f, i) => { const id = f.kind === "customer" && f.crmId ? f.crmId : f.keys.map((k) => prevIdByKey.get(k)).find(Boolean); if (id) { if (byCrm.has(id)) union(byCrm.get(id), i); else byCrm.set(id, i); } });
  // Decisions: 是同一个人 joins; 不是 is remembered so the pair is not suggested again.
  const facetIndex = new Map(facets.map((f, i) => [f.kind + ":" + f.id, i]));
  for (const [k, v] of Object.entries(decisions)) {
    if (!v || v.verdict !== "same") continue;
    const [a, b] = k.split("|");
    if (facetIndex.has(a) && facetIndex.has(b)) union(facetIndex.get(a), facetIndex.get(b));
  }

  // Groups → people.
  const groups = new Map();
  facets.forEach((f, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(f); });

  // Stable ids: an existing id for any key, else mint.
  let next = (src.prev && src.prev.nextId) || 1;
  const used = new Set();
  const people = [];
  for (const fs of groups.values()) {
    const keys = Array.from(new Set(fs.flatMap((f) => f.keys)));
    let crmId = fs.map((f) => (f.kind === "customer" ? f.crmId : "")).find(Boolean) || keys.map((k) => prevIdByKey.get(k)).find((id) => id && !used.has(id)) || "";
    if (!crmId) crmId = "HC-" + String(next++).padStart(6, "0");
    used.add(crmId);
    const customers = fs.filter((f) => f.kind === "customer"), accounts = fs.filter((f) => f.kind === "account"), leads = fs.filter((f) => f.kind === "lead"), hive = fs.filter((f) => f.kind === "hive");
    const name = (customers.map((c) => c.name).find(Boolean)) || (accounts.map((a) => a.name).find(Boolean)) || (leads.map((l) => l.name).find(Boolean)) || (keys[0] || "").split("@")[0];
    // Emails: everything known, classed; the primary by the rule of §3.
    const upns = accounts.map((a) => a.upn).filter(Boolean);
    const personal = keys.filter((k) => !upns.includes(k));
    const safe = personal.find((e) => tier(e) === "safe");
    const prim = primaryEmail(safe || personal.find((e) => tier(e) === "replace") || "", upns[0] || "");
    const emails = keys.map((e) => ({ email: e, tier: upns.includes(e) ? "safe" : tier(e), upn: upns.includes(e) }));
    const orders = customers.reduce((a, c) => a + c.orders, 0);
    const spend = customers.reduce((a, c) => a + c.spend, 0);
    const lastOrder = customers.map((c) => c.lastOrder).filter(Boolean).sort().pop() || "";
    const lastSignIn = accounts.map((a) => a.lastSignIn).filter(Boolean).sort().pop() || null;
    const hiveTotal = hive.filter((h) => h.status !== "cancelled").reduce((a, h) => a + (h.total || 0), 0);
    // Lifecycle (§3): lead → registered → customer → active → dormant.
    let stage = "lead";
    if (orders > 0 || hive.some((h) => h.status === "paid" || h.status === "started")) {
      const recentOrder = lastOrder && now - Date.parse(lastOrder) < 365 * DAY;
      const recentHive = hive.some((h) => h.at && now - Date.parse(h.at) < 365 * DAY);
      const recentSignIn = lastSignIn && now - Date.parse(lastSignIn) < 90 * DAY;
      stage = recentOrder || recentHive || recentSignIn ? "active" : "dormant";
    } else if (accounts.length) stage = "registered";
    const firstSeen = [...customers.map((c) => c.createdTime), ...accounts.map((a) => a.created), ...leads.map((l) => l.createdTime), ...hive.map((h) => h.at)].filter(Boolean).sort()[0] || null;
    people.push({
      crmId, name, keys, emails, primaryEmail: prim.email, primaryTier: prim.tier, viaTeams: prim.viaTeams,
      stage, firstSeen, lastOrder: lastOrder || null, lastSignIn, orders, spend, hiveOrders: hive.length, hiveTotal,
      sources: { customer: customers.length > 0, account: accounts.length > 0, lead: leads.length > 0, hive: hive.length > 0 },
      facets: {
        customers: customers.map((c) => ({ recId: c.id, name: c.name, teams: c.teams, crmId: c.crmId, city: c.city, orders: c.orders, spend: c.spend, received: c.received, firstOrder: c.firstOrder, lastOrder: c.lastOrder })),
        accounts: accounts.map((a) => ({ upn: a.upn, domain: a.domain, name: a.name, identity: a.identity, safeEmail: a.safeEmail, lastSignIn: a.lastSignIn, enabled: a.enabled, verified: a.verified, jobTitle: a.jobTitle })),
        leads: leads.map((l) => ({ recId: l.id, name: l.name, session: l.session, at: l.createdTime })),
        hive: hive.map((h) => ({ orderId: h.orderId, status: h.status, total: h.total, at: h.at, hives: h.hives, keys: h.keys })),
      },
      writeBack: customers.filter((c) => !c.crmId).map((c) => c.id), // customers Airtable does not yet tag with this id
    });
  }
  people.sort((a, b) => String(b.lastOrder || b.lastSignIn || "").localeCompare(String(a.lastOrder || a.lastSignIn || "")) || a.name.localeCompare(b.name, "zh"));
  const idOf = new Map(); people.forEach((p) => p.keys.forEach((k) => idOf.set(k, p.crmId)));

  // Level 3: suggestions only, each a customer ↔ account pair for a person to decide:
  //   "name"       same name and the customer is not already that account's person
  //   "safeEmail"  the account's recovery email is the customer's email — unless the
  //                account is a student's, whose recovery email is the parent's by design
  // Not already one person, no verdict yet.
  const queue = [];
  const suggested = new Set();
  const suggest = (c, a, reason) => {
    const cid = idOf.get(c.keys[0]);
    if (!cid || idOf.get(a.keys[0]) === cid) return;
    const k = pairKey("customer:" + c.id, "account:" + a.id);
    if (decisions[k] || suggested.has(k)) return;
    suggested.add(k);
    queue.push({ key: k, reason, customer: { recId: c.id, name: c.name, email: c.keys[0] || "", orders: c.orders, crmId: cid }, account: { upn: a.upn, domain: a.domain, name: a.name, identity: a.identity, safeEmail: a.safeEmail, lastSignIn: a.lastSignIn, crmId: idOf.get(a.keys[0]) } });
  };
  const accByName = new Map(), accBySafe = new Map();
  for (const f of facets) {
    if (f.kind !== "account") continue;
    if (f.name) { const k = normName(f.name); if (!accByName.has(k)) accByName.set(k, []); accByName.get(k).push(f); }
    if (f.safeEmail && f.identity !== "学生") { if (!accBySafe.has(f.safeEmail)) accBySafe.set(f.safeEmail, []); accBySafe.get(f.safeEmail).push(f); }
  }
  for (const c of facets) {
    if (c.kind !== "customer") continue;
    if (c.name) for (const a of accByName.get(normName(c.name)) || []) suggest(c, a, "name");
    for (const e of c.keys) for (const a of accBySafe.get(e) || []) suggest(c, a, "safeEmail");
  }

  // ---- 家庭 (phase 3): people who belong to one household. Joined by
  //   • a 关联账号 link in people.json (parent ↔ child, set on the user page)
  //   • accounts sharing a recovery email, and the person that email belongs to
  //   • a customer whose Teams Account is another person's account (the parent bought,
  //     the child reads)
  // Never by name. Family ids FM-000001… are kept across rebuilds by their members.
  const personOfFacet = new Map(); people.forEach((p) => { (p.facets.accounts || []).forEach((a) => personOfFacet.set("account:" + a.upn, p)); (p.facets.customers || []).forEach((c) => personOfFacet.set("customer:" + c.recId, p)); });
  const personByKey = new Map(); people.forEach((p) => p.keys.forEach((k) => personByKey.set(k, p)));
  const pidx = new Map(people.map((p, i) => [p.crmId, i]));
  const fu = uf(people.length);
  const join = (a, b) => { if (a && b && a !== b) fu.union(pidx.get(a.crmId), pidx.get(b.crmId)); };
  const bySafe = new Map();
  for (const f of facets) {
    if (f.kind === "account") {
      const me = personOfFacet.get("account:" + f.upn);
      for (const l of f.linked || []) join(me, personByKey.get(l));
      if (f.safeEmail) { if (!bySafe.has(f.safeEmail)) bySafe.set(f.safeEmail, []); bySafe.get(f.safeEmail).push(me); }
    }
    if (f.kind === "customer" && f.teams) join(personOfFacet.get("customer:" + f.id), personByKey.get(normalizeEmail(f.teams)));
  }
  for (const [email, members] of bySafe) { const owner = personByKey.get(email); members.forEach((m) => { join(members[0], m); if (owner) join(owner, m); }); }
  const famGroups = new Map();
  people.forEach((p, i) => { const r = fu.find(i); if (!famGroups.has(r)) famGroups.set(r, []); famGroups.get(r).push(p); });
  const prevFam = new Map(); for (const f of (src.prev && src.prev.families) || []) for (const m of f.members || []) prevFam.set(m.crmId, f.id);
  let nextFam = (src.prev && src.prev.nextFamily) || 1;
  const usedFam = new Set();
  const families = [];
  const ADULT = new Set(["家长", "老师", "行政", "教育顾问"]);
  for (const members of famGroups.values()) {
    if (members.length < 2) continue;
    let id = members.map((m) => prevFam.get(m.crmId)).find((x) => x && !usedFam.has(x));
    if (!id) id = "FM-" + String(nextFam++).padStart(6, "0");
    usedFam.add(id);
    const role = (p) => { const ids = (p.facets.accounts || []).map((a) => a.identity).filter(Boolean); if (ids.some((x) => x === "学生")) return "child"; if (p.sources.customer || ids.some((x) => ADULT.has(x))) return "adult"; return ""; };
    const fam = { id, members: members.map((p) => ({ crmId: p.crmId, name: p.name, role: role(p) })), contactEmail: members.map((p) => p.primaryEmail).find(Boolean) || "", orders: members.reduce((a, p) => a + (p.orders || 0), 0), spend: members.reduce((a, p) => a + (p.spend || 0), 0) };
    families.push(fam);
    members.forEach((p) => { p.familyId = id; });
  }
  families.sort((a, b) => a.id.localeCompare(b.id));

  // ---- 机构 (phase 3): one row per school domain — accounts, active, customers among
  // them, leads, and the buyers' orders. Sales are summed here from the customers'
  // Equip facets (total, not by period; the period view is computed by the reader).
  // 机构: one row per institution — the tenant's domains (accounts, people, customers)
  // AND every row of the Hive workspace's Schools or Institutions table (schools,
  // hives, universities …), joined when they are the same place (Rick, 2026-10-08:
  // 「机构里还是不全面，没有hive里的大学，学校」). A row's `key` is its domain when it
  // has one, else "hive:<abbr>"; `kind` says where it came from: tenant, hive, both.
  // Joining: the Schools row's private Domain column; else the same name as the
  // directory institution (institutions.json) or as the domain's label.
  const instNames = src.institutionNames || {}; // domain → { name, nameEn }
  const hiveRows = (src.hiveInstitutions || []).map((h) => Object.assign({}, h, { key: hiveKeyOf(h.abbr || h.name) }));
  const routing = src.schoolRouting || {}; // hiveKey → { domain, … } (private)
  const domainRows = (src.domains || []).map((d) => {
    const users = d.users || [];
    const persons = new Set(); users.forEach((u) => { const p = personOfFacet.get("account:" + normalizeEmail(u.upn)); if (p) persons.add(p); });
    const ps = Array.from(persons);
    const active = users.filter((u) => u.lastSignIn && now - Date.parse(u.lastSignIn) <= 90 * DAY).length;
    const names = instNames[d.domain] || {};
    return { key: d.domain, domain: d.domain, kind: "tenant", name: names.name || "", nameEn: names.nameEn || "", accounts: users.length, active, people: ps.length, customers: ps.filter((p) => p.sources.customer).length, leads: ps.filter((p) => p.sources.lead).length, buyers: ps.filter((p) => (p.orders || 0) > 0).length, orders: ps.reduce((a, p) => a + (p.orders || 0), 0), spend: ps.reduce((a, p) => a + (p.spend || 0), 0), hiveOrders: ps.reduce((a, p) => a + (p.hiveOrders || 0), 0), families: new Set(ps.map((p) => p.familyId).filter(Boolean)).size, customerIds: ps.filter((p) => p.sources.customer).map((p) => p.crmId) };
  });
  const byDomain = new Map(domainRows.map((r) => [r.domain, r]));
  const taken = new Set();
  for (const h of hiveRows) {
    const r = routing[h.key] || {};
    let row = r.domain ? byDomain.get(r.domain) : null;
    if (!row) row = domainRows.find((d) => !taken.has(d.domain) && [d.name, d.nameEn, d.domain.split(".")[0]].some((n) => n && (normName(n) === normName(h.name) || normName(n) === normName(h.abbr)))) || null;
    const hiveFields = { hiveId: h.id, hiveKey: h.key, abbr: h.abbr || "", type: h.type || "", region: h.region || "", country: h.country || "", city: h.city || "", website: h.website || "", courses: h.courses || 0 };
    if (row) { Object.assign(row, hiveFields, { kind: "both", name: row.name || h.name, nameEn: row.nameEn || "" }); taken.add(row.domain); }
    else domainRows.push(Object.assign({ key: "hive:" + h.key, domain: "", kind: "hive", name: h.name || h.abbr, nameEn: "", accounts: 0, active: 0, people: 0, customers: 0, leads: 0, buyers: 0, orders: 0, spend: 0, hiveOrders: 0, families: 0, customerIds: [] }, hiveFields));
  }
  const institutions = domainRows.sort((a, b) => b.spend - a.spend || b.accounts - a.accounts || String(a.name).localeCompare(String(b.name)));

  const stats = {
    people: people.length, customers: people.filter((p) => p.sources.customer).length, accounts: people.filter((p) => p.sources.account).length,
    leads: people.filter((p) => p.sources.lead).length, hive: people.filter((p) => p.sources.hive).length,
    replace: people.filter((p) => p.primaryTier === "replace").length, missing: people.filter((p) => p.primaryTier === "missing").length, viaTeams: people.filter((p) => p.viaTeams).length,
    queue: queue.length, writeBack: people.reduce((a, p) => a + p.writeBack.length, 0),
    stages: ["lead", "registered", "active", "dormant"].reduce((o, s) => (o[s] = people.filter((p) => p.stage === s).length, o), {}),
    facets: facets.length, families: families.length, institutions: institutions.length,
  };
  return { generatedAt: new Date(now).toISOString(), nextId: next, nextFamily: nextFam, people, queue, families, institutions, stats, sources: { equipSyncedAt: (src.equip && src.equip.syncedAt) || null, domains: (src.domains || []).length, hiveOrders: (src.hiveOrders || []).length } };
}

// Gather the sources and write the hub.
async function rebuild(opts) {
  const log = (opts && opts.log) || (() => {});
  const equip = require("./equip");
  const dir = require("./directory");
  const crm = require("./crm");
  const peopleMod = require("./people");
  const [equipData, prev, decisions, hiveOrders, peopleDoc] = await Promise.all([equip.readEquip(), readHub(), readDecisions(), crm.listOrders().catch(() => []), peopleMod.readPeople().catch(() => ({ people: {} }))]);
  let domainsList = [];
  try { domainsList = await dir.verifiedDomains(); } catch (err) { log(`hub: domains not listed (${err.message}); using cached schools only`); }
  if (!domainsList.length) { try { domainsList = await dir.cachedDomains(); } catch (err) { log(`hub: cached schools not listed (${err.message})`); } }
  const domains = [];
  for (const d of domainsList) {
    try {
      const doc = await dir.readDomain(d.domain);
      const users = (doc.users || []).map((u) => Object.assign({}, u, { identity: peopleMod.identityOf(peopleDoc.people[u.upn], u), linked: (peopleDoc.people[u.upn] && peopleDoc.people[u.upn].linked) || [] }));
      domains.push({ domain: d.domain, users });
    } catch { /* a school without a cache yet */ }
  }
  // The Hive workspace's institutions (website snapshot): every school / hive / university row, plus courses per hive.
  let hiveInstitutions = [], schoolRouting = {}, institutionNames = {};
  try {
    const snap = await require("./blob").readSnapshot();
    hiveInstitutions = (snap && snap.institutions) || [];
    schoolRouting = (snap && snap.private && snap.private.schoolRouting) || {};
    const perHive = {}; for (const c of (snap && snap.courses) || []) { const k = hiveKeyOf(c.school && (c.school.abbr || c.school.name)); if (k) perHive[k] = (perHive[k] || 0) + 1; }
    hiveInstitutions = hiveInstitutions.map((h) => Object.assign({}, h, { courses: perHive[hiveKeyOf(h.abbr || h.name)] || 0 }));
  } catch (err) { log(`hub: website snapshot not read (${err.message}); institutions from the tenant only`); }
  try { institutionNames = (await peopleMod.readInstitutions()).institutions || {}; } catch { /* names optional */ }
  const hub = build({ equip: equipData, domains, hiveOrders, prev, decisions, hiveInstitutions, schoolRouting, institutionNames });
  await writeJson(PEOPLE_BLOB, hub);
  log(`hub: ${hub.stats.people} people from ${hub.stats.facets} facets; queue ${hub.stats.queue}`);
  return hub;
}

// What a reader receives of a person, by the access map (api/shared/crm.js).
function maskPerson(p, acc) {
  const rank = (l) => ["none", "masked", "read", "rw"].indexOf(l || "none");
  const seeWho = rank(acc.identity) >= 2, seeMoney = rank(acc.money) >= 2, seeAcc = rank(acc.accounts) >= 2, seeLeads = rank(acc.leads) >= 1, seeOrders = rank(acc.orders) >= 1;
  const o = Object.assign({}, p);
  const dom = (e) => (e ? "…@" + domainOf(e) : "");
  if (!seeWho) {
    o.primaryEmail = dom(p.primaryEmail);
    o.emails = (p.emails || []).map((e) => Object.assign({}, e, { email: dom(e.email) }));
    o.keys = [];
    o.facets = Object.assign({}, p.facets, { customers: (p.facets.customers || []).map((c) => Object.assign({}, c, { teams: dom(c.teams), city: "" })), hive: (p.facets.hive || []).map((h) => Object.assign({}, h, { keys: (h.keys || []).map(dom) })) });
  }
  if (!seeMoney) { o.spend = null; o.hiveTotal = null; o.facets = Object.assign({}, o.facets, { customers: (o.facets.customers || []).map((c) => Object.assign({}, c, { spend: null, received: null })), hive: (o.facets.hive || []).map((h) => Object.assign({}, h, { total: null })) }); }
  if (!seeAcc) o.facets = Object.assign({}, o.facets, { accounts: (o.facets.accounts || []).map((a) => ({ domain: a.domain, identity: a.identity, verified: a.verified })) });
  if (!seeLeads) o.facets = Object.assign({}, o.facets, { leads: [] });
  if (!seeWho && o.family) o.family = Object.assign({}, o.family, { contactEmail: dom(o.family.contactEmail), members: (o.family.members || []).map((m) => Object.assign({}, m, { name: m.name ? m.name.slice(0, 1) + "…" : "" })) });
  if (!seeOrders) o.facets = Object.assign({}, o.facets, { hive: [] });
  return o;
}

module.exports = { PEOPLE_BLOB, DECISIONS_BLOB, MARKS_BLOB, PARTNERS_BLOB, PARTNER_STAGES, readPartners, writePartners, build, rebuild, readHub, readDecisions, writeDecisions, readMarks, writeMarks, withMarks, markStats, replaceEmailOf, maskPerson, normName, pairKey, updateDecisions, updatePartners, updateMarks };
