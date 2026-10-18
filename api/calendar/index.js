// /api/calendar — 校历 (api/shared/calendar.js): the school's own calendar and what Hive adds.
//
//   GET  /api/calendar?domain=<d>          a school's calendar: its own events, the Hive events aimed
//                                          at it (read-only), who may edit            (教育领袖 of d, 教育社区经理,
//                                          课程总监, sysadmin; not the IT 管理员)
//   POST /api/calendar {domain, op: "save", event, timezone?}   add or change one event of the school's
//                                          calendar                                    (教育领袖 of d, 教育社区经理, 课程总监)
//   POST /api/calendar {domain, op: "delete", id}               remove one                (same)
//   POST /api/calendar {domain, op: "zone", timezone}           the school's default time zone (same)
//   GET  /api/calendar?layer=hive          the Hive layer                    (sysadmin, 教育社区经理, 课程总监)
//   POST /api/calendar {layer: "hive", op: "save", event}       add or change a Hive event: schools
//                                          (targets: ["*"] or domains), roles (audience), Teams (teams) and
//                                          named accounts of any school (people)          (same)
//   POST /api/calendar {layer: "hive", op: "delete", id}        remove one                (same)
//   GET  /api/calendar?lookup=audience&layer=hive | &domain=<d>   the accounts and Teams the event form
//                                          offers for picking (all schools on the Hive layer, one school
//                                          otherwise)                          (whoever may edit that layer)
//   GET  /api/calendar?optout=1&domain=<d | *>   the 不接收广播的名单 (accounts that do not receive the broadcasts), with
//                                          that school's accounts to pick from (* = every school: sysadmin,
//                                          教育社区经理, 课程总监; a school: also its IT 管理员)
//   POST /api/calendar {op: "optout", upn, on: true|false, reason?}   put an account on / take it off the list
//                                          (same people, for that account's school)
//   POST /api/calendar {layer: "hive", op: "syncdomains", only?}  the schools a Hive publish has to visit
//   POST /api/calendar {domain, layer?, op: "syncplan" | "sync" | "withdraw", only?, fresh?, limit?}
//                                          write the layer's events into the school's accounts' default
//                                          Outlook / Teams calendar (api/shared/calendarSync.js): syncplan
//                                          counts what is missing / changed / no longer wanted; sync does
//                                          one batch (the page repeats until remaining = 0, fresh on the
//                                          first request); withdraw removes what this layer wrote. `only` =
//                                          accounts of the school to limit it to (the test run). School
//                                          layer: its 教育领袖, 教育社区经理, 课程总监. Hive layer (domain = the school pushed to):
//                                          the system administrator.
// The system administrator may not change a school's own calendar: the two layers never overwrite
// each other, and a layer's withdrawal never touches the other layer's events.
const CAL = require("../shared/calendar");
const SYNC = require("../shared/calendarSync");
const { userRoles, normUser, can, isAdmin } = require("../shared/roles");
const { readInstitutions } = require("../shared/people");
const { guard, finish } = require("../shared/session");
const { audit } = require("../shared/audit");

const DOMAIN_RE = /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/;
const reply = (context, status, body) => { context.res = { status, headers: { "Cache-Control": "no-store" }, body }; };

async function schoolOf(domain) {
  try { const i = (await readInstitutions()).institutions[domain] || {}; return { domain, name: i.name || "", nameEn: i.nameEn || "" }; } catch { return { domain, name: "", nameEn: "" }; }
}


const dir = require("../shared/directory");
const { readPeople, identityOf } = require("../shared/people");

// The accounts and Teams the form offers for picking, from the directory cache (no Graph call).
// Compact keys keep a 15-school list small: u = account, n = name, d = school, i = identity, t = the numbers
// (positions in `teams`) of the Teams / classes the account belongs to.
async function audienceLookup(domains) {
  const peopleDoc = ((await readPeople()) || {}).people || {};
  const accounts = [], teams = new Map();
  for (const d of domains) {
    const doc = await dir.readDomain(d);
    for (const u of (doc && doc.users) || []) {
      if (!u.upn || u.enabled === false) continue;
      const upn = u.upn.toLowerCase(), mine = [];
      for (const g of u.groups || []) {
        if (!g || !g.id || (g.kind !== "team" && g.kind !== "class")) continue;
        const t = teams.get(g.id) || { id: g.id, name: g.name || "", kind: g.kind, count: 0, domains: new Set() };
        t.count++; t.domains.add(d); teams.set(g.id, t); mine.push(g.id);
      }
      accounts.push({ u: upn, n: u.displayName || "", d, i: identityOf(peopleDoc[u.upn] || peopleDoc[upn] || null, { department: u.department, jobTitle: u.jobTitle, plan: u.plan || "" }), t: mine });
    }
  }
  const list = Array.from(teams.values()).sort((a, b) => a.name.localeCompare(b.name));
  const at = new Map(list.map((t, i) => [t.id, i]));
  for (const a of accounts) a.t = a.t.map((id) => at.get(id)); // team numbers (positions in `teams`) keep the list small
  return { people: accounts, teams: list.map((t) => Object.assign({}, t, { domains: Array.from(t.domains).sort() })) };
}
// Named accounts must belong to a school Hive knows and be accounts of it; on the school layer, of that school.
async function checkPeople(layer, domain, people) {
  const bad = [];
  if (!people || !people.length) return bad;
  const known = new Set(((await dir.cachedDomains()) || []).map((x) => x.domain));
  const byDomain = new Map();
  for (const u of people || []) { const d = String(u).split("@")[1]; if (!byDomain.has(d)) byDomain.set(d, []); byDomain.get(d).push(u); }
  for (const [d, list] of byDomain) {
    if (layer !== "hive" && d !== domain) { bad.push(...list.map((u) => `${u} (not an account of ${domain}; use Admin broadcast to reach other schools)`)); continue; }
    if (!known.has(d)) { bad.push(...list.map((u) => `${u} (${d} is not one of the schools in Hive)`)); continue; }
    const have = new Set((((await dir.readDomain(d)) || {}).users || []).map((x) => String(x.upn || "").toLowerCase()));
    for (const u of list) if (!have.has(u)) bad.push(`${u} (no such account in ${d}'s list — if it is new, sync the school's accounts first)`);
  }
  return bad;
}

const SYNC_OPS = ["syncplan", "sync", "withdraw"];
// One of the sync operations for `layer` in `domain`; the caller has already checked who may.
async function syncOp(done, context, layer, domain, body, by) {
  if (!DOMAIN_RE.test(domain)) return done(400, { error: "domain missing or malformed" });
  let only = null;
  if (body.only != null && body.only !== "") {
    const list = (Array.isArray(body.only) ? body.only : String(body.only).split(/[\s,;，；]+/)).map((x) => String(x || "").trim().toLowerCase()).filter(Boolean);
    const bad = list.filter((u) => !u.endsWith("@" + domain));
    if (bad.length) return done(400, { error: `these are not accounts of ${domain}: ${bad.join(", ")}` });
    if (list.length) only = new Set(list);
  }
  const withdraw = body.op === "withdraw" || body.withdraw === true;
  const opts = { only, withdraw, fresh: body.fresh === true, limit: body.limit, by };
  try {
    if (body.op === "syncplan") return done(200, Object.assign({ ok: true, domain, layer, withdraw }, await SYNC.summary(domain, layer, opts)));
    const r = await SYNC.run(domain, layer, opts);
    await audit(context, { actor: by, action: withdraw ? "calendar.withdraw" : "calendar.sync", target: domain, layer, created: r.created, updated: r.updated, deleted: r.deleted, failed: r.failedNow, only: only ? only.size : 0, result: "ok" });
    return done(200, Object.assign({ ok: true, domain, layer, withdraw }, r));
  } catch (err) {
    if (err.status === 409 || err.status === 403) { await audit(context, { actor: by, action: "calendar.sync", target: domain, layer, result: "refused", code: err.code }); return done(err.status, { error: err.message, code: err.code }); }
    throw err;
  }
}

module.exports = async function (context, req) {
  const method = String(req.method || "GET").toUpperCase();
  const q = req.query || {};
  const body = req.body && typeof req.body === "object" ? req.body : {};
  try {
    const s = await guard(context, req);
    if (!s) return;
    const done = (status, b) => { reply(context, status, b); finish(context, s); };
    const { user, roles } = await userRoles(req);
    const by = normUser(user);
    const layer = String(q.layer || body.layer || "school");

    // 不接收广播的名单 (Rick, 2026-10-17): accounts that do not receive 管理员广播.
    if (q.optout || body.op === "optout") {
      const dom = String(q.domain || body.domain || "*").trim().toLowerCase();
      if (method === "GET") {
        if (dom === "*" ? !can(roles, "hive") : (!DOMAIN_RE.test(dom) || !can(roles, "optout", dom))) return done(403, { error: "the list of accounts not receiving broadcasts is kept by the system administrator, the 教育社区经理, the 课程总监 and the school's 教育领袖", code: "forbidden" });
        const [doc, look] = await Promise.all([CAL.readOptout(), audienceLookup(dom === "*" ? ((await dir.cachedDomains()) || []).map((x) => x.domain).sort() : [dom])]);
        const items = Object.entries(doc.items || {}).filter(([u]) => dom === "*" || u.endsWith("@" + dom)).map(([upn, v]) => Object.assign({ upn }, v)).sort((a, b) => String(b.at).localeCompare(String(a.at)));
        return done(200, { domain: dom, items, people: look.people, canEdit: true });
      }
      if (method !== "POST") return done(405, { error: "method not allowed" });
      const upn = String(body.upn || "").trim().toLowerCase(), d = upn.split("@")[1] || "";
      if (!CAL.UPN_RE.test(upn)) return done(400, { error: "not an account address" });
      if (!can(roles, "optout", d)) return done(403, { error: `the list of accounts not receiving broadcasts of ${d} is kept by the system administrator, the 教育社区经理, the 课程总监 and that school's 教育领袖`, code: "forbidden" });
      const on = body.on !== false;
      if (on) {
        const have = new Set((((await dir.readDomain(d)) || {}).users || []).map((x) => String(x.upn || "").toLowerCase()));
        if (!have.has(upn)) return done(400, { error: `no such account in ${d}'s list — if it is new, sync the school's accounts first` });
      }
      const doc = await CAL.setOptout(upn, on, body.reason, by);
      await audit(context, { actor: by, action: on ? "broadcast.optout" : "broadcast.optin", target: upn, reason: String(body.reason || "").slice(0, 200), result: "ok" });
      return done(200, { ok: true, item: doc.items[upn] ? Object.assign({ upn }, doc.items[upn]) : null });
    }

    if (layer === "hive") {
      if (!can(roles, "hive")) return done(403, { error: "broadcasts are added by the system administrator, the 教育社区经理 and the 课程总监", code: "forbidden" });
      if (method === "GET" && q.lookup === "audience") return done(200, Object.assign({ layer: "hive", optout: Object.keys((await CAL.readOptout()).items || {}) }, await audienceLookup(((await dir.cachedDomains()) || []).map((x) => x.domain).sort())));
      if (method === "GET") {
        const hive = await CAL.readHive();
        return done(200, { layer: "hive", hive, canEdit: true, reminders: CAL.REMINDERS, defaults: { reminder: CAL.DEFAULT_REMINDER, timeZone: CAL.DEFAULT_TZ } });
      }
      if (method !== "POST") return done(405, { error: "method not allowed" });
      if (body.op === "syncdomains") {
        const only = body.only ? new Set((Array.isArray(body.only) ? body.only : String(body.only).split(/[\s,;，；]+/)).map((x) => String(x || "").trim().toLowerCase()).filter(Boolean)) : null;
        return done(200, { ok: true, domains: await SYNC.hiveDomains(only) });
      }
      if (SYNC_OPS.includes(body.op)) return syncOp(done, context, "hive", String(body.domain || "").trim().toLowerCase(), body, by);
      if (body.op === "delete") {
        const id = String(body.id || "");
        const { doc, found } = await CAL.deleteHiveEvent(id, by);
        if (!found) return done(404, { error: "no such event" });
        await audit(context, { actor: by, action: "calendar.delete", target: "hive", id, result: "ok" });
        return done(200, { ok: true, hive: doc });
      }
      if (body.op !== "save") return done(400, { error: "op must be save or delete" });
      let doc;
      try { const chk = CAL.cleanEvent(body.event, "hive", body.timezone); const bad = await checkPeople("hive", "", chk.people); if (bad.length) return done(400, { error: "please check the named accounts", problems: bad }); } catch (err) { if (err.status === 400) return done(400, { error: err.message, problems: err.problems }); throw err; }
      try { doc = await CAL.saveHiveEvent(body.event, by, body.timezone); } catch (err) { if (err.status === 400) return done(400, { error: err.message, problems: err.problems }); throw err; }
      const ev = (doc.events || []).find((x) => x.id === (body.event && body.event.id)) || doc.events[doc.events.length - 1];
      await audit(context, { actor: by, action: "calendar.save", target: "hive", id: ev && ev.id, title: ev && ev.title, schools: ev && ev.targets, result: "ok" });
      return done(200, { ok: true, hive: doc, event: ev });
    }

    // 我的校历 (Rick, 2026-10-18): any signed-in account sees, read-only, the school events and broadcasts it gets.
    if (method === "GET" && q.mine) {
      const m = await SYNC.mine(by);
      return done(200, Object.assign({ layer: "mine", me: by, school: await schoolOf(m.domain), canEdit: false, reminders: CAL.REMINDERS, defaults: { reminder: CAL.DEFAULT_REMINDER, timeZone: m.timezone } }, m));
    }

    const domain = String(q.domain || body.domain || "").trim().toLowerCase();
    if (!DOMAIN_RE.test(domain)) return done(400, { error: "domain missing or malformed" });
    if (!can(roles, "calendar", domain)) return done(403, { error: `the 校历 of ${domain} is seen by its 教育领袖, the 教育社区经理 and 课程总监 (and the system administrator)`, code: "forbidden" });
    const canEdit = can(roles, "calendarEdit", domain);

    if (method === "GET") {
      const [calendar, hive, school] = await Promise.all([CAL.readSchool(domain), CAL.readHive(), schoolOf(domain)]);
      if (q.lookup === "audience") { if (!canEdit) return done(403, { error: "not allowed", code: "forbidden" }); return done(200, Object.assign({ layer: "school", domain }, await audienceLookup([domain]))); }
      return done(200, { layer: "school", domain, school, calendar, hive: { events: CAL.hiveFor(hive, domain) }, canEdit, reminders: CAL.REMINDERS, defaults: { reminder: CAL.DEFAULT_REMINDER, timeZone: calendar.timezone || CAL.DEFAULT_TZ } });
    }
    if (method !== "POST") return done(405, { error: "method not allowed" });
    if (!canEdit) return done(403, { error: `the 校历 of ${domain} is edited by its 教育领袖, the 教育社区经理 and 课程总监${isAdmin(roles) ? "; the system administrator adds events in the Hive layer instead" : ""}`, code: "forbidden" });
    if (SYNC_OPS.includes(body.op)) return syncOp(done, context, "school", domain, body, by);
    if (body.op === "delete") {
      const id = String(body.id || "");
      const { doc, found } = await CAL.deleteSchoolEvent(domain, id, by);
      if (!found) return done(404, { error: "no such event" });
      await audit(context, { actor: by, action: "calendar.delete", target: domain, id, result: "ok" });
      return done(200, { ok: true, calendar: doc });
    }
    if (body.op === "zone") {
      let doc;
      try { doc = await CAL.setSchoolZone(domain, String(body.timezone || ""), by); } catch (err) { if (err.status === 400) return done(400, { error: err.message, problems: err.problems }); throw err; }
      await audit(context, { actor: by, action: "calendar.zone", target: domain, timezone: doc.timezone, result: "ok" });
      return done(200, { ok: true, calendar: doc });
    }
    if (body.op !== "save") return done(400, { error: "op must be save, delete, zone, syncplan, sync or withdraw" });
    let doc;
    try { const chk = CAL.cleanEvent(body.event, "school", body.timezone); const bad = await checkPeople("school", domain, chk.people); if (bad.length) return done(400, { error: "please check the named accounts", problems: bad }); } catch (err) { if (err.status === 400) return done(400, { error: err.message, problems: err.problems }); throw err; }
    try { doc = await CAL.saveSchoolEvent(domain, body.event, by, body.timezone); } catch (err) { if (err.status === 400) return done(400, { error: err.message, problems: err.problems }); throw err; }
    const ev = (doc.events || []).find((x) => x.id === (body.event && body.event.id)) || doc.events[doc.events.length - 1];
    await audit(context, { actor: by, action: "calendar.save", target: domain, id: ev && ev.id, title: ev && ev.title, result: "ok" });
    return done(200, { ok: true, calendar: doc, event: ev });
  } catch (err) {
    context.log.error(`calendar: ${(err && err.stack) || err}`);
    reply(context, 500, { error: String((err && err.message) || err) });
  }
};
