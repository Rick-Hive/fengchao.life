// management/src/23-calendar.js — 学校管理 › 校历: the school's calendar (edited by its 教育领袖), and the
// events the system administrator adds on top (蜂巢追加). Two layers, never overwriting each other.
// Part of management.js: scripts/build-management.js concatenates management/src/*.js in name order
// into management/management.js (one closure; every part sees every other's functions). Edit here, not the built file.

  // ================================================================================
  // 校历 (Rick, 2026-10-16: 「系统管理员和域 IT 管理员和学校领袖……把学校校历，比如教师培训等日历……
  // 同步到自己的域用户的 teams 和 outlook 日历」; 「系统管理员可以添加一些日历事件，比如追加培训，
  // 但是不能覆盖每个学校的校历」).
  //
  // Server: GET/POST /api/calendar (api/shared/calendar.js; writing into the Outlook / Teams default
  // calendars is api/shared/calendarSync.js — the 同步 card under the list drives it in batches).
  //   学校校历  the school's own events — the 教育领袖 adds, changes and deletes them; the IT
  //             管理员 and the system administrator only look.
  //   蜂巢追加  the system administrator's events, each aimed at chosen schools (or all); a school
  //             sees the ones aimed at it in its list, read-only.
  // ================================================================================
  var calSync = { only: "", busy: false, out: [], progress: null, picked: {} };
  var calState = { layer: "school", domain: "", data: null, hive: null, filter: "upcoming", view: "month", cursor: "", selected: "" };
  var CAL_AUDIENCE = ["老师", "行政", "学生", "家长"];
  var CAL_AUDIENCE_EN = { "老师": "Teachers", "行政": "Staff", "学生": "Students", "家长": "Parents" };
  var CAL_REMIND = [[null, "不提醒", "No reminder"], [0, "开始时", "At start"], [5, "提前 5 分钟", "5 minutes before"], [10, "提前 10 分钟", "10 minutes before"], [15, "提前 15 分钟", "15 minutes before"], [30, "提前 30 分钟", "30 minutes before"], [60, "提前 1 小时", "1 hour before"], [120, "提前 2 小时", "2 hours before"], [1440, "提前 1 天", "1 day before"], [2880, "提前 2 天", "2 days before"], [10080, "提前 1 周", "1 week before"]];
  var CAL_ZONES = [["America/New_York", "美东", "Eastern"], ["America/Chicago", "美中", "Central"], ["America/Denver", "美山地", "Mountain"], ["America/Phoenix", "亚利桑那", "Arizona"], ["America/Los_Angeles", "美西", "Pacific"], ["America/Anchorage", "阿拉斯加", "Alaska"], ["Pacific/Honolulu", "夏威夷", "Hawaii"], ["America/Toronto", "多伦多", "Toronto"], ["America/Vancouver", "温哥华", "Vancouver"], ["Europe/London", "伦敦", "London"], ["Asia/Shanghai", "北京 / 上海", "China"], ["Asia/Hong_Kong", "香港", "Hong Kong"], ["Asia/Taipei", "台北", "Taipei"], ["Asia/Singapore", "新加坡", "Singapore"], ["UTC", "UTC", "UTC"]];
  function calDomains() { return ((domainsInfo && domainsInfo.domains) || []).filter(function (d) { return d.can && d.can.calendar; }); }
  function canSeeCalendar() { return calDomains().length > 0 || isAdmin(); }
  function calBrowserZone() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York"; } catch (e) { return "America/New_York"; } }
  function calZoneLabel(z) { var k = CAL_ZONES.filter(function (x) { return x[0] === z; })[0]; return k && z !== "UTC" ? t(k[1], k[2]) + " · " + z : z; }
  function calZoneShort(z) { var k = CAL_ZONES.filter(function (x) { return x[0] === z; })[0]; return k ? t(k[1], k[2]) : z; }
  function calZoneOptions(sel) {
    var list = CAL_ZONES.map(function (x) { return x[0]; });
    if (sel && list.indexOf(sel) < 0) list.unshift(sel);
    return list.map(function (z) { return '<option value="' + esc(z) + '"' + (z === sel ? " selected" : "") + ">" + esc(calZoneLabel(z)) + "</option>"; }).join("");
  }
  function calRemindText(m) { var k = CAL_REMIND.filter(function (x) { return x[0] === m; })[0]; return k ? t(k[1], k[2]) : m == null ? "—" : String(m); }
  function calAudText(a) { return a && a.length ? a.map(function (x) { return EN ? CAL_AUDIENCE_EN[x] || x : x; }).join(EN ? ", " : "、") : t("所有人", "Everyone"); }
  function calToday() { var d = new Date(); return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
  function calWhen(e) {
    var s = e.start || "", n = e.end || e.start || "";
    if (e.allDay) return esc(s === n ? s : s + " → " + n) + ' <span class="faint">' + t("全天", "all day") + "</span>";
    var sd = s.slice(0, 10), nd = n.slice(0, 10);
    return esc(sd === nd ? sd + " " + s.slice(11) + "–" + n.slice(11) : s.replace("T", " ") + " → " + n.replace("T", " ")) + ' <span class="faint">' + esc(calZoneShort(e.timeZone)) + "</span>";
  }
  function calTargetsText(e) {
    var tg = e.targets || [];
    if (tg.indexOf("*") >= 0) return t("所有学校", "All schools");
    return tg.map(function (d) { return dname(d); }).join(EN ? ", " : "、") || "—";
  }

  function viewCalendar() {
    var ds = calDomains();
    if (!calState.cursor) { calState.cursor = calToday(); calState.selected = calToday(); }
    if (!ds.length && !isAdmin()) { location.hash = "#/account"; return; }
    if (calState.layer === "hive" && !isAdmin()) calState.layer = "school";
    if (calState.layer === "school" && !ds.length) calState.layer = "hive";
    if (!calState.domain || !ds.some(function (d) { return d.domain === calState.domain; })) calState.domain = (ds.filter(function (d) { return d.domain === currentDomain; })[0] || ds.filter(function (d) { return d.domain === domainsInfo.mine; })[0] || ds[0] || {}).domain || "";
    setTitle(domainGroupTitle(), t("校历", "School calendar"), '<button class="btn sm" id="calAdd" hidden>' + t("＋ 添加事件", "+ Add event") + "</button>",
      { info: t("学校的日历：培训、家长会、放假等。「学校校历」由本校教育领袖、教育社区经理和课程总监编辑；系统管理员可以另外添加「蜂巢追加」的事件（如联合培训），推送给选定的学校，但不能改动学校自己的校历。学校的列表里会同时显示发给本校的蜂巢事件（只读）。列表下方的「同步到大家的日历」把事件写进本校账号的 Outlook / Teams 日历（不发邀请邮件）。", "A school's calendar: training days, parent meetings, holidays. The school calendar is edited by the school's education leader, education community manager or curriculum director; the system administrator can add Hive events (such as a joint training) aimed at chosen schools, but never changes a school's own calendar. A school's list also shows the Hive events aimed at it (read-only). The “Write to everyone's calendar” card below the list writes the events into the school accounts' Outlook / Teams calendars (no invitation mail).") });
    $("content").innerHTML =
      '<div class="pagetabs" role="tablist" id="caltabs">' + (ds.length ? '<a class="ptab' + (calState.layer === "school" ? " on" : "") + '" href="#/domain/calendar" data-layer="school" role="tab">' + t("学校校历", "School calendar") + "</a>" : "") +
        (isAdmin() ? '<a class="ptab' + (calState.layer === "hive" ? " on" : "") + '" href="#/domain/calendar" data-layer="hive" role="tab">' + t("蜂巢追加", "Hive additions") + "</a>" : "") +
        '<div class="tabsRight" id="calright"></div></div><div id="calmsg"></div><div id="calbody"><div class="loading">' + t("载入中…", "Loading…") + "</div></div>";
    $("caltabs").addEventListener("click", function (e) { var a = e.target.closest("a[data-layer]"); if (!a) return; e.preventDefault(); calState.layer = a.getAttribute("data-layer"); viewCalendar(); });
    $("calAdd").addEventListener("click", function () { calOpenEvent(null, undefined, calState.view !== "list" ? calState.selected : undefined); });
    $("calbody").addEventListener("click", function (e) {
      var chip = e.target.closest(".chip[data-filter]"); if (chip) { calState.filter = chip.getAttribute("data-filter"); calRender(); return; }
      var vb = e.target.closest("[data-view]"); if (vb) { calState.view = vb.getAttribute("data-view"); if (calState.view !== "list") calGoTo(calState.selected || calToday()); calRender(); return; }
      var nb = e.target.closest("[data-nav]");
      if (nb) {
        var nav = nb.getAttribute("data-nav"), c = calState.cursor;
        calGoTo(nav === "today" ? calToday() : calState.view === "month" ? calShiftMonth(c, nav === "next" ? 1 : -1) : calAdd(c, nav === "next" ? 7 : -7));
        calRender(); return;
      }
      var tr = e.target.closest("[data-ev]"); if (tr) { calOpenEvent(tr.getAttribute("data-ev"), tr.getAttribute("data-src")); return; }
      var more = e.target.closest("[data-more]"); if (more) { calState.view = "week"; calState.cursor = more.getAttribute("data-more"); calState.selected = calState.cursor; calRender(); return; }
      if (e.target.closest("#calAddDay")) { calOpenEvent(null, undefined, calState.selected); return; }
      var nc = e.target.closest("[data-newday]");
      if (nc) {
        calState.selected = nc.getAttribute("data-newday");
        if (!calCanEdit()) return;
        var isCol = nc.classList.contains("calcol");
        calOpenEvent(null, undefined, calState.selected, isCol ? Math.max(0, Math.min(23, Math.floor((e.clientY - nc.getBoundingClientRect().top) / CAL_HOUR))) : undefined); return;
      }
      var dc = e.target.closest("[data-day]"); if (dc) { calState.selected = dc.getAttribute("data-day"); calRender(); }
    });
    $("calbody").addEventListener("change", function (e) {
      if (e.target.id !== "calyear" && e.target.id !== "calmon") return;
      calGoTo($("calyear").value + "-" + calPad(+$("calmon").value) + "-01"); calRender();
    });
    $("calbody").addEventListener("keydown", function (e) { if ((e.key === "Enter" || e.key === " ") && e.target.classList && e.target.classList.contains("calagrow")) { e.preventDefault(); calOpenEvent(e.target.getAttribute("data-ev"), e.target.getAttribute("data-src")); } });
    calLoad();
  }
  function calMsg(text, bad) { if ($("calmsg")) $("calmsg").innerHTML = text ? '<div class="msg ' + (bad ? "err" : "ok") + '">' + esc(text) + "</div>" : ""; }
  function calLoad() {
    var hive = calState.layer === "hive";
    calSync = { only: "", busy: false, out: [], progress: null, picked: calSync.picked || {} };
    $("calbody").innerHTML = '<div class="loading">' + t("载入中…", "Loading…") + "</div>";
    return api(hive ? "calendar?layer=hive" : "calendar?domain=" + encodeURIComponent(calState.domain)).then(function (r) {
      if (!r.ok) { $("calbody").innerHTML = '<div class="msg err">' + esc(errText(r)) + "</div>"; return; }
      if (hive) calState.hive = r.body; else calState.data = r.body;
      calRender();
    });
  }
  function calCanEdit() { var d = calState.layer === "hive" ? calState.hive : calState.data; return !!(d && d.canEdit); }
  function calRows() {
    var rows = [];
    if (calState.layer === "hive") { ((calState.hive && calState.hive.hive && calState.hive.hive.events) || []).forEach(function (e) { rows.push({ e: e, src: "hive" }); }); }
    else if (calState.data) {
      ((calState.data.calendar && calState.data.calendar.events) || []).forEach(function (e) { rows.push({ e: e, src: "school" }); });
      ((calState.data.hive && calState.data.hive.events) || []).forEach(function (e) { rows.push({ e: e, src: "hive" }); });
    }
    return rows.sort(function (a, b) { return (a.e.start || "").localeCompare(b.e.start || "") || (a.e.title || "").localeCompare(b.e.title || ""); });
  }
  function calRender() {
    if (!$("calbody")) return;
    var hive = calState.layer === "hive", d = hive ? calState.hive : calState.data, ds = calDomains();
    if (!d) return;
    var edit = calCanEdit();
    $("calAdd").hidden = !edit;
    // right side of the tabs row: the school picker (school layer) and the school's default time zone
    var right = "";
    if (!hive) right = (ds.length > 1 ? '<select id="calsel">' + ds.map(function (x) { return '<option value="' + esc(x.domain) + '"' + (x.domain === calState.domain ? " selected" : "") + ">" + esc(dname(x.domain)) + "</option>"; }).join("") + "</select>" : '<span class="tag accent">' + esc(dname(calState.domain)) + "</span>") +
      (edit ? '<label class="muted" style="font-size:12px;white-space:nowrap">' + t("默认时区", "Default time zone") + ' <select id="calzone" class="sm" style="width:auto;max-width:210px">' + calZoneOptions((d.calendar && d.calendar.timezone) || calBrowserZone()) + "</select></label>" : "");
    $("calright").innerHTML = right;
    var sel = $("calsel"); if (sel) sel.addEventListener("change", function () { calState.domain = this.value; currentDomain = this.value; calLoad(); });
    var zs = $("calzone"); if (zs) zs.addEventListener("change", function () { post("calendar", "POST", { domain: calState.domain, op: "zone", timezone: zs.value }).then(function (r) { if (!r.ok) { calMsg(errText(r), true); return; } calState.data.calendar = r.body.calendar; flashOk(t("默认时区已保存。", "Default time zone saved.")); }); });
    var all = calRows();
    var note = '<p class="sub" style="margin:8px 0 8px">' + (hive
      ? t("系统管理员追加的事件：每个事件选择发给哪些学校。学校自己的校历不会被这里改动。保存后，用下方的「同步到大家的日历」推送给选定的学校。", "Events the system administrator adds, each aimed at chosen schools. A school's own calendar is never changed from here. After saving, use the card below to push them to the chosen schools.")
      : edit ? t("点一个事件修改，或用右上角「＋ 添加事件」。「蜂巢」标记的事件是系统管理员发给本校的，只读。保存后用下方的「同步到大家的日历」写入大家的日历。", "Click an event to change it, or use “+ Add event”. Events tagged Hive were sent to this school by the system administrator and are read-only. After saving, use the card below to write them into everyone's calendar.")
        : t("你可以查看本校校历；编辑和发布由本校教育领袖、教育社区经理和课程总监负责。", "You can look at the school's calendar; editing and publishing are for the school's education leader, education community manager and curriculum director.")) + "</p>";
    var main = calState.view === "month" ? calMonthHTML(all, edit) : calState.view === "week" ? calWeekHTML(all, edit) : calListHTML(all, hive, edit);
    $("calbody").innerHTML = calBarHTML(all) + note + main + (edit ? '<div id="calsync"></div>' : "");
    if (calState.view === "week" && $("calwk")) {
      // open the week at its first timed event (an hour earlier), or at 8:00 when it has none
      var firstMin = Infinity; $("calwk").querySelectorAll(".calblk").forEach(function (b) { firstMin = Math.min(firstMin, parseFloat(b.style.top) / CAL_HOUR * 60); });
      $("calwk").scrollTop = Math.max(0, (isFinite(firstMin) ? Math.floor(firstMin / 60) - 1 : 8) * CAL_HOUR);
    }
    if (edit) calSyncRender();
  }

  // ---- 月 / 周 / 列表 views ---------------------------------------------------------------------------
  // Month and week grids over the same rows as the list. Times are shown as the wall-clock of each event's
  // own time zone (the same as the list); a multi-day event is drawn on every day it covers.
  var CAL_WEEK0 = 0; // weeks start on Sunday (the schools are in North America; Outlook and Teams do the same there)
  var CAL_HOUR = 44; // px per hour in the week grid
  var CAL_MON_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var CAL_DOW = [["日", "Sun"], ["一", "Mon"], ["二", "Tue"], ["三", "Wed"], ["四", "Thu"], ["五", "Fri"], ["六", "Sat"]];
  function calPad(n) { return (n < 10 ? "0" : "") + n; }
  function calParse(ds) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ds || ""); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : NaN; }
  function calFmt(ms) { var d = new Date(ms); return d.getUTCFullYear() + "-" + calPad(d.getUTCMonth() + 1) + "-" + calPad(d.getUTCDate()); }
  function calAdd(ds, n) { return calFmt(calParse(ds) + n * 86400000); }
  function calDow(ds) { return new Date(calParse(ds)).getUTCDay(); }
  function calWeekStart(ds) { return calAdd(ds, -((calDow(ds) - CAL_WEEK0 + 7) % 7)); }
  function calMonthStart(ds) { return ds.slice(0, 8) + "01"; }
  function calShiftMonth(ds, n) { var y = +ds.slice(0, 4), m = +ds.slice(5, 7) - 1 + n; return calFmt(Date.UTC(y + Math.floor(m / 12), ((m % 12) + 12) % 12, 1)); }
  function calDaysIn(ds) { return new Date(Date.UTC(+ds.slice(0, 4), +ds.slice(5, 7), 0)).getUTCDate(); }
  function calMin(hhmm) { return (+hhmm.slice(0, 2)) * 60 + (+hhmm.slice(3, 5)); }
  // The days an event covers; a timed event that ends at midnight does not touch the next day.
  function calSpan(e) {
    var sd = (e.start || "").slice(0, 10), ed = (e.end || e.start || "").slice(0, 10);
    if (!e.allDay && ed > sd && (e.end || "").slice(11, 16) === "00:00") ed = calAdd(ed, -1);
    return [sd, ed < sd ? sd : ed];
  }
  function calOn(rows, ds) {
    return rows.filter(function (x) { var s = calSpan(x.e); return s[0] <= ds && ds <= s[1]; }).sort(function (a, b) {
      var ka = a.e.allDay || calSpan(a.e)[0] < ds ? "" : (a.e.start || "").slice(11, 16), kb = b.e.allDay || calSpan(b.e)[0] < ds ? "" : (b.e.start || "").slice(11, 16);
      return ka.localeCompare(kb) || (a.e.title || "").localeCompare(b.e.title || "");
    });
  }
  function calTitleOf() {
    var c = calState.cursor, y = c.slice(0, 4), m = +c.slice(5, 7);
    if (calState.view === "month") return t(y + "年" + m + "月", CAL_MON_EN[m - 1] + " " + y);
    var a = calWeekStart(c), b = calAdd(a, 6), am = +a.slice(5, 7), bm = +b.slice(5, 7);
    return t(a.slice(0, 4) + "年" + am + "月" + (+a.slice(8)) + "日 – " + (a.slice(0, 4) !== b.slice(0, 4) ? b.slice(0, 4) + "年" : "") + bm + "月" + (+b.slice(8)) + "日",
      CAL_MON_EN[am - 1] + " " + (+a.slice(8)) + (a.slice(0, 4) !== b.slice(0, 4) ? ", " + a.slice(0, 4) : "") + " – " + CAL_MON_EN[bm - 1] + " " + (+b.slice(8)) + ", " + b.slice(0, 4));
  }
  function calDayLong(ds) { var m = +ds.slice(5, 7), d = +ds.slice(8), w = CAL_DOW[calDow(ds)]; return t(ds.slice(0, 4) + "年" + m + "月" + d + "日 星期" + w[0], w[1] + ", " + CAL_MON_EN[m - 1] + " " + d + ", " + ds.slice(0, 4)); }
  // Move the window; keep the selected day inside it.
  function calGoTo(cursor) {
    var today = calToday(), c = cursor;
    calState.cursor = c;
    if (calState.view === "month") calState.selected = calMonthStart(today) === calMonthStart(c) ? today : calMonthStart(c);
    else { var a = calWeekStart(c); calState.selected = calWeekStart(today) === a ? today : a; }
  }
  function calYearsFor(all) {
    var set = {}, ty = +calToday().slice(0, 4);
    for (var y = ty - 3; y <= ty + 5; y++) set[y] = 1;
    set[+calState.cursor.slice(0, 4)] = 1;
    all.forEach(function (x) { var s = calSpan(x.e); set[+s[0].slice(0, 4)] = 1; set[+s[1].slice(0, 4)] = 1; });
    return Object.keys(set).map(Number).filter(function (y) { return y > 1999 && y < 2100; }).sort();
  }
  function calBarHTML(all) {
    var v = calState.view, h = '<div class="calbar">';
    if (v !== "list") {
      var y = +calState.cursor.slice(0, 4), m = +calState.cursor.slice(5, 7);
      h += '<div class="calnav"><button type="button" class="btn secondary sm" data-nav="today">' + t("今天", "Today") + '</button><button type="button" class="calarrow" data-nav="prev" aria-label="' + t("上一个", "Previous") + '">‹</button><button type="button" class="calarrow" data-nav="next" aria-label="' + t("下一个", "Next") + '">›</button></div>' +
        '<h3 class="caltitle" aria-live="polite">' + esc(calTitleOf()) + "</h3>" +
        '<select id="calyear" class="sm" aria-label="' + t("年份", "Year") + '">' + calYearsFor(all).map(function (yy) { return '<option value="' + yy + '"' + (yy === y ? " selected" : "") + ">" + yy + t(" 年", "") + "</option>"; }).join("") + "</select>" +
        '<select id="calmon" class="sm" aria-label="' + t("月份", "Month") + '">' + CAL_MON_EN.map(function (mm, i) { return '<option value="' + (i + 1) + '"' + (i + 1 === m ? " selected" : "") + ">" + (EN ? mm : (i + 1) + " 月") + "</option>"; }).join("") + "</select>";
    }
    h += '<span class="calgap"></span><div class="calseg" id="calview" role="group" aria-label="' + t("视图", "View") + '">' + [["month", "月", "Month"], ["week", "周", "Week"], ["list", "列表", "List"]].map(function (k) { return '<button type="button" data-view="' + k[0] + '" aria-pressed="' + (v === k[0]) + '">' + t(k[1], k[2]) + "</button>"; }).join("") + "</div></div>";
    return h;
  }
  function calChip(x, ds) {
    var e = x.e, time = !e.allDay && calSpan(e)[0] === ds ? '<span class="tm">' + esc((e.start || "").slice(11, 16)) + "</span>" : "";
    return '<button type="button" class="calev ' + x.src + '" data-ev="' + esc(e.id) + '" data-src="' + x.src + '" title="' + esc(e.title) + '">' + time + '<span class="tt">' + esc(e.title) + "</span></button>";
  }
  function calMonthHTML(all, edit) {
    var first = calMonthStart(calState.cursor), start = calWeekStart(first), n = Math.ceil(((calDow(first) - CAL_WEEK0 + 7) % 7 + calDaysIn(first)) / 7) * 7, today = calToday(), mk = first.slice(0, 7);
    var h = '<div class="calmonth"><div class="caldows">';
    for (var i = 0; i < 7; i++) { var w = CAL_DOW[(i + CAL_WEEK0) % 7]; h += "<div>" + t("周" + w[0], w[1]) + "</div>"; }
    h += '</div><div class="calweeks">';
    for (var k = 0; k < n; k++) {
      var ds = calAdd(start, k), ev = calOn(all, ds), cls = "calcell" + (ds.slice(0, 7) !== mk ? " out" : "") + (ds === today ? " today" : "") + (ds === calState.selected ? " sel" : "");
      h += '<div class="' + cls + '" data-day="' + ds + '" role="gridcell" aria-label="' + esc(calDayLong(ds)) + '"><span class="calnum">' + (+ds.slice(8)) + "</span>" + ev.slice(0, 3).map(function (x) { return calChip(x, ds); }).join("") +
        (ev.length > 3 ? '<button type="button" class="calmore" data-more="' + ds + '">' + t("还有 ", "+") + (ev.length - 3) + t(" 个", " more") + "</button>" : "") + "</div>";
    }
    h += "</div></div>";
    // the selected day, in full — this is also what a phone shows, where the cells only have dots
    var sel = calState.selected, list = calOn(all, sel);
    h += '<div class="calagenda"><div class="calagh"><b>' + esc(calDayLong(sel)) + "</b>" + (edit ? '<button type="button" class="btn secondary sm" id="calAddDay">' + t("＋ 添加事件", "+ Add event") + "</button>" : "") + "</div>" +
      (list.length ? list.map(function (x) {
        var e = x.e;
        return '<div class="calagrow" data-ev="' + esc(e.id) + '" data-src="' + x.src + '" tabindex="0"><span class="calagbar ' + x.src + '"></span><div class="calagtime">' + calWhenShort(e, sel) + '</div><div class="calagmain"><b>' + esc(e.title) + "</b>" + (e.location ? '<div class="faint">' + esc(e.location) + "</div>" : "") + '</div><span class="tag ' + (x.src === "hive" ? "accent" : "ok") + '">' + (x.src === "hive" ? t("蜂巢", "Hive") : t("校历", "School")) + "</span></div>";
      }).join("") : '<p class="muted calempty">' + t("这天没有事件。", "No events this day.") + "</p>") + "</div>";
    return h;
  }
  function calWhenShort(e, ds) {
    if (e.allDay) return t("全天", "All day");
    var sd = e.start.slice(0, 10), nd = e.end.slice(0, 10);
    return esc((sd === ds ? e.start.slice(11, 16) : "00:00") + "–" + (nd === ds ? e.end.slice(11, 16) : "24:00")) + '<div class="faint">' + esc(calZoneShort(e.timeZone)) + "</div>";
  }
  // Place the timed segments of one day side by side where they overlap.
  function calLayout(segs) {
    segs.sort(function (a, b) { return a.s - b.s || b.e - a.e; });
    var cluster = [], ends = [], endMax = -1;
    function flush() { var cols = ends.length; cluster.forEach(function (g) { g.cols = cols; }); cluster = []; ends = []; }
    segs.forEach(function (g) {
      if (cluster.length && g.s >= endMax) { flush(); endMax = -1; }
      var c = 0; while (c < ends.length && ends[c] > g.s) c++;
      ends[c] = g.e; g.col = c; cluster.push(g); endMax = Math.max(endMax, g.e);
    });
    flush();
    return segs;
  }
  function calWeekHTML(all, edit) {
    var start = calWeekStart(calState.cursor), today = calToday(), days = [], i;
    for (i = 0; i < 7; i++) days.push(calAdd(start, i));
    var h = '<div class="calweekwrap"><div class="calweek"><div class="calwkhead"><div class="calgutter"></div>';
    days.forEach(function (ds) { var w = CAL_DOW[calDow(ds)]; h += '<div class="calwd' + (ds === today ? " today" : "") + (ds === calState.selected ? " sel" : "") + '" data-day="' + ds + '"><span class="calwdn">' + t("周" + w[0], w[1]) + '</span><span class="calnum">' + (+ds.slice(8)) + "</span></div>"; });
    h += '</div><div class="calallday"><div class="calgutter">' + t("全天", "All day") + "</div>";
    days.forEach(function (ds) { h += '<div class="calalc" data-newday="' + ds + '">' + calOn(all, ds).filter(function (x) { return x.e.allDay; }).map(function (x) { return calChip(x, ds); }).join("") + "</div>"; });
    h += '</div><div class="calwk" id="calwk"><div class="calwkin" style="height:' + 24 * CAL_HOUR + 'px"><div class="calhrs">';
    for (i = 1; i < 24; i++) h += '<span style="top:' + (i * CAL_HOUR - 7) + 'px">' + (EN ? (i % 12 || 12) + (i < 12 ? " AM" : " PM") : calPad(i) + ":00") + "</span>";
    h += "</div>";
    days.forEach(function (ds) {
      var segs = [];
      calOn(all, ds).forEach(function (x) {
        var e = x.e; if (e.allDay) return;
        var sd = e.start.slice(0, 10), nd = e.end.slice(0, 10), s = sd === ds ? calMin(e.start.slice(11, 16)) : 0, en = nd === ds ? calMin(e.end.slice(11, 16)) : 1440;
        if (en <= s) en = Math.min(1440, s + 30);
        segs.push({ x: x, s: s, e: en });
      });
      h += '<div class="calcol' + (ds === today ? " today" : "") + '" data-newday="' + ds + '">' + calLayout(segs).map(function (g) {
        var e = g.x.e, top = g.s / 60 * CAL_HOUR, ht = Math.max((g.e - g.s) / 60 * CAL_HOUR - 2, 20), w = 100 / g.cols;
        return '<button type="button" class="calblk ' + g.x.src + '" data-ev="' + esc(e.id) + '" data-src="' + g.x.src + '" style="top:' + top + "px;height:" + ht + "px;left:calc(" + g.col * w + "% + 1px);width:calc(" + w + '% - 3px)" title="' + esc(e.title) + '"><b>' + esc(e.title) + "</b>" + (ht >= 34 ? "<span>" + esc(e.start.slice(11, 16) + "–" + e.end.slice(11, 16)) + "</span>" : "") + "</button>";
      }).join("") + "</div>";
    });
    h += "</div></div></div></div>";
    return h;
  }
  function calListHTML(all, hive, edit) {
    var today = calToday();
    var rows = all.filter(function (x) { var end = (x.e.end || x.e.start || "").slice(0, 10); return calState.filter === "all" || (calState.filter === "past" ? end < today : end >= today); });
    var cnt = function (f) { return all.filter(function (x) { var end = (x.e.end || x.e.start || "").slice(0, 10); return f === "past" ? end < today : f === "upcoming" ? end >= today : true; }).length; };
    var chips = '<div class="toolbar sub">' + [["upcoming", "即将到来", "Upcoming"], ["past", "已过去", "Past"], ["all", "全部", "All"]].map(function (f) { return '<button type="button" class="chip" data-filter="' + f[0] + '" aria-pressed="' + (calState.filter === f[0]) + '">' + t(f[1], f[2]) + ' <span class="cnt">' + cnt(f[0]) + "</span></button>"; }).join("") + "</div>";
    var head = "<thead><tr><th>" + t("日期 / 时间", "Date / time") + "</th><th>" + t("标题", "Title") + "</th><th>" + (hive ? t("发给", "Aimed at") : t("对象", "For")) + "</th>" + (hive ? "<th>" + t("对象", "For") + "</th>" : "") + "<th>" + t("提醒", "Reminder") + "</th><th>" + t("会议链接", "Meeting link") + "</th>" + (hive ? "" : "<th>" + t("来源", "Source") + "</th>") + "</tr></thead>";
    var body = rows.length ? rows.map(function (x) {
      var e = x.e;
      return '<tr class="pick" data-ev="' + esc(e.id) + '" data-src="' + x.src + '"><td style="white-space:nowrap">' + calWhen(e) + "</td><td><b>" + esc(e.title) + "</b>" + (e.location ? '<div class="faint" style="font-size:12px">' + esc(e.location) + "</div>" : "") + "</td>" +
        (hive ? "<td>" + esc(calTargetsText(e)) + "</td><td>" + esc(calAudText(e.audience)) + "</td>" : "<td>" + esc(calAudText(e.audience)) + "</td>") + "<td>" + esc(calRemindText(e.reminder)) + "</td><td>" + (e.link ? "✓" : "—") + "</td>" +
        (hive ? "" : '<td><span class="tag ' + (x.src === "hive" ? "accent" : "ok") + '">' + (x.src === "hive" ? t("蜂巢", "Hive") : t("校历", "School")) + "</span></td>") + "</tr>";
    }).join("") : '<tr><td colspan="' + (hive ? 6 : 6) + '" class="muted">' + (all.length ? t("这一类里没有事件。", "No events in this view.") : t("还没有事件。", "No events yet.") + (edit ? " " + t("点右上角「＋ 添加事件」开始。", "Use “+ Add event” to start.") : "")) + "</td></tr>";
    return chips + '<div class="tbl-wrap"><table class="data" id="caltable">' + head + "<tbody>" + body + "</tbody></table></div>";
  }

  // ---- one event, in the side panel ------------------------------------------------------------------
  function calFind(id, src) {
    var list = src === "hive" ? (calState.layer === "hive" ? (calState.hive && calState.hive.hive && calState.hive.hive.events) : (calState.data && calState.data.hive && calState.data.hive.events)) : (calState.data && calState.data.calendar && calState.data.calendar.events);
    return (list || []).filter(function (e) { return e.id === id; })[0] || null;
  }
  function calOpenEvent(id, src, date, hour) {
    var hiveLayer = calState.layer === "hive";
    var ev = id ? calFind(id, src || (hiveLayer ? "hive" : "school")) : null;
    var editable = hiveLayer ? calCanEdit() : (calCanEdit() && (!ev || src !== "hive"));
    if (id && !ev) return;
    var d = hiveLayer ? calState.hive : calState.data;
    var zone = (ev && ev.timeZone) || (hiveLayer ? calBrowserZone() : ((d && d.calendar && d.calendar.timezone) || calBrowserZone()));
    var e = ev || { title: "", allDay: false, start: (date || calToday()) + "T" + calPad(hour == null ? 19 : hour) + ":00", end: (date || calToday()) + "T" + (hour == null ? "20:00" : hour < 23 ? calPad(hour + 1) + ":00" : "23:59"), timeZone: zone, audience: [], location: "", description: "", link: "", meeting: "link", reminder: (d && d.defaults && d.defaults.reminder) != null ? d.defaults.reminder : 15, showAs: "free", targets: [] };
    var schoolName = hiveLayer ? "" : " · " + esc(dname(calState.domain));
    if (!editable) {
      panelOpen('<div class="ph"><span class="avatar">📅</span><h3>' + esc(e.title) + '</h3><button class="x" type="button" aria-label="close">✕</button></div><div class="pb">' +
        '<div class="kv"><span class="k">' + t("时间", "When") + "</span><span>" + calWhen(e) + "</span>" +
        '<span class="k">' + t("对象", "For") + "</span><span>" + esc(calAudText(e.audience)) + "</span>" +
        (e.location ? '<span class="k">' + t("地点", "Where") + "</span><span>" + esc(e.location) + "</span>" : "") +
        (e.link ? '<span class="k">' + t("会议链接", "Meeting link") + '</span><span><a href="' + esc(e.link) + '" target="_blank" rel="noopener">' + esc(e.link) + "</a></span>" : "") +
        '<span class="k">' + t("提醒", "Reminder") + "</span><span>" + esc(calRemindText(e.reminder)) + "</span>" +
        '<span class="k">' + t("显示为", "Shown as") + "</span><span>" + (e.showAs === "busy" ? t("忙碌", "Busy") : t("空闲", "Free")) + "</span>" +
        (e.targets ? '<span class="k">' + t("发给", "Aimed at") + "</span><span>" + esc(calTargetsText(e)) + "</span>" : "") + "</div>" +
        (e.description ? '<p style="white-space:pre-wrap;margin-top:10px">' + esc(e.description) + "</p>" : "") +
        '<p class="muted" style="font-size:12px;margin-top:10px">' + (e.targets ? t("这是系统管理员发给本校的蜂巢事件，只读。", "A Hive event sent to this school by the system administrator — read-only.") : t("你没有编辑本校校历的权限（由本校教育领袖、教育社区经理和课程总监编辑）。", "You may not edit the school's calendar (its education leader, education community manager and curriculum director do).")) + "</p></div>");
      return;
    }
    var tgAll = (e.targets || []).indexOf("*") >= 0;
    var schools = ((domainsInfo && domainsInfo.domains) || []);
    panelOpen('<div class="ph"><span class="avatar">📅</span><h3>' + (ev ? t("修改事件", "Change event") : t("添加事件", "Add event")) + (hiveLayer ? " · " + t("蜂巢追加", "Hive") : schoolName) + '</h3><button class="x" type="button" aria-label="close">✕</button></div>' +
      '<div class="pb"><form id="cef" autocomplete="off">' +
      '<label class="f">' + t("标题", "Title") + ' <span class="req">*</span><input type="text" id="ceTitle" maxlength="120" value="' + esc(e.title) + '" /></label>' +
      '<label class="chk" style="display:flex;margin:6px 0"><input type="checkbox" id="ceAll"' + (e.allDay ? " checked" : "") + " /> " + t("全天", "All day") + "</label>" +
      '<div class="grid2"><label class="f">' + t("开始", "Starts") + ' <span class="req">*</span><input type="' + (e.allDay ? "date" : "datetime-local") + '" id="ceStart" value="' + esc(e.start) + '" /></label><label class="f">' + t("结束", "Ends") + ' <span class="req">*</span><input type="' + (e.allDay ? "date" : "datetime-local") + '" id="ceEnd" value="' + esc(e.end) + '" /></label></div>' +
      '<label class="f" id="ceZoneBox"' + (e.allDay ? " hidden" : "") + ">" + t("时区", "Time zone") + '<select id="ceZone">' + calZoneOptions(zone) + "</select></label>" +
      (hiveLayer ? '<div class="f-title">' + t("发给哪些学校", "Schools") + ' <span class="req">*</span></div><label class="chk" style="display:flex"><input type="checkbox" id="ceTgAll"' + (tgAll ? " checked" : "") + " /> <b>" + t("所有学校", "All schools") + '</b></label><div id="ceTg" class="plans">' + schools.map(function (s) { return '<label class="chk" style="display:flex"><input type="checkbox" data-tg="' + esc(s.domain) + '"' + (tgAll ? " disabled" : "") + ((e.targets || []).indexOf(s.domain) >= 0 ? " checked" : "") + " /> " + esc(dname(s.domain)) + "</label>"; }).join("") + "</div>" : "") +
      '<div class="f-title">' + t("对象（不勾 = 所有人）", "For (none ticked = everyone)") + '</div><div id="ceAud" style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:10px">' + CAL_AUDIENCE.map(function (a) { return '<label class="chk"><input type="checkbox" data-aud="' + a + '"' + ((e.audience || []).indexOf(a) >= 0 ? " checked" : "") + " /> " + esc(EN ? CAL_AUDIENCE_EN[a] : a) + "</label>"; }).join("") + "</div>" +
      '<label class="f">' + t("地点（可选）", "Location (optional)") + '<input type="text" id="ceLoc" maxlength="200" value="' + esc(e.location) + '" /></label>' +
      '<label class="f">' + t("会议链接（可选）", "Meeting link (optional)") + '<input type="url" id="ceLink" maxlength="500" placeholder="https://" value="' + esc(e.link) + '" /><small>' + t("Teams、Zoom 等会议的完整网址（https://…）。写入日历后，大家点开事件就能加入。", "The full address of a Teams, Zoom… meeting (https://…). Once events reach people's calendars they open the event and join from it.") + "</small></label>" +
      '<label class="f">' + t("说明（可选）", "Description (optional)") + '<textarea id="ceDesc" rows="3" maxlength="2000">' + esc(e.description) + "</textarea></label>" +
      '<div class="grid2"><label class="f">' + t("提醒", "Reminder") + '<select id="ceRem">' + CAL_REMIND.map(function (k) { return '<option value="' + (k[0] == null ? "" : k[0]) + '"' + (k[0] === e.reminder ? " selected" : "") + ">" + esc(t(k[1], k[2])) + "</option>"; }).join("") + '</select></label><label class="f">' + t("在日历里显示为", "Shown in calendars as") + '<select id="ceShow"><option value="free"' + (e.showAs !== "busy" ? " selected" : "") + ">" + t("空闲", "Free") + '</option><option value="busy"' + (e.showAs === "busy" ? " selected" : "") + ">" + t("忙碌", "Busy") + "</option></select></label></div>" +
      '<div class="actions"><button class="btn" type="submit" id="ceSave">' + t("保存", "Save") + "</button>" + (ev ? ' <button class="btn secondary sm" type="button" id="ceDel">' + t("删除", "Delete") + "</button>" : "") + '</div><div id="ceMsg"></div></form></div>');
    var typeNow = e.allDay;
    $("ceAll").addEventListener("change", function () {
      var on = this.checked, s = $("ceStart"), n = $("ceEnd");
      if (on === typeNow) return;
      var sv = s.value, nv = n.value;
      s.type = n.type = on ? "date" : "datetime-local";
      s.value = on ? sv.slice(0, 10) : (sv ? sv.slice(0, 10) + "T09:00" : ""); n.value = on ? nv.slice(0, 10) : (nv ? nv.slice(0, 10) + "T10:00" : "");
      typeNow = on; $("ceZoneBox").hidden = on;
    });
    var tgAllBox = $("ceTgAll");
    if (tgAllBox) tgAllBox.addEventListener("change", function () { $("ceTg").querySelectorAll("input[data-tg]").forEach(function (c) { c.disabled = tgAllBox.checked; if (tgAllBox.checked) c.checked = false; }); });
    $("cef").addEventListener("submit", function (ev2) {
      ev2.preventDefault();
      var allDay = $("ceAll").checked, rem = $("ceRem").value;
      var out = { id: ev ? ev.id : undefined, title: $("ceTitle").value.trim(), allDay: allDay, start: $("ceStart").value, end: $("ceEnd").value || $("ceStart").value, timeZone: $("ceZone").value, audience: Array.prototype.slice.call($("ceAud").querySelectorAll("input[data-aud]:checked")).map(function (c) { return c.getAttribute("data-aud"); }), location: $("ceLoc").value.trim(), description: $("ceDesc").value.trim(), link: $("ceLink").value.trim(), meeting: "link", reminder: rem === "" ? null : Number(rem), showAs: $("ceShow").value };
      if (hiveLayer) out.targets = tgAllBox && tgAllBox.checked ? ["*"] : Array.prototype.slice.call($("ceTg").querySelectorAll("input[data-tg]:checked")).map(function (c) { return c.getAttribute("data-tg"); });
      var missing = [];
      if (!out.title) missing.push(t("标题", "title"));
      if (!out.start) missing.push(t("开始时间", "start"));
      if (hiveLayer && !out.targets.length) missing.push(t("至少一所学校", "at least one school"));
      if (missing.length) { $("ceMsg").innerHTML = '<div class="msg err">' + t("请填写：", "Please fill in: ") + esc(missing.join(EN ? ", " : "、")) + "</div>"; return; }
      var b = $("ceSave"); savingButton(b); $("ceMsg").innerHTML = "";
      var req = hiveLayer ? { layer: "hive", op: "save", event: out } : { domain: calState.domain, op: "save", event: out, timezone: out.timeZone };
      post("calendar", "POST", req).then(function (r) {
        if (!r.ok) { restoreButton(b); $("ceMsg").innerHTML = '<div class="msg err">' + esc(errText(r)).replace(/\n/g, "<br>") + "</div>"; return; }
        if (hiveLayer) calState.hive = Object.assign({}, calState.hive, { hive: r.body.hive }); else calState.data = Object.assign({}, calState.data, { calendar: r.body.calendar });
        calRender(); savedAndClose(b, t("事件已保存。", "Event saved."));
      });
    });
    var del = $("ceDel");
    if (del) del.addEventListener("click", function () {
      if (!window.confirm(t("删除这个事件？", "Delete this event?"))) return;
      savingButton(del, t("删除中…", "Deleting…"));
      post("calendar", "POST", hiveLayer ? { layer: "hive", op: "delete", id: ev.id } : { domain: calState.domain, op: "delete", id: ev.id }).then(function (r) {
        if (!r.ok) { restoreButton(del); $("ceMsg").innerHTML = '<div class="msg err">' + esc(errText(r)) + "</div>"; return; }
        if (hiveLayer) calState.hive = Object.assign({}, calState.hive, { hive: r.body.hive }); else calState.data = Object.assign({}, calState.data, { calendar: r.body.calendar });
        calRender(); panelClose(); flashOk(t("事件已删除。", "Event deleted."));
      });
    });
  }

  // ---- 同步到大家的日历 -------------------------------------------------------------------------------
  // The card under the list. School layer: the 教育领袖 writes this school's calendar into its accounts'
  // default calendar. Hive layer: the system administrator ticks the schools to push to. The server does
  // a batch per request; this loop repeats until nothing is left (the first request is "fresh": earlier
  // failures are tried again). A copy a person deleted for themselves is not put back.
  function calSyncReason(f) {
    var r = f.reason;
    if (r === "no_mailbox") return t("没有可用的 Exchange 邮箱（请该校 IT 管理员检查这个账号的许可证）", "no usable Exchange mailbox (ask the school's IT administrator to check the account's licence)");
    if (r === "no_access") return t("蜂巢没有写入这个邮箱的权限", "Hive may not write to this mailbox");
    if (r === "throttled") return t("Microsoft 暂时限流，稍后再同步一次", "Microsoft is throttling — try again shortly");
    if (r === "time_zone") return t("Microsoft 不接受这个事件的时区", "Microsoft does not accept the event's time zone");
    return f.message || r || "?";
  }
  function calSyncJobs() {
    if (calState.layer !== "hive") return [{ layer: "school", domain: calState.domain }];
    return ((domainsInfo && domainsInfo.domains) || []).filter(function (d) { return calSync.picked[d.domain]; }).map(function (d) { return { layer: "hive", domain: d.domain }; });
  }
  function calSyncOnly() { return (calSync.only || "").trim(); }
  function calSyncCard() {
    var hive = calState.layer === "hive";
    var h = '<div class="card" id="calsynccard" style="margin-top:16px"><div class="ch"><h2>' + t("同步到大家的日历", "Write to everyone's calendar") + "</h2></div>" +
      '<p class="sub">' + (hive
        ? t("把「蜂巢追加」的事件写进选中学校的 Outlook / Teams 日历（只写这一层，不会碰学校自己的校历）。按每个事件的「发给」和「对象」决定谁收到；不发邀请邮件。事件改了、删了，再点一次同步就会更新或从日历里移除。", "Writes the Hive events into the chosen schools' Outlook / Teams calendars (only this layer — a school's own calendar is untouched). Each event's “Aimed at” and “For” decide who gets it; no invitation mail. After you change or delete an event, write again to update or remove it.")
        : t("把本校校历写进本校账号的 Outlook / Teams 日历，不发邀请邮件；按每个事件的「对象」决定谁收到。事件改了、删了，再点一次同步就会更新或从日历里移除。用户自己删掉的副本不会被放回去。", "Writes this school's calendar into its accounts' Outlook / Teams calendars, with no invitation mail; each event's “For” decides who gets it. After you change or delete an event, write again to update or remove it. A copy a person deleted for themselves is not put back.")) + "</p>";
    if (hive) {
      var ds = ((domainsInfo && domainsInfo.domains) || []);
      h += '<div class="f-title">' + t("写入哪些学校", "Schools") + '</div><div id="calpick" class="plans"><label class="chk" style="display:flex"><input type="checkbox" id="calpickAll"' + (ds.length && ds.every(function (d) { return calSync.picked[d.domain]; }) ? " checked" : "") + " /> <b>" + t("所有学校", "All schools") + "</b></label>" +
        ds.map(function (d) { return '<label class="chk" style="display:flex"><input type="checkbox" data-pick="' + esc(d.domain) + '"' + (calSync.picked[d.domain] ? " checked" : "") + " /> " + esc(dname(d.domain)) + "</label>"; }).join("") + "</div>";
    }
    h += '<label class="f">' + t("只写入这些账号（测试用，可留空）", "Only these accounts (for a test run — may be empty)") + '<input type="text" id="calonly" placeholder="' + (hive ? "name@school.edu" : "teacher1@" + esc(calState.domain)) + '" value="' + esc(calSync.only) + '" /><small>' + t("填一两个账号（用逗号隔开）先试；确认日历里的样子没问题，再清空、写入全部账号。", "Name one or two accounts (comma-separated) to try first; once the calendar looks right, clear it and write to everyone.") + "</small></label>" +
      '<div class="actions"><button class="btn secondary sm" type="button" id="calPlan"' + (calSync.busy ? " disabled" : "") + ">" + t("查看待写入", "Preview") + '</button> <button class="btn" type="button" id="calGo"' + (calSync.busy ? " disabled" : "") + ">" + t("同步", "Write now") + '</button> <button class="btn secondary sm" type="button" id="calWithdraw"' + (calSync.busy ? " disabled" : "") + ">" + t("撤回已写入的", "Withdraw what was written") + "</button></div>" +
      '<div id="calsyncout">' + calSyncOut() + "</div></div>";
    return h;
  }
  function calSyncOut() {
    var h = "";
    if (calSync.progress) h += '<p style="margin:10px 0 4px">' + esc(calSync.progress.text) + '</p><progress max="' + (calSync.progress.max || 1) + '" value="' + (calSync.progress.value || 0) + '" style="width:100%"></progress>';
    calSync.out.forEach(function (o) {
      h += '<div style="margin-top:12px">' + (calState.layer === "hive" ? "<b>" + esc(dname(o.domain)) + "</b> " : "");
      if (o.error) { h += '<div class="msg err">' + esc(o.error) + "</div></div>"; return; }
      var c = o.counts || {};
      if (o.kind === "plan") {
        var n = (c.create || 0) + (c.update || 0) + (c.delete || 0);
        h += esc(t("待写入：新增 ", "To write: add ") + (c.create || 0) + t("、更新 ", ", update ") + (c.update || 0) + t("、移除 ", ", remove ") + (c.delete || 0)) + (n ? "" : " " + t("— 已经是最新的。", "— already up to date.")) + '<div class="faint" style="font-size:12px">' + esc(t("账号 ", "Accounts ") + o.accounts + t(" 个，事件 ", ", events ") + o.events + t(" 个，已写入 ", ", written ") + o.written + (o.gone ? t("；用户自己删除的副本 ", "; copies people deleted ") + o.gone : "")) + "</div>";
      } else if (o.t) {
        h += esc((o.withdraw ? t("已撤回 ", "Withdrawn ") + o.t.deleted : t("已新增 ", "Added ") + o.t.created + t("、更新 ", ", updated ") + o.t.updated + t("、移除 ", ", removed ") + o.t.deleted) + (o.remaining ? t("；还剩 ", "; left ") + o.remaining : "")) + (o.gone ? '<div class="faint" style="font-size:12px">' + esc(t("用户自己删除的副本（不会放回）：", "Copies people deleted for themselves (not put back): ") + o.gone) + "</div>" : "");
      }
      if (o.failed && o.failed.length) h += '<div class="msg err" style="margin-top:6px"><b>' + t("这些没有写入：", "Not written: ") + o.failed.length + '</b><ul style="margin:4px 0 0 18px">' + o.failed.slice(0, 20).map(function (f) { return "<li>" + esc(f.upn) + " — " + esc(f.title || "") + "：" + esc(calSyncReason(f)) + "</li>"; }).join("") + (o.failed.length > 20 ? "<li>…</li>" : "") + "</ul></div>";
      h += "</div>";
    });
    return h;
  }
  function calSyncRender() {
    var box = $("calsync"); if (!box) return;
    box.innerHTML = calSyncCard();
    var all = $("calpickAll");
    if (all) all.addEventListener("change", function () { ((domainsInfo && domainsInfo.domains) || []).forEach(function (d) { calSync.picked[d.domain] = all.checked; }); calSyncRender(); });
    var pk = $("calpick"); if (pk) pk.addEventListener("change", function (e) { var c = e.target.closest("input[data-pick]"); if (c) { calSync.picked[c.getAttribute("data-pick")] = c.checked; calSyncRender(); } });
    var on = $("calonly"); if (on) on.addEventListener("input", function () { calSync.only = on.value; });
    $("calPlan").addEventListener("click", function () { calSyncRun("syncplan"); });
    $("calGo").addEventListener("click", function () { calSyncRun("sync"); });
    $("calWithdraw").addEventListener("click", function () {
      var only = calSyncOnly();
      if (!window.confirm(only ? t("从这些账号的日历里撤回这一层写入的事件？", "Withdraw the events this layer wrote from these accounts' calendars?") : t("从所有账号的日历里撤回这一层写入的事件？（学校自己的校历和蜂巢追加互不影响。）", "Withdraw the events this layer wrote from all the accounts' calendars? (The school calendar and the Hive additions never touch each other.)"))) return;
      calSyncRun("withdraw");
    });
  }
  function calSyncPaint() { var o = $("calsyncout"); if (o) o.innerHTML = calSyncOut(); }
  function calSyncButtons(off) { ["calPlan", "calGo", "calWithdraw"].forEach(function (id) { if ($(id)) $(id).disabled = off; }); }
  // One school and layer at a time; the loop ends when nothing is left or a batch moved nothing.
  async function calSyncRun(op) {
    var jobs = calSyncJobs();
    if (!jobs.length) { calMsg(t("请先勾选要写入的学校。", "Tick at least one school first."), true); return; }
    calMsg("");
    calSync.busy = true; calSync.out = []; calSync.progress = null; calSyncButtons(true);
    var only = calSyncOnly();
    for (var i = 0; i < jobs.length; i++) {
      var j = jobs[i], base = { domain: j.domain, layer: j.layer };
      if (only) base.only = only;
      var res = { domain: j.domain, kind: op === "syncplan" ? "plan" : "run", withdraw: op === "withdraw", t: { created: 0, updated: 0, deleted: 0 } };
      calSync.out.push(res);
      try {
        var r = await post("calendar", "POST", Object.assign({}, base, { op: "syncplan", withdraw: op === "withdraw" }));
        if (!r.ok) { res.error = errText(r); calSyncPaint(); continue; }
        if (op === "syncplan") { Object.assign(res, r.body); calSyncPaint(); continue; }
        var total = op === "withdraw" ? r.body.counts.delete : r.body.counts.create + r.body.counts.update + r.body.counts.delete, doneN = 0, first = true;
        for (;;) {
          calSync.progress = { text: (jobs.length > 1 ? dname(j.domain) + " · " : "") + (op === "withdraw" ? t("正在撤回…", "Withdrawing…") : t("正在写入…", "Writing…")) + " " + doneN + " / " + total, max: Math.max(total, 1), value: doneN }; calSyncPaint();
          var s = await post("calendar", "POST", Object.assign({}, base, { op: op, fresh: first }));
          first = false;
          if (!s.ok) { res.error = errText(s); break; }
          var b = s.body; doneN += b.done;
          res.t.created += b.created; res.t.updated += b.updated; res.t.deleted += b.deleted;
          res.remaining = b.remaining; res.failed = b.failed; res.gone = b.gone; res.counts = b.counts;
          if (!b.remaining || !b.done) break;
        }
      } catch (err) { res.error = String((err && err.message) || err); }
      calSyncPaint();
    }
    calSync.progress = null; calSync.busy = false;
    calSyncPaint(); calSyncButtons(false);
  }
