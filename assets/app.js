/* fengchao.life wizard. Data comes from /api/data (admin-synced snapshot). */
(function () {
  "use strict";

  var TRACK_MAP = {
    international: { classical: 1, nonclassical: 2 },
    domestic: { classical: 3, nonclassical: 4 },
    hybrid: { classical: 5, nonclassical: 6 },
  };

  var state = {
    lang: "zh",
    step: 1,
    mode: null,       // international | domestic | hybrid
    pedagogy: null,   // classical | nonclassical
    data: null,       // snapshot
    filters: { subject: "", grade: "", language: "", classType: "", teacher: "" },
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
  function trackId() {
    return state.mode && state.pedagogy ? TRACK_MAP[state.mode][state.pedagogy] : null;
  }
  function track() {
    var id = trackId();
    if (!id || !state.data) return null;
    for (var i = 0; i < state.data.tracks.length; i++)
      if (state.data.tracks[i].trackId === id) return state.data.tracks[i];
    return null;
  }
  function fmtPrice(p) {
    if (typeof p !== "number") return null;
    return "¥" + p.toLocaleString("zh-CN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function trackCourses() {
    var id = trackId();
    if (!id || !state.data) return [];
    return state.data.courses.filter(function (c) {
      return c.trackIds && c.trackIds.indexOf(id) !== -1;
    });
  }

  function filteredCourses() {
    var f = state.filters;
    var list = trackCourses().filter(function (c) {
      if (f.subject && (c.subjects || []).indexOf(f.subject) === -1) return false;
      if (f.grade && (c.grades || []).indexOf(f.grade) === -1) return false;
      if (f.language && c.language !== f.language) return false;
      if (f.classType && c.classType !== f.classType) return false;
      if (f.teacher && (c.teachers || []).indexOf(f.teacher) === -1) return false;
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
  function cartCourses() {
    var byId = {};
    (state.data ? state.data.courses : []).forEach(function (c) { byId[c.id] = c; });
    return cartIds().map(function (id) { return byId[id]; }).filter(Boolean);
  }
  function cartTotal() {
    return cartCourses().reduce(function (s, c) {
      return s + (typeof c.price === "number" ? c.price : 0);
    }, 0);
  }

  /* ---------- rendering ---------- */

  var app = document.getElementById("app");

  function renderStepper() {
    var el = document.getElementById("stepper");
    var html = "";
    for (var i = 1; i <= 5; i++) {
      if (i > 1) html += '<span class="step-sep">›</span>';
      var cls = i === state.step ? "active" : i < state.step ? "done" : "";
      html += '<div class="step-item ' + cls + '"><span class="dot">' + i + '</span><span class="lbl">' + esc(t().steps[i - 1]) + "</span></div>";
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

  function renderStep1() {
    var m = t().modes;
    return (
      '<section class="panel"><h2>' + esc(t().step1Title) + '</h2><p class="hint">' + esc(t().step1Hint) + "</p>" +
      '<div class="choice-grid" id="modeGrid">' +
      choiceCard("international", m.international.name, m.international.desc, state.mode === "international") +
      choiceCard("domestic", m.domestic.name, m.domestic.desc, state.mode === "domestic") +
      choiceCard("hybrid", m.hybrid.name, m.hybrid.desc, state.mode === "hybrid") +
      "</div>" +
      '<div class="nav-row"><span></span><button class="btn btn-primary" id="next1" ' + (state.mode ? "" : "disabled") + ">" + esc(t().nextStep) + "</button></div></section>"
    );
  }

  function renderStep2() {
    var p = t().pedagogies;
    return (
      '<section class="panel"><h2>' + esc(t().step2Title) + '</h2><p class="hint">' + esc(t().step2Hint) + "</p>" +
      '<div class="choice-grid" id="pedGrid">' +
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
        "<tr><td>" + esc(state.lang === "zh" ? lbl.zh + " " + lbl.en : lbl.en + " " + lbl.zh) +
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

  function selectHtml(id, label, options, current) {
    var opts = '<option value="">' + esc(t().filters.all) + "</option>";
    options.forEach(function (o) {
      opts += '<option value="' + esc(o) + '"' + (o === current ? " selected" : "") + ">" + esc(o) + "</option>";
    });
    return (
      '<div class="filter-group"><label for="' + id + '">' + esc(label) + '</label><select id="' + id + '">' + opts + "</select></div>"
    );
  }

  function uniqueSorted(arr) {
    var seen = {};
    var out = [];
    arr.forEach(function (v) {
      if (v == null || v === "") return;
      var k = String(v);
      if (!seen[k]) { seen[k] = true; out.push(k); }
    });
    return out.sort();
  }

  function renderStep4() {
    var all = trackCourses();
    if (all.length === 0) {
      return (
        '<section class="panel"><h2>' + esc(t().step4Title) + '</h2>' +
        '<div class="notice">' + esc(t().noCoursesTrack) + "</div>" +
        '<div class="nav-row"><button class="btn btn-ghost" id="back4">' + esc(t().back) + "</button><span></span></div></section>"
      );
    }
    // subject filter uses the FULL subject list from the base; other filters use values present for this track
    var subjects = state.data.subjects || [];
    var gradeOrder = state.data.grades || [];
    var gradesPresent = uniqueSorted([].concat.apply([], all.map(function (c) { return c.grades || []; })));
    gradesPresent.sort(function (a, b) {
      var ia = gradeOrder.indexOf(a), ib = gradeOrder.indexOf(b);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });
    var langs = uniqueSorted(all.map(function (c) { return c.language; }));
    var types = uniqueSorted(all.map(function (c) { return c.classType; }));
    var teachers = uniqueSorted([].concat.apply([], all.map(function (c) { return c.teachers || []; })));

    var list = filteredCourses();
    var cards = list.map(function (c) {
      var selected = !!state.cart[c.id];
      var tags = [];
      (c.subjects || []).slice(0, 2).forEach(function (s) { tags.push(s); });
      if (c.classType) tags.push(c.classType);
      if (c.language) tags.push(c.language);
      (c.grades || []).slice(0, 3).forEach(function (g) { tags.push(g); });
      var meta = [];
      if (c.teachers && c.teachers.length) meta.push(c.teachers.join("、"));
      if (typeof c.numClasses === "number") meta.push(c.numClasses + " " + t().classes);
      var priceHtml = typeof c.price === "number"
        ? '<span class="price">' + esc(fmtPrice(c.price)) + "</span>"
        : '<span class="price tbd">' + esc(t().priceTBD) + "</span>";
      return (
        '<div class="course-card' + (selected ? " selected" : "") + '" data-id="' + esc(c.id) + '" role="checkbox" aria-checked="' + selected + '" tabindex="0">' +
        '<div class="top"><div><h4>' + esc(c.name) + '</h4><div class="code">' + esc(c.code) + '</div></div><div class="check">✓</div></div>' +
        '<div class="tag-row">' + tags.map(function (x) { return '<span class="tag">' + esc(x) + "</span>"; }).join("") + "</div>" +
        (c.description ? '<p class="course-desc">' + esc(c.description) + "</p>" : "") +
        (meta.length ? '<div class="course-meta">' + esc(meta.join(" · ")) + "</div>" : "") +
        '<div class="course-bottom">' + priceHtml + "</div></div>"
      );
    }).join("");

    return (
      '<section class="panel"><h2>' + esc(t().step4Title) + '</h2><p class="hint">' + esc(t().step4Hint) + "</p>" +
      '<div class="filter-bar">' +
      selectHtml("fSubject", t().filters.subject, subjects, state.filters.subject) +
      selectHtml("fGrade", t().filters.grade, gradesPresent, state.filters.grade) +
      selectHtml("fLang", t().filters.language, langs, state.filters.language) +
      selectHtml("fType", t().filters.classType, types, state.filters.classType) +
      selectHtml("fTeacher", t().filters.teacher, teachers, state.filters.teacher) +
      "</div>" +
      (list.length ? '<div class="course-grid" id="courseGrid">' + cards + "</div>" : '<div class="notice">' + esc(t().noCourses) + "</div>") +
      '<div class="nav-row"><button class="btn btn-ghost" id="back4">' + esc(t().back) + "</button><span></span></div></section>"
    );
  }

  function renderStep5() {
    var items = cartCourses();
    var rows = items.map(function (c) {
      return (
        '<div class="summary-item"><span>' + esc(c.name) + ' <span class="code">' + esc(c.code) + "</span></span>" +
        "<span>" + (typeof c.price === "number" ? esc(fmtPrice(c.price)) : esc(t().priceTBD)) +
        ' <button class="rm" data-id="' + esc(c.id) + '" type="button">' + esc(t().remove) + "</button></span></div>"
      );
    }).join("");
    return (
      '<section class="panel"><h2>' + esc(t().step5Title) + '</h2><p class="hint">' + esc(t().step5Hint) + "</p>" +
      '<div class="order-layout">' +
      '<div class="summary-card"><h3>' + esc(t().orderSummary) + " (" + items.length + ")</h3>" + rows +
      '<div class="summary-total"><span>' + esc(t().total) + "</span><span>" + esc(fmtPrice(cartTotal()) || "—") + "</span></div></div>" +
      '<div class="form-card"><h3>' + esc(t().steps[4]) + "</h3>" +
      '<label for="email">' + esc(t().emailLabel) + '</label>' +
      '<input id="email" type="email" placeholder="' + esc(t().emailPh) + '" value="' + esc(state.email) + '" autocomplete="email" />' +
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

  function render() {
    document.documentElement.lang = state.lang === "zh" ? "zh-CN" : "en";
    document.getElementById("brandTag").textContent = t().brandTag;
    document.getElementById("langBtn").textContent = t().langBtn;
    document.getElementById("footNote").textContent = t().footNote;
    renderStepper();

    if (state.done) { app.innerHTML = renderDone(); bind(); renderCartBar(); return; }
    if (!state.data) { renderCartBar(); return; }

    var html = "";
    if (state.step === 1) html = renderStep1();
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
    on("next1", "click", function () { if (state.mode) { state.step = 2; render(); } });
    on("back2", "click", function () { state.step = 1; render(); });
    on("next2", "click", function () { if (state.pedagogy) { state.step = 3; render(); } });
    on("back3", "click", function () { state.step = 2; render(); });
    on("next3", "click", function () { state.step = 4; render(); });
    on("back4", "click", function () { state.step = 3; render(); });
    on("back5", "click", function () { state.step = 4; render(); });

    ["fSubject", "fGrade", "fLang", "fType", "fTeacher"].forEach(function (id) {
      on(id, "change", function (e) {
        var map = { fSubject: "subject", fGrade: "grade", fLang: "language", fType: "classType", fTeacher: "teacher" };
        state.filters[map[id]] = e.target.value;
        render();
      });
    });

    var grid = document.getElementById("courseGrid");
    if (grid) {
      grid.addEventListener("click", function (e) {
        var card = e.target.closest(".course-card");
        if (!card) return;
        toggleCourse(card.getAttribute("data-id"));
      });
      grid.addEventListener("keydown", function (e) {
        if (e.key !== " " && e.key !== "Enter") return;
        var card = e.target.closest(".course-card");
        if (!card) return;
        e.preventDefault();
        toggleCourse(card.getAttribute("data-id"));
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
      state.done = null; state.cart = {}; state.step = 1;
      state.mode = null; state.pedagogy = null;
      state.filters = { subject: "", grade: "", language: "", classType: "", teacher: "" };
      render();
    });
  }

  function toggleCourse(id) {
    if (!id) return;
    if (state.cart[id]) delete state.cart[id];
    else state.cart[id] = true;
    render();
  }

  function submitOrder() {
    var email = (state.email || "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      state.formErr = t().errEmail; render(); return;
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
      state.data = data;
      var n = document.getElementById("loadingNotice");
      if (n) n.remove();
      render();
    })
    .catch(function () {
      app.innerHTML = '<div class="notice">' + esc(t().loadErr) + "</div>";
    });
})();
