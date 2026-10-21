// management/src/23-myorders.js — 我的账号 › 我的订单: the orders filed under the signed-in account (placed while signed
// in, or under one of the account's addresses). A family reads them in full and may take back one still only 已提交.
// Part of management.js: scripts/build-management.js concatenates management/src/*.js in name order
// into management/management.js (one closure; every part sees every other's functions). Edit here, not the built file.

  // ================================================================================
  // 我的订单 (design 2026-10-20: 「用户已经登录，订单自动归入该用户的账号下」)
  // ================================================================================
  var moState = { list: null, addresses: [] };
  // the statuses as a family reads them (the staff vocabulary is in 30-orders.js); the stage-2 statuses are already named
  var MO_ST = { pending_fee: ["待付选课费", "Awaiting selection fee", "warn"], submitted: ["已提交", "Submitted", "accent"], confirmed: ["机构已确认", "Confirmed by the provider", "accent"], contacted: ["机构沟通中", "Provider in touch", "accent"], parent_paid: ["已付款 · 待机构确认", "Paid · awaiting the provider", "accent"], paid: ["已收款", "Payment received", "ok"], started: ["已开课", "Started", "ok"], cancelled: ["已取消", "Cancelled", "muted"], expired: ["已过期", "Expired", "muted"] };
  function moTag(st) { var d = MO_ST[st] || [st, st, ""]; return '<span class="tag ' + d[2] + '">' + esc(t(d[0], d[1])) + "</span>"; }
  function moMoney(v, cur) { return v == null ? "—" : (cur === "CNY" || !cur ? "¥" : cur + " ") + Number(v).toLocaleString(EN ? "en-US" : "zh-CN"); }
  function moFee(o) {
    var f = o.fee; if (!f) return "";
    var amt = (f.currency || "usd").toUpperCase() + " " + (f.amount / 100).toFixed(2);
    var st = { unpaid: t("未付", "unpaid"), paid: t("已付", "paid"), waived: t("免收", "waived"), refunded: t("已退", "refunded") }[f.status] || f.status;
    return '<span class="k">' + t("选课费", "Selection fee") + "</span><span>" + esc(amt + " · " + st) + (f.receiptUrl ? ' · <a href="' + esc(f.receiptUrl) + '" target="_blank" rel="noopener">' + t("收据", "receipt") + "</a>" : "") + "</span>";
  }
  function viewMyOrders() {
    setTitle(t("我的账号", "My account"), t("我的订单", "My orders"), '<a class="btn sm" href="/" target="_blank" rel="noopener">' + t("去网站选课", "Select courses on the website") + "</a>",
      { info: t("记入本账号的订单：在网站或课程地图上下的单。已提交的单可自行取消；之后请联系课程提供方或蜂巢。", "Orders filed under this account, placed on the website or from the curriculum map. One still only submitted can be cancelled here; after that, contact the provider or Hive.") });
    // a toolbar row hosts the top action (the header rule: tabs and buttons share one row)
    $("content").innerHTML = '<div class="toolbar"><span class="muted" id="moCount"></span><span class="spacer"></span></div><div id="mobody"><div class="loading">' + t("载入中…", "Loading…") + "</div></div>";
    api("me/orders").then(function (r) {
      if (!r.ok) { $("mobody").innerHTML = '<div class="msg err">' + esc(errText(r)) + "</div>"; return; }
      moState.list = r.body.orders || []; moState.addresses = r.body.addresses || [];
      renderMyOrders();
    });
  }
  function renderMyOrders() {
    var list = moState.list || [];
    if ($("moCount")) $("moCount").textContent = list.length ? t(list.length + " 张订单", list.length + (list.length === 1 ? " order" : " orders")) : "";
    if (!list.length) { $("mobody").innerHTML = '<div class="card"><p class="sub">' + t("还没有订单。到课程地图或网站选课后，订单会出现在这里。", "No orders yet. Orders placed from the curriculum map or the website appear here.") + "</p></div>"; return; }
    $("mobody").innerHTML = list.map(function (o) {
      var items = (o.items || []).map(function (it) {
        return '<div class="orow"><div class="omain"><b>' + esc(EN ? (it.nameEn || it.nameZh) : (it.nameZh || it.nameEn)) + '</b><span class="sub">' + esc([it.code, it.schoolAbbr || it.schoolName, (it.grades || []).join("/")].filter(Boolean).join(" · ")) + "</span>" + childLine(it) +
          (it.waitlist ? '<span class="tag warn">' + t("候补", "Waitlist") + "</span>" : "") +
          (it.prereq && it.prereq.met === "none" ? '<span class="tag warn">' + t("前置课程未确认", "Prerequisite not confirmed") + "</span>" : "") +
          '</div><div class="oprice">' + (it.priceTbd ? '<span class="muted">' + t("价格待定", "Price TBD") + "</span>" : esc(moMoney(it.price, o.currency))) + "</div></div>";
      }).join("");
      return '<div class="card mocard" data-order="' + esc(o.orderId) + '"><div class="ch"><h2>' + esc(o.orderId) + " " + moTag(o.status) + "</h2>" +
        (o.canCancel ? '<button type="button" class="btn secondary sm danger" data-cancel="' + esc(o.orderId) + '">' + t("取消订单", "Cancel") + "</button>" : "") + "</div>" +
        '<div class="kv"><span class="k">' + t("提交时间", "Submitted") + "</span><span>" + esc(when(o.submittedAt)) + "</span>" +
          '<span class="k">' + t("课程提供方", "Provider") + "</span><span>" + esc((o.hives || []).map(function (h) { return h.name || h.abbr || h.key; }).filter(Boolean).join("; ") || "—") + "</span>" +
          '<span class="k">' + t("联系邮箱", "Email") + "</span><span>" + esc(o.email || "—") + "</span>" + moFee(o) +
          (o.notify && !o.notify.ok && !o.notify.pending ? '<span class="k">' + t("通知", "Notification") + '</span><span><span class="tag bad">' + t("确认邮件未送达", "Confirmation not delivered") + "</span></span>" : "") + "</div>" +
        '<div class="olist">' + items + '</div><div class="ototal">' + t("合计", "Total") + " " + esc(moMoney(o.totalPrice, o.currency)) + "</div>" +
        '<p class="sub mostep">' + esc(moNextStep(o)) + "</p></div>";
    }).join("");
    $("mobody").querySelectorAll("button[data-cancel]").forEach(function (b) {
      b.addEventListener("click", function () {
        var id = b.getAttribute("data-cancel");
        if (!window.confirm(t("取消订单 " + id + "？座位会释放给候补的家庭。", "Cancel order " + id + "? The seat goes to the next family."))) return;
        savingButton(b, t("取消中…", "Cancelling…"));
        post("me/orders", "PATCH", { orderId: id }).then(function (r) {
          if (!r.ok) { restoreButton(b); flash(esc(r.status === 409 ? t("订单已进入下一步，请联系课程提供方或蜂巢取消。", "The order has moved on; ask the provider or Hive to cancel it.") : errText(r)), 5000); return; }
          moState.list = moState.list.map(function (x) { return x.orderId === id ? r.body.order : x; });
          renderMyOrders(); flashOk(t("已取消。", "Cancelled."));
        });
      });
    });
  }
  // what happens next, in the family's words
  function moNextStep(o) {
    switch (o.status) {
      case "pending_fee": return t("付清选课费后订单才会送达课程提供方。", "The order reaches the provider once the selection fee is paid.");
      case "submitted": return t("课程提供方会与您联系，介绍课程并确认报名；课程费直接付给课程提供方。", "The provider will contact you about the course and enrolment; the course fee is paid to the provider directly.");
      case "confirmed": case "contacted": return t("请与课程提供方完成咨询和缴费。", "Please complete the consultation and payment with the provider.");
      case "parent_paid": return t("等待课程提供方确认收款。", "Waiting for the provider to confirm the payment.");
      case "paid": return t("已缴费，等待开课。", "Paid; waiting for the course to start.");
      case "started": return t("课程已开始。", "The course has started.");
      default: return "";
    }
  }
