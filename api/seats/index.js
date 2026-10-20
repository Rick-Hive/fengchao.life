// GET /api/seats — open seats per course for the public site (enrollment rules design, 2026-10-20).
// Anonymous, cached 60 s in the function (api/shared/seats.js); numbers only, no names or emails.
const { readSnapshot } = require("../shared/blob");
const seats = require("../shared/seats");

module.exports = async function (context, req) {
  try {
    const snap = await readSnapshot();
    if (!snap) { context.res = { status: 503, body: { error: "no_snapshot" } }; return; }
    const all = await seats.publicSeats(snap.courses || []);
    const want = String((req.query && req.query.codes) || "").split(",").map((x) => x.trim()).filter(Boolean);
    const body = want.length ? Object.fromEntries(want.filter((c) => all[c]).map((c) => [c, all[c]])) : all;
    context.res = { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: { at: new Date().toISOString(), seats: body } };
  } catch (err) {
    context.log.error("seats:", err && err.message);
    context.res = { status: 500, body: { error: "seats_failed" } };
  }
};
