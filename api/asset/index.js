// GET /api/asset?key=teachers/recXXX.jpg | syllabus/recXXX-0.pdf
// Streams attachment files that the sync mirrored into blob storage.
// Keys are strictly validated so only the two public prefixes are reachable.
const { readAsset } = require("../shared/blob");

const KEY_RE = /^(teachers|syllabus)\/[A-Za-z0-9._-]{1,120}$/;

// tiny in-memory cache (per function instance) for hot assets like photos
const cache = new Map();
const CACHE_MAX = 40;

module.exports = async function (context, req) {
  const key = String((req.query && req.query.key) || "");
  if (!KEY_RE.test(key)) {
    context.res = { status: 400, body: { error: "bad_key" } };
    return;
  }
  try {
    let asset = cache.get(key);
    if (!asset) {
      asset = await readAsset(key);
      if (asset && asset.buffer.length < 2 * 1024 * 1024) {
        if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
        cache.set(key, asset);
      }
    }
    if (!asset) {
      context.res = { status: 404, body: { error: "not_found" } };
      return;
    }
    context.res = {
      status: 200,
      isRaw: true,
      headers: {
        "Content-Type": asset.contentType,
        "Cache-Control": "public, max-age=86400",
      },
      body: asset.buffer,
    };
  } catch (err) {
    context.log.error("asset failed", err);
    context.res = { status: 500, body: { error: String(err.message || err) } };
  }
};
