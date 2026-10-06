// /api/me/{action}/{id?} — 我的账号: what a signed-in person may see and do
// about their own Office 365 account, and nothing about anyone else's.
//
//   GET    me/summary            profile + sign-in methods + Hive roles
//   GET    me/signins            own sign-ins, last 7 days
//   GET    me/audits             own directory audit events, last 7 days
//   GET    me/groups             groups and Teams the account belongs to (owner flag)
//   PATCH  me/profile            displayName, postalCode, safe email (otherMails)
//   DELETE me/method/{id}        remove one of the account's own sign-in methods
//
// The account is always the signed-in one: the UPN comes from the client
// principal (userDetails = preferred_username, see staticwebapp.config.json),
// never from the request. Graph is called with Hive's app identity
// (../shared/graph.js). Passwords are not handled here at all — the page links
// to Microsoft's own change-password and self-service reset pages.
const { graph, graphRaw, list, batch, q } = require("../shared/graph");
const { getPrincipal } = require("../shared/auth");
const { rolesFor, userRoles, normUser, can, readRoles, DOMAIN_IT_RE, DOMAIN_HIVE_RE, DOMAIN_ADMIN_RE } = require("../shared/roles");
const dir = require("../shared/directory");
const crm = require("../shared/crm");

// The administrators of the person's own school, for 登录与安全 (Rick, 2026-10-05:
// 「将每个域名的管理员显示在用户的“登录与安全”页面……如果需要帮助，请联系自己的管理员」):
// everyone in roles.json who holds a role on that domain, with the name from the
// directory cache. Storage trouble → an empty list, never an error.
async function domainAdmins(domain) {
  try {
    const [doc, cache] = await Promise.all([readRoles(), dir.readDomain(domain).catch(() => ({ users: [] }))]);
    const names = new Map((cache.users || []).map((u) => [u.upn, u.displayName || ""]));
    return doc.entries.map((e) => {
      const it = e.roles.some((r) => { const m = DOMAIN_IT_RE.exec(r) || DOMAIN_ADMIN_RE.exec(r); return m && m[1] === domain; });
      const hive = e.roles.some((r) => { const m = DOMAIN_HIVE_RE.exec(r) || DOMAIN_ADMIN_RE.exec(r); return m && m[1] === domain; });
      return it || hive ? { upn: e.user, displayName: names.get(e.user) || "", it, hive } : null;
    }).filter(Boolean).sort((a, b) => (b.it - a.it) || a.upn.localeCompare(b.upn));
  } catch { return []; }
}
const { audit } = require("../shared/audit");
const { guard, finish, describe } = require("../shared/session");
const people = require("../shared/people");

const DAYS = 7;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// 基本资料 fields a person may fill in or correct themselves. Not here: the
// account, work email, 职务 / 部门 / 办公地点 (the school sets those).
const EDITABLE = ["displayName", "givenName", "surname", "safeEmail", "mobilePhone", "streetAddress", "city", "state", "country", "postalCode", "preferredLanguage"];
const TEXT_MAX = { givenName: 40, surname: 40, city: 40, state: 40, country: 40, streetAddress: 120 };

// Same list as the order form (api/order): mainland free-mail is not accepted
// as a safe email, since it is exactly the mail that stops arriving.
const BLOCKED_EMAIL_DOMAINS = [
  "qq.com", "vip.qq.com", "foxmail.com",
  "163.com", "vip.163.com", "126.com", "vip.126.com", "yeah.net", "188.com",
  "sina.com", "sina.cn", "vip.sina.com",
  "sohu.com", "tom.com", "21cn.com", "aliyun.com",
  "139.com", "189.cn", "wo.cn", "wo.com.cn",
];
function blockedEmail(email) {
  const d = email.split("@")[1].toLowerCase();
  return BLOCKED_EMAIL_DOMAINS.some((b) => d === b || d.endsWith("." + b));
}

// Graph collection for each method type that may be removed here.
const METHOD_TYPES = {
  "#microsoft.graph.microsoftAuthenticatorAuthenticationMethod": { kind: "authenticator", path: "microsoftAuthenticatorMethods", strong: true },
  "#microsoft.graph.fido2AuthenticationMethod": { kind: "fido2", path: "fido2Methods", strong: true },
  "#microsoft.graph.phoneAuthenticationMethod": { kind: "phone", path: "phoneMethods" },
  "#microsoft.graph.emailAuthenticationMethod": { kind: "email", path: "emailMethods" },
  "#microsoft.graph.softwareOathAuthenticationMethod": { kind: "softwareOath", path: "softwareOathMethods" },
  "#microsoft.graph.passwordAuthenticationMethod": { kind: "password" },
  "#microsoft.graph.temporaryAccessPassAuthenticationMethod": { kind: "tap", path: "temporaryAccessPassMethods" },
  "#microsoft.graph.windowsHelloForBusinessAuthenticationMethod": { kind: "windowsHello" },
};

// Per-instance limit on changes: 10 an hour per account.
const hits = new Map();
function tooMany(user) {
  const now = Date.now();
  const recent = (hits.get(user) || []).filter((t) => now - t < 3600 * 1000);
  recent.push(now);
  hits.set(user, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > 10;
}

// UPN → directory user, cached for 10 minutes per instance.
const userCache = new Map();
async function me(upn) {
  const hit = userCache.get(upn);
  if (hit && Date.now() - hit.at < 600000) return hit.user;
  const user = await graph("GET", `/users/${encodeURIComponent(upn)}?$select=id,userPrincipalName,displayName,givenName,surname,mail,otherMails,mobilePhone,businessPhones,jobTitle,department,officeLocation,streetAddress,city,state,country,postalCode,preferredLanguage,accountEnabled,createdDateTime,userType`);
  userCache.set(upn, { at: Date.now(), user });
  return user;
}

function methodView(m) {
  const t = METHOD_TYPES[m["@odata.type"]] || { kind: String(m["@odata.type"] || "").replace("#microsoft.graph.", "").replace("AuthenticationMethod", "") };
  return {
    id: m.id,
    kind: t.kind,
    removable: !!t.path && t.kind !== "tap",
    strong: !!t.strong,
    name: m.displayName || m.model || m.phoneNumber || m.emailAddress || "",
    detail: [m.phoneAppVersion ? "Authenticator " + m.phoneAppVersion : "", m.model && m.displayName ? m.model : "", m.phoneType || ""].filter(Boolean).join(" · "),
    created: m.createdDateTime || m.createdOn || null,
  };
}

async function methods(id) {
  const raw = await list(`/users/${id}/authentication/methods`, 50);
  return raw.map((m) => Object.assign(methodView(m), { _type: m["@odata.type"] }));
}

function since() {
  return new Date(Date.now() - DAYS * 86400 * 1000).toISOString().replace(/\.\d+Z$/, "Z");
}

function signinView(s) {
  const st = s.status || {};
  const loc = s.location || {};
  const dev = s.deviceDetail || {};
  return {
    time: s.createdDateTime,
    app: s.appDisplayName || "",
    client: s.clientAppUsed || "",
    ok: st.errorCode === 0,
    code: st.errorCode,
    reason: st.errorCode === 0 ? "" : (st.failureReason || ""),
    detail: st.additionalDetails || "",
    ip: s.ipAddress || "",
    place: [loc.city, loc.state, loc.countryOrRegion].filter(Boolean).join(", "),
    os: dev.operatingSystem || "",
    browser: dev.browser || "",
    ca: s.conditionalAccessStatus || "",
  };
}

function auditView(a) {
  const by = a.initiatedBy || {};
  return {
    id: a.id,
    time: a.activityDateTime,
    activity: a.activityDisplayName || "",
    category: a.category || "",
    result: a.result || "",
    reason: a.resultReason || "",
    by: (by.user && (by.user.userPrincipalName || by.user.displayName)) || (by.app && (by.app.displayName || by.app.servicePrincipalName)) || "",
    targets: (a.targetResources || []).map((t) => t.userPrincipalName || t.displayName || "").filter(Boolean),
  };
}

function groupKind(g) {
  const types = g.groupTypes || [];
  if ((g.resourceProvisioningOptions || []).includes("Team")) return "team";
  if (types.includes("Unified")) return "m365";
  if (g.securityEnabled && !g.mailEnabled) return "security";
  if (g.mailEnabled && !types.includes("Unified")) return "distribution";
  return "other";
}

// The profile photo (Rick, 2026-10-04): JPEG or PNG, square, 48–1024 px, ≤ 4 MB —
// Microsoft's limits for a user photo (it derives the 48…648 sizes itself). The
// browser crops and scales to 648×648 JPEG before sending; this re-checks the
// bytes rather than trusting the client. Dimensions are read from the file's
// own header (PNG IHDR / JPEG SOF), no image library needed.
const PHOTO_MAX_BYTES = 4 * 1024 * 1024;
function imageInfo(buf) {
  if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { type: "image/png", width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
      const len = buf.readUInt16BE(i + 2);
      if ((marker >= 0xc0 && marker <= 0xcf) && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { type: "image/jpeg", height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      }
      i += 2 + len;
    }
    return { type: "image/jpeg", width: 0, height: 0 };
  }
  return null;
}

function fail(context, status, error, extra) {
  context.res = { status, body: Object.assign({ error }, extra || {}) };
}

async function handler(context, req) {
  const action = String((req.params && req.params.action) || "").toLowerCase();
  const id = String((req.params && req.params.id) || "");
  const method = String(req.method || "GET").toUpperCase();
  const p = getPrincipal(req);
  const upn = normUser(p && p.userDetails);
  if (!upn || !EMAIL_RE.test(upn)) return fail(context, 403, "sign in with your Office 365 account", { code: "signed_out" });

  let user;
  try {
    user = await me(upn);
  } catch (err) {
    if (err.status === 404) return fail(context, 403, "this account is not in the Education Resource Link directory", { user: upn });
    context.log.error(`me: lookup ${upn}: ${err.message}`);
    return fail(context, err.status === 500 ? 500 : 502, err.message);
  }

  try {
    // The photo itself, for the page's <img> (private, short cache; 204 = none yet).
    if (method === "GET" && action === "photo") {
      const r = await graphRaw("GET", `/users/${user.id}/photo/$value`);
      if (r.status === 404 || !r.buffer) { context.res = { status: 204, headers: { "Cache-Control": "private, max-age=60" }, body: null }; return; }
      context.res = { status: 200, headers: { "Content-Type": r.contentType || "image/jpeg", "Cache-Control": "private, max-age=300" }, body: r.buffer, isRaw: true };
      return;
    }
    if (method === "PUT" && action === "photo") {
      const b = req.body && typeof req.body === "object" ? req.body : {};
      const m = /^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/=]+)$/.exec(String(b.image || ""));
      if (!m) return fail(context, 400, "image must be a JPEG or PNG data URL");
      const buf = Buffer.from(m[2], "base64");
      if (buf.length > PHOTO_MAX_BYTES) return fail(context, 400, "the photo must be 4 MB or smaller");
      const info = imageInfo(buf);
      if (!info || info.type !== m[1]) return fail(context, 400, "the file is not a JPEG or PNG image");
      if (!info.width || info.width !== info.height) return fail(context, 400, "the photo must be square");
      if (info.width < 48 || info.width > 1024) return fail(context, 400, "the photo must be between 48 and 1024 pixels");
      try {
        await graphRaw("PUT", `/users/${user.id}/photo/$value`, buf, info.type);
      } catch (err) {
        await audit(context, { actor: upn, action: "photo.update", target: upn, bytes: buf.length, result: "failed", error: err.code || err.status });
        if (err.status === 403) return fail(context, 403, "Microsoft refused to change this account's photo.", { code: err.code });
        throw err;
      }
      await audit(context, { actor: upn, action: "photo.update", target: upn, bytes: buf.length, px: info.width, result: "ok" });
      context.res = { status: 200, headers: { "Cache-Control": "no-store" }, body: { ok: true, px: info.width, bytes: buf.length } };
      return;
    }
    if (method === "GET" && action === "summary") {
      const myDomain = upn.split("@")[1] || "";
      const [ms, rolesAll, doc, inst, admins] = await Promise.all([methods(user.id), userRoles(req), people.readPeople(), people.readInstitutions(), domainAdmins(myDomain)]);
      const roles = rolesAll.roles;
      const rec = doc.people[upn] || {};
      context.res = {
        status: 200,
        body: {
          // Hive's own facts: 身份 (set by the school), 关联账号 and the person's 补充资料.
          hive: {
            identity: people.identityOf(rec, user),
            linked: Array.isArray(rec.linked) ? rec.linked : [],
            extra: rec.extra || null,
            // The display name is set by the school's IT administrator or the system administrator, not by the person (Rick, 2026-10-02).
            canEditName: can(roles, "methods", myDomain),
            institution: (inst.institutions[myDomain] && inst.institutions[myDomain].name) || "",
            institutionEn: (inst.institutions[myDomain] && inst.institutions[myDomain].nameEn) || "",
            admins, // the school's 域管理员, for "need help? contact your administrator"
            vocab: { selfRoles: people.SELF_ROLES, topics: people.TOPICS, grades: people.GRADES, schooling: people.SCHOOLING, models: people.MODELS, higherEd: people.HIGHER_ED, maxChildren: people.MAX_CHILDREN, maxAccounts: people.MAX_ACCOUNTS },
          },
          // 基本资料: read from the Office 365 account; the fields in EDITABLE may be
          // filled in or corrected by the person and are written back to Entra.
          profile: {
            upn: user.userPrincipalName,
            displayName: user.displayName || "",
            givenName: user.givenName || "",
            surname: user.surname || "",
            mail: user.mail || "",
            safeEmail: (user.otherMails || [])[0] || "",
            mobilePhone: user.mobilePhone || "",
            businessPhone: (user.businessPhones || [])[0] || "",
            jobTitle: user.jobTitle || "",
            department: user.department || "",
            officeLocation: user.officeLocation || "",
            streetAddress: user.streetAddress || "",
            city: user.city || "",
            state: user.state || "",
            country: user.country || "",
            postalCode: user.postalCode || "",
            preferredLanguage: user.preferredLanguage || "",
            created: user.createdDateTime || null,
            guest: user.userType === "Guest",
            editable: EDITABLE,
          },
          methods: ms.map(({ _type, ...m }) => m),
          roles,
          // The CRM's data domains and this person's level on each (api/shared/crm.js):
          // the management centre shows the 经营 pages a level above `none` allows.
          crm: crm.accessMap(roles),
          days: DAYS,
        },
      };
      return;
    }

    if (method === "GET" && action === "signins") {
      const rows = await list(`/auditLogs/signIns?$filter=userId eq '${q(user.id)}' and createdDateTime ge ${since()}&$top=100`, 200);
      context.res = { status: 200, body: { days: DAYS, signins: rows.map(signinView) } };
      return;
    }

    if (method === "GET" && action === "audits") {
      const [target, initiated] = await Promise.all([
        list(`/auditLogs/directoryAudits?$filter=activityDateTime ge ${since()} and targetResources/any(t:t/id eq '${q(user.id)}')&$top=100`, 200),
        list(`/auditLogs/directoryAudits?$filter=activityDateTime ge ${since()} and initiatedBy/user/id eq '${q(user.id)}'&$top=100`, 200),
      ]);
      const seen = new Set();
      const rows = target.concat(initiated).filter((a) => !seen.has(a.id) && seen.add(a.id));
      rows.sort((a, b) => String(b.activityDateTime).localeCompare(String(a.activityDateTime)));
      context.res = { status: 200, body: { days: DAYS, audits: rows.map(auditView) } };
      return;
    }

    // One of my groups, in detail: description and members, read-only. Only for a
    // group the person belongs to (Rick, 2026-10-02: 「点击 Teams group 应该能查看成员、介绍等信息，但是不可编辑或删除」).
    if (method === "GET" && action === "group") {
      if (!/^[0-9a-f-]{36}$/i.test(id)) return fail(context, 400, "group id missing");
      const mine = await list(`/users/${user.id}/memberOf/microsoft.graph.group?$select=id&$top=999`, 1000);
      if (!mine.some((g) => g.id === id)) return fail(context, 404, "not one of your groups");
      const [g, members, owners, team] = await Promise.all([
        graph("GET", `/groups/${id}?$select=id,displayName,description,mail,visibility,groupTypes,mailEnabled,securityEnabled,resourceProvisioningOptions,createdDateTime`),
        list(`/groups/${id}/members/microsoft.graph.user?$select=id,displayName,userPrincipalName,jobTitle&$top=999`, 2000),
        list(`/groups/${id}/owners/microsoft.graph.user?$select=id&$top=100`, 200).catch(() => []),
        graph("GET", `/teams/${id}?$select=id,specialization`).catch(() => null),
      ]);
      const ownerIds = new Set(owners.map((o) => o.id));
      const baseKind = groupKind(g);
      context.res = { status: 200, body: {
        id: g.id, name: g.displayName || "", description: g.description || "", mail: g.mail || "", visibility: g.visibility || "", created: g.createdDateTime || null,
        kind: baseKind === "team" && team && team.specialization === "educationClass" ? "class" : baseKind,
        members: members.map((m) => ({ upn: String(m.userPrincipalName || "").toLowerCase(), displayName: m.displayName || "", jobTitle: m.jobTitle || "", owner: ownerIds.has(m.id) })).sort((a, b) => (b.owner - a.owner) || a.displayName.localeCompare(b.displayName, "zh")),
      } };
      return;
    }

    if (method === "GET" && action === "groups") {
      const sel = "$select=id,displayName,description,mail,groupTypes,mailEnabled,securityEnabled,resourceProvisioningOptions,visibility,createdDateTime";
      const [groups, owned] = await Promise.all([
        list(`/users/${user.id}/memberOf/microsoft.graph.group?${sel}&$top=100`, 300),
        list(`/users/${user.id}/ownedObjects/microsoft.graph.group?$select=id&$top=100`, 300).catch(() => []),
      ]);
      const own = new Set(owned.map((g) => g.id));
      // Member counts and, for teams, the Teams specialization (a 班级团队 is a team
      // created from the Education class template) — 20 requests per round trip;
      // one that fails is simply left out.
      let counts = {}, specs = {};
      try {
        counts = await batch(groups.map((g, i) => ({ id: String(i), url: `/groups/${g.id}/members/$count` })), { ConsistencyLevel: "eventual" });
      } catch (e) { counts = {}; }
      try {
        const teams = groups.filter((g) => groupKind(g) === "team");
        specs = teams.length ? await batch(teams.map((g) => ({ id: g.id, url: `/teams/${g.id}?$select=id,specialization` }))) : {};
      } catch (e) { specs = {}; }
      const rows = groups.map((g, i) => {
        const c = counts[String(i)];
        const n = c && c.status === 200 ? parseInt(String(c.body), 10) : NaN;
        const sp = specs[g.id];
        const kind = groupKind(g) === "team" && sp && sp.status === 200 && sp.body && sp.body.specialization === "educationClass" ? "class" : groupKind(g);
        return {
          id: g.id, name: g.displayName || "", description: g.description || "", mail: g.mail || "",
          kind, owner: own.has(g.id), visibility: g.visibility || "",
          members: Number.isFinite(n) ? n : null, created: g.createdDateTime || null,
        };
      });
      const order = { class: 0, team: 1, m365: 2, security: 3, distribution: 4, other: 5 };
      rows.sort((a, b) => order[a.kind] - order[b.kind] || a.name.localeCompare(b.name));
      context.res = { status: 200, body: { groups: rows } };
      return;
    }

    if (method === "PATCH" && action === "profile") {
      if (tooMany(upn)) return fail(context, 429, "too many changes; try again in an hour");
      const b = req.body && typeof req.body === "object" ? req.body : {};
      const patch = {};
      const problems = [];
      if (b.displayName !== undefined) {
        const v = String(b.displayName).trim();
        const myRoles = (await userRoles(req)).roles;
        if (!can(myRoles, "methods", upn.split("@")[1] || "")) problems.push("displayName: only the school's IT administrator or the system administrator may change the display name");
        else if (!v || v.length > 64) problems.push("displayName: 1–64 characters");
        else patch.displayName = v;
      }
      if (b.postalCode !== undefined) {
        const v = String(b.postalCode).trim();
        if (v && !/^[A-Za-z0-9 \-]{3,12}$/.test(v)) problems.push("postalCode: 3–12 letters or digits");
        else patch.postalCode = v || null;
      }
      // Plain text fields of 基本资料 (Entra attributes), each bounded.
      for (const f of ["givenName", "surname", "city", "state", "country", "streetAddress"]) {
        if (b[f] === undefined) continue;
        const v = String(b[f]).trim();
        if (v.length > TEXT_MAX[f]) problems.push(`${f}: at most ${TEXT_MAX[f]} characters`);
        else if (/[<>]/.test(v)) problems.push(`${f}: no < or >`);
        else patch[f] = v || null;
      }
      if (b.mobilePhone !== undefined) {
        const v = String(b.mobilePhone).trim().replace(/[\s()-]/g, "");
        if (v && !/^\+?\d{6,16}$/.test(v)) problems.push("mobilePhone: digits only, 6–16, may start with +");
        else patch.mobilePhone = v ? (v.startsWith("+") ? "+" + v.slice(1) : v) : null;
      }
      if (b.preferredLanguage !== undefined) {
        const v = String(b.preferredLanguage).trim();
        if (v && !["zh-CN", "en-US"].includes(v)) problems.push("preferredLanguage: zh-CN or en-US");
        else patch.preferredLanguage = v || null;
      }
      if (b.safeEmail !== undefined) {
        const v = String(b.safeEmail).trim().toLowerCase();
        if (v && !EMAIL_RE.test(v)) problems.push("safeEmail: not an email address");
        else if (v && blockedEmail(v)) problems.push("safeEmail: QQ, 163 and other mainland free-mail are not accepted");
        else if (v && v === upn) problems.push("safeEmail: must be different from the Office 365 account");
        else patch.otherMails = v ? [v] : [];
      }
      if (problems.length) return fail(context, 400, "please fix the form", { problems });
      if (!Object.keys(patch).length) return fail(context, 400, "nothing to change");
      try {
        await graph("PATCH", `/users/${user.id}`, patch);
      } catch (err) {
        await audit(context, { actor: upn, action: "profile.update", target: upn, fields: Object.keys(patch), result: "failed", error: err.code || err.status });
        if (err.status === 403) return fail(context, 403, "Microsoft does not let Hive change this account's profile (administrator accounts are changed in Entra).", { code: err.code });
        throw err;
      }
      userCache.delete(upn);
      await audit(context, { actor: upn, action: "profile.update", target: upn, fields: Object.keys(patch), result: "ok" });
      context.res = { status: 200, body: { ok: true, changed: Object.keys(patch) } };
      return;
    }

    // 补充资料 — the person's own: city, what they need most, their children and the
    // children's Teams accounts (Rick, 2026-10-02). Lives in people.json, not Entra.
    if (method === "PATCH" && action === "extra") {
      if (tooMany(upn)) return fail(context, 429, "too many changes; try again in an hour");
      const b = req.body && typeof req.body === "object" ? req.body : {};
      const { extra, problems } = people.validateExtra(b, upn);
      // Each child's account must be a real account of this directory (not a guest).
      const accounts = extra.children.map((c) => c.account).filter(Boolean);
      const found = {};
      const check = async (a, what) => {
        try {
          const u = await graph("GET", `/users/${encodeURIComponent(a)}?$select=id,userPrincipalName,displayName,userType`);
          if (u.userType === "Guest") problems.push(`${what}: ${a} is a guest account, not a school account`);
          else found[a] = u.displayName || "";
        } catch (err) {
          if (err.status === 404) problems.push(`${what}: ${a} is not an account in this directory — check the spelling`);
          else throw err;
        }
      };
      await Promise.all(accounts.map((a) => check(a, "children")).concat(extra.otherAccounts.map((a) => check(a, "otherAccounts"))));
      if (problems.length) return fail(context, 400, "please fix the form", { problems });
      const doc = await people.readPeople();
      const cur = doc.people[upn] || {};
      const prev = ((cur.extra && cur.extra.children) || []).map((c) => c.account).filter(Boolean);
      const prevOwn = (cur.extra && cur.extra.otherAccounts) || [];
      extra.at = new Date().toISOString();
      doc.people[upn] = Object.assign({}, cur, { extra, at: extra.at });
      people.linkFamily(doc, upn, accounts, prev);
      people.linkAccounts(doc, upn, extra.otherAccounts, prevOwn);
      await people.writePeople(doc);
      await audit(context, { actor: upn, action: "extra.update", target: upn, children: extra.children.length, linked: accounts, result: "ok" });
      context.res = { status: 200, body: { ok: true, extra, linked: doc.people[upn].linked || [], identity: doc.people[upn].identity || "", childNames: found } };
      return;
    }

    if (method === "DELETE" && action === "method") {
      if (!/^[A-Za-z0-9\-_=+/]{8,200}$/.test(id)) return fail(context, 400, "method id missing");
      if (tooMany(upn)) return fail(context, 429, "too many changes; try again in an hour");
      const ms = await methods(user.id);
      const m = ms.find((x) => x.id === id);
      if (!m) return fail(context, 404, "no such method on your account");
      const t = METHOD_TYPES[m._type];
      if (!t || !t.path || m.kind === "tap") return fail(context, 400, `a ${m.kind} method cannot be removed here`);
      // Never leave the account without a method that can satisfy MFA: the
      // next sign-in would stop at "More information required".
      const strongLeft = ms.filter((x) => x.strong && x.id !== id).length;
      // The only authenticator may go too — the phone may be lost (Rick, 2026-10-02) —
      // but only when the page has shown the risk and the person confirmed (?confirm=1).
      const confirmed = String((req.query && req.query.confirm) || "") === "1";
      if (t.strong && strongLeft === 0 && !confirmed) {
        return fail(context, 409, "this is the only authenticator on your account; confirm to remove it anyway — the next sign-in will ask you to register a new one", { last: true });
      }
      try {
        await graph("DELETE", `/users/${user.id}/authentication/${t.path}/${encodeURIComponent(id)}`);
      } catch (err) {
        await audit(context, { actor: upn, action: "method.delete", target: upn, method: m.kind, device: m.name, result: "failed", error: err.code || err.status });
        throw err;
      }
      await audit(context, { actor: upn, action: "method.delete", target: upn, method: m.kind, device: m.name, result: "ok" });
      context.res = { status: 200, body: { ok: true, removed: { id, kind: m.kind, name: m.name } } };
      return;
    }

    // Sign-ins / audit events of the last 7 days as a file — never shown on the page (Rick, 2026-10-01).
    if (method === "GET" && action === "export") {
      const kind = String((req.query && req.query.kind) || "").toLowerCase();
      const format = String((req.query && req.query.format) || "json").toLowerCase();
      if (!["signins", "audits"].includes(kind)) return fail(context, 400, "kind must be signins or audits");
      if (!["json", "csv"].includes(format)) return fail(context, 400, "format must be json or csv");
      let rows;
      if (kind === "signins") {
        rows = (await list(`/auditLogs/signIns?$filter=userId eq '${q(user.id)}' and createdDateTime ge ${since()}&$top=100`, 1000)).map(signinView);
      } else {
        const [target, initiated] = await Promise.all([
          list(`/auditLogs/directoryAudits?$filter=activityDateTime ge ${since()} and targetResources/any(t:t/id eq '${q(user.id)}')&$top=100`, 1000),
          list(`/auditLogs/directoryAudits?$filter=activityDateTime ge ${since()} and initiatedBy/user/id eq '${q(user.id)}'&$top=100`, 1000),
        ]);
        const seen = new Set();
        rows = target.concat(initiated).filter((a) => !seen.has(a.id) && seen.add(a.id)).map(auditView)
          .map((a) => Object.assign({}, a, { targets: a.targets.join("; ") }));
        rows.sort((a, b) => String(b.time).localeCompare(String(a.time)));
      }
      const stamp = new Date().toISOString().slice(0, 10);
      const name = `${upn.split("@")[0]}-${kind}-${DAYS}d-${stamp}.${format}`;
      const disp = `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`;
      await audit(context, { actor: upn, action: `export.${kind}`, target: upn, format, rows: rows.length, result: "ok" });
      if (format === "json") {
        context.res = { status: 200, headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": disp, "Cache-Control": "no-store" }, body: JSON.stringify({ account: upn, kind, days: DAYS, exportedAt: new Date().toISOString(), rows }, null, 2) };
      } else {
        const cols = rows.length ? Object.keys(rows[0]) : [];
        const cell = (v) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
        const csv = "\uFEFF" + [cols.join(",")].concat(rows.map((r) => cols.map((c) => cell(r[c])).join(","))).join("\r\n");
        context.res = { status: 200, headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": disp, "Cache-Control": "no-store" }, body: csv, isRaw: true };
      }
      return;
    }

    fail(context, 404, `unknown action: ${method} ${action}`);
  } catch (err) {
    context.log.error(`me/${action} for ${upn}: ${(err && err.stack) || err}`);
    const status = err.status === 403 ? 502 : err.status === 500 ? 500 : 502;
    fail(context, status, String((err && err.message) || err), { code: err.code || "" });
  }
};

// Hive's session rules (idle timeout, maximum age, same-site check) wrap every call.
module.exports = async function (context, req) {
  // The header's state check: always 200, { signedIn, user, timer… } — never a refusal,
  // so a signed-out browser gets a plain answer and no redirect (the route is anonymous).
  if (String((req.params && req.params.action) || "").toLowerCase() === "session") {
    const s = await guard(context, req, { soft: true });
    if (!s) return;
    context.res = { status: 200, headers: { "Cache-Control": "no-store" }, body: Object.assign({ signedIn: true }, describe(s)) };
    // ?peek=1 — the site header asking who is signed in — does not count as activity.
    if (!(req.query && req.query.peek)) finish(context, s);
    return;
  }
  const s = await guard(context, req);
  if (!s) return;
  await handler(context, req);
  finish(context, s);
};
