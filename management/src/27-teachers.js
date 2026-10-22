// management/src/27-teachers.js — 教师资料 / Teacher profiles (enrollment rules design §4, Rick 2026-10-20).
// The Airtable Teachers table is the teacher library; here a teacher (我的账号 › 教师资料), the school's education
// leader (学校管理 › 教师资料, 「教师库有时候会是校长维护，统一填写」), the curriculum director or the system
// administrator edits the photo, 简介 and 专长 as a draft, submits it, and an approver (curriculum director / CEO /
// sysadmin) approves — which writes Airtable and asks for the website sync. Autosave: 1.5 s after a change.
// Part of management.js: scripts/build-management.js concatenates management/src/*.js in name order.

  var teState = { list: null, me: null, doc: null, timers: {}, filter: "all", scope: "" };
  function teIsLeader() { return ((me && me.roles) || []).some(function (r) { return /^domain_leader:/.test(r); }); }
  function teCanManage() { return isAdmin() || coIsApprover() || teIsLeader() || providerHives().length > 0; }
  function teStatusTag(s) {
    var m = { "": ["未修改", "Unchanged", "muted"], draft: ["草稿", "Draft", ""], submitted: ["待审批", "Pending approval", "accent"], published: ["已发布", "Published", "ok"] }[s] || ["", "", ""];
    return m[0] ? '<span class="tag ' + m[2] + '">' + esc(t(m[0], m[1])) + "</span>" : "";
  }
  function teLoadList() { return api("teachers/list").then(function (r) { if (r.ok) { teState.list = r.body.teachers || []; teState.me = r.body.me || null; } return r; }); }

  // ---- 我的账号 › 教师资料: the signed-in teacher's own record, edited on the page itself -------------------
  function viewTeacherMine() {
    setTitle(t("我的账号", "My account"), t("教师资料", "Teacher profile"), "", { info: t("网站老师页上显示的照片、个人简介和专业能力。改动先存为草稿，提交后由课程总监批准并发布到网站。", "The photo, biography and expertise shown on the website. Changes are a draft until the curriculum director approves and publishes them.") });
    $("content").innerHTML = '<div class="loading">' + t("载入中…", "Loading…") + "</div>";
    teLoadList().then(function (r) {
      if (!r.ok) { $("content").innerHTML = '<div class="msg err">' + esc(errText(r)) + "</div>"; return; }
      if (!teState.me || !teState.me.teacher) { $("content").innerHTML = '<div class="card"><p class="muted">' + t("教师库里没有和您的账号对应的记录。如果您在蜂巢上授课，请联系课程总监把您的 Teams 账号填入教师表。", "The teacher library has no record for your account. If you teach on Hive, ask the curriculum director to put your Teams account on your teacher row.") + "</p></div>"; return; }
      $("content").innerHTML = '<div class="card" id="teCard"><div class="loading">' + t("载入中…", "Loading…") + "</div></div>";
      teOpen(teState.me.teacher, $("teCard"));
    });
  }

  // ---- 学校管理 › 教师资料: the school's (or every) teacher, a panel per row ----------------------------------
  function viewTeachers() {
    var provOnly = providerHives().length > 0 && !isAdmin() && !coIsApprover() && !teIsLeader();
    setTitle(provOnly ? t("蜂巢课程", "Hive Courses") : domainGroupTitle(), provOnly ? t("老师", "Teachers") : t("教师资料", "Teacher profiles"), '<button class="btn sm" id="teAdd" hidden>' + t("＋ 添加老师", "+ Add a teacher") + "</button>", { info: provOnly ? t("本机构在蜂巢授课的老师（教师表）。在这里添加老师、维护姓名、邮箱、Teams 账号、母语（立即写入教师表；邮箱和账号只在管理中心可见，不上网站）；照片、个人简介、专业能力以草稿提交，由课程总监批准后发布到网站。", "Your institution's Hive course teachers (the Teachers table). Add teachers and keep their name, email, Teams account and mother language here (written to the table at once; email and account never reach the website); photo, biography and expertise are submitted as a draft and published once the curriculum director approves.") : t("本校在蜂巢授课的老师：照片、个人简介、专业能力是否齐全，谁的资料待批准。点一行即可填写或批准；姓名、邮箱、母语等直接写入教师表。", "The school's Hive course teachers: whether the photo, biography and expertise are there, and whose changes await approval. Click a row to fill in or approve; name, email, mother language and the like are written to the table at once.") });
    $("content").innerHTML = '<div class="loading">' + t("载入中…", "Loading…") + "</div>";
    teLoadList().then(function (r) {
      if (!r.ok) { $("content").innerHTML = '<div class="msg err">' + esc(errText(r)) + "</div>"; return; }
      if (teState.me && teState.me.canCreate && $("teAdd")) { $("teAdd").hidden = false; $("teAdd").addEventListener("click", teAddPanel); }
      teRenderList();
    });
  }
  // ---- one form for adding and editing (Rick 2026-10-22: 「添加老师」is the whole profile, the same as editing) ----
  // photo · 姓名 · 邮箱 · Teams 账号 · 母语, then 简介 and 专长 in Chinese and English side by side with 一键翻译.
  // Subjects, grade levels and course types belong to the course, not the teacher.
  var TE_FACTS = [["name", "姓名", "Name", 80, "text"], ["email", "邮箱", "Email", 200, "email"], ["teamsAccount", "Teams 账号", "Teams account", 200, "text"], ["languages", "母语", "Mother language", 200, "text"]];
  var TE_TEXTS = [["bio", "个人简介", "Biography", 4000, 7, "网站老师页上的介绍，建议 100–300 字", "Shown on the teacher's page; 100–300 words works well"], ["expertise", "专业能力", "Expertise", 1000, 3, "教学专长与特长，一两句", "Teaching strengths, a sentence or two"]];
  var TE_LANGS = [["zh", "中文", "Chinese"], ["en", "English", "English"]];
  function teKey(k, lang) { return lang === "zh" ? k + "Zh" : k; }
  function teFieldLabel(k) { var zh = /Zh$/.test(k), base = k.replace(/Zh$/, ""), f = TE_TEXTS.filter(function (x) { return x[0] === base; })[0]; return f ? t(f[1], f[2]) + (zh ? t("（中文）", " (Chinese)") : t("（英文）", " (English)")) : k; }
  function teFactFields(p, lockAccount) {
    p = p || {};
    var ph = { teamsAccount: "name@domain", languages: t("如：中文", "e.g. English") };
    return '<div class="grid2 tefgrid">' + TE_FACTS.map(function (f) {
      var lock = f[0] === "teamsAccount" && lockAccount;
      return '<label class="f"><span>' + t(f[1], f[2]) + (f[0] === "name" ? ' <span class="req">*</span>' : "") + "</span>" + '<input type="' + f[4] + '" data-fact="' + f[0] + '" maxlength="' + f[3] + '"' + (ph[f[0]] ? ' placeholder="' + esc(ph[f[0]]) + '"' : "") + ' value="' + esc(p[f[0]] || "") + '"' + (lock ? ' readonly title="' + esc(t("由机构负责人或课程总监设置", "Set by the institution's leader or the curriculum director")) + '"' : "") + " /></label>";
    }).join("") + "</div>";
  }
  function tePhotoBox(url, can) {
    return '<div class="tephoto">' + (url ? '<img id="tePhotoImg" src="' + esc(url) + '" alt="" />' : '<div class="teph-empty" id="tePhotoImg">' + t("无照片", "No photo") + "</div>") +
      (can ? '<button type="button" class="btn secondary sm" id="tePhotoBtn">' + (url ? t("更换照片", "Change photo") : t("上传照片", "Upload photo")) + '</button><input type="file" id="tePhotoFile" accept="image/jpeg,image/png" hidden /><small class="faint">' + t("自动裁成正方形", "Cropped to a square") + "</small>" : "") + "</div>";
  }
  // 简介 / 专长: Chinese and English side by side; the website shows the site language's (falls back to the other)
  function teTextsHtml(vals, can) {
    vals = vals || {};
    return '<div class="tetexts">' +
      (can ? '<div class="tetr"><span class="faint">' + t("一键翻译", "Translate") + '</span><button type="button" class="btn secondary sm" data-tr="zh">中文 → English</button><button type="button" class="btn secondary sm" data-tr="en">English → 中文</button><small class="faint">' + t("网站按访客的语言显示中文或英文", "The website shows the visitor's language") + "</small></div>" : "") +
      TE_TEXTS.map(function (f) {
        return '<div class="tefield"><div class="tefl"><b>' + t(f[1], f[2]) + '</b> <small class="faint">' + t(f[5], f[6]) + '</small></div><div class="tebi">' + TE_LANGS.map(function (L) {
          var k = teKey(f[0], L[0]);
          return '<label class="f"><span class="telang">' + L[1] + '</span><textarea data-k="' + k + '" rows="' + f[4] + '" maxlength="' + f[3] + '"' + (can ? "" : " readonly") + ">" + esc(vals[k] || "") + "</textarea></label>";
        }).join("") + "</div></div>";
      }).join("") + "</div>";
  }
  // 一键翻译: the `from` side's 简介 and 专长 into the other side; `fill(k, v)` after each text is written in
  function teTranslate(btn, host, from, fill) {
    var to = from === "zh" ? "en" : "zh", texts = {}, over = false;
    TE_TEXTS.forEach(function (f) {
      var src = host.querySelector('textarea[data-k="' + teKey(f[0], from) + '"]'), dst = host.querySelector('textarea[data-k="' + teKey(f[0], to) + '"]');
      if (src && src.value.trim()) { texts[f[0]] = src.value; if (dst && dst.value.trim()) over = true; }
    });
    if (!Object.keys(texts).length) { flash(esc(from === "zh" ? t("请先填写中文的个人简介或专业能力。", "Fill in the Chinese biography or expertise first.") : t("请先填写英文的个人简介或专业能力。", "Fill in the English biography or expertise first.")), 4000); return; }
    if (over && !window.confirm(t("覆盖已有的" + (to === "zh" ? "中文" : "英文") + "内容？", "Replace the existing " + (to === "zh" ? "Chinese" : "English") + " text?"))) return;
    savingButton(btn, t("翻译中…", "Translating…"));
    post("teachers/translate", "POST", { from: from, texts: texts }).then(function (r) {
      restoreButton(btn);
      if (!r.ok) { flash(esc(r.body && r.body.code === "no_translator" ? t("翻译服务未配置（AZURE_TRANSLATOR_KEY）。", "The translator is not configured (AZURE_TRANSLATOR_KEY).") : errText(r)), 6000); return; }
      Object.keys(r.body.texts || {}).forEach(function (k) {
        var key = teKey(k, to), ta = host.querySelector('textarea[data-k="' + key + '"]'); if (!ta) return;
        ta.value = r.body.texts[k]; coAutosize(ta); if (fill) fill(key, ta.value);
      });
      flashOk(t("已翻译，请核对后保存。", "Translated; please check it."), 3000);
    });
  }
  // ＋ 添加老师: the whole profile at once, for the leader's own institution (an approver picks one). Saving creates the
  // Teachers row and submits the photo and texts for approval — an approver's are published at once.
  function teAddPanel() {
    var me0 = teState.me || {}, hives = me0.hives || [];
    teState.newPhoto = null;
    var draw = function (list) {
      panelOpen('<div class="ph"><span class="avatar">👩‍🏫</span><h3>' + t("添加老师", "Add a teacher") + '</h3><button class="x" type="button" aria-label="close">✕</button></div>' +
        '<div class="pb"><form id="teNew" autocomplete="off">' +
          (list.length > 1 || me0.approver ? '<label class="f">' + t("所属机构", "Institution") + '<select id="tnHive">' + list.map(function (h) { return '<option value="' + esc(h.key) + '">' + esc(EN ? (h.abbr || h.name || h.key) : (h.name || h.abbr || h.key)) + "</option>"; }).join("") + "</select></label>" : '<div class="kv"><span class="k">' + t("所属机构", "Institution") + "</span><span>" + esc(list.length ? (EN ? (list[0].abbr || list[0].name) : (list[0].name || list[0].abbr)) : "") + "</span></div>") +
          '<div class="tehead">' + tePhotoBox(null, true) + '<div class="tefacts">' + teFactFields({}, false) + '<p class="sub">' + t("邮箱和 Teams 账号只在管理中心可见，不上网站。", "Email and Teams account stay in the management centre; never on the website.") + "</p></div></div>" +
          teTextsHtml({}, true) +
          '<div class="actions"><button type="submit" class="btn" id="tnSave">' + (me0.approver ? t("保存并发布", "Save and publish") : t("保存并提交审批", "Save and submit for approval")) + '</button><small class="faint">' + (me0.approver ? t("写入教师表，网站随后更新", "Written to the Teachers table; the website follows") : t("姓名、邮箱等立即写入教师表；照片、个人简介、专业能力由课程总监批准后上网站", "Name, email and the like go to the Teachers table now; photo and texts reach the website once approved")) + '</small></div><div id="tnMsg"></div></form></div>', null, { wide: true });
      var form = $("teNew");
      form.querySelectorAll("textarea[data-k]").forEach(coAutosize);
      form.querySelectorAll("button[data-tr]").forEach(function (b) { b.addEventListener("click", function () { teTranslate(b, form, b.getAttribute("data-tr")); }); });
      $("tePhotoBtn").addEventListener("click", function () { $("tePhotoFile").click(); });
      $("tePhotoFile").addEventListener("change", function () {
        var f = this.files && this.files[0]; this.value = ""; if (!f) return;
        tePhotoData(f, function (data) {
          teState.newPhoto = data;
          var box = $("tePhotoImg"), img = document.createElement("img"); img.id = "tePhotoImg"; img.src = data; img.alt = ""; box.parentNode.replaceChild(img, box);
          $("tePhotoBtn").textContent = t("更换照片", "Change photo");
        });
      });
      form.addEventListener("submit", function (ev) {
        ev.preventDefault();
        var b = $("tnSave"), body = { hive: $("tnHive") ? $("tnHive").value : (list[0] && list[0].key), profile: {} };
        form.querySelectorAll("input[data-fact]").forEach(function (i) { body[i.getAttribute("data-fact")] = i.value.trim(); });
        form.querySelectorAll("textarea[data-k]").forEach(function (ta) { if (ta.value.trim()) body.profile[ta.getAttribute("data-k")] = ta.value.trim(); });
        if (teState.newPhoto) body.photo = teState.newPhoto;
        if (!body.name) { $("tnMsg").innerHTML = '<div class="msg err">' + t("请填写姓名。", "Please enter the name.") + "</div>"; return; }
        savingButton(b);
        post("teachers/create", "POST", body).then(function (r) {
          if (!r.ok) { restoreButton(b); $("tnMsg").innerHTML = '<div class="msg err">' + esc(errText(r)) + (r.body && r.body.problems ? " — " + esc(r.body.problems.join("; ")) : "") + "</div>"; return; }
          teState.newPhoto = null;
          post("teachers/sync", "POST", {}).catch(function () {}); // the snapshot follows (coalesced); the list shows the row at once
          var pr = r.body.profile, skipped = (r.body.skipped || []).concat((pr && pr.skipped) || []);
          flashOk(esc(t("已添加 ", "Added ") + body.name) + (pr ? " · " + esc(pr.status === "published" ? t("已发布", "published") : t("已提交审批", "submitted for approval")) : "") + (skipped.length ? " · " + esc(t("未写入（表里没有这一列）：", "not written (column missing): ") + skipped.join(", ")) : ""), 5000);
          // the same panel goes on as the teacher's editor
          var host = $("panel").querySelector(".pb"), h3 = $("panel").querySelector(".ph h3"); if (h3) h3.textContent = body.name;
          host.innerHTML = '<div class="loading">' + t("载入中…", "Loading…") + "</div>";
          teLoadList().then(function () { if ($("tetable")) teRenderList(); teOpen(r.body.id, host); });
        });
      });
    };
    if (me0.approver) api("teachers/hives").then(function (r) { draw(r.ok ? r.body.hives || [] : []); }); else draw(hives);
  }
  function teRenderList() {
    var list = teState.list || [], domains = {};
    list.forEach(function (x) { if (x.domain) domains[x.domain] = (domains[x.domain] || 0) + 1; });
    var scopes = Object.keys(domains).sort();
    var rows = list.filter(function (x) { return !teState.scope || x.domain === teState.scope; }).filter(function (x) {
      return teState.filter === "pending" ? x.status === "submitted" : teState.filter === "missing" ? !(x.photoUrl && x.hasBio && x.hasExpertise) : true;
    });
    var pending = list.filter(function (x) { return x.status === "submitted"; }).length, missing = list.filter(function (x) { return !(x.photoUrl && x.hasBio && x.hasExpertise); }).length;
    var chip = function (k, label, n) { return '<button type="button" class="chip" data-f="' + k + '" aria-pressed="' + (teState.filter === k) + '">' + esc(label) + ' <span class="cnt' + (k === "pending" && n ? " cobadge" : "") + '">' + n + "</span></button>"; };
    $("content").innerHTML =
      '<div class="toolbar" id="tebar">' + chip("all", t("全部", "All"), list.length) + chip("pending", t("待审批", "Pending approval"), pending) + chip("missing", t("资料不全", "Incomplete"), missing) +
        (scopes.length > 1 ? '<div class="tabsRight"><select id="teScope"><option value="">' + t("所有学校", "All schools") + "</option>" + scopes.map(function (d) { return '<option value="' + esc(d) + '"' + (teState.scope === d ? " selected" : "") + ">" + esc(dname(d)) + " · " + domains[d] + "</option>"; }).join("") + "</select></div>" : "") + "</div>" +
      '<div class="tbl-wrap"><table class="data" id="tetable"><thead><tr><th>' + t("老师", "Teacher") + "</th><th>" + t("学校", "School") + "</th><th>" + t("照片", "Photo") + "</th><th>" + t("个人简介", "Biography") + "</th><th>" + t("专业能力", "Expertise") + "</th><th>" + t("状态", "Status") + "</th><th>" + t("更新", "Updated") + "</th></tr></thead><tbody>" +
      (rows.length ? rows.map(function (x) {
        var ok = function (v) { return v ? '<span class="tag ok">✓</span>' : '<span class="tag warn">' + t("缺", "missing") + "</span>"; };
        return '<tr class="pick" data-id="' + esc(x.id) + '"><td><span class="dn">' + esc(x.name) + (x.mine ? ' <span class="tag muted">' + t("我", "me") + "</span>" : "") + '</span><span class="sub">' + esc(x.teamsAccount || x.email || "") + "</span>" + (x.created ? ' <span class="tag muted">' + t("新", "new") + "</span>" : "") + "</td><td>" + esc(x.domain ? dname(x.domain) : x.organization || "—") + "</td><td>" + ok(x.photoUrl) + "</td><td>" + ok(x.hasBio) + "</td><td>" + ok(x.hasExpertise) + "</td><td>" + teStatusTag(x.status) + '</td><td class="faint">' + esc(x.updatedAt ? when(x.updatedAt) : "") + "</td></tr>";
      }).join("") : '<tr><td colspan="7" class="faint">' + t("没有符合的老师。", "No teacher matches.") + "</td></tr>") + "</tbody></table></div>";
    $("tebar").addEventListener("click", function (e) { var c = e.target.closest(".chip[data-f]"); if (!c) return; teState.filter = c.getAttribute("data-f"); teRenderList(); });
    var sc = $("teScope"); if (sc) sc.addEventListener("change", function () { teState.scope = sc.value; teRenderList(); });
    $("tetable").addEventListener("click", function (e) { var tr = e.target.closest("tr[data-id]"); if (!tr) return; var x = list.filter(function (y) { return y.id === tr.getAttribute("data-id"); })[0]; panelOpen('<div class="ph"><h3>' + esc(x ? x.name : "") + '</h3><button class="x" type="button" aria-label="close">✕</button></div><div class="pb"><div class="loading">' + t("载入中…", "Loading…") + "</div></div>", null, { wide: true }); teOpen(tr.getAttribute("data-id"), $("panel").querySelector(".pb")); });
  }

  // ---- the editor, on the page or in the panel ---------------------------------------------------------------
  function teOpen(id, host) {
    api("teachers/one?id=" + encodeURIComponent(id)).then(function (r) {
      if (!r.ok) { host.innerHTML = '<div class="msg err">' + esc(errText(r)) + "</div>"; return; }
      teState.doc = r.body; teRenderForm(host);
    });
  }
  function teRenderForm(host) {
    var d = teState.doc, p = d.profile, can = d.canEdit, photo = (d.draft.photo && d.draft.photo.url) || p.photoUrl;
    var status = d.status === "submitted" ? t("已提交，等待课程总监批准。", "Submitted; waiting for the curriculum director.") : d.status === "published" ? t("已发布到网站（" + day(d.published.at) + "）。再改动会成为新的草稿。", "Published to the website (" + day(d.published.at) + "). A further change starts a new draft.") : d.returned ? t("已退回：", "Returned: ") + esc(d.returned.comment || "") : d.status === "draft" ? t("草稿已自动保存，提交后由课程总监批准。", "Draft saved; submit it for the curriculum director's approval.") : t("网站上的现有资料。改动会自动保存为草稿。", "What the website shows now. Changes save as a draft.");
    var histLabel = function (h) { return { save: t("修改 ", "changed ") + (h.fields || []).map(teFieldLabel).join("、"), photo: t("更换照片", "changed the photo"), submit: t("提交审批", "submitted"), return: t("退回", "returned") + (h.note ? "：" + h.note : ""), approve: t("批准并发布", "approved and published") }[h.action] || h.action; };
    host.innerHTML =
      '<div class="tehead">' + tePhotoBox(photo, can) +
        '<div class="tefacts"><div class="tetitle"><h3 id="teName">' + esc(p.name) + "</h3>" + teStatusTag(d.status) + (p.created ? ' <span class="tag muted" title="' + esc(t("已写入教师表，等网站同步", "In the Teachers table; the website sync follows")) + '">' + t("新", "new") + "</span>" : "") + "</div>" +
          (p.organization ? '<div class="kv"><span class="k">' + t("所属机构", "Organization") + "</span><span>" + esc(p.organization) + "</span></div>" : "") +
          // the facts: written to the Teachers table on change; email and Teams account never reach the website
          (can ? teFactFields(p, d.canEditAccount === false) + '<div class="faint" id="teFactMsg"></div>'
               : '<div class="kv">' + (p.teamsAccount ? '<span class="k">' + t("账号", "Account") + "</span><span>" + esc(p.teamsAccount) + "</span>" : "") + (p.languages ? '<span class="k">' + t("母语", "Mother language") + "</span><span>" + esc(p.languages) + "</span>" : "") + "</div>") +
        "</div></div>" +
      '<div class="msg ' + (d.returned && d.status !== "submitted" ? "err" : "ok") + '" id="teStatus">' + status + "</div>" +
      teTextsHtml(d.draft, can) +
      '<div class="actions" id="teActions">' +
        (can && d.status === "draft" ? '<button type="button" class="btn" id="teSubmit">' + t("提交审批", "Submit for approval") + "</button>" : "") +
        (d.canApprove && (d.status === "submitted" || d.status === "draft") ? '<button type="button" class="btn' + (d.status === "submitted" ? "" : " secondary") + '" id="teApprove">' + t("批准并发布", "Approve and publish") + "</button>" : "") +
        (d.canApprove && d.status === "submitted" ? '<button type="button" class="btn secondary" id="teReturn">' + t("退回", "Return") + "</button>" : "") +
        '<span class="faint" id="teSaved"></span></div>' +
      (d.history && d.history.length ? "<h4>" + t("修改记录", "History") + '</h4><div class="hist">' + d.history.slice(0, 8).map(function (h) { return '<div class="hrow"><span class="hat">' + esc(when(h.at)) + '<span class="hwho">' + esc(h.by || "") + "</span></span><span>" + esc(histLabel(h)) + "</span></div>"; }).join("") + "</div>" : "");
    host.querySelectorAll("textarea[data-k]").forEach(coAutosize);
    if (can) {
      host.querySelectorAll("input[data-fact]").forEach(function (inp) {
        inp.addEventListener("change", function () {
          var k = inp.getAttribute("data-fact"), v = inp.value.trim(), body = { id: d.recId }; body[k] = v;
          if (String(p[k] || "") === v) return;
          if (k === "name" && !v) { inp.value = p.name || ""; return; }
          post("teachers/facts", "POST", body).then(function (r) {
            var m = $("teFactMsg");
            if (!r.ok) { if (m) m.innerHTML = '<span class="msg err">' + esc(errText(r)) + (r.body && r.body.problems ? " — " + esc(r.body.problems.join("; ")) : "") + "</span>"; return; }
            p[k] = v; if (k === "name" && $("teName")) $("teName").textContent = v;
            if (m) { m.textContent = r.body.skipped && r.body.skipped.length ? t("教师表里没有这一列，未写入。", "The table has no such column; not written.") : t("已写入教师表", "Written to the Teachers table"); clearTimeout(m._t); m._t = setTimeout(function () { m.textContent = ""; }, 2500); }
            post("teachers/sync", "POST", {}).catch(function () {});
            if (teState.list) teLoadList().then(function () { if ($("tetable")) teRenderList(); });
          });
        });
      });
      host.querySelectorAll("textarea[data-k]").forEach(function (ta) {
        ta.addEventListener("input", function () { coAutosize(ta); var k = ta.getAttribute("data-k"); clearTimeout(teState.timers[k]); teState.timers[k] = setTimeout(function () { teSave(k, ta.value, host); }, 1500); });
        ta.addEventListener("blur", function () { var k = ta.getAttribute("data-k"); if (teState.timers[k]) { clearTimeout(teState.timers[k]); teSave(k, ta.value, host); } });
      });
      host.querySelectorAll("button[data-tr]").forEach(function (b) { b.addEventListener("click", function () { teTranslate(b, host, b.getAttribute("data-tr"), function (k, v) { teSave(k, v, host); }); }); });
      $("tePhotoBtn").addEventListener("click", function () { $("tePhotoFile").click(); });
      $("tePhotoFile").addEventListener("change", function () {
        var f = this.files && this.files[0]; this.value = ""; if (!f) return;
        tePhotoData(f, function (data) {
          var b = $("tePhotoBtn"); if (b) savingButton(b, t("上传中…", "Uploading…"));
          post("teachers/photo", "POST", { id: teState.doc.recId, data: data }).then(function (r) { if (!r.ok) { if (b) restoreButton(b); flash(esc(errText(r)), 5000); return; } flashOk(t("照片已更新（草稿）。", "Photo updated (draft)."), 3000); teReload(host); });
        });
      });
      if ($("teSubmit")) $("teSubmit").addEventListener("click", function () { var b = this; savingButton(b); teFlush().then(function () { return post("teachers/submit", "POST", { id: d.recId }); }).then(function (r) { if (!r.ok) { restoreButton(b); flash(esc(errText(r)), 5000); return; } flashOk(t("已提交，课程总监批准后发布到网站。", "Submitted; it goes to the website once approved."), 4000); teReload(host); }); });
    }
    if ($("teApprove")) $("teApprove").addEventListener("click", function () { var b = this; if (!window.confirm(t("批准并写入 Airtable，网站随后更新。继续？", "Approve: writes Airtable and refreshes the website. Continue?"))) return; savingButton(b, t("发布中…", "Publishing…")); teFlush().then(function () { return post("teachers/approve", "POST", { id: d.recId }); }).then(function (r) { if (!r.ok) { restoreButton(b); flash(esc(errText(r)), 6000); return; } flashOk(t("已批准并写入 Airtable。", "Approved and written to Airtable.") + (r.body.skipped && r.body.skipped.length ? " " + t("未写入（表里没有这一列）：", "Not written (column missing): ") + r.body.skipped.map(teFieldLabel).join(", ") : ""), 6000); teReload(host); }); });
    if ($("teReturn")) $("teReturn").addEventListener("click", function () { var c = window.prompt(t("退回意见（老师会看到）：", "Comment for the teacher:")); if (c == null) return; var b = this; savingButton(b); post("teachers/return", "POST", { id: d.recId, comment: c }).then(function (r) { if (!r.ok) { restoreButton(b); flash(esc(errText(r)), 5000); return; } flashOk(t("已退回。", "Returned."), 3000); teReload(host); }); });
  }
  function teReload(host) { teOpen(teState.doc.recId, host); if (teState.list) teLoadList().then(function () { if ($("tetable")) teRenderList(); }); }
  function teSave(k, v, host) {
    clearTimeout(teState.timers[k]); teState.timers[k] = null;
    if (!teState.doc || teState.doc.draft[k] === v) return Promise.resolve();
    teState.doc.draft[k] = v;
    return post("teachers/field", "PATCH", { id: teState.doc.recId, key: k, value: v }).then(function (r) {
      if (!r.ok) { flash(esc(errText(r)), 5000); return; }
      teState.doc.status = r.body.status; var m = $("teSaved"); if (m) { m.textContent = t("已保存", "Saved"); clearTimeout(m._t); m._t = setTimeout(function () { m.textContent = ""; }, 2000); }
      if (!$("teSubmit") && teState.doc.canEdit) teRenderForm(host); // the submit button appears with the first change
    });
  }
  function teFlush() { var ps = []; Object.keys(teState.timers).forEach(function (k) { if (teState.timers[k]) { var ta = document.querySelector('textarea[data-k="' + k + '"]'); if (ta) ps.push(teSave(k, ta.value)); } }); return Promise.all(ps); }
  // the photo: a JPEG / PNG, cropped to a centred square and scaled to 800×800 JPEG in the browser → `done(dataUrl)`
  function tePhotoData(f, done) {
    if (!/^image\/(jpeg|png)$/.test(f.type)) { flash(esc(t("请选择 JPEG 或 PNG 图片。", "Please choose a JPEG or PNG image.")), 4000); return; }
    if (f.size > 12 * 1024 * 1024) { flash(esc(t("图片太大（超过 12 MB）。", "The image is too large (over 12 MB).")), 4000); return; }
    var url = URL.createObjectURL(f), img = new Image();
    img.onload = function () {
      URL.revokeObjectURL(url);
      var side = Math.min(img.naturalWidth, img.naturalHeight); if (side < 200) { flash(esc(t("图片太小，至少 200×200 像素。", "At least 200×200 pixels, please.")), 4000); return; }
      var out = 800, c = document.createElement("canvas"); c.width = out; c.height = out; var ctx = c.getContext("2d"); ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, out, out);
      var q = 0.88, data = c.toDataURL("image/jpeg", q); while (data.length > 600 * 1024 * 4 / 3 && q > 0.5) { q -= 0.1; data = c.toDataURL("image/jpeg", q); }
      done(data);
    };
    img.onerror = function () { URL.revokeObjectURL(url); flash(esc(t("这个文件无法作为图片打开。", "This file cannot be opened as an image.")), 4000); };
    img.src = url;
  }
