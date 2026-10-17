// 校历 (api/shared/calendar.js + api/calendar): a school's own calendar, edited by its 教育领袖 only,
// and the Hive layer the system administrator adds to — two layers that never overwrite each other.
//
// Run with:  node test/calendar.test.js
const assert = require("assert");
const path = require("path");
const Module = require("module");
const realResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) { if (request === "@azure/storage-blob") return "@azure/storage-blob"; return realResolve.call(this, request, parent, ...rest); };
require.cache["@azure/storage-blob"] = { id: "@azure/storage-blob", filename: "@azure/storage-blob", loaded: true, exports: { BlobServiceClient: { fromConnectionString() { throw new Error("no storage in test"); } } } };
delete process.env.STORAGE_CONNECTION_STRING;
process.env.HIVE_ADMINS = "hive.admin@fengchao.life";

const blobs = {};
const copy = (x) => JSON.parse(JSON.stringify(x));
const jsonstore = require(path.join(__dirname, "..", "api", "shared", "jsonstore.js"));
jsonstore.read = async (name, fallback) => (blobs[name] ? copy(blobs[name]) : (typeof fallback === "function" ? fallback() : copy(fallback)));
jsonstore.write = async (name, doc) => { blobs[name] = copy(doc); };
jsonstore.update = async (name, fallback, mutate) => { const doc = await jsonstore.read(name, fallback); const result = await mutate(doc); if (result !== false) blobs[name] = copy(doc); return { doc, result, written: result !== false }; };
const CAL = require(path.join(__dirname, "..", "api", "shared", "calendar.js"));

const session = require(path.join(__dirname, "..", "api", "shared", "session.js"));
session.guard = async (context, req) => { if (req.headers && req.headers["x-ms-client-principal"]) return { u: "x" }; context.res = { status: 403, body: { code: "signed_out" } }; return null; };
session.finish = () => {};
const rolesMod = require(path.join(__dirname, "..", "api", "shared", "roles.js"));
rolesMod.readRoles = async () => ({ entries: [] });
const people = require(path.join(__dirname, "..", "api", "shared", "people.js"));
people.readInstitutions = async () => ({ institutions: { "a.edu": { name: "甲校", nameEn: "School A" } } });
const auditMod = require(path.join(__dirname, "..", "api", "shared", "audit.js"));
const audits = []; auditMod.audit = async (ctx, e) => { audits.push(e); };
const fn = require(path.join(__dirname, "..", "api", "calendar", "index.js"));
const principal = (user, roles) => Buffer.from(JSON.stringify({ identityProvider: "aad", userId: "x", userDetails: user, userRoles: ["anonymous", "authenticated"].concat(roles || []) })).toString("base64");
async function call({ method = "GET", query = {}, body = null, user, roles }) {
  const context = { log: Object.assign(() => {}, { error() {}, warn() {} }), res: null };
  await fn(context, { method, query, body, headers: user ? { "x-ms-client-principal": principal(user, roles) } : {} });
  return context.res;
}
const LEADER = ["domain_leader:a.edu"], IT = ["domain_it:a.edu"], SYS = ["staff:sysadmin"];
const timed = { title: "教师培训", start: "2026-10-20T19:00", end: "2026-10-20T20:30", timeZone: "America/Chicago", link: "https://teams.microsoft.com/l/meetup-join/abc" };

(async () => {
  // ---- who may do what (roles.can) ----
  const can = rolesMod.can;
  assert.ok(can(LEADER, "calendar", "a.edu") && can(LEADER, "calendarEdit", "a.edu"), "the 教育领袖 sees and edits its school's calendar");
  assert.ok(!can(LEADER, "calendar", "b.edu") && !can(LEADER, "calendarEdit", "b.edu"), "not another school's");
  assert.ok(!can(IT, "calendar", "a.edu") && !can(IT, "calendarEdit", "a.edu"), "the IT 管理员 has no part in the calendar (the 教育领袖 publishes directly)");
  assert.ok(can(SYS, "calendar", "a.edu") && !can(SYS, "calendarEdit", "a.edu"), "the system administrator sees every school's calendar but may not overwrite it");
  assert.ok(can(["admin"], "calendar", "zz.edu") && !can(["admin"], "calendarEdit", "zz.edu"), "also the bootstrap admin");
  for (const f of ["community", "curriculum"]) assert.ok(can(["staff:" + f], "calendar", "a.edu") && can(["staff:" + f], "calendarEdit", "zz.edu"), `the ${f} staff function sees and edits every school's calendar (Rick, 2026-10-16)`);
  assert.ok(!can([], "calendar", "a.edu") && !can(["staff:finance"], "calendar", "a.edu") && !can(["staff:sales"], "calendarEdit", "a.edu") && !can(["staff:consultant"], "calendar", "a.edu"), "an ordinary user or other staff does not");
  assert.ok(!can(["staff:community"], "admin", "a.edu"), "and it gives nothing more than the calendar");

  // ---- validation ----
  const bad = (ev, layer, re) => assert.throws(() => CAL.cleanEvent(ev, layer || "school"), (e) => e.status === 400 && e.problems.some((p) => re.test(p)), JSON.stringify(ev));
  bad({}, "school", /title is required/);
  bad({ title: "x", start: "2026-13-01", allDay: true }, "school", /start must be a date/);
  bad({ title: "x", start: "2026-02-30", allDay: true }, "school", /start must be a date/);
  bad({ title: "x", start: "2026-10-20", end: "2026-10-19", allDay: true }, "school", /end date is before/);
  bad({ title: "x", start: "2026-10-20T10:00", end: "2026-10-20T10:00" }, "school", /end must be after/);
  bad({ title: "x", start: "2026-10-20T25:00", end: "2026-10-20T26:00" }, "school", /start must be a date and time/);
  bad({ title: "x", start: "2026-10-20", end: "2027-02-01", allDay: true }, "school", /more than 62 days/);
  bad(Object.assign({}, timed, { timeZone: "Mars/Olympus" }), "school", /time zone/);
  bad(Object.assign({}, timed, { audience: ["校长"] }), "school", /unknown audience/);
  bad(Object.assign({}, timed, { link: "http://insecure.example.com/x" }), "school", /https/);
  bad(Object.assign({}, timed, { link: "javascript:alert(1)" }), "school", /https/);
  bad(Object.assign({}, timed, { meeting: "teams" }), "school", /only a meeting link/);
  bad(Object.assign({}, timed, { reminder: 7 }), "school", /reminder must be/);
  bad(Object.assign({}, timed, { title: "t".repeat(121) }), "school", /title is longer/);
  bad(timed, "hive", /choose who it is for/);
  bad(Object.assign({}, timed, { targets: ["not a domain"] }), "hive", /unknown school/);
  const ok = CAL.cleanEvent(Object.assign({}, timed, { audience: ["老师", "老师", "行政"], reminder: 30, showAs: "busy" }), "school");
  assert.deepStrictEqual([ok.title, ok.allDay, ok.timeZone, ok.audience, ok.reminder, ok.showAs, ok.meeting, ok.link], ["教师培训", false, "America/Chicago", ["老师", "行政"], 30, "busy", "link", "https://teams.microsoft.com/l/meetup-join/abc"]);
  const dflt = CAL.cleanEvent({ title: "放假", allDay: true, start: "2026-11-26", end: "2026-11-27" }, "school", "America/Denver");
  assert.deepStrictEqual([dflt.reminder, dflt.showAs, dflt.timeZone, dflt.audience, dflt.link], [15, "free", "America/Denver", [], ""], "defaults: 15-minute reminder, shown as free, the school's zone, everyone");
  assert.strictEqual(CAL.cleanEvent(Object.assign({}, timed, { reminder: null }), "school").reminder, null, "no reminder is allowed");
  assert.deepStrictEqual(CAL.cleanEvent(Object.assign({}, timed, { targets: ["a.edu", "A.edu", "b.edu"] }), "hive").targets, ["a.edu", "b.edu"]);
  assert.deepStrictEqual(CAL.cleanEvent(Object.assign({}, timed, { targets: ["a.edu", "*"] }), "hive").targets, ["*"], "all schools wins");
  assert.strictEqual(CAL.cleanEvent(Object.assign({}, timed, { start: "2026-10-20", end: "2026-10-20", allDay: true }), "school").end, "2026-10-20", "a one-day all-day event: end = start (inclusive)");

  // ---- the school layer through the API ----
  let r = await call({ query: { domain: "a.edu" } });
  assert.strictEqual(r.status, 403, "signed out");
  r = await call({ query: { domain: "a.edu" }, user: "someone@a.edu", roles: [] });
  assert.strictEqual(r.status, 403, "no role, no calendar");
  r = await call({ query: { domain: "a.edu" }, user: "lead@a.edu", roles: LEADER });
  assert.strictEqual(r.status, 200); assert.strictEqual(r.body.canEdit, true); assert.deepStrictEqual(r.body.calendar.events, []); assert.strictEqual(r.body.school.name, "甲校");
  assert.strictEqual(r.body.defaults.reminder, 15);
  r = await call({ method: "POST", body: { domain: "a.edu", op: "save", event: timed }, user: "lead@a.edu", roles: LEADER });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  const e1 = r.body.event;
  assert.ok(/^e-/.test(e1.id) && e1.createdBy === "lead@a.edu" && e1.updatedAt === e1.createdAt, "the server gives it an id and records who made it");
  assert.strictEqual(blobs["crm/school-calendars/a.edu.json"].timezone, "", "no zone sent as the school's default: left unset");
  assert.strictEqual(audits.pop().action, "calendar.save");
  // editing keeps the creator and the id
  const changed = Object.assign({}, timed, { id: e1.id, title: "教师培训（改）" });
  await new Promise((s) => setTimeout(s, 5));
  r = await call({ method: "POST", body: { domain: "a.edu", op: "save", event: changed }, user: "lead2@a.edu", roles: LEADER });
  assert.strictEqual(r.body.calendar.events.length, 1, "same id: replaced, not added");
  assert.deepStrictEqual([r.body.event.title, r.body.event.createdBy, r.body.event.updatedBy], ["教师培训（改）", "lead@a.edu", "lead2@a.edu"]);
  // saving it again unchanged does not count as a change
  const stamp = r.body.event.updatedAt;
  await new Promise((s) => setTimeout(s, 5));
  r = await call({ method: "POST", body: { domain: "a.edu", op: "save", event: changed }, user: "lead3@a.edu", roles: LEADER });
  assert.strictEqual(r.body.event.updatedAt, stamp, "an unchanged save leaves updatedAt alone"); assert.strictEqual(r.body.event.updatedBy, "lead2@a.edu");
  // an invalid event is a 400 listing the problems and stores nothing
  r = await call({ method: "POST", body: { domain: "a.edu", op: "save", event: { title: "", start: "x" } }, user: "lead@a.edu", roles: LEADER });
  assert.strictEqual(r.status, 400); assert.ok(r.body.problems.length >= 2);
  assert.strictEqual(blobs["crm/school-calendars/a.edu.json"].events.length, 1);
  // the school's default zone
  r = await call({ method: "POST", body: { domain: "a.edu", op: "zone", timezone: "Nope/Zone" }, user: "lead@a.edu", roles: LEADER });
  assert.strictEqual(r.status, 400);
  r = await call({ method: "POST", body: { domain: "a.edu", op: "zone", timezone: "America/Los_Angeles" }, user: "lead@a.edu", roles: LEADER });
  assert.strictEqual(r.status, 200); assert.strictEqual(r.body.calendar.timezone, "America/Los_Angeles");
  r = await call({ query: { domain: "a.edu" }, user: "lead@a.edu", roles: LEADER });
  assert.strictEqual(r.body.defaults.timeZone, "America/Los_Angeles", "new events start in the school's zone");

  // ---- who may not edit ----
  for (const [who, roles] of [["it@a.edu", IT], ["hive.admin@fengchao.life", ["admin"]], ["sys@fengchao.life", SYS], ["lead@b.edu", ["domain_leader:b.edu"]]]) {
    r = await call({ method: "POST", body: { domain: "a.edu", op: "save", event: Object.assign({}, timed, { title: "overwrite" }) }, user: who, roles });
    assert.strictEqual(r.status, 403, who + " may not change a.edu's calendar");
  }
  r = await call({ method: "POST", body: { domain: "a.edu", op: "delete", id: e1.id }, user: "sys@fengchao.life", roles: SYS });
  assert.strictEqual(r.status, 403, "nor delete from it");
  assert.strictEqual(blobs["crm/school-calendars/a.edu.json"].events.length, 1, "untouched");
  // but they see it
  r = await call({ query: { domain: "a.edu" }, user: "it@a.edu", roles: IT });
  assert.strictEqual(r.status, 403, "the IT 管理员 does not even see it");
  r = await call({ query: { domain: "a.edu" }, user: "sys@fengchao.life", roles: SYS });
  assert.strictEqual(r.status, 200); assert.strictEqual(r.body.canEdit, false);
  r = await call({ query: { domain: "a.edu" }, user: "lead@b.edu", roles: ["domain_leader:b.edu"] });
  assert.strictEqual(r.status, 403, "another school's leader does not even see it");

  // ---- the Hive layer ----
  r = await call({ query: { layer: "hive" }, user: "lead@a.edu", roles: LEADER });
  assert.strictEqual(r.status, 403, "a 教育领袖 has no access to the Hive layer");
  r = await call({ method: "POST", body: { layer: "hive", op: "save", event: Object.assign({}, timed, { targets: ["a.edu"] }) }, user: "lead@a.edu", roles: LEADER });
  assert.strictEqual(r.status, 403);
  r = await call({ method: "POST", body: { layer: "hive", op: "save", event: Object.assign({}, timed, { title: "联合培训", targets: ["a.edu", "b.edu"] }) }, user: "sys@fengchao.life", roles: SYS });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  const h1 = r.body.event;
  r = await call({ method: "POST", body: { layer: "hive", op: "save", event: Object.assign({}, timed, { title: "全体通知", targets: ["*"] }) }, user: "sys@fengchao.life", roles: SYS });
  r = await call({ method: "POST", body: { layer: "hive", op: "save", event: Object.assign({}, timed, { title: "只给乙校", targets: ["b.edu"] }) }, user: "sys@fengchao.life", roles: SYS });
  assert.strictEqual(r.body.hive.events.length, 3);
  r = await call({ method: "POST", body: { layer: "hive", op: "save", event: timed }, user: "sys@fengchao.life", roles: SYS });
  assert.strictEqual(r.status, 400, "a Hive event must name its schools");
  assert.strictEqual(audits.filter((a) => a.target === "hive" && a.action === "calendar.save").length, 3);
  // a school sees the Hive events aimed at it, and only those
  r = await call({ query: { domain: "a.edu" }, user: "lead@a.edu", roles: LEADER });
  assert.deepStrictEqual(r.body.hive.events.map((e) => e.title).sort(), ["全体通知", "联合培训"], "a.edu sees its own and the all-schools ones, not 乙校's");
  assert.strictEqual(r.body.calendar.events.length, 1, "its own layer is unchanged by Hive's additions");
  assert.strictEqual(blobs["crm/school-calendars/a.edu.json"].events[0].title, "教师培训（改）");
  // a school cannot change a Hive event; the layers stay apart
  r = await call({ method: "POST", body: { domain: "a.edu", op: "delete", id: h1.id }, user: "lead@a.edu", roles: LEADER });
  assert.strictEqual(r.status, 404, "an id of the Hive layer is not in the school's layer");
  assert.strictEqual(blobs["crm/hive-calendar.json"].events.length, 3);
  // editing and deleting a Hive event
  r = await call({ method: "POST", body: { layer: "hive", op: "save", event: Object.assign({}, h1, { title: "联合培训 2", targets: ["b.edu"] }) }, user: "sys@fengchao.life", roles: SYS });
  assert.strictEqual(r.body.hive.events.length, 3); assert.deepStrictEqual(r.body.event.targets, ["b.edu"]);
  r = await call({ method: "POST", body: { layer: "hive", op: "delete", id: h1.id }, user: "sys@fengchao.life", roles: SYS });
  assert.strictEqual(r.status, 200); assert.strictEqual(r.body.hive.events.length, 2);
  r = await call({ method: "POST", body: { layer: "hive", op: "delete", id: h1.id }, user: "sys@fengchao.life", roles: SYS });
  assert.strictEqual(r.status, 404);
  // the school's own delete
  r = await call({ method: "POST", body: { domain: "a.edu", op: "delete", id: e1.id }, user: "lead@a.edu", roles: LEADER });
  assert.strictEqual(r.status, 200); assert.strictEqual(r.body.calendar.events.length, 0);
  assert.strictEqual(audits.pop().action, "calendar.delete");
  r = await call({ method: "POST", body: { domain: "a.edu", op: "nonsense" }, user: "lead@a.edu", roles: LEADER });
  assert.strictEqual(r.status, 400);
  // a calendar holds a bounded number of events
  const doc = { events: [] };
  for (let i = 0; i < CAL.LIMITS.events; i++) CAL.putEvent(doc, CAL.cleanEvent({ title: "e" + i, start: "2026-10-20", allDay: true }, "school"), "x", "2026-10-16T00:00:00Z");
  assert.throws(() => CAL.putEvent(doc, CAL.cleanEvent({ title: "one more", start: "2026-10-20", allDay: true }, "school"), "x", "2026-10-16T00:00:00Z"), (e) => e.status === 400);
  console.log("calendar: all assertions passed");
})().catch((e) => { console.error(e); process.exit(1); });
