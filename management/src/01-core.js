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

  // desc: the page's description — a string or { info: "…" } — shown behind an ⓘ beside
  // the title, never as a line under it (Rick, 2026-10-08: 「Use little i to hint. Apply
  // with all headings」; earlier the same for the People Hub's long description).
  function setTitle(crumb, title, actionsHtml, desc) {
    var info = desc && typeof desc === "object" ? desc.info : (desc || "");
    $("title").innerHTML = (crumb ? '<span class="crumb">' + esc(crumb) + "</span>" : "") + (title ? '<span class="ttl">' + esc(title) + (info ? ' <span class="info big" tabindex="0" data-tip="' + esc(info) + '">i</span>' : "") + "</span>" : "") + "";
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

