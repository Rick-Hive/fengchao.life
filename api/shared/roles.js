// Hive's own role assignments, kept beside the snapshot as roles.json.
//
// Who is who (Rick, 2026-10-02):
//   普通用户            no role — sees 我的账号 only.
//   IT 管理员            `domain_it:<domain>`   — the school's administrator in Hive (one
//                       role since 2026-10-12; Rick: 「合并……叫 IT 管理员」, not 学校管理员,
//                       which reads as the principal): the domain's accounts — create,
//                       edit, licence, password, sign-in devices, delete — its Teams
//                       groups, and 身份 / 关联账号 / 备注.
//   蜂巢课程负责人        `provider:<hiveKey>`   — Hive Course Leader (v3, Rick 2026-10-21): runs a course
//                       provider's side of Hive — its orders, courses and teachers (api/shared/provider.js).
//                       Explicit, for providers without a tenant domain; a school's 教育领袖 holds it for the
//                       school's own hive by inference. System administrator only.
//   教育领袖              `domain_leader:<domain>` — the school's education leader (Rick,
//                       2026-10-08/12): sets the school's graduation credit requirements
//                       and curriculum map (课程方案), which the school's families then see
//                       on the website. Nothing else: no accounts, no 身份.
//   (deleted) 域蜂巢管理员 `domain_hive:<domain>` — removed 2026-10-12 (Rick: 「这个角色与
//                       相关功能可以删除」). Not assignable, grants nothing; roles.json
//                       entries drop it when read (normalizeRoles), and a sign-in that
//                       still carries it is ignored by can() / managedDomains().
//   Staff（蜂巢员工）    `staff:<function>`     — Hive's own people, across every school.
//                       The six CRM functions (design doc, Rick 2026-10-06): CEO `ceo` ·
//                       课程总监 `curriculum` · 教育社区经理 `community` · 财务总监 `finance` ·
//                       订单经理 `sales` (the old name of the role is kept as its key) ·
//                       合作发展总监 `partnership`; 教育顾问 `consultant` (Rick 2026-10-06); plus
//                       系统管理员 `sysadmin`. `staff:contractor` was removed 2026-10-13
//                       (Rick: 「请删除contractor角色以及相关的功能」): like domain_hive, it is
//                       no longer assignable, roles.json entries drop it when read, and a
//                       sign-in still carrying it is not staff and holds nothing.
//                       `staff:sysadmin` is the site administrator (角色分配, 数据同步,
//                       everything); `admin` is kept as its alias for the bootstrap
//                       account and old roles.json entries. What each function may see in
//                       the CRM is the matrix in ./crm.js.
// Old names still honoured: `domain_admin:<d>` = IT 管理员; `coordinator` =
// `staff:community`; `staff:fundraising` = `staff:partnership` (shown as the old name
// until the entry is re-saved).
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
const DOMAIN_ADMIN_RE = new RegExp(`^domain_admin:(${DOMAIN})$`); // legacy: both
const DOMAIN_LEADER_RE = new RegExp(`^domain_leader:(${DOMAIN})$`);
const PROVIDER_RE = /^provider:([A-Z0-9一-鿿]{1,12})$/; // = require("./provider").PROVIDER_RE (kept here: provider.js needs hive.js only)
const STAFF_RE = /^staff:(ceo|curriculum|fundraising|partnership|consultant|community|finance|sales|sysadmin)$/;

const STAFF = {
  ceo: { zh: "CEO", en: "CEO" },
  curriculum: { zh: "课程总监", en: "Curriculum director" },
  community: { zh: "教育社区经理", en: "Education community manager" },
  finance: { zh: "财务总监", en: "Finance director" },
  sales: { zh: "订单经理", en: "Order manager" },
  partnership: { zh: "合作发展总监", en: "Partnership director" },
  consultant: { zh: "教育顾问", en: "Education consultant" }, // Rick 2026-10-06
  sysadmin: { zh: "系统管理员", en: "System administrator" },
  // Old name of `partnership`; still assignable so nothing breaks, but the picker
  // offers the new one (listed last so pickers that iterate STAFF show it last).
  fundraising: { zh: "募款（旧名，= 合作发展总监）", en: "Fundraising (old name = Partnership director)", legacy: true },
};
// Role kinds for pickers and labels.
const KINDS = {
  domain_it: { zh: "IT 管理员", en: "IT administrator" },
  domain_leader: { zh: "教育领袖", en: "Education leader" },
  provider: { zh: "蜂巢课程负责人", en: "Hive Course Leader" },
  staff: { zh: "Staff", en: "Staff" },
};
// Kept for old callers; everything assignable is described by the regexes above.
const ASSIGNABLE = { admin: { zh: "系统管理员", en: "System administrator" } };

function isAssignable(role) {
  const r = String(role || "");
  return r === "admin" || DOMAIN_IT_RE.test(r) || DOMAIN_LEADER_RE.test(r) || PROVIDER_RE.test(r) || STAFF_RE.test(r);
}

// Roles as a person sees them, for lists and pickers.
function roleLabel(role, lang) {
  const en = lang === "en";
  let m;
  if ((m = DOMAIN_IT_RE.exec(role))) return `${en ? KINDS.domain_it.en : KINDS.domain_it.zh} · ${m[1]}`;
  if ((m = DOMAIN_ADMIN_RE.exec(role))) return `${en ? KINDS.domain_it.en : KINDS.domain_it.zh} · ${m[1]}`;
  if ((m = DOMAIN_LEADER_RE.exec(role))) return `${en ? KINDS.domain_leader.en : KINDS.domain_leader.zh} · ${m[1]}`;
  if ((m = PROVIDER_RE.exec(role))) return `${en ? KINDS.provider.en : KINDS.provider.zh} · ${m[1]}`;
  if ((m = STAFF_RE.exec(role))) return `Staff · ${en ? STAFF[m[1]].en : STAFF[m[1]].zh}`;
  if (role === "admin") return en ? "System administrator" : "系统管理员";
  if (role === "coordinator") return en ? "Staff · Education community manager (old name)" : "Staff · 教育社区经理（旧名）";
  return role;
}

function isAdmin(roles) { return (roles || []).some((r) => r === "admin" || r === "staff:sysadmin"); }
// The functions an account holds, with old names mapped to the current ones.
function staffFunctions(roles) {
  const out = new Set();
  for (const r of roles || []) {
    if (r === "admin") out.add("sysadmin");
    else if (r === "coordinator") out.add("community");
    else { const m = STAFF_RE.exec(r); if (m) out.add(m[1] === "fundraising" ? "partnership" : m[1]); }
  }
  return Array.from(out);
}
// 角色分配 (decision 4, Rick 2026-10-06): the CEO may grant and withdraw the staff
// functions; domain roles and the system administrator stay with the system
// administrator alone. `roles` = the caller's roles, `role` = the one being changed.
function canAssign(roles, role) {
  if (isAdmin(roles)) return true;
  if (!staffFunctions(roles).includes("ceo")) return false;
  const m = STAFF_RE.exec(String(role || ""));
  return !!m && m[1] !== "sysadmin";
}
function isStaff(roles) { return (roles || []).some((r) => r === "admin" || r === "coordinator" || STAFF_RE.test(r)); }

// Which domains an account may see: every domain for staff (`"*"`), the named
// ones for the two domain roles.
function managedDomains(roles) {
  if (isStaff(roles)) return ["*"];
  const out = new Set();
  for (const r of roles || []) {
    const m = DOMAIN_IT_RE.exec(r) || DOMAIN_ADMIN_RE.exec(r) || DOMAIN_LEADER_RE.exec(r);
    if (m) out.add(m[1]);
  }
  return Array.from(out);
}

// What an account may do with the accounts of `domain`:
//   view     — the user table, Teams groups, exports        (every role above)
//   methods  — the Microsoft account itself: create, edit, licence, password,
//              sign-in devices, delete                          (IT 管理员, sysadmin)
//   people   — 身份 / 关联账号 / 备注                (IT 管理员, staff)
//   plan     — the school's 课程方案 (graduation credits, curriculum map)
//                                                   (教育领袖, 课程总监, sysadmin)
//   calendar — see the school's 校历 and the Hive events aimed at it
//                                                   (教育领袖, 教育社区经理, 课程总监, sysadmin). Not the
//                                                   IT 管理员 (Rick, 2026-10-16: the 教育领袖 publishes directly).
//   calendarEdit — change, publish and withdraw the school's 校历: its 教育领袖, and (Rick,
//              2026-10-16) the 教育社区经理 and 课程总监, who work across schools. The system
//              administrator may not overwrite a school's calendar; what it adds goes into the
//              separate Hive layer (api/shared/calendar.js), which only the system administrator edits.
//   hive     — the Hive layer (系统广播): events for chosen schools, roles, teams and named people of
//              any school                            (sysadmin, 教育社区经理, 课程总监)
//   optout   — the 不接收广播的名单 (accounts that do not receive 系统广播): sysadmin, 教育社区经理, 课程总监
//              (any school); a school's 教育领袖 (that school's accounts). It is a tab of the calendar page, which the
//              IT 管理员 has no part in (Rick, 2026-10-18).
//   admin    — 角色分配, 数据同步, anything                    (sysadmin)
// Staff functions that work across schools and may edit any school's 校历 (Rick, 2026-10-16).
const CALENDAR_STAFF = ["community", "curriculum"];
function can(roles, action, domain) {
  roles = roles || [];
  if (action === "calendarEdit") {
    const dd = String(domain || "").toLowerCase();
    return roles.some((r) => { const m = DOMAIN_LEADER_RE.exec(r); return !!m && m[1] === dd; }) || staffFunctions(roles).some((f) => CALENDAR_STAFF.includes(f));
  }
  // hive — the cross-school layer (系统广播): the system administrator and, like the school calendars, the
  // 教育社区经理 and 课程总监 (Rick, 2026-10-17: they may also send to chosen schools, roles, teams and people).
  if (action === "hive") return isAdmin(roles) || staffFunctions(roles).some((f) => CALENDAR_STAFF.includes(f));
  // optout — the 不接收广播的名单 (accounts that do not receive 系统广播): the same staff for every school, and a
  // school's 教育领袖 for that school's accounts (Rick, 2026-10-17; the IT 管理员 was dropped 2026-10-18 when the list
  // moved onto the calendar page).
  if (action === "optout" && staffFunctions(roles).some((f) => CALENDAR_STAFF.includes(f))) return true;
  if (isAdmin(roles)) return true;
  if (action === "admin") return false;
  const d = String(domain || "").toLowerCase();
  const holds = (re) => roles.some((r) => { const m = re.exec(r); return m && m[1] === d; });
  const it = holds(DOMAIN_IT_RE) || holds(DOMAIN_ADMIN_RE);
  const staff = isStaff(roles);
  if (action === "plan") return holds(DOMAIN_LEADER_RE) || staffFunctions(roles).includes("curriculum");
  if (action === "calendar") return holds(DOMAIN_LEADER_RE) || staffFunctions(roles).some((f) => CALENDAR_STAFF.includes(f));
  if (action === "optout") return holds(DOMAIN_LEADER_RE);
  if (action === "view") return it || staff;
  if (action === "methods") return it;
  if (action === "people") return it || staff;
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
// A role as stored: lower-case, except the hive key of 蜂巢课程负责人, which is hive.hiveKey() — upper-case
// (Rick 2026-10-21: assigning provider:SHINE failed as "unknown role: provider:shine").
function normRole(r) {
  const s = String(r || "").trim();
  const m = /^provider:(.+)$/i.exec(s);
  return m ? "provider:" + m[1].toUpperCase() : s.toLowerCase();
}

function normalizeRoles(parsed) {
  const entries = Array.isArray(parsed && parsed.entries) ? parsed.entries : [];
  return {
    entries: entries
      .map((e) => ({
        user: normUser(e.user),
        roles: Array.isArray(e.roles) ? e.roles.map(normRole).filter(isAssignable) : [],
        by: e.by || "",
        at: e.at || "",
      }))
      .filter((e) => e.user && e.roles.length),
  };
}
async function readRoles() {
  const { blob } = blobClient();
  if (!(await blob.exists())) return { entries: [] };
  try {
    const buf = await blob.downloadToBuffer();
    return normalizeRoles(JSON.parse(buf.toString("utf8")));
  } catch {
    return { entries: [] };
  }
}
// Change roles.json under its ETag (jsonstore.js): mutate(doc) sees the normalized
// document and edits doc.entries in place; the write is retried when another
// assignment landed meanwhile — two administrators saving at once keep both changes.
async function updateRoles(mutate) {
  const store = require("./jsonstore");
  return store.update(BLOB_NAME, { entries: [] }, (raw) => {
    const doc = normalizeRoles(raw);
    const r = mutate(doc);
    raw.entries = doc.entries;
    return r;
  });
}

async function writeRoles(doc) {
  const { container, blob } = blobClient();
  await container.createIfNotExists();
  const body = JSON.stringify({ entries: doc.entries || [] }, null, 2);
  await blob.upload(body, Buffer.byteLength(body), {
    blobHTTPHeaders: { blobContentType: "application/json; charset=utf-8" },
  });
}

// Hive's roles for one account (lowercased UPN): bootstrap admin + roles.json.
// Roles come from here alone (Rick, 2026-10-04: Entra administrator roles are
// being withdrawn from people; 角色分配 in the Management Center is the one
// source). Storage trouble returns what can be known without it.
async function rolesFor(user) {
  const u = normUser(user);
  const roles = new Set();
  if (!u) return [];
  if (BOOTSTRAP_ADMINS.includes(u)) roles.add("admin");
  try {
    const doc = await readRoles();
    const entry = doc.entries.find((e) => e.user === u);
    if (entry) entry.roles.forEach((r) => roles.add(r));
  } catch { /* bootstrap roles only */ }
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
  // A sign-in from before a role was deleted (domain_hive, staff:contractor) still
  // carries it in the principal; only roles that exist today (or their old names) count.
  const known = (r) => isAssignable(r) || DOMAIN_ADMIN_RE.test(r) || r === "coordinator";
  const roles = new Set((p.userRoles || []).map(normRole).filter((r) => r !== "anonymous" && r !== "authenticated" && known(r)));
  if (user) (await rolesFor(user)).forEach((r) => roles.add(r));
  return { user, roles: Array.from(roles) };
}

// A school's account — IT administrator or education leader — is not a family: it may look and select on the map but
// never orders for a family (Rick, 2026-10-20: 「管理员不能代下单」; a school buys in bulk instead, 团购, to come).
function isSchoolAccount(roles) { return (roles || []).some((r) => DOMAIN_IT_RE.test(r) || DOMAIN_ADMIN_RE.test(r) || DOMAIN_LEADER_RE.test(r) || PROVIDER_RE.test(r)); }

// True when the account holds `role`, or is an admin.
async function userHasRole(req, role) {
  if (hasRole(req, "admin")) return true;
  const { roles } = await userRoles(req);
  return roles.includes(role) || isAdmin(roles);
}

module.exports = { ASSIGNABLE, STAFF, KINDS, staffFunctions, canAssign, DOMAIN_IT_RE, DOMAIN_ADMIN_RE, DOMAIN_LEADER_RE, PROVIDER_RE, STAFF_RE, BOOTSTRAP_ADMINS, isAssignable, normRole, roleLabel, managedDomains, can, isAdmin, isStaff, readRoles, writeRoles, updateRoles, rolesFor, userRoles, userHasRole, normUser, isSchoolAccount };
