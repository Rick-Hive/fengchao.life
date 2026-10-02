// Hive's own facts about people, kept beside the snapshot as people.json.
//
// Entra knows an account's name, methods and groups. It does not know what
// a person IS to the school — 家长 / 学生 / 老师 / 行政 — or which parent
// belongs to which child. Those live here, keyed by the account (lowercase
// UPN), and are edited by domain administrators from the Hub's user table.
//
// Shape: { "people": { "<upn>": { "identity": "家长", "linked": ["child@domain"],
//          "note": "", "by": "admin@domain", "at": "2026-10-01T..." } } }
//
// Entra's own `department` is read as a fallback for identity when it holds
// one of the four words, so a school that fills that field in needs no edit.
const { BlobServiceClient } = require("@azure/storage-blob");
const { snapshotBlob } = require("./config");

const BLOB_NAME = "people.json";
const IDENTITIES = ["家长", "学生", "老师", "行政"];

function blobClient() {
  const conn = process.env.STORAGE_CONNECTION_STRING;
  if (!conn) throw new Error("STORAGE_CONNECTION_STRING app setting is not configured");
  const container = BlobServiceClient.fromConnectionString(conn).getContainerClient(snapshotBlob.container);
  return { container, blob: container.getBlockBlobClient(BLOB_NAME) };
}

async function readPeople() {
  try {
    const { blob } = blobClient();
    if (!(await blob.exists())) return { people: {} };
    const buf = await blob.downloadToBuffer();
    const parsed = JSON.parse(buf.toString("utf8"));
    return { people: parsed && typeof parsed.people === "object" && parsed.people ? parsed.people : {} };
  } catch {
    return { people: {} };
  }
}

async function writePeople(doc) {
  const { container, blob } = blobClient();
  await container.createIfNotExists();
  const body = JSON.stringify({ people: doc.people || {} }, null, 2);
  await blob.upload(body, Buffer.byteLength(body), {
    blobHTTPHeaders: { blobContentType: "application/json; charset=utf-8" },
  });
}

// Identity for one account: Hive's record first, then Entra's department.
function identityOf(record, entraUser) {
  if (record && IDENTITIES.includes(record.identity)) return record.identity;
  const dep = String((entraUser && (entraUser.department || entraUser.jobTitle)) || "").trim();
  const hit = IDENTITIES.find((i) => dep === i || dep.includes(i));
  return hit || "";
}

module.exports = { IDENTITIES, readPeople, writePeople, identityOf };
