// management/src/01-core.js — Language (t, EN), helpers (esc, $, api, when, flash…), shared state, the shell: sidebar, footer, sign-out, panels.
// Part of management.js: scripts/build-management.js concatenates management/src/*.js in name order
// into management/management.js (one closure; every part sees every other's functions). Edit here, not the built file.
  // ---- language ------------------------------------------------------------------
  var LANG = "zh";
  try { var s0 = localStorage.getItem("fc-lang"); if (s0 === "en" || s0 === "zh") LANG = s0; } catch (e) {}
  var EN = LANG === "en";
  function t(zh, en) { return EN ? en : zh; }
  document.documentElement.lang = EN ? "en" : "zh-CN";
  document.title = t("蜂巢 · 管理中心", "Hive · Management Center");
  document.getElementById("brandTag").textContent = t("管理中心", "Management Center");
  document.getElementById("fOut").textContent = t("退出", "Sign out");
  document.getElementById("fWho").title = t("账号", "Account");
  document.getElementById("menuToggle").setAttribute("aria-label", t("菜单", "Menu"));
  document.getElementById("content").innerHTML = '<div class="loading">' + t("载入中…", "Loading…") + "</div>";
  document.getElementById("fName").textContent = t("载入中…", "Loading…");
  // The language button is the site header's (#langBtn, drawn by site-header.js).
  var langBtn = document.getElementById("langBtn");
  if (langBtn) langBtn.addEventListener("click", function () {
    try { localStorage.setItem("fc-lang", EN ? "zh" : "en"); } catch (e) {}
    location.reload();
  });

  // ---- helpers -------------------------------------------------------------------
  function $(id) { return document.getElementById(id); }
  function esc(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  // The sidebar group and page crumb for the school pages: "学校管理" for a school's own people, "各校管理" for the system administrator.
  function domainGroupTitle() { return t("学校管理", "School management"); } // one name for everyone (Rick, 2026-10-18; it used to say 各校管理 for the sysadmin)
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
  // English dates spell the month (9 Oct 2026): "09/10/2026" reads as 9 October to a British reader and 10 September to
  // an American one (Rick, 2026-10-21: the panel's "since 09/10/2026" against the board's "12 d in stage"). Chinese keeps 2026/10/09.
  var fmtDT = new Intl.DateTimeFormat(EN ? "en-GB" : "zh-CN", EN ? { timeZone: "Asia/Shanghai", year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false } : { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
  var fmtD = new Intl.DateTimeFormat(EN ? "en-GB" : "zh-CN", EN ? { timeZone: "Asia/Shanghai", year: "numeric", month: "short", day: "numeric" } : { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" });
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
    chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19V5"/><path d="M4 19h16"/><path d="M8 15l4-5 3 3 5-6"/></svg>',
    camera: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
    cart: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4h2l2.4 11.2a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.5-1.1L21 8H6.2"/><circle cx="9.5" cy="20" r="1.3"/><circle cx="17" cy="20" r="1.3"/></svg>',
    book: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5V5.5M8 7h8M8 10.5h8"/></svg>',
    mute: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 9.5-4.9M18 8c0 3 .8 5 2 6.5H4c.9-1.1 1.6-2.4 1.9-4"/><path d="M10 19a2 2 0 0 0 4 0M3 3l18 18"/></svg>',
    cal: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
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
  var state = { teams: null, teamFilter: "all", teamSort: "az", teamQ: "", domainUsers: {}, domainGroups: {}, userQ: "", userFilter: "all", userRole: "", allDomains: null }; // allDomains null = not chosen yet: 用户管理 opens on 所有学校 for whoever manages several (Rick, 2026-10-20/21)

  // Where a sign-in lands when the address has no hash: staff on the dashboard, everyone else on
  // 毕业要求与课程地图 (Rick, 2026-10-19). The router and the sidebar highlight both use this.
  function landingHash() { return isStaff() ? "#/dashboard" : isProviderOnly() ? "#/hive" : "#/plan"; }
  // ---- shell: sidebar, footer, sign-out, drawer ------------------------------
  function nav() {
    var groups = [
      // Order and wording (Rick, 2026-10-19): the plan first, for everyone; profile last.
      { title: t("我的账号", "My account"), items: [
        { hash: "#/plan", icon: "book", zh: "毕业要求与课程地图", en: "Curriculum Map" },
        { hash: "#/myorders", icon: "cart", zh: "我的订单", en: "My Orders" },
        { hash: "#/teams", icon: "teams", zh: "我的 Teams 团队", en: "Teams Groups" },
        { hash: "#/calendar", icon: "cal", zh: "我的日历", en: "Calendar" },
        { hash: "#/security", icon: "key", zh: "Teams 登录与安全", en: "Security & Sign-in" },
        { hash: "#/account", icon: "user", zh: "个人资料", en: "Profile" },
      ].concat(me && me.hive && me.hive.teacherId ? [{ hash: "#/teacher", icon: "user", zh: "教师资料", en: "Teacher profile" }] : []) },
    ];
    // 蜂巢课程 / Hive Courses (v3 第二批 ③, Rick 2026-10-21): the quick entry for a Hive course teacher (我的课程) and for a
    // provider's leader (概览 · 课程 · 订单 · 老师), beside 我的账号 and the school group — a person can hold both.
    var prov = providerHives().length > 0, hiveItems = [];
    if (prov) hiveItems.push({ hash: "#/hive", icon: "chart", zh: "概览", en: "Overview" });
    if (prov || (coursesInfo && !coIsApprover() && !coIsViewer() && (coursesInfo.courses || []).length)) hiveItems.push({ hash: "#/courses", icon: "book", zh: prov ? "课程" : "我的课程", en: prov ? "Courses" : "My courses", badge: coMyBadge() });
    if (prov && isProviderOnly()) hiveItems.push({ hash: "#/ops/orders", icon: "cart", zh: "订单", en: "Orders" });
    if (prov && !isAdmin() && !coIsApprover() && !teIsLeader()) hiveItems.push({ hash: "#/domain/teachers", icon: "users", zh: "老师", en: "Teachers" });
    if (hiveItems.length) groups.push({ title: t("蜂巢课程", "Hive Courses"), items: hiveItems });
    if (domainsInfo && domainsInfo.domains && domainsInfo.domains.length) {
      // Accounts pages for whoever may view a school's accounts (IT 管理员, staff); 课程方案
      // for an 教育领袖 (who sees nothing else of the school), 课程总监 and the sysadmin.
      var seesAccounts = domainsInfo.domains.some(function (d) { return d.can && d.can.view; });
      // Order and wording (Rick, 2026-10-18/19): 用户管理 · Teams 团队管理 · 日历管理 · 操作手册 (the plan moved to 我的账号)
      groups.push({ title: domainGroupTitle(), items: (seesAccounts ? [
        { hash: "#/domain/users", icon: "users", zh: "用户管理", en: "User management" },
        { hash: "#/domain/groups", icon: "tree", zh: "Teams 团队管理", en: "Teams management" },
      ] : []).concat(canSeeCalendar() ? [{ hash: "#/domain/calendar", icon: "cal", zh: "日历管理", en: "Calendar management" }] : [])
        .concat(teCanManage() ? [{ hash: "#/domain/teachers", icon: "users", zh: "教师资料", en: "Teacher profiles" }] : [])
        .concat(seesAccounts ? [{ hash: "#/domain/handbook", icon: "book", zh: "操作手册", en: "Handbook" }] : []) });
    }
    // (a provider's leader without a CRM level finds 订单 under 蜂巢课程 above, nothing else of 经营)
    if (canSeeOrders() || isStaff()) {
      groups.push({ title: t("经营", "Operations"), items: [
        { hash: "#/dashboard", icon: "chart", zh: "仪表盘", en: "Dashboard" },
        { hash: "#/ops/orders", icon: "cart", zh: "订单", en: "Orders" },
        { hash: "#/ops/people", icon: "users", zh: "人员库", en: "People Hub" },
      ].concat(coIsApprover() || coIsViewer() ? [{ hash: "#/courses", icon: "book", zh: "课程管理", en: "Course Management", badge: coPendingBadge() }] : []).concat(coIsApprover() && !(domainsInfo && domainsInfo.domains && domainsInfo.domains.length) ? [{ hash: "#/domain/teachers", icon: "users", zh: "教师资料", en: "Teacher profiles" }] : []).concat(crmLevel("partners") !== "none" ? [{ hash: "#/ops/partners", also: "#/ops/institutions", icon: "tree", zh: "合作伙伴", en: "Partners" }] : []).concat(crmLevel("drm") !== "none" ? [{ hash: "#/ops/licenses", icon: "key", zh: "许可", en: "Licences" }] : []).concat(canSeeStatements() ? [{ hash: "#/ops/statements", icon: "chart", zh: "对账单", en: "Statements" }] : []).concat(canSeeRoyalty() ? [{ hash: "#/ops/royalty", icon: "chart", zh: "版税结算", en: "Royalties" }] : []) });
    }
    if (isAdmin()) {
      groups.push({ title: t("系统", "System"), items: [
        { hash: "#/system/roles", icon: "key", zh: "角色分配", en: "Roles" },
        { hash: "#/system/sync", icon: "sync", zh: "数据同步", en: "Data sync" },
      ] });
    } else if (canAssignRoles()) {
      groups.push({ title: t("系统", "System"), items: [{ hash: "#/system/roles", icon: "key", zh: "角色分配", en: "Roles" }] });
    }
    var cur = location.hash || landingHash();
    $("nav").innerHTML = groups.map(function (g) {
      return '<div class="nav-group"><div class="nav-title">' + esc(g.title) + "</div>" + g.items.map(function (it) {
        var active = it.hash && (cur.indexOf(it.hash) === 0 || (it.also && cur.indexOf(it.also) === 0));
        return '<a class="nav-item' + (active ? " active" : "") + '" href="' + esc(it.hash || it.href) + '">' + ICON[it.icon] + "<span>" + esc(t(it.zh, it.en)) + "</span>" + (it.badge ? '<span class="navbadge">' + esc(it.badge) + "</span>" : "") + (it.href ? '<span class="ext">↗</span>' : "") + "</a>";
      }).join("") + "</div>";
    }).join("");
    navInfo();
  }
  function isAdmin() { var r = (me && me.roles) || []; return r.indexOf("admin") >= 0 || r.indexOf("staff:sysadmin") >= 0; }
  // What the signed-in person may do in the current domain (from /api/domain/domains).
  function canDo(what) {
    if (!domainsInfo) return false;
    var d = (domainsInfo.domains || []).filter(function (x) { return x.domain === currentDomain; })[0];
    return !!(d && d.can && d.can[what]);
  }
  // The person's Microsoft 365 photo (GET /api/me/photo → image, or 204 when none).
  // Fetched once per page load (and again after a change), then painted into every
  // avatar that carries data-photo="me"; without a photo the initials stay.
  var photoUrl = null, photoVersion = 0;
  function loadPhoto(force) {
    if (photoUrl !== null && !force) return Promise.resolve(photoUrl);
    return fetch("/api/me/photo?v=" + (++photoVersion), { credentials: "same-origin", cache: "no-store" }).then(function (r) {
      if (r.status !== 200) { photoUrl = ""; return ""; }
      return r.blob().then(function (b) { if (photoUrl && /^blob:/.test(photoUrl)) { try { URL.revokeObjectURL(photoUrl); } catch (e) {} } photoUrl = URL.createObjectURL(b); return photoUrl; });
    }).catch(function () { photoUrl = ""; return ""; }).then(function (u) { paintPhotos(); return u; });
  }
  function paintPhotos() {
    document.querySelectorAll('[data-photo="me"]').forEach(function (el) {
      var img = el.querySelector("img");
      if (photoUrl) {
        if (!img) { img = document.createElement("img"); img.alt = ""; el.appendChild(img); }
        img.src = photoUrl; el.classList.add("has-photo");
      } else { if (img) img.remove(); el.classList.remove("has-photo"); }
    });
  }
  function foot() {
    var p = me && me.profile, upn = p ? p.upn || "" : "";
    $("fAvatar").textContent = initials(p ? p.displayName || upn : "?");
    $("fAvatar").setAttribute("data-photo", "me"); paintPhotos();
    $("fName").textContent = p ? (p.displayName || upn) : t("未登录", "Signed out");
    $("fUpn").textContent = upn;
    $("fWho").title = t("账号", "Account");
    // The other Office 365 accounts the person listed in 补充资料, minus the one in use.
    var others = ((me && me.hive && me.hive.extra && me.hive.extra.otherAccounts) || []).filter(function (a) {
      return a && String(a).toLowerCase() !== upn.toLowerCase();
    });
    $("fMenu").innerHTML =
      '<div class="cur"><b>' + esc(p ? p.displayName || upn : "") + "</b><span>" + esc(upn) + "</span></div>" +
      '<button type="button" class="mi" role="menuitem" data-switch="">' + (others.length ? t("切换账号", "Switch account") : t("使用新账号登录", "Sign in with another account")) +
        "<small>" + t("结束当前会话，到微软的账号列表选另一个账号登录。", "Ends this session and takes you to Microsoft's account list to sign in as another account.") + "</small></button>" +
      (others.length ? '<div class="hd">' + t("我的其他账号", "My other accounts") + "</div>" + others.map(function (a) {
        return '<button type="button" class="mi" role="menuitem" data-switch="' + esc(a) + '" title="' + esc(a) + '">' + esc(a) + "</button>";
      }).join("") : "");
  }
  function menuOpen(open) {
    $("fMenu").hidden = !open;
    $("fWho").setAttribute("aria-expanded", open ? "true" : "false");
  }
  $("fWho").addEventListener("click", function () { menuOpen($("fMenu").hidden); });
  document.addEventListener("click", function (e) { if (!$("foot").contains(e.target) && !$("fMenu").hidden) menuOpen(false); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !$("fMenu").hidden) { menuOpen(false); $("fWho").focus(); } });
  // 使用新账号登录 / 切换账号. Checked live (Rick, 2026-10-03, twice): after
  // POST /api/logout the platform's own sign-in cookie is still valid — a
  // function cannot clear it — and with that cookie /.auth/login/<provider>
  // never goes to Microsoft at all: it hands the same account straight back
  // (that, not browser single sign-on, is why 「切换账号」 came back as the
  // same account). The only thing that clears the platform cookie is
  // /.auth/logout, so a switch is /api/logout (Hive's session) → /.auth/logout
  // (platform cookie; no Microsoft page, because the "entra" provider's
  // discovery document — api/oidc-config — has no end_session_endpoint) →
  // /.auth/login/entra (prompt=select_account baked into its authorize
  // address) → Microsoft's account list with 「使用其他账户」 → the management
  // center as whichever account was chosen. Only one account can be signed in
  // at a time (one platform cookie). The intended account is remembered so
  // loadMe can say what came back.
  var SWITCH_LOGIN = "/.auth/login/aad?post_login_redirect_uri=" + encodeURIComponent("/management/?signedin=1");
  function platformLogout(then) { return "/.auth/logout?post_logout_redirect_uri=" + encodeURIComponent(then); }
  function switchAccount(to) {
    var from = (me && me.profile && me.profile.upn) || "";
    menuOpen(false);
    $("fWho").disabled = true; $("fOut").disabled = true;
    try { sessionStorage.setItem("fc-switch", JSON.stringify({ from: from, to: to || "", at: Date.now() })); localStorage.removeItem("fc-last-active"); } catch (e) {}
    window.__fcLeaving = true;
    return fetch("/api/logout", { method: "POST", credentials: "same-origin", cache: "no-store" }).catch(function () {}).then(function () {
      try { new BroadcastChannel("fc-auth").postMessage({ kind: "out", at: Date.now() }); } catch (e) {}
      try { localStorage.setItem("fc-auth-event", "out:" + Date.now()); } catch (e) {}
      location.replace(platformLogout(SWITCH_LOGIN));
    });
  }
  // Microsoft's own sign-out page for this account (logout_hint skips the "which
  // account" page); linked from the same-account banner, opened in a new tab.
  function microsoftLogoutUrl(upn) {
    return "https://login.microsoftonline.com/common/oauth2/v2.0/logout" + (upn ? "?logout_hint=" + encodeURIComponent(upn) : "");
  }
  $("fMenu").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-switch]");
    if (b) return switchAccount(b.getAttribute("data-switch"));
  });
  // After a switch: did we come back as a different account?
  function afterSwitch() {
    var sw = null;
    try { sw = JSON.parse(sessionStorage.getItem("fc-switch") || "null"); sessionStorage.removeItem("fc-switch"); } catch (e) { sw = null; }
    if (!sw || !me || !me.profile || Date.now() - Number(sw.at || 0) > 15 * 60 * 1000) return;
    var now = me.profile.upn || "", same = sw.from && now.toLowerCase() === String(sw.from).toLowerCase();
    var wrong = !same && sw.to && now.toLowerCase() !== String(sw.to).toLowerCase();
    if (same) {
      flash(t("仍是原账号 ", "Still the same account, ") + "<b>" + esc(now) + "</b>" +
        t("：在微软的账号列表里又选了它。要换账号，请在列表里选另一个账号或「使用其他账户」；也可以先 ", ": it was chosen again in Microsoft's account list. To switch, pick another account there or \"Use another account\", or first ") +
        '<a href="' + esc(microsoftLogoutUrl(now)) + '" target="_blank" rel="noopener">' + t("在微软退出该账号", "sign that account out at Microsoft") + "</a>" + t("。", "."));
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
  // A green confirmation banner (the amber one is for warnings).
  function flashOk(html, ms) { flash(html, ms || 3500); $("flash").classList.add("ok"); }
  var _flash = flash; flash = function (html, ms) { $("flash").classList.remove("ok"); return _flash(html, ms); };
  // A save in the side panel (Rick, 2026-10-04: 「点击保存后，应该有个保存的动作，然后窗口
  // 向右滑动关闭」): the button says 保存中… while the request runs, then 已保存 ✓ for a
  // moment, the panel slides out to the right, and the confirmation shows above the page.
  function savingButton(b, busy) { if (!b) return; b.disabled = true; b.setAttribute("data-label", b.textContent); b.textContent = busy || t("保存中…", "Saving…"); }
  function restoreButton(b) { if (!b) return; b.disabled = false; if (b.getAttribute("data-label")) b.textContent = b.getAttribute("data-label"); }
  function savedAndClose(b, html, which) {
    if (b) { b.textContent = t("已保存 ✓", "Saved ✓"); b.classList.add("saved"); }
    setTimeout(function () { if (which === "second") panel2Close(); else panelClose(); if (html) flashOk(html); }, 450);
  }
  // 退出: /api/logout, then the platform's sign-out and home (assets/session-guard.js,
  // loaded before this file); the next 登录 shows Microsoft's account list.
  $("fOut").addEventListener("click", function () {
    $("fOut").disabled = true;
    if (window.fcSession) window.fcSession.signOut("user");
    else { fetch("/api/logout", { method: "POST", credentials: "same-origin" }).catch(function () {}).then(function () { location.replace("/?signedout=user"); }); }
  });
  function closeDrawer() { $("side").classList.remove("open"); $("scrim").classList.remove("show"); }
  // The sidebar collapses and comes back any time (Rick, 2026-10-19: 「左边的操作栏要求随时可以缩进或打开」);
  // the choice is remembered per browser. On a phone the drawer stays as it is.
  function sideHidden() { try { return localStorage.getItem("fc-side") === "hide"; } catch (e) { return false; } }
  function setSideHidden(on) { document.body.classList.toggle("sidehide", on); try { localStorage.setItem("fc-side", on ? "hide" : "show"); } catch (e) {} }
  document.body.classList.toggle("sidehide", sideHidden());
  $("sideHide").addEventListener("click", function () { setSideHidden(true); });
  $("sideShow").addEventListener("click", function () { setSideHidden(false); });
  $("menuToggle").addEventListener("click", function () { $("side").classList.toggle("open"); $("scrim").classList.toggle("show"); });
  $("scrim").addEventListener("click", closeDrawer);
  $("nav").addEventListener("click", function (e) { if (e.target.closest("a")) closeDrawer(); });
  // Signed out in another tab → leave.
  try { new BroadcastChannel("fc-auth").onmessage = function (e) { if (e && e.data && e.data.kind === "out" && !window.__fcLeaving) location.replace("/"); }; } catch (e) {}
  window.addEventListener("storage", function (e) { if (e.key === "fc-auth-event" && /^out:/.test(e.newValue || "") && !window.__fcLeaving) location.replace("/"); });

  // desc: the page's description — a string or { info: "…" } — shown behind an ⓘ beside
  // the title, never as a line under it (Rick, 2026-10-08: 「Use little i to hint. Apply
  // with all headings」; earlier the same for the People Hub's long description).
  // The one way to explain something (Rick, 2026-10-17, for every page): a short summary of the goal and the
  // cautions in a small ⓘ that shows on hover or focus, never a paragraph that takes page space.
  function tipI(text, cls) { return text ? '<span class="info' + (cls ? " " + cls : "") + '" tabindex="0" data-tip="' + esc(text) + '">i</span>' : ""; }
  // Explanations never take page space (Rick, 2026-10-17: applies to every page, present and future). Pages
  // may still write a hint as <p class="hint">, a <small> under a field, or a small grey <p class="muted">;
  // after every render this turns each into a short ⓘ placed on the heading, the field label or the bold
  // line it explains. Warnings that must stay in view (.note, .bad, .msg) and anything with a link or a button
  // inside are left alone, as is anything marked data-keep.
  var TIP_SEL = 'label small, .devrow .m small, p.hint, p.muted[style*="font-size:12px"], .calallhint';
  function tipAnchor(el) {
    var lab = el.closest("label");
    if (lab && lab.contains(el)) {
      var c = lab.querySelector("input:not([type=checkbox]):not([type=radio]), select, textarea");
      if (c && c.parentNode === lab) return { before: c, host: lab };
      return { host: lab };
    }
    var h = el.parentNode, prev = el.previousElementSibling;
    if (el.tagName === "SMALL") { var b = el.parentNode.querySelector("b, strong"); return b ? { host: b } : null; }
    while (prev && !/^(H2|H3|H4|B|STRONG)$/.test(prev.tagName) && !(prev.matches && prev.matches(".ph h3, .ph h2"))) prev = prev.previousElementSibling;
    if (prev) return { host: prev };
    var top = el.closest(".card, .panel, .modal, .box") || h, hd = top && top.querySelector("h2, h3, h4");
    return hd ? { host: hd } : null;
  }
  function tipify(root) {
    var els = (root || document).querySelectorAll(TIP_SEL), i;
    for (i = 0; i < els.length; i++) {
      var el = els[i];
      if (el.id || el.hasAttribute("data-keep") || el.classList.contains("bad") || (el.tagName === "SMALL" && el.className) || el.querySelector("a, button, input")) continue;
      var txt = (el.textContent || "").trim(); if (!txt) continue;
      var a = tipAnchor(el); if (!a) continue;
      var tip = document.createElement("span"); tip.className = "info"; tip.tabIndex = 0; tip.setAttribute("data-tip", txt); tip.textContent = "i";
      if (a.before) a.host.insertBefore(tip, a.before); else a.host.appendChild(tip);
      el.parentNode.removeChild(el);
    }
  }
  var tipQueued = false;
  function tipSoon() { if (tipQueued) return; tipQueued = true; (window.requestAnimationFrame || setTimeout)(function () { tipQueued = false; tipify(document.body); }); }
  if (window.MutationObserver) new MutationObserver(tipSoon).observe(document.body, { childList: true, subtree: true });
  // keep a tooltip inside the window: flip to the left near the right edge, below near the top
  function tipPlace(e) {
    var n = e.target && e.target.closest && e.target.closest(".info[data-tip]"); if (!n) return;
    var r = n.getBoundingClientRect();
    n.classList.toggle("flip", r.left > window.innerWidth - 300);
    n.classList.toggle("down", r.top < 150);
  }
  document.addEventListener("mouseover", tipPlace); document.addEventListener("focusin", tipPlace);
  function setTitle(crumb, title, actionsHtml, desc) {
    var info = desc && typeof desc === "object" ? desc.info : (desc || "");
    // Crumb and title now share a line; a crumb that already ends with the title ("经营 › 人员库" + 人员库) loses that tail.
    if (crumb && title) { var tail = " › " + title; if (crumb === title) crumb = ""; else if (crumb.slice(-tail.length) === tail) crumb = crumb.slice(0, -tail.length); }
    $("title").innerHTML = (crumb ? '<span class="crumb">' + esc(crumb) + "</span>" : "") + (title ? '<span class="ttl">' + esc(title) + (info ? ' <span class="info big" tabindex="0" data-tip="' + esc(info) + '">i</span>' : "") + "</span>" : "") + "";
    var tb = document.querySelector(".topbar"), acts = $("topActions");
    // #topActions may sit inside the previous page's first row (placeActions) and go with it when the page replaces
    // #content before calling setTitle: bring it home, or make it anew, before filling it.
    if (!acts) { acts = document.createElement("div"); acts.id = "topActions"; tb.appendChild(acts); } else if (acts.parentNode !== tb) tb.appendChild(acts);
    acts.innerHTML = actionsHtml || "";
    tb.classList.toggle("bare", !title && !crumb && !actionsHtml);
    // UI principle (Rick, 2026-10-17): the page head never takes a row of its own. On a computer the sidebar
    // already says where you are, so the title row is gone: no actions = no row; actions = one slim row of
    // buttons. The ⓘ with the page's explanation moves onto the active sidebar item. A phone keeps the title.
    tb.classList.toggle("noact", !actionsHtml);
    pageInfo = info || "";
    navInfo();
    tb.classList.remove("moved");
    setTimeout(placeActions, 0); // after the page has filled #content, whichever order it does that in
  }
  // Where the page's buttons go on a computer (Rick, 2026-10-19: 「Don't put the title on head, as everyone knows it
  // already. 请把 Curriculum Map 和 Graduation 上移一行」): into the page's own first row when that is a tabs row or a
  // toolbar (tabs / filters on the left, buttons on the right — GitHub, Airtable); otherwise a left-aligned command bar
  // of its own (Microsoft admin centres), never a row with a title or an empty left half. #topActions is one node that
  // moves, so ids and listeners on the buttons keep working. A phone keeps the title row.
  function placeActions() {
    var acts = $("topActions"), bar = document.querySelector(".topbar"), content = $("content"); if (!acts || !bar || !content) return;
    var first = content.firstElementChild, host = null;
    if (window.innerWidth > 900 && acts.childNodes.length && first && (first.classList.contains("pagetabs") || first.classList.contains("toolbar")) && !first.hidden) host = first;
    if (host) { if (acts.parentNode !== host) host.appendChild(acts); }
    else if (acts.parentNode !== bar) bar.appendChild(acts);
    bar.classList.toggle("moved", !!host);
  }
  if ($("content")) new MutationObserver(function () { placeActions(); }).observe($("content"), { childList: true });
  window.addEventListener("resize", placeActions);
  // A page may know its explanation only after loading (the plan page says who published the school's edition).
  function setPageInfo(info) {
    pageInfo = info || "";
    var ttl = document.querySelector("#title .ttl"), big = ttl && ttl.querySelector(".info.big");
    if (big && !pageInfo) big.parentNode.removeChild(big);
    else if (big) big.setAttribute("data-tip", pageInfo);
    else if (ttl && pageInfo) { var s = document.createElement("span"); s.className = "info big"; s.tabIndex = 0; s.setAttribute("data-tip", pageInfo); s.textContent = "i"; ttl.appendChild(document.createTextNode(" ")); ttl.appendChild(s); }
    navInfo();
    if (title) document.title = title + " · " + t("蜂巢管理中心", "Hive Management Center");
  }
  var pageInfo = "";
  function navInfo() {
    var old = document.querySelectorAll("#nav .navinfo"); for (var i = 0; i < old.length; i++) old[i].parentNode.removeChild(old[i]);
    var a = document.querySelector("#nav .nav-item.active");
    if (a && pageInfo) { var s = document.createElement("span"); s.className = "info navinfo"; s.tabIndex = 0; s.setAttribute("data-tip", pageInfo); s.textContent = "i"; a.appendChild(s); }
  }
  // The sidebar item's ⓘ opens to the RIGHT of the sidebar, as a floating box (Rick, 2026-10-19: the CSS tooltip was
  // clipped by the sidebar's own scroll box and cut off on the left).
  function navTipShow(n) {
    var r = n.getBoundingClientRect(), box = $("navtip") || document.body.appendChild(Object.assign(document.createElement("div"), { id: "navtip", className: "navtip" }));
    box.textContent = n.getAttribute("data-tip"); box.hidden = false;
    var side = $("side") ? $("side").getBoundingClientRect().right : r.right;
    box.style.left = Math.round(Math.max(r.right, side) + 10) + "px"; box.style.top = Math.round(Math.max(8, r.top - 8)) + "px";
  }
  function navTipHide() { var box = $("navtip"); if (box) box.hidden = true; }
  // City ⇄ postcode (Rick, 2026-10-20: 「输入中国城市能否自动填入邮编？反过来也一样」). Mainland prefecture-level cities
  // and the postcode of each city centre; typing one side fills the other when it is empty. Inputs are paired by
  // data-geo="city" / data-geo="zip" inside the same .grid2 / form / panel body.
  var CN_CITIES = [["北京", "100000"], ["上海", "200000"], ["天津", "300000"], ["重庆", "400000"], ["石家庄", "050000"], ["唐山", "063000"], ["秦皇岛", "066000"], ["邯郸", "056000"], ["保定", "071000"], ["张家口", "075000"], ["廊坊", "065000"], ["沧州", "061000"], ["太原", "030000"], ["大同", "037000"], ["呼和浩特", "010000"], ["包头", "014000"], ["沈阳", "110000"], ["大连", "116000"], ["鞍山", "114000"], ["长春", "130000"], ["吉林", "132000"], ["哈尔滨", "150000"], ["大庆", "163000"], ["南京", "210000"], ["无锡", "214000"], ["徐州", "221000"], ["常州", "213000"], ["苏州", "215000"], ["南通", "226000"], ["扬州", "225000"], ["镇江", "212000"], ["泰州", "225300"], ["盐城", "224000"], ["杭州", "310000"], ["宁波", "315000"], ["温州", "325000"], ["嘉兴", "314000"], ["湖州", "313000"], ["绍兴", "312000"], ["金华", "321000"], ["台州", "318000"], ["合肥", "230000"], ["芜湖", "241000"], ["福州", "350000"], ["厦门", "361000"], ["泉州", "362000"], ["漳州", "363000"], ["南昌", "330000"], ["九江", "332000"], ["济南", "250000"], ["青岛", "266000"], ["淄博", "255000"], ["烟台", "264000"], ["潍坊", "261000"], ["济宁", "272000"], ["威海", "264200"], ["临沂", "276000"], ["郑州", "450000"], ["开封", "475000"], ["洛阳", "471000"], ["新乡", "453000"], ["武汉", "430000"], ["宜昌", "443000"], ["襄阳", "441000"], ["长沙", "410000"], ["株洲", "412000"], ["湘潭", "411100"], ["衡阳", "421000"], ["岳阳", "414000"], ["常德", "415000"], ["广州", "510000"], ["深圳", "518000"], ["珠海", "519000"], ["汕头", "515000"], ["佛山", "528000"], ["韶关", "512000"], ["湛江", "524000"], ["惠州", "516000"], ["东莞", "523000"], ["中山", "528400"], ["江门", "529000"], ["南宁", "530000"], ["桂林", "541000"], ["柳州", "545000"], ["海口", "570000"], ["三亚", "572000"], ["成都", "610000"], ["绵阳", "621000"], ["贵阳", "550000"], ["昆明", "650000"], ["大理", "671000"], ["拉萨", "850000"], ["西安", "710000"], ["咸阳", "712000"], ["宝鸡", "721000"], ["兰州", "730000"], ["西宁", "810000"], ["银川", "750000"], ["乌鲁木齐", "830000"], ["香港", "999077"], ["澳门", "999078"]];
  function geoCityOf(zip) { var z = String(zip || "").replace(/\D/g, ""); if (z.length < 3) return ""; var hit = CN_CITIES.filter(function (c) { return c[1].slice(0, 3) === z.slice(0, 3); }); return hit.length === 1 ? hit[0][0] : (hit.filter(function (c) { return c[1] === z; })[0] || [""])[0]; }
  function geoZipOf(city) { var c = String(city || "").trim().replace(/市$/, ""); if (!c) return ""; var hit = CN_CITIES.filter(function (x) { return x[0] === c; })[0] || CN_CITIES.filter(function (x) { return c.length > 1 && c.indexOf(x[0]) >= 0; })[0]; return hit ? hit[1] : ""; }
  if (document.body && !$("cnCities")) { var dl = document.createElement("datalist"); dl.id = "cnCities"; dl.innerHTML = CN_CITIES.map(function (c) { return '<option value="' + c[0] + '"></option>'; }).join(""); document.body.appendChild(dl); }
  function geoPair(el, kind) { var box = el.closest(".grid2, form, .pb, .cosec, #content"); return box ? box.querySelector('[data-geo="' + kind + '"]') : null; }
  document.addEventListener("change", function (e) {
    var el = e.target; if (!el || !el.getAttribute || !el.getAttribute("data-geo")) return;
    var kind = el.getAttribute("data-geo"), other = geoPair(el, kind === "city" ? "zip" : "city"); if (!other || other.value.trim()) return;
    var v = kind === "city" ? geoZipOf(el.value) : geoCityOf(el.value); if (!v) return;
    other.value = v; other.dispatchEvent(new Event("input", { bubbles: true })); other.dispatchEvent(new Event("change", { bubbles: true }));
  });
  document.addEventListener("mouseover", function (e) { var n = e.target.closest && e.target.closest(".navinfo[data-tip]"); if (n) navTipShow(n); });
  document.addEventListener("mouseout", function (e) { if (e.target.closest && e.target.closest(".navinfo[data-tip]")) navTipHide(); });
  document.addEventListener("focusin", function (e) { var n = e.target.closest && e.target.closest(".navinfo[data-tip]"); if (n) navTipShow(n); });
  document.addEventListener("focusout", function (e) { if (e.target.closest && e.target.closest(".navinfo[data-tip]")) navTipHide(); });
  // ---- paging of long tables (Rick, 2026-10-21: every table over 100 rows shows one page; the pager sits in the
  // sticky tile strip or toolbar, so 上一页 / 下一页 stay in view while the page scrolls) ----
  // pageOf(key, rows, rerender) → { rows (this page), offset, matched, per }; pagerTile(key, pg) → the tile (empty under
  // one page). The 所有学校 users table and the people hub page on the server and draw their own tile.
  var PAGE_SIZE = 100, pageState = {}, pageRender = {};
  function pageOf(key, rows, rerender) {
    pageRender[key] = rerender;
    var off = Math.min(pageState[key] || 0, Math.max(0, rows.length - 1)); off -= off % PAGE_SIZE; pageState[key] = off;
    return { rows: rows.slice(off, off + PAGE_SIZE), offset: off, matched: rows.length, per: PAGE_SIZE };
  }
  function pageReset(key) { pageState[key] = 0; }
  // compact: the window "1–100 / 1,686" and two arrow buttons, so the tile fits the English strip on a laptop (Rick, 2026-10-21)
  function pagerButtons(offset, per, to, matched) { return '<span class="upager"><button type="button" class="btn secondary sm" data-offset="' + Math.max(0, offset - per) + '"' + (offset <= 0 ? " disabled" : "") + ' title="' + t("上一页", "Previous page") + '" aria-label="' + t("上一页", "Previous page") + '">‹</button><button type="button" class="btn secondary sm" data-offset="' + (offset + per) + '"' + (to >= matched ? " disabled" : "") + ' title="' + t("下一页", "Next page") + '" aria-label="' + t("下一页", "Next page") + '">›</button></span>'; }
  function pagerLabel(offset, to, matched) { return '<span class="pg">' + esc(t("第 " + (matched ? offset + 1 : 0) + "–" + to + " / " + Math.round(matched).toLocaleString("zh-CN"), (matched ? offset + 1 : 0) + "–" + to + " of " + Math.round(matched).toLocaleString("en-US"))) + "</span>"; }
  function pagerTile(key, pg) { if (pg.matched <= pg.per) return ""; var to = Math.min(pg.offset + pg.per, pg.matched); return '<div class="kpi pager" data-pager="' + esc(key) + '">' + pagerLabel(pg.offset, to, pg.matched) + pagerButtons(pg.offset, pg.per, to, pg.matched) + "</div>"; }
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-pager] button[data-offset]"); if (!b) return;
    var key = b.closest("[data-pager]").getAttribute("data-pager"); if (!pageRender[key]) return;
    e.stopPropagation(); pageState[key] = Number(b.getAttribute("data-offset")); pageRender[key]();
  }, true);
  function panelOpen(html, which, opts) {
    var p = $(which === "second" ? "panel2" : "panel"); p.innerHTML = html; p.classList.add("open"); p.setAttribute("aria-hidden", "false");
    p.classList.toggle("wide", !!(opts && opts.wide)); // a wider panel for two-column forms (教师资料: 中文 | English)
    // The second panel (a person opened from a group) gets a ← back to the group
    // (Rick, 2026-10-05: 「进入右边的 teams 群组，点击用户，应该可以回去」).
    if (which === "second") { var ph = p.querySelector(".ph"); if (ph && !ph.querySelector(".back")) { var b = document.createElement("button"); b.type = "button"; b.className = "back"; b.setAttribute("aria-label", t("返回群组", "Back to the group")); b.title = t("返回群组", "Back to the group"); b.innerHTML = "←"; ph.insertBefore(b, ph.firstChild); } }
  }
  function panel2Close() { var p = $("panel2"); p.classList.remove("open"); p.setAttribute("aria-hidden", "true"); }
  function panelClose() { var p = $("panel"); p.classList.remove("open"); p.setAttribute("aria-hidden", "true"); panel2Close(); document.querySelectorAll("table.data tr.sel").forEach(function (tr) { tr.classList.remove("sel"); }); }
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") { if ($("panel2").classList.contains("open")) panel2Close(); else { panelClose(); closeDrawer(); } } });
  // A click anywhere outside the open panel closes it, and does nothing else (Rick,
  // 2026-10-08: 「no need to click x on top right corner. Apply this with all UIs」;
  // then: that click must not also open the next row — 「我没让你这样做」). Capture
  // phase, so the click is swallowed before any row or button handler sees it; the
  // next click acts normally. The second panel goes first, as with Escape. The flash
  // bar and chart tooltips are not "outside"; a sidebar link closes and still navigates.
  document.addEventListener("click", function (e) {
    var p = $("panel"), p2 = $("panel2");
    if (!p.classList.contains("open") && !p2.classList.contains("open")) return;
    if (!(e.target instanceof Element) || e.target.closest("#panel, #panel2, #flash, .viztip, .vfull")) return;
    if (p2.classList.contains("open")) panel2Close(); else panelClose();
    if (e.target.closest("#nav a")) return;
    e.stopPropagation(); e.preventDefault();
  }, true);
  // A member clicked in a group's panel opens beside it, in the second panel, so the
  // group stays in view (Rick, 2026-10-03: 「点击用户，应该在左侧显示用户详细信息」).
  function memberClick(m) {
    var upn = m.getAttribute("data-upn"), dom = m.getAttribute("data-domain") || upn.split("@")[1] || "";
    openUserPanel(upn, dom, { beside: true, name: m.getAttribute("data-name") || "", owner: m.getAttribute("data-owner") === "1" });
  }
  $("panel").addEventListener("click", function (e) {
    if (e.target.closest(".x")) { panelClose(); return; }
    var eo = e.target.closest("button[data-eorder]"); if (eo) { openEquipOrderPanel(eo.getAttribute("data-eorder"), "second"); return; }
    var pp = e.target.closest("button[data-person]"); if (pp) { openPersonPanel(pp.getAttribute("data-person")); return; }
    var g = e.target.closest("button[data-group]"); if (g) { openGroupPanel(g.getAttribute("data-group")); return; }
    var m = e.target.closest("button.mrow[data-upn]"); if (m) memberClick(m);
  });
  $("panel2").addEventListener("click", function (e) {
    if (e.target.closest(".x") || e.target.closest(".back")) { panel2Close(); return; }
    var g = e.target.closest("button[data-group]"); if (g) { openGroupPanel(g.getAttribute("data-group")); return; }
    var m = e.target.closest("button.mrow[data-upn]"); if (m) memberClick(m);
  });

