// 校历 — the school calendar and what Hive adds to it (Rick, 2026-10-16: 「系统管理员和域 IT
// 管理员和学校领袖……把学校校历，比如教师培训等日历……同步到自己的域用户的 teams 和 outlook
// 日历」; 「系统管理员可以添加一些日历事件，比如追加培训，但是不能覆盖每个学校的校历」).
//
// Two layers, each with its own owner, never overwriting the other:
//   学校校历  crm/school-calendars/<domain>.json   { domain, timezone, events: [...], updatedAt, updatedBy }
//             edited by the school's 教育领袖 (roles.can "calendarEdit"); the system
//             administrator sees it, does not change it; the IT 管理员 has no part in it (Rick,
//             2026-10-16: the 教育领袖 publishes directly).
//   管理员广播  crm/hive-calendar.json                { events: [... + targets], updatedAt, updatedBy }
//             edited by the system administrator alone; each event names the schools it is for
//             (["*"] = every school). A school sees the Hive events aimed at it, read-only.
// Step 1 stores and edits the events. Writing them into people's Outlook / Teams calendars
// (Microsoft Graph, the user's default calendar, no invitations) comes in the next step; that
// step keeps its own record of which Outlook event belongs to which account and layer.
//
// An event:
//   { id, title, allDay, start, end, timeZone, audience: [], location, description, link,
//     meeting: "link", reminder: null | minutes, showAs: "free" | "busy",
//     teams: [{ id, name }]   members of any of these Teams / classes narrow the audience,
//     people: [upn…]          named accounts that get it in addition (any school on the Hive layer),
//     targets?: ["*"] | [domain…]  (Hive layer only),
//     createdAt, createdBy, updatedAt, updatedBy }
// allDay: start / end are dates "YYYY-MM-DD", end INCLUSIVE (a one-day event has start == end).
// timed:  start / end are local wall-clock "YYYY-MM-DDTHH:mm" in `timeZone` (an IANA name).
// audience: identities from the People Hub (老师 / 行政 / 学生 / 家长); empty = every account.
//
// Who gets an event (Rick, 2026-10-17: 「选择学校、按角色、按 teams 群组筛选，再加上输入账号」) —
//   School layer: the school's accounts, narrowed by `audience` (roles) and `teams` when given, plus
//                 `people` of that school.
//   Hive layer:   the accounts of `targets` (empty = every school when a role or team is given), narrowed
//                 by `audience` and `teams` when given, plus `people` of any school. At least one of
//                 targets / audience / teams / people must be given.
// Resolved per school in api/shared/calendarSync.js (recipientsOf).
const store = require("./jsonstore");
const { IDENTITIES } = require("./people");

const UPN_RE = /^[a-z0-9._%+'-]+@[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/;
const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIMITS = { people: 300, teams: 30, events: 400, title: 120, description: 2000, location: 200, link: 500, spanDays: 62 };
const REMINDERS = [0, 5, 10, 15, 30, 60, 120, 1440, 2880, 10080];
const DEFAULT_REMINDER = 15;
const DEFAULT_TZ = "Asia/Shanghai"; // 北京时间 until a school saves its own default (Rick, 2026-10-17)
const DOMAIN_RE = /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATETIME_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

const schoolBlob = (domain) => `crm/school-calendars/${domain}.json`;
const HIVE_BLOB = "crm/hive-calendar.json";
const OPTOUT_BLOB = "crm/broadcast-optout.json"; // 广播名单: { items: { "<upn>": { reason, at, by } }, updatedAt }
const EMPTY_OPTOUT = () => ({ items: {}, updatedAt: null, updatedBy: "" });
const EMPTY_SCHOOL = (domain) => ({ domain, timezone: "", events: [], updatedAt: null, updatedBy: "" });
const EMPTY_HIVE = () => ({ events: [], updatedAt: null, updatedBy: "" });

const str = (v, max) => String(v == null ? "" : v).trim().slice(0, max);

function validZone(tz) {
  if (!tz || typeof tz !== "string") return false;
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; }
}
function realDate(y, m, d) {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}
function parseStamp(s, allDay) {
  const m = (allDay ? DATE_RE : DATETIME_RE).exec(String(s || ""));
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (!realDate(y, mo, d)) return null;
  if (!allDay && (Number(m[4]) > 23 || Number(m[5]) > 59)) return null;
  return Date.UTC(y, mo - 1, d, allDay ? 0 : Number(m[4]), allDay ? 0 : Number(m[5]));
}
function httpsLink(v) {
  const s = str(v, LIMITS.link + 1);
  if (!s) return "";
  if (s.length > LIMITS.link) return null;
  try { const u = new URL(s); return u.protocol === "https:" && u.hostname.includes(".") ? u.toString() : null; } catch { return null; }
}
const rid = () => "e-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const ID_RE = /^[A-Za-z0-9-]{1,40}$/;

// Validate one event as the editor sends it. `layer` is "school" or "hive". Throws
// { status: 400, problems } listing everything wrong at once.
function cleanEvent(input, layer, fallbackZone) {
  const e = input && typeof input === "object" ? input : {};
  const problems = [];
  const title = str(e.title, LIMITS.title + 1);
  if (!title) problems.push("title is required");
  else if (title.length > LIMITS.title) problems.push(`title is longer than ${LIMITS.title} characters`);
  const allDay = e.allDay === true;
  const a = parseStamp(e.start, allDay), b = parseStamp(e.end || e.start, allDay);
  if (a == null) problems.push(allDay ? "start must be a date (YYYY-MM-DD)" : "start must be a date and time (YYYY-MM-DDTHH:mm)");
  if (b == null) problems.push(allDay ? "end must be a date (YYYY-MM-DD)" : "end must be a date and time (YYYY-MM-DDTHH:mm)");
  if (a != null && b != null) {
    if (allDay ? b < a : b <= a) problems.push(allDay ? "the end date is before the start date" : "the end must be after the start");
    else if ((b - a) / 86400000 > LIMITS.spanDays) problems.push(`an event cannot last more than ${LIMITS.spanDays} days`);
  }
  const timeZone = str(e.timeZone, 64) || fallbackZone || DEFAULT_TZ;
  if (!validZone(timeZone)) problems.push("time zone is not a known IANA name");
  const audience = [];
  for (const x of Array.isArray(e.audience) ? e.audience : []) {
    if (!IDENTITIES.includes(x)) { problems.push(`unknown audience ${JSON.stringify(x)}`); continue; }
    if (!audience.includes(x)) audience.push(x);
  }
  const teams = [];
  for (const x of Array.isArray(e.teams) ? e.teams : []) {
    const id = str(x && x.id, 40).toLowerCase();
    if (!GUID_RE.test(id)) { problems.push("a team has no valid id"); continue; }
    if (!teams.some((t) => t.id === id)) teams.push({ id, name: str(x.name, 120) });
  }
  if (teams.length > LIMITS.teams) problems.push(`at most ${LIMITS.teams} teams per event`);
  const people = [];
  const rawPeople = Array.isArray(e.people) ? e.people : String(e.people || "").split(/[\s,;，；]+/);
  for (const x of rawPeople) {
    const u = str(x, 200).toLowerCase();
    if (!u) continue;
    if (!UPN_RE.test(u)) { problems.push(`${JSON.stringify(u)} is not an account address`); continue; }
    if (!people.includes(u)) people.push(u);
  }
  if (people.length > LIMITS.people) problems.push(`at most ${LIMITS.people} named accounts per event`);
  const description = str(e.description, LIMITS.description + 1);
  if (description.length > LIMITS.description) problems.push(`description is longer than ${LIMITS.description} characters`);
  const location = str(e.location, LIMITS.location + 1);
  if (location.length > LIMITS.location) problems.push(`location is longer than ${LIMITS.location} characters`);
  const link = httpsLink(e.link);
  if (link === null) problems.push("the meeting link must be a full https:// address");
  // Real Teams meeting invitations come with the next step (they send mail and are capped at about 300 people).
  const meeting = e.meeting == null || e.meeting === "" ? "link" : e.meeting;
  if (meeting !== "link") problems.push("only a meeting link is available for now");
  let reminder = DEFAULT_REMINDER;
  if (e.reminder === null) reminder = null;
  else if (e.reminder !== undefined && e.reminder !== "") {
    const n = Number(e.reminder);
    if (!REMINDERS.includes(n)) problems.push("reminder must be one of " + REMINDERS.join(", ") + " minutes, or none");
    else reminder = n;
  }
  const showAs = e.showAs === "busy" ? "busy" : "free";
  const out = { id: ID_RE.test(String(e.id || "")) ? String(e.id) : "", title, allDay, start: str(e.start, 16), end: str(e.end || e.start, 16), timeZone, audience, teams, people, location, description, link: link || "", meeting, reminder, showAs };
  if (layer === "hive") {
    const raw = Array.isArray(e.targets) ? e.targets.map((x) => String(x || "").trim().toLowerCase()).filter(Boolean) : [];
    const targets = [];
    for (const t of raw) {
      if (t === "*") { targets.length = 0; targets.push("*"); break; }
      if (!DOMAIN_RE.test(t)) { problems.push(`unknown school ${JSON.stringify(t)}`); continue; }
      if (!targets.includes(t)) targets.push(t);
    }
    if (!targets.length && !audience.length && !teams.length && !people.length && !problems.length) problems.push("choose who it is for: a school, a role, a team or named people");
    out.targets = targets;
  }
  if (problems.length) throw Object.assign(new Error("please check the event"), { status: 400, problems });
  return out;
}

const core = (e) => JSON.stringify([e.title, e.allDay, e.start, e.end, e.timeZone, e.audience, e.teams || [], e.people || [], e.location, e.description, e.link, e.meeting, e.reminder, e.showAs, e.targets || null]);

// Add or change one event inside `doc` (mutates). Returns the stored event.
function putEvent(doc, ev, by, at) {
  doc.events = Array.isArray(doc.events) ? doc.events : [];
  const i = ev.id ? doc.events.findIndex((x) => x.id === ev.id) : -1;
  if (i >= 0) {
    const old = doc.events[i];
    const next = Object.assign({}, ev, { createdAt: old.createdAt || at, createdBy: old.createdBy || by, updatedAt: core(old) === core(ev) ? (old.updatedAt || at) : at, updatedBy: core(old) === core(ev) ? (old.updatedBy || by) : by });
    doc.events[i] = next;
    return next;
  }
  if (doc.events.length >= LIMITS.events) throw Object.assign(new Error(`a calendar holds at most ${LIMITS.events} events`), { status: 400, problems: [`more than ${LIMITS.events} events`] });
  let id = ev.id;
  while (!id || doc.events.some((x) => x.id === id)) id = rid();
  const made = Object.assign({}, ev, { id, createdAt: at, createdBy: by, updatedAt: at, updatedBy: by });
  doc.events.push(made);
  return made;
}

async function readSchool(domain) { return store.read(schoolBlob(domain), () => EMPTY_SCHOOL(domain)); }
async function readHive() { return store.read(HIVE_BLOB, EMPTY_HIVE); }

async function saveSchoolEvent(domain, input, by, timezone) {
  const at = new Date().toISOString();
  const { doc } = await store.update(schoolBlob(domain), () => EMPTY_SCHOOL(domain), (d) => {
    const ev = cleanEvent(input, "school", d.timezone || timezone);
    if (timezone && validZone(timezone)) d.timezone = d.timezone || timezone;
    putEvent(d, ev, by, at); d.updatedAt = at; d.updatedBy = by;
  });
  return doc;
}
async function deleteSchoolEvent(domain, id, by) {
  const at = new Date().toISOString();
  let found = false;
  const { doc } = await store.update(schoolBlob(domain), () => EMPTY_SCHOOL(domain), (d) => {
    const n = (d.events || []).length;
    d.events = (d.events || []).filter((x) => x.id !== id);
    found = d.events.length < n;
    if (!found) return false;
    d.updatedAt = at; d.updatedBy = by;
  });
  return { doc, found };
}
async function setSchoolZone(domain, timezone, by) {
  if (!validZone(timezone)) throw Object.assign(new Error("time zone is not a known IANA name"), { status: 400, problems: ["time zone is not a known IANA name"] });
  const at = new Date().toISOString();
  const { doc } = await store.update(schoolBlob(domain), () => EMPTY_SCHOOL(domain), (d) => { d.timezone = timezone; d.updatedAt = at; d.updatedBy = by; });
  return doc;
}
async function saveHiveEvent(input, by, fallbackZone) {
  const at = new Date().toISOString();
  const { doc } = await store.update(HIVE_BLOB, EMPTY_HIVE, (d) => { putEvent(d, cleanEvent(input, "hive", fallbackZone), by, at); d.updatedAt = at; d.updatedBy = by; });
  return doc;
}
async function deleteHiveEvent(id, by) {
  const at = new Date().toISOString();
  let found = false;
  const { doc } = await store.update(HIVE_BLOB, EMPTY_HIVE, (d) => {
    const n = (d.events || []).length;
    d.events = (d.events || []).filter((x) => x.id !== id);
    found = d.events.length < n;
    if (!found) return false;
    d.updatedAt = at; d.updatedBy = by;
  });
  return { doc, found };
}

// 广播名单 (Rick, 2026-10-17): accounts that do not receive 管理员广播. It only concerns that layer — a school's own
// calendar is the school's daily business. The sync leaves these accounts out and withdraws what they already hold.
async function readOptout() { return store.read(OPTOUT_BLOB, EMPTY_OPTOUT); }
async function setOptout(upn, on, reason, by) {
  const at = new Date().toISOString(), u = String(upn || "").trim().toLowerCase();
  if (!UPN_RE.test(u)) throw Object.assign(new Error("not an account address"), { status: 400 });
  const { doc } = await store.update(OPTOUT_BLOB, EMPTY_OPTOUT, (d) => {
    d.items = d.items || {};
    if (on) d.items[u] = { reason: str(reason, 200), at, by }; else if (d.items[u]) delete d.items[u]; else return false;
    d.updatedAt = at; d.updatedBy = by;
  });
  return doc;
}

// The Hive events a school sees (read-only): those aimed at all schools or at this one.
function hiveFor(hive, domain) {
  return ((hive && hive.events) || []).filter((e) => (e.targets || []).includes("*") || (e.targets || []).includes(domain));
}

module.exports = { UPN_RE, GUID_RE, LIMITS, REMINDERS, DEFAULT_REMINDER, DEFAULT_TZ, IDENTITIES, validZone, cleanEvent, putEvent, readSchool, readHive, saveSchoolEvent, deleteSchoolEvent, setSchoolZone, saveHiveEvent, deleteHiveEvent, hiveFor, readOptout, setOptout };
