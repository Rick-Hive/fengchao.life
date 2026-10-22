// Stripe, for the selection fee (选课费; order flow v3 第二批, Rick 2026-10-22: 「先做吧」).
//
// No SDK: the three calls Hive makes (create a Checkout session, read one back, verify a webhook) are plain HTTPS with
// form-encoded bodies, so this module is fetch + a form encoder + an HMAC check, and nothing new to install.
//
// App settings (Azure only — never in Airtable, never in the chat):
//   STRIPE_SECRET_KEY       sk_test_… first, sk_live_… after a week of test orders
//   STRIPE_WEBHOOK_SECRET   whsec_… of the endpoint https://www.fengchao.life/api/stripe/webhook
// Without STRIPE_SECRET_KEY nothing here is ever called: the fee is off and orders are final on submission, as before.
const crypto = require("crypto");

const API = "https://api.stripe.com/v1";

function configured() { return !!process.env.STRIPE_SECRET_KEY; }
function testMode() { return /^sk_test_/.test(process.env.STRIPE_SECRET_KEY || ""); }

// { a: 1, b: { c: [ { d: 2 } ] } } → "a=1&b[c][0][d]=2" — Stripe's form encoding
function formEncode(obj, prefix, out) {
  out = out || [];
  for (const [k, v] of Object.entries(obj || {})) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((x, i) => { if (x !== null && typeof x === "object") formEncode(x, `${key}[${i}]`, out); else out.push(`${encodeURIComponent(`${key}[${i}]`)}=${encodeURIComponent(String(x))}`); });
    else if (typeof v === "object") formEncode(v, key, out);
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  }
  return out.join("&");
}

// The transport, replaceable in tests: (method, path, form?, opts?) → parsed JSON; throws { status, code, message }.
let transport = async function (method, path, form, opts) {
  const headers = { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, "Stripe-Version": "2024-06-20" };
  if (form) headers["Content-Type"] = "application/x-www-form-urlencoded";
  if (opts && opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;
  const res = await fetch(API + path, { method, headers, body: form ? formEncode(form) : undefined });
  const data = await res.json().catch(() => null);
  if (!res.ok) { const e = (data && data.error) || {}; throw Object.assign(new Error(`Stripe ${res.status}: ${e.message || ""}`), { status: res.status, code: e.code || e.type || "stripe_error" }); }
  return data;
};
function _setTransport(fn) { transport = fn; }

// The hosted payment page for one submission. `fee` = { amount (cents), currency }; the session lives 31 minutes
// (Stripe's minimum is 30) and is idempotent per submission, so a double click gets the same page.
async function createCheckout({ submission, fee, email, lang, successUrl, cancelUrl, expiresAt, description }) {
  return transport("POST", "/checkout/sessions", {
    mode: "payment",
    client_reference_id: submission,
    customer_email: email,
    locale: lang === "en" ? "en" : "zh",
    allow_promotion_codes: "true",
    expires_at: Math.floor(expiresAt / 1000),
    success_url: successUrl,
    cancel_url: cancelUrl,
    line_items: [{ quantity: 1, price_data: { currency: fee.currency, unit_amount: fee.amount, product_data: { name: description || "选课费 Selection fee (incl. payment processing)" } } }],
    metadata: { submission },
    payment_intent_data: { description: `FENGCHAO ${submission}`, metadata: { submission } },
  }, { idempotencyKey: `checkout-${submission}` });
}

// A session as Stripe has it now, with the charge (receipt) and the discount code when there is one
async function getSession(id) {
  const q = "?expand[]=payment_intent.latest_charge&expand[]=total_details.breakdown.discounts.discount.promotion_code";
  return transport("GET", `/checkout/sessions/${encodeURIComponent(id)}${q}`);
}

async function getPaymentIntent(id) { return transport("GET", `/payment_intents/${encodeURIComponent(id)}`); }

// Close an open session at once (the family came back without paying): its seats are released now, not in 30 minutes
async function expireSession(id) { return transport("POST", `/checkout/sessions/${encodeURIComponent(id)}/expire`, {}); }

// Webhook signature (Stripe-Signature: t=…,v1=…): HMAC-SHA256 of "t.rawBody" with the endpoint secret, within
// `toleranceSec` of now. Returns the parsed event or throws { code: "bad_signature" }.
function verifyWebhook(rawBody, header, secret, nowMs, toleranceSec) {
  const raw = Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : String(rawBody || "");
  const parts = {}; for (const kv of String(header || "").split(",")) { const i = kv.indexOf("="); if (i > 0) { const k = kv.slice(0, i).trim(), v = kv.slice(i + 1).trim(); (parts[k] = parts[k] || []).push(v); } }
  const t = Number((parts.t || [])[0]);
  const fail = (why) => { throw Object.assign(new Error("bad webhook signature: " + why), { code: "bad_signature" }); };
  if (!secret) fail("no secret configured");
  if (!t || !(parts.v1 || []).length) fail("header");
  if (Math.abs((nowMs || Date.now()) / 1000 - t) > (toleranceSec || 300)) fail("too old");
  const want = crypto.createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex");
  const ok = parts.v1.some((v) => v.length === want.length && crypto.timingSafeEqual(Buffer.from(v), Buffer.from(want)));
  if (!ok) fail("mismatch");
  return JSON.parse(raw);
}
// For tests and for the documentation of the header's shape
function signPayload(raw, secret, tSec) { const t = tSec || Math.floor(Date.now() / 1000); return `t=${t},v1=${crypto.createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex")}`; }

// What the order records keep of a paid session: { status, stripeSessionId, paymentIntentId, paidAt, receiptUrl, coupon, amountPaid }
function feeFromSession(s, fee) {
  const pi = s && s.payment_intent && typeof s.payment_intent === "object" ? s.payment_intent : null;
  const charge = pi && pi.latest_charge && typeof pi.latest_charge === "object" ? pi.latest_charge : null;
  const disc = (((s && s.total_details && s.total_details.breakdown && s.total_details.breakdown.discounts) || [])[0] || {}).discount || null;
  const promo = disc && disc.promotion_code && typeof disc.promotion_code === "object" ? disc.promotion_code.code : "";
  const paid = s && s.payment_status === "paid";
  return {
    amount: fee ? fee.amount : (s && s.amount_subtotal) || 0,
    currency: (fee && fee.currency) || (s && s.currency) || "usd",
    status: paid ? "paid" : "waived", // no_payment_required = a promotion code covered it
    amountPaid: (s && s.amount_total) || 0,
    stripeSessionId: (s && s.id) || null,
    paymentIntentId: pi ? pi.id : (s && typeof s.payment_intent === "string" ? s.payment_intent : null),
    paidAt: new Date().toISOString(),
    receiptUrl: (charge && charge.receipt_url) || null,
    coupon: promo || (disc && disc.coupon && disc.coupon.id) || null,
    test: s ? s.livemode === false : testMode(),
  };
}

module.exports = { API, configured, testMode, formEncode, createCheckout, getSession, getPaymentIntent, expireSession, verifyWebhook, signPayload, feeFromSession, _setTransport };
