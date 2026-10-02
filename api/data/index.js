// GET /api/data — serves the current snapshot to the public site.
//
// The snapshot changes only when 数据同步 runs, yet every visitor downloaded it
// afresh after 60 seconds. Now (Rick, 2026-10-02, speed from the mainland):
//   * ETag from the snapshot's generatedAt — a browser that has it sends
//     If-None-Match and gets a 304 with no body;
//   * Cache-Control max-age=300, stale-while-revalidate=86400 — a returning
//     visitor renders from the cached copy at once and the browser refreshes
//     it in the background;
//   * gzip in the function when the browser accepts it, so the payload is a
//     fraction of the JSON on the slow international hop. SWA passes a
//     Content-Encoding set by the function through unchanged.
// The encoded bytes are prepared once per cache refresh, not per request.
const zlib = require("zlib");
const crypto = require("crypto");
const { readSnapshot } = require("../shared/blob");

let cache = { at: 0, data: null, json: null, gz: null, etag: "" };
const CACHE_MS = 60 * 1000;
const CACHE_CONTROL = "public, max-age=300, stale-while-revalidate=86400";

function prepare(data) {
  // This response is public and unauthenticated. The snapshot carries a
  // `private` section (per-hive Teams channel ids and notification addresses)
  // that api/order reads straight from blob storage and that must never leave
  // the server. Strip it here, and keep the convention: anything secret goes
  // under `private` and is dropped by this one line.
  const { private: _private, ...publicSnapshot } = data;
  const json = Buffer.from(JSON.stringify(publicSnapshot), "utf8");
  const etag = '"' + crypto.createHash("sha1").update(String(data.generatedAt || "")).update(String(json.length)).digest("base64url").slice(0, 20) + '"';
  return { json, gz: zlib.gzipSync(json, { level: 6 }), etag };
}

module.exports = async function (context, req) {
  try {
    const now = Date.now();
    if (!cache.data || now - cache.at > CACHE_MS) {
      const data = await readSnapshot();
      if (data) {
        const same = cache.data && cache.data.generatedAt === data.generatedAt && cache.json;
        cache = Object.assign({ at: now, data }, same ? { json: cache.json, gz: cache.gz, etag: cache.etag } : prepare(data));
      } else cache = { at: now, data: null, json: null, gz: null, etag: "" };
    }
    if (!cache.data) {
      context.res = { status: 404, headers: { "Cache-Control": "no-store" }, body: { error: "no_snapshot", message: "Data has not been synced yet." } };
      return;
    }
    const h = (req && req.headers) || {};
    const baseHeaders = { "Cache-Control": CACHE_CONTROL, ETag: cache.etag, Vary: "Accept-Encoding", "Content-Type": "application/json; charset=utf-8" };
    const inm = String(h["if-none-match"] || "");
    if (inm && inm.split(",").map((s) => s.trim().replace(/^W\//, "")).includes(cache.etag)) {
      context.res = { status: 304, headers: baseHeaders, body: null };
      return;
    }
    const gzip = /\bgzip\b/i.test(String(h["accept-encoding"] || ""));
    context.res = {
      status: 200,
      isRaw: true,
      headers: Object.assign(baseHeaders, gzip ? { "Content-Encoding": "gzip" } : {}),
      body: gzip ? cache.gz : cache.json,
    };
  } catch (err) {
    context.log.error("data failed", err);
    context.res = { status: 500, headers: { "Cache-Control": "no-store" }, body: { error: String(err.message || err) } };
  }
};
