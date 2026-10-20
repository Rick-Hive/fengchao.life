// management/src/27-teachers.js — 教师资料 / Teacher profiles (enrollment rules design §4, Rick 2026-10-20).
// The Airtable Teachers table is the teacher library; here a teacher (我的账号 › 教师资料), the school's education
// leader (学校管理 › 教师资料, 「教师库有时候会是校长维护，统一填写」), the curriculum director or the system
// administrator edits the photo, 简介 and 专长 as a draft, submits it, and an approver (curriculum director / CEO /
// sysadmin) approves — which writes Airtable and asks for the website sync. Autosave: 1.5 s after a change.
// Part of management.js: scripts/build-management.js concatenates management/src/*.js in name order.

  var teState = { list: null, me: null, doc: null, timers: {}, filter: "all", scope: "" };
  function teIsLeader() { return ((me && me.roles) || []).some(function (r) { return /^domain_leader:/.test(r); }); }
  function teCanManage() { return isAdmin() || coIsApprover() || teIsLeader(); }
  function teStatusTag(s) {
    var m = { "": ["未修改", "Unchanged", "muted"], draft: ["草稿", "Draft", ""], submitted: ["待审批", "Pending approval", "accent"], published: ["已发布", "Published", "ok"] }[s] || ["", "", ""];
    return m[0] ? '<span class="tag ' + m[2] + '">' + esc(t(m[0], m[1])) + "</span>" : "";
  }
  function teLoadList() { return api("teachers/list").then(function (r) { if (r.ok) { teState.list = r.body.teachers || []; teState.me = r.body.me || null; } return r; }); }

  // ---- 我的账号 › 教师资料: the signed-in teacher's own record, edited on the page itself -------------------
  function viewTeacherMine() {
    setTitle(t("我的账号", "My account"), t("教师资料", "Teacher profile"), "", { info: t("网站老师页上显示的照片、简介和专长。改动先存为草稿，提交后由课程总监批准并发布到网站。", "The photo, biography and expertise shown on the website. Changes are a draft until the curriculum director approves and publishes them.") });
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
    setTitle(domainGroupTitle(), t("教师资料", "Teacher profiles"), "", { info: t("本校在蜂巢授课的老师：照片、简介、专长是否齐全，谁的资料待批准。点一行即可填写或批准。", "The school's Hive course teachers: whether the photo, biography and expertise are there, and whose changes await approval. Click a row to fill in or approve.") });
    $("content").innerHTML = '<div class="loading">' + t("载入中…", "Loading…") + "</div>";
    teLoadList().then(function (r) {
      if (!r.ok) { $("content").innerHTML = '<div class="msg err">' + esc(errText(r)) + "</div>"; return; }
      teRenderList();
    });
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
      '<div class="tbl-wrap"><table class="data" id="tetable"><thead><tr><th>' + t("老师", "Teacher") + "</th><th>" + t("学校", "School") + "</th><th>" + t("照片", "Photo") + "</th><th>" + t("简介", "Biography") + "</th><th>" + t("专长", "Expertise") + "</th><th>" + t("状态", "Status") + "</th><th>" + t("更新", "Updated") + "</th></tr></thead><tbody>" +
      (rows.length ? rows.map(function (x) {
        var ok = function (v) { return v ? '<span class="tag ok">✓</span>' : '<span class="tag warn">' + t("缺", "missing") + "</span>"; };
        return '<tr class="pick" data-id="' + esc(x.id) + '"><td><span class="dn">' + esc(x.name) + (x.mine ? ' <span class="tag muted">' + t("我", "me") + "</span>" : "") + '</span><span class="sub">' + esc(x.teamsAccount || "") + "</span></td><td>" + esc(x.domain ? dname(x.domain) : x.organization || "—") + "</td><td>" + ok(x.photoUrl) + "</td><td>" + ok(x.hasBio) + "</td><td>" + ok(x.hasExpertise) + "</td><td>" + teStatusTag(x.status) + '</td><td class="faint">' + esc(x.updatedAt ? when(x.updatedAt) : "") + "</td></tr>";
      }).join("") : '<tr><td colspan="7" class="faint">' + t("没有符合的老师。", "No teacher matches.") + "</td></tr>") + "</tbody></table></div>";
    $("tebar").addEventListener("click", function (e) { var c = e.target.closest(".chip[data-f]"); if (!c) return; teState.filter = c.getAttribute("data-f"); teRenderList(); });
    var sc = $("teScope"); if (sc) sc.addEventListener("change", function () { teState.scope = sc.value; teRenderList(); });
    $("tetable").addEventListener("click", function (e) { var tr = e.target.closest("tr[data-id]"); if (!tr) return; var x = list.filter(function (y) { return y.id === tr.getAttribute("data-id"); })[0]; panelOpen('<div class="ph"><h3>' + esc(x ? x.name : "") + '</h3><button class="x" type="button" aria-label="close">✕</button></div><div class="pb"><div class="loading">' + t("载入中…", "Loading…") + "</div></div>"); teOpen(tr.getAttribute("data-id"), $("panel").querySelector(".pb")); });
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
    host.innerHTML =
      '<div class="tehead"><div class="tephoto">' + (photo ? '<img src="' + esc(photo) + '" alt="" />' : '<div class="teph-empty">' + t("无照片", "No photo") + "</div>") + (can ? '<button type="button" class="btn secondary sm" id="tePhotoBtn">' + t("更换照片", "Change photo") + '</button><input type="file" id="tePhotoFile" accept="image/jpeg,image/png" hidden />' : "") + "</div>" +
        '<div class="tefacts"><h3>' + esc(p.name) + "</h3>" + teStatusTag(d.status) + '<div class="kv">' +
          (p.teamsAccount ? '<span class="k">' + t("账号", "Account") + "</span><span>" + esc(p.teamsAccount) + "</span>" : "") +
          (p.organization ? '<span class="k">' + t("所属机构", "Organization") + "</span><span>" + esc(p.organization) + "</span>" : "") +
          (p.subjects ? '<span class="k">' + t("学科", "Subjects") + "</span><span>" + esc(p.subjects) + "</span>" : "") +
          (p.languages ? '<span class="k">' + t("语言", "Languages") + "</span><span>" + esc(p.languages) + "</span>" : "") +
          (p.gradeLevels ? '<span class="k">' + t("年级段", "Grade levels") + "</span><span>" + esc(p.gradeLevels) + "</span>" : "") +
          '</div><p class="sub">' + t("学科、语言、年级段在 Airtable 教师表里维护。", "Subjects, languages and grade levels are kept on the Airtable Teachers table.") + "</p></div></div>" +
      '<div class="msg ' + (d.returned && d.status !== "submitted" ? "err" : "ok") + '" id="teStatus">' + status + "</div>" +
      '<label class="f">' + t("简介", "Biography") + ' <small class="faint">' + t("网站老师页上的自我介绍，建议 100–300 字", "Shown on the website; 100–300 words works well") + '</small><textarea id="teBio" rows="6" data-k="bio"' + (can ? "" : " readonly") + ">" + esc(d.draft.bio || "") + "</textarea></label>" +
      '<label class="f">' + t("专长", "Expertise") + ' <small class="faint">' + t("教学专长与特长，一两句", "Teaching strengths, a sentence or two") + '</small><textarea id="teExp" rows="3" data-k="expertise"' + (can ? "" : " readonly") + ">" + esc(d.draft.expertise || "") + "</textarea></label>" +
      '<div class="actions" id="teActions">' +
        (can && d.status === "draft" ? '<button type="button" class="btn" id="teSubmit">' + t("提交审批", "Submit for approval") + "</button>" : "") +
        (d.canApprove && (d.status === "submitted" || d.status === "draft") ? '<button type="button" class="btn' + (d.status === "submitted" ? "" : " secondary") + '" id="teApprove">' + t("批准并发布", "Approve and publish") + "</button>" : "") +
        (d.canApprove && d.status === "submitted" ? '<button type="button" class="btn secondary" id="teReturn">' + t("退回", "Return") + "</button>" : "") +
        '<span class="faint" id="teSaved"></span></div>' +
      (d.history && d.history.length ? "<h4>" + t("修改记录", "History") + '</h4><div class="hist">' + d.history.slice(0, 8).map(function (h) { return '<div class="hrow"><span class="hat">' + esc(when(h.at)) + '<span class="hwho">' + esc(h.by || "") + "</span></span><span>" + esc({ save: t("修改 ", "changed ") + (h.fields || []).map(function (k) { return k === "bio" ? t("简介", "biography") : t("专长", "expertise"); }).join("、"), photo: t("更换照片", "changed the photo"), submit: t("提交审批", "submitted"), return: t("退回", "returned") + (h.note ? "：" + h.note : ""), approve: t("批准并发布", "approved and published") }[h.action] || h.action) + "</span></div>"; }).join("") + "</div>" : "");
    if (can) {
      host.querySelectorAll("textarea[data-k]").forEach(function (ta) {
        coAutosize(ta);
        ta.addEventListener("input", function () { coAutosize(ta); var k = ta.getAttribute("data-k"); clearTimeout(teState.timers[k]); teState.timers[k] = setTimeout(function () { teSave(k, ta.value, host); }, 1500); });
        ta.addEventListener("blur", function () { var k = ta.getAttribute("data-k"); if (teState.timers[k]) { clearTimeout(teState.timers[k]); teSave(k, ta.value, host); } });
      });
      $("tePhotoBtn").addEventListener("click", function () { $("tePhotoFile").click(); });
      $("tePhotoFile").addEventListener("change", function () { var f = this.files && this.files[0]; this.value = ""; if (f) tePhotoPick(f, host); });
      if ($("teSubmit")) $("teSubmit").addEventListener("click", function () { var b = this; savingButton(b); teFlush().then(function () { return post("teachers/submit", "POST", { id: d.recId }); }).then(function (r) { if (!r.ok) { restoreButton(b); flash(esc(errText(r)), 5000); return; } flashOk(t("已提交，课程总监批准后发布到网站。", "Submitted; it goes to the website once approved."), 4000); teReload(host); }); });
    }
    if ($("teApprove")) $("teApprove").addEventListener("click", function () { var b = this; if (!window.confirm(t("批准并写入 Airtable，网站随后更新。继续？", "Approve: writes Airtable and refreshes the website. Continue?"))) return; savingButton(b, t("发布中…", "Publishing…")); teFlush().then(function () { return post("teachers/approve", "POST", { id: d.recId }); }).then(function (r) { if (!r.ok) { restoreButton(b); flash(esc(errText(r)), 6000); return; } flashOk(t("已批准并写入 Airtable。", "Approved and written to Airtable.") + (r.body.skipped && r.body.skipped.length ? " " + t("未写入（表里没有这一列）：", "Not written (column missing): ") + r.body.skipped.join(", ") : ""), 5000); teReload(host); }); });
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
  // the photo: a JPEG / PNG, cropped to a centred square and scaled to 800×800 JPEG in the browser, then saved
  function tePhotoPick(f, host) {
    if (!/^image\/(jpeg|png)$/.test(f.type)) { flash(esc(t("请选择 JPEG 或 PNG 图片。", "Please choose a JPEG or PNG image.")), 4000); return; }
    if (f.size > 12 * 1024 * 1024) { flash(esc(t("图片太大（超过 12 MB）。", "The image is too large (over 12 MB).")), 4000); return; }
    var url = URL.createObjectURL(f), img = new Image();
    img.onload = function () {
      URL.revokeObjectURL(url);
      var side = Math.min(img.naturalWidth, img.naturalHeight); if (side < 200) { flash(esc(t("图片太小，至少 200×200 像素。", "At least 200×200 pixels, please.")), 4000); return; }
      var out = 800, c = document.createElement("canvas"); c.width = out; c.height = out; var ctx = c.getContext("2d"); ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, out, out);
      var q = 0.88, data = c.toDataURL("image/jpeg", q); while (data.length > 600 * 1024 * 4 / 3 && q > 0.5) { q -= 0.1; data = c.toDataURL("image/jpeg", q); }
      var b = $("tePhotoBtn"); if (b) savingButton(b, t("上传中…", "Uploading…"));
      post("teachers/photo", "POST", { id: teState.doc.recId, data: data }).then(function (r) { if (!r.ok) { if (b) restoreButton(b); flash(esc(errText(r)), 5000); return; } flashOk(t("照片已更新（草稿）。", "Photo updated (draft)."), 3000); teReload(host); });
    };
    img.onerror = function () { URL.revokeObjectURL(url); flash(esc(t("这个文件无法作为图片打开。", "This file cannot be opened as an image.")), 4000); };
    img.src = url;
  }
