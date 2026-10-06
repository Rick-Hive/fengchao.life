// The CRM module's foundations (api/shared/crm.js, api/shared/emailTier.js).
//
// Run with:  node test/crm.test.js
//
// The permission matrix of the design doc (§4, decisions 5 and 6), the order
// status flow with its fulfilment record and overdue rules (§6, decision 18),
// server-side masking, and the email security tiers (§3, decision 13).
const assert = require("assert");
const path = require("path");
const Module = require("module");

// No storage in tests: the blob SDK is stubbed out, the store functions throw.
const realResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (request === "@azure/storage-blob") return "@azure/storage-blob";
  return realResolve.call(this, request, parent, ...rest);
};
require.cache["@azure/storage-blob"] = { id: "@azure/storage-blob", filename: "@azure/storage-blob", loaded: true, exports: { BlobServiceClient: { fromConnectionString() { throw new Error("no storage in test"); } } } };
delete process.env.STORAGE_CONNECTION_STRING;
delete process.env.EMAIL_REPLACE_DOMAINS;
delete process.env.EMAIL_SAFE_DOMAINS;

const C = require(path.join(__dirname, "..", "api", "shared", "crm.js"));
const E = require(path.join(__dirname, "..", "api", "shared", "emailTier.js"));

// ---- permission matrix ----------------------------------------------------
assert.strictEqual(C.access([], "orders"), "none", "ordinary users and domain admins hold no CRM level");
assert.strictEqual(C.access(["domain_it:a.edu", "domain_hive:a.edu"], "identity"), "none", "decision 5: a school's admin sees nothing of the CRM");
assert.strictEqual(C.access(["staff:sales"], "orders"), "rw");
assert.strictEqual(C.access(["staff:sales"], "money"), "read", "the order manager sees payment status, not royalties (decision 6 is enforced on the royalty field)");
assert.strictEqual(C.access(["staff:finance"], "money"), "rw");
assert.strictEqual(C.access(["staff:finance"], "identity"), "masked");
assert.strictEqual(C.access(["staff:ceo"], "system"), "read", "the CEO reads everything and changes nothing");
assert.strictEqual(C.access(["staff:ceo"], "identity"), "read");
assert.strictEqual(C.access(["staff:curriculum"], "catalogue"), "rw");
assert.strictEqual(C.access(["staff:community"], "leads"), "rw");
assert.strictEqual(C.access(["staff:partnership"], "partners"), "rw");
assert.strictEqual(C.access(["staff:fundraising"], "partners"), "rw", "the old name maps to partnership");
assert.strictEqual(C.access(["admin"], "system"), "rw");
assert.strictEqual(C.access(["staff:consultant"], "identity"), "read", "the education consultant sees people");
assert.strictEqual(C.access(["staff:consultant"], "money"), "none", "…but no money");
assert.strictEqual(C.access(["staff:sales", "staff:community"], "leads"), "rw", "several functions: the union");
assert.strictEqual(C.access(["staff:sales", "staff:community"], "orders"), "rw");
assert.ok(C.atLeast(["staff:ceo"], "orders", "read") && !C.atLeast(["staff:ceo"], "orders", "rw"));
assert.deepStrictEqual(Object.keys(C.accessMap(["staff:sales"])), C.DOMAINS);
for (const fn of Object.keys(C.MATRIX)) for (const d of C.DOMAINS) assert.ok(C.LEVELS.includes(C.MATRIX[fn][d]), `matrix ${fn}.${d} is a level`);

// ---- order record and status flow ----------------------------------------
const wire = {
  orderId: "FC-20261006-KXC-001", submittedAt: "2026-10-06T02:00:00.000Z", email: "Parent@Gmail.com", teamsAccount: "", lang: "zh",
  track: { trackId: 2, name: "x", nameZh: "国内", nameEn: "Domestic" },
  items: [{ code: "KXC-MATH-7", nameZh: "数学", nameEn: "Math", price: 1200, priceTbd: false, schoolName: "KXC", schoolAbbr: "KXC", classType: "直播课 / Live", language: "中文 / Chinese", grades: ["G7"], teachers: ["T"] }],
  routes: [{ hiveKey: "kxc", schoolName: "KXC", schoolAbbr: "KXC", itemCount: 1, subtotal: 1200, teamsChannelId: "19:abc" }],
  itemCount: 1, totalPrice: 1200, currency: "CNY", snapshotGeneratedAt: "2026-10-05T00:00:00Z",
  emailHtml: "<p>should not be stored</p>", notifyText: "nor this",
};
const rec = C.orderRecord(wire, { ok: true, at: wire.submittedAt });
assert.strictEqual(rec.status, "submitted");
assert.strictEqual(rec.source, "hive");
assert.strictEqual(rec.history.length, 1);
assert.strictEqual(rec.history[0].to, "submitted");
assert.ok(!("emailHtml" in rec) && !("notifyText" in rec), "rendered messages are not stored");
assert.strictEqual(rec.hives[0].abbr, "KXC");
assert.strictEqual(rec.items[0].price, 1200);
assert.strictEqual(rec.crmId, null);

// Transitions: submitted → confirmed → paid → started; cancelled from any live state; terminal states stay.
const sales = ["staff:sales"];
const t1 = C.transition(rec, "confirmed", "om@bes", "提供方接单", sales, "2026-10-07T00:00:00Z");
assert.strictEqual(t1.status, "confirmed");
assert.strictEqual(t1.history.length, 2);
assert.deepStrictEqual(t1.history[1], { at: "2026-10-07T00:00:00.000Z", by: "om@bes", from: "submitted", to: "confirmed", note: "提供方接单" });
assert.strictEqual(rec.status, "submitted", "the original is not mutated");
assert.throws(() => C.transition(rec, "paid", "om@bes", "", sales), /cannot go from submitted to paid/);
assert.throws(() => C.transition(rec, "submitted", "om@bes", "", sales), /cannot go/);
const t2 = C.transition(t1, "paid", "om@bes", "", sales);
const t3 = C.transition(t2, "started", "om@bes", "", sales);
assert.deepStrictEqual(C.nextStatuses(t3.status, sales), [], "started is terminal");
const tc = C.transition(t2, "cancelled", "om@bes", "家长取消", sales);
assert.deepStrictEqual(C.nextStatuses(tc.status, sales), [], "cancelled is terminal for the order manager");
assert.deepStrictEqual(C.nextStatuses(tc.status, ["admin"]), ["submitted"], "…but the system administrator may reopen one");
assert.deepStrictEqual(C.nextStatuses("submitted", sales), ["confirmed", "cancelled"]);
try { C.transition(rec, "started", "x", "", sales); assert.fail("should throw"); } catch (e) { assert.strictEqual(e.code, "bad_transition"); assert.deepStrictEqual(e.allowed, ["confirmed", "cancelled"]); }

// Overdue (decision 18): submitted > 7 days, confirmed > 14, paid > 30; measured from the last change.
const day = 24 * 3600 * 1000;
const t0 = Date.parse("2026-10-06T02:00:00.000Z");
assert.strictEqual(C.overdue(rec, t0 + 7 * day), null, "7 days is not yet overdue");
assert.deepStrictEqual(C.overdue(rec, t0 + 8 * day), { rule: "submitted", days: 8, limit: 7 });
assert.strictEqual(C.overdue(t1, t0 + 8 * day), null, "confirmed on day 1: 7 days since the change");
assert.deepStrictEqual(C.overdue(t1, Date.parse("2026-10-07T00:00:00Z") + 15 * day), { rule: "confirmed", days: 15, limit: 14 });
assert.strictEqual(C.overdue(t3, t0 + 400 * day), null, "started never goes overdue");
assert.strictEqual(C.overdue(tc, t0 + 400 * day), null, "nor cancelled");

// Masking: contact details need identity ≥ read, amounts need money ≥ read.
const full = C.mask(t1, C.accessMap(["staff:sales"]));
assert.strictEqual(full, t1, "the order manager gets the record untouched");
const fin = C.mask(t1, C.accessMap(["staff:finance"]));
assert.strictEqual(fin.email, "…@gmail.com", "finance: contact details masked");
assert.strictEqual(fin.totalPrice, 1200, "finance: amounts shown");
assert.strictEqual(fin.history[1].note, "提供方接单", "finance reads orders, so the notes stay");
const cur = C.mask(t1, C.accessMap(["staff:curriculum"]));
assert.strictEqual(cur.email, "…@gmail.com");
assert.strictEqual(cur.totalPrice, null, "the curriculum director sees no amounts");
assert.strictEqual(cur.items[0].price, null);
assert.strictEqual(cur.hives[0].subtotal, null);
assert.strictEqual(cur.history[1].note, "", "orders only masked: notes hidden");
const com = C.mask(t1, C.accessMap(["staff:community"]));
assert.strictEqual(com.email, "Parent@Gmail.com", "the community manager sees contact details");
assert.strictEqual(com.totalPrice, null, "…but no amounts");
assert.strictEqual(t1.email, "Parent@Gmail.com", "masking never mutates the stored record");

// Ids: only the shapes api/order mints reach blob names.
assert.ok(C.ID_RE.test("FC-20260831-KXC-001") && C.ID_RE.test("FC-20260831-001") && C.ID_RE.test("FC-20260831-MULTI-X7Q2") && C.ID_RE.test("FC-20260831-蜂巢-003"));
assert.ok(!C.ID_RE.test("../roles") && !C.ID_RE.test("FC-2026-1") && !C.ID_RE.test("fc-20260831-kxc-001"));
assert.strictEqual(C.blobName("FC-20260831-KXC-001"), "crm/orders/FC-20260831-KXC-001.json");
assert.throws(() => C.blobName("x/../y"), /bad order id/);

// ---- email tiers ----------------------------------------------------------
assert.strictEqual(E.tier("a@gmail.com"), "safe");
assert.strictEqual(E.tier("A@QQ.COM"), "replace");
assert.strictEqual(E.tier("a@vip.qq.com"), "replace");
assert.strictEqual(E.tier("a@163.com"), "replace");
assert.strictEqual(E.tier("a@school.edu.cn"), "replace", "every .cn domain");
assert.strictEqual(E.tier("a@yahoo.com"), "safe");
assert.strictEqual(E.tier("a@yahoo.cn"), "replace");
assert.strictEqual(E.tier(""), "missing");
assert.strictEqual(E.tier("not-an-email"), "missing");
assert.strictEqual(E.tier("a@kxc.edu.cn", { whitelist: ["kxc.edu.cn"] }), "safe", "decision 13: a whitelist overrides the .cn rule");
assert.strictEqual(E.tier("a@sciencebug.net", { tenantDomains: ["sciencebug.net"] }), "safe");
assert.strictEqual(E.normalizeEmail("  Someone@163.COM (deleted) "), "someone@163.com", "Airtable's (deleted) suffix is stripped before matching");
assert.deepStrictEqual(E.primaryEmail("a@gmail.com", "a@equipme.cloud"), { email: "a@gmail.com", tier: "safe", viaTeams: false });
assert.deepStrictEqual(E.primaryEmail("a@qq.com", "a@equipme.cloud"), { email: "a@equipme.cloud", tier: "safe", viaTeams: true }, "the Teams account stands in for an insecure mailbox");
assert.deepStrictEqual(E.primaryEmail("a@qq.com", ""), { email: "a@qq.com", tier: "replace", viaTeams: false }, "no Teams account yet: the mainland address stays, flagged");
assert.deepStrictEqual(E.primaryEmail("", ""), { email: "", tier: "missing", viaTeams: false });
assert.ok(/^IF\(\{Email\} = ""/.test(E.airtableFormula("Email")) && E.airtableFormula("Email").includes('"@qq.com"'));
process.env.EMAIL_REPLACE_DOMAINS = "example.org";
assert.strictEqual(E.tier("a@example.org"), "replace", "the list is configuration");
assert.strictEqual(E.tier("a@qq.com"), "safe", "a configured list replaces the default one entirely");
assert.strictEqual(E.tier("a@x.cn"), "replace", "the .cn rule is not configuration");

console.log("crm: all assertions passed");
