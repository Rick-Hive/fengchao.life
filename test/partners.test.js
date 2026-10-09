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
// Six types since the fundraising type left for Zoohu (Rick, 2026-10-09).
assert.deepStrictEqual(P.visibleTypes(), ["it", "publisher", "university", "intl_school", "course", "developer"]);
assert.ok(!P.TYPES.funder && !P.STAGES.funder && !P.CONTACT_ROLES.funder && !P.PROJECT_KINDS.funder, "no trace of the funder type");

// Seeding (design v2 §13): one starting relationship per source row, our own entities
// excluded and flagged internal, the old partners.json folded in, a second run idle.
const src = {
  institutions: [
    { key: "xqzw.edu", domain: "xqzw.edu", kind: "tenant", name: "心桥中文", accounts: 40, country: "中国" },
    { key: "kxc.edu", domain: "kxc.edu", kind: "both", name: "Kids X Center", abbr: "KXC", type: "蜂巢", courses: 3, hiveKey: "KXC", country: "中国", city: "南京" },
    { key: "hive:GCU", domain: "", kind: "hive", name: "Grace Christian University", abbr: "GCU", type: "大学", courses: 0, hiveKey: "GCU", country: "美国" },
    { key: "hive:EQUIP", domain: "", kind: "hive", name: "Equip 教育社区", abbr: "EQUIP", type: "蜂巢", courses: 5, hiveKey: "EQUIP" },
    { key: "equipme.cloud", domain: "equipme.cloud", kind: "tenant", name: "桥梁教育服务 EQUIP", accounts: 9 },
    { key: "hive:CCU", domain: "", kind: "hive", name: "Colorado Christian University", abbr: "CCU", type: "", courses: 0, hiveKey: "CCU" },
    // a College/University table row (Rick, 2026-10-09): Partnership → stage, programs → terms, its contact → primary 项目负责人
    { key: "hive:COVENANT", domain: "", kind: "hive", name: "Covenant College", abbr: "", type: "大学 / University", courses: 0, hiveKey: "COVENANT", college: true, partnership: "Partner", programs: ["Transcript Certification"], contact: { name: "Dr. Smith", email: "smith@covenant.edu", title: "Registrar" } },
  ],
  people: [{ crmId: "HC-000010", name: "Enqi Bao", keys: ["enqi.bao@xqzw.edu"] }, { crmId: "HC-000011", name: "Li Teacher", keys: ["li@gmail.com"] }, { crmId: "HC-000012", name: "吴老师", keys: ["wu@xqzw.edu"] }, { crmId: "HC-000013", name: "尹老师", keys: ["yin@xqzw.edu"] }, { crmId: "HC-000014", name: "Dr. Smith", keys: ["smith@covenant.edu"] }],
  publishers: [{ recId: "recPub1", name: "IEW" }, { recId: "", name: "" }],
  teachers: [{ id: "recT1", name: "Li Teacher", email: "li@gmail.com", teamsAccount: "" }, { id: "recT2", name: "Nobody", email: "no@x.com", teamsAccount: "" }, { id: "recT3", name: "吴老师", email: "", teamsAccount: "wu@xqzw.edu", organization: "心桥中文" }, { id: "recT4", name: "尹老师", email: "", teamsAccount: "yin@xqzw.edu", organization: "" }],
  domainAdmins: { "xqzw.edu": ["enqi.bao@xqzw.edu", "ghost@xqzw.edu"] },
  oldPartners: { "xqzw.edu": { stage: "trial", note: "试用两个月", owner: "pd@equipme.cloud", type: "school", region: "cn" }, "hive:GCU": { stage: "contact", type: "school" } },
};
const docs = { rels: { next: 1, items: {} }, orgs: { next: 1, byKey: {}, orgs: {} } };
const res = P.seed(src, docs, { exclude: P.DEFAULT_EXCLUDE }, "system", now);
const types = res.created.map((c) => c.type).sort();
assert.deepStrictEqual(types, ["course", "course", "course", "it", "it", "publisher", "university", "university", "university"], "one relationship per source row (a university without a Type column is known by its name; 心桥's teachers give 心桥 a course relationship, not themselves): " + JSON.stringify(res.created));
const xqCourse = Object.values(docs.rels.items).find((r) => r.party.key === "xqzw.edu" && r.type === "course");
assert.ok(xqCourse, "心桥中文 has a course relationship for its teachers");
assert.deepStrictEqual(xqCourse.contacts.map((c) => c.person + ":" + c.role).sort(), ["HC-000012:授课教师", "HC-000013:授课教师"], "吴老师 (by Organization) and 尹老师 (by the xqzw.edu account) are filed under 心桥中文");
assert.ok(!Object.values(docs.rels.items).some((r) => r.party.id === "HC-000012" || r.party.id === "HC-000013"), "no person-level relationship for an institution's teacher");
assert.strictEqual(res.filed.length, 2);
const cov = Object.values(docs.rels.items).find((r) => r.party.key === "hive:COVENANT");
assert.strictEqual(cov.type, "university"); assert.strictEqual(cov.stage, "running", "Partnership: Partner starts at 项目运行中"); assert.strictEqual(cov.region, "na");
assert.deepStrictEqual(cov.terms.programs, ["Transcript Certification"]);
assert.deepStrictEqual(cov.contacts, [{ person: "HC-000014", name: "Dr. Smith", role: "Registrar", primary: true }], "the row's contact is the primary contact, by PER reference");
assert.ok(cov.log[0].text.includes("Partnership: Partner"));
assert.deepStrictEqual(res.excluded.sort(), ["equipme.cloud", "hive:EQUIP"], "ourselves excluded");
assert.ok(docs.orgs.orgs[docs.orgs.byKey["hive:EQUIP"]].internal && docs.orgs.orgs[docs.orgs.byKey["equipme.cloud"]].internal, "excluded rows are flagged internal");
const all = Object.values(docs.rels.items);
const xq = all.find((r) => r.party.key === "xqzw.edu");
assert.strictEqual(xq.type, "it"); assert.strictEqual(xq.stage, "proposal", "old 试用 → 方案"); assert.strictEqual(xq.owner, "pd@equipme.cloud"); assert.strictEqual(xq.region, "cn"); assert.strictEqual(xq.currency, "CNY");
assert.deepStrictEqual(xq.contacts, [{ person: "HC-000010", name: "Enqi Bao", role: "学校/机构代表", primary: false }], "the domain admin known to the hub becomes the contact");
assert.ok(xq.log.some((l) => l.migrated && /试用两个月/.test(l.text)), "the old note is in the log"); assert.strictEqual(xq.confirmed, false); assert.strictEqual(xq.terms.unitPriceYear, 5);
const kxc = all.filter((r) => r.party.key === "kxc.edu").map((r) => r.type).sort();
assert.deepStrictEqual(kxc, ["course", "it"], "a tenant that delivers courses gets both");
const gcu = all.find((r) => r.party.key === "hive:GCU");
assert.strictEqual(gcu.type, "university"); assert.strictEqual(gcu.stage, "lead"); assert.strictEqual(gcu.region, "na"); assert.strictEqual(gcu.currency, "USD");
const li = all.find((r) => r.party.kind === "person");
assert.strictEqual(all.filter((r) => r.party.kind === "person").length, 1, "only the independent teacher is a provider in her own right");
assert.strictEqual(li.party.id, "HC-000011"); assert.strictEqual(li.type, "course"); assert.strictEqual(li.source, "seed:teacher");
assert.ok(res.skipped.includes("teacher:Nobody"), "a teacher nobody matches is skipped");
const pub = all.find((r) => r.type === "publisher");
assert.strictEqual(pub.party.key, "equip:recPub1"); assert.strictEqual(pub.stage, "onsale"); assert.strictEqual(pub.party.name, "IEW");
const again = P.seed(src, docs, { exclude: P.DEFAULT_EXCLUDE }, "system", now);
assert.strictEqual(again.created.length, 0, "a second run creates nothing"); assert.strictEqual(Object.keys(docs.rels.items).length, 9); assert.strictEqual(again.filed.length, 0, "teachers already filed are not filed again");
// A teacher seeded as her own provider before her institution was known is folded in.
docs.rels.items["REL-000098"] = P.newRelationship({ type: "course", party: { id: "HC-000013", kind: "person", name: "尹老师" }, stage: "listed", source: "seed:teacher" }, "system", "REL-000098");
docs.rels.items["REL-000098"].confirmed = false;
const r5 = P.seed(src, docs, { exclude: P.DEFAULT_EXCLUDE }, "system", now);
assert.ok(!docs.rels.items["REL-000098"] && r5.filed.some((f) => f.removed === "REL-000098"), "the stale person-level relationship is removed");
// A publisher the Equip copy knows only by number (Rick, 2026-10-08: 出版社是乱码) is
// not seeded; one seeded that way earlier is renamed when the name arrives.
const numbered = { publishers: [{ recId: "recPub2", name: "13" }, { recId: "recPub3", name: "1 (207)" }] };
const r3 = P.seed(numbered, docs, { exclude: P.DEFAULT_EXCLUDE }, "system", now);
assert.strictEqual(r3.created.length, 0, "no relationship for a number"); assert.ok(r3.skipped.includes("equip:recPub2:unnamed"));
docs.rels.items["REL-000099"] = P.newRelationship({ type: "publisher", party: { id: docs.orgs.byKey["equip:recPub1"], key: "equip:recPub1", name: "9" }, stage: "onsale", source: "seed:equip" }, "system", "REL-000099");
docs.orgs.orgs[docs.orgs.byKey["equip:recPub1"]].name = "9";
const r4 = P.seed({ publishers: [{ recId: "recPub1", name: "IEW" }] }, docs, { exclude: P.DEFAULT_EXCLUDE }, "system", now);
assert.strictEqual(r4.created.length, 0); assert.deepStrictEqual(r4.renamed, [{ id: "REL-000099", name: "IEW" }], "the numbered party gets its name");
assert.strictEqual(docs.rels.items["REL-000099"].party.name, "IEW"); assert.strictEqual(docs.orgs.orgs[docs.orgs.byKey["equip:recPub1"]].name, "IEW");
assert.strictEqual(pub.party.name, "IEW", "a party already named is left alone");
delete docs.rels.items["REL-000099"];
assert.strictEqual(P.regionOf({ country: "Singapore" }), "sea"); assert.strictEqual(P.regionOf({ region: "intl-cn" }), "cn"); assert.strictEqual(P.regionOf({ domain: "abc.cn" }), "cn"); assert.strictEqual(P.regionOf({}), "other");

console.log("partners: all assertions passed");

// Every partnersApi.<fn> the CRM entry point calls is exported (2026-10-09: 机构 showed
// "partnersApi.seeConfidential is not a function" after the fundraising type left).
{
  const fs = require("fs"), path = require("path");
  const api = require("../api/crm/partners");
  const src = fs.readFileSync(path.join(__dirname, "..", "api", "crm", "index.js"), "utf8");
  const used = Array.from(new Set(Array.from(src.matchAll(/partnersApi\.(\w+)/g)).map((m) => m[1])));
  for (const fn of used) assert.strictEqual(typeof api[fn], "function", "crm/index.js calls partnersApi." + fn + " — not exported");
  assert.ok(used.includes("handle"));
}
console.log("partners: entry-point wiring ok");
