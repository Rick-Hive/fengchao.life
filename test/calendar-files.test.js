// 系统广播 attachments (Rick, 2026-10-18): a PDF or picture stored once and linked from the calendar body — never a
// copy in each recipient's calendar. api/shared/files.js, the upload op of api/calendar, GET /api/f/<id>.
//
// Run with:  node test/calendar-files.test.js
const assert = require("assert");
const path = require("path");
const Module = require("module");
const realResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) { if (request === "@azure/storage-blob") return "@azure/storage-blob"; return realResolve.call(this, request, parent, ...rest); };
require.cache["@azure/storage-blob"] = { id: "@azure/storage-blob", filename: "@azure/storage-blob", loaded: true, exports: { BlobServiceClient: { fromConnectionString() { throw new Error("no storage in test"); } } } };
delete process.env.STORAGE_CONNECTION_STRING;
process.env.HIVE_ADMINS = "hive.admin@fengchao.life";
const R = (...p) => path.join(__dirname, "..", ...p);

const blobs = {};
const copy = (x) => JSON.parse(JSON.stringify(x));
const jsonstore = require(R("api", "shared", "jsonstore.js"));
jsonstore.read = async (name, fallback) => (blobs[name] ? copy(blobs[name]) : (typeof fallback === "function" ? fallback() : copy(fallback)));
jsonstore.write = async (name, doc) => { blobs[name] = copy(doc); };
jsonstore.update = async (name, fallback, mutate) => { const doc = await jsonstore.read(name, fallback); const result = await mutate(doc); if (result !== false) blobs[name] = copy(doc); return { doc, result, written: result !== false }; };

// the assets container, faked: staged blocks and committed files
const staged = {}, assets = {};
const blobMod = require(R("api", "shared", "blob.js"));
blobMod.stageAssetBlock = async (key, blockId, buf) => { (staged[key] = staged[key] || {})[blockId] = Buffer.from(buf); };
blobMod.commitAssetBlocks = async (key, ids, type) => { assets[key] = { buffer: Buffer.concat(ids.map((i) => staged[key][i])), contentType: type }; delete staged[key]; };
blobMod.readAsset = async (key) => assets[key] || null;
blobMod.deleteAsset = async (key) => { delete assets[key]; };

const dir = require(R("api", "shared", "directory.js"));
dir.readDomain = async (d) => ({ domain: d, users: [{ upn: "t1@a.edu", displayName: "T One", enabled: true, department: "老师", plan: "faculty", groups: [] }] });
dir.cachedDomains = async () => [{ domain: "a.edu" }];
const peopleMod = require(R("api", "shared", "people.js"));
peopleMod.readPeople = async () => ({ people: {} });
peopleMod.readInstitutions = async () => ({ institutions: {} });
const session = require(R("api", "shared", "session.js"));
session.guard = async (context, req) => { if (req.headers && req.headers["x-ms-client-principal"]) return { u: "x" }; context.res = { status: 403, body: { code: "signed_out" } }; return null; };
session.finish = () => {};
require(R("api", "shared", "roles.js")).readRoles = async () => ({ entries: [] });
require(R("api", "shared", "audit.js")).audit = async () => {};
const FILES = require(R("api", "shared", "files.js"));
const SYNC = require(R("api", "shared", "calendarSync.js"));
const fn = require(R("api", "calendar", "index.js"));
const serveFn = require(R("api", "f", "index.js"));
const principal = (user, roles) => Buffer.from(JSON.stringify({ identityProvider: "aad", userId: "x", userDetails: user, userRoles: ["anonymous", "authenticated"].concat(roles || []) })).toString("base64");
async function call({ method = "POST", query = {}, body = null, user, roles }) {
  const context = { log: Object.assign(() => {}, { error() {}, warn() {} }), res: null };
  await fn(context, { method, query, body, headers: user ? { "x-ms-client-principal": principal(user, roles) } : {} });
  return context.res;
}
async function serve(id, headers, method) {
  const context = { log: Object.assign(() => {}, { error() {}, warn() {} }), res: null };
  await serveFn(context, { method: method || "GET", params: { id }, headers: headers || {} });
  return context.res;
}
const COMM = ["staff:community"], LEADER = ["domain_leader:a.edu"];
const comm = (body) => call({ body: Object.assign({ layer: "hive" }, body), user: "comm@fengchao.life", roles: COMM });

// a PDF of n bytes and a PNG of n bytes (real headers, filler after)
const pdf = (n) => Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(Math.max(0, n - 9), 0x20)]);
const png = (n) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(Math.max(0, n - 8), 1)]);
// upload a buffer in chunks the way the browser does; returns the last answer
async function up(buf, name, extra) {
  const total = Math.max(1, Math.ceil(buf.length / FILES.CHUNK));
  let id = extra && extra.replace ? extra.replace : "", r;
  for (let i = 0; i < total; i++) {
    r = await comm(Object.assign({ op: "upload", name, size: buf.length, index: i, total, data: buf.slice(i * FILES.CHUNK, (i + 1) * FILES.CHUNK).toString("base64"), id }, extra || {}));
    if (r.status !== 200) return r;
    id = r.body.id;
  }
  return r;
}

(async () => {
  // ---- type and size are judged from the bytes ----
  assert.deepStrictEqual([FILES.sniff(pdf(100)), FILES.sniff(png(100)), FILES.sniff(Buffer.from("<html>hello</html>"))], ["application/pdf", "image/png", ""]);
  let r = await up(Buffer.from("<svg onload=alert(1)></svg> padding padding"), "evil.pdf");
  assert.strictEqual(r.status, 400, "a file that is not a PDF / PNG / JPG is refused whatever its name: " + JSON.stringify(r.body));
  r = await up(pdf(11 * 1024 * 1024), "big.pdf");
  assert.strictEqual(r.status, 400); assert.ok(/10 MB/.test(r.body.error), "a PDF over 10 MB is refused: " + r.body.error);
  r = await up(png(3 * 1024 * 1024), "big.png");
  assert.strictEqual(r.status, 400); assert.ok(/2 MB/.test(r.body.error), "a picture over 2 MB is refused: " + r.body.error);
  r = await call({ body: { layer: "hive", op: "upload", name: "x.pdf", size: 100, index: 0, total: 1, data: pdf(100).toString("base64") }, user: "lead@a.edu", roles: LEADER });
  assert.strictEqual(r.status, 403, "a school leader does not upload broadcast files");

  // ---- a 5 MB PDF in three chunks ----
  const big = pdf(5 * 1024 * 1024);
  r = await up(big, "培训 手册:2026.pdf");
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.ok(r.body.done && /^[a-z0-9]{16}$/.test(r.body.id), "the last chunk answers with the id");
  const f1 = r.body.file;
  assert.deepStrictEqual([f1.name, f1.type, f1.size, f1.url], ["培训 手册 2026.pdf", "application/pdf", big.length, "https://www.fengchao.life/api/f/" + f1.id], "name cleaned, type from the bytes, public link");
  assert.strictEqual(assets["broadcast/" + f1.id].buffer.length, big.length, "the chunks were joined");
  // an unfinished upload is not a file yet
  const half = await comm({ op: "upload", name: "half.pdf", size: 3 * 1024 * 1024, index: 0, total: 2, data: pdf(FILES.CHUNK).toString("base64") });
  assert.ok(half.status === 200 && !half.body.done, "the first of two chunks is accepted and waits");
  r = await serve(half.body.id); assert.strictEqual(r.status, 404, "half a file does not open");

  // ---- the event keeps the file; the body gets a link, no picture, no copy ----
  const img = await up(png(1000), "poster.png");
  r = await comm({ op: "save", event: { title: "联合培训", start: "2026-12-05T19:00", end: "2026-12-05T20:00", timeZone: "Asia/Shanghai", targets: ["*"], files: [{ id: f1.id }, { id: img.body.id }] } });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  const ev = r.body.event;
  assert.deepStrictEqual(ev.files.map((f) => [f.id, f.name, f.type]), [[f1.id, "培训 手册 2026.pdf", "application/pdf"], [img.body.id, "poster.png", "image/png"]], "files stored with their recorded name and type");
  const body = SYNC.graphBody(ev, "hive").body.content;
  assert.ok(body.includes(`<a href="https://www.fengchao.life/api/f/${f1.id}">培训 手册 2026.pdf</a>`) && body.includes("附件 Files"), "links in the body: " + body);
  assert.ok(!/<img/.test(body), "no picture embedded");
  assert.strictEqual(blobs[FILES.INDEX_BLOB].items[f1.id].event, ev.id, "the file knows its event");
  r = await comm({ op: "save", event: Object.assign({}, ev, { files: [{ id: "zzzzzzzzzzzzzzzz" }] }) });
  assert.strictEqual(r.status, 400, "an unknown file id is refused");
  r = await comm({ op: "save", event: Object.assign({}, ev, { files: [{ id: f1.id }, { id: img.body.id }, { id: half.body.id }] }) });
  assert.strictEqual(r.status, 400, "a half-uploaded file cannot be attached");
  const many = [f1, img.body.file, (await up(png(500), "a.png")).body.file, (await up(png(500), "b.png")).body.file];
  r = await comm({ op: "save", event: Object.assign({}, ev, { files: many.map((f) => ({ id: f.id })) }) });
  assert.strictEqual(r.status, 400); assert.ok(/at most 3 files/.test(JSON.stringify(r.body)), "four files are too many: " + JSON.stringify(r.body));

  // ---- anyone with the link opens it, inline, cached briefly, counted ----
  r = await serve(f1.id);
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual([r.headers["Content-Type"], r.headers["Cache-Control"], r.headers["X-Content-Type-Options"]], ["application/pdf", "public, max-age=300", "nosniff"]);
  assert.ok(/^inline; filename\*=UTF-8''/.test(r.headers["Content-Disposition"]) && r.headers["Content-Disposition"].includes(encodeURIComponent("培训 手册 2026.pdf")), "shown inline under its name: " + r.headers["Content-Disposition"]);
  assert.strictEqual(r.body.length, big.length);
  const etag = r.headers.ETag;
  r = await serve(f1.id, { "if-none-match": etag }); assert.strictEqual(r.status, 304, "a browser that has it gets 304");
  await serve(f1.id); await serve(f1.id, {}, "HEAD");
  await new Promise((res) => setTimeout(res, 10));
  assert.strictEqual(blobs[FILES.INDEX_BLOB].items[f1.id].opens, 2, "GETs with a body are counted, 304 and HEAD are not: " + blobs[FILES.INDEX_BLOB].items[f1.id].opens);
  r = await serve("nonexistent12345"); assert.strictEqual(r.status, 404);
  r = await serve("../../roles.json"); assert.strictEqual(r.status, 404, "only a file id is a path");

  // ---- replacing keeps the link; the body does not change when the name stays ----
  const v2 = pdf(2000);
  r = await up(v2, "培训 手册 2026.pdf", { replace: f1.id });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body)); assert.strictEqual(r.body.id, f1.id, "same id, same link");
  r = await serve(f1.id); assert.strictEqual(r.body.length, 2000, "the new content is served"); assert.notStrictEqual(r.headers.ETag, etag, "with a new ETag");
  assert.strictEqual(SYNC.graphBody(ev, "hive").body.content, body, "the calendar body is unchanged: no re-publish needed");

  // ---- letting a file go: marked, gone from the link, removed for good 30 days later ----
  r = await comm({ op: "save", event: Object.assign({}, ev, { files: [{ id: f1.id }] }) });
  assert.strictEqual(r.status, 200);
  assert.ok(blobs[FILES.INDEX_BLOB].items[img.body.id].deletedAt, "the dropped picture is marked deleted");
  r = await serve(img.body.id); assert.strictEqual(r.status, 404, "and no longer opens");
  assert.ok(assets["broadcast/" + img.body.id], "but is still stored");
  assert.strictEqual(await FILES.cleanup(), 0, "not removed yet");
  assert.strictEqual(await FILES.cleanup(Date.now() + 31 * 86400000), 2, "removed after 30 days — and the upload that was never finished goes too (a day old is enough for that)");
  assert.ok(!assets["broadcast/" + img.body.id] && !blobs[FILES.INDEX_BLOB].items[img.body.id], "blob and record gone");
  r = await comm({ op: "delete", id: ev.id }); assert.strictEqual(r.status, 200);
  assert.ok(blobs[FILES.INDEX_BLOB].items[f1.id].deletedAt, "deleting the event lets its files go");
  r = await comm({ op: "save", event: Object.assign({}, ev, { id: undefined, files: [{ id: f1.id }] }) });
  assert.strictEqual(r.status, 400, "a let-go file cannot be attached again");
  console.log("calendar-files: all assertions passed");
})().catch((e) => { console.error(e); process.exit(1); });
