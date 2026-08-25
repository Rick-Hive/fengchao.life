// Snapshot storage helpers (Azure Blob Storage).
const { BlobServiceClient } = require("@azure/storage-blob");
const { snapshotBlob } = require("./config");

function getContainerClient() {
  const conn = process.env.STORAGE_CONNECTION_STRING;
  if (!conn) throw new Error("STORAGE_CONNECTION_STRING app setting is not configured");
  const service = BlobServiceClient.fromConnectionString(conn);
  return service.getContainerClient(snapshotBlob.container);
}

async function writeSnapshot(obj) {
  const container = getContainerClient();
  await container.createIfNotExists();
  const blob = container.getBlockBlobClient(snapshotBlob.name);
  const body = JSON.stringify(obj);
  await blob.upload(body, Buffer.byteLength(body), {
    blobHTTPHeaders: { blobContentType: "application/json; charset=utf-8" },
  });
}

async function readSnapshot() {
  const container = getContainerClient();
  const blob = container.getBlockBlobClient(snapshotBlob.name);
  if (!(await blob.exists())) return null;
  const buf = await blob.downloadToBuffer();
  return JSON.parse(buf.toString("utf8"));
}

module.exports = { writeSnapshot, readSnapshot };
