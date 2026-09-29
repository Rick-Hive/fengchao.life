// Hive's own role assignments, kept beside the snapshot as roles.json.
//
// Static Web Apps' built-in sign-in only knows the roles handed out through the
// Azure portal's invitation flow (that is how `admin` is granted today). Roles
// that a Hive administrator assigns from the Admin Center — the CRM 录入员
// (`crm_entry`) first — live here instead, keyed by the signed-in account
// (the `userDetails` of the client principal, i.e. the UPN / email), so no
// portal visit is needed to add or remove a person.
//
// `admin` from the portal implies every Hive role: the administrator who can
// hand a role out can also use it, which keeps testing honest.
//
// Shape of roles.json: { "entries": [ { "user": "someone@domain", "roles": ["crm_entry"],
// "by": "admin@domain", "at": "2026-09-29T02:00:00.000Z" } ] }
const { BlobServiceClient } = require("@azure/storage-blob");
const { snapshotBlob } = require("./config");
const { getPrincipal, hasRole } = require("./auth");

const BLOB_NAME = "roles.json";

// The roles a Hive administrator may assign. Anything else in a request is
// refused, so a typo never becomes a role nobody checks for.
const ASSIGNABLE = {
  crm_entry: { zh: "录入员", en: "CRM data entry" },
};

function blobClient() {
  const conn = process.env.STORAGE_CONNECTION_STRING;
  if (!conn) throw new Error("STORAGE_CONNECTION_STRING app setting is not configured");
  const container = BlobServiceClient.fromConnectionString(conn).getContainerClient(snapshotBlob.container);
  return { container, blob: container.getBlockBlobClient(BLOB_NAME) };
}

function normUser(u) {
  return String(u || "").trim().toLowerCase();
}

async function readRoles() {
  const { blob } = blobClient();
  if (!(await blob.exists())) return { entries: [] };
  try {
    const buf = await blob.downloadToBuffer();
    const parsed = JSON.parse(buf.toString("utf8"));
    const entries = Array.isArray(parsed && parsed.entries) ? parsed.entries : [];
    return {
      entries: entries
        .map((e) => ({
          user: normUser(e.user),
          roles: Array.isArray(e.roles) ? e.roles.filter((r) => ASSIGNABLE[r]) : [],
          by: e.by || "",
          at: e.at || "",
        }))
        .filter((e) => e.user && e.roles.length),
    };
  } catch {
    return { entries: [] };
  }
}

async function writeRoles(doc) {
  const { container, blob } = blobClient();
  await container.createIfNotExists();
  const body = JSON.stringify({ entries: doc.entries || [] }, null, 2);
  await blob.upload(body, Buffer.byteLength(body), {
    blobHTTPHeaders: { blobContentType: "application/json; charset=utf-8" },
  });
}

// Every role the signed-in account holds: the portal's plus Hive's own.
async function userRoles(req) {
  const p = getPrincipal(req);
  if (!p) return { user: "", roles: [] };
  const user = normUser(p.userDetails);
  const roles = new Set((p.userRoles || []).filter((r) => r !== "anonymous" && r !== "authenticated"));
  if (user) {
    // Storage trouble must not lock a portal admin out: fall back to the
    // portal's roles alone and let the caller see nothing of Hive's.
    let doc = { entries: [] };
    try { doc = await readRoles(); } catch { /* portal roles only */ }
    const entry = doc.entries.find((e) => e.user === user);
    if (entry) entry.roles.forEach((r) => roles.add(r));
  }
  return { user, roles: Array.from(roles) };
}

// True when the account holds `role`, or is a portal admin.
async function userHasRole(req, role) {
  if (hasRole(req, "admin")) return true;
  const { roles } = await userRoles(req);
  return roles.includes(role);
}

module.exports = { ASSIGNABLE, readRoles, writeRoles, userRoles, userHasRole, normUser };
