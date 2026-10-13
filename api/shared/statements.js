// IT service statements — the monthly invoice of a school (design v2 §4, phase 4 first
// cut; Rick 2026-10-12: 「每个月 5 号前可以看到每个学校的月度账单……用户每年 5 美金……统计上个月
// 1 号至本月 1 号的用户数，然后允许我填写扣减账号的数量，生成账单。明细中列出单月账号变动
// 情况，删除的账号列表，新增的账号列表」).
//
// A statement covers one calendar month: from its 1st to the 1st of the next month
// (Beijing). The accounts on each of those days come from the directory's monthly
// snapshots (taken by the first sync on or after the 1st); a day without a snapshot is
// reconstructed from the current rows, their created dates and the removal ledger, and
// the statement says so. Billable = the licensed accounts (an A1 plan) on the school's
// own domain on the 1st of the month (Rick, 2026-10-13: 「账单按照月初许可证的数量计算
// 费用。本月新增的用户，从下个月开始收费」): an account added during the month is first
// billed next month, when it is in that month's opening snapshot; one removed during the
// month is still billed for it. Finance sets three figures before generating
// (Rick, 2026-10-13: 「让我输入服务年费，折扣和免费账户数，然后再生成账单」):
//   unitPriceYear — the price per account per year (服务年费)
//   discount      — free accounts, not billed (免费账号数; the field keeps its first name)
//   discountPct   — a percentage off the subtotal (折扣)
// amount = (billable − discount) × unitPriceYear ÷ 12 × (1 − discountPct ÷ 100).
// Defaults: last month's statement of the school, else the IT relationship's terms
// (terms.unitPriceYear, terms.discountSeats, terms.discountPct; terms.currency), else
// 5 USD, 0, 0.
//
// Storage: crm/statements/<domain>/<YYYY-MM>.json, ids STM-nnnnnn minted in
// crm/statements/_index.json, which also keeps the listing's summary per statement.
// Status: draft → sent → paid (finance marks by hand; nothing is sent automatically).
//
// Period statements (Rick, 2026-10-13: 「账单能否做成可选：起始月份，截止月份，生成这段时间
// 内的账单明细」): one statement for several consecutive months, keyed `<from>_<to>`
// (blob crm/statements/<domain>/<from>_<to>.json, index key `<domain>|<from>_<to>`). Each
// month inside is computed exactly like a monthly statement (its own opening snapshot,
// additions, removals) with the same three figures applied to every month; the statement
// carries the per-month rows and the totals. It has its own id and status, independent of
// any monthly statements of the same months. `key` below is a month or such a period key.
const dir = require("./directory");
const store = require("./jsonstore");
const P = require("./partners");

const INDEX = "crm/statements/_index.json";
const EMPTY_INDEX = () => ({ next: 1, items: {} });
const DEFAULT_PRICE = 5;
const DEFAULT_CURRENCY = "USD";
const STATUSES = ["draft", "sent", "paid"];

const MAX_PERIOD_MONTHS = 24;

const pad = (n) => "STM-" + String(n).padStart(6, "0");
const key = (domain, month) => `${domain}|${month}`;
const blobOf = (domain, month) => `crm/statements/${domain}/${month}.json`;

function monthOk(m) { return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(m || "")); }
function nextMonth(m) { const [y, mo] = m.split("-").map(Number); return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`; }
function prevMonth(m) { const [y, mo] = m.split("-").map(Number); return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, "0")}`; }
// Period keys: `<from>_<to>`, from < to, at most MAX_PERIOD_MONTHS months. from === to is
// just the month.
function periodKey(from, to) { return from === to ? from : `${from}_${to}`; }
function parseKey(k) {
  const s = String(k || "");
  if (monthOk(s)) return { month: s, from: s, to: s, period: false };
  const m = /^(\d{4}-\d{2})_(\d{4}-\d{2})$/.exec(s);
  if (!m || !monthOk(m[1]) || !monthOk(m[2]) || m[1] >= m[2]) return null;
  if (monthsBetween(m[1], m[2]).length > MAX_PERIOD_MONTHS) return null;
  return { month: null, from: m[1], to: m[2], period: true };
}
function keyOk(k) { return !!parseKey(k); }
function monthsBetween(from, to) { const out = []; for (let m = from; m <= to && out.length <= MAX_PERIOD_MONTHS; m = nextMonth(m)) out.push(m); return out; }
// The month a statement is normally viewed for: the one before the current Beijing month.
function defaultMonth(now) { return prevMonth(dir.beijingDate(now).slice(0, 7)); }
// Beijing midnight of the 1st, as an ISO instant, for comparing created / removed times.
function dayStart(month) { return new Date(`${month}-01T00:00:00+08:00`).toISOString(); }

const licensed = (r) => !!r.plan;
const slim = (r) => ({ upn: r.upn, displayName: r.displayName || "", plan: r.plan || "", enabled: r.enabled !== false, created: r.created || null });

// The accounts of `domain` as of the 1st of `month`: the snapshot, else reconstructed.
async function accountsAt(domain, month, ctx) {
  const snap = await dir.readSnapshot(domain, month);
  if (snap && Array.isArray(snap.accounts)) return { accounts: snap.accounts.map(slim), at: snap.at, reconstructed: false };
  const start = dayStart(month);
  const nowRows = (ctx.doc.users || []).filter((r) => !r.created || r.created < start).map(slim);
  const seen = new Set(nowRows.map((r) => r.upn));
  // Rows removed after that day that existed on it.
  const back = (ctx.ledger.events || []).filter((e) => e.kind === "removed" && e.at >= start && (!e.created || e.created < start) && !seen.has(e.upn)).map((e) => Object.assign(slim(e), { removedAt: e.at }));
  for (const r of back) seen.add(r.upn);
  return { accounts: nowRows.concat(back), at: null, reconstructed: true };
}

// The IT relationship of a domain (open), for the price, currency and discount defaults.
// crm/relationships.json keeps `items` as an object keyed by REL id (partners.js); an
// array is tolerated for older fixtures.
function itRelationshipOf(rels, domain) {
  const items = rels && rels.items ? (Array.isArray(rels.items) ? rels.items : Object.values(rels.items)) : [];
  return items.find((r) => r && r.type === "it" && !r.closed && r.terms && String(r.terms.domain || "").toLowerCase() === domain) || null;
}

// The month's figures for one domain. `opts.discount` overrides the default.
async function compute(domain, month, opts) {
  const o = opts || {};
  const [doc, ledger, rels] = await Promise.all([dir.readDomain(domain), dir.readLedger(domain), o.rels ? Promise.resolve(o.rels) : P.readRels()]);
  const ctx = { doc, ledger };
  const end = nextMonth(month);
  const [a0, a1] = await Promise.all([accountsAt(domain, month, ctx), accountsAt(domain, end, ctx)]);
  const startSet = new Map(a0.accounts.map((r) => [r.upn, r]));
  const endSet = new Map(a1.accounts.map((r) => [r.upn, r]));
  const added = a1.accounts.filter((r) => !startSet.has(r.upn)).sort((x, y) => String(x.created || "").localeCompare(String(y.created || "")) || x.upn.localeCompare(y.upn));
  const startIso = dayStart(month), endIso = dayStart(end);
  const removedAt = new Map((ledger.events || []).filter((e) => e.kind === "removed" && e.at >= startIso && e.at < endIso).map((e) => [e.upn, e.at]));
  const removed = a0.accounts.filter((r) => !endSet.has(r.upn)).map((r) => Object.assign({}, r, { removedAt: removedAt.get(r.upn) || r.removedAt || null })).sort((x, y) => String(x.removedAt || "").localeCompare(String(y.removedAt || "")) || x.upn.localeCompare(y.upn));
  const rel = itRelationshipOf(rels, domain);
  const terms = (rel && rel.terms) || {};
  const pick = (v, fallback) => (v === undefined || v === null || v === "" ? fallback : v);
  const rawPrice = pick(o.unitPriceYear, terms.unitPriceYear);
  const unitPriceYear = rawPrice === undefined ? DEFAULT_PRICE : Math.max(0, Number(rawPrice) || 0);
  const currency = String(o.currency || terms.currency || DEFAULT_CURRENCY).toUpperCase();
  const billable = a0.accounts.filter(licensed).length;
  const discount = Math.max(0, Math.min(billable, Math.round(Number(pick(o.discount, terms.discountSeats)) || 0)));
  const discountPct = Math.max(0, Math.min(100, Math.round((Number(pick(o.discountPct, terms.discountPct)) || 0) * 100) / 100));
  const subtotal = Math.round(((billable - discount) * unitPriceYear) / 12 * 100) / 100;
  const amount = Math.round(subtotal * (1 - discountPct / 100) * 100) / 100;
  const count = (list) => ({ total: list.length, licensed: list.filter(licensed).length, student: list.filter((r) => r.plan === "student").length, faculty: list.filter((r) => r.plan === "faculty").length, disabled: list.filter((r) => r.enabled === false).length });
  return {
    domain, month, period: { start: `${month}-01`, end: `${end}-01` },
    relationship: rel ? rel.id : null,
    counts: { start: count(a0.accounts), end: count(a1.accounts), added: added.length, removed: removed.length },
    billable, discount, discountPct, unitPriceYear, currency, subtotal, amount,
    added, removed,
    snapshots: { start: a0.at, end: a1.at },
    reconstructed: { start: a0.reconstructed, end: a1.reconstructed },
    synced: doc.syncedAt || null,
  };
}

// Several consecutive months as one statement: every month computed like a monthly
// statement with the same figures (the free-account figure is capped per month), then
// summed. The month rows keep their own added / removed lists for the detail.
async function computePeriod(domain, from, to, opts) {
  const o = opts || {};
  const rels = o.rels || (await P.readRels());
  const months = [];
  for (const m of monthsBetween(from, to)) months.push(await compute(domain, m, Object.assign({}, o, { rels })));
  const first = months[0], last = months[months.length - 1];
  const sum = (f) => Math.round(months.reduce((s, m) => s + (f(m) || 0), 0) * 100) / 100;
  const maxBillable = Math.max(0, ...months.map((m) => m.billable));
  const pickNum = (v) => (v === undefined || v === null || v === "" ? undefined : Number(v));
  // The figures as set (not the per-month capped ones), so the panel's inputs show what finance typed.
  const discount = Math.max(0, Math.min(maxBillable, Math.round(pickNum(o.discount) ?? first.discount)));
  return {
    domain, from, to, period: { start: `${from}-01`, end: `${nextMonth(to)}-01` }, months: months.length,
    relationship: first.relationship,
    counts: { start: first.counts.start, end: last.counts.end, added: months.reduce((s, m) => s + m.counts.added, 0), removed: months.reduce((s, m) => s + m.counts.removed, 0) },
    billable: maxBillable, billableMonths: months.reduce((s, m) => s + m.billable, 0),
    discount, discountPct: first.discountPct, unitPriceYear: first.unitPriceYear, currency: first.currency,
    subtotal: sum((m) => m.subtotal), amount: sum((m) => m.amount),
    rows: months.map((m) => ({ month: m.month, period: m.period, counts: m.counts, billable: m.billable, discount: m.discount, subtotal: m.subtotal, amount: m.amount, added: m.added, removed: m.removed, snapshots: m.snapshots, reconstructed: m.reconstructed })),
    added: [].concat(...months.map((m) => m.added)), removed: [].concat(...months.map((m) => m.removed)),
    snapshots: { start: first.snapshots.start, end: last.snapshots.end },
    reconstructed: { start: months.some((m) => m.reconstructed.start), end: months.some((m) => m.reconstructed.end) },
    synced: first.synced,
  };
}
// A month or a period, by key.
async function computeKey(domain, k, opts) {
  const p = parseKey(k);
  if (!p) throw Object.assign(new Error("month must be YYYY-MM, a period YYYY-MM_YYYY-MM"), { status: 400 });
  return p.period ? computePeriod(domain, p.from, p.to, opts) : compute(domain, p.month, opts);
}

async function readIndex() { return store.read(INDEX, EMPTY_INDEX()); }
// The figures to carry over from a school's previous statement (index summary or full doc).
function prevOpts(prev) { return prev ? { discount: prev.discount, discountPct: prev.discountPct, unitPriceYear: prev.unitPriceYear } : {}; }
async function readStatement(domain, month) { return store.read(blobOf(domain, month), null); }
// The saved period statements (index summaries), newest first; `domain` narrows.
async function listPeriods(domain) {
  const ix = await readIndex();
  return Object.values(ix.items || {}).filter((s) => s && s.from && s.to && (!domain || s.domain === domain)).sort((a, b) => String(b.from).localeCompare(a.from) || String(b.to).localeCompare(a.to) || String(a.domain).localeCompare(b.domain));
}

// Save a computed statement as a draft (a draft is replaced; sent / paid are kept).
// `month` is a month or a period key.
async function generate(domain, month, opts, by) {
  const existing = await readStatement(domain, month);
  if (existing && existing.status !== "draft") throw Object.assign(new Error(`statement ${existing.id} is ${existing.status}; set it back to draft first`), { code: "not_draft", status: 409 });
  const c = await computeKey(domain, month, opts);
  const at = new Date().toISOString();
  let id = existing && existing.id;
  const summary = (st) => Object.assign({ id: st.id, domain, month, status: st.status, amount: st.amount, currency: st.currency, billable: st.billable, discount: st.discount, discountPct: st.discountPct, unitPriceYear: st.unitPriceYear, generatedAt: st.generatedAt, updatedAt: st.updatedAt }, st.from ? { from: st.from, to: st.to, months: st.months } : {});
  const stm = Object.assign(c, {
    id: id || null, status: "draft", generatedAt: at, updatedAt: at, by, note: String((opts && opts.note) || "").slice(0, 500),
    school: (opts && opts.school) || null,
    history: ((existing && existing.history) || []).concat([{ at, by, action: existing ? "regenerated" : "generated", discount: c.discount, discountPct: c.discountPct, unitPriceYear: c.unitPriceYear, amount: c.amount }]),
  });
  await store.update(INDEX, EMPTY_INDEX, (ix) => {
    if (!ix.items || typeof ix.items !== "object") ix.items = {};
    if (!id) { id = pad(ix.next || 1); ix.next = (ix.next || 1) + 1; stm.id = id; }
    ix.items[key(domain, month)] = summary(stm);
  });
  await store.write(blobOf(domain, month), stm);
  return stm;
}

async function setStatus(domain, month, status, by, note) {
  if (!STATUSES.includes(status)) throw Object.assign(new Error("status must be draft, sent or paid"), { status: 400 });
  const stm = await readStatement(domain, month);
  if (!stm) throw Object.assign(new Error("no statement for that month: generate it first"), { code: "not_found", status: 404 });
  const at = new Date().toISOString();
  const from = stm.status;
  stm.status = status; stm.updatedAt = at;
  if (status === "sent") stm.sentAt = at; else if (status === "paid") stm.paidAt = at; else { delete stm.sentAt; delete stm.paidAt; }
  stm.history = (stm.history || []).concat([{ at, by, action: "status", from, to: status, note: String(note || "").slice(0, 300) }]);
  await store.write(blobOf(domain, month), stm);
  await store.update(INDEX, EMPTY_INDEX, (ix) => { const it = (ix.items || {})[key(domain, month)]; if (it) { it.status = status; it.updatedAt = at; } });
  return stm;
}

// The listing of one month: every verified domain with its saved statement or a live
// preview, and the school's name. Price, free accounts and the percentage default to the
// previous month's statement (prevOpts), then to the relationship's terms.
async function listMonth(month, domains, names) {
  const [ix, rels] = await Promise.all([readIndex(), P.readRels()]);
  const rows = [];
  for (const d of domains) {
    const saved = (ix.items || {})[key(d, month)] || null;
    const prev = (ix.items || {})[key(d, prevMonth(month))] || null;
    let preview = null;
    if (!saved) {
      try { preview = await compute(d, month, Object.assign({ rels }, prevOpts(prev))); } catch (err) { preview = { error: err.message }; }
    }
    const rel = itRelationshipOf(rels, d);
    const nm = names[d] || {};
    rows.push(Object.assign({ domain: d, name: nm.name || "", nameEn: nm.nameEn || "", relationship: rel ? rel.id : null, stage: rel ? rel.stage : null, saved: !!saved }, saved || (preview && !preview.error ? { status: null, amount: preview.amount, currency: preview.currency, billable: preview.billable, discount: preview.discount, discountPct: preview.discountPct, unitPriceYear: preview.unitPriceYear, counts: preview.counts, reconstructed: preview.reconstructed } : { status: null, error: preview && preview.error })));
  }
  rows.sort((a, b) => (a.relationship ? 0 : 1) - (b.relationship ? 0 : 1) || (a.name || a.domain).localeCompare(b.name || b.domain, "zh"));
  return { month, period: { start: `${month}-01`, end: `${nextMonth(month)}-01` }, rows, totals: { amount: Math.round(rows.filter((r) => r.relationship && r.amount != null).reduce((s, r) => s + r.amount, 0) * 100) / 100, billable: rows.filter((r) => r.relationship).reduce((s, r) => s + (r.billable || 0), 0) } };
}

module.exports = { compute, computePeriod, computeKey, generate, setStatus, readStatement, readIndex, listPeriods, prevOpts, listMonth, monthOk, keyOk, parseKey, periodKey, monthsBetween, nextMonth, prevMonth, defaultMonth, itRelationshipOf, STATUSES, DEFAULT_PRICE, DEFAULT_CURRENCY, MAX_PERIOD_MONTHS, INDEX };
