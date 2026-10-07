// Hive's own facts about people, kept beside the snapshot as people.json.
//
// Entra knows an account's name, methods and groups. It does not know what
// a person IS to the school — 家长 / 学生 / 老师 / 行政 — or which parent
// belongs to which child. Those live here, keyed by the account (lowercase
// UPN), and are edited by domain administrators from the Hub's user table.
//
// Shape: { "people": { "<upn>": { "identity": "家长", "linked": ["child@domain"],
//          "note": "", "by": "admin@domain", "at": "2026-10-01T...",
//          "extra": { … the person's own 补充资料, see EXTRA below … } } } }
//
// Entra's own `department` is read as a fallback for identity when it holds
// one of the four words, so a school that fills that field in needs no edit.
//
// 补充资料 (Rick, 2026-10-02) is written by the person themselves from 我的账号:
//   extra = { roles: [SELF_ROLES…], rolesOther, topics: [TOPICS…], topicsOther, otherAccounts: [upn…],
//             children: [ { name, age, grade, schooling, model, modelOther,
//                           higherEd: [HIGHER_ED…], higherEdOther, account } ], at }
// `account` is the child's own Teams account when they have one; saving the
// profile links parent and child both ways (`linked`), so the school's user
// table shows the family on either row.
const { BlobServiceClient } = require("@azure/storage-blob");
const { snapshotBlob } = require("./config");

const BLOB_NAME = "people.json";
const INST_BLOB = "institutions.json"; // { "institutions": { "<domain>": { "name": "…", "by", "at" } } }
// 身份 — what a person is to the school. 教育顾问 added 2026-10-06 (Rick): an education
// consultant who advises families, distinct from the school's own staff (行政).
const IDENTITIES = ["家长", "学生", "老师", "行政", "教育顾问"];
// Vocabularies for 补充资料. Stored as the Chinese word; the Hub shows either language.
// Vocabularies for 补充资料 (Rick, 2026-10-02 revision). Stored as the Chinese word; the page shows either language.
const SELF_ROLES = ["家长", "老师", "学校行政", "机构负责人", "其它"];
// The topics list is the original one plus Rick's additions (2026-10-02: 「被删除了好多。比如教材等。这些不是要删掉的」).
const TOPICS = ["教材", "课程", "教师培训", "家长-亲子培训", "海外留学", "大学路径", "双学分/AP课程", "标化考试", "其它"];
const GRADES = ["学前", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];
const SCHOOLING = ["公立学校", "私立学校", "国际学校", "基督教学校", "在家教育"];
const MODELS = ["古典教育", "BJU", "Abeka", "混合教学法", "不清楚", "其它"];
const HIGHER_ED = ["欧美大学", "东南亚大学", "英国/澳洲大学", "国内大学", "2+2混合制大学", "未定", "其它"];
const NEEDS = TOPICS; // old name, kept for callers
const MAX_ACCOUNTS = 5;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_CHILDREN = 8;

function blobClient() {
  const conn = process.env.STORAGE_CONNECTION_STRING;
  if (!conn) throw new Error("STORAGE_CONNECTION_STRING app setting is not configured");
  const container = BlobServiceClient.fromConnectionString(conn).getContainerClient(snapshotBlob.container);
  return { container, blob: container.getBlockBlobClient(BLOB_NAME) };
}

async function readPeople() {
  try {
    const { blob } = blobClient();
    if (!(await blob.exists())) return { people: {} };
    const buf = await blob.downloadToBuffer();
    const parsed = JSON.parse(buf.toString("utf8"));
    return { people: parsed && typeof parsed.people === "object" && parsed.people ? parsed.people : {} };
  } catch {
    return { people: {} };
  }
}

async function writePeople(doc) {
  const { container, blob } = blobClient();
  await container.createIfNotExists();
  const body = JSON.stringify({ people: doc.people || {} }, null, 2);
  await blob.upload(body, Buffer.byteLength(body), {
    blobHTTPHeaders: { blobContentType: "application/json; charset=utf-8" },
  });
}

// Change people.json under its ETag (jsonstore.js): mutate(doc) edits doc.people in
// place; a concurrent save by another administrator is not overwritten.
async function updatePeople(mutate) {
  const store = require("./jsonstore");
  return store.update(BLOB_NAME, { people: {} }, (raw) => {
    if (!raw.people || typeof raw.people !== "object") raw.people = {};
    return mutate(raw);
  });
}
const updateInstitutions = (mutate) => require("./jsonstore").update(INST_BLOB, { institutions: {} }, (raw) => { if (!raw.institutions || typeof raw.institutions !== "object") raw.institutions = {}; return mutate(raw); });
const updateGroupNames = (mutate) => require("./jsonstore").update(GROUPNAMES_BLOB, { groups: {} }, (raw) => { if (!raw.groups || typeof raw.groups !== "object") raw.groups = {}; return mutate(raw); });

// Institution names (Rick, 2026-10-02: 「对每个域名和机构做个对应……所有用户仅能看到名称而非 domain」).
async function readInstitutions() {
  try {
    const { container } = blobClient();
    const blob = container.getBlockBlobClient(INST_BLOB);
    if (!(await blob.exists())) return { institutions: {} };
    const parsed = JSON.parse((await blob.downloadToBuffer()).toString("utf8"));
    return { institutions: parsed && typeof parsed.institutions === "object" && parsed.institutions ? parsed.institutions : {} };
  } catch {
    return { institutions: {} };
  }
}
async function writeInstitutions(doc) {
  const { container } = blobClient();
  await container.createIfNotExists();
  const body = JSON.stringify({ institutions: doc.institutions || {} }, null, 2);
  await container.getBlockBlobClient(INST_BLOB).upload(body, Buffer.byteLength(body), { blobHTTPHeaders: { blobContentType: "application/json; charset=utf-8" } });
}

// Teams group names in both languages (Rick, 2026-10-06: 「Make all teams groups name
// bilingual in Hive management center, but don't modify them in MS tenant」). Keyed by
// group id; the tenant's displayName is never touched. groupnames.json:
// { "groups": { "<id>": { "zh": "…", "en": "…", "by": "…", "at": "…" } } }
const GROUPNAMES_BLOB = "groupnames.json";
async function readGroupNames() {
  try {
    const { container } = blobClient();
    const blob = container.getBlockBlobClient(GROUPNAMES_BLOB);
    if (!(await blob.exists())) return { groups: {} };
    const parsed = JSON.parse((await blob.downloadToBuffer()).toString("utf8"));
    return { groups: parsed && typeof parsed.groups === "object" && parsed.groups ? parsed.groups : {} };
  } catch {
    return { groups: {} };
  }
}
async function writeGroupNames(doc) {
  const { container } = blobClient();
  await container.createIfNotExists();
  const body = JSON.stringify({ groups: doc.groups || {} }, null, 2);
  await container.getBlockBlobClient(GROUPNAMES_BLOB).upload(body, Buffer.byteLength(body), { blobHTTPHeaders: { blobContentType: "application/json; charset=utf-8" } });
}
// Add nameZh / nameEn to group rows ({id, name, …}); a name not set falls back to the tenant's.
function withGroupNames(rows, doc) {
  const g = (doc && doc.groups) || {};
  return (rows || []).map((r) => {
    const n = r && r.id && g[r.id];
    return Object.assign({}, r, { nameZh: (n && n.zh) || "", nameEn: (n && n.en) || "" });
  });
}

// The same, translating as it goes (Rick, 2026-10-07: 「adding active translation after
// teams group name before rendering it」): a group whose name is in one script and has
// no stored other side is translated once, here, and the result kept in
// groupnames.json so the next read costs nothing. A name typed by hand wins; a name
// already in both scripts around a slash needs nothing; without a translator key the
// rows come back as withGroupNames() gives them. Translation trouble never fails
// the read — the untranslated name is shown instead.
const CJK_RE = /[\u3400-\u9fff]/;
function sideOfName(t) { t = String(t || ""); return CJK_RE.test(t) ? "zh" : /[A-Za-z]/.test(t) ? "en" : ""; }
function bilingualSlash(name) {
  const m = /^(.+?)\s*[\/／]\s*(.+)$/.exec(String(name || ""));
  if (!m) return null;
  const a = sideOfName(m[1]), b = sideOfName(m[2]);
  if (!a || !b || a === b) return null;
  return a === "zh" ? { zh: m[1].trim(), en: m[2].trim() } : { zh: m[2].trim(), en: m[1].trim() };
}
async function translateGroupNames(rows, doc, actor) {
  let translate;
  try { translate = require("./translate"); } catch { return withGroupNames(rows, doc); }
  if (!translate.configured()) return withGroupNames(rows, doc);
  const g = (doc && doc.groups) || {};
  const todo = new Map(); // id → {name, to, from}
  for (const r of rows || []) {
    if (!r || !r.id || !r.name) continue;
    const cur = g[r.id] || {};
    if (cur.zh && cur.en) continue;
    if (bilingualSlash(r.name)) continue;
    const side = sideOfName(r.name);
    if (side === "zh" && !cur.en) todo.set(r.id, { name: r.name, to: "en", from: "zh" });
    else if (side === "en" && !cur.zh) todo.set(r.id, { name: r.name, to: "zh", from: "en" });
  }
  if (todo.size) {
    try {
      const list = Array.from(todo.entries());
      const toEn = list.filter(([, x]) => x.to === "en"), toZh = list.filter(([, x]) => x.to === "zh");
      const [en, zh] = await Promise.all([
        toEn.length ? translate.translate(toEn.map(([, x]) => x.name), "en", "zh") : [],
        toZh.length ? translate.translate(toZh.map(([, x]) => x.name), "zh", "en") : [],
      ]);
      const at = new Date().toISOString();
      toEn.forEach(([id, x], i) => { if (en[i]) g[id] = { zh: (g[id] && g[id].zh) || x.name, en: en[i], by: actor || "translator", at, auto: true }; });
      toZh.forEach(([id, x], i) => { if (zh[i]) g[id] = { zh: zh[i], en: (g[id] && g[id].en) || x.name, by: actor || "translator", at, auto: true }; });
      doc.groups = g;
      const fresh = {}; toEn.concat(toZh).forEach(([id]) => { if (g[id]) fresh[id] = g[id]; });
      await updateGroupNames((d) => { for (const [id, v] of Object.entries(fresh)) if (!d.groups[id] || d.groups[id].auto) d.groups[id] = v; });
    } catch { /* shown untranslated this time */ }
  }
  return withGroupNames(rows, doc);
}

// Identity for one account: Hive's record first, then Entra's department.
function identityOf(record, entraUser) {
  if (record && IDENTITIES.includes(record.identity)) return record.identity;
  const dep = String((entraUser && (entraUser.department || entraUser.jobTitle)) || "").trim();
  const hit = IDENTITIES.find((i) => dep === i || dep.includes(i));
  if (hit) return hit;
  // Every account on the Office 365 A1 for students plan is a student (Rick, 2026-10-08).
  if (entraUser && entraUser.plan === "student") return "学生";
  return "";
}

// Check and normalise a 补充资料 body from the form. Returns { extra, problems }.
function validateExtra(b, selfUpn) {
  const problems = [];
  const str = (v, max) => String(v == null ? "" : v).trim().slice(0, max);
  const pick = (v, list, field) => { const s = str(v, 40); if (s && !list.includes(s)) problems.push(`${field}: must be one of ${list.join(" / ")}`); return s; };
  const pickMany = (arr, list, field) => {
    const out = [];
    for (const v of Array.isArray(arr) ? arr : []) { const s = str(v, 40); if (!list.includes(s)) problems.push(`${field}: unknown item ${s}`); else if (!out.includes(s)) out.push(s); }
    return out;
  };
  const extra = { roles: pickMany(b.roles, SELF_ROLES, "roles"), rolesOther: "", topics: pickMany(b.topics, TOPICS, "topics"), otherAccounts: [], children: [] };
  extra.rolesOther = extra.roles.includes("其它") ? str(b.rolesOther, 60) : "";
  if (extra.roles.includes("其它") && !extra.rolesOther) problems.push("rolesOther: please say which");
  extra.topicsOther = extra.topics.includes("其它") ? str(b.topicsOther, 60) : "";
  if (extra.topics.includes("其它") && !extra.topicsOther) problems.push("topicsOther: please say which");
  // Other Teams accounts of the same person in this directory.
  const accs = (Array.isArray(b.otherAccounts) ? b.otherAccounts : String(b.otherAccounts || "").split(/[\s,;，；]+/)).map((a) => str(a, 120).toLowerCase()).filter(Boolean);
  for (const a of accs) {
    if (!EMAIL_RE.test(a)) problems.push(`otherAccounts: ${a} is not an account (name@school-domain)`);
    else if (selfUpn && a === selfUpn) problems.push("otherAccounts: that is this account itself");
    else if (!extra.otherAccounts.includes(a)) extra.otherAccounts.push(a);
  }
  if (extra.otherAccounts.length > MAX_ACCOUNTS) problems.push(`otherAccounts: at most ${MAX_ACCOUNTS}`);
  const kids = Array.isArray(b.children) ? b.children.slice(0, MAX_CHILDREN) : [];
  if (Array.isArray(b.children) && b.children.length > MAX_CHILDREN) problems.push(`children: at most ${MAX_CHILDREN}`);
  kids.forEach((k, i) => {
    k = k && typeof k === "object" ? k : {};
    const c = { name: str(k.name, 30) };
    const age = k.age === "" || k.age == null ? null : Number(k.age);
    if (age !== null && (!Number.isInteger(age) || age < 1 || age > 30)) problems.push(`children[${i}].age: 1–30`);
    c.age = age;
    c.grade = pick(k.grade, GRADES, `children[${i}].grade`);
    c.schooling = pick(k.schooling, SCHOOLING, `children[${i}].schooling`);
    c.model = pick(k.model, MODELS, `children[${i}].model`);
    c.modelOther = c.model === "其它" ? str(k.modelOther, 60) : "";
    if (c.model === "其它" && !c.modelOther) problems.push(`children[${i}].modelOther: please say which`);
    c.higherEd = pickMany(k.higherEd, HIGHER_ED, `children[${i}].higherEd`);
    c.higherEdOther = c.higherEd.includes("其它") ? str(k.higherEdOther, 60) : "";
    if (c.higherEd.includes("其它") && !c.higherEdOther) problems.push(`children[${i}].higherEdOther: please say which`);
    c.account = str(k.account, 120).toLowerCase();
    if (c.account && !EMAIL_RE.test(c.account)) problems.push(`children[${i}].account: not an account (name@school-domain)`);
    if (c.account && selfUpn && c.account === selfUpn) problems.push(`children[${i}].account: that is your own account`);
    // An empty card (nothing filled in) is dropped silently.
    if (c.name || c.age !== null || c.grade || c.schooling || c.model || c.higherEd.length || c.account) extra.children.push(c);
  });
  const seen = new Set();
  for (const c of extra.children) if (c.account) { if (seen.has(c.account)) problems.push(`children: ${c.account} is listed twice`); seen.add(c.account); }
  return { extra, problems };
}

// Link this person's other accounts both ways (no identity change: it is the same person).
function linkAccounts(doc, self, accounts, prev) {
  const people = doc.people;
  const now = new Date().toISOString();
  const p = people[self] || (people[self] = {});
  const removed = (prev || []).filter((a) => !accounts.includes(a));
  p.linked = Array.from(new Set((p.linked || []).filter((a) => !removed.includes(a)).concat(accounts)));
  for (const a of removed) { const o = people[a]; if (o) { o.linked = (o.linked || []).filter((x) => x !== self); o.at = now; } }
  for (const a of accounts) { const o = people[a] || (people[a] = {}); o.linked = Array.from(new Set((o.linked || []).concat([self]))); o.at = now; }
}

// Record the family both ways. `prev` are the child accounts the profile named
// before this save, so a child taken off the form is unlinked again (links an
// administrator made by hand are kept).
function linkFamily(doc, parent, childAccounts, prev) {
  const people = doc.people;
  const now = new Date().toISOString();
  const p = people[parent] || (people[parent] = {});
  const removed = (prev || []).filter((a) => !childAccounts.includes(a));
  p.linked = Array.from(new Set((p.linked || []).filter((a) => !removed.includes(a)).concat(childAccounts)));
  if (!p.identity && childAccounts.length) p.identity = "家长";
  for (const a of removed) {
    const c = people[a];
    if (!c) continue;
    c.linked = (c.linked || []).filter((x) => x !== parent);
    c.at = now;
    if (!c.identity && !c.linked.length && !c.note && !c.extra) delete people[a];
  }
  for (const a of childAccounts) {
    const c = people[a] || (people[a] = {});
    c.linked = Array.from(new Set((c.linked || []).concat([parent])));
    if (!c.identity) c.identity = "学生";
    c.at = now;
  }
}

module.exports = { readGroupNames, writeGroupNames, updateGroupNames, updatePeople, updateInstitutions, withGroupNames, translateGroupNames, bilingualSlash, sideOfName, IDENTITIES, SELF_ROLES, TOPICS, GRADES, SCHOOLING, MODELS, HIGHER_ED, NEEDS, MAX_CHILDREN, MAX_ACCOUNTS, readPeople, writePeople, identityOf, validateExtra, linkFamily, linkAccounts, readInstitutions, writeInstitutions };
