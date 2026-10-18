// 课程管理 / Course management (design: claude/fengchao-course-management-design.md, Rick 2026-10-18).
//
// Teachers maintain their own courses in Hive and the approved version is written into the
// Airtable Course table, which the website is synced from. Hive keeps, in the site-data container:
//
//   crm/course-assignments.json      { items: { <courseId>: { code, people: [{ crmId, upn, name, at, by }] } } }
//   crm/course-work/<id>.json        one working record per course:
//     { courseId, code, status, draft: { fields, meta, baseline, at, by }, submitted, reviewing, returned,
//       published: { at, by, fields }, fieldHistory: { <key>: [{ at, by, from, to }] }, history: [...] }
//   crm/course-work/<id>/v/<at>.json milestone copies (submit, return, publish, restore, manual)
//   crm/course-work/<id>/pub/<at>.json what each publish wrote
//
// Status: draft → submitted → reviewing → published, with returned branching back to draft.
// The teacher edits one language and 生成双语 fills the other through Azure Translator; machine-made
// text carries meta.machine[key] = true and meta.translatedFrom[key] = hash of the source it was made
// from, so a later edit of the source shows "原文已改" and a re-run only touches what needs it.
//
// Airtable: reads use AIRTABLE_PAT (the read-only token the sync uses); the publish uses
// AIRTABLE_HIVE_WRITE_PAT (data.records:write on the Hive base), falling back to AIRTABLE_PAT when
// that one was widened. The browser never sees either.
const crypto = require("crypto");
const store = require("./jsonstore");
const cfg = require("./config");
const { AirtableBase, norm } = require("./airtable");
const { readSnapshot } = require("./blob");
const { isAdmin, staffFunctions } = require("./roles");

const ASSIGN_BLOB = "crm/course-assignments.json";
const SYNC_BLOB = "crm/course-sync.json";
const workBlob = (id) => `crm/course-work/${id}.json`;
const milestoneBlob = (id, at) => `crm/course-work/${id}/v/${at.replace(/[:.]/g, "-")}.json`;
const pubBlob = (id, at) => `crm/course-work/${id}/pub/${at.replace(/[:.]/g, "-")}.json`;
const INDEX_BLOB = "crm/course-work/_index.json"; // { items: { <id>: { code, status, updatedAt, submittedAt, publishedAt, returnedAt, by } } }
const EMPTY_ASSIGN = () => ({ items: {}, updatedAt: null });
const GRADE_ORDER = ["Pre-K", "K1", "K2", "K3", "G1", "G2", "G3", "G4", "G5", "G6", "G7", "G8", "G9", "G10", "G11", "G12", "Associate of Arts Degree"];
const ID_RE = /^rec[A-Za-z0-9]{14}$/;
const APPROVERS = ["curriculum", "ceo"];
const VIEWERS = ["community"];
const SYNC_GAP_MS = 2 * 60 * 1000;
const HISTORY_MAX = 500;
const FIELD_HISTORY_MAX = 20;
const LIMITS = { name: 120, long: 4000, text: 500 };

// ---- who may ---------------------------------------------------------------------------------
function isApprover(roles) { return isAdmin(roles) || staffFunctions(roles).some((f) => APPROVERS.includes(f)); }
function isViewer(roles) { return isApprover(roles) || staffFunctions(roles).some((f) => VIEWERS.includes(f)); }

// ---- the editable fields --------------------------------------------------------------------
// key → how the editor shows it, which Airtable column it is, and whether a teacher may change it.
// `pair` ties the two languages of one text; `lang` says which side a key is.
const cf = cfg.courseFields;
const FIELDS = {
  nameEn: { kind: "text", spec: cf.nameEn, teacher: true, pair: "name", lang: "en", max: LIMITS.name, required: true },
  nameZh: { kind: "text", spec: cf.nameZh, teacher: true, pair: "name", lang: "zh", max: LIMITS.name, required: true },
  descriptionEn: { kind: "long", spec: cf.descriptionEn, teacher: true, pair: "description", lang: "en", max: LIMITS.long, required: true },
  descriptionZh: { kind: "long", spec: cf.descriptionZh, teacher: true, pair: "description", lang: "zh", max: LIMITS.long, required: true },
  classType: { kind: "pair", specEn: cf.classTypeEn, specZh: cf.classTypeZh, teacher: true },
  language: { kind: "pair", specEn: cf.languageEn, specZh: cf.languageZh, teacher: true },
  subjects: { kind: "links", spec: cf.subjects, specAlso: cf.subjectsZh, table: "subjects", teacher: true, required: true },
  grades: { kind: "links", spec: cf.grades, table: "grades", teacher: true, required: true },
  creditHours: { kind: "number", spec: cf.creditHours, teacher: true },
  numClasses: { kind: "number", spec: cf.numClasses, teacher: true },
  classTime: { kind: "text", spec: cf.classTime, teacher: true, max: LIMITS.text },
  days: { kind: "multi", spec: cf.daysOfWeek, teacher: true },
  prerequisite: { kind: "long", spec: cf.re.prerequisite, teacher: true, max: LIMITS.text },
  academic: { kind: "check", spec: cf.re.academic, teacher: true },
  classical: { kind: "check", spec: cf.re.classical, teacher: true },
  syllabus: { kind: "files", spec: cf.re.syllabus, teacher: true },
  textbooks: { kind: "links", spec: cf.textbooks, table: "textbooks", teacher: false },
  teachers: { kind: "links", spec: cf.teachers, table: "teachers", teacher: false },
  school: { kind: "links", spec: cf.school, table: "schools", teacher: false, single: true },
  tracks: { kind: "links", spec: cf.tracks, table: "tracks", teacher: false },
  price: { kind: "number", spec: cf.price, teacher: false },
  available: { kind: "check", spec: cf.available, teacher: false },
  comments: { kind: "long", spec: cf.re.comments, teacher: false, max: LIMITS.long },
};
// The two sides of the paired selects, so one choice writes both columns (verified live values).
const PAIR_VALUES = {
  classType: [["Live Course", "直播课"], ["Live or Recorded Course", "直播或录播课"], ["Prerecorded Course", "录播课"], ["Self-Paced Course", "自定义进度课程"]],
  language: [["English", "英语"], ["Chinese", "中文"]],
};
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const TRANSLATABLE = ["name", "description"];

const bad = (m, extra) => Object.assign(new Error(m), { status: 400 }, extra || {});
const hash = (s) => crypto.createHash("sha1").update(String(s || "")).digest("hex").slice(0, 16);
const now = () => new Date().toISOString();

// ---- Airtable access -------------------------------------------------------------------------
function readBase() { const pat = process.env.AIRTABLE_PAT; if (!pat) throw Object.assign(new Error("AIRTABLE_PAT app setting is not configured"), { status: 500, code: "no_pat" }); return new AirtableBase(cfg.baseId, pat); }
function writeBase() { const pat = process.env.AIRTABLE_HIVE_WRITE_PAT || process.env.AIRTABLE_PAT; if (!pat) throw Object.assign(new Error("AIRTABLE_HIVE_WRITE_PAT app setting is not configured"), { status: 500, code: "no_pat" }); return new AirtableBase(cfg.baseId, pat); }
let baseFor = { read: readBase, write: writeBase }; // tests swap these

const LOOKUP_TTL = 10 * 60 * 1000;
let lookupCache = { at: 0, data: null };
const first = (fields, re) => { for (const k of Object.keys(fields || {})) if (re.test(k)) return fields[k]; return undefined; };
const text = (v) => (Array.isArray(v) ? v.map(text).filter(Boolean).join(", ") : v == null ? "" : String(v));

// The pick lists the editor offers (cached 10 minutes): the linked tables and the select options.
async function lookups(force) {
  if (!force && lookupCache.data && Date.now() - lookupCache.at < LOOKUP_TTL) return lookupCache.data;
  const base = baseFor.read();
  const t = cfg.tables;
  const [grades, subjects, textbooks, teachers, schools, tracks, courseTable] = await Promise.all([
    base.list(t.grades.id), base.list(t.subjects.id), base.list(t.textbooks.id), base.list(t.teachers.id),
    base.list(t.schools.id), base.list(t.tracks.id), base.table([t.courses.id]).catch(() => null),
  ]);
  const gradeOrder = new Map(GRADE_ORDER.map((g, i) => [g, i]));
  const data = {
    at: now(),
    grades: grades.map((r) => ({ id: r.id, name: text(first(r.fields, /^(Title|年级名称)/i) || r.fields[Object.keys(r.fields)[0]]) })).sort((a, b) => (gradeOrder.get(a.name) ?? 99) - (gradeOrder.get(b.name) ?? 99) || a.name.localeCompare(b.name)),
    subjects: subjects.map((r) => ({ id: r.id, nameEn: text(first(r.fields, /^Subject\s*Name/i)), nameZh: text(first(r.fields, /^学科/)) })).filter((s) => s.nameEn || s.nameZh).sort((a, b) => a.nameEn.localeCompare(b.nameEn)),
    textbooks: textbooks.map((r) => ({ id: r.id, sku: text(first(r.fields, cfg.textbookFields.sku)), nameEn: text(first(r.fields, cfg.textbookFields.nameEn)), nameZh: text(first(r.fields, cfg.textbookFields.nameZh)) })).filter((x) => x.sku || x.nameEn || x.nameZh),
    teachers: teachers.map((r) => ({ id: r.id, name: text(first(r.fields, cfg.teacherFields.name)), upn: text(first(r.fields, cfg.teacherPrivateFields.teamsAccount)).toLowerCase() })).filter((x) => x.name).sort((a, b) => a.name.localeCompare(b.name)),
    schools: schools.map((r) => ({ id: r.id, name: text(first(r.fields, cfg.schoolFields.name)), abbr: text(first(r.fields, cfg.schoolFields.abbr)) })).filter((x) => x.name).sort((a, b) => a.name.localeCompare(b.name)),
    tracks: tracks.map((r) => ({ id: r.id, trackId: r.fields[cfg.trackFields.trackId], name: text(r.fields[cfg.trackFields.name]), nameZh: text(r.fields[cfg.trackFields.nameZh]) })).sort((a, b) => (a.trackId || 0) - (b.trackId || 0)),
    options: { classType: PAIR_VALUES.classType.map(([en, zh]) => ({ en, zh })), language: PAIR_VALUES.language.map(([en, zh]) => ({ en, zh })), days: DAYS.slice() },
    fields: {},
  };
  // Which editable columns the base actually has (a missing one is shown greyed with a note, never written).
  if (courseTable) {
    for (const [key, f] of Object.entries(FIELDS)) {
      if (f.kind === "pair") data.fields[key] = !!(AirtableBase.field(courseTable, f.specEn) && AirtableBase.field(courseTable, f.specZh));
      else data.fields[key] = !!AirtableBase.field(courseTable, f.spec);
    }
    // The select options as the base has them, when they differ from the verified pairs.
    for (const key of ["classType", "language"]) {
      const fe = AirtableBase.field(courseTable, FIELDS[key].specEn), fz = AirtableBase.field(courseTable, FIELDS[key].specZh);
      const en = ((fe && fe.options && fe.options.choices) || []).map((c) => c.name), zh = ((fz && fz.options && fz.options.choices) || []).map((c) => c.name);
      if (en.length && zh.length && en.length === zh.length) data.options[key] = en.map((e, i) => ({ en: e, zh: PAIR_VALUES[key].find(([a]) => a === e) ? PAIR_VALUES[key].find(([a]) => a === e)[1] : zh[i] }));
    }
    const fd = AirtableBase.field(courseTable, FIELDS.days.spec);
    if (fd && fd.options && fd.options.choices && fd.options.choices.length) data.options.days = fd.options.choices.map((c) => c.name);
  }
  lookupCache = { at: Date.now(), data };
  return data;
}

// The Airtable record → editor fields (record ids for links, {en, zh} for the paired selects).
function fieldsFromRecord(record) {
  const raw = (record && record.fields) || {};
  const get = (spec) => { if (spec instanceof RegExp) return first(raw, spec); const k = Object.keys(raw).find((x) => norm(x) === norm(spec)) || Object.keys(raw).find((x) => norm(x).startsWith(norm(spec).split("/")[0])); return k ? raw[k] : undefined; };
  const out = {};
  for (const [key, f] of Object.entries(FIELDS)) {
    if (f.kind === "pair") { out[key] = { en: text(get(f.specEn)), zh: text(get(f.specZh)) }; continue; }
    const v = get(f.spec);
    switch (f.kind) {
      case "links": { let ids = Array.isArray(v) ? v.filter((x) => ID_RE.test(String(x))) : []; if (f.specAlso) for (const x of (Array.isArray(get(f.specAlso)) ? get(f.specAlso) : [])) if (ID_RE.test(String(x)) && !ids.includes(x)) ids.push(x); out[key] = ids; break; }
      case "number": out[key] = typeof v === "number" ? v : (v == null || v === "" ? null : (Number.isFinite(parseFloat(v)) ? parseFloat(v) : null)); break;
      case "check": out[key] = typeof v === "boolean" ? v : /^(yes|true|是|y|1)$/i.test(String(v || "").trim()); break;
      case "multi": out[key] = Array.isArray(v) ? v.map(String) : v ? [String(v)] : []; break;
      case "files": out[key] = Array.isArray(v) ? v.map((a) => ({ id: a.id, name: a.filename || "", size: a.size || 0, type: a.type || "", url: a.url || "", airtable: true })) : []; break;
      default: out[key] = text(v);
    }
  }
  return out;
}

// ---- the working record ----------------------------------------------------------------------
function emptyWork(id, code) {
  return { courseId: id, code: code || "", status: "draft", draft: { fields: {}, meta: { machine: {}, translatedFrom: {}, sourceLang: "" }, baseline: {}, at: null, by: "" },
    submitted: null, reviewing: null, returned: null, published: null, fieldHistory: {}, history: [], createdAt: now(), updatedAt: null };
}
const readWork = (id) => store.read(workBlob(id), () => null);
// A small index of every working record, so the list page reads one blob instead of one per course.
async function indexPut(d) {
  if (!d) return;
  await store.update(INDEX_BLOB, () => ({ items: {} }), (x) => { x.items[d.courseId] = { code: d.code, status: d.status, updatedAt: d.updatedAt, submittedAt: d.submitted ? d.submitted.at : null, publishedAt: d.published ? d.published.at : null, returnedAt: d.returned && d.status === "returned" ? d.returned.at : null, by: d.draft.by || "" }; x.updatedAt = now(); });
}
const readIndex = () => store.read(INDEX_BLOB, () => ({ items: {} }));
function pushHistory(d, entry) { d.history.push(Object.assign({ at: now() }, entry)); if (d.history.length > HISTORY_MAX) d.history.splice(0, d.history.length - HISTORY_MAX); }
async function milestone(d, kind, by, note) {
  const at = now();
  const copy = { at, by, kind, note: note || "", status: d.status, fields: d.draft.fields, meta: d.draft.meta };
  await store.write(milestoneBlob(d.courseId, at), copy);
  return { at, ref: "v:" + at };
}

// Open a course for the editor: the working record, created from the Airtable row when there is none.
// An approver opening a submitted course moves it to reviewing (the teacher sees someone is looking).
async function open(id, who) {
  if (!ID_RE.test(String(id || ""))) throw bad("no such course");
  let doc = await readWork(id);
  if (!doc) {
    const base = baseFor.read();
    const record = await base.get(cfg.tables.courses.id, id).catch((err) => { throw Object.assign(new Error(`course not read from Airtable: ${err.message}`), { status: 502 }); });
    const fields = fieldsFromRecord(record);
    const code = fields.code || text(first(record.fields, /^Course\s*ID/i));
    const fresh = emptyWork(id, code);
    fresh.draft.fields = fields; fresh.draft.baseline = JSON.parse(JSON.stringify(fields)); fresh.draft.at = now(); fresh.draft.by = who.user;
    fresh.draft.meta.sourceLang = /[一-鿿]/.test(fields.descriptionZh || fields.nameZh) && !(fields.descriptionEn || "").trim() ? "zh" : (fields.descriptionEn || fields.nameEn ? "en" : "zh");
    pushHistory(fresh, { by: who.user, action: "open", note: "from Airtable" });
    await store.write(workBlob(id), fresh);
    await indexPut(fresh);
    doc = fresh;
  }
  if (doc.status === "submitted" && who.approver) {
    const { doc: d } = await store.update(workBlob(id), () => emptyWork(id), (x) => { if (x.status !== "submitted") return false; x.status = "reviewing"; x.reviewing = { at: now(), by: who.user }; pushHistory(x, { by: who.user, action: "reviewing" }); x.updatedAt = now(); });
    doc = d; await indexPut(doc);
  }
  return doc;
}

// Save one field of the draft (the autosave). Returns { savedAt, status, meta }.
async function saveField(id, key, value, who) {
  const f = FIELDS[key];
  if (!f) throw bad(`unknown field ${JSON.stringify(key)}`);
  if (!who.approver && !f.teacher) throw Object.assign(new Error("only the curriculum director, the CEO or the system administrator may change this field"), { status: 403 });
  const v = clean(key, value);
  const { doc } = await store.update(workBlob(id), () => null, (d) => {
    if (!d) throw bad("open the course first");
    const before = d.draft.fields[key];
    if (JSON.stringify(before) === JSON.stringify(v)) return false;
    d.draft.fields[key] = v; d.draft.at = now(); d.draft.by = who.user;
    const m = d.draft.meta = d.draft.meta || { machine: {}, translatedFrom: {} };
    if (f.lang) {
      const wasMachine = !!m.machine[key];
      m.machine[key] = false; if (!m.sourceLang) m.sourceLang = f.lang;
      // pairedWith[X] = what the other language said when a person last wrote X. The other side's text that came
      // from Airtable (no record yet) is taken to match the old text of this field, so changing this field
      // now marks that text "原文已改".
      const other = f.pair + (f.lang === "en" ? "Zh" : "En");
      m.pairedWith = m.pairedWith || {};
      m.pairedWith[key] = hash(String(d.draft.fields[other] || "").trim());
      // fixing a machine translation by hand is a correction, not a new source: the other side stays in step
      if (wasMachine) { if (!m.machine[other]) m.pairedWith[other] = hash(String(v || "").trim()); }
      else if (m.pairedWith[other] === undefined && !m.machine[other] && String(d.draft.fields[other] || "").trim() && String(before || "").trim()) m.pairedWith[other] = hash(String(before).trim());
    }
    (d.fieldHistory[key] = d.fieldHistory[key] || []).push({ at: d.draft.at, by: who.user, from: before, to: v });
    if (d.fieldHistory[key].length > FIELD_HISTORY_MAX) d.fieldHistory[key].splice(0, d.fieldHistory[key].length - FIELD_HISTORY_MAX);
    const last = d.history[d.history.length - 1];
    // consecutive autosaves by the same person within 10 minutes fold into one history line
    if (last && last.action === "save" && last.by === who.user && Date.now() - new Date(last.at).getTime() < 600000) { if (!last.fields.includes(key)) last.fields.push(key); last.at = d.draft.at; }
    else pushHistory(d, { by: who.user, action: "save", fields: [key] });
    if (d.status === "published" || d.status === "returned") d.status = "draft";
    d.updatedAt = d.draft.at;
  });
  if (!doc) throw bad("open the course first");
  await indexPut(doc);
  return { savedAt: doc.draft.at, status: doc.status, meta: doc.draft.meta };
}

// What a value may be, per kind.
function clean(key, v) {
  const f = FIELDS[key];
  switch (f.kind) {
    case "text": case "long": { const s = String(v == null ? "" : v).replace(/\r\n/g, "\n").trim(); if (f.max && s.length > f.max) throw bad(`${key}: at most ${f.max} characters`); return s; }
    case "number": { if (v === "" || v == null) return null; const n = Number(v); if (!Number.isFinite(n) || n < 0) throw bad(`${key}: a number`); return n; }
    case "check": return !!v;
    case "pair": { const en = String((v && v.en) || ""), zh = String((v && v.zh) || ""); const hit = PAIR_VALUES[key].find(([a, b]) => a === en || b === zh); return hit ? { en: hit[0], zh: hit[1] } : (en || zh ? { en, zh } : { en: "", zh: "" }); }
    case "links": { const ids = (Array.isArray(v) ? v : []).map(String).filter((x) => ID_RE.test(x)); const out = []; for (const x of ids) if (!out.includes(x)) out.push(x); return f.single ? out.slice(0, 1) : out; }
    case "multi": return (Array.isArray(v) ? v : []).map(String).filter(Boolean).slice(0, 20);
    case "files": return (Array.isArray(v) ? v : []).slice(0, 3).map((a) => ({ id: String(a.id || ""), name: String(a.name || "").slice(0, 120), size: Number(a.size) || 0, type: String(a.type || ""), url: String(a.url || ""), airtable: !!a.airtable }));
    default: return v;
  }
}

// Problems that stop a submit or a publish; warnings that do not.
function validate(fields, have) {
  const problems = [], warnings = [];
  const ok = (k) => !have || have.fields == null || have.fields[k] !== false;
  for (const k of ["nameEn", "nameZh", "descriptionEn", "descriptionZh"]) if (ok(k) && !String(fields[k] || "").trim()) problems.push(`${k}: ${/En$/.test(k) ? "English" : "Chinese"} text is missing — use 生成双语 / Translate, or type it`);
  if (ok("subjects") && !(fields.subjects || []).length) problems.push("subjects: choose at least one");
  if (ok("grades") && !(fields.grades || []).length) problems.push("grades: choose at least one");
  if (fields.classTime != null && !String(fields.classTime).trim()) warnings.push("classTime: empty — the website shows 时间待定");
  return { problems, warnings };
}

// Submit for approval; withdraw; return with a comment; a manual milestone.
async function submit(id, who, note) {
  const have = await lookups().catch(() => null);
  const { doc } = await store.update(workBlob(id), () => null, async (d) => {
    if (!d) throw bad("open the course first");
    if (d.status === "submitted" || d.status === "reviewing") throw Object.assign(new Error("already submitted"), { status: 409 });
    const v = validate(d.draft.fields, have);
    if (v.problems.length) throw bad("please complete the course first", { problems: v.problems });
    d.status = "submitted"; d.submitted = { at: now(), by: who.user, note: String(note || "").slice(0, 1000) }; d.reviewing = null; d.returned = null;
    const m = await milestone(d, "submit", who.user, note);
    pushHistory(d, { by: who.user, action: "submit", note: d.submitted.note, ref: m.ref });
    d.updatedAt = now();
  });
  await indexPut(doc);
  return doc;
}
async function withdraw(id, who) {
  const { doc } = await store.update(workBlob(id), () => null, (d) => {
    if (!d) throw bad("open the course first");
    if (d.status !== "submitted" && d.status !== "reviewing") throw Object.assign(new Error("not submitted"), { status: 409 });
    if (!who.approver && d.submitted && d.submitted.by !== who.user) throw Object.assign(new Error("only the person who submitted may withdraw"), { status: 403 });
    d.status = "draft"; pushHistory(d, { by: who.user, action: "withdraw" }); d.updatedAt = now();
  });
  await indexPut(doc);
  return doc;
}
async function giveBack(id, who, comment) {
  if (!String(comment || "").trim()) throw bad("a comment for the teacher is required");
  const { doc } = await store.update(workBlob(id), () => null, async (d) => {
    if (!d) throw bad("open the course first");
    if (d.status !== "submitted" && d.status !== "reviewing") throw Object.assign(new Error("not submitted"), { status: 409 });
    d.status = "returned"; d.returned = { at: now(), by: who.user, comment: String(comment).slice(0, 2000) };
    const m = await milestone(d, "return", who.user, comment);
    pushHistory(d, { by: who.user, action: "return", note: d.returned.comment, ref: m.ref });
    d.updatedAt = now();
  });
  await indexPut(doc);
  return doc;
}
async function saveVersion(id, who, note) {
  const { doc } = await store.update(workBlob(id), () => null, async (d) => {
    if (!d) throw bad("open the course first");
    const m = await milestone(d, "manual", who.user, note);
    pushHistory(d, { by: who.user, action: "milestone", note: String(note || "").slice(0, 200), ref: m.ref });
  });
  await indexPut(doc);
  return doc;
}

// ---- translation -----------------------------------------------------------------------------
// 生成双语: fill the other language of every translatable pair whose target is empty, or machine-made
// from a source that has changed since. Human text is never touched. Returns what it did.
async function translateCourse(id, who, translator, opts) {
  const T = translator || require("./translate");
  const o = opts || {};
  const pre = await readWork(id);
  if (!pre) throw bad("open the course first");
  const jobs = [], kept = [];
  const st = translationState(pre);
  for (const pair of TRANSLATABLE) {
    const en = pair + "En", zh = pair + "Zh";
    const fields = pre.draft.fields, meta = pre.draft.meta || { machine: {}, translatedFrom: {} };
    for (const [src, dst] of [[en, zh], [zh, en]]) {
      const s = String(fields[src] || "").trim();
      if (!s) continue;
      const srcIsMachine = meta.machine[src];
      if (srcIsMachine) continue;                       // never translate a translation back
      const job = { src, dst, text: s, to: dst.endsWith("Zh") ? "zh" : "en", from: src.endsWith("Zh") ? "zh" : "en" };
      if (o.all) { if (job.from === o.from) jobs.push(job); continue; }   // 重新翻译全部: from the chosen language, over everything
      if (st[dst] === "empty" || st[dst] === "stale") jobs.push(job);
      else if (st[dst] === "human-stale") { if (o.overwrite) jobs.push(job); else kept.push(dst); }
    }
  }
  if (!jobs.length) return { done: [], kept, skipped: "up to date" };
  const byLang = {};
  for (const j of jobs) (byLang[j.to + "|" + j.from] = byLang[j.to + "|" + j.from] || []).push(j);
  for (const k of Object.keys(byLang)) {
    const list = byLang[k];
    const out = await T.translate(list.map((j) => j.text), list[0].to, list[0].from, { maxLen: LIMITS.long });
    list.forEach((j, i) => { j.result = glossary(out[i] || "", j.to); });
  }
  const { doc } = await store.update(workBlob(id), () => null, (d) => {
    const m = d.draft.meta = d.draft.meta || { machine: {}, translatedFrom: {} };
    for (const j of jobs) {
      if (String(d.draft.fields[j.src] || "").trim() !== j.text) continue; // changed meanwhile: skip
      const before = d.draft.fields[j.dst];
      d.draft.fields[j.dst] = j.result; m.machine[j.dst] = true; m.translatedFrom[j.dst] = hash(j.text);
      (d.fieldHistory[j.dst] = d.fieldHistory[j.dst] || []).push({ at: now(), by: who.user, from: before, to: j.result, machine: true });
    }
    pushHistory(d, { by: who.user, action: "translate", fields: jobs.map((j) => j.dst) });
    if (d.status === "published") d.status = "draft";
    d.draft.at = now(); d.updatedAt = d.draft.at;
  });
  await indexPut(doc);
  return { done: jobs.map((j) => j.dst), kept, fields: doc.draft.fields, meta: doc.draft.meta };
}
// Fixed renderings the site uses elsewhere (the trivium, credits), applied after machine translation.
const GLOSSARY = {
  zh: [[/Grammar [Ss]tage/g, "文法阶段"], [/Dialectic [Ss]tage/g, "逻辑阶段"], [/Rhetoric [Ss]tage/g, "修辞阶段"], [/classical education/gi, "古典教育"]],
  en: [[/文法阶段/g, "Grammar Stage"], [/逻辑阶段/g, "Dialectic Stage"], [/修辞阶段/g, "Rhetoric Stage"], [/古典教育/g, "classical education"], [/学分/g, "credit"]],
};
function glossary(s, to) { let out = String(s || ""); for (const [re, rep] of GLOSSARY[to] || []) out = out.replace(re, rep); return out; }
// Which paired fields show "原文已改" (machine translation older than its source) for the editor.
function translationState(doc) {
  const out = {};
  const fields = doc.draft.fields, meta = doc.draft.meta || { machine: {}, translatedFrom: {} };
  for (const pair of TRANSLATABLE) for (const [src, dst] of [[pair + "En", pair + "Zh"], [pair + "Zh", pair + "En"]]) {
    const s = String(fields[src] || "").trim();
    if (meta.machine[dst]) out[dst] = meta.translatedFrom[dst] === hash(s) ? "machine" : "stale";
    else if (String(fields[dst] || "").trim()) out[dst] = s && meta.pairedWith && meta.pairedWith[dst] !== undefined && meta.pairedWith[dst] !== hash(s) ? "human-stale" : "human";
    else out[dst] = "empty";
  }
  return out;
}
// How many fields 生成双语 would touch now (the button's count).
function translationNeeds(doc) {
  const st = translationState(doc), fields = doc.draft.fields, meta = doc.draft.meta || { machine: {} };
  let n = 0;
  for (const pair of TRANSLATABLE) for (const [src, dst] of [[pair + "En", pair + "Zh"], [pair + "Zh", pair + "En"]]) {
    if (!String(fields[src] || "").trim() || meta.machine[src]) continue;
    if (st[dst] === "empty" || st[dst] === "stale" || st[dst] === "human-stale") n++;
  }
  return n;
}

// ---- publish ---------------------------------------------------------------------------------
// Write the draft into the Airtable row (only what differs from the baseline), archive it, mark published.
async function publish(id, who, opts) {
  const doc = await readWork(id);
  if (!doc) throw bad("open the course first");
  const have = await lookups();
  const v = validate(doc.draft.fields, have);
  if (v.problems.length) throw bad("the course is not complete", { problems: v.problems });
  const base = baseFor.write();
  const table = await base.table([cfg.tables.courses.id]);
  const changes = {}, written = [], skipped = [];
  for (const [key, f] of Object.entries(FIELDS)) {
    if (have.fields[key] === false) continue;
    const val = doc.draft.fields[key], was = doc.draft.baseline[key];
    if (!(opts && opts.all) && JSON.stringify(val) === JSON.stringify(was)) continue;
    if (f.kind === "pair") {
      const fe = AirtableBase.field(table, f.specEn), fz = AirtableBase.field(table, f.specZh);
      if (!fe || !fz) { skipped.push(key); continue; }
      changes[fe.name] = val && val.en ? val.en : null; changes[fz.name] = val && val.zh ? val.zh : null; written.push(key); continue;
    }
    const fld = AirtableBase.field(table, f.spec);
    if (!fld || !AirtableBase.isWritable(fld)) { skipped.push(key); continue; }
    let out;
    switch (f.kind) {
      case "links": out = val && val.length ? val : []; if (f.specAlso) { const f2 = AirtableBase.field(table, f.specAlso); if (f2 && f2.id !== fld.id) changes[f2.name] = out; } break;
      case "number": out = val == null ? null : val; break;
      case "check": out = fld.type === "checkbox" ? !!val : (val ? "Yes" : "No"); break;
      case "multi": out = val || []; break;
      case "files": out = (val || []).map((a) => a.airtable && a.id ? { id: a.id } : { url: a.url, filename: a.name }); break;
      case "text": case "long": out = val || ""; break;
      default: out = val;
    }
    changes[fld.name] = out; written.push(key);
  }
  const at = now();
  let airtable = null, syllabusNow = null;
  if (Object.keys(changes).length) {
    try { airtable = await base.update(cfg.tables.courses.id, id, changes, { typecast: false }); }
    catch (err) { throw Object.assign(new Error(`Airtable refused the write: ${err.message}`), { status: 502, code: "airtable" }); }
    // Airtable fetched the uploaded syllabus and now holds its own copy with its own id: the draft keeps
    // that copy from here on, or the next publish would send the link again and make a duplicate.
    if (written.includes("syllabus") && airtable && airtable.fields) syllabusNow = fieldsFromRecord(airtable).syllabus;
  }
  const archive = { at, by: who.user, fields: doc.draft.fields, meta: doc.draft.meta, written, skipped, changes };
  await store.write(pubBlob(id, at), archive);
  const { doc: after } = await store.update(workBlob(id), () => null, (d) => {
    if (syllabusNow) d.draft.fields.syllabus = syllabusNow;
    d.status = "published"; d.published = { at, by: who.user, fields: d.draft.fields, written };
    d.draft.baseline = JSON.parse(JSON.stringify(d.draft.fields)); d.returned = null; d.reviewing = null;
    pushHistory(d, { by: who.user, action: "publish", fields: written, ref: "p:" + at, skipped });
    d.updatedAt = at;
  });
  await indexPut(after);
  await store.update(SYNC_BLOB, () => ({ lastAt: null, pending: false }), (s) => { s.pending = true; s.pendingSince = s.pendingSince || at; });
  return { doc: after, written, skipped, at, airtable: !!airtable };
}

// Refresh the website after publishes, at most once every two minutes; a call inside the gap leaves
// `pending` set and says when to try again. The sync itself is api/sync's runSync.
async function syncWebsite(runner, log) {
  const s = await store.read(SYNC_BLOB, () => ({ lastAt: null, pending: false }));
  const since = s.lastAt ? Date.now() - new Date(s.lastAt).getTime() : Infinity;
  if (!s.pending && s.lastRun) return { ran: false, upToDate: true, lastAt: s.lastAt };
  if (since < SYNC_GAP_MS) return { ran: false, queued: true, retryIn: Math.ceil((SYNC_GAP_MS - since) / 1000), lastAt: s.lastAt };
  const startedAt = now();
  await store.update(SYNC_BLOB, () => ({}), (x) => { x.lastAt = startedAt; x.pending = false; x.lastRun = { startedAt, status: "running" }; });
  const r = await runner({ log });
  await store.update(SYNC_BLOB, () => ({}), (x) => { x.lastRun = { startedAt, finishedAt: now(), status: r.status, counts: r.body && r.body.counts, warnings: (r.body && r.body.warnings || []).slice(0, 20), error: r.body && r.body.error }; });
  return { ran: true, status: r.status, body: r.body, startedAt };
}
const syncStatus = () => store.read(SYNC_BLOB, () => ({ lastAt: null, pending: false }));

// ---- versions --------------------------------------------------------------------------------
// The timeline: every history line, newest first; milestones and publishes can be previewed and restored.
async function versions(id) {
  const doc = await readWork(id);
  if (!doc) throw bad("open the course first");
  return { status: doc.status, items: doc.history.slice().reverse() };
}
async function versionContent(id, ref) {
  const [kind, at] = String(ref || "").split(/:(.+)/);
  if (kind === "v") return store.read(milestoneBlob(id, at), () => null);
  if (kind === "p") return store.read(pubBlob(id, at), () => null);
  return null;
}
async function restore(id, ref, who) {
  const content = await versionContent(id, ref);
  if (!content) throw bad("no such version");
  const { doc } = await store.update(workBlob(id), () => null, async (d) => {
    if (!d) throw bad("open the course first");
    const m = await milestone(d, "before-restore", who.user, ref);
    d.draft.fields = JSON.parse(JSON.stringify(content.fields || {})); d.draft.meta = JSON.parse(JSON.stringify(content.meta || { machine: {}, translatedFrom: {} }));
    d.draft.at = now(); d.draft.by = who.user; d.status = "draft";
    pushHistory(d, { by: who.user, action: "restore", note: content.at || ref, ref: m.ref });
    d.updatedAt = d.draft.at;
  });
  await indexPut(doc);
  return doc;
}

// ---- assignments -----------------------------------------------------------------------------
const readAssignments = () => store.read(ASSIGN_BLOB, EMPTY_ASSIGN);
async function assign(courseId, code, person, who) {
  if (!ID_RE.test(courseId)) throw bad("no such course");
  const p = { crmId: String(person.crmId || ""), upn: String(person.upn || "").toLowerCase(), name: String(person.name || "").slice(0, 120), at: now(), by: who.user };
  if (!p.upn && !p.crmId) throw bad("a person needs a Teams account or a people-hub id");
  const { doc } = await store.update(ASSIGN_BLOB, EMPTY_ASSIGN, (d) => {
    const it = d.items[courseId] = d.items[courseId] || { code: code || "", people: [] };
    if (code) it.code = code;
    if (it.people.some((x) => (p.upn && x.upn === p.upn) || (p.crmId && x.crmId === p.crmId))) return false;
    it.people.push(p); d.updatedAt = p.at;
  });
  return doc.items[courseId];
}
async function unassign(courseId, person, who) {
  const upn = String(person.upn || "").toLowerCase(), crmId = String(person.crmId || "");
  const { doc } = await store.update(ASSIGN_BLOB, EMPTY_ASSIGN, (d) => {
    const it = d.items[courseId]; if (!it) return false;
    const n = it.people.length;
    it.people = it.people.filter((x) => !((upn && x.upn === upn) || (crmId && x.crmId === crmId)));
    if (it.people.length === n) return false;
    if (!it.people.length) delete d.items[courseId];
    d.updatedAt = now();
  });
  return (doc.items[courseId] || { people: [] });
}
// The courses an account may edit (by assignment).
async function assignedTo(upn) {
  const a = await readAssignments(), u = String(upn || "").toLowerCase(), out = [];
  for (const [id, it] of Object.entries(a.items || {})) if ((it.people || []).some((p) => p.upn === u)) out.push(id);
  return out;
}

// ---- the list ---------------------------------------------------------------------------------
// Every course of the snapshot (or just the assigned ones) with its work status; small rows for a table.
async function list(who) {
  const snap = await readSnapshot().catch(() => null);
  const a = await readAssignments();
  const mine = who.approver || who.viewer ? null : new Set(await assignedTo(who.user));
  const idx = (await readIndex()).items || {};
  const rows = [];
  for (const c of (snap && snap.courses) || []) {
    if (mine && !mine.has(c.id)) continue;
    const w = idx[c.id] || null;
    rows.push({ id: c.id, code: c.code, nameEn: c.nameEn, nameZh: c.nameZh, school: c.school && (c.school.abbr || c.school.name) || "", teachers: c.teachers || [], subjects: (c.subjects || []).map((s) => ({ nameEn: s.nameEn, nameZh: s.nameZh })), available: c.available !== false,
      status: w ? w.status : "", updatedAt: w ? w.updatedAt : null, submittedAt: w ? w.submittedAt : null, publishedAt: w ? w.publishedAt : null, returnedAt: w ? w.returnedAt : null,
      assigned: ((a.items[c.id] || {}).people || []).map((p) => ({ name: p.name, upn: p.upn, crmId: p.crmId })) });
  }
  // courses that have a working record but left the snapshot (unavailable, or new) still show for approvers
  return { courses: rows, generatedAt: snap && snap.generatedAt, assignments: who.approver ? a.items : undefined };
}

module.exports = { FIELDS, PAIR_VALUES, DAYS, TRANSLATABLE, LIMITS, isApprover, isViewer, lookups, fieldsFromRecord, open, saveField, clean, validate, submit, withdraw, giveBack, saveVersion,
  translateCourse, translationState, translationNeeds, publish, syncWebsite, syncStatus, versions, versionContent, restore, readAssignments, assign, unassign, assignedTo, list, readWork,
  _test: { baseFor: (b) => { baseFor = Object.assign({}, baseFor, b); }, resetLookups: () => { lookupCache = { at: 0, data: null }; }, hash } };
