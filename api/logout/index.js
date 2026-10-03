// POST /api/logout — sign out of Hive only, without Microsoft's sign-out page.
//
// Static Web Apps' own /.auth/logout always hands over to Microsoft's
// "pick an account to sign out" page, and nothing in the platform skips it
// (Rick, 2026-09-29: signing out should not ask for anything). This ends the
// site's session by expiring every cookie that keeps a browser signed in to
// fengchao.life: Static Web Apps' two session cookies and Hive's own fc-sess.
// The Microsoft session in the browser stays; since 2026-10-02 the sign-in
// asks for credentials every time anyway (prompt=login in
// staticwebapp.config.json), so a later 登录 is a real re-login.
//
// POST only, so a prefetch or a stray link cannot sign anyone out, and a
// request from another site is refused (nobody else gets to sign our users
// out). The caller (assets/session-guard.js) then signs the Microsoft account
// out of the browser as well, naming it with logout_hint so Microsoft asks
// nothing (Rick, 2026-10-02).
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
