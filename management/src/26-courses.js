// management/src/26-courses.js — 课程管理 / Course management: 我的课程 (teachers), 课程管理 (approvers), the course editor.
// Part of management.js: scripts/build-management.js concatenates management/src/*.js in name order
// into management/management.js (one closure; every part sees every other's functions). Edit here, not the built file.
//
// Design: claude/fengchao-course-management-design.md (Rick, 2026-10-18). Teachers maintain their own courses:
// single-language editing, 生成双语 fills the other language, autosave per field, a four-step progress line,
// a version timeline, a website-style preview; approvers (课程总监, CEO, sysadmin) assign, review and publish
// into Airtable, then refresh the website. Interaction borrows from Airtable's expanded record: typed field
// editors (pills, chips with search, attachment tiles), a field opened for detail, nothing waits for a save.

  // ================================================================================
  // state and small helpers
  // ================================================================================
  var coursesInfo = null; // /api/courses/list at boot: { me: {approver, viewer}, courses: [...], none }
  var co = { list: null, lookups: null, tab: "all", q: "", id: null, course: null, editable: null, translation: null, needs: 0, assigned: [],
    lang: LANG, timers: {}, pending: {}, saving: 0, savedAt: null, failed: false, prevOpen: false, syncPoll: null };
  var CO_STATUS = { "": ["未编辑", "Not edited", ""], draft: ["编辑中", "Editing", ""], submitted: ["待审批", "Submitted", "accent"], reviewing: ["审阅中", "In review", "accent"], returned: ["已退回", "Returned", "warn"], published: ["已发布", "Published", "ok"] };
  var CO_FILE_CHUNK = 2 * 1024 * 1024, CO_PDF_MAX = 10 * 1024 * 1024;
  // The editor's sections and the fields in each (keys of api/shared/courses.js FIELDS).
  var CO_SECTIONS = [
    { id: "basic", zh: "基本信息", en: "Basics", keys: ["name", "subjects", "grades", "classType", "language", "creditHours", "academic", "classical"] },
    { id: "desc", zh: "课程描述", en: "Description", keys: ["description"] },
    { id: "time", zh: "上课安排", en: "Schedule", keys: ["numClasses", "days", "classTime"] },
    { id: "pre", zh: "前置课程", en: "Prerequisites", keys: ["prerequisite"] },
    { id: "files", zh: "教材与大纲", en: "Textbooks & syllabus", keys: ["syllabus", "textbooks"] },
    { id: "who", zh: "授课老师", en: "Teachers", keys: ["teachers"] },
    { id: "ops", zh: "经营字段", en: "Business fields", keys: ["school", "price", "available", "tracks", "comments"] },
  ];
  var CO_LABEL = { name: ["课程名称", "Course name"], subjects: ["学科", "Subject"], grades: ["年级", "Grades"], classType: ["课程类型", "Class type"], language: ["授课语言", "Teaching language"], creditHours: ["学分", "Credit hours"],
    academic: ["学术课程", "Academic course"], classical: ["古典课程", "Classical course"], description: ["课程描述", "Description"], numClasses: ["课时数", "Number of classes"], days: ["上课星期", "Days of week"], classTime: ["上课时间", "Class time"],
    prerequisite: ["前置课程", "Prerequisite"], syllabus: ["课程大纲", "Syllabus"], textbooks: ["教材", "Textbooks"], teachers: ["授课老师", "Teachers"], school: ["课程提供方", "Course deliverer"], price: ["价格", "Price"], available: ["可用", "Available"], tracks: ["毕业路径", "Graduation tracks"], comments: ["备注", "Comments"] };
  var CO_HINT = { classTime: ["如 「周一 P3 10:00–10:45」，网站原样显示", "e.g. “Mon P3 10:00–10:45”, shown as typed"], creditHours: ["0.5 或 1", "0.5 or 1"], syllabus: ["PDF，最大 10 MB；发布后 Airtable 保存一份", "PDF up to 10 MB; Airtable keeps a copy after publishing"], academic: ["计入 GPA 的学术课", "Counts toward the GPA"], classical: ["古典教育的课程（网站的教育理念筛选）", "A classical-pedagogy course (the website's pedagogy filter)"], school: ["订单按它路由到对应的蜂巢", "Orders are routed to this hive"], available: ["不可用的课程不在网站上显示", "An unavailable course is not shown on the website"] };
  var DAY_ZH = { Monday: "周一", Tuesday: "周二", Wednesday: "周三", Thursday: "周四", Friday: "周五", Saturday: "周六", Sunday: "周日" };
  function coLabel(k) { var l = CO_LABEL[k] || [k, k]; return t(l[0], l[1]); }
  function coStatusTag(s) { var d = CO_STATUS[s] || CO_STATUS[""]; return '<span class="tag ' + d[2] + '">' + esc(t(d[0], d[1])) + "</span>"; }
  function coName(c, lang) { var f = c.fields || c; var l = lang || co.lang; return (l === "en" ? f.nameEn || f.nameZh : f.nameZh || f.nameEn) || t("（未命名）", "(untitled)"); }
  function coIsApprover() { return !!(coursesInfo && coursesInfo.me && coursesInfo.me.approver); }
  function coIsViewer() { return !!(coursesInfo && coursesInfo.me && coursesInfo.me.viewer); }
  function coHasCourses() { return !!(coursesInfo && ((coursesInfo.courses || []).length || coIsApprover() || coIsViewer())); }
  function coFileSize(n) { n = Number(n) || 0; return n >= 1024 * 1024 ? (n / 1024 / 1024).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB"; }
  function coAgo(iso) { if (!iso) return ""; var d = (Date.now() - new Date(iso).getTime()) / 86400000; return d < 1 ? t("今天", "today") : Math.floor(d) + t(" 天", " d"); }
  // the sidebar badges: returned / newly published for a teacher, submitted for an approver
  function coMyBadge() { var n = ((coursesInfo && coursesInfo.courses) || []).filter(function (c) { return c.status === "returned"; }).length; return n ? String(n) : ""; }
  function coPendingBadge() { var n = ((coursesInfo && coursesInfo.courses) || []).filter(function (c) { return c.status === "submitted" || c.status === "reviewing"; }).length; return n ? String(n) : ""; }
  function loadCoursesInfo() { return api("courses/list").then(function (r) { coursesInfo = r.ok ? r.body : null; }).catch(function () { coursesInfo = null; }); }

  // ================================================================================
  // the lists: 我的课程 (teacher) and 课程管理 (approver)
  // ================================================================================
  function viewCourses() {
    document.body.classList.remove("cofocus"); document.body.classList.remove("coedit");
    var h = location.hash, m = /^#\/courses\/(rec[A-Za-z0-9]{14})/.exec(h);
    if (m) return viewCourseEditor(m[1]);
    if (!coHasCourses()) { location.hash = "#/account"; return; }
    var manage = coIsApprover() || coIsViewer();
    if (/^#\/courses\/(pending|assign)/.test(h)) co.tab = RegExp.$1; else if (!/^#\/courses\/?$/.test(h) && manage) co.tab = co.tab || "all"; else co.tab = "all";
    setTitle(manage ? t("经营", "Operations") : t("我的账号", "My account"), manage ? t("课程管理", "Course management") : t("我的课程", "My courses"), "",
      { info: manage ? t("老师在蜂巢里维护自己的课程，提交后由课程总监、CEO 或系统管理员审批发布，发布时写入 Airtable 并更新网站。这里分配老师、审批、查看每门课的状态。", "Teachers maintain their courses in Hive; the curriculum director, the CEO or the system administrator reviews and publishes, which writes to Airtable and refreshes the website. Assign teachers, review and follow every course here.")
        : t("分配给你的课程。打开一门课修改属性，保存后提交审批；发布后出现在网站上。", "The courses assigned to you. Open one to change it, then submit it for approval; once published it appears on the website.") });
    $("content").innerHTML = '<div id="cobody"><div class="loading">' + t("载入中…", "Loading…") + "</div></div>";
    api("courses/list").then(function (r) {
      if (!r.ok) { $("cobody").innerHTML = '<div class="msg err">' + esc(errText(r)) + "</div>"; return; }
      coursesInfo = r.body; co.list = r.body.courses || [];
      if (!coHasCourses()) { location.hash = "#/account"; return; }
      nav(); // the badges follow the list
      manage ? coRenderManage() : coRenderMine();
      // publishes waiting for the website (the approver closed the tab inside the two-minute gap): nudge the server now
      if (manage && coursesInfo.sync && coursesInfo.sync.pending && coIsApprover()) coSyncWebsite(null, function () {});
    });
  }
  function coRenderMine() {
    var list = co.list || [];
    $("cobody").innerHTML = '<div class="cocards">' + list.map(function (c) {
      return '<a class="cocard" href="#/courses/' + esc(c.id) + '"><div class="cocode">' + esc(c.code || "") + '</div><div class="coname">' + esc(coName(c)) + "</div>" +
        '<div class="cometa">' + (c.subjects || []).map(function (s) { return esc(t(s.nameZh || s.nameEn, s.nameEn || s.nameZh)); }).join(" · ") + (c.school ? ' · ' + esc(c.school) : "") + "</div>" +
        '<div class="cofoot">' + coMiniSteps(c.status) + coStatusTag(c.status) + (c.returnedAt ? ' <span class="tag warn">' + t("有退回意见", "Comment") + "</span>" : "") + (c.updatedAt ? '<span class="faint">' + esc(when(c.updatedAt)) + "</span>" : "") + "</div></a>";
    }).join("") + "</div>";
  }
  // The four dots of the progress line, for a list row.
  function coMiniSteps(status) {
    var n = { "": 0, draft: 1, returned: 1, submitted: 2, reviewing: 3, published: 4 }[status || ""] || 0;
    var h = '<span class="costeps-mini" title="' + esc(t("编辑中 → 待审批 → 审阅中 → 已发布", "Editing → Submitted → In review → Published")) + '">';
    for (var i = 1; i <= 4; i++) h += '<i class="' + (i <= n ? "on" : "") + (status === "returned" && i === 3 ? " warn" : "") + '"></i>';
    return h + "</span>";
  }
  function coRenderManage() {
    var list = co.list || [], pending = list.filter(function (c) { return c.status === "submitted" || c.status === "reviewing"; });
    var q = co.q.trim().toLowerCase();
    var rows = (co.tab === "pending" ? pending : list).filter(function (c) { return !q || [c.code, c.nameEn, c.nameZh, c.school].concat((c.assigned || []).map(function (p) { return p.name; }), c.teachers || []).some(function (x) { return String(x || "").toLowerCase().indexOf(q) >= 0; }); });
    if (co.tab === "pending") rows.sort(function (a, b) { return String(a.submittedAt || "").localeCompare(String(b.submittedAt || "")); });
    var sync = coursesInfo && coursesInfo.sync;
    $("cobody").innerHTML =
      '<div class="pagetabs compact" id="cotabs"><a class="ptab' + (co.tab === "all" ? " on" : "") + '" href="#/courses" data-tab="all">' + t("课程", "Courses") + ' <small>' + list.length + '</small></a>' +
        '<a class="ptab' + (co.tab === "pending" ? " on" : "") + '" href="#/courses/pending" data-tab="pending">' + t("待审批", "To review") + (pending.length ? ' <small class="cobadge">' + pending.length + "</small>" : "") + "</a>" +
        '<div class="tabsRight"><input type="search" id="coq" placeholder="' + esc(t("搜索课程、老师", "Search courses, teachers")) + '" value="' + esc(co.q) + '" />' +
        (sync && sync.pending ? '<button class="btn secondary sm" id="coSyncNow">' + t("更新网站", "Refresh website") + "</button>" : "") + "</div></div>" +
      '<div class="tbl-wrap"><table class="data" id="cotable"><thead><tr><th>' + t("课程", "Course") + "</th><th>" + t("学科", "Subject") + "</th><th>" + t("学校", "School") + "</th><th>" + t("老师", "Teachers") + "</th><th>" + t("进度", "Progress") + "</th><th>" + t("更新", "Updated") + "</th></tr></thead><tbody>" +
      (rows.length ? rows.map(function (c) {
        var waiting = c.status === "submitted" || c.status === "reviewing" ? (Date.now() - new Date(c.submittedAt).getTime()) / 86400000 : 0;
        return '<tr class="pick" data-id="' + esc(c.id) + '"><td><span class="dn">' + esc(coName(c)) + '</span><span class="sub">' + esc(c.code || "") + "</span></td>" +
          "<td>" + (c.subjects || []).map(function (s) { return esc(t(s.nameZh || s.nameEn, s.nameEn || s.nameZh)); }).join(", ") + "</td><td>" + esc(c.school || "") + "</td>" +
          '<td class="coassigned">' + ((c.assigned || []).length ? (c.assigned || []).map(function (p) { return '<span class="tag">' + esc(p.name || p.upn) + "</span>"; }).join(" ") : '<span class="faint">' + ((c.teachers || []).join(", ") || "—") + "</span>") + ' <button type="button" class="linkbtn" data-assign="' + esc(c.id) + '">' + t("分配", "Assign") + "</button></td>" +
          "<td>" + coMiniSteps(c.status) + coStatusTag(c.status) + (waiting >= 1 ? ' <span class="' + (waiting > 7 ? "tag warn" : "faint") + '">' + t("等待 ", "waiting ") + Math.floor(waiting) + t(" 天", " d") + "</span>" : "") + "</td>" +
          '<td class="faint">' + esc(c.updatedAt ? when(c.updatedAt) : "") + "</td></tr>";
      }).join("") : '<tr><td colspan="6" class="faint">' + (co.tab === "pending" ? t("没有待审批的课程。", "Nothing to review.") : t("没有匹配的课程。", "No matching course.")) + "</td></tr>") + "</tbody></table></div>";
    $("cotabs").addEventListener("click", function (e) { var a = e.target.closest("a[data-tab]"); if (!a) return; e.preventDefault(); co.tab = a.getAttribute("data-tab"); history.replaceState(null, "", a.getAttribute("href")); coRenderManage(); });
    $("coq").addEventListener("input", debounce(function () { co.q = $("coq").value; var pos = $("coq").selectionStart; coRenderManage(); $("coq").focus(); try { $("coq").setSelectionRange(pos, pos); } catch (e) {} }, 150));
    $("cotable").addEventListener("click", function (e) {
      var b = e.target.closest("[data-assign]"); if (b) { e.stopPropagation(); coAssignPanel(b.getAttribute("data-assign")); return; }
      var tr = e.target.closest("tr[data-id]"); if (tr) location.hash = "#/courses/" + tr.getAttribute("data-id");
    });
    if ($("coSyncNow")) $("coSyncNow").addEventListener("click", function () { coSyncWebsite($("coSyncNow")); });
  }

  // ---- assigning teachers (approvers): the people picker in a side panel --------------------
  function coAssignPanel(id) {
    var c = (co.list || []).filter(function (x) { return x.id === id; })[0] || { id: id, assigned: [] };
    var people = (c.assigned || []).slice();
    panelOpen('<div class="ph"><span class="avatar">👩‍🏫</span><h3>' + esc(coName(c)) + ' <small class="faint">' + esc(c.code || "") + '</small></h3><button class="x" type="button" aria-label="close">✕</button></div>' +
      '<div class="pb"><h4>' + t("已分配的老师", "Assigned teachers") + '</h4><div id="coAssigned"></div>' +
      '<h4>' + t("添加老师", "Add a teacher") + '</h4><input type="search" id="coPq" placeholder="' + esc(t("输入姓名或账号（人员库）", "Name or account (people hub)")) + '" autocomplete="off" /><div id="coPres" class="copres"></div>' +
      '<p class="hint">' + esc(t("分配的老师可以在蜂巢里编辑这门课；有 Teams 账号才能登录。分配不会自动改网站上显示的「授课老师」，那在编辑器的「授课老师」字段里改。", "An assigned teacher can edit this course in Hive (a Teams account is needed to sign in). Assigning does not change the website's “Teachers” by itself — that is the Teachers field in the editor.")) + "</p></div>");
    function paint() {
      $("coAssigned").innerHTML = people.length ? people.map(function (p) {
        return '<div class="corow"><span class="avatar">' + esc(initials(p.name || p.upn || "?")) + '</span><span class="corow-t"><b>' + esc(p.name || p.upn) + '</b><small>' + (p.upn ? esc(p.upn) : '<span class="tag warn">' + t("没有 Teams 账号，无法登录编辑", "No Teams account — cannot sign in") + "</span>") + '</small></span><button type="button" class="linkbtn" data-rm="' + esc(p.upn || p.crmId) + '">' + t("移除", "Remove") + "</button></div>";
      }).join("") : '<p class="faint" style="font-size:12px">' + t("还没有分配。", "Nobody yet.") + "</p>";
      var row = (co.list || []).filter(function (x) { return x.id === id; })[0]; if (row) row.assigned = people.slice();
      var td = document.querySelector('#cotable tr[data-id="' + id + '"] .coassigned'); if (td) td.innerHTML = (people.length ? people.map(function (p) { return '<span class="tag">' + esc(p.name || p.upn) + "</span>"; }).join(" ") : '<span class="faint">—</span>') + ' <button type="button" class="linkbtn" data-assign="' + esc(id) + '">' + t("分配", "Assign") + "</button>";
    }
    paint();
    $("coAssigned").addEventListener("click", function (e) {
      var b = e.target.closest("[data-rm]"); if (!b) return;
      var key = b.getAttribute("data-rm"), p = people.filter(function (x) { return x.upn === key || x.crmId === key; })[0];
      savingButton(b);
      post("courses/op", "POST", { id: id, op: "unassign", person: { upn: p && p.upn, crmId: p && p.crmId } }).then(function (r) { if (!r.ok) { flash(esc(errText(r))); restoreButton(b); return; } people = r.body.assigned; paint(); });
    });
    $("coPq").addEventListener("input", debounce(function () {
      var q = $("coPq").value.trim();
      if (q.length < 2) { $("coPres").innerHTML = ""; return; }
      api("courses/people?q=" + encodeURIComponent(q)).then(function (r) {
        var ps = (r.ok && r.body.people) || [];
        $("coPres").innerHTML = ps.length ? ps.map(function (p, i) {
          var has = people.some(function (x) { return (p.upn && x.upn === p.upn) || (p.crmId && x.crmId === p.crmId); });
          return '<button type="button" class="corow pickrow" data-i="' + i + '"' + (has ? " disabled" : "") + '><span class="avatar">' + esc(initials(p.name || "?")) + '</span><span class="corow-t"><b>' + esc(p.name) + '</b><small>' + esc(p.upn || t("无 Teams 账号", "no Teams account")) + (p.identity ? " · " + esc(vl(p.identity)) : "") + (p.org ? " · " + esc(p.org) : "") + "</small></span>" + (has ? '<span class="tag ok">' + t("已分配", "Assigned") + "</span>" : '<span class="tag accent">' + t("添加", "Add") + "</span>") + "</button>";
        }).join("") : '<p class="faint" style="font-size:12px">' + t("没有找到。", "No one found.") + "</p>";
        $("coPres").onclick = function (e) {
          var b = e.target.closest("[data-i]"); if (!b) return;
          var p = ps[+b.getAttribute("data-i")]; savingButton(b);
          post("courses/op", "POST", { id: id, op: "assign", code: c.code, person: { crmId: p.crmId, upn: p.upn, name: p.name } }).then(function (r) { if (!r.ok) { flash(esc(errText(r))); restoreButton(b); return; } people = r.body.assigned; paint(); $("coPq").value = ""; $("coPres").innerHTML = ""; });
        };
      });
    }, 200));
  }

  // ================================================================================
  // the editor
  // ================================================================================
  function viewCourseEditor(id) {
    document.body.classList.add("coedit"); document.body.classList.toggle("cofocus", !coSideOpen());   // the focus layout, unless this person keeps the sidebar
    co.id = id; co.course = null; co.pending = {}; co.timers = {}; co.saving = 0; co.failed = false;
    setTitle("", "", "", { info: "" });
    $("content").innerHTML = '<div id="coed" class="coed"><div class="loading">' + t("载入中…", "Loading…") + "</div></div>";
    var need = co.lookups ? Promise.resolve() : api("courses/lookups").then(function (r) { if (r.ok) co.lookups = r.body; });
    Promise.all([api("courses/course?id=" + encodeURIComponent(id)), need]).then(function (rs) {
      var r = rs[0];
      if (!r.ok) { $("coed").innerHTML = '<div class="msg err">' + esc(errText(r)) + '</div><p><a href="#/courses">← ' + t("返回", "Back") + "</a></p>"; return; }
      coTake(r.body);
      if (!co.lookups) { $("coed").innerHTML = '<div class="msg err">' + t("无法读取 Airtable 的选项列表。", "The Airtable pick lists could not be read.") + "</div>"; return; }
      co.lang = co.course.meta && co.course.meta.sourceLang === "en" ? "en" : (co.course.meta && co.course.meta.sourceLang === "zh" ? "zh" : LANG);
      coRenderEditor();
      coRecoverLocal();
    });
  }
  function coTake(body) { co.course = body.course; co.editable = body.editable || co.editable; co.translation = body.translation || co.translation; co.needs = body.needs != null ? body.needs : co.needs; if (body.assigned) co.assigned = body.assigned; co.savedAt = co.course.draftAt; }

  function coRenderEditor() {
    var c = co.course;
    $("coed").innerHTML = coBarHTML() + '<div id="costeps">' + coStepsHTML() + '</div><div id="coreturned">' + coReturnedHTML() + "</div>" +
      '<div class="coed-main"><div class="coform" id="coform">' + CO_SECTIONS.map(coSectionHTML).join("") + "</div>" +
      '<aside class="coprev" id="coprev"><div class="coprev-h"><span>' + t("家长看到的样子", "As parents see it") + ' <span class="faint">' + (co.lang === "en" ? "English" : "中文") + '</span></span><span class="pvmode" role="group"><button type="button" data-pv="detail"' + (co.pvmode !== "card" ? ' class="on"' : "") + '>' + t("详情", "Detail") + '</button><button type="button" data-pv="card"' + (co.pvmode === "card" ? ' class="on"' : "") + '>' + t("卡片", "Card") + '</button></span></div><div id="coprevbody">' + coPreviewHTML() + "</div></aside></div>";
    coBindEditor();
    tipify($("coed"));
  }
  // ---- the sidebar while editing: hidden by default (focus layout); a person can keep it open (Rick, 2026-10-18) ----
  function coSideOpen() { try { return localStorage.getItem("fc-course-side") === "1"; } catch (e) { return false; } }
  function coSideToggle() {
    var open = document.body.classList.contains("cofocus");       // hidden now → open it
    document.body.classList.toggle("cofocus", !open);
    try { localStorage.setItem("fc-course-side", open ? "1" : "0"); } catch (e) {}
    var b = $("coSide"); if (b) { b.classList.toggle("on", open); b.title = coSideTitle(open); }
    coSpy();
  }
  function coSideTitle(open) { return open ? t("隐藏左侧导航（专注编辑）", "Hide the sidebar (focus on editing)") : t("显示左侧导航", "Show the sidebar"); }
  var CO_SIDE_ICON = '<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><rect x="2.5" y="3.5" width="15" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M7.5 3.5v13" stroke="currentColor" stroke-width="1.6"/></svg>';
  // ---- the status bar ----------------------------------------------------------------------
  function coBarHTML() {
    var c = co.course, appr = coIsApprover(), ro = coIsViewer() && !appr;
    var primary = "";
    if (!ro) {
      if (appr) primary = '<button class="btn" id="coPublish">' + t("发布", "Publish") + "</button>";
      else if (c.status === "submitted" || c.status === "reviewing") primary = '<button class="btn secondary" id="coWithdraw">' + t("撤回提交", "Withdraw") + "</button>";
      else primary = '<button class="btn" id="coSubmit">' + t("提交审批", "Submit for approval") + "</button>";
    }
    return '<div class="cobar">' +
      '<button type="button" class="coside' + (coSideOpen() ? " on" : "") + '" id="coSide" title="' + esc(coSideTitle(coSideOpen())) + '" aria-label="' + esc(t("左侧导航", "Sidebar")) + '">' + CO_SIDE_ICON + "</button>" +
      '<a class="coback" href="#/courses" title="' + esc(t("返回课程列表", "Back to the list")) + '">←</a>' +
      '<div class="cobar-t"><span class="cocode">' + esc(c.code || "") + '</span><b id="coTitle">' + esc(coName(c)) + '</b>' + coStatusTag(c.status) + '<span class="cosaved" id="coSaved">' + coSavedText() + "</span></div>" +
      '<div class="cobar-r">' +
        '<span class="colang" role="group" aria-label="' + esc(t("编辑语言", "Editing language")) + '"><button type="button" data-lang="zh"' + (co.lang === "zh" ? ' class="on"' : "") + '>中文</button><button type="button" data-lang="en"' + (co.lang === "en" ? ' class="on"' : "") + '>EN</button></span>' +
        (ro ? "" : '<button class="btn secondary sm" id="coTranslate"' + (co.needs ? ' data-needs="1"' : "") + ' title="' + esc(t("把这门课的文字翻成另一种语言；只处理空的和原文已改的字段，人工改过的不动", "Translate this course's text into the other language; only empty or outdated fields are touched, never human-edited ones")) + '">' + t("生成双语", "Translate") + (co.needs ? ' <small>' + co.needs + "</small>" : "") + "</button>") +
        '<button class="btn secondary sm" id="coVersions">' + t("版本", "Versions") + ' <small>' + (c.history || []).length + "</small></button>" +
        primary +
        '<button class="btn secondary sm comore" id="coMore" aria-label="more">⋯</button>' +
        '<div class="comenu" id="coMenu" hidden>' +
          (ro ? "" : '<button type="button" class="mi" data-op="milestone">' + t("存一个版本", "Save a version") + "</button>") +
          (appr && (c.status === "submitted" || c.status === "reviewing") ? '<button type="button" class="mi" data-op="return">' + t("退回给老师", "Return to the teacher") + "</button>" : "") +
          '<button type="button" class="mi" data-op="preview">' + t("显示 / 隐藏预览", "Show / hide preview") + "</button>" +
          '<a class="mi" href="https://www.fengchao.life/" target="_blank" rel="noopener">' + t("在网站上查看 ↗", "Open the website ↗") + "</a>" +
        "</div>" +
      "</div>" + coSectionsNav() + "</div>";
  }
  function coSavedText() {
    if (co.failed) return '<span class="warn">' + t("未保存，重试中…", "Not saved — retrying…") + "</span>";
    if (co.saving) return t("保存中…", "Saving…");
    return co.savedAt ? t("已保存 ", "Saved ") + esc(when(co.savedAt).slice(-5)) : "";
  }
  function coSavedPaint() { if ($("coSaved")) $("coSaved").innerHTML = coSavedText(); }
  // ---- the four steps ------------------------------------------------------------------------
  function coStepsHTML() {
    var c = co.course, s = c.status;
    var n = { "": 1, draft: 1, returned: 1, submitted: 2, reviewing: 3, published: 4 }[s] || 1;
    var who = function (x) { return x ? '<small>' + esc((x.by || "").split("@")[0]) + " · " + esc(when(x.at)) + "</small>" : "<small>&nbsp;</small>"; };
    var steps = [
      { l: t("编辑中", "Editing"), sub: who(c.draftAt ? { by: c.draftBy, at: c.draftAt } : null) },
      { l: t("待审批", "Submitted"), sub: who(c.submitted) },
      { l: s === "returned" ? t("已退回", "Returned") : t("审阅中", "In review"), sub: who(s === "returned" ? c.returned : c.reviewing), warn: s === "returned" },
      { l: t("已发布", "Published"), sub: who(c.published) },
    ];
    return '<ol class="costeps">' + steps.map(function (st, i) {
      var k = i + 1, cls = k < n ? "done" : k === n ? "cur" : "";
      if (st.warn) cls = "warn";
      return '<li class="' + cls + '"><i>' + (k < n ? "✓" : k) + "</i><span>" + st.l + "</span>" + st.sub + "</li>";
    }).join("") + "</ol>";
  }
  function coReturnedHTML() {
    var c = co.course;
    return c.status === "returned" && c.returned ? '<div class="coreturn">' + t("退回意见", "Returned with a comment") + ' <small class="faint">' + esc((c.returned.by || "").split("@")[0]) + " · " + esc(when(c.returned.at)) + "</small><p>" + esc(c.returned.comment) + "</p></div>" : "";
  }
  function coSectionsNav() { return '<nav class="cosecnav" id="cosecnav">' + CO_SECTIONS.map(function (s) { return '<a href="#sec-' + s.id + '" data-sec="' + s.id + '">' + esc(t(s.zh, s.en)) + "</a>"; }).join("") + "</nav>"; }
  function coSectionHTML(s) {
    var lk = co.lookups;
    var keys = s.keys.filter(function (k) { return !(k === "classical" && lk.fields && lk.fields.classical === false); });
    return '<section class="cosec" id="sec-' + s.id + '"><h2>' + esc(t(s.zh, s.en)) + "</h2>" + keys.map(coFieldHTML).join("") + "</section>";
  }
  // One field row: label, the typed editor, a detail button. `k` is a FIELDS key or a pair name (name / description).
  function coFieldHTML(k) {
    var c = co.course, f = c.fields, lk = co.lookups;
    var pairKey = k === "name" || k === "description" ? k + (co.lang === "en" ? "En" : "Zh") : k;
    var can = co.editable && co.editable[pairKey] !== false && !(coIsViewer() && !coIsApprover());
    var tr = (k === "name" || k === "description") ? (co.translation || {})[pairKey] : "";
    var tag = tr === "machine" ? '<span class="cotag mt" title="' + esc(t("机器翻译，可以直接修改", "Machine translation — edit freely")) + '">' + t("译", "MT") + "</span>" : tr === "human-stale" ? '<span class="cotag stale" title="' + esc(t("另一种语言的原文改过了，这边的译文可能已过时：按「生成双语」可以更新（会先问你）", "The other language changed after this text was written — it may be outdated. Translate can update it (it asks first).")) + '">' + t("原文已改", "Outdated") + "</span>" : tr === "stale" ? '<span class="cotag stale" title="' + esc(t("原文改过了，这边的译文还是旧的：再按「生成双语」", "The source changed; this translation is outdated — run Translate again")) + '">' + t("原文已改", "Outdated") + "</span>" : "";
    var hint = CO_HINT[k] ? tipI(t(CO_HINT[k][0], CO_HINT[k][1])) : "";
    var ro = !can ? '<span class="cotag ro" title="' + esc(t("只有课程总监、CEO 或系统管理员可以改", "Only the curriculum director, the CEO or the system administrator may change this")) + '">' + t("只读", "Read only") + "</span>" : "";
    var body = "";
    switch (k) {
      case "name": body = '<input type="text" class="cof" data-k="' + pairKey + '" value="' + esc(f[pairKey] || "") + '" maxlength="120"' + (can ? "" : " readonly") + ' placeholder="' + esc(co.lang === "en" ? "Course name" : "课程名称") + '" />'; break;
      case "description": case "prerequisite": case "comments": {
        var key = k === "description" ? pairKey : k;
        body = '<textarea class="cof coauto" data-k="' + key + '" rows="' + (k === "description" ? 6 : 2) + '"' + (can ? "" : " readonly") + '>' + esc(f[key] || "") + "</textarea>"; break;
      }
      case "classTime": body = '<input type="text" class="cof" data-k="classTime" value="' + esc(f.classTime || "") + '" maxlength="500"' + (can ? "" : " readonly") + ' />'; break;
      case "creditHours": case "numClasses": case "price": body = '<input type="number" class="cof conum" data-k="' + k + '" value="' + esc(f[k] == null ? "" : f[k]) + '" min="0" step="' + (k === "creditHours" ? "0.5" : "1") + '"' + (can ? "" : " readonly") + ' />' + (k === "price" ? ' <span class="faint">' + t("¥ 人民币", "¥ RMB (CNY)") + "</span>" : ""); break;
      case "classType": case "language": body = coPillsHTML(k, (lk.options[k] || []), f[k] || {}, can); break;
      case "days": body = '<div class="copills" data-k="days">' + (lk.options.days || []).map(function (d) { return '<button type="button" class="copill' + ((f.days || []).indexOf(d) >= 0 ? " on" : "") + '" data-v="' + esc(d) + '"' + (can ? "" : " disabled") + ">" + esc(EN ? d.slice(0, 3) : DAY_ZH[d] || d) + "</button>"; }).join("") + "</div>"; break;
      case "academic": case "classical": case "available": body = '<label class="coswitch"><input type="checkbox" class="cof" data-k="' + k + '"' + (f[k] ? " checked" : "") + (can ? "" : " disabled") + ' /><i></i><span>' + (f[k] ? t("是", "Yes") : t("否", "No")) + "</span></label>"; break;
      case "subjects": case "grades": case "textbooks": case "teachers": case "school": case "tracks": body = coChipsHTML(k, f[k] || [], can); break;
      case "syllabus": body = coFilesHTML(f.syllabus || [], can); break;
    }
    return '<div class="corowf" data-row="' + k + '"><div class="colab"><span>' + esc(coLabel(k)) + (k === "name" || k === "description" ? ' <small class="faint">' + (co.lang === "en" ? "EN" : "中") + "</small>" : "") + "</span>" + tag + ro + hint +
      '<button type="button" class="codetail" data-detail="' + k + '" title="' + esc(t("详情：两种语言、修改记录", "Details: both languages, history")) + '">⤢</button></div><div class="coval">' + body + "</div></div>";
  }
  function coPillsHTML(k, options, cur, can) {
    return '<div class="copills" data-k="' + k + '" data-single="1">' + options.map(function (o) { var on = (cur.en && cur.en === o.en) || (cur.zh && cur.zh === o.zh); return '<button type="button" class="copill' + (on ? " on" : "") + '" data-en="' + esc(o.en) + '" data-zh="' + esc(o.zh) + '"' + (can ? "" : " disabled") + ">" + esc(EN ? o.en : o.zh) + "</button>"; }).join("") + "</div>";
  }
  // The chips of a link field, with a search box that offers the lookup rows not yet chosen.
  function coChipsHTML(k, ids, can) {
    return '<div class="cochips" data-k="' + k + '"' + (k === "school" ? ' data-single="1"' : "") + '>' + ids.map(function (id) { return coChipHTML(k, id, can); }).join("") +
      (can ? '<span class="cochip-add"><input type="text" class="cochip-q" data-k="' + k + '" placeholder="' + esc(k === "school" && ids.length ? "" : t("添加…", "Add…")) + '" autocomplete="off" /><div class="cochip-menu" hidden></div></span>' : (ids.length ? "" : '<span class="faint">—</span>')) + "</div>";
  }
  function coChipHTML(k, id, can) {
    var l = coLookupLabel(k, id);
    return '<span class="cochip" data-id="' + esc(id) + '" draggable="' + (can ? "true" : "false") + '">' + esc(l) + (can ? '<button type="button" class="cochip-x" aria-label="remove">×</button>' : "") + "</span>";
  }
  function coLookupRows(k) {
    var lk = co.lookups;
    switch (k) {
      case "subjects": return lk.subjects.map(function (s) { return { id: s.id, label: EN ? s.nameEn || s.nameZh : s.nameZh || s.nameEn, alt: s.nameEn + " " + s.nameZh }; });
      case "grades": return lk.grades.map(function (g) { return { id: g.id, label: g.name, alt: g.name }; });
      case "textbooks": return lk.textbooks.map(function (x) { return { id: x.id, label: (x.sku ? x.sku + " · " : "") + (EN ? x.nameEn || x.nameZh : x.nameZh || x.nameEn), alt: x.sku + " " + x.nameEn + " " + x.nameZh }; });
      case "teachers": return lk.teachers.map(function (x) { return { id: x.id, label: x.name, alt: x.name + " " + (x.upn || "") }; });
      case "school": return lk.schools.map(function (x) { return { id: x.id, label: x.name + (x.abbr ? " (" + x.abbr + ")" : ""), alt: x.name + " " + x.abbr }; });
      case "tracks": return lk.tracks.map(function (x) { return { id: x.id, label: (x.trackId != null ? x.trackId + " · " : "") + (EN ? x.name || x.nameZh : x.nameZh || x.name), alt: x.name + " " + x.nameZh }; });
    }
    return [];
  }
  function coLookupLabel(k, id) { var r = coLookupRows(k).filter(function (x) { return x.id === id; })[0]; return r ? r.label : id; }
  function coFilesHTML(list, can) {
    return '<div class="cofiles" data-k="syllabus">' + list.map(function (a, i) {
      return '<div class="cofile" data-i="' + i + '"><span class="cofile-ic">📄</span><a href="' + esc(a.url || ("/api/f/" + a.id)) + '" target="_blank" rel="noopener">' + esc(a.name || "syllabus.pdf") + '</a><small class="faint">' + (a.size ? coFileSize(a.size) : "") + (a.airtable ? " · Airtable" : "") + (a.progress != null ? " · " + a.progress + "%" : "") + "</small>" + (can ? '<button type="button" class="linkbtn" data-frm="' + i + '">' + t("移除", "Remove") + "</button>" : "") + "</div>";
    }).join("") + (can && list.length < 3 ? '<label class="cofile-add btn secondary sm">' + t("上传 PDF", "Upload a PDF") + '<input type="file" accept="application/pdf,.pdf" hidden /></label>' : "") + "</div>";
  }

  // ---- the preview: how the course card and detail read on the website --------------------
  function coPriceText(p, en) { return typeof p === "number" ? "¥" + p.toLocaleString("zh-CN", { minimumFractionDigits: 0, maximumFractionDigits: 2 }) : (en ? "Price TBD" : "价格待定"); }
  function coPreviewHTML() { return (co.pvmode === "card" ? coPreviewCard() : coPreviewDetail()) + coPreviewNote(); }
  function coPreviewNote() { var f = co.course.fields; return f.available === false ? '<p class="faint" style="font-size:12px;margin-top:8px">' + t("「可用」未勾选：发布后网站不显示这门课。", "“Available” is off: the website will not show this course.") + "</p>" : ""; }
  // the course window a family opens on the website: every field, in the website's order
  function coPreviewDetail() {
    var f = co.course.fields, en = co.lang === "en", none = '<span class="faint">—</span>';
    var lab = function (z, e) { return en ? e : z; };
    var names = function (k, ids) { return (ids || []).map(function (id) { return coLookupLabel(k, id); }); };
    var name = en ? f.nameEn || f.nameZh : f.nameZh || f.nameEn, desc = en ? f.descriptionEn || f.descriptionZh : f.descriptionZh || f.descriptionEn;
    var tags = [];
    if (f.classType && (f.classType.en || f.classType.zh)) tags.push(en ? f.classType.en : f.classType.zh);
    if (f.language && (f.language.en || f.language.zh)) tags.push(en ? f.language.en : f.language.zh);
    if (f.academic) tags.push(lab("学术课程", "Academic"));
    var days = (f.days || []).map(function (d) { return en ? d.slice(0, 3) : DAY_ZH[d] || d; }).join(en ? ", " : "、");
    var sched = (days || f.classTime) ? esc((days ? days + " " : "") + (f.classTime || "")) : "";
    var books = names("textbooks", f.textbooks), grades = names("grades", f.grades), subs = names("subjects", f.subjects), who = names("teachers", f.teachers), school = names("school", f.school);
    var syl = (f.syllabus || []).map(function (a) { return '<a href="' + esc(a.url || ("/api/f/" + a.id)) + '" target="_blank" rel="noopener">' + esc(a.name || "syllabus.pdf") + "</a>"; }).join(" · ");
    var row = function (z, e, v, wide) { return '<div class="pvrow' + (wide ? " wide" : "") + '"><div class="pvlab">' + esc(lab(z, e)) + '</div><div class="pvval">' + (v || none) + "</div></div>"; };
    var chipsHTML = function (arr) { return arr.length ? arr.map(function (x) { return '<span class="pvchip">' + esc(x) + "</span>"; }).join("") : ""; };
    return '<div class="pvcard pvdetail"><div class="pvname">' + esc(name || lab("课程名称", "Course name")) + '</div><div class="pvcode">' + esc(f.code || co.course.code || "") + "</div>" +
      (tags.length ? '<div class="pvchips">' + tags.map(function (x) { return "<span>" + esc(x) + "</span>"; }).join("") + "</div>" : "") +
      '<div class="pvlab" style="margin-top:12px">' + esc(lab("课程描述", "Description")) + '</div><p class="pvfull">' + (desc ? esc(desc) : '<span class="faint">' + lab("课程描述", "Description") + "</span>") + "</p>" +
      '<div class="pvgrid">' +
        row("学科", "Subject", esc(subs.join(en ? " · " : "、"))) + row("年级", "Grades", esc(grades.join(" · "))) +
        row("授课语言", "Language", f.language && (f.language.en || f.language.zh) ? esc(en ? f.language.en : f.language.zh) : "") + row("课程类型", "Class type", f.classType && (f.classType.en || f.classType.zh) ? esc(en ? f.classType.en : f.classType.zh) : "") +
        row("课时数", "Classes", typeof f.numClasses === "number" ? esc(f.numClasses) + (en ? " classes" : " 节") : "") + row("学分", "Credit hours", typeof f.creditHours === "number" ? esc(f.creditHours) : "") +
        row("上课安排", "Schedule", sched || '<span class="faint">' + lab("时间待定", "Time TBD") + "</span>", true) +
        row("授课老师", "Teachers", chipsHTML(who), true) + row("课程提供方", "Course deliverer", esc(school.join(", ")), false) +
        row("前置课程", "Prerequisite", f.prerequisite && f.prerequisite !== "N/A" ? esc(f.prerequisite) : "") +
        row("教材", "Textbooks", books.length ? books.map(function (x) { return '<div>' + esc(x) + "</div>"; }).join("") : "", true) +
        row("课程大纲", "Syllabus", syl, true) + row("备注", "Comments", f.comments ? esc(f.comments) : "", true) +
      "</div>" +
      '<div class="pvfoot"><span class="pvprice">' + esc(coPriceText(f.price, en)) + '</span><span class="pvbtn">' + (en ? "Select" : "选择") + "</span></div></div>";
  }
  function coPreviewCard() {
    var f = co.course.fields, lk = co.lookups, en = co.lang === "en";
    var name = en ? f.nameEn || f.nameZh : f.nameZh || f.nameEn;
    var desc = en ? f.descriptionEn || f.descriptionZh : f.descriptionZh || f.descriptionEn;
    var grades = (f.grades || []).map(function (id) { return coLookupLabel("grades", id); });
    var chips = [];
    if (f.classType && (f.classType.en || f.classType.zh)) chips.push(en ? f.classType.en : f.classType.zh);
    if (grades.length) chips.push(grades.length > 3 ? grades[0] + "–" + grades[grades.length - 1] : grades.join(" · "));
    var teachers = (f.teachers || []).map(function (id) { return coLookupLabel("teachers", id); });
    var subjects = (f.subjects || []).map(function (id) { return coLookupLabel("subjects", id); });
    var days = (f.days || []).map(function (d) { return en ? d.slice(0, 3) : DAY_ZH[d] || d; }).join(" ");
    return '<div class="pvcard"><div class="pvname">' + esc(name || (en ? "Course name" : "课程名称")) + '</div><div class="pvcode">' + esc(f.code || co.course.code || "") + (subjects.length ? " · " + esc(subjects.join(", ")) : "") + "</div>" +
      (chips.length ? '<div class="pvchips">' + chips.map(function (x) { return '<span>' + esc(x) + "</span>"; }).join("") + "</div>" : "") +
      '<p class="pvdesc">' + esc(desc || (en ? "Description" : "课程描述")) + "</p>" +
      '<div class="pvline">' + (en ? "Teacher" : "老师") + "：" + (teachers.length ? esc(teachers.join(", ")) : '<span class="faint">—</span>') + "</div>" +
      '<div class="pvline">' + (en ? "Class time" : "上课时间") + "：" + (f.classTime || days ? esc((days ? days + " " : "") + (f.classTime || "")) : '<span class="faint">' + (en ? "Time TBD" : "时间待定") + "</span>") + "</div>" +
      (f.language && (f.language.en || f.language.zh) ? '<div class="pvline">' + (en ? "Language" : "授课语言") + "：" + esc(en ? f.language.en : f.language.zh) + "</div>" : "") +
      (f.creditHours != null ? '<div class="pvline">' + (en ? "Credit" : "学分") + "：" + esc(f.creditHours) + "</div>" : "") +
      (f.prerequisite ? '<div class="pvline">' + (en ? "Prerequisite" : "前置课程") + "：" + esc(f.prerequisite) + "</div>" : "") +
      ((f.syllabus || []).length ? '<div class="pvline">' + (en ? "Syllabus" : "课程大纲") + "：" + (f.syllabus || []).map(function (a) { return '<a href="' + esc(a.url || ("/api/f/" + a.id)) + '" target="_blank" rel="noopener">' + esc(a.name) + "</a>"; }).join(" · ") + "</div>" : "") +
      '<div class="pvfoot"><span>' + coPriceText(f.price, en) + '</span><span class="pvbtn">' + (en ? "Select" : "选择") + "</span></div></div>";
  }
  var coPreviewSoon = debounce(function () { if ($("coprevbody")) $("coprevbody").innerHTML = coPreviewHTML(); }, 300);

  // ---- the section tabs stay in the sticky bar; the one being read lights up -------------------
  function coSpyMark(id) { document.querySelectorAll("#cosecnav a").forEach(function (a) { a.classList.toggle("on", a.getAttribute("data-sec") === id); }); }
  function coSpy() {
    if (co.spyLock && Date.now() < co.spyLock) return;
    var bar = document.querySelector(".cobar"), line = (bar ? bar.getBoundingClientRect().bottom : 0) + 24, cur = CO_SECTIONS[0].id;
    CO_SECTIONS.forEach(function (s) { var el = $("sec-" + s.id); if (el && el.getBoundingClientRect().top <= line) cur = s.id; });
    var sc = $("content"); if (sc && sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 4) cur = CO_SECTIONS[CO_SECTIONS.length - 1].id;
    coSpyMark(cur);
  }
  // ---- binding: autosave, pills, chips, files, menu, actions ---------------------------------
  function coBindEditor() {
    var root = $("coed");
    $("content").onscroll = coSpy; coSpy();
    root.querySelectorAll("textarea.coauto").forEach(coAutosize);
    // text / number / checkbox: save after 1.5 s idle or on blur
    root.addEventListener("input", function (e) {
      var el = e.target; if (!el.classList.contains("cof")) return;
      if (el.tagName === "TEXTAREA") coAutosize(el);
      var k = el.getAttribute("data-k"), v = el.type === "checkbox" ? el.checked : el.type === "number" ? (el.value === "" ? null : Number(el.value)) : el.value;
      if (el.type === "checkbox") el.parentNode.querySelector("span").textContent = el.checked ? t("是", "Yes") : t("否", "No");
      coQueue(k, v, el.type === "checkbox" ? 0 : 1500);
    });
    root.addEventListener("focusout", function (e) { var el = e.target; if (el.classList && el.classList.contains("cof")) coFlush(el.getAttribute("data-k")); });
    root.addEventListener("keydown", function (e) { if ((e.metaKey || e.ctrlKey) && e.key === "s") { e.preventDefault(); coFlushAll(); } });
    // pills (single: the paired selects; multi: days)
    root.addEventListener("click", function (e) {
      var pill = e.target.closest(".copill"); if (pill && !pill.disabled) {
        var box = pill.parentNode, k = box.getAttribute("data-k");
        if (box.getAttribute("data-single")) { box.querySelectorAll(".copill").forEach(function (p) { p.classList.toggle("on", p === pill); }); coQueue(k, { en: pill.getAttribute("data-en"), zh: pill.getAttribute("data-zh") }, 0); }
        else { pill.classList.toggle("on"); coQueue(k, Array.prototype.map.call(box.querySelectorAll(".copill.on"), function (p) { return p.getAttribute("data-v"); }), 0); }
        return;
      }
      var x = e.target.closest(".cochip-x"); if (x) { var chip = x.parentNode, box2 = chip.parentNode; chip.parentNode.removeChild(chip); coChipsChanged(box2); return; }
      var det = e.target.closest("[data-detail]"); if (det) { coFieldPanel(det.getAttribute("data-detail")); return; }
      var rm = e.target.closest("[data-frm]"); if (rm) { var list = co.course.fields.syllabus || []; list.splice(+rm.getAttribute("data-frm"), 1); coQueue("syllabus", list, 0); coRepaintField("syllabus"); return; }
      var sec = e.target.closest(".cosecnav a"); if (sec) { e.preventDefault(); var tgt = $("sec-" + sec.getAttribute("data-sec")); if (tgt) { co.spyLock = Date.now() + 700; coSpyMark(sec.getAttribute("data-sec")); tgt.scrollIntoView({ behavior: "smooth", block: "start" }); } return; }
      var pv = e.target.closest(".pvmode button"); if (pv) { co.pvmode = pv.getAttribute("data-pv"); document.querySelectorAll(".pvmode button").forEach(function (b) { b.classList.toggle("on", b === pv); }); $("coprevbody").innerHTML = coPreviewHTML(); return; }
      var lang = e.target.closest(".colang button"); if (lang) { coSetLang(lang.getAttribute("data-lang")); return; }
      if (e.target.closest("#coMore")) { $("coMenu").hidden = !$("coMenu").hidden; return; }
      var mi = e.target.closest("#coMenu .mi[data-op]"); if (mi) { $("coMenu").hidden = true; coMenuOp(mi.getAttribute("data-op")); return; }
      if (!e.target.closest("#coMenu")) $("coMenu").hidden = true;
      if (e.target.closest("#coSide")) return coSideToggle();
      if (e.target.closest("#coTranslate")) return coTranslate();
      if (e.target.closest("#coVersions")) return coVersionsPanel();
      if (e.target.closest("#coSubmit")) return coSubmit();
      if (e.target.closest("#coWithdraw")) return coOp("withdraw");
      if (e.target.closest("#coPublish")) return coPublishPanel();
    });
    // chip search: type to filter the lookup rows; Enter / click adds; chips drag to reorder
    root.addEventListener("input", function (e) { var q = e.target; if (q.classList && q.classList.contains("cochip-q")) coChipMenu(q); });
    root.addEventListener("focusin", function (e) { var q = e.target; if (q.classList && q.classList.contains("cochip-q")) coChipMenu(q); });
    root.addEventListener("keydown", function (e) {
      var q = e.target; if (!(q.classList && q.classList.contains("cochip-q"))) return;
      var menu = q.nextElementSibling, cur = menu.querySelector(".cur");
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); var items = menu.querySelectorAll("[data-id]"); if (!items.length) return; var i = Array.prototype.indexOf.call(items, cur); i = e.key === "ArrowDown" ? Math.min(items.length - 1, i + 1) : Math.max(0, i - 1); items.forEach(function (x, j) { x.classList.toggle("cur", j === i); }); }
      else if (e.key === "Enter") { e.preventDefault(); var pick = cur || menu.querySelector("[data-id]"); if (pick) coChipAdd(q, pick.getAttribute("data-id")); }
      else if (e.key === "Escape") { menu.hidden = true; }
      else if (e.key === "Backspace" && !q.value) { var last = q.parentNode.previousElementSibling; if (last && last.classList.contains("cochip")) { last.parentNode.removeChild(last); coChipsChanged(q.closest(".cochips")); } }
    });
    root.addEventListener("mousedown", function (e) { var it = e.target.closest(".cochip-menu [data-id]"); if (it) { e.preventDefault(); coChipAdd(it.closest(".cochip-add").querySelector(".cochip-q"), it.getAttribute("data-id")); } });
    root.addEventListener("focusout", function (e) { var q = e.target; if (q.classList && q.classList.contains("cochip-q")) setTimeout(function () { if (q.nextElementSibling) q.nextElementSibling.hidden = true; }, 150); });
    var dragging = null;
    root.addEventListener("dragstart", function (e) { var chip = e.target.closest(".cochip[draggable=true]"); if (!chip) return; dragging = chip; chip.classList.add("drag"); e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", chip.getAttribute("data-id")); } catch (x) {} });
    root.addEventListener("dragover", function (e) { if (!dragging) return; var over = e.target.closest(".cochip"); if (!over || over === dragging || over.parentNode !== dragging.parentNode) return; e.preventDefault(); var r = over.getBoundingClientRect(); over.parentNode.insertBefore(dragging, e.clientX < r.left + r.width / 2 ? over : over.nextSibling); });
    root.addEventListener("dragend", function () { if (!dragging) return; dragging.classList.remove("drag"); coChipsChanged(dragging.parentNode); dragging = null; });
    // files
    root.addEventListener("change", function (e) { var inp = e.target; if (inp.type === "file" && inp.closest(".cofiles")) { coUpload(inp.files); inp.value = ""; } });
    root.addEventListener("dragover", function (e) { if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types, "Files") >= 0 && e.target.closest(".cofiles")) { e.preventDefault(); e.target.closest(".cofiles").classList.add("over"); } });
    root.addEventListener("dragleave", function (e) { var z = e.target.closest(".cofiles"); if (z) z.classList.remove("over"); });
    root.addEventListener("drop", function (e) { var z = e.target.closest(".cofiles"); if (!z || !e.dataTransfer || !e.dataTransfer.files.length) return; e.preventDefault(); z.classList.remove("over"); if (co.editable && co.editable.syllabus) coUpload(e.dataTransfer.files); });
    window.removeEventListener("beforeunload", coBeforeUnload); window.addEventListener("beforeunload", coBeforeUnload);
  }
  function coBeforeUnload(e) { if (Object.keys(co.pending).length || co.saving) { e.preventDefault(); e.returnValue = ""; } }
  function coAutosize(ta) { ta.style.height = "auto"; ta.style.height = Math.min(600, ta.scrollHeight + 2) + "px"; }
  function coSetLang(l) {
    if (l === co.lang) return;
    coFlushAll(); co.lang = l;
    var y = $("content").scrollTop;
    coRenderEditor(); $("content").scrollTop = y;
  }
  function coChipsChanged(box) {
    var k = box.getAttribute("data-k"), ids = Array.prototype.map.call(box.querySelectorAll(".cochip"), function (c) { return c.getAttribute("data-id"); });
    coQueue(k, ids, 0);
    var q = box.querySelector(".cochip-q"); if (q) q.placeholder = k === "school" && ids.length ? "" : t("添加…", "Add…");
  }
  function coChipMenu(q) {
    var box = q.closest(".cochips"), k = q.getAttribute("data-k"), menu = q.nextElementSibling, s = q.value.trim().toLowerCase();
    if (k === "school" && box.querySelectorAll(".cochip").length) { menu.hidden = true; return; }
    var have = Array.prototype.map.call(box.querySelectorAll(".cochip"), function (c) { return c.getAttribute("data-id"); });
    var rows = coLookupRows(k).filter(function (r) { return have.indexOf(r.id) < 0 && (!s || (r.label + " " + r.alt).toLowerCase().indexOf(s) >= 0); }).slice(0, 12);
    menu.innerHTML = rows.length ? rows.map(function (r, i) { return '<div data-id="' + esc(r.id) + '"' + (i === 0 ? ' class="cur"' : "") + ">" + hl(r.label, s) + "</div>"; }).join("") : '<div class="faint">' + (s ? t("没有匹配", "No match") : t("没有更多可选", "Nothing more to add")) + "</div>";
    menu.hidden = false;
  }
  function coChipAdd(q, id) {
    var box = q.closest(".cochips"), k = q.getAttribute("data-k");
    if (box.getAttribute("data-single")) box.querySelectorAll(".cochip").forEach(function (c) { c.parentNode.removeChild(c); });
    var tmp = document.createElement("span"); tmp.innerHTML = coChipHTML(k, id, true);
    box.insertBefore(tmp.firstChild, q.parentNode);
    q.value = ""; coChipsChanged(box); coChipMenu(q);
  }
  // ---- autosave --------------------------------------------------------------------------------
  function coKeepLocal() { try { localStorage.setItem("fc-course-" + co.id, JSON.stringify({ at: new Date().toISOString(), pending: co.pending })); } catch (e) {} }
  function coQueue(k, v, ms) {
    co.pending[k] = v; co.course.fields[k] = v;
    coKeepLocal();
    clearTimeout(co.timers[k]);
    if (ms) co.timers[k] = setTimeout(function () { coFlush(k); }, ms); else coFlush(k);
    coPreviewSoon();
    if (k === "nameEn" || k === "nameZh") { if ($("coTitle")) $("coTitle").textContent = coName(co.course); }
  }
  // The server lost the working record (it answers "open the course first"): reopen the editor — open()
  // rebuilds it from Airtable, and the localStorage safety net offers the unsaved edits back.
  function coGone(r) {
    if (!(r && r.status === 400 && /open the course first/i.test((r.body && r.body.error) || ""))) return false;
    flash(esc(t("这门课的编辑记录需要重新打开，正在重新载入…", "The course's working record has to be reopened — reloading…")));
    setTimeout(function () { viewCourseEditor(co.id); }, 600);
    return true;
  }
  function coFlush(k) {
    clearTimeout(co.timers[k]);
    if (!(k in co.pending)) return;
    var v = co.pending[k]; delete co.pending[k];
    co.saving++; coSavedPaint();
    api("courses/field", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: co.id, key: k, value: v }) }).then(function (r) {
      co.saving--;
      if (!r.ok) {
        if (coGone(r)) { co.pending[k] = co.pending[k] === undefined ? v : co.pending[k]; coKeepLocal(); return; }
        if (r.status === 400 || r.status === 403) { co.failed = false; flash(esc(errText(r))); coSavedPaint(); return; }
        co.failed = true; co.pending[k] = co.pending[k] === undefined ? v : co.pending[k]; coSavedPaint();
        setTimeout(function () { coFlush(k); }, 10000); return;
      }
      co.failed = false; co.savedAt = r.body.savedAt;
      if (r.body.translation) { co.translation = r.body.translation; co.needs = r.body.needs || 0; coRefreshTags(); }
      if (co.course.status !== r.body.status) { co.course.status = r.body.status; coRefreshBar(); }
      try { if (!Object.keys(co.pending).length) localStorage.removeItem("fc-course-" + co.id); } catch (e) {}
      coSavedPaint();
    }).catch(function () { co.saving--; co.failed = true; co.pending[k] = v; coSavedPaint(); setTimeout(function () { coFlush(k); }, 10000); });
  }
  function coFlushAll() { Object.keys(co.pending).forEach(coFlush); }
  // after a change that only the server decides (translation tags, status): repaint the small parts
  function coRefreshTags() {
    if (!$("coTranslate")) return;
    $("coTranslate").toggleAttribute("data-needs", !!co.needs); $("coTranslate").innerHTML = t("生成双语", "Translate") + (co.needs ? ' <small>' + co.needs + "</small>" : "");
    ["name", "description"].forEach(coRepaintLabel);
  }
  function coRepaintLabel(k) { var row = document.querySelector('.corowf[data-row="' + k + '"]'); if (!row) return; var tmp = document.createElement("div"); tmp.innerHTML = coFieldHTML(k); row.querySelector(".colab").innerHTML = tmp.querySelector(".colab").innerHTML; tipify(row); }
  function coRepaintField(k) { var row = document.querySelector('.corowf[data-row="' + k + '"]'); if (!row) return; var tmp = document.createElement("div"); tmp.innerHTML = coFieldHTML(k); row.innerHTML = tmp.firstChild.innerHTML; row.querySelectorAll("textarea.coauto").forEach(coAutosize); tipify(row); coPreviewSoon(); }
  function coRefreshBar() { var tmp = document.createElement("div"); tmp.innerHTML = coBarHTML(); $("coed").replaceChild(tmp.firstChild, $("coed").querySelector(".cobar")); coSpy(); $("costeps").innerHTML = coStepsHTML(); $("coreturned").innerHTML = coReturnedHTML(); }
  function coRepaintAll() { var y = $("content").scrollTop; coRenderEditor(); $("content").scrollTop = y; }
  // the localStorage safety net: changes typed but never saved (power cut, closed tab)
  function coRecoverLocal() {
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem("fc-course-" + co.id) || "null"); } catch (e) {}
    if (!saved || !saved.pending || !Object.keys(saved.pending).length) return;
    if (co.course.draftAt && saved.at <= co.course.draftAt) { try { localStorage.removeItem("fc-course-" + co.id); } catch (e) {} return; }
    flash('<b>' + t("发现未保存的改动", "Unsaved changes found") + "</b>（" + esc(when(saved.at)) + "，" + Object.keys(saved.pending).map(coLabel).join("、") + "） " +
      '<button class="btn sm" id="coRecYes">' + t("恢复", "Restore") + '</button> <button class="btn secondary sm" id="coRecNo">' + t("丢弃", "Discard") + "</button>", 60000);
    $("coRecYes").onclick = function () { Object.keys(saved.pending).forEach(function (k) { coQueue(k, saved.pending[k], 0); }); coRepaintAll(); $("flash").hidden = true; };
    $("coRecNo").onclick = function () { try { localStorage.removeItem("fc-course-" + co.id); } catch (e) {} $("flash").hidden = true; };
  }

  // ---- files: chunked upload of a syllabus PDF -------------------------------------------------
  function b64chunk(buf) { var s = "", a = new Uint8Array(buf); for (var i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000)); return btoa(s); }
  async function coUpload(fileList) {
    var file = fileList && fileList[0]; if (!file) return;
    var list = co.course.fields.syllabus || [];
    if (!(file.type === "application/pdf" || /\.pdf$/i.test(file.name))) { flash(esc(t("课程大纲只能是 PDF。", "A syllabus must be a PDF."))); return; }
    if (file.size > CO_PDF_MAX) { flash(esc(t("这个 PDF 超过 10 MB，请压缩后再传。", "This PDF is over 10 MB — please compress it."))); return; }
    if (list.length >= 3) { flash(esc(t("最多 3 个文件。", "At most 3 files."))); return; }
    var row = { id: "", name: file.name, type: "application/pdf", size: file.size, progress: 0 };
    list.push(row); co.course.fields.syllabus = list; coRepaintField("syllabus");
    try {
      var total = Math.max(1, Math.ceil(file.size / CO_FILE_CHUNK)), id = "", buf = await file.arrayBuffer(), r;
      for (var i = 0; i < total; i++) {
        var body = { course: co.id, name: file.name, size: file.size, index: i, total: total, data: b64chunk(buf.slice(i * CO_FILE_CHUNK, (i + 1) * CO_FILE_CHUNK)) };
        if (id) body.id = id; // the upload id comes back with the first chunk
        r = await post("courses/upload", "POST", body);
        if (!r.ok) throw new Error(errText(r));
        id = r.body.id; row.progress = Math.round((i + 1) / total * 100); coRepaintField("syllabus");
      }
      row.id = r.body.file.id; row.url = r.body.file.url; row.size = r.body.file.size; delete row.progress;
      coQueue("syllabus", list.map(function (a) { return { id: a.id, name: a.name, size: a.size, type: a.type, url: a.url, airtable: !!a.airtable }; }), 0);
    } catch (err) { list.splice(list.indexOf(row), 1); flash(esc(t("上传失败：", "Upload failed: ") + (err && err.message || ""))); }
    coRepaintField("syllabus");
  }

  // ---- 生成双语 -----------------------------------------------------------------------------------
  function coHumanStale() { var tr = co.translation || {}; return Object.keys(tr).filter(function (k) { return tr[k] === "human-stale"; }); }
  // opts: { overwrite } update the outdated human translations too · { all } translate everything from the current language
  function coTranslate(opts) {
    var b = $("coTranslate"); if (!b || b.getAttribute("aria-busy")) return;
    opts = opts && opts.target ? null : opts;                 // a click event is not options
    coFlushAll();
    // nothing to do: say so, and offer the thorough version
    if (!co.needs && !(opts && opts.all)) {
      flash(esc(t("双语已是最新：另一种语言的每个字段都已有内容，原文也没有再改过。", "Both languages are up to date: every field has text in the other language and the source has not changed since.")) +
        ' <button class="btn secondary sm" id="coTrAll">' + t("用当前语言重新翻译全部", "Re-translate everything from this language") + "</button>");
      $("coTrAll").onclick = function () { $("flash").hidden = true; coTranslate({ all: true }); };
      return;
    }
    // outdated translations a person wrote: ask before replacing them
    var hs = coHumanStale();
    if (hs.length && !opts) {
      var gaps = co.needs > hs.length;
      flash(esc(t(hs.length + " 个字段的译文是人工写的，但它的原文后来改过了。要用机器译文更新吗？旧译文会留在「版本」里，可以恢复。", hs.length + " translation(s) were written by a person, but their source changed afterwards. Replace them with a machine translation? The old text stays in Versions and can be restored.")) +
        ' <button class="btn sm" id="coTrYes">' + t("更新", "Update") + '</button> <button class="btn secondary sm" id="coTrNo">' + (gaps ? t("只翻译空白的", "Only fill the gaps") : t("保留现有译文", "Keep them")) + "</button>");
      $("coTrYes").onclick = function () { $("flash").hidden = true; coTranslate({ overwrite: true }); };
      $("coTrNo").onclick = function () { $("flash").hidden = true; if (gaps) coTranslate({ overwrite: false }); };
      return;
    }
    opts = opts || {};
    savingButton(b); b.setAttribute("aria-busy", "1"); b.textContent = t("翻译中…", "Translating…");
    post("courses/op", "POST", { id: co.id, op: "translate", overwrite: !!opts.overwrite, all: !!opts.all, from: co.lang }).then(function (r) {
      b.removeAttribute("aria-busy");
      if (!r.ok) { restoreButton(b); if (coGone(r)) return; flash(esc(r.body && r.body.code === "no_translator" ? t("翻译服务尚未配置（AZURE_TRANSLATOR_KEY）。", "The translator is not configured (AZURE_TRANSLATOR_KEY).") : errText(r))); return; }
      coTake(r.body); coRepaintAll();
      var n = (r.body.done || []).length;
      flashOk(esc(n ? t("已生成 ", "Translated ") + n + t(" 个字段的译文；切换语言可以查看和修改。", " field(s); switch the language to read and edit them.") : t("双语已是最新。", "Both languages are up to date.")));
    });
  }
  // ---- submit / withdraw / return / milestone ----------------------------------------------------
  function coOp(op, extra, btn) {
    coFlushAll();
    if (btn) savingButton(btn);
    return post("courses/op", "POST", Object.assign({ id: co.id, op: op }, extra || {})).then(function (r) {
      if (btn) restoreButton(btn);
      if (!r.ok) { if (!coGone(r)) flash(esc(errText(r))); return null; }
      coTake(r.body); coRefreshBar(); coRefreshTags();
      return r.body;
    });
  }
  function coSubmit() {
    if (co.needs - coHumanStale().length > 0) { flash(esc(t("另一种语言还有空白或过时的字段：先按「生成双语」，再提交。", "The other language has empty or outdated fields: run Translate first, then submit.")) + ' <button class="btn sm" id="coTrNow">' + t("生成双语", "Translate") + "</button>"); $("coTrNow").onclick = function () { $("flash").hidden = true; coTranslate(); }; return; }
    panelOpen('<div class="ph"><span class="avatar">✓</span><h3>' + t("提交审批", "Submit for approval") + '</h3><button class="x" type="button" aria-label="close">✕</button></div><div class="pb">' +
      '<p class="sub">' + esc(t("提交后由课程总监、CEO 或系统管理员审阅并发布到网站。提交后仍可以继续修改，或撤回。", "The curriculum director, the CEO or the system administrator will review it and publish it to the website. You can still edit or withdraw after submitting.")) + "</p>" +
      '<label class="f">' + t("给审批人的话（可选）", "A note for the reviewer (optional)") + '<textarea id="coNote" rows="3"></textarea></label>' +
      '<div class="actions"><button class="btn" id="coGo">' + t("提交", "Submit") + "</button></div></div>");
    $("coGo").addEventListener("click", function () { coOp("submit", { note: $("coNote").value }, $("coGo")).then(function (b) { if (b) { panelClose(); flashOk(esc(t("已提交，等待审批。", "Submitted — waiting for review."))); } }); });
  }
  function coMenuOp(op) {
    if (op === "preview") { $("coed").classList.toggle("noprev"); return; }
    if (op === "milestone") { coOp("milestone", { note: "" }).then(function (b) { if (b) flashOk(esc(t("已存一个版本。", "Version saved."))); }); return; }
    if (op === "return") {
      panelOpen('<div class="ph"><span class="avatar">↩</span><h3>' + t("退回给老师", "Return to the teacher") + '</h3><button class="x" type="button" aria-label="close">✕</button></div><div class="pb">' +
        '<label class="f">' + t("退回意见（老师会看到）", "Comment for the teacher") + ' <span class="req">*</span><textarea id="coCmt" rows="4"></textarea></label><div class="actions"><button class="btn" id="coGo">' + t("退回", "Return") + "</button></div></div>");
      $("coGo").addEventListener("click", function () { if (!$("coCmt").value.trim()) { $("coCmt").focus(); return; } coOp("return", { comment: $("coCmt").value }, $("coGo")).then(function (b) { if (b) { panelClose(); flashOk(esc(t("已退回。", "Returned."))); } }); });
      return;
    }
    if (op === "withdraw") coOp("withdraw");
  }
  // ---- publish (approvers): what changed, then publish, then refresh the website ------------------
  function coPublishPanel() {
    coFlushAll();
    var c = co.course, base = c.baseline || {}, changed = Object.keys(c.fields).filter(function (k) { return JSON.stringify(c.fields[k]) !== JSON.stringify(base[k]); });
    var probs = [];
    if (!(c.fields.nameEn || "").trim() || !(c.fields.nameZh || "").trim()) probs.push(t("课程名称要有中英文", "The course name needs both languages"));
    if (!(c.fields.descriptionEn || "").trim() || !(c.fields.descriptionZh || "").trim()) probs.push(t("课程描述要有中英文", "The description needs both languages"));
    if (!(c.fields.subjects || []).length) probs.push(t("至少一个学科", "At least one subject")); if (!(c.fields.grades || []).length) probs.push(t("至少一个年级", "At least one grade"));
    panelOpen('<div class="ph"><span class="avatar">📤</span><h3>' + t("发布到 Airtable 和网站", "Publish to Airtable and the website") + '</h3><button class="x" type="button" aria-label="close">✕</button></div><div class="pb">' +
      (probs.length ? '<div class="msg err">' + probs.map(esc).join("<br>") + "</div>" : "") +
      '<h4>' + t("将写入 Airtable 的字段", "Fields that will be written") + ' <small>' + changed.length + "</small></h4>" +
      (changed.length ? '<ul class="colist">' + changed.map(function (k) { return "<li>" + esc(coLabel(k.replace(/(En|Zh)$/, ""))) + (/En$/.test(k) ? " (EN)" : /Zh$/.test(k) ? " (中)" : "") + "</li>"; }).join("") + "</ul>" : '<p class="faint">' + t("和 Airtable 里的一样，没有要写的；仍可发布以标记为已发布。", "Nothing differs from Airtable; publishing only marks the course as published.") + "</p>") +
      '<p class="hint">' + esc(t("发布会把这些字段写进 Airtable 的 Course 表，然后更新网站（最多等两分钟）。", "Publishing writes these fields into the Airtable Course table, then refreshes the website (within two minutes).")) + "</p>" +
      '<div class="actions"><button class="btn" id="coGo"' + (probs.length ? " disabled" : "") + ">" + t("发布", "Publish") + '</button></div><div id="coPubOut"></div></div>');
    $("coGo").addEventListener("click", function () {
      savingButton($("coGo"), t("发布中…", "Publishing…")); $("coPubOut").innerHTML = '<p class="costep">⏳ ' + t("写入 Airtable…", "Writing to Airtable…") + "</p>";
      post("courses/op", "POST", { id: co.id, op: "publish" }).then(function (r) {
        if (!r.ok) { restoreButton($("coGo")); $("coPubOut").innerHTML = '<div class="msg err">' + esc(errText(r)) + "</div>"; return; }
        coTake(r.body); coRefreshBar();
        $("coPubOut").innerHTML = '<p class="costep ok">✓ ' + t("已写入 Airtable", "Written to Airtable") + (r.body.skipped && r.body.skipped.length ? ' <small class="faint">' + t("（跳过：", "(skipped: ") + r.body.skipped.map(coLabel).join(", ") + "）</small>" : "") + '</p><p class="costep" id="coSyncStep">⏳ ' + t("更新网站…", "Refreshing the website…") + "</p>";
        $("coGo").hidden = true;
        coSyncWebsite(null, function (res) {
          var el = $("coSyncStep"); if (!el) return;
          if ((res.ran && res.status === 200) || res.upToDate) el.innerHTML = '✓ ' + t("网站已更新", "Website refreshed");
          else if (res.queued) el.innerHTML = '⏳ ' + t("网站将在 ", "The website refreshes in ") + res.retryIn + t(" 秒内更新（合并多次发布）", " s (publishes are batched)");
          else el.innerHTML = '<span class="warn">⚠ ' + esc(t("网站未更新：", "Website not refreshed: ") + ((res.body && res.body.error) || res.error || "")) + "</span>";
          el.className = "costep ok";
        });
      });
    });
  }
  // Ask the server to refresh the website; it runs at most every two minutes and batches publishes.
  function coSyncWebsite(btn, cb) {
    if (btn) savingButton(btn);
    post("courses/sync", "POST", {}).then(function (r) {
      if (btn) restoreButton(btn);
      var res = r.ok ? r.body : { error: errText(r) };
      if (res.queued && !btn) { clearTimeout(co.syncPoll); co.syncPoll = setTimeout(function () { coSyncWebsite(null, cb); }, (res.retryIn + 2) * 1000); }
      if (cb) cb(res); else if (res.ran || res.upToDate) flashOk(esc(t("网站已更新。", "Website refreshed."))); else if (res.queued) flash(esc(t("网站将在 ", "The website refreshes in ") + res.retryIn + t(" 秒内更新。", " s."))); else flash(esc(t("网站未更新：", "Website not refreshed: ") + (res.error || (res.body && res.body.error) || "")));
    });
  }

  // ---- the field panel: both languages, history, restore a value ------------------------------
  function coFieldPanel(k) {
    coFlushAll();
    var c = co.course, pair = k === "name" || k === "description";
    var keys = pair ? [k + "Zh", k + "En"] : [k];
    var hist = [];
    keys.forEach(function (key) { (c.fieldHistory && c.fieldHistory[key] || []).forEach(function (h) { hist.push(Object.assign({ key: key }, h)); }); });
    hist.sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); });
    var can = co.editable && co.editable[keys[0]] !== false && !(coIsViewer() && !coIsApprover());
    var fmt = function (v) { if (v == null || v === "") return '<span class="faint">' + t("（空）", "(empty)") + "</span>"; if (typeof v === "object") return esc(Array.isArray(v) ? v.map(function (x) { return typeof x === "string" ? coLookupLabel(k, x) : (x.name || x.en || x.zh || JSON.stringify(x)); }).join(", ") : (EN ? v.en : v.zh) || JSON.stringify(v)); return esc(String(v)); };
    panelOpen('<div class="ph"><span class="avatar">⤢</span><h3>' + esc(coLabel(k)) + '</h3><button class="x" type="button" aria-label="close">✕</button></div><div class="pb">' +
      (pair ? '<h4>中文 ' + (co.translation && co.translation[k + "Zh"] === "machine" ? '<span class="cotag mt">' + t("译", "MT") + "</span>" : co.translation && co.translation[k + "Zh"] === "stale" ? '<span class="cotag stale">' + t("原文已改", "Outdated") + "</span>" : "") + "</h4>" +
        (k === "name" ? '<input type="text" class="cofp" data-k="nameZh" value="' + esc(c.fields.nameZh || "") + '"' + (can ? "" : " readonly") + " />" : '<textarea class="cofp" data-k="descriptionZh" rows="6"' + (can ? "" : " readonly") + ">" + esc(c.fields.descriptionZh || "") + "</textarea>") +
        '<h4>English ' + (co.translation && co.translation[k + "En"] === "machine" ? '<span class="cotag mt">' + t("译", "MT") + "</span>" : co.translation && co.translation[k + "En"] === "stale" ? '<span class="cotag stale">' + t("原文已改", "Outdated") + "</span>" : "") + "</h4>" +
        (k === "name" ? '<input type="text" class="cofp" data-k="nameEn" value="' + esc(c.fields.nameEn || "") + '"' + (can ? "" : " readonly") + " />" : '<textarea class="cofp" data-k="descriptionEn" rows="6"' + (can ? "" : " readonly") + ">" + esc(c.fields.descriptionEn || "") + "</textarea>") +
        '<p class="hint">' + esc(t("两边都可以直接改；人工改过的译文不会再被「生成双语」覆盖。", "Edit either side; a translation edited by a person is never overwritten by Translate.")) + "</p>"
        : '<h4>' + t("当前值", "Current value") + "</h4><p>" + fmt(c.fields[k]) + "</p>") +
      '<h4>' + t("修改记录", "History") + ' <small>' + hist.length + "</small></h4>" +
      (hist.length ? '<div class="cohist">' + hist.slice(0, 20).map(function (h, i) { return '<div class="cohist-row"><div><small class="faint">' + esc(when(h.at)) + " · " + esc((h.by || "").split("@")[0]) + (h.machine ? " · " + t("机器翻译", "machine") : "") + (pair ? " · " + (/Zh$/.test(h.key) ? "中" : "EN") : "") + "</small><div>" + fmt(h.to) + "</div></div>" + (can && i > 0 ? '<button type="button" class="linkbtn" data-hv="' + i + '">' + t("恢复", "Restore") + "</button>" : "") + "</div>"; }).join("") + "</div>" : '<p class="faint" style="font-size:12px">' + t("还没有改过。", "Not changed yet.") + "</p>") + "</div>");
    var pb = $("panel").querySelector(".pb");
    pb.addEventListener("input", function (e) { var el = e.target; if (!el.classList.contains("cofp")) return; var key = el.getAttribute("data-k"); coQueue(key, el.value, 1500); var row = document.querySelector('.cof[data-k="' + key + '"]'); if (row) row.value = el.value; });
    pb.addEventListener("click", function (e) { var b = e.target.closest("[data-hv]"); if (!b) return; var h = hist[+b.getAttribute("data-hv")]; coQueue(h.key, h.to, 0); coRepaintField(pair ? k : h.key); panelClose(); flashOk(esc(t("已恢复这个值。", "Value restored."))); });
  }

  // ---- the version timeline ------------------------------------------------------------------------
  function coVersionsPanel() {
    coFlushAll();
    panelOpen('<div class="ph"><span class="avatar">🕘</span><h3>' + t("版本", "Versions") + '</h3><button class="x" type="button" aria-label="close">✕</button></div><div class="pb" id="coVb"><div class="loading">' + t("载入中…", "Loading…") + "</div></div>");
    api("courses/versions?id=" + encodeURIComponent(co.id)).then(function (r) {
      if (!r.ok) { $("coVb").innerHTML = '<div class="msg err">' + esc(errText(r)) + "</div>"; return; }
      var items = r.body.items || [], onlyPub = false;
      var ACT = { save: ["保存", "Saved"], submit: ["提交审批", "Submitted"], withdraw: ["撤回提交", "Withdrawn"], return: ["退回", "Returned"], publish: ["发布", "Published"], restore: ["恢复到某一版", "Restored"], milestone: ["存一个版本", "Version saved"], translate: ["生成双语", "Translated"], open: ["开始编辑", "Opened"], reviewing: ["开始审阅", "Review started"] };
      function paint() {
        var rows = items.filter(function (it) { return !onlyPub || it.action === "publish"; });
        var lastPub = items.filter(function (it) { return it.action === "publish"; })[0];
        var html = '<div class="cofilter"><button type="button" class="chip" aria-pressed="' + !onlyPub + '" data-f="all">' + t("全部", "All") + '</button><button type="button" class="chip" aria-pressed="' + onlyPub + '" data-f="pub">' + t("只看发布", "Published only") + "</button></div>";
        var saves = 0;
        html += '<div class="cotl">' + rows.map(function (it, i) {
          if (it.action === "save" && !onlyPub) { saves++; var next = rows[i + 1]; if (next && next.action === "save") return ""; var n = saves; saves = 0; if (n > 1) return '<div class="cotl-row fold"><small>' + t("… ", "… ") + n + t(" 次自动保存", " autosaves") + "</small></div>"; }
          var a = ACT[it.action] || [it.action, it.action];
          return '<div class="cotl-row' + (it.action === "publish" ? " pub" : "") + '" data-ref="' + esc(it.ref || "") + '"><div class="cotl-dot"></div><div class="cotl-t"><b>' + esc(t(a[0], a[1])) + "</b>" + (it === lastPub ? ' <span class="tag ok">' + t("线上", "Live") + "</span>" : it.action === "publish" ? ' <span class="tag">' + t("已发布", "Published") + "</span>" : "") +
            '<small>' + esc(when(it.at)) + " · " + esc((it.by || "").split("@")[0]) + (it.fields && it.fields.length ? " · " + it.fields.map(function (k) { return coLabel(k.replace(/(En|Zh)$/, "")); }).filter(function (x, j, arr) { return arr.indexOf(x) === j; }).join("、") : "") + "</small>" +
            (it.note ? '<p class="cotl-note">' + esc(it.note) + "</p>" : "") + "</div>" + (it.ref ? '<button type="button" class="linkbtn" data-see="' + esc(it.ref) + '">' + t("查看", "View") + "</button>" : "") + "</div>";
        }).join("") + "</div>";
        $("coVb").innerHTML = html;
      }
      paint();
      $("coVb").addEventListener("click", function (e) {
        var f = e.target.closest("[data-f]"); if (f) { onlyPub = f.getAttribute("data-f") === "pub"; paint(); return; }
        var see = e.target.closest("[data-see]"); if (see) coVersionView(see.getAttribute("data-see"));
      });
    });
  }
  function coVersionView(ref) {
    api("courses/version?id=" + encodeURIComponent(co.id) + "&ref=" + encodeURIComponent(ref)).then(function (r) {
      if (!r.ok) { flash(esc(errText(r))); return; }
      var v = r.body.version, cur = co.course.fields, diff = [];
      var keys = Object.keys(Object.assign({}, v.fields, cur));
      keys.forEach(function (k) { if (JSON.stringify(v.fields[k]) !== JSON.stringify(cur[k])) diff.push(k); });
      var fmt = function (k, val) { if (val == null || val === "" || (Array.isArray(val) && !val.length)) return '<span class="faint">—</span>'; if (Array.isArray(val)) return esc(val.map(function (x) { return typeof x === "string" ? coLookupLabel(k, x) : (x.name || x.en || x.zh || ""); }).join(", ")); if (typeof val === "object") return esc((EN ? val.en : val.zh) || ""); if (typeof val === "boolean") return val ? t("是", "Yes") : t("否", "No"); return esc(String(val)); };
      var can = !(coIsViewer() && !coIsApprover());
      panelOpen('<div class="ph"><button class="back" type="button" aria-label="back">←</button><h3>' + esc(when(v.at)) + ' · ' + esc((v.by || "").split("@")[0]) + '</h3><button class="x" type="button" aria-label="close">✕</button></div><div class="pb">' +
        '<p class="sub">' + (diff.length ? t("与当前版本不同的字段有标记线。", "Fields that differ from the current version are marked.") : t("和当前版本一样。", "Same as the current version.")) + "</p>" +
        '<div class="coverfields">' + Object.keys(CO_LABEL).map(function (k) {
          var ks = k === "name" || k === "description" ? [k + "Zh", k + "En"] : [k];
          return ks.map(function (key) { var d = diff.indexOf(key) >= 0; return '<div class="coverf' + (d ? " diff" : "") + '"><small>' + esc(coLabel(k)) + (/Zh$/.test(key) && ks.length > 1 ? " 中" : /En$/.test(key) && ks.length > 1 ? " EN" : "") + "</small><div>" + fmt(k, v.fields[key]) + "</div>" + (d ? '<em title="' + esc(t("当前值", "Current")) + '">' + t("现在：", "Now: ") + fmt(k, cur[key]) + "</em>" : "") + "</div>"; }).join("");
        }).join("") + "</div>" +
        (can ? '<div class="actions"><button class="btn" id="coRestore">' + t("恢复到这一版", "Restore this version") + '</button></div><p class="hint">' + esc(t("恢复前会先存一个当前版本，可以再恢复回来。", "The current version is saved first, so you can come back.")) + "</p>" : "") + "</div>", "second");
      var b = $("coRestore"); if (b) b.addEventListener("click", function () { coOp("restore", { ref: ref }, b).then(function (body) { if (body) { panelClose(); coRepaintAll(); flashOk(esc(t("已恢复到这一版，状态回到编辑中。", "Restored — the course is back in editing."))); } }); });
      $("panel2").querySelector(".back").addEventListener("click", panel2Close);
    });
  }
