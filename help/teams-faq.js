// Moved out of help/teams-faq.html so the Content-Security-Policy can drop 'unsafe-inline' for scripts (2026-10-22).
(function () {
  "use strict";
  var LANG = "zh";
  try { var s = localStorage.getItem("fc-lang"); if (s === "en" || s === "zh") LANG = s; } catch (e) {}
  if (LANG === "en") {
    document.documentElement.lang = "en";
    document.title = "Microsoft Teams & Authenticator — Q&A · Hive Help";
    Array.prototype.forEach.call(document.querySelectorAll("[data-en]"), function (el) { el.innerHTML = el.getAttribute("data-en"); });
    Array.prototype.forEach.call(document.querySelectorAll("[data-en-label]"), function (el) { el.setAttribute("aria-label", el.getAttribute("data-en-label")); });
  }
  var b = document.getElementById("langBtn");
  b.textContent = LANG === "en" ? "中文" : "EN";
  b.addEventListener("click", function () {
    try { localStorage.setItem("fc-lang", LANG === "en" ? "zh" : "en"); } catch (e) {}
    location.reload();
  });
  // A link with a hash opens that question.
  // A link with a hash (from the wizard) opens that question and brings it into view.
  function openHash() {
    if (!location.hash) return;
    var t = document.getElementById(location.hash.slice(1));
    if (t && t.tagName === "DETAILS") { t.open = true; setTimeout(function () { t.scrollIntoView({ block: "start" }); }, 0); }
  }
  openHash();
  window.addEventListener("hashchange", openHash);
})();
