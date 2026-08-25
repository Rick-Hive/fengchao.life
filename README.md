# fengchao.life — 蜂巢 Hive 高中选课平台

Parent-facing course-ordering site for CEFF's Hive platform. Parents choose a graduation
track and pedagogy, read the graduation requirements, pick courses, and submit an order.
The order is posted to a Microsoft Teams channel via Power Automate. No payment happens
on the site.

## Architecture

- **Frontend**: static bilingual (中文/EN) wizard — `index.html`, `assets/`
- **Admin Center**: `/admin` — Microsoft (Entra ID) sign-in required, "Sync now" button
- **API** (Azure Static Web Apps managed functions, `api/`):
  - `GET /api/data` — serves the published data snapshot (public)
  - `POST /api/order` — validates + re-prices an order from the snapshot, forwards it to Power Automate (public, honeypot + rate limit)
  - `POST /api/sync` — pulls Tracks/Courses/Subjects/Grades/Teachers from Airtable and writes the snapshot to Blob Storage (**admin role only**)
- **Data flow**: Airtable → (admin clicks Sync) → snapshot JSON in Blob Storage → site.
  The site never calls Airtable directly and never updates without an admin sync.

## Required application settings (Azure Portal → Static Web App → Environment variables)

| Setting | Value |
|---|---|
| `AIRTABLE_PAT` | Read-only Airtable personal access token (scope: `data.records:read`, only the Hive base) |
| `STORAGE_CONNECTION_STRING` | Connection string of the Storage Account holding the snapshot |
| `POWER_AUTOMATE_URL` | The "When an HTTP request is received" flow URL |
| `ORDER_SHARED_SECRET` | *(optional)* sent as `X-Order-Secret` header for the flow to verify |
| `AIRTABLE_BASE_ID` | *(optional)* defaults to `appgYiHg9pm6hcRgv` |
| `SNAPSHOT_CONTAINER` | *(optional)* defaults to `site-data` |
| `SYNC_ONLY_AVAILABLE` | *(optional)* set to `1` to publish only courses with "Available/可用？" checked |

## Airtable field mapping

All table IDs and field names live in **`api/shared/config.js`** — if a field is renamed
in Airtable, fix it there only, then run a sync.

## Admin access

Static Web App → Role management → Invite the admin's email with role **`admin`**.
`/admin` and `/api/sync` are restricted to that role in `staticwebapp.config.json`.
Sign-in uses the built-in Microsoft Entra provider (`/.auth/login/aad`); GitHub login is disabled.

## Order JSON sent to Power Automate

See `docs/sample-order.json`. Use it with "Generate from sample" when creating the
flow's HTTP trigger schema.
