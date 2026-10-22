// /api/teach — the website's 我要教课 wizard (api/shared/applications.js). Anonymous; a signed-in visitor's account is
// taken from the platform, never from the form. Honeypot and per-instance rate limits as for orders.
//   POST /api/teach                 the application → { id, again, token }  (token: the key to add courses, 7 days)
//   GET  /api/teach/lists           the course pick lists (subjects, grades, class types, languages)
//   GET  /api/teach/app?id=&key=    the application's courses so far (the continue link from the email)
//   POST /api/teach/course          { id, key, course } → a new course draft on the application
//   POST /api/teach/file            { id, key, kind: resume|syllabus, name, size, index, total, data } — chunked upload
//   POST /api/teach/resend          { email } → a fresh link to that email's open application (same answer either way)
const A = require("../shared/applications");
const { getPrincipal } = require("../shared/auth");

const hits = new Map();
const WINDOW_MS = 60 * 60 * 1000;
function tooMany(key, max) {
  const now = Date.now();
  const list = (hits.get(key) || []).filter((t) => now - t < WINDOW_MS);
  list.push(now); hits.set(key, list);
  if (hits.size > 5000) hits.clear();
  return list.length > max;
}
const reply = (context, status, body, cache) => { context.res = { status, headers: { "Content-Type": "application/json", "Cache-Control": cache || "no-store" }, body }; };
function accountOf(req) {
  const p = getPrincipal(req);
  const upn = String((p && p.userDetails) || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(upn) ? upn : "";
}

module.exports = async function (context, req) {
  const body = req.body || {}, q = req.query || {};
  const action = String((req.params && req.params.action) || ""), method = String(req.method || "GET").toUpperCase();
  const log = (m) => context.log(m);
  const ip = String(req.headers["x-forwarded-for"] || "unknown").split(",")[0].trim();
  try {
    if (method === "GET" && action === "lists") return reply(context, 200, await A.pickLists(), "public, max-age=600");
    if (method === "GET" && action === "app") {
      if (tooMany("app:" + ip, 60)) return reply(context, 429, { error: "rate_limited" });
      return reply(context, 200, await A.peek(String(q.id || ""), String(q.key || "")));
    }
    if (method === "POST" && action === "file") {
      if (tooMany("file:" + ip, 60)) return reply(context, 429, { error: "rate_limited" });
      return reply(context, 200, Object.assign({ ok: true }, await A.uploadFile(String(body.id || ""), String(body.key || ""), body)));
    }
    if (method === "POST" && action === "resend") {
      if (tooMany("resend:" + ip, 3) || tooMany("resend:" + String(body.email || "").toLowerCase(), 2)) return reply(context, 429, { error: "rate_limited" });
      return reply(context, 200, await A.resend(body.email, { log }));
    }
    if (method === "POST" && action === "course") {
      if (tooMany("course:" + ip, 40)) return reply(context, 429, { error: "rate_limited" });
      const r = await A.addCourse(String(body.id || ""), String(body.key || ""), body.course);
      return reply(context, 200, Object.assign({ ok: true }, r));
    }
    if (method !== "POST" || action) return reply(context, 404, { error: "not_found" });
    if (typeof body.fc_hp_field === "string" && body.fc_hp_field.trim()) {
      context.log.warn(`teach: honeypot triggered; dropped. email=${String(body.email || "").slice(0, 120)}`);
      return reply(context, 200, { ok: true, id: "REL-000000", token: "x" });
    }
    if (tooMany("apply:" + ip, 5)) return reply(context, 429, { error: "rate_limited" });
    const { app, problems } = A.clean(body);
    if (problems.length) return reply(context, 400, { error: "incomplete", problems });
    const account = accountOf(req);
    const r = await A.submit(app, { account });
    const n = await A.notify(r.id, Object.assign({}, app, { account }), { log, token: r.token });
    return reply(context, 200, { ok: true, id: r.id, again: r.again, token: r.token, notified: !!n.ok });
  } catch (err) {
    if (err && err.status && err.status < 500) return reply(context, err.status, { error: err.code || "bad_request", problems: err.problems });
    context.log.error(`teach: ${String((err && err.stack) || err).slice(0, 800)}`);
    return reply(context, 500, { error: "server_error" });
  }
};
