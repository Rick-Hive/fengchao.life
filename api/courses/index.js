// /api/courses/{action} — 课程管理 (api/shared/courses.js; design claude/fengchao-course-management-design.md).
//
//   GET  courses/list                      the courses the caller may work on, with status and assignments
//                                          (approvers and viewers: every course; a teacher: the assigned ones)
//   GET  courses/lookups                   pick lists: grades, subjects, textbooks, teachers, schools, tracks, options
//   GET  courses/course?id=rec…            open one course (creates the working record from Airtable the first
//                                          time; an approver opening a submitted course marks it 审阅中)
//   PATCH courses/field {id, key, value}   the autosave: one field of the draft
//   POST courses/op {id, op, …}            submit {note?} · withdraw · return {comment} · publish · translate ·
//                                          milestone {note?} · restore {ref} · assign {person} · unassign {person}
//   POST courses/upload {course, …chunk}   a syllabus chunk (api/shared/files.js; PDF ≤ 10 MB); `id` is the upload id
//   GET  courses/versions?id=              the timeline;  GET courses/version?id=&ref=v:…|p:…  one version's content
//   POST courses/sync                      refresh the website after publishes (coalesced, every 2 minutes at most)
//   GET  courses/people?q=                 the people picker for assignments (approvers)
//   GET  courses/roster?id=rec…            班级名单: the students enrolled (and waitlisted) from the live orders —
//                                          name, grade, standing; no contact details (teachers, approvers, viewers)
//
// Who: approvers = 课程总监, CEO, 系统管理员 (everything); viewers = 教育社区经理 (read); a teacher = assigned
// courses, the teacher-editable fields only; a provider's leader (蜂巢课程负责人, api/shared/provider.js) = its own
// hives' courses like a teacher, plus assigning teachers to them from among its own people (the hive's domain, or
// the Teachers table rows of that organization) — never publishing or returning.
const C = require("../shared/courses");
const FILES = require("../shared/files");
const hub = require("../shared/hub");
const { userRoles } = require("../shared/roles");
const { guard, finish } = require("../shared/session");
const { audit } = require("../shared/audit");
const providerMod = require("../shared/provider");
const { readSnapshot } = require("../shared/blob");
const { hiveKey } = require("../shared/hive");

const reply = (context, status, body) => { context.res = { status, headers: { "Cache-Control": "no-store" }, body }; };
const ID_RE = /^rec[A-Za-z0-9]{14}$/;

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
    const who = { user, approver: C.isApprover(roles), viewer: C.isViewer(roles), provider: [] };
    let snap = null, hives = [];
    if (!who.approver && !who.viewer && (providerMod.explicitKeys(roles).length || providerMod.leaderDomains(roles).length)) {
      snap = await readSnapshot().catch(() => null);
      hives = providerMod.hivesOf(roles, snap);
      who.provider = hives.map((h) => h.key);
    }
    const owns = (cid) => who.provider.length > 0 && providerMod.ownsCourse(who.provider, ((snap && snap.courses) || []).find((c) => c.id === cid));
    const mayOpen = async (id) => who.approver || who.viewer || owns(id) || (await C.assignedTo(user)).includes(id);
    // the provider's own people: an account in one of its hives' domains, or a Teachers row of that organization
    const ownPerson = (p) => {
      const upn = String((p && p.upn) || "").toLowerCase(), dom = upn.split("@")[1] || "";
      if (dom && hives.some((h) => h.domain && h.domain === dom)) return true;
      const teachers = (((snap || {}).private || {}).teachers) || [];
      return teachers.some((t) => String(t.teamsAccount || "").toLowerCase() === upn && upn && orgKeys.includes(hiveKey(t.organization || "")));
    };
    // a Teachers row names its Organization by the school's name, the routing key is the abbreviation: match either
    const orgKeys = Array.from(new Set(hives.flatMap((h) => [h.key, hiveKey(h.name), hiveKey(h.abbr)]).filter(Boolean)));
    // the provider's own teachers (the Teachers table, incl. rows created here since the last sync): what it may name
    // as 授课老师 and see in the editor's pick list
    if (who.provider.length) {
      const T = require("../shared/teachers");
      const all = T.teachersOf(snap, await T.readIndex());
      who.ownTeacherIds = all.filter((t) => (t.orgKey && orgKeys.includes(t.orgKey)) || (t.organization && orgKeys.includes(hiveKey(t.organization))) || (t.domain && hives.some((h) => h.domain && h.domain === t.domain))).map((t) => t.id);
    }
    const id = String(body.id || q.id || "");

    if (method === "GET" && action === "list") {
      const assigned = who.approver || who.viewer ? null : await C.assignedTo(user);
      if (assigned && !assigned.length && !who.provider.length) return done(200, { courses: [], me: who, none: true });
      const r = await C.list(who);
      return done(200, Object.assign(r, { me: who, sync: await C.syncStatus() }));
    }
    if (method === "GET" && action === "lookups") {
      if (!(who.approver || who.viewer || who.provider.length || (await C.assignedTo(user)).length)) return done(403, { error: "no course is assigned to you" });
      const l = await C.lookups(q.fresh === "1");
      const own = who.ownTeacherIds ? new Set(who.ownTeacherIds) : null;
      const out = Object.assign({}, l, { teachers: l.teachers.filter((t) => !own || own.has(t.id)).map((t) => who.approver ? t : { id: t.id, name: t.name }) });
      return done(200, out);
    }
    if (method === "GET" && action === "course") {
      if (!ID_RE.test(id)) return done(400, { error: "id missing" });
      if (!(await mayOpen(id))) return done(403, { error: "this course is not assigned to you" });
      const doc = await C.open(id, who);
      const a = (await C.readAssignments()).items[id] || { people: [] };
      return done(200, { course: view(doc, who), assigned: a.people, editable: editable(who), translation: C.translationState(doc), needs: C.translationNeeds(doc) });
    }
    if (method === "PATCH" && action === "field") {
      if (!ID_RE.test(id)) return done(400, { error: "id missing" });
      if (who.viewer && !who.approver) return done(403, { error: "read only" });
      if (!(await mayOpen(id))) return done(403, { error: "this course is not assigned to you" });
      const r = await C.saveField(id, String(body.key || ""), body.value, who);
      const doc = await C.readWork(id);
      // 授课老师 changed: the teachers with a Teams account may now edit the course (auto assignments)
      let assigned;
      if (String(body.key) === "teachers") { const l = await C.lookups().catch(() => null); if (l) assigned = await C.syncTeacherAssignments(id, doc.code, doc.draft.fields.teachers || [], l.teachers, who); }
      return done(200, Object.assign(r, { translation: C.translationState(doc), needs: C.translationNeeds(doc) }, assigned ? { assigned } : {}));
    }
    if (method === "POST" && action === "op") {
      const op = String(body.op || "");
      if (op === "assign" || op === "unassign") {
        if (!ID_RE.test(id)) return done(400, { error: "id missing" });
        if (!who.approver && !owns(id)) return done(403, { error: "only the curriculum director, the CEO, the system administrator or the course's own provider assign courses" });
        if (!who.approver && op === "assign" && !ownPerson(body.person)) return done(403, { error: "a provider assigns its own people only", code: "not_own_person" });
        const it = op === "assign" ? await C.assign(id, String(body.code || ""), body.person || {}, who) : await C.unassign(id, body.person || {}, who);
        await audit(context, { actor: user, action: "course." + op, target: id, person: (body.person || {}).upn || (body.person || {}).crmId || "" });
        return done(200, { ok: true, assigned: it.people });
      }
      if (!ID_RE.test(id)) return done(400, { error: "id missing" });
      if (who.viewer && !who.approver) return done(403, { error: "read only" });
      if (!(await mayOpen(id))) return done(403, { error: "this course is not assigned to you" });
      if (op === "submit") { const doc = await C.submit(id, who, body.note); await audit(context, { actor: user, action: "course.submit", target: id, code: doc.code }); return done(200, { ok: true, course: view(doc, who) }); }
      if (op === "withdraw") { const doc = await C.withdraw(id, who); await audit(context, { actor: user, action: "course.withdraw", target: id }); return done(200, { ok: true, course: view(doc, who) }); }
      if (op === "milestone") { const doc = await C.saveVersion(id, who, body.note); return done(200, { ok: true, course: view(doc, who) }); }
      if (op === "translate") {
        const r = await C.translateCourse(id, who, undefined, { overwrite: body.overwrite === true, all: body.all === true, from: body.from === "en" ? "en" : "zh" });
        const doc = await C.readWork(id);
        await audit(context, { actor: user, action: "course.translate", target: id, fields: r.done, all: body.all === true });
        return done(200, { ok: true, done: r.done, kept: r.kept || [], course: view(doc, who), translation: C.translationState(doc), needs: C.translationNeeds(doc) });
      }
      if (op === "restore") {
        const doc = await C.restore(id, String(body.ref || ""), who);
        await audit(context, { actor: user, action: "course.restore", target: id, ref: body.ref });
        return done(200, { ok: true, course: view(doc, who), translation: C.translationState(doc), needs: C.translationNeeds(doc) });
      }
      if (op === "return") {
        if (!who.approver) return done(403, { error: "only an approver may return a course" });
        const doc = await C.giveBack(id, who, body.comment);
        await audit(context, { actor: user, action: "course.return", target: id, comment: String(body.comment || "").slice(0, 200) });
        return done(200, { ok: true, course: view(doc, who) });
      }
      if (op === "publish") {
        if (!who.approver) return done(403, { error: "only the curriculum director, the CEO or the system administrator publish" });
        const before = await C.readWork(id);
        const r = await C.publish(id, who, { all: body.all === true });
        // the syllabus files uploaded here now belong to the course; ones it let go are marked for cleanup
        try { await FILES.settle("course:" + id, ((before && before.published && before.published.fields.syllabus) || []).filter((a) => !a.airtable), (r.doc.draft.fields.syllabus || []).filter((a) => !a.airtable)); } catch { /* best effort */ }
        await audit(context, { actor: user, action: "course.publish", target: id, code: r.doc.code, fields: r.written, skipped: r.skipped });
        return done(200, { ok: true, course: view(r.doc, who), written: r.written, skipped: r.skipped, at: r.at });
      }
      return done(400, { error: `unknown op ${JSON.stringify(op)}` });
    }
    if (method === "POST" && action === "upload") {
      // `course` = the course; `id` = the upload id (files.js), set from the second chunk on
      const courseId = String(body.course || "");
      if (!ID_RE.test(courseId)) return done(400, { error: "course missing" });
      if (who.viewer && !who.approver) return done(403, { error: "read only" });
      if (!(await mayOpen(courseId))) return done(403, { error: "this course is not assigned to you" });
      const r = await FILES.upload(body, user);
      return done(200, Object.assign({ ok: true }, r));
    }
    if (method === "GET" && action === "versions") {
      if (!ID_RE.test(id)) return done(400, { error: "id missing" });
      if (!(await mayOpen(id))) return done(403, { error: "this course is not assigned to you" });
      return done(200, await C.versions(id));
    }
    if (method === "GET" && action === "version") {
      if (!ID_RE.test(id)) return done(400, { error: "id missing" });
      if (!(await mayOpen(id))) return done(403, { error: "this course is not assigned to you" });
      const v = await C.versionContent(id, String(q.ref || ""));
      return v ? done(200, { ok: true, version: v }) : done(404, { error: "no such version" });
    }
    if (action === "sync") {
      if (!who.approver) return done(403, { error: "approvers only" });
      if (method === "GET") return done(200, await C.syncStatus());
      const r = await C.syncWebsite(require("../sync").runSync, (m) => context.log(m));
      if (r.ran) await audit(context, { actor: user, action: "course.sync", status: r.status, counts: r.body && r.body.counts });
      return done(200, r);
    }
    // 班级名单 (stage 2, 2026-10-21): who is enrolled in a course the caller may open — the teacher's roster. Names and
    // grades from the orders, the order's standing, nothing of the family's contact details (those stay with the
    // provider's leader and the order manager on the 订单 page).
    if (method === "GET" && action === "roster") {
      if (!ID_RE.test(id)) return done(400, { error: "id missing" });
      if (!(await mayOpen(id))) return done(403, { error: "this course is not assigned to you" });
      const { readSnapshot } = require("../shared/blob");
      const crm = require("../shared/crm");
      const seats = require("../shared/seats");
      const snap = await readSnapshot().catch(() => null);
      const course = ((snap && snap.courses) || []).find((c) => c.id === id);
      if (!course) return done(404, { error: "the course is not on the website yet" });
      const now = Date.now(), rows = [];
      for (const o0 of await crm.listOrders()) {
        const o = crm.withExpiry(o0, now), st = crm.statusOf(o);
        if (!seats.ALIVE.has(st)) continue;
        for (const it of o.items || []) {
          if (!it || it.code !== course.code) continue;
          rows.push({ name: (it.child && it.child.name) || "", grade: (it.child && it.child.grade) || "", account: (it.child && it.child.account) || "", status: st, waitlist: !!it.waitlist, since: o.submittedAt || "" });
        }
      }
      rows.sort((a, b) => (a.waitlist - b.waitlist) || String(a.since).localeCompare(String(b.since)));
      const enrolled = rows.filter((r) => !r.waitlist), waitlist = rows.filter((r) => r.waitlist);
      return done(200, { course: { id: course.id, code: course.code, nameZh: course.nameZh || "", nameEn: course.nameEn || "", minSize: course.minSize == null ? null : course.minSize, maxSize: course.maxSize == null ? null : course.maxSize },
        enrolled, waitlist, counts: { enrolled: enrolled.length, paid: enrolled.filter((r) => r.status === "paid" || r.status === "started").length, waitlist: waitlist.length }, at: new Date(now).toISOString() });
    }
    if (method === "GET" && action === "people") {
      if (!who.approver && !who.provider.length) return done(403, { error: "approvers only" });
      const sq = String(q.q || "").trim().toLowerCase();
      if (sq.length < 2) return done(200, { people: [] });
      const h = await hub.readHub().catch(() => null);
      const hit = (p) => [p.name, p.crmId, ...(p.keys || [])].some((k) => String(k || "").toLowerCase().includes(sq));
      let people = ((h && h.people) || []).filter(hit).map((p) => {
        const acc = (p.facets && p.facets.accounts) || [];
        // a provider picks among its own people: the account in its domain, if the person has several
        const own = who.provider.length ? acc.find((a) => ownPerson(a)) : null;
        return { crmId: p.crmId, name: p.name, upn: (own && own.upn) || acc.map((a) => a.upn).find(Boolean) || "", identity: (own && own.identity) || acc.map((a) => a.identity).find(Boolean) || "", org: (own && own.domain) || acc.map((a) => a.domain).find(Boolean) || "" };
      });
      if (!who.approver) {
        people = people.filter((p) => p.upn && ownPerson(p));
        // the hive's Teachers rows with a Teams account that the people hub does not know yet
        const teachers = (((snap || {}).private || {}).teachers) || [];
        for (const t of teachers) {
          const upn = String(t.teamsAccount || "").toLowerCase();
          if (!upn || !ownPerson({ upn }) || people.some((p) => p.upn === upn) || ![t.name, upn].some((k) => String(k || "").toLowerCase().includes(sq))) continue;
          people.push({ crmId: "", name: t.name || upn, upn, identity: "老师", org: upn.split("@")[1] || "" });
        }
      }
      return done(200, { people: people.slice(0, 12) });
    }
    return done(404, { error: "no such action" });
  } catch (err) {
    const status = err && err.status ? err.status : 500;
    if (status >= 500) context.log.error(`courses/${action}: ${(err && err.stack) || err}`);
    reply(context, status, Object.assign({ error: String((err && err.message) || err) }, err && err.problems ? { problems: err.problems } : {}, err && err.code ? { code: err.code } : {}));
  }
};

// What the browser gets of a working record (the field history stays server-side; it comes with the field panel later).
function view(doc, who) {
  return { id: doc.courseId, code: doc.code, status: doc.status, fields: doc.draft.fields, meta: doc.draft.meta, baseline: who.approver ? doc.draft.baseline : undefined,
    draftAt: doc.draft.at, draftBy: doc.draft.by, submitted: doc.submitted, reviewing: doc.reviewing, returned: doc.returned, published: doc.published ? { at: doc.published.at, by: doc.published.by, written: doc.published.written } : null,
    fieldHistory: doc.fieldHistory, history: doc.history.slice(-50).reverse() };
}
// Which fields the caller may change.
function editable(who) { const out = {}; for (const [k, f] of Object.entries(C.FIELDS)) out[k] = !!(who.approver || (f.teacher && !who.viewer) || (f.provider && (who.provider || []).length > 0)); return out; }
