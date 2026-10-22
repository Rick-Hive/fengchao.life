// Moved out of management/index.html so the Content-Security-Policy can drop 'unsafe-inline' for scripts (2026-10-22).
// One address for the whole site: the sign-in cookie belongs to the host it was made on.
if (location.hostname === "www.fengchao.life") location.replace("https://fengchao.life" + location.pathname + location.search + location.hash);
// Since 2026-10-03 登录 signs in in its own tab, so there is normally no opener
// and this block does nothing. Kept for a sign-in window opened by hand.
// Arrived in the sign-in window (opened by 登录 on another tab; ?signedin=1): hand
// that tab over *before this page renders* and close this window, so the
// person sees the management center load once, in the tab they started from
// (Rick, 2026-10-03: 「两次显示重新加载」 — before, this window drew the whole
// page first, then the other tab drew it again). The other tabs are told once
// (handed), so the header script does not navigate the opener a second time.
// If the window cannot be closed, it loads the page itself after a moment.
(function () {
  if (!/[?&]signedin=1\b/.test(location.search)) return;
  var o = null;
  try { o = window.opener && !window.opener.closed ? window.opener : null; } catch (e) { o = null; }
  if (!o) return;
  var handed = false;
  try { o.location.href = "/management/"; handed = true; } catch (e) { /* cross-origin opener */ }
  if (!handed) return;
  window.__fcHandedOff = true;
  document.documentElement.style.visibility = "hidden";
  try { new BroadcastChannel("fc-auth").postMessage({ kind: "in", at: Date.now(), handed: true }); } catch (e) {}
  try { localStorage.setItem("fc-auth-event", "in:" + Date.now() + ":handed"); } catch (e) {}
  setTimeout(function () { try { window.close(); } catch (e) {} }, 150);
  setTimeout(function () { location.replace("/management/"); }, 2500);
})();
