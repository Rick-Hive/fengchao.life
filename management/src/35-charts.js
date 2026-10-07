// management/src/35-charts.js — The chart kit (inline SVG): lines, columns, bars, stat tiles, share bars, chart cards, 图/表 toggle, full screen.
// Part of management.js: scripts/build-management.js concatenates management/src/*.js in name order
// into management/management.js (one closure; every part sees every other's functions). Edit here, not the built file.
  // (api/shared/equip.js). Airtable stays the place they are entered; this is a view.
  // ================================================================================
  // Charts (inline SVG, no library). Rules followed: thin marks with rounded data
  // ends, 2px lines, >=8px markers with a surface ring, hairline grid, categorical
  // hues in a fixed order (validated: blue/orange/aqua/yellow pass CVD and the
  // normal-vision floor with direct labels), sequential = one hue, text never in
  // the series colour, a legend for >=2 series, hover tooltip on every mark, and a
  // table view behind every chart (图 / 表).
  // ================================================================================
  var VIZ = { cat: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"], seq: "#1d4a83", seq2: "#7fa9dc", seq3: "#cfe0f5", gray: "#b8c0cc", grid: "#e9edf3", ink: "#1b2430", muted: "#6b7787" };
  var vizDraws = [];
  function fmtNum(v) { return v == null ? "" : Math.round(v).toLocaleString(EN ? "en-US" : "zh-CN"); }
  function fmtMoney(v) { return v == null ? "" : "¥" + Math.round(v).toLocaleString(EN ? "en-US" : "zh-CN"); }
  function fmtCompact(v) { if (v == null) return ""; var a = Math.abs(v); return a >= 1e6 ? (v / 1e6).toFixed(1).replace(/\.0$/, "") + "M" : a >= 1e4 ? (v / 1e3).toFixed(0) + "K" : a >= 1e3 ? (v / 1e3).toFixed(1).replace(/\.0$/, "") + "K" : String(Math.round(v)); }
  function niceMax(v) { if (!v || v <= 0) return 1; var p = Math.pow(10, Math.floor(Math.log10(v))); var m = v / p; var n = m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10; return n * p; }
  // Gridlines: four steps, or one per unit when the top is a small count (no "1, 1, 1, 0, 0").
  function ticks(max) { var n = max < 4 ? Math.max(1, Math.round(max)) : 4; var out = []; for (var k = 0; k <= n; k++) out.push(max * k / n); return out; }
  // A category label cut to fit a pixel width (CJK glyphs count double), with the full text in a <title>.
  function fitLabel(label, px) {
    var w = 0, out = "";
    for (var i = 0; i < label.length; i++) { var cw = /[\u2e80-\u9fff\uf900-\ufaff\uff00-\uffef]/.test(label[i]) ? 12 : 6.6; if (w + cw > px - 8) return out + "…"; w += cw; out += label[i]; }
    return out;
  }
  function tipAttr(html) { return ' data-tip="' + esc(html) + '"'; }
  function tipRow(color, label, value, isLine) { return '<div class="tr"><span class="key" style="' + (isLine ? "border-top:2px solid " + color + ";height:0" : "background:" + color) + '"></span><b>' + esc(value) + "</b><span>" + esc(label) + "</span></div>"; }

  // A card with the chart drawn once its width is known (and again on resize).
  function chartCard(id, title, sub, draw, tableHtml) {
    vizDraws.push({ id: id, draw: draw });
    return '<div class="card viz" id="' + id + '"><div class="ch"><h2>' + esc(title) + (sub ? ' <span class="n">' + esc(sub) + "</span>" : "") + '</h2><div class="vtools"><div class="vtoggle" role="tablist"><button type="button" class="on" data-v="chart">' + t("图", "Chart") + '</button><button type="button" data-v="table">' + t("表", "Table") + '</button></div><button type="button" class="vfull" data-full="1" title="' + esc(t("全屏", "Full screen")) + '" aria-label="' + esc(t("全屏", "Full screen")) + '">⤢</button></div></div>' +
      '<div class="vbody"></div><div class="vtable hidden">' + tableHtml + "</div></div>";
  }
  // Full screen for one card (design §5 panel actions): the card lifts over the page,
  // its chart redrawn at the new width; ⤢ again or Esc puts it back.
  function cardFull(card, on) {
    document.querySelectorAll(".card.full").forEach(function (c) { if (c !== card) { c.classList.remove("full"); } });
    card.classList.toggle("full", on);
    document.body.classList.toggle("has-full", !!document.querySelector(".card.full"));
    var d = vizDraws.filter(function (x) { return x.id === card.id; })[0];
    if (d) { var body = card.querySelector(".vbody"); if (body && body.clientWidth) body.innerHTML = d.draw(body.clientWidth); }
  }
  $("content").addEventListener("click", function (e) {
    var b = e.target.closest("button.vfull"); if (!b) return;
    var card = b.closest(".card"); cardFull(card, !card.classList.contains("full"));
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") { var c = document.querySelector(".card.full"); if (c) cardFull(c, false); } });
  function drawCharts() {
    vizDraws = vizDraws.filter(function (d) { return $(d.id); });
    vizDraws.forEach(function (d) { var body = $(d.id).querySelector(".vbody"); var w = body.clientWidth; if (w > 0) body.innerHTML = d.draw(w); });
  }
  window.addEventListener("resize", debounce(drawCharts, 150));
  $("content").addEventListener("click", function (e) {
    var b = e.target.closest(".vtoggle button[data-v]"); if (!b) return;
    var card = b.closest(".card"); card.querySelectorAll(".vtoggle button[data-v]").forEach(function (x) { x.classList.toggle("on", x === b); });
    card.querySelector(".vbody").classList.toggle("hidden", b.getAttribute("data-v") !== "chart");
    card.querySelector(".vtable").classList.toggle("hidden", b.getAttribute("data-v") !== "table");
  });
  // One tooltip for every mark: data-tip carries ready HTML built with esc() above.
  var tip = document.createElement("div"); tip.className = "viztip"; tip.hidden = true; document.body.appendChild(tip);
  $("content").addEventListener("mousemove", function (e) {
    var m = e.target.closest("[data-tip]");
    if (!m) { tip.hidden = true; return; }
    tip.innerHTML = m.getAttribute("data-tip"); tip.hidden = false;
    var x = e.clientX + 14, y = e.clientY + 14;
    if (x + tip.offsetWidth > window.innerWidth - 8) x = e.clientX - tip.offsetWidth - 14;
    if (y + tip.offsetHeight > window.innerHeight - 8) y = e.clientY - tip.offsetHeight - 14;
    tip.style.left = x + "px"; tip.style.top = y + "px";
  });
  $("content").addEventListener("mouseleave", function () { tip.hidden = true; });

  function legend(series, isLine) {
    return '<div class="vlegend">' + series.map(function (s) { return '<span><i style="' + (isLine ? "border-top:2px solid " + s.color + ";height:0;width:14px" : "background:" + s.color) + '"></i>' + esc(s.name) + "</span>"; }).join("") + "</div>";
  }
  function dataTable(head, rows) {
    // Its own table class: a chart's table is compact, numbers right-aligned, and must not pick
    // up the data-table behaviours (sticky headings, draggable columns) that broke it in a card.
    return '<table class="vt"><thead><tr>' + head.map(function (h, i) { return '<th class="' + (i ? "num" : "") + '">' + esc(h) + "</th>"; }).join("") + "</tr></thead><tbody>" + rows.map(function (r) { return "<tr>" + r.map(function (c, i) { return '<td class="' + (i ? "num" : "") + '">' + esc(c) + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table>";
  }

  // Lines over categories (months). series: [{name, values, color, dash}]. fmt for tooltip/labels.
  function linesChart(w, o) {
    var h = o.height || 220, pl = 44, pr = 56, pt = 12, pb = 26, iw = Math.max(50, w - pl - pr), ih = h - pt - pb;
    var n = o.x.length, max = niceMax(Math.max.apply(null, o.series.map(function (s) { return Math.max.apply(null, s.values.map(function (v) { return v || 0; })); }).concat([0])));
    var X = function (i) { return pl + (n > 1 ? (i / (n - 1)) * iw : iw / 2); }, Y = function (v) { return pt + ih - (Math.max(0, v || 0) / max) * ih; };
    var g = "";
    ticks(max).forEach(function (tv) { var yy = Y(tv); g += '<line x1="' + pl + '" x2="' + (pl + iw) + '" y1="' + yy + '" y2="' + yy + '" stroke="' + VIZ.grid + '"/><text x="' + (pl - 8) + '" y="' + (yy + 4) + '" text-anchor="end" class="tk">' + fmtCompact(tv) + "</text>"; });
    var step = Math.ceil(n / Math.max(1, Math.floor(iw / 56)));
    o.x.forEach(function (lab, i) { if (i % step === 0 || i === n - 1) g += '<text x="' + X(i) + '" y="' + (h - 8) + '" text-anchor="middle" class="tk">' + esc(lab) + "</text>"; });
    // null = no value yet (a future month): the line stops there and the end label sits on the last real point.
    var paths = o.series.map(function (s) {
      var d = "", pen = false;
      s.values.forEach(function (v, i) { if (v == null) { pen = false; return; } d += (pen ? "L" : "M") + X(i).toFixed(1) + " " + Y(v).toFixed(1) + " "; pen = true; });
      var last = -1; s.values.forEach(function (v, i) { if (v != null) last = i; });
      if (last < 0) return "";
      return '<path d="' + d + '" fill="none" stroke="' + s.color + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"' + (s.dash ? ' stroke-dasharray="4 3"' : "") + "/>" +
        '<circle cx="' + X(last) + '" cy="' + Y(s.values[last]) + '" r="4" fill="' + s.color + '" stroke="#fff" stroke-width="2"/>' +
        '<text x="' + (X(last) + 8) + '" y="' + (Y(s.values[last]) + 4) + '" class="lbl">' + esc(o.fmt(s.values[last])) + "</text>";
    }).join("");
    // crosshair hit columns: one tooltip listing every series at that x
    var hits = o.x.map(function (lab, i) {
      var html = '<div class="th">' + esc(lab) + "</div>" + o.series.map(function (s) { return tipRow(s.color, s.name, s.values[i] == null ? "—" : o.fmt(s.values[i]), true); }).join("");
      var x0 = i ? (X(i - 1) + X(i)) / 2 : pl, x1 = i < n - 1 ? (X(i) + X(i + 1)) / 2 : pl + iw;
      return '<g class="hit"' + tipAttr(html) + '><rect x="' + x0 + '" y="' + pt + '" width="' + Math.max(1, x1 - x0) + '" height="' + ih + '" fill="transparent"/><line class="xh" x1="' + X(i) + '" x2="' + X(i) + '" y1="' + pt + '" y2="' + (pt + ih) + '" stroke="' + VIZ.muted + '"/>' + o.series.map(function (s) { return s.values[i] == null ? "" : '<circle class="xh" cx="' + X(i) + '" cy="' + Y(s.values[i]) + '" r="4" fill="' + s.color + '" stroke="#fff" stroke-width="2"/>'; }).join("") + "</g>";
    }).join("");
    return (o.series.length > 1 ? legend(o.series, true) : "") + '<svg class="viz-svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + " " + h + '">' + g + paths + hits + "</svg>";
  }

  // Columns per category, optionally stacked. series: [{name, values, color}].
  function columnsChart(w, o) {
    var h = o.height || 220, pl = 44, pr = 12, pt = 16, pb = 26, iw = Math.max(50, w - pl - pr), ih = h - pt - pb;
    var n = o.x.length, totals = o.x.map(function (_, i) { return o.series.reduce(function (a, s) { return a + (s.values[i] || 0); }, 0); });
    var max = niceMax(Math.max.apply(null, totals.concat([0])));
    var band = iw / n, bw = Math.min(24, band * 0.6), Y = function (v) { return (v / max) * ih; };
    var g = "";
    ticks(max).forEach(function (tv) { var yy = pt + ih - Y(tv); g += '<line x1="' + pl + '" x2="' + (pl + iw) + '" y1="' + yy + '" y2="' + yy + '" stroke="' + VIZ.grid + '"/><text x="' + (pl - 8) + '" y="' + (yy + 4) + '" text-anchor="end" class="tk">' + fmtCompact(tv) + "</text>"; });
    var step = Math.ceil(n / Math.max(1, Math.floor(iw / 48)));
    var bars = o.x.map(function (lab, i) {
      var x = pl + band * i + (band - bw) / 2, y = pt + ih, out = "";
      var html = '<div class="th">' + esc(lab) + "</div>" + o.series.map(function (s) { return tipRow(s.color, s.name, o.fmt(s.values[i])); }).join("") + (o.series.length > 1 ? tipRow("transparent", t("合计", "Total"), o.fmt(totals[i])) : "");
      o.series.forEach(function (s, si) {
        var v = s.values[i] || 0, hh = Y(v); if (!hh) return;
        var top = si === o.series.length - 1 || o.series.slice(si + 1).every(function (z) { return !(z.values[i] || 0); });
        y -= hh;
        out += top ? '<path d="M' + x + " " + (y + hh) + "V" + (y + 4) + "q0 -4 4 -4h" + (bw - 8) + "q4 0 4 4V" + (y + hh) + 'Z" fill="' + s.color + '"/>' : '<rect x="' + x + '" y="' + y + '" width="' + bw + '" height="' + Math.max(0, hh - 2) + '" fill="' + s.color + '"/>';
      });
      if (totals[i] && (o.labelAll || i === n - 1 || totals[i] === Math.max.apply(null, totals))) out += '<text x="' + (x + bw / 2) + '" y="' + (y - 5) + '" text-anchor="middle" class="lbl">' + esc(o.fmt(totals[i])) + "</text>";
      if (i % step === 0 || i === n - 1) out += '<text x="' + (x + bw / 2) + '" y="' + (h - 8) + '" text-anchor="middle" class="tk">' + esc(lab) + "</text>";
      return '<g class="hit"' + tipAttr(html) + '><rect x="' + (pl + band * i) + '" y="' + pt + '" width="' + band + '" height="' + ih + '" fill="transparent"/>' + out + "</g>";
    }).join("");
    return (o.series.length > 1 ? legend(o.series) : "") + '<svg class="viz-svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + " " + h + '">' + g + bars + "</svg>";
  }

  // Horizontal bars, one hue, value at the tip. rows: [{label, value, sub}].
  function barsChart(w, o) {
    var rowH = 30, pl = Math.min(170, Math.max(90, w * 0.32)), pr = 64, n = o.rows.length, h = n * rowH + 8;
    var iw = Math.max(40, w - pl - pr), max = Math.max.apply(null, o.rows.map(function (r) { return r.value || 0; }).concat([1]));
    var bars = o.rows.map(function (r, i) {
      var y = 4 + i * rowH, bw = Math.max(0, (r.value || 0) / max * iw), color = r.color || o.color || VIZ.seq;
      var html = '<div class="th">' + esc(r.label) + "</div>" + tipRow(color, r.sub || o.name || "", o.fmt(r.value));
      return '<g class="hit"' + tipAttr(html) + '><rect x="0" y="' + y + '" width="' + w + '" height="' + rowH + '" fill="transparent"/>' +
        '<text x="' + (pl - 10) + '" y="' + (y + rowH / 2 + 4) + '" text-anchor="end" class="cat"><title>' + esc(r.label) + "</title>" + esc(fitLabel(r.label, pl - 10)) + "</text>" +
        (bw ? '<path d="M' + pl + " " + (y + 5) + "h" + Math.max(0, bw - 4) + "q4 0 4 4v" + (rowH - 18) + "q0 4 -4 4H" + pl + 'Z" fill="' + color + '"/>' : "") +
        '<text x="' + (pl + bw + 8) + '" y="' + (y + rowH / 2 + 4) + '" class="lbl">' + esc(o.fmt(r.value)) + "</text></g>";
    }).join("");
    return '<svg class="viz-svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + " " + h + '">' + bars + "</svg>";
  }

  // A stat tile with an optional delta and sparkline (12 points, last one in the accent).
  function statTile(label, value, opts) {
    opts = opts || {};
    var delta = "";
    if (typeof opts.delta === "number" && isFinite(opts.delta)) { var up = opts.delta >= 0, good = opts.upIsGood === false ? !up : up; delta = '<span class="delta ' + (good ? "good" : "bad") + '">' + (up ? "▲" : "▼") + " " + Math.abs(Math.round(opts.delta * 100)) + "%</span>" + (opts.vs ? '<span class="vs">' + esc(opts.vs) + "</span>" : ""); }
    var spark = "";
    if (opts.spark && opts.spark.length > 1) {
      var vals = opts.spark, w = 96, h = 28, max = Math.max.apply(null, vals.concat([1]));
      var pts = vals.map(function (v, i) { return [(i / (vals.length - 1)) * (w - 4) + 2, h - 3 - ((v || 0) / max) * (h - 8)]; });
      spark = '<svg class="spark" viewBox="0 0 ' + w + " " + h + '" preserveAspectRatio="xMaxYMax meet"><path d="' + pts.map(function (p, i) { return (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1); }).join(" ") + '" fill="none" stroke="' + VIZ.gray + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/><circle cx="' + pts[pts.length - 1][0] + '" cy="' + pts[pts.length - 1][1] + '" r="3.5" fill="' + VIZ.seq + '" stroke="#fff" stroke-width="2"/></svg>';
    }
    return '<div class="kpi stat' + (opts.cls ? " " + opts.cls : "") + '"' + (opts.attr || "") + '><div class="l">' + esc(label) + '</div><div class="vrow"><div class="v' + (opts.warn ? " warn" : "") + '">' + value + "</div>" + spark + "</div>" + (delta || opts.sub ? '<div class="s">' + delta + (opts.sub ? '<span>' + esc(opts.sub) + "</span>" : "") + "</div>" : "") + "</div>";
  }
  // A one-row stacked bar of shares with direct labels under it (part-to-whole).
  function shareBar(parts, total) {
    total = total || parts.reduce(function (a, p) { return a + p.value; }, 0) || 1;
    return '<div class="sharebar">' + parts.map(function (p) { return '<i style="width:' + (p.value / total * 100) + "%;background:" + p.color + '"' + tipAttr('<div class="th">' + esc(p.label) + "</div>" + tipRow(p.color, "", fmtNum(p.value) + " · " + Math.round(p.value / total * 100) + "%")) + "></i>"; }).join("") + "</div>" +
      '<div class="sharekeys">' + parts.map(function (p) { return '<span><i style="background:' + p.color + '"></i>' + esc(p.label) + ' <b>' + fmtNum(p.value) + "</b></span>"; }).join("") + "</div>";
  }
