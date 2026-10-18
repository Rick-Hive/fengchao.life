// management/src/21-teams.js — 新建 Teams 群组 and 管理成员 (Rick, 2026-10-16).
// Part of management.js: scripts/build-management.js concatenates management/src/*.js in name order
// into management/management.js (one closure; every part sees every other's functions). Edit here, not the built file.
//
// The IT 管理员 creates a school's team here (type as in Teams for Education — 班级 / 教师学习社区 / 教职员工 / 其它;
// 公开 or 私有 for 其它) and manages its owners and members, so ordinary users can be stopped from creating
// groups in the tenant. Only the school's own accounts can be added, unless the system administrator has
// opened the tenant to that school (the switch on the school's line of the Teams 群组 page).
// API: domain/groupoptions · usersearch · group · groupmembers · groupop · groupscope (api/domain/index.js).

  // ---- a small people picker: type a name or account, pick from what the server finds -------------
  // host: an element; returns { get() → [upn…], add(upn, name), clear(), setDomain(d) }.
  function peoplePicker(host, dom, o) {
    o = o || {};
    var chosen = [], items = [], timer = 0, seq = 0, composing = false;
    host.classList.add("pp");
    host.innerHTML = '<div class="ppchips"></div><div class="ppbox"><input type="text" class="ppin" autocomplete="off" placeholder="' + esc(o.placeholder || t("输入姓名或账号搜索…", "Type a name or account…")) + '" /><div class="pplist hidden"></div></div>';
    var chips = host.querySelector(".ppchips"), inp = host.querySelector(".ppin"), listEl = host.querySelector(".pplist");
    function paint() {
      chips.innerHTML = chosen.map(function (c, i) {
        return '<span class="pchip" title="' + esc(c.upn) + '"><span class="av" style="background:' + hue(c.upn) + '">' + esc(initials(c.name || c.upn)) + "</span>" + esc(c.name || c.upn.split("@")[0]) + '<button type="button" data-i="' + i + '" aria-label="' + esc(t("移除", "Remove")) + '">✕</button></span>';
      }).join("");
      if (o.onChange) o.onChange(chosen.map(function (c) { return c.upn; }));
    }
    function add(upn, name) {
      upn = String(upn || "").trim().toLowerCase();
      if (!upn || chosen.some(function (c) { return c.upn === upn; })) return;
      chosen.push({ upn: upn, name: name || "" }); paint();
    }
    function hide() { listEl.classList.add("hidden"); listEl.innerHTML = ""; items = []; }
    function show(users) {
      items = users.filter(function (u) { return !chosen.some(function (c) { return c.upn === u.upn; }) && !(o.exclude && o.exclude().indexOf(u.upn) >= 0); });
      if (!items.length) { listEl.innerHTML = '<div class="ppempty">' + t("没有找到。可以直接输入完整账号后按回车。", "No match. Type the full account and press Enter.") + "</div>"; listEl.classList.remove("hidden"); return; }
      listEl.innerHTML = items.map(function (u, i) { return '<button type="button" class="ppitem" data-i="' + i + '"><span class="av" style="background:' + hue(u.upn) + '">' + esc(initials(u.name || u.upn)) + '</span><span class="n">' + esc(u.name || "") + '</span><span class="u">' + esc(u.upn) + "</span></button>"; }).join("");
      listEl.classList.remove("hidden");
    }
    function search() {
      var q = inp.value.trim(); if (!q) { hide(); return; }
      var my = ++seq;
      api("domain/usersearch?domain=" + encodeURIComponent(dom) + "&q=" + encodeURIComponent(q)).then(function (r) {
        if (my !== seq) return;
        if (!r.ok) { listEl.innerHTML = '<div class="ppempty err">' + esc(errText(r)) + "</div>"; listEl.classList.remove("hidden"); return; }
        show(r.body.users || []);
      });
    }
    inp.addEventListener("compositionstart", function () { composing = true; });
    inp.addEventListener("compositionend", function () { composing = false; clearTimeout(timer); timer = setTimeout(search, 120); });
    inp.addEventListener("input", function () { if (composing) return; clearTimeout(timer); timer = setTimeout(search, 200); });
    inp.addEventListener("keydown", function (e) {
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === "Enter") {
        e.preventDefault();
        if (items.length) { add(items[0].upn, items[0].name); inp.value = ""; hide(); return; }
        var v = inp.value.trim(); if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) { add(v, ""); inp.value = ""; hide(); }
      } else if (e.key === "Escape" && !listEl.classList.contains("hidden")) { e.stopPropagation(); hide(); }
      else if (e.key === "Backspace" && !inp.value && chosen.length) { chosen.pop(); paint(); }
    });
    listEl.addEventListener("click", function (e) { var b = e.target.closest(".ppitem"); if (!b) return; var u = items[+b.getAttribute("data-i")]; if (u) { add(u.upn, u.name); inp.value = ""; hide(); inp.focus(); } });
    chips.addEventListener("click", function (e) { var b = e.target.closest("button[data-i]"); if (!b) return; chosen.splice(+b.getAttribute("data-i"), 1); paint(); });
    return { get: function () { return chosen.map(function (c) { return c.upn; }); }, names: function () { var m = {}; chosen.forEach(function (c) { m[c.upn] = c.name; }); return m; }, add: add, clear: function () { chosen = []; paint(); inp.value = ""; hide(); }, setDomain: function (d) { dom = d; } };
  }

  // ---- 新建 Teams 群组 -----------------------------------------------------------------------------
  function openNewGroupPanel(domain) {
    var dom = domain || currentDomain, opts = null, owners = null, members = null;
    var ds = ((domainsInfo && domainsInfo.domains) || []).filter(function (d) { return d.can && d.can.groups; });
    panelOpen(
      '<div class="ph"><span class="avatar">＋</span><h3>' + t("新建 Teams 群组", "New Teams group") + (ds.length > 1 ? "" : " · " + esc(dname(dom))) + '</h3><button class="x" type="button" aria-label="close">✕</button></div>' +
      '<div class="pb"><form id="ngf" autocomplete="off">' +
        (ds.length > 1 ? '<label class="f">' + t("学校", "School") + '<select id="ngDom">' + ds.map(function (d) { return '<option value="' + esc(d.domain) + '"' + (d.domain === dom ? " selected" : "") + ">" + esc(dname(d.domain)) + "</option>"; }).join("") + "</select></label>" : "") +
        '<div class="f-title">' + t("群组类型", "Team type") + ' <span class="req">*</span></div><div id="ngTypes" class="plans"><div class="muted" style="font-size:12px">' + t("载入中…", "Loading…") + "</div></div>" +
        '<label class="f">' + t("名称", "Name") + ' <span class="req">*</span><input type="text" id="ngName" maxlength="256" /></label>' +
        '<label class="f">' + t("描述（可选）", "Description (optional)") + '<textarea id="ngDesc" rows="2" maxlength="1024"></textarea></label>' +
        '<div class="f-title">' + t("隐私", "Privacy") + '</div><div id="ngPriv" class="plans"></div>' +
        '<div class="f-title">' + t("所有者", "Owners") + ' <span class="req">*</span> <small class="faint" id="ngOwnNote"></small></div><div id="ngOwners"></div>' +
        '<div class="f-title">' + t("成员（可选，之后也可添加）", "Members (optional — you can add more later)") + '</div><div id="ngMembers"></div>' +
        '<p class="muted" id="ngScope" style="font-size:12px;margin:6px 0 0"></p>' +
        '<div class="actions"><button class="btn" type="submit" id="ngSave" disabled>' + t("创建群组", "Create team") + '</button></div><div id="ngMsg"></div></form></div>');
    function typeId() { var i = $("ngTypes").querySelector("input[name=ngType]:checked"); return i ? i.value : ""; }
    function paintPrivacy() {
      var tp = ((opts && opts.types) || []).filter(function (x) { return x.id === typeId(); })[0];
      var box = $("ngPriv");
      if (!tp) { box.innerHTML = '<div class="muted" style="font-size:12px">' + t("先选类型。", "Choose a type first.") + "</div>"; return; }
      if (tp.privacy === "choose") {
        box.innerHTML =
          '<label class="plan"><input type="radio" name="ngVis" value="Private" checked /><span class="plantxt"><b>' + t("私有", "Private") + "</b><small>" + t("只有所有者能添加成员；只有成员看得到团队内容。", "Only owners add members; only members see the team's content.") + "</small></span></label>" +
          '<label class="plan"><input type="radio" name="ngVis" value="Public" /><span class="plantxt"><b>' + t("公开", "Public") + "</b><small>" + t("整个租户（所有学校的账号）都能搜索并加入——跨校可见，请谨慎。", "Anyone in the whole tenant (every school's accounts) can find and join it — visible across schools, use with care.") + "</small></span></label>";
      } else {
        box.innerHTML = '<div class="muted" style="font-size:12px">' + (tp.privacy === "hidden" ? t("私有；班级团队的成员名单对学生隐藏（Teams 模板固定，不能改）。", "Private; a class team hides its membership from students (fixed by the Teams template).") : t("私有（教育类团队在 Teams 里都是私有的）。", "Private (education teams are always private in Teams).")) + "</div>";
      }
    }
    function paintScope() {
      $("ngScope").textContent = opts && opts.tenantUsers ? t("本校 IT 管理员已获系统管理员批准，可以添加其他学校的账号（访客账号除外）。", "This school's IT administrator is allowed to add other schools' accounts (never guests).") : t("只能添加本校账号（@" + dom + "）。需要添加其他学校的账号，请联系系统管理员授权。", "Only this school's accounts (@" + dom + ") can be added. To add other schools' accounts, ask the system administrator to allow it.");
    }
    function init() {
      $("ngSave").disabled = true;
      $("ngOwners").innerHTML = ""; $("ngMembers").innerHTML = "";
      owners = peoplePicker($("ngOwners"), dom, { placeholder: t("搜索老师或行政账号…", "Search teachers or staff…") });
      members = peoplePicker($("ngMembers"), dom, { exclude: function () { return owners.get(); } });
      api("domain/groupoptions?domain=" + encodeURIComponent(dom)).then(function (r) {
        if (!r.ok) { $("ngTypes").innerHTML = '<div class="msg err">' + esc(errText(r)) + "</div>"; return; }
        opts = r.body;
        $("ngTypes").innerHTML = opts.types.map(function (x) { return '<label class="plan"><input type="radio" name="ngType" value="' + esc(x.id) + '" /><span class="plantxt"><b>' + esc(EN ? x.en : x.zh) + "</b><small>" + esc(EN ? x.hintEn : x.hintZh) + "</small></span></label>"; }).join("");
        paintPrivacy(); paintScope();
        $("ngSave").disabled = false;
      });
    }
    $("ngTypes").addEventListener("change", function () {
      paintPrivacy();
      $("ngOwnNote").textContent = typeId() && typeId() !== "standard" ? t("（班级 / PLC / 教职员工团队的所有者必须是老师或行政，不能是学生）", "(the owner of a class, PLC or staff team must be a teacher or staff member, not a student)") : "";
    });
    var domSel = $("ngDom");
    if (domSel) domSel.addEventListener("change", function () { dom = domSel.value; init(); });
    $("ngf").addEventListener("submit", function (ev) {
      ev.preventDefault();
      var vis = $("ngPriv").querySelector("input[name=ngVis]:checked");
      var body = { domain: dom, type: typeId(), name: $("ngName").value.trim(), description: $("ngDesc").value.trim(), visibility: vis ? vis.value : "Private", owners: owners.get(), members: members.get() };
      var missing = [];
      if (!body.type) missing.push(t("群组类型", "team type"));
      if (!body.name) missing.push(t("名称", "name"));
      if (!body.owners.length) missing.push(t("至少一位所有者", "at least one owner"));
      if (missing.length) { $("ngMsg").innerHTML = '<div class="msg err">' + t("请填写：", "Please fill in: ") + esc(missing.join(EN ? ", " : "、")) + "</div>"; return; }
      var b = $("ngSave"); b.disabled = true; b.textContent = t("创建中…（最长约 1 分钟）", "Creating… (up to a minute)");
      $("ngMsg").innerHTML = "";
      function failed(r) { b.disabled = false; b.textContent = t("创建群组", "Create team"); $("ngMsg").innerHTML = '<div class="msg err">' + esc(errText(r)).replace(/\n/g, "<br>") + "</div>"; }
      function done(res) {
        delete state.domainGroups[dom]; delete state.domainUsers[dom]; delete state.domainUsers["*"];
        $("panel").querySelector(".pb").innerHTML =
          '<div class="msg ok">' + t("团队已创建。", "Team created.") + "</div>" +
          '<div class="kv"><span class="k">' + t("名称", "Name") + "</span><span><b>" + esc(res.name || body.name) + "</b></span>" +
            '<span class="k">' + t("类型", "Type") + "</span><span>" + esc(((opts.types || []).filter(function (x) { return x.id === body.type; })[0] || {})[EN ? "en" : "zh"] || body.type) + "</span>" +
            '<span class="k">' + t("所有者 / 成员", "Owners / members") + "</span><span>" + body.owners.length + " / " + body.members.length + "</span></div>" +
          (res.failed && res.failed.length ? '<div class="msg err">' + t("这些账号没能加入，请打开团队重试：", "These accounts could not be added — open the team and try again: ") + esc(res.failed.join(", ")) + "</div>" : "") +
          '<p class="muted" style="font-size:12px">' + t("Teams 里通常几分钟内出现；成员名单同步到 Teams 客户端最长可能需要 24 小时。", "It usually appears in Teams within minutes; membership can take up to 24 hours to reach the Teams client.") + "</p>" +
          '<div class="actions"><button class="btn secondary sm" type="button" id="ngAgain">' + t("再建一个", "Create another") + "</button></div>";
        $("ngAgain").addEventListener("click", function () { openNewGroupPanel(dom); });
        if (location.hash.indexOf("#/domain/groups") === 0 && $("gtree")) ensureGroups(dom, true);
      }
      post("domain/group", "POST", body).then(function (r) {
        if (!r.ok) { failed(r); return; }
        if (!r.body.pending) { done(r.body); return; }
        var tries = 0;
        (function step() {
          post("domain/groupop", "POST", { domain: dom, id: r.body.id, op: r.body.op, owners: body.owners, members: body.members }).then(function (q) {
            if (!q.ok) { failed(q); return; }
            if (q.body.pending && tries++ < 40) { setTimeout(step, 1500); return; }
            if (q.body.pending) { failed({ status: 504, body: { error: t("Microsoft 还没有完成创建；稍后在 Teams 群组页面同步后查看。", "Microsoft has not finished creating it; sync the Teams groups page later and look again.") } }); return; }
            done(Object.assign({ name: body.name }, q.body));
          });
        })();
      });
    });
    init();
  }

  // ---- 管理成员: a team's live owners and members, in the group panel ------------------------------------
  function openGroupManager(host, dom, id) {
    var data = null, picker = null, cached = host.getAttribute("data-cached") !== null ? host.getAttribute("data-cached") : host.innerHTML;
    host.setAttribute("data-cached", cached);
    api("domain/group?domain=" + encodeURIComponent(dom) + "&id=" + encodeURIComponent(id)).then(function (r) {
      // If Microsoft cannot be read (the app lacks a permission, say) the cached list stays, with the reason above it.
      if (!r.ok) { host.innerHTML = '<div class="msg err">' + esc(errText(r)) + "</div>" + cached; return; }
      data = r.body; host._gm.data = data; paint();
    });
    function row(p, isOwnerRow) {
      return '<div class="gmrow"><span class="avatar sm" style="background:' + hue(p.upn) + '">' + esc(initials(p.name || p.upn)) + '</span><span class="mname">' + esc(p.name || "") + '</span><span class="mupn">' + esc(p.upn) + "</span>" +
        (p.editable ? '<span class="gmact">' +
          (isOwnerRow ? '<button type="button" class="btn xs secondary" data-act="demote" data-upn="' + esc(p.upn) + '">' + t("取消所有者", "Remove as owner") + "</button>" : '<button type="button" class="btn xs secondary" data-act="promote" data-upn="' + esc(p.upn) + '">' + t("设为所有者", "Make owner") + "</button>") +
          '<button type="button" class="btn xs secondary" data-act="remove" data-upn="' + esc(p.upn) + '">' + t("移除", "Remove") + "</button></span>" : '<span class="gmact muted" title="' + esc(t("其他学校的账号：只有系统管理员可以移除", "Another school's account: only the system administrator removes it")) + '">' + esc(p.domain) + "</span>") + "</div>";
    }
    function paint() {
      var ownerSet = {}; data.owners.forEach(function (o) { ownerSet[o.upn] = true; });
      var plain = data.members.filter(function (m) { return !ownerSet[m.upn]; });
      host.innerHTML =
        "<h4>" + t("所有者", "Owners") + " (" + data.owners.length + ")</h4>" + (data.owners.map(function (o) { return row(o, true); }).join("") || '<div class="muted">' + t("没有所有者。", "No owner.") + "</div>") +
        "<h4>" + t("成员", "Members") + " (" + plain.length + ")</h4>" + (plain.map(function (m) { return row(m, false); }).join("") || '<div class="muted">' + t("没有其他成员。", "No other members.") + "</div>") +
        '<h4>' + t("添加", "Add") + '</h4><div id="gmPick"></div>' +
        '<div class="actions"><select id="gmRole"><option value="m">' + t("作为成员", "As members") + '</option><option value="o">' + t("作为所有者", "As owners") + '</option></select><button class="btn sm" type="button" id="gmAdd">' + t("添加", "Add") + "</button></div>" +
        '<p class="muted" style="font-size:12px;margin:4px 0">' + (data.tenantUsers ? t("可以添加其他学校的账号（系统管理员已批准）。", "Other schools' accounts can be added (approved by the system administrator).") : t("只能添加本校账号。", "Only this school's accounts can be added.")) + "</p>" +
        '<div id="gmMsg"></div><p class="muted" id="gmNote" style="font-size:12px;margin:4px 0"></p>';
      picker = peoplePicker($("gmPick"), dom, { exclude: function () { return data.members.map(function (m) { return m.upn; }); } });
    }
    // Apply a change to the lists we hold, so the panel shows it at once (Rick, 2026-10-18: nothing moved
    // after 取消所有者 / 设为所有者 — Microsoft's lists lag a change by seconds, and the re-read came too soon).
    function applyLocal(change) {
      var byUpn = {}; data.members.concat(data.owners).forEach(function (p) { byUpn[p.upn] = p; });
      var mk = function (u) { return byUpn[u] || { upn: u, name: (picker && picker.names && picker.names()[u]) || "", editable: true }; };
      var inList = function (list, u) { return list.some(function (p) { return p.upn === u; }); };
      (change.addOwners || []).forEach(function (u) { if (!inList(data.owners, u)) data.owners.push(mk(u)); if (!inList(data.members, u)) data.members.push(mk(u)); });
      (change.addMembers || []).forEach(function (u) { if (!inList(data.members, u)) data.members.push(mk(u)); });
      (change.removeOwners || []).forEach(function (u) { data.owners = data.owners.filter(function (p) { return p.upn !== u; }); });
      (change.removeMembers || []).forEach(function (u) { data.owners = data.owners.filter(function (p) { return p.upn !== u; }); data.members = data.members.filter(function (p) { return p.upn !== u; }); });
      data.members.forEach(function (p) { p.owner = inList(data.owners, p.upn); });
    }
    // Does a fresh read from Microsoft show the change yet?
    function reflects(fresh, change) {
      var has = function (list, u) { return list.some(function (p) { return p.upn === u; }); };
      return (change.addOwners || []).every(function (u) { return has(fresh.owners, u); }) && (change.addMembers || []).every(function (u) { return has(fresh.members, u); }) &&
        (change.removeOwners || []).every(function (u) { return !has(fresh.owners, u); }) && (change.removeMembers || []).every(function (u) { return !has(fresh.members, u); });
    }
    var reconcileTimer = null;
    function reconcile(change, delays) {
      clearTimeout(reconcileTimer);
      if (!delays.length) { if ($("gmNote")) $("gmNote").textContent = t("Microsoft 还在同步这项改动；稍后重新打开可看到最终名单。", "Microsoft is still applying the change; reopen later for the final list."); return; }
      reconcileTimer = setTimeout(function () {
        if (!host.isConnected || host._gm.data !== data) return;      // the panel moved on
        api("domain/group?domain=" + encodeURIComponent(dom) + "&id=" + encodeURIComponent(id)).then(function (r) {
          if (!r.ok || host._gm.data !== data) return;
          if (reflects(r.body, change)) { data = r.body; host._gm.data = data; paint(); return; }
          reconcile(change, delays.slice(1));
        });
      }, delays[0]);
    }
    function send(change, okText, btn) {
      if (btn) savingButton(btn);
      $("gmMsg").innerHTML = '<div class="loading">' + t("保存中…", "Saving…") + "</div>";
      post("domain/groupmembers", "POST", Object.assign({ domain: dom, id: id }, change)).then(function (r) {
        if (!r.ok) { if (btn) restoreButton(btn); $("gmMsg").innerHTML = '<div class="msg err">' + esc(errText(r)).replace(/\n/g, "<br>") + "</div>"; return; }
        delete state.domainGroups[dom]; delete state.domainUsers[dom]; delete state.domainUsers["*"];
        flashOk(okText);
        applyLocal(change); paint();
        if ($("gpCount")) $("gpCount").textContent = data.members.filter(function (m) { return (m.domain || "").toLowerCase() === dom.toLowerCase(); }).length;
        $("gmNote").textContent = t("正在与 Microsoft 核对…", "Checking with Microsoft…");
        reconcile(change, [1500, 3000, 5000, 8000]);
        if (location.hash.indexOf("#/domain/groups") === 0 && $("gtree")) setTimeout(function () { ensureGroups(dom, true); }, 1500);
      });
    }
    // One listener per host, whatever number of times the manager is re-opened after a change
    // (a second listener would fire the confirm step of "移除" twice); it talks to the latest call.
    host._gm = { send: send, picker: function () { return picker; }, data: null };
    if (host.getAttribute("data-bound") === "1") return;
    host.setAttribute("data-bound", "1");
    host.addEventListener("click", function (e) {
      var cur = host._gm, send = cur.send, picker = cur.picker();
      var b = e.target.closest("button[data-act]");
      if (b) {
        var upn = b.getAttribute("data-upn"), act = b.getAttribute("data-act");
        if (act === "remove" && b.getAttribute("data-sure") !== "1") { b.setAttribute("data-sure", "1"); b.textContent = t("确认移除？", "Confirm?"); setTimeout(function () { if (b.isConnected) { b.removeAttribute("data-sure"); b.textContent = t("移除", "Remove"); } }, 4000); return; }
        if (act === "remove") send({ removeMembers: [upn] }, t("已移除。", "Removed."), b);
        else if (act === "promote") send({ addOwners: [upn] }, t("已设为所有者。", "Made owner."), b);
        else if (act === "demote") send({ removeOwners: [upn] }, t("已取消所有者。", "No longer an owner."), b);
        return;
      }
      if (e.target.id === "gmAdd") {
        var list = picker ? picker.get() : [];
        if (!list.length) { $("gmMsg").innerHTML = '<div class="msg err">' + t("先搜索并选择要添加的人。", "Search and pick who to add first.") + "</div>"; return; }
        var asOwner = $("gmRole").value === "o";
        send(asOwner ? { addOwners: list } : { addMembers: list }, t("已添加 ", "Added ") + list.length + (EN ? "." : " 人。"), $("gmAdd"));
      }
    });
  }

  // Which accounts a school's IT 管理员 may put into a team: the switch on the school's line of the
  // Teams 群组 page, for the system administrator only.
  function groupScopeSwitch(domain) {
    var d = ((domainsInfo && domainsInfo.domains) || []).filter(function (x) { return x.domain === domain; })[0];
    if (!d || !d.can || !d.can.groupScope) return "";
    return '<label class="gscope"><input type="checkbox" data-scope="' + esc(domain) + '"' + (d.can.groupTenantSchool ? " checked" : "") + " /> " + t("允许本校 IT 管理员把其他学校的账号加入团队", "Let this school's IT administrator add other schools' accounts to teams") + "</label>";
  }
  function bindGroupScope(root) {
    root.addEventListener("change", function (e) {
      var c = e.target.closest("input[data-scope]"); if (!c) return;
      var dom = c.getAttribute("data-scope"), on = c.checked;
      c.disabled = true;
      post("domain/groupscope", "PUT", { domain: dom, tenantUsers: on }).then(function (r) {
        c.disabled = false;
        if (!r.ok) { c.checked = !on; flash(esc(errText(r))); return; }
        var d = ((domainsInfo && domainsInfo.domains) || []).filter(function (x) { return x.domain === dom; })[0]; if (d && d.can) { d.can.groupTenantSchool = on; if (!isAdmin()) d.can.groupTenant = on; }
        flashOk(esc(dname(dom)) + (on ? t("：IT 管理员现在可以添加其他学校的账号。", ": the IT administrator may now add other schools' accounts.") : t("：IT 管理员只能添加本校账号。", ": the IT administrator adds only this school's accounts.")));
      });
    });
  }
