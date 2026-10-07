// management/src/50-institutions.js — 经营 › 机构 (partnership stage, type, region).
// Part of management.js: scripts/build-management.js concatenates management/src/*.js in name order
// into management/management.js (one closure; every part sees every other's functions). Edit here, not the built file.

  // ================================================================================
  // 经营 › 机构 (phase 3): one row per school — partnership stage, accounts, customers,
  // this school year's sales. The partnership director sets the stage and a note.
  // ================================================================================
  var REGION_L = { cn: ["中国大陆", "Mainland China"], "intl-cn": ["中国国际学校", "International schools in China"], africa: ["非洲", "Africa"], "south-america": ["南美", "South America"], other: ["其他", "Other"] };
  var STAGES_P = { contact: ["接触", "Contact", ""], trial: ["试用", "Trial", "accent"], partner: ["合作", "Partner", "ok"], paused: ["暂停", "Paused", "muted"] };
  var instState = { data: null, q: "" };
  function pstTag(st) { var d = STAGES_P[st]; return d ? '<span class="tag ' + d[2] + '">' + esc(t(d[0], d[1])) + "</span>" : '<span class="muted">—</span>'; }
  function viewInstitutionsCrm() {
    setTitle(t("经营 › 机构", "Operations › Institutions"), t("机构", "Institutions"), '<button class="btn secondary sm" id="iReload">' + t("刷新", "Refresh") + "</button>",
      { info: t("每所学校 / 蜂巢一行：合作阶段、账号数与活跃、其中的 Equip 客户与本学年购买、讲座线索、家庭数。合作阶段和备注由合作发展总监维护；数字来自人员库，每次同步后更新。", "One row per school or hive: partnership stage, accounts and active ones, the Equip customers among them and this school year's purchases, seminar leads, families. The partnership director keeps the stage and note; the numbers come from the people hub after each sync.") });
    $("content").innerHTML = '<div class="toolbar"><div class="search">' + ICON.search + '<input type="search" id="iq" value="' + esc(instState.q) + '" placeholder="' + t("搜索机构、域名…", "Search institution, domain…") + '" /></div></div><div class="kpis" id="ikpi"></div><div class="tbl-wrap"><table class="data fixed" id="itable"><colgroup><col style="width:24%"><col style="width:10%"><col style="width:9%"><col style="width:9%"><col style="width:9%"><col style="width:13%"><col style="width:9%"><col style="width:9%"><col style="width:8%"></colgroup><thead><tr><th>' + t("机构", "Institution") + "</th><th>" + t("合作阶段", "Stage") + '</th><th class="num">' + t("账号", "Accounts") + '</th><th class="num">' + t("活跃", "Active") + '</th><th class="num">' + t("客户", "Customers") + '</th><th class="num">' + t("本学年销售", "SY sales") + '</th><th class="num">' + t("讲座线索", "Leads") + '</th><th class="num">' + t("家庭", "Families") + '</th><th class="num">' + t("课程订单", "Course orders") + '</th></tr></thead><tbody><tr><td colspan="9" class="loading">' + t("载入中…", "Loading…") + '</td></tr></tbody></table></div><p class="muted" id="ifoot" style="font-size:.8rem"></p>';
    $("iq").addEventListener("input", debounce(function () { instState.q = $("iq").value.trim(); renderInstitutionsCrm(); }, 120));
    $("iReload").addEventListener("click", function () { loadInstitutionsCrm(true).then(renderInstitutionsCrm); });
    $("itable").addEventListener("click", function (e) { var tr = e.target.closest("tr[data-domain]"); if (!tr) return; document.querySelectorAll("table.data tr.sel").forEach(function (x) { x.classList.remove("sel"); }); tr.classList.add("sel"); openInstitutionPanel(tr.getAttribute("data-domain")); });
    loadInstitutionsCrm(false).then(renderInstitutionsCrm).catch(function (r) { $("itable").tBodies[0].innerHTML = '<tr><td colspan="9" class="loading">' + esc(errText(r)) + "</td></tr>"; });
  }
  function loadInstitutionsCrm(force) { if (instState.data && !force) return Promise.resolve(instState.data); return api("crm/institutions").then(function (r) { if (!r.ok) throw r; instState.data = r.body; return r.body; }); }
  function instName(row) { return (EN ? (row.nameEn || row.name) : (row.name || row.nameEn)) || row.domain; }
  function renderInstitutionsCrm() {
    var d = instState.data; if (!d || !$("itable")) return;
    var q = instState.q.toLowerCase(), rows = d.rows.filter(function (r) { return !q || (r.domain + " " + r.name + " " + r.nameEn).toLowerCase().indexOf(q) >= 0; });
    var seeMoney = crmLevel("money") !== "none";
    var byStage = {}; d.rows.forEach(function (r) { var st = r.partner && r.partner.stage; if (st) byStage[st] = (byStage[st] || 0) + 1; });
    $("ikpi").innerHTML = statTile(t("机构", "Institutions"), fmtNum(d.rows.length), { sub: Object.keys(STAGES_P).map(function (k) { return t(STAGES_P[k][0], STAGES_P[k][1]) + " " + (byStage[k] || 0); }).join(" · ") }) +
      statTile(t("账号", "Accounts"), fmtNum(d.rows.reduce(function (a, r) { return a + r.accounts; }, 0)), { sub: t("90 天内活跃 ", "active in 90 days ") + fmtNum(d.rows.reduce(function (a, r) { return a + r.active; }, 0)) }) +
      statTile(t("Equip 客户", "Equip customers"), fmtNum(d.rows.reduce(function (a, r) { return a + r.customers; }, 0)), { sub: t("本学年购买 ", "bought this SY ") + fmtNum(d.rows.reduce(function (a, r) { return a + r.fyOrders; }, 0)) + t(" 单", " orders") }) +
      (seeMoney ? statTile(fyLabel(d.fy) + " · " + t("教材销售", "textbook sales"), fmtMoney(d.rows.reduce(function (a, r) { return a + (r.fySales || 0); }, 0)), { sub: t("有 Teams 账号的客户的订单", "orders by customers with a Teams account") }) : "");
    $("itable").tBodies[0].innerHTML = rows.length ? rows.map(function (r) {
      return '<tr class="pick" data-domain="' + esc(r.domain) + '"><td class="ell"><b>' + esc(instName(r)) + '</b><span class="sub">' + esc(r.domain) + "</span></td><td>" + pstTag(r.partner && r.partner.stage) + '</td><td class="num">' + fmtNum(r.accounts) + '</td><td class="num">' + fmtNum(r.active) + '</td><td class="num">' + fmtNum(r.customers) + '</td><td class="num">' + (seeMoney ? fmtMoney(r.fySales || 0) : fmtNum(r.fyOrders) + t(" 单", " orders")) + '</td><td class="num">' + fmtNum(r.leads) + '</td><td class="num">' + fmtNum(r.families) + '</td><td class="num">' + fmtNum(r.hiveOrders) + "</td></tr>";
    }).join("") : '<tr><td colspan="9" class="empty">' + t("没有机构。机构来自人员库：各学校的目录缓存要先同步（本域管理 › 用户 › 同步），然后在人员库点「重新匹配」或在这里点「刷新」。", "No institutions. They come from the people hub: sync each school's directory first (My domain › Users › Sync), then Rebuild in the People Hub or Refresh here.") + "</td></tr>";
    $("ifoot").textContent = (d.generatedAt ? t("数据来自人员库，匹配于 ", "From the people hub, matched ") + when(d.generatedAt) : "") + (seeMoney ? "" : " · " + t("金额按角色隐藏", "Amounts hidden for this role"));
  }
  function openInstitutionPanel(domain) {
    var d = instState.data, r = d && d.rows.filter(function (x) { return x.domain === domain; })[0]; if (!r) return;
    var pt = r.partner || {}, seeMoney = crmLevel("money") !== "none";
    panelOpen('<div class="ph"><span class="tav" style="background:' + hue(domain) + '">' + esc(initials(instName(r))) + "</span><h3>" + esc(instName(r)) + "</h3>" + pstTag(pt.stage) + '<button class="x" type="button" aria-label="close">✕</button></div><div class="pb">' +
      '<div class="kv"><span class="k">' + t("域名", "Domain") + "</span><span>" + esc(r.domain) + "</span>" +
        '<span class="k">' + t("账号", "Accounts") + "</span><span>" + fmtNum(r.accounts) + t(" · 活跃 ", " · active ") + fmtNum(r.active) + "</span>" +
        '<span class="k">' + t("客户", "Customers") + "</span><span>" + fmtNum(r.customers) + t(" · 买过 ", " · bought ") + fmtNum(r.buyers) + t(" · 家庭 ", " · families ") + fmtNum(r.families) + "</span>" +
        '<span class="k">' + fyLabel(d.fy) + "</span><span>" + fmtNum(r.fyOrders) + t(" 单", " orders") + (seeMoney ? " · " + fmtMoney(r.fySales || 0) : "") + "</span>" +
        (seeMoney ? '<span class="k">' + t("累计销售", "All-time sales") + "</span><span>" + fmtMoney(r.spend || 0) + "</span>" : "") +
        '<span class="k">' + t("讲座线索", "Leads") + "</span><span>" + fmtNum(r.leads) + "</span></div>" +
      "<h4>" + t("合作", "Partnership") + "</h4>" +
      (d.canEdit ? '<form id="ipf"><div class="grid2"><label class="f">' + t("类型", "Type") + '<select id="ipType"><option value="">' + t("未设置", "Not set") + "</option>" + [["school", "学校", "School"], ["hive", "蜂巢", "Hive"], ["publisher", "出版社", "Publisher"], ["distributor", "分销伙伴", "Distribution partner"]].map(function (x) { return '<option value="' + x[0] + '"' + (pt.type === x[0] ? " selected" : "") + ">" + t(x[1], x[2]) + "</option>"; }).join("") + '</select></label><label class="f">' + t("地区", "Region") + '<select id="ipRegion"><option value="">' + t("未设置", "Not set") + "</option>" + Object.keys(REGION_L).map(function (k) { return '<option value="' + k + '"' + (pt.region === k ? " selected" : "") + ">" + t(REGION_L[k][0], REGION_L[k][1]) + "</option>"; }).join("") + '</select></label></div><label class="f">' + t("阶段", "Stage") + '<select id="ipStage"><option value="">' + t("未设置", "Not set") + "</option>" + Object.keys(STAGES_P).map(function (k) { return '<option value="' + k + '"' + (pt.stage === k ? " selected" : "") + ">" + esc(t(STAGES_P[k][0], STAGES_P[k][1])) + "</option>"; }).join("") + '</select></label><label class="f">' + t("负责人", "Owner") + '<input type="text" id="ipOwner" maxlength="120" value="' + esc(pt.owner || "") + '" /></label><label class="f">' + t("备注", "Note") + '<textarea id="ipNote" rows="3" maxlength="500">' + esc(pt.note || "") + '</textarea></label><div class="actions"><button class="btn sm" type="submit" id="ipSave">' + t("保存", "Save") + '</button><span class="muted" style="font-size:12px">' + (pt.at ? esc(t("上次 ", "last ") + day(pt.at) + (pt.by ? " · " + pt.by : "")) : "") + '</span></div><div id="ipMsg"></div></form>' :
        '<div class="kv"><span class="k">' + t("阶段", "Stage") + "</span><span>" + pstTag(pt.stage) + '</span><span class="k">' + t("负责人", "Owner") + "</span><span>" + esc(pt.owner || "—") + '</span><span class="k">' + t("备注", "Note") + "</span><span>" + esc(pt.note || "—") + "</span></div>") +
      '<p class="hint">' + t("账号与活跃来自目录缓存；客户与销售来自人员库里挂在这个域名账号上的人。", "Accounts and activity from the directory cache; customers and sales from the people whose Teams account is in this domain.") + "</p></div>");
    var f = $("ipf");
    if (f) f.addEventListener("submit", function (e) {
      e.preventDefault(); var b = $("ipSave"); savingButton(b);
      post("crm/institutions", "POST", { domain: domain, stage: $("ipStage").value, owner: $("ipOwner").value.trim(), note: $("ipNote").value.trim(), type: $("ipType").value, region: $("ipRegion").value }).then(function (res) {
        restoreButton(b);
        if (!res.ok) { $("ipMsg").innerHTML = '<div class="msg err">' + esc(errText(res)) + "</div>"; return; }
        r.partner = res.body.partner; renderInstitutionsCrm(); savedAndClose(null, t("已保存 ", "Saved ") + "<b>" + esc(instName(r)) + "</b>" + t(" 的合作信息。", "'s partnership."));
      });
    });
  }
