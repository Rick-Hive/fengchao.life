// 我要教课 (api/shared/applications.js, Rick 2026-10-22): the website's application becomes a 课程提供方 relationship at
// 申请 / 推荐 with the form on it; applying again refreshes it instead of opening a second; onboarding a team without a
// domain links its Schools row (hive:<KEY>) to the same partner.
// Run with: node test/teach.test.js
const assert = require("assert");
const path = require("path");
const Module = require("module");
const realResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) { if (request === "@azure/storage-blob") return "@azure/storage-blob"; return realResolve.call(this, request, parent, ...rest); };
require.cache["@azure/storage-blob"] = { id: "@azure/storage-blob", filename: "@azure/storage-blob", loaded: true, exports: { BlobServiceClient: { fromConnectionString() { throw new Error("no storage in tests"); } } } };
const R = (...p) => path.join(__dirname, "..", ...p);
const P = require(R("api", "shared", "partners.js"));
const copy = (x) => JSON.parse(JSON.stringify(x));
let rels = { next: 50, items: {} }, orgs = { next: 9, byKey: {}, orgs: {} };
P.readRels = async () => copy(rels); P.readOrgs = async () => copy(orgs);
P.updateRels = async (m) => { m(rels); return { doc: copy(rels) }; };
P.updateOrgs = async (m) => { m(orgs); return { doc: copy(orgs) }; };
const A = require(R("api", "shared", "applications.js"));
const O = require(R("api", "shared", "onboard.js"));

(async () => {
  const form = { kind: "team", name: "周老师", email: "Eve@Gmail.com", phone: "wechat eve", org: "心桥中文", abbr: "xq-c", subjects: "中文阅读", grades: "G1-G6", language: "zh", teachers: "3", intro: "我们是一个教中文阅读的老师团队，已有五年教学经验。", agree: true, domain: "gmail.com", country: "美国" };
  // what is required
  let c = A.clean({});
  assert.deepStrictEqual(c.problems, ["kind", "name", "email", "org", "subjects", "intro", "agree"]);
  c = A.clean({ kind: "individual", name: "王老师", email: "w@x.org", subjects: "数学", intro: "x".repeat(20), agree: 1 });
  assert.strictEqual(c.problems.length, 0); assert.strictEqual(c.app.org, "王老师", "an individual's name is the partner's name");
  c = A.clean(form);
  assert.strictEqual(c.app.email, "eve@gmail.com"); assert.strictEqual(c.app.abbr, "XQC"); assert.strictEqual(c.app.domain, "", "a mail service is not an organisation's domain"); assert.strictEqual(c.app.teachers, 3);
  // the first application: a course relationship at 申请 / 推荐, party apply:<email>
  let r = await A.submit(c.app, { account: "" });
  assert.deepStrictEqual(r, { id: "REL-000050", again: false, key: "apply:eve@gmail.com" });
  const rel = rels.items["REL-000050"];
  assert.strictEqual(rel.type, "course"); assert.strictEqual(rel.stage, "apply"); assert.strictEqual(rel.source, "application"); assert.strictEqual(rel.confirmed, true);
  assert.strictEqual(rel.region, "na"); assert.strictEqual(rel.party.id, "ORG-000009"); assert.strictEqual(rel.party.name, "心桥中文");
  assert.strictEqual(rel.application.intro, form.intro); assert.strictEqual(rel.application.phone, "wechat eve");
  assert.strictEqual(orgs.orgs["ORG-000009"].name, "心桥中文");
  // again: the same relationship, the form replaced, the log says so
  r = await A.submit(Object.assign({}, c.app, { subjects: "中文阅读、写作" }), { account: "eve@xq.fengchao.life" });
  assert.deepStrictEqual(r, { id: "REL-000050", again: true, key: "apply:eve@gmail.com" });
  assert.strictEqual(Object.keys(rels.items).length, 1);
  assert.strictEqual(rels.items["REL-000050"].application.subjects, "中文阅读、写作"); assert.strictEqual(rels.items["REL-000050"].application.account, "eve@xq.fengchao.life");
  assert.ok(rels.items["REL-000050"].application.firstAt <= rels.items["REL-000050"].application.at);
  assert.ok(/再次提交/.test(rels.items["REL-000050"].log.slice(-1)[0].text));
  // a school with its own domain: keyed by the domain, so an institution of that domain finds it
  r = await A.submit(A.clean(Object.assign({}, form, { email: "head@abc-school.org", domain: "https://www.abc-school.org/", org: "ABC School" })).app, {});
  assert.strictEqual(r.key, "abc-school.org"); assert.strictEqual(rels.items[r.id].party.key, "abc-school.org");
  // the notices' words
  const m = A.texts("REL-000050", Object.assign({}, c.app, { account: "" }));
  assert.ok(/REL-000050/.test(m.ack.subject) && /两周内/.test(m.ack.body)); assert.ok(/#\/ops\/partners\/course\/REL-000050/.test(m.staff));
  assert.ok(/Thank you/.test(A.texts("X", Object.assign({}, c.app, { lang: "en" })).ack.body));

  // 开通 from the application: the open relationship is found by its party key, and hive:XQC now names the same partner
  O._deps({
    findTeam: async () => ({ id: "t", name: "Hive Orders" }), graphList: async () => [], graph: async (m, p, b) => ({ id: "19:xqc", displayName: b.displayName }),
    readBase: () => ({ list: async () => [] }), writeBase: () => ({ table: async () => ({ fields: [] }), create: async () => ({ id: "recXQC" }) }),
    partners: () => P, roles: () => ({ readRoles: async () => ({ entries: [] }), updateRoles: async (fn) => fn({ entries: [] }) }),
    courses: () => ({ lookups: async () => ({}), syncWebsite: async () => ({ ran: true }) }), runSync: () => async () => ({}),
  });
  const res = await O.run({ key: "apply:eve@gmail.com", abbr: "XQC", name: "心桥中文", leader: "eve@xq.fengchao.life" }, { by: "rick" });
  const pt = res.steps.find((s) => s.step === "partnership");
  assert.strictEqual(pt.status, "exists", JSON.stringify(res.steps)); assert.ok(/REL-000050/.test(pt.detail));
  assert.strictEqual(orgs.byKey["hive:XQC"], "ORG-000009", "the Schools row's key names the applicant's partner");
  assert.ok(orgs.orgs["ORG-000009"].keys.includes("hive:XQC"));
  assert.strictEqual(Object.values(rels.items).filter((x) => x.party.id === "ORG-000009").length, 1, "no second relationship");
  console.log("teach: all assertions passed");
})().catch((e) => { console.error(e); process.exit(1); });
