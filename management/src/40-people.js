// management/src/40-people.js — 经营 › 人员库: the people hub table, merge queue, person panel, 邮箱替换, write-back.
// Part of management.js: scripts/build-management.js concatenates management/src/*.js in name order
// into management/management.js (one closure; every part sees every other's functions). Edit here, not the built file.

  // ================================================================================
  // 经营 › 人员库 — one record per person across Equip, the tenant, the seminar list
  // and the Hive orders (api/shared/hub.js). Matching is done on the server; here a
  // person reads it, searches it, and answers the level-3 suggestions (same name +
  // school domain) with 是同一个人 / 不是.
  // ================================================================================
  var PEOPLE_TABS = [["all", "全部", "All"], ["replace", "待替换邮箱", "Email to replace"], ["missing", "无邮箱", "No email"], ["viaTeams", "Teams 代用", "Via Teams"], ["queue", "待合并", "To merge"]];
  var STAGES = { lead: ["潜在", "Lead", ""], registered: ["已注册", "Registered", "accent"], active: ["活跃", "Active", "ok"], dormant: ["沉寂", "Dormant", "muted"] };
  var TIERS = { safe: ["可用", "OK", "ok"], replace: ["待替换", "Replace", "warn"], missing: ["无邮箱", "No email", "bad"] };
  var peopleState = { hub: null, tab: "all", q: "", stage: "", mark: "", sort: { key: "", dir: 1 } };
  var MARK_TABS = [["", "全部", "All"], ["none", "未通知", "Not contacted"], ["notified", "已通知", "Contacted"], ["replaced", "已替换", "Replaced"]];
  function markOf(p) { return p.replaceMark ? p.replaceMark.status : "none"; }
  function markTag(p) { var m = p.replaceMark; return !m ? "" : m.status === "replaced" ? '<span class="tag ok">' + t("已替换", "Replaced") + "</span>" : '<span class="tag accent">' + t("已通知", "Contacted") + "</span>"; }
  function stageTag(s) { var d = STAGES[s] || [s, s, ""]; return '<span class="tag ' + d[2] + '">' + esc(t(d[0], d[1])) + "</span>"; }
  function tierTag(tier) { var d = TIERS[tier]; return d ? '<span class="tag ' + d[2] + '">' + esc(t(d[0], d[1])) + "</span>" : ""; }
  function sourceTags(p) {
    var s = p.sources || {}, out = [];
    // a dot in the source's chart colour plus its name, so colour is never alone
    if (s.customer) out.push('<span class="src"><i style="background:' + VIZ.cat[0] + '"></i>Equip</span>');
    if (s.account) out.push('<span class="src"><i style="background:' + VIZ.cat[1] + '"></i>Teams</span>');
    if (s.lead) out.push('<span class="src"><i style="background:' + VIZ.cat[2] + '"></i>' + t("讲座", "Seminar") + "</span>");
    if (s.hive) out.push('<span class="src"><i style="background:' + VIZ.cat[3] + '"></i>' + t("蜂巢", "Hive") + "</span>");
    return '<span class="srcs">' + out.join("") + "</span>";
  }
  // Authenticator state across a person's accounts: true if any is verified, false if all known ones are not, null when unknown.
  function authState(acc) { var known = (acc || []).filter(function (a) { return typeof a.verified === "boolean"; }); if (!known.length) return null; return known.some(function (a) { return a.verified; }); }
  function authTag(acc) { var v = authState(acc); return v === null ? "" : v ? ' <span class="tag ok" title="' + esc(t("已登记验证器，可以登录 Teams", "Authenticator registered; can sign in to Teams")) + '">' + t("已验证", "Verified") + "</span>" : ' <span class="tag bad" title="' + esc(t("还没有登记验证器，登录 Teams 会停在「需要更多信息」", "No authenticator yet; the Teams sign-in stops at “More information required”")) + '">' + t("未验证", "Unverified") + "</span>"; }
  function accountCell(p, acc, accTxt) {
    var personal = p.primaryEmail && !(acc || []).some(function (a) { return (a.upn || "").toLowerCase() === p.primaryEmail.toLowerCase(); }) ? p.primaryEmail : "";
    var warn = (p.primaryTier !== "safe" ? " " + tierTag(p.primaryTier) : "") + (p.primaryTier === "replace" ? " " + markTag(p) : "");
    if (accTxt) return '<span class="cell-ell" title="' + esc(accTxt) + '">' + esc(accTxt) + "</span>" + authTag(acc) + (personal ? '<span class="sub"><span class="cell-ell" title="' + esc(personal) + '">' + esc(personal) + "</span>" + warn + "</span>" : (p.primaryTier === "replace" ? '<span class="sub">' + warn + "</span>" : ""));
    return '<span class="cell-ell" title="' + esc(p.primaryEmail) + '">' + esc(p.primaryEmail || "—") + "</span>" + warn;
  }
  function hiveCustomerHtml(p, f) {
    var hv = f.hive || [];
    if (!hv.length) return '<div class="orow muted">' + t("不是蜂巢课程客户。", "Not a Hive course customer.") + "</div>";
    var contacts = []; hv.forEach(function (o) { (o.keys || [o.email, o.teamsAccount]).forEach(function (k) { if (k && contacts.indexOf(k) < 0) contacts.push(k); }); });
    var hives = []; hv.forEach(function (o) { (o.hives || []).forEach(function (h) { if (hives.indexOf(h) < 0) hives.push(h); }); });
    var first = hv.map(function (o) { return o.at; }).filter(Boolean).sort()[0], last = hv.map(function (o) { return o.at; }).filter(Boolean).sort().slice(-1)[0];
    var total = hv.reduce(function (a, o) { return a + (o.total || 0); }, 0);
    return '<div class="orow"><div class="omain"><b>' + esc(contacts[0] || p.primaryEmail || p.crmId) + "</b>" + (contacts.length > 1 ? '<span class="sub">' + esc(contacts.slice(1).join(" · ")) + "</span>" : "") +
      '<span class="sub">' + esc((hives.length ? hives.join(", ") + " · " : "") + t("首单 ", "first ") + (day(first) || "—") + (last && last !== first ? t(" · 最近 ", " · last ") + day(last) : "")) + "</span></div>" +
      '<div class="oprice">' + hv.length + t(" 单", " orders") + (crmLevel("money") === "none" ? "" : "<br><b>" + money(total, "CNY") + "</b>") + "</div></div>";
  }
  function personTabs(p) { var tb = ["all"]; if (p.primaryTier === "replace") tb.push("replace"); if (p.primaryTier === "missing") tb.push("missing"); if (p.viaTeams) tb.push("viaTeams"); return tb; }
  function viewPeople() {
    var canMerge = isAdmin() || crmLevel("orders") === "rw";
    setTitle(t("经营 › 人员库", "Operations › People Hub"), t("人员库", "People Hub"),
      '<button class="btn secondary sm" id="pReload">' + t("刷新", "Refresh") + "</button> " + '<button class="btn secondary sm" id="pCsv">' + t("导出 CSV", "Export CSV") + "</button>" +
      (canMerge ? ' <button class="btn secondary sm" id="pRebuild">' + t("重新匹配", "Rebuild") + '</button> <button class="btn sm" id="pWriteback">' + t("回写 CRM ID", "Write CRM IDs back") + "</button>" : ""),
      { info: t("Equip 客户、各校 Teams 账号、讲座名单、蜂巢课程订单里的同一个人，在这里是一条记录（CRM ID）。邮箱和 Teams 账号相同的自动合并；同名同校、或账号备用邮箱等于客户邮箱的，放到「待合并」由人来判断（账号的备用邮箱多半是家长的，不会据此合并）。不记录微信和手机号。", "One record (CRM ID) per person across the Equip customers, each school's Teams accounts, the seminar list and the Hive course orders. Identical emails and Teams accounts merge on their own; same name and school, or an account whose recovery email is a customer's email, only go to “To merge” for a person to decide (a recovery email is usually the parent's, so it never merges by itself). No WeChat or phone numbers are recorded.") });
    $("content").innerHTML =
      '<div class="kpis compact" id="pkpi"></div>' +
      '<div class="toolbar sticky" id="pbar">' + PEOPLE_TABS.map(function (tb) { return '<button class="chip" data-f="' + tb[0] + '" aria-pressed="' + (peopleState.tab === tb[0]) + '">' + esc(t(tb[1], tb[2])) + ' <span class="cnt" data-cnt="' + tb[0] + '"></span></button>'; }).join("") +
        '<span class="spacer"></span><select id="pstage"><option value="">' + t("所有阶段", "All stages") + "</option>" + Object.keys(STAGES).map(function (s) { return '<option value="' + s + '"' + (peopleState.stage === s ? " selected" : "") + ">" + esc(t(STAGES[s][0], STAGES[s][1])) + "</option>"; }).join("") + "</select>" +
        '<div class="search">' + ICON.search + '<input type="search" id="pq" value="' + esc(peopleState.q) + '" placeholder="' + t("搜索姓名、邮箱、Teams 账号、CRM ID…", "Search name, email, Teams account, CRM ID…") + '" /></div></div>' +
      '<div id="pbody"></div>' +
      '<p class="muted" id="pfoot" style="font-size:.8rem"></p>';
    $("pbar").addEventListener("click", function (e) {
      var c = e.target.closest(".chip[data-f]"); if (!c) return;
      peopleState.tab = c.getAttribute("data-f");
      $("pbar").querySelectorAll(".chip").forEach(function (x) { x.setAttribute("aria-pressed", x === c ? "true" : "false"); });
      renderPeople();
    });
    $("pq").addEventListener("input", debounce(function () { peopleState.q = $("pq").value.trim(); renderPeople(); }, 120));
    $("pstage").addEventListener("change", function () { peopleState.stage = this.value; renderPeople(); });
    $("pReload").addEventListener("click", function () { loadPeople(true).then(renderPeople); });
    $("pCsv").addEventListener("click", exportPeopleCsv);
    var rb = $("pRebuild");
    if (rb) rb.addEventListener("click", function () {
      savingButton(rb, t("匹配中…", "Rebuilding…"));
      post("crm/people-rebuild", "POST", {}).then(function (r) {
        restoreButton(rb);
        if (!r.ok) { flash(esc(errText(r)), 8000); return; }
        var s = r.body.stats || {};
        var syncNote = r.body.synced ? t("已从 Airtable 同步，", "Synced from Airtable, ") : (r.body.syncError ? t("Airtable 同步失败（用的是上次的副本）：", "Airtable sync failed (last copy used): ") + r.body.syncError + " · " : "");
        (r.body.syncError ? flash : flashOk)(esc(syncNote + t("已重新匹配：", "rebuilt: ") + s.people + t(" 人，待合并 ", " people, to merge ") + s.queue + t("，待回写 CRM ID ", ", CRM IDs to write back ") + s.writeBack), r.body.syncError ? 20000 : 8000);
        loadPeople(true).then(renderPeople);
      });
    });
    // 回写 CRM ID (decision 3: the CRM's only write to Airtable, confirmed each run): a dry
    // run first, the count in the confirmation, then empty CRM ID fields only.
    var wb = $("pWriteback");
    if (wb) wb.addEventListener("click", function () {
      savingButton(wb, t("检查中…", "Checking…"));
      post("crm/writeback", "POST", { dryRun: true }).then(function (r) {
        restoreButton(wb);
        if (!r.ok) { flash(esc(errText(r)), 8000); return; }
        if (!r.body.count) { flashOk(t("Airtable 客户表里没有待回写的 CRM ID。", "No CRM IDs waiting to be written to the Airtable customers."), 5000); return; }
        var sample = (r.body.preview || []).slice(0, 5).map(function (x) { return x.crmId + " " + x.name; }).join("\n");
        if (!window.confirm(t("把 " + r.body.count + " 个 CRM ID 写入 Airtable 的 Customers 表（只写空的，不覆盖已有值）？\n\n例如：\n", "Write " + r.body.count + " CRM IDs to the Airtable Customers table (empty fields only, nothing overwritten)?\n\nFor example:\n") + sample)) return;
        savingButton(wb, t("回写中…", "Writing…"));
        post("crm/writeback", "POST", {}).then(function (r2) {
          restoreButton(wb);
          if (!r2.ok) { flash(r2.body && (r2.body.error === "no_write" || r2.body.error === "no_field" || r2.body.error === "bad_pat") ? esc(r2.body.message) : esc(errText(r2)), 20000); return; }
          var b = r2.body;
          flashOk(esc(t("已回写 " + b.written + " 个 CRM ID", "Wrote " + b.written + " CRM IDs") + (b.already ? t("，已存在 " + b.already, ", " + b.already + " already there") : "") + (b.conflicts.length ? t("，" + b.conflicts.length + " 个已有不同的值未改", ", " + b.conflicts.length + " had a different value and were left") : "") + (b.missing ? t("，" + b.missing + " 条记录 Airtable 里已不存在", ", " + b.missing + " records no longer in Airtable") : "") + "。"), 10000);
          loadPeople(true).then(renderPeople);
        });
      });
    });
    $("pkpi").addEventListener("click", function (e) {
      var k = e.target.closest(".kpi[data-kf]"); if (!k) return;
      peopleState.tab = k.getAttribute("data-kf");
      $("pbar").querySelectorAll(".chip").forEach(function (x) { x.setAttribute("aria-pressed", x.getAttribute("data-f") === peopleState.tab ? "true" : "false"); });
      renderPeople();
    });
    $("pbody").addEventListener("click", function (e) {
      var v = e.target.closest("button[data-verdict]");
      if (v) { verdict(v.getAttribute("data-key"), v.getAttribute("data-verdict"), v); return; }
      var tr = e.target.closest("tr[data-id]"); if (!tr) return;
      document.querySelectorAll("table.data tr.sel").forEach(function (x) { x.classList.remove("sel"); });
      tr.classList.add("sel");
      openPersonPanel(tr.getAttribute("data-id"), !!e.target.closest("button[data-orders]"));
    });
    loadPeople(false).then(renderPeople).catch(function (r) { $("pbody").innerHTML = '<div class="msg err">' + esc(errText(r)) + "</div>"; });
  }
  function loadPeople(force) {
    if (peopleState.hub && !force) return Promise.resolve(peopleState.hub);
    return api("crm/people").then(function (r) {
      if (!r.ok) throw r;
      peopleState.hub = r.body;
      return peopleState.hub;
    });
  }
  function peopleNow() {
    var h = peopleState.hub || {}, q = peopleState.q.toLowerCase();
    return (h.people || []).filter(function (p) {
      if (peopleState.tab !== "all" && personTabs(p).indexOf(peopleState.tab) < 0) return false;
      if (peopleState.tab === "replace" && peopleState.mark && markOf(p) !== peopleState.mark) return false;
      if (peopleState.stage && p.stage !== peopleState.stage) return false;
      if (!q) return true;
      var hay = [p.crmId, p.name, (p.emails || []).map(function (e) { return e.email; }).join(" "), ((p.facets || {}).accounts || []).map(function (a) { return a.upn || a.domain; }).join(" "), ((p.facets || {}).customers || []).map(function (c) { return c.teams + " " + c.city; }).join(" ")].join(" ").toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  var STAGE_ORDER = { lead: 0, registered: 1, active: 2, dormant: 3 };
  function sortPeople(list) {
    var k = peopleState.sort.key, dir = peopleState.sort.dir;
    if (!k) return list;
    var val = function (p) {
      switch (k) {
        case "crmId": return p.crmId || "";
        case "name": return (p.name || "").toLowerCase();
        case "email": return (p.primaryEmail || "").toLowerCase();
        case "sources": var s = p.sources || {}; return [s.customer, s.account, s.lead, s.hive].filter(Boolean).length;
        case "accounts": return ((((p.facets || {}).accounts || [])[0] || {}).upn || (((p.facets || {}).accounts || [])[0] || {}).domain || p.primaryEmail || "").toLowerCase();
        case "orders": return (typeof p.spend === "number" ? p.spend : 0) * 1e6 + (p.orders || 0) + (p.hiveOrders || 0);
        case "active": return [p.lastOrder, p.lastSignIn].filter(Boolean).sort().pop() || "";
        case "stage": return STAGE_ORDER[p.stage] == null ? 9 : STAGE_ORDER[p.stage];
      }
      return "";
    };
    return list.slice().sort(function (a, b) {
      var x = val(a), y = val(b);
      // empty values last whichever direction
      if (x === "" && y !== "") return 1; if (y === "" && x !== "") return -1;
      var c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "zh");
      return c * dir || String(a.crmId).localeCompare(String(b.crmId));
    });
  }
  function lastActive(p) { var d = [p.lastOrder, p.lastSignIn].filter(Boolean).sort().pop(); return d ? day(d) : "—"; }
  function renderPeople() {
    var h = peopleState.hub || {}, s = h.stats || {}, list = h.people || [];
    var counts = { all: list.length, replace: s.replace || 0, missing: s.missing || 0, viaTeams: s.viaTeams || 0, queue: (h.queue || []).length };
    PEOPLE_TABS.forEach(function (tb) { var el = $("pbar").querySelector('[data-cnt="' + tb[0] + '"]'); if (el) el.textContent = counts[tb[0]] ? "(" + counts[tb[0]] + ")" : ""; });
    var st = s.stages || {};
    var stageParts = [{ label: t("活跃", "Active"), value: st.active || 0, color: VIZ.seq }, { label: t("已注册", "Registered"), value: st.registered || 0, color: VIZ.seq2 }, { label: t("潜在", "Leads"), value: st.lead || 0, color: VIZ.seq3 }, { label: t("沉寂", "Dormant"), value: st.dormant || 0, color: VIZ.gray }];
    var srcParts = [{ label: "Equip", value: s.customers || 0, color: VIZ.cat[0] }, { label: "Teams", value: s.accounts || 0, color: VIZ.cat[1] }, { label: t("讲座", "Seminar"), value: s.leads || 0, color: VIZ.cat[2] }, { label: t("蜂巢", "Hive"), value: s.hive || 0, color: VIZ.cat[3] }];
    var tierParts = [{ label: t("可用", "OK"), value: Math.max(0, list.length - (s.replace || 0) - (s.missing || 0)), color: VIZ.seq }, { label: t("待替换", "Replace"), value: s.replace || 0, color: VIZ.cat[1] }, { label: t("无邮箱", "None"), value: s.missing || 0, color: VIZ.gray }];
    $("pkpi").innerHTML =
      '<button type="button" class="kpi stat wide" data-kf="all"><div class="l">' + t("人员", "People") + '</div><div class="v">' + fmtNum(list.length) + "</div>" + shareBar(stageParts, list.length) + "</button>" +
      '<div class="kpi stat wide"><div class="l">' + t("来源（一人可有多个）", "Sources (a person can have several)") + '</div><div class="v">' + fmtNum(s.facets || 0) + ' <span class="unit">' + t("条记录", "records") + "</span></div>" + shareBar(srcParts) + "</div>" +
      '<button type="button" class="kpi stat wide" data-kf="replace"><div class="l">' + t("邮箱", "Email") + '</div><div class="v' + (counts.replace ? " warn" : "") + '">' + fmtNum(counts.replace) + ' <span class="unit">' + t("待替换", "to replace") + "</span></div>" + shareBar(tierParts, list.length) + "</button>" +
      (h.canMerge ? '<button type="button" class="kpi stat" data-kf="queue"><div class="l">' + t("待合并", "To merge") + '</div><div class="v' + (counts.queue ? " warn" : "") + '">' + fmtNum(counts.queue) + '</div><div class="s"><span>' + t("需要人判断的配对", "pairs for a person to decide") + "</span></div></button>" : "") +
      '<div class="kpi stat"><div class="l">' + t("待回写 CRM ID", "CRM IDs to write back") + '</div><div class="v">' + fmtNum(s.writeBack || 0) + '</div><div class="s"><span>' + t("Airtable 客户表还没有的", "customers not yet tagged in Airtable") + "</span></div></div>";
    if (peopleState.tab === "queue") { renderQueue(); return; }
    var rows = sortPeople(peopleNow());
    // On 待替换邮箱: progress by mark (decision 14 — prompt, never force), with orders first in mind.
    var subbar = "";
    if (peopleState.tab === "replace") {
      var all = list.filter(function (p) { return p.primaryTier === "replace"; }), cnt = function (k) { return k ? all.filter(function (p) { return markOf(p) === k; }).length : all.length; };
      subbar = '<div class="toolbar sub" id="pmarks">' + MARK_TABS.map(function (m) { return '<button class="chip" data-m="' + m[0] + '" aria-pressed="' + (peopleState.mark === m[0]) + '">' + esc(t(m[1], m[2])) + ' <span class="cnt">(' + cnt(m[0]) + ")</span></button>"; }).join("") +
        '<span class="muted" style="font-size:12px">' + esc(t("有订单的 " + all.filter(function (p) { return (p.orders || 0) > 0; }).length + " 人优先 · 本月已替换 " + (s.replacedThisMonth || 0), all.filter(function (p) { return (p.orders || 0) > 0; }).length + " with orders first · replaced this month " + (s.replacedThisMonth || 0))) + "</span></div>";
    }
    var th = function (key, label) { var on = peopleState.sort.key === key; return '<th class="sortable' + (on ? " on" : "") + '" data-sort="' + key + '" aria-sort="' + (on ? (peopleState.sort.dir > 0 ? "ascending" : "descending") : "none") + '">' + label + '<span class="sortind">' + (on ? (peopleState.sort.dir > 0 ? "▲" : "▼") : "") + "</span></th>"; };
    var html = '<div class="tbl-wrap"><table class="data fixed" id="ptable"><colgroup><col style="width:11%"><col style="width:17%"><col style="width:32%"><col style="width:12%"><col style="width:10%"><col style="width:10%"><col style="width:8%"></colgroup><thead><tr>' + th("crmId", "CRM ID") + th("name", t("姓名", "Name")) + th("accounts", t("账号 / 邮箱", "Account / email")) + th("sources", t("来源", "Sources")) + th("orders", t("订单 / 金额", "Orders / Amount")) + th("active", t("最近活动", "Last active")) + th("stage", t("阶段", "Stage")) + "</tr></thead><tbody>";
    if (!list.length) html += '<tr><td colspan="7" class="empty">' + (h.generatedAt ? t("还没有人员记录。", "No people yet.") : t("人员库还没有生成：同步一次 Equip 订单，或点「重新匹配」。", "The people hub has not been built yet: sync the Equip orders once, or click “Rebuild”.")) + "</td></tr>";
    else if (!rows.length) html += '<tr><td colspan="7" class="empty">' + t("没有符合条件的人。", "Nobody matches.") + "</td></tr>";
    else html += rows.map(function (p) {
      var acc = (p.facets && p.facets.accounts) || [];
      var accTxt = acc.map(function (a) { return a.upn || a.domain; }).join(", ");
      var spend = crmLevel("money") === "none" ? "" : (typeof p.spend === "number" && p.spend ? " / " + money(p.spend, "CNY") : "");
      return '<tr class="pick" data-id="' + esc(p.crmId) + '"><td class="nowrap"><b>' + esc(p.crmId) + "</b>" + (p.writeBack && p.writeBack.length ? ' <span class="dot warn" title="' + esc(t("待回写：Airtable 客户表还没有这个 CRM ID", "To write back: not yet on the Airtable customer")) + '"></span>' : "") + "</td>" +
        '<td class="nowrap"><span class="avatar xs" style="background:' + hue(p.crmId) + ';color:#fff">' + esc(initials(p.name || p.crmId)) + '</span> <span class="cell-ell">' + hl(p.name || "—", peopleState.q) + "</span>" + (p.family ? ' <span class="fam" title="' + esc(t("家庭 " + p.family.members.length + " 人", "Family of " + p.family.members.length)) + '">⌂' + p.family.members.length + "</span>" : "") + "</td>" +
        // One column for how the person is reached (Rick, 2026-10-08: 主邮箱 and 账号 were
        // the same for most rows, and "可用" / the Teams badge repeated the 来源 column).
        // The Teams account first, with the authenticator state (已验证 / 未验证); a personal
        // email on a second line only when it differs, carrying its 待替换 warning.
        '<td class="nowrap">' + accountCell(p, acc, accTxt) + "</td>" +
        "<td>" + sourceTags(p) + "</td>" +
        '<td class="nowrap">' + (((p.orders || 0) + (p.hiveOrders || 0)) ? '<button type="button" class="tag link" data-orders="' + esc(p.crmId) + '" title="' + esc(t("查看订单明细", "See the orders")) + '">' + ((p.orders || 0) + (p.hiveOrders || 0)) + spend + "</button>" : "0") + "</td>" +
        '<td class="nowrap">' + esc(lastActive(p)) + "</td><td>" + stageTag(p.stage) + "</td></tr>";
    }).join("");
    html += "</tbody></table></div>";
    $("pbody").innerHTML = subbar + html;
    colResize($("ptable"));
    if ($("pmarks")) $("pmarks").addEventListener("click", function (e) { var c = e.target.closest(".chip[data-m]"); if (!c) return; peopleState.mark = c.getAttribute("data-m"); renderPeople(); });
    // Click a heading to sort by it; again to reverse (Rick, 2026-10-08: 「CRM ID field, when clicking, should be 排序」).
    $("ptable").tHead.addEventListener("click", function (e) {
      if (e.target.closest(".rz")) return;
      var h = e.target.closest("th[data-sort]"); if (!h) return;
      var k = h.getAttribute("data-sort");
      peopleState.sort = { key: k, dir: peopleState.sort.key === k ? -peopleState.sort.dir : 1 };
      renderPeople();
    });
    // The footer says why fewer people show than exist (Rick, 2026-10-08: 「Why only shows
    // 6 / 1980 people?」 — a search was still in the box) and offers to clear it.
    var filters = [];
    if (peopleState.tab !== "all") { var tb = PEOPLE_TABS.filter(function (x) { return x[0] === peopleState.tab; })[0]; if (tb) filters.push(t(tb[1], tb[2])); }
    if (peopleState.stage) filters.push(t("阶段 ", "stage ") + t(STAGES[peopleState.stage][0], STAGES[peopleState.stage][1]));
    if (peopleState.q) filters.push(t("搜索 ", "search ") + "“" + peopleState.q + "”");
    $("pfoot").innerHTML = (list.length ? esc(t("显示 ", "Showing ") + rows.length + " / " + list.length + t(" 人", " people")) + (filters.length ? ' <span class="status warn">' + esc(t("筛选：", "filter: ") + filters.join(" · ")) + '</span> <a href="#" id="pClear">' + t("显示全部", "Show all") + "</a>" : "") + " · " : "") + (h.generatedAt ? esc(t("匹配于 ", "Matched ") + when(h.generatedAt)) : "") +
      (h.sources && h.sources.equipSyncedAt ? " · " + esc(t("Equip 数据同步于 ", "Equip data synced ") + when(h.sources.equipSyncedAt)) : "");
    var clr = $("pClear");
    if (clr) clr.addEventListener("click", function (e) {
      e.preventDefault();
      peopleState.tab = "all"; peopleState.stage = ""; peopleState.q = "";
      if ($("pq")) $("pq").value = ""; if ($("pstage")) $("pstage").value = "";
      $("pbar").querySelectorAll(".chip").forEach(function (x) { x.setAttribute("aria-pressed", x.getAttribute("data-f") === "all" ? "true" : "false"); });
      renderPeople();
    });
  }
  function renderQueue() {
    var h = peopleState.hub || {}, q = h.queue || [], qq = peopleState.q.toLowerCase();
    var rows = q.filter(function (x) { return !qq || [x.customer.name, x.customer.email, x.account.upn, x.account.name].join(" ").toLowerCase().indexOf(qq) >= 0; });
    $("pbody").innerHTML = !q.length ? '<div class="card"><p class="muted">' + t("没有待合并的建议。同名同校的 Equip 客户和 Teams 账号会出现在这里。", "Nothing to merge. An Equip customer and a Teams account with the same name and school would appear here.") + "</p></div>" :
      !rows.length ? '<div class="card"><p class="muted">' + t("没有符合条件的建议。", "No suggestion matches.") + "</p></div>" :
      rows.map(function (x) {
        var c = x.customer, a = x.account;
        var why = x.reason === "safeEmail" ? t("账号的备用邮箱 = 客户邮箱", "recovery email = customer email") : t("同名 · 同校", "same name · same school");
        var side = function (tag, name, line, meta, id) { return '<div class="mside"><span class="avatar" style="background:' + hue(name) + ';color:#fff">' + esc(initials(name)) + '</span><div class="who"><div class="nm">' + esc(name) + ' <span class="tag">' + tag + '</span></div><div class="ln">' + esc(line) + '</div><div class="mt">' + esc(meta) + "</div></div></div>"; };
        return '<div class="card merge" data-key="' + esc(x.key) + '"><div class="pair">' +
          side("Equip", c.name, c.email || t("无邮箱", "no email"), (c.orders || 0) + t(" 单", " orders") + " · " + (c.crmId || "")) +
          '<div class="link"><span class="why">' + esc(why) + '</span><span class="q">?</span></div>' +
          side("Teams", a.name, a.upn, [vl(a.identity || ""), a.lastSignIn ? t("最近登录 ", "last sign-in ") + day(a.lastSignIn) : "", a.safeEmail ? t("备用邮箱 ", "recovery ") + a.safeEmail : "", a.crmId].filter(Boolean).join(" · ")) +
          '<div class="actions"><button class="btn sm" data-verdict="same" data-key="' + esc(x.key) + '">' + t("是同一个人", "Same person") + '</button><button class="btn secondary sm" data-verdict="different" data-key="' + esc(x.key) + '">' + t("不是", "Different") + "</button></div></div></div>";
      }).join("");
    $("pfoot").innerHTML = esc(t("合并后两条记录共用一个 CRM ID；「不是」只是不再提示。两种回答都会记录是谁、何时。", "Merged records share one CRM ID; “Different people” only silences the suggestion. Both answers record who and when."));
  }
  function verdict(key, v, btn) {
    var card = btn.closest(".card"); card.querySelectorAll("button").forEach(function (b) { b.disabled = true; });
    savingButton(btn, t("记录中…", "Saving…"));
    post("crm/queue", "POST", { key: key, verdict: v }).then(function (r) {
      if (!r.ok) { restoreButton(btn); card.querySelectorAll("button").forEach(function (b) { b.disabled = false; }); flash(esc(errText(r)), 8000); return; }
      flashOk(v === "same" ? t("已合并为同一个人。", "Merged into one person.") : t("已记录：不是同一个人。", "Recorded: different people."), 4000);
      peopleState.hub = null;
      loadPeople(true).then(renderPeople);
    });
  }
  function exportPeopleCsv() {
    var cell = function (v) { v = String(v == null ? "" : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var head = ["CRM ID", t("姓名", "Name"), t("主邮箱", "Primary email"), t("邮箱状态", "Email status"), t("来源", "Sources"), t("账号", "Accounts"), t("订单", "Orders"), t("金额", "Amount"), t("最近活动", "Last active"), t("阶段", "Stage")].join(",");
    var lines = peopleNow().map(function (p) {
      var s = p.sources || {};
      return [p.crmId, p.name, p.primaryEmail, p.primaryTier, [s.customer && "Equip", s.account && "Teams", s.lead && t("讲座", "Seminar"), s.hive && t("蜂巢", "Hive")].filter(Boolean).join("; "), ((p.facets || {}).accounts || []).map(function (a) { return a.upn || a.domain; }).join("; "), (p.orders || 0) + (p.hiveOrders || 0), p.spend == null ? "" : p.spend, lastActive(p), t(STAGES[p.stage] ? STAGES[p.stage][0] : p.stage, STAGES[p.stage] ? STAGES[p.stage][1] : p.stage)].map(cell).join(",");
    });
    var blob = new Blob(["﻿" + [head].concat(lines).join("\r\n")], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "people-" + new Date().toISOString().slice(0, 10) + ".csv"; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }
  // 邮箱替换 (decision 14): where this person stands, the buttons to move them on, and a
  // message to copy — the Teams account to use is theirs if they have one.
  function replaceSection(p) {
    var h = peopleState.hub || {}, m = p.replaceMark, upn = (((p.facets || {}).accounts || [])[0] || {}).upn || "";
    var mail = (p.emails || []).filter(function (e) { return e.tier === "replace"; }).map(function (e) { return e.email; })[0] || "";
    var zh = (p.name || "") + " 您好，\n\n您在蜂巢/EquipMe 登记的联系邮箱是 " + mail + "。境内邮箱接收海外邮件不稳定，也不够安全，我们建议改用" + (upn ? "您的 Teams 账号 " + upn + "（它自带邮箱）" : "一个 Teams 账号（我们可以为您开通，自带邮箱）") + "作为联系邮箱。\n\n如果方便，请回复确认，我们在系统里为您更新。谢谢！";
    var en = "Hello " + (p.name || "") + ",\n\nThe contact email we have for you is " + mail + ". Mainland mailboxes receive overseas mail unreliably and are less secure, so we suggest using " + (upn ? "your Teams account " + upn + " (it has its own mailbox)" : "a Teams account (we can set one up for you; it comes with a mailbox)") + " as your contact email.\n\nIf that works for you, please reply to confirm and we will update it. Thank you!";
    return "<h4>" + t("邮箱替换", "Email replacement") + "</h4>" +
      '<div class="kv"><span class="k">' + t("状态", "Status") + "</span><span>" + (m ? (m.status === "replaced" ? '<span class="tag ok">' + t("已替换", "Replaced") + "</span>" : '<span class="tag accent">' + t("已通知", "Contacted") + "</span>") + ' <span class="muted">' + esc(day(m.at) + (m.by ? " · " + m.by : "") + (m.note ? " · " + m.note : "")) + "</span>" : '<span class="tag warn">' + t("未通知", "Not contacted") + "</span>") + "</span>" +
        '<span class="k">' + t("建议改用", "Suggested") + "</span><span>" + (upn ? esc(upn) : '<span class="muted">' + t("还没有 Teams 账号（可在用户页新建）", "No Teams account yet (create one on the Users page)") + "</span>") + "</span></div>" +
      (h.canMark ? '<div class="actions">' + (m && m.status === "notified" ? "" : '<button type="button" class="btn secondary sm" data-mark="notified">' + t("标记已通知", "Mark contacted") + "</button>") + (m && m.status === "replaced" ? "" : '<button type="button" class="btn sm" data-mark="replaced">' + t("标记已替换", "Mark replaced") + "</button>") + (m ? '<button type="button" class="btn secondary sm" data-mark="">' + t("撤销标记", "Clear") + "</button>" : "") + "</div>" : "") +
      '<details class="msgtpl"><summary>' + t("提醒话术（可复制）", "Message to send (copy)") + '</summary><textarea readonly rows="7">' + esc(zh) + '</textarea><button type="button" class="btn secondary sm" data-copy="zh">' + t("复制中文", "Copy Chinese") + '</button><textarea readonly rows="7">' + esc(en) + '</textarea><button type="button" class="btn secondary sm" data-copy="en">' + t("复制英文", "Copy English") + "</button></details>" +
      '<p class="hint">' + t("标记只记录进度，不改任何来源；邮箱本身在 Airtable 客户表里改，下次同步后这个人就不再出现在待替换里。", "Marks record progress only; the address itself is changed on the Airtable customer, after which the next sync drops the person from this list.") + "</p>";
  }
  $("panel").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-mark]");
    if (b) {
      var id = ($("panel").getAttribute("data-crm") || ""), status = b.getAttribute("data-mark");
      if (!id) return;
      savingButton(b, t("记录中…", "Saving…"));
      post("crm/email-replace", "POST", { crmId: id, status: status }).then(function (r) {
        restoreButton(b);
        if (!r.ok) { flash(esc(errText(r)), 6000); return; }
        var p = ((peopleState.hub || {}).people || []).filter(function (x) { return x.crmId === id; })[0];
        if (p) { if (r.body.mark) p.replaceMark = r.body.mark; else delete p.replaceMark; }
        if (peopleState.hub && peopleState.hub.stats) Object.assign(peopleState.hub.stats, r.body.stats || {});
        flashOk(status === "replaced" ? t("已标记为已替换。", "Marked as replaced.") : status === "notified" ? t("已标记为已通知。", "Marked as contacted.") : t("已撤销标记。", "Mark cleared."), 3000);
        if ($("ptable")) renderPeople();
        openPersonPanel(id);
      });
      return;
    }
    var c = e.target.closest("button[data-copy]");
    if (c) { var ta = c.previousElementSibling; if (ta && navigator.clipboard) navigator.clipboard.writeText(ta.value).then(function () { c.textContent = t("已复制 ✓", "Copied ✓"); setTimeout(function () { c.textContent = c.getAttribute("data-copy") === "zh" ? t("复制中文", "Copy Chinese") : t("复制英文", "Copy English"); }, 1500); }); }
  });
  function openPersonPanel(id, toOrders) {
    var p = ((peopleState.hub || {}).people || []).filter(function (x) { return x.crmId === id; })[0];
    if (!p) return;
    var f = p.facets || {};
    var emails = (p.emails || []).length ? (p.emails || []).map(function (e) { return '<div class="orow"><div class="omain"><b>' + esc(e.email) + "</b>" + (e.upn ? '<span class="sub">' + t("Teams 账号", "Teams account") + "</span>" : "") + "</div><div>" + tierTag(e.tier) + (e.email === p.primaryEmail ? ' <span class="tag accent">' + t("主邮箱", "primary") + "</span>" : "") + "</div></div>"; }).join("") : '<div class="orow muted">' + t("没有邮箱。", "No email.") + "</div>";
    var accounts = (f.accounts || []).map(function (a) {
      return '<div class="orow"><div class="omain"><b>' + esc(a.upn || ("…@" + a.domain)) + '</b><span class="sub">' + esc([vl(a.identity || ""), a.jobTitle, a.lastSignIn ? t("最近登录 ", "last sign-in ") + day(a.lastSignIn) : "", a.safeEmail ? t("备用邮箱 ", "recovery email ") + a.safeEmail : ""].filter(Boolean).join(" · ")) + "</span></div>" + (a.enabled === false ? '<span class="tag bad">' + t("已停用", "disabled") + "</span>" : "") + "</div>";
    }).join("");
    var recIds = (f.customers || []).map(function (c) { return c.recId; });
    var mails = (p.emails || []).map(function (e) { return e.email; });
    var equipOrdersHtml = function () {
      var os = (equipState.list || []).filter(function (o) { return recIds.indexOf(o.customerRec) >= 0 || (o.email && mails.indexOf(o.email) >= 0); }).sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
      if (!os.length) return '<div class="orow muted">' + t("没有教材订单。", "No textbook orders.") + "</div>";
      return os.map(function (o) {
        var names = (o.items || []).map(equipName);
        return '<button type="button" class="orow link" data-eorder="' + esc(o.recId) + '"><div class="omain"><b>' + esc(o.orderId) + '</b><span class="sub">' + esc([o.date, names.slice(0, 2).join(" · ") + (names.length > 2 ? " +" + (names.length - 2) : "")].filter(Boolean).join(" · ")) + '</span></div><div class="oprice">' + (o.qty || 0) + t(" 件", " units") + (crmLevel("money") === "none" ? "" : "<br><b>" + money(o.amount, "CNY") + "</b>") + "</div></button>";
      }).join("");
    };
    var customers = (f.customers || []).map(function (c) {
      return '<div class="orow"><div class="omain"><b>' + esc(c.name || "") + '</b><span class="sub">' + esc([c.teams ? "Teams " + c.teams : "", c.city, c.firstOrder ? t("首单 ", "first ") + c.firstOrder : "", c.lastOrder ? t("最近 ", "last ") + c.lastOrder : ""].filter(Boolean).join(" · ")) + "</span>" + (c.crmId ? "" : '<span class="sub">' + esc(t("Airtable 客户表还没有 CRM ID", "No CRM ID in the Airtable customer yet")) + "</span>") + '</div><div class="oprice">' + (c.orders || 0) + t(" 单", " orders") + (crmLevel("money") === "none" ? "" : "<br><b>" + money(c.spend, "CNY") + "</b>") + "</div></div>";
    }).join("");
    var hive = (f.hive || []).map(function (o) {
      return '<div class="orow"><div class="omain"><b>' + esc(o.orderId) + '</b><span class="sub">' + esc([day(o.at), (o.hives || []).map(function (hv) { return hv.abbr || hv.name; }).join(", ")].filter(Boolean).join(" · ")) + '</span></div><div class="oprice">' + stTag(o.status) + (crmLevel("money") === "none" ? "" : "<br><b>" + money(o.total, "CNY") + "</b>") + "</div></div>";
    }).join("");
    var leads = (f.leads || []).map(function (l) { return '<div class="orow"><div class="omain"><b>' + esc(l.session || t("讲座", "Seminar")) + '</b><span class="sub">' + esc([l.name, day(l.at)].filter(Boolean).join(" · ")) + "</span></div></div>"; }).join("");
    $("panel").setAttribute("data-crm", p.crmId);
    panelOpen('<div class="ph"><h3>' + esc(p.name || p.crmId) + "</h3>" + stageTag(p.stage) + '<button class="x" type="button" aria-label="close">✕</button></div><div class="pb">' +
      '<div class="kv"><span class="k">CRM ID</span><span><b>' + esc(p.crmId) + "</b>" + (p.writeBack && p.writeBack.length ? ' <span class="tag muted">' + t("待回写 Airtable", "to write back to Airtable") + "</span>" : "") + "</span>" +
        '<span class="k">' + t("首次出现", "First seen") + "</span><span>" + esc(day(p.firstSeen) || "—") + "</span>" +
        '<span class="k">' + t("最近活动", "Last active") + "</span><span>" + esc(lastActive(p)) + "</span>" +
        (crmLevel("money") === "none" ? "" : '<span class="k">' + t("消费", "Spend") + "</span><span>" + money(p.spend, "CNY") + (p.hiveTotal ? " + " + money(p.hiveTotal, "CNY") + ' <span class="muted">' + t("蜂巢", "Hive") + "</span>" : "") + "</span>") + "</div>" +
      "<h4>" + t("邮箱", "Emails") + '</h4><div class="olist">' + emails + "</div>" +
      (p.primaryTier === "replace" ? replaceSection(p) : "") +
      (p.family ? "<h4>" + t("家庭", "Family") + " · " + p.family.members.length + '</h4><div class="olist">' + p.family.members.map(function (m) { return (m.crmId === p.crmId ? '<div class="orow"><div class="omain"><b>' + esc(m.name || m.crmId) + "</b>" : '<button type="button" class="orow link" data-person="' + esc(m.crmId) + '"><div class="omain"><b>' + esc(m.name || m.crmId) + "</b>") + '<span class="sub">' + esc(m.crmId) + "</span></div><div>" + (m.role === "adult" ? '<span class="tag">' + t("家长 / 成人", "Adult") + "</span>" : m.role === "child" ? '<span class="tag accent">' + t("孩子", "Child") + "</span>" : "") + (m.crmId === p.crmId ? "</div></div>" : "</div></button>"); }).join("") + "</div>" + '<p class="hint">' + t("家庭由关联账号、共同的备用邮箱和「家长买、孩子读」的 Teams 账号推出；在用户页设置关联账号可以修正。", "Families follow linked accounts, a shared recovery email and a parent's purchase read on a child's account; set linked accounts on the Users page to correct one.") + "</p>" : "") +
      (p.viaTeams ? '<p class="hint">' + t("主邮箱用的是 Teams 账号：原邮箱是境内邮箱，不用它联系。", "The Teams account serves as the primary email: the original is a mainland mailbox and is not used for contact.") + "</p>" : "") +
      "<h4>" + t("Teams 账号", "Teams accounts") + " · " + (f.accounts || []).length + '</h4><div class="olist">' + (accounts || '<div class="orow muted">' + t("没有匹配到账号。", "No account matched.") + "</div>") + "</div>" +
      "<h4>" + t("Equip 客户", "Equip customer") + " · " + (f.customers || []).length + '</h4><div class="olist">' + (customers || '<div class="orow muted">' + t("不是 Equip 客户。", "Not an Equip customer.") + "</div>") + "</div>" +
      // Hive 客户 (Rick, 2026-10-08: 「Hive 客户 — 在Equip客户后」): the person as a customer of the
      // website's courses — the contact used at checkout, how many orders, the hives, the total.
      (crmLevel("orders") === "none" ? "" : "<h4>" + t("Hive 客户", "Hive customer") + " · " + ((f.hive || []).length ? 1 : 0) + '</h4><div class="olist">' + hiveCustomerHtml(p, f) + "</div>") +
      '<h4 id="pOrdersH">' + t("教材订单", "Textbook orders") + " · " + (p.orders || 0) + '</h4><div class="olist" id="pEquipOrders">' + (equipState.list ? equipOrdersHtml() : '<div class="orow muted">' + t("载入中…", "Loading…") + "</div>") + "</div>" +
      (crmLevel("orders") === "none" ? "" : "<h4>" + t("蜂巢课程订单", "Hive course orders") + " · " + (f.hive || []).length + '</h4><div class="olist">' + (hive || '<div class="orow muted">' + t("没有课程订单。", "No course orders.") + "</div>") + "</div>") +
      (crmLevel("leads") === "none" ? "" : "<h4>" + t("讲座名单", "Seminar list") + " · " + (f.leads || []).length + '</h4><div class="olist">' + (leads || '<div class="orow muted">' + t("没有讲座报名。", "No seminar sign-up.") + "</div>") + "</div>") +
      (crmLevel("drm") === "none" ? "" : "<h4>" + t("许可（DRM 座位）", "Licences (DRM seats)") + '</h4><div class="olist" id="pLic"><div class="orow muted">' + t("载入中…", "Loading…") + "</div></div>") +
      '<p class="hint">' + t("这条记录由匹配生成，不能在这里编辑：改邮箱、姓名请在来源（Airtable 或各校账号）里改，下次同步后更新。", "This record is generated by matching and cannot be edited here: change emails or names at the source (Airtable or the school's accounts); the next sync picks it up.") + "</p></div>");
    if ($("pLic")) api("crm/licenses?person=" + encodeURIComponent(p.crmId)).then(function (r) {
      var el = $("pLic"); if (!el) return;
      var al = (r.ok && r.body.allocations || []).filter(function (a) { return !a.revokedAt; });
      el.innerHTML = al.length ? al.map(function (a) { return '<div class="orow"><div class="omain"><b>' + esc((a.pool && (a.pool.title || a.pool.sku)) || a.poolId) + '</span></b><span class="sub">' + esc(a.poolId + " · " + day(a.at) + (a.pool && a.pool.validTo ? t(" · 至 ", " · to ") + a.pool.validTo : "")) + '</span></div><div class="oprice">' + a.qty + t(" 份", " seats") + "</div></div>"; }).join("") : '<div class="orow muted">' + t("没有许可座位。", "No seats.") + "</div>";
    });
    if (!equipState.list && (p.orders || 0) > 0) loadEquip(false).then(function () { var el = $("pEquipOrders"); if (el) el.innerHTML = equipOrdersHtml(); if (toOrders) scrollToOrders(); }).catch(function () { var el = $("pEquipOrders"); if (el) el.innerHTML = '<div class="orow muted">' + t("订单读取失败。", "Orders could not be read.") + "</div>"; });
    else if (toOrders) scrollToOrders();
    function scrollToOrders() { var h = $("pOrdersH"); if (h) h.scrollIntoView({ block: "start", behavior: "smooth" }); }
  }
