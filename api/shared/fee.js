// 选课费 / Selection fee (design 2026-10-20, Rick): USD 1 per submission, collected by Stripe Checkout before the order
// becomes final, so that families take their own orders seriously. Not refundable, no exemptions (a coupon code may
// come later). The course fee itself never passes through Hive — families pay the course provider directly.
//
// This module is the shape and the switch. The fee is ACTIVE only when both SELECTION_FEE_CENTS and STRIPE_SECRET_KEY
// are set (`activeFee()`); otherwise no fee exists, orders are final on submission exactly as before, and `fee` on the
// record is null. With it active, api/order holds the submission and sends the family to Stripe Checkout
// (api/shared/submissions.js, api/shared/stripe.js); the orders are made when the fee is paid.
//
// On an order record:  fee: { amount, currency, status, stripeSessionId, paymentIntentId, paidAt, receiptUrl, coupon }
//   status: unpaid → paid (Stripe webhook) | waived (a coupon that covers it) | refunded (never by policy; recorded if Stripe reports one)
const FEE_STATUSES = ["unpaid", "paid", "waived", "refunded"];

function selectionFee() {
  const cents = Math.round(Number(process.env.SELECTION_FEE_CENTS || 0));
  if (!(cents > 0)) return null;
  return { amount: cents, currency: String(process.env.SELECTION_FEE_CURRENCY || "usd").toLowerCase() };
}

// The fee that is actually charged: configured AND Stripe set up. Label: "USD 1.34".
function activeFee() {
  const f = selectionFee();
  if (!f || !require("./stripe").configured()) return null;
  return Object.assign({}, f, { label: `${f.currency.toUpperCase()} ${f.amount % 100 ? (f.amount / 100).toFixed(2) : f.amount / 100}` }); // "USD 1", "USD 1.34"
}

// The fee part of a fresh order record: null when no fee is configured.
function feeRecord(fee) {
  if (!fee) return null;
  return { amount: fee.amount, currency: fee.currency, status: "unpaid", stripeSessionId: null, paymentIntentId: null, paidAt: null, receiptUrl: null, coupon: null };
}

// Is this order waiting for its fee? (Nothing is: the Stripe stage is not built. Kept so the order list and the
// seat count can already ask the question in one place.)
function awaitingFee(order) { return !!(order && order.status === "pending_fee"); }

module.exports = { FEE_STATUSES, selectionFee, activeFee, feeRecord, awaitingFee };
