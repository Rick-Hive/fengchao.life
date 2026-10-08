// Management-centre smoke test: the real pages against mocked APIs (the hub, royalty
// and licence modules are the real ones). Needs Playwright with a Chromium:
//   npm i -D playwright && npx playwright install chromium   (or PLAYWRIGHT_MODULE / CHROME_PATH)
// Run:  node test/ui/smoke.js        screenshots → test/ui/shots/ (or $OUT)
// Not part of the deploy gate (bash scripts/test.sh): it needs a browser download.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("assert");
const http = require("http"), fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..", "..");
require("child_process").execFileSync(process.execPath, [path.join(ROOT, "scripts", "build-management.js")], { stdio: "inherit" }); // the page loads the built file
const OUT = process.env.OUT || path.join(__dirname, "shots");
fs.mkdirSync(OUT, { recursive: true });
const mime = { ".html": "text/html", ".css": "text/css", ".js": "application/javascript", ".png": "image/png", ".json": "application/json", ".svg": "image/svg+xml" };
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p.endsWith("/")) p += "index.html";
  const f = path.join(ROOT, p);
  if (fs.existsSync(f) && fs.statSync(f).isFile()) { res.writeHead(200, { "content-type": mime[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(res); }
  else { res.writeHead(404); res.end("nf " + p); }
});
const summary = {
  profile: { upn: "rick.zhang@bes.qiaoliang.online", displayName: "Rick Zhang", givenName: "Rick", surname: "Zhang", mail: "rick.zhang@bes.qiaoliang.online", safeEmail: "rick@ceff.us", mobilePhone: "", jobTitle: "校长", department: "行政", officeLocation: "", streetAddress: "", city: "南京", state: "江苏", country: "中国", postalCode: "210000", preferredLanguage: "zh-CN", created: "2026-08-01T00:00:00Z", guest: false },
  methods: [{ id: "m1", kind: "authenticator", name: "iPhone 15", version: "6.8.1", created: "2026-09-10T00:00:00Z", strong: true, deletable: true }, { id: "m2", kind: "password", name: "密码", created: "2026-08-01T00:00:00Z", strong: false }],
  roles: ["admin", "staff:sysadmin"],
  hive: { admins: [{ upn: "lei.dong@bes.qiaoliang.online", displayName: "Lei Dong", it: true, hive: false }, { upn: "mei.wang@bes.qiaoliang.online", displayName: "Mei Wang", it: false, hive: true }], identity: "家长", linked: ["kid.one@bes.qiaoliang.online"], canEditName: false, institution: "北京某某学校",
    extra: { roles: ["家长", "老师"], rolesOther: "", topics: ["教材", "标化考试", "其它"], topicsOther: "科学实验", otherAccounts: ["rick@fengchao.life", "rick.z@giwas.org"], children: [
      { name: "大宝", age: 12, grade: "6", schooling: "在家教育", model: "古典教育", higherEd: ["欧美大学", "2+2混合制大学"], higherEdOther: "", account: "kid.one@bes.qiaoliang.online" },
      { age: 8, grade: "2", schooling: "国际学校", model: "其它", modelOther: "Sonlight", higherEd: ["未定"], higherEdOther: "", account: "" } ] },
    vocab: { selfRoles: ["家长","老师","学校行政","机构负责人","其它"], topics: ["教材","课程","教师培训","家长-亲子培训","海外留学","大学路径","双学分/AP课程","标化考试","其它"], grades: ["学前","1","2","3","4","5","6","7","8","9","10","11","12"], schooling: ["公立学校","私立学校","国际学校","基督教学校","在家教育"], models: ["古典教育","BJU","Abeka","混合教学法","不清楚","其它"], higherEd: ["欧美大学","东南亚大学","英国/澳洲大学","国内大学","2+2混合制大学","未定","其它"], maxChildren: 8, maxAccounts: 5 } }
};
const groups = {
  groups: [
    { id: "g1", name: "English Grade 5", description: "Fifth-grade English reading and writing", kind: "team", visibility: "Private", members: 18, channels: 4, owner: true, created: "2026-08-01T00:00:00Z" },
    { id: "g2", name: "Math Grade 5", description: "Fifth-grade mathematics", kind: "team", visibility: "Public", members: 20, channels: 3, owner: false, created: "2026-08-01T00:00:00Z" },
    { id: "g3", name: "BES Staff", description: "All teachers and administrators at BES", kind: "m365", visibility: "Private", members: 12, channels: 0, owner: false, created: "2026-08-01T00:00:00Z" },
    { id: "g4", name: "English Teachers", description: "Coordination for English department", kind: "team", visibility: "Private", members: 5, channels: 2, owner: true, created: "2026-08-05T00:00:00Z" },
    { id: "g5", name: "Hive/蜂巢", description: "", kind: "security", visibility: "", members: 40, channels: 0, owner: false, created: "2026-08-20T00:00:00Z" },
    { id: "g6", name: "Science Grade 6", description: "Sixth-grade science lab", kind: "team", visibility: "Public", members: 22, channels: 5, owner: false, created: "2026-09-01T00:00:00Z" }
  ]
};
const CAN = { methods: true, people: true, full: true };
const domains = { user: summary.profile.upn, roles: ["admin"], all: true, mine: "bes.qiaoliang.online", domains: [{ domain: "bes.qiaoliang.online", name: "北京某某学校", nameEn: "Beijing Example School", isDefault: true, isInitial: false, can: CAN }, { domain: "demo.fengchao.life", name: "", isDefault: false, isInitial: false, can: CAN }], showDomains: true };
function mkUser(i) {
  const names = ["Elaine Chen", "Lei Dong", "Rick Zhang", "Mei Wang", "Tom Li", "Anna Zhao", "Kevin Wu", "Sophie Liu", "Jack Sun", "Lily Huang", "Mark Zhou", "Grace Xu"];
  const n = names[i % names.length]; const upn = n.toLowerCase().replace(" ", ".") + "@bes.qiaoliang.online";
  const verified = i % 3 !== 0;
  return { id: "u" + i, upn, displayName: n, enabled: i !== 7, created: "2026-08-0" + ((i % 9) + 1) + "T00:00:00Z", lastSignIn: i % 4 ? "2026-09-2" + (i % 9) + "T08:00:00Z" : null,
    verified, devices: verified ? [{ id: "d" + i, kind: "authenticator", name: i % 2 ? "iPhone 13" : "Xiaomi 14", version: "6.8.1", created: "2026-09-01T00:00:00Z" }] : [], otherMethods: ["password"],
    groups: i % 2 ? [{ id: "g1", name: "English Grade 5", kind: "team", nameZh: "五年级英语", nameEn: "English Grade 5" }] : [{ id: "g2", name: "Math Grade 5", kind: "team" }, { id: "g3", name: "BES Staff", kind: "m365" }],
    roles: i === 1 ? [{ role: "domain_it:bes.qiaoliang.online", zh: "域管理员（IT） · bes.qiaoliang.online", en: "Domain administrator (IT) · bes.qiaoliang.online" }] : [], hiveTeacher: i % 5 === 2 ? { name: n, teacherId: "T-00" + i, organization: ["BES"] } : null, plan: i % 5 === 1 ? "student" : "faculty", anomaly: i === 6 ? "student_without_student_plan" : i === 1 ? "" : "", safeEmail: i % 2 ? "" : "parent" + i + "@gmail.com", city: ["南京", "苏州", ""][i % 3],
    identity: ["家长", "学生", "老师", "行政", ""][i % 5], identitySource: i % 5 === 4 ? "" : (i % 2 ? "hive" : "entra"), linked: i % 5 === 0 ? ["kid.chen@bes.qiaoliang.online"] : [], note: i === 1 ? "SSPR 未生效，待复核" : "", extra: i === 1 ? { city: "南京", needs: ["教材"], children: [{ name: "大宝", age: 12, grade: "6", schooling: "在家教育", model: "古典教育", higherEd: "海外上大学", account: "kid.chen@bes.qiaoliang.online" }] } : null };
}
const SYNC = { domain: "bes.qiaoliang.online", done: true, mode: "full", total: 12, remaining: 0, users: 12, syncedAt: "2026-10-01T17:00:00Z", fullAt: "2026-10-01T17:00:00Z", lastRun: null, error: null, added: 0 };
const users = { domain: "bes.qiaoliang.online", partial: false, sync: SYNC, users: Array.from({ length: 12 }, (_, i) => mkUser(i)) };
const dgroups = { sync: SYNC, groups: groups.groups.map((g, i) => ({ ...g, nameZh: i === 0 ? "五年级英语" : "", nameEn: i === 0 ? "English Grade 5" : "", mail: g.name.toLowerCase().replace(/ /g, ".") + "@bes.qiaoliang.online", domainMembers: 3, members: users.users.slice(i, i + 3).map(u => u.upn) })) };
const roles = { entries: [
  { user: "lei.dong@bes.qiaoliang.online", roles: ["domain_it:bes.qiaoliang.online"], by: "rick.zhang@bes.qiaoliang.online", at: "2026-10-01T02:00:00Z", displayName: "Lei Dong", domain: "bes.qiaoliang.online", lastSignIn: "2026-10-03T01:00:00Z", inDirectory: true },
  { user: "mei.wang@bes.qiaoliang.online", roles: ["domain_hive:bes.qiaoliang.online", "staff:community"], by: "rick.zhang@bes.qiaoliang.online", at: "2026-10-02T02:00:00Z", displayName: "Mei Wang", domain: "bes.qiaoliang.online", lastSignIn: "", inDirectory: true },
  { user: "ops@fengchao.life", roles: ["staff:sysadmin", "admin"], by: "rick.zhang@bes.qiaoliang.online", at: "2026-09-29T02:00:00Z", displayName: "", domain: "fengchao.life", lastSignIn: "", inDirectory: false },
], kinds: {}, staff: {} };
// A 100×60 red PNG for the photo test (zlib-compressed raw rows).
const zlib = require("zlib");
function png(w, h) {
  const crc = (buf) => { let c, n, k, table = png.t || (png.t = (() => { const t = []; for (n = 0; n < 256; n++) { c = n; for (k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })()); c = 0xffffffff; for (n = 0; n < buf.length; n++) c = table[(c ^ buf[n]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((w * 3 + 1) * h); for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = 200; raw[o + 1] = 40; raw[o + 2] = 40; } }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
let photoSaved = null, created = null, deleted = null;
const peopleHits = [
  { upn: "tom.li@bes.qiaoliang.online", displayName: "Tom Li", domain: "bes.qiaoliang.online", lastSignIn: "2026-10-02T03:00:00Z" },
  { upn: "tomas.chen@demo.fengchao.life", displayName: "Tomas Chen", domain: "demo.fengchao.life", lastSignIn: "" },
];

const crm = require(path.join(ROOT, "api", "shared", "crm.js"));
const dayMs = 86400000;
function mkOrder(i, status, agoDays, notifyOk) {
  const at = new Date(Date.now() - agoDays * dayMs).toISOString();
  const o = { orderId: "FC-2026100" + (i % 9 + 1) + "-KXC-00" + (i + 1), source: "hive", submittedAt: at, email: ["parent" + i + "@gmail.com", "mama" + i + "@qq.com"][i % 2], teamsAccount: i % 3 ? "" : "p" + i + "@equipme.cloud", lang: i % 2 ? "en" : "zh",
    track: { trackId: 2, nameZh: "国内路径", nameEn: "Domestic track" },
    items: [{ code: "KXC-MATH-7", nameZh: "七年级数学", nameEn: "Grade 7 Mathematics", classType: "直播课 / Live Course", language: "中文 / Chinese", grades: ["G7"], teachers: ["张老师"], price: 1200, priceTbd: false, schoolName: "Kids X Center", schoolAbbr: "KXC" },
            { code: "KXC-SCI-7", nameZh: "七年级科学", nameEn: "Grade 7 Science", classType: "录播课 / Prerecorded", language: "英语 / English", grades: ["G7", "G8"], teachers: ["Mr Lee"], price: i % 4 ? 900 : 0, priceTbd: i % 4 === 0, schoolName: "Kids X Center", schoolAbbr: "KXC" }],
    hives: [{ key: "kxc", name: "Kids X Center", abbr: "KXC", itemCount: 2, subtotal: 2100, notified: true }], itemCount: 2, totalPrice: 2100, currency: "CNY",
    status: "submitted", history: [{ at, by: "system", from: null, to: "submitted", note: "" }], notify: { ok: notifyOk, at, error: notifyOk ? undefined : "HTTP 502" }, crmId: null };
  let cur = o; const chain = { confirmed: ["confirmed"], paid: ["confirmed", "paid"], started: ["confirmed", "paid", "started"], cancelled: ["cancelled"] }[status] || [];
  let step = agoDays - 1;
  for (const s of chain) { cur = crm.transition(cur, s, "om@fengchao.life", s === "paid" ? "家长已转账" : "", ["staff:sales"], new Date(Date.now() - Math.max(step--, 0) * dayMs)); }
  return cur;
}
let ORDERS = [mkOrder(0, "submitted", 2, true), mkOrder(1, "submitted", 10, true), mkOrder(2, "confirmed", 20, true), mkOrder(3, "paid", 5, false), mkOrder(4, "started", 40, true), mkOrder(5, "cancelled", 3, true), mkOrder(6, "confirmed", 4, true), mkOrder(7, "submitted", 1, false)];
function ordersBody(acc) {
  const counts = { all: ORDERS.length, submitted: 0, confirmed: 0, paid: 0, started: 0, cancelled: 0, overdue: 0, notifyFailed: 0 };
  const list = ORDERS.map((o) => { const od = crm.overdue(o); counts[o.status]++; if (od) counts.overdue++; if (o.notify.ok === false) counts.notifyFailed++; return Object.assign(crm.mask(o, acc), { overdue: od }); });
  return { orders: list, counts, access: acc, statuses: crm.STATUS_LABELS, overdueDays: crm.OVERDUE_DAYS };
}
let patched = [], imported = [], groupNamed = [], EQUIP_SYNCED = false, teamsCalls = [], fillCalls = [], TEAMS_OK = false;
const EQUIP = [
  { source: "equip", recId: "recO1", orderId: "Manual order 35", date: "2026-10-01", amount: 1296, received: 1296, email: "mama@qq.com", name: "Mei Wang", customerRec: "recC1", customerCrmId: "", comments: "转账", publishers: ["IEW"], itemCount: 2, qty: 2, items: [{ sku: "IEW-SSS1A-FP", nameEn: "IEW: SSS 1-A - Full Package", nameZh: "IEW 结构和风格 1A - 全套", publisher: "IEW", category: "Curriculum", subject: "English", grade: "G3", qty: 2, unitPrice: 648, total: 1296, royalty: { "Royalty Rate": 0.15 } }] },
  { source: "equip", recId: "recO2", orderId: "School order MIS", date: "2026-09-12", amount: 3074, received: 3000, email: "school@gmail.com", name: "MIS", customerRec: "recC2", customerCrmId: "", comments: "", publishers: ["CEFF"], itemCount: 1, qty: 53, items: [{ sku: "CEFF-CSB", nameEn: "The Child's Story Bible", nameZh: "儿童圣经故事", publisher: "CEFF", category: "Curriculum", subject: "Bible", grade: "K-2", qty: 53, unitPrice: 58, total: 3074, royalty: {} }] },
];
(async () => {
  await new Promise(r => srv.listen(0, r)); const port = srv.address().port;
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const errs = [];
  const hubMod = require(path.join(ROOT, "api", "shared", "hub.js"));
  const HUB_SRC = {
    hiveInstitutions: [{ id: "recS1", key: "KXC", name: "Kids X Center", abbr: "KXC", type: "蜂巢", country: "中国", city: "南京", website: "kxc.edu", courses: 3 }, { id: "recS2", key: "GCU", name: "Grace Christian University", abbr: "GCU", type: "大学", country: "美国", city: "Dallas", website: "https://gcu.example.edu", courses: 0 }],
    institutionNames: { "kxc.edu": { name: "Kids X Center", nameEn: "Kids X Center" } },
    equip: { syncedAt: "2026-10-06T17:05:00Z", customers: [
      { recId: "recC1", email: "mama@qq.com", teams: "mama@equipme.cloud", name: "Mei Wang", crmId: "", city: "南京", active: true, createdTime: "2026-01-01T00:00:00Z" },
      { recId: "recC2", email: "dad@gmail.com", teams: "", name: "Zhang San", crmId: "", city: "", active: true, createdTime: "2026-02-01T00:00:00Z" },
      { recId: "recC3", email: "", teams: "", name: "Li Si", crmId: "HC-000042", city: "", active: false, createdTime: "2025-05-01T00:00:00Z" },
      { recId: "recC4", email: "old@163.com", teams: "", name: "Wang Wu", crmId: "", city: "", active: true, createdTime: "2024-05-01T00:00:00Z" },
      { recId: "recC5", email: "mum@gmail.com", teams: "", name: "Mum Bao", crmId: "", city: "", active: true, createdTime: "2025-09-01T00:00:00Z" }],
      orders: [{ recId: "recO1", customerRec: "recC1", email: "mama@qq.com", amount: 1296, received: 1296, date: "2026-10-01" }, { recId: "recO2", customerRec: "recC2", email: "dad@gmail.com", amount: 500, received: 500, date: "2025-03-01" }, { recId: "recO3", customerRec: "recC4", email: "old@163.com", amount: 300, received: 300, date: "2024-06-01" }],
      seminar: [{ recId: "recS1", email: "lead@gmail.com", name: "Lead One", session: "2026-05", createdTime: "2026-05-01T00:00:00Z" }] },
    domains: [{ domain: "equipme.cloud", users: [{ upn: "mama@equipme.cloud", displayName: "Mei Wang", safeEmail: "", lastSignIn: "2026-10-01T00:00:00Z", enabled: true, created: "2026-01-05T00:00:00Z", identity: "家长" }] },
      { domain: "kxc.edu", users: [{ upn: "zhang.san@kxc.edu", displayName: "Zhang San", safeEmail: "", lastSignIn: "2026-09-30T00:00:00Z", enabled: true, verified: true, created: "2026-03-01T00:00:00Z", identity: "家长" }] },
      { domain: "xqzw.edu", users: ["enqi", "enya"].map(n => ({ upn: n + ".bao@xqzw.edu", displayName: n[0].toUpperCase() + n.slice(1) + " Bao", safeEmail: "mum@gmail.com", lastSignIn: "2026-10-05T00:00:00Z", enabled: true, created: "2025-09-10T00:00:00Z", identity: "学生" })) }],
    hiveOrders: [{ orderId: "FC-20261001-KXC-001", email: "lead@gmail.com", teamsAccount: "", totalPrice: 1200, status: "paid", submittedAt: "2026-10-01T02:00:00Z", hives: [{ abbr: "KXC" }] }],
    decisions: { pairs: {} }, now: Date.parse("2026-10-07T00:00:00Z") };
  const ptPosts = [], seeds = [];
  let HUB = hubMod.build(HUB_SRC); const MARKS = { marks: {} }; const ROY_PAID = {}; const PARTNERS = {}; const entries = []; const received = [];
  const royaltyMod = require(path.join(ROOT, "api", "shared", "royalty.js"));
  // 合作伙伴: the real rules (api/shared/partners.js) over in-memory documents.
  const ptMod = require(path.join(ROOT, "api", "shared", "partners.js"));
  const REL = { next: 1, items: {} }, PRJ = { next: 1, items: {} }, ORGS = { next: 1, byKey: {}, orgs: {} }, CONTACTS = [];
  function ptOrgIdx() { const m = new Map(); for (const i of HUB.institutions) m.set(i.key || i.domain, i); return m; }
  function ptRow(rel, projects) { const idx = ptOrgIdx(); const i = rel.party && rel.party.kind === "org" ? idx.get(rel.party.key) : null; const mine = projects.filter(x => x.relationship === rel.id); const pn = rel.party ? (rel.party.kind === "org" ? ((i && (i.name || i.nameEn)) || rel.party.name || rel.party.key) : ((HUB.people.find(x => x.crmId === rel.party.id) || {}).name || rel.party.name)) : ""; return Object.assign({}, rel, { partyName: pn, metrics: i ? { accounts: i.accounts || 0, active: i.active || 0, customers: i.customers || 0, courses: i.courses || 0, hiveOrders: i.hiveOrders || 0 } : null, projects: mine.length, activeProjects: mine.filter(x => x.status === "active").length, overdueMilestones: 0 }); }
  const licMod = require(path.join(ROOT, "api", "shared", "licenses.js")); const LIC = { pools: [], allocations: [], nextPool: 1, nextAlloc: 1 };
  const verdicts = []; let rebuilds = 0; const deleted = []; const writebacks = []; const digests = [];
  async function shot(name, w, h, hash, lang, rolesList, act) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    page.on("pageerror", e => errs.push(name + ": " + e.message));
    page.on("console", m => { if (m.type() === "error" && !/status of (403|409)/.test(m.text())) errs.push(name + " console: " + m.text()); });
    const acc = crm.accessMap(rolesList);
    const me = Object.assign({}, summary, { roles: rolesList, crm: acc });
    const isAdm = rolesList.indexOf("admin") >= 0;
    await page.route("**/api/**", r => {
      const u = new URL(r.request().url()); const p = u.pathname; let body = { error: "nf" }, status = 200;
      if (p === "/api/me/summary") body = me;
      else if (p === "/api/me/groups") body = groups;
      else if (p === "/api/domain/domains") body = isAdm || rolesList.some(x => /^staff:/.test(x)) ? domains : { user: me.profile.upn, roles: rolesList, all: false, mine: "bes.qiaoliang.online", domains: [], showDomains: false };
      else if (p === "/api/domain/user" && r.request().method() === "DELETE") { const b = JSON.parse(r.request().postData()); deleted.push(b); users.users = users.users.filter(u => u.upn !== b.user); dgroups.groups.forEach(g => { g.members = g.members.filter(m => m !== b.user); g.domainMembers = g.members.length; }); body = { ok: true, user: b.user, displayName: "Tom Li", restorableDays: 30 }; }
      else if (p === "/api/domain/users") { const demo = users.users.slice(0, 3).map(u => ({ ...u, upn: u.upn.replace("bes.qiaoliang.online", "demo.fengchao.life"), roles: [], hiveTeacher: null })); body = u.searchParams.get("domain") === "*" ? { domain: "*", domains: ["bes.qiaoliang.online", "demo.fengchao.life"], partial: false, sync: SYNC, users: users.users.map(x => ({ ...x, domain: "bes.qiaoliang.online" })).concat(demo.map(x => ({ ...x, domain: "demo.fengchao.life" }))) } : /demo\.fengchao\.life/.test(u.search) ? { domain: "demo.fengchao.life", partial: false, sync: SYNC, users: demo } : users; }
      else if (p === "/api/domain/groups") body = dgroups;
      else if (p === "/api/roles" && r.request().method() === "GET" && u.searchParams.get("q")) body = { people: peopleHits };
      else if (p === "/api/roles") body = r.request().method() === "GET" ? Object.assign({}, roles, { scope: isAdm ? "all" : "staff" }) : { ok: true, entries: roles.entries };
      else if (p === "/api/me/session") body = { signedIn: true, user: me.profile.upn, idleSeconds: 1800, maxSeconds: 43200, startedAt: new Date().toISOString() };
      else if (p === "/api/crm/orders") body = ordersBody(acc);
      else if (p === "/api/crm/equip-orders") body = EQUIP_SYNCED ? { orders: EQUIP.map(o => Object.assign({}, o, acc.money === "none" ? { amount: null, received: null } : {})), status: { syncedAt: "2026-10-06T17:05:00Z", counts: { orders: EQUIP.length }, warnings: ["Customers: field \"CRM ID\" not found (crmId)"] }, access: acc } : { orders: [], status: { syncedAt: null, counts: null, warnings: [], configured: false }, access: acc };
      else if (p === "/api/crm/sync") { EQUIP_SYNCED = true; body = { ok: true, status: { syncedAt: new Date().toISOString(), counts: { orders: 2, items: 2, customers: 3, curriculums: 2, seminar: 1 }, warnings: ["Customers: field \"CRM ID\" not found (crmId)"] }, people: HUB.stats }; }
      else if (p === "/api/crm/people") { const canMerge = isAdm || acc.orders === "rw"; const famById = new Map((HUB.families || []).map(f => [f.id, f])); body = { people: hubMod.withMarks(HUB.people, MARKS).map(x => hubMod.maskPerson(x.familyId ? Object.assign({}, x, { family: famById.get(x.familyId) }) : x, acc)), queue: canMerge ? HUB.queue : [], stats: Object.assign({}, HUB.stats, hubMod.markStats(HUB.people, MARKS)), generatedAt: HUB.generatedAt, sources: HUB.sources, access: acc, canMerge, canMark: isAdm || acc.identity === "rw" }; }
      else if (p === "/api/crm/email-replace") { const b = JSON.parse(r.request().postData()); const person = HUB.people.find(x => x.crmId === b.crmId); const em = hubMod.replaceEmailOf(person); if (b.status) MARKS.marks[em] = { status: b.status, by: "om", at: new Date().toISOString() }; else delete MARKS.marks[em]; body = { ok: true, mark: b.status ? Object.assign({ email: em }, MARKS.marks[em]) : null, stats: hubMod.markStats(HUB.people, MARKS) }; }
      else if (p === "/api/crm/queue") { const b = JSON.parse(r.request().postData()); verdicts.push(b); HUB_SRC.decisions.pairs[b.key] = { verdict: b.verdict }; HUB = hubMod.build(Object.assign({}, HUB_SRC, { prev: HUB })); body = { ok: true, stats: HUB.stats, queue: HUB.queue }; }
      else if (p === "/api/crm/writeback") { const b = JSON.parse(r.request().postData() || "{}"); writebacks.push(b); const pairs = HUB.people.flatMap(x => x.writeBack.map(id => ({ crmId: x.crmId, name: x.name, recId: id }))); if (b.dryRun) body = { ok: true, dryRun: true, count: pairs.length, preview: pairs }; else { pairs.forEach(pr => { const c = HUB_SRC.equip.customers.find(c => c.recId === pr.recId); if (c) c.crmId = pr.crmId; }); HUB = hubMod.build(Object.assign({}, HUB_SRC, { prev: HUB })); body = { ok: true, written: pairs.length, already: 0, conflicts: [], missing: 0, stats: HUB.stats }; } }
      else if (p === "/api/crm/digest") { if (r.request().method() === "POST") { digests.push(1); body = { ok: true, sent: true, to: ["obadiah.sun@equipme.cloud"], status: 202, total: 3 }; } else body = { summary: { total: 3 }, to: ["obadiah.sun@equipme.cloud"], text: "x", subject: "s", last: null, configured: true, channel: true }; }
      else if (p === "/api/crm/institutions") { if (r.request().method() === "POST") { const b = JSON.parse(r.request().postData()); const k = b.key || b.domain; if (typeof b.internal === "boolean") { const id = ptMod.orgIdFor(ORGS, k, {}); ORGS.orgs[id].internal = b.internal; body = { ok: true, internal: b.internal, orgId: id }; } else { PARTNERS[k] = { stage: b.stage, note: b.note, owner: b.owner, type: b.type, region: b.region, by: "pd", at: new Date().toISOString() }; body = { ok: true, partner: PARTNERS[k] }; } } else { const canEdit = isAdm || acc.partners === "rw"; const seeMoney = acc.money !== "none"; const relsOf = key => { const oid = ORGS.byKey[key]; return Object.values(REL.items).filter(x => x.party && x.party.kind === "org" && (x.party.key === key || (oid && x.party.id === oid))).map(x => ({ id: x.id, type: x.type, stage: x.stage, closed: !!x.closed, owner: x.owner || "" })); }; body = { rows: HUB.institutions.map(i => { const key = i.key || i.domain; const oid = ORGS.byKey[key]; return { key, domain: i.domain || "", kind: i.kind || "tenant", abbr: i.abbr || "", type: i.type || "", country: i.country || "", city: i.city || "", website: i.website || "", courses: i.courses || 0, name: i.name || (i.domain === "kxc.edu" ? "Kids X Center" : ""), nameEn: i.nameEn || "", partner: PARTNERS[key] || null, orgId: oid || null, internal: !!(oid && ORGS.orgs[oid].internal), rels: relsOf(key), accounts: i.accounts, active: i.active, people: i.people, customers: i.customers, buyers: i.buyers, leads: i.leads, families: i.families, orders: i.orders, hiveOrders: i.hiveOrders, spend: seeMoney ? i.spend : null, fyOrders: i.orders, fySales: seeMoney ? i.spend : null }; }), fy: 2026, canEdit, stages: ["contact", "trial", "partner", "paused"], types: ptMod.TYPES, stageLabels: Object.fromEntries(Object.entries(ptMod.STAGES).map(([t, st]) => [t, Object.fromEntries(st.map(x => [x.k, [x.zh, x.en]]))])), generatedAt: HUB.generatedAt, access: acc }; } }
      else if (p === "/api/crm/partners-seed") { const res = ptMod.seed({ institutions: HUB.institutions, people: HUB.people, publishers: [{ recId: "recPub1", name: "IEW" }], teachers: [], domainAdmins: { "xqzw.edu": ["enqi.bao@xqzw.edu"] }, oldPartners: PARTNERS }, { rels: REL, orgs: ORGS }, { exclude: ptMod.DEFAULT_EXCLUDE }, me.profile.upn, Date.now()); seeds.push(res); body = { ok: true, created: res.created, excluded: res.excluded, skipped: res.skipped.length, at: res.at }; }
      else if (p === "/api/crm/entry") { const b = JSON.parse(r.request().postData()); entries.push(b); body = { ok: true, orderId: "H-20261008-TEST", orderRec: "recNEWO", customerRec: b.customer.recId || "recNEWC", newCustomer: !!b.customer.new, lines: b.items.length, status: {} }; }
      else if (p === "/api/crm/received") { const b = JSON.parse(r.request().postData()); received.push(b); body = { ok: true }; }
      else if (p === "/api/crm/feed") body = { feed: [{ at: "2026-10-08T01:00:00Z", action: "crm.entry.order", by: "obadiah.sun@equipme.cloud", orderId: "H-20261008-AB12", newCustomer: true }, { at: "2026-10-07T20:00:00Z", action: "crm.order.status", by: "obadiah.sun@equipme.cloud", orderId: "FC-20261002-KXC-002", from: "submitted", to: "confirmed" }, { at: "2026-10-07T17:05:00Z", action: "crm.equip.sync", actor: "scheduler", counts: { orders: 520 } }], access: acc };
      else if (p === "/api/crm/licenses") { const canEdit = isAdm || acc.drm === "rw"; const regionOf = d => (PARTNERS[d] && PARTNERS[d].region) || "other"; if (r.request().method() === "POST") { if (!canEdit) { status = 403; body = { error: "no_access" }; } else { const b = JSON.parse(r.request().postData()); try { const res = b.op === "pool" ? licMod.createPool(LIC, b, "om") : b.op === "allocate" ? licMod.allocate(LIC, b, "om") : licMod.revoke(LIC, b.id, "om"); body = { ok: true, result: res, view: licMod.view(LIC, { regionOf }) }; } catch (e) { status = 400; body = { error: e.code, message: e.message, balance: e.balance }; } } } else if (u.searchParams.get("person")) body = { allocations: LIC.allocations.filter(a => a.to.type === "person" && a.to.crmId === u.searchParams.get("person")).map(a => Object.assign({}, a, { pool: LIC.pools.find(p => p.id === a.poolId) })) }; else body = Object.assign(licMod.view(LIC, { regionOf }), { canEdit, regions: licMod.REGIONS, instTypes: licMod.INST_TYPES, access: acc }); }
      else if (p === "/api/crm/catalogue") body = { skus: [{ sku: "IEW-SSS1A-FP", nameZh: "IEW 结构和风格 1A - 全套", nameEn: "IEW SSS 1-A", publisher: "IEW", category: "Curriculum", available: true, price: 648, lastSale: "2026-10-01", unitsEver: 2 }, { sku: "CEFF-CSB", nameZh: "儿童圣经故事", nameEn: "The Child's Story Bible", publisher: "CEFF", category: "Curriculum", available: true, lastSale: "2026-09-12", unitsEver: 53 }, { sku: "OLD-1", nameZh: "旧教材", nameEn: "Old title", publisher: "CAP", category: "Curriculum", available: true, lastSale: "2024-03-01", unitsEver: 4 }, { sku: "OLD-2", nameZh: "从未卖出", nameEn: "Never sold", publisher: "CAP", category: "Pre-recorded", available: true, lastSale: null, unitsEver: 0 }, { sku: "GONE", nameZh: "下架", nameEn: "Withdrawn", publisher: "CAP", category: "Curriculum", available: false, lastSale: null, unitsEver: 0 }], syncedAt: "2026-10-06T17:05:00Z" };
      else if (p === "/api/crm/royalty") { if (r.request().method() === "POST") { const b = JSON.parse(r.request().postData()); const key = (b.key || b.publisher) + "|" + b.quarter; if (b.paid) ROY_PAID[key] = { by: "fin", at: new Date().toISOString(), amount: b.amount }; else delete ROY_PAID[key]; body = { ok: true, key, mark: ROY_PAID[key] || null }; } else { const canPay = acc.money === "rw"; if (!canPay && !rolesList.includes("staff:ceo")) { status = 403; body = { error: "no_access" }; } else body = Object.assign(royaltyMod.build({ syncedAt: "2026-10-06T17:05:00Z", curriculums: [{ sku: "IEW-SSS1A-FP", publisher: "IEW", royaltyRate: 0.15, royaltyRecipient: "IEW Inc." }, { sku: "CEFF-CSB", publisher: "CEFF", royaltyRate: 0 }], orders: EQUIP }, { quarters: 4 }), { paid: ROY_PAID, canPay }); } }
      else if (p === "/api/crm/people-rebuild") { rebuilds++; HUB = hubMod.build(Object.assign({}, HUB_SRC, { prev: HUB })); body = { ok: true, stats: HUB.stats, generatedAt: HUB.generatedAt }; }
      else if (p === "/api/crm/import") { const b = JSON.parse(r.request().postData()); imported.push(b); body = { ok: true, dryRun: !!b.dryRun, messages: b.messages.length, parsed: 2, created: ["FC-20260831-KXC-001", "FC-20260901-WHA-002"], existing: [], skipped: [{ id: "x" }] }; }
      else if (p === "/api/crm/import-teams") { const b = JSON.parse(r.request().postData() || "{}"); teamsCalls.push(b); if (!TEAMS_OK) { status = 403; body = { error: "teams_forbidden", team: "Hive Orders", channel: "CEFF" }; } else body = { ok: true, dryRun: !!b.dryRun, team: "Hive Orders", channels: ["General", "CEFF"], messages: 12, parsed: 5, created: ["FC-20260929-CAP-001"], existing: [], skipped: [] }; }
      else if (p === "/api/domain/groupnames-fill") { fillCalls.push(JSON.parse(r.request().postData())); body = { ok: true, filled: [{ id: "g2", zh: "五年级数学", en: "Math Grade 5" }] }; }
      else if (p === "/api/domain/groupname") { groupNamed.push(JSON.parse(r.request().postData())); body = { ok: true }; }
      else if (p === "/api/crm/order" && r.request().method() === "GET") { const o = ORDERS.find(x => x.orderId === u.searchParams.get("id")); body = { order: Object.assign(crm.mask(o, acc), { overdue: crm.overdue(o) }), next: acc.orders === "rw" ? crm.nextStatuses(o.status, rolesList) : [] }; }
      else if (p === "/api/crm/order" && r.request().method() === "PATCH") { const b = JSON.parse(r.request().postData()); patched.push(b); const i = ORDERS.findIndex(x => x.orderId === b.orderId); ORDERS[i] = crm.transition(ORDERS[i], b.status, me.profile.upn, b.note, rolesList); body = { ok: true, order: Object.assign(crm.mask(ORDERS[i], acc), { overdue: crm.overdue(ORDERS[i]) }), next: crm.nextStatuses(ORDERS[i].status, rolesList) }; }
      else if (p === "/api/crm/partners") { const type = u.searchParams.get("type") || "it"; const canEdit = isAdm || acc.partners === "rw"; const seeC = isAdm || acc.money === "rw" || rolesList.includes("staff:ceo") || rolesList.includes("staff:partnership"); if (type === "funder" && !seeC) { status = 403; body = { error: "no_access" }; } else { const projects = Object.values(PRJ.items); const rows = ptMod.listByType(REL, type, {}, Date.now(), u.searchParams.get("all") === "1").map(x => ptRow(x, projects)); const counts = {}; for (const t of ptMod.visibleTypes({ seeConfidential: seeC })) counts[t] = Object.values(REL.items).filter(x => x.type === t && !x.closed).length; body = { type, rows, summary: ptMod.summary(rows, Date.now()), stages: ptMod.STAGES[type], kinds: ptMod.PROJECT_KINDS[type], contactRoles: ptMod.CONTACT_ROLES[type], regions: ptMod.REGION_LABELS, types: ptMod.TYPES, counts, canEdit, access: acc }; } }
      else if (p === "/api/crm/partner" && r.request().method() === "GET") { const rel = REL.items[u.searchParams.get("id")]; if (!rel) { status = 404; body = { error: "not_found" }; } else { const projects = Object.values(PRJ.items).filter(x => x.relationship === rel.id); body = { relationship: ptRow(Object.assign({}, rel, { health: ptMod.health(rel, Date.now(), {}) }), projects), projects, stages: ptMod.STAGES[rel.type], kinds: ptMod.PROJECT_KINDS[rel.type], contactRoles: ptMod.CONTACT_ROLES[rel.type], canEdit: isAdm || acc.partners === "rw", access: acc }; } }
      else if (p === "/api/crm/partner") { const b = JSON.parse(r.request().postData()); ptPosts.push(b); if (b.op === "create") { let party = null; if (b.party && b.party.key) { const i = ptOrgIdx().get(b.party.key); ptMod.orgIdFor(ORGS, b.party.key, { name: i ? i.name : b.party.name }); party = { id: ORGS.byKey[b.party.key], key: b.party.key, name: i ? i.name : b.party.name }; } else if (b.party && b.party.id) { const pe = HUB.people.find(x => x.crmId === b.party.id); party = pe ? { id: pe.crmId, name: pe.name } : null; } try { const id = ptMod.pad(REL.next++); REL.items[id] = ptMod.newRelationship(Object.assign({}, b, { party }), me.profile.upn, id); body = { ok: true, relationship: REL.items[id] }; } catch (e) { status = 400; body = { error: e.code || "bad" }; } }
        else { const rel = REL.items[b.id]; const now = new Date().toISOString(); if (!rel) { status = 404; body = { error: "not_found" }; } else if (b.op === "move") { const chk = ptMod.moveCheck(rel, b.to, b, Object.values(PRJ.items)); if (!chk.ok) { status = 409; body = { error: chk.error, problems: chk.problems }; } else { if (b.contacts) rel.contacts = ptMod.cleanContacts(b.contacts); if (chk.stage.handover && b.owner) rel.owner = b.owner; rel.log.push(ptMod.logEntry(me.profile.upn, "stage", b.reason || "", { from: rel.stage, to: b.to, back: chk.backward || undefined })); rel.stage = b.to; rel.stageAt = now; rel.stageBy = me.profile.upn; if (chk.stage.closed) rel.closed = { at: now, reason: b.reason, by: me.profile.upn }; const nx = ptMod.cleanNext(b.next); if (nx) rel.next = nx; body = { ok: true, relationship: rel }; } }
        else if (b.op === "update") { const f = b.fields || {}; if (f.region) rel.region = f.region; if (f.currency) rel.currency = f.currency; if (f.lang) rel.lang = f.lang; if (typeof f.owner === "string") rel.owner = f.owner; if ("next" in f) rel.next = ptMod.cleanNext(f.next); if ("agreement" in f) rel.agreement = ptMod.cleanAgreement(f.agreement); if ("terms" in f) rel.terms = ptMod.cleanTerms(f.terms); if ("contacts" in f) { rel.contacts = ptMod.cleanContacts(f.contacts); rel.log.push(ptMod.logEntry(me.profile.upn, "contacts", rel.contacts.map(c => c.name).join(", "))); } body = { ok: true, relationship: rel }; }
        else if (b.op === "note") { rel.log.push(ptMod.logEntry(me.profile.upn, "note", b.text, { via: b.via })); body = { ok: true, relationship: rel }; }
        else if (b.op === "close") { rel.closed = { at: now, reason: b.reason, by: me.profile.upn, stage: rel.stage }; rel.log.push(ptMod.logEntry(me.profile.upn, "closed", b.note || "", { reason: b.reason })); body = { ok: true, relationship: rel }; }
        else if (b.op === "reopen") { rel.stage = rel.closed.stage || rel.stage; rel.closed = null; rel.stageAt = now; body = { ok: true, relationship: rel }; }
        else { status = 400; body = { error: "bad_op" }; } } }
      else if (p === "/api/crm/project") { const b = JSON.parse(r.request().postData()); ptPosts.push(b); if (b.op === "create") { const rel = REL.items[b.relationship]; const id = ptMod.padP(PRJ.next++); PRJ.items[id] = ptMod.newProject(rel, b, me.profile.upn, id); rel.log.push(ptMod.logEntry(me.profile.upn, "project", PRJ.items[id].name, { project: id })); body = { ok: true, project: PRJ.items[id] }; }
        else { const pj = PRJ.items[b.id]; if (!pj) { status = 404; body = { error: "not_found" }; } else { if (b.op === "status") { if (b.status === "completed" && pj.milestones.some(m => m.kind === "gate" && !m.doneAt)) { status = 409; body = { error: "gates_open" }; } else { pj.log.push(ptMod.logEntry(me.profile.upn, "status", "", { from: pj.status, to: b.status })); pj.status = b.status; body = { ok: true, project: pj }; } } else if (b.op === "milestone") { const m = pj.milestones.find(x => x.id === b.mid); if ("done" in b) m.doneAt = b.done ? new Date().toISOString().slice(0, 10) : ""; if ("due" in b) m.due = b.due; body = { ok: true, project: pj }; } else if (b.op === "addMilestone") { pj.milestones.push({ id: "m" + (pj.milestones.length + 1), name: b.name, nameEn: b.name, kind: "deliverable", due: b.due || "", doneAt: "", owner: "", note: "" }); body = { ok: true, project: pj }; } else if (b.op === "removeMilestone") { pj.milestones = pj.milestones.filter(x => x.id !== b.mid); body = { ok: true, project: pj }; } else if (b.op === "update") { Object.assign(pj, b.fields.participants ? { participants: ptMod.cleanContacts(b.fields.participants) } : {}, b.fields.name ? { name: b.fields.name } : {}); body = { ok: true, project: pj }; } else if (b.op === "note") { pj.log.push(ptMod.logEntry(me.profile.upn, "note", b.text)); body = { ok: true, project: pj }; } else { status = 400; body = { error: "bad_op" }; } } } }
      else if (p === "/api/crm/people-search") { const q = (u.searchParams.get("q") || "").toLowerCase(); body = { people: HUB.people.filter(x => [x.name, x.crmId].concat(x.keys).some(k => String(k || "").toLowerCase().includes(q))).slice(0, 12).map(x => ({ crmId: x.crmId, name: x.name, email: x.primaryEmail, upn: (x.facets.accounts[0] || {}).upn || "", identity: (x.facets.accounts[0] || {}).identity || (x.sources.contact ? "外部" : ""), org: (x.facets.accounts[0] || {}).domain || "", stage: x.stage })) }; }
      else if (p === "/api/crm/org-search") { const q = (u.searchParams.get("q") || "").toLowerCase(); body = { orgs: HUB.institutions.filter(i => !q || [i.key, i.domain, i.name, i.nameEn, i.abbr].some(k => String(k || "").toLowerCase().includes(q))).slice(0, 15).map(i => ({ key: i.key || i.domain, name: i.name || i.nameEn || i.key, nameEn: i.nameEn || "", domain: i.domain || "", kind: i.kind, type: i.type || "", region: i.region || "", country: i.country || "", orgId: ORGS.byKey[i.key || i.domain] || null })) }; }
      else if (p === "/api/crm/contact") { const b = JSON.parse(r.request().postData()); CONTACTS.push(b); const email = String(b.email || "").toLowerCase(); let pe = HUB.people.find(x => x.keys.includes(email)); if (!pe) { const id = "HC-" + String(HUB.nextId++).padStart(6, "0"); pe = { crmId: id, name: b.name, keys: [email], emails: [{ email, tier: "safe", upn: false }], primaryEmail: email, primaryTier: "safe", stage: "lead", orders: 0, spend: 0, hiveOrders: 0, hiveTotal: 0, sources: { contact: true }, facets: { customers: [], accounts: [], leads: [], hive: [], contacts: [{ email, name: b.name, org: b.org }] }, writeBack: [] }; HUB.people.push(pe); body = { ok: true, person: { crmId: id, existing: false, name: b.name, email } }; } else body = { ok: true, person: { crmId: pe.crmId, existing: true, name: pe.name, email } }; }
      else if (p === "/api/me/photo") return r.fulfill({ status: 204, body: "" });
      else if (p === "/api/data") body = { generatedAt: new Date().toISOString(), counts: { products: 12, posts: 8 } };
      else status = 404;
      r.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    });
    await page.route("**/.auth/me", r => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ clientPrincipal: { identityProvider: "aad", userId: "x", userDetails: me.profile.upn, userRoles: ["anonymous", "authenticated"].concat(isAdm ? ["admin"] : []) } }) }));
    if (lang) await page.addInitScript(l => localStorage.setItem("fc-lang", l), lang);
    await page.goto(`http://127.0.0.1:${port}/management/${hash}`); await page.waitForTimeout(700);
    try { if (act) await act(page); } catch (e) { errs.push(name + ": " + e.message); }
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
    const ov = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    if (ov) errs.push(name + ": horizontal overflow");
    await ctx.close();
  }
  const SALES = ["staff:sales"];
  await shot("orders-zh", 1280, 900, "#/ops/orders/hive", "zh", SALES, async p => {
    const nav = await p.$eval("#nav", e => e.innerText); if (!/经营[\s\S]*订单/.test(nav)) throw new Error("no 经营›订单 nav: " + nav);
    if (/系统/.test(nav)) throw new Error("order manager sees System group");
    const rows = await p.$$("#otable tbody tr[data-id]"); if (rows.length !== 8) throw new Error("rows " + rows.length);
    const kpi = await p.$eval("#okpi", e => e.innerText); if (!/本月成交额/.test(kpi)) throw new Error("order manager should see money KPI");
    const over = await p.$eval('#obar [data-cnt="overdue"]', e => e.textContent); if (over !== "(2)") throw new Error("overdue count " + over);
    const nf = await p.$eval('#obar [data-cnt="notifyFailed"]', e => e.textContent); if (nf !== "(2)") throw new Error("notifyFailed count " + nf);
    await p.click('#obar .chip[data-f="overdue"]'); await p.waitForTimeout(200);
    const r2 = await p.$$("#otable tbody tr[data-id]"); if (r2.length !== 2) throw new Error("overdue rows " + r2.length);
    await p.click('#obar .chip[data-f="all"]'); await p.waitForTimeout(200);
    await p.click('#otable tbody tr[data-id="FC-20261002-KXC-002"]'); await p.waitForTimeout(500);
    const pb = await p.$eval("#panel .pb", e => e.innerText);
    if (!/七年级数学/.test(pb) || !/执行记录/.test(pb) || !/确认接单/.test(pb) || !/取消订单/.test(pb)) throw new Error("panel: " + pb.slice(0, 200));
    if (!/¥2,100/.test(pb)) throw new Error("no total in panel: " + pb);
    await p.fill("#oNote", "提供方已接单"); await p.click('#panel button[data-to="confirmed"]'); await p.waitForTimeout(600);
    if (!patched.length || patched[0].status !== "confirmed" || patched[0].note !== "提供方已接单") throw new Error("patch not sent: " + JSON.stringify(patched));
    const pb2 = await p.$eval("#panel .pb", e => e.innerText);
    if (!/标记已付款/.test(pb2) || !/提供方已接单/.test(pb2)) throw new Error("panel after confirm: " + pb2.slice(0, 300));
    const row = await p.$eval('#otable tbody tr[data-id="FC-20261002-KXC-002"]', e => e.innerText); if (!/已确认/.test(row)) throw new Error("row not updated: " + row);
  });
  await shot("orders-en-finance", 1280, 900, "#/ops/orders/hive", "en", ["staff:finance"], async p => {
    const title = await p.$eval("#title", e => e.innerText); if (!/Orders/.test(title)) throw new Error("title " + title);
    const cell = await p.$eval('#otable tbody tr[data-id="FC-20261001-KXC-001"]', e => e.innerText);
    if (!/…@gmail\.com/.test(cell)) throw new Error("finance should see a masked email: " + cell);
    if (!/¥2,100/.test(cell)) throw new Error("finance should see amounts: " + cell);
    await p.click('#otable tbody tr[data-id="FC-20261001-KXC-001"]'); await p.waitForTimeout(500);
    const pb = await p.$eval("#panel .pb", e => e.innerText);
    if (/Confirm|Cancel order/.test(pb)) throw new Error("finance must not get status buttons");
    if (!/Fulfilment record/i.test(pb) || !/Grade 7 Mathematics/.test(pb)) throw new Error("panel en: " + pb.slice(0, 200));
  });
  await shot("orders-curriculum", 1280, 900, "#/ops/orders/hive", "zh", ["staff:curriculum"], async p => {
    const kpi = await p.$eval("#okpi", e => e.innerText); if (/本月成交额/.test(kpi)) throw new Error("curriculum director must not see money KPI");
    const cell = await p.$eval('#otable tbody tr[data-id="FC-20261001-KXC-001"]', e => e.innerText); if (!/不可见/.test(cell)) throw new Error("amount should be hidden: " + cell);
  });
  await shot("orders-none", 1280, 900, "#/ops/orders/hive", "zh", ["domain_it:bes.qiaoliang.online"], async p => {
    await p.waitForTimeout(300);
    const h = await p.evaluate(() => location.hash); if (/^#\/ops\/orders/.test(h)) throw new Error("domain admin reached the orders page");
    const nav = await p.$eval("#nav", e => e.innerText); if (/订单/.test(nav)) throw new Error("domain admin sees 订单 in nav");
  });
  await shot("roles-ceo", 1280, 900, "#/system/roles", "en", ["staff:ceo"], async p => {
    const nav = await p.$eval("#nav", e => e.innerText); if (!/Roles/.test(nav)) throw new Error("CEO has no Roles nav: " + nav);
    if (/Data sync/.test(nav)) throw new Error("CEO sees Data sync");
    await p.click('#rtable tr[data-user="mei.wang@bes.qiaoliang.online"]'); await p.waitForTimeout(400);
    const pb = await p.$eval("#panel .pb", e => e.innerText);
    if (/School roles|System administrator\n/.test(pb)) throw new Error("CEO sees school roles / sysadmin switch: " + pb.slice(0, 300));
    if (!/Education consultant/.test(pb) || !/Order manager/.test(pb) || !/Partnership director/.test(pb)) throw new Error("staff chips: " + pb.slice(0, 400));
    if (/Fundraising/.test(pb)) throw new Error("legacy fundraising offered");
    const pressed = await p.$$eval('#rstaff .chip[aria-pressed="true"]', es => es.map(e => e.getAttribute("data-staff"))); if (pressed.join() !== "community") throw new Error("pressed: " + pressed);
    await p.click('#rstaff .chip[data-staff="sales"]'); await p.waitForTimeout(100);
    const prev = await p.$eval("#rprev", e => e.innerText); if (!/Order manager/.test(prev) || !/Education community manager/.test(prev) || !/Domain Hive administrator/.test(prev)) throw new Error("preview: " + prev);
  });
  await shot("users-identity-en", 1280, 900, "#/domain/users", "en", ["admin", "staff:sysadmin"], async p => {
    await p.waitForTimeout(500);
    const tbl = await p.$eval("#utable", e => e.innerText); if (/家长|学生|老师|行政/.test(tbl)) throw new Error("identity column not translated: " + tbl.slice(0, 200));
    await p.click('#utable tbody tr[data-upn]'); await p.waitForTimeout(500);
    const opts = await p.$$eval("#pid option", es => es.map(e => e.textContent)); if (opts.some(o => /家长|学生|老师|行政/.test(o))) throw new Error("identity options not translated: " + opts);
    if (!opts.some(o => /Parent/.test(o)) || !opts.some(o => /Education consultant/.test(o))) throw new Error("identity options: " + opts);
  });
  await shot("orders-tabs-equip", 1280, 900, "#/ops/orders", "zh", ["admin", "staff:sysadmin"], async p => {
    await p.waitForTimeout(400);
    const tabs = await p.$$eval(".pagetabs .ptab", es => es.map(e => [e.textContent.trim().slice(0, 4), e.classList.contains("on")]));
    if (tabs.length !== 2 || !tabs[0][1] || tabs[1][1] || !/Equi/.test(tabs[0][0])) throw new Error("tabs (Equip first and active): " + JSON.stringify(tabs));
    if (await p.$("#otable") || await p.$("#etable")) throw new Error("an order table on the textbook tab");
    const empty = await p.$eval("#evgrid", e => e.innerText); if (!/AIRTABLE_EQUIP_PAT/.test(empty)) throw new Error("empty state: " + empty.slice(0, 100));
    const open = await p.$eval("#eOpen", e => [e.getAttribute("href"), e.getAttribute("target")]); if (open[0] !== "https://airtable.com/appae5kpY1qXn6XLq" || open[1] !== "_blank") throw new Error("Airtable link: " + open);
    await p.click("#eSync"); await p.waitForTimeout(800);
    const k = await p.$eval("#ekpi", e => e.innerText); if (!/本月销售额\n¥1,296/.test(k) || !/本月订单\n1/.test(k) || !/学年/.test(k) || !/本学年购买客户\n2/.test(k)) throw new Error("equip KPIs: " + k);
    const cards = await p.$$("#evgrid .card.viz"); if (cards.length !== 8) throw new Error("chart cards " + cards.length);
    const svgs = await p.$$("#evgrid svg.viz-svg"); if (svgs.length !== 8) throw new Error("charts drawn " + svgs.length);
    const pub = await p.$eval("#vPub", e => e.innerText); if (!/IEW/.test(pub) || !/CEFF/.test(pub)) throw new Error("publisher chart: " + pub.slice(0, 200));
    await p.click('#vPub .vtoggle button[data-v="table"]'); await p.waitForTimeout(100);
    if (!(await p.$eval("#vPub .vbody", e => e.classList.contains("hidden"))) || await p.$eval("#vPub .vtable", e => e.classList.contains("hidden"))) throw new Error("table toggle");
    const tbl = await p.$eval("#vPub .vtable", e => e.innerText); if (!/IEW\s+¥1,296/.test(tbl)) throw new Error("publisher table: " + tbl);
    const tw = await p.evaluate(() => { const t = document.querySelector("#vPub table.vt"), c = document.querySelector("#vPub .vtable"); return [t.offsetWidth, c.clientWidth, t.getAttribute("data-rz")]; }); if (tw[0] > tw[1] || tw[2]) throw new Error("chart table overflows or got the resize handles: " + tw);
    // Month picker: the tiles follow the chosen month.
    const opts = await p.$$eval("#emonth option", es => es.map(e => e.value)); if (opts[0] !== new Date().toISOString().slice(0, 7) || opts.indexOf("2026-09") < 0) throw new Error("month options: " + opts);
    await p.selectOption("#emonth", "2026-09"); await p.waitForTimeout(300);
    const k9 = await p.$eval("#ekpi", e => e.innerText); if (!/2026-09销售额\n¥3,074/.test(k9) || !/2026-09订单\n1/.test(k9)) throw new Error("tiles for 2026-09: " + k9);
    if (!/截至 2026-09/.test(await p.$eval("#vTrend .ch", e => e.innerText))) throw new Error("trend subtitle should name the month");
    await p.selectOption("#emonth", opts[0]); await p.waitForTimeout(300);
    await p.hover("#vTrend svg.viz-svg g.hit:last-of-type rect"); await p.waitForTimeout(150);
    const tp = await p.$eval(".viztip", e => e.hidden ? "" : e.innerText); if (!/¥1,296/.test(tp) || !/销售额/.test(tp)) throw new Error("tooltip: " + tp);
    const fl = await p.$eval("#flash", e => e.innerText); if (!/同步完成/.test(fl) || !/人员库 \d+ 人/.test(fl)) throw new Error("sync notice: " + fl);
    const foot = await p.$eval("#efoot", e => e.innerText); if (!/同步提示 1 条/.test(foot)) throw new Error("footer: " + foot);
    await p.click("#nav a[href='#/ops/orders']"); await p.waitForTimeout(500);
    if (!(await p.$("#ekpi"))) throw new Error("the orders page opens on the Equip tab (Rick, 2026-10-08)");
    await p.click(".pagetabs a[href='#/ops/orders/hive']"); await p.waitForTimeout(500);
    if (!(await p.$("#otable"))) throw new Error("course tab did not open");
    if (!(await p.$eval("#flash", e => e.hidden))) throw new Error("sync notice survived the page change");
    const title = await p.$eval("#title", e => e.innerText); if (!/蜂巢课程订单/.test(title)) throw new Error("title " + title);
  });
  await shot("orders-equip-tall", 1280, 1700, "#/ops/orders", "zh", ["admin", "staff:sysadmin"], async p => { await p.waitForTimeout(500); });
  await shot("orders-equip-card", 1280, 900, "#/ops/orders", "zh", ["admin", "staff:sysadmin"], async p => { await p.waitForTimeout(400); });
  await shot("people-queue", 1280, 900, "#/ops/people", "zh", SALES, async p => { await p.waitForTimeout(400); await p.click('#pbar .chip[data-f="queue"]'); await p.waitForTimeout(300); });
  // 人员库: the order manager sees everyone, answers a merge suggestion, and the queue empties.
  await shot("people-hub", 1280, 900, "#/ops/people", "zh", SALES, async p => {
    await p.waitForTimeout(500);
    const nav = await p.$eval("#nav", e => e.innerText); if (!/人员库/.test(nav)) throw new Error("no 人员库 nav: " + nav);
    const rows = await p.$$("#ptable tbody tr[data-id]"); if (rows.length !== HUB.stats.people) throw new Error("people rows " + rows.length + " vs " + HUB.stats.people);
    const mei = HUB.people.find(x => x.name === "Mei Wang");
    const r0 = await p.$eval('#ptable tbody tr[data-id="' + mei.crmId + '"]', e => e.innerText);
    if (!/mama@equipme\.cloud/.test(r0) || !/Teams/.test(r0) || !/活跃/.test(r0) || !/¥1,296/.test(r0) || !(await p.$('#ptable tbody tr[data-id="' + mei.crmId + '"] .dot.warn'))) throw new Error("Mei row: " + r0);
    const tw = await p.evaluate(() => [document.getElementById("ptable").offsetWidth, document.getElementById("content").clientWidth]); if (tw[0] > tw[1]) throw new Error("people table wider than the pane: " + tw);
    const chips = await p.$eval("#pbar", e => e.innerText); if (!/待替换邮箱/.test(chips) || !/待合并 \(1\)/.test(chips)) throw new Error("chips: " + chips);
    const kp = await p.$eval("#pkpi", e => e.innerText); if (!/活跃/.test(kp) || !/Equip/.test(kp) || !/待合并\s*1/.test(kp)) throw new Error("people tiles: " + kp);
    if ((await p.$$("#pkpi .sharebar")).length !== 3) throw new Error("share bars");
    await p.click('#ptable tbody tr[data-id="' + mei.crmId + '"]'); await p.waitForTimeout(300);
    const pb = await p.$eval("#panel .pb", e => e.innerText);
    if (!/mama@qq\.com/.test(pb) || !/待替换/.test(pb) || !/Teams 账号 · 1/i.test(pb) || !/Equip 客户 · 1/i.test(pb) || !/讲座名单/.test(pb) || !/首单 2026-10-01/.test(pb)) throw new Error("person panel: " + pb.slice(0, 400));
    await p.click("#panel .x");
    // 订单 / 消费 is a link: the panel opens at the textbook orders, each with its items, and one opens beside it.
    await p.click('#ptable tbody tr[data-id="' + mei.crmId + '"] button[data-orders]'); await p.waitForTimeout(700);
    const po = await p.$eval("#pEquipOrders", e => e.innerText); if (!/Manual order 35/.test(po) || !/IEW 结构和风格 1A/.test(po) || !/2 件/.test(po)) throw new Error("person's equip orders: " + po);
    await p.click('#pEquipOrders button[data-eorder="recO1"]'); await p.waitForTimeout(400);
    if (!(await p.$eval("#panel2", e => e.classList.contains("open")))) throw new Error("order panel did not open beside the person");
    const p2 = await p.$eval("#panel2 .pb", e => e.innerText); if (!/购买的教材 · 1/i.test(p2) || !/2 × ¥648/.test(p2) || !/Royalty Rate 15%/.test(p2)) throw new Error("equip order panel: " + p2.slice(0, 300));
    await p.screenshot({ path: `${OUT}/people-order-panels.png` });
    await p.click("#panel2 .x"); await p.click("#panel .x");
    await p.fill("#pq", "lead@"); await p.waitForTimeout(300);
    const found = await p.$$eval("#ptable tbody tr[data-id]", es => es.map(e => e.innerText)); if (found.length !== 1 || !/Lead One/.test(found[0]) || !/蜂巢/.test(found[0])) throw new Error("search: " + found);
    const ft = await p.$eval("#pfoot", e => e.innerText); if (!/显示 1 \/ \d+ 人/.test(ft) || !/筛选：搜索 “lead@”/.test(ft) || !/显示全部/.test(ft)) throw new Error("footer with a search: " + ft);
    await p.click("#pClear"); await p.waitForTimeout(300);
    if ((await p.$eval("#pq", e => e.value)) !== "" || /筛选/.test(await p.$eval("#pfoot", e => e.innerText))) throw new Error("clear did not reset the search");
    // 待替换邮箱: Wang Wu on old@163.com — mark contacted, then replaced; the sub-chips and the todo count follow.
    await p.click('#pbar .chip[data-f="replace"]'); await p.waitForTimeout(300);
    const sub = await p.$eval("#pmarks", e => e.innerText); if (!/未通知 \(1\)/.test(sub) || !/本月已替换 0/.test(sub)) throw new Error("mark chips: " + sub);
    const wang = HUB.people.find(x => x.name === "Wang Wu");
    await p.click('#ptable tbody tr[data-id="' + wang.crmId + '"]'); await p.waitForTimeout(400);
    const rs = await p.$eval("#panel .pb", e => e.innerText); if (!/邮箱替换/i.test(rs) || !/未通知/.test(rs) || !/还没有 Teams 账号/.test(rs)) throw new Error("replace section: " + rs.slice(0, 300));
    await p.click("#panel .pb summary"); const tpl = await p.$eval("#panel .msgtpl textarea", e => e.value); if (!/old@163\.com/.test(tpl) || !/Wang Wu/.test(tpl)) throw new Error("message: " + tpl);
    await p.click('#panel button[data-mark="notified"]'); await p.waitForTimeout(500);
    if (!/已通知/.test(await p.$eval("#panel .pb", e => e.innerText))) throw new Error("not marked contacted");
    await p.click('#panel button[data-mark="replaced"]'); await p.waitForTimeout(500);
    if (!/已替换 \(1\)/.test(await p.$eval("#pmarks", e => e.innerText)) || !/本月已替换 1/.test(await p.$eval("#pmarks", e => e.innerText))) throw new Error("chips after replace: " + await p.$eval("#pmarks", e => e.innerText));
    await p.click("#panel .x"); await p.click('#pbar .chip[data-f="all"]'); await p.waitForTimeout(300);
    await p.click('#pbar .chip[data-f="queue"]'); await p.waitForTimeout(300);
    const qc = await p.$eval("#pbody", e => e.innerText); if (!/Zhang San/.test(qc) || !/zhang\.san@kxc\.edu/.test(qc) || !/是同一个人/.test(qc)) throw new Error("queue: " + qc.slice(0, 300));
    await p.click('#pbody button[data-verdict="same"]'); await p.waitForTimeout(600);
    if (verdicts.length !== 1 || verdicts[0].verdict !== "same" || !/^customer:recC2\|/.test(verdicts[0].key) && !/\|customer:recC2$/.test(verdicts[0].key)) throw new Error("verdict call: " + JSON.stringify(verdicts));
    const after = await p.$eval("#pbody", e => e.innerText); if (!/没有待合并/.test(after)) throw new Error("queue not emptied: " + after.slice(0, 200));
    await p.click('#pbar .chip[data-f="all"]'); await p.waitForTimeout(300);
    const z = HUB.people.find(x => x.facets.customers.some(c => c.recId === "recC2"));
    const zr = await p.$eval('#ptable tbody tr[data-id="' + z.crmId + '"]', e => e.innerText); if (!/zhang\.san@kxc\.edu/.test(zr)) throw new Error("merged account not on the row: " + zr);
    await p.click("#pRebuild"); await p.waitForTimeout(500); if (rebuilds !== 1) throw new Error("rebuild not called");
    // 回写 CRM ID: dry run, confirmation with the count, then the write; the pending tile drops to 0.
    const wbBefore = await p.$eval("#pkpi", e => e.innerText); if (!/待回写 CRM ID\s*4/.test(wbBefore)) throw new Error("pending tile before: " + wbBefore);
    let confirmText = ""; p.removeAllListeners("dialog"); p.on("dialog", d => { confirmText = d.message(); d.accept(); });
    await p.click("#pWriteback"); await p.waitForTimeout(800);
    if (writebacks.length !== 2 || writebacks[0].dryRun !== true || writebacks[1].dryRun) throw new Error("writeback calls: " + JSON.stringify(writebacks));
    if (!/把 4 个 CRM ID 写入/.test(confirmText) || !/只写空的/.test(confirmText)) throw new Error("confirmation: " + confirmText);
    const fl = await p.$eval("#flash", e => e.innerText); if (!/已回写 4 个 CRM ID/.test(fl)) throw new Error("writeback notice: " + fl);
    const wbAfter = await p.$eval("#pkpi", e => e.innerText); if (!/待回写 CRM ID\s*0/.test(wbAfter)) throw new Error("pending tile after: " + wbAfter);
    // Sorting by heading (Rick 2026-10-08): CRM ID ascending, again descending, 阶段 by stage order; the resize handle does not sort.
    const ids = async () => p.$$eval("#ptable tbody tr[data-id]", es => es.map(e => e.getAttribute("data-id")));
    await p.click('#ptable th[data-sort="crmId"]'); await p.waitForTimeout(200);
    let got = await ids(); if (JSON.stringify(got) !== JSON.stringify(got.slice().sort())) throw new Error("not ascending: " + got);
    if (!/ascending/.test(await p.$eval('#ptable th[data-sort="crmId"]', e => e.getAttribute("aria-sort")))) throw new Error("aria-sort");
    await p.click('#ptable th[data-sort="crmId"]'); await p.waitForTimeout(200);
    got = await ids(); if (JSON.stringify(got) !== JSON.stringify(got.slice().sort().reverse())) throw new Error("not descending: " + got);
    await p.click('#ptable th[data-sort="stage"]'); await p.waitForTimeout(200);
    const stages = await p.$$eval("#ptable tbody tr[data-id] td:last-child", es => es.map(e => e.innerText.trim()));
    if (stages[0] !== "潜在" || stages[stages.length - 1] !== "沉寂") throw new Error("stage order: " + stages);
    await p.click('#ptable th[data-sort="name"] .rz'); await p.waitForTimeout(200);
    if ((await p.$eval('#ptable th[data-sort="stage"]', e => e.getAttribute("aria-sort"))) === "none") throw new Error("the resize handle changed the sort");
    const divider = await p.$eval("#ptable tbody tr td:nth-child(2)", e => getComputedStyle(e).borderLeftWidth); if (divider === "0px") throw new Error("no divider between fields");
  });
  // Finance: amounts yes, people no — emails masked to the domain, no queue, no rebuild.
  await shot("people-finance", 1280, 800, "#/ops/people", "en", ["staff:finance"], async p => {
    await p.waitForTimeout(500);
    if (await p.$("#pRebuild")) throw new Error("finance must not rebuild");
    const mei = HUB.people.find(x => x.name === "Mei Wang");
    const r0 = await p.$eval('#ptable tbody tr[data-id="' + mei.crmId + '"]', e => e.innerText);
    if (!/…@equipme\.cloud/.test(r0) || /mama@/.test(r0) || !/¥1,296/.test(r0)) throw new Error("finance row: " + r0);
    const chips = await p.$eval("#pbar", e => e.innerText); if (/To merge \(/.test(chips)) throw new Error("finance sees the queue count: " + chips);
    if (await p.$('#pkpi [data-kf="queue"]')) throw new Error("finance sees the merge tile");
    await p.click('#ptable tbody tr[data-id="' + mei.crmId + '"]'); await p.waitForTimeout(300);
    const pb = await p.$eval("#panel .pb", e => e.innerText); if (/mama@/.test(pb) || !/…@equipme\.cloud/.test(pb) || !/Seminar list · 0/.test(pb) && /Seminar list/.test(pb)) throw new Error("finance panel: " + pb.slice(0, 300));
  });
  await shot("people-en-narrow", 1100, 800, "#/ops/people", "en", SALES, async p => {
    await p.waitForTimeout(500);
    const tw = await p.evaluate(() => [document.getElementById("ptable").offsetWidth, document.getElementById("content").clientWidth, document.getElementById("content").scrollWidth]); if (tw[0] > tw[1] || tw[2] > tw[1]) throw new Error("people table outgrows the pane in English: " + tw);
    const stage = await p.$eval("#ptable tbody tr:first-child td:last-child", e => e.innerText.trim()); if (!stage) throw new Error("stage cell empty");
  });
  await shot("people-phone", 390, 800, "#/ops/people", "zh", SALES, async p => { await p.waitForTimeout(300); });
  // The Teams import buttons are gone from the course orders page (Rick, 2026-10-08): no "从 Teams 读取订单", no "导入 Teams 导出…".
  await shot("orders-no-teams-import", 1280, 900, "#/ops/orders/hive", "zh", ["admin", "staff:sysadmin"], async p => {
    await p.waitForTimeout(400);
    if (await p.$("#oTeams") || await p.$("#oImport")) throw new Error("Teams import buttons should be gone");
  });
  await shot("groups-fill", 1280, 900, "#/domain/groups", "en", ["admin", "staff:sysadmin"], async p => {
    await p.waitForTimeout(800);
    const txt = await p.$eval("#content", e => e.innerText);
    if (!/\bHive\b/.test(txt) || /蜂巢/.test(txt.replace(/.*蜂巢.*Hive\/蜂巢.*/g, ""))) { /* slash name shows the English side */ }
    const names = await p.$$eval("#gtree .tname", es => es.map(e => e.firstChild && e.firstChild.textContent.trim()));
    if (!names.some(n => n === "Hive · 蜂巢")) throw new Error("slash name not shown bilingually: " + names.join(" | "));
    if (await p.$("#gFill")) throw new Error("the auto-fill button should be gone");
  });
  await shot("orders-equip-finance", 1280, 700, "#/ops/orders", "en", ["staff:curriculum"], async p => {
    await p.waitForTimeout(400);
    if (await p.$("#eSync")) throw new Error("curriculum director must not sync");
    const k = await p.$eval("#ekpi", e => e.innerText); if (/sales|¥/.test(k) || !/This month units/.test(k)) throw new Error("money KPI shown to curriculum director: " + k);
    if (!(await p.$("#eOpen"))) throw new Error("no Airtable link");
    const g = await p.$eval("#evgrid", e => e.innerText); if (/¥/.test(g)) throw new Error("amounts in charts for a no-money role");
    if (!/charts count units/.test(await p.$eval("#efoot", e => e.innerText))) throw new Error("footer should say units");
  });
  await shot("groups-bilingual", 1280, 900, "#/domain/groups", "en", ["admin", "staff:sysadmin"], async p => {
    await p.waitForTimeout(800);
    const txt = await p.$eval("#content", e => e.innerText);
    if (!/English Grade 5/.test(txt)) throw new Error("group list: " + txt.slice(0, 200));
    await p.evaluate(() => { const d = document.querySelector("#gtree details"); if (d) d.open = true; }); await p.waitForTimeout(600);
  });
  await shot("group-name-editor", 1280, 900, "#/domain/users", "zh", ["admin", "staff:sysadmin"], async p => {
    await p.waitForTimeout(600);
    const tag = await p.$eval('#utable button[data-group="g1"]', e => e.textContent); if (tag.trim() !== "English Grade 5 · 五年级英语") throw new Error("user table shows " + tag);
    await p.click('#utable button[data-group="g1"]'); await p.waitForTimeout(700);
    const pb = await p.$eval("#panel .pb", e => e.innerText); if (!/Teams 名称/.test(pb) || !/显示名称/.test(pb)) throw new Error("group panel: " + pb.slice(0, 200));
    await p.fill("#gnEn", "Grade 5 English"); await p.click("#gnSave"); await p.waitForTimeout(500);
    if (groupNamed.length !== 1 || groupNamed[0].en !== "Grade 5 English" || groupNamed[0].id !== "g1") throw new Error("groupname call: " + JSON.stringify(groupNamed));
  });
  await shot("orders-phone", 390, 800, "#/ops/orders/hive", "zh", SALES, async p => { await p.waitForTimeout(300); });
  // Sticky headings (Rick 2026-10-06): scroll the users list and the column headings stay at the top of the pane.
  // 删除账号 (Rick, 2026-10-07: 「verify if it works after deleting a user」): the typed
  // confirmation, the row, the tiles, the footer, the notice, the group member lists.
  const tom = users.users[4], groupsBefore = JSON.stringify(dgroups.groups);
  await shot("user-delete", 1280, 900, "#/domain/groups", "zh", ["admin", "staff:sysadmin"], async p => {
    // The 群组 page is visited first, so its cache exists when the account is deleted.
    await p.waitForTimeout(700);
    if (!(await p.$('#gtree .mrow[data-upn="tom.li@bes.qiaoliang.online"]'))) throw new Error("fixture: Tom should be a member before");
    await p.click('#nav a[href="#/domain/users"]'); await p.waitForTimeout(600);
    const before = await p.$eval("#ukpi", e => e.innerText); if (!/账号\s*12/.test(before)) throw new Error("tiles before: " + before);
    await p.click('#utable tbody tr[data-upn="tom.li@bes.qiaoliang.online"]'); await p.waitForTimeout(400);
    if (!(await p.$("#uDel"))) throw new Error("no delete button for an ordinary account");
    let answer = "tom";
    p.on("dialog", d => d.accept(answer));
    await p.click("#uDel"); await p.waitForTimeout(300);
    const msg = await p.$eval("#pmsg", e => e.innerText); if (!/输入的账号不一致/.test(msg)) throw new Error("wrong name not refused: " + msg);
    if (deleted.length) throw new Error("DELETE sent despite the mismatch");
    answer = "Tom.Li@bes.qiaoliang.online";
    await p.click("#uDel"); await p.waitForTimeout(700);
    if (deleted.length !== 1 || deleted[0].user !== "tom.li@bes.qiaoliang.online" || deleted[0].domain !== "bes.qiaoliang.online") throw new Error("DELETE call: " + JSON.stringify(deleted));
    if (await p.$('#utable tbody tr[data-upn="tom.li@bes.qiaoliang.online"]')) throw new Error("row still listed");
    const after = await p.$eval("#ukpi", e => e.innerText); if (!/账号\s*11/.test(after)) throw new Error("tiles after: " + after);
    const foot = await p.$eval("#ufoot", e => e.innerText); if (!/11 \/ 11/.test(foot)) throw new Error("footer: " + foot);
    const fl = await p.$eval("#flash", e => e.hidden ? "" : e.innerText); if (!/已删除/.test(fl) || !/Tom Li/.test(fl) || !/30 天/.test(fl)) throw new Error("notice: " + fl);
    await p.waitForTimeout(900);
    if (await p.$eval("#panel", e => e.classList.contains("open"))) throw new Error("panel still open after the delete");
    // The 未登记验证器 tile and filter still work on the shorter list (Tom, i=4, was verified).
    await p.click('#ukpi .kpi[data-kf="noauth"]'); await p.waitForTimeout(200);
    const noauth = await p.$$("#utable tbody tr[data-upn]"); if (noauth.length !== 4) throw new Error("noauth rows " + noauth.length);
    await p.click('#ukpi .kpi[data-kf="all"]'); await p.waitForTimeout(200);
    // Leaving and coming back keeps the account gone (cache, no refetch), and so does the Teams 群组 page.
    await p.click('#nav a[href="#/domain/groups"]'); await p.waitForTimeout(700);
    if (await p.$('#gtree .mrow[data-upn="tom.li@bes.qiaoliang.online"]')) throw new Error("deleted account still a group member on the 群组 page");
    await p.click('#nav a[href="#/domain/users"]'); await p.waitForTimeout(600);
    const back = await p.$eval("#ukpi", e => e.innerText); if (!/账号\s*11/.test(back)) throw new Error("tiles on return: " + back);
    const gk = await p.$eval('#ukpi .kpi[data-kf="groups"]', e => e.innerText); if (!/\d/.test(gk)) throw new Error("groups tile: " + gk);
    await p.click('#utable tbody tr[data-upn="rick.zhang@bes.qiaoliang.online"]'); await p.waitForTimeout(400);
    if (await p.$("#uDel")) throw new Error("own account offers delete");
  });
  users.users.splice(4, 0, tom); dgroups.groups = JSON.parse(groupsBefore);
  // 仪表盘 (design §5): the staff home, period switch, every tile a way in, panels with charts and tables.
  await shot("dashboard-sales", 1280, 1700, "", "zh", SALES, async p => {
    await p.waitForTimeout(900);
    const h = await p.evaluate(() => location.hash); if (h !== "#/dashboard" && h !== "") throw new Error("staff should land on the dashboard: " + h);
    const title = await p.$eval("#title", e => e.innerText); if (!/仪表盘/.test(title)) throw new Error("title: " + title);
    const nav = await p.$eval("#nav", e => e.innerText); if (!/仪表盘/.test(nav)) throw new Error("nav: " + nav);
    const k = await p.$eval("#dkpi", e => e.innerText); if (!/本月 · 教材销售额\s*¥1,296/.test(k) || !/本月 · 课程订单\s*\d/.test(k) || !/人员库\s*\d/.test(k) || !/待处理\s*\d/.test(k)) throw new Error("tiles: " + k);
    const ids = await p.$$eval("#dgrid .card", es => es.map(e => e.id || e.className)); if (ids.indexOf("dTrend") < 0 || ids.indexOf("dFunnel") < 0 || ids.indexOf("dPub") < 0 || ids.indexOf("dTop") < 0 || ids.indexOf("dSchools") < 0 || ids.indexOf("dSeminar") < 0 || ids.indexOf("dTodo") < 0) throw new Error("panels: " + ids);
    if ((await p.$$("#dgrid svg.viz-svg")).length < 6) throw new Error("charts drawn: " + (await p.$$("#dgrid svg.viz-svg")).length);
    const todo = await p.$eval("#dTodo", e => e.innerText); if (!/超期订单/.test(todo) || !/待合并的人员/.test(todo) || !/待替换邮箱/.test(todo)) throw new Error("todo: " + todo);
    await p.click('#topActions .seg button[data-p="year"]'); await p.waitForTimeout(400);
    const ky = await p.$eval("#dkpi", e => e.innerText); if (!/学年 · 教材销售额\n¥4,370/.test(ky)) throw new Error("school-year tiles: " + ky);
    await p.click('#dTrend .vtoggle button[data-t="monthly"]'); await p.waitForTimeout(300);
    if (!/按月/.test(await p.$eval("#dTrend .ch", e => e.innerText))) throw new Error("monthly toggle");
    if (await p.$eval("#dTrend .vbody", e => e.classList.contains("hidden"))) throw new Error("the 累计/按月 buttons must not hide the chart");
    await p.click('#topActions .seg button[data-p="month"]'); await p.click('#dTrend .vtoggle button[data-t="cum"]'); await p.waitForTimeout(400);
    await p.screenshot({ path: `${OUT}/dashboard-home.png`, fullPage: false });
    // 长尾 panel: two available titles unsold for a year, by publisher; the table lists them.
    await p.waitForTimeout(300);
    const tail = await p.$eval("#dTail", e => e.innerText); if (!/2 \/ 4 种在售教材/.test(tail) || !/CAP/.test(tail)) throw new Error("tail panel: " + tail);
    await p.click('#dTail .vtoggle button[data-v="table"]'); const tt = await p.$eval("#dTail .vtable", e => e.innerText); if (!/OLD-2/.test(tt) || !/从未/.test(tt) || /IEW-SSS1A/.test(tt)) throw new Error("tail table: " + tt);
    await p.click('#dTail .vtoggle button[data-v="chart"]');
    // full screen: the card lifts, Esc puts it back
    await p.click("#dTrend button.vfull"); await p.waitForTimeout(200);
    if (!(await p.$eval("#dTrend", e => e.classList.contains("full")))) throw new Error("card not full screen");
    const fw = await p.$eval("#dTrend svg.viz-svg", e => +e.getAttribute("width")); if (fw < 900) throw new Error("chart not redrawn wider: " + fw);
    await p.keyboard.press("Escape"); await p.waitForTimeout(200);
    if (await p.$(".card.full")) throw new Error("Esc did not close full screen");
    // custom range: Aug–Sep 2026 → the tiles cover both orders
    await p.click('#topActions .seg button[data-p="custom"]'); await p.waitForTimeout(200);
    if (await p.$eval("#dRange", e => e.classList.contains("hidden"))) throw new Error("range pickers hidden");
    await p.selectOption("#dFrom", "2026-08"); await p.selectOption("#dTo", "2026-09"); await p.waitForTimeout(400);
    const kc = await p.$eval("#dkpi", e => e.innerText); if (!/2026-08 – 2026-09 · 教材销售额\n¥3,074/.test(kc)) throw new Error("custom range tiles: " + kc);
    if (!/2026-08 – 2026-09 vs/.test(await p.$eval("#dTrend .ch", e => e.innerText))) throw new Error("trend subtitle for the range: " + await p.$eval("#dTrend .ch", e => e.innerText));
    // export data: one CSV with the tiles and every panel's table
    const [dl] = await Promise.all([p.waitForEvent("download"), p.click("#dCsv")]);
    const csvPath = await dl.path(); const csv = require("fs").readFileSync(csvPath, "utf8");
    if (!/蜂巢 CRM 经营仪表盘/.test(csv) || !/销售与收款趋势/.test(csv) || !/出版社/.test(csv) || !/待处理与异常/.test(csv) || !/超期订单/.test(csv)) throw new Error("dashboard csv: " + csv.slice(0, 300));
    await p.click('#topActions .seg button[data-p="month"]'); await p.waitForTimeout(400);
    const dg = await p.$eval("#dDigest", e => e.innerText); if (!/obadiah\.sun@equipme\.cloud/.test(dg) || !/尚未发送过/.test(dg)) throw new Error("digest line: " + dg);
    p.removeAllListeners("dialog"); p.on("dialog", d => d.accept());
    await p.click("#dSend"); await p.waitForTimeout(500);
    if (digests.length !== 1) throw new Error("digest not sent");
    if (!/已发送给 obadiah/.test(await p.$eval("#flash", e => e.innerText))) throw new Error("digest notice");
    await p.click('#dTodo a[data-tab="overdue"]'); await p.waitForTimeout(500);
    if (!(await p.$("#otable"))) throw new Error("todo line did not open the orders");
    if ((await p.$eval('#obar .chip[data-f="overdue"]', e => e.getAttribute("aria-pressed"))) !== "true") throw new Error("orders did not open on the 超期 tab");
  });
  await shot("dashboard-print", 1000, 1400, "#/dashboard", "zh", SALES, async p => {
    await p.waitForTimeout(900);
    await p.emulateMedia({ media: "print" }); await p.waitForTimeout(200);
    const r = await p.evaluate(() => { const nav = document.getElementById("nav"), c = document.getElementById("content"); const cards = Array.from(document.querySelectorAll("#dgrid .card")); return { navShown: nav && getComputedStyle(nav).display !== "none", overflow: getComputedStyle(c).overflow, cards: cards.length, lastBottom: cards[cards.length - 1].getBoundingClientRect().bottom, scrollH: document.documentElement.scrollHeight }; });
    if (r.navShown) throw new Error("nav printed");
    if (r.overflow !== "visible") throw new Error("content still scrolls in print: " + r.overflow);
    await p.emulateMedia({ media: "screen" });
  });
  await shot("dashboard-curriculum", 1280, 900, "#/dashboard", "en", ["staff:curriculum"], async p => {
    await p.waitForTimeout(800);
    const k = await p.$eval("#dkpi", e => e.innerText); if (/¥/.test(k) || !/Textbook units/.test(k)) throw new Error("curriculum tiles: " + k);
    if (/¥/.test(await p.$eval("#dgrid", e => e.innerText))) throw new Error("amounts shown to a no-money role");
  });
  // 版税结算: finance marks a quarter paid; the curriculum director has no such page.
  // 家庭 in the person panel; 机构 page with the partnership stage; the partners panel on the dashboard.
  await shot("family-institutions", 1280, 900, "#/ops/people", "zh", ["staff:partnership", "staff:sales"], async p => {
    await p.waitForTimeout(600);
    const mum = HUB.people.find(x => x.name === "Mum Bao"); if (!mum.familyId) throw new Error("fixture: Mum Bao should have a family");
    const famCell = await p.$eval('#ptable tbody tr[data-id="' + mum.crmId + '"] .fam', e => e.innerText); if (famCell !== "⌂3") throw new Error("family badge: " + famCell);
    await p.click('#ptable tbody tr[data-id="' + mum.crmId + '"]'); await p.waitForTimeout(400);
    const pb = await p.$eval("#panel .pb", e => e.innerText); if (!/家庭 · 3/i.test(pb) || !/Enqi Bao/.test(pb) || !/孩子/.test(pb) || !/家长 \/ 成人/.test(pb)) throw new Error("family section: " + pb.slice(0, 400));
    await p.click('#panel button[data-person]'); await p.waitForTimeout(300);
    if (!/Bao/.test(await p.$eval("#panel .ph h3", e => e.innerText))) throw new Error("member click did not open the member");
    await p.click("#panel .x");
    await p.click('#nav a[href="#/ops/institutions"]'); await p.waitForTimeout(600);
    const it = await p.$eval("#itable", e => e.innerText); if (!/Kids X Center/.test(it) || !/xqzw\.edu/.test(it)) throw new Error("institutions table: " + it.slice(0, 300));
    // The Hive workspace's rows are there too (Rick, 2026-10-08): the university without a tenant domain has its own row; the hive that is also a tenant domain is one row.
    if (!/Grace Christian University/.test(it) || !/大学/.test(it)) throw new Error("university from the Hive workspace missing: " + it.slice(0, 400));
    const kxcRows = await p.$$eval("#itable tbody tr", rs => rs.filter(r => /Kids X Center/.test(r.innerText)).length); if (kxcRows !== 1) throw new Error("KXC should be one joined row, got " + kxcRows);
    await p.click('#itable tbody tr[data-key="hive:GCU"]'); await p.waitForTimeout(400);
    if (!/蜂巢工作区/.test(await p.$eval("#panel", e => e.innerText))) throw new Error("university panel lacks the workspace line");
    // 合作伙伴 v2: 自动填入 creates the starting relationships from what the hub knows; the
    // rows show them as badges; our own entities are marked internal and get none.
    PARTNERS["xqzw.edu"] = { stage: "trial", note: "试用两个月", owner: "", type: "school", region: "cn" };
    await p.click("#panel .x"); await p.click("#iSeed"); await p.waitForTimeout(800);
    const seeded = seeds[0]; if (!seeded || !seeded.created.some(c => c.type === "it") || !seeded.created.some(c => c.type === "university") || !seeded.created.some(c => c.type === "publisher")) throw new Error("seed result: " + JSON.stringify(seeded));
    const xq = await p.$eval('#itable tbody tr[data-key="xqzw.edu"]', e => e.innerText); if (!/IT 服务 · 方案/.test(xq)) throw new Error("the old 试用 stage folds into the IT relationship: " + xq);
    const gcu = await p.$eval('#itable tbody tr[data-key="hive:GCU"]', e => e.innerText); if (!/大学 · 线索/.test(gcu)) throw new Error("university relationship badge: " + gcu);
    const xqRel = Object.values(REL.items).find(x => x.party.key === "xqzw.edu" && x.type === "it"); if (!xqRel || !xqRel.contacts.length || xqRel.contacts[0].role !== "学校/机构代表") throw new Error("domain admin seeded as the contact: " + JSON.stringify(xqRel && xqRel.contacts));
    if (!xqRel.log.some(l => l.migrated)) throw new Error("the old note was not carried into the log");
    await p.click('#itable tbody tr[data-key="hive:GCU"]'); await p.waitForTimeout(400);
    if (!/大学/.test(await p.$eval("#panel .olist", e => e.innerText))) throw new Error("panel lists the relationship");
    await p.click("#ipInternal"); await p.waitForTimeout(500);
    if (!ORGS.orgs[ORGS.byKey["hive:GCU"]].internal) throw new Error("internal flag not saved");
    if (!/内部/.test(await p.$eval('#itable tbody tr[data-key="hive:GCU"]', e => e.innerText))) throw new Error("internal badge not shown");
    await p.click('#nav a[href="#/dashboard"]'); await p.waitForTimeout(900);
    const dp = await p.$eval("#dPartners", e => e.innerText); if (!/Kids X Center/.test(dp) || !/IT 服务/.test(dp) || !/全部机构/.test(dp)) throw new Error("partners panel: " + dp.slice(0, 300));
  });
  // 录入 (phase 4): the order manager enters an order for an existing customer, then marks cash received; the feed reads in words.
  await shot("entry", 1280, 900, "#/ops/orders", "zh", SALES, async p => {
    await p.waitForTimeout(600);
    if (!(await p.$("#eEntry"))) throw new Error("no 录入 button for the order manager");
    await p.click("#eEntry"); await p.waitForTimeout(600);
    await p.fill("#enQ", "mei"); await p.waitForTimeout(300);
    await p.click('#enHits button[data-pick]'); await p.waitForTimeout(100);
    if (!/已选客户：Mei Wang/.test(await p.$eval("#enPicked", e => e.innerText))) throw new Error("customer not picked");
    await p.selectOption("#enLines .enl:first-child .enSku", "IEW-SSS1A-FP"); await p.fill("#enLines .enl:first-child .enQty", "2"); await p.waitForTimeout(150);
    if ((await p.$eval("#enLines .enl:first-child .enUnit", e => e.value)) !== "648") throw new Error("unit price not defaulted from the SKU");
    if (!/¥1,296/.test(await p.$eval("#enTotal", e => e.innerText))) throw new Error("total: " + await p.$eval("#enTotal", e => e.innerText));
    await p.fill("#enRecv", "1296"); await p.fill("#enNote", "转账");
    await p.click("#enSave"); await p.waitForTimeout(700);
    if (entries.length !== 1) throw new Error("entry not posted");
    const b = entries[0]; if (!b.customer.recId || b.items[0].sku !== "IEW-SSS1A-FP" || b.items[0].qty !== 2 || b.items[0].unitPrice !== 648 || b.received !== 1296 || b.comments !== "转账" || !/^\d{4}-\d{2}-\d{2}$/.test(b.date)) throw new Error("entry payload: " + JSON.stringify(b));
    if (!/已写入 Airtable：订单 H-20261008-TEST/.test(await p.$eval("#flash", e => e.innerText))) throw new Error("entry notice: " + await p.$eval("#flash", e => e.innerText));
    // new customer path: the form demands an email or Teams account before posting
    await p.click("#eEntry"); await p.waitForTimeout(500); await p.check("#enNew"); await p.fill("#enFirst", "New"); await p.fill("#enLast", "Parent"); await p.fill("#enEmail", "new.parent@gmail.com");
    await p.selectOption("#enLines .enl:first-child .enSku", "CEFF-CSB"); await p.click("#enSave"); await p.waitForTimeout(600);
    if (entries.length !== 2 || !entries[1].customer.new || entries[1].customer.new.email !== "new.parent@gmail.com") throw new Error("new customer payload: " + JSON.stringify(entries[1]));
    // 标收款 from an order's panel (opened from the person)
    await p.click('#nav a[href="#/ops/people"]'); await p.waitForTimeout(600);
    const mei = HUB.people.find(x => x.name === "Mei Wang");
    await p.click('#ptable tbody tr[data-id="' + mei.crmId + '"] button[data-orders]'); await p.waitForTimeout(700);
    await p.click('#pEquipOrders button[data-eorder="recO1"]'); await p.waitForTimeout(400);
    await p.fill("#panel2 #eoRecv", "1000"); await p.click("#panel2 #eoRecvSave"); await p.waitForTimeout(500);
    if (received.length !== 1 || received[0].recId !== "recO1" || received[0].received !== 1000) throw new Error("received payload: " + JSON.stringify(received));
    if (!/已记录实收 ¥1,000/.test(await p.$eval("#panel2 #eoMsg", e => e.innerText))) throw new Error("received message");
    await p.click("#nav a[href='#/dashboard']"); await p.waitForTimeout(900);
    const feed = await p.$eval("#dFeedList", e => e.innerText); if (!/录入订单 H-20261008-AB12（新客户）/.test(feed) || !/已提交/.test(feed) || !/Equip 同步 520 单/.test(feed)) throw new Error("feed: " + feed);
  });
  // 许可 (phase 5): the order manager (drm rw) creates a pool, allocates to a person and to an institution, revokes; the dashboard panel and the person facet follow.
  await shot("licenses", 1280, 900, "#/ops/licenses", "zh", SALES, async p => {
    await p.waitForTimeout(600);
    if (!/许可/.test(await p.$eval("#nav", e => e.innerText))) throw new Error("no 许可 nav");
    await p.click("#lcNew"); await p.waitForTimeout(600);
    await p.selectOption("#lpSku", "CEFF-CSB"); await p.fill("#lpQty", "50"); await p.fill("#lpFrom", "2026-09-01"); await p.fill("#lpTo", "2027-08-31"); await p.fill("#lpOrder", "Manual order 40");
    await p.click("#lpSave"); await p.waitForTimeout(600);
    if (LIC.pools.length !== 1 || LIC.pools[0].sku !== "CEFF-CSB" || LIC.pools[0].qty !== 50) throw new Error("pool not created: " + JSON.stringify(LIC.pools));
    const row = await p.$eval('#ltable tbody tr[data-id="LP-000001"]', e => e.innerText); if (!/CEFF-CSB/.test(row) || !/50/.test(row) || !/Manual order 40/.test(row)) throw new Error("pool row: " + row);
    await p.click('#ltable tbody tr[data-id="LP-000001"]'); await p.waitForTimeout(400);
    const mei = HUB.people.find(x => x.name === "Mei Wang");
    await p.fill("#laQ", "mei"); await p.waitForTimeout(300); await p.click('#laHits button[data-pid="' + mei.crmId + '"]'); await p.fill("#laQty", "2"); await p.click("#laSave"); await p.waitForTimeout(600);
    if (LIC.allocations.length !== 1 || LIC.allocations[0].qty !== 2 || LIC.allocations[0].to.crmId !== mei.crmId) throw new Error("allocation: " + JSON.stringify(LIC.allocations));
    if (!/余量 48/.test(await p.$eval("#panel .ph", e => e.innerText))) throw new Error("balance in panel: " + await p.$eval("#panel .ph", e => e.innerText));
    await p.click("#laInst"); await p.waitForTimeout(500);
    await p.selectOption("#panel2 #lpInst", "kxc.edu"); await p.fill("#panel2 #lpQty", "10"); await p.click("#panel2 #lpSave"); await p.waitForTimeout(600);
    if (LIC.pools.length !== 2 || LIC.pools[1].parent !== "LP-000001" || LIC.pools[1].holder.domain !== "kxc.edu") throw new Error("child pool: " + JSON.stringify(LIC.pools));
    if (!/余量 38/.test(await p.$eval("#panel .ph", e => e.innerText))) throw new Error("balance after child pool");
    p.on("dialog", d => d.accept());
    await p.click('#panel button[data-revoke="LA-000001"]'); await p.waitForTimeout(500);
    if (!LIC.allocations[0].revokedAt) throw new Error("not revoked");
    if (!/余量 40/.test(await p.$eval("#panel .ph", e => e.innerText))) throw new Error("balance after revoke");
    await p.fill("#laQ", "mei"); await p.waitForTimeout(300); await p.click('#laHits button[data-pid="' + mei.crmId + '"]'); await p.fill("#laQty", "1"); await p.click("#laSave"); await p.waitForTimeout(500);
    await p.click("#panel .x");
    await p.click('#nav a[href="#/ops/people"]'); await p.waitForTimeout(600);
    await p.click('#ptable tbody tr[data-id="' + mei.crmId + '"]'); await p.waitForTimeout(600);
    const pl = await p.$eval("#pLic", e => e.innerText); if (!/儿童圣经故事|CEFF-CSB/.test(pl) || !/1 份/.test(pl)) throw new Error("person licences: " + pl);
    await p.click("#panel .x"); await p.click('#nav a[href="#/dashboard"]'); await p.waitForTimeout(900);
    const dl = await p.$eval("#dLic", e => e.innerText); if (!/60 份/.test(dl) && !/50 份/.test(dl)) throw new Error("licence panel: " + dl.slice(0, 200));
    if (!(await p.$("#dLic svg.viz-svg"))) throw new Error("licence chart not drawn");
  });
  await shot("royalty-finance", 1280, 800, "#/ops/royalty", "zh", ["staff:finance"], async p => {
    await p.waitForTimeout(600);
    if (!/版税结算/.test(await p.$eval("#nav", e => e.innerText))) throw new Error("no nav item for finance");
    const tb = await p.$eval("#rtable", e => e.innerText);
    if (!/IEW/.test(tb) || !/IEW Inc\./.test(tb) || !/版税率 15%/.test(tb) || !/¥194/.test(tb) || !/销售 ¥1,296/.test(tb)) throw new Error("royalty table: " + tb.slice(0, 400));
    p.on("dialog", d => d.accept());
    await p.click('#rtable button[data-pay="1"][data-pub="IEW"]'); await p.waitForTimeout(400);
    if (!/已付/.test(await p.$eval("#rtable", e => e.innerText)) || !(await p.$("#rtable td.rc.paid"))) throw new Error("not marked paid");
    await p.click('#rtable button[data-pay="0"]'); await p.waitForTimeout(400);
    if (await p.$("#rtable td.rc.paid")) throw new Error("undo did not clear");
  });
  await shot("royalty-none", 1280, 600, "#/ops/royalty", "zh", ["staff:curriculum"], async p => {
    await p.waitForTimeout(500);
    if (/版税结算/.test(await p.$eval("#nav", e => e.innerText))) throw new Error("curriculum director sees the royalty nav");
    if (await p.$("#rtable")) throw new Error("royalty page opened for the curriculum director");
  });
  await shot("users-sticky", 1280, 500, "#/domain/users", "en", ["admin", "staff:sysadmin"], async p => {
    await p.waitForTimeout(500);
    await p.evaluate(() => { const c = document.getElementById("content"); c.scrollTop = 350; });
    await p.waitForTimeout(200);
    const r = await p.evaluate(() => { const th = document.querySelector("#utable thead th"); const k = document.querySelector("#content .kpis"); const c = document.getElementById("content"); const kb = k.getBoundingClientRect(); return { th: th.getBoundingClientRect().top, kpiTop: kb.top, kpiBottom: kb.bottom, pane: c.getBoundingClientRect().top, scrolled: c.scrollTop }; });
    if (r.scrolled < 120) throw new Error("content did not scroll: " + JSON.stringify(r) + " users=" + users.users.length + " rows=" + (await p.$$("#utable tbody tr")).length + " " + JSON.stringify(await p.evaluate(() => ({ h: document.getElementById("content").scrollHeight, ch: document.getElementById("content").clientHeight, body: document.body.className }))));
    if (Math.abs(r.kpiTop - r.pane) > 2) throw new Error("KPI row not stuck to pane top: " + JSON.stringify(r));
    if (Math.abs(r.th - r.kpiBottom) > 2) throw new Error("heading not stuck below the KPI row: " + JSON.stringify(r));
  });
  // Users: role filter (identity, Hive roles, 蜂巢课程教师) and 所有学校 across domains (Rick, 2026-10-08).
  await shot("users-roles-all", 1280, 820, "#/domain/users", "zh", ["admin", "staff:sysadmin"], async p => {
    await p.waitForSelector("#utable tr[data-upn]");
    assert.ok(await p.$("#urole"), "role filter present");
    await p.selectOption("#urole", "role:teacher"); await p.waitForTimeout(200);
    let rows = await p.$$eval("#utable tr[data-upn]", r => r.length);
    assert.strictEqual(rows, 2, "12 users: i % 5 === 2 are in the Teachers table and are the ones whose identity is 老师 → two: " + rows);
    assert.ok(await p.$("#ukpi .kpi[data-kf=teacher]"), "teacher tile");
    await p.selectOption("#urole", "role:it"); await p.waitForTimeout(200);
    rows = await p.$$eval("#utable tr[data-upn]", r => r.length); assert.strictEqual(rows, 1, "one domain IT: " + rows);
    await p.selectOption("#urole", ""); await p.click("#ukpi .kpi[data-kf=anomaly]"); await p.waitForTimeout(200);
    rows = await p.$$eval("#utable tr[data-upn]", r => r.length); assert.strictEqual(rows, 1, "one licence anomaly: " + rows);
    assert.ok(await p.$("#utable .tag.bad[title*='许可证']"), "the anomaly tag explains itself");
    await p.click("#ukpi .kpi[data-kf=all]"); await p.waitForTimeout(200);
    await p.selectOption("#urole", "id:家长"); await p.waitForTimeout(200);
    rows = await p.$$eval("#utable tr[data-upn]", r => r.length); assert.strictEqual(rows, 3, "parents: " + rows);
    await p.selectOption("#urole", ""); await p.selectOption("#dsel", "*"); await p.waitForTimeout(900);
    await p.waitForSelector("#utable tr[data-dom]");
    rows = await p.$$eval("#utable tr[data-upn]", r => r.length); assert.strictEqual(rows, 15, "12 + 3 across two schools: " + rows);
    assert.ok(!(await p.$("#newUser")) && !(await p.$("#usNew")), "no new-account or sync buttons across all schools");
    const foot = await p.$eval("#ufoot", e => e.textContent); assert.ok(/15 \/ 15/.test(foot) && /2 所学校/.test(foot), foot);
    await p.selectOption("#urole", "role:teacher"); await p.waitForTimeout(200);
    rows = await p.$$eval("#utable tr[data-upn]", r => r.length); assert.strictEqual(rows, 3, "teachers across schools: two from the Teachers table + the demo school's one whose identity is 老师: " + rows);
    await p.selectOption("#urole", "");
    await p.click("#utable tr[data-dom]"); await p.waitForTimeout(400);
    assert.ok(await p.$("#panel .ph h3"), "person panel opens from the all-schools table");
    rows = await p.$$eval("#utable tr[data-upn]", r => r.length); assert.strictEqual(rows, 15, "table still shows all schools after opening a panel: " + rows);
  });
  // Narrow panes wrap instead of clipping (Rick, 2026-10-08: "use two rows"); no sideways scroll.
  await shot("users-narrow", 1000, 700, "#/domain/users", "zh", ["admin", "staff:sysadmin"], async p => {
    await p.waitForSelector("#utable tr[data-upn]");
    const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(over <= 0, "no sideways scroll on the users page at 1000px: " + over);
  });
  await shot("people-narrow", 1000, 700, "#/ops/people", "zh", ["admin", "staff:sysadmin"], async p => {
    await p.waitForSelector("#ptable tr[data-id]");
    const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(over <= 0, "no sideways scroll on the people page at 1000px: " + over);
  });
  // Panels close on a click outside; page descriptions sit behind ⓘ, never under the title (Rick, 2026-10-08).
  await shot("panel-outside-click", 1280, 800, "#/domain/users", "zh", ["admin", "staff:sysadmin"], async p => {
    await p.waitForSelector("#utable tr[data-upn]");
    assert.ok(!(await p.$("#title .desc")), "no description line under the title");
    assert.ok(await p.$("#title .info"), "the description is behind an ⓘ");
    await p.click("#utable tr[data-upn]"); await p.waitForTimeout(300);
    assert.ok(await p.$eval("#panel", e => e.classList.contains("open")), "panel opened");
    await p.click("#ukpi"); await p.waitForTimeout(200);
    assert.ok(!(await p.$eval("#panel", e => e.classList.contains("open"))), "a click outside closed it");
    await p.click("#utable tr[data-upn]"); await p.waitForTimeout(300);
    assert.ok(await p.$eval("#panel", e => e.classList.contains("open")), "opens again from a row");
    const rows = await p.$$("#utable tr[data-upn]"); await rows[1].click({ position: { x: 40, y: 10 } }); await p.waitForTimeout(300);
    assert.ok(!(await p.$eval("#panel", e => e.classList.contains("open"))), "a click on another row only closes the panel — it does not open the next person (Rick)");
    await rows[1].click({ position: { x: 40, y: 10 } }); await p.waitForTimeout(300);
    assert.ok(await p.$eval("#panel", e => e.classList.contains("open")), "the next click opens that row");
  });
  // 合作伙伴 v2 (Rick, 2026-10-08): the type pages, a relationship created from an
  // organization, moved along its cycle under the rules, a contact picked from the
  // hub, a project with milestones; the funder type hidden from the order manager.
  await shot("partners-board", 1280, 900, "#/ops/partners/it", "zh", ["staff:partnership"], async p => {
    const nav = await p.$eval("#nav", e => e.innerText); assert.ok(/合作伙伴/.test(nav), "nav has 合作伙伴: " + nav);
    await p.waitForSelector("#ptTabs .ptab");
    const tabs = await p.$$eval("#ptTabs .ptab", es => es.map(e => e.textContent)); assert.strictEqual(tabs.length, 7, "seven type tabs for the partnership director: " + tabs);
    assert.ok(await p.$("#title .info"), "description behind ⓘ");
    const cols = await p.$$(".board .bcol"); assert.strictEqual(cols.length, 8, "eight IT stages on the board");
    const before = (await p.$$(".board .bcard")).length; // the seeded ones (family-institutions ran first)
    await p.click("#ptNew"); await p.waitForTimeout(300);
    await p.fill("#nrOq", "kxc"); await p.waitForTimeout(500);
    await p.click('#nrOres .pr[data-key]'); await p.waitForTimeout(200);
    const who = await p.$eval("#nrOch .who", e => e.innerText); assert.ok(/Kids X Center/.test(who), "organization picked: " + who);
    await p.fill("#nrNext", "打电话给校长"); await p.fill("#nrDue", "2026-12-01");
    await p.click("#nrSave"); await p.waitForTimeout(700);
    const cr = ptPosts.find(b => b.op === "create"); assert.ok(cr && cr.party.key === "kxc.edu" && cr.type === "it", "create posted: " + JSON.stringify(cr));
    assert.ok(await p.$("#panel svg.track"), "the relationship panel shows the stage track");
    const nowLab = await p.$eval("#panel svg.track g.node.now text", e => e.textContent); assert.strictEqual(nowLab, "线索");
    const cards = await p.$$(".board .bcard"); assert.strictEqual(cards.length, before + 1, "one more card on the board");
    // forward one stage
    await p.click('#panel button[data-act="move"]'); await p.waitForTimeout(200);
    await p.selectOption("#mvTo", "assess"); await p.click("#mvForm button[type=submit]"); await p.waitForTimeout(700);
    assert.strictEqual(await p.$eval("#panel svg.track g.node.now text", e => e.textContent), "评估", "moved to 评估");
    // 签约 needs an agreement and a contact: blocked
    await p.click('#panel button[data-act="move"]'); await p.waitForTimeout(200);
    await p.selectOption("#mvTo", "signed"); await p.click("#mvForm button[type=submit]"); await p.waitForTimeout(600);
    const fl = await p.$eval("#flash", e => e.innerText); assert.ok(/move_blocked/.test(fl) && /协议/.test(fl) && /联系人/.test(fl), "blocked with reasons: " + fl);
    // a contact from the people hub
    await p.click('#panel button[data-ptab="contacts"]'); await p.waitForTimeout(200);
    await p.fill("#rpPick .pq", "mei"); await p.waitForTimeout(600);
    await p.click('#rpPick .pres .pr[data-id]'); await p.waitForTimeout(200);
    await p.selectOption("#rpPick .prole", "校长"); await p.click("#rpPick .padd"); await p.waitForTimeout(700);
    const cl = await p.$eval("#rpBody .olist", e => e.innerText); assert.ok(/Mei Wang/.test(cl) && /校长/.test(cl), "contact added: " + cl);
    // a new person entered inline
    await p.fill("#rpPick .pq", "Dean"); await p.waitForTimeout(600);
    await p.click("#rpPick .pres .pr.new"); await p.waitForTimeout(200);
    await p.fill("#rpPick .nemail", "dean@kxc.edu"); await p.click("#rpPick .pnew button[type=submit]"); await p.waitForTimeout(500);
    assert.strictEqual(CONTACTS.length, 1, "contact created"); assert.strictEqual(CONTACTS[0].name, "Dean");
    await p.selectOption("#rpPick .prole", ""); await p.fill("#rpPick .prole2", "IT 联系人"); await p.click("#rpPick .padd"); await p.waitForTimeout(700);
    const cl2 = await p.$eval("#rpBody .olist", e => e.innerText); assert.ok(/Dean/.test(cl2) && /IT 联系人/.test(cl2), "new person added as contact: " + cl2);
    // the agreement, then 签约
    await p.click('#panel button[data-ptab="overview"]'); await p.waitForTimeout(200);
    await p.click('#panel button[data-act="edit"]'); await p.waitForTimeout(200);
    await p.fill("#agSigned", "2026-10-01"); await p.fill("#agEnd", "2027-09-30"); await p.click("#edForm button[type=submit]"); await p.waitForTimeout(700);
    await p.click('#panel button[data-act="move"]'); await p.waitForTimeout(200);
    await p.selectOption("#mvTo", "signed"); await p.click("#mvForm button[type=submit]"); await p.waitForTimeout(700);
    assert.strictEqual(await p.$eval("#panel svg.track g.node.now text", e => e.textContent), "签约");
    assert.ok(await p.$("#panel svg.tline"), "the agreement gives the timeline a row");
    // a project with milestones
    await p.click('#panel button[data-ptab="projects"]'); await p.waitForTimeout(200);
    await p.click('#panel button[data-act="newproject"]'); await p.waitForTimeout(200);
    await p.fill("#npName", "KXC 开通"); await p.fill("#npStart", "2026-10-15"); await p.click("#npForm button[type=submit]"); await p.waitForTimeout(800);
    assert.ok(await p.$eval("#panel2", e => e.classList.contains("open")), "the project opens in the second panel");
    const ms = await p.$$("#panel2 .mrow2"); assert.strictEqual(ms.length, 3, "rollout template has three milestones");
    await p.click('#panel2 input[data-ms="m1"]'); await p.waitForTimeout(700);
    assert.ok(await p.$eval('#panel2 .mrow2', e => e.classList.contains("done")), "first milestone ticked");
    await p.selectOption("#pjStatus", "active"); await p.waitForTimeout(700);
    const h3 = await p.$eval("#panel2 .ph", e => e.innerText); assert.ok(/进行中/.test(h3), "project active: " + h3);
    const lg = Object.values(REL.items).find(x => x.source === "manual").log.map(l => l.kind); assert.ok(lg.includes("stage") && lg.includes("contacts") && lg.includes("project"), "everything logged: " + lg);
  });
  await shot("partners-table", 1280, 700, "#/ops/partners/it", "en", ["staff:partnership"], async p => {
    await p.waitForSelector(".board");
    await p.click('#ptRight [data-view="table"]'); await p.waitForTimeout(300);
    const rows = await p.$$eval("#pttable tbody tr[data-rel]", rs => rs.map(r => r.innerText)); assert.ok(rows.length >= 1, "rows in the table");
    const row = rows.find(x => /Kids X Center/.test(x) && /Signed/.test(x)); assert.ok(row, "the signed KXC row: " + rows.join(" | "));
    await p.click("#pttable tbody tr[data-rel]"); await p.waitForTimeout(500);
    assert.ok(await p.$eval("#panel", e => e.classList.contains("open")), "panel opens from the table");
    await p.click("#ptKpi"); await p.waitForTimeout(200);
    assert.ok(!(await p.$eval("#panel", e => e.classList.contains("open"))), "closes on an outside click");
    await p.click('#ptRight [data-view="board"]'); await p.waitForTimeout(200);
  });
  await shot("partners-sales", 1280, 700, "#/ops/partners/funder", "zh", SALES, async p => {
    await p.waitForTimeout(500);
    const tabs = await p.$$eval("#ptTabs .ptab", es => es.map(e => e.textContent)); assert.ok(!tabs.some(x => /募款/.test(x)), "the order manager does not see fundraising: " + tabs);
    const body = await p.$eval("#ptBody", e => e.innerText); assert.ok(/no_access/.test(body), "funder page refused: " + body.slice(0, 80));
    assert.ok(!(await p.$("#ptNew")), "no New button without partners rw");
  });
  await shot("partners-narrow", 1000, 700, "#/ops/partners/it", "zh", ["admin", "staff:sysadmin"], async p => {
    await p.waitForSelector(".board");
    const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(over <= 0, "the board scrolls inside the page, not the page: " + over);
  });
  console.log(errs.length ? "ERRORS:\n" + errs.join("\n") : "all orders/roles checks passed");
  await browser.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
