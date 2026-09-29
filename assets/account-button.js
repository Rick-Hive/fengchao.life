// The sign-in entry in the site header, top right beside the cart (Rick,
// 2026-09-29: "登录入口不应该放在菜单中"). Same on every page that has the
// site header: the course site (index.html loads this file) and the pages
// built by site-header.js (which loads it too).
//
// Signed out: a person icon + 登录, linking to the Education Resource Link
// sign-in, which lands on 我的账号. Signed in: the icon + 我的账号, opening a
// small panel with the account, 我的账号, 管理中心 / EquipMe 订单录入 when the
// sign-in roles include them, and 退出.
//
// The state comes from /.auth/me (same origin, Static Web Apps' own endpoint),
// fetched once per page. The label follows the page language: help pages
// reload on a language switch; the course site switches in place and sets
// <html lang>, which is watched here.
(function () {
  "use strict";
  var inner = document.querySelector(".site-header .header-inner");
  if (!inner || document.getElementById("acctWrap")) return;

  var LOGIN = "/.auth/login/aad?post_login_redirect_uri=" + encodeURIComponent("/account/index.html");
  var LOGOUT = "/.auth/logout?post_logout_redirect_uri=/";
  var principal = null;

  function en() { return /^en/i.test(document.documentElement.lang || ""); }
  function esc(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function t(zh, e) { return en() ? e : zh; }

  var icon = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="12" cy="8.2" r="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M4.5 20.2c1.3-3.9 4.2-5.9 7.5-5.9s6.2 2 7.5 5.9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

  var wrap = document.createElement("div");
  wrap.className = "acct-wrap";
  wrap.id = "acctWrap";
  var cart = document.getElementById("cartBtn");
  inner.insertBefore(wrap, cart || document.getElementById("langBtn") || null);

  function render() {
    if (!principal) {
      wrap.innerHTML = '<a class="acct-btn" href="' + esc(LOGIN) + '" title="' + esc(t("用 Office 365 账号登录", "Sign in with your Office 365 account")) + '">' +
        icon + '<span class="acct-lbl">' + esc(t("登录", "Sign in")) + "</span></a>";
      return;
    }
    var roles = principal.userRoles || [];
    var admin = roles.indexOf("admin") >= 0;
    var entry = admin || roles.indexOf("crm_entry") >= 0;
    wrap.innerHTML =
      '<button class="acct-btn signed-in" type="button" aria-haspopup="true" aria-expanded="false" title="' + esc(principal.userDetails || "") + '">' +
        icon + '<span class="acct-lbl">' + esc(t("我的账号", "Account")) + "</span></button>" +
      '<div class="acct-panel" role="menu">' +
        '<div class="acct-who">' + esc(principal.userDetails || "") + "</div>" +
        '<a role="menuitem" href="/account/index.html">' + esc(t("我的 Office 365 账号", "My Office 365 account")) + "</a>" +
        (admin ? '<a role="menuitem" href="/admin/">' + esc(t("管理中心", "Admin Center")) + "</a>" : "") +
        (entry ? '<a role="menuitem" href="/crm/">' + esc(t("EquipMe 订单录入", "EquipMe order entry")) + "</a>" : "") +
        '<a role="menuitem" class="acct-out" href="' + esc(LOGOUT) + '">' + esc(t("退出", "Sign out")) + "</a>" +
      "</div>";
  }

  wrap.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("button.acct-btn");
    if (!b) return;
    var open = !wrap.classList.contains("open");
    wrap.classList.toggle("open", open);
    b.setAttribute("aria-expanded", open ? "true" : "false");
  });
  document.addEventListener("click", function (e) {
    if (!wrap.contains(e.target) && wrap.classList.contains("open")) {
      wrap.classList.remove("open");
      var b = wrap.querySelector("button.acct-btn");
      if (b) b.setAttribute("aria-expanded", "false");
    }
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && wrap.classList.contains("open")) {
      wrap.classList.remove("open");
      var b = wrap.querySelector("button.acct-btn");
      if (b) { b.setAttribute("aria-expanded", "false"); b.focus(); }
    }
  });

  render();
  try {
    new MutationObserver(function () { render(); }).observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
  } catch (e) {}

  fetch("/.auth/me", { credentials: "same-origin" })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (j) {
      principal = (j && j.clientPrincipal) || null;
      render();
    })
    .catch(function () {});
})();
