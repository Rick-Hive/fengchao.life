// management/src/47-statements.js — 经营 › 对账单 (IT service statements).
// Part of management.js: scripts/build-management.js concatenates management/src/*.js in name order
// into management/management.js (one closure; every part sees every other's functions). Edit here, not the built file.

  // ================================================================================
  // 经营 › 对账单 — one month, every school: the accounts on the 1st and the next 1st,
  // who came and went, licensed × (price ÷ 12) minus the discount finance enters
  // (Rick, 2026-10-12). Rows are previews until 生成账单 saves a draft; then
  // draft → sent → paid. The statement prints from the panel (打印 / PDF).
  // ================================================================================
  var stmState = { month: "", data: null, open: null };
  var STM_ST = { draft: ["草稿", "Draft", "warn"], sent: ["已发送", "Sent", "accent"], paid: ["已收款", "Paid", "ok"] };
  function stmMoney(v, cur) { if (v == null) return "—"; var n = Number(v).toLocaleString(EN ? "en-US" : "zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); return (cur === "CNY" ? "¥" : cur === "USD" ? "$" : (cur || "") + " ") + n; }
  function stmMonthLabel(m) { if (!m) return ""; var p = m.split("-"); return EN ? ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][+p[1] - 1] + " " + p[0] : p[0] + " 年 " + (+p[1]) + " 月"; }
  function stmStatusTag(st) { if (!st) return '<span class="tag muted">' + t("未生成", "Not generated") + "</span>"; var d = STM_ST[st] || [st, st, ""]; return '<span class="tag ' + d[2] + '">' + esc(t(d[0], d[1])) + "</span>"; }
  function canSeeStatements() { return isAdmin() || crmLevel("money") !== "none" || crmLevel("partners") !== "none"; }
  function viewStatements() {
    if (!stmState.month) { var d = new Date(Date.now() + 8 * 3600 * 1000); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1); stmState.month = d.toISOString().slice(0, 7); }
    setTitle(t("经营 › 对账单", "Operations › Statements"), t("IT 服务月度账单", "Monthly IT statements"),
      '<input type="month" id="stMonth" class="sm" value="' + esc(stmState.month) + '" /> <button class="btn secondary sm" id="stCsv">' + t("导出 CSV", "Export CSV") + '</button> <button class="btn secondary sm" id="stReload">' + t("刷新", "Refresh") + "</button>",
      { info: t("每所学校一个月一张账单：账号数取该月 1 号和下月 1 号的目录快照（夜间同步在 1 号凌晨保存），可计费 = 有 A1 许可证的账号；金额 = (可计费 − 扣减) × 每账号年费 ÷ 12，年费和币种来自该校的 IT 服务合作关系（默认 5 美元）。先看预览，填扣减账号数，点「生成账单」保存为草稿；发送和收款由财务手工标记。明细列出当月新增和删除的账号。", "One statement per school per month: the accounts on the 1st and on the next 1st come from the directory's monthly snapshots (saved by the nightly sync in the small hours of the 1st); billable = accounts holding an A1 licence; amount = (billable − discount) × price per account per year ÷ 12, price and currency from the school's IT relationship (default USD 5). Review the preview, enter the discount, press Generate to save a draft; sending and payment are marked by finance by hand. The detail lists the accounts added and removed in the month.") });
    $("content").innerHTML = '<div class="kpis strip" id="stkpi"></div><div class="tbl-wrap"><table class="data" id="sttable"><thead><tr><th>' + t("学校", "School") + '</th><th class="num">' + t("期初", "Start") + '</th><th class="num">' + t("期末", "End") + '</th><th class="num">' + t("新增", "Added") + '</th><th class="num">' + t("删除", "Removed") + '</th><th class="num">' + t("可计费", "Billable") + '</th><th class="num">' + t("扣减", "Discount") + '</th><th class="num">' + t("金额", "Amount") + "</th><th>" + t("状态", "Status") + '</th></tr></thead><tbody><tr><td colspan="9" class="loading">' + t("载入中…", "Loading…") + '</td></tr></tbody></table></div><p class="muted" id="stfoot" style="font-size:.8rem"></p>';
    $("stMonth").addEventListener("change", function () { if (!this.value) return; stmState.month = this.value; loadStatements().then(renderStatements); });
    $("stReload").addEventListener("click", function () { loadStatements().then(renderStatements); });
    $("stCsv").addEventListener("click", exportStatementsCsv);
    $("sttable").addEventListener("click", function (e) {
      var tr = e.target.closest("tr[data-domain]"); if (!tr) return;
      document.querySelectorAll("table.data tr.sel").forEach(function (x) { x.classList.remove("sel"); }); tr.classList.add("sel");
      openStatementPanel(tr.getAttribute("data-domain"), stmState.month);
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
    $("stkpi").innerHTML = statTile(t("计费学校", "Schools billed"), fmtNum(billed.length), { sub: t("有 IT 服务合作关系的学校", "schools with an IT relationship") }) +
      statTile(t("可计费账号", "Billable accounts"), fmtNum(d.totals.billable), { sub: t("期末有 A1 许可证", "licensed on the next 1st") }) +
      statTile(t("本月合计", "Month total"), stmMoney(d.totals.amount, cur), { sub: t("扣减后", "after discounts") }) +
      statTile(t("账单进度", "Progress"), gen + " / " + billed.length, { sub: t("已生成 · 已发送 ", "generated · sent ") + sent + t(" · 已收款 ", " · paid ") + paid });
    var num = function (v) { return '<td class="num">' + (v == null ? '<span class="muted">—</span>' : fmtNum(v)) + "</td>"; };
    $("sttable").tBodies[0].innerHTML = rows.length ? rows.map(function (r) {
      var c = r.counts || {};
      var warn = r.reconstructed && (r.reconstructed.start || r.reconstructed.end) ? ' <span class="tag warn" title="' + esc(t("该月没有完整的 1 号快照，账号数按当前账号和删除记录推算", "No complete snapshot for the 1st: counts are reconstructed from the current accounts and the removal ledger")) + '">' + t("推算", "Reconstructed") + "</span>" : "";
      return '<tr class="pick' + (r.relationship ? "" : " dim") + '" data-domain="' + esc(r.domain) + '"><td><b>' + esc(stmSchool(r)) + "</b>" + (r.relationship ? "" : ' <span class="tag muted">' + t("无 IT 服务关系", "No IT relationship") + "</span>") + warn + '<span class="sub">' + esc(r.domain) + (r.id ? " · " + esc(r.id) : "") + "</span></td>" +
        num(c.start && c.start.total) + num(c.end && c.end.total) + num(c.added) + num(c.removed) + num(r.billable) + num(r.discount) +
        '<td class="num">' + (r.error ? '<span class="tag bad">' + esc(r.error) + "</span>" : "<b>" + stmMoney(r.amount, r.currency) + "</b>") + "</td><td>" + stmStatusTag(r.status) + "</td></tr>";
    }).join("") : '<tr><td colspan="9" class="empty">' + t("没有学校。", "No schools.") + "</td></tr>";
    $("stfoot").textContent = t("计费期间 ", "Period ") + d.period.start + " → " + d.period.end + t("（北京时间）· 账号数来自目录快照；未生成的行是预览，扣减默认沿用上月。", " (Beijing) · counts from the directory snapshots; rows not yet generated are previews, the discount defaults to last month's.");
  }
  function exportStatementsCsv() {
    var d = stmState.data; if (!d) return;
    var cell = function (v) { v = String(v == null ? "" : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var head = [t("学校", "School"), t("域名", "Domain"), t("月份", "Month"), t("期初", "Start"), t("期末", "End"), t("新增", "Added"), t("删除", "Removed"), t("可计费", "Billable"), t("扣减", "Discount"), t("金额", "Amount"), t("币种", "Currency"), t("状态", "Status"), t("账单号", "Statement")];
    var lines = d.rows.map(function (r) { var c = r.counts || {}; return [stmSchool(r), r.domain, d.month, c.start ? c.start.total : "", c.end ? c.end.total : "", c.added, c.removed, r.billable, r.discount, r.amount, r.currency, r.status || "", r.id || ""].map(cell).join(","); });
    var blob = new Blob(["﻿" + [head.map(cell).join(",")].concat(lines).join("\r\n")], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "statements-" + d.month + ".csv"; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }
  // The panel: the statement (saved or preview), the discount, generate / status / print.
  function openStatementPanel(domain, month, discount) {
    panelOpen('<div class="ph"><h3>' + esc(domain) + '</h3><button class="x" type="button" aria-label="close">✕</button></div><div class="pb"><div class="loading">' + t("载入中…", "Loading…") + "</div></div>");
    api("crm/statement?domain=" + encodeURIComponent(domain) + "&month=" + encodeURIComponent(month) + (discount != null ? "&discount=" + encodeURIComponent(discount) : "")).then(function (r) {
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
    var acctRow = function (a, dateKey) { return '<div class="devrow"><div class="m"><b>' + esc(a.displayName || a.upn) + "</b><small>" + esc(a.upn) + " · " + (a.plan === "student" ? t("学生版", "A1 students") : a.plan === "faculty" ? t("教职工版", "A1 faculty") : t("无许可证", "no licence")) + (a[dateKey] ? " · " + esc(day(a[dateKey])) : "") + "</small></div></div>"; };
    $("panel").querySelector(".ph h3").textContent = school + " · " + stmMonthLabel(s.month);
    $("panel").querySelector(".pb").innerHTML =
      '<div class="kv">' +
        '<span class="k">' + t("账单", "Statement") + "</span><span>" + (s.id ? "<b>" + esc(s.id) + "</b> " : "") + stmStatusTag(saved ? s.status : null) + "</span>" +
        '<span class="k">' + t("期间", "Period") + "</span><span>" + esc(s.period.start) + " → " + esc(s.period.end) + "</span>" +
        '<span class="k">' + t("期初账号", "Accounts at start") + "</span><span>" + fmtNum(c.start.total) + t("（有许可证 ", " (licensed ") + fmtNum(c.start.licensed) + "）</span>" +
        '<span class="k">' + t("期末账号", "Accounts at end") + "</span><span>" + fmtNum(c.end.total) + t("（有许可证 ", " (licensed ") + fmtNum(c.end.licensed) + t("：学生版 ", ": students ") + fmtNum(c.end.student) + t("，教职工版 ", ", faculty ") + fmtNum(c.end.faculty) + (c.end.disabled ? t("；已停用 ", "; disabled ") + fmtNum(c.end.disabled) : "") + "）</span>" +
        '<span class="k">' + t("变动", "Changes") + "</span><span>" + t("新增 ", "added ") + fmtNum(c.added) + t("，删除 ", ", removed ") + fmtNum(c.removed) + "</span>" +
        '<span class="k">' + t("单价", "Price") + "</span><span>" + stmMoney(s.unitPriceYear, cur) + t(" / 账号 / 年", " per account per year") + (s.relationship ? ' <span class="muted">' + esc(s.relationship) + "</span>" : ' <span class="tag muted">' + t("无 IT 服务关系：按默认价", "No IT relationship: default price") + "</span>") + "</span>" +
      "</div>" +
      (recon ? '<div class="msg err">' + t("该月没有完整的 1 号快照（" + (s.reconstructed.start ? "期初" : "") + (s.reconstructed.start && s.reconstructed.end ? "、" : "") + (s.reconstructed.end ? "期末" : "") + "），账号数按当前账号的创建日期和删除记录推算。从下个月起夜间同步会在 1 号保存快照。", "No complete snapshot for the 1st (" + [s.reconstructed.start ? "start" : "", s.reconstructed.end ? "end" : ""].filter(Boolean).join(", ") + "): counts are reconstructed from the current accounts' created dates and the removal ledger. From next month the nightly sync saves a snapshot on the 1st.") + "</div>" : "") +
      "<h4>" + t("金额", "Amount") + "</h4>" +
      '<div class="kv"><span class="k">' + t("可计费账号", "Billable") + "</span><span><b>" + fmtNum(s.billable) + "</b> " + t("（期末有 A1 许可证）", "(licensed on the next 1st)") + "</span>" +
        '<span class="k">' + t("扣减账号", "Discount") + "</span><span>" + (editable ? '<input type="number" id="stDisc" min="0" max="' + s.billable + '" step="1" value="' + esc(s.discount) + '" style="width:90px" /> <span class="muted">' + t("不计费的账号数", "accounts not billed") + "</span>" : fmtNum(s.discount)) + "</span>" +
        '<span class="k">' + t("应收", "Due") + '</span><span><b id="stAmt">' + stmMoney(s.amount, cur) + "</b> <span class=\"muted\">= (" + fmtNum(s.billable) + " − <span id=\"stDiscShow\">" + fmtNum(s.discount) + "</span>) × " + stmMoney(s.unitPriceYear, cur) + " ÷ 12</span></span>" +
        (editable ? '<span class="k">' + t("备注", "Note") + '</span><span><input type="text" id="stNote" maxlength="500" value="' + esc(s.note || "") + '" /></span>' : (s.note ? '<span class="k">' + t("备注", "Note") + "</span><span>" + esc(s.note) + "</span>" : "")) +
      "</div>" +
      '<div class="actions">' +
        (editable ? '<button class="btn" type="button" id="stGen">' + (saved ? t("重新生成账单", "Regenerate statement") : t("生成账单", "Generate statement")) + "</button>" : "") +
        (saved ? '<button class="btn secondary" type="button" id="stPrint">' + t("打印 / PDF", "Print / PDF") + "</button>" : "") +
        (canEdit && saved && s.status === "draft" ? '<button class="btn secondary" type="button" data-st="sent">' + t("标为已发送", "Mark sent") + "</button>" : "") +
        (canEdit && saved && s.status === "sent" ? '<button class="btn secondary" type="button" data-st="paid">' + t("标为已收款", "Mark paid") + '</button><button class="btn secondary" type="button" data-st="draft">' + t("退回草稿", "Back to draft") + "</button>" : "") +
        (canEdit && saved && s.status === "paid" ? '<button class="btn secondary" type="button" data-st="sent">' + t("撤销收款", "Undo paid") + "</button>" : "") +
      '</div><div id="stMsg"></div>' +
      (saved ? '<p class="muted" style="font-size:12px">' + t("生成于 ", "Generated ") + esc(when(s.generatedAt)) + (s.sentAt ? t(" · 发送于 ", " · sent ") + esc(when(s.sentAt)) : "") + (s.paidAt ? t(" · 收款于 ", " · paid ") + esc(when(s.paidAt)) : "") + "</p>" : "") +
      "<h4>" + t("新增账号", "Accounts added") + " · " + fmtNum(s.added.length) + '</h4><div class="stlist">' + (s.added.length ? s.added.map(function (a) { return acctRow(a, "created"); }).join("") : '<div class="muted" style="font-size:.86rem">' + t("无", "None") + "</div>") + "</div>" +
      "<h4>" + t("删除账号", "Accounts removed") + " · " + fmtNum(s.removed.length) + '</h4><div class="stlist">' + (s.removed.length ? s.removed.map(function (a) { return acctRow(a, "removedAt"); }).join("") : '<div class="muted" style="font-size:.86rem">' + t("无", "None") + "</div>") + "</div>" +
      (s.history && s.history.length ? "<h4>" + t("记录", "History") + '</h4><div class="stlist">' + s.history.slice().reverse().map(function (h) { return '<div class="devrow"><div class="m"><b>' + esc(h.action === "status" ? t("状态 ", "Status ") + (STM_ST[h.from] ? t(STM_ST[h.from][0], STM_ST[h.from][1]) : h.from) + " → " + (STM_ST[h.to] ? t(STM_ST[h.to][0], STM_ST[h.to][1]) : h.to) : h.action === "regenerated" ? t("重新生成", "Regenerated") : t("生成", "Generated")) + "</b><small>" + esc(when(h.at)) + " · " + esc(h.by || "") + (h.note ? " · " + esc(h.note) : "") + (h.amount != null ? " · " + stmMoney(h.amount, cur) : "") + "</small></div></div>"; }).join("") + "</div>" : "");
    var pb = $("panel").querySelector(".pb");
    var disc = $("stDisc");
    if (disc) disc.addEventListener("input", function () { var v = Math.max(0, Math.min(s.billable, Math.round(+disc.value || 0))); $("stDiscShow").textContent = fmtNum(v); $("stAmt").textContent = stmMoney(Math.round((s.billable - v) * s.unitPriceYear / 12 * 100) / 100, cur); });
    pb.addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b) return;
      if (b.id === "stGen") {
        savingButton(b, t("生成中…", "Generating…"));
        post("crm/statement", "POST", { op: "generate", domain: s.domain, month: s.month, discount: disc ? +disc.value : s.discount, note: $("stNote") ? $("stNote").value.trim() : "" }).then(function (r) {
          if (!r.ok) { restoreButton(b); $("stMsg").innerHTML = '<div class="msg err">' + esc(errText(r)) + "</div>"; return; }
          renderStatementPanel(r.body.statement, true, true); loadStatements().then(renderStatements);
          flash(t("账单 ", "Statement ") + esc(r.body.statement.id) + t(" 已保存为草稿。", " saved as a draft."), 4000);
        });
        return;
      }
      if (b.id === "stPrint") { printStatement(s); return; }
      var st = b.getAttribute("data-st");
      if (st) {
        var note = st === "paid" ? window.prompt(t("收款备注（可留空，如银行到账日期）：", "Payment note (optional, e.g. the bank date):"), "") : "";
        if (note === null) return;
        savingButton(b, "…");
        post("crm/statement", "POST", { op: "status", domain: s.domain, month: s.month, status: st, note: note }).then(function (r) {
          if (!r.ok) { restoreButton(b); $("stMsg").innerHTML = '<div class="msg err">' + esc(errText(r)) + "</div>"; return; }
          renderStatementPanel(r.body.statement, true, true); loadStatements().then(renderStatements);
        });
      }
    });
  }
  // The printable statement: a plain page in a new window; the browser's print dialog saves it as PDF.
  function printStatement(s) {
    var school = pickName(s.school && s.school.name, s.school && s.school.nameEn) || s.domain, cur = s.currency;
    var row = function (a, dateKey) { return "<tr><td>" + esc(a.displayName || "") + "</td><td>" + esc(a.upn) + "</td><td>" + (a.plan === "student" ? t("学生版", "A1 students") : a.plan === "faculty" ? t("教职工版", "A1 faculty") : t("无", "none")) + "</td><td>" + esc(a[dateKey] ? day(a[dateKey]) : "") + "</td></tr>"; };
    var html = "<!doctype html><html lang=\"" + (EN ? "en" : "zh-CN") + "\"><head><meta charset=\"utf-8\"><title>" + esc(s.id || "statement") + " · " + esc(school) + "</title><style>" +
      "body{font:13px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;color:#1d2433;margin:32px auto;max-width:760px;padding:0 24px}h1{font-size:20px;margin:0 0 4px}h2{font-size:14px;margin:24px 0 8px;border-bottom:1px solid #d9dee7;padding-bottom:4px}.muted{color:#6b7280}table{border-collapse:collapse;width:100%;margin-top:6px}th,td{text-align:left;padding:5px 8px;border-bottom:1px solid #e5e9f0;font-size:12px;vertical-align:top}th{background:#f4f6fa;font-weight:600}td.num,th.num{text-align:right}.total td{font-weight:700;font-size:14px;border-top:2px solid #1d2433}.head{display:flex;justify-content:space-between;gap:24px;margin-bottom:16px}.box{border:1px solid #d9dee7;border-radius:8px;padding:12px 16px;margin-top:12px}@media print{body{margin:0}button{display:none}}" +
      "</style></head><body>" +
      '<div class="head"><div><h1>' + t("IT 服务月度账单", "Monthly IT service statement") + '</h1><div class="muted">' + t("蜂巢 · Bridge Education Services", "Hive · Bridge Education Services") + "</div></div><div style=\"text-align:right\"><div><b>" + esc(s.id || "") + "</b></div><div class=\"muted\">" + t("生成于 ", "Generated ") + esc(day(s.generatedAt)) + "</div></div></div>" +
      '<div class="box"><div><b>' + esc(school) + "</b> · " + esc(s.domain) + "</div><div>" + t("计费期间：", "Period: ") + esc(s.period.start) + " → " + esc(s.period.end) + t("（北京时间）", " (Beijing time)") + "</div></div>" +
      "<h2>" + t("账号与金额", "Accounts and amount") + "</h2><table><tr><th>" + t("项目", "Item") + '</th><th class="num">' + t("数量", "Count") + "</th></tr>" +
      "<tr><td>" + t("期初账号（" + s.period.start + "）", "Accounts on " + s.period.start) + '</td><td class="num">' + fmtNum(s.counts.start.total) + "</td></tr>" +
      "<tr><td>" + t("新增账号", "Accounts added") + '</td><td class="num">+' + fmtNum(s.counts.added) + "</td></tr>" +
      "<tr><td>" + t("删除账号", "Accounts removed") + '</td><td class="num">−' + fmtNum(s.counts.removed) + "</td></tr>" +
      "<tr><td>" + t("期末账号（" + s.period.end + "）", "Accounts on " + s.period.end) + '</td><td class="num">' + fmtNum(s.counts.end.total) + "</td></tr>" +
      "<tr><td>" + t("其中有 Office 365 A1 许可证（可计费）", "of which licensed with Office 365 A1 (billable)") + '</td><td class="num">' + fmtNum(s.billable) + "</td></tr>" +
      "<tr><td>" + t("扣减账号", "Discount (accounts not billed)") + '</td><td class="num">−' + fmtNum(s.discount) + "</td></tr>" +
      "<tr><td>" + t("计费账号", "Accounts billed") + '</td><td class="num">' + fmtNum(s.billable - s.discount) + "</td></tr>" +
      "<tr><td>" + t("单价", "Price") + '</td><td class="num">' + stmMoney(s.unitPriceYear, cur) + t(" / 账号 / 年（÷ 12）", " per account per year (÷ 12)") + "</td></tr>" +
      '<tr class="total"><td>' + t("本月应收", "Amount due") + '</td><td class="num">' + stmMoney(s.amount, cur) + "</td></tr></table>" +
      (s.note ? '<p class="muted">' + esc(s.note) + "</p>" : "") +
      "<h2>" + t("新增账号明细", "Accounts added") + " (" + s.added.length + ")</h2>" + (s.added.length ? "<table><tr><th>" + t("姓名", "Name") + "</th><th>" + t("账号", "Account") + "</th><th>" + t("许可证", "Licence") + "</th><th>" + t("创建日期", "Created") + "</th></tr>" + s.added.map(function (a) { return row(a, "created"); }).join("") + "</table>" : '<p class="muted">' + t("无", "None") + "</p>") +
      "<h2>" + t("删除账号明细", "Accounts removed") + " (" + s.removed.length + ")</h2>" + (s.removed.length ? "<table><tr><th>" + t("姓名", "Name") + "</th><th>" + t("账号", "Account") + "</th><th>" + t("许可证", "Licence") + "</th><th>" + t("删除日期", "Removed") + "</th></tr>" + s.removed.map(function (a) { return row(a, "removedAt"); }).join("") + "</table>" : '<p class="muted">' + t("无", "None") + "</p>") +
      '<p class="muted" style="margin-top:24px">' + t("账号数来自蜂巢管理中心的目录快照；账单由财务审核后发送。", "Counts come from the Hive Management Center's directory snapshots; statements are sent after review by finance.") + "</p>" +
      '<button onclick="window.print()" style="margin-top:12px">' + t("打印 / 保存为 PDF", "Print / Save as PDF") + "</button></body></html>";
    var w = window.open("", "_blank");
    if (!w) { flash(t("浏览器拦截了新窗口，请允许弹出窗口后再试。", "The browser blocked the window; allow pop-ups and try again."), 5000); return; }
    w.document.open(); w.document.write(html); w.document.close();
  }
