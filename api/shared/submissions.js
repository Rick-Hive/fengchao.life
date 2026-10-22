// 提交记录 / Submissions (order flow v3 第二批 — Stripe, Rick 2026-10-22).
//
// With the selection fee on, a family's submit does not create orders: it creates a HELD submission — the cart as the
// server priced and checked it — and sends the family to Stripe Checkout. Only when Stripe says the fee is paid (the
// webhook, or the nightly reconcile if the webhook was lost) are the orders built, numbered, stored and announced:
// no order id is spent on a family that never paid. While held, the submission's courses count as reserved seats, so
// a family paying for the last seat cannot lose it to someone else mid-payment.
//
//   crm/submissions/<FS-…>.json   { submission, status, createdAt, holdUntil, email, account, lang, contact,
//                                   teamsAccount, track, items[], fee, stripe: { sessionId, url, expiresAt },
//                                   built?: { orders, wire }, notifyClaimed?, orderIds[], finalizedAt, history[] }
//   crm/submissions/_open.json     { items: { <FS>: { holdUntil, codes: [{ code, waitlist }] } } }  — the held ones only
//
// status: held → finalizing → paid | abandoned (the session expired or was never paid); fee.status refunded is
// recorded on the submission (and its orders) when Stripe reports a refund of the fee — the course fee is never Hive's.
const store = require("./jsonstore");

const PREFIX = "crm/submissions/";
const OPEN = PREFIX + "_open.json";
const ID_RE = /^FS-\d{8}-[A-Z0-9]{5}$/;
const blobOf = (id) => `${PREFIX}${id}.json`;
const now = () => new Date().toISOString();

function holdMinutes() { const n = Number(process.env.ORDER_HOLD_MINUTES || 30); return n >= 30 && n <= 600 ? n : 30; }

async function read(id) { if (!ID_RE.test(String(id || ""))) return null; const d = await store.read(blobOf(id), () => null); return d && d.submission ? d : null; }

async function create(doc) {
  await store.write(blobOf(doc.submission), doc);
  await store.update(OPEN, () => ({ items: {} }), (x) => { x.items[doc.submission] = { holdUntil: doc.holdUntil, codes: (doc.items || []).map((it) => ({ code: it.code, waitlist: !!it.waitlist })) }; });
  return doc;
}

// mutate(doc) under the blob's ETag; returns the saved doc (or the unchanged one when mutate returns false)
async function update(id, mutate) {
  const r = await store.update(blobOf(id), () => null, (d) => (d && d.submission ? mutate(d) : false));
  return r.doc && r.doc.submission ? r.doc : null;
}
async function close(id) { await store.update(OPEN, () => ({ items: {} }), (x) => { if (!x.items[id]) return false; delete x.items[id]; }); }
async function openList() { return (await store.read(OPEN, () => ({ items: {} }))).items || {}; }

// The held submissions still within their hold, shaped like orders for seats.countOrders (reserved seats)
async function heldAsOrders(nowMs) {
  const t = nowMs || Date.now(), out = [];
  for (const [id, x] of Object.entries(await openList().catch(() => ({})))) {
    if (!x || !(Date.parse(x.holdUntil) > t)) continue;
    out.push({ orderId: id, status: "submitted", submittedAt: new Date(t).toISOString(), items: (x.codes || []).map((c) => ({ code: c.code, waitlist: !!c.waitlist })) });
  }
  return out;
}

function pushHistory(d, h) { d.history = (d.history || []).concat([Object.assign({ at: now() }, h)]).slice(-50); }

module.exports = { PREFIX, OPEN, ID_RE, blobOf, holdMinutes, read, create, update, close, openList, heldAsOrders, pushHistory };
