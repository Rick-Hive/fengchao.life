// 用户管理 — filtering, searching, counting and paging the rows of the users table, server side (Rick, 2026-10-21:
// 「用户管理载入时需要很长时间……能否只加载前 100 个，之后分页显示」). The 所有学校 view used to send every school's
// accounts (2,000+) and let the browser filter them; now the server keeps the full set, answers one page at a time
// and the tile counts come with it. The predicates are the ones management/src/20-users.js used to run itself.
//
// Query: q (text), filter (all | never | noauth | noid | anomaly), role (id:<身份> | role:teacher|it|leader|staff|admin|any),
// sort (upn | name | signin), offset, limit (a number, or "all" for the CSV).

// 从未登录 = no sign-in time from Microsoft AND no authenticator: registering one takes a sign-in, and
// Microsoft's signInActivity lags hours behind.
function neverSigned(u) { return !u.lastSignIn && u.verified !== true; }

function hasRole(u, kind) {
  const rs = (u.roles || []).map((r) => (r && r.role) || r);
  if (kind === "any") return rs.length > 0;
  if (kind === "it") return rs.some((r) => /^domain_(it|admin):/.test(r));
  if (kind === "leader") return rs.some((r) => /^domain_leader:/.test(r));
  if (kind === "staff") return rs.some((r) => /^staff:/.test(r) || r === "coordinator");
  if (kind === "admin") return rs.some((r) => r === "admin" || r === "staff:sysadmin");
  // 蜂巢课程教师 (Rick, 2026-10-08): from the Hive Teachers table, or any account whose identity is 老师.
  if (kind === "teacher") return !!u.hiveTeacher || u.identity === "老师";
  return true;
}

// The text a search looks through: account, name, identity, linked accounts, group names (both languages),
// device names, the school's names, the roles' labels.
function haystack(u, schoolNames) {
  const sn = (schoolNames && u.domain && schoolNames[u.domain]) || {};
  return [
    u.upn, u.displayName, u.identity, (u.linked || []).join(" "),
    (u.groups || []).map((g) => [g.name, g.nameZh, g.nameEn].filter(Boolean).join(" ")).join(" "),
    (u.devices || []).map((x) => x.name).join(" "),
    u.domain || "", sn.name || "", sn.nameEn || "",
    (u.roles || []).map((r) => [r.zh, r.en, r.role].filter(Boolean).join(" ")).join(" "),
  ].join(" ").toLowerCase();
}

function matches(u, opts, schoolNames) {
  const f = opts.filter || "all", role = opts.role || "", q = String(opts.q || "").trim().toLowerCase();
  if (f === "noauth" && u.verified !== false) return false;
  if (f === "noid" && u.identity) return false;
  if (f === "never" && !neverSigned(u)) return false;
  if (f === "anomaly" && !u.anomaly) return false;
  if (role.indexOf("id:") === 0 && u.identity !== role.slice(3)) return false;
  if (role.indexOf("role:") === 0 && !hasRole(u, role.slice(5))) return false;
  if (q && haystack(u, schoolNames).indexOf(q) < 0) return false;
  return true;
}

// The stat strip's numbers, over the whole set (not the page, not the filter).
function counts(users) {
  const out = { total: users.length, never: 0, anySignIn: false, noauth: 0, noid: 0, anomaly: 0, teacher: 0, groups: 0 };
  const gids = new Set();
  for (const u of users) {
    if (neverSigned(u)) out.never++;
    if (u.lastSignIn) out.anySignIn = true;
    if (u.verified === false) out.noauth++;
    if (!u.identity) out.noid++;
    if (u.anomaly) out.anomaly++;
    if (u.hiveTeacher || u.identity === "老师") out.teacher++;
    for (const g of u.groups || []) if (g && g.id) gids.add(g.id);
  }
  out.groups = gids.size;
  return out;
}

const SORTS = {
  upn: (a, b) => String(a.upn || "").localeCompare(String(b.upn || "")),
  name: (a, b) => String(a.displayName || "").localeCompare(String(b.displayName || ""), "zh-Hans-CN") || String(a.upn || "").localeCompare(String(b.upn || "")),
  signin: (a, b) => String(b.lastSignIn || "").localeCompare(String(a.lastSignIn || "")) || String(a.upn || "").localeCompare(String(b.upn || "")),
};

function parseQuery(q) {
  q = q || {};
  const limitRaw = String(q.limit == null ? "" : q.limit).toLowerCase();
  const limit = limitRaw === "all" ? Infinity : Math.min(500, Math.max(1, Math.round(Number(limitRaw) || 100)));
  return {
    q: String(q.q || "").slice(0, 100),
    filter: ["all", "never", "noauth", "noid", "anomaly"].includes(q.filter) ? q.filter : "all",
    role: /^(id:[^\s]{1,20}|role:(teacher|it|leader|staff|admin|any))$/.test(String(q.role || "")) ? String(q.role) : "",
    sort: SORTS[q.sort] ? q.sort : "upn",
    offset: Math.max(0, Math.round(Number(q.offset) || 0)),
    limit,
  };
}

// One page of the rows that match, plus the total that matches and the counts of the whole set.
function page(users, opts, schoolNames) {
  const o = Object.assign({ q: "", filter: "all", role: "", sort: "upn", offset: 0, limit: 100 }, opts || {});
  const hit = users.filter((u) => matches(u, o, schoolNames)).sort(SORTS[o.sort] || SORTS.upn);
  const limit = o.limit === Infinity ? hit.length : o.limit;
  const offset = Math.min(o.offset, Math.max(0, hit.length - 1));
  const rows = hit.slice(offset, offset + limit);
  return { users: rows, matched: hit.length, offset, limit: o.limit === Infinity ? "all" : limit, counts: counts(users) };
}

module.exports = { neverSigned, hasRole, haystack, matches, counts, parseQuery, page, SORTS };
