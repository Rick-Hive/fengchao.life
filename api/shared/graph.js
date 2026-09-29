// Microsoft Graph, as Hive's own app identity (client credentials).
//
// The same Entra app registration signs people in (staticwebapp.config.json)
// and, with its application permissions, lets the Functions read and change
// directory data. The browser never sees a Graph token: every call is made
// here, after the calling function has checked who is asking and whether they
// may touch the target account.
//
// App settings: AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET.
// Application permissions granted (phase 1, 2026-09-29): User.ReadWrite.All,
// UserAuthenticationMethod.ReadWrite.All, AuditLog.Read.All,
// Directory.Read.All, Team.ReadBasic.All.
const GRAPH = "https://graph.microsoft.com/v1.0";

let cached = { token: "", exp: 0 };

function settings() {
  const tenant = process.env.AZURE_TENANT_ID;
  const id = process.env.AZURE_CLIENT_ID;
  const secret = process.env.AZURE_CLIENT_SECRET;
  const missing = [["AZURE_TENANT_ID", tenant], ["AZURE_CLIENT_ID", id], ["AZURE_CLIENT_SECRET", secret]]
    .filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) {
    const err = new Error(`app setting(s) not configured: ${missing.join(", ")}`);
    err.status = 500;
    throw err;
  }
  return { tenant, id, secret };
}

async function token() {
  const now = Date.now();
  if (cached.token && now < cached.exp - 120000) return cached.token;
  const { tenant, id, secret } = settings();
  const res = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: id,
      client_secret: secret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }).toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    const err = new Error(`Graph token: HTTP ${res.status} ${data.error || ""} ${String(data.error_description || "").split("\n")[0]}`.trim());
    err.status = 502;
    throw err;
  }
  cached = { token: data.access_token, exp: now + (Number(data.expires_in) || 3600) * 1000 };
  return cached.token;
}

// One Graph request. `path` is relative to /v1.0 (or a full nextLink URL).
// Retries once on 429/503 after Retry-After (capped at 5 s). Throws an Error
// carrying .status and .code from Graph's error body.
async function graph(method, path, body, extraHeaders) {
  const url = /^https:/.test(path) ? path : GRAPH + path;
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(url, {
      method,
      headers: Object.assign(
        { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" },
        extraHeaders || {}
      ),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if ((res.status === 429 || res.status === 503) && attempt === 0) {
      const wait = Math.min(5, parseInt(res.headers.get("Retry-After") || "1", 10) || 1);
      await new Promise((r) => setTimeout(r, wait * 1000));
      continue;
    }
    if (res.status === 204) return null;
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    if (!res.ok) {
      const e = (data && data.error) || {};
      const err = new Error(`Graph ${method} ${path.replace(GRAPH, "")} -> HTTP ${res.status}: ${e.code || ""} ${e.message || text.slice(0, 200)}`.trim());
      err.status = res.status;
      err.code = e.code || "";
      throw err;
    }
    return data;
  }
  return null;
}

// GET a collection, following @odata.nextLink up to `max` items.
async function list(path, max, extraHeaders) {
  const out = [];
  let next = path;
  while (next && out.length < (max || 500)) {
    const page = await graph("GET", next, undefined, extraHeaders);
    out.push(...((page && page.value) || []));
    next = page && page["@odata.nextLink"];
  }
  return out.slice(0, max || 500);
}

function q(s) {
  return String(s).replace(/'/g, "''");
}

module.exports = { graph, list, q, _reset: () => { cached = { token: "", exp: 0 }; } };
