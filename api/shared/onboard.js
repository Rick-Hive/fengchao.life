// 开通为课程提供方 / Onboard a course provider (Rick 2026-10-22: 「在管理中心直接为 JCA 开通能否做到自动化？你现在 Hive
// Orders 中创建 JCA 的频道，将其写入 Airtable，其它字段可以直接使用机构的值写入」).
//
// One action from the 机构 panel, five steps, each idempotent (run it again and it fills in what is missing):
//   1. channel      a standard channel "<ABBR> 订单" in the Hive Orders team (Graph, Channel.Create) — or the one
//                   already there by that name; its id is where the provider's order notifications go
//   2. school       the Airtable Schools row: created, or the existing one (same abbreviation, domain or name)
//                   completed — name, abbreviation, domain, Teams channel, notify email, country, city, website;
//                   a value already in a cell is never overwritten
//   3. partnership  a 课程提供方 relationship for the institution (stage 课程设计与上架) unless an open one exists
//   4. leader       the account given gets provider:<KEY> (蜂巢课程负责人) on 角色分配
//   5. sync         the course editor's pick lists and the website snapshot (so orders route to the channel)
// dryRun reports what each step would do without changing anything.
const cfg = require("./config");
const { AirtableBase } = require("./airtable");
const { hiveKey } = require("./hive");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const teamName = () => process.env.HIVE_ORDERS_TEAM_NAME || "Hive Orders";

// The injectable parts (tests replace them)
let deps = {
  graph: (...a) => require("./graph").graph(...a),
  graphList: (...a) => require("./graph").list(...a),
  findTeam: (n) => require("./teamsFetch").findTeam(n),
  readBase: () => require("./courses").baseRead(),
  writeBase: () => require("./courses").baseWrite(),
  partners: () => require("./partners"),
  roles: () => require("./roles"),
  courses: () => require("./courses"),
  runSync: () => require("../sync").runSync,
};
function _deps(d) { deps = Object.assign({}, deps, d); }

function clean(input) {
  const s = (v, n) => String(v == null ? "" : v).trim().slice(0, n);
  const out = { key: s(input.key, 120), abbr: s(input.abbr, 20), name: s(input.name, 120), nameEn: s(input.nameEn, 160), domain: s(input.domain, 120).toLowerCase(), notifyEmail: s(input.notifyEmail, 200).toLowerCase(),
    leader: s(input.leader, 200).toLowerCase(), channelName: s(input.channelName, 50), country: s(input.country, 60), city: s(input.city, 60), website: s(input.website, 200) };
  const problems = [];
  if (!out.abbr || !hiveKey(out.abbr)) problems.push("abbr: the short name (e.g. JCA) is required");
  if (!out.name) problems.push("name: the institution's name is required");
  if (out.notifyEmail && !EMAIL_RE.test(out.notifyEmail)) problems.push("notifyEmail: not an address");
  if (out.leader && !EMAIL_RE.test(out.leader)) problems.push("leader: an account name@domain");
  if (out.domain && !/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(out.domain)) problems.push("domain: not a domain");
  if (problems.length) throw Object.assign(new Error("incomplete"), { status: 400, problems });
  out.hive = hiveKey(out.abbr);
  out.channelName = (out.channelName || `${out.abbr} 订单`).replace(/[~#%&*{}+/\\:<>?|'"]/g, " ").replace(/\s+/g, " ").trim().slice(0, 50);
  if (!out.notifyEmail && out.leader) out.notifyEmail = out.leader;
  return out;
}

async function run(input, opts) {
  opts = opts || {};
  const v = clean(input || {}), dry = !!opts.dryRun, by = opts.by || "system", log = opts.log || (() => {});
  const steps = [];
  const step = (k, status, detail, extra) => { steps.push(Object.assign({ step: k, status, detail: detail || "" }, extra || {})); };

  // 1. the channel
  let channelId = "";
  try {
    const team = await deps.findTeam(teamName());
    if (!team) throw Object.assign(new Error(`no team named "${teamName()}"`), { code: "no_team" });
    const chans = await deps.graphList(`/teams/${team.id}/channels?$select=id,displayName`, 200);
    const hit = chans.find((c) => String(c.displayName || "").trim().toLowerCase() === v.channelName.toLowerCase());
    if (hit) { channelId = hit.id; step("channel", "exists", `${team.name} › ${hit.displayName}`, { channelId }); }
    else if (dry) step("channel", "todo", `${team.name} › ${v.channelName}`);
    else {
      const ch = await deps.graph("POST", `/teams/${team.id}/channels`, { displayName: v.channelName, description: `${v.name} — 蜂巢课程订单 / Hive course orders`, membershipType: "standard" });
      channelId = ch.id; step("channel", "done", `${team.name} › ${ch.displayName || v.channelName}`, { channelId });
    }
  } catch (err) {
    const perm = err && (err.status === 403 || err.status === 401);
    step("channel", "failed", perm ? "Microsoft refused: Hive's app needs the Graph application permission Channel.Create (admin consent)" : String(err.message || err).slice(0, 200), { code: perm ? "app_permission" : err.code || "" });
  }

  // 2. the Schools row
  let schoolId = "";
  try {
    const sf = cfg.schoolFields, tableId = cfg.tables.schools.id;
    const rows = await deps.readBase().list(tableId);
    const val = (r, re) => { const k = Object.keys(r.fields || {}).find((x) => re.test(x)); const x = k ? r.fields[k] : ""; return Array.isArray(x) ? x.join(", ") : String(x == null ? "" : x).trim(); };
    const same = rows.find((r) => hiveKey(val(r, sf.abbr)) === v.hive) || (v.domain && rows.find((r) => val(r, sf.domain).toLowerCase() === v.domain)) || rows.find((r) => val(r, sf.name) === v.name) || null;
    const base = deps.writeBase();
    const table = await base.table([tableId]);
    const want = [[sf.name, v.name, "name"], [sf.abbr, v.abbr, "abbr"], [sf.domain, v.domain, "domain"], [sf.teamsChannelId, channelId, "teamsChannelId"], [sf.notifyEmail, v.notifyEmail, "notifyEmail"], [sf.country, v.country, "country"], [sf.city, v.city, "city"], [sf.website, v.website, "website"]];
    const fields = {}, written = [], missing = [];
    for (const [spec, value, key] of want) {
      if (!value) continue;
      const fld = AirtableBase.field(table, spec);
      if (!fld || !AirtableBase.isWritable(fld)) { missing.push(key); continue; }
      if (same && val(same, spec)) continue; // never overwrite what is there
      fields[fld.name] = /Select/.test(fld.type) ? (fld.type === "multipleSelects" ? [value] : value) : value; written.push(key);
    }
    if (same) {
      schoolId = same.id;
      if (!written.length) step("school", "exists", val(same, sf.name) || v.name, { schoolId, missing });
      else if (dry) step("school", "todo", `complete ${written.join(", ")}`, { schoolId, missing });
      else { await base.update(tableId, same.id, fields, { typecast: true }); step("school", "done", `completed ${written.join(", ")}`, { schoolId, missing }); }
    } else if (dry) step("school", "todo", `new row: ${written.join(", ")}`, { missing });
    else { const rec = await base.create(tableId, fields, { typecast: true }); schoolId = rec.id; step("school", "done", `new row: ${written.join(", ")}`, { schoolId, missing }); }
  } catch (err) { step("school", "failed", String(err.message || err).slice(0, 200)); }

  // 3. the partnership
  try {
    const P = deps.partners();
    const key = v.key || (v.domain || "hive:" + v.hive);
    const rels = await P.readRels(), orgs = await P.readOrgs();
    const orgId = orgs.byKey[key] || null;
    const open = Object.values(rels.items || {}).find((r) => r && r.type === "course" && !r.closed && r.party && (r.party.key === key || (orgId && r.party.id === orgId)));
    if (open) step("partnership", "exists", `${open.id} · ${open.stage}`, { relId: open.id });
    else if (dry) step("partnership", "todo", "课程提供方 · 课程设计与上架");
    else {
      const { doc: od } = await P.updateOrgs((o) => { P.orgIdFor(o, key, { name: v.name, nameEn: v.nameEn }); });
      const party = { id: od.byKey[key], key, name: v.name };
      let created = null;
      await P.updateRels((d) => { const id = P.pad(d.next++); created = P.newRelationship({ type: "course", party, stage: "design", owner: by, note: "开通为课程提供方" }, by, id); d.items[id] = created; });
      step("partnership", "done", `${created.id} · 课程设计与上架`, { relId: created.id });
    }
  } catch (err) { step("partnership", "failed", String(err.message || err).slice(0, 200)); }

  // 4. the leader
  if (v.leader) {
    try {
      const R = deps.roles(), role = `provider:${v.hive}`;
      const doc = await R.readRoles();
      const has = (doc.entries || []).some((e) => e.user === v.leader && (e.roles || []).includes(role));
      if (has) step("leader", "exists", `${v.leader} · 蜂巢课程负责人 · ${v.hive}`);
      else if (dry) step("leader", "todo", `${v.leader} · 蜂巢课程负责人 · ${v.hive}`);
      else {
        await R.updateRoles((d) => { let e = d.entries.find((x) => x.user === v.leader); if (!e) { e = { user: v.leader, roles: [], by, at: "" }; d.entries.push(e); } if (!e.roles.includes(role)) e.roles.push(role); e.by = by; e.at = new Date().toISOString(); });
        step("leader", "done", `${v.leader} · 蜂巢课程负责人 · ${v.hive}`);
      }
    } catch (err) { step("leader", "failed", String(err.message || err).slice(0, 200)); }
  } else step("leader", "skipped", "no account given");

  // 5. the pick lists and the website (the routing comes from the snapshot)
  if (dry) step("sync", "todo", "pick lists + website");
  else {
    try {
      const C = deps.courses();
      await C.lookups(true).catch(() => null);
      const r = await C.syncWebsite(deps.runSync(), log);
      step("sync", r && (r.ran || r.pending || r.upToDate) ? "done" : "failed", r && r.ran ? "website refreshed" : "website refresh queued");
    } catch (err) { step("sync", "failed", String(err.message || err).slice(0, 200)); }
  }
  return { ok: !steps.some((s) => s.status === "failed"), dryRun: dry, hive: v.hive, values: v, steps };
}

module.exports = { run, clean, teamName, _deps };
