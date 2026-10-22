// The website's order page with and without the selection fee (2026-10-22), driven in jsdom: without a fee nothing
// changes (button 提交订单, the order number at once); with one the page names the fee, the button says 提交并支付,
// the family is sent to Stripe, and the done page waits for the payment and then lists the orders; a family coming
// back without paying sees why and its hold is released.
//
// Run with:  npm i jsdom && node test/site-fee.test.js
const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");
const ROOT = path.join(__dirname, "..", "assets") + path.sep;
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8").replace(/<script[^>]*><\/script>/g, "");
const snapshot = {
  generatedAt: "2026-10-22T00:00:00Z", tracks: [], subjects: [], curriculumMap: {}, teacherProfiles: [],
  courses: [{ id: "c1", code: "MTH-EL-101", nameEn: "Math G1", nameZh: "数学一年级", grades: ["G1"], trackIds: [1, 2, 3, 4, 5, 6], price: 100, subjects: [], teachers: [], school: { name: "KXC", abbr: "KXC" } }],
};
let failures = 0;
const check = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) failures++; console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function page(url, feeOn, routes, paying) {
  const vc = new VirtualConsole(); vc.on("jsdomError", (e) => console.log("   [page error]", e.message.split("\n")[0]));
  const dom = new JSDOM(html, { runScripts: "outside-only", url, virtualConsole: vc });
  const w = dom.window, posts = [], navigations = [];
  if (paying) w.sessionStorage.setItem("fc-paying", JSON.stringify(paying));
  w.localStorage.setItem("fc-wizard-v1", JSON.stringify({ stage: "grammar", mode: null, pedagogy: "classical", cart: { c1: true }, cartAt: Date.now(), filters: {} }));
  w.fetch = (u, opts) => {
    const url = String(u), body = opts && opts.body ? JSON.parse(opts.body) : null;
    if (body) posts.push({ url, body });
    const json = (status, j) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(j) });
    for (const [re, fn] of routes || []) if (re.test(url)) return fn(url, body, json);
    if (/\/api\/seats/.test(url)) return json(200, { seats: {} });
    if (/\/api\/order\/status$/.test(url)) return json(200, feeOn ? { fee: { amount: 134, currency: "usd", label: "USD 1.34" }, test: true } : { fee: null, test: false });
    if (/\/api\/me\//.test(url)) return json(401, {});
    if (/\/api\/data/.test(url)) return json(200, snapshot);
    return json(404, {});
  };
  w.scrollTo = () => {}; w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  w.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
  // Stripe's page: record where the family is sent instead of leaving
  w.eval(fs.readFileSync(ROOT + "i18n.js", "utf8"));
  w.__go = (href) => navigations.push(href);
  w.eval(fs.readFileSync(ROOT + "app.js", "utf8").replace("location.href = r.body.checkout;", "window.__go(r.body.checkout);"));
  return { w, doc: w.document, posts, navigations };
}
const fillForm = (doc, w) => {
  const set = (id, v) => { const el = doc.getElementById(id); el.value = v; el.dispatchEvent(new w.Event("input", { bubbles: true })); };
  set("email", "mama@example.com"); set("familyName", "张"); set("givenName", "三");
};

(async () => {
  // ---- no fee: exactly as before ----
  let P = page("https://www.fengchao.life/order", false, [[/\/api\/order$/, (u, b, json) => json(200, { ok: true, orderId: "FC-20261022-KXC-001", orderIds: ["FC-20261022-KXC-001"], submission: "FS-20261022-ABCDE", notified: true })]]);
  await wait(50);
  check("no fee: no fee line, the usual button", [!!P.doc.querySelector(".fee-line"), P.doc.getElementById("submitBtn").textContent], [false, "提交订单"]);
  fillForm(P.doc, P.w); P.doc.getElementById("submitBtn").click(); await wait(50);
  check("no fee: the order number at once, nobody sent anywhere", [P.doc.querySelector(".done-card .order-id") && P.doc.querySelector(".done-card .order-id").textContent, P.navigations.length], ["FC-20261022-KXC-001", 0]);

  // ---- with the fee: the line, the button, off to Stripe ----
  P = page("https://www.fengchao.life/order", true, [[/\/api\/order$/, (u, b, json) => json(200, { ok: true, checkout: "https://checkout.stripe.com/c/pay/cs_test_1", submission: "FS-20261022-ABCDE", fee: { label: "USD 1.34" } })]]);
  await wait(50);
  check("fee: the line names it, test mode marked", [/选课费 USD 1\.34/.test((P.doc.querySelector(".fee-line") || {}).textContent || ""), !!P.doc.querySelector(".fee-line .fee-test")], [true, true]);
  check("fee: the button says what it does", P.doc.getElementById("submitBtn").textContent, "提交并支付 USD 1.34");
  fillForm(P.doc, P.w); P.doc.getElementById("submitBtn").click(); await wait(50);
  check("fee: the family is sent to Stripe's page", P.navigations, ["https://checkout.stripe.com/c/pay/cs_test_1"]);
  check("fee: the cart is kept until the payment is confirmed", Object.keys(JSON.parse(P.w.localStorage.getItem("fc-wizard-v1")).cart), ["c1"]);
  check("fee: the tab remembers what is being paid for", JSON.parse(P.w.sessionStorage.getItem("fc-paying")), { submission: "FS-20261022-ABCDE", email: "mama@example.com" });

  // ---- back from Stripe, paid: the done page waits, then lists the orders ----
  let polls = 0;
  P = page("https://www.fengchao.life/done?submission=FS-20261022-ABCDE", true, [[/\/api\/order\/status\?submission=/, (u, b, json) => (++polls < 2 ? json(200, { status: "held", orderIds: [] }) : json(200, { status: "paid", orderIds: ["FC-20261022-KXC-001"], fee: { receiptUrl: "https://pay.stripe.com/receipts/r1" } }))]]);
  await wait(100);
  check("paid: confirming first", [!!P.doc.querySelector(".done-card .spinner"), /正在确认付款/.test(P.doc.querySelector(".done-card").textContent)], [true, true]);
  await wait(3200);
  check("paid: the order number and the receipt", [P.doc.querySelector(".done-card .order-id").textContent, !!P.doc.querySelector('.done-card a[href="https://pay.stripe.com/receipts/r1"]')], ["FC-20261022-KXC-001", true]);
  check("paid: the cart emptied", Object.keys(JSON.parse(P.w.localStorage.getItem("fc-wizard-v1")).cart), []);
  check("the address no longer carries the submission", P.w.location.search, "");

  // ---- back without paying: told why, the hold released ----
  P = page("https://www.fengchao.life/order?payment=cancelled&submission=FS-20261022-ABCDE", true, [], { submission: "FS-20261022-ABCDE", email: "mama@example.com" });
  await wait(50);
  check("cancelled: the notice on the order page", /付款未完成/.test((P.doc.querySelector(".pay-note") || {}).textContent || ""), true);
  check("cancelled: the hold released with the family's own email", P.posts.filter((x) => /\/api\/order\/status$/.test(x.url)).map((x) => x.body), [{ submission: "FS-20261022-ABCDE", email: "mama@example.com", action: "release" }]);
  check("cancelled: the cart is still there to submit again", !!P.doc.getElementById("submitBtn"), true);

  console.log(failures ? `\n${failures} check(s) failed` : "\nsite-fee: all checks passed");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
