// The site's pages under the production Content-Security-Policy (staticwebapp.config.json, script-src 'self' since
// 2026-10-22): each page loads, its scripts run, and the browser reports no violation.
// Run with: node test/ui/csp.js
const http = require("http"), fs = require("fs"), path = require("path");
const { chromium } = require("playwright");
const ROOT = path.join(__dirname, "..", "..");
const CSP = JSON.parse(fs.readFileSync(path.join(ROOT, "staticwebapp.config.json"), "utf8")).globalHeaders["Content-Security-Policy"];
const mime = { ".html": "text/html", ".css": "text/css", ".js": "application/javascript", ".png": "image/png", ".webp": "image/webp", ".json": "application/json", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p.startsWith("/api/") || p.startsWith("/.auth/")) { res.writeHead(p === "/api/data" ? 200 : 401, { "content-type": "application/json" }); res.end(p === "/api/data" ? JSON.stringify({ courses: [], tracks: [], subjects: [], curriculumMap: {}, teacherProfiles: [] }) : "{}"); return; }
  if (p.endsWith("/")) p += "index.html";
  let f = path.join(ROOT, p);
  if (!path.extname(f)) f = path.join(ROOT, "index.html"); // the SPA's routes (/teach, /gpa …)
  if (fs.existsSync(f) && fs.statSync(f).isFile()) { res.writeHead(200, Object.assign({ "content-type": mime[path.extname(f)] || "application/octet-stream" }, path.extname(f) === ".html" ? { "content-security-policy": CSP } : {})); fs.createReadStream(f).pipe(res); }
  else { res.writeHead(404); res.end(); }
});
(async () => {
  await new Promise((r) => srv.listen(0, r));
  const base = "http://127.0.0.1:" + srv.address().port;
  const browser = await chromium.launch();
  const pages = [["/", () => !!document.querySelector("#siteNav a")], ["/teach", () => !!document.getElementById("teachForm")], ["/gpa", () => !!document.querySelector(".gpa-page, #app *")],
    ["/help/teams-setup.html", () => document.getElementById("langBtn") && document.getElementById("langBtn").textContent.length > 0], ["/help/teams-faq.html", () => document.getElementById("langBtn").textContent === "EN"],
    ["/help/teams-flow.html", () => true], ["/help/teams-cases.html", () => true], ["/help/domain-admin.html", () => true]];
  let fail = 0;
  for (const [url, ran] of pages) {
    const p = await browser.newPage(), errs = [];
    p.on("console", (m) => { if (m.type() === "error" && /Content Security Policy|Refused to/i.test(m.text())) errs.push(m.text()); });
    p.on("pageerror", (e) => errs.push(e.message));
    await p.addInitScript(() => document.addEventListener("securitypolicyviolation", (e) => console.error("Refused to: CSP " + e.violatedDirective + " " + e.blockedURI)));
    await p.goto(base + url); await p.waitForTimeout(500);
    const ok = await p.evaluate(ran).catch(() => false);
    if (errs.length || !ok) { fail++; console.log("FAIL", url, ok ? "" : "(scripts did not run)", errs.slice(0, 3).join(" | ")); } else console.log("ok  ", url);
    await p.close();
  }
  await browser.close(); srv.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
