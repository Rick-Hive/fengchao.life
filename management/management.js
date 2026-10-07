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
    chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19V5"/><path d="M4 19h16"/><path d="M8 15l4-5 3 3 5-6"/></svg>',
    camera: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
    cart: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4h2l2.4 11.2a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.5-1.1L21 8H6.2"/><circle cx="9.5" cy="20" r="1.3"/><circle cx="17" cy="20" r="1.3"/></svg>',
    book: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5V5.5M8 7h8M8 10.5h8"/></svg>',
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
  var state = { teams: null, teamFilter: "all", teamSort: "az", teamQ: "", domainUsers: {}, domainGroups: {}, userQ: "", userFilter: "all", userRole: "", allDomains: false };

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
        { hash: "#/domain/handbook", icon: "book", zh: "操作手册", en: "Handbook" },
      ] });
    }
    if (canSeeOrders() || isStaff()) {
      groups.push({ title: t("经营", "Operations"), items: [
        { hash: "#/dashboard", icon: "chart", zh: "仪表盘", en: "Dashboard" },
        { hash: "#/ops/orders", icon: "cart", zh: "订单", en: "Orders" },
        { hash: "#/ops/people", icon: "users", zh: "人员库", en: "People Hub" },
      ].concat(crmLevel("partners") !== "none" ? [{ hash: "#/ops/institutions", icon: "tree", zh: "机构", en: "Institutions" }] : []).concat(crmLevel("drm") !== "none" ? [{ hash: "#/ops/licenses", icon: "key", zh: "许可", en: "Licences" }] : []).concat(canSeeRoyalty() ? [{ hash: "#/ops/royalty", icon: "chart", zh: "版税结算", en: "Royalties" }] : []) });
    }
    if (isAdmin()) {
      groups.push({ title: t("系统", "System"), items: [
        { hash: "#/system/roles", icon: "key", zh: "角色分配", en: "Roles" },
        { hash: "#/system/institutions", icon: "tree", zh: "机构名称", en: "Institutions" },
        { hash: "#/system/sync", icon: "sync", zh: "数据同步", en: "Data sync" },
      ] });
    } else if (canAssignRoles()) {
      groups.push({ title: t("系统", "System"), items: [{ hash: "#/system/roles", icon: "key", zh: "角色分配", en: "Roles" }] });
    }
    var cur = location.hash || (isStaff() ? "#/dashboard" : "#/account");
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
  $("menuToggle").addEventListener("click", function () { $("side").classList.toggle("open"); $("scrim").classList.toggle("show"); });
  $("scrim").addEventListener("click", closeDrawer);
  $("nav").addEventListener("click", function (e) { if (e.target.closest("a")) closeDrawer(); });
  // Signed out in another tab → leave.
  try { new BroadcastChannel("fc-auth").onmessage = function (e) { if (e && e.data && e.data.kind === "out" && !window.__fcLeaving) location.replace("/"); }; } catch (e) {}
  window.addEventListener("storage", function (e) { if (e.key === "fc-auth-event" && /^out:/.test(e.newValue || "") && !window.__fcLeaving) location.replace("/"); });

  // desc: a one-line description under the title; { info: "…" } instead puts a longer
  // explanation behind an ⓘ beside the title (Rick, 2026-10-08: 「only displays when
  // mouse is on it. Use 小i 方案」).
  function setTitle(crumb, title, actionsHtml, desc) {
    var info = desc && typeof desc === "object" ? desc.info : "";
    $("title").innerHTML = (crumb ? '<span class="crumb">' + esc(crumb) + "</span>" : "") + (title ? '<span class="ttl">' + esc(title) + (info ? ' <span class="info big" tabindex="0" data-tip="' + esc(info) + '">i</span>' : "") + "</span>" : "") + (desc && !info ? '<span class="desc">' + esc(desc) + "</span>" : "");
    $("topActions").innerHTML = actionsHtml || "";
    document.querySelector(".topbar").classList.toggle("bare", !title && !crumb && !actionsHtml);
  }
  function panelOpen(html, which) {
    var p = $(which === "second" ? "panel2" : "panel"); p.innerHTML = html; p.classList.add("open"); p.setAttribute("aria-hidden", "false");
    // The second panel (a person opened from a group) gets a ← back to the group
    // (Rick, 2026-10-05: 「进入右边的 teams 群组，点击用户，应该可以回去」).
    if (which === "second") { var ph = p.querySelector(".ph"); if (ph && !ph.querySelector(".back")) { var b = document.createElement("button"); b.type = "button"; b.className = "back"; b.setAttribute("aria-label", t("返回群组", "Back to the group")); b.title = t("返回群组", "Back to the group"); b.innerHTML = "←"; ph.insertBefore(b, ph.firstChild); } }
  }
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

  // ================================================================================
  // 我的账号 › 概览
  // ================================================================================
  var KIND = { authenticator: ["验证器", "Authenticator"], fido2: ["安全密钥", "Security key"], phone: ["手机", "Phone"], email: ["邮箱", "Email"], softwareOath: ["验证码应用", "Code app"], tap: ["临时通行码", "Temporary Access Pass"], windowsHello: ["Windows Hello", "Windows Hello"] };
  // ---- 补充资料: city, needs, children and their Teams accounts (Rick, 2026-10-02) ----
  var VOCAB_EN = {
    "家长": "Parent", "学生": "Student", "老师": "Teacher", "行政": "Staff", "教育顾问": "Education consultant", "学校行政": "School staff", "机构负责人": "Head of institution", "其它": "Other",
    "教材": "Curriculum materials", "课程": "Courses", "教师培训": "Teacher training", "家长-亲子培训": "Parent & parent–child training", "海外留学": "Study abroad", "大学路径": "University pathways", "双学分/AP课程": "Dual-credit / AP courses", "标化考试": "Standardised tests",
    "学前": "Pre-K",
    "公立学校": "Public school", "私立学校": "Private school", "国际学校": "International school", "基督教学校": "Christian school", "在家教育": "Homeschool",
    "古典教育": "Classical", "BJU": "BJU", "Abeka": "Abeka", "混合教学法": "Mixed approaches", "不清楚": "Not sure",
    "欧美大学": "University in Europe / North America", "东南亚大学": "University in Southeast Asia", "英国/澳洲大学": "University in the UK / Australia", "国内大学": "University in China", "2+2混合制大学": "2+2 programme", "未定": "Undecided",
  };
  function vl(v) { return EN ? (VOCAB_EN[v] || v) : v; }
  // A Teams group's name in the page language (groupnames.json, set in the management centre;
  // the tenant's own name is the fallback and is never changed — Rick, 2026-10-06).
  function gname(g) {
    if (!g) return "";
    var name = g.name || "", zh = g.nameZh || "", en = g.nameEn || "";
    // "Hive/蜂巢": a name already carrying both scripts around a slash is its own pair.
    var m = /^(.+?)\s*[\/／]\s*(.+)$/.exec(name);
    if (m && (!zh || !en)) { var a = /[\u3400-\u9fff]/.test(m[1]), b = /[\u3400-\u9fff]/.test(m[2]); if (a !== b) { zh = zh || (a ? m[1] : m[2]).trim(); en = en || (a ? m[2] : m[1]).trim(); } }
    if (!zh || !en || zh === en) return (EN ? (en || zh) : (zh || en)) || name;
    // Both known: the tenant's own name first, its translation after it (Rick, 2026-10-07).
    var orig = m ? (EN ? "en" : "zh") : /[\u3400-\u9fff]/.test(name) ? "zh" : "en";
    return orig === "zh" ? zh + " · " + en : en + " · " + zh;
  }
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
      '<div class="idhead"><button type="button" class="avatar lg photo-btn" id="phBtn" data-photo="me" title="' + t("更换头像", "Change photo") + '" aria-label="' + t("更换头像", "Change photo") + '">' + esc(initials(p.displayName || p.upn)) + '<span class="cam">' + ICON.camera + '</span></button><input type="file" id="phFile" accept="image/jpeg,image/png" hidden /><div class="idmain"><div class="idname">' + esc(p.displayName || p.upn) + "</div>" +
        '<div class="idmeta"><span>' + esc(p.upn) + "</span>" + (hv.identity ? '<span class="tag accent">' + esc(vl(hv.identity)) + "</span>" : "") + '<span class="tag">' + esc(roleNames(me.roles)) + "</span>" +
        (p.created ? '<span class="muted">' + t("账号创建于 ", "Account since ") + esc(day(p.created)) + "</span>" : "") + "</div></div>" +
        '<div class="idside">' + (strong ? '<span class="status ok">' + t("已启用验证器", "Authenticator on") + "</span>" : '<span class="status bad">' + t("未登记验证器", "No authenticator") + "</span>") + "</div></div>" +
      '<div id="phEdit" class="card ph-edit" hidden></div>' +

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
          '<label class="f">' + t("邮编", "Postcode") + '<input type="text" data-p="postalCode" maxlength="12" value="' + esc(p.postalCode) + '" /></label>' +
        '</div><footer class="cf"><button class="btn" type="submit" id="pSave">' + t("保存", "Save") + '</button><span id="pMsg"></span></footer></form></section>' +

      '<section class="card" id="extraCard"></section>';

    renderExtra();
    paintPhotos(); loadPhoto();
    // 更换头像 (Rick, 2026-10-04): pick a JPEG/PNG → crop to a centred square and scale
    // to 648×648 (Microsoft's largest size) as JPEG in the browser → preview → save
    // (PUT /api/me/photo) → every avatar on the page updates. Teams and Outlook read the
    // same photo; Outlook on the web shows it within minutes, Teams may cache the old
    // one for up to a day.
    $("phBtn").addEventListener("click", function () { $("phFile").click(); });
    $("phFile").addEventListener("change", function () {
      var f = $("phFile").files && $("phFile").files[0]; if (!f) return;
      $("phFile").value = "";
      if (!/^image\/(jpeg|png)$/.test(f.type)) { showPhotoEditor(null, t("请选择 JPEG 或 PNG 图片。", "Please choose a JPEG or PNG image.")); return; }
      if (f.size > 12 * 1024 * 1024) { showPhotoEditor(null, t("图片太大（超过 12 MB），请先缩小。", "The image is too large (over 12 MB); please shrink it first.")); return; }
      var url = URL.createObjectURL(f), img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        var side = Math.min(img.naturalWidth, img.naturalHeight);
        if (side < 48) { showPhotoEditor(null, t("图片太小，至少 48×48 像素。", "The image is too small; at least 48×48 pixels.")); return; }
        var out = 648, c = document.createElement("canvas"); c.width = out; c.height = out;
        var ctx = c.getContext("2d"); ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, out, out);
        var data = c.toDataURL("image/jpeg", 0.9);
        showPhotoEditor(data, "", { from: img.naturalWidth + "×" + img.naturalHeight, kb: Math.round((data.length - 23) * 3 / 4 / 1024) });
      };
      img.onerror = function () { URL.revokeObjectURL(url); showPhotoEditor(null, t("这个文件无法作为图片打开。", "This file cannot be opened as an image.")); };
      img.src = url;
    });
    function showPhotoEditor(data, err, info) {
      var box = $("phEdit"); box.hidden = false;
      if (err) { box.innerHTML = '<div class="msg err">' + esc(err) + '</div><div class="actions"><button class="btn secondary sm" type="button" id="phCancel">' + t("关闭", "Close") + "</button></div>"; $("phCancel").addEventListener("click", function () { box.hidden = true; }); return; }
      box.innerHTML = '<div class="ph-row"><img class="ph-prev" src="' + data + '" alt="" /><div class="ph-txt"><b>' + t("新头像预览", "New photo preview") + "</b><small>" +
          t("已居中裁成正方形并缩放到 648×648（微软的最大尺寸，约 " + info.kb + " KB；原图 " + info.from + "）。保存后 Outlook 几分钟内更新，Teams 可能要几小时到一天。", "Cropped to a centred square and scaled to 648×648 (Microsoft's largest size, about " + info.kb + " KB; original " + info.from + "). Outlook updates within minutes; Teams may take up to a day.") +
        '</small><div class="actions"><button class="btn sm" type="button" id="phSave">' + t("保存头像", "Save photo") + '</button><button class="btn secondary sm" type="button" id="phRe">' + t("换一张", "Choose another") + '</button><button class="btn secondary sm" type="button" id="phCancel">' + t("取消", "Cancel") + '</button></div><div id="phMsg"></div></div></div>';
      $("phCancel").addEventListener("click", function () { box.hidden = true; });
      $("phRe").addEventListener("click", function () { $("phFile").click(); });
      $("phSave").addEventListener("click", function () {
        var b = $("phSave"); b.disabled = true; b.textContent = t("保存中…", "Saving…");
        post("me/photo", "PUT", { image: data }).then(function (r) {
          if (!r.ok) { b.disabled = false; b.textContent = t("保存头像", "Save photo"); $("phMsg").innerHTML = '<div class="msg err">' + esc(errText(r)) + "</div>"; return; }
          loadPhoto(true).then(function () { box.hidden = true; flash(t("头像已更新。Teams 可能要几小时才会显示新头像。", "Photo updated. Teams may take a few hours to show it."), 6000); });
        });
      });
    }
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

  // The staff functions (api/shared/roles.js STAFF): the six CRM functions of the design
  // doc (Rick 2026-10-06) plus contractor and the system administrator. `fundraising` is
  // the old name of `partnership`: still shown on an account that holds it, never offered.
  var STAFF_FN = { ceo: ["CEO", "CEO"], curriculum: ["课程总监", "Curriculum director"], community: ["教育社区经理", "Education community manager"], finance: ["财务总监", "Finance director"], sales: ["订单经理", "Order manager"], partnership: ["合作发展总监", "Partnership director"], consultant: ["教育顾问", "Education consultant"], contractor: ["Contractor", "Contractor"], sysadmin: ["系统管理员", "System administrator"], fundraising: ["募款（旧名）", "Fundraising (old name)"] };
  var STAFF_LEGACY = { fundraising: 1 };
  function hasFn(fn) { var r = (me && me.roles) || []; return r.indexOf("staff:" + fn) >= 0; }
  // 角色分配 is the system administrator's page; the CEO may use it for the staff functions (decision 4).
  function canAssignRoles() { return isAdmin() || hasFn("ceo"); }
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
    var admins = (me.hive && me.hive.admins) || [];
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
      "</section>" +
      // 需要帮助？ the school's administrators (Rick, 2026-10-05): who to contact for a lost
      // phone, a forgotten password or a locked account — the 域管理员（IT）first, then the
      // 域蜂巢管理员. Without any, point at Hive's system administrator.
      '<section class="card" id="helpCard"><header class="ch"><h2>' + t("需要帮助？", "Need help?") + '</h2><p>' +
        t("手机丢了、忘记密码、登不进去——请联系你学校的管理员，他们可以在这里为你删除旧设备、重置密码。", "Lost phone, forgotten password, cannot sign in — contact your school's administrator; they can remove the old device or reset your password here.") + "</p></header>" +
        (admins.length ? '<div class="admins">' + admins.map(function (a) {
          return '<a class="adminrow" href="mailto:' + esc(a.upn) + '"><span class="avatar" style="background:' + hue(a.upn) + ';color:#fff">' + esc(initials(a.displayName || a.upn)) + '</span><div class="m"><b>' + esc(a.displayName || a.upn.split("@")[0]) + "</b><small>" + esc(a.upn) + "</small></div>" +
            '<span class="tags">' + (a.it ? '<span class="tag role-it">' + t("域管理员（IT）", "Domain administrator (IT)") + "</span>" : "") + (a.hive ? '<span class="tag role-hive">' + t("域蜂巢管理员", "Domain Hive administrator") + "</span>" : "") + "</span></a>";
        }).join("") + "</div>"
        : '<div class="empty">' + t("本校还没有指定管理员。请通过学校联系蜂巢的系统管理员。", "Your school has no administrator yet. Please reach Hive's system administrator through your school.") + "</div>") +
      "</section>";
    // Menus. The handler sits on this render's card (not on the permanent
    // #content, where every visit stacked another copy and the ⋯ toggle cancelled
    // itself out — Rick, 2026-10-03: 「验证器设备 1 后的三个点不可以点开」).
    $("content").firstElementChild.addEventListener("click", function (ev) {
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
    if (!viewSecurity.closer) {
      viewSecurity.closer = function (ev) { if (!ev.target.closest(".menu-wrap")) document.querySelectorAll(".menu.open").forEach(function (m) { m.classList.remove("open"); }); };
      document.addEventListener("click", viewSecurity.closer);
    }
  }

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
  function loadAllUsers() {
    var saved = currentDomain;
    return Promise.all(allDomainList().map(function (dom) { currentDomain = dom; return loadDomainData("users").catch(function () { return null; }); })).then(function () { currentDomain = saved; return mergedUsers(); });
  }
  function mergedUsers() {
    var users = [], sync = null, partial = false;
    allDomainList().forEach(function (dom) { var d = state.domainUsers[dom]; if (!d) return; d.users.forEach(function (u) { if (!u.domain) u.domain = dom; users.push(u); }); if (d.sync && (!sync || String(d.sync.at || "") > String(sync.at || ""))) sync = d.sync; if (d.partial) partial = true; });
    return { users: users, sync: sync, partial: partial, all: true };
  }
  function usersTable() { return state.allDomains ? mergedUsers() : state.domainUsers[currentDomain]; }
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
    var canAll = allDomainList().length > 1;
    if (!canAll) state.allDomains = false;
    var all = state.allDomains;
    setTitle(domainsInfo.all ? t("机构管理", "Institutions") : t("本域管理", "My domain"), t("用户", "Users"),
      (all ? "" : (canDo("methods") ? '<button class="btn sm" id="newUser">' + t("＋ 新建账号", "+ New account") + "</button> " : "") + syncButtons("us")) + ' <button class="btn secondary sm" id="csv">' + t("导出 CSV", "Export CSV") + "</button>");
    // Role filter (Rick, 2026-10-08): identity (家长/学生/老师/行政/教育顾问), Hive roles
    // (domain IT, domain Hive, staff, system administrator) and 蜂巢课程教师 — within the
    // school, or across all schools with 所有学校 in the picker.
    var ROLE_OPTS = [["", t("全部角色", "All roles")]].concat(IDENTITIES.map(function (i) { return ["id:" + i, vl(i)]; })).concat([
      ["role:teacher", t("蜂巢课程教师", "Hive course teacher")], ["role:it", t("域管理员（IT）", "Domain administrator (IT)")], ["role:hive", t("域蜂巢管理员", "Domain Hive administrator")], ["role:staff", "Staff"], ["role:admin", t("系统管理员", "System administrator")], ["role:any", t("有任一蜂巢角色", "Any Hive role")]]);
    $("content").innerHTML =
      '<div class="toolbar" id="ubar">' + domainPicker("dsel", canAll) +
        '<select id="urole" aria-label="' + t("按角色筛选", "Filter by role") + '">' + ROLE_OPTS.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (state.userRole === o[0] ? " selected" : "") + ">" + esc(o[1]) + "</option>"; }).join("") + "</select>" +
        '<button class="chip" data-f="all" aria-pressed="' + (state.userFilter === "all") + '">' + t("全部", "All") + "</button>" +
        '<button class="chip" data-f="noauth" aria-pressed="' + (state.userFilter === "noauth") + '">' + t("未登记验证器", "No authenticator") + "</button>" +
        '<button class="chip" data-f="noid" aria-pressed="' + (state.userFilter === "noid") + '">' + t("身份未填", "No identity") + "</button>" +
        '<button class="chip" data-f="never" aria-pressed="' + (state.userFilter === "never") + '">' + t("从未登录", "Never signed in") + "</button>" +
        '<span class="spacer"></span><div class="search">' + ICON.search + '<input type="search" id="uq" value="' + esc(state.userQ) + '" placeholder="' + t("搜索账号、姓名、群组…", "Search account, name, group…") + '" /></div>' +
      "</div>" +
      '<div class="kpis" id="ukpi"></div>' +
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
      if (kind === "teacher") return !!u.hiveTeacher;
      return true;
    }
    var rows = d.users.filter(function (u) {
      if (f === "noauth" && u.verified !== false) return false;
      if (f === "noid" && u.identity) return false;
      if (f === "never" && u.lastSignIn) return false;
      if (role.indexOf("id:") === 0 && u.identity !== role.slice(3)) return false;
      if (role.indexOf("role:") === 0 && !hasRole(u, role.slice(5))) return false;
      if (q) {
        var hay = [u.upn, u.displayName, u.identity, u.linked.join(" "), u.groups.map(function (g) { return g.name; }).join(" "), u.devices.map(function (x) { return x.name; }).join(" "), u.domain ? dname(u.domain) : "", (u.roles || []).map(function (r) { return (EN ? r.en : r.zh) || r.role || ""; }).join(" ")].join(" ").toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
    var teachers = d.users.filter(function (u) { return u.hiveTeacher; }).length;
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
        '<td class="nowrap">' + (u.identity ? '<span class="tag accent">' + esc(vl(u.identity)) + "</span>" : '<span class="muted">—</span>') + (u.hiveTeacher ? ' <span class="tag ok" title="' + esc(t("蜂巢课程教师", "Hive course teacher") + (u.hiveTeacher.teacherId ? " · " + u.hiveTeacher.teacherId : "")) + '">' + t("课程教师", "Course teacher") + "</span>" : "") + ((u.roles || []).length ? ' <span class="tag">' + t("角色", "Role") + "</span>" + roleTags : "") + "</td>" +
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
        (canDo("people") ? '<form id="pform"><label class="f">' + t("身份", "Identity") + '<select id="pid">' + idOpts + "</select>" + (u.identitySource === "entra" ? "<small>" + t("来自 Entra 的部门字段", "From Entra's department field") + "</small>" : "") + "</label>" +
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
        u.identity = rec.identity || (u.identitySource === "entra" ? u.identity : ""); u.identitySource = rec.identity ? "hive" : u.identitySource;
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
        delete state.domainUsers[dom];
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

  // ================================================================================
  // 系统 › 角色分配 / 数据同步
  // ================================================================================
  // ================================================================================
  // 系统 › 角色分配 (Rick, 2026-10-04: roles come from here alone — Entra administrator
  // roles are being withdrawn from people). Search any account of any school (from
  // the directory cache), open the role editor in the side panel, save.
  // ================================================================================
  var ROLE_KIND = { it: ["域管理员（IT）", "Domain administrator (IT)"], hive: ["域蜂巢管理员", "Domain Hive administrator"], staff: ["Staff", "Staff"], sys: ["系统管理员", "System administrator"] };
  function roleKind(r) {
    if (/^domain_it:/.test(r)) return "it";
    if (/^domain_hive:/.test(r)) return "hive";
    if (/^domain_admin:/.test(r)) return "it"; // legacy IT + Hive: shown as two chips by roleChips
    if (r === "admin" || r === "staff:sysadmin") return "sys";
    return "staff";
  }
  function roleChips(roles) {
    var out = [], seen = {};
    (roles || []).forEach(function (r) {
      var m;
      if ((m = /^domain_admin:(.+)$/.exec(r))) { out.push(["it", m[1]]); out.push(["hive", m[1]]); return; }
      if (r === "admin" && (roles || []).indexOf("staff:sysadmin") >= 0) return;
      out.push([roleKind(r), (m = /^domain_(it|hive):(.+)$/.exec(r)) ? m[2] : (m = /^staff:(.+)$/.exec(r)) ? m[1] : ""]);
    });
    return out.filter(function (x) { var k = x.join("|"); if (seen[k]) return false; seen[k] = 1; return true; }).map(function (x) {
      var kind = x[0], arg = x[1], label;
      if (kind === "it" || kind === "hive") label = ROLE_KIND[kind][EN ? 1 : 0] + " · " + dname(arg);
      else if (kind === "sys") label = ROLE_KIND.sys[EN ? 1 : 0];
      else label = "Staff · " + (STAFF_FN[arg] ? STAFF_FN[arg][EN ? 1 : 0] : arg);
      return '<span class="tag role-' + kind + '">' + esc(label) + "</span>";
    }).join("");
  }
  // ---- 操作手册 ---------------------------------------------------------------------
  // The domain administrator handbook used to open as its own page (/help/domain-admin.html)
  // with the site header and a 「打开管理中心 →」 button at the end. Rick, 2026-10-06: 「don't
  // need to go back… just display the content in the page like user and group management」.
  // So the handbook is now a view: the page is fetched, its article is lifted out and shown
  // inside the content pane with the sidebar in place. The article keeps its own stylesheet
  // by living in a shadow root (the handbook's CSS was written for a standalone page and
  // would collide with the dashboard's); its `:root` variables become `:host`. The
  // standalone page still exists for anyone who has the address.
  var handbookHtml = null;
  function viewHandbook() {
    setTitle(domainsInfo.all ? t("机构管理", "Institutions") : t("本域管理", "My domain"), t("操作手册", "Handbook"), "", t("域管理员在管理中心能做什么、怎么做、要注意什么。", "What a domain administrator can do in the Management Center, how, and what to watch."));
    $("content").innerHTML = '<div class="handbook" id="handbook"><div class="loading">' + t("载入中…", "Loading…") + "</div></div>";
    var p = handbookHtml ? Promise.resolve(handbookHtml) : fetch("/help/domain-admin.html", { credentials: "same-origin" }).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); }).then(function (h) { handbookHtml = h; return h; });
    p.then(function (html) {
      var host = $("handbook"); if (!host) return;
      var doc = new DOMParser().parseFromString(html, "text/html");
      var wrap = doc.querySelector(".wrap"); if (!wrap) throw new Error("no article");
      // The parts that belong to the standalone page, not to a view: the masthead pill, the
      // page title (the title row has it), the 「打开管理中心」 button.
      ["mast-top", "cta"].forEach(function (c) { Array.prototype.forEach.call(wrap.querySelectorAll("." + c), function (el) { el.remove(); }); });
      var h1 = wrap.querySelector("h1"); if (h1) h1.remove();
      if (EN) {
        Array.prototype.forEach.call(wrap.querySelectorAll("[data-en]"), function (el) { el.innerHTML = el.getAttribute("data-en"); });
        Array.prototype.forEach.call(wrap.querySelectorAll("[data-en-label]"), function (el) { el.setAttribute("aria-label", el.getAttribute("data-en-label")); });
      }
      // Phone layout of the data tables labels each cell by its column (the page's own script did this).
      Array.prototype.forEach.call(wrap.querySelectorAll("table.grid"), function (tb) {
        var hs = Array.prototype.map.call(tb.querySelectorAll("thead th"), function (th) { return th.textContent; });
        Array.prototype.forEach.call(tb.querySelectorAll("tbody tr"), function (tr) { Array.prototype.forEach.call(tr.children, function (c, i) { if (hs[i]) c.setAttribute("data-l", hs[i]); }); });
      });
      // Links to the other help pages leave the dashboard, so they open in a new tab.
      Array.prototype.forEach.call(wrap.querySelectorAll("a[href]"), function (a) {
        var href = a.getAttribute("href") || "";
        if (/^\//.test(href) && !/^\/management\//.test(href)) { a.setAttribute("target", "_blank"); a.setAttribute("rel", "noopener"); }
      });
      var css = Array.prototype.map.call(doc.querySelectorAll("style"), function (s) { return s.textContent; }).join("\n")
        .replace(/:root\b/g, ":host");
      css += "\n:host{display:block;color:var(--ink)} .wrap{max-width:860px;margin:0;padding:0 0 24px} h1,h2,h3{font-family:inherit} h2.cat:first-of-type{margin-top:18px}";
      var root = host.shadowRoot || host.attachShadow({ mode: "open" });
      root.innerHTML = "";
      var st = document.createElement("style"); st.textContent = css; root.appendChild(st);
      root.appendChild(wrap);
      // In-page links (the contents list, cross-references) scroll within the pane; the
      // address stays on #/domain/handbook so the router is not involved. A folded section
      // opens when it is the target.
      root.addEventListener("click", function (e) {
        var a = e.target.closest && e.target.closest('a[href^="#"]'); if (!a) return;
        var id = a.getAttribute("href").slice(1), target = id && root.getElementById(id); if (!target) return;
        e.preventDefault();
        if (target.tagName === "DETAILS") target.open = true;
        target.scrollIntoView({ block: "start", behavior: "smooth" });
      });
    }).catch(function (err) {
      var host = $("handbook"); if (host) host.innerHTML = '<div class="card"><h2>' + t("无法载入手册", "Could not load the handbook") + '</h2><p class="sub">' + esc(err.message) + '</p><div class="actions"><a class="btn secondary" href="/help/domain-admin.html" target="_blank" rel="noopener">' + t("在新窗口打开 ↗", "Open in a new window ↗") + "</a></div></div>";
    });
  }
  function viewRoles() {
    setTitle(t("系统", "System"), t("角色分配", "Roles"), "", t("搜索任何学校的任何账号，赋予或收回角色。普通用户无需分配；改动即时生效。", "Search any account of any school and grant or withdraw roles. Ordinary users need none; changes take effect at once."));
    var doms = (domainsInfo && domainsInfo.domains) || [];
    var state = { entries: [], kind: "all", domain: "", q: "" };
    $("content").innerHTML =
      '<div class="toolbar" id="rbar">' +
        '<div class="search rsearch">' + ICON.search + '<input type="search" id="rq" autocomplete="off" placeholder="' + t("搜索姓名或账号，添加或修改…", "Search a name or account to add or edit…") + '" /><div class="sugg" id="rsugg" hidden></div></div>' +
        '<span class="spacer"></span>' +
        '<button class="chip" data-k="all" aria-pressed="true">' + t("全部", "All") + "</button>" +
        '<button class="chip" data-k="it" aria-pressed="false">' + t("域管理员（IT）", "Domain IT") + "</button>" +
        '<button class="chip" data-k="hive" aria-pressed="false">' + t("域蜂巢管理员", "Domain Hive") + "</button>" +
        '<button class="chip" data-k="staff" aria-pressed="false">Staff</button>' +
        '<button class="chip" data-k="sys" aria-pressed="false">' + t("系统管理员", "System admin") + "</button>" +
        (doms.length > 1 ? '<select id="rdom"><option value="">' + t("所有学校", "All schools") + "</option>" + doms.map(function (d) { return '<option value="' + esc(d.domain) + '">' + esc(dname(d.domain)) + "</option>"; }).join("") + "</select>" : "") +
      "</div>" +
      '<div class="tbl-wrap"><table class="data roles2" id="rtable"><thead><tr><th>' + t("人员", "Person") + "</th><th>" + t("学校", "School") + "</th><th>" + t("角色", "Roles") + "</th><th>" + t("授予", "Granted") + '</th></tr></thead>' +
        '<tbody><tr><td colspan="4" class="loading">' + t("载入中…", "Loading…") + "</td></tr></tbody></table></div>" +
      '<p class="muted" id="rfoot" style="font-size:.8rem"></p><div id="rmsg"></div>';

    // `q` highlights the match in the name (hl() escapes and wraps it in <mark>).
    function personCell(name, upn, extra, q) {
      var shown = name || upn.split("@")[0];
      return '<div class="pcell"><span class="avatar" style="background:' + hue(upn) + ';color:#fff">' + esc(initials(name || upn)) + '</span><div><span class="dn">' + (q ? hl(shown, q) : esc(shown)) + '</span><span class="sub">' + (q ? hl(upn, q) : esc(upn)) + (extra ? " · " + esc(extra) : "") + "</span></div></div>";
    }
    function render() {
      var rows = state.entries.filter(function (e) {
        if (state.kind !== "all" && !e.roles.some(function (r) { return roleKind(r) === state.kind || (state.kind === "hive" && /^domain_admin:/.test(r)); })) return false;
        if (state.domain && e.domain !== state.domain && !e.roles.some(function (r) { return r.indexOf(":" + state.domain) > 0; })) return false;
        return true;
      });
      var tb = $("rtable").tBodies[0];
      tb.innerHTML = rows.length ? rows.map(function (e) {
        return '<tr class="pick" data-user="' + esc(e.user) + '"><td>' + personCell(e.displayName, e.user, e.inDirectory ? "" : t("不在目录缓存中", "not in the directory cache")) + "</td>" +
          "<td>" + esc(dname(e.domain)) + "</td><td><div class=\"tags\">" + roleChips(e.roles) + "</div></td>" +
          '<td class="muted"><span class="sub">' + esc(e.by || "") + "</span><span class=\"sub\">" + esc(day(e.at)) + "</span></td></tr>";
      }).join("") : '<tr><td colspan="4" class="muted">' + (state.entries.length ? t("没有符合筛选的人员。", "Nobody matches the filter.") : t("还没有分配任何角色。在上方搜索一个账号开始。", "No roles assigned yet. Search for an account above to start.")) + "</td></tr>";
      $("rfoot").textContent = t("共 ", "") + state.entries.length + t(" 人有角色", " people hold roles") + (rows.length !== state.entries.length ? t("，显示 ", ", showing ") + rows.length : "") + t("。系统管理员由 roles.json 和启动账号共同决定。", ". System administrators come from roles.json and the bootstrap account.");
    }
    function load() { return api("roles").then(function (r) { if (!r.ok) { $("rmsg").innerHTML = '<div class="msg err">' + esc(errText(r)) + "</div>"; return; } state.entries = r.body.entries || []; render(); }); }
    load();
    $("rbar").addEventListener("click", function (e) {
      var c = e.target.closest(".chip[data-k]"); if (!c) return;
      state.kind = c.getAttribute("data-k");
      $("rbar").querySelectorAll(".chip[data-k]").forEach(function (x) { x.setAttribute("aria-pressed", x === c ? "true" : "false"); });
      render();
    });
    var rdom = $("rdom"); if (rdom) rdom.addEventListener("change", function () { state.domain = rdom.value; render(); });
    $("rtable").addEventListener("click", function (e) {
      var tr = e.target.closest("tr[data-user]"); if (!tr) return;
      var en = state.entries.filter(function (x) { return x.user === tr.getAttribute("data-user"); })[0]; if (!en) return;
      document.querySelectorAll("table.data tr.sel").forEach(function (x) { x.classList.remove("sel"); }); tr.classList.add("sel");
      openRoleEditor({ upn: en.user, displayName: en.displayName, domain: en.domain, lastSignIn: en.lastSignIn }, en.roles, function () { load(); });
    });
    // Search-as-you-type over the directory caches (12 best matches); Enter or a click
    // opens the editor for that account, with their current roles if any.
    var timer = 0, seq = 0;
    function suggest(q) {
      var box = $("rsugg");
      if (q.length < 2) { box.hidden = true; box.innerHTML = ""; return; }
      var my = ++seq;
      api("roles?q=" + encodeURIComponent(q)).then(function (r) {
        if (my !== seq || !r.ok) return;
        var people = r.body.people || [];
        box.innerHTML = people.length ? people.map(function (p) {
          var en = state.entries.filter(function (x) { return x.user === p.upn; })[0];
          return '<button type="button" class="sg" data-upn="' + esc(p.upn) + '" data-name="' + esc(p.displayName) + '" data-domain="' + esc(p.domain) + '" data-last="' + esc(p.lastSignIn || "") + '">' +
            personCell(p.displayName, p.upn, dname(p.domain), q) + '<span class="sgr">' + (en ? roleChips(en.roles) : '<span class="muted">' + t("普通用户", "User") + "</span>") + "</span></button>";
        }).join("") : '<div class="sg none">' + t("没有找到。请检查拼写，或先在「用户」页同步该学校。", "Nothing found. Check the spelling, or sync that school on the Users page first.") + "</div>";
        box.hidden = false;
      });
    }
    // Chinese input: while an IME composition is under way the Enter that commits the
    // characters must not pick the first suggestion (Rick, 2026-10-05: 「输入用户名定位一个
    // 用户，但右侧会突然弹出上一个已经关闭的用户设置页面」 — the Enter that confirmed the
    // pinyin opened the first match), and suggestions wait for the composition to end.
    var composing = false;
    $("rq").addEventListener("compositionstart", function () { composing = true; });
    $("rq").addEventListener("compositionend", function () { composing = false; clearTimeout(timer); var q = $("rq").value.trim(); timer = setTimeout(function () { suggest(q); }, 120); });
    $("rq").addEventListener("input", function () { if (composing) return; clearTimeout(timer); var q = $("rq").value.trim(); timer = setTimeout(function () { suggest(q); }, 180); });
    $("rq").addEventListener("keydown", function (e) {
      if (e.isComposing || e.keyCode === 229 || composing) return;
      if (e.key === "Escape") { $("rsugg").hidden = true; return; }
      if (e.key === "Enter") { e.preventDefault(); var f = $("rsugg").querySelector(".sg[data-upn]"); if (f) f.click(); }
      if (e.key === "ArrowDown") { var f2 = $("rsugg").querySelector(".sg[data-upn]"); if (f2) { e.preventDefault(); f2.focus(); } }
    });
    $("rsugg").addEventListener("keydown", function (e) {
      var items = Array.prototype.slice.call($("rsugg").querySelectorAll(".sg[data-upn]")), i = items.indexOf(document.activeElement);
      if (e.key === "ArrowDown" && items[i + 1]) { e.preventDefault(); items[i + 1].focus(); }
      if (e.key === "ArrowUp") { e.preventDefault(); if (i > 0) items[i - 1].focus(); else $("rq").focus(); }
      if (e.key === "Escape") { $("rsugg").hidden = true; $("rq").focus(); }
    });
    $("rsugg").addEventListener("click", function (e) {
      var b = e.target.closest(".sg[data-upn]"); if (!b) return;
      var upn = b.getAttribute("data-upn"), en = state.entries.filter(function (x) { return x.user === upn; })[0];
      $("rsugg").hidden = true; $("rq").value = "";
      openRoleEditor({ upn: upn, displayName: b.getAttribute("data-name"), domain: b.getAttribute("data-domain"), lastSignIn: b.getAttribute("data-last") }, en ? en.roles : [], function () { load(); });
    });
    document.addEventListener("click", function (e) { if (!e.target.closest(".rsearch")) { var bx = $("rsugg"); if (bx) bx.hidden = true; } });
  }

  // The role editor, in the side panel: school roles as switches per school, the
  // staff function, the system administrator switch; a live preview; save / remove.
  function openRoleEditor(person, roles, onSaved) {
    var doms = ((domainsInfo && domainsInfo.domains) || []).map(function (d) { return d.domain; });
    var own = (person.domain || person.upn.split("@")[1] || "").toLowerCase();
    // Current state, from the roles given.
    // A person may hold several functions at once (the order manager who is also the
    // community manager); `staff` is the list of them.
    var st = { it: {}, hive: {}, staff: [], sys: false, schools: [] };
    var staffOnly = !isAdmin(); // the CEO: staff functions only, school roles and sysadmin untouched
    function addFn(fn) { if (st.staff.indexOf(fn) < 0) st.staff.push(fn); }
    (roles || []).forEach(function (r) {
      var m;
      if ((m = /^domain_(it|hive|admin):(.+)$/.exec(r))) { if (m[1] !== "hive") st.it[m[2]] = true; if (m[1] !== "it") st.hive[m[2]] = true; if (st.schools.indexOf(m[2]) < 0) st.schools.push(m[2]); }
      else if ((m = /^staff:(.+)$/.exec(r))) { if (m[1] === "sysadmin") st.sys = true; else addFn(m[1]); }
      else if (r === "admin") st.sys = true;
      else if (r === "coordinator") addFn("community");
    });
    if (own && st.schools.indexOf(own) < 0) st.schools.unshift(own);
    var isMe = !!(me && me.profile && me.profile.upn && me.profile.upn.toLowerCase() === person.upn.toLowerCase());

    // What is sent: every role for the system administrator; for the CEO only the staff
    // functions (the server keeps the account's school roles and sysadmin as they were).
    function compose() {
      var out = [];
      if (!staffOnly) st.schools.forEach(function (d) { if (st.it[d]) out.push("domain_it:" + d); if (st.hive[d]) out.push("domain_hive:" + d); });
      st.staff.forEach(function (fn) { out.push("staff:" + fn); });
      if (!staffOnly && st.sys) out.push("staff:sysadmin");
      return out;
    }
    // What the account will hold after saving (the preview), kept roles included.
    function after() { return staffOnly ? compose().concat((roles || []).filter(function (r) { return !/^staff:(?!sysadmin)/.test(r) && r !== "coordinator"; })) : compose(); }
    function schoolCard(d) {
      var known = doms.indexOf(d) >= 0;
      return '<div class="rschool" data-d="' + esc(d) + '"><div class="rsh"><b>' + esc(dname(d)) + "</b>" + (d !== own ? '<button type="button" class="lnk" data-drop="' + esc(d) + '">' + t("移除", "Remove") + "</button>" : '<span class="muted">' + t("所在学校", "Their school") + "</span>") + (known ? "" : ' <span class="tag warn">' + t("未知域", "Unknown domain") + "</span>") + "</div>" +
        '<label class="sw"><input type="checkbox" data-role="it" data-d="' + esc(d) + '"' + (st.it[d] ? " checked" : "") + ' /><span class="track"></span><span class="swt"><b>' + ROLE_KIND.it[EN ? 1 : 0] + "</b><small>" + t("账号安全：查看本校账号，新建和删除账号，删除验证设备，重置密码，同步变动。", "Account security: see the school's accounts, create and delete accounts, remove authenticator devices, reset passwords, sync changes.") + "</small></span></label>" +
        '<label class="sw"><input type="checkbox" data-role="hive" data-d="' + esc(d) + '"' + (st.hive[d] ? " checked" : "") + ' /><span class="track"></span><span class="swt"><b>' + ROLE_KIND.hive[EN ? 1 : 0] + "</b><small>" + t("蜂巢信息：身份、关联账号、备注；不能动设备和密码。", "Hive information: identity, linked accounts, notes; no devices or passwords.") + "</small></span></label></div>";
    }
    function preview() {
      var rs = after();
      $("rprev").innerHTML = rs.length ? '<span class="k">' + t("保存后：", "After saving: ") + "</span>" + roleChips(rs) : '<span class="k">' + t("保存后：", "After saving: ") + "</span>" + t("普通用户（无角色）", "ordinary user (no roles)");
    }
    function addable() { return doms.filter(function (d) { return st.schools.indexOf(d) < 0; }); }
    function draw() {
      if (!staffOnly) {
        $("rschools").innerHTML = st.schools.map(schoolCard).join("");
        var more = addable();
        $("raddwrap").innerHTML = more.length ? '<select id="radd"><option value="">' + t("＋ 添加其他学校…", "+ Add another school…") + "</option>" + more.map(function (d) { return '<option value="' + esc(d) + '">' + esc(dname(d)) + "</option>"; }).join("") + "</select>" : "";
      }
      preview();
    }
    panelOpen(
      '<div class="ph"><span class="avatar" style="background:' + hue(person.upn) + ';color:#fff">' + esc(initials(person.displayName || person.upn)) + "</span><h3>" + esc(person.displayName || person.upn) + '</h3><button class="x" type="button" aria-label="close">✕</button></div>' +
      '<div class="pb">' +
        '<div class="kv"><span class="k">' + t("账号", "Account") + "</span><span>" + esc(person.upn) + "</span>" +
          '<span class="k">' + t("学校", "School") + "</span><span>" + esc(dname(own)) + "</span>" +
          (person.lastSignIn ? '<span class="k">' + t("最近登录", "Last sign-in") + "</span><span>" + esc(when(person.lastSignIn)) + "</span>" : "") +
          '<span class="k">' + t("当前角色", "Current roles") + "</span><span>" + ((roles || []).length ? roleChips(roles) : '<span class="muted">' + t("普通用户", "User") + "</span>") + "</span></div>" +
        (staffOnly ? "" : "<h4>" + t("学校角色", "School roles") + '</h4><div id="rschools"></div><div id="raddwrap" class="raddwrap"></div>') +
        "<h4>" + t("蜂巢工作人员", "Hive staff") + '</h4><div class="rstaff" id="rstaff">' +
          '<button type="button" class="chip" data-staff="" aria-pressed="' + (!st.staff.length) + '">' + t("不是员工", "Not staff") + "</button>" +
          Object.keys(STAFF_FN).filter(function (k) { return k !== "sysadmin" && (!STAFF_LEGACY[k] || st.staff.indexOf(k) >= 0); }).map(function (k) { return '<button type="button" class="chip" data-staff="' + k + '" aria-pressed="' + (st.staff.indexOf(k) >= 0) + '">' + esc(STAFF_FN[k][EN ? 1 : 0]) + "</button>"; }).join("") +
        '</div><p class="muted" style="font-size:12px;margin:6px 0 0">' + t("蜂巢员工按职能分，可兼任几个职能；每个职能在 CRM 里看到的数据按权限矩阵裁剪。", "Hive staff by function; a person may hold several. What each function sees in the CRM follows the permission matrix.") + "</p>" +
        (staffOnly ? "" : "<h4>" + t("系统管理员", "System administrator") + "</h4>" +
        '<label class="sw danger"><input type="checkbox" id="rsys"' + (st.sys ? " checked" : "") + (isMe ? " disabled" : "") + ' /><span class="track"></span><span class="swt"><b>' + t("系统管理员", "System administrator") + "</b><small>" + t("所有学校的一切，包括角色分配本身。请只给蜂巢的运维人员。", "Everything, for every school — including this page. Hive operations people only.") + (isMe ? " " + t("（不能改自己的）", "(not for your own account)") : "") + "</small></span></label>") +
        '<div class="rprev" id="rprev"></div>' +
        '<div class="actions"><button class="btn" type="button" id="rsave">' + t("保存", "Save") + "</button>" + ((roles || []).length && !isMe ? '<button class="btn secondary" type="button" id="rremove">' + (staffOnly ? t("移除员工职能", "Remove staff functions") : t("移除全部角色", "Remove all roles")) + "</button>" : "") + '</div><div id="rpmsg"></div>' +
      "</div>");
    draw();
    var pb = $("panel").querySelector(".pb");
    pb.addEventListener("change", function (e) {
      var c = e.target;
      if (c.matches("input[data-role]")) { st[c.getAttribute("data-role")][c.getAttribute("data-d")] = c.checked; preview(); return; }
      if (c.id === "rsys") {
        if (c.checked && !window.confirm(t("把 " + (person.displayName || person.upn) + " 设为系统管理员？他将拥有所有学校的全部权限，包括分配角色。", "Make " + (person.displayName || person.upn) + " a system administrator? They will have every permission for every school, including assigning roles."))) { c.checked = false; return; }
        st.sys = c.checked; preview(); return;
      }
      if (c.id === "radd" && c.value) { st.schools.push(c.value); draw(); }
    });
    pb.addEventListener("click", function (e) {
      var sc = e.target.closest(".chip[data-staff]");
      if (sc) {
        var fn = sc.getAttribute("data-staff");
        if (!fn) st.staff = []; else if (st.staff.indexOf(fn) >= 0) st.staff.splice(st.staff.indexOf(fn), 1); else st.staff.push(fn);
        pb.querySelectorAll(".chip[data-staff]").forEach(function (x) { var k = x.getAttribute("data-staff"); x.setAttribute("aria-pressed", k ? String(st.staff.indexOf(k) >= 0) : String(!st.staff.length)); });
        preview(); return;
      }
      var drop = e.target.closest("button[data-drop]");
      if (drop) { var d = drop.getAttribute("data-drop"); st.schools = st.schools.filter(function (x) { return x !== d; }); delete st.it[d]; delete st.hive[d]; draw(); return; }
      if (e.target.closest("#rsave")) {
        var rs = compose(), b = $("rsave"); savingButton(b);
        post("roles", "POST", { user: person.upn, roles: rs }).then(function (r) {
          if (!r.ok) { restoreButton(b); $("rpmsg").innerHTML = '<div class="msg err">' + esc(errText(r)) + "</div>"; return; }
          var newSys = rs.some(function (x) { return x === "staff:sysadmin"; }) && !(roles || []).some(function (x) { return x === "staff:sysadmin" || x === "admin"; });
          roles = rs; onSaved && onSaved(rs);
          savedAndClose(b, "<b>" + esc(person.displayName || person.upn) + "</b>" + t("：", ": ") + (rs.length ? roleChips(rs) : t("普通用户（已移除所有角色）", "ordinary user (all roles removed)")) +
            (newSys ? " · " + t("新的系统管理员需要重新登录一次，「系统」菜单才会出现。", "A new system administrator must sign in again before the System menu appears.") : ""));
        });
        return;
      }
      if (e.target.closest("#rremove")) {
        if (!window.confirm(t("移除 " + (person.displayName || person.upn) + " 的所有角色（变为普通用户）？", "Remove all roles from " + (person.displayName || person.upn) + " (ordinary user)?"))) return;
        var rb = $("rremove"); savingButton(rb, t("移除中…", "Removing…"));
        post("roles", "DELETE", { user: person.upn }).then(function (r) {
          if (!r.ok) { restoreButton(rb); $("rpmsg").innerHTML = '<div class="msg err">' + esc(errText(r)) + "</div>"; return; }
          onSaved && onSaved([]);
          rb.textContent = t("已移除 ✓", "Removed ✓");
          savedAndClose(null, "<b>" + esc(person.displayName || person.upn) + "</b>" + t(" 已设为普通用户。", " is now an ordinary user."));
        });
      }
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
  // 经营 › 订单 (CRM design §6, Rick 2026-10-06): the website's course orders, stored by
  // api/order at checkout, with their status and fulfilment record. Who sees what is the
  // server's business (api/crm masks by role); the page only hides the buttons a reader
  // cannot use. Overdue rules (decision 18): submitted > 7 d, confirmed > 14 d, paid > 30 d.
  // ================================================================================
  var ORDER_TABS = [["all", "全部", "All"], ["submitted", "已提交", "Submitted"], ["confirmed", "已确认", "Confirmed"], ["paid", "已付款", "Paid"], ["started", "已开课", "Started"], ["cancelled", "已取消", "Cancelled"], ["overdue", "超期", "Overdue"], ["notifyFailed", "通知失败", "Notification failed"]];
  var ORDER_ST = { submitted: ["已提交", "Submitted", "accent"], confirmed: ["已确认", "Confirmed", "accent"], paid: ["已付款", "Paid", "ok"], started: ["已开课", "Started", "ok"], cancelled: ["已取消", "Cancelled", "muted"] };
  var ORDER_VERB = { confirmed: ["确认接单", "Confirm"], paid: ["标记已付款", "Mark paid"], started: ["标记已开课", "Mark started"], cancelled: ["取消订单", "Cancel order"], submitted: ["重新打开", "Reopen"] };
  var ordersState = { list: null, counts: {}, tab: "all", q: "", access: {} };
  function crmLevel(domain) { return (me && me.crm && me.crm[domain]) || "none"; }
  function canSeeRoyalty() { return crmLevel("money") === "rw" || hasFn("ceo"); }
  function canSeeOrders() { return crmLevel("orders") !== "none"; }
  function stTag(status) { var d = ORDER_ST[status] || [status, status, ""]; return '<span class="tag ' + d[2] + '">' + esc(t(d[0], d[1])) + "</span>"; }
  function money(v, cur) { if (v === null || v === undefined) return '<span class="muted">' + t("不可见", "hidden") + "</span>"; return esc((cur === "CNY" || !cur ? "¥" : cur + " ") + Number(v).toLocaleString(EN ? "en-US" : "zh-CN")); }
  function overdueTag(o) {
    if (!o.overdue) return "";
    var r = o.overdue;
    return '<span class="tag warn" title="' + esc(t("在「" + t(ORDER_ST[r.rule][0], ORDER_ST[r.rule][1]) + "」已停留 " + r.days + " 天（上限 " + r.limit + " 天）", "In “" + t(ORDER_ST[r.rule][0], ORDER_ST[r.rule][1]) + "” for " + r.days + " days (limit " + r.limit + ")")) + '">' + esc(t("超期 " + r.days + " 天", r.days + " d overdue")) + "</span>";
  }
  // Order payloads carry "中文 / English" pairs for class type and teaching language; show one side.
  function side(v) { var parts = String(v || "").split(" / "); return parts.length === 2 ? (EN ? parts[1] : parts[0]) : String(v || ""); }
  function orderHives(o) { return (o.hives || []).map(function (h) { return h.abbr || h.name || h.key; }).filter(Boolean).join(", ") || (o.items && o.items[0] && (o.items[0].schoolAbbr || o.items[0].schoolName)) || "—"; }
  function orderCourses(o) { return (o.items || []).map(function (it) { return EN ? (it.nameEn || it.nameZh) : (it.nameZh || it.nameEn); }); }
  // The app may not read the team's channels yet: what to do, once (resource-specific consent).
  function teamsSetupPanel(b) {
    panelOpen('<div class="ph"><h3>' + t("让管理中心读取 Teams 订单", "Let the management centre read Teams orders") + '</h3><button class="x" type="button" aria-label="close">✕</button></div><div class="pb">' +
      '<p class="msg">' + t("Hive 的应用身份还不能读取团队「" + (b.team || "Hive Orders") + "」的频道消息。微软把频道消息的应用权限列为受保护接口；绕开申请的办法是给这个团队装一个只申请「读取本团队频道消息」权限的 Teams 应用（资源级许可），只对这一个团队有效，对 Teams 不做任何写入。",
        "Hive's app identity cannot read the channel messages of team \u201c" + (b.team || "Hive Orders") + "\u201d yet. Microsoft gates that application permission; the way round is a Teams app that asks only to read this team's channel messages (resource-specific consent), installed in this one team — it reads, never writes.") + "</p>" +
      "<ol>" +
        "<li>" + t("下载应用包：", "Download the app package: ") + '<a href="/api/crm/teams-app" download="hive-crm-teams-app.zip">hive-crm-teams-app.zip</a></li>' +
        "<li>" + t("Teams 管理中心 › Teams 应用 › 设置策略：确认允许上传自定义应用（一次性）。", "Teams admin center › Teams apps › Setup policies: make sure custom app upload is allowed (once).") + "</li>" +
        "<li>" + t("在 Teams 里：应用 › 管理你的应用 › 上传应用 › 上传自定义应用，选这个 zip。", "In Teams: Apps › Manage your apps › Upload an app › Upload a custom app, pick the zip.") + "</li>" +
        "<li>" + t("把它添加到团队「" + (b.team || "Hive Orders") + "」（添加到团队，而不是个人）。团队所有者同意权限即可。", "Add it to the team \u201c" + (b.team || "Hive Orders") + "\u201d (to the team, not to yourself); the team owner's consent grants the permission.") + "</li>" +
        "<li>" + t("回到这里再点「从 Teams 读取订单」。", "Come back and click \u201cRead orders from Teams\u201d again.") + "</li>" +
      "</ol>" +
      '<p class="hint">' + t("备选：用 Export-TeamsOrders.ps1 以自己的账号导出频道，再点「导入 Teams 导出…」。", "Alternative: export the channels with Export-TeamsOrders.ps1 under your own sign-in, then \u201cImport Teams export…\u201d.") + "</p></div>");
  }
  // 订单 has two pages shown one at a time (Rick, 2026-10-06): 课程订单 — the website's
  // course orders — and 教材订单 — the Equip textbook orders read from Airtable.
  function viewOrders() {
    var equipTab = location.hash.indexOf("#/ops/orders/equip") === 0;
    $("content").innerHTML = '<div class="pagetabs" role="tablist">' +
      '<a class="ptab' + (equipTab ? "" : " on") + '" role="tab" aria-selected="' + !equipTab + '" href="#/ops/orders">' + t("蜂巢课程订单", "Hive course orders") + '<small>' + t("蜂巢网站", "fengchao.life") + "</small></a>" +
      '<a class="ptab' + (equipTab ? " on" : "") + '" role="tab" aria-selected="' + equipTab + '" href="#/ops/orders/equip">' + t("Equip教材订单", "Equip textbook orders") + '<small>EquipMe · Airtable</small></a></div><div id="opsBody"></div>';
    if (equipTab) viewEquipOrders(); else viewCourseOrders();
  }
  function viewCourseOrders() {
    setTitle(t("经营 › 订单", "Operations › Orders"), t("蜂巢课程订单", "Hive course orders"), '<button class="btn secondary sm" id="oReload">' + t("刷新", "Refresh") + '</button> <button class="btn secondary sm" id="oCsv">' + t("导出 CSV", "Export CSV") + "</button>" + (isAdmin() ? ' <button class="btn sm" id="oTeams">' + t("从 Teams 读取订单", "Read orders from Teams") + '</button> <button class="btn secondary sm" id="oImport">' + t("导入 Teams 导出…", "Import Teams export…") + '</button><input type="file" id="oImportFile" accept=".json,application/json" hidden />' : ""),
      t("网站下单的课程订单，下单即记录；状态由订单经理维护，每一步都留有记录。超期未推进的单会标出。", "Course orders from the website, recorded at checkout; the order manager maintains the status and every step is kept. Orders that stall are flagged."));
    $("opsBody").innerHTML =
      '<div class="toolbar" id="obar">' + ORDER_TABS.map(function (tb) { return '<button class="chip" data-f="' + tb[0] + '" aria-pressed="' + (ordersState.tab === tb[0]) + '">' + esc(t(tb[1], tb[2])) + ' <span class="cnt" data-cnt="' + tb[0] + '"></span></button>'; }).join("") +
        '<span class="spacer"></span><div class="search">' + ICON.search + '<input type="search" id="oq" value="' + esc(ordersState.q) + '" placeholder="' + t("搜索订单号、邮箱、蜂巢、课程…", "Search order no., email, hive, course…") + '" /></div></div>' +
      '<div class="kpis" id="okpi"></div>' +
      '<div class="tbl-wrap"><table class="data" id="otable"><thead><tr><th>' + t("订单号", "Order no.") + "</th><th>" + t("日期", "Date") + "</th><th>" + t("下单人", "Ordered by") + "</th><th>" + t("蜂巢", "Hive") + "</th><th>" + t("课程", "Courses") + "</th><th>" + t("金额", "Amount") + "</th><th>" + t("状态", "Status") + "</th><th>" + t("提醒", "Flags") + "</th></tr></thead>" +
        '<tbody><tr><td colspan="8" class="loading">' + t("载入中…", "Loading…") + "</td></tr></tbody></table></div>" +
      '<p class="muted" id="ofoot" style="font-size:.8rem"></p>';
    $("obar").addEventListener("click", function (e) {
      var c = e.target.closest(".chip[data-f]"); if (!c) return;
      ordersState.tab = c.getAttribute("data-f");
      $("obar").querySelectorAll(".chip").forEach(function (x) { x.setAttribute("aria-pressed", x === c ? "true" : "false"); });
      renderOrders();
    });
    $("oq").addEventListener("input", debounce(function () { ordersState.q = $("oq").value.trim(); renderOrders(); }, 120));
    $("oReload").addEventListener("click", function () { loadOrders(true).then(renderOrders); });
    $("oCsv").addEventListener("click", exportOrdersCsv);
    var tb0 = $("oTeams");
    if (tb0) tb0.addEventListener("click", function () {
      savingButton(tb0, t("读取中…", "Reading…"));
      post("crm/import-teams", "POST", { dryRun: true }).then(function (r) {
        restoreButton(tb0);
        if (!r.ok) {
          if (r.body && r.body.error === "teams_forbidden") { teamsSetupPanel(r.body); return; }
          if (r.body && r.body.error === "no_team") { flash(t("租户里没有叫 ", "No team named ") + esc(r.body.team) + t(" 的团队。", " in the tenant."), 8000); return; }
          flash(esc(errText(r)), 8000); return;
        }
        var b = r.body;
        var msg = t("团队 ", "Team ") + b.team + t("：读到 ", ": read ") + b.messages + t(" 条消息，解析出 ", " messages, parsed ") + b.parsed + t(" 单：新增 ", " orders: ") + b.created.length + t("，已存在 ", " new, ") + b.existing.length + t("，不是订单的消息 ", " already stored, ") + b.skipped.length + t(" 条。", " messages not orders.");
        if (!b.created.length) { flash(msg, 9000); return; }
        if (!window.confirm(msg + "\n\n" + t("写入这 " + b.created.length + " 单？", "Store these " + b.created.length + " orders?"))) return;
        savingButton(tb0, t("写入中…", "Storing…"));
        post("crm/import-teams", "POST", {}).then(function (r2) {
          restoreButton(tb0);
          if (!r2.ok) { flash(esc(errText(r2)), 8000); return; }
          flashOk(t("已从 Teams 导入 ", "Imported from Teams: ") + r2.body.created.length + t(" 单。", " orders."));
          loadOrders(true).then(renderOrders);
        });
      });
    });
    var imp = $("oImport");
    if (imp) {
      imp.addEventListener("click", function () { $("oImportFile").click(); });
      $("oImportFile").addEventListener("change", function () {
        var f = this.files && this.files[0]; this.value = ""; if (!f) return;
        var rd = new FileReader();
        rd.onload = function () {
          var data; try { data = JSON.parse(rd.result); } catch (e) { flash(t("不是 JSON 文件。", "Not a JSON file.")); return; }
          var msgs = Array.isArray(data) ? data : data.value || data.messages || [];
          if (!msgs.length) { flash(t("文件里没有消息。", "No messages in the file.")); return; }
          $("ofoot").textContent = t("正在解析 ", "Parsing ") + msgs.length + t(" 条消息…", " messages…");
          post("crm/import", "POST", { messages: msgs, dryRun: true }).then(function (r) {
            if (!r.ok) { flash(esc(errText(r))); return; }
            var b = r.body;
            var msg = t("解析出 ", "Parsed ") + b.parsed + t(" 单：新增 ", " orders: ") + b.created.length + t("，已存在 ", " new, ") + b.existing.length + t("，无法识别的消息 ", " already stored, ") + b.skipped.length + t(" 条。", " messages not orders.");
            if (!b.created.length) { flash(msg, 8000); return; }
            if (!window.confirm(msg + "\n\n" + t("写入这 " + b.created.length + " 单？", "Store these " + b.created.length + " orders?"))) { $("ofoot").textContent = ""; return; }
            post("crm/import", "POST", { messages: msgs }).then(function (r2) {
              if (!r2.ok) { flash(esc(errText(r2))); return; }
              flashOk(t("已导入 ", "Imported ") + r2.body.created.length + t(" 单。", " orders."));
              loadOrders(true).then(renderOrders);
            });
          });
        };
        rd.readAsText(f);
      });
    }
    $("okpi").addEventListener("click", function (e) {
      var k = e.target.closest(".kpi[data-kf]"); if (!k) return;
      ordersState.tab = k.getAttribute("data-kf");
      $("obar").querySelectorAll(".chip").forEach(function (x) { x.setAttribute("aria-pressed", x.getAttribute("data-f") === ordersState.tab ? "true" : "false"); });
      renderOrders();
    });
    $("otable").addEventListener("click", function (e) {
      var tr = e.target.closest("tr[data-id]"); if (!tr) return;
      document.querySelectorAll("table.data tr.sel").forEach(function (x) { x.classList.remove("sel"); });
      tr.classList.add("sel");
      openOrderPanel(tr.getAttribute("data-id"));
    });
    loadOrders(false).then(renderOrders).catch(function (r) { $("otable").tBodies[0].innerHTML = '<tr><td colspan="8" class="loading">' + esc(errText(r)) + "</td></tr>"; });
  }
  function loadOrders(force) {
    if (ordersState.list && !force) return Promise.resolve(ordersState.list);
    return api("crm/orders").then(function (r) {
      if (!r.ok) throw r;
      ordersState.list = r.body.orders || []; ordersState.counts = r.body.counts || {}; ordersState.access = r.body.access || {};
      return ordersState.list;
    });
  }
  function orderTabs(o) { var tabs = [o.status]; if (o.overdue) tabs.push("overdue"); if (o.notify && o.notify.ok === false && !o.notify.pending) tabs.push("notifyFailed"); return tabs; }
  function ordersNow() {
    var q = ordersState.q.toLowerCase();
    return (ordersState.list || []).filter(function (o) {
      if (ordersState.tab !== "all" && orderTabs(o).indexOf(ordersState.tab) < 0) return false;
      if (!q) return true;
      var hay = [o.orderId, o.email, o.teamsAccount, orderHives(o), orderCourses(o).join(" "), (o.items || []).map(function (it) { return it.code; }).join(" ")].join(" ").toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function renderOrders() {
    var list = ordersState.list || [], c = ordersState.counts || {};
    ORDER_TABS.forEach(function (tb) { var el = $("obar").querySelector('[data-cnt="' + tb[0] + '"]'); if (el) el.textContent = c[tb[0]] ? "(" + c[tb[0]] + ")" : ""; });
    var now = new Date(), ym = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
    var month = list.filter(function (o) { return String(o.submittedAt || "").slice(0, 7) === ym && o.status !== "cancelled"; });
    var seeMoney = crmLevel("money") !== "none";
    var sum = month.reduce(function (s, o) { return s + (typeof o.totalPrice === "number" ? o.totalPrice : 0); }, 0);
    $("okpi").innerHTML =
      '<button class="kpi" data-kf="all"><div class="l">' + t("本月订单", "Orders this month") + '</div><div class="v">' + month.length + "</div></button>" +
      (seeMoney ? '<div class="kpi"><div class="l">' + t("本月成交额（Hive 课程）", "Transaction value this month (Hive courses)") + '</div><div class="v">' + money(sum, "CNY") + '</div><div class="s">' + t("只在仪表盘显示，不与教材销售合计", "Dashboard only; never summed with textbook sales") + "</div></div>" : "") +
      '<button class="kpi" data-kf="submitted"><div class="l">' + t("待确认", "Awaiting confirmation") + '</div><div class="v' + (c.submitted ? " warn" : "") + '">' + (c.submitted || 0) + "</div></button>" +
      '<button class="kpi" data-kf="confirmed"><div class="l">' + t("待付款", "Awaiting payment") + '</div><div class="v">' + (c.confirmed || 0) + "</div></button>" +
      '<button class="kpi" data-kf="overdue"><div class="l">' + t("超期", "Overdue") + '</div><div class="v' + (c.overdue ? " bad" : "") + '">' + (c.overdue || 0) + "</div></button>" +
      '<button class="kpi" data-kf="notifyFailed"><div class="l">' + t("通知失败", "Notification failed") + '</div><div class="v' + (c.notifyFailed ? " bad" : "") + '">' + (c.notifyFailed || 0) + "</div></button>";
    var rows = ordersNow();
    var tb = $("otable").tBodies[0];
    tb.innerHTML = rows.length ? rows.map(function (o) {
      var courses = orderCourses(o);
      return '<tr class="pick" data-id="' + esc(o.orderId) + '"><td class="nowrap"><b>' + esc(o.orderId) + "</b></td>" +
        '<td class="nowrap">' + esc(day(o.submittedAt)) + "</td>" +
        '<td class="cell-ell" title="' + esc(o.email) + '">' + esc(o.email || "—") + "</td>" +
        '<td class="nowrap">' + esc(orderHives(o)) + "</td>" +
        '<td class="cell-ell" title="' + esc(courses.join(" · ")) + '">' + esc(courses.slice(0, 2).join(" · ")) + (courses.length > 2 ? ' <span class="muted">+' + (courses.length - 2) + "</span>" : "") + "</td>" +
        '<td class="nowrap">' + money(o.totalPrice, o.currency) + "</td>" +
        '<td class="nowrap">' + stTag(o.status) + "</td>" +
        '<td class="nowrap"><span class="tags">' + overdueTag(o) + (o.notify && o.notify.ok === false && !o.notify.pending ? '<span class="tag bad">' + t("通知失败", "Not notified") + "</span>" : "") + "</span></td></tr>";
    }).join("") : '<tr><td colspan="8" class="empty">' + t("没有符合条件的订单。", "No orders match.") + "</td></tr>";
    $("ofoot").textContent = t("显示 ", "Showing ") + rows.length + " / " + list.length + t(" 单", " orders") + (list.length ? "" : t("。网站还没有新订单落库。", ". No orders have been recorded from the website yet."));
  }
  function exportOrdersCsv() {
    var cell = function (v) { v = String(v == null ? "" : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var head = [t("订单号", "Order no."), t("提交时间", "Submitted"), t("下单人", "Email"), "Teams", t("蜂巢", "Hive"), t("课程", "Courses"), t("件数", "Items"), t("金额", "Amount"), t("币种", "Currency"), t("状态", "Status"), t("最后变更", "Last change"), t("超期", "Overdue")].join(",");
    var lines = ordersNow().map(function (o) {
      var last = (o.history || [])[o.history.length - 1] || {};
      return [o.orderId, o.submittedAt, o.email, o.teamsAccount, orderHives(o), orderCourses(o).join("; "), o.itemCount, o.totalPrice == null ? "" : o.totalPrice, o.currency, t(ORDER_ST[o.status][0], ORDER_ST[o.status][1]), last.at || "", o.overdue ? o.overdue.days : ""].map(cell).join(",");
    });
    var blob = new Blob(["﻿" + [head].concat(lines).join("\r\n")], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "hive-orders-" + new Date().toISOString().slice(0, 10) + ".csv"; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }
  function openOrderPanel(id) {
    var o = (ordersState.list || []).filter(function (x) { return x.orderId === id; })[0];
    if (!o) return;
    var rw = crmLevel("orders") === "rw";
    panelOpen('<div class="ph"><h3>' + esc(o.orderId) + "</h3>" + stTag(o.status) + '<button class="x" type="button" aria-label="close">✕</button></div><div class="pb"><div class="loading">' + t("载入中…", "Loading…") + "</div></div>");
    api("crm/order?id=" + encodeURIComponent(id)).then(function (r) {
      if (!r.ok) { $("panel").querySelector(".pb").innerHTML = '<div class="msg err">' + esc(errText(r)) + "</div>"; return; }
      drawOrderPanel(r.body.order, rw ? r.body.next || [] : []);
    });
  }
  function drawOrderPanel(o, next) {
    var pb = $("panel").querySelector(".pb");
    $("panel").querySelector(".ph h3").textContent = o.orderId;
    var hdrTag = $("panel").querySelector(".ph .tag"); if (hdrTag) hdrTag.outerHTML = stTag(o.status);
    var items = (o.items || []).map(function (it) {
      return '<div class="orow"><div class="omain"><b>' + esc(EN ? (it.nameEn || it.nameZh) : (it.nameZh || it.nameEn)) + '</b><span class="sub">' + esc([it.code, it.schoolAbbr || it.schoolName, side(it.classType), side(it.language), (it.grades || []).join("/")].filter(Boolean).join(" · ")) + "</span></div><div class=\"oprice\">" + (it.priceTbd ? '<span class="muted">' + t("价格待定", "Price TBD") + "</span>" : money(it.price, o.currency)) + "</div></div>";
    }).join("");
    var hist = (o.history || []).slice().reverse().map(function (h) {
      return '<div class="hrow"><span class="hat">' + esc(when(h.at)) + '<span class="hwho">' + esc(h.by === "system" ? t("系统", "system") : h.by) + "</span></span><span>" + (h.from ? stTag(h.from) + " → " : "") + stTag(h.to) + (h.note ? '<span class="hnote">' + esc(h.note) + "</span>" : "") + "</span></div>";
    }).join("");
    var notify = o.notify || {};
    var notifyLine = notify.pending ? '<span class="tag">' + t("通知发送中", "Notifying…") + "</span>" : notify.ok ? '<span class="tag ok">' + t("已通知", "Notified") + "</span> " + esc(when(notify.at)) : '<span class="tag bad">' + t("通知失败", "Notification failed") + "</span> " + esc(notify.error || "") + " · " + t("请手动联系家长和蜂巢。", "Contact the family and the hive by hand.");
    pb.innerHTML =
      '<div class="kv"><span class="k">' + t("提交时间", "Submitted") + "</span><span>" + esc(when(o.submittedAt)) + "</span>" +
        '<span class="k">' + t("下单人", "Email") + "</span><span>" + esc(o.email || "—") + "</span>" +
        (o.teamsAccount ? '<span class="k">Teams</span><span>' + esc(o.teamsAccount) + "</span>" : "") +
        '<span class="k">' + t("蜂巢", "Hive") + "</span><span>" + ((o.hives || []).length ? (o.hives || []).map(function (h) { return esc(h.name || h.abbr || h.key) + (h.subtotal != null ? " · " + money(h.subtotal, o.currency) : ""); }).join("; ") : esc(orderHives(o))) + "</span>" +
        (o.track && (o.track.nameZh || o.track.nameEn) ? '<span class="k">' + t("毕业路径", "Track") + "</span><span>" + esc(EN ? (o.track.nameEn || o.track.nameZh) : (o.track.nameZh || o.track.nameEn)) + "</span>" : "") +
        '<span class="k">' + t("语言", "Language") + "</span><span>" + (o.lang === "en" ? "English" : "中文") + "</span>" +
        '<span class="k">' + t("通知", "Notification") + "</span><span>" + notifyLine + "</span>" +
        (o.overdue ? '<span class="k">' + t("提醒", "Flag") + "</span><span>" + overdueTag(o) + "</span>" : "") + "</div>" +
      "<h4>" + t("课程", "Courses") + " · " + (o.itemCount || (o.items || []).length) + '</h4><div class="olist">' + items + '</div><div class="ototal">' + t("合计", "Total") + " " + money(o.totalPrice, o.currency) + "</div>" +
      (next.length ? "<h4>" + t("推进状态", "Move on") + '</h4><label class="f">' + t("备注（可选）", "Note (optional)") + '<input type="text" id="oNote" maxlength="500" placeholder="' + t("例如：提供方已接单；家长已转账", "e.g. provider accepted; parent has paid") + '" /></label>' +
        '<div class="actions">' + next.map(function (s) { return '<button class="btn' + (s === "cancelled" ? " danger" : s === "submitted" ? " secondary" : "") + '" type="button" data-to="' + s + '">' + esc(t(ORDER_VERB[s][0], ORDER_VERB[s][1])) + "</button>"; }).join("") + '</div><div id="oMsg"></div>' : "") +
      "<h4>" + t("执行记录", "Fulfilment record") + '</h4><div class="hist">' + hist + "</div>";
    pb.querySelectorAll("button[data-to]").forEach(function (b) {
      b.addEventListener("click", function () {
        var to = b.getAttribute("data-to");
        if (to === "cancelled" && !window.confirm(t("取消订单 " + o.orderId + "？", "Cancel order " + o.orderId + "?"))) return;
        savingButton(b);
        post("crm/order", "PATCH", { orderId: o.orderId, status: to, note: $("oNote").value.trim() }).then(function (r) {
          if (!r.ok) {
            restoreButton(b);
            $("oMsg").innerHTML = '<div class="msg err">' + esc(r.body && r.body.error === "changed_meanwhile" ? t("别人刚改过这单，已重新载入。", "Someone else just changed this order; reloaded.") : errText(r)) + "</div>";
            if (r.body && r.body.error === "changed_meanwhile") loadOrders(true).then(function () { renderOrders(); openOrderPanel(o.orderId); });
            return;
          }
          var upd = r.body.order;
          ordersState.list = (ordersState.list || []).map(function (x) { return x.orderId === upd.orderId ? upd : x; });
          loadOrders(true).then(renderOrders);
          drawOrderPanel(upd, r.body.next || []);
          flashOk("<b>" + esc(upd.orderId) + "</b> → " + stTag(upd.status));
        });
      });
    });
  }

  // 教材订单: the Equip (EquipMe) textbook orders, read from Airtable by the nightly sync
  // (api/shared/equip.js). Airtable stays the place they are entered; this is a view.
  // ================================================================================
  // Charts (inline SVG, no library). Rules followed: thin marks with rounded data
  // ends, 2px lines, >=8px markers with a surface ring, hairline grid, categorical
  // hues in a fixed order (validated: blue/orange/aqua/yellow pass CVD and the
  // normal-vision floor with direct labels), sequential = one hue, text never in
  // the series colour, a legend for >=2 series, hover tooltip on every mark, and a
  // table view behind every chart (图 / 表).
  // ================================================================================
  var VIZ = { cat: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"], seq: "#1d4a83", seq2: "#7fa9dc", seq3: "#cfe0f5", gray: "#b8c0cc", grid: "#e9edf3", ink: "#1b2430", muted: "#6b7787" };
  var vizDraws = [];
  function fmtNum(v) { return v == null ? "" : Math.round(v).toLocaleString(EN ? "en-US" : "zh-CN"); }
  function fmtMoney(v) { return v == null ? "" : "¥" + Math.round(v).toLocaleString(EN ? "en-US" : "zh-CN"); }
  function fmtCompact(v) { if (v == null) return ""; var a = Math.abs(v); return a >= 1e6 ? (v / 1e6).toFixed(1).replace(/\.0$/, "") + "M" : a >= 1e4 ? (v / 1e3).toFixed(0) + "K" : a >= 1e3 ? (v / 1e3).toFixed(1).replace(/\.0$/, "") + "K" : String(Math.round(v)); }
  function niceMax(v) { if (!v || v <= 0) return 1; var p = Math.pow(10, Math.floor(Math.log10(v))); var m = v / p; var n = m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10; return n * p; }
  // Gridlines: four steps, or one per unit when the top is a small count (no "1, 1, 1, 0, 0").
  function ticks(max) { var n = max < 4 ? Math.max(1, Math.round(max)) : 4; var out = []; for (var k = 0; k <= n; k++) out.push(max * k / n); return out; }
  // A category label cut to fit a pixel width (CJK glyphs count double), with the full text in a <title>.
  function fitLabel(label, px) {
    var w = 0, out = "";
    for (var i = 0; i < label.length; i++) { var cw = /[\u2e80-\u9fff\uf900-\ufaff\uff00-\uffef]/.test(label[i]) ? 12 : 6.6; if (w + cw > px - 8) return out + "…"; w += cw; out += label[i]; }
    return out;
  }
  function tipAttr(html) { return ' data-tip="' + esc(html) + '"'; }
  function tipRow(color, label, value, isLine) { return '<div class="tr"><span class="key" style="' + (isLine ? "border-top:2px solid " + color + ";height:0" : "background:" + color) + '"></span><b>' + esc(value) + "</b><span>" + esc(label) + "</span></div>"; }

  // A card with the chart drawn once its width is known (and again on resize).
  function chartCard(id, title, sub, draw, tableHtml) {
    vizDraws.push({ id: id, draw: draw });
    return '<div class="card viz" id="' + id + '"><div class="ch"><h2>' + esc(title) + (sub ? ' <span class="n">' + esc(sub) + "</span>" : "") + '</h2><div class="vtools"><div class="vtoggle" role="tablist"><button type="button" class="on" data-v="chart">' + t("图", "Chart") + '</button><button type="button" data-v="table">' + t("表", "Table") + '</button></div><button type="button" class="vfull" data-full="1" title="' + esc(t("全屏", "Full screen")) + '" aria-label="' + esc(t("全屏", "Full screen")) + '">⤢</button></div></div>' +
      '<div class="vbody"></div><div class="vtable hidden">' + tableHtml + "</div></div>";
  }
  // Full screen for one card (design §5 panel actions): the card lifts over the page,
  // its chart redrawn at the new width; ⤢ again or Esc puts it back.
  function cardFull(card, on) {
    document.querySelectorAll(".card.full").forEach(function (c) { if (c !== card) { c.classList.remove("full"); } });
    card.classList.toggle("full", on);
    document.body.classList.toggle("has-full", !!document.querySelector(".card.full"));
    var d = vizDraws.filter(function (x) { return x.id === card.id; })[0];
    if (d) { var body = card.querySelector(".vbody"); if (body && body.clientWidth) body.innerHTML = d.draw(body.clientWidth); }
  }
  $("content").addEventListener("click", function (e) {
    var b = e.target.closest("button.vfull"); if (!b) return;
    var card = b.closest(".card"); cardFull(card, !card.classList.contains("full"));
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") { var c = document.querySelector(".card.full"); if (c) cardFull(c, false); } });
  function drawCharts() {
    vizDraws = vizDraws.filter(function (d) { return $(d.id); });
    vizDraws.forEach(function (d) { var body = $(d.id).querySelector(".vbody"); var w = body.clientWidth; if (w > 0) body.innerHTML = d.draw(w); });
  }
  window.addEventListener("resize", debounce(drawCharts, 150));
  $("content").addEventListener("click", function (e) {
    var b = e.target.closest(".vtoggle button[data-v]"); if (!b) return;
    var card = b.closest(".card"); card.querySelectorAll(".vtoggle button[data-v]").forEach(function (x) { x.classList.toggle("on", x === b); });
    card.querySelector(".vbody").classList.toggle("hidden", b.getAttribute("data-v") !== "chart");
    card.querySelector(".vtable").classList.toggle("hidden", b.getAttribute("data-v") !== "table");
  });
  // One tooltip for every mark: data-tip carries ready HTML built with esc() above.
  var tip = document.createElement("div"); tip.className = "viztip"; tip.hidden = true; document.body.appendChild(tip);
  $("content").addEventListener("mousemove", function (e) {
    var m = e.target.closest("[data-tip]");
    if (!m) { tip.hidden = true; return; }
    tip.innerHTML = m.getAttribute("data-tip"); tip.hidden = false;
    var x = e.clientX + 14, y = e.clientY + 14;
    if (x + tip.offsetWidth > window.innerWidth - 8) x = e.clientX - tip.offsetWidth - 14;
    if (y + tip.offsetHeight > window.innerHeight - 8) y = e.clientY - tip.offsetHeight - 14;
    tip.style.left = x + "px"; tip.style.top = y + "px";
  });
  $("content").addEventListener("mouseleave", function () { tip.hidden = true; });

  function legend(series, isLine) {
    return '<div class="vlegend">' + series.map(function (s) { return '<span><i style="' + (isLine ? "border-top:2px solid " + s.color + ";height:0;width:14px" : "background:" + s.color) + '"></i>' + esc(s.name) + "</span>"; }).join("") + "</div>";
  }
  function dataTable(head, rows) {
    // Its own table class: a chart's table is compact, numbers right-aligned, and must not pick
    // up the data-table behaviours (sticky headings, draggable columns) that broke it in a card.
    return '<table class="vt"><thead><tr>' + head.map(function (h, i) { return '<th class="' + (i ? "num" : "") + '">' + esc(h) + "</th>"; }).join("") + "</tr></thead><tbody>" + rows.map(function (r) { return "<tr>" + r.map(function (c, i) { return '<td class="' + (i ? "num" : "") + '">' + esc(c) + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table>";
  }

  // Lines over categories (months). series: [{name, values, color, dash}]. fmt for tooltip/labels.
  function linesChart(w, o) {
    var h = o.height || 220, pl = 44, pr = 56, pt = 12, pb = 26, iw = Math.max(50, w - pl - pr), ih = h - pt - pb;
    var n = o.x.length, max = niceMax(Math.max.apply(null, o.series.map(function (s) { return Math.max.apply(null, s.values.map(function (v) { return v || 0; })); }).concat([0])));
    var X = function (i) { return pl + (n > 1 ? (i / (n - 1)) * iw : iw / 2); }, Y = function (v) { return pt + ih - (Math.max(0, v || 0) / max) * ih; };
    var g = "";
    ticks(max).forEach(function (tv) { var yy = Y(tv); g += '<line x1="' + pl + '" x2="' + (pl + iw) + '" y1="' + yy + '" y2="' + yy + '" stroke="' + VIZ.grid + '"/><text x="' + (pl - 8) + '" y="' + (yy + 4) + '" text-anchor="end" class="tk">' + fmtCompact(tv) + "</text>"; });
    var step = Math.ceil(n / Math.max(1, Math.floor(iw / 56)));
    o.x.forEach(function (lab, i) { if (i % step === 0 || i === n - 1) g += '<text x="' + X(i) + '" y="' + (h - 8) + '" text-anchor="middle" class="tk">' + esc(lab) + "</text>"; });
    // null = no value yet (a future month): the line stops there and the end label sits on the last real point.
    var paths = o.series.map(function (s) {
      var d = "", pen = false;
      s.values.forEach(function (v, i) { if (v == null) { pen = false; return; } d += (pen ? "L" : "M") + X(i).toFixed(1) + " " + Y(v).toFixed(1) + " "; pen = true; });
      var last = -1; s.values.forEach(function (v, i) { if (v != null) last = i; });
      if (last < 0) return "";
      return '<path d="' + d + '" fill="none" stroke="' + s.color + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"' + (s.dash ? ' stroke-dasharray="4 3"' : "") + "/>" +
        '<circle cx="' + X(last) + '" cy="' + Y(s.values[last]) + '" r="4" fill="' + s.color + '" stroke="#fff" stroke-width="2"/>' +
        '<text x="' + (X(last) + 8) + '" y="' + (Y(s.values[last]) + 4) + '" class="lbl">' + esc(o.fmt(s.values[last])) + "</text>";
    }).join("");
    // crosshair hit columns: one tooltip listing every series at that x
    var hits = o.x.map(function (lab, i) {
      var html = '<div class="th">' + esc(lab) + "</div>" + o.series.map(function (s) { return tipRow(s.color, s.name, s.values[i] == null ? "—" : o.fmt(s.values[i]), true); }).join("");
      var x0 = i ? (X(i - 1) + X(i)) / 2 : pl, x1 = i < n - 1 ? (X(i) + X(i + 1)) / 2 : pl + iw;
      return '<g class="hit"' + tipAttr(html) + '><rect x="' + x0 + '" y="' + pt + '" width="' + Math.max(1, x1 - x0) + '" height="' + ih + '" fill="transparent"/><line class="xh" x1="' + X(i) + '" x2="' + X(i) + '" y1="' + pt + '" y2="' + (pt + ih) + '" stroke="' + VIZ.muted + '"/>' + o.series.map(function (s) { return s.values[i] == null ? "" : '<circle class="xh" cx="' + X(i) + '" cy="' + Y(s.values[i]) + '" r="4" fill="' + s.color + '" stroke="#fff" stroke-width="2"/>'; }).join("") + "</g>";
    }).join("");
    return (o.series.length > 1 ? legend(o.series, true) : "") + '<svg class="viz-svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + " " + h + '">' + g + paths + hits + "</svg>";
  }

  // Columns per category, optionally stacked. series: [{name, values, color}].
  function columnsChart(w, o) {
    var h = o.height || 220, pl = 44, pr = 12, pt = 16, pb = 26, iw = Math.max(50, w - pl - pr), ih = h - pt - pb;
    var n = o.x.length, totals = o.x.map(function (_, i) { return o.series.reduce(function (a, s) { return a + (s.values[i] || 0); }, 0); });
    var max = niceMax(Math.max.apply(null, totals.concat([0])));
    var band = iw / n, bw = Math.min(24, band * 0.6), Y = function (v) { return (v / max) * ih; };
    var g = "";
    ticks(max).forEach(function (tv) { var yy = pt + ih - Y(tv); g += '<line x1="' + pl + '" x2="' + (pl + iw) + '" y1="' + yy + '" y2="' + yy + '" stroke="' + VIZ.grid + '"/><text x="' + (pl - 8) + '" y="' + (yy + 4) + '" text-anchor="end" class="tk">' + fmtCompact(tv) + "</text>"; });
    var step = Math.ceil(n / Math.max(1, Math.floor(iw / 48)));
    var bars = o.x.map(function (lab, i) {
      var x = pl + band * i + (band - bw) / 2, y = pt + ih, out = "";
      var html = '<div class="th">' + esc(lab) + "</div>" + o.series.map(function (s) { return tipRow(s.color, s.name, o.fmt(s.values[i])); }).join("") + (o.series.length > 1 ? tipRow("transparent", t("合计", "Total"), o.fmt(totals[i])) : "");
      o.series.forEach(function (s, si) {
        var v = s.values[i] || 0, hh = Y(v); if (!hh) return;
        var top = si === o.series.length - 1 || o.series.slice(si + 1).every(function (z) { return !(z.values[i] || 0); });
        y -= hh;
        out += top ? '<path d="M' + x + " " + (y + hh) + "V" + (y + 4) + "q0 -4 4 -4h" + (bw - 8) + "q4 0 4 4V" + (y + hh) + 'Z" fill="' + s.color + '"/>' : '<rect x="' + x + '" y="' + y + '" width="' + bw + '" height="' + Math.max(0, hh - 2) + '" fill="' + s.color + '"/>';
      });
      if (totals[i] && (o.labelAll || i === n - 1 || totals[i] === Math.max.apply(null, totals))) out += '<text x="' + (x + bw / 2) + '" y="' + (y - 5) + '" text-anchor="middle" class="lbl">' + esc(o.fmt(totals[i])) + "</text>";
      if (i % step === 0 || i === n - 1) out += '<text x="' + (x + bw / 2) + '" y="' + (h - 8) + '" text-anchor="middle" class="tk">' + esc(lab) + "</text>";
      return '<g class="hit"' + tipAttr(html) + '><rect x="' + (pl + band * i) + '" y="' + pt + '" width="' + band + '" height="' + ih + '" fill="transparent"/>' + out + "</g>";
    }).join("");
    return (o.series.length > 1 ? legend(o.series) : "") + '<svg class="viz-svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + " " + h + '">' + g + bars + "</svg>";
  }

  // Horizontal bars, one hue, value at the tip. rows: [{label, value, sub}].
  function barsChart(w, o) {
    var rowH = 30, pl = Math.min(170, Math.max(90, w * 0.32)), pr = 64, n = o.rows.length, h = n * rowH + 8;
    var iw = Math.max(40, w - pl - pr), max = Math.max.apply(null, o.rows.map(function (r) { return r.value || 0; }).concat([1]));
    var bars = o.rows.map(function (r, i) {
      var y = 4 + i * rowH, bw = Math.max(0, (r.value || 0) / max * iw), color = r.color || o.color || VIZ.seq;
      var html = '<div class="th">' + esc(r.label) + "</div>" + tipRow(color, r.sub || o.name || "", o.fmt(r.value));
      return '<g class="hit"' + tipAttr(html) + '><rect x="0" y="' + y + '" width="' + w + '" height="' + rowH + '" fill="transparent"/>' +
        '<text x="' + (pl - 10) + '" y="' + (y + rowH / 2 + 4) + '" text-anchor="end" class="cat"><title>' + esc(r.label) + "</title>" + esc(fitLabel(r.label, pl - 10)) + "</text>" +
        (bw ? '<path d="M' + pl + " " + (y + 5) + "h" + Math.max(0, bw - 4) + "q4 0 4 4v" + (rowH - 18) + "q0 4 -4 4H" + pl + 'Z" fill="' + color + '"/>' : "") +
        '<text x="' + (pl + bw + 8) + '" y="' + (y + rowH / 2 + 4) + '" class="lbl">' + esc(o.fmt(r.value)) + "</text></g>";
    }).join("");
    return '<svg class="viz-svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + " " + h + '">' + bars + "</svg>";
  }

  // A stat tile with an optional delta and sparkline (12 points, last one in the accent).
  function statTile(label, value, opts) {
    opts = opts || {};
    var delta = "";
    if (typeof opts.delta === "number" && isFinite(opts.delta)) { var up = opts.delta >= 0, good = opts.upIsGood === false ? !up : up; delta = '<span class="delta ' + (good ? "good" : "bad") + '">' + (up ? "▲" : "▼") + " " + Math.abs(Math.round(opts.delta * 100)) + "%</span>" + (opts.vs ? '<span class="vs">' + esc(opts.vs) + "</span>" : ""); }
    var spark = "";
    if (opts.spark && opts.spark.length > 1) {
      var vals = opts.spark, w = 96, h = 28, max = Math.max.apply(null, vals.concat([1]));
      var pts = vals.map(function (v, i) { return [(i / (vals.length - 1)) * (w - 4) + 2, h - 3 - ((v || 0) / max) * (h - 8)]; });
      spark = '<svg class="spark" viewBox="0 0 ' + w + " " + h + '" preserveAspectRatio="xMaxYMax meet"><path d="' + pts.map(function (p, i) { return (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1); }).join(" ") + '" fill="none" stroke="' + VIZ.gray + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/><circle cx="' + pts[pts.length - 1][0] + '" cy="' + pts[pts.length - 1][1] + '" r="3.5" fill="' + VIZ.seq + '" stroke="#fff" stroke-width="2"/></svg>';
    }
    return '<div class="kpi stat' + (opts.cls ? " " + opts.cls : "") + '"' + (opts.attr || "") + '><div class="l">' + esc(label) + '</div><div class="vrow"><div class="v' + (opts.warn ? " warn" : "") + '">' + value + "</div>" + spark + "</div>" + (delta || opts.sub ? '<div class="s">' + delta + (opts.sub ? '<span>' + esc(opts.sub) + "</span>" : "") + "</div>" : "") + "</div>";
  }
  // A one-row stacked bar of shares with direct labels under it (part-to-whole).
  function shareBar(parts, total) {
    total = total || parts.reduce(function (a, p) { return a + p.value; }, 0) || 1;
    return '<div class="sharebar">' + parts.map(function (p) { return '<i style="width:' + (p.value / total * 100) + "%;background:" + p.color + '"' + tipAttr('<div class="th">' + esc(p.label) + "</div>" + tipRow(p.color, "", fmtNum(p.value) + " · " + Math.round(p.value / total * 100) + "%")) + "></i>"; }).join("") + "</div>" +
      '<div class="sharekeys">' + parts.map(function (p) { return '<span><i style="background:' + p.color + '"></i>' + esc(p.label) + ' <b>' + fmtNum(p.value) + "</b></span>"; }).join("") + "</div>";
  }
  var equipState = { list: null, status: null, month: "" };
  var AIRTABLE_EQUIP_URL = "https://airtable.com/appae5kpY1qXn6XLq";
  // Equip教材订单: the orders themselves live in Airtable; this tab is the sales
  // picture Airtable does not draw (Rick, 2026-10-08: 「Need all kinds of reports,
  // diagrams」 / 「It's a CRM system, not an engineering system」): the month, the
  // school year against the last one, publishers, titles, subjects, grade bands,
  // new and returning customers. Money only for roles that may see it; others get
  // units and orders.
  function viewEquipOrders() {
    var canSync = isAdmin() || crmLevel("orders") === "rw";
    setTitle(t("经营 › 订单", "Operations › Orders"), t("Equip教材订单", "Equip textbook orders"),
      (crmLevel("orders") === "rw" ? '<button class="btn sm" id="eEntry">' + t("＋ 录入订单", "+ New order") + "</button> " : "") +
      (canSync ? '<button class="btn secondary sm" id="eSync">' + t("从 Airtable 同步", "Sync from Airtable") + "</button> " : "") +
      '<a class="btn secondary sm" id="eOpen" href="' + AIRTABLE_EQUIP_URL + '" target="_blank" rel="noopener">' + t("在 Airtable 中打开", "Open in Airtable") + ' ↗</a>',
      { info: t("EquipMe 教材的销售情况：所选月、本学年与上学年、出版社、教材、学科、年级段、新老客户。逐单查看与录入在 Airtable；管理中心每夜同步一份只读副本。", "How EquipMe textbooks are selling: the chosen month, this school year against the last, publishers, titles, subjects, grade bands, new and returning customers. Individual orders are viewed and entered in Airtable; the management centre syncs a read-only copy nightly.") });
    $("opsBody").innerHTML = '<div class="toolbar" id="ebar"><label class="inline">' + t("月份", "Month") + ' <select id="emonth"></select></label><span class="muted" style="font-size:12px">' + t("指标与图表都以所选月为准；学年按所选月所在学年", "Tiles and charts follow the chosen month; the school year is the one it falls in") + '</span></div><div class="kpis" id="ekpi"></div><div class="vgrid" id="evgrid"><p class="loading">' + t("载入中…", "Loading…") + '</p></div><p class="muted" id="efoot" style="font-size:.8rem"></p>';
    $("emonth").addEventListener("change", function () { equipState.month = this.value; renderEquip(); });
    var sb = $("eSync");
    if (sb) sb.addEventListener("click", function () {
      savingButton(sb, t("同步中…", "Syncing…"));
      post("crm/sync", "POST", {}).then(function (r) {
        restoreButton(sb);
        if (!r.ok) { flash(r.body && r.body.error === "no_pat" ? t("还没有配置 Airtable 令牌（AIRTABLE_EQUIP_PAT）。", "The Airtable token (AIRTABLE_EQUIP_PAT) is not configured yet.") : r.body && r.body.error === "bad_pat" ? esc(r.body.message) : esc(errText(r)), 20000); return; }
        var st = (r.body && r.body.status) || {}, c = st.counts || {}, ppl = r.body && r.body.people;
        var summary = t("同步完成：", "Sync complete: ") + (c.orders || 0) + t(" 单订单、", " orders, ") + (c.items || 0) + t(" 条明细、", " line items, ") + (c.customers || 0) + t(" 位客户、", " customers, ") + (c.curriculums || 0) + t(" 条教材、", " textbooks, ") + (c.seminar || 0) + t(" 条讲座名单", " seminar rows") +
          (ppl ? t("；人员库 ", "; people hub ") + ppl.people + t(" 人", " people") : "");
        flashOk(esc(summary) + ((st.warnings || []).length ? " · " + esc(t("提示 " + st.warnings.length + " 条，见页脚", st.warnings.length + " notes, see the page footer")) : ""), 8000);
        peopleState.hub = null;
        loadEquip(true).then(renderEquip);
      });
    });
    var eb = $("eEntry"); if (eb) eb.addEventListener("click", openEntryPanel);
    loadEquip(false).then(renderEquip).catch(function (r) { $("evgrid").innerHTML = '<p class="msg err">' + esc(errText(r)) + "</p>"; });
  }
  // ---- 录入 (phase 4, §8: 建客户、建订单、加订单行、标收款 — written to Airtable, which stays the
  // system of record; the copy here and the people hub follow at once).
  var entryCat = null;
  function loadCatalogue() { if (entryCat) return Promise.resolve(entryCat); return api("crm/catalogue").then(function (r) { if (!r.ok) throw r; entryCat = r.body.skus || []; return entryCat; }); }
  function openEntryPanel() {
    var today = new Date().toISOString().slice(0, 10);
    panelOpen('<div class="ph"><h3>' + t("录入教材订单", "New textbook order") + '</h3><span class="tag">Airtable</span><button class="x" type="button" aria-label="close">✕</button></div><div class="pb"><form id="enf">' +
      "<h4>" + t("客户", "Customer") + '</h4><div class="search" style="margin-bottom:6px">' + ICON.search + '<input type="search" id="enQ" autocomplete="off" placeholder="' + t("搜索已有客户：姓名、邮箱、CRM ID", "Find an existing customer: name, email, CRM ID") + '" /></div><div id="enHits" class="olist hidden"></div>' +
      '<div id="enPicked" class="hint hidden"></div>' +
      '<label class="chk"><input type="checkbox" id="enNew" /> ' + t("新客户（Airtable 里还没有）", "New customer (not in Airtable yet)") + "</label>" +
      '<div id="enNewF" class="grid2 hidden"><label class="f">' + t("名", "Given name") + '<input type="text" id="enFirst" maxlength="60" /></label><label class="f">' + t("姓", "Surname") + '<input type="text" id="enLast" maxlength="60" /></label><label class="f">' + t("邮箱", "Email") + '<input type="email" id="enEmail" /></label><label class="f">' + t("Teams 账号", "Teams account") + '<input type="email" id="enTeams" placeholder="name@equipme.cloud" /></label><label class="f">' + t("城市", "City") + '<input type="text" id="enCity" maxlength="40" /></label></div>' +
      "<h4>" + t("订单", "Order") + '</h4><div class="grid2"><label class="f">' + t("下单日期", "Order date") + '<input type="date" id="enDate" value="' + today + '" required /></label><label class="f">' + t("已收金额（可空）", "Received (optional)") + '<input type="number" id="enRecv" min="0" step="0.01" /></label></div>' +
      '<label class="f">' + t("备注", "Comments") + '<input type="text" id="enNote" maxlength="500" /></label>' +
      "<h4>" + t("教材", "Items") + '</h4><div id="enLines"></div><button type="button" class="btn secondary sm" id="enAdd">' + t("＋ 加一行", "+ Add a line") + '</button><div class="kv" style="margin-top:8px"><span class="k">' + t("合计", "Total") + '</span><span id="enTotal">¥0</span></div>' +
      '<div class="actions"><button class="btn" type="submit" id="enSave">' + t("写入 Airtable", "Write to Airtable") + '</button><span class="muted" style="font-size:12px">' + t("写入后会立刻同步并重建人员库", "Then synced here and the people hub rebuilt") + '</span></div><div id="enMsg"></div></form></div>');
    var picked = null;
    var people = ((peopleState.hub || {}).people || []).filter(function (p) { return p.sources && p.sources.customer; });
    if (!people.length) loadPeople(false).then(function () { people = ((peopleState.hub || {}).people || []).filter(function (p) { return p.sources && p.sources.customer; }); }).catch(function () {});
    $("enQ").addEventListener("input", debounce(function () {
      var q = $("enQ").value.trim().toLowerCase(), box = $("enHits");
      if (!q) { box.classList.add("hidden"); return; }
      var hits = people.filter(function (p) { return [p.name, p.primaryEmail, p.crmId].concat((p.emails || []).map(function (e) { return e.email; })).join(" ").toLowerCase().indexOf(q) >= 0; }).slice(0, 8);
      box.innerHTML = hits.length ? hits.map(function (p) { var c = p.facets.customers[0] || {}; return '<button type="button" class="orow link" data-pick="' + esc(c.recId) + '" data-name="' + esc(p.name) + '"><div class="omain"><b>' + esc(p.name) + '</b><span class="sub">' + esc([p.primaryEmail, p.crmId].filter(Boolean).join(" · ")) + "</span></div></button>"; }).join("") : '<div class="orow muted">' + t("没有匹配的客户；勾选「新客户」。", "No match; tick “New customer”.") + "</div>";
      box.classList.remove("hidden");
    }, 120));
    $("enHits").addEventListener("click", function (e) { var b = e.target.closest("button[data-pick]"); if (!b) return; picked = { recId: b.getAttribute("data-pick"), name: b.getAttribute("data-name") }; $("enPicked").innerHTML = esc(t("已选客户：", "Customer: ") + picked.name); $("enPicked").classList.remove("hidden"); $("enHits").classList.add("hidden"); $("enQ").value = picked.name; $("enNew").checked = false; $("enNewF").classList.add("hidden"); });
    $("enNew").addEventListener("change", function () { $("enNewF").classList.toggle("hidden", !this.checked); if (this.checked) { picked = null; $("enPicked").classList.add("hidden"); } });
    var lines = 0;
    function addLine() {
      lines++;
      $("enLines").insertAdjacentHTML("beforeend", '<div class="enl grid3" data-l="' + lines + '"><label class="f">SKU<select class="enSku" required><option value="">' + t("选择教材…", "Choose…") + "</option>" + entryCat.filter(function (k) { return k.available; }).map(function (k) { return '<option value="' + esc(k.sku) + '" data-price="' + (k.price == null ? "" : k.price) + '">' + esc(k.sku + " · " + (EN ? (k.nameEn || k.nameZh) : (k.nameZh || k.nameEn))) + "</option>"; }).join("") + '</select></label><label class="f">' + t("数量", "Qty") + '<input type="number" class="enQty" min="1" step="1" value="1" required /></label><label class="f">' + t("单价", "Unit price") + '<input type="number" class="enUnit" min="0" step="0.01" /></label></div>');
    }
    function total() { var sum = 0; document.querySelectorAll("#enLines .enl").forEach(function (l) { var q = +l.querySelector(".enQty").value || 0, u = l.querySelector(".enUnit").value, sel = l.querySelector(".enSku"), dp = sel.selectedOptions[0] && sel.selectedOptions[0].getAttribute("data-price"); sum += q * (u !== "" ? +u : (dp ? +dp : 0)); }); $("enTotal").textContent = fmtMoney(sum); }
    loadCatalogue().then(function () { addLine(); }).catch(function (r) { $("enMsg").innerHTML = '<div class="msg err">' + esc(errText(r)) + "</div>"; });
    $("enAdd").addEventListener("click", addLine);
    $("enLines").addEventListener("change", function (e) { var sel = e.target.closest(".enSku"); if (sel) { var u = sel.closest(".enl").querySelector(".enUnit"), dp = sel.selectedOptions[0] && sel.selectedOptions[0].getAttribute("data-price"); if (!u.value && dp) u.value = dp; } total(); });
    $("enLines").addEventListener("input", total);
    $("enf").addEventListener("submit", function (e) {
      e.preventDefault();
      var items = Array.prototype.map.call(document.querySelectorAll("#enLines .enl"), function (l) { var u = l.querySelector(".enUnit").value; return { sku: l.querySelector(".enSku").value, qty: +l.querySelector(".enQty").value, unitPrice: u === "" ? null : +u }; }).filter(function (it) { return it.sku; });
      var customer = $("enNew").checked ? { new: { first: $("enFirst").value.trim(), last: $("enLast").value.trim(), email: $("enEmail").value.trim(), teams: $("enTeams").value.trim(), city: $("enCity").value.trim() } } : picked ? { recId: picked.recId } : null;
      if (!customer) { $("enMsg").innerHTML = '<div class="msg err">' + t("请先选择客户或勾选「新客户」。", "Choose a customer or tick “New customer”.") + "</div>"; return; }
      if (!items.length) { $("enMsg").innerHTML = '<div class="msg err">' + t("至少一行教材。", "At least one item.") + "</div>"; return; }
      var b = $("enSave"); savingButton(b, t("写入中…", "Writing…"));
      var recv = $("enRecv").value;
      post("crm/entry", "POST", { customer: customer, date: $("enDate").value, comments: $("enNote").value.trim(), received: recv === "" ? undefined : +recv, items: items }).then(function (r) {
        restoreButton(b);
        if (!r.ok) { $("enMsg").innerHTML = '<div class="msg err">' + esc((r.body && r.body.message) || errText(r)) + "</div>"; return; }
        equipState.list = null; peopleState.hub = null; entryCat = null;
        savedAndClose(null, t("已写入 Airtable：订单 ", "Written to Airtable: order ") + "<b>" + esc(r.body.orderId) + "</b>" + t("，" + r.body.lines + " 行", ", " + r.body.lines + " lines") + (r.body.newCustomer ? t("，新客户已建", ", new customer created") : "") + "。");
        if ($("evgrid")) loadEquip(true).then(renderEquip);
      });
    });
  }
  function loadEquip(force) {
    if (equipState.list && !force) return Promise.resolve(equipState.list);
    return api("crm/equip-orders").then(function (r) {
      if (!r.ok) throw r;
      equipState.list = r.body.orders || []; equipState.status = r.body.status || {};
      return equipState.list;
    });
  }
  function equipName(it) { return (EN ? (it.nameEn || it.nameZh) : (it.nameZh || it.nameEn)) || it.sku || ""; }
  // One Equip order with its purchased items (Rick, 2026-10-08: 「could order ID be
  // clickable? It will display order details with purchased items」). Read-only.
  function openEquipOrderPanel(recId, which) {
    var o = (equipState.list || []).filter(function (x) { return x.recId === recId; })[0];
    if (!o) return;
    var items = (o.items || []).map(function (it) {
      var roy = it.royalty && Object.keys(it.royalty).length ? '<span class="sub">' + esc(Object.keys(it.royalty).map(function (k) { var v = it.royalty[k]; return k + " " + (typeof v === "number" && v <= 1 && /rate/i.test(k) ? Math.round(v * 100) + "%" : v); }).join(" · ")) + "</span>" : "";
      return '<div class="orow"><div class="omain"><b>' + esc(equipName(it)) + '</b><span class="sub">' + esc([it.sku, it.publisher, it.category, it.subject, it.grade].filter(Boolean).join(" · ")) + "</span>" + roy + '</div><div class="oprice">' + (it.qty || 0) + " × " + money(it.unitPrice, "CNY") + "<br><b>" + money(it.total, "CNY") + "</b></div></div>";
    }).join("");
    panelOpen('<div class="ph"><h3>' + esc(o.orderId) + '</h3><span class="tag">EquipMe</span><button class="x" type="button" aria-label="close">✕</button></div><div class="pb">' +
      '<div class="kv"><span class="k">' + t("日期", "Date") + "</span><span>" + esc(o.date || "") + "</span>" +
        '<span class="k">' + t("客户", "Customer") + "</span><span>" + esc(o.name || "—") + "</span>" +
        '<span class="k">' + t("邮箱", "Email") + "</span><span>" + esc(o.email || "—") + "</span>" +
        '<span class="k">' + t("金额 / 实收", "Amount / received") + "</span><span>" + money(o.amount, "CNY") + " / " + money(o.received, "CNY") + "</span>" +
        (o.comments ? '<span class="k">' + t("备注", "Comments") + "</span><span>" + esc(o.comments) + "</span>" : "") + "</div>" +
      "<h4>" + t("购买的教材", "Purchased items") + " · " + (o.items || []).length + '</h4><div class="olist">' + (items || '<div class="orow muted">' + t("没有订单明细。", "No line items.") + "</div>") + "</div>" +
      (crmLevel("orders") === "rw" || crmLevel("money") === "rw" ? '<h4>' + t("标收款", "Record cash received") + '</h4><div class="actions"><input type="number" id="eoRecv" min="0" step="0.01" value="' + (o.received == null ? "" : o.received) + '" style="width:140px" /><button type="button" class="btn secondary sm" id="eoRecvSave" data-rec="' + esc(o.recId) + '">' + t("保存到 Airtable", "Save to Airtable") + '</button></div><div id="eoMsg"></div>' : "") +
      '<p class="hint">' + t("订单内容在 Airtable 里改，下一次同步后生效。", "Change the order's contents in Airtable; the next sync picks it up.") + "</p></div>", which);
    var rb = $("eoRecvSave");
    if (rb) rb.addEventListener("click", function () {
      var v = $("eoRecv").value; if (v === "") return;
      savingButton(rb, t("保存中…", "Saving…"));
      post("crm/received", "POST", { recId: rb.getAttribute("data-rec"), received: +v }).then(function (r) {
        restoreButton(rb);
        if (!r.ok) { $("eoMsg").innerHTML = '<div class="msg err">' + esc((r.body && r.body.message) || errText(r)) + "</div>"; return; }
        o.received = +v; $("eoMsg").innerHTML = '<div class="msg ok">' + t("已记录实收 ", "Received recorded: ") + fmtMoney(+v) + "</div>";
        if ($("evgrid")) renderEquip();
      });
    });
  }
  function ym(d) { return String(d || "").slice(0, 7); }
  function monthLabel(m) { var p = m.split("-"); return EN ? ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][+p[1] - 1] + " " + p[0].slice(2) : +p[1] + "月"; }
  function addMonths(m, k) { var p = m.split("-"), d = new Date(Date.UTC(+p[0], +p[1] - 1 + k, 1)); return d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0"); }
  // School year starts in August (decision 7): "2026" = Aug 2026 – Jul 2027.
  function fyOf(m) { var p = m.split("-"); return +p[1] >= 8 ? +p[0] : +p[0] - 1; }
  function fyLabel(y) { return t(y + "–" + (y + 1) + " 学年", "SY " + y + "–" + (y + 1).toString().slice(2)); }
  var GRADE_BANDS = [["K–2", "K–2"], ["3–5", "3–5"], ["6–8", "6–8"], ["9–12", "9–12"], ["教师培训", "Teacher training"], ["未分类", "Unclassified"]];
  function gradeBand(grade) {
    var g = String(grade || "");
    if (!g) return 5;
    if (/teacher|教师|adult|成人|parent|家长/i.test(g)) return 4;
    if (/\bK\b|kinder|幼/i.test(g)) return 0;
    var m = /\d+/.exec(g); if (!m) return 5;
    var n = +m[0]; return n <= 2 ? 0 : n <= 5 ? 1 : n <= 8 ? 2 : n <= 12 ? 3 : 5;
  }
  function renderEquip() {
    var list = equipState.list || [], st = equipState.status || {}, c = st.counts || {};
    var seeMoney = crmLevel("money") !== "none";
    var fmt = seeMoney ? fmtMoney : fmtNum, measure = seeMoney ? t("销售额", "Sales") : t("件数", "Units");
    var val = function (o) { return seeMoney ? (o.amount || 0) : (o.qty || 0); };
    var now = new Date(), curM = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
    // The month picker (Rick, 2026-10-08: 「Should be able to choose month rather than only this
    // month」): every month from the first order to now, newest first; everything below follows it.
    var firstOrderM = list.map(function (o) { return ym(o.date); }).filter(Boolean).sort()[0] || curM;
    var sel = $("emonth");
    if (sel && sel.getAttribute("data-from") !== firstOrderM) {
      sel.innerHTML = ""; sel.setAttribute("data-from", firstOrderM);
      for (var mm = curM; mm >= firstOrderM; mm = addMonths(mm, -1)) { var op = document.createElement("option"); op.value = mm; op.textContent = (mm === curM ? t("本月 · ", "This month · ") : "") + mm; sel.appendChild(op); }
    }
    if (!equipState.month || equipState.month > curM) equipState.month = curM;
    if (sel) sel.value = equipState.month;
    var thisM = equipState.month, isCur = thisM === curM, mName = isCur ? t("本月", "This month") : thisM;
    var months = []; for (var i = 11; i >= 0; i--) months.push(addMonths(thisM, -i));
    var byM = {}; months.forEach(function (m) { byM[m] = { orders: 0, sales: 0, received: 0, units: 0, newC: 0, oldC: 0 }; });
    // first order month per customer, for new vs returning
    var firstM = {}; list.forEach(function (o) { var k = o.customerRec || o.email || o.name; var m = ym(o.date); if (k && m && (!firstM[k] || m < firstM[k])) firstM[k] = m; });
    var seenInM = {};
    list.forEach(function (o) {
      var m = ym(o.date); if (!byM[m]) return;
      var b = byM[m]; b.orders++; b.sales += o.amount || 0; b.received += o.received || 0; b.units += o.qty || 0;
      var k = o.customerRec || o.email || o.name; if (k && !seenInM[m + "|" + k]) { seenInM[m + "|" + k] = 1; if (firstM[k] === m) b.newC++; else b.oldC++; }
    });
    var cur = byM[thisM], prev = byM[addMonths(thisM, -1)] || { orders: 0, sales: 0, units: 0 };
    var pct = function (a, b) { return b ? (a - b) / b : null; };
    // school years: current and previous, cumulative Aug→Jul
    var fy = fyOf(thisM), fyMonths = []; for (var k = 0; k < 12; k++) fyMonths.push(addMonths(fy + "-08", k));
    var cum = function (y) { var acc = 0; return fyMonths.map(function (m, idx) { var mm = addMonths(y + "-08", idx); if (mm > thisM) return null; list.forEach(function (o) { if (ym(o.date) === mm) acc += val(o); }); return acc; }); };
    var cumCur = cum(fy), cumPrev = cum(fy - 1);
    var fyOrders = list.filter(function (o) { return fyOf(ym(o.date)) === fy; }), pyOrders = list.filter(function (o) { return fyOf(ym(o.date)) === fy - 1 && ym(o.date) <= addMonths(thisM, -12); });
    var sum = function (arr, f) { return arr.reduce(function (a, o) { return a + f(o); }, 0); };
    var fyTotal = sum(fyOrders, val), pyTotal = sum(pyOrders, val);
    var fyCust = {}; fyOrders.forEach(function (o) { var k = o.customerRec || o.email || o.name; if (k) fyCust[k] = firstM[k] >= fy + "-08" ? "new" : "old"; });
    var fyNew = Object.keys(fyCust).filter(function (k) { return fyCust[k] === "new"; }).length, fyOld = Object.keys(fyCust).length - fyNew;

    $("ekpi").innerHTML =
      statTile(seeMoney ? mName + t("销售额", " sales") : mName + t("件数", " units"), fmt(seeMoney ? cur.sales : cur.units), { delta: pct(seeMoney ? cur.sales : cur.units, seeMoney ? prev.sales : prev.units), vs: t("较上月", "vs the month before"), spark: months.map(function (m) { return seeMoney ? byM[m].sales : byM[m].units; }) }) +
      (seeMoney ? statTile(mName + t("实收", " received"), fmtMoney(cur.received), { sub: cur.sales ? Math.round(cur.received / cur.sales * 100) + "%" + t(" 已收", " received") : t("按订单", "by order") }) : "") +
      statTile(mName + t("订单", " orders"), fmtNum(cur.orders), { delta: pct(cur.orders, prev.orders), vs: t("较上月", "vs the month before"), spark: months.map(function (m) { return byM[m].orders; }) }) +
      statTile(fyLabel(fy) + (seeMoney ? "" : " · " + measure), fmt(fyTotal), { delta: pct(fyTotal, pyTotal), vs: t("较上学年同期", "vs same period last year"), sub: fyOrders.length + t(" 单", " orders") }) +
      statTile(t("本学年购买客户", "Buyers this school year"), fmtNum(fyNew + fyOld), { sub: t("新客户 ", "new ") + fyNew + t(" · 老客户 ", " · returning ") + fyOld });

    // publishers, titles, subjects, grade bands — this school year
    var agg = function (keyOf) { var m = {}; fyOrders.forEach(function (o) { (o.items || []).forEach(function (it) { var k = keyOf(it); if (k == null) return; m[k] = (m[k] || 0) + (seeMoney ? (it.total || 0) : (it.qty || 0)); }); }); return Object.keys(m).map(function (k) { return { label: k, value: m[k] }; }).sort(function (a, b) { return b.value - a.value; }); };
    var pubs = agg(function (it) { return it.publisher || t("未知出版社", "Unknown publisher"); });
    var titles = agg(function (it) { return equipName(it); }).slice(0, 10);
    var subjects = agg(function (it) { return it.subject || t("未分类", "Unclassified"); }).slice(0, 10);
    var bandsAgg = {}; fyOrders.forEach(function (o) { (o.items || []).forEach(function (it) { var b = gradeBand(it.grade); bandsAgg[b] = (bandsAgg[b] || 0) + (seeMoney ? (it.total || 0) : (it.qty || 0)); }); });
    var bands = GRADE_BANDS.map(function (g, i) { return { label: t(g[0], g[1]), value: bandsAgg[i] || 0 }; }).filter(function (r) { return r.value; });
    var mlabels = months.map(monthLabel);
    var trendSeries = seeMoney ? [{ name: t("销售额", "Sales"), values: months.map(function (m) { return byM[m].sales; }), color: VIZ.cat[0] }, { name: t("实收", "Received"), values: months.map(function (m) { return byM[m].received; }), color: VIZ.cat[2] }] : [{ name: t("件数", "Units"), values: months.map(function (m) { return byM[m].units; }), color: VIZ.cat[0] }];
    var fyl = fyMonths.map(monthLabel);
    var barsTable = function (rows) { return dataTable([t("项目", "Item"), measure], rows.map(function (r) { return [r.label, fmt(r.value)]; })); };
    vizDraws = [];
    $("evgrid").innerHTML = !list.length ? '<div class="card"><p class="empty">' + (st.syncedAt ? t("Airtable 里还没有订单。", "No orders in Airtable yet.") : st.configured === false ? t("还没有同步：系统管理员需要在 Static Web App 的应用设置里加上 AIRTABLE_EQUIP_PAT。", "Not synced yet: the system administrator needs to add AIRTABLE_EQUIP_PAT to the Static Web App's settings.") : t("还没有同步。点「从 Airtable 同步」。", "Not synced yet. Click “Sync from Airtable”.")) + "</p></div>" :
      chartCard("vTrend", t("近 12 个月", "Last 12 months"), (isCur ? "" : t("截至 ", "to ") + thisM + " · ") + (seeMoney ? t("销售额与实收，按下单月", "sales and received, by order month") : t("件数，按下单月", "units by order month")), function (w) { return linesChart(w, { x: mlabels, series: trendSeries, fmt: fmt }); }, dataTable([t("月份", "Month")].concat(trendSeries.map(function (s) { return s.name; })), months.map(function (m, i) { return [m].concat(trendSeries.map(function (s) { return fmt(s.values[i]); })); }))) +
      chartCard("vFy", t("学年累计", "School year to date"), fyLabel(fy) + " vs " + fyLabel(fy - 1), function (w) { return linesChart(w, { x: fyl, series: [{ name: fyLabel(fy), values: cumCur, color: VIZ.seq }, { name: fyLabel(fy - 1), values: cumPrev, color: VIZ.gray }], fmt: fmt }); }, dataTable([t("月份", "Month"), fyLabel(fy), fyLabel(fy - 1)], fyMonths.map(function (m, i) { return [monthLabel(m), cumCur[i] == null ? "—" : fmt(cumCur[i]), cumPrev[i] == null ? "—" : fmt(cumPrev[i])]; }))) +
      chartCard("vOrders", t("每月订单", "Orders per month"), t("按下单月", "by order month"), function (w) { return columnsChart(w, { x: mlabels, series: [{ name: t("订单", "Orders"), values: months.map(function (m) { return byM[m].orders; }), color: VIZ.seq }], fmt: fmtNum }); }, dataTable([t("月份", "Month"), t("订单", "Orders")], months.map(function (m) { return [m, fmtNum(byM[m].orders)]; }))) +
      chartCard("vCust", t("新老客户", "New and returning buyers"), t("每月下单的客户，按首单月份区分", "buyers each month, by whether it is their first order"), function (w) { return columnsChart(w, { x: mlabels, series: [{ name: t("新客户", "New"), values: months.map(function (m) { return byM[m].newC; }), color: VIZ.cat[0] }, { name: t("老客户", "Returning"), values: months.map(function (m) { return byM[m].oldC; }), color: VIZ.cat[1] }], fmt: fmtNum }); }, dataTable([t("月份", "Month"), t("新客户", "New"), t("老客户", "Returning")], months.map(function (m) { return [m, fmtNum(byM[m].newC), fmtNum(byM[m].oldC)]; }))) +
      chartCard("vPub", t("出版社", "Publishers"), fyLabel(fy) + " · " + measure, function (w) { return barsChart(w, { rows: pubs, fmt: fmt, name: measure }); }, barsTable(pubs)) +
      chartCard("vTitles", t("教材 Top 10", "Top 10 titles"), fyLabel(fy) + " · " + measure, function (w) { return barsChart(w, { rows: titles, fmt: fmt, name: measure }); }, barsTable(titles)) +
      chartCard("vSubj", t("学科", "Subjects"), fyLabel(fy) + " · " + measure, function (w) { return barsChart(w, { rows: subjects, fmt: fmt, name: measure }); }, barsTable(subjects)) +
      chartCard("vGrade", t("年级段", "Grade bands"), fyLabel(fy) + " · " + measure + " · " + t("按教材标注的年级", "by the textbook's grade"), function (w) { return barsChart(w, { rows: bands, fmt: fmt, name: measure }); }, barsTable(bands));
    drawCharts();
    $("efoot").innerHTML = (st.syncedAt ? esc(t("数据同步于 ", "Data synced ") + when(st.syncedAt)) + " · " + esc((c.orders || 0) + t(" 单订单 · ", " orders · ") + (c.customers || 0) + t(" 位客户 · ", " customers · ") + (c.curriculums || 0) + t(" 条教材", " textbooks")) : esc(t("尚未同步", "Not synced yet"))) +
      ((st.warnings || []).length ? ' · <details style="display:inline-block"><summary>' + esc(t("同步提示 " + st.warnings.length + " 条", st.warnings.length + " sync notes")) + "</summary><ul>" + st.warnings.map(function (w) { return "<li>" + esc(w) + "</li>"; }).join("") + "</ul></details>" : "") +
      (seeMoney ? "" : " · " + esc(t("金额按角色隐藏，图表以件数计", "Amounts hidden for this role; charts count units")));
  }

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
  function personTabs(p) { var tb = ["all"]; if (p.primaryTier === "replace") tb.push("replace"); if (p.primaryTier === "missing") tb.push("missing"); if (p.viaTeams) tb.push("viaTeams"); return tb; }
  function viewPeople() {
    var canMerge = isAdmin() || crmLevel("orders") === "rw";
    setTitle(t("经营 › 人员库", "Operations › People Hub"), t("人员库", "People Hub"),
      '<button class="btn secondary sm" id="pReload">' + t("刷新", "Refresh") + "</button> " + '<button class="btn secondary sm" id="pCsv">' + t("导出 CSV", "Export CSV") + "</button>" +
      (canMerge ? ' <button class="btn secondary sm" id="pRebuild">' + t("重新匹配", "Rebuild") + '</button> <button class="btn sm" id="pWriteback">' + t("回写 CRM ID", "Write CRM IDs back") + "</button>" : ""),
      { info: t("Equip 客户、各校 Teams 账号、讲座名单、蜂巢课程订单里的同一个人，在这里是一条记录（CRM ID）。邮箱和 Teams 账号相同的自动合并；同名同校、或账号备用邮箱等于客户邮箱的，放到「待合并」由人来判断（账号的备用邮箱多半是家长的，不会据此合并）。不记录微信和手机号。", "One record (CRM ID) per person across the Equip customers, each school's Teams accounts, the seminar list and the Hive course orders. Identical emails and Teams accounts merge on their own; same name and school, or an account whose recovery email is a customer's email, only go to “To merge” for a person to decide (a recovery email is usually the parent's, so it never merges by itself). No WeChat or phone numbers are recorded.") });
    $("content").innerHTML =
      '<div class="kpis" id="pkpi"></div>' +
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
        flashOk(esc(t("已重新匹配：", "Rebuilt: ") + s.people + t(" 人，待合并 ", " people, to merge ") + s.queue + t("，待回写 CRM ID ", ", CRM IDs to write back ") + s.writeBack), 8000);
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
        case "accounts": return (((p.facets || {}).accounts || [])[0] || {}).upn || (((p.facets || {}).accounts || [])[0] || {}).domain || "";
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
    var html = '<div class="tbl-wrap"><table class="data fixed" id="ptable"><colgroup><col style="width:11%"><col style="width:15%"><col style="width:22%"><col style="width:9%"><col style="width:17%"><col style="width:9%"><col style="width:9%"><col style="width:8%"></colgroup><thead><tr>' + th("crmId", "CRM ID") + th("name", t("姓名", "Name")) + th("email", t("主邮箱", "Primary email")) + th("sources", t("来源", "Sources")) + th("accounts", t("账号", "Accounts")) + th("orders", t("订单 / 消费", "Orders / spend")) + th("active", t("最近活动", "Last active")) + th("stage", t("阶段", "Stage")) + "</tr></thead><tbody>";
    if (!list.length) html += '<tr><td colspan="8" class="empty">' + (h.generatedAt ? t("还没有人员记录。", "No people yet.") : t("人员库还没有生成：同步一次 Equip 订单，或点「重新匹配」。", "The people hub has not been built yet: sync the Equip orders once, or click “Rebuild”.")) + "</td></tr>";
    else if (!rows.length) html += '<tr><td colspan="8" class="empty">' + t("没有符合条件的人。", "Nobody matches.") + "</td></tr>";
    else html += rows.map(function (p) {
      var acc = (p.facets && p.facets.accounts) || [];
      var accTxt = acc.map(function (a) { return a.upn || a.domain; }).join(", ");
      var spend = crmLevel("money") === "none" ? "" : (typeof p.spend === "number" && p.spend ? " / " + money(p.spend, "CNY") : "");
      return '<tr class="pick" data-id="' + esc(p.crmId) + '"><td class="nowrap"><b>' + esc(p.crmId) + "</b>" + (p.writeBack && p.writeBack.length ? ' <span class="dot warn" title="' + esc(t("待回写：Airtable 客户表还没有这个 CRM ID", "To write back: not yet on the Airtable customer")) + '"></span>' : "") + "</td>" +
        '<td class="nowrap"><span class="avatar xs" style="background:' + hue(p.crmId) + ';color:#fff">' + esc(initials(p.name || p.crmId)) + '</span> <span class="cell-ell">' + hl(p.name || "—", peopleState.q) + "</span>" + (p.family ? ' <span class="fam" title="' + esc(t("家庭 " + p.family.members.length + " 人", "Family of " + p.family.members.length)) + '">⌂' + p.family.members.length + "</span>" : "") + "</td>" +
        '<td class="nowrap"><span class="cell-ell" title="' + esc(p.primaryEmail) + '">' + esc(p.primaryEmail || "—") + "</span> " + tierTag(p.primaryTier) + (p.viaTeams ? ' <span class="tag accent">Teams</span>' : "") + (p.primaryTier === "replace" ? " " + markTag(p) : "") + "</td>" +
        "<td>" + sourceTags(p) + "</td>" +
        '<td class="nowrap ell" title="' + esc(accTxt) + '">' + esc(accTxt || "—") + "</td>" +
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
    var head = ["CRM ID", t("姓名", "Name"), t("主邮箱", "Primary email"), t("邮箱状态", "Email status"), t("来源", "Sources"), t("账号", "Accounts"), t("订单", "Orders"), t("消费", "Spend"), t("最近活动", "Last active"), t("阶段", "Stage")].join(",");
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

  // ================================================================================
  // 经营 › 版税结算 — the finance director's table (design §5): publisher × calendar
  // quarter, sales / royalty due / paid. The CEO reads it; finance marks payments.
  // ================================================================================
  var royaltyState = { data: null, quarters: 8 };
  function viewRoyalty() {
    setTitle(t("经营 › 版税结算", "Operations › Royalties"), t("版税结算表", "Royalty settlements"),
      '<select id="rQuarters" class="sm">' + [4, 8, 12].map(function (n) { return '<option value="' + n + '"' + (royaltyState.quarters === n ? " selected" : "") + ">" + t("最近 " + n + " 个季度", "Last " + n + " quarters") + "</option>"; }).join("") + '</select> <button class="btn secondary sm" id="rCsv">' + t("导出 CSV", "Export CSV") + "</button>",
      { info: t("按出版社、按日历季度：销售额、应付版税、是否已付。每行明细的版税 = Airtable 已算出的版税金额，没有时用 销售额 × 该教材的版税率。标记「已付」只记录结算进度，不改 Airtable。", "By publisher and calendar quarter: sales, royalty due, paid or not. A line's royalty is Airtable's royalty amount when present, else sales × the title's rate. Marking a quarter paid records settlement progress only; nothing in Airtable changes.") });
    $("content").innerHTML = '<div class="card"><div class="tbl-wrap in"><table class="data" id="rtable"><thead><tr><th>' + t("出版社", "Publisher") + "</th></tr></thead><tbody><tr><td class=\"loading\">" + t("载入中…", "Loading…") + '</td></tr></tbody></table></div><p class="hint" id="rfoot"></p></div>';
    $("rQuarters").addEventListener("change", function () { royaltyState.quarters = +this.value; loadRoyalty().then(renderRoyalty); });
    $("rCsv").addEventListener("click", exportRoyaltyCsv);
    $("rtable").addEventListener("click", function (e) {
      var b = e.target.closest("button[data-pay]"); if (!b) return;
      var pub = b.getAttribute("data-pub"), q = b.getAttribute("data-q"), paid = b.getAttribute("data-pay") === "1", amount = +b.getAttribute("data-amount");
      if (paid && !window.confirm(t("标记 " + pub + " " + q + " 的版税（" + fmtMoney(amount) + "）为已付？", "Mark " + pub + " " + q + " royalty (" + fmtMoney(amount) + ") as paid?"))) return;
      savingButton(b, "…");
      post("crm/royalty", "POST", { publisher: pub, quarter: q, paid: paid, amount: amount }).then(function (r) {
        if (!r.ok) { restoreButton(b); flash(esc(errText(r)), 6000); return; }
        if (r.body.mark) royaltyState.data.paid[r.body.key] = r.body.mark; else delete royaltyState.data.paid[r.body.key];
        renderRoyalty();
      });
    });
    loadRoyalty().then(renderRoyalty).catch(function (r) { $("rtable").tBodies[0].innerHTML = '<tr><td class="loading">' + esc(errText(r)) + "</td></tr>"; });
  }
  function loadRoyalty() { return api("crm/royalty?quarters=" + royaltyState.quarters).then(function (r) { if (!r.ok) throw r; royaltyState.data = r.body; return r.body; }); }
  function renderRoyalty() {
    var d = royaltyState.data; if (!d || !$("rtable")) return;
    var qs = d.quarters, paid = d.paid || {};
    $("rtable").tHead.innerHTML = "<tr><th>" + t("出版社", "Publisher") + "</th>" + qs.map(function (q) { return '<th class="num">' + esc(q) + "</th>"; }).join("") + '<th class="num">' + t("合计应付", "Total due") + "</th></tr>";
    var cell = function (p, q) {
      var c = p.cells[q]; if (!c) return '<td class="num muted">—</td>';
      var key = p.publisher + "|" + q, pm = paid[key];
      return '<td class="num rc' + (pm ? " paid" : "") + '"><div class="due">' + fmtMoney(c.royalty) + (c.unknown ? ' <span class="tag warn" title="' + esc(t(c.unknown + " 行没有版税率", c.unknown + " lines without a rate")) + '">?</span>' : "") + '</div><div class="sales">' + esc(t("销售 ", "sales ") + fmtMoney(c.sales)) + "</div>" +
        (pm ? '<div class="pm"><span class="tag ok">' + t("已付", "Paid") + "</span> " + esc(day(pm.at)) + (d.canPay ? ' <button type="button" class="link" data-pay="0" data-pub="' + esc(p.publisher) + '" data-q="' + esc(q) + '">' + t("撤销", "undo") + "</button>" : "") + "</div>" : (d.canPay && c.royalty > 0 ? '<div class="pm"><button type="button" class="btn secondary sm" data-pay="1" data-pub="' + esc(p.publisher) + '" data-q="' + esc(q) + '" data-amount="' + c.royalty + '">' + t("标记已付", "Mark paid") + "</button></div>" : "")) + "</td>";
    };
    $("rtable").tBodies[0].innerHTML = d.publishers.map(function (p) {
      return "<tr><td><b>" + esc(p.publisher) + "</b>" + (p.recipient ? '<span class="sub">' + esc(p.recipient) + "</span>" : "") + '<span class="sub">' + esc(t("版税率 ", "rate ") + (p.rates.length ? p.rates.map(function (r) { return Math.round(r * 100) + "%"; }).join(" / ") : "—")) + "</span></td>" + qs.map(function (q) { return cell(p, q); }).join("") + '<td class="num"><b>' + fmtMoney(p.royaltyTotal) + "</b></td></tr>";
    }).join("") + '<tr class="total"><td>' + t("合计", "Total") + "</td>" + qs.map(function (q) { var tq = d.totals[q] || { sales: 0, royalty: 0 }; return '<td class="num"><div class="due"><b>' + fmtMoney(tq.royalty) + '</b></div><div class="sales">' + esc(t("销售 ", "sales ") + fmtMoney(tq.sales)) + "</div></td>"; }).join("") + '<td class="num"><b>' + fmtMoney(d.publishers.reduce(function (a, p) { return a + p.royaltyTotal; }, 0)) + "</b></td></tr>";
    $("rfoot").textContent = (d.syncedAt ? t("数据同步于 ", "Data synced ") + when(d.syncedAt) + " · " : "") + t("季度为日历季度；带 ? 的格子里有教材没有版税率，请在 Airtable 的 Curriculums 表补上。", "Calendar quarters; a ? means some titles in that cell have no royalty rate — add it on the Airtable Curriculums table.");
  }
  function exportRoyaltyCsv() {
    var d = royaltyState.data; if (!d) return;
    var cell = function (v) { v = String(v == null ? "" : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var head = [t("出版社", "Publisher"), t("收款方", "Recipient"), t("版税率", "Rate"), t("季度", "Quarter"), t("销售额", "Sales"), t("应付版税", "Royalty due"), t("件数", "Units"), t("已付", "Paid"), t("付款日期", "Paid on")].join(",");
    var lines = [];
    d.publishers.forEach(function (p) { d.quarters.forEach(function (q) { var c = p.cells[q]; if (!c) return; var pm = (d.paid || {})[p.publisher + "|" + q]; lines.push([p.publisher, p.recipient, p.rates.map(function (r) { return Math.round(r * 100) + "%"; }).join(" / "), q, Math.round(c.sales), Math.round(c.royalty * 100) / 100, c.units, pm ? "Y" : "", pm ? String(pm.at).slice(0, 10) : ""].map(cell).join(",")); }); });
    var blob = new Blob(["\ufeff" + [head].concat(lines).join("\r\n")], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "royalties-" + new Date().toISOString().slice(0, 10) + ".csv"; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

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
    $("content").innerHTML = '<div class="kpis" id="lkpi"></div><div class="tbl-wrap"><table class="data fixed" id="ltable"><colgroup><col style="width:9%"><col style="width:25%"><col style="width:18%"><col style="width:8%"><col style="width:8%"><col style="width:8%"><col style="width:12%"><col style="width:12%"></colgroup><thead><tr><th>' + t("池", "Pool") + "</th><th>" + t("教材", "Title") + "</th><th>" + t("持有方", "Holder") + '</th><th class="num">' + t("份数", "Seats") + '</th><th class="num">' + t("已分配", "Allocated") + '</th><th class="num">' + t("余量", "Balance") + "</th><th>" + t("有效期至", "Valid to") + "</th><th>" + t("来源", "Source") + '</th></tr></thead><tbody><tr><td colspan="8" class="loading">' + t("载入中…", "Loading…") + '</td></tr></tbody></table></div><p class="muted" id="lfoot" style="font-size:.8rem"></p>';
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

  // ================================================================================
  // 经营 › 仪表盘 — the staff home page (design §5): KPIs for the period with a
  // comparison, eight panels each answering one question, every number a way into
  // the list behind it. Nothing about tenant accounts here (that stays in 用户);
  // money only for roles that may see it, units otherwise. Period: 本月 / 本季 /
  // 本学年 (August start, decision 7); the comparison is the period before, or the
  // same period of the previous school year.
  // ================================================================================
  var dashState = { period: "month", trend: "cum", from: "", to: "" };
  function isStaff() { return (me && me.roles || []).some(function (r) { return /^staff:/.test(r) && r !== "staff:contractor"; }); }
  function curMonth() { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); }
  // The months of a period and of its comparison, newest period first.
  function periodMonths(kind) {
    var m = curMonth(), months = [], prev = [];
    if (kind === "custom") {
      var a = dashState.from && dashState.from <= m ? dashState.from : addMonths(m, -2), b = dashState.to && dashState.to <= m ? dashState.to : m; if (a > b) { var tmp = a; a = b; b = tmp; }
      for (var mm = a; mm <= b; mm = addMonths(mm, 1)) months.push(mm);
      prev = months.map(function (x) { return addMonths(x, -months.length); });
      return { months: months, prev: prev, label: a === b ? a : a + " – " + b, vs: t("较前 " + months.length + " 个月", "vs the " + months.length + " months before") };
    }
    if (kind === "month") { months = [m]; prev = [addMonths(m, -1)]; }
    else if (kind === "quarter") { var q = Math.floor((+m.split("-")[1] - 1) / 3) * 3 + 1, start = m.split("-")[0] + "-" + String(q).padStart(2, "0"); for (var i = 0; i < 3; i++) { var mm = addMonths(start, i); if (mm <= m) months.push(mm); } prev = months.map(function (x) { return addMonths(x, -3); }); }
    else { var fy = fyOf(m); for (var k = 0; k < 12; k++) { var x = addMonths(fy + "-08", k); if (x <= m) months.push(x); } prev = months.map(function (x) { return addMonths(x, -12); }); }
    return { months: months, prev: prev, label: kind === "month" ? t("本月", "This month") : kind === "quarter" ? t("本季", "This quarter") : fyLabel(fyOf(m)), vs: kind === "month" ? t("较上月", "vs last month") : kind === "quarter" ? t("较上季", "vs last quarter") : t("较上学年同期", "vs the same period last year") };
  }
  function viewDashboard() {
    setTitle(t("经营", "Operations"), t("仪表盘", "Dashboard"),
      '<span id="dRange" class="range' + (dashState.period === "custom" ? "" : " hidden") + '"><select id="dFrom" class="sm"></select> – <select id="dTo" class="sm"></select></span> <div class="seg" role="tablist">' + [["month", "本月", "Month"], ["quarter", "本季", "Quarter"], ["year", "本学年", "School year"], ["custom", "自定义", "Custom"]].map(function (p) { return '<button type="button" data-p="' + p[0] + '" aria-pressed="' + (dashState.period === p[0]) + '">' + t(p[1], p[2]) + "</button>"; }).join("") + '</div> <button class="btn secondary sm" id="dExport">' + t("导出月报", "Export report") + '</button> <button class="btn secondary sm" id="dCsv">' + t("导出数据", "Export data") + '</button> <button class="btn secondary sm" id="dReload">' + t("刷新", "Refresh") + "</button>",
      { info: t("员工首页：本期与上期的对比、八个面板各回答一个经营问题，每个数字都能点进名单。学年从 8 月起算；销售按下单日、实收按订单；蜂巢课程成交额只在这里显示，不与教材销售合计。", "The staff home: this period against the last, eight panels each answering one question, every number a way into the list. The school year starts in August; sales by order date, received by order; Hive course value is shown here only and never summed with textbook sales.") });
    $("content").innerHTML = '<div class="kpis" id="dkpi"></div><div class="vgrid" id="dgrid"><p class="loading">' + t("载入中…", "Loading…") + '</p></div><p class="muted" id="dfoot" style="font-size:.8rem"></p>';
    $("topActions").addEventListener("click", function (e) {
      var b = e.target.closest(".seg button[data-p]"); if (!b) return;
      dashState.period = b.getAttribute("data-p");
      $("topActions").querySelectorAll(".seg button").forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
      $("dRange").classList.toggle("hidden", dashState.period !== "custom");
      renderDashboard();
    });
    // 自定义: any two months, newest first in the lists
    var c0 = curMonth(), opts = []; for (var i = 0; i < 36; i++) opts.push(addMonths(c0, -i));
    ["dFrom", "dTo"].forEach(function (id) { $(id).innerHTML = opts.map(function (mm) { return '<option value="' + mm + '">' + mm + "</option>"; }).join(""); });
    $("dFrom").value = dashState.from || addMonths(c0, -2); $("dTo").value = dashState.to || c0;
    $("dFrom").addEventListener("change", function () { dashState.from = this.value; renderDashboard(); });
    $("dTo").addEventListener("change", function () { dashState.to = this.value; renderDashboard(); });
    // 导出月报: the page as it stands, through the browser's print dialog (save as PDF);
    // 导出数据: every panel's table in one CSV, so two people never report two numbers.
    $("dExport").addEventListener("click", function () { document.body.classList.add("printing"); setTimeout(function () { window.print(); document.body.classList.remove("printing"); }, 50); });
    $("dCsv").addEventListener("click", exportDashboardCsv);
    $("dReload").addEventListener("click", function () { equipState.list = null; ordersState.list = null; peopleState.hub = null; loadDashboard().then(renderDashboard); });
    loadDashboard().then(renderDashboard);
  }
  function loadDashboard() {
    var q = function (pr) { return pr.catch(function () { return null; }); };
    return Promise.all([q(loadEquip(false)), canSeeOrders() ? q(loadOrders(false)) : Promise.resolve(null), canSeeOrders() ? q(loadPeople(false)) : Promise.resolve(null)]);
  }
  function renderDashboard() {
    if (!$("dgrid")) return;
    var seeMoney = crmLevel("money") !== "none", fmt = seeMoney ? fmtMoney : fmtNum, measure = seeMoney ? t("销售额", "Sales") : t("件数", "Units");
    var P = periodMonths(dashState.period), inP = function (m) { return P.months.indexOf(m) >= 0; }, inPrev = function (m) { return P.prev.indexOf(m) >= 0; };
    var equip = equipState.list || [], orders = ordersState.list || [], hub = peopleState.hub || null, people = (hub && hub.people) || [];
    var val = function (o) { return seeMoney ? (o.amount || 0) : (o.qty || 0); };
    var sum = function (arr, f) { return arr.reduce(function (a, o) { return a + f(o); }, 0); };
    var eNow = equip.filter(function (o) { return inP(ym(o.date)); }), ePrev = equip.filter(function (o) { return inPrev(ym(o.date)); });
    var pct = function (a, b) { return b ? (a - b) / b : null; };
    var custKey = function (o) { return o.customerRec || o.email || o.name; };
    var firstM = {}; equip.forEach(function (o) { var k = custKey(o), m = ym(o.date); if (k && m && (!firstM[k] || m < firstM[k])) firstM[k] = m; });
    var buyers = {}; eNow.forEach(function (o) { var k = custKey(o); if (k) buyers[k] = firstM[k] >= P.months[0] ? "new" : "old"; });
    var nNew = Object.keys(buyers).filter(function (k) { return buyers[k] === "new"; }).length, nOld = Object.keys(buyers).length - nNew;
    var hNow = orders.filter(function (o) { return inP(String(o.submittedAt || "").slice(0, 7)) && o.status !== "cancelled"; }), hPrev = orders.filter(function (o) { return inPrev(String(o.submittedAt || "").slice(0, 7)) && o.status !== "cancelled"; });
    var hSum = function (arr) { return sum(arr, function (o) { return typeof o.totalPrice === "number" ? o.totalPrice : 0; }); };
    var counts = ordersState.counts || {}, stats = (hub && hub.stats) || {};
    var todo = (counts.overdue || 0) + (counts.notifyFailed || 0) + (hub && hub.canMerge ? (hub.queue || []).length : 0);
    var months12 = []; for (var i = 11; i >= 0; i--) months12.push(addMonths(curMonth(), -i));
    var byM = function (arr, f, keyOf) { var o = {}; months12.forEach(function (m) { o[m] = 0; }); arr.forEach(function (x) { var m = keyOf(x); if (m in o) o[m] += f(x); }); return months12.map(function (m) { return o[m]; }); };

    $("dkpi").innerHTML =
      statTile(P.label + " · " + (seeMoney ? t("教材销售额", "Textbook sales") : t("教材件数", "Textbook units")), fmt(sum(eNow, val)), { delta: pct(sum(eNow, val), sum(ePrev, val)), vs: P.vs, spark: byM(equip, val, function (o) { return ym(o.date); }), attr: ' data-go="#/ops/orders/equip"', cls: "go" }) +
      (seeMoney ? statTile(P.label + " · " + t("教材实收", "Textbook received"), fmtMoney(sum(eNow, function (o) { return o.received || 0; })), { sub: sum(eNow, val) ? Math.round(sum(eNow, function (o) { return o.received || 0; }) / sum(eNow, val) * 100) + "%" + t(" 已收", " received") : "" }) : "") +
      statTile(P.label + " · " + t("教材订单", "Textbook orders"), fmtNum(eNow.length), { delta: pct(eNow.length, ePrev.length), vs: P.vs, sub: t("购买客户 ", "buyers ") + (nNew + nOld) + t("（新 ", " (new ") + nNew + ")" }) +
      (canSeeOrders() ? statTile(P.label + " · " + t("课程订单", "Course orders"), fmtNum(hNow.length) + (seeMoney ? ' <span class="unit">' + fmtMoney(hSum(hNow)) + "</span>" : ""), { delta: pct(hNow.length, hPrev.length), vs: P.vs, sub: t("蜂巢网站 · 不与教材合计", "fengchao.life · never summed with textbooks"), attr: ' data-go="#/ops/orders"', cls: "go" }) : "") +
      (hub ? statTile(t("人员库", "People"), fmtNum(stats.people || 0), { sub: t("活跃 ", "active ") + ((stats.stages || {}).active || 0) + t(" · 潜在 ", " · leads ") + ((stats.stages || {}).lead || 0) + t(" · 家庭 ", " · families ") + (stats.families || 0), attr: ' data-go="#/ops/people"', cls: "go" }) : "") +
      (canSeeOrders() ? statTile(t("待处理", "To do"), fmtNum(todo), { cls: "go", warn: todo > 0, sub: t("超期 ", "overdue ") + (counts.overdue || 0) + t(" · 通知失败 ", " · notify failed ") + (counts.notifyFailed || 0) + (hub && hub.canMerge ? t(" · 待合并 ", " · to merge ") + (hub.queue || []).length : ""), attr: ' data-go="#/ops/orders"' }) : "");

    // ---- panels ----
    vizDraws = [];
    var cards = [];
    // 1 销售与收款趋势: cumulative this period vs the one before (or monthly columns)
    var cumOf = function (ms) { var acc = 0; return ms.map(function (m) { if (m > curMonth()) return null; equip.forEach(function (o) { if (ym(o.date) === m) acc += val(o); }); return acc; }); };
    var trendMonths = dashState.period === "month" ? months12 : P.months.length ? P.months.slice() : [];
    if (dashState.period === "year") { trendMonths = []; for (var k = 0; k < 12; k++) trendMonths.push(addMonths(fyOf(curMonth()) + "-08", k)); }
    var prevMonths = trendMonths.map(function (m) { return addMonths(m, dashState.period === "month" ? -12 : dashState.period === "quarter" ? -3 : dashState.period === "custom" ? -trendMonths.length : -12); });
    var labelsT = trendMonths.map(monthLabel);
    cards.push(chartCard("dTrend", t("销售与收款趋势", "Sales and cash"), (dashState.trend === "cum" ? t("累计 · ", "cumulative · ") : t("按月 · ", "monthly · ")) + (dashState.period === "month" ? t("近 12 个月 vs 去年同期", "last 12 months vs the year before") : P.label + " vs " + P.vs.replace(/^较/, "")), function (w) {
      if (dashState.trend === "cum") return linesChart(w, { x: labelsT, series: [{ name: t("本期", "This period"), values: cumOf(trendMonths), color: VIZ.seq }, { name: t("上期", "Last period"), values: cumOf(prevMonths).map(function (v) { return v == null ? 0 : v; }), color: VIZ.gray }], fmt: fmt });
      return columnsChart(w, { x: labelsT, series: [{ name: measure, values: trendMonths.map(function (m) { return sum(equip.filter(function (o) { return ym(o.date) === m; }), val); }), color: VIZ.seq }].concat(seeMoney ? [{ name: t("实收", "Received"), values: trendMonths.map(function (m) { return sum(equip.filter(function (o) { return ym(o.date) === m; }), function (o) { return o.received || 0; }); }), color: VIZ.cat[2] }] : []), fmt: fmt });
    }, dataTable([t("月份", "Month"), t("本期", "This period"), t("上期", "Last period")], trendMonths.map(function (m, i) { var a = cumOf(trendMonths)[i], b = cumOf(prevMonths)[i]; return [monthLabel(m), a == null ? "—" : fmt(a), b == null ? "—" : fmt(b)]; }))));
    // 2 客户漏斗
    if (hub) {
      var leads = people.filter(function (p) { return p.sources && p.sources.lead; }).length, registered = people.filter(function (p) { return p.sources && p.sources.account; }).length, customers = people.filter(function (p) { return p.sources && p.sources.customer; }).length, repeat = people.filter(function (p) { return (p.orders || 0) >= 2; }).length, active = ((stats.stages || {}).active || 0);
      var funnel = [{ label: t("讲座线索", "Seminar leads"), value: leads }, { label: t("有 Teams 账号", "With a Teams account"), value: registered }, { label: t("买过教材", "Bought textbooks"), value: customers }, { label: t("复购（≥2 单）", "Repeat (≥2 orders)"), value: repeat }, { label: t("活跃", "Active"), value: active }];
      cards.push(chartCard("dFunnel", t("客户漏斗", "Customer funnel"), t("人员库里各阶段的人数 · 讲座线索成为客户的比例", "people at each stage · how many seminar leads became customers"), function (w) { return barsChart(w, { rows: funnel, fmt: fmtNum, name: t("人", "people") }) + '<p class="hint">' + esc(t("讲座线索中已成为客户：", "Seminar leads who became customers: ") + people.filter(function (p) { return p.sources && p.sources.lead && p.sources.customer; }).length + " / " + leads) + "</p>"; }, dataTable([t("阶段", "Stage"), t("人数", "People")], funnel.map(function (r) { return [r.label, fmtNum(r.value)]; }))));
    }
    // 3 按出版社: retained vs royalty when the rates are visible
    var pubAgg = {}; eNow.forEach(function (o) { (o.items || []).forEach(function (it) { var k = it.publisher || t("未知", "Unknown"); var v = seeMoney ? (it.total || 0) : (it.qty || 0); var rate = it.royalty && typeof it.royalty["Royalty Rate"] === "number" ? it.royalty["Royalty Rate"] : null; if (!pubAgg[k]) pubAgg[k] = { total: 0, royalty: 0, known: true }; pubAgg[k].total += v; if (rate == null) pubAgg[k].known = false; else pubAgg[k].royalty += v * rate; }); });
    var pubs = Object.keys(pubAgg).map(function (k) { return { label: k, value: pubAgg[k].total, royalty: pubAgg[k].royalty, known: pubAgg[k].known }; }).sort(function (a, b) { return b.value - a.value; });
    var royaltyKnown = seeMoney && pubs.length && pubs.every(function (p) { return p.known; });
    cards.push(chartCard("dPub", t("按出版社", "By publisher"), P.label + " · " + measure + (royaltyKnown ? t(" · 深色为留存，浅色为版税", " · dark = retained, light = royalty") : ""), function (w) {
      if (!royaltyKnown) return barsChart(w, { rows: pubs, fmt: fmt, name: measure });
      return columnsChart(w, { x: pubs.map(function (p) { return p.label; }), series: [{ name: t("留存", "Retained"), values: pubs.map(function (p) { return p.value - p.royalty; }), color: VIZ.seq }, { name: t("版税", "Royalty"), values: pubs.map(function (p) { return p.royalty; }), color: VIZ.seq3 }], fmt: fmt, labelAll: true, height: 240 });
    }, dataTable([t("出版社", "Publisher"), measure].concat(royaltyKnown ? [t("版税", "Royalty")] : []), pubs.map(function (p) { return [p.label, fmt(p.value)].concat(royaltyKnown ? [fmt(p.royalty)] : []); }))));
    // 4 课程销售 Top 10, coloured by category
    var catColor = { Curriculum: VIZ.cat[0], "Pre-recorded": VIZ.cat[1], Live: VIZ.cat[2] };
    var catOf = function (c) { c = String(c || ""); return /live|直播/i.test(c) ? "Live" : /record|预录|video|视频/i.test(c) ? "Pre-recorded" : "Curriculum"; };
    var skuAgg = {}; eNow.forEach(function (o) { (o.items || []).forEach(function (it) { var k = equipName(it); if (!skuAgg[k]) skuAgg[k] = { v: 0, cat: catOf(it.category) }; skuAgg[k].v += seeMoney ? (it.total || 0) : (it.qty || 0); }); });
    var top = Object.keys(skuAgg).map(function (k) { return { label: k, value: skuAgg[k].v, color: catColor[skuAgg[k].cat], sub: skuAgg[k].cat === "Live" ? t("直播课", "Live") : skuAgg[k].cat === "Pre-recorded" ? t("预录课", "Pre-recorded") : t("教材", "Curriculum") }; }).sort(function (a, b) { return b.value - a.value; }).slice(0, 10);
    cards.push(chartCard("dTop", t("课程销售 Top 10", "Top 10 titles"), P.label + " · " + measure, function (w) { return legend([{ name: t("教材", "Curriculum"), color: VIZ.cat[0] }, { name: t("预录课", "Pre-recorded"), color: VIZ.cat[1] }, { name: t("直播课", "Live"), color: VIZ.cat[2] }]) + barsChart(w, { rows: top, fmt: fmt }); }, dataTable([t("名称", "Title"), t("类型", "Type"), measure], top.map(function (r) { return [r.label, r.sub, fmt(r.value)]; }))));
    // 5 客户分布与复购: by school (the domain of a person's Teams account)
    if (hub) {
      var bySchool = {}; people.forEach(function (p) { if (!(p.sources && p.sources.customer)) return; var d = (((p.facets || {}).accounts || [])[0] || {}).domain || t("无 Teams 账号", "No Teams account"); bySchool[d] = (bySchool[d] || 0) + 1; });
      var schools = Object.keys(bySchool).map(function (k) { return { label: dname(k) || k, value: bySchool[k] }; }).sort(function (a, b) { return b.value - a.value; }).slice(0, 10);
      var withOrders = people.filter(function (p) { return (p.orders || 0) >= 1; }).length, repeatN = people.filter(function (p) { return (p.orders || 0) >= 2; }).length;
      cards.push(chartCard("dSchools", t("客户分布与复购", "Where customers are, and who comes back"), t("买过教材的人按学校 · 复购率 ", "textbook buyers by school · repeat rate ") + (withOrders ? Math.round(repeatN / withOrders * 100) + "% (" + repeatN + "/" + withOrders + ")" : "—"), function (w) { return barsChart(w, { rows: schools, fmt: fmtNum, name: t("客户", "customers") }); }, dataTable([t("学校", "School"), t("客户", "Customers")], schools.map(function (r) { return [r.label, fmtNum(r.value)]; }))));
      // 6 社区与讲座
      var sessions = {}; people.forEach(function (p) { ((p.facets || {}).leads || []).forEach(function (l) { var k = l.session || t("未注明场次", "Unnamed session"); if (!sessions[k]) sessions[k] = { n: 0, c: 0 }; sessions[k].n++; if (p.sources.customer) sessions[k].c++; }); });
      var sess = Object.keys(sessions).sort().reverse().slice(0, 8).map(function (k) { return { label: k, value: sessions[k].n, c: sessions[k].c }; });
      cards.push(chartCard("dSeminar", t("社区与讲座", "Community and seminars"), t("每场讲座报名人数 · 其中后来买了教材的", "sign-ups per session · of whom bought textbooks since"), function (w) { return columnsChart(w, { x: sess.map(function (r) { return r.label; }), series: [{ name: t("成为客户", "Became customers"), values: sess.map(function (r) { return r.c; }), color: VIZ.seq }, { name: t("未购买", "Not yet"), values: sess.map(function (r) { return r.value - r.c; }), color: VIZ.seq3 }], fmt: fmtNum, labelAll: true }); }, dataTable([t("场次", "Session"), t("报名", "Sign-ups"), t("成为客户", "Became customers")], sess.map(function (r) { return [r.label, fmtNum(r.value), fmtNum(r.c)]; }))));
    }
    // 6b 长尾: available titles nobody bought in a year (the curriculum director's one)
    if (crmLevel("catalogue") !== "none") cards.push('<div class="card viz" id="dTail"><div class="ch"><h2>' + t("一年没卖出的在售教材", "Available titles unsold for a year") + ' <span class="n">' + t("可售但 12 个月内无订单", "available, no order in 12 months") + '</span></h2><div class="vtools"><div class="vtoggle" role="tablist"><button type="button" class="on" data-v="chart">' + t("图", "Chart") + '</button><button type="button" data-v="table">' + t("表", "Table") + '</button></div></div></div><div class="vbody"><p class="loading">' + t("载入中…", "Loading…") + '</p></div><div class="vtable hidden"></div></div>');
    // 7 待处理与异常 — a list, each line a way in
    if (canSeeOrders()) {
      var replaceAll = stats.replace || 0, replaceWithOrders = people.filter(function (p) { return p.primaryTier === "replace" && (p.orders || 0) > 0; }).length;
      var rows = [
        [t("超期订单", "Overdue orders"), counts.overdue || 0, "#/ops/orders", "overdue"],
        [t("通知失败的订单", "Orders whose notification failed"), counts.notifyFailed || 0, "#/ops/orders", "notifyFailed"],
        [t("待确认的订单", "Orders awaiting confirmation"), counts.submitted || 0, "#/ops/orders", "submitted"],
      ].concat(hub ? [
        [t("待合并的人员", "People to merge"), hub.canMerge ? (hub.queue || []).length : null, "#/ops/people", "queue"],
        [t("待替换邮箱（有订单 " + replaceWithOrders + " · 本月已替换 " + (stats.replacedThisMonth || 0) + "）", "Emails to replace (" + replaceWithOrders + " with orders · " + (stats.replacedThisMonth || 0) + " replaced this month)"), replaceAll, "#/ops/people", "replace"],
        [t("待回写 CRM ID", "CRM IDs to write back"), stats.writeBack || 0, "#/ops/people", "all"],
      ] : []).filter(function (r) { return r[1] !== null; });
      var canDigest = isAdmin() || crmLevel("orders") === "rw";
      cards.push('<div class="card todo" id="dTodo"><div class="ch"><h2>' + t("待处理与异常", "To do and exceptions") + ' <span class="n">' + t("今天该有人去做的事", "what someone should do today") + '</span></h2></div><div class="olist">' + rows.map(function (r) { return '<a class="orow link" href="' + r[2] + '" data-tab="' + r[3] + '"><div class="omain"><b>' + esc(r[0]) + '</b></div><div class="oprice"><span class="tag ' + (r[1] ? "warn" : "ok") + '">' + fmtNum(r[1]) + "</span></div></a>"; }).join("") + "</div>" +
        (canDigest ? '<div class="digest" id="dDigest"><span class="muted">' + t("每日摘要：载入中…", "Daily digest: loading…") + "</span></div>" : "") + "</div>");
    }
    // 8 合作伙伴 · 9 许可: later phases, said plainly
    if (crmLevel("partners") !== "none") cards.push('<div class="card viz" id="dPartners"><div class="ch"><h2>' + t("合作伙伴", "Partners") + ' <span class="n">' + t("各机构 · 本学年教材销售与合作阶段", "institutions · this school year's textbook sales and partnership stage") + '</span></h2></div><div class="vbody"><p class="loading">' + t("载入中…", "Loading…") + "</p></div></div>");
    else cards.push('<div class="card soon"><div class="ch"><h2>' + t("合作伙伴", "Partners") + '</h2></div><p class="muted">' + esc(t("需要合作伙伴数据的查看权限。", "Needs read access to partner data.")) + "</p></div>");
    cards.push(
      (crmLevel("drm") !== "none" ? '<div class="card viz" id="dLic"><div class="ch"><h2>' + t("许可", "Licences") + ' <span class="n">' + t("池余量与到期 · 已有座位的人 · 按地区", "pool balance and expiry · people with a seat · by region") + '</span></h2><div class="vtools"><div class="vtoggle" role="tablist"><button type="button" class="on" data-v="chart">' + t("图", "Chart") + '</button><button type="button" data-v="table">' + t("表", "Table") + '</button></div></div></div><div class="vbody"><p class="loading">' + t("载入中…", "Loading…") + '</p></div><div class="vtable hidden"></div></div>' :
        '<div class="card soon"><div class="ch"><h2>' + t("许可", "Licences") + '</h2></div><p class="muted">' + esc(t("需要许可数据的查看权限。", "Needs read access to licence data.")) + "</p></div>"));
    if (canSeeOrders()) cards.push('<div class="card feed" id="dFeed"><div class="ch"><h2>' + t("动态", "Activity") + ' <span class="n">' + t("最近的录入、状态变化、同步与合并", "recent entries, status changes, syncs and merges") + '</span></h2></div><div class="olist" id="dFeedList"><div class="orow muted">' + t("载入中…", "Loading…") + "</div></div></div>");
    $("dgrid").innerHTML = cards.join("");
    // 图形切换 for the trend card: 累计 / 按月
    var tc = $("dTrend"); if (tc) { var tg = tc.querySelector(".vtoggle"); tg.insertAdjacentHTML("afterbegin", '<button type="button" data-t="cum"' + (dashState.trend === "cum" ? ' class="on2"' : "") + ">" + t("累计", "Cumulative") + '</button><button type="button" data-t="monthly"' + (dashState.trend === "monthly" ? ' class="on2"' : "") + ">" + t("按月", "Monthly") + "</button>"); tg.addEventListener("click", function (e) { var b = e.target.closest("button[data-t]"); if (!b) return; dashState.trend = b.getAttribute("data-t"); renderDashboard(); }); }
    drawCharts();
    // 许可: seats by title (allocated vs total), the people-with-a-seat curve, the expiring pools.
    if ($("dLic")) loadLicenses(false).then(function (d) {
      var card = $("dLic"); if (!card) return; var sm = d.summary;
      var draw = function (w) {
        if (!sm.pools) return '<p class="muted">' + t("还没有许可池。", "No licence pools yet.") + ' <a href="#/ops/licenses">' + t("去建一个 →", "Create one →") + "</a></p>";
        return '<div class="sharekeys" style="margin:0 0 8px"><span><b>' + fmtNum(sm.seats) + '</b> ' + t("份", "seats") + "</span><span><b>" + fmtNum(sm.allocated) + "</b> " + t("已分配", "allocated") + "</span><span><b>" + fmtNum(sm.users) + "</b> " + t("人有座位", "people") + "</span><span><b>" + fmtNum(sm.expiringSoon) + "</b> " + t("池 90 天内到期", "pools expiring in 90 d") + "</span></div>" +
          columnsChart(w, { x: sm.bySku.slice(0, 8).map(function (x) { return x.sku; }), series: [{ name: t("已分配", "Allocated"), values: sm.bySku.slice(0, 8).map(function (x) { return x.allocated; }), color: VIZ.seq }, { name: t("余量", "Balance"), values: sm.bySku.slice(0, 8).map(function (x) { return x.qty - x.allocated; }), color: VIZ.seq3 }], fmt: fmtNum, labelAll: true, height: 200 }) +
          (Object.keys(sm.byRegion || {}).length ? '<div class="sharekeys" style="margin-top:8px">' + Object.keys(sm.byRegion).map(function (k) { return "<span>" + esc(t((REGION_L[k] || [k, k])[0], (REGION_L[k] || [k, k])[1])) + " <b>" + sm.byRegion[k] + "</b></span>"; }).join("") + "</div>" : "");
      };
      vizDraws.push({ id: "dLic", draw: draw });
      card.querySelector(".vbody").innerHTML = draw(card.querySelector(".vbody").clientWidth);
      card.querySelector(".vtable").innerHTML = dataTable([t("池", "Pool"), t("教材", "Title"), t("持有方", "Holder"), t("份数", "Seats"), t("已分配", "Allocated"), t("余量", "Balance"), t("有效期至", "Valid to")], d.pools.map(function (p) { return [p.id, p.sku, holderName(p.holder), fmtNum(p.qty), fmtNum(p.allocated), fmtNum(p.balance), p.validTo || "—"]; }));
    }).catch(function () { var body = $("dLic") && $("dLic").querySelector(".vbody"); if (body) body.innerHTML = '<p class="muted">' + t("许可数据暂不可用。", "Licence data is not available.") + "</p>"; });
    // 动态: the CRM's audit lines, in plain words.
    if ($("dFeedList")) api("crm/feed?limit=30").then(function (r) {
      var el = $("dFeedList"); if (!el) return;
      if (!r.ok) { el.innerHTML = '<div class="orow muted">' + esc(errText(r)) + "</div>"; return; }
      var say = function (e) {
        var who = e.by || e.actor || "";
        switch (e.action) {
          case "crm.entry.order": return t("录入订单 ", "Entered order ") + (e.orderId || "") + (e.newCustomer ? t("（新客户）", " (new customer)") : "");
          case "crm.entry.received": return t("记录实收 ", "Recorded received ") + fmtMoney(e.received);
          case "crm.order.status": return (e.orderId || "") + " " + stTag(e.from) + " → " + stTag(e.to);
          case "crm.orders.import": return t("导入课程订单 ", "Imported course orders ") + (e.created || 0);
          case "crm.equip.sync": return t("Equip 同步 ", "Equip sync ") + ((e.counts || {}).orders || 0) + t(" 单", " orders");
          case "crm.people.merge": return t("合并判定：", "Merge verdict: ") + (e.verdict === "same" ? t("同一人", "same person") : t("不同人", "different"));
          case "crm.people.rebuild": return t("人员库重新匹配，", "People hub rebuilt, ") + ((e.stats || {}).people || 0) + t(" 人", " people");
          case "crm.people.writeback": return t("回写 CRM ID ", "CRM IDs written back ") + (e.written || 0);
          case "crm.email.replace": return t("邮箱替换标记：", "Email replacement: ") + (e.status || "") + " · " + (e.crmId || "");
          case "crm.royalty.paid": return t("版税 ", "Royalty ") + (e.publisher || "") + " " + (e.quarter || "") + (e.paid ? t(" 标记已付", " marked paid") : t(" 撤销已付", " unmarked"));
          case "crm.partner.update": return t("机构合作阶段：", "Partnership: ") + (e.domain || "") + " → " + (e.stage || "—");
          case "crm.digest": return t("待处理摘要已发给 ", "Digest sent to ") + ((e.to || []).join(", ") || "");
          case "crm.license.pool": return t("新建许可池 ", "New licence pool ") + (e.id || "") + " · " + (e.sku || "") + " × " + (e.qty || 0);
          case "crm.license.allocate": return t("分配许可 ", "Allocated ") + (e.qty || 0) + t(" 份 → ", " seats → ") + ((e.to && (e.to.name || e.to.crmId || e.to.domain)) || "");
          case "crm.license.revoke": return t("撤销许可分配 ", "Revoked allocation ") + (e.id || "");
          default: return e.action;
        }
      };
      el.innerHTML = r.body.feed.length ? r.body.feed.map(function (e) { return '<div class="orow"><div class="omain"><b>' + say(e) + '</b><span class="sub">' + esc(when(e.at) + ((e.by || e.actor) ? " · " + (e.by || e.actor) : "")) + "</span></div></div>"; }).join("") : '<div class="orow muted">' + t("还没有动态。", "Nothing yet.") + "</div>";
    });
    // 长尾 from the catalogue: by publisher (bars), and the list behind 表.
    if ($("dTail")) api("crm/catalogue").then(function (r) {
      var card = $("dTail"); if (!card) return;
      if (!r.ok) { card.querySelector(".vbody").innerHTML = '<p class="muted">' + esc(errText(r)) + "</p>"; return; }
      var cutoff = addMonths(curMonth(), -12) + "-01";
      var tail = r.body.skus.filter(function (k) { return k.available && (!k.lastSale || k.lastSale < cutoff); }).sort(function (a, b) { return String(a.lastSale || "").localeCompare(String(b.lastSale || "")) || a.sku.localeCompare(b.sku); });
      var avail = r.body.skus.filter(function (k) { return k.available; }).length;
      var byPub = {}; tail.forEach(function (k) { var pk = k.publisher || t("未知", "Unknown"); byPub[pk] = (byPub[pk] || 0) + 1; });
      var rows = Object.keys(byPub).map(function (k) { return { label: k, value: byPub[k] }; }).sort(function (a, b) { return b.value - a.value; });
      card.querySelector(".ch h2 .n").textContent = tail.length + " / " + avail + t(" 种在售教材 · 按出版社", " available titles · by publisher");
      var draw = function (w) { return rows.length ? barsChart(w, { rows: rows, fmt: fmtNum, name: t("种", "titles") }) : '<p class="muted">' + t("在售教材一年内都有售出。", "Every available title sold within the year.") + "</p>"; };
      vizDraws.push({ id: "dTail", draw: draw });
      card.querySelector(".vbody").innerHTML = draw(card.querySelector(".vbody").clientWidth);
      card.querySelector(".vtable").innerHTML = dataTable(["SKU", t("名称", "Title"), t("出版社", "Publisher"), t("类别", "Category"), t("最近售出", "Last sold"), t("累计件数", "Units ever")], tail.map(function (k) { return [k.sku, EN ? (k.nameEn || k.nameZh) : (k.nameZh || k.nameEn), k.publisher, k.category, k.lastSale || t("从未", "never"), fmtNum(k.unitsEver)]; }));
    });
    // 合作伙伴: the institutions, this school year's sales (or accounts when amounts are hidden), stage chips.
    if ($("dPartners")) loadInstitutionsCrm(false).then(function (d) {
      var body = $("dPartners") && $("dPartners").querySelector(".vbody"); if (!body) return;
      var rows = d.rows.slice().sort(function (a, b) { return (b.fySales || 0) - (a.fySales || 0) || b.accounts - a.accounts; }).slice(0, 8);
      var bars = rows.map(function (r) { return { label: instName(r), value: seeMoney ? (r.fySales || 0) : r.accounts, sub: (r.partner && STAGES_P[r.partner.stage] ? t(STAGES_P[r.partner.stage][0], STAGES_P[r.partner.stage][1]) + " · " : "") + fmtNum(r.customers) + t(" 客户 · ", " customers · ") + fmtNum(r.accounts) + t(" 账号", " accounts") }; });
      var byStage = {}; d.rows.forEach(function (r) { var st = r.partner && r.partner.stage; if (st) byStage[st] = (byStage[st] || 0) + 1; });
      body.innerHTML = '<div class="vlegend">' + Object.keys(STAGES_P).map(function (k) { return "<span>" + pstTag(k) + " " + (byStage[k] || 0) + "</span>"; }).join("") + '<a href="#/ops/institutions" style="margin-left:auto">' + t("全部机构 →", "All institutions →") + "</a></div>" + barsChart(body.clientWidth, { rows: bars, fmt: seeMoney ? fmtMoney : fmtNum, name: seeMoney ? t("本学年销售", "SY sales") : t("账号", "accounts") });
    }).catch(function () { var body = $("dPartners") && $("dPartners").querySelector(".vbody"); if (body) body.innerHTML = '<p class="muted">' + t("机构数据暂不可用。", "Institution data is not available.") + "</p>"; });
    // The daily digest to the order manager (decision 18): who gets it, when it last went, send now.
    if ($("dDigest")) api("crm/digest").then(function (r) {
      var el = $("dDigest"); if (!el) return;
      if (!r.ok) { el.innerHTML = '<span class="muted">' + esc(errText(r)) + "</span>"; return; }
      var b = r.body, last = b.last;
      el.innerHTML = '<span class="muted">' + esc(t("每日摘要发给 ", "Daily digest to ") + (b.to.length ? b.to.join(", ") : t("（没有订单经理账号，请在角色分配里指定）", "(nobody holds the order-manager role yet)")) + (last ? t(" · 上次 ", " · last ") + day(last.at) + (last.ok ? "" : t("（失败）", " (failed)")) : t(" · 尚未发送过", " · not sent yet")) + (b.configured ? "" : t(" · 未配置通知流程", " · notification flow not configured")) + (b.channel ? t(" · 频道来自 ", " · channel from ") + b.channelFrom : t(" · 没有 Teams 频道：请在 Airtable 学校表加一行 CRM 并填 Teams Channel ID", " · no Teams channel: add a CRM row with a Teams Channel ID to the Schools table"))) + "</span>" +
        '<button type="button" class="btn secondary sm" id="dSend">' + t("现在发送", "Send now") + "</button>";
      $("dSend").addEventListener("click", function () {
        var btn = $("dSend"); if (!window.confirm(t("把当前的待处理与异常发给订单经理（Teams + 邮件）？", "Send the current to-do and exceptions to the order manager (Teams + email)?"))) return;
        savingButton(btn, t("发送中…", "Sending…"));
        post("crm/digest", "POST", {}).then(function (r2) {
          restoreButton(btn);
          if (!r2.ok) { flash(esc((r2.body && r2.body.message) || errText(r2)), 10000); return; }
          if (r2.body.sent) flashOk(esc(t("已发送给 ", "Sent to ") + r2.body.to.join(", ") + t("，共 " + r2.body.total + " 项。", ", " + r2.body.total + " items.")), 6000);
          else flash(esc(t("通知流程返回 HTTP " + r2.body.status + "，未能发送。", "The notification flow answered HTTP " + r2.body.status + "; not sent.")), 10000);
        });
      });
    });
    var asOf = [(equipState.status || {}).syncedAt, hub && hub.generatedAt].filter(Boolean).sort()[0];
    $("dfoot").innerHTML = esc((asOf ? t("数据截至 ", "Data as of ") + when(asOf) + " · " : "") + (seeMoney ? "" : t("金额按角色隐藏，图表以件数计 · ", "Amounts hidden for this role; charts count units · ")) + t("学年从 8 月起算", "School year from August"));
  }
  function exportDashboardCsv() {
    var cell = function (v) { v = String(v == null ? "" : v).replace(/\s+/g, " ").trim(); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var lines = [[t("蜂巢 CRM 经营仪表盘", "Hive CRM dashboard"), new Date().toISOString().slice(0, 10), periodMonths(dashState.period).label].map(cell).join(",")];
    // the tiles
    lines.push(""); lines.push(cell(t("指标", "Tiles")));
    document.querySelectorAll("#dkpi .kpi").forEach(function (k) { var l = k.querySelector(".l"), v = k.querySelector(".v"), sub = k.querySelector(".s"); lines.push([l && l.textContent, v && v.textContent, sub && sub.textContent].map(cell).join(",")); });
    // every panel's table
    document.querySelectorAll("#dgrid .card").forEach(function (c) {
      var h = c.querySelector(".ch h2"); if (!h) return;
      var title = (h.childNodes[0] && h.childNodes[0].textContent || "").trim(), sub = h.querySelector(".n");
      var tbl = c.querySelector("table.vt");
      lines.push(""); lines.push([title, sub ? sub.textContent : ""].map(cell).join(","));
      if (tbl) tbl.querySelectorAll("tr").forEach(function (tr) { lines.push(Array.prototype.map.call(tr.children, function (td) { return cell(td.textContent); }).join(",")); });
      else c.querySelectorAll(".olist .orow").forEach(function (row) { lines.push(Array.prototype.map.call(row.children, function (d) { return cell(d.textContent); }).join(",")); });
    });
    var blob = new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "dashboard-" + new Date().toISOString().slice(0, 10) + ".csv"; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }
  $("content").addEventListener("click", function (e) {
    var k = e.target.closest("#dkpi .kpi[data-go]"); if (k) { location.hash = k.getAttribute("data-go"); return; }
    var a = e.target.closest("#dTodo a[data-tab]"); if (a) { var tb = a.getAttribute("data-tab"); if (/people/.test(a.getAttribute("href"))) peopleState.tab = tb; else ordersState.tab = tb; }
  });

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
    // A notice belongs to the page that raised it (Rick, 2026-10-07: a sync notice was still
    // showing on 蜂巢课程订单 after switching tabs).
    if ($("flash")) { $("flash").hidden = true; clearTimeout(flash.timer); }
    // Staff land on the dashboard (design §5); everyone else on their profile.
    var h = location.hash || (isStaff() ? "#/dashboard" : "#/account");
    nav();
    if (!me) return;
    if (h.indexOf("#/dashboard") === 0) { if (!isStaff() && !canSeeOrders()) { location.hash = "#/account"; return; } return viewDashboard(); }
    if (h.indexOf("#/teams") === 0) return viewTeams();
    if (h.indexOf("#/security") === 0) return viewSecurity();
    if (h.indexOf("#/domain") === 0) {
      if (!domainsInfo || !domainsInfo.domains.length) { location.hash = "#/account"; return; }
      if (!currentDomain) currentDomain = (domainsInfo.domains.filter(function (d) { return d.domain === domainsInfo.mine; })[0] || domainsInfo.domains[0]).domain;
      return h.indexOf("#/domain/groups") === 0 ? viewGroups() : h.indexOf("#/domain/handbook") === 0 ? viewHandbook() : viewUsers();
    }
    if (h.indexOf("#/ops") === 0) {
      if (!canSeeOrders()) { location.hash = "#/account"; return; }
      return h.indexOf("#/ops/people") === 0 ? viewPeople() : h.indexOf("#/ops/royalty") === 0 ? (canSeeRoyalty() ? viewRoyalty() : viewOrders()) : h.indexOf("#/ops/institutions") === 0 ? (crmLevel("partners") !== "none" ? viewInstitutionsCrm() : viewOrders()) : h.indexOf("#/ops/licenses") === 0 ? (crmLevel("drm") !== "none" ? viewLicenses() : viewOrders()) : viewOrders();
    }
    if (h.indexOf("#/system") === 0) {
      if (!isAdmin()) { if (canAssignRoles() && h.indexOf("#/system/roles") === 0) return viewRoles(); location.hash = "#/account"; return; }
      return h.indexOf("#/system/sync") === 0 ? viewSync() : h.indexOf("#/system/institutions") === 0 ? viewInstitutions() : viewRoles();
    }
    viewAccount();
  }
  // Column widths can be dragged (Rick, 2026-10-05: 「这些栏，可否左右拖动？其它类似页面也是」):
  // every table.data gets a handle at the right edge of each header cell; the widths
  // are kept per table in localStorage; double-click a handle to reset that column.
  function colResize(table) {
    if (!table || table.getAttribute("data-rz")) return;
    table.setAttribute("data-rz", "1");
    var key = "fc-cols-" + (table.id || "t"), saved = {};
    try { saved = JSON.parse(localStorage.getItem(key) || "{}") || {}; } catch (e) { saved = {}; }
    var ths = Array.prototype.slice.call(table.querySelectorAll("thead th"));
    if (!ths.length) return;
    // With automatic layout the browser shares the width out itself, so a dragged width
    // would be ignored: the first drag freezes every column at its current width
    // (table-layout: fixed), after which each one moves on its own.
    function freeze() {
      if (table.style.tableLayout === "fixed") return;
      ths.forEach(function (th, i) { if (!saved[i]) saved[i] = Math.round(th.getBoundingClientRect().width); th.style.width = saved[i] + "px"; });
      table.style.tableLayout = "fixed"; table.style.minWidth = "0"; fit();
    }
    function fit() { var sum = 0; ths.forEach(function (th, i) { sum += saved[i] || th.getBoundingClientRect().width; }); table.style.width = Math.max(sum, table.parentElement ? table.parentElement.clientWidth : 0) + "px"; }
    function reset() { saved = {}; ths.forEach(function (th) { th.style.width = ""; }); table.style.tableLayout = ""; table.style.width = ""; table.style.minWidth = ""; try { localStorage.removeItem(key); } catch (err) {} }
    if (Object.keys(saved).length === ths.length) { ths.forEach(function (th, i) { th.style.width = saved[i] + "px"; }); table.style.tableLayout = "fixed"; table.style.minWidth = "0"; fit(); }
    ths.forEach(function (th, i) {
      var h = document.createElement("span"); h.className = "rz"; h.setAttribute("aria-hidden", "true"); h.title = t("拖动调整列宽；双击恢复默认", "Drag to resize; double-click to reset"); th.appendChild(h);
      h.addEventListener("pointerdown", function (e) {
        e.preventDefault(); e.stopPropagation(); freeze();
        var startX = e.clientX, startW = saved[i];
        table.classList.add("resizing");
        function move(ev) { var w = Math.max(60, Math.round(startW + ev.clientX - startX)); th.style.width = w + "px"; saved[i] = w; fit(); }
        function up() { document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up); table.classList.remove("resizing"); try { localStorage.setItem(key, JSON.stringify(saved)); } catch (err) {} }
        document.addEventListener("pointermove", move); document.addEventListener("pointerup", up);
      });
      h.addEventListener("dblclick", function (e) { e.preventDefault(); e.stopPropagation(); reset(); });
      h.addEventListener("click", function (e) { e.stopPropagation(); });
    });
  }
  // The height of the sticky KPI row, so the table headings can stick just below it.
  function stickyOffsets() {
    var k = $("content").querySelector(".kpis");
    var h = k && getComputedStyle(k).position === "sticky" ? k.offsetHeight : 0;
    $("content").style.setProperty("--kpi-h", h + "px");
    // a sticky toolbar under the tiles (人员库) pushes the table headings down by its own height
    var b = $("content").querySelector(".toolbar.sticky");
    $("content").style.setProperty("--bar-h", (b && getComputedStyle(b).position === "sticky" ? b.offsetHeight : 0) + "px");
  }
  new MutationObserver(function () { document.querySelectorAll("table.data").forEach(colResize); stickyOffsets(); }).observe($("content"), { childList: true, subtree: true });
  window.addEventListener("resize", debounce(stickyOffsets, 100));
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
