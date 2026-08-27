/* fengchao.life K-12 wizard. Data comes from /api/data (admin-synced snapshot). */
(function () {
  "use strict";

  var TRACK_MAP = {
    international: { classical: 1, nonclassical: 2 },
    domestic: { classical: 3, nonclassical: 4 },
    hybrid: { classical: 5, nonclassical: 6 },
  };

  // Keep in sync with BLOCKED_EMAIL_DOMAINS in api/order/index.js.
  var BLOCKED_EMAIL_DOMAINS = [
    "qq.com", "vip.qq.com", "foxmail.com",
    "163.com", "vip.163.com", "126.com", "vip.126.com", "yeah.net", "188.com",
    "sina.com", "sina.cn", "vip.sina.com",
    "sohu.com", "tom.com", "21cn.com", "aliyun.com",
    "139.com", "189.cn", "wo.cn", "wo.com.cn",
  ];

  // Internal steps: 0 level · 1 mode · 2 pedagogy · 3 requirements · 4 catalog · 5 order
  var state = {
    lang: "zh",
    step: 0,
    level: null,      // k8 | hs
    mode: null,       // international | domestic | hybrid
    pedagogy: null,   // classical | nonclassical
    data: null,       // snapshot
    filters: { subject: "", grade: "", language: "", classType: "", q: "" },
    cart: {},         // courseId -> true
    done: null,       // {orderId}
    submitting: false,
    formErr: "",
    email: "",
    teams: "",
  };

  try {
    var saved = localStorage.getItem("fc-lang");
    if (saved === "en" || saved === "zh") state.lang = saved;
  } catch (e) {}

  function t() { return window.I18N[state.lang]; }
  function k8Id() { return (state.data && state.data.k8TrackId) || 7; }
  function trackId() {
    if (state.level === "k8") return k8Id();
    return state.mode && state.pedagogy ? TRACK_MAP[state.mode][state.pedagogy] : null;
  }
  function track() {
    var id = trackId();
    if (!id || !state.data) return null;
    for (var i = 0; i < state.data.tracks.length; i++)
      if (state.data.tracks[i].trackId === id) return state.data.tracks[i];
    return null;
  }
  function teacherByName(name) {
    var list = (state.data && state.data.teacherProfiles) || [];
    for (var i = 0; i < list.length; i++) if (list[i].name === name) return list[i];
    return null;
  }
  function teacherById(id) {
    var list = (state.data && state.data.teacherProfiles) || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function fmtPrice(p) {
    if (typeof p !== "number") return null;
    return "¥" + p.toLocaleString("zh-CN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }
  function fmtTime(s) {
    // "08:15 AM" -> "08:15"; "01:15 PM" -> "13:15"; anything else returned as-is
    var m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(String(s || "").trim());
    if (!m) return s || "";
    var h = parseInt(m[1], 10) % 12;
    if (/pm/i.test(m[3])) h += 12;
    return (h < 10 ? "0" : "") + h + ":" + m[2];
  }
  // Days-of-week isn't a field in Airtable yet (checked both Course and Class
  // Periods tables, 2026-08-27) — this reads it defensively (p.days / p.day)
  // so the moment that field is added to Class Periods and wired into
  // classPeriodFields in api/shared/config.js, it appears here automatically,
  // combined with the time on the same line rather than a separate row.
  function periodDays(p) {
    var d = p.days || p.day || "";
    return Array.isArray(d) ? d.join("、") : d;
  }

  function schedShort(c) {
    var sch = c.schedule || [];
    if (!sch.length) return "";
    return sch.map(function (p) {
      var tm = p.start ? fmtTime(p.start) + (p.end ? "–" + fmtTime(p.end) : "") : "";
      var days = periodDays(p);
      return (p.shortName || p.title || "") + (days ? " " + days : "") + (tm ? " " + tm : "");
    }).join(" · ");
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // ---- bilingual field helpers -------------------------------------------
  // Class Type, Teaching Language and Subject are each two Airtable columns
  // (English + Chinese). Show whichever matches the page language, falling
  // back to the other when one side is blank.
  function pickLang(en, zh) {
    return state.lang === "zh" ? (zh || en || "") : (en || zh || "");
  }
  function classTypeOf(c) { return pickLang(c.classTypeEn, c.classTypeZh); }
  function languageOf(c) { return pickLang(c.languageEn, c.languageZh); }
  function subjectLabel(s) {
    if (!s) return "";
    // A few subjects read better as their English acronym in Chinese too.
    var over = (window.SUBJECT_LABEL_ZH || {})[s.nameEn];
    if (state.lang === "zh" && over) return over;
    return pickLang(s.nameEn, s.nameZh);
  }
  // Stable, language-independent key — filter values must survive a language
  // toggle, so they key off the English name, never the displayed label.
  function subjectKey(s) { return s ? String(s.nameEn || s.nameZh || "") : ""; }
  function subjectLabels(c) {
    return (c.subjects || []).map(subjectLabel).filter(Boolean);
  }

  // ---- grade stages (see window.GRADE_STAGES in i18n.js) ------------------
  // The grade filter offers 幼儿/小学/初中/高中/大学预科 instead of 17 individual
  // grades. A grade that isn't in any stage becomes its own option keyed by
  // its raw name, so nothing is ever filtered out of existence.
  var GRADE_STAGE_OF = {};
  (window.GRADE_STAGES || []).forEach(function (s) {
    s.members.forEach(function (m) { GRADE_STAGE_OF[m] = s.key; });
  });
  function gradeStageOf(g) { return GRADE_STAGE_OF[g] || g; }
  function gradeStageLabel(key) {
    var stages = window.GRADE_STAGES || [];
    for (var i = 0; i < stages.length; i++) {
      if (stages[i].key === key) return pickLang(stages[i].en, stages[i].zh);
    }
    return key; // an unmapped grade, labelled by its own name
  }

  // Preferred order for the subject filter, per CEFF's course taxonomy.
  // Anything not listed still appears — appended alphabetically — so a newly
  // tagged category is never silently hidden.
  var SUBJECT_ORDER = [
    "Math", "Chinese", "English", "Science",
    "Social Studies", "Social Science", "ESL", "Bible/Theology",
  ];

  // Older snapshots (before the 2026-08-27 field split) carry `classType`,
  // `language` and plain-string `subjects`. Deploying the front-end and the
  // sync function out of step used to produce blank fields; normalizing on
  // load means a stale snapshot degrades to single-language text instead.
  function normalizeCourse(c) {
    if (c.classTypeEn === undefined && c.classTypeZh === undefined) {
      c.classTypeEn = c.classTypeZh = c.classType || "";
    }
    if (c.languageEn === undefined && c.languageZh === undefined) {
      c.languageEn = c.languageZh = c.language || "";
    }
    c.subjects = (c.subjects || []).map(function (s) {
      return typeof s === "string" ? { nameEn: s, nameZh: s, abbr: "" } : s;
    }).filter(Boolean);
    return c;
  }

  // When a course spans more than 3 grades, show a compact range chip
  // (e.g. "G1–G8") instead of one chip per grade.
  function gradeRangeLabel(grades) {
    var order = (state.data && state.data.grades) || [];
    var sorted = grades.slice().sort(function (a, b) {
      var ia = order.indexOf(a), ib = order.indexOf(b);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });
    return sorted[0] + "–" + sorted[sorted.length - 1];
  }

  // Airtable's values contain a Unicode minus (U+2212) rather than a hyphen in
  // "Self−Paced Course", and course codes do the same, so every comparison
  // normalizes dash variants plus case and spacing. Original values are still
  // what gets stored and displayed — only the comparison is normalized.
  function dashNorm(v) {
    return String(v || "").replace(/[‐-―−－]/g, "-").replace(/\s+/g, " ").trim();
  }
  function classTypeRank(v) { return dashNorm(v).toLowerCase(); }

  // Which grade stages belong to which school level.
  var K8_STAGES = { preschool: 1, elementary: 1, middle: 1 };
  var HS_STAGES = { high: 1, "college-prep": 1 };

  // Level inferred from the course code's middle segment. Every code in the base
  // carries one (KG/EL/MS/HS/CLP) and it never contradicts the grades, so it is
  // a safe fallback for the handful of courses with no grade tagged — without it
  // those courses would belong to no level and disappear from both catalogs.
  function levelFromCode(code) {
    var m = dashNorm(code).toUpperCase().match(/-(KG|EL|MS|HS|CLP)-/);
    if (!m) return null;
    return m[1] === "HS" || m[1] === "CLP" ? "hs" : "k8";
  }

  // Each catalog shows only courses for the level the parent picked: K-8 never
  // shows high-school courses and vice versa. Grades decide, falling back to the
  // course code when a course has none. A course genuinely spanning the boundary
  // (e.g. tagged G8 and G9) legitimately appears in both.
  //
  // Level was previously inferred from a 7th "N/A" graduation track, which was
  // deleted from the base on 2026-08-27, silently emptying the whole K-8
  // catalog; the old track tag is still honoured in case it ever returns.
  function courseInLevel(c, level) {
    if (level === "k8") {
      var k8Track = state.data && state.data.k8TrackId;
      if (k8Track && c.trackIds && c.trackIds.indexOf(k8Track) !== -1) return true;
    }
    var stages = level === "k8" ? K8_STAGES : HS_STAGES;
    var grades = c.grades || [];
    if (grades.length) {
      return grades.some(function (g) { return stages[gradeStageOf(g)]; });
    }
    return levelFromCode(c.code) === level;
  }

  function trackCourses() {
    if (!state.data) return [];
    var list;
    if (state.level === "k8") {
      list = state.data.courses.filter(function (c) { return courseInLevel(c, "k8"); });
      // HS pedagogy is baked into which of the 6 tracks was picked; K-8 has no
      // track dimension, so it filters on the per-course "Classical" checkbox.
      // That Airtable field does not exist yet, so every course currently reads
      // as Non-Classical — the correct default. Guard against it wiping the
      // catalog: if nothing at all is tagged Classical, the checkbox isn't in
      // use yet and pedagogy simply doesn't narrow anything.
      var anyClassical = state.data.courses.some(function (c) { return !!c.pedagogy; });
      if (anyClassical) {
        var wantClassical = state.pedagogy === "classical";
        list = list.filter(function (c) { return !!c.pedagogy === wantClassical; });
      }
      return list;
    }
    var id = trackId();
    if (!id) return [];
    // The track tags alone are not enough: every course in the base is tagged to
    // the hybrid tracks, elementary ones included, so the high-school catalog
    // also requires a high-school grade.
    return state.data.courses.filter(function (c) {
      return c.trackIds && c.trackIds.indexOf(id) !== -1 && courseInLevel(c, "hs");
    });
  }

  function haystack(c) {
    if (!c._hay) {
      // Teaching language is deliberately excluded here: most K-8 courses are
      // taught in Chinese regardless of subject, so including it made a
      // "chinese" search match nearly the whole catalog instead of just
      // Chinese-subject courses. Language has its own filter dropdown already.
      c._hay = [
        c.nameEn, c.nameZh, c.code, c.description,
        c.classTypeEn, c.classTypeZh,
        (c.subjects || []).map(function (s) { return s.nameEn + " " + s.nameZh; }).join(" "),
        (c.grades || []).join(" "),
        (c.teachers || []).join(" "),
        c.school && c.school.name ? c.school.name + " " + (c.school.abbr || "") : "",
      ].join(" ").toLowerCase();
    }
    return c._hay;
  }

  function filteredCourses() {
    var f = state.filters;
    var terms = (f.q || "").trim().toLowerCase().split(/\s+/).filter(Boolean);
    var list = trackCourses().filter(function (c) {
      // Subject / language / class-type filters compare stable English keys, so
      // an active filter keeps working when the page language is toggled.
      if (f.subject && !(c.subjects || []).some(function (s) { return subjectKey(s) === f.subject; })) return false;
      if (f.grade && !(c.grades || []).some(function (g) { return gradeStageOf(g) === f.grade; })) return false;
      if (f.language && c.languageEn !== f.language) return false;
      // Rank-compared, not string-compared: the filter key uses a plain hyphen
      // ("Self-Paced Course") while Airtable stores a Unicode minus.
      if (f.classType && classTypeRank(c.classTypeEn) !== classTypeRank(f.classType)) return false;
      if (terms.length) {
        var hay = haystack(c);
        for (var i = 0; i < terms.length; i++) if (hay.indexOf(terms[i]) === -1) return false;
      }
      return true;
    });
    list.sort(function (a, b) {
      var pa = typeof a.price === "number" ? a.price : Infinity;
      var pb = typeof b.price === "number" ? b.price : Infinity;
      return pa - pb;
    });
    return list;
  }

  function cartIds() { return Object.keys(state.cart); }
  // Course Name is two separate Airtable fields (English + Chinese, split
  // 2026-08-27) — show whichever matches the page language, falling back to
  // the other if that one is blank.
  function courseName(c) {
    if (!c) return "";
    return state.lang === "zh" ? (c.nameZh || c.nameEn || "") : (c.nameEn || c.nameZh || "");
  }

  function courseById(id) {
    var cs = state.data ? state.data.courses : [];
    for (var i = 0; i < cs.length; i++) if (cs[i].id === id) return cs[i];
    return null;
  }
  function cartCourses() {
    return cartIds().map(courseById).filter(Boolean);
  }
  function cartTotal() {
    return cartCourses().reduce(function (s, c) {
      return s + (typeof c.price === "number" ? c.price : 0);
    }, 0);
  }

  /* ---------- rendering ---------- */

  var app = document.getElementById("app");

  function visibleSteps() {
    // [label array, list of internal steps]
    // K-8 reuses the same internal Pedagogy step (2) as HS — it has no
    // Graduation Track (1) or Requirements (3) step, since those are HS-only.
    if (state.level === "k8") return { labels: t().stepsK8, map: [0, 2, 4, 5] };
    return { labels: t().steps, map: [0, 1, 2, 3, 4, 5] };
  }

  function renderStepper() {
    var el = document.getElementById("stepper");
    var vs = visibleSteps();
    var html = "";
    for (var i = 0; i < vs.map.length; i++) {
      if (i > 0) html += '<span class="step-sep">›</span>';
      var internal = vs.map[i];
      var cls = internal === state.step ? "active" : internal < state.step ? "done" : "";
      html += '<div class="step-item ' + cls + '"><span class="dot">' + (i + 1) + '</span><span class="lbl">' + esc(vs.labels[i]) + "</span></div>";
    }
    el.innerHTML = html;
  }

  function choiceCard(key, name, desc, selected) {
    return (
      '<button class="choice-card' + (selected ? " selected" : "") + '" data-key="' + key + '" type="button">' +
      '<div class="hex"><svg width="26" height="26" viewBox="0 0 32 32"><polygon points="16,2 28,9 28,23 16,30 4,23 4,9" fill="currentColor"></polygon></svg></div>' +
      "<h3>" + esc(name) + "</h3><p>" + esc(desc) + "</p></button>"
    );
  }

  function renderStep0() {
    var l = t().levels;
    return (
      '<section class="panel"><h2>' + esc(t().step0Title) + '</h2><p class="hint">' + esc(t().step0Hint) + "</p>" +
      '<div class="choice-grid choice-grid-2" id="levelGrid">' +
      choiceCard("k8", l.k8.name, l.k8.desc, state.level === "k8") +
      choiceCard("hs", l.hs.name, l.hs.desc, state.level === "hs") +
      "</div>" +
      '<div class="nav-row"><span></span><button class="btn btn-primary" id="next0" ' + (state.level ? "" : "disabled") + ">" + esc(t().nextStep) + "</button></div></section>"
    );
  }

  function renderStep1() {
    var m = t().modes;
    return (
      '<section class="panel"><h2>' + esc(t().step1Title) + '</h2><p class="hint">' + esc(t().step1Hint) + "</p>" +
      '<div class="choice-grid" id="modeGrid">' +
      choiceCard("international", m.international.name, m.international.desc, state.mode === "international") +
      choiceCard("domestic", m.domestic.name, m.domestic.desc, state.mode === "domestic") +
      choiceCard("hybrid", m.hybrid.name, m.hybrid.desc, state.mode === "hybrid") +
      "</div>" +
      '<div class="nav-row"><button class="btn btn-ghost" id="back1">' + esc(t().back) + '</button>' +
      '<button class="btn btn-primary" id="next1" ' + (state.mode ? "" : "disabled") + ">" + esc(t().nextStep) + "</button></div></section>"
    );
  }

  function renderStep2() {
    var p = t().pedagogies;
    return (
      '<section class="panel"><h2>' + esc(t().step2Title) + '</h2><p class="hint">' + esc(t().step2Hint) + "</p>" +
      '<div class="choice-grid choice-grid-2" id="pedGrid">' +
      choiceCard("classical", p.classical.name, p.classical.desc, state.pedagogy === "classical") +
      choiceCard("nonclassical", p.nonclassical.name, p.nonclassical.desc, state.pedagogy === "nonclassical") +
      "</div>" +
      '<div class="nav-row"><button class="btn btn-ghost" id="back2">' + esc(t().back) + '</button>' +
      '<button class="btn btn-primary" id="next2" ' + (state.pedagogy ? "" : "disabled") + ">" + esc(t().nextStep) + "</button></div></section>"
    );
  }

  function renderStep3() {
    var tr = track();
    if (!tr) return '<div class="notice">' + esc(t().loadErr) + "</div>";
    var rows = "";
    var creditKeys = Object.keys(window.REQ_LABELS);
    creditKeys.forEach(function (key) {
      var v = tr.credits ? tr.credits[key] : null;
      if (v === null || v === undefined) return;
      var lbl = window.REQ_LABELS[key];
      rows +=
        "<tr><td>" + esc(pickLang(lbl.en, lbl.zh)) +
        '</td><td class="num">' + esc(v) + "</td></tr>";
    });
    rows +=
      '<tr class="req-total"><td>' + esc(t().totalCredits) + '</td><td class="num">' + esc(tr.totalCredits == null ? "—" : tr.totalCredits) + "</td></tr>" +
      '<tr class="req-total"><td>' + esc(t().serviceHours) + '</td><td class="num">' + esc(tr.serviceHours == null ? "—" : tr.serviceHours) + "</td></tr>";

    var policy = tr.comments
      ? '<div class="policy"><h3>' + esc(t().policyTitle) + "</h3><pre>" + esc(String(tr.comments).replace(/^"|"$/g, "")) + "</pre></div>"
      : "";

    return (
      '<section class="panel"><h2>' + esc(t().step3Title) + '</h2><p class="hint">' + esc(t().step3Hint) +
      (tr.name ? " — <b>" + esc(tr.name) + "</b>" : "") + "</p>" +
      '<div class="req-card"><table class="req-table"><thead><tr><th>' + esc(t().reqSubject) + "</th><th style=\"text-align:right\">" + esc(t().reqCredits) + "</th></tr></thead><tbody>" +
      rows + "</tbody></table></div>" + policy +
      '<div class="nav-row"><button class="btn btn-ghost" id="back3">' + esc(t().back) + '</button>' +
      '<button class="btn btn-primary" id="next3">' + esc(t().nextStep) + "</button></div></section>"
    );
  }

  // Filter dropdown. Options are {value,label} pairs: every filter now keys off
  // a stable, language-independent value (an English name or a stage key) while
  // displaying a localized label, so a filter survives a language toggle.
  function selectHtmlKV(id, label, options, current) {
    var opts = '<option value="">' + esc(t().filters.all) + "</option>";
    options.forEach(function (o) {
      opts += '<option value="' + esc(o.value) + '"' + (o.value === current ? " selected" : "") + ">" + esc(o.label) + "</option>";
    });
    return (
      '<div class="filter-group"><label for="' + id + '">' + esc(label) + '</label><select id="' + id + '">' + opts + "</select></div>"
    );
  }

  // De-duplicate {value,label} pairs by value, keeping the first non-empty
  // label. Order is insertion order — callers sort as they need.
  function optionsFromPairs(pairs) {
    var seen = {};
    var out = [];
    pairs.forEach(function (p) {
      if (!p || !p.value) return;
      if (seen[p.value]) return;
      seen[p.value] = true;
      out.push({ value: p.value, label: p.label || p.value });
    });
    return out;
  }

  function teacherLinks(c, cls) {
    return (c.teachers || []).map(function (name) {
      var p = teacherByName(name);
      if (!p) return '<span class="' + cls + ' plain">' + esc(name) + "</span>";
      return '<button type="button" class="' + cls + '" data-teacher="' + esc(p.id) + '">' + esc(name) + "</button>";
    }).join("");
  }

  function selectBtn(c, extra) {
    var selected = !!state.cart[c.id];
    return (
      '<button type="button" class="btn btn-select' + (selected ? " on" : "") + (extra ? " " + extra : "") +
      '" data-select="' + esc(c.id) + '">' + esc(selected ? t().selectedBtn : t().select) + "</button>"
    );
  }

  function isLiveType(classType) {
    return /live|直播/i.test(classType || "");
  }

  // classType + grade chips: the visual "what & who" of the course at a glance.
  function metaChips(c) {
    var chips = "";
    var ct = classTypeOf(c);
    if (ct) {
      // Test the English value: it always says "Live"/"Prerecorded" even when
      // the chip itself is showing 直播课 or 录播课.
      var live = isLiveType(c.classTypeEn || ct);
      chips += '<span class="chip chip-type' + (live ? " live" : " recorded") + '">' +
        (live
          ? '<svg viewBox="0 0 20 20" width="10" height="10" aria-hidden="true"><circle cx="10" cy="10" r="5" fill="currentColor"/></svg>'
          : '<svg viewBox="0 0 20 20" width="12" height="12" aria-hidden="true"><path d="M4 5a1 1 0 011-1h6a1 1 0 011 1v10a1 1 0 01-1 1H5a1 1 0 01-1-1V5z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 9l4-2.3v6.6L12 11" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>') +
        " " + esc(ct) + "</span>";
    }
    var grades = c.grades || [];
    if (grades.length > 3) {
      chips += '<span class="chip chip-grade">' + esc(gradeRangeLabel(grades)) + "</span>";
    } else {
      grades.forEach(function (g) { chips += '<span class="chip chip-grade">' + esc(g) + "</span>"; });
    }
    return chips;
  }

  // Compact card: name + at-a-glance chips (live/recorded, grades) + teacher +
  // schedule + a short description — no field-label headers, no price (that's
  // in the detail view). Every pixel goes to information, not chrome.
  function compactCard(c) {
    var selected = !!state.cart[c.id];
    var sched = schedShort(c);
    var name = courseName(c) || c.code || "—";
    return (
      '<article class="course-card' + (selected ? " selected" : "") + '" data-id="' + esc(c.id) + '" tabindex="0" role="button" aria-expanded="false">' +
      '<div class="top"><h4>' + esc(name) + (c.code ? ' <span class="code-inline">' + esc(c.code) + "</span>" : "") + "</h4>" +
      '<span class="expand-ic" aria-hidden="true"><svg viewBox="0 0 20 20" width="16" height="16"><path d="M3 8l7 6 7-6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span></div>' +
      '<div class="chip-row">' + metaChips(c) + "</div>" +
      (c.description ? '<p class="course-desc">' + esc(c.description) + "</p>" : "") +
      ((c.teachers || []).length ? '<div class="card-line teacher-line"><svg viewBox="0 0 20 20" width="13" height="13" aria-hidden="true"><circle cx="10" cy="7" r="3.2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M4 17c0-3.3 2.7-6 6-6s6 2.7 6 6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>' + teacherLinks(c, "t-link") + "</div>" : "") +
      (sched ? '<div class="card-line sched-line"><svg viewBox="0 0 20 20" width="13" height="13" aria-hidden="true"><circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M10 5.5V10l3 2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg> ' + esc(sched) + "</div>" : "") +
      '<div class="course-bottom"><span class="more-hint">' + esc(t().details) + " ›</span>" + selectBtn(c) + "</div></article>"
    );
  }

  function renderStep4() {
    var all = trackCourses();
    var hint = state.level === "k8" ? t().step4HintK8 : t().step4Hint;
    if (all.length === 0) {
      return (
        '<section class="panel"><h2>' + esc(t().step4Title) + '</h2>' +
        '<div class="notice">' + esc(t().noCoursesTrack) + "</div>" +
        '<div class="nav-row"><button class="btn btn-ghost" id="back4">' + esc(t().back) + "</button><span></span></div></section>"
      );
    }
    // All five stages are always offered, in canonical order, even where the
    // current track has no courses in one of them — a parent looks for 大学预科
    // whether or not anything is tagged into it yet. Unlike the subject filter,
    // this list is fixed rather than data-derived. Any grade in the data that
    // belongs to no stage is appended as its own option, in Airtable's grade
    // order, so a new grade row can never hide the courses tagged to it.
    var gradeOrder = state.data.grades || [];
    var gradeOptions = (window.GRADE_STAGES || []).map(function (s) {
      return { value: s.key, label: gradeStageLabel(s.key) };
    });
    var looseGrades = optionsFromPairs([].concat.apply([], all.map(function (c) {
      return (c.grades || [])
        .filter(function (g) { return !GRADE_STAGE_OF[g]; })
        .map(function (g) { return { value: g, label: g }; });
    })));
    looseGrades.sort(function (a, b) {
      return gradeOrder.indexOf(a.value) - gradeOrder.indexOf(b.value);
    });
    gradeOptions = gradeOptions.concat(looseGrades);
    // Filter options are built from the courses actually in this track, keyed
    // by their English value and labelled in the current page language.
    var langOptions = optionsFromPairs(all.map(function (c) {
      return { value: c.languageEn, label: languageOf(c) };
    }));
    // Class type always offers the same three choices in the same order, taken
    // from window.CLASS_TYPES rather than from the courses present — otherwise
    // the list changes shape between tracks (no K-8 course is Prerecorded, which
    // made 录播课 vanish there). "Live or Recorded Course" is deliberately not a
    // choice; courses carrying it stay visible under 全部/All and still show
    // their real type on the card and in the detail view.
    var typeOptions = (window.CLASS_TYPES || []).map(function (ct) {
      return { value: ct.value, label: pickLang(ct.en, ct.zh) };
    });
    var subjectOptions = optionsFromPairs([].concat.apply([], all.map(function (c) {
      return (c.subjects || []).map(function (s) {
        return { value: subjectKey(s), label: subjectLabel(s) };
      });
    })));
    // Subjects follow CEFF's taxonomy order; unlisted ones sort after, by label.
    subjectOptions.sort(function (a, b) {
      var ia = SUBJECT_ORDER.indexOf(a.value), ib = SUBJECT_ORDER.indexOf(b.value);
      if (ia === -1 && ib === -1) return a.label.localeCompare(b.label);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });

    return (
      '<section class="panel"><h2>' + esc(t().step4Title) + '</h2><p class="hint">' + esc(hint) + "</p>" +
      '<div class="filter-bar">' +
      '<div class="filter-group search-group"><label for="fSearch">' + esc(t().searchLabel) + '</label>' +
      '<div class="search-wrap"><svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true"><circle cx="9" cy="9" r="6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M13.5 13.5L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>' +
      '<input id="fSearch" type="search" placeholder="' + esc(t().searchPh) + '" value="' + esc(state.filters.q) + '" autocomplete="off" /></div></div>' +
      selectHtmlKV("fSubject", t().filters.subject, subjectOptions, state.filters.subject) +
      selectHtmlKV("fGrade", t().filters.grade, gradeOptions, state.filters.grade) +
      selectHtmlKV("fLang", t().filters.language, langOptions, state.filters.language) +
      selectHtmlKV("fType", t().filters.classType, typeOptions, state.filters.classType) +
      "</div>" +
      '<div id="gridWrap">' + gridHtml() + "</div>" +
      '<div class="nav-row"><button class="btn btn-ghost" id="back4">' + esc(t().back) + "</button><span></span></div></section>"
    );
  }

  function gridHtml() {
    var list = filteredCourses();
    var count = '<div class="result-count">' + list.length + " " + esc(t().resultCount) + "</div>";
    if (!list.length) return count + '<div class="notice">' + esc(t().noCourses) + "</div>";
    return count + '<div class="course-grid" id="courseGrid">' + list.map(compactCard).join("") + "</div>";
  }

  function renderStep5() {
    var items = cartCourses();
    var rows = items.map(function (c) {
      return (
        '<div class="summary-item"><span>' + esc(courseName(c)) + ' <span class="code">' + esc(c.code) + "</span></span>" +
        "<span>" + (typeof c.price === "number" ? esc(fmtPrice(c.price)) : esc(t().priceTBD)) +
        ' <button class="rm" data-id="' + esc(c.id) + '" type="button">' + esc(t().remove) + "</button></span></div>"
      );
    }).join("");
    return (
      '<section class="panel"><h2>' + esc(t().step5Title) + '</h2><p class="hint">' + esc(t().step5Hint) + "</p>" +
      '<div class="order-layout">' +
      '<div class="summary-card"><h3>' + esc(t().orderSummary) + " (" + items.length + ")</h3>" + rows +
      '<div class="summary-total"><span>' + esc(t().total) + "</span><span>" + esc(fmtPrice(cartTotal()) || "—") + "</span></div></div>" +
      '<div class="form-card"><h3>' + esc(t().submitOrder) + "</h3>" +
      '<label for="email">' + esc(t().emailLabel) + '</label>' +
      '<input id="email" type="email" placeholder="' + esc(t().emailPh) + '" value="' + esc(state.email) + '" autocomplete="email" />' +
      '<p class="field-note">' + esc(t().emailNote) + "</p>" +
      '<label for="teams">' + esc(t().teamsLabel) + '</label>' +
      '<input id="teams" type="text" placeholder="' + esc(t().teamsPh) + '" value="' + esc(state.teams) + '" />' +
      '<div class="hp"><label>Company<input id="company" type="text" tabindex="-1" autocomplete="off" /></label></div>' +
      '<p class="form-err" id="formErr">' + esc(state.formErr) + "</p>" +
      '<button class="btn btn-primary" id="submitBtn" style="width:100%;margin-top:8px" ' + (state.submitting ? "disabled" : "") + ">" +
      esc(state.submitting ? t().submitting : t().submitOrder) + "</button></div></div>" +
      '<div class="nav-row"><button class="btn btn-ghost" id="back5">' + esc(t().back) + "</button><span></span></div></section>"
    );
  }

  function renderDone() {
    return (
      '<div class="done-card">' +
      '<svg class="mark" viewBox="0 0 64 64" fill="none"><circle cx="32" cy="32" r="30" stroke="currentColor" stroke-width="4"/><path d="M20 33l8 8 16-18" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
      "<h2>" + esc(t().doneTitle) + "</h2><p>" + esc(t().doneDesc) + "</p>" +
      '<div class="order-id">' + esc(state.done.orderId) + "</div><br/>" +
      '<button class="btn btn-primary" id="againBtn">' + esc(t().doneAgain) + "</button></div>"
    );
  }

  function renderCartBar() {
    var bar = document.getElementById("cartBar");
    var n = cartIds().length;
    if (state.step === 4 && n > 0 && !state.done) {
      bar.classList.add("visible");
      document.getElementById("cartInfo").innerHTML =
        esc(t().selected) + " <b>" + n + "</b> " + esc(t().coursesUnit) + " · " + esc(t().total) + " <b>" + esc(fmtPrice(cartTotal()) || "—") + "</b>";
      document.getElementById("cartNext").textContent = t().confirmSelection;
    } else {
      bar.classList.remove("visible");
    }
  }

  /* ---------- modals ---------- */

  var modalStack = [];

  function openModal(html, cls) {
    var overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = '<div class="modal ' + (cls || "") + '" role="dialog" aria-modal="true">' + html + "</div>";
    document.body.appendChild(overlay);
    document.body.classList.add("modal-open");
    requestAnimationFrame(function () { overlay.classList.add("show"); });
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) closeModal(overlay);
    });
    modalStack.push(overlay);
    bindModal(overlay);
    return overlay;
  }

  function closeModal(overlay) {
    if (!overlay) overlay = modalStack[modalStack.length - 1];
    if (!overlay) return;
    modalStack = modalStack.filter(function (o) { return o !== overlay; });
    overlay.classList.remove("show");
    setTimeout(function () { overlay.remove(); }, 180);
    if (modalStack.length === 0) document.body.classList.remove("modal-open");
  }

  function closeAllModals() {
    while (modalStack.length) closeModal();
  }

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && modalStack.length) closeModal();
  });

  function row(label, valueHtml, wide) {
    if (valueHtml === null || valueHtml === undefined || valueHtml === "") return "";
    return '<div class="d-row' + (wide ? " wide" : "") + '"><div class="d-label">' + esc(label) + '</div><div class="d-value">' + valueHtml + "</div></div>";
  }

  function schedFull(c) {
    var sch = c.schedule || [];
    if (!sch.length) return "";
    return sch.map(function (p) {
      var tm = p.start ? fmtTime(p.start) + (p.end ? "–" + fmtTime(p.end) : "") : "";
      var days = periodDays(p);
      var mins = typeof p.minutes === "number" ? " · " + p.minutes + " " + t().minutesUnit : "";
      // Weekday + time on one line, e.g. "Period 1/第一节 周一、周三 08:15–09:00 · 45 分钟".
      return '<span class="sched-chip">' + esc((p.title || p.shortName || "") + (days ? " " + days : "") + (tm ? "  " + tm : "") + mins) + "</span>";
    }).join("");
  }

  function courseModalHtml(c) {
    var tags = [];
    if (classTypeOf(c)) tags.push(classTypeOf(c));
    if (languageOf(c)) tags.push(languageOf(c));
    if (c.academic) tags.push(t().dAcademic);
    var priceHtml = typeof c.price === "number"
      ? '<span class="price big">' + esc(fmtPrice(c.price)) + "</span>"
      : '<span class="price tbd">' + esc(t().priceTBD) + "</span>";

    var textbooks = (c.textbooks || []).map(function (b) {
      var name = pickLang(b.nameEn, b.nameZh) || b.sku;
      var pr = typeof b.price === "number" ? ' <span class="tb-price">' + esc(fmtPrice(b.price)) + "</span>" : "";
      return '<div class="tb-item">' + esc(name) + pr + "</div>";
    }).join("");

    var syllabus = (c.syllabus || []).map(function (s) {
      return '<a class="syl-link" href="/api/asset?key=' + encodeURIComponent(s.key) + '" target="_blank" rel="noopener">' +
        '<svg viewBox="0 0 20 20" width="13" height="13" aria-hidden="true"><path d="M10 3v9m0 0l-3.5-3.5M10 12l3.5-3.5M4 16h12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg> ' +
        esc(s.filename) + "</a>";
    }).join("");

    return (
      '<button type="button" class="modal-x" data-close aria-label="' + esc(t().dClose) + '">✕</button>' +
      '<div class="modal-head"><h3>' + esc(courseName(c)) + '</h3><div class="code">' + esc(c.code) + "</div>" +
      '<div class="tag-row">' + tags.map(function (x) { return '<span class="tag">' + esc(x) + "</span>"; }).join("") + "</div></div>" +
      '<div class="modal-body">' +
      (c.description ? '<div class="d-desc"><div class="d-label">' + esc(t().dDescription) + "</div><p>" + esc(c.description) + "</p></div>" : "") +
      '<div class="d-grid">' +
      row(t().dSubject, esc(subjectLabels(c).join(state.lang === "zh" ? "、" : " · "))) +
      row(t().dGrades, esc((c.grades || []).join(" · "))) +
      row(t().dLanguage, esc(languageOf(c))) +
      row(t().dClassType, esc(classTypeOf(c))) +
      row(t().dNumClasses, typeof c.numClasses === "number" ? esc(c.numClasses) + " " + esc(t().classes) : "") +
      row(t().dSchedule, schedFull(c) || '<span class="tbd">' + esc(t().scheduleTBD) + "</span>", true) +
      row(t().dTeachers, (c.teachers || []).length ? teacherLinks(c, "t-chip") : "", true) +
      row(t().dSchool, c.school && c.school.name ? esc(c.school.name) + (c.school.abbr ? ' <span class="muted">(' + esc(c.school.abbr) + ")</span>" : "") : "") +
      row(t().dTextbooks, textbooks, true) +
      row(t().dPrereq, c.prerequisite && c.prerequisite !== "N/A" ? esc(c.prerequisite) : "") +
      row(t().dSyllabus, syllabus, true) +
      row(t().dComments, c.comments ? esc(c.comments) : "", true) +
      "</div></div>" +
      '<div class="modal-foot">' + priceHtml + selectBtn(c, "lg") + "</div>"
    );
  }

  function attrRow(label, v) {
    if (!v) return "";
    return '<div class="t-attr"><span class="t-attr-label">' + esc(label) + "</span><span>" + esc(v) + "</span></div>";
  }

  function teacherModalHtml(p) {
    var photo = p.photo
      ? '<img class="t-photo" src="/api/asset?key=' + encodeURIComponent(p.photo) + '" alt="' + esc(p.name) + '" loading="lazy" />'
      : '<div class="t-photo t-photo-fallback">' + esc((p.name || "?").charAt(0)) + "</div>";
    return (
      '<button type="button" class="modal-x" data-close aria-label="' + esc(t().dClose) + '">✕</button>' +
      '<div class="t-head">' + photo +
      '<div><div class="t-kicker">' + esc(t().tTeacher) + "</div><h3>" + esc(p.name) + "</h3>" +
      (p.organization ? '<div class="t-org">' + esc(p.organization) + "</div>" : "") + "</div></div>" +
      '<div class="modal-body">' +
      (p.bio ? '<p class="t-bio">' + esc(p.bio) + "</p>" : "") +
      (p.expertise ? '<div class="t-expertise"><div class="d-label">' + esc(t().tExpertise) + "</div><p>" + esc(p.expertise) + "</p></div>" : "") +
      '<div class="t-attrs">' +
      attrRow(t().tSubjects, p.subjects) +
      attrRow(t().tLanguages, p.languages) +
      attrRow(t().tCourseTypes, p.courseTypes) +
      attrRow(t().tGrades, p.gradeLevels) +
      "</div></div>"
    );
  }

  function openCourseModal(id) {
    var c = courseById(id);
    if (!c) return;
    openModal(courseModalHtml(c), "course-modal");
  }

  function openTeacherModal(id) {
    var p = teacherById(id);
    if (!p) return;
    openModal(teacherModalHtml(p), "teacher-modal");
  }

  function bindModal(overlay) {
    overlay.addEventListener("click", function (e) {
      var x = e.target.closest("[data-close]");
      if (x) { closeModal(overlay); return; }
      var sel = e.target.closest("[data-select]");
      if (sel) {
        toggleCourse(sel.getAttribute("data-select"), overlay);
        return;
      }
      var tl = e.target.closest("[data-teacher]");
      if (tl) openTeacherModal(tl.getAttribute("data-teacher"));
    });
  }

  // Refresh select buttons inside an open modal after a toggle.
  function refreshModalButtons() {
    modalStack.forEach(function (overlay) {
      overlay.querySelectorAll("[data-select]").forEach(function (btn) {
        var on = !!state.cart[btn.getAttribute("data-select")];
        btn.classList.toggle("on", on);
        btn.textContent = on ? t().selectedBtn : t().select;
      });
    });
  }

  /* ---------- main render ---------- */

  function render() {
    document.documentElement.lang = state.lang === "zh" ? "zh-CN" : "en";
    document.getElementById("brandTag").textContent = t().brandTag;
    document.getElementById("langBtn").textContent = t().langBtn;
    document.getElementById("footNote").textContent = t().footNote;
    renderStepper();

    if (state.done) { app.innerHTML = renderDone(); bind(); renderCartBar(); return; }
    if (!state.data) { renderCartBar(); return; }

    var html = "";
    if (state.step === 0) html = renderStep0();
    else if (state.step === 1) html = renderStep1();
    else if (state.step === 2) html = renderStep2();
    else if (state.step === 3) html = renderStep3();
    else if (state.step === 4) html = renderStep4();
    else html = renderStep5();
    app.innerHTML = html;
    bind();
    renderCartBar();
    window.scrollTo({ top: 0 });
  }

  /* ---------- events ---------- */

  function on(id, ev, fn) {
    var el = document.getElementById(id);
    if (el) el.addEventListener(ev, fn);
  }

  function bind() {
    var levelGrid = document.getElementById("levelGrid");
    if (levelGrid) levelGrid.addEventListener("click", function (e) {
      var card = e.target.closest(".choice-card");
      if (!card) return;
      var lv = card.getAttribute("data-key");
      if (state.level !== lv) { state.cart = {}; state.pedagogy = null; } // switching level clears the cart + pedagogy
      state.level = lv;
      render();
    });
    var modeGrid = document.getElementById("modeGrid");
    if (modeGrid) modeGrid.addEventListener("click", function (e) {
      var card = e.target.closest(".choice-card");
      if (!card) return;
      state.mode = card.getAttribute("data-key");
      render();
    });
    var pedGrid = document.getElementById("pedGrid");
    if (pedGrid) pedGrid.addEventListener("click", function (e) {
      var card = e.target.closest(".choice-card");
      if (!card) return;
      state.pedagogy = card.getAttribute("data-key");
      render();
    });
    on("next0", "click", function () {
      if (!state.level) return;
      state.step = state.level === "k8" ? 2 : 1;
      render();
    });
    on("back1", "click", function () { state.step = 0; render(); });
    on("next1", "click", function () { if (state.mode) { state.step = 2; render(); } });
    on("back2", "click", function () { state.step = state.level === "k8" ? 0 : 1; render(); });
    on("next2", "click", function () { if (state.pedagogy) { state.step = state.level === "k8" ? 4 : 3; render(); } });
    on("back3", "click", function () { state.step = 2; render(); });
    on("next3", "click", function () { state.step = 4; render(); });
    on("back4", "click", function () { state.step = state.level === "k8" ? 2 : 3; render(); });
    on("back5", "click", function () { state.step = 4; render(); });

    ["fSubject", "fGrade", "fLang", "fType"].forEach(function (id) {
      on(id, "change", function (e) {
        var map = { fSubject: "subject", fGrade: "grade", fLang: "language", fType: "classType" };
        state.filters[map[id]] = e.target.value;
        var gw = document.getElementById("gridWrap");
        if (gw) gw.innerHTML = gridHtml();
      });
    });

    // Smart quick search: filters the grid live as the user types.
    on("fSearch", "input", function (e) {
      state.filters.q = e.target.value;
      var gw = document.getElementById("gridWrap");
      if (gw) gw.innerHTML = gridHtml();
    });

    var grid = document.getElementById("gridWrap");
    if (grid) {
      grid.addEventListener("click", function (e) {
        var sel = e.target.closest("[data-select]");
        if (sel) { toggleCourse(sel.getAttribute("data-select")); return; }
        var tl = e.target.closest("[data-teacher]");
        if (tl) { openTeacherModal(tl.getAttribute("data-teacher")); return; }
        var card = e.target.closest(".course-card");
        if (card) openCourseModal(card.getAttribute("data-id"));
      });
      grid.addEventListener("keydown", function (e) {
        if (e.key !== " " && e.key !== "Enter") return;
        var card = e.target.closest(".course-card");
        if (!card || e.target !== card) return;
        e.preventDefault();
        openCourseModal(card.getAttribute("data-id"));
      });
    }

    on("cartNext", "click", function () {
      if (cartIds().length === 0) return;
      state.step = 5; state.formErr = ""; render();
    });

    var summary = app.querySelector(".summary-card");
    if (summary) summary.addEventListener("click", function (e) {
      var rm = e.target.closest(".rm");
      if (!rm) return;
      delete state.cart[rm.getAttribute("data-id")];
      if (cartIds().length === 0) state.step = 4;
      render();
    });

    on("email", "input", function (e) { state.email = e.target.value; });
    on("teams", "input", function (e) { state.teams = e.target.value; });
    on("submitBtn", "click", submitOrder);
    on("againBtn", "click", function () {
      state.done = null; state.cart = {}; state.step = 0;
      state.level = null; state.mode = null; state.pedagogy = null;
      state.filters = { subject: "", grade: "", language: "", classType: "", q: "" };
      render();
    });
  }

  function toggleCourse(id) {
    if (!id) return;
    if (state.cart[id]) delete state.cart[id];
    else state.cart[id] = true;
    // On the catalog, update only the grid + cart bar (no scroll jump, search keeps focus);
    // keep any open modal in sync without closing it.
    var gw = document.getElementById("gridWrap");
    if (gw) {
      gw.innerHTML = gridHtml();
      renderCartBar();
    } else {
      render();
    }
    refreshModalButtons();
  }

  function isBlockedEmail(email) {
    var at = email.lastIndexOf("@");
    if (at === -1) return false;
    var domain = email.slice(at + 1).toLowerCase();
    return BLOCKED_EMAIL_DOMAINS.some(function (d) {
      return domain === d || domain.slice(-(d.length + 1)) === "." + d;
    });
  }

  function submitOrder() {
    var email = (state.email || "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      state.formErr = t().errEmail; render(); return;
    }
    if (isBlockedEmail(email)) {
      state.formErr = t().errEmailDomain; render(); return;
    }
    if (cartIds().length === 0) { state.formErr = t().errEmpty; render(); return; }
    state.submitting = true; state.formErr = ""; render();

    var hp = document.getElementById("company");
    fetch("/api/order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: email,
        teamsAccount: (state.teams || "").trim(),
        trackId: trackId(),
        courseIds: cartIds(),
        company: hp ? hp.value : "",
      }),
    })
      .then(function (res) {
        return res.json().then(function (j) { return { ok: res.ok, status: res.status, body: j }; });
      })
      .then(function (r) {
        state.submitting = false;
        if (r.ok && r.body && r.body.ok) {
          state.done = { orderId: r.body.orderId };
          state.cart = {};
        } else if (r.status === 429) {
          state.formErr = t().errRate;
        } else if (r.body && r.body.error === "blocked_email_domain") {
          state.formErr = t().errEmailDomain;
        } else {
          state.formErr = t().errGeneric;
        }
        render();
      })
      .catch(function () {
        state.submitting = false;
        state.formErr = t().errGeneric;
        render();
      });
  }

  document.getElementById("langBtn").addEventListener("click", function () {
    state.lang = state.lang === "zh" ? "en" : "zh";
    try { localStorage.setItem("fc-lang", state.lang); } catch (e) {}
    closeAllModals();
    render();
  });

  /* ---------- boot ---------- */
  render();
  fetch("/api/data")
    .then(function (res) {
      if (!res.ok) throw new Error("no data");
      return res.json();
    })
    .then(function (data) {
      (data.courses || []).forEach(normalizeCourse);
      state.data = data;
      var n = document.getElementById("loadingNotice");
      if (n) n.remove();
      render();
    })
    .catch(function () {
      app.innerHTML = '<div class="notice">' + esc(t().loadErr) + "</div>";
    });
})();
