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
  const form = { kind: "team", christian: true, familyName: "Zhou", givenName: "Eve", email: "Eve@Gmail.com", phone: "wechat eve", org: "心桥中文", abbr: "xq-c", teachers: "3", intro: "我们是一个教中文阅读的老师团队，已有五年教学经验。", agree: true, domain: "https://www.XQ-Chinese.org/about", country: "美国", education: "master", years: "6", certificates: "TESOL" };
  const base = { christian: true, familyName: "Wang", givenName: "Ming", email: "w@x.org", intro: "x".repeat(20), agree: 1 };
  // what is required: a Christian (the page never sends "no"), names in Latin letters, an international email
  let c = A.clean({});
  assert.deepStrictEqual(c.problems, ["kind", "christian", "familyName", "givenName", "email", "intro", "agree"]);
  assert.deepStrictEqual(A.clean(Object.assign({}, base, { kind: "solo", familyName: "王", givenName: "明" })).problems, ["familyName", "givenName"], "pinyin or English, not 汉字");
  assert.deepStrictEqual(A.clean(Object.assign({}, base, { kind: "solo", email: "w@qq.com" })).problems, ["emailBlocked"], "QQ / 163 refused like the order page");
  assert.deepStrictEqual(A.clean(Object.assign({}, base, { kind: "solo", christian: false })).problems, ["christian"]);
  // a team gives its name, short name and own domain; a one-person team none of them
  c = A.clean(Object.assign({}, base, { kind: "team", domain: "gmail.com" }));
  assert.deepStrictEqual(c.problems, ["org", "abbr", "domain"], "a team without its name, short name or own domain (a mail service is not one)");
  c = A.clean(Object.assign({}, base, { kind: "school", org: "某学校", abbr: "MX", intro: "我们学校想开设几门古典课程。", needDomain: true, domain: "ignored.org" }));
  assert.deepStrictEqual([c.problems, c.app.needDomain, c.app.domain], [[], true, ""], "no domain yet: Hive creates one, none required");
  c = A.clean(Object.assign({}, base, { kind: "individual", org: "Ignored", abbr: "IGN", domain: "ign.org" }));
  assert.strictEqual(c.problems.length, 0); assert.deepStrictEqual([c.app.kind, c.app.org, c.app.abbr, c.app.domain, c.app.name], ["solo", "Ming Wang", "", "", "Ming Wang"], "a one-person team: its name is the person's; no short name, no domain");
  c = A.clean(form);
  assert.strictEqual(c.problems.length, 0, c.problems.join());
  assert.deepStrictEqual([c.app.email, c.app.abbr, c.app.domain, c.app.teachers, c.app.education, c.app.years, c.app.certificates, c.app.christian, "phone" in c.app], ["eve@gmail.com", "XQC", "xq-chinese.org", 3, "master", 6, "TESOL", true, false], "the qualifications kept; no phone or WeChat");
  // the first application: a course relationship at 申请 / 推荐, party apply:<email>
  let r = await A.submit(c.app, { account: "" });
  assert.ok(r.token && r.token.length > 20); const token = r.token; delete r.token;
  assert.deepStrictEqual(r, { id: "REL-000050", again: false, key: "xq-chinese.org" });
  const rel = rels.items["REL-000050"];
  assert.strictEqual(rel.type, "course"); assert.strictEqual(rel.stage, "apply"); assert.strictEqual(rel.source, "application"); assert.strictEqual(rel.confirmed, true);
  assert.strictEqual(rel.region, "na"); assert.strictEqual(rel.party.id, "ORG-000009"); assert.strictEqual(rel.party.name, "心桥中文");
  assert.strictEqual(rel.application.intro, form.intro); assert.strictEqual(rel.application.tokenHash, A.tokenHash(token)); assert.ok(!JSON.stringify(rel).includes(token), "the key itself is not stored");
  assert.strictEqual(orgs.orgs["ORG-000009"].name, "心桥中文");
  // again: the same relationship, the form replaced, the log says so
  r = await A.submit(Object.assign({}, c.app, { intro: c.app.intro + " 也教写作。" }), { account: "eve@xq.fengchao.life" });
  assert.ok(r.token && r.token !== token, "applying again gives a new key"); const token2 = r.token; delete r.token; assert.deepStrictEqual(r, { id: "REL-000050", again: true, key: "xq-chinese.org" });
  assert.strictEqual(Object.keys(rels.items).length, 1);
  assert.ok(/也教写作/.test(rels.items["REL-000050"].application.intro)); assert.strictEqual(rels.items["REL-000050"].application.account, "eve@xq.fengchao.life");
  assert.ok(rels.items["REL-000050"].application.firstAt <= rels.items["REL-000050"].application.at);
  assert.ok(/再次提交/.test(rels.items["REL-000050"].log.slice(-1)[0].text));
  // a school with its own domain: keyed by the domain, so an institution of that domain finds it
  r = await A.submit(A.clean({ kind: "solo", familyName: "Lee", givenName: "Ann", email: "ann@gmail.com", intro: "x".repeat(30), agree: 1 }).app, {});
  assert.strictEqual(r.key, "apply:ann@gmail.com", "a one-person team: keyed by the email"); assert.strictEqual(rels.items[r.id].party.key, "apply:ann@gmail.com");
  // the notices' words
  const m = A.texts("REL-000050", Object.assign({}, c.app, { account: "" }));
  assert.ok(/REL-000050/.test(m.ack.subject) && /两周内/.test(m.ack.body)); assert.ok(/#\/ops\/partners\/course\/REL-000050/.test(m.staff));
  assert.ok(/\/teach\?app=REL-000050&key=k3y/.test(A.texts("REL-000050", c.app, "k3y").ack.body), "the confirmation carries the continue link");

  // 第 2 步 填写课程: a course draft in the course editor's store, with the application's key
  const C = require(R("api", "shared", "courses.js"));
  const LISTS = { subjects: [{ id: "recSUBJ0000000001", nameZh: "中文", nameEn: "Chinese" }], grades: [{ id: "recGRAD0000000001", name: "G1" }, { id: "recGRAD0000000002", name: "G2" }] };
  const work = {}, made = [];
  C.lookups = async () => LISTS;
  C.create = async (who, opts) => { const id = "newTEST" + String(made.length).padStart(7, "0"); const d = { courseId: id, isNew: true, ownerHive: "", createdBy: who.user, application: opts.application, draft: { fields: Object.assign({ school: [] }, opts.fields) }, history: [] }; work[id] = d; made.push(d); return d; };
  const good = { nameZh: "中文阅读一", subjects: ["recSUBJ0000000001", "recFAKE"], grades: ["recGRAD0000000001"], classType: "Live Course", language: "Chinese", description: "每周一次，读绘本、讲故事、学写字。", numClasses: "16", minSize: "4", maxSize: "8", price: "1200 元" };
  await assert.rejects(A.addCourse("REL-000050", "wrong", good), (e) => e.status === 404, "a wrong key: no such application");
  await assert.rejects(A.addCourse("REL-000050", token2, Object.assign({}, good, { grades: [] })), (e) => e.status === 400 && e.problems.includes("grades"));
  r = await A.addCourse("REL-000050", token2, good);
  assert.strictEqual(r.count, 1); const d0 = made[0];
  assert.deepStrictEqual([d0.createdBy, d0.application, d0.draft.fields.subjects, d0.draft.fields.grades, d0.draft.fields.classType, d0.draft.fields.language, d0.draft.fields.numClasses, d0.draft.fields.descriptionZh.slice(0, 4)], ["eve@gmail.com", "REL-000050", ["recSUBJ0000000001"], ["recGRAD0000000001"], { en: "Live Course", zh: "直播课" }, { en: "Chinese", zh: "中文" }, 16, "每周一次"], "the draft: only known subjects, the pair values, numbers");
  assert.ok(/建议价格/.test(d0.draft.fields.comments));
  assert.deepStrictEqual(rels.items["REL-000050"].application.courses.map((x) => x.id), [d0.courseId], "listed on the application");
  const pk = await A.peek("REL-000050", token2);
  assert.deepStrictEqual([pk.id, pk.courses.length, pk.email, "tokenHash" in pk], ["REL-000050", 1, "eve@gmail.com", false], "the continue link: the courses so far, not the key's hash");
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
  r = await A.uploadFile("REL-000050", token2, { kind: "resume", name: "Eve CV.pdf", size: pdf.length, index: 0, total: 1, data: pdf.toString("base64") });
  assert.deepStrictEqual([r.done, r.file.name, committed["applications/REL-000050/resume.pdf"].cache], [true, "Eve CV.pdf", "private, no-store"]);
  assert.strictEqual(rels.items["REL-000050"].application.resume.key, "applications/REL-000050/resume.pdf", "on the application, for staff to read");
  // a syllabus: the file store's upload, as this application; only its own files reach the course
  const FILES = require(R("api", "shared", "files.js")), up = [];
  FILES.upload = async (chunk, by, opts) => { up.push([chunk.id, by, opts.kind]); return { id: "abcdefghij012345", done: true, file: { id: "abcdefghij012345", name: chunk.name } }; };
  r = await A.uploadFile("REL-000050", token2, { kind: "syllabus", name: "大纲.docx", size: 10, index: 0, total: 1, data: "UEsDBA==", upload: "" });
  assert.deepStrictEqual(up[0], ["", "apply:REL-000050", "syllabus"], "as the application, Word allowed");
  const J = require(R("api", "shared", "jsonstore.js")); const jread = J.read;
  J.read = async (n, fb) => (n === FILES.INDEX_BLOB ? { items: { abcdefghij012345: { name: "大纲.docx", size: 10, type: FILES.DOCX, by: "apply:REL-000050" }, zzzzzzzzzzzzzzzz: { name: "x.pdf", by: "someone@else" } } } : jread(n, fb));
  r = await A.addCourse("REL-000050", token2, Object.assign({}, good, { nameZh: "中文阅读二", syllabus: [{ id: "abcdefghij012345" }, { id: "zzzzzzzzzzzzzzzz" }] }));
  assert.deepStrictEqual(made[1].draft.fields.syllabus.map((x) => [x.id, x.name]), [["abcdefghij012345", "大纲.docx"]], "the syllabus on the course; a stranger's file left out");
  J.read = jread;
  // 找回申请: a fresh key by email, the old one stops working; the same answer for an unknown email
  const flows = []; global.fetch = async (u, o) => { flows.push(JSON.parse(o.body)); return { ok: true, status: 202 }; }; process.env.POWER_AUTOMATE_URL = "https://flow.example/x";
  assert.deepStrictEqual(await A.resend("nobody@example.org"), { ok: true }); assert.strictEqual(flows.length, 0);
  assert.deepStrictEqual(await A.resend("EVE@gmail.com"), { ok: true });
  assert.strictEqual(flows.length, 1); assert.strictEqual(flows[0].emailTo, "eve@gmail.com");
  const k3 = /key=([^\s&]+)/.exec(flows[0].emailBodyText)[1];
  await assert.rejects(A.peek("REL-000050", token2), (e) => e.status === 404, "the old link no longer works");
  assert.strictEqual((await A.peek("REL-000050", decodeURIComponent(k3))).id, "REL-000050", "the new one does");
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
  assert.deepStrictEqual(adopted, [[[d0.courseId, made[1].courseId], "XQC", "recXQC"]], "the courses entered on the website become the provider's");
  assert.strictEqual(res.steps.find((x) => x.step === "courses").status, "done");
  console.log("teach: all assertions passed");
})().catch((e) => { console.error(e); process.exit(1); });
