// The CRM module's two foundations: who may see which kind of data, and the
// Hive order store (crm/orders/<orderId>.json in the site-data container).
//
// Design: "Hive CRM 设计" (Claude Docs, Rick 2026-10-06), sections 4 and 6.
//
// PERMISSIONS — two axes. The data DOMAIN says what kind of data; the LEVEL
// says how much of it a function sees:
//   none    — not visible
//   masked  — read, but contact details and amounts hidden (sees that a value
//             exists, not what it is)
//   read    — read everything
//   rw      — read and write
// A person holding several functions gets the union (the highest level each
// domain reaches). Domain administrators (schools, hives) hold no CRM level
// at all: a school's admin must not learn which parent is a paying customer
// (decision 5). Masking is applied SERVER-SIDE (mask() below): what the
// browser never receives it cannot show.
//
// ORDERS — the website's course orders are stored here at checkout
// (api/order), one JSON file per order, and never go into Airtable (that is
// CEFF's textbook ledger). Status is maintained by the order manager:
//   submitted → confirmed → paid → started, or cancelled from any live state.
// Every change appends to `history` (who, when, from, to, note) — the
// fulfilment record of decision 18 — and overdue() says which orders have
// stalled so the dashboard's pending-and-exceptions panel can list them.
const { BlobServiceClient } = require("@azure/storage-blob");
const { snapshotBlob } = require("./config");
const { staffFunctions, isAdmin } = require("./roles");

// ---------------------------------------------------------------------------
// Permission matrix (design §4, with decisions 5 and 6 applied).
// ---------------------------------------------------------------------------
const DOMAINS = ["identity", "accounts", "orders", "drm", "money", "catalogue", "leads", "partners", "system"];
const LEVELS = ["none", "masked", "read", "rw"];
const DOMAIN_LABELS = {
  identity:  { zh: "人员身份与联系方式", en: "Person identity and contact details" },
  accounts:  { zh: "租户账号", en: "Tenant accounts" },
  orders:    { zh: "订单与订单行", en: "Orders and line items" },
  drm:       { zh: "DRM 许可与分销", en: "DRM licences and distribution" },
  money:     { zh: "收付款与版税", en: "Receipts, payments and royalties" },
  catalogue: { zh: "课程目录", en: "Catalogue" },
  leads:     { zh: "线索与活动", en: "Leads and activities" },
  partners:  { zh: "合作伙伴与机构", en: "Partners and organizations" },
  system:    { zh: "系统", en: "System" },
};
//                 identity   accounts  orders    drm       money     catalogue leads     partners  system
const MATRIX = {
  ceo:         { identity: "read",   accounts: "read", orders: "read",   drm: "read", money: "read", catalogue: "read", leads: "read", partners: "read", system: "read" },
  curriculum:  { identity: "masked", accounts: "read", orders: "masked", drm: "read", money: "none", catalogue: "rw",   leads: "read", partners: "read", system: "none" },
  community:   { identity: "rw",     accounts: "read", orders: "masked", drm: "none", money: "none", catalogue: "read", leads: "rw",   partners: "read", system: "none" },
  finance:     { identity: "masked", accounts: "none", orders: "read",   drm: "read", money: "rw",   catalogue: "read", leads: "none", partners: "read", system: "none" },
  sales:       { identity: "rw",     accounts: "read", orders: "rw",     drm: "rw",   money: "read", catalogue: "read", leads: "read", partners: "read", system: "none" },
  partnership: { identity: "masked", accounts: "none", orders: "masked", drm: "rw",   money: "none", catalogue: "read", leads: "read", partners: "rw",   system: "none" },
  // 教育顾问 (Rick 2026-10-06): advises families — sees who people are and what they
  // bought (no amounts), the catalogue and the leads; changes nothing. Adjust when the role's duties are set.
  consultant:  { identity: "read",   accounts: "read", orders: "masked", drm: "none", money: "none", catalogue: "read", leads: "read", partners: "read", system: "none" },
  sysadmin:    { identity: "rw",     accounts: "rw",   orders: "read",   drm: "rw",   money: "read", catalogue: "read", leads: "read", partners: "read", system: "rw" },
};

function rank(level) { const i = LEVELS.indexOf(level); return i < 0 ? 0 : i; }

// The level `roles` reach on `domain`: the highest over every function held.
function access(roles, domain) {
  let best = "none";
  for (const fn of staffFunctions(roles)) {
    const row = MATRIX[fn];
    const lvl = (row && row[domain]) || "none";
    if (rank(lvl) > rank(best)) best = lvl;
  }
  if (isAdmin(roles) && rank(MATRIX.sysadmin[domain] || "none") > rank(best)) best = MATRIX.sysadmin[domain];
  return best;
}
function atLeast(roles, domain, level) { return rank(access(roles, domain)) >= rank(level); }
// Every domain's level for one account — what the management centre uses to decide which pages to show.
function accessMap(roles) {
  const out = {};
  for (const d of DOMAINS) out[d] = access(roles, d);
  return out;
}

// ---------------------------------------------------------------------------
// Order store
// ---------------------------------------------------------------------------
const PREFIX = "crm/orders/";
// The status flow since stage 2 (design 2026-10-20, Rick 2026-10-21): the course fee is paid by the family to the
// provider directly, so the order records both sides' word for it — the family's 我已付款 (parent_paid), then the
// provider's 已收款 (paid). `confirmed` from the first flow is kept as an alias of `contacted` (机构沟通中).
//   submitted → contacted → parent_paid → paid → started; cancelled from any live state; expired when an unpaid order
//   (submitted / contacted) has not moved on for EXPIRE_DAYS (v3, Rick 2026-10-21: 14 days from the LAST step, so a
//   provider that answers on day 13 restarts the family's clock; extendable by the provider, +EXTEND_DAYS at a time).
const STATUSES = ["submitted", "contacted", "parent_paid", "paid", "started", "cancelled", "expired"];
const STATUS_ALIAS = { confirmed: "contacted" };
const statusOf = (o) => STATUS_ALIAS[o && o.status] || (o && o.status) || "";
const STATUS_LABELS = {
  submitted:   { zh: "已提交", en: "Submitted" },
  contacted:   { zh: "机构沟通中", en: "Provider in touch" },
  confirmed:   { zh: "机构沟通中", en: "Provider in touch" },
  parent_paid: { zh: "家长已付款", en: "Parent paid" },
  paid:        { zh: "已收款", en: "Payment received" },
  started:     { zh: "已开课", en: "Started" },
  cancelled:   { zh: "已取消", en: "Cancelled" },
  expired:     { zh: "已过期", en: "Expired" },
};
// Which status may follow which. `started`, `cancelled` and `expired` are terminal; the system administrator may
// reopen a cancelled or expired order (back to submitted) when it was closed by mistake.
const NEXT = {
  submitted: ["contacted", "parent_paid", "paid", "cancelled"],
  contacted: ["parent_paid", "paid", "cancelled"],
  parent_paid: ["paid", "cancelled"],
  paid: ["started", "cancelled"],
  started: [],
  cancelled: [],
  expired: [],
};
const LIVE = new Set(["submitted", "contacted", "parent_paid", "paid", "started"]);
const isLive = (o) => LIVE.has(statusOf(o));
function nextStatuses(status, roles) {
  const st = STATUS_ALIAS[status] || status;
  const out = (NEXT[st] || []).slice();
  if ((st === "cancelled" || st === "expired") && isAdmin(roles)) out.push("submitted");
  return out;
}
// What a provider (the hive's own 教育领袖) may do with its orders: everything but reopening; the family's
// 我已付款 is the family's, through me/orders.
const PROVIDER_NEXT = { submitted: ["contacted", "paid", "cancelled"], contacted: ["paid", "cancelled"], parent_paid: ["paid", "cancelled"], paid: ["started", "cancelled"], started: [], cancelled: [], expired: [] };
function providerNext(status) { return (PROVIDER_NEXT[STATUS_ALIAS[status] || status] || []).slice(); }

// ---- expiry ------------------------------------------------------------------------------------------------------
// An unpaid order (submitted / contacted) expires EXPIRE_DAYS after its last step (the last history entry: the
// submission, the provider's 已联系, a seating, an extension); every status change restarts the clock (transition()
// drops an explicit expiresAt). The provider may extend it (+EXTEND_DAYS on the current deadline, written as
// expiresAt). The nightly sweep (api/crm-sweep) writes expiries and sends the reminders; the readers still evaluate
// it lazily (withExpiry) so a same-day read is right too.
const EXPIRE_DAYS = 14, EXTEND_DAYS = 14;
function expiresAt(order) {
  if (order.expiresAt) return Date.parse(order.expiresAt);
  const t = Date.parse(lastChange(order) || "");
  return Number.isFinite(t) ? t + EXPIRE_DAYS * 24 * 60 * 60 * 1000 : NaN;
}
function isExpired(order, now) {
  const st = statusOf(order);
  if (st !== "submitted" && st !== "contacted") return false;
  const at = expiresAt(order);
  return Number.isFinite(at) && (now ? +now : Date.now()) > at;
}
// The order as it stands now: expired when its time ran out (a new object, history appended), else itself.
function withExpiry(order, now) {
  if (!isExpired(order, now)) return order;
  const at = new Date(expiresAt(order)).toISOString();
  return Object.assign({}, order, { status: "expired", history: (order.history || []).concat([{ at, by: "system", from: order.status, to: "expired", note: "" }]) });
}
function extend(order, by, now, days) {
  const base = Math.max(expiresAt(order) || 0, now ? +now : Date.now());
  const until = new Date(base + (days || EXTEND_DAYS) * 24 * 60 * 60 * 1000).toISOString();
  const at = (now ? new Date(now) : new Date()).toISOString();
  return Object.assign({}, order, { expiresAt: until, history: (order.history || []).concat([{ at, by, from: order.status, to: order.status, note: `延长 ${days || EXTEND_DAYS} 天 / extended ${days || EXTEND_DAYS} days → ${until.slice(0, 10)}` }]) });
}

// Overdue rules (decision 18): an order that has not moved on in time goes to
// the pending-and-exceptions panel and the owner is told. Days are counted
// from the last status change. The course data carries no start date (class
// times are free text), so "paid but not started" uses a fixed window.
const OVERDUE_DAYS = { submitted: 3, contacted: 14, confirmed: 14, parent_paid: 7, paid: 30 };
const DAY = 24 * 60 * 60 * 1000;

function lastChange(order) {
  const h = Array.isArray(order.history) ? order.history : [];
  const last = h.length ? h[h.length - 1] : null;
  return (last && last.at) || order.submittedAt || null;
}
// null when not overdue; otherwise { rule, days, limit } — the rule it broke,
// how many days it has sat in that status, and the limit for that status.
function overdue(order, now) {
  const limit = OVERDUE_DAYS[statusOf(order)];
  if (!limit) return null;
  const since = Date.parse(lastChange(order) || "");
  if (!Number.isFinite(since)) return null;
  const days = Math.floor(((now ? +now : Date.now()) - since) / DAY);
  return days > limit ? { rule: statusOf(order), days, limit } : null;
}

// The record api/order stores at checkout. Deliberately a subset of the wire
// payload: no rendered emails or notification bodies (they are reproducible
// from the snapshot), and the items keep only what a person needs to see
// which courses were bought from which hive, at what price.
function orderRecord(order, notify) {
  const items = (order.items || []).map((it) => ({
    code: it.code || "",
    nameZh: it.baseNameZh || it.nameZh || "",
    nameEn: it.baseNameEn || it.nameEn || "",
    classType: it.classType || "",
    language: it.language || "",
    grades: it.grades || [],
    teachers: it.teachers || [],
    price: typeof it.price === "number" ? it.price : 0,
    priceTbd: !!it.priceTbd,
    schoolName: it.schoolName || "",
    schoolAbbr: it.schoolAbbr || "",
    waitlist: !!it.waitlist, // on the waitlist until the order manager seats it (enrollment rules, 2026-10-20)
    // the child this course is for (stage 2, 2026-10-21): the roster and the transcript hang on it
    child: it.child && typeof it.child === "object" ? { name: String(it.child.name || "").slice(0, 40), grade: String(it.child.grade || "").slice(0, 20), account: String(it.child.account || "").toLowerCase().slice(0, 200) } : null,
    prereq: it.prereq && typeof it.prereq === "object" ? { text: String(it.prereq.text || ""), codes: Array.isArray(it.prereq.codes) ? it.prereq.codes.slice(0, 10) : [], met: String(it.prereq.met || "none") } : null,
  }));
  const hives = (order.routes || []).map((r) => ({
    key: r.hiveKey || "",
    name: r.schoolName || "",
    abbr: r.schoolAbbr || "",
    itemCount: r.itemCount || 0,
    subtotal: r.subtotal || 0,
    notified: !!r.teamsChannelId,
  }));
  return {
    orderId: order.orderId,
    source: "hive",
    submittedAt: order.submittedAt,
    email: order.email || "",
    teamsAccount: order.teamsAccount || "",
    // the signed-in account the order belongs to ("" when ordered anonymously on the website); design 2026-10-20
    account: String(order.account || "").toLowerCase(),
    // the submission this order came from (several orders share one when a submission is split per hive)
    submission: order.submission || order.orderId,
    // the selection fee: null when none was configured (api/shared/fee.js)
    fee: order.fee && typeof order.fee === "object" ? order.fee : null,
    lang: order.lang || "zh",
    track: order.track ? { trackId: order.track.trackId, nameZh: order.track.nameZh || "", nameEn: order.track.nameEn || "" } : null,
    items,
    hives,
    itemCount: order.itemCount || items.length,
    totalPrice: order.totalPrice || 0,
    currency: order.currency || "CNY",
    status: "submitted",
    history: [{ at: order.submittedAt, by: "system", from: null, to: "submitted", note: "" }],
    notify: notify || { ok: false, at: order.submittedAt },
    crmId: null,
    snapshotGeneratedAt: order.snapshotGeneratedAt || null,
  };
}

// Apply a status change. Throws on an illegal transition; the caller maps
// that to 400. `by` is the staff account; `note` free text (not required).
function transition(order, to, by, note, roles, now, allowedOverride) {
  const allowed = allowedOverride || nextStatuses(order.status, roles);
  if (!allowed.includes(to)) {
    const err = new Error(`cannot go from ${order.status} to ${to}`);
    err.code = "bad_transition";
    err.allowed = allowed;
    throw err;
  }
  const at = (now ? new Date(now) : new Date()).toISOString();
  const next = Object.assign({}, order, { status: to, history: (order.history || []).concat([{ at, by, from: order.status, to, note: String(note || "").slice(0, 500) }]) });
  // the clock restarts with the step: an extension granted in the old status does not carry over
  delete next.expiresAt; delete next.expiryReminded;
  return next;
}

// What a reader receives, by the levels they hold (accessMap()): contact
// details need `identity` at read or better, amounts need `money` at read or
// better, and a reader with `orders` only masked loses the notes too. A
// masked email keeps only its domain, so a masked reader can still tell a
// school's family from a stranger.
function mask(order, acc) {
  acc = acc || {};
  const seeWho = rank(acc.identity) >= rank("read");
  const seeMoney = rank(acc.money) >= rank("read");
  const seeAll = rank(acc.orders) >= rank("read");
  if (seeWho && seeMoney && seeAll) return order;
  const o = Object.assign({}, order);
  if (!seeWho) {
    o.email = o.email ? "…@" + String(o.email).split("@")[1].toLowerCase() : "";
    o.teamsAccount = o.teamsAccount ? "…@" + String(o.teamsAccount).split("@")[1].toLowerCase() : "";
  }
  if (!seeMoney) {
    o.totalPrice = null;
    o.items = (o.items || []).map((it) => Object.assign({}, it, { price: null }));
    o.hives = (o.hives || []).map((h) => Object.assign({}, h, { subtotal: null }));
  }
  if (!seeAll) o.history = (o.history || []).map((h) => Object.assign({}, h, { note: "" }));
  return o;
}

// ---- storage ---------------------------------------------------------------
function container() {
  const conn = process.env.STORAGE_CONNECTION_STRING;
  if (!conn) throw new Error("STORAGE_CONNECTION_STRING app setting is not configured");
  return BlobServiceClient.fromConnectionString(conn).getContainerClient(snapshotBlob.container);
}
const ID_RE = /^FC-[0-9]{8}(-[A-Z0-9一-鿿]{1,12})?-[A-Z0-9]{3,4}$/;
function blobName(orderId) {
  const id = String(orderId || "");
  if (!ID_RE.test(id)) throw Object.assign(new Error("bad order id"), { code: "bad_id" });
  return PREFIX + id + ".json";
}

async function readOrder(orderId) {
  const blob = container().getBlockBlobClient(blobName(orderId));
  if (!(await blob.exists())) return null;
  const props = await blob.getProperties();
  const buf = await blob.downloadToBuffer();
  const order = JSON.parse(buf.toString("utf8"));
  return { order, etag: props.etag };
}

// Write one order. With `etag` the write is conditional (If-Match), so two
// staff changing the same order at once cannot overwrite each other: the
// loser gets a 412 and the caller re-reads. Without it the write is a plain
// create (checkout), refused if the id already exists.
async function writeOrder(order, etag) {
  const c = container();
  await c.createIfNotExists();
  const blob = c.getBlockBlobClient(blobName(order.orderId));
  const body = JSON.stringify(order, null, 2);
  await blob.upload(body, Buffer.byteLength(body), {
    conditions: etag ? { ifMatch: etag } : { ifNoneMatch: "*" },
    blobHTTPHeaders: { blobContentType: "application/json; charset=utf-8" },
  });
}

// Every stored order. One blob per order keeps writes independent; listing
// a few thousand small blobs and reading them eight at a time is well within
// a request. When that stops being true, an index blob is the next step.
async function listOrders() {
  const c = container();
  const names = [];
  for await (const b of c.listBlobsFlat({ prefix: PREFIX })) if (b.name.endsWith(".json")) names.push(b.name);
  const out = [];
  let i = 0;
  async function worker() {
    while (i < names.length) {
      const name = names[i++];
      try {
        const buf = await c.getBlockBlobClient(name).downloadToBuffer();
        out.push(JSON.parse(buf.toString("utf8")));
      } catch { /* a half-written or foreign blob is skipped, not fatal */ }
    }
  }
  await Promise.all(Array.from({ length: Math.min(8, names.length) }, worker));
  out.sort((a, b) => String(b.submittedAt || "").localeCompare(String(a.submittedAt || "")));
  return out;
}

module.exports = {
  DOMAINS, LEVELS, DOMAIN_LABELS, MATRIX, access, atLeast, accessMap,
  STATUSES, STATUS_ALIAS, statusOf, STATUS_LABELS, NEXT, LIVE, isLive, providerNext, EXPIRE_DAYS, EXTEND_DAYS, expiresAt, isExpired, withExpiry, extend,
  OVERDUE_DAYS, nextStatuses, overdue, lastChange, orderRecord, transition, mask,
  PREFIX, ID_RE, blobName, readOrder, writeOrder, listOrders,
};
