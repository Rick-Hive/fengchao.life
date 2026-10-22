// 选课费 with Stripe (order flow v3 第二批, 2026-10-22): off unless SELECTION_FEE_CENTS and STRIPE_SECRET_KEY are both
// set; on, a submit holds the cart and opens Checkout, the webhook (verified) builds the orders once, an expired
// session releases the seats, a refund marks the fee, the status endpoint catches a late webhook, the nightly sweep
// reconciles. Stripe is faked at the transport.   Run with: node test/selection-fee.test.js
const assert = require("assert");
const path = require("path");
const Module = require("module");
const realResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) { if (request === "@azure/storage-blob") return "@azure/storage-blob"; return realResolve.call(this, request, parent, ...rest); };
require.cache["@azure/storage-blob"] = { id: "@azure/storage-blob", filename: "@azure/storage-blob", loaded: true, exports: { BlobServiceClient: { fromConnectionString() { throw new Error("no storage in tests"); } } } };
delete process.env.STORAGE_CONNECTION_STRING; delete process.env.SELECTION_FEE_CENTS; delete process.env.STRIPE_SECRET_KEY;
process.env.POWER_AUTOMATE_URL = "https://flow.example/trigger";
const R = (...p) => path.join(__dirname, "..", ...p);

// storage: jsonstore in memory, orders in memory
const blobs = {}, copy = (x) => JSON.parse(JSON.stringify(x));
const jsonstore = require(R("api", "shared", "jsonstore.js"));
jsonstore.read = async (n, fb) => (blobs[n] ? copy(blobs[n]) : (typeof fb === "function" ? fb() : copy(fb)));
jsonstore.readWithTag = async (n, fb) => ({ doc: await jsonstore.read(n, fb), etag: null });
jsonstore.write = async (n, d) => { blobs[n] = copy(d); };
jsonstore.update = async (n, fb, m) => { const d = await jsonstore.read(n, fb); const r = await m(d); if (r !== false) blobs[n] = copy(d); return { doc: d, result: r, written: r !== false }; };
const snapshot = {
  generatedAt: "2026-10-22T00:00:00Z", tracks: [{ trackId: 1, nameZh: "国际·古典", nameEn: "International: Classical" }],
  courses: [
    { id: "recA", code: "KXC-MATH-HS-101", nameEn: "Geometry", nameZh: "几何", price: 2400, grades: ["G9"], subjects: [], teachers: [], school: { name: "KXC School", abbr: "KXC" }, maxSize: 1 },
    { id: "recB", code: "BES-SCI-MS-201", nameEn: "Life Science", nameZh: "生命科学", price: 1800, grades: ["G7"], subjects: [], teachers: [], school: { name: "BES School", abbr: "BES" } },
  ],
  private: { schoolRouting: { KXC: { name: "KXC School", abbr: "KXC", teamsChannelId: "19:kxc" }, BES: { name: "BES School", abbr: "BES", teamsChannelId: "19:bes" } } },
};
const blob = require(R("api", "shared", "blob.js"));
blob.readSnapshot = async () => snapshot;
let seq = 0; blob.nextSequence = async () => ++seq;
const crm = require(R("api", "shared", "crm.js"));
const orders = {};
crm.writeOrder = async (o) => { orders[o.orderId] = copy(o); };
crm.readOrder = async (id) => (orders[id] ? { order: copy(orders[id]), etag: "e" } : null);
crm.listOrders = async () => Object.values(orders).map(copy);
const flowCalls = [];
global.fetch = async (url, opts) => { flowCalls.push({ url, body: JSON.parse(opts.body) }); return { ok: true, status: 202, text: async () => "" }; };

// Stripe, faked at the transport
const stripe = require(R("api", "shared", "stripe.js"));
const sessions = {}, calls = [];
stripe._setTransport(async (method, p, form, opts) => {
  calls.push({ method, p, form, opts });
  if (method === "POST" && p === "/checkout/sessions") { const id = "cs_test_" + (Object.keys(sessions).length + 1); sessions[id] = { id, object: "checkout.session", url: "https://checkout.stripe.com/c/pay/" + id, status: "open", payment_status: "unpaid", livemode: false, metadata: form.metadata, client_reference_id: form.client_reference_id, amount_total: form.line_items[0].price_data.unit_amount, currency: form.line_items[0].price_data.currency }; return sessions[id]; }
  let m = /^\/checkout\/sessions\/([^/?]+)\/expire$/.exec(p); if (m) { sessions[m[1]].status = "expired"; return sessions[m[1]]; }
  m = /^\/checkout\/sessions\/([^/?]+)/.exec(p); if (m) return Object.assign({}, sessions[m[1]], { payment_intent: { id: "pi_1", latest_charge: { receipt_url: "https://pay.stripe.com/receipts/r1" } } });
  m = /^\/payment_intents\/(.+)$/.exec(p); if (m) return { id: m[1], metadata: { submission: lastSub } };
  throw new Error("unexpected Stripe call " + method + " " + p);
});
let lastSub = "";

const fee = require(R("api", "shared", "fee.js"));
const submissions = require(R("api", "shared", "submissions.js"));
const sweep = require(R("api", "shared", "sweep.js"));
const order = require(R("api", "order", "index.js"));
const status = require(R("api", "order-status", "index.js"));
const webhook = require(R("api", "stripe-webhook", "index.js"));
const ctx = () => ({ log: Object.assign(() => {}, { warn() {}, error() {} }), res: null });
const post = async (body) => { const c = ctx(); await order(c, { method: "POST", headers: { "x-forwarded-for": "198.51.100." + Math.floor(Math.random() * 200) }, body }); return c.res; };
const SECRET = "whsec_test_123";
const hook = async (event, sig) => { const raw = JSON.stringify(event); const c = ctx(); await webhook(c, { method: "POST", rawBody: raw, headers: { "stripe-signature": sig || stripe.signPayload(raw, SECRET) }, body: event }); return c.res; };
const get = async (q) => { const c = ctx(); await status(c, { method: "GET", query: q || {} }); return c.res; };
const contact = { familyName: "王", givenName: "五" };

(async () => {
  // ---- the pieces ----
  assert.strictEqual(stripe.formEncode({ a: 1, b: { c: [{ d: "x y" }] }, e: null }), "a=1&b%5Bc%5D%5B0%5D%5Bd%5D=x%20y");
  const raw = '{"id":"evt_1"}', sig = stripe.signPayload(raw, SECRET);
  assert.deepStrictEqual(stripe.verifyWebhook(raw, sig, SECRET), { id: "evt_1" });
  assert.throws(() => stripe.verifyWebhook(raw + " ", sig, SECRET), /mismatch/);
  assert.throws(() => stripe.verifyWebhook(raw, stripe.signPayload(raw, SECRET, Math.floor(Date.now() / 1000) - 3600), SECRET), /too old/);
  assert.throws(() => stripe.verifyWebhook(raw, sig, ""), /no secret/);

  // ---- off: nothing changes ----
  process.env.SELECTION_FEE_CENTS = "134";
  assert.strictEqual(fee.activeFee(), null, "a fee amount alone does not charge anything: Stripe must be set up too");
  assert.deepStrictEqual((await get()).body, { fee: null, test: false });
  let r = await post({ email: "a@gmail.com", trackId: 1, courseIds: ["recB"], contact, lang: "zh" });
  assert.ok(r.status === 200 && r.body.orderIds.length === 1 && !r.body.checkout, "fee off: the order is made at once, as before");
  assert.strictEqual(orders[r.body.orderIds[0]].fee, null, "no fee on the record");
  assert.strictEqual(calls.length, 0, "Stripe never called");

  // ---- on ----
  process.env.STRIPE_SECRET_KEY = "sk_test_x"; process.env.STRIPE_WEBHOOK_SECRET = SECRET;
  assert.deepStrictEqual(fee.activeFee(), { amount: 134, currency: "usd", label: "USD 1.34" });
  assert.deepStrictEqual((await get()).body, { fee: { amount: 134, currency: "usd", label: "USD 1.34" }, test: true }, "the order page's line");
  const nOrders = Object.keys(orders).length, nFlow = flowCalls.length;
  r = await post({ email: "b@gmail.com", trackId: 1, courseIds: ["recA", "recB"], contact, lang: "en" });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  const sub = lastSub = r.body.submission;
  assert.ok(/^https:\/\/checkout\.stripe\.com\//.test(r.body.checkout) && r.body.fee.label === "USD 1.34", "the family goes to Stripe");
  assert.strictEqual(Object.keys(orders).length, nOrders, "no order yet — no order number spent before the fee is paid");
  assert.strictEqual(flowCalls.length, nFlow, "nobody notified yet");
  const cs = calls.find((c) => c.p === "/checkout/sessions");
  assert.ok(cs.form.customer_email === "b@gmail.com" && cs.form.metadata.submission === sub && cs.form.locale === "en" && cs.opts.idempotencyKey === "checkout-" + sub && /\/done\?submission=/.test(cs.form.success_url) && cs.form.allow_promotion_codes === "true", "the session: the order's email, the submission, idempotent");
  let s = await submissions.read(sub);
  assert.ok(s.status === "held" && s.stripe.sessionId === "cs_test_1" && s.items.length === 2 && Date.parse(s.holdUntil) - Date.parse(s.createdAt) >= 35 * 60 * 1000, "held, with its session, past Stripe's 31 minutes");
  // the held seat counts: Geometry (max 1) is full for the next family
  r = await post({ email: "c@gmail.com", trackId: 1, courseIds: ["recA"], contact, lang: "zh" });
  assert.deepStrictEqual([r.status, r.body.error], [409, "course_full"], "a seat being paid for is not sold twice");
  assert.strictEqual((await get({ submission: sub })).body.status, "held");

  // the webhook: a forged signature is refused; the real one builds the orders
  const done = { id: "evt_2", type: "checkout.session.completed", data: { object: Object.assign({}, sessions.cs_test_1, { status: "complete", payment_status: "paid" }) } };
  sessions.cs_test_1.status = "complete"; sessions.cs_test_1.payment_status = "paid";
  assert.strictEqual((await hook(done, "t=1,v1=00")).status, 400, "unsigned → refused");
  r = await hook(done);
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.strictEqual(r.body.orderIds.length, 2, "two hives → two orders, now");
  const o1 = orders[r.body.orderIds[0]];
  assert.ok(o1.submission === sub && o1.fee.status === "paid" && o1.fee.receiptUrl === "https://pay.stripe.com/receipts/r1" && o1.fee.test === true && o1.status === "submitted", "the record: the submission, the fee paid with its receipt");
  assert.strictEqual(flowCalls.length, nFlow + 1, "announced once");
  // Stripe delivers it again: nothing new
  r = await hook(done);
  assert.ok(r.status === 200 && r.body.orderIds.length === 2 && Object.keys(orders).length === nOrders + 2 && flowCalls.length === nFlow + 1, "idempotent: no second set of orders, no second message");
  s = await submissions.read(sub);
  assert.ok(s.status === "paid" && s.orderIds.length === 2 && !(await submissions.openList())[sub], "paid, out of the open list");
  r = await get({ submission: sub });
  assert.deepStrictEqual([r.body.status, r.body.orderIds.length, r.body.fee.receiptUrl], ["paid", 2, "https://pay.stripe.com/receipts/r1"], "the done page reads the orders");

  // a refund of the fee is recorded on the submission and its orders
  r = await hook({ id: "evt_3", type: "charge.refunded", data: { object: { id: "ch_1", payment_intent: "pi_1", amount: 134, amount_refunded: 134 } } });
  assert.strictEqual(r.status, 200);
  assert.ok((await submissions.read(sub)).fee.status === "refunded" && orders[o1.orderId].fee.status === "refunded" && orders[o1.orderId].status === "submitted", "the fee refunded; the order itself untouched");

  // ---- not paid: the session expires → abandoned, seats free ----
  r = await post({ email: "d@gmail.com", trackId: 1, courseIds: ["recB"], contact, lang: "zh" });
  const sub2 = r.body.submission;
  assert.ok((await submissions.openList())[sub2]);
  r = await hook({ id: "evt_4", type: "checkout.session.expired", data: { object: { id: "cs_test_2", metadata: { submission: sub2 } } } });
  assert.ok(r.status === 200 && (await submissions.read(sub2)).status === "abandoned" && !(await submissions.openList())[sub2], "expired → abandoned, released");

  // ---- the family comes back without paying: released at once (with its own email only) ----
  r = await post({ email: "e@gmail.com", trackId: 1, courseIds: ["recB"], contact, lang: "zh" });
  const sub3 = r.body.submission;
  let c = ctx(); await status(c, { method: "POST", query: {}, body: { submission: sub3, email: "other@gmail.com", action: "release" } });
  assert.strictEqual(c.res.status, 403, "someone else's submission is not released");
  c = ctx(); await status(c, { method: "POST", query: {}, body: { submission: sub3, email: "E@gmail.com", action: "release" } });
  assert.ok(c.res.body.status === "abandoned" && sessions.cs_test_3.status === "expired", "released, and the Stripe session closed");

  // ---- a lost webhook: the done page's poll finalizes ----
  r = await post({ email: "f@gmail.com", trackId: 1, courseIds: ["recB"], contact, lang: "zh" });
  const sub4 = r.body.submission;
  blobs[submissions.blobOf(sub4)].createdAt = new Date(Date.now() - 10000).toISOString();
  sessions.cs_test_4.status = "complete"; sessions.cs_test_4.payment_status = "paid";
  r = await get({ submission: sub4 });
  assert.ok(r.body.status === "paid" && r.body.orderIds.length === 1, "the poll catches up with Stripe: " + JSON.stringify(r.body));

  // ---- the nightly sweep: a held submission past its hold — paid → orders; unpaid → abandoned ----
  r = await post({ email: "g@gmail.com", trackId: 1, courseIds: ["recB"], contact, lang: "zh" }); const sub5 = r.body.submission;
  r = await post({ email: "h@gmail.com", trackId: 1, courseIds: ["recB"], contact, lang: "zh" }); const sub6 = r.body.submission;
  sessions.cs_test_5.status = "complete"; sessions.cs_test_5.payment_status = "no_payment_required"; // a 100% promotion code
  const later = Date.now() + 2 * 3600 * 1000;
  const sw = await sweep.run({ now: later });
  assert.deepStrictEqual(sw.payments.map((p) => [p.submission, p.action]).sort(), [[sub5, "finalized"], [sub6, "abandoned"]].sort(), JSON.stringify(sw.payments));
  const s5 = await submissions.read(sub5);
  assert.ok(s5.status === "paid" && orders[s5.orderIds[0]].fee.status === "waived", "a code that covers the fee: waived, the order made");
  assert.ok((await submissions.read(sub6)).status === "abandoned" && sessions.cs_test_6.status === "expired", "unpaid: abandoned, the session closed");

  // ---- Stripe down: the family is told, nothing held ----
  stripe._setTransport(async () => { throw Object.assign(new Error("Stripe 500: boom"), { status: 500 }); });
  r = await post({ email: "i@gmail.com", trackId: 1, courseIds: ["recB"], contact, lang: "zh" });
  assert.deepStrictEqual([r.status, r.body.error], [502, "payment_unavailable"]);
  assert.strictEqual(Object.values(await submissions.openList()).length, 0, "nothing left holding seats");
  console.log("selection-fee: all assertions passed");
})().catch((e) => { console.error(e); process.exit(1); });
