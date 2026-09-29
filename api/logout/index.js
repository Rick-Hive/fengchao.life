// POST /api/logout — sign out of Hive only, without Microsoft's sign-out page.
//
// Static Web Apps' own /.auth/logout always hands over to Microsoft's
// "pick an account to sign out" page, and nothing in the platform skips it
// (Rick, 2026-09-29: signing out should not ask for anything). This ends the
// site's session by expiring Static Web Apps' session cookies, which is all
// that keeps a browser signed in to fengchao.life. The Microsoft session in
// the browser stays, so a later 登录 goes straight through; on a shared
// computer the panel still offers the full Microsoft sign-out.
//
// POST only, so a prefetch or a stray link cannot sign anyone out. The caller
// (assets/account-button.js) checks /.auth/me afterwards and falls back to the
// full sign-out if the session is still there.
const COOKIES = ["StaticWebAppsAuthCookie", "StaticWebAppsAuthContextCookie"];

module.exports = async function (context, req) {
  context.res = {
    status: 204,
    headers: { "Cache-Control": "no-store" },
    // The Functions host turns these into one Set-Cookie header each.
    cookies: COOKIES.map((name) => ({
      name, value: "", path: "/", expires: new Date(0), maxAge: 0, secure: true, httpOnly: true, sameSite: "Lax",
    })),
    body: null,
  };
};
