// The Hive workspace's Schools or Institutions table read live for the 机构 page
// (api/shared/hiveSchools.js): tolerant columns, public descriptors, the Domain
// column kept aside for the join.
//
// Run with:  node test/hive-schools.test.js
const assert = require("assert");
const path = require("path");
process.env.AIRTABLE_PAT = "pat-test";
const { AirtableBase } = require(path.join(__dirname, "..", "api", "shared", "airtable.js"));
let asked = null;
AirtableBase.prototype.list = async function (tableId) {
  asked = { baseId: this.baseId, tableId };
  return [
    { id: "recS1", fields: { "Name/名称": "Kids X Center", "Abbreviation": "KXC", "Type/类型": "蜂巢", "Country/国家": "中国", "City": "南京", "Website": "kxc.edu", "Domain/域名": "KXC.edu", "Teams Channel ID": "19:x@thread", "Notify Email": "ops@kxc.edu" } },
    { id: "recS2", fields: { "Name/名称": "Grace Christian University", "Abbreviation": "GCU", "类型": "大学", "国家": "美国" } },
    { id: "recS3", fields: { "Abbreviation": "" } }, // no name, no abbreviation → skipped
  ];
};
const HS = require(path.join(__dirname, "..", "api", "shared", "hiveSchools.js"));
(async () => {
  const r = await HS.readSchools();
  assert.strictEqual(asked.tableId, "tblRVfq00Q5QKkR5h", "the Schools table of the website base");
  assert.deepStrictEqual(r.institutions.map((i) => [i.key, i.name, i.type, i.country, i.city, i.website]), [["KXC", "Kids X Center", "蜂巢", "中国", "南京", "kxc.edu"], ["GCU", "Grace Christian University", "大学", "美国", "", ""]]);
  assert.ok(!JSON.stringify(r.institutions).includes("thread") && !JSON.stringify(r.institutions).includes("ops@"), "channel id and notify email never leave the server");
  assert.deepStrictEqual(r.routing, { KXC: { domain: "kxc.edu" } }, "the Domain column, lowercased, keyed by the hive key");
  delete process.env.AIRTABLE_PAT;
  await assert.rejects(() => HS.readSchools(), (e) => e.code === "no_pat");
  console.log("hive-schools: all assertions passed");
})().catch((e) => { console.error(e); process.exit(1); });
