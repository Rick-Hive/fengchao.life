// /api/order/status — the selection fee's public side (order flow v3 第二批, 2026-10-22). Anonymous, no-store.
//
//   GET                         { fee: { amount, currency, label } | null, test }  — is a fee charged? (the order page's line)
//   GET  ?submission=FS-…&email=  { submission, status: held|finalizing|paid|abandoned, orderIds, fee, holdUntil }
//                               (orderIds and fee only with the submission's own email)
//                               the done page polls this after Stripe sends the family back. A held submission whose
//                               Stripe session is already paid is finalized here (a late webhook does not keep a
//                               family waiting).
//   POST { submission, email, action: "release" }   the family came back from Stripe without paying: the session is
//                               expired and the seats released at once (the email must match the submission's).
const fee = require("../shared/fee");
const stripe = require("../shared/stripe");
const submissions = require("../shared/submissions");

const reply = (context, status, body) => { context.res = { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body }; };

// Without the family's email the answer is the status only: the order numbers and the Stripe receipt are the family's
// (security review 2026-10-22 — a submission id alone, guessed or seen in a log, reveals nothing more).
function view(sub, email) {
  if (String(email || "").trim().toLowerCase() !== String(sub.email || "").toLowerCase()) return { submission: sub.submission, status: sub.status, holdUntil: sub.holdUntil, orderIds: [], fee: null, itemCount: (sub.items || []).length, limited: true };
  return { submission: sub.submission, status: sub.status, orderIds: sub.orderIds || [], holdUntil: sub.holdUntil, fee: sub.fee ? { amount: sub.fee.amount, currency: sub.fee.currency, status: sub.fee.status, receiptUrl: sub.fee.receiptUrl || null, coupon: sub.fee.coupon || null } : null, itemCount: (sub.items || []).length };
}

module.exports = async function (context, req) {
  const method = String(req.method || "GET").toUpperCase(), q = req.query || {}, body = req.body && typeof req.body === "object" ? req.body : {};
  try {
    const id = String(q.submission || body.submission || "").trim().toUpperCase();
    if (method === "GET" && !id) { const f = fee.activeFee(); return reply(context, 200, { fee: f ? { amount: f.amount, currency: f.currency, label: f.label } : null, test: f ? stripe.testMode() : false }); }
    if (!submissions.ID_RE.test(id)) return reply(context, 400, { error: "bad_submission" });
    let sub = await submissions.read(id);
    if (!sub) return reply(context, 404, { error: "not_found" });

    if (method === "POST") {
      if (body.action !== "release") return reply(context, 400, { error: "bad_action" });
      if (String(body.email || "").trim().toLowerCase() !== String(sub.email || "").toLowerCase()) return reply(context, 403, { error: "not_yours" });
      if (sub.status !== "held") return reply(context, 200, view(sub, body.email));
      // Stripe first: a session that was paid meanwhile is finalized, not released
      if (sub.stripe && sub.stripe.sessionId && stripe.configured()) {
        const s = await stripe.getSession(sub.stripe.sessionId).catch(() => null);
        if (s && s.status === "complete") { const r = await require("../order").finalizeSubmission(context, id, s); sub = (await submissions.read(id)) || sub; return reply(context, 200, Object.assign(view(sub, body.email), { finalized: r.ok })); }
        if (s && s.status === "open") await stripe.expireSession(sub.stripe.sessionId).catch((e) => context.log.warn(`release ${id}: ${e.message}`));
      }
      sub = await submissions.update(id, (d) => { if (d.status !== "held") return false; d.status = "abandoned"; submissions.pushHistory(d, { by: d.email, action: "released" }); });
      await submissions.close(id).catch(() => {});
      require("../shared/seats").forget();
      return reply(context, 200, view(sub, body.email));
    }

    // GET: the done page's poll; a late webhook is caught up here
    if (sub.status === "held" && sub.stripe && sub.stripe.sessionId && stripe.configured() && Date.now() - Date.parse(sub.createdAt) > 3000) {
      const s = await stripe.getSession(sub.stripe.sessionId).catch(() => null);
      if (s && s.status === "complete" && (s.payment_status === "paid" || s.payment_status === "no_payment_required")) {
        await require("../order").finalizeSubmission(context, id, s).catch((e) => context.log.error(`status ${id}: finalize: ${e.message}`));
        sub = (await submissions.read(id)) || sub;
      }
    }
    return reply(context, 200, view(sub, q.email));
  } catch (err) {
    context.log.error("order/status:", err && err.message);
    return reply(context, 500, { error: "status_failed" });
  }
};
