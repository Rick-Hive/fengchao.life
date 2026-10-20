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
  // Layout (Rick, 2026-10-19, second review): two tabs — 课程地图 first (stage sub-tabs K–G6 / G7–G8 / G9–G12,
  // the whole school's map, nothing to do with one child's grade) and 高中毕业要求 (a sub-tab per direction the
  // school serves). The school's frame — pedagogy and directions — is set by the editors (sysadmin, the
  // school's leader, the curriculum director) and published with the plan; families choose nothing and keep
  // nothing of their own. Default frame: classical, international. The 本校自定义 switch sits in each card's head.
  // ================================================================================
  var plState = { domain: "", data: null, draft: null, tab: "map", stage: "grammar", track: "", dirty: false, canEdit: false, allRows: false };
  // pedagogy × direction = a graduation track (the website's TRACK_MAP)
  var PL_TRACK_MAP = { international: { classical: 1, nonclassical: 2 }, domestic: { classical: 3, nonclassical: 4 }, hybrid: { classical: 5, nonclassical: 6 } };
  var PL_DIRECTIONS = [["international", "国际", "International"], ["domestic", "国内", "Domestic"], ["hybrid", "混合 2+2", "Hybrid 2+2"]];
  var PL_STAGES = ["grammar", "dialectic", "rhetoric"];
  function plStageLabel(st, pedagogy) {
    var classical = { grammar: ["语法阶段 K–G6", "Grammar K–G6"], dialectic: ["逻辑阶段 G7–G8", "Dialectic G7–G8"], rhetoric: ["修辞阶段 G9–G12", "Rhetoric G9–G12"] };
    var plain = { grammar: ["小学 K–G6", "Elementary K–G6"], dialectic: ["初中 G7–G8", "Middle school G7–G8"], rhetoric: ["高中 G9–G12", "High school G9–G12"] };
    var m = (pedagogy === "classical" ? classical : plain)[st] || ["", ""]; return t(m[0], m[1]);
  }
  // the school's frame: from the draft (editors) or the publication (readers); absent = classical, international (Rick, 2026-10-19)
  function plSettings() { var st = plState.draft && plState.draft.settings; return st && st.pedagogy ? st : { pedagogy: "classical", directions: ["international"] }; }
  function plTracksOfSchool() { var st = plSettings(); return st.directions.map(function (d) { return String(PL_TRACK_MAP[d][st.pedagogy]); }); }
  function plDirectionOfTrack(id) { for (var d in PL_TRACK_MAP) for (var pdg in PL_TRACK_MAP[d]) if (String(PL_TRACK_MAP[d][pdg]) === String(id)) return d; return ""; }
  var PL_CREDITS = [["math", "数学", "Math"], ["science", "科学", "Science"], ["english", "英语", "English"], ["chinese", "中文", "Chinese"], ["social", "社会学", "Social Studies"], ["bible", "圣经 / 神学", "Bible / Theology"], ["speaking", "公众演讲", "Public Speaking"], ["secondLang", "第二外语", "Second Foreign Language"], ["fineArts", "艺术", "Fine Arts"], ["pe", "体育", "Physical Education"], ["elective", "选修", "Electives"]];
  // A track's pedagogy, as the website reads it (assets/app.js TRACK_MAP: odd ids classical, even non-classical).
  function plTrackPedagogy(id) { var n = Number(id); return n >= 1 && n <= 6 ? (n % 2 ? "classical" : "nonclassical") : null; }
  function plRowPedagogy(r) { if (r.pedagogy) return r.pedagogy; var ids = r.trackIds || []; if (!ids.length) return null; var ped = null; for (var i = 0; i < ids.length; i++) { var p = plTrackPedagogy(ids[i]); if (!p) continue; if (ped && ped !== p) return null; ped = p; } return ped; }
  // Does a map row apply to the school's frame? (rhetoric: one of the school's tracks; dialectic: the school's pedagogy; grammar: always)
  function plRowForSchool(r, st) {
    var tracks = plTracksOfSchool(), ped = plSettings().pedagogy;
    if (st === "rhetoric") return !(r.trackIds || []).length || (r.trackIds || []).some(function (id) { return tracks.indexOf(String(id)) >= 0; });
    if (st === "dialectic") { var p = plRowPedagogy(r); return !p || p === ped; }
    return true;
  }
  function planDomains() { return ((domainsInfo && domainsInfo.domains) || []).filter(function (d) { return d.can && d.can.plan; }); }
  function canSeePlan() { return planDomains().length > 0; }
  function plItemsText(items) { return (items || []).map(function (it) { return it.en && it.zh ? it.en + " / " + it.zh : it.en || it.zh || ""; }).filter(Boolean).join("; "); }
  function plSubjectName(s) { return s ? (pickName(s.nameZh, s.nameEn) || s.nameEn || s.nameZh || "") : ""; }
  function plTrackName(tr) { return tr ? (pickName(tr.nameZh, tr.nameEn) || ("#" + tr.trackId)) : ""; }
  // Blob → working copy (cells to text); working copy → request body (as is: the server parses text cells).
  function plFromBlob(part) {
    var p = part || {};
    var out = { tracks: {}, map: {}, settings: p.settings && p.settings.pedagogy ? { pedagogy: p.settings.pedagogy, directions: (p.settings.directions || []).slice() } : null };
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
    if (/^#\/plan\/credits/.test(location.hash)) plState.tab = "credits";
    var plActions = plState.canEdit ? '<button class="btn secondary sm" id="plReset">' + t("重置为系统默认", "Reset to system defaults") + '</button> <button class="btn secondary sm" id="plUnpub" hidden>' + t("撤回发布", "Unpublish") + '</button> <span class="plsaved muted" id="plSaved" hidden>' + t("已保存", "Saved") + '</span> <button class="btn sm" id="plPub">' + t("发布", "Publish") + "</button>" : "";
    setTitle(t("我的账号", "My account"), t("毕业要求与课程地图", "Graduation requirements & curriculum map"), plActions,
      { info: plState.canEdit
        ? t("设定教学法与方向，编辑课程地图和毕业要求；发布后本校可见。", "Set pedagogy and directions, edit the curriculum map and graduation requirements; publish to show the school.")
        : t("本校的课程地图和高中毕业要求。", "Your school's curriculum map and graduation requirements.") });
    $("content").innerHTML =
      '<div class="pagetabs" id="pltabs"><a class="ptab' + (plState.tab === "map" ? " on" : "") + '" href="#/plan" data-tab="map">' + t("课程地图", "Curriculum map") + '</a><a class="ptab' + (plState.tab === "credits" ? " on" : "") + '" href="#/plan/credits" data-tab="credits">' + t("高中毕业要求", "Graduation requirements") + "</a>" +
        "</div>" +
      '<div id="plframe"></div><div id="plmsg"></div><div id="plbody"><div class="loading">' + t("载入中…", "Loading…") + "</div></div>";
    plState.schools = plState.canEdit && ds.length > 1 ? ds : [];
    $("pltabs").addEventListener("click", function (e) { var a = e.target.closest("a[data-tab]"); if (!a) return; e.preventDefault(); plState.tab = a.getAttribute("data-tab"); history.replaceState(null, "", a.getAttribute("href")); $("pltabs").querySelectorAll(".ptab").forEach(function (x) { x.classList.toggle("on", x === a); }); renderPlan(); });
    if (plState.canEdit) {
      $("plPub").addEventListener("click", function () { if (window.confirm(t("发布后，本校所有登录的人看到的就是这个版本。发布？", "Once published, everyone at the school sees this version. Publish?"))) savePlan(true); });
      $("plUnpub").addEventListener("click", function () { if (!window.confirm(t("撤回后本校的人重新看到系统默认（草稿保留）。撤回？", "The school's people go back to the system defaults (the draft is kept). Unpublish?"))) return; var b = $("plUnpub"); savingButton(b, t("撤回中…", "Unpublishing…")); post("school-plan", "PUT", { domain: plState.domain, unpublish: true }).then(function (r) { restoreButton(b); if (!r.ok) { plMsg(errText(r), true); return; } plState.data = Object.assign({}, plState.data, r.body); plStatus(); flashOk(t("已撤回发布。", "Unpublished.")); }); });
      $("plReset").addEventListener("click", function () { if (!window.confirm(t("把草稿全部清空（每条路径和每个阶段都回到系统默认）？", "Clear the whole draft (every track and stage back to the system defaults)?"))) return; plState.draft = { tracks: {}, map: {}, settings: plState.draft.settings }; plDirty(); renderPlan(); });
      // the school's frame: pedagogy and directions, one line under the tabs (editors only)
      $("plframe").addEventListener("change", function (e) {
        var c = e.target, st = plSettings(), next = { pedagogy: st.pedagogy, directions: st.directions.slice() };
        if (c.id === "plsel") { plFlush().then(function () { plState.domain = c.value; loadPlan(); }); return; }
        if (c.id === "plPed") next.pedagogy = c.value;
        if (c.hasAttribute("data-dir")) { var d = c.getAttribute("data-dir"); next.directions = PL_DIRECTIONS.map(function (x) { return x[0]; }).filter(function (x) { return x === d ? c.checked : next.directions.indexOf(x) >= 0; }); if (!next.directions.length) { c.checked = true; flash(esc(t("至少保留一个方向。", "Keep at least one direction.")), 2000); return; } }
        plState.draft.settings = next; plDirty(); renderPlan();
      });
    }
    bindPlan(); // once per page: the listeners sit on #plbody, whose contents renderPlan() replaces
    loadPlan();
  }
  function plFrameHtml() {
    if (!plState.canEdit) return "";
    var st = plSettings();
    var school = plState.schools && plState.schools.length ? '<span class="plsel">' + t("学校", "School") + ' <select id="plsel">' + plState.schools.map(function (d) { return '<option value="' + esc(d.domain) + '"' + (d.domain === plState.domain ? " selected" : "") + ">" + esc(dname(d.domain)) + "</option>"; }).join("") + "</select></span>" : "";
    return '<div class="plframe">' + school + '<span class="plsel">' + t("教学法", "Pedagogy") + ' <select id="plPed"><option value="classical"' + (st.pedagogy === "classical" ? " selected" : "") + ">" + t("古典教育", "Classical") + '</option><option value="nonclassical"' + (st.pedagogy === "nonclassical" ? " selected" : "") + ">" + t("非古典", "Non-classical") + "</option></select></span>" +
      '<span class="plsel">' + t("高等教育路径", "Higher Education Path") + " " + PL_DIRECTIONS.map(function (d) { return '<label class="chk"><input type="checkbox" data-dir="' + d[0] + '"' + (st.directions.indexOf(d[0]) >= 0 ? " checked" : "") + " /> " + esc(t(d[1], d[2])) + "</label>"; }).join("") + "</span>" +
      tipI(t("随发布生效；本校的人按此看到地图和毕业要求。", "Published with the plan; the school's people see the curriculum map and graduation requirements for this frame.")) + "</div>";
  }
  function plMsg(text, bad) { if (!$("plmsg")) return; $("plmsg").innerHTML = text ? '<div class="msg ' + (bad ? "err" : "ok") + '">' + esc(text) + "</div>" : ""; }
  function loadPlan() {
    $("plbody").innerHTML = '<div class="loading">' + t("载入中…", "Loading…") + "</div>";
    var url = plState.canEdit ? "school-plan?domain=" + encodeURIComponent(plState.domain) : "school-plan?view=1";
    return api(url).then(function (r) {
      if (!r.ok) { $("plbody").innerHTML = '<div class="msg err">' + esc(errText(r)) + "</div>"; return; }
      plState.data = r.body; if (!plState.canEdit) plState.domain = r.body.domain || "";
      // editors work on the draft; everyone else reads what is published (nothing published = the system defaults)
      plState.draft = plFromBlob(r.body.plan && (plState.canEdit ? r.body.plan.draft : r.body.plan.published)); plState.dirty = false;
      plStatus(); renderPlan();
    });
  }
  // No status line in the bar (Rick, 2026-10-19: 「delete this … move the second line above」): the card tags say
  // 系统默认 / 本校版本 / 学校版本, and 撤回发布 shows only while something is published.
  function plStatus() {
    var d = plState.data, p = d && d.plan; if (!d) return;
    if ($("plUnpub")) $("plUnpub").hidden = !(p && p.published);
    if (!plState.canEdit) setPageInfo(plReaderInfo());
  }
  // The reader's ⓘ says who set this up for them and who can change it (Rick, 2026-10-19: 「告诉普通用户谁帮他
  // 订制了毕业要求和课程地图。谁可以修改」).
  function plReaderInfo() {
    var d = plState.data, p = d && d.plan && d.plan.published, who = t("校长、课程总监、系统管理员", "principal, curriculum director, system administrator");
    if (p) return t("学校版本，" + day(p.at) + " 发布。可修改：" + who + "。", "School edition, published " + day(p.at) + ". Editable by: " + who + ".");
    return t("学校尚未发布，显示系统默认。可设定：" + who + "。", "Not published by the school yet; system default. Set by: " + who + ".");
  }
  // The draft saves itself (Rick, 2026-10-19: 「如果是自动保存，还有必要按钮 Save draft 吗？」): 1.5 s after the last
  // change, quietly — the page is not re-rendered, a small 已保存 shows for a moment. Publish sends the same draft.
  var plSaveTimer = null, plSaving = null, plSeq = 0;
  function plDirty() { plState.dirty = true; plSeq++; clearTimeout(plSaveTimer); plSaveTimer = setTimeout(plAutosave, 1500); }
  function plBody(publish) { var body = { domain: plState.domain, tracks: plState.draft.tracks, map: plState.draft.map, settings: plSettings() }; if (publish) body.publish = true; return body; }
  function plAutosave() {
    clearTimeout(plSaveTimer); plSaveTimer = null;
    if (!plState.dirty || !plState.canEdit || !plState.draft) return Promise.resolve();
    if (plSaving) return plSaving.then(plAutosave);
    var seq = plSeq, domain = plState.domain;
    plSaving = post("school-plan", "PUT", plBody(false)).then(function (r) {
      plSaving = null;
      if (!r.ok) { plMsg(errText(r) + (r.body && r.body.problems ? " — " + r.body.problems.join("; ") : ""), true); return; }
      if (plState.domain !== domain) return;
      plState.data = Object.assign({}, plState.data, r.body); if (seq === plSeq) plState.dirty = false;
      plMsg(""); plStatus();
      var m = $("plSaved"); if (m) { m.hidden = false; clearTimeout(m._t); m._t = setTimeout(function () { m.hidden = true; }, 2000); }
    });
    return plSaving;
  }
  function plFlush() { return plState.dirty ? plAutosave() : (plSaving || Promise.resolve()); }
  // closing the tab before the 1.5 s: send the draft anyway (keepalive survives the unload)
  window.addEventListener("pagehide", function () { if (plState.dirty && plState.canEdit && plState.draft) { plState.dirty = false; fetch("/api/school-plan", { method: "PUT", credentials: "same-origin", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify(plBody(false)) }).catch(function () {}); } });
  function savePlan(publish) {
    var b = $("plPub"); savingButton(b, t("发布中…", "Publishing…"));
    clearTimeout(plSaveTimer); plSaveTimer = null;
    return (plSaving || Promise.resolve()).then(function () { return post("school-plan", "PUT", plBody(true)); }).then(function (r) {
      restoreButton(b);
      if (!r.ok) { plMsg(errText(r) + (r.body && r.body.problems ? " — " + r.body.problems.join("; ") : ""), true); return; }
      plState.data = Object.assign({}, plState.data, r.body); plState.draft = plFromBlob(r.body.plan && r.body.plan.draft); plState.dirty = false;
      plMsg(""); plStatus(); renderPlan();
      flashOk(t("已发布：本校的人在这里看到学校版本。", "Published: the school's people see the school edition here."));
    });
  }
  function renderPlan() {
    if (!plState.data || !$("plbody")) return;
    if ($("plframe")) { $("plframe").innerHTML = plFrameHtml(); tipify($("plframe")); }
    var tracks = plTracksOfSchool(); if (tracks.indexOf(plState.track) < 0) plState.track = tracks[0] || "";
    $("plbody").innerHTML = plState.tab === "credits" ? planCreditsHtml() : planMapHtml();
  }
  // second-level tabs inside a card head (stages; directions)
  function plSubTabs(items, cur, attr) { return items.length > 1 ? '<span class="plsubtabs">' + items.map(function (it) { return '<button type="button" class="plsub' + (it[0] === cur ? " on" : "") + '" ' + attr + '="' + esc(it[0]) + '">' + esc(it[1]) + (it[2] ? ' <span class="cnt">' + esc(it[2]) + "</span>" : "") + "</button>"; }).join("") + "</span>" : ""; }
  // The switch in a card's head (editors only): compact, no second line (Rick, 2026-10-19: 「单独占据了 1 行，实在不应该」).
  function plOwnSwitch(id, on, label, hint) { return plState.canEdit ? '<label class="sw head" title="' + esc(hint) + '"><input type="checkbox" id="' + id + '"' + (on ? " checked" : "") + ' /><span class="track"></span><span class="swt">' + esc(label) + "</span></label>" : ""; }
  // the edition tag: 本校版本 / 学校版本, or 系统默认 (Rick, 2026-10-19: not "系统默认")
  function plEditionTag(on) { return on ? ' <span class="tag ok">' + (plState.canEdit ? t("本校版本", "School edition") : t("学校版本", "School edition")) + "</span>" : ' <span class="tag muted">' + t("系统默认", "System default") + "</span>"; }

  // ---- 毕业学分要求 ------------------------------------------------------------------
  function planCreditsHtml() {
    var dfl = plState.data.defaults || {}, trs = dfl.tracks || [];
    if (!trs.length) return '<div class="card"><p class="sub">' + t("数据快照里还没有毕业路径。", "The data snapshot has no graduation tracks yet.") + "</p></div>";
    var tracks = plTracksOfSchool();
    var tr = trs.filter(function (x) { return String(x.trackId) === plState.track; })[0];
    if (!tr) return '<div class="card"><p class="sub">' + t("数据快照里没有这条毕业路径。", "The data snapshot has no such graduation track.") + "</p></div>";
    var ov = plState.draft.tracks[plState.track], edit = plState.canEdit && !!ov;
    var unit = t("学分", "credits");
    var subs = plSubTabs(tracks.map(function (id) { var d = PL_DIRECTIONS.filter(function (x) { return x[0] === plDirectionOfTrack(id); })[0]; return [id, d ? t(d[1], d[2]) : "#" + id, plState.draft.tracks[id] ? t("本校", "school") : ""]; }), plState.track, "data-track");
    var head = '<div class="card plcard"><div class="ch plhead"><h2>' + subs + ' <span class="muted">' + esc(plTrackName(tr)) + "</span>" + plEditionTag(!!ov) + "</h2>" +
      plOwnSwitch("plOwn", !!ov, t("本校自定义", "School's own"), t("打开：本校设置这条路径的学分要求；关闭：显示系统默认的数字。", "On: the school sets this track's credit requirements; off: the system figures show.")) + "</div>";
    if (!edit) {
      // read-only: the system figures, or the school's over them
      var o = ov || { credits: {}, notes: {} };
      var armC = plState.canEdit && !ov ? ' plarm" title="' + esc(t("点击修改（打开本校自定义）", "Click to change (turns on the school's own)")) + '"' : '"';
      var rowsR = PL_CREDITS.map(function (c) { var dv = tr.credits ? tr.credits[c[0]] : null, has = Object.prototype.hasOwnProperty.call(o.credits, c[0]), v = has ? o.credits[c[0]] : dv; return v == null ? "" : "<tr><td>" + esc(t(c[1], c[2])) + '</td><td class="num' + armC + ' data-credit="' + c[0] + '">' + esc(String(v)) + (has && dv != null && v !== dv ? ' <small class="muted">(' + t("系统 ", "system ") + esc(String(dv)) + ")</small>" : "") + "</td></tr>"; }).join("");
      var total = ov && ov.totalCredits != null ? ov.totalCredits : tr.totalCredits, hours = ov && ov.serviceHours != null ? ov.serviceHours : tr.serviceHours;
      var note = ov && (o.notes.zh || o.notes.en) ? pickName(o.notes.zh, o.notes.en) : pickName(tr.commentsZh, tr.commentsEn);
      return head + '<table class="data"><thead><tr><th>' + t("科目", "Subject") + '</th><th class="num">' + unit + "</th></tr></thead><tbody>" + rowsR +
        "<tr><td><b>" + t("总学分", "Total credits") + '</b></td><td class="num' + armC + ' data-field="plTotal"><b>' + esc(total == null ? "—" : String(total)) + "</b></td></tr><tr><td>" + t("服务小时", "Service hours") + '</td><td class="num' + armC + ' data-field="plHours">' + esc(hours == null ? "—" : String(hours)) + "</td></tr></tbody></table>" +
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
    var ped = plSettings().pedagogy;
    var subs = plSubTabs(PL_STAGES.map(function (x) { return [x, plStageLabel(x, ped), plState.draft.map[x] ? t("本校", "school") : ""]; }), st, "data-stage");
    var head = '<div class="card plcard"><div class="ch plhead"><h2>' + subs + plEditionTag(!!own) + "</h2>" +
      (edit && st !== "grammar" ? '<label class="chk plall"><input type="checkbox" id="plAllRows"' + (plState.allRows ? " checked" : "") + " /> " + t("显示所有路径的行", "Rows of every track") + "</label>" : "") +
      plOwnSwitch("plOwnMap", !!own, t("本校自定义", "School's own"), t("打开：从系统默认地图复制一份作为起点，本校自己编排这个阶段；关闭：显示系统默认的地图。", "On: start from a copy of the system default curriculum map and lay out this stage yourself; off: the system default map shows.")) + "</div>";
    var forTrack = function (r) { return plState.allRows && edit ? true : plRowForSchool(r, st); };
    // A cell shows its courses / books as chips. In the editor every chip is one record, like Airtable (Rick,
    // 2026-10-19: 「每一个小格子都是一本书，点击一本书弹出编辑；最下方增加 + 号」): click → a popover with the English
    // and Chinese names and 删除; ＋ under the chips adds one; × on a hovered chip removes it at once.
    function chipsOf(text) { return String(text || "").split(/[;\n]/).map(function (x) { return x.trim(); }).filter(Boolean); }
    function cellBox(r, g, text, editable) {
      var items = chipsOf(text);
      return '<div class="plcell' + (editable ? " edit" : "") + (items.length ? "" : " empty") + '"' + (editable ? ' data-cell="' + esc(g) + '" data-row="' + esc(r.id) + '"' : "") + '>' +
        items.map(function (x, i) { return '<span class="plchip' + (editable ? " book" : "") + '"' + (editable ? ' data-i="' + i + '" tabindex="0"' : "") + ">" + esc(x) + (editable ? '<button type="button" class="plx" data-del-i="' + i + '" title="' + t("删除", "Remove") + '">×</button>' : "") + "</span>"; }).join("") +
        (editable ? '<button type="button" class="plplus" title="' + t("添加", "Add") + '">＋</button>' : "") + "</div>";
    }
    function cellsHtml(r, editable) {
      if (r.spanAll) return '<td colspan="' + grades.length + '">' + cellBox(r, "", r.cells[grades[0]] || r.cells[""] || firstCell(r), editable) + "</td>";
      return grades.map(function (g) { return "<td>" + cellBox(r, g, r.cells[g] || "", editable) + "</td>"; }).join("");
    }
    function firstCell(r) { for (var i = 0; i < grades.length; i++) if (r.cells[grades[i]]) return r.cells[grades[i]]; return ""; }
    // The 路径 / 教育法 column only when it carries information (Rick, 2026-10-19: 「课程设置中为什么要显示路径？」):
    // never for readers (the rows are already the school's), for editors only with several directions or every row shown.
    var showScope = edit && (plState.allRows || (st === "rhetoric" && plTracksOfSchool().length > 1));
    var thead = "<thead><tr><th>" + t("科目", "Subject") + "</th>" + (showScope ? "<th>" + (st === "rhetoric" ? t("路径", "Tracks") : t("教育法", "Pedagogy")) + "</th>" : "") + grades.map(function (g) { return "<th>" + esc(g) + "</th>"; }).join("") + (edit ? "<th></th>" : "") + "</tr></thead>";
    if (!edit) {
      var dconv = own || plFromBlob({ map: { x: dm } }).map.x, dall = dconv ? dconv.rows : [];
      // An editor sees the system default: the cells are "armed" — the first click on a course or ＋ turns 本校自定义 on
      // (a copy of the default) and opens that very cell (Rick, 2026-10-20: 「Dialectic 和 Rhetoric 中的课程不可以点击」).
      var arm = plState.canEdit && !own;
      var drows = dall.map(function (r, i) { return { r: r, id: "s-" + st + "-" + (i + 1) }; }).filter(function (x) { return forTrack(x.r); });
      return head + '<div class="tbl-wrap"><table class="data plmap' + (arm ? " arm" : "") + '">' + thead + "<tbody>" + (drows.length ? drows.map(function (x) { var r = x.r; return "<tr><td>" + esc(r.subjects.map(plSubjectName).join(" · ") || "—") + "</td>" + scopeCell(r, false) + (arm ? cellsHtml(Object.assign({}, r, { id: x.id }), true).replace(/class="plcell edit/g, 'class="plcell arm') : cellsHtml(r, false)) + "</tr>"; }).join("") : '<tr><td colspan="' + (grades.length + (showScope ? 2 : 1)) + '" class="muted">' + t("这个阶段还没有课程地图。", "No curriculum map for this stage yet.") + (arm ? ' <button type="button" class="lnk" id="plStartOwn">' + t("本校自己编排", "Lay it out for the school") + "</button>" : "") + "</td></tr>") + "</tbody></table></div></div>";
    }
    function scopeCell(r, editable) {
      if (!showScope || st === "grammar") return "";
      // chip text: the direction alone while every row shares the school's pedagogy; the full track name when every row is shown
      var chipName = function (x) { var d = PL_DIRECTIONS.filter(function (y) { return y[0] === plDirectionOfTrack(x.trackId); })[0]; return plState.allRows || !d ? plTrackName(x) : t(d[1], d[2]); };
      if (st === "rhetoric") {
        var trs = dfl.tracks || [];
        var chips = r.trackIds.length ? r.trackIds.map(function (id) { var x = trs.filter(function (y) { return y.trackId === id; })[0]; return '<span class="plchip soft">' + esc(x ? chipName(x) : "#" + id) + (editable ? '<button type="button" class="x" data-trkdel="' + id + '" data-row="' + esc(r.id) + '" aria-label="remove">×</button>' : "") + "</span>"; }).join("") : '<span class="muted">' + t("全部路径", "All tracks") + "</span>";
        // the picker is a small menu, not six checkboxes stacked in the row
        var menu = editable ? '<span class="plpick"><button type="button" class="plplusbtn" data-trkmenu="' + esc(r.id) + '" title="' + esc(t("选择路径", "Choose tracks")) + '">＋</button><div class="comenu" hidden>' + trs.map(function (x) { return '<label class="mi chk"><input type="checkbox" data-trk="' + x.trackId + '" data-row="' + esc(r.id) + '"' + (r.trackIds.indexOf(x.trackId) >= 0 ? " checked" : "") + " /> " + esc(chipName(x)) + "</label>"; }).join("") + "</div></span>" : "";
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
      return '<tr data-row="' + esc(r.id) + '"><td><select class="sm" data-subj="' + esc(r.id) + '">' + (known ? "" : '<option value="' + esc(cur) + '" selected>' + esc(plSubjectName(r.subjects[0]) || t("（选择科目）", "(choose a subject)")) + "</option>") + subjects.map(function (s) { var k = s.id || s.nameEn; return '<option value="' + esc(k) + '"' + (k === cur ? " selected" : "") + ">" + esc(plSubjectName(s)) + "</option>"; }).join("") + "</select></td>" + scopeCell(r, true) + cellsHtml(r, true) +
        // 各年级相同 (spanAll: one course across every grade of the stage, from Airtable's "All grades" column) is a
        // row option, not a line under the subject (Rick, 2026-10-19: 「为什么会出现各年级相同」): a small toggle by ↑ ↓ ×.
        '<td class="plrowbtns"><button type="button" class="lnk span" data-span="' + esc(r.id) + '" aria-pressed="' + (r.spanAll ? "true" : "false") + '" title="' + t("各年级相同：一门课贯穿本阶段所有年级（合并为一格）", "Same every grade: one course across the whole stage (one merged cell)") + '">↔</button><button type="button" class="lnk" data-up="' + esc(r.id) + '" title="' + t("上移", "Move up") + '"' + (i === 0 ? " disabled" : "") + '>↑</button><button type="button" class="lnk" data-down="' + esc(r.id) + '" title="' + t("下移", "Move down") + '"' + (i === shown.length - 1 ? " disabled" : "") + '>↓</button><button type="button" class="lnk del" data-del="' + esc(r.id) + '" title="' + t("删除这一行", "Delete the row") + '">×</button></td></tr>';
    }).join("");
    return head + '<div class="tbl-wrap"><table class="data plmap edit">' + thead + "<tbody>" + rows + "</tbody></table></div>" +
      (hidden ? '<p class="sub" style="margin-top:6px">' + hidden + t(" 行属于本校未选的路径或教学法，勾「显示所有路径的行」可见。", " row(s) belong to tracks or a pedagogy the school does not serve — tick “Rows of every track” to see them.") + "</p>" : "") +
      '<div class="actions" style="margin-top:8px"><button type="button" class="btn secondary sm" id="plAddRow">' + t("＋ 添加一行", "+ Add a row") + '</button> <button type="button" class="btn secondary sm" id="plCopyDefault">' + t("从系统默认重新复制", "Copy the system default map again") + "</button></div>" +
      '<p class="sub" style="margin-top:8px">' + t("点一本书或一门课可修改，格子下方的 ＋ 添加，悬停时的 × 删除；改动自动保存。行的科目决定家长点格子时看到哪些蜂巢课程。", "Click a book or course to edit it, ＋ under the cell adds one, × on hover removes it; changes save themselves. A row's subject decides which Hive courses parents see when they tap a cell.") + "</p></div>";
  }

  // ---- the book / course editor: one chip = one record (Airtable-like popover) ------------
  function plGrades() { return (((plState.data.defaults || {}).map || {})[plState.stage] || {}).grades || []; }
  function plRowById(rid) { return plState.draft.map[plState.stage].rows.filter(function (r) { return r.id === rid; })[0]; }
  function plCellItems(row, g) { var grades = plGrades(); return chipsOfText(row.spanAll ? (row.cells[grades[0]] || "") : (row.cells[g] || "")); }
  function chipsOfText(text) { return String(text || "").split(/[;\n]/).map(function (x) { return x.trim(); }).filter(Boolean); }
  function plSetCell(row, g, items) {
    var v = items.join("; "), grades = plGrades();
    if (row.spanAll) { row.cells = {}; grades.forEach(function (gg) { if (v) row.cells[gg] = v; }); } else if (v) row.cells[g] = v; else delete row.cells[g];
    plDirty();
  }
  function plSplitItem(x) { var m = /^(.*?)\s*\/\s*(.*)$/.exec(x || ""); if (m) return { en: m[1].trim(), zh: m[2].trim() }; return /[\u3400-\u9fff]/.test(x || "") ? { en: "", zh: (x || "").trim() } : { en: (x || "").trim(), zh: "" }; }
  function plJoinItem(en, zh) { en = (en || "").trim(); zh = (zh || "").trim(); return en && zh ? en + " / " + zh : en || zh; }
  var plPop = { cell: null, i: -1 };
  function plPopNode() { return $("plpop") || document.body.appendChild(Object.assign(document.createElement("div"), { id: "plpop", className: "plpop", hidden: true })); }
  // open the popover for chip i of the cell (i = -1: a new one), under the chip or the ＋
  function plBookOpen(cell, i, anchor) {
    var box0 = $("plpop");
    if (box0 && !box0.hidden) { // another chip while one is open: keep that change first (the grid re-renders)
      var rid0 = cell.getAttribute("data-row"), g0 = cell.getAttribute("data-cell"); plBookClose(true);
      cell = $("plbody") && $("plbody").querySelector('.plcell[data-row="' + rid0 + '"][data-cell="' + g0 + '"]'); if (!cell) return;
      anchor = i >= 0 ? cell.querySelector('.plchip[data-i="' + i + '"]') : cell.querySelector(".plplus"); if (!anchor) return;
    }
    var row = plRowById(cell.getAttribute("data-row")); if (!row) return;
    var items = plCellItems(row, cell.getAttribute("data-cell")), cur = i >= 0 ? plSplitItem(items[i]) : { en: "", zh: "" };
    var box = plPopNode(); plPop = { cell: cell, i: i, items: items, before: plJoinItem(cur.en, cur.zh) };
    box.innerHTML = '<label>' + t("英文名", "English name") + '<input type="text" id="plpopEn" value="' + esc(cur.en) + '" placeholder="e.g. The Ugly Duckling" /></label>' +
      '<label>' + t("中文名", "Chinese name") + '<input type="text" id="plpopZh" value="' + esc(cur.zh) + '" placeholder="如 《丑小鸭》" /></label>' +
      '<div class="plpop-actions">' + (i >= 0 ? '<button type="button" class="lnk del" id="plpopDel">' + t("删除", "Delete") + "</button>" : "") + '<span class="sp"></span><button type="button" class="btn secondary sm" id="plpopCancel">' + t("取消", "Cancel") + '</button><button type="button" class="btn sm" id="plpopOk">' + t("保存", "Save") + "</button></div>";
    box.hidden = false;
    var r = anchor.getBoundingClientRect(), w = 300; var left = Math.min(Math.max(8, r.left), window.innerWidth - w - 8), top = r.bottom + 6; if (top + 150 > window.innerHeight) top = Math.max(8, r.top - 156);
    box.style.left = Math.round(left) + "px"; box.style.top = Math.round(top) + "px"; box.style.width = w + "px";
    $("plpopEn").focus();
  }
  function plBookClose(save) {
    var box = $("plpop"); if (!box || box.hidden) return;
    var cell = plPop.cell, i = plPop.i, items = plPop.items.slice();
    if (save && cell && cell.isConnected) {
      var v = plJoinItem($("plpopEn").value, $("plpopZh").value);
      if (i >= 0) { if (v) items[i] = v; else items.splice(i, 1); } else if (v) items.push(v);
      if (v !== plPop.before || (i < 0 && v)) { var row = plRowById(cell.getAttribute("data-row")); if (row) { plSetCell(row, cell.getAttribute("data-cell"), items); renderPlan(); } }
    }
    box.hidden = true; plPop = { cell: null, i: -1 };
  }
  function plBookDelete() {
    var cell = plPop.cell, i = plPop.i, items = plPop.items.slice(); if (!cell || i < 0) return;
    items.splice(i, 1); var row = plRowById(cell.getAttribute("data-row")); if (row) { plSetCell(row, cell.getAttribute("data-cell"), items); }
    $("plpop").hidden = true; plPop = { cell: null, i: -1 }; renderPlan();
  }
  document.addEventListener("click", function (e) {
    var box = $("plpop"); if (!box || box.hidden) return;
    if (e.target.closest("#plpopOk")) { plBookClose(true); return; }
    if (e.target.closest("#plpopCancel")) { plBookClose(false); return; }
    if (e.target.closest("#plpopDel")) { plBookDelete(); return; }
    if (!box.contains(e.target) && !e.target.closest(".plchip.book,.plplus")) plBookClose(true); // like Airtable: leaving keeps the change
  });
  document.addEventListener("keydown", function (e) {
    var box = $("plpop"); if (!box || box.hidden || !box.contains(e.target)) return;
    if (e.key === "Escape") { e.preventDefault(); plBookClose(false); }
    if (e.key === "Enter") { e.preventDefault(); plBookClose(true); }
  });
  // ---- events ------------------------------------------------------------------------
  function bindPlan() {
    var body = $("plbody");
    body.addEventListener("click", function (e) {
      var c, dfl = (plState.data && plState.data.defaults) || {};
      if (e.target.closest("#plAddRow")) { var m = plState.draft.map[plState.stage], st0 = plState.stage; m.rows.push({ id: "n-" + Date.now().toString(36), subjects: dfl.subjects && dfl.subjects[0] ? [Object.assign({}, dfl.subjects[0])] : [], trackIds: st0 === "rhetoric" && !plState.allRows ? plTracksOfSchool().map(Number) : [], pedagogy: st0 === "dialectic" && !plState.allRows ? plSettings().pedagogy : null, spanAll: false, cells: {} }); plDirty(); renderPlan(); return; }
      if (e.target.closest("#plCopyDefault")) { if (!window.confirm(t("用系统默认地图覆盖这个阶段现在的行？", "Replace this stage's rows with the system default curriculum map?"))) return; plState.draft.map[plState.stage] = { rows: plRowsFromDefault(plState.stage) }; plDirty(); renderPlan(); return; }
      var sub = e.target.closest(".plsub[data-stage],.plsub[data-track]");
      if (sub) { if (sub.hasAttribute("data-stage")) plState.stage = sub.getAttribute("data-stage"); else plState.track = sub.getAttribute("data-track"); renderPlan(); return; }
      // an armed cell (system default shown to an editor): turn 本校自定义 on, then open the same cell
      var armCell = e.target.closest(".plcell.arm");
      if (armCell) {
        var stA = plState.stage, ridA = armCell.getAttribute("data-row"), gA = armCell.getAttribute("data-cell"), chipA = e.target.closest(".plchip"), iA = chipA ? Number(chipA.getAttribute("data-i")) : -1;
        if (e.target.closest(".plx")) iA = -2;
        if (!plState.draft.map[stA]) { plState.draft.map[stA] = { rows: plRowsFromDefault(stA) }; plDirty(); }
        renderPlan();
        var cellA = $("plbody").querySelector('.plcell.edit[data-row="' + ridA + '"][data-cell="' + gA + '"]'); if (!cellA) return;
        if (iA === -2) { var rwA = plRowById(ridA); if (rwA) { var itA = plCellItems(rwA, gA); itA.splice(Number(chipA.querySelector(".plx").getAttribute("data-del-i")), 1); plSetCell(rwA, gA, itA); renderPlan(); } return; }
        var anchorA = iA >= 0 ? cellA.querySelector('.plchip[data-i="' + iA + '"]') : cellA.querySelector(".plplus"); if (anchorA) plBookOpen(cellA, iA, anchorA);
        return;
      }
      if (e.target.closest("#plStartOwn")) { plState.draft.map[plState.stage] = { rows: [] }; plDirty(); renderPlan(); return; }
      var armNum = e.target.closest("td.plarm");
      if (armNum) {
        var tidA = plState.track; if (!plState.draft.tracks[tidA]) { plState.draft.tracks[tidA] = { credits: {}, totalCredits: null, serviceHours: null, notes: { en: "", zh: "" } }; plDirty(); }
        renderPlan();
        var inp = armNum.hasAttribute("data-credit") ? $("plbody").querySelector('input[data-credit="' + armNum.getAttribute("data-credit") + '"]') : $(armNum.getAttribute("data-field")); if (inp) { inp.focus(); inp.select(); }
        return;
      }
      // a chip is a book: click → the popover; × removes it; ＋ adds one
      var cell = e.target.closest(".plcell.edit");
      if (cell) {
        var x = e.target.closest(".plx"); if (x) { var rw0 = plRowById(cell.getAttribute("data-row")); if (rw0) { var it0 = plCellItems(rw0, cell.getAttribute("data-cell")); it0.splice(Number(x.getAttribute("data-del-i")), 1); plSetCell(rw0, cell.getAttribute("data-cell"), it0); renderPlan(); } return; }
        var chip = e.target.closest(".plchip.book"); if (chip) { plBookOpen(cell, Number(chip.getAttribute("data-i")), chip); return; }
        var plus = e.target.closest(".plplus"); if (plus) { plBookOpen(cell, -1, plus); return; }
        return;
      }
      var tm = e.target.closest("button[data-trkmenu]");
      if (tm) { var mn = tm.nextSibling; var wasHidden = mn.hidden; body.querySelectorAll(".plpick .comenu").forEach(function (x) { x.hidden = true; }); mn.hidden = !wasHidden; return; }
      if (!e.target.closest(".plpick")) body.querySelectorAll(".plpick .comenu").forEach(function (x) { x.hidden = true; });
      var td = e.target.closest("button[data-trkdel]");
      if (td) { var rw = plState.draft.map[plState.stage].rows.filter(function (r) { return r.id === td.getAttribute("data-row"); })[0]; if (rw) { var n0 = Number(td.getAttribute("data-trkdel")); rw.trackIds = rw.trackIds.filter(function (x) { return x !== n0; }); plDirty(); renderPlan(); } return; }
      var spanBtn = e.target.closest("button[data-span]");
      if (spanBtn) { var sr = plState.draft.map[plState.stage].rows.filter(function (r) { return r.id === spanBtn.getAttribute("data-span"); })[0]; if (sr) { sr.spanAll = !sr.spanAll; plDirty(); renderPlan(); } return; }
      var rowBtn = e.target.closest("button[data-del],button[data-up],button[data-down]");
      if (rowBtn) {
        var rows = plState.draft.map[plState.stage].rows, id = rowBtn.getAttribute("data-del") || rowBtn.getAttribute("data-up") || rowBtn.getAttribute("data-down"), i = rows.map(function (r) { return r.id; }).indexOf(id);
        if (i < 0) return;
        if (rowBtn.hasAttribute("data-del")) rows.splice(i, 1);
        else if (rowBtn.hasAttribute("data-up") && i > 0) { var a = rows[i - 1]; rows[i - 1] = rows[i]; rows[i] = a; }
        else if (rowBtn.hasAttribute("data-down") && i < rows.length - 1) { var b = rows[i + 1]; rows[i + 1] = rows[i]; rows[i] = b; }
        plDirty(); renderPlan();
      }
    });
    body.addEventListener("change", function (e) {
      var c = e.target, tid = plState.track, st = plState.stage, m, dfl = (plState.data && plState.data.defaults) || {};
      if (c.id === "plAllRows") { plState.allRows = c.checked; renderPlan(); return; }
      if (c.id === "plOwn") { if (c.checked) { plState.draft.tracks[tid] = { credits: {}, totalCredits: null, serviceHours: null, notes: { en: "", zh: "" } }; } else delete plState.draft.tracks[tid]; plDirty(); renderPlan(); return; }
      if (c.id === "plOwnMap") { if (c.checked) plState.draft.map[st] = { rows: plRowsFromDefault(st) }; else delete plState.draft.map[st]; plDirty(); renderPlan(); return; }
      var ov = plState.draft.tracks[tid];
      if (ov && c.hasAttribute("data-credit")) { var k = c.getAttribute("data-credit"); if (c.value === "") delete ov.credits[k]; else ov.credits[k] = Number(c.value); plDirty(); return; }
      if (ov && c.hasAttribute("data-off")) { var k2 = c.getAttribute("data-off"); if (c.checked) ov.credits[k2] = null; else delete ov.credits[k2]; plDirty(); renderPlan(); return; }
      if (ov && c.id === "plTotal") { ov.totalCredits = c.value === "" ? null : Number(c.value); plDirty(); return; }
      if (ov && c.id === "plHours") { ov.serviceHours = c.value === "" ? null : Number(c.value); plDirty(); return; }
      if (ov && c.id === "plNoteZh") { ov.notes.zh = c.value; plDirty(); return; }
      if (ov && c.id === "plNoteEn") { ov.notes.en = c.value; plDirty(); return; }
      m = plState.draft.map[st]; if (!m) return;
      var rid = c.getAttribute("data-row") || c.getAttribute("data-subj") || c.getAttribute("data-span") || c.getAttribute("data-ped");
      var row = m.rows.filter(function (r) { return r.id === rid; })[0]; if (!row) return;
      if (c.hasAttribute("data-cell")) return; // the cell editor saves on blur (plCloseCell)
      if (c.hasAttribute("data-subj")) { var s = (dfl.subjects || []).filter(function (x) { return (x.id || x.nameEn) === c.value; })[0]; row.subjects = s ? [Object.assign({}, s)] : [{ id: null, nameEn: c.value, nameZh: c.value }]; plDirty(); return; }
      if (c.hasAttribute("data-trk")) { var n = Number(c.getAttribute("data-trk")); row.trackIds = row.trackIds.filter(function (x) { return x !== n; }); if (c.checked) row.trackIds.push(n); row.trackIds.sort(); plDirty(); renderPlan(); var again = $("plbody").querySelector('button[data-trkmenu="' + rid + '"]'); if (again) again.nextSibling.hidden = false; return; }
      if (c.hasAttribute("data-ped")) { row.pedagogy = c.value || null; plDirty(); return; }
    });
  }
