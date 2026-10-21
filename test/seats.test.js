// Seats per course from Hive's orders (enrollment rules design, 2026-10-20): counting, limits, states.
const assert = require("assert");
const seats = require("../api/shared/seats");

const orders = [
  { orderId: "A", status: "submitted", items: [{ code: "SCI-HS-101" }, { code: "MTH-HS-201" }] },
  { orderId: "B", status: "confirmed", items: [{ code: "SCI-HS-101" }] },
  { orderId: "C", status: "paid", items: [{ code: "SCI-HS-101", waitlist: true }] },
  { orderId: "D", status: "cancelled", items: [{ code: "SCI-HS-101" }, { code: "MTH-HS-201" }] },
  { orderId: "E", status: "started", items: [{ code: "ART-EL-100" }] },
  // v3: a cancelled line (整期停开) holds no seat; a paid group line holds several
  { orderId: "F", status: "paid", items: [{ code: "MTH-HS-201", cancelled: { at: "2026-10-21", reason: "停开" } }, { code: "ART-EL-100", seats: 3 }] },
  null,
];
const counts = seats.countOrders(orders);
assert.deepStrictEqual(counts["SCI-HS-101"], { taken: 2, confirmed: 0, reserved: 2, waitlist: 1 }, "alive orders count, cancelled do not, a waitlisted item is counted apart; unpaid = reserved");
assert.deepStrictEqual(counts["MTH-HS-201"], { taken: 1, confirmed: 0, reserved: 1, waitlist: 0 }, "a cancelled line holds no seat");
assert.deepStrictEqual(counts["ART-EL-100"], { taken: 4, confirmed: 4, reserved: 0, waitlist: 0 }, "paid / started = confirmed; a group line holds its seats");

const courses = [
  { code: "SCI-HS-101", minSize: 4, maxSize: 2 },
  { code: "MTH-HS-201", minSize: null, maxSize: 5 },
  { code: "ART-EL-100", minSize: null, maxSize: null },
  { code: "NEW-000", minSize: 6, maxSize: null },
  { code: "NONE-000" },
  { code: "BAD-000", minSize: 0, maxSize: -1 },
];
const s = seats.seatsFor(counts, courses);
assert.deepStrictEqual(s["SCI-HS-101"], { taken: 2, confirmed: 0, reserved: 2, waitlist: 1, min: 4, max: 2, open: 0, state: "full", belowMin: true, need: 4 }, "full at the maximum (reserved seats count), and the minimum counts confirmed seats only");
assert.deepStrictEqual(s["MTH-HS-201"], { taken: 1, confirmed: 0, reserved: 1, waitlist: 0, min: null, max: 5, open: 4, state: "open", belowMin: false, need: 0 });
assert.deepStrictEqual(s["ART-EL-100"], { taken: 4, confirmed: 4, reserved: 0, waitlist: 0, min: null, max: null, open: null, state: "open", belowMin: false, need: 0 }, "an enrollment without limits is still reported");
assert.deepStrictEqual(s["NEW-000"], { taken: 0, confirmed: 0, reserved: 0, waitlist: 0, min: 6, max: null, open: null, state: "open", belowMin: true, need: 6 }, "a limit without enrollment is reported");
assert.ok(!s["NONE-000"] && !s["BAD-000"], "no limit, no enrollment → nothing to say; 0 / negative limits read as none");
assert.deepStrictEqual(seats.seatsFor({ X: { taken: 7, waitlist: 0 } }, [{ code: "X", maxSize: 10 }]).X.state, "few", "three or fewer left is 'few'");
assert.deepStrictEqual(seats.seatsFor({ X: { taken: 6, waitlist: 0 } }, [{ code: "X", maxSize: 10 }]).X.state, "open");

console.log("ok   seats: counting, limits and states");
