// management/src/45-royalty.js — 经营 › 版税结算.
// Part of management.js: scripts/build-management.js concatenates management/src/*.js in name order
// into management/management.js (one closure; every part sees every other's functions). Edit here, not the built file.

  // ================================================================================
  // 经营 › 版税结算 — the finance director's table (design §5): publisher × calendar
  // quarter, sales / royalty due / paid. The CEO reads it; finance marks payments.
  // ================================================================================
  var royaltyState = { data: null, quarters: 8 };
  function viewRoyalty() {
    setTitle(t("经营 › 版税结算", "Operations › Royalties"), t("版税结算表", "Royalty settlements"),
      '<select id="rQuarters" class="sm">' + [4, 8, 12].map(function (n) { return '<option value="' + n + '"' + (royaltyState.quarters === n ? " selected" : "") + ">" + t("最近 " + n + " 个季度", "Last " + n + " quarters") + "</option>"; }).join("") + '</select> <button class="btn secondary sm" id="rCsv">' + t("导出 CSV", "Export CSV") + "</button>",
      { info: t("按出版社、按日历季度：销售额、应付版税、是否已付。每行明细的版税 = Airtable 已算出的版税金额，没有时用 销售额 × 该教材的版税率。标记「已付」只记录结算进度，不改 Airtable。", "By publisher and calendar quarter: sales, royalty due, paid or not. A line's royalty is Airtable's royalty amount when present, else sales × the title's rate. Marking a quarter paid records settlement progress only; nothing in Airtable changes.") });
    $("content").innerHTML = '<div class="card"><div class="tbl-wrap in"><table class="data" id="rtable"><thead><tr><th>' + t("出版社", "Publisher") + "</th></tr></thead><tbody><tr><td class=\"loading\">" + t("载入中…", "Loading…") + '</td></tr></tbody></table></div><p class="hint" id="rfoot"></p></div>';
    $("rQuarters").addEventListener("change", function () { royaltyState.quarters = +this.value; loadRoyalty().then(renderRoyalty); });
    $("rCsv").addEventListener("click", exportRoyaltyCsv);
    $("rtable").addEventListener("click", function (e) {
      var b = e.target.closest("button[data-pay]"); if (!b) return;
      var pub = b.getAttribute("data-pub"), q = b.getAttribute("data-q"), paid = b.getAttribute("data-pay") === "1", amount = +b.getAttribute("data-amount");
      if (paid && !window.confirm(t("标记 " + pub + " " + q + " 的版税（" + fmtMoney(amount) + "）为已付？", "Mark " + pub + " " + q + " royalty (" + fmtMoney(amount) + ") as paid?"))) return;
      savingButton(b, "…");
      post("crm/royalty", "POST", { key: pub, quarter: q, paid: paid, amount: amount }).then(function (r) {
        if (!r.ok) { restoreButton(b); flash(esc(errText(r)), 6000); return; }
        if (r.body.mark) royaltyState.data.paid[r.body.key] = r.body.mark; else delete royaltyState.data.paid[r.body.key];
        renderRoyalty();
      });
    });
    loadRoyalty().then(renderRoyalty).catch(function (r) { $("rtable").tBodies[0].innerHTML = '<tr><td class="loading">' + esc(errText(r)) + "</td></tr>"; });
  }
  function loadRoyalty() { return api("crm/royalty?quarters=" + royaltyState.quarters).then(function (r) { if (!r.ok) throw r; royaltyState.data = r.body; return r.body; }); }
  function renderRoyalty() {
    var d = royaltyState.data; if (!d || !$("rtable")) return;
    var qs = d.quarters, paid = d.paid || {};
    $("rtable").tHead.innerHTML = "<tr><th>" + t("出版社", "Publisher") + "</th>" + qs.map(function (q) { return '<th class="num">' + esc(q) + "</th>"; }).join("") + '<th class="num">' + t("合计应付", "Total due") + "</th></tr>";
    var cell = function (p, q) {
      var c = p.cells[q]; if (!c) return '<td class="num muted">—</td>';
      var key = (p.key || p.publisher) + "|" + q, pm = paid[key];
      return '<td class="num rc' + (pm ? " paid" : "") + '"><div class="due">' + fmtMoney(c.royalty) + (c.unknown ? ' <span class="tag warn" title="' + esc(t(c.unknown + " 行没有版税率", c.unknown + " lines without a rate")) + '">?</span>' : "") + '</div><div class="sales">' + esc(t("销售 ", "sales ") + fmtMoney(c.sales)) + "</div>" +
        (pm ? '<div class="pm"><span class="tag ok">' + t("已付", "Paid") + "</span> " + esc(day(pm.at)) + (d.canPay ? ' <button type="button" class="link" data-pay="0" data-pub="' + esc(p.key || p.publisher) + '" data-q="' + esc(q) + '">' + t("撤销", "undo") + "</button>" : "") + "</div>" : (d.canPay && c.royalty > 0 ? '<div class="pm"><button type="button" class="btn secondary sm" data-pay="1" data-pub="' + esc(p.key || p.publisher) + '" data-q="' + esc(q) + '" data-amount="' + c.royalty + '">' + t("标记已付", "Mark paid") + "</button></div>" : "")) + "</td>";
    };
    $("rtable").tBodies[0].innerHTML = d.publishers.map(function (p) {
      return "<tr><td><b>" + esc(p.publisher) + "</b>" + (p.recipient ? '<span class="sub">' + esc(p.recipient) + "</span>" : "") + '<span class="sub">' + esc(t("版税率 ", "rate ") + (p.rates.length ? p.rates.map(function (r) { return Math.round(r * 100) + "%"; }).join(" / ") : "—")) + "</span></td>" + qs.map(function (q) { return cell(p, q); }).join("") + '<td class="num"><b>' + fmtMoney(p.royaltyTotal) + "</b></td></tr>";
    }).join("") + '<tr class="total"><td>' + t("合计", "Total") + "</td>" + qs.map(function (q) { var tq = d.totals[q] || { sales: 0, royalty: 0 }; return '<td class="num"><div class="due"><b>' + fmtMoney(tq.royalty) + '</b></div><div class="sales">' + esc(t("销售 ", "sales ") + fmtMoney(tq.sales)) + "</div></td>"; }).join("") + '<td class="num"><b>' + fmtMoney(d.publishers.reduce(function (a, p) { return a + p.royaltyTotal; }, 0)) + "</b></td></tr>";
    $("rfoot").textContent = (d.syncedAt ? t("数据同步于 ", "Data synced ") + when(d.syncedAt) + " · " : "") + t("季度为日历季度；带 ? 的格子里有教材没有版税率，请在 Airtable 的 Curriculums 表补上。", "Calendar quarters; a ? means some titles in that cell have no royalty rate — add it on the Airtable Curriculums table.");
  }
  function exportRoyaltyCsv() {
    var d = royaltyState.data; if (!d) return;
    var cell = function (v) { v = String(v == null ? "" : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var head = [t("出版社", "Publisher"), t("收款方", "Recipient"), t("版税率", "Rate"), t("季度", "Quarter"), t("销售额", "Sales"), t("应付版税", "Royalty due"), t("件数", "Units"), t("已付", "Paid"), t("付款日期", "Paid on")].join(",");
    var lines = [];
    d.publishers.forEach(function (p) { d.quarters.forEach(function (q) { var c = p.cells[q]; if (!c) return; var pm = (d.paid || {})[(p.key || p.publisher) + "|" + q]; lines.push([p.publisher, p.recipient, p.rates.map(function (r) { return Math.round(r * 100) + "%"; }).join(" / "), q, Math.round(c.sales), Math.round(c.royalty * 100) / 100, c.units, pm ? "Y" : "", pm ? String(pm.at).slice(0, 10) : ""].map(cell).join(",")); }); });
    var blob = new Blob(["\ufeff" + [head].concat(lines).join("\r\n")], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "royalties-" + new Date().toISOString().slice(0, 10) + ".csv"; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }
