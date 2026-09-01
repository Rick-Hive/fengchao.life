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
    // This response is public and unauthenticated. The snapshot carries a
    // `private` section (per-hive Teams channel ids and notification addresses)
    // that api/order reads straight from blob storage and that must never leave
    // the server. Strip it here, on a shallow copy so the cache stays intact,
    // and keep the convention: anything secret goes under `private` and is
    // dropped by this one line rather than needing a new rule each time.
    const { private: _private, ...publicSnapshot } = cache.data;

    context.res = {
      status: 200,
      headers: { "Cache-Control": "public, max-age=60" },
      body: publicSnapshot,
    };
  } catch (err) {
    context.log.error("data failed", err);
    context.res = { status: 500, body: { error: String(err.message || err) } };
  }
};
