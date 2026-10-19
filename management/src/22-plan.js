// management/src/22-plan.js — 我的账号 › 毕业要求与课程地图: a school's graduation credit requirements
// and curriculum map. Everyone signed in sees their own school's published edition (or Hive's
// defaults); the school's 教育领袖, the curriculum director and the system administrator edit it here.
// Part of management.js: scripts/build-management.js concatenates management/src/*.js in name order
// into management/management.js (one closure; every part sees every other's functions). Edit here, not the built file.

  // ================================================================================
  // 课程方案 (Rick, 2026-10-08/12: 「每所学校自定义毕业学分要求和课程地图……地图上要显示蜂巢能提供的
  // 课程」; 2026-10-19: 「普通用户登录后能看到自己学校的毕业要求和课程地图。网站上可以做任何组合的
  // 选择，不应该受此影响」— so the website's wizard no longer applies the school edition; this page
  // is where a family reads it).
  //
  // Server: GET /api/school-plan?view=1 (anyone: published + the system defaults, read-only) and
  // GET/PUT /api/school-plan?domain= (editors: the DRAFT; 发布 copies it to what the school's
  // people see here; 撤回发布 takes it away). A track or a stage the school leaves "系统默认"
  // is simply absent from the document, so the system's own figures / map show for it.
  //
  // Layout (Rick, 2026-10-19): one page, no tabs. A 毕业路径 select at the top drives both
  // cards: 「高中毕业要求」 for that track, 「课程地图」 for the stage chosen in the card's head,
  // showing the rows that apply to that track. The "本校自定义" switch sits in each card's head.
  // ================================================================================
  var plState = { domain: "", data: null, draft: null, track: "", stage: "rhetoric", dirty: false, canEdit: false, allRows: false, pref: null };
  // The three choices a person makes (Rick, 2026-10-19): pedagogy × higher-education direction = a graduation
  // track (the website's TRACK_MAP), the child's grade = the stage. Kept in people.json (me/planpref).
  var PL_TRACK_MAP = { international: { classical: 1, nonclassical: 2 }, domestic: { classical: 3, nonclassical: 4 }, hybrid: { classical: 5, nonclassical: 6 } };
  var PL_GRADES = ["学前", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];
  function plGradeLabel(g) { return g === "学前" ? t("学前 / K", "K") : "G" + g; }
  function plStageOfGrade(g) { var n = g === "学前" ? 0 : Number(g); return n >= 9 ? "rhetoric" : n >= 7 ? "dialectic" : "grammar"; }
  function plStageLabel(st, pedagogy) {
    var classical = { grammar: ["语法阶段 K–G6", "Grammar K–G6"], dialectic: ["逻辑阶段 G7–G8", "Dialectic G7–G8"], rhetoric: ["修辞阶段 G9–G12", "Rhetoric G9–G12"] };
    var plain = { grammar: ["小学 K–G6", "Elementary K–G6"], dialectic: ["初中 G7–G8", "Middle school G7–G8"], rhetoric: ["高中 G9–G12", "High school G9–G12"] };
    var m = (pedagogy === "classical" ? classical : plain)[st] || ["", ""]; return t(m[0], m[1]);
  }
  // Pre-fill from a child's 补充资料: model → pedagogy, higher-education direction → mode, grade.
  function plPrefFromChild(c) {
    if (!c) return null;
    var he = c.higherEd || [], mode = "international";
    for (var i = 0; i < he.length; i++) { if (he[i] === "国内大学") { mode = "domestic"; break; } if (he[i] === "2+2混合制大学") { mode = "hybrid"; break; } if (/大学$/.test(he[i])) { mode = "international"; break; } }
    return { pedagogy: c.model === "古典教育" ? "classical" : (c.model === "BJU" || c.model === "Abeka" || c.model === "混合教学法") ? "nonclassical" : "classical",
      mode: mode, grade: PL_GRADES.indexOf(String(c.grade)) >= 0 ? String(c.grade) : "9" };
  }
  function plChildren() { return (me && me.hive && me.hive.extra && me.hive.extra.children) || []; }
  function plInitPref() {
    var saved = me && me.hive && me.hive.planPref, kids = plChildren();
    // a student looks for themselves (Rick, 2026-10-19: 「有时候用户就是学生」); a parent for the first child
    var student = me && me.hive && me.hive.identity === "学生";
    var child = saved ? (saved.child != null && kids[saved.child] ? saved.child : null) : (kids.length && !student ? 0 : null);
    var base = saved ? { pedagogy: saved.pedagogy, mode: saved.mode, grade: saved.grade } : (child != null ? plPrefFromChild(kids[child]) : { pedagogy: "classical", mode: "international", grade: "9" });
    plState.pref = Object.assign({ child: child }, base);
    plApplyPref();
  }
  function plApplyPref() { var p = plState.pref; plState.track = String((PL_TRACK_MAP[p.mode] || PL_TRACK_MAP.international)[p.pedagogy] || 1); plState.stage = plStageOfGrade(p.grade); }
  function plSavePref() { if (!me) return; var p = plState.pref; post("me/planpref", "PATCH", { child: p.child, pedagogy: p.pedagogy, mode: p.mode, grade: p.grade }).then(function (r) { if (r.ok && me.hive) me.hive.planPref = r.body.planPref; }); }
  var PL_CREDITS = [["math", "数学", "Math"], ["science", "科学", "Science"], ["english", "英语", "English"], ["chinese", "中文", "Chinese"], ["social", "社会学", "Social Studies"], ["bible", "圣经 / 神学", "Bible / Theology"], ["speaking", "公众演讲", "Public Speaking"], ["secondLang", "第二外语", "Second Foreign Language"], ["fineArts", "艺术", "Fine Arts"], ["pe", "体育", "Physical Education"], ["elective", "选修", "Electives"]];
  // A track's pedagogy, as the website reads it (assets/app.js TRACK_MAP: odd ids classical, even non-classical).
  function plTrackPedagogy(id) { var n = Number(id); return n >= 1 && n <= 6 ? (n % 2 ? "classical" : "nonclassical") : null; }
  function plRowPedagogy(r) { if (r.pedagogy) return r.pedagogy; var ids = r.trackIds || []; if (!ids.length) return null; var ped = null; for (var i = 0; i < ids.length; i++) { var p = plTrackPedagogy(ids[i]); if (!p) continue; if (ped && ped !== p) return null; ped = p; } return ped; }
  // Does a map row apply to the chosen track? (rhetoric: by track; dialectic: by pedagogy; grammar: always)
  function plRowForTrack(r, st) {
    var tid = Number(plState.track);
    if (st === "rhetoric") return !(r.trackIds || []).length || (r.trackIds || []).indexOf(tid) >= 0;
    if (st === "dialectic") { var p = plRowPedagogy(r); return !p || p === plTrackPedagogy(tid); }
    return true;
  }
  function planDomains() { return ((domainsInfo && domainsInfo.domains) || []).filter(function (d) { return d.can && d.can.plan; }); }
  function canSeePlan() { return planDomains().length > 0; }
  function plItemsText(items) { return (items || []).map(function (it) { return it.en && it.zh ? it.en + " / " + it.zh : it.en || it.zh || ""; }).filter(Boolean).join("; "); }
  function plSubjectName(s) { return s ? (pickName(s.nameZh, s.nameEn) || s.nameEn || s.nameZh || "") : ""; }
  function plTrackName(tr) { return tr ? (pickName(tr.nameZh, tr.nameEn) || ("#" + tr.trackId)) : ""; }
  // Blob → working copy (cells to text); working copy → request body (as is: the server parses text cells).
  function plFromBlob(part) {
    var out = { tracks: {}, map: {} }, p = part || {};
    Object.keys(p.tracks || {}).forEach(function (id) { var tr = p.tracks[id] || {}; out.tracks[id] = { credits: Object.assign({}, tr.credits || {}), totalCredits: tr.totalCredits, serviceHours: tr.serviceHours, notes: { en: (tr.notes && tr.notes.en) || "", zh: (tr.notes && tr.notes.zh) || "" } }; });
    Object.keys(p.map || {}).forEach(function (st) { var m = p.map[st]; if (!m || !m.rows) return; out.map[st] = { rows: m.rows.map(function (r) { var cells = {}; Object.keys(r.cells || {}).forEach(function (g) { cells[g] = plItemsText(r.cells[g]); }); return { id: r.id || "", subjects: (r.subjects || []).map(function (s) { return { id: s.id || null, nameEn: s.nameEn || "", nameZh: s.nameZh || "" }; }), trackIds: (r.trackIds || []).slice(), pedagogy: r.pedagogy || null, spanAll: !!r.spanAll, cells: cells }; }) }; });
    return out;
  }
  function plRowsFromDefault(st) {
    var m = plState.data && plState.data.defaults && plState.data.defaults.map && plState.data.defaults.map[st];
    var conv = plFromBlob({ map: { x: m } }).map.x;
    return conv ? conv.rows.map(function (r, i) { r.id = "s-" + st + "-" + (i + 1); return r; }) : [];
  }
  function viewPlan() {
    var ds = planDomains();
    plState.canEdit = ds.length > 0;
    if (plState.canEdit) { if (!plState.domain || !ds.some(function (d) { return d.domain === plState.domain; })) plState.domain = (ds.filter(function (d) { return d.domain === currentDomain; })[0] || ds.filter(function (d) { return d.domain === domainsInfo.mine; })[0] || ds[0]).domain; }
    else plState.domain = (domainsInfo && domainsInfo.mine) || "";
    // Same shape as every other page (Rick, 2026-10-13: 「head设计太差了」): the actions sit in the top
    // bar beside the title; the row below carries the track select, the school picker and the status.
    plInitPref();
    var plActions = plState.canEdit ? '<button class="btn secondary sm" id="plReset">' + t("重置为系统默认", "Reset to System defaults") + '</button> <button class="btn secondary sm" id="plUnpub" hidden>' + t("撤回发布", "Unpublish") + '</button> <button class="btn secondary sm" id="plSave">' + t("保存草稿", "Save draft") + '</button> <button class="btn sm" id="plPub">' + t("发布", "Publish") + "</button>" : "";
    setTitle(t("我的账号", "My account"), t("毕业要求与课程地图", "Graduation requirements & curriculum map"), plActions,
      { info: plState.canEdit
        ? t("本校的高中毕业要求和课程地图。上面选一条毕业路径，两张卡片都按它显示。每条路径的学分要求可以改成本校的数字（留空沿用系统默认，勾「不要求」则隐藏该行），课程地图可以从系统默认复制后改。保存是草稿；发布后本校所有登录的人在这里看到的就是学校版本；撤回发布回到系统默认。", "The school's high-school graduation requirements and curriculum map. Pick a graduation track above; both cards follow it. Each track's credits can be the school's own (blank = the system default, Not required hides the row); the map can be copied from Hive's and changed. Save keeps a draft; Publish makes it what everyone of the school sees here; Unpublish returns to the system defaults.")
        : t("你所在学校的高中毕业要求和课程地图。上面选一条毕业路径查看。学校发布了自己的版本就显示学校版本，否则显示系统默认。网站上的选课向导不受这里影响，可以任意组合。", "Your school's high-school graduation requirements and curriculum map. Pick a graduation track above. The school's own edition shows when it published one, otherwise the system defaults. The website's course wizard is independent of this page.") });
    $("content").innerHTML =
      '<div class="pagetabs plbar" id="pltabs">' + plBarHtml() +
        (plState.canEdit && ds.length > 1 ? '<div class="tabsRight"><select id="plsel">' + ds.map(function (d) { return '<option value="' + esc(d.domain) + '"' + (d.domain === plState.domain ? " selected" : "") + ">" + esc(dname(d.domain)) + "</option>"; }).join("") + "</select></div>" : "") + "</div>" +
      '<div id="plmsg"></div><div id="plbody"><div class="loading">' + t("载入中…", "Loading…") + "</div></div>";
    var sel = $("plsel");
    if (sel) sel.addEventListener("change", function () { if (plState.dirty && !window.confirm(t("有未保存的修改，切换学校会丢失。继续？", "Unsaved changes will be lost. Switch school?"))) { this.value = plState.domain; return; } plState.domain = this.value; loadPlan(); });
    $("pltabs").addEventListener("change", function (e) {
      var c = e.target, p = plState.pref;
      if (c.id === "plChild") { p.child = c.value === "" ? null : Number(c.value); var k = plChildren()[p.child]; if (k) Object.assign(p, plPrefFromChild(k)); plApplyPref(); $("pltabs").querySelector(".plsels").outerHTML = plSelsHtml(); plSavePref(); renderPlan(); return; }
      if (c.id === "plPed") { p.pedagogy = c.value; plApplyPref(); plSavePref(); renderPlan(); return; }
      if (c.id === "plMode") { p.mode = c.value; plApplyPref(); plSavePref(); renderPlan(); return; }
      if (c.id === "plGrade") { p.grade = c.value; plApplyPref(); plSavePref(); renderPlan(); return; }
    });
    if (plState.canEdit) {
      $("plSave").addEventListener("click", function () { savePlan(false); });
      $("plPub").addEventListener("click", function () { if (window.confirm(t("发布后，本校所有登录的人在这里看到的就是这个版本。发布？", "Once published, everyone of the school sees this version here. Publish?"))) savePlan(true); });
      $("plUnpub").addEventListener("click", function () { if (!window.confirm(t("撤回后本校的人重新看到系统默认的学分要求和课程地图（草稿保留）。撤回？", "The school's people go back to the system default requirements and map (the draft is kept). Unpublish?"))) return; var b = $("plUnpub"); savingButton(b, t("撤回中…", "Unpublishing…")); post("school-plan", "PUT", { domain: plState.domain, unpublish: true }).then(function (r) { restoreButton(b); if (!r.ok) { plMsg(errText(r), true); return; } plState.data = Object.assign({}, plState.data, r.body); plStatus(); flashOk(t("已撤回发布。", "Unpublished.")); }); });
      $("plReset").addEventListener("click", function () { if (!window.confirm(t("把草稿全部清空（每条路径和每个阶段都回到系统默认）？保存后才生效。", "Clear the whole draft (every track and stage back to the system defaults)? Takes effect when saved."))) return; plState.draft = { tracks: {}, map: {} }; plState.dirty = true; renderPlan(); });
    }
    bindPlan(); // once per page: the listeners sit on #plbody, whose contents renderPlan() replaces
    loadPlan();
  }
  function plBarHtml() {
    var kids = plChildren(), p = plState.pref || {};
    // 查看: a child from 补充资料, or 我自己 (a student, or anyone choosing by hand)
    // no child on file (common — Rick, 2026-10-19): the person chooses by hand, the choice is kept, and a
    // quiet pointer to 补充资料 says where the children go so next time it is pre-filled
    var noKids = !kids.length && !(me && me.hive && me.hive.identity === "学生") ? '<a class="plsel plhint" href="#/account">' + t("有孩子？在个人资料里登记后这里自动带出", "Have children? Add them in the profile and this fills itself") + "</a>" : "";
    return (kids.length ? '<label class="plsel">' + t("查看", "For") + ' <select id="plChild">' + kids.map(function (k, i) { return '<option value="' + i + '"' + (p.child === i ? " selected" : "") + ">" + esc(k.name || t("孩子 ", "Child ") + (i + 1)) + (k.grade ? " · " + esc(plGradeLabel(String(k.grade))) : "") + "</option>"; }).join("") + '<option value=""' + (p.child == null ? " selected" : "") + ">" + t("我自己", "Myself") + "</option></select></label>" : "") + plSelsHtml() + noKids;
  }
  function plSelsHtml() {
    var p = plState.pref || {};
    var opt = function (v, label, cur) { return '<option value="' + v + '"' + (v === cur ? " selected" : "") + ">" + esc(label) + "</option>"; };
    return '<span class="plsels"><label class="plsel">' + t("教学法", "Pedagogy") + ' <select id="plPed">' + opt("classical", t("古典教育", "Classical"), p.pedagogy) + opt("nonclassical", t("非古典", "Non-classical"), p.pedagogy) + "</select></label>" +
      '<label class="plsel">' + t("高等教育方向", "Direction") + ' <select id="plMode">' + opt("international", t("国际", "International"), p.mode) + opt("domestic", t("国内", "Domestic"), p.mode) + opt("hybrid", t("混合 2+2", "Hybrid 2+2"), p.mode) + "</select></label>" +
      '<label class="plsel">' + t("年级", "Grade") + ' <select id="plGrade">' + PL_GRADES.map(function (g) { return opt(g, plGradeLabel(g), p.grade); }).join("") + "</select></label></span>";
  }
  function plMsg(text, bad) { $("plmsg").innerHTML = text ? '<div class="msg ' + (bad ? "err" : "ok") + '">' + esc(text) + "</div>" : ""; }
  function loadPlan() {
    $("plbody").innerHTML = '<div class="loading">' + t("载入中…", "Loading…") + "</div>";
    var url = plState.canEdit ? "school-plan?domain=" + encodeURIComponent(plState.domain) : "school-plan?view=1";
    return api(url).then(function (r) {
      if (!r.ok) { $("plbody").innerHTML = '<div class="msg err">' + esc(errText(r)) + "</div>"; return; }
      plState.data = r.body; if (!plState.canEdit) plState.domain = r.body.domain || "";
      // editors work on the draft; everyone else reads what is published (nothing published = the system defaults)
      plState.draft = plFromBlob(r.body.plan && (plState.canEdit ? r.body.plan.draft : r.body.plan.published)); plState.dirty = false;
      plApplyPref();
      plStatus(); renderPlan();
    });
  }
  // No status line in the bar (Rick, 2026-10-19: 「delete this … move the second line above」): the card tags say
  // 系统默认 / 本校版本 / 学校版本, and 撤回发布 shows only while something is published.
  function plStatus() {
    var d = plState.data, p = d && d.plan; if (!d) return;
    if ($("plUnpub")) $("plUnpub").hidden = !(p && p.published);
  }
  function savePlan(publish) {
    var b = publish ? $("plPub") : $("plSave"); savingButton(b, publish ? t("发布中…", "Publishing…") : undefined);
    var body = { domain: plState.domain, tracks: plState.draft.tracks, map: plState.draft.map };
    if (publish) body.publish = true;
    return post("school-plan", "PUT", body).then(function (r) {
      restoreButton(b);
      if (!r.ok) { plMsg(errText(r) + (r.body && r.body.problems ? " — " + r.body.problems.join("; ") : ""), true); return; }
      plState.data = Object.assign({}, plState.data, r.body); plState.draft = plFromBlob(r.body.plan && r.body.plan.draft); plState.dirty = false;
      plMsg(""); plStatus(); renderPlan();
      flashOk(publish ? t("已发布：本校的人在这里看到学校版本。", "Published: the school's people see the school edition here.") : t("草稿已保存（尚未发布）。", "Draft saved (not published yet)."));
    });
  }
  function renderPlan() { if (!plState.data || !$("plbody")) return; $("plbody").innerHTML = planCreditsHtml() + planMapHtml(); }
  // The switch in a card's head (editors only): compact, no second line (Rick, 2026-10-19: 「单独占据了 1 行，实在不应该」).
  function plOwnSwitch(id, on, label, hint) { return plState.canEdit ? '<label class="sw head" title="' + esc(hint) + '"><input type="checkbox" id="' + id + '"' + (on ? " checked" : "") + ' /><span class="track"></span><span class="swt">' + esc(label) + "</span></label>" : ""; }
  // the edition tag: 本校版本 / 学校版本, or 系统默认 (Rick, 2026-10-19: not "系统默认")
  function plEditionTag(on) { return on ? ' <span class="tag ok">' + (plState.canEdit ? t("本校版本", "School edition") : t("学校版本", "School edition")) + "</span>" : ' <span class="tag muted">' + t("系统默认", "System default") + "</span>"; }

  // ---- 毕业学分要求 ------------------------------------------------------------------
  function planCreditsHtml() {
    var dfl = plState.data.defaults || {}, trs = dfl.tracks || [];
    if (!trs.length) return '<div class="card"><p class="sub">' + t("数据快照里还没有毕业路径。", "The data snapshot has no graduation tracks yet.") + "</p></div>";
    var tr = trs.filter(function (x) { return String(x.trackId) === plState.track; })[0];
    if (!tr) return '<div class="card"><p class="sub">' + t("数据快照里没有这条毕业路径。", "Hive's data snapshot has no such graduation track.") + "</p></div>";
    var ov = plState.draft.tracks[plState.track], edit = plState.canEdit && !!ov;
    // a K–8 child: the requirements apply from G9 — one line, not a whole card (readers only; editors always see it)
    if (!plState.canEdit && plState.stage !== "rhetoric") return '<div class="card plcard plfold"><div class="ch plhead"><h2>' + t("高中毕业要求", "High-school graduation requirements") + ' <span class="muted">' + esc(plTrackName(tr)) + "</span>" + plEditionTag(!!ov) + '</h2><span class="muted">' + t("升到 G9 后适用；上面把年级改到 9–12 可以先看。", "Applies from G9; set the grade to 9–12 above to read it now.") + "</span></div></div>";
    var unit = t("学分", "credits");
    var head = '<div class="card plcard"><div class="ch plhead"><h2>' + t("高中毕业要求", "High-school graduation requirements") + ' <span class="muted">' + esc(plTrackName(tr)) + "</span>" + plEditionTag(!!ov) + "</h2>" +
      plOwnSwitch("plOwn", !!ov, t("本校自定义", "School's own"), t("打开：本校设置这条路径的学分要求；关闭：显示系统默认的数字。", "On: the school sets this track's requirements; off: the system figures show.")) + "</div>";
    if (!edit) {
      // read-only: the system figures, or the school's over them
      var o = ov || { credits: {}, notes: {} };
      var rowsR = PL_CREDITS.map(function (c) { var dv = tr.credits ? tr.credits[c[0]] : null, has = Object.prototype.hasOwnProperty.call(o.credits, c[0]), v = has ? o.credits[c[0]] : dv; return v == null ? "" : "<tr><td>" + esc(t(c[1], c[2])) + '</td><td class="num">' + esc(String(v)) + (has && dv != null && v !== dv ? ' <small class="muted">(' + t("系统 ", "system ") + esc(String(dv)) + ")</small>" : "") + "</td></tr>"; }).join("");
      var total = ov && ov.totalCredits != null ? ov.totalCredits : tr.totalCredits, hours = ov && ov.serviceHours != null ? ov.serviceHours : tr.serviceHours;
      var note = ov && (o.notes.zh || o.notes.en) ? pickName(o.notes.zh, o.notes.en) : pickName(tr.commentsZh, tr.commentsEn);
      return head + '<table class="data"><thead><tr><th>' + t("科目", "Subject") + '</th><th class="num">' + unit + "</th></tr></thead><tbody>" + rowsR +
        "<tr><td><b>" + t("总学分", "Total credits") + '</b></td><td class="num"><b>' + esc(total == null ? "—" : String(total)) + "</b></td></tr><tr><td>" + t("服务小时", "Service hours") + '</td><td class="num">' + esc(hours == null ? "—" : String(hours)) + "</td></tr></tbody></table>" +
        (note ? '<p class="sub" style="margin-top:8px">' + esc(note) + "</p>" : "") + "</div>";
    }
    var rows = PL_CREDITS.map(function (c) {
      var k = c[0], dv = tr.credits ? tr.credits[k] : null, has = Object.prototype.hasOwnProperty.call(ov.credits, k), v = has ? ov.credits[k] : undefined, off = has && v === null;
      return '<tr data-k="' + k + '"><td>' + esc(t(c[1], c[2])) + '</td><td class="num muted">' + esc(dv == null ? "—" : String(dv)) + '</td><td class="num"><input type="number" min="0" step="0.5" class="sm" style="width:90px" data-credit="' + k + '" value="' + esc(has && v != null ? String(v) : "") + '" placeholder="' + esc(dv == null ? "" : String(dv)) + '"' + (off ? " disabled" : "") + ' /></td><td><label class="chk"><input type="checkbox" data-off="' + k + '"' + (off ? " checked" : "") + " /> " + t("不要求", "Not required") + "</label></td></tr>";
    }).join("");
    return head +
      '<table class="data"><thead><tr><th>' + t("科目", "Subject") + '</th><th class="num">' + t("系统默认", "System default") + '</th><th class="num">' + t("本校要求", "School") + "</th><th></th></tr></thead><tbody>" + rows +
      "<tr><td><b>" + t("总学分", "Total credits") + '</b></td><td class="num muted">' + esc(tr.totalCredits == null ? "—" : String(tr.totalCredits)) + '</td><td class="num"><input type="number" min="0" step="0.5" class="sm" style="width:90px" id="plTotal" value="' + esc(ov.totalCredits == null ? "" : String(ov.totalCredits)) + '" placeholder="' + esc(tr.totalCredits == null ? "" : String(tr.totalCredits)) + '" /></td><td></td></tr>' +
      "<tr><td>" + t("服务小时", "Service hours") + '</td><td class="num muted">' + esc(tr.serviceHours == null ? "—" : String(tr.serviceHours)) + '</td><td class="num"><input type="number" min="0" step="1" class="sm" style="width:90px" id="plHours" value="' + esc(ov.serviceHours == null ? "" : String(ov.serviceHours)) + '" placeholder="' + esc(tr.serviceHours == null ? "" : String(tr.serviceHours)) + '" /></td><td></td></tr></tbody></table>' +
      '<p class="sub" style="margin:8px 0 4px">' + t("留空 = 沿用系统默认；单位：", "Blank = the system default; unit: ") + unit + "</p>" +
      '<div class="grid2" style="margin-top:8px"><label class="f">' + t("学校说明（中文）", "School note (Chinese)") + '<textarea id="plNoteZh" rows="3">' + esc(ov.notes.zh || "") + '</textarea><small>' + t("替代系统的备注；两种语言都留空则显示系统的。", "Replaces the system note; both blank = the system note.") + '</small></label><label class="f">' + t("学校说明（英文）", "School note (English)") + '<textarea id="plNoteEn" rows="3">' + esc(ov.notes.en || "") + "</textarea></label></div></div>";
  }

  // ---- 课程地图 --------------------------------------------------------------------
  function planMapHtml() {
    var dfl = plState.data.defaults || {}, st = plState.stage, dm = (dfl.map && dfl.map[st]) || { grades: [], rows: [] };
    var grades = dm.grades || [];
    var own = plState.draft.map[st];
    var edit = plState.canEdit && !!own;
    var trName = plTrackName((dfl.tracks || []).filter(function (x) { return String(x.trackId) === plState.track; })[0]);
    var head = '<div class="card plcard"><div class="ch plhead"><h2>' + t("课程地图", "Curriculum map") + ' <span class="muted">' + esc(plStageLabel(st, plState.pref.pedagogy)) + " · " + esc(trName) + "</span>" + plEditionTag(!!own) + "</h2>" +
      (edit ? '<label class="chk plall"><input type="checkbox" id="plAllRows"' + (plState.allRows ? " checked" : "") + " /> " + t("显示所有路径的行", "Rows of every track") + "</label>" : "") +
      plOwnSwitch("plOwnMap", !!own, t("本校自定义", "School's own"), t("打开：从系统默认地图复制一份作为起点，本校自己编排这个阶段；关闭：显示系统默认的地图。", "On: start from a copy of the system map and lay out this stage yourself; off: the system map shows.")) + "</div>";
    var forTrack = function (r) { return plState.allRows && edit ? true : plRowForTrack(r, st); };
    // A cell shows its courses as chips; in the editor the whole cell is the editing area: click → a textarea
    // filling the cell (Rick, 2026-10-19: 「编辑口特别小……参考 Airtable」), blur → chips again.
    function chipsOf(text) { return String(text || "").split(/[;\n]/).map(function (x) { return x.trim(); }).filter(Boolean); }
    function cellBox(r, g, text, editable) {
      var items = chipsOf(text);
      return '<div class="plcell' + (editable ? " edit" : "") + (items.length ? "" : " empty") + '"' + (editable ? ' data-cell="' + esc(g) + '" data-row="' + esc(r.id) + '" tabindex="0"' : "") + '>' +
        (items.length ? items.map(function (x) { return '<span class="plchip">' + esc(x) + "</span>"; }).join("") : (editable ? '<span class="plplus">＋</span>' : "")) + "</div>";
    }
    function cellsHtml(r, editable) {
      if (r.spanAll) return '<td colspan="' + grades.length + '">' + cellBox(r, "", r.cells[grades[0]] || r.cells[""] || firstCell(r), editable) + "</td>";
      return grades.map(function (g) { return "<td>" + cellBox(r, g, r.cells[g] || "", editable) + "</td>"; }).join("");
    }
    function firstCell(r) { for (var i = 0; i < grades.length; i++) if (r.cells[grades[i]]) return r.cells[grades[i]]; return ""; }
    var thead = "<thead><tr><th>" + t("科目", "Subject") + "</th>" + (st === "rhetoric" ? "<th>" + t("路径", "Tracks") + "</th>" : st === "dialectic" ? "<th>" + t("教育法", "Pedagogy") + "</th>" : "") + grades.map(function (g) { return "<th>" + esc(g) + "</th>"; }).join("") + (edit ? "<th></th>" : "") + "</tr></thead>";
    if (!edit) {
      var dconv = own || plFromBlob({ map: { x: dm } }).map.x, drows = (dconv ? dconv.rows : []).filter(forTrack);
      return head + '<div class="tbl-wrap"><table class="data plmap">' + thead + "<tbody>" + (drows.length ? drows.map(function (r) { return "<tr><td>" + esc(r.subjects.map(plSubjectName).join(" · ") || "—") + "</td>" + scopeCell(r, false) + cellsHtml(r, false) + "</tr>"; }).join("") : '<tr><td colspan="' + (grades.length + 2) + '" class="muted">' + t("这条路径在这个阶段没有课程地图。", "No map for this track at this stage.") + "</td></tr>") + "</tbody></table></div></div>";
    }
    function scopeCell(r, editable) {
      if (st === "rhetoric") {
        var trs = dfl.tracks || [];
        var chips = r.trackIds.length ? r.trackIds.map(function (id) { var x = trs.filter(function (y) { return y.trackId === id; })[0]; return '<span class="plchip soft">' + esc(x ? plTrackName(x) : "#" + id) + (editable ? '<button type="button" class="x" data-trkdel="' + id + '" data-row="' + esc(r.id) + '" aria-label="remove">×</button>' : "") + "</span>"; }).join("") : '<span class="muted">' + t("全部路径", "All tracks") + "</span>";
        // the picker is a small menu, not six checkboxes stacked in the row
        var menu = editable ? '<span class="plpick"><button type="button" class="plplusbtn" data-trkmenu="' + esc(r.id) + '" title="' + esc(t("选择路径", "Choose tracks")) + '">＋</button><div class="comenu" hidden>' + trs.map(function (x) { return '<label class="mi chk"><input type="checkbox" data-trk="' + x.trackId + '" data-row="' + esc(r.id) + '"' + (r.trackIds.indexOf(x.trackId) >= 0 ? " checked" : "") + " /> " + esc(plTrackName(x)) + "</label>"; }).join("") + "</div></span>" : "";
        return '<td class="plscope">' + chips + menu + "</td>";
      }
      if (st === "dialectic") {
        var opts = [["", t("两种都适用", "Both")], ["classical", t("古典", "Classical")], ["nonclassical", t("非古典", "Non-classical")]];
        return '<td class="plscope">' + (editable ? '<select class="sm" data-ped="' + r.id + '">' + opts.map(function (o) { return '<option value="' + o[0] + '"' + ((r.pedagogy || "") === o[0] ? " selected" : "") + ">" + esc(o[1]) + "</option>"; }).join("") + "</select>" : esc(opts.filter(function (o) { return o[0] === (r.pedagogy || ""); })[0][1])) + "</td>";
      }
      return "";
    }
    var subjects = dfl.subjects || [];
    var shown = own.rows.filter(forTrack), hidden = own.rows.length - shown.length;
    var rows = shown.map(function (r, i) {
      var cur = r.subjects[0] ? (r.subjects[0].id || r.subjects[0].nameEn) : "";
      var known = subjects.some(function (s) { return (s.id || s.nameEn) === cur; });
      return '<tr data-row="' + esc(r.id) + '"><td><select class="sm" data-subj="' + esc(r.id) + '">' + (known ? "" : '<option value="' + esc(cur) + '" selected>' + esc(plSubjectName(r.subjects[0]) || t("（选择科目）", "(choose a subject)")) + "</option>") + subjects.map(function (s) { var k = s.id || s.nameEn; return '<option value="' + esc(k) + '"' + (k === cur ? " selected" : "") + ">" + esc(plSubjectName(s)) + "</option>"; }).join("") + "</select>" +
        '<label class="chk plspan"><input type="checkbox" data-span="' + esc(r.id) + '"' + (r.spanAll ? " checked" : "") + " /> " + t("各年级相同", "Same every grade") + "</label></td>" + scopeCell(r, true) + cellsHtml(r, true) +
        '<td class="plrowbtns"><button type="button" class="lnk" data-up="' + esc(r.id) + '" title="' + t("上移", "Move up") + '"' + (i === 0 ? " disabled" : "") + '>↑</button><button type="button" class="lnk" data-down="' + esc(r.id) + '" title="' + t("下移", "Move down") + '"' + (i === shown.length - 1 ? " disabled" : "") + '>↓</button><button type="button" class="lnk del" data-del="' + esc(r.id) + '" title="' + t("删除这一行", "Delete the row") + '">×</button></td></tr>';
    }).join("");
    return head + '<div class="tbl-wrap"><table class="data plmap edit">' + thead + "<tbody>" + rows + "</tbody></table></div>" +
      (hidden ? '<p class="sub" style="margin-top:6px">' + hidden + t(" 行属于其它路径，勾「显示所有路径的行」可见。", " row(s) belong to other tracks — tick “Rows of every track” to see them.") + "</p>" : "") +
      '<div class="actions" style="margin-top:8px"><button type="button" class="btn secondary sm" id="plAddRow">' + t("＋ 添加一行", "+ Add a row") + '</button> <button type="button" class="btn secondary sm" id="plCopyDefault">' + t("从系统默认重新复制", "Copy the system map again") + "</button></div>" +
      '<p class="sub" style="margin-top:8px">' + t("点一个格子就能写：课程名用 英文 / 中文，多门课用分号或换行，离开格子即保存到草稿。行的科目决定家长点格子时看到哪些蜂巢课程。", "Click a cell to write: English / 中文 per course, several courses by semicolons or line breaks; leaving the cell keeps it in the draft. A row's subject decides which Hive courses families see when they tap a cell.") + "</p></div>";
  }

  // ---- the cell editor (Airtable-like: the cell is the input) ------------------------------
  function plOpenCell(cell) {
    var g = cell.getAttribute("data-cell"), rid = cell.getAttribute("data-row");
    var row = plState.draft.map[plState.stage].rows.filter(function (r) { return r.id === rid; })[0]; if (!row) return;
    var grades = (((plState.data.defaults || {}).map || {})[plState.stage] || {}).grades || [];
    var text = row.spanAll ? (row.cells[grades[0]] || "") : (row.cells[g] || "");
    cell.classList.add("open"); cell.innerHTML = '<textarea rows="1" data-cell="' + esc(g) + '" data-row="' + esc(rid) + '">' + esc(text.replace(/;\s*/g, "\n")) + "</textarea>";
    var ta = cell.querySelector("textarea"); coAutosize(ta); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
    ta.addEventListener("input", function () { coAutosize(ta); });
    ta.addEventListener("keydown", function (e) { if (e.key === "Escape") { ta.blur(); } if ((e.metaKey || e.ctrlKey) && e.key === "Enter") ta.blur(); });
    ta.addEventListener("blur", function () { plCloseCell(cell, ta); });
  }
  function plCloseCell(cell, ta) {
    if (!cell.isConnected) return;
    var g = ta.getAttribute("data-cell"), rid = ta.getAttribute("data-row");
    var row = plState.draft.map[plState.stage].rows.filter(function (r) { return r.id === rid; })[0];
    var v = ta.value.split(/\n/).map(function (x) { return x.trim(); }).filter(Boolean).join("; ");
    if (row) {
      var grades = (((plState.data.defaults || {}).map || {})[plState.stage] || {}).grades || [];
      var before = row.spanAll ? (row.cells[grades[0]] || "") : (row.cells[g] || "");
      if (v !== before) { if (row.spanAll) { row.cells = {}; grades.forEach(function (gg) { if (v) row.cells[gg] = v; }); } else if (v) row.cells[g] = v; else delete row.cells[g]; plState.dirty = true; }
    }
    var items = v ? v.split(/;\s*/) : [];
    cell.classList.remove("open"); cell.classList.toggle("empty", !items.length);
    cell.innerHTML = items.length ? items.map(function (x) { return '<span class="plchip">' + esc(x) + "</span>"; }).join("") : '<span class="plplus">＋</span>';
  }
  // ---- events ------------------------------------------------------------------------
  function bindPlan() {
    var body = $("plbody");
    body.addEventListener("click", function (e) {
      var c, dfl = (plState.data && plState.data.defaults) || {};
      if (e.target.closest("#plAddRow")) { var m = plState.draft.map[plState.stage], st0 = plState.stage; m.rows.push({ id: "n-" + Date.now().toString(36), subjects: dfl.subjects && dfl.subjects[0] ? [Object.assign({}, dfl.subjects[0])] : [], trackIds: st0 === "rhetoric" && !plState.allRows ? [Number(plState.track)] : [], pedagogy: st0 === "dialectic" && !plState.allRows ? plTrackPedagogy(plState.track) : null, spanAll: false, cells: {} }); plState.dirty = true; renderPlan(); return; }
      if (e.target.closest("#plCopyDefault")) { if (!window.confirm(t("用系统默认地图覆盖这个阶段现在的行？", "Replace this stage's rows with the system map?"))) return; plState.draft.map[plState.stage] = { rows: plRowsFromDefault(plState.stage) }; plState.dirty = true; renderPlan(); return; }
      // a cell opens into a textarea that fills it; the chip picker for tracks
      var cell = e.target.closest(".plcell.edit");
      if (cell && !cell.querySelector("textarea")) { plOpenCell(cell); return; }
      var tm = e.target.closest("button[data-trkmenu]");
      if (tm) { var mn = tm.nextSibling; var wasHidden = mn.hidden; body.querySelectorAll(".plpick .comenu").forEach(function (x) { x.hidden = true; }); mn.hidden = !wasHidden; return; }
      if (!e.target.closest(".plpick")) body.querySelectorAll(".plpick .comenu").forEach(function (x) { x.hidden = true; });
      var td = e.target.closest("button[data-trkdel]");
      if (td) { var rw = plState.draft.map[plState.stage].rows.filter(function (r) { return r.id === td.getAttribute("data-row"); })[0]; if (rw) { var n0 = Number(td.getAttribute("data-trkdel")); rw.trackIds = rw.trackIds.filter(function (x) { return x !== n0; }); plState.dirty = true; renderPlan(); } return; }
      var rowBtn = e.target.closest("button[data-del],button[data-up],button[data-down]");
      if (rowBtn) {
        var rows = plState.draft.map[plState.stage].rows, id = rowBtn.getAttribute("data-del") || rowBtn.getAttribute("data-up") || rowBtn.getAttribute("data-down"), i = rows.map(function (r) { return r.id; }).indexOf(id);
        if (i < 0) return;
        if (rowBtn.hasAttribute("data-del")) rows.splice(i, 1);
        else if (rowBtn.hasAttribute("data-up") && i > 0) { var a = rows[i - 1]; rows[i - 1] = rows[i]; rows[i] = a; }
        else if (rowBtn.hasAttribute("data-down") && i < rows.length - 1) { var b = rows[i + 1]; rows[i + 1] = rows[i]; rows[i] = b; }
        plState.dirty = true; renderPlan();
      }
    });
    body.addEventListener("change", function (e) {
      var c = e.target, tid = plState.track, st = plState.stage, m, dfl = (plState.data && plState.data.defaults) || {};
      if (c.id === "plAllRows") { plState.allRows = c.checked; renderPlan(); return; }
      if (c.id === "plOwn") { if (c.checked) { plState.draft.tracks[tid] = { credits: {}, totalCredits: null, serviceHours: null, notes: { en: "", zh: "" } }; } else delete plState.draft.tracks[tid]; plState.dirty = true; renderPlan(); return; }
      if (c.id === "plOwnMap") { if (c.checked) plState.draft.map[st] = { rows: plRowsFromDefault(st) }; else delete plState.draft.map[st]; plState.dirty = true; renderPlan(); return; }
      var ov = plState.draft.tracks[tid];
      if (ov && c.hasAttribute("data-credit")) { var k = c.getAttribute("data-credit"); if (c.value === "") delete ov.credits[k]; else ov.credits[k] = Number(c.value); plState.dirty = true; return; }
      if (ov && c.hasAttribute("data-off")) { var k2 = c.getAttribute("data-off"); if (c.checked) ov.credits[k2] = null; else delete ov.credits[k2]; plState.dirty = true; renderPlan(); return; }
      if (ov && c.id === "plTotal") { ov.totalCredits = c.value === "" ? null : Number(c.value); plState.dirty = true; return; }
      if (ov && c.id === "plHours") { ov.serviceHours = c.value === "" ? null : Number(c.value); plState.dirty = true; return; }
      if (ov && c.id === "plNoteZh") { ov.notes.zh = c.value; plState.dirty = true; return; }
      if (ov && c.id === "plNoteEn") { ov.notes.en = c.value; plState.dirty = true; return; }
      m = plState.draft.map[st]; if (!m) return;
      var rid = c.getAttribute("data-row") || c.getAttribute("data-subj") || c.getAttribute("data-span") || c.getAttribute("data-ped");
      var row = m.rows.filter(function (r) { return r.id === rid; })[0]; if (!row) return;
      if (c.hasAttribute("data-cell")) return; // the cell editor saves on blur (plCloseCell)
      if (c.hasAttribute("data-subj")) { var s = (dfl.subjects || []).filter(function (x) { return (x.id || x.nameEn) === c.value; })[0]; row.subjects = s ? [Object.assign({}, s)] : [{ id: null, nameEn: c.value, nameZh: c.value }]; plState.dirty = true; return; }
      if (c.hasAttribute("data-span")) { row.spanAll = c.checked; plState.dirty = true; renderPlan(); return; }
      if (c.hasAttribute("data-trk")) { var n = Number(c.getAttribute("data-trk")); row.trackIds = row.trackIds.filter(function (x) { return x !== n; }); if (c.checked) row.trackIds.push(n); row.trackIds.sort(); plState.dirty = true; renderPlan(); var again = $("plbody").querySelector('button[data-trkmenu="' + rid + '"]'); if (again) again.nextSibling.hidden = false; return; }
      if (c.hasAttribute("data-ped")) { row.pedagogy = c.value || null; plState.dirty = true; return; }
    });
  }
