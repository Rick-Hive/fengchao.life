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

function page(url, wizard) {
  const vc = new VirtualConsole(); vc.on("jsdomError", (e) => console.log("   [page error]", e.message.split("\n")[0]));
  const dom = new JSDOM(html, { runScripts: "outside-only", url, virtualConsole: vc });
  const w = dom.window, posts = [];
  if (wizard) w.localStorage.setItem("fc-wizard-v1", JSON.stringify(wizard));
  w.fetch = (u, opts) => {
    const url = String(u), body = opts && opts.body ? JSON.parse(opts.body) : null;
    if (body) posts.push({ url, body });
    const json = (status, j) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(j) });
    if (/\/api\/teach$/.test(url)) return json(200, { ok: true, id: "REL-000061", again: false, notified: true });
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
  const doc = P.doc, w = P.w;
  check("five steps and the form", [doc.querySelectorAll(".teach-steps li").length, !!doc.getElementById("teachForm")], [5, true]);
  doc.getElementById("teachSubmit").click(); await wait(20);
  check("nothing chosen: asks for the kind first, sends nothing", [doc.getElementById("teachErr").textContent, P.posts.filter((p) => /teach/.test(p.url)).length], ["请选择申请身份。", 0]);
  const kind = doc.querySelector('input[name="te_kind"][value="team"]'); kind.checked = true; kind.dispatchEvent(new w.Event("change", { bubbles: true })); await wait(10);
  const set = (k, v) => { const el = doc.getElementById("te_" + k); el.value = v; el.dispatchEvent(new w.Event("input", { bubbles: true })); };
  set("name", "周老师"); set("email", "eve@example.org"); set("org", "心桥中文"); set("subjects", "中文阅读");
  set("intro", "短");
  doc.getElementById("teachSubmit").click(); await wait(20);
  check("a too-short introduction is caught on the page", doc.getElementById("teachErr").textContent, "请用几句话介绍您和您的教学（至少 20 字）。");
  set("intro", "我们是一个教中文阅读的老师团队，已有五年的教学经验。");
  check("typed values survive a re-render", doc.getElementById("te_org").value, "心桥中文");
  doc.getElementById("teachSubmit").click(); await wait(20);
  check("the agreement is required", doc.getElementById("teachErr").textContent, "请勾选同意。");
  const ag = doc.getElementById("te_agree"); ag.checked = true; ag.dispatchEvent(new w.Event("change", { bubbles: true }));
  doc.getElementById("teachSubmit").click(); await wait(50);
  const sent = P.posts.filter((p) => /\/api\/teach$/.test(p.url)).map((p) => p.body)[0] || {};
  check("the form is sent", [sent.kind, sent.name, sent.email, sent.org, sent.subjects, sent.language, sent.agree, sent.lang, "account" in sent], ["team", "周老师", "eve@example.org", "心桥中文", "中文阅读", "zh", true, "zh", false]);
  check("the application number", doc.querySelector(".teach-done .order-id").textContent, "REL-000061");

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
