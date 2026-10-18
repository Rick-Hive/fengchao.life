// management/src/23-calendar.js — 学校管理 › 校历: the school's calendar (edited by its 教育领袖), and the
// events the system administrator adds on top (管理员广播). Two layers, never overwriting each other.
// Part of management.js: scripts/build-management.js concatenates management/src/*.js in name order
// into management/management.js (one closure; every part sees every other's functions). Edit here, not the built file.

  // ================================================================================
  // 校历 (Rick, 2026-10-16: 「系统管理员和域 IT 管理员和学校领袖……把学校校历，比如教师培训等日历……
  // 同步到自己的域用户的 teams 和 outlook 日历」; 「系统管理员可以添加一些日历事件，比如追加培训，
  // 但是不能覆盖每个学校的校历」).
  //
  // Server: GET/POST /api/calendar (api/shared/calendar.js; writing into the Outlook / Teams default
  // calendars is api/shared/calendarSync.js — the 发布 panel drives it in batches).
  //   学校校历  the school's own events — the 教育领袖 adds, changes and deletes them; the IT
  //             管理员 and the system administrator only look.
  //   管理员广播  events of the system administrator, 教育社区经理 and 课程总监 for chosen schools (or all), roles,
  //             Teams groups and named accounts of any school (Rick, 2026-10-17); a school sees the ones
  //             aimed at it in its list, read-only.
  // ================================================================================
  var calSync = { only: "", busy: false, out: [], progress: null };
  var calState = { layer: "school", domain: "", data: null, hive: null, filter: "upcoming", view: "month", cursor: "", selected: "" };
  var CAL_AUDIENCE = ["老师", "行政", "学生", "家长"];
  var CAL_AUDIENCE_EN = { "老师": "Teachers", "行政": "Staff", "学生": "Students", "家长": "Parents" };
  var CAL_REMIND = [[null, "不提醒", "No reminder"], [0, "开始时", "At start"], [5, "提前 5 分钟", "5 minutes before"], [10, "提前 10 分钟", "10 minutes before"], [15, "提前 15 分钟", "15 minutes before"], [30, "提前 30 分钟", "30 minutes before"], [60, "提前 1 小时", "1 hour before"], [120, "提前 2 小时", "2 hours before"], [1440, "提前 1 天", "1 day before"], [2880, "提前 2 天", "2 days before"], [10080, "提前 1 周", "1 week before"]];
  var CAL_ZONES = [["America/New_York", "美东", "Eastern"], ["America/Chicago", "美中", "Central"], ["America/Denver", "美山地", "Mountain"], ["America/Phoenix", "亚利桑那", "Arizona"], ["America/Los_Angeles", "美西", "Pacific"], ["America/Anchorage", "阿拉斯加", "Alaska"], ["Pacific/Honolulu", "夏威夷", "Hawaii"], ["America/Toronto", "多伦多", "Toronto"], ["America/Vancouver", "温哥华", "Vancouver"], ["Europe/London", "伦敦", "London"], ["Asia/Shanghai", "北京 / 上海", "China"], ["Asia/Hong_Kong", "香港", "Hong Kong"], ["Asia/Taipei", "台北", "Taipei"], ["Asia/Singapore", "新加坡", "Singapore"], ["UTC", "UTC", "UTC"]];
  function calDomains() { return ((domainsInfo && domainsInfo.domains) || []).filter(function (d) { return d.can && d.can.calendar; }); }
  // The cross-school layer: the system administrator, 教育社区经理 and 课程总监.
  function canHive() { var r = (me && me.roles) || []; return isAdmin() || r.indexOf("staff:community") >= 0 || r.indexOf("staff:curriculum") >= 0 || r.indexOf("coordinator") >= 0; }
  function canSeeCalendar() { return calDomains().length > 0 || canHive(); }
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
  // Who an event is for, in words: schools · roles · Teams · named accounts.
  function calForText(e, layer) {
    var hive = layer ? layer === "hive" : !!e.targets, parts = [], roles = e.audience || [], teams = e.teams || [], people = e.people || [], tg = e.targets || [];
    if (hive) {
      if (tg.indexOf("*") >= 0 || (!tg.length && (roles.length || teams.length))) parts.push(t("所有学校", "All schools"));
      else if (tg.length) parts.push(calTargetsText(e));
    } else if (!roles.length && !teams.length && !people.length) return t("本校所有人", "Everyone at this school");
    else parts.push(t("本校", "This school"));
    if (roles.length) parts.push(calAudText(roles));
    if (teams.length) parts.push("Teams: " + teams.map(function (x) { return x.name || x.id.slice(0, 8); }).join(EN ? ", " : "、"));
    if (people.length) parts.push(people.length === 1 ? people[0] : t("另加 " + people.length + " 位账号", "+ " + people.length + " named accounts"));
    return parts.join(" · ") || "—";
  }
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
    if (!ds.length && !canHive()) { location.hash = "#/account"; return; }
    if (calState.layer === "hive" && !canHive()) calState.layer = "school";
    if (calState.layer === "school" && !ds.length) calState.layer = "hive";
    if (!calState.domain || !ds.some(function (d) { return d.domain === calState.domain; })) calState.domain = (ds.filter(function (d) { return d.domain === currentDomain; })[0] || ds.filter(function (d) { return d.domain === domainsInfo.mine; })[0] || ds[0] || {}).domain || "";
    setTitle(domainGroupTitle(), t("校历", "School calendar"), "",
      { info: t("学校的日历：培训、家长会、放假等。「学校校历」由本校教育领袖、教育社区经理和课程总监编辑；系统管理员、教育社区经理和课程总监可以另外添加「管理员广播」的事件（如联合培训），按学校、身份、Teams 群组筛选，或直接输入账号（可跨学校），但不会改动学校自己的校历。学校的列表里会同时显示发给本校的广播事件（只读）。保存的事件要点右上角「发布」，才会写进本校账号的 Outlook / Teams 日历（不发邀请邮件）。", "A school's calendar: training days, parent meetings, holidays. The school calendar is edited by the school's education leader, education community manager or curriculum director; the system administrator, education community manager and curriculum director can add Hive events (such as a joint training) for chosen schools, roles and Teams groups, or for named accounts of any school, without ever changing a school's own calendar. A school's list also shows the Hive events aimed at it (read-only). Saved events reach people only when you press Publish (top right), which writes them into the school accounts' Outlook / Teams calendars (no invitation mail).") });
    $("content").innerHTML =
      '<div class="pagetabs" role="tablist" id="caltabs">' + (ds.length ? '<a class="ptab' + (calState.layer === "school" ? " on" : "") + '" href="#/domain/calendar" data-layer="school" role="tab">' + t("学校校历", "School calendar") + "</a>" : "") +
        (canHive() ? '<a class="ptab' + (calState.layer === "hive" ? " on" : "") + '" href="#/domain/calendar" data-layer="hive" role="tab">' + t("管理员广播", "Admin broadcast") + "</a>" : "") +
        '<div class="tabsRight" id="calright"></div></div><div id="calmsg"></div><div id="calbody"><div class="loading">' + t("载入中…", "Loading…") + "</div></div>";
    $("caltabs").addEventListener("click", function (e) {
      if (e.target.closest("#calPublish")) { calSyncOpen(); return; }
      if (e.target.closest("#calAdd")) { calOpenEvent(null, undefined, calState.view !== "list" ? calState.selected : undefined); return; }
      var a = e.target.closest("a[data-layer]"); if (!a) return; e.preventDefault(); calState.layer = a.getAttribute("data-layer"); viewCalendar(); });
    $("calbody").addEventListener("click", function (e) {
      var chip = e.target.closest(".chip[data-filter]"); if (chip) { calState.filter = chip.getAttribute("data-filter"); calRender(); return; }
      var lg = e.target.closest("[data-layer-go]"); if (lg) { calState.layer = lg.getAttribute("data-layer-go"); viewCalendar(); return; }
      var vb = e.target.closest("[data-view]"); if (vb) { calState.view = vb.getAttribute("data-view"); if (calState.view !== "list") calGoTo(calState.selected || calToday()); calRender(); return; }
      var nb = e.target.closest("[data-nav]");
      if (nb) {
        var nav = nb.getAttribute("data-nav"), c = calState.cursor;
        calGoTo(nav === "today" ? calToday() : calState.view === "month" ? calShiftMonth(c, nav === "next" ? 1 : -1) : calAdd(c, nav === "next" ? 7 : -7));
        calRender(); return;
      }
      var tr = e.target.closest("[data-ev]"); if (tr) { if (calDragged) return; calOpenEvent(tr.getAttribute("data-ev"), tr.getAttribute("data-src")); return; }
      var more = e.target.closest("[data-more]"); if (more) { calState.view = "week"; calState.cursor = more.getAttribute("data-more"); calState.selected = calState.cursor; calRender(); return; }
      if (e.target.closest("#calAddDay")) { calOpenEvent(null, undefined, calState.selected); return; }
      if (e.target.closest("[data-newday]")) { calState.selected = e.target.closest("[data-newday]").getAttribute("data-newday"); return; }
      var dc = e.target.closest("[data-day]"); if (dc) { if (dc.classList.contains("calcell")) calSelectDay(dc.getAttribute("data-day")); else { calState.selected = dc.getAttribute("data-day"); calRender(); } }
    });
    calBindCreate($("calbody"));
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
    calSync = { only: "", busy: false, out: [], progress: null };
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
    calQuickClose();
    var hive = calState.layer === "hive", d = hive ? calState.hive : calState.data, ds = calDomains();
    if (!d) return;
    var edit = calCanEdit();
    // right side of the tabs row: the school picker (school layer) and the school's default time zone
    var right = "";
    if (!hive) right = (ds.length > 1 ? '<select id="calsel">' + ds.map(function (x) { return '<option value="' + esc(x.domain) + '"' + (x.domain === calState.domain ? " selected" : "") + ">" + esc(dname(x.domain)) + "</option>"; }).join("") + "</select>" : '<span class="tag accent">' + esc(dname(calState.domain)) + "</span>") +
      (edit ? '<label class="muted" style="font-size:12px;white-space:nowrap">' + t("默认时区", "Default time zone") + ' <select id="calzone" class="sm" style="width:auto;max-width:210px">' + calZoneOptions((d.calendar && d.calendar.timezone) || (d.defaults && d.defaults.timeZone) || CAL_DEFAULT_ZONE) + "</select></label>" : "");
    // one short ⓘ instead of a paragraph of explanation (Rick, 2026-10-17); the buttons live on this row too
    var tip = hive
      ? t("可按学校、身份、Teams 群组筛选，也可加任意学校的账号；不会改动学校自己的校历。保存后点「发布」才写入日历。", "Pick schools, roles and Teams groups, or add accounts of any school; a school's own calendar is never changed. Press Publish after saving to write it into calendars.")
      : edit ? t("点事件可修改。带「广播」标记的来自校外，只读。保存后点「发布」才写入大家的日历。", "Click an event to change it. Events tagged Broadcast come from outside and are read-only. Press Publish after saving to write them into calendars.")
      : isAdmin() ? t("系统管理员在这里只能查看；要给学校加事件，请用「管理员广播」。", "As the system administrator you can only look here; to add events for schools use Admin broadcast.")
      : t("只能查看；编辑和发布由本校教育领袖、教育社区经理和课程总监负责。", "View only; editing and publishing are for the school's education leader, education community manager and curriculum director.");
    right += tipI(tip) + (edit ? "" : '<span class="tag">' + t("只读", "View only") + "</span>") +
      (edit ? '<button class="btn secondary sm" id="calAdd">' + t("＋ 添加事件", "+ Add event") + '</button><button class="btn sm" id="calPublish">' + t("发布", "Publish") + "</button>" : "");
    $("calright").innerHTML = right;
    var sel = $("calsel"); if (sel) sel.addEventListener("change", function () { calState.domain = this.value; currentDomain = this.value; calLoad(); });
    var zs = $("calzone"); if (zs) zs.addEventListener("change", function () { post("calendar", "POST", { domain: calState.domain, op: "zone", timezone: zs.value }).then(function (r) { if (!r.ok) { calMsg(errText(r), true); return; } calState.data.calendar = r.body.calendar; flashOk(t("默认时区已保存。", "Default time zone saved.")); }); });
    var all = calRows();
    var main = calState.view === "month" ? calMonthHTML(all, edit) : calState.view === "week" ? calWeekHTML(all, edit) : calListHTML(all, hive, edit);
    $("calbody").innerHTML = calBarHTML(all) + main;
    if (calState.view === "week" && $("calwk")) {
      // open the week at its first timed event (an hour earlier), or at 8:00 when it has none
      var firstMin = Infinity; $("calwk").querySelectorAll(".calblk").forEach(function (b) { firstMin = Math.min(firstMin, parseFloat(b.style.top) / CAL_HOUR * 60); });
      $("calwk").scrollTop = Math.max(0, (isFinite(firstMin) ? Math.floor(firstMin / 60) - 1 : 8) * CAL_HOUR);
    }
  }

  // ---- 月 / 周 / 列表 views ---------------------------------------------------------------------------
  // Month and week grids over the same rows as the list. Times are shown as the wall-clock of each event's
  // own time zone (the same as the list); a multi-day event is drawn on every day it covers.
  var CAL_WEEK0 = 0; // weeks start on Sunday (the schools are in North America; Outlook and Teams do the same there)
  var CAL_HOUR = 56; // px per hour in the week grid (an hour-long block has room for two lines of title and the time)
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
  // the Upcoming / Past / All filter, on the same row as the view switch
  function calChipsHTML(all) {
    var today = calToday();
    var cnt = function (f) { return all.filter(function (x) { var end = (x.e.end || x.e.start || "").slice(0, 10); return f === "past" ? end < today : f === "upcoming" ? end >= today : true; }).length; };
    return '<span class="calchips">' + [["upcoming", "即将到来", "Upcoming"], ["past", "已过去", "Past"], ["all", "全部", "All"]].map(function (f) { return '<button type="button" class="chip" data-filter="' + f[0] + '" aria-pressed="' + (calState.filter === f[0]) + '">' + t(f[1], f[2]) + ' <span class="cnt">' + cnt(f[0]) + "</span></button>"; }).join("") + "</span>";
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
    if (v === "list") h += calChipsHTML(all);
    h += '<span class="calgap"></span><div class="calseg" id="calview" role="group" aria-label="' + t("视图", "View") + '">' + [["month", "月", "Month"], ["week", "周", "Week"], ["list", "列表", "List"]].map(function (k) { return '<button type="button" data-view="' + k[0] + '" aria-pressed="' + (v === k[0]) + '">' + t(k[1], k[2]) + "</button>"; }).join("") + "</div></div>";
    return h;
  }
  function calChip(x, ds) {
    var e = x.e, time = !e.allDay && calSpan(e)[0] === ds ? '<span class="tm">' + esc((e.start || "").slice(11, 16)) + "</span>" : "";
    return '<button type="button" class="calev ' + x.src + (calCanDrag(x.src) ? " drag" : "") + '" data-ev="' + esc(e.id) + '" data-src="' + x.src + '" title="' + esc(e.title) + '">' + time + '<span class="tt">' + esc(e.title) + "</span></button>";
  }
  // an event may be dragged when this calendar may be edited and the event belongs to it (a school sees broadcasts read-only)
  function calCanDrag(src) { return calCanEdit() && (calState.layer === "hive" || src !== "hive"); }
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
    return h + calAgendaHTML(all, edit);
  }
  // the selected day, in full — this is also what a phone shows, where the cells only have dots
  function calAgendaHTML(all, edit) {
    var h = "", sel = calState.selected, list = calOn(all, sel);
    h += '<div class="calagenda"><div class="calagh"><b>' + esc(calDayLong(sel)) + "</b>" + (edit ? '<button type="button" class="btn secondary sm" id="calAddDay">' + t("＋ 添加事件", "+ Add event") + "</button>" : "") + "</div>" +
      (list.length ? list.map(function (x) {
        var e = x.e;
        return '<div class="calagrow" data-ev="' + esc(e.id) + '" data-src="' + x.src + '" tabindex="0"><span class="calagbar ' + x.src + '"></span><div class="calagtime">' + calWhenShort(e, sel) + '</div><div class="calagmain"><b>' + esc(e.title) + "</b>" + (e.location ? '<div class="faint">' + esc(e.location) + "</div>" : "") + '</div><span class="tag ' + (x.src === "hive" ? "accent" : "ok") + '">' + (x.src === "hive" ? t("广播", "Broadcast") : t("校历", "School")) + "</span></div>";
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
    h += '</div><div class="calwk" id="calwk"><div class="calwkin" style="height:' + 24 * CAL_HOUR + 'px;--calh:' + CAL_HOUR + 'px"><div class="calhrs">';
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
        // the title gets every line the block has room for after the time (15px a line, 14px for the time, 6px padding)
        var withTime = ht >= 34, lines = Math.max(1, Math.floor((ht - 6 - (withTime ? 15 : 0)) / 15)), drag = edit && calCanDrag(g.x.src);
        return '<button type="button" class="calblk ' + g.x.src + (drag ? " drag" : "") + '" data-ev="' + esc(e.id) + '" data-src="' + g.x.src + '" style="top:' + top + "px;height:" + ht + "px;left:calc(" + g.col * w + "% + 1px);width:calc(" + w + '% - 3px)" title="' + esc(e.title) + '"><b style="-webkit-line-clamp:' + lines + '">' + esc(e.title) + "</b>" + (withTime ? "<span>" + esc(e.start.slice(11, 16) + "–" + e.end.slice(11, 16)) + "</span>" : "") + (drag ? '<i class="rz" aria-hidden="true"></i>' : "") + "</button>";
      }).join("") + "</div>";
    });
    h += "</div></div></div></div>";
    return h;
  }
  function calListHTML(all, hive, edit) {
    var today = calToday();
    var rows = all.filter(function (x) { var end = (x.e.end || x.e.start || "").slice(0, 10); return calState.filter === "all" || (calState.filter === "past" ? end < today : end >= today); });
    var head = "<thead><tr><th>" + t("日期 / 时间", "Date / time") + "</th><th>" + t("标题", "Title") + "</th><th>" + t("发给", "For") + "</th><th>" + t("提醒", "Reminder") + "</th><th>" + t("会议链接", "Meeting link") + "</th>" + (hive ? "" : "<th>" + t("来源", "Source") + "</th>") + "</tr></thead>";
    var body = rows.length ? rows.map(function (x) {
      var e = x.e;
      return '<tr class="pick" data-ev="' + esc(e.id) + '" data-src="' + x.src + '"><td style="white-space:nowrap">' + calWhen(e) + "</td><td><b>" + esc(e.title) + "</b>" + (e.location ? '<div class="faint" style="font-size:12px">' + esc(e.location) + "</div>" : "") + "</td>" +
        "<td>" + esc(calForText(e, x.src)) + "</td><td>" + esc(calRemindText(e.reminder)) + "</td><td>" + (e.link ? "✓" : "—") + "</td>" +
        (hive ? "" : '<td><span class="tag ' + (x.src === "hive" ? "accent" : "ok") + '">' + (x.src === "hive" ? t("广播", "Broadcast") : t("校历", "School")) + "</span></td>") + "</tr>";
    }).join("") : '<tr><td colspan="' + (hive ? 5 : 6) + '" class="muted">' + (all.length ? t("这一类里没有事件。", "No events in this view.") : t("还没有事件。", "No events yet.") + (edit ? " " + t("点右上角「＋ 添加事件」开始。", "Use “+ Add event” to start.") : "")) + "</td></tr>";
    return '<div class="tbl-wrap"><table class="data" id="caltable">' + head + "<tbody>" + body + "</tbody></table></div>";
  }

  // ---- start / end: a date and a time field each, like Outlook and Teams (Rick, 2026-10-17: 「不能选择事件发生的时间，
  // 比如 8:00 a.m. – 8:45 a.m.」). The time is typed or picked to the minute (8:14 works); moving the start moves the end with it, so the
  // length of the event is kept; the length is shown beside the end. All-day events show the dates only.
  var CAL_DEFAULT_ZONE = "Asia/Shanghai"; // 北京时间, until a school saves its own default
  function calTimeLabel(hhmm) {
    var h = +hhmm.slice(0, 2), m = hhmm.slice(3, 5);
    return EN ? ((h % 12) || 12) + ":" + m + " " + (h < 12 ? "AM" : "PM") : (h < 12 ? "上午 " : "下午 ") + ((h % 12) || 12) + ":" + m;
  }
  // A native time field with a one-minute step: type 8:14 or pick from the browser's clock.
  function calSetTime(input, v) { input.value = v; }
  function calWhenHTML(id, allDay, start, end) {
    var sd = (start || "").slice(0, 10), ed = (end || start || "").slice(0, 10), st = allDay ? "09:00" : (start || "").slice(11, 16) || "09:00", et = allDay ? "10:00" : (end || "").slice(11, 16) || "10:00";
    return '<div class="calwhen' + (allDay ? " allday" : "") + '" id="' + id + '">' +
      '<div class="wrow"><span class="wl">' + t("开始", "Starts") + '</span><input type="date" class="wsd" value="' + esc(sd) + '" aria-label="' + t("开始日期", "Start date") + '" /><input type="time" step="60" class="wst" value="' + esc(st) + '" aria-label="' + t("开始时间", "Start time") + '" /></div>' +
      '<div class="wrow"><span class="wl">' + t("结束", "Ends") + '</span><input type="date" class="wed" value="' + esc(ed) + '" aria-label="' + t("结束日期", "End date") + '" /><input type="time" step="60" class="wet" value="' + esc(et) + '" aria-label="' + t("结束时间", "End time") + '" /></div>' +
      '<div class="wdur" aria-live="polite"></div></div>';
  }
  function calWhenValue(root) {
    var q = function (c) { return root.querySelector(c); }, allDay = root.classList.contains("allday"), sd = q(".wsd").value, ed = q(".wed").value || sd;
    return allDay ? { allDay: true, start: sd, end: ed } : { allDay: false, start: sd ? sd + "T" + q(".wst").value : "", end: ed ? ed + "T" + q(".wet").value : "" };
  }
  function calWhenMin(sd, st) { return calParse(sd) / 60000 + calMin(st); }
  function calDurText(mins, allDay) {
    if (allDay) { var dd = Math.round(mins / 1440) + 1; return t(dd + " 天", dd + (dd === 1 ? " day" : " days")); }
    var h = Math.floor(mins / 60), m = mins % 60;
    return EN ? (h ? h + " h" : "") + (h && m ? " " : "") + (m ? m + " min" : "") : (h ? h + " 小时" : "") + (h && m ? " " : "") + (m ? m + " 分钟" : "");
  }
  // Wire a widget; `onChange` runs after every change (the quick card uses it to clear its message).
  function calWhenBind(root, onChange) {
    var q = function (c) { return root.querySelector(c); }, sd = q(".wsd"), st = q(".wst"), ed = q(".wed"), et = q(".wet"), dur = q(".wdur");
    function span() { var allDay = root.classList.contains("allday"); return allDay ? (calParse(ed.value || sd.value) - calParse(sd.value)) / 60000 : calWhenMin(ed.value || sd.value, et.value) - calWhenMin(sd.value, st.value); }
    var keep = Math.max(0, span());
    function paint() {
      var allDay = root.classList.contains("allday"), s = span();
      if (isNaN(s) || s < (allDay ? 0 : 1)) { dur.className = "wdur bad"; dur.textContent = allDay ? t("结束日期不能早于开始日期", "The end date is before the start") : t("结束时间必须晚于开始时间", "The end must be after the start"); }
      else { dur.className = "wdur"; dur.textContent = calDurText(s, allDay); }
    }
    function shiftEnd() { // the start moved: the end follows, so the length stays
      var allDay = root.classList.contains("allday"); if (!sd.value) return;
      if (allDay) { ed.value = calFmt(calParse(sd.value) + keep * 60000); return; }
      var total = calWhenMin(sd.value, st.value) + keep, endDay = calFmt(Math.floor(total / 1440) * 86400000), mm = total - Math.floor(total / 1440) * 1440;
      ed.value = endDay; calSetTime(et, calPad(Math.floor(mm / 60)) + ":" + calPad(mm % 60));
    }
    sd.addEventListener("change", function () { shiftEnd(); paint(); if (onChange) onChange(); });
    st.addEventListener("change", function () { shiftEnd(); paint(); if (onChange) onChange(); });
    ed.addEventListener("change", function () { var s = span(); if (!isNaN(s) && s >= 0) keep = s; paint(); if (onChange) onChange(); });
    et.addEventListener("change", function () { var s = span(); if (!isNaN(s) && s >= 0) keep = s; paint(); if (onChange) onChange(); });
    paint();
    return { allDay: function (on) {
      root.classList.toggle("allday", on);
      if (on) keep = Math.max(0, Math.round((calParse(ed.value || sd.value) - calParse(sd.value)) / 86400000)) * 1440;
      else { calSetTime(st, "09:00"); calSetTime(et, "10:00"); if (ed.value !== sd.value) ed.value = sd.value; keep = 60; }
      paint(); if (onChange) onChange();
    } };
  }

  // ---- Outlook / Teams style creation (Rick, 2026-10-16: 「双击添加事件，选择时间，输入内容」) -----------
  // Double-click a day (month) or a slot (week), or drag over a stretch of time in the week grid: a small
  // card opens next to it with the title to type and the time to adjust. 保存 writes the event with the
  // usual defaults (reminder, everyone); 更多选项 opens the full form with what was typed. In the Hive layer
  // a school has to be chosen, so there the full form opens straight away.
  var calQ = null; // the open quick card: { el, ghost, onDown, onKey }
  function calQuickClose() {
    if (!calQ) return;
    document.removeEventListener("mousedown", calQ.onDown, true); document.removeEventListener("keydown", calQ.onKey, true);
    if (calQ.el.parentNode) calQ.el.parentNode.removeChild(calQ.el);
    if (calQ.ghost && calQ.ghost.parentNode) calQ.ghost.parentNode.removeChild(calQ.ghost);
    calQ = null;
  }
  // the zone a new event starts in: the school's saved default, else the server's default (北京时间)
  function calDefaultZone() { var d = calState.layer === "hive" ? calState.hive : calState.data; return (calState.layer !== "hive" && d && d.calendar && d.calendar.timezone) || (d && d.defaults && d.defaults.timeZone) || CAL_DEFAULT_ZONE; }
  function calQuickZone() { return calDefaultZone(); }
  function calQuickOpen(anchor, seed, ghost) {
    calQuickClose();
    if (calState.layer === "hive") { if (ghost && ghost.parentNode) ghost.parentNode.removeChild(ghost); calOpenEvent(null, undefined, seed.start.slice(0, 10), undefined, seed); return; }
    var zone = calQuickZone(), el = document.createElement("div");
    el.className = "calquick"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", t("新事件", "New event"));
    el.innerHTML = '<input type="text" class="qtitle" maxlength="120" placeholder="' + t("添加标题", "Add a title") + '" aria-label="' + t("标题", "Title") + '" />' +
      '<label class="chk qall"><input type="checkbox" class="qallday"' + (seed.allDay ? " checked" : "") + " /> " + t("全天", "All day") + tipI(t("全天事件没有具体时间；要选开始和结束时间，请取消勾选。", "An all-day event has no times; untick to choose a start and end time.")) + "</label>" +
      calWhenHTML("cqwhen", seed.allDay, seed.start, seed.end) +
      '<label class="qzone"><span>' + t("时区", "Time zone") + '</span><select class="qzonesel">' + calZoneOptions(zone) + '</select></label><div class="qmsg"></div>' +
      '<div class="qact"><button type="button" class="btn sm qsave">' + t("保存", "Save") + '</button><button type="button" class="btn secondary sm qmore">' + t("更多选项", "More options") + '</button><button type="button" class="qclose" aria-label="' + t("关闭", "Close") + '">✕</button></div>';
    document.body.appendChild(el);
    // beside the anchor, inside the window
    var r = anchor.getBoundingClientRect(), w = el.offsetWidth || 320, h = el.offsetHeight || 190;
    var left = r.right + 8; if (left + w > window.innerWidth - 8) left = r.left - w - 8; if (left < 8) left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left));
    var top = Math.max(8, Math.min(window.innerHeight - h - 8, r.top));
    el.style.left = left + "px"; el.style.top = top + "px";
    var q = function (c) { return el.querySelector(c); };
    var wh = calWhenBind(q(".calwhen"), function () { q(".qmsg").innerHTML = ""; });
    q(".qallday").addEventListener("change", function () { wh.allDay(this.checked); q(".qzone").hidden = this.checked; });
    q(".qzone").hidden = !!seed.allDay;
    var seedNow = function () { var w = calWhenValue(q(".calwhen")); return { title: q(".qtitle").value.trim(), allDay: w.allDay, start: w.start, end: w.end || w.start }; };
    var save = function () {
      var v = seedNow(), msg = q(".qmsg");
      if (!v.title) { msg.innerHTML = '<span class="err">' + t("请输入标题。", "Please add a title.") + "</span>"; q(".qtitle").focus(); return; }
      if (!v.start) { msg.innerHTML = '<span class="err">' + t("请选择开始时间。", "Please choose a start.") + "</span>"; return; }
      if (v.allDay ? v.end < v.start : v.end <= v.start) { msg.innerHTML = '<span class="err">' + t("结束时间必须晚于开始时间。", "The end must be after the start.") + "</span>"; return; }
      var zoneNow = q(".qzonesel").value;
      var d = calState.data, rem = d && d.defaults && d.defaults.reminder != null ? d.defaults.reminder : 15;
      var out = { title: v.title, allDay: v.allDay, start: v.start, end: v.end, timeZone: zoneNow, audience: [], teams: [], people: [], location: "", description: "", link: "", meeting: "link", reminder: rem, showAs: "free" };
      var b = q(".qsave"); b.disabled = true; b.textContent = t("保存中…", "Saving…");
      post("calendar", "POST", { domain: calState.domain, op: "save", event: out, timezone: zoneNow }).then(function (r) {
        if (!r.ok) { b.disabled = false; b.textContent = t("保存", "Save"); msg.innerHTML = '<span class="err">' + esc(errText(r)).replace(/\n/g, "<br>") + "</span>"; return; }
        calState.data = Object.assign({}, calState.data, { calendar: r.body.calendar });
        calQuickClose(); calRender(); flashOk(t("事件已保存。", "Event saved."));
      });
    };
    q(".qsave").addEventListener("click", save);
    q(".qmore").addEventListener("click", function () { var v = seedNow(); calQuickClose(); calOpenEvent(null, undefined, (v.start || calToday()).slice(0, 10), undefined, v); });
    q(".qclose").addEventListener("click", calQuickClose);
    q(".qtitle").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); save(); } });
    calQ = { el: el, ghost: ghost || null,
      onDown: function (e) { if (!el.contains(e.target)) calQuickClose(); },
      onKey: function (e) { if (e.key === "Escape") { e.stopPropagation(); calQuickClose(); } } };
    document.addEventListener("mousedown", calQ.onDown, true); document.addEventListener("keydown", calQ.onKey, true);
    q(".qtitle").focus();
  }
  // minutes from the top of a week column to a snapped value
  function calSnap(clientY, col, step) { var m = (clientY - col.getBoundingClientRect().top) / CAL_HOUR * 60; return Math.max(0, Math.min(1440, Math.round(m / step) * step)); }
  function calHM(day, min) { return min >= 1440 ? calAdd(day, 1) + "T00:00" : day + "T" + calPad(Math.floor(min / 60)) + ":" + calPad(min % 60); }
  function calGhost(col, s, e) {
    var g = col.querySelector(".calghost");
    if (!g) { g = document.createElement("div"); g.className = "calghost"; col.appendChild(g); }
    g.style.top = s / 60 * CAL_HOUR + "px"; g.style.height = Math.max((e - s) / 60 * CAL_HOUR - 2, 14) + "px";
    g.innerHTML = "<span>" + calPad(Math.floor(s / 60)) + ":" + calPad(s % 60) + "–" + (e >= 1440 ? "24:00" : calPad(Math.floor(e / 60)) + ":" + calPad(e % 60)) + "</span>";
    return g;
  }
  function calQuickSlot(col, s, e) {
    var day = col.getAttribute("data-newday"), g = calGhost(col, s, e);
    calState.selected = day;
    calQuickOpen(g, { allDay: false, start: calHM(day, s), end: calHM(day, e) }, g);
  }
  // Update the selected day in place (a re-draw between the two clicks of a double-click would lose the target).
  function calSelectDay(ds) {
    calState.selected = ds;
    var old = document.querySelector(".calcell.sel"); if (old) old.classList.remove("sel");
    var cell = document.querySelector('.calcell[data-day="' + ds + '"]'); if (cell) cell.classList.add("sel");
    var ag = document.querySelector(".calagenda"); if (ag) ag.outerHTML = calAgendaHTML(calRows(), calCanEdit());
  }
  function calBindCreate(body) {
    body.addEventListener("dblclick", function (e) {
      if (!calCanEdit() || e.target.closest("[data-ev]") || e.target.closest("[data-more]")) return;
      var col = e.target.closest(".calcol[data-newday]"), cell = e.target.closest(".calcell[data-day]"), alc = e.target.closest(".calalc[data-newday]");
      if (col) { var s = Math.max(0, Math.min(1380, Math.floor(((e.clientY - col.getBoundingClientRect().top) / CAL_HOUR * 60) / 30) * 30)); calQuickSlot(col, s, Math.min(1440, s + 60)); return; }
      var day = alc ? alc.getAttribute("data-newday") : cell ? cell.getAttribute("data-day") : "";
      if (!day) return;
      if (cell) calSelectDay(day); else calState.selected = day;
      // the all-day strip makes an all-day event; a day in the month grid makes a timed one (9:00–10:00, easy to change) so the time is there to choose (Rick, 2026-10-17: 「只有日期，没有时间选择」)
      calQuickOpen(alc || cell, alc ? { allDay: true, start: day, end: day } : { allDay: false, start: day + "T09:00", end: day + "T10:00" });
    });
    // drag over a stretch of a day column (mouse or pen; touch keeps scrolling)
    body.addEventListener("pointerdown", function (e) {
      if (e.button !== 0 || e.pointerType === "touch" || !calCanEdit()) return;
      var col = e.target.closest(".calcol"); if (!col || e.target.closest("[data-ev]")) return;
      calQuickClose();
      var y0 = e.clientY, m0 = calSnap(y0, col, 15), moved = false, m1 = m0;
      function move(ev) {
        if (!moved && Math.abs(ev.clientY - y0) < 6) return;
        moved = true; m1 = calSnap(ev.clientY, col, 15);
        var s = Math.min(m0, m1), en = Math.max(m0, m1); if (en - s < 15) en = Math.min(1440, s + 15);
        calGhost(col, s, en);
      }
      function up() {
        document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up);
        if (!moved) return;
        var s = Math.min(m0, m1), en = Math.max(m0, m1); if (en - s < 15) en = Math.min(1440, s + 15);
        calQuickSlot(col, s, en);
      }
      document.addEventListener("pointermove", move); document.addEventListener("pointerup", up);
    });
    calBindMove(body);
  }

  // ---- drag to move / resize (Rick, 2026-10-18: 「无法拖动」) ----------------------------------------------
  // Week: drag a block to another time or day (the length is kept), or its bottom edge to change the end; 15-minute
  // steps. Month and the all-day strip: drag a chip to another day (the times are kept). The event is saved at once
  // and the grid redrawn; the copies in people's calendars change at the next 发布.
  var calDragged = false; // true for the click that ends a drag, so it does not open the event
  function calMinOf(s) { return calParse(s.slice(0, 10)) / 60000 + calMin(s.slice(11, 16)); }
  function calFromMin(m) { var d = Math.floor(m / 1440), r = m - d * 1440; return calFmt(d * 86400000) + "T" + calPad(Math.floor(r / 60)) + ":" + calPad(r % 60); }
  function calRowOf(el) { var id = el.getAttribute("data-ev"), src = el.getAttribute("data-src"), e = calFind(id, src); return e ? { e: e, src: src } : null; }
  function calMoveSave(x, start, end) {
    var hive = calState.layer === "hive", out = Object.assign({}, x.e, { start: start, end: end });
    var req = hive ? { layer: "hive", op: "save", event: out } : { domain: calState.domain, op: "save", event: out, timezone: x.e.timeZone };
    return post("calendar", "POST", req).then(function (r) {
      if (!r.ok) { calRender(); calMsg(errText(r), true); return; }
      if (hive) calState.hive = Object.assign({}, calState.hive, { hive: r.body.hive }); else calState.data = Object.assign({}, calState.data, { calendar: r.body.calendar });
      calRender();
      flashOk(t("已移到 ", "Moved to ") + calWhen(out) + t("。再点一次「发布」，大家的日历才会更新。", ". Publish again to update people's calendars."));
    });
  }
  function calDragEnd() { calDragged = true; setTimeout(function () { calDragged = false; }, 0); document.body.classList.remove("caldragging"); }
  function calBindMove(body) {
    body.addEventListener("pointerdown", function (e) {
      if (e.button !== 0 || e.pointerType === "touch") return;
      var blk = e.target.closest(".calblk.drag"), chip = e.target.closest(".calev.drag");
      if (blk) calDragBlock(e, blk); else if (chip) calDragChip(e, chip);
    });
  }
  // week view: a block, or its bottom edge
  function calDragBlock(e, blk) {
    var x = calRowOf(blk), col0 = blk.closest(".calcol"); if (!x || !col0) return;
    calQuickClose();
    var resize = e.target.classList.contains("rz"), e0 = x.e;
    var startMin = calMinOf(e0.start), endMin = calMinOf(e0.end); if (endMin <= startMin) endMin = startMin + 30;
    var dur = endMin - startMin, day0Min = calParse(col0.getAttribute("data-newday")) / 60000;
    var grabOff = calSnap(e.clientY, col0, 1) - Math.max(startMin - day0Min, 0); // minutes between the block's top and the pointer
    var y0 = e.clientY, x0 = e.clientX, moved = false, cur = null;
    var cols = Array.prototype.slice.call(col0.parentNode.querySelectorAll(".calcol[data-newday]"));
    function colAt(cx) { var best = cols[0], bd = Infinity; cols.forEach(function (c) { var r = c.getBoundingClientRect(), d = cx < r.left ? r.left - cx : cx > r.right ? cx - r.right : 0; if (d < bd) { bd = d; best = c; } }); return best; }
    function ghost(s, en) {
      cols.forEach(function (c) { var g = c.querySelector(".calghost"); if (g && (c !== cur.col)) g.remove(); });
      var dm = calParse(cur.col.getAttribute("data-newday")) / 60000;
      calGhost(cur.col, Math.max(s - dm, 0), Math.min(en - dm, 1440));
    }
    function move(ev) {
      if (!moved && Math.abs(ev.clientY - y0) < 6 && Math.abs(ev.clientX - x0) < 6) return;
      if (!moved) { moved = true; blk.classList.add("moving"); document.body.classList.add("caldragging"); }
      if (resize) {
        var dm0 = day0Min, en = dm0 + calSnap(ev.clientY, col0, 15);
        en = Math.max(startMin + 15, Math.min(en, Math.max(dm0 + 1440, startMin + 15)));
        cur = { col: col0, start: startMin, end: en };
      } else {
        var col = colAt(ev.clientX), dm = calParse(col.getAttribute("data-newday")) / 60000;
        var s = dm + Math.round((calSnap(ev.clientY, col, 1) - grabOff) / 15) * 15;
        s = Math.max(dm, Math.min(s, dm + Math.max(0, 1440 - dur)));
        cur = { col: col, start: s, end: s + dur };
      }
      ghost(cur.start, cur.end);
    }
    function up() {
      document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up);
      if (!moved) return;
      calDragEnd();
      cols.forEach(function (c) { var g = c.querySelector(".calghost"); if (g) g.remove(); });
      blk.classList.remove("moving");
      if (cur.start === startMin && cur.end === endMin) return;
      calMoveSave(x, calFromMin(cur.start), calFromMin(cur.end));
    }
    document.addEventListener("pointermove", move); document.addEventListener("pointerup", up);
  }
  // month grid and the all-day strip: a chip onto another day
  function calDragChip(e, chip) {
    var x = calRowOf(chip), from = chip.closest("[data-day],[data-newday]"); if (!x || !from) return;
    var fromDay = from.getAttribute("data-day") || from.getAttribute("data-newday");
    var y0 = e.clientY, x0 = e.clientX, moved = false, over = null;
    function cellAt(ev) { var el = document.elementFromPoint(ev.clientX, ev.clientY); return el ? el.closest(".calcell[data-day],.calalc[data-newday],.calwd[data-day]") : null; }
    function move(ev) {
      if (!moved && Math.abs(ev.clientY - y0) < 6 && Math.abs(ev.clientX - x0) < 6) return;
      if (!moved) { moved = true; chip.classList.add("moving"); document.body.classList.add("caldragging"); }
      var c = cellAt(ev);
      if (c !== over) { if (over) over.classList.remove("drop"); over = c; if (over) over.classList.add("drop"); }
    }
    function up() {
      document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up);
      if (!moved) return;
      calDragEnd();
      chip.classList.remove("moving"); if (over) over.classList.remove("drop");
      var day = over && (over.getAttribute("data-day") || over.getAttribute("data-newday"));
      if (!day || day === fromDay) return;
      var delta = (calParse(day) - calParse(fromDay)) / 86400000, e0 = x.e;
      var shift = function (v) { return e0.allDay ? calAdd(v, delta) : calAdd(v.slice(0, 10), delta) + v.slice(10); };
      calMoveSave(x, shift(e0.start), shift(e0.end || e0.start));
    }
    document.addEventListener("pointermove", move); document.addEventListener("pointerup", up);
  }

  // ---- one event, in the side panel ------------------------------------------------------------------
  function calFind(id, src) {
    var list = src === "hive" ? (calState.layer === "hive" ? (calState.hive && calState.hive.hive && calState.hive.hive.events) : (calState.data && calState.data.hive && calState.data.hive.events)) : (calState.data && calState.data.calendar && calState.data.calendar.events);
    return (list || []).filter(function (e) { return e.id === id; })[0] || null;
  }
  function calOpenEvent(id, src, date, hour, seed) {
    var hiveLayer = calState.layer === "hive";
    var ev = id ? calFind(id, src || (hiveLayer ? "hive" : "school")) : null;
    var editable = hiveLayer ? calCanEdit() : (calCanEdit() && (!ev || src !== "hive"));
    if (id && !ev) return;
    var d = hiveLayer ? calState.hive : calState.data;
    var zone = (ev && ev.timeZone) || calDefaultZone();
    var e = ev || Object.assign({ title: "", allDay: false, start: (date || calToday()) + "T" + calPad(hour == null ? 9 : hour) + ":00", end: (date || calToday()) + "T" + (hour == null ? "10:00" : hour < 23 ? calPad(hour + 1) + ":00" : "23:59"), timeZone: zone, audience: [], location: "", description: "", link: "", meeting: "link", reminder: (d && d.defaults && d.defaults.reminder) != null ? d.defaults.reminder : 15, showAs: "free", targets: [] }, seed || {});
    var schoolName = hiveLayer ? "" : " · " + esc(dname(calState.domain));
    if (!editable) {
      panelOpen('<div class="ph"><span class="avatar">📅</span><h3>' + esc(e.title) + '</h3><button class="x" type="button" aria-label="close">✕</button></div><div class="pb">' +
        '<div class="kv"><span class="k">' + t("时间", "When") + "</span><span>" + calWhen(e) + "</span>" +
        '<span class="k">' + t("发给", "For") + "</span><span>" + esc(calForText(e, src === "hive" ? "hive" : "school")) + "</span>" +
        (e.location ? '<span class="k">' + t("地点", "Where") + "</span><span>" + esc(e.location) + "</span>" : "") +
        (e.link ? '<span class="k">' + t("会议链接", "Meeting link") + '</span><span><a href="' + esc(e.link) + '" target="_blank" rel="noopener">' + esc(e.link) + "</a></span>" : "") +
        '<span class="k">' + t("提醒", "Reminder") + "</span><span>" + esc(calRemindText(e.reminder)) + "</span>" +
        '<span class="k">' + t("显示为", "Shown as") + "</span><span>" + (e.showAs === "busy" ? t("忙碌", "Busy") : t("空闲", "Free")) + "</span>" +
        "</div>" +
        (e.description ? '<p style="white-space:pre-wrap;margin-top:10px">' + esc(e.description) + "</p>" : "") +
        '<p class="muted" data-keep style="font-size:12px;margin-top:10px">' + (e.targets ? t("来自校外的广播，只读。", "Broadcast from outside; read-only.") : t("只读：你没有编辑本校校历的权限。", "Read-only: you may not edit this calendar.")) + "</p></div>");
      return;
    }
    var tgAll = (e.targets || []).indexOf("*") >= 0;
    var schools = ((domainsInfo && domainsInfo.domains) || []);
    panelOpen('<div class="ph"><span class="avatar">📅</span><h3>' + (ev ? t("修改事件", "Change event") : t("添加事件", "Add event")) + (hiveLayer ? " · " + t("管理员广播", "Admin broadcast") : schoolName) + '</h3><button class="x" type="button" aria-label="close">✕</button></div>' +
      '<div class="pb"><form id="cef" autocomplete="off">' +
      '<label class="f">' + t("标题", "Title") + ' <span class="req">*</span><input type="text" id="ceTitle" maxlength="120" value="' + esc(e.title) + '" /></label>' +
      '<label class="chk" style="display:flex;margin:6px 0"><input type="checkbox" id="ceAll"' + (e.allDay ? " checked" : "") + " /> " + t("全天", "All day") + "</label>" +
      calWhenHTML("cewhen", e.allDay, e.start, e.end) +
      '<label class="f" id="ceZoneBox"' + (e.allDay ? " hidden" : "") + ">" + t("时区", "Time zone") + '<select id="ceZone">' + calZoneOptions(zone) + "</select></label>" +
      calWhoHTML(e, hiveLayer, schools, tgAll) +
      '<label class="f">' + t("会议链接", "Meeting link") + '<input type="url" id="ceLink" maxlength="500" placeholder="https://" value="' + esc(e.link) + '" /><small>' + t("可选。粘贴 Teams、Zoom 等会议的完整网址；事件写入日历后，大家点开就能加入。", "Optional. Paste the full address of a Teams, Zoom… meeting; people open the event in their calendar and join from it.") + "</small></label>" +
      '<label class="f">' + t("详细信息", "Details") + '<textarea id="ceDesc" rows="3" maxlength="2000" placeholder="' + esc(t("添加详细信息", "Add details")) + '">' + esc(e.description) + "</textarea></label>" +
      '<div class="grid2"><label class="f">' + t("提醒", "Reminder") + '<select id="ceRem">' + CAL_REMIND.map(function (k) { return '<option value="' + (k[0] == null ? "" : k[0]) + '"' + (k[0] === e.reminder ? " selected" : "") + ">" + esc(t(k[1], k[2])) + "</option>"; }).join("") + '</select></label><label class="f">' + t("显示为", "Show as") + '<select id="ceShow"><option value="free"' + (e.showAs !== "busy" ? " selected" : "") + ">" + t("空闲", "Free") + '</option><option value="busy"' + (e.showAs === "busy" ? " selected" : "") + ">" + t("忙碌", "Busy") + "</option></select><small>" + t("忙碌：这段时间在别人安排会议时显示为已占用。空闲：只显示在日历里，不挡会议安排（培训、通知一般选空闲）。", "Busy: the time shows as taken when people schedule meetings. Free: it only appears on the calendar and does not block scheduling (use Free for notices and training days).") + "</small></label></div>" +
      '<div class="actions"><button class="btn" type="submit" id="ceSave">' + t("保存", "Save") + "</button>" + (ev ? ' <button class="btn secondary sm" type="button" id="ceDel">' + t("删除", "Delete") + "</button>" : "") + '</div><div id="ceMsg"></div></form></div>');
    var wh = calWhenBind($("cewhen"));
    $("ceAll").addEventListener("change", function () {
      wh.allDay(this.checked); $("ceZoneBox").hidden = this.checked;
      // an all-day event keeps whatever zone it was saved with, which proves nothing: a timed one starts in the default (北京时间)
      if (!this.checked && ev && ev.allDay) $("ceZone").value = calDefaultZone();
    });
    var who = calWhoBind(e, hiveLayer);
    $("cef").addEventListener("submit", function (ev2) {
      ev2.preventDefault();
      var allDay = $("ceAll").checked, rem = $("ceRem").value;
      var out = { id: ev ? ev.id : undefined, title: $("ceTitle").value.trim(), allDay: allDay, start: calWhenValue($("cewhen")).start, end: calWhenValue($("cewhen")).end || calWhenValue($("cewhen")).start, timeZone: $("ceZone").value, audience: who.value().audience, teams: who.value().teams, people: who.value().people, location: ev ? ev.location || "" : "", description: $("ceDesc").value.trim(), link: $("ceLink").value.trim(), meeting: "link", reminder: rem === "" ? null : Number(rem), showAs: $("ceShow").value };
      if (hiveLayer) out.targets = who.value().targets;
      var missing = [];
      if (!out.title) missing.push(t("标题", "title"));
      if (!out.start) missing.push(t("开始时间", "start"));
      if (hiveLayer && !out.targets.length && !out.audience.length && !out.teams.length && !out.people.length) missing.push(t("发给谁（学校、身份、Teams 群组或账号）", "who it is for (a school, role, Teams group or account)"));
      if (missing.length) { $("ceMsg").innerHTML = '<div class="msg err">' + t("请填写：", "Please fill in: ") + esc(missing.join(EN ? ", " : "、")) + "</div>"; return; }
      var b = $("ceSave"); savingButton(b); $("ceMsg").innerHTML = "";
      var req = hiveLayer ? { layer: "hive", op: "save", event: out } : { domain: calState.domain, op: "save", event: out, timezone: out.timeZone };
      post("calendar", "POST", req).then(function (r) {
        if (!r.ok) { restoreButton(b); $("ceMsg").innerHTML = '<div class="msg err">' + esc(errText(r)).replace(/\n/g, "<br>") + ((r.body && r.body.problems && r.body.problems.length) ? "<ul style=\"margin:4px 0 0 18px\">" + r.body.problems.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>" : "") + "</div>"; return; }
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

  // ---- 发给谁: schools · roles · Teams groups · named accounts (Rick, 2026-10-17: 「选择学校、按角色、按 Teams 群组
  // 筛选，再加上输入账号」). Hive layer: schools (none = all schools when a role or group is chosen), roles and
  // groups narrow them, named accounts are added on top and may belong to any school. School layer: the school's
  // people narrowed by role and group, plus named accounts of the school. The lists come from the directory cache
  // (GET /api/calendar?lookup=audience); the count below is worked out here the way the server will.
  var calAud = { key: "", data: null, err: "" };
  function calAudKey() { return calState.layer === "hive" ? "hive" : "s:" + calState.domain; }
  function calAudLoad() {
    var key = calAudKey();
    if (calAud.key === key && calAud.data) return Promise.resolve(calAud.data);
    return api("calendar?lookup=audience&" + (calState.layer === "hive" ? "layer=hive" : "domain=" + encodeURIComponent(calState.domain))).then(function (r) {
      if (!r.ok) { calAud = { key: "", data: null, err: errText(r) }; return null; }
      calAud = { key: key, data: r.body, err: "" }; return r.body;
    });
  }
  function calAudEmpty() { return calAud.err ? calAud.err : calAud.data ? "" : t("正在载入…", "Loading…"); }
  function calAudCount(v, hive) {
    var data = calAud.data; if (!data) return null;
    var idx = [];
    v.teams.forEach(function (x) { data.teams.forEach(function (y, i) { if (y.id === x.id) idx.push(i); }); });
    var base = !hive || v.targets.length || v.audience.length || v.teams.length, set = {}, opt = {};
    ((hive && data.optout) || []).forEach(function (u) { opt[u] = 1; });
    data.people.forEach(function (p) {
      var inScope = !hive || !v.targets.length || v.targets.indexOf("*") >= 0 || v.targets.indexOf(p.d) >= 0;
      if (base && inScope && (!v.audience.length || v.audience.indexOf(p.i) >= 0) && (!v.teams.length || p.t.some(function (i) { return idx.indexOf(i) >= 0; }))) set[p.u] = 1;
    });
    v.people.forEach(function (u) { set[u] = 1; });
    var all = Object.keys(set), skipped = all.filter(function (u) { return opt[u]; }).length;
    return { n: all.length - skipped, skipped: skipped };
  }
  function calWhoHTML(e, hive, schools, tgAll) {
    var h = '<div id="cewho"><div class="f-title">' + t("发给谁", "Who gets it") + (hive ? ' <span class="req">*</span>' : "") + "</div>" +
      '<p class="muted" style="font-size:12px;margin:0 0 8px">' + (hive
        ? t("学校、身份、Teams 群组是一起筛选的（都要满足）；下面「另外加入的账号」不受筛选限制，可以来自任何学校。", "Schools, roles and Teams groups narrow each other (a person must match all you set); the named accounts below are added on top and may belong to any school.")
        : t("默认是本校所有人；选身份或 Teams 群组可以缩小范围，「另外加入的账号」再补上个别人。", "Everyone at this school by default; pick a role or Teams group to narrow it, and add individuals below.")) + "</p>";
    if (hive) h += '<div class="whobox"><b class="whotitle">' + t("学校", "Schools") + '</b><label class="chk" style="display:flex"><input type="checkbox" id="ceTgAll"' + (tgAll ? " checked" : "") + " /> <b>" + t("所有学校", "All schools") + '</b></label><div id="ceTg" class="whoschools">' + schools.map(function (s) { return '<label class="chk" style="display:flex"><input type="checkbox" data-tg="' + esc(s.domain) + '"' + (tgAll ? " disabled" : "") + ((e.targets || []).indexOf(s.domain) >= 0 ? " checked" : "") + " /> " + esc(dname(s.domain)) + "</label>"; }).join("") + "</div></div>";
    h += '<div class="whobox"><b class="whotitle">' + t("身份（不勾 = 不限）", "Role (none ticked = any)") + '</b><div id="ceAud" style="display:flex;gap:14px;flex-wrap:wrap">' + CAL_AUDIENCE.map(function (a) { return '<label class="chk"><input type="checkbox" data-aud="' + a + '"' + ((e.audience || []).indexOf(a) >= 0 ? " checked" : "") + " /> " + esc(EN ? CAL_AUDIENCE_EN[a] : a) + "</label>"; }).join("") + "</div></div>" +
      '<div class="whobox"><b class="whotitle">' + t("Teams 群组（可多选）", "Teams groups (any number)") + '</b><div class="calpick" id="ceTeams"><div class="chips"></div><input type="text" placeholder="' + esc(t("搜索 Teams 群组 / 班级…", "Search Teams groups / classes…")) + '" autocomplete="off" /><div class="calpickdd" hidden></div></div></div>' +
      '<div class="whobox"><b class="whotitle">' + t("另外加入的账号", "Named accounts") + '</b><div class="calpick" id="cePeople"><div class="chips"></div><input type="text" placeholder="' + esc(t("输入姓名或 Teams 账号，回车添加；可粘贴多个", "Type a name or Teams account, Enter to add; paste several")) + '" autocomplete="off" /><div class="calpickdd" hidden></div></div></div>' +
      '<div id="cesum" class="calsum" aria-live="polite"></div></div>';
    return h;
  }
  // A chip box with a suggestion list. opts: items() → the pickable things [{key,label,sub}], chips = the
  // selected [{key,label}], free(text) → keys typed in full (or null when typing is not allowed), onChange().
  function calPicker(box, opts) {
    var chipsEl = box.querySelector(".chips"), input = box.querySelector("input"), dd = box.querySelector(".calpickdd"), hi = -1, shown = [];
    function paint() {
      chipsEl.innerHTML = opts.chips.map(function (c, i) { return '<span class="calchip" title="' + esc(c.title || c.label) + '">' + esc(c.label) + ' <button type="button" data-rm="' + i + '" aria-label="' + esc(t("移除", "Remove")) + '">×</button></span>'; }).join("");
    }
    function close() { dd.hidden = true; hi = -1; }
    function add(item) { if (!opts.chips.some(function (c) { return c.key === item.key; })) { opts.chips.push(item); paint(); opts.onChange(); } input.value = ""; close(); }
    function list() {
      var q = input.value.trim().toLowerCase();
      var have = {}; opts.chips.forEach(function (c) { have[c.key] = 1; });
      shown = opts.items().filter(function (x) { return !have[x.key] && (!q || (x.label + " " + (x.sub || "") + " " + x.key).toLowerCase().indexOf(q) >= 0); }).slice(0, 8);
      var emptyMsg = opts.empty ? opts.empty() : "";
      if (!opts.items().length && emptyMsg) { dd.innerHTML = '<div class="calpickmsg">' + esc(emptyMsg) + "</div>"; dd.hidden = false; return; }
      if (!shown.length) { dd.innerHTML = q ? '<div class="calpickmsg">' + esc(t("没有匹配的结果", "No match")) + "</div>" : ""; dd.hidden = !q; return; }
      hi = Math.min(Math.max(hi, 0), shown.length - 1);
      dd.innerHTML = shown.map(function (x, i) { return '<div class="calpickopt' + (i === hi ? " on" : "") + '" data-i="' + i + '"><span>' + esc(x.label) + "</span>" + (x.sub ? '<small>' + esc(x.sub) + "</small>" : "") + "</div>"; }).join("");
      dd.hidden = false;
    }
    function typed(text) {
      if (!opts.free) return false;
      var r = opts.free(text); if (!r) return false;
      r.added.forEach(function (it) { if (!opts.chips.some(function (c) { return c.key === it.key; })) opts.chips.push(it); });
      if (r.added.length) { paint(); opts.onChange(); }
      input.value = ""; close();
      if (opts.note) opts.note(r.unknown);
      return true;
    }
    chipsEl.addEventListener("click", function (ev) { var b = ev.target.closest("button[data-rm]"); if (!b) return; opts.chips.splice(+b.getAttribute("data-rm"), 1); paint(); opts.onChange(); });
    input.addEventListener("input", function () { hi = 0; list(); });
    input.addEventListener("focus", function () { list(); });
    input.addEventListener("blur", function () { setTimeout(close, 120); });
    input.addEventListener("keydown", function (ev) {
      if (ev.key === "ArrowDown") { ev.preventDefault(); hi = Math.min(shown.length - 1, hi + 1); list(); }
      else if (ev.key === "ArrowUp") { ev.preventDefault(); hi = Math.max(0, hi - 1); list(); }
      else if (ev.key === "Escape") { close(); }
      else if (ev.key === "Enter" || ev.key === "," || ev.key === ";") {
        var txt = input.value.trim();
        ev.preventDefault(); // Enter in these boxes never submits the form
        if (!txt) return;
        if (/@/.test(txt) && typed(txt)) return;
        if (shown[hi] && !dd.hidden) add(shown[hi]);
      }
      else if (ev.key === "Backspace" && !input.value && opts.chips.length) { opts.chips.pop(); paint(); opts.onChange(); }
    });
    input.addEventListener("paste", function (ev) {
      var txt = (ev.clipboardData && ev.clipboardData.getData("text")) || "";
      if (opts.free && /[\s,;，；]/.test(txt.trim()) && /@/.test(txt)) { ev.preventDefault(); typed(txt); }
    });
    dd.addEventListener("mousedown", function (ev) { var o = ev.target.closest(".calpickopt"); if (o) { ev.preventDefault(); add(shown[+o.getAttribute("data-i")]); } });
    paint();
    return { paint: paint, list: list };
  }
  function calWhoBind(e, hive) {
    var teamsSel = (e.teams || []).map(function (x) { return { key: x.id, label: x.name || x.id.slice(0, 8), name: x.name || "" }; });
    var peopleSel = (e.people || []).map(function (u) { return { key: u, label: u }; });
    var sum = $("cesum"), note = "";
    function value() {
      var tgAll = $("ceTgAll");
      return {
        targets: !$("ceTg") ? [] : tgAll && tgAll.checked ? ["*"] : Array.prototype.slice.call($("ceTg").querySelectorAll("input[data-tg]:checked")).map(function (c) { return c.getAttribute("data-tg"); }),
        audience: Array.prototype.slice.call($("ceAud").querySelectorAll("input[data-aud]:checked")).map(function (c) { return c.getAttribute("data-aud"); }),
        teams: teamsSel.map(function (x) { return { id: x.key, name: x.name }; }),
        people: peopleSel.map(function (x) { return x.key; })
      };
    }
    function refresh() {
      var v = value(), fake = { targets: v.targets, audience: v.audience, teams: v.teams, people: v.people };
      var cnt = calAudCount(v, hive), n = cnt ? cnt.n : null, words = calForText(fake, hive ? "hive" : "school");
      var none = hive && !v.targets.length && !v.audience.length && !v.teams.length && !v.people.length;
      sum.innerHTML = none ? '<span class="muted">' + t("请选择发给谁。", "Choose who it is for.") + "</span>" : "<b>" + t("发给：", "For: ") + "</b>" + esc(words) + (n == null ? "" : ' <span class="calsumn">≈ ' + n + " " + t("人", n === 1 ? "person" : "people") + "</span>") + (cnt && cnt.skipped ? '<div class="faint" style="font-size:12px;margin-top:3px">' + t("另有 " + cnt.skipped + " 人在「广播名单」里，不会收到。", cnt.skipped + (cnt.skipped === 1 ? " person is" : " people are") + " on the Broadcast opt-out list and will not receive it.") + "</div>" : "") + (note ? '<div class="msg err" style="margin-top:6px">' + esc(note) + "</div>" : "");
    }
    var tgAll = $("ceTgAll");
    if (tgAll) tgAll.addEventListener("change", function () { $("ceTg").querySelectorAll("input[data-tg]").forEach(function (c) { c.disabled = tgAll.checked; if (tgAll.checked) c.checked = false; }); refresh(); });
    $("cewho").addEventListener("change", function (ev) { if (ev.target.matches("input[type=checkbox]")) refresh(); });
    refresh();
    var tp = calPicker($("ceTeams"), { chips: teamsSel, onChange: refresh, items: function () { return calAud.data ? calAud.data.teams.map(function (x) { return { key: x.id, label: x.name || x.id.slice(0, 8), name: x.name, sub: (x.kind === "class" ? t("班级", "class") : "Team") + " · " + x.count + t(" 人", " members") + (x.domains.length > 1 || hive ? " · " + x.domains.map(function (d) { return dname(d); }).join(EN ? ", " : "、") : "") }; }) : []; }, empty: calAudEmpty });
    var pp = calPicker($("cePeople"), {
      chips: peopleSel, onChange: refresh,
      items: function () { return calAud.data ? calAud.data.people.map(function (x) { return { key: x.u, label: x.n ? x.n + " · " + x.u : x.u, sub: (hive ? dname(x.d) + " · " : "") + (x.i || "") }; }) : []; },
      empty: calAudEmpty,
      free: function (text) {
        var known = {}; if (calAud.data) calAud.data.people.forEach(function (x) { known[x.u] = x; });
        var added = [], unknown = [];
        text.split(/[\s,;，；]+/).map(function (x) { return x.trim().toLowerCase(); }).filter(Boolean).forEach(function (u) {
          if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(u)) { unknown.push(u); return; }
          if (calAud.data && !known[u]) { unknown.push(u); return; }
          added.push({ key: u, label: u });
        });
        return { added: added, unknown: unknown };
      },
      note: function (unknown) { note = unknown.length ? t("找不到这些账号（只能发给蜂巢里已有的账号）：", "Not found among the accounts Hive knows: ") + unknown.join(", ") : ""; refresh(); }
    });
    calAudLoad().then(function () { refresh(); });
    return { value: value };
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
  // The schools a run visits. School layer: this school. Hive layer: the server names them (every school with a
  // cached account list plus those with named accounts); with a test-run list, only the schools of those accounts.
  async function calSyncJobs() {
    if (calState.layer !== "hive") return [{ layer: "school", domain: calState.domain }];
    var only = calSyncOnly();
    var r = await post("calendar", "POST", { layer: "hive", op: "syncdomains", only: only || undefined });
    if (!r.ok) throw new Error(errText(r));
    return (r.body.domains || []).map(function (d) { return { layer: "hive", domain: d }; });
  }
  // 发布: the panel opened by the button at the top right
  function calSyncOpen() {
    calSync.out = []; calSync.progress = null;
    panelOpen('<div class="ph"><span class="avatar">📤</span><h3>' + t("发布到接收人的 Teams 和 Outlook 日历", "Publish to the receivers' Teams and Outlook calendars") + (calState.layer === "hive" ? "" : " · " + esc(dname(calState.domain))) + '</h3><button class="x" type="button" aria-label="close">✕</button></div><div class="pb"><div id="calsync"></div></div>');
    calSyncRender();
  }
  function calSyncOnly() { return (calSync.only || "").trim(); }
  function calSyncCard() {
    var hive = calState.layer === "hive";
    var h = '<div id="calsynccard">' +
      '<p class="sub">' + (hive
        ? t("把广播写进「发给谁」里每个人的 Outlook 和 Teams 日历，不发邮件。事件改了或删了，再点一次「发布」，大家的日历才会更新。", "Puts each broadcast on the Outlook and Teams calendars of the people it is for. No email is sent. After you change or delete an event, publish again.")
        : t("把本校校历写进本校账号的 Outlook 和 Teams 日历，不发邮件。事件改了或删了，再点一次「发布」，大家的日历才会更新。", "Puts this school's calendar on its accounts' Outlook and Teams calendars. No email is sent. After you change or delete an event, publish again.")) + "</p>";
    h += '<label class="f">' + t("只发布给这些账号（测试用，可留空）", "Only these accounts (for a test run — may be empty)") + '<input type="text" id="calonly" placeholder="' + (hive ? "name@school.edu, name2@other.edu" : "teacher1@" + esc(calState.domain)) + '" value="' + esc(calSync.only) + '" /><small>' + t("填一两个账号（用逗号隔开）先试；确认日历里的样子没问题，再清空、发布给全部账号。", "Name one or two accounts (comma-separated) to try first; once the calendar looks right, clear it and publish to everyone.") + "</small></label>" +
      '<div class="actions"><button class="btn secondary sm" type="button" id="calPlan"' + (calSync.busy ? " disabled" : "") + ">" + t("查看待发布", "Preview") + '</button> <button class="btn" type="button" id="calGo"' + (calSync.busy ? " disabled" : "") + ">" + t("发布", "Publish") + '</button> <button class="btn secondary sm" type="button" id="calWithdraw"' + (calSync.busy ? " disabled" : "") + ">" + t("撤回已写入的", "Withdraw what was written") + "</button></div>" +
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
        h += esc(t("待发布：新增 ", "To publish: add ") + (c.create || 0) + t("、更新 ", ", update ") + (c.update || 0) + t("、移除 ", ", remove ") + (c.delete || 0)) + (n ? "" : " " + t("— 已经是最新的。", "— already up to date.")) + '<div class="faint" style="font-size:12px">' + esc(t("账号 ", "Accounts ") + o.accounts + t(" 个，事件 ", ", events ") + o.events + t(" 个，已写入 ", ", written ") + o.written + (o.gone ? t("；用户自己删除的副本 ", "; copies people deleted ") + o.gone : "") + (o.excluded ? t("；因「广播名单」排除 ", "; left out by the opt-out list ") + o.excluded : "")) + "</div>";
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
    var on = $("calonly"); if (on) on.addEventListener("input", function () { calSync.only = on.value; });
    $("calPlan").addEventListener("click", function () { calSyncRun("syncplan"); });
    $("calGo").addEventListener("click", function () { calSyncRun("sync"); });
    $("calWithdraw").addEventListener("click", function () {
      var only = calSyncOnly();
      if (!window.confirm(only ? t("从这些账号的日历里撤回这一层写入的事件？", "Withdraw the events this layer wrote from these accounts' calendars?") : t("从所有账号的日历里撤回这一层写入的事件？（学校自己的校历和管理员广播互不影响。）", "Withdraw the events this layer wrote from all the accounts' calendars? (The school calendar and the Admin broadcast never touch each other.)"))) return;
      calSyncRun("withdraw");
    });
  }
  function calSyncPaint() { var o = $("calsyncout"); if (o) o.innerHTML = calSyncOut(); }
  function calSyncButtons(off) { ["calPlan", "calGo", "calWithdraw"].forEach(function (id) { if ($(id)) $(id).disabled = off; }); }
  // One school and layer at a time; the loop ends when nothing is left or a batch moved nothing.
  async function calSyncRun(op) {
    calMsg("");
    calSync.busy = true; calSync.out = []; calSync.progress = null; calSyncButtons(true);
    var jobs;
    try { jobs = await calSyncJobs(); } catch (err) { calSync.busy = false; calSyncButtons(false); calMsg(String((err && err.message) || err), true); return; }
    if (!jobs.length) { calSync.busy = false; calSyncButtons(false); calMsg(t("没有可发布的学校：账号列表还没读取，或填写的账号不在任何学校里。", "No school to publish to: no account list has been read yet, or the accounts you named belong to no school."), true); return; }
    var only = calSyncOnly();
    for (var i = 0; i < jobs.length; i++) {
      var j = jobs[i], base = { domain: j.domain, layer: j.layer };
      if (only) { var mine = only.split(/[\s,;，；]+/).map(function (x) { return x.trim().toLowerCase(); }).filter(function (x) { return x && x.slice(x.indexOf("@") + 1) === j.domain; }); if (!mine.length) continue; base.only = mine.join(","); }
      var res = { domain: j.domain, kind: op === "syncplan" ? "plan" : "run", withdraw: op === "withdraw", t: { created: 0, updated: 0, deleted: 0 } };
      calSync.out.push(res);
      try {
        var r = await post("calendar", "POST", Object.assign({}, base, { op: "syncplan", withdraw: op === "withdraw" }));
        if (!r.ok) { res.error = errText(r); calSyncPaint(); continue; }
        if (op === "syncplan") { Object.assign(res, r.body); calSyncPaint(); continue; }
        var total = op === "withdraw" ? r.body.counts.delete : r.body.counts.create + r.body.counts.update + r.body.counts.delete, doneN = 0, first = true;
        for (;;) {
          calSync.progress = { text: (jobs.length > 1 ? dname(j.domain) + " · " : "") + (op === "withdraw" ? t("正在撤回…", "Withdrawing…") : t("正在发布…", "Publishing…")) + " " + doneN + " / " + total, max: Math.max(total, 1), value: doneN }; calSyncPaint();
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
