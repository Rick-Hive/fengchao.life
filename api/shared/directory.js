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
const { updatePeople, IDENTITIES } = require("./people");

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
// Entra's `department`: the school's name stays off the accounts (Rick, 2026-10-10):
// schools do not want it — e.g. 智慧园书院 — on the Teams and Outlook profiles of
// their accounts. Hive never writes it (it used to fill in the school's name,
// 2026-10-02), and each domain's departments are cleared ONCE (Rick: 「只要清空一次
// 就可以」): sync slices clear what they find until a finished sync leaves nothing
// to clear, then the domain is recorded in directory/_departments.json and never
// touched again — a department the school sets itself afterwards stays. The school
// is shown only in the management centre, from crm/institutions. An identity the
// department carried (学生 / 老师 …) goes into Hive's own record first, so nothing
// that relied on it is lost. An account Microsoft will not let us change (a
// privileged admin) is remembered and not tried again.
const DEPT_DONE = "_departments.json";
const DEPT_TRIES = 3; // an account whose clear failed this often (not a refusal) is left for a manual fix
function identityInDepartment(dep) {
  const d = String(dep || "").trim();
  return IDENTITIES.find((i) => d === i || d.includes(i)) || "";
}
function departmentsToClear(doc) {
  return (doc.users || []).filter((r) => r.id && r.department && r.departmentRefused !== r.department);
}
// Clears departments until `deadline` (ms since epoch) — 50 accounts per round:
// their identities saved in one people.json write, then PATCHed ten at a time.
// Returns { cleared, left }. (2026-10-11: the first version only used what the
// slice had left over, at most 100 accounts, so a school with more accounts —
// or a sync that ended right at its budget — was barely touched in a night.)
async function clearDepartments(doc, domain, log, deadline) {
  let cleared = 0, attempted = 0, failed = false;
  const skipped = new Set();
  while (Date.now() < deadline) {
    const rows = departmentsToClear(doc).filter((r) => !skipped.has(r.id)).slice(0, 50);
    if (!rows.length) break;
    const keep = rows.map((r) => [String(r.upn || "").toLowerCase(), identityInDepartment(r.department)]).filter(([u, i]) => u && i);
    if (keep.length) {
      try {
        const at = new Date().toISOString();
        await updatePeople((d) => {
          for (const [upn, identity] of keep) {
            const rec = d.people[upn] || {};
            if (!IDENTITIES.includes(rec.identity)) d.people[upn] = Object.assign({}, rec, { identity, updated: at, by: "entra-department" });
          }
        });
      } catch (err) { log(`directory ${domain}: identities from departments not kept (${err.message}); departments left for the next sync`); failed = true; break; }
    }
    for (let i = 0; i < rows.length && Date.now() < deadline; i += 10) {
      attempted += rows.slice(i, i + 10).length;
      await Promise.all(rows.slice(i, i + 10).map((r) => graph("PATCH", `/users/${r.id}`, { department: null })
        .then(() => { r.department = ""; delete r.departmentRefused; delete r.departmentTries; cleared++; })
        .catch((err) => {
          skipped.add(r.id);
          if (err.status === 404) { r.department = ""; return; }
          r.departmentTries = (r.departmentTries || 0) + 1;
          if (err.status === 403 || err.status === 400 || r.departmentTries >= DEPT_TRIES) r.departmentRefused = r.department;
          log(`directory ${domain}: department of ${r.upn} not cleared: ${err.message}`);
        })));
    }
  }
  if (cleared) log(`directory ${domain}: department cleared on ${cleared} account(s)`);
  return { cleared, attempted, failed, left: departmentsToClear(doc).length };
}

// The once-per-domain department step of a slice (see DEPT_DONE above). Returns
// true when the domain still has departments to clear and this slice either
// made progress or had no time left to try — the caller then keeps the run open,
// so the scheduler and the management centre (both loop until done) call again
// and the clearing goes on until the domain is finished. A slice whose every
// attempt failed, or that could not save identities, never holds a run.
async function departmentStep(doc, domain, log, deadline, syncDone) {
  try {
    const record = (await store.read(DEPT_DONE)) || { domains: {} };
    if (!record.domains || typeof record.domains !== "object") record.domains = {};
    if (record.domains[domain]) return false;
    const { cleared, attempted, failed, left } = departmentsToClear(doc).length ? await clearDepartments(doc, domain, log, deadline) : { cleared: 0, attempted: 0, failed: false, left: 0 };
    if (syncDone && !left) {
      record.domains[domain] = { at: new Date().toISOString(), refused: (doc.users || []).filter((r) => r.department && r.departmentRefused === r.department).map((r) => r.upn) };
      await store.write(DEPT_DONE, record);
      log(`directory ${domain}: departments cleared — done once, not touched again`);
      return false;
    }
    return left > 0 && !failed && (cleared > 0 || attempted === 0);
  } catch (err) { log(`directory ${domain}: department clearing skipped this time: ${err.message}`); return false; }
}

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
function groupsOf(rows, groupOwners, domain, groupArchived) {
  const owners = groupOwners || {}, archived = groupArchived || {};
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
      id: group.id, name: group.name, description: group.description || "", mail: group.mail || "", kind: group.kind, visibility: group.visibility || "", archived: !!archived[group.id],
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

// A team made or changed from the management centre goes into the cache at once
// (the Teams 群组 page lists what the rows say, so without this it would wait for
// the next sync). `group` = { id, name, description, mail, kind, visibility };
// `owners` = the owners' UPNs (replaces the group's entry in groupOwners); `add` /
// `remove` = UPNs of this domain's accounts that joined / left it.
async function noteGroup(domain, group, change) {
  const c = change || {};
  const doc = await readDomain(domain);
  const add = new Set((c.add || []).map((u) => String(u).toLowerCase())), remove = new Set((c.remove || []).map((u) => String(u).toLowerCase()));
  let touched = false;
  doc.users = doc.users.map((r) => {
    const upn = String(r.upn || "").toLowerCase();
    if (!add.has(upn) && !remove.has(upn)) return r;
    const rest = (r.groups || []).filter((x) => x.id !== group.id);
    touched = true;
    return Object.assign({}, r, { groups: remove.has(upn) ? rest : rest.concat([{ id: group.id, name: group.name || "", description: group.description || "", mail: group.mail || "", kind: group.kind || "team", visibility: group.visibility || "" }]) });
  });
  if (Array.isArray(c.owners)) { doc.groupOwners = Object.assign({}, doc.groupOwners || {}, { [group.id]: c.owners.map((u) => String(u).toLowerCase()) }); touched = true; }
  if (touched) await store.write(`${domain}.json`, doc);
}

// A team archived or restored through Hive: remembered in every school's cache that lists it
// (the nightly sync does not read the flag; an archive done inside Teams shows once the group panel is opened).
async function noteGroupArchived(groupId, on) {
  const domains = await store.listDomains().catch(() => []);
  for (const d of domains) {
    const domain = d.domain || d;
    const doc = await readDomain(domain);
    if (!doc.users.some((r) => (r.groups || []).some((g) => g && g.id === groupId))) continue;
    doc.groupArchived = Object.assign({}, doc.groupArchived || {});
    if (on) doc.groupArchived[groupId] = true; else delete doc.groupArchived[groupId];
    await store.write(`${domain}.json`, doc);
  }
}
// A deleted group leaves every school's cache at once (its members may be on several domains).
async function forgetGroup(groupId) {
  const domains = await store.listDomains().catch(() => []);
  for (const d of domains) {
    const domain = d.domain || d;
    const doc = await readDomain(domain);
    let touched = false;
    doc.users = doc.users.map((r) => {
      if (!(r.groups || []).some((g) => g && g.id === groupId)) return r;
      touched = true;
      return Object.assign({}, r, { groups: r.groups.filter((g) => g.id !== groupId) });
    });
    if (doc.groupOwners && doc.groupOwners[groupId]) { delete doc.groupOwners[groupId]; touched = true; }
    if (touched) await store.write(`${domain}.json`, doc);
  }
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
  if (await dropUsers(doc, (r) => r.upn === upn, "hive")) await store.write(`${domain}.json`, doc);
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
// ---- monthly snapshots and the removal ledger (对账单, Rick 2026-10-12) ------------
// The IT invoice of a month needs the accounts on its first day and on the first day
// of the next month, and which accounts came and went in between. The cache only
// knows "now", so: (1) the first sync on or after the 1st (Beijing) of a month writes
// directory/_snapshots/<domain>/<YYYY-MM>.json — the accounts as of that day;
// (2) every row the sync drops (deleted in Microsoft, or by Hive) is appended to
// directory/_ledger/<domain>.json, since Graph does not tell us later who was deleted.
// api/shared/statements.js reads both; a month with no snapshot is reconstructed from
// the current rows, their created dates and the ledger (marked as such).
const SNAP_DIR = "_snapshots/";
const LEDGER_DIR = "_ledger/";
const LEDGER_MAX = 5000;
function beijingDate(d) { // "YYYY-MM-DD" in Asia/Shanghai
  const x = new Date((d ? new Date(d) : new Date()).getTime() + 8 * 3600 * 1000);
  return x.toISOString().slice(0, 10);
}
function snapshotRow(r) { return { id: r.id, upn: r.upn, displayName: r.displayName || "", plan: r.plan || "", enabled: r.enabled !== false, created: r.created || null }; }
async function takeMonthlySnapshot(doc, log) {
  const month = beijingDate().slice(0, 7);
  const name = `${SNAP_DIR}${doc.domain}/${month}.json`;
  try {
    if (await store.read(name)) return false;
    await store.write(name, { domain: doc.domain, month, at: new Date().toISOString(), accounts: (doc.users || []).map(snapshotRow) });
    log(`directory ${doc.domain}: accounts of ${month} snapshotted (${doc.users.length})`);
    return true;
  } catch (err) { log(`directory ${doc.domain}: snapshot of ${month} not taken: ${err.message}`); return false; }
}
async function recordRemoved(domain, rows, why) {
  const list = (rows || []).filter((r) => r && r.upn);
  if (!list.length) return;
  const name = `${LEDGER_DIR}${domain}.json`;
  try {
    const led = (await store.read(name)) || { domain, events: [] };
    if (!Array.isArray(led.events)) led.events = [];
    const at = new Date().toISOString();
    for (const r of list) led.events.push(Object.assign({ at, kind: "removed", why: why || "" }, snapshotRow(r)));
    if (led.events.length > LEDGER_MAX) led.events = led.events.slice(-LEDGER_MAX);
    await store.write(name, led);
  } catch (err) { /* the statement will say the month was reconstructed */ }
}
// Drop the rows `gone(row)` selects from the cache and remember them. Returns how many.
async function dropUsers(doc, gone, why) {
  const out = doc.users.filter(gone);
  if (!out.length) return 0;
  doc.users = doc.users.filter((r) => !gone(r));
  await recordRemoved(doc.domain, out, why);
  return out.length;
}
// Entra's recycle bin (Rick, 2026-10-14: 「最好还是准确一点，否则学校会有疑问的」). The ledger
// above records a removal when the sync notices it, with the sync's own time; accounts
// deleted before the ledger existed (2026-10-12) or between syncs got no entry, or one
// dated days late, so a statement showed 删除 0. Microsoft keeps a deleted user for 30
// days in /directory/deletedItems with its real deletedDateTime (and createdDateTime),
// so each completed sync reads the bin and reconciles the domain's ledger: an account
// not ledgered yet is added with the real deletion time (why "recycleBin"); one the
// sync had ledgered later than Microsoft says is moved to the real time (`exact`).
// A row still in the cache but in the bin is dropped. Deletions older than 30 days are
// gone from Microsoft too and cannot be recovered. A deleted user's UPN comes back
// prefixed with its object id without dashes; that prefix is stripped.
// The bin is tenant-wide and paged, so it is read once per process every ten minutes.
const BIN_TTL_MS = 10 * 60 * 1000;
let binCache = { at: 0, items: null };
async function deletedUsers(fresh) {
  if (!fresh && binCache.items && Date.now() - binCache.at < BIN_TTL_MS) return binCache.items;
  const items = await list("/directory/deletedItems/microsoft.graph.user?$select=id,userPrincipalName,displayName,deletedDateTime,createdDateTime,accountEnabled,assignedLicenses,userType&$top=999", 5000);
  binCache = { at: Date.now(), items };
  return items;
}
function binUpn(u) {
  let upn = String(u.userPrincipalName || "").toLowerCase();
  const prefix = String(u.id || "").replace(/-/g, "").toLowerCase();
  if (prefix && upn.startsWith(prefix)) upn = upn.slice(prefix.length);
  return upn;
}
async function reconcileRecycleBin(doc, log, opts) {
  let bin;
  try { bin = await deletedUsers(!!(opts && opts.fresh)); } catch (err) { log(`directory ${doc.domain}: recycle bin not read: ${err.message}`); return { added: 0, moved: 0, dropped: 0 }; }
  const plans = await loadSkuPlans();
  const mine = bin.filter((u) => u.userType !== "Guest" && domainOf(binUpn(u)) === doc.domain && u.deletedDateTime);
  if (!mine.length) return { added: 0, moved: 0, dropped: 0 };
  const name = `${LEDGER_DIR}${doc.domain}.json`;
  let led;
  try { led = (await store.read(name)) || { domain: doc.domain, events: [] }; } catch { return { added: 0, moved: 0, dropped: 0 }; }
  if (!Array.isArray(led.events)) led.events = [];
  const byId = new Map(), byUpn = new Map();
  for (const e of led.events) { if (e.kind !== "removed") continue; if (e.id) byId.set(e.id, e); if (e.upn) byUpn.set(e.upn, e); }
  let added = 0, moved = 0;
  const binIds = new Set();
  for (const u of mine) {
    binIds.add(u.id);
    const upn = binUpn(u);
    const at = new Date(u.deletedDateTime).toISOString();
    const have = byId.get(u.id) || byUpn.get(upn);
    if (have) {
      if (!have.exact && have.at !== at) { have.at = at; have.exact = true; moved++; }
      continue;
    }
    const row = Object.assign({ at, kind: "removed", why: "recycleBin", exact: true }, snapshotRow({ id: u.id, upn, displayName: u.displayName || "", plan: planOf(u, plans), enabled: u.accountEnabled !== false, created: u.createdDateTime || null }));
    led.events.push(row); byId.set(u.id, row); byUpn.set(upn, row); added++;
  }
  // A cached row that Microsoft has in the bin is deleted: drop it, dated by the bin.
  const gone = doc.users.filter((r) => binIds.has(r.id)); // already ledgered above
  if (gone.length) doc.users = doc.users.filter((r) => !binIds.has(r.id));
  if (added || moved) {
    led.events.sort((a, b) => String(a.at).localeCompare(String(b.at)));
    if (led.events.length > LEDGER_MAX) led.events = led.events.slice(-LEDGER_MAX);
    try { await store.write(name, led); } catch (err) { log(`directory ${doc.domain}: ledger not written: ${err.message}`); return { added: 0, moved: 0, dropped: gone.length }; }
    log(`directory ${doc.domain}: recycle bin reconciled — ${added} deletion(s) added, ${moved} re-dated, ${gone.length} cached row(s) dropped`);
  }
  return { added, moved, dropped: gone.length };
}
async function readSnapshot(domain, month) { return store.read(`${SNAP_DIR}${domain}/${month}.json`); }
async function readLedger(domain) { return (await store.read(`${LEDGER_DIR}${domain}.json`)) || { domain, events: [] }; }

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
        if (await dropUsers(doc, (r) => r.id === c.id || r.upn === c.upn, "delta")) touched++;
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

// One account read live and written into the cache (Rick, 2026-10-12: Linda H. had
// registered Microsoft Authenticator in Entra while the management centre still said
// "No"). Registering a method is not a change /users/delta reports, so until the next
// full read the cache cannot know; the person panel calls this when it opens.
// What Graph could not read this time (methods or groups) keeps its cached value.
async function refreshUser(domain, upn) {
  const doc = await readDomain(domain);
  const want = String(upn || "").toLowerCase();
  const old = doc.users.find((r) => r.upn === want);
  const key = encodeURIComponent(old ? old.id : want);
  const plans = await loadSkuPlans();
  const res = await batch([
    { id: "b", url: `/users/${key}?$select=${USER_SELECT.replace(",signInActivity", "")}` },
    { id: "m", url: `/users/${key}/authentication/methods` },
    { id: "g", url: `/users/${key}/memberOf/microsoft.graph.group?$select=id,displayName,description,mail,groupTypes,mailEnabled,securityEnabled,resourceProvisioningOptions,visibility&$top=200` },
    { id: "s", url: `/users/${key}?$select=id,signInActivity` }, // its own request: refused without Entra ID P1
  ]);
  const b = res.b || {};
  if (b.status === 404) {
    if (old) { await dropUsers(doc, (r) => r === old, "gone"); await store.write(`${domain}.json`, doc); }
    return null;
  }
  if (b.status !== 200 || !b.body || b.body.userType === "Guest") return old || null;
  const row = rowOf(b.body, res.m, res.g, plans);
  if (old) {
    if (!(res.m && res.m.status === 200)) { row.verified = old.verified; row.devices = old.devices || []; row.otherMethods = old.otherMethods || []; }
    if (!(res.g && res.g.status === 200)) row.groups = old.groups || [];
    else { const kinds = new Map((old.groups || []).map((g) => [g.id, g.kind])); for (const g of row.groups) if (g.kind === "team" && kinds.get(g.id) === "class") g.kind = "class"; }
    row.lastSignIn = old.lastSignIn || row.lastSignIn;
    if (!row.city) row.city = old.city || "";
    if (!row.safeEmail) row.safeEmail = old.safeEmail || "";
    if (old.departmentRefused && old.departmentRefused === row.department) row.departmentRefused = old.departmentRefused;
    row.partial = !!(old.partial && row.partial);
  }
  const sia = res.s && res.s.status === 200 && res.s.body && res.s.body.signInActivity;
  if (sia) row.lastSignIn = sia.lastSignInDateTime || sia.lastNonInteractiveSignInDateTime || row.lastSignIn;
  const k = doc.users.findIndex((r) => r.id === row.id || r.upn === row.upn);
  if (k >= 0) doc.users[k] = row; else doc.users.push(row);
  await store.write(`${domain}.json`, doc);
  return row;
}

// One budgeted slice of a sync. Returns the document's status:
// { done, domain, mode, total, remaining, syncedAt, fullAt, added }.
// opts.scope = "domain" (an IT 管理员's own sync) keeps the "changes" intake to this
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
      if (blind.length) { const ids = new Set(blind.map((c) => c.id)); removed += await dropUsers(doc, (r) => ids.has(r.id), "delta"); }
      const mine = byDomain[domain] || [];
      removed += mine.filter((c) => c.removed).length;
      added += mine.filter((c) => !c.removed).length;
      await store.write(`${domain}.json`, doc);
      if (o.scope === "domain") {
        // A IT 管理员syncs their own school only (Rick, 2026-10-03): the other
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
          try { await syncSlice(dom, "changes", { by: o.by, scope: "domain", recheck: false, log, budgetMs: Math.max(5000, budget - (Date.now() - t0)) }); } catch (err) { log(`directory ${dom}: share of the tenant's changes not read now: ${err.message}`); }
        }
      }
      doc = await readDomain(domain);
      // Registering an authenticator is not a change /users/delta reports (2026-10-12),
      // so a sync of this domain's changes also re-reads every account that has none yet.
      if (o.recheck !== false) {
        const pend = new Set(doc.pending || []);
        const queued = new Set(Array.from(pend).map((x) => { try { return JSON.parse(x).id; } catch { return ""; } }));
        let n = 0;
        for (const r of doc.users) if (r.id && r.verified !== true && r.enabled !== false && !queued.has(r.id)) { pend.add(JSON.stringify({ id: r.id, upn: r.upn, b: 1 })); n++; }
        if (n) {
          doc.pending = Array.from(pend);
          if (!doc.run) doc.run = { mode: "changes", startedAt: new Date().toISOString(), total: doc.pending.length, by: o.by || "" };
          else doc.run.total = (doc.run.total || 0) + n;
          await store.write(`${domain}.json`, doc);
          log(`directory ${domain}: ${n} account(s) without an authenticator re-read`);
        }
      }
      if (!doc.run && await departmentStep(doc, domain, log, t0 + budget, true)) {
        // Nothing queued, but departments still to clear: open a run so the caller calls again.
        doc.run = { mode: "changes", startedAt: new Date().toISOString(), total: 0, by: o.by || "", phase: "departments", departmentsLeft: departmentsToClear(doc).length };
        await store.write(`${domain}.json`, doc);
        return status(doc, 0, removed);
      }
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
      removed += await dropUsers(doc, (r) => !live.has(r.upn), "full");
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
      const gone = [];
      chunk.forEach((c, i) => {
        const old = doc.users.find((r) => r.id === c.id || r.upn === c.upn);
        const fresh = res[`b${i}`];
        const basic = (fresh && fresh.status === 200 && fresh.body) || (doc.basics && doc.basics[c.id]) ||
          (old ? { id: old.id, userPrincipalName: old.upn, displayName: old.displayName, department: old.department, jobTitle: old.jobTitle, accountEnabled: old.enabled, createdDateTime: old.created } : { id: c.id, userPrincipalName: c.upn });
        if (fresh && fresh.status === 404) { gone.push(c.id); return; } // gone meanwhile
        if (fresh && fresh.status === 200 && fresh.body && fresh.body.userType === "Guest") return;
        const row = rowOf(basic, res[`m${i}`], res[`g${i}`], plans);
        if (old && !row.lastSignIn) row.lastSignIn = old.lastSignIn; // delta re-reads skip signInActivity
        if (old) { if (!row.city) row.city = old.city || ""; if (!row.safeEmail) row.safeEmail = old.safeEmail || ""; }
        if (old && old.departmentRefused && old.departmentRefused === row.department) row.departmentRefused = old.departmentRefused;
        const k = doc.users.findIndex((r) => r.id === row.id || r.upn === row.upn);
        if (k >= 0) doc.users[k] = row; else doc.users.push(row);
      });
      if (gone.length) { const ids = new Set(gone); await dropUsers(doc, (r) => ids.has(r.id), "gone"); }
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
  // Entra's department is cleared once per domain (departmentStep), with the rest of this slice's time.
  let done = doc.pending.length === 0;
  if (await departmentStep(doc, domain, log, t0 + budget, done) && done) {
    done = false; // more to clear: the run stays open for the next call
    doc.run.phase = "departments";
    doc.run.departmentsLeft = departmentsToClear(doc).length;
  } else if (doc.run) { delete doc.run.phase; delete doc.run.departmentsLeft; }
  if (done) {
    await markClassTeams(doc, log);
    await fetchGroupOwners(doc, log);
    const bin = await reconcileRecycleBin(doc, log); // real deletion dates from Entra's recycle bin
    if (bin.dropped) removed += bin.dropped;
    await takeMonthlySnapshot(doc, log);
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
    phase: (doc.run && doc.run.phase) || "", // "departments": clearing Entra's department (once per domain)
    departmentsLeft: (doc.run && doc.run.departmentsLeft) || 0,
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

module.exports = { readDomain, syncSlice, refreshUser, readSnapshot, readLedger, reconcileRecycleBin, beijingDate, initDelta, status, groupsOf, touchUser, noteGroup, forgetGroup, noteGroupArchived, addUser, removeUser, verifiedDomains, cachedDomains: () => store.listDomains(), listAccounts, methodView, groupKind, domainOf, DOMAIN_RE, _store: store, _readJson: (n) => store.read(n), _writeJson: (n, o) => store.write(n, o) };
