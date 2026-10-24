// The nightly order sweep (v3, 2026-10-21): what a timer would do if the Static Web Apps functions had one. The
// GitHub Actions workflow (directory-sync.yml, 01:00 Beijing) calls POST /api/crm-sweep, which runs this once a day:
//
//   1. expire   — unpaid orders (submitted / contacted) past their deadline → expired; family email + provider Teams
//   2. remind   — unpaid orders due within REMIND_DAYS → one reminder per deadline (expiryReminded = that deadline)
//   3. nudge    — parent_paid for NUDGE_DAYS without the provider's 已收款 → provider Teams, once (parentPaidNudged)
//   4. seat     — courses with open seats and a waitlist → the earliest waitlisted items are seated (递补, automatic),
//                 the order's clock restarts, family + provider told
//   5. child    — paid / started for CHILD_DAYS with a seated line still without its student → family email, once
//
// Reads evaluate expiry lazily too (crm.withExpiry), so a same-day read is right; the sweep is what writes it down
// and sends the mail. Every step is best-effort per order: one failure is logged and the next order is tried.
const crm = require("./crm");
const seats = require("./seats");
const notify = require("./notify");
const { readSnapshot } = require("./blob");

const REMIND_DAYS = 3, NUDGE_DAYS = 7, CHILD_DAYS = 7, DAY = 24 * 60 * 60 * 1000;

async function rewrite(orderId, change) {
  const cur = await crm.readOrder(orderId);
  if (!cur) return null;
  const next = change(cur.order);
  if (!next || next === cur.order) return null;
  await crm.writeOrder(next, cur.etag);
  return next;
}

async function run(opts) {
  opts = opts || {};
  const now = opts.now ? +opts.now : Date.now(), dry = !!opts.dryRun, log = opts.log || (() => {});
  const snap = await readSnapshot().catch(() => null);
  const all = await crm.listOrders();
  const out = { at: new Date(now).toISOString(), dryRun: dry, expired: [], reminded: [], nudged: [], seated: [], childReminded: [], errors: [] };
  const fail = (step, o, err) => { out.errors.push({ step, orderId: o.orderId, error: String((err && err.message) || err).slice(0, 200) }); log(`sweep ${step} ${o.orderId}: ${(err && err.message) || err}`); };
  const nopts = { snapshot: snap, log, record: !dry };

  // 1. expire
  for (const o of all) {
    if (!crm.isExpired(o, now)) continue;
    try {
      const next = dry ? crm.withExpiry(o, now) : await rewrite(o.orderId, (cur) => crm.withExpiry(cur, now));
      if (!next) continue;
      Object.assign(o, next);
      out.expired.push(o.orderId);
      if (!dry) await notify.notify(next, "expired", nopts);
    } catch (err) { fail("expire", o, err); }
  }
  // 2. remind
  for (const o of all) {
    const st = crm.statusOf(o);
    if (!["submitted", "contacted"].includes(st) || crm.isExpired(o, now)) continue;
    const at = crm.expiresAt(o);
    if (!Number.isFinite(at)) continue;
    const left = at - now;
    if (left <= 0 || left > REMIND_DAYS * DAY) continue;
    const deadline = new Date(at).toISOString();
    if (o.expiryReminded === deadline) continue;
    try {
      const days = Math.max(1, Math.ceil(left / DAY));
      if (!dry) {
        const next = await rewrite(o.orderId, (cur) => (cur.expiryReminded === deadline ? null : Object.assign({}, cur, { expiryReminded: deadline })));
        if (!next) continue;
        await notify.notify(next, "reminder_expiry", Object.assign({ days }, nopts));
      }
      out.reminded.push({ orderId: o.orderId, days });
    } catch (err) { fail("remind", o, err); }
  }
  // 3. nudge the provider: the family said it paid, nobody confirmed
  for (const o of all) {
    if (crm.statusOf(o) !== "parent_paid" || o.parentPaidNudged) continue;
    const since = Date.parse(crm.lastChange(o) || "");
    if (!Number.isFinite(since) || now - since < NUDGE_DAYS * DAY) continue;
    try {
      if (!dry) {
        const next = await rewrite(o.orderId, (cur) => (cur.parentPaidNudged ? null : Object.assign({}, cur, { parentPaidNudged: new Date(now).toISOString() })));
        if (!next) continue;
        await notify.notify(next, "parent_paid_nudge", nopts);
      }
      out.nudged.push(o.orderId);
    } catch (err) { fail("nudge", o, err); }
  }
  // 4. seat the waitlist where seats opened (after the expiries above)
  const courses = (snap && snap.courses) || [];
  const live = seats.seatsFor(seats.countOrders(all, now), courses);
  const waiting = [];
  for (const o of all) {
    if (!crm.isLive(o)) continue;
    for (const it of o.items || []) if (it && it.waitlist && live[it.code] && live[it.code].open > 0) waiting.push({ o, code: it.code });
  }
  waiting.sort((a, b) => String(a.o.submittedAt || "").localeCompare(String(b.o.submittedAt || "")));
  for (const w of waiting) {
    const s = live[w.code];
    if (!s || s.open <= 0) continue;
    try {
      const at = new Date(now).toISOString();
      const change = (cur) => {
        if (!(cur.items || []).some((it) => it.code === w.code && it.waitlist)) return null;
        const items = cur.items.map((it) => (it.code === w.code ? Object.assign({}, it, { waitlist: false }) : it));
        const next = Object.assign({}, cur, { items, history: (cur.history || []).concat([{ at, by: "system", from: cur.status, to: cur.status, note: "递补（自动）/ seated automatically: " + w.code }]) });
        delete next.expiresAt; delete next.expiryReminded; // the family's clock starts again from the seat
        return next;
      };
      const next = dry ? change(w.o) : await rewrite(w.o.orderId, change);
      if (!next) continue;
      s.open -= 1; s.taken += 1; s.waitlist -= 1;
      out.seated.push({ orderId: w.o.orderId, code: w.code });
      if (!dry) await notify.notify(next, "seated", Object.assign({ note: "" }, nopts));
    } catch (err) { fail("seat", w.o, err); }
  }
  // 5. the student still not named a week after the fee was paid (v3: the child is named after checkout)
  for (const o of all) {
    if (!needsChild(o) || o.childReminded) continue;
    const since = Date.parse(crm.lastChange(o) || "");
    if (!Number.isFinite(since) || now - since < CHILD_DAYS * DAY) continue;
    try {
      if (!dry) {
        const next = await rewrite(o.orderId, (cur) => (cur.childReminded ? null : Object.assign({}, cur, { childReminded: new Date(now).toISOString() })));
        if (!next) continue;
        await notify.notify(next, "name_child", nopts);
      }
      out.childReminded.push(o.orderId);
    } catch (err) { fail("child", o, err); }
  }
  // 6. the selection fee (v3 第二批, 2026-10-22): submissions whose hold ran out — or whose finalizing stopped half way — are
  //    checked against Stripe: paid → the orders are made now (a lost webhook); otherwise abandoned and the seats freed.
  out.payments = [];
  {
    const submissions = require("./submissions"), stripe = require("./stripe");
    const open = await submissions.openList().catch(() => ({}));
    for (const [id, x] of Object.entries(open)) {
      if (x && Date.parse(x.holdUntil) > now) continue;
      try {
        const sub = await submissions.read(id);
        if (!sub || !["held", "finalizing"].includes(sub.status)) { if (!dry) await submissions.close(id); continue; }
        const session = sub.stripe && sub.stripe.sessionId && stripe.configured() ? await stripe.getSession(sub.stripe.sessionId).catch(() => null) : null;
        const paid = session && session.status === "complete" && (session.payment_status === "paid" || session.payment_status === "no_payment_required");
        if (paid) { if (!dry) { const r = await require("../order").finalizeSubmission({ log: Object.assign((m) => log(m), { warn: log, error: log }) }, id, session); if (!r.ok) throw new Error(r.code); } out.payments.push({ submission: id, action: "finalized" }); continue; }
        if (!dry) {
          if (session && session.status === "open") await stripe.expireSession(session.id).catch(() => {});
          await submissions.update(id, (d) => { if (!["held", "finalizing"].includes(d.status) || d.built) return false; d.status = "abandoned"; submissions.pushHistory(d, { by: "sweep", action: "abandoned" }); });
          await submissions.close(id);
        }
        out.payments.push({ submission: id, action: "abandoned" });
      } catch (err) { fail("payment", { orderId: id }, err); }
    }
  }
  // 7. files nobody kept: an applicant's syllabus upload never put on a course, an upload never finished (files.cleanup)
  out.filesSwept = 0;
  if (!dry) { try { out.filesSwept = await require("./files").cleanup(now); } catch (err) { fail("files", {}, err); } }
  if (!dry && (out.expired.length || out.seated.length || out.payments.length)) seats.forget();
  out.total = out.expired.length + out.reminded.length + out.nudged.length + out.seated.length + out.childReminded.length + out.payments.length;
  return out;
}

// A paid or started order with a seated, uncancelled line whose child is not named.
function needsChild(o) {
  return ["paid", "started"].includes(crm.statusOf(o)) && (o.items || []).some((it) => it && !it.cancelled && !it.waitlist && !(it.child && it.child.name));
}

module.exports = { run, needsChild, REMIND_DAYS, NUDGE_DAYS, CHILD_DAYS };
