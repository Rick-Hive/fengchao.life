// 选课费 / Selection fee (design 2026-10-20, Rick): USD 1 per submission, collected by Stripe Checkout before the order
// becomes final, so that families take their own orders seriously. Not refundable, no exemptions (a coupon code may
// come later). The course fee itself never passes through Hive — families pay the course provider directly.
//
// This module is the shape and the switch; the Stripe round trip is the third stage. Until SELECTION_FEE_CENTS is set
// no fee exists (`selectionFee()` is null), orders are final on submission, and `fee` on the record is null.
//
// On an order record:  fee: { amount, currency, status, stripeSessionId, paymentIntentId, paidAt, receiptUrl, coupon }
//   status: unpaid → paid (Stripe webhook) | waived (a coupon that covers it) | refunded (never by policy; recorded if Stripe reports one)
const FEE_STATUSES = ["unpaid", "paid", "waived", "refunded"];

function selectionFee() {
  const cents = Math.round(Number(process.env.SELECTION_FEE_CENTS || 0));
  if (!(cents > 0)) return null;
  return { amount: cents, currency: String(process.env.SELECTION_FEE_CURRENCY || "usd").toLowerCase() };
}

// The fee part of a fresh order record: null when no fee is configured.
function feeRecord(fee) {
  if (!fee) return null;
  return { amount: fee.amount, currency: fee.currency, status: "unpaid", stripeSessionId: null, paymentIntentId: null, paidAt: null, receiptUrl: null, coupon: null };
}

// Is this order waiting for its fee? (Nothing is: the Stripe stage is not built. Kept so the order list and the
// seat count can already ask the question in one place.)
function awaitingFee(order) { return !!(order && order.status === "pending_fee"); }

module.exports = { FEE_STATUSES, selectionFee, feeRecord, awaitingFee };
