// /api/domain/{action} — 本域管理 / 机构管理: what a domain administrator or
// Hive staff may see and do about the accounts of a school's domain.
//
//   GET    domain/domains                 the tenant's domains, flagged with the ones the caller manages
//                                         and what they may do in each
//   GET    domain/users?domain=x          one row per account, from the directory cache,
//                                         with 身份 / 关联账号 / 补充资料 overlaid from people.json
//   GET    domain/groups?domain=x         the groups those accounts belong to, with per-domain member counts
//   GET    domain/sync?domain=x           the cache's status (when it was synced, whether a run is under way)
//   POST   domain/sync   {domain, mode}   one budgeted slice of a sync — "changes" (accounts created, updated
//                                         or deleted since the last sync) or "full"; call again while done:false
//   PATCH  domain/person                  {user, identity?, linked?, note?} → people.json       (域蜂巢管理员, staff)
//   DELETE domain/method                  {user, id} → remove one Authenticator / FIDO2 method    (域管理员 IT, sysadmin)
//
// Who may do what is `can()` in ../shared/roles.js. Every request names a
// domain; the target account's UPN must end in it, or the call is refused — a
// school's administrator cannot reach another school's accounts even by id.
//
// The rows come from the directory cache (../shared/directory.js), filled by
// the nightly sync and the 同步 buttons — never from a live walk of the tenant
// while the page waits (that is what gave HTTP 500 on a larger school,
// Rick, 2026-10-02). Only people.json is read live: it changes by the minute.
const { graph, list } = require("../shared/graph");
const { getPrincipal } = require("../shared/auth");
const { userRoles, managedDomains, can, normUser } = require("../shared/roles");
const { readPeople, writePeople, identityOf, IDENTITIES } = require("../shared/people");
const { audit } = require("../shared/audit");
const { guard, finish } = require("../shared/session");
const dir = require("../shared/directory");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const { DOMAIN_RE, domainOf, methodView } = dir;

function fail(context, status, error, extra) {
  context.res = { status, body: Object.assign({ error }, extra || {}) };
}

// The cached rows plus Hive's own facts about each person.
async function usersView(domain) {
  const [doc, peopleDoc] = await Promise.all([dir.readDomain(domain), readPeople()]);
  const people = peopleDoc.people;
  const users = doc.users.map((r) => {
    const rec = people[r.upn] || null;
    const entra = { department: r.department, jobTitle: r.jobTitle };
    return Object.assign({}, r, {
      groups: (r.groups || []).map((g) => ({ id: g.id, name: g.name, kind: g.kind })),
      identity: identityOf(rec, entra),
      identitySource: rec && IDENTITIES.includes(rec.identity) ? "hive" : (identityOf(null, entra) ? "entra" : ""),
      linked: rec && Array.isArray(rec.linked) ? rec.linked : [],
      note: (rec && rec.note) || "",
      extra: (rec && rec.extra) || null,
    });
  });
  return { doc, users };
}

async function handler(context, req) {
  const action = String((req.params && req.params.action) || "").toLowerCase();
  const method = String(req.method || "GET").toUpperCase();
  const p = getPrincipal(req);
  const actor = normUser(p && p.userDetails);
  if (!actor) return fail(context, 401, "sign in first");

  const { roles } = await userRoles(req);
  const allowed = managedDomains(roles);
  const all = allowed.includes("*");
  if (!allowed.length) return fail(context, 403, "no domain to manage", { user: actor, roles });

  const domain = String((req.query && req.query.domain) || (req.body && req.body.domain) || "").trim().toLowerCase();
  const may = (d) => all || allowed.includes(d);

  try {
    if (method === "GET" && action === "domains") {
      let domains = [];
      try {
        domains = await dir.verifiedDomains();
      } catch (err) {
        context.log.warn(`domain/domains: ${err.message}`);
      }
      // A domain administrator's own domains are always listed, even if the directory call failed.
      for (const d of allowed) if (d !== "*" && !domains.some((x) => x.domain === d)) domains.push({ domain: d, isDefault: false, isInitial: false });
      domains = domains.filter((d) => may(d.domain)).sort((a, b) => a.domain.localeCompare(b.domain));
      // What the caller may do in each domain, so the page shows only the controls that work.
      domains = domains.map((d) => Object.assign({}, d, { can: { methods: can(roles, "methods", d.domain), people: can(roles, "people", d.domain), full: can(roles, "admin") } }));
      context.res = { status: 200, body: { user: actor, roles, all, domains, mine: domainOf(actor) } };
      return;
    }

    if (!DOMAIN_RE.test(domain)) return fail(context, 400, "domain missing or malformed");
    if (!may(domain)) return fail(context, 403, `you do not manage ${domain}`, { allowed: all ? ["*"] : allowed });

    if (method === "GET" && action === "users") {
      const { doc, users } = await usersView(domain);
      context.res = { status: 200, body: Object.assign({ domain, users, partial: users.some((u) => u.partial) }, { sync: dir.status(doc) }) };
      return;
    }
    if (method === "GET" && action === "groups") {
      const doc = await dir.readDomain(domain);
      context.res = { status: 200, body: { domain, groups: dir.groupsOf(doc.users), sync: dir.status(doc) } };
      return;
    }

    if (action === "sync") {
      if (method === "GET") {
        context.res = { status: 200, body: dir.status(await dir.readDomain(domain)) };
        return;
      }
      if (method === "POST") {
        const mode = String((req.body && req.body.mode) || "changes").toLowerCase();
        if (mode !== "changes" && mode !== "new" && mode !== "full") return fail(context, 400, "mode must be changes, new or full");
        // A full pass of a school is heavier and drops vanished accounts: system administrators only.
        if (mode === "full" && !can(roles, "admin")) return fail(context, 403, "a full sync is run by the system administrator (or nightly)", { code: "forbidden" });
        const st = await dir.syncSlice(domain, mode, { budgetMs: 20000, by: actor, log: (m) => context.log(m) });
        if (st.done) await audit(context, { actor, action: "directory.sync", target: domain, mode, users: st.users, added: st.added, removed: st.removed, result: "ok" });
        context.res = { status: 200, body: st };
        return;
      }
    }

    if (method === "PATCH" && action === "person") {
      if (!can(roles, "people", domain)) return fail(context, 403, "身份 and linked accounts are edited by the 域蜂巢管理员 or Hive staff", { code: "forbidden" });
      const b = req.body || {};
      const user = normUser(b.user);
      if (!EMAIL_RE.test(user) || domainOf(user) !== domain) return fail(context, 400, "user must be an account in this domain");
      const problems = [];
      const patch = {};
      if (b.identity !== undefined) {
        const v = String(b.identity || "").trim();
        if (v && !IDENTITIES.includes(v)) problems.push("identity must be one of " + IDENTITIES.join(" / "));
        else patch.identity = v;
      }
      if (b.linked !== undefined) {
        const arr = (Array.isArray(b.linked) ? b.linked : String(b.linked).split(/[\s,;，；]+/)).map(normUser).filter(Boolean);
        const bad = arr.filter((x) => !EMAIL_RE.test(x) || x === user);
        if (bad.length) problems.push("linked accounts must be other accounts: " + bad.join(", "));
        else patch.linked = Array.from(new Set(arr)).slice(0, 10);
      }
      if (b.note !== undefined) patch.note = String(b.note || "").trim().slice(0, 200);
      if (problems.length) return fail(context, 400, "please fix the form", { problems });
      if (!Object.keys(patch).length) return fail(context, 400, "nothing to change");
      const doc = await readPeople();
      const cur = doc.people[user] || {};
      doc.people[user] = Object.assign({}, cur, patch, { by: actor, at: new Date().toISOString() });
      if (!doc.people[user].identity && !(doc.people[user].linked || []).length && !doc.people[user].note && !doc.people[user].extra) delete doc.people[user];
      await writePeople(doc);
      await audit(context, { actor, action: "person.update", target: user, fields: Object.keys(patch), result: "ok" });
      context.res = { status: 200, body: { ok: true, user, record: doc.people[user] || null } };
      return;
    }

    if (method === "DELETE" && action === "method") {
      if (!can(roles, "methods", domain)) return fail(context, 403, "sign-in devices are managed by the 域管理员（IT）", { code: "forbidden" });
      const b = req.body || {};
      const user = normUser(b.user);
      const id = String(b.id || "");
      if (!EMAIL_RE.test(user) || domainOf(user) !== domain) return fail(context, 400, "user must be an account in this domain");
      if (!/^[A-Za-z0-9\-_=+/]{8,200}$/.test(id)) return fail(context, 400, "method id missing");
      const u = await graph("GET", `/users/${encodeURIComponent(user)}?$select=id,userPrincipalName`);
      const methods = (await list(`/users/${u.id}/authentication/methods`, 50)).map(methodView);
      const m = methods.find((x) => x.id === id);
      if (!m) return fail(context, 404, "no such method on that account");
      const path = m.kind === "authenticator" ? "microsoftAuthenticatorMethods" : m.kind === "fido2" ? "fido2Methods" : null;
      if (!path) return fail(context, 400, `a ${m.kind} method cannot be removed here`);
      try {
        await graph("DELETE", `/users/${u.id}/authentication/${path}/${encodeURIComponent(id)}`);
      } catch (err) {
        await audit(context, { actor, action: "method.delete", target: user, method: m.kind, device: m.name, result: "failed", error: err.code || err.status });
        if (err.status === 403) return fail(context, 403, "Microsoft refused: this is probably an administrator account, whose methods Hive may not change.", { code: err.code });
        throw err;
      }
      // Keep the cached row honest until the next sync.
      const left = methods.filter((x) => x.strong && x.id !== id);
      try { await dir.touchUser(domain, user, { devices: left.map((x) => ({ id: x.id, kind: x.kind, name: x.name, version: x.version, created: x.created })), verified: left.length > 0 }); } catch { /* best effort */ }
      await audit(context, { actor, action: "method.delete", target: user, method: m.kind, device: m.name, result: "ok" });
      context.res = { status: 200, body: { ok: true, removed: { id, kind: m.kind, name: m.name }, remainingStrong: left.length } };
      return;
    }

    fail(context, 404, `unknown action: ${method} ${action}`);
  } catch (err) {
    context.log.error(`domain/${action} by ${actor}: ${(err && err.stack) || err}`);
    fail(context, err.status === 500 ? 500 : 502, String((err && err.message) || err), { code: err.code || "" });
  }
}

// Hive's session rules (idle timeout, maximum age, same-site check) wrap every call.
module.exports = async function (context, req) {
  const s = await guard(context, req);
  if (!s) return;
  await handler(context, req);
  finish(context, s);
};
