// POST /api/order — validates the submission, re-prices it from the trusted
// snapshot, and forwards the order JSON server-side to the Power Automate
// "When an HTTP request is received" flow (URL is a server-side secret).
const { readSnapshot } = require("../shared/blob");

// Best-effort in-memory rate limit (per function instance).
const hits = new Map();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 5;

function tooMany(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear(); // memory guard
  return list.length > MAX_PER_WINDOW;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Policy (Rick, 2026-08-26): mainland free-mail providers are not accepted for
// orders; parents must use Gmail, Outlook, Yahoo or another international
// provider. Keep in sync with BLOCKED_EMAIL_DOMAINS in assets/app.js.
const BLOCKED_EMAIL_DOMAINS = [
  "qq.com", "vip.qq.com", "foxmail.com",
  "163.com", "vip.163.com", "126.com", "vip.126.com", "yeah.net", "188.com",
  "sina.com", "sina.cn", "vip.sina.com",
  "sohu.com", "tom.com", "21cn.com", "aliyun.com",
  "139.com", "189.cn", "wo.cn", "wo.com.cn",
];

function isBlockedEmail(email) {
  const domain = email.split("@")[1].toLowerCase();
  return BLOCKED_EMAIL_DOMAINS.some((d) => domain === d || domain.endsWith("." + d));
}

function makeOrderId() {
  const d = new Date();
  const ymd = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `FC-${ymd}-${rand}`;
}

module.exports = async function (context, req) {
  const body = req.body || {};

  // Honeypot: real users never fill this hidden field.
  //
  // The field used to be called `company`, which Chrome's address autofill
  // recognized as an organization field and filled even with
  // autocomplete="off" — silently classifying real parents' orders as bot
  // traffic. `company` is deliberately NOT honoured any more, not even as a
  // fallback for browsers still running a cached copy of the old front end:
  // keeping it would preserve the very bug this fixes for exactly those
  // users. A bot replaying the old field name now gets through, which is the
  // right trade — a stray bot order reaching Teams is a nuisance, a real
  // family's order vanishing without trace is not.
  const hp = typeof body.fc_hp_field === "string" ? body.fc_hp_field.trim() : "";
  if (hp) {
    // Logged, not silent: a dropped order is otherwise indistinguishable from a
    // delivered one, which is exactly what made the autofill bug so hard to see.
    context.log.warn(
      `Honeypot triggered; order dropped without notifying. email=${String(body.email || "").slice(0, 120)} value=${hp.slice(0, 80)}`
    );
    context.res = { status: 200, body: { ok: true, orderId: makeOrderId() } };
    return;
  }

  const ip = (req.headers["x-forwarded-for"] || "unknown").split(",")[0].trim();
  if (tooMany(ip)) {
    context.res = { status: 429, body: { error: "rate_limited", message: "Too many submissions; please try again later." } };
    return;
  }

  const email = String(body.email || "").trim();
  const teamsAccount = String(body.teamsAccount || "").trim().slice(0, 200);
  const trackId = Number(body.trackId);
  const courseIds = Array.isArray(body.courseIds) ? body.courseIds.slice(0, 60) : [];

  if (!EMAIL_RE.test(email) || email.length > 254) {
    context.res = { status: 400, body: { error: "invalid_email" } };
    return;
  }
  if (isBlockedEmail(email)) {
    context.res = { status: 400, body: { error: "blocked_email_domain" } };
    return;
  }
  if (!(trackId >= 1 && trackId <= 7)) {
    context.res = { status: 400, body: { error: "invalid_track" } };
    return;
  }
  if (courseIds.length === 0) {
    context.res = { status: 400, body: { error: "empty_order" } };
    return;
  }

  const flowUrl = process.env.POWER_AUTOMATE_URL;
  if (!flowUrl) {
    context.res = { status: 500, body: { error: "POWER_AUTOMATE_URL app setting is not configured" } };
    return;
  }

  try {
    const snapshot = await readSnapshot();
    if (!snapshot) {
      context.res = { status: 503, body: { error: "no_snapshot" } };
      return;
    }
    const byId = new Map(snapshot.courses.map((c) => [c.id, c]));
    const items = [];
    for (const id of courseIds) {
      const c = byId.get(id);
      if (!c) {
        context.res = { status: 400, body: { error: "unknown_course", courseId: id } };
        return;
      }
      items.push({
        code: c.code,
        nameEn: c.nameEn,
        nameZh: c.nameZh,
        // Internal ops message (Teams/Power Automate): show both languages
        // regardless of which one the parent was browsing in.
        subjects: (c.subjects || []).map((s) =>
          s && typeof s === "object" ? [s.nameZh, s.nameEn].filter(Boolean).join(" / ") : s
        ),
        grades: c.grades,
        classType: [c.classTypeZh, c.classTypeEn].filter(Boolean).join(" / "),
        language: [c.languageZh, c.languageEn].filter(Boolean).join(" / "),
        teachers: c.teachers,
        price: c.price, // trusted price from snapshot, never from the client
      });
    }
    const total = items.reduce((s, i) => s + (typeof i.price === "number" ? i.price : 0), 0);
    // trackId 7 is the K–G8 catalog (not a graduation track) — give it a readable name.
    const track =
      trackId === 7
        ? { trackId: 7, name: "K-G8 Courses/小学·初中课程" }
        : snapshot.tracks.find((t) => t.trackId === trackId) || null;

    const order = {
      orderId: makeOrderId(),
      submittedAt: new Date().toISOString(),
      email,
      teamsAccount: teamsAccount || null,
      track: track ? { trackId: track.trackId, name: track.name } : { trackId },
      itemCount: items.length,
      totalPrice: total,
      currency: "CNY",
      items,
      snapshotGeneratedAt: snapshot.generatedAt,
    };

    const headers = { "Content-Type": "application/json" };
    if (process.env.ORDER_SHARED_SECRET) headers["X-Order-Secret"] = process.env.ORDER_SHARED_SECRET;

    const res = await fetch(flowUrl, { method: "POST", headers, body: JSON.stringify(order) });
    if (!res.ok && res.status !== 202) {
      const text = await res.text();
      context.log.error(`Power Automate -> HTTP ${res.status}: ${text.slice(0, 300)}`);
      context.res = { status: 502, body: { error: "notify_failed", message: "Order could not be delivered; please try again." } };
      return;
    }

    context.res = {
      status: 200,
      body: { ok: true, orderId: order.orderId, itemCount: order.itemCount, totalPrice: order.totalPrice },
    };
  } catch (err) {
    context.log.error("order failed", err);
    context.res = { status: 500, body: { error: String(err.message || err) } };
  }
};
