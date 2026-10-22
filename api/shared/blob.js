// Snapshot + asset storage helpers (Azure Blob Storage).
const { BlobServiceClient } = require("@azure/storage-blob");
const { snapshotBlob, assetsBlob } = require("./config");

function getService() {
  const conn = process.env.STORAGE_CONNECTION_STRING;
  if (!conn) throw new Error("STORAGE_CONNECTION_STRING app setting is not configured");
  return BlobServiceClient.fromConnectionString(conn);
}

function getContainerClient() {
  return getService().getContainerClient(snapshotBlob.container);
}

function getAssetsContainerClient() {
  return getService().getContainerClient(assetsBlob.container);
}

// The snapshot is a single blob replaced whole on every sync — Airtable is the
// only source of truth, so a full replace is what keeps the site from drifting.
// The cost of that model is that one bad sync overwrites everything, so the
// previous snapshot is copied aside first and can be restored (see the sync
// function's guard and restoreSnapshot below).
const prevName = snapshotBlob.name.replace(/\.json$/i, "") + ".previous.json";

async function writeSnapshot(obj) {
  const container = getContainerClient();
  await container.createIfNotExists();
  const blob = container.getBlockBlobClient(snapshotBlob.name);

  // Keep one generation of history. Best-effort: never fail a sync because the
  // backup copy could not be made.
  if (await blob.exists()) {
    try {
      const prev = container.getBlockBlobClient(prevName);
      const copy = await prev.beginCopyFromURL(blob.url);
      await copy.pollUntilDone();
    } catch (e) {
      // ignore — the sync itself matters more than the backup
    }
  }

  const body = JSON.stringify(obj);
  snapCache = { etag: "", text: null };
  await blob.upload(body, Buffer.byteLength(body), {
    blobHTTPHeaders: { blobContentType: "application/json; charset=utf-8" },
  });
}

// Roll the site back to the snapshot taken before the most recent sync.
async function restoreSnapshot() {
  const container = getContainerClient();
  const prev = container.getBlockBlobClient(prevName);
  if (!(await prev.exists())) return null;
  const buf = await prev.downloadToBuffer();
  const blob = container.getBlockBlobClient(snapshotBlob.name);
  snapCache = { etag: "", text: null };
  await blob.upload(buf, buf.length, {
    blobHTTPHeaders: { blobContentType: "application/json; charset=utf-8" },
  });
  return JSON.parse(buf.toString("utf8"));
}

// The snapshot is several MB and some 25 endpoints read it on every request (the curriculum map page alone three
// times: school-plan, data, seats — Rick 2026-10-22: 「Why loading the curriculum map so slow?」). The function
// instance keeps the last download's text and asks the blob only for its ETag (a HEAD) while it is unchanged; a
// sync writes a new ETag, so the next read downloads again. Each caller still gets its own parsed object, so a
// caller that changes what it read changes nothing for the others.
let snapCache = { etag: "", text: null };
async function readSnapshot() {
  const container = getContainerClient();
  const blob = container.getBlockBlobClient(snapshotBlob.name);
  let props;
  try { props = await blob.getProperties(); }
  catch (e) { if (e && (e.statusCode === 404 || e.code === "BlobNotFound")) { snapCache = { etag: "", text: null }; return null; } throw e; }
  if (snapCache.text && props.etag && snapCache.etag === props.etag) return JSON.parse(snapCache.text);
  let buf;
  try { buf = await blob.downloadToBuffer(0, undefined, { conditions: props.etag ? { ifMatch: props.etag } : undefined }); }
  catch (e) { if (e && e.statusCode === 412) { props = { etag: "" }; buf = await blob.downloadToBuffer(); } else throw e; } // written in between: take the new one, uncached
  const text = buf.toString("utf8");
  snapCache = props.etag ? { etag: props.etag, text } : { etag: "", text: null };
  return JSON.parse(text);
}

// Hand out the next number in a named counter, atomically.
//
// Order ids embed a per-day, per-school running number (FC-20260831-KXC-001),
// which means two parents ordering from the same hive in the same second must
// not receive the same number. Blob storage has no increment primitive, so this
// uses optimistic concurrency: read the value with its ETag, write back with
// If-Match, and retry when someone else won the race. `ifNoneMatch: "*"` makes
// the very first write fail rather than clobber a counter created concurrently.
//
// Throws if it cannot get a number. Callers must treat that as non-fatal and
// fall back to a random suffix — losing a tidy sequence is a cosmetic problem,
// losing an order is not.
async function nextSequence(key, attempts) {
  const container = getContainerClient();
  await container.createIfNotExists();
  const blob = container.getBlockBlobClient("counters/" + key + ".txt");
  const tries = attempts || 6;

  for (let i = 0; i < tries; i++) {
    try {
      let current = 0;
      let conditions;
      if (await blob.exists()) {
        const props = await blob.getProperties();
        const buf = await blob.downloadToBuffer();
        const parsed = parseInt(buf.toString("utf8").trim(), 10);
        current = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
        conditions = { ifMatch: props.etag };
      } else {
        conditions = { ifNoneMatch: "*" };
      }

      const next = current + 1;
      const body = String(next);
      await blob.upload(body, Buffer.byteLength(body), {
        conditions,
        blobHTTPHeaders: { blobContentType: "text/plain; charset=utf-8" },
      });
      return next;
    } catch (err) {
      // 412 Precondition Failed / 409 Conflict = lost the race; read and retry.
      const status = err && err.statusCode;
      if (status !== 412 && status !== 409) throw err;
      await new Promise((r) => setTimeout(r, 40 + Math.floor(Math.random() * 80)));
    }
  }
  throw new Error(`nextSequence(${key}): still contended after ${tries} attempts`);
}

// Mirror one binary asset (teacher photo, syllabus file) into the assets container.
// Asset keys carry the Airtable attachment id (teachers/recX-attY.jpg), so a key
// never changes content: the blob can be cached by browsers for a year.
const UNIQUE_KEY_RE = /-att[A-Za-z0-9]{8,}\./;
const LONG_CACHE = "public, max-age=31536000, immutable";
const DAY_CACHE = "public, max-age=86400";
function cacheControlFor(key) { return UNIQUE_KEY_RE.test(String(key || "")) ? LONG_CACHE : DAY_CACHE; }

async function writeAsset(key, buffer, contentType) {
  const container = getAssetsContainerClient();
  await container.createIfNotExists();
  const blob = container.getBlockBlobClient(key);
  await blob.upload(buffer, buffer.length, {
    blobHTTPHeaders: { blobContentType: contentType || "application/octet-stream", blobCacheControl: cacheControlFor(key) },
  });
}

// Where the public site loads an asset from: always through /api/asset. A direct
// blob-storage URL was built and then withdrawn (Rick, 2026-10-02: 「I prefer
// security than speed」) — it would have needed anonymous blob access enabled on
// the storage account that also holds people.json, roles.json and the audit
// log, and one wrong click on that account could publish them. The function hop
// costs about a hundred milliseconds per image; the year-long cache below makes
// it a one-time cost per browser.
function assetUrl(key) {
  return key ? "/api/asset?key=" + encodeURIComponent(key) : null;
}

// Chunked upload of one asset (broadcast attachments): each chunk is staged as a block, the last call commits them.
async function stageAssetBlock(key, blockId, buffer) {
  const container = getAssetsContainerClient();
  await container.createIfNotExists();
  await container.getBlockBlobClient(key).stageBlock(blockId, buffer, buffer.length);
}
async function commitAssetBlocks(key, blockIds, contentType, cacheControl) {
  await getAssetsContainerClient().getBlockBlobClient(key).commitBlockList(blockIds, { blobHTTPHeaders: { blobContentType: contentType || "application/octet-stream", blobCacheControl: cacheControl || DAY_CACHE } });
}
async function deleteAsset(key) { await getAssetsContainerClient().getBlockBlobClient(key).deleteIfExists(); }

// Read one asset back; returns {buffer, contentType} or null.
async function readAsset(key) {
  const container = getAssetsContainerClient();
  const blob = container.getBlockBlobClient(key);
  if (!(await blob.exists())) return null;
  const props = await blob.getProperties();
  const buffer = await blob.downloadToBuffer();
  return { buffer, contentType: props.contentType || "application/octet-stream" };
}

module.exports = { writeSnapshot, readSnapshot, restoreSnapshot, writeAsset, readAsset, stageAssetBlock, commitAssetBlocks, deleteAsset, nextSequence, assetUrl, cacheControlFor };
