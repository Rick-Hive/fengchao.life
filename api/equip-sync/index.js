// POST /api/equip-sync — the nightly read of the Equip (textbook) Airtable
// base into crm/equip/data.json, for the scheduler (the same GitHub Actions
// workflow that runs the directory sync calls it once; the base is small
// enough — a few hundred orders — to read in one call).
//
// Gate: the shared secret HIVE_SYNC_KEY, as a header x-hive-sync-key or in
// the body, exactly as api/directory-sync. Wrong or missing → 403.
const crypto = require("crypto");
const equip = require("../shared/equip");
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
    const data = await equip.syncEquip({ log: (m) => context.log(m) });
    await audit(context, { actor: "scheduler", action: "crm.equip.sync", counts: data.counts, warnings: data.warnings.length });
    context.res = { status: 200, headers: { "Cache-Control": "no-store" }, body: { done: true, status: equip.status(data) } };
  } catch (err) {
    context.log.error(`equip-sync: ${(err && err.stack) || err}`);
    context.res = { status: err.code === "no_pat" ? 503 : 502, headers: { "Cache-Control": "no-store" }, body: { error: String((err && err.message) || err), done: false } };
  }
};
