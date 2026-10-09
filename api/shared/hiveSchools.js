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

// The College/University table (Rick, 2026-10-09: 「Why these colleges/universities
// are not in university?」 — Grove City, Covenant, Biola … live in their own table,
// not in Schools or Institutions). Public descriptors plus the one contact the row
// names; the contact's email is kept server-side (it becomes a people-hub person
// when the partner relationship is seeded). Column names are tolerant.
const COLLEGE_FIELDS = {
  name: /^Name/i, intro: /^Program Introduction/i, programs: /^Program(s)? Offered/i,
  contactName: /^Contact Name/i, contactEmail: /^Contact Email/i, contactTitle: /^Contact Title/i,
  partnership: /^Partnership/i, website: /^(Website|网站|网址|URL)/i, country: /^(Country|国家)/i, city: /^(City|城市)/i, region: /^(Region|地区|区域)/i,
};
async function readColleges() {
  const pat = process.env.AIRTABLE_PAT;
  if (!pat) throw Object.assign(new Error("AIRTABLE_PAT app setting is not configured"), { code: "no_pat" });
  const base = new AirtableBase(cfg.baseId, pat);
  // By table NAME first (the Airtable API takes a name in place of an id, and the
  // website PAT may lack the schema scope); the schema lookup is the fallback.
  const NAMES = ["College/University", "Colleges/Universities", "College", "University", "大学"];
  let recs = null, lastErr = null;
  for (const n of NAMES) { try { recs = await base.list(encodeURIComponent(n)); break; } catch (err) { lastErr = err; } }
  if (!recs) { const table = await base.table(NAMES).catch(() => null); if (!table) throw lastErr || new Error("College/University table not found"); recs = await base.list(table.id); }
  const institutions = [], contacts = {};
  for (const r of recs) {
    const f = r.fields || {};
    const name = text(pick(f, COLLEGE_FIELDS.name));
    const key = hiveKey(name);
    if (!key) continue;
    const programs = pick(f, COLLEGE_FIELDS.programs);
    institutions.push({
      id: r.id, key, name, abbr: "", type: "大学 / University", region: text(pick(f, COLLEGE_FIELDS.region)), country: text(pick(f, COLLEGE_FIELDS.country)), city: text(pick(f, COLLEGE_FIELDS.city)), website: text(pick(f, COLLEGE_FIELDS.website)),
      college: true, partnership: text(pick(f, COLLEGE_FIELDS.partnership)), programs: Array.isArray(programs) ? programs.map(text).filter(Boolean) : text(programs) ? [text(programs)] : [], intro: text(pick(f, COLLEGE_FIELDS.intro)).slice(0, 2000),
      contact: null,
    });
    const email = text(pick(f, COLLEGE_FIELDS.contactEmail)).toLowerCase();
    const cname = text(pick(f, COLLEGE_FIELDS.contactName));
    if (email.includes("@") || cname) { contacts[key] = { name: cname, email: email.includes("@") ? email : "", title: text(pick(f, COLLEGE_FIELDS.contactTitle)) }; institutions[institutions.length - 1].contact = contacts[key]; }
  }
  return { institutions, contacts, readAt: new Date().toISOString() };
}

module.exports = { readSchools, readColleges, COLLEGE_FIELDS };
