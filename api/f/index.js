// GET /api/f/<id> — a 系统广播 attachment (PDF, PNG, JPG), for anyone who has the link (Rick, 2026-10-18: the
// link in the calendar body must open without signing in — a parent on a phone). Shown inline, never downloaded
// first; a short public cache plus an ETag so a replaced file shows within minutes; no type sniffing by the browser.
// Each open is counted (not who: the count tells the publisher whether the notice was looked at).
const crypto = require("crypto");
const FILES = require("../shared/files");

module.exports = async function (context, req) {
  const id = String((req.params && req.params.id) || "").toLowerCase();
  try {
    const f = await FILES.serve(id);
    if (!f) { context.res = { status: 404, headers: { "Cache-Control": "no-store" }, body: { error: "not_found" } }; return; }
    const etag = `"${crypto.createHash("sha1").update(f.buffer).digest("hex").slice(0, 20)}"`;
    const headers = {
      "Content-Type": f.type,
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(f.name)}`,
      "Cache-Control": "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
      ETag: etag,
    };
    if (req.headers && req.headers["if-none-match"] === etag) { context.res = { status: 304, headers }; return; }
    if (req.method === "GET") FILES.opened(id);
    context.res = { status: 200, isRaw: true, headers, body: req.method === "HEAD" ? "" : f.buffer };
  } catch (err) {
    context.log.error && context.log.error("f: " + (err && err.message));
    context.res = { status: 500, headers: { "Cache-Control": "no-store" }, body: { error: "server_error" } };
  }
};
