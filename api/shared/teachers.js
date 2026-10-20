// 教师资料 / Teacher profiles (enrollment rules design §4, Rick 2026-10-20): the Airtable Teachers table is the
// teacher library and the only source; this module lets the people who may maintain a profile edit the three
// things that go stale — photo, 简介 (Biography), 专长 (Expertise) — as a draft, submit it, and have the curriculum
// director approve it, which writes Airtable and asks for the website sync. Everything else on the profile (subjects,
// languages, grade levels, organization) stays Airtable-maintained and is shown read-only.
//
// Who may edit a profile (Rick: 「教师库有时候会是校长维护，统一填写」): the teacher (the account the Teachers table names
// as Teams Account), the education leader of that account's school (domain_leader:<domain>), the curriculum director,
// the CEO, the system administrator. Who approves: the approvers of the course editor (curriculum director, CEO,
// system administrator). Approval is independent of any course's approval.
//
// Storage (site-data container):
//   crm/teacher-work/<recId>.json   { recId, name, status, draft: { bio, expertise, photo }, baseline, submitted,
//                                     published, returned, history[], updatedAt }
//   crm/teacher-work/_index.json    { items: { <recId>: { name, status, updatedAt, submittedAt, domain } } }
//   assets: teachers/work/<recId>.jpg — the draft photo (served by /api/asset; Airtable fetches it from the site)
const cfg = require("./config");
const store = require("./jsonstore");
const blob = require("./blob");
const { AirtableBase } = require("./airtable");
const { isAdmin, staffFunctions, DOMAIN_LEADER_RE } = require("./roles");
const C = require("./courses");

const INDEX_BLOB = "crm/teacher-work/_index.json";
const workBlob = (recId) => `crm/teacher-work/${recId}.json`;
const REC_RE = /^rec[A-Za-z0-9]{14}$/;
const LIMITS = { bio: 4000, expertise: 1000 };
const SITE = process.env.SITE_ORIGIN || "https://www.fengchao.life";
const now = () => new Date().toISOString();

function isApprover(roles) { return C.isApprover(roles); }
function leaderDomains(roles) { return (roles || []).map((r) => (DOMAIN_LEADER_RE.exec(r) || [])[1]).filter(Boolean); }
function domainOf(upn) { const m = /@(.+)$/.exec(String(upn || "").toLowerCase()); return m ? m[1] : ""; }

// The snapshot's teacher records: public profile + private contact, joined by record id.
function teachersOf(snap) {
  const pub = new Map(((snap && snap.teacherProfiles) || []).map((p) => [p.id, p]));
  return (((snap && snap.private) || {}).teachers || []).map((t) => Object.assign({}, pub.get(t.id) || { id: t.id, name: t.name }, { teamsAccount: t.teamsAccount || "", email: t.email || "", domain: domainOf(t.teamsAccount) }));
}

// What this account may do: its own record, the schools whose teachers it may maintain, whether it approves.
function whoIs(user, roles, snap) {
  const upn = String(user || "").toLowerCase();
  const all = teachersOf(snap);
  const mine = all.find((t) => t.teamsAccount === upn) || null;
  const approver = isApprover(roles);
  const domains = approver ? null : leaderDomains(roles); // null = every school
  return { upn, mine, approver, domains, all };
}
function mayEdit(who, rec) {
  if (!rec) return false;
  if (who.approver) return true;
  if (who.mine && who.mine.id === rec.id) return true;
  return !!(who.domains && rec.domain && who.domains.includes(rec.domain));
}
function visible(who) {
  if (who.approver) return who.all;
  const out = who.all.filter((t) => who.domains && who.domains.includes(t.domain));
  if (who.mine && !out.some((t) => t.id === who.mine.id)) out.unshift(who.mine);
  return out;
}

function empty(rec) {
  return { recId: rec.id, name: rec.name || "", status: "", draft: { bio: rec.bio || "", expertise: rec.expertise || "", photo: null }, baseline: { bio: rec.bio || "", expertise: rec.expertise || "", photoUrl: rec.photoUrl || null }, submitted: null, published: null, returned: null, history: [], updatedAt: null };
}
async function readWork(rec) { return store.read(workBlob(rec.id), () => empty(rec)); }
async function indexPut(d, domain) {
  await store.update(INDEX_BLOB, () => ({ items: {} }), (x) => { x.items[d.recId] = { name: d.name, status: d.status, updatedAt: d.updatedAt, submittedAt: d.submitted ? d.submitted.at : null, domain: domain || "" }; });
}
const readIndex = () => store.read(INDEX_BLOB, () => ({ items: {} }));

// The list for a page: every visible teacher with the state of the three fields and the work status.
async function list(who) {
  const idx = await readIndex();
  return visible(who).map((t) => {
    const w = idx.items[t.id] || {};
    return { id: t.id, name: t.name || "", teamsAccount: t.teamsAccount, domain: t.domain, organization: t.organization || "", photoUrl: t.photoUrl || null, hasBio: !!(t.bio && t.bio.trim()), hasExpertise: !!(t.expertise && t.expertise.trim()), status: w.status || "", updatedAt: w.updatedAt || null, submittedAt: w.submittedAt || null, mine: !!(who.mine && who.mine.id === t.id) };
  });
}

async function open(rec, who) {
  const d = await readWork(rec);
  return Object.assign({}, d, { profile: { id: rec.id, name: rec.name || "", teamsAccount: rec.teamsAccount, domain: rec.domain, organization: rec.organization || "", subjects: rec.subjects || "", languages: rec.languages || "", courseTypes: rec.courseTypes || "", gradeLevels: rec.gradeLevels || "", photoUrl: rec.photoUrl || null }, canEdit: mayEdit(who, rec), canApprove: who.approver });
}

function pushHistory(d, h) { d.history = [Object.assign({ at: now() }, h)].concat(d.history || []).slice(0, 100); }

// A text field of the draft. Saving a draft on a published record turns it into a draft again.
async function saveField(rec, key, value, by) {
  if (!(key in LIMITS)) throw Object.assign(new Error("not an editable field"), { status: 400 });
  const v = String(value == null ? "" : value).slice(0, LIMITS[key]);
  const d = await store.update(workBlob(rec.id), () => empty(rec), (x) => {
    x.draft[key] = v; x.status = "draft"; x.updatedAt = now(); x.name = rec.name || x.name;
    const last = (x.history || [])[0];
    if (last && last.action === "save" && last.by === by && Date.now() - new Date(last.at).getTime() < 10 * 60 * 1000) { if (!last.fields.includes(key)) last.fields.push(key); last.at = now(); }
    else pushHistory(x, { by, action: "save", fields: [key] });
  });
  await indexPut(d.doc || d, rec.domain);
  return d.doc || d;
}

// The photo: a JPEG the browser already cropped to a square (≤ 600 KB), stored as the draft photo.
async function savePhoto(rec, dataUrl, by) {
  const m = /^data:image\/jpeg;base64,(.+)$/.exec(String(dataUrl || ""));
  if (!m) throw Object.assign(new Error("the photo must be a JPEG"), { status: 400 });
  const buf = Buffer.from(m[1], "base64");
  if (buf.length < 1000 || buf.length > 600 * 1024) throw Object.assign(new Error("the photo must be between 1 KB and 600 KB"), { status: 400 });
  if (!(buf[0] === 0xff && buf[1] === 0xd8)) throw Object.assign(new Error("not a JPEG"), { status: 400 });
  const key = `teachers/work/${rec.id}.jpg`;
  await blob.writeAsset(key, buf, "image/jpeg");
  const at = now(), url = blob.assetUrl(key) + "&v=" + encodeURIComponent(at);
  const d = await store.update(workBlob(rec.id), () => empty(rec), (x) => { x.draft.photo = { key, url, at, by, size: buf.length }; x.status = "draft"; x.updatedAt = at; pushHistory(x, { by, action: "photo" }); });
  await indexPut(d.doc || d, rec.domain);
  return d.doc || d;
}

async function submit(rec, by) {
  const d = await store.update(workBlob(rec.id), () => empty(rec), (x) => { if (!x.updatedAt) throw Object.assign(new Error("nothing changed yet"), { status: 400 }); x.status = "submitted"; x.submitted = { at: now(), by }; x.returned = null; x.updatedAt = now(); pushHistory(x, { by, action: "submit" }); });
  await indexPut(d.doc || d, rec.domain);
  return d.doc || d;
}
async function giveBack(rec, by, comment) {
  const d = await store.update(workBlob(rec.id), () => empty(rec), (x) => { x.status = "draft"; x.returned = { at: now(), by, comment: String(comment || "").slice(0, 500) }; x.submitted = null; x.updatedAt = now(); pushHistory(x, { by, action: "return", note: String(comment || "").slice(0, 500) }); });
  await indexPut(d.doc || d, rec.domain);
  return d.doc || d;
}

// Approve = write Airtable (Biography, Expertise, Photo) and ask for the website sync. Columns the base lacks are skipped.
async function approve(rec, by, log) {
  const d0 = await readWork(rec);
  const base = C.baseWrite();
  const table = await base.table([cfg.tables.teachers.id]);
  const tef = cfg.teacherFields, changes = {}, written = [], skipped = [];
  const put = (spec, key, val) => { const fld = AirtableBase.field(table, spec); if (!fld || !AirtableBase.isWritable(fld)) { skipped.push(key); return; } changes[fld.name] = val; written.push(key); };
  if (d0.draft.bio !== d0.baseline.bio) put(tef.bio, "bio", d0.draft.bio);
  if (d0.draft.expertise !== d0.baseline.expertise) put(tef.expertise, "expertise", d0.draft.expertise);
  if (d0.draft.photo && d0.draft.photo.key) put(tef.photo, "photo", [{ url: SITE + blob.assetUrl(d0.draft.photo.key), filename: `${rec.id}.jpg` }]);
  let airtable = null;
  if (written.length) airtable = await base.update(cfg.tables.teachers.id, rec.id, changes, { typecast: false });
  const at = now();
  const d = await store.update(workBlob(rec.id), () => empty(rec), (x) => {
    x.status = "published"; x.published = { at, by, written, skipped }; x.submitted = null; x.returned = null;
    x.baseline = { bio: x.draft.bio, expertise: x.draft.expertise, photoUrl: x.draft.photo ? x.draft.photo.url : x.baseline.photoUrl };
    x.draft.photo = null; // written; the baseline keeps the URL until the next sync brings Airtable's copy
    x.updatedAt = at; pushHistory(x, { by, action: "approve", fields: written, skipped });
  });
  await indexPut(d.doc || d, rec.domain);
  await store.update(C.SYNC_BLOB, () => ({ lastAt: null, pending: false }), (s) => { s.pending = true; s.pendingSince = s.pendingSince || at; });
  if (log) log(`teacher ${rec.id}: approved by ${by}, wrote ${written.join(",") || "nothing"}${skipped.length ? ", skipped " + skipped.join(",") : ""}`);
  return { doc: d.doc || d, written, skipped, airtable: !!airtable };
}

module.exports = { REC_RE, LIMITS, INDEX_BLOB, workBlob, whoIs, mayEdit, visible, teachersOf, list, open, saveField, savePhoto, submit, giveBack, approve, readIndex };
