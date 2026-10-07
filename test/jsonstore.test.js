// jsonstore.update: read → change → write under the ETag; a concurrent write is
// detected (412) and the change reapplied on the fresh document, never lost.
//
// Run with:  node test/jsonstore.test.js
const assert = require("assert");
const path = require("path");
const Module = require("module");

// A fake blob: content + etag; upload with a stale If-Match fails like Azure does.
let content = null, etag = 0, uploads = 0, interfere = null;
const realResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) { if (request === "@azure/storage-blob") return "@azure/storage-blob"; return realResolve.call(this, request, parent, ...rest); };
require.cache["@azure/storage-blob"] = { id: "@azure/storage-blob", filename: "@azure/storage-blob", loaded: true, exports: { BlobServiceClient: { fromConnectionString: () => ({ getContainerClient: () => ({
  createIfNotExists: async () => {},
  getBlockBlobClient: () => ({
    exists: async () => content !== null,
    getProperties: async () => ({ etag: '"' + etag + '"' }),
    downloadToBuffer: async () => Buffer.from(content),
    upload: async (body, len, opts) => {
      if (interfere) { const f = interfere; interfere = null; f(); } // someone else writes first
      if (opts && opts.conditions && opts.conditions.ifMatch !== '"' + etag + '"') { const e = new Error("The condition specified using HTTP conditional header(s) is not met."); e.statusCode = 412; throw e; }
      content = body; etag++; uploads++;
    },
  }),
}) }) } } };
process.env.STORAGE_CONNECTION_STRING = "UseDevelopmentStorage=true";
const store = require(path.join(__dirname, "..", "api", "shared", "jsonstore.js"));

(async () => {
  // Missing blob → the fallback is a fresh copy each time (not shared state).
  const fb = { items: [] };
  let r = await store.update("x.json", fb, (d) => { d.items.push("a"); });
  assert.deepStrictEqual(JSON.parse(content), { items: ["a"] }); assert.strictEqual(r.written, true); assert.deepStrictEqual(fb, { items: [] }, "fallback untouched");

  // Plain update under the ETag.
  r = await store.update("x.json", fb, (d) => { d.items.push("b"); return d.items.length; });
  assert.strictEqual(r.result, 2); assert.deepStrictEqual(JSON.parse(content).items, ["a", "b"]);

  // mutate returns false → nothing written.
  const before = uploads;
  r = await store.update("x.json", fb, () => false);
  assert.strictEqual(uploads, before); assert.strictEqual(r.written, false);

  // A concurrent write between our read and our write: the first upload fails with 412,
  // the change is reapplied on the fresh document, and both changes survive.
  interfere = () => { content = JSON.stringify({ items: ["a", "b", "theirs"] }); etag++; };
  let calls = 0;
  r = await store.update("x.json", fb, (d) => { calls++; d.items.push("mine"); });
  assert.strictEqual(calls, 2, "mutate ran again after the conflict");
  assert.deepStrictEqual(JSON.parse(content).items, ["a", "b", "theirs", "mine"], "neither change lost");

  // Five conflicts in a row → a conflict error, not an infinite loop.
  let n = 0; const keep = () => { content = JSON.stringify({ items: [n++] }); etag++; interfere = keep; }; interfere = keep;
  await assert.rejects(() => store.update("x.json", fb, (d) => { d.items.push("x"); }), (e) => e.code === "conflict");
  interfere = null;

  // read() returns the document or the fallback.
  assert.deepStrictEqual(await store.read("x.json", fb), JSON.parse(content));
  content = null; assert.deepStrictEqual(await store.read("x.json", { items: [] }), { items: [] });
  console.log("jsonstore: all assertions passed");
})().catch((e) => { console.error(e); process.exit(1); });
