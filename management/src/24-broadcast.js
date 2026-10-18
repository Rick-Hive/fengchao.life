// management/src/24-broadcast.js — 学校管理 › 校历 › 不接收广播的名单: the accounts that do not receive 系统广播 (Rick,
// 2026-10-17; a tab of the calendar page since 2026-10-18).
// Part of management.js (see scripts/build-management.js). Server: GET/POST /api/calendar with `optout`
// (api/shared/calendar.js keeps crm/broadcast-optout.json; the sync leaves these accounts out of every broadcast
// and withdraws what they already hold). It concerns the broadcasts only — a school's own 校历 is the school's
// daily business. Kept by the system administrator, 教育社区经理, 课程总监 (any school) and a school's 教育领袖 (that
// school's accounts only; the IT 管理员 has no part in the calendar). There is deliberately no switch for ordinary users.

  var bcState = { domain: "", data: null, chips: [], reason: "", err: "" };
  function bcDomains() { return ((domainsInfo && domainsInfo.domains) || []).filter(function (d) { return d.can && d.can.broadcastOptout; }); }
  function canSeeOptout() { return bcDomains().length > 0; }
  function bcWhen(iso) { var d = new Date(iso); return isNaN(d) ? "" : d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }

  // The old link #/domain/broadcast opens the calendar page on this tab.
  function viewBroadcast() { calState.layer = "optout"; viewCalendar(); }
  // The tab's body, inside the calendar page (calLoad hands over here when the layer is "optout").
  function bcMount() {
    var ds = bcDomains(), all = canHive();
    if (!ds.length) { calState.layer = "school"; viewCalendar(); return; }
    if (!bcState.domain || (bcState.domain !== "*" && !ds.some(function (d) { return d.domain === bcState.domain; })) || (bcState.domain === "*" && !all)) bcState.domain = all && ds.length > 1 ? "*" : ds[0].domain;
    $("calright").innerHTML = tipI(t("名单上的账号不会收到任何系统广播（即使被点名）；已经写进他们日历的广播，下次发布时会撤回。只管广播，不影响学校自己的校历。教育领袖只能加入本校的账号。", "Accounts on this list receive no system broadcasts (even when named); broadcasts already in their calendars are withdrawn at the next publish. Broadcasts only — a school's own calendar is not affected. An education leader adds their own school's accounts only."));
    $("calbody").innerHTML = '<div class="toolbar sub" id="bcbar"></div><div id="bcmsg"></div><div id="bcbody"><div class="loading">' + t("载入中…", "Loading…") + "</div></div>";
    bcLoad();
  }
  function bcMsg(text, bad) { if ($("bcmsg")) $("bcmsg").innerHTML = text ? '<div class="msg ' + (bad ? "err" : "ok") + '">' + esc(text) + "</div>" : ""; }
  function bcLoad() {
    var ds = bcDomains(), all = canHive();
    $("bcbar").innerHTML = ds.length > 1 || all ? '<label class="muted" style="font-size:12.5px">' + t("学校", "School") + ' <select id="bcsel">' + (all && ds.length > 1 ? '<option value="*"' + (bcState.domain === "*" ? " selected" : "") + ">" + t("所有学校", "All schools") + "</option>" : "") + ds.map(function (d) { return '<option value="' + esc(d.domain) + '"' + (d.domain === bcState.domain ? " selected" : "") + ">" + esc(dname(d.domain)) + "</option>"; }).join("") + "</select></label>" : '<span class="tag accent">' + esc(dname(bcState.domain)) + "</span>";
    var sel = $("bcsel"); if (sel) sel.addEventListener("change", function () { bcState.domain = sel.value; bcState.chips = []; bcLoad(); });
    $("bcbody").innerHTML = '<div class="loading">' + t("载入中…", "Loading…") + "</div>";
    return api("calendar?optout=1&domain=" + encodeURIComponent(bcState.domain)).then(function (r) {
      if (!r.ok) { $("bcbody").innerHTML = '<div class="msg err">' + esc(errText(r)) + "</div>"; return; }
      bcState.data = r.body; bcRender();
    });
  }
  function bcRender() {
    var d = bcState.data, who = {}; d.people.forEach(function (p) { who[p.u] = p; });
    var onList = {}; d.items.forEach(function (x) { onList[x.upn] = 1; });
    var multi = bcState.domain === "*";
    var rows = d.items.length ? d.items.map(function (x) {
      var p = who[x.upn];
      return "<tr><td><b>" + esc(p && p.n ? p.n : x.upn) + "</b>" + (p && p.n ? '<div class="faint" style="font-size:12px">' + esc(x.upn) + "</div>" : "") + "</td>" + (multi ? "<td>" + esc(p ? dname(p.d) : (x.upn.split("@")[1] || "")) + "</td>" : "") +
        "<td>" + esc(x.reason || "—") + '</td><td class="faint" style="white-space:nowrap">' + esc(bcWhen(x.at)) + (x.by ? " · " + esc(String(x.by).split("@")[0]) : "") + '</td><td style="text-align:right"><button type="button" class="btn secondary sm" data-bcrm="' + esc(x.upn) + '">' + t("移出名单", "Remove") + "</button></td></tr>";
    }).join("") : '<tr><td colspan="' + (multi ? 5 : 4) + '" class="muted">' + t("名单是空的：所有人都会收到广播。", "The list is empty: everyone receives the broadcasts.") + "</td></tr>";
    $("bcbody").innerHTML =
      '<div class="whobox" style="max-width:760px"><b class="whotitle">' + t("加入名单", "Add to the list") + '</b>' +
      '<div class="calpick" id="bcpick"><div class="chips"></div><input type="text" placeholder="' + esc(t("输入姓名或 Teams 账号，回车添加；可粘贴多个", "Type a name or Teams account, Enter to add; paste several")) + '" autocomplete="off" /><div class="calpickdd" hidden></div></div>' +
      '<label class="f" style="margin-top:8px">' + t("原因（可选，方便以后查）", "Reason (optional, for later)") + '<input type="text" id="bcreason" maxlength="200" value="' + esc(bcState.reason) + '" /></label>' +
      '<div class="actions"><button class="btn" type="button" id="bcadd">' + t("加入名单", "Add to the list") + '</button></div><div id="bcnote"></div></div>' +
      '<p class="sub" style="margin:14px 0 6px"><b>' + d.items.length + "</b> " + t("个账号不接收广播", d.items.length === 1 ? "account does not receive broadcasts" : "accounts do not receive broadcasts") + "</p>" +
      '<div class="tbl-wrap"><table class="data" id="bctable"><thead><tr><th>' + t("账号", "Account") + "</th>" + (multi ? "<th>" + t("学校", "School") + "</th>" : "") + "<th>" + t("原因", "Reason") + "</th><th>" + t("加入", "Added") + "</th><th></th></tr></thead><tbody>" + rows + "</tbody></table></div>";
    calPicker($("bcpick"), {
      chips: bcState.chips, onChange: function () { $("bcnote").innerHTML = ""; },
      items: function () { return d.people.filter(function (p) { return !onList[p.u]; }).map(function (p) { return { key: p.u, label: p.n ? p.n + " · " + p.u : p.u, sub: (multi ? dname(p.d) + " · " : "") + (p.i || "") }; }); },
      empty: function () { return ""; },
      free: function (text) {
        var known = {}; d.people.forEach(function (p) { known[p.u] = 1; });
        var added = [], unknown = [];
        text.split(/[\s,;，；]+/).map(function (x) { return x.trim().toLowerCase(); }).filter(Boolean).forEach(function (u) { if (known[u] && !onList[u]) added.push({ key: u, label: u }); else if (!known[u]) unknown.push(u); });
        return { added: added, unknown: unknown };
      },
      note: function (unknown) { $("bcnote").innerHTML = unknown.length ? '<div class="msg err" style="margin-top:8px">' + esc(t("找不到这些账号：", "Not found: ") + unknown.join(", ")) + "</div>" : ""; }
    });
    $("bcreason").addEventListener("input", function () { bcState.reason = this.value; });
    $("bcadd").addEventListener("click", function () {
      var list = bcState.chips.map(function (c) { return c.key; });
      if (!list.length) { $("bcnote").innerHTML = '<div class="msg err" style="margin-top:8px">' + esc(t("请先选择要加入名单的账号。", "Choose the accounts first.")) + "</div>"; return; }
      var b = $("bcadd"); savingButton(b);
      (async function () {
        var failed = [];
        for (var i = 0; i < list.length; i++) { var r = await post("calendar", "POST", { op: "optout", upn: list[i], on: true, reason: bcState.reason }); if (!r.ok) failed.push(list[i] + " — " + errText(r)); }
        restoreButton(b);
        bcState.chips = failed.length ? bcState.chips.filter(function (c) { return failed.some(function (f) { return f.indexOf(c.key + " — ") === 0; }); }) : [];
        if (!failed.length) bcState.reason = "";
        await bcLoad();
        if (failed.length) bcMsg(failed.join("\n"), true); else flashOk(t("已加入名单。", "Added to the list."));
      })();
    });
    $("bctable").addEventListener("click", function (e) {
      var b = e.target.closest("[data-bcrm]"); if (!b) return;
      savingButton(b);
      post("calendar", "POST", { op: "optout", upn: b.getAttribute("data-bcrm"), on: false }).then(function (r) {
        if (!r.ok) { restoreButton(b); bcMsg(errText(r), true); return; }
        bcLoad().then(function () { flashOk(t("已移出名单。", "Removed from the list.")); });
      });
    });
  }
