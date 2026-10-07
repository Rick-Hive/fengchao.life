// 待处理与异常 digest (api/shared/digest.js): what is collected, how it reads, who
// gets it, how it is handed to the flow, and when it is not sent.
//
// Run with:  node test/digest.test.js
const assert = require("assert");
const path = require("path");
const Module = require("module");

const realResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (request === "@azure/storage-blob") return "@azure/storage-blob";
  return realResolve.call(this, request, parent, ...rest);
};
let lastDoc = null;
require.cache["@azure/storage-blob"] = { id: "@azure/storage-blob", filename: "@azure/storage-blob", loaded: true, exports: { BlobServiceClient: { fromConnectionString: () => ({ getContainerClient: () => ({ createIfNotExists: async () => {}, getBlockBlobClient: () => ({ exists: async () => !!lastDoc, downloadToBuffer: async () => Buffer.from(JSON.stringify(lastDoc)), upload: async (body) => { lastDoc = JSON.parse(body); } }) }) }) } } };
process.env.STORAGE_CONNECTION_STRING = "UseDevelopmentStorage=true";
// roles.json: the order manager holds staff:sales
const rolesPath = require.resolve(path.join(__dirname, "..", "api", "shared", "roles.js"));
const realRoles = require(rolesPath);
require.cache[rolesPath].exports = Object.assign({}, realRoles, { readRoles: async () => ({ entries: [{ user: "obadiah.sun@equipme.cloud", roles: ["staff:sales"] }, { user: "rick@bes", roles: ["staff:sysadmin", "admin"] }] }) });

const crm = require(path.join(__dirname, "..", "api", "shared", "crm.js"));
const hub = require(path.join(__dirname, "..", "api", "shared", "hub.js"));
const D = require(path.join(__dirname, "..", "api", "shared", "digest.js"));

const now = Date.parse("2026-10-08T00:00:00Z");
const mk = (id, status, at, extra) => Object.assign({ orderId: id, status, submittedAt: at, email: "p@gmail.com", totalPrice: 2100, hives: [{ abbr: "KXC" }], history: [{ at, to: status }], notify: { ok: true } }, extra || {});
crm.listOrders = async () => [
  mk("FC-20260920-KXC-001", "submitted", "2026-09-20T00:00:00Z"),            // 18 days submitted → overdue (limit 7)
  mk("FC-20261006-KXC-002", "submitted", "2026-10-06T00:00:00Z"),            // within limit
  mk("FC-20260901-KXC-003", "paid", "2026-09-01T00:00:00Z"),                 // 37 days paid → overdue (30)
  mk("FC-20261005-KXC-004", "confirmed", "2026-10-05T00:00:00Z", { notify: { ok: false, error: "HTTP 502" } }),
  mk("FC-20260801-KXC-005", "cancelled", "2026-08-01T00:00:00Z"),
];
hub.readHub = async () => ({ people: [{ primaryTier: "replace", orders: 2 }, { primaryTier: "replace", orders: 0 }, { primaryTier: "safe", orders: 1 }], queue: [{}, {}], stats: { writeBack: 5 } });

(async () => {
  const d = await D.collect(now);
  assert.deepStrictEqual(d.overdue.map((o) => [o.orderId, o.days]), [["FC-20260901-KXC-003", 37], ["FC-20260920-KXC-001", 18]], "overdue, longest first");
  assert.deepStrictEqual(d.notifyFailed.map((o) => o.orderId), ["FC-20261005-KXC-004"]);
  assert.strictEqual(d.submitted, 1, "the one still within its limit");
  assert.strictEqual(d.queue, 2);
  assert.strictEqual(d.replace, 2); assert.strictEqual(d.replaceWithOrders, 1); assert.strictEqual(d.writeBack, 5);
  assert.strictEqual(d.total, 5, "overdue 2 + notify failed 1 + queue 2");

  const m = D.compose(d, "2026-10-08");
  assert.ok(/待处理 5 项/.test(m.subject) && /5 to do/.test(m.subject), m.subject);
  assert.ok(/超期订单 2 单/.test(m.text) && /FC-20260901-KXC-003 · 已付款 \/ paid · 37 天/.test(m.text), m.text);
  assert.ok(/通知失败 1 单/.test(m.text) && /HTTP 502/.test(m.text));
  assert.ok(/待合并的人员配对 2 对/.test(m.text) && /待替换邮箱 2 人（其中有订单 1 人）；待回写 CRM ID 5/.test(m.text));
  assert.ok(/fengchao\.life\/management\/#\/ops\/orders/.test(m.text));
  assert.ok(!/<script/.test(m.html) && /<div>/.test(m.html));

  assert.deepStrictEqual(await D.recipients(), ["obadiah.sun@equipme.cloud"], "the staff:sales account(s), not the sysadmin");
  process.env.CRM_DIGEST_TO = "a@x.com, B@x.com";
  assert.deepStrictEqual(await D.recipients(), ["a@x.com", "b@x.com"], "CRM_DIGEST_TO replaces");
  delete process.env.CRM_DIGEST_TO;

  // Sending: the flow receives an order-shaped payload with one route to the channel and the email to the manager.
  await assert.rejects(() => D.send(d, {}), (e) => e.code === "no_flow");
  process.env.POWER_AUTOMATE_URL = "https://flow.example/x";
  process.env.DEFAULT_TEAMS_CHANNEL_ID = "19:abc@thread.tacv2";
  const calls = [];
  global.fetch = async (url, init) => { calls.push({ url, body: JSON.parse(init.body), headers: init.headers }); return { ok: true, status: 202 }; };
  const r = await D.send(d, {});
  assert.strictEqual(r.ok, true);
  const p = calls[0].body;
  assert.strictEqual(p.emailTo, "obadiah.sun@equipme.cloud");
  assert.strictEqual(p.routes.length, 1); assert.strictEqual(p.routes[0].teamsChannelId, "19:abc@thread.tacv2");
  assert.strictEqual(p.routes[0].notifyText, m.text.split("2026-10-08").join(new Date().toISOString().slice(0, 10)));
  assert.strictEqual(p.items.length, 0); assert.strictEqual(p.totalPrice, 0); assert.ok(/^DIGEST-\d{8}$/.test(p.orderId));
  assert.strictEqual(p.digest, true);

  // run(): sends once a day when there is something; nothing to do → not sent; force → sent again.
  lastDoc = null; calls.length = 0;
  const r1 = await D.run({}); assert.strictEqual(r1.sent, true); assert.strictEqual(calls.length, 1); assert.ok(lastDoc && lastDoc.total === 5);
  const r2 = await D.run({}); assert.strictEqual(r2.sent, false); assert.strictEqual(r2.reason, "already_today"); assert.strictEqual(calls.length, 1);
  const r3 = await D.run({ force: true }); assert.strictEqual(r3.sent, true); assert.strictEqual(calls.length, 2);
  hub.readHub = async () => ({ people: [], queue: [], stats: {} });
  crm.listOrders = async () => [mk("FC-20261006-KXC-002", "submitted", new Date().toISOString())];
  lastDoc = null;
  const r4 = await D.run({}); assert.strictEqual(r4.sent, false); assert.strictEqual(r4.reason, "nothing_to_do");
  console.log("digest: all assertions passed");
})().catch((e) => { console.error(e); process.exit(1); });
