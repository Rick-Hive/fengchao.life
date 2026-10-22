// Seats per course, from Hive's own orders (enrollment rules design, Rick 2026-10-20, approved 「做吧」).
//
// Airtable carries only the course's limits (minSize / maxSize, synced into the snapshot); how many are enrolled is
// never written there — it is counted here from crm/orders every time, so it can never be older than the orders.
//
//   confirmed = order items for the course in orders the provider has been paid for (paid / started), not waitlisted,
//               not cancelled — the seats that are certain (v3: two tiers, Rick 2026-10-21)
//   reserved  = the same in orders still unpaid (submitted / contacted / parent_paid): held so two families cannot
//               both win the last seat; they lapse with the order's 14-day clock
//   taken     = confirmed + reserved — what "full" is judged on, so a course is never oversold
//   waitlist  = items flagged waitlist in those same orders
//   open      = maxSize − taken (maxSize blank = no limit → null)
//   state     = full | few (≤ 3 left) | open; belowMin / need count CONFIRMED seats against minSize (an unpaid order
//               is not a reason to run a class)
//
// Public GET /api/seats serves this with a 60 s in-process cache; api/order recounts without the cache before it
// accepts an order, and refuses a full course unless the family asked for the waitlist (course_full).
const crm = require("./crm");

const ALIVE = new Set(["submitted", "confirmed", "contacted", "parent_paid", "paid", "started"]);
const CONFIRMED = new Set(["paid", "started"]);
// an order whose time ran out (crm.isExpired) holds no seat — evaluated here, since nothing else runs on a timer
let crmMod = null; const crmLazy = () => crmMod || (crmMod = require("./crm"));
const FEW = 3;

// orders → { CODE: { taken, waitlist } }
function countOrders(orders, now) {
  const by = {};
  for (const o of orders || []) {
    if (!o || !ALIVE.has(o.status) || crmLazy().isExpired(o, now)) continue;
    const sure = CONFIRMED.has(o.status);
    for (const it of o.items || []) {
      const code = it && it.code; if (!code || it.cancelled) continue;
      const s = by[code] || (by[code] = { taken: 0, confirmed: 0, reserved: 0, waitlist: 0 });
      const n = it.seats > 1 ? it.seats : 1; // a group line holds several seats (v3 batch D)
      if (it.waitlist) s.waitlist += n; else { s.taken += n; if (sure) s.confirmed += n; else s.reserved += n; }
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
    const n = counts[c.code] || { taken: 0, confirmed: 0, reserved: 0, waitlist: 0 };
    const min = typeof c.minSize === "number" && c.minSize > 0 ? c.minSize : null;
    const max = typeof c.maxSize === "number" && c.maxSize > 0 ? c.maxSize : null;
    if (min == null && max == null && !n.taken && !n.waitlist) continue;
    const open = max == null ? null : Math.max(0, max - n.taken);
    const state = max != null && n.taken >= max ? "full" : open != null && open <= FEW ? "few" : "open";
    const sure = n.confirmed || 0;
    out[c.code] = { taken: n.taken, confirmed: sure, reserved: n.reserved || 0, waitlist: n.waitlist, min, max, open, state, belowMin: min != null && sure < min, need: min != null && sure < min ? min - sure : 0 };
  }
  return out;
}

let cache = { at: 0, data: null };
const CACHE_MS = 60 * 1000;

// The public view: cached a minute. `courses` is the snapshot's course list.
async function publicSeats(courses, force) {
  const now = Date.now();
  if (!force && cache.data && now - cache.at < CACHE_MS) return cache.data;
  // the submissions being paid for (selection fee) hold their seats while Stripe's page is open
  const held = await require("./submissions").heldAsOrders().catch(() => []);
  const counts = countOrders((await crm.listOrders()).concat(held));
  cache = { at: now, data: seatsFor(counts, courses) };
  return cache.data;
}
function forget() { cache = { at: 0, data: null }; }

module.exports = { ALIVE, CONFIRMED, FEW, countOrders, seatsFor, publicSeats, forget };
