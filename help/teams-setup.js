// Moved out of help/teams-setup.html so the Content-Security-Policy can drop 'unsafe-inline' for scripts (2026-10-22).
(function () {
  "use strict";

  // ---- language ----
  var LANG = "zh";
  try {
    var savedLang = localStorage.getItem("fc-lang");
    if (savedLang === "en" || savedLang === "zh") LANG = savedLang;
  } catch (e) {}
  function T(zh, en) { return LANG === "en" ? en : zh; }

  (function applyStatic() {
    if (LANG !== "en") return;
    document.documentElement.lang = "en";
    document.title = "Microsoft Teams & Authenticator setup wizard · Hive Help";
    Array.prototype.forEach.call(document.querySelectorAll("[data-en]"), function (el) { el.innerHTML = el.getAttribute("data-en"); });
    Array.prototype.forEach.call(document.querySelectorAll("[data-en-title]"), function (el) { el.title = el.getAttribute("data-en-title"); });
    Array.prototype.forEach.call(document.querySelectorAll("[data-en-label]"), function (el) { el.setAttribute("aria-label", el.getAttribute("data-en-label")); });
  })();

  var langBtn = document.getElementById("langBtn");
  langBtn.textContent = T("EN", "中文");
  langBtn.addEventListener("click", function () {
    try { localStorage.setItem("fc-lang", LANG === "en" ? "zh" : "en"); } catch (e) {}
    try { sessionStorage.setItem("teamsSetupLangScreen", state.screen || "who"); } catch (e) {}
    location.reload();
  });

  // ---- state & paths ----
  // who: new | back        dev: ios | android
  // verifier (android): own | admin      brand (android)      second (ios): win | mac | ipad
  var state = { who: null, dev: null, verifier: null, brand: null, second: null, screen: "who", checked: null };
  try {
    var saved = JSON.parse(localStorage.getItem("teamsSetupWizard2") || "null");
    if (saved && saved.who) state = saved;
  } catch (e) {}
  function save() { try { localStorage.setItem("teamsSetupWizard2", JSON.stringify(state)); } catch (e) {} }

  // The four routes (Rick, 2026-09-23). Every screen is a <section
  // data-screen>; the progress bar is built from the current route.
  function route() {
    if (state.dev === "android") {
      return state.verifier === "admin"
        ? ["who", "dev", "android-verifier", "brand", "signin-admin", "done"]
        : ["who", "dev", "android-verifier", "ios-auth", "brand", "signin-android", "done"];
    }
    // Returning, and the old device still switches on: the wizard walks the
    // person through moving the authenticator themselves, a screen per step
    // (Rick, 2026-09-24).
    if (state.who === "back" && isMove()) return ["who", "dev", "ios-check", "second", "move-add", "move-remove", "done"];
    return state.who === "back"
      ? ["who", "dev", "ios-check", "second", "signin-pc", "done"]
      : ["who", "dev", "ios-install", "second", "signin-pc", "done"];
  }
  function isMove() { return state.checked === "have" && state.oldDev === "have"; }
  // Step 3's two confirmations, for whichever old-device answer was given.
  function checkDone() {
    if (state.checked !== "have") return !!state.checked;
    if (state.oldDev === "gone") return !!(state.adminDone && state.cleanDone);
    if (state.oldDev === "have") return !!(state.oldOn && state.cleanDone);
    return false;
  }
  var LABELS = {
    "who": T("情况", "You"), "dev": T("手机", "Phone"),
    "ios-install": T("装软件", "Install"), "ios-check": T("检查验证器", "Check app"),
    "second": T("另一台设备", "2nd device"), "signin-pc": T("登录绑定", "Sign in"),
    "android-verifier": T("验证器在哪", "Authenticator"), "ios-auth": T("装验证器", "Install app"),
    "brand": T("装 Teams", "Install Teams"), "signin-android": T("登录扫码", "Sign in"),
    "signin-admin": T("管理员扫码", "Admin scans"), "done": T("完成", "Done"),
    "move-add": T("加新设备", "Add new"), "move-remove": T("删老设备", "Remove old")
  };

  // What a screen needs before it can make sense; missing → back to where it is asked.
  function missingFor(id) {
    var r = route(), i = r.indexOf(id);
    if (i < 0) return { screen: "who", msg: T("请先从第 1 步开始。", "Start from step 1.") };
    if (i >= 1 && !state.who) return { screen: "who", msg: T("请先选择您是新用户还是老用户。", "Choose new or returning user first.") };
    if (i >= 2 && !state.dev) return { screen: "dev", msg: T("请先选择手机类型。", "Choose your phone type first.") };
    if (state.dev === "android" && i >= 3 && !state.verifier) return { screen: "android-verifier", msg: T("请先选择验证器放在哪里。", "Choose where the authenticator lives first.") };
    if (state.dev === "android" && r.indexOf("brand") >= 0 && i > r.indexOf("brand") && !state.brand) return { screen: "brand", msg: T("请先选择手机品牌。", "Choose the phone brand first.") };
    // The progress bar must not jump past step 3's check for a returning
    // iPhone/iPad user: the linking steps only work once the old device is
    // gone from the account (Rick, 2026-09-24).
    var ci = r.indexOf("ios-check");
    if (ci >= 0 && i > ci) {
      if (!state.checked) return { screen: "ios-check", msg: T("请先在这一步选择您的验证器是哪种情况。", "First choose which applies to your authenticator in this step.") };
      if (state.checked === "have") {
        if (!state.oldDev) return { screen: "ios-check", msg: T("请先选择老设备还在不在。", "First choose whether your old device is still around.") };
        if (state.oldDev === "have" && !checkDone()) return { screen: "ios-check", msg: T("请先确认这一步的两项：老设备在手边能开机；新设备上的旧账号已删掉。", "First confirm both items in this step: the old device is at hand and switches on; any old entry on the new device is removed.") };
        if (!checkDone()) return { screen: "ios-check", msg: T("请先确认管理员已经删除了您的老设备（勾选这一步的两项）。", "First confirm that the administrator has removed your old device (tick both boxes in this step).") };
      }
    }
    if (state.dev === "ios" && i > r.indexOf("second") && !state.second) return { screen: "second", msg: T("请先选择第二台设备。", "Choose the second device first.") };
    return null;
  }

  // ---- progress ----
  var progressEl = document.getElementById("progress");
  var progressHintEl = document.getElementById("progressHint");
  var HINT_DEFAULT = progressHintEl.textContent;
  var hintTimer = null;
  function resetHint() { clearTimeout(hintTimer); progressHintEl.textContent = HINT_DEFAULT; progressHintEl.removeAttribute("data-tone"); }
  function showHint(msg) { progressHintEl.textContent = msg; progressHintEl.setAttribute("data-tone", "warn"); clearTimeout(hintTimer); hintTimer = setTimeout(resetHint, 6000); }

  function renderProgress() {
    var r = route(), cur = r.indexOf(state.screen);
    progressEl.innerHTML = "";
    r.forEach(function (id, i) {
      var li = document.createElement("li");
      li.dataset.state = i < cur ? "done" : (i === cur ? "active" : "");
      var b = document.createElement("button");
      b.type = "button";
      b.innerHTML = '<span class="bar"><span></span></span><span class="label">' + (i + 1) + ". " + LABELS[id] + "</span>";
      b.setAttribute("aria-current", i === cur ? "step" : "false");
      b.addEventListener("click", function () {
        var gap = missingFor(id);
        if (gap) { goTo(gap.screen); showHint(gap.msg); return; }
        resetHint(); goTo(id);
      });
      li.appendChild(b); progressEl.appendChild(li);
    });
    document.getElementById("introAfter").innerHTML = state.who
      ? T("您的路线共 " + r.length + " 步，大约 10 分钟。整个设置只做一次。", "Your route has " + r.length + " steps, about 10 minutes. You do this once.")
      : T("先回答两个问题，向导会按您的情况排出步骤。整个设置只做一次，大约 10 分钟。", "Answer two questions and the wizard lays out the steps that fit you. It takes about 10 minutes, once.");
    // Step numbers on the cards follow the route.
    Array.prototype.forEach.call(document.querySelectorAll("section[data-screen]"), function (sec) {
      var n = r.indexOf(sec.dataset.screen);
      var num = sec.querySelector(".step-num");
      if (num && n >= 0) num.textContent = T("第 " + (n + 1) + " 步", "Step " + (n + 1));
    });
  }

  // ---- side column ----
  var sideEl = document.getElementById("sideNotes");
  var wideMQ = window.matchMedia("(min-width: 1140px)");
  var sideNotes = Array.prototype.map.call(document.querySelectorAll("details[data-side]"), function (el) {
    var slot = document.createElement("span"); slot.hidden = true;
    el.parentNode.insertBefore(slot, el);
    return { el: el, slot: slot, screen: el.getAttribute("data-side") };
  });
  function placeNotes() {
    var wide = wideMQ.matches, shown = 0;
    sideNotes.forEach(function (n) {
      var toSide = wide && n.screen === state.screen && !n.el.hidden;
      if (toSide) {
        if (n.el.parentNode !== sideEl) { sideEl.appendChild(n.el); if (!n.el.classList.contains("trouble")) n.el.open = true; }
        shown++;
      } else if (n.el.parentNode === sideEl) {
        n.el.open = n.el.hasAttribute("data-keep-open");
        n.slot.parentNode.insertBefore(n.el, n.slot.nextSibling);
      }
    });
    sideEl.hidden = !wide || shown === 0;
  }
  if (wideMQ.addEventListener) wideMQ.addEventListener("change", placeNotes); else if (wideMQ.addListener) wideMQ.addListener(placeNotes);

  var introAfterEl = document.getElementById("introAfter");

  function goTo(id) {
    state.screen = id;
    Array.prototype.forEach.call(document.querySelectorAll("section[data-screen]"), function (sec) { sec.hidden = sec.dataset.screen !== id; });
    var builders = { "ios-check": buildCheck, "second": buildSecond, "signin-pc": buildSigninPc, "move-add": buildMoveAdd, "android-verifier": buildVerifier,
                     "brand": buildBrand, "signin-android": buildSigninAndroid, "signin-admin": buildSigninAdmin, "done": buildDone };
    if (builders[id]) builders[id]();
    placeNotes(); renderProgress(); save();
    // Remembered for this browser tab only, so leaving for 流程图 or 问答(Q&A)
    // and coming back lands on the same step (Rick, 2026-09-23). A visit in a
    // new tab or days later still opens at step 1, with the answers kept.
    try { sessionStorage.setItem("teamsSetupScreen", id); } catch (e) {}
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function next() { var r = route(), i = r.indexOf(state.screen); if (i < r.length - 1) goTo(r[i + 1]); }
  function back() { var r = route(), i = r.indexOf(state.screen); if (i > 0) goTo(r[i - 1]); }
  Array.prototype.forEach.call(document.querySelectorAll("[data-back]"), function (b) { b.addEventListener("click", back); });
  Array.prototype.forEach.call(document.querySelectorAll("[data-next]"), function (b) { b.addEventListener("click", next); });

  // radio: a second-level choice nested under a first-level one, drawn as
  // radio buttons so it reads as a sub-question, not another set of cards
  // (Rick, 2026-09-24).
  function pickGroup(el, items, current, onPick, radio) {
    el.innerHTML = "";
    var attr = radio ? "aria-checked" : "aria-pressed";
    if (radio) el.setAttribute("role", "radiogroup");
    items.forEach(function (it) {
      var b = document.createElement("button");
      b.type = "button"; if (radio) b.setAttribute("role", "radio");
      b.setAttribute(attr, it.id === current ? "true" : "false");
      b.innerHTML = '<span class="name">' + it.name + '</span><span class="tag">' + it.tag + '</span>' + (it.sub ? '<span class="sub">' + it.sub + '</span>' : "");
      b.addEventListener("click", function () {
        Array.prototype.forEach.call(el.children, function (c) { if (c.tagName === "BUTTON") c.setAttribute(attr, "false"); });
        b.setAttribute(attr, "true");
        onPick(it.id);
      });
      el.appendChild(b);
    });
  }
  function nextBtn(screen) { return document.querySelector('section[data-screen="' + screen + '"] [data-next]'); }

  // ---- who ----
  pickGroup(document.getElementById("whoPick"), [
    { id: "new",  name: T("我是 Teams 新用户，第一次登录", "I am new to Teams — first sign-in"), tag: T("从安装软件开始，一步步做完", "from installing the apps to the first sign-in") },
    { id: "back", name: T("我曾经登录过 Teams，但被要求做身份验证", "I have used Teams before, now it asks me to input Authenticator verification code"), tag: T("先检查验证器在哪里，再补上验证", "we check where the authenticator is, then complete the verification") }
  ], state.who, function (id) { state.who = id; nextBtn("who").disabled = false; save(); renderProgress(); });
  if (state.who) nextBtn("who").disabled = false;

  // ---- dev ----
  pickGroup(document.getElementById("devPick"), [
    { id: "ios",     name: T("📱 iPhone 或 iPad", "📱 iPhone or iPad"), tag: T("验证器装在自己的设备上", "the authenticator lives on your own device") },
    { id: "android", name: T("🤖 安卓手机", "🤖 Android phone"), tag: T("能装 Teams；验证器要放在一部 iPhone / iPad 上", "runs Teams; the authenticator needs an iPhone or iPad") }
  ], state.dev, function (id) {
    if (id !== state.dev) { state.verifier = null; state.second = null; state.brand = null; state.confirmed = false; }
    state.dev = id; nextBtn("dev").disabled = false; save(); renderProgress();
  });
  if (state.dev) nextBtn("dev").disabled = false;

  // ---- ios-check (returning iOS user) ----
  function buildCheck() {
    var box = document.getElementById("checkContent");
    pickGroup(document.getElementById("checkPick"), [
      { id: "none", name: T("我的 iPhone / iPad 上还没有验证器", "My iPhone or iPad has no authenticator yet"), tag: T("先装好，再用另一台设备登录绑定", "install it, then link it from a second device") },
      { id: "have", name: T("已经装了验证器，但登录时它没有任何提示", "The authenticator is installed, but nothing appears when I sign in"), tag: T("多半是账号绑在另一台设备上", "most likely the account is linked to another device") }
    ], state.checked, function (id) { if (id !== state.checked) { state.oldDev = null; state.adminDone = false; state.cleanDone = false; state.oldOn = false; } state.checked = id; save(); renderProgress(); renderCheck(); });
    renderCheck();
    function renderCheck() {
      var nb = nextBtn("ios-check");
      if (!state.checked) { box.innerHTML = ""; nb.disabled = true; return; }
      nb.disabled = !checkDone();
      var pressedCheck = document.querySelector('#checkPick button[aria-pressed="true"]');
      if (pressedCheck) pressedCheck.insertAdjacentElement("afterend", box);
      if (state.checked === "none") {
        // An instruction, not a choice: numbered steps with an accent rule,
        // opening right under the card picked, so it cannot be mistaken for a
        // third option (Rick, 2026-09-24).
        var li0 = function (zh, en) { return '<li><span class="txt">' + T(zh, en) + "</span></li>"; };
        box.innerHTML =
          '<div class="todo"><p class="todo-head">' + T("<strong>这一步要做的：</strong>在这部 iPhone / iPad 上装好微软身份验证器（Microsoft Authenticator）。",
                    "<strong>What to do in this step:</strong> install Microsoft Authenticator on this iPhone or iPad.") + '</p>' +
          '<ol class="steps inner">' +
            li0("打开 App Store → 搜索 <code>Authenticator</code> → 安装。",
                "Open the App Store → search <code>Authenticator</code> → install.") +
            li0("怎么认：叫 <strong>Microsoft Authenticator</strong>，图标是<strong>蓝色的锁形</strong>，开发者是 <strong>Microsoft Corporation</strong>。",
                "How to recognize it: <strong>Microsoft Authenticator</strong>, a <strong>blue padlock</strong> icon, developer <strong>Microsoft Corporation</strong>.") +
            li0("<strong>装好就行，先别在验证器里登录。</strong>下一步用另一台设备把它和账号绑起来。",
                "<strong>Install it, and do not sign in inside the app.</strong> The next step links it to your account from a second device.") +
          '</ol></div>';
      } else {
        // Two ways on, and which one depends only on whether the old device
        // still switches on (Rick, 2026-09-24):
        //  - it does: the wizard walks the person through moving the
        //    authenticator themselves (screens move-add, move-remove);
        //  - it does not: the administrator deletes it, then the usual
        //    linking steps.
        // Either way Next waits for two confirmations. The sub-question is a
        // radio group, so it reads as second-level.
        box.innerHTML =
          '<div class="note warn">' + T("<strong>验证码只发到当初绑定的那台设备上。</strong>您多半是在一部老手机或 iPad 上设置过验证器。",
                    "<strong>The verification code only goes to the device that was linked.</strong> Most likely you set up the authenticator on an older phone or iPad.") + '</div>' +
          '<p class="sub-q" id="oldDevQ">' + T("老设备还在吗？", "Is that old device still around?") + '</p>' +
          '<div class="branch-pick stack radio" id="oldDevPick" aria-labelledby="oldDevQ"></div>' +
          '<div id="oldDevContent"></div>';
        pickGroup(document.getElementById("oldDevPick"), [
          { id: "have", name: T("老设备还在，能开机", "My old device is still here and switches on"), tag: T("向导带您自己把验证器转到新设备上，不用找管理员", "the wizard walks you through moving the authenticator yourself — no administrator needed") },
          { id: "gone", name: T("老设备已经不在了（丢了、坏了、送人了）", "My old device is gone (lost, broken, given away)"), tag: T("请管理员删除老设备，再重新绑定", "the administrator removes it, then you link again") }
        ], state.oldDev, function (id) { if (id !== state.oldDev) { state.adminDone = false; state.cleanDone = false; state.oldOn = false; } state.oldDev = id; save(); renderProgress(); renderOld(); }, true);
        renderOld();
      }
      function confirmRow(id, on, zh, en) {
        return '<label class="confirm"><input type="checkbox" id="' + id + '"' + (on ? " checked" : "") + '> <span>' + T(zh, en) + '</span></label>';
      }
      function renderOld() {
        var oc = document.getElementById("oldDevContent");
        if (!oc) return;
        // The follow-up opens right under the option picked, not below both
        // (Rick, 2026-09-24).
        var picked = document.querySelector('#oldDevPick button[aria-checked="true"]');
        if (picked) picked.insertAdjacentElement("afterend", oc);
        nb.disabled = !checkDone();
        if (!state.oldDev) { oc.innerHTML = ""; return; }
        var clean = confirmRow("chkClean", state.cleanDone,
          "这部新 iPhone / iPad 的验证器里如果已经有学校账号，我已经把它删掉了（点进账号 → 右上角齿轮 →「删除账户」）；没有的话直接勾选。",
          "If the authenticator on this new iPhone or iPad already lists the school account, I have removed it (open the account → gear icon at the top right → <strong>Remove account</strong>); if it does not, just tick this.");
        var first;
        if (state.oldDev === "have") {
          // No list of operations here: the steps come one screen at a time
          // after Next (Rick, 2026-09-24: "我们是Wizard").
          oc.innerHTML =
            '<div class="note good">' + T("<strong>好办：您自己就能把验证器转到这部新设备上，不用找管理员。</strong>接下来向导一步一步带您做：准备一块显示二维码的屏幕 → 加上新设备 → 删掉老设备。",
                      "<strong>Good news: you can move the authenticator to this new device yourself — no administrator needed.</strong> The wizard takes you through it one step at a time: a screen to show the QR code → add the new device → remove the old one.") + '</div>' +
            '<p class="check-lead">' + T("<strong>开始之前，先确认下面两件事：</strong>", "<strong>Before you start, confirm both of these:</strong>") + '</p>' +
            confirmRow("chkOldOn", state.oldOn, "老设备就在我手边，已经开机，能打开它上面的验证器。", "The old device is here with me, switched on, and I can open its authenticator.") +
            clean;
          first = document.getElementById("chkOldOn");
        } else {
          oc.innerHTML =
            '<div class="note plain">' + T("请联系<strong>为您分配账号的管理员</strong>，请他删除您的老设备。<strong>等他告诉您处理好了</strong>，再往下走：用另一台设备把这部 iPhone / iPad 上的验证器重新绑定。",
                      "Contact <strong>the administrator who issued your account</strong> and ask them to remove your old device. <strong>Once they tell you it is done</strong>, go on: link the authenticator on this iPhone or iPad again from a second device.") + '</div>' +
            '<p class="check-lead">' + T("<strong>往下走之前，先确认下面两件事：</strong>", "<strong>Before you go on, confirm both of these:</strong>") + '</p>' +
            confirmRow("chkAdmin", state.adminDone, "管理员已经告诉我：我的老设备删掉了。", "The administrator has told me my old device has been removed.") +
            clean;
          first = document.getElementById("chkAdmin");
        }
        var cc = document.getElementById("chkClean");
        var sync = function () {
          if (state.oldDev === "have") state.oldOn = first.checked; else state.adminDone = first.checked;
          state.cleanDone = cc.checked; save(); nb.disabled = !checkDone();
        };
        first.onchange = sync; cc.onchange = sync;
      }
    }
  }

  // ---- second (iOS) ----
  function browserRow(name, how, keys, kind, best) {
    return '<div class="browser-row' + (kind === "bad" ? " bad" : "") + '"><span class="bname">' + (best ? "★ " : "") + name + (best ? ' <span class="pill must">' + T("最佳选择", "best choice") + '</span>' : "") + '</span><span class="bhow">' + how + '</span><span class="keys">' + keys + "</span></div>";
  }
  // On the move route the same screen gets the Security info page ready, and
  // the old device itself may be the second screen.
  var secSec = document.querySelector('section[data-screen="second"]');
  var secH2 = secSec.querySelector("h2"), secDesc = secSec.querySelector(".step-desc");
  var SEC_H2 = secH2.innerHTML, SEC_DESC = secDesc.innerHTML;
  function buildSecond() {
    var box = document.getElementById("secondContent"), move = isMove();
    secH2.innerHTML = move ? T("准备一块屏幕，打开「安全信息」页", "Get a screen ready for the Security info page") : SEC_H2;
    secDesc.innerHTML = move
      ? T("新设备的验证器要<strong>扫一个二维码</strong>，二维码显示在<strong>另一块屏幕</strong>上。用电脑最方便；没有电脑，<strong>老设备本身</strong>也行——选「老设备或另一台 iPad / iPhone」。先在那块屏幕上开一个无痕窗口。",
          "The new device's authenticator will <strong>scan a QR code</strong> shown on <strong>another screen</strong>. A computer is easiest; without one, <strong>the old device itself</strong> works — choose &ldquo;The old device or another iPad / iPhone&rdquo;. First open a private window on that screen.")
      : SEC_DESC;
    pickGroup(document.getElementById("secondPick"), [
      { id: "win",  name: "🪟 Windows", tag: T("最佳浏览器：Edge", "best browser: Edge") },
      { id: "mac",  name: T("🍎 Mac（苹果电脑）", "🍎 Mac"), tag: T("最佳浏览器：Chrome 或 Edge", "best browser: Chrome or Edge") },
      { id: "ipad", name: move ? T("📱 老设备或另一台 iPad / iPhone", "📱 The old device or another iPad / iPhone") : T("📱 另一台 iPad 或 iPhone", "📱 Another iPad or iPhone"), tag: T("用 Safari 的无痕标签页", "a private tab in Safari") }
    ], state.second, function (id) { state.second = id; save(); render(); });
    render();
    function render() {
      var nb = nextBtn("second");
      nb.disabled = !state.second;
      if (!state.second) { box.innerHTML = '<div class="note plain">' + T("请先选择上面的设备，我们会给出对应的浏览器建议。", "Choose the device above and we will suggest the right browser.") + '</div>'; return; }
      if (state.second === "win") {
        box.innerHTML =
          '<div class="note good">' + T("<strong>如果这几个浏览器您都有：请用 Edge。</strong>它是 Windows 自带的，不用下载；已装正版 Chrome 的用 Chrome 一样好。", "<strong>If you have several of these browsers, use Edge.</strong> It comes with Windows, so there is nothing to download; if you already have genuine Chrome, it is just as good.") + '</div>' +
          '<div class="browser-list">' +
            browserRow("Edge", T("右上「…」→ 新建 InPrivate 窗口", "Top right &ldquo;…&rdquo; → New InPrivate window"), "Ctrl+Shift+N", "ok", true) +
            browserRow(T("Chrome 谷歌浏览器", "Chrome"), T("右上「⋮」→ 打开新的无痕式窗口", "Top right &ldquo;⋮&rdquo; → New Incognito window"), "Ctrl+Shift+N", "ok", false) +
            browserRow(T("Firefox 火狐", "Firefox"), T("右上「☰」→ 新建隐私浏览窗口", "Top right &ldquo;☰&rdquo; → New private window"), "Ctrl+Shift+P", "ok", false) +
            browserRow(T("360 / QQ 浏览器", "360 / QQ browser"), T("菜单 → 无痕窗口；并切到<strong>极速模式</strong>", "Menu → private window, and switch to <strong>极速模式 (fast mode)</strong>"), "Ctrl+Shift+N", "ok", false) +
            browserRow(T("⚠️ IE 浏览器：不要使用", "⚠️ Internet Explorer: do not use"), T("Teams 早已不支持 IE，一定登录不上", "Teams dropped IE long ago — sign-in will not work"), T("换 Edge", "use Edge"), "bad", false) +
          "</div>" +
          '<div class="note warn">' + T("<strong>三个最容易踩的坑：</strong>①桌面上那个蓝色「e」如果是老版 IE，请换成 Edge；②360 / QQ 浏览器若停在「兼容模式」，内核还是 IE，务必切到「极速模式」；③浏览器<strong>版本太旧也会被拒绝</strong>，先更新到最新版。",
            "<strong>Three common traps:</strong> ① if the blue &ldquo;e&rdquo; on the desktop is old Internet Explorer, switch to Edge; ② a 360 or QQ browser left in compatibility mode is still IE — switch to fast mode; ③ <strong>a browser that is too old is refused</strong> — update to the latest version first.") + '</div>';
      } else if (state.second === "mac") {
        box.innerHTML =
          '<div class="note good">' + T("<strong>Mac 上请优先用 Chrome 或 Edge。</strong>Safari 也支持，但它的隐私机制有时会打断微软登录的多次跳转。", "<strong>Prefer Chrome or Edge on a Mac.</strong> Safari works too, but its privacy protections sometimes interrupt Microsoft's redirects.") + '</div>' +
          '<div class="browser-list">' +
            browserRow(T("Chrome 谷歌浏览器", "Chrome"), T("右上「⋮」→ 打开新的无痕式窗口", "Top right &ldquo;⋮&rdquo; → New Incognito window"), "⌘+Shift+N", "ok", true) +
            browserRow("Edge", T("右上「…」→ 新建 InPrivate 窗口", "Top right &ldquo;…&rdquo; → New InPrivate window"), "⌘+Shift+N", "ok", false) +
            browserRow(T("Safari（Mac 自带）", "Safari (built into macOS)"), T("菜单栏「文件」→ 新建无痕浏览窗口", "Menu bar File → New Private Window"), "⌘+Shift+N", "ok", false) +
          "</div>";
      } else {
        box.innerHTML =
          '<div class="browser-list">' +
            '<div class="browser-row"><span class="bname">Safari</span><span class="bhow">' + T("底部右下「标签页」按钮 → 左下角选「无痕浏览」→ 新建标签页", "Tabs button, bottom right → choose Private at the bottom left → new tab") + '</span><span class="keys">' + T("无痕", "private") + '</span></div>' +
          '</div>' +
          '<div class="note plain">' + (isMove()
            ? T("这台设备只负责显示网页和二维码；扫码用的是<strong>新设备</strong>上的验证器。两台设备不要弄混。", "This device only shows the page and the QR code; the scanning is done by the authenticator on the <strong>new</strong> device. Do not mix up the two.")
            : T("这台 iPad / iPhone 只负责显示二维码；验证器装在您<strong>自己那部</strong>上。两台设备不要弄混。", "This iPad or iPhone only shows the QR code; the authenticator is on <strong>your own</strong> device. Do not mix up the two devices.")) + '</div>';
      }
    }
  }

  // ---- screenshots ----
  function shot(file, alt, cap, rings, tags, maxw) {
    var marks = "";
    if (rings) {
      rings.split(";").forEach(function (r) {
        var v = r.split(",");
        marks += '<span class="ring" style="left:' + v[0] + '%;top:' + v[1] +
          '%;width:' + v[2] + '%;height:' + v[3] + '%"></span>';
      });
    }
    if (tags) {
      tags.split(";").forEach(function (t) {
        var parts = t.split("|");
        var v = parts[0].split(",");
        marks += '<span class="tag ' + (v[2] || "c") + '" style="left:' + v[0] +
          '%;top:' + v[1] + '%">' + parts[1] + "</span>";
      });
    }
    var w = maxw ? ' style="width:min(100%, ' + maxw + 'px)"' : "";
    return '<figure class="shot"><span class="pic"' + w + '>' +
      '<img src="/help/img/' + file + '" alt="' + alt + '" loading="lazy" decoding="async">' + marks +
      '</span>' + (cap ? '<figcaption>' + cap + '</figcaption>' : '') + '</figure>';
  }
  function oops(summary, body) {
    return '<details class="why trouble inline"><summary>' + summary + '</summary>' + body + '</details>';
  }



  // ---- shared sign-in fragments ----
  // Returning users (step 1 = "back") already changed the issued password on
  // their first sign-in, so the Update-your-password step is left out for
  // them (Rick, 2026-09-23); they sign in with the password they use now.
  function backSignin(zhPre, enPre) {
    return T(zhPre + '输入您的账号 → 下一步（Next）→ 输入<strong>您现在用的密码</strong>（第一次登录时自己改过的那个）→ 登录（Sign in）。如果出现「需要更多信息（More information required）」，点 <strong>下一步（Next）</strong>。',
      enPre + 'enter your account → Next → <strong>the password you use now</strong> (the one you set at your first sign-in) → Sign in. If &ldquo;More information required&rdquo; appears, select <strong>Next</strong>.');
  }
  function pwItem() {
    var lead = T('出现 <strong>「更新密码（Update your password）」</strong>——<strong>第一次登录都会有这一屏</strong>，是微软要求您把机构发的密码换成自己的。第一格：粘贴机构发的密码；第二格和第三格：输入您<strong>自己设的新密码</strong>，两格一样。新密码至少 8 位，要有大写字母、小写字母和数字。→ 登录（Sign in）。<strong>请把新密码记下来，以后登录都用它。</strong>',
          '<strong>&ldquo;Update your password&rdquo;</strong> appears — <strong>every first sign-in has this screen</strong>: Microsoft asks you to replace the password your institution issued with your own. First box: paste the issued password. Second and third boxes: type <strong>the new password you choose</strong>, identical in both; at least 8 characters with an upper-case letter, a lower-case letter and a digit. → Sign in. <strong>Write the new password down — it is the one you will use from now on.</strong>');
    return lead +
      shot('pc-update-password.jpg', T('Update your password 页面：三个输入框', 'The Update your password screen, with three boxes'),
        T('第一格旧密码，第二、三格新密码', 'First box: the issued password; second and third: the new one'),
        '0.5,43.5,99,40', T('52,53.5,c|机构发的旧密码;52,64.4,c|您自己设的新密码;52,75.3,c|再输一次新密码', '52,53.5,c|issued password;52,64.4,c|your new password;52,75.3,c|the same again')) +
      oops(T('如果提示密码不符合要求', 'If it says the password does not meet the requirements'),
        '<p>' + T('换一个：长度 8 位以上，同时含大写字母、小写字母、数字，不要包含您的名字或账号。第二、三格必须完全一样。', 'Pick another: 8 characters or more with an upper-case letter, a lower-case letter and a digit, not containing your name or account. The second and third boxes must match.') + '</p>');
  }
  var keepSecureShot = function () { return shot('pc-keep-secure.jpg', "Let's keep your account secure", T('第一屏：让我们保护你的帐户安全', 'Screen 1 of 3: Let\'s keep your account secure'), '64,84,31,15.4', T('38,34.5,r|让我们保护你的帐户安全;62,91.8,l|下一步', '62,91.8,l|select Next'), 390); };
  var installAuthShot = function () { return shot('pc-install-auth.jpg', 'Install Microsoft Authenticator', T('第二屏：这里不用装任何东西，直接下一步', 'Screen 2 of 3: nothing to install here, just select Next'), '59.2,88.5,27.5,10.5', T('50,42,c|已经装好，直接下一步;59.2,95,l|下一步', '50,42,c|already installed;59.2,95,l|select Next'), 390); };
  var setupInAppShot = function () { return shot('pc-setup-in-app.jpg', 'Set up your account in app', T('第三屏：在应用中设置你的帐户', 'Screen 3 of 3: Set up your account in app'), '63.3,87,29.2,12.5', T('50,45,c|在应用中设置你的帐户;61.0,93.9,l|下一步', '61.0,93.9,l|select Next'), 390); };
  var addAccountShot = function (cap) { return shot('ph-add-account.jpg', T('验证器 Add account：选 Work or school account', 'Authenticator Add account: choose Work or school account'), cap, '1,62,98,21', T('50,72,c|选这一条', '50,72,c|choose this')); };
  var qrShot = function (cap) { return shot('pc-scan-qr.jpg', T('Scan the QR code 页面', 'The Scan the QR code page'), cap, '26,26,48,38', T('97,45,l|扫这个码', '97,45,l|scan this')); };
  var tryShot = function (cap, tag) { return shot('pc-try-it-out.jpg', "Let's try it out", cap, '40.9,66.3,17,10.6', tag); };
  var wrongTurn = function () {
    return oops(T('选了「登录（Sign in）」，被要求输账号密码', 'Chose Sign in and it asks for an account and password'),
      '<p>' + T('不要在这里输，点左上角返回，重新「+」→ 工作或学校帐户 → 这次选「扫描 QR 码（Scan QR code）」。账户列表里已经有这个账号的，点进去 → <strong>「设置两步验证（Set up 2-step verification）」</strong> 也能进到扫码界面。',
        'Do not enter anything — go back with the arrow at the top left and start again: &ldquo;+&rdquo; → Work or school account → this time choose Scan QR code. If the account is already in the list, open it → <strong>Set up 2-step verification</strong> also reaches the scanner.') + '</p>' +
      shot('ph-account-2step.jpg', 'Set up 2-step verification', T('账户页 → 设置两步验证（Set up 2-step verification）', 'Account page → Set up 2-step verification'), '1,88.4,98,11.2'));
  };
  // The three screens that only need Next; at the third, the authenticator
  // (whoever holds it) adds the account.
  function threeNext(holder, holderDevice, backTo) {
    return T('接下来三屏都只需点 <strong>下一步（Next）</strong>：「让我们保护你的帐户安全（Let\'s keep your account secure）」→「安装 Microsoft Authenticator（Install Microsoft Authenticator）」（验证器已经装好了，<strong>不用点商店图标，也不用点下面的「其他选项」</strong>）→「在应用中设置你的帐户（Set up your account in app）」。',
        'The next three screens only need <strong>Next</strong>: &ldquo;Let\'s keep your account secure&rdquo; → &ldquo;Install Microsoft Authenticator&rdquo; (already installed — <strong>do not tap the store badges or the Other options link</strong>) → &ldquo;Set up your account in app&rdquo;.') +
      '<div class="shot-row">' + keepSecureShot() + installAuthShot() + setupInAppShot() + '</div>' +
      T('<strong>看到第三屏时，' + holder + '拿起' + holderDevice + '，打开微软身份验证器</strong>：右上「+」→ 选 <strong>「工作或学校帐户（Work or school account）」</strong> → 弹出「登录（Sign in）」和「扫描 QR 码（Scan QR code）」两个选项，<strong>先停在这里</strong>。然后' + backTo + '点 <strong>下一步（Next）</strong>。',
        '<strong>At the third screen, it is time for ' + holder + ' to pick up ' + holderDevice + ' and open Microsoft Authenticator</strong>: &ldquo;+&rdquo; at the top right → <strong>Work or school account</strong> → two options appear, Sign in and Scan QR code. <strong>Stop there.</strong> Then ' + backTo + ' select <strong>Next</strong>.') +
      addAccountShot(T('「+」之后选 工作或学校帐户（Work or school account）', 'After &ldquo;+&rdquo;, choose Work or school account'));
  }

  // ---- signin-pc (iOS: computer or second iPad shows the code) ----
  function buildSigninPc() {
    var onPad = state.second === "ipad";
    var dev = onPad ? T("那台 iPad / iPhone", "that iPad or iPhone") : T("电脑", "the computer");
    document.getElementById("pcDesc").innerHTML = T("在" + dev + "刚打开的无痕窗口里操作。您自己的 iPhone / iPad 放在手边——它的验证器负责扫码。",
      "Work in the private window you just opened on " + dev + ". Keep your own iPhone or iPad within reach — its authenticator does the scanning.");
    var items = [], back = state.who === "back";
    if (back) items.push(backSignin('在无痕窗口的地址栏输入 <code>teams.microsoft.com</code>，回车；', 'In the private window\'s address bar type <code>teams.microsoft.com</code> and press Enter; '));
    else items.push(T('在无痕窗口的地址栏输入 <code>teams.microsoft.com</code>，回车；输入机构发给您的账号（形如 <code>name@yourdomain</code>）→ 下一步（Next）→ 输入密码 → 登录（Sign in）。<strong>密码请复制粘贴</strong>，不要手动敲。',
      'In the private window\'s address bar type <code>teams.microsoft.com</code> and press Enter; enter the account your school issued (like <code>name@yourdomain</code>) → Next → password → Sign in. <strong>Paste the password</strong> rather than typing it.'));
    if (!back) items.push(pwItem());
    items.push(threeNext(T("", "you"), T("您自己的 iPhone / iPad", "your own iPhone or iPad"), T("回到" + dev, "back on " + dev)));
    items.push(T(dev + '上出现 <strong>「扫描 QR 码（Scan the QR code）」</strong>。在您的 iPhone / iPad 的验证器里选 <strong>「扫描 QR 码（Scan QR code）」</strong>（不要选「登录（Sign in）」）→ 对准' + dev + '屏幕扫一下。验证器里出现您的账号后，点' + dev + '上的 <strong>下一步（Next）</strong>。',
      '<strong>Scan the QR code</strong> appears on ' + dev + '. In the authenticator on your iPhone or iPad choose <strong>Scan QR code</strong> (not Sign in) → point the camera at ' + dev + '. Once your account shows up in the authenticator, select <strong>Next</strong> on ' + dev + '.') +
      qrShot(T('用 iPhone / iPad 的验证器扫这个码', 'Scan this with the authenticator on your iPhone or iPad')) + wrongTurn());
    items.push(T(dev + '出现 <strong>「让我们试一试（Let\'s try it out）」</strong> 和一个<strong>两位数</strong>；iPhone / iPad 上验证器弹出「是否正在尝试登录？（Are you trying to sign in?）」（没弹出就打开验证器看）→ 输入那个数 → <strong>是（Yes）</strong>。' + dev + '显示「已添加 Authenticator（Authenticator Added）」→ <strong>完成（Done）</strong>。',
      '<strong>Let\'s try it out</strong> appears on ' + dev + ' with a <strong>two-digit number</strong>; the authenticator on your iPhone or iPad shows &ldquo;Are you trying to sign in?&rdquo; (or open the app and find it) → type the number → <strong>Yes</strong>. You will see &ldquo;Authenticator Added&rdquo; on ' + dev + ' → <strong>Done</strong>.') +
      tryShot(T('把这个数输进 iPhone / iPad 上弹出的框', 'Type this number into the prompt on your iPhone or iPad'), T('63,71.5,r|输进验证器', '63,71.5,r|type in the app')));
    items.push(T('<strong>最后在手机上登录 Teams</strong>：打开 iPhone / iPad 上的 Teams App → 输入账号和<strong>您自己设的</strong>密码 → 验证器弹出提示 → 输入屏幕上的两位数 → 进入 Teams。以后手机上的 Teams 会一直保持登录，<strong>不要点退出</strong>。',
      '<strong>Finally, sign in to Teams on the phone</strong>: open the Teams app on your iPhone or iPad → enter your account and <strong>the password you set</strong> → the authenticator prompts → type the two-digit number → you are in. Teams on the phone stays signed in from now on — <strong>do not sign out</strong>.'));
    document.getElementById("pcSteps").innerHTML = items.map(function (t) { return '<li><span class="txt">' + t + '</span></li>'; }).join("");
  }

  // ---- move-add (old device still here) ----
  function buildMoveAdd() {
    var onPad = state.second === "ipad";
    var dev = onPad ? T("那台设备", "that device") : T("电脑", "the computer");
    document.getElementById("moveAddDesc").innerHTML = T("在" + dev + "刚打开的无痕窗口里操作。两台设备都放在手边：<strong>老设备</strong>负责批准登录，<strong>新设备</strong>负责扫码。",
      "Work in the private window you just opened on " + dev + ". Keep both devices within reach: the <strong>old</strong> one approves the sign-in, the <strong>new</strong> one scans.");
    var items = [
      T('在无痕窗口的地址栏输入 <code>mysignins.microsoft.com/security-info</code>，回车；输入您的账号 → 下一步（Next）→ 输入<strong>您现在用的密码</strong> → 登录（Sign in）。',
        'In the private window\'s address bar type <code>mysignins.microsoft.com/security-info</code> and press Enter; enter your account → Next → <strong>the password you use now</strong> → Sign in.'),
      T('屏幕上出现一个<strong>两位数</strong>，<strong>老设备</strong>的验证器弹出「是否正在尝试登录？（Are you trying to sign in?）」（没弹出就打开老设备的验证器看）→ 输入那个数 → <strong>是（Yes）</strong>。随后进入<strong>「安全信息（Security info）」</strong>页。',
        'A <strong>two-digit number</strong> appears; the authenticator on the <strong>old</strong> device shows &ldquo;Are you trying to sign in?&rdquo; (or open it and find the request) → type the number → <strong>Yes</strong>. The <strong>Security info</strong> page opens.'),
      T('点 <strong>「+ 添加登录方法（Add sign-in method）」</strong>→ 选 <strong>Microsoft Authenticator</strong> → 一直点 <strong>下一步（Next）</strong>，直到出现<strong>二维码</strong>。',
        'Select <strong>+ Add sign-in method</strong> → <strong>Microsoft Authenticator</strong> → keep selecting <strong>Next</strong> until a <strong>QR code</strong> appears.'),
      T('拿起<strong>新设备</strong>，打开验证器 → 右上角 <strong>「+」</strong>→<strong>「工作或学校帐户（Work or school account）」</strong>→<strong>「扫描 QR 码（Scan QR code）」</strong>→ 对准' + dev + '屏幕扫一下。新设备的验证器里出现您的账号后，点' + dev + '上的 <strong>下一步（Next）</strong>。',
        'Pick up the <strong>new</strong> device and open its authenticator → <strong>+</strong> (top right) → <strong>Work or school account</strong> → <strong>Scan QR code</strong> → point the camera at ' + dev + '. Once your account shows up in the new device\'s authenticator, select <strong>Next</strong> on ' + dev + '.') +
        qrShot(T('用新设备的验证器扫这个码', 'Scan this with the new device\'s authenticator')),
      T(dev + '上又出现一个两位数，这次是<strong>新设备</strong>的验证器弹出提示 → 输入那个数 → <strong>是（Yes）</strong>→ 完成（Done）。安全信息列表里多了一条 Microsoft Authenticator，下面写着<strong>新设备的型号</strong>。',
        'Another two-digit number appears on ' + dev + '; this time the <strong>new</strong> device\'s authenticator asks → type the number → <strong>Yes</strong> → Done. The Security info list now has another Microsoft Authenticator entry, with <strong>the new device\'s model</strong> under it.')
    ];
    document.getElementById("moveAddSteps").innerHTML = items.map(function (t) { return '<li><span class="txt">' + t + '</span></li>'; }).join("");
  }

  // ---- android-verifier ----
  var mustRead = document.getElementById("mustRead");
  var confirmWrap = document.getElementById("confirmWrap");
  var confirmOwn = document.getElementById("confirmOwn");
  function buildVerifier() {
    pickGroup(document.getElementById("verifierPick"), [
      { id: "own",   name: T("我有一部 iPhone 或 iPad，用它做验证器", "I have an iPhone or iPad to use as the authenticator"), tag: T("自己的、家里常在的都可以，旧的也行", "your own or one that stays at home — an old one is fine") },
      { id: "admin", name: T("我没有，需要机构 / 学校的管理员帮忙扫码", "I have none — my institution's administrator will scan for me"), tag: T("只需在安卓手机上装 Teams；以后的验证提示会发到管理员那里", "only Teams on the Android phone; future prompts go to the administrator") }
    ], state.verifier, function (id) { if (id !== state.verifier) state.confirmed = false; state.verifier = id; confirmOwn.checked = !!state.confirmed; save(); renderProgress(); refresh(); });
    confirmOwn.checked = !!state.confirmed;
    confirmOwn.onchange = function () { state.confirmed = confirmOwn.checked; save(); refresh(); };
    mustRead.ontoggle = refresh;
    refresh();
    function refresh() {
      var nb = nextBtn("android-verifier");
      confirmWrap.hidden = state.verifier !== "own";
      var readOk = mustRead.open || mustRead.dataset.read === "1";
      if (mustRead.open) mustRead.dataset.read = "1";
      nb.disabled = !(state.verifier === "admin" || (state.verifier === "own" && confirmOwn.checked));
      if (!readOk && state.verifier) showHint(T("请先点开上面的说明读一下，再继续。", "Please open and read the note above first."));
    }
  }

  // ---- brand (Android) ----
  var BRANDS = [
    { id: "huawei",  name: T("华为 / 荣耀", "Huawei / Honor"), store: T("华为应用市场 / 荣耀应用市场", "AppGallery / Honor App Market") },
    { id: "xiaomi",  name: T("小米", "Xiaomi"),   store: T("小米应用商店", "the Xiaomi GetApps store") },
    { id: "oppo",    name: "OPPO",                store: T("OPPO 软件商店", "the OPPO App Market") },
    { id: "vivo",    name: "vivo",                store: T("vivo 应用商店", "the vivo App Store") },
    { id: "samsung", name: T("三星", "Samsung"),  store: T("三星应用商店", "the Samsung Galaxy Store") },
    { id: "other",   name: T("其他品牌 / 不确定", "Another brand / not sure"), store: T("手机自带的应用商店", "the app store already on your phone") }
  ];
  function buildBrand() {
    var grid = document.getElementById("brandPick"), box = document.getElementById("brandContent");
    grid.innerHTML = "";
    BRANDS.forEach(function (b) {
      var btn = document.createElement("button");
      btn.type = "button"; btn.className = "choice"; btn.setAttribute("aria-pressed", b.id === state.brand ? "true" : "false");
      btn.innerHTML = '<span class="name">' + b.name + '</span><span class="tag">' + T("安卓", "Android") + '</span>';
      btn.addEventListener("click", function () {
        Array.prototype.forEach.call(grid.children, function (c) { c.setAttribute("aria-pressed", "false"); });
        btn.setAttribute("aria-pressed", "true");
        state.brand = b.id; save(); render();
      });
      grid.appendChild(btn);
    });
    render();
    function render() {
      var nb = nextBtn("brand"); nb.disabled = !state.brand;
      if (!state.brand) { box.innerHTML = ""; return; }
      var b = BRANDS.filter(function (x) { return x.id === state.brand; })[0];
      box.innerHTML =
        '<div class="app-block"><h3>Microsoft Teams <span class="pill must">' + T("必装", "required") + '</span></h3>' +
        '<p>' + T("打开<strong>" + b.store + "</strong> → 搜索 <code>Teams</code> → 安装。开发者是<strong>微软（中国）有限公司</strong>。", "Open <strong>" + b.store + "</strong> → search <code>Teams</code> → install. The developer is shown as <strong>微软（中国）有限公司</strong>.") + '</p>' +
        '<p class="identify">' + T("怎么认：叫 <strong>Microsoft Teams</strong>，紫色的 T 字图标。<strong>不要装 Authenticator</strong>——在这部手机上它绑不了账号。", "How to recognize it: <strong>Microsoft Teams</strong>, the purple T icon. <strong>Do not install Authenticator</strong> — it cannot link an account on this phone.") + '</p>' +
        '<p class="identify">' + T("电脑上也要用 Teams 的：直接从<a href=\"https://www.microsoft.com/zh-cn/microsoft-teams/download-app\" target=\"_blank\" rel=\"noopener noreferrer\">微软官网 › 下载 Teams</a>（中文页面）下载「Microsoft Teams for Windows」或「for Mac」安装包。", "If you also use Teams on a computer, download the &ldquo;Microsoft Teams for Windows&rdquo; or &ldquo;for Mac&rdquo; installer straight from <a href=\"https://www.microsoft.com/en-us/microsoft-teams/download-app\" target=\"_blank\" rel=\"noopener noreferrer\">microsoft.com › Download Teams</a>.") + '</p></div>' +
        '<div class="note plain">' + T("<strong>不要在搜索引擎上随便下载安装包</strong>——装到被改过的版本会很危险。只从应用商店装。", "<strong>Do not download an installer from a search engine.</strong> A tampered build is dangerous. Install from the app store only.") + '</div>' +
        '<div class="note good">' + T("<strong>装好就行，先别登录。</strong>登录在下一步，需要" + (state.verifier === "admin" ? "管理员在您身边（或视频通话）" : "您的 iPhone / iPad 在手边") + "。",
          "<strong>Install it, and do not sign in yet.</strong> Signing in is the next step and needs " + (state.verifier === "admin" ? "the administrator beside you (or on a video call)" : "your iPhone or iPad within reach") + ".") + '</div>';
    }
  }

  // ---- signin-android (own iPhone/iPad) ----
  function buildSigninAndroid() {
    var items = [], back = state.who === "back";
    if (back) items.push(backSignin('在安卓手机上打开 <strong>Teams App</strong>，', 'On the Android phone open the <strong>Teams app</strong>, '));
    else items.push(T('在安卓手机上打开 <strong>Teams App</strong>，输入机构发给您的账号 → 下一步（Next）→ 密码 → 登录（Sign in）（建议长按粘贴，不要手打）。',
      'On the Android phone open the <strong>Teams app</strong>, enter the account your school issued → Next → password → Sign in (long-press to paste rather than typing).'));
    if (!back) items.push(pwItem());
    items.push(threeNext(T("", "you"), T("iPhone / iPad", "the iPhone or iPad"), T("回到安卓手机", "back on the Android phone")));
    items.push(T('安卓手机屏幕上出现<strong>一个二维码</strong>「扫描 QR 码（Scan the QR code）」。在 iPhone / iPad 的验证器里选 <strong>「扫描 QR 码（Scan QR code）」</strong>（不要选「登录（Sign in）」）→ <strong>对准安卓手机的屏幕</strong>扫。验证器里出现您的账号后，点安卓手机上的 <strong>下一步（Next）</strong>。',
      '<strong>A QR code</strong> appears on the Android phone — &ldquo;Scan the QR code&rdquo;. In the authenticator on the iPhone or iPad choose <strong>Scan QR code</strong> (not Sign in) → <strong>point it at the Android screen</strong>. Once your account shows up in the authenticator, select <strong>Next</strong> on the Android phone.') + wrongTurn());
    items.push(T('安卓手机出现 <strong>「让我们试一试（Let\'s try it out）」</strong> 和一个<strong>两位数</strong>；iPhone / iPad 上验证器弹出「是否正在尝试登录？（Are you trying to sign in?）」（没弹出就打开验证器看）→ 输入那个数 → <strong>是（Yes）</strong>。安卓手机显示「已添加 Authenticator（Authenticator Added）」→ <strong>完成（Done）</strong>，登录完成。',
      '<strong>Let\'s try it out</strong> appears on the Android phone with a <strong>two-digit number</strong>; the authenticator on the iPhone or iPad shows &ldquo;Are you trying to sign in?&rdquo; (or open the app and find it) → type the number → <strong>Yes</strong>. The Android phone says &ldquo;Authenticator Added&rdquo; → <strong>Done</strong>, and you are signed in.') +
      tryShot(T('把这个数输进 iPhone / iPad 上弹出的框', 'Type this number into the prompt on the iPhone or iPad'), T('63,71.5,r|输进验证器', '63,71.5,r|type in the app')));
    items.push(T('<strong>以后：</strong>安卓手机上的 Teams 一直保持登录，<strong>不要点退出</strong>。哪天再要求验证（换手机、退出、改密码），提示会发到<strong>这部 iPhone / iPad</strong> 上——请把它保管好、放在身边。',
      '<strong>From now on:</strong> Teams on the Android phone stays signed in — <strong>do not sign out</strong>. If verification is asked for again (a new phone, a sign-out, a password change), the prompt goes to <strong>this iPhone or iPad</strong> — keep it safe and close by.'));
    document.getElementById("androidSteps").innerHTML = items.map(function (t) { return '<li><span class="txt">' + t + '</span></li>'; }).join("");
  }

  // ---- signin-admin ----
  function buildSigninAdmin() {
    var A = T("管理员", "the administrator");
    var items = [], back = state.who === "back";
    items.push(T('<strong>约好时间，把两样东西准备好：</strong>您的安卓手机（装好 Teams），以及一台能视频通话的设备（如果管理员不在身边）。管理员那边要有装了微软身份验证器的手机。',
      '<strong>Agree on a time and have two things ready:</strong> your Android phone with Teams installed, and a device for a video call if the administrator is not beside you. The administrator needs Microsoft Authenticator on their phone.'));
    if (back) items.push(backSignin('在安卓手机上打开 <strong>Teams App</strong>，', 'On the Android phone open the <strong>Teams app</strong>, '));
    else items.push(T('在安卓手机上打开 <strong>Teams App</strong>，输入机构发给您的账号 → 下一步（Next）→ 密码 → 登录（Sign in）。',
      'On the Android phone open the <strong>Teams app</strong>, enter the account your school issued → Next → password → Sign in.'));
    if (!back) items.push(pwItem());
    items.push(threeNext(A, T("他自己的手机", "their own phone"), T("您在安卓手机上", "you, on the Android phone,")));
    items.push(T('安卓手机屏幕上出现<strong>一个二维码</strong>。<strong>把屏幕对准管理员手机的摄像头</strong>（视频通话时对准摄像头让他扫）——管理员在他的验证器里选 <strong>「扫描 QR 码（Scan QR code）」</strong>（不要选「登录（Sign in）」），扫您屏幕上的码。他的验证器里出现您的账号后，您点手机上的 <strong>下一步（Next）</strong>。二维码几分钟后会过期，过期了点「下一步」换新的；截图是扫不了的。',
      '<strong>A QR code</strong> appears on your Android screen. <strong>Hold the screen up to the camera of the administrator\'s phone</strong> (on a video call, hold it up to your camera so they can scan it) — they choose <strong>Scan QR code</strong> (not Sign in) in their authenticator and scan your screen. Once your account shows up in their app, select <strong>Next</strong> on your phone. The code expires after a few minutes — select Next for a fresh one; a screenshot cannot be scanned.') + wrongTurn());
    items.push(T('安卓手机出现 <strong>「让我们试一试（Let\'s try it out）」</strong> 和一个<strong>两位数</strong>。<strong>把这个数告诉管理员</strong>；他的验证器弹出「是否正在尝试登录？」→ 他输入这个数 → <strong>是（Yes）</strong>。您的手机显示「已添加 Authenticator」→ <strong>完成（Done）</strong>，登录完成。',
      '<strong>Let\'s try it out</strong> appears on your phone with a <strong>two-digit number</strong>. <strong>Tell the administrator the number</strong>; their authenticator shows &ldquo;Are you trying to sign in?&rdquo; → they type it → <strong>Yes</strong>. Your phone says &ldquo;Authenticator Added&rdquo; → <strong>Done</strong>, and you are signed in.') +
      tryShot(T('把这个数告诉管理员', 'Tell the administrator this number'), T('63,71.5,r|告诉管理员', '63,71.5,r|tell the admin')));
    items.push(T('<strong>以后：</strong>Teams 一直保持登录，<strong>不要点退出</strong>。哪天再要求验证，提示会发到<strong>管理员</strong>那里——在 Teams 里给他发消息，把屏幕上的两位数告诉他，他确认一下即可。',
      '<strong>From now on:</strong> Teams stays signed in — <strong>do not sign out</strong>. If verification is asked for again, the prompt goes to <strong>the administrator</strong> — message them in Teams with the two-digit number on your screen and they confirm it.'));
    document.getElementById("adminSteps").innerHTML = items.map(function (t) { return '<li><span class="txt">' + t + '</span></li>'; }).join("");
  }

  // ---- done ----
  function buildDone() {
    var el = document.getElementById("checklist"), note = document.getElementById("doneNote");
    var admin = state.verifier === "admin", android = state.dev === "android";
    var checks = [
      android ? T("安卓手机上的 Teams 能正常打开，已登录", "Teams opens normally on the Android phone and is signed in")
              : T("iPhone / iPad 上的 Teams 能正常打开，已登录", "Teams opens normally on the iPhone or iPad and is signed in"),
      admin ? T("管理员的验证器里能看到我的账号", "My account is listed in the administrator's authenticator")
            : T("我的 iPhone / iPad 的验证器里能看到我的账号", "My account is listed in the authenticator on my iPhone or iPad"),
      state.who === "back" ? T("我记得自己现在用的登录密码", "I know the password I sign in with")
                           : T("我记下了自己设的密码", "I have written down the password I set"),
      admin ? T("我知道不要点退出登录；再要求验证时在 Teams 里找管理员要确认", "I know not to sign out, and to ask the administrator in Teams when verification is asked for")
            : T("我知道不要点退出登录；以后的验证码都发到我的 iPhone / iPad 上", "I know not to sign out, and that future verification codes go to my iPhone or iPad")
    ];
    if (state.who === "back" && isMove()) checks.splice(2, 0, T("「安全信息」页上只剩新设备；老设备的验证器里也删掉了学校账号", "Only the new device is left on the Security info page, and the school account is removed from the old device's authenticator"));
    el.innerHTML = checks.map(function (c, i) { return '<label><input type="checkbox" id="chk' + i + '" data-chk> <span>' + c + '</span></label>'; }).join("");
    note.hidden = true; document.getElementById("dailyTip").hidden = true;
    var notify = android
      ? T('<br><br>另外请知道：<strong>安卓手机上的 Teams 关着时通常不会弹出消息提醒</strong>，打开 Teams 才看到新消息。<a href="/help/teams-faq.html#q-android-notify" target="_blank" rel="noopener">为什么？怎么尽量不错过？</a>',
          '<br><br>Also good to know: <strong>Teams on an Android phone usually does not pop up messages while it is closed</strong> — new messages show when you open it. <a href="/help/teams-faq.html#q-android-notify" target="_blank" rel="noopener">Why, and how can I avoid missing messages?</a>')
      : "";
    note.innerHTML = admin
      ? T("<strong>设置完成，恭喜！</strong>以后打开 Teams 直接就是登录状态。哪天又要求验证——换了手机、退出后重新登录、改了密码——输入账号密码后，把屏幕上的两位数发给管理员，他在验证器里确认一下就行。", "<strong>Setup complete — well done!</strong> From now on Teams simply opens signed in. If verification is ever asked for again — a new phone, signing back in, a password change — enter your account and password, send the administrator the two-digit number, and they confirm it.")
      : T("<strong>设置完成，恭喜！</strong>以后登录 Teams：输入账号和<strong>您自己设的</strong>密码，要验证时看 iPhone / iPad——验证器弹出「是否正在尝试登录？」就输入屏幕上的两位数。绑定是一次性的，以后<strong>不需要再扫码</strong>。", "<strong>Setup complete — well done!</strong> From now on: enter your account and <strong>the password you set</strong>, and when asked to verify look at your iPhone or iPad — the authenticator shows &ldquo;Are you trying to sign in?&rdquo; and you type the two-digit number. The linking was one-time — <strong>no more scanning</strong>.");
    note.innerHTML += notify;
    Array.prototype.forEach.call(el.querySelectorAll("input[data-chk]"), function (chk) {
      chk.addEventListener("change", function () {
        var all = Array.prototype.every.call(el.querySelectorAll("input[data-chk]"), function (c) { return c.checked; });
        note.hidden = !all; document.getElementById("dailyTip").hidden = !all;
      });
    });
  }
  document.getElementById("restart").addEventListener("click", function () {
    state = { who: null, dev: null, verifier: null, brand: null, second: null, screen: "who", checked: null, confirmed: false, oldDev: null, adminDone: false, cleanDone: false, oldOn: false };
    try { sessionStorage.removeItem("teamsSetupScreen"); } catch (e) {}
    save(); location.reload();
  });

  // ---- boot ----
  function boot() {
    state.screen = "who";
    try {
      // Opened from the site menu (帮助 → …?from=menu): always step 1, answers
      // kept (Rick, 2026-09-23). The marker is then dropped from the address,
      // so Back from 流程图 / 问答(Q&A) and the language reload still resume.
      if (/[?&]from=menu(&|$)/.test(location.search)) {
        sessionStorage.removeItem("teamsSetupScreen");
        sessionStorage.removeItem("teamsSetupLangScreen");
        history.replaceState(history.state, "", location.pathname + location.hash);
      }
      var hop = sessionStorage.getItem("teamsSetupLangScreen") || sessionStorage.getItem("teamsSetupScreen");
      sessionStorage.removeItem("teamsSetupLangScreen");
      // A saved step that is not reachable yet (a check left undone) resumes
      // at the step that still needs an answer, not at step 1.
      if (hop) { var gap = missingFor(hop); state.screen = gap ? gap.screen : hop; }
    } catch (e) {}
    document.getElementById("stateLabel").textContent = "";
    goTo(state.screen);
  }
  boot();
})();
