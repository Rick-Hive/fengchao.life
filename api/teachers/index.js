// /api/teachers — 教师资料 (api/shared/teachers.js). Signed-in accounts only (staticwebapp.config.json).
//   GET   teachers/list                 the teachers this account may see: own record, own school's (leader), all (approver)
//   GET   teachers/one?id=              the profile (snapshot) + the working record
//   PATCH teachers/field {id, key, value}   autosave bio / expertise into the draft
//   POST  teachers/photo {id, data}     the draft photo (JPEG data URL the browser cropped)
//   POST  teachers/submit {id}          hand the draft to the approvers
//   POST  teachers/return {id, comment} an approver gives it back
//   POST  teachers/approve {id}         write Airtable (Biography, Expertise, Photo) and ask for the website sync
//   POST  teachers/facts {id, name?, email?, teamsAccount?, subjects?, languages?, gradeLevels?, courseTypes?}
//                                       the record's facts, written to Airtable at once (whoever may edit the record)
//   POST  teachers/create {name, …facts, hive?}  a new teacher of the leader's institution (an approver names the hive)
//   GET   teachers/hives                the hives an approver may create for (key, name, abbr)
//   POST  teachers/sync                 refresh the snapshot after facts / create (coalesced, like courses/sync)
const T = require("../shared/teachers");
const { readSnapshot } = require("../shared/blob");
const { userRoles } = require("../shared/roles");
const { guard, finish } = require("../shared/session");
const { audit } = require("../shared/audit");
const providerMod = require("../shared/provider");
const C = require("../shared/courses");
const { hiveKey } = require("../shared/hive");

function reply(context, status, body) { context.res = { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body }; }

module.exports = async function (context, req) {
  const method = String(req.method || "GET").toUpperCase();
  const action = String((req.params && req.params.action) || "").toLowerCase();
  const q = req.query || {};
  const body = req.body && typeof req.body === "object" ? req.body : {};
  try {
    const s = await guard(context, req);
    if (!s) return;
    const done = (status, b) => { reply(context, status, b); finish(context, s); };
    const { user, roles } = await userRoles(req);
    if (!user) return done(401, { error: "sign in first" });
    const snap = await readSnapshot();
    if (!snap) return done(503, { error: "no_snapshot" });
    const who = T.whoIs(user, roles, snap, await T.readIndex());
    const id = String(body.id || q.id || "");
    const rec = id ? who.all.find((t) => t.id === id) : null;
    const canCreate = who.approver || (who.hives || []).length > 0;

    if (method === "GET" && action === "list") return done(200, { teachers: await T.list(who), me: { teacher: who.mine ? who.mine.id : null, approver: who.approver, leaderOf: who.domains || [], hives: who.hives || [], canCreate } });
    if (method === "GET" && action === "hives") { if (!canCreate) return done(403, { error: "no institution to add to" }); return done(200, { hives: who.approver ? providerMod.allHives(snap) : who.hives }); }
    // 教师库 (2026-10-21): a new teacher of the institution — the leader's own hive, or the one an approver names
    if (method === "POST" && action === "create") {
      if (!canCreate) return done(403, { error: "only an institution's leader or an approver adds teachers" });
      let org = null;
      if (who.approver) { const key = String(body.hive || "").trim().toUpperCase(); org = providerMod.allHives(snap).find((h) => h.key === key) || null; if (!org) return done(400, { error: "hive missing: which institution is the teacher's?", code: "hive" }); }
      else { const key = String(body.hive || who.hives[0].key).trim().toUpperCase(); org = who.hives.find((h) => h.key === key) || null; if (!org) return done(403, { error: "not your institution", code: "hive" }); }
      // the Schools row behind the hive, for a link-type Organization column
      const lk = await C.lookups().catch(() => null);
      const sch = ((lk && lk.schools) || []).find((s) => hiveKey(s.abbr || s.name) === org.key || hiveKey(s.name) === org.key) || null;
      const r = await T.create(body, Object.assign({}, org, { recId: sch ? sch.id : "" }), user, (m) => context.log(m));
      await audit(context, { actor: user, action: "teacher.create", target: r.id, name: r.facts.name, hive: org.key, written: r.written, skipped: r.skipped });
      return done(200, { ok: true, id: r.id, written: r.written, skipped: r.skipped });
    }
    if (method === "POST" && action === "sync") {
      if (!canCreate) return done(403, { error: "leaders and approvers only" });
      const r = await C.syncWebsite(require("../sync").runSync, (m) => context.log(m));
      return done(200, r);
    }
    if (!T.REC_RE.test(id) || !rec) return done(404, { error: "no such teacher" });
    const edit = T.mayEdit(who, rec);
    if (method === "GET" && action === "one") { if (!edit && !who.approver) return done(403, { error: "not your profile" }); return done(200, await T.open(rec, who)); }
    if (!edit) return done(403, { error: "not your profile" });
    if (method === "PATCH" && action === "field") { const d = await T.saveField(rec, String(body.key || ""), body.value, user); return done(200, { ok: true, status: d.status, updatedAt: d.updatedAt }); }
    if (method === "POST" && action === "facts" && body.teamsAccount !== undefined && !T.mayEditAccount(who, rec)) return done(403, { error: "the Teams account is set by the institution's leader or the curriculum director", code: "account" });
    if (method === "POST" && action === "facts") { const r = await T.saveFacts(rec, body, user, (m) => context.log(m)); await audit(context, { actor: user, action: "teacher.facts", target: rec.id, fields: r.written, skipped: r.skipped }); return done(200, { ok: true, written: r.written, skipped: r.skipped, facts: r.facts }); }
    if (method === "POST" && action === "photo") { const d = await T.savePhoto(rec, body.data, user); await audit(context, { actor: user, action: "teacher.photo", target: rec.id }); return done(200, { ok: true, photo: d.draft.photo, status: d.status }); }
    if (method === "POST" && action === "submit") { const d = await T.submit(rec, user); await audit(context, { actor: user, action: "teacher.submit", target: rec.id }); return done(200, { ok: true, status: d.status, submitted: d.submitted }); }
    if (method === "POST" && action === "return") { if (!who.approver) return done(403, { error: "approvers only" }); const d = await T.giveBack(rec, user, body.comment); await audit(context, { actor: user, action: "teacher.return", target: rec.id, note: String(body.comment || "").slice(0, 200) }); return done(200, { ok: true, status: d.status, returned: d.returned }); }
    if (method === "POST" && action === "approve") { if (!who.approver) return done(403, { error: "approvers only" }); const r = await T.approve(rec, user, (m) => context.log(m)); await audit(context, { actor: user, action: "teacher.approve", target: rec.id, fields: r.written, skipped: r.skipped }); return done(200, { ok: true, status: r.doc.status, written: r.written, skipped: r.skipped, airtable: r.airtable }); }
    return done(404, { error: "unknown action" });
  } catch (err) {
    const status = err && err.status || 500;
    context.log.error("teachers:", err && err.message);
    reply(context, status, Object.assign({ error: String((err && err.message) || err) }, err && err.problems ? { problems: err.problems } : {}, err && err.code ? { code: err.code } : {}));
  }
};
