// The website and the school edition (assets/app.js + /api/school-plan), driven through the
// real page in jsdom. Since 2026-10-19 (Rick: 「网站上可以做任何组合的选择，不应该受此影响」) the
// wizard IGNORES a published school plan: every family and visitor sees Hive's defaults, no
// 学校版本 chip; the school's edition is read in the management centre instead.
//
// Run with:  npm i jsdom && node test/school-edition.test.js
const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");

const ROOT = path.join(__dirname, "..", "assets") + path.sep;
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8").replace(/<script[^>]*><\/script>/g, "");
const MATH = { id: "recMath", nameEn: "Math", nameZh: "数学", filterKey: "Math", filterNameEn: "Math", filterNameZh: "数学" };
const snapshot = {
  generatedAt: "2026-10-01T00:00:00Z", k8TrackId: 7,
  grades: ["G9", "G10", "G11", "G12", "G1"],
  tracks: [{ trackId: 1, nameEn: "International: Classical", nameZh: "国际·古典", credits: { math: 4, science: 3, english: 4, chinese: 2, bible: 2, speaking: 1, elective: 2 }, totalCredits: 24, serviceHours: 50, commentsEn: "Hive policy", commentsZh: "蜂巢政策" }],
  subjects: [MATH],
  courses: [{ id: "c7", code: "MTH-HS-201", nameEn: "Algebra II", nameZh: "代数二", grades: ["G9", "G10"], trackIds: [1, 2, 3, 4, 5, 6], price: 100, subjects: [MATH], teachers: [], creditHours: 1 }],
  teachers: [], messages: {},
  curriculumMap: { rhetoric: { grades: ["G9", "G10", "G11", "G12"], rows: [{ id: "h3", order: 1, subjects: [MATH], trackIds: [1, 2, 3, 4, 5, 6], pedagogy: null, spanAll: false, cells: { G9: [{ en: "Geometry", zh: "几何" }], G10: [{ en: "Algebra 2", zh: "代数2" }], G11: [], G12: [] } }] } },
};
// What /api/school-plan answers for the signed-in family of 甲校: math 5 instead of 4, no
// public speaking row, total 26, a school note, and its own two-row rhetoric map.
const plan = {
  domain: "a.edu", school: { domain: "a.edu", name: "甲校", nameEn: "School A" }, publishedAt: "2026-10-12T00:00:00Z",
  tracks: { 1: { credits: { math: 5, speaking: null }, totalCredits: 26, serviceHours: null, notes: { zh: "校方说明", en: "" } } },
  map: { rhetoric: { grades: ["G9", "G10", "G11", "G12"], rows: [
    { id: "s1", order: 1, subjects: [MATH], trackIds: [], pedagogy: null, spanAll: false, cells: { G9: [{ en: "Algebra I", zh: "代数一" }], G10: [{ en: "Algebra II", zh: "代数二" }] } },
    { id: "s2", order: 2, subjects: [{ id: null, nameEn: "Latin", nameZh: "拉丁文" }], trackIds: [], pedagogy: null, spanAll: true, cells: { G9: [{ en: "Latin I–IV", zh: "拉丁文" }], G10: [{ en: "Latin I–IV", zh: "拉丁文" }], G11: [{ en: "Latin I–IV", zh: "拉丁文" }], G12: [{ en: "Latin I–IV", zh: "拉丁文" }] } },
  ] } },
};

let failures = 0;
const check = (label, actual, expected) => { const a = JSON.stringify(actual), e = JSON.stringify(expected); const ok = a === e; if (!ok) failures++; console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : `\n        got ${a}\n        want ${e}`}`); };

const fetched = [];
function page(planAnswer) {
  const vc = new VirtualConsole();
  vc.on("jsdomError", (e) => console.log("   [page error]", e.message.split("\n")[0]));
  const dom = new JSDOM(html, { runScripts: "outside-only", url: "https://www.fengchao.life/", virtualConsole: vc });
  const { window } = dom;
  window.fetch = (u) => { fetched.push(String(u)); return Promise.resolve({ ok: true, json: () => Promise.resolve(String(u).indexOf("/api/school-plan") === 0 ? planAnswer : snapshot) }); };
  window.scrollTo = () => {};
  window.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
  window.cancelAnimationFrame = (id) => clearTimeout(id);
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  window.confirm = () => true;
  window.eval(fs.readFileSync(ROOT + "i18n.js", "utf8"));
  window.eval(fs.readFileSync(ROOT + "gpa.js", "utf8"));
  window.eval(fs.readFileSync(ROOT + "app.js", "utf8"));
  const doc = window.document;
  const pick = (sel) => { const el = doc.querySelector(sel); if (!el) throw new Error("missing " + sel); return el; };
  const click = (el) => el.dispatchEvent(new window.Event("click", { bubbles: true }));
  const toRequirements = () => {
    click(pick('#pedGrid .choice-card[data-key="classical"]')); click(pick("#next2"));
    click(pick('#stageGrid .choice-card[data-key="rhetoric"]')); click(pick("#next0"));
    click(pick('#modeGrid .choice-card[data-key="international"]')); click(pick("#next1"));
  };
  const reqRows = () => Array.from(doc.querySelectorAll(".req-table tbody tr")).filter((tr) => !tr.classList.contains("req-courses")).map((tr) => [tr.querySelector("td").textContent.replace(/\s+/g, " ").trim().replace(/ \d+ .*$/, ""), tr.querySelector("td.num").textContent.trim()]);
  const mapRows = () => Array.from(doc.querySelectorAll("#mapCard table tr")).slice(1).map((tr) => Array.from(tr.querySelectorAll("th,td")).map((c) => c.textContent.replace(/\s+/g, " ").trim()));
  return { doc, pick, click, toRequirements, reqRows, mapRows };
}

setTimeout(() => {
  // 1. The family of 甲校, whose school published a plan: the website still shows Hive's defaults.
  const A = page({ plan, signedIn: true, domain: "a.edu" });
  setTimeout(() => {
    A.toRequirements();
    const rows = A.reqRows();
    check("Hive's math credits, not the school's 5", rows.filter((r) => r[0] === "数学")[0][1], "4 学分");
    check("公众演讲 shown (the school's null does not apply)", rows.some((r) => r[0] === "公众演讲"), true);
    check("Hive's total and service hours", rows.slice(-2).map((r) => r[1]), ["24 学分", "50"]);
    check("no 学校版本 chip", !!A.doc.querySelector("h2 .cm-scope.school"), false);
    check("Hive's policy text, not the school's note", A.doc.querySelector(".policy pre").textContent, "蜂巢政策");
    A.click(A.pick("#next3"));
    check("Hive's map, no chip", [A.mapRows().map((r) => r[0]), !!A.doc.querySelector("h2 .cm-scope.school")], [["数学"], false]);
    check("/api/school-plan is not even fetched by the website", fetched.some((u) => /school-plan/.test(u)), false);

    // 2. A visitor: the same.
    const B = page({ plan: null, signedIn: false });
    setTimeout(() => {
      B.toRequirements();
      const rowsB = B.reqRows();
      check("Hive's math credits for a visitor", rowsB.filter((r) => r[0] === "数学")[0][1], "4 学分");
      B.click(B.pick("#next3"));
      check("Hive's map", B.mapRows().map((r) => r[0]), ["数学"]);
      console.log(failures ? `\n${failures} FAILED` : "\nall assertions passed");
      process.exit(failures ? 1 : 0);
    }, 300);
  }, 300);
}, 100);
