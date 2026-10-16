// 新建 Teams 群组 (Rick, 2026-10-16): an IT 管理员 creates a team of their school in
// the management centre and manages its owners and members, so ordinary users can
// be stopped from creating groups in the tenant (Entra › Group.Unified:
// EnableGroupCreation = false). Hive does this as its own app identity, which that
// setting does not restrict, and only inside the rules here:
//
//  - types = the four Teams for Education offers (班级 / 教师学习社区 PLC / 教职员工 /
//    其它), each a Graph template; the three education types are private by design
//    (a class team is "hiddenMembership", which cannot be overridden), only 其它
//    chooses 公开 or 私有 — the same as Teams;
//  - only Microsoft 365 / Teams groups, never a security group or a role-assignable one;
//  - an IT 管理员 touches only their school's own groups (an owner on the domain, or no
//    owner at all), and may add only accounts of their domain — unless the system
//    administrator has allowed that school to add tenant users (institutions.json,
//    groupTenant); guests are never added;
//  - the people of a team are removed only if they are of the domain (or tenant scope),
//    and a team always keeps an owner.
//
// Graph (application): Team.Create to create the team, Group.ReadWrite.All for owners
// and members, User.Read.All (already granted through User.ReadWrite.All) to find people.
const { graph, graphRes, list, batch } = require("./graph");
const { domainOf } = require("./directory");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const GRAPH = "https://graph.microsoft.com/v1.0";

// The order is Teams' own: Class, PLC, Staff, Other.
const TYPES = {
  class: { template: "educationClass", zh: "班级团队", en: "Class", hintZh: "老师是所有者，学生是成员；含 Class Notebook、作业。成员名单对学生隐藏。", hintEn: "Teachers own it, students are members; Class Notebook and Assignments. Membership is hidden from students.", education: true, privacy: "hidden" },
  plc: { template: "educationProfessionalLearningCommunity", zh: "教师学习社区 (PLC)", en: "Professional learning community (PLC)", hintZh: "教师之间的协作，如教研组、年级组。", hintEn: "Educators working together, e.g. a department or grade band.", education: true, privacy: "private" },
  staff: { template: "educationStaff", zh: "教职员工团队", en: "Staff", hintZh: "学校行政与发展；含 Staff Notebook。", hintEn: "School administration and development; Staff Notebook.", education: true, privacy: "private" },
  standard: { template: "standard", zh: "其它", en: "Other", hintZh: "兴趣小组、社团、项目组；学生和教职员工任意组合。可选公开或私有。", hintEn: "Clubs, interest groups, projects — any mix of students and staff. Public or private.", education: false, privacy: "choose" },
};

function typeList() {
  return Object.keys(TYPES).map((id) => ({ id, zh: TYPES[id].zh, en: TYPES[id].en, hintZh: TYPES[id].hintZh, hintEn: TYPES[id].hintEn, privacy: TYPES[id].privacy }));
}

const lc = (s) => String(s || "").trim().toLowerCase();
const uniq = (a) => Array.from(new Set(a));

// Validates a create request; returns { problems, clean }.
function validateCreate(body) {
  const b = body || {};
  const problems = [];
  const type = String(b.type || "").trim();
  if (!TYPES[type]) problems.push("type must be one of " + Object.keys(TYPES).join(" / "));
  const name = String(b.name || "").trim();
  if (!name) problems.push("name is required"); else if (name.length > 256) problems.push("name longer than 256"); else if (/[<>]/.test(name)) problems.push("name: no < or >");
  const description = String(b.description || "").trim();
  if (description.length > 1024) problems.push("description longer than 1024"); else if (/[<>]/.test(description)) problems.push("description: no < or >");
  let visibility = "Private";
  if (TYPES[type] && TYPES[type].privacy === "choose") {
    const v = String(b.visibility || "Private").trim().toLowerCase();
    if (v !== "public" && v !== "private") problems.push("visibility must be Public or Private"); else visibility = v === "public" ? "Public" : "Private";
  }
  const arr = (v) => (Array.isArray(v) ? v : []).map(lc).filter(Boolean);
  const owners = uniq(arr(b.owners)), members = uniq(arr(b.members)).filter((u) => !owners.includes(u));
  if (!owners.length) problems.push("a team needs at least one owner");
  if (owners.length > 10) problems.push("at most 10 owners");
  if (members.length > 500) problems.push("at most 500 members at creation");
  for (const u of owners.concat(members)) if (!EMAIL_RE.test(u)) problems.push(`${u} is not an account name`);
  return { problems, clean: { type, name, description, visibility, owners, members } };
}

// Finds the people by UPN (one $batch). Every one must be an existing member account
// (never a guest); outside `tenant` scope also of `domain`. Returns { users: Map(upn → {id,upn,displayName}), problems }.
async function lookupUsers(upns, domain, tenant) {
  const users = new Map(), problems = [];
  const want = uniq(upns.map(lc)).filter(Boolean);
  const ok = [];
  for (const u of want) {
    if (!EMAIL_RE.test(u)) { problems.push(`${u} is not an account name`); continue; }
    if (!tenant && domainOf(u) !== domain) { problems.push(`${u} is not an account of this school (${domain}); the system administrator can allow other schools' accounts`); continue; }
    ok.push(u);
  }
  if (!ok.length) return { users, problems };
  const res = await batch(ok.map((u, i) => ({ id: i, url: `/users/${encodeURIComponent(u)}?$select=id,userPrincipalName,displayName,userType,accountEnabled` })));
  ok.forEach((u, i) => {
    const r = res[i];
    if (!r || r.status === 404) problems.push(`${u} does not exist`);
    else if (r.status !== 200 || !r.body) problems.push(`${u}: Microsoft could not read the account (HTTP ${r && r.status})`);
    else if (r.body.userType === "Guest") problems.push(`${u} is a guest account; guests are not added here`);
    else users.set(u, { id: r.body.id, upn: lc(r.body.userPrincipalName) || u, displayName: r.body.displayName || "" });
  });
  return { users, problems };
}

// What the create call puts in the request. The first owner goes in at creation
// (application permission requires one); the rest are added once the team exists.
function createBody(clean, firstOwnerId) {
  const t = TYPES[clean.type];
  const body = {
    "template@odata.bind": `${GRAPH}/teamsTemplates('${t.template}')`,
    displayName: clean.name,
    members: [{ "@odata.type": "#microsoft.graph.aadUserConversationMember", roles: ["owner"], "user@odata.bind": `${GRAPH}/users('${firstOwnerId}')` }],
  };
  if (clean.description) body.description = clean.description;
  // A class team is hiddenMembership by its template and cannot be changed; the others are Private,
  // or the chosen one for 其它.
  if (t.privacy !== "hidden") body.visibility = t.privacy === "choose" ? clean.visibility : "Private";
  return body;
}

function parseOperation(h) {
  const loc = (h && h.location) || "", cl = (h && h.contentLocation) || "";
  const team = (cl.match(/teams\('([0-9a-f-]{36})'\)/i) || loc.match(/teams\('([0-9a-f-]{36})'\)/i) || [])[1] || "";
  const op = (loc.match(/operations\('([0-9a-f-]{36})'\)/i) || [])[1] || "";
  return { id: team, op };
}

// POST /teams → { id, op } (202). Throws Graph's error with .status / .code.
async function createTeam(clean, firstOwnerId) {
  const r = await graphRes("POST", "/teams", createBody(clean, firstOwnerId));
  const o = parseOperation(r.headers);
  if (!o.id) { const e = new Error("Microsoft accepted the team but did not say which one"); e.status = 502; throw e; }
  return o;
}

// The state of the team's creation: { state: "succeeded" | "failed" | "pending", error }.
async function operation(teamId, opId) {
  const r = await graph("GET", `/teams/${encodeURIComponent(teamId)}/operations/${encodeURIComponent(opId)}`);
  const st = String((r && r.status) || "").toLowerCase();
  if (st === "succeeded") return { state: "succeeded" };
  if (st === "failed") return { state: "failed", error: (r.error && (r.error.message || r.error.code)) || "Microsoft could not create the team" };
  return { state: "pending" };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// How long a request waits for Microsoft to finish creating a team (a Function has 45 s):
// the create call, and each later check by the page. The tests set them to 0.
const WAIT = { create: 20000, check: 10000, step: 1500 };

// Waits for the creation up to `ms`; { state } as operation().
async function waitFor(teamId, opId, ms, step) {
  const end = Date.now() + (ms || 0);
  for (;;) {
    const o = await operation(teamId, opId);
    if (o.state !== "pending" || Date.now() >= end) return o;
    await sleep(step || WAIT.step);
  }
}

// A group just made may not be visible to every Graph front end for a few seconds
// ("The source resource object or one of the objects being referenced don't exist").
async function retried(fn, tries) {
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (err) {
      const replication = err.status === 404 || (err.status === 400 && /don't exist|does not exist|not exist/i.test(err.message));
      if (!replication || i >= (tries || 4) - 1) throw err;
      await sleep(2000);
    }
  }
}
const already = (err) => err && err.status === 400 && /already exist|one or more added object references already exist/i.test(err.message);

// Adds users as members, 20 per request; if a chunk fails as a whole, one by one.
async function addMembers(groupId, ids) {
  const done = [];
  for (let i = 0; i < ids.length; i += 20) {
    const chunk = ids.slice(i, i + 20);
    try {
      await retried(() => graph("PATCH", `/groups/${groupId}`, { "members@odata.bind": chunk.map((id) => `${GRAPH}/directoryObjects/${id}`) }));
      done.push(...chunk);
    } catch (err) {
      if (err.status === 403) throw err;
      for (const id of chunk) {
        try { await retried(() => graph("POST", `/groups/${groupId}/members/$ref`, { "@odata.id": `${GRAPH}/directoryObjects/${id}` })); done.push(id); } catch (e) { if (already(e)) done.push(id); else if (e.status === 403) throw e; }
      }
    }
  }
  return done;
}
async function addOwner(groupId, id) {
  try { await retried(() => graph("POST", `/groups/${groupId}/owners/$ref`, { "@odata.id": `${GRAPH}/users/${id}` })); } catch (err) { if (!already(err)) throw err; }
}

// Adds the rest of the owners (also as members: an owner who is not a member cannot act
// in the team) and the members. { owners, members } are Maps' values: [{id, upn}].
async function addPeople(groupId, owners, members) {
  for (const o of owners) { await addOwner(groupId, o.id); }
  const ids = uniq(owners.map((o) => o.id).concat(members.map((m) => m.id)));
  const done = ids.length ? await addMembers(groupId, ids) : [];
  const failed = ids.filter((id) => !done.includes(id));
  return { failed: owners.concat(members).filter((p) => failed.includes(p.id)).map((p) => p.upn) };
}

// The group as the page edits it: live owners and members.
async function readGroup(id) {
  const g = await graph("GET", `/groups/${encodeURIComponent(id)}?$select=id,displayName,description,visibility,groupTypes,mail,resourceProvisioningOptions,isAssignableToRole`);
  const owners = (await list(`/groups/${g.id}/owners?$select=id,userPrincipalName,displayName&$top=100`, 200)).filter((x) => x.userPrincipalName);
  return { g, owners };
}
async function readMembers(id) {
  return (await list(`/groups/${id}/members?$select=id,userPrincipalName,displayName&$top=500`, 1500)).filter((x) => x.userPrincipalName);
}

// Is this a group the school may manage here? Only Microsoft 365 / Teams groups, never
// a role-assignable one; and for an IT 管理员 an own group: an owner on the domain, or
// no owner at all (an orphan). `admin` = the system administrator, who may manage any.
function manageable(g, owners, domain, admin) {
  if (!(g.groupTypes || []).includes("Unified")) return { ok: false, why: "only Teams and Microsoft 365 groups are managed here" };
  if (g.isAssignableToRole) return { ok: false, why: "this group grants administrator roles and is not managed here" };
  const own = admin || owners.length === 0 || owners.some((o) => domainOf(lc(o.userPrincipalName)) === domain);
  if (!own) return { ok: false, why: "this group is owned by another school", forbidden: true };
  return { ok: true };
}

const kindOf = (g, cls) => ((g.resourceProvisioningOptions || []).includes("Team") ? (cls ? "class" : "team") : "m365");

module.exports = { WAIT, TYPES, typeList, validateCreate, lookupUsers, createBody, createTeam, operation, waitFor, addPeople, addMembers, addOwner, readGroup, readMembers, manageable, kindOf, parseOperation, already };
