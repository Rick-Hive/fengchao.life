// POST /api/sync — admin-only (enforced by staticwebapp.config.json route rules,
// re-checked here). Pulls all 8 tables from Airtable, resolves linked records
// into embedded objects, mirrors attachments (teacher photos, syllabi) into
// blob storage, and writes one snapshot JSON. The public site reads only that
// snapshot — private fields (emails, Teams accounts, contacts, sales data) are
// never written into it.
const cfg = require("../shared/config");
const { writeSnapshot, writeAsset } = require("../shared/blob");
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

// Normalize a field name: lowercase, strip all whitespace (incl. full-width),
// unify full-width slash/question mark. Makes matching immune to invisible
// renames like trailing spaces or full-width punctuation.
function norm(s) {
  return String(s)
    .toLowerCase()
    .replace(/[\s 　]+/g, "")
    .replace(/／/g, "/")
    .replace(/？/g, "?");
}

// Get a field's value by exact name (string, with normalized fallback matching)
// or regex. String specs like "Course Name/课程名称" fall back to matching the
// English part, then the Chinese part, against normalized record keys.
function f(fields, spec) {
  if (spec instanceof RegExp) {
    for (const k of Object.keys(fields)) if (spec.test(k)) return fields[k];
    return undefined;
  }
  if (Object.prototype.hasOwnProperty.call(fields, spec)) return fields[spec];
  const n = norm(spec);
  const parts = n.split("/");
  const en = parts[0] || "";
  const zh = parts[1] || "";
  const keys = Object.keys(fields).sort();
  for (const k of keys) if (norm(k) === n) return fields[k];
  if (en) for (const k of keys) if (norm(k).startsWith(en)) return fields[k];
  for (const k of keys) {
    const nk = norm(k);
    if ((en && nk.includes(en)) || (zh && nk.includes(zh))) return fields[k];
  }
  return undefined;
}

function isRecordIdArray(v) {
  return Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === "string" && x.startsWith("rec"));
}

function asArray(v) {
  if (v === null || v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

function linkedIds(v) {
  return isRecordIdArray(v) ? v : [];
}

function isTruthyAvailable(v) {
  if (v === undefined || v === null || v === "") return true; // unset -> include
  if (typeof v === "boolean") return v;
  return /^(yes|y|true|1|是|可用)/i.test(String(v).trim());
}

// Mirror one Airtable attachment to blob storage; returns the asset key or null.
async function mirrorAttachment(att, key, log) {
  try {
    const res = await fetch(att.url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 15 * 1024 * 1024) throw new Error("file too large (>15MB)");
    await writeAsset(key, buf, att.type || "application/octet-stream");
    return key;
  } catch (err) {
    log(`asset mirror failed for ${key}: ${err.message || err}`);
    return null;
  }
}

function extFromAttachment(att) {
  const m = /\.([A-Za-z0-9]{1,8})$/.exec(att.filename || "");
  if (m) return "." + m[1].toLowerCase();
  const map = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "application/pdf": ".pdf" };
  return map[att.type] || "";
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
  const log = (m) => context.log(m);

  try {
    const [trackRecs, courseRecs, subjectRecs, gradeRecs, teacherRecs, periodRecs, textbookRecs, schoolRecs] =
      await Promise.all([
        fetchAllRecords(cfg.tables.tracks.id, pat),
        fetchAllRecords(cfg.tables.courses.id, pat),
        fetchAllRecords(cfg.tables.subjects.id, pat),
        fetchAllRecords(cfg.tables.grades.id, pat),
        fetchAllRecords(cfg.tables.teachers.id, pat),
        fetchAllRecords(cfg.tables.classPeriods.id, pat),
        fetchAllRecords(cfg.tables.textbooks.id, pat),
        fetchAllRecords(cfg.tables.schools.id, pat),
      ]);

    /* ---- per-table lookup maps ---- */

    const trackIdByRec = new Map();
    for (const r of trackRecs) {
      const v = f(r.fields, cfg.trackFields.trackId);
      if (typeof v === "number") trackIdByRec.set(r.id, v);
    }

    const subjectByRec = new Map();
    for (const r of subjectRecs) subjectByRec.set(r.id, f(r.fields, cfg.tables.subjects.display) || r.id);

    const gradeByRec = new Map();
    for (const r of gradeRecs) gradeByRec.set(r.id, f(r.fields, cfg.tables.grades.display) || r.id);

    const pf = cfg.classPeriodFields;
    const periodByRec = new Map();
    for (const r of periodRecs) {
      periodByRec.set(r.id, {
        number: f(r.fields, pf.number) ?? null,
        title: f(r.fields, pf.title) || "",
        shortName: f(r.fields, pf.shortName) || "",
        start: f(r.fields, pf.start) || "",
        end: f(r.fields, pf.end) || "",
        minutes: f(r.fields, pf.minutes) ?? null,
      });
    }

    const xf = cfg.textbookFields;
    const textbookByRec = new Map();
    for (const r of textbookRecs) {
      textbookByRec.set(r.id, {
        sku: f(r.fields, xf.sku) || "",
        nameEn: f(r.fields, xf.nameEn) || "",
        nameZh: f(r.fields, xf.nameZh) || "",
        price: typeof f(r.fields, xf.price) === "number" ? f(r.fields, xf.price) : null,
      });
    }

    const sf = cfg.schoolFields;
    const schoolByRec = new Map();
    for (const r of schoolRecs) {
      schoolByRec.set(r.id, {
        name: f(r.fields, sf.name) || "",
        abbr: f(r.fields, sf.abbr) || "",
      });
    }

    /* ---- teachers: public profiles + photo mirroring ---- */

    const tef = cfg.teacherFields;
    const teacherByRec = new Map();
    const teacherProfiles = [];
    for (const r of teacherRecs) {
      const fields = r.fields;
      const name = f(fields, tef.name) || "";
      let photo = null;
      const photos = f(fields, tef.photo);
      if (Array.isArray(photos) && photos.length > 0) {
        const att = photos[0];
        photo = await mirrorAttachment(att, `teachers/${r.id}${extFromAttachment(att)}`, log);
      }
      const profile = {
        id: r.id,
        teacherId: f(fields, tef.id) || "",
        name,
        photo, // asset key or null
        bio: f(fields, tef.bio) || "",
        expertise: f(fields, tef.expertise) || "",
        subjects: f(fields, tef.subjects) || "",
        languages: f(fields, tef.languages) || "",
        courseTypes: f(fields, tef.courseTypes) || "",
        gradeLevels: f(fields, tef.gradeLevels) || "",
        organization: f(fields, tef.organization) || "",
      };
      teacherByRec.set(r.id, profile);
      teacherProfiles.push(profile);
    }

    /* ---- tracks (1–6 real graduation tracks; the K–G8 tag track is excluded
            from the requirements list but its id still appears on courses) ---- */

    const tf = cfg.trackFields;
    const tracks = trackRecs
      .map((r) => {
        const fields = r.fields;
        const credits = {};
        for (const c of tf.credits) credits[c.key] = f(fields, c.field) ?? null;
        return {
          trackId: f(fields, tf.trackId) ?? null,
          name: f(fields, tf.name) ?? "",
          credits,
          totalCredits: f(fields, tf.totalCredits) ?? null,
          serviceHours: f(fields, tf.serviceHours) ?? null,
          comments: f(fields, tf.comments) ?? "",
        };
      })
      .filter((t) => typeof t.trackId === "number" && t.trackId >= 1 && t.trackId <= 6)
      .sort((a, b) => a.trackId - b.trackId);

    /* ---- courses ---- */

    const cf = cfg.courseFields;
    const onlyAvailable = process.env.SYNC_ONLY_AVAILABLE === "1";
    let courses = [];
    for (const r of courseRecs) {
      const fields = r.fields;

      // syllabus attachments -> mirrored assets
      const syllabus = [];
      const sylAtts = f(fields, cf.re.syllabus);
      if (Array.isArray(sylAtts)) {
        for (let i = 0; i < sylAtts.length && i < 5; i++) {
          const att = sylAtts[i];
          const key = await mirrorAttachment(att, `syllabus/${r.id}-${i}${extFromAttachment(att)}`, log);
          if (key) syllabus.push({ key, filename: att.filename || `syllabus-${i + 1}` });
        }
      }

      const teacherIds = linkedIds(f(fields, cf.teachers));
      const schoolIds = linkedIds(f(fields, cf.school));
      const course = {
        id: r.id,
        code: f(fields, cf.code) ?? "",
        nameEn: f(fields, cf.nameEn) ?? "",
        nameZh: f(fields, cf.nameZh) ?? "",
        description: f(fields, cf.description) ?? "",
        classType: f(fields, cf.classType) ?? "",
        grades: linkedIds(f(fields, cf.grades)).map((id) => gradeByRec.get(id) || id),
        language: f(fields, cf.language) ?? "",
        price: typeof f(fields, cf.price) === "number" ? f(fields, cf.price) : null,
        numClasses: f(fields, cf.numClasses) ?? null,
        teachers: teacherIds.map((id) => (teacherByRec.get(id) || {}).name || id),
        teacherIds,
        schedule: linkedIds(f(fields, cf.classTime))
          .map((id) => periodByRec.get(id))
          .filter(Boolean)
          .sort((a, b) => (a.number ?? 99) - (b.number ?? 99)),
        subjects: linkedIds(f(fields, cf.subjects)).map((id) => subjectByRec.get(id) || id),
        trackIds: linkedIds(f(fields, cf.tracks))
          .map((id) => trackIdByRec.get(id))
          .filter((n) => typeof n === "number"),
        textbooks: linkedIds(f(fields, cf.textbooks)).map((id) => textbookByRec.get(id)).filter(Boolean),
        school: schoolIds.length ? schoolByRec.get(schoolIds[0]) || null : null,
        prerequisite: f(fields, cf.re.prerequisite) || "",
        academic: !!f(fields, cf.re.academic),
        // K-8 pedagogy filter source (see cf.re.classical comment above) —
        // blank/missing in Airtable today reads as false (Non-Classical).
        pedagogy: !!f(fields, cf.re.classical),
        comments: f(fields, cf.re.comments) || "",
        syllabus,
        available: isTruthyAvailable(f(fields, cf.available)),
      };
      courses.push(course);
    }
    if (onlyAvailable) courses = courses.filter((c) => c.available);

    const subjects = subjectRecs.map((r) => f(r.fields, cfg.tables.subjects.display)).filter(Boolean);
    const grades = gradeRecs.map((r) => f(r.fields, cfg.tables.grades.display)).filter(Boolean);

    // Warn when an expected field matched nothing in ANY record — that almost
    // always means the field was renamed in Airtable beyond recognition.
    const warnings = [];
    if (courses.length) {
      const checks = [
        ["Course Name", (c) => c.nameEn || c.nameZh],
        ["Course ID", (c) => c.code],
        ["Course Description", (c) => c.description],
        ["Class Type", (c) => c.classType],
        ["Teaching Language", (c) => c.language],
        ["Course Price", (c) => typeof c.price === "number"],
        ["Grade", (c) => c.grades.length],
        ["Subject", (c) => c.subjects.length],
        ["Graduation Track", (c) => c.trackIds.length],
        ["Teacher", (c) => c.teachers.length],
        ["Class time", (c) => c.schedule.length],
      ];
      for (const [label, get] of checks) {
        if (!courses.some(get)) warnings.push(`No course has a value for "${label}" — check that field's name in Airtable.`);
      }
    }
    if (teacherProfiles.length && !teacherProfiles.some((p) => p.name)) {
      warnings.push('No teacher has a value for "Name" — check the Teachers table field names.');
    }

    const principal = getPrincipal(req);
    const snapshot = {
      generatedAt: new Date().toISOString(),
      generatedBy: principal ? principal.userDetails : "unknown",
      k8TrackId: cfg.k8TrackId,
      counts: {
        tracks: tracks.length,
        courses: courses.length,
        subjects: subjects.length,
        grades: grades.length,
        teachers: teacherProfiles.length,
        classPeriods: periodRecs.length,
        textbooks: textbookRecs.length,
        schools: schoolRecs.length,
      },
      tracks,
      subjects,
      grades,
      teacherProfiles,
      courses,
    };

    await writeSnapshot(snapshot);
    context.res = { status: 200, body: { ok: true, generatedAt: snapshot.generatedAt, counts: snapshot.counts, warnings } };
  } catch (err) {
    context.log.error("sync failed", err);
    context.res = { status: 502, body: { error: String(err.message || err) } };
  }
};
