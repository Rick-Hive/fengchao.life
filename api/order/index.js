// POST /api/order — validates the submission, re-prices it from the trusted
// snapshot, and forwards the order JSON server-side to the Power Automate
// "When an HTTP request is received" flow (URL is a server-side secret).
const { readSnapshot, nextSequence } = require("../shared/blob");
const { buildMessages } = require("../shared/messages");
const { groupByHive } = require("../shared/hive");

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

// Beijing-time date stamp. Order ids are read by people who all live in that
// timezone, so a UTC stamp would label an evening order with tomorrow's date.
function ymdBeijing(d) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d || new Date());
  return parts.replace(/-/g, "");
}

// The hive segment of an order id: its Abbreviation if the Schools table has
// one, otherwise its full name (which for these partners is usually already
// short, e.g. CAP or IEW). Latin letters, digits and Chinese characters survive;
// spaces and punctuation do not, so "Kids' X-Center" becomes KIDSXCENTER.
function schoolSegment(items) {
  const seen = [];
  for (const it of items) {
    const raw = String(it.schoolAbbr || it.schoolName || "").trim();
    const seg = raw
      .toUpperCase()
      .replace(/[^A-Z0-9一-鿿]/g, "")
      .slice(0, 12);
    if (seg && seen.indexOf(seg) === -1) seen.push(seg);
  }
  if (seen.length === 1) return seen[0];
  // An order spanning several hives has no single owner, and payment is settled
  // per hive, so flag it rather than pick one arbitrarily. If these turn out to
  // be common, the better fix is splitting such a submission into one order per
  // hive — that is a data-model change, not a formatting one.
  if (seen.length > 1) return "MULTI";
  return "";
}

// FC-20260831-KXC-001. The running number is per day and per hive, so each
// partner sees its own 001, 002 rather than a shared global counter.
//
// The sequence is best-effort by design: if the counter blob is unavailable or
// too contended, fall back to a short readable random suffix and still take the
// order. A tidy sequence is cosmetic; a dropped order is not. Ambiguous
// characters (0/O, 1/I/L, U) are excluded from the fallback alphabet so the id
// survives being read aloud over the phone.
const FALLBACK_ALPHABET = "23456789ACDEFGHJKMNPQRTVWXYZ";

function randomSuffix(n) {
  let out = "";
  for (let i = 0; i < n; i++) {
    out += FALLBACK_ALPHABET[Math.floor(Math.random() * FALLBACK_ALPHABET.length)];
  }
  return out;
}

async function makeOrderId(items, log) {
  const ymd = ymdBeijing();
  const seg = schoolSegment(items || []);
  const prefix = seg ? `FC-${ymd}-${seg}` : `FC-${ymd}`;
  try {
    const n = await nextSequence(`${ymd}-${seg || "ALL"}`);
    return `${prefix}-${String(n).padStart(3, "0")}`;
  } catch (err) {
    if (log) log(`order id sequence unavailable, using random suffix: ${String(err.message || err)}`);
    return `${prefix}-${randomSuffix(4)}`;
  }
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
    // Return a plausible-looking id so the bot sees success, but do NOT consume
    // a real sequence number — the hive's daily numbering should count orders,
    // not bots.
    context.res = { status: 200, body: { ok: true, orderId: `FC-${ymdBeijing()}-${randomSuffix(4)}` } };
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
  // The language the parent actually ordered in. Everything they receive — the
  // confirmation email — and the hive's Teams notification are rendered in it,
  // so the hive replies in the language the family already chose.
  const lang = body.lang === "en" ? "en" : "zh";

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
        // Internal ops message (Teams/Power Automate): show both languages
        // regardless of which one the parent was browsing in.
        //
        // `name` is REQUIRED by the flow trigger's Request Body JSON Schema and is
        // what the Teams message template renders. It was dropped when the bilingual
        // refactor split it into nameEn/nameZh, which made Power Automate reject every
        // order with HTTP 400 before a run was ever created. Keep `name` populated.
        name: [c.nameZh, c.nameEn].filter(Boolean).join(" / "),
        nameEn: c.nameEn,
        nameZh: c.nameZh,
        subjects: (c.subjects || []).map((s) =>
          s && typeof s === "object" ? [s.nameZh, s.nameEn].filter(Boolean).join(" / ") : s
        ),
        grades: c.grades,
        classType: [c.classTypeZh, c.classTypeEn].filter(Boolean).join(" / "),
        language: [c.languageZh, c.languageEn].filter(Boolean).join(" / "),
        teachers: c.teachers,
        price: c.price, // trusted price from snapshot, never from the client
        // Which hive owns this course. Drives the order id's hive segment and
        // the "所属蜂巢" line, since payment and enrolment are settled per hive.
        schoolName: (c.school && c.school.name) || "",
        schoolAbbr: (c.school && c.school.abbr) || "",
      });
    }
    const total = items.reduce((s, i) => s + (typeof i.price === "number" ? i.price : 0), 0);
    // trackId 7 is the K–G8 catalog (not a graduation track) — give it a readable name.
    const track =
      trackId === 7
        ? { trackId: 7, name: "K-G8 Courses/小学·初中课程" }
        : snapshot.tracks.find((t) => t.trackId === trackId) || null;

    const order = {
      orderId: await makeOrderId(items, (m) => context.log.warn(m)),
      submittedAt: new Date().toISOString(),
      email,
      // The trigger schema types these as strings; sending null or omitting `name`
      // fails schema validation (HTTP 400, no flow run). Use "" for "not provided".
      teamsAccount: teamsAccount || "",
      track: track ? { trackId: track.trackId, name: track.name || "" } : { trackId, name: "" },
      itemCount: items.length,
      totalPrice: total,
      currency: "CNY",
      items,
      snapshotGeneratedAt: snapshot.generatedAt,
      lang,
    };

    // Power Automate receives finished text, not fields to assemble. See the
    // header comment in api/shared/messages.js for why.
    const templates = snapshot.messageTemplates;
    const msg = buildMessages(order, templates, lang);
    order.notifyText = msg.notifyText;
    order.emailTo = email;
    order.emailSubject = msg.emailSubject;
    order.emailHtml = msg.emailHtml;
    order.emailBodyText = msg.emailBodyText;

    // Per-hive delivery. An order can span hives, and each settles payment and
    // enrolment with the family separately, so each gets its own message listing
    // only its own courses and its own subtotal — not the whole order.
    //
    // Routing comes from snapshot.private (never served to browsers): each hive's
    // Teams channel id and notification address, filled in on the Schools table.
    // A hive with neither still produces a route, with empty destinations — the
    // flow posts those to the default channel so an order can never silently
    // vanish because an Airtable cell was left blank.
    const routing = (snapshot.private && snapshot.private.schoolRouting) || {};
    order.routes = groupByHive(items).map((g) => {
      const dest = routing[g.key] || {};
      const scoped = {
        ...order,
        items: g.items,
        itemCount: g.itemCount,
        totalPrice: g.subtotal,
      };
      const m = buildMessages(scoped, templates, lang);
      return {
        hiveKey: g.key,
        schoolName: dest.name || g.schoolName,
        schoolAbbr: dest.abbr || g.schoolAbbr,
        teamsChannelId: dest.teamsChannelId || "",
        notifyEmail: dest.notifyEmail || "",
        itemCount: g.itemCount,
        subtotal: g.subtotal,
        currency: order.currency,
        notifyText: m.notifyText,
        notifySubject: m.notifySubject,
        notifyHtml: m.notifyHtml,
      };
    });
    order.routeCount = order.routes.length;

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
