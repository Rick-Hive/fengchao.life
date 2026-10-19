// 课程方案 (api/shared/schoolPlan.js + api/school-plan): a school's own graduation credit
// requirements and curriculum map — validated against Hive's snapshot, saved as a draft,
// published to the school's families; the website gets only the published part of the
// signed-in family's school, and nothing (Hive's defaults) otherwise.
//
// Run with:  node test/school-plan.test.js
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
const blob = require(path.join(__dirname, "..", "api", "shared", "blob.js"));
const SNAP = {
  k8TrackId: 6,
  tracks: [
    { trackId: 1, nameEn: "Classical", nameZh: "古典", credits: { math: 4, science: 3, english: 4, chinese: 2, bible: 2, speaking: 1, elective: 4 }, totalCredits: 24, serviceHours: 60, commentsEn: "Hive note", commentsZh: "蜂巢备注" },
    { trackId: 2, nameEn: "College prep", nameZh: "大学预备", credits: { math: 4, science: 4, english: 4, chinese: 2, elective: 6 }, totalCredits: 26, serviceHours: 40 },
    { trackId: 6, nameEn: "K-8", nameZh: "K-8", credits: {} },
  ],
  subjects: [{ id: "recMath", nameEn: "Mathematics", nameZh: "数学" }, { id: "recSci", nameEn: "Science", nameZh: "科学" }],
  curriculumMap: {
    rhetoric: { grades: ["G9", "G10", "G11", "G12"], rows: [{ id: "recA", order: 1, subjects: [{ id: "recMath", nameEn: "Mathematics", nameZh: "数学" }], trackIds: [], pedagogy: null, spanAll: false, cells: { G9: [{ en: "Algebra I", zh: "代数一" }], G10: [{ en: "Geometry", zh: "几何" }] } }] },
    dialectic: { grades: ["G7", "G8"], rows: [] },
  },
};
blob.readSnapshot = async () => copy(SNAP);
const SP = require(path.join(__dirname, "..", "api", "shared", "schoolPlan.js"));

// The API: session and audit stubbed; roles come from the principal header.
const session = require(path.join(__dirname, "..", "api", "shared", "session.js"));
session.guard = async (context, req, o) => { const p = req.headers && req.headers["x-ms-client-principal"]; if (p) return { u: "x" }; if (o && o.soft) { context.res = { status: 200, body: { signedIn: false } }; return null; } context.res = { status: 403, body: { code: "signed_out" } }; return null; };
session.finish = () => {};
const rolesMod = require(path.join(__dirname, "..", "api", "shared", "roles.js"));
rolesMod.readRoles = async () => ({ entries: [] });
const people = require(path.join(__dirname, "..", "api", "shared", "people.js"));
people.readInstitutions = async () => ({ institutions: { "a.edu": { name: "甲校", nameEn: "School A" } } });
const auditMod = require(path.join(__dirname, "..", "api", "shared", "audit.js"));
const audits = []; auditMod.audit = async (ctx, e) => { audits.push(e); };
const fn = require(path.join(__dirname, "..", "api", "school-plan", "index.js"));
const principal = (user, roles) => Buffer.from(JSON.stringify({ identityProvider: "aad", userId: "x", userDetails: user, userRoles: ["anonymous", "authenticated"].concat(roles || []) })).toString("base64");
async function call({ method = "GET", query = {}, body = null, user, roles }) {
  const context = { log: Object.assign(() => {}, { error() {}, warn() {} }), res: null };
  await fn(context, { method, query, body, headers: user ? { "x-ms-client-principal": principal(user, roles) } : {} });
  return context.res;
}

(async () => {
  // ---- the module ----
  assert.deepStrictEqual(SP.parseItems("Algebra I / 代数一; Geometry\n几何"), [{ en: "Algebra I", zh: "代数一" }, { en: "Geometry", zh: null }, { en: null, zh: "几何" }], "the sync's cell grammar");
  assert.strictEqual(SP.itemsText([{ en: "Algebra I", zh: "代数一" }, { en: "Geometry", zh: null }]), "Algebra I / 代数一; Geometry");
  const dfl = SP.defaultsFromSnapshot(SNAP);
  assert.deepStrictEqual(dfl.tracks.map((t) => t.trackId), [1, 2], "the K-8 pseudo-track is not a graduation track");
  assert.deepStrictEqual(dfl.map.grammar, { grades: ["K", "G1", "G2", "G3", "G4", "G5", "G6"], rows: [] }, "a stage without a map still has its grades");
  assert.strictEqual(dfl.map.rhetoric.rows.length, 1);
  assert.deepStrictEqual(dfl.subjects.map((s) => s.id), ["recMath", "recSci"]);

  // clean(): unknown tracks and empty rows are refused; numbers, nulls and text cells normalised.
  assert.throws(() => SP.clean({ tracks: { 9: { credits: { math: 1 } } } }, dfl), (e) => e.status === 400 && /unknown graduation track 9/.test(e.problems[0]));
  assert.throws(() => SP.clean({ map: { rhetoric: { rows: [{ subjects: [], cells: { G9: "x" } }] } } }, dfl), (e) => e.status === 400 && /no subject/.test(e.problems[0]));
  const cleaned = SP.clean({
    tracks: { 1: { credits: { math: "5", speaking: null, pe: "" }, totalCredits: 28, serviceHours: "", notes: { zh: "校方说明", en: "" } }, 2: {} },
    map: { rhetoric: { rows: [{ subjects: ["recMath"], trackIds: ["1", 2], spanAll: false, cells: { G9: "Algebra I / 代数一; Algebra II / 代数二", G10: "", G13: "ignored" } }, { subjects: [{ nameEn: "Latin", nameZh: "拉丁文" }], pedagogy: "classical", spanAll: true, cells: { G9: [{ en: "Latin I", zh: "" }] } }] }, dialectic: { rows: [{ subjects: ["recSci"], pedagogy: "classical", trackIds: [1], cells: { G7: "Life science" } }] }, grammar: null },
  }, dfl);
  assert.deepStrictEqual(cleaned.tracks[1], { credits: { math: 5, speaking: null, pe: null }, totalCredits: 28, serviceHours: null, notes: { en: "", zh: "校方说明" } }, "a credit set to null = not required; blank = null too (the website then hides the row)");
  assert.deepStrictEqual(cleaned.tracks[2], { credits: {}, totalCredits: null, serviceHours: null, notes: { en: "", zh: "" } });
  const r0 = cleaned.map.rhetoric.rows[0], r1 = cleaned.map.rhetoric.rows[1];
  assert.deepStrictEqual(r0.subjects, [{ id: "recMath", nameEn: "Mathematics", nameZh: "数学" }], "a subject id resolves to Hive's subject (so courses attach)");
  assert.deepStrictEqual(r0.trackIds, [1, 2]);
  assert.deepStrictEqual(r0.cells, { G9: [{ en: "Algebra I", zh: "代数一" }, { en: "Algebra II", zh: "代数二" }] }, "empty and unknown grades dropped");
  assert.deepStrictEqual(r1.subjects, [{ id: null, nameEn: "Latin", nameZh: "拉丁文" }]);
  assert.strictEqual(r1.pedagogy, null, "pedagogy only on the dialectic stage"); assert.strictEqual(r1.spanAll, true);
  assert.deepStrictEqual(r1.cells, { G9: [{ en: "Latin I", zh: null }] });
  assert.strictEqual(cleaned.map.dialectic.rows[0].pedagogy, "classical"); assert.deepStrictEqual(cleaned.map.dialectic.rows[0].trackIds, [], "tracks only on the rhetoric stage");
  assert.deepStrictEqual(cleaned.map.dialectic.grades, ["G7", "G8"]);
  assert.ok(!("grammar" in cleaned.map), "a stage left null = Hive's default");

  // Draft, publish, families' view.
  let doc = await SP.saveDraft("a.edu", cleaned, "lead@a.edu");
  assert.strictEqual(SP.forFamilies(doc, { domain: "a.edu", name: "甲校" }), null, "a draft is not what families see");
  doc = await SP.publish("a.edu", "lead@a.edu");
  const fam = SP.forFamilies(doc, { domain: "a.edu", name: "甲校", nameEn: "School A" });
  assert.strictEqual(fam.school.name, "甲校"); assert.strictEqual(fam.tracks["1"].credits.math, 5); assert.strictEqual(fam.map.rhetoric.rows.length, 2); assert.ok(fam.publishedAt);
  doc = await SP.saveDraft("a.edu", { tracks: {}, map: {} }, "lead@a.edu");
  assert.strictEqual(SP.forFamilies(doc, null).tracks["1"].credits.math, 5, "editing the draft does not change what is published");
  doc = await SP.unpublish("a.edu", "lead@a.edu");
  assert.strictEqual(SP.forFamilies(doc, null), null);
  doc = await SP.publish("a.edu", "lead@a.edu");
  assert.strictEqual(SP.forFamilies(doc, null), null, "publishing an empty draft = Hive's defaults for families");

  // ---- the API ----
  const LEADER = { user: "lead@a.edu", roles: ["domain_leader:a.edu"] };
  // The editor: a leader of a.edu, 课程总监 and the sysadmin; not an IT 管理员, not a leader of another school.
  let r = await call({ query: { domain: "a.edu" }, user: "it@a.edu", roles: ["domain_it:a.edu"] });
  assert.strictEqual(r.status, 403); assert.strictEqual(r.body.code, "forbidden");
  r = await call({ query: { domain: "a.edu" }, user: "lead@b.org", roles: ["domain_leader:b.org"] });
  assert.strictEqual(r.status, 403);
  r = await call({ query: { domain: "a.edu" }, user: "cd@fengchao.life", roles: ["staff:curriculum"] });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  r = await call({ query: { domain: "a.edu" }, user: "hive.admin@fengchao.life" });
  assert.strictEqual(r.status, 200); assert.strictEqual(r.body.isAdmin, true);
  r = await call({ query: { domain: "a.edu" }, ...LEADER });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.strictEqual(r.body.school.name, "甲校"); assert.strictEqual(r.body.canEdit, true); assert.strictEqual(r.body.isAdmin, false);
  assert.deepStrictEqual(r.body.defaults.tracks.map((t) => t.trackId), [1, 2]); assert.ok(r.body.plan.published && r.body.plan.published.at, "the publish above is visible");
  r = await call({ query: { domain: "not a domain" }, ...LEADER });
  assert.strictEqual(r.status, 400);

  // Save a draft with a problem → 400 with the problems listed; a good one → saved, not published.
  r = await call({ method: "PUT", body: { domain: "a.edu", tracks: { 7: {} } }, ...LEADER });
  assert.strictEqual(r.status, 400); assert.ok(/unknown graduation track 7/.test(r.body.problems[0]));
  r = await call({ method: "PUT", body: { domain: "a.edu", tracks: { 2: { credits: { math: 6 }, totalCredits: 30 } }, map: {} }, ...LEADER });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.strictEqual(r.body.plan.draft.tracks["2"].credits.math, 6); assert.strictEqual(r.body.plan.updatedBy, "lead@a.edu");
  assert.deepStrictEqual(r.body.plan.published.tracks, {}, "still the earlier (empty) publication");
  assert.strictEqual(audits[audits.length - 1].action, "plan.save");
  r = await call({ method: "PUT", body: { domain: "a.edu", tracks: { 2: { credits: { math: 6 }, totalCredits: 30 } }, map: {}, publish: true }, ...LEADER });
  assert.strictEqual(r.status, 200); assert.deepStrictEqual(Object.keys(r.body.plan.published.tracks), ["2"]); assert.strictEqual(audits[audits.length - 1].action, "plan.publish");

  // The website: the signed-in family's school, published part only; a visitor gets null, never a refusal.
  r = await call({ user: "parent@a.edu" });
  assert.strictEqual(r.status, 200); assert.strictEqual(r.body.signedIn, true); assert.strictEqual(r.body.domain, "a.edu");
  assert.strictEqual(r.body.plan.tracks["2"].totalCredits, 30); assert.strictEqual(r.body.plan.school.nameEn, "School A"); assert.ok(!r.body.plan.draft, "no draft leaks to families");
  r = await call({ user: "parent@b.org" });
  assert.strictEqual(r.status, 200); assert.strictEqual(r.body.plan, null, "a school that published nothing: Hive's defaults");
  // The management centre's read-only page (Rick, 2026-10-19): own school, published part + Hive's defaults.
  r = await call({ query: { view: "1" }, user: "parent@a.edu" });
  assert.strictEqual(r.status, 200); assert.strictEqual(r.body.domain, "a.edu"); assert.strictEqual(r.body.canEdit, false);
  assert.strictEqual(r.body.plan.published.tracks["2"].totalCredits, 30); assert.ok(!r.body.plan.draft, "no draft"); assert.ok(r.body.defaults.tracks.length >= 1, "Hive's defaults come along"); assert.strictEqual(r.body.school.nameEn, "School A");
  r = await call({ query: { view: "1", domain: "a.edu" }, user: "parent@b.org" });
  assert.strictEqual(r.status, 403, "another school's plan is not shown");
  r = await call({ query: { view: "1", domain: "a.edu" }, user: "cd@fengchao.life", roles: ["staff:curriculum"] });
  assert.strictEqual(r.status, 200); assert.strictEqual(r.body.canEdit, true, "an editor may view any school");
  r = await call({ query: { view: "1" }, user: "parent@b.org" });
  assert.strictEqual(r.status, 200); assert.strictEqual(r.body.plan.published, null, "nothing published: the page shows Hive's defaults");
  r = await call({});
  assert.strictEqual(r.status, 200); assert.strictEqual(r.body.plan, null); assert.strictEqual(r.body.signedIn, false);
  r = await call({ method: "PUT", body: { domain: "a.edu", unpublish: true }, ...LEADER });
  assert.strictEqual(r.status, 200); assert.strictEqual(r.body.plan.published, null); assert.strictEqual(audits[audits.length - 1].action, "plan.unpublish");
  r = await call({ user: "parent@a.edu" });
  assert.strictEqual(r.body.plan, null, "after 撤回发布 families see Hive's defaults again");
  r = await call({ method: "PUT", body: { domain: "a.edu" }, user: "parent@a.edu" });
  assert.strictEqual(r.status, 403, "a parent cannot write");

  console.log("school-plan: all assertions passed");
})().catch((e) => { console.error(e); process.exit(1); });
