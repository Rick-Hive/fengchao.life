// management/src/10-account.js — 我的账号: overview, 补充资料, 登录与安全 (logs, authenticator devices), 我的 Teams.
// Part of management.js: scripts/build-management.js concatenates management/src/*.js in name order
// into management/management.js (one closure; every part sees every other's functions). Edit here, not the built file.
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

