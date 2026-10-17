// 校历: who gets an event (Rick, 2026-10-17) — schools, roles, Teams and named accounts of any school, on the
// Hive layer (system administrator, 教育社区经理, 课程总监) and, within one school, on the school's calendar.
//
// Run with:  node test/calendar-audience.test.js
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

const TEAM = "11111111-1111-1111-1111-111111111111", TEAM2 = "22222222-2222-2222-2222-222222222222";
const g = (id, name, kind) => ({ id, name, kind: kind || "team" });
const DIRS = {
  "a.edu": { domain: "a.edu", users: [
    { upn: "t1@a.edu", displayName: "T One", enabled: true, department: "老师", plan: "faculty", groups: [g(TEAM, "Grade 5 Team")] },
    { upn: "s1@a.edu", displayName: "S One", enabled: true, plan: "student", groups: [g(TEAM, "Grade 5 Team"), g("33333333-3333-3333-3333-333333333333", "A-mail list", "distribution")] },
    { upn: "p1@a.edu", displayName: "P One", enabled: true, plan: "faculty", groups: [] },
    { upn: "p2@a.edu", displayName: "P Two", enabled: true, plan: "faculty", groups: [g(TEAM2, "Choir", "class")] },
    { upn: "off@a.edu", displayName: "Off", enabled: false, plan: "student", groups: [] },
  ] },
  "b.edu": { domain: "b.edu", users: [
    { upn: "t2@b.edu", displayName: "T Two", enabled: true, department: "老师", plan: "faculty", groups: [] },
    { upn: "p3@b.edu", displayName: "P Three", enabled: true, plan: "faculty", groups: [] },
    { upn: "s2@b.edu", displayName: "S Two", enabled: true, plan: "student", groups: [g(TEAM, "Grade 5 Team")] },
  ] },
};
const dir = require(R("api", "shared", "directory.js"));
dir.readDomain = async (d) => DIRS[d] || { domain: d, users: [] };
dir.cachedDomains = async () => [{ domain: "a.edu" }, { domain: "b.edu" }];
const peopleMod = require(R("api", "shared", "people.js"));
peopleMod.readPeople = async () => ({ people: { "p1@a.edu": { identity: "家长" }, "p2@a.edu": { identity: "家长" }, "p3@b.edu": { identity: "家长" } } });
peopleMod.readInstitutions = async () => ({ institutions: {} });

const graphMod = require(R("api", "shared", "graph.js"));
const mail = {}; let seq = 0;
graphMod.graph = async (method, p, body) => {
  const m = /^\/users\/([^/]+)\/(calendar\/events|events\/(.+))$/.exec(p);
  assert.ok(m, "unexpected Graph path " + p);
  const upn = decodeURIComponent(m[1]);
  const box = (mail[upn] = mail[upn] || { events: {}, tx: {} });
  if (method === "POST") { if (body.transactionId && box.tx[body.transactionId]) return box.events[box.tx[body.transactionId]]; const id = "AAMk-" + (++seq); box.events[id] = Object.assign({ id }, body); if (body.transactionId) box.tx[body.transactionId] = id; return box.events[id]; }
  const id = decodeURIComponent(m[3]);
  if (!box.events[id]) throw Object.assign(new Error("gone"), { status: 404, code: "ErrorItemNotFound" });
  if (method === "PATCH") { Object.assign(box.events[id], body); return box.events[id]; }
  delete box.events[id]; return null;
};

const CAL = require(R("api", "shared", "calendar.js"));
const SYNC = require(R("api", "shared", "calendarSync.js"));
const session = require(R("api", "shared", "session.js"));
session.guard = async (context, req) => { if (req.headers && req.headers["x-ms-client-principal"]) return { u: "x" }; context.res = { status: 403, body: { code: "signed_out" } }; return null; };
session.finish = () => {};
require(R("api", "shared", "roles.js")).readRoles = async () => ({ entries: [] });
require(R("api", "shared", "audit.js")).audit = async () => {};
const fn = require(R("api", "calendar", "index.js"));
const principal = (user, roles) => Buffer.from(JSON.stringify({ identityProvider: "aad", userId: "x", userDetails: user, userRoles: ["anonymous", "authenticated"].concat(roles || []) })).toString("base64");
async function call({ method = "POST", query = {}, body = null, user, roles }) {
  const context = { log: Object.assign(() => {}, { error() {}, warn() {} }), res: null };
  await fn(context, { method, query, body, headers: user ? { "x-ms-client-principal": principal(user, roles) } : {} });
  return context.res;
}
const LEADER = ["domain_leader:a.edu"], IT = ["domain_it:a.edu"], SYS = ["staff:sysadmin"], COMM = ["staff:community"], CURR = ["staff:curriculum"], FIN = ["staff:finance"];
const lead = (body) => call({ body: Object.assign({ domain: "a.edu" }, body), user: "lead@a.edu", roles: LEADER });
const comm = (body) => call({ body: Object.assign({ layer: "hive" }, body), user: "comm@fengchao.life", roles: COMM });
const boxes = (cat) => Object.fromEntries(Object.entries(mail).map(([u, b]) => [u, Object.values(b.events).filter((e) => !cat || (e.categories || [])[0] === cat).map((e) => e.subject)]));
const timed = { title: "通知", start: "2026-12-05T19:00", end: "2026-12-05T20:00", timeZone: "Asia/Shanghai" };
const sorted = (s) => Array.from(s).sort();
const accts = async (d) => SYNC.accountsOf(d, { lenient: true });

(async () => {
  // ---- the event: roles, teams and named accounts are cleaned ----
  let e = CAL.cleanEvent(Object.assign({}, timed, { teams: [{ id: TEAM.toUpperCase(), name: "Grade 5 Team" }, { id: TEAM, name: "dup" }], people: "A@b.edu, a@b.edu;c@d.org" }), "hive");
  assert.deepStrictEqual(e.teams, [{ id: TEAM, name: "Grade 5 Team" }], "team ids are lower-cased and de-duplicated");
  assert.deepStrictEqual(e.people, ["a@b.edu", "c@d.org"], "named accounts are lower-cased, de-duplicated, and may be typed in a line");
  assert.strictEqual(CAL.cleanEvent(Object.assign({}, timed, { people: ["x@a.edu"] }), "hive").targets.length, 0, "a Hive event may be for named people only");
  assert.strictEqual(CAL.cleanEvent(Object.assign({}, timed, { audience: ["家长"] }), "hive").audience[0], "家长", "or for a role everywhere");
  assert.throws(() => CAL.cleanEvent(timed, "hive"), (er) => /choose who it is for/.test(er.problems.join()));
  assert.throws(() => CAL.cleanEvent(Object.assign({}, timed, { people: ["not an address"] }), "school"), (er) => /not an account address/.test(er.problems.join()));
  assert.throws(() => CAL.cleanEvent(Object.assign({}, timed, { teams: [{ id: "x" }] }), "school"), (er) => /valid id/.test(er.problems.join()));

  // ---- who gets it, school by school ----
  const A = await accts("a.edu"), B = await accts("b.edu");
  const rec = (ev, layer, d) => sorted(SYNC.recipientsOf(CAL.cleanEvent(Object.assign({}, timed, ev), layer), layer, d, d === "a.edu" ? A : B));
  assert.deepStrictEqual(rec({}, "school", "a.edu"), ["p1@a.edu", "p2@a.edu", "s1@a.edu", "t1@a.edu"], "school layer: everyone enabled");
  assert.deepStrictEqual(rec({ audience: ["家长"] }, "school", "a.edu"), ["p1@a.edu", "p2@a.edu"], "narrowed by role");
  assert.deepStrictEqual(rec({ teams: [{ id: TEAM, name: "" }] }, "school", "a.edu"), ["s1@a.edu", "t1@a.edu"], "narrowed by team");
  assert.deepStrictEqual(rec({ audience: ["老师"], teams: [{ id: TEAM, name: "" }] }, "school", "a.edu"), ["t1@a.edu"], "role AND team");
  assert.deepStrictEqual(rec({ audience: ["老师"], people: ["p1@a.edu", "t2@b.edu"] }, "school", "a.edu"), ["p1@a.edu", "t1@a.edu"], "named accounts are added; another school's are not this school's business");
  assert.deepStrictEqual(rec({ targets: ["*"], audience: ["家长"] }, "hive", "a.edu").concat(rec({ targets: ["*"], audience: ["家长"] }, "hive", "b.edu")), ["p1@a.edu", "p2@a.edu", "p3@b.edu"], "parents of every school");
  assert.deepStrictEqual(rec({ targets: ["a.edu"], audience: ["家长"] }, "hive", "b.edu"), [], "a school not chosen gets nothing");
  assert.deepStrictEqual(rec({ audience: ["家长"] }, "hive", "b.edu"), ["p3@b.edu"], "no school chosen + a role = every school");
  assert.deepStrictEqual(rec({ teams: [{ id: TEAM, name: "" }] }, "hive", "a.edu").concat(rec({ teams: [{ id: TEAM, name: "" }] }, "hive", "b.edu")), ["s1@a.edu", "t1@a.edu", "s2@b.edu"], "a team reaches its members in every school");
  assert.deepStrictEqual(rec({ targets: ["a.edu"], audience: ["家长"], people: ["t2@b.edu"] }, "hive", "b.edu"), ["t2@b.edu"], "named people of a school that was not chosen still get it");
  assert.deepStrictEqual(rec({ people: ["t2@b.edu"] }, "hive", "a.edu"), [], "named people only: the other school gets nothing");

  // ---- who may use the Hive layer ----
  let r = await call({ method: "GET", query: { layer: "hive" }, user: "comm@fengchao.life", roles: COMM }); assert.strictEqual(r.status, 200, "教育社区经理 sees the Hive layer");
  r = await call({ method: "GET", query: { layer: "hive" }, user: "cur@fengchao.life", roles: CURR }); assert.strictEqual(r.status, 200, "课程总监 too");
  for (const [u, roles, why] of [["lead@a.edu", LEADER, "a school leader"], ["it@a.edu", IT, "the IT 管理员"], ["fin@fengchao.life", FIN, "another staff function"]]) {
    r = await call({ method: "GET", query: { layer: "hive" }, user: u, roles }); assert.strictEqual(r.status, 403, why + " has no part in the Hive layer");
  }
  r = await comm({ op: "save", event: Object.assign({}, timed, { audience: ["家长"], targets: ["*"] }) }); assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  const HID = r.body.event.id;

  // ---- the lists the form picks from ----
  r = await call({ method: "GET", query: { layer: "hive", lookup: "audience" }, user: "comm@fengchao.life", roles: COMM });
  assert.strictEqual(r.status, 200); assert.strictEqual(r.body.people.length, 7, "every enabled account of both schools (the disabled one is left out)");
  assert.ok(r.body.people.some((p) => p.u === "t2@b.edu" && p.d === "b.edu" && p.n === "T Two" && p.i === "老师"));
  const tix = (u) => r.body.people.find((p) => p.u === u).t.map((i) => r.body.teams[i].name);
  assert.deepStrictEqual([tix("s1@a.edu"), tix("p2@a.edu"), tix("p1@a.edu")], [["Grade 5 Team"], ["Choir"], []], "each account carries the numbers of its Teams");
  assert.deepStrictEqual(r.body.teams.map((t) => [t.name, t.kind, t.count, t.domains.join("+")]), [["Choir", "class", 1, "a.edu"], ["Grade 5 Team", "team", 3, "a.edu+b.edu"]], "only Teams and classes, merged across schools, with their members counted");
  r = await call({ method: "GET", query: { domain: "a.edu", lookup: "audience" }, user: "lead@a.edu", roles: LEADER });
  assert.strictEqual(r.status, 200); assert.ok(r.body.people.every((p) => p.d === "a.edu"), "a school's leader is offered that school's people only");
  r = await call({ method: "GET", query: { domain: "b.edu", lookup: "audience" }, user: "lead@a.edu", roles: LEADER }); assert.strictEqual(r.status, 403);
  r = await call({ method: "GET", query: { domain: "a.edu", lookup: "audience" }, user: "sys@fengchao.life", roles: SYS }); assert.strictEqual(r.status, 403, "the system administrator does not edit a school's calendar, so is not offered its list");

  // ---- named accounts are checked ----
  r = await lead({ op: "save", event: Object.assign({}, timed, { audience: ["老师"], people: ["p1@a.edu"] }) }); assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.deepStrictEqual(r.body.event.people, ["p1@a.edu"]);
  r = await lead({ op: "save", event: Object.assign({}, timed, { people: ["t2@b.edu"] }) }); assert.strictEqual(r.status, 400, "a school leader cannot name another school's accounts");
  assert.ok(/Admin broadcast/.test(r.body.problems.join()), r.body.problems.join());
  r = await comm({ op: "save", event: Object.assign({}, timed, { people: ["ghost@a.edu"] }) }); assert.strictEqual(r.status, 400); assert.ok(/no such account/.test(r.body.problems.join()));
  r = await comm({ op: "save", event: Object.assign({}, timed, { people: ["x@c.edu"] }) }); assert.strictEqual(r.status, 400); assert.ok(/not one of the schools/.test(r.body.problems.join()));
  r = await comm({ op: "save", event: Object.assign({}, timed, { title: "只给两位", people: ["t2@b.edu", "p1@a.edu"] }) }); assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  const PID = r.body.event.id;
  r = await comm({ op: "save", event: Object.assign({}, timed, { title: "五年级群" , teams: [{ id: TEAM, name: "Grade 5 Team" }] }) }); assert.strictEqual(r.status, 200, JSON.stringify(r.body));

  // ---- publishing across schools ----
  r = await comm({ op: "syncdomains" }); assert.deepStrictEqual(r.body.domains, ["a.edu", "b.edu"]);
  r = await comm({ op: "syncdomains", only: "t2@b.edu" }); assert.deepStrictEqual(r.body.domains, ["b.edu"], "a test run for one account visits only its school");
  for (const d of ["a.edu", "b.edu"]) {
    r = await comm({ domain: d, op: "syncplan" }); assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    let rr = await comm({ domain: d, op: "sync", fresh: true }); assert.strictEqual(rr.status, 200, JSON.stringify(rr.body)); assert.strictEqual(rr.body.remaining, 0);
  }
  const got = (u) => (boxes("管理员广播")[u] || []).sort();
  assert.deepStrictEqual(got("p1@a.edu"), ["只给两位", "通知"].sort(), "the parent: the notice for parents + the named-people event");
  assert.deepStrictEqual(got("p3@b.edu"), ["通知"], "the other school's parent: the notice only");
  assert.deepStrictEqual(got("t2@b.edu"), ["只给两位"], "named across schools");
  assert.deepStrictEqual(got("t1@a.edu"), ["五年级群"], "the team's teacher");
  assert.deepStrictEqual(got("s2@b.edu"), ["五年级群"], "and its member in the other school");
  assert.deepStrictEqual(got("s1@a.edu"), ["五年级群"]);
  assert.deepStrictEqual(boxes("校历")["t1@a.edu"] || [], [], "nothing of the school layer was published by this");

  // ---- narrowing the event withdraws it from those who no longer match ----
  const old = (await call({ method: "GET", query: { layer: "hive" }, user: "comm@fengchao.life", roles: COMM })).body.hive.events.find((x) => x.id === HID);
  await comm({ op: "save", event: Object.assign({}, old, { targets: ["a.edu"] }) });
  r = await comm({ domain: "b.edu", op: "syncplan" }); assert.strictEqual(r.body.counts.delete, 1, JSON.stringify(r.body.counts));
  await comm({ domain: "b.edu", op: "sync", fresh: true });
  assert.deepStrictEqual(got("p3@b.edu"), [], "the notice left the school it no longer goes to");
  assert.deepStrictEqual(got("p1@a.edu"), ["只给两位", "通知"].sort(), "and stayed where it still goes");
  await comm({ op: "delete", id: PID });
  r = await comm({ domain: "a.edu", op: "syncplan" }); assert.strictEqual(r.body.counts.delete, 1, "a deleted event is removed from the named person's calendar");
  // ---- 广播名单: accounts that do not receive 管理员广播 ----
  const optout = (body, user, roles) => call({ body: Object.assign({ op: "optout" }, body), user, roles });
  const IT_B = ["domain_it:b.edu"];
  r = await optout({ upn: "p3@b.edu", on: true, reason: "x" }, "lead@a.edu", LEADER); assert.strictEqual(r.status, 403, "a school leader keeps only their own school's list");
  r = await optout({ upn: "s1@a.edu", on: true, reason: "x" }, "lead@a.edu", LEADER); assert.strictEqual(r.status, 200, "and may keep their own school's");
  r = await optout({ upn: "s1@a.edu", on: false }, "lead@a.edu", LEADER); assert.strictEqual(r.status, 200);
  r = await call({ method: "GET", query: { optout: "1", domain: "a.edu" }, user: "lead@a.edu", roles: LEADER }); assert.strictEqual(r.status, 200, "a leader reads their school's list");
  r = await call({ method: "GET", query: { optout: "1", domain: "*" }, user: "lead@a.edu", roles: LEADER }); assert.strictEqual(r.status, 403, "not the whole list");
  r = await optout({ upn: "p1@a.edu", on: true }, "it@b.edu", IT_B); assert.strictEqual(r.status, 403, "a school's IT 管理员 only keeps their own school's accounts");
  r = await optout({ upn: "ghost@a.edu", on: true }, "comm@fengchao.life", COMM); assert.strictEqual(r.status, 400, "an account Hive does not know cannot be put on the list");
  r = await optout({ upn: "p1@a.edu", on: true, reason: "家长要求" }, "it@a.edu", IT); assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.strictEqual(r.body.item.reason, "家长要求");
  r = await optout({ upn: "p3@b.edu", on: true, reason: "x" }, "comm@fengchao.life", COMM); assert.strictEqual(r.status, 200, "the community manager keeps any school's");
  r = await optout({ upn: "p3@b.edu", on: false }, "sys@fengchao.life", SYS); assert.strictEqual(r.status, 200, "the system administrator too; taking one off");
  r = await call({ method: "GET", query: { optout: "1", domain: "a.edu" }, user: "it@a.edu", roles: IT });
  assert.strictEqual(r.status, 200); assert.deepStrictEqual(r.body.items.map((x) => x.upn), ["p1@a.edu"], "the IT 管理员 sees their school's list"); assert.ok(r.body.people.every((x) => x.d === "a.edu"), "and picks from its accounts only");
  r = await call({ method: "GET", query: { optout: "1", domain: "*" }, user: "it@a.edu", roles: IT }); assert.strictEqual(r.status, 403, "the whole list is not the IT 管理员's");
  r = await call({ method: "GET", query: { optout: "1", domain: "*" }, user: "comm@fengchao.life", roles: COMM }); assert.strictEqual(r.status, 200); assert.strictEqual(r.body.people.length, 7);
  r = await call({ method: "GET", query: { layer: "hive", lookup: "audience" }, user: "comm@fengchao.life", roles: COMM }); assert.deepStrictEqual(r.body.optout, ["p1@a.edu"], "the form is told who is on the list, to show the count");
  // the broadcast leaves p1 out and takes back what p1 already holds; naming p1 does not override the list
  await comm({ op: "save", event: Object.assign({}, timed, { title: "点名", people: ["p1@a.edu", "p2@a.edu"] }) });
  r = await comm({ domain: "a.edu", op: "syncplan" });
  assert.strictEqual(r.body.excluded, 1, "one account was left out because of the list: " + JSON.stringify(r.body));
  assert.ok(r.body.counts.delete >= 1, "and p1's earlier copy is withdrawn: " + JSON.stringify(r.body.counts));
  await comm({ domain: "a.edu", op: "sync", fresh: true });
  assert.deepStrictEqual(got("p1@a.edu"), [], "p1 holds no broadcast any more");
  assert.deepStrictEqual(got("p2@a.edu"), ["点名", "通知"].sort(), "p2 (a parent, and named) still does");
  // the school's own calendar is not a broadcast: p1 still gets it
  r = await lead({ op: "syncplan" }); assert.strictEqual(r.status, 200);
  assert.ok(r.body.counts.create >= 1 && !r.body.excluded, "the school layer ignores the list");
  // taken off the list, p1 receives the broadcasts again
  await optout({ upn: "p1@a.edu", on: false }, "it@a.edu", IT);
  r = await comm({ domain: "a.edu", op: "syncplan" }); assert.ok(r.body.counts.create >= 1 && r.body.excluded === 0, "back on: " + JSON.stringify(r.body));
  console.log("calendar-audience: all assertions passed");
})().catch((e) => { console.error(e); process.exit(1); });
