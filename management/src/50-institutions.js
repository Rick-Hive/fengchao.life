// management/src/50-institutions.js — 经营 › 机构 (partnership stage, type, region).
// Part of management.js: scripts/build-management.js concatenates management/src/*.js in name order
// into management/management.js (one closure; every part sees every other's functions). Edit here, not the built file.

  // ================================================================================
  // 经营 › 机构 (phase 3): one row per school — partnership stage, accounts, customers,
  // this school year's sales. The partnership director sets the stage and a note.
  // ================================================================================
  var REGION_L = { cn: ["中国大陆", "Mainland China"], "intl-cn": ["中国国际学校", "International schools in China"], africa: ["非洲", "Africa"], "south-america": ["南美", "South America"], other: ["其他", "Other"] };
  // 机构名称 merged in (Rick 2026-10-21: 「机构名称和机构总感觉有些重复……可否合并到同一个页面中管理？」): one page per
  // institution; the system administrator names a tenant domain in its panel (中文 / English), the 名称未填 chip finds the
  // ones still unnamed, and a verified domain with no accounts synced yet is listed too so it can be named.
  var instState = { data: null, q: "", noname: false };
  // the rows plus, for the system administrator, every verified domain the people hub has not seen yet
  function instRows() {
    var d = instState.data, rows = (d && d.rows) || [];
    if (!isAdmin()) return rows;
    var have = {}; rows.forEach(function (r) { if (r.domain) have[r.domain] = 1; });
    return rows.concat(((domainsInfo && domainsInfo.domains) || []).filter(function (x) { return !have[x.domain]; }).map(function (x) { return { key: x.domain, domain: x.domain, kind: "tenant", name: x.name || "", nameEn: x.nameEn || "", rels: [], accounts: 0, active: 0, customers: 0, buyers: 0, families: 0, leads: 0, fyOrders: 0, fySales: 0, spend: 0, orders: 0, hiveOrders: 0, bare: true }; }));
  }
  // 合作伙伴 = two tabs (Rick 2026-10-22: 「合作伙伴和机构是否有重叠？」): 合作关系 — what we do with whom (the pipeline);
  // 机构 — who they are (the profile: names, accounts, customers, sales, commission). One sidebar entry.
  function pmTabsHtml(on) {
    return '<div class="pagetabs" id="pmTabs" role="tablist"><a class="ptab' + (on === "rel" ? " on" : "") + '" href="#/ops/partners">' + t("合作关系", "Relationships") + '</a><a class="ptab' + (on === "inst" ? " on" : "") + '" href="#/ops/institutions">' + t("机构", "Institutions") + "</a></div>";
  }
  function instUnnamed(r) { return r.domain && r.kind !== "hive" && !(r.name || "").trim() && !(r.nameEn || "").trim(); }
  function viewInstitutionsCrm() {
    var openKey = (/^#\/ops\/institutions\/(.+)$/.exec(location.hash) || [])[1]; openKey = openKey ? decodeURIComponent(openKey) : "";
    setTitle(t("经营 › 合作伙伴", "Operations › Partners"), t("机构", "Institutions"), '<button class="btn secondary sm" id="iReload">' + t("刷新", "Refresh") + "</button>",
      { info: t("每所学校 / 蜂巢 / 大学一行：它的合作关系（按类型与阶段，点开进入合作伙伴页）、账号数与活跃、其中的 Equip 客户与本学年购买、家庭数、蜂巢课程的佣金收入。标为「内部」的是我们自己，不会生成合作关系。数字来自人员库，每次同步后更新。在机构面板里可以直接为它新建合作关系。", "One row per school, hive or university: its relationships (type and stage, opening the relationship), accounts and active ones, the Equip customers among them and this school year's purchases, families, Hive course commission. Rows marked internal are ourselves and never become partners. Numbers come from the people hub after each sync. A new relationship for it starts from its panel.") });
    $("content").innerHTML = pmTabsHtml("inst") + '<div class="toolbar"><div class="search">' + ICON.search + '<input type="search" id="iq" value="' + esc(instState.q) + '" placeholder="' + t("搜索机构、域名…", "Search institution, domain…") + '" /></div></div><div class="kpis strip" id="ikpi"></div><div class="tbl-wrap"><table class="data fixed" id="itable"><colgroup><col style="width:24%"><col style="width:12%"><col style="width:8%"><col style="width:8%"><col style="width:8%"><col style="width:12%"><col style="width:8%"><col style="width:9%"><col style="width:11%"></colgroup><thead><tr><th>' + t("机构", "Institution") + "</th><th>" + t("合作关系", "Relationships") + '</th><th class="num">' + t("账号", "Accounts") + '</th><th class="num">' + t("活跃", "Active") + '</th><th class="num">' + t("客户", "Customers") + '</th><th class="num">' + t("本学年销售", "SY sales") + '</th><th class="num">' + t("家庭", "Families") + '</th><th class="num" title="' + esc(t("这个机构的人下的蜂巢课程订单数（买方）", "Hive course orders placed by this institution's people (buyer side)")) + '">' + t("课程订单", "Course orders") + '</th><th class="num" title="' + esc(t("本学年作为课程提供方、已收款订单的蜂巢佣金合计；不计入教材销售", "This school year's Hive commission on paid orders this institution delivers as a provider; never added to textbook sales")) + '">' + t("蜂巢佣金收入", "Hive commission") + '</th></tr></thead><tbody><tr><td colspan="9" class="loading">' + t("载入中…", "Loading…") + '</td></tr></tbody></table></div><p class="muted" id="ifoot" style="font-size:.8rem"></p>';
    $("iq").addEventListener("input", debounce(function () { instState.q = $("iq").value.trim(); renderInstitutionsCrm(); }, 120));
    var tb = $("iq").closest(".toolbar"); if (tb) { tb.insertAdjacentHTML("beforeend", '<button type="button" class="chip" id="iNoName" aria-pressed="false" hidden>' + t("名称未填", "Unnamed") + ' <span class="cnt">0</span></button>'); $("iNoName").addEventListener("click", function () { instState.noname = !instState.noname; renderInstitutionsCrm(); }); }
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
    $("itable").addEventListener("click", function (e) { var a = e.target.closest("a[data-relgo]"); if (a) return; var tr = e.target.closest("tr[data-key]"); if (!tr) return; document.querySelectorAll("table.data tr.sel").forEach(function (x) { x.classList.remove("sel"); }); tr.classList.add("sel"); openInstitutionPanel(tr.getAttribute("data-key")); });
    loadInstitutionsCrm(false).then(function () { renderInstitutionsCrm(); if (openKey) openInstitutionPanel(openKey); }).catch(function (r) { $("itable").tBodies[0].innerHTML = '<tr><td colspan="9" class="loading">' + esc(errText(r)) + "</td></tr>"; });
  }
  // 自动填入合作关系 — the 合作关系 tab's button since the two pages became one entry (2026-10-22)
  function partnersSeed(b, after) {
      savingButton(b, t("填入中…", "Seeding…"));
      post("crm/partners-seed", "POST", {}).then(function (r) {
        restoreButton(b);
        if (!r.ok) { flash(esc(errText(r)), 10000); return; }
        // `res`, not `b`: a hoisted `var b` here left restoreButton(b) with undefined and
        // the button stuck at 填入中… (Rick, 2026-10-09: 点击后就冻住了).
        var res = r.body, extra = (res.renamed ? t("，改名 ", ", renamed ") + res.renamed : "") + (res.filed ? t("，教师归档 ", ", teachers filed ") + res.filed : "") + (res.unnamed ? t("；", "; ") + res.unnamed + t(" 家出版社在 Equip 副本里仍只有编号，未建关系（先同步 Equip）", " publishers still numbered in the Equip copy, not created (sync Equip first)") : "");
        flashOk(esc(t("自动填入：新建 ", "Seeded: ") + res.created.length + t(" 条关系，排除 ", " relationships, excluded ") + res.excluded.length + t(" 个内部机构，已有 ", " internal, already there ") + (res.skipped - (res.unnamed || 0)) + extra), res.unnamed ? 15000 : 8000);
        if (after) after();
      });
  }
  function loadInstitutionsCrm(force) { if (instState.data && !force) return Promise.resolve(instState.data); return api("crm/institutions").then(function (r) { if (!r.ok) throw r; instState.data = r.body; return r.body; }); }
  function instName(row) { return (EN ? (row.nameEn || row.name) : (row.name || row.nameEn)) || row.domain; }
  function renderInstitutionsCrm() {
    var d = instState.data; if (!d || !$("itable")) return;
    var all = instRows(), unnamed = all.filter(instUnnamed).length;
    if ($("iNoName")) { $("iNoName").setAttribute("aria-pressed", String(instState.noname)); $("iNoName").querySelector(".cnt").textContent = unnamed; $("iNoName").hidden = !isAdmin(); }
    var q = instState.q.toLowerCase(), rows = all.filter(function (r) { return (!instState.noname || instUnnamed(r)) && (!q || (r.domain + " " + r.name + " " + r.nameEn + " " + (r.abbr || "") + " " + (r.type || "") + " " + (r.country || "") + " " + (r.city || "")).toLowerCase().indexOf(q) >= 0); });
    var seeMoney = crmLevel("money") !== "none";
    var withRel = d.rows.filter(function (r) { return (r.rels || []).some(function (x) { return !x.closed; }); }).length, internal = d.rows.filter(function (r) { return r.internal; }).length;
    var kinds = { tenant: 0, hive: 0, both: 0 }; d.rows.forEach(function (r) { kinds[r.kind || "tenant"] = (kinds[r.kind || "tenant"] || 0) + 1; });
    $("ikpi").innerHTML = statTile(t("机构", "Institutions"), fmtNum(d.rows.length), { sub: t("租户 ", "tenant ") + (kinds.tenant + kinds.both) + t(" · 蜂巢工作区 ", " · Hive workspace ") + (kinds.hive + kinds.both) + t(" · 有合作关系 ", " · with relationships ") + withRel + (internal ? t(" · 内部 ", " · internal ") + internal : "") }) +
      statTile(t("账号", "Accounts"), fmtNum(d.rows.reduce(function (a, r) { return a + r.accounts; }, 0)), { sub: t("90 天内活跃 ", "active in 90 days ") + fmtNum(d.rows.reduce(function (a, r) { return a + r.active; }, 0)) }) +
      statTile(t("Equip 客户", "Equip customers"), fmtNum(d.rows.reduce(function (a, r) { return a + r.customers; }, 0)), { sub: t("本学年购买 ", "bought this SY ") + fmtNum(d.rows.reduce(function (a, r) { return a + r.fyOrders; }, 0)) + t(" 单", " orders") }) +
      (seeMoney ? statTile(fyLabel(d.fy) + " · " + t("教材销售", "textbook sales"), fmtMoney(d.rows.reduce(function (a, r) { return a + (r.fySales || 0); }, 0)), { sub: t("有 Teams 账号的客户的订单", "orders by customers with a Teams account") }) : "") +
      // 蜂巢课程 (2026-10-21): the providers' course orders and Hive's commission income — apart from the textbook sales
      (seeMoney ? statTile(fyLabel(d.fy) + " · " + t("蜂巢佣金收入", "Hive commission income"), fmtMoney(d.rows.reduce(function (a, r) { return a + (r.commission || 0); }, 0)), { sub: t("课程订单额 ", "course orders ") + fmtMoney(d.rows.reduce(function (a, r) { return a + (r.courseValue || 0); }, 0)) + t("（目录价，未取消）", " (list price, live)") }) : "");
    $("itable").tBodies[0].innerHTML = rows.length ? rows.map(function (r) {
      return '<tr class="pick" data-key="' + esc(r.key || r.domain) + '"><td class="ell"><b>' + esc(instName(r)) + "</b>" + (r.internal ? ' <span class="tag muted">' + t("内部", "internal") + "</span>" : "") + '<span class="sub">' + esc(instSub(r)) + "</span></td><td>" + relBadges(r, d) + '</td><td class="num">' + fmtNum(r.accounts) + '</td><td class="num">' + fmtNum(r.active) + '</td><td class="num">' + fmtNum(r.customers) + '</td><td class="num">' + (seeMoney ? fmtMoney(r.fySales || 0) : fmtNum(r.fyOrders) + t(" 单", " orders"))  + '</td><td class="num">' + fmtNum(r.families) + '</td><td class="num">' + fmtNum(r.hiveOrders) + '</td><td class="num">' + (r.provider && r.commission != null ? fmtMoney(r.commission) : '<span class="faint">—</span>') + "</td></tr>";
    }).join("") : '<tr><td colspan="9" class="empty">' + t("没有机构。机构来自人员库：各学校的目录缓存要先同步（学校管理 › 用户 › 同步），然后在人员库点「重新匹配」或在这里点「刷新」。", "No institutions. They come from the people hub: sync each school's directory first (School administration › Users › Sync), then Rebuild in the People Hub or Refresh here.") + "</td></tr>";
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
    var d = instState.data, r = d && instRows().filter(function (x) { return (x.key || x.domain) === key; })[0]; if (!r) return;
    var domain = key;
    var seeMoney = crmLevel("money") !== "none";
    panelOpen('<div class="ph"><span class="tav" style="background:' + hue(domain) + '">' + esc(initials(instName(r))) + "</span><h3>" + esc(instName(r)) + "</h3>" + (r.internal ? '<span class="tag muted">' + t("内部", "internal") + "</span>" : "") + '<button class="x" type="button" aria-label="close">✕</button></div><div class="pb">' +
      // 名称 (formerly 系统 › 机构名称): the tenant domain's Chinese and English names, the system administrator's to set
      (r.domain && r.kind !== "hive" && isAdmin() ? '<form id="ipName" class="ipname"><h4>' + t("名称", "Names") + ' <small class="faint">' + t("页面按语言显示其一，缺少时显示另一个", "the page shows its language's, else the other") + '</small></h4><div class="grid2"><label class="f">' + t("中文名称", "Chinese name") + '<input type="text" id="ipZh" maxlength="60" value="' + esc(r.name || "") + '" placeholder="' + t("例如：北京某某学校", "e.g. 北京某某学校") + '" /></label><label class="f">' + t("英文名称", "English name") + '<input type="text" id="ipEn" maxlength="80" value="' + esc(r.nameEn || "") + '" placeholder="e.g. Beijing Example School" /></label></div><div class="actions"><button type="submit" class="btn sm" id="ipSave">' + t("保存名称", "Save names") + "</button></div></form>"
        : r.kind === "hive" ? '<p class="hint">' + t("名称来自 Airtable 学校表。", "The name comes from the Airtable Schools table.") + "</p>" : "") +
      (r.bare ? '<p class="hint">' + t("这个域名还没有同步过账号，所以没有统计数字。", "No accounts of this domain have been synced yet, so there are no figures.") + "</p>" : "") +
      '<div class="kv">' + (r.domain ? '<span class="k">' + t("域名", "Domain") + "</span><span>" + esc(r.domain) + "</span>" : "") +
        (r.kind !== "tenant" ? '<span class="k">' + t("蜂巢工作区", "Hive workspace") + "</span><span>" + esc([r.abbr, r.type, [r.city, r.country].filter(Boolean).join(", ")].filter(Boolean).join(" · ") || t("已登记", "listed")) + (r.website ? ' · <a href="' + esc(/^https?:/.test(r.website) ? r.website : "https://" + r.website) + '" target="_blank" rel="noopener">' + t("网站 ↗", "website ↗") + "</a>" : "") + (r.courses ? " · " + fmtNum(r.courses) + t(" 门课程", " courses") : "") + "</span>" : "") +
        '<span class="k">' + t("账号", "Accounts") + "</span><span>" + fmtNum(r.accounts) + t(" · 活跃 ", " · active ") + fmtNum(r.active) + "</span>" +
        '<span class="k">' + t("客户", "Customers") + "</span><span>" + fmtNum(r.customers) + t(" · 买过 ", " · bought ") + fmtNum(r.buyers) + t(" · 家庭 ", " · families ") + fmtNum(r.families) + "</span>" +
        '<span class="k">' + fyLabel(d.fy) + "</span><span>" + fmtNum(r.fyOrders) + t(" 单", " orders") + (seeMoney ? " · " + fmtMoney(r.fySales || 0) : "") + "</span>" +
        (seeMoney ? '<span class="k">' + t("累计销售", "All-time sales") + "</span><span>" + fmtMoney(r.spend || 0) + "</span>" : "") +
        (r.provider && seeMoney ? '<span class="k">' + t("蜂巢课程（提供方）", "Hive courses (provider)") + "</span><span>" + t("课程订单额 ", "course orders ") + fmtMoney(r.courseValue || 0) + t(" · 蜂巢佣金收入 ", " · Hive commission ") + fmtMoney(r.commission || 0) + "</span>" : "") + "</div>" +
      "<h4>" + t("合作关系", "Relationships") + " · " + (r.rels || []).length + '</h4><div class="olist">' + ((r.rels || []).length ? r.rels.map(function (x) { var ty = d.types && d.types[x.type], st = d.stageLabels && d.stageLabels[x.type] && d.stageLabels[x.type][x.stage]; return '<a class="orow link" href="#/ops/partners/' + x.type + "/" + x.id + '"><div class="omain"><b>' + esc(ty ? t(ty.zh, ty.en) : x.type) + '</b><span class="sub">' + esc(x.id + (x.owner ? " · " + x.owner.split("@")[0] : "")) + '</span></div><span class="tag ' + (x.closed ? "muted" : "ok") + '">' + esc(st ? t(st[0], st[1]) : x.stage) + "</span></a>"; }).join("") : '<div class="orow muted">' + (r.internal ? t("内部机构，不建合作关系。", "Internal — no relationships.") : t("还没有合作关系。", "No relationships yet.")) + "</div>") + "</div>" +
      (d.canEdit ? '<div class="actions">' + (r.internal ? "" : '<select id="ipNewType" class="sm">' + Object.keys(d.types || {}).filter(function (k) { return k !== "developer"; }).map(function (k) { var dflt = r.type && /大学|university|college/i.test(r.type) ? "university" : (r.provider || r.kind !== "tenant") ? "course" : "it"; return '<option value="' + k + '"' + (k === dflt ? " selected" : "") + ">" + esc(t(d.types[k].zh, d.types[k].en)) + "</option>"; }).join("") + '</select> <button type="button" class="btn sm" id="ipNewRel">' + t("新建合作关系", "New relationship") + "</button>") + '<label class="inline"><input type="checkbox" id="ipInternal"' + (r.internal ? " checked" : "") + " /> " + t("内部机构（我们自己，不生成合作关系）", "Internal (ourselves; never a partner)") + "</label></div>" : "") +
      '<p class="hint">' + t("账号与活跃来自目录缓存；客户与销售来自人员库里挂在这个域名账号上的人。", "Accounts and activity from the directory cache; customers and sales from the people whose Teams account is in this domain.") + "</p></div>");
    if ($("ipNewRel")) $("ipNewRel").addEventListener("click", function () { ptState.newFor = { key: r.key || r.domain, name: instName(r) }; panelClose(); location.hash = "#/ops/partners/" + $("ipNewType").value; });
    var nf = $("ipName");
    if (nf) nf.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var b = $("ipSave"), name = $("ipZh").value.trim(), nameEn = $("ipEn").value.trim(); savingButton(b);
      post("domain/institution", "PUT", { domain: r.domain, name: name, nameEn: nameEn }).then(function (res) {
        if (!res.ok) { restoreButton(b); flash(esc(errText(res)), 6000); return; }
        r.name = name; r.nameEn = nameEn; var di = dinfo(r.domain); if (di) { di.name = name; di.nameEn = nameEn; }
        var orig = instState.data.rows.filter(function (x) { return x.domain === r.domain; })[0]; if (orig) { orig.name = name; orig.nameEn = nameEn; }
        restoreButton(b); b.textContent = t("已保存 ✓", "Saved ✓");
        var h3 = $("panel").querySelector(".ph h3"); if (h3) h3.textContent = instName(r);
        renderInstitutionsCrm(); nav();
      });
    });
    var ck = $("ipInternal");
    if (ck) ck.addEventListener("change", function () {
      post("crm/institutions", "POST", { key: domain, internal: ck.checked }).then(function (res) {
        if (!res.ok) { flash(esc(errText(res)), 6000); ck.checked = !ck.checked; return; }
        r.internal = res.body.internal; renderInstitutionsCrm(); flashOk(esc(t("已保存。", "Saved.")), 2500);
      });
    });
  }
