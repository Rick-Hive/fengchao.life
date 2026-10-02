// /api/data caching behaviour: ETag + 304, stale-while-revalidate, gzip when
// accepted, the private section stripped, encoded once per snapshot.
//
// Run with:  node test/data.test.js
const assert = require("assert");
const path = require("path");
const zlib = require("zlib");

// Stand in for ../shared/blob before api/data loads it.
let snapshot = { generatedAt: "2026-10-01T17:00:00Z", tracks: [{ id: 1 }], private: { teams: "secret" } };
const blobPath = require.resolve(path.join(__dirname, "..", "api", "shared", "blob.js"));
require.cache[blobPath] = { id: blobPath, filename: blobPath, loaded: true, exports: { readSnapshot: async () => snapshot } };
const dataFn = require(path.join(__dirname, "..", "api", "data", "index.js"));

async function call(headers) {
  const context = { log: Object.assign(() => {}, { error() {}, warn() {} }), res: null };
  await dataFn(context, { method: "GET", headers: headers || {}, query: {} });
  return context.res;
}

(async () => {
  // Plain JSON when gzip is not accepted; private stripped; cache headers present.
  let r = await call({});
  assert.strictEqual(r.status, 200);
  assert.ok(r.isRaw);
  const body = JSON.parse(r.body.toString("utf8"));
  assert.deepStrictEqual(Object.keys(body).sort(), ["generatedAt", "tracks"]);
  assert.ok(!("private" in body));
  assert.strictEqual(r.headers["Cache-Control"], "public, max-age=300, stale-while-revalidate=86400");
  assert.ok(/^"[A-Za-z0-9_-]{20}"$/.test(r.headers.ETag), r.headers.ETag);
  assert.strictEqual(r.headers["Content-Encoding"], undefined);
  const etag = r.headers.ETag;

  // gzip when accepted, same content.
  r = await call({ "accept-encoding": "gzip, deflate, br" });
  assert.strictEqual(r.headers["Content-Encoding"], "gzip");
  assert.strictEqual(r.headers.Vary, "Accept-Encoding");
  assert.deepStrictEqual(JSON.parse(zlib.gunzipSync(r.body).toString("utf8")), body);
  assert.ok(r.body.length < Buffer.byteLength(JSON.stringify(body)) + 40, "gzip output is not larger than the JSON");

  // 304 on a matching ETag (also weak form), no body.
  r = await call({ "if-none-match": etag });
  assert.strictEqual(r.status, 304);
  assert.strictEqual(r.body, null);
  r = await call({ "if-none-match": 'W/' + etag + ', "other"' });
  assert.strictEqual(r.status, 304);
  r = await call({ "if-none-match": '"stale"' });
  assert.strictEqual(r.status, 200);

  // A new snapshot gives a new ETag (after the 60-second in-memory window; force it).
  snapshot = { generatedAt: "2026-10-02T17:00:00Z", tracks: [{ id: 1 }, { id: 2 }] };
  const realNow = Date.now; Date.now = () => realNow() + 61000;
  r = await call({});
  Date.now = realNow;
  assert.notStrictEqual(r.headers.ETag, etag);
  assert.strictEqual(JSON.parse(r.body.toString("utf8")).tracks.length, 2);

  console.log("data: all assertions passed");
})().catch((e) => { console.error(e); process.exit(1); });
