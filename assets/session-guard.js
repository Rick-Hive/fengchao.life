// Idle timeout for the signed-in pages (hub, order entry).
//
// Rick, 2026-10-02: 「超时候自动退出」. The server (api/shared/session.js) ends a
// session that has made no request for HIVE_IDLE_MINUTES, or that is older
// than HIVE_SESSION_HOURS; this script keeps the browser in step with it:
//
//  * activity in any Hive tab (pointer, keys, scrolling, touch) counts, shared
//    through localStorage `fc-last-active`, so reading in one tab does not sign
//    the other out;
//  * while the person is active the server is pinged (GET /api/me/session) at
//    most every 5 minutes, so the server-side idle clock follows real use, not
//    just API calls;
//  * one minute before the limit a small dialog counts down with a 继续使用
//    button; at zero the session is ended: POST /api/logout, the Microsoft
//    account is asked to sign out in a hidden frame (see microsoftSignOut), every
//    other tab is told (BroadcastChannel "fc-auth" / storage), and the page
//    comes back home with ?signedout=timeout, where the header explains and
//    offers 登录;
//  * a page opened after the limit has already passed (laptop closed overnight)
//    is signed out by the server's 401 session_expired on its first call —
//    pages call window.fcSession.expired(reason) for that.
//
// window.fcSession = { touch(), ping(), signOut(reason), expired(reason), config }
(function () {
  if (window.fcSession) return;
  var LANG = "zh";
  try { var s0 = localStorage.getItem("fc-lang"); if (s0 === "en" || s0 === "zh") LANG = s0; } catch (e) {}
  function t(zh, en) { return LANG === "en" ? en : zh; }

  var KEY = "fc-last-active";
  var cfg = { idleSeconds: 30 * 60, maxSeconds: 12 * 3600, warnSeconds: 60, startedAt: 0 };
  var lastActive = Date.now();
  var lastPing = 0;
  var ended = false;
  var dialog = null, timer = null;

  function readShared() {
    try { var v = Number(localStorage.getItem(KEY)); if (v > lastActive) lastActive = v; } catch (e) {}
    return lastActive;
  }
  function touch() {
    if (ended) return;
    lastActive = Date.now();
    try { localStorage.setItem(KEY, String(lastActive)); } catch (e) {}
    hide();
  }
  // Once the countdown is showing, only its 继续使用 button counts — a stray mouse
  // move or a tap on the scrim must not quietly extend the session.
  function warning() { return !!(dialog && dialog.parentNode); }
  function onActivity() { if (!warning()) touch(); }
  var lastMove = 0;
  function onMove() { var n = Date.now(); if (n - lastMove > 5000) { lastMove = n; onActivity(); } }
  ["pointerdown", "keydown", "touchstart", "wheel"].forEach(function (ev) { window.addEventListener(ev, onActivity, { passive: true, capture: true }); });
  window.addEventListener("mousemove", onMove, { passive: true, capture: true });
  window.addEventListener("scroll", onMove, { passive: true, capture: true });

  function announce(kind) {
    try { new BroadcastChannel("fc-auth").postMessage({ kind: kind, at: Date.now() }); } catch (e) {}
    try { localStorage.setItem("fc-auth-event", kind + ":" + Date.now()); } catch (e) {}
  }
  // The homepage rewrites its address as it routes, so the reason travels in
  // sessionStorage (this tab only) as well as in the query; the header reads either.
  function goHome(reason) {
    var why = reason || "timeout";
    try { sessionStorage.setItem("fc-signedout", why); } catch (e) {}
    try { localStorage.removeItem(KEY); } catch (e) {}
    location.replace("/?signedout=" + encodeURIComponent(why));
  }
  // 退出 (Rick, 2026-10-02: 「点击退出无需登录 Teams 账号确认，后台自动登出所登录的
  // Teams 账号」, then 「弹出了无需用户看到的信息」): end Hive's session (POST
  // /api/logout — the server marks this sign-in as over), then, best effort and
  // out of sight, ask Microsoft to end the browser's session for this account in
  // a hidden frame, and come home. No Microsoft page is shown. Whether or not
  // Microsoft honours the hidden request, the next 登录 asks for the password
  // (the sign-in is configured with prompt=login).
  var TENANT = "edb20124-7377-4368-acbc-d4be58fe59c3";
  function hiddenMicrosoftSignOut(hint, done) {
    if (window.fcHiddenMicrosoftSignOut) return window.fcHiddenMicrosoftSignOut(hint, done);
    var called = false;
    function finish() { if (called) return; called = true; if (done) done(); }
    try {
      var f = document.createElement("iframe");
      f.setAttribute("aria-hidden", "true"); f.tabIndex = -1;
      f.style.cssText = "position:fixed;width:0;height:0;border:0;opacity:0;pointer-events:none";
      f.onload = f.onerror = function () { setTimeout(finish, 300); };
      f.src = "https://login.microsoftonline.com/" + TENANT + "/oauth2/v2.0/logout" + (hint ? "?logout_hint=" + encodeURIComponent(hint) : "");
      document.body.appendChild(f);
    } catch (e) {}
    setTimeout(finish, 3000);
  }
  function microsoftSignOut(reason) {
    var why = reason || "user";
    try { sessionStorage.setItem("fc-signedout", why); } catch (e) {}
    return fetch("/api/me/session?peek=1", { credentials: "same-origin", cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
      .then(function (j) {
        var hint = (j && j.user) || "";
        return fetch("/api/logout", { method: "POST", credentials: "same-origin", cache: "no-store" }).catch(function () {}).then(function () {
          announce("out");
          hiddenMicrosoftSignOut(hint, function () { goHome(why); });
        });
      });
  }
  function signOut(reason) {
    if (ended) return;
    ended = true;
    clearInterval(timer);
    hide();
    microsoftSignOut(reason);
  }
  // The server said the session is over (401 session_expired): no second logout
  // call is needed — its reply already expired the cookies — just tell the tabs and go home.
  function expired(reason) {
    if (ended) return;
    ended = true;
    clearInterval(timer);
    hide();
    announce("out");
    goHome(reason);
  }

  function ping() {
    lastPing = Date.now();
    return fetch("/api/me/session", { credentials: "same-origin", cache: "no-store" }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.status === 401 || r.status === 403 || (j && (j.signedIn === false || j.code === "session_expired" || j.code === "signed_out"))) { expired((j && j.reason) || "signed_out"); return null; }
        if (r.ok && j && j.idleSeconds) {
          cfg.idleSeconds = j.idleSeconds;
          cfg.maxSeconds = j.maxSeconds || cfg.maxSeconds;
          cfg.startedAt = Date.parse(j.startedAt) || 0;
        }
        return j;
      });
    }).catch(function () { return null; });
  }

  // ---- the countdown dialog -----------------------------------------------------
  function show(left) {
    if (!dialog) {
      dialog = document.createElement("div");
      dialog.className = "fc-idle";
      dialog.setAttribute("role", "alertdialog");
      dialog.innerHTML =
        '<div class="fc-idle-box">' +
          "<h2>" + t("还在吗？", "Still there?") + "</h2>" +
          "<p>" + t("为保护账号，长时间未操作将自动退出。", "To protect the account, the session ends after a period of inactivity.") + "</p>" +
          '<div class="fc-idle-left"><b id="fcIdleLeft"></b> ' + t("秒后退出", "seconds left") + "</div>" +
          '<div class="fc-idle-actions"><button type="button" class="fc-idle-stay">' + t("继续使用", "Stay signed in") + '</button><button type="button" class="fc-idle-out">' + t("现在退出", "Sign out now") + "</button></div>" +
        "</div>";
      var css = document.createElement("style");
      css.textContent =
        ".fc-idle{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;background:rgba(15,32,60,.45);padding:16px}" +
        ".fc-idle-box{background:#fff;color:#1c1c1c;border-radius:16px;padding:24px 26px;max-width:380px;width:100%;box-shadow:0 20px 60px rgba(15,32,60,.3);font:15px/1.5 system-ui,-apple-system,'Segoe UI',Roboto,'PingFang SC','Microsoft YaHei',sans-serif}" +
        ".fc-idle-box h2{margin:0 0 6px;font-size:1.15rem}.fc-idle-box p{margin:0 0 12px;color:#4b5563}" +
        ".fc-idle-left{font-variant-numeric:tabular-nums;margin-bottom:16px}.fc-idle-left b{font-size:1.6rem;color:#b42318}" +
        ".fc-idle-actions{display:flex;gap:10px;flex-wrap:wrap}.fc-idle-actions button{border-radius:999px;padding:9px 18px;font:inherit;font-weight:700;cursor:pointer;border:1px solid #1d4a83}" +
        ".fc-idle-stay{background:#1d4a83;color:#fff}.fc-idle-out{background:#fff;color:#1d4a83}" +
        "@media (prefers-color-scheme: dark){.fc-idle-box{background:#1f2937;color:#f3f4f6}.fc-idle-box p{color:#cbd5e1}}";
      dialog.appendChild(css);
      dialog.querySelector(".fc-idle-stay").addEventListener("click", function (e) { e.stopPropagation(); touch(); ping(); });
      dialog.querySelector(".fc-idle-out").addEventListener("click", function (e) { e.stopPropagation(); signOut("user"); });
    }
    var b = dialog.querySelector("#fcIdleLeft");
    if (b) b.textContent = String(Math.max(0, Math.ceil(left)));
    if (!dialog.parentNode) { document.body.appendChild(dialog); var st = dialog.querySelector(".fc-idle-stay"); if (st) st.focus(); }
  }
  function hide() { if (dialog && dialog.parentNode) dialog.parentNode.removeChild(dialog); }

  // ---- the clock -------------------------------------------------------------------
  function tick() {
    if (ended) return;
    var now = Date.now();
    var idleFor = (now - readShared()) / 1000;
    var left = cfg.idleSeconds - idleFor;
    if (cfg.startedAt) left = Math.min(left, (cfg.startedAt + cfg.maxSeconds * 1000 - now) / 1000);
    if (left <= 0) { signOut(cfg.startedAt && now - cfg.startedAt >= cfg.maxSeconds * 1000 ? "age" : "timeout"); return; }
    if (left <= cfg.warnSeconds) show(left);
    else {
      hide();
      // Active and the server has not heard from us for a while: let it know.
      if (lastActive > lastPing && now - lastPing > 5 * 60 * 1000) ping();
    }
  }
  timer = setInterval(tick, 1000);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) { readShared(); tick(); } });

  // Sign-in state from other tabs: a sign-out anywhere ends this page too.
  try { new BroadcastChannel("fc-auth").onmessage = function (e) { if (e && e.data && e.data.kind === "out" && !ended) { ended = true; clearInterval(timer); location.replace("/"); } }; } catch (e) {}
  window.addEventListener("storage", function (e) {
    if (e.key === "fc-auth-event" && /^out:/.test(e.newValue || "") && !ended) { ended = true; clearInterval(timer); location.replace("/"); }
  });

  // Start: count this page load as activity (a fresh page is a person), unless the
  // shared clock says the limit has already passed — then sign out at once.
  // The server decides whether a session is still alive (its reply to the first
  // call is 401 session_expired when not); this page only counts activity. An
  // earlier version also judged the shared clock here and signed a *fresh*
  // sign-in out because of a stale value from the previous visit — the bug
  // 「账号登录后自动返回主页面」 (Rick, 2026-10-02).
  touch(); ping();

  window.fcSession = { touch: touch, ping: ping, signOut: signOut, expired: expired, microsoftSignOut: microsoftSignOut, config: cfg };
})();
