// The nightly sweep (api/shared/sweep.js) and the status notices (api/shared/notify.js), v3 2026-10-21: expiries
// 14 days after the last step, a reminder 3 days before, the provider nudged 7 days after 家长已付款, the waitlist
// seated automatically when a seat opens; every event one flow call with the family's email and / or the provider's
// Teams route.
const assert = require("assert");
const path = require("path");
const Module = require("module");
const realResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) { if (request === "@azure/storage-blob") return "@azure/storage-blob"; return realResolve.call(this, request, parent, ...rest); };
require.cache["@azure/storage-blob"] = { id: "@azure/storage-blob", filename: "@azure/storage-blob", loaded: true, exports: { BlobServiceClient: { fromConnectionString() { throw new Error("no storage in tests"); } } } };
delete process.env.STORAGE_CONNECTION_STRING;
process.env.POWER_AUTOMATE_URL = "https://flow.example/trigger";
const R = (...p) => path.join(__dirname, "..", ...p);
const DAY = 86400000;

const snapshot = {
  generatedAt: "2026-10-21T00:00:00Z",
  courses: [
    { id: "recA", code: "KXC-MATH-7", nameEn: "Grade 7 Mathematics", nameZh: "七年级数学", maxSize: 2, minSize: 1, school: { name: "Kids X Center", abbr: "KXC" } },
    { id: "recB", code: "KXC-SCI-7", nameEn: "Grade 7 Science", nameZh: "七年级科学", maxSize: null, school: { name: "Kids X Center", abbr: "KXC" } },
  ],
  messageTemplates: { status_paid: { zh: { subject: "自定义：已收款 {{orderId}}", body: "" } } },
  private: { schoolRouting: { kxc: { name: "Kids X Center", abbr: "KXC", teamsChannelId: "19:kxc", notifyEmail: "head@kxc.edu", domain: "kxc.edu" } } },
};
const blob = require(R("api", "shared", "blob.js"));
blob.readSnapshot = async () => snapshot;
const crm = require(R("api", "shared", "crm.js"));
const store = {};
crm.writeOrder = async (o) => { store[o.orderId] = JSON.parse(JSON.stringify(o)); };
crm.readOrder = async (id) => (store[id] ? { order: JSON.parse(JSON.stringify(store[id])), etag: "e" } : null);
crm.listOrders = async () => Object.values(store).map((o) => JSON.parse(JSON.stringify(o)));
const calls = [];
global.fetch = async (url, opts) => { calls.push(JSON.parse(opts.body)); return { ok: true, status: 202, text: async () => "" }; };
const notify = require(R("api", "shared", "notify.js"));
const sweep = require(R("api", "shared", "sweep.js"));

const T0 = Date.parse("2026-10-01T02:00:00Z");
function mk(id, status, submittedDaysAgo, items, extra) {
  const at = new Date(T0 - submittedDaysAgo * DAY).toISOString();
  return Object.assign({ orderId: id, submission: id, submittedAt: at, email: id.toLowerCase() + "@gmail.com", account: "", lang: "zh", items, hives: [{ key: "kxc", name: "Kids X Center", abbr: "KXC" }], itemCount: items.length, totalPrice: 1200, currency: "CNY", status, history: [{ at, by: "system", from: null, to: status, note: "" }], notify: { ok: true } }, extra || {});
}
const math = (wl) => ({ code: "KXC-MATH-7", nameZh: "七年级数学", nameEn: "Grade 7 Mathematics", price: 1200, schoolAbbr: "KXC", waitlist: !!wl });
const sci = () => ({ code: "KXC-SCI-7", nameZh: "七年级科学", nameEn: "Grade 7 Science", price: 900, schoolAbbr: "KXC" });

(async () => {
  // ---- notify: a family event, a provider event, both ----
  const o = mk("FC-20261001-KXC-001", "contacted", 1, [math(), sci()]);
  store[o.orderId] = o;
  let r = await notify.notify(o, "contacted", { snapshot, by: "head@kxc.edu" });
  assert.deepStrictEqual([r.ok, r.sent], [true, { family: true, provider: false }]);
  let p = calls.pop();
  assert.strictEqual(p.emailTo, o.email); assert.strictEqual(p.routes.length, 0, "a family-only event posts nowhere");
  assert.ok(/已联系您/.test(p.emailSubject) && /七年级数学/.test(p.emailBodyText) && /我已付款/.test(p.emailBodyText) && /2026[/-]10[/-]14/.test(p.emailBodyText), "the pay-by date is 14 days after the contact: " + p.emailBodyText);
  assert.strictEqual(typeof p.items[0].name, "string", "the flow's schema still sees items[].name");
  assert.strictEqual(store[o.orderId].notices.length, 1, "the notice is recorded on the order");
  r = await notify.notify(o, "parent_paid", { snapshot, byFamily: true, note: "转账" });
  p = calls.pop();
  assert.deepStrictEqual(r.sent, { family: false, provider: true });
  assert.strictEqual(p.routes[0].teamsChannelId, "19:kxc"); assert.ok(/家长称已付款/.test(p.routes[0].notifySubject) && /Family reports payment/.test(p.routes[0].notifySubject), "bilingual provider post");
  assert.strictEqual(p.emailTo, "head@kxc.edu", "the provider's notify address gets the same text by mail");
  r = await notify.notify(Object.assign({}, o, { lang: "en" }), "paid", { snapshot });
  p = calls.pop();
  assert.ok(/Course fee received/.test(p.emailSubject), "English family, English mail: " + p.emailSubject);
  r = await notify.notify(o, "paid", { snapshot });
  p = calls.pop();
  assert.strictEqual(p.emailSubject, "自定义：已收款 FC-20261001-KXC-001", "an Airtable row overrides the subject, the default body stays");
  assert.ok(/课程提供方/.test(p.emailBodyText));
  r = await notify.notify(o, "cancelled", { snapshot });
  assert.deepStrictEqual(calls.pop().routes.length, 0, "cancelled by the provider: no post to itself");
  r = await notify.notify(o, "cancelled", { snapshot, byFamily: true });
  assert.strictEqual(calls.pop().routes.length, 1, "cancelled by the family: the provider hears");
  calls.length = 0;

  // ---- sweep ----
  for (const k of Object.keys(store)) delete store[k];
  const now = T0;
  // A: submitted 15 days ago, untouched → expires
  store["FC-20260916-KXC-001"] = mk("FC-20260916-KXC-001", "submitted", 15, [math()]);
  // B: contacted 2 days ago (submitted 20 days ago): the contact restarted the clock → due in 12 days, nothing
  const b = mk("FC-20260911-KXC-002", "submitted", 20, [sci()]); const bt = new Date(now - 2 * DAY).toISOString();
  b.status = "contacted"; b.history.push({ at: bt, by: "head@kxc.edu", from: "submitted", to: "contacted", note: "" });
  store[b.orderId] = b;
  // C: submitted 12 days ago → due in 2 days → reminder
  store["FC-20260919-KXC-003"] = mk("FC-20260919-KXC-003", "submitted", 12, [sci()]);
  // D: parent_paid 8 days ago → nudge
  const d = mk("FC-20260920-KXC-004", "submitted", 11, [sci()]); const dt = new Date(now - 8 * DAY).toISOString();
  d.status = "parent_paid"; d.history.push({ at: dt, by: "d@gmail.com", from: "submitted", to: "parent_paid", note: "" });
  store[d.orderId] = d;
  // E: on the waitlist for the math course (max 2): A held one seat, F holds one → A's expiry opens a seat for E
  store["FC-20260925-KXC-005"] = mk("FC-20260925-KXC-005", "submitted", 6, [math(true)]);
  store["FC-20260926-KXC-006"] = mk("FC-20260926-KXC-006", "paid", 5, [math()]);
  // G: waitlisted too, later than E → stays
  store["FC-20260927-KXC-007"] = mk("FC-20260927-KXC-007", "submitted", 4, [math(true)]);

  const dry = await sweep.run({ now, dryRun: true });
  assert.deepStrictEqual([dry.expired, dry.reminded, dry.nudged, dry.seated.map((x) => x.orderId)], [["FC-20260916-KXC-001"], [{ orderId: "FC-20260919-KXC-003", days: 2 }], ["FC-20260920-KXC-004"], ["FC-20260925-KXC-005"]], JSON.stringify(dry));
  assert.strictEqual(calls.length, 0, "a dry run sends nothing"); assert.strictEqual(store["FC-20260916-KXC-001"].status, "submitted", "…and writes nothing");

  const r1 = await sweep.run({ now });
  assert.strictEqual(r1.errors.length, 0, JSON.stringify(r1.errors));
  assert.strictEqual(store["FC-20260916-KXC-001"].status, "expired");
  assert.strictEqual(store["FC-20260911-KXC-002"].status, "contacted", "the contact restarted B's clock");
  assert.strictEqual(store["FC-20260919-KXC-003"].expiryReminded, new Date(Date.parse(store["FC-20260919-KXC-003"].submittedAt) + 14 * DAY).toISOString());
  assert.ok(store["FC-20260920-KXC-004"].parentPaidNudged);
  const e = store["FC-20260925-KXC-005"];
  assert.strictEqual(e.items[0].waitlist, false, "E seated"); assert.ok(/递补（自动）/.test(e.history[e.history.length - 1].note));
  assert.strictEqual(store["FC-20260927-KXC-007"].items[0].waitlist, true, "G still waits: the course is full again");
  const events = calls.map((c) => c.event);
  assert.deepStrictEqual(events.sort(), ["expired", "nudge", "reminder_expiry", "seated"].map((x) => (x === "nudge" ? "parent_paid_nudge" : x)).sort(), "one notice per step: " + events);
  const seatedCall = calls.find((c) => c.event === "seated");
  assert.ok(/候补成功/.test(seatedCall.emailSubject) && seatedCall.routes.length === 1 && /2026[/-]10[/-]15/.test(seatedCall.emailBodyText), "the seated family gets a fresh 14-day deadline: " + seatedCall.emailBodyText);
  const rem = calls.find((c) => c.event === "reminder_expiry");
  assert.ok(/2 天后到期/.test(rem.emailSubject) && rem.routes.length === 1 && /延长 14 天/.test(rem.routes[0].notifyText), "reminder to both sides");

  // the next night: nothing repeats
  calls.length = 0;
  const r2 = await sweep.run({ now: now + 1000 });
  assert.strictEqual(r2.total, 0, "idempotent: " + JSON.stringify(r2));
  assert.strictEqual(calls.length, 0);
  console.log("sweep: all assertions passed");
})().catch((e) => { console.error(e); process.exit(1); });
