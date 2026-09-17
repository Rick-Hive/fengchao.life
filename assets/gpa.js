// fengchao.life — G.P.A. calculator (/gpa).
//
// An independent tool: it reads nothing from the graduation tracks or the
// order flow and uploads nothing. Courses, grades, the grading scale and the
// two settings live in the parent's browser (localStorage, key fc-gpa-v1) and
// nowhere else — there are no student records in Airtable and this page must
// not become the place where they start.
//
// The maths, in one line: GPA = Σ(grade points × weight) ÷ Σ weight over the
// graded rows. Weight is credits (0.5 / 1.0) or periods per week (5 for a
// full course; within a semester block 5 periods/week ⇄ 0.5 credit) — the
// unit is a switch, the formula does not change. Points come from ONE editable scale
// (letter, breakoff, and a grade-point column per course level: CP / Honors /
// AP·Dual Enrollment). The unweighted GPA always reads the CP column; the
// weighted GPA reads the column of each row's level; the academic GPA is the
// CP column over the rows flagged academic. P (pass) earns weight but no
// points; an empty grade is "in progress" and stays out of every number.
// Modelled on the two most-used US calculators (calculator.net,
// gpacalculator.net) and CEFF's own SIS scale.
//
// Three tabs, three URLs — /gpa/scale, /gpa/start, /gpa/sheet — so the
// browser's Back button walks them (Rick, 2026-09-16: "Can't go back to step
// 1"). A bare /gpa — the menu link — always opens the scale, step 1.
// Periods are flat semester blocks, the way gpacalculator.net and
// calculator.net do it (Rick, 2026-09-16: "just follow their ways that have
// been well accepted and tested"): renamable, each with its own GPA, one
// "Add semester" button, a cumulative GPA across all of them, no grouping
// above the semester. Nesting semesters inside years was built and taken out
// the same day.
//
// Wiring: app.js calls window.createGpaTool(ctx) once and .render(container,
// sub) on every render() while the page is /gpa. ctx supplies the site's
// shared helpers (t, esc, pickLang, openModal, go).
(function () {
  "use strict";

  var KEY = "fc-gpa-v1";
  var LEVELS = ["CP", "H", "DE", "AP"];   // dropdown order: AP last (Rick, 2026-09-17)
  var VIEWS = ["scale", "sheet"];   // two steps since 2026-09-17 (Rick: "直接两步就够了")

  window.createGpaTool = function (ctx) {
    var S = null;              // state, loaded lazily so a bad save can't break boot
    var root = null;           // the <section> painted by the last render()
    var view = "scale";        // which tab is showing
    var scaleOverlay = null;   // the open scale editor, if any

    /* ---------- state ---------- */

    function clone(v) { return JSON.parse(JSON.stringify(v)); }
    function uid() { return "g" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
    function num(v) { var n = parseFloat(v); return isFinite(n) ? n : 0; }

    function fresh() {
      return {
        unit: "credits",         // credits | periods
        gradeMode: "letter",     // letter | percent  (controls only; both are always parsed)
        scale: clone(window.GPA_SCALE_DEFAULT || []),
        periods: null,           // null = nothing started yet
        student: "",             // optional, printed on the sheet
        school: "",              // optional, printed on the sheet
      };
    }

    function cleanRow(x) {
      return {
        id: x.id || uid(),
        name: (x.name && typeof x.name === "object") ? { en: String(x.name.en || ""), zh: String(x.name.zh || "") } : String(x.name || ""),
        w: x.w === "" || x.w == null ? "" : String(x.w),
        grade: String(x.grade || ""),
        // IB was a level until 2026-09-16 ("Don't need IB, it's for EU. Use
        // dual enrollment"); an old save maps it to the same column.
        lvl: x.lvl === "IB" ? "DE" : LEVELS.indexOf(x.lvl) !== -1 ? x.lvl : "CP",
        ac: x.ac !== false,
      };
    }

    function load() {
      if (S) return S;
      S = fresh();
      var raw = null;
      try { raw = localStorage.getItem(KEY); } catch (e) {}
      if (!raw) return S;
      var r;
      try { r = JSON.parse(raw); } catch (e) { return S; }
      if (!r || typeof r !== "object") return S;
      if (r.unit === "periods") S.unit = "periods";
      if (r.gradeMode === "percent") S.gradeMode = "percent";
      if (Array.isArray(r.scale) && r.scale.length) {
        S.scale = r.scale.filter(function (x) { return x && typeof x.g === "string"; })
          .map(function (x) { return { g: x.g, min: num(x.min), cp: num(x.cp), h: num(x.h), ap: num(x.ap) }; });
        if (!S.scale.length) S.scale = clone(window.GPA_SCALE_DEFAULT || []);
      }
      if (Array.isArray(r.periods)) {
        S.periods = r.periods.filter(function (p) { return p && typeof p === "object"; }).map(function (p) {
          var rows = Array.isArray(p.rows) ? p.rows : [];
          // A save from the short-lived semester layout: pool its terms' rows.
          if (Array.isArray(p.terms)) p.terms.forEach(function (tm) { rows = rows.concat(Array.isArray(tm.rows) ? tm.rows : []); });
          return {
            id: p.id || uid(),
            grade: typeof p.grade === "number" ? p.grade : null,
            term: p.term === "s1" || p.term === "s2" ? p.term : null,
            seq: typeof p.seq === "number" ? p.seq : null,
            name: typeof p.name === "string" ? p.name : "",
            rows: rows.map(cleanRow),
          };
        }).filter(function (p) {
          // A whole-year block ("G9", no term) is the layout before semesters.
          // Ungraded, it is a stale template that would sit above "G9 · 上学期"
          // as a duplicate — drop it. Graded, the family's work is kept.
          var legacyYear = typeof p.grade === "number" && !p.term && !p.name;
          return !(legacyYear && !p.rows.some(function (x) { return String(x.grade || "").trim() !== ""; }));
        });
        if (!S.periods.length) S.periods = null;
      }
      // r.prior (此前成绩) and r.touched, both removed 2026-09-17, are ignored if present.
      if (typeof r.student === "string") S.student = r.student.slice(0, 80);
      if (typeof r.school === "string") S.school = r.school.slice(0, 120);
      return S;
    }

    function save() {
      try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {}
    }

    function started() { return Array.isArray(S.periods) && S.periods.length > 0; }
    // A blank row is one semester of a course meeting daily: 0.5 credit, or 5
    // periods a week — the same course under either unit (the ×10 rule).
    function blankRow() { return { id: uid(), name: "", w: S.unit === "periods" ? "5" : "0.5", grade: "", lvl: "CP", ac: true }; }

    // The sheet opens as "第 1 学期" with five empty rows, as calculator.net
    // and gpacalculator.net open, and grows by 添加学期. There is no template
    // and no "choose a starting point" step any more (Rick, 2026-09-17: "既然
    // 可以添加学期，就不用先预置 G9–G11 的表单了吧？").
    function applyBlank() {
      var rows = [];
      for (var i = 0; i < 5; i++) rows.push(blankRow());
      S.periods = [{ id: uid(), grade: null, term: null, seq: 1, name: "", rows: rows }];
    }



    function findRow(id) {
      for (var i = 0; i < (S.periods || []).length; i++) {
        var p = S.periods[i];
        for (var j = 0; j < p.rows.length; j++) if (p.rows[j].id === id) return { p: p, r: p.rows[j], i: j };
      }
      return null;
    }
    function findPeriod(id) {
      for (var i = 0; i < (S.periods || []).length; i++) if (S.periods[i].id === id) return S.periods[i];
      return null;
    }
    function allRows() { var out = []; (S.periods || []).forEach(function (p) { out = out.concat(p.rows); }); return out; }

    /* ---------- maths ---------- */

    function colFor(lvl) { return lvl === "H" ? "h" : (lvl === "AP" || lvl === "DE") ? "ap" : "cp"; }

    // Letter, percentage or P -> { cp, lvl } points, "P", or null (ungraded /
    // unrecognised). Percentages pick the highest breakoff at or below the
    // score; letters match the scale case-insensitively. Both forms are
    // accepted whatever the entry setting says.
    function pointsFor(row) {
      var g = String(row.grade || "").trim();
      if (!g) return null;
      if (/^p$/i.test(g) || /^pass$/i.test(g)) return "P";
      var sc = null;
      if (/^\d/.test(g)) {
        var n = parseFloat(g);
        if (!isFinite(n)) return null;
        S.scale.forEach(function (r) { if (n >= r.min && (!sc || r.min > sc.min)) sc = r; });
      } else {
        var lg = g.toLowerCase().replace(/\s+/g, "");
        S.scale.forEach(function (r) { if (!sc && String(r.g).toLowerCase().replace(/\s+/g, "") === lg) sc = r; });
      }
      if (!sc) return null;
      return { cp: num(sc.cp), lvl: num(sc[colFor(row.lvl)]) };
    }

    // Totals over a list of rows: weight of every graded row (P and
    // non-academic included), graded weight and points for the two GPAs, and
    // in-progress weight. Non-academic courses (Bible, art, PE, music…) are
    // usually assessed formatively, so they earn credit but no grade points —
    // the same treatment as P (Rick, 2026-09-16).
    function agg(rows) {
      var a = { w: 0, wG: 0, cp: 0, lvl: 0, inProg: 0, n: rows.length };
      rows.forEach(function (r) {
        var w = num(r.w);
        var pts = pointsFor(r);
        if (pts === null) { if (w > 0) a.inProg += w; return; }
        a.w += w;
        if (pts === "P" || r.ac === false) return;
        a.wG += w; a.cp += pts.cp * w; a.lvl += pts.lvl * w;
      });
      return a;
    }

    // Cumulative = every semester on the sheet. (A "prior record" pair of
    // boxes — a previous school's GPA over so many credits, borrowed from
    // gpacalculator.net — was removed at Rick's request on 2026-09-17: CEFF
    // families arrive with percentage transcripts, not a GPA, and enter those
    // courses row by row.)
    function cumulative() { return agg(allRows()); }

    function gpaOf(points, weight) { return weight > 0 ? points / weight : null; }
    // Two decimals, rounding half up the way a transcript does: 3.675 must
    // print 3.68, but toFixed sees the float 3.67499… and prints 3.67.
    function f2(x) { return x === null || !isFinite(x) ? "—" : (Math.round(x * 100 + 1e-9) / 100).toFixed(2); }
    function fw(x) { return String(Math.round(num(x) * 100) / 100); }
    function scaleMax() { var m = 0; S.scale.forEach(function (r) { m = Math.max(m, num(r.cp)); }); return m; }

    /* ---------- helpers ---------- */

    function T() { return ctx.t().gpa; }
    function esc(s) { return ctx.esc(s == null ? "" : String(s)); }
    function fill(s, vars) {
      return String(s).replace(/\{(\w+)\}/g, function (m, k) { return vars[k] != null ? vars[k] : m; });
    }
    function unitLabel() { return S.unit === "periods" ? T().unitPeriods : T().unitCredits; }
    function rowName(r) { return typeof r.name === "string" ? r.name : ctx.pickLang(r.name.en, r.name.zh); }
    function periodName(p) {
      var t = T();
      if (p.name) return p.name;
      if (typeof p.grade === "number") {
        var g = fill(t.gradeN, { n: p.grade });
        return p.term ? g + " · " + (p.term === "s1" ? t.termFall : t.termSpring) : g;
      }
      if (typeof p.seq === "number") return fill(t.semesterN, { n: p.seq });
      return "";
    }
    function levelLabel(l) {
      var t = T();
      return l === "H" ? t.levelHonors : l === "AP" ? t.levelAP : l === "DE" ? t.levelDual : t.levelCP;
    }
    function go(v) { if (ctx.go) ctx.go(v); }

    /* ---------- markup: shared pieces ---------- */

    function tabsHtml() {
      var t = T();
      return '<nav class="gpa-tabs" aria-label="steps">' + VIEWS.map(function (v, i) {
        var cls = "gpa-tab" + (v === view ? " active" : "") + (v === "sheet" && !started() ? " dim" : "");
        return '<button type="button" class="' + cls + '" data-gpa-tab="' + v + '" aria-current="' + (v === view ? "page" : "false") + '"><span class="n">' + (i + 1) + "</span>" + esc(t.tabs[i]) + "</button>";
      }).join('<span class="gpa-tab-sep">›</span>') + "</nav>";
    }

    function scaleTableHtml() {
      var t = T();
      var rows = S.scale.map(function (r) {
        return "<tr><td>" + esc(r.g) + "</td><td>" + esc(r.min > 0 ? String(r.min) : "< " + minAbove(r)) + '</td><td class="cp">' + esc(num(r.cp).toFixed(1)) + "</td><td>" + esc(num(r.h).toFixed(1)) + "</td><td>" + esc(num(r.ap).toFixed(1)) + "</td></tr>";
      }).join("");
      return "<table><thead><tr><th>" + esc(t.scaleGrade) + "</th><th>" + esc(t.scaleMin) + "</th><th>" + esc(t.scaleCP) + "</th><th>" + esc(t.scaleHonors) + "</th><th>" + esc(t.scaleAP) + "</th></tr></thead><tbody>" + rows + "</tbody></table>";
    }
    // The F row's breakoff is 0; show it as "< (lowest non-zero breakoff)".
    function minAbove(r) {
      var m = null;
      S.scale.forEach(function (x) { if (x.min > r.min && (m === null || x.min < m)) m = x.min; });
      return m === null ? "" : String(m);
    }

    // The two settings live where they act: the column heads of the sheet are
    // the switches — 学分 | 课时 over the weight column, 字母 | 百分 over the
    // grade column (Rick, 2026-09-16). The active side is the column's label.
    // A real switch — label, sliding knob, label — so it reads as a choice
    // at a glance (Rick, 2026-09-16). Off = the first option, on = the second.
    function headSwitch(key, a, b) {
      var on = S[key] === b.val;
      return '<button type="button" class="gpa-switch" role="switch" aria-checked="' + (on ? "true" : "false") + '" data-toggle="' + key + '" data-off="' + a.val + '" data-on="' + b.val + '" title="' + esc(a.title) + '">' +
        '<span class="lab' + (on ? "" : " on") + '">' + esc(a.label) + '</span><span class="track"><span class="knob"></span></span><span class="lab' + (on ? " on" : "") + '">' + esc(b.label) + "</span></button>";
    }

    // The sidebar card on the sheet: table, note + edit link.
    function scaleCardInner() {
      var t = T();
      return (
        '<summary><span class="req-caret" aria-hidden="true"><svg viewBox="0 0 20 20" width="14" height="14"><path d="M7 4l7 6-7 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></span>' + esc(t.scaleTitle) + "</summary>" +
        scaleTableHtml() +
        '<div class="wt"><span>' + esc(t.scaleNote) + '</span><button type="button" class="gpa-link" data-scale-edit>' + esc(t.scaleEdit) + " ›</button></div>"
      );
    }

    /* ---------- markup: the three views ---------- */

    // Tab 1 — the scale, on its own. No settings here (Rick, 2026-09-16); they
    // sit with the sheet, where they act.
    function scaleViewHtml() {
      var t = T();
      return (
        '<div class="gpa-start">' +
        '<p class="gpa-start-hint">' + esc(t.startStep1Hint) + "</p>" +
        '<div class="gpa-scale gpa-scale-start" id="gpaScaleCard">' + scaleTableHtml() +
        '<div class="wt"><span>' + esc(t.scaleNote) + '</span><button type="button" class="gpa-link" data-scale-edit>' + esc(t.scaleEdit) + " ›</button></div></div>" +
        '<p class="gpa-levels">' + esc(t.levelsNote) + "</p>" +
        '<div class="gpa-start-actions"><button type="button" class="btn btn-primary" data-gpa-go="sheet">' + esc(t.next) + " ›</button></div>" +
        "</div>"
      );
    }

    // Tab 2 — the two starting points.
    function gradeControl(r) {
      var t = T();
      if (S.gradeMode === "percent") {
        return '<input class="gpa-in gpa-grade" type="text" inputmode="decimal" data-f="grade" value="' + esc(r.grade) + '" placeholder="' + esc(t.gradePlaceholder) + '" aria-label="' + esc(t.colGrade) + '" />';
      }
      var g = String(r.grade || "").trim();
      var known = false;
      var opts = '<option value=""' + (g ? "" : " selected") + ">" + esc(t.gradeNone) + "</option>";
      S.scale.forEach(function (sr) {
        var on = g.toLowerCase() === String(sr.g).toLowerCase();
        if (on) known = true;
        opts += '<option value="' + esc(sr.g) + '"' + (on ? " selected" : "") + ">" + esc(sr.g) + "</option>";
      });
      var isP = /^p(ass)?$/i.test(g);
      opts += '<option value="P"' + (isP ? " selected" : "") + ">" + esc(t.gradePass) + "</option>";
      // A value typed under the percentage setting still shows (and counts).
      if (g && !known && !isP) opts += '<option value="' + esc(g) + '" selected>' + esc(g) + "</option>";
      return '<select class="gpa-sel gpa-grade" data-f="grade" aria-label="' + esc(t.colGrade) + '">' + opts + "</select>";
    }

    function ptsCell(r) {
      var pts = pointsFor(r);
      if (pts === null) return '<span class="gpa-pts">—</span>';
      if (pts === "P") return '<span class="gpa-pts pf">P</span>';
      if (r.ac === false) return '<span class="gpa-pts pf" title="' + esc(T().nonAcademic) + '">—</span>';
      var up = r.lvl !== "CP" && pts.lvl !== pts.cp;
      return '<span class="gpa-pts' + (up ? " up" : "") + '">' + esc(pts.lvl.toFixed(1)) + "</span>";
    }

    function rowHtml(r) {
      var t = T();
      var lv = LEVELS.map(function (l) {
        return '<option value="' + l + '"' + (r.lvl === l ? " selected" : "") + ">" + esc(levelLabel(l)) + "</option>";
      }).join("");
      return (
        '<tr data-row="' + esc(r.id) + '">' +
        '<td class="gpa-c-name"><input class="gpa-in" type="text" data-f="name" autocomplete="off" value="' + esc(rowName(r)) + '" aria-label="' + esc(t.colCourse) + '" /></td>' +
        '<td><input class="gpa-in gpa-w" type="number" min="0" step="' + (S.unit === "periods" ? "1" : "0.25") + '" data-f="w" value="' + esc(r.w) + '" aria-label="' + esc(S.unit === "periods" ? t.colPeriods : t.colWeight) + '" /></td>' +
        "<td>" + gradeControl(r) + "</td>" +
        '<td><select class="gpa-sel" data-f="lvl" aria-label="' + esc(t.colLevel) + '" title="' + esc(t.levelsNote) + '">' + lv + "</select></td>" +
        '<td><button type="button" class="gpa-seg" data-f="ac" aria-label="' + esc(t.colType) + '">' +
        '<span class="' + (r.ac !== false ? "on" : "") + '">' + esc(t.academic) + "</span>" +
        '<span class="' + (r.ac === false ? "on" : "") + '">' + esc(t.nonAcademic) + "</span></button></td>" +
        '<td class="gpa-c-pts">' + ptsCell(r) + "</td>" +
        '<td><button type="button" class="gpa-rm" data-rm-row="' + esc(r.id) + '" aria-label="' + esc(ctx.t().remove) + '">×</button></td>' +
        "</tr>"
      );
    }

    function tableHead() {
      var t = T();
      return '<thead><tr>' +
        "<th>" + esc(t.colCourse) + "</th>" +
        '<th class="gpa-col-cr">' + headSwitch("unit", { val: "credits", label: t.settingCredits, title: t.colWeight }, { val: "periods", label: t.settingPeriods, title: t.colPeriods }) +
          '<span class="gpa-print-only">' + esc(S.unit === "periods" ? t.colPeriods : t.colWeight) + "</span></th>" +
        '<th class="gpa-col-gr">' + headSwitch("gradeMode", { val: "letter", label: t.settingLetter, title: t.colGrade }, { val: "percent", label: t.settingPercent, title: t.colGrade }) +
          '<span class="gpa-print-only">' + esc(t.colGrade) + "</span></th>" +
        '<th class="gpa-col-lv">' + esc(t.colLevel) + "</th>" +
        '<th class="gpa-col-ac">' + esc(t.colType) + "</th>" +
        '<th class="gpa-col-pt">' + esc(t.colPoints) + "</th><th></th>" +
        "</tr></thead>";
    }

    function periodHeadInner(p) {
      var t = T();
      var a = agg(p.rows);
      var meta = a.w > 0
        ? fill(t.periodMeta, { w: fw(a.w + a.inProg), unit: unitLabel(), n: p.rows.length })
        : fill(t.periodNoGrades, { w: fw(a.inProg), unit: unitLabel() });
      return (
        '<input class="gpa-period-name" type="text" data-period-name="' + esc(p.id) + '" value="' + esc(periodName(p)) + '" placeholder="' + esc(t.periodNamePlaceholder) + '" />' +
        '<span class="gpa-year-meta">' + esc(meta) + "</span>" +
        '<span class="gpa-year-gpa">GPA ' + esc(f2(gpaOf(a.cp, a.wG))) + "</span>" +
        '<button type="button" class="gpa-rm gpa-rm-period" data-rm-period="' + esc(p.id) + '" title="' + esc(t.removePeriod) + '" aria-label="' + esc(t.removePeriod) + '">×</button>'
      );
    }

    function periodHtml(p) {
      var t = T();
      return (
        '<div class="gpa-year" data-period="' + esc(p.id) + '">' +
        '<div class="gpa-year-head">' + periodHeadInner(p) + "</div>" +
        '<table class="gpa-table">' + tableHead() + "<tbody>" + p.rows.map(rowHtml).join("") + "</tbody></table>" +
        '<button type="button" class="gpa-add" data-add-row="' + esc(p.id) + '">＋ ' + esc(t.addCourse) + "</button>" +
        "</div>"
      );
    }

    function resultInner() {
      var t = T();
      var a = cumulative();
      var un = gpaOf(a.cp, a.wG), we = gpaOf(a.lvl, a.wG);
      var tiles = "";
      if (we !== null && un !== null && Math.abs(we - un) > 0.0005) {
        tiles += '<div><div class="k">' + esc(t.weighted) + '</div><div class="v" id="gpaWeighted">' + esc(f2(we)) + "</div></div>";
      }
      // The total counts every course on the sheet, graded or not, and says
      // nothing more — a "still ungraded" line beneath it confused (Rick,
      // 2026-09-17); the arithmetic under the GPA already shows the graded weight.
      // Under 课时/周 there is no total tile at all: weekly periods only mean
      // something within one semester (the block head shows them), and a sum
      // across eight — "每周总课时 285" — is not a figure anyone uses (Rick,
      // 2026-09-17: "definitely incorrect", then "not necessary to display").
      if (S.unit !== "periods") {
        tiles += '<div><div class="k">' + esc(t.totalCredits) + '</div><div class="v" id="gpaCredits">' + esc(fw(a.w + a.inProg)) + "</div></div>";
      }
      var bars = (S.periods || []).map(function (p) {
        var pa = agg(p.rows), g = gpaOf(pa.cp, pa.wG);
        var pct = g === null ? 0 : Math.max(0, Math.min(100, g / Math.max(scaleMax(), 4) * 100));
        return '<div class="gpa-yr"><span class="lbl">' + esc(periodName(p) || "—") + '</span><span class="bar"><i style="width:' + pct.toFixed(0) + '%"></i></span><span class="val">' + esc(f2(g)) + "</span></div>";
      }).join("");
      return (
        "<h3>" + esc(t.cumulative) + "</h3>" +
        '<div class="gpa-big"><span class="n" id="gpaMain">' + esc(f2(un)) + '</span><span class="d">' + esc(t.unweightedTag) + "</span></div>" +
        '<div class="gpa-math">' + esc(fill(t.math, { p: fw(a.cp), w: fw(a.wG), unit: unitLabel() })) + "</div>" +
        '<div class="gpa-two">' + tiles + "</div>" +
        (bars ? '<div class="gpa-years">' + bars + "</div>" : "") +
        '<div class="gpa-actions"><button type="button" class="btn btn-ghost" id="gpaPrint">' + esc(t.print) + "</button>" +
        '<button type="button" class="btn btn-ghost" id="gpaClear">' + esc(t.clear) + "</button></div>"
      );
    }

    // Typing suggestions on the course field: the subject list from Airtable
    // (Course Subject table, in the page language), nothing else. An earlier
    // list mixed common US course names with the catalog's long course titles
    // and read as noise (Rick, 2026-09-16). Drawn by the page, not a
    // <datalist>: the browser's native popup follows the OS theme and came out
    // black on Rick's machine. Anything typed is still accepted.
    // Each entry keeps both names: a picked subject is stored as {en, zh} and
    // follows the language toggle, like the template's courses. A name the
    // family types stays a plain string (Rick, 2026-09-16: "selected in the
    // default list, or could be edited. Bilingual is required").
    function subjectList() {
      var seen = {}, out = [];
      (ctx.subjects ? ctx.subjects() : []).forEach(function (sub) {
        var label = ctx.pickLang(sub.en, sub.zh);
        var k = String(label || "").trim().toLowerCase();
        if (k && !seen[k]) { seen[k] = 1; out.push({ label: label, en: sub.en, zh: sub.zh }); }
      });
      return out;
    }
    var suggestBox = null, suggestFor = null, suggestIdx = -1, scrollBound = false;
    function closeSuggest() {
      if (suggestBox) suggestBox.remove();
      suggestBox = null; suggestFor = null; suggestIdx = -1;
    }
    // On focus the whole list shows whatever the field says (a field holding
    // "代数 I" would otherwise match nothing and show no list while "圣经"
    // matched one — Rick, 2026-09-17); typing filters. A single item equal to
    // the field's text is not offered.
    function openSuggest(input, typed) {
      var q = typed ? input.value.trim().toLowerCase() : "";
      var cur = input.value.trim().toLowerCase();
      var items = subjectList().filter(function (sub) {
        return !q || sub.label.toLowerCase().indexOf(q) !== -1 || String(sub.en).toLowerCase().indexOf(q) !== -1 || String(sub.zh).toLowerCase().indexOf(q) !== -1;
      }).slice(0, 40);
      if (items.length === 1 && items[0].label.toLowerCase() === cur) items = [];
      if (!items.length) { closeSuggest(); return; }
      if (!suggestBox || suggestFor !== input) {
        closeSuggest();
        suggestBox = document.createElement("div");
        suggestBox.className = "gpa-suggest";
        suggestBox.setAttribute("role", "listbox");
        input.parentNode.appendChild(suggestBox);
        suggestFor = input;
      }
      suggestIdx = -1;
      // One language only, the page's (Rick, 2026-09-16); both names are still
      // stored, so the pick follows the language toggle.
      suggestBox.innerHTML = items.map(function (sub, i) {
        return '<button type="button" role="option" data-suggest="' + i + '">' + esc(sub.label) + "</button>";
      }).join("");
      suggestBox.items = items;
      suggestBox.scrollTop = 0;
      placeSuggest();
    }
    // Open downwards unless the window's lower edge would cut the list and
    // there is more room above — the last row of a long sheet otherwise drops
    // its list off-screen.
    function placeSuggest() {
      if (!suggestBox || !suggestFor) return;
      suggestBox.classList.remove("up");
      var r = suggestFor.getBoundingClientRect();
      var h = Math.min(suggestBox.scrollHeight + 2, 260);
      var below = window.innerHeight - r.bottom;
      if (below < h + 8 && r.top > below) suggestBox.classList.add("up");
    }
    function pickSuggest(input, idx) {
      var sub = suggestBox && suggestBox.items && suggestBox.items[idx];
      if (!sub) { closeSuggest(); return; }
      var tr = input.closest("[data-row]");
      var found = tr && findRow(tr.getAttribute("data-row"));
      if (found) { found.r.name = { en: sub.en, zh: sub.zh }; save(); }
      input.value = sub.label;
      closeSuggest();
    }
    function moveSuggest(dir) {
      if (!suggestBox) return;
      var opts = Array.prototype.slice.call(suggestBox.querySelectorAll("[data-suggest]"));
      if (!opts.length) return;
      suggestIdx = (suggestIdx + dir + opts.length) % opts.length;
      opts.forEach(function (o, i) { o.classList.toggle("on", i === suggestIdx); });
      opts[suggestIdx].scrollIntoView({ block: "nearest" });
    }

    // Tab 3 — the sheet.
    function sheetViewHtml() {
      var t = T();
      if (!started()) { applyBlank(); save(); }
      var narrow = window.matchMedia && window.matchMedia("(max-width: 860px)").matches;
      return (
        '<p class="gpa-sheet-note">' + esc(t.sheetHint) + "</p>" +
        '<div class="gpa-layout">' +
        '<div class="gpa-main" id="gpaMainCol">' +
        // Who the sheet is for: school / institution and student, typed here,
        // printed in the header. Editable in place (Rick, 2026-09-17).
        '<div class="gpa-who">' +
        '<label><span>' + esc(t.printSchool) + '</span><input class="gpa-in" id="gpaSchool" type="text" maxlength="120" data-student="school" value="' + esc(S.school || "") + '" placeholder="' + esc(t.schoolLabel) + '" /></label>' +
        '<label><span>' + esc(t.printStudent) + '</span><input class="gpa-in" id="gpaStudent" type="text" maxlength="80" data-student="student" value="' + esc(S.student || "") + '" placeholder="' + esc(t.studentLabel) + '" /></label>' +
        "</div>" +
        S.periods.map(periodHtml).join("") +
        // The credit ⇄ periods rule sits right under the last table, above
        // 添加学期 (Rick, 2026-09-17, twice) — not in the sidebar, far from
        // the switch it describes, and not below the add button.
        '<p class="gpa-levels gpa-unit-note">' + esc(t.unitNote) + "</p>" +
        '<button type="button" class="gpa-add-year" id="gpaAddPeriod">＋ ' + esc(t.addPeriod) + "</button>" +
        "</div>" +
        '<aside class="gpa-side">' +
        '<div class="gpa-result" id="gpaResult">' + resultInner() + "</div>" +
        '<details class="gpa-scale" id="gpaScaleCard"' + (narrow ? "" : " open") + ">" + scaleCardInner() + "</details>" +
        '<p class="gpa-levels">' + esc(t.levelsNote) + "</p>" +
        '<p class="gpa-note">' + esc(t.footnote) + "</p>" +
        '<p class="gpa-print-only gpa-print-foot">' + esc(t.printSource) + "</p>" +
        "</aside></div>"
      );
    }

    // Print header: the mark, the wordmark, the sheet's title, the student
    // and the date — a formal top for a page that is otherwise the sheet.
    function printHeadInner() {
      var t = T();
      return (
        '<img src="/assets/logo-mark.png" alt="" width="64" height="64" />' +
        '<div class="gpa-print-brand"><b>蜂巢</b><span>fengchao.life</span></div>' +
        '<div class="gpa-print-title"><h1>' + esc(t.printTitle) + "</h1></div>" +
        '<div class="gpa-print-meta">' +
        (S.school ? "<div>" + esc(t.printSchool) + "：" + esc(S.school) + "</div>" : "") +
        (S.student ? "<div>" + esc(t.printStudent) + "：" + esc(S.student) + "</div>" : "") +
        "<div>" + esc(t.printedOn) + "：" + esc(new Date().toISOString().slice(0, 10)) + "</div></div>"
      );
    }

    function pageHtml() {
      var t = T();
      var body = view === "scale" ? scaleViewHtml() : sheetViewHtml();
      return (
        '<section class="panel gpa-page" id="gpaPage" data-view="' + view + '">' +
        '<div class="gpa-print-head">' + printHeadInner() + "</div>" +
        "<h2>" + esc(t.title) + ' <span class="gpa-scope">' + esc(t.scope) + "</span></h2>" +
        '<p class="hint">' + esc(t.hint) + "</p>" +
        tabsHtml() +
        body +
        "</section>"
      );
    }

    /* ---------- in-place repaints ---------- */

    function refresh(rowId) {
      if (!root) return;
      var res = root.querySelector("#gpaResult");
      if (res) {
        res.innerHTML = resultInner();
      }
      (S.periods || []).forEach(function (p) {
        var head = root.querySelector('.gpa-year[data-period="' + p.id + '"] .gpa-year-head');
        if (head) {
          var tmp3 = document.createElement("div"); tmp3.innerHTML = periodHeadInner(p);
          ["gpa-year-meta", "gpa-year-gpa"].forEach(function (c) {
            var a = head.querySelector("." + c), b = tmp3.querySelector("." + c);
            if (a && b) a.textContent = b.textContent;
          });
        }
      });
      if (rowId) {
        var f = findRow(rowId);
        var cell = root.querySelector('tr[data-row="' + rowId + '"] .gpa-c-pts');
        if (f && cell) cell.innerHTML = ptsCell(f.r);
      } else {
        allRows().forEach(function (r) {
          var c = root.querySelector('tr[data-row="' + r.id + '"] .gpa-c-pts');
          if (c) c.innerHTML = ptsCell(r);
        });
      }
    }

    /* ---------- scale editor ---------- */

    function scaleEditorHtml() {
      var t = T();
      var rows = S.scale.map(function (r, i) {
        return (
          '<tr data-sc="' + i + '">' +
          '<td><input class="gpa-in l" type="text" data-sc-f="g" value="' + esc(r.g) + '" aria-label="' + esc(t.scaleGrade) + '" /></td>' +
          '<td><input class="gpa-in" type="number" step="1" min="0" max="100" data-sc-f="min" value="' + esc(r.min) + '" aria-label="' + esc(t.scaleMin) + '" /></td>' +
          '<td><input class="gpa-in" type="number" step="0.1" min="0" data-sc-f="cp" value="' + esc(num(r.cp).toFixed(1)) + '" aria-label="' + esc(t.scaleCP) + '" /></td>' +
          '<td><input class="gpa-in" type="number" step="0.1" min="0" data-sc-f="h" value="' + esc(num(r.h).toFixed(1)) + '" aria-label="' + esc(t.scaleHonors) + '" /></td>' +
          '<td><input class="gpa-in" type="number" step="0.1" min="0" data-sc-f="ap" value="' + esc(num(r.ap).toFixed(1)) + '" aria-label="' + esc(t.scaleAP) + '" /></td>' +
          '<td><button type="button" class="gpa-rm" data-sc-rm="' + i + '" aria-label="' + esc(ctx.t().remove) + '">×</button></td>' +
          "</tr>"
        );
      }).join("");
      return (
        '<button type="button" class="modal-x" data-close aria-label="' + esc(ctx.t().dClose) + '">✕</button>' +
        '<div class="modal-head"><h3>' + esc(t.scaleEditTitle) + '</h3><p class="gpa-sheet-hint">' + esc(t.scaleEditHint) + "</p></div>" +
        '<div class="modal-body gpa-edit-body">' +
        '<table class="gpa-edit"><thead><tr><th>' + esc(t.scaleGrade) + "</th><th>" + esc(t.scaleMin) + "</th><th>" + esc(t.scaleCP) + "</th><th>" + esc(t.scaleHonors) + "</th><th>" + esc(t.scaleAP) + '</th><th></th></tr></thead><tbody id="gpaScaleBody">' + rows + "</tbody></table>" +
        '<button type="button" class="gpa-add" id="gpaScaleAdd">＋ ' + esc(t.scaleAdd) + "</button>" +
        "</div>" +
        '<div class="modal-foot"><button type="button" class="btn btn-ghost" id="gpaScaleReset">' + esc(t.scaleReset) + "</button>" +
        '<button type="button" class="btn btn-primary" data-close>' + esc(t.done) + "</button></div>"
      );
    }

    function repaintScaleCard() {
      var card = root && root.querySelector("#gpaScaleCard");
      if (card) card.innerHTML = view === "sheet" ? scaleCardInner() : scaleTableHtml() + card.querySelector(".wt").outerHTML;
      // Letter dropdowns list the scale's letters, so they follow it too.
      if (S.gradeMode === "letter") {
        allRows().forEach(function (r) {
          var cell = root.querySelector('tr[data-row="' + r.id + '"] .gpa-grade');
          if (cell) cell.outerHTML = gradeControl(r);
        });
      }
      refresh();
    }

    function openScaleEditor() {
      scaleOverlay = ctx.openModal(scaleEditorHtml(), "gpa-scale-modal");
      var ov = scaleOverlay;
      ov.addEventListener("input", function (e) {
        var el = e.target;
        var f = el.getAttribute && el.getAttribute("data-sc-f");
        if (!f) return;
        var tr = el.closest("[data-sc]");
        var i = tr ? parseInt(tr.getAttribute("data-sc"), 10) : -1;
        if (!S.scale[i]) return;
        S.scale[i][f] = f === "g" ? el.value : num(el.value);
        save();
        repaintScaleCard();
      });
      ov.addEventListener("click", function (e) {
        var rm = e.target.closest("[data-sc-rm]");
        if (rm) {
          S.scale.splice(parseInt(rm.getAttribute("data-sc-rm"), 10), 1);
          save(); rerenderEditor(); repaintScaleCard(); return;
        }
        if (e.target.closest("#gpaScaleAdd")) {
          S.scale.push({ g: "", min: 0, cp: 0, h: 0, ap: 0 });
          save(); rerenderEditor(); repaintScaleCard();
          var last = ov.querySelector('#gpaScaleBody tr:last-child input[data-sc-f="g"]');
          if (last) last.focus();
          return;
        }
        if (e.target.closest("#gpaScaleReset")) {
          S.scale = clone(window.GPA_SCALE_DEFAULT || []);
          save(); rerenderEditor(); repaintScaleCard();
        }
      });
    }
    function rerenderEditor() {
      if (!scaleOverlay) return;
      var m = scaleOverlay.querySelector(".modal");
      if (m) m.innerHTML = scaleEditorHtml();
    }

    // A confirmation in the site's own modal — the browser's "fengchao.life
    // says" box is not ours to style (Rick, 2026-09-16: "太梦幻").
    function confirmModal(text, onOk) {
      var t = T();
      var ov = ctx.openModal(
        '<button type="button" class="modal-x" data-close aria-label="' + esc(ctx.t().dClose) + '">✕</button>' +
        '<div class="modal-body gpa-confirm"><p>' + esc(text) + "</p></div>" +
        '<div class="modal-foot"><button type="button" class="btn btn-ghost" data-close>' + esc(t.confirmCancel) + "</button>" +
        '<button type="button" class="btn btn-primary" data-confirm-ok>' + esc(t.confirmOk) + "</button></div>",
        "gpa-confirm-modal"
      );
      ov.addEventListener("click", function (e) {
        if (e.target.closest("[data-confirm-ok]")) { ctx.closeModal(ov); onOk(); }
      });
    }

    /* ---------- events ---------- */

    function repaint() { render(root.parentNode, view); }

    function bind(section) {
      // Scrolling can move the open list past the window's edge; re-decide
      // which way it opens. Bound once, on the window, since the page scrolls.
      if (!scrollBound) {
        scrollBound = true;
        window.addEventListener("scroll", placeSuggest, true);
        window.addEventListener("resize", placeSuggest);
      }
      // The suggestion list: opens on focus or typing in a course field,
      // arrows move, Enter picks, Escape or leaving the field closes.
      section.addEventListener("focusin", function (e) {
        var el = e.target;
        if (el.getAttribute && el.getAttribute("data-f") === "name") openSuggest(el);
      });
      section.addEventListener("focusout", function (e) {
        var el = e.target;
        if (el.getAttribute && el.getAttribute("data-f") === "name") setTimeout(function () { if (suggestFor === el) closeSuggest(); }, 120);
      });
      section.addEventListener("keydown", function (e) {
        var el = e.target;
        if (!(el.getAttribute && el.getAttribute("data-f") === "name") || !suggestBox) return;
        if (e.key === "ArrowDown") { e.preventDefault(); moveSuggest(1); }
        else if (e.key === "ArrowUp") { e.preventDefault(); moveSuggest(-1); }
        else if (e.key === "Enter" && suggestIdx >= 0) { e.preventDefault(); pickSuggest(el, suggestIdx); }
        else if (e.key === "Escape") closeSuggest();
      });
      section.addEventListener("mousedown", function (e) {
        var opt = e.target.closest && e.target.closest("[data-suggest]");
        if (opt && suggestFor) { e.preventDefault(); pickSuggest(suggestFor, parseInt(opt.getAttribute("data-suggest"), 10)); }
      });
      section.addEventListener("input", function (e) {
        var el = e.target;
        var f = el.getAttribute && el.getAttribute("data-f");
        if (f === "name" && suggestFor === el) openSuggest(el, true);
        if (f) {
          var tr = el.closest("[data-row]");
          var found = tr && findRow(tr.getAttribute("data-row"));
          if (!found) return;
          if (f === "name") found.r.name = el.value;
          else if (f === "w") found.r.w = el.value;
          else if (f === "grade") found.r.grade = el.value;
          save();
          if (f !== "name") refresh(found.r.id);
          return;
        }
        var pn = el.getAttribute && el.getAttribute("data-period-name");
        if (pn) {
          var p = findPeriod(pn);
          if (p) { p.name = el.value; save(); refresh(); }
          return;
        }
        var st = el.getAttribute && el.getAttribute("data-student");
        if (st) {
          if (st === "school") S.school = el.value.slice(0, 120); else S.student = el.value.slice(0, 80);
          save();
          var ph = root.querySelector(".gpa-print-head");
          if (ph) ph.innerHTML = printHeadInner();
        }
      });

      section.addEventListener("change", function (e) {
        var el = e.target;
        var f = el.getAttribute && el.getAttribute("data-f");
        if (f !== "lvl" && f !== "grade") return;
        var tr = el.closest("[data-row]");
        var found = tr && findRow(tr.getAttribute("data-row"));
        if (!found) return;
        if (f === "lvl") found.r.lvl = LEVELS.indexOf(el.value) !== -1 ? el.value : "CP";
        else found.r.grade = el.value;
        save();
        refresh(found.r.id);
      });

      section.addEventListener("click", function (e) {
        var t = T();
        var tab = e.target.closest("[data-gpa-tab]");
        if (tab) { go(tab.getAttribute("data-gpa-tab")); return; }
        var goBtn = e.target.closest("[data-gpa-go]");
        if (goBtn) { go(goBtn.getAttribute("data-gpa-go")); return; }
        if (e.target.closest("[data-scale-edit]")) { openScaleEditor(); return; }
        var ac = e.target.closest('[data-f="ac"]');
        if (ac) {
          var tr = ac.closest("[data-row]");
          var found = tr && findRow(tr.getAttribute("data-row"));
          if (!found) return;
          found.r.ac = found.r.ac === false;
          ac.children[0].className = found.r.ac ? "on" : "";
          ac.children[1].className = found.r.ac ? "" : "on";
          save(); refresh(found.r.id); return;
        }
        var rmRow = e.target.closest("[data-rm-row]");
        if (rmRow) {
          var fr = findRow(rmRow.getAttribute("data-rm-row"));
          if (!fr) return;
          fr.p.rows.splice(fr.i, 1);
          save();
          var trEl = rmRow.closest("tr");
          if (trEl) trEl.remove();
          refresh(); return;
        }
        var addRow = e.target.closest("[data-add-row]");
        if (addRow) {
          var pa = findPeriod(addRow.getAttribute("data-add-row"));
          if (!pa) return;
          var r = blankRow();
          pa.rows.push(r);
          save();
          var tb = root.querySelector('.gpa-year[data-period="' + pa.id + '"] tbody');
          if (tb) {
            tb.insertAdjacentHTML("beforeend", rowHtml(r));
            var inp = tb.querySelector('tr[data-row="' + r.id + '"] input[data-f="name"]');
            if (inp) inp.focus();
          }
          refresh(); return;
        }
        var rmP = e.target.closest("[data-rm-period]");
        if (rmP) {
          var pp = findPeriod(rmP.getAttribute("data-rm-period"));
          if (!pp) return;
          var filled = pp.rows.filter(function (r) { return rowName(r) || r.grade; }).length;
          var dropPeriod = function () {
            S.periods = S.periods.filter(function (x) { return x !== pp; });
            if (!S.periods.length) S.periods = null;
            save(); repaint();
          };
          if (filled) confirmModal(fill(t.removePeriodConfirm, { n: filled }), dropPeriod); else dropPeriod();
          return;
        }
        // "Add semester": continues the pattern of the last block — Grade 9 Fall
        // → Grade 9 Spring → Grade 10 Fall …, or Semester N → Semester N+1.
        if (e.target.closest("#gpaAddPeriod")) {
          var last = S.periods[S.periods.length - 1];
          var nb = { id: uid(), grade: null, term: null, seq: null, name: "", rows: [blankRow()] };
          if (last && typeof last.grade === "number") {
            if (last.term === "s1") { nb.grade = last.grade; nb.term = "s2"; }
            else if (last.grade < 12) { nb.grade = last.grade + 1; nb.term = last.term ? "s1" : null; }
          } else if (last && typeof last.seq === "number") nb.seq = last.seq + 1;
          else nb.seq = S.periods.length + 1;
          S.periods.push(nb);
          save(); repaint();
          var nm = root.querySelector(".gpa-year:last-of-type .gpa-period-name");
          if (nm && nb.grade === null && nb.seq === null) nm.focus();
          return;
        }
        if (e.target.closest("#gpaPrint")) { window.print(); return; }
        if (e.target.closest("#gpaClear")) {
          confirmModal(t.clearConfirm, function () {
            applyBlank();   // back to one empty 第 1 学期
            save(); repaint();
          });
          return;
        }
        var set = e.target.closest("[data-toggle]");
        if (set) {
          var k = set.getAttribute("data-toggle");
          var v = S[k] === set.getAttribute("data-on") ? set.getAttribute("data-off") : set.getAttribute("data-on");
          if (k === "gradeMode" && (v === "letter" || v === "percent")) S.gradeMode = v;
          if (k === "unit" && (v === "credits" || v === "periods") && v !== S.unit) {
            // 课时 means periods per week. A course meeting five times a week
            // for one semester earns half a credit, so within a semester block
            // 5 periods/week ⇄ 0.5 credit (×10 / ÷10). The GPA does not move;
            // only the weights' scale does (Rick, 2026-09-16: "应该填写5节").
            var f = v === "periods" ? 10 : 1 / 10;
            var conv = function (x) { var n = parseFloat(x); if (!isFinite(n)) return x; return v === "periods" ? String(Math.round(n * f * 100) / 100) : (Math.round(n * f * 100) / 100).toFixed(2).replace(/0$/, ""); };
            allRows().forEach(function (r) { r.w = conv(r.w); });
            S.unit = v;
          }
          save(); repaint();
        }
      });
    }

    /* ---------- public ---------- */

    // sub: "scale" | "sheet" from the URL; anything else is step 1. "start"
    // (the retired middle step) opens the sheet, so old links still land.
    function render(container, sub) {
      load();
      view = sub === "sheet" || sub === "start" ? "sheet" : "scale";
      container.innerHTML = pageHtml();
      root = container.querySelector("#gpaPage");
      bind(root);
    }

    return {
      render: render,
      hasData: function () { load(); return started(); },
    };
  };
})();
