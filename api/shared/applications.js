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
    intro: long(b.intro, 3000), sample: long(b.sample, 1000),
    lang: b.lang === "en" ? "en" : "zh",
  };
  a.name = fullName(a);
  if (!group) a.org = a.name;
  const problems = [];
  if (!a.kind) problems.push("kind");
  if (!a.familyName) problems.push("familyName");
  if (!a.givenName) problems.push("givenName");
  if (!EMAIL_RE.test(a.email)) problems.push("email");
  if (group && !a.org) problems.push("org");
  if (group && (a.abbr.length < 2 || a.abbr.length > 8)) problems.push("abbr");
  // a team or a school with no domain yet asks Hive to create one (Rick 2026-10-22) — then none is required
  if (group && !a.needDomain && (!DOMAIN_RE.test(a.domain) || PUBLIC_MAIL.test(a.domain))) problems.push("domain");
  if (!longEnough(a.intro)) problems.push("intro");
  if (!b.agree) problems.push("agree");
  return { app: a, problems };
}

// The party key: the organisation's own domain when it gave one, else the applicant's email.
const keyOf = (a) => a.domain || "apply:" + a.email;

// Store (or refresh) the application on its 课程提供方 relationship. `account` = the signed-in UPN, the platform's word.
async function submit(a, opts) {
  opts = opts || {};
  const now = new Date().toISOString(), by = opts.account || a.email;
  // the key to the next page (课程信息): the applicant adds courses to this application with it, for a week
  const token = require("crypto").randomBytes(24).toString("base64url");
  const application = Object.assign({}, a, { account: opts.account || "", at: now, tokenHash: tokenHash(token), tokenAt: now });
  const key = keyOf(a), region = P.regionOf({ country: a.country, city: a.city, domain: a.domain });
  const openIn = (d, orgId) => Object.values(d.items || {}).find((r) => r && r.type === "course" && !r.closed && ((r.party && (r.party.key === key || (orgId && r.party.id === orgId))) || (r.application && r.application.email === a.email)));
  const refresh = (open) => {
    const prev = open.application;
    open.application = Object.assign({}, application, { firstAt: (prev && (prev.firstAt || prev.at)) || now, courses: (prev && prev.courses) || [] });
    open.log.push(P.logEntry(by, "note", "网站「我要教课」再次提交 / applied again on the website"));
    open.updatedAt = now;
  };
  const orgs0 = await P.readOrgs();
  const rels0 = await P.readRels();
  if (!openIn(rels0, orgs0.byKey[key] || null)) {
    // a new partner: its ORG id first, then the relationship (re-checked inside, should two forms cross)
    const { doc: od } = await P.updateOrgs((o) => { P.orgIdFor(o, key, { name: a.org, region, orgType: KINDS[a.kind][0] }); });
    const party = { id: od.byKey[key], key, name: a.org };
    let out = null;
    await P.updateRels((d) => {
      const open = openIn(d, party.id);
      if (open) { refresh(open); out = { id: open.id, again: true, key, token }; return; }
      const id = P.pad(d.next++);
      const rel = P.newRelationship({ type: "course", party, stage: "apply", source: "application", region, lang: a.lang, note: "网站「我要教课」申请 / applied on the website" }, by, id);
      rel.confirmed = true;
      rel.application = Object.assign({}, application, { firstAt: now, courses: [] });
      d.items[id] = rel; out = { id, again: false, key, token };
    });
    return out;
  }
  let out = null;
  await P.updateRels((d) => { const open = openIn(d, orgs0.byKey[key] || null); if (open) { refresh(open); out = { id: open.id, again: true, key, token }; } });
  return out;
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
    classTypes: C.PAIR_VALUES.classType.map(([en, zh]) => ({ en, zh })), languages: C.PAIR_VALUES.language.map(([en, zh]) => ({ en, zh })) };
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
    classTime: s(c.classTime, 200), prerequisite: long(c.prerequisite, 500),
    comments: s(c.price, 60) ? "网站申请 · 建议价格 / suggested price: " + s(c.price, 60) : "网站申请 / website application",
  };
  const problems = [];
  if (!f.nameZh && !f.nameEn) problems.push("courseName");
  if (!f.subjects.length) problems.push("subjects");
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
  if (!a || rel.closed || a.tokenHash !== tokenHash(token)) throw Object.assign(new Error("no such application"), { status: 404, code: "not_found" });
  if (Date.now() - Date.parse(a.tokenAt || a.at) > TOKEN_DAYS * 864e5) throw Object.assign(new Error("expired"), { status: 410, code: "expired" });
  return a;
}
// the continue link: who applied and the courses so far — nothing the applicant did not type
async function peek(relId, token) {
  const a = await openApp(relId, token);
  return { id: relId, kind: a.kind, name: a.name, org: a.org, email: a.email, lang: a.lang, courses: a.courses || [], max: MAX_COURSES };
}
async function addCourse(relId, token, course) {
  const a = await openApp(relId, token);
  if ((a.courses || []).length >= MAX_COURSES) throw Object.assign(new Error("too many"), { status: 409, code: "too_many" });
  const lists = await pickLists();
  const { fields, problems } = cleanCourse(course, lists, a.lang);
  if (problems.length) throw Object.assign(new Error("incomplete"), { status: 400, code: "incomplete", problems });
  const C = require("./courses");
  const d = await C.create({ user: a.email }, { fields, application: relId });
  const row = { id: d.courseId, nameZh: fields.nameZh, nameEn: fields.nameEn, at: new Date().toISOString() };
  await P.updateRels((doc) => { const r = doc.items[relId]; if (!r || !r.application) return false; r.application.courses = (r.application.courses || []).concat([row]); r.log.push(P.logEntry(a.email, "note", `网站申请 · 新课程 / course: ${fields.nameZh || fields.nameEn}`)); r.updatedAt = row.at; });
  return { course: row, count: (a.courses || []).length + 1 };
}

const SITE = "https://www.fengchao.life";
function texts(id, a, token) {
  const more = token ? `${SITE}/teach?app=${id}&key=${encodeURIComponent(token)}` : "";
  const L = (m, k) => (m[k] ? m[k][0] + " / " + m[k][1] : "");
  const staff = [
    `新的授课申请 / New teaching application · ${id}`,
    "",
    `申请人 / Applicant: ${a.name} (${a.familyName} / ${a.givenName}) · ${a.email}${a.account ? " · " + a.account : ""}`,
    `类型 / Type: ${L(KINDS, a.kind)}`,
    `名称 / Name: ${a.org}${a.abbr ? " (" + a.abbr + ")" : ""}${a.domain ? " · " + a.domain : ""}${a.needDomain ? " · 需要蜂巢帮助创建域名 / needs Hive to create a domain" : ""}${a.website ? " · " + a.website : ""}`,
    `地区 / Where: ${[a.city, a.country].filter(Boolean).join(", ") || "—"}`,
    `授课 / Teaching: ${a.language ? L(LANGS, a.language) : "—"}${a.teachers ? " · " + a.teachers + " 位老师 / teachers" : ""}`,
    "",
    a.intro,
    a.sample ? "\n样课 / Sample: " + a.sample : "",
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

module.exports = { clean, submit, notify, texts, keyOf, KINDS, LANGS, pickLists, cleanCourse, addCourse, peek, tokenHash, MAX_COURSES };
