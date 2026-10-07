// management/src/20-users.js — 本域管理: 用户 (table, role filter, 所有学校), the person panel, new account, Teams 群组.
// Part of management.js: scripts/build-management.js concatenates management/src/*.js in name order
// into management/management.js (one closure; every part sees every other's functions). Edit here, not the built file.
  // ================================================================================
  // 我的 Teams
  // ================================================================================
  var GKIND = { class: ["班级团队", "Class team"], team: ["普通团队", "Team"], m365: ["群组", "Group"], security: ["群组", "Group"], distribution: ["群组", "Group"], other: ["群组", "Group"] };
  function teamRow(g, q) {
    var k = GKIND[g.kind] || GKIND.other;
    var vis = g.visibility ? (g.visibility === "Public" ? t("公开", "Public") : g.visibility === "Private" ? t("私密", "Private") : esc(g.visibility)) : k[EN ? 1 : 0];
    return '<div class="trow pick" data-id="' + esc(g.id) + '"><span class="tav" style="background:' + hue(g.id) + '">' + esc(initials(gname(g))) + '</span>' +
      '<div class="tmain"><div class="tname">' + hl(gname(g), q) + "</div><div class=\"tmeta\"><span>" + vis + "</span>" +
      (g.members != null ? "<span>" + g.members + t(" 人", " people") + "</span>" : "") +
      (g.visibility ? "<span>" + esc(k[EN ? 1 : 0]) + "</span>" : "") +
      (g.description ? '<span class="desc">' + hl(g.description, q) + "</span>" : "") + "</div></div>" +
      (g.owner ? '<span class="trole">' + t("所有者", "Owner") + "</span>" : '<span class="trole muted">' + t("成员", "Member") + "</span>") + "</div>";
  }
  function viewTeams() {
    setTitle(t("我的账号", "My account"), t("我的 Teams", "My Teams"), "", t("您所在的团队和群组。", "The teams and groups you belong to."));
    $("content").innerHTML =
      '<div class="toolbar" id="tbar">' +
        '<button class="chip" data-f="all" aria-pressed="true">' + t("全部", "All") + "</button>" +
        '<button class="chip" data-f="owner">' + t("我是所有者", "Teams you own") + "</button>" +
        '<button class="chip" data-f="class">' + t("班级团队", "Class teams") + "</button>" +
        '<button class="chip" data-f="team">' + t("普通团队", "Other teams") + "</button>" +
        '<select id="tsort"><option value="az">' + t("排序：A–Z", "Sort: A–Z") + '</option><option value="members">' + t("排序：人数", "Sort: people") + '</option><option value="kind">' + t("排序：类型", "Sort: type") + "</option></select>" +
        '<span class="spacer"></span><div class="search">' + ICON.search + '<input type="search" id="tq" placeholder="' + t("搜索团队名称或简介…", "Search teams…") + '" /></div>' +
      "</div>" +
      '<div class="tlist" id="tlist"><div class="loading">' + t("载入中…", "Loading…") + "</div></div>";
    $("tbar").addEventListener("click", function (e) {
      var c = e.target.closest(".chip[data-f]"); if (!c) return;
      state.teamFilter = c.getAttribute("data-f");
      $("tbar").querySelectorAll(".chip").forEach(function (x) { x.setAttribute("aria-pressed", x === c ? "true" : "false"); });
      renderTeams();
    });
    $("tsort").value = state.teamSort;
    $("tsort").addEventListener("change", function () { state.teamSort = this.value; renderTeams(); });
    $("tq").value = state.teamQ;
    $("tq").addEventListener("input", debounce(function () { state.teamQ = $("tq").value.trim(); renderTeams(); }, 120));
    $("tlist").addEventListener("click", function (e) {
      var row = e.target.closest(".trow[data-id]"); if (!row) return;
      openMyGroupPanel(row.getAttribute("data-id"));
    });
    if (state.teams) renderTeams();
    api("me/groups").then(function (r) {
      if (!r.ok) { $("tlist").innerHTML = '<div class="msg err">' + esc(errText(r)) + "</div>"; return; }
      state.teams = r.body.groups || [];
      renderTeams();
    });
  }
  // One of my groups: description and members, read-only (Rick, 2026-10-02).
  function openMyGroupPanel(id) {
    var g0 = (state.teams || []).filter(function (x) { return x.id === id; })[0] || {};
    panelOpen('<div class="ph"><span class="tav" style="width:32px;height:32px;font-size:11px;background:' + hue(id) + '">' + esc(initials(gname(g0) || "?")) + "</span><h3>" + esc(gname(g0) || "") + '</h3><button class="x" type="button" aria-label="close">✕</button></div><div class="pb"><div class="loading">' + t("载入中…", "Loading…") + "</div></div>");
    api("me/group/" + encodeURIComponent(id)).then(function (r) {
      var pb = $("panel").querySelector(".pb"); if (!pb) return;
      if (!r.ok) { pb.innerHTML = '<div class="msg err">' + esc(errText(r)) + "</div>"; return; }
      var g = r.body, k = GKIND[g.kind] || GKIND.other;
      pb.innerHTML =
        '<div class="kv"><span class="k">' + t("类型", "Type") + "</span><span>" + esc(k[EN ? 1 : 0]) + "</span>" +
          (g.visibility ? '<span class="k">' + t("可见性", "Visibility") + "</span><span>" + (g.visibility === "Public" ? t("公开", "Public") : t("私密", "Private")) + "</span>" : "") +
          (g.mail ? '<span class="k">' + t("邮箱", "Mail") + "</span><span>" + esc(g.mail) + "</span>" : "") +
          (g.created ? '<span class="k">' + t("创建", "Created") + "</span><span>" + esc(day(g.created)) + "</span>" : "") +
          '<span class="k">' + t("成员", "Members") + "</span><span>" + g.members.length + "</span>" +
          (g.description ? '<span class="k">' + t("简介", "About") + "</span><span>" + esc(g.description) + "</span>" : "") + "</div>" +
        "<h4>" + t("成员", "Members") + "</h4>" +
        (g.members.length ? g.members.map(function (m) {
          return '<button class="mrow link" type="button" data-upn="' + esc(m.upn) + '" data-name="' + esc(m.displayName || "") + '" data-owner="' + (m.owner ? "1" : "0") + '"><span class="avatar sm" style="background:' + hue(m.upn) + '">' + esc(initials(m.displayName || m.upn)) + '</span><span class="mname">' + esc(m.displayName) + '</span><span class="mupn">' + esc(m.upn) + "</span>" + (m.owner ? '<span class="tag accent">' + t("所有者", "Owner") + "</span>" : "<span></span>") + "</button>";
        }).join("") : '<div class="muted">' + t("没有成员。", "No members.") + "</div>") +
        '<p class="hint">' + t("点击成员查看其信息。只读：成员的增减在 Teams 里完成。", "Click a member to see their details. Read-only: members are added or removed in Teams.") + "</p>";
    });
  }
  function renderTeams() {
    if (!state.teams || !$("tlist")) return;
    var q = state.teamQ, f = state.teamFilter;
    // 我的 Teams shows teams; other kinds of groups (mail-only, permission-only) are not Teams.
    var rows = state.teams.filter(function (g) {
      if (g.kind !== "class" && g.kind !== "team") return false;
      if (f === "owner" && !g.owner) return false;
      if ((f === "class" || f === "team") && g.kind !== f) return false;
      if (q) { var hay = (g.name + " " + (g.nameZh || "") + " " + (g.nameEn || "") + " " + (g.description || "") + " " + (g.mail || "")).toLowerCase(); if (hay.indexOf(q.toLowerCase()) < 0) return false; }
      return true;
    });
    var order = { class: 0, team: 1, m365: 2, security: 3, distribution: 4, other: 5 };
    rows.sort(function (a, b) {
      if (state.teamSort === "members") return (b.members || 0) - (a.members || 0) || a.name.localeCompare(b.name, "zh");
      if (state.teamSort === "kind") return order[a.kind] - order[b.kind] || a.name.localeCompare(b.name, "zh");
      return a.name.localeCompare(b.name, "zh");
    });
    var others = state.teams.filter(function (g) { return g.kind !== "class" && g.kind !== "team"; }).length;
    $("tlist").innerHTML = rows.length ? rows.map(function (g) { return teamRow(g, q); }).join("") :
      '<div class="empty">' + (q ? t("没有匹配「" + q + "」的团队。", "No team matches \"" + q + "\".") : f !== "all" ? t("这一类里没有团队。", "No team of this kind.")
        : (others ? t("没有加入任何 Teams 团队（另有 " + others + " 个不是 Teams 的群组，如邮件组 / 安全组，这里不显示）。", "Not a member of any team (" + others + " other group(s) that are not Teams — mail or security groups — are not shown here).") : t("没有加入任何团队。", "Not a member of any team."))) + "</div>";
  }

  // ================================================================================
  // 本域管理 › 用户
  // ================================================================================
  // A school is shown by the name the system administrator gave it (系统 › 机构名称);
  // the domain itself is shown only to the system administrator (Rick, 2026-10-02).
  function dinfo(domain) { return ((domainsInfo && domainsInfo.domains) || []).filter(function (d) { return d.domain === domain; })[0] || null; }
  // One name, in the page's language (Rick, 2026-10-03: 「中文语言下，仅显示中文即可」);
  // the other language's name only when this one has not been entered, then the domain.
  function pickName(zh, en) { return (EN ? (en || zh) : (zh || en)) || ""; }
  function dname(domain) {
    var d = dinfo(domain); if (!d) return domain;
    return pickName(d.name, d.nameEn) || domain;
  }
  // A school is shown by its name in the page's language only (Rick, 2026-10-04:
  // 「Only display Chinese or English name according to site language」); the raw
  // domain appears only where no name has been set, and on 系统 › 机构名称.
  function dlabel(domain) { return esc(dname(domain)); }
  // `all` adds 所有学校 (value "*") — the users table across every school the person
  // manages (Rick, 2026-10-08: filter users by role "inside domain or site wide").
  function domainPicker(id, all) {
    var ds = ((domainsInfo && domainsInfo.domains) || []).slice().sort(function (a, b) { return dname(a.domain).localeCompare(dname(b.domain), EN ? "en" : "zh-Hans-CN"); });
    if (ds.length <= 1) return ds.length ? '<span class="tag accent">' + esc(dname(ds[0].domain)) + "</span>" : "";
    return '<select id="' + id + '">' + (all ? '<option value="*"' + (state.allDomains ? " selected" : "") + ">" + t("所有学校", "All schools") + "</option>" : "") + ds.map(function (d) { return '<option value="' + esc(d.domain) + '"' + (!(all && state.allDomains) && d.domain === currentDomain ? " selected" : "") + ">" + esc(dname(d.domain)) + "</option>"; }).join("") + "</select>";
  }
  // The users of every managed school, each row tagged with its domain, merged into one
  // table-shaped object { users, sync, partial }.
  function allDomainList() { return ((domainsInfo && domainsInfo.domains) || []).map(function (d) { return d.domain; }); }
  // One request: the server merges the managed schools (domain=*), rows carry their domain.
  function loadAllUsers(force) {
    if (!force && state.domainUsers["*"]) return Promise.resolve(state.domainUsers["*"]);
    return api("domain/users?domain=*").then(function (r) {
      if (!r.ok) throw new Error(errText(r));
      state.domainUsers["*"] = Object.assign({ all: true }, r.body);
      // The per-school caches are filled from the same answer, so opening a row's panel needs no second fetch.
      allDomainList().forEach(function (dom) { if (!state.domainUsers[dom]) state.domainUsers[dom] = { domain: dom, users: r.body.users.filter(function (u) { return u.domain === dom; }), sync: r.body.sync, partial: false }; });
      return state.domainUsers["*"];
    });
  }
  function usersTable() { return state.allDomains ? state.domainUsers["*"] : state.domainUsers[currentDomain]; }
  function loadDomainData(kind, force) {
    var store = kind === "users" ? state.domainUsers : state.domainGroups;
    if (!force && store[currentDomain]) return Promise.resolve(store[currentDomain]);
    return api("domain/" + kind + "?domain=" + encodeURIComponent(currentDomain)).then(function (r) {
      if (!r.ok) throw new Error(errText(r));
      store[currentDomain] = r.body;
      return r.body;
    });
  }
  // The data comes from the directory cache in Azure (nightly sync at 01:00 Beijing).
  // 同步变动 applies what was created, changed or deleted in the directory since the
  // last sync; 完整同步 (system administrator) re-reads everyone. Both run in slices
  // until the server says done.
  function syncLine(sync) {
    if (!sync) return "";
    var s = sync.syncedAt ? t("数据同步于 ", "Synced ") + when(sync.syncedAt) : t("尚未同步 — 点「同步变动」读取本域账号。", "Not synced yet — press “Sync changes” to read the domain's accounts.");
    if (!sync.done) s += " · " + t("同步进行中：还剩 ", "Sync under way: ") + sync.remaining + t(" 个账号", " accounts left");
    if (sync.error) s += " · " + t("上次出错：", "Last error: ") + sync.error.message;
    return s;
  }
  function runSync(domain, mode, onProgress) {
    var saved = currentDomain;
    function step() {
      return post("domain/sync", "POST", { domain: domain, mode: mode }).then(function (r) {
        if (!r.ok) throw new Error(errText(r));
        onProgress(r.body);
        if (!r.body.done) return step();
        return r.body;
      });
    }
    return step().then(function (st) {
      // Both caches of this domain are stale now.
      delete state.domainUsers[domain]; delete state.domainGroups[domain]; delete state.domainUsers["*"];
      currentDomain = saved;
      return st;
    });
  }
  function syncButtons(id) {
    var d = ((domainsInfo && domainsInfo.domains) || []).filter(function (x) { return x.domain === currentDomain; })[0];
    return '<button class="btn secondary sm" id="' + id + 'New" title="' + esc(t("读取上次同步之后目录里的增、删、改", "Read what was created, changed or deleted in the directory since the last sync")) + '">' + t("同步变动", "Sync changes") + "</button>" +
      (d && d.can && d.can.full ? ' <button class="btn secondary sm" id="' + id + 'Full">' + t("完整同步", "Full sync") + "</button>" : "");
  }
  function viewUsers() {
    var canAll = allDomainList().length > 1;
    if (!canAll) state.allDomains = false;
    var all = state.allDomains;
    setTitle(domainsInfo.all ? t("机构管理", "Institutions") : t("本域管理", "My domain"), t("用户", "Users"),
      (all ? "" : (canDo("methods") ? '<button class="btn sm" id="newUser">' + t("＋ 新建账号", "+ New account") + "</button> " : "") + syncButtons("us")) + ' <button class="btn secondary sm" id="csv">' + t("导出 CSV", "Export CSV") + "</button>",
      t("本校的每一个账号：验证器与设备、Teams 群组、身份、关联账号。数据来自每夜刷新的目录缓存；点一行打开人员面板。身份未填时按许可证推断：学生版 A1 为学生，其余为家长；身份与许可证对不上的账号标为异常。", "Every account of the school: authenticator and devices, Teams groups, identity, linked accounts. From the directory cache refreshed nightly; click a row for the person's panel. An unset identity is inferred from the licence: A1 for students → student, otherwise parent; an identity that contradicts the licence is flagged."));
    // Role filter (Rick, 2026-10-08): identity (家长/学生/老师/行政/教育顾问), Hive roles
    // (domain IT, domain Hive, staff, system administrator) and 蜂巢课程教师 — within the
    // school, or across all schools with 所有学校 in the picker.
    var ROLE_OPTS = [["", t("全部角色", "All roles")]].concat(IDENTITIES.map(function (i) { return ["id:" + i, vl(i)]; })).concat([
      ["role:teacher", t("蜂巢课程教师（教师表 + 身份为老师）", "Hive course teachers (Teachers table + identity Teacher)")], ["role:it", t("域管理员（IT）", "Domain administrator (IT)")], ["role:hive", t("域蜂巢管理员", "Domain Hive administrator")], ["role:staff", "Staff"], ["role:admin", t("系统管理员", "System administrator")], ["role:any", t("有任一蜂巢角色", "Any Hive role")]]);
    $("content").innerHTML =
      '<div class="toolbar" id="ubar">' + domainPicker("dsel", canAll) +
        '<select id="urole" aria-label="' + t("按角色筛选", "Filter by role") + '">' + ROLE_OPTS.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (state.userRole === o[0] ? " selected" : "") + ">" + esc(o[1]) + "</option>"; }).join("") + "</select>" +
        '<button class="chip" data-f="all" aria-pressed="' + (state.userFilter === "all") + '">' + t("全部", "All") + "</button>" +
        '<button class="chip" data-f="noauth" aria-pressed="' + (state.userFilter === "noauth") + '">' + t("未登记验证器", "No authenticator") + "</button>" +
        '<button class="chip" data-f="noid" aria-pressed="' + (state.userFilter === "noid") + '">' + t("身份未填", "No identity") + "</button>" +
        '<button class="chip" data-f="never" aria-pressed="' + (state.userFilter === "never") + '">' + t("从未登录", "Never signed in") + "</button>" +
        '<span class="spacer"></span><div class="search">' + ICON.search + '<input type="search" id="uq" value="' + esc(state.userQ) + '" placeholder="' + t("搜索账号、姓名、群组…", "Search account, name, group…") + '" /></div>' +
      "</div>" +
      '<div class="kpis compact" id="ukpi"></div>' +
      '<div class="tbl-wrap"><table class="data" id="utable"><thead><tr>' +
        "<th>" + t("账号", "Account name") + "</th><th>" + t("显示名", "Display name") + "</th><th>" + t("验证", "Authentication") + "</th><th>" + t("验证设备", "Authentication device") + "</th><th>" + t("Teams 群组", "Teams groups") + "</th><th>" + t("身份", "Identity") + "</th><th>" + t("关联账号", "Linked account") + "</th>" +
        '</tr></thead><tbody><tr><td colspan="7" class="loading">' + t("载入中…", "Loading…") + "</td></tr></tbody></table></div>" +
      '<p class="muted" id="ufoot" style="font-size:.8rem"></p>';
    var sel = $("dsel");
    if (sel) sel.addEventListener("change", function () { if (this.value === "*") state.allDomains = true; else { state.allDomains = false; currentDomain = this.value; } viewUsers(); });
    $("urole").addEventListener("change", function () { state.userRole = this.value; renderUsers(); });
    $("ubar").addEventListener("click", function (e) {
      var c = e.target.closest(".chip[data-f]"); if (!c) return;
      state.userFilter = c.getAttribute("data-f");
      $("ubar").querySelectorAll(".chip").forEach(function (x) { x.setAttribute("aria-pressed", x === c ? "true" : "false"); });
      renderUsers();
    });
    $("uq").addEventListener("input", debounce(function () { state.userQ = $("uq").value.trim(); renderUsers(); }, 120));
    function bindSync(btnId, mode) {
      var b = $(btnId); if (!b) return;
      b.addEventListener("click", function () {
        var dom = currentDomain;
        $("usNew").disabled = true; if ($("usFull")) $("usFull").disabled = true;
        $("ufoot").textContent = t("正在同步…", "Syncing…");
        runSync(dom, mode, function (st) { $("ufoot").textContent = t("正在同步 ", "Syncing ") + dname(dom) + "：" + (st.total - st.remaining) + " / " + st.total; })
          .then(function (st) { $("ufoot").textContent = t("同步完成：", "Sync complete: ") + st.users + t(" 个账号", " accounts") + (st.added ? t("，更新 ", ", ") + st.added + (EN ? " changed" : " 个") : "") + (st.removed ? t("，删除 ", ", ") + st.removed + (EN ? " removed" : " 个") : ""); return loadDomainData("users"); })
          .then(renderUsers).catch(showUsersError)
          .then(function () { $("usNew").disabled = false; if ($("usFull")) $("usFull").disabled = false; });
      });
    }
    bindSync("usNew", "changes"); bindSync("usFull", "full");
    $("csv").addEventListener("click", exportUsersCsv);
    $("ukpi").addEventListener("click", function (e) {
      var k = e.target.closest(".kpi[data-kf]"); if (!k) return;
      var f = k.getAttribute("data-kf");
      if (f === "groups") { if (!state.allDomains) location.hash = "#/domain/groups"; return; }
      if (f === "teacher") { state.userRole = state.userRole === "role:teacher" ? "" : "role:teacher"; $("urole").value = state.userRole; renderUsers(); return; }
      state.userFilter = f; renderUsers();
    });
    var nu = $("newUser"); if (nu) nu.addEventListener("click", function () { openNewUserPanel(currentDomain); });
    $("utable").addEventListener("click", function (e) {
      var gb = e.target.closest("button[data-group]");
      var trd = e.target.closest("tr[data-dom]"), rowDom = trd ? trd.getAttribute("data-dom") : "";
      if (gb) { e.stopPropagation(); openGroupPanel(gb.getAttribute("data-group"), rowDom || currentDomain); return; }
      var tr = e.target.closest("tr[data-upn]"); if (!tr) return;
      document.querySelectorAll("table.data tr.sel").forEach(function (x) { x.classList.remove("sel"); });
      tr.classList.add("sel");
      openUserPanel(tr.getAttribute("data-upn"), rowDom || undefined);
    });
    (state.allDomains ? loadAllUsers() : loadDomainData("users")).then(renderUsers).catch(showUsersError);
  }
  function showUsersError(e) { var tb = $("utable") && $("utable").tBodies[0]; if (tb) tb.innerHTML = '<tr><td colspan="7"><div class="msg err">' + esc(e.message || e) + "</div></td></tr>"; }
  function usersNow() { var d = state.domainUsers[currentDomain]; return d ? d.users : []; }
  function renderUsers() {
    if (!$("utable")) return;
    var d = usersTable(); if (!d) return;
    var q = state.userQ.toLowerCase(), f = state.userFilter, role = state.userRole;
    function hasRole(u, kind) {
      var rs = (u.roles || []).map(function (r) { return r.role || r; });
      if (kind === "any") return rs.length > 0;
      if (kind === "it") return rs.some(function (r) { return /^domain_(it|admin):/.test(r); });
      if (kind === "hive") return rs.some(function (r) { return /^domain_(hive|admin):/.test(r); });
      if (kind === "staff") return rs.some(function (r) { return /^staff:/.test(r) || r === "coordinator"; });
      if (kind === "admin") return rs.some(function (r) { return r === "admin" || r === "staff:sysadmin"; });
      // 蜂巢课程教师 (Rick, 2026-10-08): from the Hive Teachers table, or any account whose identity is 老师.
      if (kind === "teacher") return !!u.hiveTeacher || u.identity === "老师";
      return true;
    }
    var rows = d.users.filter(function (u) {
      if (f === "noauth" && u.verified !== false) return false;
      if (f === "noid" && u.identity) return false;
      if (f === "never" && u.lastSignIn) return false;
      if (f === "anomaly" && !u.anomaly) return false;
      if (role.indexOf("id:") === 0 && u.identity !== role.slice(3)) return false;
      if (role.indexOf("role:") === 0 && !hasRole(u, role.slice(5))) return false;
      if (q) {
        var hay = [u.upn, u.displayName, u.identity, u.linked.join(" "), u.groups.map(function (g) { return g.name; }).join(" "), u.devices.map(function (x) { return x.name; }).join(" "), u.domain ? dname(u.domain) : "", (u.roles || []).map(function (r) { return (EN ? r.en : r.zh) || r.role || ""; }).join(" ")].join(" ").toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
    var teachers = d.users.filter(function (u) { return u.hiveTeacher || u.identity === "老师"; }).length;
    var anomalies = d.users.filter(function (u) { return u.anomaly; }).length;
    var n = d.users.length, noauth = d.users.filter(function (u) { return u.verified === false; }).length, noid = d.users.filter(function (u) { return !u.identity; }).length;
    // Never signed in to Microsoft 365 (no successful sign-in on record — Rick, 2026-10-04:
    // 「Display how many users haven't login office 365 successfully」). The date comes from
    // Entra's signInActivity; when the tenant does not expose it, nobody has one and the
    // tile says so instead of a number.
    var never = d.users.filter(function (u) { return !u.lastSignIn; }).length, anySignIn = d.users.some(function (u) { return u.lastSignIn; });
    // The tiles are buttons (Rick, 2026-10-05: 「这些数字是否可以点击？显示相应的账户列表」):
    // each applies its filter to the table below; 群组 goes to the Teams 群组 page.
    function kpi(f, label, value, cls, sub) { return '<button type="button" class="kpi' + (f && state.userFilter === f ? " on" : "") + '" data-kf="' + f + '"><div class="l">' + label + '</div><div class="v' + (cls || "") + '">' + value + "</div>" + (sub || "") + "</button>"; }
    $("ukpi").innerHTML = kpi("all", t("账号", "Accounts"), n) +
      kpi("never", t("从未登录", "Never signed in"), anySignIn || !n ? never : "—", never && anySignIn ? " warn" : "", anySignIn || !n ? "" : '<div class="s">' + t("租户未提供登录记录", "No sign-in records from the tenant") + "</div>") +
      kpi("noauth", t("未登记验证器", "No authenticator"), noauth, noauth ? " bad" : "") +
      kpi("noid", t("身份未填", "No identity"), noid) +
      (anomalies ? kpi("anomaly", t("异常 Teams 数据", "Teams data anomalies"), anomalies, " bad", '<div class="s">' + t("身份与许可证不符", "identity contradicts the licence") + "</div>") : "") +
      (teachers ? '<button type="button" class="kpi' + (state.userRole === "role:teacher" ? " on" : "") + '" data-kf="teacher"><div class="l">' + t("蜂巢课程教师", "Hive course teachers") + '</div><div class="v">' + teachers + "</div></button>" : "") +
      (d.all ? kpi("", t("学校", "Schools"), allDomainList().length) : kpi("groups", t("群组", "Groups"), state.domainGroups[currentDomain] ? state.domainGroups[currentDomain].groups.length : uniqueGroups(d.users)));
    $("ubar").querySelectorAll(".chip[data-f]").forEach(function (c) { c.setAttribute("aria-pressed", c.getAttribute("data-f") === state.userFilter ? "true" : "false"); });
    $("utable").tBodies[0].innerHTML = rows.length ? rows.map(function (u) {
      var auth = u.verified === null ? '<span class="tag">?</span>' : u.verified ? '<span class="tag ok">Yes</span>' : '<span class="tag bad">No</span>';
      // One line per account (Rick, 2026-10-05): details that used to take a second line
      // sit behind an ⓘ (hover, or tap/click to focus) — last sign-in beside the name,
      // version and date behind the device; a second device becomes "+1".
      var dev;
      if (u.devices.length) {
        var d0 = u.devices[0];
        var tip = u.devices.map(function (x) { return x.name + (x.version ? " · " + x.version : "") + (x.created ? " · " + t("添加于 ", "added ") + day(x.created) : ""); }).join("\n");
        dev = '<span class="cell-ell" title="' + esc(d0.name) + '">' + esc(d0.name) + "</span>" + (u.devices.length > 1 ? ' <span class="tag muted">+' + (u.devices.length - 1) + "</span>" : "") + ' <span class="info" tabindex="0" data-tip="' + esc(tip) + '">i</span>';
      } else {
        dev = u.otherMethods.length ? '<span class="muted">' + esc(u.otherMethods.map(function (k) { return (KIND[k] || [k, k])[EN ? 1 : 0]; }).join(", ")) + "</span>" : '<span class="muted">—</span>';
      }
      var gs = u.groups.filter(function (g) { return g.kind === "team" || g.kind === "class" || g.kind === "m365"; });
      var gl = gs.slice(0, 2).map(function (g) { return '<button class="tag link" type="button" data-group="' + esc(g.id) + '" title="' + esc(g.name) + '">' + hl(gname(g), state.userQ) + "</button>"; }).join("") + (gs.length > 2 ? '<span class="tag muted" title="' + esc(gs.slice(2).map(function (g) { return gname(g); }).join(", ")) + '">+' + (gs.length - 2) + "</span>" : "");
      var signTip = u.lastSignIn ? t("最近登录 ", "Last sign-in ") + when(u.lastSignIn) : t("从未登录", "Never signed in");
      var roleTags = (u.roles || []).length ? ' <span class="info" tabindex="0" data-tip="' + esc((u.roles || []).map(function (r) { return EN ? (r.en || r.role) : (r.zh || r.role); }).join("\n")) + '">i</span>' : "";
      return '<tr class="pick" data-upn="' + esc(u.upn) + '"' + (u.domain ? ' data-dom="' + esc(u.domain) + '"' : "") + '><td class="acct">' + hl(u.upn, state.userQ) + (u.enabled ? "" : ' <span class="tag bad">' + t("已停用", "Disabled") + "</span>") + "</td>" +
        '<td class="nowrap"><span class="dn">' + hl(u.displayName, state.userQ) + '</span> <span class="info' + (u.lastSignIn ? "" : " never") + '" tabindex="0" data-tip="' + esc(signTip) + '">i</span></td>' +
        '<td class="nowrap">' + auth + '</td><td class="nowrap devcell">' + dev + '</td><td><div class="tags nowrap">' + (gl || '<span class="muted">—</span>') + "</div></td>" +
        '<td class="nowrap">' + (u.identity ? '<span class="tag accent">' + esc(vl(u.identity)) + "</span>" : '<span class="muted">—</span>') + (u.anomaly ? ' <span class="tag bad" title="' + esc(anomalyText(u)) + '">' + t("异常", "Anomaly") + "</span>" : "") + (u.hiveTeacher ? ' <span class="tag ok" title="' + esc(t("蜂巢课程教师", "Hive course teacher") + (u.hiveTeacher.teacherId ? " · " + u.hiveTeacher.teacherId : "")) + '">' + t("课程教师", "Course teacher") + "</span>" : "") + ((u.roles || []).length ? ' <span class="tag">' + t("角色", "Role") + "</span>" + roleTags : "") + "</td>" +
        '<td class="nowrap">' + (u.linked.length ? '<span class="cell-ell" title="' + esc(u.linked.join(", ")) + '">' + u.linked.map(function (l) { return hl(l, state.userQ); }).join(", ") + "</span>" : '<span class="muted">—</span>') + "</td></tr>";
    }).join("") : '<tr><td colspan="7"><div class="empty">' + t("没有匹配的账号。", "No matching accounts.") + "</div></td></tr>";
    $("ufoot").textContent = t("共 " + rows.length + " / " + n + " 个账号" + (d.all ? "（" + allDomainList().length + " 所学校）" : "") + " · ", rows.length + " of " + n + " accounts" + (d.all ? " (" + allDomainList().length + " schools)" : "") + " · ") + (d.sync ? syncLine(d.sync) : "") + (d.partial ? t(" · 部分账号的方法或群组没有读到", " · some accounts' methods or groups could not be read") : "");
  }
  function uniqueGroups(users) { var s = {}; users.forEach(function (u) { u.groups.forEach(function (g) { s[g.id] = 1; }); }); return Object.keys(s).length; }
  function exportUsersCsv() {
    var d = usersTable(); if (!d) return;
    var cols = [t("账号", "Account"), t("学校", "School"), t("显示名", "Display name"), t("验证", "Authentication"), t("验证设备", "Devices"), t("Teams 群组", "Groups"), t("身份", "Identity"), t("蜂巢角色", "Hive roles"), t("蜂巢课程教师", "Hive course teacher"), t("关联账号", "Linked"), t("最近登录", "Last sign-in"), t("已启用", "Enabled")];
    var cell = function (v) { var s = v == null ? "" : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    var lines = [cols.join(",")].concat(d.users.map(function (u) {
      return [u.upn, dname(u.domain || currentDomain), u.displayName, u.verified === null ? "" : u.verified ? "Yes" : "No", u.devices.map(function (x) { return x.name; }).join("; "), u.groups.map(function (g) { return g.name; }).join("; "), u.identity, (u.roles || []).map(function (r) { return EN ? (r.en || r.role) : (r.zh || r.role); }).join("; "), u.hiveTeacher ? "Yes" : "", u.linked.join("; "), u.lastSignIn || "", u.enabled ? "Yes" : "No"].map(cell).join(",");
    }));
    var blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = (d.all ? "all-schools" : currentDomain) + "-users-" + new Date().toISOString().slice(0, 10) + ".csv"; a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }
  var IDENTITIES = ["家长", "学生", "老师", "行政", "教育顾问"]; // = IDENTITIES in api/shared/people.js
  // 异常 Teams 数据 (Rick, 2026-10-08): the identity contradicts the licence — most likely a licence assigned wrongly.
  function anomalyText(u) {
    if (u.anomaly === "student_without_student_plan") return t("异常：身份是学生，但账号没有学生版 A1 许可证——许可证可能分配错了", "Anomaly: identity is Student but the account has no A1 for students licence — the licence may be assigned wrongly");
    if (u.anomaly === "student_plan_not_student") return t("异常：账号持学生版 A1 许可证，身份却是 " + (u.identity || "") + "——许可证可能分配错了", "Anomaly: the account holds A1 for students but its identity is " + (u.identity || "") + " — the licence may be assigned wrongly");
    return "";
  }
  function openUserPanel(upn, domain, opts) {
    opts = opts || {};
    var where = opts.beside ? "second" : undefined;
    // A member of a school this person does not manage (or a guest): a small card with
    // what the group told us, since the directory cache of that school is not theirs to read.
    var managed = !!(domain && dinfo(domain));
    if (opts.beside && (!managed || opts.card)) {
      panelOpen('<div class="ph"><span class="avatar" style="background:' + hue(upn) + '">' + esc(initials(opts.name || upn)) + "</span><h3>" + esc(opts.name || upn) + '</h3><button class="x" type="button" aria-label="close">✕</button></div>' +
        '<div class="pb"><div class="kv"><span class="k">' + t("账号", "Account") + "</span><span>" + esc(upn) + "</span>" +
        '<span class="k">' + t("学校", "School") + "</span><span>" + (managed ? dlabel(domain) : esc(domain || "—")) + "</span>" +
        (opts.owner ? '<span class="k">' + t("在此群组", "In this group") + '</span><span><span class="tag accent">' + t("所有者", "Owner") + "</span></span>" : "") + "</div>" +
        '<div class="note">' + (managed ? t("该账号不在这所学校的目录缓存里（可能是访客账号，或还没有同步）。", "This account is not in that school's directory cache (a guest account, or not synced yet).")
          : t("更多信息只有该机构的管理员或蜂巢员工可以查看。", "More details are visible only to that institution's administrators or Hive staff.")) + "</div></div>", "second");
      return;
    }
    if (domain) currentDomain = domain;
    var u = usersNow().filter(function (x) { return x.upn === upn; })[0];
    if (!u) { // not loaded yet (opened from a group in another school): load, then open
      if (opts.beside) panelOpen('<div class="ph"><h3>' + esc(opts.name || upn) + '</h3><button class="x" type="button" aria-label="close">✕</button></div><div class="pb"><div class="loading">' + t("载入中…", "Loading…") + "</div></div>", "second");
      loadDomainData("users").then(function () {
        if (usersNow().some(function (x) { return x.upn === upn; })) openUserPanel(upn, currentDomain, opts);
        else if (opts.beside) openUserPanel(upn, domain, Object.assign({ card: true }, opts)); // not in that school's cache (a guest, or not synced yet): the small card
      });
      return;
    }
    var kids = (u.extra && u.extra.children) || [];
    var isSelf = !!(me && me.profile && me.profile.upn && me.profile.upn.toLowerCase() === String(u.upn).toLowerCase());
    var idOpts = ['<option value="">' + t("— 未填 —", "— not set —") + "</option>"].concat(IDENTITIES.map(function (i) { return '<option value="' + i + '"' + (u.identity === i ? " selected" : "") + ">" + esc(vl(i)) + "</option>"; })).join("");
    panelOpen(
      '<div class="ph"><span class="avatar">' + esc(initials(u.displayName || u.upn)) + "</span><h3>" + esc(u.displayName || u.upn) + '</h3><button class="x" type="button" aria-label="close">✕</button></div>' +
      '<div class="pb">' +
        '<div class="kv"><span class="k">' + t("账号", "Account") + "</span><span>" + esc(u.upn) + "</span>" +
          '<span class="k">' + t("学校", "School") + "</span><span>" + dlabel(currentDomain) + "</span>" +
          '<span class="k">' + t("身份", "Identity") + "</span><span>" + (u.identity ? '<span class="tag accent">' + esc(vl(u.identity)) + "</span>" : '<span class="muted">—</span>') + "</span>" +
          '<span class="k">' + t("角色", "Roles") + "</span><span>" + ((u.roles || []).length ? u.roles.map(function (r) { return esc(EN ? r.en : r.zh); }).join("<br/>") : '<span class="muted">' + t("普通用户", "User") + "</span>") + "</span>" +
          '<span class="k">' + t("安全邮箱", "Safe email") + "</span><span>" + (u.safeEmail ? esc(u.safeEmail) : '<span class="muted">—</span>') + "</span>" +
          '<span class="k">' + t("城市", "City") + "</span><span>" + (u.city ? esc(u.city) : '<span class="muted">—</span>') + "</span>" +
          '<span class="k">' + t("孩子", "Children") + "</span><span>" + (kids.length ? kids.length + t(" 个", "") + (kids.some(function (c) { return c.account; }) ? ' <span class="muted">' + kids.filter(function (c) { return c.account; }).map(function (c) { return c.account; }).join(", ") + "</span>" : "") : '<span class="muted">—</span>') + "</span>" +
          '<span class="k">' + t("验证", "Authentication") + "</span><span>" + (u.verified === null ? "?" : u.verified ? '<span class="tag ok">Yes</span>' : '<span class="tag bad">No</span>') + "</span>" +
          '<span class="k">' + t("最近登录", "Last sign-in") + "</span><span>" + esc(when(u.lastSignIn) || "—") + "</span>" +
          '<span class="k">' + t("创建", "Created") + "</span><span>" + esc(day(u.created) || "—") + "</span>" +
          '<span class="k">' + t("状态", "Status") + "</span><span>" + (u.enabled ? t("已启用", "Enabled") : '<span class="tag bad">' + t("已停用", "Disabled") + "</span>") + "</span></div>" +
        "<h4>" + t("验证设备", "Authentication devices") + '</h4><div id="pdev">' + (u.devices.length ? u.devices.map(function (x) {
          return '<div class="devrow"><div class="m"><b>' + esc(x.name) + "</b><small>" + esc((KIND[x.kind] || [x.kind, x.kind])[EN ? 1 : 0]) + (x.version ? " · " + esc(x.version) : "") + (x.created ? " · " + esc(day(x.created)) : "") + "</small></div>" +
            (canDo("methods") ? '<button class="btn danger sm" type="button" data-del="' + esc(x.id) + '" data-name="' + esc(x.name) + '">' + t("删除", "Delete") + "</button>" : "") + "</div>";
        }).join("") : '<div class="muted" style="font-size:.86rem">' + t("没有登记验证器。", "No authenticator registered.") + "</div>") + "</div>" +
        (canDo("methods") ? '<div class="note">' + t("删除后对方下次登录要重新绑定验证器；唯一的设备不要在他还没准备好新手机时删。", "After a delete the person links an authenticator afresh at the next sign-in; do not remove the only device before they have the new phone ready.") + "</div>" +
          (isSelf ? "" : "<h4>" + t("密码", "Password") + '</h4><div id="ppw"><div class="devrow"><div class="m"><b>' + t("重置密码", "Reset password") + "</b><small>" + t("生成一个临时密码，对方下次登录必须改掉。", "Makes a temporary password that must be changed at the next sign-in.") + '</small></div><button class="btn secondary sm" type="button" id="pwReset">' + t("重置", "Reset") + "</button></div></div>") +
          (isSelf || (u.roles || []).length ? "" : "<h4>" + t("删除账号", "Delete account") + '</h4><div class="devrow"><div class="m"><b>' + t("删除这个账号", "Delete this account") + "</b><small>" + t("账号、邮箱和 OneDrive 进入微软的回收站，30 天内可由系统管理员在 Microsoft 365 管理中心恢复。", "The account, mailbox and OneDrive go to Microsoft's recycle bin; restorable for 30 days in the Microsoft 365 admin center.") + '</small></div><button class="btn danger sm" type="button" id="uDel">' + t("删除", "Delete") + "</button></div>")
          : '<div class="note">' + t("登录设备由域管理员（IT）管理。", "Sign-in devices are managed by the domain administrator (IT).") + "</div>") +
        "<h4>" + t("Teams 群组", "Teams groups") + '</h4><div class="tags" style="display:flex;gap:4px;flex-wrap:wrap">' + (u.groups.length ? u.groups.map(function (g) { return '<button class="tag link' + (g.kind === "team" || g.kind === "class" ? " accent" : "") + '" type="button" data-group="' + esc(g.id) + '" title="' + esc(g.name) + '">' + esc(gname(g)) + "</button>"; }).join("") : '<span class="muted">—</span>') + "</div>" +
        (u.extra ? "<h4>" + t("补充资料（本人填写）", "More about them (self-reported)") + '</h4><div class="kv">' +
          ((u.extra.roles || []).length ? '<span class="k">' + t("身份/角色", "Roles") + "</span><span>" + esc(u.extra.roles.map(vl).join("、") + (u.extra.rolesOther ? "（" + u.extra.rolesOther + "）" : "")) + "</span>" : "") +
          ((u.extra.topics || []).length ? '<span class="k">' + t("感兴趣", "Topics") + "</span><span>" + esc(u.extra.topics.map(function (x) { return x === "其它" && u.extra.topicsOther ? u.extra.topicsOther : vl(x); }).join(EN ? ", " : "、")) + "</span>" : "") +
          ((u.extra.otherAccounts || []).length ? '<span class="k">' + t("其它账号", "Other accounts") + "</span><span>" + esc(u.extra.otherAccounts.join(", ")) + "</span>" : "") +
          (u.extra.children || []).map(function (c, i) {
            var bits = [];
            if (c.age != null) bits.push(c.age + t(" 岁", " y"));
            if (c.grade) bits.push(t("年级 ", "Grade ") + vl(c.grade));
            if (c.schooling) bits.push(vl(c.schooling));
            if (c.model) bits.push(c.model === "其它" ? (c.modelOther || vl(c.model)) : vl(c.model));
            if (c.higherEd && c.higherEd.length) bits.push((Array.isArray(c.higherEd) ? c.higherEd : [c.higherEd]).map(vl).join("/") + (c.higherEdOther ? "（" + c.higherEdOther + "）" : ""));
            if (c.account) bits.push(c.account);
            return '<span class="k">' + t("孩子 ", "Child ") + (i + 1) + (c.name ? " · " + esc(c.name) : "") + "</span><span>" + esc(bits.join(" · ") || "—") + "</span>";
          }).join("") + "</div>" : "") +
        "<h4>" + t("身份和关联账号", "Identity and linked accounts") + "</h4>" +
        (canDo("people") ? '<form id="pform"><label class="f">' + t("身份", "Identity") + '<select id="pid">' + idOpts + "</select>" + (u.identitySource === "entra" ? "<small>" + t("来自 Entra 的部门字段", "From Entra's department field") + "</small>" : u.identitySource === "licence" ? "<small>" + t("按许可证推断（学生版 A1 → 学生，其余 → 家长）；填写后以填写为准", "Inferred from the licence (A1 for students → student, otherwise parent); what you set here wins") + "</small>" : "") + (u.anomaly ? '<small class="bad">' + esc(anomalyText(u)) + "</small>" : "") + "</label>" +
          '<label class="f" style="margin-top:8px">' + t("关联账号（孩子 / 家长的 Teams 账号，多个用逗号分开）", "Linked accounts (child / parent Teams accounts, comma-separated)") + '<input type="text" id="plink" value="' + esc(u.linked.join(", ")) + '" placeholder="student@' + esc(currentDomain) + '" /></label>' +
          '<label class="f" style="margin-top:8px">' + t("备注", "Note") + '<input type="text" id="pnote" maxlength="200" value="' + esc(u.note) + '" /></label>' +
          '<div class="actions"><button class="btn" type="submit" id="psave">' + t("保存", "Save") + '</button></div><div id="pmsg"></div></form>'
        : '<div class="kv"><span class="k">' + t("身份", "Identity") + "</span><span>" + esc(u.identity ? vl(u.identity) : "—") + '</span><span class="k">' + t("关联账号", "Linked") + "</span><span>" + esc(u.linked.join(", ") || "—") + "</span>" + (u.note ? '<span class="k">' + t("备注", "Note") + "</span><span>" + esc(u.note) + "</span>" : "") + '</div><div class="note">' + t("身份和关联由域蜂巢管理员或蜂巢员工维护。", "Identity and links are maintained by the domain Hive administrator or Hive staff.") + "</div>") +
      "</div>", where);
    if ($("pform")) $("pform").addEventListener("submit", function (ev) {
      ev.preventDefault(); savingButton($("psave"));
      post("domain/person", "PATCH", { domain: currentDomain, user: u.upn, identity: $("pid").value, linked: $("plink").value, note: $("pnote").value }).then(function (r) {
        if (!r.ok) { restoreButton($("psave")); $("pmsg").innerHTML = '<div class="msg err">' + esc(errText(r)) + "</div>"; return; }
        var rec = r.body.record || {};
        u.identity = rec.identity || (u.identitySource === "entra" || u.identitySource === "licence" ? u.identity : ""); u.identitySource = rec.identity ? "hive" : u.identitySource;
        u.linked = rec.linked || []; u.note = rec.note || "";
        renderUsers();
        savedAndClose($("psave"), t("已保存 ", "Saved ") + "<b>" + esc(u.displayName || u.upn) + "</b>" + t(" 的身份、关联账号和备注。", "'s identity, linked accounts and note."), opts && opts.beside ? "second" : "");
      });
    });
    // 重置密码: one confirm, then the temporary password is shown once, with a copy
    // button, and never again (it is not stored anywhere). The admin passes it on
    // by phone or in person; Microsoft asks for a new password at the first sign-in.
    var pwBtn = $("pwReset");
    if (pwBtn) pwBtn.addEventListener("click", function () {
      if (!window.confirm(t("重置 " + (u.displayName || u.upn) + " 的密码？对方现有密码立即失效，下次登录要用临时密码并设置新密码。", "Reset " + (u.displayName || u.upn) + "'s password? The current password stops working at once; they sign in with the temporary one and set a new password."))) return;
      pwBtn.disabled = true; pwBtn.textContent = t("重置中…", "Resetting…");
      post("domain/password", "POST", { domain: currentDomain, user: u.upn }).then(function (r) {
        if (!r.ok) { pwBtn.disabled = false; pwBtn.textContent = t("重置", "Reset"); $("pmsg").innerHTML = '<div class="msg err">' + esc(errText(r)) + "</div>"; return; }
        $("ppw").innerHTML = '<div class="pwbox"><div class="lbl">' + t("临时密码（只显示这一次）", "Temporary password (shown only once)") + '</div><div class="val"><code id="pwVal">' + esc(r.body.password) + '</code><button class="btn secondary sm" type="button" id="pwCopy">' + t("复制", "Copy") + "</button></div>" +
          "<small>" + t("有效期：对方的旧密码已立即失效，这个临时密码在对方用它登录并设置新密码之前一直有效——请尽快电话或当面告知，并提醒对方尽快登录。关闭面板后不再显示。", "Validity: the old password has stopped working now; this temporary one stays valid until they sign in with it and set a new password — pass it on by phone or in person soon, and ask them to sign in promptly. It is not shown again after this panel closes.") + "</small></div>";
        $("pwCopy").addEventListener("click", function () {
          var v = $("pwVal").textContent;
          var done = function () { $("pwCopy").textContent = t("已复制 ✓", "Copied ✓"); };
          if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(v).then(done, function () { window.prompt(t("复制临时密码：", "Copy the temporary password:"), v); });
          else window.prompt(t("复制临时密码：", "Copy the temporary password:"), v);
        });
      });
    });
    // 删除账号 (Rick, 2026-10-05): type the account name to confirm — a deletion is the one
    // action here that takes a mailbox and files with it.
    var delBtn = $("uDel");
    if (delBtn) delBtn.addEventListener("click", function () {
      var typed = window.prompt(t("删除 " + (u.displayName || u.upn) + " 的账号？\n账号、邮箱和 OneDrive 将进入微软回收站（30 天内可恢复）。\n请输入该账号以确认：", "Delete " + (u.displayName || u.upn) + "'s account?\nAccount, mailbox and OneDrive go to Microsoft's recycle bin (restorable for 30 days).\nType the account name to confirm:"), "");
      if (typed === null) return;
      if (typed.trim().toLowerCase() !== u.upn.toLowerCase()) { $("pmsg").innerHTML = '<div class="msg err">' + t("输入的账号不一致，未删除。", "The account name did not match; nothing was deleted.") + "</div>"; return; }
      savingButton(delBtn, t("删除中…", "Deleting…"));
      post("domain/user", "DELETE", { domain: currentDomain, user: u.upn }).then(function (r) {
        if (!r.ok) { restoreButton(delBtn); $("pmsg").innerHTML = '<div class="msg err">' + esc(errText(r)) + "</div>"; return; }
        var d = state.domainUsers[currentDomain]; if (d) d.users = d.users.filter(function (x) { return x.upn !== u.upn; });
        var da = state.domainUsers["*"]; if (da) da.users = da.users.filter(function (x) { return x.upn !== u.upn; });
        // The groups cache lists members: drop it so the Teams 群组 page re-reads (the
        // server derives group members from the user cache, which the delete already
        // updated) instead of still showing the deleted account among the members.
        delete state.domainGroups[currentDomain];
        renderUsers();
        delBtn.textContent = t("已删除 ✓", "Deleted ✓");
        savedAndClose(null, t("已删除 ", "Deleted ") + "<b>" + esc(u.displayName || u.upn) + "</b>" + t(" 的账号；30 天内可在 Microsoft 365 管理中心恢复。", "'s account; restorable for 30 days in the Microsoft 365 admin center."), opts && opts.beside ? "second" : "");
      });
    });
    $("pdev").addEventListener("click", function (ev) {
      var b = ev.target.closest("button[data-del]"); if (!b) return;
      var name = b.getAttribute("data-name");
      if (!window.confirm(t("删除 " + u.displayName + " 的设备「" + name + "」？", "Delete " + u.displayName + "'s device \"" + name + "\"?"))) return;
      b.disabled = true;
      post("domain/method", "DELETE", { domain: currentDomain, user: u.upn, id: b.getAttribute("data-del") }).then(function (r) {
        if (!r.ok) { b.disabled = false; $("pmsg").innerHTML = '<div class="msg err">' + esc(errText(r)) + "</div>"; return; }
        u.devices = u.devices.filter(function (x) { return x.id !== b.getAttribute("data-del"); }); u.verified = u.devices.length > 0;
        renderUsers(); openUserPanel(u.upn, currentDomain, opts);
      });
    });
  }

  // 新建账号 (Rick, 2026-10-04): a 域管理员（IT）creates an account in their own school.
  // Form → POST /api/domain/user → the result card with the temporary password shown
  // once; the new row appears in the table without a sync.
  function openNewUserPanel(domain) {
    var dom = domain || currentDomain;
    panelOpen(
      '<div class="ph"><span class="avatar">＋</span><h3>' + t("新建账号", "New account") + " · " + esc(dname(dom)) + '</h3><button class="x" type="button" aria-label="close">✕</button></div>' +
      '<div class="pb"><form id="nuf" autocomplete="off">' +
        '<div class="grid2"><label class="f">' + t("姓", "Surname") + '<input type="text" id="nuSur" maxlength="40" /></label><label class="f">' + t("名", "Given name") + '<input type="text" id="nuGiv" maxlength="40" /></label></div>' +
        '<label class="f">' + t("显示名", "Display name") + '<input type="text" id="nuDisp" maxlength="64" placeholder="' + t("留空则自动：李明 / Ann Lee", "Blank = automatic: 李明 / Ann Lee") + '" /></label>' +
        '<label class="f">' + t("账号", "Account") + '<div class="upnrow"><input type="text" id="nuAcct" maxlength="63" placeholder="li.ming" /><span class="upnsuf">@' + esc(dom) + '</span></div><small>' + t("字母、数字和 . _ -；建议「名.姓」拼音，如 li.ming。", "Letters, digits and . _ -; pinyin given.surname is the usual form, e.g. li.ming.") + "</small></label>" +
        '<div class="grid2"><label class="f">' + t("身份", "Role") + ' <span class="req">*</span><select id="nuId"><option value="">' + t("请选择…", "Choose…") + "</option>" + IDENTITIES.map(function (i) { return '<option value="' + i + '">' + esc(vl(i)) + "</option>"; }).join("") + "</select></label>" +
        '<label class="f">' + t("职务（可选）", "Job title (optional)") + '<input type="text" id="nuJob" maxlength="60" placeholder="' + t("如：数学老师", "e.g. Maths teacher") + '" /></label></div>' +
        '<div class="grid2"><label class="f">' + t("所在城市", "City") + ' <span class="req">*</span><input type="text" id="nuCity" maxlength="40" /></label>' +
        '<label class="f">' + t("邮编", "Postcode") + ' <span class="req">*</span><input type="text" id="nuZip" maxlength="12" inputmode="numeric" /></label></div>' +
        '<div class="f-title">' + t("许可证", "Licence") + ' <span class="req">*</span></div><div id="nuPlans" class="plans"><div class="muted" style="font-size:12px">' + t("载入中…", "Loading…") + "</div></div>" +
        '<p class="muted" style="font-size:12px;margin:4px 0 0">' + t("每个新账号同时获得 Microsoft Power Automate Free。没有许可证的账号不能使用 Teams 和 Outlook。", "Every new account also gets Microsoft Power Automate Free. Without a licence the account cannot use Teams or Outlook.") + "</p>" +
        '<div class="actions"><button class="btn" type="submit" id="nuSave">' + t("创建账号", "Create account") + "</button></div><div id=\"nuMsg\"></div></form></div>");
    var lic = null, usage = "CN";
    function planCard(key, pl, note) {
      if (!pl) return '<div class="plan off"><b>' + (key === "student" ? "Office 365 A1 for students" : "Office 365 A1 for faculty") + "</b><small>" + t("租户里没有这个方案", "Not in this tenant") + "</small></div>";
      return '<label class="plan' + (pl.free ? "" : " off") + '"><input type="radio" name="nuPlan" value="' + key + '"' + (pl.free ? "" : " disabled") + ' /><span class="plantxt"><b>' + esc(pl.name) + "</b><small>" + esc(note) + " · " + (pl.free ? t("剩余 ", "") + pl.free + t(" 个", " free") : t("已用完", "none free")) + "</small></span></label>";
    }
    api("domain/licenses?domain=" + encodeURIComponent(dom)).then(function (r) {
      var box = $("nuPlans"); if (!box) return;
      if (!r.ok) { box.innerHTML = '<div class="msg err">' + esc(errText(r)) + "</div>"; return; }
      lic = r.body; usage = r.body.usageLocation || "CN";
      box.innerHTML = planCard("faculty", lic.faculty, t("老师、家长、行政", "teachers, parents, staff")) + planCard("student", lic.student, t("仅限学生", "students only"));
      pickPlan();
    });
    // The role decides the plan: 学生 → A1 for students (students only), everyone else → A1 for faculty.
    function pickPlan() {
      var id = $("nuId").value; if (!id) return;
      var want = id === "学生" ? "student" : "faculty";
      var inp = $("nuPlans").querySelector('input[value="' + want + '"]'); if (inp && !inp.disabled) inp.checked = true;
      var other = $("nuPlans").querySelector('input[value="' + (want === "student" ? "faculty" : "student") + '"]'); if (other) other.checked = false;
    }
    $("nuId").addEventListener("change", function () { $("nuMsg").innerHTML = ""; pickPlan(); });
    $("nuPlans").addEventListener("change", function (e) {
      var id = $("nuId").value, v = e.target.value;
      if (v === "student" && id && id !== "学生") { $("nuMsg").innerHTML = '<div class="msg err">' + t("Office 365 A1 for students 仅限学生；", "Office 365 A1 for students is for students only; ") + esc(vl(id)) + t(" 请选 faculty。", " takes the faculty plan.") + "</div>"; pickPlan(); }
      else if (v === "faculty" && id === "学生") { $("nuMsg").innerHTML = '<div class="msg err">' + t("学生请选 Office 365 A1 for students。", "A student takes Office 365 A1 for students.") + "</div>"; pickPlan(); }
      else $("nuMsg").innerHTML = "";
    });
    $("nuf").addEventListener("submit", function (ev) {
      ev.preventDefault();
      var planInp = $("nuPlans").querySelector("input[name=nuPlan]:checked");
      var body = { domain: dom, account: $("nuAcct").value.trim().toLowerCase(), givenName: $("nuGiv").value.trim(), surname: $("nuSur").value.trim(), displayName: $("nuDisp").value.trim(), identity: $("nuId").value, jobTitle: $("nuJob").value.trim(), city: $("nuCity").value.trim(), postalCode: $("nuZip").value.trim(), plan: planInp ? planInp.value : "", usageLocation: usage };
      var missing = [];
      if (!body.account) missing.push(t("账号", "account name"));
      if (!body.displayName && !body.givenName && !body.surname) missing.push(t("姓名", "name"));
      if (!body.identity) missing.push(t("身份", "role"));
      if (!body.city) missing.push(t("所在城市", "city"));
      if (!body.postalCode) missing.push(t("邮编", "postcode"));
      if (!body.plan) missing.push(t("许可证", "licence"));
      if (missing.length) { $("nuMsg").innerHTML = '<div class="msg err">' + t("请填写：", "Please fill in: ") + esc(missing.join(EN ? ", " : "、")) + "</div>"; return; }
      var b = $("nuSave"); b.disabled = true; b.textContent = t("创建中…", "Creating…");
      post("domain/user", "POST", body).then(function (r) {
        if (!r.ok) { b.disabled = false; b.textContent = t("创建账号", "Create account"); $("nuMsg").innerHTML = '<div class="msg err">' + esc(errText(r)) + (r.body && r.body.problems ? " — " + esc(r.body.problems.join("；")) : "") + "</div>"; return; }
        delete state.domainUsers[dom]; delete state.domainUsers["*"];
        var res = r.body;
        $("panel").querySelector(".pb").innerHTML =
          '<div class="msg ok">' + t("账号已创建。", "Account created.") + "</div>" +
          '<div class="kv"><span class="k">' + t("账号", "Account") + "</span><span><b>" + esc(res.user) + "</b></span>" +
            '<span class="k">' + t("显示名", "Display name") + "</span><span>" + esc(res.displayName) + "</span>" +
            '<span class="k">' + t("身份", "Role") + "</span><span>" + esc(vl(body.identity)) + "</span>" +
            '<span class="k">' + t("城市 / 邮编", "City / postcode") + "</span><span>" + esc(body.city) + " · " + esc(body.postalCode) + "</span>" +
            '<span class="k">' + t("许可证", "Licences") + "</span><span>" + (res.licence && res.licence.ok ? esc((res.licence.plans || []).join(" + ")) : '<span class="tag bad">' + t("分配失败：", "failed: ") + esc((res.licence && res.licence.error) || "") + "</span>") + "</span></div>" +
          '<div class="pwbox"><div class="lbl">' + t("临时密码（只显示这一次）", "Temporary password (shown only once)") + '</div><div class="val"><code id="pwVal">' + esc(res.password) + '</code><button class="btn secondary sm" type="button" id="pwCopy">' + t("复制", "Copy") + "</button></div>" +
            "<small>" + t("请电话或当面告知对方账号和临时密码。首次登录微软会要求设置新密码，并引导注册验证器——可把设置向导一并发给对方。关闭面板后不再显示。", "Give the account and temporary password by phone or in person. At the first sign-in Microsoft asks for a new password and walks them through registering an authenticator — send them the setup wizard too. Not shown again after this panel closes.") + "</small></div>" +
          '<div class="actions"><a class="btn secondary sm" href="/help/teams-setup.html" target="_blank" rel="noopener">' + t("设置向导 ↗", "Setup wizard ↗") + '</a><button class="btn secondary sm" type="button" id="nuAgain">' + t("再建一个", "Create another") + "</button></div>";
        $("pwCopy").addEventListener("click", function () {
          var v = $("pwVal").textContent, done = function () { $("pwCopy").textContent = t("已复制 ✓", "Copied ✓"); };
          if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(v).then(done, function () { window.prompt(t("复制临时密码：", "Copy the temporary password:"), v); }); else window.prompt(t("复制临时密码：", "Copy the temporary password:"), v);
        });
        $("nuAgain").addEventListener("click", function () { openNewUserPanel(dom); });
        if (location.hash.indexOf("#/domain/users") === 0) loadDomainData("users").then(renderUsers).catch(showUsersError);
      });
    });
  }

  // ================================================================================
  // 本域管理 › Teams 群组 (domain → groups, collapsible)
  // ================================================================================
  // A group, in the side panel: what it is and who of this school is in it; each
  // member opens their own panel (Rick, 2026-10-02).
  function openGroupPanel(id, domain) {
    if (domain) currentDomain = domain;
    var dom = currentDomain;
    var saved = currentDomain;
    Promise.all([loadDomainData("groups"), loadDomainData("users").catch(function () { return null; })]).then(function () {
      currentDomain = saved;
      var g = ((state.domainGroups[dom] || {}).groups || []).filter(function (x) { return x.id === id; })[0];
      if (!g) { panelOpen('<div class="ph"><h3>' + t("群组", "Group") + '</h3><button class="x" type="button" aria-label="close">✕</button></div><div class="pb"><div class="empty">' + t("缓存里没有这个群组，请先同步。", "This group is not in the cache yet — sync first.") + "</div></div>"); return; }
      var people = {}; ((state.domainUsers[dom] || {}).users || []).forEach(function (u) { people[u.upn] = u; });
      var k = GKIND[g.kind] || GKIND.other;
      panelOpen(
        '<div class="ph"><span class="tav" style="width:32px;height:32px;font-size:11px;background:' + hue(g.id) + '">' + esc(initials(gname(g))) + "</span><h3>" + esc(gname(g)) + '</h3><button class="x" type="button" aria-label="close">✕</button></div>' +
        '<div class="pb">' +
          '<div class="kv"><span class="k">' + t("Teams 名称", "Name in Teams") + "</span><span>" + esc(g.name) + "</span>" +
            '<span class="k">' + t("类型", "Type") + "</span><span>" + esc(k[EN ? 1 : 0]) + "</span>" +
            (g.visibility ? '<span class="k">' + t("可见性", "Visibility") + "</span><span>" + (g.visibility === "Public" ? t("公开", "Public") : t("私密", "Private")) + "</span>" : "") +
            (g.mail ? '<span class="k">' + t("邮箱", "Mail") + "</span><span>" + esc(g.mail) + "</span>" : "") +
            '<span class="k">' + t("学校", "School") + "</span><span>" + dlabel(dom) + "</span>" +
            '<span class="k">' + t("本校成员", "Members here") + "</span><span>" + g.domainMembers + "</span>" +
            (g.description ? '<span class="k">' + t("简介", "About") + "</span><span>" + esc(g.description) + "</span>" : "") + "</div>" +
          "<h4>" + t("成员", "Members") + "</h4>" +
          ((g.members || []).length ? g.members.map(function (upn) {
            var u = people[upn];
            return '<button class="mrow link" type="button" data-upn="' + esc(upn) + '" data-domain="' + esc(dom) + '" data-name="' + esc((u && u.displayName) || "") + '"><span class="avatar sm" style="background:' + hue(upn) + '">' + esc(initials((u && u.displayName) || upn)) + '</span><span class="mname">' + esc((u && u.displayName) || "") + '</span><span class="mupn">' + esc(upn) + "</span>" + (u && u.identity ? '<span class="tag">' + esc(vl(u.identity)) + "</span>" : "<span></span>") + "</button>";
          }).join("") : '<div class="muted">' + t("本校没有成员。", "No members from this school.") + "</div>") +
          '<p class="hint">' + t("只读：成员的增减在 Teams 或 Microsoft 365 管理中心完成。", "Read-only: members are added or removed in Teams or the Microsoft 365 admin center.") + "</p>" +
          (canDo("people") ? "<h4>" + t("显示名称（中 / 英）", "Display names (zh / en)") + '</h4><form id="gnf" class="grid2"><label class="f">' + t("中文名", "Chinese name") + '<input type="text" id="gnZh" maxlength="80" value="' + esc(g.nameZh || "") + '" placeholder="' + esc(g.name) + '" /></label><label class="f">' + t("英文名", "English name") + '<input type="text" id="gnEn" maxlength="100" value="' + esc(g.nameEn || "") + '" placeholder="' + esc(g.name) + '" /></label>' +
            '<div class="actions" style="grid-column:1/-1"><button class="btn sm" type="submit" id="gnSave">' + t("保存", "Save") + '</button><span class="muted" style="font-size:12px">' + t("只改管理中心里的显示，不改 Teams 里的名称。", "Changes how the management centre shows the group; the name in Teams stays.") + '</span></div><div id="gnMsg"></div></form>' : "") +
        "</div>");
      var gnf = $("gnf");
      if (gnf) gnf.addEventListener("submit", function (ev) {
        ev.preventDefault();
        var b = $("gnSave"); savingButton(b);
        var zh = $("gnZh").value.trim(), en = $("gnEn").value.trim();
        post("domain/groupname", "PUT", { domain: dom, id: g.id, zh: zh, en: en }).then(function (r) {
          restoreButton(b);
          if (!r.ok) { $("gnMsg").innerHTML = '<div class="msg err">' + esc(errText(r)) + "</div>"; return; }
          g.nameZh = zh; g.nameEn = en;
          ((state.domainUsers[dom] || {}).users || []).forEach(function (u) { (u.groups || []).forEach(function (x) { if (x.id === g.id) { x.nameZh = zh; x.nameEn = en; } }); });
          $("panel").querySelector(".ph h3").textContent = gname(g);
          flashOk("<b>" + esc(gname(g)) + "</b>" + t("：显示名称已保存。", ": display names saved."));
          if (location.hash.indexOf("#/domain/groups") === 0 && $("gtree")) renderGroupLeaf(dom); else if (location.hash.indexOf("#/domain/users") === 0 && $("utable")) renderUsers();
        });
      });
    });
  }

  function viewGroups() {
    setTitle(domainsInfo.all ? t("机构管理", "Institutions") : t("本域管理", "My domain"), t("Teams 群组", "Teams groups"),
      syncButtons("gs"));
    var ds = domainsInfo.domains || [];
    $("content").innerHTML =
      '<div class="toolbar"><span class="spacer"></span><div class="search">' + ICON.search + '<input type="search" id="gq" placeholder="' + t("搜索群组…", "Search groups…") + '" /></div></div>' +
      '<div class="tlist tree" id="gtree">' + ds.map(function (d) {
        return '<details data-domain="' + esc(d.domain) + '"' + (ds.length === 1 || d.domain === currentDomain ? " open" : "") + '><summary>' + dlabel(d.domain) + ' <span class="n" id="gn-' + esc(d.domain.replace(/\W/g, "_")) + '"></span></summary><div class="leaf"><div class="loading">' + t("展开后读取…", "Expand to load…") + "</div></div></details>";
      }).join("") + "</div>";
    $("gq").addEventListener("input", debounce(function () { ds.forEach(function (d) { renderGroupLeaf(d.domain); }); }, 120));
    $("gtree").addEventListener("toggle", function (e) { var det = e.target; if (det.open) ensureGroups(det.getAttribute("data-domain")); }, true);
    function bindSync(btnId, mode) {
      var b = $(btnId); if (!b) return;
      b.addEventListener("click", function () {
        var dom = currentDomain, det = $("gtree").querySelector('details[data-domain="' + dom + '"]');
        var leaf = det && det.querySelector(".leaf");
        b.disabled = true;
        runSync(dom, mode, function (st) { if (leaf) leaf.innerHTML = '<div class="loading">' + t("正在同步 ", "Syncing ") + esc(dname(dom)) + "：" + (st.total - st.remaining) + " / " + st.total + "</div>"; })
          .then(function () { if (det) det.open = true; return ensureGroups(dom, true); })
          .catch(function (e) { if (leaf) leaf.innerHTML = '<div class="msg err">' + esc(e.message || e) + "</div>"; })
          .then(function () { b.disabled = false; });
      });
    }
    bindSync("gsNew", "changes"); bindSync("gsFull", "full");
    // Who is in a group: the accounts of this domain, read-only (Rick, 2026-10-02:
    // 「系统管理员应该可以看到群组中的用户账号信息，但是不能操作」).
    $("gtree").addEventListener("click", function (e) {
      var m = e.target.closest("button.mrow[data-upn]");
      if (m) { openUserPanel(m.getAttribute("data-upn"), m.getAttribute("data-domain")); return; }
      var b = e.target.closest("button[data-members]"); if (!b) return;
      var box = b.parentNode.parentNode.querySelector(".members");
      if (!box) return;
      var open = box.classList.toggle("hidden");
      b.textContent = open ? t("查看成员", "View members") : t("收起", "Hide");
    });
    ds.forEach(function (d) { var det = $("gtree").querySelector('details[data-domain="' + d.domain + '"]'); if (det && det.open) ensureGroups(d.domain); });
  }
  function ensureGroups(domain, force) {
    var saved = currentDomain; currentDomain = domain;
    return Promise.all([loadDomainData("groups", force), loadDomainData("users", force).catch(function () { return null; })]).then(function () { renderGroupLeaf(domain); }).catch(function (e) {
      var det = $("gtree") && $("gtree").querySelector('details[data-domain="' + domain + '"]'); if (det) det.querySelector(".leaf").innerHTML = '<div class="msg err">' + esc(e.message || e) + "</div>";
    }).then(function () { currentDomain = saved; });
  }
  function renderGroupLeaf(domain) {
    var det = $("gtree") && $("gtree").querySelector('details[data-domain="' + domain + '"]'); if (!det) return;
    var d = state.domainGroups[domain]; if (!d) return;
    var q = ($("gq") && $("gq").value.trim()) || "";
    var rows = d.groups.filter(function (g) { return !q || (g.name + " " + (g.nameZh || "") + " " + (g.nameEn || "") + " " + g.description).toLowerCase().indexOf(q.toLowerCase()) >= 0; });
    var n = $("gn-" + domain.replace(/\W/g, "_")); if (n) n.textContent = d.groups.length + t(" 个群组", " groups") + (q ? " · " + rows.length + t(" 个匹配", " match") : "") + " · " + syncLine(d.sync);
    var people = {}; ((state.domainUsers[domain] || {}).users || []).forEach(function (u) { people[u.upn] = u; });
    det.querySelector(".leaf").innerHTML = rows.length ? rows.map(function (g) {
      var k = GKIND[g.kind] || GKIND.other;
      var members = (g.members || []).map(function (upn) {
        var u = people[upn];
        return '<button class="mrow link" type="button" data-upn="' + esc(upn) + '" data-domain="' + esc(domain) + '"><span class="avatar sm" style="background:' + hue(upn) + '">' + esc(initials((u && u.displayName) || upn)) + '</span><span class="mname">' + esc((u && u.displayName) || "") + '</span><span class="mupn">' + esc(upn) + "</span>" + (u && u.identity ? '<span class="tag">' + esc(vl(u.identity)) + "</span>" : "<span></span>") + "</button>";
      }).join("");
      return '<div class="trow"><span class="tav" style="background:' + hue(g.id) + '">' + esc(initials(gname(g))) + '</span><div class="tmain"><div class="tname">' + hl(gname(g), q) + '</div><div class="tmeta"><span>' + esc(k[EN ? 1 : 0]) + "</span>" + (g.visibility ? "<span>" + (g.visibility === "Public" ? t("公开", "Public") : t("私密", "Private")) + "</span>" : "") + "<span>" + g.domainMembers + t(" 位本域成员", " members from this domain") + "</span>" + (g.description ? '<span class="desc">' + hl(g.description, q) + "</span>" : "") + "</div>" +
        '<div class="members hidden">' + (members || '<div class="muted" style="font-size:.84rem">' + t("本域没有成员。", "No members from this domain.") + "</div>") + '<div class="muted" style="font-size:.78rem;margin-top:6px">' + t("只读：成员的增减在 Teams 或 Microsoft 365 管理中心完成。", "Read-only: members are added or removed in Teams or the Microsoft 365 admin center.") + "</div></div>" +
        '</div><div class="gact"><button class="btn secondary sm" type="button" data-members="1">' + t("查看成员", "View members") + "</button></div></div>";
    }).join("") : '<div class="empty">' + t("没有群组。", "No groups.") + "</div>";
  }
