// 蜂巢 管理中心 — one page, hash-routed. Views:
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
  document.title = t("蜂巢 · 管理中心", "Hive · Hub");
  document.getElementById("brandTag").textContent = t("管理中心", "Hub");
  document.getElementById("fOut").textContent = t("退出", "Sign out");
  var langBtn = document.getElementById("langBtn");
  langBtn.textContent = EN ? "中文" : "EN";
  langBtn.addEventListener("click", function () {
    try { localStorage.setItem("fc-lang", EN ? "zh" : "en"); } catch (e) {}
    location.reload();
  });

  // ---- helpers -------------------------------------------------------------------
  function $(id) { return document.getElementById(id); }
  function esc(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function api(path, opts) {
    return fetch("/api/" + path, Object.assign({ credentials: "same-origin", cache: "no-store" }, opts || {})).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        // The server ended the session (idle / maximum age): leave for the homepage, which explains.
        if (r.status === 401 && j && j.code === "session_expired" && window.fcSession) window.fcSession.expired(j.reason);
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
        { hash: "#/account", icon: "user", zh: "概览", en: "Overview" },
        { hash: "#/teams", icon: "teams", zh: "我的 Teams", en: "My Teams" },
      ] },
    ];
    if (domainsInfo && domainsInfo.domains && domainsInfo.domains.length) {
      groups.push({ title: domainsInfo.all ? t("机构管理", "Institutions") : t("本域管理", "My domain"), items: [
        { hash: "#/domain/users", icon: "users", zh: "用户", en: "Users" },
        { hash: "#/domain/groups", icon: "tree", zh: "Teams 群组", en: "Teams groups" },
      ] });
    }
    var roles = (me && me.roles) || [];
    if (roles.indexOf("admin") >= 0) {
      groups.push({ title: t("系统", "System"), items: [
        { hash: "#/system/roles", icon: "key", zh: "角色分配", en: "Roles" },
        { hash: "#/system/sync", icon: "sync", zh: "数据同步", en: "Data sync" },
        { href: "/crm/", icon: "cart", zh: "EquipMe 订单录入", en: "EquipMe order entry" },
      ] });
    } else if (roles.indexOf("crm_entry") >= 0) {
      groups.push({ title: t("工具", "Tools"), items: [{ href: "/crm/", icon: "cart", zh: "EquipMe 订单录入", en: "EquipMe order entry" }] });
    }
    var cur = location.hash || "#/account";
    $("nav").innerHTML = groups.map(function (g) {
      return '<div class="nav-group"><div class="nav-title">' + esc(g.title) + "</div>" + g.items.map(function (it) {
        var active = it.hash && cur.indexOf(it.hash) === 0;
        return '<a class="nav-item' + (active ? " active" : "") + '" href="' + esc(it.hash || it.href) + '">' + ICON[it.icon] + "<span>" + esc(t(it.zh, it.en)) + "</span>" + (it.href ? '<span class="ext">↗</span>' : "") + "</a>";
      }).join("") + "</div>";
    }).join("");
  }
  function foot() {
    var p = me && me.profile;
    $("fAvatar").textContent = initials(p ? p.displayName || p.upn : "?");
    $("fName").textContent = p ? (p.displayName || p.upn) : t("未登录", "Signed out");
    $("fUpn").textContent = p ? p.upn : "";
  }
  $("fOut").addEventListener("click", function () {
    var b = $("fOut"); b.disabled = true;
    fetch("/api/logout", { method: "POST", credentials: "same-origin", cache: "no-store" }).catch(function () {})
      .then(function () { return fetch("/.auth/me", { credentials: "same-origin", cache: "no-store" }); })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        try { new BroadcastChannel("fc-auth").postMessage({ kind: "out", at: Date.now() }); } catch (e) {}
        try { localStorage.setItem("fc-auth-event", "out:" + Date.now()); } catch (e) {}
        if (j && j.clientPrincipal) location.href = "/.auth/logout?post_logout_redirect_uri=/"; else location.replace("/");
      })
      .catch(function () { location.href = "/.auth/logout?post_logout_redirect_uri=/"; });
  });
  function closeDrawer() { $("side").classList.remove("open"); $("scrim").classList.remove("show"); }
  $("menuToggle").addEventListener("click", function () { $("side").classList.toggle("open"); $("scrim").classList.toggle("show"); });
  $("scrim").addEventListener("click", closeDrawer);
  $("nav").addEventListener("click", function (e) { if (e.target.closest("a")) closeDrawer(); });
  // Signed out in another tab → leave.
  try { new BroadcastChannel("fc-auth").onmessage = function (e) { if (e && e.data && e.data.kind === "out") location.replace("/"); }; } catch (e) {}
  window.addEventListener("storage", function (e) { if (e.key === "fc-auth-event" && /^out:/.test(e.newValue || "")) location.replace("/"); });

  function setTitle(crumb, title, actionsHtml) {
    $("title").innerHTML = (crumb ? '<span class="crumb">' + esc(crumb) + "</span>" : "") + esc(title);
    $("topActions").innerHTML = actionsHtml || "";
  }
  function panelOpen(html) { var p = $("panel"); p.innerHTML = html; p.classList.add("open"); p.setAttribute("aria-hidden", "false"); }
  function panelClose() { var p = $("panel"); p.classList.remove("open"); p.setAttribute("aria-hidden", "true"); document.querySelectorAll("table.data tr.sel").forEach(function (tr) { tr.classList.remove("sel"); }); }
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") { panelClose(); closeDrawer(); } });
  $("panel").addEventListener("click", function (e) { if (e.target.closest(".x")) panelClose(); });

  // ================================================================================
  // 我的账号 › 概览
  // ================================================================================
  var KIND = { authenticator: ["验证器", "Authenticator"], fido2: ["安全密钥", "Security key"], phone: ["手机", "Phone"], email: ["邮箱", "Email"], softwareOath: ["验证码应用", "Code app"], tap: ["临时通行码", "Temporary Access Pass"], windowsHello: ["Windows Hello", "Windows Hello"] };
  // ---- 补充资料: city, needs, children and their Teams accounts (Rick, 2026-10-02) ----
  var VOCAB_EN = {
    "家长": "Parent", "学生": "Student", "老师": "Teacher", "行政": "Staff",
    "学前": "Pre-K", "K": "K", "大学": "University", "其它": "Other",
    "公立学校": "Public school", "私立学校": "Private school", "基督教学校": "Christian school", "在家教育": "Homeschool",
    "古典教育": "Classical", "BJU": "BJU", "Abeka": "Abeka", "混合": "Mixed",
    "海外上大学": "University abroad", "国内上大学": "University in China", "未定": "Undecided",
    "教材": "Textbooks", "课程": "Courses", "家长/教师培训": "Parent / teacher training", "亲子培训": "Parent–child training",
    "海外留学": "Study abroad", "大学路径": "University pathway", "双学分/AP课程": "Dual credit / AP courses",
  };
  function vl(v) { return EN ? (VOCAB_EN[v] || v) : v; }
  var extraDraft = null; // the form's working copy, so adding a child does not lose typed values
  function readExtraForm() {
    var d = { city: ($("xCity") || {}).value || "", needs: [], needsOther: ($("xNeedsOther") || {}).value || "", children: [] };
    Array.prototype.forEach.call(document.querySelectorAll("#extraCard input[data-need]:checked"), function (c) { d.needs.push(c.getAttribute("data-need")); });
    Array.prototype.forEach.call(document.querySelectorAll("#extraCard .kid"), function (k) {
      var g = function (n) { var el = k.querySelector("[data-k='" + n + "']"); return el ? el.value : ""; };
      d.children.push({ name: g("name"), age: g("age"), grade: g("grade"), schooling: g("schooling"), model: g("model"), modelOther: g("modelOther"), higherEd: g("higherEd"), account: g("account") });
    });
    return d;
  }
  function renderExtra(msgHtml) {
    var hv = me.hive || {}, voc = hv.vocab || { grades: [], schooling: [], models: [], higherEd: [], needs: [], maxChildren: 8 };
    var d = extraDraft || hv.extra || { city: "", needs: [], needsOther: "", children: [] };
    extraDraft = d;
    var sel = function (name, list, val, i) {
      return '<select data-k="' + name + '"><option value="">' + t("请选择", "Choose") + "</option>" + list.map(function (o) { return '<option value="' + esc(o) + '"' + (o === val ? " selected" : "") + ">" + esc(vl(o)) + "</option>"; }).join("") + "</select>";
    };
    var kids = (d.children || []).map(function (c, i) {
      return '<div class="kid"><div class="kid-head"><b>' + t("孩子 ", "Child ") + (i + 1) + '</b><button class="btn ghost sm" type="button" data-rm="' + i + '">' + t("移除", "Remove") + "</button></div>" +
        '<div class="grid2">' +
          '<label class="f">' + t("称呼（可不填）", "Name (optional)") + '<input type="text" data-k="name" maxlength="30" value="' + esc(c.name || "") + '" /></label>' +
          '<label class="f">' + t("年龄", "Age") + '<input type="number" data-k="age" min="1" max="30" value="' + esc(c.age == null ? "" : c.age) + '" /></label>' +
          '<label class="f">' + t("年级", "Grade") + sel("grade", voc.grades, c.grade, i) + "</label>" +
          '<label class="f">' + t("学习方式", "Schooling") + sel("schooling", voc.schooling, c.schooling, i) + "</label>" +
          '<label class="f">' + t("教育模式", "Education model") + sel("model", voc.models, c.model, i) + "</label>" +
          '<label class="f model-other' + (c.model === "其它" ? "" : " hidden") + '">' + t("其它教育模式（请填写）", "Other model — which?") + '<input type="text" data-k="modelOther" maxlength="60" value="' + esc(c.modelOther || "") + '" /></label>' +
          '<label class="f">' + t("高等教育计划", "Higher-education plan") + sel("higherEd", voc.higherEd, c.higherEd, i) + "</label>" +
          '<label class="f">' + t("孩子的 Teams 账号（如有）", "Child's Teams account (if any)") + '<input type="text" data-k="account" maxlength="120" placeholder="name@school-domain" value="' + esc(c.account || "") + '" /><small>' + t("填了就会把您和孩子的账号关联起来。", "Filling this links your account and the child's.") + "</small></label>" +
        "</div></div>";
    }).join("");
    $("extraCard").innerHTML =
      "<h2>" + t("补充资料", "More about you") + (hv.identity ? ' <span class="tag accent">' + esc(vl(hv.identity)) + "</span>" : "") + "</h2>" +
      '<p class="sub">' + t("帮助蜂巢了解您的需要：所在城市、最需要的帮助、孩子的情况。只有您自己和学校的管理员能看到。", "Helps Hive understand what you need: your city, what you need most, and your children. Only you and your school's administrators can see it.") + "</p>" +
      '<form id="xf" autocomplete="off">' +
        '<div class="grid2"><label class="f">' + t("所在城市", "City") + '<input type="text" id="xCity" maxlength="40" value="' + esc(d.city || "") + '" /></label></div>' +
        '<div class="f-title">' + t("最需要的（可多选）", "What you need most (choose any)") + "</div>" +
        '<div class="chks">' + (voc.needs || []).map(function (n) { return '<label class="chk"><input type="checkbox" data-need="' + esc(n) + '"' + ((d.needs || []).indexOf(n) >= 0 ? " checked" : "") + " /> " + esc(vl(n)) + "</label>"; }).join("") + "</div>" +
        '<label class="f needs-other' + ((d.needs || []).indexOf("其它") >= 0 ? "" : " hidden") + '">' + t("其它（请填写）", "Other — please say") + '<input type="text" id="xNeedsOther" maxlength="80" value="' + esc(d.needsOther || "") + '" /></label>' +
        '<div class="f-title">' + t("我的孩子", "My children") + (hv.linked && hv.linked.length ? ' <small class="faint">' + t("已关联账号：", "Linked accounts: ") + esc(hv.linked.join(", ")) + "</small>" : "") + "</div>" +
        '<div id="kids">' + (kids || '<div class="empty">' + t("还没有添加孩子。", "No children added yet.") + "</div>") + "</div>" +
        '<div class="actions"><button class="btn ghost" type="button" id="xAdd"' + ((d.children || []).length >= (voc.maxChildren || 8) ? " disabled" : "") + ">" + t("＋ 添加孩子", "+ Add a child") + '</button><button class="btn" type="submit" id="xSave">' + t("保存补充资料", "Save") + "</button></div>" +
        '<div id="xMsg">' + (msgHtml || "") + "</div>" +
      "</form>";
    $("xAdd").addEventListener("click", function () { extraDraft = readExtraForm(); extraDraft.children.push({}); renderExtra(); var last = document.querySelector("#kids .kid:last-child input"); if (last) last.focus(); });
    $("kids").addEventListener("click", function (ev) {
      var b = ev.target.closest("button[data-rm]"); if (!b) return;
      extraDraft = readExtraForm(); extraDraft.children.splice(Number(b.getAttribute("data-rm")), 1); renderExtra();
    });
    $("extraCard").addEventListener("change", function (ev) {
      var el = ev.target;
      if (el.getAttribute("data-k") === "model") el.closest(".kid").querySelector(".model-other").classList.toggle("hidden", el.value !== "其它");
      if (el.getAttribute("data-need") === "其它") document.querySelector("#extraCard .needs-other").classList.toggle("hidden", !el.checked);
    });
    $("xf").addEventListener("submit", function (ev) {
      ev.preventDefault();
      var body = readExtraForm();
      $("xSave").disabled = true;
      post("me/extra", "PATCH", body).then(function (r) {
        $("xSave").disabled = false;
        if (!r.ok) { $("xMsg").innerHTML = '<div class="msg err">' + esc(errText(r)) + (r.body && r.body.problems ? "<br>" + esc(r.body.problems.join("；")) : "") + "</div>"; return; }
        me.hive = Object.assign({}, me.hive, { extra: r.body.extra, linked: r.body.linked || [], identity: r.body.identity || (me.hive && me.hive.identity) || "" });
        extraDraft = null;
        var names = r.body.childNames || {}, linkedNote = Object.keys(names).length ? " " + t("已关联：", "Linked: ") + Object.keys(names).map(function (a) { return (names[a] ? names[a] + " · " : "") + a; }).join("，") : "";
        renderExtra('<div class="msg ok">' + t("已保存。", "Saved.") + esc(linkedNote) + "</div>");
      });
    });
  }

  function viewAccount() {
    setTitle(t("我的账号", "My account"), t("概览", "Overview"));
    var p = me.profile, ms = (me.methods || []).filter(function (m) { return m.kind !== "password"; });
    var strong = ms.filter(function (m) { return m.strong; }).length;
    $("content").innerHTML =
      '<div class="kpis">' +
        '<div class="kpi"><div class="l">' + t("验证器设备", "Authenticator devices") + '</div><div class="v' + (strong ? "" : " bad") + '">' + strong + "</div></div>" +
        '<div class="kpi"><div class="l">' + t("账号创建", "Account created") + '</div><div class="v" style="font-size:1.05rem">' + esc(day(p.created) || "—") + "</div></div>" +
        '<div class="kpi"><div class="l">' + t("角色", "Roles") + '</div><div class="v" style="font-size:1.05rem">' + esc(roleNames(me.roles)) + "</div></div>" +
      "</div>" +
      '<div class="card"><h2>' + t("资料", "Profile") + '</h2><p class="sub">' + t("别人在 Teams、Outlook 里看到的名字，能联系到您的安全邮箱，以及邮编。", "Your name as others see it, a safe email where we can reach you, and your postcode.") + "</p>" +
        '<form id="pf" autocomplete="off"><div class="grid2">' +
          '<label class="f">' + t("Office 365 账号", "Office 365 account") + '<input type="text" value="' + esc(p.upn) + '" readonly /></label>' +
          '<label class="f">' + t("显示名", "Display name") + '<input type="text" id="pName" maxlength="64" value="' + esc(p.displayName) + '" required /></label>' +
          '<label class="f">' + t("安全邮箱", "Safe email") + '<input type="email" id="pSafe" value="' + esc(p.safeEmail) + '" placeholder="name@gmail.com" /><small>' + t("不能是 QQ、163 等国内免费邮箱。", "Not QQ, 163 or other mainland free mail.") + "</small></label>" +
          '<label class="f">' + t("邮编", "Postcode") + '<input type="text" id="pPost" maxlength="12" value="' + esc(p.postalCode) + '" /></label>' +
        '</div><div class="actions"><button class="btn" type="submit" id="pSave">' + t("保存", "Save") + '</button></div><div id="pMsg"></div></form></div>' +
      '<div class="card" id="extraCard"></div>' +
      '<div class="card"><h2>' + t("密码", "Password") + '</h2><p class="sub">' + t("两项都在微软自己的页面完成。改完后所有设备会退出一次登录，请先把装验证器的手机准备好。", "Both open Microsoft's own pages. Afterwards every device signs you out once — have the authenticator phone ready.") + "</p>" +
        '<div class="tiles"><a class="tile" href="https://mysignins.microsoft.com/security-info/password/change" target="_blank" rel="noopener"><b>' + t("修改密码 ↗", "Change password ↗") + "</b><span>" + t("记得现在的密码，想换一个。", "You know the current password.") + '</span></a>' +
        '<a class="tile" href="https://passwordreset.microsoftonline.com" target="_blank" rel="noopener"><b>' + t("忘记密码 ↗", "Forgot password ↗") + "</b><span>" + t("用 Authenticator 里的 6 位验证码自己重置。", "Reset it with the six-digit code in Authenticator.") + "</span></a></div></div>" +
      '<div class="card"><h2>' + t("验证器和登录方式", "Authenticator and sign-in methods") + ' <span class="n">' + ms.length + "</span></h2>" +
        '<p class="sub">' + t("每一台能批准您登录的手机或安全密钥。不再使用的，请删除。", "Each phone or security key that can approve your sign-ins. Remove any you no longer have.") + "</p>" +
        '<div id="methods">' + (ms.length ? ms.map(function (m) {
          var k = KIND[m.kind] || [m.kind, m.kind];
          var last = m.strong && strong <= 1;
          return '<div class="devrow"><span class="avatar">' + (m.kind === "fido2" ? "⚿" : "A") + '</span><div class="m"><b>' + esc(m.name || k[EN ? 1 : 0]) + '</b> <span class="tag accent">' + esc(k[EN ? 1 : 0]) + "</span>" + (m.detail ? "<small>" + esc(m.detail) + "</small>" : "") + (m.created ? "<small>" + t("添加于 ", "Added ") + esc(day(m.created)) + "</small>" : "") + "</div>" +
            (m.removable ? (last ? '<span class="tag warn">' + t("唯一的验证器", "Only authenticator") + "</span>" : '<button class="btn danger sm" type="button" data-del="' + esc(m.id) + '" data-name="' + esc(m.name || k[EN ? 1 : 0]) + '">' + t("删除", "Delete") + "</button>") : "") + "</div>";
        }).join("") : '<div class="empty">' + t("没有登记任何验证方式。", "No sign-in methods registered.") + "</div>") + "</div>" +
        '<div class="note">' + t("<b>换手机？</b>先在微软的<a href='https://mysignins.microsoft.com/security-info' target='_blank' rel='noopener'>「安全信息」↗</a>页面添加新手机，再回到这里删除旧手机。", "<b>Changing phones?</b> Add the new phone on Microsoft's <a href='https://mysignins.microsoft.com/security-info' target='_blank' rel='noopener'>Security info ↗</a> page first, then delete the old one here.") + '</div><div id="mMsg"></div></div>' +
      '<div class="card"><h2>' + t("登录记录和账号变动", "Sign-ins and account changes") + '</h2><p class="sub">' + t("最近 7 天微软记录的登录和账号变动，下载为文件；页面上不显示。", "The last 7 days of Microsoft's sign-in and audit records, as a file; nothing is shown on the page.") + "</p>" +
        '<div class="actions">' +
          '<a class="btn ghost" href="/api/me/export?kind=signins&format=csv" download>' + ICON.down + t("登录记录 CSV", "Sign-ins CSV") + "</a>" +
          '<a class="btn ghost" href="/api/me/export?kind=signins&format=json" download>' + ICON.down + t("登录记录 JSON", "Sign-ins JSON") + "</a>" +
          '<a class="btn ghost" href="/api/me/export?kind=audits&format=csv" download>' + ICON.down + t("账号变动 CSV", "Account changes CSV") + "</a>" +
          '<a class="btn ghost" href="/api/me/export?kind=audits&format=json" download>' + ICON.down + t("账号变动 JSON", "Account changes JSON") + "</a>" +
        "</div></div>";

    renderExtra();
    $("pf").addEventListener("submit", function (ev) {
      ev.preventDefault();
      var body = {}, name = $("pName").value.trim(), safe = $("pSafe").value.trim(), postc = $("pPost").value.trim();
      if (name !== p.displayName) body.displayName = name;
      if (safe.toLowerCase() !== (p.safeEmail || "").toLowerCase()) body.safeEmail = safe;
      if (postc !== (p.postalCode || "")) body.postalCode = postc;
      if (!Object.keys(body).length) { $("pMsg").innerHTML = '<div class="msg ok">' + t("没有改动。", "Nothing changed.") + "</div>"; return; }
      $("pSave").disabled = true;
      post("me/profile", "PATCH", body).then(function (r) {
        $("pSave").disabled = false;
        if (!r.ok) { $("pMsg").innerHTML = '<div class="msg err">' + esc(errText(r)) + "</div>"; return; }
        if (body.displayName !== undefined) p.displayName = name;
        if (body.safeEmail !== undefined) p.safeEmail = safe;
        if (body.postalCode !== undefined) p.postalCode = postc;
        foot();
        $("pMsg").innerHTML = '<div class="msg ok">' + t("已保存。Teams 里的显示名可能要几分钟才更新。", "Saved. Teams may take a few minutes to show the new name.") + "</div>";
      });
    });
    $("methods").addEventListener("click", function (ev) {
      var b = ev.target.closest("button[data-del]"); if (!b) return;
      var name = b.getAttribute("data-name");
      if (!window.confirm(t("删除「" + name + "」？删除后这台设备就不能再批准您的登录。", "Delete \"" + name + "\"? That device will no longer be able to approve your sign-ins."))) return;
      b.disabled = true;
      api("me/method/" + encodeURIComponent(b.getAttribute("data-del")), { method: "DELETE" }).then(function (r) {
        if (!r.ok) { b.disabled = false; $("mMsg").innerHTML = '<div class="msg err">' + esc(errText(r)) + "</div>"; return; }
        loadMe().then(viewAccount);
      });
    });
  }
  function roleNames(roles) {
    var map = { admin: ["管理员", "Administrator"], coordinator: ["Hive 协调员", "Hive coordinator"], crm_entry: ["录入员", "CRM data entry"] };
    var out = (roles || []).map(function (r) { var m = /^domain_admin:(.+)$/.exec(r); if (m) return t("域管理员 · ", "Domain admin · ") + m[1]; return map[r] ? map[r][EN ? 1 : 0] : r; });
    return out.length ? out.join(", ") : t("普通用户", "User");
  }

  // ================================================================================
  // 我的 Teams
  // ================================================================================
  var GKIND = { team: ["Teams 团队", "Team"], m365: ["Microsoft 365 群组", "Microsoft 365 group"], security: ["安全组", "Security group"], distribution: ["通讯组", "Distribution list"], other: ["群组", "Group"] };
  function teamRow(g, q) {
    var k = GKIND[g.kind] || GKIND.other;
    var vis = g.visibility ? (g.visibility === "Public" ? t("公开", "Public") : g.visibility === "Private" ? t("私密", "Private") : esc(g.visibility)) : k[EN ? 1 : 0];
    return '<div class="trow" data-id="' + esc(g.id) + '"><span class="tav" style="background:' + hue(g.id) + '">' + esc(initials(g.name)) + '</span>' +
      '<div class="tmain"><div class="tname">' + hl(g.name, q) + "</div><div class=\"tmeta\"><span>" + vis + "</span>" +
      (g.members != null ? "<span>" + g.members + t(" 人", " people") + "</span>" : "") +
      (g.visibility ? "<span>" + esc(k[EN ? 1 : 0]) + "</span>" : "") +
      (g.description ? '<span class="desc">' + hl(g.description, q) + "</span>" : "") + "</div></div>" +
      (g.owner ? '<span class="trole">' + t("所有者", "Owner") + "</span>" : '<span class="trole muted">' + t("成员", "Member") + "</span>") + "</div>";
  }
  function viewTeams() {
    setTitle(t("我的账号", "My account"), t("我的 Teams", "My Teams"));
    $("content").innerHTML =
      '<div class="toolbar" id="tbar">' +
        '<button class="chip" data-f="all" aria-pressed="true">' + t("全部", "All") + "</button>" +
        '<button class="chip" data-f="owner">' + t("我是所有者", "Teams you own") + "</button>" +
        '<button class="chip" data-f="team">' + t("Teams 团队", "Teams") + "</button>" +
        '<button class="chip" data-f="m365">' + t("Microsoft 365 群组", "M365 groups") + "</button>" +
        '<button class="chip" data-f="security">' + t("安全组", "Security groups") + "</button>" +
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
    if (state.teams) renderTeams();
    api("me/groups").then(function (r) {
      if (!r.ok) { $("tlist").innerHTML = '<div class="msg err">' + esc(errText(r)) + "</div>"; return; }
      state.teams = r.body.groups || [];
      renderTeams();
    });
  }
  function renderTeams() {
    if (!state.teams || !$("tlist")) return;
    var q = state.teamQ, f = state.teamFilter;
    var rows = state.teams.filter(function (g) {
      if (f === "owner" && !g.owner) return false;
      if ((f === "team" || f === "m365" || f === "security") && g.kind !== f) return false;
      if (q) { var hay = (g.name + " " + (g.description || "") + " " + (g.mail || "")).toLowerCase(); if (hay.indexOf(q.toLowerCase()) < 0) return false; }
      return true;
    });
    var order = { team: 0, m365: 1, security: 2, distribution: 3, other: 4 };
    rows.sort(function (a, b) {
      if (state.teamSort === "members") return (b.members || 0) - (a.members || 0) || a.name.localeCompare(b.name, "zh");
      if (state.teamSort === "kind") return order[a.kind] - order[b.kind] || a.name.localeCompare(b.name, "zh");
      return a.name.localeCompare(b.name, "zh");
    });
    $("tlist").innerHTML = rows.length ? rows.map(function (g) { return teamRow(g, q); }).join("") :
      '<div class="empty">' + (q ? t("没有匹配「" + q + "」的团队。", "No team matches \"" + q + "\".") : t("没有加入任何群组。", "Not a member of any group.")) + "</div>";
  }

  // ================================================================================
  // 本域管理 › 用户
  // ================================================================================
  function domainPicker(id) {
    var ds = (domainsInfo && domainsInfo.domains) || [];
    if (ds.length <= 1) return ds.length ? '<span class="tag accent">' + esc(ds[0].domain) + "</span>" : "";
    return '<select id="' + id + '">' + ds.map(function (d) { return '<option value="' + esc(d.domain) + '"' + (d.domain === currentDomain ? " selected" : "") + ">" + esc(d.domain) + "</option>"; }).join("") + "</select>";
  }
  function loadDomainData(kind, force) {
    var store = kind === "users" ? state.domainUsers : state.domainGroups;
    if (!force && store[currentDomain]) return Promise.resolve(store[currentDomain]);
    return api("domain/" + kind + "?domain=" + encodeURIComponent(currentDomain) + (force ? "&refresh=1" : "")).then(function (r) {
      if (!r.ok) throw new Error(errText(r));
      store[currentDomain] = r.body;
      return r.body;
    });
  }
  function viewUsers() {
    setTitle(domainsInfo.all ? t("机构管理", "Institutions") : t("本域管理", "My domain"), t("用户", "Users"),
      '<button class="btn ghost sm" id="refresh">' + t("刷新", "Refresh") + '</button> <button class="btn ghost sm" id="csv">' + t("导出 CSV", "Export CSV") + "</button>");
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
        '</tr></thead><tbody><tr><td colspan="7" class="loading">' + t("正在读取本域账号、验证方式和群组，几百人要十几秒…", "Reading the domain's accounts, methods and groups — a few hundred people take ten seconds or so…") + "</td></tr></tbody></table></div>" +
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
    $("refresh").addEventListener("click", function () { $("refresh").disabled = true; loadDomainData("users", true).then(function () { $("refresh").disabled = false; renderUsers(); }).catch(showUsersError); });
    $("csv").addEventListener("click", exportUsersCsv);
    $("utable").addEventListener("click", function (e) {
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
      var gs = u.groups.filter(function (g) { return g.kind === "team" || g.kind === "m365"; });
      var gl = gs.slice(0, 3).map(function (g) { return '<span class="tag">' + hl(g.name, state.userQ) + "</span>"; }).join("") + (gs.length > 3 ? '<span class="tag muted">+' + (gs.length - 3) + "</span>" : "");
      return '<tr class="pick" data-upn="' + esc(u.upn) + '"><td class="acct">' + hl(u.upn, state.userQ) + (u.enabled ? "" : ' <span class="tag bad">' + t("已停用", "Disabled") + "</span>") + "</td>" +
        '<td><span class="dn">' + hl(u.displayName, state.userQ) + "</span>" + (u.lastSignIn ? '<span class="sub">' + t("最近登录 ", "Last sign-in ") + esc(day(u.lastSignIn)) + "</span>" : "") + "</td>" +
        "<td>" + auth + "</td><td>" + dev + '</td><td><div class="tags">' + (gl || '<span class="muted">—</span>') + "</div></td>" +
        "<td>" + (u.identity ? '<span class="tag accent">' + esc(u.identity) + "</span>" : '<span class="muted">—</span>') + "</td>" +
        "<td>" + (u.linked.length ? u.linked.map(function (l) { return hl(l, state.userQ); }).join("<br/>") : '<span class="muted">—</span>') + "</td></tr>";
    }).join("") : '<tr><td colspan="7"><div class="empty">' + t("没有匹配的账号。", "No matching accounts.") + "</div></td></tr>";
    $("ufoot").textContent = t("共 " + rows.length + " / " + n + " 个账号 · 数据时间 " + when(d.at) + (d.cached ? "（缓存，点「刷新」重新读取）" : "") + (d.partial ? " · 部分账号的方法或群组没有读到" : ""),
      rows.length + " of " + n + " accounts · data as of " + when(d.at) + (d.cached ? " (cached — Refresh re-reads)" : "") + (d.partial ? " · some accounts' methods or groups could not be read" : ""));
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
  function openUserPanel(upn) {
    var u = usersNow().filter(function (x) { return x.upn === upn; })[0]; if (!u) return;
    var idOpts = ['<option value="">' + t("— 未填 —", "— not set —") + "</option>"].concat(IDENTITIES.map(function (i) { return '<option value="' + i + '"' + (u.identity === i ? " selected" : "") + ">" + i + "</option>"; })).join("");
    panelOpen(
      '<div class="ph"><span class="avatar">' + esc(initials(u.displayName || u.upn)) + "</span><h3>" + esc(u.displayName || u.upn) + '</h3><button class="x" type="button" aria-label="close">✕</button></div>' +
      '<div class="pb">' +
        '<div class="kv"><span class="k">' + t("账号", "Account") + "</span><span>" + esc(u.upn) + "</span>" +
          '<span class="k">' + t("验证", "Authentication") + "</span><span>" + (u.verified === null ? "?" : u.verified ? '<span class="tag ok">Yes</span>' : '<span class="tag bad">No</span>') + "</span>" +
          '<span class="k">' + t("最近登录", "Last sign-in") + "</span><span>" + esc(when(u.lastSignIn) || "—") + "</span>" +
          '<span class="k">' + t("创建", "Created") + "</span><span>" + esc(day(u.created) || "—") + "</span>" +
          '<span class="k">' + t("状态", "Status") + "</span><span>" + (u.enabled ? t("已启用", "Enabled") : '<span class="tag bad">' + t("已停用", "Disabled") + "</span>") + "</span></div>" +
        "<h4>" + t("验证设备", "Authentication devices") + '</h4><div id="pdev">' + (u.devices.length ? u.devices.map(function (x) {
          return '<div class="devrow"><div class="m"><b>' + esc(x.name) + "</b><small>" + esc((KIND[x.kind] || [x.kind, x.kind])[EN ? 1 : 0]) + (x.version ? " · " + esc(x.version) : "") + (x.created ? " · " + esc(day(x.created)) : "") + "</small></div>" +
            '<button class="btn danger sm" type="button" data-del="' + esc(x.id) + '" data-name="' + esc(x.name) + '">' + t("删除", "Delete") + "</button></div>";
        }).join("") : '<div class="muted" style="font-size:.86rem">' + t("没有登记验证器。", "No authenticator registered.") + "</div>") + "</div>" +
        '<div class="note">' + t("删除后对方下次登录要重新绑定验证器；唯一的设备不要在他还没准备好新手机时删。重置密码和临时通行码在二期加入。", "After a delete the person links an authenticator afresh at the next sign-in; do not remove the only device before they have the new phone ready. Password reset and Temporary Access Pass come in phase 2.") + "</div>" +
        "<h4>" + t("Teams 群组", "Teams groups") + '</h4><div class="tags" style="display:flex;gap:4px;flex-wrap:wrap">' + (u.groups.length ? u.groups.map(function (g) { return '<span class="tag' + (g.kind === "team" ? " accent" : "") + '">' + esc(g.name) + "</span>"; }).join("") : '<span class="muted">—</span>') + "</div>" +
        (u.extra ? "<h4>" + t("补充资料（本人填写）", "More about them (self-reported)") + '</h4><div class="kv">' +
          (u.extra.city ? '<span class="k">' + t("城市", "City") + "</span><span>" + esc(u.extra.city) + "</span>" : "") +
          ((u.extra.needs || []).length ? '<span class="k">' + t("最需要", "Needs") + "</span><span>" + esc(u.extra.needs.map(vl).join("、") + (u.extra.needsOther ? "（" + u.extra.needsOther + "）" : "")) + "</span>" : "") +
          (u.extra.children || []).map(function (c, i) {
            var bits = [];
            if (c.age != null) bits.push(c.age + t(" 岁", " y"));
            if (c.grade) bits.push(t("年级 ", "Grade ") + vl(c.grade));
            if (c.schooling) bits.push(vl(c.schooling));
            if (c.model) bits.push(c.model === "其它" ? (c.modelOther || vl(c.model)) : vl(c.model));
            if (c.higherEd) bits.push(vl(c.higherEd));
            if (c.account) bits.push(c.account);
            return '<span class="k">' + t("孩子 ", "Child ") + (i + 1) + (c.name ? " · " + esc(c.name) : "") + "</span><span>" + esc(bits.join(" · ") || "—") + "</span>";
          }).join("") + "</div>" : "") +
        "<h4>" + t("身份和关联账号", "Identity and linked accounts") + '</h4><form id="pform"><label class="f">' + t("身份", "Identity") + '<select id="pid">' + idOpts + "</select>" + (u.identitySource === "entra" ? "<small>" + t("来自 Entra 的部门字段", "From Entra's department field") + "</small>" : "") + "</label>" +
          '<label class="f" style="margin-top:8px">' + t("关联账号（孩子 / 家长的 Teams 账号，多个用逗号分开）", "Linked accounts (child / parent Teams accounts, comma-separated)") + '<input type="text" id="plink" value="' + esc(u.linked.join(", ")) + '" placeholder="student@' + esc(currentDomain) + '" /></label>' +
          '<label class="f" style="margin-top:8px">' + t("备注", "Note") + '<input type="text" id="pnote" maxlength="200" value="' + esc(u.note) + '" /></label>' +
          '<div class="actions"><button class="btn" type="submit" id="psave">' + t("保存", "Save") + '</button></div><div id="pmsg"></div></form>' +
      "</div>");
    $("pform").addEventListener("submit", function (ev) {
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
        renderUsers(); openUserPanel(u.upn);
      });
    });
  }

  // ================================================================================
  // 本域管理 › Teams 群组 (domain → groups, collapsible)
  // ================================================================================
  function viewGroups() {
    setTitle(domainsInfo.all ? t("机构管理", "Institutions") : t("本域管理", "My domain"), t("Teams 群组", "Teams groups"),
      '<button class="btn ghost sm" id="refresh">' + t("刷新", "Refresh") + "</button>");
    var ds = domainsInfo.domains || [];
    $("content").innerHTML =
      '<div class="toolbar"><span class="spacer"></span><div class="search">' + ICON.search + '<input type="search" id="gq" placeholder="' + t("搜索群组…", "Search groups…") + '" /></div></div>' +
      '<div class="tlist tree" id="gtree">' + ds.map(function (d) {
        return '<details data-domain="' + esc(d.domain) + '"' + (ds.length === 1 || d.domain === currentDomain ? " open" : "") + '><summary>' + esc(d.domain) + ' <span class="n" id="gn-' + esc(d.domain.replace(/\W/g, "_")) + '"></span></summary><div class="leaf"><div class="loading">' + t("展开后读取…", "Expand to load…") + "</div></div></details>";
      }).join("") + "</div>";
    $("gq").addEventListener("input", debounce(function () { ds.forEach(function (d) { renderGroupLeaf(d.domain); }); }, 120));
    $("gtree").addEventListener("toggle", function (e) { var det = e.target; if (det.open) ensureGroups(det.getAttribute("data-domain")); }, true);
    $("refresh").addEventListener("click", function () { ds.forEach(function (d) { var det = $("gtree").querySelector('details[data-domain="' + d.domain + '"]'); if (det && det.open) ensureGroups(d.domain, true); }); });
    ds.forEach(function (d) { var det = $("gtree").querySelector('details[data-domain="' + d.domain + '"]'); if (det && det.open) ensureGroups(d.domain); });
  }
  function ensureGroups(domain, force) {
    var saved = currentDomain; currentDomain = domain;
    loadDomainData("groups", force).then(function () { renderGroupLeaf(domain); }).catch(function (e) {
      var det = $("gtree") && $("gtree").querySelector('details[data-domain="' + domain + '"]'); if (det) det.querySelector(".leaf").innerHTML = '<div class="msg err">' + esc(e.message || e) + "</div>";
    }).then(function () { currentDomain = saved; });
  }
  function renderGroupLeaf(domain) {
    var det = $("gtree") && $("gtree").querySelector('details[data-domain="' + domain + '"]'); if (!det) return;
    var d = state.domainGroups[domain]; if (!d) return;
    var q = ($("gq") && $("gq").value.trim()) || "";
    var rows = d.groups.filter(function (g) { return !q || (g.name + " " + g.description).toLowerCase().indexOf(q.toLowerCase()) >= 0; });
    var n = $("gn-" + domain.replace(/\W/g, "_")); if (n) n.textContent = d.groups.length + t(" 个群组", " groups") + (q ? " · " + rows.length + t(" 个匹配", " match") : "");
    det.querySelector(".leaf").innerHTML = rows.length ? rows.map(function (g) {
      var k = GKIND[g.kind] || GKIND.other;
      return '<div class="trow"><span class="tav" style="background:' + hue(g.id) + '">' + esc(initials(g.name)) + '</span><div class="tmain"><div class="tname">' + hl(g.name, q) + '</div><div class="tmeta"><span>' + esc(k[EN ? 1 : 0]) + "</span>" + (g.visibility ? "<span>" + (g.visibility === "Public" ? t("公开", "Public") : t("私密", "Private")) + "</span>" : "") + "<span>" + g.domainMembers + t(" 位本域成员", " members from this domain") + "</span>" + (g.description ? '<span class="desc">' + hl(g.description, q) + "</span>" : "") + "</div></div></div>";
    }).join("") : '<div class="empty">' + t("没有群组。", "No groups.") + "</div>";
  }

  // ================================================================================
  // 系统 › 角色分配 / 数据同步
  // ================================================================================
  function viewRoles() {
    setTitle(t("系统", "System"), t("角色分配", "Roles"));
    $("content").innerHTML =
      '<div class="card"><h2>' + t("角色分配", "Roles") + '</h2><p class="sub">' + t("用账号（邮箱）识别。录入员和域管理员立即生效；管理员和协调员在对方下次登录后生效。", "Matched by account. CRM entry and domain administrator work at once; Administrator and Coordinator take effect at the person's next sign-in.") + "</p>" +
        '<table class="roles" id="rtable"><thead><tr><th>' + t("账号", "Account") + "</th><th>" + t("角色", "Roles") + "</th><th>" + t("授予", "By") + '</th><th></th></tr></thead><tbody><tr><td colspan="4" class="loading">' + t("载入中…", "Loading…") + "</td></tr></tbody></table>" +
        '<form class="role-form" id="rform" autocomplete="off"><input type="email" id="ruser" placeholder="name@domain" required />' +
          '<div class="opts"><label><input type="checkbox" value="crm_entry" /> ' + t("录入员", "CRM data entry") + "</label><label><input type=\"checkbox\" value=\"coordinator\" /> " + t("Hive 协调员（所有域）", "Hive coordinator (all domains)") + "</label><label><input type=\"checkbox\" value=\"admin\" /> " + t("管理员", "Administrator") + "</label></div>" +
          '<label class="f">' + t("域管理员（填域名，多个用逗号分开）", "Domain administrator (domain names, comma-separated)") + '<input type="text" id="rdom" placeholder="sciencebug.net" /></label>' +
          '<div class="actions"><button class="btn" type="submit">' + t("添加 / 更新", "Add / update") + '</button></div></form><div id="rmsg"></div></div>';
    function render(entries) {
      var tb = $("rtable").tBodies[0];
      tb.innerHTML = entries.length ? entries.map(function (e) {
        return "<tr><td>" + esc(e.user) + "</td><td>" + e.roles.map(function (r) { return esc(roleNames([r])); }).join("<br/>") + '</td><td class="muted">' + esc(e.by || "") + (e.at ? "<br/>" + esc(day(e.at)) : "") + '</td><td><button class="btn danger sm" type="button" data-user="' + esc(e.user) + '">' + t("移除", "Remove") + "</button></td></tr>";
      }).join("") : '<tr><td colspan="4" class="muted">' + t("还没有分配任何角色", "No roles assigned yet") + "</td></tr>";
    }
    function msg(ok, txt) { $("rmsg").innerHTML = '<div class="msg ' + (ok ? "ok" : "err") + '">' + esc(txt) + "</div>"; }
    api("roles").then(function (r) { if (!r.ok) return msg(false, errText(r)); render(r.body.entries || []); });
    $("rform").addEventListener("submit", function (ev) {
      ev.preventDefault();
      var user = $("ruser").value.trim();
      var roles = Array.prototype.map.call($("rform").querySelectorAll('input[type=checkbox]:checked'), function (c) { return c.value; });
      $("rdom").value.split(/[\s,;，；]+/).map(function (d) { return d.trim().toLowerCase(); }).filter(Boolean).forEach(function (d) { roles.push("domain_admin:" + d); });
      post("roles", "POST", { user: user, roles: roles }).then(function (r) {
        if (!r.ok) return msg(false, errText(r));
        render(r.body.entries || []); $("ruser").value = ""; $("rdom").value = ""; $("rform").querySelectorAll("input[type=checkbox]").forEach(function (c) { c.checked = false; });
        msg(true, roles.length ? t("已保存：", "Saved: ") + user : t("已移除：", "Removed: ") + user);
      });
    });
    $("rtable").addEventListener("click", function (ev) {
      var b = ev.target.closest("button[data-user]"); if (!b) return;
      var user = b.getAttribute("data-user");
      if (!window.confirm(t("移除 " + user + " 的所有角色？", "Remove all roles from " + user + "?"))) return;
      post("roles", "DELETE", { user: user }).then(function (r) { if (!r.ok) return msg(false, errText(r)); render(r.body.entries || []); msg(true, t("已移除：", "Removed: ") + user); });
    });
  }
  function viewSync() {
    setTitle(t("系统", "System"), t("数据同步", "Data sync"));
    $("content").innerHTML =
      '<div class="card"><h2>' + t("课程数据同步", "Course data sync") + '</h2><p class="sub">' + t("网站数据不会自动更新。点击按钮从 Airtable 拉取最新的毕业路径与课程数据并发布到网站。", "Site data does not update automatically. Pull the latest tracks and courses from Airtable and publish them.") + "</p>" +
        '<div class="kpis"><div class="kpi"><div class="l">' + t("上次同步", "Last synced") + '</div><div class="v" style="font-size:1rem" id="sLast">—</div></div><div class="kpi"><div class="l">' + t("毕业路径", "Tracks") + '</div><div class="v" id="sT">—</div></div><div class="kpi"><div class="l">' + t("课程", "Courses") + '</div><div class="v" id="sC">—</div></div><div class="kpi"><div class="l">' + t("学科", "Subjects") + '</div><div class="v" id="sS">—</div></div></div>' +
        '<div class="actions"><button class="btn" id="syncBtn" type="button">' + t("立即从 Airtable 同步", "Sync from Airtable now") + '</button><a class="btn ghost" href="/" target="_blank" rel="noopener">' + t("查看网站 ↗", "View site ↗") + '</a></div><div id="sMsg"></div></div>';
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
      me = r.body; foot();
      // Just arrived from the sign-in tab: tell the other tabs, once, and take the marker out of the address.
      if (/[?&]signedin=1\b/.test(location.search)) {
        try { new BroadcastChannel("fc-auth").postMessage({ kind: "in", at: Date.now() }); } catch (e) {}
        try { localStorage.setItem("fc-auth-event", "in:" + Date.now()); } catch (e) {}
        try { history.replaceState(null, "", location.pathname + location.search.replace(/([?&])signedin=1&?/, "$1").replace(/[?&]$/, "") + location.hash); } catch (e) {}
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
    if (h.indexOf("#/domain") === 0) {
      if (!domainsInfo || !domainsInfo.domains.length) { location.hash = "#/account"; return; }
      if (!currentDomain) currentDomain = (domainsInfo.domains.filter(function (d) { return d.domain === domainsInfo.mine; })[0] || domainsInfo.domains[0]).domain;
      return h.indexOf("#/domain/groups") === 0 ? viewGroups() : viewUsers();
    }
    if (h.indexOf("#/system") === 0) {
      if ((me.roles || []).indexOf("admin") < 0) { location.hash = "#/account"; return; }
      return h.indexOf("#/system/sync") === 0 ? viewSync() : viewRoles();
    }
    viewAccount();
  }
  window.addEventListener("hashchange", route);

  loadMe().then(function () {
    return api("domain/domains").then(function (r) { domainsInfo = r.ok ? r.body : null; }).catch(function () { domainsInfo = null; });
  }).then(route).catch(function (r) {
    var msg = r && r.body ? errText(r) : String(r);
    $("content").innerHTML = '<div class="card"><h2>' + t("无法读取账号", "Could not load the account") + '</h2><p class="sub">' + esc(msg) + '</p><div class="actions"><a class="btn" href="/.auth/login/aad?post_login_redirect_uri=' + encodeURIComponent("/hub/") + '">' + t("重新登录", "Sign in again") + "</a></div></div>";
    $("fName").textContent = t("未登录", "Signed out"); $("fAvatar").textContent = "?";
    nav();
  });
})();
