// Grade filter behaviour, driven through the real page in jsdom.
//
// Run with:  npm i jsdom && node test/grade-filter.test.js
//
// The catalog's grade filter is the one control with real logic behind it —
// level scoping, stage grouping, merged grades (K1-K3 -> K) and OR'd
// multi-select — and all of it is invisible from the code alone: the bugs it
// has produced (a K-8 parent offered "High School", a stale selection filtering
// everything out while the dropdown showed "All") only appear when the wizard
// is actually driven. So this drives it: real index.html, real app.js, a
// fixture snapshot, and clicks.
const fs = require("fs");
const { JSDOM } = require("jsdom");

const path = require("path");
const ROOT = path.join(__dirname, "..", "assets") + path.sep;
// Use the site's real page skeleton so every element app.js expects exists.
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8")
  .replace(/<script[^>]*><\/script>/g, "");

// A snapshot shaped like the real one: courses tagged across K-8 and HS grades.
// A high-school course carrying one subject, with an explicit filter bucket.
const subj = (id, code, en, zh, subject, bucket) => ({
  id, code, nameEn: en, nameZh: zh, grades: ["G11", "G12"],
  trackIds: [1, 2, 3, 4, 5, 6], price: 100, teachers: [],
  subjects: [{ nameEn: subject, nameZh: subject, filterKey: bucket, filterNameEn: bucket, filterNameZh: bucket }],
});

const snapshot = {
  generatedAt: "2026-09-05T00:00:00Z",
  k8TrackId: 7,
  grades: ["G12","K1","G2","G7","G9","G11","G3","Pre-K","K2","K3","G1","G4","G5","G6","G8","G10","Associate of Arts Degree"],
  tracks: [{
    trackId: 1, nameEn: "International: Classical", nameZh: "国际·古典",
    credits: { math: 4, science: 3, english: 4, chinese: 2, social: 2, bible: 2,
               speaking: 1, secondLang: 1, fineArts: 1, pe: 1, elective: 2 },
    totalCredits: 24, serviceHours: 50,
    commentsEn: "EN policy", commentsZh: "中文政策", comments: "EN policy",
  }],
  subjects: [{ nameEn: "Math", nameZh: "数学", filterKey: "Math", filterNameEn: "Math", filterNameZh: "数学" }],
  courses: [
    { id: "c1", code: "MTH-EL-101", nameEn: "Math G1",     nameZh: "数学一年级", grades: ["G1"],            trackIds: [1,2,3,4,5,6], price: 100, subjects: [], teachers: [] },
    { id: "c2", code: "MTH-EL-103", nameEn: "Math G3",     nameZh: "数学三年级", grades: ["G3"],            trackIds: [1,2,3,4,5,6], price: 100, subjects: [], teachers: [] },
    { id: "c3", code: "MTH-EL-105", nameEn: "Math G5",     nameZh: "数学五年级", grades: ["G5"],            trackIds: [1,2,3,4,5,6], price: 100, subjects: [], teachers: [] },
    { id: "c4", code: "MTH-EL-102", nameEn: "Math G2",     nameZh: "数学二年级", grades: ["G2"],            trackIds: [1,2,3,4,5,6], price: 100, subjects: [], teachers: [] },
    { id: "c5", code: "CHL-KG-101", nameEn: "Kinder Chin", nameZh: "幼儿中文",   grades: ["K1","K2"],       trackIds: [1,2,3,4,5,6], price: 100, subjects: [], teachers: [] },
    { id: "c6", code: "CHL-KG-100", nameEn: "Pre-K Chin",  nameZh: "学前中文",   grades: ["Pre-K"],         trackIds: [1,2,3,4,5,6], price: 100, subjects: [], teachers: [] },
    { id: "c7", code: "MTH-HS-201", nameEn: "Algebra II",  nameZh: "代数二",     grades: ["G9","G10"],      trackIds: [1,2,3,4,5,6], price: 100, subjects: [], teachers: [] },
    { id: "c8", code: "MTH-HS-301", nameEn: "Calculus",    nameZh: "微积分",     grades: ["G11","G12"],     trackIds: [1,2,3,4,5,6], price: 100, subjects: [], teachers: [] },
    { id: "c9", code: "CLP-CLP-101",nameEn: "AA Seminar",  nameZh: "大学预科",   grades: ["Associate of Arts Degree"], trackIds: [1,2,3,4,5,6], price: 100, subjects: [], teachers: [] },
    // Requirements-page fixtures. Each carries a subject whose FILTER BUCKET
    // differs from it, which is exactly the confusion the page must not make.
    subj("e1", "ESL-HS-101",  "Advanced ESL",   "高级ESL课程", "ESL",             "ESL"),
    subj("e2", "ESL-SPK-201", "Free Talk",      "英语自由会话", "ESL",             "ESL"),
    subj("t1", "THL-HS-101",  "Spanish I",      "西班牙语一",   "Third Languages", "Electives"),
    subj("m1", "MUS-HS-101",  "Choir",          "合唱",        "Music",           "Specials"),
    subj("p1", "PE-HS-101",   "Team Sports",    "团队运动",     "PE",              "Specials"),
    subj("x1", "ELE-HS-101",  "Yearbook",       "年鉴",        "Electives",       "Electives"),
  ],
  teachers: [], messages: {},
};

const { VirtualConsole } = require("jsdom");
const vc = new VirtualConsole();
vc.on("jsdomError", (e) => console.log("   [page error]", e.message.split("\n")[0]));
vc.on("error", (...a) => console.log("   [console.error]", ...a));
const dom = new JSDOM(html, { runScripts: "outside-only", url: "https://www.fengchao.life/", virtualConsole: vc });
const { window } = dom;
window.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve(snapshot) });
window.scrollTo = () => {};
window.matchMedia = () => ({ matches: false, addEventListener(){}, removeEventListener(){} });

window.eval(fs.readFileSync(ROOT + "i18n.js", "utf8"));
window.eval(fs.readFileSync(ROOT + "app.js", "utf8"));

const doc = window.document;
const click = (el) => el.dispatchEvent(new window.Event("click", { bubbles: true }));
const tick = (el) => { el.checked = !el.checked; el.dispatchEvent(new window.Event("change", { bubbles: true })); };
const count = () => {
  const m = /(\d+)/.exec(doc.querySelector(".result-count")?.textContent || "");
  return m ? Number(m[1]) : null;
};
const names = () => Array.from(doc.querySelectorAll(".course-card h4"))
  .map(h => h.textContent.replace(/\s+/g, " ").trim().replace(/\s+\S+-\S+-\S+$/, ""));
const rows = () => Array.from(doc.querySelectorAll("#fGradePanel .ms-row"))
  .map(r => r.querySelector("span").textContent);

let failures = 0;
const check = (label, actual, expected) => {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : `\n        got ${a}\n        want ${e}`}`);
};

const pick = (sel) => { const el = doc.querySelector(sel); if (!el) throw new Error("missing " + sel); return el; };
const goToCatalog = (level) => {
  click(pick('#levelGrid .choice-card[data-key="' + level + '"]'));
  click(pick("#next0"));
  if (level === "hs") { click(pick('#modeGrid .choice-card[data-key="international"]')); click(pick("#next1")); }
  click(pick('#pedGrid .choice-card[data-key="' + (level === "hs" ? "classical" : "nonclassical") + '"]'));
  click(pick("#next2"));
  if (level === "hs") {
    if (!doc.getElementById("next3")) {
      console.log("   [debug] expected the requirements step; stepper says:",
        Array.from(doc.querySelectorAll("#stepper .step-item")).map(e => e.className + ":" + e.textContent.trim()).join(" | "));
      console.log("   [debug] panel html:", (doc.getElementById("app") || {}).innerHTML?.slice(0, 400));
    }
    click(pick("#next3"));
  }
};
const box = (v) => pick('#fGradePanel input[data-grade="' + v + '"]');

setTimeout(() => {
  goToCatalog("k8");

  check("K-8 lists bare grade codes only, kindergarten merged into K",
    rows(),
    ["K", "G1", "G2", "G3", "G4", "G5", "G6", "G7", "G8"]);
  check("no stage rows anywhere", doc.querySelectorAll("#fGradePanel input[data-stage]").length, 0);
  check("K-8 offers no high-school grade", rows().some(r => /高中|大学预科|G9|G1[012]/.test(r)), false);
  check("no filter -> whole K-8 catalog, Pre-K course included", count(), 6);
  check("the Pre-K course is still in the catalog, just not filterable",
    names().indexOf("学前中文") !== -1, true);

  click(pick("#fGradeBtn"));
  check("button opens the panel", doc.getElementById("fGradePanel").hidden, false);
  tick(box("G1")); tick(box("G3")); tick(box("G5"));
  check("G1 + G3 + G5 are OR'd", names().sort(), ["数学一年级", "数学三年级", "数学五年级"].sort());
  check("summary shows first + overflow", doc.querySelector(".ms-btn-txt").textContent, "G1 +2");
  check("panel stays open while picking", doc.getElementById("fGradePanel").hidden, false);

  tick(box("G3"));
  check("unticking G3 removes it", names().sort(), ["数学一年级", "数学五年级"].sort());

  click(pick("#fGradeClear"));
  check("clear resets to the whole level", count(), 6);
  check("clear resets the summary", doc.querySelector(".ms-btn-txt").textContent, "全部");
  check("clear unticks every box", Array.from(doc.querySelectorAll("#fGradePanel input")).some(i => i.checked), false);

  tick(box("K"));
  check("K covers K1/K2/K3 only — Pre-K is not part of it", names(), ["幼儿中文"]);
  check("no Pre-K row is offered", rows().indexOf("Pre-K"), -1);

  click(pick("#fGradeClear"));
  tick(box("G1")); tick(box("G2")); tick(box("G3")); tick(box("G4")); tick(box("G5")); tick(box("G6"));
  check("ticking every elementary grade is still one OR", names().sort(),
    ["数学一年级", "数学二年级", "数学三年级", "数学五年级"].sort());

  // ---- high school -------------------------------------------------------
  click(pick("#back4"));
  click(pick("#back2"));
  goToCatalog("hs");
  check("HS lists G9-G12 plus 大学预科, no stage rows",
    rows(),
    ["G9", "G10", "G11", "G12", "大学预科"]);
  check("HS offers no K-8 grade", rows().some(r => /^(K|Pre-K|G[1-8])$/.test(r)), false);
  check("switching level cleared the K-8 grade selection", doc.querySelector(".ms-btn-txt").textContent, "全部");

  tick(box("G9"));
  check("G9 matches the course tagged G9+G10", names(), ["代数二"]);
  tick(box("Associate of Arts Degree"));
  check("G9 OR 大学预科", names().sort(), ["代数二", "大学预科"].sort());

  // The college-prep row is the one entry that is a name rather than a grade
  // code, so it must follow the page language instead of staying Chinese.
  click(pick("#langBtn"));
  check("EN: college prep row is English, grade codes unchanged",
    rows(), ["G9", "G10", "G11", "G12", "Pre-College"]);
  check("EN: selection survives the language toggle",
    doc.querySelector(".ms-btn-txt").textContent, "G9 +1");
  click(pick("#langBtn"));
  check("ZH: back to 大学预科", rows(), ["G9", "G10", "G11", "G12", "大学预科"]);

  // ---- graduation requirements page: subject decides the row, never bucket --
  click(pick("#back4"));            // back to the requirements step
  // Expanding a row re-renders the step, so re-query the DOM after each click
  // rather than holding on to the button that triggered it.
  const reqToggle = label => Array.from(doc.querySelectorAll(".req-toggle"))
    .find(b => b.textContent.replace(/[▾▸\s]/g, "").startsWith(label));
  const reqRow = label => {
    const btn = reqToggle(label);
    if (!btn) return null;
    btn.click();
    const chips = Array.from(doc.querySelectorAll(".req-courses .req-chip-code"))
      .map(c => c.textContent.trim());
    const collapse = reqToggle(label);
    if (collapse) collapse.click();
    return chips;
  };
  const plainRow = label => Array.from(doc.querySelectorAll(".req-table td"))
    .some(td => td.textContent.trim() === label && !td.querySelector(".req-toggle"));

  check("ESL courses appear under NO requirement row", reqRow("选修"), ["ELE-HS-101"]);
  check("a Music course sits under 艺术, not 选修 (bucket says Specials)",
    reqRow("艺术"), ["MUS-HS-101"]);
  check("a Third Languages course sits under 第二外语 (bucket says Electives)",
    reqRow("第二外语"), ["THL-HS-101"]);
  check("PE has its own row now", reqRow("体育"), ["PE-HS-101"]);
  check("社会学 stays empty — no HS social-studies course in this fixture",
    plainRow("社会学"), true);

  console.log(failures ? `\n${failures} FAILED` : "\nall assertions passed");
  process.exit(failures ? 1 : 0);
}, 300);
