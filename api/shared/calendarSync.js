// 校历 step 2 — writing the calendar's events into people's Outlook / Teams calendars
// (Rick, 2026-10-16: the 教育领袖 publishes straight to the school's accounts; the system
// administrator pushes Hive events to chosen schools; nothing overwrites the other layer).
//
// How: Microsoft Graph, as Hive's own app identity, one event per target account in the
// account's DEFAULT calendar (POST /users/{upn}/calendar/events), no attendees, so no
// invitation mail goes out. Outlook and the Teams calendar both read that calendar. The
// app's write access is limited to the school mailboxes by Exchange RBAC for Applications
// (role "Application Calendars.ReadWrite" with a management scope); it is NOT granted
// tenant-wide in Entra. Without it Graph answers 403 and the run stops with a message.
//
// The record — crm/calendar-sync/<domain>.json:
//   { domain, items: { "<layer>:<eventId>": { "<upn>": { id, hash, at, gone? } } },
//     failures: { "<layer>:<eventId>|<upn>": { reason, message, at } }, lastRun }
// `id` is the Outlook event id, `hash` the hash of what was written (a changed event shows as a
// different hash → update), `gone` marks a copy its owner deleted (it is not put back). Records
// are kept per school and per layer, so withdrawing one layer never touches the other.
//
// A run is a plan (what is missing, changed, no longer wanted) executed in small batches the
// page repeats until nothing remains, so a big school never needs one long request.
const crypto = require("crypto");
const store = require("./jsonstore");
const graphMod = require("./graph");
const dir = require("./directory");
const CAL = require("./calendar");
const peopleMod = require("./people");

const BATCH = 30, CONCURRENCY = 5;
const CATEGORY = { school: "校历", hive: "蜂巢通知" };
const syncBlob = (domain) => `crm/calendar-sync/${domain}.json`;
const EMPTY = (domain) => ({ domain, items: {}, failures: {}, lastRun: null });
const sha = (s) => crypto.createHash("sha1").update(s).digest("hex");

// Windows names for the zones the page offers (Graph takes either; these are the safe ones).
const WINDOWS_ZONE = {
  "America/New_York": "Eastern Standard Time", "America/Toronto": "Eastern Standard Time", "America/Chicago": "Central Standard Time",
  "America/Denver": "Mountain Standard Time", "America/Phoenix": "US Mountain Standard Time", "America/Los_Angeles": "Pacific Standard Time",
  "America/Vancouver": "Pacific Standard Time", "America/Anchorage": "Alaskan Standard Time", "Pacific/Honolulu": "Hawaiian Standard Time",
  "Europe/London": "GMT Standard Time", "Asia/Shanghai": "China Standard Time", "Asia/Hong_Kong": "China Standard Time",
  "Asia/Taipei": "Taipei Standard Time", "Asia/Singapore": "Singapore Standard Time", UTC: "UTC",
};
const zoneName = (z) => WINDOWS_ZONE[z] || z;
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function nextDay(date) {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + 1));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
}

// What goes into an account's calendar for one event (no transactionId: that is per account).
function graphBody(ev, layer) {
  const tz = zoneName(ev.timeZone);
  const parts = [];
  if (ev.link) parts.push(`<p>会议链接 Meeting link：<a href="${esc(ev.link)}">${esc(ev.link)}</a></p>`);
  if (ev.description) parts.push(`<p>${esc(ev.description).replace(/\r?\n/g, "<br>")}</p>`);
  parts.push(`<p style="color:#888;font-size:12px">${layer === "hive" ? "蜂巢通知 Hive notice" : "学校校历 School calendar"} · 由蜂巢写入 written by Hive</p>`);
  const body = {
    subject: ev.title,
    body: { contentType: "html", content: parts.join("") },
    isAllDay: !!ev.allDay,
    start: { dateTime: ev.allDay ? `${ev.start}T00:00:00` : `${ev.start}:00`, timeZone: tz },
    end: { dateTime: ev.allDay ? `${nextDay(ev.end || ev.start)}T00:00:00` : `${ev.end}:00`, timeZone: tz },
    location: { displayName: ev.location || ev.link || "" },
    categories: [CATEGORY[layer]],
    showAs: ev.showAs === "busy" ? "busy" : "free",
    isReminderOn: ev.reminder != null,
  };
  if (ev.reminder != null) body.reminderMinutesBeforeStart = ev.reminder;
  return body;
}
const guid = (s) => { const h = sha(s); return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`; };

// The events a layer wants in this school's accounts: [{ key, ev, body, hash }].
async function layerEvents(domain, layer) {
  let events;
  if (layer === "hive") events = CAL.hiveFor(await CAL.readHive(), domain);
  else events = (await CAL.readSchool(domain)).events || [];
  return events.map((ev) => { const body = graphBody(ev, layer); return { key: `${layer}:${ev.id}`, ev, body, hash: sha(JSON.stringify(body)) }; });
}

// The enabled accounts of the school with their identity, from the directory cache.
async function accountsOf(domain) {
  const doc = await dir.readDomain(domain);
  if (!doc || !(doc.users || []).length) throw Object.assign(new Error(`the account list of ${domain} has not been read yet — ask the system administrator to sync the school's accounts first`), { status: 409, code: "no_accounts" });
  const people = ((await peopleMod.readPeople()) || {}).people || {};
  return doc.users.filter((u) => u.enabled !== false && u.upn).map((u) => ({ upn: u.upn.toLowerCase(), identity: peopleMod.identityOf(people[u.upn] || people[u.upn.toLowerCase()] || null, { department: u.department, jobTitle: u.jobTitle, plan: u.plan || "" }) }));
}

function audienceOf(ev, accounts) {
  const a = ev.audience || [];
  return accounts.filter((x) => !a.length || a.includes(x.identity)).map((x) => x.upn);
}

// The plan: every create / update / delete this layer still needs for this school.
// `only` (a Set of accounts) limits it to those accounts (the test run); `withdraw` wants nothing.
async function plan(domain, layer, opts) {
  const o = opts || {};
  const [wanted, accounts, doc] = await Promise.all([layerEvents(domain, layer), accountsOf(domain), store.read(syncBlob(domain), () => EMPTY(domain))]);
  const only = o.only && o.only.size ? o.only : null;
  const ops = [], gone = [], failed = [];
  const desired = new Map();
  if (!o.withdraw) for (const w of wanted) desired.set(w.key, { w, upns: new Set(audienceOf(w.ev, accounts)) });
  const prefix = `${layer}:`;
  const failures = doc.failures || {};
  const stuck = (fk, key, upn, title) => { const f = failures[fk]; if (f && !o.retry) { failed.push({ key, upn, title, reason: f.reason, message: f.message }); return true; } return false; };
  for (const [key, d] of desired) {
    for (const upn of d.upns) {
      if (only && !only.has(upn)) continue;
      const rec = ((doc.items || {})[key] || {})[upn];
      if (!rec) { if (!stuck(`${key}|${upn}`, key, upn, d.w.ev.title)) ops.push({ op: "create", key, upn, w: d.w, gen: ((doc.gen || {})[`${key}|${upn}`]) || 0 }); continue; }
      if (rec.gone) { gone.push({ key, upn }); continue; }
      if (rec.hash !== d.w.hash && !stuck(`${key}|${upn}`, key, upn, d.w.ev.title)) ops.push({ op: "update", key, upn, w: d.w, id: rec.id });
    }
  }
  for (const [key, byUser] of Object.entries(doc.items || {})) {
    if (!key.startsWith(prefix)) continue;
    const d = desired.get(key);
    for (const [upn, rec] of Object.entries(byUser)) {
      if (only && !only.has(upn)) continue;
      if (d && d.upns.has(upn)) continue;
      if (!stuck(`${key}|${upn}|del`, key, upn, key)) ops.push({ op: "delete", key, upn, id: rec.id });
    }
  }
  const counts = { create: 0, update: 0, delete: 0 };
  for (const x of ops) counts[x.op]++;
  const titleOf = new Map(wanted.map((w) => [w.key, w.ev.title]));
  return { ops, counts, gone: gone.length, failed: failed.map((f) => Object.assign({}, f, { title: titleOf.get(f.key) || f.title })), accounts: accounts.length, events: wanted.length, doc };
}

function classify(err) {
  const s = err && err.status, code = String((err && err.code) || "");
  if (s === 403) return { reason: "no_access", message: String(err.message || "").slice(0, 200) };
  if (s === 404) return { reason: "no_mailbox", message: code || "not found" };
  if (s === 429 || s === 503) return { reason: "throttled", message: "Microsoft asked us to slow down — run it again" };
  if (s === 400 && /InvalidTimeZone/i.test(code + String(err.message))) return { reason: "time_zone", message: String(err.message || "").slice(0, 200) };
  return { reason: "error", message: String((err && err.message) || err).slice(0, 200) };
}

async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}

const enc = encodeURIComponent;
// A deleted copy must not be mistaken for the one a later creation would dedupe to (same transactionId):
// each deletion moves the account's generation for that event on.
function bump(d, op) { d.gen = d.gen || {}; const k = `${op.key}|${op.upn}`; d.gen[k] = (d.gen[k] || 0) + 1; }

async function execute(op, domain) {
  if (op.op === "create") {
    const r = await graphMod.graph("POST", `/users/${enc(op.upn)}/calendar/events`, Object.assign({ transactionId: guid(`${domain}|${op.key}|${op.upn}` + (op.gen ? `|${op.gen}` : "")) }, op.w.body));
    return { id: r && r.id };
  }
  if (op.op === "update") {
    await graphMod.graph("PATCH", `/users/${enc(op.upn)}/events/${enc(op.id)}`, op.w.body);
    return { id: op.id };
  }
  await graphMod.graph("DELETE", `/users/${enc(op.upn)}/events/${enc(op.id)}`);
  return {};
}

// Execute up to `limit` operations of the plan and save what happened. Returns the
// progress the page shows. `fresh` (the first request of a run) forgets earlier failures
// so they are tried again; later requests leave them out so a stubborn failure cannot loop.
async function run(domain, layer, opts) {
  const o = opts || {};
  const limit = Math.max(1, Math.min(60, Number(o.limit) || BATCH));
  if (o.fresh) await store.update(syncBlob(domain), () => EMPTY(domain), (d) => {
    const only = o.only && o.only.size ? o.only : null;
    for (const k of Object.keys(d.failures || {})) { if (!k.startsWith(`${layer}:`)) continue; const upn = k.split("|")[1]; if (!only || only.has(upn)) delete d.failures[k]; }
  });
  const p = await plan(domain, layer, { only: o.only, withdraw: o.withdraw });
  const batch = p.ops.slice(0, limit);
  const results = await pool(batch, CONCURRENCY, async (op) => {
    try { return { op, out: await execute(op, domain) }; } catch (err) { return { op, err }; }
  });
  const ok = results.filter((r) => !r.err), bad = results.filter((r) => r.err);
  const now = new Date().toISOString();
  // A 403 for every attempt in the batch means the app has no write access yet (Exchange RBAC not set, or not yet in effect).
  const denied = bad.length > 0 && !ok.length && bad.every((r) => r.err.status === 403);
  await store.update(syncBlob(domain), () => EMPTY(domain), (d) => {
    d.items = d.items || {}; d.failures = d.failures || {};
    for (const r of results) {
      const { op } = r, fk = `${op.key}|${op.upn}` + (op.op === "delete" ? "|del" : "");
      if (!r.err) {
        delete d.failures[fk];
        if (op.op === "delete") { if (d.items[op.key]) { delete d.items[op.key][op.upn]; if (!Object.keys(d.items[op.key]).length) delete d.items[op.key]; } bump(d, op); }
        else { d.items[op.key] = d.items[op.key] || {}; d.items[op.key][op.upn] = { id: r.out.id, hash: op.w.hash, at: now }; }
      } else if (r.err.status === 404 && op.op === "update") { // the owner deleted their copy: leave it deleted
        d.items[op.key] = d.items[op.key] || {}; d.items[op.key][op.upn] = { id: op.id, hash: op.w.hash, at: now, gone: true };
      } else if (r.err.status === 404 && op.op === "delete") { // already gone
        if (d.items[op.key]) { delete d.items[op.key][op.upn]; if (!Object.keys(d.items[op.key]).length) delete d.items[op.key]; }
        bump(d, op);
      } else if (r.err.status !== 403) { // a 403 is the whole run's problem, not this account's: nothing recorded
        d.failures[fk] = Object.assign(classify(r.err), { at: now });
      }
    }
    d.lastRun = { at: now, layer, by: o.by || "", created: ok.filter((r) => r.op.op === "create").length, updated: ok.filter((r) => r.op.op === "update").length, deleted: ok.filter((r) => r.op.op === "delete").length, failed: bad.length };
  });
  if (denied) {
    const ms = String((bad[0].err && bad[0].err.message) || "").replace(/^Graph [A-Z]+ \S+ -> /, "").slice(0, 160);
    throw Object.assign(new Error("Microsoft refused every write: Hive's app does not have access to these mailboxes yet. It needs the Exchange application role “Application Calendars.ReadWrite” limited to the school mailboxes (Exchange RBAC for Applications); it can take up to 2 hours to take effect." + (ms ? " Microsoft said: " + ms : "")), { status: 403, code: "app_permission" });
  }
  const after = await plan(domain, layer, { only: o.only, withdraw: o.withdraw });
  return { done: ok.length, failedNow: bad.length, remaining: after.ops.length, counts: after.counts, failed: after.failed, gone: after.gone, created: ok.filter((r) => r.op.op === "create").length, updated: ok.filter((r) => r.op.op === "update").length, deleted: ok.filter((r) => r.op.op === "delete").length };
}

// What the page shows before and between runs.
async function summary(domain, layer, opts) {
  const p = await plan(domain, layer, opts);
  const doc = p.doc;
  const written = Object.entries(doc.items || {}).filter(([k]) => k.startsWith(`${layer}:`)).reduce((n, [, u]) => n + Object.keys(u).length, 0);
  return { counts: p.counts, remaining: p.ops.length, gone: p.gone, failed: p.failed, accounts: p.accounts, events: p.events, written, lastRun: doc.lastRun && doc.lastRun.layer === layer ? doc.lastRun : null };
}

module.exports = { BATCH, CATEGORY, WINDOWS_ZONE, graphBody, guid, nextDay, plan, run, summary, accountsOf, audienceOf, syncBlob };
