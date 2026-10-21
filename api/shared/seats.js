// Seats per course, from Hive's own orders (enrollment rules design, Rick 2026-10-20, approved 「做吧」).
//
// Airtable carries only the course's limits (minSize / maxSize, synced into the snapshot); how many are enrolled is
// never written there — it is counted here from crm/orders every time, so it can never be older than the orders.
//
//   taken    = order items for the course in orders still alive (submitted / confirmed / paid / started) that are
//              NOT on the waitlist. A just-submitted order holds its seat at once (two families cannot both win the
//              last seat); the order manager's overdue rules clear a stale submission.
//   waitlist = items flagged waitlist in those same orders.
//   open     = maxSize − taken (maxSize blank = no limit → null).
//   state    = full | few (≤ 3 left) | open, plus belowMin (taken < minSize) alongside.
//
// Public GET /api/seats serves this with a 60 s in-process cache; api/order recounts without the cache before it
// accepts an order, and refuses a full course unless the family asked for the waitlist (course_full).
const crm = require("./crm");

const ALIVE = new Set(["submitted", "confirmed", "contacted", "parent_paid", "paid", "started"]);
// an order whose time ran out (crm.isExpired) holds no seat — evaluated here, since nothing else runs on a timer
let crmMod = null; const crmLazy = () => crmMod || (crmMod = require("./crm"));
const FEW = 3;

// orders → { CODE: { taken, waitlist } }
function countOrders(orders, now) {
  const by = {};
  for (const o of orders || []) {
    if (!o || !ALIVE.has(o.status) || crmLazy().isExpired(o, now)) continue;
    for (const it of o.items || []) {
      const code = it && it.code; if (!code) continue;
      const s = by[code] || (by[code] = { taken: 0, waitlist: 0 });
      if (it.waitlist) s.waitlist += 1; else s.taken += 1;
    }
  }
  return by;
}

// counts + the snapshot's courses → { CODE: { taken, waitlist, min, max, open, state, belowMin } } for every course
// that has a limit or an enrollment (a course with neither is left out: nothing to say).
function seatsFor(counts, courses) {
  const out = {};
  for (const c of courses || []) {
    if (!c || !c.code) continue;
    const n = counts[c.code] || { taken: 0, waitlist: 0 };
    const min = typeof c.minSize === "number" && c.minSize > 0 ? c.minSize : null;
    const max = typeof c.maxSize === "number" && c.maxSize > 0 ? c.maxSize : null;
    if (min == null && max == null && !n.taken && !n.waitlist) continue;
    const open = max == null ? null : Math.max(0, max - n.taken);
    const state = max != null && n.taken >= max ? "full" : open != null && open <= FEW ? "few" : "open";
    out[c.code] = { taken: n.taken, waitlist: n.waitlist, min, max, open, state, belowMin: min != null && n.taken < min, need: min != null && n.taken < min ? min - n.taken : 0 };
  }
  return out;
}

let cache = { at: 0, data: null };
const CACHE_MS = 60 * 1000;

// The public view: cached a minute. `courses` is the snapshot's course list.
async function publicSeats(courses, force) {
  const now = Date.now();
  if (!force && cache.data && now - cache.at < CACHE_MS) return cache.data;
  const counts = countOrders(await crm.listOrders());
  cache = { at: now, data: seatsFor(counts, courses) };
  return cache.data;
}
function forget() { cache = { at: 0, data: null }; }

module.exports = { ALIVE, FEW, countOrders, seatsFor, publicSeats, forget };
