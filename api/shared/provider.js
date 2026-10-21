// 蜂巢课程负责人 / Hive Course Leader (v3 第二批 ③, Rick 2026-10-21): the person who runs a course provider's side of
// Hive — its orders and class sizes, its courses (edit, submit, assign teachers within its own people), its
// teachers' profiles. Two ways to hold it:
//
//   provider:<hiveKey>        the explicit role, given on 角色分配 by the system administrator — for a provider
//                             without a tenant domain (IEW, CAP, …): a Hive staff member or a partner's guest account
//   domain_leader:<domain>    inferred: the education leader of a school whose Schools row carries that domain is
//                             the leader of that school's hive (the default since stage 2)
//
// <hiveKey> is hive.hiveKey() of the school's abbreviation (the key of snapshot.private.schoolRouting and of an
// order's hives[].key). A leader never holds a CRM level by this: the order endpoints let the leader in for its own
// hives' orders only (api/crm), the courses endpoint for its own hives' courses (api/courses), teachers by the hive's
// domain or organization (api/shared/teachers).
const { hiveKey } = require("./hive");

const PROVIDER_RE = /^provider:([A-Z0-9一-鿿]{1,12})$/;
const LEADER_RE = /^domain_leader:([a-z0-9][a-z0-9.-]*\.[a-z]{2,})$/;

const routingOf = (snap) => (((snap || {}).private || {}).schoolRouting) || {};

// The explicit keys from the roles alone (no snapshot needed).
function explicitKeys(roles) { return (roles || []).map((r) => (PROVIDER_RE.exec(r) || [])[1]).filter(Boolean); }
function leaderDomains(roles) { return (roles || []).map((r) => (LEADER_RE.exec(r) || [])[1]).filter(Boolean); }

// Every hive the account leads: [{ key, name, abbr, domain, via }], explicit first.
function hivesOf(roles, snap) {
  const routing = routingOf(snap), domains = leaderDomains(roles), out = [], seen = new Set();
  const add = (key, via) => { if (seen.has(key)) return; seen.add(key); const r = routing[key] || {}; out.push({ key, name: r.name || "", abbr: r.abbr || "", domain: String(r.domain || "").toLowerCase(), via }); };
  for (const k of explicitKeys(roles)) add(k, "role");
  for (const k of Object.keys(routing)) if (routing[k] && routing[k].domain && domains.includes(String(routing[k].domain).toLowerCase())) add(k, "leader");
  return out;
}
const keysOf = (roles, snap) => hivesOf(roles, snap).map((h) => h.key);
const domainsOf = (roles, snap) => hivesOf(roles, snap).map((h) => h.domain).filter(Boolean);
function isProvider(roles, snap) { return keysOf(roles, snap).length > 0; }

// A snapshot course's hive key (the deliverer), as the order pipeline computes it.
function courseKey(course) { return hiveKey((course && course.school && (course.school.abbr || course.school.name)) || ""); }
function ownsCourse(keys, course) { const k = courseKey(course); return !!k && (keys || []).includes(k); }
function ownsOrder(keys, order) { return (keys || []).length > 0 && ((order && order.hives) || []).some((h) => keys.includes(h.key)); }

// The hives for pickers (角色分配): every routed hive, with its domain when it has one.
function allHives(snap) {
  const routing = routingOf(snap);
  return Object.keys(routing).map((k) => ({ key: k, name: routing[k].name || "", abbr: routing[k].abbr || "", domain: String(routing[k].domain || "").toLowerCase() })).sort((a, b) => (a.abbr || a.name).localeCompare(b.abbr || b.name));
}

module.exports = { PROVIDER_RE, explicitKeys, leaderDomains, hivesOf, keysOf, domainsOf, isProvider, courseKey, ownsCourse, ownsOrder, allHives };
