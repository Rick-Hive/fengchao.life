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
const CAN = { view: true, methods: true, people: true, plan: true, calendar: true, calendarEdit: false, broadcastOptout: true, full: true, groups: true, groupTenant: true, groupTenantSchool: false, groupScope: true }; // the sysadmin may add anyone; the school's switch is off
// 课程方案 (2026-10-12): what /api/school-plan?domain= answers the editor, and the PUTs it makes.
const PLAN_SUBJ = [{ id: "recMath", nameEn: "Mathematics", nameZh: "数学" }, { id: "recSci", nameEn: "Science", nameZh: "科学" }];
const PLAN_DEFAULTS = { k8TrackId: 7, subjects: PLAN_SUBJ, tracks: [{ trackId: 1, nameEn: "International: Classical", nameZh: "国际·古典", credits: { math: 4, science: 3, english: 4, bible: 2, speaking: 1, elective: 2 }, totalCredits: 24, serviceHours: 50, commentsZh: "蜂巢备注" }, { trackId: 2, nameEn: "College prep", nameZh: "大学预备", credits: { math: 4, science: 4, english: 4, elective: 6 }, totalCredits: 26, serviceHours: 40 }, { trackId: 3, nameEn: "Domestic: Classical", nameZh: "国内·古典", credits: { math: 5, science: 3, english: 3, bible: 2, elective: 3 }, totalCredits: 24, serviceHours: 30 }],
  map: { grammar: { grades: ["K", "G1", "G2", "G3", "G4", "G5", "G6"], rows: [] }, dialectic: { grades: ["G7", "G8"], rows: [{ id: "recD", order: 1, subjects: [PLAN_SUBJ[0]], trackIds: [], pedagogy: null, spanAll: false, cells: { G7: [{ en: "Pre-Algebra", zh: "预备代数" }] } }] }, rhetoric: { grades: ["G9", "G10", "G11", "G12"], rows: [{ id: "recA", order: 1, subjects: [PLAN_SUBJ[0]], trackIds: [], pedagogy: null, spanAll: false, cells: { G9: [{ en: "Geometry", zh: "几何" }], G10: [{ en: "Algebra 2", zh: "代数2" }] } }] } } };
let PLAN_DOC = { domain: "bes.qiaoliang.online", draft: { tracks: {}, map: {} }, published: null, updatedAt: null, updatedBy: "" };
// Hive courses on the map (2026-10-20): the public catalog the plan page counts into the cells, and the family's orders
const CATALOG = [
  { id: "recC1", code: "KXC-MATH-HS-101", nameEn: "Geometry", nameZh: "几何", subjects: [PLAN_SUBJ[0]], grades: ["G9", "G10"], trackIds: [1, 2, 3], pedagogy: false, available: true, price: 2400, teachers: ["Zhang Lao"], school: { name: "KXC", abbr: "KXC" }, classTypeZh: "直播课", classTypeEn: "Live", languageZh: "中文", languageEn: "Chinese", descriptionZh: "欧氏几何入门。", descriptionEn: "Euclid.", days: ["Monday"], schedule: [{ range: "19:00–19:45" }], minSize: 4, maxSize: 12 },
  { id: "recC2", code: "KXC-MATH-HS-301", nameEn: "Calculus", nameZh: "微积分", subjects: [PLAN_SUBJ[0]], grades: ["G12"], trackIds: [2], pedagogy: false, available: true, price: 2600, teachers: [], school: { name: "KXC", abbr: "KXC" } },
  { id: "recC3", code: "BES-SCI-MS-201", nameEn: "Life Science", nameZh: "生命科学", subjects: [PLAN_SUBJ[1]], grades: ["G7", "G8"], trackIds: [1, 3], pedagogy: false, available: true, price: 1800, teachers: ["Mr Lee"], school: { name: "BES", abbr: "BES" } },
  { id: "recC4", code: "BES-ART-HS-101", nameEn: "Choir", nameZh: "合唱", subjects: [{ id: "recArt", nameEn: "Fine Arts", nameZh: "艺术" }], grades: ["G9", "G10", "G11", "G12"], trackIds: [1, 3], pedagogy: false, available: true, price: null, teachers: [], school: { name: "BES", abbr: "BES" } },
  { id: "recC5", code: "KXC-MATH-HS-999", nameEn: "Hidden", nameZh: "下架课", subjects: [PLAN_SUBJ[0]], grades: ["G9"], trackIds: [1], pedagogy: false, available: false, price: 1, teachers: [], school: { name: "KXC", abbr: "KXC" } },
];
let MY_ORDERS = []; const myPatches = [];
const MY_ORDERS0 = () => [
  { orderId: "FC-20261020-KXC-003", submission: "FS-20261020-ABCDE", submittedAt: "2026-10-20T03:00:00Z", status: "submitted", email: "h.safe@gmail.com", account: "", items: [{ code: "KXC-MATH-HS-101", nameZh: "几何", nameEn: "Geometry", price: 2400, schoolAbbr: "KXC", grades: ["G9", "G10"], waitlist: false, prereq: null, child: { name: "张小明", grade: "9", account: "" } }], hives: [{ key: "KXC", name: "KXC", abbr: "KXC" }], itemCount: 1, totalPrice: 2400, currency: "CNY", fee: null, notify: { ok: true }, history: [{ at: "2026-10-20T03:00:00Z", to: "submitted", from: null }], canCancel: true, canConfirmPay: true, canNameChild: true, needsChild: false, expiresAt: "2026-11-10T03:00:00Z" },
  { orderId: "FC-20261018-BES-001", submission: "FC-20261018-BES-001", submittedAt: "2026-10-18T03:00:00Z", status: "contacted", email: "h.safe@gmail.com", account: "", items: [{ code: "BES-SCI-MS-201", nameZh: "生命科学", nameEn: "Life Science", price: 1800, schoolAbbr: "BES", grades: ["G7"], waitlist: true, prereq: { text: "BES-SCI-MS-101 Earth Science / 地球科学", codes: ["BES-SCI-MS-101"], met: "none" }, child: null }], hives: [{ key: "BES", name: "BES", abbr: "BES" }], itemCount: 1, totalPrice: 1800, currency: "CNY", fee: { amount: 100, currency: "usd", status: "paid", receiptUrl: "https://pay.stripe.com/receipts/x" }, notify: { ok: true }, history: [], canCancel: false, canConfirmPay: true, canNameChild: true, needsChild: true, contact: { familyName: "张", givenName: "三", englishName: "" }, expiresAt: "2026-11-08T03:00:00Z" },
];
const planPuts = [];
// 所有学校 is paged (2026-10-21): the mock pages with the real module; every query the page sent is recorded
const userList = require("../../api/shared/userList.js");
const usersPages = [];
const peopleList = require("../../api/shared/peopleList.js");
const peoplePages = [];
// 校历 (2026-10-16): the school's own events and the Hive layer, kept in memory; every POST is recorded.
const TEAM_G5 = "11111111-1111-1111-1111-111111111111";
const CAL_AUD = { people: [
  { u: "teacher1@bes.qiaoliang.online", n: "Teacher One", d: "bes.qiaoliang.online", i: "老师", t: [0] },
  { u: "parent1@bes.qiaoliang.online", n: "Parent One", d: "bes.qiaoliang.online", i: "家长", t: [] },
  { u: "kid1@bes.qiaoliang.online", n: "Kid One", d: "bes.qiaoliang.online", i: "学生", t: [0] },
  { u: "teacher9@other.edu", n: "Teacher Nine", d: "other.edu", i: "老师", t: [] },
], teams: [{ id: TEAM_G5, name: "Grade 5 Team", kind: "team", count: 2, domains: ["bes.qiaoliang.online"] }] };
const BC_ITEMS = [{ upn: "parent1@bes.qiaoliang.online", reason: "家长要求", at: "2026-10-16T08:00:00Z", by: "it@bes.qiaoliang.online" }];
const bcPosts = [];
const CAL_SEED = { id: "h-seed", title: "联合教师培训", allDay: false, start: "2026-12-05T19:00", end: "2026-12-05T20:30", timeZone: "America/New_York", audience: ["老师"], location: "", description: "", link: "https://zoom.us/j/123456", meeting: "link", reminder: 15, showAs: "free", targets: ["*"], createdBy: "hive.admin@fengchao.life" };
let CAL_SCHOOL = { domain: "bes.qiaoliang.online", timezone: "", events: [], updatedAt: null, updatedBy: "" };
let CAL_HIVE = { events: [CAL_SEED], updatedAt: null, updatedBy: "" };
// 课程管理 (2026-10-18): one course in memory, the editor's PATCHes and ops recorded.
const CO_LOOK = { at: "2026-10-18T00:00:00Z", courses: [{ id: "recCOURSE00000001", code: "SCI-HS-101", nameEn: "Biology", nameZh: "生物" }, { id: "recCOURSE00000002", code: "SCI-MS-201", nameEn: "Life Science", nameZh: "生命科学" }, { id: "recCOURSE00000003", code: "MATH-HS-101", nameEn: "Algebra 1", nameZh: "代数 1" }], grades: [{ id: "recGRADE000000001", name: "G1" }, { id: "recGRADE000000009", name: "G9" }, { id: "recGRADE000000010", name: "G10" }],
  subjects: [{ id: "recSUBJ0000000001", nameEn: "Science", nameZh: "科学" }, { id: "recSUBJ0000000002", nameEn: "Math", nameZh: "数学" }], textbooks: [{ id: "recTB00000000001", sku: "SCI-9", nameEn: "Biology 9", nameZh: "九年级生物" }],
  teachers: [{ id: "recTEACH000000001", name: "Zhang Lao", upn: "zhang@kxc.edu" }, { id: "recTEACH000000002", name: "Mr Lee" }], schools: [{ id: "recSCHOOL00000001", name: "Kids X Center", abbr: "KXC" }], tracks: [{ id: "recTRACK000000001", trackId: 1, name: "International: Classical", nameZh: "国际·古典" }],
  options: { classType: [{ en: "Live Course", zh: "直播课" }, { en: "Prerecorded Course", zh: "录播课" }], language: [{ en: "English", zh: "英语" }, { en: "Chinese", zh: "中文" }], days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"] },
  fields: { classical: false } };
const CO_ID = "recCOURSE00000001";
let CO_DOC = { id: CO_ID, code: "SCI-HS-101", status: "draft", fields: { nameEn: "Biology", nameZh: "生物", descriptionEn: "Cells, genetics and ecology for Grade 9.", descriptionZh: "", classType: { en: "Live Course", zh: "直播课" }, language: { en: "English", zh: "英语" },
  subjects: ["recSUBJ0000000001"], grades: ["recGRADE000000009"], creditHours: 1, numClasses: 30, classTime: "P3 10:00–10:45", days: ["Monday", "Wednesday"], prerequisite: "", academic: true, classical: false, syllabus: [], textbooks: ["recTB00000000001"], teachers: ["recTEACH000000001"], school: ["recSCHOOL00000001"], tracks: ["recTRACK000000001"], price: 300, available: true, comments: "" },
  meta: { machine: {}, translatedFrom: {}, sourceLang: "en" }, draftAt: "2026-10-18T02:00:00Z", draftBy: "zhang@kxc.edu", submitted: null, reviewing: null, returned: null, published: null, fieldHistory: { descriptionEn: [{ at: "2026-10-18T01:00:00Z", by: "zhang@kxc.edu", from: "", to: "Cells, genetics and ecology for Grade 9." }] },
  history: [{ at: "2026-10-18T02:00:00Z", by: "zhang@kxc.edu", action: "save", fields: ["descriptionEn", "classTime"] }, { at: "2026-10-18T01:00:00Z", by: "zhang@kxc.edu", action: "open", note: "from Airtable" }] };
const coPatches = [], coOps = [];
function coTranslation() { const f = CO_DOC.fields, m = CO_DOC.meta; const st = (dst) => m.machine[dst] ? "machine" : (f[dst] || "").trim() ? "human" : "empty"; return { nameZh: st("nameZh"), nameEn: st("nameEn"), descriptionZh: st("descriptionZh"), descriptionEn: st("descriptionEn") }; }
function coNeeds() { const tr = coTranslation(); return ["nameZh", "nameEn", "descriptionZh", "descriptionEn"].filter(k => tr[k] === "empty" && (CO_DOC.fields[k.replace(/Zh$/, "En").replace(/En$/, k.endsWith("Zh") ? "En" : "Zh")] || "").trim()).length; }
function coListRow() { return { id: CO_ID, code: CO_DOC.code, nameEn: CO_DOC.fields.nameEn, nameZh: CO_DOC.fields.nameZh, school: "KXC", teachers: ["Zhang Lao"], subjects: [{ nameEn: "Science", nameZh: "科学" }], available: true, status: CO_DOC.status, updatedAt: CO_DOC.draftAt, submittedAt: CO_DOC.submitted && CO_DOC.submitted.at, publishedAt: CO_DOC.published && CO_DOC.published.at, returnedAt: CO_DOC.status === "returned" ? CO_DOC.returned.at : null, assigned: CO_ASSIGNED.slice() }; }
let CO_ASSIGNED = [{ name: "Zhang Lao", upn: "zhang@kxc.edu", crmId: "P-1" }];
const calPosts = [], syncPosts = [], filePosts = [];
const domains = { user: summary.profile.upn, roles: ["admin"], all: true, mine: "bes.qiaoliang.online", domains: [{ domain: "bes.qiaoliang.online", name: "北京某某学校", nameEn: "Beijing Example School", isDefault: true, isInitial: false, can: CAN }, { domain: "demo.fengchao.life", name: "", isDefault: false, isInitial: false, can: CAN }], showDomains: true };
function mkUser(i) {
  const names = ["Elaine Chen", "Lei Dong", "Rick Zhang", "Mei Wang", "Tom Li", "Anna Zhao", "Kevin Wu", "Sophie Liu", "Jack Sun", "Lily Huang", "Mark Zhou", "Grace Xu"];
  const n = names[i % names.length]; const upn = n.toLowerCase().replace(" ", ".") + "@bes.qiaoliang.online";
  const verified = i % 3 !== 0;
  return { id: "u" + i, upn, displayName: n, enabled: i !== 7, created: "2026-08-0" + ((i % 9) + 1) + "T00:00:00Z", lastSignIn: i % 4 ? "2026-09-2" + (i % 9) + "T08:00:00Z" : null,
    verified, devices: verified ? [{ id: "d" + i, kind: "authenticator", name: i % 2 ? "iPhone 13" : "Xiaomi 14", version: "6.8.1", created: "2026-09-01T00:00:00Z" }] : [], otherMethods: ["password"],
    groups: i % 2 ? [{ id: "g1", name: "English Grade 5", kind: "team", nameZh: "五年级英语", nameEn: "English Grade 5" }] : [{ id: "g2", name: "Math Grade 5", kind: "team" }, { id: "g3", name: "BES Staff", kind: "m365" }],
    roles: i === 1 ? [{ role: "domain_it:bes.qiaoliang.online", zh: "IT 管理员 · bes.qiaoliang.online", en: "IT administrator · bes.qiaoliang.online" }] : [], hiveTeacher: i % 5 === 2 ? { name: n, teacherId: "T-00" + i, organization: ["BES"] } : null, plan: i % 5 === 1 ? "student" : "faculty", anomaly: i === 6 ? "student_without_student_plan" : i === 1 ? "" : "", safeEmail: i % 2 ? "" : "parent" + i + "@gmail.com", city: ["南京", "苏州", ""][i % 3],
    identity: ["家长", "学生", "老师", "行政", ""][i % 5], identitySource: i % 5 === 4 ? "" : (i % 2 ? "hive" : "entra"), linked: i % 5 === 0 ? ["kid.chen@bes.qiaoliang.online"] : [], note: i === 1 ? "SSPR 未生效，待复核" : "", extra: i === 1 ? { city: "南京", needs: ["教材"], children: [{ name: "大宝", age: 12, grade: "6", schooling: "在家教育", model: "古典教育", higherEd: "海外上大学", account: "kid.chen@bes.qiaoliang.online" }] } : null };
}
const SYNC = { domain: "bes.qiaoliang.online", done: true, mode: "full", total: 12, remaining: 0, users: 12, syncedAt: "2026-10-01T17:00:00Z", fullAt: "2026-10-01T17:00:00Z", lastRun: null, error: null, added: 0 };
const users = { domain: "bes.qiaoliang.online", partial: false, sync: SYNC, users: Array.from({ length: 12 }, (_, i) => mkUser(i)) };
const dgroups = { sync: SYNC, groups: groups.groups.map((g, i) => ({ ...g, nameZh: i === 0 ? "五年级英语" : "", nameEn: i === 0 ? "English Grade 5" : "", mail: g.name.toLowerCase().replace(/ /g, ".") + "@bes.qiaoliang.online", domainMembers: 3, members: users.users.slice(i, i + 3).map(u => u.upn) })) };
const roles = { entries: [
  { user: "lei.dong@bes.qiaoliang.online", roles: ["domain_it:bes.qiaoliang.online"], by: "rick.zhang@bes.qiaoliang.online", at: "2026-10-01T02:00:00Z", displayName: "Lei Dong", domain: "bes.qiaoliang.online", lastSignIn: "2026-10-03T01:00:00Z", inDirectory: true },
  { user: "mei.wang@bes.qiaoliang.online", roles: ["domain_it:bes.qiaoliang.online", "staff:community"], by: "rick.zhang@bes.qiaoliang.online", at: "2026-10-02T02:00:00Z", displayName: "Mei Wang", domain: "bes.qiaoliang.online", lastSignIn: "", inDirectory: true },
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
    items: [{ code: "KXC-MATH-7", nameZh: "七年级数学", nameEn: "Grade 7 Mathematics", classType: "直播课 / Live Course", language: "中文 / Chinese", grades: ["G7"], teachers: ["张老师"], price: 1200, priceTbd: false, schoolName: "Kids X Center", schoolAbbr: "KXC", child: { name: ["张小明", "李小红", "王小军", "赵小兰", "Ming", "Hong", "Jun", "Lan", "周小安"][i], grade: "7", account: "" } },
            { code: "KXC-SCI-7", nameZh: "七年级科学", nameEn: "Grade 7 Science", classType: "录播课 / Prerecorded", language: "英语 / English", grades: ["G7", "G8"], teachers: ["Mr Lee"], price: i % 4 ? 900 : 0, priceTbd: i % 4 === 0, schoolName: "Kids X Center", schoolAbbr: "KXC" }],
    hives: [{ key: "KXC", name: "Kids X Center", abbr: "KXC", itemCount: 2, subtotal: 2100, notified: true }], itemCount: 2, totalPrice: 2100, currency: "CNY",
    status: "submitted", history: [{ at, by: "system", from: null, to: "submitted", note: "" }], notify: { ok: notifyOk, at, error: notifyOk ? undefined : "HTTP 502" }, crmId: null };
  if (i === 1) o.items[1].prereq = { text: "KXC-SCI-6 Grade 6 Science / 六年级科学", codes: ["KXC-SCI-6"], met: "none" };
  // stage-2 chain (2026-10-21): contacted → parent_paid → paid → started; a legacy `confirmed` record is kept as-is
  let cur = o; const chain = { confirmed: ["confirmed"], contacted: ["contacted"], parent_paid: ["contacted", "parent_paid"], paid: ["contacted", "parent_paid", "paid"], started: ["contacted", "paid", "started"], cancelled: ["cancelled"] }[status] || [];
  let step = agoDays - 1;
  for (const s of chain) { cur = s === "confirmed" ? Object.assign({}, cur, { status: "confirmed", history: cur.history.concat([{ at: new Date(Date.now() - Math.max(step--, 0) * dayMs).toISOString(), by: "om@fengchao.life", from: "submitted", to: "confirmed", note: "" }]) }) : crm.transition(cur, s, s === "parent_paid" ? "parent@gmail.com" : "om@fengchao.life", s === "paid" ? "已收到转账" : "", ["staff:sales"], new Date(Date.now() - Math.max(step--, 0) * dayMs)); }
  return cur;
}
const seated = [], extended = [], termCancels = [], idBulk = [], createdUsers = [], merges = [], tPatches = [], tPhotos = [], tApproved = [];
// 教师资料: two teachers, one of them the signed-in account under x:teacher
const TEACHERS = [{ id: "recTEACH000000001", name: "Zhang Lao", teamsAccount: "rick.zhang@bes.qiaoliang.online", domain: "bes.qiaoliang.online", organization: "北京某某学校", subjects: "Math", languages: "Chinese", gradeLevels: "G7-G9", bio: "", expertise: "", photoUrl: null },
  { id: "recTEACH000000002", name: "Mr Lee", teamsAccount: "lee@kxc.edu", domain: "kxc.edu", organization: "Kids X Center", subjects: "Science", languages: "English", gradeLevels: "G9-G12", bio: "Twenty years of lab-based science teaching.", expertise: "Biology, chemistry", photoUrl: "/assets/apple-touch-icon.png" }];
const TWORK = {};
let CREATE_LICENCE = { ok: true, plans: ["Office 365 A1 for faculty", "Power Automate Free"] };
let ORDERS = [mkOrder(0, "submitted", 2, true), mkOrder(1, "submitted", 10, true), mkOrder(2, "confirmed", 12, true), mkOrder(3, "paid", 5, false), mkOrder(4, "started", 40, true), mkOrder(5, "cancelled", 3, true), mkOrder(6, "parent_paid", 4, true), mkOrder(7, "submitted", 1, false), mkOrder(8, "submitted", 25, true)];
// the ninth is another hive's (BES): a provider's leader must not see it; its clock ran out 4 days ago → expired on read
ORDERS[8].orderId = "FC-20260926-BES-009"; ORDERS[8].hives = [{ key: "BES", name: "BES School", abbr: "BES", itemCount: 2, subtotal: 2100, notified: true }]; ORDERS[8].items.forEach(it => { it.schoolAbbr = "BES"; it.schoolName = "BES School"; it.code = it.code.replace("KXC", "BES"); });
ORDERS[3] = crm.withCommission(ORDERS[3]); ORDERS[3].history[ORDERS[3].history.length - 1].via = "hive"; ORDERS[3].contact = { familyName: "赵", givenName: "小兰妈妈", englishName: "Lan" }; ORDERS[3].proof = [{ i: 1, name: "wechat.png", type: "image/png", size: 4, at: ORDERS[3].submittedAt }];
ORDERS[1].notices = [{ event: "contacted", at: new Date(Date.now() - 2 * dayMs).toISOString(), ok: true, status: 202, to: { family: true, provider: false } }, { event: "reminder_expiry", at: new Date().toISOString(), ok: false, status: 502, to: { family: true, provider: true } }];
const PROVIDER_KEYS = ["KXC"];
const liveOrders = () => { ORDERS = ORDERS.map(o => crm.withExpiry(o)); return ORDERS; };
const orderView = (o, acc, provider) => Object.assign(provider ? o : crm.mask(o, acc), { overdue: crm.overdue(o), status: crm.statusOf(o), expiresAt: crm.isLive(o) && ["submitted", "contacted"].includes(crm.statusOf(o)) ? new Date(crm.expiresAt(o)).toISOString() : null });
const nextFor = (o, acc, provider, rolesList) => provider ? crm.providerNext(o.status) : acc.orders === "rw" ? crm.nextStatuses(o.status, rolesList) : [];
function ordersBody(acc, provider) {
  const all = liveOrders().filter(o => !provider || o.hives.some(h => PROVIDER_KEYS.includes(h.key)));
  const counts = { all: all.length, submitted: 0, contacted: 0, parent_paid: 0, paid: 0, started: 0, cancelled: 0, expired: 0, overdue: 0, notifyFailed: 0 };
  const list = all.map((o) => { const od = crm.overdue(o); counts[crm.statusOf(o)]++; if (od) counts.overdue++; if (o.notify.ok === false) counts.notifyFailed++; return orderView(o, acc, provider); });
  return { orders: list, counts, access: acc, provider: provider ? { keys: PROVIDER_KEYS } : null, statuses: crm.STATUS_LABELS, overdueDays: crm.OVERDUE_DAYS, expireDays: crm.EXPIRE_DAYS };
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
  const verdicts = []; let rebuilds = 0; const stmPosts = [];
const STM_ROWS = [
  { domain: "bes.qiaoliang.online", name: "北京某某学校", nameEn: "Beijing Example School", relationship: "REL-000001", stage: "operating", saved: false, status: null, amount: 14.17, currency: "USD", billable: 37, discount: 3, counts: { start: { total: 39, licensed: 37 }, end: { total: 42, licensed: 40 }, added: 4, removed: 1 }, reconstructed: { start: false, end: false } },
  { domain: "demo.fengchao.life", name: "示范校", nameEn: "Demo School", relationship: "REL-000002", stage: "operating", saved: true, id: "STM-000003", status: "sent", amount: 1.67, currency: "USD", billable: 4, discount: 0, counts: { start: { total: 4, licensed: 4 }, end: { total: 4, licensed: 4 }, added: 0, removed: 0 }, reconstructed: { start: true, end: false } },
  { domain: "equipme.cloud", name: "Equip 教育社区", nameEn: "Equip Education Community", relationship: null, stage: null, saved: false, status: null, amount: 0, currency: "USD", billable: 275, discount: 0, counts: { start: { total: 280, licensed: 275 }, end: { total: 281, licensed: 276 }, added: 1, removed: 0 }, reconstructed: { start: false, end: false } },
];
// A period statement (Rick 2026-10-13): Aug + Sep of the same school; Aug had 35 licensed on the 1st, Sep 37.
const STM_PERIODS = [];
const stmPeriod = { saved: false, status: null, id: null, discount: 3, unitPriceYear: 5, discountPct: 0 };
function stmPeriodDetail(row, from, to) {
  const disc = stmPeriod.discount, price = stmPeriod.unitPriceYear, pct = stmPeriod.discountPct;
  const mk = (month, start, billable, added, removed) => { const d = Math.min(disc, billable); const sub = Math.round((billable - d) * price / 12 * 100) / 100; return { month, period: { start: month + "-01", end: (month === "2026-08" ? "2026-09" : "2026-10") + "-01" }, counts: { start: { total: start, licensed: billable, student: 20, faculty: 15, disabled: 0 }, end: { total: start + added - removed, licensed: billable + 1, student: 21, faculty: 16, disabled: 0 }, added, removed }, billable, discount: d, subtotal: sub, amount: Math.round(sub * (1 - pct / 100) * 100) / 100, added: Array.from({ length: added }, (_, i) => ({ upn: month.slice(5) + "new" + i + "@" + row.domain, displayName: "New " + month.slice(5) + "-" + i, plan: "student", created: month + "-1" + i + "T00:00:00Z" })), removed: Array.from({ length: removed }, (_, i) => ({ upn: month.slice(5) + "old" + i + "@" + row.domain, displayName: "Old " + month.slice(5) + "-" + i, plan: "student", removedAt: month + "-20T00:00:00Z" })), snapshots: { start: null, end: null }, reconstructed: { start: false, end: false } }; };
  const rows = [mk("2026-08", 36, 35, 2, 0), mk("2026-09", 39, 37, 4, 1)];
  const sum = (f) => Math.round(rows.reduce((a, r) => a + f(r), 0) * 100) / 100;
  return { id: stmPeriod.id, status: stmPeriod.saved ? stmPeriod.status : null, domain: row.domain, from, to, months: rows.length, period: { start: from + "-01", end: "2026-10-01" }, relationship: row.relationship, school: { domain: row.domain, name: row.name, nameEn: row.nameEn },
    counts: { start: rows[0].counts.start, end: rows[1].counts.end, added: 6, removed: 1 }, billable: 37, billableMonths: 72, discount: disc, discountPct: pct, unitPriceYear: price, currency: "USD", subtotal: sum(r => r.subtotal), amount: sum(r => r.amount),
    rows, added: [].concat(...rows.map(r => r.added)), removed: [].concat(...rows.map(r => r.removed)), snapshots: { start: null, end: null }, reconstructed: { start: false, end: false }, generatedAt: stmPeriod.saved ? "2026-10-02T01:00:00Z" : null, note: "", history: [] };
}
function stmDetail(row) {
  const disc = row.discount, price = row.unitPriceYear != null ? row.unitPriceYear : 5, pct = row.discountPct || 0;
  const c = row.counts;
  return { id: row.id || null, status: row.saved ? row.status : null, domain: row.domain, month: "2026-09", period: { start: "2026-09-01", end: "2026-10-01" }, relationship: row.relationship, school: { domain: row.domain, name: row.name, nameEn: row.nameEn },
    counts: { start: Object.assign({ student: 20, faculty: 17, disabled: 0 }, c.start), end: Object.assign({ student: 22, faculty: 18, disabled: 1 }, c.end), added: c.added, removed: c.removed },
    billable: row.billable, discount: disc, discountPct: pct, unitPriceYear: price, currency: "USD", subtotal: Math.round((row.billable - disc) * price / 12 * 100) / 100, amount: Math.round(Math.round((row.billable - disc) * price / 12 * 100) / 100 * (1 - pct / 100) * 100) / 100,
    added: Array.from({ length: c.added }, (_, i) => ({ upn: "new" + i + "@" + row.domain, displayName: "New " + i, plan: i % 2 ? "student" : "faculty", created: "2026-09-1" + i + "T00:00:00Z" })),
    removed: Array.from({ length: c.removed }, (_, i) => ({ upn: "old" + i + "@" + row.domain, displayName: "Old " + i, plan: "student", removedAt: "2026-09-20T00:00:00Z" })),
    reconstructed: row.reconstructed, generatedAt: row.saved ? "2026-10-02T01:00:00Z" : null, sentAt: row.status === "sent" ? "2026-10-03T01:00:00Z" : null, note: "", history: row.saved ? [{ at: "2026-10-02T01:00:00Z", by: "fin@equipme.cloud", action: "generated", discount: 0, amount: 1.67 }] : [] };
}
const acctEdits = [], licChanges = [];
const deleted = []; const writebacks = []; const digests = [];
const teamCreates = [], memberOps = [], scopePuts = [], teamOps = []; let teamPending = 0; // 新建 Teams 群组 (2026-10-16)
  const whenVal = (p, sel) => p.$eval(sel, r => { const q = c => r.querySelector(c); return r.classList.contains("allday") ? [q(".wsd").value, q(".wed").value] : [q(".wsd").value + "T" + q(".wst").value, q(".wed").value + "T" + q(".wet").value]; });
  async function shot(name, w, h, hash, lang, rolesList, act) {
    if (process.env.ONLY && !new RegExp(process.env.ONLY).test(name)) return; // e.g. ONLY=calendar node test/ui/smoke.js
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    page.on("pageerror", e => errs.push(name + ": " + e.message + " @ " + String(e.stack || "").split("\n").slice(1, 3).join(" | ")));
    page.on("console", m => { if (m.type() === "error" && !/status of (403|409)/.test(m.text())) errs.push(name + " console: " + m.text()); });
    const acc = crm.accessMap(rolesList);
    const me = Object.assign({}, summary, { roles: rolesList.filter(x => !/^x:/.test(x)), crm: acc });
    if (rolesList.indexOf("x:teacher") >= 0) me.hive = Object.assign({}, me.hive, { teacherId: "recTEACH000000001" });
    // x:provider — the leader of a hive's domain (kxc.edu): me/summary names the hive, crm has no level for them
    const provider = rolesList.indexOf("x:provider") >= 0 && acc.orders === "none";
    if (provider) me.hive = Object.assign({}, me.hive, { providerHives: [{ key: "KXC", name: "Kids X Center", abbr: "KXC", domain: "kxc.edu", via: "leader" }] });
    const isAdm = rolesList.indexOf("admin") >= 0;
    await page.route("**/api/**", r => {
      const u = new URL(r.request().url()); const p = u.pathname; let body = { error: "nf" }, status = 200;
      if (p === "/api/me/summary") body = me;
      else if (p === "/api/me/groups") body = groups;
      else if (p === "/api/domain/domains") body = isAdm || rolesList.some(x => /^staff:/.test(x)) ? domains : rolesList.some(x => /^domain_leader:/.test(x)) ? { user: me.profile.upn, roles: rolesList, all: false, mine: "bes.qiaoliang.online", domains: [Object.assign({}, domains.domains[0], { can: { view: false, methods: false, people: false, plan: true, calendar: true, calendarEdit: true, broadcastOptout: true, full: false, institutions: false } })], showDomains: false } : { user: me.profile.upn, roles: rolesList, all: false, mine: "bes.qiaoliang.online", domains: [], showDomains: false };
      else if (p === "/api/calendar" && r.request().method() === "GET") {
        const REM = [0, 5, 10, 15, 30, 60, 120, 1440, 2880, 10080];
        const calStaff = rolesList.some(x => /^staff:(community|curriculum)$/.test(x));
        if (u.searchParams.get("mine")) body = { layer: "mine", me: me.profile.upn, domain: "bes.qiaoliang.online", timezone: "Asia/Shanghai", school: { domain: "bes.qiaoliang.online", name: "北京某某学校", nameEn: "Beijing Example School" }, canEdit: false, reminders: REM, defaults: { reminder: 15, timeZone: "Asia/Shanghai" },
          calendar: { events: [{ id: "s-1", title: "家长会", allDay: false, start: "2026-12-10T19:00", end: "2026-12-10T20:00", timeZone: "Asia/Shanghai", audience: ["家长"], teams: [], people: [], location: "", description: "请准时", link: "https://zoom.us/j/555", meeting: "link", reminder: 15, showAs: "free", published: true, gone: false },
            { id: "s-2", title: "圣诞假期", allDay: true, start: "2026-12-24", end: "2026-12-26", timeZone: "Asia/Shanghai", audience: [], teams: [], people: [], location: "", description: "", link: "", meeting: "link", reminder: 1440, showAs: "free", published: false, gone: false }] },
          hive: { events: [Object.assign({}, CAL_SEED, { published: true, gone: false })] } };
        else if (u.searchParams.get("optout")) body = { domain: u.searchParams.get("domain"), items: BC_ITEMS, people: CAL_AUD.people.filter(x => u.searchParams.get("domain") === "*" || x.d === u.searchParams.get("domain")), canEdit: true };
        else if (u.searchParams.get("lookup") === "audience") body = { layer: u.searchParams.get("layer") || "school", optout: BC_ITEMS.map(x => x.upn), people: CAL_AUD.people.filter(x => u.searchParams.get("layer") === "hive" || x.d === "bes.qiaoliang.online"), teams: CAL_AUD.teams };
        else if (u.searchParams.get("layer") === "hive") body = { layer: "hive", hive: CAL_HIVE, canEdit: isAdm || calStaff, reminders: REM, defaults: { reminder: 15, timeZone: "Asia/Shanghai" } };
        else body = { layer: "school", domain: "bes.qiaoliang.online", school: { domain: "bes.qiaoliang.online", name: "北京某某学校", nameEn: "Beijing Example School" }, calendar: CAL_SCHOOL, hive: { events: CAL_HIVE.events.filter(e => e.targets.indexOf("*") >= 0 || e.targets.indexOf("bes.qiaoliang.online") >= 0) }, canEdit: rolesList.some(x => /^domain_leader:/.test(x)) || calStaff, reminders: REM, defaults: { reminder: 15, timeZone: CAL_SCHOOL.timezone || "Asia/Shanghai" } };
      }
      else if (p === "/api/calendar" && r.request().method() === "POST") {
        const b = JSON.parse(r.request().postData());
        if (b.op === "optout") { bcPosts.push(b); const i = BC_ITEMS.findIndex(x => x.upn === b.upn); if (b.on === false) { if (i >= 0) BC_ITEMS.splice(i, 1); body = { ok: true, item: null }; } else { const it = { upn: b.upn, reason: b.reason || "", at: new Date().toISOString(), by: me.profile.upn }; if (i >= 0) BC_ITEMS[i] = it; else BC_ITEMS.push(it); body = { ok: true, item: it }; } }
        else if (b.op === "syncdomains") body = { ok: true, domains: ["bes.qiaoliang.online"] };
        else if (b.op === "upload") { filePosts.push(b); const id = b.replace || b.id || "f" + String(filePosts.length).padStart(15, "0"); const done = b.index + 1 >= b.total; body = done ? { ok: true, id, done, file: { id, name: b.name, type: /\.pdf$/i.test(b.name) ? "application/pdf" : "image/png", size: b.size, url: "https://www.fengchao.life/api/f/" + id } } : { ok: true, id, done }; }
        else if (["syncplan", "sync", "withdraw"].includes(b.op)) {
          syncPosts.push(b);
          const failed = [{ key: "school:e-1", upn: "nomail@bes.qiaoliang.online", title: "家长会", reason: "no_mailbox", message: "" }];
          if (b.op === "syncplan") body = { ok: true, domain: b.domain, layer: b.layer || "school", counts: { create: 5, update: 0, delete: 0 }, remaining: 5, gone: 1, failed: [], accounts: 4, events: 1, written: 0 };
          else { const n = syncPosts.filter(x => x.op === b.op).length; body = n === 1 ? { ok: true, done: 3, failedNow: 0, remaining: 2, counts: { create: 2, update: 0, delete: 0 }, failed: [], gone: 1, created: 3, updated: 0, deleted: 0 } : { ok: true, done: 1, failedNow: 1, remaining: 0, counts: { create: 0, update: 0, delete: 0 }, failed, gone: 1, created: 1, updated: 0, deleted: 0 }; }
        } else {
        calPosts.push(b);
        const doc = b.layer === "hive" ? CAL_HIVE : CAL_SCHOOL;
        if (b.op === "delete") doc.events = doc.events.filter(e => e.id !== b.id);
        else if (b.op === "zone") doc.timezone = b.timezone;
        else { const ev = Object.assign({}, b.event, { id: b.event.id || "e-" + (doc.events.length + 1), createdBy: me.profile.upn }); const i = doc.events.findIndex(e => e.id === ev.id); if (i >= 0) doc.events[i] = ev; else doc.events.push(ev); if (b.layer !== "hive" && b.timezone && !doc.timezone) doc.timezone = b.timezone; }
        body = b.layer === "hive" ? { ok: true, hive: CAL_HIVE } : { ok: true, calendar: CAL_SCHOOL };
        }
      }
      else if (p === "/api/school-plan" && r.request().method() === "GET" && u.searchParams.get("view") === "1") body = { domain: "bes.qiaoliang.online", school: { domain: "bes.qiaoliang.online", name: "北京某某学校", nameEn: "Beijing Example School" }, plan: { published: PLAN_DOC.published || null }, defaults: PLAN_DEFAULTS, canEdit: false };
      else if (p === "/api/school-plan" && r.request().method() === "GET") body = { domain: "bes.qiaoliang.online", school: { domain: "bes.qiaoliang.online", name: "北京某某学校", nameEn: "Beijing Example School" }, plan: PLAN_DOC, defaults: PLAN_DEFAULTS, canEdit: true, isAdmin: isAdm };
      else if (p === "/api/school-plan" && r.request().method() === "PUT") { const b = JSON.parse(r.request().postData()); planPuts.push(b); const at = new Date().toISOString(); if (b.unpublish) PLAN_DOC = Object.assign({}, PLAN_DOC, { published: null, updatedAt: at }); else { const map = {}; Object.keys(b.map || {}).forEach(st => { map[st] = { grades: PLAN_DEFAULTS.map[st].grades, rows: (b.map[st].rows || []).map((row, i) => ({ id: row.id || "s" + i, order: i + 1, subjects: row.subjects, trackIds: row.trackIds || [], pedagogy: row.pedagogy || null, spanAll: !!row.spanAll, cells: Object.fromEntries(Object.entries(row.cells || {}).filter(([, v]) => String(v).trim()).map(([g, v]) => [g, String(v).split(/[;；\n]+/).map(x => x.trim()).filter(Boolean).map(x => { const i = x.indexOf("/"); return i < 0 ? { en: x, zh: null } : { en: x.slice(0, i).trim(), zh: x.slice(i + 1).trim() }; })])) })) }; }); PLAN_DOC = Object.assign({}, PLAN_DOC, { draft: { tracks: b.tracks || {}, map }, updatedAt: at, updatedBy: me.profile.upn }); if (b.publish) PLAN_DOC.published = Object.assign({}, PLAN_DOC.draft, { at, by: me.profile.upn }); } body = { ok: true, domain: "bes.qiaoliang.online", school: { domain: "bes.qiaoliang.online", name: "北京某某学校" }, plan: PLAN_DOC, defaults: PLAN_DEFAULTS }; }
      else if (p === "/api/domain/user" && r.request().method() === "POST") { const b = JSON.parse(r.request().postData()); createdUsers.push(b); const upn = b.account + "@" + b.domain; body = { ok: true, user: upn, id: "u-new", displayName: b.displayName || (b.givenName + " " + b.surname), password: "Hive-2026-xyz", mustChange: true, licence: CREATE_LICENCE, license: CREATE_LICENCE }; }
      else if (p === "/api/domain/user" && r.request().method() === "DELETE") { const b = JSON.parse(r.request().postData()); deleted.push(b); users.users = users.users.filter(u => u.upn !== b.user); dgroups.groups.forEach(g => { g.members = g.members.filter(m => m !== b.user); g.domainMembers = g.members.length; }); body = { ok: true, user: b.user, displayName: "Tom Li", restorableDays: 30 }; }
      else if (p === "/api/domain/identity-bulk") { const b = JSON.parse(r.request().postData()); idBulk.push(b); const picked = users.users.filter(x => x.enabled !== false).map(x => x.upn); body = { ok: true, dryRun: !!b.dryRun, identity: b.identity, scope: b.scope, writeBack: !!b.writeBack, count: picked.length, picked, written: b.dryRun ? [] : (b.writeBack ? picked : []), failed: [], skipped: [{ upn: "x@bes.qiaoliang.online", why: "student_plan" }] }; }
      else if (p === "/api/domain/users") { const demo = users.users.slice(0, 3).map(u => ({ ...u, upn: u.upn.replace("bes.qiaoliang.online", "demo.fengchao.life"), roles: [], hiveTeacher: null })); body = u.searchParams.get("domain") === "*" ? (() => { const all = users.users.map(x => ({ ...x, domain: "bes.qiaoliang.online" })).concat(demo.map(x => ({ ...x, domain: "demo.fengchao.life" }))); const opts = userList.parseQuery(Object.fromEntries(u.searchParams)); const pg = userList.page(all, opts, {}); usersPages.push(opts); return { domain: "*", domains: ["bes.qiaoliang.online", "demo.fengchao.life"], partial: false, sync: SYNC, users: pg.users, matched: pg.matched, offset: pg.offset, limit: pg.limit, counts: pg.counts, query: opts, timing: { shared: 12, schools: 30, page: 2, total: 44, schoolsRead: 2 } }; })() : /demo\.fengchao\.life/.test(u.search) ? { domain: "demo.fengchao.life", partial: false, sync: SYNC, users: demo } : users; }
      else if (p === "/api/domain/user" && r.request().method() === "GET") { const up = u.searchParams.get("upn"); const hit = users.users.find(x => x.upn === up); body = { domain: u.searchParams.get("domain"), user: hit || null, gone: !hit, profile: u.searchParams.get("full") && hit ? { givenName: "", surname: "", displayName: hit.displayName, jobTitle: hit.jobTitle || "", city: hit.city || "南京", postalCode: "210000", usageLocation: "CN", safeEmail: hit.safeEmail || "" } : null }; }
      else if (p === "/api/domain/user" && r.request().method() === "PATCH") { const b = JSON.parse(r.request().postData()); acctEdits.push(b); const hit = users.users.find(x => x.upn === b.user); if (b.jobTitle !== undefined) hit.jobTitle = b.jobTitle; if (b.displayName) hit.displayName = b.displayName; body = { ok: true, user: hit, changed: Object.keys(b).filter(k => k !== "domain" && k !== "user") }; }
      else if (p === "/api/domain/licenses") body = { usageLocation: "CN", faculty: { skuId: "f", name: "Office 365 A1 for faculty", total: 500, used: 12, free: 488 }, student: { skuId: "s", name: "Office 365 A1 for students", total: 1000, used: 990, free: 10 }, extras: [], a1: [] };
      else if (p === "/api/domain/licence") { const b = JSON.parse(r.request().postData()); licChanges.push(b); const hit = users.users.find(x => x.upn === b.user); hit.plan = b.plan; body = { ok: true, user: hit, plan: b.plan === "student" ? "Office 365 A1 for students" : "Office 365 A1 for faculty" }; } // the person panel's live re-read: unchanged here
      else if (p === "/api/domain/groupoptions") body = { domain: u.searchParams.get("domain"), types: [{ id: "class", zh: "班级团队", en: "Class", hintZh: "老师是所有者", hintEn: "Teachers own it", privacy: "hidden" }, { id: "plc", zh: "教师学习社区 (PLC)", en: "PLC", hintZh: "教师协作", hintEn: "Educators", privacy: "private" }, { id: "staff", zh: "教职员工团队", en: "Staff", hintZh: "行政", hintEn: "Admin", privacy: "private" }, { id: "standard", zh: "其它", en: "Other", hintZh: "社团", hintEn: "Clubs", privacy: "choose" }], tenantUsers: false, allowedByAdmin: false, canSetScope: true };
      else if (p === "/api/domain/usersearch") { const q = String(u.searchParams.get("q") || "").toLowerCase(); body = { users: users.users.filter(x => (x.displayName + x.upn).toLowerCase().includes(q)).slice(0, 6).map(x => ({ upn: x.upn, name: x.displayName })), tenant: false }; }
      else if (p === "/api/domain/groupscope") { const b = JSON.parse(r.request().postData()); scopePuts.push(b); body = { ok: true, domain: b.domain, tenantUsers: b.tenantUsers }; }
      else if (p === "/api/domain/groupop") { const b = JSON.parse(r.request().postData()); teamPending = 0; body = { ok: true, id: b.id, name: "Chess club", owners: b.owners.length, members: b.members.length, failed: [] }; }
      else if (p === "/api/domain/group" && r.request().method() === "POST") { const b = JSON.parse(r.request().postData()); teamCreates.push(b); body = b.name === "Slow team" ? { ok: true, pending: true, id: "55555555-5555-4555-8555-555555555555", op: "66666666-6666-4666-8666-666666666666", name: b.name } : { ok: true, id: "55555555-5555-4555-8555-555555555555", name: b.name, type: b.type, owners: b.owners.length, members: b.members.length, failed: [] }; }
      else if (p === "/api/domain/group" && r.request().method() === "GET") body = { domain: u.searchParams.get("domain"), tenantUsers: false, group: { id: u.searchParams.get("id"), name: "English Grade 5", description: "", visibility: "Private", kind: "team" }, owners: [{ id: "o1", upn: users.users[0].upn, name: users.users[0].displayName, domain: "bes.qiaoliang.online", editable: true }], members: [{ id: "o1", upn: users.users[0].upn, name: users.users[0].displayName, domain: "bes.qiaoliang.online", editable: true, owner: true }, { id: "m2", upn: users.users[1].upn, name: users.users[1].displayName, domain: "bes.qiaoliang.online", editable: true, owner: false }, { id: "m3", upn: "x@other.example.edu", name: "Xavier Other", domain: "other.example.edu", editable: false, owner: false }] };
      else if (p === "/api/domain/grouparchive") { const b = JSON.parse(r.request().postData()); teamOps.push(Object.assign({ op: "archive" }, b)); body = { ok: true, id: b.id, name: "English Grade 5", archived: b.archive }; }
      else if (p === "/api/domain/group" && r.request().method() === "DELETE") { const b = JSON.parse(r.request().postData()); teamOps.push(Object.assign({ op: "delete" }, b)); body = { ok: true, id: b.id, name: "English Grade 5", deleted: true }; }
      else if (p === "/api/domain/groupmembers") { const b = JSON.parse(r.request().postData()); memberOps.push(b); body = { ok: true, id: b.id, added: (b.addMembers || []).length + (b.addOwners || []).length, removed: (b.removeMembers || []).length + (b.removeOwners || []).length }; }
      else if (p === "/api/domain/groups") body = dgroups;
      else if (p === "/api/roles" && r.request().method() === "GET" && u.searchParams.get("q")) body = { people: peopleHits };
      else if (p === "/api/roles") body = r.request().method() === "GET" ? Object.assign({}, roles, { scope: isAdm ? "all" : "staff", hives: isAdm ? [{ key: "KXC", name: "Kids X Center", abbr: "KXC", domain: "kxc.edu" }, { key: "IEW", name: "IEW Inc.", abbr: "IEW", domain: "" }] : [] }) : { ok: true, entries: roles.entries };
      else if (p === "/api/me/session") body = { signedIn: true, user: me.profile.upn, idleSeconds: 1800, maxSeconds: 43200, startedAt: new Date().toISOString() };
      else if (p === "/api/crm/orders") body = ordersBody(acc, provider);
      else if (p === "/api/crm/extend") { const b = JSON.parse(r.request().postData()); extended.push(b); const i = ORDERS.findIndex(x => x.orderId === b.orderId); ORDERS[i] = crm.extend(ORDERS[i], me.profile.upn); body = { ok: true, order: orderView(ORDERS[i], acc, provider), next: nextFor(ORDERS[i], acc, provider, rolesList) }; }
      else if (p === "/api/courses/roster") { const id = u.searchParams.get("id"); const code = id === CO_ID ? "KXC-MATH-7" : null; if (!code) { status = 404; body = { error: "not on the website" }; } else { const rows = liveOrders().filter(o => crm.isLive(o)).flatMap(o => o.items.filter(it => it.code === code).map(it => ({ name: (it.child && it.child.name) || "", grade: (it.child && it.child.grade) || "", account: "", status: crm.statusOf(o), waitlist: !!it.waitlist, since: o.submittedAt }))); const enrolled = rows.filter(x => !x.waitlist), waitlist = rows.filter(x => x.waitlist); body = { course: { id, code, nameZh: "七年级数学", nameEn: "Grade 7 Mathematics", minSize: 8, maxSize: 10 }, enrolled, waitlist, counts: { enrolled: enrolled.length, paid: enrolled.filter(x => x.status === "paid" || x.status === "started").length, waitlist: waitlist.length }, at: new Date().toISOString() }; } }
      else if (p === "/api/crm/equip-orders") body = EQUIP_SYNCED ? { orders: EQUIP.map(o => Object.assign({}, o, acc.money === "none" ? { amount: null, received: null } : {})), status: { syncedAt: "2026-10-06T17:05:00Z", counts: { orders: EQUIP.length }, warnings: ["Customers: field \"CRM ID\" not found (crmId)"] }, access: acc } : { orders: [], status: { syncedAt: null, counts: null, warnings: [], configured: false }, access: acc };
      else if (p === "/api/crm/sync") { EQUIP_SYNCED = true; body = { ok: true, status: { syncedAt: new Date().toISOString(), counts: { orders: 2, items: 2, customers: 3, curriculums: 2, seminar: 1 }, warnings: ["Customers: field \"CRM ID\" not found (crmId)"] }, people: HUB.stats }; }
      else if (p === "/api/crm/people") { const canMerge = isAdm || acc.orders === "rw"; const famById = new Map((HUB.families || []).map(f => [f.id, f])); const opts = peopleList.parseQuery(Object.fromEntries(u.searchParams)); peoplePages.push(opts); const pg = peopleList.page(hubMod.withMarks(HUB.people, MARKS), opts); body = { people: pg.people.map(x => hubMod.maskPerson(x.familyId ? Object.assign({}, x, { family: famById.get(x.familyId) }) : x, acc)), matched: pg.matched, offset: pg.offset, limit: pg.limit, counts: pg.counts, query: opts, queue: canMerge ? HUB.queue : [], stats: Object.assign({}, HUB.stats, hubMod.markStats(HUB.people, MARKS)), generatedAt: HUB.generatedAt, sources: HUB.sources, access: acc, canMerge, canMark: isAdm || acc.identity === "rw", timing: { read: 5, page: 1, total: 6 } }; }
      else if (p === "/api/crm/person") { const x0 = HUB.people.find(x => x.crmId === u.searchParams.get("id")); if (!x0) { status = 404; body = { error: "not_found" }; } else { const x = hubMod.withMarks([x0], MARKS)[0]; const fam = (HUB.families || []).find(f => f.id === x.familyId); body = { person: hubMod.maskPerson(fam ? Object.assign({}, x, { family: fam }) : x, acc), access: acc }; } }
      else if (p === "/api/crm/email-replace") { const b = JSON.parse(r.request().postData()); const person = HUB.people.find(x => x.crmId === b.crmId); const em = hubMod.replaceEmailOf(person); if (b.status) MARKS.marks[em] = { status: b.status, by: "om", at: new Date().toISOString() }; else delete MARKS.marks[em]; body = { ok: true, mark: b.status ? Object.assign({ email: em }, MARKS.marks[em]) : null, stats: hubMod.markStats(HUB.people, MARKS) }; }
      else if (p === "/api/teachers/list") { const approver = isAdm || rolesList.indexOf("staff:curriculum") >= 0; const mineT = rolesList.indexOf("x:teacher") >= 0 ? "recTEACH000000001" : null; const leaderOf = rolesList.filter(x => /^domain_leader:/.test(x)).map(x => x.slice(14)).concat(provider ? ["kxc.edu"] : []); const vis = TEACHERS.filter(x => approver || leaderOf.includes(x.domain) || x.id === mineT); body = { teachers: vis.map(x => ({ id: x.id, name: x.name, teamsAccount: x.teamsAccount, domain: x.domain, organization: x.organization, photoUrl: (TWORK[x.id] && TWORK[x.id].draft.photo && TWORK[x.id].draft.photo.url) || x.photoUrl, hasBio: !!x.bio, hasExpertise: !!x.expertise, status: (TWORK[x.id] || {}).status || "", updatedAt: (TWORK[x.id] || {}).updatedAt || null, submittedAt: null, mine: x.id === mineT })), me: { teacher: mineT, approver, leaderOf } }; }
      else if (p === "/api/teachers/one") { const x = TEACHERS.find(t => t.id === u.searchParams.get("id")); const w = TWORK[x.id] || { recId: x.id, name: x.name, status: "", draft: { bio: x.bio, expertise: x.expertise, photo: null }, baseline: { bio: x.bio, expertise: x.expertise, photoUrl: x.photoUrl }, submitted: null, published: null, returned: null, history: [], updatedAt: null }; const approver = isAdm || rolesList.indexOf("staff:curriculum") >= 0; const canEdit = approver || rolesList.indexOf("x:teacher") >= 0 && x.id === "recTEACH000000001" || rolesList.includes("domain_leader:" + x.domain); body = Object.assign({}, w, { profile: { id: x.id, name: x.name, teamsAccount: x.teamsAccount, domain: x.domain, organization: x.organization, subjects: x.subjects, languages: x.languages, courseTypes: "", gradeLevels: x.gradeLevels, photoUrl: x.photoUrl }, canEdit, canApprove: approver }); }
      else if (p === "/api/teachers/field") { const b = JSON.parse(r.request().postData()); const x = TEACHERS.find(t => t.id === b.id); const w = TWORK[x.id] = TWORK[x.id] || { recId: x.id, name: x.name, status: "", draft: { bio: x.bio, expertise: x.expertise, photo: null }, baseline: { bio: x.bio, expertise: x.expertise, photoUrl: x.photoUrl }, submitted: null, published: null, returned: null, history: [], updatedAt: null }; w.draft[b.key] = b.value; w.status = "draft"; w.updatedAt = new Date().toISOString(); w.history.unshift({ at: w.updatedAt, by: me.profile.upn, action: "save", fields: [b.key] }); tPatches.push(b); body = { ok: true, status: "draft", updatedAt: w.updatedAt }; }
      else if (p === "/api/teachers/photo") { const b = JSON.parse(r.request().postData()); const w = TWORK[b.id]; tPhotos.push(b.data.length); w.draft.photo = { key: "teachers/work/" + b.id + ".jpg", url: "/assets/apple-touch-icon.png", at: new Date().toISOString() }; w.status = "draft"; w.updatedAt = w.draft.photo.at; body = { ok: true, photo: w.draft.photo, status: "draft" }; }
      else if (p === "/api/teachers/submit") { const b = JSON.parse(r.request().postData()); const w = TWORK[b.id]; w.status = "submitted"; w.submitted = { at: new Date().toISOString(), by: me.profile.upn }; w.history.unshift({ at: w.submitted.at, by: me.profile.upn, action: "submit" }); body = { ok: true, status: "submitted" }; }
      else if (p === "/api/teachers/approve") { const b = JSON.parse(r.request().postData()); const w = TWORK[b.id]; tApproved.push(b.id); w.status = "published"; w.published = { at: new Date().toISOString(), by: me.profile.upn, written: ["bio"] }; w.submitted = null; w.history.unshift({ at: w.published.at, by: me.profile.upn, action: "approve", fields: ["bio"] }); body = { ok: true, status: "published", written: ["bio"], skipped: [], airtable: true }; }
      else if (p === "/api/teachers/return") { const b = JSON.parse(r.request().postData()); const w = TWORK[b.id]; w.status = "draft"; w.returned = { at: new Date().toISOString(), by: me.profile.upn, comment: b.comment }; w.submitted = null; body = { ok: true, status: "draft" }; }
      else if (p === "/api/crm/merge") { const b = JSON.parse(r.request().postData()); merges.push(b); const pa = HUB.people.find(x => x.crmId === b.a), pb = HUB.people.find(x => x.crmId === b.b); const facetOf = (x) => { const f = x.facets || {}; return f.accounts && f.accounts[0] ? "account:" + f.accounts[0].upn : f.customers && f.customers[0] ? "customer:" + f.customers[0].recId : f.contacts && f.contacts[0] ? "contact:" + x.crmId : f.leads && f.leads[0] ? "lead:" + f.leads[0].recId : ""; }; const key = [facetOf(pa), facetOf(pb)].sort().join("|"); HUB_SRC.decisions.pairs[key] = { verdict: "same", manual: true }; merges[merges.length - 1].key = key; HUB = hubMod.build(Object.assign({}, HUB_SRC, { prev: HUB })); const merged = HUB.people.find(x => x.crmId === b.a || x.crmId === b.b); body = { ok: true, crmId: merged.crmId, stats: HUB.stats }; }
      else if (p === "/api/crm/queue") { const b = JSON.parse(r.request().postData()); verdicts.push(b); HUB_SRC.decisions.pairs[b.key] = { verdict: b.verdict }; HUB = hubMod.build(Object.assign({}, HUB_SRC, { prev: HUB })); body = { ok: true, stats: HUB.stats, queue: HUB.queue }; }
      else if (p === "/api/crm/writeback") { const b = JSON.parse(r.request().postData() || "{}"); writebacks.push(b); const pairs = HUB.people.flatMap(x => x.writeBack.map(id => ({ crmId: x.crmId, name: x.name, recId: id }))); if (b.dryRun) body = { ok: true, dryRun: true, count: pairs.length, preview: pairs }; else { pairs.forEach(pr => { const c = HUB_SRC.equip.customers.find(c => c.recId === pr.recId); if (c) c.crmId = pr.crmId; }); HUB = hubMod.build(Object.assign({}, HUB_SRC, { prev: HUB })); body = { ok: true, written: pairs.length, already: 0, conflicts: [], missing: 0, stats: HUB.stats }; } }
      else if (p === "/api/crm/digest") { if (r.request().method() === "POST") { digests.push(1); body = { ok: true, sent: true, to: ["obadiah.sun@equipme.cloud"], status: 202, total: 3 }; } else body = { summary: { total: 3 }, to: ["obadiah.sun@equipme.cloud"], text: "x", subject: "s", last: null, configured: true, channel: true }; }
      else if (p === "/api/crm/institutions") { if (r.request().method() === "POST") { const b = JSON.parse(r.request().postData()); const k = b.key || b.domain; if (typeof b.internal === "boolean") { const id = ptMod.orgIdFor(ORGS, k, {}); ORGS.orgs[id].internal = b.internal; body = { ok: true, internal: b.internal, orgId: id }; } else { PARTNERS[k] = { stage: b.stage, note: b.note, owner: b.owner, type: b.type, region: b.region, by: "pd", at: new Date().toISOString() }; body = { ok: true, partner: PARTNERS[k] }; } } else { const canEdit = isAdm || acc.partners === "rw"; const seeMoney = acc.money !== "none"; const relsOf = key => { const oid = ORGS.byKey[key]; return Object.values(REL.items).filter(x => x.party && x.party.kind === "org" && (x.party.key === key || (oid && x.party.id === oid))).map(x => ({ id: x.id, type: x.type, stage: x.stage, closed: !!x.closed, owner: x.owner || "" })); }; body = { rows: HUB.institutions.map(i => { const key = i.key || i.domain; const oid = ORGS.byKey[key]; return { key, domain: i.domain || "", kind: i.kind || "tenant", abbr: i.abbr || "", type: i.type || "", country: i.country || "", city: i.city || "", website: i.website || "", courses: i.courses || 0, name: i.name || (i.domain === "kxc.edu" ? "Kids X Center" : ""), nameEn: i.nameEn || "", partner: PARTNERS[key] || null, orgId: oid || null, internal: !!(oid && ORGS.orgs[oid].internal), rels: relsOf(key), accounts: i.accounts, active: i.active, people: i.people, customers: i.customers, buyers: i.buyers, leads: i.leads, families: i.families, orders: i.orders, hiveOrders: i.hiveOrders, spend: seeMoney ? i.spend : null, fyOrders: i.orders, fySales: seeMoney ? i.spend : null }; }), fy: 2026, canEdit, stages: ["contact", "trial", "partner", "paused"], types: ptMod.TYPES, stageLabels: Object.fromEntries(Object.entries(ptMod.STAGES).map(([t, st]) => [t, Object.fromEntries(st.map(x => [x.k, [x.zh, x.en]]))])), generatedAt: HUB.generatedAt, access: acc }; } }
      else if (p === "/api/crm/partners-seed") { const res = ptMod.seed({ institutions: HUB.institutions, people: HUB.people, publishers: [{ recId: "recPub1", name: "IEW" }], teachers: [], domainAdmins: { "xqzw.edu": ["enqi.bao@xqzw.edu"] }, oldPartners: PARTNERS }, { rels: REL, orgs: ORGS }, { exclude: ptMod.DEFAULT_EXCLUDE }, me.profile.upn, Date.now()); seeds.push(res); body = { ok: true, created: res.created, excluded: res.excluded, skipped: res.skipped.length, at: res.at }; }
      else if (p === "/api/crm/entry") { const b = JSON.parse(r.request().postData()); entries.push(b); body = { ok: true, orderId: "H-20261008-TEST", orderRec: "recNEWO", customerRec: b.customer.recId || "recNEWC", newCustomer: !!b.customer.new, lines: b.items.length, status: {} }; }
      else if (p === "/api/crm/received") { const b = JSON.parse(r.request().postData()); received.push(b); body = { ok: true }; }
      else if (p === "/api/crm/feed") body = { feed: [{ at: "2026-10-08T01:00:00Z", action: "crm.entry.order", by: "obadiah.sun@equipme.cloud", orderId: "H-20261008-AB12", newCustomer: true }, { at: "2026-10-07T20:00:00Z", action: "crm.order.status", by: "obadiah.sun@equipme.cloud", orderId: "FC-20261002-KXC-002", from: "submitted", to: "confirmed" }, { at: "2026-10-07T17:05:00Z", action: "crm.equip.sync", actor: "scheduler", counts: { orders: 520 } }], access: acc };
      else if (p === "/api/crm/statements") { const canEdit = isAdm || acc.money === "rw"; body = { month: "2026-09", period: { start: "2026-09-01", end: "2026-10-01" }, canEdit, defaultMonth: "2026-09", price: 5, currency: "USD", totals: { amount: STM_ROWS.filter(r => r.relationship).reduce((s2, r) => s2 + r.amount, 0), billable: 41 }, rows: STM_ROWS, periods: STM_PERIODS }; }
      else if (p === "/api/crm/statement" && r.request().method() === "GET") { const d = u.searchParams.get("domain"); const row = STM_ROWS.find(x => x.domain === d); const from = u.searchParams.get("from"), to = u.searchParams.get("to"); body = from ? { saved: !!stmPeriod.saved, canEdit: isAdm || acc.money === "rw", statement: stmPeriodDetail(row, from, to) } : { saved: !!row.saved, canEdit: isAdm || acc.money === "rw", statement: stmDetail(row) }; }
      else if (p === "/api/crm/statement" && r.request().method() === "POST") { const b = JSON.parse(r.request().postData()); stmPosts.push(b); const row = STM_ROWS.find(x => x.domain === b.domain); if (b.from) { if (b.op === "generate") { stmPeriod.saved = true; stmPeriod.status = "draft"; stmPeriod.id = "STM-000009"; stmPeriod.discount = +b.discount; stmPeriod.unitPriceYear = +b.unitPriceYear; stmPeriod.discountPct = +b.discountPct; STM_PERIODS.length = 0; STM_PERIODS.push({ id: "STM-000009", domain: b.domain, from: b.from, to: b.to, months: 2, status: "draft", amount: stmPeriodDetail(row, b.from, b.to).amount, currency: "USD", name: row.name, nameEn: row.nameEn }); } else stmPeriod.status = b.status; body = { ok: true, statement: stmPeriodDetail(row, b.from, b.to) }; } else { if (b.op === "generate") { row.saved = true; row.status = "draft"; row.id = "STM-000007"; row.discount = +b.discount; row.unitPriceYear = +b.unitPriceYear; row.discountPct = +b.discountPct; row.amount = stmDetail(row).amount; } else row.status = b.status; body = { ok: true, statement: stmDetail(row) }; } }
      else if (p === "/api/crm/licenses") { const canEdit = isAdm || acc.drm === "rw"; const regionOf = d => (PARTNERS[d] && PARTNERS[d].region) || "other"; if (r.request().method() === "POST") { if (!canEdit) { status = 403; body = { error: "no_access" }; } else { const b = JSON.parse(r.request().postData()); try { const res = b.op === "pool" ? licMod.createPool(LIC, b, "om") : b.op === "allocate" ? licMod.allocate(LIC, b, "om") : licMod.revoke(LIC, b.id, "om"); body = { ok: true, result: res, view: licMod.view(LIC, { regionOf }) }; } catch (e) { status = 400; body = { error: e.code, message: e.message, balance: e.balance }; } } } else if (u.searchParams.get("person")) body = { allocations: LIC.allocations.filter(a => a.to.type === "person" && a.to.crmId === u.searchParams.get("person")).map(a => Object.assign({}, a, { pool: LIC.pools.find(p => p.id === a.poolId) })) }; else body = Object.assign(licMod.view(LIC, { regionOf }), { canEdit, regions: licMod.REGIONS, instTypes: licMod.INST_TYPES, access: acc }); }
      else if (p === "/api/crm/catalogue") body = { skus: [{ sku: "IEW-SSS1A-FP", nameZh: "IEW 结构和风格 1A - 全套", nameEn: "IEW SSS 1-A", publisher: "IEW", category: "Curriculum", available: true, price: 648, lastSale: "2026-10-01", unitsEver: 2 }, { sku: "CEFF-CSB", nameZh: "儿童圣经故事", nameEn: "The Child's Story Bible", publisher: "CEFF", category: "Curriculum", available: true, lastSale: "2026-09-12", unitsEver: 53 }, { sku: "OLD-1", nameZh: "旧教材", nameEn: "Old title", publisher: "CAP", category: "Curriculum", available: true, lastSale: "2024-03-01", unitsEver: 4 }, { sku: "OLD-2", nameZh: "从未卖出", nameEn: "Never sold", publisher: "CAP", category: "Pre-recorded", available: true, lastSale: null, unitsEver: 0 }, { sku: "GONE", nameZh: "下架", nameEn: "Withdrawn", publisher: "CAP", category: "Curriculum", available: false, lastSale: null, unitsEver: 0 }], syncedAt: "2026-10-06T17:05:00Z" };
      else if (p === "/api/crm/royalty") { if (r.request().method() === "POST") { const b = JSON.parse(r.request().postData()); const key = (b.key || b.publisher) + "|" + b.quarter; if (b.paid) ROY_PAID[key] = { by: "fin", at: new Date().toISOString(), amount: b.amount }; else delete ROY_PAID[key]; body = { ok: true, key, mark: ROY_PAID[key] || null }; } else { const canPay = acc.money === "rw"; if (!canPay && !rolesList.includes("staff:ceo")) { status = 403; body = { error: "no_access" }; } else body = Object.assign(royaltyMod.build({ syncedAt: "2026-10-06T17:05:00Z", curriculums: [{ sku: "IEW-SSS1A-FP", publisher: "IEW", royaltyRate: 0.15, royaltyRecipient: "IEW Inc." }, { sku: "CEFF-CSB", publisher: "CEFF", royaltyRate: 0 }], orders: EQUIP }, { quarters: 4 }), { paid: ROY_PAID, canPay }); } }
      else if (p === "/api/crm/people-rebuild") { rebuilds++; HUB = hubMod.build(Object.assign({}, HUB_SRC, { prev: HUB })); body = { ok: true, stats: HUB.stats, generatedAt: HUB.generatedAt }; }
      else if (p === "/api/crm/import") { const b = JSON.parse(r.request().postData()); imported.push(b); body = { ok: true, dryRun: !!b.dryRun, messages: b.messages.length, parsed: 2, created: ["FC-20260831-KXC-001", "FC-20260901-WHA-002"], existing: [], skipped: [{ id: "x" }] }; }
      else if (p === "/api/crm/import-teams") { const b = JSON.parse(r.request().postData() || "{}"); teamsCalls.push(b); if (!TEAMS_OK) { status = 403; body = { error: "teams_forbidden", team: "Hive Orders", channel: "CEFF" }; } else body = { ok: true, dryRun: !!b.dryRun, team: "Hive Orders", channels: ["General", "CEFF"], messages: 12, parsed: 5, created: ["FC-20260929-CAP-001"], existing: [], skipped: [] }; }
      else if (p === "/api/domain/groupnames-fill") { fillCalls.push(JSON.parse(r.request().postData())); body = { ok: true, filled: [{ id: "g2", zh: "五年级数学", en: "Math Grade 5" }] }; }
      else if (p === "/api/domain/groupname") { groupNamed.push(JSON.parse(r.request().postData())); body = { ok: true }; }
      else if (p === "/api/crm/classes") { ORDERS[1].items[1].waitlist = ORDERS[1].items[1].waitlist !== false; const seatsMod = require("../../api/shared/seats"); const live = seatsMod.seatsFor(seatsMod.countOrders(ORDERS), [{ code: "KXC-MATH-7", nameZh: "七年级数学", nameEn: "Grade 7 Mathematics", minSize: 8, maxSize: 10, school: { abbr: "KXC" } }, { code: "KXC-SCI-7", nameZh: "七年级科学", nameEn: "Grade 7 Science", minSize: null, maxSize: 5, school: { abbr: "KXC" } }]); const classes = Object.keys(live).map(code => Object.assign({ code, nameZh: code === "KXC-MATH-7" ? "七年级数学" : "七年级科学", nameEn: code === "KXC-MATH-7" ? "Grade 7 Mathematics" : "Grade 7 Science", school: "KXC", orders: liveOrders().filter(o => seatsMod.ALIVE.has(o.status) && (!provider || o.hives.some(h => PROVIDER_KEYS.includes(h.key)))).flatMap(o => o.items.filter(it => it.code === code && !it.cancelled).map(it => ({ orderId: o.orderId, status: crm.statusOf(o), submittedAt: o.submittedAt, email: provider ? o.email : crm.mask(o, acc).email, waitlist: !!it.waitlist, child: it.child || null, contact: o.contact || null }))) }, live[code])); body = { classes, at: new Date().toISOString() }; }
      else if (p === "/api/crm/cancel-term") { const b = JSON.parse(r.request().postData()); termCancels.push(b); const done = []; for (const o of liveOrders()) { if (!crm.isLive(o) || !o.items.some(it => it.code === b.code && !it.cancelled)) continue; o.items.forEach(it => { if (it.code === b.code) it.cancelled = { at: new Date().toISOString(), by: me.profile.upn, reason: b.reason }; }); if (o.items.every(it => it.cancelled)) o.status = "cancelled"; done.push(o.orderId); } body = { ok: true, code: b.code, cancelled: done, failed: [] }; }
      else if (p === "/api/crm/seat") { const b = JSON.parse(r.request().postData()); seated.push(b); const o = ORDERS.find(x => x.orderId === b.orderId); o.items.forEach(it => { if (it.code === b.code) it.waitlist = b.waitlist; }); body = { ok: true, order: crm.mask(o, acc) }; }
      else if (p === "/api/crm/order" && r.request().method() === "GET") { const o = liveOrders().find(x => x.orderId === u.searchParams.get("id")); if (provider && !o.hives.some(h => PROVIDER_KEYS.includes(h.key))) { status = 404; body = { error: "not_found" }; } else body = { order: orderView(o, acc, provider), next: nextFor(o, acc, provider, rolesList), provider }; }
      else if (p === "/api/crm/order" && r.request().method() === "PATCH" && JSON.parse(r.request().postData()).code !== undefined) { const b = JSON.parse(r.request().postData()); patched.push(b); const o = ORDERS.find(x => x.orderId === b.orderId); o.items.forEach(it => { if (it.code === b.code) it.child = b.child; }); body = { ok: true, order: orderView(o, acc, provider), next: nextFor(o, acc, provider, rolesList), provider }; }
      else if (p === "/api/crm/order" && r.request().method() === "PATCH") { const b = JSON.parse(r.request().postData()); patched.push(b); const i = ORDERS.findIndex(x => x.orderId === b.orderId); ORDERS[i] = crm.transition(ORDERS[i], b.status, me.profile.upn, b.note, rolesList, null, provider ? crm.providerNext(ORDERS[i].status) : null); if (b.status === "paid") { ORDERS[i] = crm.withCommission(ORDERS[i]); if (!provider) ORDERS[i].history[ORDERS[i].history.length - 1].via = "hive"; } body = { ok: true, order: orderView(ORDERS[i], acc, provider), next: nextFor(ORDERS[i], acc, provider, rolesList), provider }; }
      else if (p === "/api/crm/partners") { const type = u.searchParams.get("type") || "it"; const canEdit = isAdm || acc.partners === "rw"; if (!ptMod.TYPES[type]) { status = 400; body = { error: "bad_type" }; } else { const projects = Object.values(PRJ.items); const rows = ptMod.listByType(REL, type, {}, Date.now(), u.searchParams.get("all") === "1").map(x => ptRow(x, projects)); const counts = {}; for (const t of ptMod.visibleTypes()) counts[t] = Object.values(REL.items).filter(x => x.type === t && !x.closed).length; body = { type, rows, summary: ptMod.summary(rows, Date.now()), stages: ptMod.STAGES[type], kinds: ptMod.PROJECT_KINDS[type], contactRoles: ptMod.CONTACT_ROLES[type], regions: ptMod.REGION_LABELS, types: ptMod.TYPES, counts, canEdit, access: acc }; } }
      else if (p === "/api/crm/partner" && r.request().method() === "GET") { const rel = REL.items[u.searchParams.get("id")]; if (!rel) { status = 404; body = { error: "not_found" }; } else { const projects = Object.values(PRJ.items).filter(x => x.relationship === rel.id); body = { relationship: ptRow(Object.assign({}, rel, { health: ptMod.health(rel, Date.now(), {}) }), projects), projects, stages: ptMod.STAGES[rel.type], kinds: ptMod.PROJECT_KINDS[rel.type], contactRoles: ptMod.CONTACT_ROLES[rel.type], canEdit: isAdm || acc.partners === "rw", access: acc }; } }
      else if (p === "/api/crm/partner") { const b = JSON.parse(r.request().postData()); ptPosts.push(b); if (b.op === "create") { let party = null; if (b.party && b.party.key) { const i = ptOrgIdx().get(b.party.key); ptMod.orgIdFor(ORGS, b.party.key, { name: i ? i.name : b.party.name }); party = { id: ORGS.byKey[b.party.key], key: b.party.key, name: i ? i.name : b.party.name }; } else if (b.party && b.party.id) { const pe = HUB.people.find(x => x.crmId === b.party.id); party = pe ? { id: pe.crmId, name: pe.name } : null; } try { const id = ptMod.pad(REL.next++); REL.items[id] = ptMod.newRelationship(Object.assign({}, b, { party }), me.profile.upn, id); body = { ok: true, relationship: REL.items[id] }; } catch (e) { status = 400; body = { error: e.code || "bad" }; } }
        else { const rel = REL.items[b.id]; const now = new Date().toISOString(); if (!rel) { status = 404; body = { error: "not_found" }; } else if (b.op === "move") { const chk = ptMod.moveCheck(rel, b.to, b, Object.values(PRJ.items)); if (!chk.ok) { status = 409; body = { error: chk.error, problems: chk.problems }; } else { if (b.contacts) rel.contacts = ptMod.cleanContacts(b.contacts); if (chk.stage.handover && b.owner) rel.owner = b.owner; rel.log.push(ptMod.logEntry(me.profile.upn, "stage", b.reason || "", { from: rel.stage, to: b.to, back: chk.backward || undefined })); rel.stage = b.to; rel.stageAt = now; rel.stageBy = me.profile.upn; if (chk.stage.closed) rel.closed = { at: now, reason: b.reason, by: me.profile.upn }; const nx = ptMod.cleanNext(b.next); if (nx) rel.next = nx; body = { ok: true, relationship: rel }; } }
        else if (b.op === "update") { const f = b.fields || {}; if (f.region) rel.region = f.region; if (f.currency) rel.currency = f.currency; if (f.lang) rel.lang = f.lang; if (typeof f.owner === "string") rel.owner = f.owner; if ("next" in f) rel.next = ptMod.cleanNext(f.next); if ("agreement" in f) rel.agreement = ptMod.cleanAgreement(f.agreement); if ("terms" in f) rel.terms = ptMod.cleanTerms(f.terms); if ("contacts" in f) { rel.contacts = ptMod.cleanContacts(f.contacts); rel.log.push(ptMod.logEntry(me.profile.upn, "contacts", rel.contacts.map(c => c.name).join(", "))); } body = { ok: true, relationship: rel }; }
        else if (b.op === "note") { rel.log.push(ptMod.logEntry(me.profile.upn, "note", b.text, { via: b.via })); body = { ok: true, relationship: rel }; }
        else if (b.op === "close") { rel.closed = { at: now, reason: b.reason, by: me.profile.upn, stage: rel.stage }; rel.log.push(ptMod.logEntry(me.profile.upn, "closed", b.note || "", { reason: b.reason })); body = { ok: true, relationship: rel }; }
        else if (b.op === "reopen") { rel.stage = rel.closed.stage || rel.stage; rel.closed = null; rel.stageAt = now; body = { ok: true, relationship: rel }; }
        else { status = 400; body = { error: "bad_op" }; } } }
      else if (p === "/api/crm/project") { const b = JSON.parse(r.request().postData()); ptPosts.push(b); if (b.op === "create") { const rel = REL.items[b.relationship]; const id = ptMod.padP(PRJ.next++); PRJ.items[id] = ptMod.newProject(rel, b, me.profile.upn, id); rel.log.push(ptMod.logEntry(me.profile.upn, "project", PRJ.items[id].name, { project: id })); body = { ok: true, project: PRJ.items[id] }; }
        else { const pj = PRJ.items[b.id]; if (!pj) { status = 404; body = { error: "not_found" }; } else { if (b.op === "status") { if (b.status === "completed" && pj.milestones.some(m => m.kind === "gate" && !m.doneAt)) { status = 409; body = { error: "gates_open" }; } else { pj.log.push(ptMod.logEntry(me.profile.upn, "status", "", { from: pj.status, to: b.status })); pj.status = b.status; body = { ok: true, project: pj }; } } else if (b.op === "milestone") { const m = pj.milestones.find(x => x.id === b.mid); if ("done" in b) m.doneAt = b.done ? new Date().toISOString().slice(0, 10) : ""; if ("due" in b) m.due = b.due; body = { ok: true, project: pj }; } else if (b.op === "addMilestone") { pj.milestones.push({ id: "m" + (pj.milestones.length + 1), name: b.name, nameEn: b.name, kind: "deliverable", due: b.due || "", doneAt: "", owner: "", note: "" }); body = { ok: true, project: pj }; } else if (b.op === "delete") { if (pj.status === "completed" || pj.milestones.some(m => m.doneAt)) { status = 409; body = { error: "has_progress" }; } else { delete PRJ.items[b.id]; body = { ok: true, project: null, deleted: true }; } } else if (b.op === "removeMilestone") { pj.milestones = pj.milestones.filter(x => x.id !== b.mid); body = { ok: true, project: pj }; } else if (b.op === "update") { Object.assign(pj, b.fields.participants ? { participants: ptMod.cleanContacts(b.fields.participants) } : {}, b.fields.name ? { name: b.fields.name } : {}); body = { ok: true, project: pj }; } else if (b.op === "note") { pj.log.push(ptMod.logEntry(me.profile.upn, "note", b.text)); body = { ok: true, project: pj }; } else { status = 400; body = { error: "bad_op" }; } } } }
      else if (p === "/api/crm/people-search") { const q = (u.searchParams.get("q") || "").toLowerCase(); body = { people: HUB.people.filter(x => [x.name, x.crmId].concat(x.keys).some(k => String(k || "").toLowerCase().includes(q))).slice(0, 12).map(x => ({ crmId: x.crmId, name: x.name, email: x.primaryEmail, upn: (x.facets.accounts[0] || {}).upn || "", identity: (x.facets.accounts[0] || {}).identity || (x.sources.contact ? "外部" : ""), org: (x.facets.accounts[0] || {}).domain || "", stage: x.stage })) }; }
      else if (p === "/api/crm/org-search") { const q = (u.searchParams.get("q") || "").toLowerCase(); body = { orgs: HUB.institutions.filter(i => !q || [i.key, i.domain, i.name, i.nameEn, i.abbr].some(k => String(k || "").toLowerCase().includes(q))).slice(0, 15).map(i => ({ key: i.key || i.domain, name: i.name || i.nameEn || i.key, nameEn: i.nameEn || "", domain: i.domain || "", kind: i.kind, type: i.type || "", region: i.region || "", country: i.country || "", orgId: ORGS.byKey[i.key || i.domain] || null })) }; }
      else if (p === "/api/crm/contact") { const b = JSON.parse(r.request().postData()); CONTACTS.push(b); const email = String(b.email || "").toLowerCase(); let pe = HUB.people.find(x => x.keys.includes(email)); if (!pe) { const id = "HC-" + String(HUB.nextId++).padStart(6, "0"); pe = { crmId: id, name: b.name, keys: [email], emails: [{ email, tier: "safe", upn: false }], primaryEmail: email, primaryTier: "safe", stage: "lead", orders: 0, spend: 0, hiveOrders: 0, hiveTotal: 0, sources: { contact: true }, facets: { customers: [], accounts: [], leads: [], hive: [], contacts: [{ email, name: b.name, org: b.org }] }, writeBack: [] }; HUB.people.push(pe); body = { ok: true, person: { crmId: id, existing: false, name: b.name, email } }; } else body = { ok: true, person: { crmId: pe.crmId, existing: true, name: pe.name, email } }; }
      else if (p.startsWith("/api/courses/")) {
        const act = p.slice("/api/courses/".length), m = r.request().method(), appr = rolesList.some(x => /^staff:(curriculum|ceo|sysadmin)$/.test(x) || x === "admin"), viewer = rolesList.includes("staff:community");
        const view = () => Object.assign({}, CO_DOC, { baseline: appr ? { nameEn: "Biology", nameZh: "生物", descriptionEn: "Cells and life.", classTime: "P3 10:00–10:45", price: 300 } : undefined, history: CO_DOC.history.slice().reverse() });
        const editable = {}; for (const k of Object.keys(CO_DOC.fields)) editable[k] = appr || !["textbooks", "teachers", "school", "tracks", "price", "available", "comments"].includes(k);
        if (act === "list") body = { courses: [Object.assign(coListRow(), provider ? { owned: true } : {})].concat(appr || viewer ? [{ id: "recCOURSE00000002", code: "IEW-W-1", nameEn: "Writing 1", nameZh: "写作 1", school: "IEW", teachers: [], subjects: [], available: true, status: "published", updatedAt: "2026-10-01T00:00:00Z", assigned: [] }] : []), me: { approver: appr, viewer, provider: provider ? PROVIDER_KEYS : [] }, sync: { pending: false } };
        else if (act === "lookups") body = Object.assign({}, CO_LOOK, { teachers: CO_LOOK.teachers.map(t => appr ? t : { id: t.id, name: t.name }) });
        else if (act === "course") body = { course: view(), assigned: CO_ASSIGNED, editable, translation: coTranslation(), needs: coNeeds() };
        else if (act === "field" && m === "PATCH") { const b = JSON.parse(r.request().postData()); coPatches.push(b); if (!editable[b.key]) { status = 403; body = { error: "read only" }; } else { CO_DOC.fields[b.key] = b.value; if (/(En|Zh)$/.test(b.key)) CO_DOC.meta.machine[b.key] = false; CO_DOC.draftAt = new Date().toISOString(); if (CO_DOC.status === "published" || CO_DOC.status === "returned") CO_DOC.status = "draft"; body = { savedAt: CO_DOC.draftAt, status: CO_DOC.status, meta: CO_DOC.meta, translation: coTranslation(), needs: coNeeds() }; } }
        else if (act === "op") { const b = JSON.parse(r.request().postData()); coOps.push(b); const at = new Date().toISOString();
          if (b.op === "assign") { CO_ASSIGNED.push({ name: b.person.name, upn: b.person.upn, crmId: b.person.crmId }); body = { ok: true, assigned: CO_ASSIGNED }; }
          else if (b.op === "unassign") { CO_ASSIGNED = CO_ASSIGNED.filter(x => x.upn !== b.person.upn); body = { ok: true, assigned: CO_ASSIGNED }; }
          else if (b.op === "translate") { const done = []; if (b.all) { for (const k of ["name", "description"]) { const src = k + (b.from === "en" ? "En" : "Zh"), dst = k + (b.from === "en" ? "Zh" : "En"); if ((CO_DOC.fields[src] || "").trim()) { CO_DOC.fields[dst] = (dst.endsWith("Zh") ? "【译】" : "[tr] ") + CO_DOC.fields[src]; CO_DOC.meta.machine[dst] = true; done.push(dst); } } } else for (const [src, dst] of [["descriptionEn", "descriptionZh"], ["nameEn", "nameZh"], ["descriptionZh", "descriptionEn"], ["nameZh", "nameEn"]]) { if ((CO_DOC.fields[src] || "").trim() && !CO_DOC.meta.machine[src] && !(CO_DOC.fields[dst] || "").trim()) { CO_DOC.fields[dst] = (dst.endsWith("Zh") ? "【译】" : "[tr] ") + CO_DOC.fields[src]; CO_DOC.meta.machine[dst] = true; done.push(dst); } } CO_DOC.history.unshift({ at, by: me.profile.upn, action: "translate", fields: done }); body = { ok: true, done, course: view(), translation: coTranslation(), needs: coNeeds() }; }
          else if (b.op === "submit") { if (coNeeds()) { status = 400; body = { error: "please complete the course first", problems: ["descriptionZh: Chinese text is missing"] }; } else { CO_DOC.status = "submitted"; CO_DOC.submitted = { at, by: me.profile.upn, note: b.note || "" }; CO_DOC.history.unshift({ at, by: me.profile.upn, action: "submit", note: b.note || "", ref: "v:" + at }); body = { ok: true, course: view() }; } }
          else if (b.op === "withdraw") { CO_DOC.status = "draft"; CO_DOC.history.unshift({ at, by: me.profile.upn, action: "withdraw" }); body = { ok: true, course: view() }; }
          else if (b.op === "return") { if (!b.comment) { status = 400; body = { error: "a comment is required" }; } else { CO_DOC.status = "returned"; CO_DOC.returned = { at, by: me.profile.upn, comment: b.comment }; CO_DOC.history.unshift({ at, by: me.profile.upn, action: "return", note: b.comment, ref: "v:" + at }); body = { ok: true, course: view() }; } }
          else if (b.op === "publish") { CO_DOC.status = "published"; CO_DOC.published = { at, by: me.profile.upn, written: ["descriptionZh"] }; CO_DOC.history.unshift({ at, by: me.profile.upn, action: "publish", fields: ["descriptionZh"], ref: "p:" + at }); body = { ok: true, course: view(), written: ["descriptionZh"], skipped: [], at }; }
          else if (b.op === "milestone") { CO_DOC.history.unshift({ at, by: me.profile.upn, action: "milestone", note: b.note || "", ref: "v:" + at }); body = { ok: true, course: view() }; }
          else if (b.op === "restore") { CO_DOC.fields.classTime = "P3 10:00–10:45 (restored)"; CO_DOC.status = "draft"; CO_DOC.history.unshift({ at, by: me.profile.upn, action: "restore", note: b.ref, ref: "v:" + at }); body = { ok: true, course: view(), translation: coTranslation(), needs: coNeeds() }; }
          else { status = 400; body = { error: "unknown op" }; } }
        else if (act === "versions") body = { status: CO_DOC.status, items: CO_DOC.history.slice() };
        else if (act === "version") body = { ok: true, version: { at: "2026-10-18T02:00:00Z", by: "zhang@kxc.edu", fields: Object.assign({}, CO_DOC.fields, { classTime: "P2 9:00–9:45", descriptionZh: "" }) } };
        else if (act === "sync") body = m === "POST" ? { ran: true, status: 200, body: { counts: { courses: 1 } } } : { pending: false };
        else if (act === "people") { const q = (u.searchParams.get("q") || "").toLowerCase(); body = { people: [{ crmId: "P-2", name: "Li Laoshi", upn: "li@kxc.edu", identity: "老师", org: "kxc.edu" }, { crmId: "P-3", name: "No Account", upn: "", identity: "", org: "" }, { crmId: "P-4", name: "Li Other", upn: "li@other.edu", identity: "老师", org: "other.edu" }].filter(x => x.name.toLowerCase().includes(q) && (!provider || x.org === "kxc.edu")) }; }
        else status = 404;
      }
      else if (p === "/api/me/photo") return r.fulfill({ status: 204, body: "" });
      else if (p === "/api/data") body = { generatedAt: new Date().toISOString(), counts: { products: 12, posts: 8 }, courses: CATALOG, teacherProfiles: [] };
      else if (p === "/api/seats") body = { seats: { "KXC-MATH-HS-101": { taken: 10, waitlist: 0, min: null, max: 12, open: 2, state: "few" }, "BES-SCI-MS-201": { taken: 8, waitlist: 1, min: null, max: 8, open: 0, state: "full" } } };
      else if (p === "/api/me/orders" && r.request().method() === "GET") body = { orders: MY_ORDERS, addresses: [me.profile.upn, "h.safe@gmail.com"] };
      else if (p === "/api/me/orders" && r.request().method() === "PATCH" && JSON.parse(r.request().postData()).code !== undefined) { const b = JSON.parse(r.request().postData()); myPatches.push(b); const o = MY_ORDERS.find(x => x.orderId === b.orderId); o.items.forEach(it => { if (it.code === b.code) it.child = b.child; }); o.needsChild = o.items.some(it => !it.child); body = { ok: true, order: o }; }
      else if (p === "/api/me/orders" && r.request().method() === "PATCH") { const b = JSON.parse(r.request().postData()); myPatches.push(b); const o = MY_ORDERS.find(x => x.orderId === b.orderId); const want = b.status || "cancelled"; if (o && b.proof) o.proof = (o.proof || []).concat([{ i: (o.proof || []).length + 1, name: b.proof.name, type: b.proof.type }]); const st = crm.statusOf(o || {}); if (!o) status = 404; else if (want === "cancelled" ? st !== "submitted" : !(st === "submitted" || st === "contacted")) status = 409; else { o.history.push({ at: new Date().toISOString(), from: o.status, to: want }); o.status = want; o.canCancel = false; o.canConfirmPay = false; o.expiresAt = null; body = { ok: true, order: o }; } if (status !== 200) body = { error: "no" }; }
      else if (p === "/api/me/contact") body = { upn: me.profile.upn, displayName: me.profile.displayName, mail: "", safeEmail: "h.safe@gmail.com" };
      else status = 404;
      r.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    });
    await page.route("**/.auth/me", r => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ clientPrincipal: { identityProvider: "aad", userId: "x", userDetails: me.profile.upn, userRoles: ["anonymous", "authenticated"].concat(isAdm ? ["admin"] : []) } }) }));
    if (lang) await page.addInitScript(l => localStorage.setItem("fc-lang", l), lang);
    await page.goto(`http://127.0.0.1:${port}/management/${hash}`); await page.waitForTimeout(700);
    try { if (act) await act(page); } catch (e) { errs.push(name + ": " + e.message + " @ " + String(e.stack || "").split("\n").slice(1, 4).join(" | ")); }
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
    const ov = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    if (ov) errs.push(name + ": horizontal overflow");
    await ctx.close();
  }
  const SALES = ["staff:sales"];
  // 班级人数 (enrollment rules, 2026-10-20): per course from the orders; a waitlisted family can be seated
  await shot("orders-classes", 1280, 900, "#/ops/orders/classes", "zh", SALES, async p => {
    await p.waitForSelector("#cltable tr[data-code]");
    const txt = await p.$eval("#cltable", e => e.innerText);
    assert.ok(/七年级科学/.test(txt) && /候补/.test(txt) && /已满/.test(txt), "the science course is full with a waitlist: " + txt.slice(0, 200));
    assert.ok(/七年级数学/.test(txt) && /还差 \d+ 人开班/.test(txt), "the maths course is below its minimum");
    await p.click('#cltable tr[data-code="KXC-SCI-7"]'); await p.waitForTimeout(150);
    assert.ok(await p.$eval('#cltable tr[data-code="KXC-SCI-7"] + tr.cldetail', e => !e.hidden), "the row opens its orders");
    await p.screenshot({ path: OUT + "/orders-classes.png" });
    await p.click('#cltable button[data-seat][data-wl="0"]'); await p.waitForTimeout(500);
    assert.deepStrictEqual(seated[seated.length - 1], { orderId: ORDERS[1].orderId, code: "KXC-SCI-7", waitlist: false }, "递补 seats that family's item");
    assert.ok(!(await p.$$eval("#cltable tbody .tag", es => es.some(e => /候补/.test(e.textContent)))), "nobody left on the waitlist");
    // v3: seats in two tiers (confirmed / reserved) and 整期停开 — one reason, every live order loses the line
    assert.ok(/已确认 \/ 保留/.test(await p.$eval("#cltable thead", e => e.innerText)), "the two-tier column");
    const mathRow = await p.$eval('#cltable tr[data-code="KXC-MATH-7"]', e => e.innerText);
    assert.ok(/\b2\b[\s\S]*\/ \d/.test(mathRow), "maths: 2 confirmed (paid + started) and the reserved count: " + mathRow);
    const onDlg = d => d.accept(d.type() === "prompt" ? "未达开班人数" : undefined); p.on("dialog", onDlg);
    await p.click('#cltable button[data-cancel-term="KXC-MATH-7"]'); await p.waitForTimeout(700); p.off("dialog", onDlg);
    assert.deepStrictEqual(termCancels, [{ code: "KXC-MATH-7", reason: "未达开班人数" }], "cancel-term posted with the reason");
    assert.ok(/已停开：\d+ 单已通知/.test(await p.$eval("#flash", e => e.textContent)), "the count of families told");
    assert.ok(!(await p.$('#cltable tr[data-code="KXC-MATH-7"] button[data-seat]')), "no order left on the cancelled course's roster");
    ORDERS.forEach(o => o.items.forEach(it => { delete it.cancelled; })); ORDERS.forEach(o => { if (o.status === "cancelled" && o.history.slice(-1)[0].to !== "cancelled") o.status = o.history.slice(-1)[0].to; });
  });
  await shot("orders-zh", 1280, 900, "#/ops/orders/hive", "zh", SALES, async p => {
    const nav = await p.$eval("#nav", e => e.innerText); if (!/经营[\s\S]*订单/.test(nav)) throw new Error("no 经营›订单 nav: " + nav);
    if (/系统/.test(nav)) throw new Error("order manager sees System group");
    const rows = await p.$$("#otable tbody tr[data-id]"); if (rows.length !== 9) throw new Error("rows " + rows.length);
    const kpi = await p.$eval("#okpi", e => e.innerText); if (!/本月成交额/.test(kpi)) throw new Error("order manager should see money KPI");
    assert.ok(/待联系/.test(kpi) && /待确认收款/.test(kpi), "the stage-2 tiles: " + kpi);
    const over = await p.$eval('#obar [data-cnt="overdue"]', e => e.textContent); if (over !== "(1)") throw new Error("overdue count " + over); // v3 clock: the contacted order (11 d) is within its 14
    const nf = await p.$eval('#obar [data-cnt="notifyFailed"]', e => e.textContent); if (nf !== "(2)") throw new Error("notifyFailed count " + nf);
    // stage 2: the legacy 已确认 record reads as 机构沟通中, the 25-day-old unpaid order expired on read, the family's 我已付款 is a tab
    assert.deepStrictEqual(await Promise.all(["contacted", "parent_paid", "expired"].map(k => p.$eval('#obar [data-cnt="' + k + '"]', e => e.textContent))), ["(1)", "(1)", "(1)"], "stage-2 counts");
    assert.ok(/已过期/.test(await p.$eval('#otable tbody tr[data-id="FC-20260926-BES-009"]', e => e.innerText)), "the stale order shows as expired");
    assert.ok(/机构沟通中/.test(await p.$eval('#otable tbody tr[data-id="FC-20261003-KXC-003"]', e => e.innerText)), "confirmed reads as contacted");
    await p.click('#obar .chip[data-f="overdue"]'); await p.waitForTimeout(200);
    const r2 = await p.$$("#otable tbody tr[data-id]"); if (r2.length !== 1) throw new Error("overdue rows " + r2.length);
    await p.click('#obar .chip[data-f="all"]'); await p.waitForTimeout(200);
    await p.click('#otable tbody tr[data-id="FC-20261002-KXC-002"]'); await p.waitForTimeout(500);
    const pb = await p.$eval("#panel .pb", e => e.innerText);
    if (!/七年级数学/.test(pb) || !/执行记录/.test(pb) || !/已联系家长/.test(pb) || !/取消订单/.test(pb)) throw new Error("panel: " + pb.slice(0, 200));
    assert.ok(/学生：李小红 · 7 年级/.test(pb), "the child on the order's line: " + pb.slice(0, 300));
    // the clock: an unpaid order shows when it must be paid by, and 延长 14 天 moves it
    assert.ok(/付款期限/.test(pb) && await p.$("#oExtend"), "pay-by line and the extend button: " + pb.slice(0, 300));
    assert.ok(/通知记录/.test(pb) && /到期提醒[\s\S]*家长邮件 \+ 机构 Teams[\s\S]*失败/.test(pb) && /已联系[\s\S]*已发/.test(pb), "the notices sent, newest first, with their outcome: " + pb.slice(-400));
    await p.click("#oExtend"); await p.waitForTimeout(500);
    assert.deepStrictEqual(extended, [{ orderId: "FC-20261002-KXC-002" }], "extend posted");
    assert.ok(/延长 14 天/.test(await p.$eval("#panel .pb", e => e.innerText)), "the extension is in the record");
    assert.ok(/前置课程：KXC-SCI-6 Grade 6 Science \/ 六年级科学/.test(pb) && /未确认/.test(pb), "the panel shows the item's prerequisite and that the family did not confirm it: " + pb.slice(0, 300));
    if (!/¥2,100/.test(pb)) throw new Error("no total in panel: " + pb);
    await p.fill("#oNote", "已电话沟通"); await p.click('#panel button[data-to="contacted"]'); await p.waitForTimeout(600);
    if (!patched.length || patched[0].status !== "contacted" || patched[0].note !== "已电话沟通") throw new Error("patch not sent: " + JSON.stringify(patched));
    const pb2 = await p.$eval("#panel .pb", e => e.innerText);
    if (!/已收款/.test(pb2) || !/已电话沟通/.test(pb2) || /已联系家长/.test(pb2)) throw new Error("panel after contact: " + pb2.slice(0, 300));
    const row = await p.$eval('#otable tbody tr[data-id="FC-20261002-KXC-002"]', e => e.innerText); if (!/机构沟通中/.test(row)) throw new Error("row not updated: " + row);
    // v3: the student named on the family's behalf (two prompts: name, grade)
    const onDialog = d => d.accept(/姓名/.test(d.message()) ? "李小红" : "8"); p.on("dialog", onDialog);
    await p.click('#panel button[data-child-code="KXC-SCI-7"]'); await p.waitForTimeout(600); p.off("dialog", onDialog);
    assert.deepStrictEqual(patched[patched.length - 1], { orderId: "FC-20261002-KXC-002", code: "KXC-SCI-7", child: { name: "李小红", grade: "8" } }, "child PATCH");
    assert.ok(/学生：李小红 · 8 年级/.test(await p.$eval("#panel .pb", e => e.innerText)), "the second line now names the student");
    await p.keyboard.press("Escape");
    // the paid order: commission on the list price, Hive confirmed on the provider's behalf, the buyer's name, the proof
    await p.click('#otable tbody tr[data-id="FC-20261004-KXC-004"]'); await p.waitForTimeout(500);
    const pb3 = await p.$eval("#panel .pb", e => e.innerText);
    assert.ok(/蜂巢佣金[\s\S]*¥210/.test(pb3) && /目录价 ¥2,100 × 10%/.test(pb3), "commission line: " + pb3.slice(0, 500));
    assert.ok(/蜂巢确认/.test(pb3) && /下单人姓名[\s\S]*赵小兰妈妈/.test(pb3) && /Lan/.test(pb3), "Hive's confirmation and the buyer: " + pb3.slice(0, 500));
    assert.ok(await p.$('#panel a[href="/api/crm/proof?orderId=FC-20261004-KXC-004&i=1"]'), "the proof link");
  });
  await shot("orders-en-finance", 1280, 900, "#/ops/orders/hive", "en", ["staff:finance"], async p => {
    const title = await p.$eval("#title", e => e.textContent); if (!/Orders/.test(title)) throw new Error("title " + title);
    const cell = await p.$eval('#otable tbody tr[data-id="FC-20261001-KXC-001"]', e => e.innerText);
    if (!/…@gmail\.com/.test(cell)) throw new Error("finance should see a masked email: " + cell);
    if (!/¥2,100/.test(cell)) throw new Error("finance should see amounts: " + cell);
    await p.click('#otable tbody tr[data-id="FC-20261001-KXC-001"]'); await p.waitForTimeout(500);
    const pb = await p.$eval("#panel .pb", e => e.innerText);
    if (/Contacted the family|Payment received\n|Cancel order|Extend 14 days/.test(pb)) throw new Error("finance must not get status buttons: " + pb.slice(0, 200));
    if (!/Fulfilment record/i.test(pb) || !/Grade 7 Mathematics/.test(pb)) throw new Error("panel en: " + pb.slice(0, 200));
  });
  await shot("orders-curriculum", 1280, 900, "#/ops/orders/hive", "zh", ["staff:curriculum"], async p => {
    const kpi = await p.$eval("#okpi", e => e.innerText); if (/本月成交额/.test(kpi)) throw new Error("curriculum director must not see money KPI");
    const cell = await p.$eval('#otable tbody tr[data-id="FC-20261001-KXC-001"]', e => e.innerText); if (!/不可见/.test(cell)) throw new Error("amount should be hidden: " + cell);
  });
  await shot("orders-none", 1280, 900, "#/ops/orders/hive", "zh", ["domain_it:bes.qiaoliang.online"], async p => {
    await p.waitForTimeout(300);
    const h = await p.evaluate(() => location.hash); if (/^#\/ops\/orders/.test(h)) throw new Error("domain admin reached the orders page");
    const nav = await p.$eval("#nav", e => e.innerText.replace(/我的订单/g, "")); if (/订单/.test(nav)) throw new Error("domain admin sees 订单 in nav"); // 我的订单 (the family's own) is everyone's
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
    const prev = await p.$eval("#rprev", e => e.innerText); if (!/Order manager/.test(prev) || !/Education community manager/.test(prev) || !/IT administrator/.test(prev)) throw new Error("preview: " + prev);
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
    if (tabs.length !== 3 || !tabs[0][1] || tabs[1][1] || tabs[2][1] || !/Equi/.test(tabs[0][0]) || !/班级人数/.test(tabs[2][0])) throw new Error("tabs (Equip first and active): " + JSON.stringify(tabs));
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
    const title = await p.$eval("#title", e => e.textContent); if (!/蜂巢课程订单/.test(title)) throw new Error("title " + title);
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
    // manual merge (Rick, 2026-10-20): search another record inside the panel, confirm, one person afterwards
    {
      const other = HUB.people.find(x => x.crmId !== mei.crmId && !(x.facets.accounts || []).length && !(x.facets.customers || []).length) || HUB.people.find(x => x.crmId !== mei.crmId);
      const before = HUB.stats.people, HUB0 = HUB;
      await p.fill("#pMergeQ", other.crmId.toLowerCase()); await p.waitForTimeout(300);
      assert.ok(await p.$('#pMergeList button[data-merge="' + other.crmId + '"]'), "the other record is found by CRM id");
      p.once("dialog", d => d.accept());
      await p.click('#pMergeList button[data-merge="' + other.crmId + '"]'); await p.waitForTimeout(800);
      assert.deepStrictEqual([merges[merges.length - 1].a, merges[merges.length - 1].b], [mei.crmId, other.crmId], "the merge names both records");
      assert.strictEqual(HUB.stats.people, before - 1, "one person fewer");
      assert.ok(/mama@qq\.com/.test(await p.$eval("#panel .pb", e => e.innerText)), "the merged person's panel is open");
      // undo for the checks that follow (the mock keeps its decisions in memory)
      delete HUB_SRC.decisions.pairs[merges[merges.length - 1].key]; HUB = hubMod.build(Object.assign({}, HUB_SRC, { prev: HUB0 }));
      await p.click("#panel .x"); await p.waitForSelector("#panel:not(.open)"); await p.click("#pReload"); await p.waitForTimeout(500);
      await p.click('#ptable tbody tr[data-id="' + mei.crmId + '"]'); await p.waitForTimeout(300);
    }
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
    await p.fill("#pq", "lead@"); await p.waitForTimeout(800);
    const found = await p.$$eval("#ptable tbody tr[data-id]", es => es.map(e => e.innerText)); if (found.length !== 1 || !/Lead One/.test(found[0]) || !/蜂巢/.test(found[0])) throw new Error("search: " + found);
    const ft = await p.$eval("#pfoot", e => e.innerText); if (!/第 1–1 \/ 匹配 1 · 共 \d+ 人/.test(ft) || !/筛选：搜索 “lead@”/.test(ft) || !/显示全部/.test(ft)) throw new Error("footer with a search: " + ft);
    assert.ok(peoplePages[peoplePages.length - 1].q === "lead@" && peoplePages[peoplePages.length - 1].sort === "crmId", "the search went to the server, sorted by CRM ID by default: " + JSON.stringify(peoplePages[peoplePages.length - 1]));
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
    // CRM ID ascending is the default (Rick, 2026-10-21); the heading's first click reverses it, the second restores it
    let got = await ids(); if (JSON.stringify(got) !== JSON.stringify(got.slice().sort())) throw new Error("not ascending by default: " + got);
    if (!/ascending/.test(await p.$eval('#ptable th[data-sort="crmId"]', e => e.getAttribute("aria-sort")))) throw new Error("aria-sort");
    await p.click('#ptable th[data-sort="crmId"]'); await p.waitForTimeout(300);
    got = await ids(); if (JSON.stringify(got) !== JSON.stringify(got.slice().sort().reverse())) throw new Error("not descending: " + got);
    await p.click('#ptable th[data-sort="crmId"]'); await p.waitForTimeout(300);
    got = await ids(); if (JSON.stringify(got) !== JSON.stringify(got.slice().sort())) throw new Error("not ascending again: " + got);
    await p.click('#ptable th[data-sort="stage"]'); await p.waitForTimeout(300);
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
    if (!names.some(n => n === "Hive")) throw new Error("slash name: the English page shows its English side alone (2026-10-21): " + names.join(" | "));
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
    const tag = await p.$eval('#utable button[data-group="g1"]', e => e.textContent); if (tag.trim() !== "五年级英语") throw new Error("user table shows the Chinese name alone (the pair is the tooltip): " + tag);
    if ((await p.$eval('#utable button[data-group="g1"]', e => e.getAttribute("title"))) !== "五年级英语 · English Grade 5") throw new Error("tooltip should carry both names");
    await p.click('#utable button[data-group="g1"]'); await p.waitForTimeout(700);
    const pb = await p.$eval("#panel .pb", e => e.innerText); if (!/Teams 名称/.test(pb) || !/显示名称/.test(pb)) throw new Error("group panel: " + pb.slice(0, 200));
    await p.fill("#gnEn", "Grade 5 English"); await p.click("#gnSave"); await p.waitForTimeout(500);
    if (groupNamed.length !== 1 || groupNamed[0].en !== "Grade 5 English" || groupNamed[0].id !== "g1") throw new Error("groupname call: " + JSON.stringify(groupNamed));
  });
  // 新建 Teams 群组 (Rick, 2026-10-16): the IT 管理员 creates a school's team and manages its people.
  await shot("teams-new", 1280, 900, "#/domain/groups", "zh", ["admin", "staff:sysadmin"], async p => {
    await p.waitForTimeout(800);
    assert.ok(await p.$("#newGroup"), "the New Teams group button");
    await p.evaluate(() => { const d = document.querySelector("#gtree details"); if (d) d.open = true; }); await p.waitForTimeout(500);
    // the sysadmin's switch for what the IT 管理员 may add
    assert.ok(await p.$('#gtree input[data-scope]'), "the school-scope switch for the system administrator");
    assert.ok(!(await p.$eval('#gtree input[data-scope]', e => e.checked)), "the switch shows the school's setting (off), not the sysadmin's own reach (Rick, 2026-10-18)");
    await p.click('#gtree input[data-scope]'); await p.waitForTimeout(300);
    assert.deepStrictEqual(scopePuts[0], { domain: "bes.qiaoliang.online", tenantUsers: true }, JSON.stringify(scopePuts));
    await p.click("#newGroup"); await p.waitForSelector("#ngTypes input[name=ngType]");
    const types = await p.$$eval("#ngTypes input[name=ngType]", es => es.map(e => e.value)); assert.deepStrictEqual(types, ["class", "plc", "staff", "standard"]);
    await p.click('#ngTypes input[value="class"]'); await p.waitForTimeout(100);
    assert.ok(!(await p.$("#ngPriv input[name=ngVis]")), "a class team has no privacy choice");
    assert.ok(/隐藏/.test(await p.$eval("#ngPriv", e => e.innerText)), "says the roster is hidden from students");
    assert.ok(/不能是学生/.test(await p.$eval("#ngOwnNote", e => e.innerText)), "warns that a student cannot own it");
    await p.click('#ngTypes input[value="standard"]'); await p.waitForTimeout(100);
    assert.strictEqual(await p.$$eval("#ngPriv input[name=ngVis]", es => es.map(e => e.value).join()), "Private,Public", "other chooses private or public");
    assert.ok(/整个租户/.test(await p.$eval("#ngPriv", e => e.innerText + [...e.querySelectorAll("[data-tip]")].map(x => x.dataset.tip).join(" "))), "warns that public is tenant-wide");
    // submit without owner → asked to fill in
    await p.fill("#ngName", "Chess club"); await p.click("#ngSave"); await p.waitForTimeout(200);
    assert.ok(/所有者/.test(await p.$eval("#ngMsg", e => e.innerText)) && teamCreates.length === 0, "an owner is required before anything is sent");
    // pick an owner by search, a member by typing the full account
    await p.fill("#ngOwners .ppin", users.users[0].displayName.slice(0, 3)); await p.waitForSelector("#ngOwners .ppitem"); await p.click("#ngOwners .ppitem");
    assert.strictEqual((await p.$$("#ngOwners .pchip")).length, 1, "owner chip");
    await p.fill("#ngMembers .ppin", users.users[1].upn); await p.waitForTimeout(500); await p.press("#ngMembers .ppin", "Enter");
    assert.strictEqual((await p.$$("#ngMembers .pchip")).length, 1, "member chip");
    await p.click('#ngPriv input[value="Public"]');
    await p.screenshot({ path: OUT + "/teams-new-form.png" });
    await p.click("#ngSave"); await p.waitForSelector("#panel .msg.ok");
    const sent = teamCreates[0];
    assert.deepStrictEqual([sent.domain, sent.type, sent.name, sent.visibility, sent.owners, sent.members], ["bes.qiaoliang.online", "standard", "Chess club", "Public", [users.users[0].upn], [users.users[1].upn]], JSON.stringify(sent));
    assert.ok(/团队已创建/.test(await p.$eval("#panel .pb", e => e.innerText)));
    // a creation that is still pending: the page polls and then reports
    await p.click("#ngAgain"); await p.waitForSelector("#ngTypes input[name=ngType]");
    await p.click('#ngTypes input[value="staff"]'); await p.fill("#ngName", "Slow team");
    await p.fill("#ngOwners .ppin", users.users[0].displayName.slice(0, 3)); await p.waitForSelector("#ngOwners .ppitem"); await p.click("#ngOwners .ppitem");
    await p.click("#ngSave"); await p.waitForSelector("#panel .msg.ok", { timeout: 8000 });
    assert.strictEqual(teamCreates[1].type, "staff"); assert.strictEqual(teamCreates[1].visibility, "Private");
    await p.keyboard.press("Escape");
    // manage an existing team: live owners and members; the other school's account has no buttons
    await p.click('#gtree button[data-manage]'); await p.waitForSelector("#gmgr .gmrow");
    const rows = await p.$$eval("#gmgr .gmrow", es => es.map(e => e.innerText.replace(/\s+/g, " ")));
    assert.strictEqual(rows.length, 3, "one owner and two members: " + JSON.stringify(rows));
    await p.screenshot({ path: OUT + "/teams-manage.png" });
    assert.ok(/other\.example\.edu/.test(rows[2]) && !/移除/.test(rows[2]), "another school's account is shown without remove: " + rows[2]);
    await p.click('#gmgr button[data-act="promote"]'); await p.waitForTimeout(300);
    assert.deepStrictEqual(memberOps[0], { domain: "bes.qiaoliang.online", id: "g1", addOwners: [users.users[1].upn] }, JSON.stringify(memberOps));
    // the panel shows the change at once (Rick, 2026-10-18: nothing moved after 设为所有者 — Microsoft's list lags),
    // and keeps showing it while Microsoft's read-back is still the old list
    const heads = async () => p.$$eval("#gmgr h4", es => es.map(e => e.textContent));
    assert.ok(/所有者 \(2\)/.test((await heads())[0]) && /成员 \(1\)/.test((await heads())[1]), "two owners, one plain member right after the click: " + (await heads()));
    assert.strictEqual(await p.$$eval('#gmgr button[data-act="demote"]', es => es.length), 2, "both owners offer 取消所有者");
    await p.waitForTimeout(2000);
    assert.ok(/所有者 \(2\)/.test((await heads())[0]), "the stale read-back from Microsoft does not undo what the panel shows");
    await (await p.$$('#gmgr button[data-act="demote"]'))[1].click(); await p.waitForTimeout(300);
    assert.ok(/所有者 \(1\)/.test((await heads())[0]) && /成员 \(2\)/.test((await heads())[1]), "取消所有者 moves the person back at once: " + (await heads()));
    await p.waitForSelector(".gmrow", { timeout: 4000 }); await p.waitForTimeout(300);
    await p.click('#gmgr button[data-act="remove"]'); await p.waitForTimeout(200);
    assert.strictEqual(memberOps.length, 2, "remove needs a second click");
    assert.ok(/确认/.test(await p.$eval('#gmgr button[data-act="remove"]', e => e.textContent)));
    await p.click('#gmgr button[data-act="remove"]'); await p.waitForTimeout(300);
    assert.strictEqual(memberOps.length, 3); assert.ok(memberOps[2].removeMembers && memberOps[2].removeMembers.length === 1, JSON.stringify(memberOps[2]));
    await p.keyboard.press("Escape"); await p.waitForSelector("#panel:not(.open)"); await p.waitForTimeout(500);
    // the system administrator's ⋯ on a team row: archive, then restore, then delete with one in-place confirmation (Rick, 2026-10-18)
    const rowsBefore = await p.$$eval("#gtree .trow", es => es.length);
    await p.click('#gtree button[data-gmore]'); await p.waitForTimeout(100);
    assert.ok(await p.$('#gtree .gmore .comenu:not([hidden]) button[data-garchive]') && await p.$('#gtree .gmore .comenu:not([hidden]) button[data-gdelete]'), "archive and delete are offered");
    await p.click('#gtree .comenu:not([hidden]) button[data-garchive]'); await p.waitForTimeout(300);
    assert.deepStrictEqual(teamOps[0], { op: "archive", domain: "bes.qiaoliang.online", id: "g1", archive: true }, JSON.stringify(teamOps));
    assert.ok(/已归档/.test(await p.$eval("#gtree .trow", e => e.innerText)), "the row shows 已归档 at once");
    await p.click('#gtree button[data-gmore]'); await p.waitForTimeout(100);
    assert.ok(/恢复/.test(await p.$eval('#gtree .comenu:not([hidden]) button[data-garchive]', e => e.textContent)), "an archived team offers 恢复");
    await p.click('#gtree .comenu:not([hidden]) button[data-garchive]'); await p.waitForTimeout(300);
    assert.strictEqual(teamOps[1].archive, false); assert.ok(!/已归档/.test(await p.$eval("#gtree .trow", e => e.innerText)));
    await p.click('#gtree button[data-gmore]'); await p.waitForTimeout(100);
    await p.click('#gtree .comenu:not([hidden]) button[data-gdelete]'); await p.waitForTimeout(100);
    assert.strictEqual(teamOps.length, 2, "delete asks once more first");
    assert.ok(/确认删除/.test(await p.$eval('#gtree .comenu:not([hidden]) button[data-gdelete]', e => e.textContent)));
    await p.click('#gtree .comenu:not([hidden]) button[data-gdelete]'); await p.waitForTimeout(400);
    assert.deepStrictEqual(teamOps[2], { op: "delete", domain: "bes.qiaoliang.online", id: "g1" });
    assert.strictEqual(await p.$$eval("#gtree .trow", es => es.length), rowsBefore - 1, "the row is gone at once");
    assert.ok(/已删除/.test(await p.$eval("#flash", e => e.innerText)));
  });
  await shot("orders-phone", 390, 800, "#/ops/orders/hive", "zh", SALES, async p => { await p.waitForTimeout(300); });
  // Sticky headings (Rick 2026-10-06): scroll the users list and the column headings stay at the top of the pane.
  // 删除账号 (Rick, 2026-10-07: 「verify if it works after deleting a user」): the typed
  // confirmation, the row, the tiles, the footer, the notice, the group member lists.
  const tom = users.users[4], groupsBefore = JSON.stringify(dgroups.groups);
  // 修改资料 / 换许可证 (2026-10-12): the IT 管理员 edits an account and switches its A1 plan from the person panel.
  await shot("user-edit-licence", 1280, 900, "#/domain/users", "zh", ["admin", "staff:sysadmin"], async p => {
    await p.waitForTimeout(600);
    const upn = "mei.wang@bes.qiaoliang.online";
    const row = await p.$('#utable tbody tr[data-upn="' + upn + '"]'); if (!row) throw new Error("fixture: no " + upn + " in " + (await p.$$eval("#utable tbody tr", es => es.map(e => e.getAttribute("data-upn")).join())));
    await row.click(); await p.waitForTimeout(500);
    if (!(await p.$("#editOpen")) || !(await p.$("#licOpen"))) throw new Error("edit / licence buttons missing");
    await p.click("#editOpen"); await p.waitForTimeout(500);
    if ((await p.$eval("#efZip", e => e.value)) !== "210000") throw new Error("live values not filled");
    await p.fill("#efJob", "数学老师");
    await p.click("#efSave"); await p.waitForTimeout(600);
    if (acctEdits.length !== 1 || acctEdits[0].jobTitle !== "数学老师" || Object.keys(acctEdits[0]).length !== 3) throw new Error("PATCH body (only what changed): " + JSON.stringify(acctEdits));
    if (!/已保存到 Microsoft 365/.test(await p.$eval("#acctMsg", e => e.innerText))) throw new Error("no saved note");
    await p.click("#licOpen"); await p.waitForTimeout(500);
    const txt = await p.$eval("#pacct", e => e.innerText + [...e.querySelectorAll("[data-tip]")].map(x => x.dataset.tip).join(" "));
    if (!/→/.test(txt) || !/剩余/.test(txt)) throw new Error("licence form: " + txt);
    const disabled = await p.$eval("#licGo", e => e.disabled);
    if (!disabled) { await p.click("#licGo"); await p.waitForTimeout(600); if (licChanges.length !== 1) throw new Error("licence call: " + JSON.stringify(licChanges)); }
  });
  await shot("user-delete", 1280, 900, "#/domain/groups", "zh", ["admin", "staff:sysadmin"], async p => {
    // The 群组 page is visited first, so its cache exists when the account is deleted.
    await p.waitForTimeout(700);
    if (!(await p.$('#gtree .mrow[data-upn="tom.li@bes.qiaoliang.online"]'))) throw new Error("fixture: Tom should be a member before");
    await p.click('#nav a[href="#/domain/users"]'); await p.waitForSelector("#dsel"); await p.selectOption("#dsel", "bes.qiaoliang.online"); await p.waitForSelector("#utable tr[data-upn]:not([data-dom])"); await p.waitForTimeout(300);
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
    const title = await p.$eval("#title", e => e.textContent); if (!/仪表盘/.test(title)) throw new Error("title: " + title);
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
    // column resize on a <colgroup> table (Rick, 2026-10-21: 「Resizing in institution doesn't work well」): the drag must move the column
    {
      const w0 = await p.$eval("#itable thead th:nth-child(2)", e => e.getBoundingClientRect().width);
      const hb = await p.$eval("#itable thead th:nth-child(2) .rz", e => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
      await p.mouse.move(hb.x, hb.y); await p.mouse.down(); await p.mouse.move(hb.x + 80, hb.y, { steps: 4 }); await p.mouse.up(); await p.waitForTimeout(100);
      const w1 = await p.$eval("#itable thead th:nth-child(2)", e => e.getBoundingClientRect().width);
      assert.ok(w1 >= w0 + 70, "the dragged column grew: " + w0 + " → " + w1);
      assert.ok(/px$/.test(await p.$eval("#itable colgroup col:nth-child(2)", e => e.style.width)), "the <col> carries the width");
      await p.$eval("#itable thead th:nth-child(2) .rz", e => e.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })));
      assert.strictEqual(await p.$eval("#itable colgroup col:nth-child(2)", e => e.style.width), "10%", "double-click puts the percentage back");
    }
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
    // the button comes back after the run (Rick, 2026-10-09: 点击后就冻住了 — a shadowed `var b`)
    const seedBtn = await p.$eval("#iSeed", e => ({ disabled: e.disabled, text: e.innerText })); if (seedBtn.disabled || /填入中/.test(seedBtn.text)) throw new Error("自动填入 button stuck: " + JSON.stringify(seedBtn));
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
  // 对账单 (2026-10-12): the month's schools, the panel with the discount and the live amount, generate, mark sent, print.
  // the dashboard's 对账单 panel (Rick, 2026-10-18): last month's statements, progress, total, a link to the page
  await shot("dashboard-statements", 1280, 1400, "#/dashboard", "zh", ["staff:finance"], async p => {
    await p.waitForSelector("#dStatements .vlegend", { timeout: 8000 });
    const txt = await p.$eval("#dStatements", e => e.innerText);
    assert.ok(/对账单/.test(txt) && /已生成 \d+ \/ \d+/.test(txt) && /已收款/.test(txt) && /全部对账单/.test(txt), "the statements panel: " + txt.slice(0, 300));
    assert.ok(await p.$("#dStatements svg"), "schools as bars");
    await p.$eval("#dStatements", e => e.scrollIntoView()); await p.waitForTimeout(200); await p.screenshot({ path: OUT + "/dashboard-statements.png", fullPage: false });
  });
  await shot("statements", 1280, 900, "#/ops/statements", "zh", ["staff:finance"], async p => {
    await p.waitForTimeout(700);
    if (!/对账单/.test(await p.$eval("#nav", e => e.innerText))) throw new Error("no nav item for finance");
    const tb = await p.$eval("#sttable", e => e.innerText);
    if (!/北京某某学校/.test(tb) || !/未生成/.test(tb) || !/已发送/.test(tb) || !/无 IT 服务关系/.test(tb) || !/推算/.test(tb)) throw new Error("table: " + tb.slice(0, 500));
    const k = await p.$eval("#stkpi", e => e.innerText); if (!/计费学校\s*2/.test(k)) throw new Error("kpi: " + k);
    await p.click('#sttable tr[data-domain="bes.qiaoliang.online"]'); await p.waitForTimeout(600);
    const pb = await p.$eval("#panel .pb", e => e.innerText);
    if (!/期初账号\s*39/.test(pb) || !/新增账号 · 4/.test(pb) || !/删除账号 · 1/.test(pb) || !/\$14\.17/.test(pb)) throw new Error("panel: " + pb.slice(0, 600));
    await p.fill("#stDisc", "10"); await p.waitForTimeout(100);
    if (!/\$11\.25/.test(await p.$eval("#stAmt", e => e.innerText))) throw new Error("live amount: " + await p.$eval("#stAmt", e => e.innerText));
    // The three figures (Rick, 2026-10-13): 服务年费 8, 免费账号 10, 折扣 25 % → (37 − 10) × 8 ÷ 12 = 18.00 × 0.75 = 13.50
    // (37 = licensed on the 1st; the 4 accounts added in September are billed from October).
    await p.fill("#stPrice", "8"); await p.fill("#stPct", "25"); await p.waitForTimeout(100);
    const live = await p.$eval("#stAmt", e => e.innerText); if (!/\$13\.50/.test(live)) throw new Error("live amount with price and pct: " + live);
    if (!/1 − 25%/.test(await p.$eval("#stFormula", e => e.innerText))) throw new Error("formula: " + await p.$eval("#stFormula", e => e.innerText));
    await p.click("#stGen"); await p.waitForTimeout(600);
    if (stmPosts.length !== 1 || stmPosts[0].op !== "generate" || stmPosts[0].discount !== 10 || stmPosts[0].unitPriceYear !== 8 || stmPosts[0].discountPct !== 25) throw new Error("generate call: " + JSON.stringify(stmPosts));
    const pb2 = await p.$eval("#panel .pb", e => e.innerText);
    if (!/STM-000007/.test(pb2) || !/待发送/.test(pb2) || !/\$13\.50/.test(pb2) || !(await p.$('#panel button[data-st="sent"]')) || !(await p.$("#stPrint"))) throw new Error("after generate: " + pb2.slice(0, 300));
    // The printed statement (Rick 2026-10-13): the file name the browser proposes carries the school and month; the page states the billing rule.
    const [pop] = await Promise.all([p.waitForEvent("popup"), p.click("#stPrint")]); await pop.waitForTimeout(400);
    const popTitle = await pop.title(), popText = await pop.evaluate(() => document.body.innerText);
    if (popTitle !== "北京某某学校_IT服务账单_2026-09_STM-000007") throw new Error("print title: " + popTitle);
    if (!/本月新增的账号从下个月开始收费/.test(popText) || !/本月新增账号（从下个月起计费）/.test(popText) || !/\$13\.50/.test(popText)) throw new Error("print text: " + popText.slice(0, 600));
    await pop.close();
    await p.click('#panel button[data-st="sent"]'); await p.waitForTimeout(500);
    if (stmPosts[1].op !== "status" || stmPosts[1].status !== "sent" || !/已发送/.test(await p.$eval("#panel .pb", e => e.innerText))) throw new Error("mark sent: " + JSON.stringify(stmPosts));
    const row = await p.$eval('#sttable tr[data-domain="bes.qiaoliang.online"]', e => e.innerText); if (!/已发送/.test(row)) throw new Error("table not refreshed: " + row);
    // Period statement (Rick 2026-10-13): Aug → Sep for the same school; free 3, price 5 → Aug (35−3)×5÷12 = 13.33, Sep (37−3)×5÷12 = 14.17, total 27.50.
    if (!/还没有期间账单/.test(await p.$eval("#sptable", e => e.innerText))) throw new Error("period table should be empty");
    await p.keyboard.press("Escape"); await p.waitForTimeout(100); // the open panel swallows the first outside click (01-core.js)
    await p.selectOption("#spDomain", "bes.qiaoliang.online"); await p.$eval("#spFrom", e => { e.value = "2026-08"; }); await p.$eval("#spTo", e => { e.value = "2026-09"; }); await p.click("#spOpen"); await p.waitForTimeout(600);
    if (await p.$eval("#spMsg", e => e.innerText)) throw new Error("period form refused: " + await p.$eval("#spMsg", e => e.innerText));
    const pp = await p.$eval("#panel .pb", e => e.innerText);
    if (!/逐月 · 2 个月/.test(pp) || !/2026 年 8 月/.test(pp) || !/\$13\.33/.test(pp) || !/\$27\.50/.test(pp) || !/72/.test(pp) || !/新增 2，删除 0/.test(pp) || !/新增 4，删除 1/.test(pp)) throw new Error("period panel: " + pp.slice(0, 900));
    if (!/2026 年 8 月 → 2026 年 9 月/.test(await p.$eval("#panel .ph h3", e => e.innerText))) throw new Error("period title");
    await p.fill("#stDisc", "5"); await p.waitForTimeout(100);
    // (35−5)×5÷12 = 12.50 + (37−5)×5÷12 = 13.33 → 25.83, and the August row follows.
    if (!/\$25\.83/.test(await p.$eval("#stAmt", e => e.innerText))) throw new Error("period live amount: " + await p.$eval("#stAmt", e => e.innerText));
    if (!/\$12\.50/.test(await p.$eval("#sptMonths tbody tr:first-child .sp-amt", e => e.innerText))) throw new Error("period row amount not live");
    await p.click("#stGen"); await p.waitForTimeout(600);
    const gp = stmPosts[stmPosts.length - 1]; if (gp.op !== "generate" || gp.from !== "2026-08" || gp.to !== "2026-09" || gp.month || gp.discount !== 5) throw new Error("period generate call: " + JSON.stringify(gp));
    const pp2 = await p.$eval("#panel .pb", e => e.innerText); if (!/STM-000009/.test(pp2) || !/待发送/.test(pp2) || !/\$25\.83/.test(pp2) || !(await p.$("#stPrint"))) throw new Error("after period generate: " + pp2.slice(0, 300));
    const pt = await p.$eval("#sptable", e => e.innerText); if (!/北京某某学校/.test(pt) || !/STM-000009/.test(pt) || !/\$25\.83/.test(pt) || !/待发送/.test(pt)) throw new Error("period table: " + pt);
    const [pop2] = await Promise.all([p.waitForEvent("popup"), p.click("#stPrint")]); await pop2.waitForTimeout(400);
    const pop2Title = await pop2.title(), pop2Text = await pop2.evaluate(() => document.body.innerText);
    if (pop2Title !== "北京某某学校_IT服务账单_2026-08_2026-09_STM-000009") throw new Error("period print title: " + pop2Title);
    if (!/当月新增的账号从下个月开始收费/.test(pop2Text) || !/2026 年 8 月 · 账号变动/.test(pop2Text) || !/\$25\.83/.test(pop2Text) || !/New 08-0/.test(pop2Text) || !/Old 09-0/.test(pop2Text)) throw new Error("period print text: " + pop2Text.slice(0, 900));
    await pop2.close();
    await p.click('#panel button[data-st="sent"]'); await p.waitForTimeout(500);
    const sp = stmPosts[stmPosts.length - 1]; if (sp.op !== "status" || sp.from !== "2026-08" || sp.status !== "sent") throw new Error("period status call: " + JSON.stringify(sp));
  });
  await shot("statements-readonly", 1280, 700, "#/ops/statements", "en", ["staff:partnership"], async p => {
    await p.waitForTimeout(600);
    await p.click('#sttable tr[data-domain="demo.fengchao.life"]'); await p.waitForTimeout(500);
    const pb = await p.$eval("#panel .pb", e => e.innerText);
    if (await p.$("#stGen") || await p.$("#stDisc") || await p.$('#panel button[data-st]')) throw new Error("partnership director can edit");
    if (!/No complete snapshot/.test(pb) || !/Sent/.test(pb)) throw new Error("readonly panel: " + pb.slice(0, 300));
  });
  // 课程方案 (2026-10-12): an 教育领袖 sees only 课程方案 of their school; edits credits and the map, saves, publishes.
  await shot("plan-leader", 1280, 900, "#/plan", "zh", ["domain_leader:bes.qiaoliang.online"], async p => {
    await p.waitForTimeout(800);
    const nv = await p.$eval("#nav", e => e.innerText);
    if (!/毕业要求与课程地图/.test(nv) || /用户管理|Teams 团队管理|操作手册/.test(nv)) throw new Error("leader nav: " + nv);
    assert.ok(await p.$eval("#plUnpub", e => e.hidden) && !(await p.$("#plstatus")), "nothing published yet: no 撤回发布, no status text");
    // two tabs (Rick, 2026-10-19): 课程地图 first with stage sub-tabs, 高中毕业要求 second; the school's frame on one line for editors
    assert.deepStrictEqual(await p.$$eval("#pltabs a[data-tab]", es => es.map(e => e.textContent)), ["课程地图", "高中毕业要求"]);
    assert.ok(await p.$("#plframe #plPed") && (await p.$$("#plframe input[data-dir]")).length === 3, "the frame: pedagogy + directions");
    assert.deepStrictEqual(await p.$$eval("#plframe input[data-dir]", es => es.map(e => e.checked)), [true, false, false], "default frame: classical, international");
    assert.deepStrictEqual(await p.$$eval("#plbody .plsub[data-stage]", es => es.map(e => e.textContent.trim())), ["语法阶段 K–G6", "逻辑阶段 G7–G8", "修辞阶段 G9–G12"], "stage sub-tabs in classical words");
    await p.selectOption("#plPed", "nonclassical"); await p.waitForTimeout(200);
    assert.ok(/小学 K–G6/.test(await p.$eval("#plbody", e => e.innerText)), "non-classical words follow the frame");
    await p.selectOption("#plPed", "classical"); await p.waitForTimeout(200);
    await p.click('#plbody .plsub[data-stage="rhetoric"]'); await p.waitForTimeout(200);
    const m0 = await p.$eval("#plbody", e => e.innerText); if (!/几何/.test(m0) || !/系统默认/.test(m0)) throw new Error("map default: " + m0.slice(0, 300));
    assert.ok(!(await p.$("#plbody .plhead + label.sw")) && await p.$("#plbody .plhead label.sw:has(#plOwnMap)"), "the school's-own switch sits in the card head");
    await p.click("label.sw:has(#plOwnMap) .track"); await p.waitForTimeout(200);
    if ((await p.$$("#plbody table.plmap.edit tbody tr:not(.plother)")).length !== 1) throw new Error("Hive's row was not copied");
    await p.click("#plAddRow"); await p.waitForTimeout(200);
    const rows = await p.$$("#plbody table.plmap.edit tbody tr:not(.plother)"); if (rows.length !== 2) throw new Error("add row");
    const rid = await rows[1].getAttribute("data-row");
    assert.ok(!(await p.$("#plbody .plmap th:nth-child(2)")) || !/路径/.test(await p.$eval("#plbody .plmap thead", e => e.innerText)), "one direction served: no 路径 column (Rick, 2026-10-19)");
    await p.click("#plAllRows"); await p.waitForTimeout(200);
    assert.ok(/路径/.test(await p.$eval("#plbody .plmap thead", e => e.innerText)), "with every row shown the column appears");
    assert.ok(await p.$eval('#plbody input[data-trk="1"][data-row="' + rid + '"]', e => e.checked), "a new row is for the school's track");
    assert.ok(/国际·古典/.test(await p.$eval('#plbody tr[data-row="' + rid + '"] .plscope', e => e.innerText)), "the track shows as a chip, the six boxes live in a menu");
    await p.selectOption('#plbody select[data-subj="' + rid + '"]', "recSci");
    // every chip is one book / course (Rick, 2026-10-19): ＋ under the cell opens a popover, Enter keeps it; click a
    // chip to edit it; Esc cancels; × on the chip removes it
    const cellSel = '#plbody .plcell[data-cell="G9"][data-row="' + rid + '"]';
    assert.ok(!(await p.$("#plbody .plmap textarea")) && !(await p.$("#plbody .plmap input[type=text]")), "no inputs in the grid");
    await p.click(cellSel + " .plplus"); await p.waitForSelector("#plpop:not([hidden])");
    await p.fill("#plpopEn", "Biology"); await p.fill("#plpopZh", "生物"); await p.keyboard.press("Enter"); await p.waitForTimeout(150);
    await p.click(cellSel + " .plplus"); await p.waitForSelector("#plpop:not([hidden])");
    await p.fill("#plpopEn", "Chemistry"); await p.fill("#plpopZh", "化学"); await p.click("#plpopOk"); await p.waitForTimeout(150);
    // chips show the site language only; the pair stays in the title and the popover (Rick, 2026-10-20)
    const chipText = async () => p.$$eval(cellSel + " .plchip", es => es.map(e => e.firstChild.textContent));
    assert.deepStrictEqual(await chipText(), ["生物", "化学"], "two chips, one per book");
    assert.deepStrictEqual(await p.$$eval(cellSel + " .plchip", es => es.map(e => e.getAttribute("title"))), ["Biology / 生物", "Chemistry / 化学"], "the pair in the title");
    await p.click(cellSel + ' .plchip[data-i="1"]'); await p.waitForSelector("#plpop:not([hidden])");
    assert.strictEqual(await p.inputValue("#plpopZh"), "化学", "the popover opens on the chip's own names");
    await p.fill("#plpopZh", "化学（删）"); await p.keyboard.press("Escape"); await p.waitForTimeout(150);
    assert.deepStrictEqual(await chipText(), ["生物", "化学"], "Esc drops the change");
    await p.click(cellSel + " .plplus"); await p.waitForSelector("#plpop:not([hidden])"); await p.fill("#plpopEn", "Physics"); await p.click("#plpopOk"); await p.waitForTimeout(150);
    await p.hover(cellSel + ' .plchip[data-i="2"]'); await p.click(cellSel + ' .plchip[data-i="2"] .plx'); await p.waitForTimeout(150);
    assert.deepStrictEqual(await chipText(), ["生物", "化学"], "× removes the third book again");
    assert.ok(!/课程地图\s+语法阶段/.test(await p.$eval("#plbody .plhead", e => e.innerText)), "no repeated card title");
    // a row of a track the school does not serve is hidden unless asked for: the ＋ menu toggles tracks
    await p.click('#plbody tr[data-row="' + rid + '"] .plscope .plchip .x'); await p.waitForTimeout(150);
    await p.click('#plbody button[data-trkmenu="' + rid + '"]'); await p.waitForTimeout(100);
    await p.click('#plbody input[data-trk="2"][data-row="' + rid + '"]'); await p.waitForTimeout(200);
    await p.click("#plAllRows"); await p.waitForTimeout(200);
    assert.strictEqual((await p.$$("#plbody table.plmap.edit tbody tr:not(.plother)")).length, 1, "the row moved to track 2 is hidden for a classical-international school");
    assert.ok(/1 行属于本校未选/.test(await p.$eval("#plbody", e => e.innerText)));
    await p.click("#plAllRows"); await p.waitForTimeout(200);
    assert.strictEqual((await p.$$("#plbody table.plmap.edit tbody tr:not(.plother)")).length, 2, "every track's rows on request");
    // 高中毕业要求: one direction → no sub-tabs; the switch in the head; the school's figures
    await p.click('#pltabs a[data-tab="credits"]'); await p.waitForTimeout(200);
    assert.ok(!(await p.$("#plbody .plsub[data-track]")), "one direction served: no direction sub-tabs");
    const body0 = await p.$eval("#plbody", e => e.innerText); if (/高中毕业要求/.test(body0) || !/国际·古典/.test(body0) || !/系统默认/.test(body0) || /蜂巢默认/.test(body0) || !/总学分\s*24/.test(body0)) throw new Error("credits card: " + body0.slice(0, 300));
    await p.click("label.sw:has(#plOwn) .track"); await p.waitForTimeout(200);
    await p.fill('#plbody input[data-credit="math"]', "5"); await p.$eval('#plbody input[data-credit="math"]', e => e.dispatchEvent(new Event("change", { bubbles: true })));
    await p.click('#plbody input[data-off="speaking"]'); await p.waitForTimeout(200);
    if (!(await p.$eval('#plbody input[data-credit="speaking"]', e => e.disabled))) throw new Error("不要求 did not disable the input");
    await p.fill("#plTotal", "26"); await p.$eval("#plTotal", e => e.dispatchEvent(new Event("change", { bubbles: true })));
    // a second direction → sub-tabs appear
    await p.click('#plframe input[data-dir="domestic"]'); await p.waitForTimeout(200);
    assert.deepStrictEqual(await p.$$eval("#plbody .plsub[data-track]", es => es.map(e => e.textContent.trim())), ["国际 本校", "国内"], "direction sub-tabs, the customised one marked");
    await p.click('#plframe input[data-dir="domestic"]'); await p.waitForTimeout(200);
    // the draft saves itself 1.5 s after the last change: no Save button, a quiet 已保存, the buttons on the tabs row
    assert.ok(!(await p.$("#plSave")) && await p.$("#pltabs #topActions #plPub") && !(await p.$("#pltabs select")), "no Save draft button; Publish sits on the tabs row; no picker on the tabs row");
    await p.waitForTimeout(1800);
    const saved = planPuts.filter(b => !b.publish), last = saved[saved.length - 1];
    if (!last || last.tracks["1"].credits.math !== 5 || last.tracks["1"].credits.speaking !== null || last.tracks["1"].totalCredits !== 26) throw new Error("autosave body: " + JSON.stringify(last).slice(0, 300));
    assert.deepStrictEqual(last.settings, { pedagogy: "classical", directions: ["international"] }, "the frame travels with the draft");
    const rr = last.map.rhetoric.rows; if (rr.length !== 2 || rr[1].subjects[0].id !== "recSci" || !/Biology/.test(rr[1].cells.G9) || rr[0].cells.G9 !== "Geometry / 几何") throw new Error("save map: " + JSON.stringify(rr).slice(0, 400));
    assert.ok(!/草稿已保存/.test(await p.$eval("#flash", e => e.innerText)), "no flash for an autosave");
    p.on("dialog", d => d.accept());
    await p.click("#plPub"); await p.waitForTimeout(600);
    if (planPuts[planPuts.length - 1].publish !== true) throw new Error("publish body: " + JSON.stringify(planPuts[planPuts.length - 1]).slice(0, 200));
    if (!(await p.$eval("#plUnpub", e => !e.hidden))) throw new Error("撤回发布 should show after publishing");
    await p.click('#pltabs a[data-tab="map"]'); await p.waitForTimeout(200);
    const m1 = await p.$$eval('#plbody .plcell[data-cell="G9"]', es => es.map(e => Array.from(e.querySelectorAll(".plchip")).map(c => c.firstChild.textContent).join("; "))); if (!/本校版本/.test(await p.$eval("#plbody", e => e.innerText)) || m1.join("|") !== "几何|生物; 化学") throw new Error("after publish (chips show the site language only): " + m1.join("|"));
    // a stage still on the system default: the first click on ＋ (or a book) turns 本校自定义 on and opens the editor
    // (Rick, 2026-10-20: 「Dialectic 和 Rhetoric 中的课程不可以点击」)
    await p.click('#plbody .plsub[data-stage="dialectic"]'); await p.waitForTimeout(200);
    assert.ok(!(await p.$eval("#plOwnMap", e => e.checked)) && await p.$("#plbody .plcell.arm .plplus") && !(await p.$("#plbody .plcell.edit")), "dialectic shows the system default, armed");
    await p.click("#plbody .plcell.arm .plplus"); await p.waitForSelector("#plpop:not([hidden])");
    assert.ok(await p.$eval("#plOwnMap", e => e.checked) && await p.$("#plbody .plcell.edit"), "one click: the school's own is on and the editor is open");
    await p.keyboard.press("Escape"); await p.waitForTimeout(150);
    // the same for a direction's figures on the credits tab
    await p.click('#pltabs a[data-tab="credits"]'); await p.waitForTimeout(200);
    await p.click('#plframe input[data-dir="domestic"]'); await p.waitForTimeout(200); await p.click('#plbody .plsub[data-track="3"]'); await p.waitForTimeout(200);
    assert.ok(!(await p.$eval("#plOwn", e => e.checked)) && await p.$('#plbody td.plarm[data-credit="math"]'), "the domestic track shows the system figures, armed");
    await p.click('#plbody td.plarm[data-credit="math"]'); await p.waitForTimeout(200);
    assert.ok(await p.$eval("#plOwn", e => e.checked) && await p.evaluate(() => document.activeElement && document.activeElement.getAttribute("data-credit") === "math"), "one click: the school's own is on and the figure is focused");
    await p.click('#plframe input[data-dir="domestic"]'); await p.waitForTimeout(200);
    await p.click('#pltabs a[data-tab="map"]'); await p.waitForTimeout(200); await p.click('#plbody .plsub[data-stage="rhetoric"]'); await p.waitForTimeout(200);
    await p.screenshot({ path: OUT + "/plan-leader.png" });
  });
  // A parent (no role) reads the school's published edition: two tabs, nothing to choose, nothing saved.
  await shot("plan-parent", 1280, 900, "#/plan", "zh", [], async p => {
    await p.waitForTimeout(800);
    const nv = await p.$eval("#nav", e => e.innerText.replace(/\s+/g, " "));
    assert.ok(/毕业要求与课程地图 i? ?我的订单 我的 Teams 团队 我的日历 Teams 登录与安全 个人资料/.test(nv), "我的账号 order: " + nv.slice(0, 120));
    assert.ok(!(await p.$("#topActions #plPub")) && !(await p.$("#plframe select")) && !(await p.$("#plbody label.sw")) && !(await p.$("#plbody textarea")) && !(await p.$("#plChild")), "read-only: no actions, frame, switches, inputs or choices");
    assert.deepStrictEqual(await p.$$eval("#plbody .plsub[data-stage]", es => es.map(e => e.textContent.trim())), ["语法阶段 K–G6", "逻辑阶段 G7–G8", "修辞阶段 G9–G12 本校"], "stage sub-tabs for readers too");
    await p.click('#plbody .plsub[data-stage="rhetoric"]'); await p.waitForTimeout(200);
    let txt = await p.$eval("#plbody", e => e.innerText);
    assert.ok(/学校版本/.test(txt), "the published edition is marked on the card");
    const tip = await p.$eval("#nav .nav-item.active .navinfo", e => e.getAttribute("data-tip"));
    assert.ok(/^学校版本，\d{4}\/\d{2}\/\d{2} 发布。可修改：校长、课程总监、系统管理员。$/.test(tip), "the reader's ⓘ says who published it and who may change it: " + tip);
    assert.ok(/几何/.test(txt) && /生物/.test(txt) === false, "the school's rhetoric map for its track (the track-2 row stays hidden): " + txt.slice(-300));
    await p.click('#pltabs a[data-tab="credits"]'); await p.waitForTimeout(200);
    txt = await p.$eval("#plbody", e => e.innerText);
    assert.ok(/数学\s*5/.test(txt) && !/公众演讲/.test(txt) && /总学分\s*26/.test(txt) && /学校版本/.test(txt), "the school's figures: " + txt.slice(0, 300));
    await p.screenshot({ path: OUT + "/plan-parent.png" });
  });
  // Hive courses on the map (2026-10-20): every cell counts the catalog courses that fit; the panel lists them with 选择,
  // which fills the website's own cart; 去下单 opens the website's order page. Nothing of the catalog is editable here.
  await shot("map-courses", 1280, 900, "#/plan", "zh", [], async p => {
    await p.waitForSelector('#plbody .plsub[data-stage="rhetoric"]'); await p.waitForTimeout(400);
    assert.ok(!(await p.$("#plbody .plavail")), "the grammar stage has no course in the catalog: no counts");
    await p.click('#plbody .plsub[data-stage="rhetoric"]'); await p.waitForSelector("#plbody .plavail");
    const counts = await p.$$eval("#plbody .plavail", es => es.map(e => e.getAttribute("data-avail-g") + ":" + e.textContent.trim()));
    assert.deepStrictEqual(counts, ["G9:● 1 门可选", "G10:● 1 门可选", ":● 1 门可选"], "math G9/G10 fit Geometry (the unavailable course and the track-2 Calculus do not); Choir has no row → 其它课程: " + JSON.stringify(counts));
    assert.ok(/其它课程/.test(await p.$eval("#plbody tr.plother", e => e.innerText)) && (await p.$("#plCart")) && await p.$eval("#plCart", e => e.hidden), "the other-courses row; the cart link waits for a selection");
    await p.click('#plbody .plavail[data-avail-g="G9"]'); await p.waitForSelector("#panel.open .plcourse");
    let txt = await p.$eval("#panel", e => e.innerText);
    assert.ok(/几何/.test(txt) && /KXC-MATH-HS-101/.test(txt) && /Zhang Lao/.test(txt) && /¥2,400/.test(txt) && /还剩 2 席/.test(txt) && /学校计划/.test(txt) && /Geometry \/ 几何|几何/.test(txt), "the panel: code, name, teacher, price, seats, planned items: " + txt);
    await p.click("#panel button[data-sel]"); await p.waitForTimeout(300);
    assert.deepStrictEqual(await p.evaluate(() => { const w = JSON.parse(localStorage.getItem("fc-wizard-v1")); return [Object.keys(w.cart), w.pedagogy, w.stage, w.mode, w.done]; }), [["recC1"], "classical", "rhetoric", "international", null], "the website's cart, with what its order page needs to open");
    assert.ok(/已选/.test(await p.$eval("#panel button[data-sel]", e => e.textContent)) && !(await p.$eval("#plCart", e => e.hidden)) && /去下单（1 门）/.test(await p.$eval("#plCart", e => e.textContent)) && (await p.$eval("#plCart", e => e.getAttribute("href"))) === "/order", "selected; 去下单 (1) → the website");
    await p.click("#panel button[data-course]"); await p.waitForSelector("#panel2.open .pvdetail");
    txt = await p.$eval("#panel2", e => e.innerText);
    assert.ok(/欧氏几何入门/.test(txt) && /最少 4 · 最多 12/.test(txt) && /KXC/.test(txt) && /已选/.test(txt) && !(await p.$("#panel2 input, #panel2 textarea")), "the detail: description, class size, provider, the same 选择 — nothing to edit");
    await p.screenshot({ path: OUT + "/map-courses.png" });
    // the same state after a reload: the cart persists, the picture for the record (the compositor in this harness
    // keeps a stale frame after the select click; the DOM is right, see the assertions)
    await p.reload(); await p.waitForSelector('#plbody .plsub[data-stage="rhetoric"]'); await p.click('#plbody .plsub[data-stage="rhetoric"]'); await p.waitForSelector('#plbody .plavail[data-avail-g="G9"]');
    assert.ok(/去下单（1 门）/.test(await p.$eval("#plCart", e => e.textContent)) && !(await p.$eval("#plCart", e => e.hidden)), "the selection survives a reload");
    await p.click('#plbody .plavail[data-avail-g="G9"]'); await p.waitForSelector("#panel.open .plcourse"); await p.click("#panel button[data-course]"); await p.waitForSelector("#panel2.open .pvdetail"); await p.waitForTimeout(400);
    await p.screenshot({ path: OUT + "/map-courses-detail.png" });
    await p.click("#panel2 button[data-sel]"); await p.waitForTimeout(200);
    assert.deepStrictEqual(await p.evaluate(() => Object.keys(JSON.parse(localStorage.getItem("fc-wizard-v1")).cart)), [], "unselected again");
    await p.keyboard.press("Escape"); await p.keyboard.press("Escape"); await p.waitForTimeout(200);
    await p.click('#plbody .plavail[data-avail-i="-1"]'); await p.waitForSelector("#panel.open .plcourse");
    assert.ok(/合唱/.test(await p.$eval("#panel", e => e.innerText)), "其它课程 lists the course whose subject is not on the map");
    await p.keyboard.press("Escape");
  });
  // a school's leader looks but never orders for a family (Rick, 2026-10-20: 「管理员不能代下单」)
  await shot("map-school-account", 1280, 900, "#/plan", "zh", ["domain_leader:bes.qiaoliang.online"], async p => {
    await p.waitForSelector('#plbody .plsub[data-stage="rhetoric"]'); await p.click('#plbody .plsub[data-stage="rhetoric"]'); await p.waitForSelector('#plbody .plavail[data-avail-g="G9"]');
    await p.click('#plbody .plavail[data-avail-g="G9"]'); await p.waitForSelector("#panel.open .plcourse");
    assert.ok(!(await p.$("#panel button[data-sel]")) && /学校管理账号只能查看/.test(await p.$eval("#panel", e => e.innerText)) && await p.$eval("#plCart", e => e.hidden), "no 选择, no 去下单, the note says why");
    await p.keyboard.press("Escape");
  });
  // 机构负责人 (stage 2, 2026-10-21): the leader of a hive's domain sees and works its own hive's orders, nothing else of 经营
  // 蜂巢课程负责人 (v3 第二批 ③): 概览 with the four numbers, each a door; 课程 in provider mode (own courses, 分配 within own
  // people); 老师 = the hive's Teachers rows; the roles page offers the explicit provider:<key> role
  await shot("hive-overview", 1280, 900, "", "zh", ["provider:KXC", "x:provider"], async p => {
    await p.waitForSelector("#hvkpi button[data-go]"); await p.waitForTimeout(300);
    assert.ok(["", "#/hive"].includes(await p.evaluate(() => location.hash)), "a provider's leader lands on 概览");
    const kpi = await p.$eval("#hvkpi", e => e.innerText);
    assert.ok(/待联系订单/.test(kpi) && /待确认收款/.test(kpi) && /待完善课程/.test(kpi) && /未达开班人数/.test(kpi) && /超期订单/.test(kpi), "the tiles: " + kpi);
    const nums = await p.$$eval("#hvkpi button[data-go] .v", es => es.map(e => e.textContent));
    assert.ok(nums.every(x => /^\d+$/.test(x)), "every tile has a count: " + nums);
    assert.ok(/Kids X Center/.test(await p.$eval(".hvhead", e => e.innerText)), "the hive's name");
    assert.ok(/待确认收款/.test(await p.$eval("#hvbody", e => e.innerText)), "the orders behind the numbers");
    await p.screenshot({ path: OUT + "/hive-overview.png" });
    await p.click('#hvkpi button[data-go="#/ops/orders/hive"][data-tab="parent_paid"]'); await p.waitForSelector("#otable tbody tr[data-id]"); await p.waitForTimeout(200);
    assert.strictEqual(await p.$eval('#obar .chip[aria-pressed="true"]', e => e.getAttribute("data-f")), "parent_paid", "the tile opens 订单 on that filter");
    // 课程: provider mode — its own course with 分配, the people picker limited to its own people
    await p.click('#nav a[href="#/courses"]'); await p.waitForSelector("#cotable"); await p.waitForTimeout(200);
    assert.ok(/蜂巢课程[\s\S]*课程/.test(await p.$eval("#title", e => e.innerText)), "title 蜂巢课程 › 课程");
    assert.ok(await p.$('#cotable button[data-assign]') && !(await p.$("#coSyncNow")), "分配 on its own course, no website sync button");
    await p.click('#cotable button[data-assign]'); await p.waitForSelector("#coPq");
    assert.ok(/只能分配本机构的人/.test(await p.$eval("#panel .pb .info", e => e.getAttribute("data-tip"))), "the own-people rule is stated");
    await p.fill("#coPq", "li"); await p.waitForTimeout(500);
    const hits = await p.$eval("#coPres", e => e.innerText);
    assert.ok(/Li Laoshi/.test(hits) && !/Li Other/.test(hits), "only the hive's own people: " + hits);
    await p.keyboard.press("Escape");
    // 老师: the hive's teachers
    await p.click('#nav a[href="#/domain/teachers"]'); await p.waitForTimeout(600);
    const tt = await p.$eval("#content", e => e.innerText);
    assert.ok(/Mr Lee/.test(tt) && !/Zhang Lao/.test(tt), "the hive's teachers only: " + tt.slice(0, 300));
    assert.ok(/蜂巢课程[\s\S]*老师/.test(await p.$eval("#title", e => e.innerText)), "title 蜂巢课程 › 老师");
  });
  await shot("roles-provider", 1280, 900, "#/system/roles", "zh", ["admin", "staff:sysadmin"], async p => {
    await p.waitForSelector('#rtable tr[data-user]');
    await p.click('#rtable tr[data-user="mei.wang@bes.qiaoliang.online"]'); await p.waitForTimeout(400);
    assert.ok(await p.$('#rhives .chip[data-hive="IEW"]') && await p.$('#rhives .chip[data-hive="KXC"]'), "the hive chips");
    await p.click('#rhives .chip[data-hive="IEW"]'); await p.waitForTimeout(100);
    assert.ok(/蜂巢课程负责人 · IEW/.test(await p.$eval("#rprev", e => e.innerText)), "preview: " + await p.$eval("#rprev", e => e.innerText));
    await p.click("#rsave"); await p.waitForTimeout(900);
    assert.ok(/蜂巢课程负责人 · IEW/.test(await p.$eval("#flash", e => e.textContent)), "saved with the provider role: " + await p.$eval("#flash", e => e.textContent));
  });
  await shot("orders-provider", 1280, 900, "#/ops/orders", "zh", ["domain_leader:kxc.edu", "x:provider"], async p => {
    await p.waitForSelector("#otable tbody tr[data-id]");
    const nav = await p.$eval("#nav", e => e.innerText);
    assert.ok(/蜂巢课程[\s\S]*概览[\s\S]*课程[\s\S]*订单/.test(nav) && !/经营|人员库|仪表盘|合作伙伴/.test(nav), "the provider's 蜂巢课程 group: 概览 · 课程 · 订单 (老师 is under 学校管理 for a school's leader), no 经营: " + nav);
    assert.ok(!(await p.$('.ptab[href="#/ops/orders"]')) && /蜂巢课程订单/.test(await p.$eval(".pagetabs", e => e.innerText)), "no Equip tab; the course orders open directly");
    assert.ok(/贵机构课程的订单/.test(await p.$eval("#title .info", e => e.getAttribute("data-tip"))), "the provider's intro");
    const rows = await p.$$eval("#otable tbody tr[data-id]", es => es.map(e => e.getAttribute("data-id")));
    assert.strictEqual(rows.length, 8, "its own hive's orders only: " + rows); assert.ok(!rows.includes("FC-20260926-BES-009"), "the other hive's order is not listed");
    assert.ok(/parent0@gmail\.com/.test(await p.$eval('#otable tbody tr[data-id="FC-20261001-KXC-001"]', e => e.innerText)), "the provider sees the family's email in full (it settles payment with them)");
    assert.ok(/本月订单金额/.test(await p.$eval("#okpi", e => e.innerText)), "and the amounts");
    await p.screenshot({ path: OUT + "/orders-provider.png" });
    await p.click('#otable tbody tr[data-id="FC-20261007-KXC-007"]'); await p.waitForTimeout(500); // parent_paid: the family says it paid
    const pb = await p.$eval("#panel .pb", e => e.innerText);
    assert.ok(/机构沟通中 → 家长已付款/.test(pb) && /已收款/.test(pb) && /取消订单/.test(pb) && !/记家长已付款|重新打开|延长 14 天/.test(pb), "the provider's verbs on a parent_paid order: " + pb.slice(0, 400));
    await p.click('#panel button[data-to="paid"]'); await p.waitForTimeout(500);
    assert.strictEqual(patched[patched.length - 1].status, "paid", "已收款 posted");
    assert.ok(/开课/.test(await p.$eval("#panel .pb", e => e.innerText)) && /已收款/.test(await p.$eval('#otable tbody tr[data-id="FC-20261007-KXC-007"]', e => e.innerText)), "paid: next is 开课");
    await p.screenshot({ path: OUT + "/orders-provider-panel.png" });
    await p.keyboard.press("Escape");
    // 班级人数 is theirs too, with the child on each order; the rest of 经营 bounces to orders
    await p.evaluate(() => { location.hash = "#/ops/orders/classes"; }); await p.waitForSelector("#cltable tbody tr[data-code]");
    await p.click('#cltable tbody tr[data-code="KXC-MATH-7"]'); await p.waitForTimeout(200);
    assert.ok(/学生：张小明/.test(await p.$eval("#cltable", e => e.innerText)) && await p.$("#cltable button[data-seat]"), "class sizes with the children and 递补");
    await p.evaluate(() => { location.hash = "#/ops/people"; }); await p.waitForTimeout(400);
    assert.ok(await p.$("#otable, #cltable") && !(await p.$("#ptable")), "people hub is not the provider's");
  });
  // 我的账号 › 补充资料 (v3): each child shows the courses it is on; a paid-or-live course without its student points to 我的订单
  MY_ORDERS = MY_ORDERS0(); MY_ORDERS[0].items[0].child = { name: "大宝", grade: "6", account: "" };
  await shot("account-kids", 1280, 900, "#/account", "zh", [], async p => {
    await p.waitForSelector("#kids .kid"); await p.waitForTimeout(500);
    const banner = await p.$eval("#kidOrders", e => e.innerText);
    assert.ok(/有 1 张订单的课程还没有指定上课的孩子/.test(banner) && await p.$('#kidOrders a[href="#/myorders"]'), "the banner and its link: " + banner);
    const kid = await p.$eval('#kids .kid-courses[data-kid="大宝"]', e => e.innerText);
    assert.ok(/所报课程：几何/.test(kid), "the child's courses from the orders: " + kid);
    assert.strictEqual((await p.$eval('#kids .kid:nth-child(2) .kid-courses', e => e.innerText)).trim(), "", "the nameless child has none");
  });
  // 我的订单 (2026-10-20): the account's orders, the family's own cancellation while still submitted
  MY_ORDERS = MY_ORDERS0();
  await shot("orders-mine", 1280, 900, "#/myorders", "zh", [], async p => {
    await p.waitForSelector(".mocard");
    const txt = await p.$eval("#mobody", e => e.innerText);
    assert.ok(/学生：张小明 · 9 年级/.test(txt), "the child under the course: " + txt);
    assert.ok(/FC-20261020-KXC-003/.test(txt) && /已提交/.test(txt) && /几何/.test(txt) && /FC-20261018-BES-001/.test(txt) && /机构沟通中/.test(txt) && /候补/.test(txt) && /前置课程未确认/.test(txt) && /USD 1\.00 · 已付/.test(txt) && /收据/.test(txt), "both orders, their tags and the fee: " + txt);
    assert.strictEqual((await p.$$("#mobody button[data-cancel]")).length, 1, "only the submitted order can be cancelled by the family");
    // stage 2: the pay-by date and 我已付款 on both unpaid orders; the family's word is recorded, the provider's confirmation follows
    assert.ok(/付款期限/.test(txt) && /2026\/11\/10/.test(txt), "pay-by line: " + txt.slice(0, 300));
    assert.strictEqual((await p.$$("#mobody button[data-paid]")).length, 2, "我已付款 on both unpaid orders");
    await p.screenshot({ path: OUT + "/orders-mine.png" });
    // v3: the student is named after checkout — the tag says so, the form takes a name and grade
    assert.ok(/待指定学生/.test(txt), "the BES order still needs its student: " + txt.slice(0, 400));
    await p.click('#mobody button[data-child="FC-20261018-BES-001"]'); await p.waitForSelector(".mochild");
    // the profile's named children are offered (the nameless second child is not); "another child" opens the name fields
    assert.deepStrictEqual(await p.$$eval(".mochild .mocPick option", es => es.map(e => e.value)), ["", "0", "other"], "one named child in the profile");
    await p.selectOption(".mochild .mocPick", "other"); assert.ok(await p.$eval(".mochild .mocNew", e => !e.hidden), "name fields shown for another child");
    await p.selectOption(".mochild .mocPick", "0"); await p.click(".mochild .mocGo"); await p.waitForTimeout(500);
    assert.deepStrictEqual(myPatches[myPatches.length - 1], { orderId: "FC-20261018-BES-001", code: "BES-SCI-MS-201", child: { name: "大宝", grade: "6", account: "kid.one@bes.qiaoliang.online" } }, "child named from the profile");
    const card1 = await p.$eval('.mocard[data-order="FC-20261018-BES-001"]', e => e.innerText);
    assert.ok(/学生：大宝 · 6 年级/.test(card1) && !/待指定学生/.test(card1) && /更换学生/.test(card1), "named: " + card1);
    // 我已付款 is a form: a note and an optional screenshot (≤ 2 MB), recorded with the family's word
    await p.click('#mobody button[data-paid="FC-20261018-BES-001"]'); await p.waitForSelector(".mopaid");
    await p.fill(".mopaid .mopNote", "微信转账 10 月 21 日");
    await p.setInputFiles(".mopaid .mopFile", { name: "wechat.png", mimeType: "image/png", buffer: Buffer.from("PNG!") });
    await p.click(".mopaid .mopGo"); await p.waitForTimeout(600);
    assert.deepStrictEqual(myPatches[myPatches.length - 1], { orderId: "FC-20261018-BES-001", status: "parent_paid", note: "微信转账 10 月 21 日", proof: { name: "wechat.png", type: "image/png", data: Buffer.from("PNG!").toString("base64") } }, "parent_paid sent with the proof");
    const card2 = await p.$eval('.mocard[data-order="FC-20261018-BES-001"]', e => e.innerText);
    assert.ok(/已付款 · 待机构确认/.test(card2) && (await p.$$("#mobody button[data-paid]")).length === 1, "recorded; the button is gone: " + card2);
    assert.ok(await p.$('.mocard[data-order="FC-20261018-BES-001"] a[href="/api/me/proof?orderId=FC-20261018-BES-001&i=1"]'), "the family sees its proof");
    p.once("dialog", d => d.accept());
    await p.click("#mobody button[data-cancel]"); await p.waitForTimeout(500);
    assert.ok(/已取消/.test(await p.$eval('.mocard[data-order="FC-20261020-KXC-003"]', e => e.innerText)) && !(await p.$("#mobody button[data-cancel]")), "cancelled, no more cancel buttons");
  });
  // an ordinary account lands on 毕业要求与课程地图 (Rick, 2026-10-19)
  await shot("plan-landing", 1280, 700, "", "zh", [], async p => {
    await p.waitForTimeout(700);
    const h = await p.evaluate(() => location.hash); if (h !== "#/plan" && h !== "") throw new Error("an ordinary account should land on the plan: " + h);
    assert.ok(/课程地图/.test(await p.$eval("#pltabs", e => e.innerText)), "the plan page is shown");
    assert.ok(/毕业要求与课程地图/.test(await p.$eval("#nav .nav-item.active", e => e.innerText)), "and the sidebar highlights it (Rick, 2026-10-19)");
  });
  // a wide table never runs past its white box (Rick, 2026-10-19): the box grows with the table, the pane scrolls
  await shot("wide-table-box", 1000, 800, "#/plan", "zh", [], async p => {
    await p.waitForTimeout(700); await p.click('#plbody .plsub[data-stage="rhetoric"]'); await p.waitForTimeout(200);
    await p.screenshot({ path: OUT + "/wide-table-box.png" });
    const m = await p.evaluate(() => { const card = document.querySelector("#plbody .card"), tbl = document.querySelector("#plbody table.plmap"); const c = card.getBoundingClientRect(), t = tbl.getBoundingClientRect(); return { cardRight: Math.round(c.right), tableRight: Math.round(t.right), paneScroll: document.getElementById("content").scrollWidth > document.getElementById("content").clientWidth }; });
    assert.ok(m.cardRight >= m.tableRight, "the card's box reaches past the table: " + JSON.stringify(m));
    await p.goto(p.url().replace(/#.*$/, "") + "#/domain/users"); await p.waitForTimeout(100);
  });
  await shot("wide-table-users", 1000, 800, "#/domain/users", "zh", ["admin", "staff:sysadmin"], async p => {
    await p.waitForSelector("#utable"); await p.waitForTimeout(400);
    const m = await p.evaluate(() => { const w = document.querySelector(".tbl-wrap"), tbl = document.getElementById("utable"); return { wrapRight: Math.round(w.getBoundingClientRect().right), tableRight: Math.round(tbl.getBoundingClientRect().right) }; });
    assert.ok(m.wrapRight >= m.tableRight, "the users list's box reaches past its table on a narrow pane: " + JSON.stringify(m));
    await p.screenshot({ path: OUT + "/wide-table-users.png" });
  });
  // the sidebar item's ⓘ opens to the right of the sidebar, whole (Rick, 2026-10-19: it was cut off on the left)
  await shot("nav-tip", 1280, 700, "#/plan", "zh", [], async p => {
    await p.waitForTimeout(600);
    await p.hover("#nav .nav-item.active .navinfo"); await p.waitForTimeout(150);
    const m = await p.evaluate(() => { const b = document.getElementById("navtip"), s = document.getElementById("side").getBoundingClientRect(), r = b.getBoundingClientRect(); return { shown: !b.hidden, left: Math.round(r.left), sideRight: Math.round(s.right), right: Math.round(r.right), w: innerWidth, text: b.textContent }; });
    assert.ok(m.shown && m.left >= m.sideRight && m.right <= m.w && /课程地图|可修改|可设定/.test(m.text) && m.text.length < 120, "the tip floats to the right of the sidebar, inside the window, and is short: " + JSON.stringify(m));
    await p.screenshot({ path: OUT + "/nav-tip.png", clip: { x: 0, y: 50, width: 700, height: 220 } });
  });
  await shot("side-collapse", 1280, 700, "#/account", "zh", [], async p => {
    await p.waitForTimeout(500);
    assert.ok(await p.$eval("#side", e => e.offsetWidth > 0) && await p.$eval("#sideHide", e => e.offsetWidth > 0) && !(await p.$eval("#sideShow", e => e.offsetWidth)), "sidebar open with its collapse button");
    await p.click("#sideHide"); await p.waitForTimeout(150);
    assert.ok(!(await p.$eval("#side", e => e.offsetWidth)) && await p.$eval("#sideShow", e => e.offsetWidth > 0) && await p.$eval("#content", e => e.getBoundingClientRect().left < 60), "collapsed: the content takes the width, an expand button at the top left");
    assert.strictEqual(await p.evaluate(() => localStorage.getItem("fc-side")), "hide");
    await p.click('#sideShow'); await p.waitForTimeout(150);
    assert.ok(await p.$eval("#side", e => e.offsetWidth > 0), "and back");
  });
  await shot("plan-unpublish", 1280, 700, "#/plan", "zh", ["domain_leader:bes.qiaoliang.online"], async p => {
    await p.waitForTimeout(800); p.on("dialog", d => d.accept());
    await p.click("#plUnpub"); await p.waitForTimeout(500);
    if (planPuts.length !== 3 || planPuts[2].unpublish !== true || !(await p.$eval("#plUnpub", e => e.hidden))) throw new Error("unpublish: " + JSON.stringify(planPuts[2]));
  });
  // 校历 (Rick, 2026-10-16): the 教育领袖 edits the school's calendar and sees Hive's events read-only.
  await shot("calendar-leader", 1280, 900, "#/domain/calendar", "zh", ["domain_leader:bes.qiaoliang.online"], async p => {
    await p.waitForTimeout(800);
    await p.click('#calview [data-view="list"]'); await p.waitForTimeout(150);
    const nv = await p.$eval("#nav", e => e.innerText);
    assert.ok(/日历管理/.test(nv) && /毕业要求与课程地图/.test(nv) && !/Teams 团队管理|操作手册/.test(nv), "leader nav: " + nv);
    assert.ok(await p.$eval("#calAdd", e => !e.hidden), "the leader may add events");
    assert.ok(!(await p.$('#caltabs a[data-layer="hive"]')) && (await p.$$("#caltabs a[data-layer]")).length === 2, "a leader has the school calendar and the list tab, no Hive tab");
    await p.click('#calbody .chip[data-filter="all"]'); await p.waitForTimeout(200);
    let body = await p.$eval("#calbody", e => e.innerText);
    assert.ok(/联合教师培训/.test(body) && /广播/.test(body), "Hive's event aimed at the school is listed: " + body.slice(0, 200));
    await p.click('#caltable tr[data-src="hive"]'); await p.waitForTimeout(300);
    assert.ok(/只读/.test(await p.$eval("#panel .pb", e => e.innerText)) && !(await p.$("#cef")), "a Hive event opens read-only");
    await p.keyboard.press("Escape"); await p.waitForTimeout(300);
    await p.click("#calAdd"); await p.waitForSelector("#cef");
    assert.ok(await p.$("#cewho") && !(await p.$("#ceTg")), "a school's form has the who-section but no school list");
    assert.ok(/本校所有人/.test(await p.$eval("#cesum", e => e.innerText)), "nothing narrowed: everyone at the school");
    assert.ok(!(await p.$("#ceLoc")), "there is no location field");
    assert.ok(!(await p.$eval("#ceAll", e => e.checked)) && (await whenVal(p, "#cewhen"))[0].endsWith("T09:00"), "a new event is timed, not all-day, starting at 9:00");
    assert.ok(/显示为/.test(await p.$eval("#cef", e => e.innerText)) && /详细信息/.test(await p.$eval("#cef", e => e.innerText)) && /会议链接/.test(await p.$eval("#cef", e => e.innerText)), "Outlook-style labels");
    await p.fill("#ceTitle", "家长会"); await p.click("#ceAll");
    assert.ok(await p.$eval("#cewhen", e => e.classList.contains("allday")) && !(await p.isVisible("#cewhen .wst")), "all day hides the times");
    await p.fill("#cewhen .wsd", "2026-11-14"); await p.fill("#cewhen .wed", "2026-11-14");
    await p.click('#ceAud input[data-aud="家长"]');
    assert.ok(/本校 · 家长/.test(await p.$eval("#cesum", e => e.innerText)) && /≈ 1 人/.test(await p.$eval("#cesum", e => e.innerText)), "the summary follows the role: " + await p.$eval("#cesum", e => e.innerText));
    await p.fill("#cePeople input", "teacher1@bes.qiaoliang.online"); await p.keyboard.press("Enter"); await p.waitForTimeout(100);
    assert.ok(/≈ 2 人/.test(await p.$eval("#cesum", e => e.innerText)) && (await p.$$("#cePeople .calchip")).length === 1, "a named teacher is added to the parents: " + await p.$eval("#cesum", e => e.innerText));
    await p.fill("#ceLink", "https://teams.microsoft.com/l/meetup-join/xyz"); await p.selectOption("#ceRem", "60");
    await p.screenshot({ path: OUT + "/calendar-form.png" });
    await p.click("#ceSave"); await p.waitForTimeout(900);
    const sent = calPosts[0];
    assert.deepStrictEqual([sent.event.people, sent.event.teams], [["teacher1@bes.qiaoliang.online"], []], "the named account is sent: " + JSON.stringify(sent.event));
    assert.deepStrictEqual([sent.domain, sent.op, sent.event.title, sent.event.allDay, sent.event.start, sent.event.end, sent.event.audience, sent.event.link, sent.event.reminder, sent.event.meeting], ["bes.qiaoliang.online", "save", "家长会", true, "2026-11-14", "2026-11-14", ["家长"], "https://teams.microsoft.com/l/meetup-join/xyz", 60, "link"], JSON.stringify(sent));
    body = await p.$eval("#calbody", e => e.innerText); assert.ok(/家长会/.test(body) && /校历/.test(body), "the saved event is listed: " + body.slice(0, 200));
    await p.screenshot({ path: OUT + "/calendar-list.png" });
    // an event with no title is not sent
    await p.click("#calAdd"); await p.waitForSelector("#cef"); await p.click("#ceSave"); await p.waitForTimeout(200);
    assert.ok(/标题/.test(await p.$eval("#ceMsg", e => e.innerText)) && calPosts.length === 1, "a title is required before anything is sent");
    await p.keyboard.press("Escape"); await p.waitForTimeout(300);
    // change it, then delete it
    await p.click('#caltable tr[data-src="school"]'); await p.waitForSelector("#cef");
    assert.ok(!(await p.isVisible("#ceZoneBox")), "an all-day event hides the zone");
    await p.click("#ceAll"); assert.ok(await p.isVisible("#cewhen .wst") && await p.isVisible("#ceZoneBox"), "unticking all day shows the times and the zone");
    assert.strictEqual(await p.$eval("#ceZone", e => e.value), "Asia/Shanghai", "and the zone starts as 北京时间"); await p.click("#ceAll");
    await p.fill("#ceTitle", "家长会（改）"); await p.click("#ceSave"); await p.waitForTimeout(900);
    assert.ok(calPosts.length === 2 && calPosts[1].event.id === "e-1" && calPosts[1].event.title === "家长会（改）", JSON.stringify(calPosts[1]));
    p.on("dialog", d => d.accept());
    await p.click('#caltable tr[data-src="school"]'); await p.waitForSelector("#ceDel"); await p.click("#ceDel"); await p.waitForTimeout(700);
    assert.ok(calPosts[2].op === "delete" && calPosts[2].id === "e-1", JSON.stringify(calPosts[2]));
    assert.ok(!/家长会/.test(await p.$eval("#calbody", e => e.innerText)), "deleted");
    // the sync card: preview, a test run on one account, the batches, the failures with their reasons, the withdrawal
    await p.click("#calPublish"); await p.waitForSelector("#calsynccard");
    assert.ok(!(await p.$("#calpick")), "the leader's panel has no school list");
    await p.fill("#calonly", "teacher1@bes.qiaoliang.online"); await p.click("#calPlan"); await p.waitForTimeout(400);
    let out = await p.$eval("#calsyncout", e => e.innerText);
    assert.ok(/新增 5/.test(out) && /已写入 0/.test(out) && /用户自己删除的副本 1/.test(out), "plan: " + out);
    assert.deepStrictEqual([syncPosts[0].op, syncPosts[0].domain, syncPosts[0].only], ["syncplan", "bes.qiaoliang.online", "teacher1@bes.qiaoliang.online"], JSON.stringify(syncPosts[0]));
    await p.fill("#calonly", ""); await p.click("#calGo"); await p.waitForTimeout(900);
    out = await p.$eval("#calsyncout", e => e.innerText);
    const runs = syncPosts.filter(x => x.op === "sync");
    assert.ok(runs.length === 2 && runs[0].fresh === true && runs[1].fresh === false, "two batches, the first fresh: " + JSON.stringify(runs));
    assert.ok(/已新增 4/.test(out) && /nomail@bes\.qiaoliang\.online/.test(out) && /IT 管理员/.test(out), "result with the failed account and why: " + out);
    await p.screenshot({ path: OUT + "/calendar-sync.png" });
    await p.click("#calWithdraw"); await p.waitForTimeout(700);
    assert.ok(syncPosts.some(x => x.op === "withdraw" && x.domain === "bes.qiaoliang.online"), "withdraw sent");
  });
  // The system administrator: sees a school's calendar read-only, adds events to the Hive layer aimed at schools.
  await shot("calendar-admin", 1280, 900, "#/domain/calendar", "en", ["admin"], async p => {
    await p.waitForTimeout(800);
    await p.click('#calview [data-view="list"]'); await p.waitForTimeout(150);
    assert.strictEqual((await p.$$("#caltabs a[data-layer]")).length, 3, "all three tabs (school, broadcast, the list)");
    assert.ok(await p.$("#calsel"), "the school picker");
    assert.ok(!(await p.$("#calAdd")) && !(await p.$("#calPublish")), "the system administrator cannot add to or publish a school's own calendar");
    assert.ok(/View only/.test(await p.$eval("#calright", e => e.innerText)) && /System broadcast/.test(await p.$eval("#calright .info", e => e.dataset.tip)), "the page says it is view-only, and why, in a small tip");
    await p.click('#calbody .chip[data-filter="all"]'); await p.waitForTimeout(200);
    await p.click('#caltable tr[data-src="hive"]'); await p.waitForTimeout(300);
    assert.ok(/read-only/.test(await p.$eval("#panel .pb", e => e.innerText)), "a Hive event is read-only in a school's list");
    await p.keyboard.press("Escape"); await p.waitForTimeout(300);
    await p.click('#caltabs a[data-layer="hive"]'); await p.waitForSelector("#caltable");
    assert.ok(await p.$eval("#calAdd", e => !e.hidden), "the Hive tab has an add button");
    await p.click("#calAdd"); await p.waitForSelector("#cef");
    await p.fill("#ceTitle", "Extra training");
    await p.click("#ceSave"); await p.waitForTimeout(200);
    assert.ok(/who it is for/.test(await p.$eval("#ceMsg", e => e.innerText)) && calPosts.length === 3, "a Hive event must say who it is for: " + calPosts.length);
    await p.fill("#cewhen .wsd", "2026-12-12"); await p.fill("#cewhen .wst", "19:00"); await p.fill("#cewhen .wet", "20:00");
    await p.click("#ceTgAll");
    assert.ok(await p.$$eval("#ceTg input[data-tg]", es => es.every(e => e.disabled)), "all schools disables the single ones");
    // roles, a Teams group, and named accounts of any school
    await p.click('#ceAud input[data-aud="老师"]');
    await p.fill("#ceTeams input", "grade"); await p.waitForSelector("#ceTeams .calpickopt"); await p.click("#ceTeams .calpickopt"); await p.waitForTimeout(100);
    assert.ok(/Grade 5 Team/.test(await p.$eval("#ceTeams .chips", e => e.innerText)), "the group is a chip");
    await p.fill("#cePeople input", "teach"); await p.waitForSelector("#cePeople .calpickopt");
    assert.strictEqual((await p.$$("#cePeople .calpickopt")).length, 2, "the search finds people of every school");
    await p.fill("#cePeople input", "teacher9@other.edu, ghost@nowhere.org"); await p.keyboard.press("Enter"); await p.waitForTimeout(100);
    assert.ok(/ghost@nowhere\.org/.test(await p.$eval("#cesum", e => e.innerText)) && /Not found/.test(await p.$eval("#cesum", e => e.innerText)), "an unknown account is refused with its name: " + await p.$eval("#cesum", e => e.innerText));
    assert.strictEqual((await p.$$("#cePeople .calchip")).length, 1, "the known one was added");
    assert.ok(/All schools/.test(await p.$eval("#cesum", e => e.innerText)) && /≈ 2 people/.test(await p.$eval("#cesum", e => e.innerText)), "the count: " + await p.$eval("#cesum", e => e.innerText));
    // 附件 (Rick, 2026-10-18): a PDF as a link — picked, uploaded in chunks, listed; a picture pasted; one removed
    assert.ok(await p.$("#ceFiles"), "the broadcast form has a files section");
    const pdfBytes = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(3 * 1024 * 1024, 0x20)]);
    await (await p.$("#ceFileAdd input")).setInputFiles({ name: "培训手册.pdf", mimeType: "application/pdf", buffer: pdfBytes }); await p.waitForTimeout(900);
    assert.strictEqual(filePosts.filter(x => x.name === "培训手册.pdf").length, 2, "3 MB go up in two 2 MB chunks");
    assert.deepStrictEqual(filePosts.filter(x => x.name === "培训手册.pdf").map(x => [x.index, x.total, x.size]), [[0, 2, pdfBytes.length], [1, 2, pdfBytes.length]]);
    assert.ok(/培训手册\.pdf/.test(await p.$eval("#ceFileList", e => e.innerText)) && /3\.0 MB/.test(await p.$eval("#ceFileList", e => e.innerText)), "listed with its size: " + await p.$eval("#ceFileList", e => e.innerText));
    await (await p.$("#ceFileAdd input")).setInputFiles({ name: "poster.png", mimeType: "image/png", buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]) }); await p.waitForTimeout(600);
    assert.strictEqual((await p.$$("#ceFileList .cefile")).length, 2, "two files");
    const tooBig = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(11 * 1024 * 1024, 0x20)]);
    await (await p.$("#ceFileAdd input")).setInputFiles({ name: "huge.pdf", mimeType: "application/pdf", buffer: tooBig }); await p.waitForTimeout(300);
    assert.ok(/超过 10 MB|over 10 MB/.test(await p.$eval("#ceFileMsg", e => e.innerText)) && (await p.$$("#ceFileList .cefile")).length === 2, "an 11 MB PDF is refused before any upload");
    await p.click('#ceFileList [data-frm="1"]'); await p.waitForTimeout(100);
    assert.strictEqual((await p.$$("#ceFileList .cefile")).length, 1, "the picture was removed");
    await p.screenshot({ path: OUT + "/calendar-hive-form.png" });
    await p.click("#ceSave"); await p.waitForTimeout(900);
    const sent = calPosts[3];
    assert.deepStrictEqual(sent.event.files.map(f => [f.name, f.type, f.size]), [["培训手册.pdf", "application/pdf", pdfBytes.length]], "the saved event carries the file: " + JSON.stringify(sent.event.files));
    assert.deepStrictEqual([sent.event.audience, sent.event.teams, sent.event.people], [["老师"], [{ id: TEAM_G5, name: "Grade 5 Team" }], ["teacher9@other.edu"]], JSON.stringify(sent.event));
    assert.deepStrictEqual([sent.layer, sent.op, sent.event.title, sent.event.targets, sent.event.allDay, sent.event.start], ["hive", "save", "Extra training", ["*"], false, "2026-12-12T19:00"], JSON.stringify(sent));
    const body = await p.$eval("#calbody", e => e.innerText); assert.ok(/Extra training/.test(body) && /All schools/.test(body), body.slice(0, 300));
    assert.ok(/📎 1/.test(body), "the list shows the paperclip count");
    // pushing: nothing is sent until a school is ticked; then the plan and the batches go to that school with layer hive
    syncPosts.length = 0;
    await p.click("#calPublish"); await p.waitForSelector("#calsynccard");
    assert.ok(!(await p.$("#calpick")), "the Hive panel has no school ticks: the event decides who is visited");
    await p.click("#calPlan"); await p.waitForTimeout(500);
    assert.ok(syncPosts.length >= 1 && syncPosts.every(x => x.layer === "hive" && x.op === "syncplan"), JSON.stringify(syncPosts));
    assert.ok(/add 5/.test(await p.$eval("#calsyncout", e => e.innerText)), "plan shown");
    await p.screenshot({ path: OUT + "/calendar-hive-sync.png" });
  });
  // 不接收广播的名单: the accounts that do not receive 系统广播 — a tab of the calendar page (2026-10-18); the old link still lands there.
  await shot("broadcast-optout", 1280, 900, "#/domain/broadcast", "zh", ["staff:community"], async p => {
    await p.waitForTimeout(800);
    assert.ok(!/广播名单/.test(await p.$eval("#nav", e => e.innerText)), "no sidebar entry of its own any more");
    assert.ok(await p.$('#caltabs a[data-layer="optout"].on') && /不接收广播的名单/.test(await p.$eval("#caltabs", e => e.innerText)), "the list is the third tab of 校历, open");
    let body = await p.$eval("#bcbody", e => e.innerText);
    assert.ok(/Parent One|parent1@/.test(body) && /家长要求/.test(body) && /1 个账号不接收广播/.test(body), "the list is shown with its reason: " + body.slice(0, 300));
    await p.fill("#bcpick input", "teacher n"); await p.waitForSelector("#bcpick .calpickopt"); await p.click("#bcpick .calpickopt"); await p.waitForTimeout(100);
    assert.ok(/Teacher Nine/.test(await p.$eval("#bcpick .chips", e => e.innerText)), "a person is picked");
    await p.fill("#bcreason", "教师不参加联合培训"); await p.click("#bcadd"); await p.waitForTimeout(800);
    assert.deepStrictEqual([bcPosts[0].op, bcPosts[0].upn, bcPosts[0].on, bcPosts[0].reason], ["optout", "teacher9@other.edu", true, "教师不参加联合培训"], JSON.stringify(bcPosts[0]));
    body = await p.$eval("#bcbody", e => e.innerText); assert.ok(/Teacher Nine/.test(body) && /2 个账号不接收广播/.test(body), "listed after adding: " + body.slice(0, 300));
    await p.screenshot({ path: OUT + "/broadcast-optout.png" });
    // an unknown account is refused by name
    await p.fill("#bcpick input", "ghost@nowhere.org"); await p.keyboard.press("Enter"); await p.waitForTimeout(100);
    assert.ok(/ghost@nowhere\.org/.test(await p.$eval("#bcnote", e => e.innerText)), "unknown account named");
    // the System broadcast form tells how many are left out
    await p.click('#bcbody [data-bcrm="teacher9@other.edu"]'); await p.waitForTimeout(700);
    assert.strictEqual(bcPosts[1].on, false); assert.ok(!/Teacher Nine/.test(await p.$eval("#bctable", e => e.innerText)), "removed from the list");
  });
  await shot("broadcast-form-skipped", 1280, 900, "#/domain/calendar", "en", ["staff:community"], async p => {
    await p.waitForTimeout(800);
    await p.click('#caltabs a[data-layer="hive"]'); await p.waitForSelector(".calmonth");
    await p.click("#calAdd"); await p.waitForSelector("#cewho");
    await p.click("#ceTgAll"); await p.click('#ceAud input[data-aud="家长"]'); await p.waitForTimeout(100);
    const sm = await p.$eval("#cesum", e => e.innerText);
    assert.ok(/All schools/.test(sm) && /on the Not receiving broadcasts list/.test(sm) && /≈ 0 people/.test(sm), "the only parent is on the list, so none receive it, and the form says so: " + sm);
    await p.keyboard.press("Escape"); await p.waitForTimeout(300);
  });
  // a school's 教育领袖 keeps the list of their own school, from the calendar page's tab
  await shot("broadcast-leader", 1280, 900, "#/domain/calendar", "zh", ["domain_leader:bes.qiaoliang.online"], async p => {
    await p.waitForTimeout(800);
    assert.ok(await p.$('#caltabs a[data-layer="school"].on') && await p.$('#caltabs a[data-layer="optout"]') && !(await p.$('#caltabs a[data-layer="hive"]')), "a leader has the school tab and the list tab, no broadcast tab");
    await p.click('#caltabs a[data-layer="optout"]'); await p.waitForSelector("#bcbody table"); await p.waitForTimeout(200);
    assert.ok(!(await p.$("#bcsel")) && /Parent One|parent1@/.test(await p.$eval("#bcbody", e => e.innerText)), "their own school only, no school picker");
    assert.ok(await p.$('#bcbody [data-bcrm]'), "with a Remove button per account");
    await p.click('#caltabs a[data-layer="school"]'); await p.waitForSelector(".calmonth, #caltable");
    assert.ok(await p.$("#calAdd"), "back on the school calendar with its buttons");
  });
  // 教育社区经理 (and 课程总监): every school's calendar, and the Hive layer for chosen schools, roles, Teams groups and people.
  await shot("calendar-community", 1280, 900, "#/domain/calendar", "en", ["staff:community"], async p => {
    await p.waitForTimeout(800);
    assert.strictEqual((await p.$$("#caltabs a[data-layer]")).length, 3, "the community manager has all three tabs (school, broadcast, the list)");
    assert.ok(await p.$eval("#calAdd", e => !e.hidden) && await p.$eval("#calPublish", e => !e.hidden), "and may add to and publish a school's calendar");
    await p.click('#caltabs a[data-layer="hive"]'); await p.waitForSelector(".calmonth");
    assert.ok(await p.$eval("#calAdd", e => !e.hidden) && await p.$eval("#calPublish", e => !e.hidden), "and on the Hive layer");
    await p.click("#calAdd"); await p.waitForSelector("#cewho");
    await p.fill("#ceTitle", "Parents of one school"); await p.click('#ceAud input[data-aud="家长"]');
    assert.ok(/All schools/.test(await p.$eval("#cesum", e => e.innerText)), "a role with no school chosen means every school: " + await p.$eval("#cesum", e => e.innerText));
    await p.keyboard.press("Escape"); await p.waitForTimeout(300);
  });
  // 校历 views: month (default), week, list; the year and month pickers; a day opens the add form with that date.
  await shot("calendar-month", 1280, 900, "#/domain/calendar", "zh", ["domain_leader:bes.qiaoliang.online"], async p => {
    await p.waitForTimeout(800);
    assert.ok(await p.$(".calmonth"), "the month grid is the default view");
    assert.strictEqual(await p.$$eval(".calcell", es => es.length % 7), 0, "whole weeks");
    assert.ok(await p.$$eval("#calyear option", es => es.length >= 8), "a year picker");
    await p.selectOption("#calyear", "2026"); await p.selectOption("#calmon", "12"); await p.waitForTimeout(150);
    assert.ok(/2026年12月/.test(await p.$eval(".caltitle", e => e.innerText)), "title follows the pickers");
    const chip = await p.$('.calcell[data-day="2026-12-05"] .calev.hive');
    assert.ok(chip && /联合教师培训/.test(await chip.innerText()) && /19:00/.test(await chip.innerText()), "Hive's event is on 5 December with its time");
    assert.strictEqual(await p.$$eval('.calcell[data-day="2026-12-04"] .calev', es => es.length), 0, "and not on the 4th");
    await p.click('.calcell[data-day="2026-12-09"] .calnum'); await p.waitForTimeout(150);
    assert.ok(/12月9日/.test(await p.$eval(".calagh b", e => e.innerText)) && /没有事件/.test(await p.$eval(".calagenda", e => e.innerText)), "a day shows its agenda");
    await p.click("#calAddDay"); await p.waitForSelector("#cef");
    assert.deepStrictEqual(await whenVal(p, "#cewhen"), ["2026-12-09T09:00", "2026-12-09T10:00"], "the form starts on the chosen day");
    await p.keyboard.press("Escape"); await p.waitForTimeout(300);
    await p.screenshot({ path: OUT + "/calendar-month-view.png" });
    await p.click('[data-nav="next"]'); await p.waitForTimeout(150);
    assert.ok(/2027年1月/.test(await p.$eval(".caltitle", e => e.innerText)), "next month crosses the year");
    await p.click('[data-nav="prev"]'); await p.click('[data-nav="prev"]'); await p.waitForTimeout(150);
    assert.ok(/2026年11月/.test(await p.$eval(".caltitle", e => e.innerText)), "previous month");
    await p.click('[data-nav="today"]'); await p.waitForTimeout(150);
    assert.ok(await p.$(".calcell.today"), "today is marked");
    // the week
    await p.selectOption("#calyear", "2026"); await p.selectOption("#calmon", "12"); await p.click('#calview [data-view="week"]'); await p.waitForTimeout(250);
    assert.ok(await p.$(".calweek") && (await p.$$(".calwd")).length === 7, "seven day columns");
    await p.click('.calwd[data-day="2026-12-03"]'); await p.waitForTimeout(100);
    await p.click('[data-nav="prev"]'); await p.click('[data-nav="next"]'); await p.waitForTimeout(100);
    const blk = await p.$('.calcol[data-newday="2026-12-05"] .calblk.hive');
    assert.ok(blk && /联合教师培训/.test(await blk.innerText()), "the event block carries its title");
    assert.ok(!(await blk.evaluate(e => e.classList.contains("drag"))), "a broadcast seen from the school's calendar cannot be dragged there");
    await p.screenshot({ path: OUT + "/calendar-week-view.png" });
    await p.click('#calview [data-view="list"]'); await p.waitForTimeout(150);
    assert.ok(await p.$("#caltable") && !(await p.$(".calmonth")), "the list view is still there");
  });
  // Outlook / Teams style creation: double-click a day, drag over time, type the title, adjust the time.
  const HR = 56; // px per hour in the week grid (CAL_HOUR)
  await shot("calendar-quick", 1280, 900, "#/domain/calendar", "zh", ["domain_leader:bes.qiaoliang.online"], async p => {
    await p.waitForTimeout(800);
    await p.selectOption("#calyear", "2026"); await p.selectOption("#calmon", "12"); await p.waitForTimeout(150);
    const before = calPosts.length;
    // month: a double-click on a day opens the card as a timed event (9:00–10:00) on that day, so the time can be chosen
    await p.dblclick('.calcell[data-day="2026-12-16"]'); await p.waitForSelector(".calquick");
    assert.ok(!(await p.$eval(".calquick .qallday", e => e.checked)) && (await whenVal(p, ".calquick .calwhen")).join() === "2026-12-16T09:00,2026-12-16T10:00", "a timed card for the clicked day: " + (await whenVal(p, ".calquick .calwhen")).join());
    assert.ok(await p.isVisible(".calquick .wst"), "the time lists are there");
    assert.ok(await p.$eval(".calquick .qtitle", e => e === document.activeElement), "the title is ready to type");
    await p.click(".calquick .qsave"); await p.waitForTimeout(150);
    assert.ok(/标题/.test(await p.$eval(".calquick .qmsg", e => e.innerText)) && calPosts.length === before, "a title is required");
    await p.fill(".calquick .qtitle", "圣诞假期"); await p.keyboard.press("Enter"); await p.waitForTimeout(700);
    const sent = calPosts[before];
    assert.deepStrictEqual([sent.op, sent.event.title, sent.event.allDay, sent.event.start, sent.event.end, sent.event.audience, sent.event.reminder], ["save", "圣诞假期", false, "2026-12-16T09:00", "2026-12-16T10:00", [], 15], JSON.stringify(sent));
    assert.ok(!(await p.$(".calquick")) && /圣诞假期/.test(await p.$eval('.calcell[data-day="2026-12-16"]', e => e.innerText)), "saved and drawn in the cell");
    await p.screenshot({ path: OUT + "/calendar-quick-month.png" });
    // Escape cancels
    await p.dblclick('.calcell[data-day="2026-12-17"]'); await p.waitForSelector(".calquick"); await p.keyboard.press("Escape"); await p.waitForTimeout(100);
    assert.ok(!(await p.$(".calquick")) && calPosts.length === before + 1, "Escape closes it without saving");
    // week: drag from 10:00 to 11:30 on the 16th
    await p.click('#calview [data-view="week"]'); await p.waitForTimeout(250);
    const col = await p.$('.calcol[data-newday="2026-12-16"]'); const bb = await col.boundingBox();
    const y10 = bb.y + 10 * HR, y1130 = bb.y + 11.5 * HR;
    // the week scrolls to its first event; bring 10:00-11:30 into view first
    await p.evaluate(() => { document.getElementById("calwk").scrollTop = 8 * 56; }); await p.waitForTimeout(100);
    const bb2 = await (await p.$('.calcol[data-newday="2026-12-16"]')).boundingBox();
    await p.mouse.move(bb2.x + 40, bb2.y + 10 * HR + 2); await p.mouse.down(); await p.mouse.move(bb2.x + 40, bb2.y + 10.8 * HR, { steps: 4 }); await p.mouse.move(bb2.x + 40, bb2.y + 11.5 * HR - 2, { steps: 4 }); await p.mouse.up();
    await p.waitForSelector(".calquick");
    assert.deepStrictEqual(await whenVal(p, ".calquick .calwhen"), ["2026-12-16T10:00", "2026-12-16T11:30"], "dragging 10:00-11:30 fills the times");
    assert.ok(/1 小时 30 分钟/.test(await p.$eval(".calquick .wdur", e => e.innerText)), "the length is shown");
    assert.ok(await p.$(".calghost"), "the selection stays drawn while the card is open");
    await p.fill(".calquick .qtitle", "家长会"); await p.fill(".calquick .wet", "12:00");
    assert.ok(/2 小时/.test(await p.$eval(".calquick .wdur", e => e.innerText)), "the length follows the end time");
    await p.screenshot({ path: OUT + "/calendar-quick-week.png" });
    await p.click(".calquick .qsave"); await p.waitForTimeout(700);
    const s2 = calPosts[calPosts.length - 1];
    assert.deepStrictEqual([s2.event.title, s2.event.allDay, s2.event.start, s2.event.end, s2.event.timeZone], ["家长会", false, "2026-12-16T10:00", "2026-12-16T12:00", "Asia/Shanghai"], JSON.stringify(s2));
    assert.ok(await p.$('.calcol[data-newday="2026-12-16"] .calblk.school'), "the new block is in the week");
    // double-click an empty slot: one hour, from the half hour clicked; 更多选项 carries what was typed into the full form
    await p.evaluate(() => { document.getElementById("calwk").scrollTop = 8 * 56; });
    const bb3 = await (await p.$('.calcol[data-newday="2026-12-15"]')).boundingBox();
    await p.mouse.dblclick(bb3.x + 40, bb3.y + 14 * HR + 10); await p.waitForSelector(".calquick");
    assert.deepStrictEqual(await whenVal(p, ".calquick .calwhen"), ["2026-12-15T14:00", "2026-12-15T15:00"], "a double-click makes a one-hour slot");
    assert.strictEqual(await p.$eval(".calquick .qzonesel", e => e.value), "Asia/Shanghai", "the time zone starts as Beijing time");
    // choose the time like in Outlook: 8:00 – 8:45; moving the start moves the end, the length is shown
    await p.fill(".calquick .wst", "08:00");
    assert.deepStrictEqual(await whenVal(p, ".calquick .calwhen"), ["2026-12-15T08:00", "2026-12-15T09:00"], "moving the start keeps the length");
    await p.fill(".calquick .wet", "08:45");
    assert.ok(/45 分钟/.test(await p.$eval(".calquick .wdur", e => e.innerText)), "45 minutes");
    await p.fill(".calquick .wst", "08:14"); // minute precision: 8:14 works, the end follows by the same length
    assert.deepStrictEqual(await whenVal(p, ".calquick .calwhen"), ["2026-12-15T08:14", "2026-12-15T08:59"], "8:14 can be entered");
    await p.fill(".calquick .wst", "08:00"); await p.fill(".calquick .wet", "08:45");
    await p.fill(".calquick .wet", "07:30");
    assert.ok(/晚于/.test(await p.$eval(".calquick .wdur", e => e.innerText)), "an end before the start is flagged");
    await p.fill(".calquick .wet", "08:45");
    await p.fill(".calquick .qtitle", "教师培训"); await p.click(".calquick .qmore"); await p.waitForSelector("#cef");
    assert.deepStrictEqual([await p.$eval("#ceTitle", e => e.value), await whenVal(p, "#cewhen")], ["教师培训", ["2026-12-15T08:00", "2026-12-15T08:45"]], "the full form has what was typed");
    assert.ok(!(await p.$(".calquick")), "the card closes");
    await p.click("#panel .x"); await p.waitForTimeout(150);
    // 2026-10-18 (Rick: 「日历事件显示不全面，也无法拖动」) — an hour-long block has two title lines and the time; blocks drag
    const fam = await p.$('.calcol[data-newday="2026-12-16"] .calblk.school.drag[title="家长会"]'); assert.ok(fam, "the leader's own event may be dragged");
    assert.strictEqual(await fam.$eval("b", e => e.style.webkitLineClamp || e.style.getPropertyValue("-webkit-line-clamp")), "5", "a two-hour block gives the title five lines (an hour gives two)");
    const famId = await fam.getAttribute("data-ev");
    assert.ok(await fam.$(".rz"), "with a handle at the bottom to change the end");
    await p.evaluate(() => { document.getElementById("calwk").scrollTop = 8 * 56; }); await p.waitForTimeout(100);
    // move 家长会 (10:00–12:00) down two hours and one day to the right: 12:00–14:00 on the 17th
    let fb = await fam.boundingBox(); const c17 = await (await p.$('.calcol[data-newday="2026-12-17"]')).boundingBox();
    const posts0 = calPosts.length;
    await p.mouse.move(fb.x + 30, fb.y + 20); await p.mouse.down(); await p.mouse.move(fb.x + 30, fb.y + 60, { steps: 3 }); await p.mouse.move(c17.x + 30, fb.y + 20 + 2 * HR, { steps: 5 });
    assert.ok(await p.$('.calcol[data-newday="2026-12-17"] .calghost'), "a ghost follows the pointer into the other day");
    assert.ok(/12:00–14:00/.test(await p.$eval('.calcol[data-newday="2026-12-17"] .calghost', e => e.innerText)), "and shows the new time");
    await p.mouse.up(); await p.waitForTimeout(600);
    const mv = calPosts[posts0];
    assert.deepStrictEqual([mv.op, mv.event.id, mv.event.title, mv.event.start, mv.event.end, mv.event.timeZone], ["save", famId, "家长会", "2026-12-17T12:00", "2026-12-17T14:00", "Asia/Shanghai"], "the move is saved with the same id and length: " + JSON.stringify(mv));
    assert.ok(!(await p.$("#panel.open")) && !(await p.$(".calquick")), "the drop does not open the event");
    assert.ok(/再点一次「发布」/.test(await p.$eval("#flash", e => e.innerText)), "and says to publish again");
    await p.evaluate(() => { document.getElementById("calwk").scrollTop = 8 * 56; }); await p.waitForTimeout(100);
    // the bottom edge changes the end: 14:00 → 15:30
    const fam2 = await p.$('.calcol[data-newday="2026-12-17"] .calblk.school.drag[title="家长会"]'); fb = await fam2.boundingBox();
    await p.mouse.move(fb.x + 30, fb.y + fb.height - 3); await p.mouse.down(); await p.mouse.move(fb.x + 30, fb.y + fb.height + 40, { steps: 3 }); await p.mouse.move(fb.x + 30, fb.y + fb.height + 1.5 * HR, { steps: 3 }); await p.mouse.up(); await p.waitForTimeout(600);
    const rs = calPosts[posts0 + 1];
    assert.deepStrictEqual([rs.event.start, rs.event.end], ["2026-12-17T12:00", "2026-12-17T15:30"], "the end moved, the start stayed: " + JSON.stringify(rs));
    // a plain click still opens the event
    await p.evaluate(() => { document.getElementById("calwk").scrollTop = 8 * 56; }); await p.waitForTimeout(100);
    await p.click('.calcol[data-newday="2026-12-17"] .calblk.school[title="家长会"]'); await p.waitForSelector("#cef");
    assert.strictEqual(await p.$eval("#ceTitle", e => e.value), "家长会", "a click opens the form");
    await p.click("#panel .x"); await p.waitForTimeout(150);
    await p.screenshot({ path: OUT + "/calendar-week-drag.png" });
    // month: drag 圣诞假期 from the 16th to the 18th
    await p.click('#calview [data-view="month"]'); await p.waitForTimeout(250);
    const chip = await p.$('.calcell[data-day="2026-12-16"] .calev.drag'); assert.ok(chip, "chips in the month may be dragged");
    const cb = await chip.boundingBox(), cell18 = await (await p.$('.calcell[data-day="2026-12-18"]')).boundingBox();
    await p.mouse.move(cb.x + 20, cb.y + 8); await p.mouse.down(); await p.mouse.move(cb.x + 60, cb.y + 20, { steps: 3 }); await p.mouse.move(cell18.x + cell18.width / 2, cell18.y + cell18.height / 2, { steps: 5 });
    assert.ok(await p.$eval('.calcell[data-day="2026-12-18"]', e => e.classList.contains("drop")), "the day under the pointer is marked");
    await p.mouse.up(); await p.waitForTimeout(600);
    const md = calPosts[posts0 + 2];
    assert.deepStrictEqual([md.event.title, md.event.start, md.event.end], ["圣诞假期", "2026-12-18T09:00", "2026-12-18T10:00"], "the day changed, the times stayed: " + JSON.stringify(md));
    assert.ok(/圣诞假期/.test(await p.$eval('.calcell[data-day="2026-12-18"]', e => e.innerText)) && !/圣诞假期/.test(await p.$eval('.calcell[data-day="2026-12-16"]', e => e.innerText)), "drawn on the new day only");
    assert.ok(!(await p.$("#panel.open")), "the drop does not open the event");
  });

  // 我的校历 (Rick, 2026-10-18): an ordinary account sees, read-only, the events addressed to it, with 未发布 marked.
  await shot("calendar-mine", 1280, 900, "#/calendar", "zh", [], async p => {
    await p.waitForTimeout(800);
    assert.ok(/我的日历/.test(await p.$eval("#nav", e => e.innerText)) && !/学校管理|日历管理/.test(await p.$eval("#nav", e => e.innerText)), "the sidebar has 我的日历 under the account and no school-management group");
    assert.ok(!(await p.$("#caltabs a[data-layer]")) && !(await p.$("#calAdd")) && !(await p.$("#calPublish")) && !(await p.$("#calsel")), "no layer tabs, add, publish or school picker");
    assert.ok(await p.$eval("#caltabs", e => e.hidden && !e.innerText.trim()), "no school pill or second ⓘ: the tabs row is empty and hidden");
    await p.click('#calview [data-view="list"]'); await p.waitForTimeout(150);
    const txt = await p.$eval("#caltable", e => e.innerText);
    assert.ok(/家长会/.test(txt) && /圣诞假期/.test(txt) && /联合教师培训/.test(txt), "school events and broadcasts addressed to me, together: " + txt.slice(0, 120));
    assert.strictEqual((await p.$$("#caltable .tag.warn")).length, 1, "the one unpublished event is marked");
    await p.click('#calview [data-view="month"]'); await p.selectOption("#calyear", "2026"); await p.selectOption("#calmon", "12"); await p.waitForTimeout(150);
    assert.ok(await p.$('.calcell[data-day="2026-12-24"] .calev.unpub') && !(await p.$(".calev.drag")), "the unpublished chip is dashed; nothing drags");
    await p.click('.calcell[data-day="2026-12-10"] .calev'); await p.waitForSelector("#panel.open");
    const note = await p.$eval("#panel", e => e.innerText);
    assert.ok(/已在你的 Outlook 和 Teams 日历里/.test(note) && !(await p.$("#cef")), "the panel is read-only and says the event is in my calendars");
    await p.click("#panel .x"); await p.waitForTimeout(150);
    await p.click('.calcell[data-day="2026-12-24"] .calev'); await p.waitForSelector("#panel.open");
    assert.ok(/尚未发布/.test(await p.$eval("#panel", e => e.innerText)), "an unpublished one says so");
    await p.click("#panel .x"); await p.waitForTimeout(150);
    const beforeDbl = calPosts.length;
    await p.dblclick('.calcell[data-day="2026-12-16"]'); await p.waitForTimeout(200);
    assert.ok(!(await p.$(".calquick")) && calPosts.length === beforeDbl, "a double-click does not create anything");
    await p.screenshot({ path: OUT + "/calendar-mine.png" });
  });
  // a leader going from 我的校历 to the school's calendar gets the school layer, not a stale one
  await shot("calendar-mine-to-school", 1280, 900, "#/calendar", "zh", ["domain_leader:bes.qiaoliang.online"], async p => {
    await p.waitForTimeout(600);
    assert.ok(!(await p.$("#calAdd")), "我的校历 is read-only even for a leader");
    await p.click('#nav a[href="#/domain/calendar"]'); await p.waitForTimeout(600);
    assert.ok(await p.$('#caltabs a[data-layer="school"].on') && await p.$("#calAdd"), "the school calendar opens on its own layer with its buttons");
  });

  // the month on a phone: dots in the cells, the day's agenda below, no sideways scrolling of the page
  await shot("calendar-month-phone", 390, 800, "#/domain/calendar", "zh", ["domain_leader:bes.qiaoliang.online"], async p => {
    await p.waitForTimeout(800);
    await p.selectOption("#calyear", "2026"); await p.selectOption("#calmon", "12"); await p.waitForTimeout(150);
    await p.click('.calcell[data-day="2026-12-05"] .calnum'); await p.waitForTimeout(150);
    assert.ok(/联合教师培训/.test(await p.$eval(".calagenda", e => e.innerText)), "the agenda lists the day's event");
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "the page does not scroll sideways");
    assert.ok((await (await p.$('.calcell[data-day="2026-12-05"] .calev')).boundingBox()).width <= 10, "a dot in the cell");
  });
  // The sysadmin: 课程方案 beside the accounts pages, the school picker; 角色分配 offers 教育领袖.
  await shot("plan-admin", 1280, 800, "#/domain/plan", "en", ["admin"], async p => {
    await p.waitForTimeout(800);
    const nv = await p.$eval("#nav", e => e.innerText); if (!/Curriculum Map/.test(nv) || !/User management/.test(nv)) throw new Error("admin nav: " + nv);
    if (!/#\/plan$|#\/domain\/plan$/.test(await p.evaluate(() => location.hash))) throw new Error("old link still opens the plan");
    if (!(await p.$("#plsel"))) throw new Error("no school picker for the admin");
    assert.deepStrictEqual(await p.$$eval("#pltabs a[data-tab]", es => es.map(e => e.textContent)), ["Curriculum map", "Graduation requirements"], "two tabs");
    assert.ok(/Pedagogy/.test(await p.$eval("#plframe", e => e.innerText)), "the school's frame for the admin");
    // Header shape (Rick 2026-10-13): actions in the top bar, picker + status on the bar's right, no toolbar row above.
    if (!(await p.$("#topActions #plPub")) || !(await p.$("#plframe #plsel")) || (await p.$("#plstatus"))) throw new Error("plan header layout");
    await p.screenshot({ path: OUT + "/plan-admin-frame.png", clip: { x: 240, y: 50, width: 1040, height: 200 } });
    const hs = await p.evaluate(() => [document.getElementById("pltabs").getBoundingClientRect().height, document.getElementById("plframe").getBoundingClientRect().height, document.querySelector(".plframe") ? document.querySelector(".plframe").getBoundingClientRect().height : -1]);
    assert.ok(hs[0] < 60 && hs[1] < 60, "the tabs row and the frame row are each one line: " + JSON.stringify(hs));
    await p.screenshot({ path: OUT + "/plan-admin-zh-header.png", clip: { x: 240, y: 100, width: 1040, height: 360 } });
    await p.click('#nav a[href="#/system/roles"]'); await p.waitForTimeout(600);
    if (!/Education leader/.test(await p.$eval("#rbar", e => e.innerText))) throw new Error("no leader filter chip");
    await p.click('#rtable tr[data-user="mei.wang@bes.qiaoliang.online"]'); await p.waitForTimeout(400);
    if (!(await p.$('#rschools input[data-role="leader"]'))) throw new Error("no 教育领袖 switch in the school card");
    await p.click('#rschools label.sw:has(input[data-role="leader"]) .track'); await p.waitForTimeout(100);
    if (!/Education leader · Beijing Example School/.test(await p.$eval("#rprev", e => e.innerText))) throw new Error("preview: " + await p.$eval("#rprev", e => e.innerText));
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
  // Page header (Rick, 2026-10-19): no title row on a computer; the buttons join the page's first row when it is a
  // toolbar or a tabs row, else they form a left-aligned command bar.
  await shot("header-actions", 1280, 700, "#/domain/users", "en", ["admin", "staff:sysadmin"], async p => {
    await p.waitForTimeout(500);
    let r = await p.evaluate(() => { const a = document.getElementById("topActions"), tb = document.querySelector(".topbar"); return { inToolbar: !!a.closest("#content .toolbar"), barHidden: getComputedStyle(tb).display === "none", titleShown: getComputedStyle(document.getElementById("title")).display !== "none", csv: !!document.getElementById("csv") }; });
    assert.deepStrictEqual(r, { inToolbar: true, barHidden: true, titleShown: false, csv: true }, "users: Export CSV sits on the toolbar row, no title row: " + JSON.stringify(r));
    await p.evaluate(() => { location.hash = "#/dashboard"; }); await p.waitForTimeout(700);
    r = await p.evaluate(() => { const a = document.getElementById("topActions"), tb = document.querySelector(".topbar"), ar = a.getBoundingClientRect(), tr = tb.getBoundingClientRect(); return { inBar: a.parentNode === tb, barShown: getComputedStyle(tb).display !== "none", leftAligned: ar.left - tr.left < 60, titleShown: getComputedStyle(document.getElementById("title")).display !== "none", n: a.children.length }; });
    assert.ok(r.inBar && r.barShown && r.leftAligned && !r.titleShown && r.n > 0, "dashboard: a left-aligned command bar, no title: " + JSON.stringify(r));
    await p.evaluate(() => { location.hash = "#/domain/users"; }); await p.waitForTimeout(700);
    assert.ok(await p.$("#content .toolbar #topActions #csv"), "back on users the buttons are on the toolbar again");
  });
  // 新建账号: the result shows the licence that was assigned (the page read 'license' while the API said 'licence' and
  // always printed 分配失败 — Rick, 2026-10-20); a real failure shows Microsoft's reason.
  await shot("users-create", 1280, 900, "#/domain/users", "zh", ["admin", "staff:sysadmin"], async p => {
    await p.waitForSelector("#dsel"); await p.selectOption("#dsel", "bes.qiaoliang.online"); await p.waitForSelector("#utable tr[data-upn]:not([data-dom])"); await p.waitForTimeout(300);
    await p.waitForSelector("#newUser"); await p.click("#newUser"); await p.waitForSelector("#panel.open #nuAcct");
    await p.fill("#nuAcct", "eason.huang"); await p.fill("#nuGiv", "Eason"); await p.fill("#nuSur", "Huang"); await p.selectOption("#nuId", "家长");
    // city ⇄ postcode (Rick, 2026-10-20): typing 深圳市 fills 518000; typing a postcode fills the city
    await p.fill("#nuCity", "深圳市"); await p.$eval("#nuCity", e => e.dispatchEvent(new Event("change", { bubbles: true })));
    assert.strictEqual(await p.inputValue("#nuZip"), "518000", "the city fills the postcode");
    await p.fill("#nuZip", ""); await p.fill("#nuCity", ""); await p.fill("#nuZip", "100086"); await p.$eval("#nuZip", e => e.dispatchEvent(new Event("change", { bubbles: true })));
    assert.strictEqual(await p.inputValue("#nuCity"), "北京", "the postcode fills the city");
    await p.fill("#nuCity", "深圳"); await p.fill("#nuZip", "518000");
    await p.waitForSelector('#nuPlans input[name="nuPlan"]'); await p.click('#nuPlans input[name="nuPlan"][value="faculty"]');
    await p.click("#nuSave"); await p.waitForTimeout(500);
    const txt = await p.$eval("#panel .pb", e => e.innerText);
    assert.ok(/账号已创建/.test(txt) && /Office 365 A1 for faculty \+ Power Automate Free/.test(txt) && !/分配失败/.test(txt), "the licence line names the plans: " + txt.slice(0, 300));
    assert.strictEqual(createdUsers[createdUsers.length - 1].plan, "faculty");
    await p.screenshot({ path: OUT + "/users-create.png" });
    // a real failure says why
    CREATE_LICENCE = { ok: false, plans: ["Office 365 A1 for faculty"], error: "Subscription with SKU … does not have any available licenses.", code: "Request_BadRequest" };
    await p.click("#panel .x"); await p.waitForSelector("#panel:not(.open)"); await p.click("#newUser"); await p.waitForSelector("#panel.open #nuAcct");
    await p.fill("#nuAcct", "mia.li"); await p.fill("#nuGiv", "Mia"); await p.fill("#nuSur", "Li"); await p.selectOption("#nuId", "家长"); await p.fill("#nuCity", "深圳"); await p.fill("#nuZip", "518000");
    await p.waitForSelector('#nuPlans input[name="nuPlan"]'); await p.click('#nuPlans input[name="nuPlan"][value="faculty"]'); await p.click("#nuSave"); await p.waitForTimeout(500);
    assert.ok(/分配失败：Subscription with SKU … does not have any available licenses/.test(await p.$eval("#panel .pb", e => e.innerText)), "the failure carries Microsoft's reason");
    CREATE_LICENCE = { ok: true, plans: ["Office 365 A1 for faculty", "Power Automate Free"] };
    await p.click("#panel .x"); await p.waitForSelector("#panel:not(.open)");
  });
  // 教师资料 (2026-10-20): a teacher edits photo / 简介 / 专长 as a draft and submits; the curriculum director approves.
  await shot("teacher-mine", 1280, 900, "#/teacher", "zh", ["x:teacher"], async p => {
    await p.waitForSelector("#teBio");
    assert.ok(/教师资料/.test(await p.$eval("#nav", e => e.innerText)) && !/学校管理/.test(await p.$eval("#nav", e => e.innerText)), "a teacher sees 教师资料 under 我的账号 and no school group");
    assert.ok(/Zhang Lao/.test(await p.$eval("#teCard", e => e.innerText)) && /Math/.test(await p.$eval("#teCard", e => e.innerText)) && !(await p.$("#teSubmit")), "own record, the Airtable facts, no submit before a change");
    await p.fill("#teBio", "教数学十年，喜欢用故事讲概念。"); await p.waitForTimeout(1900);
    assert.deepStrictEqual(tPatches[tPatches.length - 1], { id: "recTEACH000000001", key: "bio", value: "教数学十年，喜欢用故事讲概念。" }, "the biography autosaves");
    await p.waitForSelector("#teSubmit");
    await p.fill("#teExp", "小学数学、奥数入门"); await p.waitForTimeout(1900);
    assert.strictEqual(tPatches[tPatches.length - 1].key, "expertise");
    // the photo: a small PNG from the repo, cropped and sent as a JPEG data URL
    await p.setInputFiles("#tePhotoFile", "/tmp/claude-0/-home-claude/27981cac-7b36-5135-8725-84dc55cbba17/scratchpad/photo.png"); await p.waitForTimeout(1200);
    assert.ok(tPhotos.length === 1 && tPhotos[0] > 1000, "the photo went up as a JPEG data URL");
    await p.waitForSelector("#teBio"); await p.screenshot({ path: OUT + "/teacher-mine.png" });
    await p.click("#teSubmit"); await p.waitForTimeout(600);
    assert.ok(/等待课程总监批准/.test(await p.$eval("#teStatus", e => e.innerText)) && !(await p.$("#teSubmit")), "submitted: waiting for the approver, no second submit");
  });
  await shot("teachers-admin", 1280, 900, "#/domain/teachers", "zh", ["admin", "staff:sysadmin"], async p => {
    await p.waitForSelector("#tetable tr[data-id]");
    assert.ok(/教师资料/.test(await p.$eval("#nav .nav-group:nth-of-type(2), #nav", e => e.innerText)), "教师资料 in the sidebar");
    const txt = await p.$eval("#tetable", e => e.innerText);
    assert.ok(/Zhang Lao/.test(txt) && /Mr Lee/.test(txt) && /待审批/.test(await p.$eval("#tebar", e => e.innerText)), "both teachers, a pending count: " + txt.slice(0, 200));
    await p.click('#tebar .chip[data-f="pending"]'); await p.waitForTimeout(150);
    assert.strictEqual((await p.$$("#tetable tr[data-id]")).length, 1, "the pending filter keeps the submitted one");
    await p.click('#tetable tr[data-id="recTEACH000000001"]'); await p.waitForSelector("#panel.open #teApprove");
    await p.screenshot({ path: OUT + "/teachers-admin.png" });
    p.once("dialog", d => d.accept());
    await p.click("#teApprove"); await p.waitForTimeout(700);
    assert.deepStrictEqual(tApproved, ["recTEACH000000001"], "approved → Airtable");
    assert.ok(/已发布到网站/.test(await p.$eval("#panel #teStatus", e => e.innerText)), "the panel says published");
    await p.click("#panel .x"); await p.waitForSelector("#panel:not(.open)");
  });
  // 批量设置身份 (2026-10-21): preview, then apply with the write-back to Office 365
  await shot("users-identity-bulk", 1280, 900, "#/domain/users", "zh", ["admin", "staff:sysadmin"], async p => {
    await p.waitForSelector("#dsel"); await p.selectOption("#dsel", "bes.qiaoliang.online"); await p.waitForSelector("#utable tr[data-upn]:not([data-dom])"); await p.waitForTimeout(300);
    await p.click("#idBulk"); await p.waitForSelector("#panel.open #ibId");
    await p.selectOption("#ibId", "老师"); await p.check("#ibWrite");
    assert.ok(await p.$eval("#ibGo", e => e.disabled), "执行 waits for the preview");
    await p.click("#ibPreview"); await p.waitForTimeout(400);
    assert.deepStrictEqual(idBulk[idBulk.length - 1], { domain: "bes.qiaoliang.online", identity: "老师", scope: "all", includeStudentPlan: false, writeBack: true, dryRun: true }, "the dry run");
    const msg = await p.$eval("#ibMsg", e => e.innerText);
    assert.ok(/将把 \d+ 个账号的身份设为「老师」，并写入 Office 365/.test(msg) && /跳过 1 个：1 学生版许可/.test(msg), "the preview names the counts: " + msg);
    assert.ok(!(await p.$eval("#ibGo", e => e.disabled)), "执行 enabled after the preview");
    p.once("dialog", d => d.accept());
    await p.click("#ibGo"); await p.waitForTimeout(900);
    assert.strictEqual(idBulk[idBulk.length - 1].dryRun, false, "applied");
    assert.ok(/已设置 \d+ 个账号的身份为「老师」，写入 Office 365 \d+ 个/.test(await p.$eval("#flash", e => e.textContent)), "the outcome: " + await p.$eval("#flash", e => e.textContent));
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
    await p.waitForSelector("#dsel"); await p.selectOption("#dsel", "bes.qiaoliang.online"); await p.waitForSelector("#utable tr[data-upn]:not([data-dom])"); await p.waitForTimeout(300);
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
    let foot = await p.$eval("#ufoot", e => e.textContent); assert.ok(/第 1–15 \/ 匹配 15/.test(foot) && /共 15 个账号/.test(foot) && /2 所学校/.test(foot) && /44 ms/.test(foot) && !(await p.$("#ukpi .upager")), "paged footer, the server's timing for the sysadmin, no pager under one page: " + foot);
    assert.ok(/从未登录/.test(await p.$eval("#ukpi", e => e.innerText)), "tiles come from the server's counts");
    // the filters are the server's now: the role filter sends a query and the page shows what came back
    usersPages.length = 0;
    await p.selectOption("#urole", "role:teacher"); await p.waitForTimeout(400);
    assert.deepStrictEqual([usersPages.length, usersPages[0] && usersPages[0].role, usersPages[0] && usersPages[0].offset], [1, "role:teacher", 0], "one paged query for the role: " + JSON.stringify(usersPages));
    rows = await p.$$eval("#utable tr[data-upn]", r => r.length); assert.strictEqual(rows, 3, "teachers across schools: two from the Teachers table + the demo school's one whose identity is 老师: " + rows);
    await p.fill("#uq", "demo"); await p.waitForTimeout(700);
    assert.ok(usersPages[usersPages.length - 1].q === "demo" && usersPages[usersPages.length - 1].role === "role:teacher", "search and role travel together: " + JSON.stringify(usersPages[usersPages.length - 1]));
    rows = await p.$$eval("#utable tr[data-upn]", r => r.length); assert.strictEqual(rows, 1, "the demo school's teacher: " + rows);
    await p.fill("#uq", ""); await p.selectOption("#urole", ""); await p.waitForTimeout(700);
    await p.click("#utable tr[data-dom]"); await p.waitForTimeout(500);
    assert.ok(await p.$("#panel .ph h3"), "person panel opens from the all-schools table (that school's cache is loaded on demand)");
    rows = await p.$$eval("#utable tr[data-upn]", r => r.length); assert.strictEqual(rows, 15, "table still shows all schools after opening a panel: " + rows);
  });
  // the pager itself: a page of 4 over 15 rows
  await shot("users-paged", 1280, 820, "#/domain/users", "zh", ["admin", "staff:sysadmin"], async p => {
    // 所有学校 is the default for whoever manages several (Rick, 2026-10-21: 「用户管理默认 all schools」)
    await p.waitForSelector("#utable tr[data-dom]");
    assert.strictEqual(await p.$eval("#dsel", e => e.value), "*", "the page opens on 所有学校");
    await p.evaluate(() => { window.__fcTest = true; });
    const N = Number((/匹配 (\d+)/.exec(await p.$eval("#ufoot", e => e.textContent)) || [])[1]); assert.ok(N >= 15, "all rows first: " + N);
    // a smaller page, through the same query the page builds (U_PAGE is a constant; the mock honours any limit)
    await p.evaluate(() => { const a = document.querySelector("#ukpi"); a.insertAdjacentHTML("beforeend", '<button type="button" id="tinyPage" data-offset="0" hidden></button>'); });
    usersPages.length = 0;
    await p.route(/\/api\/domain\/users\?domain=\*&offset=\d+&limit=100/, r => r.fallback({ url: r.request().url().replace("limit=100", "limit=4") }));
    await p.$eval("#tinyPage", b => b.click()); await p.waitForTimeout(500);
    let foot = await p.$eval("#ufoot", e => e.textContent);
    assert.ok(new RegExp("第 1–4 / 匹配 " + N).test(foot) && (await p.$$("#utable tr[data-upn]")).length === 4 && (await p.$("#ukpi .kpi.pager .upager")), "first page of four with a pager in the tile strip: " + foot);
    assert.ok(await p.$eval('#ukpi button[data-offset="0"]:not(#tinyPage)', b => b.disabled) === true, "上一页 disabled on the first page");
    await p.click('#ukpi button[data-offset="4"]'); await p.waitForTimeout(500);
    foot = await p.$eval("#ufoot", e => e.textContent);
    assert.ok(new RegExp("第 5–8 / 匹配 " + N).test(foot) && new RegExp("第 5–8 / " + N).test(await p.$eval("#ukpi .kpi.pager", e => e.textContent)), "second page, in the strip too: " + foot);
    const upns = await p.$$eval("#utable tr[data-upn]", rs => rs.map(r => r.getAttribute("data-upn")));
    assert.strictEqual(upns.length, 4);
    await p.screenshot({ path: OUT + "/users-paged.png" });
  });
  // the English strip with the pager: does it fit on one line at a laptop width? (Rick, 2026-10-21)
  await shot("users-paged-en", 1280, 600, "#/domain/users", "en", ["admin", "staff:sysadmin"], async p => {
    await p.waitForSelector("#utable tr[data-upn]");
    await p.selectOption("#dsel", "*"); await p.waitForSelector("#utable tr[data-dom]");
    await p.evaluate(() => { const a = document.querySelector("#ukpi"); a.insertAdjacentHTML("beforeend", '<button type="button" id="tinyPage" data-offset="0" hidden></button>'); });
    await p.route(/\/api\/domain\/users\?domain=\*&offset=\d+&limit=100/, r => r.fallback({ url: r.request().url().replace("limit=100", "limit=4") }));
    await p.$eval("#tinyPage", b => b.click()); await p.waitForTimeout(500);
    const tops = await p.$$eval("#ukpi .kpi", es => es.map(e => Math.round(e.getBoundingClientRect().top)));
    console.log("users-paged-en strip rows:", Array.from(new Set(tops)).length, "tiles:", tops.length);
    await p.screenshot({ path: OUT + "/users-paged-en.png" });
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
  // hub, a project with milestones.
  await shot("partners-board", 1280, 900, "#/ops/partners/it", "zh", ["staff:partnership"], async p => {
    const nav = await p.$eval("#nav", e => e.innerText); assert.ok(/合作伙伴/.test(nav), "nav has 合作伙伴: " + nav);
    await p.waitForSelector("#ptTabs .ptab");
    const tabs = await p.$$eval("#ptTabs .ptab", es => es.map(e => e.textContent)); assert.strictEqual(tabs.length, 6, "six type tabs for the partnership director: " + tabs);
    assert.ok(await p.$("#title .info"), "description behind ⓘ");
    const cols = await p.$$(".board .bcol"); assert.strictEqual(cols.length, 8, "eight IT stages on the board");
    const before = (await p.$$(".board .bcard")).length; // the seeded ones (family-institutions ran first)
    // the board fits the pane: empty columns fold, so the column that holds the cards is in view (Rick, 2026-10-21)
    {
      const bw = await p.$eval(".board", e => ({ sw: e.scrollWidth, cw: e.clientWidth })); assert.ok(bw.sw <= bw.cw, "no horizontal scroll on the board: " + JSON.stringify(bw));
      const heads = await p.$$eval(".board .bcol", es => es.map(e => ({ empty: e.classList.contains("empty"), head: e.querySelector(".bhead").innerText, cards: e.querySelectorAll(".bcard").length })));
      assert.ok(heads.some(h => h.cards > 0 && !h.empty) && heads.some(h => h.cards === 0 && h.empty), "columns with cards open, the empty ones folded: " + JSON.stringify(heads));
      assert.ok(/限 14 天/.test(heads[0].head), "the header's number is labelled as the stall threshold: " + heads[0].head);
      if (before) assert.ok(/本阶段 \d+ 天/.test(await p.$eval(".board .bcard", e => e.innerText)), "a card shows its own days in the stage");
    }
    await p.click("#ptNew"); await p.waitForTimeout(300);
    await p.fill("#nrOq", "kxc"); await p.waitForTimeout(500);
    await p.click('#nrOres .pr[data-key]'); await p.waitForTimeout(200);
    const who = await p.$eval("#nrOch .who", e => e.innerText); assert.ok(/Kids X Center/.test(who), "organization picked: " + who);
    await p.fill("#nrNext", "打电话给校长"); await p.fill("#nrDue", "2026-12-01");
    await p.click("#nrSave"); await p.waitForTimeout(700);
    const cr = ptPosts.find(b => b.op === "create"); assert.ok(cr && cr.party.key === "kxc.edu" && cr.type === "it", "create posted: " + JSON.stringify(cr));
    assert.ok(await p.$("#panel svg.track"), "the relationship panel shows the stage track");
    const nowLab = await p.$eval("#panel svg.track g.node.now text", e => e.textContent); assert.strictEqual(nowLab, "线索");
    assert.ok(/伙伴联系人/.test(await p.$eval("#ptBody", e => e.innerText)) || await p.$(".board"), "table has a 主要联系人 column (board view otherwise)");
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
    // 我方负责人 from the people hub (Rick, 2026-10-08): the overview's 指定… opens a
    // person field that searches the hub; a staff account is picked and saved.
    await p.click('#panel button[data-ptab="overview"]'); await p.waitForTimeout(200);
    assert.ok(/项目经理/.test(await p.$eval("#rpBody .kv", e => e.innerText)), "overview says 项目经理");
    await p.click('#panel button[data-act="owner"]'); await p.waitForTimeout(200);
    await p.fill("#owAcct", "mei"); await p.waitForTimeout(600);
    assert.ok(await p.$("#owForm .pres.pauto .pr[data-v]"), "hub matches under the owner field");
    const pickName = await p.$eval('#owForm .pres.pauto .pr[data-v]', e => e.getAttribute("data-name") || e.innerText); assert.ok(/mei/i.test(pickName), "a hub match for mei: " + pickName);
    await p.click('#owForm .pres.pauto .pr[data-v]'); await p.waitForTimeout(100);
    const ownerVal = await p.$eval("#owAcct", e => e.value); assert.ok(ownerVal && /@|^HC-/.test(ownerVal), "picked an account or CRM id: " + ownerVal);
    await p.click("#owForm button[type=submit]"); await p.waitForTimeout(700);
    const upd = ptPosts.filter(b => b.op === "update").pop(); assert.ok(upd && upd.fields && upd.fields.owner === ownerVal, "owner posted: " + JSON.stringify(upd));
    assert.ok(!/待分配/.test(await p.$eval("#rpBody .kv", e => e.innerText)), "owner shown on the overview");
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
    // a project with a milestone done cannot be deleted; a fresh one can (Rick, 2026-10-09)
    assert.ok(!(await p.$("#pjDelete")), "no Delete button once a milestone is done");
    await p.click('#panel button[data-act="newproject"]'); await p.waitForTimeout(200);
    await p.fill("#npName", "误建的项目"); await p.click("#npForm button[type=submit]"); await p.waitForTimeout(800);
    const nPrj = Object.keys(PRJ.items).length;
    await p.click("#pjDelete"); await p.waitForTimeout(200); await p.click("#pjDel button[type=submit]"); await p.waitForTimeout(800);
    assert.strictEqual(Object.keys(PRJ.items).length, nPrj - 1, "the fresh project is deleted");
    assert.ok(!(await p.$eval("#panel2", e => e.classList.contains("open"))), "the project panel closes after deletion");
    const lg = Object.values(REL.items).find(x => x.source === "manual").log.map(l => l.kind); assert.ok(lg.includes("stage") && lg.includes("contacts") && lg.includes("project"), "everything logged: " + lg);
  });
  await shot("partners-table", 1280, 700, "#/ops/partners/it", "en", ["staff:partnership"], async p => {
    await p.waitForSelector(".board");
    await p.click('#ptRight [data-view="table"]'); await p.waitForTimeout(300);
    const rows = await p.$$eval("#pttable tbody tr[data-rel]", rs => rs.map(r => r.innerText)); assert.ok(rows.length >= 1, "rows in the table");
    const row = rows.find(x => /Kids X Center/.test(x) && /Signed/.test(x)); assert.ok(row, "the signed KXC row: " + rows.join(" | "));
    await p.click("#pttable tbody tr[data-rel]"); await p.waitForTimeout(500);
    assert.ok(await p.$eval("#panel", e => e.classList.contains("open")), "panel opens from the table");
    // English dates spell the month (Rick, 2026-10-21: "since 09/10/2026" read as September against "12 d in stage")
    assert.ok(/since \d{1,2} [A-Z][a-z]{2} \d{4}/.test(await p.$eval("#panel", e => e.innerText)), "the stage date names its month: " + (await p.$eval("#panel", e => e.innerText)).slice(0, 300));
    // English stage labels wrap instead of colliding (Rick, 2026-10-09: English version mess)
    const boxes = await p.$$eval("#panel svg.track g.node text:not(.days)", ts => ts.map(t => { const b = t.getBoundingClientRect(); return [b.left, b.right]; }));
    for (let i = 1; i < boxes.length; i++) assert.ok(boxes[i][0] >= boxes[i - 1][1] - 1, "stage labels " + (i - 1) + "/" + i + " overlap: " + JSON.stringify(boxes));
    await p.screenshot({ path: OUT + "/partners-track-en.png", clip: await p.$eval("#panel svg.track", e => { const b = e.getBoundingClientRect(); return { x: b.left, y: b.top, width: b.width, height: b.height }; }) });
    await p.click("#ptKpi"); await p.waitForTimeout(200);
    assert.ok(!(await p.$eval("#panel", e => e.classList.contains("open"))), "closes on an outside click");
    await p.click('#ptRight [data-view="board"]'); await p.waitForTimeout(200);
  });
  // 课程管理 (Rick, 2026-10-18). A teacher: cards, the editor in focus layout, single-language editing with autosave,
  // pills, chips, 生成双语, the four steps, the field panel, the version timeline, submit.
  await shot("courses-teacher", 1280, 900, "#/courses", "zh", [], async p => {
    await p.waitForTimeout(600);
    assert.ok(/我的课程/.test(await p.$eval("#nav", e => e.innerText)) && !/课程管理/.test(await p.$eval("#nav", e => e.innerText)), "a teacher sees 我的课程, not 课程管理");
    assert.ok(await p.$(".cocard"), "a course card"); assert.ok(/SCI-HS-101/.test(await p.$eval(".cocard", e => e.innerText)));
    await p.screenshot({ path: OUT + "/courses-teacher-list.png" });
    // 班级名单 (stage 2): the roster from the live orders — names and grades, no contact details; the card link stays put
    await p.click(".cocard [data-roster]"); await p.waitForSelector("#panel.open .kv"); await p.waitForTimeout(300);
    const ro = await p.$eval("#panel", e => e.innerText);
    assert.ok(/班级名单/.test(ro) && /七年级数学/.test(ro) && /张小明/.test(ro) && /7 年级/.test(ro) && /已缴费/.test(ro) && /已报名 \d+ 人，其中已缴费 \d+ 人/.test(ro) && !/@gmail|@qq/.test(ro), "the roster: " + ro.slice(0, 400));
    assert.strictEqual(await p.evaluate(() => location.hash), "#/courses", "the roster did not open the editor");
    await p.screenshot({ path: OUT + "/courses-roster.png" });
    await p.keyboard.press("Escape"); await p.waitForTimeout(200);
    await p.click(".cocard"); await p.waitForSelector("#coed .cobar"); await p.waitForTimeout(300);
    // the sidebar stays as it is site-wide: no focus layout, no toggle of the editor's own (Rick, 2026-10-20)
    assert.ok(!(await p.evaluate(() => document.body.classList.contains("cofocus"))) && await p.$eval("#side", e => e.offsetWidth > 0) && !(await p.$("#coSide")) && !(await p.$(".coback")), "sidebar shown, no editor toggle, no ←");
    await p.click("#sideHide"); await p.waitForTimeout(150); assert.ok(!(await p.$eval("#side", e => e.offsetWidth)) && !(await p.$eval(".topbar", e => e.offsetHeight)), "the site-wide collapse works here too; the empty topbar stays hidden");
    await p.screenshot({ path: OUT + "/courses-editor-sidebar.png" });
    await p.click("#sideShow"); await p.waitForTimeout(150);
    assert.strictEqual(await p.$eval(".colang button.on", e => e.textContent), "EN", "editing language follows the source language (English)");
    assert.ok(await p.$('.cof[data-k="nameEn"]') && !(await p.$('.cof[data-k="nameZh"]')), "only one language is shown");
    assert.ok(/只读/.test(await p.$eval('.corowf[data-row="price"]', e => e.innerText)) && await p.$eval('.cof[data-k="price"]', e => e.readOnly), "price is read-only for a teacher");
    assert.ok(!(await p.$('.corowf[data-row="classical"]')), "a column the base does not have is not shown");
    assert.strictEqual((await p.$$(".costeps li")).length, 4); assert.ok(await p.$(".costeps li.cur:first-child"), "step 1 is current");
    assert.ok(/Biology/.test(await p.$eval("#coprevbody", e => e.innerText)) && /G9/.test(await p.$eval("#coprevbody", e => e.innerText)), "the preview shows the course");
    // autosave: type, wait, one PATCH with the whole value; the preview follows
    // 上课时间 is built from weekdays + start / end (Rick, 2026-10-20): the course's days are pre-selected; a slot
    // joins the text ("P3 10:00–10:45; 周一、周三 11:00–11:45"); × takes one away
    assert.ok(!(await p.$('.cof[data-k="classTime"]')) && await p.$(".coslots .cochip"), "no free-text class time; the existing text is a chip");
    assert.deepStrictEqual(await p.$$eval(".coslot-days .copill.on", es => es.map(e => e.textContent)), ["周一", "周三"], "the course's days are pre-selected");
    await p.fill("#coSlotFrom", "11:00"); await p.fill("#coSlotTo", "11:45"); await p.click("#coSlotAdd"); await p.waitForTimeout(300);
    const pt = coPatches.filter(x => x.key === "classTime"); assert.strictEqual(pt.length, 1, "one PATCH at once: " + pt.length); assert.strictEqual(pt[0].value, "P3 10:00–10:45; 周一、周三 11:00–11:45");
    assert.ok(/已保存/.test(await p.$eval("#coSaved", e => e.innerText)), "says saved");
    assert.ok(/11:00–11:45/.test(await p.$eval("#coprevbody", e => e.innerText)), "the preview follows");
    await p.click('.coslots .cochip[data-i="0"] .cochip-x'); await p.waitForTimeout(300);
    assert.strictEqual(coPatches.filter(x => x.key === "classTime").pop().value, "周一、周三 11:00–11:45", "× removes the old slot");
    // 学分 follows the G.P.A. rule: classes ÷ 180; the link fills it in; the hint explains the rule
    assert.ok(/课时数 ÷ 180/.test(await p.$eval('.corowf[data-row="creditHours"] .colab .info', e => e.dataset.tip)), "the hint says what to enter");
    assert.ok(/按课时数算：30 节 → 0.2/.test(await p.$eval("#coCreditCalc", e => e.textContent)), "30 classes → 0.2");
    await p.click("#coCreditCalc"); await p.waitForTimeout(200);
    assert.strictEqual(coPatches.filter(x => x.key === "creditHours").pop().value, 0.2, "filled from classes");
    // 前置课程: a course picked by code / keyword, or free text, kept as one text
    assert.ok(!(await p.$('.cosec#sec-pre h2')) && /前置课程/.test(await p.$eval('.corowf[data-row="prerequisite"] .colab', e => e.innerText)), "one-field section: the label is the heading, no second title");
    await p.fill(".coprereq-q", "life"); await p.waitForTimeout(150);
    assert.ok(/SCI-MS-201/.test(await p.$eval(".coprereq .cochip-menu", e => e.innerText)), "search by keyword finds the course");
    await p.keyboard.press("Enter"); await p.waitForTimeout(300);
    await p.fill(".coprereq-q", "math-hs"); await p.waitForTimeout(150); await p.keyboard.press("Enter"); await p.waitForTimeout(300);
    await p.fill(".coprereq-q", "或老师同意"); await p.waitForTimeout(150); await p.keyboard.press("Enter"); await p.waitForTimeout(300);
    assert.strictEqual(coPatches.filter(x => x.key === "prerequisite").pop().value, "SCI-MS-201 Life Science / 生命科学; MATH-HS-101 Algebra 1 / 代数 1; 或老师同意", "codes, names and free text as one text");
    assert.deepStrictEqual(await p.$$eval(".coprereq .cochip", es => es.map(e => e.firstChild.textContent)), ["SCI-MS-201", "MATH-HS-101", "或老师同意"], "chips show the code (bold) or the text");
    await p.click('.coprereq .cochip:nth-child(2) .cochip-x'); await p.waitForTimeout(300);
    assert.strictEqual(coPatches.filter(x => x.key === "prerequisite").pop().value, "SCI-MS-201 Life Science / 生命科学; 或老师同意", "× removes one");
    // pills save at once; chips: add a grade through the search, remove one with ×
    await p.click('.copills[data-k="classType"] .copill:not(.on)'); await p.waitForTimeout(200);
    assert.deepStrictEqual(coPatches.filter(x => x.key === "classType").pop().value, { en: "Prerecorded Course", zh: "录播课" });
    await p.click('.cochip-q[data-k="grades"]'); await p.type('.cochip-q[data-k="grades"]', "G10"); await p.waitForTimeout(100);
    assert.ok(await p.$('.cochips[data-k="grades"] .cochip-menu [data-id="recGRADE000000010"]'), "the menu offers G10");
    await p.keyboard.press("Enter"); await p.waitForTimeout(200);
    assert.deepStrictEqual(coPatches.filter(x => x.key === "grades").pop().value, ["recGRADE000000009", "recGRADE000000010"]);
    await p.click('.cochips[data-k="grades"] .cochip[data-id="recGRADE000000009"] .cochip-x'); await p.waitForTimeout(200);
    assert.deepStrictEqual(coPatches.filter(x => x.key === "grades").pop().value, ["recGRADE000000010"]);
    // 生成双语: the Chinese description is empty → the button shows 1; after it, a 译 tag; submit then works
    assert.ok(/生成双语\s*1/.test(await p.$eval("#coTranslate", e => e.innerText)), "the translate button counts the missing field");
    await p.click("#coSubmit"); await p.waitForTimeout(300);
    assert.ok(/先按「生成双语」/.test(await p.$eval("#flash", e => e.innerText)), "submit asks for the translation first");
    await p.click("#coTrNow"); await p.waitForTimeout(400);
    assert.ok(coOps.some(o => o.op === "translate"), "translate was called"); assert.ok(!(await p.$eval("#coTranslate", e => e.hasAttribute("data-needs"))) && !(await p.$eval("#coTranslate", e => e.disabled)), "nothing left to translate, yet the button stays clickable");
    // 4 (Rick, 2026-10-18): the button always answers — up to date → it says so and offers a full re-translation
    await p.click("#coTranslate"); await p.waitForTimeout(200);
    assert.ok(/双语已是最新/.test(await p.$eval("#flash", e => e.innerText)) && await p.$("#coTrAll"), "an up-to-date course says so and offers 重新翻译全部");
    await p.click("#coTrAll"); await p.waitForTimeout(400);
    assert.ok(coOps.filter(o => o.op === "translate").pop().all === true, "the full re-translation is asked from the current language");
    // 1: the price field says 人民币, the preview shows ¥ and the whole description (no 6-line cut), every website field, in the detail view by default
    assert.ok(/人民币/.test(await p.$eval('.corowf[data-row="price"]', e => e.innerText)), "the price is in RMB");
    const pv = await p.$eval("#coprevbody", e => e.innerText);
    assert.ok(/¥\s?300/.test(pv) && /课时数|CLASSES/.test(pv) && /教材|TEXTBOOKS/.test(pv) && /课程提供方|COURSE DELIVERER/.test(pv) && /前置课程|PREREQUISITE/.test(pv), "the detail preview lists price in ¥ and the website's fields: " + pv.slice(0, 300));
    assert.ok(await p.$(".pvdetail .pvfull"), "the description is shown in full");
    await p.click('.pvmode [data-pv="card"]'); await p.waitForTimeout(100); assert.ok(await p.$("#coprevbody .pvdesc"), "the card view is one click away");
    await p.click('.pvmode [data-pv="detail"]'); await p.waitForTimeout(100);
    // 2: the section tabs live in the sticky bar and follow the scroll
    assert.ok(await p.$(".cobar #cosecnav a.on"), "the section tabs sit in the bar with the current one lit");
    await p.click('#cosecnav a[data-sec="ops"]'); await p.waitForTimeout(900);
    const barPos = await p.evaluate(() => { const c = document.getElementById("content").getBoundingClientRect(), b = document.querySelector(".cobar").getBoundingClientRect(); return { content: c.top, bar: b.top, scroll: document.getElementById("content").scrollTop, on: (document.querySelector("#cosecnav a.on") || {}).dataset }; });
    assert.ok(barPos.scroll > 100 && barPos.bar - barPos.content <= 1 && barPos.on && barPos.on.sec === "ops", "after jumping to 经营字段 the bar is still at the top and that tab is lit: " + JSON.stringify(barPos));
    await p.click('#cosecnav a[data-sec="basic"]'); await p.waitForTimeout(900);
    await p.click('.colang button[data-lang="zh"]'); await p.waitForTimeout(200);
    assert.ok(/【译】Cells/.test(await p.$eval('.cotext[data-open="descriptionZh"]', e => e.innerText)) && /译/.test(await p.$eval('.corowf[data-row="description"] .colab', e => e.innerText)), "the Chinese side shows the machine translation with its tag");
    // long text opens in a large editor window (Rick, 2026-10-19: like expanding an Airtable cell); typing there autosaves
    assert.ok(!(await p.$('.corowf[data-row="description"] textarea')), "no textarea in the form for the description");
    await p.click('.cotext[data-open="descriptionZh"]'); await p.waitForSelector("#coTextWin:not([hidden]) textarea.cobig");
    await p.fill("#coTextWin textarea.cobig", "细胞、遗传与生态（九年级）。"); await p.waitForTimeout(1900);
    const pd = coPatches.filter(x => x.key === "descriptionZh"); assert.ok(pd.length >= 1 && pd[pd.length - 1].value === "细胞、遗传与生态（九年级）。", "the window saves like the form: " + JSON.stringify(pd));
    await p.screenshot({ path: OUT + "/courses-textwin.png" });
    await p.keyboard.press("Escape"); await p.waitForTimeout(150);
    assert.ok(await p.$eval("#coTextWin", e => e.hidden) && /细胞、遗传/.test(await p.$eval('.cotext[data-open="descriptionZh"]', e => e.innerText)), "Esc closes the window and the form shows the new text");
    await p.screenshot({ path: OUT + "/courses-editor.png" });
    await p.click('#cosecnav a[data-sec="time"]'); await p.waitForTimeout(700); await p.screenshot({ path: OUT + "/courses-editor-time.png" });
    // the field panel: both languages and the history
    await p.hover('.corowf[data-row="description"]'); await p.click('.codetail[data-detail="description"]'); await p.waitForSelector("#panel.open");
    assert.ok(/English/i.test(await p.$eval("#panel", e => e.innerText)) && /修改记录/.test(await p.$eval("#panel", e => e.innerText)), "the field panel shows both languages and the history: " + (await p.$eval("#panel", e => e.innerText)).slice(0, 200));
    await p.click("#panel .x"); await p.waitForTimeout(150);
    // versions: the timeline, a version viewed, restored
    await p.click("#coVersions"); await p.waitForSelector("#panel.open .cotl"); await p.waitForTimeout(200);
    assert.ok(/生成双语/.test(await p.$eval("#panel", e => e.innerText)) && /开始编辑/.test(await p.$eval("#panel", e => e.innerText)), "the timeline lists the actions");
    await p.click('#panel [data-f="pub"]'); await p.waitForTimeout(100); assert.ok(!(await p.$("#panel .cotl-row")), "no publish yet → empty under 只看发布");
    await p.click('#panel [data-f="all"]'); await p.waitForTimeout(100);
    await p.evaluate(() => { document.querySelector("#panel .cotl").insertAdjacentHTML("afterbegin", '<div class="cotl-row" data-ref="v:x"><div class="cotl-dot"></div><div class="cotl-t"><b>x</b></div><button type="button" class="linkbtn" data-see="v:x">查看</button></div>'); });
    await p.click('#panel [data-see="v:x"]'); await p.waitForSelector("#panel2.open"); await p.waitForTimeout(200);
    assert.ok(await p.$("#panel2 .coverf.diff"), "differing fields are marked");
    await p.click("#coRestore"); await p.waitForTimeout(400);
    assert.ok(coOps.some(o => o.op === "restore"), "restore was called"); assert.ok(/restored/.test(await p.$eval(".coslots", e => e.innerText)), "the form shows the restored value");
    // submit, then the steps move on and the primary button becomes 撤回
    await p.click("#coSubmit"); await p.waitForSelector("#panel.open"); await p.fill("#coNote", "ready"); await p.click("#coGo"); await p.waitForTimeout(400);
    assert.ok(coOps.some(o => o.op === "submit" && o.note === "ready")); assert.ok(await p.$(".costeps li:nth-child(2).cur") && await p.$("#coWithdraw"), "step 2 current, withdraw offered");
    await p.screenshot({ path: OUT + "/courses-submitted.png" });
    assert.ok(!(await p.$(".coback")) && !(await p.$("#coSide")), "no ← and no second sidebar toggle in the editor bar (Rick, 2026-10-20)");
    await p.click('#nav a[href="#/courses"]'); await p.waitForTimeout(300);
    assert.ok(await p.$(".cocard"), "the sidebar item leads back to the cards");
  });
  // An approver: the table, assigning through the people picker, 审阅中 on open, the return comment, publish with the website refresh.
  await shot("courses-admin", 1280, 900, "#/courses", "zh", ["staff:curriculum"], async p => {
    await p.waitForTimeout(600);
    assert.ok(/课程管理/.test(await p.$eval("#nav", e => e.innerText)), "an approver sees 课程管理");
    assert.ok(await p.$("#cotable tr[data-id]"), "the table"); assert.ok(/待审批/.test(await p.$eval("#cotabs", e => e.innerText)));
    // 按课程提供方筛选 (2026-10-21): a select of the deliverers with counts; the rows and the chips' counts follow
    assert.deepStrictEqual(await p.$$eval("#coSchool option", es => es.map(e => e.value)), ["", "IEW", "KXC"], "the providers");
    assert.strictEqual((await p.$$("#cotable tr[data-id]")).length, 2);
    await p.selectOption("#coSchool", "IEW"); await p.waitForTimeout(200);
    assert.deepStrictEqual(await p.$$eval("#cotable tr[data-id]", es => es.map(e => e.getAttribute("data-id"))), ["recCOURSE00000002"], "IEW's course only");
    assert.ok(/全部 1/.test(await p.$eval("#cotabs", e => e.innerText).then(x => x.replace(/\s+/g, " "))), "the chip counts follow the provider: " + await p.$eval("#cotabs", e => e.innerText));
    await p.selectOption("#coSchool", "KXC"); await p.waitForTimeout(200);
    assert.deepStrictEqual(await p.$$eval("#cotable tr[data-id]", es => es.map(e => e.getAttribute("data-id"))), [CO_ID]);
    await p.click('#cotable [data-assign]'); await p.waitForSelector("#panel.open"); await p.fill("#coPq", "li"); await p.waitForTimeout(400);
    await p.click('#coPres [data-i="0"]'); await p.waitForTimeout(300);
    assert.ok(coOps.some(o => o.op === "assign" && o.person.upn === "li@kxc.edu"), "assigned through the picker"); assert.ok(/Li Laoshi/.test(await p.$eval("#coAssigned", e => e.innerText)));
    await p.screenshot({ path: OUT + "/courses-assign.png" });
    await p.click("#panel .x"); await p.waitForTimeout(150);
    CO_DOC.status = "submitted"; CO_DOC.submitted = { at: new Date().toISOString(), by: "zhang@kxc.edu", note: "ready" };
    await p.click("#cotable tr[data-id] td:first-child"); await p.waitForSelector("#coed .cobar"); await p.waitForTimeout(300);
    assert.ok(await p.$("#coPublish") && !(await p.$("#coSubmit")), "an approver publishes"); assert.ok(!(await p.$eval('.cof[data-k="price"]', e => e.readOnly)), "price is editable for an approver");
    await p.click("#coMore"); assert.ok(await p.$('#coMenu [data-op="return"]'), "return is in the menu for a submitted course"); await p.click('#coMenu [data-op="return"]'); await p.waitForSelector("#panel.open");
    await p.click("#coGo"); await p.waitForTimeout(200); assert.ok(!coOps.some(o => o.op === "return"), "no return without a comment");
    await p.fill("#coCmt", "请补充课时安排"); await p.click("#coGo"); await p.waitForTimeout(400);
    assert.ok(coOps.some(o => o.op === "return" && o.comment === "请补充课时安排")); assert.ok(await p.$(".costeps li.warn") && /请补充课时安排/.test(await p.$eval("#coreturned", e => e.innerText)), "the returned step and the comment show");
    await p.screenshot({ path: OUT + "/courses-returned.png" });
    await p.click("#coPublish"); await p.waitForSelector("#panel.open"); await p.waitForTimeout(100);
    assert.ok(/将写入 Airtable 的字段/i.test(await p.$eval("#panel", e => e.innerText)), "the publish panel lists the fields: " + (await p.$eval("#panel", e => e.innerText)).slice(0, 200));
    await p.click("#coGo"); await p.waitForTimeout(600);
    assert.ok(coOps.some(o => o.op === "publish"), "published"); assert.ok(/已写入 Airtable/.test(await p.$eval("#coPubOut", e => e.innerText)) && /网站已更新/.test(await p.$eval("#coPubOut", e => e.innerText)), "both steps shown: " + await p.$eval("#coPubOut", e => e.innerText));
    assert.ok(await p.$(".costeps li:nth-child(4).cur"), "step 4 current");
    await p.screenshot({ path: OUT + "/courses-published.png" });
  });
  await shot("courses-narrow", 414, 896, "#/courses/" + CO_ID, "zh", ["staff:curriculum"], async p => {
    await p.waitForSelector("#coed .cobar"); await p.waitForTimeout(300);
    await p.evaluate(() => { document.getElementById("content").scrollTop = 99999; }); await p.waitForTimeout(300);
    const foot = await p.$eval(".pvfoot", e => { const r = e.getBoundingClientRect(); return { bottom: r.bottom, h: innerHeight }; });
    assert.ok(foot.bottom < foot.h - 40, "on a phone the preview's price line is fully reachable: " + JSON.stringify(foot));
    await p.screenshot({ path: OUT + "/courses-narrow.png", fullPage: false });
  });
  await shot("courses-phone", 390, 800, "#/courses/" + CO_ID, "zh", [], async p => {
    await p.waitForSelector("#coed .cobar"); await p.waitForTimeout(300);
    const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(over <= 0, "no sideways scroll on a phone: " + over);
    await p.screenshot({ path: OUT + "/courses-phone.png", fullPage: false });
  });

  // The fundraising type left for Zoohu (Rick, 2026-10-09): six tabs for everyone, no
  // 募款 anywhere; a reader without partners rw gets no New button.
  await shot("partners-sales", 1280, 700, "#/ops/partners/course", "zh", SALES, async p => {
    await p.waitForTimeout(500);
    const tabs = await p.$$eval("#ptTabs .ptab", es => es.map(e => e.textContent)); assert.strictEqual(tabs.length, 6, "six type tabs: " + tabs); assert.ok(!tabs.some(x => /募款/.test(x)), "no fundraising tab: " + tabs);
    assert.ok(!(await p.$("#ptNew")), "no New button without partners rw");
  });
  await shot("partners-narrow", 1000, 700, "#/ops/partners/it", "zh", ["admin", "staff:sysadmin"], async p => {
    await p.waitForSelector(".board");
    const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(over <= 0, "the board scrolls inside the page, not the page: " + over);
  });
  console.log(errs.length ? "ERRORS:\n" + errs.join("\n") : "all orders/roles checks passed");
  if (errs.length) process.exitCode = 1; // a failed scenario fails the run (it used to exit 0 — 2026-10-09)
  await browser.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
