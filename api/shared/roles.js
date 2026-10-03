// Hive's own role assignments, kept beside the snapshot as roles.json.
//
// Who is who (Rick, 2026-10-02):
//   普通用户            no role — sees 我的账号 only.
//   域管理员（IT）       `domain_it:<domain>`   — the school's IT person: the accounts of
//                       that domain, their sign-in devices (and, in phase 2, password
//                       resets), its Teams groups.
//   域蜂巢管理员         `domain_hive:<domain>` — the school's Hive coordinator: the same
//                       accounts, plus 身份 / 关联账号 / 备注 and what people filled in.
//   Staff（蜂巢员工）    `staff:<function>`     — Hive's own people, across every school:
//                       课程开发 curriculum · 募款 fundraising · contractor · 教育社区经理
//                       community · 财务 finance · 销售 sales · 系统管理员 sysadmin.
//                       `staff:sysadmin` is the site administrator (角色分配, 数据同步,
//                       everything); `admin` is kept as its alias for the bootstrap
//                       account and old roles.json entries.
// Old names still honoured: `domain_admin:<d>` = both domain roles; `coordinator` =
// `staff:community`.
//
// Roles live here keyed by the signed-in account (the `userDetails` of the
// client principal, which the auth config sets to the UPN). They reach the
// client principal through the rolesSource function (api/auth-roles) at each
// sign-in, and are also re-read per request below, so a new role works at once.
//
// Shape of roles.json: { "entries": [ { "user": "someone@domain",
//   "roles": ["domain_it:school.edu"], "by": "admin@domain", "at": "2026-09-29T02:00:00.000Z" } ] }
const { BlobServiceClient } = require("@azure/storage-blob");
const { snapshotBlob } = require("./config");
const { getPrincipal, hasRole } = require("./auth");

const BLOB_NAME = "roles.json";

const DOMAIN = "[a-z0-9][a-z0-9.-]*\\.[a-z]{2,}";
const DOMAIN_IT_RE = new RegExp(`^domain_it:(${DOMAIN})$`);
const DOMAIN_HIVE_RE = new RegExp(`^domain_hive:(${DOMAIN})$`);
const DOMAIN_ADMIN_RE = new RegExp(`^domain_admin:(${DOMAIN})$`); // legacy: both
const STAFF_RE = /^staff:(curriculum|fundraising|contractor|community|finance|sales|sysadmin)$/;

const STAFF = {
  curriculum: { zh: "课程开发", en: "Curriculum development" },
  fundraising: { zh: "募款", en: "Fundraising" },
  contractor: { zh: "Contractor", en: "Contractor" },
  community: { zh: "教育社区经理", en: "Education community manager" },
  finance: { zh: "财务", en: "Finance" },
  sales: { zh: "销售", en: "Sales" },
  sysadmin: { zh: "系统管理员", en: "System administrator" },
};
// Role kinds for pickers and labels.
const KINDS = {
  domain_it: { zh: "域管理员（IT）", en: "Domain administrator (IT)" },
  domain_hive: { zh: "域蜂巢管理员", en: "Domain Hive administrator" },
  staff: { zh: "Staff", en: "Staff" },
};
// Kept for old callers; everything assignable is described by the regexes above.
const ASSIGNABLE = { admin: { zh: "系统管理员", en: "System administrator" } };

function isAssignable(role) {
  const r = String(role || "");
  return r === "admin" || DOMAIN_IT_RE.test(r) || DOMAIN_HIVE_RE.test(r) || STAFF_RE.test(r);
}

// Roles as a person sees them, for lists and pickers.
function roleLabel(role, lang) {
  const en = lang === "en";
  let m;
  if ((m = DOMAIN_IT_RE.exec(role))) return `${en ? KINDS.domain_it.en : KINDS.domain_it.zh} · ${m[1]}`;
  if ((m = DOMAIN_HIVE_RE.exec(role))) return `${en ? KINDS.domain_hive.en : KINDS.domain_hive.zh} · ${m[1]}`;
  if ((m = DOMAIN_ADMIN_RE.exec(role))) return `${en ? "Domain administrator (IT + Hive)" : "域管理员（IT＋蜂巢）"} · ${m[1]}`;
  if ((m = STAFF_RE.exec(role))) return `Staff · ${en ? STAFF[m[1]].en : STAFF[m[1]].zh}`;
  if (role === "admin") return en ? "System administrator" : "系统管理员";
  if (role === "coordinator") return en ? "Staff · Education community manager (old name)" : "Staff · 教育社区经理（旧名）";
  return role;
}

function isAdmin(roles) { return (roles || []).some((r) => r === "admin" || r === "staff:sysadmin"); }
function isStaff(roles) { return (roles || []).some((r) => r === "admin" || r === "coordinator" || STAFF_RE.test(r)); }

// Which domains an account may see: every domain for staff (`"*"`), the named
// ones for the two domain roles.
function managedDomains(roles) {
  if (isStaff(roles)) return ["*"];
  const out = new Set();
  for (const r of roles || []) {
    const m = DOMAIN_IT_RE.exec(r) || DOMAIN_HIVE_RE.exec(r) || DOMAIN_ADMIN_RE.exec(r);
    if (m) out.add(m[1]);
  }
  return Array.from(out);
}

// What an account may do with the accounts of `domain`:
//   view     — the user table, Teams groups, exports        (every role above)
//   methods  — remove a sign-in device (phase 2: reset password, TAP)
//                                                             (域管理员 IT, sysadmin)
//   people   — 身份 / 关联账号 / 备注                           (域蜂巢管理员, staff)
//   admin    — 角色分配, 数据同步, anything                    (sysadmin)
function can(roles, action, domain) {
  roles = roles || [];
  if (isAdmin(roles)) return true;
  if (action === "admin") return false;
  const d = String(domain || "").toLowerCase();
  const holds = (re) => roles.some((r) => { const m = re.exec(r); return m && m[1] === d; });
  const it = holds(DOMAIN_IT_RE) || holds(DOMAIN_ADMIN_RE);
  const hive = holds(DOMAIN_HIVE_RE) || holds(DOMAIN_ADMIN_RE);
  const staff = isStaff(roles);
  if (action === "view") return it || hive || staff;
  if (action === "methods") return it;
  if (action === "people") return hive || staff;
  return false;
}

// Accounts that are always `admin`, whatever roles.json says. Since the site
// signs in through its own Entra app (2026-09-29), roles come from the
// rolesSource function (api/auth-roles) rather than from portal invitations,
// and an empty or unreadable roles.json must not lock the administrator out
// of the Admin Center that edits it. HIVE_ADMINS (comma-separated) replaces
// the default when set.
const BOOTSTRAP_ADMINS = String(process.env.HIVE_ADMINS || "rick.zhang@bes.qiaoliang.online")
  .split(/[,;\s]+/).map((u) => u.trim().toLowerCase()).filter(Boolean);

function blobClient() {
  const conn = process.env.STORAGE_CONNECTION_STRING;
  if (!conn) throw new Error("STORAGE_CONNECTION_STRING app setting is not configured");
  const container = BlobServiceClient.fromConnectionString(conn).getContainerClient(snapshotBlob.container);
  return { container, blob: container.getBlockBlobClient(BLOB_NAME) };
}

function normUser(u) {
  return String(u || "").trim().toLowerCase();
}

async function readRoles() {
  const { blob } = blobClient();
  if (!(await blob.exists())) return { entries: [] };
  try {
    const buf = await blob.downloadToBuffer();
    const parsed = JSON.parse(buf.toString("utf8"));
    const entries = Array.isArray(parsed && parsed.entries) ? parsed.entries : [];
    return {
      entries: entries
        .map((e) => ({
          user: normUser(e.user),
          roles: Array.isArray(e.roles) ? e.roles.filter(isAssignable) : [],
          by: e.by || "",
          at: e.at || "",
        }))
        .filter((e) => e.user && e.roles.length),
    };
  } catch {
    return { entries: [] };
  }
}

async function writeRoles(doc) {
  const { container, blob } = blobClient();
  await container.createIfNotExists();
  const body = JSON.stringify({ entries: doc.entries || [] }, null, 2);
  await blob.upload(body, Buffer.byteLength(body), {
    blobHTTPHeaders: { blobContentType: "application/json; charset=utf-8" },
  });
}

// Entra's own administrator roles count too (Rick, 2026-10-03: an account
// with User Administrator signed in as 普通用户). Someone the tenant trusts to
// manage accounts and sign-in methods is a 域管理员（IT）of their own domain in
// Hive, and a Global Administrator — who controls the app registration anyway
// — is the system administrator. Role template ids are fixed across tenants.
// Assignments are read from role management (any scope, so an assignment
// limited to an administrative unit counts as well); Directory.Read.All
// covers it. Graph trouble just leaves these out — a sign-in never fails on it.
const ENTRA_IT_ROLES = {
  "fe930be7-5e62-47db-91af-98c3a49a38b1": "User Administrator",
  "c4e39bd9-1100-46d3-8c65-fb160da0071f": "Authentication Administrator",
  "7be44c8a-adaf-4e2a-84d6-ab2649e08a13": "Privileged Authentication Administrator",
  "729827e3-9c14-49f7-bb1b-9608f156bbb8": "Helpdesk Administrator",
  "966707d0-3269-4727-9be2-8c3a10f19b9d": "Password Administrator",
};
const ENTRA_SYSADMIN_ROLES = { "62e90394-69f5-4237-9190-012177145e10": "Global Administrator" };
const ENTRA_TTL_MS = Number(process.env.HIVE_ENTRA_ROLES_MINUTES || 30) * 60 * 1000;
const entraCache = new Map(); // upn → { at, roles }
async function entraRolesFor(u) {
  const domain = (u.split("@")[1] || "").toLowerCase();
  if (!domain) return [];
  const { graph, q } = require("./graph");
  const who = await graph("GET", `/users/${encodeURIComponent(u)}?$select=id`);
  if (!who || !who.id) return [];
  // Role management lists every assignment, scoped ones included. If the tenant
  // refuses that read, fall back to directory-role membership (tenant-wide
  // assignments only), which Directory.Read.All always allows.
  let assignments;
  try {
    const page = await graph("GET", `/roleManagement/directory/roleAssignments?$filter=principalId eq '${q(who.id)}'&$select=roleDefinitionId,directoryScopeId`);
    assignments = ((page && page.value) || []).map((a) => ({ id: String(a.roleDefinitionId || "").toLowerCase(), scope: a.directoryScopeId || "/" }));
  } catch (err) {
    const page = await graph("GET", `/users/${encodeURIComponent(who.id)}/memberOf/microsoft.graph.directoryRole?$select=roleTemplateId`);
    assignments = ((page && page.value) || []).map((r) => ({ id: String(r.roleTemplateId || "").toLowerCase(), scope: "/" }));
  }
  const out = new Set();
  for (const a of assignments) {
    if (ENTRA_SYSADMIN_ROLES[a.id] && a.scope === "/") out.add("staff:sysadmin");
    else if (ENTRA_IT_ROLES[a.id] || ENTRA_SYSADMIN_ROLES[a.id]) out.add(`domain_it:${domain}`);
  }
  return Array.from(out);
}
// The same, remembered for ENTRA_TTL_MS per account, so every request can carry
// Entra's roles without a Graph call each time. A failure is not remembered.
async function entraRolesCached(u) {
  const hit = entraCache.get(u);
  if (hit && Date.now() - hit.at < ENTRA_TTL_MS) return hit.roles;
  const roles = await entraRolesFor(u);
  entraCache.set(u, { at: Date.now(), roles });
  return roles;
}

// Hive's roles for one account (lowercased UPN): bootstrap admin + roles.json
// (+ Entra's administrator roles when `withEntra`, used at sign-in). Storage or
// Graph trouble returns what can be known without it rather than throwing.
async function rolesFor(user, withEntra) {
  const u = normUser(user);
  const roles = new Set();
  if (!u) return [];
  if (BOOTSTRAP_ADMINS.includes(u)) roles.add("admin");
  try {
    const doc = await readRoles();
    const entry = doc.entries.find((e) => e.user === u);
    if (entry) entry.roles.forEach((r) => roles.add(r));
  } catch { /* bootstrap roles only */ }
  if (withEntra) {
    try { (await (withEntra === "fresh" ? entraRolesFor(u) : entraRolesCached(u))).forEach((r) => roles.add(r)); } catch { /* Hive's own roles only */ }
  }
  // The route rules in staticwebapp.config.json know only `admin`; the system
  // administrator carries both names.
  if (roles.has("staff:sysadmin")) roles.add("admin");
  return Array.from(roles);
}

// Every role the signed-in account holds: those stamped at sign-in plus
// Hive's current ones (so a role assigned a minute ago works without a new
// sign-in — except for route rules, which only see the sign-in roles).
async function userRoles(req) {
  const p = getPrincipal(req);
  if (!p) return { user: "", roles: [] };
  const user = normUser(p.userDetails);
  const roles = new Set((p.userRoles || []).filter((r) => r !== "anonymous" && r !== "authenticated"));
  if (user) (await rolesFor(user, true)).forEach((r) => roles.add(r)); // Hive's + Entra's (cached)
  return { user, roles: Array.from(roles) };
}

// True when the account holds `role`, or is an admin.
async function userHasRole(req, role) {
  if (hasRole(req, "admin")) return true;
  const { roles } = await userRoles(req);
  return roles.includes(role) || isAdmin(roles);
}

module.exports = { ASSIGNABLE, STAFF, KINDS, DOMAIN_IT_RE, DOMAIN_HIVE_RE, DOMAIN_ADMIN_RE, STAFF_RE, BOOTSTRAP_ADMINS, isAssignable, roleLabel, managedDomains, can, isAdmin, isStaff, readRoles, writeRoles, rolesFor, entraRolesFor, entraRolesCached, _entraCache: entraCache, userRoles, userHasRole, normUser };
