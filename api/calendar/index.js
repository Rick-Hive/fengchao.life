// /api/calendar — 校历 (api/shared/calendar.js): the school's own calendar and what Hive adds.
//
//   GET  /api/calendar?domain=<d>          a school's calendar: its own events, the Hive events aimed
//                                          at it (read-only), who may edit            (教育领袖 of d,
//                                          IT 管理员 of d, sysadmin)
//   POST /api/calendar {domain, op: "save", event, timezone?}   add or change one event of the school's
//                                          calendar                                    (教育领袖 of d ONLY)
//   POST /api/calendar {domain, op: "delete", id}               remove one                (same)
//   POST /api/calendar {domain, op: "zone", timezone}           the school's default time zone (same)
//   GET  /api/calendar?layer=hive          the Hive layer                              (sysadmin)
//   POST /api/calendar {layer: "hive", op: "save", event}       add or change a Hive event, with the
//                                          schools it is for (targets: ["*"] or domains)   (sysadmin)
//   POST /api/calendar {layer: "hive", op: "delete", id}        remove one                (sysadmin)
// The system administrator may not change a school's own calendar: the two layers never overwrite
// each other. Nothing here writes into anyone's Outlook / Teams calendar yet.
const CAL = require("../shared/calendar");
const { userRoles, normUser, can, isAdmin } = require("../shared/roles");
const { readInstitutions } = require("../shared/people");
const { guard, finish } = require("../shared/session");
const { audit } = require("../shared/audit");

const DOMAIN_RE = /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/;
const reply = (context, status, body) => { context.res = { status, headers: { "Cache-Control": "no-store" }, body }; };

async function schoolOf(domain) {
  try { const i = (await readInstitutions()).institutions[domain] || {}; return { domain, name: i.name || "", nameEn: i.nameEn || "" }; } catch { return { domain, name: "", nameEn: "" }; }
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
    if (!can(roles, "calendar", domain)) return done(403, { error: `the 校历 of ${domain} is seen by its 教育领袖 and IT 管理员`, code: "forbidden" });
    const canEdit = can(roles, "calendarEdit", domain);

    if (method === "GET") {
      const [calendar, hive, school] = await Promise.all([CAL.readSchool(domain), CAL.readHive(), schoolOf(domain)]);
      return done(200, { layer: "school", domain, school, calendar, hive: { events: CAL.hiveFor(hive, domain) }, canEdit, reminders: CAL.REMINDERS, defaults: { reminder: CAL.DEFAULT_REMINDER, timeZone: calendar.timezone || CAL.DEFAULT_TZ } });
    }
    if (method !== "POST") return done(405, { error: "method not allowed" });
    if (!canEdit) return done(403, { error: `the 校历 of ${domain} is edited by its 教育领袖${isAdmin(roles) ? "; the system administrator adds events in the Hive layer instead" : ""}`, code: "forbidden" });
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
    if (body.op !== "save") return done(400, { error: "op must be save, delete or zone" });
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
