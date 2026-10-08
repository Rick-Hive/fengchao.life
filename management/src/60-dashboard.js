// management/src/60-dashboard.js — 经营 › 仪表盘: the staff home page.
// Part of management.js: scripts/build-management.js concatenates management/src/*.js in name order
// into management/management.js (one closure; every part sees every other's functions). Edit here, not the built file.

  // ================================================================================
  // 经营 › 仪表盘 — the staff home page (design §5): KPIs for the period with a
  // comparison, eight panels each answering one question, every number a way into
  // the list behind it. Nothing about tenant accounts here (that stays in 用户);
  // money only for roles that may see it, units otherwise. Period: 本月 / 本季 /
  // 本学年 (August start, decision 7); the comparison is the period before, or the
  // same period of the previous school year.
  // ================================================================================
  var dashState = { period: "month", trend: "cum", from: "", to: "" };
  function isStaff() { return (me && me.roles || []).some(function (r) { return /^staff:/.test(r) && r !== "staff:contractor"; }); }
  function curMonth() { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); }
  // The months of a period and of its comparison, newest period first.
  function periodMonths(kind) {
    var m = curMonth(), months = [], prev = [];
    if (kind === "custom") {
      var a = dashState.from && dashState.from <= m ? dashState.from : addMonths(m, -2), b = dashState.to && dashState.to <= m ? dashState.to : m; if (a > b) { var tmp = a; a = b; b = tmp; }
      for (var mm = a; mm <= b; mm = addMonths(mm, 1)) months.push(mm);
      prev = months.map(function (x) { return addMonths(x, -months.length); });
      return { months: months, prev: prev, label: a === b ? a : a + " – " + b, vs: t("较前 " + months.length + " 个月", "vs the " + months.length + " months before") };
    }
    if (kind === "month") { months = [m]; prev = [addMonths(m, -1)]; }
    else if (kind === "quarter") { var q = Math.floor((+m.split("-")[1] - 1) / 3) * 3 + 1, start = m.split("-")[0] + "-" + String(q).padStart(2, "0"); for (var i = 0; i < 3; i++) { var mm = addMonths(start, i); if (mm <= m) months.push(mm); } prev = months.map(function (x) { return addMonths(x, -3); }); }
    else { var fy = fyOf(m); for (var k = 0; k < 12; k++) { var x = addMonths(fy + "-08", k); if (x <= m) months.push(x); } prev = months.map(function (x) { return addMonths(x, -12); }); }
    return { months: months, prev: prev, label: kind === "month" ? t("本月", "This month") : kind === "quarter" ? t("本季", "This quarter") : fyLabel(fyOf(m)), vs: kind === "month" ? t("较上月", "vs last month") : kind === "quarter" ? t("较上季", "vs last quarter") : t("较上学年同期", "vs the same period last year") };
  }
  function viewDashboard() {
    setTitle(t("经营", "Operations"), t("仪表盘", "Dashboard"),
      '<span id="dRange" class="range' + (dashState.period === "custom" ? "" : " hidden") + '"><select id="dFrom" class="sm"></select> – <select id="dTo" class="sm"></select></span> <div class="seg" role="tablist">' + [["month", "本月", "Month"], ["quarter", "本季", "Quarter"], ["year", "本学年", "School year"], ["custom", "自定义", "Custom"]].map(function (p) { return '<button type="button" data-p="' + p[0] + '" aria-pressed="' + (dashState.period === p[0]) + '">' + t(p[1], p[2]) + "</button>"; }).join("") + '</div> <button class="btn secondary sm" id="dExport">' + t("导出月报", "Export report") + '</button> <button class="btn secondary sm" id="dCsv">' + t("导出数据", "Export data") + '</button> <button class="btn secondary sm" id="dReload">' + t("刷新", "Refresh") + "</button>",
      { info: t("员工首页：本期与上期的对比、八个面板各回答一个经营问题，每个数字都能点进名单。学年从 8 月起算；销售按下单日、实收按订单；蜂巢课程成交额只在这里显示，不与教材销售合计。", "The staff home: this period against the last, eight panels each answering one question, every number a way into the list. The school year starts in August; sales by order date, received by order; Hive course value is shown here only and never summed with textbook sales.") });
    $("content").innerHTML = '<div class="kpis" id="dkpi"></div><div class="vgrid" id="dgrid"><p class="loading">' + t("载入中…", "Loading…") + '</p></div><p class="muted" id="dfoot" style="font-size:.8rem"></p>';
    $("topActions").addEventListener("click", function (e) {
      var b = e.target.closest(".seg button[data-p]"); if (!b) return;
      dashState.period = b.getAttribute("data-p");
      $("topActions").querySelectorAll(".seg button").forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
      $("dRange").classList.toggle("hidden", dashState.period !== "custom");
      renderDashboard();
    });
    // 自定义: any two months, newest first in the lists
    var c0 = curMonth(), opts = []; for (var i = 0; i < 36; i++) opts.push(addMonths(c0, -i));
    ["dFrom", "dTo"].forEach(function (id) { $(id).innerHTML = opts.map(function (mm) { return '<option value="' + mm + '">' + mm + "</option>"; }).join(""); });
    $("dFrom").value = dashState.from || addMonths(c0, -2); $("dTo").value = dashState.to || c0;
    $("dFrom").addEventListener("change", function () { dashState.from = this.value; renderDashboard(); });
    $("dTo").addEventListener("change", function () { dashState.to = this.value; renderDashboard(); });
    // 导出月报: the page as it stands, through the browser's print dialog (save as PDF);
    // 导出数据: every panel's table in one CSV, so two people never report two numbers.
    $("dExport").addEventListener("click", function () { document.body.classList.add("printing"); setTimeout(function () { window.print(); document.body.classList.remove("printing"); }, 50); });
    $("dCsv").addEventListener("click", exportDashboardCsv);
    $("dReload").addEventListener("click", function () { equipState.list = null; ordersState.list = null; peopleState.hub = null; loadDashboard().then(renderDashboard); });
    loadDashboard().then(renderDashboard);
  }
  function loadDashboard() {
    var q = function (pr) { return pr.catch(function () { return null; }); };
    return Promise.all([q(loadEquip(false)), canSeeOrders() ? q(loadOrders(false)) : Promise.resolve(null), canSeeOrders() ? q(loadPeople(false)) : Promise.resolve(null)]);
  }
  function renderDashboard() {
    if (!$("dgrid")) return;
    var seeMoney = crmLevel("money") !== "none", fmt = seeMoney ? fmtMoney : fmtNum, measure = seeMoney ? t("销售额", "Sales") : t("件数", "Units");
    var P = periodMonths(dashState.period), inP = function (m) { return P.months.indexOf(m) >= 0; }, inPrev = function (m) { return P.prev.indexOf(m) >= 0; };
    var equip = equipState.list || [], orders = ordersState.list || [], hub = peopleState.hub || null, people = (hub && hub.people) || [];
    var val = function (o) { return seeMoney ? (o.amount || 0) : (o.qty || 0); };
    var sum = function (arr, f) { return arr.reduce(function (a, o) { return a + f(o); }, 0); };
    var eNow = equip.filter(function (o) { return inP(ym(o.date)); }), ePrev = equip.filter(function (o) { return inPrev(ym(o.date)); });
    var pct = function (a, b) { return b ? (a - b) / b : null; };
    var custKey = function (o) { return o.customerRec || o.email || o.name; };
    var firstM = {}; equip.forEach(function (o) { var k = custKey(o), m = ym(o.date); if (k && m && (!firstM[k] || m < firstM[k])) firstM[k] = m; });
    var buyers = {}; eNow.forEach(function (o) { var k = custKey(o); if (k) buyers[k] = firstM[k] >= P.months[0] ? "new" : "old"; });
    var nNew = Object.keys(buyers).filter(function (k) { return buyers[k] === "new"; }).length, nOld = Object.keys(buyers).length - nNew;
    var hNow = orders.filter(function (o) { return inP(String(o.submittedAt || "").slice(0, 7)) && o.status !== "cancelled"; }), hPrev = orders.filter(function (o) { return inPrev(String(o.submittedAt || "").slice(0, 7)) && o.status !== "cancelled"; });
    var hSum = function (arr) { return sum(arr, function (o) { return typeof o.totalPrice === "number" ? o.totalPrice : 0; }); };
    var counts = ordersState.counts || {}, stats = (hub && hub.stats) || {};
    var todo = (counts.overdue || 0) + (counts.notifyFailed || 0) + (hub && hub.canMerge ? (hub.queue || []).length : 0);
    var months12 = []; for (var i = 11; i >= 0; i--) months12.push(addMonths(curMonth(), -i));
    var byM = function (arr, f, keyOf) { var o = {}; months12.forEach(function (m) { o[m] = 0; }); arr.forEach(function (x) { var m = keyOf(x); if (m in o) o[m] += f(x); }); return months12.map(function (m) { return o[m]; }); };

    $("dkpi").innerHTML =
      statTile(P.label + " · " + (seeMoney ? t("教材销售额", "Textbook sales") : t("教材件数", "Textbook units")), fmt(sum(eNow, val)), { delta: pct(sum(eNow, val), sum(ePrev, val)), vs: P.vs, spark: byM(equip, val, function (o) { return ym(o.date); }), attr: ' data-go="#/ops/orders/equip"', cls: "go" }) +
      (seeMoney ? statTile(P.label + " · " + t("教材实收", "Textbook received"), fmtMoney(sum(eNow, function (o) { return o.received || 0; })), { sub: sum(eNow, val) ? Math.round(sum(eNow, function (o) { return o.received || 0; }) / sum(eNow, val) * 100) + "%" + t(" 已收", " received") : "" }) : "") +
      statTile(P.label + " · " + t("教材订单", "Textbook orders"), fmtNum(eNow.length), { delta: pct(eNow.length, ePrev.length), vs: P.vs, sub: t("购买客户 ", "buyers ") + (nNew + nOld) + t("（新 ", " (new ") + nNew + ")" }) +
      (canSeeOrders() ? statTile(P.label + " · " + t("课程订单", "Course orders"), fmtNum(hNow.length) + (seeMoney ? ' <span class="unit">' + fmtMoney(hSum(hNow)) + "</span>" : ""), { delta: pct(hNow.length, hPrev.length), vs: P.vs, sub: t("蜂巢网站 · 不与教材合计", "fengchao.life · never summed with textbooks"), attr: ' data-go="#/ops/orders/hive"', cls: "go" }) : "") +
      (hub ? statTile(t("人员库", "People"), fmtNum(stats.people || 0), { sub: t("活跃 ", "active ") + ((stats.stages || {}).active || 0) + t(" · 潜在 ", " · leads ") + ((stats.stages || {}).lead || 0) + t(" · 家庭 ", " · families ") + (stats.families || 0), attr: ' data-go="#/ops/people"', cls: "go" }) : "") +
      (canSeeOrders() ? statTile(t("待处理", "To do"), fmtNum(todo), { cls: "go", warn: todo > 0, sub: t("超期 ", "overdue ") + (counts.overdue || 0) + t(" · 通知失败 ", " · notify failed ") + (counts.notifyFailed || 0) + (hub && hub.canMerge ? t(" · 待合并 ", " · to merge ") + (hub.queue || []).length : ""), attr: ' data-go="#/ops/orders/hive"' }) : "");

    // ---- panels ----
    vizDraws = [];
    var cards = [];
    // 1 销售与收款趋势: cumulative this period vs the one before (or monthly columns)
    var cumOf = function (ms) { var acc = 0; return ms.map(function (m) { if (m > curMonth()) return null; equip.forEach(function (o) { if (ym(o.date) === m) acc += val(o); }); return acc; }); };
    var trendMonths = dashState.period === "month" ? months12 : P.months.length ? P.months.slice() : [];
    if (dashState.period === "year") { trendMonths = []; for (var k = 0; k < 12; k++) trendMonths.push(addMonths(fyOf(curMonth()) + "-08", k)); }
    var prevMonths = trendMonths.map(function (m) { return addMonths(m, dashState.period === "month" ? -12 : dashState.period === "quarter" ? -3 : dashState.period === "custom" ? -trendMonths.length : -12); });
    var labelsT = trendMonths.map(monthLabel);
    cards.push(chartCard("dTrend", t("销售与收款趋势", "Sales and cash"), (dashState.trend === "cum" ? t("累计 · ", "cumulative · ") : t("按月 · ", "monthly · ")) + (dashState.period === "month" ? t("近 12 个月 vs 去年同期", "last 12 months vs the year before") : P.label + " vs " + P.vs.replace(/^较/, "")), function (w) {
      if (dashState.trend === "cum") return linesChart(w, { x: labelsT, series: [{ name: t("本期", "This period"), values: cumOf(trendMonths), color: VIZ.seq }, { name: t("上期", "Last period"), values: cumOf(prevMonths).map(function (v) { return v == null ? 0 : v; }), color: VIZ.gray }], fmt: fmt });
      return columnsChart(w, { x: labelsT, series: [{ name: measure, values: trendMonths.map(function (m) { return sum(equip.filter(function (o) { return ym(o.date) === m; }), val); }), color: VIZ.seq }].concat(seeMoney ? [{ name: t("实收", "Received"), values: trendMonths.map(function (m) { return sum(equip.filter(function (o) { return ym(o.date) === m; }), function (o) { return o.received || 0; }); }), color: VIZ.cat[2] }] : []), fmt: fmt });
    }, dataTable([t("月份", "Month"), t("本期", "This period"), t("上期", "Last period")], trendMonths.map(function (m, i) { var a = cumOf(trendMonths)[i], b = cumOf(prevMonths)[i]; return [monthLabel(m), a == null ? "—" : fmt(a), b == null ? "—" : fmt(b)]; }))));
    // 2 客户漏斗
    if (hub) {
      var leads = people.filter(function (p) { return p.sources && p.sources.lead; }).length, registered = people.filter(function (p) { return p.sources && p.sources.account; }).length, customers = people.filter(function (p) { return p.sources && p.sources.customer; }).length, repeat = people.filter(function (p) { return (p.orders || 0) >= 2; }).length, active = ((stats.stages || {}).active || 0);
      var funnel = [{ label: t("讲座线索", "Seminar leads"), value: leads }, { label: t("有 Teams 账号", "With a Teams account"), value: registered }, { label: t("买过教材", "Bought textbooks"), value: customers }, { label: t("复购（≥2 单）", "Repeat (≥2 orders)"), value: repeat }, { label: t("活跃", "Active"), value: active }];
      cards.push(chartCard("dFunnel", t("客户漏斗", "Customer funnel"), t("人员库里各阶段的人数 · 讲座线索成为客户的比例", "people at each stage · how many seminar leads became customers"), function (w) { return barsChart(w, { rows: funnel, fmt: fmtNum, name: t("人", "people") }) + '<p class="hint">' + esc(t("讲座线索中已成为客户：", "Seminar leads who became customers: ") + people.filter(function (p) { return p.sources && p.sources.lead && p.sources.customer; }).length + " / " + leads) + "</p>"; }, dataTable([t("阶段", "Stage"), t("人数", "People")], funnel.map(function (r) { return [r.label, fmtNum(r.value)]; }))));
    }
    // 3 按出版社: retained vs royalty when the rates are visible
    var pubAgg = {}; eNow.forEach(function (o) { (o.items || []).forEach(function (it) { var k = it.publisher || t("未知", "Unknown"); var v = seeMoney ? (it.total || 0) : (it.qty || 0); var rate = it.royalty && typeof it.royalty["Royalty Rate"] === "number" ? it.royalty["Royalty Rate"] : null; if (!pubAgg[k]) pubAgg[k] = { total: 0, royalty: 0, known: true }; pubAgg[k].total += v; if (rate == null) pubAgg[k].known = false; else pubAgg[k].royalty += v * rate; }); });
    var pubs = Object.keys(pubAgg).map(function (k) { return { label: k, value: pubAgg[k].total, royalty: pubAgg[k].royalty, known: pubAgg[k].known }; }).sort(function (a, b) { return b.value - a.value; });
    var royaltyKnown = seeMoney && pubs.length && pubs.every(function (p) { return p.known; });
    cards.push(chartCard("dPub", t("按出版社", "By publisher"), P.label + " · " + measure + (royaltyKnown ? t(" · 深色为留存，浅色为版税", " · dark = retained, light = royalty") : ""), function (w) {
      if (!royaltyKnown) return barsChart(w, { rows: pubs, fmt: fmt, name: measure });
      return columnsChart(w, { x: pubs.map(function (p) { return p.label; }), series: [{ name: t("留存", "Retained"), values: pubs.map(function (p) { return p.value - p.royalty; }), color: VIZ.seq }, { name: t("版税", "Royalty"), values: pubs.map(function (p) { return p.royalty; }), color: VIZ.seq3 }], fmt: fmt, labelAll: true, height: 240 });
    }, dataTable([t("出版社", "Publisher"), measure].concat(royaltyKnown ? [t("版税", "Royalty")] : []), pubs.map(function (p) { return [p.label, fmt(p.value)].concat(royaltyKnown ? [fmt(p.royalty)] : []); }))));
    // 4 课程销售 Top 10, coloured by category
    var catColor = { Curriculum: VIZ.cat[0], "Pre-recorded": VIZ.cat[1], Live: VIZ.cat[2] };
    var catOf = function (c) { c = String(c || ""); return /live|直播/i.test(c) ? "Live" : /record|预录|video|视频/i.test(c) ? "Pre-recorded" : "Curriculum"; };
    var skuAgg = {}; eNow.forEach(function (o) { (o.items || []).forEach(function (it) { var k = equipName(it); if (!skuAgg[k]) skuAgg[k] = { v: 0, cat: catOf(it.category) }; skuAgg[k].v += seeMoney ? (it.total || 0) : (it.qty || 0); }); });
    var top = Object.keys(skuAgg).map(function (k) { return { label: k, value: skuAgg[k].v, color: catColor[skuAgg[k].cat], sub: skuAgg[k].cat === "Live" ? t("直播课", "Live") : skuAgg[k].cat === "Pre-recorded" ? t("预录课", "Pre-recorded") : t("教材", "Curriculum") }; }).sort(function (a, b) { return b.value - a.value; }).slice(0, 10);
    cards.push(chartCard("dTop", t("课程销售 Top 10", "Top 10 titles"), P.label + " · " + measure, function (w) { return legend([{ name: t("教材", "Curriculum"), color: VIZ.cat[0] }, { name: t("预录课", "Pre-recorded"), color: VIZ.cat[1] }, { name: t("直播课", "Live"), color: VIZ.cat[2] }]) + barsChart(w, { rows: top, fmt: fmt }); }, dataTable([t("名称", "Title"), t("类型", "Type"), measure], top.map(function (r) { return [r.label, r.sub, fmt(r.value)]; }))));
    // 5 客户分布与复购: by school (the domain of a person's Teams account)
    if (hub) {
      var bySchool = {}; people.forEach(function (p) { if (!(p.sources && p.sources.customer)) return; var d = (((p.facets || {}).accounts || [])[0] || {}).domain || t("无 Teams 账号", "No Teams account"); bySchool[d] = (bySchool[d] || 0) + 1; });
      var schools = Object.keys(bySchool).map(function (k) { return { label: dname(k) || k, value: bySchool[k] }; }).sort(function (a, b) { return b.value - a.value; }).slice(0, 10);
      var withOrders = people.filter(function (p) { return (p.orders || 0) >= 1; }).length, repeatN = people.filter(function (p) { return (p.orders || 0) >= 2; }).length;
      cards.push(chartCard("dSchools", t("客户分布与复购", "Where customers are, and who comes back"), t("买过教材的人按学校 · 复购率 ", "textbook buyers by school · repeat rate ") + (withOrders ? Math.round(repeatN / withOrders * 100) + "% (" + repeatN + "/" + withOrders + ")" : "—"), function (w) { return barsChart(w, { rows: schools, fmt: fmtNum, name: t("客户", "customers") }); }, dataTable([t("学校", "School"), t("客户", "Customers")], schools.map(function (r) { return [r.label, fmtNum(r.value)]; }))));
      // 6 社区与讲座
      var sessions = {}; people.forEach(function (p) { ((p.facets || {}).leads || []).forEach(function (l) { var k = l.session || t("未注明场次", "Unnamed session"); if (!sessions[k]) sessions[k] = { n: 0, c: 0 }; sessions[k].n++; if (p.sources.customer) sessions[k].c++; }); });
      var sess = Object.keys(sessions).sort().reverse().slice(0, 8).map(function (k) { return { label: k, value: sessions[k].n, c: sessions[k].c }; });
      cards.push(chartCard("dSeminar", t("社区与讲座", "Community and seminars"), t("每场讲座报名人数 · 其中后来买了教材的", "sign-ups per session · of whom bought textbooks since"), function (w) { return columnsChart(w, { x: sess.map(function (r) { return r.label; }), series: [{ name: t("成为客户", "Became customers"), values: sess.map(function (r) { return r.c; }), color: VIZ.seq }, { name: t("未购买", "Not yet"), values: sess.map(function (r) { return r.value - r.c; }), color: VIZ.seq3 }], fmt: fmtNum, labelAll: true }); }, dataTable([t("场次", "Session"), t("报名", "Sign-ups"), t("成为客户", "Became customers")], sess.map(function (r) { return [r.label, fmtNum(r.value), fmtNum(r.c)]; }))));
    }
    // 6b 长尾: available titles nobody bought in a year (the curriculum director's one)
    if (crmLevel("catalogue") !== "none") cards.push('<div class="card viz" id="dTail"><div class="ch"><h2>' + t("一年没卖出的在售教材", "Available titles unsold for a year") + ' <span class="n">' + t("可售但 12 个月内无订单", "available, no order in 12 months") + '</span></h2><div class="vtools"><div class="vtoggle" role="tablist"><button type="button" class="on" data-v="chart">' + t("图", "Chart") + '</button><button type="button" data-v="table">' + t("表", "Table") + '</button></div></div></div><div class="vbody"><p class="loading">' + t("载入中…", "Loading…") + '</p></div><div class="vtable hidden"></div></div>');
    // 7 待处理与异常 — a list, each line a way in
    if (canSeeOrders()) {
      var replaceAll = stats.replace || 0, replaceWithOrders = people.filter(function (p) { return p.primaryTier === "replace" && (p.orders || 0) > 0; }).length;
      var rows = [
        [t("超期订单", "Overdue orders"), counts.overdue || 0, "#/ops/orders/hive", "overdue"],
        [t("通知失败的订单", "Orders whose notification failed"), counts.notifyFailed || 0, "#/ops/orders/hive", "notifyFailed"],
        [t("待确认的订单", "Orders awaiting confirmation"), counts.submitted || 0, "#/ops/orders/hive", "submitted"],
      ].concat(hub ? [
        [t("待合并的人员", "People to merge"), hub.canMerge ? (hub.queue || []).length : null, "#/ops/people", "queue"],
        [t("待替换邮箱（有订单 " + replaceWithOrders + " · 本月已替换 " + (stats.replacedThisMonth || 0) + "）", "Emails to replace (" + replaceWithOrders + " with orders · " + (stats.replacedThisMonth || 0) + " replaced this month)"), replaceAll, "#/ops/people", "replace"],
        [t("待回写 CRM ID", "CRM IDs to write back"), stats.writeBack || 0, "#/ops/people", "all"],
      ] : []).filter(function (r) { return r[1] !== null; });
      var canDigest = isAdmin() || crmLevel("orders") === "rw";
      cards.push('<div class="card todo" id="dTodo"><div class="ch"><h2>' + t("待处理与异常", "To do and exceptions") + ' <span class="n">' + t("今天该有人去做的事", "what someone should do today") + '</span></h2></div><div class="olist">' + rows.map(function (r) { return '<a class="orow link" href="' + r[2] + '" data-tab="' + r[3] + '"><div class="omain"><b>' + esc(r[0]) + '</b></div><div class="oprice"><span class="tag ' + (r[1] ? "warn" : "ok") + '">' + fmtNum(r[1]) + "</span></div></a>"; }).join("") + "</div>" +
        (canDigest ? '<div class="digest" id="dDigest"><span class="muted">' + t("每日摘要：载入中…", "Daily digest: loading…") + "</span></div>" : "") + "</div>");
    }
    // 8 合作伙伴 · 9 许可: later phases, said plainly
    if (crmLevel("partners") !== "none") cards.push('<div class="card viz" id="dPartners"><div class="ch"><h2>' + t("合作伙伴", "Partners") + ' <span class="n">' + t("各机构 · 本学年教材销售与合作阶段", "institutions · this school year's textbook sales and partnership stage") + '</span></h2></div><div class="vbody"><p class="loading">' + t("载入中…", "Loading…") + "</p></div></div>");
    else cards.push('<div class="card soon"><div class="ch"><h2>' + t("合作伙伴", "Partners") + '</h2></div><p class="muted">' + esc(t("需要合作伙伴数据的查看权限。", "Needs read access to partner data.")) + "</p></div>");
    cards.push(
      (crmLevel("drm") !== "none" ? '<div class="card viz" id="dLic"><div class="ch"><h2>' + t("许可", "Licences") + ' <span class="n">' + t("池余量与到期 · 已有座位的人 · 按地区", "pool balance and expiry · people with a seat · by region") + '</span></h2><div class="vtools"><div class="vtoggle" role="tablist"><button type="button" class="on" data-v="chart">' + t("图", "Chart") + '</button><button type="button" data-v="table">' + t("表", "Table") + '</button></div></div></div><div class="vbody"><p class="loading">' + t("载入中…", "Loading…") + '</p></div><div class="vtable hidden"></div></div>' :
        '<div class="card soon"><div class="ch"><h2>' + t("许可", "Licences") + '</h2></div><p class="muted">' + esc(t("需要许可数据的查看权限。", "Needs read access to licence data.")) + "</p></div>"));
    if (canSeeOrders()) cards.push('<div class="card feed" id="dFeed"><div class="ch"><h2>' + t("动态", "Activity") + ' <span class="n">' + t("最近的录入、状态变化、同步与合并", "recent entries, status changes, syncs and merges") + '</span></h2></div><div class="olist" id="dFeedList"><div class="orow muted">' + t("载入中…", "Loading…") + "</div></div></div>");
    $("dgrid").innerHTML = cards.join("");
    // 图形切换 for the trend card: 累计 / 按月
    var tc = $("dTrend"); if (tc) { var tg = tc.querySelector(".vtoggle"); tg.insertAdjacentHTML("afterbegin", '<button type="button" data-t="cum"' + (dashState.trend === "cum" ? ' class="on2"' : "") + ">" + t("累计", "Cumulative") + '</button><button type="button" data-t="monthly"' + (dashState.trend === "monthly" ? ' class="on2"' : "") + ">" + t("按月", "Monthly") + "</button>"); tg.addEventListener("click", function (e) { var b = e.target.closest("button[data-t]"); if (!b) return; dashState.trend = b.getAttribute("data-t"); renderDashboard(); }); }
    drawCharts();
    // 许可: seats by title (allocated vs total), the people-with-a-seat curve, the expiring pools.
    if ($("dLic")) loadLicenses(false).then(function (d) {
      var card = $("dLic"); if (!card) return; var sm = d.summary;
      var draw = function (w) {
        if (!sm.pools) return '<p class="muted">' + t("还没有许可池。", "No licence pools yet.") + ' <a href="#/ops/licenses">' + t("去建一个 →", "Create one →") + "</a></p>";
        return '<div class="sharekeys" style="margin:0 0 8px"><span><b>' + fmtNum(sm.seats) + '</b> ' + t("份", "seats") + "</span><span><b>" + fmtNum(sm.allocated) + "</b> " + t("已分配", "allocated") + "</span><span><b>" + fmtNum(sm.users) + "</b> " + t("人有座位", "people") + "</span><span><b>" + fmtNum(sm.expiringSoon) + "</b> " + t("池 90 天内到期", "pools expiring in 90 d") + "</span></div>" +
          columnsChart(w, { x: sm.bySku.slice(0, 8).map(function (x) { return x.sku; }), series: [{ name: t("已分配", "Allocated"), values: sm.bySku.slice(0, 8).map(function (x) { return x.allocated; }), color: VIZ.seq }, { name: t("余量", "Balance"), values: sm.bySku.slice(0, 8).map(function (x) { return x.qty - x.allocated; }), color: VIZ.seq3 }], fmt: fmtNum, labelAll: true, height: 200 }) +
          (Object.keys(sm.byRegion || {}).length ? '<div class="sharekeys" style="margin-top:8px">' + Object.keys(sm.byRegion).map(function (k) { return "<span>" + esc(t((REGION_L[k] || [k, k])[0], (REGION_L[k] || [k, k])[1])) + " <b>" + sm.byRegion[k] + "</b></span>"; }).join("") + "</div>" : "");
      };
      vizDraws.push({ id: "dLic", draw: draw });
      card.querySelector(".vbody").innerHTML = draw(card.querySelector(".vbody").clientWidth);
      card.querySelector(".vtable").innerHTML = dataTable([t("池", "Pool"), t("教材", "Title"), t("持有方", "Holder"), t("份数", "Seats"), t("已分配", "Allocated"), t("余量", "Balance"), t("有效期至", "Valid to")], d.pools.map(function (p) { return [p.id, p.sku, holderName(p.holder), fmtNum(p.qty), fmtNum(p.allocated), fmtNum(p.balance), p.validTo || "—"]; }));
    }).catch(function () { var body = $("dLic") && $("dLic").querySelector(".vbody"); if (body) body.innerHTML = '<p class="muted">' + t("许可数据暂不可用。", "Licence data is not available.") + "</p>"; });
    // 动态: the CRM's audit lines, in plain words.
    if ($("dFeedList")) api("crm/feed?limit=30").then(function (r) {
      var el = $("dFeedList"); if (!el) return;
      if (!r.ok) { el.innerHTML = '<div class="orow muted">' + esc(errText(r)) + "</div>"; return; }
      var say = function (e) {
        var who = e.by || e.actor || "";
        switch (e.action) {
          case "crm.entry.order": return t("录入订单 ", "Entered order ") + (e.orderId || "") + (e.newCustomer ? t("（新客户）", " (new customer)") : "");
          case "crm.entry.received": return t("记录实收 ", "Recorded received ") + fmtMoney(e.received);
          case "crm.order.status": return (e.orderId || "") + " " + stTag(e.from) + " → " + stTag(e.to);
          case "crm.orders.import": return t("导入课程订单 ", "Imported course orders ") + (e.created || 0);
          case "crm.equip.sync": return t("Equip 同步 ", "Equip sync ") + ((e.counts || {}).orders || 0) + t(" 单", " orders");
          case "crm.people.merge": return t("合并判定：", "Merge verdict: ") + (e.verdict === "same" ? t("同一人", "same person") : t("不同人", "different"));
          case "crm.people.rebuild": return t("人员库重新匹配，", "People hub rebuilt, ") + ((e.stats || {}).people || 0) + t(" 人", " people");
          case "crm.people.writeback": return t("回写 CRM ID ", "CRM IDs written back ") + (e.written || 0);
          case "crm.email.replace": return t("邮箱替换标记：", "Email replacement: ") + (e.status || "") + " · " + (e.crmId || "");
          case "crm.royalty.paid": return t("版税 ", "Royalty ") + (e.publisher || "") + " " + (e.quarter || "") + (e.paid ? t(" 标记已付", " marked paid") : t(" 撤销已付", " unmarked"));
          case "crm.partner.update": return t("机构合作阶段：", "Partnership: ") + (e.domain || "") + " → " + (e.stage || "—");
          case "crm.digest": return t("待处理摘要已发给 ", "Digest sent to ") + ((e.to || []).join(", ") || "");
          case "crm.license.pool": return t("新建许可池 ", "New licence pool ") + (e.id || "") + " · " + (e.sku || "") + " × " + (e.qty || 0);
          case "crm.license.allocate": return t("分配许可 ", "Allocated ") + (e.qty || 0) + t(" 份 → ", " seats → ") + ((e.to && (e.to.name || e.to.crmId || e.to.domain)) || "");
          case "crm.license.revoke": return t("撤销许可分配 ", "Revoked allocation ") + (e.id || "");
          default: return e.action;
        }
      };
      el.innerHTML = r.body.feed.length ? r.body.feed.map(function (e) { return '<div class="orow"><div class="omain"><b>' + say(e) + '</b><span class="sub">' + esc(when(e.at) + ((e.by || e.actor) ? " · " + (e.by || e.actor) : "")) + "</span></div></div>"; }).join("") : '<div class="orow muted">' + t("还没有动态。", "Nothing yet.") + "</div>";
    });
    // 长尾 from the catalogue: by publisher (bars), and the list behind 表.
    if ($("dTail")) api("crm/catalogue").then(function (r) {
      var card = $("dTail"); if (!card) return;
      if (!r.ok) { card.querySelector(".vbody").innerHTML = '<p class="muted">' + esc(errText(r)) + "</p>"; return; }
      var cutoff = addMonths(curMonth(), -12) + "-01";
      var tail = r.body.skus.filter(function (k) { return k.available && (!k.lastSale || k.lastSale < cutoff); }).sort(function (a, b) { return String(a.lastSale || "").localeCompare(String(b.lastSale || "")) || a.sku.localeCompare(b.sku); });
      var avail = r.body.skus.filter(function (k) { return k.available; }).length;
      var byPub = {}; tail.forEach(function (k) { var pk = k.publisher || t("未知", "Unknown"); byPub[pk] = (byPub[pk] || 0) + 1; });
      var rows = Object.keys(byPub).map(function (k) { return { label: k, value: byPub[k] }; }).sort(function (a, b) { return b.value - a.value; });
      card.querySelector(".ch h2 .n").textContent = tail.length + " / " + avail + t(" 种在售教材 · 按出版社", " available titles · by publisher");
      var draw = function (w) { return rows.length ? barsChart(w, { rows: rows, fmt: fmtNum, name: t("种", "titles") }) : '<p class="muted">' + t("在售教材一年内都有售出。", "Every available title sold within the year.") + "</p>"; };
      vizDraws.push({ id: "dTail", draw: draw });
      card.querySelector(".vbody").innerHTML = draw(card.querySelector(".vbody").clientWidth);
      card.querySelector(".vtable").innerHTML = dataTable(["SKU", t("名称", "Title"), t("出版社", "Publisher"), t("类别", "Category"), t("最近售出", "Last sold"), t("累计件数", "Units ever")], tail.map(function (k) { return [k.sku, EN ? (k.nameEn || k.nameZh) : (k.nameZh || k.nameEn), k.publisher, k.category, k.lastSale || t("从未", "never"), fmtNum(k.unitsEver)]; }));
    });
    // 合作伙伴: the institutions, this school year's sales (or accounts when amounts are hidden), stage chips.
    if ($("dPartners")) loadInstitutionsCrm(false).then(function (d) {
      var body = $("dPartners") && $("dPartners").querySelector(".vbody"); if (!body) return;
      var rows = d.rows.slice().sort(function (a, b) { return (b.fySales || 0) - (a.fySales || 0) || b.accounts - a.accounts; }).slice(0, 8);
      var bars = rows.map(function (r) { return { label: instName(r), value: seeMoney ? (r.fySales || 0) : r.accounts, sub: (r.partner && STAGES_P[r.partner.stage] ? t(STAGES_P[r.partner.stage][0], STAGES_P[r.partner.stage][1]) + " · " : "") + fmtNum(r.customers) + t(" 客户 · ", " customers · ") + fmtNum(r.accounts) + t(" 账号", " accounts") }; });
      var byStage = {}; d.rows.forEach(function (r) { var st = r.partner && r.partner.stage; if (st) byStage[st] = (byStage[st] || 0) + 1; });
      body.innerHTML = '<div class="vlegend">' + Object.keys(STAGES_P).map(function (k) { return "<span>" + pstTag(k) + " " + (byStage[k] || 0) + "</span>"; }).join("") + '<a href="#/ops/institutions" style="margin-left:auto">' + t("全部机构 →", "All institutions →") + "</a></div>" + barsChart(body.clientWidth, { rows: bars, fmt: seeMoney ? fmtMoney : fmtNum, name: seeMoney ? t("本学年销售", "SY sales") : t("账号", "accounts") });
    }).catch(function () { var body = $("dPartners") && $("dPartners").querySelector(".vbody"); if (body) body.innerHTML = '<p class="muted">' + t("机构数据暂不可用。", "Institution data is not available.") + "</p>"; });
    // The daily digest to the order manager (decision 18): who gets it, when it last went, send now.
    if ($("dDigest")) api("crm/digest").then(function (r) {
      var el = $("dDigest"); if (!el) return;
      if (!r.ok) { el.innerHTML = '<span class="muted">' + esc(errText(r)) + "</span>"; return; }
      var b = r.body, last = b.last;
      el.innerHTML = '<span class="muted">' + esc(t("每日摘要发给 ", "Daily digest to ") + (b.to.length ? b.to.join(", ") : t("（没有订单经理账号，请在角色分配里指定）", "(nobody holds the order-manager role yet)")) + (last ? t(" · 上次 ", " · last ") + day(last.at) + (last.ok ? "" : t("（失败）", " (failed)")) : t(" · 尚未发送过", " · not sent yet")) + (b.configured ? "" : t(" · 未配置通知流程", " · notification flow not configured")) + (b.channel ? t(" · 频道来自 ", " · channel from ") + b.channelFrom : t(" · 没有 Teams 频道：请在 Airtable 学校表加一行 CRM 并填 Teams Channel ID", " · no Teams channel: add a CRM row with a Teams Channel ID to the Schools table"))) + "</span>" +
        '<button type="button" class="btn secondary sm" id="dSend">' + t("现在发送", "Send now") + "</button>";
      $("dSend").addEventListener("click", function () {
        var btn = $("dSend"); if (!window.confirm(t("把当前的待处理与异常发给订单经理（Teams + 邮件）？", "Send the current to-do and exceptions to the order manager (Teams + email)?"))) return;
        savingButton(btn, t("发送中…", "Sending…"));
        post("crm/digest", "POST", {}).then(function (r2) {
          restoreButton(btn);
          if (!r2.ok) { flash(esc((r2.body && r2.body.message) || errText(r2)), 10000); return; }
          if (r2.body.sent) flashOk(esc(t("已发送给 ", "Sent to ") + r2.body.to.join(", ") + t("，共 " + r2.body.total + " 项。", ", " + r2.body.total + " items.")), 6000);
          else flash(esc(t("通知流程返回 HTTP " + r2.body.status + "，未能发送。", "The notification flow answered HTTP " + r2.body.status + "; not sent.")), 10000);
        });
      });
    });
    var asOf = [(equipState.status || {}).syncedAt, hub && hub.generatedAt].filter(Boolean).sort()[0];
    $("dfoot").innerHTML = esc((asOf ? t("数据截至 ", "Data as of ") + when(asOf) + " · " : "") + (seeMoney ? "" : t("金额按角色隐藏，图表以件数计 · ", "Amounts hidden for this role; charts count units · ")) + t("学年从 8 月起算", "School year from August"));
  }
  function exportDashboardCsv() {
    var cell = function (v) { v = String(v == null ? "" : v).replace(/\s+/g, " ").trim(); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var lines = [[t("蜂巢 CRM 经营仪表盘", "Hive CRM dashboard"), new Date().toISOString().slice(0, 10), periodMonths(dashState.period).label].map(cell).join(",")];
    // the tiles
    lines.push(""); lines.push(cell(t("指标", "Tiles")));
    document.querySelectorAll("#dkpi .kpi").forEach(function (k) { var l = k.querySelector(".l"), v = k.querySelector(".v"), sub = k.querySelector(".s"); lines.push([l && l.textContent, v && v.textContent, sub && sub.textContent].map(cell).join(",")); });
    // every panel's table
    document.querySelectorAll("#dgrid .card").forEach(function (c) {
      var h = c.querySelector(".ch h2"); if (!h) return;
      var title = (h.childNodes[0] && h.childNodes[0].textContent || "").trim(), sub = h.querySelector(".n");
      var tbl = c.querySelector("table.vt");
      lines.push(""); lines.push([title, sub ? sub.textContent : ""].map(cell).join(","));
      if (tbl) tbl.querySelectorAll("tr").forEach(function (tr) { lines.push(Array.prototype.map.call(tr.children, function (td) { return cell(td.textContent); }).join(",")); });
      else c.querySelectorAll(".olist .orow").forEach(function (row) { lines.push(Array.prototype.map.call(row.children, function (d) { return cell(d.textContent); }).join(",")); });
    });
    var blob = new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "dashboard-" + new Date().toISOString().slice(0, 10) + ".csv"; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }
  $("content").addEventListener("click", function (e) {
    var k = e.target.closest("#dkpi .kpi[data-go]"); if (k) { location.hash = k.getAttribute("data-go"); return; }
    var a = e.target.closest("#dTodo a[data-tab]"); if (a) { var tb = a.getAttribute("data-tab"); if (/people/.test(a.getAttribute("href"))) peopleState.tab = tb; else ordersState.tab = tb; }
  });
