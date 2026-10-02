// Asset URLs and caching (api/shared/blob.js helpers).
//
// Run with:  node test/assets.test.js
const assert = require("assert");
const path = require("path");
const Module = require("module");
const realResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (request === "@azure/storage-blob") return "@azure/storage-blob";
  return realResolve.call(this, request, parent, ...rest);
};
require.cache["@azure/storage-blob"] = { id: "@azure/storage-blob", filename: "@azure/storage-blob", loaded: true, exports: { BlobServiceClient: { fromConnectionString() { throw new Error("no storage in test"); } } } };
const B = require(path.join(__dirname, "..", "api", "shared", "blob.js"));

// Default: through the function, as before.
delete process.env.ASSETS_PUBLIC;
process.env.STORAGE_CONNECTION_STRING = "DefaultEndpointsProtocol=https;AccountName=fcstore;AccountKey=xyz;EndpointSuffix=core.windows.net";
assert.strictEqual(B.assetUrl("teachers/rec1-attABCDEFGH12.jpg"), "/api/asset?key=teachers%2Frec1-attABCDEFGH12.jpg");
assert.strictEqual(B.assetUrl(null), null);
// Public: straight to blob storage, host from the connection string.
process.env.ASSETS_PUBLIC = "1";
assert.strictEqual(B.publicAssetBase(), "https://fcstore.blob.core.windows.net/site-assets");
assert.strictEqual(B.assetUrl("teachers/rec1-attABCDEFGH12.jpg"), "https://fcstore.blob.core.windows.net/site-assets/teachers/rec1-attABCDEFGH12.jpg");
process.env.STORAGE_CONNECTION_STRING = "BlobEndpoint=https://custom.example/;AccountName=x;AccountKey=y";
assert.strictEqual(B.publicAssetBase(), "https://custom.example/site-assets");
// Cache lifetime: a year for keys bound to one attachment, a day for the old scheme.
assert.strictEqual(B.cacheControlFor("teachers/rec1-attABCDEFGH12.jpg"), "public, max-age=31536000, immutable");
assert.strictEqual(B.cacheControlFor("syllabus/rec1-0.pdf"), "public, max-age=86400");
console.log("assets: all assertions passed");
