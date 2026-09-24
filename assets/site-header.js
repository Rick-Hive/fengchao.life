// The site header on pages outside the course site — the help pages under
// /help (Rick, 2026-09-24). Same mark, lockup, menus, cart and language
// button as index.html, drawn from the same data (window.I18N and
// window.SITE_MENUS in i18n.js), so a menu added there shows up here too.
//
// Usage, at the very top of <body>:
//   <header class="site-header" data-site-header></header>
//   <script src="/assets/i18n.js"></script>
//   <script src="/assets/site-header.js"></script>
// It runs synchronously, so #langBtn exists by the time the page's own
// script binds it. The page owns the language switch (it re-renders its own
// text); this file only reads fc-lang to label the header.
//
// Differences from the course site, all because these are ordinary pages:
// every menu link is a normal page load (app.js routes /gpa etc. in place),
// and the cart is a link back to the course site rather than a sheet.
(function () {
  "use strict";
  var header = document.querySelector("header[data-site-header]");
  if (!header || !window.I18N) return;

  var lang = "zh";
  try { var s = localStorage.getItem("fc-lang"); if (s === "en" || s === "zh") lang = s; } catch (e) {}
  var T = window.I18N[lang] || window.I18N.zh;
  function pick(en, zh) { return lang === "en" ? (en || zh) : (zh || en); }
  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // The number on the basket: the course site keeps its selection in
  // fc-wizard-v1 (see persistWizard in app.js).
  var cartN = 0;
  try {
    var w = JSON.parse(localStorage.getItem("fc-wizard-v1") || "null");
    if (w && w.cart && typeof w.cart === "object") cartN = Object.keys(w.cart).length;
  } catch (e) {}
  var cartLabel = T.cartLabel || (lang === "en" ? "Cart" : "购物车");
  var cartTitle = T.cartTitle || cartLabel;

  var caret = '<svg class="caret" viewBox="0 0 20 20" width="11" height="11" aria-hidden="true"><path d="M4 7l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  // Mirrors renderNav() in app.js: a top-level entry with a url and no items
  // is a plain pill link; the rest are dropdowns; an item with no url is a
  // planned feature shown disabled.
  function linkAttrs(url) {
    var external = /^https?:/i.test(url);
    return { external: external, attrs: ' href="' + esc(url) + '"' + (external ? ' target="_blank" rel="noopener noreferrer"' : "") };
  }
  function navHtml() {
    return (window.SITE_MENUS || []).map(function (m, i) {
      if (m.url && !m.items) {
        var l = linkAttrs(m.url);
        return '<a class="menu-btn menu-link"' + l.attrs + ">" + esc(pick(m.en, m.zh)) +
               (l.external ? '<span class="ext-ic" aria-hidden="true">↗</span>' : "") + "</a>";
      }
      var items = (m.items || []).map(function (it) {
        var label = pick(it.en, it.zh);
        if (!it.url) {
          return '<span class="menu-item is-soon" aria-disabled="true">' + esc(label) +
                 '<span class="soon-tag">' + esc(T.comingSoon) + "</span></span>";
        }
        var l = linkAttrs(it.url);
        return '<a class="menu-item"' + l.attrs + ">" + esc(label) +
               (l.external ? '<span class="ext-ic" aria-hidden="true">↗</span>' : "") + "</a>";
      }).join("");
      var id = "menu" + i;
      return '<div class="menu-group" data-menu="' + id + '">' +
        '<button class="menu-btn" type="button" data-menu-btn="' + id + '" aria-expanded="false">' +
        esc(pick(m.en, m.zh)) + caret + "</button>" +
        '<div class="menu-panel">' + items + "</div></div>";
    }).join("");
  }

  header.innerHTML =
    '<div class="header-inner">' +
      '<a class="brand-home" href="/" aria-label="' + esc(pick("Hive home", "蜂巢首页")) + '">' +
        '<img class="logo-mark" src="/assets/logo-mark.png" width="512" height="512" alt="" />' +
        '<span class="brand-lockup">' +
          '<span class="brand-line"><span class="brand-name">' + "蜂巢" + "</span>" +
          '<span class="brand-values">' + esc((T.brandValues || []).join(" · ")) + "</span></span>" +
          '<span class="brand-tag">' + esc(T.brandTag) + "</span>" +
        "</span>" +
      "</a>" +
      '<div class="header-spacer"></div>' +
      '<nav class="site-nav" id="siteNav" aria-label="site">' + navHtml() + "</nav>" +
      '<button class="nav-toggle" id="navToggle" type="button" aria-expanded="false" aria-controls="siteNav">' +
        '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M3 5.5h14M3 10h14M3 14.5h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>' +
        "<span>" + esc(T.menuLabel) + "</span>" +
      "</button>" +
      // With something in it, the basket goes to the course list, where the
      // cart bar and sheet are; empty, to the course site's home page.
      '<a class="cart-btn" id="cartBtn" href="' + (cartN ? "/courses" : "/") + '" aria-label="' + esc(cartTitle + " (" + cartN + ")") + '">' +
        '<span class="cart-ic">' +
          '<svg viewBox="0 0 34 30" width="34" height="30" aria-hidden="true">' +
            '<path d="M1.5 3h4.2l3.6 16.2a2.2 2.2 0 0 0 2.15 1.7h13.4a2.2 2.2 0 0 0 2.15-1.7L30.5 9H8.2" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>' +
            '<circle cx="13" cy="26.2" r="2.3" fill="currentColor"/><circle cx="24.6" cy="26.2" r="2.3" fill="currentColor"/>' +
          "</svg>" +
          '<span class="cart-btn-n' + (cartN ? "" : " zero") + '">' + cartN + "</span>" +
        "</span>" +
        '<span class="cart-lbl">' + esc(cartLabel) + "</span>" +
      "</a>" +
      '<button class="lang-btn" id="langBtn" type="button">' + esc(T.langBtn) + "</button>" +
    "</div>";

  // The header is sticky; publish its height so a page can keep sticky
  // toolbars and scrolled-to anchors clear of it (var(--header-h)).
  function measure() {
    document.documentElement.style.setProperty("--header-h", header.offsetHeight + "px");
  }
  measure();
  window.addEventListener("resize", measure);
  window.addEventListener("load", measure);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);

  // Dropdowns and the phone menu — the same behaviour as bindNavOnce() in
  // app.js, minus the in-place routing.
  var nav = document.getElementById("siteNav");
  var toggle = document.getElementById("navToggle");
  function closeMenus() {
    Array.prototype.forEach.call(nav.querySelectorAll(".menu-group"), function (g) {
      g.classList.remove("open");
      var b = g.querySelector(".menu-btn");
      if (b) b.setAttribute("aria-expanded", "false");
    });
  }
  function collapse() {
    closeMenus();
    nav.classList.remove("expanded");
    toggle.setAttribute("aria-expanded", "false");
  }
  nav.addEventListener("click", function (e) {
    var btn = e.target.closest ? e.target.closest("button.menu-btn") : null;
    if (!btn) return;
    var g = btn.parentNode;
    var wasOpen = g.classList.contains("open");
    closeMenus();
    if (!wasOpen) { g.classList.add("open"); btn.setAttribute("aria-expanded", "true"); }
  });
  toggle.addEventListener("click", function () {
    var isOpen = nav.classList.toggle("expanded");
    toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
    if (!isOpen) closeMenus();
  });
  document.addEventListener("click", function (e) {
    if (nav.contains(e.target) || toggle.contains(e.target)) return;
    collapse();
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") collapse(); });
})();
