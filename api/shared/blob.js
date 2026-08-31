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
  await blob.upload(buf, buf.length, {
    blobHTTPHeaders: { blobContentType: "application/json; charset=utf-8" },
  });
  return JSON.parse(buf.toString("utf8"));
}

async function readSnapshot() {
  const container = getContainerClient();
  const blob = container.getBlockBlobClient(snapshotBlob.name);
  if (!(await blob.exists())) return null;
  const buf = await blob.downloadToBuffer();
  return JSON.parse(buf.toString("utf8"));
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
async function writeAsset(key, buffer, contentType) {
  const container = getAssetsContainerClient();
  await container.createIfNotExists();
  const blob = container.getBlockBlobClient(key);
  await blob.upload(buffer, buffer.length, {
    blobHTTPHeaders: { blobContentType: contentType || "application/octet-stream" },
  });
}

// Read one asset back; returns {buffer, contentType} or null.
async function readAsset(key) {
  const container = getAssetsContainerClient();
  const blob = container.getBlockBlobClient(key);
  if (!(await blob.exists())) return null;
  const props = await blob.getProperties();
  const buffer = await blob.downloadToBuffer();
  return { buffer, contentType: props.contentType || "application/octet-stream" };
}

module.exports = { writeSnapshot, readSnapshot, restoreSnapshot, writeAsset, readAsset, nextSequence };
