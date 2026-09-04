// Customer-facing message copy for order submissions.
//
// Two audiences, one mechanism:
//   order_confirmation  -> email to the parent, in the language they ordered in
//   order_notification  -> Teams message to the hive, same language
//
// The API composes the finished strings and hands them to Power Automate as
// ready-made text (notifyText / emailSubject / emailHtml). The flow does no
// formatting at all. That is deliberate: the flow used to build the Teams
// message from individual fields, which silently broke twice — once when
// `items[].name` was renamed during the bilingual refactor (every order was
// rejected by the trigger's schema for months) and once for the order total,
// which rendered as a bare "CNY" with no number. Presentation lives here, in
// code that can be tested, and wording lives in Airtable, where it can be
// edited without a deploy.
//
// Precedence for every string: Airtable row -> built-in default below.

// Placeholders usable in any Airtable Subject or Body cell. Unknown ones are
// replaced with an empty string rather than left visible to the customer.
const PLACEHOLDERS = [
  "orderId",
  "submittedAt",
  "email",
  "teamsAccount",
  "trackName",
  "itemCount",
  "courseList",
  "totalPrice",
  "currency",
  "schoolNames",
  "replyDays",
  "langName",
];

// Business promise stated in the confirmation email. Kept here so it is stated
// in exactly one place; override per-language via the Airtable Body if needed.
const REPLY_WORKING_DAYS = 2;

const DEFAULT_TEMPLATES = {
  // Parent-facing. Sets one expectation deliberately: the hive contacts them,
  // and money never changes hands through 蜂巢.
  order_confirmation: {
    zh: {
      subject: "【蜂巢】订单确认 {{orderId}}｜已收到您的选课",
      body: [
        "您好，",
        "",
        "感谢您通过蜂巢选课。您的订单已经收到，以下是订单详情，请您核对：",
        "",
        "订单编号：{{orderId}}",
        "提交时间：{{submittedAt}}",
        "教育路径：{{trackName}}",
        "",
        "所选课程（共 {{itemCount}} 门）：",
        "{{courseList}}",
        "",
        "合计：{{totalPrice}}",
        "",
        "接下来会发生什么",
        "课程所属机构（{{schoolNames}}）将在 {{replyDays}} 个工作日内直接与您联系，" +
          "与您确认开课时间、付款方式与入学手续。付款与入学由课程所属机构与您单独完成，蜂巢不代收任何费用。",
        "",
        "如超过 {{replyDays}} 个工作日仍未收到联系，请直接回复本邮件并注明订单编号，我们会为您跟进。",
        "",
        "蜂巢",
        "以线上资源推动C教育生态重建",
        "https://www.fengchao.life",
      ].join("\n"),
    },
    en: {
      subject: "[Hive] Order confirmation {{orderId}} — we have your course selection",
      body: [
        "Hello,",
        "",
        "Thank you for choosing courses through Hive. Your order has been received. Please check the details below:",
        "",
        "Order number: {{orderId}}",
        "Submitted: {{submittedAt}}",
        "Track: {{trackName}}",
        "",
        "Courses selected ({{itemCount}}):",
        "{{courseList}}",
        "",
        "Total: {{totalPrice}}",
        "",
        "What happens next",
        "The institution offering these courses ({{schoolNames}}) will contact you directly within " +
          "{{replyDays}} working days to confirm the start date, payment and enrolment. Payment and " +
          "enrolment are handled between you and that institution; Hive does not collect fees.",
        "",
        "If you have not heard from anyone within {{replyDays}} working days, reply to this email with " +
          "your order number and we will follow up for you.",
        "",
        "Hive",
        "Rebuilding the C-education ecosystem through online resources",
        "https://www.fengchao.life",
      ].join("\n"),
    },
  },

  // Hive-facing: posted to the hive's Teams channel and emailed to its
  // notification address. Written to be scanned in a channel — who to contact,
  // in which language, by when — not read as prose.
  //
  // The subject carries only the order id. Counts and totals used to be in it
  // too, which made it long enough to be truncated in a mail list and, worse,
  // put a money figure in the one line that gets forwarded and quoted. All of
  // that detail is in the body, one scroll away.
  order_notification: {
    zh: {
      subject: "蜂巢新订单 {{orderId}}",
      body: [
        "🐝 蜂巢新订单 {{orderId}}",
        "",
        "家长联系方式",
        "· 邮箱：{{email}}",
        "· Teams：{{teamsAccount}}",
        "· 沟通语言：{{langName}}",
        "",
        "订单信息",
        "· 提交时间：{{submittedAt}}",
        "· 教育路径：{{trackName}}",
        "· 所属机构：{{schoolNames}}",
        "",
        "课程明细（共 {{itemCount}} 门）",
        "{{courseList}}",
        "",
        "合计：{{totalPrice}}",
        "",
        "请在 {{replyDays}} 个工作日内联系家长，确认开课时间、付款方式与入学手续。",
        "家长已收到自动确认邮件，并已被告知由贵机构直接联系。",
      ].join("\n"),
    },
    en: {
      subject: "New Hive order {{orderId}}",
      body: [
        "🐝 New Hive order {{orderId}}",
        "",
        "Family contact",
        "· Email: {{email}}",
        "· Teams: {{teamsAccount}}",
        "· Preferred language: {{langName}}",
        "",
        "Order",
        "· Submitted: {{submittedAt}}",
        "· Track: {{trackName}}",
        "· Institution: {{schoolNames}}",
        "",
        "Courses ({{itemCount}})",
        "{{courseList}}",
        "",
        "Total: {{totalPrice}}",
        "",
        "Please contact the family within {{replyDays}} working days to confirm the start date, payment and enrolment.",
        "They have already received an automatic confirmation email telling them you will be in touch.",
      ].join("\n"),
    },
  },
};

function pick(lang) {
  return lang === "en" ? "en" : "zh";
}

// Airtable rows win over defaults, per field, so a row that fills in only
// Subject still inherits the default Body.
function resolveTemplate(templates, key, lang) {
  const l = pick(lang);
  const fallback = (DEFAULT_TEMPLATES[key] && DEFAULT_TEMPLATES[key][l]) || { subject: "", body: "" };
  const fromAirtable = (templates && templates[key] && templates[key][l]) || null;
  if (!fromAirtable) return fallback;
  return {
    subject: fromAirtable.subject || fallback.subject,
    body: fromAirtable.body || fallback.body,
  };
}

function renderTemplate(str, vars) {
  return String(str || "").replace(/\{\{\s*(\w+)\s*\}\}/g, (_, name) => {
    const v = vars[name];
    return v === undefined || v === null ? "" : String(v);
  });
}

function formatMoney(amount, currency, lang) {
  const n = typeof amount === "number" && Number.isFinite(amount) ? amount : 0;
  const grouped = n.toLocaleString("en-US");
  // "¥3,500" reads naturally in Chinese; "CNY 3,500" is unambiguous in English.
  return pick(lang) === "zh" ? `¥${grouped}` : `${currency || "CNY"} ${grouped}`;
}

function formatWhen(iso, lang) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso || "");
  // Beijing time — every party to these orders is in that timezone, and a UTC
  // timestamp in a parent's inbox reads as the wrong day for evening orders.
  const parts = new Intl.DateTimeFormat(pick(lang) === "zh" ? "zh-CN" : "en-GB", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
  return pick(lang) === "zh" ? `${parts}（北京时间）` : `${parts} (Beijing time)`;
}

// One course per line, named in the reader's language — a family who ordered in
// Chinese should not have to read "Science in the Scientific Revolution", and the
// hive replying to them sees the same wording they will. Falls back to the other
// language, then to the bilingual `name`, so a half-filled Airtable row still
// renders something. The price is separated by a spaced dash so name and amount
// never run together the way they did in the old flow-built message.
function courseName(it, lang) {
  const first = pick(lang) === "zh" ? it.nameZh : it.nameEn;
  const second = pick(lang) === "zh" ? it.nameEn : it.nameZh;
  return first || second || it.name || "";
}

// Squash any internal newline or run of spaces down to a single space.
//
// An Airtable cell can hold a line break — "TT-CHLT-109 / 《失乐园》" arrived
// with one inside the course name — and while HTML collapses that invisibly on
// the website, these messages are composed as PLAIN TEXT, so it split one
// course across two lines and broke the "• code name — price" shape. Guarding
// here fixes every message immediately and needs no re-sync; the stray newline
// is still worth cleaning at the source.
function oneLine(s) {
  return String(s == null ? "" : s).replace(/\s+/g, " ").trim();
}

// The track name renders in ONE language — the language the order was placed
// in — for BOTH audiences: the parent's confirmation email and the hive's
// notification. This is the site's single-language rule (v15) and it applies to
// the hive too; "国际路线：非古典教育 / International: Non-Classical" was
// wrong in both places, not just the parent's email.
//
// Note this differs from the course fields in the payload (name, subjects,
// class type, teaching language), which really are sent bilingually. Those are
// data the flow may reuse; this is display text the reader sees.
//
// `api/order/index.js` sends nameZh/nameEn alongside the combined `name`. When
// only the flat `name` is present (a snapshot synced before the 毕业路径
// split) it is used as-is, which is the best available fallback.
function trackNameOne(order, lang) {
  const t = (order && order.track) || {};
  const zh = oneLine(t.nameZh);
  const en = oneLine(t.nameEn);
  const first = pick(lang) === "zh" ? zh : en;
  const second = pick(lang) === "zh" ? en : zh;
  return first || second || oneLine(t.name);
}

// A course whose price is not set yet shows the placeholder the site shows,
// not ¥0 — a family reading "¥0" would reasonably think the course is free.
function priceLabel(it, currency, lang) {
  const tbd = it.priceTbd || typeof it.price !== "number";
  if (tbd) return pick(lang) === "zh" ? "价格待定" : "Price TBD";
  return formatMoney(it.price, currency, lang);
}

function formatCourseList(items, currency, lang) {
  return (items || [])
    .map((it) => {
      const bits = [oneLine(it.code), oneLine(courseName(it, lang))].filter(Boolean).join(" ");
      return `• ${bits} — ${priceLabel(it, currency, lang)}`;
    })
    .join("\n");
}

// The order total sums only the prices that exist, so a cart containing an
// unpriced course would otherwise show a figure that looks final and is not —
// and a hive could quote it to the family verbatim.
//
// It is not deleted, because the hive still needs to know whether this is a ¥400
// order or a ¥5,000 one. It is relabelled as what it truthfully is: a floor.
// "¥5,288 起" cannot be mistaken for a quote. The caveat is appended to the
// value rather than added to the templates, so wording already edited in
// Airtable keeps working untouched.
function totalLabel(order, lang) {
  const items = order.items || [];
  const tbd = items.filter((it) => it.priceTbd || typeof it.price !== "number").length;
  const money = formatMoney(order.totalPrice, order.currency, lang);
  const zh = pick(lang) === "zh";

  if (!tbd) return money;

  // Nothing priced at all: a floor of zero is meaningless, so give up the number.
  if (tbd === items.length) return zh ? "价格待定" : "Price TBD";

  // "起" and "At least" are the same claim: this is a floor, not a quote.
  // Capitalised so it still reads correctly if a template ever places
  // {{totalPrice}} at the start of a line rather than after a "Total:" label.
  return zh
    ? `${money} 起（${tbd} 门课程价格待定）`
    : `At least ${money} (${tbd} course${tbd > 1 ? "s" : ""} not priced yet)`;
}

function schoolNamesOf(items) {
  const seen = [];
  for (const it of items || []) {
    const n = it.schoolName || "";
    if (n && seen.indexOf(n) === -1) seen.push(n);
  }
  return seen.join(" / ");
}

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Airtable bodies are plain text so they stay easy to edit. Turn them into
// simple, safe HTML for the email rather than asking editors to write markup.
function textToHtml(text) {
  return escapeHtml(text).replace(/\r?\n/g, "<br>\n");
}

function wrapEmailHtml(bodyText) {
  return [
    '<div style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',',
    "Roboto,'Helvetica Neue',Arial,'PingFang SC','Hiragino Sans GB',",
    "'Microsoft YaHei',sans-serif;font-size:15px;line-height:1.7;color:#1f2328;",
    'max-width:640px">',
    textToHtml(bodyText),
    "</div>",
  ].join("");
}

// Build every string Power Automate needs. `order` is the payload assembled in
// api/order/index.js; `templates` is snapshot.messageTemplates (may be absent).
function buildMessages(order, templates, lang) {
  const l = pick(lang);
  const vars = {
    orderId: order.orderId,
    submittedAt: formatWhen(order.submittedAt, l),
    email: order.email,
    teamsAccount: order.teamsAccount || (l === "zh" ? "（未填写）" : "(not provided)"),
    trackName: trackNameOne(order, l),
    itemCount: order.itemCount,
    courseList: formatCourseList(order.items, order.currency, l),
    totalPrice: totalLabel(order, l),
    currency: order.currency,
    schoolNames: schoolNamesOf(order.items),
    replyDays: REPLY_WORKING_DAYS,
    // So a hive knows which language to reply in without guessing from the name.
    langName: l === "zh" ? "中文" : "English",
  };

  const notify = resolveTemplate(templates, "order_notification", l);
  const confirm = resolveTemplate(templates, "order_confirmation", l);
  const emailBody = renderTemplate(confirm.body, vars);

  const notifyBody = renderTemplate(notify.body, vars);

  return {
    // Hive-facing: the same wording is posted to Teams and emailed to the hive's
    // notification address, so a hive that does not live in Teams still gets it.
    notifyText: notifyBody,
    notifySubject: renderTemplate(notify.subject, vars),
    notifyHtml: wrapEmailHtml(notifyBody),
    // Parent-facing.
    emailSubject: renderTemplate(confirm.subject, vars),
    emailBodyText: emailBody,
    emailHtml: wrapEmailHtml(emailBody),
  };
}

module.exports = {
  escapeHtml,
  PLACEHOLDERS,
  DEFAULT_TEMPLATES,
  REPLY_WORKING_DAYS,
  buildMessages,
  renderTemplate,
  resolveTemplate,
  formatMoney,
  formatWhen,
  formatCourseList,
  priceLabel,
  totalLabel,
};
