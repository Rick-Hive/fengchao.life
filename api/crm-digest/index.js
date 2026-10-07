// POST /api/crm-digest — the daily 待处理与异常 digest to the order manager
// (api/shared/digest.js), for the scheduler: the nightly GitHub Actions workflow
// calls it after the Equip sync. Gate: HIVE_SYNC_KEY, exactly as api/equip-sync.
// Body { force: true } sends even when nothing is due or it was sent today.
const crypto = require("crypto");
const digest = require("../shared/digest");
const { audit } = require("../shared/audit");

function keyOk(req) {
  const want = String(process.env.HIVE_SYNC_KEY || "");
  const got = String((req.headers && req.headers["x-hive-sync-key"]) || (req.body && req.body.key) || "");
  if (!want || want.length < 16 || !got || got.length !== want.length) return false;
  return crypto.timingSafeEqual(Buffer.from(want), Buffer.from(got));
}

module.exports = async function (context, req) {
  if (!keyOk(req)) {
    context.res = { status: 403, headers: { "Cache-Control": "no-store" }, body: { error: "forbidden" } };
    return;
  }
  try {
    const r = await digest.run({ force: !!(req.body && req.body.force), log: (m) => context.log(m) });
    if (r.sent || r.reason === undefined) await audit(context, { actor: "scheduler", action: "crm.digest", to: r.to, total: r.summary.total, status: r.status });
    context.res = { status: 200, headers: { "Cache-Control": "no-store" }, body: { done: true, sent: !!r.sent, reason: r.reason || null, to: r.to || null, total: r.summary.total, overdue: r.summary.overdue.length, notifyFailed: r.summary.notifyFailed.length, queue: r.summary.queue, flowStatus: r.status || null } };
  } catch (err) {
    context.log.error(`crm-digest: ${(err && err.stack) || err}`);
    context.res = { status: err.code === "no_flow" || err.code === "no_recipient" ? 503 : 502, headers: { "Cache-Control": "no-store" }, body: { error: String((err && err.message) || err), done: false } };
  }
};
