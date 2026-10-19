// A school's 课程方案 — its own graduation credit requirements and curriculum map
// (Rick, 2026-10-08/12: 「学校/教育社区领袖角色：每所学校自定义毕业学分要求和课程地图，
// 本校家庭看到学校版本……如果学校没有编辑和提交，家长根据选课向导生成自己的毕业学分
// 要求，看到蜂巢提供的默认课程地图」).
//
// One blob per school, crm/school-plans/<domain>.json:
//   { domain, draft: { tracks, map }, published: { tracks, map, at, by } | null, updatedAt, updatedBy }
// `tracks` — per graduation track id, the school's requirements where they differ from
//   Hive's: { credits: { math: 4, …, speaking: null }, totalCredits, serviceHours,
//   notes: { en, zh } }; a key missing = Hive's default for that track; a credit null =
//   the row is not required (hidden).
// `map` — per stage (grammar / dialectic / rhetoric) the school's own rows in the
//   snapshot's shape ({ subjects, trackIds, pedagogy, spanAll, cells: { G7: [{en, zh}] } });
//   a stage missing = Hive's default map for that stage.
// The website (assets/app.js) asks /api/school-plan for the PUBLISHED part of the
// signed-in family's school and overlays it; the draft is what the 教育领袖 edits in the
// management centre (#/domain/plan) until they press 发布.
const store = require("./jsonstore");
const { readSnapshot } = require("./blob");

const STAGES = ["grammar", "dialectic", "rhetoric"];
const STAGE_GRADES = { grammar: ["K", "G1", "G2", "G3", "G4", "G5", "G6"], dialectic: ["G7", "G8"], rhetoric: ["G9", "G10", "G11", "G12"] };
const CREDIT_KEYS = ["math", "science", "english", "chinese", "social", "bible", "speaking", "secondLang", "fineArts", "pe", "elective"];
const LIMITS = { rowsPerStage: 80, itemsPerCell: 60, itemText: 200, subjectsPerRow: 3, noteText: 4000 };
const CJK_RE = /[　-〿㐀-䶿一-鿿豈-﫿＀-￯]/;

const blobOf = (domain) => `crm/school-plans/${domain}.json`;
const EMPTY = (domain) => ({ domain, draft: { tracks: {}, map: {} }, published: null, updatedAt: null, updatedBy: "" });

async function readPlan(domain) { return store.read(blobOf(domain), EMPTY(domain)); }

// The same cell grammar as the Airtable sync (api/sync parseMapCell): items split on
// ; ； or a line break, "English / 中文" split at the first slash.
function parseItems(text) {
  return String(text || "").split(/[;；\n\r]+/).map((s) => s.trim()).filter(Boolean).slice(0, LIMITS.itemsPerCell).map((item) => {
    item = item.slice(0, LIMITS.itemText);
    const i = item.indexOf("/");
    if (i === -1) return CJK_RE.test(item) ? { en: null, zh: item } : { en: item, zh: null };
    const en = item.slice(0, i).trim(), zh = item.slice(i + 1).trim();
    return { en: en || null, zh: zh || null };
  });
}
function itemsText(items) { return (items || []).map((it) => (it.en && it.zh ? `${it.en} / ${it.zh}` : it.en || it.zh || "")).filter(Boolean).join("; "); }

// What the editor starts from and the website falls back to.
function defaultsFromSnapshot(snap) {
  const s = snap || {};
  const tracks = (s.tracks || []).filter((t) => t && t.trackId != null && t.trackId !== s.k8TrackId);
  const cm = s.curriculumMap || {};
  const subjects = new Map();
  for (const sub of s.subjects || []) if (sub && (sub.id || sub.nameEn)) subjects.set(sub.id || sub.nameEn, { id: sub.id || null, nameEn: sub.nameEn || "", nameZh: sub.nameZh || "" });
  for (const st of STAGES) for (const r of (cm[st] && cm[st].rows) || []) for (const sub of r.subjects || []) { const k = sub.id || sub.nameEn; if (k && !subjects.has(k)) subjects.set(k, { id: sub.id || null, nameEn: sub.nameEn || "", nameZh: sub.nameZh || "" }); }
  const map = {};
  for (const st of STAGES) map[st] = { grades: (cm[st] && cm[st].grades) || STAGE_GRADES[st], rows: (cm[st] && cm[st].rows) || [] };
  return { tracks, map, subjects: Array.from(subjects.values()).sort((a, b) => a.nameEn.localeCompare(b.nameEn)), k8TrackId: s.k8TrackId || null };
}

const num = (v) => { if (v === null || v === undefined || v === "") return null; const n = Number(v); return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null; };
const str = (v, max) => String(v == null ? "" : v).trim().slice(0, max);

// Validate and normalise what the editor sends. Throws { status: 400, problems }.
// The school's own frame (Rick, 2026-10-19: the system administrator knows each school's pedagogy and
// publishes its default; families choose nothing): pedagogy and the higher-education directions the school
// serves. Absent = classical, international (Rick, 2026-10-19: 「默认古典教育，国际路径」).
const DIRECTIONS = ["international", "domestic", "hybrid"];
function cleanSettings(input) {
  const s = input && typeof input === "object" ? input : {};
  const pedagogy = s.pedagogy === "nonclassical" ? "nonclassical" : "classical";
  const dirs = Array.isArray(s.directions) ? DIRECTIONS.filter((d) => s.directions.includes(d)) : ["international"];
  return { pedagogy, directions: dirs.length ? dirs : ["international"] };
}
function clean(input, defaults) {
  const problems = [];
  const out = { tracks: {}, map: {}, settings: cleanSettings(input && input.settings) };
  const known = new Set((defaults.tracks || []).map((t) => String(t.trackId)));
  const subjById = new Map((defaults.subjects || []).map((s) => [s.id || s.nameEn, s]));
  for (const [tid, tr] of Object.entries((input && input.tracks) || {})) {
    if (!known.has(String(tid))) { problems.push(`unknown graduation track ${tid}`); continue; }
    if (!tr || typeof tr !== "object") continue;
    const credits = {};
    for (const k of CREDIT_KEYS) if (tr.credits && Object.prototype.hasOwnProperty.call(tr.credits, k)) credits[k] = num(tr.credits[k]);
    out.tracks[tid] = { credits, totalCredits: num(tr.totalCredits), serviceHours: num(tr.serviceHours), notes: { en: str(tr.notes && tr.notes.en, LIMITS.noteText), zh: str(tr.notes && tr.notes.zh, LIMITS.noteText) } };
  }
  for (const st of STAGES) {
    const m = input && input.map && input.map[st];
    if (!m || !Array.isArray(m.rows)) continue;
    if (m.rows.length > LIMITS.rowsPerStage) { problems.push(`${st}: more than ${LIMITS.rowsPerStage} rows`); continue; }
    const grades = (defaults.map[st] && defaults.map[st].grades) || STAGE_GRADES[st];
    const rows = [];
    m.rows.forEach((r, i) => {
      if (!r || typeof r !== "object") return;
      const subjects = (Array.isArray(r.subjects) ? r.subjects : []).slice(0, LIMITS.subjectsPerRow).map((sub) => {
        if (typeof sub === "string") { const k = subjById.get(sub); return k ? Object.assign({}, k) : { id: null, nameEn: str(sub, 80), nameZh: str(sub, 80) }; }
        const k = sub && subjById.get(sub.id || sub.nameEn);
        if (k) return Object.assign({}, k);
        const en = str(sub && sub.nameEn, 80), zh = str(sub && sub.nameZh, 80);
        return en || zh ? { id: null, nameEn: en || zh, nameZh: zh || en } : null;
      }).filter(Boolean);
      if (!subjects.length) { problems.push(`${st} row ${i + 1}: no subject`); return; }
      const cells = {};
      for (const g of grades) { const v = r.cells && r.cells[g]; const items = typeof v === "string" ? parseItems(v) : Array.isArray(v) ? v.map((it) => ({ en: str(it && it.en, LIMITS.itemText) || null, zh: str(it && it.zh, LIMITS.itemText) || null })).filter((it) => it.en || it.zh).slice(0, LIMITS.itemsPerCell) : []; if (items.length) cells[g] = items; }
      const trackIds = st === "rhetoric" && Array.isArray(r.trackIds) ? r.trackIds.map(Number).filter((n) => Number.isFinite(n)) : [];
      const pedagogy = st === "dialectic" && (r.pedagogy === "classical" || r.pedagogy === "nonclassical") ? r.pedagogy : null;
      rows.push({ id: str(r.id, 40) || `s-${st}-${i + 1}`, order: i + 1, subjects, trackIds, pedagogy, spanAll: !!r.spanAll, cells });
    });
    out.map[st] = { grades, rows };
  }
  if (problems.length) throw Object.assign(new Error("please check the plan"), { status: 400, problems });
  return out;
}

async function saveDraft(domain, data, by) {
  const at = new Date().toISOString();
  const { doc } = await store.update(blobOf(domain), () => EMPTY(domain), (d) => { d.draft = data; d.updatedAt = at; d.updatedBy = by; });
  return doc;
}
async function publish(domain, by) {
  const at = new Date().toISOString();
  const { doc } = await store.update(blobOf(domain), () => EMPTY(domain), (d) => { d.published = Object.assign({}, d.draft || { tracks: {}, map: {} }, { at, by }); d.updatedAt = at; d.updatedBy = by; });
  return doc;
}
async function unpublish(domain, by) {
  const at = new Date().toISOString();
  const { doc } = await store.update(blobOf(domain), () => EMPTY(domain), (d) => { d.published = null; d.updatedAt = at; d.updatedBy = by; });
  return doc;
}

// What the website gets for a family of `domain`: the published part, or null.
function forFamilies(doc, school) {
  const pub = doc && doc.published;
  if (!pub) return null;
  const hasTracks = Object.keys(pub.tracks || {}).length > 0, hasMap = Object.keys(pub.map || {}).some((k) => pub.map[k] && pub.map[k].rows && pub.map[k].rows.length);
  if (!hasTracks && !hasMap) return null;
  return { domain: doc.domain, school: school || { domain: doc.domain, name: "", nameEn: "" }, tracks: pub.tracks || {}, map: pub.map || {}, publishedAt: pub.at || null };
}

module.exports = { STAGES, STAGE_GRADES, CREDIT_KEYS, LIMITS, DIRECTIONS, cleanSettings, readPlan, readSnapshot, defaultsFromSnapshot, parseItems, itemsText, clean, saveDraft, publish, unpublish, forFamilies };
