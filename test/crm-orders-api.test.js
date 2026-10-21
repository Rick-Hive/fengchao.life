// The order endpoints of api/crm (v3, 2026-10-21), driven as the order manager (staff:sales) and as a provider's
// leader (domain_leader:kxc.edu): 已收款 writes the commission and says Hive confirmed it; the child is named on the
// family's behalf; a cancelled term cancels the line on every live order and tells each family; the payment proof
// is served to the provider and to order readers, never to a masked reader.
//
// Run with:  node test/crm-orders-api.test.js
const assert = require("assert");
const path = require("path");
const Module = require("module");
const realResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) { if (request === "@azure/storage-blob") return "@azure/storage-blob"; return realResolve.call(this, request, parent, ...rest); };
require.cache["@azure/storage-blob"] = { id: "@azure/storage-blob", filename: "@azure/storage-blob", loaded: true, exports: { BlobServiceClient: { fromConnectionString() { throw new Error("no storage in tests"); } } } };
delete process.env.STORAGE_CONNECTION_STRING;
delete process.env.COMMISSION_RATE;
process.env.POWER_AUTOMATE_URL = "https://flow.example/trigger";
const R = (...p) => path.join(__dirname, "..", ...p);

const snapshot = {
  generatedAt: "2026-10-21T00:00:00Z",
  courses: [
    { id: "recA", code: "KXC-MATH-7", nameEn: "Grade 7 Mathematics", nameZh: "七年级数学", maxSize: 10, school: { name: "Kids X Center", abbr: "KXC" } },
    { id: "recB", code: "KXC-SCI-7", nameEn: "Grade 7 Science", nameZh: "七年级科学", maxSize: 10, school: { name: "Kids X Center", abbr: "KXC" } },
    { id: "recC", code: "OTH-ART-7", nameEn: "Art", nameZh: "美术", maxSize: 10, school: { name: "Other", abbr: "OTH" } },
  ],
  private: { schoolRouting: { KXC: { name: "Kids X Center", abbr: "KXC", teamsChannelId: "19:kxc", notifyEmail: "head@kxc.edu", domain: "kxc.edu" }, OTH: { name: "Other", abbr: "OTH", teamsChannelId: "19:oth", domain: "oth.edu" } } },
};
// Modules api/crm/index.js destructures at load time are replaced before it is required.
const blob = require(R("api", "shared", "blob.js")); blob.readSnapshot = async () => snapshot;
const roles = require(R("api", "shared", "roles.js"));
let who = { user: "sales@fengchao.life", roles: ["staff:sales"] };
roles.userRoles = async () => who;
const session = require(R("api", "shared", "session.js"));
session.guard = async () => ({ session: { cookies: [] } }); session.finish = () => {};
const auditMod = require(R("api", "shared", "audit.js"));
const audits = []; auditMod.audit = async (context, e) => { audits.push(e); };
const crm = require(R("api", "shared", "crm.js"));
const store = {};
crm.writeOrder = async (o) => { store[o.orderId] = JSON.parse(JSON.stringify(o)); };
crm.readOrder = async (id) => (store[id] ? { order: JSON.parse(JSON.stringify(store[id])), etag: "e" } : null);
crm.listOrders = async () => Object.values(store).map((o) => JSON.parse(JSON.stringify(o)));
crm.readProof = async (id, i) => (id === "FC-20261020-KXC-001" && i === 1 ? Buffer.from("PNG!") : null);
const sent = [];
global.fetch = async (url, opts) => { sent.push(JSON.parse(opts.body)); return { ok: true, status: 202, text: async () => "" }; };
const crmFn = require(R("api", "crm", "index.js"));

const T0 = "2026-10-20T02:00:00Z";
function mk(id, status, items, extra) {
  return Object.assign({ orderId: id, submission: id, submittedAt: T0, email: id.toLowerCase() + "@gmail.com", account: "", lang: "zh", contact: { familyName: "王", givenName: "强", englishName: "" }, items, hives: [{ key: "KXC", name: "Kids X Center", abbr: "KXC" }], itemCount: items.length, totalPrice: items.reduce((s, it) => s + (it.price || 0), 0), currency: "CNY", status, history: [{ at: T0, by: "system", from: null, to: "submitted", note: "" }].concat(status === "submitted" ? [] : [{ at: T0, by: "x", from: "submitted", to: status, note: "" }]), notify: { ok: true } }, extra || {});
}
const item = (code, price, extra) => Object.assign({ code, nameEn: code, nameZh: code, price, priceTbd: false, schoolAbbr: code.split("-")[0], waitlist: false, child: null }, extra || {});
store["FC-20261020-KXC-001"] = mk("FC-20261020-KXC-001", "parent_paid", [item("KXC-MATH-7", 1200), item("KXC-SCI-7", 800, { waitlist: true })], { proof: [{ i: 1, name: "wechat.png", type: "image/png", size: 4, at: T0 }] });
store["FC-20261020-KXC-002"] = mk("FC-20261020-KXC-002", "contacted", [item("KXC-SCI-7", 800)]);
store["FC-20261020-KXC-003"] = mk("FC-20261020-KXC-003", "paid", [item("KXC-SCI-7", 800), item("KXC-MATH-7", 1200)]);
store["FC-20261020-OTH-004"] = mk("FC-20261020-OTH-004", "submitted", [item("OTH-ART-7", 500)], { hives: [{ key: "OTH", name: "Other", abbr: "OTH" }] });

async function call({ action, method = "GET", body = null, query = {} }) {
  const context = { log: Object.assign(() => {}, { error() {}, warn() {} }), res: null };
  await crmFn(context, { method, params: { action }, query, body, headers: {} });
  return context.res;
}

(async () => {
  // --- the order manager ---
  // 已收款 on the family's word: commission 10% of the list price of the seated line only (the waitlisted one does
  // not count), the history entry says Hive confirmed on the provider's behalf, the family is told.
  let r = await call({ action: "order", method: "PATCH", body: { orderId: "FC-20261020-KXC-001", status: "paid", note: "微信截图核对" } });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.deepStrictEqual([r.body.order.status, r.body.order.commission.rate, r.body.order.commission.base, r.body.order.commission.amount], ["paid", 0.1, 1200, 120]);
  assert.strictEqual(r.body.order.history.slice(-1)[0].via, "hive", "the manager marked it paid, not the provider");
  assert.ok(store["FC-20261020-KXC-001"].commission.at, "written on the order");
  assert.strictEqual(sent.slice(-1)[0].emailTo, "fc-20261020-kxc-001@gmail.com");
  assert.ok(/已收到课程费/.test(sent.slice(-1)[0].emailSubject || ""), "family notice: " + sent.slice(-1)[0].emailSubject);

  // the child named on the family's behalf; cleared again with no name; an unknown line is 404
  r = await call({ action: "order", method: "PATCH", body: { orderId: "FC-20261020-KXC-002", code: "KXC-SCI-7", child: { name: " 小明 ", grade: "7" } } });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.deepStrictEqual(store["FC-20261020-KXC-002"].items[0].child, { name: "小明", grade: "7", account: "" });
  assert.ok(/小明/.test(store["FC-20261020-KXC-002"].history.slice(-1)[0].note));
  assert.strictEqual(store["FC-20261020-KXC-002"].status, "contacted", "naming is not a status change");
  r = await call({ action: "order", method: "PATCH", body: { orderId: "FC-20261020-KXC-002", code: "KXC-NOPE", child: { name: "x" } } });
  assert.strictEqual(r.status, 404);
  r = await call({ action: "order", method: "PATCH", body: { orderId: "FC-20261020-KXC-002", code: "KXC-SCI-7", child: null } });
  assert.strictEqual(store["FC-20261020-KXC-002"].items[0].child, null);

  // the proof: the manager (orders rw ⇒ read) gets the bytes; a bad index is 404
  r = await call({ action: "proof", query: { orderId: "FC-20261020-KXC-001", i: "1" } });
  assert.ok(r.status === 200 && r.isRaw && r.body.toString() === "PNG!" && r.headers["Content-Type"] === "image/png", JSON.stringify(r.body));
  r = await call({ action: "proof", query: { orderId: "FC-20261020-KXC-001", i: "2" } });
  assert.strictEqual(r.status, 404);
  assert.strictEqual(audits.filter((a) => a.action === "crm.order.child").length, 2);

  // --- a provider's leader (no CRM level) ---
  who = { user: "head@kxc.edu", roles: ["domain_leader:kxc.edu"] };
  r = await call({ action: "orders" });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.ok(r.body.orders.every((o) => o.orderId.includes("-KXC-")), "its own hive's orders only");
  r = await call({ action: "proof", query: { orderId: "FC-20261020-KXC-001", i: "1" } });
  assert.strictEqual(r.status, 200, "the provider sees the family's proof");
  r = await call({ action: "proof", query: { orderId: "FC-20261020-OTH-004", i: "1" } });
  assert.strictEqual(r.status, 404, "another hive's order does not exist for it");
  r = await call({ action: "people" });
  assert.strictEqual(r.status, 403, "nothing beyond the order actions");
  // 已收款 by the provider itself: commission written, no `via`
  store["FC-20261020-KXC-002"].status = "parent_paid"; store["FC-20261020-KXC-002"].history.push({ at: T0, by: "family", from: "contacted", to: "parent_paid", note: "" });
  r = await call({ action: "order", method: "PATCH", body: { orderId: "FC-20261020-KXC-002", status: "paid" } });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.strictEqual(r.body.order.commission.amount, 80);
  assert.strictEqual(r.body.order.history.slice(-1)[0].via, undefined);

  // 整期停开: its own course only, a reason required; every live order holding the line loses it, the order whose
  // only line it was is cancelled, each family gets one email, the paid order with another line stays paid
  r = await call({ action: "cancel-term", method: "POST", body: { code: "OTH-ART-7", reason: "x" } });
  assert.strictEqual(r.status, 404, "not its course");
  r = await call({ action: "cancel-term", method: "POST", body: { code: "KXC-SCI-7" } });
  assert.strictEqual(r.status, 400);
  const before = sent.length;
  r = await call({ action: "cancel-term", method: "POST", body: { code: "KXC-SCI-7", reason: "报名不足" } });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.deepStrictEqual(r.body.cancelled.sort(), ["FC-20261020-KXC-001", "FC-20261020-KXC-002", "FC-20261020-KXC-003"]);
  assert.strictEqual(store["FC-20261020-KXC-002"].status, "cancelled", "its only line is gone");
  assert.strictEqual(store["FC-20261020-KXC-001"].status, "paid", "the maths line keeps the order alive");
  assert.deepStrictEqual(store["FC-20261020-KXC-001"].items.map((it) => !!it.cancelled), [false, true]);
  assert.strictEqual(store["FC-20261020-KXC-001"].items[1].cancelled.reason, "报名不足");
  assert.strictEqual(store["FC-20261020-OTH-004"].items[0].cancelled, undefined, "another hive untouched");
  assert.strictEqual(sent.length - before, 3, "one notice per family");
  assert.ok(sent.slice(before).every((m) => /已取消/.test(m.emailSubject || "")), sent.slice(before).map((m) => m.emailSubject).join(" | "));
  assert.ok(sent.slice(before).some((m) => /仅 KXC-SCI-7/.test(m.emailBodyText || "")), "a partial cancellation names the line");
  r = await call({ action: "cancel-term", method: "POST", body: { code: "KXC-SCI-7", reason: "again" } });
  assert.deepStrictEqual(r.body.cancelled, [], "nothing left to cancel");
  // the roster no longer lists the cancelled line
  r = await call({ action: "classes" });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  const sci = r.body.classes.find((c) => c.code === "KXC-SCI-7");
  assert.ok(!sci || sci.orders.length === 0, "cancelled lines are off the roster");
  assert.ok(r.body.classes.every((c) => c.code.startsWith("KXC-")), "its own courses only");

  // --- a masked reader (curriculum): proof and amounts withheld ---
  who = { user: "cur@fengchao.life", roles: ["staff:curriculum"] };
  r = await call({ action: "proof", query: { orderId: "FC-20261020-KXC-001", i: "1" } });
  assert.strictEqual(r.status, 403, "masked readers never see the proof");
  r = await call({ action: "order", query: { id: "FC-20261020-KXC-001" } });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.order.commission.amount, null, "commission masked with the money");
  r = await call({ action: "cancel-term", method: "POST", body: { code: "KXC-MATH-7", reason: "x" } });
  assert.strictEqual(r.status, 403);

  console.log("crm-orders-api tests passed");
})().catch((err) => { console.error(err); process.exit(1); });
