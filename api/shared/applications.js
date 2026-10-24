// 我要教课 / I want to teach (Rick 2026-10-22: 「请按照你建议的流程设计“成为课程提供方”，网站上 menu 叫“我要教课”」).
//
// The website's application form lands here, and becomes the first stage of the same 课程提供方 partnership the
// management centre already runs — no separate queue to look after:
//
//   网站申请  →  合作伙伴 › 课程提供方，阶段「申请 / 推荐」(source "application", the form on rel.application)
//   审核      →  the education community manager talks to the applicant and moves the stage by hand
//   开通      →  课程设计与上架: 开通… (api/shared/onboard.js) — orders channel, Schools row, leader; a team without a
//               domain works too (the relationship's party key is "apply:<email>", aliased to hive:<KEY> on 开通)
//   上架      →  the leader creates courses in the management centre; the curriculum director publishes them
//
// One applicant, one open relationship: applying again (same email, or the same domain) adds to the log and
// replaces the form, it does not open a second relationship. The applicant gets an acknowledgement and the CRM
// channel a notice, both through the Power Automate flow the orders use (best effort: the relationship is the record).
const P = require("./partners");
const tokenHash = (t) => require("crypto").createHash("sha256").update(String(t || "")).digest("hex");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DOMAIN_RE = /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/;
const KINDS = { solo: ["一人团队", "One-person team"], team: ["多人团队", "Teaching team"], school: ["学校 / 机构", "School / organisation"] };
const OLD_KINDS = { individual: "solo" }; // the first form's word (2026-10-22 morning)
const LANGS = { zh: ["中文", "Chinese"], en: ["英文", "English"], both: ["中英双语", "Chinese and English"] };
// mail and consumer domains are an address, not an organisation
const PUBLIC_MAIL = /^(gmail|googlemail|outlook|hotmail|live|msn|yahoo|icloud|me|mac|aol|proton|protonmail|qq|vip\.qq|foxmail|163|126|yeah|sina|sohu|aliyun|139|189)\.[a-z.]+$/;
// enough words to read: 10 characters of Chinese say as much as 20 of English
const longEnough = (t) => String(t || "").trim().length >= (/[\u3400-\u9fff]/.test(String(t || "")) ? 10 : 20);
const YESNO = (v) => (v === "yes" || v === true ? "yes" : v === "no" || v === false ? "no" : "");
const FREQUENCY = ["never", "sometimes", "often", "always"];
const CHURCH = ["house", "tspm", "online", "other"];
const LATIN_NAME = /^[A-Za-z\u00C0-\u024F][A-Za-z\u00C0-\u024F .'-]*$/;
const { blockedEmail } = require("./safe-email");
const fullName = (a) => (/[\u3400-\u9fff]/.test(a.familyName + a.givenName) ? a.familyName + a.givenName : [a.givenName, a.familyName].filter(Boolean).join(" "));

// The wizard's three pages (Rick 2026-10-22): 团队类型 → 您的资料 → 教学介绍. A team or a school manages its people on
// its own domain, so it gives one (and a short name for its orders channel); a one-person team needs neither. 姓 and 名
// apart, real ones: the Teams account is made from them at 开通. No phone or WeChat; no public name.
function clean(body) {
  const s = (v, n) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, n);
  const long = (v, n) => String(v == null ? "" : v).replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, n);
  const b = body || {};
  const kind = KINDS[b.kind] ? b.kind : OLD_KINDS[b.kind] || "";
  const group = kind === "team" || kind === "school";
  const a = {
    kind,
    familyName: s(b.familyName, 40), givenName: s(b.givenName, 40), email: s(b.email, 200).toLowerCase(),
    org: group ? s(b.org, 120) : "", abbr: group ? s(b.abbr, 12).toUpperCase().replace(/[^A-Z0-9]/g, "") : "",
    needDomain: group && !!b.needDomain,
    domain: group && !b.needDomain ? s(b.domain, 120).toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/[/?#].*$/, "") : "",
    website: s(b.website, 200), country: s(b.country, 60), city: s(b.city, 60),
    language: LANGS[b.language] ? b.language : "", teachers: group ? Math.max(0, Math.min(999, parseInt(b.teachers, 10) || 0)) : 1,
    intro: long(b.intro, 3000), sample: s(b.sample, 500),
    // 教学资质 (Rick 2026-10-23): the résumé (a file, uploadFile) and the sample class / portfolio link say it all —
    // no degree, years or certificates to type. Faith is asked in steps, each answer opening the next, none closing the
    // door (Rick: 「出于礼貌和安全最好不是马上拒绝」): the reviewer reads them, nobody is turned away by a form.
    worldview: YESNO(b.worldview), frequency: FREQUENCY.includes(b.frequency) ? b.frequency : "", church: YESNO(b.church),
    churchKind: CHURCH.includes(b.churchKind) ? b.churchKind : "", churchOther: s(b.churchOther, 120),
    lang: b.lang === "en" ? "en" : "zh",
  };
  // only the answers the chain reached are kept
  if (a.worldview !== "yes") { a.frequency = ""; a.church = ""; a.churchKind = ""; a.churchOther = ""; }
  else if (!a.frequency || a.frequency === "never") { a.church = ""; a.churchKind = ""; a.churchOther = ""; }
  else if (a.church !== "yes") { a.churchKind = ""; a.churchOther = ""; }
  if (a.churchKind !== "other") a.churchOther = "";
  a.name = fullName(a);
  if (!group) a.org = a.name;
  const problems = [];
  if (!a.kind) problems.push("kind");
  if (!a.worldview) problems.push("worldview");
  else if (a.worldview === "yes" && !a.frequency) problems.push("frequency");
  else if (a.worldview === "yes" && a.frequency !== "never" && !a.church) problems.push("church");
  else if (a.church === "yes" && !a.churchKind) problems.push("churchKind");
  // 示范课与作品集: a link, required (the résumé is required too, but arrives as a file right after)
  if (!/^(https?:\/\/)?[^\s/]+\.[a-z]{2,}(\/\S*)?$/i.test(a.sample)) problems.push("sample");
  // pinyin or an English name: the Teams account is made from it
  if (!a.familyName || !LATIN_NAME.test(a.familyName)) problems.push("familyName");
  if (!a.givenName || !LATIN_NAME.test(a.givenName)) problems.push("givenName");
  if (!EMAIL_RE.test(a.email)) problems.push("email");
  else if (blockedEmail(a.email)) problems.push("emailBlocked");
  if (group && !a.org) problems.push("org");
  if (group && (a.abbr.length < 2 || a.abbr.length > 8)) problems.push("abbr");
  // a team or a school with no domain yet asks Hive to create one (Rick 2026-10-22) — then none is required
  if (group && !a.needDomain && (!DOMAIN_RE.test(a.domain) || PUBLIC_MAIL.test(a.domain))) problems.push("domain");
  if (!b.agree) problems.push("agree");
  return { app: a, problems };
}

// The party key: the organisation's own domain when it gave one, else the applicant's email.
const keyOf = (a) => a.domain || "apply:" + a.email;
// what the applicant typed and may edit later (编辑申请); never the key, the courses or the résumé
const FORM_KEYS = ["kind", "familyName", "givenName", "org", "abbr", "needDomain", "domain", "website", "country", "city", "teachers", "sample", "worldview", "frequency", "church", "churchKind", "churchOther", "intro"];

// Store the application on a new 课程提供方 relationship. `account` = the signed-in UPN, the platform's word.
//
// A second form with an email or a domain that already has an open relationship does NOT touch that relationship and
// gets no key (security review 2026-10-24: a stranger who knows an applicant's email could otherwise take the
// application over — read it, overwrite the résumé, plant courses — and the applicant's own link would die). The
// existing applicant gets a fresh link by email instead (as 用邮箱找回), and the caller is told only `again: true`.
// A domain that is already a provider's (a relationship without an application) is answered the same way, with nothing
// sent: the provider's people edit courses in the management centre.
async function submit(a, opts) {
  opts = opts || {};
  const now = new Date().toISOString(), by = opts.account || a.email;
  const token = require("crypto").randomBytes(24).toString("base64url");
  const application = Object.assign({}, a, { account: opts.account || "", at: now, firstAt: now, tokenHash: tokenHash(token), tokenAt: now, courses: [] });
  const key = keyOf(a), region = P.regionOf({ country: a.country, city: a.city, domain: a.domain });
  const openIn = (d, orgId) => Object.values(d.items || {}).find((r) => r && r.type === "course" && !r.closed && ((r.party && (r.party.key === key || (orgId && r.party.id === orgId))) || (r.application && r.application.email === a.email)));
  const orgs0 = await P.readOrgs();
  const rels0 = await P.readRels();
  const open0 = openIn(rels0, orgs0.byKey[key] || null);
  if (open0) {
    if (open0.application && open0.application.email === a.email) await resend(a.email, opts);
    return { id: open0.id, again: true, key };
  }
  // a new partner: its ORG id first, then the relationship (re-checked inside, should two forms cross)
  const { doc: od } = await P.updateOrgs((o) => { P.orgIdFor(o, key, { name: a.org, region, orgType: KINDS[a.kind][0] }); });
  const party = { id: od.byKey[key], key, name: a.org };
  let out = null;
  await P.updateRels((d) => {
    const open = openIn(d, party.id);
    if (open) { out = { id: open.id, again: true, key }; return false; }
    const id = P.pad(d.next++);
    const rel = P.newRelationship({ type: "course", party, stage: "apply", source: "application", region, lang: a.lang, note: "网站「我要教课」申请 / applied on the website" }, by, id);
    rel.confirmed = true;
    rel.application = application;
    d.items[id] = rel; out = { id, again: false, key, token };
  });
  return out;
}

// 编辑申请: the applicant changes the form with the key (the résumé, the courses and the key itself stay).
async function update(relId, token, a) {
  const cur = await openApp(relId, token);
  const keep = { account: cur.account, at: new Date().toISOString(), firstAt: cur.firstAt || cur.at, tokenHash: cur.tokenHash, tokenAt: cur.tokenAt, prevTokenHash: cur.prevTokenHash, prevUntil: cur.prevUntil, courses: cur.courses || [], resume: cur.resume || null };
  await P.updateRels((d) => {
    const r = d.items[relId]; if (!r || !r.application) return false;
    r.application = Object.assign({}, a, keep, { email: cur.email }); // the email is the record's identity: it stays
    if (r.party && a.org && r.party.name !== a.org) r.party.name = a.org;
    r.log.push(P.logEntry(cur.email, "note", "网站申请 · 修改了申请 / application edited"));
    r.updatedAt = keep.at;
  });
  return { id: relId };
}

// ---- 第 2 步 填写课程 (Rick 2026-10-22: 「保存后，进入下一步，调用创建课程的模块，让用户输入详细课程信息。照片可以等课程批准
// 后用户自己上传更新」) ----------------------------------------------------------------------------------------------
// The course editor's own draft (courses.create): a new course, unowned until 开通 hands it to the provider (adopt), seen
// at once by the curriculum director in 课程管理 and linked from the application. The website's pick lists are the
// editor's (subjects, grades) — names and ids only.
const MAX_COURSES = 10, TOKEN_DAYS = 7;
async function pickLists() {
  const l = await require("./courses").lookups();
  const C = require("./courses");
  return { subjects: (l.subjects || []).map((x) => ({ id: x.id, nameEn: x.nameEn || "", nameZh: x.nameZh || "" })), grades: (l.grades || []).map((x) => ({ id: x.id, name: x.name })),
    classTypes: C.PAIR_VALUES.classType.map(([en, zh]) => ({ en, zh })), languages: C.PAIR_VALUES.language.map(([en, zh]) => ({ en, zh })), days: C.DAYS.slice() };
}
function cleanCourse(c, lists, lang) {
  const s = (v, n) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, n);
  const long = (v, n) => String(v == null ? "" : v).replace(/\r\n?/g, "\n").trim().slice(0, n);
  const num = (v, lo, hi) => { const n = parseInt(v, 10); return Number.isFinite(n) && n >= lo && n <= hi ? n : null; };
  c = c || {};
  const subj = new Set(lists.subjects.map((x) => x.id)), grd = new Set(lists.grades.map((x) => x.id));
  const pair = (list, en) => { const hit = list.find((x) => x.en === en); return hit ? { en: hit.en, zh: hit.zh } : { en: "", zh: "" }; };
  const desc = long(c.description, 4000);
  const f = {
    nameZh: s(c.nameZh, 120), nameEn: s(c.nameEn, 120),
    subjects: (Array.isArray(c.subjects) ? c.subjects : []).map(String).filter((x) => subj.has(x)).slice(0, 3),
    grades: (Array.isArray(c.grades) ? c.grades : []).map(String).filter((x) => grd.has(x)).slice(0, 20),
    classType: pair(lists.classTypes, c.classType), language: pair(lists.languages, c.language),
    descriptionZh: lang === "en" ? "" : desc, descriptionEn: lang === "en" ? desc : "",
    numClasses: num(c.numClasses, 1, 500), minSize: num(c.minSize, 1, 500), maxSize: num(c.maxSize, 1, 500),
    days: (Array.isArray(c.days) ? c.days : []).map(String).filter((d) => lists.days.includes(d)),
    classTime: s(c.classTime, 200), prerequisite: long(c.prerequisite, 500),
    comments: ["网站申请 / website application", s(c.price, 60) ? "建议价格 / suggested price: " + s(c.price, 60) : "", s(c.subjectOther, 80) ? "学科（其它）/ other subject: " + s(c.subjectOther, 80) : ""].filter(Boolean).join(" · "),
  };
  const problems = [];
  if (!f.nameZh && !f.nameEn) problems.push("courseName");
  if (!f.subjects.length && !s(c.subjectOther, 80)) problems.push("subjects");
  if (!f.grades.length) problems.push("grades");
  if (!longEnough(desc)) problems.push("description");
  if (f.minSize && f.maxSize && f.minSize > f.maxSize) problems.push("size");
  return { fields: f, problems };
}
async function openApp(relId, token) {
  if (!/^REL-\d{6}$/.test(String(relId || "")) || !token) throw Object.assign(new Error("no such application"), { status: 404, code: "not_found" });
  const rels = await P.readRels();
  const rel = rels.items && rels.items[relId];
  const a = rel && rel.application;
  const h = tokenHash(token);
  const current = a && a.tokenHash === h, previous = a && a.prevTokenHash === h && Date.parse(a.prevUntil || 0) > Date.now();
  if (!a || rel.closed || !(current || previous)) throw Object.assign(new Error("no such application"), { status: 404, code: "not_found" });
  if (current && Date.now() - Date.parse(a.tokenAt || a.at) > TOKEN_DAYS * 864e5) throw Object.assign(new Error("expired"), { status: 410, code: "expired" });
  a._stage = rel.stage;
  return a;
}
// the continue link: who applied and the courses so far — nothing the applicant did not type
async function peek(relId, token) {
  const a = await openApp(relId, token);
  const form = {}; for (const k of FORM_KEYS) if (a[k] !== undefined) form[k] = a[k];
  return { id: relId, kind: a.kind, name: a.name, org: a.org, email: a.email, lang: a.lang, stage: a._stage || "apply", courses: a.courses || [], max: MAX_COURSES, resume: a.resume ? { name: a.resume.name, size: a.resume.size } : null, form };
}
async function addCourse(relId, token, course) {
  const a = await openApp(relId, token);
  if ((a.courses || []).length >= MAX_COURSES) throw Object.assign(new Error("too many"), { status: 409, code: "too_many" });
  const lists = await pickLists();
  const { fields, problems } = cleanCourse(course, lists, a.lang);
  if (problems.length) throw Object.assign(new Error("incomplete"), { status: 400, code: "incomplete", problems });
  // the syllabus, written on Hive's template and uploaded before saving (uploadFile kind "syllabus"): only this
  // applicant's own files, at most three
  const want = (Array.isArray(course && course.syllabus) ? course.syllabus : []).slice(0, 3).map((x) => String((x && x.id) || ""));
  if (want.length) {
    const FILES = require("./files");
    const idx = await require("./jsonstore").read(FILES.INDEX_BLOB, { items: {} });
    fields.syllabus = want.filter((id) => FILES.ID_RE.test(id) && idx.items[id] && !idx.items[id].pending && !idx.items[id].deletedAt && idx.items[id].by === "apply:" + relId)
      .map((id) => { const it = idx.items[id]; return { id, name: it.name, size: it.size, type: it.type, url: FILES.url(id) }; });
  }
  const C = require("./courses");
  const d = await C.create({ user: a.email }, { fields, application: relId });
  if ((fields.syllabus || []).length) await require("./files").claim(fields.syllabus.map((x) => x.id), d.courseId).catch(() => {});
  const row = { id: d.courseId, nameZh: fields.nameZh, nameEn: fields.nameEn, at: new Date().toISOString() };
  await P.updateRels((doc) => { const r = doc.items[relId]; if (!r || !r.application) return false; r.application.courses = (r.application.courses || []).concat([row]); r.log.push(P.logEntry(a.email, "note", `网站申请 · 新课程 / course: ${fields.nameZh || fields.nameEn}`)); r.updatedAt = row.at; });
  return { course: row, count: (a.courses || []).length + 1 };
}

// ---- files: the résumé (private) and a course's syllabus (Hive's file store, linked from the course) ----------------
// Chunked like the course editor's uploads (≤ 2 MB a request). The résumé stays private — assets container under
// applications/<REL>/, which no public route serves — and only staff read it (crm application-file). A syllabus is a
// course file like any other (files.js, /api/f/<id>), PDF or Word.
const RESUME_TYPES = { "application/pdf": "pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx", "application/msword": "doc" };
const RESUME_MAX = 5 * 1024 * 1024;
async function uploadFile(relId, token, chunk) {
  const a = await openApp(relId, token);
  const kind = chunk && chunk.kind === "resume" ? "resume" : "syllabus";
  const FILES = require("./files"), blob = require("./blob");
  if (kind === "syllabus") {
    try { return await FILES.upload({ id: String(chunk.upload || ""), name: chunk.name, size: chunk.size, index: chunk.index, total: chunk.total, data: chunk.data }, "apply:" + relId, { kind: "syllabus", tag: relId }); }
    catch (err) { const m = String((err && err.message) || ""); throw Object.assign(err, { code: /only PDF/.test(m) ? "bad_type" : /at most|too large/.test(m) ? "too_big" : "bad_file" }); }
  }
  // the résumé: at most 4 chunks, the bytes counted as they arrive, the type decided by the first chunk and remembered
  // on the application (not taken from the client again)
  const index = Number(chunk.index), total = Number(chunk.total) || 1;
  if (!Number.isInteger(index) || !Number.isInteger(total) || total < 1 || total > 4 || index < 0 || index >= total) throw Object.assign(new Error("bad chunk"), { status: 400, code: "bad_file" });
  const buf = Buffer.from(String(chunk.data || ""), "base64");
  if (!buf.length || buf.length > FILES.CHUNK + 1024) throw Object.assign(new Error("bad chunk"), { status: 400, code: "bad_file" });
  const size = Number(chunk.size) || 0;
  if (size > RESUME_MAX) throw Object.assign(new Error("too big"), { status: 400, code: "too_big" });
  let type, staged = buf.length;
  if (index === 0) {
    type = FILES.sniff(buf, chunk.name); if (!RESUME_TYPES[type]) throw Object.assign(new Error("PDF or Word only"), { status: 400, code: "bad_type" });
    if (total > 1) await P.updateRels((doc) => { const r = doc.items[relId]; if (!r || !r.application) return false; r.application.resumePending = { type, staged, at: new Date().toISOString() }; });
  } else {
    const pend = a.resumePending;
    if (!pend || !RESUME_TYPES[pend.type]) throw Object.assign(new Error("bad chunk"), { status: 400, code: "bad_file" });
    type = pend.type; staged = (pend.staged || 0) + buf.length;
    if (staged > RESUME_MAX) throw Object.assign(new Error("too big"), { status: 400, code: "too_big" });
    if (index + 1 < total) await P.updateRels((doc) => { const r = doc.items[relId]; if (!r || !r.application) return false; r.application.resumePending = Object.assign({}, pend, { staged }); });
  }
  const key = `applications/${relId}/resume.${RESUME_TYPES[type]}`;
  await blob.stageAssetBlock(key, Buffer.from(String(index).padStart(6, "0")).toString("base64"), buf);
  if (index + 1 < total) return { done: false, type };
  const blocks = []; for (let i = 0; i < total; i++) blocks.push(Buffer.from(String(i).padStart(6, "0")).toString("base64"));
  await blob.commitAssetBlocks(key, blocks, type, "private, no-store");
  const file = { key, name: String(chunk.name || "resume").replace(/[\u0000-\u001f\\/:*?"<>|]+/g, " ").trim().slice(0, 120), type, size: staged, at: new Date().toISOString() };
  // a résumé of another type replaced this one: its blob goes too
  if (a.resume && a.resume.key && a.resume.key !== key) await blob.deleteAsset(a.resume.key).catch(() => {});
  await P.updateRels((doc) => { const r = doc.items[relId]; if (!r || !r.application) return false; r.application.resume = file; delete r.application.resumePending; r.log.push(P.logEntry(a.email, "note", "网站申请 · 简历 / résumé: " + file.name)); r.updatedAt = file.at; });
  return { done: true, file: { name: file.name, size: file.size, type: file.type } };
}

// 找回申请 (Rick 2026-10-22: 「如何在此进来找到自己的资料？」): the applicant gives the email; when an open application
// has it, a fresh key goes to that email (the old one stops working). The answer is the same either way.
async function resend(email, opts) {
  const e = String(email || "").trim().toLowerCase();
  if (!EMAIL_RE.test(e)) return { ok: true };
  const token = require("crypto").randomBytes(24).toString("base64url");
  let hit = null;
  await P.updateRels((doc) => {
    const r = Object.values(doc.items || {}).find((x) => x && x.type === "course" && !x.closed && x.application && x.application.email === e);
    if (!r) return false;
    if (r.application.tokenHash) { r.application.prevTokenHash = r.application.tokenHash; r.application.prevUntil = new Date(Date.now() + 3600e3).toISOString(); }
    r.application.tokenHash = tokenHash(token); r.application.tokenAt = new Date().toISOString();
    r.log.push(P.logEntry(e, "note", "网站申请 · 找回链接已发送 / recovery link sent"));
    hit = { id: r.id, a: r.application };
  });
  if (hit) await sendLink(hit.id, hit.a, token, opts);
  return { ok: true };
}
async function sendLink(id, a, token, opts) {
  const log = (opts && opts.log) || (() => {});
  const flowUrl = process.env.POWER_AUTOMATE_URL;
  if (!flowUrl) return { ok: false };
  const link = `${SITE}/teach#app=${id}&key=${encodeURIComponent(token)}`;
  const m = a.lang === "en"
    ? { subject: `[Hive] Your application ${id}`, body: `Dear ${a.name},\n\nHere is the link to your application ${id} (valid for 7 days; any earlier link no longer works):\n${link}\n\nIf you did not ask for it, you can ignore this email.\n\nHive` }
    : { subject: `【蜂巢】您的授课申请 ${id}`, body: `${a.name} 您好，\n\n这是您的申请 ${id} 的链接（7 天内有效；之前的链接已失效）：\n${link}\n\n如果不是您本人操作，请忽略这封邮件。\n\n蜂巢` };
  const html = "<div style=\"font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,'PingFang SC','Microsoft YaHei',sans-serif;font-size:15px;line-height:1.7;color:#1f2328;max-width:640px\">" + require("./messages").escapeHtml(m.body).replace(/\r?\n/g, "<br>\n") + "</div>";
  const payload = { orderId: id, submittedAt: new Date().toISOString(), email: a.email, teamsAccount: "", lang: a.lang, track: null, items: [], itemCount: 0, totalPrice: 0, currency: "CNY", routes: [], routeCount: 0, notifyText: m.body, emailTo: a.email, emailSubject: m.subject, emailHtml: html, emailBodyText: m.body, application: true };
  const headers = { "Content-Type": "application/json" };
  if (process.env.ORDER_SHARED_SECRET) headers["X-Order-Secret"] = process.env.ORDER_SHARED_SECRET;
  try { const res = await fetch(flowUrl, { method: "POST", headers, body: JSON.stringify(payload) }); return { ok: res.ok || res.status === 202 }; }
  catch (err) { log(`teach resend ${id}: ${err && err.message}`); return { ok: false }; }
}

const SITE = "https://www.fengchao.life";
const FAITH = {
  worldview: { yes: ["听说过圣经世界观", "has heard of a biblical worldview"], no: ["没听说过圣经世界观", "has not heard of a biblical worldview"] },
  frequency: { never: ["教学中从未融入", "never integrates it in teaching"], sometimes: ["偶尔融入教学", "integrates it sometimes"], often: ["经常融入教学", "integrates it often"], always: ["每堂课都融入", "integrates it in every lesson"] },
  church: { yes: ["有委身的教会生活", "committed church life"], no: ["没有委身的教会生活", "no committed church life"] },
  churchKind: { house: ["家庭教会", "house church"], tspm: ["三自教会", "Three-Self church"], online: ["网络教会", "online church"], other: ["其它", "other"] },
};
function faithLine(a, en) {
  const pick = (m, k) => (m[k] ? m[k][en ? 1 : 0] : "");
  return [pick(FAITH.worldview, a.worldview), pick(FAITH.frequency, a.frequency), pick(FAITH.church, a.church), pick(FAITH.churchKind, a.churchKind) + (a.churchKind === "other" && a.churchOther ? "：" + a.churchOther : "")].filter(Boolean).join(" · ") || "—";
}
function texts(id, a, token) {
  const more = token ? `${SITE}/teach#app=${id}&key=${encodeURIComponent(token)}` : "";
  const L = (m, k) => (m[k] ? m[k][0] + " / " + m[k][1] : "");
  const staff = [
    `新的授课申请 / New teaching application · ${id}`,
    "",
    `申请人 / Applicant: ${a.name} (${a.familyName} / ${a.givenName}) · ${a.email}${a.account ? " · " + a.account : ""}`,
    `类型 / Type: ${L(KINDS, a.kind)}`,
    `名称 / Name: ${a.org}${a.abbr ? " (" + a.abbr + ")" : ""}${a.domain ? " · " + a.domain : ""}${a.needDomain ? " · 需要蜂巢帮助创建域名 / needs Hive to create a domain" : ""}${a.website ? " · " + a.website : ""}`,
    `地区 / Where: ${[a.city, a.country].filter(Boolean).join(", ") || "—"}`,
    `老师 / Teachers: ${a.teachers || 1}`,
    `示范课与作品集 / Sample class and portfolio: ${a.sample}`,
    `信仰 / Faith: ${faithLine(a)}`,
    a.resume ? `简历 / Résumé: ${a.resume.name}` : "",
    a.intro ? "\n" + a.intro : "",
    "",
    `管理中心 / Management centre: ${SITE}/management/#/ops/partners/course/${id}`,
  ].join("\n");
  const ack = a.lang === "en" ? {
    subject: `[Hive] We have your application to teach · ${id}`,
    body: `Dear ${a.name},\n\nThank you for applying to teach with Hive. We have received your application (${id}). Hive's education community manager will be in touch within two weeks to hear about your courses and your teaching.${more ? `\n\nTo add or continue your courses (on any device, for 7 days): ${more}` : ""}\n\nWhat follows: ① apply ② your courses ③ a conversation and review ④ onboarding (an orders channel and your Teams account) ⑤ listing and classes.\n\nQuestions: info@fengchao.life\n\nHive`,
  } : {
    subject: `【蜂巢】已收到您的授课申请 · ${id}`,
    body: `${a.name} 您好，\n\n谢谢您申请在蜂巢开课！我们已收到您的申请（编号 ${id}）。蜂巢教育社区经理会在两周内与您联系，了解您的课程和教学。${more ? `\n\n继续填写或添加课程（任何设备，7 天内有效）：${more}` : ""}\n\n流程：① 提交申请 ② 填写课程 ③ 交流与审核 ④ 开通（订单频道、您的 Teams 账号）⑤ 上架开课。\n\n如有问题请写信至 info@fengchao.life。\n\n蜂巢`,
  };
  return { staff, staffSubject: `【蜂巢】新的授课申请 ${a.org} · ${id}`, ack };
}

// Who hears of it: the education community managers; else the digest's recipients (order manager / CRM_DIGEST_TO).
async function staffRecipients() {
  const doc = await require("./roles").readRoles().catch(() => ({ entries: [] }));
  const list = (doc.entries || []).filter((e) => (e.roles || []).some((r) => r === "staff:community" || r === "staff:coordinator")).map((e) => String(e.user || "").toLowerCase()).filter(Boolean);
  if (list.length) return list;
  return require("./digest").recipients().catch(() => []);
}

async function notify(id, a, opts) {
  const token = opts && opts.token;
  const log = (opts && opts.log) || (() => {});
  const flowUrl = process.env.POWER_AUTOMATE_URL;
  if (!flowUrl) return { ok: false, error: "no_flow" };
  try {
    const m = texts(id, a, token);
    const to = await staffRecipients();
    const ch = await require("./digest").channel().catch(() => ({ id: "" }));
    const html = (t) => "<div style=\"font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,'PingFang SC','Microsoft YaHei',sans-serif;font-size:15px;line-height:1.7;color:#1f2328;max-width:640px\">" + require("./messages").escapeHtml(t).replace(/\r?\n/g, "<br>\n") + "</div>";
    // Shaped like an order so the flow's trigger accepts it: the email to the applicant, one route (the CRM channel).
    const payload = {
      orderId: id, submittedAt: new Date().toISOString(), email: a.email, teamsAccount: a.account || "", lang: a.lang,
      track: null, items: [], itemCount: 0, totalPrice: 0, currency: "CNY", routeCount: 1,
      notifyText: m.staff, emailTo: a.email, emailSubject: m.ack.subject, emailHtml: html(m.ack.body), emailBodyText: m.ack.body,
      routes: [{ hiveKey: "crm", schoolName: "Hive CRM", schoolAbbr: "CRM", teamsChannelId: ch.id || "", usedDefaultChannel: !ch.id, notifyEmail: to.join(";"), itemCount: 0, subtotal: 0, currency: "CNY", notifyText: m.staff, notifySubject: m.staffSubject, notifyHtml: html(m.staff) }],
      application: true,
    };
    const headers = { "Content-Type": "application/json" };
    if (process.env.ORDER_SHARED_SECRET) headers["X-Order-Secret"] = process.env.ORDER_SHARED_SECRET;
    const res = await fetch(flowUrl, { method: "POST", headers, body: JSON.stringify(payload) });
    if (!res.ok && res.status !== 202) log(`teach ${id}: flow answered ${res.status}`);
    return { ok: res.ok || res.status === 202, status: res.status };
  } catch (err) {
    log(`teach ${id}: ${String((err && err.message) || err).slice(0, 200)}`);
    return { ok: false, error: String((err && err.message) || err).slice(0, 200) };
  }
}

module.exports = { clean, submit, notify, texts, keyOf, KINDS, LANGS, pickLists, cleanCourse, addCourse, peek, uploadFile, resend, update, RESUME_MAX, FAITH, faithLine, tokenHash, MAX_COURSES };
