// GET /api/oidc-config — Microsoft's OpenID discovery document for our tenant,
// with two edits, for the "entra" sign-in provider in staticwebapp.config.json.
//
// Why this exists (Rick, 2026-10-03): Static Web Apps' /.auth/logout is the
// only thing that clears the platform's own sign-in cookie, and for the
// built-in azureActiveDirectory provider it always hands over to Microsoft's
// end-session page without naming the account — Microsoft then asks "Which
// account do you want to sign out of?" even with one account. Static Web Apps
// takes that page's address from the provider's discovery document
// (end_session_endpoint). This document leaves it out, so /.auth/logout for a
// session signed in through "entra" clears the cookie and comes straight back.
// The second edit bakes prompt=select_account into authorization_endpoint,
// because a custom provider's loginParameters are ignored by the platform:
// every sign-in shows Microsoft's account list (the previous account on top,
// 「使用其他账户」 below).
//
// Everything else — issuer, token endpoint, signing keys — is Microsoft's own,
// so tokens are still issued and verified by Microsoft; this only changes which
// of Microsoft's pages the platform visits. Cached for an hour in the instance
// and by the platform (Cache-Control).
const TENANT_ID = process.env.AZURE_TENANT_ID || "edb20124-7377-4368-acbc-d4be58fe59c3";
const SOURCE = `https://login.microsoftonline.com/${encodeURIComponent(TENANT_ID)}/v2.0/.well-known/openid-configuration`;
const TTL = 60 * 60 * 1000;

let cached = { at: 0, body: "" };

function adapt(doc) {
  const out = Object.assign({}, doc);
  delete out.end_session_endpoint;
  if (out.authorization_endpoint) {
    out.authorization_endpoint += (out.authorization_endpoint.includes("?") ? "&" : "?") + "prompt=select_account";
  }
  return out;
}

module.exports = async function (context) {
  try {
    if (!cached.body || Date.now() - cached.at > TTL) {
      const res = await fetch(SOURCE, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(`discovery ${res.status}`);
      cached = { at: Date.now(), body: JSON.stringify(adapt(await res.json())) };
    }
    context.res = {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=3600" },
      body: cached.body,
    };
  } catch (err) {
    context.log.error(`oidc-config: ${(err && err.stack) || err}`);
    if (cached.body) {
      context.res = { status: 200, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }, body: cached.body };
    } else {
      context.res = { status: 502, headers: { "Cache-Control": "no-store" }, body: { error: "discovery document unavailable" } };
    }
  }
};
module.exports._adapt = adapt;
