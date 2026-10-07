// 待处理与异常 → the order manager (decision 18: stalled orders "notify the owner";
// Rick, 2026-10-08: the order manager is the staff:sales account, reachable in
// Teams and by email). One digest a day when there is something to act on,
// through the same Power Automate flow the order notifications use: the flow
// posts to a Teams channel and sends an email from finished text, so the digest
// is shaped like an order — one route to the Hive Orders channel, the "customer"
// email being the order manager's. No new permissions, no new flow.
//
// Recipients: every account holding staff:sales in roles.json; CRM_DIGEST_TO
// (comma list) adds or replaces. The Teams channel is DEFAULT_TEAMS_CHANNEL_ID
// (the Hive Orders team's General channel) unless CRM_DIGEST_CHANNEL_ID is set.
// What was sent last is kept in crm/digest.json so the same day is not sent twice.
const { BlobServiceClient } = require("@azure/storage-blob");
const { snapshotBlob } = require("./config");
const { escapeHtml } = require("./messages");
const crm = require("./crm");
const hub = require("./hub");
const { readRoles } = require("./roles");

const BLOB = "crm/digest.json";
const SITE = process.env.SITE_ORIGIN || "https://fengchao.life";

function container() {
  const conn = process.env.STORAGE_CONNECTION_STRING;
  if (!conn) throw new Error("STORAGE_CONNECTION_STRING app setting is not configured");
  return BlobServiceClient.fromConnectionString(conn).getContainerClient(snapshotBlob.container);
}
async function readLast() {
  const b = container().getBlockBlobClient(BLOB);
  if (!(await b.exists())) return null;
  try { return JSON.parse((await b.downloadToBuffer()).toString("utf8")); } catch { return null; }
}
async function writeLast(doc) {
  const c = container(); await c.createIfNotExists();
  const body = JSON.stringify(doc);
  await c.getBlockBlobClient(BLOB).upload(body, Buffer.byteLength(body), { blobHTTPHeaders: { blobContentType: "application/json; charset=utf-8" } });
}

// Who gets it.
async function recipients() {
  const env = String(process.env.CRM_DIGEST_TO || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (env.length) return env;
  const doc = await readRoles().catch(() => ({ entries: [] }));
  return (doc.entries || []).filter((e) => (e.roles || []).includes("staff:sales")).map((e) => String(e.user || "").toLowerCase()).filter(Boolean);
}

// What there is to act on: overdue and notify-failed orders, the merge queue, the
// emails to replace (with orders first), CRM IDs to write back.
async function collect(now) {
  now = now || Date.now();
  const orders = await crm.listOrders().catch(() => []);
  const overdue = [], notifyFailed = [], submitted = [];
  for (const o of orders) {
    const od = crm.overdue(o, now);
    if (od) overdue.push({ orderId: o.orderId, status: o.status, days: od.days, limit: od.limit, email: o.email, total: o.totalPrice, hives: (o.hives || []).map((h) => h.abbr || h.name).filter(Boolean).join(", ") });
    if (o.notify && o.notify.ok === false && !o.notify.pending) notifyFailed.push({ orderId: o.orderId, email: o.email, error: (o.notify && o.notify.error) || "" });
    if (o.status === "submitted" && !od) submitted.push(o.orderId);
  }
  overdue.sort((a, b) => b.days - a.days);
  const h = await hub.readHub().catch(() => null);
  const people = (h && h.people) || [];
  const replace = people.filter((p) => p.primaryTier === "replace");
  return {
    overdue, notifyFailed, submitted: submitted.length,
    queue: (h && h.queue && h.queue.length) || 0,
    replace: replace.length, replaceWithOrders: replace.filter((p) => (p.orders || 0) > 0).length,
    writeBack: (h && h.stats && h.stats.writeBack) || 0,
    total: overdue.length + notifyFailed.length + ((h && h.queue && h.queue.length) || 0),
  };
}

const STATUS_ZH = { submitted: "已提交", confirmed: "已确认", paid: "已付款", started: "已开课", cancelled: "已取消" };
function fmtMoney(v) { return typeof v === "number" ? "¥" + Math.round(v).toLocaleString("zh-CN") : ""; }

// The message, bilingual in one body (the order manager reads both).
function compose(d, date) {
  const link = `${SITE}/management/#/ops/orders`;
  const plink = `${SITE}/management/#/ops/people`;
  const lines = [];
  const push = (zh, en) => lines.push(zh, en);
  push(`蜂巢 CRM · 待处理与异常 · ${date}`, `Hive CRM · To do and exceptions · ${date}`);
  lines.push("");
  if (d.overdue.length) {
    push(`超期订单 ${d.overdue.length} 单（超过承诺时限仍未推进）：`, `${d.overdue.length} overdue order(s) (past the promised time without moving on):`);
    for (const o of d.overdue.slice(0, 20)) lines.push(`• ${o.orderId} · ${STATUS_ZH[o.status] || o.status} / ${o.status} · ${o.days} 天 / days (限 / limit ${o.limit}) · ${o.hives || "—"} · ${o.email || ""} · ${fmtMoney(o.total)}`);
    if (d.overdue.length > 20) lines.push(`… 另 ${d.overdue.length - 20} 单 / and ${d.overdue.length - 20} more`);
    lines.push("");
  }
  if (d.notifyFailed.length) {
    push(`通知失败 ${d.notifyFailed.length} 单（家长和蜂巢没有收到下单通知，请人工联系）：`, `${d.notifyFailed.length} order(s) whose notification failed (family and hive were not told — contact them):`);
    for (const o of d.notifyFailed.slice(0, 20)) lines.push(`• ${o.orderId} · ${o.email || ""}${o.error ? " · " + o.error : ""}`);
    lines.push("");
  }
  if (d.queue) push(`待合并的人员配对 ${d.queue} 对（同名同校或备用邮箱相同，需要判断是否同一人）。`, `${d.queue} people pair(s) waiting for a merge decision.`);
  if (d.submitted) push(`另有 ${d.submitted} 单已提交、尚在时限内。`, `${d.submitted} submitted order(s) are still within their time limit.`);
  push(`待替换邮箱 ${d.replace} 人（其中有订单 ${d.replaceWithOrders} 人）；待回写 CRM ID ${d.writeBack}。`, `${d.replace} people still on a mainland mailbox (${d.replaceWithOrders} with orders); ${d.writeBack} CRM IDs to write back.`);
  lines.push("");
  push(`订单：${link}`, `People: ${plink}`);
  const text = lines.join("\n");
  const html = "<div>" + lines.map((l) => (l === "" ? "<br>" : `<div>${escapeHtml(l)}</div>`)).join("") + "</div>";
  const subject = `【蜂巢 CRM】待处理 ${d.total} 项 · ${date} | Hive CRM: ${d.total} to do`;
  return { subject, text, html };
}

// Send through the flow. Returns { ok, status, skipped? }.
async function send(d, opts) {
  const log = (opts && opts.log) || (() => {});
  const flowUrl = process.env.POWER_AUTOMATE_URL;
  if (!flowUrl) throw Object.assign(new Error("POWER_AUTOMATE_URL app setting is not configured"), { code: "no_flow" });
  const to = await recipients();
  if (!to.length) throw Object.assign(new Error("no recipient: no account holds the 订单经理 (staff:sales) role and CRM_DIGEST_TO is not set"), { code: "no_recipient" });
  const channelId = process.env.CRM_DIGEST_CHANNEL_ID || process.env.DEFAULT_TEAMS_CHANNEL_ID || "";
  const date = new Date().toISOString().slice(0, 10);
  const m = compose(d, date);
  // Shaped like an order so the flow's trigger accepts it: one route (the channel),
  // the email to the order manager; zero items, zero amount.
  const payload = {
    orderId: `DIGEST-${date.replace(/-/g, "")}`, submittedAt: new Date().toISOString(), email: to[0], teamsAccount: "", lang: "zh",
    track: null, items: [], itemCount: 0, totalPrice: 0, currency: "CNY", routeCount: 1,
    notifyText: m.text, emailTo: to.join(";"), emailSubject: m.subject, emailHtml: m.html, emailBodyText: m.text,
    routes: [{ hiveKey: "crm", schoolName: "Hive CRM", schoolAbbr: "CRM", teamsChannelId: channelId, usedDefaultChannel: false, notifyEmail: to.join(";"), itemCount: 0, subtotal: 0, currency: "CNY", notifyText: m.text, notifySubject: m.subject, notifyHtml: m.html }],
    digest: true,
  };
  const headers = { "Content-Type": "application/json" };
  if (process.env.ORDER_SHARED_SECRET) headers["X-Order-Secret"] = process.env.ORDER_SHARED_SECRET;
  const res = await fetch(flowUrl, { method: "POST", headers, body: JSON.stringify(payload) });
  log(`digest: flow answered ${res.status} for ${to.join(", ")}`);
  return { ok: res.ok, status: res.status, to, channelId: channelId ? "set" : "", subject: m.subject, text: m.text };
}

// The daily run: collect, skip when nothing to act on or already sent today (force overrides), send, remember.
async function run(opts) {
  const force = !!(opts && opts.force);
  const d = await collect();
  const today = new Date().toISOString().slice(0, 10);
  const last = await readLast().catch(() => null);
  if (!force && !d.total) return { sent: false, reason: "nothing_to_do", summary: d };
  if (!force && last && last.date === today) return { sent: false, reason: "already_today", summary: d, last };
  const r = await send(d, opts);
  const doc = { date: today, at: new Date().toISOString(), ok: r.ok, status: r.status, to: r.to, total: d.total, overdue: d.overdue.length, notifyFailed: d.notifyFailed.length, queue: d.queue };
  await writeLast(doc).catch(() => {});
  return Object.assign({ sent: r.ok, summary: d }, r, { last: doc });
}

module.exports = { collect, compose, recipients, send, run, readLast, BLOB };
