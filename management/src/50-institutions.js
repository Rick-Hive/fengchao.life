// management/src/50-institutions.js — 经营 › 机构 (partnership stage, type, region).
// Part of management.js: scripts/build-management.js concatenates management/src/*.js in name order
// into management/management.js (one closure; every part sees every other's functions). Edit here, not the built file.

  // ================================================================================
  // 经营 › 机构 (phase 3): one row per school — partnership stage, accounts, customers,
  // this school year's sales. The partnership director sets the stage and a note.
  // ================================================================================
  var REGION_L = { cn: ["中国大陆", "Mainland China"], "intl-cn": ["中国国际学校", "International schools in China"], africa: ["非洲", "Africa"], "south-america": ["南美", "South America"], other: ["其他", "Other"] };
  var instState = { data: null, q: "" };
  function viewInstitutionsCrm() {
    setTitle(t("经营 › 机构", "Operations › Institutions"), t("机构", "Institutions"), (crmLevel("partners") === "rw" || isAdmin() ? '<button class="btn secondary sm" id="iSeed">' + t("自动填入合作关系", "Seed relationships") + "</button> " : "") + '<button class="btn secondary sm" id="iReload">' + t("刷新", "Refresh") + "</button>",
      { info: t("每所学校 / 蜂巢 / 大学一行：它的合作关系（按类型与阶段，点开进入合作伙伴页）、账号数与活跃、其中的 Equip 客户与本学年购买、讲座线索、家庭数。标为「内部」的是我们自己，不会生成合作关系。数字来自人员库，每次同步后更新；「自动填入」按租户域名、蜂巢工作区、教师表和出版商生成起始关系，只新增不覆盖。", "One row per school, hive or university: its relationships (type and stage, opening the Partners page), accounts and active ones, the Equip customers among them and this school year's purchases, seminar leads, families. Rows marked internal are ourselves and never become partners. Numbers come from the people hub after each sync; Seed creates starting relationships from tenant domains, the Hive workspace, the Teachers table and the publishers — adding only, never overwriting.") });
    $("content").innerHTML = '<div class="toolbar"><div class="search">' + ICON.search + '<input type="search" id="iq" value="' + esc(instState.q) + '" placeholder="' + t("搜索机构、域名…", "Search institution, domain…") + '" /></div></div><div class="kpis strip" id="ikpi"></div><div class="tbl-wrap"><table class="data fixed" id="itable"><colgroup><col style="width:24%"><col style="width:10%"><col style="width:9%"><col style="width:9%"><col style="width:9%"><col style="width:13%"><col style="width:9%"><col style="width:9%"><col style="width:8%"></colgroup><thead><tr><th>' + t("机构", "Institution") + "</th><th>" + t("合作关系", "Relationships") + '</th><th class="num">' + t("账号", "Accounts") + '</th><th class="num">' + t("活跃", "Active") + '</th><th class="num">' + t("客户", "Customers") + '</th><th class="num">' + t("本学年销售", "SY sales") + '</th><th class="num">' + t("讲座线索", "Leads") + '</th><th class="num">' + t("家庭", "Families") + '</th><th class="num">' + t("课程订单", "Course orders") + '</th></tr></thead><tbody><tr><td colspan="9" class="loading">' + t("载入中…", "Loading…") + '</td></tr></tbody></table></div><p class="muted" id="ifoot" style="font-size:.8rem"></p>';
    $("iq").addEventListener("input", debounce(function () { instState.q = $("iq").value.trim(); renderInstitutionsCrm(); }, 120));
    // 刷新 rebuilds on the server: the tenant's directories + the Hive workspace's Schools table, live (Rick, 2026-10-08).
    $("iReload").addEventListener("click", function () {
      var b = $("iReload"); savingButton(b, t("正在汇总…", "Rebuilding…"));
      api("crm/institutions?rebuild=1").then(function (r) {
        restoreButton(b);
        if (!r.ok) { flash(esc(errText(r)), 10000); return; }
        instState.data = r.body; renderInstitutionsCrm();
        flashOk(esc(t("已重新汇总：", "Rebuilt: ") + r.body.rows.length + t(" 个机构，其中蜂巢工作区 ", " institutions, ") + (r.body.hiveRows || 0) + t(" 个", " from the Hive workspace")), 8000);
      });
    });
    if ($("iSeed")) $("iSeed").addEventListener("click", function () {
      var b = $("iSeed"); savingButton(b, t("填入中…", "Seeding…"));
      post("crm/partners-seed", "POST", {}).then(function (r) {
        restoreButton(b);
        if (!r.ok) { flash(esc(errText(r)), 10000); return; }
        var b = r.body, extra = (b.renamed ? t("，改名 ", ", renamed ") + b.renamed : "") + (b.filed ? t("，教师归档 ", ", teachers filed ") + b.filed : "") + (b.unnamed ? t("；", "; ") + b.unnamed + t(" 家出版社在 Equip 副本里仍只有编号，未建关系（先同步 Equip）", " publishers still numbered in the Equip copy, not created (sync Equip first)") : "");
        flashOk(esc(t("自动填入：新建 ", "Seeded: ") + b.created.length + t(" 条关系，排除 ", " relationships, excluded ") + b.excluded.length + t(" 个内部机构，已有 ", " internal, already there ") + (b.skipped - (b.unnamed || 0)) + extra), b.unnamed ? 15000 : 8000);
        loadInstitutionsCrm(true).then(renderInstitutionsCrm);
      });
    });
    $("itable").addEventListener("click", function (e) { var a = e.target.closest("a[data-relgo]"); if (a) return; var tr = e.target.closest("tr[data-key]"); if (!tr) return; document.querySelectorAll("table.data tr.sel").forEach(function (x) { x.classList.remove("sel"); }); tr.classList.add("sel"); openInstitutionPanel(tr.getAttribute("data-key")); });
    loadInstitutionsCrm(false).then(renderInstitutionsCrm).catch(function (r) { $("itable").tBodies[0].innerHTML = '<tr><td colspan="9" class="loading">' + esc(errText(r)) + "</td></tr>"; });
  }
  function loadInstitutionsCrm(force) { if (instState.data && !force) return Promise.resolve(instState.data); return api("crm/institutions").then(function (r) { if (!r.ok) throw r; instState.data = r.body; return r.body; }); }
  function instName(row) { return (EN ? (row.nameEn || row.name) : (row.name || row.nameEn)) || row.domain; }
  function renderInstitutionsCrm() {
    var d = instState.data; if (!d || !$("itable")) return;
    var q = instState.q.toLowerCase(), rows = d.rows.filter(function (r) { return !q || (r.domain + " " + r.name + " " + r.nameEn + " " + (r.abbr || "") + " " + (r.type || "") + " " + (r.country || "") + " " + (r.city || "")).toLowerCase().indexOf(q) >= 0; });
    var seeMoney = crmLevel("money") !== "none";
    var withRel = d.rows.filter(function (r) { return (r.rels || []).some(function (x) { return !x.closed; }); }).length, internal = d.rows.filter(function (r) { return r.internal; }).length;
    var kinds = { tenant: 0, hive: 0, both: 0 }; d.rows.forEach(function (r) { kinds[r.kind || "tenant"] = (kinds[r.kind || "tenant"] || 0) + 1; });
    $("ikpi").innerHTML = statTile(t("机构", "Institutions"), fmtNum(d.rows.length), { sub: t("租户 ", "tenant ") + (kinds.tenant + kinds.both) + t(" · 蜂巢工作区 ", " · Hive workspace ") + (kinds.hive + kinds.both) + t(" · 有合作关系 ", " · with relationships ") + withRel + (internal ? t(" · 内部 ", " · internal ") + internal : "") }) +
      statTile(t("账号", "Accounts"), fmtNum(d.rows.reduce(function (a, r) { return a + r.accounts; }, 0)), { sub: t("90 天内活跃 ", "active in 90 days ") + fmtNum(d.rows.reduce(function (a, r) { return a + r.active; }, 0)) }) +
      statTile(t("Equip 客户", "Equip customers"), fmtNum(d.rows.reduce(function (a, r) { return a + r.customers; }, 0)), { sub: t("本学年购买 ", "bought this SY ") + fmtNum(d.rows.reduce(function (a, r) { return a + r.fyOrders; }, 0)) + t(" 单", " orders") }) +
      (seeMoney ? statTile(fyLabel(d.fy) + " · " + t("教材销售", "textbook sales"), fmtMoney(d.rows.reduce(function (a, r) { return a + (r.fySales || 0); }, 0)), { sub: t("有 Teams 账号的客户的订单", "orders by customers with a Teams account") }) : "");
    $("itable").tBodies[0].innerHTML = rows.length ? rows.map(function (r) {
      return '<tr class="pick" data-key="' + esc(r.key || r.domain) + '"><td class="ell"><b>' + esc(instName(r)) + "</b>" + (r.internal ? ' <span class="tag muted">' + t("内部", "internal") + "</span>" : "") + '<span class="sub">' + esc(instSub(r)) + "</span></td><td>" + relBadges(r, d) + '</td><td class="num">' + fmtNum(r.accounts) + '</td><td class="num">' + fmtNum(r.active) + '</td><td class="num">' + fmtNum(r.customers) + '</td><td class="num">' + (seeMoney ? fmtMoney(r.fySales || 0) : fmtNum(r.fyOrders) + t(" 单", " orders")) + '</td><td class="num">' + fmtNum(r.leads) + '</td><td class="num">' + fmtNum(r.families) + '</td><td class="num">' + fmtNum(r.hiveOrders) + "</td></tr>";
    }).join("") : '<tr><td colspan="9" class="empty">' + t("没有机构。机构来自人员库：各学校的目录缓存要先同步（本域管理 › 用户 › 同步），然后在人员库点「重新匹配」或在这里点「刷新」。", "No institutions. They come from the people hub: sync each school's directory first (My domain › Users › Sync), then Rebuild in the People Hub or Refresh here.") + "</td></tr>";
    $("ifoot").textContent = (d.generatedAt ? t("数据来自人员库，匹配于 ", "From the people hub, matched ") + when(d.generatedAt) : "") + (seeMoney ? "" : " · " + t("金额按角色隐藏", "Amounts hidden for this role"));
  }
  // Under the name: the tenant domain, and / or where the Hive workspace row says it is and what it is.
  function instSub(r) {
    var bits = [];
    if (r.domain) bits.push(r.domain);
    if (r.type) bits.push(r.type);
    if (r.country || r.city) bits.push([r.city, r.country].filter(Boolean).join(", "));
    if (r.kind === "hive") bits.push(t("蜂巢工作区", "Hive workspace"));
    return bits.join(" · ");
  }
  // The organization's relationships as badges (type · stage), each a link to the partner page.
  function relBadges(r, d) {
    var rs = (r.rels || []).filter(function (x) { return !x.closed; });
    if (!rs.length) return '<span class="muted">—</span>';
    return '<div class="tags">' + rs.map(function (x) { var ty = d.types && d.types[x.type], st = d.stageLabels && d.stageLabels[x.type] && d.stageLabels[x.type][x.stage]; return '<a class="tag accent" data-relgo="1" href="#/ops/partners/' + x.type + "/" + x.id + '">' + esc((ty ? t(ty.zh, ty.en) : x.type) + " · " + (st ? t(st[0], st[1]) : x.stage)) + "</a>"; }).join("") + "</div>";
  }
  function openInstitutionPanel(key) {
    var d = instState.data, r = d && d.rows.filter(function (x) { return (x.key || x.domain) === key; })[0]; if (!r) return;
    var domain = key;
    var seeMoney = crmLevel("money") !== "none";
    panelOpen('<div class="ph"><span class="tav" style="background:' + hue(domain) + '">' + esc(initials(instName(r))) + "</span><h3>" + esc(instName(r)) + "</h3>" + (r.internal ? '<span class="tag muted">' + t("内部", "internal") + "</span>" : "") + '<button class="x" type="button" aria-label="close">✕</button></div><div class="pb">' +
      '<div class="kv">' + (r.domain ? '<span class="k">' + t("域名", "Domain") + "</span><span>" + esc(r.domain) + "</span>" : "") +
        (r.kind !== "tenant" ? '<span class="k">' + t("蜂巢工作区", "Hive workspace") + "</span><span>" + esc([r.abbr, r.type, [r.city, r.country].filter(Boolean).join(", ")].filter(Boolean).join(" · ") || t("已登记", "listed")) + (r.website ? ' · <a href="' + esc(/^https?:/.test(r.website) ? r.website : "https://" + r.website) + '" target="_blank" rel="noopener">' + t("网站 ↗", "website ↗") + "</a>" : "") + (r.courses ? " · " + fmtNum(r.courses) + t(" 门课程", " courses") : "") + "</span>" : "") +
        '<span class="k">' + t("账号", "Accounts") + "</span><span>" + fmtNum(r.accounts) + t(" · 活跃 ", " · active ") + fmtNum(r.active) + "</span>" +
        '<span class="k">' + t("客户", "Customers") + "</span><span>" + fmtNum(r.customers) + t(" · 买过 ", " · bought ") + fmtNum(r.buyers) + t(" · 家庭 ", " · families ") + fmtNum(r.families) + "</span>" +
        '<span class="k">' + fyLabel(d.fy) + "</span><span>" + fmtNum(r.fyOrders) + t(" 单", " orders") + (seeMoney ? " · " + fmtMoney(r.fySales || 0) : "") + "</span>" +
        (seeMoney ? '<span class="k">' + t("累计销售", "All-time sales") + "</span><span>" + fmtMoney(r.spend || 0) + "</span>" : "") +
        '<span class="k">' + t("讲座线索", "Leads") + "</span><span>" + fmtNum(r.leads) + "</span></div>" +
      "<h4>" + t("合作关系", "Relationships") + " · " + (r.rels || []).length + '</h4><div class="olist">' + ((r.rels || []).length ? r.rels.map(function (x) { var ty = d.types && d.types[x.type], st = d.stageLabels && d.stageLabels[x.type] && d.stageLabels[x.type][x.stage]; return '<a class="orow link" href="#/ops/partners/' + x.type + "/" + x.id + '"><div class="omain"><b>' + esc(ty ? t(ty.zh, ty.en) : x.type) + '</b><span class="sub">' + esc(x.id + (x.owner ? " · " + x.owner.split("@")[0] : "")) + '</span></div><span class="tag ' + (x.closed ? "muted" : "ok") + '">' + esc(st ? t(st[0], st[1]) : x.stage) + "</span></a>"; }).join("") : '<div class="orow muted">' + (r.internal ? t("内部机构，不建合作关系。", "Internal — no relationships.") : t("还没有合作关系。", "No relationships yet.")) + "</div>") + "</div>" +
      (d.canEdit ? '<div class="actions">' + (r.internal ? "" : '<a class="btn sm" href="#/ops/partners/' + (r.type && /大学|university|college/i.test(r.type) ? "university" : r.domain ? "it" : "course") + '">' + t("到合作伙伴页新建…", "New on the Partners page…") + "</a>") + '<label class="inline"><input type="checkbox" id="ipInternal"' + (r.internal ? " checked" : "") + " /> " + t("内部机构（我们自己，不生成合作关系）", "Internal (ourselves; never a partner)") + "</label></div>" : "") +
      '<p class="hint">' + t("账号与活跃来自目录缓存；客户与销售来自人员库里挂在这个域名账号上的人。", "Accounts and activity from the directory cache; customers and sales from the people whose Teams account is in this domain.") + "</p></div>");
    var ck = $("ipInternal");
    if (ck) ck.addEventListener("change", function () {
      post("crm/institutions", "POST", { key: domain, internal: ck.checked }).then(function (res) {
        if (!res.ok) { flash(esc(errText(res)), 6000); ck.checked = !ck.checked; return; }
        r.internal = res.body.internal; renderInstitutionsCrm(); flashOk(esc(t("已保存。", "Saved.")), 2500);
      });
    });
  }
