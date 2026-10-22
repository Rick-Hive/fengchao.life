// The website's 我要教课 page (/teach, Rick 2026-10-22), driven in jsdom: the menu links it, the page asks for what it
// needs before sending, sends the form (no account taken from it), and shows the application number. The order page
// tells the family to use their real name (the provider opens the class account from it).
//
// Run with:  npm i jsdom && node test/site-teach.test.js
const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");
const ROOT = path.join(__dirname, "..", "assets") + path.sep;
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8").replace(/<script[^>]*><\/script>/g, "");
const snapshot = { generatedAt: "2026-10-22T00:00:00Z", tracks: [], subjects: [], curriculumMap: {}, teacherProfiles: [], courses: [{ id: "c1", code: "MTH-EL-101", nameEn: "Math G1", nameZh: "数学一年级", grades: ["G1"], trackIds: [1, 2, 3, 4, 5, 6, 7], price: 100, subjects: [], teachers: [], school: { name: "KXC", abbr: "KXC" } }] };
let failures = 0;
const check = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) failures++; console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function page(url, wizard, store) {
  const vc = new VirtualConsole(); vc.on("jsdomError", (e) => console.log("   [page error]", e.message.split("\n")[0]));
  const dom = new JSDOM(html, { runScripts: "outside-only", url, virtualConsole: vc });
  const w = dom.window, posts = [];
  if (wizard) w.localStorage.setItem("fc-wizard-v1", JSON.stringify(wizard));
  if (store) for (const k of Object.keys(store)) w.localStorage.setItem(k, store[k]);
  w.fetch = (u, opts) => {
    const url = String(u), body = opts && opts.body ? JSON.parse(opts.body) : null;
    if (body) posts.push({ url, body });
    const json = (status, j) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(j) });
    if (/\/api\/teach$/.test(url)) return json(200, { ok: true, id: "REL-000061", again: false, token: "K3Y", notified: true });
    if (/\/api\/teach\/lists$/.test(url)) return json(200, { subjects: [{ id: "recS1", nameZh: "中文", nameEn: "Chinese" }], grades: [{ id: "recG1", name: "G1" }, { id: "recG2", name: "G2" }], classTypes: [{ en: "Live Course", zh: "直播课" }], languages: [{ en: "Chinese", zh: "中文" }, { en: "English", zh: "英语" }] });
    if (/\/api\/teach\/course$/.test(url)) return json(200, { ok: true, course: { id: "newABCDEFGHIJKLM", nameZh: body.course.nameZh, nameEn: "" }, count: 1 });
    if (/\/api\/teach\/resend$/.test(url)) return json(200, { ok: true });
    if (/\/api\/teach\/app\?/.test(url)) return /key=K3Y/.test(url) ? json(200, { id: "REL-000061", kind: "solo", name: "周老师", email: "eve@example.org", courses: [{ id: "newA", nameZh: "已存的课" }] }) : json(404, { error: "not_found" });
    if (/\/api\/seats/.test(url)) return json(200, { seats: {} });
    if (/\/api\/order\/status$/.test(url)) return json(200, { fee: null });
    if (/\/api\/data/.test(url)) return json(200, snapshot);
    return json(401, {});
  };
  w.scrollTo = () => {}; w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  w.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
  w.eval(fs.readFileSync(ROOT + "i18n.js", "utf8"));
  w.eval(fs.readFileSync(ROOT + "app.js", "utf8"));
  return { w, doc: w.document, posts };
}

(async () => {
  let P = page("https://www.fengchao.life/");
  await wait(50);
  const link = [...P.doc.querySelectorAll("#siteNav a.menu-item")].find((a) => a.textContent === "我要教课");
  check("the menu links 我要教课 to /teach", link && link.getAttribute("href"), "/teach");
  link.click(); await wait(30);
  check("clicking it opens the page in place", [P.w.location.pathname, P.doc.querySelector(".teach-page h2").textContent], ["/teach", "我要教课"]);

  P = page("https://www.fengchao.life/teach");
  await wait(50);
  let doc = P.doc, w = P.w;
  const click = (sel) => doc.querySelector(sel).click();
  const set = (id, v) => { const el = doc.getElementById(id); el.value = v; el.dispatchEvent(new w.Event("input", { bubbles: true })); };
  const pick = (v) => { const r = doc.querySelector('input[name="te_kind"][value="' + v + '"]'); r.checked = true; r.dispatchEvent(new w.Event("change", { bubbles: true })); };
  check("the five phases in view, the first current", [doc.querySelectorAll(".tphases li").length, doc.querySelector(".tphases li.now .tt b").textContent], [5, "提交申请"]);
  check("step 1 of 3: how will you teach, three choices with a plain dot", [doc.querySelector(".tbar .tstep").textContent, doc.querySelectorAll(".tchoice .dot").length], ["提交申请 · 第 1 步，共 3 步", 3]);
  click("#teachNext"); await wait(10);
  check("nothing chosen: asked to choose", doc.getElementById("teachErr").textContent, "请选择开课方式。");
  pick("solo"); await wait(10); click("#teachNext"); await wait(10);
  check("one-person team: 姓 and 名 apart, no short name or domain, no phone", [!!doc.getElementById("te_familyName"), !!doc.getElementById("te_givenName"), !!doc.getElementById("te_abbr"), !!doc.getElementById("te_domain"), !!doc.getElementById("te_phone"), /Teams 账号/.test(doc.querySelector(".tnote-tight").textContent)], [true, true, false, false, false, true]);
  click("#teachBack"); await wait(10); pick("team"); await wait(10); click("#teachNext"); await wait(10);
  check("a team: its name, short name and own domain", [!!doc.getElementById("te_org"), !!doc.getElementById("te_abbr"), !!doc.getElementById("te_domain")], [true, true, true]);
  const dot = (name, v) => { const r = doc.querySelector('input[name="' + name + '"][value="' + v + '"]'); r.checked = true; r.dispatchEvent(new w.Event("change", { bubbles: true })); };
  click("#teachNext"); await wait(10);
  check("asked first whether a Christian", doc.getElementById("teachErr").textContent, "请回答这个问题。");
  dot("te_christian", "yes"); await wait(10);
  set("te_familyName", "周"); set("te_givenName", "老师"); set("te_email", "eve@example.org"); set("te_org", "心桥中文"); set("te_abbr", "XQC");
  click("#teachNext"); await wait(10);
  check("names in pinyin or English", doc.getElementById("teachErr").textContent, "姓请用拼音或英文字母填写。");
  set("te_familyName", "Zhou"); set("te_givenName", "Eve"); set("te_email", "eve@qq.com"); click("#teachNext"); await wait(10);
  check("an international email, as on the order page", doc.getElementById("teachErr").textContent, "请换用 Gmail、Outlook 等国际邮箱。");
  set("te_email", "eve@example.org");
  click("#teachNext"); await wait(10);
  check("a team without a domain: asked for one", doc.getElementById("teachErr").textContent.slice(0, 9), "请填写您自己的域名");
  const nd = doc.getElementById("te_needDomain"); nd.checked = true; nd.dispatchEvent(new w.Event("change", { bubbles: true })); await wait(10);
  check("no domain yet: Hive creates one — the field gives way to a note", [!!doc.getElementById("te_domain"), /无需现在准备/.test(doc.querySelector(".tdomain-help").textContent)], [false, true]);
  const nd2 = doc.getElementById("te_needDomain"); nd2.checked = false; nd2.dispatchEvent(new w.Event("change", { bubbles: true })); await wait(10);
  set("te_domain", "xq-chinese.org"); click("#teachNext"); await wait(10);
  check("step 3: qualifications and the introduction", [doc.querySelector(".tbar .tstep").textContent, !!doc.getElementById("te_education"), !!doc.getElementById("te_years"), !!doc.getElementById("te_resume")], ["提交申请 · 第 3 步，共 3 步", true, true, true]);
  // the form is kept in this browser: a new page in the same browser resumes here
  const kept = P.w.localStorage.getItem("fc-teach-v2");
  P = page("https://www.fengchao.life/teach", null, { "fc-teach-v2": kept }); await wait(50); doc = P.doc; w = P.w;
  check("kept in this browser: the same step, the values", [doc.querySelector(".tbar .tstep").textContent, JSON.parse(kept).f.domain], ["提交申请 · 第 3 步，共 3 步", "xq-chinese.org"]);
  set("te_intro", "我们是一个教中文阅读的老师团队。");
  click("#teachNext"); await wait(10);
  check("the agreement is required", doc.getElementById("teachErr").textContent, "请勾选同意。");
  const ag = doc.getElementById("te_agree"); ag.checked = true; ag.dispatchEvent(new w.Event("change", { bubbles: true }));
  click("#teachNext"); await wait(60);
  const sent = P.posts.filter((p) => /\/api\/teach$/.test(p.url)).map((p) => p.body)[0] || {};
  check("the application is sent", [sent.kind, sent.christian, sent.familyName, sent.givenName, sent.org, sent.abbr, sent.domain, sent.agree, "phone" in sent, "account" in sent], ["team", true, "Zhou", "Eve", "心桥中文", "XQC", "xq-chinese.org", true, false, false]);
  check("then phase 2, the courses, with the application number", [doc.querySelector(".tphases li.now .tt b").textContent, doc.querySelector(".tbar .tid").textContent], ["填写课程", "REL-000061"]);
  await wait(30);
  set("tc_nameZh", "中文阅读一"); const sub = doc.getElementById("tc_subject"); sub.value = "recS1"; sub.dispatchEvent(new w.Event("change", { bubbles: true }));
  set("tc_description", "每周一次，读绘本、讲故事、学写字。");
  click("#teachSaveCourse"); await wait(10);
  check("no grade: asked for one", doc.querySelector("#teachCourse .form-err").textContent, "请至少选择一个年级。");
  click('.tg[data-grade="recG2"]'); await wait(5); click("#teachSaveCourse"); await wait(60);
  const cs = P.posts.filter((p) => /\/api\/teach\/course$/.test(p.url)).map((p) => p.body)[0] || {};
  check("the course goes up with the key", [cs.id, cs.key, cs.course && cs.course.subjects, cs.course && cs.course.grades, cs.course && cs.course.nameZh], ["REL-000061", "K3Y", ["recS1"], ["recG2"], "中文阅读一"]);
  check("the syllabus template offered with the course", (doc.querySelector('a[href="/assets/templates/syllabus-template.docx"]') || {}).textContent, "下载模板（Word）");
  check("saved, listed, the form empty again", [doc.querySelectorAll(".tsaved li").length, doc.getElementById("tc_nameZh").value, /已保存《中文阅读一》/.test(doc.querySelector(".tmsg").textContent)], [1, "", true]);
  click("#teachFinish"); await wait(10);
  check("finished: the number, phase 3 next", [doc.querySelector(".tdone .order-id").textContent, doc.querySelector(".tphases li.now .tt b").textContent], ["REL-000061", "交流与审核"]);
  // coming back in this browser: the application, and more courses on offer
  const keptDone = P.w.localStorage.getItem("fc-teach-v2");
  P = page("https://www.fengchao.life/teach", null, { "fc-teach-v2": keptDone }); await wait(50); doc = P.doc;
  check("back later in this browser: the application is there", [doc.querySelector(".tdone .order-id") && doc.querySelector(".tdone .order-id").textContent, !!doc.getElementById("teachMore")], ["REL-000061", true]);
  doc.getElementById("teachMore").click(); await wait(30);
  check("…and more courses can be added", doc.querySelector(".tphases li.now .tt b").textContent, "填写课程");
  // not a Christian: thanked, nothing sent
  P = page("https://www.fengchao.life/teach"); await wait(50); doc = P.doc; w = P.w;
  pick("solo"); await wait(10); doc.getElementById("teachNext").click(); await wait(10);
  { const r = doc.querySelector('input[name="te_christian"][value="no"]'); r.checked = true; r.dispatchEvent(new w.Event("change", { bubbles: true })); } await wait(10);
  check("not a Christian: a polite thank-you, nothing sent or kept", [doc.querySelector(".tdone h3").textContent, P.posts.filter((p) => /\/api\/teach/.test(p.url)).length, P.w.localStorage.getItem("fc-teach-v2")], ["感谢您的关注", 0, null]);
  // 找回申请
  P = page("https://www.fengchao.life/teach"); await wait(50); doc = P.doc; w = P.w;
  doc.getElementById("teachFind").click(); await wait(10);
  set("te_findEmail", "eve@example.org"); doc.getElementById("teachFindSend").click(); await wait(40);
  check("find it by email: the link is sent", [P.posts.filter((p) => /\/api\/teach\/resend$/.test(p.url)).map((p) => p.body.email)[0], /链接已发出/.test(doc.querySelector(".tfind").textContent)], ["eve@example.org", true]);
  // the continue link from the email
  P = page("https://www.fengchao.life/teach?app=REL-000061&key=K3Y"); await wait(80);
  check("the email's link: back to the courses, from any device", [P.doc.querySelector(".tphases li.now .tt b").textContent, P.doc.querySelectorAll(".tsaved li").length, P.w.location.search], ["填写课程", 1, ""]);
  P = page("https://www.fengchao.life/teach?app=REL-000061&key=bad"); await wait(80);
  check("a bad link: said so", /已过期或无效/.test(P.doc.getElementById("teachErr").textContent), true);

  // 在网站上查看: /courses?course=<id or code> opens the course's card; an unknown one says it is not listed yet
  P = page("https://www.fengchao.life/courses?course=c1");
  await wait(80);
  check("a deep link opens the course card", [!!P.doc.querySelector(".modal.course-modal"), P.w.location.search], [true, ""]);
  P = page("https://www.fengchao.life/courses?course=newABCDEFGHIJKLMN");
  await wait(80);
  check("a course not on the website yet: said so", /还没有在网站上架/.test((P.doc.querySelector(".modal") || {}).textContent || ""), true);

  // the order page: a real name, because the provider opens the class account from it
  P = page("https://www.fengchao.life/order", { stage: "grammar", mode: null, pedagogy: "classical", cart: { c1: true }, cartAt: Date.now(), filters: {} });
  await wait(80);
  check("order page: the real-name note under the name fields", (P.doc.querySelector(".name-note") || {}).textContent, "请填写真实姓名：付款后课程提供方会据此为您开设上课账号。");
  check("order page: the English name no longer promises a Hive account", P.doc.querySelector('label[for="englishName"]').textContent, "英文名（选填）");

  console.log(failures ? `\n${failures} check(s) failed` : "\nsite-teach: all checks passed");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
