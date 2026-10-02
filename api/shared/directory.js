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

// Tests swap these for an in-memory pair.
const store = { read: readJson, write: writeJson };

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
const USER_SELECT = "id,userPrincipalName,displayName,givenName,surname,accountEnabled,department,jobTitle,createdDateTime,userType,signInActivity";

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
function rowOf(u, m, g) {
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

// Groups of the domain, derived from the rows (who of this domain is in which).
function groupsOf(rows) {
  const groups = new Map();
  for (const r of rows) for (const grp of r.groups || []) {
    if (!groups.has(grp.id)) groups.set(grp.id, { group: grp, members: new Set() });
    groups.get(grp.id).members.add(r.upn);
  }
  const out = Array.from(groups.values()).map(({ group, members }) => ({
    id: group.id, name: group.name, description: group.description || "", mail: group.mail || "", kind: group.kind, visibility: group.visibility || "",
    domainMembers: members.size, members: Array.from(members).sort(),
  }));
  const order = { team: 0, m365: 1, security: 2, distribution: 3, other: 4 };
  out.sort((a, b) => order[a.kind] - order[b.kind] || b.domainMembers - a.domainMembers || a.name.localeCompare(b.name, "zh"));
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
async function syncSlice(domain, mode, opts) {
  const o = opts || {};
  const budget = o.budgetMs || DEFAULT_BUDGET_MS;
  const t0 = Date.now();
  const log = o.log || (() => {});
  if (!DOMAIN_RE.test(domain)) throw Object.assign(new Error("malformed domain"), { status: 400 });
  let doc = await readDomain(domain);
  let added = 0, removed = 0;

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
      await distributeChanges(changes, byDomain);
      await store.write(DELTA, { deltaLink, at: new Date().toISOString() });
      log(`directory: ${changes.length} change(s) in the tenant since the last token, ${mine.length} for ${domain}`);
      doc = await readDomain(domain);
      if (!doc.run) { // nothing queued for this domain: it is up to date as of now
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
        const row = rowOf(basic, res[`m${i}`], res[`g${i}`]);
        if (old && !row.lastSignIn) row.lastSignIn = old.lastSignIn; // delta re-reads skip signInActivity
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

  const done = doc.pending.length === 0;
  if (done) {
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
async function verifiedDomains() {
  const all = await list("/domains?$select=id,isVerified,isDefault,isInitial", 200);
  return all.filter((d) => d.isVerified).map((d) => ({ domain: String(d.id).toLowerCase(), isDefault: !!d.isDefault, isInitial: !!d.isInitial }));
}

module.exports = { readDomain, syncSlice, initDelta, status, groupsOf, touchUser, verifiedDomains, listAccounts, methodView, groupKind, domainOf, DOMAIN_RE, _store: store, _readJson: (n) => store.read(n), _writeJson: (n, o) => store.write(n, o) };
