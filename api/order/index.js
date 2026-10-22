// POST /api/order — validates the submission, re-prices it from the trusted
// snapshot, STORES it (crm/orders/<orderId>.json — the CRM's order record,
// design §6, Rick 2026-10-06), and then forwards the order JSON server-side
// to the Power Automate "When an HTTP request is received" flow (URL is a
// server-side secret).
//
// Store first, notify second: a notification that fails no longer loses the
// order. The family still gets its order number, the record carries
// notify.ok = false, and the management centre's 订单 page lists it under
// 通知失败 for the order manager to chase by hand.
const cfg = require("../shared/config");
const { readSnapshot, nextSequence } = require("../shared/blob");
const crm = require("../shared/crm");
const { buildMessages, escapeHtml } = require("../shared/messages");
const { groupByHive } = require("../shared/hive");
const seats = require("../shared/seats");
const { getPrincipal } = require("../shared/auth");
const { userRoles, isSchoolAccount } = require("../shared/roles");
const fee = require("../shared/fee");
const stripe = require("../shared/stripe");
const submissions = require("../shared/submissions");
const SITE = () => String(process.env.SITE_ORIGIN || "https://www.fengchao.life").replace(/\/+$/, "");

// The signed-in account, when the family ordered from the management centre or while signed in on the website: Static
// Web Apps puts the verified principal on every API call that carries its cookie, so this is the platform's word, never
// the form's (design 2026-10-20: 「订单自动归入该用户的账号下」). Anonymous orders keep "".
function accountOf(req) {
  const p = getPrincipal(req);
  const upn = String((p && p.userDetails) || "").trim().toLowerCase();
  return EMAIL_RE.test(upn) ? upn : "";
}

// One submission = one visit to the order page. Today it holds one order; when a submission spanning several hives is
// split into one order per hive (stage 2), they share this id — and the selection fee is charged once per submission.
function makeSubmissionId() { return `FS-${ymdBeijing()}-${randomSuffix(5)}`; }

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
    // crypto, not Math.random: a submission id is what /api/order/status answers to (security review 2026-10-22)
    out += FALLBACK_ALPHABET[require("crypto").randomInt(FALLBACK_ALPHABET.length)];
  }
  return out;
}

// The ops payload shows BOTH languages for every course field — name, subjects,
// class type, teaching language (see the `name` comment below) — regardless of
// which language the family was browsing in. The track line is no exception,
// and it used to be bilingual for free: Airtable's "Track Name" column held one
// combined "English/中文" string. Splitting it into `Track Name` + `毕业路径`
// (2026-09-02) quietly made this line English-only, because the sync publishes
// `name` as `nameEn || nameZh`. Compose the pair here the same way the course
// fields do, and fall back to the flat `name` so a snapshot synced before
// 毕业路径 existed still renders the old combined string.
//
// Deliberately returns a plain string into the existing `track.name` field
// rather than adding `nameEn`/`nameZh` to the payload: the flow's trigger has a
// Request Body JSON Schema, and this path has already been broken twice by
// changing the shape of what it receives.
function trackLabel(t) {
  if (!t) return "";
  return [t.nameZh, t.nameEn].filter(Boolean).join(" / ") || t.name || "";
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
  // courses the family agreed to join the waitlist for, should they be full at this moment (enrollment rules, 2026-10-20)
  const waitlistIds = new Set(Array.isArray(body.waitlist) ? body.waitlist.map(String) : []);
  // courses whose prerequisites the family confirmed on the order page (enrollment rules, step 4)
  const prereqOkIds = new Set(Array.isArray(body.prereqOk) ? body.prereqOk.map(String) : []);
  // The language the parent actually ordered in. Everything they receive — the
  // confirmation email — and the hive's Teams notification are rendered in it,
  // so the hive replies in the language the family already chose.
  const lang = body.lang === "en" ? "en" : "zh";
  // the child each course is for (stage 2, 2026-10-21): { [courseId]: { name, grade, account } } — the roster and the
  // transcript hang on it; a signed-in parent picks from the profile's children, an anonymous one types name + grade
  const childrenIn = body.children && typeof body.children === "object" && !Array.isArray(body.children) ? body.children : {};

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

  // A school's administrator or leader never orders for a family (Rick, 2026-10-20); schools will buy in bulk instead.
  if (accountOf(req)) {
    const { roles } = await userRoles(req).catch(() => ({ roles: [] }));
    if (isSchoolAccount(roles)) { context.res = { status: 403, body: { error: "school_account" } }; return; }
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
        // Trusted price from the snapshot, never from the client.
        //
        // The snapshot stores null for a course whose price is not set yet
        // ("价格待定"), and the flow trigger's schema types price as a REQUIRED
        // INTEGER — so passing null through made Power Automate reject the whole
        // order with 400 before creating a run, and the family saw "订单未能送达".
        // One unpriced course in the cart killed the entire submission.
        //
        // So the wire value is always a number, and `priceTbd` carries the fact
        // that it is a placeholder. The messages render "价格待定" / "Price TBD"
        // for those lines rather than a misleading ¥0.
        price: typeof c.price === "number" ? c.price : 0,
        priceTbd: typeof c.price !== "number",
        // Which hive owns this course. Drives the order id's hive segment and
        // the "所属蜂巢" line, since payment and enrolment are settled per hive.
        schoolName: (c.school && c.school.name) || "",
        schoolAbbr: (c.school && c.school.abbr) || "",
        courseId: c.id,
        waitlist: false,
      });
    }
    // The child a course is for is optional at checkout (v3, Rick 2026-10-21: 「订单阶段最好简单」): a signed-in parent
    // may pick one from the profile; everyone else names the child after the course fee is paid, in 个人资料 › 我的孩子
    // (PATCH me/orders {orderId, code, child}). The order carries the buyer's own name instead (contact), for the
    // account that will be created when the selection fee is paid.
    for (const it of items) {
      const k = childrenIn[it.courseId] && typeof childrenIn[it.courseId] === "object" ? childrenIn[it.courseId] : null;
      const name = String((k && k.name) || "").trim().slice(0, 40), grade = String((k && k.grade) || "").trim().slice(0, 20), account = String((k && k.account) || "").trim().toLowerCase().slice(0, 200);
      it.child = name ? { name, grade, account: EMAIL_RE.test(account) ? account : "" } : null;
    }
    const contactIn = body.contact && typeof body.contact === "object" ? body.contact : {};
    const contact = { familyName: String(contactIn.familyName || "").trim().slice(0, 40), givenName: String(contactIn.givenName || "").trim().slice(0, 40), englishName: String(contactIn.englishName || "").trim().slice(0, 40), displayName: String(contactIn.displayName || "").trim().slice(0, 80) };
    if (!accountOf(req) && !(contact.familyName && contact.givenName)) { context.res = { status: 400, body: { error: "missing_name" } }; return; }
    // Prerequisites (enrollment rules, 2026-10-20): "CODE English / 中文; …" — a leading course code is a course. The
    // order records, per item, how each prerequisite is met: cart (ordered together), ordered (this family's earlier
    // order, confirmed / paid / started), confirmed (the family ticked it), none (nothing known) — never refused here;
    // the order manager sees the flags.
    const codeOf = new Map((snapshot.courses || []).filter((c) => c.code).map((c) => [c.code, c]));
    const cartCodes = new Set(items.map((it) => it.code));
    const allOrders = await crm.listOrders();
    const mine = allOrders.filter((o) => o && String(o.email || "").toLowerCase() === email.toLowerCase() && ["contacted", "confirmed", "parent_paid", "paid", "started"].includes(o.status));
    const ordered = new Set(mine.flatMap((o) => (o.items || []).filter((it) => it && !it.waitlist).map((it) => it.code)));
    for (const it of items) {
      const c = byId.get(it.courseId), txt = String((c && c.prerequisite) || "").trim();
      if (!txt || /^n\/?a$/i.test(txt)) continue;
      const parts = txt.split(/\s*[;；\n]\s*/).map((x) => x.trim()).filter(Boolean);
      const codes = parts.map((x) => (/^(\S+)/.exec(x) || [])[1]).filter((code) => code && codeOf.has(code));
      let met = "none";
      if (codes.length && codes.every((code) => cartCodes.has(code) || ordered.has(code))) met = codes.every((code) => cartCodes.has(code)) ? "cart" : "ordered";
      else if (prereqOkIds.has(String(it.courseId))) met = "confirmed";
      it.prereq = { text: txt, codes, met };
    }
    // Seats are checked here, against the orders as they are now (no cache): a full course is refused unless the
    // family asked for the waitlist; a course with room is never put on the waitlist, whatever was asked.
    {
      // the submissions being paid for right now hold their seats too (selection fee, 2026-10-22)
      const held = await submissions.heldAsOrders().catch(() => []);
      const live = seats.seatsFor(seats.countOrders(allOrders.concat(held)), snapshot.courses || []);
      const full = [];
      for (const it of items) {
        const st = live[it.code];
        if (st && st.state === "full") { if (waitlistIds.has(String(it.courseId))) it.waitlist = true; else full.push({ courseId: it.courseId, code: it.code, waitlist: st.waitlist }); }
      }
      if (full.length) { context.res = { status: 409, body: { error: "course_full", full } }; return; }
      // the messages say 候补; the stored record keeps the plain names (baseName*) so a seated item reads normally later
      for (const it of items) if (it.waitlist) { it.baseNameZh = it.nameZh; it.baseNameEn = it.nameEn; it.name = it.name + " [候补 / waitlist]"; it.nameZh = it.nameZh + "（候补）"; it.nameEn = it.nameEn + " (waitlist)"; }
      seats.forget();
    }
    // trackId 7 is the K–G8 catalog (not a graduation track) — give it a readable
    // name. Written as the same language pair the real tracks now carry, so
    // trackLabel() renders it in the same "中文 / English" shape rather than this
    // one line being the odd one out.
    const track =
      trackId === 7
        ? { trackId: 7, nameZh: "小学·初中课程", nameEn: "K-G8 Courses" }
        : snapshot.tracks.find((t) => t.trackId === trackId) || null;
    const trackWire = track
      ? { trackId: track.trackId, name: trackLabel(track), nameZh: track.nameZh || "", nameEn: track.nameEn || "" }
      : { trackId, name: "", nameZh: "", nameEn: "" };

    // One submission, one order per hive (design 2026-10-20: 「一张跨机构的订单在提交时按机构拆单」): each hive settles
    // payment and enrolment with the family on its own, so each gets its own order id, record and status; the orders
    // share the submission id, and the family receives one confirmation listing them all.
    const submission = makeSubmissionId(), account = accountOf(req);
    const base = { items, email, account, contact, teamsAccount: teamsAccount || "", track: trackWire, lang, submission };

    // 选课费 (v3 第二批, 2026-10-22): with the fee active the cart is HELD and the family goes to Stripe Checkout; the
    // orders are built when the fee is paid (api/stripe-webhook → finalizeSubmission). Without it: as always.
    const feeOn = fee.activeFee();
    if (feeOn) {
      const r = await holdForPayment(context, base, feeOn);
      context.res = r.ok ? { status: 200, body: { ok: true, checkout: r.url, submission, fee: { amount: feeOn.amount, currency: feeOn.currency, label: feeOn.label }, holdUntil: r.holdUntil } } : { status: 502, body: { error: "payment_unavailable", message: r.error } };
      return;
    }

    const { orders, wire } = await buildOrders(context, snapshot, base, new Date().toISOString(), null);
    const first = orders[0];

    // The orders are final: stored, then announced.
    const result = await finalize(context, orders, wire, flowUrl);
    if (!result.ok) { context.res = { status: 503, body: { error: "store_failed", message: "Order could not be recorded; please try again." } }; return; }
    context.res = {
      status: 200,
      body: { ok: true, orderId: first.orderId, orderIds: orders.map((o) => o.orderId), submission, itemCount: wire.itemCount, totalPrice: wire.totalPrice, notified: result.notify.ok },
    };
  } catch (err) {
    context.log.error("order failed", err);
    context.res = { status: 500, body: { error: String(err.message || err) } };
  }
};

// The hive orders of one submission and the one message to the flow: numbered here (makeOrderId), so a held
// submission spends no number until its fee is paid. `b` = { items, email, account, contact, teamsAccount, track,
// lang, submission }; `feeRec` = the order's fee part (null without a fee).
async function buildOrders(context, snapshot, b, submittedAt, feeRec) {
  const { items, email, account, contact, teamsAccount, lang, submission } = b, trackWire = b.track;
  const routing = (snapshot.private && snapshot.private.schoolRouting) || {};
  const templates = snapshot.messageTemplates;
  const groups = groupByHive(items);
  const orders = [];
  for (const g of groups) {
    const order = {
      orderId: await makeOrderId(g.items, (m) => context.log.warn(m)),
      submission,
      submittedAt,
      email,
      account,
      contact,
      fee: feeRec,
      // The trigger schema types these as strings; sending null or omitting `name`
      // fails schema validation (HTTP 400, no flow run). Use "" for "not provided".
      teamsAccount: teamsAccount || "",
      track: trackWire,
      itemCount: g.itemCount,
      totalPrice: g.subtotal,
      currency: "CNY",
      items: g.items,
      snapshotGeneratedAt: snapshot.generatedAt,
      lang,
    };
    // Per-hive delivery: the hive's Teams channel id and notification address come from snapshot.private (never
    // served to browsers), filled in on the Schools table. A hive with neither still produces a route, with empty
    // destinations — the flow posts those to the default channel so an order can never silently vanish.
    const dest = routing[g.key] || {};
    const m = buildMessages(order, templates, lang);
    const ownChannel = dest.teamsChannelId || "";
    const channelId = ownChannel || cfg.defaultTeamsChannelId || "";
    const usedDefaultChannel = !ownChannel && !!channelId;
    if (!ownChannel) {
      context.log.warn(
        `Hive "${dest.name || g.schoolName || g.key}" has no Teams Channel ID; ` +
          (channelId ? "posting to the default channel instead." : "no DEFAULT_TEAMS_CHANNEL_ID is configured either, so this post will fail.")
      );
    }
    const notice =
      lang === "en"
        ? `<div><b>⚠️ Misrouted:</b> "${escapeHtml(dest.name || g.schoolName || g.key)}" has no Teams channel configured, so this landed here.</div><br>`
        : `<div><b>⚠️ 投递错位：</b>「${escapeHtml(dest.name || g.schoolName || g.key)}」未配置 Teams 频道，因此这条通知落在了这里。</div><br>`;
    order.routes = [{
      hiveKey: g.key,
      schoolName: dest.name || g.schoolName,
      schoolAbbr: dest.abbr || g.schoolAbbr,
      teamsChannelId: channelId,
      usedDefaultChannel,
      notifyEmail: dest.notifyEmail || "",
      itemCount: g.itemCount,
      subtotal: g.subtotal,
      currency: order.currency,
      notifyText: m.notifyText,
      notifySubject: m.notifySubject,
      notifyHtml: usedDefaultChannel ? notice + m.notifyHtml : m.notifyHtml,
    }];
    order.routeCount = 1;
    orders.push(order);
  }

  // What the flow receives: one call per submission, shaped like an order (the trigger's schema), carrying every
  // hive's route and ONE family email that lists every order. `name` etc. stay as they always were.
  const first = orders[0];
  const wire = Object.assign({}, first, {
    orderId: orders.map((o) => o.orderId).join(" / "),
    orderIds: orders.map((o) => o.orderId),
    orders: orders.map((o) => ({ orderId: o.orderId, schoolName: o.routes[0].schoolName, schoolAbbr: o.routes[0].schoolAbbr, items: o.items, itemCount: o.itemCount, totalPrice: o.totalPrice })),
    itemCount: items.length,
    totalPrice: items.reduce((sum, i) => sum + (typeof i.price === "number" ? i.price : 0), 0),
    items,
    routes: orders.map((o) => o.routes[0]),
    routeCount: orders.length,
  });
  // Power Automate receives finished text, not fields to assemble. See the header comment in api/shared/messages.js.
  const msg = buildMessages(wire, templates, lang);
  wire.notifyText = msg.notifyText;
  wire.emailTo = email;
  wire.emailSubject = msg.emailSubject;
  wire.emailHtml = msg.emailHtml;
  wire.emailBodyText = msg.emailBodyText;

  return { orders, wire };
}

// Store the record and send the notifications (Teams per hive + the family's email, via the flow). The step after
// the family's part is done — today straight from the submission, later from the paid-fee webhook.
async function finalize(context, orders, wire, flowUrl, opts) {
  // 1. The records, one per hive order. If even this fails the submission is refused — nothing would
  //    remember it — and the family is asked to try again. From a paid submission (opts.again) a record that is
  //    already there is left as it is: the webhook may run twice.
  for (const order of orders) {
    const record = crm.orderRecord(order, { ok: false, at: order.submittedAt, pending: true });
    try {
      if (opts && opts.again && (await crm.readOrder(order.orderId))) continue;
      await crm.writeOrder(record);
    } catch (err) {
      context.log.error(`order ${order.orderId} could not be stored: ${String(err && err.message || err)}`);
      return { ok: false };
    }
  }
  const order = wire;

  // 2. The notifications — once per submission (opts.claim answers false when another run already sent them).
  if (opts && opts.claim && !(await opts.claim())) return { ok: true, notify: { ok: true, at: new Date().toISOString(), skipped: true } };
  const headers = { "Content-Type": "application/json" };
  if (process.env.ORDER_SHARED_SECRET) headers["X-Order-Secret"] = process.env.ORDER_SHARED_SECRET;
  let notify;
  try {
    const res = await fetch(flowUrl, { method: "POST", headers, body: JSON.stringify(order) });
    if (!res.ok && res.status !== 202) {
      const text = await res.text();
      context.log.error(`Power Automate -> HTTP ${res.status}: ${text.slice(0, 300)}`);
      notify = { ok: false, at: new Date().toISOString(), error: `HTTP ${res.status}` };
    } else {
      notify = { ok: true, at: new Date().toISOString() };
    }
  } catch (err) {
    context.log.error(`Power Automate unreachable: ${String(err && err.message || err)}`);
    notify = { ok: false, at: new Date().toISOString(), error: String(err && err.message || err).slice(0, 200) };
  }
  // Best effort: the outcome of the notification is written back onto each
  // record. A failure here is logged; the orders themselves are already safe.
  for (const o of orders) {
    try {
      const cur = await crm.readOrder(o.orderId);
      if (cur) await crm.writeOrder(Object.assign({}, cur.order, { notify }), cur.etag);
    } catch (err) {
      context.log.warn(`order ${o.orderId}: notify status not recorded: ${String(err && err.message || err)}`);
    }
  }
  return { ok: true, notify };
}
// ---- the selection fee: hold, pay, finalize ---------------------------------------------------------------------

// Hold the priced cart as a submission and open a Stripe Checkout session for the fee. { ok, url, holdUntil } or
// { ok: false, error } — then nothing is held (the submission is closed as abandoned).
async function holdForPayment(context, base, feeOn) {
  const created = Date.now(), expiresAt = created + 31 * 60 * 1000; // Stripe's minimum session life is 30 minutes
  const holdUntil = new Date(Math.max(expiresAt + 5 * 60 * 1000, created + submissions.holdMinutes() * 60 * 1000)).toISOString();
  const doc = Object.assign({}, base, {
    status: "held", createdAt: new Date(created).toISOString(), holdUntil,
    fee: { amount: feeOn.amount, currency: feeOn.currency, status: "unpaid" },
    stripe: null, orderIds: [], history: [{ at: new Date(created).toISOString(), by: base.account || base.email, action: "held" }],
  });
  await submissions.create(doc);
  try {
    const en = base.lang === "en", q = encodeURIComponent(base.submission);
    const session = await stripe.createCheckout({
      submission: base.submission, fee: feeOn, email: base.email, lang: base.lang, expiresAt,
      successUrl: `${SITE()}/done?submission=${q}`,
      cancelUrl: `${SITE()}/order?payment=cancelled&submission=${q}`,
      description: en ? "Hive selection fee" : "蜂巢选课费",
    });
    await submissions.update(base.submission, (d) => { d.stripe = { sessionId: session.id, url: session.url, expiresAt: new Date(expiresAt).toISOString(), livemode: !!session.livemode }; });
    return { ok: true, url: session.url, holdUntil };
  } catch (err) {
    context.log.error(`submission ${base.submission}: Stripe checkout failed: ${String(err && err.message || err)}`);
    await submissions.update(base.submission, (d) => { d.status = "abandoned"; submissions.pushHistory(d, { by: "system", action: "checkout_failed", note: String(err && err.message || err).slice(0, 200) }); }).catch(() => {});
    await submissions.close(base.submission).catch(() => {});
    return { ok: false, error: String(err && err.message || err).slice(0, 200) };
  }
}

// The fee is paid (or a promotion code covered it): build, number, store and announce the orders, once. Safe to call
// again (the webhook retries, the done page and the nightly reconcile may get there too). `session` = Stripe's
// Checkout session, paid. → { ok, orderIds, already? }
async function finalizeSubmission(context, id, session) {
  let sub = await submissions.read(id);
  if (!sub) return { ok: false, code: "not_found" };
  if (sub.status === "paid") return { ok: true, already: true, orderIds: sub.orderIds || [] };
  const flowUrl = process.env.POWER_AUTOMATE_URL || "";
  const feeDone = stripe.feeFromSession(session, sub.fee);
  if (!sub.built) {
    const snapshot = await readSnapshot();
    if (!snapshot) return { ok: false, code: "no_snapshot" };
    const built = await buildOrders(context, snapshot, sub, new Date().toISOString(), feeDone);
    sub = await submissions.update(id, (d) => {
      if (d.built) return false; // another run numbered them first: use those
      d.built = built; d.status = "finalizing"; d.fee = Object.assign({}, d.fee, feeDone);
      submissions.pushHistory(d, { by: "stripe", action: feeDone.status === "paid" ? "fee_paid" : "fee_waived", note: feeDone.coupon || "" });
    });
  }
  const { orders, wire } = sub.built;
  const claim = async () => { let mine = false; await submissions.update(id, (d) => { mine = false; if (d.notifyClaimed) return false; d.notifyClaimed = new Date().toISOString(); mine = true; }); return mine; };
  const result = await finalize(context, orders, wire, flowUrl, { again: true, claim });
  if (!result.ok) return { ok: false, code: "store_failed" };
  const orderIds = orders.map((o) => o.orderId);
  await submissions.update(id, (d) => { d.status = "paid"; d.orderIds = orderIds; d.finalizedAt = new Date().toISOString(); submissions.pushHistory(d, { by: "system", action: "orders", note: orderIds.join(", ") }); });
  await submissions.close(id).catch(() => {});
  seats.forget();
  return { ok: true, orderIds };
}

module.exports.accountOf = accountOf;
module.exports.finalizeSubmission = finalizeSubmission;
module.exports.buildOrders = buildOrders;
