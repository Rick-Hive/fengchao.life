// management/src/28-hive.js — 蜂巢课程 › 概览 / Hive Courses › Overview (v3 第二批 ③, Rick 2026-10-21).
// The landing page of a course provider's leader (蜂巢课程负责人 — the explicit provider:<key> role, or a school's
// education leader for its own hive): four numbers, each a door to the page where it is acted on —
// orders to contact, payments to confirm, courses still to complete, classes below their minimum.
// Counted from the same endpoints those pages read (crm/orders, crm/classes, courses/list), filtered to the hives
// the account leads, so a Hive staff member who also leads a hive sees only that hive here.
// Part of management.js: scripts/build-management.js concatenates management/src/*.js in name order.

  function viewHiveOverview() {
    var hives = providerHives(), keys = hives.map(function (h) { return h.key; });
    setTitle(t("蜂巢课程", "Hive Courses"), t("概览", "Overview"), "",
      { info: t("您负责的机构在蜂巢里的待办：待联系的订单、待确认的收款、待完善的课程、未达开班人数的班。点一块数字进入对应页面。", "What your institution has to act on in Hive: orders to contact, payments to confirm, courses to complete, classes below their minimum. Click a number to go to its page.") });
    $("content").innerHTML =
      '<div class="hvhead sub">' + esc(hives.map(function (h) { return h.name || h.abbr || h.key; }).join(" · ")) + "</div>" +
      '<div class="kpis" id="hvkpi"><div class="loading">' + t("载入中…", "Loading…") + "</div></div>" +
      '<div id="hvbody"></div>';
    var ofMine = function (o) { return (o.hives || []).some(function (h) { return keys.indexOf(h.key) >= 0; }); };
    Promise.all([api("crm/orders"), api("crm/classes"), api("courses/list")]).then(function (rs) {
      var orders = rs[0].ok ? (rs[0].body.orders || []).filter(ofMine) : null;
      var classes = rs[1].ok ? (rs[1].body.classes || []).filter(function (c) { return keys.indexOf(hiveKeyJs(c.school)) >= 0; }) : null;
      var courses = rs[2].ok ? (rs[2].body.courses || []).filter(function (c) { return c.owned || keys.indexOf(hiveKeyJs(c.school)) >= 0; }) : null;
      if (rs[2].ok) coursesInfo = rs[2].body;
      var toContact = orders ? orders.filter(function (o) { return o.status === "submitted"; }) : [];
      var toConfirm = orders ? orders.filter(function (o) { return o.status === "parent_paid"; }) : [];
      var overdue = orders ? orders.filter(function (o) { return o.overdue; }) : [];
      var toComplete = courses ? courses.filter(function (c) { return c.status !== "published" && c.status !== "submitted" && c.status !== "reviewing"; }) : [];
      var pending = courses ? courses.filter(function (c) { return c.status === "submitted" || c.status === "reviewing"; }) : [];
      var belowMin = classes ? classes.filter(function (c) { return c.belowMin; }) : [];
      var full = classes ? classes.filter(function (c) { return c.state === "full"; }) : [];
      var tile = function (hash, tab, label, n, warn, sub) { return '<button class="kpi" data-go="' + esc(hash) + '" data-tab="' + esc(tab || "") + '"><div class="l">' + esc(label) + '</div><div class="v' + (warn && n ? " warn" : "") + '">' + n + "</div>" + (sub ? '<div class="s">' + esc(sub) + "</div>" : "") + "</button>"; };
      $("hvkpi").innerHTML =
        tile("#/ops/orders/hive", "submitted", t("待联系订单", "Orders to contact"), orders ? toContact.length : "—", true, orders ? t("提交后 14 天内联系家长", "Contact the family within 14 days") : t("无法读取订单", "Orders not readable")) +
        tile("#/ops/orders/hive", "parent_paid", t("待确认收款", "Payments to confirm"), orders ? toConfirm.length : "—", true, t("家长已付款，请核对后点「已收款」", "The family has paid; verify and click “Payment received”")) +
        tile("#/courses", "draft", t("待完善课程", "Courses to complete"), courses ? toComplete.length : "—", true, courses ? (pending.length ? t("另有 " + pending.length + " 门待审批", pending.length + " awaiting approval") : t("未发布、编辑中或被退回的课", "Unpublished, in editing or returned")) : t("无法读取课程", "Courses not readable")) +
        tile("#/ops/orders/classes", "", t("未达开班人数", "Below minimum"), classes ? belowMin.length : "—", true, classes ? (full.length ? t("另有 " + full.length + " 门已满", full.length + " full") : t("按已确认（已收款）人数算", "Counted on confirmed (paid) seats")) : t("无法读取班级人数", "Class sizes not readable")) +
        tile("#/ops/orders/hive", "overdue", t("超期订单", "Overdue orders"), orders ? overdue.length : "—", true, t("超过承诺时限仍未推进", "Past the promised time without moving on"));
      // the lists behind the numbers, short
      var row = function (o) { return '<div class="orow"><div class="omain"><b>' + esc(o.orderId) + "</b> " + stTag(o.status) + '<span class="sub">' + esc(day(o.submittedAt)) + " · " + esc((o.items || []).map(function (it) { return EN ? it.nameEn || it.nameZh : it.nameZh || it.nameEn; }).join("、")) + "</span></div></div>"; };
      $("hvbody").innerHTML =
        (toContact.length ? '<section class="card"><header class="ch"><h2>' + t("待联系", "To contact") + '</h2></header><div class="olist">' + toContact.slice(0, 8).map(row).join("") + "</div></section>" : "") +
        (toConfirm.length ? '<section class="card"><header class="ch"><h2>' + t("待确认收款", "Payments to confirm") + '</h2></header><div class="olist">' + toConfirm.slice(0, 8).map(row).join("") + "</div></section>" : "") +
        (belowMin.length ? '<section class="card"><header class="ch"><h2>' + t("未达开班人数", "Below minimum") + '</h2></header><div class="olist">' + belowMin.slice(0, 8).map(function (c) { return '<div class="orow"><div class="omain"><b>' + esc(EN ? c.nameEn || c.nameZh : c.nameZh || c.nameEn) + '</b><span class="sub">' + esc(c.code) + " · " + t("已确认 " + (c.confirmed != null ? c.confirmed : c.taken) + " / 最少 " + c.min, (c.confirmed != null ? c.confirmed : c.taken) + " confirmed / min " + c.min) + "</span></div></div>"; }).join("") + "</div></section>" : "") +
        (!toContact.length && !toConfirm.length && !belowMin.length && orders ? '<p class="muted">' + t("没有待办。", "Nothing to do.") + "</p>" : "");
      $("hvkpi").addEventListener("click", function (e) {
        var b = e.target.closest("button[data-go]"); if (!b) return;
        var tab = b.getAttribute("data-tab"), hash = b.getAttribute("data-go");
        if (hash === "#/courses") { co.tab = tab || "all"; location.hash = tab && tab !== "all" ? "#/courses/" + tab : "#/courses"; return; }
        if (tab) { ordersState.tab = tab; pageReset("orders"); }
        location.hash = hash;
      });
    });
  }
  // hive.hiveKey() as the server computes it (api/shared/hive.js): letters, digits and Chinese, upper-cased, 12 at most
  function hiveKeyJs(raw) { return String(raw || "").toUpperCase().replace(/[^A-Z0-9一-鿿]/g, "").slice(0, 12); }
