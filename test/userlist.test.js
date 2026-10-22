// 用户管理 paging (api/shared/userList.js): the filters the page used to run itself, the counts, the page window.
const assert = require("assert");
const path = require("path");
const L = require(path.join(__dirname, "..", "api", "shared", "userList.js"));

const mk = (i, extra) => Object.assign({ upn: `user${String(i).padStart(2, "0")}@bes.edu`, displayName: "User " + i, domain: "bes.edu", identity: i % 3 === 0 ? "" : i % 3 === 1 ? "家长" : "学生", verified: i % 4 === 0 ? false : true, lastSignIn: i % 5 === 0 ? "" : "2026-10-0" + ((i % 9) + 1) + "T00:00:00Z", roles: i === 7 ? [{ role: "domain_it:bes.edu", zh: "IT 管理员", en: "IT administrator" }] : [], hiveTeacher: i === 2 ? { name: "T" } : null, anomaly: i === 4 ? "x" : "", groups: [{ id: "g" + (i % 3), name: "组" + (i % 3), nameZh: "组" + (i % 3), nameEn: "Group " + (i % 3) }], devices: [{ name: i % 2 ? "iPhone" : "Pixel" }], linked: [] }, extra);
const users = Array.from({ length: 23 }, (_, i) => mk(i));
users.push(mk(40, { upn: "zz@demo.edu", domain: "demo.edu", identity: "老师", verified: null, lastSignIn: "" }));
users[1].identitySource = "hive"; users[2].identitySource = "entra"; users[4].identitySource = "licence";

// counts over the whole set
const c = L.counts(users);
assert.strictEqual(c.total, 24);
assert.strictEqual(c.noauth, users.filter((u) => u.verified === false).length);
assert.strictEqual(c.noid, users.filter((u) => u.identitySource !== "hive" && u.identitySource !== "entra").length, "身份未确认: nobody set it (a licence guess is not set)");
assert.strictEqual(c.anomaly, 1);
assert.strictEqual(c.teacher, 1, "the Teachers-table one only; identity 老师 is the 身份 filter (2026-10-22)");
assert.strictEqual(c.never, users.filter((u) => !u.lastSignIn && u.verified !== true).length);
assert.strictEqual(c.groups, 3);
assert.ok(c.anySignIn);

// the page window, sorted by account
let pg = L.page(users, { limit: 10 });
assert.deepStrictEqual([pg.users.length, pg.matched, pg.offset, pg.limit, pg.users[0].upn], [10, 24, 0, 10, "user00@bes.edu"]);
pg = L.page(users, { limit: 10, offset: 20 });
assert.deepStrictEqual([pg.users.length, pg.users[pg.users.length - 1].upn], [4, "zz@demo.edu"], "the last page is short");
pg = L.page(users, { limit: 10, offset: 999 });
assert.strictEqual(pg.offset, 23, "an offset past the end lands on the last row");
assert.strictEqual(L.page(users, { limit: Infinity }).users.length, 24, "limit=all → everything");

// filters and roles, as the page sent them
assert.strictEqual(L.page(users, { filter: "noauth", limit: 100 }).matched, c.noauth);
assert.strictEqual(L.page(users, { filter: "noid", limit: 100 }).matched, 22, "24 less the one set in Hive and the one set in Microsoft");
assert.deepStrictEqual(L.bySchool(users).map((x) => [x.domain, x.total, x.noid]), [["bes.edu", 23, 21], ["demo.edu", 1, 1]], "the 学校 table: per school, most accounts first");
assert.strictEqual(L.page(users, { filter: "anomaly", limit: 100 }).matched, 1);
assert.strictEqual(L.page(users, { role: "role:it", limit: 100 }).matched, 1);
assert.strictEqual(L.page(users, { role: "role:teacher", limit: 100 }).matched, 1);
assert.strictEqual(L.page(users, { role: "id:老师", limit: 100 }).matched, 1, "身份 老师");
assert.strictEqual(L.page(users, { role: "role:any", limit: 100 }).matched, 1);
assert.strictEqual(L.page(users, { role: "id:家长", limit: 100 }).matched, users.filter((u) => u.identity === "家长").length);
// search: account, group name in either language, the school's names
assert.strictEqual(L.page(users, { q: "user1", limit: 100 }).matched, 10, "user10–user19");
assert.strictEqual(L.page(users, { q: "group 1", limit: 100 }).matched, users.filter((u) => u.groups[0].id === "g1").length);
assert.strictEqual(L.page(users, { q: "示范学校", limit: 100 }, { "demo.edu": { name: "示范学校", nameEn: "Demo School" } }).matched, 1, "the school's Chinese name finds its accounts");
assert.strictEqual(L.page(users, { q: "demo school", limit: 100 }, { "demo.edu": { name: "示范学校", nameEn: "Demo School" } }).matched, 1);
assert.strictEqual(L.page(users, { q: "pixel", role: "id:学生", limit: 100 }).matched, users.filter((u) => u.identity === "学生" && u.devices[0].name === "Pixel").length, "filters combine");

// the query string → options, defensively
assert.deepStrictEqual(L.parseQuery({ q: "x", filter: "never", role: "role:it", sort: "name", offset: "20", limit: "50" }), { q: "x", filter: "never", role: "role:it", sort: "name", offset: 20, limit: 50 });
assert.deepStrictEqual(L.parseQuery({ filter: "bogus", role: "role:hack", sort: "evil", offset: "-5", limit: "9999" }), { q: "", filter: "all", role: "", sort: "upn", offset: 0, limit: 500 });
assert.strictEqual(L.parseQuery({ limit: "all" }).limit, Infinity);
assert.strictEqual(L.parseQuery({}).limit, 100);
console.log("userlist: all assertions passed");
