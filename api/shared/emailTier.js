// Email security tiers (design §3 "邮箱规则与安全等级", Rick 2026-10-06; decision 13).
//
// Every address that enters the People Hub is classed by its domain:
//   safe     — a tenant UPN (any school or hive domain), an organization's own
//              domain, or an international provider (Gmail, Outlook, iCloud…)
//   replace  — a mainland-China provider, or any domain ending in .cn: insecure,
//              red-tagged "待替换", to be moved to a Teams account over time
//   missing  — no address
// The mainland list and the whitelist are configuration (EMAIL_REPLACE_DOMAINS /
// EMAIL_SAFE_DOMAINS app settings, comma-separated) so the system administrator
// can extend them without a deploy; the defaults below are the design's list.
// The same list, as an Airtable formula, is EMAIL_TIER_FORMULA (phase 0: lets the
// order manager filter inside Airtable before the hub exists).
const DEFAULT_REPLACE = [
  "qq.com", "vip.qq.com", "foxmail.com",
  "163.com", "126.com", "yeah.net", "188.com", "vip.163.com", "vip.126.com",
  "sina.com", "sina.cn", "vip.sina.com", "sohu.com", "aliyun.com",
  "139.com", "189.cn", "wo.cn", "wo.com.cn", "tom.com", "21cn.com", "263.net",
  "hotmail.cn", "outlook.cn", "live.cn", "yahoo.cn",
];

function listSetting(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback.slice();
  return raw.split(/[,;\s]+/).map((d) => d.trim().toLowerCase()).filter(Boolean);
}
function replaceDomains() { return listSetting("EMAIL_REPLACE_DOMAINS", DEFAULT_REPLACE); }
function safeDomains() { return listSetting("EMAIL_SAFE_DOMAINS", []); }

// Lower-case, trimmed, with the "(deleted)" and similar suffixes Airtable's
// Teams-account column carries stripped — three real rows have them.
function normalizeEmail(s) {
  let e = String(s || "").trim().toLowerCase();
  e = e.replace(/\s*\((deleted|已删除|removed)\)\s*$/i, "").replace(/\s+/g, "");
  return e;
}
function domainOf(email) {
  const e = normalizeEmail(email);
  const at = e.lastIndexOf("@");
  return at > 0 ? e.slice(at + 1) : "";
}
function matches(domain, list) {
  return list.some((d) => domain === d || domain.endsWith("." + d));
}

// "safe" | "replace" | "missing". `opts.tenantDomains` = the tenant's verified
// domains (always safe); `opts.whitelist` / `opts.blacklist` override the settings.
function tier(email, opts) {
  opts = opts || {};
  const domain = domainOf(email);
  if (!domain) return "missing";
  const white = opts.whitelist || safeDomains();
  if (matches(domain, white) || matches(domain, opts.tenantDomains || [])) return "safe";
  const black = opts.blacklist || replaceDomains();
  if (matches(domain, black) || domain === "cn" || domain.endsWith(".cn")) return "replace";
  return "safe";
}

// The primary address for a person (design §3): safe personal → Teams UPN →
// mainland address awaiting replacement → none. Returns { email, tier, viaTeams }.
function primaryEmail(personal, upn, opts) {
  const p = normalizeEmail(personal);
  const u = normalizeEmail(upn);
  const pt = tier(p, opts);
  if (pt === "safe") return { email: p, tier: "safe", viaTeams: false };
  if (u) return { email: u, tier: "safe", viaTeams: true };
  if (pt === "replace") return { email: p, tier: "replace", viaTeams: false };
  return { email: "", tier: "missing", viaTeams: false };
}

// Airtable formula for a "邮箱等级" field on Customers (phase 0 quick win).
// Assumes the email field is named {Email}; rename to taste.
function airtableFormula(field) {
  const f = field || "Email";
  const finds = DEFAULT_REPLACE.map((d) => `FIND("@${d}", LOWER({${f}}))`).join(", ");
  return `IF({${f}} = "", "缺失", IF(OR(${finds}, REGEX_MATCH(LOWER({${f}}), "\\.cn$")), "待替换", "安全"))`;
}

module.exports = { DEFAULT_REPLACE, replaceDomains, safeDomains, normalizeEmail, domainOf, tier, primaryEmail, airtableFormula };
