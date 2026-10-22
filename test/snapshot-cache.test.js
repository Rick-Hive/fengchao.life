// readSnapshot keeps the last download and asks the blob only for its ETag while it is unchanged
// (Rick 2026-10-22: 「Why loading the curriculum map so slow?」). Run with: node test/snapshot-cache.test.js
const assert = require("assert");
const path = require("path");
const Module = require("module");
const realResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) { if (request === "@azure/storage-blob") return "@azure/storage-blob"; return realResolve.call(this, request, parent, ...rest); };
const calls = []; let stored = null, etag = '"1"';
const blobClient = {
  async getProperties() { calls.push("head"); if (!stored) throw Object.assign(new Error("nf"), { statusCode: 404 }); return { etag }; },
  async downloadToBuffer(o, c, opts) { calls.push("get"); if (opts && opts.conditions && opts.conditions.ifMatch && opts.conditions.ifMatch !== etag) throw Object.assign(new Error("pre"), { statusCode: 412 }); return Buffer.from(stored); },
};
require.cache["@azure/storage-blob"] = { id: "@azure/storage-blob", filename: "@azure/storage-blob", loaded: true, exports: { BlobServiceClient: { fromConnectionString() { return { getContainerClient() { return { getBlockBlobClient() { return blobClient; } }; } }; } } } };
process.env.STORAGE_CONNECTION_STRING = "x";
const { readSnapshot } = require(path.join(__dirname, "..", "api", "shared", "blob.js"));
(async () => {
  assert.strictEqual(await readSnapshot(), null, "no snapshot yet");
  stored = JSON.stringify({ generatedAt: "a", courses: [1] });
  const a = await readSnapshot(); calls.length = 0;
  const b = await readSnapshot();
  assert.deepStrictEqual(calls, ["head"], "unchanged: a HEAD, no download");
  assert.deepStrictEqual(b, a); assert.notStrictEqual(a, b, "each caller its own object");
  b.courses.push(2); assert.deepStrictEqual((await readSnapshot()).courses, [1], "a caller's change stays its own");
  stored = JSON.stringify({ generatedAt: "b" }); etag = '"2"'; calls.length = 0;
  assert.strictEqual((await readSnapshot()).generatedAt, "b", "a new ETag: downloaded again");
  assert.deepStrictEqual(calls, ["head", "get"]);
  console.log("snapshot-cache: all assertions passed");
})().catch((e) => { console.error(e); process.exit(1); });
