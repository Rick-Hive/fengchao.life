// /api/calendar — 校历 (api/shared/calendar.js): the school's own calendar and what Hive adds.
//
//   GET  /api/calendar?domain=<d>          a school's calendar: its own events, the Hive events aimed
//                                          at it (read-only), who may edit            (教育领袖 of d,
//                                          sysadmin; not the IT 管理员)
//   POST /api/calendar {domain, op: "save", event, timezone?}   add or change one event of the school's
//                                          calendar                                    (教育领袖 of d ONLY)
//   POST /api/calendar {domain, op: "delete", id}               remove one                (same)
//   POST /api/calendar {domain, op: "zone", timezone}           the school's default time zone (same)
//   GET  /api/calendar?layer=hive          the Hive layer                              (sysadmin)
//   POST /api/calendar {layer: "hive", op: "save", event}       add or change a Hive event, with the
//                                          schools it is for (targets: ["*"] or domains)   (sysadmin)
//   POST /api/calendar {layer: "hive", op: "delete", id}        remove one                (sysadmin)
//   POST /api/calendar {domain, layer?, op: "syncplan" | "sync" | "withdraw", only?, fresh?, limit?}
//                                          write the layer's events into the school's accounts' default
//                                          Outlook / Teams calendar (api/shared/calendarSync.js): syncplan
//                                          counts what is missing / changed / no longer wanted; sync does
//                                          one batch (the page repeats until remaining = 0, fresh on the
//                                          first request); withdraw removes what this layer wrote. `only` =
//                                          accounts of the school to limit it to (the test run). School
//                                          layer: its 教育领袖. Hive layer (domain = the school pushed to):
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

    if (layer === "hive") {
      if (!isAdmin(roles)) return done(403, { error: "the Hive events are added by the system administrator", code: "forbidden" });
      if (method === "GET") {
        const hive = await CAL.readHive();
        return done(200, { layer: "hive", hive, canEdit: true, reminders: CAL.REMINDERS, defaults: { reminder: CAL.DEFAULT_REMINDER, timeZone: CAL.DEFAULT_TZ } });
      }
      if (method !== "POST") return done(405, { error: "method not allowed" });
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
      try { doc = await CAL.saveHiveEvent(body.event, by, body.timezone); } catch (err) { if (err.status === 400) return done(400, { error: err.message, problems: err.problems }); throw err; }
      const ev = (doc.events || []).find((x) => x.id === (body.event && body.event.id)) || doc.events[doc.events.length - 1];
      await audit(context, { actor: by, action: "calendar.save", target: "hive", id: ev && ev.id, title: ev && ev.title, schools: ev && ev.targets, result: "ok" });
      return done(200, { ok: true, hive: doc, event: ev });
    }

    const domain = String(q.domain || body.domain || "").trim().toLowerCase();
    if (!DOMAIN_RE.test(domain)) return done(400, { error: "domain missing or malformed" });
    if (!can(roles, "calendar", domain)) return done(403, { error: `the 校历 of ${domain} is seen by its 教育领袖 (and the system administrator)`, code: "forbidden" });
    const canEdit = can(roles, "calendarEdit", domain);

    if (method === "GET") {
      const [calendar, hive, school] = await Promise.all([CAL.readSchool(domain), CAL.readHive(), schoolOf(domain)]);
      return done(200, { layer: "school", domain, school, calendar, hive: { events: CAL.hiveFor(hive, domain) }, canEdit, reminders: CAL.REMINDERS, defaults: { reminder: CAL.DEFAULT_REMINDER, timeZone: calendar.timezone || CAL.DEFAULT_TZ } });
    }
    if (method !== "POST") return done(405, { error: "method not allowed" });
    if (!canEdit) return done(403, { error: `the 校历 of ${domain} is edited by its 教育领袖${isAdmin(roles) ? "; the system administrator adds events in the Hive layer instead" : ""}`, code: "forbidden" });
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
    try { doc = await CAL.saveSchoolEvent(domain, body.event, by, body.timezone); } catch (err) { if (err.status === 400) return done(400, { error: err.message, problems: err.problems }); throw err; }
    const ev = (doc.events || []).find((x) => x.id === (body.event && body.event.id)) || doc.events[doc.events.length - 1];
    await audit(context, { actor: by, action: "calendar.save", target: domain, id: ev && ev.id, title: ev && ev.title, result: "ok" });
    return done(200, { ok: true, calendar: doc, event: ev });
  } catch (err) {
    context.log.error(`calendar: ${(err && err.stack) || err}`);
    reply(context, 500, { error: String((err && err.message) || err) });
  }
};
