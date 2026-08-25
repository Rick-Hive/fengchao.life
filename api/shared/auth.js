// Reads the Static Web Apps client principal header (defense in depth —
// routing rules in staticwebapp.config.json are the primary gate).
function getPrincipal(req) {
  const header = req.headers["x-ms-client-principal"];
  if (!header) return null;
  try {
    return JSON.parse(Buffer.from(header, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

function hasRole(req, role) {
  const p = getPrincipal(req);
  return !!(p && Array.isArray(p.userRoles) && p.userRoles.includes(role));
}

module.exports = { getPrincipal, hasRole };
