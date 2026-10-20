// /api/teachers — 教师资料 (api/shared/teachers.js). Signed-in accounts only (staticwebapp.config.json).
//   GET   teachers/list                 the teachers this account may see: own record, own school's (leader), all (approver)
//   GET   teachers/one?id=              the profile (snapshot) + the working record
//   PATCH teachers/field {id, key, value}   autosave bio / expertise into the draft
//   POST  teachers/photo {id, data}     the draft photo (JPEG data URL the browser cropped)
//   POST  teachers/submit {id}          hand the draft to the approvers
//   POST  teachers/return {id, comment} an approver gives it back
//   POST  teachers/approve {id}         write Airtable (Biography, Expertise, Photo) and ask for the website sync
const T = require("../shared/teachers");
const { readSnapshot } = require("../shared/blob");
const { userRoles } = require("../shared/roles");
const { guard, finish } = require("../shared/session");
const { audit } = require("../shared/audit");

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
    const who = T.whoIs(user, roles, snap);
    const id = String(body.id || q.id || "");
    const rec = id ? who.all.find((t) => t.id === id) : null;

    if (method === "GET" && action === "list") return done(200, { teachers: await T.list(who), me: { teacher: who.mine ? who.mine.id : null, approver: who.approver, leaderOf: who.domains || [] } });
    if (!T.REC_RE.test(id) || !rec) return done(404, { error: "no such teacher" });
    const edit = T.mayEdit(who, rec);
    if (method === "GET" && action === "one") { if (!edit && !who.approver) return done(403, { error: "not your profile" }); return done(200, await T.open(rec, who)); }
    if (!edit) return done(403, { error: "not your profile" });
    if (method === "PATCH" && action === "field") { const d = await T.saveField(rec, String(body.key || ""), body.value, user); return done(200, { ok: true, status: d.status, updatedAt: d.updatedAt }); }
    if (method === "POST" && action === "photo") { const d = await T.savePhoto(rec, body.data, user); await audit(context, { actor: user, action: "teacher.photo", target: rec.id }); return done(200, { ok: true, photo: d.draft.photo, status: d.status }); }
    if (method === "POST" && action === "submit") { const d = await T.submit(rec, user); await audit(context, { actor: user, action: "teacher.submit", target: rec.id }); return done(200, { ok: true, status: d.status, submitted: d.submitted }); }
    if (method === "POST" && action === "return") { if (!who.approver) return done(403, { error: "approvers only" }); const d = await T.giveBack(rec, user, body.comment); await audit(context, { actor: user, action: "teacher.return", target: rec.id, note: String(body.comment || "").slice(0, 200) }); return done(200, { ok: true, status: d.status, returned: d.returned }); }
    if (method === "POST" && action === "approve") { if (!who.approver) return done(403, { error: "approvers only" }); const r = await T.approve(rec, user, (m) => context.log(m)); await audit(context, { actor: user, action: "teacher.approve", target: rec.id, fields: r.written, skipped: r.skipped }); return done(200, { ok: true, status: r.doc.status, written: r.written, skipped: r.skipped, airtable: r.airtable }); }
    return done(404, { error: "unknown action" });
  } catch (err) {
    const status = err && err.status || 500;
    context.log.error("teachers:", err && err.message);
    reply(context, status, { error: String((err && err.message) || err) });
  }
};
