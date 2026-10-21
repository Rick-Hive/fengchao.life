// POST /api/crm-sweep — the nightly order sweep (api/shared/sweep.js): expiries, reminders, provider nudges, automatic
// seating from the waitlist. Called by the GitHub Actions workflow before crm-digest. Gate: HIVE_SYNC_KEY, exactly as
// api/crm-digest. Body { dryRun: true } reports what would happen without writing or sending.
const crypto = require("crypto");
const sweep = require("../shared/sweep");
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
    const r = await sweep.run({ dryRun: !!(req.body && req.body.dryRun), log: (m) => context.log(m) });
    if (!r.dryRun && r.total) await audit(context, { actor: "scheduler", action: "crm.sweep", expired: r.expired.length, reminded: r.reminded.length, nudged: r.nudged.length, seated: r.seated.length, errors: r.errors.length });
    context.res = { status: 200, headers: { "Cache-Control": "no-store" }, body: Object.assign({ done: true }, r) };
  } catch (err) {
    context.log.error(`crm-sweep: ${(err && err.stack) || err}`);
    context.res = { status: 500, headers: { "Cache-Control": "no-store" }, body: { error: String((err && err.message) || err), done: false } };
  }
};
