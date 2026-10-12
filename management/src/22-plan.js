// management/src/22-plan.js — 本域管理 › 课程方案: a school's own graduation credit requirements
// and curriculum map, edited by its 教育领袖 (domain_leader) and published to the school's families.
// Part of management.js: scripts/build-management.js concatenates management/src/*.js in name order
// into management/management.js (one closure; every part sees every other's functions). Edit here, not the built file.

  // ================================================================================
  // 课程方案 (Rick, 2026-10-08/12: 「每所学校自定义毕业学分要求和课程地图，本校家庭看到学校版本……
  // 地图上要显示蜂巢能提供的课程。如果学校没有编辑和提交，家长根据选课向导生成自己的毕业学分
  // 要求，看到蜂巢提供的默认课程地图」).
  //
  // Server: GET/PUT /api/school-plan?domain= (api/shared/schoolPlan.js). The page edits the
  // DRAFT; 发布 copies it to what families see on the website; 撤回发布 takes it away again
  // (Hive's defaults return). A track or a stage the school leaves "蜂巢默认" is simply
  // absent from the draft, so Hive's own figures / map show for it.
  //
  // Working copy (plState.draft) mirrors the blob, except map cells are the editor's
  // text ("English / 中文; next item") — the server parses them like the Airtable sync.
  // ================================================================================
  var plState = { domain: "", data: null, draft: null, tab: "credits", track: "", stage: "rhetoric", dirty: false, msg: "" };
  var PL_STAGES = [["grammar", "语法阶段 K–G6", "Grammar K–G6"], ["dialectic", "逻辑阶段 G7–G8", "Dialectic G7–G8"], ["rhetoric", "修辞阶段 G9–G12", "Rhetoric G9–G12"]];
  var PL_CREDITS = [["math", "数学", "Math"], ["science", "科学", "Science"], ["english", "英语", "English"], ["chinese", "中文", "Chinese"], ["social", "社会学", "Social Studies"], ["bible", "圣经 / 神学", "Bible / Theology"], ["speaking", "公众演讲", "Public Speaking"], ["secondLang", "第二外语", "Second Foreign Language"], ["fineArts", "艺术", "Fine Arts"], ["pe", "体育", "Physical Education"], ["elective", "选修", "Electives"]];
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
    if (!ds.length) { location.hash = "#/account"; return; }
    if (!plState.domain || !ds.some(function (d) { return d.domain === plState.domain; })) plState.domain = (ds.filter(function (d) { return d.domain === currentDomain; })[0] || ds.filter(function (d) { return d.domain === domainsInfo.mine; })[0] || ds[0]).domain;
    setTitle(domainsInfo.all ? t("机构管理", "Institutions") : t("本域管理", "My domain"), t("课程方案", "Curriculum plan"), "",
      { info: t("本校的毕业学分要求和课程地图。家长在网站的选课向导里看到的是「学校版本」：每条毕业路径的学分要求可以改成本校的数字（留空沿用蜂巢默认，勾「不要求」则隐藏该行），课程地图可以按阶段自己编排（科目 × 年级，格子里写课程名，英文 / 中文 用斜线分开，多项用分号）。地图行选的是蜂巢的科目，所以家长点格子仍能看到蜂巢能提供的课程。先保存草稿，确认后「发布」，本校家庭才会看到；「撤回发布」后家长重新看到蜂巢默认版本。", "The school's graduation credit requirements and curriculum map. Families see the “school edition” in the website's course wizard: each graduation track's credits can be set to the school's own figures (blank = Hive's default; “not required” hides the row), and the curriculum map can be laid out per stage (subject × grade; course names in a cell, English / 中文 split by a slash, several items by semicolons). Map rows pick Hive's subjects, so parents still see the courses Hive offers when they tap a cell. Save a draft, then Publish for the school's families to see it; Unpublish returns them to Hive's defaults.") });
    $("content").innerHTML =
      '<div class="toolbar tight" id="plbar">' + (ds.length > 1 ? '<select id="plsel">' + ds.map(function (d) { return '<option value="' + esc(d.domain) + '"' + (d.domain === plState.domain ? " selected" : "") + ">" + esc(dname(d.domain)) + "</option>"; }).join("") + "</select>" : '<span class="tag accent">' + esc(dname(plState.domain)) + "</span>") +
        '<span id="plstatus" class="muted" style="font-size:12px"></span><span class="spacer"></span>' +
        '<button class="btn secondary sm" id="plReset">' + t("重置为蜂巢默认", "Reset to Hive defaults") + '</button> <button class="btn secondary sm" id="plUnpub" hidden>' + t("撤回发布", "Unpublish") + '</button> <button class="btn secondary sm" id="plSave">' + t("保存草稿", "Save draft") + '</button> <button class="btn sm" id="plPub">' + t("发布", "Publish") + "</button>" +
      "</div>" +
      '<div class="pagetabs compact" role="tablist" id="pltabs"><a class="ptab inline' + (plState.tab === "credits" ? " on" : "") + '" href="#/domain/plan" data-tab="credits" role="tab">' + t("毕业学分要求", "Graduation credits") + '</a><a class="ptab inline' + (plState.tab === "map" ? " on" : "") + '" href="#/domain/plan" data-tab="map" role="tab">' + t("课程地图", "Curriculum map") + "</a></div>" +
      '<div id="plmsg"></div><div id="plbody"><div class="loading">' + t("载入中…", "Loading…") + "</div></div>";
    var sel = $("plsel");
    if (sel) sel.addEventListener("change", function () { if (plState.dirty && !window.confirm(t("有未保存的修改，切换学校会丢失。继续？", "Unsaved changes will be lost. Switch school?"))) { this.value = plState.domain; return; } plState.domain = this.value; plState.dirty = false; currentDomain = this.value; loadPlan(); });
    $("pltabs").addEventListener("click", function (e) { var a = e.target.closest("a[data-tab]"); if (!a) return; e.preventDefault(); plState.tab = a.getAttribute("data-tab"); $("pltabs").querySelectorAll(".ptab").forEach(function (x) { x.classList.toggle("on", x === a); }); renderPlan(); });
    $("plSave").addEventListener("click", function () { savePlan(false); });
    $("plPub").addEventListener("click", function () { if (window.confirm(t("发布后，本校所有已登录的家庭在网站上看到的就是这个版本。发布？", "Once published, every signed-in family of the school sees this version on the website. Publish?"))) savePlan(true); });
    $("plUnpub").addEventListener("click", function () { if (!window.confirm(t("撤回后家长重新看到蜂巢默认的学分要求和课程地图（草稿保留）。撤回？", "Families go back to Hive's default requirements and map (the draft is kept). Unpublish?"))) return; var b = $("plUnpub"); savingButton(b, t("撤回中…", "Unpublishing…")); post("school-plan", "PUT", { domain: plState.domain, unpublish: true }).then(function (r) { restoreButton(b); if (!r.ok) { plMsg(errText(r), true); return; } plState.data = Object.assign({}, plState.data, r.body); plStatus(); flashOk(t("已撤回发布：家长现在看到蜂巢默认版本。", "Unpublished: families now see Hive's defaults.")); }); });
    bindPlan(); // once per page: the listeners sit on #plbody, whose contents renderPlan() replaces
    $("plReset").addEventListener("click", function () { if (!window.confirm(t("把草稿全部清空（每条路径和每个阶段都回到蜂巢默认）？保存后才生效。", "Clear the whole draft (every track and stage back to Hive's defaults)? Takes effect when saved."))) return; plState.draft = { tracks: {}, map: {} }; plState.dirty = true; renderPlan(); });
    loadPlan();
  }
  function plMsg(text, bad) { $("plmsg").innerHTML = text ? '<div class="msg ' + (bad ? "err" : "ok") + '">' + esc(text) + "</div>" : ""; }
  function loadPlan() {
    $("plbody").innerHTML = '<div class="loading">' + t("载入中…", "Loading…") + "</div>";
    return api("school-plan?domain=" + encodeURIComponent(plState.domain)).then(function (r) {
      if (!r.ok) { $("plbody").innerHTML = '<div class="msg err">' + esc(errText(r)) + "</div>"; return; }
      plState.data = r.body; plState.draft = plFromBlob(r.body.plan && r.body.plan.draft); plState.dirty = false;
      var trs = (r.body.defaults && r.body.defaults.tracks) || [];
      if (!plState.track || !trs.some(function (x) { return String(x.trackId) === plState.track; })) plState.track = trs.length ? String(trs[0].trackId) : "";
      plStatus(); renderPlan();
    });
  }
  function plStatus() {
    var d = plState.data, p = d && d.plan; if (!d) return;
    var pub = p && p.published;
    $("plstatus").innerHTML = (pub ? '<span class="tag ok">' + t("已发布", "Published") + "</span> " + esc(when(pub.at)) + (pub.by ? " · " + esc(pub.by) : "") : '<span class="tag muted">' + t("未发布（家长看到蜂巢默认）", "Not published (families see Hive's defaults)") + "</span>") +
      (p && p.updatedAt ? ' · ' + t("草稿 ", "Draft ") + esc(when(p.updatedAt)) : "");
    $("plUnpub").hidden = !pub;
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
      flashOk(publish ? t("已发布：本校家庭在网站上看到学校版本。", "Published: the school's families see the school edition on the website.") : t("草稿已保存（尚未发布）。", "Draft saved (not published yet)."));
    });
  }
  function renderPlan() { if (!plState.data || !$("plbody")) return; $("plbody").innerHTML = plState.tab === "map" ? planMapHtml() : planCreditsHtml(); }

  // ---- 毕业学分要求 ------------------------------------------------------------------
  function planCreditsHtml() {
    var dfl = plState.data.defaults || {}, trs = dfl.tracks || [];
    if (!trs.length) return '<div class="card"><p class="sub">' + t("蜂巢的数据快照里还没有毕业路径。", "Hive's data snapshot has no graduation tracks yet.") + "</p></div>";
    var tr = trs.filter(function (x) { return String(x.trackId) === plState.track; })[0] || trs[0]; plState.track = String(tr.trackId);
    var ov = plState.draft.tracks[plState.track];
    var chips = '<div class="toolbar tight">' + trs.map(function (x) { var on = !!plState.draft.tracks[String(x.trackId)]; return '<button type="button" class="chip" data-track="' + esc(String(x.trackId)) + '" aria-pressed="' + (String(x.trackId) === plState.track) + '">' + esc(plTrackName(x)) + (on ? ' <span class="cnt">' + t("本校", "School") + "</span>" : "") + "</button>"; }).join("") + "</div>";
    var unit = t("学分", "credits");
    var head = '<div class="card"><div class="ch"><h2>' + esc(plTrackName(tr)) + (ov ? ' <span class="tag ok">' + t("本校版本", "School edition") + "</span>" : ' <span class="tag muted">' + t("蜂巢默认", "Hive default") + "</span>") + "</h2></div>" +
      '<label class="sw"><input type="checkbox" id="plOwn"' + (ov ? " checked" : "") + ' /><span class="track"></span><span class="swt"><b>' + t("本校自定义这条路径的学分要求", "The school sets its own requirements for this track") + "</b><small>" + t("关闭则家长看到蜂巢默认的数字。", "Off: families see Hive's figures.") + "</small></span></label>";
    if (!ov) {
      return chips + head + '<table class="data" style="margin-top:8px"><thead><tr><th>' + t("科目", "Subject") + '</th><th class="num">' + t("蜂巢默认", "Hive default") + "</th></tr></thead><tbody>" +
        PL_CREDITS.map(function (c) { var v = tr.credits ? tr.credits[c[0]] : null; return v == null ? "" : "<tr><td>" + esc(t(c[1], c[2])) + '</td><td class="num">' + esc(String(v)) + "</td></tr>"; }).join("") +
        "<tr><td><b>" + t("总学分", "Total credits") + '</b></td><td class="num"><b>' + esc(tr.totalCredits == null ? "—" : String(tr.totalCredits)) + "</b></td></tr><tr><td>" + t("服务小时", "Service hours") + '</td><td class="num">' + esc(tr.serviceHours == null ? "—" : String(tr.serviceHours)) + "</td></tr></tbody></table>" +
        (tr.commentsZh || tr.commentsEn ? '<p class="sub" style="margin-top:8px">' + esc(pickName(tr.commentsZh, tr.commentsEn)) + "</p>" : "") + "</div>";
    }
    var rows = PL_CREDITS.map(function (c) {
      var k = c[0], dv = tr.credits ? tr.credits[k] : null, has = Object.prototype.hasOwnProperty.call(ov.credits, k), v = has ? ov.credits[k] : undefined, off = has && v === null;
      return '<tr data-k="' + k + '"><td>' + esc(t(c[1], c[2])) + '</td><td class="num muted">' + esc(dv == null ? "—" : String(dv)) + '</td><td class="num"><input type="number" min="0" step="0.5" class="sm" style="width:90px" data-credit="' + k + '" value="' + esc(has && v != null ? String(v) : "") + '" placeholder="' + esc(dv == null ? "" : String(dv)) + '"' + (off ? " disabled" : "") + ' /></td><td><label class="chk"><input type="checkbox" data-off="' + k + '"' + (off ? " checked" : "") + " /> " + t("不要求", "Not required") + "</label></td></tr>";
    }).join("");
    return chips + head +
      '<table class="data" style="margin-top:8px"><thead><tr><th>' + t("科目", "Subject") + '</th><th class="num">' + t("蜂巢默认", "Hive default") + '</th><th class="num">' + t("本校要求", "School") + "</th><th></th></tr></thead><tbody>" + rows +
      "<tr><td><b>" + t("总学分", "Total credits") + '</b></td><td class="num muted">' + esc(tr.totalCredits == null ? "—" : String(tr.totalCredits)) + '</td><td class="num"><input type="number" min="0" step="0.5" class="sm" style="width:90px" id="plTotal" value="' + esc(ov.totalCredits == null ? "" : String(ov.totalCredits)) + '" placeholder="' + esc(tr.totalCredits == null ? "" : String(tr.totalCredits)) + '" /></td><td></td></tr>' +
      "<tr><td>" + t("服务小时", "Service hours") + '</td><td class="num muted">' + esc(tr.serviceHours == null ? "—" : String(tr.serviceHours)) + '</td><td class="num"><input type="number" min="0" step="1" class="sm" style="width:90px" id="plHours" value="' + esc(ov.serviceHours == null ? "" : String(ov.serviceHours)) + '" placeholder="' + esc(tr.serviceHours == null ? "" : String(tr.serviceHours)) + '" /></td><td></td></tr></tbody></table>' +
      '<p class="sub" style="margin:8px 0 4px">' + t("留空 = 沿用蜂巢默认；单位：", "Blank = Hive's default; unit: ") + unit + "</p>" +
      '<div class="grid2" style="margin-top:8px"><label class="f">' + t("学校说明（中文）", "School note (Chinese)") + '<textarea id="plNoteZh" rows="3">' + esc(ov.notes.zh || "") + '</textarea><small>' + t("替代蜂巢的备注；两种语言都留空则显示蜂巢的。", "Replaces Hive's note; both blank = Hive's note.") + '</small></label><label class="f">' + t("学校说明（英文）", "School note (English)") + '<textarea id="plNoteEn" rows="3">' + esc(ov.notes.en || "") + "</textarea></label></div></div>";
  }

  // ---- 课程地图 --------------------------------------------------------------------
  function planMapHtml() {
    var dfl = plState.data.defaults || {}, st = plState.stage, dm = (dfl.map && dfl.map[st]) || { grades: [], rows: [] };
    var grades = dm.grades || [];
    var own = plState.draft.map[st];
    var chips = '<div class="toolbar tight">' + PL_STAGES.map(function (s) { var on = !!plState.draft.map[s[0]]; return '<button type="button" class="chip" data-stage="' + s[0] + '" aria-pressed="' + (s[0] === st) + '">' + esc(t(s[1], s[2])) + (on ? ' <span class="cnt">' + t("本校", "School") + "</span>" : "") + "</button>"; }).join("") + "</div>";
    var head = '<div class="card"><div class="ch"><h2>' + esc(t(PL_STAGES.filter(function (s) { return s[0] === st; })[0][1], PL_STAGES.filter(function (s) { return s[0] === st; })[0][2])) + (own ? ' <span class="tag ok">' + t("本校版本", "School edition") + "</span>" : ' <span class="tag muted">' + t("蜂巢默认", "Hive default") + "</span>") + "</h2></div>" +
      '<label class="sw"><input type="checkbox" id="plOwnMap"' + (own ? " checked" : "") + ' /><span class="track"></span><span class="swt"><b>' + t("本校自定义这个阶段的课程地图", "The school lays out its own map for this stage") + "</b><small>" + t("打开时从蜂巢默认地图复制一份作为起点；关闭则家长看到蜂巢默认地图。", "Turning it on copies Hive's map as the starting point; off: families see Hive's map.") + "</small></span></label>";
    function cellsHtml(r, editable) {
      if (r.spanAll) return '<td colspan="' + grades.length + '">' + (editable ? '<textarea rows="2" data-cell="" data-row="' + r.id + '">' + esc(r.cells[grades[0]] || r.cells[""] || firstCell(r)) + "</textarea>" : esc(firstCell(r))) + "</td>";
      return grades.map(function (g) { return "<td>" + (editable ? '<textarea rows="2" data-cell="' + esc(g) + '" data-row="' + r.id + '">' + esc(r.cells[g] || "") + "</textarea>" : esc(r.cells[g] || "")) + "</td>"; }).join("");
    }
    function firstCell(r) { for (var i = 0; i < grades.length; i++) if (r.cells[grades[i]]) return r.cells[grades[i]]; return ""; }
    var thead = "<thead><tr><th>" + t("科目", "Subject") + "</th>" + (st === "rhetoric" ? "<th>" + t("路径", "Tracks") + "</th>" : st === "dialectic" ? "<th>" + t("教育法", "Pedagogy") + "</th>" : "") + grades.map(function (g) { return "<th>" + esc(g) + "</th>"; }).join("") + (own ? "<th></th>" : "") + "</tr></thead>";
    if (!own) {
      var dconv = plFromBlob({ map: { x: dm } }).map.x, drows = dconv ? dconv.rows : [];
      return chips + head + '<div class="tbl-wrap" style="margin-top:8px"><table class="data plmap">' + thead + "<tbody>" + (drows.length ? drows.map(function (r) { return "<tr><td>" + esc(r.subjects.map(plSubjectName).join(" · ") || "—") + "</td>" + scopeCell(r, false) + cellsHtml(r, false) + "</tr>"; }).join("") : '<tr><td colspan="' + (grades.length + 2) + '" class="muted">' + t("蜂巢在这个阶段没有课程地图。", "Hive has no map for this stage.") + "</td></tr>") + "</tbody></table></div></div>";
    }
    function scopeCell(r, editable) {
      if (st === "rhetoric") {
        var trs = dfl.tracks || [];
        return "<td>" + (editable ? trs.map(function (x) { return '<label class="chk"><input type="checkbox" data-trk="' + x.trackId + '" data-row="' + r.id + '"' + (r.trackIds.indexOf(x.trackId) >= 0 ? " checked" : "") + " /> " + esc(plTrackName(x)) + "</label>"; }).join("<br>") : esc(r.trackIds.length ? r.trackIds.map(function (id) { var x = trs.filter(function (y) { return y.trackId === id; })[0]; return x ? plTrackName(x) : "#" + id; }).join(", ") : t("全部", "All"))) + "</td>";
      }
      if (st === "dialectic") {
        var opts = [["", t("两种都适用", "Both")], ["classical", t("古典", "Classical")], ["nonclassical", t("非古典", "Non-classical")]];
        return "<td>" + (editable ? '<select class="sm" data-ped="' + r.id + '">' + opts.map(function (o) { return '<option value="' + o[0] + '"' + ((r.pedagogy || "") === o[0] ? " selected" : "") + ">" + esc(o[1]) + "</option>"; }).join("") + "</select>" : esc(opts.filter(function (o) { return o[0] === (r.pedagogy || ""); })[0][1])) + "</td>";
      }
      return "";
    }
    var subjects = dfl.subjects || [];
    var rows = own.rows.map(function (r, i) {
      var cur = r.subjects[0] ? (r.subjects[0].id || r.subjects[0].nameEn) : "";
      var known = subjects.some(function (s) { return (s.id || s.nameEn) === cur; });
      return '<tr data-row="' + esc(r.id) + '"><td><select class="sm" data-subj="' + esc(r.id) + '">' + (known ? "" : '<option value="' + esc(cur) + '" selected>' + esc(plSubjectName(r.subjects[0]) || t("（选择科目）", "(choose a subject)")) + "</option>") + subjects.map(function (s) { var k = s.id || s.nameEn; return '<option value="' + esc(k) + '"' + (k === cur ? " selected" : "") + ">" + esc(plSubjectName(s)) + "</option>"; }).join("") + "</select>" +
        '<label class="chk" style="display:flex"><input type="checkbox" data-span="' + esc(r.id) + '"' + (r.spanAll ? " checked" : "") + " /> " + t("各年级相同", "Same every grade") + "</label></td>" + scopeCell(r, true) + cellsHtml(r, true) +
        '<td class="plrowbtns"><button type="button" class="lnk" data-up="' + esc(r.id) + '" title="' + t("上移", "Move up") + '"' + (i === 0 ? " disabled" : "") + '>↑</button> <button type="button" class="lnk" data-down="' + esc(r.id) + '" title="' + t("下移", "Move down") + '"' + (i === own.rows.length - 1 ? " disabled" : "") + '>↓</button> <button type="button" class="lnk" data-del="' + esc(r.id) + '">' + t("删除", "Delete") + "</button></td></tr>";
    }).join("");
    return chips + head + '<div class="tbl-wrap" style="margin-top:8px"><table class="data plmap edit">' + thead + "<tbody>" + rows + "</tbody></table></div>" +
      '<div class="actions" style="margin-top:8px"><button type="button" class="btn secondary sm" id="plAddRow">' + t("＋ 添加一行", "+ Add a row") + '</button> <button type="button" class="btn secondary sm" id="plCopyDefault">' + t("从蜂巢默认重新复制", "Copy Hive's map again") + "</button></div>" +
      '<p class="sub" style="margin-top:8px">' + t("格子里写课程名：英文 / 中文 用斜线分开，多门课用分号或换行。行的科目决定家长点格子时看到哪些蜂巢课程。", "Course names in the cells: English / 中文 split by a slash; several courses by semicolons or line breaks. A row's subject decides which Hive courses families see when they tap a cell.") + "</p></div>";
  }

  // ---- events ------------------------------------------------------------------------
  function bindPlan() {
    var body = $("plbody");
    body.addEventListener("click", function (e) {
      var c, dfl = (plState.data && plState.data.defaults) || {};
      if ((c = e.target.closest(".chip[data-track]"))) { plState.track = c.getAttribute("data-track"); renderPlan(); return; }
      if ((c = e.target.closest(".chip[data-stage]"))) { plState.stage = c.getAttribute("data-stage"); renderPlan(); return; }
      if (e.target.closest("#plAddRow")) { var m = plState.draft.map[plState.stage]; m.rows.push({ id: "n-" + Date.now().toString(36), subjects: dfl.subjects && dfl.subjects[0] ? [Object.assign({}, dfl.subjects[0])] : [], trackIds: [], pedagogy: null, spanAll: false, cells: {} }); plState.dirty = true; renderPlan(); return; }
      if (e.target.closest("#plCopyDefault")) { if (!window.confirm(t("用蜂巢默认地图覆盖这个阶段现在的行？", "Replace this stage's rows with Hive's map?"))) return; plState.draft.map[plState.stage] = { rows: plRowsFromDefault(plState.stage) }; plState.dirty = true; renderPlan(); return; }
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
      if (c.hasAttribute("data-cell")) { var g = c.getAttribute("data-cell"); if (row.spanAll) { var grades = ((dfl.map || {})[st] || {}).grades || []; row.cells = {}; grades.forEach(function (gg) { if (c.value.trim()) row.cells[gg] = c.value; }); } else if (c.value.trim()) row.cells[g] = c.value; else delete row.cells[g]; plState.dirty = true; return; }
      if (c.hasAttribute("data-subj")) { var s = (dfl.subjects || []).filter(function (x) { return (x.id || x.nameEn) === c.value; })[0]; row.subjects = s ? [Object.assign({}, s)] : [{ id: null, nameEn: c.value, nameZh: c.value }]; plState.dirty = true; return; }
      if (c.hasAttribute("data-span")) { row.spanAll = c.checked; plState.dirty = true; renderPlan(); return; }
      if (c.hasAttribute("data-trk")) { var n = Number(c.getAttribute("data-trk")); row.trackIds = row.trackIds.filter(function (x) { return x !== n; }); if (c.checked) row.trackIds.push(n); row.trackIds.sort(); plState.dirty = true; return; }
      if (c.hasAttribute("data-ped")) { row.pedagogy = c.value || null; plState.dirty = true; return; }
    });
  }
