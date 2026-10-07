// management/src/90-router.js — Boot (me/summary, domains) and the hash router.
// Part of management.js: scripts/build-management.js concatenates management/src/*.js in name order
// into management/management.js (one closure; every part sees every other's functions). Edit here, not the built file.

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
