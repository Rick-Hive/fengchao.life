// Moved out of help/teams-cases.html so the Content-Security-Policy can drop 'unsafe-inline' for scripts (2026-10-22).
(function () {
  "use strict";
  var LANG = "zh";
  try { var s = localStorage.getItem("fc-lang"); if (s === "en" || s === "zh") LANG = s; } catch (e) {}
  if (LANG === "en") {
    document.documentElement.lang = "en";
    document.title = "Microsoft Teams & Authenticator — case studies · Hive Help";
    Array.prototype.forEach.call(document.querySelectorAll("[data-en]"), function (el) { el.innerHTML = el.getAttribute("data-en"); });
    Array.prototype.forEach.call(document.querySelectorAll("[data-en-label]"), function (el) { el.setAttribute("aria-label", el.getAttribute("data-en-label")); });
    Array.prototype.forEach.call(document.querySelectorAll("[data-en-alt]"), function (el) { el.setAttribute("alt", el.getAttribute("data-en-alt")); });
  }
  // Label each cell of a data table with its column heading, in the page's language, for the phone card layout.
  Array.prototype.forEach.call(document.querySelectorAll("table.grid"), function (t) {
    var hs = Array.prototype.map.call(t.querySelectorAll("thead th"), function (h) { return h.textContent; });
    Array.prototype.forEach.call(t.querySelectorAll("tbody tr"), function (tr) {
      Array.prototype.forEach.call(tr.children, function (c, i) { if (hs[i]) c.setAttribute("data-l", hs[i]); });
    });
  });
  var b = document.getElementById("langBtn");
  b.textContent = LANG === "en" ? "中文" : "EN";
  b.addEventListener("click", function () {
    try { localStorage.setItem("fc-lang", LANG === "en" ? "zh" : "en"); } catch (e) {}
    location.reload();
  });
  // Every case starts folded; a link (#case-…) opens that case and brings it into view.
  function openCase(id) {
    var t = id && document.getElementById(id);
    if (t && t.tagName === "DETAILS") { t.open = true; setTimeout(function () { t.scrollIntoView({ block: "start" }); }, 0); }
  }
  openCase(location.hash.slice(1));
  window.addEventListener("hashchange", function () { openCase(location.hash.slice(1)); });
  Array.prototype.forEach.call(document.querySelectorAll('.cases-toc a[href^="#case-"]'), function (a) {
    a.addEventListener("click", function () { openCase(a.getAttribute("href").slice(1)); });
  });
})();
