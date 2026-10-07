// One small JSON document per blob, written with optimistic concurrency.
//
// The CRM keeps its hand-maintained records in small JSON blobs (roles.json,
// crm/partners.json, crm/licenses.json, …). Every write used to be read → change
// → upload: two people saving at the same minute would lose one of the changes
// (design §7 promised ETag concurrency for these; only the order files had it —
// self-review, 2026-10-08). update() reads the document with its ETag, applies the
// change, and uploads with If-Match; a 412 (someone else wrote meanwhile) rereads
// and reapplies, up to five times. Readers keep calling read().
//
// The blob clients are the minimal set the tests fake: exists, downloadToBuffer,
// getProperties (optional — without it the write is unconditional), upload.
const { BlobServiceClient } = require("@azure/storage-blob");
const { snapshotBlob } = require("./config");

function container() {
  const conn = process.env.STORAGE_CONNECTION_STRING;
  if (!conn) throw new Error("STORAGE_CONNECTION_STRING app setting is not configured");
  return BlobServiceClient.fromConnectionString(conn).getContainerClient(snapshotBlob.container);
}

// { doc, etag } — doc is `fallback` (a fresh copy per call) when the blob is missing or unreadable.
async function readWithTag(name, fallback) {
  const b = container().getBlockBlobClient(name);
  const fresh = () => (typeof fallback === "function" ? fallback() : JSON.parse(JSON.stringify(fallback)));
  if (!(await b.exists())) return { doc: fresh(), etag: null };
  let etag = null;
  try { if (typeof b.getProperties === "function") etag = (await b.getProperties()).etag || null; } catch { etag = null; }
  try { return { doc: JSON.parse((await b.downloadToBuffer()).toString("utf8")), etag }; } catch { return { doc: fresh(), etag }; }
}
async function read(name, fallback) { return (await readWithTag(name, fallback)).doc; }

async function write(name, doc, etag) {
  const c = container();
  await c.createIfNotExists();
  const body = JSON.stringify(doc);
  const opts = { blobHTTPHeaders: { blobContentType: "application/json; charset=utf-8" } };
  if (etag) opts.conditions = { ifMatch: etag };
  await c.getBlockBlobClient(name).upload(body, Buffer.byteLength(body), opts);
}

// Apply `mutate(doc)` and save. mutate may return false to leave the blob untouched,
// or a value to hand back; the saved document is returned as `doc`.
async function update(name, fallback, mutate) {
  let lastErr = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const { doc, etag } = await readWithTag(name, fallback);
    const result = await mutate(doc);
    if (result === false) return { doc, result, written: false };
    try {
      await write(name, doc, etag);
      return { doc, result, written: true };
    } catch (err) {
      const status = err && (err.statusCode || (err.details && err.details.errorCode === "ConditionNotMet" ? 412 : 0));
      if (status !== 412) throw err;
      lastErr = err;
    }
  }
  throw Object.assign(new Error(`${name}: could not save after 5 attempts — another change kept landing first`), { code: "conflict", cause: lastErr });
}

module.exports = { read, readWithTag, write, update };
