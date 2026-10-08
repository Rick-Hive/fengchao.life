// 合作伙伴 (api/shared/partners.js): seven types with their own stages, moves checked by
// the rules of design v2 §11, stall and renewal health, ORG ids minted once per
// institution key, our own entities excluded, projects from templates.
//
// Run with:  node test/partners.test.js
const assert = require("assert");
const path = require("path");
const Module = require("module");
const realResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) { if (request === "@azure/storage-blob") return "@azure/storage-blob"; return realResolve.call(this, request, parent, ...rest); };
require.cache["@azure/storage-blob"] = { id: "@azure/storage-blob", filename: "@azure/storage-blob", loaded: true, exports: { BlobServiceClient: { fromConnectionString() { throw new Error("no storage in test"); } } } };
delete process.env.STORAGE_CONNECTION_STRING;

const P = require(path.join(__dirname, "..", "api", "shared", "partners.js"));

// Every type has stages, the last one closed, exactly one renewal stage where designed.
for (const t of P.TYPE_KEYS) {
  const st = P.STAGES[t];
  assert.ok(st.length >= 4, t + " has stages");
  assert.ok(st[st.length - 1].closed, t + " ends in a closed stage");
  assert.ok(st.every((s) => s.zh && s.en), t + " stages are bilingual");
  assert.ok(Object.keys(P.PROJECT_KINDS[t] || {}).length >= 1, t + " has project kinds");
}
assert.strictEqual(P.currencyOf("cn"), "CNY"); assert.strictEqual(P.currencyOf("na"), "USD");
assert.strictEqual(P.langOf("jp"), "zh"); assert.strictEqual(P.langOf("sea"), "en");

// A new relationship: starts at the first stage, currency and language from the region.
const rel = P.newRelationship({ type: "it", party: { id: "ORG-000001", key: "kxc.edu", name: "Kids X" }, region: "cn", owner: "", note: "from the seminar" }, "rick@equipme.cloud", "REL-000001");
assert.strictEqual(rel.stage, "lead"); assert.strictEqual(rel.currency, "CNY"); assert.strictEqual(rel.lang, "zh");
assert.strictEqual(rel.party.kind, "org"); assert.strictEqual(rel.log.length, 1); assert.strictEqual(rel.confirmed, true);
assert.throws(() => P.newRelationship({ type: "nope", party: { id: "ORG-000001" } }, "x", "REL-000002"), (e) => e.code === "bad_type");
assert.throws(() => P.newRelationship({ type: "it", party: { id: "bad" } }, "x", "REL-000002"), (e) => e.code === "bad_party");
const seeded = P.newRelationship({ type: "course", party: { id: "HC-000007", name: "Teacher Li" }, source: "seed:teacher", stage: "listed" }, "system", "REL-000003");
assert.strictEqual(seeded.confirmed, false, "a seeded relationship waits for confirmation"); assert.strictEqual(seeded.stage, "listed"); assert.strictEqual(seeded.party.kind, "person");

// Moves: forward to 签约 needs an agreement and a contact; backward needs a reason;
// 运营中 (handover) needs an owner; 项目运行中 needs an active project; closing needs a reason.
let chk = P.moveCheck(rel, "assess", {}, []);
assert.ok(chk.ok && !chk.backward);
chk = P.moveCheck(Object.assign({}, rel, { stage: "proposal" }), "signed", {}, []);
assert.deepStrictEqual(chk.problems.sort(), ["agreement", "contact"]);
chk = P.moveCheck(Object.assign({}, rel, { stage: "proposal", agreement: { signedAt: "2026-10-01" }, contacts: [{ person: "HC-000001", name: "A", role: "校长" }] }), "signed", {}, []);
assert.ok(chk.ok, "agreement + contact satisfy the move");
chk = P.moveCheck(Object.assign({}, rel, { stage: "onboarding", agreement: { signedAt: "2026-10-01" }, contacts: [{ person: "HC-000001" }] }), "operating", {}, []);
assert.deepStrictEqual(chk.problems, ["owner"]);
chk = P.moveCheck(Object.assign({}, rel, { stage: "onboarding", agreement: { signedAt: "2026-10-01" }, contacts: [{ person: "HC-000001" }] }), "operating", { owner: "cm@equipme.cloud" }, []);
assert.ok(chk.ok);
chk = P.moveCheck(Object.assign({}, rel, { stage: "assess" }), "lead", {}, []);
assert.deepStrictEqual(chk.problems, ["reason"]);
chk = P.moveCheck(Object.assign({}, rel, { stage: "assess" }), "lead", { reason: "wrong fit" }, []);
assert.ok(chk.ok && chk.backward);
chk = P.moveCheck(Object.assign({}, rel, { stage: "operating" }), "ended", {}, []);
assert.deepStrictEqual(chk.problems, ["reason"]);
const uni = P.newRelationship({ type: "university", party: { id: "ORG-000002", key: "hive:GCU", name: "GCU" }, region: "na", agreement: { signedAt: "2026-09-01", endAt: "2027-08-31" }, contacts: [{ person: "HC-000002", role: "项目负责人" }] }, "x", "REL-000004");
uni.stage = "agreement";
assert.deepStrictEqual(P.moveCheck(uni, "running", {}, []).problems, ["project"]);
assert.ok(P.moveCheck(uni, "running", {}, [{ relationship: "REL-000004", status: "active" }]).ok);
assert.strictEqual(P.moveCheck(uni, "agreement", {}, []).error, "same_stage");
assert.strictEqual(P.moveCheck(uni, "nope", {}, []).error, "bad_stage");

// Health: days in stage against the threshold, an overdue next step, no next step.
const now = Date.parse("2026-10-08T00:00:00Z");
const r1 = Object.assign({}, rel, { stageAt: "2026-09-01T00:00:00Z", next: { action: "call", due: "2026-10-01" } });
let h = P.health(r1, now, {});
assert.strictEqual(h.days, 37); assert.strictEqual(h.limit, 14); assert.ok(h.stalled); assert.deepStrictEqual(h.reasons, ["stage", "next"]); assert.strictEqual(h.nextOverdue, 7); assert.ok(h.severe, "more than twice the threshold");
h = P.health(Object.assign({}, rel, { stageAt: "2026-10-05T00:00:00Z", next: { action: "call", due: "2026-10-20" } }), now, {});
assert.ok(!h.stalled && h.reasons.length === 0);
h = P.health(Object.assign({}, rel, { stageAt: "2026-10-05T00:00:00Z" }), now, {});
assert.deepStrictEqual(h.reasons, ["noNext"]); assert.ok(!h.stalled, "no next step is flagged, not stalled");
h = P.health(Object.assign({}, rel, { stageAt: "2026-01-01T00:00:00Z" }), now, { thresholds: { "it.lead": 400 } });
assert.strictEqual(h.limit, 400); assert.ok(!h.stalled, "a configured threshold replaces the default");
h = P.health(Object.assign({}, rel, { stage: "operating", stageAt: "2025-01-01T00:00:00Z", agreement: { endAt: "2026-11-15" } }), now, {});
assert.ok(h.renewalDue, "60 days before the end of an IT agreement"); assert.ok(!h.stalled, "operating has no day threshold");
h = P.health(Object.assign({}, rel, { stage: "ended", closed: { at: "2026-10-01" } }), now, {});
assert.ok(!h.stalled && !h.renewalDue);

// Automatic transitions: into the renewal window, logged by "system"; not twice.
const doc = { next: 3, items: { "REL-000001": Object.assign(JSON.parse(JSON.stringify(rel)), { stage: "operating", stageAt: "2025-01-01T00:00:00Z", agreement: { endAt: "2026-11-15" } }), "REL-000002": JSON.parse(JSON.stringify(rel)) } };
assert.deepStrictEqual(P.autoTransitions(doc, now, {}), ["REL-000001"]);
assert.strictEqual(doc.items["REL-000001"].stage, "renewal"); assert.strictEqual(doc.items["REL-000001"].log.slice(-1)[0].by, "system");
assert.deepStrictEqual(P.autoTransitions(doc, now, {}), []);

// Lists and summary.
doc.items["REL-000002"].next = { action: "x", due: "2026-10-20" };
const rows = P.listByType(doc, "it", {}, now);
assert.strictEqual(rows.length, 2); assert.ok(rows[0].health);
const sm = P.summary(rows, now);
assert.strictEqual(sm.open, 2); assert.strictEqual(sm.dueThisMonth, 1); assert.strictEqual(sm.unassigned, 2); assert.deepStrictEqual(sm.byStage, { renewal: 1, lead: 1 });

// ORG ids: one per key, minted in order, names filled in once known.
const orgs = { next: 1, byKey: {}, orgs: {} };
assert.strictEqual(P.orgIdFor(orgs, "kxc.edu", { name: "Kids X" }), "ORG-000001");
assert.strictEqual(P.orgIdFor(orgs, "hive:GCU", {}), "ORG-000002");
assert.strictEqual(P.orgIdFor(orgs, "kxc.edu"), "ORG-000001");
assert.strictEqual(P.orgIdFor(orgs, "hive:GCU", { name: "Grace" }), "ORG-000002"); assert.strictEqual(orgs.orgs["ORG-000002"].name, "Grace");
assert.strictEqual(P.orgIdFor(orgs, ""), null);

// Exclusions: ourselves, by name or key, whatever the spacing.
const cfg = { exclude: P.DEFAULT_EXCLUDE };
assert.ok(P.isExcluded(cfg, { key: "hive:EQUIP", name: "Equip 教育社区" }));
assert.ok(P.isExcluded(cfg, { key: "equipme.cloud", name: "桥梁教育服务 EQUIP" }));
assert.ok(P.isExcluded(cfg, { name: "青少年之桥团契" }));
assert.ok(!P.isExcluded(cfg, { key: "kxc.edu", name: "Kids X Center" }));
assert.ok(P.isExcluded({ exclude: ["kxc.edu"] }, { key: "kxc.edu", name: "Kids X Center" }));

// Projects from templates: the kind's milestones, gates kept; an unknown kind falls back.
const prj = P.newProject(uni, { kind: "degree_cn", name: "M.Ed. online", startAt: "2026-11-01" }, "x", "PRJ-000001");
assert.strictEqual(prj.kind, "degree_cn"); assert.strictEqual(prj.status, "planning"); assert.strictEqual(prj.milestones.length, 9);
assert.ok(prj.milestones.some((m) => m.kind === "gate")); assert.strictEqual(prj.milestones[0].id, "m1"); assert.strictEqual(prj.owner, uni.owner);
const prj2 = P.newProject(uni, { kind: "nope" }, "x", "PRJ-000002");
assert.strictEqual(prj2.kind, "degree_cn"); assert.strictEqual(prj2.name, P.PROJECT_KINDS.university.degree_cn.zh);
const tb = P.newProject(seeded.type === "course" ? Object.assign({}, seeded, { type: "developer" }) : seeded, { kind: "textbook" }, "x", "PRJ-000003");
assert.strictEqual(tb.milestones.filter((m) => m.kind === "gate").length, 10);

// Cleaning: terms keep only simple values, contacts only valid person ids.
assert.deepStrictEqual(P.cleanTerms({ unitPriceYear: 5, discountSeats: 2, domain: "kxc.edu", bad: { x: 1 }, "we ird": 1, list: ["a", 2] }), { unitPriceYear: 5, discountSeats: 2, domain: "kxc.edu", list: ["a", "2"] });
assert.deepStrictEqual(P.cleanContacts([{ person: "hc-000001", name: "A", role: "校长", primary: 1 }, { person: "nobody" }]), [{ person: "HC-000001", name: "A", role: "校长", primary: true }]);
assert.strictEqual(P.cleanNext({ action: "  " }), null); assert.deepStrictEqual(P.cleanNext({ action: "call", due: "bad" }), { action: "call", due: "", owner: "" });
assert.deepStrictEqual(P.visibleTypes({ seeConfidential: false }).includes("funder"), false);
assert.deepStrictEqual(P.visibleTypes({ seeConfidential: true }).length, 7);

console.log("partners: all assertions passed");
