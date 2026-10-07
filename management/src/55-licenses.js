// management/src/55-licenses.js — 经营 › 许可: pools and allocations.
// Part of management.js: scripts/build-management.js concatenates management/src/*.js in name order
// into management/management.js (one closure; every part sees every other's functions). Edit here, not the built file.

  // ================================================================================
  // 经营 › 许可 (phase 5 first cut): licence pools and allocations — the foundation of
  // Hive's own DRM. Pools come from orders (or a publisher's grant), seats go to people
  // or to institutions as child pools; every seat traces back to its source.
  // ================================================================================
  var licState = { data: null };
  function viewLicenses() {
    setTitle(t("经营 › 许可", "Operations › Licences"), t("许可池", "Licence pools"),
      (crmLevel("drm") === "rw" || isAdmin() ? '<button class="btn sm" id="lcNew">' + t("＋ 新建许可池", "+ New pool") + "</button> " : "") + '<button class="btn secondary sm" id="lcReload">' + t("刷新", "Refresh") + "</button>",
      { info: t("许可池 = 某教材的若干份电子授权，有有效期，由 Hive、某机构或分销伙伴持有，来自某张订单。分配给人就是一个座位；分配给机构就生成它的子池，机构再往下分。撤销是反向记录，每一份都能追溯到来源订单。这是自建 DRM 的地基：这里只管数量与归属，加密分发与阅读由下一阶段的 DRM 系统执行。", "A pool is a number of seats of one title, with a validity, held by Hive, an institution or a distribution partner, from one order. Allocating to a person is a seat; allocating to an institution creates its child pool to hand on. Revocation is a reverse record, so every seat traces to its source order. This is the foundation of Hive's own DRM: quantities and ownership here; encrypted delivery and reading come with the DRM system in the next phase.") });
    $("content").innerHTML = '<div class="kpis compact" id="lkpi"></div><div class="tbl-wrap"><table class="data fixed" id="ltable"><colgroup><col style="width:9%"><col style="width:25%"><col style="width:18%"><col style="width:8%"><col style="width:8%"><col style="width:8%"><col style="width:12%"><col style="width:12%"></colgroup><thead><tr><th>' + t("池", "Pool") + "</th><th>" + t("教材", "Title") + "</th><th>" + t("持有方", "Holder") + '</th><th class="num">' + t("份数", "Seats") + '</th><th class="num">' + t("已分配", "Allocated") + '</th><th class="num">' + t("余量", "Balance") + "</th><th>" + t("有效期至", "Valid to") + "</th><th>" + t("来源", "Source") + '</th></tr></thead><tbody><tr><td colspan="8" class="loading">' + t("载入中…", "Loading…") + '</td></tr></tbody></table></div><p class="muted" id="lfoot" style="font-size:.8rem"></p>';
    $("lcReload").addEventListener("click", function () { loadLicenses(true).then(renderLicenses); });
    var nb = $("lcNew"); if (nb) nb.addEventListener("click", function () { openPoolForm(null); });
    $("ltable").addEventListener("click", function (e) { var tr = e.target.closest("tr[data-id]"); if (!tr) return; document.querySelectorAll("table.data tr.sel").forEach(function (x) { x.classList.remove("sel"); }); tr.classList.add("sel"); openPoolPanel(tr.getAttribute("data-id")); });
    loadLicenses(false).then(renderLicenses).catch(function (r) { $("ltable").tBodies[0].innerHTML = '<tr><td colspan="8" class="loading">' + esc(errText(r)) + "</td></tr>"; });
  }
  function loadLicenses(force) { if (licState.data && !force) return Promise.resolve(licState.data); return api("crm/licenses").then(function (r) { if (!r.ok) throw r; licState.data = r.body; return r.body; }); }
  function holderName(h) { if (!h) return "—"; if (h.type === "hive") return t("Hive（自持）", "Hive (own)"); var row = instState.data && instState.data.rows.filter(function (x) { return x.domain === h.domain; })[0]; return (h.name || (row && instName(row)) || h.domain || "—") + (h.type === "partner" ? " · " + t("分销伙伴", "partner") : ""); }
  function renderLicenses() {
    var d = licState.data; if (!d || !$("ltable")) return;
    var sm = d.summary;
    $("lkpi").innerHTML = statTile(t("许可池", "Pools"), fmtNum(sm.pools), { sub: t("根池；子池不重复计", "root pools; child pools not double-counted") }) + statTile(t("份数", "Seats"), fmtNum(sm.seats), { sub: t("已分配 ", "allocated ") + fmtNum(sm.allocated) + t(" · 余量 ", " · balance ") + fmtNum(sm.balance) }) + statTile(t("已有座位的人", "People with a seat"), fmtNum(sm.users), {}) + statTile(t("90 天内到期", "Expiring in 90 days"), fmtNum(sm.expiringSoon), { warn: sm.expiringSoon > 0, sub: t("已过期 ", "expired ") + fmtNum(sm.expired) });
    $("ltable").tBodies[0].innerHTML = d.pools.length ? d.pools.map(function (p) {
      return '<tr class="pick' + (p.expired ? " dim" : "") + '" data-id="' + esc(p.id) + '"><td class="nowrap"><b>' + esc(p.id) + "</b>" + (p.parent ? '<span class="sub">← ' + esc(p.parent) + "</span>" : "") + '</td><td class="ell"><b>' + esc(p.sku) + "</b>" + (p.title ? '<span class="sub">' + esc(p.title) + "</span>" : "") + '</td><td class="ell">' + esc(holderName(p.holder)) + '</td><td class="num">' + fmtNum(p.qty) + '</td><td class="num">' + fmtNum(p.allocated) + '</td><td class="num"><b>' + fmtNum(p.balance) + '</b></td><td class="nowrap">' + (p.validTo ? esc(p.validTo) + (p.expired ? ' <span class="tag bad">' + t("已过期", "expired") + "</span>" : p.expiringSoon ? ' <span class="tag warn">' + t("将到期", "soon") + "</span>" : "") : "—") + '</td><td class="ell">' + esc((p.source && p.source.orderId) || "—") + "</td></tr>";
    }).join("") : '<tr><td colspan="8" class="empty">' + t("还没有许可池。", "No pools yet.") + "</td></tr>";
    $("lfoot").textContent = t("按地区的座位：", "Seats by region: ") + Object.keys(sm.byRegion || {}).map(function (k) { return t((REGION_L[k] || [k, k])[0], (REGION_L[k] || [k, k])[1]) + " " + sm.byRegion[k]; }).join(" · ");
  }
  function openPoolForm(parent) {
    var canEdit = licState.data && licState.data.canEdit;
    Promise.all([loadCatalogue(), loadInstitutionsCrm(false).catch(function () { return { rows: [] }; })]).then(function (res) {
      var cat = res[0], insts = res[1].rows || [];
      panelOpen('<div class="ph"><h3>' + (parent ? t("从 ", "From ") + parent.id + t(" 分配给机构", " to an institution") : t("新建许可池", "New licence pool")) + '</h3><button class="x" type="button" aria-label="close">✕</button></div><div class="pb"><form id="lpf">' +
        (parent ? "" : '<label class="f">' + t("教材", "Title") + '<select id="lpSku" required><option value="">' + t("选择…", "Choose…") + "</option>" + cat.map(function (k) { return '<option value="' + esc(k.sku) + '" data-title="' + esc(EN ? (k.nameEn || k.nameZh) : (k.nameZh || k.nameEn)) + '">' + esc(k.sku + " · " + (EN ? (k.nameEn || k.nameZh) : (k.nameZh || k.nameEn))) + "</option>"; }).join("") + "</select></label>") +
        '<div class="grid2"><label class="f">' + t("份数", "Seats") + '<input type="number" id="lpQty" min="1" step="1" required /></label>' + (parent ? '<label class="f">' + t("机构", "Institution") + '<select id="lpInst" required><option value="">' + t("选择…", "Choose…") + "</option>" + insts.map(function (r) { return '<option value="' + esc(r.domain) + '" data-name="' + esc(instName(r)) + '">' + esc(instName(r)) + "</option>"; }).join("") + "</select></label>" : '<label class="f">' + t("持有方", "Holder") + '<select id="lpHolder"><option value="hive">' + t("Hive（自持）", "Hive (own)") + "</option>" + insts.map(function (r) { return '<option value="' + esc(r.domain) + '" data-name="' + esc(instName(r)) + '">' + esc(instName(r)) + "</option>"; }).join("") + "</select></label>") + "</div>" +
        (parent ? "" : '<div class="grid2"><label class="f">' + t("有效期从", "Valid from") + '<input type="date" id="lpFrom" /></label><label class="f">' + t("有效期至", "Valid to") + '<input type="date" id="lpTo" /></label></div><label class="f">' + t("来源订单（订单号）", "Source order (order id)") + '<input type="text" id="lpOrder" maxlength="80" /></label>') +
        '<label class="f">' + t("备注", "Note") + '<input type="text" id="lpNote" maxlength="300" /></label>' +
        '<div class="actions"><button class="btn" type="submit" id="lpSave">' + t("保存", "Save") + '</button></div><div id="lpMsg"></div></form></div>', parent ? "second" : "");
      $("lpf").addEventListener("submit", function (e) {
        e.preventDefault(); var b = $("lpSave"); savingButton(b);
        var body;
        if (parent) { var io = $("lpInst").selectedOptions[0]; body = { op: "allocate", poolId: parent.id, to: { type: "institution", domain: $("lpInst").value, name: io && io.getAttribute("data-name") }, qty: +$("lpQty").value, note: $("lpNote").value.trim() }; }
        else { var so = $("lpSku").selectedOptions[0], ho = $("lpHolder").selectedOptions[0]; body = { op: "pool", sku: $("lpSku").value, title: so && so.getAttribute("data-title"), qty: +$("lpQty").value, validFrom: $("lpFrom").value || null, validTo: $("lpTo").value || null, holder: $("lpHolder").value === "hive" ? { type: "hive", name: "Hive" } : { type: "institution", domain: $("lpHolder").value, name: ho && ho.getAttribute("data-name") }, source: { orderId: $("lpOrder").value.trim() }, note: $("lpNote").value.trim() }; }
        post("crm/licenses", "POST", body).then(function (r) {
          restoreButton(b);
          if (!r.ok) { $("lpMsg").innerHTML = '<div class="msg err">' + esc((r.body && r.body.message) || errText(r)) + "</div>"; return; }
          licState.data = Object.assign(licState.data || {}, r.body.view);
          if ($("ltable")) renderLicenses();
          if (parent) { panel2Close(); openPoolPanel(parent.id); flashOk(t("已分配 " + body.qty + " 份给机构，生成子池 ", "Allocated " + body.qty + " seats; child pool ") + r.body.result.childPool, 5000); }
          else savedAndClose(null, t("已建许可池 ", "Pool created: ") + "<b>" + esc(r.body.result.id) + "</b>");
        });
      });
      if (!canEdit) $("lpSave").disabled = true;
    });
  }
  function openPoolPanel(id) {
    var d = licState.data, p = d && d.pools.filter(function (x) { return x.id === id; })[0]; if (!p) return;
    var allocs = d.allocations.filter(function (a) { return a.poolId === id; }).sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); });
    var canEdit = d.canEdit && !p.expired;
    panelOpen('<div class="ph"><h3>' + esc(p.id) + " · " + esc(p.sku) + '</h3><span class="tag' + (p.expired ? " bad" : p.expiringSoon ? " warn" : " ok") + '">' + (p.expired ? t("已过期", "expired") : t("余量 ", "balance ") + p.balance) + '</span><button class="x" type="button" aria-label="close">✕</button></div><div class="pb">' +
      '<div class="kv"><span class="k">' + t("教材", "Title") + "</span><span>" + esc(p.title || p.sku) + '</span><span class="k">' + t("持有方", "Holder") + "</span><span>" + esc(holderName(p.holder)) + '</span><span class="k">' + t("份数", "Seats") + "</span><span>" + p.qty + t(" · 已分配 ", " · allocated ") + p.allocated + t(" · 余量 ", " · balance ") + p.balance + '</span><span class="k">' + t("有效期", "Validity") + "</span><span>" + esc((p.validFrom || "…") + " → " + (p.validTo || "…")) + '</span><span class="k">' + t("来源", "Source") + "</span><span>" + esc((p.source && p.source.orderId) || "—") + (p.parent ? t("，上级池 ", ", parent ") + esc(p.parent) : "") + '</span><span class="k">' + t("创建", "Created") + "</span><span>" + esc(day(p.at) + " · " + (p.by || "")) + "</span></div>" +
      (canEdit ? "<h4>" + t("分配给人", "Allocate to a person") + '</h4><form id="laf" class="grid3"><label class="f">' + t("人（姓名 / CRM ID）", "Person (name / CRM ID)") + '<input type="search" id="laQ" autocomplete="off" placeholder="HC-…" /><input type="hidden" id="laId" /></label><label class="f">' + t("份数", "Seats") + '<input type="number" id="laQty" min="1" step="1" value="1" /></label><div class="f"><button class="btn sm" type="submit" id="laSave">' + t("分配", "Allocate") + '</button></div></form><div id="laHits" class="olist hidden"></div><div class="actions"><button type="button" class="btn secondary sm" id="laInst">' + t("分配给机构（生成子池）…", "Allocate to an institution (child pool)…") + '</button></div><div id="laMsg"></div>' : "") +
      "<h4>" + t("分配记录", "Allocations") + " · " + allocs.filter(function (a) { return !a.revokedAt; }).length + '</h4><div class="olist">' + (allocs.length ? allocs.map(function (a) { return '<div class="orow' + (a.revokedAt ? " dim" : "") + '"><div class="omain"><b>' + esc(a.to.type === "person" ? (a.to.name || a.to.crmId) : (a.to.name || a.to.domain)) + "</b>" + (a.to.type === "institution" ? ' <span class="tag">' + t("机构 · 子池 ", "institution · pool ") + esc(a.childPool || "") + "</span>" : a.to.crmId ? ' <span class="sub">' + esc(a.to.crmId) + "</span>" : "") + '<span class="sub">' + esc(day(a.at) + " · " + (a.by || "") + (a.note ? " · " + a.note : "") + (a.revokedAt ? t(" · 已撤销 ", " · revoked ") + day(a.revokedAt) + (a.revokeNote ? "（" + a.revokeNote + "）" : "") : "")) + '</span></div><div class="oprice">' + a.qty + t(" 份", " seats") + (canEdit && !a.revokedAt ? '<br><button type="button" class="link" data-revoke="' + esc(a.id) + '">' + t("撤销", "revoke") + "</button>" : "") + "</div></div>"; }).join("") : '<div class="orow muted">' + t("还没有分配。", "No allocations yet.") + "</div>") + "</div>" +
      '<p class="hint">' + t("分配即座位数的记录；把座位加入 DRM 用户组由下一阶段的 DRM 系统执行。", "An allocation records seats; adding them to a DRM user group is the DRM system's job in the next phase.") + "</p></div>");
    if (!canEdit) return;
    var people = ((peopleState.hub || {}).people || []);
    if (!people.length) loadPeople(false).then(function () { people = ((peopleState.hub || {}).people || []); }).catch(function () {});
    $("laQ").addEventListener("input", debounce(function () {
      var q = $("laQ").value.trim().toLowerCase(), box = $("laHits"); $("laId").value = "";
      if (!q) { box.classList.add("hidden"); return; }
      var hits = people.filter(function (x) { return (x.name + " " + x.crmId + " " + (x.primaryEmail || "")).toLowerCase().indexOf(q) >= 0; }).slice(0, 8);
      box.innerHTML = hits.map(function (x) { return '<button type="button" class="orow link" data-pid="' + esc(x.crmId) + '" data-name="' + esc(x.name) + '"><div class="omain"><b>' + esc(x.name) + '</b><span class="sub">' + esc(x.crmId + " · " + (x.primaryEmail || "")) + "</span></div></button>"; }).join("") || '<div class="orow muted">' + t("没有匹配的人。", "No match.") + "</div>";
      box.classList.remove("hidden");
    }, 120));
    $("laHits").addEventListener("click", function (e) { var b = e.target.closest("button[data-pid]"); if (!b) return; $("laId").value = b.getAttribute("data-pid"); $("laQ").value = b.getAttribute("data-name") + " · " + b.getAttribute("data-pid"); $("laHits").classList.add("hidden"); });
    $("laf").addEventListener("submit", function (e) {
      e.preventDefault(); var pid = $("laId").value; if (!pid) { $("laMsg").innerHTML = '<div class="msg err">' + t("先从列表里选一个人。", "Pick a person from the list first.") + "</div>"; return; }
      var b = $("laSave"); savingButton(b);
      post("crm/licenses", "POST", { op: "allocate", poolId: id, to: { type: "person", crmId: pid, name: $("laQ").value.split(" · ")[0] }, qty: +$("laQty").value }).then(function (r) {
        restoreButton(b);
        if (!r.ok) { $("laMsg").innerHTML = '<div class="msg err">' + esc((r.body && r.body.message) || errText(r)) + "</div>"; return; }
        licState.data = Object.assign(licState.data, r.body.view); if ($("ltable")) renderLicenses(); openPoolPanel(id);
      });
    });
    $("laInst").addEventListener("click", function () { openPoolForm(p); });
    $("panel").querySelectorAll("button[data-revoke]").forEach(function (b) { b.addEventListener("click", function () {
      if (!window.confirm(t("撤销这条分配？座位回到池里。", "Revoke this allocation? The seats return to the pool."))) return;
      post("crm/licenses", "POST", { op: "revoke", id: b.getAttribute("data-revoke") }).then(function (r) {
        if (!r.ok) { $("laMsg").innerHTML = '<div class="msg err">' + esc((r.body && r.body.message) || errText(r)) + "</div>"; return; }
        licState.data = Object.assign(licState.data, r.body.view); if ($("ltable")) renderLicenses(); openPoolPanel(id);
      });
    }); });
  }
