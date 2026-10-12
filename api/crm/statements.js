// /api/crm/{statements|statement} — IT service statements (api/shared/statements.js).
// Split out of index.js like partners.js; handle() returns true when it answered.
//
//   GET  crm/statements?month=YYYY-MM          every school for that month: saved statement or live preview
//   GET  crm/statement?domain=&month=[&price=&discount=&pct=]   one statement in full (saved), or the live
//                                               preview (saved:false) with the figures finance is trying
//   POST crm/statement {op:"generate", domain, month, unitPriceYear, discount, discountPct, note}
//                                               → draft (a draft is replaced)
//   POST crm/statement {op:"status", domain, month, status: draft|sent|paid, note}
//
// Who: finance (money rw) and the system administrator generate and mark; anyone with
// money ≥ read or partners ≥ read (CEO, partnership, community …) reads. Schools' own
// administrators never reach /api/crm.
const S = require("../shared/statements");
const dir = require("../shared/directory");
const crm = require("../shared/crm");
const { normUser, isAdmin } = require("../shared/roles");
const { readInstitutions } = require("../shared/people");
const { audit } = require("../shared/audit");

const ACTIONS = new Set(["statements", "statement"]);
const canSee = (roles) => isAdmin(roles) || crm.atLeast(roles, "money", "read") || crm.atLeast(roles, "partners", "read");
const canEdit = (roles) => isAdmin(roles) || crm.atLeast(roles, "money", "rw");

// The three figures finance may set (服务年费 / 免费账号数 / 折扣 %): absent or blank = keep
// the default; otherwise a number in range, or a 400 naming the field.
function figures(src) {
  const opts = {};
  const take = (v, key, check, msg) => { if (v === undefined || v === null || v === "") return null; const n = Number(v); if (!Number.isFinite(n) || !check(n)) return msg; opts[key] = n; return null; };
  const error = take(src.price, "unitPriceYear", (n) => n >= 0, "unitPriceYear must be a non-negative amount per account per year")
    || take(src.discount, "discount", (n) => n >= 0, "discount must be a whole number of free accounts")
    || take(src.pct, "discountPct", (n) => n >= 0 && n <= 100, "discountPct must be between 0 and 100");
  return { opts, error };
}

async function schoolNames() {
  try { return (await readInstitutions()).institutions || {}; } catch { return {}; }
}
async function domainsToBill() {
  let list = [];
  try { list = (await dir.verifiedDomains()).map((d) => d.domain); } catch { list = []; }
  if (!list.length) { try { list = (await dir.cachedDomains()).map((d) => d.domain); } catch { list = []; } }
  return list;
}

async function handle(context, req, ctx) {
  const { action, method, user, roles, ok, fail } = ctx;
  if (!ACTIONS.has(action)) return false;
  if (!canSee(roles)) { fail(context, 403, "no_access"); return true; }
  const q = req.query || {};
  const body = req.body && typeof req.body === "object" ? req.body : {};

  if (action === "statements" && method === "GET") {
    const month = S.monthOk(q.month) ? q.month : S.defaultMonth();
    const [domains, names] = await Promise.all([domainsToBill(), schoolNames()]);
    const out = await S.listMonth(month, domains, names);
    ok(context, Object.assign(out, { canEdit: canEdit(roles), defaultMonth: S.defaultMonth(), price: S.DEFAULT_PRICE, currency: S.DEFAULT_CURRENCY }));
    return true;
  }

  const domain = String(q.domain || body.domain || "").trim().toLowerCase();
  const month = String(q.month || body.month || "").trim();
  if (!dir.DOMAIN_RE.test(domain)) { fail(context, 400, "domain missing or malformed"); return true; }
  if (!S.monthOk(month)) { fail(context, 400, "month must be YYYY-MM"); return true; }
  const names = await schoolNames();
  const school = { domain, name: (names[domain] && names[domain].name) || "", nameEn: (names[domain] && names[domain].nameEn) || "" };

  if (action === "statement" && method === "GET") {
    const saved = await S.readStatement(domain, month);
    if (saved) { ok(context, { statement: Object.assign({ school }, saved, { school: saved.school || school }), saved: true, canEdit: canEdit(roles) }); return true; }
    const ix = await S.readIndex();
    const prev = (ix.items || {})[`${domain}|${S.prevMonth(month)}`];
    const tried = figures(q);
    if (tried.error) { fail(context, 400, tried.error); return true; }
    const preview = await S.compute(domain, month, Object.assign(S.prevOpts(prev), tried.opts));
    ok(context, { statement: Object.assign({ school, status: null }, preview), saved: false, canEdit: canEdit(roles) });
    return true;
  }

  if (action === "statement" && method === "POST") {
    if (!canEdit(roles)) { fail(context, 403, "statements are generated and marked by finance or the system administrator", { code: "forbidden" }); return true; }
    const op = String(body.op || "").toLowerCase();
    const by = normUser(user);
    try {
      if (op === "generate") {
        const f = figures({ price: body.unitPriceYear, discount: body.discount, pct: body.discountPct });
        if (f.error) { fail(context, 400, f.error); return true; }
        const stm = await S.generate(domain, month, Object.assign({ note: body.note, school }, f.opts), by);
        await audit(context, { actor: by, action: "crm.statement.generate", target: `${domain} ${month}`, id: stm.id, billable: stm.billable, discount: stm.discount, discountPct: stm.discountPct, unitPriceYear: stm.unitPriceYear, amount: stm.amount, currency: stm.currency, result: "ok" });
        ok(context, { ok: true, statement: stm });
        return true;
      }
      if (op === "status") {
        const stm = await S.setStatus(domain, month, String(body.status || ""), by, body.note);
        await audit(context, { actor: by, action: "crm.statement.status", target: `${domain} ${month}`, id: stm.id, status: stm.status, result: "ok" });
        ok(context, { ok: true, statement: stm });
        return true;
      }
      fail(context, 400, "op must be generate or status");
    } catch (err) {
      if (err && err.status) { fail(context, err.status, err.message, { code: err.code }); return true; }
      throw err;
    }
    return true;
  }
  fail(context, 405, "method not allowed");
  return true;
}

module.exports = { handle };
