// 对账单 (api/shared/statements.js + api/crm/statements.js): a school's monthly IT
// statement from the directory's monthly snapshots and removal ledger — accounts on
// the 1st and on the next 1st, who came and went, licensed × (price ÷ 12) minus the
// discount; reconstruction when a snapshot is missing; draft → sent → paid.
//
// Run with:  node test/statements.test.js
const assert = require("assert");
const path = require("path");
const Module = require("module");
const realResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) { if (request === "@azure/storage-blob") return "@azure/storage-blob"; return realResolve.call(this, request, parent, ...rest); };
require.cache["@azure/storage-blob"] = { id: "@azure/storage-blob", filename: "@azure/storage-blob", loaded: true, exports: { BlobServiceClient: { fromConnectionString() { throw new Error("no storage in test"); } } } };
delete process.env.STORAGE_CONNECTION_STRING;

// In-memory blobs for both stores.
const blobs = {};
const jsonstore = require(path.join(__dirname, "..", "api", "shared", "jsonstore.js"));
const copy = (x) => JSON.parse(JSON.stringify(x));
jsonstore.read = async (name, fallback) => (blobs[name] ? copy(blobs[name]) : (typeof fallback === "function" ? fallback() : copy(fallback)));
jsonstore.write = async (name, doc) => { blobs[name] = copy(doc); };
jsonstore.update = async (name, fallback, mutate) => { const doc = await jsonstore.read(name, fallback); const result = await mutate(doc); if (result !== false) blobs[name] = copy(doc); return { doc, result, written: result !== false }; };
const dir = require(path.join(__dirname, "..", "api", "shared", "directory.js"));
dir._store.read = async (n) => (blobs["directory/" + n] ? copy(blobs["directory/" + n]) : null);
dir._store.write = async (n, o) => { blobs["directory/" + n] = copy(o); };
dir._store.listDomains = async () => [{ domain: "a.edu" }, { domain: "b.edu" }];
const S = require(path.join(__dirname, "..", "api", "shared", "statements.js"));

const D = "a.edu";
const u = (n, plan, created, extra) => Object.assign({ id: "id-" + n, upn: `${n}@${D}`, displayName: n.toUpperCase(), plan, enabled: true, created }, extra || {});

(async () => {
  // Months: helpers.
  assert.ok(S.monthOk("2026-09") && !S.monthOk("2026-13") && !S.monthOk("2026-9"));
  assert.strictEqual(S.nextMonth("2026-12"), "2027-01"); assert.strictEqual(S.prevMonth("2026-01"), "2025-12");
  assert.strictEqual(S.defaultMonth("2026-10-05T01:00:00+08:00"), "2026-09");
  assert.strictEqual(S.defaultMonth("2026-09-30T20:00:00Z"), "2026-09", "the Beijing month decides: 04:00 on Oct 1 Beijing");

  // 1. Both snapshots present: the IT relationship gives price and currency.
  // The real blob keeps items keyed by id (partners.js EMPTY_REL) — the shape that broke the page on 2026-10-13 ("(rels.items || []).find is not a function").
  blobs["crm/relationships.json"] = { next: 2, items: { "REL-000001": { id: "REL-000001", type: "it", stage: "operating", terms: { domain: D, unitPriceYear: 5, discountSeats: 2, currency: "USD" } } } };
  blobs[`directory/_snapshots/${D}/2026-09.json`] = { domain: D, month: "2026-09", at: "2026-09-01T01:00:00+08:00", accounts: [u("ann", "faculty", "2026-01-01"), u("bob", "student", "2026-02-01"), u("cal", "", "2026-02-01"), u("dee", "student", "2026-03-01")] };
  blobs[`directory/_snapshots/${D}/2026-10.json`] = { domain: D, month: "2026-10", at: "2026-10-01T01:00:00+08:00", accounts: [u("ann", "faculty", "2026-01-01"), u("bob", "student", "2026-02-01"), u("cal", "", "2026-02-01"), u("eve", "student", "2026-09-10"), u("fay", "faculty", "2026-09-20", { enabled: false })] };
  blobs[`directory/_ledger/${D}.json`] = { domain: D, events: [{ kind: "removed", at: "2026-09-15T00:00:00Z", upn: `dee@${D}`, displayName: "DEE", plan: "student", created: "2026-03-01", why: "delta" }] };
  blobs[`directory/${D}.json`] = { domain: D, syncedAt: "2026-10-05T00:00:00Z", users: [u("ann", "faculty", "2026-01-01"), u("bob", "student", "2026-02-01"), u("cal", "", "2026-02-01"), u("eve", "student", "2026-09-10"), u("fay", "faculty", "2026-09-20", { enabled: false })], pending: [] };
  let c = await S.compute(D, "2026-09");
  assert.deepStrictEqual(c.period, { start: "2026-09-01", end: "2026-10-01" });
  assert.deepStrictEqual(c.counts, { start: { total: 4, licensed: 3, student: 2, faculty: 1, disabled: 0 }, end: { total: 5, licensed: 4, student: 2, faculty: 2, disabled: 1 }, added: 2, removed: 1 });
  assert.deepStrictEqual(c.added.map((x) => x.upn), [`eve@${D}`, `fay@${D}`]);
  assert.deepStrictEqual(c.removed.map((x) => [x.upn, x.removedAt]), [[`dee@${D}`, "2026-09-15T00:00:00Z"]], "the ledger gives the removal time");
  assert.strictEqual(c.billable, 3, "licensed accounts on the 1st — ann, bob, dee; cal has no plan (Rick 2026-10-13: 月初许可证数量; eve and fay, added in September, are billed from October)");
  assert.strictEqual(c.discount, 2, "default discount from the relationship's terms");
  assert.strictEqual(c.amount, Math.round((3 - 2) * 5 / 12 * 100) / 100); assert.strictEqual(c.currency, "USD");
  assert.deepStrictEqual(c.reconstructed, { start: false, end: false });
  c = await S.compute(D, "2026-09", { discount: 10 });
  assert.strictEqual(c.discount, 3, "the discount never exceeds the billable count"); assert.strictEqual(c.amount, 0);

  // 2. No snapshot for the next month yet (viewed on the 2nd before the sync ran, say):
  //    the end is reconstructed from the current rows; the start from rows + ledger.
  delete blobs[`directory/_snapshots/${D}/2026-10.json`];
  delete blobs[`directory/_snapshots/${D}/2026-09.json`];
  c = await S.compute(D, "2026-09", { discount: 0 });
  assert.deepStrictEqual(c.reconstructed, { start: true, end: true });
  assert.strictEqual(c.counts.start.total, 4, "ann, bob, cal (created before Sep) + dee from the ledger");
  assert.deepStrictEqual(c.removed.map((x) => x.upn), [`dee@${D}`]);
  assert.deepStrictEqual(c.added.map((x) => x.upn), [`eve@${D}`, `fay@${D}`]);
  assert.strictEqual(c.billable, 3, "reconstructed start: the three licensed of ann, bob, cal, dee");
  assert.strictEqual(c.amount, Math.round(3 * 5 / 12 * 100) / 100);

  // 3. No IT relationship: defaults (5 USD, no discount) and relationship null.
  blobs["crm/relationships.json"] = { next: 1, items: {} };
  c = await S.compute(D, "2026-09");
  assert.strictEqual(c.relationship, null); assert.strictEqual(c.unitPriceYear, 5); assert.strictEqual(c.discount, 0);
  blobs["crm/relationships.json"] = { next: 2, items: { "REL-000001": { id: "REL-000001", type: "it", stage: "operating", terms: { domain: D, unitPriceYear: 6, discountSeats: 1 } }, "REL-000002": { id: "REL-000002", type: "it", stage: "ended", closed: { at: "2026-01-01T00:00:00Z" }, terms: { domain: D, unitPriceYear: 99 } } } };

  // 4. Generate → draft with an id; regenerate replaces the draft (same id); sent/paid freeze it.
  let st = await S.generate(D, "2026-09", { discount: 1, note: "first" }, "fin@x");
  assert.strictEqual(st.id, "STM-000001"); assert.strictEqual(st.status, "draft"); assert.strictEqual(st.discount, 1); assert.strictEqual(st.unitPriceYear, 6);
  assert.strictEqual(st.amount, Math.round((3 - 1) * 6 / 12 * 100) / 100);
  // Finance's three figures (Rick, 2026-10-13): price per account per year, free accounts, percentage off.
  st = await S.generate(D, "2026-09", { discount: 2, unitPriceYear: 8, discountPct: 25 }, "fin@x");
  assert.strictEqual(st.id, "STM-000001", "a draft keeps its id"); assert.strictEqual(st.discount, 2); assert.strictEqual(st.history.length, 2);
  assert.strictEqual(st.unitPriceYear, 8); assert.strictEqual(st.discountPct, 25);
  assert.strictEqual(st.subtotal, Math.round((3 - 2) * 8 / 12 * 100) / 100); assert.strictEqual(st.amount, Math.round(st.subtotal * 0.75 * 100) / 100);
  c = await S.compute(D, "2026-09", { discountPct: 150, discount: 99, unitPriceYear: -3 });
  assert.deepStrictEqual([c.discountPct, c.discount, c.unitPriceYear, c.amount], [100, 3, 0, 0], "figures are clamped: 0–100 %, at most the billable accounts, price ≥ 0");
  c = await S.compute(D, "2026-09", { unitPriceYear: 0 });
  assert.strictEqual(c.unitPriceYear, 0, "an explicit 0 price is 0, not the default");
  st = await S.setStatus(D, "2026-09", "sent", "fin@x", "");
  assert.strictEqual(st.status, "sent"); assert.ok(st.sentAt);
  await assert.rejects(() => S.generate(D, "2026-09", { discount: 0 }, "fin@x"), (e) => e.code === "not_draft");
  st = await S.setStatus(D, "2026-09", "paid", "fin@x", "bank 10/12");
  assert.strictEqual(st.status, "paid"); assert.ok(st.paidAt); assert.strictEqual(st.history[st.history.length - 1].note, "bank 10/12");
  await assert.rejects(() => S.setStatus(D, "2026-10", "sent", "fin@x"), (e) => e.code === "not_found");
  await assert.rejects(() => S.setStatus(D, "2026-09", "lost", "fin@x"), (e) => e.status === 400);
  const ix = await S.readIndex();
  assert.strictEqual(ix.next, 2); assert.strictEqual(ix.items[`${D}|2026-09`].status, "paid");

  // 5. The month listing: a saved statement, a preview for the other school (its default
  //    discount = the previous month's), schools without an IT relationship last.
  blobs["directory/b.edu.json"] = { domain: "b.edu", syncedAt: "2026-10-05T00:00:00Z", users: [u("zed", "student", "2026-01-01")], pending: [] };
  let list = await S.listMonth("2026-09", ["b.edu", D], { [D]: { name: "示例学校" } });
  assert.deepStrictEqual(list.rows.map((r) => [r.domain, r.saved, r.relationship]), [[D, true, "REL-000001"], ["b.edu", false, null]]);
  assert.strictEqual(list.rows[0].name, "示例学校"); assert.strictEqual(list.rows[0].status, "paid");
  assert.strictEqual(list.totals.billable, 3, "only schools with an IT relationship count");
  list = await S.listMonth("2026-10", [D], {});
  assert.strictEqual(list.rows[0].saved, false); assert.deepStrictEqual([list.rows[0].discount, list.rows[0].unitPriceYear, list.rows[0].discountPct], [2, 8, 25], "a preview defaults to last month's figures");
  assert.deepStrictEqual(S.prevOpts(null), {});

  // 6. The directory side: a full sync snapshots the month once and ledgers what it drops.
  const calls = [];
  global.fetch = async (url, opts) => {
    const u2 = new URL(url); const p = u2.pathname.replace(/^\/v1\.0/, ""); calls.push(p);
    const json = (status, body) => ({ ok: status < 400, status, headers: { get: () => null }, text: async () => JSON.stringify(body), json: async () => body });
    if (/oauth2\/v2\.0\/token$/.test(u2.pathname)) return json(200, { access_token: "t", expires_in: 3600 });
    if (p === "/subscribedSkus") return json(200, { value: [] });
    if (p === "/users" && /endsWith/.test(u2.search)) return json(200, { value: [{ id: "id-ann", userPrincipalName: `ann@${D}`, displayName: "ANN", accountEnabled: true, userType: "Member", createdDateTime: "2026-01-01" }] });
    if (p === "/users/delta") return json(200, { value: [], "@odata.deltaLink": "https://graph.microsoft.com/v1.0/users/delta?$deltatoken=T" });
    if (p === "/$batch") { const reqs = JSON.parse(opts.body).requests; return json(200, { responses: reqs.map((r) => ({ id: r.id, status: 200, body: { value: [] } })) }); }
    if (p === "/domains") return json(200, { value: [] });
    return json(404, {});
  };
  process.env.AZURE_TENANT_ID = "t"; process.env.AZURE_CLIENT_ID = "c"; process.env.AZURE_CLIENT_SECRET = "s";
  blobs[`directory/${D}.json`] = { domain: D, syncedAt: "2026-10-05T00:00:00Z", users: [u("ann", "faculty", "2026-01-01"), u("old", "student", "2026-02-01")], pending: [] };
  blobs["directory/_departments.json"] = { domains: { [D]: { at: "x", refused: [] } } };
  const month = dir.beijingDate().slice(0, 7);
  delete blobs[`directory/_snapshots/${D}/${month}.json`];
  let r = await dir.syncSlice(D, "full", { budgetMs: 20000 });
  assert.strictEqual(r.done, true);
  const led = blobs[`directory/_ledger/${D}.json`];
  assert.ok(led && led.events.some((e) => e.upn === `old@${D}` && e.kind === "removed" && e.why === "full"), "the dropped account is in the ledger: " + JSON.stringify(led));
  const snap = blobs[`directory/_snapshots/${D}/${month}.json`];
  assert.ok(snap && snap.accounts.length === 1 && snap.accounts[0].upn === `ann@${D}`, "this month's snapshot taken at the end of the sync");
  const snapAt = snap.at;
  r = await dir.syncSlice(D, "full", { budgetMs: 20000 });
  assert.strictEqual(blobs[`directory/_snapshots/${D}/${month}.json`].at, snapAt, "taken once per month, not overwritten");
  await dir.removeUser(D, `ann@${D}`);
  assert.ok(blobs[`directory/_ledger/${D}.json`].events.some((e) => e.upn === `ann@${D}` && e.why === "hive"), "a Hive deletion is ledgered too");

  console.log("statements: all assertions passed");
})().catch((e) => { console.error(e); process.exit(1); });
