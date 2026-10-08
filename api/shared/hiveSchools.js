// The Hive workspace's Schools or Institutions table, read directly (one table,
// one call) so the 机构 page does not depend on a full website sync having run
// (Rick, 2026-10-08: 「机构的数据还是不全，我点击了刷新，没有同步hive中的合作伙伴」).
// Public descriptors only; the Domain column stays server-side (it joins the row
// to the tenant's directory). Same tolerant column names as the website sync
// (config.schoolFields). Returns { institutions: [...], routing: { key: { domain } } }.
const cfg = require("./config");
const { AirtableBase } = require("./airtable");
const { hiveKey } = require("./hive");

function pick(fields, spec) {
  if (spec instanceof RegExp) { for (const k of Object.keys(fields)) if (spec.test(k)) return fields[k]; return undefined; }
  return fields[spec];
}
function text(v) {
  if (v == null) return "";
  if (Array.isArray(v)) return v.map(text).filter(Boolean).join(", ");
  if (typeof v === "object") return typeof v.name === "string" ? v.name : "";
  return String(v).trim();
}

async function readSchools() {
  const pat = process.env.AIRTABLE_PAT;
  if (!pat) throw Object.assign(new Error("AIRTABLE_PAT app setting is not configured"), { code: "no_pat" });
  const base = new AirtableBase(cfg.baseId, pat);
  const recs = await base.list(cfg.tables.schools.id);
  const sf = cfg.schoolFields;
  const institutions = [], routing = {};
  for (const r of recs) {
    const f = r.fields || {};
    const name = text(pick(f, sf.name)), abbr = text(pick(f, sf.abbr));
    const key = hiveKey(abbr || name);
    if (!key) continue;
    institutions.push({ id: r.id, key, name, abbr, type: text(pick(f, sf.type)), region: text(pick(f, sf.region)), country: text(pick(f, sf.country)), city: text(pick(f, sf.city)), website: text(pick(f, sf.website)) });
    const domain = text(pick(f, sf.domain)).toLowerCase();
    if (domain) routing[key] = { domain };
  }
  return { institutions, routing, readAt: new Date().toISOString() };
}

module.exports = { readSchools };
