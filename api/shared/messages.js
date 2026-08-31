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
];

// Business promise stated in the confirmation email. Kept here so it is stated
// in exactly one place; override per-language via the Airtable Body if needed.
const REPLY_WORKING_DAYS = 2;

const DEFAULT_TEMPLATES = {
  order_confirmation: {
    zh: {
      subject: "【蜂巢】已收到您的选课订单 {{orderId}}",
      body: [
        "您好，",
        "",
        "我们已收到您的选课订单，感谢您的信任。",
        "",
        "订单编号：{{orderId}}",
        "提交时间：{{submittedAt}}",
        "教育路径：{{trackName}}",
        "",
        "所选课程（{{itemCount}} 门）：",
        "{{courseList}}",
        "",
        "合计：{{totalPrice}}",
        "",
        "课程提供方将在 {{replyDays}} 个工作日内与您联系，商定付款与入学事宜。",
        "如 {{replyDays}} 个工作日内未收到联系，请直接回复本邮件。",
        "",
        "蜂巢",
      ].join("\n"),
    },
    en: {
      subject: "[Hive] Your course order {{orderId}} has been received",
      body: [
        "Hello,",
        "",
        "We have received your course order. Thank you.",
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
        "The course provider will contact you within {{replyDays}} working days to arrange payment and enrolment.",
        "If you have not heard from anyone within {{replyDays}} working days, please reply to this email.",
        "",
        "Hive",
      ].join("\n"),
    },
  },

  order_notification: {
    zh: {
      subject: "新订单 {{orderId}}",
      body: [
        "🐝 新订单 {{orderId}}",
        "",
        "提交时间：{{submittedAt}}",
        "教育路径：{{trackName}}",
        "联系邮箱：{{email}}",
        "Teams 账号：{{teamsAccount}}",
        "所属蜂巢：{{schoolNames}}",
        "",
        "课程（{{itemCount}} 门）：",
        "{{courseList}}",
        "",
        "合计：{{totalPrice}}",
      ].join("\n"),
    },
    en: {
      subject: "New order {{orderId}}",
      body: [
        "🐝 New order {{orderId}}",
        "",
        "Submitted: {{submittedAt}}",
        "Track: {{trackName}}",
        "Email: {{email}}",
        "Teams account: {{teamsAccount}}",
        "Hive: {{schoolNames}}",
        "",
        "Courses ({{itemCount}}):",
        "{{courseList}}",
        "",
        "Total: {{totalPrice}}",
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

function formatCourseList(items, currency, lang) {
  return (items || [])
    .map((it) => {
      const bits = [it.code, courseName(it, lang)].filter(Boolean).join(" ");
      return `• ${bits} — ${formatMoney(it.price, currency, lang)}`;
    })
    .join("\n");
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
    trackName: (order.track && order.track.name) || "",
    itemCount: order.itemCount,
    courseList: formatCourseList(order.items, order.currency, l),
    totalPrice: formatMoney(order.totalPrice, order.currency, l),
    currency: order.currency,
    schoolNames: schoolNamesOf(order.items),
    replyDays: REPLY_WORKING_DAYS,
  };

  const notify = resolveTemplate(templates, "order_notification", l);
  const confirm = resolveTemplate(templates, "order_confirmation", l);
  const emailBody = renderTemplate(confirm.body, vars);

  return {
    notifyText: renderTemplate(notify.body, vars),
    emailSubject: renderTemplate(confirm.subject, vars),
    emailBodyText: emailBody,
    emailHtml: wrapEmailHtml(emailBody),
  };
}

module.exports = {
  PLACEHOLDERS,
  DEFAULT_TEMPLATES,
  REPLY_WORKING_DAYS,
  buildMessages,
  renderTemplate,
  resolveTemplate,
  formatMoney,
  formatWhen,
  formatCourseList,
};
