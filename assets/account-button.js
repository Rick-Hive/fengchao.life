// The sign-in entry in the site header, top right beside the cart (Rick,
// 2026-09-29: "登录入口不应该放在菜单中"). Same on every page that has the
// site header: the course site (index.html loads this file), the pages built
// by site-header.js (help, the management center), which loads it too.
//
// Signed out: a person icon + 登录. The sign-in opens in a new tab (Rick,
// 2026-09-29) so the page stays; once Microsoft has verified the person, that
// tab sends this one to the management center and closes itself (Rick,
// 2026-10-02: 「MS 验证身份后应该关闭 tab 页面，回到 fengchao.life，然后渲染到
// management 页面」). Signed in: the icon + 我的账号, a small panel with
// 管理中心 and 退出登录 (Rick, 2026-10-02: 「点击我的账户，应该有个选项退出登录」).
//
// 退出登录 ends Hive's session (POST /api/logout — the server marks this
// sign-in as over, because the platform does not let it clear its own cookie)
// and, best effort and out of sight, signs the Microsoft account out of the
// browser in a hidden frame (Rick, 2026-10-02: 「弹出了无需用户看到的信息」) —
// see window.fcSession.microsoftSignOut in assets/session-guard.js.
//
// Who is signed in comes from Hive's own GET /api/me/session?peek=1, never from
// the platform's /.auth/me: after 退出 the platform still thinks the person is
// signed in, Hive knows better (Rick, 2026-10-02: 「退出后……还能看到自己的 teams
// 账号」).
//
// One sign-out signs out every open fengchao.life tab: the session is a
// cookie shared by all tabs, and the other tabs are told at once
// (BroadcastChannel, with a localStorage event as the fallback) so their
// headers change and a signed-in-only page leaves for the home page. Every
// tab also re-checks when it comes back into view.
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
  // Absolute, on the canonical host: a sign-in started on www.fengchao.life would
  // set its cookie there, and the hub's www→apex redirect would then arrive on
  // fengchao.life without it.
  var SITE = location.hostname === "fengchao.life" || location.hostname === "www.fengchao.life" ? "https://fengchao.life" : "";
  var LOGIN = SITE + "/.auth/login/aad?post_login_redirect_uri=" + encodeURIComponent("/management/?signedin=1");
  var MANAGE = "/management/";
  var TENANT = "edb20124-7377-4368-acbc-d4be58fe59c3";
  var PROTECTED = /^\/(account|admin|hub|management)(\/|$)/;
  var ON_HUB = /^\/(hub|management)(\/|$)/.test(location.pathname);
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
      : signedOutWhy === "password" ? t("您的密码已更改，请用新密码重新登录。", "Your password was changed — please sign in again with the new one.")
      : signedOutWhy === "disabled" ? t("该账号已被停用，请联系学校管理员。", "This account has been disabled — please contact your school's administrator.")
      : signedOutWhy === "user" ? t("已退出。", "Signed out.")
      : signedOutWhy === "signed_out" ? t("您已退出登录，请重新登录。", "You are signed out — please sign in again.")
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
    wrap.innerHTML =
      '<button class="acct-btn signed-in" type="button" aria-haspopup="true" aria-expanded="false">' +
        icon + '<span class="acct-lbl">' + esc(t("我的账号", "Account")) + "</span></button>" +
      '<div class="acct-panel" role="menu">' +
        '<div class="acct-who">' + esc(principal.userDetails || "") + "</div>" +
        (ON_HUB ? "" : '<a role="menuitem" href="' + MANAGE + '">' + esc(t("管理中心", "Management center")) + "</a>") +
        '<a role="menuitem" class="acct-out" href="#" data-out="1">' + esc(t("退出登录", "Sign out")) + "</a>" +
      "</div>";
  }
  function close() {
    wrap.classList.remove("open");
    var b = wrap.querySelector("button.acct-btn");
    if (b) b.setAttribute("aria-expanded", "false");
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
    else { close(); render(); }
  }
  function onEvent(kind, handed) {
    if (kind === "out") signedOutHere();
    else if (kind === "in") {
      // The tab that started the sign-in goes to the management center — unless the
      // sign-in window has already sent it there itself through window.opener
      // (handed), in which case navigating again here would load the page twice
      // (Rick, 2026-10-02: 「好像登入了 2 次」). Other tabs just refresh their header.
      var origin = "";
      try { origin = sessionStorage.getItem("fc-login-origin") || ""; sessionStorage.removeItem("fc-login-origin"); } catch (e) {}
      if (!handed && origin && !ON_HUB && Date.now() - Number(origin) < 30 * 60 * 1000) { location.href = MANAGE; return; }
      refresh();
    }
  }
  if (channel) channel.onmessage = function (e) { onEvent(e && e.data && e.data.kind, !!(e && e.data && e.data.handed)); };
  window.addEventListener("storage", function (e) {
    if (e.key === "fc-auth-event" && e.newValue) { var parts = e.newValue.split(":"); onEvent(parts[0], parts[2] === "handed"); }
  });

  // ---- sign out (same flow as the management center's 退出) ----------------------
  function signOut() {
    if (window.fcSession && window.fcSession.signOut) { window.fcSession.signOut("user"); return; }
    // Pages without session-guard.js (the course site): the same flow, inline.
    try { sessionStorage.setItem("fc-signedout", "user"); localStorage.removeItem("fc-last-active"); } catch (e) {}
    var hint = (principal && principal.userDetails) || "";
    fetch("/api/logout", { method: "POST", credentials: "same-origin", cache: "no-store" }).catch(function () {}).then(function () {
      announce("out");
      principal = null; known = true; close(); signedOutWhy = "user"; render();
      hiddenMicrosoftSignOut(hint, function () { if (PROTECTED.test(location.pathname)) location.replace("/?signedout=user"); });
    });
  }
  // Microsoft, best effort and unseen: a hidden frame asks login.microsoftonline.com
  // to end the browser's session for this account, then `done` runs (after the
  // frame has loaded, or 3 s). If Microsoft refuses to be framed, or the browser
  // keeps its cookies from the frame, nothing happens — Hive's session is over
  // either way, and the next 登录 asks for the password regardless (prompt=login).
  function hiddenMicrosoftSignOut(hint, done) {
    var called = false;
    function finish() { if (called) return; called = true; if (done) done(); }
    try {
      var f = document.createElement("iframe");
      f.setAttribute("aria-hidden", "true"); f.tabIndex = -1;
      f.style.cssText = "position:fixed;width:0;height:0;border:0;opacity:0;pointer-events:none";
      f.onload = f.onerror = function () { setTimeout(finish, 300); };
      f.src = "https://login.microsoftonline.com/" + TENANT + "/oauth2/v2.0/logout" + (hint ? "?logout_hint=" + encodeURIComponent(hint) : "");
      document.body.appendChild(f);
      setTimeout(function () { try { f.parentNode.removeChild(f); } catch (e) {} }, 20000);
    } catch (e) {}
    setTimeout(finish, 3000);
  }
  window.fcHiddenMicrosoftSignOut = hiddenMicrosoftSignOut;

  wrap.addEventListener("click", function (e) {
    var x = e.target.closest && e.target.closest(".acct-notice-x");
    if (x) { signedOutWhy = ""; render(); return; }
    var login = e.target.closest && e.target.closest("a.acct-btn:not(.signed-in)");
    if (login) {
      // Open the sign-in as a window of this page (not a plain new tab), so that
      // once Microsoft is done it can send this tab on and close itself.
      e.preventDefault();
      try { sessionStorage.setItem("fc-login-origin", String(Date.now())); } catch (err) {}
      var w = window.open(login.href, "fc-signin");
      if (!w) location.href = login.href; // popup blocked: sign in here instead
      return;
    }
    var out = e.target.closest && e.target.closest("[data-out]");
    if (out) { e.preventDefault(); close(); signOut(); return; }
    var b = e.target.closest && e.target.closest("button.acct-btn");
    if (!b) return;
    var open = !wrap.classList.contains("open");
    wrap.classList.toggle("open", open);
    b.setAttribute("aria-expanded", open ? "true" : "false");
  });
  document.addEventListener("click", function (e) { if (!wrap.contains(e.target) && wrap.classList.contains("open")) close(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && wrap.classList.contains("open")) { close(); var b = wrap.querySelector("button.acct-btn"); if (b) b.focus(); } });

  // ---- who is signed in ---------------------------------------------------------
  function refresh() {
    return fetch("/api/me/session?peek=1", { credentials: "same-origin", cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        // Only a definite answer counts. A failed or odd reply (network blip, a
        // 5xx) must not sign the header out — on a signed-in page that used to
        // send the person straight back home (Rick, 2026-10-02).
        if (!j || typeof j.signedIn !== "boolean") return;
        principal = j.signedIn ? { userDetails: j.user || "" } : null;
        if (!principal && j.reason && PROTECTED.test(location.pathname)) { try { sessionStorage.setItem("fc-signedout", j.reason); } catch (e) {} }
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
