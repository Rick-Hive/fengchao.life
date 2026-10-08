// management/src/37-equip.js — 经营 › 订单 › Equip教材订单: the sales picture; 录入 (customers, orders, 标收款) and the Equip order panel.
// Part of management.js: scripts/build-management.js concatenates management/src/*.js in name order
// into management/management.js (one closure; every part sees every other's functions). Edit here, not the built file.
  var equipState = { list: null, status: null, month: "" };
  var AIRTABLE_EQUIP_URL = "https://airtable.com/appae5kpY1qXn6XLq";
  // Equip教材订单: the orders themselves live in Airtable; this tab is the sales
  // picture Airtable does not draw (Rick, 2026-10-08: 「Need all kinds of reports,
  // diagrams」 / 「It's a CRM system, not an engineering system」): the month, the
  // school year against the last one, publishers, titles, subjects, grade bands,
  // new and returning customers. Money only for roles that may see it; others get
  // units and orders.
  function viewEquipOrders() {
    var canSync = isAdmin() || crmLevel("orders") === "rw";
    setTitle(t("经营 › 订单", "Operations › Orders"), t("Equip教材订单", "Equip textbook orders"),
      (crmLevel("orders") === "rw" ? '<button class="btn sm" id="eEntry">' + t("＋ 录入订单", "+ New order") + "</button> " : "") +
      (canSync ? '<button class="btn secondary sm" id="eSync">' + t("从 Airtable 同步", "Sync from Airtable") + "</button> " : "") +
      '<a class="btn secondary sm" id="eOpen" href="' + AIRTABLE_EQUIP_URL + '" target="_blank" rel="noopener">' + t("在 Airtable 中打开", "Open in Airtable") + ' ↗</a>',
      { info: t("EquipMe 教材的销售情况：所选月、本学年与上学年、出版社、教材、学科、年级段、新老客户。逐单查看与录入在 Airtable；管理中心每夜同步一份只读副本。", "How EquipMe textbooks are selling: the chosen month, this school year against the last, publishers, titles, subjects, grade bands, new and returning customers. Individual orders are viewed and entered in Airtable; the management centre syncs a read-only copy nightly.") });
    // The month picker sits in the tab row's right slot — no row of its own (Rick, 2026-10-08).
    var tr = $("tabsRight"); if (tr) tr.innerHTML = '<label class="inline">' + t("月份", "Month") + ' <select id="emonth" title="' + esc(t("指标与图表都以所选月为准；学年按所选月所在学年", "Tiles and charts follow the chosen month; the school year is the one it falls in")) + '"></select></label>';
    $("opsBody").innerHTML = (tr ? "" : '<div class="toolbar tight" id="ebar"><label class="inline">' + t("月份", "Month") + ' <select id="emonth"></select></label></div>') + '<div class="kpis strip" id="ekpi"></div><div class="vgrid" id="evgrid"><p class="loading">' + t("载入中…", "Loading…") + '</p></div><p class="muted" id="efoot" style="font-size:.8rem"></p>';
    $("emonth").addEventListener("change", function () { equipState.month = this.value; renderEquip(); });
    var sb = $("eSync");
    if (sb) sb.addEventListener("click", function () {
      savingButton(sb, t("同步中…", "Syncing…"));
      post("crm/sync", "POST", {}).then(function (r) {
        restoreButton(sb);
        if (!r.ok && r.body && r.body.error === "suspicious_drop") {
          // The guard refused: a table shrank by more than half. A system administrator may confirm the deletions are real.
          flash(esc(r.body.message) + (r.body.canForce ? ' <button type="button" class="btn sm" id="eqForce">' + t("删除属实，强制同步", "The deletions are real — force the sync") + "</button>" : ""), 60000);
          var fb = $("eqForce"); if (fb) fb.addEventListener("click", function () { fb.disabled = true; post("crm/sync", "POST", { force: true }).then(function (r2) { if (!r2.ok) { flash(esc(errText(r2)), 20000); return; } flashOk(t("已强制同步。", "Forced sync done."), 8000); loadEquip(true).then(renderEquip); }); });
          return;
        }
        if (!r.ok) { flash(r.body && r.body.error === "no_pat" ? t("还没有配置 Airtable 令牌（AIRTABLE_EQUIP_PAT）。", "The Airtable token (AIRTABLE_EQUIP_PAT) is not configured yet.") : r.body && r.body.error === "bad_pat" ? esc(r.body.message) : esc(errText(r)), 20000); return; }
        var st = (r.body && r.body.status) || {}, c = st.counts || {}, ppl = r.body && r.body.people;
        var summary = t("同步完成：", "Sync complete: ") + (c.orders || 0) + t(" 单订单、", " orders, ") + (c.items || 0) + t(" 条明细、", " line items, ") + (c.customers || 0) + t(" 位客户、", " customers, ") + (c.curriculums || 0) + t(" 条教材、", " textbooks, ") + (c.seminar || 0) + t(" 条讲座名单", " seminar rows") +
          (ppl ? t("；人员库 ", "; people hub ") + ppl.people + t(" 人", " people") : "");
        flashOk(esc(summary) + ((st.warnings || []).length ? " · " + esc(t("提示 " + st.warnings.length + " 条，见页脚", st.warnings.length + " notes, see the page footer")) : ""), 8000);
        peopleState.hub = null;
        loadEquip(true).then(renderEquip);
      });
    });
    var eb = $("eEntry"); if (eb) eb.addEventListener("click", openEntryPanel);
    loadEquip(false).then(renderEquip).catch(function (r) { $("evgrid").innerHTML = '<p class="msg err">' + esc(errText(r)) + "</p>"; });
  }
  // ---- 录入 (phase 4, §8: 建客户、建订单、加订单行、标收款 — written to Airtable, which stays the
  // system of record; the copy here and the people hub follow at once).
  var entryCat = null;
  function loadCatalogue() { if (entryCat) return Promise.resolve(entryCat); return api("crm/catalogue").then(function (r) { if (!r.ok) throw r; entryCat = r.body.skus || []; return entryCat; }); }
  function openEntryPanel() {
    var today = new Date().toISOString().slice(0, 10);
    panelOpen('<div class="ph"><h3>' + t("录入教材订单", "New textbook order") + '</h3><span class="tag">Airtable</span><button class="x" type="button" aria-label="close">✕</button></div><div class="pb"><form id="enf">' +
      "<h4>" + t("客户", "Customer") + '</h4><div class="search" style="margin-bottom:6px">' + ICON.search + '<input type="search" id="enQ" autocomplete="off" placeholder="' + t("搜索已有客户：姓名、邮箱、CRM ID", "Find an existing customer: name, email, CRM ID") + '" /></div><div id="enHits" class="olist hidden"></div>' +
      '<div id="enPicked" class="hint hidden"></div>' +
      '<label class="chk"><input type="checkbox" id="enNew" /> ' + t("新客户（Airtable 里还没有）", "New customer (not in Airtable yet)") + "</label>" +
      '<div id="enNewF" class="grid2 hidden"><label class="f">' + t("名", "Given name") + '<input type="text" id="enFirst" maxlength="60" /></label><label class="f">' + t("姓", "Surname") + '<input type="text" id="enLast" maxlength="60" /></label><label class="f">' + t("邮箱", "Email") + '<input type="email" id="enEmail" /></label><label class="f">' + t("Teams 账号", "Teams account") + '<input type="email" id="enTeams" placeholder="name@equipme.cloud" /></label><label class="f">' + t("城市", "City") + '<input type="text" id="enCity" maxlength="40" /></label></div>' +
      "<h4>" + t("订单", "Order") + '</h4><div class="grid2"><label class="f">' + t("下单日期", "Order date") + '<input type="date" id="enDate" value="' + today + '" required /></label><label class="f">' + t("已收金额（可空）", "Received (optional)") + '<input type="number" id="enRecv" min="0" step="0.01" /></label></div>' +
      '<label class="f">' + t("备注", "Comments") + '<input type="text" id="enNote" maxlength="500" /></label>' +
      "<h4>" + t("教材", "Items") + '</h4><div id="enLines"></div><button type="button" class="btn secondary sm" id="enAdd">' + t("＋ 加一行", "+ Add a line") + '</button><div class="kv" style="margin-top:8px"><span class="k">' + t("合计", "Total") + '</span><span id="enTotal">¥0</span></div>' +
      '<div class="actions"><button class="btn" type="submit" id="enSave">' + t("写入 Airtable", "Write to Airtable") + '</button><span class="muted" style="font-size:12px">' + t("写入后会立刻同步并重建人员库", "Then synced here and the people hub rebuilt") + '</span></div><div id="enMsg"></div></form></div>');
    var picked = null;
    var people = ((peopleState.hub || {}).people || []).filter(function (p) { return p.sources && p.sources.customer; });
    if (!people.length) loadPeople(false).then(function () { people = ((peopleState.hub || {}).people || []).filter(function (p) { return p.sources && p.sources.customer; }); }).catch(function () {});
    $("enQ").addEventListener("input", debounce(function () {
      var q = $("enQ").value.trim().toLowerCase(), box = $("enHits");
      if (!q) { box.classList.add("hidden"); return; }
      var hits = people.filter(function (p) { return [p.name, p.primaryEmail, p.crmId].concat((p.emails || []).map(function (e) { return e.email; })).join(" ").toLowerCase().indexOf(q) >= 0; }).slice(0, 8);
      box.innerHTML = hits.length ? hits.map(function (p) { var c = p.facets.customers[0] || {}; return '<button type="button" class="orow link" data-pick="' + esc(c.recId) + '" data-name="' + esc(p.name) + '"><div class="omain"><b>' + esc(p.name) + '</b><span class="sub">' + esc([p.primaryEmail, p.crmId].filter(Boolean).join(" · ")) + "</span></div></button>"; }).join("") : '<div class="orow muted">' + t("没有匹配的客户；勾选「新客户」。", "No match; tick “New customer”.") + "</div>";
      box.classList.remove("hidden");
    }, 120));
    $("enHits").addEventListener("click", function (e) { var b = e.target.closest("button[data-pick]"); if (!b) return; picked = { recId: b.getAttribute("data-pick"), name: b.getAttribute("data-name") }; $("enPicked").innerHTML = esc(t("已选客户：", "Customer: ") + picked.name); $("enPicked").classList.remove("hidden"); $("enHits").classList.add("hidden"); $("enQ").value = picked.name; $("enNew").checked = false; $("enNewF").classList.add("hidden"); });
    $("enNew").addEventListener("change", function () { $("enNewF").classList.toggle("hidden", !this.checked); if (this.checked) { picked = null; $("enPicked").classList.add("hidden"); } });
    var lines = 0;
    function addLine() {
      lines++;
      $("enLines").insertAdjacentHTML("beforeend", '<div class="enl grid3" data-l="' + lines + '"><label class="f">SKU<select class="enSku" required><option value="">' + t("选择教材…", "Choose…") + "</option>" + entryCat.filter(function (k) { return k.available; }).map(function (k) { return '<option value="' + esc(k.sku) + '" data-price="' + (k.price == null ? "" : k.price) + '">' + esc(k.sku + " · " + (EN ? (k.nameEn || k.nameZh) : (k.nameZh || k.nameEn))) + "</option>"; }).join("") + '</select></label><label class="f">' + t("数量", "Qty") + '<input type="number" class="enQty" min="1" step="1" value="1" required /></label><label class="f">' + t("单价", "Unit price") + '<input type="number" class="enUnit" min="0" step="0.01" /></label></div>');
    }
    function total() { var sum = 0; document.querySelectorAll("#enLines .enl").forEach(function (l) { var q = +l.querySelector(".enQty").value || 0, u = l.querySelector(".enUnit").value, sel = l.querySelector(".enSku"), dp = sel.selectedOptions[0] && sel.selectedOptions[0].getAttribute("data-price"); sum += q * (u !== "" ? +u : (dp ? +dp : 0)); }); $("enTotal").textContent = fmtMoney(sum); }
    loadCatalogue().then(function () { addLine(); }).catch(function (r) { $("enMsg").innerHTML = '<div class="msg err">' + esc(errText(r)) + "</div>"; });
    $("enAdd").addEventListener("click", addLine);
    $("enLines").addEventListener("change", function (e) { var sel = e.target.closest(".enSku"); if (sel) { var u = sel.closest(".enl").querySelector(".enUnit"), dp = sel.selectedOptions[0] && sel.selectedOptions[0].getAttribute("data-price"); if (!u.value && dp) u.value = dp; } total(); });
    $("enLines").addEventListener("input", total);
    $("enf").addEventListener("submit", function (e) {
      e.preventDefault();
      var items = Array.prototype.map.call(document.querySelectorAll("#enLines .enl"), function (l) { var u = l.querySelector(".enUnit").value; return { sku: l.querySelector(".enSku").value, qty: +l.querySelector(".enQty").value, unitPrice: u === "" ? null : +u }; }).filter(function (it) { return it.sku; });
      var customer = $("enNew").checked ? { new: { first: $("enFirst").value.trim(), last: $("enLast").value.trim(), email: $("enEmail").value.trim(), teams: $("enTeams").value.trim(), city: $("enCity").value.trim() } } : picked ? { recId: picked.recId } : null;
      if (!customer) { $("enMsg").innerHTML = '<div class="msg err">' + t("请先选择客户或勾选「新客户」。", "Choose a customer or tick “New customer”.") + "</div>"; return; }
      if (!items.length) { $("enMsg").innerHTML = '<div class="msg err">' + t("至少一行教材。", "At least one item.") + "</div>"; return; }
      var b = $("enSave"); savingButton(b, t("写入中…", "Writing…"));
      var recv = $("enRecv").value;
      post("crm/entry", "POST", { customer: customer, date: $("enDate").value, comments: $("enNote").value.trim(), received: recv === "" ? undefined : +recv, items: items }).then(function (r) {
        restoreButton(b);
        if (!r.ok) { $("enMsg").innerHTML = '<div class="msg err">' + esc((r.body && r.body.message) || errText(r)) + "</div>"; return; }
        equipState.list = null; peopleState.hub = null; entryCat = null;
        savedAndClose(null, t("已写入 Airtable：订单 ", "Written to Airtable: order ") + "<b>" + esc(r.body.orderId) + "</b>" + t("，" + r.body.lines + " 行", ", " + r.body.lines + " lines") + (r.body.newCustomer ? t("，新客户已建", ", new customer created") : "") + "。");
        if ($("evgrid")) loadEquip(true).then(renderEquip);
      });
    });
  }
  function loadEquip(force) {
    if (equipState.list && !force) return Promise.resolve(equipState.list);
    return api("crm/equip-orders").then(function (r) {
      if (!r.ok) throw r;
      equipState.list = r.body.orders || []; equipState.status = r.body.status || {};
      return equipState.list;
    });
  }
  function equipName(it) { return (EN ? (it.nameEn || it.nameZh) : (it.nameZh || it.nameEn)) || it.sku || ""; }
  // One Equip order with its purchased items (Rick, 2026-10-08: 「could order ID be
  // clickable? It will display order details with purchased items」). Read-only.
  function openEquipOrderPanel(recId, which) {
    var o = (equipState.list || []).filter(function (x) { return x.recId === recId; })[0];
    if (!o) return;
    var items = (o.items || []).map(function (it) {
      var roy = it.royalty && Object.keys(it.royalty).length ? '<span class="sub">' + esc(Object.keys(it.royalty).map(function (k) { var v = it.royalty[k]; return k + " " + (typeof v === "number" && v <= 1 && /rate/i.test(k) ? Math.round(v * 100) + "%" : v); }).join(" · ")) + "</span>" : "";
      return '<div class="orow"><div class="omain"><b>' + esc(equipName(it)) + '</b><span class="sub">' + esc([it.sku, it.publisher, it.category, it.subject, it.grade].filter(Boolean).join(" · ")) + "</span>" + roy + '</div><div class="oprice">' + (it.qty || 0) + " × " + money(it.unitPrice, "CNY") + "<br><b>" + money(it.total, "CNY") + "</b></div></div>";
    }).join("");
    panelOpen('<div class="ph"><h3>' + esc(o.orderId) + '</h3><span class="tag">EquipMe</span><button class="x" type="button" aria-label="close">✕</button></div><div class="pb">' +
      '<div class="kv"><span class="k">' + t("日期", "Date") + "</span><span>" + esc(o.date || "") + "</span>" +
        '<span class="k">' + t("客户", "Customer") + "</span><span>" + esc(o.name || "—") + "</span>" +
        '<span class="k">' + t("邮箱", "Email") + "</span><span>" + esc(o.email || "—") + "</span>" +
        '<span class="k">' + t("金额 / 实收", "Amount / received") + "</span><span>" + money(o.amount, "CNY") + " / " + money(o.received, "CNY") + "</span>" +
        (o.comments ? '<span class="k">' + t("备注", "Comments") + "</span><span>" + esc(o.comments) + "</span>" : "") + "</div>" +
      "<h4>" + t("购买的教材", "Purchased items") + " · " + (o.items || []).length + '</h4><div class="olist">' + (items || '<div class="orow muted">' + t("没有订单明细。", "No line items.") + "</div>") + "</div>" +
      (crmLevel("orders") === "rw" || crmLevel("money") === "rw" ? '<h4>' + t("标收款", "Record cash received") + '</h4><div class="actions"><input type="number" id="eoRecv" min="0" step="0.01" value="' + (o.received == null ? "" : o.received) + '" style="width:140px" /><button type="button" class="btn secondary sm" id="eoRecvSave" data-rec="' + esc(o.recId) + '">' + t("保存到 Airtable", "Save to Airtable") + '</button></div><div id="eoMsg"></div>' : "") +
      '<p class="hint">' + t("订单内容在 Airtable 里改，下一次同步后生效。", "Change the order's contents in Airtable; the next sync picks it up.") + "</p></div>", which);
    var rb = $("eoRecvSave");
    if (rb) rb.addEventListener("click", function () {
      var v = $("eoRecv").value; if (v === "") return;
      savingButton(rb, t("保存中…", "Saving…"));
      post("crm/received", "POST", { recId: rb.getAttribute("data-rec"), received: +v }).then(function (r) {
        restoreButton(rb);
        if (!r.ok) { $("eoMsg").innerHTML = '<div class="msg err">' + esc((r.body && r.body.message) || errText(r)) + "</div>"; return; }
        o.received = +v; $("eoMsg").innerHTML = '<div class="msg ok">' + t("已记录实收 ", "Received recorded: ") + fmtMoney(+v) + "</div>";
        if ($("evgrid")) renderEquip();
      });
    });
  }
  function ym(d) { return String(d || "").slice(0, 7); }
  function monthLabel(m) { var p = m.split("-"); return EN ? ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][+p[1] - 1] + " " + p[0].slice(2) : +p[1] + "月"; }
  function addMonths(m, k) { var p = m.split("-"), d = new Date(Date.UTC(+p[0], +p[1] - 1 + k, 1)); return d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0"); }
  // School year starts in August (decision 7): "2026" = Aug 2026 – Jul 2027.
  function fyOf(m) { var p = m.split("-"); return +p[1] >= 8 ? +p[0] : +p[0] - 1; }
  function fyLabel(y) { return t(y + "–" + (y + 1) + " 学年", "SY " + y + "–" + (y + 1).toString().slice(2)); }
  var GRADE_BANDS = [["K–2", "K–2"], ["3–5", "3–5"], ["6–8", "6–8"], ["9–12", "9–12"], ["教师培训", "Teacher training"], ["未分类", "Unclassified"]];
  function gradeBand(grade) {
    var g = String(grade || "");
    if (!g) return 5;
    if (/teacher|教师|adult|成人|parent|家长/i.test(g)) return 4;
    if (/\bK\b|kinder|幼/i.test(g)) return 0;
    var m = /\d+/.exec(g); if (!m) return 5;
    var n = +m[0]; return n <= 2 ? 0 : n <= 5 ? 1 : n <= 8 ? 2 : n <= 12 ? 3 : 5;
  }
  function renderEquip() {
    var list = equipState.list || [], st = equipState.status || {}, c = st.counts || {};
    var seeMoney = crmLevel("money") !== "none";
    var fmt = seeMoney ? fmtMoney : fmtNum, measure = seeMoney ? t("销售额", "Sales") : t("件数", "Units");
    var val = function (o) { return seeMoney ? (o.amount || 0) : (o.qty || 0); };
    var now = new Date(), curM = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
    // The month picker (Rick, 2026-10-08: 「Should be able to choose month rather than only this
    // month」): every month from the first order to now, newest first; everything below follows it.
    var firstOrderM = list.map(function (o) { return ym(o.date); }).filter(Boolean).sort()[0] || curM;
    var sel = $("emonth");
    if (sel && sel.getAttribute("data-from") !== firstOrderM) {
      sel.innerHTML = ""; sel.setAttribute("data-from", firstOrderM);
      for (var mm = curM; mm >= firstOrderM; mm = addMonths(mm, -1)) { var op = document.createElement("option"); op.value = mm; op.textContent = (mm === curM ? t("本月 · ", "This month · ") : "") + mm; sel.appendChild(op); }
    }
    if (!equipState.month || equipState.month > curM) equipState.month = curM;
    if (sel) sel.value = equipState.month;
    var thisM = equipState.month, isCur = thisM === curM, mName = isCur ? t("本月", "This month") : thisM;
    var months = []; for (var i = 11; i >= 0; i--) months.push(addMonths(thisM, -i));
    var byM = {}; months.forEach(function (m) { byM[m] = { orders: 0, sales: 0, received: 0, units: 0, newC: 0, oldC: 0 }; });
    // first order month per customer, for new vs returning
    var firstM = {}; list.forEach(function (o) { var k = o.customerRec || o.email || o.name; var m = ym(o.date); if (k && m && (!firstM[k] || m < firstM[k])) firstM[k] = m; });
    var seenInM = {};
    list.forEach(function (o) {
      var m = ym(o.date); if (!byM[m]) return;
      var b = byM[m]; b.orders++; b.sales += o.amount || 0; b.received += o.received || 0; b.units += o.qty || 0;
      var k = o.customerRec || o.email || o.name; if (k && !seenInM[m + "|" + k]) { seenInM[m + "|" + k] = 1; if (firstM[k] === m) b.newC++; else b.oldC++; }
    });
    var cur = byM[thisM], prev = byM[addMonths(thisM, -1)] || { orders: 0, sales: 0, units: 0 };
    var pct = function (a, b) { return b ? (a - b) / b : null; };
    // school years: current and previous, cumulative Aug→Jul
    var fy = fyOf(thisM), fyMonths = []; for (var k = 0; k < 12; k++) fyMonths.push(addMonths(fy + "-08", k));
    var cum = function (y) { var acc = 0; return fyMonths.map(function (m, idx) { var mm = addMonths(y + "-08", idx); if (mm > thisM) return null; list.forEach(function (o) { if (ym(o.date) === mm) acc += val(o); }); return acc; }); };
    var cumCur = cum(fy), cumPrev = cum(fy - 1);
    var fyOrders = list.filter(function (o) { return fyOf(ym(o.date)) === fy; }), pyOrders = list.filter(function (o) { return fyOf(ym(o.date)) === fy - 1 && ym(o.date) <= addMonths(thisM, -12); });
    var sum = function (arr, f) { return arr.reduce(function (a, o) { return a + f(o); }, 0); };
    var fyTotal = sum(fyOrders, val), pyTotal = sum(pyOrders, val);
    var fyCust = {}; fyOrders.forEach(function (o) { var k = o.customerRec || o.email || o.name; if (k) fyCust[k] = firstM[k] >= fy + "-08" ? "new" : "old"; });
    var fyNew = Object.keys(fyCust).filter(function (k) { return fyCust[k] === "new"; }).length, fyOld = Object.keys(fyCust).length - fyNew;

    $("ekpi").innerHTML =
      statTile(seeMoney ? mName + t("销售额", " sales") : mName + t("件数", " units"), fmt(seeMoney ? cur.sales : cur.units), { delta: pct(seeMoney ? cur.sales : cur.units, seeMoney ? prev.sales : prev.units), vs: t("较上月", "vs the month before"), spark: months.map(function (m) { return seeMoney ? byM[m].sales : byM[m].units; }) }) +
      (seeMoney ? statTile(mName + t("实收", " received"), fmtMoney(cur.received), { sub: cur.sales ? Math.round(cur.received / cur.sales * 100) + "%" + t(" 已收", " received") : t("按订单", "by order") }) : "") +
      statTile(mName + t("订单", " orders"), fmtNum(cur.orders), { delta: pct(cur.orders, prev.orders), vs: t("较上月", "vs the month before"), spark: months.map(function (m) { return byM[m].orders; }) }) +
      statTile(fyLabel(fy) + (seeMoney ? "" : " · " + measure), fmt(fyTotal), { delta: pct(fyTotal, pyTotal), vs: t("较上学年同期", "vs same period last year"), sub: fyOrders.length + t(" 单", " orders") }) +
      statTile(t("本学年购买客户", "Buyers this school year"), fmtNum(fyNew + fyOld), { sub: t("新客户 ", "new ") + fyNew + t(" · 老客户 ", " · returning ") + fyOld });

    // publishers, titles, subjects, grade bands — this school year
    var agg = function (keyOf) { var m = {}; fyOrders.forEach(function (o) { (o.items || []).forEach(function (it) { var k = keyOf(it); if (k == null) return; m[k] = (m[k] || 0) + (seeMoney ? (it.total || 0) : (it.qty || 0)); }); }); return Object.keys(m).map(function (k) { return { label: k, value: m[k] }; }).sort(function (a, b) { return b.value - a.value; }); };
    var pubs = agg(function (it) { return it.publisher || t("未知出版社", "Unknown publisher"); });
    var titles = agg(function (it) { return equipName(it); }).slice(0, 10);
    var subjects = agg(function (it) { return it.subject || t("未分类", "Unclassified"); }).slice(0, 10);
    var bandsAgg = {}; fyOrders.forEach(function (o) { (o.items || []).forEach(function (it) { var b = gradeBand(it.grade); bandsAgg[b] = (bandsAgg[b] || 0) + (seeMoney ? (it.total || 0) : (it.qty || 0)); }); });
    var bands = GRADE_BANDS.map(function (g, i) { return { label: t(g[0], g[1]), value: bandsAgg[i] || 0 }; }).filter(function (r) { return r.value; });
    var mlabels = months.map(monthLabel);
    var trendSeries = seeMoney ? [{ name: t("销售额", "Sales"), values: months.map(function (m) { return byM[m].sales; }), color: VIZ.cat[0] }, { name: t("实收", "Received"), values: months.map(function (m) { return byM[m].received; }), color: VIZ.cat[2] }] : [{ name: t("件数", "Units"), values: months.map(function (m) { return byM[m].units; }), color: VIZ.cat[0] }];
    var fyl = fyMonths.map(monthLabel);
    var barsTable = function (rows) { return dataTable([t("项目", "Item"), measure], rows.map(function (r) { return [r.label, fmt(r.value)]; })); };
    vizDraws = [];
    $("evgrid").innerHTML = !list.length ? '<div class="card"><p class="empty">' + (st.syncedAt ? t("Airtable 里还没有订单。", "No orders in Airtable yet.") : st.configured === false ? t("还没有同步：系统管理员需要在 Static Web App 的应用设置里加上 AIRTABLE_EQUIP_PAT。", "Not synced yet: the system administrator needs to add AIRTABLE_EQUIP_PAT to the Static Web App's settings.") : t("还没有同步。点「从 Airtable 同步」。", "Not synced yet. Click “Sync from Airtable”.")) + "</p></div>" :
      chartCard("vTrend", t("近 12 个月", "Last 12 months"), (isCur ? "" : t("截至 ", "to ") + thisM + " · ") + (seeMoney ? t("销售额与实收，按下单月", "sales and received, by order month") : t("件数，按下单月", "units by order month")), function (w) { return linesChart(w, { x: mlabels, series: trendSeries, fmt: fmt }); }, dataTable([t("月份", "Month")].concat(trendSeries.map(function (s) { return s.name; })), months.map(function (m, i) { return [m].concat(trendSeries.map(function (s) { return fmt(s.values[i]); })); }))) +
      chartCard("vFy", t("学年累计", "School year to date"), fyLabel(fy) + " vs " + fyLabel(fy - 1), function (w) { return linesChart(w, { x: fyl, series: [{ name: fyLabel(fy), values: cumCur, color: VIZ.seq }, { name: fyLabel(fy - 1), values: cumPrev, color: VIZ.gray }], fmt: fmt }); }, dataTable([t("月份", "Month"), fyLabel(fy), fyLabel(fy - 1)], fyMonths.map(function (m, i) { return [monthLabel(m), cumCur[i] == null ? "—" : fmt(cumCur[i]), cumPrev[i] == null ? "—" : fmt(cumPrev[i])]; }))) +
      chartCard("vOrders", t("每月订单", "Orders per month"), t("按下单月", "by order month"), function (w) { return columnsChart(w, { x: mlabels, series: [{ name: t("订单", "Orders"), values: months.map(function (m) { return byM[m].orders; }), color: VIZ.seq }], fmt: fmtNum }); }, dataTable([t("月份", "Month"), t("订单", "Orders")], months.map(function (m) { return [m, fmtNum(byM[m].orders)]; }))) +
      chartCard("vCust", t("新老客户", "New and returning buyers"), t("每月下单的客户，按首单月份区分", "buyers each month, by whether it is their first order"), function (w) { return columnsChart(w, { x: mlabels, series: [{ name: t("新客户", "New"), values: months.map(function (m) { return byM[m].newC; }), color: VIZ.cat[0] }, { name: t("老客户", "Returning"), values: months.map(function (m) { return byM[m].oldC; }), color: VIZ.cat[1] }], fmt: fmtNum }); }, dataTable([t("月份", "Month"), t("新客户", "New"), t("老客户", "Returning")], months.map(function (m) { return [m, fmtNum(byM[m].newC), fmtNum(byM[m].oldC)]; }))) +
      chartCard("vPub", t("出版社", "Publishers"), fyLabel(fy) + " · " + measure, function (w) { return barsChart(w, { rows: pubs, fmt: fmt, name: measure }); }, barsTable(pubs)) +
      chartCard("vTitles", t("教材 Top 10", "Top 10 titles"), fyLabel(fy) + " · " + measure, function (w) { return barsChart(w, { rows: titles, fmt: fmt, name: measure }); }, barsTable(titles)) +
      chartCard("vSubj", t("学科", "Subjects"), fyLabel(fy) + " · " + measure, function (w) { return barsChart(w, { rows: subjects, fmt: fmt, name: measure }); }, barsTable(subjects)) +
      chartCard("vGrade", t("年级段", "Grade bands"), fyLabel(fy) + " · " + measure + " · " + t("按教材标注的年级", "by the textbook's grade"), function (w) { return barsChart(w, { rows: bands, fmt: fmt, name: measure }); }, barsTable(bands));
    drawCharts();
    $("efoot").innerHTML = (st.syncedAt ? esc(t("数据同步于 ", "Data synced ") + when(st.syncedAt)) + " · " + esc((c.orders || 0) + t(" 单订单 · ", " orders · ") + (c.customers || 0) + t(" 位客户 · ", " customers · ") + (c.curriculums || 0) + t(" 条教材", " textbooks")) : esc(t("尚未同步", "Not synced yet"))) +
      ((st.warnings || []).length ? ' · <details style="display:inline-block"><summary>' + esc(t("同步提示 " + st.warnings.length + " 条", st.warnings.length + " sync notes")) + "</summary><ul>" + st.warnings.map(function (w) { return "<li>" + esc(w) + "</li>"; }).join("") + "</ul></details>" : "") +
      (seeMoney ? "" : " · " + esc(t("金额按角色隐藏，图表以件数计", "Amounts hidden for this role; charts count units")));
  }
