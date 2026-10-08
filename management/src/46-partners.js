// management/src/46-partners.js — 经营 › 合作伙伴: seven partner types, each a board or
// table of relationships on its own cycle; the relationship panel with its stage
// track and milestone timeline; projects; the people picker.
// Part of management.js: scripts/build-management.js concatenates management/src/*.js in name order
// into management/management.js (one closure; every part sees every other's functions). Edit here, not the built file.

  // ================================================================================
  // 合作伙伴 (design 「合作伙伴模块设计 v2」, Rick 2026-10-08). Routes: #/ops/partners/<type>,
  // #/ops/partners/<type>/<REL-…>. Data: GET crm/partners?type=, GET crm/partner?id=,
  // POST crm/partner / crm/project (api/crm/partners.js).
  // ================================================================================
  var PT_TYPES = ["it", "publisher", "university", "intl_school", "course", "funder", "developer"];
  var PT_ICON = { it: "users", publisher: "book", university: "tree", intl_school: "tree", course: "book", funder: "chart", developer: "book" };
  var ptState = { type: "", view: "board", q: "", region: "", stage: "", owner: "", stalled: false, closed: false, data: null, rel: null, tab: "overview" };
  try { var v0 = localStorage.getItem("fc-pt-view"); if (v0 === "table" || v0 === "board") ptState.view = v0; } catch (e) {}
  function ptTypeLabel(k) { var d = ptState.data && ptState.data.types && ptState.data.types[k]; return d ? t(d.zh, d.en) : k; }
  function ptStage(type, k) { var st = (ptState.data && ptState.data.type === type && ptState.data.stages) || (ptState.rel && ptState.rel.stages) || []; return st.filter(function (s) { return s.k === k; })[0] || null; }
  function ptStageLabel(type, k) { var s = ptStage(type, k); return s ? t(s.zh, s.en) : k; }
  function ptRegion(k) { var r = ptState.data && ptState.data.regions && ptState.data.regions[k]; return r ? t(r[0], r[1]) : (k || "—"); }
  function ptStageTag(rel) { var s = ptStage(rel.type, rel.stage); var cls = !s ? "" : s.closed ? "muted" : rel.health && rel.health.stalled ? "warn" : s.renewal ? "accent" : "ok"; return '<span class="tag ' + cls + '">' + esc(s ? t(s.zh, s.en) : rel.stage) + "</span>"; }
  function ptHealthTag(rel) { var h = rel.health || {}; if (rel.closed) return '<span class="tag muted">' + t("已关闭", "closed") + "</span>"; if (h.stalled) return '<span class="tag warn" title="' + esc(ptHealthText(rel)) + '">' + t("停滞", "stalled") + (h.severe ? " !" : "") + "</span>"; if (rel.confirmed === false) return '<span class="tag">' + t("待确认", "to confirm") + "</span>"; return ""; }
  function ptHealthText(rel) { var h = rel.health || {}, bits = []; if ((h.reasons || []).indexOf("stage") >= 0) bits.push(t("在本阶段已 ", "in stage for ") + h.days + t(" 天，阈值 ", " days, threshold ") + h.limit); if (h.nextOverdue) bits.push(t("下一步逾期 ", "next step overdue by ") + h.nextOverdue + t(" 天", " days")); if ((h.reasons || []).indexOf("noNext") >= 0) bits.push(t("没有下一步", "no next step")); return bits.join(" · "); }
  function ptOwner(o) { return o ? esc(String(o).split("@")[0]) : '<span class="muted">' + t("待分配", "unassigned") + "</span>"; }
  function ptPartyLink(rel) { return '<b>' + esc(rel.partyName || (rel.party && rel.party.name) || "") + "</b>" + (rel.party && rel.party.kind === "person" ? ' <span class="tag">' + t("个人", "person") + "</span>" : ""); }

  function viewPartners() {
    var m = /^#\/ops\/partners\/?([a-z_]*)\/?(REL-\d{6})?/.exec(location.hash) || [];
    var type = PT_TYPES.indexOf(m[1]) >= 0 ? m[1] : (ptState.type || "it");
    var openId = m[2] || "";
    if (ptState.type !== type) { ptState.type = type; ptState.data = null; ptState.stage = ""; }
    $("content").innerHTML = '<div class="pagetabs compact" role="tablist" id="ptTabs"></div><div id="ptBody"><div class="loading">' + t("载入中…", "Loading…") + "</div></div>";
    renderPtTabs();
    setTitle(t("经营 › 合作伙伴", "Operations › Partners"), ptTypeLabel(type), "", { info: ptTypeInfo(type) });
    loadPartners(true).then(function () { renderPartnersPage(); if (openId) openRelationship(openId); }).catch(function (r) { $("ptBody").innerHTML = '<div class="card"><p class="sub">' + esc(errText(r)) + "</p></div>"; });
  }
  function ptTypeInfo(type) {
    return {
      it: t("向基督教学校、在家教育群体和单科机构提供 Office 365 等 IT 服务的合作周期：线索 → 评估 → 方案 → 签约 → 开通中 → 运营中（交接给社区经理）→ 续约期。每月按本域名已分配许可的账号数开账单。", "The IT-services cycle for Christian schools, homeschool groups and single-subject institutions: lead → assessment → proposal → signed → onboarding → operating (handed to the community manager) → renewal window. Monthly invoices count the licensed accounts on the school's own domain."),
      publisher: t("出版社（含个人出版人）的版权合作周期：接洽 → 评估（课程总监）→ 条款 → 签约 → 上架 → 在售 → 续约期。这是唯一和 Equip 订单相关的类型，订单只用来算版税，不决定阶段。", "Publishers, including individual publishers: approach → evaluation (curriculum director) → terms → signed → listing → on sale → renewal window. The only type tied to Equip orders, which compute royalties but never set the stage."),
      university: t("大学：线索 → 探索 → 项目设计 → 协议 → 项目运行中 → 年度评审。三种项目：面向中国的学位项目、双学分课程、帮助大学招生与宣传。", "Universities: lead → exploration → programme design → agreement → programmes running → annual review. Three project kinds: degree programmes for China, dual-credit courses, recruiting and promotion."),
      intl_school: t("东南亚和北美的国际学校：推荐学生（收取 commission）、学分互认、国际学校开放课程到蜂巢。", "International schools in Southeast Asia and North America: student referrals (commission), credit recognition, courses opened to Hive."),
      course: t("向蜂巢提供课程的学校、机构和个人教师：申请 → 审核（课程总监）→ 设计与上架 → 已上架 → 开班中 → 学期评估。", "Schools, institutions and individual teachers supplying courses to Hive: application → review (curriculum director) → design and listing → listed → classes running → term review."),
      funder: t("募款伙伴（教会、个人、机构），按美国 501(c)(3) 的捐赠人周期管理：识别 → 评估 → 培养 → 请求 → 管家。仅募款负责人、财务、CEO 可见。", "Fundraising partners (churches, individuals, institutions) on the US 501(c)(3) donor cycle: identification → qualification → cultivation → solicitation → stewardship. Visible to the fundraising lead, finance and the CEO only."),
      developer: t("参与我们自研教材的作者、审稿人、编辑、设计与试教学校，按教材项目组织；关系本身很短（接洽 → 在库可用 → 参与项目中）。", "Authors, reviewers, editors, designers and pilot schools working on our own textbooks, organised by textbook project; the relationship itself is short (approach → available → on a project)."),
    }[type] || "";
  }
  function renderPtTabs() {
    var d = ptState.data, counts = (d && d.counts) || {}, types = (d && d.types) || null;
    var keys = types ? PT_TYPES.filter(function (k) { return k in counts; }) : PT_TYPES.filter(function (k) { return k !== "funder" || crmLevel("money") === "rw"; });
    $("ptTabs").innerHTML = keys.map(function (k) {
      var lab = types && types[k] ? t(types[k].zh, types[k].en) : { it: t("IT 服务", "IT services"), publisher: t("出版社", "Publishers"), university: t("大学", "Universities"), intl_school: t("国际学校", "International schools"), course: t("课程提供方", "Course providers"), funder: t("募款伙伴", "Fundraising"), developer: t("教材开发者", "Curriculum developers") }[k];
      return '<a class="ptab inline' + (k === ptState.type ? " on" : "") + '" role="tab" aria-selected="' + (k === ptState.type) + '" href="#/ops/partners/' + k + '">' + esc(lab) + (k in counts ? '<span class="cnt">' + counts[k] + "</span>" : "") + "</a>";
    }).join("") + '<div class="tabsRight" id="ptRight"></div>';
  }
  function loadPartners(force) {
    if (ptState.data && !force) return Promise.resolve(ptState.data);
    return api("crm/partners?type=" + encodeURIComponent(ptState.type) + (ptState.closed ? "&all=1" : "")).then(function (r) { if (!r.ok) throw r; ptState.data = r.body; renderPtTabs(); return r.body; });
  }
  function renderPartnersPage() {
    var d = ptState.data; if (!d || !$("ptBody")) return;
    setTitle(t("经营 › 合作伙伴", "Operations › Partners"), ptTypeLabel(d.type), (d.canEdit ? '<button class="btn sm" id="ptNew">' + t("新建关系", "New relationship") + "</button> " : "") + '<button class="btn secondary sm" id="ptReload">' + t("刷新", "Refresh") + "</button>", { info: ptTypeInfo(d.type) });
    $("ptRight").innerHTML = '<div class="seg" role="group"><button type="button" class="chip" data-view="board" aria-pressed="' + (ptState.view === "board") + '">' + t("看板", "Board") + '</button><button type="button" class="chip" data-view="table" aria-pressed="' + (ptState.view === "table") + '">' + t("表格", "Table") + "</button></div>";
    var owners = {}; d.rows.forEach(function (r) { if (r.owner) owners[r.owner] = 1; });
    $("ptBody").innerHTML =
      '<div class="toolbar"><div class="search">' + ICON.search + '<input type="search" id="ptq" value="' + esc(ptState.q) + '" placeholder="' + t("搜索机构、人、负责人…", "Search organization, person, owner…") + '" /></div>' +
        '<select id="ptRegion"><option value="">' + t("所有地区", "All regions") + "</option>" + Object.keys(d.regions || {}).map(function (k) { return '<option value="' + k + '"' + (ptState.region === k ? " selected" : "") + ">" + esc(ptRegion(k)) + "</option>"; }).join("") + "</select>" +
        '<select id="ptStage"><option value="">' + t("所有阶段", "All stages") + "</option>" + d.stages.map(function (s) { return '<option value="' + s.k + '"' + (ptState.stage === s.k ? " selected" : "") + ">" + esc(t(s.zh, s.en)) + "</option>"; }).join("") + "</select>" +
        '<select id="ptOwner"><option value="">' + t("所有负责人", "All owners") + '</option><option value="-"' + (ptState.owner === "-" ? " selected" : "") + ">" + t("待分配", "Unassigned") + "</option>" + Object.keys(owners).sort().map(function (o) { return '<option value="' + esc(o) + '"' + (ptState.owner === o ? " selected" : "") + ">" + esc(o.split("@")[0]) + "</option>"; }).join("") + "</select>" +
        '<button type="button" class="chip" id="ptStalled" aria-pressed="' + ptState.stalled + '">' + t("只看停滞", "Stalled only") + '</button><button type="button" class="chip" id="ptClosed" aria-pressed="' + ptState.closed + '">' + t("含已关闭", "Include closed") + "</button></div>" +
      '<div class="kpis strip" id="ptKpi"></div><div id="ptList"></div>';
    $("ptq").addEventListener("input", debounce(function () { ptState.q = $("ptq").value.trim(); renderPartnerRows(); }, 120));
    $("ptRegion").addEventListener("change", function () { ptState.region = this.value; renderPartnerRows(); });
    $("ptStage").addEventListener("change", function () { ptState.stage = this.value; renderPartnerRows(); });
    $("ptOwner").addEventListener("change", function () { ptState.owner = this.value; renderPartnerRows(); });
    $("ptStalled").addEventListener("click", function () { ptState.stalled = !ptState.stalled; this.setAttribute("aria-pressed", ptState.stalled); renderPartnerRows(); });
    $("ptClosed").addEventListener("click", function () { ptState.closed = !ptState.closed; this.setAttribute("aria-pressed", ptState.closed); loadPartners(true).then(renderPartnersPage); });
    $("ptRight").addEventListener("click", function (e) { var b = e.target.closest("[data-view]"); if (!b) return; ptState.view = b.getAttribute("data-view"); try { localStorage.setItem("fc-pt-view", ptState.view); } catch (err) {} $("ptRight").querySelectorAll(".chip").forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); }); renderPartnerRows(); });
    $("ptReload").addEventListener("click", function () { loadPartners(true).then(renderPartnersPage); });
    if ($("ptNew")) $("ptNew").addEventListener("click", openNewRelationship);
    $("ptList").addEventListener("click", function (e) { var c = e.target.closest("[data-rel]"); if (c) { document.querySelectorAll("table.data tr.sel").forEach(function (x) { x.classList.remove("sel"); }); if (c.tagName === "TR") c.classList.add("sel"); openRelationship(c.getAttribute("data-rel")); } });
    renderPartnerRows();
  }
  function ptFiltered() {
    var d = ptState.data, q = ptState.q.toLowerCase();
    return d.rows.filter(function (r) {
      if (ptState.region && r.region !== ptState.region) return false;
      if (ptState.stage && r.stage !== ptState.stage) return false;
      if (ptState.owner === "-" ? !!r.owner : ptState.owner && r.owner !== ptState.owner) return false;
      if (ptState.stalled && !(r.health && r.health.stalled)) return false;
      if (q && (r.partyName + " " + (r.owner || "") + " " + (r.party && r.party.key || "") + " " + (r.next && r.next.action || "") + " " + r.id).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }
  function renderPartnerRows() {
    var d = ptState.data; if (!d || !$("ptList")) return;
    var rows = ptFiltered(), s = d.summary || {};
    $("ptKpi").innerHTML = statTile(t("进行中", "Open"), fmtNum(s.open || 0), { sub: t("已筛选 ", "shown ") + rows.length }) + statTile(t("停滞", "Stalled"), fmtNum(s.stalled || 0), { warn: !!s.stalled }) + statTile(t("本月到期", "Due this month"), fmtNum(s.dueThisMonth || 0)) + statTile(t("本年新增", "New this year"), fmtNum(s.newThisYear || 0)) + statTile(t("待分配 / 待确认", "Unassigned / to confirm"), fmtNum(s.unassigned || 0) + " / " + fmtNum(s.unconfirmed || 0));
    if (ptState.view === "table") { renderPartnerTable(rows); return; }
    var stages = d.stages;
    $("ptList").innerHTML = '<div class="board">' + stages.map(function (st) {
      var mine = rows.filter(function (r) { return r.stage === st.k; });
      if (st.closed && !ptState.closed) return '<div class="bcol closed" data-stage="' + st.k + '"><div class="bhead"><b>' + esc(t(st.zh, st.en)) + '</b><span class="cnt">' + mine.length + "</span></div></div>";
      return '<div class="bcol" data-stage="' + st.k + '"><div class="bhead"><b>' + esc(t(st.zh, st.en)) + '</b><span class="cnt">' + mine.length + "</span>" + (st.days ? '<small>' + st.days + t(" 天", " d") + "</small>" : "") + "</div>" + mine.map(ptCard).join("") + "</div>";
    }).join("") + "</div>";
    if (d.canEdit) ptEnableDrag();
  }
  function ptCard(r) {
    var h = r.health || {}, due = r.next && r.next.due, overdue = due && due < today();
    return '<div class="bcard' + (h.stalled ? " stalled" : "") + '" data-rel="' + r.id + '" draggable="true" tabindex="0"><div class="bt">' + ptPartyLink(r) + '<span class="tav sm" style="background:' + hue(r.owner || "?") + '" title="' + esc(r.owner || t("待分配", "unassigned")) + '">' + esc(r.owner ? initials(r.owner.split("@")[0]) : "?") + "</span></div>" +
      '<div class="bm">' + (r.region ? '<span class="tag">' + esc(ptRegion(r.region)) + "</span> " : "") + ptHealthTag(r) + (r.projects ? ' <span class="tag accent">' + r.projects + t(" 项目", " proj.") + (r.overdueMilestones ? ' · <b class="bad">' + r.overdueMilestones + t(" 逾期", " late") + "</b>" : "") + "</span>" : "") + "</div>" +
      '<div class="bn' + (overdue ? " bad" : "") + '">' + (r.next && r.next.action ? esc(r.next.action) + (due ? ' <span class="muted">' + esc(due) + "</span>" : "") : '<span class="muted">' + t("没有下一步", "no next step") + "</span>") + "</div>" +
      (r.metrics ? '<div class="bx muted">' + ptMetricsLine(r) + "</div>" : "") + "</div>";
  }
  function ptMetricsLine(r) {
    var m = r.metrics || {};
    if (r.type === "it") return fmtNum(m.accounts) + t(" 账号 · 活跃 ", " accounts · active ") + fmtNum(m.active);
    if (r.type === "course" || r.type === "intl_school") return fmtNum(m.courses) + t(" 门课程 · ", " courses · ") + fmtNum(m.hiveOrders) + t(" 课程订单", " course orders");
    return fmtNum(m.customers) + t(" 客户", " customers");
  }
  function renderPartnerTable(rows) {
    $("ptList").innerHTML = '<div class="tbl-wrap"><table class="data" id="pttable"><thead><tr><th>' + t("一方", "Party") + "</th><th>" + t("地区", "Region") + "</th><th>" + t("阶段", "Stage") + "</th><th>" + t("负责人", "Owner") + "</th><th>" + t("下一步", "Next step") + "</th><th>" + t("到期", "Due") + "</th><th>" + t("协议到期", "Agreement ends") + '</th><th class="num">' + t("项目", "Projects") + "</th><th>" + t("指标", "Metrics") + "</th></tr></thead><tbody>" +
      (rows.length ? rows.map(function (r) {
        var h = r.health || {}, due = r.next && r.next.due;
        return '<tr class="pick" data-rel="' + r.id + '"><td>' + ptPartyLink(r) + '<span class="sub">' + esc(r.id + (r.party && r.party.key ? " · " + r.party.key : "")) + "</span></td><td>" + esc(ptRegion(r.region)) + "</td><td>" + ptStageTag(r) + (h.days != null && !r.closed ? ' <span class="muted">' + h.days + t(" 天", " d") + "</span>" : "") + " " + ptHealthTag(r) + "</td><td>" + ptOwner(r.owner) + "</td><td>" + esc(r.next && r.next.action || "—") + '</td><td class="' + (due && due < today() ? "bad" : "") + '">' + esc(due || "—") + "</td><td>" + esc(r.agreement && r.agreement.endAt || "—") + '</td><td class="num">' + (r.projects || 0) + (r.activeProjects ? ' <span class="muted">(' + r.activeProjects + ")</span>" : "") + '</td><td class="muted">' + (r.metrics ? ptMetricsLine(r) : "—") + "</td></tr>";
      }).join("") : '<tr><td colspan="9" class="empty">' + t("没有关系。点「新建关系」，或等自动填入。", "No relationships. Create one, or wait for auto-seeding.") + "</td></tr>") + "</tbody></table></div>";
  }
  function today() { return new Date().toISOString().slice(0, 10); }
  // Board drag: a card dropped on another column = a stage move, confirmed in the panel.
  function ptEnableDrag() {
    var list = $("ptList"), dragId = "";
    list.querySelectorAll(".bcard").forEach(function (c) { c.addEventListener("dragstart", function (e) { dragId = c.getAttribute("data-rel"); e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", dragId); } catch (err) {} }); });
    list.querySelectorAll(".bcol").forEach(function (col) {
      col.addEventListener("dragover", function (e) { e.preventDefault(); col.classList.add("over"); });
      col.addEventListener("dragleave", function () { col.classList.remove("over"); });
      col.addEventListener("drop", function (e) { e.preventDefault(); col.classList.remove("over"); var id = dragId; dragId = ""; if (!id) return; openRelationship(id, { move: col.getAttribute("data-stage") }); });
    });
  }

  // ---- the relationship panel ----------------------------------------------------
  function openRelationship(id, opts) {
    opts = opts || {};
    api("crm/partner?id=" + encodeURIComponent(id)).then(function (r) {
      if (!r.ok) { flash(esc(errText(r)), 6000); return; }
      ptState.rel = r.body; ptState.tab = opts.tab || ptState.tab || "overview";
      renderRelationshipPanel();
      if (opts.move) ptMoveForm(opts.move);
    });
  }
  function renderRelationshipPanel() {
    var d = ptState.rel, rel = d.relationship, canEdit = d.canEdit;
    panelOpen('<div class="ph"><span class="tav" style="background:' + hue(rel.party ? rel.party.id : rel.id) + '">' + esc(initials(rel.partyName || "?")) + '</span><h3 title="' + esc(rel.partyName) + '">' + esc(rel.partyName) + "</h3>" + ptStageTag(rel) + ptHealthTag(rel) + '<button class="x" type="button" aria-label="close">✕</button></div>' +
      '<div class="pb"><div class="rtop">' + ptTrackSvg(rel, d.stages, canEdit) + ptTimelineSvg(rel, d.projects) + "</div>" +
      '<div class="ptabs" role="tablist">' + [["overview", "概览", "Overview"], ["projects", "项目", "Projects"], ["log", "跟进", "Follow-ups"], ["contacts", "联系人", "Contacts"], ["metrics", "度量", "Metrics"]].map(function (tb) { return '<button type="button" class="pt' + (ptState.tab === tb[0] ? " on" : "") + '" data-ptab="' + tb[0] + '">' + t(tb[1], tb[2]) + (tb[0] === "projects" && d.projects.length ? " · " + d.projects.length : "") + "</button>"; }).join("") + "</div>" +
      '<div id="rpBody"></div></div>');
    $("panel").setAttribute("data-rel", rel.id);
    renderRelTab();
  }
  function ptSvgText(s) { return esc(s); }
  // The stage track: past stages filled, the current one highlighted (amber past the
  // threshold), future ones hollow; the handover point marked; a click moves (editors).
  function ptTrackSvg(rel, stages, canEdit) {
    var n = stages.length, W = 400, left = 24, right = 24, step = (W - left - right) / Math.max(1, n - 1), y = 28;
    var cur = stages.map(function (s) { return s.k; }).indexOf(rel.stage), h = rel.health || {};
    var parts = ['<svg class="track" viewBox="0 0 ' + W + ' 84" role="img" aria-label="' + esc(t("阶段轨道", "Stage track")) + '">'];
    parts.push('<line x1="' + left + '" x2="' + (W - right) + '" y1="' + y + '" y2="' + y + '" class="rail"/>');
    if (cur > 0) parts.push('<line x1="' + left + '" x2="' + (left + step * cur) + '" y1="' + y + '" y2="' + y + '" class="done"/>');
    stages.forEach(function (s, i) {
      var x = left + step * i, state = i < cur ? "past" : i === cur ? (h.stalled && !rel.closed ? "now late" : "now") : "next";
      if (s.handover && i > 0) parts.push('<path class="hand" d="M' + (x - step / 2) + ' ' + (y - 13) + 'l4 4l-4 4l-4 -4z"><title>' + esc(t("负责人交接", "owner handover")) + "</title></path>");
      parts.push('<g class="node ' + state + (canEdit && !rel.closed && i !== cur ? " can" : "") + '" data-stage="' + s.k + '"><circle cx="' + x + '" cy="' + y + '" r="' + (i === cur ? 9 : 6.5) + '"/><text x="' + x + '" y="' + (y + 22) + '" text-anchor="middle">' + ptSvgText(t(s.zh, s.en).slice(0, EN ? 12 : 5)) + "</text>" + (i === cur && !rel.closed ? '<text class="days" x="' + x + '" y="' + (y + 36) + '" text-anchor="middle">' + esc(h.limit ? t("已 ", "day ") + h.days + " / " + h.limit : t("已 ", "day ") + h.days + t(" 天", "")) + "</text>" : "") + "<title>" + esc(t(s.zh, s.en) + (s.days ? " · " + t("阈值 ", "threshold ") + s.days + t(" 天", " days") : "")) + "</title></g>");
    });
    parts.push("</svg>");
    return parts.join("");
  }
  // The milestone timeline: the last 12 and next 6 months to scale, today marked, the
  // agreement term as the first row, then each project with its milestones.
  function ptTimelineSvg(rel, projects) {
    var rows = [];
    if (rel.agreement && (rel.agreement.startAt || rel.agreement.endAt)) rows.push({ name: t("协议期", "Agreement"), start: rel.agreement.startAt || rel.agreement.signedAt || "", end: rel.agreement.endAt || "", ms: [], agreement: true });
    (projects || []).forEach(function (p) { if (p.status === "cancelled") return; rows.push({ name: p.name, start: p.startAt, end: p.endAt, ms: p.milestones || [], id: p.id, status: p.status }); });
    if (!rows.length) return "";
    var now = Date.now(), DAY = 86400000, from = now - 365 * DAY, to = now + 183 * DAY, W = 400, L = 110, R = 16, y0 = 24, rh = 22;
    var X = function (d) { var tm = Date.parse(d); if (isNaN(tm)) return null; return Math.max(L, Math.min(W - R, L + (tm - from) / (to - from) * (W - L - R))); };
    var H = y0 + rows.length * rh + 10, out = ['<svg class="tline" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(t("里程碑时间线", "Milestone timeline")) + '">'];
    var xtoday = X(new Date(now).toISOString());
    for (var mth = new Date(from); mth < to; mth.setMonth(mth.getMonth() + 1)) { var d0 = new Date(mth.getFullYear(), mth.getMonth(), 1); if (d0 < from) continue; var xg = X(d0.toISOString()); if (xg == null) continue; out.push('<line class="grid" x1="' + xg + '" x2="' + xg + '" y1="' + (y0 - 8) + '" y2="' + (H - 6) + '"/>' + (d0.getMonth() % 3 === 0 && Math.abs(xg - xtoday) > 22 ? '<text class="ax" x="' + xg + '" y="' + (y0 - 11) + '" text-anchor="middle">' + (d0.getMonth() === 0 ? d0.getFullYear() : (d0.getMonth() + 1) + t("月", "")) + "</text>" : "")); }
    var xt = X(new Date(now).toISOString());
    out.push('<line class="today" x1="' + xt + '" x2="' + xt + '" y1="' + (y0 - 10) + '" y2="' + (H - 6) + '"/><text class="ax now" x="' + xt + '" y="' + (y0 - 11) + '" text-anchor="middle">' + t("今天", "today") + "</text>");
    rows.forEach(function (r, i) {
      var y = y0 + i * rh + rh / 2, xs = r.start ? X(r.start) : null, xe = r.end ? X(r.end) : null;
      out.push('<text class="lab" x="4" y="' + (y + 4) + '">' + esc(String(r.name).slice(0, EN ? 16 : 9)) + "</text>");
      if (xs != null || xe != null) { var a = xs != null ? xs : L, b = xe != null ? xe : (r.agreement ? W - R : Math.max(a + 6, xt)); out.push('<rect class="bar' + (r.agreement ? " agr" : "") + '" x="' + Math.min(a, b) + '" y="' + (y - 5) + '" width="' + Math.max(6, Math.abs(b - a)) + '" height="10" rx="5"' + (r.id ? ' data-project="' + r.id + '"' : "") + "><title>" + esc(r.name + " " + (r.start || "?") + " → " + (r.end || "?")) + "</title></rect>"); }
      r.ms.forEach(function (m) { if (!m.due && !m.doneAt) return; var x = X(m.doneAt || m.due); if (x == null) return; var st = m.doneAt ? "done" : (m.due < today() ? "late" : "open"); out.push('<path class="ms ' + st + '" d="M' + x + " " + (y - 6) + "l6 6l-6 6l-6 -6z\"" + (r.id ? ' data-project="' + r.id + '"' : "") + "><title>" + esc(m.name + " · " + (m.doneAt ? t("完成 ", "done ") + m.doneAt : t("到期 ", "due ") + m.due)) + "</title></path>"); });
    });
    out.push("</svg>");
    return out.join("");
  }
  $("panel").addEventListener("click", function (e) {
    var tb = e.target.closest("button[data-ptab]"); if (tb && ptState.rel) { ptState.tab = tb.getAttribute("data-ptab"); $("panel").querySelectorAll(".ptabs .pt").forEach(function (x) { x.classList.toggle("on", x === tb); }); renderRelTab(); return; }
    var nd = e.target.closest("g.node.can[data-stage]"); if (nd && ptState.rel) { ptMoveForm(nd.getAttribute("data-stage")); return; }
    var pj = e.target.closest("[data-project]"); if (pj && ptState.rel) { openProjectPanel(pj.getAttribute("data-project")); return; }
  });
  function renderRelTab() {
    var d = ptState.rel, rel = d.relationship, el = $("rpBody"); if (!el) return;
    var tab = ptState.tab;
    if (tab === "overview") el.innerHTML = ptOverviewHtml(d);
    else if (tab === "projects") el.innerHTML = ptProjectsHtml(d);
    else if (tab === "log") el.innerHTML = ptLogHtml(rel.log, d.canEdit, "rel");
    else if (tab === "contacts") el.innerHTML = ptContactsHtml(d);
    else el.innerHTML = ptMetricsHtml(d);
    ptBindTab(el);
  }
  function ptKv(k, v) { return '<span class="k">' + k + "</span><span>" + v + "</span>"; }
  function ptOverviewHtml(d) {
    var rel = d.relationship, ag = rel.agreement || {}, nx = rel.next || {}, canEdit = d.canEdit;
    var terms = Object.keys(rel.terms || {}).map(function (k) { return esc(k) + ": " + esc(Array.isArray(rel.terms[k]) ? rel.terms[k].join(", ") : rel.terms[k]); }).join(" · ");
    return '<div class="kv">' + ptKv(t("编号", "Id"), "<b>" + esc(rel.id) + "</b>" + (rel.party ? ' · <span class="muted">' + esc(rel.party.id) + (rel.party.key ? " · " + esc(rel.party.key) : "") + "</span>" : "")) +
      ptKv(t("地区 · 币种 · 语言", "Region · currency · language"), esc(ptRegion(rel.region)) + " · " + esc(rel.currency) + " · " + (rel.lang === "en" ? "English" : "中文")) +
      ptKv(t("负责人", "Owner"), ptOwner(rel.owner) + (rel.sponsor ? ' · <span class="muted">' + t("发起人 ", "sponsor ") + esc(rel.sponsor) + "</span>" : "")) +
      ptKv(t("阶段", "Stage"), ptStageTag(rel) + ' <span class="muted">' + esc(t("自 ", "since ") + day(rel.stageAt) + (rel.stageBy ? " · " + rel.stageBy.split("@")[0] : "")) + "</span>" + (rel.health && rel.health.stalled ? '<br><span class="bad">' + esc(ptHealthText(rel)) + "</span>" : "")) +
      ptKv(t("下一步", "Next step"), nx.action ? esc(nx.action) + (nx.due ? ' <span class="' + (nx.due < today() ? "bad" : "muted") + '">' + esc(nx.due) + "</span>" : "") + (nx.owner ? ' <span class="muted">' + esc(nx.owner.split("@")[0]) + "</span>" : "") : '<span class="muted">' + t("未填", "none") + "</span>") +
      ptKv(t("协议", "Agreement"), ag.signedAt || ag.endAt ? esc([ag.kind, ag.signedAt ? t("签于 ", "signed ") + ag.signedAt : "", ag.startAt || ag.endAt ? (ag.startAt || "?") + " → " + (ag.endAt || "?") : "", ag.renewal === "auto" ? t("自动续约", "auto-renews") : ""].filter(Boolean).join(" · ")) + (ag.fileRef ? ' · <a href="' + esc(ag.fileRef) + '" target="_blank" rel="noopener">' + t("文件 ↗", "file ↗") + "</a>" : "") : '<span class="muted">' + t("未填", "none") + "</span>") +
      (terms ? ptKv(t("条款", "Terms"), terms) : "") +
      ptKv(t("来源", "Source"), esc(rel.source) + (rel.confirmed === false ? ' <span class="tag">' + t("待确认", "to confirm") + "</span>" : "") + ' · <span class="muted">' + esc(day(rel.createdAt)) + "</span>") +
      (rel.closed ? ptKv(t("已关闭", "Closed"), esc(rel.closed.reason + " · " + day(rel.closed.at) + (rel.closed.note ? " · " + rel.closed.note : ""))) : "") + "</div>" +
      (canEdit ? '<div class="actions">' + (rel.closed ? '<button type="button" class="btn sm secondary" data-act="reopen">' + t("重新打开", "Reopen") + "</button>" : '<button type="button" class="btn sm" data-act="move">' + t("推进阶段…", "Move stage…") + '</button><button type="button" class="btn sm secondary" data-act="edit">' + t("编辑…", "Edit…") + '</button><button type="button" class="btn sm secondary" data-act="close">' + t("关闭关系…", "Close…") + "</button>") + '</div><div id="rpForm"></div>' : "") +
      '<p class="hint">' + t("阶段只由人推进；数字只作为度量显示，不改变阶段。", "Stages move only by hand; numbers are shown as metrics and never set the stage.") + "</p>";
  }
  function ptProjectsHtml(d) {
    var rel = d.relationship, kinds = d.kinds || {};
    var list = d.projects.length ? d.projects.map(function (p) {
      var ms = p.milestones || [], done = ms.filter(function (m) { return m.doneAt; }).length, late = ms.filter(function (m) { return !m.doneAt && m.due && m.due < today(); }).length;
      var nextM = ms.filter(function (m) { return !m.doneAt; })[0];
      return '<button type="button" class="orow link" data-project="' + p.id + '"><div class="omain"><b>' + esc(p.name) + '</b><span class="sub">' + esc([kinds[p.kind] ? t(kinds[p.kind].zh, kinds[p.kind].en) : p.kind, p.startAt || p.endAt ? (p.startAt || "?") + " → " + (p.endAt || "?") : "", nextM ? t("下一里程碑 ", "next ") + nextM.name + (nextM.due ? " " + nextM.due : "") : ""].filter(Boolean).join(" · ")) + '</span></div><div class="oprice">' + ptStatusTag(p.status) + "<br><b>" + done + "/" + ms.length + "</b>" + (late ? ' <span class="bad">' + late + t(" 逾期", " late") + "</span>" : "") + "</div></button>";
    }).join("") : '<div class="orow muted">' + t("没有项目。", "No projects.") + "</div>";
    return '<div class="olist">' + list + "</div>" + (d.canEdit && !rel.closed && Object.keys(kinds).length ? '<div class="actions"><button type="button" class="btn sm" data-act="newproject">' + t("新建项目…", "New project…") + '</button></div><div id="rpForm"></div>' : "");
  }
  function ptStatusTag(s) { var m = { planning: ["规划中", "planning", ""], active: ["进行中", "active", "ok"], on_hold: ["暂停", "on hold", "warn"], completed: ["已完成", "completed", "accent"], cancelled: ["已取消", "cancelled", "muted"] }[s] || [s, s, ""]; return '<span class="tag ' + m[2] + '">' + esc(t(m[0], m[1])) + "</span>"; }
  function ptLogHtml(log, canEdit, scope) {
    var KIND = { created: ["创建", "created"], stage: ["阶段", "stage"], next: ["下一步", "next step"], owner: ["负责人", "owner"], agreement: ["协议", "agreement"], terms: ["条款", "terms"], contacts: ["联系人", "contacts"], note: ["跟进", "note"], closed: ["关闭", "closed"], reopened: ["重开", "reopened"], project: ["项目", "project"], status: ["状态", "status"], milestone: ["里程碑", "milestone"], updated: ["修改", "updated"] };
    var items = (log || []).slice().reverse().map(function (l) {
      var k = KIND[l.kind] || [l.kind, l.kind], detail = l.kind === "stage" ? (l.from ? esc(l.from) + " → " : "") + "<b>" + esc(l.to) + "</b>" + (l.back ? ' <span class="tag warn">' + t("回退", "back") + "</span>" : "") : l.kind === "owner" ? esc((l.from || "—").split("@")[0]) + " → <b>" + esc((l.to || "—").split("@")[0]) + "</b>" : l.kind === "status" ? esc(l.from) + " → <b>" + esc(l.to) + "</b>" : "";
      return '<div class="lrow"><div class="lmeta"><span class="tag' + (l.kind === "note" ? " accent" : "") + '">' + esc(t(k[0], k[1])) + "</span> " + esc(when(l.at)) + (l.by ? " · " + esc(String(l.by).split("@")[0]) : "") + "</div>" + (detail ? '<div class="ldet">' + detail + "</div>" : "") + (l.text ? '<div class="ltxt">' + esc(l.text) + "</div>" : "") + "</div>";
    }).join("");
    return (canEdit ? '<form class="lnew" data-scope="' + scope + '"><input type="text" id="lnText" maxlength="1000" placeholder="' + t("记一条跟进…", "Add a follow-up…") + '" /><select id="lnVia"><option value="call">' + t("电话", "Call") + '</option><option value="meeting">' + t("会面", "Meeting") + '</option><option value="email">' + t("邮件", "Email") + '</option><option value="other" selected>' + t("其它", "Other") + '</option></select><button class="btn sm" type="submit">' + t("记录", "Log") + "</button></form>" : "") + '<div class="llist">' + (items || '<div class="muted">' + t("还没有记录。", "Nothing logged yet.") + "</div>") + "</div>";
  }
  function ptContactsHtml(d) {
    var rel = d.relationship, roles = d.contactRoles || [];
    var list = (rel.contacts || []).length ? rel.contacts.map(function (c, i) { return '<div class="orow"><div class="omain"><button type="button" class="lnk" data-pperson="' + esc(c.person) + '"><b>' + esc(c.name || c.person) + "</b></button>" + (c.primary ? ' <span class="tag accent">' + t("主要", "primary") + "</span>" : "") + '<span class="sub">' + esc(c.role || "") + " · " + esc(c.person) + "</span></div>" + (d.canEdit ? '<button type="button" class="btn sm secondary" data-rmcontact="' + i + '">' + t("移除", "Remove") + "</button>" : "") + "</div>"; }).join("") : '<div class="orow muted">' + t("还没有联系人。协议及以后的阶段至少需要一位对口人。", "No contacts yet. Agreement and later stages need at least one.") + "</div>";
    return '<div class="olist">' + list + "</div>" + (d.canEdit ? '<h4>' + t("添加联系人", "Add a contact") + "</h4>" + ptPickerHtml("rpPick", { roles: roles, org: rel.party && rel.party.kind === "org" ? rel.partyName : "", lang: rel.lang }) : "");
  }
  function ptMetricsHtml(d) {
    var rel = d.relationship, m = rel.metrics;
    var rows = [];
    if (m) { rows.push([t("账号", "Accounts"), fmtNum(m.accounts) + t(" · 90 天内活跃 ", " · active in 90 days ") + fmtNum(m.active)]); rows.push([t("Equip 客户", "Equip customers"), fmtNum(m.customers)]); rows.push([t("课程", "Courses"), fmtNum(m.courses) + t(" 门 · 课程订单 ", " · course orders ") + fmtNum(m.hiveOrders)]); }
    var links = [];
    if (rel.party && rel.party.kind === "org" && rel.party.key && rel.party.key.indexOf("hive:") !== 0) links.push('<a href="#/domain/users" class="lnk">' + t("用户页 ↗", "Users ↗") + "</a>");
    links.push('<a href="#/ops/institutions" class="lnk">' + t("机构 ↗", "Organizations ↗") + "</a>");
    if (rel.type === "publisher" && canSeeRoyalty()) links.push('<a href="#/ops/royalty" class="lnk">' + t("版税 ↗", "Royalties ↗") + "</a>");
    if (rel.type === "course") links.push('<a href="#/ops/orders/hive" class="lnk">' + t("课程订单 ↗", "Course orders ↗") + "</a>");
    return '<div class="kv">' + (rows.length ? rows.map(function (r) { return ptKv(r[0], r[1]); }).join("") : ptKv(t("度量", "Metrics"), '<span class="muted">' + t("这一方还没有可汇总的数字。", "No numbers to aggregate for this party yet.") + "</span>")) + "</div>" + '<div class="actions">' + links.join(" ") + "</div>" + '<p class="hint">' + t("数字来自目录快照和人员库，每次同步后更新；对账单与版税在下一期。", "Numbers come from the directory snapshot and the people hub after each sync; statements and royalties follow in the next phase.") + "</p>";
  }
  // Forms inside the panel (move, edit, close, new project) and their submits.
  function ptBindTab(el) {
    el.querySelectorAll("button[data-act]").forEach(function (b) { b.addEventListener("click", function () { var a = b.getAttribute("data-act"); if (a === "move") ptMoveForm(""); else if (a === "edit") ptEditForm(); else if (a === "close") ptCloseForm(); else if (a === "reopen") ptPost("partner", { op: "reopen", id: ptState.rel.relationship.id }); else if (a === "newproject") ptNewProjectForm(); }); });
    var lf = el.querySelector("form.lnew");
    if (lf) lf.addEventListener("submit", function (e) { e.preventDefault(); var txt = $("lnText").value.trim(); if (!txt) return; ptPost("partner", { op: "note", id: ptState.rel.relationship.id, text: txt, via: $("lnVia").value }); });
    el.querySelectorAll("button[data-rmcontact]").forEach(function (b) { b.addEventListener("click", function () { var rel = ptState.rel.relationship, cs = rel.contacts.slice(); cs.splice(Number(b.getAttribute("data-rmcontact")), 1); ptPost("partner", { op: "update", id: rel.id, fields: { contacts: cs } }); }); });
    el.querySelectorAll("button[data-pperson]").forEach(function (b) { b.addEventListener("click", function () { ptOpenPerson(b.getAttribute("data-pperson")); }); });
    var pk = el.querySelector("#rpPick");
    if (pk) ptBindPicker(pk, function (person, role, primary) { var rel = ptState.rel.relationship; var cs = (rel.contacts || []).filter(function (c) { return c.person !== person.crmId; }).concat([{ person: person.crmId, name: person.name, role: role, primary: primary }]); ptPost("partner", { op: "update", id: rel.id, fields: { contacts: cs } }); });
  }
  function ptOpenPerson(id) {
    if (peopleState.hub) { if (peopleState.hub.people.some(function (p) { return p.crmId === id; })) { openPersonPanel(id); return; } }
    api("crm/people").then(function (r) { if (r.ok) { peopleState.hub = r.body; if (r.body.people.some(function (p) { return p.crmId === id; })) openPersonPanel(id); else flash(esc(t("人员库里没有这条记录。", "Not in the people hub.")), 4000); } });
  }
  function ptPost(action, body, after) {
    var rel = ptState.rel && ptState.rel.relationship;
    return post("crm/" + action, "POST", body).then(function (r) {
      if (!r.ok) { var p = r.body && r.body.problems; flash(esc(errText(r)) + (p ? ": " + esc(p.map(ptProblem).join(", ")) : ""), 8000); return r; }
      flashOk(esc(t("已保存。", "Saved.")), 2500);
      loadPartners(true).then(function () { if ($("ptList")) renderPartnersPage(); });
      if (after) after(r.body); else if (rel) openRelationship(rel.id, { tab: ptState.tab });
      return r;
    });
  }
  function ptProblem(p) { return { reason: t("需要填写原因", "a reason is required"), agreement: t("需要先填协议签署日期", "the agreement's signing date is required"), contact: t("需要至少一位联系人", "at least one contact is required"), project: t("需要一个进行中的项目", "an active project is required"), owner: t("需要指定负责人", "an owner is required") }[p] || p; }
  function ptMoveForm(to) {
    var d = ptState.rel, rel = d.relationship, host = $("rpForm"); if (!host) { ptState.tab = "overview"; renderRelTab(); host = $("rpForm"); }
    var cur = d.stages.map(function (s) { return s.k; }).indexOf(rel.stage);
    var opts = d.stages.filter(function (s, i) { return i !== cur; }).map(function (s, i) { return '<option value="' + s.k + '"' + (s.k === to || (!to && d.stages.indexOf(s) === cur + 1) ? " selected" : "") + ">" + esc(t(s.zh, s.en)) + (d.stages.indexOf(s) < cur ? " ←" : "") + "</option>"; }).join("");
    host.innerHTML = '<form id="mvForm" class="pform"><h4>' + t("推进阶段", "Move stage") + '</h4><label class="f">' + t("到", "To") + '<select id="mvTo">' + opts + '</select></label><div id="mvNeeds"></div><label class="f">' + t("负责人（交接时必填）", "Owner (required at a handover)") + '<input type="text" id="mvOwner" value="' + esc(rel.owner || "") + '" placeholder="name@equipme.cloud" /></label><label class="f">' + t("原因 / 说明（回退、关闭时必填）", "Reason / note (required for a step back or closing)") + '<input type="text" id="mvReason" maxlength="500" /></label><label class="f">' + t("下一步", "Next step") + '<input type="text" id="mvNext" maxlength="300" placeholder="' + t("做什么", "what") + '" /></label><div class="grid2"><label class="f">' + t("到期", "Due") + '<input type="date" id="mvDue" /></label><label class="f">' + t("谁做", "Who") + '<input type="text" id="mvNextOwner" value="' + esc(rel.owner || "") + '" /></label></div><div class="actions"><button class="btn sm" type="submit">' + t("推进", "Move") + '</button><button class="btn sm secondary" type="button" id="mvCancel">' + t("取消", "Cancel") + "</button></div></form>";
    function needs() { var st = d.stages.filter(function (s) { return s.k === $("mvTo").value; })[0] || {}; var ns = []; if (st.needsAgreement) ns.push(t("协议已签署（概览里填签署日期）", "agreement signed (date on the overview)")); if (st.needsContact) ns.push(t("至少一位联系人", "at least one contact")); if (st.needsProject) ns.push(t("至少一个进行中的项目", "an active project")); if (st.handover) ns.push(t("指定新负责人", "a new owner")); if (st.closed) ns.push(t("关闭原因", "a reason")); $("mvNeeds").innerHTML = ns.length ? '<p class="hint">' + t("进入条件：", "Entry criteria: ") + esc(ns.join("；")) + "</p>" : ""; }
    $("mvTo").addEventListener("change", needs); needs();
    $("mvCancel").addEventListener("click", function () { host.innerHTML = ""; });
    $("mvForm").addEventListener("submit", function (e) { e.preventDefault(); ptPost("partner", { op: "move", id: rel.id, to: $("mvTo").value, owner: $("mvOwner").value.trim(), reason: $("mvReason").value.trim(), next: $("mvNext").value.trim() ? { action: $("mvNext").value.trim(), due: $("mvDue").value, owner: $("mvNextOwner").value.trim() } : null }); });
    host.scrollIntoView({ block: "nearest" });
  }
  function ptEditForm() {
    var d = ptState.rel, rel = d.relationship, host = $("rpForm"), ag = rel.agreement || {}, nx = rel.next || {};
    var termKeys = { it: ["domain", "unitPriceYear", "discountSeats", "seatsStudent", "seatsFaculty", "licence"], publisher: ["publisherKey", "royaltyRate", "basis", "territory", "formats", "currency", "paymentTerms"], university: ["accreditation", "agreementKinds", "tuitionDiscount", "referralFee"], intl_school: ["accreditation", "commissionRate", "commissionBasis", "acceptsHiveTranscript", "openCourseShare"], course: ["hiveKey", "revenueShare", "payoutCycle", "subjects"], funder: ["donorType", "designation", "restricted"], developer: ["skills", "subjects", "rateCard", "availability"] }[rel.type] || [];
    host.innerHTML = '<form id="edForm" class="pform"><h4>' + t("编辑", "Edit") + '</h4><div class="grid2"><label class="f">' + t("地区", "Region") + '<select id="edRegion">' + Object.keys(ptState.data && ptState.data.regions || { cn: 1, na: 1, sea: 1, jp: 1, sa: 1, af: 1, other: 1 }).map(function (k) { return '<option value="' + k + '"' + (rel.region === k ? " selected" : "") + ">" + esc(ptRegion(k)) + "</option>"; }).join("") + '</select></label><label class="f">' + t("币种", "Currency") + '<select id="edCur"><option value="CNY"' + (rel.currency === "CNY" ? " selected" : "") + '>CNY</option><option value="USD"' + (rel.currency === "USD" ? " selected" : "") + '>USD</option></select></label><label class="f">' + t("语言", "Language") + '<select id="edLang"><option value="zh"' + (rel.lang === "zh" ? " selected" : "") + '>中文</option><option value="en"' + (rel.lang === "en" ? " selected" : "") + '>English</option></select></label><label class="f">' + t("负责人", "Owner") + '<input type="text" id="edOwner" value="' + esc(rel.owner || "") + '" /></label></div>' +
      '<label class="f">' + t("下一步", "Next step") + '<input type="text" id="edNext" value="' + esc(nx.action || "") + '" maxlength="300" /></label><div class="grid2"><label class="f">' + t("到期", "Due") + '<input type="date" id="edDue" value="' + esc(nx.due || "") + '" /></label><label class="f">' + t("谁做", "Who") + '<input type="text" id="edNextOwner" value="' + esc(nx.owner || rel.owner || "") + '" /></label></div>' +
      "<h4>" + t("协议", "Agreement") + '</h4><div class="grid2"><label class="f">' + t("种类", "Kind") + '<input type="text" id="agKind" value="' + esc(ag.kind || "") + '" /></label><label class="f">' + t("签署日期", "Signed") + '<input type="date" id="agSigned" value="' + esc(ag.signedAt || "") + '" /></label><label class="f">' + t("开始", "Start") + '<input type="date" id="agStart" value="' + esc(ag.startAt || "") + '" /></label><label class="f">' + t("结束", "End") + '<input type="date" id="agEnd" value="' + esc(ag.endAt || "") + '" /></label><label class="f">' + t("续约", "Renewal") + '<select id="agRenew"><option value="manual"' + (ag.renewal !== "auto" && ag.renewal !== "none" ? " selected" : "") + ">" + t("人工", "manual") + '</option><option value="auto"' + (ag.renewal === "auto" ? " selected" : "") + ">" + t("自动", "auto") + '</option><option value="none"' + (ag.renewal === "none" ? " selected" : "") + ">" + t("无", "none") + '</option></select></label><label class="f">' + t("文件链接", "File link") + '<input type="url" id="agFile" value="' + esc(ag.fileRef || "") + '" /></label></div>' +
      (termKeys.length ? "<h4>" + t("条款", "Terms") + '</h4><div class="grid2">' + termKeys.map(function (k) { var v = (rel.terms || {})[k]; return '<label class="f">' + esc(k) + '<input type="text" data-term="' + k + '" value="' + esc(Array.isArray(v) ? v.join(", ") : (v == null ? "" : v)) + '" /></label>'; }).join("") + "</div>" : "") +
      '<div class="actions"><button class="btn sm" type="submit">' + t("保存", "Save") + '</button><button class="btn sm secondary" type="button" id="edCancel">' + t("取消", "Cancel") + "</button></div></form>";
    $("edCancel").addEventListener("click", function () { host.innerHTML = ""; });
    $("edForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var terms = {}; host.querySelectorAll("input[data-term]").forEach(function (i) { var v = i.value.trim(); if (!v) return; var k = i.getAttribute("data-term"); terms[k] = /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : (v.indexOf(",") >= 0 && /^(territory|formats|subjects|skills|accreditation|agreementKinds)$/.test(k) ? v.split(",").map(function (x) { return x.trim(); }).filter(Boolean) : v); });
      ptPost("partner", { op: "update", id: rel.id, fields: { region: $("edRegion").value, currency: $("edCur").value, lang: $("edLang").value, owner: $("edOwner").value.trim(), next: $("edNext").value.trim() ? { action: $("edNext").value.trim(), due: $("edDue").value, owner: $("edNextOwner").value.trim() } : null, agreement: { kind: $("agKind").value.trim(), signedAt: $("agSigned").value, startAt: $("agStart").value, endAt: $("agEnd").value, renewal: $("agRenew").value, fileRef: $("agFile").value.trim() }, terms: terms } });
    });
    host.scrollIntoView({ block: "nearest" });
  }
  function ptCloseForm() {
    var rel = ptState.rel.relationship, host = $("rpForm");
    host.innerHTML = '<form id="clForm" class="pform"><h4>' + t("关闭关系", "Close the relationship") + '</h4><label class="f">' + t("原因", "Reason") + '<select id="clReason"><option value="completed">' + t("完成", "Completed") + '</option><option value="lost">' + t("流失", "Lost") + '</option><option value="paused">' + t("暂停", "Paused") + '</option><option value="merged">' + t("合并到另一条", "Merged into another") + '</option></select></label><label class="f">' + t("说明", "Note") + '<input type="text" id="clNote" maxlength="500" /></label><div class="actions"><button class="btn sm" type="submit">' + t("关闭", "Close") + '</button><button class="btn sm secondary" type="button" id="clCancel">' + t("取消", "Cancel") + "</button></div></form>";
    $("clCancel").addEventListener("click", function () { host.innerHTML = ""; });
    $("clForm").addEventListener("submit", function (e) { e.preventDefault(); ptPost("partner", { op: "close", id: rel.id, reason: $("clReason").value, note: $("clNote").value.trim() }); });
  }
  function ptNewProjectForm() {
    var d = ptState.rel, rel = d.relationship, host = $("rpForm"), kinds = d.kinds || {};
    host.innerHTML = '<form id="npForm" class="pform"><h4>' + t("新建项目", "New project") + '</h4><label class="f">' + t("种类", "Kind") + '<select id="npKind">' + Object.keys(kinds).map(function (k) { return '<option value="' + k + '">' + esc(t(kinds[k].zh, kinds[k].en)) + "</option>"; }).join("") + '</select></label><label class="f">' + t("名称", "Name") + '<input type="text" id="npName" maxlength="200" /></label><div class="grid2"><label class="f">' + t("开始", "Start") + '<input type="date" id="npStart" /></label><label class="f">' + t("结束", "End") + '<input type="date" id="npEnd" /></label></div><label class="f">' + t("负责人", "Owner") + '<input type="text" id="npOwner" value="' + esc(rel.owner || "") + '" /></label><p class="hint" id="npMs"></p><div class="actions"><button class="btn sm" type="submit">' + t("创建", "Create") + '</button><button class="btn sm secondary" type="button" id="npCancel">' + t("取消", "Cancel") + "</button></div></form>";
    function showMs() { var k = kinds[$("npKind").value]; $("npMs").textContent = k ? t("里程碑模板：", "Milestone template: ") + k.ms.map(function (m) { return t(m.zh, m.en); }).join(" → ") : ""; if (!$("npName").value) $("npName").placeholder = k ? t(k.zh, k.en) : ""; }
    $("npKind").addEventListener("change", showMs); showMs();
    $("npCancel").addEventListener("click", function () { host.innerHTML = ""; });
    $("npForm").addEventListener("submit", function (e) { e.preventDefault(); ptPost("project", { op: "create", relationship: rel.id, kind: $("npKind").value, name: $("npName").value.trim(), startAt: $("npStart").value, endAt: $("npEnd").value, owner: $("npOwner").value.trim() }, function (b) { openRelationship(rel.id, { tab: "projects" }); if (b && b.project) openProjectPanel(b.project.id, b.project); }); });
  }

  // ---- the project panel (second panel) -------------------------------------------
  function openProjectPanel(id, given) {
    var d = ptState.rel; if (!d) return;
    var p = given || d.projects.filter(function (x) { return x.id === id; })[0]; if (!p) return;
    var kinds = d.kinds || {}, canEdit = d.canEdit, rel = d.relationship;
    var ms = (p.milestones || []).map(function (m) {
      var late = !m.doneAt && m.due && m.due < today();
      return '<div class="mrow2' + (m.doneAt ? " done" : late ? " late" : "") + '">' + (canEdit ? '<input type="checkbox" data-ms="' + m.id + '"' + (m.doneAt ? " checked" : "") + ' title="' + t("完成", "done") + '" />' : '<span class="mk">' + (m.doneAt ? "✓" : "○") + "</span>") + '<div class="mmain"><b>' + esc(m.name) + "</b>" + (m.kind === "gate" ? ' <span class="tag">' + t("门", "gate") + "</span>" : "") + '<span class="sub">' + esc(m.doneAt ? t("完成 ", "done ") + m.doneAt : m.due ? t("到期 ", "due ") + m.due : t("未定日期", "no date")) + (m.owner ? " · " + esc(m.owner.split("@")[0]) : "") + "</span></div>" + (canEdit ? '<input type="date" data-msdue="' + m.id + '" value="' + esc(m.due || "") + '" /><button type="button" class="btn sm secondary" data-msrm="' + m.id + '" title="' + t("删除", "remove") + '">×</button>' : "") + "</div>";
    }).join("");
    var parts = (p.participants || []).map(function (c, i) { return '<div class="orow"><div class="omain"><button type="button" class="lnk" data-pperson="' + esc(c.person) + '"><b>' + esc(c.name || c.person) + '</b></button><span class="sub">' + esc(c.role || "") + "</span></div>" + (canEdit ? '<button type="button" class="btn sm secondary" data-rmpart="' + i + '">' + t("移除", "Remove") + "</button>" : "") + "</div>"; }).join("");
    panelOpen('<div class="ph"><h3 title="' + esc(p.name) + '">' + esc(p.name) + "</h3>" + ptStatusTag(p.status) + '<button class="x" type="button" aria-label="close">✕</button></div><div class="pb">' +
      '<div class="kv">' + ptKv(t("编号", "Id"), "<b>" + esc(p.id) + "</b> · " + esc(kinds[p.kind] ? t(kinds[p.kind].zh, kinds[p.kind].en) : p.kind)) + ptKv(t("起止", "Span"), esc((p.startAt || "?") + " → " + (p.endAt || "?"))) + ptKv(t("负责人", "Owner"), ptOwner(p.owner)) + ptKv(t("所属关系", "Relationship"), esc(rel.partyName) + ' <span class="muted">' + esc(rel.id) + "</span>") + "</div>" +
      (canEdit ? '<div class="actions"><select id="pjStatus">' + ["planning", "active", "on_hold", "completed", "cancelled"].map(function (s) { return '<option value="' + s + '"' + (p.status === s ? " selected" : "") + ">" + esc({ planning: t("规划中", "planning"), active: t("进行中", "active"), on_hold: t("暂停", "on hold"), completed: t("已完成", "completed"), cancelled: t("已取消", "cancelled") }[s]) + "</option>"; }).join("") + '</select><button type="button" class="btn sm secondary" id="pjEdit">' + t("改名称 / 日期…", "Edit name / dates…") + '</button></div><div id="pjForm"></div>' : "") +
      "<h4>" + t("里程碑", "Milestones") + " · " + (p.milestones || []).filter(function (m) { return m.doneAt; }).length + "/" + (p.milestones || []).length + '</h4><div class="mlist">' + (ms || '<div class="muted">' + t("没有里程碑。", "No milestones.") + "</div>") + "</div>" +
      (canEdit ? '<form id="msAdd" class="lnew"><input type="text" id="msName" maxlength="120" placeholder="' + t("新里程碑…", "New milestone…") + '" /><input type="date" id="msDue" /><button class="btn sm" type="submit">' + t("添加", "Add") + "</button></form>" : "") +
      "<h4>" + t("参与者", "Participants") + " · " + (p.participants || []).length + '</h4><div class="olist">' + (parts || '<div class="orow muted">' + t("还没有参与者。", "No participants yet.") + "</div>") + "</div>" + (canEdit ? ptPickerHtml("pjPick", { roles: ["申请人", "学员", "授课教师", "负责人", "作者", "审稿人", "编辑", "捐赠人"], org: rel.partyName, lang: rel.lang }) : "") +
      "<h4>" + t("记录", "Log") + "</h4>" + ptLogHtml(p.log, canEdit, "project") + "</div>", "second");
    var p2 = $("panel2");
    p2.onclick = function (e) {
      var cb = e.target.closest("input[data-ms]"); if (cb) { ptPost("project", { op: "milestone", id: p.id, mid: cb.getAttribute("data-ms"), done: cb.checked }, function () { ptReloadProject(p.id); }); return; }
      var rm = e.target.closest("button[data-msrm]"); if (rm) { ptPost("project", { op: "removeMilestone", id: p.id, mid: rm.getAttribute("data-msrm") }, function () { ptReloadProject(p.id); }); return; }
      var rp = e.target.closest("button[data-rmpart]"); if (rp) { var ps = p.participants.slice(); ps.splice(Number(rp.getAttribute("data-rmpart")), 1); ptPost("project", { op: "update", id: p.id, fields: { participants: ps } }, function () { ptReloadProject(p.id); }); return; }
      var pe = e.target.closest("#pjEdit"); if (pe) { ptProjectEditForm(p); return; }
      var pp = e.target.closest("button[data-pperson]"); if (pp) { ptOpenPerson(pp.getAttribute("data-pperson")); }
    };
    p2.querySelectorAll("input[data-msdue]").forEach(function (i) { i.addEventListener("change", function () { ptPost("project", { op: "milestone", id: p.id, mid: i.getAttribute("data-msdue"), due: i.value }, function () { ptReloadProject(p.id); }); }); });
    var st = $("pjStatus"); if (st) st.addEventListener("change", function () { ptPost("project", { op: "status", id: p.id, status: st.value }, function () { ptReloadProject(p.id); }); });
    var ma = $("msAdd"); if (ma) ma.addEventListener("submit", function (e) { e.preventDefault(); if (!$("msName").value.trim()) return; ptPost("project", { op: "addMilestone", id: p.id, name: $("msName").value.trim(), due: $("msDue").value }, function () { ptReloadProject(p.id); }); });
    var lf = p2.querySelector("form.lnew[data-scope=project]"); if (lf) lf.addEventListener("submit", function (e) { e.preventDefault(); var txt = lf.querySelector("#lnText").value.trim(); if (!txt) return; ptPost("project", { op: "note", id: p.id, text: txt }, function () { ptReloadProject(p.id); }); });
    var pk = $("pjPick"); if (pk) ptBindPicker(pk, function (person, role) { var ps = (p.participants || []).filter(function (c) { return c.person !== person.crmId; }).concat([{ person: person.crmId, name: person.name, role: role }]); ptPost("project", { op: "update", id: p.id, fields: { participants: ps } }, function () { ptReloadProject(p.id); }); });
  }
  function ptReloadProject(id) { var rel = ptState.rel.relationship; api("crm/partner?id=" + encodeURIComponent(rel.id)).then(function (r) { if (!r.ok) return; ptState.rel = r.body; renderRelationshipPanel(); openProjectPanel(id); }); }
  function ptProjectEditForm(p) {
    var host = $("pjForm");
    host.innerHTML = '<form id="pjEf" class="pform"><label class="f">' + t("名称", "Name") + '<input type="text" id="pjName" value="' + esc(p.name) + '" maxlength="200" /></label><div class="grid2"><label class="f">' + t("开始", "Start") + '<input type="date" id="pjStart" value="' + esc(p.startAt || "") + '" /></label><label class="f">' + t("结束", "End") + '<input type="date" id="pjEnd" value="' + esc(p.endAt || "") + '" /></label></div><label class="f">' + t("负责人", "Owner") + '<input type="text" id="pjOwner" value="' + esc(p.owner || "") + '" /></label><div class="actions"><button class="btn sm" type="submit">' + t("保存", "Save") + "</button></div></form>";
    $("pjEf").addEventListener("submit", function (e) { e.preventDefault(); ptPost("project", { op: "update", id: p.id, fields: { name: $("pjName").value.trim(), startAt: $("pjStart").value, endAt: $("pjEnd").value, owner: $("pjOwner").value.trim() } }, function () { ptReloadProject(p.id); }); });
  }

  // ---- the people picker (design v2 §11): search the hub by name / email / Teams
  // account / CRM ID; nothing found → a new person inline (name + email → the hub).
  function ptPickerHtml(id, opts) {
    opts = opts || {};
    var roles = (opts.roles || []).map(function (r) { return '<option value="' + esc(r) + '">' + esc(r) + "</option>"; }).join("") + '<option value="">' + t("其它（自填）", "Other (type)") + "</option>";
    return '<div class="picker" id="' + id + '"><div class="search">' + ICON.search + '<input type="search" class="pq" placeholder="' + t("搜索姓名、邮箱、Teams 账号、CRM ID…", "Search name, email, Teams account, CRM ID…") + '" autocomplete="off" /></div><div class="pres" hidden></div>' +
      '<div class="pchosen" hidden><span class="who"></span><select class="prole">' + roles + '</select><input type="text" class="prole2" placeholder="' + t("角色", "role") + '" hidden /><label class="inline"><input type="checkbox" class="pprim" /> ' + t("主要", "primary") + '</label><button type="button" class="btn sm padd">' + t("添加", "Add") + "</button></div>" +
      '<form class="pnew" hidden><div class="grid2"><label class="f">' + t("姓名", "Name") + '<input type="text" class="nname" maxlength="120" required /></label><label class="f">' + t("邮箱", "Email") + '<input type="email" class="nemail" required /></label><label class="f">' + t("所属机构", "Organization") + '<input type="text" class="norg" value="' + esc(opts.org || "") + '" maxlength="200" /></label><label class="f">' + t("语言", "Language") + '<select class="nlang"><option value="zh"' + (opts.lang !== "en" ? " selected" : "") + '>中文</option><option value="en"' + (opts.lang === "en" ? " selected" : "") + '>English</option></select></label></div><div class="actions"><button class="btn sm" type="submit">' + t("新建人员并选中", "Create and select") + '</button><button class="btn sm secondary pncancel" type="button">' + t("取消", "Cancel") + "</button></div></form></div>";
  }
  function ptBindPicker(root, onAdd) {
    var q = root.querySelector(".pq"), res = root.querySelector(".pres"), chosen = root.querySelector(".pchosen"), form = root.querySelector(".pnew"), sel = null;
    var roleSel = root.querySelector(".prole"), role2 = root.querySelector(".prole2");
    roleSel.addEventListener("change", function () { role2.hidden = roleSel.value !== ""; });
    q.addEventListener("input", debounce(function () {
      var s = q.value.trim(); if (s.length < 2) { res.hidden = true; return; }
      api("crm/people-search?q=" + encodeURIComponent(s)).then(function (r) {
        if (!r.ok || q.value.trim() !== s) return;
        var ps = r.body.people || [];
        res.innerHTML = ps.map(function (p) { return '<button type="button" class="pr" data-id="' + esc(p.crmId) + '"><b>' + esc(p.name) + '</b><span class="sub">' + esc([p.email, p.upn && p.upn !== p.email ? p.upn : "", p.identity, p.org, p.crmId].filter(Boolean).join(" · ")) + "</span></button>"; }).join("") + '<button type="button" class="pr new">+ ' + t("新建人员", "New person") + " “" + esc(s) + "”</button>";
        res.hidden = false; res._people = ps;
      });
    }, 180));
    res.addEventListener("click", function (e) {
      var b = e.target.closest(".pr"); if (!b) return;
      if (b.classList.contains("new")) { res.hidden = true; form.hidden = false; var s = q.value.trim(); if (s.indexOf("@") > 0) form.querySelector(".nemail").value = s; else form.querySelector(".nname").value = s; form.querySelector(".nname").focus(); return; }
      sel = (res._people || []).filter(function (p) { return p.crmId === b.getAttribute("data-id"); })[0]; if (!sel) return;
      res.hidden = true; chosen.hidden = false; chosen.querySelector(".who").innerHTML = "<b>" + esc(sel.name) + "</b> <span class='muted'>" + esc(sel.crmId) + "</span>";
    });
    chosen.querySelector(".padd").addEventListener("click", function () { if (!sel) return; var role = roleSel.value || role2.value.trim(); onAdd(sel, role, root.querySelector(".pprim").checked); sel = null; chosen.hidden = true; q.value = ""; });
    form.querySelector(".pncancel").addEventListener("click", function () { form.hidden = true; });
    form.addEventListener("submit", function (e) {
      e.preventDefault(); var b = form.querySelector("button[type=submit]"); savingButton(b, t("创建中…", "Creating…"));
      post("crm/contact", "POST", { name: form.querySelector(".nname").value.trim(), email: form.querySelector(".nemail").value.trim(), org: form.querySelector(".norg").value.trim(), lang: form.querySelector(".nlang").value }).then(function (r) {
        restoreButton(b);
        if (!r.ok) { flash(esc(errText(r)), 6000); return; }
        sel = { crmId: r.body.person.crmId, name: r.body.person.name }; form.hidden = true; chosen.hidden = false; chosen.querySelector(".who").innerHTML = "<b>" + esc(sel.name) + "</b> <span class='muted'>" + esc(sel.crmId) + (r.body.person.existing ? " · " + t("已有记录", "existing") : " · " + t("已新建", "created")) + "</span>";
      });
    });
  }

  // ---- new relationship ------------------------------------------------------------
  function openNewRelationship() {
    var d = ptState.data, type = d.type;
    panelOpen('<div class="ph"><h3>' + esc(t("新建关系 · ", "New relationship · ") + ptTypeLabel(type)) + '</h3><button class="x" type="button" aria-label="close">✕</button></div><div class="pb">' +
      '<h4>' + t("一方", "Party") + '</h4><div class="seg"><button type="button" class="chip" data-pk="org" aria-pressed="true">' + t("机构", "Organization") + '</button><button type="button" class="chip" data-pk="person" aria-pressed="false">' + t("个人", "Person") + "</button></div>" +
      '<div id="nrOrg"><div class="picker"><div class="search">' + ICON.search + '<input type="search" id="nrOq" placeholder="' + t("搜索机构、域名…", "Search organization, domain…") + '" autocomplete="off" /></div><div class="pres" id="nrOres" hidden></div></div><div class="pchosen" id="nrOch" hidden><span class="who"></span></div><p class="hint">' + t("搜不到就直接输入新机构名称：", "Not found? Type a new organization's name:") + '</p><input type="text" id="nrOname" placeholder="' + t("新机构名称", "New organization name") + '" maxlength="200" /></div>' +
      '<div id="nrPerson" hidden>' + ptPickerHtml("nrPick", { roles: [], lang: "zh" }) + "</div>" +
      '<form id="nrForm"><h4>' + t("关系", "Relationship") + '</h4><div class="grid2"><label class="f">' + t("地区", "Region") + '<select id="nrRegion">' + Object.keys(d.regions || {}).map(function (k) { return '<option value="' + k + '">' + esc(ptRegion(k)) + "</option>"; }).join("") + '</select></label><label class="f">' + t("起始阶段", "Starting stage") + '<select id="nrStage">' + d.stages.filter(function (s) { return !s.closed; }).map(function (s) { return '<option value="' + s.k + '">' + esc(t(s.zh, s.en)) + "</option>"; }).join("") + '</select></label><label class="f">' + t("负责人", "Owner") + '<input type="text" id="nrOwner" value="' + esc((me && me.profile && me.profile.upn) || "") + '" /></label></div>' +
      '<label class="f">' + t("第一个下一步", "First next step") + '<input type="text" id="nrNext" maxlength="300" /></label><div class="grid2"><label class="f">' + t("到期", "Due") + '<input type="date" id="nrDue" /></label></div><label class="f">' + t("备注", "Note") + '<input type="text" id="nrNote" maxlength="500" /></label>' +
      '<div class="actions"><button class="btn" type="submit" id="nrSave">' + t("创建", "Create") + '</button></div><div id="nrMsg"></div></form></div>');
    var kind = "org", org = null, person = null;
    $("panel").querySelectorAll("[data-pk]").forEach(function (b) { b.addEventListener("click", function () { kind = b.getAttribute("data-pk"); $("panel").querySelectorAll("[data-pk]").forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); }); $("nrOrg").hidden = kind !== "org"; $("nrPerson").hidden = kind !== "person"; }); });
    $("nrOq").addEventListener("input", debounce(function () {
      var s = $("nrOq").value.trim(); if (!s) { $("nrOres").hidden = true; return; }
      api("crm/org-search?q=" + encodeURIComponent(s)).then(function (r) { if (!r.ok) return; var os = r.body.orgs || []; $("nrOres").innerHTML = os.map(function (o) { return '<button type="button" class="pr" data-key="' + esc(o.key) + '"><b>' + esc(o.name) + '</b><span class="sub">' + esc([o.domain, o.type, o.country, o.orgId].filter(Boolean).join(" · ")) + "</span></button>"; }).join("") || '<div class="muted" style="padding:6px 10px">' + t("没有匹配的机构。", "No matching organization.") + "</div>"; $("nrOres").hidden = false; $("nrOres")._orgs = os; });
    }, 180));
    $("nrOres").addEventListener("click", function (e) { var b = e.target.closest(".pr[data-key]"); if (!b) return; org = ($("nrOres")._orgs || []).filter(function (o) { return o.key === b.getAttribute("data-key"); })[0]; $("nrOres").hidden = true; $("nrOch").hidden = false; $("nrOch").querySelector(".who").innerHTML = "<b>" + esc(org.name) + "</b> <span class='muted'>" + esc(org.key) + "</span>"; if (org.region && $("nrRegion").querySelector('option[value="' + org.region + '"]')) $("nrRegion").value = org.region; $("nrOname").value = ""; });
    ptBindPicker($("nrPick"), function (p) { person = p; $("nrPick").querySelector(".pq").value = p.name; flashOk(esc(t("已选 ", "Selected ") + p.name), 2000); });
    $("nrForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var party = null;
      if (kind === "org") { if (org) party = { key: org.key, name: org.name }; else if ($("nrOname").value.trim()) party = { key: "new:" + $("nrOname").value.trim().toLowerCase().replace(/[^a-z0-9一-鿿]+/g, "-").slice(0, 60), name: $("nrOname").value.trim() }; }
      else if (person) party = { id: person.crmId, name: person.name };
      if (!party) { $("nrMsg").innerHTML = '<div class="msg err">' + t("先选一方。", "Pick the party first.") + "</div>"; return; }
      var b = $("nrSave"); savingButton(b);
      post("crm/partner", "POST", { op: "create", type: type, party: party, region: $("nrRegion").value, stage: $("nrStage").value, owner: $("nrOwner").value.trim(), next: $("nrNext").value.trim() ? { action: $("nrNext").value.trim(), due: $("nrDue").value, owner: $("nrOwner").value.trim() } : null, note: $("nrNote").value.trim() }).then(function (r) {
        restoreButton(b);
        if (!r.ok) { $("nrMsg").innerHTML = '<div class="msg err">' + esc(errText(r)) + "</div>"; return; }
        flashOk(esc(t("已创建 ", "Created ") + r.body.relationship.id), 3000);
        loadPartners(true).then(function () { renderPartnersPage(); openRelationship(r.body.relationship.id); });
      });
    });
  }
