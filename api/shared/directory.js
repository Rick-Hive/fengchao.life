// The directory cache: every school's accounts, copied from the tenant into
// blob storage so the Hub answers from Azure in milliseconds instead of asking
// Microsoft Graph while the page waits.
//
// Rick, 2026-10-02: 机构管理/用户 for giwas.org gave HTTP 500 — the live walk
// through Graph (one $batch per ten accounts for methods and memberOf) ran
// past the 45-second limit of a Static Web Apps function. So:
//
//  * directory/<domain>.json holds the rows the user table shows (verification,
//    devices, groups, last sign-in …) plus `syncedAt` (when it was last brought up
//    to date) and `fullAt` (last complete pass). /api/domain reads it and only
//    overlays people.json (身份 / 关联 / 补充资料), which changes by the minute.
//  * A sync runs in budgeted slices (`syncSlice`): list the accounts, then work
//    through them ten at a time until the time budget is spent, saving progress
//    (`pending`) in the blob, and report done:false; the caller calls again until
//    done:true. No single call comes near the platform limit however big the
//    school is.
//  * mode "full"    — every account (the nightly run, 01:00 Beijing = 17:00 UTC,
//                     driven by the directory-sync GitHub Actions workflow). When
//                     it finishes it also takes a fresh tenant-wide delta token.
//    mode "changes" — what changed in the tenant since the last sync: accounts
//                     created, updated or deleted (Graph's /users/delta, one token
//                     for the tenant in directory/_delta.json), applied to every
//                     cached domain, then the current domain's changed accounts
//                     are re-read. This is the 同步变动 button (Rick, 2026-10-02:
//                     「仅更新上个时间戳以后的 directory 账户变动，增、删、改」).
//                     Group-membership changes alone are not in /users/delta;
//                     they arrive with the nightly full pass.
//    mode "new"     — accounts created since `syncedAt` (the fallback when no
//                     delta token exists yet).
//  * Existing rows are kept while a full pass is under way, so the table never
//    goes blank; a row is replaced when its account has been re-read.
const { BlobServiceClient } = require("@azure/storage-blob");
const { snapshotBlob } = require("./config");
const { graph, list, batch, q } = require("./graph");
const { readInstitutions } = require("./people");

const DELTA = "_delta.json";

const PREFIX = "directory/";
const PER_BATCH = 10; // accounts per $batch (2 requests each; Graph allows 20)
const DEFAULT_BUDGET_MS = 20000;
const DOMAIN_RE = /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/;

function blobFor(name) {
  const conn = process.env.STORAGE_CONNECTION_STRING;
  if (!conn) throw new Error("STORAGE_CONNECTION_STRING app setting is not configured");
  const container = BlobServiceClient.fromConnectionString(conn).getContainerClient(snapshotBlob.container);
  return { container, blob: container.getBlockBlobClient(PREFIX + name) };
}
async function readJson(name) {
  const { blob } = blobFor(name);
  if (!(await blob.exists())) return null;
  const buf = await blob.downloadToBuffer();
  try { return JSON.parse(buf.toString("utf8")); } catch { return null; }
}
async function writeJson(name, obj) {
  const { container, blob } = blobFor(name);
  await container.createIfNotExists();
  const body = JSON.stringify(obj);
  await blob.upload(body, Buffer.byteLength(body), { blobHTTPHeaders: { blobContentType: "application/json; charset=utf-8" } });
}

// The schools that have a directory cache: every directory/<domain>.json. The hub's
// fallback when Graph cannot list the tenant's domains (and what the tests see).
async function cachedDomains() {
  const { container } = blobFor("x");
  const out = [];
  for await (const b of container.listBlobsFlat({ prefix: PREFIX })) {
    const m = /^directory\/([a-z0-9][a-z0-9.-]*\.[a-z]{2,})\.json$/.exec(b.name);
    if (m) out.push({ domain: m[1], isDefault: false, isInitial: false });
  }
  return out;
}

// Tests swap these for an in-memory pair.
const store = { read: readJson, write: writeJson, listDomains: cachedDomains };

// ---- shapes -------------------------------------------------------------------------
function domainOf(upn) { return String(upn || "").toLowerCase().split("@")[1] || ""; }
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
    id: m.id, kind, strong: STRONG.has(kind),
    name: m.displayName || m.model || m.phoneNumber || m.emailAddress || "",
    version: m.phoneAppVersion || "",
    created: m.createdDateTime || m.createdOn || null,
  };
}
const USER_SELECT = "id,userPrincipalName,displayName,givenName,surname,accountEnabled,department,jobTitle,city,otherMails,createdDateTime,userType,signInActivity,assignedLicenses";

// Which plan an account's licences amount to — "student" for Office 365 A1 for
// students, "faculty" for the faculty plan, "" otherwise. Every account holding
// the student plan is a student (Rick, 2026-10-08), so this is the identity's
// fallback when neither Hive nor the department field says. The tenant's SKU ids
// are read once per process from subscribedSkus (Directory.Read.All) and cached.
const STUDENT_PARTS = ["STANDARDWOFFPACK_STUDENT", "STANDARDWOFFPACK_IW_STUDENT", "M365EDU_A1_STUDENT", "STANDARDWOFFPACK_IW_STUUSEBNFT"];
const FACULTY_PARTS = ["STANDARDWOFFPACK_FACULTY", "STANDARDWOFFPACK_IW_FACULTY", "M365EDU_A1_FACULTY"];
let skuPlans = null; // skuId → "student" | "faculty"
async function loadSkuPlans() {
  if (skuPlans) return skuPlans;
  const map = new Map();
  try {
    for (const k of await list("/subscribedSkus?$select=skuId,skuPartNumber", 100)) {
      const part = String(k.skuPartNumber || "").toUpperCase();
      if (STUDENT_PARTS.includes(part) || /STUDENT|_STU/.test(part)) map.set(k.skuId, "student");
      else if (FACULTY_PARTS.includes(part) || /FACULTY|_FAC/.test(part)) map.set(k.skuId, "faculty");
    }
    skuPlans = map;
  } catch { return map; } // not cached: the next sync tries again
  return map;
}
function planOf(u, plans) {
  const out = new Set();
  for (const l of u.assignedLicenses || []) { const p = plans && plans.get(l.skuId); if (p) out.add(p); }
  return out.has("student") ? "student" : out.has("faculty") ? "faculty" : "";
}

// The account list of a domain (cheap: one paged call). `since` narrows it to
// accounts created after that instant. signInActivity needs a P1 licence; when
// the tenant has none the call fails and is retried without it.
async function listAccounts(domain, since) {
  let filter = `endsWith(userPrincipalName,'@${q(domain)}')`;
  if (since) filter += ` and createdDateTime ge ${new Date(since).toISOString()}`;
  const hdr = { ConsistencyLevel: "eventual" };
  let users;
  try {
    users = await list(`/users?$filter=${filter}&$count=true&$select=${USER_SELECT}&$top=999`, 5000, hdr);
  } catch (err) {
    if (err.status === 403 || err.status === 400) users = await list(`/users?$filter=${filter}&$count=true&$select=${USER_SELECT.replace(",signInActivity", "")}&$top=999`, 5000, hdr);
    else throw err;
  }
  return users.filter((u) => u.userType !== "Guest" && domainOf(u.userPrincipalName) === domain);
}

// One account's row, from its basic record and the two per-account answers.
function rowOf(u, m, g, plans) {
  const methods = m && m.status === 200 ? ((m.body && m.body.value) || []).map(methodView).filter((x) => x.kind !== "password") : null;
  const strong = methods ? methods.filter((x) => x.strong) : [];
  const memberOf = g && g.status === 200 ? ((g.body && g.body.value) || []) : [];
  const sia = u.signInActivity || {};
  return {
    id: u.id,
    upn: String(u.userPrincipalName || "").toLowerCase(),
    displayName: u.displayName || "",
    department: u.department || "",
    jobTitle: u.jobTitle || "",
    plan: planOf(u, plans || skuPlans),
    city: u.city || "",
    safeEmail: (u.otherMails || [])[0] || "",
    enabled: u.accountEnabled !== false,
    created: u.createdDateTime || null,
    lastSignIn: sia.lastSignInDateTime || sia.lastNonInteractiveSignInDateTime || null,
    verified: methods === null ? null : strong.length > 0,
    devices: strong.map((x) => ({ id: x.id, kind: x.kind, name: x.name || (x.kind === "fido2" ? "安全密钥" : "Authenticator"), version: x.version, created: x.created })),
    otherMethods: methods ? methods.filter((x) => !x.strong && x.kind !== "tap").map((x) => x.kind) : [],
    groups: memberOf.map((grp) => ({ id: grp.id, name: grp.displayName || "", description: grp.description || "", mail: grp.mail || "", kind: groupKind(grp), visibility: grp.visibility || "" })),
    partial: !(m && m.status === 200 && g && g.status === 200),
    readAt: new Date().toISOString(),
  };
}

// A 班级团队 is a team created from the Education class template: Teams reports it
// as specialization "educationClass". Looked up once per team when a sync finishes
// (20 per round trip) and written onto every row's group entry as kind "class".
async function markClassTeams(doc, log) {
  const ids = new Set();
  for (const r of doc.users) for (const g of r.groups || []) if (g.kind === "team" || g.kind === "class") ids.add(g.id);
  if (!ids.size) return;
  try {
    const res = await batch(Array.from(ids).map((id) => ({ id, url: `/teams/${id}?$select=id,specialization` })));
    const classes = new Set(Object.keys(res).filter((id) => res[id] && res[id].status === 200 && res[id].body && res[id].body.specialization === "educationClass"));
    for (const r of doc.users) for (const g of r.groups || []) if (g.kind === "team" || g.kind === "class") g.kind = classes.has(g.id) ? "class" : "team";
    log(`directory ${doc.domain}: ${classes.size} class team(s) of ${ids.size}`);
  } catch (err) {
    log(`directory ${doc.domain}: class teams not marked: ${err.message}`);
  }
}

// Who owns each group the domain's accounts belong to, looked up once per group
// when a sync finishes (20 per round trip) and kept on the doc as
// groupOwners[id] = [upn…]. The owners decide which groups are the school's own
// (Rick, 2026-10-09: 「仅按所有者显示本校的 teams group」 — a giwas.org teacher in a
// Science Bug class does not make that class giwas.org's team).
async function fetchGroupOwners(doc, log) {
  const ids = new Set();
  for (const r of doc.users) for (const g of r.groups || []) if (g && g.id) ids.add(g.id);
  if (!ids.size) { doc.groupOwners = {}; return; }
  try {
    const res = await batch(Array.from(ids).map((id) => ({ id, url: `/groups/${id}/owners?$select=id,userPrincipalName&$top=100` })));
    const owners = {};
    let known = 0;
    for (const id of ids) {
      const r = res[id];
      if (!r || r.status !== 200) continue; // keep what the last sync knew for this group
      owners[id] = ((r.body && r.body.value) || []).map((o) => String(o.userPrincipalName || "").toLowerCase()).filter(Boolean);
      known++;
    }
    doc.groupOwners = Object.assign({}, doc.groupOwners || {}, owners);
    for (const id of Object.keys(doc.groupOwners)) if (!ids.has(id)) delete doc.groupOwners[id];
    log(`directory ${doc.domain}: owners read for ${known} of ${ids.size} group(s)`);
  } catch (err) {
    log(`directory ${doc.domain}: group owners not read: ${err.message}`);
  }
}

// Groups of the domain, derived from the rows (who of this domain is in which).
// Only the school's OWN groups are listed: one with an owner on this domain, or —
// no owners at all (an orphan a teacher made and left) — with only this domain's
// people in it as far as we can see. A group owned elsewhere that the domain's
// people merely belong to is counted (`elsewhere`) but not listed.
function groupsOf(rows, groupOwners, domain) {
  const owners = groupOwners || {};
  const dom = String(domain || "").toLowerCase();
  const groups = new Map();
  for (const r of rows) for (const grp of r.groups || []) {
    if (!groups.has(grp.id)) groups.set(grp.id, { group: grp, members: new Set() });
    groups.get(grp.id).members.add(r.upn);
  }
  const all = Array.from(groups.values()).map(({ group, members }) => {
    const os = owners[group.id];
    const here = (os || []).filter((u) => domainOf(u) === dom);
    const ownedHere = here.length > 0, orphan = Array.isArray(os) && os.length === 0, unknown = !Array.isArray(os);
    return {
      id: group.id, name: group.name, description: group.description || "", mail: group.mail || "", kind: group.kind, visibility: group.visibility || "",
      domainMembers: members.size, members: Array.from(members).sort(),
      owners: here.sort(), ownerDomains: Array.from(new Set((os || []).map(domainOf).filter((d) => d && d !== dom))).sort(), ownedHere, orphan,
      own: ownedHere || orphan || unknown, // unknown = owners never read (older copy): shown, as before
    };
  });
  const out = all.filter((g) => g.own);
  const order = { class: 0, team: 1, m365: 2, security: 3, distribution: 4, other: 5 };
  out.sort((a, b) => order[a.kind] - order[b.kind] || b.domainMembers - a.domainMembers || a.name.localeCompare(b.name, "zh"));
  out.elsewhere = all.filter((g) => !g.own).map((g) => ({ id: g.id, name: g.name, kind: g.kind, ownerDomains: g.ownerDomains, domainMembers: g.domainMembers }));
  return out;
}

function emptyDoc(domain) {
  return { domain, syncedAt: null, fullAt: null, users: [], pending: [], run: null, error: null };
}

// What the Hub reads.
async function readDomain(domain) {
  const doc = await store.read(`${domain}.json`);
  return doc || emptyDoc(domain);
}

// Forget one account's cached row (after a device was removed) so the next read
// does not show the old device; the next sync restores it. Cheap and local.
async function touchUser(domain, upn, patch) {
  const doc = await readDomain(domain);
  const i = doc.users.findIndex((r) => r.upn === upn);
  if (i >= 0) { doc.users[i] = Object.assign({}, doc.users[i], patch); await store.write(`${domain}.json`, doc); }
}

// A just-created account goes into the cache at once (rowOf of the Graph user,
// no methods or groups yet), so the Users page shows it without a sync.
async function addUser(domain, graphUser, extra) {
  const doc = await readDomain(domain);
  const row = Object.assign(rowOf(graphUser, { status: 200, body: { value: [] } }, { status: 200, body: { value: [] } }), { partial: false, readAt: new Date().toISOString() }, extra || {});
  doc.users = doc.users.filter((r) => r.upn !== row.upn).concat([row]).sort((a, b) => a.upn.localeCompare(b.upn));
  await store.write(`${domain}.json`, doc);
  return row;
}

// A deleted account leaves the cache at once.
async function removeUser(domain, upn) {
  const doc = await readDomain(domain);
  const n = doc.users.length;
  doc.users = doc.users.filter((r) => r.upn !== upn);
  if (doc.users.length !== n) await store.write(`${domain}.json`, doc);
}

// ---- tenant-wide change tracking (/users/delta) -----------------------------------
// A fresh token that describes "now", without enumerating anyone.
async function initDelta() {
  const r = await graph("GET", `/users/delta?$deltatoken=latest&$select=${USER_SELECT.replace(",signInActivity", "")}`);
  const link = r && r["@odata.deltaLink"];
  if (link) await store.write(DELTA, { deltaLink: link, at: new Date().toISOString() });
  return link || null;
}
// Everything that changed since the token: [{ id, upn, removed }], and the next token.
async function pullDelta(link) {
  const changes = [];
  let next = link, nextLink = null, pages = 0;
  while (next && pages++ < 50) {
    const page = await graph("GET", next);
    for (const u of (page && page.value) || []) {
      changes.push({ id: u.id, upn: String(u.userPrincipalName || "").toLowerCase(), removed: !!u["@removed"] });
    }
    if (page && page["@odata.deltaLink"]) { nextLink = page["@odata.deltaLink"]; break; }
    next = page && page["@odata.nextLink"];
  }
  return { changes, deltaLink: nextLink || link };
}
// Apply the tenant's changes to every cached domain: deletions drop the row at once,
// creations and updates are queued (with a basics re-read) for that domain's next slice.
async function distributeChanges(changes, byDomain) {
  for (const [domain, list] of Object.entries(byDomain)) {
    const doc = await readDomain(domain);
    if (!doc.syncedAt && !doc.users.length) continue; // never synced: nothing to update
    let touched = 0;
    const pendingSet = new Set(doc.pending || []);
    for (const c of list) {
      if (c.removed) {
        const n = doc.users.length;
        doc.users = doc.users.filter((r) => r.id !== c.id && r.upn !== c.upn);
        if (doc.users.length !== n) touched++;
      } else {
        pendingSet.add(JSON.stringify({ id: c.id, upn: c.upn, b: 1 }));
        touched++;
      }
    }
    if (!touched) continue;
    doc.pending = Array.from(pendingSet);
    if (!doc.run) doc.run = { mode: "changes", startedAt: new Date().toISOString(), total: doc.pending.length, by: "delta" };
    await store.write(`${domain}.json`, doc);
  }
}

// One budgeted slice of a sync. Returns the document's status:
// { done, domain, mode, total, remaining, syncedAt, fullAt, added }.
// opts.scope = "domain" (a 域管理员 IT's own sync) keeps the "changes" intake to this
// domain: nothing is written for other domains and the tenant delta token stays.
async function syncSlice(domain, mode, opts) {
  const o = opts || {};
  const budget = o.budgetMs || DEFAULT_BUDGET_MS;
  const t0 = Date.now();
  const log = o.log || (() => {});
  if (!DOMAIN_RE.test(domain)) throw Object.assign(new Error("malformed domain"), { status: 400 });
  let doc = await readDomain(domain);
  let added = 0, removed = 0;
  const plans = await loadSkuPlans(); // student / faculty licence ids, once

  // "changes": pull the tenant's delta once, hand each domain its share, then go on
  // with this domain's queue. Without a token yet, fall back to "new" and take one.
  if (mode === "changes" && !doc.syncedAt) mode = "new"; // never synced: read everyone first
  if (mode === "changes" && !(doc.run && doc.run.mode === "changes" && doc.pending.length)) {
    const d = await store.read(DELTA);
    if (!d || !d.deltaLink) {
      mode = "new";
      try { await initDelta(); } catch (err) { log(`directory: could not take a delta token: ${err.message}`); }
    } else {
      const { changes, deltaLink } = await pullDelta(d.deltaLink);
      const byDomain = {};
      for (const c of changes) {
        const dom = domainOf(c.upn);
        if (!dom) continue; // a deletion may come without a UPN: handled below by id for this domain
        (byDomain[dom] = byDomain[dom] || []).push(c);
      }
      // Deletions that arrive without a UPN are matched by id against this domain.
      const blind = changes.filter((c) => c.removed && !c.upn);
      if (blind.length) { const ids = new Set(blind.map((c) => c.id)); const n = doc.users.length; doc.users = doc.users.filter((r) => !ids.has(r.id)); removed += n - doc.users.length; }
      const mine = byDomain[domain] || [];
      removed += mine.filter((c) => c.removed).length;
      added += mine.filter((c) => !c.removed).length;
      await store.write(`${domain}.json`, doc);
      if (o.scope === "domain") {
        // A 域管理员（IT）syncs their own school only (Rick, 2026-10-03): the other
        // domains' caches are not touched and the tenant's delta token is not
        // advanced, so their changes are still there for their own sync or the
        // nightly run. This domain may see the same changes again until then —
        // re-reading a changed account twice is harmless.
        await distributeChanges(changes, { [domain]: mine });
        log(`directory: ${changes.length} change(s) in the tenant since the last token, ${mine.length} for ${domain} (domain scope: token kept)`);
      } else {
        await distributeChanges(changes, byDomain);
        await store.write(DELTA, { deltaLink, at: new Date().toISOString() });
        log(`directory: ${changes.length} change(s) in the tenant since the last token, ${mine.length} for ${domain}`);
        // The other domains' small shares are read now, within this call's budget,
        // rather than sitting as "同步进行中：还剩 5 个账号" on every page until that
        // domain's own sync or the nightly run (Rick, 2026-10-09). A big share waits.
        for (const [dom, list] of Object.entries(byDomain)) {
          if (dom === domain || !list.some((c) => !c.removed) || list.length > PER_BATCH) continue;
          if (Date.now() - t0 > budget * 0.6) break;
          try { await syncSlice(dom, "changes", { by: o.by, scope: "domain", log, budgetMs: Math.max(5000, budget - (Date.now() - t0)) }); } catch (err) { log(`directory ${dom}: share of the tenant's changes not read now: ${err.message}`); }
        }
      }
      doc = await readDomain(domain);
      if (!doc.run) { // nothing queued for this domain: it is up to date as of now
        // Owners are read at the end of a run; a domain with no changes since the
        // owners step was added would otherwise never get them (Rick, 2026-10-09:
        // 做了完整同步，giwas 还是 28 个).
        if (!doc.groupOwners) await fetchGroupOwners(doc, log);
        doc.syncedAt = new Date().toISOString();
        doc.lastRun = { mode: "changes", startedAt: doc.syncedAt, finishedAt: doc.syncedAt, added: 0, removed, by: o.by || "" };
        await store.write(`${domain}.json`, doc);
        return status(doc, 0, removed);
      }
    }
  }

  // Start a run when none is under way (or when a full run is asked for anew).
  const starting = !doc.run || (mode === "full" && doc.run.mode !== "full");
  if (starting && mode !== "changes") {
    const since = mode === "new" ? doc.syncedAt : null;
    const accounts = await listAccounts(domain, since);
    const known = new Set(doc.users.map((r) => r.upn));
    const pendingSet = new Set(doc.pending || []);
    for (const u of accounts) {
      if (!known.has(String(u.userPrincipalName).toLowerCase())) added++;
      pendingSet.add(JSON.stringify({ id: u.id, upn: u.userPrincipalName }));
    }
    // A full pass also drops accounts that no longer exist in the tenant.
    if (mode === "full") {
      const live = new Set(accounts.map((u) => String(u.userPrincipalName).toLowerCase()));
      doc.users = doc.users.filter((r) => live.has(r.upn));
    }
    doc.basics = Object.fromEntries(accounts.map((u) => [u.id, u]));
    doc.pending = Array.from(pendingSet);
    doc.run = { mode, startedAt: new Date().toISOString(), total: doc.pending.length, by: o.by || "" };
    doc.error = null;
    log(`directory ${domain}: ${mode} sync started, ${doc.pending.length} account(s) to read, ${added} new`);
  }

  // The school's name goes into Entra's `department` for accounts that have none
  // (Rick, 2026-10-02: 「自动将职务/部门更新成域名所对应的学校机构名称」). A department
  // the school filled in itself is never overwritten.
  let institution = "";
  try { const inst = (await readInstitutions()).institutions; institution = (inst[domain] && (inst[domain].name || inst[domain].nameEn)) || ""; } catch { /* no names yet */ }

  const departmentFills = [];
  // Work through the pending accounts while there is time.
  try {
    while (doc.pending.length && Date.now() - t0 < budget) {
      const chunk = doc.pending.slice(0, PER_BATCH).map((s) => JSON.parse(s));
      const reqs = [];
      chunk.forEach((c, i) => {
        reqs.push({ id: `m${i}`, url: `/users/${c.id}/authentication/methods` });
        reqs.push({ id: `g${i}`, url: `/users/${c.id}/memberOf/microsoft.graph.group?$select=id,displayName,description,mail,groupTypes,mailEnabled,securityEnabled,resourceProvisioningOptions,visibility&$top=200` });
        if (c.b) reqs.push({ id: `b${i}`, url: `/users/${c.id}?$select=${USER_SELECT.replace(",signInActivity", "")}` });
      });
      const res = await batch(reqs);
      chunk.forEach((c, i) => {
        const old = doc.users.find((r) => r.id === c.id || r.upn === c.upn);
        const fresh = res[`b${i}`];
        const basic = (fresh && fresh.status === 200 && fresh.body) || (doc.basics && doc.basics[c.id]) ||
          (old ? { id: old.id, userPrincipalName: old.upn, displayName: old.displayName, department: old.department, jobTitle: old.jobTitle, accountEnabled: old.enabled, createdDateTime: old.created } : { id: c.id, userPrincipalName: c.upn });
        if (fresh && fresh.status === 404) { doc.users = doc.users.filter((r) => r.id !== c.id); return; } // gone meanwhile
        if (fresh && fresh.status === 200 && fresh.body && fresh.body.userType === "Guest") return;
        const row = rowOf(basic, res[`m${i}`], res[`g${i}`], plans);
        if (institution && !row.department && basic.id) {
          departmentFills.push(graph("PATCH", `/users/${basic.id}`, { department: institution }).then(() => { row.department = institution; }).catch((err) => log(`directory ${domain}: department for ${row.upn} not set: ${err.message}`)));
        }
        if (old && !row.lastSignIn) row.lastSignIn = old.lastSignIn; // delta re-reads skip signInActivity
        if (old) { if (!row.city) row.city = old.city || ""; if (!row.safeEmail) row.safeEmail = old.safeEmail || ""; }
        const k = doc.users.findIndex((r) => r.id === row.id || r.upn === row.upn);
        if (k >= 0) doc.users[k] = row; else doc.users.push(row);
      });
      doc.pending.splice(0, chunk.length);
    }
  } catch (err) {
    doc.error = { at: new Date().toISOString(), message: err.message, status: err.status || null };
    log(`directory ${domain}: sync error ${err.message}`);
    await store.write(`${domain}.json`, doc);
    throw err;
  }

  // This slice went through: an error left by an earlier slice is history now (it
  // used to stay in the status and make every later call look failed).
  doc.error = null;
  await Promise.all(departmentFills);
  const done = doc.pending.length === 0;
  if (done) {
    await markClassTeams(doc, log);
    await fetchGroupOwners(doc, log);
    doc.users.sort((a, b) => a.displayName.localeCompare(b.displayName, "zh") || a.upn.localeCompare(b.upn));
    doc.syncedAt = new Date().toISOString();
    if (doc.run && doc.run.mode === "full") doc.fullAt = doc.syncedAt;
    doc.lastRun = Object.assign({}, doc.run, { finishedAt: doc.syncedAt, added, removed });
    const wasFull = doc.run && doc.run.mode === "full";
    doc.run = null;
    delete doc.basics;
    log(`directory ${domain}: sync done, ${doc.users.length} account(s)`);
    if (wasFull) { try { await initDelta(); } catch (err) { log(`directory: could not take a delta token: ${err.message}`); } }
  }
  await store.write(`${domain}.json`, doc);
  return status(doc, added, removed);
}

function status(doc, added, removed) {
  return {
    domain: doc.domain,
    done: !doc.run,
    mode: doc.run ? doc.run.mode : (doc.lastRun && doc.lastRun.mode) || null,
    total: doc.run ? doc.run.total : doc.users.length,
    remaining: (doc.pending || []).length,
    queuedBy: doc.run ? doc.run.by || "" : "", // "delta": the tenant's changes handed to this domain, not a sync someone started
    users: doc.users.length,
    syncedAt: doc.syncedAt,
    fullAt: doc.fullAt,
    lastRun: doc.lastRun || null,
    error: doc.error || null,
    added: added || 0,
    removed: removed || 0,
  };
}

// The tenant's verified domains (cheap, one call).
// The tenant's own initial domain (learnqiaoliang.onmicrosoft.com — isInitial) is hidden:
// nobody manages schools there (Rick, 2026-10-03: 「隐藏 Learn.qiaoliang」), so it is
// neither listed nor walked by the nightly sync. HIVE_HIDDEN_DOMAINS (comma list)
// hides more; { includeHidden: true } returns everything.
async function verifiedDomains(opts) {
  const all = await list("/domains?$select=id,isVerified,isDefault,isInitial", 200);
  const hidden = new Set(String(process.env.HIVE_HIDDEN_DOMAINS || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean));
  const keepHidden = !!(opts && opts.includeHidden);
  return all
    .filter((d) => d.isVerified)
    .map((d) => ({ domain: String(d.id).toLowerCase(), isDefault: !!d.isDefault, isInitial: !!d.isInitial }))
    .filter((d) => keepHidden || !(d.isInitial || hidden.has(d.domain)));
}

module.exports = { readDomain, syncSlice, initDelta, status, groupsOf, touchUser, addUser, removeUser, verifiedDomains, cachedDomains: () => store.listDomains(), listAccounts, methodView, groupKind, domainOf, DOMAIN_RE, _store: store, _readJson: (n) => store.read(n), _writeJson: (n, o) => store.write(n, o) };
