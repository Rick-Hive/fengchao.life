// What a linked record is called when its table's primary field is an autonumber
// (Rick, 2026-10-07/09: publishers shown as "1", "13" on the charts and the 出版社 tab).
const assert = require("assert");
const { displayFields } = require("../api/shared/equip");
const T = (fields, primary) => ({ primaryFieldId: primary, fields });
// text primary: itself
assert.deepStrictEqual(displayFields(T([{ id: "a", name: "Name", type: "singleLineText" }], "a")), ["Name"]);
// autonumber primary + text Name
assert.deepStrictEqual(displayFields(T([{ id: "a", name: "ID", type: "autoNumber" }, { id: "b", name: "Notes", type: "multilineText" }, { id: "c", name: "Publisher Name", type: "singleLineText" }], "a")), ["Publisher Name", "ID"]);
// autonumber primary + a formula Name (no text field named like a name)
assert.deepStrictEqual(displayFields(T([{ id: "a", name: "ID", type: "autoNumber" }, { id: "b", name: "Name", type: "formula", options: { result: { type: "singleLineText" } } }, { id: "c", name: "Website", type: "url" }], "a")), ["Name", "ID"]);
// a numeric formula is never a name; a lookup yielding text is
assert.deepStrictEqual(displayFields(T([{ id: "a", name: "ID", type: "autoNumber" }, { id: "b", name: "Title count", type: "formula", options: { result: { type: "number" } } }, { id: "c", name: "出版社", type: "multipleLookupValues", options: { result: { type: "singleLineText" } } }], "a")), ["出版社", "ID"]);
// nothing nameable: attachments and links only → the number
assert.deepStrictEqual(displayFields(T([{ id: "a", name: "ID", type: "autoNumber" }, { id: "b", name: "Logo", type: "multipleAttachments" }, { id: "c", name: "Books", type: "multipleRecordLinks" }], "a")), ["ID"]);
console.log("equip names: all assertions passed");
