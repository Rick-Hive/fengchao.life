// How a hive (school/institution) is identified across the order pipeline.
//
// The same normalization has to be applied in three places — the order id's
// hive segment, the per-hive routing lookup built by the sync, and the grouping
// of an order's courses — so it lives here rather than being retyped. A drift
// between any two of them would route a hive's orders into the void.
//
// Latin letters, digits and Chinese characters survive; spaces and punctuation
// do not, so "Kids' X-Center" and "KIDS X CENTER" collapse to the same key.
function hiveKey(raw) {
  return String(raw || "")
    .toUpperCase()
    .replace(/[^A-Z0-9一-鿿]/g, "")
    .slice(0, 12);
}

// Group an order's items by owning hive, preserving the order the courses were
// added in. Returns [{ key, schoolName, schoolAbbr, items, itemCount, subtotal }].
// Courses with no hive on record collapse into a single entry with key "" so
// they are still delivered somewhere rather than dropped.
function groupByHive(items) {
  const groups = [];
  const byKey = new Map();
  for (const it of items || []) {
    const key = hiveKey(it.schoolAbbr || it.schoolName);
    let g = byKey.get(key);
    if (!g) {
      g = {
        key,
        schoolName: it.schoolName || "",
        schoolAbbr: it.schoolAbbr || "",
        items: [],
        itemCount: 0,
        subtotal: 0,
      };
      byKey.set(key, g);
      groups.push(g);
    }
    g.items.push(it);
    g.itemCount += 1;
    if (typeof it.price === "number" && Number.isFinite(it.price)) g.subtotal += it.price;
  }
  return groups;
}

module.exports = { hiveKey, groupByHive };
