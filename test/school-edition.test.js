// The school edition on the website (assets/app.js + /api/school-plan), driven through the
// real page in jsdom: a signed-in family whose school published a 课程方案 sees the
// school's graduation credits and curriculum map (marked 学校版本); a family whose school
// published nothing, or a visitor, sees Hive's defaults exactly as before.
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

function page(planAnswer) {
  const vc = new VirtualConsole();
  vc.on("jsdomError", (e) => console.log("   [page error]", e.message.split("\n")[0]));
  const dom = new JSDOM(html, { runScripts: "outside-only", url: "https://www.fengchao.life/", virtualConsole: vc });
  const { window } = dom;
  window.fetch = (u) => Promise.resolve({ ok: true, json: () => Promise.resolve(String(u).indexOf("/api/school-plan") === 0 ? planAnswer : snapshot) });
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
  // 1. The family of 甲校: the school edition.
  const A = page({ plan, signedIn: true, domain: "a.edu" });
  setTimeout(() => {
    A.toRequirements();
    const rows = A.reqRows();
    check("the school's math credits replace Hive's (5, not 4)", rows.filter((r) => r[0] === "数学")[0][1], "5 学分");
    check("a row the school set to null is hidden (公众演讲)", rows.some((r) => r[0] === "公众演讲"), false);
    check("rows the school did not touch keep Hive's figure (科学 3)", rows.filter((r) => r[0] === "科学")[0][1], "3 学分");
    check("the school's total and Hive's service hours (not overridden)", rows.slice(-2).map((r) => r[1]), ["26 学分", "50"]);
    check("the 学校版本 chip names the school", A.doc.querySelector("h2 .cm-scope.school").textContent, "学校版本 · 甲校");
    check("the school's note replaces Hive's policy text", A.doc.querySelector(".policy pre").textContent, "校方说明");
    A.click(A.pick("#next3"));
    check("the map step shows the school's rows (the subject column), chip included", [A.mapRows().map((r) => r[0]), !!A.doc.querySelector("#mapCard") && !!A.doc.querySelector("h2 .cm-scope.school")], [["数学", "拉丁文"], true]);
    check("the school's cells (each with Hive's course count), a span-all row as one cell", [A.mapRows()[0].slice(1, 3), A.mapRows()[1].length], [["代数一1 门可选", "代数二1 门可选"], 2]);
    check("a cell on a Hive subject still opens Hive's courses (代数二 → Algebra II) — 「地图上要显示蜂巢能提供的课程」", (() => { const cell = A.doc.querySelector('#mapCard .cm-cell[data-r="0"][data-g="G10"]'); if (!cell) return "no cell"; A.click(cell); return Array.from(A.doc.querySelectorAll(".cm-sheet-name")).map((h) => h.textContent.replace(/\s+/g, " ").trim()).some((n) => /代数二|Algebra II/.test(n)); })(), true);

    // 2. A school that published nothing (plan null) and a visitor: Hive's defaults, no chip.
    const B = page({ plan: null, signedIn: true, domain: "b.org" });
    setTimeout(() => {
      B.toRequirements();
      const rowsB = B.reqRows();
      check("Hive's math credits for a school without a plan", rowsB.filter((r) => r[0] === "数学")[0][1], "4 学分");
      check("公众演讲 shown, total 24, no chip, Hive's policy", [rowsB.some((r) => r[0] === "公众演讲"), rowsB.slice(-2)[0][1], !!B.doc.querySelector(".cm-scope.school"), B.doc.querySelector(".policy pre").textContent], [true, "24 学分", false, "蜂巢政策"]);
      B.click(B.pick("#next3"));
      check("Hive's map, no chip", [B.mapRows().map((r) => r[0]), !!B.doc.querySelector("h2 .cm-scope.school")], [["数学"], false]);
      console.log(failures ? `\n${failures} FAILED` : "\nall assertions passed");
      process.exit(failures ? 1 : 0);
    }, 300);
  }, 300);
}, 100);
