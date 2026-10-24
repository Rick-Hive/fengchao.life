// 系统广播 attachments (Rick, 2026-10-18): a PDF or picture that goes with a broadcast as a LINK, never as a copy in
// every recipient's calendar. The file is stored once (assets container, key broadcast/<id>), the link
// https://www.fengchao.life/api/f/<id> opens for anyone who has it (the id is 16 random characters: not listable, not
// guessable), and replacing the file keeps the link, so the 1680 calendar bodies that carry it need no re-publish.
// Only the broadcast layer has attachments (a school's own 校历 does not). Limits: PDF ≤ 10 MB, PNG / JPG ≤ 2 MB (the
// browser shrinks pictures before upload), 3 files per event. Uploads arrive in 2 MB chunks staged as blob blocks.
// The index crm/broadcast-files.json keeps name, type, size, who, when, the event, how often it was opened, and
// deletedAt (set when the event lets it go; the blob itself is removed 30 days later, by cleanup() on a publish).
const crypto = require("crypto");
const store = require("./jsonstore");
const blob = require("./blob");

const INDEX_BLOB = "crm/broadcast-files.json";
const EMPTY_INDEX = () => ({ items: {}, updatedAt: null });
const ID_RE = /^[a-z0-9]{16}$/;
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document", DOC = "application/msword";
const TYPES = { "application/pdf": { ext: "pdf", max: 10 * 1024 * 1024 }, "image/png": { ext: "png", max: 2 * 1024 * 1024 }, "image/jpeg": { ext: "jpg", max: 2 * 1024 * 1024 }, [DOCX]: { ext: "docx", max: 10 * 1024 * 1024 }, [DOC]: { ext: "doc", max: 10 * 1024 * 1024 } };
// what each caller accepts: broadcasts PDF and pictures; a syllabus PDF or Word (Hive's template is a .docx, 2026-10-22)
const ALLOW = { broadcast: ["application/pdf", "image/png", "image/jpeg"], syllabus: ["application/pdf", DOCX, DOC] };
const CHUNK = 2 * 1024 * 1024;
const PER_EVENT = 3;
const KEEP_DELETED_DAYS = 30;
const SITE = process.env.SITE_ORIGIN || "https://www.fengchao.life";

const key = (id) => `broadcast/${id}`;
const url = (id) => `${SITE}/api/f/${id}`;
function newId() { const a = "abcdefghijklmnopqrstuvwxyz0123456789", b = crypto.randomBytes(16); let s = ""; for (let i = 0; i < 16; i++) s += a[b[i] % a.length]; return s; }

// The real type, from the first bytes — the name and the declared type are not trusted.
function sniff(buf, name) {
  if (!buf || buf.length < 8) return "";
  if (buf.slice(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  // Word: a zip (docx) or an OLE compound file (doc), and named so — a zip that is not a .docx stays refused
  if (buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04 && /\.docx$/i.test(String(name || ""))) return DOCX;
  if (buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0 && /\.doc$/i.test(String(name || ""))) return DOC;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  return "";
}
const cleanName = (s) => String(s || "").replace(/[\u0000-\u001f\\/:*?"<>|]+/g, " ").trim().slice(0, 120) || "file";

// One chunk of an upload. chunk = { id?, replace?, name, size, index, total, data (base64) }. The first chunk
// decides the type and the id; the last one commits the blob and records the file. Returns { id, done, file? }.
// The largest file any caller accepts, hence the most chunks an upload may have (security review 2026-10-24: `total` and
// the bytes actually staged are bounded, not only the size the client declared).
// (a client may send chunks smaller than CHUNK — the website sends 1.5 MB — so the count is bounded as if chunks were 1 MB;
// the bytes staged are what really decides)
const MIN_CHUNK = 1024 * 1024;
const MAX_BYTES = Math.max(...Object.values(TYPES).map((t) => t.max));
const MAX_CHUNKS = Math.ceil(MAX_BYTES / MIN_CHUNK) + 1;
const chunksFor = (type) => Math.ceil(TYPES[type].max / MIN_CHUNK) + 1;
async function upload(chunk, by, opts) {
  const allow = ALLOW[(opts && opts.kind) || "broadcast"] || ALLOW.broadcast;
  const tag = opts && opts.tag ? String(opts.tag).slice(0, 40) : ""; // the application an anonymous upload belongs to
  const index = Number(chunk.index) || 0, total = Math.max(1, Number(chunk.total) || 1);
  if (!Number.isInteger(total) || total > MAX_CHUNKS || !Number.isInteger(index) || index < 0 || index >= total) throw bad("the upload is too large");
  const buf = Buffer.from(String(chunk.data || ""), "base64");
  if (!buf.length) throw bad("the chunk is empty");
  if (buf.length > CHUNK + 1024) throw bad(`a chunk is at most ${CHUNK / 1024 / 1024} MB`);
  const size = Number(chunk.size) || 0;
  let id = String(chunk.id || chunk.replace || "");
  const doc = await store.read(INDEX_BLOB, EMPTY_INDEX);
  let type, staged = buf.length;
  if (index === 0) {
    type = sniff(buf, chunk.name);
    if (!TYPES[type] || !allow.includes(type)) throw bad(allow.includes(DOCX) ? "only PDF and Word files can be uploaded" : "only PDF, PNG and JPG files can be attached");
    if (size > TYPES[type].max || total > chunksFor(type)) throw bad(`a ${TYPES[type].ext.toUpperCase()} is at most ${TYPES[type].max / 1024 / 1024} MB`);
    if (chunk.replace) { if (!ID_RE.test(id) || !doc.items[id] || doc.items[id].deletedAt) throw bad("no such file to replace"); }
    else id = newId();
  } else {
    if (!ID_RE.test(id)) throw bad("the upload has no id");
    const pending = (doc.items[id] && doc.items[id].pending) || null;
    if (!pending && !chunk.replace) throw bad("the upload was not started");
    // the chunks of one upload come from one caller, and together stay within the type's limit
    if (pending && pending.by !== by) throw bad("the upload was not started");
    type = (pending && pending.type) || (doc.items[id] && doc.items[id].type);
    staged = ((pending && pending.staged) || 0) + buf.length;
    if (staged > TYPES[type].max) throw bad(`a ${TYPES[type].ext.toUpperCase()} is at most ${TYPES[type].max / 1024 / 1024} MB`);
  }
  const blockId = Buffer.from(String(index).padStart(6, "0")).toString("base64");
  await blob.stageAssetBlock(key(id), blockId, buf);
  const at = new Date().toISOString();
  if (index + 1 < total) {
    await store.update(INDEX_BLOB, EMPTY_INDEX, (d) => { const cur = d.items[id] || {}; d.items[id] = Object.assign({}, cur, { pending: Object.assign({}, cur.pending || {}, { type, name: cleanName(chunk.name), size, by, at, blocks: total, staged, tag }) }); d.updatedAt = at; });
    return { id, done: false };
  }
  const blocks = []; for (let i = 0; i < total; i++) blocks.push(Buffer.from(String(i).padStart(6, "0")).toString("base64"));
  await blob.commitAssetBlocks(key(id), blocks, type, "public, max-age=300");
  let file;
  await store.update(INDEX_BLOB, EMPTY_INDEX, (d) => {
    const old = d.items[id] || {}, p = old.pending || {};
    file = { id, name: cleanName(chunk.name || p.name), type: type || p.type, size: staged, by, at, event: old.event || "", opens: old.opens || 0, deletedAt: null };
    if (tag || p.tag) file.application = tag || p.tag; // claimed by a course later (claim); unclaimed ones are swept
    d.items[id] = file; d.updatedAt = at;
  });
  return { id, done: true, file: Object.assign({ url: url(id) }, file) };
}

// The files an event may keep: known, not deleted, at most PER_EVENT. Returns the cleaned list (id, name, type, size).
async function attach(files) {
  const list = Array.isArray(files) ? files : [];
  if (list.length > PER_EVENT) throw bad(`at most ${PER_EVENT} files per event`);
  const doc = await store.read(INDEX_BLOB, EMPTY_INDEX);
  const out = [];
  for (const f of list) {
    const id = String((f && f.id) || "");
    const it = doc.items[id];
    if (!ID_RE.test(id) || !it || it.deletedAt || it.pending) throw bad(`unknown file ${JSON.stringify(id)}`);
    if (!out.some((x) => x.id === id)) out.push({ id, name: it.name, type: it.type, size: it.size });
  }
  return out;
}

// After an event is saved or deleted: files it now holds belong to it; files it let go are marked deleted.
async function settle(eventId, before, after) {
  const was = new Set((before || []).map((f) => f.id)), now = new Set((after || []).map((f) => f.id));
  if (!was.size && !now.size) return;
  const at = new Date().toISOString();
  await store.update(INDEX_BLOB, EMPTY_INDEX, (d) => {
    let changed = false;
    for (const id of now) if (d.items[id] && (d.items[id].event !== eventId || d.items[id].deletedAt)) { d.items[id].event = eventId; d.items[id].deletedAt = null; changed = true; }
    for (const id of was) if (!now.has(id) && d.items[id] && !d.items[id].deletedAt) { d.items[id].deletedAt = at; changed = true; }
    if (!changed) return false;
    d.updatedAt = at;
  });
}

// GET /api/f/<id>: { buffer, type, name } or null (unknown, deleted or still uploading).
async function serve(id) {
  if (!ID_RE.test(String(id || ""))) return null;
  const doc = await store.read(INDEX_BLOB, EMPTY_INDEX);
  const it = doc.items[id];
  if (!it || it.deletedAt || it.pending) return null;
  const a = await blob.readAsset(key(id));
  if (!a) return null;
  return { buffer: a.buffer, type: it.type || a.contentType, name: it.name };
}
// One more open (a GET that sent the file, not a 304 or a HEAD). Fire and forget.
function opened(id) { return store.update(INDEX_BLOB, EMPTY_INDEX, (d) => { if (!d.items[id]) return false; d.items[id].opens = (d.items[id].opens || 0) + 1; }).catch(() => {}); }

// Files whose event let them go more than KEEP_DELETED_DAYS ago are removed for good (called from a publish; best effort).
// An application's syllabus file now belongs to a course (applications.addCourse): it is no longer swept.
async function claim(ids, courseId) {
  if (!ids || !ids.length) return;
  await store.update(INDEX_BLOB, EMPTY_INDEX, (d) => { for (const id of ids) if (d.items[id]) { d.items[id].course = String(courseId); } d.updatedAt = new Date().toISOString(); });
}

// Files let go 30 days ago; an application's upload never claimed by a course after 7 days (the key's lifetime); an
// upload started but never finished after a day.
const UNCLAIMED_DAYS = 7;
async function cleanup(now) {
  const t = (now ? new Date(now) : new Date()).getTime();
  const doc = await store.read(INDEX_BLOB, EMPTY_INDEX);
  const age = (iso) => t - new Date(iso).getTime();
  const gone = Object.keys(doc.items).filter((id) => { const it = doc.items[id]; return (it.deletedAt && age(it.deletedAt) > KEEP_DELETED_DAYS * 86400000) || (it.application && !it.course && !it.event && !it.deletedAt && age(it.at) > UNCLAIMED_DAYS * 86400000) || (it.pending && !it.at && age(it.pending.at) > 86400000); });
  if (!gone.length) return 0;
  for (const id of gone) { try { await blob.deleteAsset(key(id)); } catch { /* try again next time */ } }
  await store.update(INDEX_BLOB, EMPTY_INDEX, (d) => { for (const id of gone) delete d.items[id]; d.updatedAt = new Date().toISOString(); });
  return gone.length;
}

// What the publish panel and the form show for one file.
async function info(ids) {
  const doc = await store.read(INDEX_BLOB, EMPTY_INDEX);
  return (ids || []).map((id) => doc.items[id] ? Object.assign({ url: url(id) }, doc.items[id]) : null).filter(Boolean);
}

const bad = (m) => Object.assign(new Error(m), { status: 400 });

module.exports = { DOCX, DOC, ALLOW, ID_RE, TYPES, CHUNK, MAX_CHUNKS, PER_EVENT, KEEP_DELETED_DAYS, UNCLAIMED_DAYS, INDEX_BLOB, url, sniff, upload, attach, settle, serve, opened, cleanup, claim, info };
