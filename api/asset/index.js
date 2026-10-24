// GET /api/asset?key=teachers/recXXX.jpg | syllabus/recXXX-0.pdf
// Streams attachment files that the sync mirrored into blob storage.
// Keys are strictly validated so only the two public prefixes are reachable.
const { readAsset, cacheControlFor } = require("../shared/blob");

// templates/… : Hive's own templates (the syllabus template the curriculum director uploads in 课程管理); when none has
// been uploaded, the copy built into the website is served instead (2026-10-23)
const KEY_RE = /^(teachers|syllabus|templates)\/[A-Za-z0-9._-]{1,120}$/;
const BUILT_IN = { "templates/syllabus-template.docx": "/assets/templates/syllabus-template.docx" };

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
    let asset = key.startsWith("templates/") ? null : cache.get(key); // a template is replaced in place: never from this cache
    if (!asset) {
      asset = await readAsset(key);
      if (asset && asset.buffer.length < 2 * 1024 * 1024 && !key.startsWith("templates/")) {
        if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
        cache.set(key, asset);
      }
    }
    if (!asset) {
      if (BUILT_IN[key]) { context.res = { status: 302, headers: { Location: BUILT_IN[key], "Cache-Control": "no-store" }, body: "" }; return; }
      context.res = { status: 404, body: { error: "not_found" } };
      return;
    }
    context.res = {
      status: 200,
      isRaw: true,
      headers: Object.assign({
        "Content-Type": asset.contentType,
        "Cache-Control": key.startsWith("templates/") ? "no-cache" : cacheControlFor(key),
      }, key.startsWith("templates/") ? { "Content-Disposition": `attachment; filename="${key.split("/").pop()}"` } : {}),
      body: asset.buffer,
    };
  } catch (err) {
    context.log.error("asset failed", err);
    context.res = { status: 500, body: { error: String(err.message || err) } };
  }
};
