// /api/domain/{action} — 本域管理 / 机构管理: what a domain administrator or
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
//                                         A 域管理员（IT）'s sync is scoped to their own domain (other schools'
//                                         caches and the tenant delta token are left alone); sysadmin = tenant-wide.
//   PATCH  domain/person                  {user, identity?, linked?, note?} → people.json       (域蜂巢管理员, staff)
//   PUT    domain/institution             {domain, name, nameEn} → institutions.json (the school's display names) (sysadmin)
//   DELETE domain/method                  {user, id} → remove one Authenticator / FIDO2 method    (域管理员 IT, sysadmin)
//   POST   domain/password                {user} → temporary password, must change at next sign-in (域管理员 IT, sysadmin)
//   GET    domain/licenses?domain=x       {faculty, student, extras[]} — the A1 plans and the always-on extras, with free seats
//   POST   domain/user                    {domain, account, givenName, surname, displayName?, identity, city, postalCode, jobTitle?, plan, usageLocation?}
//                                         → create the account (temporary password returned once)         (域管理员 IT, sysadmin)
//   DELETE domain/user                    {domain, user} → delete an ordinary account (soft delete, 30 days)   (域管理员 IT, sysadmin)
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
const people = require("../shared/people");
const { guard, finish } = require("../shared/session");
const dir = require("../shared/directory");

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
  return { faculty: find(A1.faculty), student: find(A1.student), extras: ALWAYS_ON.map((pn) => find([pn])).filter(Boolean) };
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

async function usersView(domain) {
  const [doc, peopleDoc, rolesDoc] = await Promise.all([dir.readDomain(domain), readPeople(), readRoles().catch(() => ({ entries: [] }))]);
  const people = peopleDoc.people;
  const rolesOf = {};
  for (const e of rolesDoc.entries || []) rolesOf[e.user] = (e.roles || []).map((x) => ({ role: x, zh: roleLabel(x, "zh"), en: roleLabel(x, "en") }));
  const users = doc.users.map((r) => {
    const rec = people[r.upn] || null;
    const entra = { department: r.department, jobTitle: r.jobTitle };
    return Object.assign({}, r, {
      roles: rolesOf[r.upn] || [],
      groups: (r.groups || []).map((g) => ({ id: g.id, name: g.name, kind: g.kind })),
      identity: identityOf(rec, entra),
      identitySource: rec && IDENTITIES.includes(rec.identity) ? "hive" : (identityOf(null, entra) ? "entra" : ""),
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
        can: { methods: can(roles, "methods", d.domain), people: can(roles, "people", d.domain), full: isAdmin, institutions: isAdmin },
      }));
      context.res = { status: 200, body: { user: actor, roles, all, domains, mine: domainOf(actor), showDomains: isAdmin } };
      return;
    }

    if (!DOMAIN_RE.test(domain)) return fail(context, 400, "domain missing or malformed");
    if (!may(domain)) return fail(context, 403, `you do not manage ${domain}`, { allowed: all ? ["*"] : allowed });

    if (method === "GET" && action === "users") {
      const { doc, users } = await usersView(domain);
      context.res = { status: 200, body: Object.assign({ domain, users, partial: users.some((u) => u.partial) }, { sync: dir.status(doc) }) };
      return;
    }
    if (method === "GET" && action === "groups") {
      const doc = await dir.readDomain(domain);
      context.res = { status: 200, body: { domain, groups: dir.groupsOf(doc.users), sync: dir.status(doc) } };
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
        // learns its share, the delta token advances); a 域管理员（IT）'s sync touches
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
      const doc = await readInstitutions();
      if (name || nameEn) doc.institutions[domain] = { name, nameEn, by: actor, at: new Date().toISOString() };
      else delete doc.institutions[domain];
      await writeInstitutions(doc);
      await audit(context, { actor, action: "institution.update", target: domain, name, nameEn, result: "ok" });
      context.res = { status: 200, body: { ok: true, domain, name, nameEn } };
      return;
    }

    if (method === "PATCH" && action === "person") {
      if (!can(roles, "people", domain)) return fail(context, 403, "身份 and linked accounts are edited by the 域蜂巢管理员 or Hive staff", { code: "forbidden" });
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
      const doc = await readPeople();
      const cur = doc.people[user] || {};
      doc.people[user] = Object.assign({}, cur, patch, { by: actor, at: new Date().toISOString() });
      if (!doc.people[user].identity && !(doc.people[user].linked || []).length && !doc.people[user].note && !doc.people[user].extra) delete doc.people[user];
      await writePeople(doc);
      await audit(context, { actor, action: "person.update", target: user, fields: Object.keys(patch), result: "ok" });
      context.res = { status: 200, body: { ok: true, user, record: doc.people[user] || null } };
      return;
    }

    if (method === "DELETE" && action === "method") {
      if (!can(roles, "methods", domain)) return fail(context, 403, "sign-in devices are managed by the 域管理员（IT）", { code: "forbidden" });
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
    // Both need can(roles, "methods", domain): a 域管理员（IT）for their school, or the
    // system administrator. Graph: User.ReadWrite.All (create, assignLicense),
    // Directory.Read.All (subscribedSkus). No directory role is needed to create
    // an ordinary account; Microsoft will not let this create an administrator.
    if (method === "GET" && action === "licenses") {
      if (!can(roles, "methods", domain)) return fail(context, 403, "accounts are created by the 域管理员（IT）", { code: "forbidden" });
      const lic = await licencePlans();
      context.res = { status: 200, headers: { "Cache-Control": "no-store" }, body: Object.assign({ usageLocation: process.env.HIVE_USAGE_LOCATION || "CN" }, lic) };
      return;
    }
    if (method === "POST" && action === "user") {
      if (!can(roles, "methods", domain)) return fail(context, 403, "accounts are created by the 域管理员（IT）", { code: "forbidden" });
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
      if (plan === "student" && identity !== "学生") problems.push("Office 365 A1 for students is for 学生 only");
      if (plan === "faculty" && identity === "学生") problems.push("a 学生 gets Office 365 A1 for students");
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
      const inst = await people.readInstitutions();
      const instName = inst.institutions && inst.institutions[domain] && (inst.institutions[domain].name || inst.institutions[domain].nameEn);
      if (instName) body.department = instName;
      let created;
      try {
        created = await graph("POST", "/users", body);
      } catch (err) {
        await audit(context, { actor, action: "user.create", target: upn, result: "failed", error: err.code || err.status });
        if (err.status === 400 || err.status === 403) return fail(context, err.status, "Microsoft refused to create the account: " + (err.message.split(": ").slice(1).join(": ") || err.code), { code: err.code });
        throw err;
      }
      // The chosen A1 plan plus every always-on extra (Power Automate Free), in one call.
      let licence;
      try {
        await graph("POST", `/users/${created.id}/assignLicense`, { addLicenses: skuIds.map((id) => ({ skuId: id, disabledPlans: [] })), removeLicenses: [] });
        licence = { ok: true, plans: [main.name].concat(lic.extras.filter((x) => x.free).map((x) => x.name)) };
      } catch (err) {
        licence = { ok: false, plans: [main.name], error: err.code || String(err.status) };
        await audit(context, { actor, action: "license.assign", target: upn, skuIds, result: "failed", error: err.code || err.status });
      }
      // Hive's own record (身份) and the directory cache.
      try { const doc = await people.readPeople(); doc.people[upn] = Object.assign({}, doc.people[upn] || {}, { identity, updated: new Date().toISOString(), by: actor }); await people.writePeople(doc); } catch { /* best effort */ }
      try { await dir.addUser(domain, Object.assign({ createdDateTime: new Date().toISOString(), accountEnabled: true, userType: "Member" }, created, body)); } catch { /* the next sync adds it */ }
      await audit(context, { actor, action: "user.create", target: upn, displayName, identity, plan, city, result: "ok" });
      context.res = { status: 200, headers: { "Cache-Control": "no-store" }, body: { ok: true, user: upn, id: created.id, displayName, password, mustChange: true, licence } };
      return;
    }

    // 删除账号 (Rick, 2026-10-05: 「Give domain admin right to delete ordinary users」):
    // a 域管理员（IT）or the system administrator deletes an ordinary account of this
    // domain. Ordinary = holds no Hive role; not oneself; not a guest. Microsoft
    // soft-deletes (30 days in the deleted-users list of the Microsoft 365 admin
    // center, restorable there); Hive drops the cache row and its people.json record.
    if (method === "DELETE" && action === "user") {
      if (!can(roles, "methods", domain)) return fail(context, 403, "accounts are deleted by the 域管理员（IT）", { code: "forbidden" });
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
      try { const doc = await readPeople(); if (doc.people[user]) { delete doc.people[user]; await writePeople(doc); } } catch { /* best effort */ }
      await audit(context, { actor, action: "user.delete", target: user, displayName: u.displayName || "", result: "ok" });
      context.res = { status: 200, headers: { "Cache-Control": "no-store" }, body: { ok: true, user, displayName: u.displayName || "", restorableDays: 30 } };
      return;
    }

    // 重置密码 (Rick, 2026-10-04): a 域管理员（IT）or the system administrator gives an
    // ordinary user of this domain a random temporary password that must be changed
    // at the next sign-in. The password is returned once to the caller and never
    // stored or logged; the audit line records who reset whose password, not the
    // value. Needs the app permission User-PasswordProfile.ReadWrite.All and the
    // User Administrator (or Password Administrator) role on Hive's service
    // principal; Microsoft refuses administrator accounts (403), which is passed
    // on as a clear message. Hive's own session check notices the password
    // change and signs the person's old Hive sessions out within 30 minutes.
    if (method === "POST" && action === "password") {
      if (!can(roles, "methods", domain)) return fail(context, 403, "passwords are reset by the 域管理员（IT）", { code: "forbidden" });
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
