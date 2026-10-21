// 课程管理 (Rick, 2026-10-18): teachers edit their courses in Hive, approvers publish into Airtable.
// api/shared/courses.js and /api/courses with a faked Airtable base, store and translator.
//
// Run with:  node test/courses.test.js
const assert = require("assert");
const path = require("path");
const Module = require("module");
const realResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) { if (request === "@azure/storage-blob") return "@azure/storage-blob"; return realResolve.call(this, request, parent, ...rest); };
require.cache["@azure/storage-blob"] = { id: "@azure/storage-blob", filename: "@azure/storage-blob", loaded: true, exports: { BlobServiceClient: { fromConnectionString() { throw new Error("no storage in tests"); } } } };
delete process.env.STORAGE_CONNECTION_STRING;
process.env.HIVE_ADMINS = "hive.admin@fengchao.life";
process.env.AIRTABLE_PAT = "pat-read";
process.env.AIRTABLE_HIVE_WRITE_PAT = "pat-write";
const R = (...p) => path.join(__dirname, "..", ...p);

const blobs = {};
const copy = (x) => JSON.parse(JSON.stringify(x));
const jsonstore = require(R("api", "shared", "jsonstore.js"));
jsonstore.read = async (name, fallback) => (blobs[name] ? copy(blobs[name]) : (typeof fallback === "function" ? fallback() : copy(fallback)));
jsonstore.write = async (name, doc) => { blobs[name] = copy(doc); };
jsonstore.update = async (name, fallback, mutate) => { const doc = await jsonstore.read(name, fallback); const result = await mutate(doc); if (result !== false) blobs[name] = copy(doc); return { doc, result, written: result !== false }; };
const blobMod = require(R("api", "shared", "blob.js"));
blobMod.readSnapshot = async () => ({ generatedAt: "2026-10-18T00:00:00Z", courses: [
  { id: "recCOURSE00000001", code: "SCI-HS-101", nameEn: "Biology", nameZh: "生物", teachers: ["Zhang"], subjects: [{ nameEn: "Science", nameZh: "科学" }], school: { abbr: "KXC" }, available: true },
  { id: "recCOURSE00000002", code: "MTH-MS-101", nameEn: "Algebra", nameZh: "", teachers: [], subjects: [], school: { abbr: "OTH" }, available: true },
], private: { schoolRouting: { KXC: { name: "Kids X Center", abbr: "KXC", domain: "kxc.edu" }, OTH: { name: "Other", abbr: "OTH", domain: "other.edu" } }, teachers: [{ id: "recT9", name: "Tutor", teamsAccount: "tutor@gmail.com", organization: "KXC" }, { id: "recTEACH000000002", name: "Tutor 2", teamsAccount: "tutor@gmc.edu", organization: "Kids X Center" }] } });

// ---- a fake Airtable base: schema + records + what was written ----------------------------------
const cfg = require(R("api", "shared", "config.js"));
const T = cfg.tables;
const writes = [];
const courseRow = { id: "recCOURSE00000001", fields: { "Course ID/课程编号": "SCI-HS-101", "Course Name": "Biology", "课程名称": "生物", "Course Description": "Cells and life.", "课程描述": "", "Class Type": "Live Course", "课程类型": "直播课", "Teaching Language": "English", "授课语言": "英语",
  "Grade/年级": ["recGRADE000000009"], "Subject": ["recSUBJ0000000001"], "学科": ["recSUBJ0000000001"], "Credit Hours": 1, "Number of Classes/课时数": 30, "Class time/上课时间": "P3 10:00-10:45", "Day of Week": ["Monday"], "Presiquisite Course": "N/A",
  "Academic Course/学术课程?": true, "Course Price/课程价格": 300, "Available/可用？": "Yes", "Teacher/授课老师": ["recTEACH000000001"], "Course Deliverer/课程提供方": ["recSCHOOL00000001"], "Syllabus/课程大纲": [{ id: "attOLD", url: "https://old", filename: "old.pdf", size: 10, type: "application/pdf" }] } };
const fieldDef = (name, type, choices) => ({ id: "fld" + name.replace(/\W/g, "").slice(0, 10), name, type, options: choices ? { choices: choices.map((n) => ({ name: n })) } : undefined });
const courseTable = { id: T.courses.id, name: "Course/课程", fields: [
  fieldDef("Course ID/课程编号", "singleLineText"), fieldDef("Course Name", "singleLineText"), fieldDef("课程名称", "singleLineText"), fieldDef("Course Description", "multilineText"), fieldDef("课程描述", "multilineText"),
  fieldDef("Class Type", "singleSelect", ["Live Course", "Live or Recorded Course", "Prerecorded Course", "Self-Paced Course"]), fieldDef("课程类型", "singleSelect", ["直播课", "直播或录播课", "录播课", "自定义进度课程"]),
  fieldDef("Teaching Language", "singleSelect", ["English", "Chinese"]), fieldDef("授课语言", "singleSelect", ["英语", "中文"]),
  fieldDef("Grade/年级", "multipleRecordLinks"), fieldDef("Subject", "multipleRecordLinks"), fieldDef("学科", "multipleRecordLinks"), fieldDef("Credit Hours", "number"), fieldDef("Number of Classes/课时数", "number"), fieldDef("Class time/上课时间", "singleLineText"),
  fieldDef("Day of Week", "multipleSelects", ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]), fieldDef("Presiquisite Course", "multilineText"), fieldDef("Academic Course/学术课程?", "checkbox"), fieldDef("Course Price/课程价格", "number"), fieldDef("Available/可用？", "singleLineText"),
  fieldDef("Teacher/授课老师", "multipleRecordLinks"), fieldDef("Course Deliverer/课程提供方", "multipleRecordLinks"), fieldDef("Syllabus/课程大纲", "multipleAttachments"), fieldDef("Textbook SKU/教材编码", "multipleRecordLinks"), fieldDef("Graduation Track/毕业路径", "multipleRecordLinks"), fieldDef("Comments/备注", "multilineText"),
] };
const lists = {
  [T.grades.id]: [{ id: "recGRADE000000009", fields: { "Title/年级名称": "G9" } }, { id: "recGRADE000000001", fields: { "Title/年级名称": "G1" } }],
  [T.subjects.id]: [{ id: "recSUBJ0000000001", fields: { "Subject Name": "Science", "学科": "科学" } }],
  [T.textbooks.id]: [], [T.teachers.id]: [{ id: "recTEACH000000001", fields: { "Name / 姓名": "Zhang", "Teams Account/Teams账号": "zhang@a.edu" } }, { id: "recTEACH000000002", fields: { "Name / 姓名": "Zz Tutor", "Teams Account/Teams账号": "tutor@gmc.edu" } }],
  [T.schools.id]: [{ id: "recSCHOOL00000001", fields: { "Name/名称": "Kexuechong", "简称/Abbreviation": "KXC" } }], [T.tracks.id]: [],
};
class FakeBase {
  constructor(baseId, pat) { this.pat = pat; }
  async list(tableId) { return copy(lists[tableId] || []); }
  async table() { return courseTable; }
  async get(tableId, id) { if (id === courseRow.id) return copy(courseRow); const e = new Error("NOT_FOUND"); throw e; }
  async update(tableId, id, fields, opts) { assert.strictEqual(this.pat, "pat-write", "writes use the write token"); assert.strictEqual(opts && opts.typecast, false, "no typecast"); writes.push({ tableId, id, fields }); Object.assign(courseRow.fields, fields); return { id, fields }; }
}
const C = require(R("api", "shared", "courses.js"));
C._test.baseFor({ read: () => new FakeBase(cfg.baseId, "pat-read"), write: () => new FakeBase(cfg.baseId, "pat-write") });
const translator = { translate: async (texts, to) => texts.map((t) => (to === "zh" ? "【译】" + t : "[tr] " + t)) };

const session = require(R("api", "shared", "session.js"));
session.guard = async (context, req) => { if (req.headers && req.headers["x-ms-client-principal"]) return { u: "x" }; context.res = { status: 403, body: { code: "signed_out" } }; return null; };
session.finish = () => {};
require(R("api", "shared", "audit.js")).audit = async () => {};
require(R("api", "shared", "hub.js")).readHub = async () => ({ people: [{ crmId: "P-1", name: "Zhang Lao", keys: ["zhang@a.edu"], facets: { accounts: [{ upn: "zhang@a.edu", identity: "老师", domain: "a.edu" }, { upn: "zhang@kxc.edu", identity: "老师", domain: "kxc.edu" }] } }, { crmId: "P-9", name: "Zhou Other", keys: ["zhou@other.edu"], facets: { accounts: [{ upn: "zhou@other.edu", identity: "老师", domain: "other.edu" }] } }] });
require.cache[require.resolve(R("api", "sync", "index.js"))] = { id: "sync", filename: "sync", loaded: true, exports: { runSync: async () => ({ status: 200, body: { ok: true, counts: { courses: 2 } } }) } };
const handler = require(R("api", "courses", "index.js"));

const ROLES = { "cd@fengchao.life": ["staff:curriculum"], "cm@fengchao.life": ["staff:community"], "lead@kxc.edu": ["provider:KXC"], "head@kxc.edu": ["domain_leader:kxc.edu"] };
const principal = (u) => Buffer.from(JSON.stringify({ identityProvider: "aad", userId: "x", userDetails: u, userRoles: ["authenticated"].concat(ROLES[u] || []) })).toString("base64");
async function call(user, method, action, { q, body } = {}) {
  const context = { log: Object.assign(() => {}, { error() {}, warn() {} }), res: null };
  await handler(context, { method, params: { action }, query: q || {}, body: body || {}, headers: { "x-ms-client-principal": principal(user), origin: "https://fengchao.life" } });
  return context.res;
}
const CD = "cd@fengchao.life", TEACHER = "zhang@a.edu", CM = "cm@fengchao.life", ID = "recCOURSE00000001";

(async () => {
  // a teacher with nothing assigned sees an empty list and cannot open a course
  let r = await call(TEACHER, "GET", "list"); assert.strictEqual(r.status, 200); assert.strictEqual(r.body.none, true);
  r = await call(TEACHER, "GET", "course", { q: { id: ID } }); assert.strictEqual(r.status, 403);

  // the curriculum director assigns the teacher (found through the people picker), the teacher now sees the course
  r = await call(CD, "GET", "people", { q: { q: "zhang" } }); assert.strictEqual(r.body.people[0].upn, "zhang@a.edu");
  r = await call(CD, "POST", "op", { body: { id: ID, op: "assign", code: "SCI-HS-101", person: r.body.people[0] } }); assert.strictEqual(r.status, 200); assert.strictEqual(r.body.assigned.length, 1);
  r = await call(TEACHER, "POST", "op", { body: { id: ID, op: "assign", person: { upn: "x@a.edu" } } }); assert.strictEqual(r.status, 403, "teachers do not assign");
  r = await call(TEACHER, "GET", "list"); assert.strictEqual(r.body.courses.length, 1); assert.strictEqual(r.body.courses[0].code, "SCI-HS-101"); assert.strictEqual(r.body.courses[0].status, "");

  // opening creates the working record from the Airtable row: ids for links, {en, zh} for the paired selects
  r = await call(TEACHER, "GET", "course", { q: { id: ID } }); assert.strictEqual(r.status, 200);
  const c = r.body.course;
  assert.strictEqual(c.status, "draft"); assert.strictEqual(c.code, "SCI-HS-101");
  assert.deepStrictEqual(c.fields.grades, ["recGRADE000000009"]); assert.deepStrictEqual(c.fields.subjects, ["recSUBJ0000000001"]);
  assert.deepStrictEqual(c.fields.classType, { en: "Live Course", zh: "直播课" }); assert.strictEqual(c.fields.price, 300); assert.strictEqual(c.fields.available, true);
  assert.strictEqual(c.fields.syllabus[0].airtable, true);
  assert.strictEqual(r.body.editable.price, false, "price is read-only for a teacher"); assert.strictEqual(r.body.editable.descriptionZh, true);
  assert.strictEqual(r.body.translation.descriptionZh, "empty"); assert.strictEqual(r.body.needs, 1, "the Chinese description is missing");
  assert.strictEqual(r.body.course.baseline, undefined, "a teacher does not get the baseline");

  // lookups: grades in school order, subjects, options; teacher UPNs only for approvers
  r = await call(TEACHER, "GET", "lookups"); assert.deepStrictEqual(r.body.grades.map((g) => g.name), ["G1", "G9"]); assert.strictEqual(r.body.teachers[0].upn, undefined);
  assert.strictEqual(r.body.fields.classical, false, "the base has no Classical column"); assert.strictEqual(r.body.fields.nameZh, true);
  r = await call(CD, "GET", "lookups"); assert.strictEqual(r.body.teachers[0].upn, "zhang@a.edu");

  // autosave one field; a read-only field is refused; a bad number is refused
  r = await call(TEACHER, "PATCH", "field", { body: { id: ID, key: "descriptionEn", value: "Cells, genetics and ecology." } }); assert.strictEqual(r.status, 200); assert.ok(r.body.savedAt);
  r = await call(TEACHER, "PATCH", "field", { body: { id: ID, key: "price", value: 1 } }); assert.strictEqual(r.status, 403);
  r = await call(TEACHER, "PATCH", "field", { body: { id: ID, key: "creditHours", value: "abc" } }); assert.strictEqual(r.status, 400);
  r = await call(TEACHER, "PATCH", "field", { body: { id: ID, key: "classType", value: { en: "Prerecorded Course" } } }); assert.strictEqual(r.status, 200);
  r = await call(TEACHER, "GET", "course", { q: { id: ID } }); assert.deepStrictEqual(r.body.course.fields.classType, { en: "Prerecorded Course", zh: "录播课" });
  assert.strictEqual(r.body.course.history[0].action, "save"); assert.ok(r.body.course.history[0].fields.includes("descriptionEn") && r.body.course.history[0].fields.includes("classType"), "autosaves fold into one line");

  // submit is refused while the Chinese description is empty; 生成双语 fills it; then submit works
  r = await call(TEACHER, "POST", "op", { body: { id: ID, op: "submit" } }); assert.strictEqual(r.status, 400); assert.ok(r.body.problems.some((p) => /descriptionZh/.test(p)));
  const tr = await C.translateCourse(ID, { user: TEACHER }, translator);
  assert.deepStrictEqual(tr.done, ["descriptionZh"]); assert.strictEqual(tr.fields.descriptionZh, "【译】Cells, genetics and ecology.");
  assert.strictEqual(tr.meta.machine.descriptionZh, true); assert.strictEqual(tr.meta.machine.nameZh, undefined, "the human Chinese name is not touched");
  const again = await C.translateCourse(ID, { user: TEACHER }, translator); assert.deepStrictEqual(again.done, [], "nothing to do the second time");
  // the source changes → the machine translation is stale; a human-edited translation never is
  await C.saveField(ID, "descriptionEn", "Cells, genetics, ecology and evolution.", { user: TEACHER, approver: false });
  let doc = await C.readWork(ID); assert.strictEqual(C.translationState(doc).descriptionZh, "stale"); assert.strictEqual(C.translationNeeds(doc), 1);
  await C.saveField(ID, "descriptionZh", "细胞、遗传、生态与进化。", { user: TEACHER, approver: false });
  doc = await C.readWork(ID); assert.strictEqual(C.translationState(doc).descriptionZh, "human"); assert.strictEqual(C.translationNeeds(doc), 0);
  await C.saveField(ID, "descriptionEn", "Cells, genetics, ecology, evolution.", { user: TEACHER, approver: false });
  doc = await C.readWork(ID); assert.strictEqual(C.translationState(doc).descriptionZh, "human-stale", "a person's translation is flagged (not silently redone) when the source changes later");
  assert.strictEqual(C.translationNeeds(doc), 1);
  let kept = await C.translateCourse(ID, { user: TEACHER }, translator); assert.deepStrictEqual(kept.done, [], "a person's translation is not overwritten without a yes"); assert.deepStrictEqual(kept.kept, ["descriptionZh"]);
  doc = await C.readWork(ID); assert.strictEqual(doc.draft.fields.descriptionZh, "细胞、遗传、生态与进化。");
  // text that came from Airtable (both languages, no record yet) is flagged the moment one side changes
  await C.saveField(ID, "nameEn", "Biology 7 (revised)", { user: TEACHER, approver: false });
  doc = await C.readWork(ID); assert.strictEqual(C.translationState(doc).nameZh, "human-stale", "the Airtable-made Chinese name is outdated once the English one changed");
  let ow = await C.translateCourse(ID, { user: TEACHER }, translator, { overwrite: true }); assert.ok(ow.done.includes("nameZh") && ow.done.includes("descriptionZh"));
  doc = await C.readWork(ID); assert.strictEqual(doc.draft.fields.descriptionZh, "【译】Cells, genetics, ecology, evolution."); assert.strictEqual(C.translationState(doc).descriptionZh, "machine"); assert.strictEqual(C.translationNeeds(doc), 0);
  assert.ok(doc.fieldHistory.descriptionZh.some((h) => h.to === "细胞、遗传、生态与进化。"), "the replaced text stays in the field history");
  // 重新翻译全部 (from English) rewrites everything on the other side
  let allr = await C.translateCourse(ID, { user: TEACHER }, translator, { all: true, from: "en" }); assert.deepStrictEqual(allr.done.sort(), ["descriptionZh", "nameZh"]);
  // put the course back the way the publish checks below expect it
  for (const [k, v] of [["nameEn", "Biology"], ["nameZh", "生物"], ["descriptionZh", "细胞、遗传、生态与进化。"]]) await C.saveField(ID, k, v, { user: TEACHER, approver: false });
  r = await call(TEACHER, "POST", "op", { body: { id: ID, op: "submit", note: "ready" } }); assert.strictEqual(r.status, 200); assert.strictEqual(r.body.course.status, "submitted");
  r = await call(TEACHER, "PATCH", "field", { body: { id: ID, key: "classTime", value: "P4" } }); assert.strictEqual(r.status, 200, "editing after submit is allowed (the draft moves on)");

  // the community manager may look but not touch; an approver opening it marks 审阅中; return sends it back
  r = await call(CM, "GET", "course", { q: { id: ID } }); assert.strictEqual(r.status, 200); assert.strictEqual(r.body.course.status, "submitted", "a viewer does not start the review");
  r = await call(CM, "PATCH", "field", { body: { id: ID, key: "classTime", value: "P5" } }); assert.strictEqual(r.status, 403);
  r = await call(CD, "GET", "course", { q: { id: ID } }); assert.strictEqual(r.body.course.status, "reviewing"); assert.strictEqual(r.body.course.reviewing.by, CD); assert.ok(r.body.course.baseline, "an approver gets the baseline");
  r = await call(CD, "POST", "op", { body: { id: ID, op: "return" } }); assert.strictEqual(r.status, 400, "a comment is required");
  r = await call(CD, "POST", "op", { body: { id: ID, op: "return", comment: "请补充课时安排" } }); assert.strictEqual(r.body.course.status, "returned");
  r = await call(TEACHER, "PATCH", "field", { body: { id: ID, key: "classTime", value: "P3 Monday" } }); assert.strictEqual(r.body.status, "draft", "editing after a return goes back to draft");
  r = await call(TEACHER, "POST", "op", { body: { id: ID, op: "submit" } }); assert.strictEqual(r.status, 200);

  // publish: only the changed fields reach Airtable, with record ids, both paired columns, a text Available, attachments kept by id
  r = await call(TEACHER, "POST", "op", { body: { id: ID, op: "publish" } }); assert.strictEqual(r.status, 403);
  r = await call(CD, "POST", "op", { body: { id: ID, op: "publish" } }); assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.strictEqual(writes.length, 1); const w = writes[0].fields;
  assert.strictEqual(w["Course Description"], "Cells, genetics, ecology, evolution."); assert.strictEqual(w["课程描述"], "细胞、遗传、生态与进化。");
  assert.strictEqual(w["Class Type"], "Prerecorded Course"); assert.strictEqual(w["课程类型"], "录播课"); assert.strictEqual(w["Class time/上课时间"], "P3 Monday");
  assert.strictEqual(w["Course Name"], undefined, "unchanged fields are not written"); assert.strictEqual(w["Course Price/课程价格"], undefined);
  assert.ok(r.body.written.includes("descriptionZh") && r.body.written.includes("classType"));
  assert.strictEqual(r.body.course.status, "published");
  assert.ok(Object.keys(blobs).some((k) => k.startsWith("crm/course-work/" + ID + "/pub/")), "the publish is archived");
  assert.ok(Object.keys(blobs).some((k) => k.startsWith("crm/course-work/" + ID + "/v/")), "milestones are kept");

  // the website refresh is coalesced: first call runs, a second within two minutes is queued
  r = await call(CD, "POST", "sync"); assert.strictEqual(r.body.ran, true); assert.strictEqual(r.body.status, 200);
  await call(CD, "POST", "op", { body: { id: ID, op: "milestone", note: "x" } });
  blobs["crm/course-sync.json"].pending = true;
  r = await call(CD, "POST", "sync"); assert.strictEqual(r.body.ran, false); assert.strictEqual(r.body.queued, true); assert.ok(r.body.retryIn > 0);

  // the list shows the status from the index; versions list and restore
  r = await call(CD, "GET", "list"); const row = r.body.courses.find((x) => x.id === ID); assert.strictEqual(row.status, "published"); assert.strictEqual(row.assigned[0].upn, "zhang@a.edu"); assert.ok(row.publishedAt);
  r = await call(TEACHER, "GET", "versions", { q: { id: ID } }); assert.ok(r.body.items.length > 3); const pub = r.body.items.find((x) => x.action === "publish"); assert.ok(pub.ref.startsWith("p:"));
  const firstSubmit = r.body.items.filter((x) => x.action === "submit").pop();
  r = await call(TEACHER, "GET", "version", { q: { id: ID, ref: firstSubmit.ref } }); assert.strictEqual(r.status, 200); assert.strictEqual(r.body.version.fields.classTime, "P3 10:00-10:45", "the first submit still had the old class time");
  r = await call(TEACHER, "POST", "op", { body: { id: ID, op: "restore", ref: firstSubmit.ref } }); assert.strictEqual(r.body.course.status, "draft"); assert.strictEqual(r.body.course.fields.classTime, "P3 10:00-10:45");
  r = await call(TEACHER, "GET", "versions", { q: { id: ID } }); assert.strictEqual(r.body.items[0].action, "restore");

  // 班级名单 (stage 2, 2026-10-21): the assigned teacher's roster from the live orders — names and grades, no family details;
  // an expired order and a cancelled one are not on it, a waitlisted item is listed apart
  const crm = require(R("api", "shared", "crm.js"));
  const dayAgo = (d) => new Date(Date.now() - d * 86400000).toISOString();
  const ord = (id, status, days, items) => ({ orderId: id, status, submittedAt: dayAgo(days), email: "family@gmail.com", items, hives: [{ key: "kxc" }], history: [] });
  crm.listOrders = async () => [
    ord("FC-20261010-KXC-001", "paid", 10, [{ code: "SCI-HS-101", child: { name: "张小明", grade: "9", account: "" } }]),
    ord("FC-20261015-KXC-002", "submitted", 5, [{ code: "SCI-HS-101", child: { name: "李小红", grade: "10" }, waitlist: true }, { code: "MTH-MS-101", child: { name: "李小红", grade: "10" } }]),
    ord("FC-20260920-KXC-003", "submitted", 30, [{ code: "SCI-HS-101", child: { name: "过期生", grade: "9" } }]),
    ord("FC-20261001-KXC-004", "cancelled", 19, [{ code: "SCI-HS-101", child: { name: "退订生", grade: "9" } }]),
  ];
  r = await call(TEACHER, "GET", "roster", { q: { id: ID } });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.deepStrictEqual(r.body.enrolled.map((x) => [x.name, x.grade, x.status]), [["张小明", "9", "paid"]], "the paid family is enrolled; the expired and cancelled ones are not");
  assert.deepStrictEqual(r.body.waitlist.map((x) => [x.name, x.status]), [["李小红", "submitted"]], "the waitlisted item is listed apart");
  assert.deepStrictEqual(r.body.counts, { enrolled: 1, paid: 1, waitlist: 1 });
  assert.ok(!JSON.stringify(r.body).includes("family@gmail.com"), "no contact details on the roster");
  assert.deepStrictEqual([r.body.course.code, r.body.course.nameZh], ["SCI-HS-101", "生物"]);
  r = await call(TEACHER, "GET", "roster", { q: { id: "recCOURSE00000002" } }); assert.strictEqual(r.status, 403, "not the teacher's course");
  r = await call(CM, "GET", "roster", { q: { id: "recCOURSE00000002" } }); assert.strictEqual(r.status, 200, "a viewer may read any roster");

  // 蜂巢课程负责人 (v3 第二批 ③): the explicit provider:KXC role, and the school's leader by the routing domain — the hive's
  // courses are listed (owned), opened like a teacher's, teachers assigned from the hive's own people; never published
  for (const LEAD of ["lead@kxc.edu", "head@kxc.edu"]) {
    r = await call(LEAD, "GET", "list"); assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual([r.body.courses.map((c) => c.code), r.body.courses[0].owned, r.body.me.provider], [["SCI-HS-101"], true, ["KXC"]], LEAD + " sees its hive's course: " + JSON.stringify(r.body.courses));
    r = await call(LEAD, "GET", "course", { q: { id: ID } }); assert.strictEqual(r.status, 200, LEAD + " opens it"); assert.strictEqual(r.body.editable.price, false, "the teacher-editable fields only");
    r = await call(LEAD, "GET", "course", { q: { id: "recCOURSE00000002" } }); assert.strictEqual(r.status, 403, "another provider's course is not theirs");
    r = await call(LEAD, "POST", "op", { body: { id: ID, op: "publish" } }); assert.strictEqual(r.status, 403, "no publishing");
    r = await call(LEAD, "POST", "op", { body: { id: ID, op: "assign", code: "SCI-HS-101", person: { upn: "x@other.edu", name: "X" } } }); assert.strictEqual(r.status, 403, "not its own person"); assert.strictEqual(r.body.code, "not_own_person");
    r = await call(LEAD, "POST", "op", { body: { id: ID, op: "assign", code: "SCI-HS-101", person: { upn: "li@kxc.edu", name: "Li" } } }); assert.strictEqual(r.status, 200, JSON.stringify(r.body)); assert.ok(r.body.assigned.some((p) => p.upn === "li@kxc.edu"), "an account in the hive's domain");
    r = await call(LEAD, "POST", "op", { body: { id: ID, op: "assign", code: "SCI-HS-101", person: { upn: "tutor@gmail.com", name: "Tutor" } } }); assert.strictEqual(r.status, 200, "a Teachers-table row of the organization, whatever its account's domain");
    r = await call(LEAD, "POST", "op", { body: { id: "recCOURSE00000002", op: "assign", code: "MTH-MS-101", person: { upn: "li@kxc.edu" } } }); assert.strictEqual(r.status, 403, "not on another provider's course");
    r = await call(LEAD, "GET", "people", { q: { q: "zh" } }); assert.deepStrictEqual(r.body.people.map((p) => p.upn), ["zhang@kxc.edu"], "the picker: the person's account in the hive's domain, others left out");
    r = await call(LEAD, "GET", "people", { q: { q: "tutor" } }); assert.deepStrictEqual(r.body.people.map((p) => [p.upn, p.identity]), [["tutor@gmail.com", "老师"], ["tutor@gmc.edu", "老师"]], "the Teachers rows the hub does not know");
    for (const upn of ["li@kxc.edu", "tutor@gmail.com"]) await call(CD, "POST", "op", { body: { id: ID, op: "unassign", person: { upn } } });
    // 授课老师 (2026-10-21): the leader's field on its own course, its own teachers only; a named teacher with a Teams
    // account is assigned automatically (auto), and loses that when taken off; the pick list is its own teachers
    r = await call(LEAD, "GET", "lookups"); assert.deepStrictEqual(r.body.teachers.map((t) => t.id), ["recTEACH000000002"], "the pick list: KXC's teacher only (by organization)");
    r = await call(LEAD, "GET", "course", { q: { id: ID } }); assert.strictEqual(r.body.editable.teachers, true, "the leader edits 授课老师");
    r = await call(LEAD, "PATCH", "field", { body: { id: ID, key: "teachers", value: ["recTEACH000000001"] } }); assert.strictEqual(r.status, 403, "not its teacher"); assert.strictEqual(r.body.code, "not_own_teacher");
    r = await call(LEAD, "PATCH", "field", { body: { id: ID, key: "teachers", value: ["recTEACH000000002"] } }); assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual(r.body.assigned.filter((p) => p.auto).map((p) => p.upn), ["tutor@gmc.edu"], "the teacher with an account is assigned (auto); the manual one stays");
    assert.deepStrictEqual(await C.assignedTo("tutor@gmc.edu"), [ID], "…and may edit the course");
    r = await call(LEAD, "PATCH", "field", { body: { id: ID, key: "teachers", value: [] } }); assert.deepStrictEqual(r.body.assigned.map((p) => p.upn), ["zhang@a.edu"], "taken off: the auto assignment goes, the manual one stays");
    r = await call(CD, "PATCH", "field", { body: { id: ID, key: "teachers", value: ["recTEACH000000001"] } }); assert.strictEqual(r.status, 200, "an approver names anyone");
    await call(CD, "PATCH", "field", { body: { id: ID, key: "teachers", value: ["recTEACH000000001"] } });
  }

  // unassign: the teacher loses the course
  r = await call(CD, "POST", "op", { body: { id: ID, op: "unassign", person: { upn: "zhang@a.edu" } } }); assert.deepStrictEqual(r.body.assigned, []);
  r = await call(TEACHER, "GET", "course", { q: { id: ID } }); assert.strictEqual(r.status, 403);

  // validate() and clean()
  assert.deepStrictEqual(C.clean("grades", ["recGRADE000000009", "bad", "recGRADE000000009"]), ["recGRADE000000009"]);
  assert.deepStrictEqual(C.clean("school", ["recSCHOOL00000001", "recSCHOOL00000002"]), ["recSCHOOL00000001"], "the deliverer is a single link");
  assert.deepStrictEqual(C.clean("language", { zh: "中文" }), { en: "Chinese", zh: "中文" });
  assert.throws(() => C.clean("nameEn", "x".repeat(200)), /120/);
  console.log("courses: all checks passed");
})().catch((e) => { console.error(e); process.exit(1); });
