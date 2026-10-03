// POST /api/logout — sign out of Hive only, without Microsoft's sign-out page.
//
// Static Web Apps' own /.auth/logout always hands over to Microsoft's
// "pick an account to sign out" page, and nothing in the platform skips it
// (Rick, 2026-09-29: signing out should not ask for anything). This ends the
// site's session by expiring every cookie that keeps a browser signed in to
// fengchao.life: Static Web Apps' two session cookies and Hive's own fc-sess.
// The Microsoft session in the browser may stay; the next 登录 shows Microsoft's
// account list (prompt=select_account in staticwebapp.config.json).
//
// POST only, so a prefetch or a stray link cannot sign anyone out, and a
// request from another site is refused (nobody else gets to sign our users
// out). The caller (assets/session-guard.js goHome, account-button.js signOut,
// management.js switchAccount) then goes through /.auth/logout, the only thing
// that clears the platform's own sign-in cookie (2026-10-03).
const { signOutCookies, signInKey, parseCookies, crossSite } = require("../shared/session");
const { getPrincipal } = require("../shared/auth");

module.exports = async function (context, req) {
  const why = crossSite(req);
  if (why) {
    context.res = { status: 403, headers: { "Cache-Control": "no-store" }, body: { error: "refused: " + why } };
    return;
  }
  // Static Web Apps does not let a function clear its own sign-in cookie on the
  // live site, so fc-sess becomes a signed "signed out" marker bound to this
  // sign-in (see session.js): until the person signs in again, every guarded call
  // and the header's state check treat the browser as signed out.
  const k = signInKey(parseCookies(req), getPrincipal(req));
  context.res = {
    status: 204,
    headers: { "Cache-Control": "no-store" },
    // The Functions host turns these into one Set-Cookie header each.
    cookies: signOutCookies(k),
    body: null,
  };
};
