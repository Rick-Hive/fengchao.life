// GET /api/data — serves the current snapshot to the public site.
const { readSnapshot } = require("../shared/blob");

let cache = { at: 0, data: null };
const CACHE_MS = 60 * 1000;

module.exports = async function (context) {
  try {
    const now = Date.now();
    if (!cache.data || now - cache.at > CACHE_MS) {
      cache = { at: now, data: await readSnapshot() };
    }
    if (!cache.data) {
      context.res = { status: 404, body: { error: "no_snapshot", message: "Data has not been synced yet." } };
      return;
    }
    context.res = {
      status: 200,
      headers: { "Cache-Control": "public, max-age=60" },
      body: cache.data,
    };
  } catch (err) {
    context.log.error("data failed", err);
    context.res = { status: 500, body: { error: String(err.message || err) } };
  }
};
