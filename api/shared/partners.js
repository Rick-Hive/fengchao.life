// 合作伙伴 (design 「合作伙伴模块设计 v2」, Rick 2026-10-08): seven partner types, each
// with its own cooperation cycle. A relationship (REL-) belongs to one party — an
// organization (ORG-, keyed to the 机构 row) or a person (the people hub's id) — and
// moves through its type's stages by hand; projects (PRJ-) hang under relationships
// with their own milestones. Business numbers are metrics read elsewhere; nothing
// here is inferred from orders.
//
// Blobs (site-data, written under ETag through jsonstore):
//   crm/relationships.json  { next, items: { "REL-000001": {…} } }
//   crm/projects.json       { next, items: { "PRJ-000001": {…} } }
//   crm/orgs.json           { next, byKey: { "<institution key>": "ORG-000001" }, orgs: { "ORG-000001": {…} } }
//   crm/partner-config.json { exclude: [...], thresholds: { "<type>.<stage>": days } }
const store = require("./jsonstore");

const REL_BLOB = "crm/relationships.json";
const PRJ_BLOB = "crm/projects.json";
const ORG_BLOB = "crm/orgs.json";
const CFG_BLOB = "crm/partner-config.json";

const TYPES = {
  it: { zh: "IT 服务", en: "IT services", owner: "partnership" },
  publisher: { zh: "出版社", en: "Publishers", owner: "partnership" },
  university: { zh: "大学", en: "Universities", owner: "partnership" },
  intl_school: { zh: "国际学校", en: "International schools", owner: "partnership" },
  course: { zh: "课程提供方", en: "Course providers", owner: "community" },
  developer: { zh: "教材开发者", en: "Curriculum developers", owner: "curriculum" },
};
const TYPE_KEYS = Object.keys(TYPES);

// Each stage: k, labels, days = stall threshold (0 = judged by health signals),
// closed = a terminal stage, handover = the owner is re-chosen on entry, needsContact /
// needsAgreement = what the move into it requires, renewal = entered automatically
// `before` days before the agreement ends.
const S = (k, zh, en, days, extra) => Object.assign({ k, zh, en, days: days || 0 }, extra || {});
const STAGES = {
  it: [S("lead", "线索", "Lead", 14), S("assess", "评估", "Assessment", 21), S("proposal", "方案", "Proposal", 21), S("signed", "签约", "Signed", 14, { needsAgreement: true, needsContact: true }), S("onboarding", "开通中", "Onboarding", 30), S("operating", "运营中", "Operating", 0, { handover: true }), S("renewal", "续约期", "Renewal window", 0, { renewal: true, before: 60 }), S("ended", "已终止", "Terminated", 0, { closed: true })],
  publisher: [S("approach", "接洽", "Approach", 30), S("evaluate", "评估", "Evaluation", 45), S("terms", "条款洽谈", "Terms", 60), S("signed", "签约", "Signed", 30, { needsAgreement: true, needsContact: true }), S("listing", "上架中", "Listing", 45), S("onsale", "在售", "On sale", 0), S("renewal", "续约期", "Renewal window", 0, { renewal: true, before: 90 }), S("selloff", "清仓期 / 已终止", "Sell-off / terminated", 0, { closed: true })],
  university: [S("lead", "线索", "Lead", 30), S("explore", "探索", "Exploration", 60), S("design", "项目设计", "Programme design", 90), S("agreement", "协议", "Agreement", 60, { needsAgreement: true, needsContact: true }), S("running", "项目运行中", "Programmes running", 0, { needsProject: true }), S("review", "年度评审 / 续约", "Annual review / renewal", 0, { renewal: true, before: 90 }), S("ended", "已终止", "Terminated", 0, { closed: true })],
  intl_school: [S("lead", "线索", "Lead", 30), S("explore", "探索", "Exploration", 60), S("terms", "条款与对照", "Terms and mapping", 90), S("agreement", "协议", "Agreement", 60, { needsAgreement: true, needsContact: true }), S("running", "运行中", "Running", 0), S("review", "年度评审 / 续约", "Annual review / renewal", 0, { renewal: true, before: 90 }), S("ended", "已终止", "Terminated", 0, { closed: true })],
  course: [S("apply", "申请 / 推荐", "Application / referral", 14), S("review", "审核", "Review", 30), S("design", "课程设计与上架", "Design and listing", 45), S("listed", "已上架", "Listed", 90), S("running", "开班中", "Classes running", 0, { needsProject: true }), S("termreview", "学期评估", "Term review", 30), S("paused", "暂停 / 已终止", "Paused / terminated", 0, { closed: true })],
  developer: [S("approach", "接洽", "Approach", 14), S("pooled", "在库可用", "Available", 0, { needsContact: false }), S("active", "参与项目中", "On a project", 0), S("inactive", "不活跃", "Inactive", 0, { closed: true })],
};
const REGIONS = ["cn", "na", "sea", "jp", "sa", "af", "other"];
const REGION_LABELS = { cn: ["中国", "China"], na: ["北美", "North America"], sea: ["东南亚", "Southeast Asia"], jp: ["日本", "Japan"], sa: ["南美洲", "South America"], af: ["非洲", "Africa"], other: ["其它", "Other"] };
// Two currencies, two languages (Rick, 2026-10-08).
const currencyOf = (region) => (region === "cn" ? "CNY" : "USD");
const langOf = (region) => (region === "cn" || region === "jp" ? "zh" : "en");

// Contact roles offered per type (free text is allowed too).
const CONTACT_ROLES = {
  it: ["校长", "负责人", "IT 联系人", "教务", "账单对口人"],
  publisher: ["版权联系人", "财务", "编辑"],
  university: ["项目负责人", "国际处", "招生办", "教务", "授课教师"],
  intl_school: ["校长", "招生主任", "教务", "国际处"],
  course: ["负责人", "授课教师", "教务"],
  developer: ["作者", "学科审稿", "信仰审稿", "教学法审稿", "编辑", "文字编辑", "设计", "插画", "排版", "校对", "试教教师"],
};

// Project kinds per type with their default milestones (gate = closes a phase).
const M = (zh, en, gate) => ({ zh, en, kind: gate ? "gate" : "deliverable" });
const PROJECT_KINDS = {
  it: { rollout: { zh: "开通 / 推广", en: "Rollout", ms: [M("账号创建", "Accounts created"), M("域管理员培训", "Admin training"), M("全员登录", "Everyone signed in", true)] }, migration: { zh: "租户迁移", en: "Tenant migration", ms: [M("方案确认", "Plan confirmed", true), M("数据迁移", "Data migrated"), M("切换完成", "Cut-over done", true)] } },
  publisher: { licence_deal: { zh: "书系授权", en: "Licensed series", ms: [M("样书评估", "Sample evaluation", true), M("条款确认", "Terms confirmed", true), M("签约", "Signed", true), M("SKU 上架", "SKUs listed"), M("首月结算", "First settlement")] } },
  university: {
    degree_cn: { zh: "面向中国的学位项目", en: "Degree programme for China", ms: [M("意向书", "Letter of intent"), M("项目条款", "Programme terms", true), M("协议签署", "Agreement signed", true), M("招生页上线", "Admissions page live"), M("说明会", "Information session"), M("申请截止", "Application deadline"), M("录取公布", "Offers announced"), M("首批入学", "First intake", true), M("首学期评估", "First-term review")] },
    dual_credit: { zh: "双学分课程", en: "Dual-credit courses", ms: [M("课程清单确认", "Course list confirmed"), M("学分对照表", "Credit map", true), M("协议 / 附件", "Agreement / annex", true), M("报名开放", "Enrolment open"), M("开课", "Course starts"), M("成绩与学分回传", "Grades and credits returned", true), M("下学期续开决定", "Next-term decision")] },
    recruiting: { zh: "招生与宣传", en: "Recruiting and promotion", ms: [M("宣传材料到位", "Materials received"), M("活动排期", "Events scheduled"), M("活动举办", "Events held"), M("转介名单", "Referral list", true), M("录取反馈", "Admission feedback"), M("结算", "Settlement")] },
  },
  intl_school: {
    referral: { zh: "推荐学生", en: "Student referral", ms: [M("推荐", "Referred"), M("申请", "Applied"), M("录取", "Admitted", true), M("入学", "Enrolled", true), M("佣金结算", "Commission settled")] },
    credit_map: { zh: "学分互认", en: "Credit recognition", ms: [M("课程清单", "Course list"), M("对照草案", "Draft map"), M("双方确认", "Confirmed", true), M("生效", "In force"), M("年度更新", "Annual update")] },
    course_offering: { zh: "开放课程到蜂巢", en: "Courses opened to Hive", ms: [M("上架", "Listed"), M("报名", "Enrolment"), M("开课", "Start", true), M("结课", "End"), M("结算", "Settlement")] },
  },
  course: { term_offering: { zh: "学期开班", en: "Course term", ms: [M("开课", "Start", true), M("期中反馈", "Mid-term feedback"), M("结课", "End", true), M("成绩录入", "Grades entered"), M("结算", "Settlement")] } },
  developer: { textbook: { zh: "教材项目", en: "Textbook project", ms: [M("立项批准", "Proposal approved", true), M("大纲定稿", "Outline final", true), M("协议签署", "Agreements signed", true), M("全部单元初稿", "All units drafted", true), M("审稿意见全部处理", "Reviews resolved", true), M("稿件定稿", "Manuscript freeze", true), M("一校样", "First proofs", true), M("试教报告", "Pilot report", true), M("付印稿", "Final files", true), M("上架", "Listed", true), M("首期销售", "First-period sales"), M("下一版立项", "Next edition proposed")] } },
};

const DAY = 86400000;
const pad = (n) => "REL-" + String(n).padStart(6, "0");
const padP = (n) => "PRJ-" + String(n).padStart(6, "0");
const padO = (n) => "ORG-" + String(n).padStart(6, "0");
const EMPTY_REL = () => ({ next: 1, items: {} });
const EMPTY_PRJ = () => ({ next: 1, items: {} });
const EMPTY_ORG = () => ({ next: 1, byKey: {}, orgs: {} });
// Our own entities never become partners (Rick, 2026-10-08).
const DEFAULT_EXCLUDE = ["Equip教育社区", "Equip 教育社区", "桥梁教育服务", "Bridge Education Services", "EQUIP", "青少年之桥团契"];
const EMPTY_CFG = () => ({ exclude: DEFAULT_EXCLUDE.slice(), thresholds: {} });

const readRels = () => store.read(REL_BLOB, EMPTY_REL());
const readProjects = () => store.read(PRJ_BLOB, EMPTY_PRJ());
const readOrgs = () => store.read(ORG_BLOB, EMPTY_ORG());
const readConfig = () => store.read(CFG_BLOB, EMPTY_CFG());
const updateRels = (mutate) => store.update(REL_BLOB, EMPTY_REL, mutate);
const updateProjects = (mutate) => store.update(PRJ_BLOB, EMPTY_PRJ, mutate);
const updateOrgs = (mutate) => store.update(ORG_BLOB, EMPTY_ORG, mutate);
const updateConfig = (mutate) => store.update(CFG_BLOB, EMPTY_CFG, mutate);

const norm = (s) => String(s || "").toLowerCase().replace(/[\s·.,，、_\-]+/g, "");
function isExcluded(cfg, candidate) {
  const names = ((cfg && cfg.exclude) || DEFAULT_EXCLUDE).map(norm).filter(Boolean);
  const bare = String(candidate.key || "").replace(/^(hive|equip|new):/i, ""); // the prefix is ours, not the partner's name
  const mine = [bare, candidate.name, candidate.nameEn, candidate.abbr, candidate.domain].map(norm).filter(Boolean);
  return mine.some((m) => names.some((n) => m === n || (n.length >= 4 && m.includes(n))));
}

function stageOf(type, k) { return (STAGES[type] || []).find((s) => s.k === k) || null; }
function stageIndex(type, k) { return (STAGES[type] || []).findIndex((s) => s.k === k); }
function threshold(cfg, type, stage) {
  const o = cfg && cfg.thresholds && cfg.thresholds[type + "." + stage.k];
  return typeof o === "number" ? o : stage.days;
}
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);

// Health of one relationship at `now`: days in stage, the threshold, whether it
// is stalled (threshold passed or next step overdue), and whether the agreement
// end puts it into the renewal window.
function health(rel, now, cfg) {
  const t = +now || Date.now();
  const st = stageOf(rel.type, rel.stage);
  const days = rel.stageAt ? Math.floor((t - Date.parse(rel.stageAt)) / DAY) : 0;
  const limit = st ? threshold(cfg, rel.type, st) : 0;
  const reasons = [];
  if (!st || st.closed || rel.closed) return { days, limit, stalled: false, reasons, renewalDue: false, nextOverdue: 0 };
  if (limit && days > limit) reasons.push("stage");
  const due = rel.next && rel.next.due;
  const nextOverdue = due && isoDay(t) > due ? Math.floor((t - Date.parse(due)) / DAY) : 0;
  if (nextOverdue > 0) reasons.push("next");
  if (!rel.next || !rel.next.action) reasons.push("noNext");
  const ren = (STAGES[rel.type] || []).find((s) => s.renewal);
  const endAt = rel.agreement && rel.agreement.endAt;
  const renewalDue = !!(ren && endAt && stageIndex(rel.type, rel.stage) < stageIndex(rel.type, ren.k) && Date.parse(endAt) - t <= ren.before * DAY);
  const stalled = reasons.includes("stage") || reasons.includes("next");
  return { days, limit, stalled, reasons, renewalDue, nextOverdue, severe: stalled && limit > 0 && days > 2 * limit };
}

// Whether `rel` may move to stage `to` with `body` ({ reason, owner, contacts }): the
// checks the system can make; the rest is ticked by the mover (design §11).
function moveCheck(rel, to, body, projects) {
  const type = rel.type, from = stageIndex(type, rel.stage), toI = stageIndex(type, to), st = stageOf(type, to);
  if (!st) return { ok: false, error: "bad_stage" };
  if (toI === from) return { ok: false, error: "same_stage" };
  const backward = toI < from;
  const problems = [];
  if (backward && !String((body && body.reason) || "").trim()) problems.push("reason");
  if (!backward) {
    // The requirements of every stage passed on the way (a skipped 签约 still needs its
    // agreement); closing a relationship needs only its reason.
    const after = st.closed ? [] : (STAGES[type] || []).slice(from + 1, toI + 1);
    if (after.some((s) => s.needsAgreement) && !(rel.agreement && rel.agreement.signedAt)) problems.push("agreement");
    if (after.some((s) => s.needsContact) && !((rel.contacts || []).length || (body && body.contacts && body.contacts.length))) problems.push("contact");
    if (st.needsProject && !(projects || []).some((p) => p.relationship === rel.id && p.status === "active")) problems.push("project");
    if (st.handover && !String((body && body.owner) || rel.owner || "").trim()) problems.push("owner");
    if (st.closed && !String((body && body.reason) || "").trim()) problems.push("reason");
  }
  return problems.length ? { ok: false, error: "move_blocked", problems } : { ok: true, backward, stage: st };
}

function logEntry(by, kind, text, extra) { return Object.assign({ at: new Date().toISOString(), by: by || "", kind, text: String(text || "").slice(0, 1000) }, extra || {}); }

const PARTY_RE = /^(ORG-\d{6}|HC-\d{6}|PER-\d{6})$/;
function cleanParty(p) {
  if (!p || typeof p !== "object") return null;
  const id = String(p.id || "").toUpperCase();
  if (!PARTY_RE.test(id)) return null;
  return { kind: id.startsWith("ORG-") ? "org" : "person", id, key: String(p.key || "").slice(0, 120), name: String(p.name || "").slice(0, 200) };
}
function cleanContacts(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 50).map((c) => ({ person: String((c && c.person) || "").toUpperCase().slice(0, 12), name: String((c && c.name) || "").slice(0, 120), role: String((c && c.role) || "").slice(0, 60), primary: !!(c && c.primary) })).filter((c) => /^(HC|PER)-\d{6}$/.test(c.person));
}
function cleanNext(n) {
  if (!n || typeof n !== "object") return null;
  const action = String(n.action || "").slice(0, 300).trim();
  if (!action) return null;
  return { action, due: /^\d{4}-\d{2}-\d{2}$/.test(String(n.due || "")) ? n.due : "", owner: String(n.owner || "").slice(0, 120) };
}
function cleanAgreement(a) {
  if (!a || typeof a !== "object") return null;
  const d = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) ? v : "");
  return { kind: String(a.kind || "").slice(0, 80), signedAt: d(a.signedAt), startAt: d(a.startAt), endAt: d(a.endAt), renewal: ["auto", "manual", "none"].includes(a.renewal) ? a.renewal : "manual", fileRef: String(a.fileRef || "").slice(0, 500) };
}
function cleanTerms(t) {
  if (!t || typeof t !== "object") return {};
  const out = {};
  for (const [k, v] of Object.entries(t).slice(0, 40)) {
    if (!/^[a-zA-Z][a-zA-Z0-9]{0,40}$/.test(k)) continue;
    if (typeof v === "number" && isFinite(v)) out[k] = v;
    else if (typeof v === "boolean") out[k] = v;
    else if (typeof v === "string") out[k] = v.slice(0, 500);
    else if (Array.isArray(v)) out[k] = v.slice(0, 50).map((x) => String(x).slice(0, 120));
  }
  return out;
}

// A new relationship from a request body; `by` = the caller's UPN.
function newRelationship(body, by, id) {
  const type = String(body.type || "");
  if (!TYPES[type]) throw Object.assign(new Error("bad type"), { code: "bad_type" });
  const party = cleanParty(body.party);
  if (!party) throw Object.assign(new Error("bad party"), { code: "bad_party" });
  const region = REGIONS.includes(body.region) ? body.region : "other";
  const stage = stageOf(type, body.stage) ? body.stage : STAGES[type][0].k;
  const now = new Date().toISOString();
  const rel = {
    id, type, party, region, currency: ["CNY", "USD"].includes(body.currency) ? body.currency : currencyOf(region), lang: ["zh", "en"].includes(body.lang) ? body.lang : langOf(region),
    stage, stageAt: now, stageBy: by, owner: String(body.owner || "").slice(0, 120), sponsor: String(body.sponsor || "").slice(0, 120),
    next: cleanNext(body.next), agreement: cleanAgreement(body.agreement), terms: cleanTerms(body.terms), contacts: cleanContacts(body.contacts),
    source: ["manual", "lead", "seed:tenant", "seed:hive", "seed:equip", "seed:teacher"].includes(body.source) ? body.source : "manual", confirmed: body.source && body.source !== "manual" ? false : true,
    createdAt: now, createdBy: by, updatedAt: now, closed: null,
    log: [logEntry(by, "created", body.note || "", { to: stage })],
  };
  return rel;
}

// Projects
function newProject(rel, body, by, id) {
  const kinds = PROJECT_KINDS[rel.type] || {};
  const kind = kinds[body.kind] ? body.kind : Object.keys(kinds)[0];
  if (!kind) throw Object.assign(new Error("no project kinds"), { code: "bad_kind" });
  const now = new Date().toISOString();
  const d = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) ? v : "");
  const tpl = kinds[kind].ms || [];
  const milestones = (Array.isArray(body.milestones) && body.milestones.length ? body.milestones : tpl).map((m, i) => ({ id: "m" + (i + 1), name: String(m.zh || m.name || "").slice(0, 120), nameEn: String(m.en || m.nameEn || m.name || "").slice(0, 120), kind: m.kind === "gate" ? "gate" : "deliverable", due: d(m.due), doneAt: "", owner: String(m.owner || "").slice(0, 120), note: "" }));
  return {
    id, relationship: rel.id, kind, name: String(body.name || kinds[kind].zh).slice(0, 200), nameEn: String(body.nameEn || kinds[kind].en).slice(0, 200),
    status: ["planning", "active", "on_hold", "completed", "cancelled"].includes(body.status) ? body.status : "planning",
    startAt: d(body.startAt), endAt: d(body.endAt), owner: String(body.owner || rel.owner || "").slice(0, 120), terms: cleanTerms(body.terms), participants: cleanContacts(body.participants), milestones,
    public: { listed: false, slug: "", summary: "" }, createdAt: now, createdBy: by, updatedAt: now, log: [logEntry(by, "created", "", { to: "planning" })],
  };
}

// The list a type page shows: every open (or, with `all`, every) relationship of
// the type with its health, newest stage change first.
function listByType(doc, type, cfg, now, all) {
  return Object.values(doc.items || {}).filter((r) => r.type === type && (all || !r.closed)).map((r) => Object.assign({}, r, { health: health(r, now, cfg) })).sort((a, b) => String(b.stageAt).localeCompare(String(a.stageAt)));
}
function summary(rels, now) {
  const t = +now || Date.now(), ym = isoDay(t).slice(0, 7), year = isoDay(t).slice(0, 4);
  const byStage = {};
  for (const r of rels) byStage[r.stage] = (byStage[r.stage] || 0) + 1;
  return {
    open: rels.filter((r) => !r.closed).length, stalled: rels.filter((r) => r.health && r.health.stalled).length,
    dueThisMonth: rels.filter((r) => r.next && r.next.due && r.next.due.slice(0, 7) === ym).length, newThisYear: rels.filter((r) => String(r.createdAt).slice(0, 4) === year).length,
    unassigned: rels.filter((r) => !r.closed && !r.owner).length, unconfirmed: rels.filter((r) => !r.closed && r.confirmed === false).length, byStage,
  };
}

// Automatic transitions (design §11): the renewal window when the agreement nears
// its end. Returns the ids changed; the caller persists through updateRels.
function autoTransitions(doc, now, cfg) {
  const changed = [];
  for (const r of Object.values(doc.items || {})) {
    if (r.closed) continue;
    const h = health(r, now, cfg);
    if (!h.renewalDue) continue;
    const ren = STAGES[r.type].find((s) => s.renewal);
    r.log.push(logEntry("system", "stage", "协议到期前自动进入续约期 / renewal window entered automatically", { from: r.stage, to: ren.k }));
    r.stage = ren.k; r.stageAt = new Date(+now || Date.now()).toISOString(); r.stageBy = "system"; r.updatedAt = r.stageAt;
    changed.push(r.id);
  }
  return changed;
}

// An ORG id for an institution key (domain or hive:ABBR), minted on first use.
// A name a person would recognise. A bare number ("13", "1 (207)") is an Airtable
// autonumber that came through an unresolved lookup, a record id is a key, not a
// name (Rick, 2026-10-08: 出版社是乱码 — the 出版社 tab listed "1", "13", "9").
function goodName(name) {
  const s = String(name || "").trim();
  if (!s) return false;
  if (/^\d+(\s*\(\d+\))?$/.test(s)) return false;
  if (/^(hive|equip|new):/i.test(s) || /^rec[A-Za-z0-9]{14}$/.test(s)) return false;
  return true;
}

function orgIdFor(orgDoc, key, info) {
  const k = String(key || "").trim();
  if (!k) return null;
  if (orgDoc.byKey[k]) { const o = orgDoc.orgs[orgDoc.byKey[k]]; if (o && info) { if (goodName(info.name) && !goodName(o.name)) o.name = info.name; if (info.nameEn && !o.nameEn) o.nameEn = info.nameEn; } return orgDoc.byKey[k]; }
  const id = padO(orgDoc.next++);
  orgDoc.byKey[k] = id;
  orgDoc.orgs[id] = { id, keys: [k], name: (info && info.name) || "", nameEn: (info && info.nameEn) || "", region: (info && info.region) || "", orgType: (info && info.orgType) || "", internal: !!(info && info.internal), contacts: [], createdAt: new Date().toISOString() };
  return id;
}

// ---- auto-seeding (design v2 §13) -------------------------------------------
// Relationships are created from what the CRM already knows — once each, never
// overwriting a relationship someone has touched, never for our own entities:
//   tenant domains (hub institutions with a domain)      → it · operating · seed:tenant
//   Hive-workspace universities                           → university · lead / explore · seed:hive
//   Hive-workspace rows that deliver courses               → course · listed · seed:hive
//   Teachers table rows matched to a person                → course · listed · seed:teacher
//   Equip Curriculums publishers                           → publisher · onsale · seed:equip
//   the old crm/partners.json (stage, note, owner, type)   → folded into the above
// `src` = { institutions, people, publishers:[{recId,name}], teachers:[{name,email,teamsAccount}],
//           domainAdmins:{domain:[upn]}, oldPartners:{key:{stage,note,owner,type,region}} }
const COUNTRY_REGION = [[/中国|china|台湾|taiwan|香港|hong kong|澳门|macau/i, "cn"], [/美国|usa|united states|加拿大|canada|墨西哥|mexico/i, "na"], [/新加坡|singapore|马来西亚|malaysia|泰国|thailand|印尼|indonesia|菲律宾|philippines|越南|vietnam|柬埔寨|cambodia/i, "sea"], [/日本|japan/i, "jp"], [/巴西|brazil|阿根廷|argentina|智利|chile|秘鲁|peru|哥伦比亚|colombia/i, "sa"], [/非洲|africa|肯尼亚|kenya|南非|south africa|尼日利亚|nigeria|乌干达|uganda|埃塞|ethiopia/i, "af"]];
function regionOf(row) {
  if (REGIONS.includes(row.region)) return row.region;
  const legacy = { cn: "cn", "intl-cn": "cn", africa: "af", "south-america": "sa" }[row.region];
  if (legacy) return legacy;
  const hint = [row.country, row.city].filter(Boolean).join(" ");
  for (const [re, r] of COUNTRY_REGION) if (re.test(hint)) return r;
  if (row.domain && /\.cn$/.test(row.domain)) return "cn";
  return "other";
}
const OLD_STAGE = { it: { contact: "lead", trial: "proposal", partner: "operating", paused: "ended" }, publisher: { contact: "approach", trial: "evaluate", partner: "onsale", paused: "selloff" }, course: { contact: "apply", trial: "design", partner: "listed", paused: "paused" }, university: { contact: "lead", trial: "explore", partner: "running", paused: "ended" } };

function seed(src, docs, cfg, by, now) {
  const rels = docs.rels, orgs = docs.orgs, at = new Date(+now || Date.now()).toISOString();
  const created = [], excluded = [], skipped = [], renamed = [];
  // A party seeded while its source only knew a number keeps its id and history;
  // the name is refreshed once the source knows it. Never a name someone typed.
  const refresh = (partyId, name) => {
    if (!goodName(name)) return;
    const o = orgs.orgs[partyId];
    if (o && !goodName(o.name)) o.name = name;
    for (const r of Object.values(rels.items)) {
      if (!r.party || r.party.id !== partyId || goodName(r.party.name) || r.party.name === name) continue;
      r.party.name = name; r.updatedAt = at; renamed.push({ id: r.id, name });
    }
  };
  const peopleByKey = new Map();
  for (const p of src.people || []) for (const k of p.keys || []) peopleByKey.set(String(k).toLowerCase(), p);
  const has = (partyId, type) => Object.values(rels.items).some((r) => r.party && r.party.id === partyId && r.type === type);
  const mk = (type, party, stage, source, extra) => {
    if (has(party.id, type)) { skipped.push(party.id + ":" + type); return null; }
    const id = pad(rels.next++);
    const rel = newRelationship(Object.assign({ type, party, stage, source }, extra || {}), by || "system", id);
    rel.stageAt = at; rel.createdAt = at; rel.updatedAt = at; rel.log[0].at = at;
    rels.items[id] = rel; created.push({ id, type, party: party.name || party.id, source });
    return rel;
  };
  const admins = src.domainAdmins || {};
  const contactsOf = (domain) => (admins[domain] || []).map((upn) => peopleByKey.get(String(upn).toLowerCase())).filter(Boolean).map((p) => ({ person: p.crmId, name: p.name, role: "学校/机构代表", primary: false }));
  const old = src.oldPartners || {};
  const fold = (rel, key) => { const o = old[key]; if (!rel || !o) return; const map = OLD_STAGE[rel.type] || {}; if (o.stage && map[o.stage] && stageOf(rel.type, map[o.stage])) { rel.stage = map[o.stage]; if (stageOf(rel.type, rel.stage).closed) rel.closed = { at, reason: "paused", by: by || "system", stage: rel.stage }; } if (o.owner) rel.owner = String(o.owner).slice(0, 120); if (o.region) rel.region = regionOf({ region: o.region }); rel.currency = currencyOf(rel.region); rel.lang = langOf(rel.region); if (o.note) rel.log.push(logEntry(o.by || by || "system", "note", "[旧合作伙伴记录] " + o.note, { migrated: true })); };
  for (const i of src.institutions || []) {
    const key = i.key || i.domain;
    const cand = { key, name: i.name, nameEn: i.nameEn, abbr: i.abbr, domain: i.domain };
    const orgId = orgIdFor(orgs, key, { name: i.name || i.nameEn || "", nameEn: i.nameEn || "", region: regionOf(i) });
    if (isExcluded(cfg, cand)) { orgs.orgs[orgId].internal = true; excluded.push(key); continue; }
    refresh(orgId, i.name || i.nameEn);
    const party = { id: orgId, key, name: i.name || i.nameEn || key };
    const region = regionOf(i);
    if (i.domain) fold(mk("it", party, "operating", "seed:tenant", { region, terms: { domain: i.domain, unitPriceYear: 5, discountSeats: 0, seatsTotal: i.accounts || 0 }, contacts: contactsOf(i.domain), note: "" }), key);
    // A university: the Schools row's Type column when the table has one; else the
    // name itself, or the old partners.json (Rick, 2026-10-09: 大学没有从hive workspace
    // 中同步过来 — the live rows carried no Type, so nothing matched).
    const UNI = /大学|university|universit|college|学院|seminary|神学院|institute of/i;
    const isUni = UNI.test(String(i.type || "")) || (!String(i.type || "") && UNI.test([i.name, i.nameEn, i.abbr].filter(Boolean).join(" "))) || (old[key] && old[key].type === "university");
    if (isUni) fold(mk("university", party, i.courses ? "explore" : "lead", "seed:hive", { region }), key);
    else if (i.courses > 0 || (old[key] && old[key].type === "hive")) fold(mk("course", party, "listed", "seed:hive", { region, terms: i.hiveKey ? { hiveKey: "hive:" + i.hiveKey } : {} }), key);
    if (old[key] && old[key].type === "publisher" && !has(orgId, "publisher")) fold(mk("publisher", party, "onsale", "seed:equip", { region }), key);
  }
  // Teachers: one who belongs to an institution — the Teachers table's Organization,
  // else the tenant domain of their Teams account — is filed under that institution's
  // course relationship as a 授课教师 contact; only a teacher with no institution is a
  // course provider in their own right (Rick, 2026-10-09: 吴老师、尹老师都属于心桥中文…
  // 只有没有机构的独立老师，才在这里被列出来). A person-level relationship seeded
  // earlier for such a teacher, untouched since, is folded into the institution's.
  const instByName = new Map(), instByDomain = new Map(), excludedKeys = new Set(excluded);
  for (const i of src.institutions || []) {
    for (const n of [i.name, i.nameEn, i.abbr, i.hiveKey]) if (n) instByName.set(norm(n), i);
    if (i.domain) instByDomain.set(String(i.domain).toLowerCase(), i);
  }
  const instOfTeacher = (t, p) => {
    for (const o of String(t.organization || "").split(/[,，;；]/)) { const i = instByName.get(norm(o)); if (i) return i; }
    for (const acct of [t.teamsAccount, t.email].concat((p && p.keys) || [])) { const dom = String(acct || "").split("@")[1]; const i = dom && instByDomain.get(dom.toLowerCase()); if (i) return i; }
    return null;
  };
  const filed = [];
  for (const t of src.teachers || []) {
    const p = peopleByKey.get(String(t.teamsAccount || "").toLowerCase()) || peopleByKey.get(String(t.email || "").toLowerCase());
    if (!p) { skipped.push("teacher:" + (t.name || "?")); continue; }
    const inst = instOfTeacher(t, p);
    if (!inst) { mk("course", { id: p.crmId, name: p.name || t.name }, "listed", "seed:teacher", { region: "cn", terms: { hiveKey: t.id || "" } }); continue; }
    const ikey = inst.key || inst.domain;
    if (excludedKeys.has(ikey)) { skipped.push("teacher:" + (t.name || "?") + ":ours"); continue; }
    const orgId = orgIdFor(orgs, ikey, { name: inst.name || inst.nameEn || "", nameEn: inst.nameEn || "", region: regionOf(inst) });
    let rel = Object.values(rels.items).find((r) => r.party && r.party.id === orgId && r.type === "course");
    if (!rel) rel = fold(mk("course", { id: orgId, key: ikey, name: inst.name || inst.nameEn || ikey }, "listed", "seed:hive", { region: regionOf(inst), terms: inst.hiveKey ? { hiveKey: "hive:" + inst.hiveKey } : {} }), ikey) || Object.values(rels.items).find((r) => r.party && r.party.id === orgId && r.type === "course");
    if (!rel) continue;
    rel.contacts = rel.contacts || [];
    if (!rel.contacts.some((c) => c.person === p.crmId)) { rel.contacts.push({ person: p.crmId, name: p.name || t.name, role: "授课教师", primary: false }); rel.updatedAt = at; filed.push({ teacher: p.crmId, under: rel.id }); }
    for (const [id, r] of Object.entries(rels.items)) {
      if (r.source === "seed:teacher" && r.party && r.party.id === p.crmId && r.confirmed === false && (r.log || []).length <= 1) { delete rels.items[id]; filed.push({ teacher: p.crmId, under: rel.id, removed: id }); }
    }
  }
  for (const pub of src.publishers || []) {
    if (!pub.recId && !pub.name) continue;
    const key = pub.recId ? "equip:" + pub.recId : "equip:" + norm(pub.name);
    if (isExcluded(cfg, { key, name: pub.name })) { excluded.push(key); continue; }
    // Known so far only by number (the Equip copy predates the lookup fix, or the
    // sync has not run since): refresh what exists, create nothing until it has a name.
    if (!goodName(pub.name)) { if (orgs.byKey[key]) refresh(orgs.byKey[key], pub.name); skipped.push(key + ":unnamed"); continue; }
    const orgId = orgIdFor(orgs, key, { name: pub.name, orgType: "publisher", region: "na" });
    refresh(orgId, pub.name);
    fold(mk("publisher", { id: orgId, key, name: pub.name }, "onsale", "seed:equip", { region: "na", terms: { publisherKey: key } }), key);
  }
  return { created, excluded, skipped, renamed, filed, at };
}

// Gather the sources and seed; called after every hub rebuild and from 自动填入.
// Idempotent: a second run creates nothing. The run is logged (crm/partner-seed-log.json).
const SEED_LOG_BLOB = "crm/partner-seed-log.json";
async function runSeed(opts) {
  const o = opts || {}, log = o.log || (() => {}), by = o.by || "system", now = Date.now();
  const hub = require("./hub");
  const [h, cfg, equipData, snap, rolesDoc, old] = await Promise.all([
    hub.readHub(), readConfig(), require("./equip").readEquip().catch(() => null), require("./blob").readSnapshot().catch(() => null),
    require("./roles").readRoles().catch(() => ({ entries: [] })), hub.readPartners().catch(() => ({ partners: {} })),
  ]);
  if (!h) return { created: [], excluded: [], skipped: [], at: new Date(now).toISOString(), note: "no hub yet" };
  const domainAdmins = {};
  for (const e of (rolesDoc && rolesDoc.entries) || []) for (const r of e.roles || []) { const m = /^domain_(?:it|admin):(.+)$/.exec(r); if (m) { (domainAdmins[m[1]] = domainAdmins[m[1]] || []).push(e.user); } }
  const pubs = new Map();
  for (const c of (equipData && equipData.curriculums) || []) { const k = c.publisherRec || c.publisher; if (!k || pubs.has(k)) continue; pubs.set(k, { recId: c.publisherRec || "", name: c.publisher || "" }); }
  const src = { institutions: h.institutions || [], people: h.people || [], publishers: Array.from(pubs.values()), teachers: (snap && snap.private && snap.private.teachers) || [], domainAdmins, oldPartners: (old && old.partners) || {} };
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const relsNow = await readRels();
  let result = null, orgsSaved = null;
  await updateOrgs((od) => { result = seed(src, { rels: clone(relsNow), orgs: od }, cfg, by, now); orgsSaved = clone(od); return true; });
  await updateRels((d) => { result = seed(src, { rels: d, orgs: clone(orgsSaved) }, cfg, by, now); return result.created.length > 0 || result.renamed.length > 0 || result.filed.length > 0; });
  const entry = { at: result.at, by, created: result.created.length, excluded: result.excluded.length, skipped: result.skipped.length, renamed: result.renamed.length, filed: result.filed.length, sample: result.created.slice(0, 20) };
  await store.update(SEED_LOG_BLOB, { runs: [] }, (l) => { l.runs = [entry].concat(l.runs || []).slice(0, 30); });
  log(`partners: seeded ${result.created.length} relationship(s), ${result.excluded.length} excluded, ${result.skipped.length} already there`);
  return result;
}
const readSeedLog = () => store.read(SEED_LOG_BLOB, { runs: [] });

// Which of the stored relationships a reader may see. Every type, since the
// fundraising type left for Zoohu (Rick, 2026-10-09: 「We have decided to use Zoohu to
// manage our donors」); kept as the one place a confidential type would be filtered.
function visibleTypes() { return TYPE_KEYS.slice(); }

module.exports = {
  REL_BLOB, PRJ_BLOB, ORG_BLOB, CFG_BLOB, TYPES, TYPE_KEYS, STAGES, REGIONS, REGION_LABELS, CONTACT_ROLES, PROJECT_KINDS, DEFAULT_EXCLUDE,
  currencyOf, langOf, readRels, readProjects, readOrgs, readConfig, updateRels, updateProjects, updateOrgs, updateConfig,
  stageOf, stageIndex, health, moveCheck, logEntry, cleanParty, cleanContacts, cleanNext, cleanAgreement, cleanTerms, newRelationship, newProject,
  listByType, summary, autoTransitions, orgIdFor, isExcluded, visibleTypes, pad, padP, padO, seed, regionOf, runSeed, readSeedLog, SEED_LOG_BLOB,
};
