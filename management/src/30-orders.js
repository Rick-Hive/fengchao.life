// management/src/30-orders.js — 经营 › 订单: the website's course orders, status flow, order panel.
// Part of management.js: scripts/build-management.js concatenates management/src/*.js in name order
// into management/management.js (one closure; every part sees every other's functions). Edit here, not the built file.

  // ================================================================================
  // 经营 › 订单 (CRM design §6, Rick 2026-10-06): the website's course orders, stored by
  // api/order at checkout, with their status and fulfilment record. Who sees what is the
  // server's business (api/crm masks by role); the page only hides the buttons a reader
  // cannot use. Overdue rules (decision 18): submitted > 7 d, confirmed > 14 d, paid > 30 d.
  // ================================================================================
  var ORDER_TABS = [["all", "全部", "All"], ["submitted", "已提交", "Submitted"], ["confirmed", "已确认", "Confirmed"], ["paid", "已付款", "Paid"], ["started", "已开课", "Started"], ["cancelled", "已取消", "Cancelled"], ["overdue", "超期", "Overdue"], ["notifyFailed", "通知失败", "Notification failed"]];
  var ORDER_ST = { submitted: ["已提交", "Submitted", "accent"], confirmed: ["已确认", "Confirmed", "accent"], paid: ["已付款", "Paid", "ok"], started: ["已开课", "Started", "ok"], cancelled: ["已取消", "Cancelled", "muted"] };
  var ORDER_VERB = { confirmed: ["确认接单", "Confirm"], paid: ["标记已付款", "Mark paid"], started: ["标记已开课", "Mark started"], cancelled: ["取消订单", "Cancel order"], submitted: ["重新打开", "Reopen"] };
  var ordersState = { list: null, counts: {}, tab: "all", q: "", access: {} };
  function crmLevel(domain) { return (me && me.crm && me.crm[domain]) || "none"; }
  function canSeeRoyalty() { return crmLevel("money") === "rw" || hasFn("ceo"); }
  function canSeeOrders() { return crmLevel("orders") !== "none"; }
  function stTag(status) { var d = ORDER_ST[status] || [status, status, ""]; return '<span class="tag ' + d[2] + '">' + esc(t(d[0], d[1])) + "</span>"; }
  function money(v, cur) { if (v === null || v === undefined) return '<span class="muted">' + t("不可见", "hidden") + "</span>"; return esc((cur === "CNY" || !cur ? "¥" : cur + " ") + Number(v).toLocaleString(EN ? "en-US" : "zh-CN")); }
  function overdueTag(o) {
    if (!o.overdue) return "";
    var r = o.overdue;
    return '<span class="tag warn" title="' + esc(t("在「" + t(ORDER_ST[r.rule][0], ORDER_ST[r.rule][1]) + "」已停留 " + r.days + " 天（上限 " + r.limit + " 天）", "In “" + t(ORDER_ST[r.rule][0], ORDER_ST[r.rule][1]) + "” for " + r.days + " days (limit " + r.limit + ")")) + '">' + esc(t("超期 " + r.days + " 天", r.days + " d overdue")) + "</span>";
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
    var hiveTab = location.hash.indexOf("#/ops/orders/hive") === 0;
    $("content").innerHTML = '<div class="pagetabs compact" role="tablist">' +
      '<a class="ptab' + (hiveTab ? "" : " on") + '" role="tab" aria-selected="' + !hiveTab + '" href="#/ops/orders" title="EquipMe · Airtable">' + t("Equip教材订单", "Equip textbook orders") + "</a>" +
      '<a class="ptab' + (hiveTab ? " on" : "") + '" role="tab" aria-selected="' + hiveTab + '" href="#/ops/orders/hive" title="fengchao.life">' + t("蜂巢课程订单", "Hive course orders") + "</a></div><div id=\"opsBody\"></div>";
    if (hiveTab) viewCourseOrders(); else viewEquipOrders();
  }
  function viewCourseOrders() {
    setTitle(t("经营 › 订单", "Operations › Orders"), t("蜂巢课程订单", "Hive course orders"), '<button class="btn secondary sm" id="oReload">' + t("刷新", "Refresh") + '</button> <button class="btn secondary sm" id="oCsv">' + t("导出 CSV", "Export CSV") + "</button>",
      // The Teams import buttons are gone (Rick, 2026-10-08: 「不需要有"从Teams中读取订单"选项」; the
      // Hive Orders history is test data, decision of 2026-10-08). The endpoints stay; the handlers below are inert without the buttons.
      t("网站下单的课程订单，下单即记录；状态由订单经理维护，每一步都留有记录。超期未推进的单会标出。", "Course orders from the website, recorded at checkout; the order manager maintains the status and every step is kept. Orders that stall are flagged."));
    $("opsBody").innerHTML =
      '<div class="toolbar" id="obar">' + ORDER_TABS.map(function (tb) { return '<button class="chip" data-f="' + tb[0] + '" aria-pressed="' + (ordersState.tab === tb[0]) + '">' + esc(t(tb[1], tb[2])) + ' <span class="cnt" data-cnt="' + tb[0] + '"></span></button>'; }).join("") +
        '<span class="spacer"></span><div class="search">' + ICON.search + '<input type="search" id="oq" value="' + esc(ordersState.q) + '" placeholder="' + t("搜索订单号、邮箱、蜂巢、课程…", "Search order no., email, hive, course…") + '" /></div></div>' +
      '<div class="kpis compact" id="okpi"></div>' +
      '<div class="tbl-wrap"><table class="data" id="otable"><thead><tr><th>' + t("订单号", "Order no.") + "</th><th>" + t("日期", "Date") + "</th><th>" + t("下单人", "Ordered by") + "</th><th>" + t("蜂巢", "Hive") + "</th><th>" + t("课程", "Courses") + "</th><th>" + t("金额", "Amount") + "</th><th>" + t("状态", "Status") + "</th><th>" + t("提醒", "Flags") + "</th></tr></thead>" +
        '<tbody><tr><td colspan="8" class="loading">' + t("载入中…", "Loading…") + "</td></tr></tbody></table></div>" +
      '<p class="muted" id="ofoot" style="font-size:.8rem"></p>';
    $("obar").addEventListener("click", function (e) {
      var c = e.target.closest(".chip[data-f]"); if (!c) return;
      ordersState.tab = c.getAttribute("data-f");
      $("obar").querySelectorAll(".chip").forEach(function (x) { x.setAttribute("aria-pressed", x === c ? "true" : "false"); });
      renderOrders();
    });
    $("oq").addEventListener("input", debounce(function () { ordersState.q = $("oq").value.trim(); renderOrders(); }, 120));
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
      ordersState.tab = k.getAttribute("data-kf");
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
      ordersState.list = r.body.orders || []; ordersState.counts = r.body.counts || {}; ordersState.access = r.body.access || {};
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
    var seeMoney = crmLevel("money") !== "none";
    var sum = month.reduce(function (s, o) { return s + (typeof o.totalPrice === "number" ? o.totalPrice : 0); }, 0);
    $("okpi").innerHTML =
      '<button class="kpi" data-kf="all"><div class="l">' + t("本月订单", "Orders this month") + '</div><div class="v">' + month.length + "</div></button>" +
      (seeMoney ? '<div class="kpi"><div class="l">' + t("本月成交额（Hive 课程）", "Transaction value this month (Hive courses)") + '</div><div class="v">' + money(sum, "CNY") + '</div><div class="s">' + t("只在仪表盘显示，不与教材销售合计", "Dashboard only; never summed with textbook sales") + "</div></div>" : "") +
      '<button class="kpi" data-kf="submitted"><div class="l">' + t("待确认", "Awaiting confirmation") + '</div><div class="v' + (c.submitted ? " warn" : "") + '">' + (c.submitted || 0) + "</div></button>" +
      '<button class="kpi" data-kf="confirmed"><div class="l">' + t("待付款", "Awaiting payment") + '</div><div class="v">' + (c.confirmed || 0) + "</div></button>" +
      '<button class="kpi" data-kf="overdue"><div class="l">' + t("超期", "Overdue") + '</div><div class="v' + (c.overdue ? " bad" : "") + '">' + (c.overdue || 0) + "</div></button>" +
      '<button class="kpi" data-kf="notifyFailed"><div class="l">' + t("通知失败", "Notification failed") + '</div><div class="v' + (c.notifyFailed ? " bad" : "") + '">' + (c.notifyFailed || 0) + "</div></button>";
    var rows = ordersNow();
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
        '<td class="nowrap"><span class="tags">' + overdueTag(o) + (o.notify && o.notify.ok === false && !o.notify.pending ? '<span class="tag bad">' + t("通知失败", "Not notified") + "</span>" : "") + "</span></td></tr>";
    }).join("") : '<tr><td colspan="8" class="empty">' + t("没有符合条件的订单。", "No orders match.") + "</td></tr>";
    $("ofoot").textContent = t("显示 ", "Showing ") + rows.length + " / " + list.length + t(" 单", " orders") + (list.length ? "" : t("。网站还没有新订单落库。", ". No orders have been recorded from the website yet."));
  }
  function exportOrdersCsv() {
    var cell = function (v) { v = String(v == null ? "" : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var head = [t("订单号", "Order no."), t("提交时间", "Submitted"), t("下单人", "Email"), "Teams", t("蜂巢", "Hive"), t("课程", "Courses"), t("件数", "Items"), t("金额", "Amount"), t("币种", "Currency"), t("状态", "Status"), t("最后变更", "Last change"), t("超期", "Overdue")].join(",");
    var lines = ordersNow().map(function (o) {
      var last = (o.history || [])[o.history.length - 1] || {};
      return [o.orderId, o.submittedAt, o.email, o.teamsAccount, orderHives(o), orderCourses(o).join("; "), o.itemCount, o.totalPrice == null ? "" : o.totalPrice, o.currency, t(ORDER_ST[o.status][0], ORDER_ST[o.status][1]), last.at || "", o.overdue ? o.overdue.days : ""].map(cell).join(",");
    });
    var blob = new Blob(["﻿" + [head].concat(lines).join("\r\n")], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "hive-orders-" + new Date().toISOString().slice(0, 10) + ".csv"; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }
  function openOrderPanel(id) {
    var o = (ordersState.list || []).filter(function (x) { return x.orderId === id; })[0];
    if (!o) return;
    var rw = crmLevel("orders") === "rw";
    panelOpen('<div class="ph"><h3>' + esc(o.orderId) + "</h3>" + stTag(o.status) + '<button class="x" type="button" aria-label="close">✕</button></div><div class="pb"><div class="loading">' + t("载入中…", "Loading…") + "</div></div>");
    api("crm/order?id=" + encodeURIComponent(id)).then(function (r) {
      if (!r.ok) { $("panel").querySelector(".pb").innerHTML = '<div class="msg err">' + esc(errText(r)) + "</div>"; return; }
      drawOrderPanel(r.body.order, rw ? r.body.next || [] : []);
    });
  }
  function drawOrderPanel(o, next) {
    var pb = $("panel").querySelector(".pb");
    $("panel").querySelector(".ph h3").textContent = o.orderId;
    var hdrTag = $("panel").querySelector(".ph .tag"); if (hdrTag) hdrTag.outerHTML = stTag(o.status);
    var items = (o.items || []).map(function (it) {
      return '<div class="orow"><div class="omain"><b>' + esc(EN ? (it.nameEn || it.nameZh) : (it.nameZh || it.nameEn)) + '</b><span class="sub">' + esc([it.code, it.schoolAbbr || it.schoolName, side(it.classType), side(it.language), (it.grades || []).join("/")].filter(Boolean).join(" · ")) + "</span></div><div class=\"oprice\">" + (it.priceTbd ? '<span class="muted">' + t("价格待定", "Price TBD") + "</span>" : money(it.price, o.currency)) + "</div></div>";
    }).join("");
    var hist = (o.history || []).slice().reverse().map(function (h) {
      return '<div class="hrow"><span class="hat">' + esc(when(h.at)) + '<span class="hwho">' + esc(h.by === "system" ? t("系统", "system") : h.by) + "</span></span><span>" + (h.from ? stTag(h.from) + " → " : "") + stTag(h.to) + (h.note ? '<span class="hnote">' + esc(h.note) + "</span>" : "") + "</span></div>";
    }).join("");
    var notify = o.notify || {};
    var notifyLine = notify.pending ? '<span class="tag">' + t("通知发送中", "Notifying…") + "</span>" : notify.ok ? '<span class="tag ok">' + t("已通知", "Notified") + "</span> " + esc(when(notify.at)) : '<span class="tag bad">' + t("通知失败", "Notification failed") + "</span> " + esc(notify.error || "") + " · " + t("请手动联系家长和蜂巢。", "Contact the family and the hive by hand.");
    pb.innerHTML =
      '<div class="kv"><span class="k">' + t("提交时间", "Submitted") + "</span><span>" + esc(when(o.submittedAt)) + "</span>" +
        '<span class="k">' + t("下单人", "Email") + "</span><span>" + esc(o.email || "—") + "</span>" +
        (o.teamsAccount ? '<span class="k">Teams</span><span>' + esc(o.teamsAccount) + "</span>" : "") +
        '<span class="k">' + t("蜂巢", "Hive") + "</span><span>" + ((o.hives || []).length ? (o.hives || []).map(function (h) { return esc(h.name || h.abbr || h.key) + (h.subtotal != null ? " · " + money(h.subtotal, o.currency) : ""); }).join("; ") : esc(orderHives(o))) + "</span>" +
        (o.track && (o.track.nameZh || o.track.nameEn) ? '<span class="k">' + t("毕业路径", "Track") + "</span><span>" + esc(EN ? (o.track.nameEn || o.track.nameZh) : (o.track.nameZh || o.track.nameEn)) + "</span>" : "") +
        '<span class="k">' + t("语言", "Language") + "</span><span>" + (o.lang === "en" ? "English" : "中文") + "</span>" +
        '<span class="k">' + t("通知", "Notification") + "</span><span>" + notifyLine + "</span>" +
        (o.overdue ? '<span class="k">' + t("提醒", "Flag") + "</span><span>" + overdueTag(o) + "</span>" : "") + "</div>" +
      "<h4>" + t("课程", "Courses") + " · " + (o.itemCount || (o.items || []).length) + '</h4><div class="olist">' + items + '</div><div class="ototal">' + t("合计", "Total") + " " + money(o.totalPrice, o.currency) + "</div>" +
      (next.length ? "<h4>" + t("推进状态", "Move on") + '</h4><label class="f">' + t("备注（可选）", "Note (optional)") + '<input type="text" id="oNote" maxlength="500" placeholder="' + t("例如：提供方已接单；家长已转账", "e.g. provider accepted; parent has paid") + '" /></label>' +
        '<div class="actions">' + next.map(function (s) { return '<button class="btn' + (s === "cancelled" ? " danger" : s === "submitted" ? " secondary" : "") + '" type="button" data-to="' + s + '">' + esc(t(ORDER_VERB[s][0], ORDER_VERB[s][1])) + "</button>"; }).join("") + '</div><div id="oMsg"></div>' : "") +
      "<h4>" + t("执行记录", "Fulfilment record") + '</h4><div class="hist">' + hist + "</div>";
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
          ordersState.list = (ordersState.list || []).map(function (x) { return x.orderId === upd.orderId ? upd : x; });
          loadOrders(true).then(renderOrders);
          drawOrderPanel(upd, r.body.next || []);
          flashOk("<b>" + esc(upd.orderId) + "</b> → " + stTag(upd.status));
        });
      });
    });
  }

  // 教材订单: the Equip (EquipMe) textbook orders, read from Airtable by the nightly sync
