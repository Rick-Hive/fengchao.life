// 人员库 (api/shared/hub.js): one record per person from the Equip customers, the
// tenant's accounts, the seminar list and the Hive course orders.
//
// Run with:  node test/hub.test.js
//
// Matching levels 0–3 of the design (§3): identical email and Teams UPN merge on
// their own, same name + school domain only goes to the merge queue, a verdict is
// applied on the next build, CRM IDs are stable across builds, nothing matches on
// WeChat or phone because nothing records them.
const assert = require("assert");
const path = require("path");
const Module = require("module");

const realResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (request === "@azure/storage-blob") return "@azure/storage-blob";
  return realResolve.call(this, request, parent, ...rest);
};
require.cache["@azure/storage-blob"] = { id: "@azure/storage-blob", filename: "@azure/storage-blob", loaded: true, exports: { BlobServiceClient: { fromConnectionString() { throw new Error("no storage in test"); } } } };
delete process.env.STORAGE_CONNECTION_STRING;
delete process.env.EMAIL_REPLACE_DOMAINS;

const H = require(path.join(__dirname, "..", "api", "shared", "hub.js"));
const C = require(path.join(__dirname, "..", "api", "shared", "crm.js"));

const now = Date.parse("2026-10-07T00:00:00Z");
const equip = {
  syncedAt: "2026-10-07T00:00:00Z",
  customers: [
    { recId: "recC1", email: "mama@qq.com", teams: "mama@equipme.cloud", name: "Mei Wang", crmId: "", city: "南京", active: true, createdTime: "2026-01-01T00:00:00Z" },
    { recId: "recC2", email: "dad@gmail.com", teams: "", name: "Zhang San", crmId: "", city: "", active: true, createdTime: "2026-02-01T00:00:00Z" },
    { recId: "recC3", email: "", teams: "", name: "Li Si", crmId: "HC-000042", city: "", active: false, createdTime: "2025-05-01T00:00:00Z" },
    { recId: "recC4", email: "old@163.com", teams: "", name: "Wang Wu", crmId: "", city: "", active: true, createdTime: "2024-05-01T00:00:00Z" },
  ],
  orders: [
    { recId: "recO1", customerRec: "recC1", email: "mama@qq.com", amount: 1296, received: 1296, date: "2026-09-20" },
    { recId: "recO2", customerRec: "recC2", email: "dad@gmail.com", amount: 500, received: 500, date: "2025-03-01" },
    { recId: "recO3", customerRec: "recC4", email: "old@163.com", amount: 300, received: 300, date: "2024-06-01" },
  ],
  seminar: [{ recId: "recS1", email: "lead@gmail.com", name: "Lead One", session: "2026-05", createdTime: "2026-05-01T00:00:00Z" }, { recId: "recS2", email: "mama@qq.com", name: "Mei", session: "2026-05", createdTime: "2026-05-01T00:00:00Z" }],
};
const domains = [
  { domain: "equipme.cloud", users: [{ upn: "mama@equipme.cloud", displayName: "Mei Wang", safeEmail: "", lastSignIn: "2026-10-01T00:00:00Z", enabled: true, created: "2026-01-05T00:00:00Z", identity: "家长" }] },
  { domain: "kxc.edu", users: [
    { upn: "zhang.san@kxc.edu", displayName: "Zhang San", safeEmail: "", lastSignIn: "2026-09-30T00:00:00Z", enabled: true, created: "2026-03-01T00:00:00Z", identity: "家长" },
    { upn: "kid@kxc.edu", displayName: "Kid Zhang", safeEmail: "", lastSignIn: null, enabled: true, created: "2026-03-01T00:00:00Z", identity: "学生" },
    { upn: "t@kxc.edu", displayName: "Teacher", safeEmail: "dad@gmail.com", lastSignIn: "2026-10-02T00:00:00Z", enabled: true, created: "2026-03-01T00:00:00Z", identity: "老师" },
  ] },
];
const hiveOrders = [{ orderId: "FC-20261001-KXC-001", email: "lead@gmail.com", teamsAccount: "", totalPrice: 1200, status: "paid", submittedAt: "2026-10-01T02:00:00Z", hives: [{ abbr: "KXC" }] }];

const hub = H.build({ equip, domains, hiveOrders, prev: null, decisions: { pairs: {} }, now });
const byName = (n) => hub.people.find((p) => p.name === n);

// Level 2: Teams account = UPN; level 1: the seminar row with the same email joins too.
const mei = byName("Mei Wang");
assert.ok(mei, "Mei exists");
assert.strictEqual(mei.facets.customers.length, 1);
assert.strictEqual(mei.facets.accounts.length, 1, "her equipme.cloud account matched through the Teams account (level 2)");
assert.strictEqual(mei.facets.leads.length, 1, "her seminar sign-up matched by email (level 1)");
assert.strictEqual(mei.primaryEmail, "mama@equipme.cloud", "a QQ mailbox is replaced by the Teams UPN as primary");
assert.strictEqual(mei.viaTeams, true);
assert.deepStrictEqual(mei.emails.map((e) => [e.email, e.tier]).sort(), [["mama@equipme.cloud", "safe"], ["mama@qq.com", "replace"]]);
assert.strictEqual(mei.stage, "active");
assert.strictEqual(mei.spend, 1296);
assert.ok(/^HC-\d{6}$/.test(mei.crmId));

// A tenant account's recovery email is NOT a merge key (Rick, 2026-10-08: four siblings
// whose accounts carry the parent's gmail had become one person): the TEACHER account
// whose safeEmail is dad@gmail.com stays a person of its own and is only suggested
// (level 3, reason safeEmail); zhang.san@kxc.edu is suggested by name. Neither merges.
const zhang = hub.people.find((p) => p.facets.customers.some((c) => c.recId === "recC2"));
assert.strictEqual(zhang.facets.accounts.length, 0, "recovery email does not join an account to a customer");
assert.strictEqual(zhang.stage, "dormant", "order 19 months ago, no account");
const zhangAcct = hub.people.find((p) => p.facets.accounts.some((a) => a.upn === "zhang.san@kxc.edu"));
assert.notStrictEqual(zhangAcct.crmId, zhang.crmId, "same name + domain is not merged on its own");
const teacher = hub.people.find((p) => p.facets.accounts.some((a) => a.upn === "t@kxc.edu"));
assert.notStrictEqual(teacher.crmId, zhang.crmId);
assert.deepStrictEqual(teacher.keys, ["t@kxc.edu"], "the recovery email is not one of the person's keys");
const qs = hub.queue.filter((x) => x.customer.recId === "recC2");
assert.deepStrictEqual(qs.map((x) => [x.account.upn, x.reason]).sort(), [["t@kxc.edu", "safeEmail"], ["zhang.san@kxc.edu", "name"]], "both go to the queue with their reason");
const q = qs.find((x) => x.reason === "name");
assert.ok(!hub.queue.some((x) => x.account.upn === "kid@kxc.edu"), "different names are not suggested");

// Siblings: four student accounts with the parent's recovery email are four people and
// are never suggested against the parent's customer record either (a student's recovery
// email is the parent's by design).
const sib = H.build({ equip: { customers: [{ recId: "recP", email: "mum@gmail.com", teams: "", name: "Mum Bao", crmId: "", createdTime: "2025-09-01T00:00:00Z" }], orders: [], seminar: [] },
  domains: [{ domain: "xqzw.edu", users: ["enqi", "enya", "enyu", "mingen"].map((n) => ({ upn: n + ".bao@xqzw.edu", displayName: n[0].toUpperCase() + n.slice(1) + " Bao", safeEmail: "mum@gmail.com", lastSignIn: "2026-10-05T00:00:00Z", enabled: true, created: "2025-09-10T00:00:00Z", identity: "学生" })) }],
  hiveOrders: [], prev: null, decisions: { pairs: {} }, now });
assert.strictEqual(sib.people.length, 5, "mum + four children: " + sib.people.map((p) => p.name).join(", "));
assert.ok(sib.people.every((p) => p.facets.accounts.length <= 1));
assert.strictEqual(sib.queue.length, 0, "students are not suggested by the parent's recovery email");
assert.strictEqual(sib.people.find((p) => p.name === "Enqi Bao").primaryEmail, "enqi.bao@xqzw.edu");
// …but they are one 家庭 (phase 3): four children and the parent whose email is their recovery address.
assert.strictEqual(sib.families.length, 1);
assert.strictEqual(sib.families[0].members.length, 5);
assert.deepStrictEqual(sib.families[0].members.map((m) => m.role).sort(), ["adult", "child", "child", "child", "child"]);
assert.ok(/^FM-\d{6}$/.test(sib.families[0].id));
assert.strictEqual(sib.people.find((p) => p.name === "Enqi Bao").familyId, sib.families[0].id);
const sib2 = H.build({ equip: { customers: [{ recId: "recP", email: "mum@gmail.com", teams: "", name: "Mum Bao", crmId: "", createdTime: "2025-09-01T00:00:00Z" }], orders: [], seminar: [] }, domains: [{ domain: "xqzw.edu", users: ["enqi", "enya", "enyu", "mingen"].map((n) => ({ upn: n + ".bao@xqzw.edu", displayName: n[0].toUpperCase() + n.slice(1) + " Bao", safeEmail: "mum@gmail.com", lastSignIn: "2026-10-05T00:00:00Z", enabled: true, created: "2025-09-10T00:00:00Z", identity: "学生" })) }], hiveOrders: [], prev: sib, decisions: { pairs: {} }, now });
assert.strictEqual(sib2.families[0].id, sib.families[0].id, "family id stable across rebuilds");
// 机构: one row per domain with the accounts, the active ones, the customers among them and families.
const xq = sib.institutions.find((i) => i.domain === "xqzw.edu");
assert.deepStrictEqual([xq.accounts, xq.active, xq.people, xq.customers, xq.families], [4, 4, 4, 0, 1]);
// A 关联账号 link (people.json) also makes a family: parent account ↔ child account.
const linkHub = H.build({ equip: { customers: [], orders: [], seminar: [] }, domains: [{ domain: "k.edu", users: [{ upn: "dad@k.edu", displayName: "Dad", safeEmail: "", lastSignIn: null, enabled: true, identity: "家长", linked: ["kid@k.edu"] }, { upn: "kid@k.edu", displayName: "Kid", safeEmail: "", lastSignIn: null, enabled: true, identity: "学生", linked: ["dad@k.edu"] }, { upn: "other@k.edu", displayName: "Other", safeEmail: "", lastSignIn: null, enabled: true, identity: "老师" }] }], hiveOrders: [], prev: null, decisions: { pairs: {} }, now });
assert.strictEqual(linkHub.families.length, 1);
assert.deepStrictEqual(linkHub.families[0].members.map((m) => [m.name, m.role]).sort(), [["Dad", "adult"], ["Kid", "child"]]);
assert.strictEqual(linkHub.people.find((p) => p.name === "Other").familyId, undefined);

// Level 0: a customer already carrying a CRM ID keeps it.
const li = byName("Li Si");
assert.strictEqual(li.crmId, "HC-000042");
assert.strictEqual(li.primaryTier, "missing", "no email at all");
assert.strictEqual(li.stage, "lead", "no orders, no account");

// Lead only; a Hive order joins by email → the person is a customer through Hive.
const lead = byName("Lead One");
assert.strictEqual(lead.facets.hive.length, 1);
assert.strictEqual(lead.hiveTotal, 1200);
assert.strictEqual(lead.stage, "active", "a paid Hive order counts as buying");
assert.strictEqual(lead.sources.customer, false);

// Dormant: an order 2+ years ago, no account.
assert.strictEqual(byName("Wang Wu").stage, "dormant");
assert.strictEqual(byName("Wang Wu").primaryTier, "replace");

// Accounts nobody matched are people too (registered).
assert.strictEqual(byName("Kid Zhang").stage, "registered");

// Stats and ids.
assert.strictEqual(hub.stats.people, 8, "Mei · Zhang (customer) · Teacher · Li · Wang · Lead One (+ Hive order) · Kid Zhang · zhang.san@kxc.edu: " + hub.people.map((p) => p.name).join(", "));
assert.strictEqual(hub.stats.queue, 2);
assert.strictEqual(hub.stats.writeBack, 3, "three customers lack a CRM ID in Airtable");
assert.strictEqual(new Set(hub.people.map((p) => p.crmId)).size, hub.people.length, "ids unique");

// Stability: a second build keeps every id, even with a new email on a person.
const hub2 = H.build({ equip: Object.assign({}, equip, { customers: equip.customers.map((c) => (c.recId === "recC2" ? Object.assign({}, c, { email: "dad.new@gmail.com", teams: "" }) : c)) }), domains, hiveOrders, prev: hub, decisions: { pairs: {} }, now });
assert.strictEqual(hub2.people.find((p) => p.name === "Mei Wang").crmId, mei.crmId);
assert.strictEqual(hub2.nextId >= hub.nextId, true);

// A verdict: 是同一个人 merges on the next build and the pair leaves the queue; 不是 only removes it.
const decisions = { pairs: { [q.key]: { verdict: "same", by: "om", at: "2026-10-07" } } };
const hub3 = H.build({ equip, domains, hiveOrders, prev: hub, decisions, now });
const z3 = hub3.people.find((p) => p.facets.customers.some((c) => c.recId === "recC2"));
assert.strictEqual(z3.facets.accounts.length, 1, "zhang.san@kxc.edu joined after the verdict");
assert.strictEqual(hub3.queue.length, 1, "the safeEmail suggestion is still open");
const hub4 = H.build({ equip, domains, hiveOrders, prev: hub, decisions: { pairs: { [q.key]: { verdict: "different" } } }, now });
assert.strictEqual(hub4.queue.length, 1, "a 不是 verdict silences that suggestion");
assert.strictEqual(hub4.people.find((p) => p.facets.customers.some((c) => c.recId === "recC2")).facets.accounts.length, 0);

// 待替换邮箱 marks ride on the mainland address and survive a rebuild.
const marks = { marks: { "mama@qq.com": { status: "replaced", by: "om", at: now2026("2026-10-02") }, "old@163.com": { status: "notified", by: "om", at: "2026-09-01T00:00:00Z" } } };
function now2026(d) { return d + "T00:00:00Z"; }
const marked = H.withMarks(hub.people, marks);
assert.strictEqual(marked.find((p) => p.name === "Mei Wang").replaceMark.status, "replaced");
assert.strictEqual(marked.find((p) => p.name === "Wang Wu").replaceMark.status, "notified");
assert.strictEqual(marked.find((p) => p.name === "Li Si").replaceMark, undefined);
assert.deepStrictEqual(H.markStats(hub.people, marks, Date.parse("2026-10-07T00:00:00Z")), { notified: 1, replaced: 0, replacedThisMonth: 0 }, "Mei's primary is her Teams UPN, so she is not 'replace' any more and not counted; Wang Wu is notified");
assert.strictEqual(H.replaceEmailOf(byName("Wang Wu")), "old@163.com");

// Masking by the matrix.
const fin = H.maskPerson(mei, C.accessMap(["staff:finance"]));
assert.strictEqual(fin.primaryEmail, "…@equipme.cloud");
assert.strictEqual(fin.spend, 1296);
assert.deepStrictEqual(fin.facets.accounts, [{ domain: "equipme.cloud", identity: "家长" }], "finance has no accounts access: domain and identity only");
const cur = H.maskPerson(mei, C.accessMap(["staff:curriculum"]));
assert.strictEqual(cur.spend, null);
assert.strictEqual(cur.facets.accounts[0].upn, "mama@equipme.cloud", "the curriculum director reads accounts");
const sales = H.maskPerson(mei, C.accessMap(["staff:sales"]));
assert.strictEqual(sales.primaryEmail, "mama@equipme.cloud");
console.log("hub: all assertions passed");
