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
  const form = { kind: "team", familyName: "Zhou", givenName: "Eve", email: "Eve@Gmail.com", phone: "wechat eve", org: "心桥中文", abbr: "xq-c", teachers: "3", intro: "我们是一个教中文阅读的老师团队，已有五年教学经验。", agree: true, domain: "https://www.XQ-Chinese.org/about", country: "美国", sample: "youtu.be/abc", worldview: "yes", frequency: "often", church: "yes", churchKind: "other", churchOther: "改革宗" };
  const base = { familyName: "Wang", givenName: "Ming", email: "w@x.org", sample: "https://example.org/class", worldview: "no", agree: 1 };
  // what is required: names in Latin letters, an international email, a sample / portfolio link, the first faith answer
  let c = A.clean({});
  assert.deepStrictEqual(c.problems, ["kind", "worldview", "sample", "familyName", "givenName", "email", "agree"]);
  assert.deepStrictEqual(A.clean(Object.assign({}, base, { kind: "solo", familyName: "王", givenName: "明" })).problems, ["familyName", "givenName"], "pinyin or English, not 汉字");
  assert.deepStrictEqual(A.clean(Object.assign({}, base, { kind: "solo", email: "w@qq.com" })).problems, ["emailBlocked"], "QQ / 163 refused like the order page");
  assert.deepStrictEqual(A.clean(Object.assign({}, base, { kind: "solo", sample: "not a link" })).problems, ["sample"]);
  // faith in steps: each answer opens the next; the chain is kept only as far as it was followed, and nobody is refused
  assert.deepStrictEqual(A.clean(Object.assign({}, base, { kind: "solo", worldview: "yes" })).problems, ["frequency"]);
  assert.deepStrictEqual(A.clean(Object.assign({}, base, { kind: "solo", worldview: "yes", frequency: "never", church: "yes", churchKind: "house" })).problems, [], "never → the church questions are not asked");
  assert.deepStrictEqual(A.clean(Object.assign({}, base, { kind: "solo", worldview: "yes", frequency: "never", church: "yes", churchKind: "house" })).app.church, "", "…and their answers are not kept");
  assert.deepStrictEqual(A.clean(Object.assign({}, base, { kind: "solo", worldview: "yes", frequency: "often" })).problems, ["church"]);
  assert.deepStrictEqual(A.clean(Object.assign({}, base, { kind: "solo", worldview: "yes", frequency: "often", church: "yes" })).problems, ["churchKind"]);
  assert.deepStrictEqual(A.clean(Object.assign({}, base, { kind: "solo", worldview: "no", frequency: "often", church: "yes", churchKind: "house" })).app.frequency, "", "no → nothing further kept");
  // a team gives its name, short name and own domain; a one-person team none of them
  c = A.clean(Object.assign({}, base, { kind: "team", domain: "gmail.com" }));
  assert.deepStrictEqual(c.problems, ["org", "abbr", "domain"], "a team without its name, short name or own domain (a mail service is not one)");
  c = A.clean(Object.assign({}, base, { kind: "school", org: "某学校", abbr: "MX", needDomain: true, domain: "ignored.org" }));
  assert.deepStrictEqual([c.problems, c.app.needDomain, c.app.domain], [[], true, ""], "no domain yet: Hive creates one, none required");
  c = A.clean(Object.assign({}, base, { kind: "individual", org: "Ignored", abbr: "IGN", domain: "ign.org" }));
  assert.strictEqual(c.problems.length, 0); assert.deepStrictEqual([c.app.kind, c.app.org, c.app.abbr, c.app.domain, c.app.name], ["solo", "Ming Wang", "", "", "Ming Wang"], "a one-person team: its name is the person's; no short name, no domain");
  c = A.clean(form);
  assert.strictEqual(c.problems.length, 0, c.problems.join());
  assert.deepStrictEqual([c.app.email, c.app.abbr, c.app.domain, c.app.teachers, c.app.sample, c.app.worldview, c.app.frequency, c.app.church, c.app.churchKind, c.app.churchOther, "phone" in c.app, "education" in c.app], ["eve@gmail.com", "XQC", "xq-chinese.org", 3, "youtu.be/abc", "yes", "often", "yes", "other", "改革宗", false, false], "the answers kept; no phone, no typed qualifications");
  assert.ok(/听说过圣经世界观 · 经常融入教学 · 有委身的教会生活 · 其它：改革宗/.test(A.faithLine(c.app)), A.faithLine(c.app));
  // the first application: a course relationship at 申请 / 推荐, party apply:<email>
  let r = await A.submit(c.app, { account: "" });
  assert.ok(r.token && r.token.length > 20); const token = r.token; delete r.token;
  assert.deepStrictEqual(r, { id: "REL-000050", again: false, key: "xq-chinese.org" });
  const rel = rels.items["REL-000050"];
  assert.strictEqual(rel.type, "course"); assert.strictEqual(rel.stage, "apply"); assert.strictEqual(rel.source, "application"); assert.strictEqual(rel.confirmed, true);
  assert.strictEqual(rel.region, "na"); assert.strictEqual(rel.party.id, "ORG-000009"); assert.strictEqual(rel.party.name, "心桥中文");
  assert.strictEqual(rel.application.intro, form.intro); assert.strictEqual(rel.application.tokenHash, A.tokenHash(token)); assert.ok(!JSON.stringify(rel).includes(token), "the key itself is not stored");
  assert.strictEqual(orgs.orgs["ORG-000009"].name, "心桥中文");
  // again (security review 2026-10-24): a second form with this email changes NOTHING and gets no key — whoever sent it;
  // the applicant is emailed a fresh link instead, and the first key keeps working for an hour
  const flows0 = []; global.fetch = async (u, o) => { flows0.push(JSON.parse(o.body)); return { ok: true, status: 202 }; }; process.env.POWER_AUTOMATE_URL = "https://flow.example/x";
  r = await A.submit(Object.assign({}, c.app, { intro: "I am someone else", familyName: "Mallory" }), { account: "" });
  assert.deepStrictEqual(r, { id: "REL-000050", again: true, key: "xq-chinese.org" }, "no key for a repeat");
  assert.strictEqual(Object.keys(rels.items).length, 1);
  const after = rels.items["REL-000050"].application;
  assert.strictEqual(after.familyName, "Zhou", "the record is not overwritten"); assert.notStrictEqual(after.tokenHash, A.tokenHash(token), "a fresh key was made…");
  assert.strictEqual(flows0.length, 1); assert.strictEqual(flows0[0].emailTo, "eve@gmail.com", "…and mailed to the applicant, not returned");
  const token2 = decodeURIComponent(/key=([^\s&]+)/.exec(flows0[0].emailBodyText)[1]);
  assert.strictEqual((await A.peek("REL-000050", token)).id, "REL-000050", "the first key still opens it for an hour");
  assert.strictEqual(after.prevTokenHash, A.tokenHash(token));
  // a domain already a provider's (no application on the relationship): nothing attached, nothing sent
  rels.items["REL-000090"] = P.newRelationship({ type: "course", party: { id: "ORG-000001", key: "known-school.org", name: "Known" }, stage: "design" }, "rick", "REL-000090");
  r = await A.submit(A.clean(Object.assign({}, form, { email: "x@known-school.org", domain: "known-school.org" })).app, {});
  assert.deepStrictEqual([r.again, r.token, flows0.length, "application" in rels.items["REL-000090"]], [true, undefined, 1, false]);
  delete process.env.POWER_AUTOMATE_URL;
  // 编辑申请 with the key: the form changes, the key / courses / résumé stay, the email cannot be changed
  rels.items["REL-000050"].application.resume = { key: "applications/REL-000050/resume.pdf", name: "cv.pdf" };
  await A.update("REL-000050", token2, A.clean(Object.assign({}, form, { familyName: "Zhou", givenName: "Evelyn", email: "other@gmail.com", worldview: "no" })).app);
  const ed = rels.items["REL-000050"].application;
  assert.deepStrictEqual([ed.givenName, ed.email, ed.worldview, ed.frequency, ed.resume.name, ed.tokenHash === A.tokenHash(token2)], ["Evelyn", "eve@gmail.com", "no", "", "cv.pdf", true]);
  await assert.rejects(A.update("REL-000050", "wrong", c.app), (e) => e.status === 404);
  // a school with its own domain: keyed by the domain, so an institution of that domain finds it
  r = await A.submit(A.clean({ kind: "solo", familyName: "Lee", givenName: "Ann", email: "ann@gmail.com", intro: "x".repeat(30), agree: 1 }).app, {});
  assert.strictEqual(r.key, "apply:ann@gmail.com", "a one-person team: keyed by the email"); assert.strictEqual(rels.items[r.id].party.key, "apply:ann@gmail.com");
  // the notices' words
  const m = A.texts("REL-000050", Object.assign({}, c.app, { account: "" }));
  assert.ok(/REL-000050/.test(m.ack.subject) && /两周内/.test(m.ack.body)); assert.ok(/#\/ops\/partners\/course\/REL-000050/.test(m.staff));
  assert.ok(/\/teach#app=REL-000050&key=k3y/.test(A.texts("REL-000050", c.app, "k3y").ack.body), "the confirmation carries the continue link (the key in the fragment)");

  // 第 2 步 填写课程: a course draft in the course editor's store, with the application's key
  const C = require(R("api", "shared", "courses.js"));
  const LISTS = { subjects: [{ id: "recSUBJ0000000001", nameZh: "中文", nameEn: "Chinese" }], grades: [{ id: "recGRAD0000000001", name: "G1" }, { id: "recGRAD0000000002", name: "G2" }] };
  const work = {}, made = [];
  C.lookups = async () => LISTS;
  C.create = async (who, opts) => { const id = "newTEST" + String(made.length).padStart(7, "0"); const d = { courseId: id, isNew: true, ownerHive: "", createdBy: who.user, application: opts.application, draft: { fields: Object.assign({ school: [] }, opts.fields) }, history: [] }; work[id] = d; made.push(d); return d; };
  const good = { nameZh: "中文阅读一", subjects: ["recSUBJ0000000001", "recFAKE"], grades: ["recGRAD0000000001"], classType: "Live Course", language: "Chinese", description: "每周一次，读绘本、讲故事、学写字。", numClasses: "16", minSize: "4", maxSize: "8", price: "1200 元", days: ["Tuesday", "Funday"], classTime: "周二 19:00–20:00" };
  await assert.rejects(A.addCourse("REL-000050", "wrong", good), (e) => e.status === 404, "a wrong key: no such application");
  await assert.rejects(A.addCourse("REL-000050", token2, Object.assign({}, good, { grades: [] })), (e) => e.status === 400 && e.problems.includes("grades"));
  r = await A.addCourse("REL-000050", token2, good);
  assert.strictEqual(r.count, 1); const d0 = made[0];
  assert.deepStrictEqual([d0.createdBy, d0.application, d0.draft.fields.subjects, d0.draft.fields.grades, d0.draft.fields.classType, d0.draft.fields.language, d0.draft.fields.numClasses, d0.draft.fields.descriptionZh.slice(0, 4)], ["eve@gmail.com", "REL-000050", ["recSUBJ0000000001"], ["recGRAD0000000001"], { en: "Live Course", zh: "直播课" }, { en: "Chinese", zh: "中文" }, 16, "每周一次"], "the draft: only known subjects, the pair values, numbers");
  assert.ok(/建议价格/.test(d0.draft.fields.comments));
  assert.deepStrictEqual([d0.draft.fields.days, d0.draft.fields.classTime], [["Tuesday"], "周二 19:00–20:00"], "the slots as the editor keeps them; only real weekdays");
  await assert.rejects(A.addCourse("REL-000050", token2, Object.assign({}, good, { subjects: [] })), (e) => e.problems.includes("subjects"));
  const other = await A.addCourse("REL-000050", token2, Object.assign({}, good, { nameZh: "书法", subjects: [], subjectOther: "书法" }));
  assert.ok(/学科（其它）\/ other subject: 书法/.test(made[made.length - 1].draft.fields.comments), "a subject the list has not: noted for the curriculum director"); void other;
  assert.deepStrictEqual(rels.items["REL-000050"].application.courses.map((x) => x.id), [d0.courseId, made[1].courseId], "listed on the application");
  const pk = await A.peek("REL-000050", token2);
  assert.deepStrictEqual([pk.id, pk.courses.length, pk.email, pk.stage, "tokenHash" in pk], ["REL-000050", 2, "eve@gmail.com", "apply", false], "the continue link: the courses so far and the stage, not the key's hash");
  // a key older than a week: expired
  rels.items["REL-000050"].application.tokenAt = new Date(Date.now() - 8 * 864e5).toISOString();
  await assert.rejects(A.peek("REL-000050", token2), (e) => e.status === 410);
  rels.items["REL-000050"].application.tokenAt = new Date().toISOString();
  assert.ok(/Thank you/.test(A.texts("X", Object.assign({}, c.app, { lang: "en" })).ack.body));

  // the résumé: private (applications/<REL>/…), PDF or Word, sniffed — a renamed picture is refused
  const B = require(R("api", "shared", "blob.js")), staged = {}, committed = {};
  B.stageAssetBlock = async (k, id, buf) => { (staged[k] = staged[k] || []).push(buf); };
  B.commitAssetBlocks = async (k, ids, type, cache) => { committed[k] = { type, cache, size: (staged[k] || []).reduce((n, b) => n + b.length, 0) }; };
  const pdf = Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(3000, 65)]);
  await assert.rejects(A.uploadFile("REL-000050", token2, { kind: "resume", name: "cv.pdf", size: 9, index: 0, total: 1, data: Buffer.from("\x89PNG\r\n\x1a\n....").toString("base64") }), (e) => e.code === "bad_type");
  await assert.rejects(A.uploadFile("REL-000050", "nope", { kind: "resume", name: "cv.pdf", size: pdf.length, index: 0, total: 1, data: pdf.toString("base64") }), (e) => e.status === 404, "the key is needed");
  await assert.rejects(A.uploadFile("REL-000050", token2, { kind: "resume", name: "cv.pdf", size: 9, index: 4, total: 4, data: pdf.toString("base64") }), (e) => e.code === "bad_file", "a chunk index past the end");
  await assert.rejects(A.uploadFile("REL-000050", token2, { kind: "resume", name: "cv.pdf", size: 9, index: 1, total: 2, data: pdf.toString("base64"), type: "application/pdf" }), (e) => e.code === "bad_file", "a later chunk without a first");
  r = await A.uploadFile("REL-000050", token2, { kind: "resume", name: "Eve CV.pdf", size: pdf.length, index: 0, total: 1, data: pdf.toString("base64") });
  assert.deepStrictEqual([r.done, r.file.name, committed["applications/REL-000050/resume.pdf"].cache], [true, "Eve CV.pdf", "private, no-store"]);
  assert.strictEqual(rels.items["REL-000050"].application.resume.key, "applications/REL-000050/resume.pdf", "on the application, for staff to read");
  // a syllabus: the file store's upload, as this application; only its own files reach the course
  const FILES = require(R("api", "shared", "files.js")), up = [];
  FILES.upload = async (chunk, by, opts) => { up.push([chunk.id, by, opts.kind, opts.tag]); return { id: "abcdefghij012345", done: true, file: { id: "abcdefghij012345", name: chunk.name } }; };
  const claimed = []; FILES.claim = async (ids, cid) => { claimed.push([ids, cid]); };
  r = await A.uploadFile("REL-000050", token2, { kind: "syllabus", name: "大纲.docx", size: 10, index: 0, total: 1, data: "UEsDBA==", upload: "" });
  assert.deepStrictEqual(up[0], ["", "apply:REL-000050", "syllabus", "REL-000050"], "as the application, tagged with it, Word allowed");
  const J = require(R("api", "shared", "jsonstore.js")); const jread = J.read;
  J.read = async (n, fb) => (n === FILES.INDEX_BLOB ? { items: { abcdefghij012345: { name: "大纲.docx", size: 10, type: FILES.DOCX, by: "apply:REL-000050" }, zzzzzzzzzzzzzzzz: { name: "x.pdf", by: "someone@else" } } } : jread(n, fb));
  r = await A.addCourse("REL-000050", token2, Object.assign({}, good, { nameZh: "中文阅读二", syllabus: [{ id: "abcdefghij012345" }, { id: "zzzzzzzzzzzzzzzz" }] }));
  assert.deepStrictEqual(made[made.length - 1].draft.fields.syllabus.map((x) => [x.id, x.name]), [["abcdefghij012345", "大纲.docx"]], "the syllabus on the course; a stranger's file left out");
  assert.deepStrictEqual(claimed, [[["abcdefghij012345"], made[made.length - 1].courseId]], "the file is claimed by the course, so the sweep leaves it");
  J.read = jread;
  // 找回申请: a fresh key by email, the old one stops working; the same answer for an unknown email
  const flows = []; global.fetch = async (u, o) => { flows.push(JSON.parse(o.body)); return { ok: true, status: 202 }; }; process.env.POWER_AUTOMATE_URL = "https://flow.example/x";
  assert.deepStrictEqual(await A.resend("nobody@example.org"), { ok: true }); assert.strictEqual(flows.length, 0);
  assert.deepStrictEqual(await A.resend("EVE@gmail.com"), { ok: true });
  assert.strictEqual(flows.length, 1); assert.strictEqual(flows[0].emailTo, "eve@gmail.com");
  const k3 = /key=([^\s&]+)/.exec(flows[0].emailBodyText)[1];
  assert.strictEqual((await A.peek("REL-000050", token2)).id, "REL-000050", "the old link still works for an hour");
  rels.items["REL-000050"].application.prevUntil = new Date(Date.now() - 1000).toISOString();
  await assert.rejects(A.peek("REL-000050", token2), (e) => e.status === 404, "…then no more");
  assert.strictEqual((await A.peek("REL-000050", decodeURIComponent(k3))).id, "REL-000050", "the new one does");
  await assert.rejects(A.peek("REL-000050", token), (e) => e.status === 404, "the very first key is long gone");
  delete process.env.POWER_AUTOMATE_URL;

  const adopted = [];
  // 开通 from the application: the open relationship is found by its party key, and hive:XQC now names the same partner
  O._deps({
    findTeam: async () => ({ id: "t", name: "Hive Orders" }), graphList: async () => [], graph: async (m, p, b) => ({ id: "19:xqc", displayName: b.displayName }),
    readBase: () => ({ list: async () => [] }), writeBase: () => ({ table: async () => ({ fields: [] }), create: async () => ({ id: "recXQC" }) }),
    partners: () => P, roles: () => ({ readRoles: async () => ({ entries: [] }), updateRoles: async (fn) => fn({ entries: [] }) }),
    courses: () => ({ lookups: async () => ({}), syncWebsite: async () => ({ ran: true }), adopt: async (ids, hive, sid) => { adopted.push([ids, hive, sid]); return ids; } }), runSync: () => async () => ({}),
  });
  const res = await O.run({ key: "xq-chinese.org", abbr: "XQC", name: "心桥中文", domain: "xq-chinese.org", leader: "eve@xq-chinese.org" }, { by: "rick" });
  const pt = res.steps.find((s) => s.step === "partnership");
  assert.strictEqual(pt.status, "exists", JSON.stringify(res.steps)); assert.ok(/REL-000050/.test(pt.detail));
  assert.strictEqual(orgs.byKey["hive:XQC"], "ORG-000009", "the Schools row's key names the applicant's partner");
  assert.ok(orgs.orgs["ORG-000009"].keys.includes("hive:XQC"));
  assert.strictEqual(Object.values(rels.items).filter((x) => x.party.id === "ORG-000009").length, 1, "no second relationship");
  assert.deepStrictEqual(adopted, [[made.map((d) => d.courseId), "XQC", "recXQC"]], "the courses entered on the website become the provider's");
  assert.strictEqual(res.steps.find((x) => x.step === "courses").status, "done");
  console.log("teach: all assertions passed");
})().catch((e) => { console.error(e); process.exit(1); });
