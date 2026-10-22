// 开通为课程提供方 (api/shared/onboard.js, Rick 2026-10-22): channel → Schools row → partnership → leader → sync,
// previewed first, idempotent on a second run, a missing Graph permission reported and the rest still done.
// Run with: node test/onboard.test.js
const assert = require("assert");
const path = require("path");
const Module = require("module");
const realResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) { if (request === "@azure/storage-blob") return "@azure/storage-blob"; return realResolve.call(this, request, parent, ...rest); };
require.cache["@azure/storage-blob"] = { id: "@azure/storage-blob", filename: "@azure/storage-blob", loaded: true, exports: { BlobServiceClient: { fromConnectionString() { throw new Error("no storage in tests"); } } } };
const R = (...p) => path.join(__dirname, "..", ...p);
const cfg = require(R("api", "shared", "config.js"));
const O = require(R("api", "shared", "onboard.js"));
const P = require(R("api", "shared", "partners.js"));
const copy = (x) => JSON.parse(JSON.stringify(x));

const channels = [{ id: "19:general", displayName: "General" }], graphCalls = [];
let deny = false;
const fieldDef = (name, type) => ({ id: "fld" + name.replace(/\W/g, "").slice(0, 8), name, type });
const schoolTable = { id: cfg.tables.schools.id, fields: [fieldDef("Name/名称", "singleLineText"), fieldDef("简称/Abbreviation", "singleLineText"), fieldDef("Domain", "singleLineText"), fieldDef("Teams Channel ID", "singleLineText"), fieldDef("Notify Email", "email"), fieldDef("Country/国家", "singleSelect")] };
const schoolRows = [{ id: "recSCHOOLKXC00001", fields: { "Name/名称": "Kids X Center", "简称/Abbreviation": "KXC", "Teams Channel ID": "19:kxc" } }];
const writes = [];
const base = { list: async () => copy(schoolRows), table: async () => schoolTable,
  create: async (t, fields) => { const rec = { id: "recSCHOOLJCA00001", fields: copy(fields) }; schoolRows.push(rec); writes.push({ op: "create", fields }); return rec; },
  update: async (t, id, fields) => { const r = schoolRows.find((x) => x.id === id); Object.assign(r.fields, fields); writes.push({ op: "update", id, fields }); return r; } };
let rels = { next: 1, items: {} }, orgs = { next: 1, byKey: {}, orgs: {} }, roles = { entries: [] }, synced = 0;
O._deps({
  findTeam: async () => ({ id: "team1", name: "Hive Orders" }),
  graphList: async () => copy(channels),
  graph: async (m, p, body) => { graphCalls.push({ m, p, body }); if (deny) throw Object.assign(new Error("Forbidden"), { status: 403 }); const ch = { id: "19:jca" + channels.length, displayName: body.displayName }; channels.push(ch); return ch; },
  readBase: () => base, writeBase: () => base,
  partners: () => Object.assign({}, P, { readRels: async () => copy(rels), readOrgs: async () => copy(orgs), updateOrgs: async (m) => { m(orgs); return { doc: copy(orgs) }; }, updateRels: async (m) => { m(rels); return { doc: copy(rels) }; } }),
  roles: () => ({ readRoles: async () => copy(roles), updateRoles: async (m) => { m(roles); return { doc: roles }; } }),
  courses: () => ({ lookups: async () => ({}), syncWebsite: async () => { synced++; return { ran: true, status: 200 }; } }),
  runSync: () => async () => ({}),
});

(async () => {
  const input = { key: "jca.example.org", abbr: "JCA", name: "嘉恩学院", domain: "jca.example.org", leader: "Eve.Zhou@jca.example.org", country: "中国" };
  assert.throws(() => O.clean({ name: "x" }), (e) => e.status === 400 && /abbr/.test(e.problems.join()));
  // preview: nothing changes
  let r = await O.run(input, { dryRun: true, by: "rick@fengchao.life" });
  assert.deepStrictEqual(r.steps.map((s) => [s.step, s.status]), [["channel", "todo"], ["school", "todo"], ["partnership", "todo"], ["leader", "todo"], ["sync", "todo"]]);
  assert.ok(!graphCalls.length && !writes.length && !Object.keys(rels.items).length && !roles.entries.length && !synced, "a preview writes nothing");
  assert.strictEqual(r.steps[0].detail, "Hive Orders › JCA 订单", "the channel's name");
  // run
  r = await O.run(input, { by: "rick@fengchao.life" });
  assert.ok(r.ok, JSON.stringify(r.steps));
  assert.deepStrictEqual(graphCalls[0], { m: "POST", p: "/teams/team1/channels", body: { displayName: "JCA 订单", description: "嘉恩学院 — 蜂巢课程订单 / Hive course orders", membershipType: "standard" } });
  assert.deepStrictEqual(writes[0], { op: "create", fields: { "Name/名称": "嘉恩学院", "简称/Abbreviation": "JCA", Domain: "jca.example.org", "Teams Channel ID": "19:jca1", "Notify Email": "eve.zhou@jca.example.org", "Country/国家": "中国" } }, "the Schools row with the channel; the leader as notify email");
  const rel = Object.values(rels.items)[0];
  assert.ok(rel && rel.type === "course" && rel.stage === "design" && rel.party.key === "jca.example.org", "the partnership");
  assert.deepStrictEqual(roles.entries[0].roles, ["provider:JCA"], "Eve leads JCA"); assert.strictEqual(roles.entries[0].user, "eve.zhou@jca.example.org");
  assert.strictEqual(synced, 1, "the website synced");
  // again: everything is there
  r = await O.run(input, { by: "rick@fengchao.life" });
  assert.deepStrictEqual(r.steps.map((s) => s.status), ["exists", "exists", "exists", "exists", "done"], "idempotent: " + JSON.stringify(r.steps));
  assert.strictEqual(graphCalls.length, 1); assert.strictEqual(writes.length, 1); assert.strictEqual(Object.keys(rels.items).length, 1);
  // an existing Schools row is completed, never overwritten; a missing permission is reported, the rest still done
  deny = true;
  r = await O.run({ key: "hive:KXC", abbr: "KXC", name: "Kids X Center", domain: "kxc.edu", leader: "" }, { by: "rick" });
  assert.strictEqual(r.steps[0].status, "failed"); assert.strictEqual(r.steps[0].code, "app_permission");
  assert.deepStrictEqual(writes[1], { op: "update", id: "recSCHOOLKXC00001", fields: { Domain: "kxc.edu" } }, "only the empty cell filled; the channel id already there is kept");
  assert.strictEqual(r.steps[3].status, "skipped", "no leader given");
  assert.ok(!r.ok);
  console.log("onboard: all assertions passed");
})().catch((e) => { console.error(e); process.exit(1); });
