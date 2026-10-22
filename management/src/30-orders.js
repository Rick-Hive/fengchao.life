// management/src/30-orders.js — 经营 › 订单: the website's course orders, status flow, order panel.
// Part of management.js: scripts/build-management.js concatenates management/src/*.js in name order
// into management/management.js (one closure; every part sees every other's functions). Edit here, not the built file.

  // ================================================================================
  // 经营 › 订单 (CRM design §6, Rick 2026-10-06): the website's course orders, stored by
  // api/order at checkout, with their status and fulfilment record. Who sees what is the
  // server's business (api/crm masks by role); the page only hides the buttons a reader
  // cannot use. Overdue rules (decision 18): submitted > 3 d, contacted > 14 d, parent_paid > 7 d, paid > 30 d.
  //
  // Stage 2 (design 2026-10-20, Rick 2026-10-21): the course fee goes from the family to the provider directly, so
  // the flow records both sides — 家长已付款 (the family's word, from 我的订单) and 已收款 (the provider's). The
  // provider's leader (机构负责人: domain_leader of the hive's domain) works its own hive's orders here with no CRM
  // role; an order nobody pays within 21 days expires, and the provider may extend it 14 days at a time.
  // ================================================================================
  var ORDER_TABS = [["all", "全部", "All"], ["submitted", "已提交", "Submitted"], ["contacted", "沟通中", "In touch"], ["parent_paid", "家长已付款", "Parent paid"], ["paid", "已收款", "Received"], ["started", "已开课", "Started"], ["cancelled", "已取消", "Cancelled"], ["expired", "已过期", "Expired"], ["overdue", "超期", "Overdue"], ["notifyFailed", "通知失败", "Notification failed"]];
  var ORDER_ST = { submitted: ["已提交", "Submitted", "accent"], contacted: ["机构沟通中", "Provider in touch", "accent"], confirmed: ["机构沟通中", "Provider in touch", "accent"], parent_paid: ["家长已付款", "Parent paid", "warn"], paid: ["已收款", "Payment received", "ok"], started: ["已开课", "Started", "ok"], cancelled: ["已取消", "Cancelled", "muted"], expired: ["已过期", "Expired", "muted"] };
  var ORDER_VERB = { contacted: ["已联系家长", "Contacted the family"], parent_paid: ["记家长已付款", "Record parent paid"], paid: ["已收款", "Payment received"], started: ["开课", "Start"], cancelled: ["取消订单", "Cancel order"], submitted: ["重新打开", "Reopen"] };
  var ordersState = { list: null, counts: {}, tab: "all", q: "", access: {}, provider: null, expireDays: 14 };
  var NOTICE_EVENT = { contacted: ["已联系", "contacted"], parent_paid: ["家长已付款", "parent paid"], parent_paid_nudge: ["催机构确认收款", "nudge: confirm receipt"], paid: ["已收款", "payment received"], started: ["已开课", "started"], cancelled: ["已取消", "cancelled"], cancel_request: ["申请取消", "cancel request"], expired: ["已过期", "expired"], reminder_expiry: ["到期提醒", "expiry reminder"], seated: ["递补", "seated"], extended: ["延长", "extended"], reopened: ["重新打开", "reopened"] };
  function crmLevel(domain) { return (me && me.crm && me.crm[domain]) || "none"; }
  function canSeeRoyalty() { return crmLevel("money") === "rw" || hasFn("ceo"); }
  function canSeeOrders() { return crmLevel("orders") !== "none"; }
  // 机构负责人: leads the domain of a hive (me/summary.hive.providerHives) and holds no CRM order level — the 订单
  // page is theirs for their own hive's orders and class sizes; nothing else of 经营.
  function providerHives() { return (me && me.hive && me.hive.providerHives) || []; }
  function isProviderOnly() { return !canSeeOrders() && providerHives().length > 0; }
  function canSeeOrderPage() { return canSeeOrders() || isProviderOnly(); }
  function ordersRw() { return crmLevel("orders") === "rw" || isProviderOnly(); }
  function stName(status) { var d = ORDER_ST[status] || [status, status, ""]; return t(d[0], d[1]); }
  function stTag(status) { var d = ORDER_ST[status] || [status, status, ""]; return '<span class="tag ' + d[2] + '">' + esc(t(d[0], d[1])) + "</span>"; }
  // days until an unpaid order expires (expiresAt comes only while submitted / contacted)
  function expiryDays(o) { if (!o.expiresAt) return null; return Math.ceil((Date.parse(o.expiresAt) - Date.now()) / 86400000); }
  function expiryTag(o) {
    var d = expiryDays(o); if (d === null || d > 7) return "";
    return '<span class="tag ' + (d <= 3 ? "bad" : "warn") + '" title="' + esc(t("未付款的订单在最后一次推进后 " + ordersState.expireDays + " 天自动过期；到期前 3 天提醒双方；机构可延长。", "An unpaid order expires " + ordersState.expireDays + " days after its last step; both sides are reminded 3 days before; the provider can extend it.")) + '">' + esc(d <= 0 ? t("今天到期", "Expires today") : t(d + " 天后到期", "Expires in " + d + " d")) + "</span>";
  }
  function money(v, cur) { if (v === null || v === undefined) return '<span class="muted">' + t("不可见", "hidden") + "</span>"; return esc((cur === "CNY" || !cur ? "¥" : cur + " ") + Number(v).toLocaleString(EN ? "en-US" : "zh-CN")); }
  // the child a course is for (stage 2, 2026-10-21), under the course on an order's line
  function childLine(it, o) { var c = it && it.child; if (!c || !c.name) return o ? '<span class="sub"><span class="tag warn">' + t("未填学生", "student not given") + "</span> " + esc((o.contact && (o.contact.displayName || [o.contact.familyName, o.contact.givenName].filter(Boolean).join(""))) || o.email || "") + "</span>" : ""; return '<span class="sub">' + t("学生：", "Student: ") + esc(c.name) + (c.grade ? " · " + esc(c.grade === "学前" ? t("学前", "Pre-K") : t(c.grade + " 年级", "Grade " + c.grade)) : "") + (c.account ? ' <span class="faint">' + esc(c.account) + "</span>" : "") + "</span>"; }
  function overdueTag(o) {
    if (!o.overdue) return "";
    var r = o.overdue;
    return '<span class="tag warn" title="' + esc(t("在「" + stName(r.rule) + "」已停留 " + r.days + " 天（上限 " + r.limit + " 天）", "In “" + stName(r.rule) + "” for " + r.days + " days (limit " + r.limit + ")")) + '">' + esc(t("超期 " + r.days + " 天", r.days + " d overdue")) + "</span>";
  }
  // Order payloads carry "中文 / English" pairs for class type and teaching language; show one side.
  function side(v) { var parts = String(v || "").split(" / "); return parts.length === 2 ? (EN ? parts[1] : parts[0]) : String(v || ""); }
  function orderHives(o) { return (o.hives || []).map(function (h) { return h.abbr || h.name || h.key; }).filter(Boolean).join(", ") || (o.items && o.items[0] && (o.items[0].schoolAbbr || o.items[0].schoolName)) || "—"; }
  function orderCourses(o) { return (o.items || []).map(function (it) { return EN ? (it.nameEn || it.nameZh) : (it.nameZh || it.nameEn); }); }
  // The app may not read the team's channels yet: what to do, once (resource-specific consent).
  function teamsSetupPanel(b) {
    panelOpen('<div class="ph"><h3>' + t("让管理中心读取 Teams 订单", "Let the management centre read Teams orders") + '</h3><button class="x" type="button" aria-label="close">✕</button></div><div class="pb">' +
      '<p class="msg">' + t("Hive 的应用身份还不能读取团队「" + (b.team || "Hive Orders") + "」的频道消息。微软把频道消息的应用权限列为受保护接口；绕开申请的办法是给这个团队装一个只申请「读取本团队频道消息」权限的 Teams 应用（资源级许可），只对这一个团队有效，对 Teams 不做任何写入。",
        "Hive's app identity cannot read the channel messages of team \u201c" + (b.team || "Hive Orders") + "\u201d yet. Microsoft gates that application permission; the way round is a Teams app that asks only to read this team's channel messages (resource-specific consent), installed in this one team — it reads, never writes.") + "</p>" +
      "<ol>" +
        "<li>" + t("下载应用包：", "Download the app package: ") + '<a href="/api/crm/teams-app" download="hive-crm-teams-app.zip">hive-crm-teams-app.zip</a></li>' +
        "<li>" + t("Teams 管理中心 › Teams 应用 › 设置策略：确认允许上传自定义应用（一次性）。", "Teams admin center › Teams apps › Setup policies: make sure custom app upload is allowed (once).") + "</li>" +
        "<li>" + t("在 Teams 里：应用 › 管理你的应用 › 上传应用 › 上传自定义应用，选这个 zip。", "In Teams: Apps › Manage your apps › Upload an app › Upload a custom app, pick the zip.") + "</li>" +
        "<li>" + t("把它添加到团队「" + (b.team || "Hive Orders") + "」（添加到团队，而不是个人）。团队所有者同意权限即可。", "Add it to the team \u201c" + (b.team || "Hive Orders") + "\u201d (to the team, not to yourself); the team owner's consent grants the permission.") + "</li>" +
        "<li>" + t("回到这里再点「从 Teams 读取订单」。", "Come back and click \u201cRead orders from Teams\u201d again.") + "</li>" +
      "</ol>" +
      '<p class="hint">' + t("备选：用 Export-TeamsOrders.ps1 以自己的账号导出频道，再点「导入 Teams 导出…」。", "Alternative: export the channels with Export-TeamsOrders.ps1 under your own sign-in, then \u201cImport Teams export…\u201d.") + "</p></div>");
  }
  // 订单 has two pages shown one at a time (Rick, 2026-10-06): 课程订单 — the website's
  // course orders — and 教材订单 — the Equip textbook orders read from Airtable.
  function viewOrders() {
    // Equip textbook orders first and by default (Rick, 2026-10-08); the website's
    // course orders at #/ops/orders/hive. One compact tab row: name only, no subtitle.
    // A provider's leader has the course orders and class sizes only: the Equip tab is not theirs (#/ops/orders → hive).
    var prov = isProviderOnly(), classTab = location.hash.indexOf("#/ops/orders/classes") === 0, hiveTab = location.hash.indexOf("#/ops/orders/hive") === 0 || (prov && !classTab);
    $("content").innerHTML = '<div class="pagetabs compact" role="tablist">' +
      (prov ? "" : '<a class="ptab' + (hiveTab || classTab ? "" : " on") + '" role="tab" aria-selected="' + !(hiveTab || classTab) + '" href="#/ops/orders" title="EquipMe · Airtable">' + t("Equip教材订单", "Equip textbook orders") + "</a>") +
      '<a class="ptab' + (hiveTab ? " on" : "") + '" role="tab" aria-selected="' + hiveTab + '" href="#/ops/orders/hive" title="fengchao.life">' + t("蜂巢课程订单", "Hive course orders") + "</a>" +
      '<a class="ptab' + (classTab ? " on" : "") + '" role="tab" aria-selected="' + classTab + '" href="#/ops/orders/classes">' + t("班级人数", "Class sizes") + '</a><div class="tabsRight" id="tabsRight"></div></div><div id="opsBody"></div>';
    if (classTab) viewClasses(); else if (hiveTab) viewCourseOrders(); else viewEquipOrders();
  }
  // 班级人数 (enrollment rules design, 2026-10-20): per course — enrolled / waitlist / min / max from the orders,
  // the orders behind each number, 递补 for a waitlisted family. Cancelling a course that did not reach its minimum
  // is done order by order (取消, note 未达开班人数) so each family gets its mail.
  function viewClasses() {
    setTitle(t("经营 › 订单", "Operations › Orders"), t("班级人数", "Class sizes"), '<button class="btn secondary sm" id="clReload">' + t("刷新", "Refresh") + "</button>",
      { info: t("每门课的已确认（已收款 / 已开课）、保留（未付款）、候补、最小开班人数和最大人数，按网站订单实时计算。「已满」按已确认 + 保留算，「还差 N 人开班」只数已确认。已满的课可以为候补家庭递补；不开的课可一键整期停开。", "Confirmed (paid / started), reserved (unpaid), waitlist, minimum and maximum per course, counted from the website orders. “Full” counts confirmed + reserved; “N more to run” counts confirmed only. Seat a waitlisted family when a course is full; cancel a term that will not run in one click.") });
    $("opsBody").innerHTML = '<div class="toolbar sticky" id="clbar"></div><div class="tbl-wrap"><table class="data" id="cltable"><thead><tr><th>' + t("课程", "Course") + "</th><th>" + t("学校", "School") + '</th><th class="num">' + t("已确认 / 保留", "Confirmed / reserved") + '</th><th class="num">' + t("候补", "Waitlist") + '</th><th class="num">' + t("最少 / 最多", "Min / max") + "</th><th>" + t("状态", "State") + '</th></tr></thead><tbody><tr><td colspan="6" class="loading">' + t("载入中…", "Loading…") + "</td></tr></tbody></table></div>";
    $("clReload").addEventListener("click", loadClasses);
    $("cltable").addEventListener("click", function (e) {
      var ct = e.target.closest("button[data-cancel-term]"); if (ct) {
        var code = ct.getAttribute("data-cancel-term"), reason = window.prompt(t("整期停开 " + code + "：请写原因（会写进每位家长的邮件）", "Cancel the term of " + code + ": the reason (goes into every family's email)"), t("未达开班人数", "Did not reach the minimum class size"));
        if (!reason || !reason.trim()) return;
        if (!window.confirm(t("取消 " + code + " 本期全部存活订单中的这门课？每位家长会收到邮件。", "Cancel this course on every live order of " + code + "? Every family gets an email."))) return;
        savingButton(ct); post("crm/cancel-term", "POST", { code: code, reason: reason.trim() }).then(function (r) { if (!r.ok) { restoreButton(ct); flash(esc(errText(r)), 4000); return; } flashOk(t("已停开：" + r.body.cancelled.length + " 单已通知。", "Cancelled: " + r.body.cancelled.length + " orders told."), 4000); loadClasses(); loadOrders(true); }); return;
      }
      var seat = e.target.closest("button[data-seat]"); if (seat) { savingButton(seat); post("crm/seat", "POST", { orderId: seat.getAttribute("data-seat"), code: seat.getAttribute("data-code"), waitlist: seat.getAttribute("data-wl") === "1" }).then(function (r) { if (!r.ok) { restoreButton(seat); flash(esc(errText(r)), 4000); return; } flashOk(seat.getAttribute("data-wl") === "1" ? t("已改回候补。", "Back on the waitlist.") : t("已递补：请通知家长。", "Seated: tell the family."), 3000); loadClasses(); }); return; }
      var tr = e.target.closest("tr[data-code]"); if (tr) { var d = tr.nextElementSibling; if (d && d.classList.contains("cldetail")) d.hidden = !d.hidden; }
    });
    loadClasses();
  }
  function loadClasses() {
    api("crm/classes").then(function (r) {
      var tb = $("cltable") && $("cltable").querySelector("tbody"); if (!tb) return;
      if (!r.ok) { tb.innerHTML = '<tr><td colspan="6"><div class="msg err">' + esc(errText(r)) + "</div></td></tr>"; return; }
      var rw = ordersRw(), cls = r.body.classes || [];
      clState.classes = cls; clState.rw = rw;
      renderClasses();
    });
  }
  var clState = { classes: [], rw: false };
  function renderClasses() {
      var tb = $("cltable") && $("cltable").querySelector("tbody"); if (!tb) return;
      var rw = clState.rw, cpg = pageOf("classes", clState.classes, renderClasses), cls = cpg.rows;
      var bar = $("clbar"); if (bar) bar.innerHTML = pagerTile("classes", cpg);
      if (!clState.classes.length) { tb.innerHTML = '<tr><td colspan="6" class="faint">' + t("还没有设定人数上限的课程，也没有报名。", "No course has a size limit or an enrollment yet.") + "</td></tr>"; return; }
      tb.innerHTML = cls.map(function (c) {
        var state = c.state === "full" ? '<span class="tag warn">' + t("已满", "Full") + "</span>" : c.belowMin ? '<span class="tag">' + t("还差 " + c.need + " 人开班", c.need + " more to run") + "</span>" : c.state === "few" ? '<span class="tag accent">' + t("还剩 " + c.open + " 席", c.open + " left") + "</span>" : '<span class="tag ok">' + t("可报名", "Open") + "</span>";
        var rows = c.orders.map(function (o) { return '<div class="orow"><div class="omain"><b>' + esc(o.orderId) + "</b> " + stTag(o.status) + (o.waitlist ? ' <span class="tag warn">' + t("候补", "Waitlist") + "</span>" : "") + '<span class="sub">' + esc(when(o.submittedAt)) + " · " + esc(o.email || "") + "</span>" + childLine({ child: o.child }, o) + "</div>" + (rw ? '<div><button type="button" class="btn secondary sm" data-seat="' + esc(o.orderId) + '" data-code="' + esc(c.code) + '" data-wl="' + (o.waitlist ? "0" : "1") + '">' + (o.waitlist ? t("递补", "Seat") : t("改为候补", "To waitlist")) + "</button></div>" : "") + "</div>"; }).join("");
        return '<tr class="pick" data-code="' + esc(c.code) + '"><td><span class="dn">' + esc(EN ? c.nameEn || c.nameZh : c.nameZh || c.nameEn) + '</span><span class="sub">' + esc(c.code) + "</span></td><td>" + esc(c.school) + '</td><td class="num"><b>' + (c.confirmed != null ? c.confirmed : c.taken) + '</b>' + (c.reserved ? ' <span class="muted">/ ' + c.reserved + "</span>" : "") + '</td><td class="num">' + (c.waitlist || "") + '</td><td class="num">' + (c.min != null ? c.min : "—") + " / " + (c.max != null ? c.max : "∞") + "</td><td>" + state + (rw && c.taken ? ' <button type="button" class="btn secondary sm danger" data-cancel-term="' + esc(c.code) + '" title="' + esc(t("整期停开：取消本期全部订单中的这门课", "Cancel this term on every order")) + '">' + t("停开", "Cancel term") + "</button>" : "") + "</td></tr>" +
          '<tr class="cldetail" hidden><td colspan="6"><div class="olist">' + (rows || '<span class="faint">' + t("还没有订单。", "No orders yet.") + "</span>") + "</div></td></tr>";
      }).join("");
  }
  function viewCourseOrders() {
    setTitle(t("经营 › 订单", "Operations › Orders"), t("蜂巢课程订单", "Hive course orders"), '<button class="btn secondary sm" id="oReload">' + t("刷新", "Refresh") + '</button> <button class="btn secondary sm" id="oCsv">' + t("导出 CSV", "Export CSV") + "</button>",
      // The Teams import buttons are gone (Rick, 2026-10-08: 「不需要有"从Teams中读取订单"选项」; the
      // Hive Orders history is test data, decision of 2026-10-08). The endpoints stay; the handlers below are inert without the buttons.
      isProviderOnly()
        ? t("贵机构课程的订单。请在 3 天内联系家长；课程费由家长直接付给贵机构，收到后点「已收款」。未付款的订单在最后一次推进后 " + ordersState.expireDays + " 天自动过期（每一步都会通知家长），可延长。", "Orders for your institution's courses. Contact the family within 3 days; the course fee is paid to you directly — click “Payment received” when it arrives. An unpaid order expires " + ordersState.expireDays + " days after its last step (the family is emailed at every step); you can extend it.")
        : t("网站下单的课程订单，下单即记录；课程提供方联系家长、收取课程费，家长和机构各自确认付款，每一步都留有记录。超期未推进的单会标出。", "Course orders from the website, recorded at checkout; the provider contacts the family and collects the course fee, both sides confirm the payment, and every step is kept. Orders that stall are flagged."));
    $("opsBody").innerHTML =
      '<div class="toolbar" id="obar">' + ORDER_TABS.map(function (tb) { return '<button class="chip" data-f="' + tb[0] + '" aria-pressed="' + (ordersState.tab === tb[0]) + '">' + esc(t(tb[1], tb[2])) + ' <span class="cnt" data-cnt="' + tb[0] + '"></span></button>'; }).join("") +
        '<span class="spacer"></span><div class="search">' + ICON.search + '<input type="search" id="oq" value="' + esc(ordersState.q) + '" placeholder="' + t("搜索订单号、邮箱、蜂巢、课程…", "Search order no., email, hive, course…") + '" /></div></div>' +
      '<div class="kpis strip" id="okpi"></div>' +
      '<div class="tbl-wrap"><table class="data" id="otable"><thead><tr><th>' + t("订单号", "Order no.") + "</th><th>" + t("日期", "Date") + "</th><th>" + t("下单人", "Ordered by") + "</th><th>" + t("蜂巢", "Hive") + "</th><th>" + t("课程", "Courses") + "</th><th>" + t("金额", "Amount") + "</th><th>" + t("状态", "Status") + "</th><th>" + t("提醒", "Flags") + "</th></tr></thead>" +
        '<tbody><tr><td colspan="8" class="loading">' + t("载入中…", "Loading…") + "</td></tr></tbody></table></div>" +
      '<p class="muted" id="ofoot" style="font-size:.8rem"></p>';
    $("obar").addEventListener("click", function (e) {
      var c = e.target.closest(".chip[data-f]"); if (!c) return;
      ordersState.tab = c.getAttribute("data-f"); pageReset("orders");
      $("obar").querySelectorAll(".chip").forEach(function (x) { x.setAttribute("aria-pressed", x === c ? "true" : "false"); });
      renderOrders();
    });
    $("oq").addEventListener("input", debounce(function () { ordersState.q = $("oq").value.trim(); pageReset("orders"); renderOrders(); }, 120));
    $("oReload").addEventListener("click", function () { loadOrders(true).then(renderOrders); });
    $("oCsv").addEventListener("click", exportOrdersCsv);
    var tb0 = $("oTeams");
    if (tb0) tb0.addEventListener("click", function () {
      savingButton(tb0, t("读取中…", "Reading…"));
      post("crm/import-teams", "POST", { dryRun: true }).then(function (r) {
        restoreButton(tb0);
        if (!r.ok) {
          if (r.body && r.body.error === "teams_forbidden") { teamsSetupPanel(r.body); return; }
          if (r.body && r.body.error === "no_team") { flash(t("租户里没有叫 ", "No team named ") + esc(r.body.team) + t(" 的团队。", " in the tenant."), 8000); return; }
          flash(esc(errText(r)), 8000); return;
        }
        var b = r.body;
        var msg = t("团队 ", "Team ") + b.team + t("：读到 ", ": read ") + b.messages + t(" 条消息，解析出 ", " messages, parsed ") + b.parsed + t(" 单：新增 ", " orders: ") + b.created.length + t("，已存在 ", " new, ") + b.existing.length + t("，不是订单的消息 ", " already stored, ") + b.skipped.length + t(" 条。", " messages not orders.");
        if (!b.created.length) { flash(msg, 9000); return; }
        if (!window.confirm(msg + "\n\n" + t("写入这 " + b.created.length + " 单？", "Store these " + b.created.length + " orders?"))) return;
        savingButton(tb0, t("写入中…", "Storing…"));
        post("crm/import-teams", "POST", {}).then(function (r2) {
          restoreButton(tb0);
          if (!r2.ok) { flash(esc(errText(r2)), 8000); return; }
          flashOk(t("已从 Teams 导入 ", "Imported from Teams: ") + r2.body.created.length + t(" 单。", " orders."));
          loadOrders(true).then(renderOrders);
        });
      });
    });
    var imp = $("oImport");
    if (imp) {
      imp.addEventListener("click", function () { $("oImportFile").click(); });
      $("oImportFile").addEventListener("change", function () {
        var f = this.files && this.files[0]; this.value = ""; if (!f) return;
        var rd = new FileReader();
        rd.onload = function () {
          var data; try { data = JSON.parse(rd.result); } catch (e) { flash(t("不是 JSON 文件。", "Not a JSON file.")); return; }
          var msgs = Array.isArray(data) ? data : data.value || data.messages || [];
          if (!msgs.length) { flash(t("文件里没有消息。", "No messages in the file.")); return; }
          $("ofoot").textContent = t("正在解析 ", "Parsing ") + msgs.length + t(" 条消息…", " messages…");
          post("crm/import", "POST", { messages: msgs, dryRun: true }).then(function (r) {
            if (!r.ok) { flash(esc(errText(r))); return; }
            var b = r.body;
            var msg = t("解析出 ", "Parsed ") + b.parsed + t(" 单：新增 ", " orders: ") + b.created.length + t("，已存在 ", " new, ") + b.existing.length + t("，无法识别的消息 ", " already stored, ") + b.skipped.length + t(" 条。", " messages not orders.");
            if (!b.created.length) { flash(msg, 8000); return; }
            if (!window.confirm(msg + "\n\n" + t("写入这 " + b.created.length + " 单？", "Store these " + b.created.length + " orders?"))) { $("ofoot").textContent = ""; return; }
            post("crm/import", "POST", { messages: msgs }).then(function (r2) {
              if (!r2.ok) { flash(esc(errText(r2))); return; }
              flashOk(t("已导入 ", "Imported ") + r2.body.created.length + t(" 单。", " orders."));
              loadOrders(true).then(renderOrders);
            });
          });
        };
        rd.readAsText(f);
      });
    }
    $("okpi").addEventListener("click", function (e) {
      var k = e.target.closest(".kpi[data-kf]"); if (!k) return;
      ordersState.tab = k.getAttribute("data-kf"); pageReset("orders");
      $("obar").querySelectorAll(".chip").forEach(function (x) { x.setAttribute("aria-pressed", x.getAttribute("data-f") === ordersState.tab ? "true" : "false"); });
      renderOrders();
    });
    $("otable").addEventListener("click", function (e) {
      var tr = e.target.closest("tr[data-id]"); if (!tr) return;
      document.querySelectorAll("table.data tr.sel").forEach(function (x) { x.classList.remove("sel"); });
      tr.classList.add("sel");
      openOrderPanel(tr.getAttribute("data-id"));
    });
    loadOrders(false).then(renderOrders).catch(function (r) { $("otable").tBodies[0].innerHTML = '<tr><td colspan="8" class="loading">' + esc(errText(r)) + "</td></tr>"; });
  }
  function loadOrders(force) {
    if (ordersState.list && !force) return Promise.resolve(ordersState.list);
    return api("crm/orders").then(function (r) {
      if (!r.ok) throw r;
      ordersState.list = r.body.orders || []; ordersState.counts = r.body.counts || {}; ordersState.access = r.body.access || {}; ordersState.provider = r.body.provider || null; if (r.body.expireDays) ordersState.expireDays = r.body.expireDays;
      return ordersState.list;
    });
  }
  function orderTabs(o) { var tabs = [o.status]; if (o.overdue) tabs.push("overdue"); if (o.notify && o.notify.ok === false && !o.notify.pending) tabs.push("notifyFailed"); return tabs; }
  function ordersNow() {
    var q = ordersState.q.toLowerCase();
    return (ordersState.list || []).filter(function (o) {
      if (ordersState.tab !== "all" && orderTabs(o).indexOf(ordersState.tab) < 0) return false;
      if (!q) return true;
      var hay = [o.orderId, o.email, o.teamsAccount, orderHives(o), orderCourses(o).join(" "), (o.items || []).map(function (it) { return it.code; }).join(" ")].join(" ").toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function renderOrders() {
    var list = ordersState.list || [], c = ordersState.counts || {};
    ORDER_TABS.forEach(function (tb) { var el = $("obar").querySelector('[data-cnt="' + tb[0] + '"]'); if (el) el.textContent = c[tb[0]] ? "(" + c[tb[0]] + ")" : ""; });
    var now = new Date(), ym = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
    var month = list.filter(function (o) { return String(o.submittedAt || "").slice(0, 7) === ym && o.status !== "cancelled"; });
    var prov = isProviderOnly(), seeMoney = crmLevel("money") !== "none" || prov;
    var sum = month.reduce(function (s, o) { return s + (typeof o.totalPrice === "number" ? o.totalPrice : 0); }, 0);
    $("okpi").innerHTML =
      '<button class="kpi" data-kf="all"><div class="l">' + t("本月订单", "Orders this month") + '</div><div class="v">' + month.length + "</div></button>" +
      (seeMoney ? '<div class="kpi"><div class="l">' + (prov ? t("本月订单金额", "Order value this month") : t("本月成交额（Hive 课程）", "Transaction value this month (Hive courses)")) + '</div><div class="v">' + money(sum, "CNY") + "</div>" + (prov ? "" : '<div class="s">' + t("只在仪表盘显示，不与教材销售合计", "Dashboard only; never summed with textbook sales") + "</div>") + "</div>" : "") +
      '<button class="kpi" data-kf="submitted"><div class="l">' + t("待联系", "To contact") + '</div><div class="v' + (c.submitted ? " warn" : "") + '">' + (c.submitted || 0) + "</div></button>" +
      '<button class="kpi" data-kf="parent_paid"><div class="l">' + t("待确认收款", "Payment to confirm") + '</div><div class="v' + (c.parent_paid ? " warn" : "") + '">' + (c.parent_paid || 0) + "</div></button>" +
      '<button class="kpi" data-kf="overdue"><div class="l">' + t("超期", "Overdue") + '</div><div class="v' + (c.overdue ? " bad" : "") + '">' + (c.overdue || 0) + "</div></button>" +
      '<button class="kpi" data-kf="notifyFailed"><div class="l">' + t("通知失败", "Notification failed") + '</div><div class="v' + (c.notifyFailed ? " bad" : "") + '">' + (c.notifyFailed || 0) + "</div></button>";
    var rows = ordersNow(), opg = pageOf("orders", rows, renderOrders);
    $("okpi").insertAdjacentHTML("beforeend", pagerTile("orders", opg));
    rows = opg.rows;
    var tb = $("otable").tBodies[0];
    tb.innerHTML = rows.length ? rows.map(function (o) {
      var courses = orderCourses(o);
      return '<tr class="pick" data-id="' + esc(o.orderId) + '"><td class="nowrap"><b>' + esc(o.orderId) + "</b></td>" +
        '<td class="nowrap">' + esc(day(o.submittedAt)) + "</td>" +
        '<td class="cell-ell" title="' + esc(o.email) + '">' + esc(o.email || "—") + "</td>" +
        '<td class="nowrap">' + esc(orderHives(o)) + "</td>" +
        '<td class="cell-ell" title="' + esc(courses.join(" · ")) + '">' + esc(courses.slice(0, 2).join(" · ")) + (courses.length > 2 ? ' <span class="muted">+' + (courses.length - 2) + "</span>" : "") + "</td>" +
        '<td class="nowrap">' + money(o.totalPrice, o.currency) + "</td>" +
        '<td class="nowrap">' + stTag(o.status) + "</td>" +
        '<td class="nowrap"><span class="tags">' + overdueTag(o) + expiryTag(o) + (o.notify && o.notify.ok === false && !o.notify.pending ? '<span class="tag bad">' + t("通知失败", "Notification failed") + "</span>" : "") + "</span></td></tr>";
    }).join("") : '<tr><td colspan="8" class="empty">' + t("没有符合条件的订单。", "No orders match.") + "</td></tr>";
    $("ofoot").textContent = t("显示 ", "Showing ") + opg.matched + " / " + list.length + t(" 单", " orders") + (list.length ? "" : t("。网站还没有新订单落库。", ". No orders have been recorded from the website yet."));
  }
  function exportOrdersCsv() {
    var cell = function (v) { v = String(v == null ? "" : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var head = [t("订单号", "Order no."), t("提交时间", "Submitted"), t("下单人", "Email"), "Teams", t("蜂巢", "Hive"), t("课程", "Courses"), t("件数", "Items"), t("金额", "Amount"), t("币种", "Currency"), t("状态", "Status"), t("最后变更", "Last change"), t("超期", "Overdue")].join(",");
    var lines = ordersNow().map(function (o) {
      var last = (o.history || [])[o.history.length - 1] || {};
      return [o.orderId, o.submittedAt, o.email, o.teamsAccount, orderHives(o), orderCourses(o).join("; "), o.itemCount, o.totalPrice == null ? "" : o.totalPrice, o.currency, stName(o.status), last.at || "", o.overdue ? o.overdue.days : ""].map(cell).join(",");
    });
    var blob = new Blob(["﻿" + [head].concat(lines).join("\r\n")], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "hive-orders-" + new Date().toISOString().slice(0, 10) + ".csv"; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }
  function openOrderPanel(id) {
    // opened from elsewhere too (机构 › 课程订单, 2026-10-22): the order need not be on the orders page's list
    var o = (ordersState.list || []).filter(function (x) { return x.orderId === id; })[0] || { orderId: id, status: "" };
    var rw = ordersRw();
    panelOpen('<div class="ph"><h3>' + esc(o.orderId) + "</h3>" + stTag(o.status) + '<button class="x" type="button" aria-label="close">✕</button></div><div class="pb"><div class="loading">' + t("载入中…", "Loading…") + "</div></div>");
    api("crm/order?id=" + encodeURIComponent(id)).then(function (r) {
      if (!r.ok) { $("panel").querySelector(".pb").innerHTML = '<div class="msg err">' + esc(errText(r)) + "</div>"; return; }
      drawOrderPanel(r.body.order, rw ? r.body.next || [] : []);
    });
  }
  // the order as the panel and the table should now show it (the server's reply after a change)
  function orderChanged(upd, next) {
    ordersState.list = (ordersState.list || []).map(function (x) { return x.orderId === upd.orderId ? upd : x; });
    loadOrders(true).then(function () { if ($("obar")) renderOrders(); });
    drawOrderPanel(upd, next || []);
  }
  function drawOrderPanel(o, next) {
    var pb = $("panel").querySelector(".pb");
    $("panel").querySelector(".ph h3").textContent = o.orderId;
    var hdrTag = $("panel").querySelector(".ph .tag"); if (hdrTag) hdrTag.outerHTML = stTag(o.status);
    var items = (o.items || []).map(function (it) {
      return '<div class="orow"><div class="omain"><b>' + esc(EN ? (it.nameEn || it.nameZh) : (it.nameZh || it.nameEn)) + '</b><span class="sub">' + esc([it.code, it.schoolAbbr || it.schoolName, side(it.classType), side(it.language), (it.grades || []).join("/")].filter(Boolean).join(" · ")) + "</span>" + (it.cancelled ? '<span class="sub"><span class="tag muted">' + t("已停开", "cancelled") + "</span> " + esc(it.cancelled.reason || "") + "</span>" : "") + childLine(it, o) + (next.length && !it.cancelled ? '<span class="sub"><button type="button" class="btn secondary sm" data-child-code="' + esc(it.code) + '">' + (it.child && it.child.name ? t("更换学生", "Change student") : t("指定学生…", "Name the student…")) + "</button></span>" : "") + (it.prereq ? '<span class="sub">' + t("前置课程：", "Prerequisite: ") + esc(it.prereq.text) + " " + ({ cart: '<span class="tag ok">' + t("同时报名", "ordered together") + "</span>", ordered: '<span class="tag ok">' + t("历史订单已修", "from an earlier order") + "</span>", confirmed: '<span class="tag accent">' + t("家长已确认", "confirmed by the family") + "</span>", none: '<span class="tag warn">' + t("未确认", "not confirmed") + "</span>" }[it.prereq.met] || "") + "</span>" : "") + "</div>" + (it.waitlist ? '<span class="tag warn" title="' + esc(t("课程已满时下的单，等待递补", "Ordered when the course was full; waiting for a seat")) + '">' + t("候补", "Waitlist") + "</span>" + (next.length ? ' <button type="button" class="btn secondary sm" data-seat-code="' + esc(it.code) + '">' + t("递补", "Seat") + "</button>" : "") : "") + "<div class=\"oprice\">" + (it.priceTbd ? '<span class="muted">' + t("价格待定", "Price TBD") + "</span>" : money(it.price, o.currency)) + "</div></div>";
    }).join("");
    var hist = (o.history || []).slice().reverse().map(function (h) {
      return '<div class="hrow"><span class="hat">' + esc(when(h.at)) + '<span class="hwho">' + esc(h.by === "system" ? t("系统", "system") : h.by) + "</span></span><span>" + (h.from ? stTag(h.from) + " → " : "") + stTag(h.to) + (h.via === "hive" ? ' <span class="tag accent">' + t("蜂巢确认", "confirmed by Hive") + "</span>" : "") + (h.note ? '<span class="hnote">' + esc(h.note) + "</span>" : "") + "</span></div>";
    }).join("");
    var notify = o.notify || {};
    var notifyLine = notify.pending ? '<span class="tag">' + t("通知发送中", "Notifying…") + "</span>" : notify.ok ? '<span class="tag ok">' + t("已通知", "Notified") + "</span> " + esc(when(notify.at)) : '<span class="tag bad">' + t("通知失败", "Notification failed") + "</span> " + esc(notify.error || "") + " · " + t("请手动联系家长和蜂巢。", "Contact the parent and the hive by hand.");
    pb.innerHTML =
      '<div class="kv"><span class="k">' + t("提交时间", "Submitted") + "</span><span>" + esc(when(o.submittedAt)) + "</span>" +
        (o.submission && o.submission !== o.orderId ? '<span class="k">' + t("同次提交", "Submission") + "</span><span>" + esc(o.submission) + ' <span class="faint">' + t("（跨机构的选课按机构拆单）", "(a selection across institutions is split per institution)") + "</span></span>" : "") +
        '<span class="k">' + t("下单人", "Email") + "</span><span>" + esc(o.email || "—") + "</span>" +
        (o.account ? '<span class="k">' + t("账号", "Account") + "</span><span>" + esc(o.account) + "</span>" : "") +
        (o.teamsAccount ? '<span class="k">Teams</span><span>' + esc(o.teamsAccount) + "</span>" : "") +
        '<span class="k">' + t("蜂巢", "Hive") + "</span><span>" + ((o.hives || []).length ? (o.hives || []).map(function (h) { return esc(h.name || h.abbr || h.key) + (h.subtotal != null ? " · " + money(h.subtotal, o.currency) : ""); }).join("; ") : esc(orderHives(o))) + "</span>" +
        (o.track && (o.track.nameZh || o.track.nameEn) ? '<span class="k">' + t("毕业路径", "Graduation track") + "</span><span>" + esc(EN ? (o.track.nameEn || o.track.nameZh) : (o.track.nameZh || o.track.nameEn)) + "</span>" : "") +
        '<span class="k">' + t("语言", "Language") + "</span><span>" + (o.lang === "en" ? "English" : "中文") + "</span>" +
        '<span class="k">' + t("通知", "Notification") + "</span><span>" + notifyLine + "</span>" +
        // the clock on an unpaid order (stage 2): when it expires, and 延长 14 天 for whoever may move the order
        (o.expiresAt ? '<span class="k">' + t("付款期限", "Pay by") + "</span><span>" + esc(day(o.expiresAt)) + " " + expiryTag(o) + (next.length ? ' <button type="button" class="btn secondary sm" id="oExtend">' + t("延长 14 天", "Extend 14 days") + "</button>" : "") + "</span>" : "") +
        (o.overdue ? '<span class="k">' + t("提醒", "Flag") + "</span><span>" + overdueTag(o) + "</span>" : "") +
        // v3: the family's payment proof and, once 已收款, Hive's commission on the list price
        ((o.proof || []).length ? '<span class="k">' + t("付款凭证", "Payment proof") + "</span><span>" + o.proof.map(function (pf) { return '<a href="/api/crm/proof?orderId=' + encodeURIComponent(o.orderId) + "&i=" + pf.i + '" target="_blank" rel="noopener">' + esc(pf.name || t("凭证 ", "proof ") + pf.i) + "</a> " + '<span class="faint">' + esc(day(pf.at)) + "</span>"; }).join(" · ") + "</span>" : "") +
        (o.commission ? '<span class="k">' + t("蜂巢佣金", "Hive commission") + "</span><span>" + (o.commission.amount == null ? '<span class="muted">' + t("不可见", "hidden") + "</span>" : money(o.commission.amount, o.commission.currency) + ' <span class="faint">' + t("= 目录价 ", "= list price ") + money(o.commission.base, o.commission.currency) + " × " + Math.round(o.commission.rate * 100) + "%</span>") + "</span>" : "") +
        (o.contact && (o.contact.familyName || o.contact.displayName) ? '<span class="k">' + t("下单人姓名", "Buyer") + "</span><span>" + esc(o.contact.displayName || (o.contact.familyName + o.contact.givenName)) + (o.contact.englishName ? ' <span class="faint">' + esc(o.contact.englishName) + "</span>" : "") + "</span>" : "") + "</div>" +
      "<h4>" + t("课程", "Courses") + " · " + (o.itemCount || (o.items || []).length) + '</h4><div class="olist">' + items + '</div><div class="ototal">' + t("合计", "Total") + " " + money(o.totalPrice, o.currency) + "</div>" +
      (next.length ? "<h4>" + t("推进状态", "Move on") + '</h4><label class="f">' + t("备注（可选）", "Note (optional)") + '<input type="text" id="oNote" maxlength="500" placeholder="' + t("例如：已电话沟通；已收到转账", "e.g. spoke by phone; transfer received") + '" /></label>' +
        '<div class="actions">' + next.map(function (s) { var v = ORDER_VERB[s] || [s, s]; return '<button class="btn' + (s === "cancelled" ? " danger" : s === "submitted" || s === "parent_paid" ? " secondary" : "") + '" type="button" data-to="' + s + '">' + esc(t(v[0], v[1])) + "</button>"; }).join("") + '</div><div id="oMsg"></div>' : "") +
      "<h4>" + t("执行记录", "Fulfilment record") + '</h4><div class="hist">' + hist + "</div>" +
      // v3: every status change mails the family and / or posts to the provider; what went out, and whether it arrived
      ((o.notices || []).length ? "<h4>" + t("通知记录", "Notices sent") + '</h4><div class="hist">' + o.notices.slice().reverse().map(function (n) { var who = [n.to && n.to.family ? t("家长邮件", "family email") : "", n.to && n.to.provider ? t("机构 Teams", "provider Teams") : ""].filter(Boolean).join(" + "); return '<div class="hrow"><span class="hat">' + esc(when(n.at)) + "</span><span>" + esc(NOTICE_EVENT[n.event] ? t(NOTICE_EVENT[n.event][0], NOTICE_EVENT[n.event][1]) : n.event) + (who ? ' <span class="muted">' + who + "</span>" : "") + (n.ok ? ' <span class="tag ok">' + t("已发", "sent") + "</span>" : ' <span class="tag bad">' + t("失败", "failed") + "</span>") + "</span></div>"; }).join("") + "</div>" : "");
    var ext = $("oExtend");
    if (ext) ext.addEventListener("click", function () {
      savingButton(ext);
      post("crm/extend", "POST", { orderId: o.orderId }).then(function (r) {
        if (!r.ok) { restoreButton(ext); $("oMsg") && ($("oMsg").innerHTML = '<div class="msg err">' + esc(errText(r)) + "</div>"); return; }
        flashOk(t("已延长至 ", "Extended to ") + esc(day(r.body.order.expiresAt)), 3000);
        orderChanged(r.body.order, r.body.next);
      });
    });
    pb.querySelectorAll("button[data-child-code]").forEach(function (b) {
      b.addEventListener("click", function () {
        var code = b.getAttribute("data-child-code"), cur = (o.items || []).filter(function (it) { return it.code === code; })[0] || {};
        var name = window.prompt(t("上课学生的姓名（留空清除）：", "The student's name (blank clears):"), (cur.child && cur.child.name) || ""); if (name === null) return;
        var grade = name.trim() ? window.prompt(t("年级（学前、1–12）：", "Grade (学前 / Pre-K, 1–12):"), (cur.child && cur.child.grade) || "") : "";
        if (grade === null) return;
        savingButton(b);
        post("crm/order", "PATCH", { orderId: o.orderId, code: code, child: name.trim() ? { name: name.trim(), grade: String(grade || "").trim() } : null }).then(function (r) { if (!r.ok) { restoreButton(b); $("oMsg") && ($("oMsg").innerHTML = '<div class="msg err">' + esc(errText(r)) + "</div>"); return; } orderChanged(r.body.order, r.body.next); flashOk(t("已保存。", "Saved."), 2000); });
      });
    });
    pb.querySelectorAll("button[data-seat-code]").forEach(function (b) {
      b.addEventListener("click", function () { savingButton(b); post("crm/seat", "POST", { orderId: o.orderId, code: b.getAttribute("data-seat-code"), waitlist: false }).then(function (r) { if (!r.ok) { restoreButton(b); $("oMsg") && ($("oMsg").innerHTML = '<div class="msg err">' + esc(errText(r)) + "</div>"); return; } flashOk(t("已递补：请通知家长。", "Seated: tell the family."), 3000); drawOrderPanel(r.body.order, next); }); });
    });
    pb.querySelectorAll("button[data-to]").forEach(function (b) {
      b.addEventListener("click", function () {
        var to = b.getAttribute("data-to");
        if (to === "cancelled" && !window.confirm(t("取消订单 " + o.orderId + "？", "Cancel order " + o.orderId + "?"))) return;
        savingButton(b);
        post("crm/order", "PATCH", { orderId: o.orderId, status: to, note: $("oNote").value.trim() }).then(function (r) {
          if (!r.ok) {
            restoreButton(b);
            $("oMsg").innerHTML = '<div class="msg err">' + esc(r.body && r.body.error === "changed_meanwhile" ? t("别人刚改过这单，已重新载入。", "Someone else just changed this order; reloaded.") : errText(r)) + "</div>";
            if (r.body && r.body.error === "changed_meanwhile") loadOrders(true).then(function () { renderOrders(); openOrderPanel(o.orderId); });
            return;
          }
          var upd = r.body.order;
          orderChanged(upd, r.body.next);
          flashOk("<b>" + esc(upd.orderId) + "</b> → " + stTag(upd.status));
        });
      });
    });
  }

  // 教材订单: the Equip (EquipMe) textbook orders, read from Airtable by the nightly sync
