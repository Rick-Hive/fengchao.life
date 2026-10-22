// Moved out of index.html so the Content-Security-Policy can drop 'unsafe-inline' for scripts (2026-10-22).
// One address for the whole site (2026-09-29): the sign-in is a cookie of
// the host it was made on, so www.fengchao.life and fengchao.life would be
// two separate sessions — signing out on one would leave the other signed in.
if (location.hostname === "www.fengchao.life") location.replace("https://fengchao.life" + location.pathname + location.search + location.hash);
// ?signedout=<why> (set by assets/session-guard.js after an automatic sign-out) is read
// here, before app.js rewrites the address; assets/account-button.js shows the notice.
window.__fcSignedOut = (location.search.match(/[?&]signedout=([a-z]+)/) || [])[1] || "";
