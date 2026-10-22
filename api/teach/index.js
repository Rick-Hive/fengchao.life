// POST /api/teach — the website's 我要教课 application (api/shared/applications.js). Anonymous; a signed-in visitor's
// account is taken from the platform, never from the form. Honeypot and a per-instance rate limit as for orders.
const A = require("../shared/applications");
const { getPrincipal } = require("../shared/auth");

const hits = new Map();
const WINDOW_MS = 60 * 60 * 1000, MAX_PER_WINDOW = 5;
function tooMany(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  list.push(now); hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > MAX_PER_WINDOW;
}
function accountOf(req) {
  const p = getPrincipal(req);
  const upn = String((p && p.userDetails) || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(upn) ? upn : "";
}

module.exports = async function (context, req) {
  const body = req.body || {};
  const log = (m) => context.log(m);
  if (typeof body.fc_hp_field === "string" && body.fc_hp_field.trim()) {
    context.log.warn(`teach: honeypot triggered; dropped. email=${String(body.email || "").slice(0, 120)}`);
    context.res = { status: 200, body: { ok: true, id: "REL-000000" } };
    return;
  }
  const ip = String(req.headers["x-forwarded-for"] || "unknown").split(",")[0].trim();
  if (tooMany(ip)) { context.res = { status: 429, body: { error: "rate_limited" } }; return; }
  const { app, problems } = A.clean(body);
  if (problems.length) { context.res = { status: 400, body: { error: "incomplete", problems } }; return; }
  try {
    const account = accountOf(req);
    const r = await A.submit(app, { account });
    const n = await A.notify(r.id, Object.assign({}, app, { account }), { log });
    context.res = { status: 200, body: { ok: true, id: r.id, again: r.again, notified: !!n.ok } };
  } catch (err) {
    context.log.error(`teach: ${String((err && err.stack) || err).slice(0, 800)}`);
    context.res = { status: 500, body: { error: "server_error" } };
  }
};
