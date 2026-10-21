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
          (it.cancelled ? '<span class="tag muted">' + t("已停开", "Cancelled") + (it.cancelled.reason ? " · " + esc(it.cancelled.reason) : "") + "</span>" : "") +
          (it.waitlist ? '<span class="tag warn">' + t("候补", "Waitlist") + "</span>" : "") +
          (it.prereq && it.prereq.met === "none" ? '<span class="tag warn">' + t("前置课程未确认", "Prerequisite not confirmed") + "</span>" : "") +
          // v3: the child is named after checkout — here, from the profile's children or typed
          (o.canNameChild && !it.cancelled ? '<span class="sub"><button type="button" class="btn secondary sm" data-child="' + esc(o.orderId) + '" data-code="' + esc(it.code) + '">' + (it.child && it.child.name ? t("更换学生", "Change student") : t("指定学生…", "Name the student…")) + "</button></span>" : "") +
          '</div><div class="oprice">' + (it.priceTbd ? '<span class="muted">' + t("价格待定", "Price TBD") + "</span>" : esc(moMoney(it.price, o.currency))) + "</div></div>";
      }).join("");
      return '<div class="card mocard" data-order="' + esc(o.orderId) + '"><div class="ch"><h2>' + esc(o.orderId) + " " + moTag(o.status) + "</h2><div class=\"actions\">" +
        (o.canConfirmPay ? '<button type="button" class="btn sm" data-paid="' + esc(o.orderId) + '">' + t("我已付款", "I have paid") + "</button>" : "") +
        (o.needsChild ? '<span class="tag warn" title="' + esc(t("请为每门课指定上课的孩子：成绩单和老师的名单都挂在孩子名下", "Name the child for each course: transcripts and the class list hang on the child")) + '">' + t("待指定学生", "Student to name") + "</span>" : "") +
        (o.canCancel ? '<button type="button" class="btn secondary sm danger" data-cancel="' + esc(o.orderId) + '">' + t("取消订单", "Cancel") + "</button>" : "") + "</div></div>" +
        '<div class="kv"><span class="k">' + t("提交时间", "Submitted") + "</span><span>" + esc(when(o.submittedAt)) + "</span>" +
          (o.expiresAt ? '<span class="k">' + t("付款期限", "Pay by") + "</span><span>" + esc(day(o.expiresAt)) + ' <span class="faint">' + t("（到期未付款的订单自动关闭，到期前 3 天会邮件提醒；需要更多时间请联系课程提供方）", "(an unpaid order closes after this date, with an email reminder 3 days before; ask the provider for more time)") + "</span></span>" : "") +
          '<span class="k">' + t("课程提供方", "Provider") + "</span><span>" + esc((o.hives || []).map(function (h) { return h.name || h.abbr || h.key; }).filter(Boolean).join("; ") || "—") + "</span>" +
          '<span class="k">' + t("联系邮箱", "Email") + "</span><span>" + esc(o.email || "—") + "</span>" + moFee(o) +
          ((o.proof || []).length ? '<span class="k">' + t("付款凭证", "Payment proof") + "</span><span>" + o.proof.map(function (pf) { return '<a href="/api/me/proof?orderId=' + encodeURIComponent(o.orderId) + "&i=" + pf.i + '" target="_blank" rel="noopener">' + esc(pf.name || t("凭证 ", "proof ") + pf.i) + "</a>"; }).join(" · ") + "</span>" : "") +
          (o.notify && !o.notify.ok && !o.notify.pending ? '<span class="k">' + t("通知", "Notification") + '</span><span><span class="tag bad">' + t("确认邮件未送达", "Confirmation not delivered") + "</span></span>" : "") + "</div>" +
        '<div class="olist">' + items + '</div><div class="ototal">' + t("合计", "Total") + " " + esc(moMoney(o.totalPrice, o.currency)) + "</div>" +
        '<p class="sub mostep">' + esc(moNextStep(o)) + "</p></div>";
    }).join("");
    $("mobody").querySelectorAll("button[data-cancel]").forEach(function (b) {
      b.addEventListener("click", function () {
        var id = b.getAttribute("data-cancel");
        if (!window.confirm(t("取消订单 " + id + "？座位会释放给候补的家庭。", "Cancel order " + id + "? The seat goes to the next family."))) return;
        savingButton(b, t("取消中…", "Cancelling…"));
        post("me/orders", "PATCH", { orderId: id, status: "cancelled" }).then(function (r) {
          if (!r.ok) { restoreButton(b); flash(esc(r.status === 409 ? t("订单已进入下一步，请联系课程提供方或蜂巢取消。", "The order has moved on; ask the provider or Hive to cancel it.") : errText(r)), 5000); return; }
          moState.list = moState.list.map(function (x) { return x.orderId === id ? r.body.order : x; });
          renderMyOrders(); flashOk(t("已取消。", "Cancelled."));
        });
      });
    });
    // 我已付款 (stage 2): the family's half of the two-sided payment confirmation; the provider's 已收款 closes it
    $("mobody").querySelectorAll("button[data-paid]").forEach(function (b) {
      b.addEventListener("click", function () { moPaidForm(b.getAttribute("data-paid")); });
    });
    $("mobody").querySelectorAll("button[data-child]").forEach(function (b) {
      b.addEventListener("click", function () { moChildForm(b.getAttribute("data-child"), b.getAttribute("data-code")); });
    });
  }
  // 我已付款 with an optional screenshot of the transfer (≤ 2 MB): the provider sees it beside the order, and it is what
  // lets Hive confirm receipt if the provider stays silent (v3)
  function moPaidForm(id) {
    var card = $("mobody").querySelector('.mocard[data-order="' + id + '"]'); if (!card || card.querySelector(".mopaid")) return;
    var box = document.createElement("div"); box.className = "mopaid";
    box.innerHTML = '<h4>' + t("我已付款", "I have paid") + '</h4><p class="sub">' + t("确认已向课程提供方付清本单课程费。可附上转账截图（可选，≤ 2 MB），机构确认收款后状态会更新为「已收款」。", "Confirm you have paid the provider the course fee for this order. You may attach a screenshot of the transfer (optional, ≤ 2 MB); the status becomes “Payment received” once the provider confirms.") + "</p>" +
      '<label class="f">' + t("备注（可选）", "Note (optional)") + '<input type="text" class="mopNote" maxlength="200" placeholder="' + esc(t("例如：微信转账 10 月 21 日", "e.g. WeChat transfer on 21 Oct")) + '" /></label>' +
      '<label class="f">' + t("付款截图（可选）", "Screenshot (optional)") + '<input type="file" class="mopFile" accept="image/jpeg,image/png,image/webp,application/pdf" /></label>' +
      '<div class="actions"><button type="button" class="btn mopGo">' + t("确认已付款", "Confirm payment") + '</button><button type="button" class="btn secondary mopNo">' + t("取消", "Cancel") + '</button></div><div class="mopMsg"></div>';
    card.appendChild(box);
    box.querySelector(".mopNo").addEventListener("click", function () { box.remove(); });
    box.querySelector(".mopGo").addEventListener("click", function () {
      var go = this, f = box.querySelector(".mopFile").files[0], note = box.querySelector(".mopNote").value.trim();
      if (f && f.size > 2 * 1024 * 1024) { box.querySelector(".mopMsg").innerHTML = '<div class="msg err">' + t("截图超过 2 MB，请压缩后再传。", "The screenshot is over 2 MB; please shrink it.") + "</div>"; return; }
      var send = function (proof) {
        savingButton(go, t("提交中…", "Sending…"));
        post("me/orders", "PATCH", { orderId: id, status: "parent_paid", note: note, proof: proof }).then(function (r) {
          if (!r.ok) { restoreButton(go); box.querySelector(".mopMsg").innerHTML = '<div class="msg err">' + esc(r.status === 409 ? t("订单已进入下一步。", "The order has already moved on.") : r.status === 413 ? t("截图太大。", "The screenshot is too large.") : errText(r)) + "</div>"; return; }
          moState.list = moState.list.map(function (x) { return x.orderId === id ? r.body.order : x; });
          renderMyOrders(); flashOk(t("已记录，等待机构确认收款。", "Recorded; waiting for the provider to confirm."));
        });
      };
      if (!f) return send(null);
      var rd = new FileReader(); rd.onload = function () { send({ name: f.name, type: f.type, data: String(rd.result).replace(/^data:[^,]*,/, "") }); }; rd.readAsDataURL(f);
    });
  }
  // the child a course is for: one of the profile's children, or a new name + grade (v3: named after checkout)
  function moChildForm(id, code) {
    var card = $("mobody").querySelector('.mocard[data-order="' + id + '"]'); if (!card) return;
    var old = card.querySelector(".mochild"); if (old) old.remove();
    var kids = ((me && me.hive && me.hive.extra && me.hive.extra.children) || []).filter(function (k) { return k && String(k.name || "").trim(); });
    var grades = ["学前", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];
    var box = document.createElement("div"); box.className = "mochild";
    box.innerHTML = '<h4>' + t("上课的学生", "The student") + ' · ' + esc(code) + "</h4>" +
      (kids.length ? '<label class="f">' + t("我的孩子", "My children") + '<select class="mocPick"><option value="">' + t("选择…", "Choose…") + "</option>" + kids.map(function (k, i) { return '<option value="' + i + '">' + esc(k.name + (k.grade ? " · " + (k.grade === "学前" ? t("学前", "Pre-K") : t(k.grade + " 年级", "Grade " + k.grade)) : "")) + "</option>"; }).join("") + '<option value="other">' + t("其他孩子…", "Another child…") + "</option></select></label>" : "") +
      '<div class="mocNew"' + (kids.length ? " hidden" : "") + '><label class="f">' + t("姓名", "Name") + '<input type="text" class="mocName" maxlength="40" /></label><label class="f">' + t("年级", "Grade") + '<select class="mocGrade"><option value="">' + t("年级…", "Grade…") + "</option>" + grades.map(function (g) { return '<option value="' + g + '">' + esc(g === "学前" ? t("学前", "Pre-K") : t(g + " 年级", "Grade " + g)) + "</option>"; }).join("") + "</select></label></div>" +
      '<div class="actions"><button type="button" class="btn mocGo">' + t("保存", "Save") + '</button><button type="button" class="btn secondary mocNo">' + t("取消", "Cancel") + '</button></div><div class="mocMsg"></div>';
    card.appendChild(box);
    var pick = box.querySelector(".mocPick");
    if (pick) pick.addEventListener("change", function () { box.querySelector(".mocNew").hidden = this.value !== "other"; });
    box.querySelector(".mocNo").addEventListener("click", function () { box.remove(); });
    box.querySelector(".mocGo").addEventListener("click", function () {
      var go = this, child;
      if (pick && pick.value !== "" && pick.value !== "other") { var k = kids[Number(pick.value)]; child = { name: k.name, grade: k.grade || "", account: k.account || "" }; }
      else child = { name: box.querySelector(".mocName").value.trim(), grade: box.querySelector(".mocGrade").value, account: "" };
      if (!child.name) { box.querySelector(".mocMsg").innerHTML = '<div class="msg err">' + t("请填写学生姓名。", "Please enter the student's name.") + "</div>"; return; }
      savingButton(go);
      post("me/orders", "PATCH", { orderId: id, code: code, child: child }).then(function (r) {
        if (!r.ok) { restoreButton(go); box.querySelector(".mocMsg").innerHTML = '<div class="msg err">' + esc(errText(r)) + "</div>"; return; }
        moState.list = moState.list.map(function (x) { return x.orderId === id ? r.body.order : x; });
        renderMyOrders(); flashOk(t("已保存。", "Saved."));
      });
    });
  }
  // what happens next, in the family's words
  function moNextStep(o) {
    switch (o.status) {
      case "pending_fee": return t("付清选课费后订单才会送达课程提供方。", "The order reaches the provider once the selection fee is paid.");
      case "submitted": return t("课程提供方会与您联系，介绍课程并确认报名；课程费直接付给课程提供方，付款后请点「我已付款」。", "The provider will contact you about the course and enrolment; the course fee is paid to the provider directly — click “I have paid” once it is done.");
      case "confirmed": case "contacted": return t("请与课程提供方完成咨询和缴费，付款后点「我已付款」。", "Please complete the consultation and payment with the provider, then click “I have paid”.");
      case "parent_paid": return t("等待课程提供方确认收款。", "Waiting for the provider to confirm the payment.");
      case "paid": return o.needsChild ? t("已缴费。请为每门课指定上课的孩子（「指定学生…」），老师的名单和成绩单都挂在孩子名下。", "Paid. Please name the child for each course (“Name the student…”); the class list and transcript hang on the child.") : t("已缴费，等待开课。", "Paid; waiting for the course to start.");
      case "started": return t("课程已开始。", "The course has started.");
      case "expired": return t("付款期限已过，订单已自动取消。如仍想报名，请重新选课或联系课程提供方。", "The payment deadline passed and the order was cancelled. To enrol after all, select the course again or contact the provider.");
      default: return "";
    }
  }
