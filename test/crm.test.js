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
assert.strictEqual(C.access(["staff:contractor"], "catalogue"), "none", "contractor was deleted (2026-10-13): no row, no level");
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
// enrollment rules (2026-10-20): waitlist and prerequisite flags travel into the record; a waitlisted item keeps its plain names
{
  const w2 = Object.assign({}, wire, { items: [Object.assign({}, wire.items[0], { waitlist: true, baseNameZh: "数学", baseNameEn: "Math", nameZh: "数学（候补）", nameEn: "Math (waitlist)", prereq: { text: "KXC-MATH-6 Math 6 / 六年级数学", codes: ["KXC-MATH-6"], met: "confirmed" } })] });
  const r2 = C.orderRecord(w2, { ok: true, at: wire.submittedAt });
  assert.deepStrictEqual([r2.items[0].waitlist, r2.items[0].nameZh, r2.items[0].nameEn, r2.items[0].prereq], [true, "数学", "Math", { text: "KXC-MATH-6 Math 6 / 六年级数学", codes: ["KXC-MATH-6"], met: "confirmed" }]);
  assert.deepStrictEqual([rec.items[0].waitlist, rec.items[0].prereq], [false, null], "an ordinary item carries no flags");
}
// the account, the submission and the fee (design 2026-10-20): an anonymous website order carries none of them
assert.deepStrictEqual([rec.account, rec.submission, rec.fee], ["", "FC-20261006-KXC-001", null]);
{
  const r3 = C.orderRecord(Object.assign({}, wire, { account: "Parent@BES.qiaoliang.online", submission: "FS-20261006-ABCDE", fee: { amount: 100, currency: "usd", status: "unpaid", stripeSessionId: null, paymentIntentId: null, paidAt: null, receiptUrl: null, coupon: null } }), { ok: true, at: wire.submittedAt });
  assert.deepStrictEqual([r3.account, r3.submission, r3.fee.amount, r3.fee.status], ["parent@bes.qiaoliang.online", "FS-20261006-ABCDE", 100, "unpaid"], "a signed-in order is filed under the account, lower-cased");
}
{
  const fee = require("../api/shared/fee.js");
  delete process.env.SELECTION_FEE_CENTS;
  assert.strictEqual(fee.selectionFee(), null, "no fee until SELECTION_FEE_CENTS is set");
  assert.strictEqual(fee.feeRecord(fee.selectionFee()), null);
  process.env.SELECTION_FEE_CENTS = "100";
  assert.deepStrictEqual(fee.selectionFee(), { amount: 100, currency: "usd" });
  assert.strictEqual(fee.feeRecord(fee.selectionFee()).status, "unpaid");
  delete process.env.SELECTION_FEE_CENTS;
}

// Transitions (stage 2, 2026-10-21): submitted → contacted → parent_paid → paid → started; cancelled from any live
// state; terminal states stay. `confirmed` from the first flow reads as contacted.
const sales = ["staff:sales"];
const t1 = C.transition(rec, "contacted", "om@bes", "提供方已联系", sales, "2026-10-07T00:00:00Z");
assert.strictEqual(t1.status, "contacted");
assert.strictEqual(t1.history.length, 2);
assert.deepStrictEqual(t1.history[1], { at: "2026-10-07T00:00:00.000Z", by: "om@bes", from: "submitted", to: "contacted", note: "提供方已联系" });
assert.strictEqual(rec.status, "submitted", "the original is not mutated");
assert.throws(() => C.transition(rec, "started", "om@bes", "", sales), /cannot go from submitted to started/);
assert.throws(() => C.transition(rec, "submitted", "om@bes", "", sales), /cannot go/);
const tp = C.transition(t1, "parent_paid", "parent@gmail.com", "", [], null, ["parent_paid"]);
assert.strictEqual(tp.status, "parent_paid", "the family's own step, through the explicit allowance");
const t2 = C.transition(tp, "paid", "om@bes", "", sales);
const t3 = C.transition(t2, "started", "om@bes", "", sales);
assert.deepStrictEqual(C.nextStatuses(t3.status, sales), [], "started is terminal");
const tc = C.transition(t2, "cancelled", "om@bes", "家长取消", sales);
assert.deepStrictEqual(C.nextStatuses(tc.status, sales), [], "cancelled is terminal for the order manager");
assert.deepStrictEqual(C.nextStatuses(tc.status, ["admin"]), ["submitted"], "…but the system administrator may reopen one");
assert.deepStrictEqual(C.nextStatuses("submitted", sales), ["contacted", "parent_paid", "paid", "cancelled"], "the order manager may skip steps the provider reports by phone");
assert.deepStrictEqual(C.nextStatuses("confirmed", sales), ["parent_paid", "paid", "cancelled"], "an old `confirmed` record continues as contacted");
assert.deepStrictEqual(C.providerNext("submitted"), ["contacted", "paid", "cancelled"], "the provider never records the family's step for it");
assert.deepStrictEqual(C.providerNext("expired"), []);
assert.strictEqual(C.statusOf({ status: "confirmed" }), "contacted");
try { C.transition(rec, "started", "x", "", sales); assert.fail("should throw"); } catch (e) { assert.strictEqual(e.code, "bad_transition"); assert.deepStrictEqual(e.allowed, ["contacted", "parent_paid", "paid", "cancelled"]); }

// Expiry (v3: 14 days from the LAST step while submitted / contacted; +14 days per extension) and overdue reminders
// (submitted 3, contacted 14, parent_paid 7, paid 30 days since the last change).
const day = 24 * 3600 * 1000;
const t0 = Date.parse("2026-10-06T02:00:00.000Z");
assert.strictEqual(C.overdue(rec, t0 + 3 * day), null, "3 days is not yet overdue");
assert.deepStrictEqual(C.overdue(rec, t0 + 4 * day), { rule: "submitted", days: 4, limit: 3 });
assert.strictEqual(C.overdue(t1, t0 + 8 * day), null, "contacted on day 1: 7 days since the change");
assert.deepStrictEqual(C.overdue(t1, Date.parse("2026-10-07T00:00:00Z") + 15 * day), { rule: "contacted", days: 15, limit: 14 });
assert.deepStrictEqual(C.overdue(Object.assign({}, t1, { status: "confirmed" }), Date.parse("2026-10-07T00:00:00Z") + 15 * day), { rule: "contacted", days: 15, limit: 14 }, "an old confirmed record uses the contacted rule");
assert.strictEqual(C.overdue(t3, t0 + 400 * day), null, "started never goes overdue");
assert.strictEqual(C.overdue(tc, t0 + 400 * day), null, "nor cancelled");
assert.ok(!C.isExpired(rec, t0 + 13 * day) && C.isExpired(rec, t0 + 15 * day), "14 days from submission while nothing happened");
const tContact = Date.parse(t1.history[t1.history.length - 1].at);
assert.ok(!C.isExpired(t1, t0 + 14 * day) && !C.isExpired(t1, tContact + 13 * day) && C.isExpired(t1, tContact + 15 * day), "the provider's 已联系 restarts the clock: 14 days from the contact");
assert.ok(!C.isExpired(tp, t0 + 60 * day) && !C.isExpired(t2, t0 + 60 * day), "only while submitted or contacted");
const ex = C.withExpiry(t1, tContact + 15 * day);
assert.deepStrictEqual([ex.status, ex.history[ex.history.length - 1].by, ex.history[ex.history.length - 1].to, C.isLive(ex), C.nextStatuses(ex.status, sales), C.nextStatuses(ex.status, ["admin"])], ["expired", "system", "expired", false, [], ["submitted"]]);
assert.strictEqual(C.withExpiry(t1, t0 + 5 * day), t1, "not expired: the same object");
const xt = C.extend(t1, "head@kxc.edu", tContact + 10 * day);
assert.strictEqual(xt.expiresAt, new Date(tContact + 28 * day).toISOString(), "+14 days on the current deadline");
assert.ok(!C.isExpired(xt, tContact + 27 * day) && C.isExpired(xt, tContact + 29 * day) && /延长 14 天/.test(xt.history[xt.history.length - 1].note));
const xt2 = C.extend(xt, "head@kxc.edu", tContact + 40 * day);
assert.strictEqual(xt2.expiresAt, new Date(tContact + 54 * day).toISOString(), "extended after it lapsed: 14 days from now");
const xp = C.transition(xt, "parent_paid", "parent@gmail.com", "", [], tContact + 11 * day, ["parent_paid"]);
assert.ok(!("expiresAt" in xp), "a status change drops the extension: the clock belongs to the new step");

// Masking: contact details need identity ≥ read, amounts need money ≥ read.
const full = C.mask(t1, C.accessMap(["staff:sales"]));
assert.strictEqual(full, t1, "the order manager gets the record untouched");
const fin = C.mask(t1, C.accessMap(["staff:finance"]));
assert.strictEqual(fin.email, "…@gmail.com", "finance: contact details masked");
assert.strictEqual(fin.totalPrice, 1200, "finance: amounts shown");
assert.strictEqual(fin.history[1].note, "提供方已联系", "finance reads orders, so the notes stay");
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

// the account comes from the platform's principal header, never from the form
{
  const { accountOf } = require("../api/order/index.js");
  const hdr = (p) => ({ headers: { "x-ms-client-principal": Buffer.from(JSON.stringify(p)).toString("base64") } });
  assert.strictEqual(accountOf({ headers: {} }), "", "anonymous");
  assert.strictEqual(accountOf(hdr({ userDetails: "Parent@BES.qiaoliang.online", userRoles: ["authenticated"] })), "parent@bes.qiaoliang.online");
  assert.strictEqual(accountOf(hdr({ userDetails: "not-an-upn" })), "", "a principal without an address is nobody");
}
console.log("crm: all assertions passed");
