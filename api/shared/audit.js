// Hive's own record of sensitive actions (who did what to which account).
//
// Entra's audit log already records every change the app makes, but it names
// the app ("Hive fengchao.life"), not the person who pressed the button. This
// fills that gap: one JSON line per action, in a monthly append blob
// audit/YYYY-MM.jsonl in the site-data container. Never stores passwords,
// TAP values or tokens. Best-effort by design — an action is not refused
// because its log line could not be written, but the failure is logged.
const { BlobServiceClient } = require("@azure/storage-blob");
const { snapshotBlob } = require("./config");

async function audit(context, entry) {
  const line = JSON.stringify(Object.assign({ at: new Date().toISOString() }, entry)) + "\n";
  try {
    const conn = process.env.STORAGE_CONNECTION_STRING;
    if (!conn) throw new Error("STORAGE_CONNECTION_STRING not configured");
    const container = BlobServiceClient.fromConnectionString(conn).getContainerClient(snapshotBlob.container);
    await container.createIfNotExists();
    const month = new Date().toISOString().slice(0, 7);
    const blob = container.getAppendBlobClient(`audit/${month}.jsonl`);
    await blob.createIfNotExists({ blobHTTPHeaders: { blobContentType: "application/x-ndjson; charset=utf-8" } });
    await blob.appendBlock(line, Buffer.byteLength(line));
  } catch (err) {
    if (context && context.log) context.log.warn(`audit write failed (${(err && err.message) || err}): ${line.trim()}`);
  }
}

// Read back recent lines (newest first), for the CRM's 动态 feed. opts { months, filter }.
async function readAudit(opts) {
  const months = (opts && opts.months) || 1, filter = (opts && opts.filter) || (() => true);
  const conn = process.env.STORAGE_CONNECTION_STRING;
  if (!conn) throw new Error("STORAGE_CONNECTION_STRING not configured");
  const container = BlobServiceClient.fromConnectionString(conn).getContainerClient(snapshotBlob.container);
  const out = [];
  const now = new Date();
  for (let i = 0; i < months; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const name = `audit/${d.toISOString().slice(0, 7)}.jsonl`;
    const blob = container.getBlobClient(name);
    if (!(await blob.exists())) continue;
    const text = (await blob.downloadToBuffer()).toString("utf8");
    for (const line of text.split("\n")) { if (!line.trim()) continue; try { const e = JSON.parse(line); if (filter(e)) out.push(e); } catch { /* a torn line */ } }
  }
  out.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  return out;
}

module.exports = { audit, readAudit };
