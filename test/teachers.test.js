// 教师资料 (api/shared/teachers.js): who may edit, the draft, submit / return / approve → Airtable + the sync request.
const assert = require("assert");
const path = require("path");
const Module = require("module");
const realResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) { if (request === "@azure/storage-blob") return "@azure/storage-blob"; return realResolve.call(this, request, parent, ...rest); };
require.cache["@azure/storage-blob"] = { id: "@azure/storage-blob", filename: "@azure/storage-blob", loaded: true, exports: { BlobServiceClient: { fromConnectionString() { throw new Error("no storage in tests"); } } } };
delete process.env.STORAGE_CONNECTION_STRING;
process.env.AIRTABLE_PAT = "pat-read"; process.env.AIRTABLE_HIVE_WRITE_PAT = "pat-write";
const R = (...p) => path.join(__dirname, "..", ...p);
const blobs = {}, copy = (x) => JSON.parse(JSON.stringify(x));
const jsonstore = require(R("api", "shared", "jsonstore.js"));
jsonstore.read = async (name, fallback) => (blobs[name] ? copy(blobs[name]) : (typeof fallback === "function" ? fallback() : copy(fallback)));
jsonstore.write = async (name, doc) => { blobs[name] = copy(doc); };
jsonstore.update = async (name, fallback, mutate) => { const doc = await jsonstore.read(name, fallback); const result = await mutate(doc); if (result !== false) blobs[name] = copy(doc); return { doc, result, written: result !== false }; };
const blobMod = require(R("api", "shared", "blob.js"));
const assets = {};
blobMod.writeAsset = async (key, buf, type) => { assets[key] = { size: buf.length, type }; };
const cfg = require(R("api", "shared", "config.js"));
const writes = [];
const fieldDef = (name, type) => ({ id: "fld" + name.replace(/\W/g, "").slice(0, 10), name, type });
const teacherTable = { id: cfg.tables.teachers.id, name: "Teachers", fields: [fieldDef("Name", "singleLineText"), fieldDef("Biography", "multilineText"), fieldDef("Expertise", "multilineText"), fieldDef("Photo", "multipleAttachments")] };
class FakeBase { constructor(id, pat) { this.pat = pat; } async table() { return teacherTable; } async update(tableId, id, fields, opts) { assert.strictEqual(this.pat, "pat-write"); writes.push({ tableId, id, fields }); return { id, fields }; } }
const C = require(R("api", "shared", "courses.js"));
C._test.baseFor({ read: () => new FakeBase(cfg.baseId, "pat-read"), write: () => new FakeBase(cfg.baseId, "pat-write") });
const T = require(R("api", "shared", "teachers.js"));

const snap = {
  teacherProfiles: [{ id: "recT1", name: "Zhang Lao", bio: "Old bio", expertise: "", photoUrl: null, subjects: "Math", organization: "BES" }, { id: "recT2", name: "Mr Lee", bio: "Science", expertise: "Labs", photoUrl: "/api/asset?key=teachers/recT2.jpg" }, { id: "recT4", name: "IEW Tutor", bio: "", expertise: "", photoUrl: null, organization: "IEW" }],
  private: { teachers: [{ id: "recT1", name: "Zhang Lao", teamsAccount: "zhang@bes.edu" }, { id: "recT2", name: "Mr Lee", teamsAccount: "lee@kxc.edu" }, { id: "recT3", name: "Nobody", teamsAccount: "" }, { id: "recT4", name: "IEW Tutor", teamsAccount: "tutor@gmail.com", organization: "IEW" }], schoolRouting: { KXC: { name: "Kids X Center", abbr: "KXC", domain: "kxc.edu" }, IEW: { name: "IEW Inc.", abbr: "IEW", domain: "" } } },
};
(async () => {
  // who may edit
  const teacher = T.whoIs("Zhang@bes.edu", [], snap), leader = T.whoIs("head@bes.edu", ["domain_leader:bes.edu"], snap), director = T.whoIs("cd@fengchao.life", ["staff:curriculum"], snap), nobody = T.whoIs("x@kxc.edu", [], snap);
  const t1 = teacher.all.find((t) => t.id === "recT1"), t2 = teacher.all.find((t) => t.id === "recT2");
  assert.ok(teacher.mine && teacher.mine.id === "recT1" && T.mayEdit(teacher, t1) && !T.mayEdit(teacher, t2), "a teacher edits only their own record (account matched case-insensitively)");
  assert.ok(!leader.mine && T.mayEdit(leader, t1) && !T.mayEdit(leader, t2), "the school's leader edits the school's teachers, not another school's");
  assert.ok(director.approver && T.mayEdit(director, t1) && T.mayEdit(director, t2), "the curriculum director edits and approves every record");
  assert.ok(!nobody.mine && !T.mayEdit(nobody, t1), "anyone else edits nothing");
  assert.deepStrictEqual(T.visible(leader).map((t) => t.id), ["recT1"], "the leader lists the school's teachers");
  assert.deepStrictEqual(T.visible(director).map((t) => t.id), ["recT1", "recT2", "recT3", "recT4"], "approvers list everyone");
  // 蜂巢课程负责人 (v3): the explicit role → the hive's teachers by its domain, or by the Teachers row's organization
  const kxcLead = T.whoIs("ops@fengchao.life", ["provider:KXC"], snap), iewLead = T.whoIs("ops@fengchao.life", ["provider:IEW"], snap);
  assert.deepStrictEqual(T.visible(kxcLead).map((t) => t.id), ["recT2"], "KXC's leader: the kxc.edu teacher");
  assert.deepStrictEqual(T.visible(iewLead).map((t) => t.id), ["recT4"], "IEW has no domain: its teachers by organization");
  assert.ok(T.mayEdit(iewLead, teacher.all.find((t) => t.id === "recT4")) && !T.mayEdit(iewLead, t1) && !iewLead.approver, "edits its own, approves nothing");
  assert.deepStrictEqual((await T.list(leader))[0], { id: "recT1", name: "Zhang Lao", teamsAccount: "zhang@bes.edu", domain: "bes.edu", organization: "BES", photoUrl: null, hasBio: true, hasExpertise: false, status: "", updatedAt: null, submittedAt: null, mine: false });

  // the draft
  let d = await T.saveField(t1, "bio", "New bio", "zhang@bes.edu");
  assert.ok(d.status === "draft" && d.draft.bio === "New bio" && d.baseline.bio === "Old bio" && d.history[0].action === "save" && d.history[0].fields.join() === "bio", "a saved field is a draft over the baseline");
  d = await T.saveField(t1, "expertise", "Arithmetic", "zhang@bes.edu");
  assert.deepStrictEqual(d.history[0].fields, ["bio", "expertise"], "saves within ten minutes fold into one history line");
  await assert.rejects(T.saveField(t1, "name", "x", "zhang@bes.edu"), /not an editable field/);
  const jpeg = "data:image/jpeg;base64," + Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(2000, 1)]).toString("base64");
  d = await T.savePhoto(t1, jpeg, "head@bes.edu");
  assert.ok(d.draft.photo && d.draft.photo.key === "teachers/work/recT1.jpg" && assets["teachers/work/recT1.jpg"].type === "image/jpeg" && d.history[0].action === "photo" && d.history[0].by === "head@bes.edu", "the photo lands in the assets and the history says who");
  await assert.rejects(T.savePhoto(t1, "data:image/png;base64,AAAA", "x"), /JPEG/);
  const idx = await T.readIndex();
  assert.deepStrictEqual(idx.items.recT1.status, "draft");

  // submit → return → submit → approve
  d = await T.submit(t1, "zhang@bes.edu"); assert.ok(d.status === "submitted" && d.submitted.by === "zhang@bes.edu");
  d = await T.giveBack(t1, "cd@fengchao.life", "太短"); assert.ok(d.status === "draft" && d.returned.comment === "太短" && !d.submitted);
  await T.submit(t1, "zhang@bes.edu");
  const r = await T.approve(t1, "cd@fengchao.life");
  assert.deepStrictEqual(r.written.sort(), ["bio", "expertise", "photo"], "approve writes the changed fields and the photo");
  assert.strictEqual(writes.length, 1);
  assert.deepStrictEqual(Object.keys(writes[0].fields).sort(), ["Biography", "Expertise", "Photo"]);
  assert.ok(/^https:\/\/www\.fengchao\.life\/api\/asset\?key=teachers%2Fwork%2FrecT1\.jpg$/.test(writes[0].fields.Photo[0].url), "the photo is an absolute site URL Airtable can fetch: " + writes[0].fields.Photo[0].url);
  assert.ok(r.doc.status === "published" && r.doc.baseline.bio === "New bio" && r.doc.published.by === "cd@fengchao.life");
  assert.strictEqual((await jsonstore.read(C.SYNC_BLOB, () => ({}))).pending, true, "the website sync is requested");
  // a second approve with nothing changed writes nothing
  const r2 = await T.approve(t1, "cd@fengchao.life");
  assert.deepStrictEqual(r2.written, [], "nothing changed since → nothing written");
  assert.strictEqual(writes.length, 1, "and no Airtable call");
  assert.strictEqual(r.doc.baseline.photoUrl.indexOf("/api/asset?key=teachers%2Fwork%2FrecT1.jpg"), 0, "the baseline keeps the photo URL");
  console.log("teachers: all assertions passed");
})().catch((e) => { console.error(e); process.exit(1); });
