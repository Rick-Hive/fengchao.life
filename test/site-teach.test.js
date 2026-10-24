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
    if (/\/api\/teach\/lists$/.test(url)) return json(200, { subjects: [{ id: "recS1", nameZh: "中文", nameEn: "Chinese" }], grades: [{ id: "recG1", name: "G1" }, { id: "recG2", name: "G2" }], classTypes: [{ en: "Live Course", zh: "直播课" }], languages: [{ en: "Chinese", zh: "中文" }, { en: "English", zh: "英语" }], days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] });
    if (/\/api\/teach\/course$/.test(url)) return json(200, { ok: true, course: { id: "newABCDEFGHIJKLM", nameZh: body.course.nameZh, nameEn: "" }, count: 1 });
    if (/\/api\/teach\/resend$/.test(url)) return json(200, { ok: true });
    if (/\/api\/teach\/file$/.test(url)) return json(200, { ok: true, done: true, file: { name: body.name, size: body.size, type: "application/pdf" } });
    if (/\/api\/teach\/app$/.test(url)) return body && body.key === "K3Y" ? json(200, { id: "REL-000061", kind: "solo", name: "周老师", email: "eve@example.org", stage: "apply", courses: [{ id: "newA", nameZh: "已存的课" }], resume: { name: "Eve CV.pdf", size: 3000 }, form: { kind: "solo", familyName: "Zhou", givenName: "Eve", sample: "https://x.org" } }) : json(404, { error: "not_found" });
    if (/\/api\/teach\/update$/.test(url)) return json(200, { ok: true, id: "REL-000061" });
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
  const dot = (name, v) => { const r = doc.querySelector('input[name="' + name + '"][value="' + v + '"]'); r.checked = true; r.dispatchEvent(new w.Event("change", { bubbles: true })); };
  check("the five phases in view, the first current", [doc.querySelectorAll(".tphases li").length, doc.querySelector(".tphases li.now .tt b").textContent], [5, "提交申请"]);
  check("the three steps of ① in the bar, the first current; three choices with a plain dot", [[...doc.querySelectorAll(".tsteps .tstep")].map((e) => e.textContent), doc.querySelector(".tsteps .tstep.now").textContent, doc.querySelectorAll(".tchoice .dot").length], [["1教学团队", "2基本信息", "3教学资质"], "1教学团队", 3]);
  click("#teachNext"); await wait(10);
  check("nothing chosen: asked to choose", doc.getElementById("teachErr").textContent, "请选择开课方式。");
  pick("solo"); await wait(10); click("#teachNext"); await wait(10);
  check("one-person team: 姓 (pinyin) and 名 apart, no short name or domain, no phone, no banner line for the sign-in", [!!doc.getElementById("te_familyName"), !!doc.getElementById("te_givenName"), !!doc.getElementById("te_abbr"), !!doc.getElementById("te_domain"), !!doc.getElementById("te_phone"), !!doc.querySelector(".signed-in"), doc.querySelector('label[for="te_familyName"]').textContent.trim()], [true, true, false, false, false, false, "姓（拼音） *"]);
  click("#teachBack"); await wait(10); pick("team"); await wait(10); click("#teachNext"); await wait(10);
  check("a team: its name, short name and own domain; the website field reads 个人主页或机构网站", [!!doc.getElementById("te_org"), !!doc.getElementById("te_abbr"), !!doc.getElementById("te_domain"), doc.querySelector('label[for="te_website"]').textContent.trim()], [true, true, true, "个人主页或机构网站（选填）"]);
  set("te_familyName", "周"); set("te_givenName", "老师"); set("te_email", "eve@example.org"); set("te_org", "心桥中文"); set("te_abbr", "XQC");
  click("#teachNext"); await wait(10);
  check("names in pinyin or English", doc.getElementById("teachErr").textContent, "姓请用拼音填写。");
  set("te_familyName", "Zhou"); set("te_givenName", "Eve"); set("te_email", "eve@qq.com"); click("#teachNext"); await wait(10);
  check("an international email, as on the order page", doc.getElementById("teachErr").textContent, "请换用 Gmail、Outlook 等国际邮箱。");
  set("te_email", "eve@example.org");
  const nd = doc.getElementById("te_needDomain"); nd.checked = true; nd.dispatchEvent(new w.Event("change", { bubbles: true })); await wait(10);
  check("no domain yet: Hive creates one — the field gives way to a note", [!!doc.getElementById("te_domain"), /选定并设置域名/.test(doc.querySelector(".tdomain-help").textContent)], [false, true]);
  const nd2 = doc.getElementById("te_needDomain"); nd2.checked = false; nd2.dispatchEvent(new w.Event("change", { bubbles: true })); await wait(10);
  click("#teachNext"); await wait(10);
  check("a team without a domain: asked for one", doc.getElementById("teachErr").textContent.slice(0, 9), "请填写您自己的域名");
  set("te_domain", "xq-chinese.org"); click("#teachNext"); await wait(10);
  check("step 3 教学资质: résumé, sample link, the first faith question; no degree / years / intro fields", [doc.querySelector(".tsteps .tstep.now").textContent, !!doc.getElementById("te_resume"), !!doc.getElementById("te_sample"), !!doc.querySelector('input[name="te_worldview"]'), !!doc.getElementById("te_education"), !!doc.getElementById("te_intro"), !!doc.querySelector('input[name="te_frequency"]')], ["3教学资质", true, true, true, false, false, false]);
  // the form is kept in this browser: a new page in the same browser resumes here, and the stepper shows where
  const kept = P.w.localStorage.getItem("fc-teach-v3");
  P = page("https://www.fengchao.life/teach", null, { "fc-teach-v3": kept }); await wait(50); doc = P.doc; w = P.w;
  check("kept in this browser: the same step, shown in the stepper, the values", [doc.querySelector(".tsteps .tstep.now").textContent, JSON.parse(kept).f.domain, doc.querySelectorAll(".tsteps button.done").length], ["3教学资质", "xq-chinese.org", 2]);
  doc.querySelector('.tsteps button[data-step="1"]').click(); await wait(10);
  check("an earlier step is a click away", [doc.querySelector(".tsteps .tstep.now").textContent, doc.getElementById("te_familyName").value], ["2基本信息", "Zhou"]);
  click("#teachNext"); await wait(10);
  click("#teachNext"); await wait(10);
  check("the résumé is required", doc.getElementById("teachErr").textContent, "请上传个人简历。");
  // a résumé chosen (a File on the input), the sample link
  { const inp = doc.getElementById("te_resume"); Object.defineProperty(inp, "files", { value: [new w.File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 49, 50, 51, 52])], "Eve CV.pdf", { type: "application/pdf" })] }); inp.dispatchEvent(new w.Event("change", { bubbles: true })); } await wait(10);
  check("the résumé's name shows, the button now says 更换", [doc.querySelector(".tfile-name").textContent, doc.querySelector(".tfile-btn").textContent], ["Eve CV.pdf", "更换"]);
  set("te_sample", "https://youtu.be/abc"); click("#teachNext"); await wait(10);
  check("the first faith question must be answered", doc.getElementById("teachErr").textContent, "请回答这个问题。");
  dot("te_worldview", "yes"); await wait(10);
  check("yes → the frequency question appears", [...doc.querySelectorAll('input[name="te_frequency"]')].map((r) => r.value), ["never", "sometimes", "often", "always"]);
  dot("te_frequency", "never"); await wait(10);
  check("never → no church question", !!doc.querySelector('input[name="te_church"]'), false);
  dot("te_frequency", "often"); await wait(10); dot("te_church", "yes"); await wait(10); dot("te_churchKind", "other"); await wait(10);
  check("often → church → other: the chain opens one step at a time, 其它 asks for words", [!!doc.querySelector('input[name="te_church"]'), [...doc.querySelectorAll('input[name="te_churchKind"]')].map((r) => r.value), !!doc.getElementById("te_churchOther")], [true, ["house", "tspm", "online", "other"], true]);
  set("te_churchOther", "改革宗教会");
  click("#teachNext"); await wait(10);
  check("the agreement is required", doc.getElementById("teachErr").textContent, "请勾选同意。");
  const ag = doc.getElementById("te_agree"); ag.checked = true; ag.dispatchEvent(new w.Event("change", { bubbles: true }));
  click("#teachNext"); await wait(60);
  const sent = P.posts.filter((p) => /\/api\/teach$/.test(p.url)).map((p) => p.body)[0] || {};
  check("the application is sent, with the faith answers and no typed qualifications", [sent.kind, sent.familyName, sent.givenName, sent.org, sent.abbr, sent.domain, sent.sample, sent.worldview, sent.frequency, sent.church, sent.churchKind, sent.churchOther, "education" in sent, "intro" in sent, "phone" in sent], ["team", "Zhou", "Eve", "心桥中文", "XQC", "xq-chinese.org", "https://youtu.be/abc", "yes", "often", "yes", "other", "改革宗教会", false, false, false]);
  await wait(60);
  const up = P.posts.filter((p) => /\/api\/teach\/file$/.test(p.url)).map((p) => p.body)[0] || {};
  check("the résumé goes up right after, with the key", [up.kind, up.id, up.key, up.name, typeof up.data], ["resume", "REL-000061", "K3Y", "Eve CV.pdf", "string"]);
  check("then phase 2, the courses, with the application number, the résumé noted and the add button", [doc.querySelector(".tphases li.now .tt b").textContent, /REL-000061/.test(doc.querySelector(".tbar-r").textContent), /简历已上传：Eve CV.pdf/.test(doc.querySelector(".tlead").textContent), !!doc.getElementById("teachAdd"), !!doc.getElementById("teachCourseForm")], ["填写课程", true, true, true, false]);
  doc.getElementById("teachAdd").click(); await wait(40);
  check("＋ 添加课程 opens the form, with the editor's controls: subject chips, grade checkboxes in the site's language, type / language pills, weekday pills", [!!doc.getElementById("teachCourseForm"), !!doc.getElementById("tc_subjectAdd"), [...doc.querySelectorAll('.tchecks[data-ck="grades"] .tck span')].map((e) => e.textContent), doc.querySelectorAll('.tpills[data-pk="classType"] .tpill').length, doc.querySelectorAll('.tpills[data-pk="days"] .tpill').length], [true, true, ["1 年级", "2 年级"], 1, 7]);
  set("tc_nameZh", "中文阅读一"); set("tc_description", "每周一次，读绘本、讲故事、学写字。");
  click("#teachSaveCourse"); await wait(10);
  check("no subject: asked for one", doc.querySelector("#teachCourseForm .form-err").textContent, "请选择学科。");
  const sa = doc.getElementById("tc_subjectAdd"); sa.value = "recS1"; sa.dispatchEvent(new w.Event("change", { bubbles: true })); await wait(10);
  check("a subject chosen becomes a chip", [...doc.querySelectorAll(".tchip")].map((e) => e.textContent.replace("×", "")), ["中文"]);
  click("#teachSaveCourse"); await wait(10);
  check("no grade: asked for one", doc.querySelector("#teachCourseForm .form-err").textContent, "请至少选择一个年级。");
  { const cb = doc.querySelector('.tchecks[data-ck="grades"] input[value="recG2"]'); cb.checked = true; cb.dispatchEvent(new w.Event("change", { bubbles: true })); } await wait(5);
  click('.tpills[data-pk="days"] .tpill[data-v="Tuesday"]'); doc.getElementById("tc_from").value = "19:00"; doc.getElementById("tc_to").value = "20:00"; click("#teachSlotAdd"); await wait(10);
  click('.tpills[data-pk="days"] .tpill[data-v="Thursday"]'); doc.getElementById("tc_from").value = "10:00"; doc.getElementById("tc_to").value = "10:45"; click("#teachSlotAdd"); await wait(10);
  check("time slots, worded as the editor writes them; the day pills clear after each", [[...doc.querySelectorAll(".tslots .tchip")].map((e) => e.textContent.replace("×", "")), doc.querySelectorAll('.tpills[data-pk="days"] .tpill.on').length], [["周二 19:00–20:00", "周四 10:00–10:45"], 0]);
  check("the syllabus template offered with the course, from the api (the uploaded one or the built-in)", (doc.querySelector('a[href="/api/asset?key=templates/syllabus-template.docx"]') || {}).textContent, "下载模板");
  click("#teachSaveCourse"); await wait(60);
  const cs = P.posts.filter((p) => /\/api\/teach\/course$/.test(p.url)).map((p) => p.body)[0] || {};
  check("the course goes up with the key; the weekdays are the union of the slots", [cs.id, cs.key, cs.course && cs.course.subjects, cs.course && cs.course.grades, cs.course && cs.course.nameZh, cs.course && cs.course.classTime, cs.course && cs.course.days], ["REL-000061", "K3Y", ["recS1"], ["recG2"], "中文阅读一", "周二 19:00–20:00; 周四 10:00–10:45", ["Tuesday", "Thursday"]]);
  check("saved, listed, the form closed, the add button back", [doc.querySelectorAll(".tsaved li").length, !!doc.getElementById("teachCourseForm"), !!doc.getElementById("teachAdd"), /已保存《中文阅读一》/.test(doc.querySelector(".tmsg").textContent)], [1, false, true, true]);
  check("no word about course photos", /照片/.test(doc.querySelector("#teachCourse").textContent), false);
  click("#teachFinish"); await wait(10);
  check("finished: the number, phase 3 next", [doc.querySelector(".tdone .order-id").textContent, doc.querySelector(".tphases li.now .tt b").textContent], ["REL-000061", "交流与审核"]);
  // coming back in this browser: the application, and more courses on offer
  const keptDone = P.w.localStorage.getItem("fc-teach-v3");
  P = page("https://www.fengchao.life/teach", null, { "fc-teach-v3": keptDone }); await wait(50); doc = P.doc;
  check("back later in this browser: the application is there", [doc.querySelector(".tdone .order-id") && doc.querySelector(".tdone .order-id").textContent, !!doc.getElementById("teachMore")], ["REL-000061", true]);
  doc.getElementById("teachMore").click(); await wait(30);
  check("…and more courses can be added", doc.querySelector(".tphases li.now .tt b").textContent, "填写课程");
  // 找回申请
  P = page("https://www.fengchao.life/teach"); await wait(50); doc = P.doc; w = P.w;
  doc.getElementById("teachFind").click(); await wait(10);
  set("te_findEmail", "eve@example.org"); doc.getElementById("teachFindSend").click(); await wait(40);
  check("find it by email: the link is sent", [P.posts.filter((p) => /\/api\/teach\/resend$/.test(p.url)).map((p) => p.body.email)[0], /链接已发出/.test(doc.querySelector(".tfind").textContent)], ["eve@example.org", true]);
  // the continue link from the email
  P = page("https://www.fengchao.life/teach#app=REL-000061&key=K3Y"); await wait(80);
  check("the email's link (the key in the fragment, exchanged by POST): back to the courses, from any device, with the status", [P.doc.querySelector(".tphases li.now .tt b").textContent, P.doc.querySelectorAll(".tsaved li").length, P.w.location.hash, /等待蜂巢联系/.test(P.doc.querySelector(".tbar-r").textContent), P.posts.filter((p) => /\/api\/teach\/app$/.test(p.url)).map((p) => p.body)[0]], ["填写课程", 1, "", true, { id: "REL-000061", key: "K3Y" }]);
  // 编辑申请: the steps again with what was typed, saved with the key
  P.doc.getElementById("teachEdit").click(); await wait(20); doc = P.doc; w = P.w;
  check("edit: step 1 with the saved choice", [doc.querySelector(".tsteps .tstep.now").textContent, doc.querySelector('input[name="te_kind"]:checked').value], ["1教学团队", "solo"]);
  click("#teachNext"); await wait(10);
  check("edit: the typed values are back", doc.getElementById("te_familyName").value, "Zhou");
  click("#teachNext"); await wait(10);
  check("edit: step 3 says 保存修改; the résumé on the server counts", [doc.getElementById("teachNext").textContent, doc.querySelector(".tfile-btn").textContent, doc.querySelector(".tfile-name").textContent], ["保存修改", "更换", "Eve CV.pdf"]);
  dot("te_worldview", "no"); click("#teachNext"); await wait(40);
  const upd = P.posts.filter((p) => /\/api\/teach\/update$/.test(p.url)).map((p) => p.body)[0] || {};
  check("edit: saved through /update with the key, back to the courses", [upd.id, upd.key, upd.form && upd.form.familyName, upd.form && upd.form.worldview, doc.querySelector(".tphases li.now .tt b").textContent, /申请已更新/.test(doc.querySelector(".tmsg").textContent)], ["REL-000061", "K3Y", "Zhou", "no", "填写课程", true]);
  P = page("https://www.fengchao.life/teach#app=REL-000061&key=bad"); await wait(80);
  check("a bad link: said so, and the way back offered", [/已过期或无效/.test(P.doc.getElementById("teachErr").textContent), !!P.doc.getElementById("te_findEmail")], [true, true]);

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
