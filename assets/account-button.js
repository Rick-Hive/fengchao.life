// The sign-in entry in the site header, top right beside the cart (Rick,
// 2026-09-29: "登录入口不应该放在菜单中"). Same on every page that has the
// site header: the course site (index.html loads this file), the pages built
// by site-header.js (help, the hub), which loads it too.
//
// Signed out: a person icon + 登录, linking to the Education Resource Link
// sign-in, which lands on the hub. Signed in: the icon + 我的账号, a plain link
// straight into the hub — no menu (Rick, 2026-10-02: 「无需“我的 Office 365
// 账号”和“管理中心”等菜单。点击登录后直接进入用户后台 dashboard」). 退出 lives
// in the hub's sidebar (assets/session-guard.js does the signing out).
//
// One sign-out signs out every open fengchao.life tab: the session is a
// cookie shared by all tabs, and the other tabs are told at once
// (BroadcastChannel, with a localStorage event as the fallback) so their
// headers change and a signed-in-only page leaves for the home page. Every
// tab also re-checks when it comes back into view, which covers a sign-out
// on another device or a timed-out session.
(function () {
  "use strict";
  if (location.hostname === "www.fengchao.life") {
    location.replace("https://fengchao.life" + location.pathname + location.search + location.hash);
    return;
  }
  var inner = document.querySelector(".site-header .header-inner");
  if (!inner || document.getElementById("acctWrap")) return;

  // The sign-in opens in a new tab (Rick, 2026-09-29), so the page the person
  // was on stays where it was. The new tab lands on the hub with ?signedin=1,
  // tells the other tabs, and they refresh their headers straight away.
  var LOGIN = "/.auth/login/aad?post_login_redirect_uri=" + encodeURIComponent("/hub/?signedin=1");
  var PROTECTED = /^\/(account|admin|hub)(\/|$)/;
  var ON_HUB = /^\/hub(\/|$)/.test(location.pathname);
  var principal = null;
  var known = false;

  function en() { return /^en/i.test(document.documentElement.lang || ""); }
  function esc(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function t(zh, e) { return en() ? e : zh; }

  var icon = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="12" cy="8.2" r="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M4.5 20.2c1.3-3.9 4.2-5.9 7.5-5.9s6.2 2 7.5 5.9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

  var wrap = document.createElement("div");
  wrap.className = "acct-wrap";
  wrap.id = "acctWrap";
  var before = document.getElementById("cartBtn") || document.getElementById("langBtn");
  if (before && before.parentNode === inner) inner.insertBefore(wrap, before); else inner.appendChild(wrap);

  // Arrived here because the session ended (idle timeout, maximum age, or 退出):
  // say so once, under 登录, and take the marker out of the address. See
  // assets/session-guard.js.
  var signedOutWhy = (location.search.match(/[?&]signedout=([a-z]+)/) || [])[1] || window.__fcSignedOut || "";
  try { if (!signedOutWhy) signedOutWhy = sessionStorage.getItem("fc-signedout") || ""; sessionStorage.removeItem("fc-signedout"); } catch (e) {}
  if (/[?&]signedout=/.test(location.search)) {
    try { history.replaceState(null, "", location.pathname + location.search.replace(/([?&])signedout=[a-z]+&?/, "$1").replace(/[?&]$/, "") + location.hash); } catch (e) {}
  }
  function noticeHtml() {
    if (!signedOutWhy) return "";
    var msg = signedOutWhy === "age" ? t("为保护账号，登录已满最长时长，已自动退出。请重新登录。", "For your account's safety the session reached its maximum length and was signed out. Please sign in again.")
      : signedOutWhy === "user" ? t("已退出。", "Signed out.")
      : t("长时间未操作，已自动退出。请重新登录。", "Signed out after a period of inactivity. Please sign in again.");
    return '<div class="acct-notice" role="status">' + esc(msg) + '<button type="button" class="acct-notice-x" aria-label="' + esc(t("关闭", "Close")) + '">×</button></div>';
  }
  function render() {
    if (!principal) {
      wrap.innerHTML = '<a class="acct-btn" href="' + esc(LOGIN) + '" target="_blank" rel="noopener" title="' + esc(t("用 Office 365 账号登录", "Sign in with your Office 365 account")) + '">' +
        icon + '<span class="acct-lbl">' + esc(t("登录", "Sign in")) + "</span></a>" + noticeHtml();
      return;
    }
    signedOutWhy = ""; // signed in again: the notice has done its job
    // On the hub itself the entry is just a marker of who is signed in (the page is the dashboard).
    wrap.innerHTML = '<a class="acct-btn signed-in' + (ON_HUB ? " current" : "") + '" href="/hub/" title="' + esc(principal.userDetails || "") + '"' + (ON_HUB ? ' aria-current="page"' : "") + ">" +
      icon + '<span class="acct-lbl">' + esc(t("我的账号", "Account")) + "</span></a>";
  }

  // ---- tell the other tabs ------------------------------------------------------
  var channel = null;
  try { channel = new BroadcastChannel("fc-auth"); } catch (e) {}
  function announce(kind) {
    try { if (channel) channel.postMessage({ kind: kind, at: Date.now() }); } catch (e) {}
    try { localStorage.setItem("fc-auth-event", kind + ":" + Date.now()); } catch (e) {}
  }
  function signedOutHere() {
    principal = null;
    known = true;
    if (PROTECTED.test(location.pathname)) location.replace("/");
    else render();
  }
  function onEvent(kind) {
    if (kind === "out") signedOutHere();
    else if (kind === "in") refresh();
  }
  if (channel) channel.onmessage = function (e) { onEvent(e && e.data && e.data.kind); };
  window.addEventListener("storage", function (e) {
    if (e.key === "fc-auth-event" && e.newValue) onEvent(e.newValue.split(":")[0]);
  });

  wrap.addEventListener("click", function (e) {
    var x = e.target.closest && e.target.closest(".acct-notice-x");
    if (x) { signedOutWhy = ""; render(); }
  });

  // ---- who is signed in ---------------------------------------------------------
  function refresh() {
    return fetch("/.auth/me", { credentials: "same-origin", cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        principal = (j && j.clientPrincipal) || null;
        var first = !known;
        known = true;
        if (!principal && PROTECTED.test(location.pathname) && !first) { location.replace("/"); return; }
        // Just arrived from the sign-in tab: tell the other tabs, once, and
        // take the marker out of the address. (The hub does this itself.)
        if (first && principal && !ON_HUB && /[?&]signedin=1\b/.test(location.search)) {
          announce("in");
          try { history.replaceState(null, "", location.pathname + location.search.replace(/([?&])signedin=1&?/, "$1").replace(/[?&]$/, "") + location.hash); } catch (e) {}
        }
        render();
      })
      .catch(function () {});
  }

  render();
  try {
    new MutationObserver(function () { render(); }).observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
  } catch (e) {}
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") refresh(); });
  refresh();
})();
