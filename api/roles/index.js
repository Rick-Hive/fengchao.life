// /api/roles — Hive role assignments, managed from the Admin Center.
//
//   GET            → { entries: [...with labels, displayName, domain, lastSignIn], kinds, staff }
//   GET ?q=text    → { people: [{upn, displayName, domain, lastSignIn, identity}] } — up to 12 accounts
//                    from the directory caches of every school whose name or account matches
//                    (the 角色分配 search box; Rick, 2026-10-04)
//   POST  {user, roles: ["domain_it:school.edu"]}  → upsert that account's roles
//   DELETE {user}  → remove the account
//
// Who may: the system administrator, everything; the CEO (decision 4, Rick
// 2026-10-06), the staff functions only — a CEO's POST may carry staff roles
// other than sysadmin, and the account's domain roles are kept as they were;
// a CEO's DELETE takes the staff roles off the entry and leaves the rest.
// Accounts are stored lowercase; roles are limited to the ASSIGNABLE set in
// api/shared/roles.js.
const { getPrincipal } = require("../shared/auth");
const { STAFF, KINDS, isAssignable, roleLabel, readRoles, writeRoles, normUser, userRoles, isAdmin, canAssign } = require("../shared/roles");
const { guard, finish } = require("../shared/session");
const dir = require("../shared/directory");

// Every cached school's accounts, flattened: { upn → { displayName, domain, lastSignIn, jobTitle } }.
// Read from the nightly directory cache (no Graph call), so it is instant.
async function directoryIndex() {
  const out = new Map();
  let domains = [];
  try { domains = await dir.verifiedDomains(); } catch { domains = []; }
  for (const d of domains) {
    let doc = null;
    try { doc = await dir.readDomain(d.domain); } catch { doc = null; }
    for (const u of (doc && doc.users) || []) {
      if (u && u.upn) out.set(String(u.upn).toLowerCase(), { displayName: u.displayName || "", domain: d.domain, lastSignIn: u.lastSignIn || "", jobTitle: u.jobTitle || "" });
    }
  }
  return out;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

async function handler(context, req) {
  const who = await userRoles(req);
  const full = isAdmin(who.roles);
  const ceo = !full && canAssign(who.roles, "staff:sales");
  if (!full && !ceo) {
    context.res = { status: 403, body: { error: "admin role required" } };
    return;
  }
  const method = String(req.method || "GET").toUpperCase();
  try {
    if (method === "GET") {
      const index = await directoryIndex();
      const q = String((req.query && req.query.q) || "").trim().toLowerCase();
      if (q) {
        const people = [];
        for (const [upn, u] of index) {
          if (upn.includes(q) || (u.displayName && u.displayName.toLowerCase().includes(q))) people.push({ upn, displayName: u.displayName, domain: u.domain, lastSignIn: u.lastSignIn, jobTitle: u.jobTitle });
          if (people.length >= 60) break;
        }
        // Names that start with the text first, then accounts that start with it, then the rest.
        const rank = (p) => (p.displayName.toLowerCase().startsWith(q) ? 0 : p.upn.startsWith(q) ? 1 : 2);
        people.sort((a, b) => rank(a) - rank(b) || a.displayName.localeCompare(b.displayName) || a.upn.localeCompare(b.upn));
        context.res = { status: 200, headers: { "Cache-Control": "no-store" }, body: { people: people.slice(0, 12) } };
        return;
      }
      const doc = await readRoles();
      const entries = doc.entries.map((e) => {
        const u = index.get(e.user) || {};
        return Object.assign({}, e, {
          labels: e.roles.map((r) => ({ zh: roleLabel(r, "zh"), en: roleLabel(r, "en") })),
          displayName: u.displayName || "", domain: u.domain || (e.user.split("@")[1] || ""), lastSignIn: u.lastSignIn || "", inDirectory: !!u.domain,
        });
      });
      // `scope` tells the page what this caller may hand out: "all", or "staff" for the CEO.
      context.res = { status: 200, body: { entries, kinds: KINDS, staff: STAFF, scope: full ? "all" : "staff" } };
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
    const existing = doc.entries.find((e) => e.user === user);
    // What a CEO cannot touch on this account (its domain roles, sysadmin) is carried over untouched.
    const kept = ceo && existing ? existing.roles.filter((r) => !canAssign(who.roles, r)) : [];

    if (method === "DELETE") {
      const entries = kept.length ? others.concat([Object.assign({}, existing, { roles: kept })]).sort((a, b) => a.user.localeCompare(b.user)) : others;
      await writeRoles({ entries });
      context.res = { status: 200, body: { ok: true, entries } };
      return;
    }

    let roles = Array.isArray(body.roles) ? body.roles.map((r) => String(r).trim().toLowerCase()) : [];
    const bad = roles.filter((r) => !isAssignable(r));
    if (bad.length) {
      context.res = { status: 400, body: { error: "unknown role: " + bad.join(", ") } };
      return;
    }
    const beyond = roles.filter((r) => !canAssign(who.roles, r));
    if (beyond.length) {
      context.res = { status: 403, body: { error: "only the system administrator can assign: " + beyond.join(", ") } };
      return;
    }
    roles = roles.concat(kept);
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

// Hive's session rules (idle timeout, maximum age, same-site check) wrap every call.
module.exports = async function (context, req) {
  const s = await guard(context, req);
  if (!s) return;
  await handler(context, req);
  finish(context, s);
};
