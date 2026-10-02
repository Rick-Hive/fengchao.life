// /api/domain/{action} — 本域管理: what a domain administrator (or a Hive
// coordinator / admin) may see and do about the accounts of their domain.
//
//   GET    domain/domains                 the tenant's domains, flagged with the ones the caller manages
//   GET    domain/users?domain=x          one row per account: verification, devices, Teams, identity, linked accounts
//   GET    domain/groups?domain=x         the groups those accounts belong to, with per-domain member counts
//   PATCH  domain/person                  {user, identity?, linked?, note?} → people.json
//   DELETE domain/method                  {user, id} → remove one Authenticator / FIDO2 method of a user in the domain
//
// Who: `admin` and `coordinator` manage every domain; `domain_admin:<domain>`
// manages that one. Every request names a domain; the target account's UPN
// must end in it, or the call is refused — a domain administrator cannot
// reach another school's accounts even by id.
//
// Data comes from Graph with the app identity (../shared/graph.js). Per-user
// calls (methods, memberOf) go through $batch, 20 at a time, and the whole
// domain view is cached per instance for ten minutes, because a school of
// 300 accounts is 30 batch calls. "Refresh" on the page bypasses the cache.
const { graph, list, batch, q } = require("../shared/graph");
const { getPrincipal } = require("../shared/auth");
const { userRoles, managedDomains, normUser } = require("../shared/roles");
const { readPeople, writePeople, identityOf, IDENTITIES } = require("../shared/people");
const { audit } = require("../shared/audit");

const CACHE_MS = 10 * 60 * 1000;
const cache = new Map(); // domain → { at, users, groups }
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DOMAIN_RE = /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/;

function fail(context, status, error, extra) {
  context.res = { status, body: Object.assign({ error }, extra || {}) };
}

function domainOf(upn) {
  return String(upn || "").toLowerCase().split("@")[1] || "";
}

function groupKind(g) {
  const types = g.groupTypes || [];
  if ((g.resourceProvisioningOptions || []).includes("Team")) return "team";
  if (types.includes("Unified")) return "m365";
  if (g.securityEnabled && !g.mailEnabled) return "security";
  if (g.mailEnabled) return "distribution";
  return "other";
}

const METHOD_KIND = {
  "#microsoft.graph.microsoftAuthenticatorAuthenticationMethod": "authenticator",
  "#microsoft.graph.fido2AuthenticationMethod": "fido2",
  "#microsoft.graph.phoneAuthenticationMethod": "phone",
  "#microsoft.graph.emailAuthenticationMethod": "email",
  "#microsoft.graph.softwareOathAuthenticationMethod": "softwareOath",
  "#microsoft.graph.temporaryAccessPassAuthenticationMethod": "tap",
  "#microsoft.graph.passwordAuthenticationMethod": "password",
  "#microsoft.graph.windowsHelloForBusinessAuthenticationMethod": "windowsHello",
};
const STRONG = new Set(["authenticator", "fido2"]);

function methodView(m) {
  const kind = METHOD_KIND[m["@odata.type"]] || "other";
  return {
    id: m.id,
    kind,
    strong: STRONG.has(kind),
    name: m.displayName || m.model || m.phoneNumber || m.emailAddress || "",
    version: m.phoneAppVersion || "",
    created: m.createdDateTime || m.createdOn || null,
  };
}

// ---- building the domain view -------------------------------------------------

async function loadDomain(domain, force) {
  const hit = cache.get(domain);
  if (!force && hit && Date.now() - hit.at < CACHE_MS) return hit;

  // 1. The accounts. endsWith needs the advanced query headers.
  const sel = "$select=id,userPrincipalName,displayName,givenName,surname,accountEnabled,department,jobTitle,createdDateTime,userType,signInActivity";
  const hdr = { ConsistencyLevel: "eventual" };
  let users;
  try {
    users = await list(`/users?$filter=endsWith(userPrincipalName,'@${q(domain)}')&$count=true&${sel}&$top=999`, 5000, hdr);
  } catch (err) {
    // signInActivity needs a P1 licence in the tenant; without it the whole call fails. Retry without it.
    if (err.status === 403 || err.status === 400) {
      users = await list(`/users?$filter=endsWith(userPrincipalName,'@${q(domain)}')&$count=true&${sel.replace(",signInActivity", "")}&$top=999`, 5000, hdr);
    } else throw err;
  }
  users = users.filter((u) => u.userType !== "Guest" && domainOf(u.userPrincipalName) === domain);

  // 2. Per account, in batches: sign-in methods and group memberships.
  const reqs = [];
  users.forEach((u, i) => {
    reqs.push({ id: `m${i}`, url: `/users/${u.id}/authentication/methods` });
    reqs.push({ id: `g${i}`, url: `/users/${u.id}/memberOf/microsoft.graph.group?$select=id,displayName,description,mail,groupTypes,mailEnabled,securityEnabled,resourceProvisioningOptions,visibility&$top=200` });
  });
  const res = await batch(reqs);

  // 3. Hive's own facts.
  const people = (await readPeople()).people;

  const groups = new Map(); // id → { group, members: Set(upn) }
  const rows = users.map((u, i) => {
    const upn = normUser(u.userPrincipalName);
    const m = res[`m${i}`];
    const g = res[`g${i}`];
    const methods = m && m.status === 200 ? ((m.body && m.body.value) || []).map(methodView).filter((x) => x.kind !== "password") : null;
    const strong = methods ? methods.filter((x) => x.strong) : [];
    const memberOf = g && g.status === 200 ? ((g.body && g.body.value) || []) : [];
    for (const grp of memberOf) {
      if (!groups.has(grp.id)) groups.set(grp.id, { group: grp, members: new Set() });
      groups.get(grp.id).members.add(upn);
    }
    const rec = people[upn] || null;
    const sia = u.signInActivity || {};
    return {
      id: u.id,
      upn,
      displayName: u.displayName || "",
      enabled: u.accountEnabled !== false,
      created: u.createdDateTime || null,
      lastSignIn: sia.lastSignInDateTime || sia.lastNonInteractiveSignInDateTime || null,
      verified: methods === null ? null : strong.length > 0,
      devices: strong.map((x) => ({ id: x.id, kind: x.kind, name: x.name || (x.kind === "fido2" ? "安全密钥" : "Authenticator"), version: x.version, created: x.created })),
      otherMethods: methods ? methods.filter((x) => !x.strong && x.kind !== "tap").map((x) => x.kind) : [],
      groups: memberOf.map((grp) => ({ id: grp.id, name: grp.displayName || "", kind: groupKind(grp) })),
      identity: identityOf(rec, u),
      identitySource: rec && IDENTITIES.includes(rec.identity) ? "hive" : (identityOf(null, u) ? "entra" : ""),
      linked: rec && Array.isArray(rec.linked) ? rec.linked : [],
      note: (rec && rec.note) || "",
    };
  });
  rows.sort((a, b) => a.displayName.localeCompare(b.displayName, "zh") || a.upn.localeCompare(b.upn));

  const groupRows = Array.from(groups.values()).map(({ group, members }) => ({
    id: group.id,
    name: group.displayName || "",
    description: group.description || "",
    mail: group.mail || "",
    kind: groupKind(group),
    visibility: group.visibility || "",
    domainMembers: members.size,
    members: Array.from(members).sort(),
  }));
  const order = { team: 0, m365: 1, security: 2, distribution: 3, other: 4 };
  groupRows.sort((a, b) => order[a.kind] - order[b.kind] || b.domainMembers - a.domainMembers || a.name.localeCompare(b.name, "zh"));

  const view = { at: Date.now(), domain, users: rows, groups: groupRows, partial: Object.values(res).some((r) => r.status !== 200) };
  cache.set(domain, view);
  return view;
}

// ---- the function -----------------------------------------------------------------

module.exports = async function (context, req) {
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
        const verified = await list("/domains?$select=id,isVerified,isDefault,isInitial", 200);
        domains = verified.filter((d) => d.isVerified).map((d) => ({ domain: String(d.id).toLowerCase(), isDefault: !!d.isDefault, isInitial: !!d.isInitial }));
      } catch (err) {
        context.log.warn(`domain/domains: ${err.message}`);
      }
      // A domain administrator's own domains are always listed, even if the directory call failed.
      for (const d of allowed) if (d !== "*" && !domains.some((x) => x.domain === d)) domains.push({ domain: d, isDefault: false, isInitial: false });
      domains = domains.filter((d) => may(d.domain)).sort((a, b) => a.domain.localeCompare(b.domain));
      context.res = { status: 200, body: { user: actor, roles, all, domains, mine: domainOf(actor) } };
      return;
    }

    if (!DOMAIN_RE.test(domain)) return fail(context, 400, "domain missing or malformed");
    if (!may(domain)) return fail(context, 403, `you do not manage ${domain}`, { allowed: all ? ["*"] : allowed });

    if (method === "GET" && (action === "users" || action === "groups")) {
      const force = String((req.query && req.query.refresh) || "") === "1";
      const view = await loadDomain(domain, force);
      const body = { domain, at: new Date(view.at).toISOString(), cached: !force && Date.now() - view.at > 2000, partial: view.partial };
      if (action === "users") body.users = view.users; else body.groups = view.groups;
      context.res = { status: 200, body };
      return;
    }

    if (method === "PATCH" && action === "person") {
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
      if (!doc.people[user].identity && !(doc.people[user].linked || []).length && !doc.people[user].note) delete doc.people[user];
      await writePeople(doc);
      cache.delete(domain);
      await audit(context, { actor, action: "person.update", target: user, fields: Object.keys(patch), result: "ok" });
      context.res = { status: 200, body: { ok: true, user, record: doc.people[user] || null } };
      return;
    }

    if (method === "DELETE" && action === "method") {
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
      cache.delete(domain);
      await audit(context, { actor, action: "method.delete", target: user, method: m.kind, device: m.name, result: "ok" });
      context.res = { status: 200, body: { ok: true, removed: { id, kind: m.kind, name: m.name }, remainingStrong: methods.filter((x) => x.strong && x.id !== id).length } };
      return;
    }

    fail(context, 404, `unknown action: ${method} ${action}`);
  } catch (err) {
    context.log.error(`domain/${action} by ${actor}: ${(err && err.stack) || err}`);
    fail(context, err.status === 500 ? 500 : 502, String((err && err.message) || err), { code: err.code || "" });
  }
};
