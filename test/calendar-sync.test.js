// 校历 step 2 (api/shared/calendarSync.js + the sync operations of api/calendar): the events of a
// layer written into the accounts' default calendars through Microsoft Graph (faked here), kept in a
// record so that changes, deletions and withdrawals reach exactly what was written.
//
// Run with:  node test/calendar-sync.test.js
const assert = require("assert");
const path = require("path");
const Module = require("module");
const realResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) { if (request === "@azure/storage-blob") return "@azure/storage-blob"; return realResolve.call(this, request, parent, ...rest); };
require.cache["@azure/storage-blob"] = { id: "@azure/storage-blob", filename: "@azure/storage-blob", loaded: true, exports: { BlobServiceClient: { fromConnectionString() { throw new Error("no storage in test"); } } } };
delete process.env.STORAGE_CONNECTION_STRING;
process.env.HIVE_ADMINS = "hive.admin@fengchao.life";
const R = (...p) => path.join(__dirname, "..", ...p);

const blobs = {};
const copy = (x) => JSON.parse(JSON.stringify(x));
const jsonstore = require(R("api", "shared", "jsonstore.js"));
jsonstore.read = async (name, fallback) => (blobs[name] ? copy(blobs[name]) : (typeof fallback === "function" ? fallback() : copy(fallback)));
jsonstore.write = async (name, doc) => { blobs[name] = copy(doc); };
jsonstore.update = async (name, fallback, mutate) => { const doc = await jsonstore.read(name, fallback); const result = await mutate(doc); if (result !== false) blobs[name] = copy(doc); return { doc, result, written: result !== false }; };

// The school's accounts (the directory cache) and People Hub identities.
const USERS = [
  { upn: "t1@a.edu", enabled: true, department: "老师", plan: "faculty" },
  { upn: "s1@a.edu", enabled: true, department: "", plan: "student" },
  { upn: "p1@a.edu", enabled: true, department: "", plan: "faculty" },
  { upn: "nomail@a.edu", enabled: true, department: "", plan: "student" },
  { upn: "off@a.edu", enabled: false, department: "", plan: "student" },
];
const dir = require(R("api", "shared", "directory.js"));
let directory = { domain: "a.edu", users: USERS };
dir.readDomain = async (d) => (d === "a.edu" ? directory : { domain: d, users: [] });
const people = require(R("api", "shared", "people.js"));
people.readPeople = async () => ({ people: {} });
people.readInstitutions = async () => ({ institutions: { "a.edu": { name: "甲校", nameEn: "School A" } } });

// Microsoft Graph, faked: every mailbox keeps its events; a `nomail` account answers 404, `denied` makes everything 403.
const graphMod = require(R("api", "shared", "graph.js"));
const mail = {}; let seq = 0, denied = false; const calls = [];
const gerr = (status, code, message) => Object.assign(new Error(`Graph ${status}: ${code} ${message || ""}`), { status, code });
graphMod.graph = async (method, p, body) => {
  calls.push({ method, p, body });
  if (denied) throw gerr(403, "ErrorAccessDenied", "Access is denied.");
  const m = /^\/users\/([^/]+)\/(calendar\/events|events\/(.+))$/.exec(p);
  assert.ok(m, "unexpected Graph path " + p);
  const upn = decodeURIComponent(m[1]);
  if (/^nomail@/.test(upn)) throw gerr(404, "MailboxNotEnabledForRESTAPI", "The mailbox is either inactive, soft-deleted, or is hosted on-premise.");
  const box = (mail[upn] = mail[upn] || { events: {}, tx: {} });
  if (method === "POST") {
    if (body.transactionId && box.tx[body.transactionId]) return box.events[box.tx[body.transactionId]];
    const id = "AAMk-" + (++seq); box.events[id] = Object.assign({ id }, body); if (body.transactionId) box.tx[body.transactionId] = id; return box.events[id];
  }
  const id = decodeURIComponent(m[3]);
  if (!box.events[id]) throw gerr(404, "ErrorItemNotFound", "The specified object was not found in the store.");
  if (method === "PATCH") { Object.assign(box.events[id], body); return box.events[id]; }
  if (method === "DELETE") { delete box.events[id]; return null; }
  throw new Error("method " + method);
};

const CAL = require(R("api", "shared", "calendar.js"));
const SYNC = require(R("api", "shared", "calendarSync.js"));
const session = require(R("api", "shared", "session.js"));
session.guard = async (context, req) => { if (req.headers && req.headers["x-ms-client-principal"]) return { u: "x" }; context.res = { status: 403, body: { code: "signed_out" } }; return null; };
session.finish = () => {};
require(R("api", "shared", "roles.js")).readRoles = async () => ({ entries: [] });
const audits = []; require(R("api", "shared", "audit.js")).audit = async (ctx, e) => { audits.push(e); };
const fn = require(R("api", "calendar", "index.js"));
const principal = (user, roles) => Buffer.from(JSON.stringify({ identityProvider: "aad", userId: "x", userDetails: user, userRoles: ["anonymous", "authenticated"].concat(roles || []) })).toString("base64");
async function call({ method = "POST", query = {}, body = null, user, roles }) {
  const context = { log: Object.assign(() => {}, { error() {}, warn() {} }), res: null };
  await fn(context, { method, query, body, headers: user ? { "x-ms-client-principal": principal(user, roles) } : {} });
  return context.res;
}
const LEADER = ["domain_leader:a.edu"], IT = ["domain_it:a.edu"], SYS = ["staff:sysadmin"];
const lead = (body) => call({ body: Object.assign({ domain: "a.edu" }, body), user: "lead@a.edu", roles: LEADER });
const boxes = (cat) => Object.fromEntries(Object.entries(mail).map(([u, b]) => [u, Object.values(b.events).filter((e) => !cat || (e.categories || [])[0] === cat).map((e) => e.subject)]));
const allOf = async (body) => { // what the page does: fresh first, then repeat until nothing remains (or nothing moves)
  let r = await lead(Object.assign({ op: "sync", fresh: true }, body)); assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  for (let i = 0; i < 20 && r.body.remaining > 0 && (r.body.done > 0); i++) { r = await lead(Object.assign({ op: "sync" }, body)); assert.strictEqual(r.status, 200, JSON.stringify(r.body)); }
  return r.body;
};

(async () => {
  // ---- the body written into a calendar ----
  const allDay = CAL.cleanEvent({ title: "放假", allDay: true, start: "2026-11-26", end: "2026-11-27", timeZone: "America/Chicago", link: "https://zoom.us/j/1", description: "Line 1\nLine <2>", reminder: null }, "school");
  const b1 = SYNC.graphBody(allDay, "school");
  assert.deepStrictEqual([b1.isAllDay, b1.start.dateTime, b1.end.dateTime, b1.start.timeZone, b1.categories, b1.showAs, b1.isReminderOn], [true, "2026-11-26T00:00:00", "2026-11-28T00:00:00", "Central Standard Time", ["校历"], "free", false], "an all-day event ends at midnight AFTER its last day (the page's end date is inclusive)");
  assert.ok(!("reminderMinutesBeforeStart" in b1), "no reminder: none sent");
  assert.ok(b1.body.content.includes('href="https://zoom.us/j/1"') && b1.body.content.includes("Line 1<br>Line &lt;2&gt;"), "the link and the escaped description are in the body: " + b1.body.content);
  assert.strictEqual(b1.location.displayName, "https://zoom.us/j/1", "no place given: the link shows as the location");
  const timed = CAL.cleanEvent({ title: "培训", start: "2026-12-05T19:00", end: "2026-12-05T20:30", timeZone: "America/New_York", location: "Room 3", reminder: 30, showAs: "busy", targets: ["a.edu"] }, "hive");
  const b2 = SYNC.graphBody(timed, "hive");
  assert.deepStrictEqual([b2.start.dateTime, b2.end.dateTime, b2.start.timeZone, b2.categories, b2.showAs, b2.reminderMinutesBeforeStart, b2.location.displayName], ["2026-12-05T19:00:00", "2026-12-05T20:30:00", "Eastern Standard Time", ["系统广播"], "busy", 30, "Room 3"]);
  assert.strictEqual(SYNC.graphBody(Object.assign({}, timed, { timeZone: "Europe/Paris" }), "hive").start.timeZone, "Europe/Paris", "a zone without a Windows name is sent as it is");
  assert.strictEqual(SYNC.guid("a|b|c"), SYNC.guid("a|b|c")); assert.notStrictEqual(SYNC.guid("a|b|c"), SYNC.guid("a|b|d"));
  assert.ok(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(SYNC.guid("x")));

  // ---- who may sync ----
  let r = await call({ body: { domain: "a.edu", op: "syncplan" }, user: "it@a.edu", roles: IT });
  assert.strictEqual(r.status, 403, "the IT 管理员 has no part in it");
  r = await call({ body: { domain: "a.edu", op: "sync" }, user: "sys@fengchao.life", roles: SYS });
  assert.strictEqual(r.status, 403, "the system administrator does not sync a school's own calendar");
  r = await call({ body: { domain: "a.edu", op: "sync" }, user: "lead@b.edu", roles: ["domain_leader:b.edu"] });
  assert.strictEqual(r.status, 403, "nor another school's leader");
  r = await call({ body: { layer: "hive", domain: "a.edu", op: "sync" }, user: "lead@a.edu", roles: LEADER });
  assert.strictEqual(r.status, 403, "a leader does not push Hive events");

  // ---- the school's calendar: two events, one for everyone, one for teachers ----
  const mk = async (ev) => (await lead({ op: "save", event: ev })).body.event;
  const E1 = await mk({ title: "放假", allDay: true, start: "2026-11-26", end: "2026-11-27", timeZone: "America/Chicago", link: "https://zoom.us/j/1" });
  const E2 = await mk({ title: "教师培训", start: "2026-12-05T19:00", end: "2026-12-05T20:30", timeZone: "America/Chicago", audience: ["老师"], reminder: 30 });
  r = await lead({ op: "syncplan" });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.deepStrictEqual(r.body.counts, { create: 5, update: 0, delete: 0 }, "放假 for the 4 enabled accounts + 教师培训 for the one teacher; the disabled account gets nothing: " + JSON.stringify(r.body.counts));
  assert.strictEqual(r.body.accounts, 4); assert.strictEqual(r.body.events, 2); assert.strictEqual(Object.keys(mail).length, 0, "a plan writes nothing");

  // ---- a run in small batches: the page repeats until nothing remains ----
  r = await lead({ op: "sync", fresh: true, limit: 2 });
  assert.strictEqual(r.body.done, 2); assert.strictEqual(r.body.remaining, 3, "two done, three to go");
  const first = await allOf({});
  assert.strictEqual(first.remaining, 0);
  assert.deepStrictEqual(first.failed.map((f) => [f.upn, f.reason, f.title]), [["nomail@a.edu", "no_mailbox", "放假"]], "an account without a mailbox is named, not silently skipped");
  assert.deepStrictEqual(Object.keys(mail).sort(), ["p1@a.edu", "s1@a.edu", "t1@a.edu"], "only enabled accounts with a mailbox got anything");
  assert.deepStrictEqual(boxes("校历")["t1@a.edu"].sort(), ["放假", "教师培训"].sort(), "the teacher has both");
  assert.deepStrictEqual(boxes("校历")["s1@a.edu"], ["放假"], "a student only the all-school event");
  const posted = calls.filter((c) => c.method === "POST" && /t1%40a\.edu|t1@a\.edu/.test(c.p));
  assert.ok(posted.length === 2 && posted.every((c) => c.body.transactionId), "each creation carries a transactionId");
  const rec = blobs["crm/calendar-sync/a.edu.json"];
  assert.strictEqual(Object.keys(rec.items["school:" + E1.id]).length, 3, "the record keeps which Outlook event belongs to which account");

  // ---- 我的校历 (Rick, 2026-10-18): any account sees what it gets, read-only, with whether it is written yet ----
  r = await call({ method: "GET", query: { mine: "1" }, user: "s1@a.edu", roles: [] });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.deepStrictEqual([r.body.layer, r.body.domain, r.body.canEdit, r.body.school.name], ["mine", "a.edu", false, "甲校"]);
  assert.deepStrictEqual(r.body.calendar.events.map((e) => [e.title, e.published]), [["放假", true]], "a student gets the all-school event, written already, not the teachers' training");
  r = await call({ method: "GET", query: { mine: "1" }, user: "t1@a.edu", roles: [] });
  assert.deepStrictEqual(r.body.calendar.events.map((e) => [e.title, e.published]).sort(), [["放假", true], ["教师培训", true]], "a teacher gets both");
  r = await call({ method: "GET", query: { mine: "1" }, user: "nomail@a.edu", roles: [] });
  assert.deepStrictEqual(r.body.calendar.events.map((e) => [e.title, e.published]), [["放假", false]], "no copy written yet → not published");
  const E3 = await mk({ title: "家长会", start: "2026-12-10T19:00", end: "2026-12-10T20:00", timeZone: "America/Chicago", audience: ["家长"] });
  r = await call({ method: "GET", query: { mine: "1" }, user: "p1@a.edu", roles: [] });
  assert.deepStrictEqual(r.body.calendar.events.map((e) => [e.title, e.published]).sort(), [["家长会", false], ["放假", true]], "a new, unpublished event shows as not published");
  await lead({ op: "delete", id: E3.id });
  assert.ok(rec.failures[`school:${E1.id}|nomail@a.edu`], "the failure is kept");
  // nothing more to do; running again changes nothing
  const before = calls.length;
  r = await lead({ op: "sync" }); assert.strictEqual(r.body.done, 0); assert.strictEqual(calls.length, before, "idempotent: no Graph call when nothing changed");
  assert.ok(audits.some((a) => a.action === "calendar.sync" && a.target === "a.edu" && a.layer === "school"), "audited");

  // ---- the event changes → the copies are updated, not duplicated ----
  await mk(Object.assign({}, E1, { title: "放假（改）" }));
  r = await lead({ op: "syncplan" }); assert.deepStrictEqual(r.body.counts, { create: 0, update: 3, delete: 0 });
  await allOf({});
  assert.deepStrictEqual(boxes("校历")["s1@a.edu"], ["放假（改）"]); assert.strictEqual(Object.values(mail["t1@a.edu"].events).length, 2, "still two, not three");
  // a failed account is tried again at the start of the next run (fresh), and fails again with its reason
  r = await lead({ op: "sync", fresh: true }); assert.strictEqual(r.body.failed.length, 1); assert.strictEqual(r.body.failed[0].reason, "no_mailbox");

  // ---- a person deletes their own copy: it is not put back ----
  delete mail["s1@a.edu"].events[Object.keys(mail["s1@a.edu"].events)[0]];
  await mk(Object.assign({}, E1, { title: "放假（再改）" }));
  await allOf({});
  assert.deepStrictEqual(boxes("校历")["s1@a.edu"], [], "the student's deleted copy stays deleted");
  assert.deepStrictEqual(boxes("校历")["p1@a.edu"], ["放假（再改）"], "the others were updated");
  r = await lead({ op: "syncplan" }); assert.strictEqual(r.body.gone, 1); assert.strictEqual(r.body.remaining, 0);

  // ---- the audience narrows / the event is deleted → what was written is removed ----
  await mk(Object.assign({}, E1, { title: "放假（再改）", audience: ["老师"] }));
  r = await lead({ op: "syncplan" }); assert.strictEqual(r.body.counts.delete, 2, "the parent and the (already gone) student copy are no longer wanted: " + JSON.stringify(r.body.counts));
  await allOf({});
  assert.deepStrictEqual(boxes("校历")["p1@a.edu"], [], "the parent's copy is removed"); assert.deepStrictEqual(boxes("校历")["t1@a.edu"].sort(), ["放假（再改）", "教师培训"].sort());
  assert.ok(!blobs["crm/calendar-sync/a.edu.json"].items["school:" + E1.id]["p1@a.edu"], "and forgotten in the record");
  r = await lead({ op: "delete", id: E2.id });
  r = await lead({ op: "syncplan" }); assert.deepStrictEqual(r.body.counts, { create: 0, update: 0, delete: 1 });
  await allOf({});
  assert.deepStrictEqual(boxes("校历")["t1@a.edu"], ["放假（再改）"], "a deleted event leaves the calendar");

  // ---- the system administrator's Hive layer goes into the same calendars, apart ----
  const hiveEv = (await call({ body: { layer: "hive", op: "save", event: { title: "联合培训", start: "2026-12-12T19:00", end: "2026-12-12T20:00", timeZone: "America/New_York", targets: ["a.edu"], link: "https://teams.microsoft.com/l/meetup-join/x" } }, user: "sys@fengchao.life", roles: SYS })).body.event;
  const sys = (body) => call({ body: Object.assign({ layer: "hive", domain: "a.edu" }, body), user: "sys@fengchao.life", roles: SYS });
  r = await sys({ op: "syncplan" }); assert.strictEqual(r.status, 200); assert.deepStrictEqual(r.body.counts, { create: 4, update: 0, delete: 0 }, "everyone of the school: " + JSON.stringify(r.body));
  r = await sys({ op: "sync", fresh: true }); assert.strictEqual(r.status, 200); assert.strictEqual(r.body.remaining, 0);
  assert.deepStrictEqual(boxes("系统广播")["t1@a.edu"], ["联合培训"], "the Hive event is in the calendar, as its own category");
  assert.deepStrictEqual(boxes("校历")["t1@a.edu"], ["放假（再改）"], "the school's own events were not touched");
  r = await call({ body: { layer: "hive", domain: "a.edu", op: "sync" }, user: "it@a.edu", roles: IT }); assert.strictEqual(r.status, 403, "only the system administrator pushes Hive events");
  // the school's withdrawal takes only the school layer
  r = await lead({ op: "withdraw", fresh: true }); assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(boxes("校历")["t1@a.edu"], [], "the school's events are withdrawn"); assert.deepStrictEqual(boxes("系统广播")["t1@a.edu"], ["联合培训"], "Hive's stay");
  assert.ok(audits.some((a) => a.action === "calendar.withdraw"));
  // after a withdrawal the calendar still has its events: the next plan wants them again
  r = await lead({ op: "syncplan" }); assert.ok(r.body.counts.create >= 1);
  // the Hive event is aimed elsewhere: the school's copies are withdrawn by the next push
  await call({ body: { layer: "hive", op: "save", event: Object.assign({}, hiveEv, { targets: ["b.edu"] }) }, user: "sys@fengchao.life", roles: SYS });
  r = await sys({ op: "syncplan" }); assert.strictEqual(r.body.counts.delete, 3, "the three that were written (the mailbox-less account got nothing)");
  await sys({ op: "sync", fresh: true });
  assert.deepStrictEqual(boxes("系统广播")["t1@a.edu"], [], "no longer aimed at the school: removed");

  // ---- the test run: only the accounts named ----
  const only = ["t1@a.edu"];
  r = await lead({ op: "syncplan", only }); assert.deepStrictEqual(r.body.counts, { create: 1, update: 0, delete: 0 }, JSON.stringify(r.body));
  r = await lead({ op: "sync", fresh: true, only: "t1@a.edu, nobody@other.edu" }); assert.strictEqual(r.status, 400, "an account of another school is refused");
  r = await lead({ op: "sync", fresh: true, only: "t1@a.edu" }); assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(boxes("校历")["t1@a.edu"], ["放假（再改）"], "the named account got the events");
  assert.deepStrictEqual(boxes("校历")["p1@a.edu"], [], "the others got nothing");

  // ---- no write access yet (Exchange RBAC missing / not in effect): the run stops and says why ----
  await mk(Object.assign({}, E1, { title: "放假（再改）", audience: [] })); denied = true;
  r = await lead({ op: "sync", fresh: true, only: "p1@a.edu" });
  assert.strictEqual(r.status, 403); assert.strictEqual(r.body.code, "app_permission"); assert.ok(/Application Calendars\.ReadWrite/.test(r.body.error));
  assert.ok(!Object.keys(blobs["crm/calendar-sync/a.edu.json"].failures).some((k) => k.endsWith("|p1@a.edu")), "a refusal is not recorded as that account's failure");
  denied = false;
  r = await lead({ op: "sync", fresh: true, only: "p1@a.edu" }); assert.strictEqual(r.status, 200, "and works once the permission is there");

  // ---- no account list yet ----
  directory = { domain: "a.edu", users: [] };
  r = await lead({ op: "syncplan" }); assert.strictEqual(r.status, 409); assert.strictEqual(r.body.code, "no_accounts");
  console.log("calendar-sync: all assertions passed");
})().catch((e) => { console.error(e); process.exit(1); });
