// POST /api/auth-roles — the rolesSource function (staticwebapp.config.json → auth.rolesSource).
//
// Static Web Apps calls this once at every sign-in, with the signed-in
// account's identity and claims, and stamps whatever roles it returns onto
// the session: those are the roles route rules (/admin*, /api/sync, …) see
// until the person signs out. Since the site signs in through its own Entra
// app (Education Resource Link only, 2026-09-29), portal invitations are no
// longer relied on — Hive's roles come from here.
//
// Request body (from Static Web Apps):
//   { identityProvider, userId, userDetails, claims: [{typ, val}], accessToken? }
// Response: { roles: ["admin", "domain_it:school.edu", …] }
//
// The account is taken from the token's claims (preferred_username / upn /
// email) rather than trusting userDetails alone, and must belong to the
// tenant (tid claim) — the issuer already guarantees that, the check is a
// second belt. Anything unexpected returns no roles, never an error: a failed
// rolesSource call would block the sign-in itself.
//
// This endpoint is reachable by anyone (Static Web Apps calls it without a
// principal), so it must not reveal more than it has to: it returns roles
// only, for the account named in the body, and nothing else.
const { rolesFor, normUser } = require("../shared/roles");
const { audit } = require("../shared/audit");

const TENANT_ID = (process.env.AZURE_TENANT_ID || "edb20124-7377-4368-acbc-d4be58fe59c3").toLowerCase();

function claim(claims, ...types) {
  for (const t of types) {
    const hit = (claims || []).find((c) => c && (c.typ === t || String(c.typ).endsWith("/" + t)));
    if (hit && hit.val) return String(hit.val);
  }
  return "";
}

module.exports = async function (context, req) {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const claims = Array.isArray(body.claims) ? body.claims : [];
  try {
    const tid = claim(claims, "tid", "http://schemas.microsoft.com/identity/claims/tenantid").toLowerCase();
    if (tid && tid !== TENANT_ID) {
      context.res = { status: 200, body: { roles: [] } };
      return;
    }
    const user = normUser(claim(claims, "preferred_username", "upn", "email", "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/upn") || body.userDetails);
    const roles = await rolesFor(user, true); // Hive's roles + Entra's administrator roles
    context.log(`auth-roles: ${user || "(no account)"} → ${roles.join(",") || "(none)"}`);
    context.res = { status: 200, body: { roles } };
    // Hive's own sign-in record (Entra has the full one; this one is Hive-side and
    // per site). Best effort: a failed audit line must never block a sign-in.
    try { await audit(context, { actor: user, action: "signin", roles, provider: body.identityProvider || "aad", result: "ok" }); } catch { /* logged in audit() */ }
  } catch (err) {
    context.log.error(`auth-roles: ${(err && err.stack) || err}`);
    context.res = { status: 200, body: { roles: [] } };
  }
};
