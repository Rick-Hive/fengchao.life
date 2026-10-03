// 蜂巢 管理中心 (/management/) — one page, hash-routed. Views:
//   #/account          我的账号: profile, password links, sign-in methods, log downloads
//   #/teams            我的 Teams: a Teams-style list with filter chips and live search
//   #/domain/users     本域管理 › 用户: Entra-style table of the domain's accounts
//   #/domain/groups    本域管理 › Teams 群组: domain → groups, collapsible
//   #/system/roles     系统 › 角色分配
//   #/system/sync      系统 › 数据同步
// What a person sees in the sidebar follows their roles (/api/me/summary →
// roles; /api/domain/domains → which domains they manage).
(function () {
  "use strict";

  // ---- language ------------------------------------------------------------------
  var LANG = "zh";
  try { var s0 = localStorage.getItem("fc-lang"); if (s0 === "en" || s0 === "zh") LANG = s0; } catch (e) {}
  var EN = LANG === "en";
  function t(zh, en) { return EN ? en : zh; }
  document.documentElement.lang = EN ? "en" : "zh-CN";
  document.title = t("蜂巢 · 管理中心", "Hive · Management Center");
  document.getElementById("brandTag").textContent = t("管理中心", "Management Center");
  document.getElementById("fOut").textContent = t("退出", "Sign out");
  // The language button is the site header's (#langBtn, drawn by site-header.js).
  var langBtn = document.getElementById("langBtn");
  if (langBtn) langBtn.addEventListener("click", function () {
    try { localStorage.setItem("fc-lang", EN ? "zh" : "en"); } catch (e) {}
    location.reload();
  });

  // ---- helpers -------------------------------------------------------------------
  function $(id) { return document.getElementById(id); }
  function esc(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function api(path, opts) {
    return fetch("/api/" + path, Object.assign({ credentials: "same-origin", cache: "no-store", redirect: "manual" }, opts || {})).then(function (r) {
      // The platform itself found no sign-in (its cookie is gone) and answered with a
      // redirect to the sign-in page: treat it as signed out, do not follow it from here.
      if (r.type === "opaqueredirect" || r.status === 0) {
        if (window.fcSession) window.fcSession.expired("signed_out");
        return { ok: false, status: 401, body: { error: "signed out", code: "signed_out" } };
      }
      return r.json().catch(function () { return {}; }).then(function (j) {
        // The server ended the session (idle / maximum age / 退出): leave for the homepage, which explains.
        if (j && (j.code === "session_expired" || j.code === "signed_out") && window.fcSession) window.fcSession.expired(j.reason || "signed_out");
        return { ok: r.ok, status: r.status, body: j };
      });
    });
  }
  function post(path, method, body) {
    return api(path, { method: method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  }
  var fmtDT = new Intl.DateTimeFormat(EN ? "en-GB" : "zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
  var fmtD = new Intl.DateTimeFormat(EN ? "en-GB" : "zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" });
  function when(iso) { if (!iso) return ""; var d = new Date(iso); return isNaN(d) ? "" : fmtDT.format(d); }
  function day(iso) { if (!iso) return ""; var d = new Date(iso); return isNaN(d) ? "" : fmtD.format(d); }
  function errText(r) { var b = (r && r.body) || {}; var m = b.error || ("HTTP " + (r && r.status)); if (b.problems) m += "\n• " + b.problems.join("\n• "); return m; }
  function debounce(fn, ms) { var h; return function () { var a = arguments; clearTimeout(h); h = setTimeout(function () { fn.apply(null, a); }, ms); }; }
  function initials(name) {
    var s = String(name || "").trim();
    if (!s) return "?";
    if (/[一-鿿]/.test(s)) return s.replace(/[^一-鿿]/g, "").slice(0, 2) || s.slice(0, 2);
    var parts = s.split(/[\s\-_/·]+/).filter(Boolean);
    return ((parts[0] || "")[0] + ((parts[1] || "")[0] || (parts[0] || "")[1] || "")).toUpperCase();
  }
  var HUES = ["#1d4a83", "#b8811a", "#0e7490", "#7c3aed", "#be185d", "#15803d", "#c2410c", "#4338ca"];
  function hue(key) { var h = 0; for (var i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0; return HUES[h % HUES.length]; }
  function hl(text, q) {
    if (!q) return esc(text);
    var i = String(text).toLowerCase().indexOf(q.toLowerCase());
    if (i < 0) return esc(text);
    return esc(text.slice(0, i)) + "<mark>" + esc(text.slice(i, i + q.length)) + "</mark>" + esc(text.slice(i + q.length));
  }
  var ICON = {
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4.5 20c1.3-3.9 4.2-5.9 7.5-5.9s6.2 2 7.5 5.9"/></svg>',
    teams: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="8" r="3.2"/><circle cx="17" cy="9" r="2.6"/><path d="M3 19c.9-3.3 3.2-5 6-5s5.1 1.7 6 5M15.5 14.5c2.6 0 4.5 1.3 5.5 4"/></svg>',
    users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M8 14h4"/></svg>',
    tree: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 4v16M6 8h6a3 3 0 0 1 3 3v0M6 14h6a3 3 0 0 1 3 3v0"/><circle cx="18" cy="11" r="2"/><circle cx="18" cy="17" r="2"/></svg>',
    key: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="8" cy="14" r="4"/><path d="M11 11l9-9M16 6l3 3M13 9l3 3"/></svg>',
    sync: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 12a8 8 0 0 1-14 5.3M4 12a8 8 0 0 1 14-5.3M4 4v5h5M20 20v-5h-5"/></svg>',
    cart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 4h2l2.4 11a2 2 0 0 0 2 1.6h8.2a2 2 0 0 0 2-1.6L21 8H7"/><circle cx="10" cy="20" r="1.3"/><circle cx="17" cy="20" r="1.3"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></svg>',
    down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><path d="M12 4v11m0 0l-4-4m4 4l4-4M5 20h14"/></svg>',
  };

  // ---- state ------------------------------------------------------------------------
  var me = null;            // /api/me/summary body
  var domainsInfo = null;   // /api/domain/domains body or null
  var currentDomain = "";
  var state = { teams: null, teamFilter: "all", teamSort: "az", teamQ: "", domainUsers: {}, domainGroups: {}, userQ: "", userFilter: "all" };

  // ---- shell: sidebar, footer, sign-out, drawer ------------------------------
  function nav() {
    var groups = [
      { title: t("我的账号", "My account"), items: [
        { hash: "#/account", icon: "user", zh: "个人资料", en: "Profile" },
        { hash: "#/security", icon: "key", zh: "登录与安全", en: "Sign-in & security" },
        { hash: "#/teams", icon: "teams", zh: "我的 Teams", en: "My Teams" },
      ] },
    ];
    if (domainsInfo && domainsInfo.domains && domainsInfo.domains.length) {
      groups.push({ title: domainsInfo.all ? t("机构管理", "Institutions") : t("本域管理", "My domain"), items: [
        { hash: "#/domain/users", icon: "users", zh: "用户", en: "Users" },
        { hash: "#/domain/groups", icon: "tree", zh: "Teams 群组", en: "Teams groups" },
      ] });
    }
    if (isAdmin()) {
      groups.push({ title: t("系统", "System"), items: [
        { hash: "#/system/roles", icon: "key", zh: "角色分配", en: "Roles" },
        { hash: "#/system/institutions", icon: "tree", zh: "机构名称", en: "Institutions" },
        { hash: "#/system/sync", icon: "sync", zh: "数据同步", en: "Data sync" },
      ] });
    }
    var cur = location.hash || "#/account";
    $("nav").innerHTML = groups.map(function (g) {
      return '<div class="nav-group"><div class="nav-title">' + esc(g.title) + "</div>" + g.items.map(function (it) {
        var active = it.hash && cur.indexOf(it.hash) === 0;
        return '<a class="nav-item' + (active ? " active" : "") + '" href="' + esc(it.hash || it.href) + '">' + ICON[it.icon] + "<span>" + esc(t(it.zh, it.en)) + "</span>" + (it.href ? '<span class="ext">↗</span>' : "") + "</a>";
      }).join("") + "</div>";
    }).join("");
  }
  function isAdmin() { var r = (me && me.roles) || []; return r.indexOf("admin") >= 0 || r.indexOf("staff:sysadmin") >= 0; }
  // What the signed-in person may do in the current domain (from /api/domain/domains).
  function canDo(what) {
    if (!domainsInfo) return false;
    var d = (domainsInfo.domains || []).filter(function (x) { return x.domain === currentDomain; })[0];
    return !!(d && d.can && d.can[what]);
  }
  function foot() {
    var p = me && me.profile, upn = p ? p.upn || "" : "";
    $("fAvatar").textContent = initials(p ? p.displayName || upn : "?");
    $("fName").textContent = p ? (p.displayName || upn) : t("未登录", "Signed out");
    $("fUpn").textContent = upn;
    $("fWho").title = t("账号", "Account");
    // The other Office 365 accounts the person listed in 补充资料, minus the one in use.
    var others = ((me && me.hive && me.hive.extra && me.hive.extra.otherAccounts) || []).filter(function (a) {
      return a && String(a).toLowerCase() !== upn.toLowerCase();
    });
    $("fMenu").innerHTML =
      '<div class="cur"><b>' + esc(p ? p.displayName || upn : "") + "</b><span>" + esc(upn) + "</span></div>" +
      '<button type="button" class="mi" role="menuitem" data-switch="">' + t("切换账号", "Switch account") +
        "<small>" + t("结束当前会话，在微软的账号列表里选另一个账号登录。", "Ends this session and lets you pick another account in Microsoft's list.") + "</small></button>" +
      (others.length ? '<div class="hd">' + t("我的其他账号", "My other accounts") + "</div>" + others.map(function (a) {
        return '<button type="button" class="mi" role="menuitem" data-switch="' + esc(a) + '" title="' + esc(a) + '">' + esc(a) + "</button>";
      }).join("") : "") +
      '<button type="button" class="mi ms" role="menuitem" data-mslogout="1">' + t("公用电脑？同时在微软退出此账号", "Shared computer? Also sign this account out at Microsoft") + "</button>";
  }
  function menuOpen(open) {
    $("fMenu").hidden = !open;
    $("fWho").setAttribute("aria-expanded", open ? "true" : "false");
  }
  $("fWho").addEventListener("click", function () { menuOpen($("fMenu").hidden); });
  document.addEventListener("click", function (e) { if (!$("foot").contains(e.target) && !$("fMenu").hidden) menuOpen(false); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !$("fMenu").hidden) { menuOpen(false); $("fWho").focus(); } });
  // 切换账号: end Hive's session (the Microsoft sessions in this browser stay), then go
  // to the sign-in in this same tab — Microsoft shows its account list
  // (prompt=select_account in staticwebapp.config.json), the person picks one, and
  // the management center loads again as that account. Only one account can be
  // signed in at a time (one platform cookie), so a switch is always sign-out + sign-in.
  // The intended account is remembered so loadMe can say if Microsoft handed the same
  // account straight back (browser single sign-on skipping the list).
  function switchAccount(to) {
    var from = (me && me.profile && me.profile.upn) || "";
    menuOpen(false);
    $("fWho").disabled = true; $("fOut").disabled = true;
    try { sessionStorage.setItem("fc-switch", JSON.stringify({ from: from, to: to || "", at: Date.now() })); localStorage.removeItem("fc-last-active"); } catch (e) {}
    window.__fcLeaving = true;
    return fetch("/api/logout", { method: "POST", credentials: "same-origin", cache: "no-store" }).catch(function () {}).then(function () {
      try { new BroadcastChannel("fc-auth").postMessage({ kind: "out", at: Date.now() }); } catch (e) {}
      try { localStorage.setItem("fc-auth-event", "out:" + Date.now()); } catch (e) {}
      location.replace("/.auth/login/aad?post_login_redirect_uri=" + encodeURIComponent("/management/?signedin=1"));
    });
  }
  // Microsoft's own sign-out for this account, in a new tab (logout_hint skips the
  // "which account" page); Hive's session is not touched here.
  function microsoftLogoutUrl(upn) {
    return "https://login.microsoftonline.com/common/oauth2/v2.0/logout" + (upn ? "?logout_hint=" + encodeURIComponent(upn) : "");
  }
  $("fMenu").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-switch]");
    if (b) return switchAccount(b.getAttribute("data-switch"));
    if (e.target.closest("button[data-mslogout]")) {
      menuOpen(false);
      window.open(microsoftLogoutUrl((me && me.profile && me.profile.upn) || ""), "_blank", "noopener");
    }
  });
  // After a switch: did we come back as a different account?
  function afterSwitch() {
    var sw = null;
    try { sw = JSON.parse(sessionStorage.getItem("fc-switch") || "null"); sessionStorage.removeItem("fc-switch"); } catch (e) { sw = null; }
    if (!sw || !me || !me.profile || Date.now() - Number(sw.at || 0) > 15 * 60 * 1000) return;
    var now = me.profile.upn || "", same = sw.from && now.toLowerCase() === String(sw.from).toLowerCase();
    var wrong = !same && sw.to && now.toLowerCase() !== String(sw.to).toLowerCase();
    if (same) {
      flash(t("微软没有显示账号列表，直接以原账号 ", "Microsoft skipped its account list and signed in the same account, ") + "<b>" + esc(now) + "</b>" +
        t(" 登录了（通常是浏览器的单点登录造成的）。要换账号，请先 ", " again (usually browser single sign-on). To switch, first ") +
        '<a href="' + esc(microsoftLogoutUrl(now)) + '" target="_blank" rel="noopener">' + t("在微软退出该账号", "sign that account out at Microsoft") + "</a>" +
        t("，再点「切换账号」。", ", then use Switch account again."));
    } else if (wrong) {
      flash(t("已切换为 ", "Switched to ") + "<b>" + esc(now) + "</b>" + t("（不是你选的 ", " (not the ") + esc(sw.to) + t("）。", " you chose)."));
    } else {
      flash(t("已切换为 ", "Switched to ") + "<b>" + esc(now) + "</b>" + t("。", "."), 4000);
    }
  }
  function flash(html, ms) {
    var f = $("flash");
    f.innerHTML = '<span class="txt">' + html + '</span><button type="button" class="x" aria-label="' + t("关闭", "Close") + '">×</button>';
    f.hidden = false;
    clearTimeout(flash.timer);
    if (ms) flash.timer = setTimeout(function () { f.hidden = true; }, ms);
  }
  $("flash").addEventListener("click", function (e) { if (e.target.closest(".x")) $("flash").hidden = true; });
  // 退出: Hive's session only; the Microsoft sessions in this browser stay, so the next
  // 登录 shows Microsoft's account list (assets/session-guard.js, loaded before this file).
  $("fOut").addEventListener("click", function () {
    $("fOut").disabled = true;
    if (window.fcSession) window.fcSession.signOut("user");
    else { fetch("/api/logout", { method: "POST", credentials: "same-origin" }).catch(function () {}).then(function () { location.replace("/?signedout=user"); }); }
  });
  function closeDrawer() { $("side").classList.remove("open"); $("scrim").classList.remove("show"); }
  $("menuToggle").addEventListener("click", function () { $("side").classList.toggle("open"); $("scrim").classList.toggle("show"); });
  $("scrim").addEventListener("click", closeDrawer);
  $("nav").addEventListener("click", function (e) { if (e.target.closest("a")) closeDrawer(); });
  // Signed out in another tab → leave.
  try { new BroadcastChannel("fc-auth").onmessage = function (e) { if (e && e.data && e.data.kind === "out" && !window.__fcLeaving) location.replace("/"); }; } catch (e) {}
  window.addEventListener("storage", function (e) { if (e.key === "fc-auth-event" && /^out:/.test(e.newValue || "") && !window.__fcLeaving) location.replace("/"); });

  function setTitle(crumb, title, actionsHtml, desc) {
    $("title").innerHTML = (crumb ? '<span class="crumb">' + esc(crumb) + "</span>" : "") + (title ? '<span class="ttl">' + esc(title) + "</span>" : "") + (desc ? '<span class="desc">' + esc(desc) + "</span>" : "");
    $("topActions").innerHTML = actionsHtml || "";
    document.querySelector(".topbar").classList.toggle("bare", !title && !crumb && !actionsHtml);
  }
  function panelOpen(html, which) { var p = $(which === "second" ? "panel2" : "panel"); p.innerHTML = html; p.classList.add("open"); p.setAttribute("aria-hidden", "false"); }
  function panel2Close() { var p = $("panel2"); p.classList.remove("open"); p.setAttribute("aria-hidden", "true"); }
  function panelClose() { var p = $("panel"); p.classList.remove("open"); p.setAttribute("aria-hidden", "true"); panel2Close(); document.querySelectorAll("table.data tr.sel").forEach(function (tr) { tr.classList.remove("sel"); }); }
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") { if ($("panel2").classList.contains("open")) panel2Close(); else { panelClose(); closeDrawer(); } } });
  // A member clicked in a group's panel opens beside it, in the second panel, so the
  // group stays in view (Rick, 2026-10-03: 「点击用户，应该在左侧显示用户详细信息」).
  function memberClick(m) {
    var upn = m.getAttribute("data-upn"), dom = m.getAttribute("data-domain") || upn.split("@")[1] || "";
    openUserPanel(upn, dom, { beside: true, name: m.getAttribute("data-name") || "", owner: m.getAttribute("data-owner") === "1" });
  }
  $("panel").addEventListener("click", function (e) {
    if (e.target.closest(".x")) { panelClose(); return; }
    var g = e.target.closest("button[data-group]"); if (g) { openGroupPanel(g.getAttribute("data-group")); return; }
    var m = e.target.closest("button.mrow[data-upn]"); if (m) memberClick(m);
  });
  $("panel2").addEventListener("click", function (e) {
    if (e.target.closest(".x")) { panel2Close(); return; }
    var g = e.target.closest("button[data-group]"); if (g) { openGroupPanel(g.getAttribute("data-group")); return; }
    var m = e.target.closest("button.mrow[data-upn]"); if (m) memberClick(m);
  });

  // ================================================================================
  // 我的账号 › 概览
  // ================================================================================
  var KIND = { authenticator: ["验证器", "Authenticator"], fido2: ["安全密钥", "Security key"], phone: ["手机", "Phone"], email: ["邮箱", "Email"], softwareOath: ["验证码应用", "Code app"], tap: ["临时通行码", "Temporary Access Pass"], windowsHello: ["Windows Hello", "Windows Hello"] };
  // ---- 补充资料: city, needs, children and their Teams accounts (Rick, 2026-10-02) ----
  var VOCAB_EN = {
    "家长": "Parent", "学生": "Student", "老师": "Teacher", "行政": "Staff", "学校行政": "School staff", "机构负责人": "Head of institution", "其它": "Other",
    "教材": "Curriculum materials", "课程": "Courses", "教师培训": "Teacher training", "家长-亲子培训": "Parent & parent–child training", "海外留学": "Study abroad", "大学路径": "University pathways", "双学分/AP课程": "Dual-credit / AP courses", "标化考试": "Standardised tests",
    "学前": "Pre-K",
    "公立学校": "Public school", "私立学校": "Private school", "国际学校": "International school", "基督教学校": "Christian school", "在家教育": "Homeschool",
    "古典教育": "Classical", "BJU": "BJU", "Abeka": "Abeka", "混合教学法": "Mixed approaches", "不清楚": "Not sure",
    "欧美大学": "University in Europe / North America", "东南亚大学": "University in Southeast Asia", "英国/澳洲大学": "University in the UK / Australia", "国内大学": "University in China", "2+2混合制大学": "2+2 programme", "未定": "Undecided",
  };
  function vl(v) { return EN ? (VOCAB_EN[v] || v) : v; }
  var extraDraft = null; // the form's working copy, so adding a child does not lose typed values
  function readExtraForm() {
    var d = { roles: [], rolesOther: ($("xRolesOther") || {}).value || "", topics: [], topicsOther: ($("xTopicsOther") || {}).value || "", otherAccounts: [], children: [] };
    Array.prototype.forEach.call(document.querySelectorAll("#extraCard input[data-role]:checked"), function (c) { d.roles.push(c.getAttribute("data-role")); });
    Array.prototype.forEach.call(document.querySelectorAll("#extraCard input[data-topic]:checked"), function (c) { d.topics.push(c.getAttribute("data-topic")); });
    Array.prototype.forEach.call(document.querySelectorAll("#extraCard input[data-acct]"), function (c) { d.otherAccounts.push(c.value || ""); });
    Array.prototype.forEach.call(document.querySelectorAll("#extraCard .kid"), function (k) {
      var g = function (n) { var el = k.querySelector("[data-k='" + n + "']"); return el ? el.value : ""; };
      var he = []; Array.prototype.forEach.call(k.querySelectorAll("input[data-he]:checked"), function (c) { he.push(c.getAttribute("data-he")); });
      d.children.push({ name: g("name"), age: g("age"), grade: g("grade"), schooling: g("schooling"), model: g("model"), modelOther: g("modelOther"), higherEd: he, higherEdOther: g("higherEdOther"), account: g("account") });
    });
    return d;
  }
  function renderExtra(msgHtml) {
    var hv = me.hive || {}, voc = hv.vocab || { selfRoles: [], topics: [], grades: [], schooling: [], models: [], higherEd: [], maxChildren: 8 };
    var d = extraDraft || hv.extra || { roles: [], rolesOther: "", topics: [], topicsOther: "", otherAccounts: [], children: [] };
    if (!d.roles) d = Object.assign({ roles: [], rolesOther: "", topics: [], topicsOther: "", otherAccounts: [] }, d); // a record saved before this form
    if (!Array.isArray(d.otherAccounts)) d.otherAccounts = String(d.otherAccounts || "").split(/[\s,;，；]+/).filter(Boolean);
    extraDraft = d;
    var isParent = (d.roles || []).indexOf("家长") >= 0;
    var sel = function (name, list, val) {
      return '<select data-k="' + name + '"><option value="">' + t("请选择", "Choose") + "</option>" + list.map(function (o) { return '<option value="' + esc(o) + '"' + (o === val ? " selected" : "") + ">" + esc(vl(o)) + "</option>"; }).join("") + "</select>";
    };
    var kids = (d.children || []).map(function (c, i) {
      var he = c.higherEd || [];
      return '<div class="kid"><div class="kid-head"><b>' + t("孩子 ", "Child ") + (i + 1) + '</b><button class="btn secondary sm" type="button" data-rm="' + i + '">' + t("移除", "Remove") + "</button></div>" +
        '<div class="grid2">' +
          '<label class="f">' + t("姓名", "Name") + '<input type="text" data-k="name" maxlength="30" value="' + esc(c.name || "") + '" /></label>' +
          '<label class="f">' + t("年龄", "Age") + '<input type="number" data-k="age" min="1" max="30" value="' + esc(c.age == null ? "" : c.age) + '" /></label>' +
          '<label class="f">' + t("年级", "Grade") + sel("grade", voc.grades, c.grade) + "</label>" +
          '<label class="f">' + t("学校类型", "School type") + sel("schooling", voc.schooling, c.schooling) + "</label>" +
          '<label class="f">' + t("教学理念与教学法", "Educational approach") + sel("model", voc.models, c.model) + "</label>" +
          '<label class="f model-other' + (c.model === "其它" ? "" : " hidden") + '">' + t("其它（请填写）", "Other — which?") + '<input type="text" data-k="modelOther" maxlength="60" value="' + esc(c.modelOther || "") + '" /></label>' +
          '<label class="f">' + t("孩子的 Teams 账号（如有）", "Child's Teams account (if any)") + '<input type="text" data-k="account" maxlength="120" placeholder="name@school-domain" value="' + esc(c.account || "") + '" /></label>' +
        "</div>" +
        '<div class="f-title">' + t("高等教育计划（可多选）", "Higher-education plans (choose any)") + "</div>" +
        '<div class="chks">' + (voc.higherEd || []).map(function (o) {
          var tip = o === "2+2混合制大学" ? ' <span class="info" tabindex="0" data-tip="' + esc(t("2 年国内，2 年海外", "2 years in China, 2 years abroad")) + '">i</span>' : "";
          return '<label class="chk"><input type="checkbox" data-he="' + esc(o) + '"' + (he.indexOf(o) >= 0 ? " checked" : "") + " /> " + esc(vl(o)) + tip + "</label>";
        }).join("") + "</div>" +
        '<label class="f he-other' + (he.indexOf("其它") >= 0 ? "" : " hidden") + '">' + t("其它（请填写）", "Other — which?") + '<input type="text" data-k="higherEdOther" maxlength="60" value="' + esc(c.higherEdOther || "") + '" /></label>' +
      "</div>";
    }).join("");
    $("extraCard").innerHTML =
      '<header class="ch"><h2>' + t("补充资料", "Additional information") + "</h2></header>" +
      '<form id="xf" autocomplete="off">' +
        '<div class="f-title">' + t("我的主要身份 / 角色（可多选）", "My main role (choose any)") + "</div>" +
        '<div class="chks">' + (voc.selfRoles || []).map(function (n) { return '<label class="chk"><input type="checkbox" data-role="' + esc(n) + '"' + ((d.roles || []).indexOf(n) >= 0 ? " checked" : "") + " /> " + esc(vl(n)) + "</label>"; }).join("") + "</div>" +
        '<label class="f roles-other' + ((d.roles || []).indexOf("其它") >= 0 ? "" : " hidden") + '">' + t("其它（请填写）", "Other — please say") + '<input type="text" id="xRolesOther" maxlength="60" value="' + esc(d.rolesOther || "") + '" /></label>' +
        '<div id="kidsWrap" class="' + (isParent ? "" : "hidden") + '">' +
          '<div class="f-title">' + t("我的孩子", "My children") + "</div>" +
          '<div id="kids">' + (kids || '<div class="muted" style="font-size:13px">' + t("还没有添加孩子。", "No children added yet.") + "</div>") + "</div>" +
          '<div class="actions"><button class="btn secondary sm" type="button" id="xAdd"' + ((d.children || []).length >= (voc.maxChildren || 8) ? " disabled" : "") + ">" + t("＋ 添加孩子", "+ Add a child") + "</button></div>" +
        "</div>" +
        '<div class="f-title">' + t("我感兴趣的话题（可多选）", "Topics I am interested in (choose any)") + "</div>" +
        '<div class="chks">' + (voc.topics || []).map(function (n) { return '<label class="chk"><input type="checkbox" data-topic="' + esc(n) + '"' + ((d.topics || []).indexOf(n) >= 0 ? " checked" : "") + " /> " + esc(vl(n)) + "</label>"; }).join("") + "</div>" +
        '<label class="f topics-other' + ((d.topics || []).indexOf("其它") >= 0 ? "" : " hidden") + '">' + t("其它（请填写）", "Other — please say") + '<input type="text" id="xTopicsOther" maxlength="60" value="' + esc(d.topicsOther || "") + '" /></label>' +
        // One row per account, 添加另一个 for the next (Rick, 2026-10-02: 「有的用户说不定有 3 个账号」).
        '<div class="f-title">' + t("我在 Education Resource Link 的其它 Teams 账号", "My other Teams accounts in Education Resource Link") + "</div>" +
        '<div id="accts">' + (d.otherAccounts.length ? d.otherAccounts.map(function (a, i) {
          return '<div class="acct-row"><input type="text" data-acct="' + i + '" maxlength="120" placeholder="name@school-domain" value="' + esc(a) + '" /><button class="btn secondary sm" type="button" data-rma="' + i + '" aria-label="' + esc(t("移除", "Remove")) + '">' + t("移除", "Remove") + "</button></div>";
        }).join("") : '<div class="muted" style="font-size:13px">' + t("如果您在别的学校或机构还有 Teams 账号，可以在这里添加。", "If you also hold Teams accounts at other schools or institutions, add them here.") + "</div>") + "</div>" +
        '<div class="actions"><button class="btn secondary sm" type="button" id="xAddAcct"' + (d.otherAccounts.length >= (voc.maxAccounts || 5) ? " disabled" : "") + ">" + t(d.otherAccounts.length ? "＋ 添加另一个" : "＋ 添加账号", d.otherAccounts.length ? "+ Add another" : "+ Add an account") + "</button></div>" +
        '<footer class="cf"><button class="btn" type="submit" id="xSave">' + t("保存", "Save") + '</button><span id="xMsg">' + (msgHtml || "") + "</span></footer>" +
      "</form>";
    $("xAdd").addEventListener("click", function () { extraDraft = readExtraForm(); extraDraft.children.push({}); renderExtra(); var last = document.querySelector("#kids .kid:last-child input"); if (last) last.focus(); });
    $("kids").addEventListener("click", function (ev) {
      var b = ev.target.closest("button[data-rm]"); if (!b) return;
      extraDraft = readExtraForm(); extraDraft.children.splice(Number(b.getAttribute("data-rm")), 1); renderExtra();
    });
    $("xAddAcct").addEventListener("click", function () { extraDraft = readExtraForm(); extraDraft.otherAccounts.push(""); renderExtra(); var last = document.querySelector("#accts .acct-row:last-child input"); if (last) last.focus(); });
    $("accts").addEventListener("click", function (ev) {
      var b = ev.target.closest("button[data-rma]"); if (!b) return;
      extraDraft = readExtraForm(); extraDraft.otherAccounts.splice(Number(b.getAttribute("data-rma")), 1); renderExtra();
    });
    $("extraCard").addEventListener("change", function (ev) {
      var el = ev.target;
      if (el.getAttribute("data-k") === "model") el.closest(".kid").querySelector(".model-other").classList.toggle("hidden", el.value !== "其它");
      if (el.getAttribute("data-he") === "其它") el.closest(".kid").querySelector(".he-other").classList.toggle("hidden", !el.checked);
      if (el.getAttribute("data-role") === "其它") document.querySelector("#extraCard .roles-other").classList.toggle("hidden", !el.checked);
      if (el.getAttribute("data-topic") === "其它") document.querySelector("#extraCard .topics-other").classList.toggle("hidden", !el.checked);
      if (el.getAttribute("data-role") === "家长") $("kidsWrap").classList.toggle("hidden", !el.checked);
    });
    $("xf").addEventListener("submit", function (ev) {
      ev.preventDefault();
      var body = readExtraForm();
      $("xSave").disabled = true;
      post("me/extra", "PATCH", body).then(function (r) {
        $("xSave").disabled = false;
        if (!r.ok) { $("xMsg").innerHTML = '<span class="msg err">' + esc(errText(r)) + (r.body && r.body.problems ? " — " + esc(r.body.problems.join("；")) : "") + "</span>"; return; }
        me.hive = Object.assign({}, me.hive, { extra: r.body.extra, linked: r.body.linked || [], identity: r.body.identity || (me.hive && me.hive.identity) || "" });
        extraDraft = null;
        renderExtra('<span class="msg ok">' + t("已保存。", "Saved.") + "</span>");
      });
    });
  }

  function viewAccount() {
    setTitle("", "", "", ""); // no title row on this page (Rick, 2026-10-02)
    var p = me.profile, hv = me.hive || {}, ms = (me.methods || []).filter(function (m) { return m.kind !== "password"; });
    var strong = ms.filter(function (m) { return m.strong; }).length;
    var canName = !!hv.canEditName;
    var dept = [p.jobTitle, pickName(hv.institution, hv.institutionEn) || p.department].filter(Boolean).join(" · ");
    $("content").innerHTML =
      '<div class="idhead"><span class="avatar lg">' + esc(initials(p.displayName || p.upn)) + '</span><div class="idmain"><div class="idname">' + esc(p.displayName || p.upn) + "</div>" +
        '<div class="idmeta"><span>' + esc(p.upn) + "</span>" + (hv.identity ? '<span class="tag accent">' + esc(vl(hv.identity)) + "</span>" : "") + '<span class="tag">' + esc(roleNames(me.roles)) + "</span>" +
        (p.created ? '<span class="muted">' + t("账号创建于 ", "Account since ") + esc(day(p.created)) + "</span>" : "") + "</div></div>" +
        '<div class="idside">' + (strong ? '<span class="status ok">' + t("已启用验证器", "Authenticator on") + "</span>" : '<span class="status bad">' + t("未登记验证器", "No authenticator") + "</span>") + "</div></div>" +

      '<section class="card" id="profileCard"><header class="ch"><h2>' + t("基本资料", "Basic information") + '</h2><p>' + t("资料保存后将同步更新至 Teams 和 Outlook。", "Saved details are updated in Teams and Outlook.") + "</p></header>" +
        '<form id="pf" autocomplete="off">' +
        '<dl class="facts">' +
          "<div><dt>" + t("Microsoft 账号", "Microsoft account") + "</dt><dd>" + esc(p.upn) + "</dd></div>" +
          (canName ? "" : "<div><dt>" + t("显示名", "Display name") + "</dt><dd>" + esc(p.displayName || "—") + "</dd></div>") +
          "<div><dt>" + t("职务 / 部门", "Job title / department") + "</dt><dd>" + (esc(dept) || '<span class="muted">' + t("由学校设置", "Set by the school") + "</span>") + "</dd></div>" +
        '</dl>' +
        '<div class="grid3">' +
          (canName ? '<label class="f">' + t("显示名", "Display name") + '<input type="text" data-p="displayName" maxlength="64" value="' + esc(p.displayName) + '" required /><small>' + t("仅域管理员（IT）和系统管理员可改。", "Only the IT or system administrator may change this.") + "</small></label>" : "") +
          '<label class="f">' + t("名", "Given name") + '<input type="text" data-p="givenName" maxlength="40" value="' + esc(p.givenName) + '" /></label>' +
          '<label class="f">' + t("姓", "Surname") + '<input type="text" data-p="surname" maxlength="40" value="' + esc(p.surname) + '" /></label>' +
          '<label class="f">' + t("手机", "Mobile phone") + '<input type="tel" data-p="mobilePhone" maxlength="20" value="' + esc(p.mobilePhone) + '" placeholder="+86 138 0000 0000" /></label>' +
          '<label class="f">' + t("私人邮箱（推荐 Gmail 等海外安全邮箱）", "Personal email (Gmail or another secure overseas mailbox recommended)") + '<input type="email" data-p="safeEmail" value="' + esc(p.safeEmail) + '" placeholder="name@gmail.com" /></label>' +
          '<label class="f">' + t("语言", "Language") + '<select data-p="preferredLanguage"><option value="">' + t("未设置", "Not set") + '</option><option value="zh-CN"' + (p.preferredLanguage === "zh-CN" ? " selected" : "") + '>中文</option><option value="en-US"' + (p.preferredLanguage === "en-US" ? " selected" : "") + ">English</option></select></label>" +
          '<label class="f">' + t("所在城市", "City") + '<input type="text" data-p="city" maxlength="40" value="' + esc(p.city) + '" /></label>' +
          '<label class="f">' + t("省 / 州", "State / province") + '<input type="text" data-p="state" maxlength="40" value="' + esc(p.state) + '" /></label>' +
          '<label class="f">' + t("邮编", "Postcode") + '<input type="text" data-p="postalCode" maxlength="12" value="' + esc(p.postalCode) + '" /></label>' +
        '</div><footer class="cf"><button class="btn" type="submit" id="pSave">' + t("保存", "Save") + '</button><span id="pMsg"></span></footer></form></section>' +

      '<section class="card" id="extraCard"></section>';

    renderExtra();
    $("pf").addEventListener("submit", function (ev) {
      ev.preventDefault();
      var body = {}, vals = {};
      Array.prototype.forEach.call($("pf").querySelectorAll("[data-p]"), function (el) {
        var k = el.getAttribute("data-p"), v = el.value.trim(); vals[k] = v;
        var cur = p[k] || "";
        if (k === "safeEmail" ? v.toLowerCase() !== cur.toLowerCase() : v !== cur) body[k] = v;
      });
      if (!Object.keys(body).length) { $("pMsg").innerHTML = '<span class="msg ok">' + t("没有改动。", "Nothing changed.") + "</span>"; return; }
      $("pSave").disabled = true;
      post("me/profile", "PATCH", body).then(function (r) {
        $("pSave").disabled = false;
        if (!r.ok) { $("pMsg").innerHTML = '<span class="msg err">' + esc(errText(r)) + (r.body && r.body.problems ? " — " + esc(r.body.problems.join("；")) : "") + "</span>"; return; }
        Object.keys(body).forEach(function (k) { p[k] = vals[k]; });
        foot();
        $("pMsg").innerHTML = '<span class="msg ok">' + t("已保存。Teams 里的显示名可能要几分钟才更新。", "Saved. Teams may take a few minutes to show the new name.") + "</span>";
      });
    });
  }

  var STAFF_FN = { curriculum: ["课程开发", "Curriculum development"], fundraising: ["募款", "Fundraising"], contractor: ["Contractor", "Contractor"], community: ["教育社区经理", "Education community manager"], finance: ["财务", "Finance"], sales: ["销售", "Sales"], sysadmin: ["系统管理员", "System administrator"] };
  function roleName(r) {
    var m;
    if ((m = /^domain_it:(.+)$/.exec(r))) return t("域管理员（IT） · ", "Domain administrator (IT) · ") + dname(m[1]);
    if ((m = /^domain_hive:(.+)$/.exec(r))) return t("域蜂巢管理员 · ", "Domain Hive administrator · ") + dname(m[1]);
    if ((m = /^domain_admin:(.+)$/.exec(r))) return t("域管理员（IT＋蜂巢） · ", "Domain administrator (IT + Hive) · ") + dname(m[1]);
    if ((m = /^staff:(.+)$/.exec(r))) return "Staff · " + (STAFF_FN[m[1]] ? STAFF_FN[m[1]][EN ? 1 : 0] : m[1]);
    if (r === "admin") return t("系统管理员", "System administrator");
    if (r === "coordinator") return t("Staff · 教育社区经理", "Staff · Education community manager");
    return r;
  }
  function roleNames(roles) {
    var seen = {}, out = [];
    (roles || []).forEach(function (r) { if (r === "admin" && (roles || []).indexOf("staff:sysadmin") >= 0) return; var n = roleName(r); if (!seen[n]) { seen[n] = 1; out.push(n); } });
    return out.length ? out.join(", ") : t("普通用户", "User");
  }

  // ================================================================================

  // ================================================================================
  // 登录与安全 (Rick, 2026-10-02): 1 重置密码 · 2 登录记录 · 3 账号变动 · 4 验证器设备
  // ================================================================================
  function viewSecurity() {
    setTitle(t("我的账号", "My account"), t("登录与安全", "Sign-in and security"), "", t("密码、登录记录和能批准您登录的设备。", "Password, sign-in records and the devices that approve your sign-ins."));
    var ms = (me.methods || []).filter(function (m) { return m.kind !== "password"; });
    var strong = ms.filter(function (m) { return m.strong; }).length;
    function dl(kind, zh, en, sub, tip) {
      return '<div class="row"><div class="rowmain"><b>' + t(zh, en) + (tip ? ' <span class="info" tabindex="0" data-tip="' + esc(tip) + '">i</span>' : "") + "</b><small>" + sub + '</small></div><div class="menu-wrap"><button class="btn secondary sm" type="button" data-menu="dl-' + kind + '">' + t("下载 ↓", "Download ↓") + '</button><div class="menu" id="dl-' + kind + '"><a href="/api/me/export?kind=' + kind + '&format=csv" download>CSV</a><a href="/api/me/export?kind=' + kind + '&format=json" download>JSON</a></div></div></div>';
    }
    $("content").innerHTML =
      '<section class="card">' +
        '<div class="row"><div class="rowmain"><b>' + t("重置密码", "Reset password") + '</b><small>' + t("在微软的页面完成；改完后所有设备会退出一次登录，请先把装验证器的手机准备好。", "On Microsoft's page; afterwards every device signs you out once — have the authenticator phone ready.") + '</small></div><a class="btn secondary" href="https://mysignins.microsoft.com/security-info/password/change" target="_blank" rel="noopener">' + t("修改密码 ↗", "Change password ↗") + "</a></div>" +
        dl("signins", "登录日志", "Sign-in logs", t("最近 7 天每次登录的时间、应用、地点和结果", "The last 7 days: time, app, place and result of each sign-in")) +
        dl("audits", "审计日志", "Audit logs", t("最近 7 天对您账号的每一次更改：谁、何时、改了什么", "The last 7 days: every change to your account — who, when, what"), t("审计日志（audit log）是微软为账号上每一次更改留下的记录：改密码、添加或删除验证器、修改资料、分配权限等，包含操作者、时间和结果。它不记录您的聊天或文件，只记录对账号本身的操作。", "The audit log is Microsoft's record of every change made to the account itself — password changes, authenticators added or removed, profile edits, permission changes — with who did it, when, and the result. It does not record chats or files.")) +
        '<div class="rowhead">' + t("验证器设备", "Authenticator devices") + ' <span class="n">' + ms.length + "</span></div>" +
        '<div id="methods">' + (ms.length ? ms.map(function (m) {
          var k = KIND[m.kind] || [m.kind, m.kind];
          return '<div class="row"><span class="avatar">' + (m.kind === "fido2" ? "⚿" : "A") + '</span><div class="rowmain"><b>' + esc(m.name || k[EN ? 1 : 0]) + '</b><small>' + esc(k[EN ? 1 : 0]) + (m.created ? " · " + t("添加于 ", "added ") + esc(day(m.created)) : "") + "</small></div>" +
            '<div class="menu-wrap"><button class="btn secondary sm dots" type="button" data-menu="dev-' + esc(m.id) + '" aria-label="' + t("更多", "More") + '">⋯</button><div class="menu" id="dev-' + esc(m.id) + '">' +
              '<button type="button" data-detail="' + esc(m.id) + '">' + t("查看详情", "Details") + "</button>" +
              '<a href="https://mysignins.microsoft.com/security-info" target="_blank" rel="noopener">' + t("添加新的身份验证设备 ↗", "Add a new authentication device ↗") + "</a>" +
              (m.removable ? '<button type="button" class="danger" data-del="' + esc(m.id) + '" data-name="' + esc(m.name || k[EN ? 1 : 0]) + '" data-last="' + (m.strong && strong <= 1 ? "1" : "") + '">' + t("删除设备", "Remove device") + "</button>" : "") +
            "</div></div>" +
            '<div class="detail hidden" id="det-' + esc(m.id) + '"><div class="kv"><span class="k">' + t("类型", "Type") + "</span><span>" + esc(k[EN ? 1 : 0]) + '</span><span class="k">' + t("名称", "Name") + "</span><span>" + esc(m.name || "—") + "</span>" + (m.detail ? '<span class="k">' + t("版本", "Version") + "</span><span>" + esc(m.detail) + "</span>" : "") + (m.created ? '<span class="k">' + t("添加于", "Added") + "</span><span>" + esc(when(m.created)) + "</span>" : "") + '<span class="k">ID</span><span class="muted">' + esc(m.id) + "</span></div></div></div>";
        }).join("") : '<div class="empty">' + t("没有登记任何验证方式。", "No sign-in methods registered.") + "</div>") + "</div>" +
        '<div id="mMsg"></div>' +
      "</section>";
    // menus
    $("content").addEventListener("click", function (ev) {
      var mb = ev.target.closest("button[data-menu]");
      document.querySelectorAll(".menu.open").forEach(function (m) { if (!mb || m.id !== mb.getAttribute("data-menu")) m.classList.remove("open"); });
      if (mb) { $(mb.getAttribute("data-menu")).classList.toggle("open"); return; }
      var det = ev.target.closest("button[data-detail]");
      if (det) { var box = $("det-" + det.getAttribute("data-detail")); box.classList.toggle("hidden"); det.closest(".menu").classList.remove("open"); return; }
      var b = ev.target.closest("button[data-del]"); if (!b) return;
      b.closest(".menu").classList.remove("open");
      var name = b.getAttribute("data-name"), last = !!b.getAttribute("data-last");
      var msg = last
        ? t("「" + name + "」是您唯一的验证设备。删除后，下次登录时微软会要求您重新注册一台新设备；如果您手边没有能登录的设备，可能需要学校的管理员协助。确定删除吗？", "\"" + name + "\" is your only authentication device. After removal, Microsoft will ask you to register a new device at your next sign-in; if you have no device at hand that can sign in, you may need your school's administrator. Remove it anyway?")
        : t("删除「" + name + "」？删除后这台设备就不能再批准您的登录。", "Remove \"" + name + "\"? That device will no longer be able to approve your sign-ins.");
      if (!window.confirm(msg)) return;
      b.disabled = true;
      api("me/method/" + encodeURIComponent(b.getAttribute("data-del")) + (last ? "?confirm=1" : ""), { method: "DELETE" }).then(function (r) {
        if (!r.ok) { b.disabled = false; $("mMsg").innerHTML = '<div class="msg err">' + esc(errText(r)) + "</div>"; return; }
        me.methods = (me.methods || []).filter(function (m) { return m.id !== b.getAttribute("data-del"); });
        viewSecurity();
        $("mMsg").innerHTML = '<div class="msg ok">' + t("已删除「" + name + "」。", "Removed \"" + name + "\".") + "</div>";
      });
    });
    document.addEventListener("click", function closeMenus(ev) { if (!ev.target.closest(".menu-wrap")) document.querySelectorAll(".menu.open").forEach(function (m) { m.classList.remove("open"); }); });
  }

  // ================================================================================
  // 我的 Teams
  // ================================================================================
  var GKIND = { class: ["班级团队", "Class team"], team: ["普通团队", "Team"], m365: ["群组", "Group"], security: ["群组", "Group"], distribution: ["群组", "Group"], other: ["群组", "Group"] };
  function teamRow(g, q) {
    var k = GKIND[g.kind] || GKIND.other;
    var vis = g.visibility ? (g.visibility === "Public" ? t("公开", "Public") : g.visibility === "Private" ? t("私密", "Private") : esc(g.visibility)) : k[EN ? 1 : 0];
    return '<div class="trow pick" data-id="' + esc(g.id) + '"><span class="tav" style="background:' + hue(g.id) + '">' + esc(initials(g.name)) + '</span>' +
      '<div class="tmain"><div class="tname">' + hl(g.name, q) + "</div><div class=\"tmeta\"><span>" + vis + "</span>" +
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
    panelOpen('<div class="ph"><span class="tav" style="width:32px;height:32px;font-size:11px;background:' + hue(id) + '">' + esc(initials(g0.name || "?")) + "</span><h3>" + esc(g0.name || "") + '</h3><button class="x" type="button" aria-label="close">✕</button></div><div class="pb"><div class="loading">' + t("载入中…", "Loading…") + "</div></div>");
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
      if (q) { var hay = (g.name + " " + (g.description || "") + " " + (g.mail || "")).toLowerCase(); if (hay.indexOf(q.toLowerCase()) < 0) return false; }
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
  function dlabel(domain) { // name, plus the domain for the administrator when they differ
    var n = dname(domain);
    return esc(n) + (domainsInfo && domainsInfo.showDomains && n !== domain ? ' <span class="muted">' + esc(domain) + "</span>" : "");
  }
  function domainPicker(id) {
    var ds = (domainsInfo && domainsInfo.domains) || [];
    if (ds.length <= 1) return ds.length ? '<span class="tag accent">' + esc(dname(ds[0].domain)) + "</span>" : "";
    return '<select id="' + id + '">' + ds.map(function (d) { return '<option value="' + esc(d.domain) + '"' + (d.domain === currentDomain ? " selected" : "") + ">" + esc(dname(d.domain)) + (domainsInfo.showDomains && d.name ? " · " + esc(d.domain) : "") + "</option>"; }).join("") + "</select>";
  }
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
      delete state.domainUsers[domain]; delete state.domainGroups[domain];
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
    setTitle(domainsInfo.all ? t("机构管理", "Institutions") : t("本域管理", "My domain"), t("用户", "Users"),
      syncButtons("us") + ' <button class="btn secondary sm" id="csv">' + t("导出 CSV", "Export CSV") + "</button>");
    $("content").innerHTML =
      '<div class="toolbar" id="ubar">' + domainPicker("dsel") +
        '<button class="chip" data-f="all" aria-pressed="' + (state.userFilter === "all") + '">' + t("全部", "All") + "</button>" +
        '<button class="chip" data-f="noauth" aria-pressed="' + (state.userFilter === "noauth") + '">' + t("未登记验证器", "No authenticator") + "</button>" +
        '<button class="chip" data-f="noid" aria-pressed="' + (state.userFilter === "noid") + '">' + t("身份未填", "No identity") + "</button>" +
        '<span class="spacer"></span><div class="search">' + ICON.search + '<input type="search" id="uq" value="' + esc(state.userQ) + '" placeholder="' + t("搜索账号、姓名、群组…", "Search account, name, group…") + '" /></div>' +
      "</div>" +
      '<div class="kpis" id="ukpi"></div>' +
      '<div class="tbl-wrap"><table class="data" id="utable"><thead><tr>' +
        "<th>" + t("账号", "Account name") + "</th><th>" + t("显示名", "Display name") + "</th><th>" + t("验证", "Authentication") + "</th><th>" + t("验证设备", "Authentication device") + "</th><th>" + t("Teams 群组", "Teams groups") + "</th><th>" + t("身份", "Identity") + "</th><th>" + t("关联账号", "Linked account") + "</th>" +
        '</tr></thead><tbody><tr><td colspan="7" class="loading">' + t("载入中…", "Loading…") + "</td></tr></tbody></table></div>" +
      '<p class="muted" id="ufoot" style="font-size:.8rem"></p>';
    var sel = $("dsel");
    if (sel) sel.addEventListener("change", function () { currentDomain = this.value; viewUsers(); });
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
    $("utable").addEventListener("click", function (e) {
      var gb = e.target.closest("button[data-group]");
      if (gb) { e.stopPropagation(); openGroupPanel(gb.getAttribute("data-group"), currentDomain); return; }
      var tr = e.target.closest("tr[data-upn]"); if (!tr) return;
      document.querySelectorAll("table.data tr.sel").forEach(function (x) { x.classList.remove("sel"); });
      tr.classList.add("sel");
      openUserPanel(tr.getAttribute("data-upn"));
    });
    loadDomainData("users").then(renderUsers).catch(showUsersError);
  }
  function showUsersError(e) { var tb = $("utable") && $("utable").tBodies[0]; if (tb) tb.innerHTML = '<tr><td colspan="7"><div class="msg err">' + esc(e.message || e) + "</div></td></tr>"; }
  function usersNow() { var d = state.domainUsers[currentDomain]; return d ? d.users : []; }
  function renderUsers() {
    if (!$("utable")) return;
    var d = state.domainUsers[currentDomain]; if (!d) return;
    var q = state.userQ.toLowerCase(), f = state.userFilter;
    var rows = d.users.filter(function (u) {
      if (f === "noauth" && u.verified !== false) return false;
      if (f === "noid" && u.identity) return false;
      if (q) {
        var hay = [u.upn, u.displayName, u.identity, u.linked.join(" "), u.groups.map(function (g) { return g.name; }).join(" "), u.devices.map(function (x) { return x.name; }).join(" ")].join(" ").toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
    var n = d.users.length, noauth = d.users.filter(function (u) { return u.verified === false; }).length, noid = d.users.filter(function (u) { return !u.identity; }).length;
    $("ukpi").innerHTML = '<div class="kpi"><div class="l">' + t("账号", "Accounts") + '</div><div class="v">' + n + "</div></div>" +
      '<div class="kpi"><div class="l">' + t("未登记验证器", "No authenticator") + '</div><div class="v' + (noauth ? " bad" : "") + '">' + noauth + "</div></div>" +
      '<div class="kpi"><div class="l">' + t("身份未填", "No identity") + '</div><div class="v">' + noid + "</div></div>" +
      '<div class="kpi"><div class="l">' + t("群组", "Groups") + '</div><div class="v">' + (state.domainGroups[currentDomain] ? state.domainGroups[currentDomain].groups.length : uniqueGroups(d.users)) + "</div></div>";
    $("utable").tBodies[0].innerHTML = rows.length ? rows.map(function (u) {
      var auth = u.verified === null ? '<span class="tag">?</span>' : u.verified ? '<span class="tag ok">Yes</span>' : '<span class="tag bad">No</span>';
      var dev = u.devices.length ? u.devices.map(function (x) { return esc(x.name) + (x.version ? ' <span class="muted">' + esc(x.version) + "</span>" : ""); }).join("<br/>") : (u.otherMethods.length ? '<span class="muted">' + esc(u.otherMethods.map(function (k) { return (KIND[k] || [k, k])[EN ? 1 : 0]; }).join(", ")) + "</span>" : '<span class="muted">—</span>');
      var gs = u.groups.filter(function (g) { return g.kind === "team" || g.kind === "class" || g.kind === "m365"; });
      var gl = gs.slice(0, 3).map(function (g) { return '<button class="tag link" type="button" data-group="' + esc(g.id) + '">' + hl(g.name, state.userQ) + "</button>"; }).join("") + (gs.length > 3 ? '<span class="tag muted">+' + (gs.length - 3) + "</span>" : "");
      return '<tr class="pick" data-upn="' + esc(u.upn) + '"><td class="acct">' + hl(u.upn, state.userQ) + (u.enabled ? "" : ' <span class="tag bad">' + t("已停用", "Disabled") + "</span>") + "</td>" +
        '<td><span class="dn">' + hl(u.displayName, state.userQ) + "</span>" + (u.lastSignIn ? '<span class="sub">' + t("最近登录 ", "Last sign-in ") + esc(day(u.lastSignIn)) + "</span>" : "") + "</td>" +
        "<td>" + auth + "</td><td>" + dev + '</td><td><div class="tags">' + (gl || '<span class="muted">—</span>') + "</div></td>" +
        "<td>" + (u.identity ? '<span class="tag accent">' + esc(u.identity) + "</span>" : '<span class="muted">—</span>') + "</td>" +
        "<td>" + (u.linked.length ? u.linked.map(function (l) { return hl(l, state.userQ); }).join("<br/>") : '<span class="muted">—</span>') + "</td></tr>";
    }).join("") : '<tr><td colspan="7"><div class="empty">' + t("没有匹配的账号。", "No matching accounts.") + "</div></td></tr>";
    $("ufoot").textContent = t("共 " + rows.length + " / " + n + " 个账号 · ", rows.length + " of " + n + " accounts · ") + syncLine(d.sync) + (d.partial ? t(" · 部分账号的方法或群组没有读到", " · some accounts' methods or groups could not be read") : "");
  }
  function uniqueGroups(users) { var s = {}; users.forEach(function (u) { u.groups.forEach(function (g) { s[g.id] = 1; }); }); return Object.keys(s).length; }
  function exportUsersCsv() {
    var d = state.domainUsers[currentDomain]; if (!d) return;
    var cols = [t("账号", "Account"), t("显示名", "Display name"), t("验证", "Authentication"), t("验证设备", "Devices"), t("Teams 群组", "Groups"), t("身份", "Identity"), t("关联账号", "Linked"), t("最近登录", "Last sign-in"), t("已启用", "Enabled")];
    var cell = function (v) { var s = v == null ? "" : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    var lines = [cols.join(",")].concat(d.users.map(function (u) {
      return [u.upn, u.displayName, u.verified === null ? "" : u.verified ? "Yes" : "No", u.devices.map(function (x) { return x.name; }).join("; "), u.groups.map(function (g) { return g.name; }).join("; "), u.identity, u.linked.join("; "), u.lastSignIn || "", u.enabled ? "Yes" : "No"].map(cell).join(",");
    }));
    var blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = currentDomain + "-users-" + new Date().toISOString().slice(0, 10) + ".csv"; a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }
  var IDENTITIES = ["家长", "学生", "老师", "行政"];
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
    var idOpts = ['<option value="">' + t("— 未填 —", "— not set —") + "</option>"].concat(IDENTITIES.map(function (i) { return '<option value="' + i + '"' + (u.identity === i ? " selected" : "") + ">" + i + "</option>"; })).join("");
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
        (canDo("methods") ? '<div class="note">' + t("删除后对方下次登录要重新绑定验证器；唯一的设备不要在他还没准备好新手机时删。重置密码和临时通行码在二期加入。", "After a delete the person links an authenticator afresh at the next sign-in; do not remove the only device before they have the new phone ready. Password reset and Temporary Access Pass come in phase 2.") + "</div>"
          : '<div class="note">' + t("登录设备由域管理员（IT）管理。", "Sign-in devices are managed by the domain administrator (IT).") + "</div>") +
        "<h4>" + t("Teams 群组", "Teams groups") + '</h4><div class="tags" style="display:flex;gap:4px;flex-wrap:wrap">' + (u.groups.length ? u.groups.map(function (g) { return '<button class="tag link' + (g.kind === "team" || g.kind === "class" ? " accent" : "") + '" type="button" data-group="' + esc(g.id) + '">' + esc(g.name) + "</button>"; }).join("") : '<span class="muted">—</span>') + "</div>" +
        (u.extra ? "<h4>" + t("补充资料（本人填写）", "More about them (self-reported)") + '</h4><div class="kv">' +
          ((u.extra.roles || []).length ? '<span class="k">' + t("身份/角色", "Roles") + "</span><span>" + esc(u.extra.roles.map(vl).join("、") + (u.extra.rolesOther ? "（" + u.extra.rolesOther + "）" : "")) + "</span>" : "") +
          ((u.extra.topics || []).length ? '<span class="k">' + t("感兴趣", "Topics") + "</span><span>" + esc(u.extra.topics.map(function (x) { return x === "其它" && u.extra.topicsOther ? u.extra.topicsOther : vl(x); }).join("、")) + "</span>" : "") +
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
        (canDo("people") ? '<form id="pform"><label class="f">' + t("身份", "Identity") + '<select id="pid">' + idOpts + "</select>" + (u.identitySource === "entra" ? "<small>" + t("来自 Entra 的部门字段", "From Entra's department field") + "</small>" : "") + "</label>" +
          '<label class="f" style="margin-top:8px">' + t("关联账号（孩子 / 家长的 Teams 账号，多个用逗号分开）", "Linked accounts (child / parent Teams accounts, comma-separated)") + '<input type="text" id="plink" value="' + esc(u.linked.join(", ")) + '" placeholder="student@' + esc(currentDomain) + '" /></label>' +
          '<label class="f" style="margin-top:8px">' + t("备注", "Note") + '<input type="text" id="pnote" maxlength="200" value="' + esc(u.note) + '" /></label>' +
          '<div class="actions"><button class="btn" type="submit" id="psave">' + t("保存", "Save") + '</button></div><div id="pmsg"></div></form>'
        : '<div class="kv"><span class="k">' + t("身份", "Identity") + "</span><span>" + esc(u.identity ? vl(u.identity) : "—") + '</span><span class="k">' + t("关联账号", "Linked") + "</span><span>" + esc(u.linked.join(", ") || "—") + "</span>" + (u.note ? '<span class="k">' + t("备注", "Note") + "</span><span>" + esc(u.note) + "</span>" : "") + '</div><div class="note">' + t("身份和关联由域蜂巢管理员或蜂巢员工维护。", "Identity and links are maintained by the domain Hive administrator or Hive staff.") + "</div>") +
      "</div>", where);
    if ($("pform")) $("pform").addEventListener("submit", function (ev) {
      ev.preventDefault(); $("psave").disabled = true;
      post("domain/person", "PATCH", { domain: currentDomain, user: u.upn, identity: $("pid").value, linked: $("plink").value, note: $("pnote").value }).then(function (r) {
        $("psave").disabled = false;
        if (!r.ok) { $("pmsg").innerHTML = '<div class="msg err">' + esc(errText(r)) + "</div>"; return; }
        var rec = r.body.record || {};
        u.identity = rec.identity || (u.identitySource === "entra" ? u.identity : ""); u.identitySource = rec.identity ? "hive" : u.identitySource;
        u.linked = rec.linked || []; u.note = rec.note || "";
        $("pmsg").innerHTML = '<div class="msg ok">' + t("已保存。", "Saved.") + "</div>";
        renderUsers();
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
        '<div class="ph"><span class="tav" style="width:32px;height:32px;font-size:11px;background:' + hue(g.id) + '">' + esc(initials(g.name)) + "</span><h3>" + esc(g.name) + '</h3><button class="x" type="button" aria-label="close">✕</button></div>' +
        '<div class="pb">' +
          '<div class="kv"><span class="k">' + t("类型", "Type") + "</span><span>" + esc(k[EN ? 1 : 0]) + "</span>" +
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
        "</div>");
    });
  }

  function viewGroups() {
    setTitle(domainsInfo.all ? t("机构管理", "Institutions") : t("本域管理", "My domain"), t("Teams 群组", "Teams groups"), syncButtons("gs"));
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
    var rows = d.groups.filter(function (g) { return !q || (g.name + " " + g.description).toLowerCase().indexOf(q.toLowerCase()) >= 0; });
    var n = $("gn-" + domain.replace(/\W/g, "_")); if (n) n.textContent = d.groups.length + t(" 个群组", " groups") + (q ? " · " + rows.length + t(" 个匹配", " match") : "") + " · " + syncLine(d.sync);
    var people = {}; ((state.domainUsers[domain] || {}).users || []).forEach(function (u) { people[u.upn] = u; });
    det.querySelector(".leaf").innerHTML = rows.length ? rows.map(function (g) {
      var k = GKIND[g.kind] || GKIND.other;
      var members = (g.members || []).map(function (upn) {
        var u = people[upn];
        return '<button class="mrow link" type="button" data-upn="' + esc(upn) + '" data-domain="' + esc(domain) + '"><span class="avatar sm" style="background:' + hue(upn) + '">' + esc(initials((u && u.displayName) || upn)) + '</span><span class="mname">' + esc((u && u.displayName) || "") + '</span><span class="mupn">' + esc(upn) + "</span>" + (u && u.identity ? '<span class="tag">' + esc(vl(u.identity)) + "</span>" : "<span></span>") + "</button>";
      }).join("");
      return '<div class="trow"><span class="tav" style="background:' + hue(g.id) + '">' + esc(initials(g.name)) + '</span><div class="tmain"><div class="tname">' + hl(g.name, q) + '</div><div class="tmeta"><span>' + esc(k[EN ? 1 : 0]) + "</span>" + (g.visibility ? "<span>" + (g.visibility === "Public" ? t("公开", "Public") : t("私密", "Private")) + "</span>" : "") + "<span>" + g.domainMembers + t(" 位本域成员", " members from this domain") + "</span>" + (g.description ? '<span class="desc">' + hl(g.description, q) + "</span>" : "") + "</div>" +
        '<div class="members hidden">' + (members || '<div class="muted" style="font-size:.84rem">' + t("本域没有成员。", "No members from this domain.") + "</div>") + '<div class="muted" style="font-size:.78rem;margin-top:6px">' + t("只读：成员的增减在 Teams 或 Microsoft 365 管理中心完成。", "Read-only: members are added or removed in Teams or the Microsoft 365 admin center.") + "</div></div>" +
        '</div><div class="gact"><button class="btn secondary sm" type="button" data-members="1">' + t("查看成员", "View members") + "</button></div></div>";
    }).join("") : '<div class="empty">' + t("没有群组。", "No groups.") + "</div>";
  }

  // ================================================================================
  // 系统 › 角色分配 / 数据同步
  // ================================================================================
  function viewRoles() {
    setTitle(t("系统", "System"), t("角色分配", "Roles"), "", t("谁可以管理哪所学校。", "Who manages which school."));
    var doms = (domainsInfo && domainsInfo.domains) || [];
    var domOpts = doms.map(function (d) { return '<label class="chk"><input type="checkbox" data-dom="' + esc(d.domain) + '" /> ' + dlabel(d.domain) + "</label>"; }).join("");
    $("content").innerHTML =
      '<div class="card"><p class="sub">' +
        t("普通用户无需分配。域管理员（IT）管本域账号的登录设备；域蜂巢管理员管本域账号的身份、关联和资料；Staff 是蜂巢员工，按职能分，能看所有学校；系统管理员拥有全部权限。域角色和 Staff 立即生效；系统管理员在对方下次登录后生效。",
          "Ordinary users need no role. Domain administrator (IT): the domain's sign-in devices. Domain Hive administrator: the domain's 身份, links and profiles. Staff: Hive's own people by function, across every school. System administrator: everything. Domain roles and Staff work at once; System administrator takes effect at the person's next sign-in.") + "</p>" +
        '<table class="roles" id="rtable"><thead><tr><th>' + t("账号", "Account") + "</th><th>" + t("角色", "Roles") + "</th><th>" + t("授予", "By") + '</th><th></th></tr></thead><tbody><tr><td colspan="4" class="loading">' + t("载入中…", "Loading…") + "</td></tr></tbody></table>" +
        '<form class="role-form" id="rform" autocomplete="off">' +
          '<label class="f">' + t("账号", "Account") + '<input type="email" id="ruser" placeholder="name@school-domain" required /></label>' +
          '<div class="f-title">' + t("域角色（勾选角色，再勾选域）", "Domain roles (tick the role, then the domains)") + "</div>" +
          '<div class="chks"><label class="chk"><input type="checkbox" id="rIT" /> ' + t("域管理员（IT）", "Domain administrator (IT)") + '</label><label class="chk"><input type="checkbox" id="rHive" /> ' + t("域蜂巢管理员", "Domain Hive administrator") + "</label></div>" +
          '<div class="chks" id="rdoms">' + domOpts + '<label class="chk">' + t("其它域：", "Other domain: ") + '<input type="text" id="rdomOther" placeholder="school.edu" style="width:180px" /></label></div>' +
          '<div class="f-title">Staff</div>' +
          '<div class="grid2"><label class="f">' + t("蜂巢员工职能", "Hive staff function") + '<select id="rStaff"><option value="">' + t("不是员工", "Not staff") + "</option>" + Object.keys(STAFF_FN).map(function (k) { return '<option value="' + k + '">' + esc(STAFF_FN[k][EN ? 1 : 0]) + "</option>"; }).join("") + "</select></label></div>" +
          '<div class="actions"><button class="btn" type="submit">' + t("保存角色", "Save roles") + '</button><button class="btn secondary" type="button" id="rClear">' + t("清空表单", "Clear") + "</button></div></form><div id=\"rmsg\"></div></div>";
    function render(entries) {
      var tb = $("rtable").tBodies[0];
      tb.innerHTML = entries.length ? entries.map(function (e) {
        return '<tr><td><a href="#" data-edit="' + esc(e.user) + '">' + esc(e.user) + "</a></td><td>" + e.roles.map(function (r) { return esc(roleName(r)); }).join("<br/>") + '</td><td class="muted">' + esc(e.by || "") + (e.at ? "<br/>" + esc(day(e.at)) : "") + '</td><td><button class="btn danger sm" type="button" data-user="' + esc(e.user) + '">' + t("移除", "Remove") + "</button></td></tr>";
      }).join("") : '<tr><td colspan="4" class="muted">' + t("还没有分配任何角色", "No roles assigned yet") + "</td></tr>";
    }
    function msg(ok, txt) { $("rmsg").innerHTML = '<div class="msg ' + (ok ? "ok" : "err") + '">' + esc(txt) + "</div>"; }
    function clearForm() { $("ruser").value = ""; $("rIT").checked = false; $("rHive").checked = false; $("rdomOther").value = ""; $("rStaff").value = ""; $("rform").querySelectorAll("input[data-dom]").forEach(function (c) { c.checked = false; }); }
    function fill(e) {
      clearForm(); $("ruser").value = e.user;
      e.roles.forEach(function (r) {
        var m;
        if ((m = /^domain_(it|hive|admin):(.+)$/.exec(r))) {
          if (m[1] !== "hive") $("rIT").checked = true;
          if (m[1] !== "it") $("rHive").checked = true;
          var c = $("rform").querySelector('input[data-dom="' + m[2] + '"]'); if (c) c.checked = true; else $("rdomOther").value = m[2];
        } else if ((m = /^staff:(.+)$/.exec(r))) $("rStaff").value = m[1];
        else if (r === "admin") $("rStaff").value = "sysadmin";
        else if (r === "coordinator") $("rStaff").value = "community";
      });
      $("ruser").focus();
    }
    var entries = [];
    api("roles").then(function (r) { if (!r.ok) return msg(false, errText(r)); entries = r.body.entries || []; render(entries); });
    $("rClear").addEventListener("click", clearForm);
    $("rform").addEventListener("submit", function (ev) {
      ev.preventDefault();
      var user = $("ruser").value.trim().toLowerCase();
      var roles = [];
      var ds = Array.prototype.map.call($("rform").querySelectorAll("input[data-dom]:checked"), function (c) { return c.getAttribute("data-dom"); });
      $("rdomOther").value.split(/[\s,;，；]+/).map(function (d) { return d.trim().toLowerCase(); }).filter(Boolean).forEach(function (d) { if (ds.indexOf(d) < 0) ds.push(d); });
      if (($("rIT").checked || $("rHive").checked) && !ds.length) return msg(false, t("请勾选至少一个域。", "Tick at least one domain."));
      ds.forEach(function (d) { if ($("rIT").checked) roles.push("domain_it:" + d); if ($("rHive").checked) roles.push("domain_hive:" + d); });
      if ($("rStaff").value) roles.push("staff:" + $("rStaff").value);
      post("roles", "POST", { user: user, roles: roles }).then(function (r) {
        if (!r.ok) return msg(false, errText(r));
        entries = r.body.entries || []; render(entries); clearForm();
        msg(true, roles.length ? t("已保存：", "Saved: ") + user + " — " + roleNames(roles) : t("已设为普通用户：", "Now an ordinary user: ") + user);
      });
    });
    $("rtable").addEventListener("click", function (ev) {
      var a = ev.target.closest("a[data-edit]");
      if (a) { ev.preventDefault(); var e = entries.filter(function (x) { return x.user === a.getAttribute("data-edit"); })[0]; if (e) fill(e); return; }
      var b = ev.target.closest("button[data-user]"); if (!b) return;
      var user = b.getAttribute("data-user");
      if (!window.confirm(t("移除 " + user + " 的所有角色（变为普通用户）？", "Remove all roles from " + user + " (ordinary user)?"))) return;
      post("roles", "DELETE", { user: user }).then(function (r) { if (!r.ok) return msg(false, errText(r)); entries = r.body.entries || []; render(entries); msg(true, t("已移除：", "Removed: ") + user); });
    });
  }
  function viewInstitutions() {
    setTitle(t("系统", "System"), t("机构名称", "Institutions"), "", t("给每个域名一个中文和英文的机构名称；页面按语言显示其一（缺少时显示另一个）。除系统管理员外，所有人只看到名称。", "Give each domain a Chinese and an English school name; the page shows the one of its language (the other if that is missing). Everyone but the system administrator sees only the names."));
    var ds = (domainsInfo && domainsInfo.domains) || [];
    $("content").innerHTML =
      '<div class="card"><table class="roles inst" id="itable"><thead><tr><th>' + t("域名", "Domain") + "</th><th>" + t("中文名称", "Chinese name") + "</th><th>" + t("英文名称", "English name") + "</th><th></th></tr></thead><tbody>" +
        ds.map(function (d) {
          return '<tr data-domain="' + esc(d.domain) + '"><td>' + esc(d.domain) + (d.isDefault ? ' <span class="tag">' + t("默认", "default") + "</span>" : "") + "</td>" +
            '<td><input type="text" data-n="zh" maxlength="60" value="' + esc(d.name || "") + '" placeholder="' + t("例如：北京某某学校", "e.g. 北京某某学校") + '" /></td>' +
            '<td><input type="text" data-n="en" maxlength="80" value="' + esc(d.nameEn || "") + '" placeholder="e.g. Beijing Example School" /></td>' +
            '<td><button class="btn secondary sm" type="button">' + t("保存", "Save") + "</button></td></tr>";
        }).join("") + '</tbody></table><div id="imsg"></div></div>';
    $("itable").addEventListener("click", function (ev) {
      var b = ev.target.closest("button"); if (!b) return;
      var tr = b.closest("tr"), domain = tr.getAttribute("data-domain");
      var name = tr.querySelector("input[data-n=zh]").value.trim(), nameEn = tr.querySelector("input[data-n=en]").value.trim();
      // The button itself answers (Rick, 2026-10-03: 「点击保存没有反应」): 保存中… → 已保存 ✓.
      var label = b.textContent; b.disabled = true; b.textContent = t("保存中…", "Saving…"); $("imsg").innerHTML = "";
      post("domain/institution", "PUT", { domain: domain, name: name, nameEn: nameEn }).then(function (r) {
        b.disabled = false;
        if (!r.ok) { b.textContent = label; $("imsg").innerHTML = '<div class="msg err">' + esc(errText(r)) + "</div>"; return; }
        var d = dinfo(domain); if (d) { d.name = name; d.nameEn = nameEn; }
        b.textContent = t("已保存 ✓", "Saved ✓"); setTimeout(function () { b.textContent = label; }, 2500);
        $("imsg").innerHTML = '<div class="msg ok">' + t("已保存：", "Saved: ") + esc(domain) + (name || nameEn ? " → " + esc([name, nameEn].filter(Boolean).join(" / ")) : t("（已清除名称）", " (names cleared)")) + "</div>";
      }).catch(function (e) { b.disabled = false; b.textContent = label; $("imsg").innerHTML = '<div class="msg err">' + esc(String(e)) + "</div>"; });
    });
  }
  function viewSync() {
    setTitle(t("系统", "System"), t("数据同步", "Data sync"), "", t("把 Airtable 里的课程数据发布到网站。", "Publish the course data from Airtable to the site."));
    $("content").innerHTML =
      '<div class="card"><h2>' + t("课程数据同步", "Course data sync") + '</h2><p class="sub">' + t("网站数据不会自动更新。点击按钮从 Airtable 拉取最新的毕业路径与课程数据并发布到网站。", "Site data does not update automatically. Pull the latest tracks and courses from Airtable and publish them.") + "</p>" +
        '<div class="kpis"><div class="kpi"><div class="l">' + t("上次同步", "Last synced") + '</div><div class="v" style="font-size:1rem" id="sLast">—</div></div><div class="kpi"><div class="l">' + t("毕业路径", "Tracks") + '</div><div class="v" id="sT">—</div></div><div class="kpi"><div class="l">' + t("课程", "Courses") + '</div><div class="v" id="sC">—</div></div><div class="kpi"><div class="l">' + t("学科", "Subjects") + '</div><div class="v" id="sS">—</div></div></div>' +
        '<div class="actions"><button class="btn" id="syncBtn" type="button">' + t("立即从 Airtable 同步", "Sync from Airtable now") + '</button><a class="btn secondary" href="/" target="_blank" rel="noopener">' + t("查看网站 ↗", "View site ↗") + '</a></div><div id="sMsg"></div></div>';
    function status() {
      fetch("/api/data").then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (d) {
        $("sLast").textContent = d.generatedAt ? when(d.generatedAt) : "—"; var c = d.counts || {};
        $("sT").textContent = c.tracks != null ? c.tracks : (d.tracks || []).length; $("sC").textContent = c.courses != null ? c.courses : (d.courses || []).length; $("sS").textContent = c.subjects != null ? c.subjects : (d.subjects || []).length;
      }).catch(function () { $("sLast").textContent = t("尚未同步", "Not synced yet"); });
    }
    status();
    $("syncBtn").addEventListener("click", function () {
      var b = $("syncBtn"); b.disabled = true; b.textContent = t("同步中…", "Syncing…");
      fetch("/api/sync", { method: "POST" }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); }).then(function (r) {
        b.disabled = false; b.textContent = t("立即从 Airtable 同步", "Sync from Airtable now");
        var warns = (r.body && r.body.warnings) || [];
        if (r.ok && r.body && r.body.ok) { var c = r.body.counts || {}; $("sMsg").innerHTML = '<div class="msg ' + (warns.length ? "err" : "ok") + '">' + esc(t("同步成功：", "Synced: ") + (c.tracks || 0) + " tracks · " + (c.courses || 0) + " courses · " + (c.subjects || 0) + " subjects" + (warns.length ? "\n⚠ " + warns.join("\n⚠ ") : "")) + "</div>"; status(); }
        else $("sMsg").innerHTML = '<div class="msg err">' + esc(t("同步失败：", "Sync failed: ") + ((r.body && r.body.error) || "?")) + "</div>";
      }).catch(function (e) { b.disabled = false; b.textContent = t("立即从 Airtable 同步", "Sync from Airtable now"); $("sMsg").innerHTML = '<div class="msg err">' + esc(String(e)) + "</div>"; });
    });
  }

  // ================================================================================
  // boot + router
  // ================================================================================
  function loadMe() {
    return api("me/summary").then(function (r) {
      if (!r.ok) throw r;
      me = r.body; foot(); afterSwitch();
      // Just arrived from the sign-in tab: tell the other tabs, once, and take the marker out of the address.
      if (/[?&]signedin=1\b/.test(location.search)) {
        try { history.replaceState(null, "", location.pathname + location.search.replace(/([?&])signedin=1&?/, "$1").replace(/[?&]$/, "") + location.hash); } catch (e) {}
        // Signed in in this very tab (no opener — the sign-in window was blocked, or
        // the hand-off in index.html's head already happened): tell the other tabs
        // once so their headers switch; nobody else navigates.
        if (!window.__fcHandedOff) {
          try { new BroadcastChannel("fc-auth").postMessage({ kind: "in", at: Date.now(), handed: true }); } catch (e) {}
          try { localStorage.setItem("fc-auth-event", "in:" + Date.now() + ":handed"); } catch (e) {}
        }
      }
      return me;
    });
  }
  function route() {
    panelClose();
    var h = location.hash || "#/account";
    nav();
    if (!me) return;
    if (h.indexOf("#/teams") === 0) return viewTeams();
    if (h.indexOf("#/security") === 0) return viewSecurity();
    if (h.indexOf("#/domain") === 0) {
      if (!domainsInfo || !domainsInfo.domains.length) { location.hash = "#/account"; return; }
      if (!currentDomain) currentDomain = (domainsInfo.domains.filter(function (d) { return d.domain === domainsInfo.mine; })[0] || domainsInfo.domains[0]).domain;
      return h.indexOf("#/domain/groups") === 0 ? viewGroups() : viewUsers();
    }
    if (h.indexOf("#/system") === 0) {
      if (!isAdmin()) { location.hash = "#/account"; return; }
      return h.indexOf("#/system/sync") === 0 ? viewSync() : h.indexOf("#/system/institutions") === 0 ? viewInstitutions() : viewRoles();
    }
    viewAccount();
  }
  window.addEventListener("hashchange", route);

  // Roles granted while this page is open (Rick, 2026-10-03: a test account was made an
  // administrator but 「UI stays unchanged」): whenever the tab comes back into view the
  // roles and managed domains are read again and the navigation redrawn. No timer, so
  // an unattended tab does not keep the session alive.
  var rolesSeen = "";
  function rolesKey() { return JSON.stringify([(me && me.roles) || [], (domainsInfo && domainsInfo.domains || []).map(function (d) { return [d.domain, d.can]; }), domainsInfo && domainsInfo.all]); }
  function refreshRoles() {
    if (!me) return;
    Promise.all([api("me/summary"), api("domain/domains")]).then(function (rs) {
      if (!rs[0].ok) return;
      me = rs[0].body; domainsInfo = rs[1].ok ? rs[1].body : null;
      var k = rolesKey();
      if (k !== rolesSeen) { rolesSeen = k; foot(); nav(); if (/^#\/(domain|system)/.test(location.hash)) route(); }
    }).catch(function () {});
  }
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") refreshRoles(); });
  loadMe().then(function () {
    return api("domain/domains").then(function (r) { domainsInfo = r.ok ? r.body : null; }).catch(function () { domainsInfo = null; });
  }).then(function () { rolesSeen = rolesKey(); }).then(route).catch(function (r) {
    var msg = r && r.body ? errText(r) : String(r);
    $("content").innerHTML = '<div class="card"><h2>' + t("无法读取账号", "Could not load the account") + '</h2><p class="sub">' + esc(msg) + '</p><div class="actions"><a class="btn" href="/.auth/login/aad?post_login_redirect_uri=' + encodeURIComponent("/management/") + '">' + t("重新登录", "Sign in again") + "</a></div></div>";
    $("fName").textContent = t("未登录", "Signed out"); $("fAvatar").textContent = "?";
    nav();
  });
})();
