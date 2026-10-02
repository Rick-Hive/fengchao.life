// POST /api/directory-sync — the nightly directory sync, for a scheduler.
//
// Static Web Apps' managed functions only answer HTTP, so the 01:00 Beijing
// (17:00 UTC) run is driven from outside: the GitHub Actions workflow
// .github/workflows/directory-sync.yml calls this endpoint in a loop until it
// answers done:true. Each call does one budgeted slice (20 s) of one domain's
// sync, so no call runs into the platform's 45-second limit however many
// schools there are. Progress lives in blob storage (directory/_run.json), so
// a run interrupted by anything resumes where it stopped.
//
// Body: { "mode": "full" | "new", "key": "<HIVE_SYNC_KEY>" }  (or header x-hive-sync-key)
// Reply: { done, queue: [domains left], current, slice: <status of the slice just run> }
//
// No sign-in is involved — the caller is a machine — so the shared secret
// HIVE_SYNC_KEY (an app setting; the same value is the workflow's secret) is
// the whole gate: wrong or missing → 403, and nothing in the reply says which.
const crypto = require("crypto");
const dir = require("../shared/directory");
const { audit } = require("../shared/audit");

const RUN = "_run.json";

function keyOk(req) {
  const want = String(process.env.HIVE_SYNC_KEY || "");
  const got = String((req.headers && req.headers["x-hive-sync-key"]) || (req.body && req.body.key) || "");
  if (!want || want.length < 16 || !got || got.length !== want.length) return false;
  return crypto.timingSafeEqual(Buffer.from(want), Buffer.from(got));
}

module.exports = async function (context, req) {
  if (!keyOk(req)) {
    context.res = { status: 403, headers: { "Cache-Control": "no-store" }, body: { error: "forbidden" } };
    return;
  }
  const mode = String((req.body && req.body.mode) || "full").toLowerCase() === "new" ? "new" : "full";
  try {
    let run = await dir._readJson(RUN);
    // Start a run: every verified domain, in order. A run older than a day is stale and restarted.
    if (!run || !run.queue || (run.startedAt && Date.now() - Date.parse(run.startedAt) > 24 * 3600 * 1000) || run.mode !== mode) {
      const domains = (await dir.verifiedDomains()).map((d) => d.domain);
      run = { mode, startedAt: new Date().toISOString(), queue: domains, done: [], results: {} };
      context.log(`directory-sync: ${mode} run started for ${domains.length} domain(s)`);
    }
    let slice = null;
    if (run.queue.length) {
      const domain = run.queue[0];
      slice = await dir.syncSlice(domain, mode, { budgetMs: 20000, by: "scheduler", log: (m) => context.log(m) });
      if (slice.done) {
        run.queue.shift();
        run.done.push(domain);
        run.results[domain] = { users: slice.users, added: slice.added, syncedAt: slice.syncedAt };
      }
    }
    const done = run.queue.length === 0;
    if (done) {
      run.finishedAt = new Date().toISOString();
      await audit(context, { actor: "scheduler", action: "directory.sync", target: "*", mode, domains: run.done.length, result: "ok" });
      await dir._writeJson(RUN, { last: run }); // keep the summary, clear the queue
    } else {
      await dir._writeJson(RUN, run);
    }
    context.res = { status: 200, headers: { "Cache-Control": "no-store" }, body: { done, mode, queue: run.queue, current: run.queue[0] || null, finished: run.done, slice } };
  } catch (err) {
    context.log.error(`directory-sync: ${(err && err.stack) || err}`);
    context.res = { status: 502, headers: { "Cache-Control": "no-store" }, body: { error: String((err && err.message) || err), done: false } };
  }
};
