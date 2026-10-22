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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DOMAIN_RE = /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/;
const KINDS = { individual: ["个人老师", "Individual teacher"], team: ["教学团队", "Teaching team"], school: ["学校 / 机构", "School / organisation"] };
const LANGS = { zh: ["中文", "Chinese"], en: ["英文", "English"], both: ["中英双语", "Chinese and English"] };
// mail and consumer domains are an address, not an organisation
const PUBLIC_MAIL = /^(gmail|googlemail|outlook|hotmail|live|msn|yahoo|icloud|me|mac|aol|proton|protonmail|qq|vip\.qq|foxmail|163|126|yeah|sina|sohu|aliyun|139|189)\.[a-z.]+$/;

function clean(body) {
  const s = (v, n) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, n);
  const long = (v, n) => String(v == null ? "" : v).replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, n);
  const b = body || {};
  const a = {
    kind: KINDS[b.kind] ? b.kind : "",
    name: s(b.name, 80), email: s(b.email, 200).toLowerCase(), phone: s(b.phone, 60),
    org: s(b.org, 120), abbr: s(b.abbr, 12).toUpperCase().replace(/[^A-Z0-9]/g, ""), website: s(b.website, 200),
    domain: s(b.domain, 120).toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, ""),
    country: s(b.country, 60), city: s(b.city, 60),
    subjects: s(b.subjects, 300), grades: s(b.grades, 120), language: LANGS[b.language] ? b.language : "",
    teachers: Math.max(0, Math.min(999, parseInt(b.teachers, 10) || 0)),
    intro: long(b.intro, 3000), sample: long(b.sample, 1000),
    lang: b.lang === "en" ? "en" : "zh",
  };
  if (a.kind === "individual" && !a.org) a.org = a.name;
  const problems = [];
  if (!a.kind) problems.push("kind");
  if (!a.name) problems.push("name");
  if (!EMAIL_RE.test(a.email)) problems.push("email");
  if (!a.org) problems.push("org");
  if (!a.subjects) problems.push("subjects");
  if (a.intro.length < 20) problems.push("intro");
  if (!b.agree) problems.push("agree");
  if (a.domain && (!DOMAIN_RE.test(a.domain) || PUBLIC_MAIL.test(a.domain))) a.domain = "";
  return { app: a, problems };
}

// The party key: the organisation's own domain when it gave one, else the applicant's email.
const keyOf = (a) => a.domain || "apply:" + a.email;

// Store (or refresh) the application on its 课程提供方 relationship. `account` = the signed-in UPN, the platform's word.
async function submit(a, opts) {
  opts = opts || {};
  const now = new Date().toISOString(), by = opts.account || a.email;
  const application = Object.assign({}, a, { account: opts.account || "", at: now });
  const key = keyOf(a), region = P.regionOf({ country: a.country, city: a.city, domain: a.domain });
  const openIn = (d, orgId) => Object.values(d.items || {}).find((r) => r && r.type === "course" && !r.closed && ((r.party && (r.party.key === key || (orgId && r.party.id === orgId))) || (r.application && r.application.email === a.email)));
  const refresh = (open) => {
    const prev = open.application;
    open.application = Object.assign({}, application, { firstAt: (prev && (prev.firstAt || prev.at)) || now });
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
      if (open) { refresh(open); out = { id: open.id, again: true, key }; return; }
      const id = P.pad(d.next++);
      const rel = P.newRelationship({ type: "course", party, stage: "apply", source: "application", region, lang: a.lang, note: "网站「我要教课」申请 / applied on the website" }, by, id);
      rel.confirmed = true;
      rel.application = Object.assign({}, application, { firstAt: now });
      d.items[id] = rel; out = { id, again: false, key };
    });
    return out;
  }
  let out = null;
  await P.updateRels((d) => { const open = openIn(d, orgs0.byKey[key] || null); if (open) { refresh(open); out = { id: open.id, again: true, key }; } });
  return out;
}

const SITE = "https://www.fengchao.life";
function texts(id, a) {
  const L = (m, k) => (m[k] ? m[k][0] + " / " + m[k][1] : "");
  const staff = [
    `新的授课申请 / New teaching application · ${id}`,
    "",
    `申请人 / Applicant: ${a.name} · ${a.email}${a.phone ? " · " + a.phone : ""}${a.account ? " · " + a.account : ""}`,
    `类型 / Type: ${L(KINDS, a.kind)}`,
    `名称 / Name: ${a.org}${a.abbr ? " (" + a.abbr + ")" : ""}${a.domain ? " · " + a.domain : ""}${a.website ? " · " + a.website : ""}`,
    `地区 / Where: ${[a.city, a.country].filter(Boolean).join(", ") || "—"}`,
    `课程 / Courses: ${a.subjects}${a.grades ? " · " + a.grades : ""}${a.language ? " · " + L(LANGS, a.language) : ""}${a.teachers ? " · " + a.teachers + " 位老师 / teachers" : ""}`,
    "",
    a.intro,
    a.sample ? "\n样课 / Sample: " + a.sample : "",
    "",
    `管理中心 / Management centre: ${SITE}/management/#/ops/partners/course/${id}`,
  ].join("\n");
  const ack = a.lang === "en" ? {
    subject: `[Hive] We have your application to teach · ${id}`,
    body: `Dear ${a.name},\n\nThank you for applying to teach with Hive. We have received your application (${id}). Hive's education community manager will be in touch within two weeks to hear about your courses and your teaching.\n\nWhat follows: a conversation and review → onboarding (an orders channel and a course leader's account) → you create your courses in the management centre and we list them after review → families order and classes begin.\n\nQuestions: info@fengchao.life\n\nHive`,
  } : {
    subject: `【蜂巢】已收到您的授课申请 · ${id}`,
    body: `${a.name} 您好，\n\n谢谢您申请在蜂巢开课！我们已收到您的申请（编号 ${id}）。蜂巢教育社区经理会在两周内与您联系，了解您的课程和教学。\n\n接下来：交流与审核 → 开通（订单频道、课程负责人账号）→ 您在管理中心建课，审核后上架 → 家长下单、开课。\n\n如有问题请写信至 info@fengchao.life。\n\n蜂巢`,
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
  const log = (opts && opts.log) || (() => {});
  const flowUrl = process.env.POWER_AUTOMATE_URL;
  if (!flowUrl) return { ok: false, error: "no_flow" };
  try {
    const m = texts(id, a);
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

module.exports = { clean, submit, notify, texts, keyOf, KINDS, LANGS };
