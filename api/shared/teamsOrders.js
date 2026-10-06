// Recover the orders that were only ever announced in the "Hive Orders" Teams
// channel (before api/order stored them, 2026-10-06) from an export of that
// channel's messages, and turn them into the same records api/order writes.
//
// Input: Microsoft Graph chatMessage objects (what Get-MgTeamChannelMessage or
// GET /teams/{id}/channels/{id}/messages returns) — only id, createdDateTime
// and body.content are used. Each message is one hive's notification
// (api/shared/messages.js order_notification), so an order that spanned two
// hives appears twice and is merged on its order id. Course lines are
// enriched from the site snapshot by course code, which is what makes the
// stored record bilingual (nameZh / nameEn, class type, language, hive)
// whatever language the message was posted in.
//
// Anything that does not carry an order id is reported, not guessed.
const ORDER_ID_RE = /FC-\d{8}(?:-[A-Z0-9一-鿿]{1,12})?-[A-Z0-9]{3,4}/;

function htmlToText(html) {
  let t = String(html || "");
  t = t.replace(/<\s*br\s*\/?>/gi, "\n").replace(/<\/\s*(p|div|li|tr|h\d)\s*>/gi, "\n").replace(/<[^>]+>/g, "");
  t = t.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");
  t = t.replace(/&#(\d+);/g, (_, c) => String.fromCodePoint(parseInt(c, 10)));
  return t.replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function field(text, labels) {
  const re = new RegExp("(?:^|\\n)\\s*[·•\\-]?\\s*(?:" + labels.join("|") + ")\\s*[：:]\\s*([^\\n]*)", "i");
  const m = re.exec(text);
  return m ? m[1].trim() : "";
}
function money(str) {
  const m = /([\d][\d,]*(?:\.\d+)?)/.exec(String(str || "").replace(/\s/g, ""));
  return m ? parseFloat(m[1].replace(/,/g, "")) : null;
}
// "2026/08/31 14:02" or "31/08/2026, 14:02" (Beijing time, see messages.formatWhen) → ISO.
function parseWhen(str, fallback) {
  const s = String(str || "").trim();
  let m = /^(\d{4})[\/\-年](\d{1,2})[\/\-月](\d{1,2})日?,?\s*(\d{1,2}):(\d{2})/.exec(s);
  let y, mo, d, h, mi;
  if (m) [y, mo, d, h, mi] = m.slice(1).map(Number);
  else if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s*(\d{1,2}):(\d{2})/.exec(s))) { d = +m[1]; mo = +m[2]; y = +m[3]; h = +m[4]; mi = +m[5]; }
  else return fallback || null;
  return new Date(Date.UTC(y, mo - 1, d, h - 8, mi)).toISOString();
}

// One message → { orderId, email, teamsAccount, lang, submittedAt, track, schools, items:[{code,name,price,priceTbd}], total }
function parseMessage(msg) {
  const text = htmlToText(msg && msg.body && msg.body.content);
  const idm = ORDER_ID_RE.exec(text);
  if (!idm) return null;
  const lang = /New Hive order|Family contact/i.test(text) && !/蜂巢新订单/.test(text) ? "en" : "zh";
  const items = [];
  for (const line of text.split("\n")) {
    const m = /^\s*[•·]\s*(\S+)\s+(.*?)\s+[—\-–]\s+(.+?)\s*$/.exec(line);
    if (!m) continue;
    const price = /价格待定|Price TBD/i.test(m[3]) ? null : money(m[3]);
    items.push({ code: m[1], name: m[2].trim(), price, priceTbd: price == null });
  }
  return {
    orderId: idm[0],
    email: (field(text, ["邮箱", "Email"]).match(/\S+@\S+/) || [""])[0].toLowerCase(),
    teamsAccount: (field(text, ["Teams"]).match(/\S+@\S+/) || [""])[0].toLowerCase(),
    lang,
    submittedAt: parseWhen(field(text, ["提交时间", "Submitted"]), msg && msg.createdDateTime),
    track: field(text, ["教育路径", "Track"]),
    schools: field(text, ["所属机构", "Institution"]),
    items,
    total: money(field(text, ["合计", "Total"])),
    messageId: (msg && msg.id) || "",
    messageAt: (msg && msg.createdDateTime) || "",
  };
}

// The snapshot's course by code, and hive by name/abbr, for enrichment.
function indexes(snapshot) {
  const byCode = new Map();
  for (const c of (snapshot && snapshot.courses) || []) if (c.code) byCode.set(String(c.code).trim().toUpperCase(), c);
  const tracks = (snapshot && snapshot.tracks) || [];
  return { byCode, tracks };
}
function pair(zh, en) { return [zh, en].filter(Boolean).join(" / "); }

// Parsed messages → order records (merged by order id). Returns { orders, skipped }.
function toRecords(parsed, snapshot) {
  const { byCode, tracks } = indexes(snapshot);
  const byId = new Map();
  for (const p of parsed) {
    const cur = byId.get(p.orderId);
    if (!cur) byId.set(p.orderId, { msgs: [p] });
    else cur.msgs.push(p);
  }
  const orders = [];
  for (const [orderId, { msgs }] of byId) {
    msgs.sort((a, b) => String(a.messageAt).localeCompare(String(b.messageAt)));
    const first = msgs[0];
    const items = [];
    const seen = new Set();
    for (const m of msgs) for (const it of m.items) {
      const key = it.code.toUpperCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const c = byCode.get(key);
      items.push({
        code: it.code,
        nameZh: c ? c.nameZh || "" : m.lang === "zh" ? it.name : "",
        nameEn: c ? c.nameEn || "" : m.lang === "en" ? it.name : "",
        classType: c ? pair(c.classTypeZh, c.classTypeEn) : "",
        language: c ? pair(c.languageZh, c.languageEn) : "",
        grades: c ? c.grades || [] : [],
        teachers: c ? c.teachers || [] : [],
        price: typeof it.price === "number" ? it.price : typeof (c && c.price) === "number" ? c.price : 0,
        priceTbd: it.priceTbd && typeof (c && c.price) !== "number",
        schoolName: c && c.school ? c.school.name || "" : m.schools,
        schoolAbbr: c && c.school ? c.school.abbr || "" : "",
      });
      // a course the snapshot no longer knows keeps the one name we have on both sides
      const last = items[items.length - 1];
      if (!last.nameZh && !last.nameEn) last.nameZh = last.nameEn = it.name;
      else if (!last.nameZh) last.nameZh = last.nameEn; else if (!last.nameEn) last.nameEn = last.nameZh;
    }
    const hives = [];
    for (const it of items) {
      const key = (it.schoolAbbr || it.schoolName || "").toLowerCase();
      let h = hives.find((x) => x.key === key);
      if (!h) { h = { key, name: it.schoolName, abbr: it.schoolAbbr, itemCount: 0, subtotal: 0, notified: true }; hives.push(h); }
      h.itemCount++; h.subtotal += it.price || 0;
    }
    const total = items.reduce((a, it) => a + (it.price || 0), 0);
    const tr = tracks.find((t) => t && (t.nameZh === first.track || t.nameEn === first.track || t.name === first.track)) || null;
    const submittedAt = first.submittedAt || first.messageAt || new Date().toISOString();
    orders.push({
      orderId, source: "hive", submittedAt, email: first.email, teamsAccount: first.teamsAccount, lang: first.lang,
      track: tr ? { trackId: tr.trackId, nameZh: tr.nameZh || "", nameEn: tr.nameEn || "" } : first.track ? { trackId: null, nameZh: first.lang === "zh" ? first.track : "", nameEn: first.lang === "en" ? first.track : "" } : null,
      items, hives, itemCount: items.length, totalPrice: total, currency: "CNY",
      status: "submitted",
      history: [{ at: submittedAt, by: "import", from: null, to: "submitted", note: "从 Teams 频道导入 / imported from the Teams channel" }],
      notify: { ok: true, at: first.messageAt || submittedAt, imported: true },
      imported: { from: "teams", messageIds: msgs.map((m) => m.messageId).filter(Boolean), at: new Date().toISOString() },
      crmId: null, snapshotGeneratedAt: (snapshot && snapshot.generatedAt) || null,
    });
  }
  orders.sort((a, b) => String(a.submittedAt).localeCompare(String(b.submittedAt)));
  return orders;
}

// Graph export in any of its shapes → the chatMessage array.
function messagesOf(input) {
  if (Array.isArray(input)) return input;
  if (input && Array.isArray(input.value)) return input.value;
  if (input && Array.isArray(input.messages)) return input.messages;
  return [];
}

function parseExport(input, snapshot) {
  const msgs = messagesOf(input);
  const parsed = [];
  const skipped = [];
  for (const m of msgs) {
    const p = parseMessage(m);
    if (p) parsed.push(p);
    else skipped.push({ id: (m && m.id) || "", at: (m && m.createdDateTime) || "", preview: htmlToText(m && m.body && m.body.content).slice(0, 80) });
  }
  return { orders: toRecords(parsed, snapshot), skipped, messages: msgs.length };
}

module.exports = { ORDER_ID_RE, htmlToText, parseMessage, toRecords, parseExport, parseWhen };
