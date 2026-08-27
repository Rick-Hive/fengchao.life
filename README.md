# fengchao.life — 蜂巢 Hive K-12 选课平台

Parent-facing course-ordering site for CEFF's Hive platform, covering **K–G12**.
K–G8 parents browse the catalog directly; high-school parents choose a graduation
track and pedagogy, read the requirements, then pick courses. Orders are posted to
a Microsoft Teams channel via Power Automate. No payment happens on the site.

## Architecture

- **Frontend**: static bilingual (中文/EN) wizard — `index.html`, `assets/`
  - Compact course cards (name, language, teacher, price, schedule) with a
    Select button; clicking a card opens a full-detail modal; teacher names
    open a teacher-profile popup.
- **Admin Center**: `/admin` — Microsoft (Entra ID) sign-in required, "Sync now" button
- **API** (Azure Static Web Apps managed functions, `api/`):
  - `GET /api/data` — serves the published data snapshot (public)
  - `GET /api/asset?key=…` — serves mirrored attachments: teacher photos, syllabi (public)
  - `POST /api/order` — validates + re-prices an order from the snapshot, forwards it to Power Automate (public, honeypot + rate limit + **email-domain blocklist**: QQ/163/Sina-style mailboxes rejected)
  - `POST /api/sync` — pulls all 8 tables from Airtable, resolves linked records, mirrors attachments to blob storage, writes the snapshot (**admin role only**)
- **Data flow**: Airtable → (admin clicks Sync) → snapshot JSON + mirrored assets in Blob Storage → site.
  The site never calls Airtable directly and never updates without an admin sync.

## Tables synced

Tracks (1–6 + the "N/A" track 7 that tags K–G8 courses), Courses, Subjects, Grades,
Teachers, Class Periods, Textbooks, Schools/Institutions.

**Privacy: the snapshot never contains** teacher emails/Teams accounts/internal notes,
school contact info, or textbook sales data — those fields are excluded at sync time.

## Required application settings (Azure Portal → Static Web App → Environment variables)

| Setting | Value |
|---|---|
| `AIRTABLE_PAT` | Read-only Airtable personal access token (scope: `data.records:read`, only the Hive base) |
| `STORAGE_CONNECTION_STRING` | Connection string of the Storage Account holding the snapshot |
| `POWER_AUTOMATE_URL` | The "When an HTTP request is received" flow URL |
| `ORDER_SHARED_SECRET` | *(optional)* sent as `X-Order-Secret` header for the flow to verify |
| `AIRTABLE_BASE_ID` | *(optional)* defaults to `appgYiHg9pm6hcRgv` |
| `SNAPSHOT_CONTAINER` | *(optional)* defaults to `site-data` |
| `ASSETS_CONTAINER` | *(optional)* defaults to `site-assets` |
| `SYNC_ONLY_AVAILABLE` | *(optional)* set to `1` to publish only courses marked available |

## Airtable field mapping

All table IDs and field names live in **`api/shared/config.js`** — if a field is renamed
in Airtable, fix it there only, then run a sync. Some newer fields are matched by
regex prefix (see the `re:` entries) so minor renames don't break the sync.

## Admin access

Static Web App → Role management → Invite the admin's email with role **`admin`**.
`/admin` and `/api/sync` are restricted to that role in `staticwebapp.config.json`.
Sign-in uses the built-in Microsoft Entra provider (`/.auth/login/aad`); GitHub login is disabled.

## Order JSON sent to Power Automate

See `docs/sample-order.json` (unchanged in v2 — existing flows keep working).
K–G8 orders arrive with `track: { "trackId": 7, "name": "K-G8 Courses/小学·初中课程" }`.
