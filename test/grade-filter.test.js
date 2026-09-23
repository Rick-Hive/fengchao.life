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
    // 圣经/神学 is the one row that also matches on the Subject FILTER bucket.
    // b1 is in the bucket by name, b2 only by bucket (its subject is Theology,
    // which the split left out of every list), b3 is neither and must not show.
    subj("b1", "BIB-HS-101",  "Biblical Theo I", "圣经神学一",   "Bible",           "Bible"),
    subj("b2", "THE-HS-101",  "Doctrine I",      "教义学一",     "Theology",        "Bible"),
    subj("b3", "SCI-HS-900",  "Bible-ish Sci",   "伪圣经科学",   "Science",         "Science"),
    // Public Speaking's own bucket is "English" — proof that buckets stay off
    // every other row, or this one course would drag the English row with it.
    subj("s1", "PUB-HS-301",  "Public Speaking", "公众演讲入门", "Public Speaking", "English"),
    // Latin moved to its own subject; it must still satisfy 第二外语.
    subj("l1", "THL-HS-103",  "Latin I",        "拉丁语一",     "Classical Language", "Classical Language"),
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
window.confirm = () => true;   // the calculator confirms merges and replacements

window.eval(fs.readFileSync(ROOT + "i18n.js", "utf8"));
window.eval(fs.readFileSync(ROOT + "gpa.js", "utf8"));
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
// Routes are paths (/pedagogy, /gpa/sheet). The address as the bar shows it,
// and a Back/Forward-style arrival at a path (pushState + popstate, which
// jsdom delivers synchronously when dispatched by hand).
const url = () => window.location.pathname + window.location.hash;
// A semester block's title as printed ("9 年级 · 上学期"), and its two dropdowns.
const ptitle = (blk) => blk.querySelector(".gpa-period-title").textContent;
const pyear = (blk) => blk.querySelector("[data-period-grade]").value + "/" + blk.querySelector("[data-period-term]").value;
const nav = (p) => { window.history.pushState(null, "", p); window.dispatchEvent(new window.PopStateEvent("popstate")); };
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
    reqRow("第二外语").sort(), ["THL-HS-101", "THL-HS-103"]);
  check("PE has its own row now", reqRow("体育"), ["PE-HS-101"]);
  // The bucket-matched row, and the proof buckets are not used anywhere else.
  check("圣经/神学 matches by subject name AND by the Bible filter bucket",
    reqRow("圣经").sort(), ["BIB-HS-101", "THE-HS-101"]);
  check("...and does not pull in a course that is merely about the Bible",
    reqRow("圣经").indexOf("SCI-HS-900"), -1);
  check("公众演讲 gets the Public Speaking course",
    reqRow("公众演讲"), ["PUB-HS-301"]);
  // No fixture course has an English subject, so with buckets correctly off the
  // 英语 row stays bare. If buckets leaked, PUB-HS-301 would give it a list.
  check("...and its 'English' bucket does NOT drag it into the 英语 row",
    [plainRow("英语"), reqRow("英语")], [true, null]);
  check("Latin counts toward 第二外语 now that it is its own subject",
    reqRow("第二外语").sort(), ["THL-HS-101", "THL-HS-103"]);
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
  check("a typed /level opens the stage page directly (a pedagogy is already chosen)",
    (() => { nav("/level"); return [!!doc.getElementById("stageGrid"), url()]; })(), [true, "/level"]);
  check("a typed /done with no order placed is clamped back to the stage page, and the address rewritten in place — no dead entry for Back to land on",
    (() => { nav("/done"); return [!!doc.getElementById("stageGrid"), url()]; })(), [true, "/level"]);
  backToStart();

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
  check("map path", url(), "/map");
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

  // the cart bar shows on the map (a course was just selected from it) and its
  // summary opens the cart sheet, where a course can be reviewed and removed
  check("cart bar is visible on the map once something is selected",
    doc.getElementById("cartBar").classList.contains("visible"), true);
  // backdate the selection so the "chosen N days ago" line has something to say
  window.localStorage.setItem("fc-wizard-v1", JSON.stringify(Object.assign(
    JSON.parse(window.localStorage.getItem("fc-wizard-v1")), { cartAt: Date.now() - 3 * 86400000 })));
  click(pick("#cartInfo"));
  const cart = doc.querySelector(".cart-sheet");
  check("the bar's summary opens the cart sheet listing the selection",
    [!!cart, Array.from(cart.querySelectorAll(".cart-row .cm-sheet-name")).map(e => e.firstChild.textContent.trim())], [true, ["数学一年级"]]);
  before = scrollCalls;
  click(cart.querySelector("[data-remove]"));
  check("removing the last course closes the sheet, empties the cart and hides the bar, without scrolling",
    [!!doc.querySelector(".cart-sheet.show, .modal-overlay.show"), Object.keys(JSON.parse(window.localStorage.getItem("fc-wizard-v1")).cart).length,
     doc.getElementById("cartBar").classList.contains("visible"), scrollCalls === before],
    [false, 0, false, true]);
  // re-select, then go to the order page from the sheet
  click(mathRow.children[2]);
  click(doc.querySelectorAll(".cm-sheet")[doc.querySelectorAll(".cm-sheet").length - 1].querySelector("[data-select]"));
  click(doc.querySelectorAll(".cm-sheet")[doc.querySelectorAll(".cm-sheet").length - 1].querySelector("[data-close]"));
  click(pick("#cartInfo"));
  click(doc.querySelector(".cart-sheet [data-goto-order]"));
  check("Confirm in the cart sheet goes to the order page", !!doc.getElementById("email"), true);

  click(pick("#back5"));
  check("...and Back from the order page returns to the catalog", !!doc.getElementById("gridWrap"), true);
  click(pick("#back4"));

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

  // ---- the header cart -----------------------------------------------------
  // The bottom bar only appears on the pages where courses are chosen, so it is
  // no help to someone returning days later and landing on the first page. The
  // header cart is, and it must not stack listeners across renders.
  backToStart();
  goToCatalog("grammar", "classical");
  click(doc.querySelector(".course-card .btn-select"));
  check("the header cart shows the count on the basket",
    [doc.getElementById("cartBtnN").textContent, doc.getElementById("cartBtnN").classList.contains("zero")], ["1", false]);
  backToStart();
  check("...and is still there on the first page, where the bottom bar is not",
    [doc.getElementById("cartBtnN").textContent, doc.getElementById("cartBar").classList.contains("visible")],
    ["1", false]);
  // backdate the selection so the sheet has an age to report
  window.eval('(function(){ for (var k in window) {} })()');
  const beforeSheets = doc.querySelectorAll(".cart-sheet").length;
  click(pick("#cartBtn"));
  check("one click opens exactly one sheet — listeners are bound once, not per render",
    doc.querySelectorAll(".cart-sheet").length - beforeSheets, 1);
  const hdrCart = Array.from(doc.querySelectorAll(".cart-sheet")).pop();
  check("the sheet lists the selection", hdrCart.querySelectorAll(".cart-row").length, 1);
  click(hdrCart.querySelector("[data-remove]"));
  check("emptying it from the header leaves the cart in place, showing a quiet 0",
    [doc.getElementById("cartBtnN").textContent, doc.getElementById("cartBtnN").classList.contains("zero"),
     Object.keys(JSON.parse(window.localStorage.getItem("fc-wizard-v1")).cart).length],
    ["0", true, 0]);
  check("...and the label follows the page language",
    (() => { const zh = doc.getElementById("cartLbl").textContent; click(pick("#langBtn"));
             const en = doc.getElementById("cartLbl").textContent; click(pick("#langBtn")); return [zh, en]; })(),
    ["购物车", "Cart"]);

  // ---- 帮助 → Teams 和身份验证器设置 (/help/teams-setup.html) + 问答(Q&A) ----
  // A real page in the repo, not an SPA route: the nav handler must NOT
  // intercept it, or the browser would never leave the wizard.
  const helpLink = doc.querySelector('a.menu-item[href="/help/teams-setup.html"]');
  check("the support menu links to the Teams page in the same tab (an in-site page, no ↗)",
    [!!helpLink, helpLink && helpLink.getAttribute("target"), helpLink && !!helpLink.querySelector(".ext-ic")],
    [true, null, false]);
  check("帮助 is the last menu, right of 蜂巢生态",
    (() => { const labels = Array.prototype.map.call(doc.querySelectorAll("#siteNav .menu-btn"), (b) => b.textContent.trim());
             return [labels[labels.length - 1], labels[labels.length - 2]]; })(),
    ["帮助", "蜂巢生态"]);
  check("clicking it is a page load, not a route (default NOT prevented)",
    (() => { const ev = new window.MouseEvent("click", { bubbles: true, cancelable: true });
             helpLink.dispatchEvent(ev); return ev.defaultPrevented; })(),
    false);
  check("the support menu also links to the Q&A page, in the same tab",
    (() => { const q = doc.querySelector('a.menu-item[href="/help/teams-faq.html"]');
             return [!!q, q && q.getAttribute("target"), q && q.textContent.trim()]; })(),
    [true, null, "问答(Q&A)"]);

  // ---- G.P.A. calculator (/gpa) — a standalone page beside the wizard ----
  // Entered here through a LEGACY link (#/gpa, the address before paths), which
  // jsdom delivers as an asynchronous hashchange — so this doubles as the test
  // that old bookmarks still open the page, at its new address.
  const setVal = (el, v) => { el.value = v; el.dispatchEvent(new window.Event("input", { bubbles: true })); el.dispatchEvent(new window.Event("change", { bubbles: true })); };
  const gpaLink = doc.querySelector('a.menu-item[href="/gpa"]');
  check("the menu links to the calculator in the same tab (no ↗, no new window)",
    [!!gpaLink, gpaLink && gpaLink.getAttribute("target"), gpaLink && !!gpaLink.querySelector(".ext-ic")], [true, null, false]);
  // A saved sheet from an earlier visit: eight semesters, nine courses each at
  // half a credit (the shape the retired four-year template produced). Entering
  // the page over it exercises loading a save; the blank first open is tested
  // on a fresh instance at the end.
  const YEARS = {
    9:  [["English Literature 9", "英文文学 9", 1, true], ["English Writing 9", "英文写作 9", 0.5, true], ["Chinese Literature 9", "中文文学 9", 1, true], ["Chinese Writing 9", "中文写作 9", 0.5, true], ["Algebra I", "代数 I", 1, true], ["Biology", "生物", 1, true], ["World Geography", "世界地理", 1, true], ["Bible", "圣经", 1, false], ["PE / Health", "体育 / 健康", 0.5, false]],
    10: [["English Literature 10", "英文文学 10", 1, true], ["English Writing 10", "英文写作 10", 0.5, true], ["Chinese Literature 10", "中文文学 10", 1, true], ["Chinese Writing 10", "中文写作 10", 0.5, true], ["Geometry", "几何", 1, true], ["Chemistry", "化学", 1, true], ["World History", "世界历史", 1, true], ["Bible", "圣经", 1, false], ["Art / Music", "艺术 / 音乐", 0.5, false]],
    11: [["English Literature 11", "英文文学 11", 1, true], ["English Writing 11", "英文写作 11", 0.5, true], ["Chinese Literature 11", "中文文学 11", 1, true], ["Chinese Writing 11", "中文写作 11", 0.5, true], ["Algebra II", "代数 II", 1, true], ["Physics", "物理", 1, true], ["Chinese History", "中国历史", 1, true], ["Third Language I", "第二外语 I", 1, true], ["Bible", "圣经", 1, false]],
    12: [["English Literature 12", "英文文学 12", 1, true], ["English Writing 12", "英文写作 12", 0.5, true], ["Chinese Literature 12", "中文文学 12", 1, true], ["Chinese Writing 12", "中文写作 12", 0.5, true], ["Pre-Calculus", "预备微积分", 1, true], ["Science Elective", "科学选修", 1, true], ["Government & Economics", "政府与经济", 1, true], ["Public Speaking", "公众演讲", 1, true], ["Bible", "圣经", 1, false]],
  };
  let uidN = 0;
  const seed = { unit: "credits", gradeMode: "letter", periods: [] };
  [9, 10, 11, 12].forEach(g => ["s1", "s2"].forEach(term => seed.periods.push({
    id: "p" + (++uidN), grade: g, term, seq: null, name: "",
    rows: YEARS[g].map(r => ({ id: "r" + (++uidN), name: { en: r[0], zh: r[1] }, w: (r[2] / 2).toFixed(r[2] / 2 < 0.5 ? 2 : 1), grade: "", lvl: "CP", ac: r[3] })),
  })));
  window.localStorage.setItem("fc-gpa-v1", JSON.stringify(seed));
  window.location.hash = "#/gpa";
  // Each tab is its own history entry; hashchange and history.back() land on a
  // later tick, so the flow below is a chain of short waits.
  const after = (fn) => new Promise((res) => setTimeout(() => { fn(); res(); }, 30));
  const Y1 = () => doc.querySelectorAll(".gpa-year")[0];
  (async () => {
    await after(() => {
      check("a legacy #/gpa link opens the scale tab at its path, fragment gone", url(), "/gpa/scale");
      check("/gpa shows the calculator and hides the stepper and cart bar",
        [!!doc.getElementById("gpaPage"), doc.getElementById("stepper").hidden, doc.getElementById("cartBar").classList.contains("visible")],
        [true, true, false]);
      check("the page lands on tab 1, the scale; two tabs only since 2026-09-17 (Rick: \"直接两步就够了\"); no settings here",
        [doc.getElementById("gpaPage").getAttribute("data-view"), Array.from(doc.querySelectorAll(".gpa-tab")).map(b => b.textContent.replace(/^\d/, "")), doc.querySelectorAll("#gpaPage [data-toggle]").length],
        ["scale", ["评分标准", "课程与成绩"], 0]);
      check("the level note explains CP / Honors / AP / Dual Enrollment, and IB is gone",
        [/Dual Enrollment/.test(doc.querySelector(".gpa-levels").textContent), /IB/.test(doc.getElementById("gpaPage").textContent)], [true, false]);
      click(pick('[data-gpa-go="sheet"]'));
    });
    await after(() => {
      check("Next goes straight to the sheet, at its own URL", [url(), doc.getElementById("gpaPage").getAttribute("data-view")], ["/gpa/sheet", "sheet"]);
      check("the saved sheet is eight flat semester blocks, gpacalculator.net-style — no grouping above them (Rick, 2026-09-16)",
        [doc.querySelectorAll(".gpa-year").length, Array.from(doc.querySelectorAll(".gpa-year")).slice(0, 3).map(ptitle)],
        [8, ["9 年级 · 上学期", "9 年级 · 下学期", "10 年级 · 上学期"]]);
      check("...72 rows at half a credit, names following the language toggle; Bible and PE non-academic; nothing on the page says 美国",
        [doc.querySelectorAll("tr[data-row]").length, doc.querySelector('tr[data-row] [data-f="w"]').value,
         Array.from(Y1().querySelectorAll('tr[data-row]')).slice(0, 4).map(r => r.querySelector('[data-f="name"]').value),
         Array.from(Y1().querySelectorAll('tr[data-row]')).filter(r => r.querySelector('[data-f="ac"] span:last-child').className === "on").length,
         /美国/.test(doc.getElementById("gpaPage").textContent)],
        [72, "0.5", ["英文文学 9", "英文写作 9", "中文文学 9", "中文写作 9"], 2, false]);
      check("the Chinese column heads name the course kinds in full",
        Array.from(doc.querySelectorAll("#gpaScaleCard th")).map(th => th.textContent), ["等级", "起始分", "普通课", "荣誉课", "双学分课 / 大学先修课"]);
      const g9 = Array.from(Y1().querySelectorAll('tr[data-row]'));
      setVal(g9[0].querySelector('[data-f="grade"]'), "A-"); setVal(g9[0].querySelector('[data-f="lvl"]'), "H");   // 英文文学 9
      setVal(g9[2].querySelector('[data-f="grade"]'), "B+");    // 中文文学 9
      setVal(g9[7].querySelector('[data-f="grade"]'), "A");     // Bible, non-academic
      setVal(g9[8].querySelector('[data-f="grade"]'), "P");     // PE, pass/fail
      check("GPA = Σ(points × credits) ÷ Σ credits over graded academic rows: (3.7+3.3)/2 — Bible (non-academic) earns credit only",
        [doc.getElementById("gpaMain").textContent, doc.querySelector(".gpa-math").textContent], ["3.50", "3.5 绩点 ÷ 1 学分"]);
      check("weighted reads the Honors column for the Honors row: (4.2+3.3)/2", doc.getElementById("gpaWeighted").textContent, "3.75");
      check("no separate academic GPA tile any more", doc.getElementById("gpaAcademic"), null);
      check("the credit total counts the whole sheet (31 credits), with no extra line about ungraded courses",
        [doc.getElementById("gpaCredits").textContent, doc.querySelector(".gpa-sub")], ["31", null]);
      check("the semester head shows its own GPA", doc.querySelector(".gpa-year-gpa").textContent, "GPA 3.50");
      check("the points column shows the level's points, — for non-academic, P, and — for ungraded",
        g9.map(r => r.querySelector(".gpa-c-pts").textContent), ["4.2", "—", "3.3", "—", "—", "—", "—", "—", "P"]);
      check("the sheet reminds that non-academic courses are left out", /形成性评估/.test(doc.querySelector(".gpa-sheet-note").textContent), true);
      const dual = g9[2].querySelector('[data-f="lvl"]');
      check("levels offered in Chinese, AP last: 普通课 / 荣誉课 / 双学分课 / 大学先修课",
        [Array.from(dual.options).map(o => o.value), Array.from(dual.options).map(o => o.textContent)], [["CP", "H", "DE", "AP"], ["普通课", "荣誉课", "双学分课", "大学先修课"]]);
      setVal(dual, "DE");
      check("Dual Enrollment reads the AP column: B+ → 4.3", g9[2].querySelector(".gpa-c-pts").textContent, "4.3");
      setVal(dual, "CP");
      click(pick('[data-toggle="gradeMode"]'));   // letters -> percent
      const g9p = Array.from(Y1().querySelectorAll('tr[data-row]'));
      check("percent entry swaps the dropdown for a text box and keeps the grades",
        [g9p[0].querySelector('[data-f="grade"]').tagName, g9p[0].querySelector('[data-f="grade"]').value], ["INPUT", "A-"]);
      setVal(g9p[4].querySelector('[data-f="grade"]'), "91");   // 代数 I
      check("a percentage is read against the breakoffs (91 → A- → 3.7): (3.7+3.3+3.7)/3",
        [g9p[4].querySelector(".gpa-c-pts").textContent, doc.getElementById("gpaMain").textContent, g9p[4].querySelector('[data-f="grade"]').placeholder], ["3.7", "3.57", "如 91"]);
      click(pick('[data-toggle="gradeMode"]'));   // -> letters
      check("back under letters, the 91 is kept and shown as its own option",
        Y1().querySelectorAll('tr[data-row]')[4].querySelector('[data-f="grade"]').value, "91");
      check("the planning card is gone (not in gpacalculator.net; Rick, 2026-09-17)", doc.getElementById("gpaPlan"), null);
      setVal(pick("#gpaSchool"), "蜂巢学堂"); setVal(pick("#gpaStudent"), "王小明");
      check("school and student go into the print header and the save, nowhere else",
        [/学校 \/ 机构：蜂巢学堂/.test(doc.querySelector(".gpa-print-head").textContent), /学生：王小明/.test(doc.querySelector(".gpa-print-head").textContent),
         JSON.parse(window.localStorage.getItem("fc-gpa-v1")).school], [true, true, "蜂巢学堂"]);
      check("no 此前成绩 boxes anywhere (removed at Rick's request, 2026-09-17); the cumulative is the sheet alone",
        [doc.querySelectorAll("[data-prior]").length, /此前成绩/.test(doc.getElementById("gpaPage").textContent)], [0, false]);
      click(pick("#gpaScaleCard [data-scale-edit]"));
      const ed = Array.from(doc.querySelectorAll(".modal-overlay")).pop();
      check("the scale editor lists the ten default rows", ed.querySelectorAll("[data-sc]").length, 10);
      setVal(ed.querySelector('[data-sc="1"] [data-sc-f="h"]'), "4.0");
      check("editing the Honors value of A- recalculates the weighted GPA live: (4.0+3.3+3.7)/3",
        doc.getElementById("gpaWeighted").textContent, "3.67");
      click(ed.querySelector("#gpaScaleReset"));
      check("restore defaults puts it back: (4.2+3.3+3.7)/3", doc.getElementById("gpaWeighted").textContent, "3.73");
      click(ed.querySelector(".modal-foot [data-close]"));
      const saved = JSON.parse(window.localStorage.getItem("fc-gpa-v1"));
      check("everything is saved in the browser, under its own key, not the wizard's",
        [saved.periods.length, saved.periods[0].rows[0].grade, saved.periods[0].rows[0].lvl, "cart" in saved], [8, "A-", "H", false]);
      click(pick("#langBtn"));
      check("the page follows the language switch, preset and semester names included",
        [doc.querySelector("#gpaPage h2").firstChild.textContent.trim(), doc.querySelector('tr[data-row] [data-f="name"]').value, ptitle(Y1()), Y1().querySelector("[data-period-grade] option:checked").textContent], ["G.P.A. Calculator", "English Literature 9", "Grade 9 · Fall", "Grade 9"]);
      click(pick("#langBtn"));
      setVal(doc.querySelector('tr[data-row] [data-f="name"]'), "荣誉英语 9");
      click(pick("#langBtn"));
      check("a name the family typed stays as typed in either language", doc.querySelector('tr[data-row] [data-f="name"]').value, "荣誉英语 9");
      click(pick("#langBtn"));
      click(Y1().querySelector('[data-add-row]'));
      check("add course appends a blank row at a semester's half credit (5 periods/week under the other unit)",
        [Y1().querySelectorAll('tr[data-row]').length, Y1().querySelector('tr[data-row]:last-child [data-f="w"]').value], [10, "0.5"]);
      click(Y1().querySelector('tr[data-row]:last-child [data-rm-row]'));
      check("...and × removes it", Y1().querySelectorAll('tr[data-row]').length, 9);
      click(pick("#gpaAddPeriod"));
      const Y5 = () => Array.from(doc.querySelectorAll(".gpa-year")).pop();
      // Every block is a school year + a term from two dropdowns (Rick, 2026-09-17:
      // "增加年级下拉框选择 … 每个学年只有 2 个学期"); there is no "第 5 学期".
      check("Add semester after 12 下 gives a block at 12 上 (the dropdown stops at 12) for the family to adjust, one blank row",
        [doc.querySelectorAll(".gpa-year").length, pyear(Y5()), ptitle(Y5()), Y5().querySelectorAll("tr[data-row]").length,
         Array.from(Y5().querySelectorAll("[data-period-grade] option")).map(o => o.textContent), Array.from(Y5().querySelectorAll("[data-period-term] option")).map(o => o.textContent)],
        [9, "12/s1", "12 年级 · 上学期", 1, ["9 年级", "10 年级", "11 年级", "12 年级"], ["上学期", "下学期"]]);
      setVal(Y5().querySelector("[data-period-grade]"), "10"); setVal(Y5().querySelector("[data-period-term]"), "s2");
      check("changing the year and term in the head renames the block and is saved",
        [ptitle(Y5()), JSON.parse(window.localStorage.getItem("fc-gpa-v1")).periods[8].grade, JSON.parse(window.localStorage.getItem("fc-gpa-v1")).periods[8].term], ["10 年级 · 下学期", 10, "s2"]);
      Y5().querySelector("[data-rm-period]").click();
      // Remove the last preset block (it has names, so the site's own confirm asks) and add again: the pattern continues.
      Array.from(doc.querySelectorAll(".gpa-year")).pop().querySelector("[data-rm-period]").click();
      check("removing a filled semester asks in the site's modal, not the browser's box",
        [doc.querySelectorAll(".gpa-confirm-modal").length, doc.querySelectorAll(".gpa-year").length], [1, 8]);
      click(pick(".gpa-confirm-modal [data-confirm-ok]"));
      click(pick("#gpaAddPeriod"));
      check("Add semester continues the pattern: after 12 上 comes 12 下", [pyear(Y5()), ptitle(Y5())], ["12/s2", "12 年级 · 下学期"]);
      click(pick('[data-toggle="unit"]'));
      check("the column head is a switch: flipped to 课时/周, a semester's 0.5 credit reads as 5 periods a week, the GPA does not move",
        [doc.querySelector(".gpa-table th.gpa-col-cr .gpa-switch").getAttribute("aria-checked"), doc.querySelector(".gpa-table th.gpa-col-cr .lab.on").textContent, Y1().querySelector('tr[data-row] [data-f="w"]').value, doc.getElementById("gpaMain").textContent], ["true", "课时/周", "5", "3.57"]);
      check("under 课时/周 there is no total tile — weekly periods summed over eight semesters (\"每周总课时 285\") is not a figure anyone uses (Rick, 2026-09-17); the semester head keeps its weekly load",
        [doc.getElementById("gpaCredits"), doc.querySelector(".gpa-year-meta").textContent.indexOf("课时/周") !== -1], [null, true]);
      click(pick('[data-toggle="unit"]'));
      check("...and back: 5 periods/week → 0.5 credit, and the 总学分 tile returns", [Y1().querySelector('tr[data-row] [data-f="w"]').value, doc.getElementById("gpaCredits").textContent], ["0.5", "27.5"]);   // 31 − the removed 12 下 (4) + the added blank row (0.5)
      check("no settings left in the sidebar scale card", doc.querySelectorAll("#gpaScaleCard [data-toggle]").length, 0);
      check("the credit ⇄ periods rule sits under the table it explains, not in the sidebar (Rick, 2026-09-17)",
        [/5 节.*0\.5 学分.*4 节 = 0\.4/.test(doc.querySelector(".gpa-main .gpa-unit-note").textContent),
         doc.querySelectorAll(".gpa-side .gpa-unit-note").length,
         doc.querySelector(".gpa-main > .gpa-unit-note").nextElementSibling.id, doc.querySelector(".gpa-main > .gpa-unit-note").previousElementSibling.className], [true, 0, "gpaAddPeriod", "gpa-year"]);
      // The course field's suggestions: the page's own list of Airtable subjects.
      const nameIn = doc.querySelector('tr[data-row] [data-f="name"]');
      nameIn.dispatchEvent(new window.FocusEvent("focusin", { bubbles: true }));   // field holds a course name; the full list still shows
      check("focus shows the whole subject list whatever the field already says", doc.querySelectorAll(".gpa-suggest [data-suggest]").length > 0, true);
      setVal(nameIn, "");
      const sug = () => Array.from(doc.querySelectorAll(".gpa-suggest [data-suggest]")).map(b => b.textContent);
      check("focusing a course field opens the site's own suggestion list of Airtable subjects (no <datalist>)",
        [doc.querySelectorAll(".gpa-suggest").length, sug().some(v => v.indexOf("数学") === 0), sug().some(v => /Algebra|English 9|荣誉课程/.test(v)), doc.querySelectorAll("datalist").length],
        [1, true, false, 0]);
      check("the list is drawn inside the course cell and opens downwards when there is room below it (it is no longer clipped by the card — Rick, 2026-09-17)",
        [doc.querySelector(".gpa-suggest").parentNode.className, doc.querySelector(".gpa-suggest").classList.contains("up")], ["gpa-c-name", false]);
      setVal(nameIn, "数");
      check("typing filters it, and the list shows the page language only", sug(), ["数学"]);
      doc.querySelector(".gpa-suggest [data-suggest]").dispatchEvent(new window.MouseEvent("mousedown", { bubbles: true }));
      check("picking fills the field, saves both names, and closes the list",
        [nameIn.value, JSON.parse(window.localStorage.getItem("fc-gpa-v1")).periods[0].rows[0].name, doc.querySelectorAll(".gpa-suggest").length], ["数学", { en: "Math", zh: "数学" }, 0]);
      click(pick("#langBtn"));
      check("...so a picked subject follows the language toggle", doc.querySelector('tr[data-row] [data-f="name"]').value, "Math");
      click(pick("#langBtn"));
      // Back walks the tabs: sheet -> scale. Nothing between them can touch
      // the sheet (Rick, 2026-09-17: "数据也会变成空白 … 严重bug").
      window.history.back();
    });
    await after(() => {
      check("browser Back from the sheet returns to the scale — step 1 is reachable again, and the sheet is untouched",
        [url(), doc.getElementById("gpaPage").getAttribute("data-view"), JSON.parse(window.localStorage.getItem("fc-gpa-v1")).periods.length], ["/gpa/scale", "scale", 8]);
      check("the title carries the scope tag 仅供高中课程", doc.querySelector("#gpaPage h2 .gpa-scope").textContent, "仅供高中课程");
      nav("/gpa/start");
    });
    await after(() => {
      check("an old link to the retired middle step (/gpa/start) opens the sheet, address rewritten", [url(), doc.getElementById("gpaPage").getAttribute("data-view")], ["/gpa/sheet", "sheet"]);
      window.history.back();
    });
    await after(() => {
      click(pick('[data-gpa-tab="sheet"]'));
    });
    await after(() => {
      check("the tab bar jumps straight to the sheet", [url(), doc.querySelectorAll("tr[data-row]").length], ["/gpa/sheet", 64]);   // 72 − the removed Grade 12 Spring (9) + the re-added block (1)
      nav("/pedagogy");
    });
    await after(() => {
      check("leaving /gpa brings the wizard and its stepper back",
        [!!doc.getElementById("pedGrid"), doc.getElementById("stepper").hidden, !!doc.getElementById("gpaPage")], [true, false, false]);
      check("the wizard's own storage was not touched", "cart" in JSON.parse(window.localStorage.getItem("fc-wizard-v1")), true);
      nav("/gpa");
    });
    await after(() => {
      check("the menu link (a bare /gpa) always opens step 1, even with a saved sheet, and is rewritten in place",
        [doc.getElementById("gpaPage").getAttribute("data-view"), url()], ["scale", "/gpa/scale"]);
      click(pick('[data-gpa-tab="sheet"]'));
    });
    await after(() => {
      check("...and the saved sheet is one tab click away", [doc.getElementById("gpaPage").getAttribute("data-view"), doc.querySelectorAll("tr[data-row]").length], ["sheet", 64]);
      window.history.replaceState(null, "", "/gpa");   // same address as the menu link
      const ev = new window.MouseEvent("click", { bubbles: true, cancelable: true });
      pick('a.menu-item[href="/gpa"]').dispatchEvent(ev);
      check("clicking the menu link is a route, not a page load (default prevented), and while already at its address it still opens step 1",
        [ev.defaultPrevented, doc.getElementById("gpaPage").getAttribute("data-view"), url()], [true, "scale", "/gpa/scale"]);

      // ---- a fresh tool instance over a legacy save -------------------------
      // The version before semesters saved whole-year blocks ("G9", no term).
      // Rick's browser kept those, and the preset then stacked eight semesters
      // under them: "G9, G10, G11, G12; G9 上学期, G9 下学期…" (2026-09-17).
      const legacy = {
        unit: "credits", gradeMode: "letter",
        periods: [
          { id: "y9",  grade: 9,  term: null, name: "", rows: [{ id: "a", name: "English 9", w: "1.0", grade: "",  lvl: "CP", ac: true }] },
          { id: "y10", grade: 10, term: null, name: "", rows: [{ id: "b", name: "English 10", w: "1.0", grade: "A", lvl: "CP", ac: true }] },
          { id: "y11", grade: 11, term: null, name: "", rows: [{ id: "c", name: "English 11", w: "1.0", grade: "",  lvl: "CP", ac: true }] },
        ],
      };
      window.localStorage.setItem("fc-gpa-v1", JSON.stringify(legacy));
      const box = doc.createElement("div"); doc.body.appendChild(box);
      const tool = window.createGpaTool({
        t: () => window.I18N.zh, esc: (s) => String(s), pickLang: (en, zh) => zh || en,
        openModal: (html, cls) => { const ov = doc.createElement("div"); ov.className = "modal " + (cls || ""); ov.innerHTML = html; doc.body.appendChild(ov); return ov; },
        closeModal: (ov) => ov.remove(), go: () => {}, subjects: () => [],
      });
      tool.render(box, "sheet");
      check("loading a legacy save drops ungraded whole-year blocks and keeps the graded one",
        [box.querySelectorAll(".gpa-year").length, ptitle(box.querySelector(".gpa-year")), box.querySelector(".gpa-year-gpa").textContent], [1, "10 年级 · 上学期", "GPA 4.00"]);
      // 清空 (which asks) leaves one empty 9 年级 · 上学期 on the sheet, as a first
      // open does — there is no template and no middle step to fall back to.
      click(box.querySelector("#gpaClear"));
      click(doc.querySelector(".gpa-confirm-modal [data-confirm-ok]"));
      let saved2 = JSON.parse(window.localStorage.getItem("fc-gpa-v1"));
      check("清空 leaves one empty 9 年级 · 上学期 with five rows and stays on the sheet",
        [box.querySelectorAll(".gpa-year").length, ptitle(box.querySelector(".gpa-year")), box.querySelectorAll("tr[data-row]").length, saved2.periods.length, saved2.periods[0].grade, saved2.periods[0].term], [1, "9 年级 · 上学期", 5, 1, 9, "s1"]);
      // Old saves named their blocks 第 N 学期 (seq) or freely; they map onto years.
      window.localStorage.setItem("fc-gpa-v1", JSON.stringify({ periods: [
        { id: "a", grade: null, term: null, seq: 1, name: "", rows: [] }, { id: "b", grade: null, term: null, seq: 2, name: "", rows: [] },
        { id: "c", grade: null, term: null, seq: 3, name: "", rows: [] }, { id: "d", grade: null, term: null, seq: null, name: "2027 秋", rows: [] }] }));
      const box3 = doc.createElement("div"); doc.body.appendChild(box3);
      window.createGpaTool({ t: () => window.I18N.zh, esc: (s) => String(s), pickLang: (en, zh) => zh || en, openModal: () => doc.createElement("div"), closeModal: () => {}, go: () => {}, subjects: () => [] }).render(box3, "sheet");
      check("a save with 第 1–3 学期 and a named block loads as 9 上, 9 下, 10 上, 10 下",
        Array.from(box3.querySelectorAll(".gpa-year")).map(ptitle), ["9 年级 · 上学期", "9 年级 · 下学期", "10 年级 · 上学期", "10 年级 · 下学期"]);
      box3.remove();

      // ---- first open, nothing saved: the sheet makes its own first semester --
      window.localStorage.removeItem("fc-gpa-v1");
      const box2 = doc.createElement("div"); doc.body.appendChild(box2);
      const tool2 = window.createGpaTool({ t: () => window.I18N.zh, esc: (s) => String(s), pickLang: (en, zh) => zh || en, openModal: () => doc.createElement("div"), closeModal: () => {}, go: () => {}, subjects: () => [] });
      tool2.render(box2, "sheet");
      const saved3 = JSON.parse(window.localStorage.getItem("fc-gpa-v1"));
      check("a first open of the sheet is 9 年级 · 上学期 with five blank rows at 0.5 credit, 普通课 — as gpacalculator.net and calculator.net open with one semester — saved at once",
        [box2.querySelectorAll(".gpa-year").length, ptitle(box2.querySelector(".gpa-year")), box2.querySelectorAll("tr[data-row]").length, box2.querySelector('tr[data-row] [data-f="w"]').value, box2.querySelector('tr[data-row] [data-f="lvl"]').value, saved3.periods.length],
        [1, "9 年级 · 上学期", 5, "0.5", "CP", 1]);
      // A browser may restore old control state into the regenerated dropdowns
      // on reload; pageshow pushes the saved state back (Rick, 2026-09-17: five
      // blank rows all read 荣誉课).
      box2.querySelector('tr[data-row] [data-f="lvl"]').value = "H";
      window.dispatchEvent(new window.Event("pageshow"));
      check("a control the browser restored to another value is re-asserted from the saved state on pageshow (普通课 again)",
        [box2.querySelector('tr[data-row] [data-f="lvl"]').value, JSON.parse(window.localStorage.getItem("fc-gpa-v1")).periods[0].rows[0].lvl], ["CP", "CP"]);
      check("both disclaimers are gone — sheet and print (Rick, 2026-09-17)", /不构成正式成绩单/.test(box2.textContent) || /仅供家庭规划参考/.test(box2.textContent), false);
      check("no start cards, no template, no 选择起点 anywhere on the page", [box2.querySelectorAll("[data-gpa-start]").length, /选择起点/.test(box2.textContent), typeof window.GPA_PRESET], [0, false, "undefined"]);
      box.remove(); box2.remove();
      console.log(failures ? `\n${failures} FAILED` : "\nall assertions passed");
      process.exit(failures ? 1 : 0);
    });
  })();
}, 300);
