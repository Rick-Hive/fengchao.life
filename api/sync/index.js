// POST /api/sync — admin-only (enforced by staticwebapp.config.json route rules,
// re-checked here). Pulls all needed tables from Airtable and writes one
// snapshot JSON to Blob Storage. The public site reads only that snapshot.
const cfg = require("../shared/config");
const { writeSnapshot } = require("../shared/blob");
const { hasRole, getPrincipal } = require("../shared/auth");

const API_ROOT = "https://api.airtable.com/v0";

async function fetchAllRecords(tableId, pat) {
  const records = [];
  let offset;
  do {
    const url = new URL(`${API_ROOT}/${cfg.baseId}/${tableId}`);
    url.searchParams.set("pageSize", "100");
    if (offset) url.searchParams.set("offset", offset);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${pat}` } });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Airtable ${tableId} -> HTTP ${res.status}: ${text.slice(0, 300)}`);
    }
    const data = await res.json();
    records.push(...data.records);
    offset = data.offset;
  } while (offset);
  return records;
}

// A value from a linked-record field is an array of "rec..." ids.
function isRecordIdArray(v) {
  return Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === "string" && x.startsWith("rec"));
}

function resolve(value, idMap) {
  if (isRecordIdArray(value)) return value.map((id) => idMap.get(id) ?? id);
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return null;
  return value;
}

function asArray(v) {
  if (v === null || v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

module.exports = async function (context, req) {
  if (!hasRole(req, "admin")) {
    context.res = { status: 403, body: { error: "admin role required" } };
    return;
  }
  const pat = process.env.AIRTABLE_PAT;
  if (!pat) {
    context.res = { status: 500, body: { error: "AIRTABLE_PAT app setting is not configured" } };
    return;
  }

  try {
    const [trackRecs, courseRecs, subjectRecs, gradeRecs, teacherRecs] = await Promise.all([
      fetchAllRecords(cfg.tables.tracks.id, pat),
      fetchAllRecords(cfg.tables.courses.id, pat),
      fetchAllRecords(cfg.tables.subjects.id, pat),
      fetchAllRecords(cfg.tables.grades.id, pat),
      fetchAllRecords(cfg.tables.teachers.id, pat),
    ]);

    // Global record-id -> display-name map so any linked field can be resolved.
    const idMap = new Map();
    const feed = (recs, displayField) => {
      for (const r of recs) {
        const v = r.fields[displayField];
        idMap.set(r.id, v === undefined || v === null ? r.id : v);
      }
    };
    feed(trackRecs, cfg.tables.tracks.display);     // -> Track ID number
    feed(courseRecs, cfg.tables.courses.display);   // -> course name
    feed(subjectRecs, cfg.tables.subjects.display); // -> subject name
    feed(gradeRecs, cfg.tables.grades.display);     // -> "G9" etc.
    feed(teacherRecs, cfg.tables.teachers.display); // -> teacher display name

    const tf = cfg.trackFields;
    const tracks = trackRecs
      .map((r) => {
        const f = r.fields;
        const credits = {};
        for (const c of tf.credits) credits[c.key] = f[c.field] ?? null;
        return {
          trackId: f[tf.trackId] ?? null,
          name: f[tf.name] ?? "",
          credits,
          totalCredits: f[tf.totalCredits] ?? null,
          serviceHours: f[tf.serviceHours] ?? null,
          comments: f[tf.comments] ?? "",
        };
      })
      .filter((t) => typeof t.trackId === "number" && t.trackId >= 1 && t.trackId <= 6)
      .sort((a, b) => a.trackId - b.trackId);

    const cf = cfg.courseFields;
    const onlyAvailable = process.env.SYNC_ONLY_AVAILABLE === "1";
    let courses = courseRecs.map((r) => {
      const f = r.fields;
      return {
        id: r.id,
        code: f[cf.code] ?? "",
        name: f[cf.name] ?? "",
        description: f[cf.description] ?? "",
        classType: f[cf.classType] ?? "",
        grades: asArray(resolve(f[cf.grades], idMap)),
        language: f[cf.language] ?? "",
        price: typeof f[cf.price] === "number" ? f[cf.price] : null,
        numClasses: f[cf.numClasses] ?? null,
        teachers: asArray(resolve(f[cf.teachers], idMap)),
        classTime: f[cf.classTime] ?? "",
        subjects: asArray(resolve(f[cf.subjects], idMap)),
        trackIds: asArray(resolve(f[cf.tracks], idMap)).filter((n) => typeof n === "number"),
        school: resolve(f[cf.school], idMap),
        available: !!f[cf.available],
      };
    });
    if (onlyAvailable) courses = courses.filter((c) => c.available);

    const subjects = subjectRecs
      .map((r) => r.fields[cfg.tables.subjects.display])
      .filter(Boolean);
    const grades = gradeRecs
      .map((r) => r.fields[cfg.tables.grades.display])
      .filter(Boolean);

    const principal = getPrincipal(req);
    const snapshot = {
      generatedAt: new Date().toISOString(),
      generatedBy: principal ? principal.userDetails : "unknown",
      counts: {
        tracks: tracks.length,
        courses: courses.length,
        subjects: subjects.length,
        grades: grades.length,
        teachers: teacherRecs.length,
      },
      tracks,
      subjects,
      grades,
      courses,
    };

    await writeSnapshot(snapshot);
    context.res = { status: 200, body: { ok: true, generatedAt: snapshot.generatedAt, counts: snapshot.counts } };
  } catch (err) {
    context.log.error("sync failed", err);
    context.res = { status: 502, body: { error: String(err.message || err) } };
  }
};
