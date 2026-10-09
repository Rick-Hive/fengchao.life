// What a linked record is called (Rick, 2026-10-07/09: publishers shown as "1", "13" on
// the charts and the 出版社 tab — the Publishers table's primary "Publisher ID" is a
// text column holding numbers; "Publisher Name" is the name).
const assert = require("assert");
const { displayFields, displayOf } = require("../api/shared/equip");
const T = (fields, primary) => ({ primaryFieldId: primary, fields });
const F = (fields) => ({ fields });
// text primary with a real name: itself first
let d = displayFields(T([{ id: "a", name: "Name", type: "singleLineText" }, { id: "b", name: "Notes", type: "multilineText" }], "a"));
assert.strictEqual(d[0], "Name"); assert.strictEqual(displayOf(F({ Name: "IEW", Notes: "x" }), d), "IEW");
// Rick's Publishers table: text primary "Publisher ID" = "13", "Publisher Name" = "CEFF"
d = displayFields(T([{ id: "a", name: "Publisher ID", type: "singleLineText" }, { id: "b", name: "Publisher Name", type: "singleLineText" }, { id: "c", name: "Curriculum SKU", type: "multipleRecordLinks" }], "a"));
assert.deepStrictEqual(d.slice(0, 2), ["Publisher ID", "Publisher Name"]);
assert.strictEqual(displayOf(F({ "Publisher ID": "13", "Publisher Name": "CEFF" }), d), "CEFF", "a numeric primary falls through to the name");
assert.strictEqual(displayOf(F({ "Publisher ID": "13", "Publisher Name": "" }), d), "13", "the number when nothing else is there");
// autonumber primary + a formula Name
d = displayFields(T([{ id: "a", name: "ID", type: "autoNumber" }, { id: "b", name: "Name", type: "formula", options: { result: { type: "singleLineText" } } }, { id: "c", name: "Website", type: "url" }], "a"));
assert.strictEqual(d[0], "Name"); assert.strictEqual(displayOf(F({ ID: 7, Name: "Oak Tree" }), d), "Oak Tree");
// a numeric formula is never a name; a lookup yielding text is
d = displayFields(T([{ id: "a", name: "ID", type: "autoNumber" }, { id: "b", name: "Title count", type: "formula", options: { result: { type: "number" } } }, { id: "c", name: "出版社", type: "multipleLookupValues", options: { result: { type: "singleLineText" } } }], "a"));
assert.strictEqual(d[0], "出版社"); assert.ok(!d.includes("Title count"));
// nothing nameable: attachments and links only → the number
d = displayFields(T([{ id: "a", name: "ID", type: "autoNumber" }, { id: "b", name: "Logo", type: "multipleAttachments" }, { id: "c", name: "Books", type: "multipleRecordLinks" }], "a"));
assert.deepStrictEqual(d, ["ID"]);
console.log("equip names: all assertions passed");
