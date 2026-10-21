// POST /api/order (stage 2, 2026-10-21): a submission spanning hives becomes one order per hive, sharing a submission
// id; every item carries its child; one flow call carries every hive's route and one family email listing all orders.
const assert = require("assert");
const path = require("path");
const Module = require("module");
const realResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) { if (request === "@azure/storage-blob") return "@azure/storage-blob"; return realResolve.call(this, request, parent, ...rest); };
require.cache["@azure/storage-blob"] = { id: "@azure/storage-blob", filename: "@azure/storage-blob", loaded: true, exports: { BlobServiceClient: { fromConnectionString() { throw new Error("no storage in tests"); } } } };
delete process.env.STORAGE_CONNECTION_STRING; delete process.env.SELECTION_FEE_CENTS;
process.env.POWER_AUTOMATE_URL = "https://flow.example/trigger";
const R = (...p) => path.join(__dirname, "..", ...p);

const snapshot = {
  generatedAt: "2026-10-21T00:00:00Z",
  tracks: [{ trackId: 1, nameZh: "国际·古典", nameEn: "International: Classical" }],
  courses: [
    { id: "recA", code: "KXC-MATH-HS-101", nameEn: "Geometry", nameZh: "几何", price: 2400, grades: ["G9"], subjects: [], teachers: ["Zhang"], school: { name: "KXC School", abbr: "KXC" } },
    { id: "recB", code: "BES-SCI-MS-201", nameEn: "Life Science", nameZh: "生命科学", price: 1800, grades: ["G7"], subjects: [], teachers: [], school: { name: "BES School", abbr: "BES" } },
    { id: "recC", code: "KXC-ENG-HS-102", nameEn: "Writing", nameZh: "写作", price: null, grades: ["G9"], subjects: [], teachers: [], school: { name: "KXC School", abbr: "KXC" } },
  ],
  private: { schoolRouting: { KXC: { name: "KXC School", abbr: "KXC", teamsChannelId: "19:kxc", notifyEmail: "kxc@x.org" }, BES: { name: "BES School", abbr: "BES", teamsChannelId: "19:bes" } } },
};
const blob = require(R("api", "shared", "blob.js"));
blob.readSnapshot = async () => snapshot;
let seq = 0; blob.nextSequence = async () => ++seq;
const crm = require(R("api", "shared", "crm.js"));
const store = {};
crm.writeOrder = async (o, etag) => { store[o.orderId] = JSON.parse(JSON.stringify(o)); };
crm.readOrder = async (id) => (store[id] ? { order: store[id], etag: "e" } : null);
crm.listOrders = async () => Object.values(store);
const flowCalls = [];
global.fetch = async (url, opts) => { flowCalls.push({ url, body: JSON.parse(opts.body) }); return { ok: true, status: 202, text: async () => "" }; };
const handler = require(R("api", "order", "index.js"));
const ctx = () => ({ log: Object.assign(() => {}, { warn() {}, error() {} }), res: null });
const principal = (upn) => Buffer.from(JSON.stringify({ identityProvider: "aad", userId: "x", userDetails: upn, userRoles: ["authenticated"] })).toString("base64");
const post = async (body, upn) => { const c = ctx(); await handler(c, { method: "POST", headers: Object.assign({ "x-forwarded-for": "203.0.113.9" }, upn ? { "x-ms-client-principal": principal(upn) } : {}), body }); return c.res; };

(async () => {
  // a course without a child is refused before anything is stored
  let r = await post({ email: "parent@gmail.com", trackId: 1, courseIds: ["recA"], lang: "zh", children: {} });
  assert.deepStrictEqual([r.status, r.body.error, r.body.courseIds], [400, "missing_child", ["recA"]]);
  assert.strictEqual(Object.keys(store).length, 0);

  // three courses from two hives → two orders, one submission, one flow call
  r = await post({ email: "parent@gmail.com", teamsAccount: "", trackId: 1, courseIds: ["recA", "recB", "recC"], lang: "zh", children: { recA: { name: "张小明", grade: "9" }, recB: { name: "张小红", grade: "7", account: "xiaohong@bes.edu" }, recC: { name: "张小明", grade: "9" } } });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.strictEqual(r.body.orderIds.length, 2, "one order per hive");
  assert.ok(/^FC-\d{8}-KXC-001$/.test(r.body.orderIds[0]) && /^FC-\d{8}-BES-002$/.test(r.body.orderIds[1]), "each hive's own id: " + r.body.orderIds);
  assert.ok(/^FS-\d{8}-[A-Z0-9]{5}$/.test(r.body.submission) && r.body.orderId === r.body.orderIds[0]);
  assert.deepStrictEqual([r.body.itemCount, r.body.totalPrice], [3, 4200], "the response totals the whole submission");
  const kxc = store[r.body.orderIds[0]], bes = store[r.body.orderIds[1]];
  assert.ok(kxc && bes && kxc.submission === bes.submission && kxc.submission === r.body.submission, "the records share the submission");
  assert.deepStrictEqual(kxc.items.map((i) => i.code), ["KXC-MATH-HS-101", "KXC-ENG-HS-102"]);
  assert.deepStrictEqual([kxc.totalPrice, bes.totalPrice, kxc.itemCount, bes.itemCount], [2400, 1800, 2, 1], "each order totals its own courses");
  assert.deepStrictEqual(kxc.items[0].child, { name: "张小明", grade: "9", account: "" });
  assert.deepStrictEqual(bes.items[0].child, { name: "张小红", grade: "7", account: "xiaohong@bes.edu" }, "the child rides on the record");
  assert.deepStrictEqual([kxc.hives[0].abbr, bes.hives[0].abbr, kxc.status, bes.status], ["KXC", "BES", "submitted", "submitted"]);
  assert.strictEqual(flowCalls.length, 1, "one flow call per submission");
  const wire = flowCalls[0].body;
  assert.strictEqual(wire.routes.length, 2, "a route per hive");
  assert.deepStrictEqual(wire.routes.map((x) => x.teamsChannelId), ["19:kxc", "19:bes"]);
  assert.ok(/KXC-001/.test(wire.routes[0].notifyText) && !/BES-002/.test(wire.routes[0].notifyText), "each hive's Teams notice carries its own order number only");
  assert.ok(/BES-002/.test(wire.routes[1].notifyText) && /张小红/.test(wire.routes[1].notifyText) && /7 年级|· 7/.test(wire.routes[1].notifyText), "…and names the child");
  assert.ok(wire.emailHtml.indexOf(r.body.orderIds[0]) >= 0 && wire.emailHtml.indexOf(r.body.orderIds[1]) >= 0 && /几何/.test(wire.emailHtml) && /生命科学/.test(wire.emailHtml), "the one family email lists both orders and all courses");
  assert.strictEqual(wire.orderId, r.body.orderIds.join(" / "));
  assert.strictEqual(typeof wire.items[0].name, "string", "the trigger's schema still sees `name`");
  assert.ok(store[r.body.orderIds[0]].notify.ok && store[r.body.orderIds[1]].notify.ok, "the notification result is written on both records");

  // a single hive: one order, as before, the id untouched by the split
  flowCalls.length = 0;
  r = await post({ email: "parent@gmail.com", trackId: 1, courseIds: ["recA"], lang: "en", children: { recA: { name: "Ming" } } }, "Parent@BES.qiaoliang.online");
  assert.deepStrictEqual([r.status, r.body.orderIds.length, store[r.body.orderId].account, store[r.body.orderId].items[0].child.name], [200, 1, "parent@bes.qiaoliang.online", "Ming"]);
  assert.ok(!/Order FC-.*\n.*Order FC-/.test(flowCalls[0].body.emailBodyText), "one hive: no per-order sections");
  assert.ok(/student: Ming/.test(flowCalls[0].body.emailBodyText), "the child in the family's English email");
  console.log("order-split: all assertions passed");
})().catch((e) => { console.error(e); process.exit(1); });
