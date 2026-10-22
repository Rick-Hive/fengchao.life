// management/src/47-statements.js — 经营 › 对账单 (IT service statements).
// Part of management.js: scripts/build-management.js concatenates management/src/*.js in name order
// into management/management.js (one closure; every part sees every other's functions). Edit here, not the built file.

  // ================================================================================
  // 经营 › 对账单 — one month, every school: the accounts on the 1st and the next 1st,
  // who came and went, licensed × (price ÷ 12) minus the discount finance enters
  // (Rick, 2026-10-12). Rows are previews until 生成账单 saves the statement (status draft, shown as 待发送); then
  // draft → sent → paid. The statement prints from the panel (打印 / PDF).
  // ================================================================================
  var stmState = { month: "", data: null, open: null };
  var STM_ST = { draft: ["待发送", "Ready to send", "warn"], sent: ["已发送", "Sent", "accent"], paid: ["已收款", "Paid", "ok"] };
  function stmMoney(v, cur) { if (v == null) return "—"; var n = Number(v).toLocaleString(EN ? "en-US" : "zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); return (cur === "CNY" ? "¥" : cur === "USD" ? "$" : (cur || "") + " ") + n; }
  function stmMonthLabel(m) { if (!m) return ""; var p = m.split("-"); return EN ? ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][+p[1] - 1] + " " + p[0] : p[0] + " 年 " + (+p[1]) + " 月"; }
  function stmStatusTag(st) { if (!st) return '<span class="tag muted">' + t("未生成", "Not generated") + "</span>"; var d = STM_ST[st] || [st, st, ""]; return '<span class="tag ' + d[2] + '">' + esc(t(d[0], d[1])) + "</span>"; }
  function canSeeStatements() { return isAdmin() || crmLevel("money") !== "none" || crmLevel("partners") !== "none"; }
  function viewStatements() {
    if (!stmState.month) { var d = new Date(Date.now() + 8 * 3600 * 1000); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1); stmState.month = d.toISOString().slice(0, 7); }
    setTitle(t("经营 › 对账单", "Operations › Statements"), t("IT 服务月度账单", "Monthly IT statements"),
      '<input type="month" id="stMonth" class="sm" value="' + esc(stmState.month) + '" /> <button class="btn secondary sm" id="stCsv">' + t("导出 CSV", "Export CSV") + '</button> <button class="btn secondary sm" id="stReload">' + t("刷新", "Refresh") + "</button>",
      { info: t("每所学校一个月一张账单：期初和期末账号数取该月 1 号和下月 1 号的目录快照（夜间同步在 1 号凌晨保存），可计费 = 当月 1 号有 A1 许可证的账号，当月新增的账号从下个月开始收费；金额 = (可计费 − 免费账号) × 服务年费 ÷ 12 × (1 − 折扣)。生成前可以填三项：服务年费（每账号每年）、免费账号数、折扣 %；默认沿用该校上月账单，没有则取 IT 服务合作关系的条款（默认 5 美元、0、0）。先看预览，填好数字，点「生成账单」，状态是「待发送」（已生成、还没发给学校，可以修改后重新生成）；发给学校后点「标为已发送」，收款后点「标为已收款」，都由财务手工标记。明细列出当月新增和删除的账号。下方「期间账单」可以选起始月份和截止月份，把几个月合成一张账单（逐月明细，三项数字统一应用）。", "One statement per school per month: the accounts on the 1st and on the next 1st come from the directory's monthly snapshots (saved by the nightly sync in the small hours of the 1st); billable = accounts holding an A1 license on the 1st of the month (accounts added during the month are billed from the next); amount = (billable − free accounts) × price per account per year ÷ 12 × (1 − discount %). Before generating, finance sets three figures: the yearly price per account, the free accounts and a percentage off; they default to the school's previous statement, else to the IT partnership's terms (USD 5, 0, 0). Review the preview, set the figures, press Generate — the status is “Ready to send” (generated, not yet sent to the school; it can be edited and regenerated); after sending it to the school finance presses Mark sent, and Mark paid once the payment arrives. The detail lists the accounts added and removed in the month. Period statements below combine a span of months into one statement (month-by-month detail, the same three figures for every month).") });
    $("content").innerHTML = '<div class="kpis strip" id="stkpi"></div><div class="tbl-wrap"><table class="data" id="sttable"><thead><tr><th>' + t("学校", "School") + '</th><th class="num">' + t("期初", "Start") + '</th><th class="num">' + t("期末", "End") + '</th><th class="num">' + t("新增", "Added") + '</th><th class="num">' + t("删除", "Removed") + '</th><th class="num">' + t("可计费", "Billable") + '</th><th class="num">' + t("免费", "Free") + '</th><th class="num">' + t("金额", "Amount") + "</th><th>" + t("状态", "Status") + '</th></tr></thead><tbody><tr><td colspan="9" class="loading">' + t("载入中…", "Loading…") + '</td></tr></tbody></table></div><p class="muted" id="stfoot" style="font-size:.8rem"></p>' +
      // Period statements (Rick 2026-10-13): pick a school and a span of months → one statement with the month-by-month detail.
      '<div class="card" id="stPeriod" style="margin-top:18px"><div class="ch"><h2>' + t("期间账单", "Period statements") + ' <span class="n">' + t("起始月份到截止月份合成一张账单，逐月列出账号数、金额和新增 / 删除账号", "one statement from a start month to an end month, with every month's counts, amount and added / removed accounts") + '</span></h2></div>' +
      '<div class="actions" style="padding:0 16px 12px;flex-wrap:wrap"><select id="spDomain" class="sm"><option value="">' + t("学校…", "School…") + '</option></select> <input type="month" id="spFrom" class="sm" /> <span class="muted">→</span> <input type="month" id="spTo" class="sm" /> <button class="btn secondary sm" id="spOpen">' + t("预览 / 打开", "Preview / open") + '</button><span class="muted" id="spMsg" style="font-size:.8rem"></span></div>' +
      '<div class="tbl-wrap"><table class="data" id="sptable"><thead><tr><th>' + t("学校", "School") + "</th><th>" + t("期间", "Period") + '</th><th class="num">' + t("月数", "Months") + '</th><th class="num">' + t("金额", "Amount") + "</th><th>" + t("状态", "Status") + "</th><th>" + t("账单号", "Statement") + '</th></tr></thead><tbody><tr><td colspan="6" class="empty">' + t("还没有期间账单。", "No period statements yet.") + "</td></tr></tbody></table></div></div>";
    $("stMonth").addEventListener("change", function () { if (!this.value) return; stmState.month = this.value; loadStatements().then(renderStatements); });
    $("stReload").addEventListener("click", function () { loadStatements().then(renderStatements); });
    $("stCsv").addEventListener("click", exportStatementsCsv);
    $("sttable").addEventListener("click", function (e) {
      var tr = e.target.closest("tr[data-domain]"); if (!tr) return;
      document.querySelectorAll("table.data tr.sel").forEach(function (x) { x.classList.remove("sel"); }); tr.classList.add("sel");
      openStatementPanel(tr.getAttribute("data-domain"), stmState.month);
    });
    $("spOpen").addEventListener("click", function () {
      var d = $("spDomain").value, f = $("spFrom").value, to = $("spTo").value;
      $("spMsg").textContent = "";
      if (!d) { $("spMsg").textContent = t("请选择学校。", "Pick a school."); return; }
      if (!f || !to || f > to) { $("spMsg").textContent = t("请选择起始月份和截止月份（起始不晚于截止）。", "Pick the start and end months (start not after end)."); return; }
      openStatementPanel(d, f === to ? f : { from: f, to: to });
    });
    $("sptable").addEventListener("click", function (e) {
      var tr = e.target.closest("tr[data-domain]"); if (!tr) return;
      document.querySelectorAll("table.data tr.sel").forEach(function (x) { x.classList.remove("sel"); }); tr.classList.add("sel");
      openStatementPanel(tr.getAttribute("data-domain"), { from: tr.getAttribute("data-from"), to: tr.getAttribute("data-to") });
    });
    loadStatements().then(renderStatements).catch(function (r) { $("sttable").tBodies[0].innerHTML = '<tr><td colspan="9" class="loading">' + esc(errText(r)) + "</td></tr>"; });
  }
  function loadStatements() { return api("crm/statements?month=" + encodeURIComponent(stmState.month)).then(function (r) { if (!r.ok) throw r; stmState.data = r.body; return r.body; }); }
  function stmSchool(r) { return pickName(r.name, r.nameEn) || r.domain; }
  function renderStatements() {
    var d = stmState.data; if (!d || !$("sttable")) return;
    var rows = d.rows, billed = rows.filter(function (r) { return r.relationship; });
    var gen = billed.filter(function (r) { return r.saved; }).length, sent = billed.filter(function (r) { return r.status === "sent" || r.status === "paid"; }).length, paid = billed.filter(function (r) { return r.status === "paid"; }).length;
    var cur = (billed[0] && billed[0].currency) || d.currency || "USD";
    $("stkpi").innerHTML = statTile(t("计费学校", "Schools billed"), fmtNum(billed.length), { sub: t("有 IT 服务合作关系的学校", "schools with an IT partnership") }) +
      statTile(t("可计费账号", "Billable accounts"), fmtNum(d.totals.billable), { sub: t("月初有 A1 许可证", "licensed on the 1st") }) +
      statTile(t("本月合计", "Month total"), stmMoney(d.totals.amount, cur), { sub: t("扣减后", "after discounts") }) +
      statTile(t("账单进度", "Progress"), gen + " / " + billed.length, { sub: t("已生成 · 已发送 ", "generated · sent ") + sent + t(" · 已收款 ", " · paid ") + paid });
    var num = function (v) { return '<td class="num">' + (v == null ? '<span class="muted">—</span>' : fmtNum(v)) + "</td>"; };
    $("sttable").tBodies[0].innerHTML = rows.length ? rows.map(function (r) {
      var c = r.counts || {};
      var warn = r.reconstructed && (r.reconstructed.start || r.reconstructed.end) ? ' <span class="tag warn" title="' + esc(t("该月没有完整的 1 号快照，账号数按当前账号和删除记录推算", "No complete snapshot for the 1st: counts are reconstructed from the current accounts and the removal ledger")) + '">' + t("推算", "Reconstructed") + "</span>" : "";
      return '<tr class="pick' + (r.relationship ? "" : " dim") + '" data-domain="' + esc(r.domain) + '"><td><b>' + esc(stmSchool(r)) + "</b>" + (r.relationship ? "" : ' <span class="tag muted">' + t("无 IT 服务关系", "No IT partnership") + "</span>") + warn + '<span class="sub">' + esc(r.domain) + (r.id ? " · " + esc(r.id) : "") + "</span></td>" +
        num(c.start && c.start.total) + num(c.end && c.end.total) + num(c.added) + num(c.removed) + num(r.billable) + num(r.discount) +
        '<td class="num">' + (r.error ? '<span class="tag bad">' + esc(r.error) + "</span>" : "<b>" + stmMoney(r.amount, r.currency) + "</b>") + "</td><td>" + stmStatusTag(r.status) + "</td></tr>";
    }).join("") : '<tr><td colspan="9" class="empty">' + t("没有学校。", "No schools.") + "</td></tr>";
    $("stfoot").textContent = t("计费期间 ", "Period ") + d.period.start + " → " + d.period.end + t("（北京时间）· 账号数来自目录快照；未生成的行是预览，年费、免费账号和折扣默认沿用上月。", " (Beijing) · counts from the directory snapshots; rows not yet generated are previews; price, free accounts and discount default to last month's.");
    // Period statements: the school picker (schools with an IT relationship first) and the saved ones.
    var sel = $("spDomain");
    if (sel) {
      var keep = sel.value;
      sel.innerHTML = '<option value="">' + t("学校…", "School…") + "</option>" + rows.map(function (r) { return '<option value="' + esc(r.domain) + '">' + esc(stmSchool(r)) + (r.relationship ? "" : t("（无 IT 服务关系）", " (no IT partnership)")) + "</option>"; }).join("");
      sel.value = keep;
      if (!$("spFrom").value) { $("spFrom").value = d.month; $("spTo").value = d.month; }
    }
    var ps = d.periods || [];
    if ($("sptable")) $("sptable").tBodies[0].innerHTML = ps.length ? ps.map(function (p) {
      return '<tr class="pick" data-domain="' + esc(p.domain) + '" data-from="' + esc(p.from) + '" data-to="' + esc(p.to) + '"><td><b>' + esc(pickName(p.name, p.nameEn) || p.domain) + '</b><span class="sub">' + esc(p.domain) + "</span></td><td>" + esc(stmMonthLabel(p.from)) + " → " + esc(stmMonthLabel(p.to)) + '</td><td class="num">' + fmtNum(p.months) + '</td><td class="num"><b>' + stmMoney(p.amount, p.currency) + "</b></td><td>" + stmStatusTag(p.status) + "</td><td>" + esc(p.id || "") + "</td></tr>";
    }).join("") : '<tr><td colspan="6" class="empty">' + t("还没有期间账单。在上面选学校和月份范围，预览后生成。", "No period statements yet. Pick a school and a span of months above, preview, then generate.") + "</td></tr>";
  }
  function stmPeriodLabel(s) { return s.from ? stmMonthLabel(s.from) + " → " + stmMonthLabel(s.to) : stmMonthLabel(s.month); }
  // The API call's key: a month, or from & to.
  function stmKeyQuery(key) { return typeof key === "string" ? "&month=" + encodeURIComponent(key) : "&from=" + encodeURIComponent(key.from) + "&to=" + encodeURIComponent(key.to); }
  function stmKeyBody(s) { return s.from ? { from: s.from, to: s.to } : { month: s.month }; }
  // Per-month capped free accounts, summed: the same arithmetic as api/shared/statements.js computePeriod.
  function stmPeriodAmount(rows, free, price, pct) { return Math.round(rows.reduce(function (sum, r) { return sum + stmAmount(r.billable, Math.min(free, r.billable), price, pct); }, 0) * 100) / 100; }
  function exportStatementsCsv() {
    var d = stmState.data; if (!d) return;
    var cell = function (v) { v = String(v == null ? "" : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var head = [t("学校", "School"), t("域名", "Domain"), t("月份", "Month"), t("期初", "Start"), t("期末", "End"), t("新增", "Added"), t("删除", "Removed"), t("可计费", "Billable"), t("扣减", "Discount"), t("金额", "Amount"), t("币种", "Currency"), t("状态", "Status"), t("账单号", "Statement")];
    var lines = d.rows.map(function (r) { var c = r.counts || {}; return [stmSchool(r), r.domain, d.month, c.start ? c.start.total : "", c.end ? c.end.total : "", c.added, c.removed, r.billable, r.discount, r.amount, r.currency, r.status || "", r.id || ""].map(cell).join(","); });
    var blob = new Blob(["﻿" + [head.map(cell).join(",")].concat(lines).join("\r\n")], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "statements-" + d.month + ".csv"; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }
  // amount = (billable − free) × price ÷ 12 × (1 − pct ÷ 100), rounded to cents — the same as api/shared/statements.js.
  function stmAmount(billable, free, price, pct) { var sub = Math.round((billable - free) * price / 12 * 100) / 100; return Math.round(sub * (1 - pct / 100) * 100) / 100; }
  function stmFormula(billable, free, price, pct, cur) { return "= (" + fmtNum(billable) + " − " + fmtNum(free) + ") × " + stmMoney(price, cur) + " ÷ 12" + (pct ? " × (1 − " + pct + "%)" : ""); }
  // The panel: the statement (saved or preview), the three figures, generate / status / print.
  function openStatementPanel(domain, key) {
    panelOpen('<div class="ph"><h3>' + esc(domain) + '</h3><button class="x" type="button" aria-label="close">✕</button></div><div class="pb"><div class="loading">' + t("载入中…", "Loading…") + "</div></div>");
    api("crm/statement?domain=" + encodeURIComponent(domain) + stmKeyQuery(key)).then(function (r) {
      if (!r.ok) { $("panel").querySelector(".pb").innerHTML = '<div class="msg err">' + esc(errText(r)) + "</div>"; return; }
      renderStatementPanel(r.body.statement, r.body.saved, r.body.canEdit);
    });
  }
  function renderStatementPanel(s, saved, canEdit) {
    stmState.open = { statement: s, saved: saved };
    var school = pickName(s.school && s.school.name, s.school && s.school.nameEn) || s.domain;
    var editable = canEdit && (!saved || s.status === "draft");
    var c = s.counts, cur = s.currency;
    var recon = s.reconstructed && (s.reconstructed.start || s.reconstructed.end);
    var acctRow = function (a, dateKey, sign) { return '<div class="devrow"><div class="m"><b>' + (sign ? sign + " " : "") + esc(a.displayName || a.upn) + "</b><small>" + esc(a.upn) + " · " + (a.plan === "student" ? t("学生版", "A1 students") : a.plan === "faculty" ? t("教职工版", "A1 faculty") : t("无许可证", "no license")) + (a[dateKey] ? " · " + esc(day(a[dateKey])) : "") + "</small></div></div>"; };
    var per = !!s.from, rows = per ? (s.rows || []) : [];
    $("panel").querySelector(".ph h3").textContent = school + " · " + stmPeriodLabel(s);
    $("panel").querySelector(".pb").innerHTML =
      '<div class="kv">' +
        '<span class="k">' + t("账单", "Statement") + "</span><span>" + (s.id ? "<b>" + esc(s.id) + "</b> " : "") + stmStatusTag(saved ? s.status : null) + "</span>" +
        '<span class="k">' + t("期间", "Period") + "</span><span>" + esc(s.period.start) + " → " + esc(s.period.end) + "</span>" +
        '<span class="k">' + t("期初账号", "Accounts at start") + "</span><span>" + fmtNum(c.start.total) + t("（有许可证 ", " (licensed ") + fmtNum(c.start.licensed) + "）</span>" +
        '<span class="k">' + t("期末账号", "Accounts at end") + "</span><span>" + fmtNum(c.end.total) + t("（有许可证 ", " (licensed ") + fmtNum(c.end.licensed) + t("：学生版 ", ": students ") + fmtNum(c.end.student) + t("，教职工版 ", ", faculty ") + fmtNum(c.end.faculty) + (c.end.disabled ? t("；已停用 ", "; disabled ") + fmtNum(c.end.disabled) : "") + "）</span>" +
        '<span class="k">' + t("变动", "Changes") + "</span><span>" + t("新增 ", "added ") + fmtNum(c.added) + t("，删除 ", ", removed ") + fmtNum(c.removed) + "</span>" +
        '<span class="k">' + t("合作关系", "Partnership") + "</span><span>" + (s.relationship ? esc(s.relationship) : '<span class="tag muted">' + t("无 IT 服务关系", "No IT partnership") + "</span>") + "</span>" +
      "</div>" +
      (recon ? '<div class="msg err">' + t("该月没有完整的 1 号快照（" + (s.reconstructed.start ? "期初" : "") + (s.reconstructed.start && s.reconstructed.end ? "、" : "") + (s.reconstructed.end ? "期末" : "") + "），账号数按当前账号的创建日期和删除记录推算；删除记录来自同步和微软回收站（保留 30 天），更早的删除微软已无记录，该月的删除数可能偏少。从下个月起夜间同步会在 1 号保存快照。", "No complete snapshot for the 1st (" + [s.reconstructed.start ? "start" : "", s.reconstructed.end ? "end" : ""].filter(Boolean).join(", ") + "): counts are reconstructed from the current accounts' created dates and the removal ledger; removals come from the sync and from Microsoft's recycle bin (kept 30 days), so earlier deletions are unknown to Microsoft too and that month's removals may be understated. From next month the nightly sync saves a snapshot on the 1st.") + "</div>" : "") +
      (per ? "<h4>" + t("逐月", "Month by month") + " · " + fmtNum(rows.length) + t(" 个月", " months") + '</h4><div class="tbl-wrap"><table class="data sm" id="sptMonths"><thead><tr><th>' + t("月份", "Month") + '</th><th class="num">' + t("期初", "Start") + '</th><th class="num">' + t("可计费", "Billable") + '</th><th class="num">' + t("新增", "Added") + '</th><th class="num">' + t("删除", "Removed") + '</th><th class="num">' + t("应收", "Due") + "</th></tr></thead><tbody>" +
        rows.map(function (r) { return "<tr><td>" + esc(stmMonthLabel(r.month)) + (r.reconstructed && (r.reconstructed.start || r.reconstructed.end) ? ' <span class="tag warn">' + t("推算", "Reconstructed") + "</span>" : "") + '</td><td class="num">' + fmtNum(r.counts.start.total) + '</td><td class="num">' + fmtNum(r.billable) + '</td><td class="num">' + fmtNum(r.counts.added) + '</td><td class="num">' + fmtNum(r.counts.removed) + '</td><td class="num sp-amt" data-b="' + r.billable + '">' + stmMoney(r.amount, cur) + "</td></tr>"; }).join("") + "</tbody></table></div>" : "") +
      "<h4>" + t("金额", "Amount") + "</h4>" +
      '<div class="kv"><span class="k">' + t("可计费账号", "Billable") + "</span><span><b>" + fmtNum(per ? s.billableMonths : s.billable) + "</b> " + (per ? t("账号·月（各月 1 日有 A1 许可证的账号数之和；当月新增的账号从下个月起计费）", "account-months (the licensed accounts on each month's 1st, summed; accounts added in a month are billed from the next)") : t("（月初有 A1 许可证；本月新增的账号从下个月起计费）", "(licensed on the 1st; accounts added this month are billed from next month)")) + "</span>" +
        '<span class="k">' + t("服务年费", "Yearly price") + "</span><span>" + (editable ? '<input type="number" id="stPrice" min="0" step="0.01" value="' + esc(s.unitPriceYear) + '" style="width:90px" /> <span class="muted">' + esc(cur) + t(" / 账号 / 年", " per account per year") + "</span>" : stmMoney(s.unitPriceYear, cur) + t(" / 账号 / 年", " per account per year")) + "</span>" +
        '<span class="k">' + t("免费账号", "Free accounts") + "</span><span>" + (editable ? '<input type="number" id="stDisc" min="0" max="' + s.billable + '" step="1" value="' + esc(s.discount) + '" style="width:90px" /> <span class="muted">' + (per ? t("每月不计费的账号数", "accounts not billed, per month") : t("不计费的账号数", "accounts not billed")) + "</span>" : fmtNum(s.discount)) + "</span>" +
        '<span class="k">' + t("折扣", "Discount") + "</span><span>" + (editable ? '<input type="number" id="stPct" min="0" max="100" step="0.5" value="' + esc(s.discountPct || 0) + '" style="width:90px" /> <span class="muted">%</span>' : fmtNum(s.discountPct || 0) + " %") + "</span>" +
        '<span class="k">' + t("应收", "Due") + '</span><span><b id="stAmt">' + stmMoney(s.amount, cur) + '</b> <span class="muted" id="stFormula">' + (per ? t("= 各月 (可计费 − 免费) × 年费 ÷ 12", "= Σ months (billable − free) × price ÷ 12") + (s.discountPct ? " × (1 − " + s.discountPct + "%)" : "") : stmFormula(s.billable, s.discount, s.unitPriceYear, s.discountPct || 0, cur)) + "</span></span>" +
        (editable ? '<span class="k">' + t("备注", "Note") + '</span><span><input type="text" id="stNote" maxlength="500" value="' + esc(s.note || "") + '" /></span>' : (s.note ? '<span class="k">' + t("备注", "Note") + "</span><span>" + esc(s.note) + "</span>" : "")) +
      "</div>" +
      '<div class="actions">' +
        (editable ? '<button class="btn" type="button" id="stGen">' + (saved ? t("重新生成账单", "Regenerate statement") : t("生成账单", "Generate statement")) + "</button>" : "") +
        (saved ? '<button class="btn secondary" type="button" id="stPrint">' + t("打印 / PDF", "Print / PDF") + "</button>" : "") +
        (canEdit && saved && s.status === "draft" ? '<button class="btn secondary" type="button" data-st="sent">' + t("标为已发送", "Mark sent") + "</button>" : "") +
        (canEdit && saved && s.status === "sent" ? '<button class="btn secondary" type="button" data-st="paid">' + t("标为已收款", "Mark paid") + '</button><button class="btn secondary" type="button" data-st="draft">' + t("退回待发送", "Back to ready to send") + "</button>" : "") +
        (canEdit && saved && s.status === "paid" ? '<button class="btn secondary" type="button" data-st="sent">' + t("撤销收款", "Undo paid") + "</button>" : "") +
      '</div><div id="stMsg"></div>' +
      (saved ? '<p class="muted" style="font-size:12px">' + t("生成于 ", "Generated ") + esc(when(s.generatedAt)) + (s.sentAt ? t(" · 发送于 ", " · sent ") + esc(when(s.sentAt)) : "") + (s.paidAt ? t(" · 收款于 ", " · paid ") + esc(when(s.paidAt)) : "") + "</p>" : "") +
      (per ? rows.map(function (r) {
        return "<h4>" + esc(stmMonthLabel(r.month)) + " · " + t("新增 ", "added ") + fmtNum(r.added.length) + t("，删除 ", ", removed ") + fmtNum(r.removed.length) + '</h4><div class="stlist">' +
          (r.added.length || r.removed.length ? r.added.map(function (a) { return acctRow(a, "created", "＋"); }).join("") + r.removed.map(function (a) { return acctRow(a, "removedAt", "－"); }).join("") : '<div class="muted" style="font-size:.86rem">' + t("无变动", "No changes") + "</div>") + "</div>";
      }).join("") :
      "<h4>" + t("新增账号", "Accounts added") + " · " + fmtNum(s.added.length) + '</h4><div class="stlist">' + (s.added.length ? s.added.map(function (a) { return acctRow(a, "created"); }).join("") : '<div class="muted" style="font-size:.86rem">' + t("无", "None") + "</div>") + "</div>" +
      "<h4>" + t("删除账号", "Accounts removed") + " · " + fmtNum(s.removed.length) + '</h4><div class="stlist">' + (s.removed.length ? s.removed.map(function (a) { return acctRow(a, "removedAt"); }).join("") : '<div class="muted" style="font-size:.86rem">' + t("无", "None") + "</div>") + "</div>") +
      (s.history && s.history.length ? "<h4>" + t("记录", "History") + '</h4><div class="stlist">' + s.history.slice().reverse().map(function (h) { return '<div class="devrow"><div class="m"><b>' + esc(h.action === "status" ? t("状态 ", "Status ") + (STM_ST[h.from] ? t(STM_ST[h.from][0], STM_ST[h.from][1]) : h.from) + " → " + (STM_ST[h.to] ? t(STM_ST[h.to][0], STM_ST[h.to][1]) : h.to) : h.action === "regenerated" ? t("重新生成", "Regenerated") : t("生成", "Generated")) + "</b><small>" + esc(when(h.at)) + " · " + esc(h.by || "") + (h.note ? " · " + esc(h.note) : "") + (h.amount != null ? " · " + stmMoney(h.amount, cur) : "") + "</small></div></div>"; }).join("") + "</div>" : "");
    var pb = $("panel").querySelector(".pb");
    var disc = $("stDisc"), price = $("stPrice"), pct = $("stPct");
    function figures() {
      return { discount: disc ? Math.max(0, Math.min(s.billable, Math.round(+disc.value || 0))) : s.discount, unitPriceYear: price ? Math.max(0, +price.value || 0) : s.unitPriceYear, discountPct: pct ? Math.max(0, Math.min(100, +pct.value || 0)) : (s.discountPct || 0) };
    }
    function live() {
      var f = figures();
      if (per) {
        $("stAmt").textContent = stmMoney(stmPeriodAmount(rows, f.discount, f.unitPriceYear, f.discountPct), cur);
        $("stFormula").textContent = t("= 各月 (可计费 − 免费) × 年费 ÷ 12", "= Σ months (billable − free) × price ÷ 12") + (f.discountPct ? " × (1 − " + f.discountPct + "%)" : "");
        pb.querySelectorAll(".sp-amt").forEach(function (td) { var b = +td.getAttribute("data-b"); td.textContent = stmMoney(stmAmount(b, Math.min(f.discount, b), f.unitPriceYear, f.discountPct), cur); });
        return;
      }
      $("stAmt").textContent = stmMoney(stmAmount(s.billable, f.discount, f.unitPriceYear, f.discountPct), cur); $("stFormula").innerHTML = stmFormula(s.billable, f.discount, f.unitPriceYear, f.discountPct, cur);
    }
    [disc, price, pct].forEach(function (el) { if (el) el.addEventListener("input", live); });
    // One click listener per panel: renderStatementPanel runs again after generate / status
    // with the same .pb element, and a listener per render fired every old closure too (a
    // second print window, a second status POST). The handler reads the current statement.
    stmState.open.figures = figures;
    if (pb.dataset.stmBound) return;
    pb.dataset.stmBound = "1";
    pb.addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b) return;
      var s = stmState.open.statement, figures = stmState.open.figures;
      if (b.id === "stGen") {
        savingButton(b, t("生成中…", "Generating…"));
        post("crm/statement", "POST", Object.assign({ op: "generate", domain: s.domain, note: $("stNote") ? $("stNote").value.trim() : "" }, stmKeyBody(s), figures())).then(function (r) {
          if (!r.ok) { restoreButton(b); $("stMsg").innerHTML = '<div class="msg err">' + esc(errText(r)) + "</div>"; return; }
          renderStatementPanel(r.body.statement, true, true); loadStatements().then(renderStatements);
          flash(t("账单 ", "Statement ") + esc(r.body.statement.id) + t(" 已生成，状态：待发送。", " generated; status: ready to send."), 4000);
        });
        return;
      }
      if (b.id === "stPrint") { printStatement(s); return; }
      var st = b.getAttribute("data-st");
      if (st) {
        var note = st === "paid" ? window.prompt(t("收款备注（可留空，如银行到账日期）：", "Payment note (optional, e.g. the bank date):"), "") : "";
        if (note === null) return;
        savingButton(b, "…");
        post("crm/statement", "POST", Object.assign({ op: "status", domain: s.domain, status: st, note: note }, stmKeyBody(s))).then(function (r) {
          if (!r.ok) { restoreButton(b); $("stMsg").innerHTML = '<div class="msg err">' + esc(errText(r)) + "</div>"; return; }
          renderStatementPanel(r.body.statement, true, true); loadStatements().then(renderStatements);
        });
      }
    });
  }
  // The printable statement: a plain page in a new window; the browser's print dialog saves it as PDF.
  function printStatement(s) {
    var school = pickName(s.school && s.school.name, s.school && s.school.nameEn) || s.domain, cur = s.currency, per = !!s.from;
    var row = function (a, dateKey) { return "<tr><td>" + esc(a.displayName || "") + "</td><td>" + esc(a.upn) + "</td><td>" + (a.plan === "student" ? t("学生版", "A1 students") : a.plan === "faculty" ? t("教职工版", "A1 faculty") : t("无", "none")) + "</td><td>" + esc(a[dateKey] ? day(a[dateKey]) : "") + "</td></tr>"; };
    var listTable = function (list, dateKey, dateLabel) { return list.length ? "<table><tr><th>" + t("姓名", "Name") + "</th><th>" + t("账号", "Account") + "</th><th>" + t("许可证", "License") + "</th><th>" + dateLabel + "</th></tr>" + list.map(function (a) { return row(a, dateKey); }).join("") + "</table>" : '<p class="muted">' + t("无", "None") + "</p>"; };
    var priceRows = "<tr><td>" + t("服务年费", "Yearly price") + '</td><td class="num">' + stmMoney(s.unitPriceYear, cur) + t(" / 账号 / 年（÷ 12）", " per account per year (÷ 12)") + "</td></tr>" +
      "<tr><td>" + t("小计", "Subtotal") + '</td><td class="num">' + stmMoney(s.subtotal != null ? s.subtotal : s.amount, cur) + "</td></tr>" +
      (s.discountPct ? "<tr><td>" + t("折扣", "Discount") + '</td><td class="num">−' + s.discountPct + " %</td></tr>" : "") +
      '<tr class="total"><td>' + (per ? t("本期应收", "Amount due") : t("本月应收", "Amount due")) + '</td><td class="num">' + stmMoney(s.amount, cur) + "</td></tr></table>";
    // Billing rule on the statement itself (Rick, 2026-10-13: 「在生成的账单PDF文档中注明这一点」).
    var rule = '<p class="muted" style="margin-top:8px">' + (per
      ? t("计费说明：每个月的费用按该月 1 日（月初）持有 Office 365 A1 许可证的账号数计算。当月新增的账号从下个月开始收费；当月删除的账号当月仍计费。免费账号数按月扣减。", "Billing rule: each month's charge is based on the accounts holding an Office 365 A1 license on that month's 1st (the start of the month). Accounts added during a month are billed from the next month; accounts removed during a month are still billed for it. Free accounts are deducted per month.")
      : t("计费说明：本月费用按 " + s.period.start + "（月初）持有 Office 365 A1 许可证的账号数计算。本月新增的账号从下个月开始收费；本月删除的账号本月仍计费。", "Billing rule: this month's charge is based on the accounts holding an Office 365 A1 license on " + s.period.start + " (the start of the month). Accounts added during the month are billed from next month; accounts removed during the month are still billed for this month.")) + "</p>";
    var reconNote = (s.reconstructed && (s.reconstructed.start || s.reconstructed.end)) || (per && (s.rows || []).some(function (r) { return r.reconstructed && (r.reconstructed.start || r.reconstructed.end); }))
      ? '<p class="muted">' + t("说明：部分月份没有当日的目录快照，账号数按账号的创建日期和删除记录推算；删除记录来自同步和微软回收站（保留 30 天），更早的删除可能未计入。", "Note: some months have no directory snapshot for the day; counts are reconstructed from the accounts' created dates and the removal ledger. Removals come from the sync and from Microsoft's recycle bin (kept 30 days); earlier deletions may be missing.") + "</p>" : "";
    var main, detail;
    if (per) {
      var rows = s.rows || [];
      main = "<h2>" + t("逐月账号与金额", "Accounts and amount, month by month") + "</h2><table><tr><th>" + t("月份", "Month") + '</th><th class="num">' + t("期初账号", "Accounts on 1st") + '</th><th class="num">' + t("其中可计费", "of which billable") + '</th><th class="num">' + t("免费", "Free") + '</th><th class="num">' + t("计费", "Billed") + '</th><th class="num">' + t("新增", "Added") + '</th><th class="num">' + t("删除", "Removed") + '</th><th class="num">' + t("应收", "Due") + "</th></tr>" +
        rows.map(function (r) { return "<tr><td>" + esc(stmMonthLabel(r.month)) + '</td><td class="num">' + fmtNum(r.counts.start.total) + '</td><td class="num">' + fmtNum(r.billable) + '</td><td class="num">−' + fmtNum(r.discount) + '</td><td class="num">' + fmtNum(r.billable - r.discount) + '</td><td class="num">+' + fmtNum(r.counts.added) + '</td><td class="num">−' + fmtNum(r.counts.removed) + '</td><td class="num">' + stmMoney(r.amount, cur) + "</td></tr>"; }).join("") +
        '<tr><td colspan="7">' + t("合计 · ", "Total · ") + fmtNum(rows.length) + t(" 个月，", " months, ") + fmtNum(s.billableMonths) + t(" 账号·月，免费 ", " account-months, free ") + fmtNum(rows.reduce(function (a, r) { return a + r.discount; }, 0)) + '</td><td class="num">' + stmMoney(s.subtotal, cur) + "</td></tr></table>" +
        "<h2>" + t("金额", "Amount") + "</h2><table><tr><th>" + t("项目", "Item") + '</th><th class="num">' + t("金额", "Amount") + "</th></tr>" + priceRows;
      detail = rows.map(function (r) {
        return "<h2>" + esc(stmMonthLabel(r.month)) + t(" · 账号变动", " · account changes") + "</h2>" +
          "<h3>" + t("新增账号（从下个月起计费）", "Accounts added (billed from the next month)") + " (" + r.added.length + ")</h3>" + listTable(r.added, "created", t("创建日期", "Created")) +
          "<h3>" + t("删除账号", "Accounts removed") + " (" + r.removed.length + ")</h3>" + listTable(r.removed, "removedAt", t("删除日期", "Removed"));
      }).join("");
    } else {
      main = "<h2>" + t("账号与金额", "Accounts and amount") + "</h2><table><tr><th>" + t("项目", "Item") + '</th><th class="num">' + t("数量", "Count") + "</th></tr>" +
        "<tr><td>" + t("期初账号（" + s.period.start + "）", "Accounts on " + s.period.start) + '</td><td class="num">' + fmtNum(s.counts.start.total) + "</td></tr>" +
        "<tr><td>" + t("其中有 Office 365 A1 许可证（可计费）", "of which licensed with Office 365 A1 (billable)") + '</td><td class="num">' + fmtNum(s.billable) + "</td></tr>" +
        "<tr><td>" + t("本月新增账号（从下个月起计费）", "Accounts added this month (billed from next month)") + '</td><td class="num">+' + fmtNum(s.counts.added) + "</td></tr>" +
        "<tr><td>" + t("本月删除账号", "Accounts removed this month") + '</td><td class="num">−' + fmtNum(s.counts.removed) + "</td></tr>" +
        "<tr><td>" + t("期末账号（" + s.period.end + "）", "Accounts on " + s.period.end) + '</td><td class="num">' + fmtNum(s.counts.end.total) + "</td></tr>" +
        "<tr><td>" + t("免费账号", "Free accounts (not billed)") + '</td><td class="num">−' + fmtNum(s.discount) + "</td></tr>" +
        "<tr><td>" + t("计费账号", "Accounts billed") + '</td><td class="num">' + fmtNum(s.billable - s.discount) + "</td></tr>" + priceRows;
      detail = "<h2>" + t("新增账号明细", "Accounts added") + " (" + s.added.length + ")</h2>" + listTable(s.added, "created", t("创建日期", "Created")) +
        "<h2>" + t("删除账号明细", "Accounts removed") + " (" + s.removed.length + ")</h2>" + listTable(s.removed, "removedAt", t("删除日期", "Removed"));
    }
    // The page title is the file name the browser proposes for "Save as PDF" (Rick, 2026-10-13:
    // 「PDF文件名带有月份，便于查询和保存」): <school>_IT服务账单_<month or from_to>_<id>.
    var fileName = (school + "_" + t("IT服务账单", "IT-statement") + "_" + (per ? s.from + "_" + s.to : s.month) + (s.id ? "_" + s.id : "")).replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "");
    var html = "<!doctype html><html lang=\"" + (EN ? "en" : "zh-CN") + "\"><head><meta charset=\"utf-8\"><title>" + esc(fileName) + "</title><style>" +
      "body{font:13px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;color:#1d2433;margin:32px auto;max-width:760px;padding:0 24px}h1{font-size:20px;margin:0 0 4px}h2{font-size:14px;margin:24px 0 8px;border-bottom:1px solid #d9dee7;padding-bottom:4px}h3{font-size:12.5px;margin:12px 0 4px;color:#374151}.muted{color:#6b7280}table{border-collapse:collapse;width:100%;margin-top:6px}th,td{text-align:left;padding:5px 8px;border-bottom:1px solid #e5e9f0;font-size:12px;vertical-align:top}th{background:#f4f6fa;font-weight:600}td.num,th.num{text-align:right}.total td{font-weight:700;font-size:14px;border-top:2px solid #1d2433}.head{display:flex;justify-content:space-between;gap:24px;margin-bottom:16px}.box{border:1px solid #d9dee7;border-radius:8px;padding:12px 16px;margin-top:12px}@media print{body{margin:0}button{display:none}}" +
      "</style></head><body>" +
      '<div class="head"><div><h1>' + (per ? t("IT 服务账单", "IT service statement") : t("IT 服务月度账单", "Monthly IT service statement")) + '</h1><div class="muted">' + t("蜂巢 · Bridge Education Services", "Hive · Bridge Education Services") + "</div></div><div style=\"text-align:right\"><div><b>" + esc(s.id || "") + "</b></div><div class=\"muted\">" + t("生成于 ", "Generated ") + esc(day(s.generatedAt)) + "</div></div></div>" +
      '<div class="box"><div><b>' + esc(school) + "</b> · " + esc(s.domain) + "</div><div>" + t("计费期间：", "Period: ") + esc(s.period.start) + " → " + esc(s.period.end) + t("（北京时间）", " (Beijing time)") + (per ? t("，共 ", ", ") + fmtNum((s.rows || []).length) + t(" 个月", " months") : "") + "</div></div>" +
      main + rule + reconNote +
      (s.note ? '<p class="muted">' + esc(s.note) + "</p>" : "") +
      detail +
      '<p class="muted" style="margin-top:24px">' + t("账号数来自蜂巢管理中心的目录快照；账单由财务审核后发送。", "Counts come from the Hive Management Center's directory snapshots; statements are sent after review by finance.") + "</p>" +
      '<button id="fcPrint" type="button" style="margin-top:12px">' + t("打印 / 保存为 PDF", "Print / Save as PDF") + "</button></body></html>";
    var w = window.open("", "_blank");
    if (!w) { flash(t("浏览器拦截了新窗口，请允许弹出窗口后再试。", "The browser blocked the window; allow pop-ups and try again."), 5000); return; }
    w.document.open(); w.document.write(html); w.document.close();
    // bound from here: the window inherits the site's CSP, which allows no inline handlers (2026-10-22)
    var pb = w.document.getElementById("fcPrint"); if (pb) pb.addEventListener("click", function () { w.print(); });
  }
