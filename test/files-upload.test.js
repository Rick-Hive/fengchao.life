// The chunked upload's bounds (security review 2026-10-24): `total` and `index` within the type's limit, the bytes
// actually staged counted (not only the size the client declared), the chunks of one upload from one caller, an
// application's upload tagged and swept when no course claims it.
// Run with: node test/files-upload.test.js
const assert = require("assert");
const path = require("path");
const Module = require("module");
const realResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) { if (request === "@azure/storage-blob") return "@azure/storage-blob"; return realResolve.call(this, request, parent, ...rest); };
require.cache["@azure/storage-blob"] = { id: "@azure/storage-blob", filename: "@azure/storage-blob", loaded: true, exports: { BlobServiceClient: { fromConnectionString() { throw new Error("no storage in tests"); } } } };
const R = (...p) => path.join(__dirname, "..", ...p);
const store = require(R("api", "shared", "jsonstore.js")), blob = require(R("api", "shared", "blob.js"));
const MEM = {};
store.read = async (n, fb) => (MEM[n] ? JSON.parse(JSON.stringify(MEM[n])) : (typeof fb === "function" ? fb() : JSON.parse(JSON.stringify(fb))));
store.update = async (n, fb, m) => { const d = MEM[n] ? JSON.parse(JSON.stringify(MEM[n])) : (typeof fb === "function" ? fb() : JSON.parse(JSON.stringify(fb))); if (m(d) !== false) MEM[n] = d; return { doc: d }; };
const staged = {}, committed = {}, deleted = [];
blob.stageAssetBlock = async (k, id, buf) => { (staged[k] = staged[k] || []).push(buf.length); };
blob.commitAssetBlocks = async (k, ids, type) => { committed[k] = { type, n: ids.length }; };
blob.deleteAsset = async (k) => { deleted.push(k); };
const F = require(R("api", "shared", "files.js"));
const pdfHead = Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(100, 65)]);
const b64 = (b) => b.toString("base64");
(async () => {
  // bounds on the number of chunks and on the index
  await assert.rejects(F.upload({ name: "a.pdf", size: 100, index: 0, total: 999, data: b64(pdfHead) }, "u1", { kind: "syllabus" }), /too large/);
  await assert.rejects(F.upload({ name: "a.pdf", size: 100, index: 3, total: 3, data: b64(pdfHead) }, "u1", { kind: "syllabus" }), /too large/);
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(50)]);
  await assert.rejects(F.upload({ name: "a.png", size: 100, index: 0, total: 5, data: b64(png) }, "u1", { kind: "broadcast" }), /PNG is at most 2 MB/, "more chunks than a 2 MB PNG needs");
  // a declared size of 10 with 3 MB actually staged: refused on the chunk that crosses the limit
  F.TYPES["application/pdf"].max = 2 * 1024 * 1024; // smaller for the test
  let r = await F.upload({ name: "a.pdf", size: 10, index: 0, total: 2, data: b64(Buffer.concat([pdfHead, Buffer.alloc(1.5 * 1024 * 1024)])) }, "apply:REL-000001", { kind: "syllabus", tag: "REL-000001" });
  assert.ok(r.id && !r.done);
  await assert.rejects(F.upload({ id: r.id, name: "a.pdf", size: 10, index: 1, total: 2, data: b64(Buffer.alloc(1.5 * 1024 * 1024)) }, "apply:REL-000001", { kind: "syllabus" }), /at most 2 MB/, "the staged bytes count, not the declared size");
  // the chunks of one upload come from one caller
  await assert.rejects(F.upload({ id: r.id, name: "a.pdf", size: 10, index: 1, total: 2, data: b64(Buffer.alloc(10)) }, "apply:REL-000002", { kind: "syllabus" }), /not started/, "another caller cannot finish it");
  r = await F.upload({ id: r.id, name: "a.pdf", size: 10, index: 1, total: 2, data: b64(Buffer.alloc(10)) }, "apply:REL-000001", { kind: "syllabus" });
  assert.ok(r.done && r.file.size === pdfHead.length + 1.5 * 1024 * 1024 + 10, "the size recorded is what was staged");
  assert.strictEqual(MEM[F.INDEX_BLOB].items[r.id].application, "REL-000001", "tagged with the application");
  // unclaimed for 8 days: swept; claimed by a course: kept
  const id1 = r.id;
  const r2 = await F.upload({ name: "b.pdf", size: 100, index: 0, total: 1, data: b64(pdfHead) }, "apply:REL-000001", { kind: "syllabus", tag: "REL-000001" });
  await F.claim([r2.id], "newCOURSE00000001");
  const later = new Date(Date.now() + 8 * 864e5).toISOString();
  const n = await F.cleanup(later);
  assert.strictEqual(n, 1); assert.deepStrictEqual(deleted, ["broadcast/" + id1]); assert.ok(MEM[F.INDEX_BLOB].items[r2.id] && !MEM[F.INDEX_BLOB].items[id1]);
  console.log("files-upload: all assertions passed");
})().catch((e) => { console.error(e); process.exit(1); });
