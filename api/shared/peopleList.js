// 人员库 — filtering, searching, sorting, counting and paging the hub's people on the server (Rick, 2026-10-21: 「人员库
// 也用相同的设计，默认按 CRM ID 排列」, after 用户管理 was paged the same way). The page used to receive every person
// (2,000+ with their facets) and filter them itself; now it asks for one page and gets the tab counts with it.
//
// Query: q (text), tab (all | replace | missing | viaTeams), stage (lead | registered | active | dormant), mark (none |
// notified | replaced — within the replace tab), sort (crmId | name | email | sources | accounts | orders | active |
// stage), dir (asc | desc), offset, limit (a number, or "all" for the CSV).

const TABS = ["all", "replace", "missing", "viaTeams"];
const STAGES = ["lead", "registered", "active", "dormant"];
const STAGE_ORDER = { lead: 0, registered: 1, active: 2, dormant: 3 };
const MARKS = ["none", "notified", "replaced"];

function markOf(p) { return p.replaceMark ? p.replaceMark.status : "none"; }
function tabsOf(p) {
  const tb = ["all"];
  if (p.primaryTier === "replace") tb.push("replace");
  if (p.primaryTier === "missing") tb.push("missing");
  if (p.viaTeams) tb.push("viaTeams");
  return tb;
}
function lastActive(p) { return [p.lastOrder, p.lastSignIn].filter(Boolean).sort().pop() || ""; }
const accountsOf = (p) => ((p.facets || {}).accounts || []);
const customersOf = (p) => ((p.facets || {}).customers || []);

function haystack(p) {
  return [p.crmId, p.name, (p.emails || []).map((e) => e.email).join(" "), accountsOf(p).map((a) => a.upn || a.domain).join(" "), customersOf(p).map((c) => (c.teams || "") + " " + (c.city || "")).join(" ")].join(" ").toLowerCase();
}

function matches(p, o) {
  if (o.tab !== "all" && !tabsOf(p).includes(o.tab)) return false;
  if (o.tab === "replace" && o.mark && markOf(p) !== o.mark) return false;
  if (o.stage && p.stage !== o.stage) return false;
  if (o.q && haystack(p).indexOf(o.q) < 0) return false;
  return true;
}

// the sort keys the table's headings offer (management/src/40-people.js)
function sortValue(p, k) {
  switch (k) {
    case "crmId": return p.crmId || "";
    case "name": return String(p.name || "").toLowerCase();
    case "email": return String(p.primaryEmail || "").toLowerCase();
    case "sources": { const s = p.sources || {}; return [s.customer, s.account, s.lead, s.hive].filter(Boolean).length; }
    case "accounts": return String((accountsOf(p)[0] || {}).upn || (accountsOf(p)[0] || {}).domain || p.primaryEmail || "").toLowerCase();
    case "orders": return (typeof p.spend === "number" ? p.spend : 0) * 1e6 + (p.orders || 0) + (p.hiveOrders || 0);
    case "active": return lastActive(p);
    case "stage": return STAGE_ORDER[p.stage] == null ? 9 : STAGE_ORDER[p.stage];
  }
  return "";
}
function sorter(k, dir) {
  return (a, b) => {
    const x = sortValue(a, k), y = sortValue(b, k);
    if (x === "" && y !== "") return 1; // empty values last whichever direction
    if (y === "" && x !== "") return -1;
    const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "zh");
    return c * dir || String(a.crmId || "").localeCompare(String(b.crmId || ""));
  };
}

// The tabs' counts over the whole set, and the replace tab's progress by mark (有订单的优先).
function counts(people) {
  const out = { all: people.length, replace: 0, missing: 0, viaTeams: 0, marks: { none: 0, notified: 0, replaced: 0, withOrders: 0 } };
  for (const p of people) {
    const tb = tabsOf(p);
    if (tb.includes("replace")) { out.replace++; out.marks[markOf(p)] = (out.marks[markOf(p)] || 0) + 1; if ((p.orders || 0) > 0) out.marks.withOrders++; }
    if (tb.includes("missing")) out.missing++;
    if (tb.includes("viaTeams")) out.viaTeams++;
  }
  return out;
}

const SORT_KEYS = ["crmId", "name", "email", "sources", "accounts", "orders", "active", "stage"];
function parseQuery(q) {
  q = q || {};
  const limitRaw = String(q.limit == null ? "" : q.limit).toLowerCase();
  const limit = limitRaw === "all" ? Infinity : Math.min(500, Math.max(1, Math.round(Number(limitRaw) || 100)));
  return {
    q: String(q.q || "").trim().toLowerCase().slice(0, 100),
    tab: TABS.includes(q.tab) ? q.tab : "all",
    stage: STAGES.includes(q.stage) ? q.stage : "",
    mark: MARKS.includes(q.mark) ? q.mark : "",
    sort: SORT_KEYS.includes(q.sort) ? q.sort : "crmId",
    dir: q.dir === "desc" ? -1 : 1,
    offset: Math.max(0, Math.round(Number(q.offset) || 0)),
    limit,
  };
}

function page(people, opts) {
  const o = Object.assign({ q: "", tab: "all", stage: "", mark: "", sort: "crmId", dir: 1, offset: 0, limit: 100 }, opts || {});
  const hit = people.filter((p) => matches(p, o)).sort(sorter(o.sort, o.dir));
  const limit = o.limit === Infinity ? hit.length : o.limit;
  const offset = Math.min(o.offset, Math.max(0, hit.length - 1));
  return { people: hit.slice(offset, offset + limit), matched: hit.length, offset, limit: o.limit === Infinity ? "all" : limit, counts: counts(people) };
}

module.exports = { TABS, STAGES, MARKS, SORT_KEYS, tabsOf, markOf, matches, counts, parseQuery, page, sorter };
