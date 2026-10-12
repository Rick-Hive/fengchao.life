// /api/school-plan — a school's 课程方案 (api/shared/schoolPlan.js).
//
//   GET  /api/school-plan                  the website: the PUBLISHED plan of the signed-in
//                                          family's school, { plan } or { plan: null } (also for
//                                          a visitor who is not signed in — never a refusal,
//                                          the wizard then uses Hive's defaults)
//   GET  /api/school-plan?domain=<d>        the editor: the full document (draft + published),
//                                          Hive's defaults and the school's name   (教育领袖 of d,
//                                          课程总监, sysadmin)
//   PUT  /api/school-plan {domain, tracks, map, publish?: true | unpublish?: true}
//                                          save the draft; with publish, make it what families
//                                          see; with unpublish, families see Hive's defaults again
const SP = require("../shared/schoolPlan");
const { getPrincipal } = require("../shared/auth");
const { userRoles, normUser, can, isAdmin } = require("../shared/roles");
const { readInstitutions } = require("../shared/people");
const { guard, finish } = require("../shared/session");
const { audit } = require("../shared/audit");
const { domainOf, DOMAIN_RE } = require("../shared/directory");

const reply = (context, status, body) => { context.res = { status, headers: { "Cache-Control": "no-store" }, body }; };

async function schoolOf(domain) {
  try { const i = (await readInstitutions()).institutions[domain] || {}; return { domain, name: i.name || "", nameEn: i.nameEn || "" }; } catch { return { domain, name: "", nameEn: "" }; }
}

module.exports = async function (context, req) {
  const method = String(req.method || "GET").toUpperCase();
  const q = req.query || {};
  try {
    if (method === "GET" && !q.domain) {
      // The family's view: soft — a visitor who is not signed in simply has no school.
      const s = await guard(context, req, { soft: true });
      const p = getPrincipal(req);
      const upn = normUser(p && p.userDetails);
      const domain = s && upn ? domainOf(upn) : "";
      if (!domain) { reply(context, 200, { plan: null, signedIn: false }); return; }
      const [doc, school] = await Promise.all([SP.readPlan(domain), schoolOf(domain)]);
      reply(context, 200, { plan: SP.forFamilies(doc, school), signedIn: true, domain });
      finish(context, s);
      return;
    }
    const s = await guard(context, req);
    if (!s) return;
    const { user, roles } = await userRoles(req);
    const domain = String(q.domain || (req.body && req.body.domain) || "").trim().toLowerCase();
    if (!DOMAIN_RE.test(domain)) { reply(context, 400, { error: "domain missing or malformed" }); finish(context, s); return; }
    if (!can(roles, "plan", domain)) { reply(context, 403, { error: `the 课程方案 of ${domain} is edited by its 教育领袖 (or the curriculum director)`, code: "forbidden" }); finish(context, s); return; }
    const [doc, snap, school] = await Promise.all([SP.readPlan(domain), SP.readSnapshot().catch(() => null), schoolOf(domain)]);
    const defaults = SP.defaultsFromSnapshot(snap);
    if (method === "GET") {
      reply(context, 200, { domain, school, plan: doc, defaults, canEdit: true, isAdmin: isAdmin(roles) });
      finish(context, s);
      return;
    }
    if (method === "PUT") {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const by = normUser(user);
      let out;
      if (body.unpublish === true) {
        out = await SP.unpublish(domain, by);
        await audit(context, { actor: by, action: "plan.unpublish", target: domain, result: "ok" });
      } else {
        let data;
        try { data = SP.clean({ tracks: body.tracks, map: body.map }, defaults); } catch (err) { if (err.status === 400) { reply(context, 400, { error: err.message, problems: err.problems }); finish(context, s); return; } throw err; }
        out = await SP.saveDraft(domain, data, by);
        if (body.publish === true) out = await SP.publish(domain, by);
        await audit(context, { actor: by, action: body.publish ? "plan.publish" : "plan.save", target: domain, tracks: Object.keys(data.tracks).length, stages: Object.keys(data.map), result: "ok" });
      }
      reply(context, 200, { ok: true, domain, school, plan: out, defaults });
      finish(context, s);
      return;
    }
    reply(context, 405, { error: "method not allowed" });
    finish(context, s);
  } catch (err) {
    context.log.error(`school-plan: ${(err && err.stack) || err}`);
    reply(context, 500, { error: String((err && err.message) || err) });
  }
};
