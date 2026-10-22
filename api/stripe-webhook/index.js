// POST /api/stripe/webhook — Stripe tells Hive what happened to a selection-fee payment (order flow v3 第二批).
//
// Register in the Stripe Dashboard › Developers › Webhooks: endpoint https://www.fengchao.life/api/stripe/webhook,
// events checkout.session.completed, checkout.session.async_payment_succeeded, checkout.session.async_payment_failed,
// checkout.session.expired, charge.refunded; its signing secret goes into the app setting STRIPE_WEBHOOK_SECRET.
//
// Every event is verified (Stripe-Signature) and every action is idempotent — Stripe delivers some events twice and
// retries any that did not get a 2xx: the orders are built once (finalizeSubmission), an expired session only
// abandons a submission still held, a refund only marks the fee.
const stripe = require("../shared/stripe");
const submissions = require("../shared/submissions");
const crm = require("../shared/crm");

const reply = (context, status, body) => { context.res = { status, headers: { "Content-Type": "application/json" }, body }; };
const subOf = (obj) => String((obj && obj.metadata && obj.metadata.submission) || (obj && obj.client_reference_id) || "").toUpperCase();

// The fee was refunded (by Hive in the Stripe Dashboard: a double charge, a dispute): recorded on the submission and on
// its orders, so the books match Stripe. The orders themselves are not touched — the course fee is between the family
// and the provider.
async function markRefunded(context, id, charge) {
  const full = charge.amount_refunded >= charge.amount;
  const refund = { status: full ? "refunded" : "partially_refunded", amountRefunded: charge.amount_refunded, refundedAt: new Date().toISOString() };
  const sub = await submissions.update(id, (d) => { d.fee = Object.assign({}, d.fee, refund); submissions.pushHistory(d, { by: "stripe", action: "fee_refunded", note: `${charge.amount_refunded}/${charge.amount}` }); });
  for (const oid of (sub && sub.orderIds) || []) {
    try { const cur = await crm.readOrder(oid); if (cur) await crm.writeOrder(Object.assign({}, cur.order, { fee: Object.assign({}, cur.order.fee || {}, refund) }), cur.etag); }
    catch (e) { context.log.warn(`refund ${id}: order ${oid} not marked: ${e.message}`); }
  }
}

module.exports = async function (context, req) {
  let event;
  try {
    event = stripe.verifyWebhook(req.rawBody != null ? req.rawBody : JSON.stringify(req.body || {}), (req.headers || {})["stripe-signature"], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    context.log.warn(`stripe webhook refused: ${err.message}`);
    return reply(context, 400, { error: "bad_signature" });
  }
  const obj = (event.data && event.data.object) || {};
  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const id = subOf(obj);
        if (!submissions.ID_RE.test(id)) return reply(context, 200, { ignored: "no submission" });
        if (!(obj.payment_status === "paid" || obj.payment_status === "no_payment_required")) return reply(context, 200, { waiting: obj.payment_status }); // a delayed method: async_payment_succeeded follows
        const session = await stripe.getSession(obj.id).catch(() => obj); // with the receipt and the promotion code
        const r = await require("../order").finalizeSubmission(context, id, session);
        if (!r.ok && r.code !== "not_found") return reply(context, 500, { error: r.code }); // Stripe retries
        context.log(`stripe: ${id} paid → ${(r.orderIds || []).join(", ") || r.code}${r.already ? " (already)" : ""}`);
        return reply(context, 200, { ok: true, orderIds: r.orderIds || [] });
      }
      case "checkout.session.expired":
      case "checkout.session.async_payment_failed": {
        const id = subOf(obj);
        if (!submissions.ID_RE.test(id)) return reply(context, 200, { ignored: "no submission" });
        await submissions.update(id, (d) => { if (d.status !== "held") return false; d.status = "abandoned"; submissions.pushHistory(d, { by: "stripe", action: event.type === "checkout.session.expired" ? "expired" : "payment_failed" }); });
        await submissions.close(id).catch(() => {});
        require("../shared/seats").forget();
        return reply(context, 200, { ok: true });
      }
      case "charge.refunded": {
        let id = subOf(obj);
        if (!submissions.ID_RE.test(id) && obj.payment_intent) { const pi = await stripe.getPaymentIntent(typeof obj.payment_intent === "string" ? obj.payment_intent : obj.payment_intent.id).catch(() => null); id = subOf(pi); }
        if (!submissions.ID_RE.test(id)) return reply(context, 200, { ignored: "no submission" });
        await markRefunded(context, id, obj);
        return reply(context, 200, { ok: true });
      }
      default:
        return reply(context, 200, { ignored: event.type });
    }
  } catch (err) {
    context.log.error(`stripe webhook ${event.type} failed: ${String(err && err.stack || err)}`);
    return reply(context, 500, { error: "failed" });
  }
};
