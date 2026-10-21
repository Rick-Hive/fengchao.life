// Status notices (v3, Rick 2026-10-21: 「每次状态变化通知家长和机构」). Until now only the submission told anyone
// anything; contacted, paid, started, cancelled, expired, seated and extended were silent, and a family that ordered
// without an account heard nothing at all. Every status change now goes out through the same Power Automate flow the
// order confirmation uses — the flow takes finished text (see messages.js) — as an email to the family in the order's
// language and, for the events the provider must act on, a Teams post to the provider's channel.
//
//   event              family email   provider Teams   sent by
//   contacted          yes            —                provider / order manager (crm PATCH)
//   parent_paid        —              yes              the family (me PATCH) or the manager recording it
//   parent_paid_nudge  —              yes              the nightly sweep, 7 days without 已收款
//   paid, started      yes            —                provider / manager
//   cancelled          yes            when by family   whoever cancels (the provider's own cancellation needs no post)
//   cancel_request     —              yes              the family, past the self-service window
//   expired            yes            yes              the nightly sweep (or a reader that found it lapsed)
//   reminder_expiry    yes            yes              the nightly sweep, 3 days before the deadline
//   seated             yes            yes              递补: the provider / manager, or the sweep (automatic)
//   extended           yes            —                provider / manager
//   reopened           yes            —                the system administrator
//
// Wording: Airtable message-template rows `status_<event>` (family) and `provider_<event>` (provider) win over the
// built-in defaults below, per language, as for order_confirmation. The outcome is written on the order as
// `notices[]` (best effort) so the panel can show what was sent.
const { readSnapshot } = require("./blob");
const messages = require("./messages");
const crm = require("./crm");

const SITE = "https://www.fengchao.life";
const MY_ORDERS = `${SITE}/management/#/myorders`;
const OPS_ORDERS = `${SITE}/management/#/ops/orders/hive`;

const EVENTS = {
  contacted: { family: true },
  parent_paid: { provider: true },
  parent_paid_nudge: { provider: true },
  paid: { family: true },
  started: { family: true },
  cancelled: { family: true, providerIfFamily: true },
  cancel_request: { provider: true },
  expired: { family: true, provider: true },
  reminder_expiry: { family: true, provider: true },
  seated: { family: true, provider: true },
  extended: { family: true },
  reopened: { family: true },
};

const F = (zh, en) => ({ zh, en });
// {{orderId}} {{courseList}} {{providerName}} {{payBy}} {{note}} {{myOrdersUrl}} {{opsUrl}} {{email}} {{days}}
const DEFAULTS = {
  status_contacted: F(
    { subject: "【蜂巢】{{providerName}} 已联系您 · 订单 {{orderId}}", body: "您好，\n\n课程提供方 {{providerName}} 已就订单 {{orderId}} 与您联系。课程费请直接付给课程提供方；付款后请登录「我的订单」点「我已付款」：{{myOrdersUrl}}\n\n请在 {{payBy}} 前完成缴费，逾期订单会自动过期、座位释放；需要更多时间请联系课程提供方。\n\n课程：\n{{courseList}}\n\n{{note}}" },
    { subject: "[Hive] {{providerName}} has been in touch · order {{orderId}}", body: "Hello,\n\n{{providerName}} has contacted you about order {{orderId}}. The course fee is paid to the provider directly; once paid, sign in to My orders and click \"I have paid\": {{myOrdersUrl}}\n\nPlease pay by {{payBy}}; after that the order expires and the seat is released. Ask the provider if you need more time.\n\nCourses:\n{{courseList}}\n\n{{note}}" }),
  status_paid: F(
    { subject: "【蜂巢】已收到课程费 · 订单 {{orderId}}", body: "您好，\n\n课程提供方 {{providerName}} 已确认收到订单 {{orderId}} 的课程费，座位已确认。开课安排由课程提供方通知。\n\n课程：\n{{courseList}}\n\n「我的订单」：{{myOrdersUrl}}" },
    { subject: "[Hive] Course fee received · order {{orderId}}", body: "Hello,\n\n{{providerName}} has confirmed the course fee for order {{orderId}}; your seat is confirmed. The provider will tell you when the course starts.\n\nCourses:\n{{courseList}}\n\nMy orders: {{myOrdersUrl}}" }),
  status_started: F(
    { subject: "【蜂巢】课程已开始 · 订单 {{orderId}}", body: "您好，\n\n订单 {{orderId}} 的课程已开始。\n\n课程：\n{{courseList}}\n\n{{note}}" },
    { subject: "[Hive] Course started · order {{orderId}}", body: "Hello,\n\nThe courses on order {{orderId}} have started.\n\nCourses:\n{{courseList}}\n\n{{note}}" }),
  status_cancelled: F(
    { subject: "【蜂巢】订单已取消 · {{orderId}}", body: "您好，\n\n订单 {{orderId}} 已取消{{note}}。座位已释放；选课费按政策不退。如需重新选课，欢迎再次访问 {{siteUrl}}。\n\n课程：\n{{courseList}}" },
    { subject: "[Hive] Order cancelled · {{orderId}}", body: "Hello,\n\nOrder {{orderId}} has been cancelled{{note}}. The seat is released; the selection fee is not refundable. To enrol again, visit {{siteUrl}}.\n\nCourses:\n{{courseList}}" }),
  status_expired: F(
    { subject: "【蜂巢】订单已过期 · {{orderId}}", body: "您好，\n\n订单 {{orderId}} 的付款期限（{{payBy}}）已过，订单已自动关闭，座位已释放。如仍想报名，请重新选课，或联系课程提供方 {{providerName}}。\n\n课程：\n{{courseList}}" },
    { subject: "[Hive] Order expired · {{orderId}}", body: "Hello,\n\nThe payment deadline for order {{orderId}} ({{payBy}}) has passed; the order is closed and the seat released. To enrol after all, select the course again or contact {{providerName}}.\n\nCourses:\n{{courseList}}" }),
  status_reminder_expiry: F(
    { subject: "【蜂巢】付款期限 {{days}} 天后到期 · 订单 {{orderId}}", body: "您好，\n\n订单 {{orderId}} 的付款期限是 {{payBy}}。若已向课程提供方 {{providerName}} 付款，请登录「我的订单」点「我已付款」：{{myOrdersUrl}}；需要更多时间请联系课程提供方。到期未付款的订单会自动关闭。\n\n课程：\n{{courseList}}" },
    { subject: "[Hive] Payment due in {{days}} days · order {{orderId}}", body: "Hello,\n\nOrder {{orderId}} must be paid by {{payBy}}. If you have paid {{providerName}}, sign in to My orders and click \"I have paid\": {{myOrdersUrl}}; ask the provider if you need more time. An unpaid order closes on the deadline.\n\nCourses:\n{{courseList}}" }),
  status_seated: F(
    { subject: "【蜂巢】候补成功，已为您安排座位 · 订单 {{orderId}}", body: "您好，\n\n订单 {{orderId}} 中候补的课程已有座位，现已为您安排。课程提供方 {{providerName}} 会与您确认缴费；请在 {{payBy}} 前完成。\n\n课程：\n{{courseList}}\n\n「我的订单」：{{myOrdersUrl}}" },
    { subject: "[Hive] A seat opened for you · order {{orderId}}", body: "Hello,\n\nA waitlisted course on order {{orderId}} now has a seat, and it is yours. {{providerName}} will confirm payment with you; please pay by {{payBy}}.\n\nCourses:\n{{courseList}}\n\nMy orders: {{myOrdersUrl}}" }),
  status_extended: F(
    { subject: "【蜂巢】付款期限已延长至 {{payBy}} · 订单 {{orderId}}", body: "您好，\n\n订单 {{orderId}} 的付款期限已延长至 {{payBy}}。付款后请登录「我的订单」点「我已付款」：{{myOrdersUrl}}\n\n课程：\n{{courseList}}" },
    { subject: "[Hive] Payment deadline extended to {{payBy}} · order {{orderId}}", body: "Hello,\n\nThe payment deadline for order {{orderId}} is now {{payBy}}. Once paid, sign in to My orders and click \"I have paid\": {{myOrdersUrl}}\n\nCourses:\n{{courseList}}" }),
  status_reopened: F(
    { subject: "【蜂巢】订单已重新打开 · {{orderId}}", body: "您好，\n\n订单 {{orderId}} 已重新打开，课程提供方 {{providerName}} 会与您联系。\n\n课程：\n{{courseList}}\n\n{{note}}" },
    { subject: "[Hive] Order reopened · {{orderId}}", body: "Hello,\n\nOrder {{orderId}} has been reopened; {{providerName}} will be in touch.\n\nCourses:\n{{courseList}}\n\n{{note}}" }),
  provider_parent_paid: F(
    { subject: "家长称已付款 · {{orderId}}", body: "订单 {{orderId}}：家长（{{email}}）确认已向贵机构付款{{note}}。请核实后在管理中心点「已收款」：{{opsUrl}}\n\n课程：\n{{courseList}}" },
    { subject: "Family reports payment · {{orderId}}", body: "Order {{orderId}}: the family ({{email}}) confirms it has paid you{{note}}. Please verify and click \"Payment received\" in the management centre: {{opsUrl}}\n\nCourses:\n{{courseList}}" }),
  provider_parent_paid_nudge: F(
    { subject: "家长已付款 7 天，尚未确认收款 · {{orderId}}", body: "订单 {{orderId}}：家长（{{email}}）7 天前确认已付款，贵机构尚未点「已收款」。请核实：{{opsUrl}}。蜂巢订单经理同时收到此提醒。" },
    { subject: "Family paid 7 days ago, not yet confirmed · {{orderId}}", body: "Order {{orderId}}: the family ({{email}}) reported payment 7 days ago and \"Payment received\" has not been clicked. Please verify: {{opsUrl}}. Hive's order manager has this reminder too." }),
  provider_cancelled: F(
    { subject: "家长取消了订单 · {{orderId}}", body: "订单 {{orderId}}（{{email}}）已由家长取消{{note}}，座位已释放。\n\n课程：\n{{courseList}}" },
    { subject: "Family cancelled · {{orderId}}", body: "Order {{orderId}} ({{email}}) was cancelled by the family{{note}}; the seat is released.\n\nCourses:\n{{courseList}}" }),
  provider_cancel_request: F(
    { subject: "家长申请取消 · {{orderId}}", body: "订单 {{orderId}}（{{email}}）的家长申请取消{{note}}。请与家长确认后在管理中心处理：{{opsUrl}}" },
    { subject: "Family asks to cancel · {{orderId}}", body: "The family on order {{orderId}} ({{email}}) asks to cancel{{note}}. Please confirm with them and act in the management centre: {{opsUrl}}" }),
  provider_expired: F(
    { subject: "订单已过期 · {{orderId}}", body: "订单 {{orderId}}（{{email}}）付款期限 {{payBy}} 已过，已自动关闭，座位已释放。\n\n课程：\n{{courseList}}" },
    { subject: "Order expired · {{orderId}}", body: "Order {{orderId}} ({{email}}) passed its payment deadline ({{payBy}}) and is closed; the seat is released.\n\nCourses:\n{{courseList}}" }),
  provider_reminder_expiry: F(
    { subject: "订单 {{days}} 天后过期 · {{orderId}}", body: "订单 {{orderId}}（{{email}}）将于 {{payBy}} 过期，家长尚未确认付款。如需保留，请在管理中心点「延长 14 天」：{{opsUrl}}" },
    { subject: "Order expires in {{days}} days · {{orderId}}", body: "Order {{orderId}} ({{email}}) expires on {{payBy}}; the family has not confirmed payment. To keep it, click \"Extend 14 days\" in the management centre: {{opsUrl}}" }),
  provider_seated: F(
    { subject: "候补递补 · {{orderId}}", body: "订单 {{orderId}}（{{email}}）的候补课程已有座位，已自动递补{{note}}。请与家长确认缴费：{{opsUrl}}\n\n课程：\n{{courseList}}" },
    { subject: "Seated from the waitlist · {{orderId}}", body: "A waitlisted course on order {{orderId}} ({{email}}) got a seat and was seated{{note}}. Please confirm payment with the family: {{opsUrl}}\n\nCourses:\n{{courseList}}" }),
};

function resolve(templates, key, lang) {
  const l = lang === "en" ? "en" : "zh";
  const d = (DEFAULTS[key] && DEFAULTS[key][l]) || { subject: "", body: "" };
  const a = (templates && templates[key] && templates[key][l]) || null;
  return a ? { subject: a.subject || d.subject, body: a.body || d.body } : d;
}

// the provider's route for an order (one hive per order since stage 2 ①; the first otherwise)
function routeOf(order, routing) {
  const h = (order.hives || [])[0] || {};
  const r = (routing && routing[h.key]) || {};
  return { hiveKey: h.key || "", schoolName: r.name || h.name || h.abbr || "", schoolAbbr: r.abbr || h.abbr || "", teamsChannelId: r.teamsChannelId || "", notifyEmail: r.notifyEmail || "" };
}

function vars(order, event, opts, lang) {
  const route = opts.route || {};
  const st = crm.statusOf(order);
  const payByMs = ["submitted", "contacted"].includes(st) ? crm.expiresAt(order) : NaN;
  const payBy = Number.isFinite(payByMs) ? messages.formatWhen(new Date(payByMs).toISOString(), lang).slice(0, 10) : "";
  const note = String(opts.note || "").trim();
  return {
    orderId: order.orderId, email: order.email || "",
    courseList: messages.formatCourseList(order.items || [], order.currency, lang),
    providerName: route.schoolName || (lang === "en" ? "the provider" : "课程提供方"),
    payBy, days: opts.days != null ? opts.days : "",
    note: note ? (lang === "en" ? ` (${note})` : `（${note}）`) : "",
    myOrdersUrl: MY_ORDERS, opsUrl: OPS_ORDERS, siteUrl: SITE,
  };
}

// Compose and send one event. Returns { ok, status, sent: { family, provider } } and never throws: a notice that
// fails is logged and recorded, the order itself is already written.
async function notify(order, event, opts) {
  opts = opts || {};
  const spec = EVENTS[event];
  const log = opts.log || (() => {});
  if (!spec) return { ok: false, status: 0, error: "unknown_event" };
  const flowUrl = process.env.POWER_AUTOMATE_URL;
  if (!flowUrl) return { ok: false, status: 0, error: "no_flow" };
  const snap = opts.snapshot !== undefined ? opts.snapshot : await readSnapshot().catch(() => null);
  const templates = (snap && snap.messageTemplates) || null;
  const routing = (snap && snap.private && snap.private.schoolRouting) || {};
  const route = routeOf(order, routing);
  const lang = order.lang === "en" ? "en" : "zh";
  const toFamily = !!spec.family && !!order.email;
  const toProvider = !!spec.provider || (!!spec.providerIfFamily && !!opts.byFamily);
  if (!toFamily && !toProvider) return { ok: true, status: 0, sent: { family: false, provider: false } };

  const v = vars(order, event, Object.assign({ route }, opts), lang);
  const fam = toFamily ? resolve(templates, `status_${event}`, lang) : null;
  // the provider reads its own language: the hive's Teams channel is bilingual by convention, so both texts go
  const pz = toProvider ? resolve(templates, `provider_${event}`, "zh") : null, pe = toProvider ? resolve(templates, `provider_${event}`, "en") : null;
  const vz = toProvider ? vars(order, event, Object.assign({ route }, opts), "zh") : null, ve = toProvider ? vars(order, event, Object.assign({ route }, opts), "en") : null;
  const providerText = toProvider ? messages.renderTemplate(pz.body, vz) + "\n\n— — —\n\n" + messages.renderTemplate(pe.body, ve) : "";
  const providerSubject = toProvider ? messages.renderTemplate(pz.subject, vz) + " | " + messages.renderTemplate(pe.subject, ve) : "";
  const emailBody = fam ? messages.renderTemplate(fam.body, v) : providerText;
  const emailSubject = fam ? messages.renderTemplate(fam.subject, v) : providerSubject;
  const wrap = (t) => "<div style=\"font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,'PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif;font-size:15px;line-height:1.7;color:#1f2328;max-width:640px\">" + messages.escapeHtml(t).replace(/\r?\n/g, "<br>\n") + "</div>";
  // Shaped like an order so the flow's trigger accepts it (schema: items[].name string, price integer; routes[]).
  const items = (order.items || []).map((it) => ({ code: it.code || "", name: [it.nameZh, it.nameEn].filter(Boolean).join(" / "), nameZh: it.nameZh || "", nameEn: it.nameEn || "", price: typeof it.price === "number" ? Math.round(it.price) : 0, priceTbd: !!it.priceTbd, schoolName: it.schoolName || "", schoolAbbr: it.schoolAbbr || "" }));
  const routes = toProvider ? [Object.assign({}, route, { usedDefaultChannel: false, itemCount: items.length, subtotal: order.totalPrice || 0, currency: order.currency || "CNY", notifyText: providerText, notifySubject: providerSubject, notifyHtml: wrap(providerText) })] : [];
  const payload = {
    orderId: order.orderId, submission: order.submission || order.orderId, submittedAt: order.submittedAt, email: order.email || "", teamsAccount: order.teamsAccount || "", lang,
    track: order.track ? { trackId: order.track.trackId, name: [order.track.nameZh, order.track.nameEn].filter(Boolean).join(" / "), nameZh: order.track.nameZh || "", nameEn: order.track.nameEn || "" } : null,
    items, itemCount: items.length, totalPrice: order.totalPrice || 0, currency: order.currency || "CNY",
    routes, routeCount: routes.length,
    notifyText: providerText || emailBody,
    emailTo: toFamily ? order.email : (route.notifyEmail || ""), emailSubject, emailHtml: wrap(emailBody), emailBodyText: emailBody,
    event, status: crm.statusOf(order),
  };
  const headers = { "Content-Type": "application/json" };
  if (process.env.ORDER_SHARED_SECRET) headers["X-Order-Secret"] = process.env.ORDER_SHARED_SECRET;
  let result;
  try {
    const res = await fetch(flowUrl, { method: "POST", headers, body: JSON.stringify(payload) });
    result = { ok: res.ok || res.status === 202, status: res.status };
    if (!result.ok) log(`notify ${event} ${order.orderId}: flow answered ${res.status}`);
  } catch (err) {
    result = { ok: false, status: 0, error: String((err && err.message) || err).slice(0, 200) };
    log(`notify ${event} ${order.orderId}: ${result.error}`);
  }
  result.sent = { family: toFamily, provider: toProvider };
  if (opts.record !== false) await record(order.orderId, event, result).catch((err) => log(`notify ${event} ${order.orderId}: not recorded: ${err && err.message}`));
  return result;
}

// notices[] on the order, newest last, capped — read fresh so a concurrent change is not overwritten
async function record(orderId, event, result) {
  const cur = await crm.readOrder(orderId);
  if (!cur) return;
  const notices = (cur.order.notices || []).concat([{ event, at: new Date().toISOString(), ok: !!result.ok, status: result.status || 0, to: result.sent }]).slice(-50);
  await crm.writeOrder(Object.assign({}, cur.order, { notices }), cur.etag);
}

module.exports = { EVENTS, DEFAULTS, notify, resolve, routeOf, SITE, MY_ORDERS, OPS_ORDERS };
