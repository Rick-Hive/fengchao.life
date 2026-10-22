// Moved out of help/teams-flow.html so the Content-Security-Policy can drop 'unsafe-inline' for scripts (2026-10-22).
(function () {
  "use strict";
  var LANG = "zh";
  try { var s = localStorage.getItem("fc-lang"); if (s === "en" || s === "zh") LANG = s; } catch (e) {}
  if (LANG === "en") {
    document.documentElement.lang = "en";
    document.title = "Setup flowchart · Hive Help";
    Array.prototype.forEach.call(document.querySelectorAll("[data-en]"), function (el) { el.innerHTML = el.getAttribute("data-en"); });
    Array.prototype.forEach.call(document.querySelectorAll("[data-en-label]"), function (el) { el.setAttribute("aria-label", el.getAttribute("data-en-label")); });
    Array.prototype.forEach.call(document.querySelectorAll("[data-en-title]"), function (el) { el.title = el.getAttribute("data-en-title"); });
  }
  var lb = document.getElementById("langBtn");
  lb.textContent = LANG === "en" ? "中文" : "EN";
  lb.addEventListener("click", function () {
    try { localStorage.setItem("fc-lang", LANG === "en" ? "zh" : "en"); } catch (e) {}
    location.reload();
  });

  // One chart per language, both pre-rendered into the page (no external
  // script: CDNs are unreliable from mainland China).
  var svg = null;
  Array.prototype.forEach.call(document.querySelectorAll(".flow-svg"), function (el) {
    if (el.getAttribute("data-lang") === LANG) svg = el; else el.parentNode.removeChild(el);
  });
  // The chart was laid out with one set of fonts; the viewer's may be wider
  // (PingFang / SF on a Mac, Microsoft YaHei on Windows), and a label box of
  // fixed width then clips its text. Measure every label here, in the
  // viewer's own fonts, and grow the box and its shape to fit (Rick,
  // 2026-09-23). Shapes grow about their own centre, so the arrows, which
  // meet them top and bottom, still land.
  function fitLabels() {
    var PAD = 4;
    Array.prototype.forEach.call(svg.querySelectorAll("foreignObject"), function (fo) {
      var div = fo.firstElementChild; if (!div) return;
      var fw = fo.width.baseVal.value, fh = fo.height.baseVal.value;
      var nw = Math.ceil(div.scrollWidth) + 2, nh = Math.ceil(div.scrollHeight) + 1;
      if (nw <= fw + 0.5 && nh <= fh + 0.5) return;
      var gw = Math.max(fw, nw), gh = Math.max(fh, nh), dx = gw - fw, dy = gh - fh;
      fo.setAttribute("width", gw); fo.setAttribute("height", gh);
      var label = fo.parentNode;               // <g class="label" transform="translate(x, y)">
      var m = /translate\(\s*([-\d.]+)[ ,]+([-\d.]+)\s*\)/.exec(label.getAttribute("transform") || "");
      if (m) label.setAttribute("transform", "translate(" + (parseFloat(m[1]) - dx / 2) + ", " + (parseFloat(m[2]) - dy / 2) + ")");
      var node = label.parentNode;
      if (node.classList.contains("node")) {
        // every shape drawn in the node (rect, polygon, path) scales about the node's centre
        Array.prototype.forEach.call(node.children, function (el) {
          if (el === label || !/^(rect|polygon|path|circle|ellipse)$/.test(el.tagName)) return;
          var bb = el.getBBox();
          // keep a margin round the text: the original one for slanted shapes,
          // at least 10px a side for plain boxes
          var roomX = el.tagName === "rect" ? Math.min(bb.width - fw, 2 * 10 + PAD) : bb.width - fw;
          var roomY = el.tagName === "rect" ? Math.min(bb.height - fh, 2 * 6) : bb.height - fh;
          var sx = (nw + roomX) / bb.width, sy = (nh + roomY) / bb.height;
          if (!(sx > 1)) sx = 1; if (!(sy > 1)) sy = 1;
          el.setAttribute("transform", "scale(" + sx + "," + sy + ") " + (el.getAttribute("transform") || ""));
          el.setAttribute("vector-effect", "non-scaling-stroke");
        });
      } else {
        // edge labels: their white backing rect grows with them
        var bg = label.querySelector("rect");
        if (bg && bg.getAttribute("width")) { bg.setAttribute("width", gw); bg.setAttribute("height", gh); }
      }
    });
    // anything that now sticks out widens the drawing area
    var bb = svg.getBBox(), v = svg.viewBox.baseVal;
    var x0 = Math.min(v.x, bb.x - 8), y0 = Math.min(v.y, bb.y - 8);
    var x1 = Math.max(v.x + v.width, bb.x + bb.width + 8), y1 = Math.max(v.y + v.height, bb.y + bb.height + 8);
    svg.setAttribute("viewBox", x0 + " " + y0 + " " + (x1 - x0) + " " + (y1 - y0));
  }
  svg.setAttribute("width", svg.viewBox.baseVal.width);   // lay out at full size while measuring
  svg.setAttribute("height", svg.viewBox.baseVal.height);
  fitLabels();

  var vb = svg.viewBox.baseVal, W = vb.width, H = vb.height;
  var vp = document.getElementById("vp"), range = document.getElementById("zRange"), val = document.getElementById("zVal");
  var MIN = 0.25, MAX = 2, scale = 1;

  function apply(next, cx, cy) {
    next = Math.max(MIN, Math.min(MAX, next));
    // keep the point under the cursor (or the centre) where it is
    var r = vp.getBoundingClientRect();
    if (cx == null) { cx = r.width / 2; cy = r.height / 2; }
    var fx = (vp.scrollLeft + cx) / (W * scale + 40), fy = (vp.scrollTop + cy) / (H * scale + 40);
    scale = next;
    svg.setAttribute("width", Math.round(W * scale));
    svg.setAttribute("height", Math.round(H * scale));
    vp.scrollLeft = fx * (W * scale + 40) - cx;
    vp.scrollTop = fy * (H * scale + 40) - cy;
    var pct = Math.round(scale * 100);
    val.textContent = pct + "%"; range.value = pct;
    try { sessionStorage.setItem("flowZoom", String(scale)); } catch (e) {}
  }
  function fitWidth() {
    var avail = vp.clientWidth - 40;
    // Readable first: never below 55% by default, never above actual size.
    return Math.max(0.55, Math.min(1, avail / W));
  }
  document.getElementById("zIn").addEventListener("click", function () { apply(Math.round((scale + 0.1) * 20) / 20); });
  document.getElementById("zOut").addEventListener("click", function () { apply(Math.round((scale - 0.1) * 20) / 20); });
  document.getElementById("zFit").addEventListener("click", function () { apply(Math.max(MIN, Math.min(1, (vp.clientWidth - 40) / W))); vp.scrollTop = 0; });
  document.getElementById("z100").addEventListener("click", function () { apply(1); });
  range.addEventListener("input", function () { apply(Number(range.value) / 100); });
  vp.addEventListener("wheel", function (e) {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    var r = vp.getBoundingClientRect();
    apply(scale * (e.deltaY < 0 ? 1.1 : 1 / 1.1), e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });
  vp.addEventListener("keydown", function (e) {
    if (e.key === "+" || e.key === "=") { apply(scale + 0.1); e.preventDefault(); }
    if (e.key === "-" || e.key === "_") { apply(scale - 0.1); e.preventDefault(); }
    if (e.key === "0") { apply(1); e.preventDefault(); }
  });
  // drag to pan (mouse); touch keeps native scrolling
  var drag = null;
  vp.addEventListener("pointerdown", function (e) {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    drag = { x: e.clientX, y: e.clientY, l: vp.scrollLeft, t: vp.scrollTop };
    vp.classList.add("dragging"); vp.setPointerCapture(e.pointerId);
  });
  vp.addEventListener("pointermove", function (e) {
    if (!drag) return;
    vp.scrollLeft = drag.l - (e.clientX - drag.x); vp.scrollTop = drag.t - (e.clientY - drag.y);
  });
  function endDrag() { drag = null; vp.classList.remove("dragging"); }
  vp.addEventListener("pointerup", endDrag); vp.addEventListener("pointercancel", endDrag);

  // Fonts that arrive late (rare with system fonts) get a second measure.
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () {
    var before = svg.viewBox.baseVal.width;
    svg.setAttribute("width", before); svg.setAttribute("height", svg.viewBox.baseVal.height);
    fitLabels();
    W = svg.viewBox.baseVal.width; H = svg.viewBox.baseVal.height;
    apply(scale);
  });

  var start = fitWidth();
  try { var z = Number(sessionStorage.getItem("flowZoom")); if (z >= MIN && z <= MAX) start = z; } catch (e) {}
  apply(start);
  vp.scrollTop = 0;
  vp.scrollLeft = Math.max(0, (W * scale + 40 - vp.clientWidth) / 2);
})();
