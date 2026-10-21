// /api/domain/{action} — 学校管理 / 各校管理: what a domain administrator or
// Hive staff may see and do about the accounts of a school's domain.
//
//   GET    domain/domains                 the tenant's domains, flagged with the ones the caller manages
//                                         and what they may do in each
//   GET    domain/users?domain=x          one row per account, from the directory cache,
//                                         with 身份 / 关联账号 / 补充资料 overlaid from people.json
//   GET    domain/groups?domain=x         the groups those accounts belong to, with per-domain member counts
//   GET    domain/sync?domain=x           the cache's status (when it was synced, whether a run is under way)
//   POST   domain/sync   {domain, mode}   one budgeted slice of a sync — "changes" (accounts created, updated
//                                         or deleted since the last sync) or "full"; call again while done:false.
//                                         A IT 管理员's sync is scoped to their own domain (other schools'
//                                         caches and the tenant delta token are left alone); sysadmin = tenant-wide.
//   PATCH  domain/person                  {user, identity?, linked?, note?} → people.json       (IT 管理员, staff)
//   PUT    domain/institution             {domain, name, nameEn} → institutions.json (the school's display names) (sysadmin)
//   DELETE domain/method                  {user, id} → remove one Authenticator / FIDO2 method    (IT 管理员, sysadmin)
//   POST   domain/password                {user} → temporary password, must change at next sign-in (IT 管理员, sysadmin)
//   GET    domain/licenses?domain=x       {faculty, student, extras[]} — the A1 plans and the always-on extras, with free seats
//   POST   domain/user                    {domain, account, givenName, surname, displayName?, identity, city, postalCode, jobTitle?, plan, usageLocation?}
//                                         → create the account (temporary password returned once)         (IT 管理员, sysadmin)
//   DELETE domain/user                    {domain, user} → delete an ordinary account (soft delete, 30 days)   (IT 管理员, sysadmin)
//   GET    domain/user?upn=&full=1         → the account read live into the cache (+ editable fields with full=1)
//   PATCH  domain/user                     {domain, user, givenName?, surname?, displayName?, jobTitle?, city?, postalCode?, usageLocation?, safeEmail?} → Microsoft 365   (IT 管理员, sysadmin)
//   POST   domain/licence                  {domain, user, plan: student|faculty} → A1 for students ↔ A1 for faculty                       (IT 管理员, sysadmin)
//   GET    domain/groupoptions?domain=x    the team types, and whether this school may add accounts of other schools
//   GET    domain/usersearch?domain=x&q=   accounts to put into a team (the school's own; tenant-wide when allowed)
//   GET    domain/group?domain=x&id=       a team of the school, live: owners and members, and what the caller may change
//   POST   domain/group                    {domain, type: class|plc|staff|standard, name, description?, visibility?, owners[], members[]}
//                                          → creates the team in Microsoft Teams (202; polls, or answers pending)      (IT 管理员, sysadmin)
//   POST   domain/groupop                  {domain, id, op, owners[], members[]} → finishes a creation that was still pending
//   POST   domain/grouparchive            {domain, id, archive: true|false}      archive / restore a team      (sysadmin)
//   DELETE domain/group                    {domain, id}        delete a team (channels, files and chat with it; restorable 30 days)  (sysadmin)
//   POST   domain/groupmembers             {domain, id, addMembers?, addOwners?, removeMembers?, removeOwners?}          (IT 管理员, sysadmin)
//   PUT    domain/groupscope               {domain, tenantUsers: bool} → may this school's IT 管理员 add other schools' accounts  (sysadmin)
//
// Who may do what is `can()` in ../shared/roles.js. Every request names a
// domain; the target account's UPN must end in it, or the call is refused — a
// school's administrator cannot reach another school's accounts even by id.
//
// The rows come from the directory cache (../shared/directory.js), filled by
// the nightly sync and the 同步 buttons — never from a live walk of the tenant
// while the page waits (that is what gave HTTP 500 on a larger school,
// Rick, 2026-10-02). Only people.json is read live: it changes by the minute.
const { graph, list } = require("../shared/graph");
const { getPrincipal } = require("../shared/auth");
const { userRoles, managedDomains, can, normUser } = require("../shared/roles");
const { readPeople, writePeople, identityOf, IDENTITIES, readInstitutions, writeInstitutions } = require("../shared/people");
const { readRoles, roleLabel } = require("../shared/roles");
const { audit } = require("../shared/audit");
const { safeEmailProblem } = require("../shared/safe-email");
const people = require("../shared/people");
const peopleMod = people;
const { guard, finish } = require("../shared/session");
const dir = require("../shared/directory");
const tg = require("../shared/teamGroups");
const { readSnapshot } = require("../shared/blob");
const userList = require("../shared/userList");

// Hive course teachers (Rick, 2026-10-08: "a separate Hive Course Teachers"): the
// Teachers table's private contacts (snapshot.private.teachers) matched to tenant
// accounts by Teams account, else by the account's recovery email. Name is never a
// key. Returns Map(upn → { name, teacherId, organization }).
async function hiveTeachersByUpn(users, snap) {
  if (snap === undefined) snap = await readSnapshot().catch(() => null);
  const list = (snap && snap.private && snap.private.teachers) || [];
  if (!list.length) return new Map();
  const byUpn = new Map(), byEmail = new Map();
  for (const t of list) { if (t.teamsAccount) byUpn.set(t.teamsAccount, t); if (t.email) byEmail.set(t.email, t); }
  const out = new Map();
  for (const u of users) {
    const upn = String(u.upn || "").toLowerCase();
    const t = byUpn.get(upn) || byEmail.get(upn) || (u.safeEmail ? byEmail.get(String(u.safeEmail).toLowerCase()) : null);
    if (t) out.set(u.upn, { name: t.name, teacherId: t.teacherId, organization: t.organization });
  }
  return out;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const { DOMAIN_RE, domainOf, methodView } = dir;

function fail(context, status, error, extra) {
  context.res = { status, body: Object.assign({ error }, extra || {}) };
}

// The cached rows plus Hive's own facts about each person.
// Friendly names for the licence plans schools usually have; anything else shows its part number.
const LICENSE_NAMES = {
  STANDARDWOFFPACK_FACULTY: "Office 365 A1 for faculty", STANDARDWOFFPACK_STUDENT: "Office 365 A1 for students",
  STANDARDWOFFPACK_IW_FACULTY: "Office 365 A1 Plus for faculty", STANDARDWOFFPACK_IW_STUDENT: "Office 365 A1 Plus for students",
  M365EDU_A3_FACULTY: "Microsoft 365 A3 for faculty", M365EDU_A3_STUDENT: "Microsoft 365 A3 for students",
  M365EDU_A5_FACULTY: "Microsoft 365 A5 for faculty", M365EDU_A5_STUDENT: "Microsoft 365 A5 for students",
  ENTERPRISEPACKPLUS_FACULTY: "Office 365 A3 for faculty", ENTERPRISEPACKPLUS_STUDENT: "Office 365 A3 for students",
  O365_BUSINESS_ESSENTIALS: "Microsoft 365 Business Basic", O365_BUSINESS_PREMIUM: "Microsoft 365 Business Standard", SPB: "Microsoft 365 Business Premium",
  STANDARDPACK: "Office 365 E1", ENTERPRISEPACK: "Office 365 E3", TEAMS_EXPLORATORY: "Teams Exploratory", FLOW_FREE: "Power Automate Free", POWER_BI_STANDARD: "Power BI (free)",
};

// The licence choice for a new account (Rick, 2026-10-04): Office 365 A1 for
// students (学生 only) or Office 365 A1 for faculty (everyone else) — the Plus
// variants stand in when a tenant has those instead — plus the always-on extras
// (Microsoft Power Automate Free) that every new account gets. Each with its free
// seats, from the tenant's subscribedSkus.
const A1 = { faculty: ["STANDARDWOFFPACK_FACULTY", "STANDARDWOFFPACK_IW_FACULTY"], student: ["STANDARDWOFFPACK_STUDENT", "STANDARDWOFFPACK_IW_STUDENT"] };
const ALWAYS_ON = ["FLOW_FREE"];
async function licencePlans() {
  const skus = await list("/subscribedSkus?$select=skuId,skuPartNumber,prepaidUnits,consumedUnits,capabilityStatus", 100);
  const plan = (k) => { const total = (k.prepaidUnits && k.prepaidUnits.enabled) || 0; return { skuId: k.skuId, part: k.skuPartNumber, name: LICENSE_NAMES[k.skuPartNumber] || k.skuPartNumber, total, used: k.consumedUnits || 0, free: Math.max(0, total - (k.consumedUnits || 0)) }; };
  const enabled = skus.filter((k) => k.capabilityStatus === "Enabled");
  const find = (parts) => { for (const pn of parts) { const k = enabled.find((x) => x.skuPartNumber === pn); if (k) return plan(k); } return null; };
  // a1: every A1 plan the tenant has (any status, any variant) — what a licence change removes.
  const a1 = skus.filter((k) => A1.faculty.concat(A1.student).includes(k.skuPartNumber)).map(plan);
  return { faculty: find(A1.faculty), student: find(A1.student), extras: ALWAYS_ON.map((pn) => find([pn])).filter(Boolean), a1 };
}

// A temporary password Microsoft accepts (3 of 4 character classes, 8–256 chars):
// 14 characters from an alphabet without look-alikes, one of each class forced,
// from the system's random source. Easy to read out over the phone.
const PW_ALPHABET = { upper: "ABCDEFGHJKLMNPQRSTUVWXYZ", lower: "abcdefghijkmnpqrstuvwxyz", digit: "23456789", symbol: "!#%&*+=?@" };
function temporaryPassword() {
  const crypto = require("crypto");
  const pick = (set) => set[crypto.randomInt(set.length)];
  const all = Object.values(PW_ALPHABET).join("");
  const chars = [pick(PW_ALPHABET.upper), pick(PW_ALPHABET.lower), pick(PW_ALPHABET.digit), pick(PW_ALPHABET.symbol)];
  while (chars.length < 14) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
  return chars.join("");
}

// What every school's view needs besides its own directory cache: read once per request, not once per school
// (the 所有学校 view used to read people / roles / group names / the snapshot twenty times over; Rick, 2026-10-21).
async function sharedReads() {
  const [peopleDoc, rolesDoc, gnames, snap] = await Promise.all([readPeople(), readRoles().catch(() => ({ entries: [] })), peopleMod.readGroupNames(), readSnapshot().catch(() => null)]);
  return { peopleDoc, rolesDoc, gnames, snap };
}
async function usersView(domain, shared) {
  const sh = shared || (await sharedReads());
  const doc = await dir.readDomain(domain);
  const { peopleDoc, rolesDoc, gnames } = sh;
  const people = peopleDoc.people;
  const teachers = await hiveTeachersByUpn(doc.users, sh.snap);
  // Every distinct group these accounts belong to, translated once (cached in groupnames.json).
  const distinct = new Map();
  for (const r of doc.users) for (const g of r.groups || []) if (g && g.id && !distinct.has(g.id)) distinct.set(g.id, { id: g.id, name: g.name });
  await peopleMod.translateGroupNames(Array.from(distinct.values()), gnames, "translator");
  const gn = gnames.groups || {};
  const rolesOf = {};
  for (const e of rolesDoc.entries || []) rolesOf[e.user] = (e.roles || []).map((x) => ({ role: x, zh: roleLabel(x, "zh"), en: roleLabel(x, "en") }));
  const users = doc.users.map((r) => {
    const rec = people[r.upn] || null;
    const entra = { department: r.department, jobTitle: r.jobTitle, plan: r.plan || "" };
    return Object.assign({}, r, {
      roles: rolesOf[r.upn] || [],
      hiveTeacher: teachers.get(r.upn) || null,
      groups: (r.groups || []).map((g) => ({ id: g.id, name: g.name, kind: g.kind, nameZh: (gn[g.id] && gn[g.id].zh) || "", nameEn: (gn[g.id] && gn[g.id].en) || "" })),
      identity: identityOf(rec, entra),
      identitySource: rec && IDENTITIES.includes(rec.identity) ? "hive" : (identityOf(null, { department: r.department, jobTitle: r.jobTitle }) ? "entra" : identityOf(null, entra) ? "licence" : ""),
      plan: r.plan || "",
      anomaly: peopleMod.licenceAnomaly(rec && IDENTITIES.includes(rec.identity) ? rec.identity : identityOf(null, { department: r.department, jobTitle: r.jobTitle }), entra),
      linked: rec && Array.isArray(rec.linked) ? rec.linked : [],
      note: (rec && rec.note) || "",
      extra: (rec && rec.extra) || null,
    });
  });
  return { doc, users };
}

async function handler(context, req) {
  const action = String((req.params && req.params.action) || "").toLowerCase();
  const method = String(req.method || "GET").toUpperCase();
  const p = getPrincipal(req);
  const actor = normUser(p && p.userDetails);
  if (!actor) return fail(context, 403, "sign in first", { code: "signed_out" });

  const { roles } = await userRoles(req);
  const allowed = managedDomains(roles);
  const all = allowed.includes("*");
  if (!allowed.length) return fail(context, 403, "no domain to manage", { user: actor, roles });

  const domain = String((req.query && req.query.domain) || (req.body && req.body.domain) || "").trim().toLowerCase();
  const may = (d) => all || allowed.includes(d);

  try {
    if (method === "GET" && action === "domains") {
      let domains = [];
      try {
        domains = await dir.verifiedDomains();
      } catch (err) {
        context.log.warn(`domain/domains: ${err.message}`);
      }
      // A domain administrator's own domains are always listed, even if the directory call failed.
      for (const d of allowed) if (d !== "*" && !domains.some((x) => x.domain === d)) domains.push({ domain: d, isDefault: false, isInitial: false });
      domains = domains.filter((d) => may(d.domain)).sort((a, b) => a.domain.localeCompare(b.domain));
      // What the caller may do in each domain, so the page shows only the controls that work;
      // and the school's display name, which is what everyone but the system administrator sees.
      const inst = (await readInstitutions()).institutions;
      const isAdmin = can(roles, "admin");
      domains = domains.map((d) => Object.assign({}, d, {
        name: (inst[d.domain] && inst[d.domain].name) || "",
        nameEn: (inst[d.domain] && inst[d.domain].nameEn) || "",
        can: { view: can(roles, "view", d.domain), methods: can(roles, "methods", d.domain), people: can(roles, "people", d.domain), plan: can(roles, "plan", d.domain), calendar: can(roles, "calendar", d.domain), calendarEdit: can(roles, "calendarEdit", d.domain), broadcastOptout: can(roles, "optout", d.domain), full: isAdmin, institutions: isAdmin, groups: can(roles, "methods", d.domain), groupTenant: isAdmin || (inst[d.domain] || {}).groupTenant === true, groupTenantSchool: (inst[d.domain] || {}).groupTenant === true, groupScope: isAdmin },
      }));
      context.res = { status: 200, body: { user: actor, roles, all, domains, mine: domainOf(actor), showDomains: isAdmin } };
      return;
    }

    // domain=* — the users of every school the caller manages, merged server side,
    // each row carrying its domain (the 所有学校 view; self-review 2026-10-08: the page
    // used to fetch every school separately and merge in the browser).
    // Paged since 2026-10-21 (Rick: the page took long to open): ?offset&limit&q&filter&role&sort → one page of the rows
    // that match, the number that match, and the tile counts of the whole set; limit=all for the CSV. The shared reads
    // happen once, the schools' caches in parallel. `timing` says where the time went (shown to the sysadmin).
    if (method === "GET" && action === "users" && domain === "*") {
      const t0 = Date.now();
      let list = all ? [] : allowed.filter((d) => d !== "*");
      if (all) { try { list = (await dir.verifiedDomains()).map((d) => d.domain); } catch { list = []; } if (!list.length) { try { list = (await dir.cachedDomains()).map((d) => d.domain); } catch { list = []; } } }
      if (list.length < 2) return fail(context, 403, "all schools needs more than one managed school", { allowed: list });
      const [shared, inst] = await Promise.all([sharedReads(), readInstitutions().catch(() => ({ institutions: {} }))]);
      const t1 = Date.now();
      const views = await Promise.all(list.map((d) => usersView(d, shared).then((v) => ({ d, v })).catch(() => null)));
      const t2 = Date.now();
      const users = [], syncs = [];
      for (const x of views) { if (!x) continue; for (const u of x.v.users) users.push(Object.assign({}, u, { domain: x.d })); syncs.push(dir.status(x.v.doc)); }
      const latest = syncs.filter((s) => s && s.syncedAt).sort((a, b) => String(b.syncedAt).localeCompare(String(a.syncedAt)))[0] || null;
      const opts = userList.parseQuery(req.query);
      const pg = userList.page(users, opts, inst.institutions || {});
      const t3 = Date.now();
      context.res = { status: 200, headers: { "Cache-Control": "no-store" }, body: { domain: "*", domains: list, users: pg.users, matched: pg.matched, offset: pg.offset, limit: pg.limit, counts: pg.counts, query: { q: opts.q, filter: opts.filter, role: opts.role, sort: opts.sort }, partial: users.some((u) => u.partial), sync: latest, timing: { shared: t1 - t0, schools: t2 - t1, page: t3 - t2, total: t3 - t0, schoolsRead: views.filter(Boolean).length } } };
      return;
    }

    if (!DOMAIN_RE.test(domain)) return fail(context, 400, "domain missing or malformed");
    if (!may(domain)) return fail(context, 403, `you do not manage ${domain}`, { allowed: all ? ["*"] : allowed });
    // An 教育领袖 holds the school only for its 课程方案 (api/school-plan), not its accounts.
    if (!can(roles, "view", domain)) return fail(context, 403, `you do not manage the accounts of ${domain}`, { code: "forbidden" });

    if (method === "GET" && action === "users") {
      const { doc, users } = await usersView(domain);
      context.res = { status: 200, body: Object.assign({ domain, users, partial: users.some((u) => u.partial) }, { sync: dir.status(doc) }) };
      return;
    }
    // One account read live from Microsoft and written into the cache (the person panel
    // calls it when it opens, 2026-10-12): an authenticator registered since the last
    // full sync, or a new Teams group, shows at once.
    if (method === "GET" && action === "user") {
      const upn = String((req.query && req.query.upn) || "").trim().toLowerCase();
      if (!upn || domainOf(upn) !== domain) return fail(context, 400, "upn must be an account of this domain");
      const row = await dir.refreshUser(domain, upn);
      const view = row ? (await usersView(domain)).users.find((u) => u.upn === upn) || null : null;
      // ?full=1 (修改资料 form): the editable fields as Microsoft has them now.
      let profile = null;
      if (row && req.query && req.query.full && can(roles, "methods", domain)) {
        const p = await graph("GET", `/users/${encodeURIComponent(row.id)}?$select=givenName,surname,displayName,jobTitle,city,postalCode,usageLocation,otherMails`);
        profile = { givenName: p.givenName || "", surname: p.surname || "", displayName: p.displayName || "", jobTitle: p.jobTitle || "", city: p.city || "", postalCode: p.postalCode || "", usageLocation: p.usageLocation || "", safeEmail: (p.otherMails || [])[0] || "" };
      }
      context.res = { status: 200, headers: { "Cache-Control": "no-store" }, body: { domain, user: view, gone: !row, profile } };
      return;
    }
    if (method === "GET" && action === "groups") {
      const [doc, names] = await Promise.all([dir.readDomain(domain), people.readGroupNames()]);
      const own = dir.groupsOf(doc.users, doc.groupOwners, domain, doc.groupArchived);
      context.res = { status: 200, body: { domain, groups: await people.translateGroupNames(own, names, actor), elsewhere: own.elsewhere, ownersKnown: !!doc.groupOwners, sync: dir.status(doc) } };
      return;
    }

    // Both-language names for a Teams group, shown in the management centre only
    // (the domain's IT 管理员, Hive staff); the tenant's own name is not changed.
    if (method === "PUT" && action === "groupname") {
      if (!can(roles, "people", domain)) return fail(context, 403, "group names are set by the IT 管理员 or Hive staff", { code: "forbidden" });
      const id = String((req.body && req.body.id) || "").trim();
      if (!/^[0-9a-f-]{36}$/i.test(id)) return fail(context, 400, "group id missing");
      const zh = String((req.body && req.body.zh) || "").trim().slice(0, 80);
      const en = String((req.body && req.body.en) || "").trim().slice(0, 100);
      if (/[<>]/.test(zh + en)) return fail(context, 400, "name: no < or >");
      await people.updateGroupNames((doc) => {
        if (zh || en) doc.groups[id] = { zh, en, by: actor, at: new Date().toISOString() };
        else delete doc.groups[id];
      });
      await audit(context, { actor, action: "group.names", target: id, domain, zh, en, result: "ok" });
      context.res = { status: 200, body: { ok: true, id, zh, en } };
      return;
    }

    // ---- 新建 Teams 群组 (Rick, 2026-10-16) -------------------------------------------------
    // So that ordinary users can be stopped from creating groups in the tenant, the IT 管理员
    // creates a school's teams here and manages their owners and members. Everything goes
    // through ../shared/teamGroups.js; this part decides who may do it and for whom.
    const groupFail = (err, what) => {
      if (err.status === 403) return fail(context, 403, `Microsoft refused (${what}): Hive's app probably lacks the permission Team.Create or Group.ReadWrite.All — the system administrator grants it in Entra › App registrations › API permissions`, { code: "app_permission" });
      if (err.status === 404) return fail(context, 404, "Microsoft does not know that group or account", { code: "not_found" });
      if (err.status === 400) return fail(context, 400, "Microsoft refused: " + (err.message.split(": ").slice(1).join(": ") || err.code), { code: err.code || "refused" });
      throw err;
    };
    const isSysadmin = () => can(roles, "admin");
    const tenantScope = async () => isSysadmin() || ((await readInstitutions()).institutions[domain] || {}).groupTenant === true;
    // Owners of a class / PLC / staff team must not be students (Teams makes the owner a teacher).
    const studentsAmong = async (upns) => {
      const [doc, pdoc] = await Promise.all([dir.readDomain(domain), readPeople()]);
      const rows = new Map(doc.users.map((r) => [String(r.upn).toLowerCase(), r]));
      // An account the cache has not seen yet (made minutes ago) still has its 身份 in people.json.
      return upns.filter((u) => { const r = rows.get(u) || {}; return identityOf((pdoc.people || {})[u] || (pdoc.people || {})[r.upn] || null, { department: r.department, jobTitle: r.jobTitle, plan: r.plan || "" }) === "学生"; });
    };
    // The group as the page shows and edits it.
    const peopleView = (arr, tenant, ownerIds) => arr.map((x) => { const upn = String(x.userPrincipalName || "").toLowerCase(); return { id: x.id, upn, name: x.displayName || "", domain: domainOf(upn), editable: isSysadmin() || tenant || domainOf(upn) === domain, owner: ownerIds ? ownerIds.has(x.id) : undefined }; }).sort((a, b) => a.upn.localeCompare(b.upn));
    const classOf = async (g) => { if (!(g.resourceProvisioningOptions || []).includes("Team")) return false; try { const t = await graph("GET", `/teams/${g.id}?$select=id,specialization`); return t && t.specialization === "educationClass"; } catch { return false; } };
    // After a team was created or its people changed: the cache, the audit line, the reply.
    async function afterPeople(g, ownerUpns, add, remove) {
      try { await dir.noteGroup(domain, { id: g.id, name: g.displayName, description: g.description || "", mail: g.mail || "", kind: tg.kindOf(g, await classOf(g)), visibility: g.visibility || "" }, { owners: ownerUpns, add: add.filter((u) => domainOf(u) === domain), remove: remove.filter((u) => domainOf(u) === domain) }); } catch { /* the next sync catches up */ }
    }

    if (method === "GET" && action === "groupoptions") {
      if (!can(roles, "methods", domain)) return fail(context, 403, "teams are created by the IT 管理员", { code: "forbidden" });
      const allowed = ((await readInstitutions()).institutions[domain] || {}).groupTenant === true;
      context.res = { status: 200, headers: { "Cache-Control": "no-store" }, body: { domain, types: tg.typeList(), tenantUsers: isSysadmin() || allowed, allowedByAdmin: allowed, canSetScope: isSysadmin() } };
      return;
    }

    if (method === "PUT" && action === "groupscope") {
      if (!isSysadmin()) return fail(context, 403, "which accounts a school's IT 管理员 may add to a team is set by the system administrator", { code: "forbidden" });
      const on = !!(req.body && req.body.tenantUsers);
      await people.updateInstitutions((doc) => {
        const cur = doc.institutions[domain] || {};
        const next = Object.assign({}, cur);
        if (on) next.groupTenant = true; else delete next.groupTenant;
        if (!next.name && !next.nameEn && !next.groupTenant) delete doc.institutions[domain]; else doc.institutions[domain] = next;
      });
      await audit(context, { actor, action: "group.scope", target: domain, tenantUsers: on, result: "ok" });
      context.res = { status: 200, body: { ok: true, domain, tenantUsers: on } };
      return;
    }

    if (method === "GET" && action === "usersearch") {
      if (!can(roles, "methods", domain)) return fail(context, 403, "teams are managed by the IT 管理员", { code: "forbidden" });
      const q = String((req.query && req.query.q) || "").replace(/["\\]/g, " ").trim().slice(0, 40);
      if (q.length < 1) { context.res = { status: 200, body: { users: [] } }; return; }
      const tenant = await tenantScope();
      let out;
      if (!tenant) {
        const ql = q.toLowerCase();
        const doc = await dir.readDomain(domain);
        out = doc.users.filter((r) => r.enabled !== false && (String(r.upn).toLowerCase().includes(ql) || String(r.displayName || "").toLowerCase().includes(ql))).slice(0, 8).map((r) => ({ upn: String(r.upn).toLowerCase(), name: r.displayName || "" }));
      } else {
        const r = await graph("GET", `/users?$search=${encodeURIComponent(`"displayName:${q}" OR "userPrincipalName:${q}"`)}&$select=id,userPrincipalName,displayName,userType&$top=10`, undefined, { ConsistencyLevel: "eventual" });
        out = ((r && r.value) || []).filter((u) => u.userType !== "Guest" && u.userPrincipalName).slice(0, 8).map((u) => ({ upn: String(u.userPrincipalName).toLowerCase(), name: u.displayName || "" }));
      }
      context.res = { status: 200, headers: { "Cache-Control": "no-store" }, body: { users: out, tenant } };
      return;
    }

    if (method === "GET" && action === "group") {
      if (!can(roles, "methods", domain)) return fail(context, 403, "teams are managed by the IT 管理员", { code: "forbidden" });
      const id = String((req.query && req.query.id) || "").trim();
      if (!/^[0-9a-f-]{36}$/i.test(id)) return fail(context, 400, "group id missing");
      let read;
      try { read = await tg.readGroup(id); } catch (err) { return groupFail(err, "read the group"); }
      const m = tg.manageable(read.g, read.owners, domain, isSysadmin());
      if (!m.ok) return fail(context, m.forbidden ? 403 : 400, m.why, { code: m.forbidden ? "forbidden" : "not_managed" });
      const tenant = await tenantScope();
      const [members, archived] = await Promise.all([tg.readMembers(id), tg.archivedState(read.g).catch(() => null)]);
      const ownerIds = new Set(read.owners.map((o) => o.id));
      context.res = { status: 200, headers: { "Cache-Control": "no-store" }, body: { domain, tenantUsers: tenant, archived, canDelete: isSysadmin(), group: { id: read.g.id, name: read.g.displayName, description: read.g.description || "", visibility: read.g.visibility || "", kind: tg.kindOf(read.g, await classOf(read.g)) }, owners: peopleView(read.owners, tenant), members: peopleView(members, tenant, ownerIds) } };
      return;
    }

    if (method === "POST" && action === "group") {
      if (!can(roles, "methods", domain)) return fail(context, 403, "teams are created by the IT 管理员", { code: "forbidden" });
      const { problems, clean } = tg.validateCreate(req.body);
      if (problems.length) return fail(context, 400, "please check the form", { problems });
      const found = await tg.lookupUsers(clean.owners.concat(clean.members), domain, await tenantScope());
      if (found.problems.length) return fail(context, 400, "please check the form", { problems: found.problems });
      if (tg.TYPES[clean.type].education) {
        const bad = await studentsAmong(clean.owners);
        if (bad.length) return fail(context, 400, "please check the form", { problems: bad.map((u) => `${u} is a student: the owner of a ${tg.TYPES[clean.type].en} team must be a teacher or staff member`) });
      }
      let made;
      try { made = await tg.createTeam(clean, found.users.get(clean.owners[0]).id); } catch (err) {
        await audit(context, { actor, action: "group.create", target: clean.name, domain, type: clean.type, result: "failed", error: err.code || err.status });
        return groupFail(err, "create the team");
      }
      await audit(context, { actor, action: "group.create", target: made.id, domain, name: clean.name, type: clean.type, visibility: clean.visibility, owners: clean.owners, members: clean.members.length, result: "ok" });
      const op = await tg.waitFor(made.id, made.op, tg.WAIT.create);
      if (op.state === "failed") return fail(context, 502, "Microsoft could not create the team: " + op.error, { code: "create_failed" });
      if (op.state === "pending") { context.res = { status: 200, headers: { "Cache-Control": "no-store" }, body: { ok: true, pending: true, id: made.id, op: made.op, name: clean.name } }; return; }
      const peopleToAdd = { owners: clean.owners.slice(1).map((u) => found.users.get(u)), members: clean.members.map((u) => found.users.get(u)) };
      const res = await tg.addPeople(made.id, peopleToAdd.owners, peopleToAdd.members);
      const g = await graph("GET", `/groups/${made.id}?$select=id,displayName,description,visibility,groupTypes,mail,resourceProvisioningOptions`).catch(() => ({ id: made.id, displayName: clean.name, description: clean.description, visibility: clean.visibility, resourceProvisioningOptions: ["Team"] }));
      await afterPeople(g, clean.owners, clean.owners.concat(clean.members), []);
      if (res.failed.length) await audit(context, { actor, action: "group.members", target: made.id, domain, failed: res.failed, result: "partial" });
      context.res = { status: 200, headers: { "Cache-Control": "no-store" }, body: { ok: true, id: made.id, name: clean.name, type: clean.type, owners: clean.owners.length, members: clean.members.length, failed: res.failed } };
      return;
    }

    // A creation that was still under way when POST group answered: the page asks again
    // (with the people it still has to add) until Microsoft says it is done.
    if (method === "POST" && action === "groupop") {
      if (!can(roles, "methods", domain)) return fail(context, 403, "teams are created by the IT 管理员", { code: "forbidden" });
      const b = req.body || {};
      const id = String(b.id || "").trim(), opId = String(b.op || "").trim();
      if (!/^[0-9a-f-]{36}$/i.test(id) || !/^[0-9a-f-]{36}$/i.test(opId)) return fail(context, 400, "group or operation id missing");
      const lc = (a) => (Array.isArray(a) ? a : []).map((x) => String(x || "").trim().toLowerCase()).filter(Boolean);
      const owners = Array.from(new Set(lc(b.owners))), members = Array.from(new Set(lc(b.members))).filter((u) => !owners.includes(u));
      let op;
      try { op = await tg.waitFor(id, opId, tg.WAIT.check); } catch (err) { return groupFail(err, "check the creation"); }
      if (op.state === "failed") return fail(context, 502, "Microsoft could not create the team: " + op.error, { code: "create_failed" });
      if (op.state === "pending") { context.res = { status: 200, headers: { "Cache-Control": "no-store" }, body: { ok: true, pending: true, id, op: opId } }; return; }
      let read;
      try { read = await tg.readGroup(id); } catch (err) { return groupFail(err, "read the group"); }
      const m = tg.manageable(read.g, read.owners, domain, isSysadmin());
      if (!m.ok) return fail(context, m.forbidden ? 403 : 400, m.why, { code: "forbidden" });
      const found = await tg.lookupUsers(owners.concat(members), domain, await tenantScope());
      if (found.problems.length) return fail(context, 400, "please check the form", { problems: found.problems });
      const have = new Set(read.owners.map((o) => String(o.userPrincipalName).toLowerCase()));
      const res = await tg.addPeople(id, owners.filter((u) => !have.has(u)).map((u) => found.users.get(u)), members.map((u) => found.users.get(u)));
      await afterPeople(read.g, owners, owners.concat(members), []);
      context.res = { status: 200, headers: { "Cache-Control": "no-store" }, body: { ok: true, id, name: read.g.displayName, owners: owners.length, members: members.length, failed: res.failed } };
      return;
    }

    // 归档 / 恢复 / 删除团队 — the system administrator only (Rick, 2026-10-18). Deleting removes the
    // team with its channels, files and chat; the page asks twice, Microsoft keeps it 30 days.
    if ((method === "POST" && action === "grouparchive") || (method === "DELETE" && action === "group")) {
      if (!isSysadmin()) return fail(context, 403, "only the system administrator archives or deletes a team", { code: "forbidden" });
      const b = req.body || {};
      const id = String(b.id || "").trim();
      if (!/^[0-9a-f-]{36}$/i.test(id)) return fail(context, 400, "group id missing");
      let read;
      try { read = await tg.readGroup(id); } catch (err) { return groupFail(err, "read the group"); }
      const m = tg.manageable(read.g, read.owners, domain, true);
      if (!m.ok) return fail(context, 400, m.why, { code: "not_managed" });
      const name = read.g.displayName || "";
      if (action === "grouparchive") {
        const on = b.archive !== false;
        if (!(read.g.resourceProvisioningOptions || []).includes("Team")) return fail(context, 400, "only a team can be archived", { code: "not_team" });
        try { await tg.setArchived(id, on); } catch (err) { return groupFail(err, on ? "archive the team" : "restore the team"); }
        try { await dir.noteGroupArchived(id, on); } catch { /* the panel reads the live flag anyway */ }
        await audit(context, { actor, action: on ? "group.archive" : "group.unarchive", target: id, domain, name, result: "ok" });
        context.res = { status: 200, headers: { "Cache-Control": "no-store" }, body: { ok: true, id, name, archived: on } };
        return;
      }
      try { await tg.deleteGroup(id); } catch (err) { return groupFail(err, "delete the team"); }
      try { await dir.forgetGroup(id); } catch { /* the next sync drops it */ }
      await audit(context, { actor, action: "group.delete", target: id, domain, name, owners: read.owners.map((o) => String(o.userPrincipalName).toLowerCase()), result: "ok" });
      context.res = { status: 200, headers: { "Cache-Control": "no-store" }, body: { ok: true, id, name, deleted: true } };
      return;
    }
    if (method === "POST" && action === "groupmembers") {
      if (!can(roles, "methods", domain)) return fail(context, 403, "team members are managed by the IT 管理员", { code: "forbidden" });
      const b = req.body || {};
      const id = String(b.id || "").trim();
      if (!/^[0-9a-f-]{36}$/i.test(id)) return fail(context, 400, "group id missing");
      const lc = (a) => Array.from(new Set((Array.isArray(a) ? a : []).map((x) => String(x || "").trim().toLowerCase()).filter(Boolean)));
      const addM = lc(b.addMembers), addO = lc(b.addOwners), remM = lc(b.removeMembers), remO = lc(b.removeOwners);
      if (!addM.length && !addO.length && !remM.length && !remO.length) return fail(context, 400, "nothing to change");
      let read;
      try { read = await tg.readGroup(id); } catch (err) { return groupFail(err, "read the group"); }
      const m = tg.manageable(read.g, read.owners, domain, isSysadmin());
      if (!m.ok) return fail(context, m.forbidden ? 403 : 400, m.why, { code: m.forbidden ? "forbidden" : "not_managed" });
      const tenant = await tenantScope();
      const found = await tg.lookupUsers(addM.concat(addO), domain, tenant);
      const problems = found.problems.slice();
      const current = (remM.length || remO.length) ? await tg.readMembers(id) : [];
      const byUpn = new Map(current.concat(read.owners).map((x) => [String(x.userPrincipalName).toLowerCase(), x]));
      for (const u of remM.concat(remO)) {
        if (!tenant && !isSysadmin() && domainOf(u) !== domain) problems.push(`${u} is not an account of this school: only the system administrator removes other schools' accounts`);
        else if (!byUpn.has(u)) problems.push(`${u} is not in this team`);
      }
      const ownersAfter = new Set(read.owners.map((o) => String(o.userPrincipalName).toLowerCase()));
      addO.forEach((u) => ownersAfter.add(u)); remM.concat(remO).forEach((u) => ownersAfter.delete(u));
      if (!ownersAfter.size) problems.push("a team always keeps an owner: add another owner first");
      if (problems.length) return fail(context, 400, "please check the form", { problems });
      try {
        const ownerRecs = addO.map((u) => found.users.get(u));
        for (const o of ownerRecs) await tg.addOwner(id, o.id);
        const ids = Array.from(new Set(ownerRecs.concat(addM.map((u) => found.users.get(u))).map((x) => x.id)));
        const done = ids.length ? await tg.addMembers(id, ids) : [];
        if (ids.length && done.length < ids.length) return fail(context, 502, "Microsoft added only some of the accounts; reopen the team to see who is in", { code: "partial" });
        for (const u of remO) { if (!remM.includes(u)) await graph("DELETE", `/groups/${id}/owners/${byUpn.get(u).id}/$ref`).catch((e) => { if (e.status !== 404) throw e; }); }
        for (const u of remM) {
          const uid = byUpn.get(u).id;
          await graph("DELETE", `/groups/${id}/owners/${uid}/$ref`).catch((e) => { if (e.status !== 404 && e.status !== 400) throw e; });
          await graph("DELETE", `/groups/${id}/members/${uid}/$ref`).catch((e) => { if (e.status !== 404) throw e; });
        }
      } catch (err) {
        await audit(context, { actor, action: "group.members", target: id, domain, result: "failed", error: err.code || err.status });
        return groupFail(err, "change the team's people");
      }
      await audit(context, { actor, action: "group.members", target: id, domain, name: read.g.displayName, addMembers: addM, addOwners: addO, removeMembers: remM, removeOwners: remO, result: "ok" });
      await afterPeople(read.g, Array.from(ownersAfter), addM.concat(addO), remM);
      context.res = { status: 200, headers: { "Cache-Control": "no-store" }, body: { ok: true, id, added: addM.length + addO.length, removed: remM.length + remO.length } };
      return;
    }

    if (action === "sync") {
      if (method === "GET") {
        context.res = { status: 200, body: dir.status(await dir.readDomain(domain)) };
        return;
      }
      if (method === "POST") {
        const mode = String((req.body && req.body.mode) || "changes").toLowerCase();
        if (mode !== "changes" && mode !== "new" && mode !== "full") return fail(context, 400, "mode must be changes, new or full");
        // A full pass of a school is heavier and drops vanished accounts: system administrators only.
        if (mode === "full" && !can(roles, "admin")) return fail(context, 403, "a full sync is run by the system administrator (or nightly)", { code: "forbidden" });
        // The system administrator's sync is tenant-wide intake (every school's cache
        // learns its share, the delta token advances); a IT 管理员's sync touches
        // only the school they manage.
        const scope = can(roles, "admin") ? "tenant" : "domain";
        const st = await dir.syncSlice(domain, mode, { budgetMs: 20000, by: actor, scope, log: (m) => context.log(m) });
        if (st.done) await audit(context, { actor, action: "directory.sync", target: domain, mode, users: st.users, added: st.added, removed: st.removed, result: "ok" });
        context.res = { status: 200, body: st };
        return;
      }
    }

    if (method === "PUT" && action === "institution") {
      if (!can(roles, "admin")) return fail(context, 403, "institution names are set by the system administrator", { code: "forbidden" });
      // Chinese and English names (Rick, 2026-10-03: 「机构名称需要中英文」); the page shows the one of its language.
      const name = String((req.body && req.body.name) || "").trim().slice(0, 60);
      const nameEn = String((req.body && req.body.nameEn) || "").trim().slice(0, 80);
      if (/[<>]/.test(name + nameEn)) return fail(context, 400, "name: no < or >");
      await people.updateInstitutions((doc) => {
        const keep = doc.institutions[domain] && doc.institutions[domain].groupTenant === true; // 群组范围 survives a rename
        if (name || nameEn || keep) doc.institutions[domain] = Object.assign({ name, nameEn, by: actor, at: new Date().toISOString() }, keep ? { groupTenant: true } : {});
        else delete doc.institutions[domain];
      });
      await audit(context, { actor, action: "institution.update", target: domain, name, nameEn, result: "ok" });
      context.res = { status: 200, body: { ok: true, domain, name, nameEn } };
      return;
    }

    // 批量设置身份 (Rick 2026-10-21: 「set users role to 老师 for 华西人文学院, write back to office 365 tenant」): one
    // identity for every account of the school (or only those without one), written to people.json like a single
    // PATCH person; with writeBack, also to each Microsoft account's jobTitle — never department (policy 2026-10-10:
    // the school's name, or anything Hive-set, stays out of department). The licence plan does not matter (the
    // licence ↔ 身份 rule was withdrawn 2026-10-21: parents hold the students plan too).
    // {domain, identity, scope: "all"|"noid", users?: [upn…], writeBack?, dryRun?}
    if (method === "POST" && action === "identity-bulk") {
      if (!can(roles, "people", domain)) return fail(context, 403, "身份 is edited by the IT 管理员 or Hive staff", { code: "forbidden" });
      const b = req.body || {};
      const identity = String(b.identity || "").trim();
      if (!IDENTITIES.includes(identity)) return fail(context, 400, "identity must be one of " + IDENTITIES.join(" / "), { code: "identity" });
      const writeBack = !!b.writeBack, dry = !!b.dryRun, scope = b.scope === "noid" ? "noid" : "all";
      if (writeBack && !can(roles, "methods", domain)) return fail(context, 403, "writing the Microsoft accounts needs the IT 管理员", { code: "forbidden" });
      const [doc, pdoc] = await Promise.all([dir.readDomain(domain), readPeople()]);
      const only = Array.isArray(b.users) && b.users.length ? new Set(b.users.map(normUser)) : null;
      const picked = [], skipped = [];
      for (const r of doc.users || []) {
        const upn = String(r.upn || "").toLowerCase();
        if (only && !only.has(upn)) continue;
        if (r.enabled === false) { skipped.push({ upn, why: "disabled" }); continue; }
        const rec = (pdoc.people || {})[upn] || null;
        const cur = identityOf(rec, { department: r.department, jobTitle: r.jobTitle, plan: r.plan || "" });
        if (scope === "noid" && rec && IDENTITIES.includes(rec.identity)) { skipped.push({ upn, why: "has_identity", identity: rec.identity }); continue; }
        picked.push({ upn, id: r.id, from: cur, jobTitle: r.jobTitle || "" });
      }
      if (dry) { context.res = { status: 200, body: { ok: true, dryRun: true, identity, scope, writeBack, count: picked.length, picked: picked.map((p) => p.upn), skipped } }; return; }
      const at = new Date().toISOString();
      if (picked.length) await people.updatePeople((d) => { for (const p of picked) d.people[p.upn] = Object.assign({}, d.people[p.upn] || {}, { identity, by: actor, at }); });
      const written = [], failed = [];
      if (writeBack) {
        // ten at a time; a refused account is reported, the rest go on
        for (let i = 0; i < picked.length; i += 10) {
          await Promise.all(picked.slice(i, i + 10).map(async (p) => {
            if (p.jobTitle === identity) { written.push(p.upn); return; }
            try {
              await graph("PATCH", `/users/${encodeURIComponent(p.id || p.upn)}`, { jobTitle: identity });
              written.push(p.upn);
            } catch (err) { failed.push({ upn: p.upn, error: String((err && (err.code || err.status || err.message)) || err).slice(0, 120) }); }
          }));
        }
      }
      // the cache rows follow, one write at a time (two concurrent touchUser calls would overwrite each other)
      for (const upn of written) await dir.touchUser(domain, upn, { jobTitle: identity }).catch((err) => context.log.warn(`identity-bulk: cache row not updated for ${upn}: ${err && err.message}`));
      await audit(context, { actor, action: "person.identity-bulk", domain, identity, scope, writeBack, count: picked.length, written: written.length, failed: failed.length, skipped: skipped.length, result: failed.length ? "partial" : "ok" });
      context.res = { status: 200, body: { ok: true, identity, scope, writeBack, count: picked.length, picked: picked.map((p) => p.upn), written, failed, skipped } };
      return;
    }

    if (method === "PATCH" && action === "person") {
      if (!can(roles, "people", domain)) return fail(context, 403, "身份 and linked accounts are edited by the IT 管理员 or Hive staff", { code: "forbidden" });
      const b = req.body || {};
      const user = normUser(b.user);
      if (!EMAIL_RE.test(user) || domainOf(user) !== domain) return fail(context, 400, "user must be an account in this domain");
      const problems = [];
      const patch = {};
      if (b.identity !== undefined) {
        const v = String(b.identity || "").trim();
        if (v && !IDENTITIES.includes(v)) problems.push("identity must be one of " + IDENTITIES.join(" / "));
        else patch.identity = v;
      }
      if (b.linked !== undefined) {
        const arr = (Array.isArray(b.linked) ? b.linked : String(b.linked).split(/[\s,;，；]+/)).map(normUser).filter(Boolean);
        const bad = arr.filter((x) => !EMAIL_RE.test(x) || x === user);
        if (bad.length) problems.push("linked accounts must be other accounts: " + bad.join(", "));
        else patch.linked = Array.from(new Set(arr)).slice(0, 10);
      }
      if (b.note !== undefined) patch.note = String(b.note || "").trim().slice(0, 200);
      if (problems.length) return fail(context, 400, "please fix the form", { problems });
      if (!Object.keys(patch).length) return fail(context, 400, "nothing to change");
      const { doc } = await people.updatePeople((d) => {
        const cur = d.people[user] || {};
        d.people[user] = Object.assign({}, cur, patch, { by: actor, at: new Date().toISOString() });
        if (!d.people[user].identity && !(d.people[user].linked || []).length && !d.people[user].note && !d.people[user].extra) delete d.people[user];
      });
      await audit(context, { actor, action: "person.update", target: user, fields: Object.keys(patch), result: "ok" });
      context.res = { status: 200, body: { ok: true, user, record: doc.people[user] || null } };
      return;
    }

    if (method === "DELETE" && action === "method") {
      if (!can(roles, "methods", domain)) return fail(context, 403, "sign-in devices are managed by the IT 管理员", { code: "forbidden" });
      const b = req.body || {};
      const user = normUser(b.user);
      const id = String(b.id || "");
      if (!EMAIL_RE.test(user) || domainOf(user) !== domain) return fail(context, 400, "user must be an account in this domain");
      if (!/^[A-Za-z0-9\-_=+/]{8,200}$/.test(id)) return fail(context, 400, "method id missing");
      const u = await graph("GET", `/users/${encodeURIComponent(user)}?$select=id,userPrincipalName`);
      const methods = (await list(`/users/${u.id}/authentication/methods`, 50)).map(methodView);
      const m = methods.find((x) => x.id === id);
      if (!m) return fail(context, 404, "no such method on that account");
      const path = m.kind === "authenticator" ? "microsoftAuthenticatorMethods" : m.kind === "fido2" ? "fido2Methods" : null;
      if (!path) return fail(context, 400, `a ${m.kind} method cannot be removed here`);
      try {
        await graph("DELETE", `/users/${u.id}/authentication/${path}/${encodeURIComponent(id)}`);
      } catch (err) {
        await audit(context, { actor, action: "method.delete", target: user, method: m.kind, device: m.name, result: "failed", error: err.code || err.status });
        if (err.status === 403) return fail(context, 403, "Microsoft refused: this is probably an administrator account, whose methods Hive may not change.", { code: err.code });
        throw err;
      }
      // Keep the cached row honest until the next sync.
      const left = methods.filter((x) => x.strong && x.id !== id);
      try { await dir.touchUser(domain, user, { devices: left.map((x) => ({ id: x.id, kind: x.kind, name: x.name, version: x.version, created: x.created })), verified: left.length > 0 }); } catch { /* best effort */ }
      await audit(context, { actor, action: "method.delete", target: user, method: m.kind, device: m.name, result: "ok" });
      context.res = { status: 200, body: { ok: true, removed: { id, kind: m.kind, name: m.name }, remainingStrong: left.length } };
      return;
    }

    // 新建账号 (Rick, 2026-10-04: 「Give domain admin the right to create accounts under
    // the specific domain that domain admin belongs to」). GET domain/licenses lists the
    // tenant's licence plans with free seats (Office 365 A1 for faculty / students and
    // the like), so the form can offer one; POST domain/user creates the account in
    // this domain with a temporary password (must change at first sign-in), the
    // chosen licence (usageLocation is required for that) and Hive's 身份, puts it
    // into the directory cache at once, and returns the temporary password once.
    // Both need can(roles, "methods", domain): a IT 管理员for their school, or the
    // system administrator. Graph: User.ReadWrite.All (create, assignLicense),
    // Directory.Read.All (subscribedSkus). No directory role is needed to create
    // an ordinary account; Microsoft will not let this create an administrator.
    if (method === "GET" && action === "licenses") {
      if (!can(roles, "methods", domain)) return fail(context, 403, "accounts are created by the IT 管理员", { code: "forbidden" });
      const lic = await licencePlans();
      context.res = { status: 200, headers: { "Cache-Control": "no-store" }, body: Object.assign({ usageLocation: process.env.HIVE_USAGE_LOCATION || "CN" }, lic) };
      return;
    }
    if (method === "POST" && action === "user") {
      if (!can(roles, "methods", domain)) return fail(context, 403, "accounts are created by the IT 管理员", { code: "forbidden" });
      const b = req.body || {};
      const nick = String(b.account || "").trim().toLowerCase();
      const givenName = String(b.givenName || "").trim(), surname = String(b.surname || "").trim();
      // Default display name: 姓名 for Chinese names (surname first, no space), "Given Surname" otherwise.
      const cjk = /[\u4e00-\u9fff]/.test(surname + givenName);
      const displayName = String(b.displayName || "").trim() || (cjk ? [surname, givenName] : [givenName, surname]).filter(Boolean).join(cjk ? "" : " ");
      const identity = String(b.identity || "").trim();
      const jobTitle = String(b.jobTitle || "").trim();
      const city = String(b.city || "").trim();
      const postalCode = String(b.postalCode || "").trim();
      const plan = String(b.plan || "").trim().toLowerCase(); // "faculty" | "student" (Rick, 2026-10-04: A1 for students is for students only; everyone else gets A1 for faculty)
      const usageLocation = String(b.usageLocation || process.env.HIVE_USAGE_LOCATION || "CN").trim().toUpperCase();
      const problems = [];
      if (!/^[a-z0-9][a-z0-9._-]{0,62}$/.test(nick) || /\.\.|\.$/.test(nick)) problems.push("account name: letters, digits, . _ - only (2–63), e.g. li.ming");
      if (!displayName || displayName.length > 64) problems.push("display name is missing or longer than 64");
      if (givenName.length > 40 || surname.length > 40) problems.push("given name / surname longer than 40");
      if (!identity) problems.push("身份 (role) is required"); else if (!IDENTITIES.includes(identity)) problems.push("identity must be one of " + IDENTITIES.join(" / "));
      if (!city) problems.push("city is required"); else if (city.length > 40) problems.push("city longer than 40");
      if (!postalCode) problems.push("postal code is required"); else if (!/^[A-Za-z0-9 -]{3,12}$/.test(postalCode)) problems.push("postal code: 3–12 letters or digits");
      if (jobTitle.length > 60) problems.push("job title longer than 60");
      if (plan !== "faculty" && plan !== "student") problems.push("licence must be faculty or student");
      // (the licence ↔ 身份 rule was withdrawn 2026-10-21: faculty seats are short, parents take the students plan)
      if (!/^[A-Z]{2}$/.test(usageLocation)) problems.push("usage location must be a two-letter country code");
      if (problems.length) return fail(context, 400, "please check the form", { problems });
      const lic = await licencePlans();
      const main = lic[plan];
      if (!main) return fail(context, 409, `the tenant has no ${plan === "student" ? "Office 365 A1 for students" : "Office 365 A1 for faculty"} plan`, { code: "no_plan" });
      if (!main.free) return fail(context, 409, `${main.name}: no free seats left`, { code: "no_seats" });
      const skuIds = [main.skuId].concat(lic.extras.filter((x) => x.free).map((x) => x.skuId));
      const upn = `${nick}@${domain}`;
      // Taken already? (Graph would answer 400 too, but this is a clearer message.)
      try { await graph("GET", `/users/${encodeURIComponent(upn)}?$select=id`); return fail(context, 409, `${upn} already exists`, { code: "exists" }); } catch (err) { if (err.status !== 404) throw err; }
      const password = temporaryPassword();
      const body = {
        accountEnabled: true, displayName, mailNickname: nick, userPrincipalName: upn, usageLocation, city, postalCode,
        passwordProfile: { password, forceChangePasswordNextSignIn: true },
        passwordPolicies: "DisablePasswordExpiration",
      };
      if (givenName) body.givenName = givenName;
      if (surname) body.surname = surname;
      if (jobTitle) body.jobTitle = jobTitle;
      // No department: the school's name is never written to the account (Rick, 2026-10-10).
      let created;
      try {
        created = await graph("POST", "/users", body);
      } catch (err) {
        await audit(context, { actor, action: "user.create", target: upn, result: "failed", error: err.code || err.status });
        if (err.status === 400 || err.status === 403) return fail(context, err.status, "Microsoft refused to create the account: " + (err.message.split(": ").slice(1).join(": ") || err.code), { code: err.code });
        throw err;
      }
      // The chosen A1 plan plus every always-on extra (Power Automate Free), in one call.
      // A just-created account can take a few seconds to replicate: a 404 / 400 from assignLicense right after
      // POST /users is retried (3 × 2 s) before it counts as a failure. The failure carries Microsoft's own words
      // so the page can say why (no seats left, no usage location, …), not just a code (Rick, 2026-10-20).
      let licence;
      for (let attempt = 0; ; attempt++) {
        try {
          await graph("POST", `/users/${created.id}/assignLicense`, { addLicenses: skuIds.map((id) => ({ skuId: id, disabledPlans: [] })), removeLicenses: [] });
          licence = { ok: true, plans: [main.name].concat(lic.extras.filter((x) => x.free).map((x) => x.name)) };
          break;
        } catch (err) {
          if (attempt < 3 && (err.status === 404 || err.status === 400 || err.status === 503)) { await new Promise((r) => setTimeout(r, 2000)); continue; }
          licence = { ok: false, plans: [main.name], error: (err.message && err.message.split(": ").slice(1).join(": ")) || err.code || String(err.status), code: err.code || err.status };
          await audit(context, { actor, action: "license.assign", target: upn, skuIds, result: "failed", error: err.code || err.status, message: String(err.message || "").slice(0, 300) });
          break;
        }
      }
      // Hive's own record (身份) and the directory cache.
      try { await people.updatePeople((d) => { d.people[upn] = Object.assign({}, d.people[upn] || {}, { identity, updated: new Date().toISOString(), by: actor }); }); } catch { /* best effort */ }
      try { await dir.addUser(domain, Object.assign({ createdDateTime: new Date().toISOString(), accountEnabled: true, userType: "Member" }, created, body)); } catch { /* the next sync adds it */ }
      await audit(context, { actor, action: "user.create", target: upn, displayName, identity, plan, city, result: "ok" });
      context.res = { status: 200, headers: { "Cache-Control": "no-store" }, body: { ok: true, user: upn, id: created.id, displayName, password, mustChange: true, licence, license: licence } };
      return;
    }

    // 修改资料 (Rick, 2026-10-12: 「允许 domain admin 编辑用户信息……存回 MS tenant」):
    // the IT 管理员 (or the system administrator) changes an account's details in
    // Microsoft 365 — the fields of 新建账号 plus the safe email. Never the account
    // name, never the department (the school's name stays off the accounts,
    // 2026-10-10), never a phone number. A field left out is left alone; an optional
    // one sent empty is cleared. Microsoft refuses changes to its administrator
    // accounts: that 403 is passed on with a plain explanation.
    if (method === "PATCH" && action === "user") {
      if (!can(roles, "methods", domain)) return fail(context, 403, "account details are changed by the IT 管理员", { code: "forbidden" });
      const b = req.body || {};
      const upn = String(b.user || "").trim().toLowerCase();
      if (domainOf(upn) !== domain) return fail(context, 400, "user must be an account of this domain");
      const has = (k) => b[k] !== undefined && b[k] !== null;
      const str = (k) => String(b[k]).trim();
      const patch = {}, problems = [];
      if (has("givenName")) { const v = str("givenName"); if (v.length > 40) problems.push("given name longer than 40"); else patch.givenName = v || null; }
      if (has("surname")) { const v = str("surname"); if (v.length > 40) problems.push("surname longer than 40"); else patch.surname = v || null; }
      if (has("displayName")) { const v = str("displayName"); if (!v || v.length > 64) problems.push("display name is missing or longer than 64"); else patch.displayName = v; }
      if (has("jobTitle")) { const v = str("jobTitle"); if (v.length > 60) problems.push("job title longer than 60"); else patch.jobTitle = v || null; }
      if (has("city")) { const v = str("city"); if (!v) problems.push("city is required"); else if (v.length > 40) problems.push("city longer than 40"); else patch.city = v; }
      if (has("postalCode")) { const v = str("postalCode"); if (!v) problems.push("postal code is required"); else if (!/^[A-Za-z0-9 -]{3,12}$/.test(v)) problems.push("postal code: 3–12 letters or digits"); else patch.postalCode = v; }
      if (has("usageLocation")) { const v = str("usageLocation").toUpperCase(); if (!/^[A-Z]{2}$/.test(v)) problems.push("usage location must be a two-letter country code"); else patch.usageLocation = v; }
      if (has("safeEmail")) { const v = str("safeEmail").toLowerCase(); const why = safeEmailProblem(v, upn); if (why) problems.push(why); else patch.otherMails = v ? [v] : []; }
      if (problems.length) return fail(context, 400, "please check the form", { problems });
      if (!Object.keys(patch).length) return fail(context, 400, "nothing to change");
      let target;
      try { target = await graph("GET", `/users/${encodeURIComponent(upn)}?$select=id,userType`); } catch (err) { if (err.status === 404) return fail(context, 404, `${upn} does not exist`, { code: "not_found" }); throw err; }
      if (target.userType === "Guest") return fail(context, 400, "guest accounts are not edited here");
      try {
        await graph("PATCH", `/users/${target.id}`, patch);
      } catch (err) {
        await audit(context, { actor, action: "user.update", target: upn, fields: Object.keys(patch), result: "failed", error: err.code || err.status });
        if (err.status === 403) return fail(context, 403, "Microsoft refused: this is a Microsoft 365 administrator account, which only Entra can change", { code: "privileged" });
        if (err.status === 400) return fail(context, 400, "Microsoft refused the change: " + (err.message.split(": ").slice(1).join(": ") || err.code), { code: err.code });
        throw err;
      }
      await audit(context, { actor, action: "user.update", target: upn, fields: Object.keys(patch), result: "ok" });
      try { await dir.refreshUser(domain, upn); } catch { /* the next sync catches up */ }
      const view = (await usersView(domain)).users.find((u) => u.upn === upn) || null;
      context.res = { status: 200, headers: { "Cache-Control": "no-store" }, body: { ok: true, user: view, changed: Object.keys(patch).map((k) => (k === "otherMails" ? "safeEmail" : k)) } };
      return;
    }

    // 换许可证 (Rick, 2026-10-12): Office 365 A1 for students ↔ A1 for faculty, in one
    // assignLicense call (the new plan added and the old A1 removed together, so the
    // account is never without one; mailbox and files stay). Any 身份 may hold either
    // plan (the rule tying the students plan to 学生 was withdrawn 2026-10-21). Needs a
    // free seat and a usage location. An account with no A1 yet simply gets the chosen one.
    if (method === "POST" && (action === "licence" || action === "license")) { // both spellings (the page posted "license" until 2026-10-21)
      if (!can(roles, "methods", domain)) return fail(context, 403, "licences are changed by the IT 管理员", { code: "forbidden" });
      const b = req.body || {};
      const upn = String(b.user || "").trim().toLowerCase();
      const plan = String(b.plan || "").trim().toLowerCase();
      if (domainOf(upn) !== domain) return fail(context, 400, "user must be an account of this domain");
      if (plan !== "faculty" && plan !== "student") return fail(context, 400, "plan must be faculty or student");
      let user;
      try { user = await graph("GET", `/users/${encodeURIComponent(upn)}?$select=id,userType,usageLocation,assignedLicenses`); } catch (err) { if (err.status === 404) return fail(context, 404, `${upn} does not exist`, { code: "not_found" }); throw err; }
      if (user.userType === "Guest") return fail(context, 400, "guest accounts are not licensed here");
      if (!user.usageLocation) return fail(context, 400, "the account has no usage location: set it in 修改资料 first", { code: "no_usage_location" });
      const lic = await licencePlans();
      const want = lic[plan];
      if (!want) return fail(context, 409, `the tenant has no ${plan === "student" ? "Office 365 A1 for students" : "Office 365 A1 for faculty"} plan`, { code: "no_plan" });
      const held = new Set((user.assignedLicenses || []).map((l) => String(l.skuId).toLowerCase()));
      if (held.has(String(want.skuId).toLowerCase())) return void (context.res = { status: 200, headers: { "Cache-Control": "no-store" }, body: { ok: true, unchanged: true, plan: want.name } });
      if (!want.free) return fail(context, 409, `${want.name}: no free seats left`, { code: "no_seats" });
      const remove = (lic.a1 || []).map((x) => x.skuId).filter((id) => id !== want.skuId && held.has(String(id).toLowerCase()));
      const add = [want].concat(lic.extras.filter((x) => x.free && !held.has(String(x.skuId).toLowerCase())));
      try {
        await graph("POST", `/users/${user.id}/assignLicense`, { addLicenses: add.map((x) => ({ skuId: x.skuId, disabledPlans: [] })), removeLicenses: remove });
      } catch (err) {
        await audit(context, { actor, action: "license.change", target: upn, plan, result: "failed", error: err.code || err.status });
        if (err.status === 400 || err.status === 403) return fail(context, err.status, "Microsoft refused the licence change: " + (err.message.split(": ").slice(1).join(": ") || err.code), { code: err.code });
        throw err;
      }
      await audit(context, { actor, action: "license.change", target: upn, plan, added: add.map((x) => x.skuId), removed: remove, result: "ok" });
      try { await dir.refreshUser(domain, upn); } catch { /* the next sync catches up */ }
      const view = (await usersView(domain)).users.find((u) => u.upn === upn) || null;
      context.res = { status: 200, headers: { "Cache-Control": "no-store" }, body: { ok: true, user: view, plan: want.name, removed: remove.length } };
      return;
    }

    // 删除账号 (Rick, 2026-10-05: 「Give domain admin right to delete ordinary users」):
    // a IT 管理员or the system administrator deletes an ordinary account of this
    // domain. Ordinary = holds no Hive role; not oneself; not a guest. Microsoft
    // soft-deletes (30 days in the deleted-users list of the Microsoft 365 admin
    // center, restorable there); Hive drops the cache row and its people.json record.
    if (method === "DELETE" && action === "user") {
      if (!can(roles, "methods", domain)) return fail(context, 403, "accounts are deleted by the IT 管理员", { code: "forbidden" });
      const b = req.body || {};
      const user = normUser(b.user);
      if (!EMAIL_RE.test(user) || domainOf(user) !== domain) return fail(context, 400, "user must be an account in this domain");
      if (user === actor) return fail(context, 400, "you cannot delete your own account", { code: "self" });
      const rolesDoc = await readRoles().catch(() => ({ entries: [] }));
      if ((rolesDoc.entries || []).some((e) => e.user === user && (e.roles || []).length)) return fail(context, 403, "this account holds a Hive role; remove its roles first (系统 › 角色分配)", { code: "has_roles" });
      const u = await graph("GET", `/users/${encodeURIComponent(user)}?$select=id,userPrincipalName,userType,displayName`);
      if (!u || !u.id) return fail(context, 404, "no such account");
      if (u.userType === "Guest") return fail(context, 400, "a guest account is not managed here");
      try {
        await graph("DELETE", `/users/${u.id}`);
      } catch (err) {
        await audit(context, { actor, action: "user.delete", target: user, result: "failed", error: err.code || err.status });
        if (err.status === 403) return fail(context, 403, "Microsoft refused to delete this account (an administrator account, or the app lacks the permission).", { code: err.code || "forbidden" });
        throw err;
      }
      try { await dir.removeUser(domain, user); } catch { /* the next sync drops it */ }
      try { await people.updatePeople((d) => { if (!d.people[user]) return false; delete d.people[user]; }); } catch { /* best effort */ }
      await audit(context, { actor, action: "user.delete", target: user, displayName: u.displayName || "", result: "ok" });
      context.res = { status: 200, headers: { "Cache-Control": "no-store" }, body: { ok: true, user, displayName: u.displayName || "", restorableDays: 30 } };
      return;
    }

    // 重置密码 (Rick, 2026-10-04): a IT 管理员or the system administrator gives an
    // ordinary user of this domain a random temporary password that must be changed
    // at the next sign-in. The password is returned once to the caller and never
    // stored or logged; the audit line records who reset whose password, not the
    // value. Needs the app permission User-PasswordProfile.ReadWrite.All and the
    // User Administrator (or Password Administrator) role on Hive's service
    // principal; Microsoft refuses administrator accounts (403), which is passed
    // on as a clear message. Hive's own session check notices the password
    // change and signs the person's old Hive sessions out within 30 minutes.
    if (method === "POST" && action === "password") {
      if (!can(roles, "methods", domain)) return fail(context, 403, "passwords are reset by the IT 管理员", { code: "forbidden" });
      const b = req.body || {};
      const user = normUser(b.user);
      if (!EMAIL_RE.test(user) || domainOf(user) !== domain) return fail(context, 400, "user must be an account in this domain");
      if (user === actor) return fail(context, 400, "use 登录与安全 › 修改密码 for your own password", { code: "self" });
      const u = await graph("GET", `/users/${encodeURIComponent(user)}?$select=id,userPrincipalName,userType,accountEnabled`);
      if (!u || !u.id) return fail(context, 404, "no such account");
      if (u.userType === "Guest") return fail(context, 400, "a guest account's password is not managed here");
      const password = temporaryPassword();
      try {
        await graph("PATCH", `/users/${u.id}`, { passwordProfile: { password, forceChangePasswordNextSignIn: true } });
      } catch (err) {
        await audit(context, { actor, action: "password.reset", target: user, result: "failed", error: err.code || err.status });
        if (err.status === 403) return fail(context, 403, "Microsoft refused to reset this account's password.", { code: err.code || "forbidden" });
        throw err;
      }
      await audit(context, { actor, action: "password.reset", target: user, result: "ok" });
      context.res = { status: 200, headers: { "Cache-Control": "no-store" }, body: { ok: true, user, password, mustChange: true } };
      return;
    }

    fail(context, 404, `unknown action: ${method} ${action}`);
  } catch (err) {
    context.log.error(`domain/${action} by ${actor}: ${(err && err.stack) || err}`);
    fail(context, err.status === 500 ? 500 : 502, String((err && err.message) || err), { code: err.code || "" });
  }
}

// Hive's session rules (idle timeout, maximum age, same-site check) wrap every call.
module.exports = async function (context, req) {
  const s = await guard(context, req);
  if (!s) return;
  await handler(context, req);
  finish(context, s);
};
module.exports._temporaryPassword = temporaryPassword;
