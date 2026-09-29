// /api/roles — Hive role assignments, managed from the Admin Center.
//
//   GET            → { entries: [...], assignable: {...} }
//   POST  {user, roles: ["crm_entry"]}  → upsert that account's roles
//   DELETE {user}  → remove the account
//
// Admin only: the route rule in staticwebapp.config.json is the gate, the
// hasRole check below is the belt. Accounts are stored lowercase; roles are
// limited to the ASSIGNABLE set in api/shared/roles.js.
const { hasRole, getPrincipal } = require("../shared/auth");
const { ASSIGNABLE, readRoles, writeRoles, normUser } = require("../shared/roles");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

module.exports = async function (context, req) {
  if (!hasRole(req, "admin")) {
    context.res = { status: 403, body: { error: "admin role required" } };
    return;
  }
  const method = String(req.method || "GET").toUpperCase();
  try {
    if (method === "GET") {
      const doc = await readRoles();
      context.res = { status: 200, body: { entries: doc.entries, assignable: ASSIGNABLE } };
      return;
    }

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const user = normUser(body.user);
    if (!EMAIL_RE.test(user)) {
      context.res = { status: 400, body: { error: "user must be an account like name@domain" } };
      return;
    }
    const doc = await readRoles();
    const others = doc.entries.filter((e) => e.user !== user);

    if (method === "DELETE") {
      await writeRoles({ entries: others });
      context.res = { status: 200, body: { ok: true, entries: others } };
      return;
    }

    const roles = Array.isArray(body.roles) ? body.roles.map(String) : [];
    const bad = roles.filter((r) => !ASSIGNABLE[r]);
    if (bad.length) {
      context.res = { status: 400, body: { error: "unknown role: " + bad.join(", ") } };
      return;
    }
    if (!roles.length) {
      await writeRoles({ entries: others });
      context.res = { status: 200, body: { ok: true, entries: others } };
      return;
    }
    const p = getPrincipal(req);
    const entry = { user, roles: Array.from(new Set(roles)), by: normUser(p && p.userDetails), at: new Date().toISOString() };
    const entries = others.concat([entry]).sort((a, b) => a.user.localeCompare(b.user));
    await writeRoles({ entries });
    context.res = { status: 200, body: { ok: true, entries } };
  } catch (err) {
    context.log.error("roles: " + (err && err.stack || err));
    context.res = { status: 500, body: { error: String(err && err.message || err) } };
  }
};
