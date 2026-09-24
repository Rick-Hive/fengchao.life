# fengchao.life — 蜂巢 Hive · 以线上资源推动C教育生态重建

The website of CEFF's Hive (蜂巢) platform: rebuilding the offline C-education
ecosystem through online resources. It is bilingual (中文/EN) and serves families,
teachers and schools with:

- **Courses and ordering (K–G12)** — parents choose a pedagogy and a learning
  stage, see graduation tracks and credit requirements (high school), browse the
  catalog and course map, and submit a course order. Orders are posted to a
  Microsoft Teams channel via Power Automate; no payment happens on the site.
- **Tools** — the G.P.A. calculator (`/gpa`), the Microsoft Teams for Education
  application form, contact.
- **Services and the Hive ecosystem** — college programmes, international
  C-schools, testing, dual enrolment, teaching and joining or starting a hive
  (listed in the menus, marked "coming soon" until each one launches).
- **Help** — customer-facing guides under `/help`: the Microsoft Teams and
  Authenticator setup wizard, flowchart, Q&A and case studies.

The menus are defined once, in `window.SITE_MENUS` (`assets/i18n.js`), and every
page — the course site, the calculator and the help pages — wears the same header
(`assets/site-header.css`; the help pages draw it with `assets/site-header.js`).

## Architecture

- **Frontend**: static bilingual (中文/EN) site — `index.html`, `assets/`; help pages in `help/`
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
