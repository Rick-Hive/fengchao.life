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
  trackIds: [1, 2, 3, 4, 5, 6], price: 100, teachers: [], creditHours: 0.5,
  subjects: [{ nameEn: subject, nameZh: subject, filterKey: bucket, filterNameEn: bucket, filterNameZh: bucket }],
});

const MATH = { nameEn: "Math", nameZh: "数学", filterKey: "Math", filterNameEn: "Math", filterNameZh: "数学" };

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
    { id: "c1", code: "MTH-EL-101", nameEn: "Math G1",     nameZh: "数学一年级", grades: ["G1"],            trackIds: [1,2,3,4,5,6], price: 100, subjects: [MATH], teachers: [] },
    { id: "c2", code: "MTH-EL-103", nameEn: "Math G3",     nameZh: "数学三年级", grades: ["G3"],            trackIds: [1,2,3,4,5,6], price: 100, subjects: [], teachers: [] },
    { id: "c3", code: "MTH-EL-105", nameEn: "Math G5",     nameZh: "数学五年级", grades: ["G5"],            trackIds: [1,2,3,4,5,6], price: 100, subjects: [], teachers: [] },
    { id: "c4", code: "MTH-EL-102", nameEn: "Math G2",     nameZh: "数学二年级", grades: ["G2"],            trackIds: [1,2,3,4,5,6], price: 100, subjects: [], teachers: [] },
    { id: "c5", code: "CHL-KG-101", nameEn: "Kinder Chin", nameZh: "幼儿中文",   grades: ["K1","K2"],       trackIds: [1,2,3,4,5,6], price: 100, subjects: [], teachers: [] },
    { id: "c6", code: "CHL-KG-100", nameEn: "Pre-K Chin",  nameZh: "学前中文",   grades: ["Pre-K"],         trackIds: [1,2,3,4,5,6], price: 100, subjects: [], teachers: [] },
    { id: "d1", code: "MTH-MS-107", nameEn: "Pre-Algebra", nameZh: "预备代数", grades: ["G7","G8"], trackIds: [1,2,3,4,5,6], price: 100, subjects: [MATH], teachers: [] },
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
  // Curriculum map fixtures: grammar and rhetoric have a table, dialectic does
  // not — so the step must appear for the first two and vanish for the third.
  curriculumMap: {
    grammar: {
      grades: ["K", "G1", "G2", "G3", "G4", "G5", "G6"],
      rows: [
        { id: "r1", order: 1, subjects: [{ nameEn: "Math", nameZh: "数学" }], trackIds: [], pedagogy: null, spanAll: false,
          cells: { K: [{ en: "Montessori", zh: "蒙特梭利教具" }], G1: [{ en: "ACSI Math G1", zh: "ACSI数学 G1" }, { en: null, zh: "沪教版数学 G1" }],
                   G2: [], G3: [{ en: "ACSI Math G3", zh: "ACSI数学 G3" }], G4: [], G5: [], G6: [] } },
        { id: "r2", order: 2, subjects: [{ nameEn: "Chinese Literature", nameZh: "中文文学" }], trackIds: [], pedagogy: null, spanAll: false,
          cells: { K: [], G1: [1, 2, 3, 4, 5].map(n => ({ en: "Book " + n, zh: "书" + n })), G2: [], G3: [], G4: [], G5: [], G6: [] } },
        { id: "r3", order: 3, subjects: [{ nameEn: "Elective", nameZh: "选修" }], trackIds: [], pedagogy: null, spanAll: true,
          cells: { K: [{ en: "Music", zh: "音乐" }, { en: "Art", zh: "艺术" }, { en: "PE", zh: "体育" }], G1: [], G2: [], G3: [], G4: [], G5: [], G6: [] } },
      ],
    },
    rhetoric: {
      grades: ["G9", "G10", "G11", "G12"],
      rows: [
        { id: "h1", order: 1, subjects: [{ nameEn: "Bible", nameZh: "圣经" }],   trackIds: [2, 4, 6], pedagogy: null, spanAll: false,
          cells: { G9: [{ en: "Spiritual Disciplines", zh: "属灵操练" }], G10: [], G11: [], G12: [] } },
        { id: "h2", order: 2, subjects: [{ nameEn: "Theology", nameZh: "神学" }], trackIds: [1, 3, 5], pedagogy: null, spanAll: false,
          cells: { G9: [{ en: "Omnibus III", zh: "Omnibus III 教义" }], G10: [], G11: [], G12: [] } },
        { id: "h3", order: 3, subjects: [{ nameEn: "Math", nameZh: "数学" }],     trackIds: [1, 2, 3, 4, 5, 6], pedagogy: null, spanAll: false,
          cells: { G9: [{ en: "Geometry", zh: "几何" }], G10: [{ en: "Algebra 2", zh: "代数2" }], G11: [], G12: [] } },
      ],
    },
  },
};

const { VirtualConsole } = require("jsdom");
const vc = new VirtualConsole();
vc.on("jsdomError", (e) => console.log("   [page error]", e.message.split("\n")[0]));
vc.on("error", (...a) => console.log("   [console.error]", ...a));
const dom = new JSDOM(html, { runScripts: "outside-only", url: "https://www.fengchao.life/", virtualConsole: vc });
const { window } = dom;
window.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve(snapshot) });
let scrollCalls = 0;
window.scrollTo = () => { scrollCalls++; };
// jsdom only provides rAF with pretendToBeVisual; the modal uses it to animate in.
window.requestAnimationFrame = cb => setTimeout(() => cb(Date.now()), 0);
window.cancelAnimationFrame = id => clearTimeout(id);
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
// Pedagogy -> stage -> (rhetoric only: track -> requirements) -> catalog.
const goToCatalog = (stage, pedagogy) => {
  if (doc.getElementById("pedGrid")) {
    click(pick('#pedGrid .choice-card[data-key="' +
      (pedagogy || (stage === "rhetoric" ? "classical" : "nonclassical")) + '"]'));
    click(pick("#next2"));
  }
  click(pick('#stageGrid .choice-card[data-key="' + stage + '"]'));
  click(pick("#next0"));
  if (stage === "rhetoric") {
    click(pick('#modeGrid .choice-card[data-key="international"]'));
    click(pick("#next1"));   // track -> requirements
    click(pick("#next3"));   // requirements -> map (or catalog)
  }
  if (doc.getElementById("next6")) click(pick("#next6"));   // map -> catalog
};
// Walk Back from wherever we are until the pedagogy page is showing. (Setting
// location.hash would work in a browser, but jsdom dispatches hashchange
// asynchronously, so the assertions would run against the previous page.)
const backToStart = () => {
  for (let i = 0; i < 8 && !doc.getElementById("pedGrid"); i++) {
    const b = ["back5", "back4", "back6", "back3", "back1", "back0"].map(id => doc.getElementById(id)).find(Boolean);
    if (!b) break;
    b.click();
  }
  if (!doc.getElementById("pedGrid")) throw new Error("could not get back to the pedagogy page");
};
const box = (v) => pick('#fGradePanel input[data-grade="' + v + '"]');

setTimeout(() => {
  goToCatalog("grammar");

  check("grammar stage lists K and G1-G6 only — no G7/G8, which is now its own stage",
    rows(),
    ["K", "G1", "G2", "G3", "G4", "G5", "G6"]);
  check("no stage rows anywhere", doc.querySelectorAll("#fGradePanel input[data-stage]").length, 0);
  check("grammar stage offers no high-school grade", rows().some(r => /高中|大学预科|G9|G1[012]/.test(r)), false);
  check("no filter -> the whole grammar-stage catalog, Pre-K course included", count(), 6);
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

  // ---- rhetoric stage ----------------------------------------------------
  backToStart();
  goToCatalog("rhetoric");
  check("rhetoric stage lists G9-G12 plus 大学预科",
    rows(),
    ["G9", "G10", "G11", "G12", "大学预科"]);
  check("rhetoric stage offers no K-G8 grade", rows().some(r => /^(K|Pre-K|G[1-8])$/.test(r)), false);
  check("switching stage cleared the previous grade selection", doc.querySelector(".ms-btn-txt").textContent, "全部");

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
  click(pick("#back4"));            // back to the map
  if (doc.getElementById("back6")) click(pick("#back6"));   // ...then the requirements step
  // Expanding a row re-renders the step, so re-query the DOM after each click
  // rather than holding on to the button that triggered it.
  const reqToggle = label => Array.from(doc.querySelectorAll(".req-toggle"))
    .find(b => b.textContent.replace(/[▾▸]/g, "").trim().startsWith(label));
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

  // Credit numbers carry their unit, in the page language.
  const cellFor = label => {
    const td = Array.from(doc.querySelectorAll(".req-table tr"))
      .map(tr => tr.children.length === 2 ? tr : null).filter(Boolean)
      .find(tr => tr.children[0].textContent.replace(/[▾▸]/g, "").trim().startsWith(label));
    return td ? td.children[1].textContent.trim() : null;
  };
  check("ZH: a requirement row reads '4 学分'", cellFor("数学"), "4 学分");
  check("ZH: the total row carries the unit too", cellFor("总学分"), "24 学分");
  check("ZH: a 1-credit row is still 学分", cellFor("体育"), "1 学分");
  check("service hours keep hours, not credits", cellFor("社区服务"), "50");
  reqToggle("艺术").click();
  check("ZH: chip credit shows the unit",
    doc.querySelector(".req-courses .req-chip-cr").textContent.trim(), "0.5 学分");
  reqToggle("艺术").click();

  click(pick("#langBtn"));
  check("EN: plural for 4", cellFor("Math"), "4 credits");
  check("EN: singular for exactly 1", cellFor("Physical Education"), "1 credit");
  check("EN: 0.5 is plural", (() => {
    reqToggle("Fine Arts").click();
    const v = doc.querySelector(".req-courses .req-chip-cr").textContent.trim();
    reqToggle("Fine Arts").click();
    return v;
  })(), "0.5 credits");
  click(pick("#langBtn"));

  // Expanding/collapsing a row must not scroll the page: render() jumps to the
  // top, which threw the parent away from the row they had just opened.
  let before = scrollCalls;
  reqToggle("艺术").click();                       // expand
  check("expanding a row does not scroll the page", scrollCalls, before);
  check("...and the row really is open",
    doc.querySelectorAll(".req-courses .req-chip").length > 0, true);
  reqToggle("艺术").click();                       // collapse
  check("collapsing does not scroll either", scrollCalls, before);
  check("...and the row really is closed",
    doc.querySelectorAll(".req-courses .req-chip").length, 0);

  // Selecting a course from a requirement chip is the third path that used to
  // fall through to render().
  reqToggle("艺术").click();
  const chip = doc.querySelector(".req-courses .req-chip");
  chip.click();                                    // opens the detail modal
  const selectBtn = doc.querySelector(".modal [data-select]");
  if (selectBtn) {
    selectBtn.click();
    check("selecting from a requirement chip does not scroll", scrollCalls, before);
    check("...and the chip shows as selected",
      !!doc.querySelector(".req-courses .req-chip.in-cart"), true);
  } else {
    check("modal offered a Select button", !!selectBtn, true);
  }

  // ---- the three-stage, pedagogy-first flow -------------------------------
  backToStart();
  check("pedagogy is the first page and has no Back",
    [!!doc.getElementById("pedGrid"), !!doc.getElementById("back2")], [true, false]);
  check("the stage page cannot be reached before a pedagogy is chosen",
    (() => { window.location.hash = "#/level"; return !!doc.getElementById("pedGrid"); })(), true);

  // Classical reads the trivium...
  click(pick('#pedGrid .choice-card[data-key="classical"]')); click(pick("#next2"));
  check("classical stage cards: trivium names",
    Array.from(doc.querySelectorAll("#stageGrid .choice-card h3")).map(h => h.firstChild.textContent.trim()),
    ["文法阶段", "逻辑阶段", "修辞阶段"]);
  check("...each card shows the grades it covers",
    Array.from(doc.querySelectorAll("#stageGrid .stage-range")).map(e => e.textContent),
    ["K–G6", "G7–G8", "G9–G12"]);
  check("classical descriptions may use the trivium",
    /文法阶段/.test(pick('#stageGrid .choice-card[data-key="grammar"] p').textContent), true);
  // The stepper reflects the stage currently selected, so check it after a
  // stage is picked rather than while the previous one is still in state.
  click(pick('#stageGrid .choice-card[data-key="grammar"]'));
  check("stepper is pedagogy-first, five steps for grammar (it has a map)",
    Array.from(doc.querySelectorAll("#stepper .lbl")).map(e => e.textContent),
    ["教育理念", "学段", "课程地图", "选择课程", "提交订单"]);
  check("picking a stage does not leave the previous one selected",
    Array.from(doc.querySelectorAll("#stageGrid .choice-card.selected")).map(c => c.getAttribute("data-key")),
    ["grammar"]);

  // ...non-classical reads the conventional school names, same three divisions
  click(pick("#back0"));
  click(pick('#pedGrid .choice-card[data-key="nonclassical"]')); click(pick("#next2"));
  check("non-classical stage cards: conventional names",
    Array.from(doc.querySelectorAll("#stageGrid .choice-card h3")).map(h => h.firstChild.textContent.trim()),
    ["小学", "初中", "高中"]);
  // A non-classical family has not adopted the trivium's theory of how a child
  // learns, so no trivium vocabulary may reach them — neither the stage names
  // nor the blurbs beneath them. 逻辑思辨/论证训练 describes 逻辑阶段, not 初中.
  check("no trivium vocabulary anywhere on the non-classical stage page",
    (doc.getElementById("stageGrid").textContent.match(/文法|逻辑|修辞|思辨|论证/g) || []), []);

  // The dialectic stage: its own catalog, no track, no requirements
  click(pick('#stageGrid .choice-card[data-key="dialectic"]')); click(pick("#next0"));
  check("dialectic goes straight to the catalog — no track step", !!doc.getElementById("gridWrap"), true);
  check("dialectic grade filter offers G7 and G8 only", rows(), ["G7", "G8"]);
  check("dialectic catalog holds the G7-G8 course", names(), ["预备代数"]);
  check("dialectic stepper has four steps", Array.from(doc.querySelectorAll("#stepper .lbl")).map(e => e.textContent),
    ["教育理念", "学段", "选择课程", "提交订单"]);

  // Rhetoric keeps the track + requirements steps
  backToStart();
  click(pick('#pedGrid .choice-card[data-key="classical"]')); click(pick("#next2"));
  click(pick('#stageGrid .choice-card[data-key="rhetoric"]')); click(pick("#next0"));
  check("rhetoric asks for a graduation track", !!doc.getElementById("modeGrid"), true);
  check("classical track hint says 修辞阶段 and never 高中",
    (function () { var h = pick("#modeGrid").parentNode.querySelector(".hint").textContent;
      return [h.indexOf("修辞阶段") >= 0, /高中/.test(h)]; })(), [true, false]);
  check("rhetoric stepper has seven steps (track, requirements, map)", Array.from(doc.querySelectorAll("#stepper .lbl")).map(e => e.textContent),
    ["教育理念", "学段", "毕业路径", "毕业学分要求", "课程地图", "选择课程", "提交订单"]);
  click(pick('#modeGrid .choice-card[data-key="international"]')); click(pick("#next1"));
  check("...then its credit requirements", doc.querySelector(".panel h2").textContent, "毕业学分要求");
  check("the track is still mode x pedagogy",
    JSON.parse(window.localStorage.getItem("fc-wizard-v1")).mode + "/" +
    JSON.parse(window.localStorage.getItem("fc-wizard-v1")).pedagogy, "international/classical");

  // The track page's hint used to read "仅高中（修辞阶段）" — both vocabularies
  // in one sentence. It must now name only the one the family chose.
  backToStart();
  click(pick('#pedGrid .choice-card[data-key="nonclassical"]')); click(pick("#next2"));
  click(pick('#stageGrid .choice-card[data-key="rhetoric"]')); click(pick("#next0"));
  check("non-classical track hint says 高中 and never 修辞",
    (function () { var h = pick("#modeGrid").parentNode.querySelector(".hint").textContent;
      return [h.indexOf("高中") >= 0, /修辞/.test(h)]; })(), [true, false]);

  // ---- curriculum map ------------------------------------------------------
  backToStart();
  click(pick('#pedGrid .choice-card[data-key="nonclassical"]')); click(pick("#next2"));
  click(pick('#stageGrid .choice-card[data-key="grammar"]')); click(pick("#next0"));
  check("grammar: Next from the stage lands on the map", !!doc.getElementById("mapCard"), true);
  check("map hash", window.location.hash, "#/map");
  check("stepper lists the map before the courses",
    Array.from(doc.querySelectorAll("#stepper .lbl")).map(e => e.textContent), ["教育理念", "学段", "课程地图", "选择课程", "提交订单"]);
  check("stage step shows as done, map as active",
    Array.from(doc.querySelectorAll("#stepper .step-item")).map(e => e.className.replace("step-item", "").trim()),
    ["done", "done", "active", "ready", ""]);
  check("grid columns are the stage's grades",
    Array.from(doc.querySelectorAll(".cm-table thead th")).map(e => e.textContent).slice(1), ["K", "G1", "G2", "G3", "G4", "G5", "G6"]);
  check("rows in table order", Array.from(doc.querySelectorAll(".cm-row")).map(e => e.textContent), ["数学", "中文文学", "选修"]);
  const mathRow = doc.querySelectorAll(".cm-table tbody tr")[0];
  check("a cell shows only the page language and falls back when one side is blank",
    Array.from(mathRow.children[2].querySelectorAll(".cm-item")).map(e => e.textContent), ["ACSI数学 G1", "沪教版数学 G1"]);
  check("...and counts the catalog courses that fit it", mathRow.children[2].querySelector(".cm-avail").textContent, "1 门可选");
  check("an empty cell is hatched and not clickable", mathRow.children[3].className, "cm-none");
  const litCell = doc.querySelectorAll(".cm-table tbody tr")[1].children[2];
  check("long cells show three items and a +N pill",
    [litCell.querySelectorAll(".cm-item").length, litCell.querySelector(".cm-more").textContent], [3, "+2"]);
  const span = doc.querySelectorAll(".cm-table tbody tr")[2].children[1];
  check("a not-by-grade row spans every column with one merged list",
    [span.getAttribute("colspan"), span.textContent.replace(/\s+/g, "")], ["7", "音乐艺术体育"]);

  // tapping a cell opens the sheet with everything in it, without scrolling
  before = scrollCalls;
  click(litCell);
  const sheet = doc.querySelector(".cm-sheet");
  check("tapping a cell opens its sheet, page does not scroll",
    [!!sheet, scrollCalls === before], [true, true]);
  check("the sheet lists all five items", sheet.querySelectorAll(".cm-sheet-items li").length, 5);
  check("...and says when no course fits", !!sheet.querySelector(".cm-sheet-none"), true);
  click(sheet.querySelector("[data-close]"));
  click(mathRow.children[2]);
  const sheet2 = doc.querySelectorAll(".cm-sheet")[doc.querySelectorAll(".cm-sheet").length - 1];
  const selBtn = sheet2.querySelector("[data-select]");
  check("the math cell's sheet offers the fitting course with a Select button", !!selBtn, true);
  before = scrollCalls;
  click(selBtn);
  check("selecting from the sheet repaints in place and does not scroll",
    [scrollCalls === before, !!doc.querySelector("#mapCard .cm-avail")], [true, true]);
  check("...and the cart has it", JSON.parse(window.localStorage.getItem("fc-wizard-v1")).cart.c1, true);
  click(sheet2.querySelector("[data-close]"));

  // phone view: one grade at a time
  check("phone view defaults to the first grade", doc.querySelector(".cm-tab.on").textContent, "K");
  click(doc.querySelector('.cm-tab[data-tab="G1"]'));
  check("switching the grade tab repaints the list in place",
    [doc.querySelector(".cm-tab.on").textContent, Array.from(doc.querySelectorAll(".cm-mrow h4")).map(e => e.textContent)],
    ["G1", ["数学", "中文文学", "选修"]]);

  // English shows the other half of each item
  click(pick("#langBtn"));
  check("English view shows the English half",
    Array.from(doc.querySelectorAll(".cm-table tbody tr")[0].children[2].querySelectorAll(".cm-item")).map(e => e.textContent), ["ACSI Math G1", "沪教版数学 G1"]);
  click(pick("#langBtn"));

  click(pick("#next6"));
  check("Next from the map is the catalog", !!doc.getElementById("gridWrap"), true);
  click(pick("#back4"));
  check("Back from the catalog returns to the map", !!doc.getElementById("mapCard"), true);

  // rhetoric: rows narrowed to the chosen track; dialectic: no table, no step
  backToStart();
  click(pick('#pedGrid .choice-card[data-key="classical"]')); click(pick("#next2"));
  click(pick('#stageGrid .choice-card[data-key="rhetoric"]')); click(pick("#next0"));
  click(pick('#modeGrid .choice-card[data-key="international"]')); click(pick("#next1")); click(pick("#next3"));
  check("rhetoric: requirements -> map", !!doc.getElementById("mapCard"), true);
  check("rhetoric rows are narrowed to track 1 (Theology yes, Bible no)",
    Array.from(doc.querySelectorAll(".cm-row")).map(e => e.textContent), ["神学", "数学"]);
  check("the map is titled with the track", doc.querySelector(".cm-scope").textContent, "国际·古典");
  check("rhetoric stepper has seven steps",
    Array.from(doc.querySelectorAll("#stepper .lbl")).map(e => e.textContent),
    ["教育理念", "学段", "毕业路径", "毕业学分要求", "课程地图", "选择课程", "提交订单"]);
  backToStart();
  click(pick('#pedGrid .choice-card[data-key="classical"]')); click(pick("#next2"));
  click(pick('#stageGrid .choice-card[data-key="dialectic"]')); click(pick("#next0"));
  check("dialectic has no table yet: the step is skipped and the stepper omits it",
    [!!doc.getElementById("gridWrap"), Array.from(doc.querySelectorAll("#stepper .lbl")).map(e => e.textContent)],
    [true, ["教育理念", "学段", "选择课程", "提交订单"]]);

  console.log(failures ? `\n${failures} FAILED` : "\nall assertions passed");
  process.exit(failures ? 1 : 0);
}, 300);
