// POST /api/sync — admin-only (enforced by staticwebapp.config.json route rules,
// re-checked here). Pulls all 8 tables from Airtable, resolves linked records
// into embedded objects, mirrors attachments (teacher photos, syllabi) into
// blob storage, and writes one snapshot JSON. The public site reads only that
// snapshot — private fields (emails, Teams accounts, contacts, sales data) are
// never written into it.
const cfg = require("../shared/config");
const { writeSnapshot, readSnapshot, writeAsset } = require("../shared/blob");
const { hasRole, getPrincipal } = require("../shared/auth");
const { hiveKey } = require("../shared/hive");

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

// Names a Message Templates table might plausibly have. The configured value
// first, then the CSV-import default, then each half of the bilingual name —
// Airtable shows the name but nothing warns you that it is also an API address.
function templateTableCandidates() {
  const configured = String(cfg.tables.templates.id || "").trim();
  const halves = configured.includes("/") ? configured.split("/").map((s) => s.trim()) : [];
  return [configured, ...halves, "message-templates", "Message Templates", "消息模板"]
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i);
}

// Ask Airtable for the base's real table list. Needs schema.bases:read on the
// PAT; returns null (not an error) when that scope is absent, so the caller
// falls back to guessing names.
async function listBaseTables(pat) {
  try {
    const res = await fetch(`${API_ROOT}/meta/bases/${cfg.baseId}/tables`, {
      headers: { Authorization: `Bearer ${pat}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data.tables) ? data.tables : null;
  } catch (e) {
    return null;
  }
}

// -> { records, found, via, tableNames }
async function findTemplateRecords(pat, context) {
  const candidates = templateTableCandidates();
  const wanted = new Set(candidates.map(norm));

  const tables = await listBaseTables(pat);
  if (tables) {
    const hit = tables.find((t) => wanted.has(norm(t.name)));
    if (hit) {
      try {
        return {
          records: await fetchAllRecords(hit.id, pat),
          found: true,
          via: `metadata → ${hit.name} (${hit.id})`,
          tableNames: tables.map((t) => t.name),
        };
      } catch (e) {
        context.log.warn(`Message templates: found "${hit.name}" but could not read it: ${String(e.message || e).slice(0, 160)}`);
      }
    }
    return { records: [], found: false, via: "metadata (no matching table)", tableNames: tables.map((t) => t.name) };
  }

  // No metadata scope — try addressing each candidate name directly.
  for (const name of candidates) {
    try {
      return {
        records: await fetchAllRecords(encodeURIComponent(name), pat),
        found: true,
        via: `name "${name}"`,
        tableNames: null,
      };
    } catch (e) {
      /* try the next candidate */
    }
  }
  return { records: [], found: false, via: "no candidate name matched", tableNames: null };
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

// Airtable returns most text fields as plain strings, but some field types —
// AI-generated text in particular — come back as an object like
// {state: "generated", value: "...", isStale: false}. Publishing that raw
// renders as "[object Object]" on the site, so every free-text field goes
// through this unwrap before it enters the snapshot.
function asText(v) {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map(asText).filter(Boolean).join(" ");
  if (typeof v === "object") {
    if (typeof v.value === "string") return v.value;
    return v.value === undefined ? "" : asText(v.value);
  }
  return "";
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
  // Warnings raised before the main `warnings` array exists, merged into it below.
  const earlyWarnings = [];

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

    // Message copy is optional: the table may simply not exist yet, and a
    // missing or unreadable one must never fail a sync — the API falls back to
    // the built-in defaults in api/shared/messages.js.
    //
    // Finding it is deliberately forgiving. Addressing a table by name is
    // brittle in ways that are invisible from Airtable's UI: the intended name
    // contains a "/", which does not survive a URL path cleanly, and a table
    // created by importing a CSV is named after the file ("message-templates"),
    // not after whatever the instructions said to call it. So: resolve the real
    // table id through the metadata API when the PAT allows it, and otherwise
    // try each candidate name in turn. The names actually present in the base
    // are reported in the warning, which turns "not readable" from a dead end
    // into a one-glance fix.
    const templateResult = await findTemplateRecords(pat, context);
    const templateRecs = templateResult.records;
    const templatesTableMissing = !templateResult.found;

    /* ---- per-table lookup maps ---- */

    const trackIdByRec = new Map();
    for (const r of trackRecs) {
      const v = f(r.fields, cfg.trackFields.trackId);
      if (typeof v === "number") trackIdByRec.set(r.id, v);
    }

    // A subject resolves to a language pair ({nameEn, nameZh}) rather than one
    // string, because "Subject Name" and "科目" are separate columns. If only
    // one side is filled, it stands in for both so nothing renders blank.
    // Rows with neither name are skipped (the base has a few stray empty rows).
    //
    // "Subject filter" / "学科筛选键值" (added 2026-09-02) let several
    // fine-grained subjects share one coarser filter bucket — e.g. Chinese
    // Literature / Chinese Writing / Chinese Language Art all filter under
    // "Chinese" — without losing their own precise name on the course card.
    // When a row has no filter value set yet, it falls back to its own name,
    // i.e. it is its own filter bucket (today's behaviour, unchanged).
    const sjf = cfg.tables.subjects;
    const subjectByRec = new Map();
    for (const r of subjectRecs) {
      const en = String(f(r.fields, sjf.display) || "").trim();
      const zh = String(f(r.fields, sjf.displayZh) || "").trim();
      if (!en && !zh) continue;
      const nameEn = en || zh;
      const nameZh = zh || en;
      const filterEn = String(f(r.fields, sjf.filterEn) || "").trim() || nameEn;
      const filterZh = String(f(r.fields, sjf.filterZh) || "").trim() || nameZh;
      subjectByRec.set(r.id, {
        nameEn,
        nameZh,
        abbr: String(f(r.fields, sjf.abbr) || "").trim(),
        // Stable filter key (English) + bilingual filter label. Multiple
        // subject rows can share the same filterKey on purpose.
        filterKey: filterEn,
        filterNameEn: filterEn,
        filterNameZh: filterZh,
      });
    }

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
        range: f(r.fields, pf.range) || "",
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
    // Order-delivery routing, keyed the same way api/order groups an order's
    // courses. Deliberately NOT part of the school objects embedded in courses:
    // those are public (see /api/data), and a Teams channel id plus an internal
    // notification address are not. This map is written to snapshot.private.
    const schoolRouting = {};
    for (const r of schoolRecs) {
      const name = String(f(r.fields, sf.name) || "").trim();
      const abbr = String(f(r.fields, sf.abbr) || "").trim();
      schoolByRec.set(r.id, { name, abbr });

      const channelId = String(asText(f(r.fields, sf.teamsChannelId)) || "").trim();
      const notifyEmail = String(asText(f(r.fields, sf.notifyEmail)) || "").trim();
      const key = hiveKey(abbr || name);
      if (!key) continue;
      schoolRouting[key] = { name, abbr, teamsChannelId: channelId, notifyEmail };
      // Warn per missing destination rather than only when both are missing: a
      // blank Teams Channel ID is the one that used to break the flow's post
      // outright, and it is invisible from the order side until an order for
      // that hive arrives.
      if (!channelId && !notifyEmail) {
        earlyWarnings.push(
          `Hive "${name || abbr}" has neither a Teams Channel ID nor a Notify Email — ` +
            "its orders reach the default channel only, and no one there is emailed."
        );
      } else if (!channelId) {
        earlyWarnings.push(
          `Hive "${name || abbr}" has no Teams Channel ID, so its orders are posted ` +
            "to the default channel (flagged as misrouted) instead of its own."
        );
      } else if (!notifyEmail) {
        earlyWarnings.push(
          `Hive "${name || abbr}" has no Notify Email, so it is told about orders ` +
            "in Teams only."
        );
      }
    }

    /* ---- teachers: public profiles + photo mirroring ---- */

    // Every teacher field published below is free text on the public site, but
    // some of them are LINK fields in Airtable, which the API returns as arrays
    // of record ids. Publishing those raw put a bare "recXXXXXXXXXXXXXX" on the
    // teacher card where a name belonged. plainText() flattens a value to
    // display text and drops anything still shaped like a record id, so an
    // unresolved link renders as nothing rather than as an internal id.
    const REC_ID = /^rec[A-Za-z0-9]{10,}$/;
    const plainText = (v) =>
      asArray(v)
        .map((x) => {
          if (x == null) return "";
          if (typeof x === "string") return REC_ID.test(x) ? "" : x;
          if (typeof x === "number" || typeof x === "boolean") return String(x);
          if (typeof x === "object" && typeof x.value === "string") return x.value;
          return "";
        })
        .filter(Boolean)
        .join(", ");
    // "Organization / 所属机构" links to the Schools table, so resolve those ids
    // into real school names instead of merely dropping them.
    const unresolvedOrgIds = new Set();
    const orgNames = (v) =>
      asArray(v)
        .map((x) => {
          if (typeof x !== "string") return "";
          if (!REC_ID.test(x)) return x; // already plain text
          const s = schoolByRec.get(x);
          if (s && (s.name || s.abbr)) return s.name || s.abbr;
          unresolvedOrgIds.add(x);
          return "";
        })
        .filter(Boolean)
        .join(", ");

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
        bio: plainText(f(fields, tef.bio)),
        expertise: plainText(f(fields, tef.expertise)),
        subjects: plainText(f(fields, tef.subjects)),
        languages: plainText(f(fields, tef.languages)),
        courseTypes: plainText(f(fields, tef.courseTypes)),
        gradeLevels: plainText(f(fields, tef.gradeLevels)),
        organization: orgNames(f(fields, tef.organization)),
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
        const nameEn = f(fields, tf.name) ?? "";
        const nameZh = f(fields, tf.nameZh) ?? "";
        return {
          trackId: f(fields, tf.trackId) ?? null,
          nameEn,
          nameZh,
          // Kept for any older consumer that still reads the single `name`
          // field directly (see courseName()-style bilingual pairs elsewhere).
          name: nameEn || nameZh,
          credits,
          totalCredits: f(fields, tf.totalCredits) ?? null,
          serviceHours: f(fields, tf.serviceHours) ?? null,
          // Split 2026-09-04 (Comment / 备注). Read both single-language
          // columns; fall back to the old combined column for a base that has
          // not been split yet. `comments` stays populated for any consumer
          // still reading the single field.
          commentsEn: asText(f(fields, tf.commentsEn)),
          commentsZh: asText(f(fields, tf.commentsZh)),
          comments: asText(f(fields, tf.commentsEn) || f(fields, tf.commentsZh) || f(fields, tf.comments)),
        };
      })
      .filter((t) => typeof t.trackId === "number" && t.trackId >= 1 && t.trackId <= 6)
      .sort((a, b) => a.trackId - b.trackId);

    /* ---- courses ---- */

    const cf = cfg.courseFields;
    const onlyAvailable = process.env.SYNC_ONLY_AVAILABLE === "1";
    let courses = [];
    // Courses whose Teacher link points at a record with no "Name" value, or at
    // a record that no longer exists (deleted from the Teachers table) — either
    // way teacherByRec has nothing usable for that id. Collected here so a
    // single warning can name them, rather than ever showing the raw Airtable
    // record ID as if it were a teacher's name on the public site.
    const danglingTeacherLinks = [];
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
      // Union the two subject link fields by record ID — they normally hold the
      // same record, but reading both means a course tagged on only one of them
      // still gets a subject.
      const subjectIds = [];
      for (const spec of [cf.subjects, cf.subjectsZh]) {
        for (const id of linkedIds(f(fields, spec))) {
          if (subjectIds.indexOf(id) === -1) subjectIds.push(id);
        }
      }
      const course = {
        id: r.id,
        code: f(fields, cf.code) ?? "",
        nameEn: f(fields, cf.nameEn) ?? "",
        nameZh: f(fields, cf.nameZh) ?? "",
        descriptionEn: asText(f(fields, cf.descriptionEn)),
        descriptionZh: asText(f(fields, cf.descriptionZh)),
        classTypeEn: f(fields, cf.classTypeEn) ?? "",
        classTypeZh: f(fields, cf.classTypeZh) ?? "",
        grades: linkedIds(f(fields, cf.grades)).map((id) => gradeByRec.get(id) || id),
        languageEn: f(fields, cf.languageEn) ?? "",
        languageZh: f(fields, cf.languageZh) ?? "",
        price: typeof f(fields, cf.price) === "number" ? f(fields, cf.price) : null,
        numClasses: f(fields, cf.numClasses) ?? null,
        creditHours: typeof f(fields, cf.creditHours) === "number" ? f(fields, cf.creditHours) : null,
        // Never fall back to the raw record id here — an unresolved link (blank
        // Name field, or the linked Teacher record was deleted) is dropped from
        // the public list instead of leaking an internal Airtable id as a name.
        teachers: teacherIds.map((id) => (teacherByRec.get(id) || {}).name || "").filter(Boolean),
        teacherIds,
        // Multiple select -> array of English weekday names; a single select or
        // text value still normalizes to an array so the front end has one shape.
        days: (() => {
          const v = f(fields, cf.daysOfWeek);
          if (Array.isArray(v)) return v.filter(Boolean).map(String);
          return v ? [String(v)] : [];
        })(),
        schedule: linkedIds(f(fields, cf.classTime))
          .map((id) => periodByRec.get(id))
          .filter(Boolean)
          .sort((a, b) => (a.number ?? 99) - (b.number ?? 99)),
        subjects: subjectIds.map((id) => subjectByRec.get(id)).filter(Boolean),
        trackIds: linkedIds(f(fields, cf.tracks))
          .map((id) => trackIdByRec.get(id))
          .filter((n) => typeof n === "number"),
        textbooks: linkedIds(f(fields, cf.textbooks)).map((id) => textbookByRec.get(id)).filter(Boolean),
        school: schoolIds.length ? schoolByRec.get(schoolIds[0]) || null : null,
        prerequisite: asText(f(fields, cf.re.prerequisite)),
        academic: !!f(fields, cf.re.academic),
        // K-8 pedagogy filter source (see cf.re.classical comment above) —
        // blank/missing in Airtable today reads as false (Non-Classical).
        pedagogy: !!f(fields, cf.re.classical),
        comments: asText(f(fields, cf.re.comments)),
        syllabus,
        available: isTruthyAvailable(f(fields, cf.available)),
      };
      if (teacherIds.length && !course.teachers.length) {
        danglingTeacherLinks.push({
          label: (course.code || course.nameEn || course.nameZh || course.id).trim(),
          ids: teacherIds,
        });
      }
      courses.push(course);
    }
    if (onlyAvailable) courses = courses.filter((c) => c.available);

    // Only subjects that at least one course is actually tagged with reach the
    // snapshot. The base carries ~20 aspirational categories plus a handful of
    // stray/typo rows; publishing all of them would put empty options in the
    // site's subject filter. A category appears the moment a course uses it.
    const usedSubjectIds = new Set();
    for (const c of courses) for (const s of c.subjects) if (s && s.nameEn) usedSubjectIds.add(s.nameEn);
    const subjects = [];
    for (const s of subjectByRec.values()) {
      if (usedSubjectIds.has(s.nameEn) && !subjects.some((x) => x.nameEn === s.nameEn)) subjects.push(s);
    }
    // Airtable returns records in an arbitrary order, so the published grade
    // list has to be sorted into curriculum order — consumers treat it as the
    // canonical sequence. Pre-K, then kindergarten, then numbered grades, then
    // anything else (e.g. "Associate of Arts Degree") last, alphabetically.
    const gradeRank = (g) => {
      const s = String(g).trim();
      if (/^pre-?k$/i.test(s)) return 0;
      let m = s.match(/^K\s*(\d+)$/i);
      if (m) return 10 + Number(m[1]);
      m = s.match(/^G\s*(\d+)$/i);
      if (m) return 100 + Number(m[1]);
      return 1000;
    };
    const grades = gradeRecs
      .map((r) => f(r.fields, cfg.tables.grades.display))
      .filter(Boolean)
      .sort((a, b) => gradeRank(a) - gradeRank(b) || String(a).localeCompare(String(b)));

    // Warn when an expected field matched nothing in ANY record — that almost
    // always means the field was renamed in Airtable beyond recognition.
    const warnings = [...earlyWarnings];
    if (courses.length) {
      const checks = [
        ["Course Name", (c) => c.nameEn || c.nameZh],
        ["Course ID", (c) => c.code],
        ["Course Description", (c) => c.descriptionEn || c.descriptionZh],
        ["Class Type", (c) => c.classTypeEn],
        ["课程类型", (c) => c.classTypeZh],
        ["Teaching Language", (c) => c.languageEn],
        ["授课语言", (c) => c.languageZh],
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
    if (unresolvedOrgIds.size) {
      warnings.push(
        "Some teachers' \"Organization / 所属机构\" links point at records that " +
        "aren't in the Schools table, so their organization is left blank " +
        "rather than showing an internal record id: " + [...unresolvedOrgIds].join(", ")
      );
    }
    if (danglingTeacherLinks.length) {
      warnings.push(
        "These courses link to a Teacher record with a blank \"Name\" field, or a Teacher record " +
        "that no longer exists, so no teacher shows on the public site for them — check the Teachers " +
        "table: " + danglingTeacherLinks.map((d) => d.label).join("; ")
      );
    }

    // ---- data problems that affect which catalog a course lands in ----------
    // The site splits the catalog at G8/G9. A course tagged on both sides of
    // that line has to appear in both the K-8 and the high-school catalog,
    // which is almost always a tagging mistake rather than a real offering —
    // a course does not run from middle school through to Grade 12. Flag them
    // by name so they can be corrected at the source.
    const label = (c) => (c.code || c.nameEn || c.nameZh || c.id || "?").trim();
    // Teacher Training courses are for teachers, not students placed by grade —
    // spanning both sides of the G8/G9 line is expected for them, not a
    // tagging mistake, so they're excluded from this check entirely.
    const isTeacherTraining = (c) => (c.subjects || []).some((s) => s && s.nameEn === "Teacher Training");
    const crossLevel = courses.filter((c) => {
      if (isTeacherTraining(c)) return false;
      const ranks = (c.grades || []).map(gradeRank);
      return ranks.some((r) => r <= 108) && ranks.some((r) => r >= 109);
    });
    if (crossLevel.length) {
      warnings.push(
        "These courses are tagged with grades on both sides of the G8/G9 line, " +
        "so they appear in both the K-8 and the high-school catalog — " +
        "usually a grade-tagging mistake worth correcting: " +
        crossLevel.map((c) => `${label(c)} (${(c.grades || []).join(", ")})`).join("; ")
      );
    }
    // No grades at all means the level can only be guessed from the course
    // code, so these are worth tagging properly too.
    const noGrades = courses.filter((c) => !(c.grades || []).length);
    if (noGrades.length) {
      warnings.push(
        `${noGrades.length} course(s) have no Grade tagged, so the site places them by course code alone: ` +
        noGrades.map(label).join("; ")
      );
    }
    // The two halves of a split bilingual field should describe the same thing.
    const CLASS_TYPE_PAIRS = {
      "live course": "直播课",
      "prerecorded course": "录播课",
      "self-paced course": "自定义进度课程",
      "live or recorded course": "直播或录播课",
    };
    const mismatched = courses.filter((c) => {
      const en = String(c.classTypeEn || "").replace(/[‐-―−－]/g, "-").trim().toLowerCase();
      const expect = CLASS_TYPE_PAIRS[en];
      return expect && c.classTypeZh && String(c.classTypeZh).trim() !== expect;
    });
    if (mismatched.length) {
      warnings.push(
        'These courses have "Class Type" and "课程类型" that disagree, so the site labels them ' +
        "differently in each language: " +
        mismatched.map((c) => `${label(c)} (${c.classTypeEn} / ${c.classTypeZh})`).join("; ")
      );
    }

    /* ---- message copy: one row per (key, language) ---- */

    // Shaped as { key: { zh: {subject, body}, en: {...} } } so the API can look
    // up exactly what it needs without scanning. Rows with an unrecognized
    // language or a blank key are skipped and reported as warnings rather than
    // silently ignored — a typo'd language code would otherwise mean a parent
    // quietly receives the English default.
    const mtf = cfg.templateFields;
    const messageTemplates = {};
    for (const r of templateRecs) {
      const key = String(f(r.fields, mtf.key) || "").trim();
      const langRaw = String(f(r.fields, mtf.language) || "").trim().toLowerCase();
      if (!key) continue;
      const lang = /^(zh|中文|chinese|cn)/.test(langRaw)
        ? "zh"
        : /^(en|英文|english)/.test(langRaw)
        ? "en"
        : "";
      if (!lang) {
        warnings.push(
          `Message template "${key}" has an unrecognized Language value ` +
            `("${langRaw}") and was skipped — use zh or en.`
        );
        continue;
      }
      if (!messageTemplates[key]) messageTemplates[key] = {};
      messageTemplates[key][lang] = {
        subject: String(f(r.fields, mtf.subject) || "").trim(),
        body: String(f(r.fields, mtf.body) || "").trim(),
      };
    }
    if (templatesTableMissing) {
      // Say what was looked for AND what is actually there — a name mismatch is
      // the likeliest cause and is otherwise invisible from the sync result.
      const seen = templateResult.tableNames
        ? ` Tables in this base: ${templateResult.tableNames.map((n) => `"${n}"`).join(", ")}.`
        : " (Could not list the base's tables — the Airtable token lacks the schema.bases:read scope.)";
      warnings.push(
        `No message-templates table was readable (${templateResult.via}), so the ` +
          "order confirmation email and Teams message use the built-in default wording. " +
          `Looked for: ${templateTableCandidates().map((n) => `"${n}"`).join(", ")}.${seen}`
      );
    } else if (Object.keys(messageTemplates).length) {
      const rows = Object.entries(messageTemplates)
        .map(([k, v]) => `${k} [${Object.keys(v).sort().join(", ")}]`)
        .join("; ");
      context.log(`Message templates loaded via ${templateResult.via}: ${rows}`);
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
      messageTemplates,
      // PRIVATE — stripped by /api/data before the snapshot reaches a browser.
      // Anything secret or internal belongs under this key and nowhere else.
      private: { schoolRouting },
    };

    // ---- guard against a destructive sync ---------------------------------
    // Because the snapshot is replaced whole, a transient Airtable problem (an
    // expired token, a view filtered down to nothing, a table renamed) would
    // otherwise publish an empty or gutted catalog over a good one. Compare
    // against what is currently live and refuse anything that looks like data
    // loss rather than an edit. `?force=1` overrides, for the legitimate case
    // where the catalog really did shrink.
    const force = String((req.query && req.query.force) || "") === "1";
    if (!force) {
      let live = null;
      try { live = await readSnapshot(); } catch (e) { /* first ever sync */ }
      const before = (live && live.counts) || null;
      if (before) {
        const loss = [];
        for (const key of ["tracks", "courses", "grades", "teachers"]) {
          const was = before[key] || 0;
          const now = snapshot.counts[key] || 0;
          if (was >= 5 && now === 0) loss.push(`${key}: ${was} → 0`);
          else if (was >= 20 && now < was * 0.5) loss.push(`${key}: ${was} → ${now}`);
        }
        if (loss.length) {
          context.res = {
            status: 409,
            body: {
              error: "Sync refused: this would remove a large part of the catalog.",
              detail: loss,
              hint: "Check the Airtable base and the API token, then retry. If the catalog really did shrink this much, re-run with ?force=1.",
              counts: { before, after: snapshot.counts },
            },
          };
          return;
        }
      }
    }

    await writeSnapshot(snapshot);
    context.res = { status: 200, body: { ok: true, generatedAt: snapshot.generatedAt, counts: snapshot.counts, warnings, forced: force || undefined } };
  } catch (err) {
    context.log.error("sync failed", err);
    context.res = { status: 502, body: { error: String(err.message || err) } };
  }
};
