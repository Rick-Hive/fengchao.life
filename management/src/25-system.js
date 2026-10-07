// management/src/25-system.js — 系统: 角色分配, 数据同步; 操作手册 shown in place.
// Part of management.js: scripts/build-management.js concatenates management/src/*.js in name order
// into management/management.js (one closure; every part sees every other's functions). Edit here, not the built file.

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
        '<div class="kpis compact"><div class="kpi"><div class="l">' + t("上次同步", "Last synced") + '</div><div class="v" style="font-size:1rem" id="sLast">—</div></div><div class="kpi"><div class="l">' + t("毕业路径", "Tracks") + '</div><div class="v" id="sT">—</div></div><div class="kpi"><div class="l">' + t("课程", "Courses") + '</div><div class="v" id="sC">—</div></div><div class="kpi"><div class="l">' + t("学科", "Subjects") + '</div><div class="v" id="sS">—</div></div></div>' +
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
