// UI strings. Data values from Airtable are already bilingual and shown as-is.
window.I18N = {
  zh: {
    brandTag: "以线上资源推动C教育生态重建",
    brandValues: ["开放", "自治", "协作"],
    menuLabel: "菜单",
    comingSoon: "即将上线",
    langBtn: "EN",
    // Two step sequences, because the stage decides the shape of the flow:
    // 修辞/高中 adds the graduation track and its credit requirements, the other
    // two stages go straight from 学段 to the catalog.
    steps: ["教育理念", "学段", "毕业路径", "毕业学分要求", "课程地图", "选择课程", "提交订单"],
    stepsShort: ["教育理念", "学段", "课程地图", "选择课程", "提交订单"],
    step0Title: "第二步：请选择学段",
    step0Hint: "请选择孩子所处的学段。名称随所选教育理念显示；每张卡片都标注对应年级。",
    stageNeedPedagogy: "请先选择教育理念。",
    step1Title: "请选择毕业路径",
    step1Hint: "仅{stage}需要选择毕业路径。三种路径只能选择一种，点击卡片查看说明。",
    modes: {
      international: { name: "国际路径", desc: "以英文课程为主的国际方向，面向海外大学申请。" },
      domestic: { name: "国内路径", desc: "以中文课程为主的国内方向。" },
      hybrid: { name: "混合 2+2 路径", desc: "高中与社区大学双学分（Dual-Enrollment）结合的 2+2 方向。" },
    },
    step2Title: "第一步：请选择教育理念",
    step2Hint: "请选择您为孩子采用的教育方式。这一选择决定后续学段的称呼与课程范围。",
    pedagogies: {
      // The classical card is just the trivium — the three words are the whole
      // definition, and they are also exactly what the next page calls the three
      // stages, so the choice made here explains the vocabulary that follows it.
      // A sentence explaining the trivium was cut as 啰嗦 (Rick, 2026-09-11).
      // The non-classical card is defined by what it rests on (a biblical
      // worldview) rather than by one course on the timetable.
      classical: { name: "古典教育", desc: "文法、逻辑、修辞。" },
      nonclassical: { name: "非古典教育", desc: "基于圣经世界观的常规课程体系。" },
    },
    step3Title: "毕业学分要求",
    step3Hint: "以下为所选路径的毕业学分要求，请仔细阅读后点击下一步。",
    reqSubject: "学科",
    reqCredits: "所需学分",
    // Unit shown after every credit number on the requirements page. English
    // needs both forms so "1 credit" doesn't read as "1 credits"; Chinese has
    // one form. See creditsWithUnit() in assets/app.js.
    creditsUnit: "学分",
    creditsUnitOne: "学分",
    reqAvailable: "门可选",
    totalCredits: "总学分",
    serviceHours: "社区服务（小时）",
    policyTitle: "毕业政策说明",
    // Curriculum map (internal step 6). {n} placeholders are filled in app.js.
    mapTitle: "课程地图",
    mapHint: "横向为年级，纵向为学科：每格是该年级该学科计划的课程与教材。绿色标记表示蜂巢现有可选课程；点击任一格查看全部内容。",
    mapMore: "+{n}",
    mapAvail: "{n} 门可选",
    mapPlanned: "计划课程与教材",
    mapCourses: "蜂巢可选课程",
    mapNoCourses: "该年级该学科暂无可选课程，敬请期待。",
    mapEmpty: "该学段的课程地图即将上线。",
    step4Title: "选择课程",
    step4Hint: "点击卡片查看课程详情；点击“选择”按钮加入订单。可组合筛选，价格从低到高排列。",
    step4HintShort: "以下为该学段的课程。点击卡片查看详情；点击“选择”按钮加入订单。",
    filters: { subject: "学科", grade: "年级", language: "授课语言", classType: "课程类型", teacher: "授课老师", all: "全部" },
    clearGrades: "清除所选",
    searchLabel: "快速搜索",
    searchPh: "输入关键词，如：中文、math、生物…",
    resultCount: "门课程",
    cardName: "课程名",
    cardCode: "课程代码",
    cardAbout: "课程简介",
    cardTeacher: "授课老师",
    cardTime: "上课时间",
    noCourses: "没有符合筛选条件的课程。",
    noCoursesTrack: "该学段的课程即将上线，敬请期待。",
    priceTBD: "价格待定",
    scheduleTBD: "时间待定",
    classes: "课时",
    select: "选择",
    selectedBtn: "已选 ✓",
    details: "查看详情",
    selected: "已选",
    coursesUnit: "门课程",
    total: "合计",
    nextStep: "下一步",
    back: "上一步",
    confirmSelection: "确认所选课程",
    // the cart sheet, opened from the bottom bar's summary or the header cart
    cartTitle: "已选课程",
    cartLabel: "购物车",
    cartView: "查看",
    cartEmpty: "尚未选择课程。",
    // Shown when a parent comes back to a selection made on an earlier visit.
    cartSavedToday: "今天所选",
    cartSavedYesterday: "昨天所选",
    cartSavedDays: "{n} 天前所选",
    cartDropped: "其中 {n} 门课程已下架，已自动移除。",
    // course detail modal
    dCode: "课程编号",
    dSubject: "学科",
    dGrades: "适用年级",
    dLanguage: "授课语言",
    dClassType: "课程类型",
    dNumClasses: "课时数",
    dCreditHours: "学分",
    dSchedule: "上课时间",
    dTeachers: "授课老师",
    dPrice: "课程价格",
    dSchool: "课程提供方",
    dTextbooks: "教材",
    dPrereq: "前置课程",
    dAcademic: "学术课程",
    dComments: "备注",
    dSyllabus: "课程大纲",
    dDescription: "课程介绍",
    dDownload: "下载",
    dClose: "关闭",
    yes: "是",
    minutesUnit: "分钟",
    // teacher modal
    tTeacher: "教师简介",
    tExpertise: "专业特长",
    tSubjects: "教授学科",
    tLanguages: "授课语言",
    tCourseTypes: "课程类型",
    tGrades: "授课年级",
    tOrg: "所属机构",
    tCourses: "所授课程",
    step5Title: "确认并提交订单",
    step5Hint: "请核对所选课程，填写联系方式后提交。提交后我们会通过邮件与您联系，付款与入学事宜将由课程所属蜂巢与您单独完成。",
    orderSummary: "订单明细",
    remove: "移除",
    emailLabel: "联系邮箱（必填）",
    emailPh: "example@gmail.com",
    emailNote: "请使用 Gmail、Outlook、Yahoo 等国际邮箱。QQ、163、新浪等邮箱暂不支持。",
    teamsLabel: "EquipMe Teams 账号（选填）",
    teamsPh: "您的 Teams 账号",
    submitOrder: "提交订单",
    submitting: "正在提交…",
    doneTitle: "订单已提交！",
    doneDesc: "我们已收到您的选课订单，稍后会通过邮件与您联系。请保存您的订单编号：",
    doneAgain: "确认",
    stepNeedEarlier: "请先完成前面的步骤",
    stepNeedCart: "请先选择至少一门课程",
    errEmail: "请输入有效的邮箱地址。",
    errEmailDomain: "暂不支持 QQ、163、新浪等邮箱，请使用 Gmail、Outlook、Yahoo 等国际邮箱。",
    errEmpty: "请至少选择一门课程。",
    errRate: "提交过于频繁，请稍后再试。",
    // Distinct messages per failure cause. A single generic message made a
    // real outage indistinguishable from a typo, so each server-side error
    // now says what actually happened and what the parent can do about it.
    errNotify: "订单未能送达，我们的通知系统暂时不可用。请稍后重试，或直接与我们联系。",
    errSnapshot: "课程数据暂时不可用，请稍后重试。",
    errCourseGone: "订单中有课程已下架，请返回课程列表重新选择。",
    errGeneric: "提交失败，请稍后重试。",
    loadErr: "课程数据尚未发布，请稍后访问。",
    loading: "正在加载…",
    // G.P.A. calculator (/gpa) — an independent tool: it reads nothing from
    // the graduation tracks and uploads nothing; see assets/gpa.js.
    gpa: {
      title: "G.P.A. 计算器",
      // Terse on purpose, Rick's wording (2026-09-16), after gpacalculator.net.
      hint: "成绩可按字母等级或百分制输入；评分标准可自行修改；非学术类课程不参与 GPA 计算；数据可打印，不会上传存档。",
      sheetHint: "非学术课程（如圣经、艺术、体育、音乐）一般采用形成性评估，不参与 G.P.A. 计算 —— 在“类别”中标为非学术即可，其学分仍计入总学分。",
      tabs: ["评分标准", "课程与成绩"],
      startStep1Hint: "默认为常见的美国高中标准（A 从 93 分起，荣誉课 +0.5，双学分课 / 大学先修课 +1.0）。如学校采用不同标准，请先点“编辑”。确认后进入下一步。",
      scope: "仅供高中课程",
      next: "下一步",
      levelsNote: "普通课 = CP（College Prep）大学预备课；荣誉课 = Honors；双学分课 = Dual Enrollment 高中与大学双学分课；大学先修课 = AP（Advanced Placement）。",
      // Our own rule, not the common calculators' (they weight by credits only):
      // one course, five periods a week, one semester = 0.5 credit; other
      // period counts in proportion. An estimate for the credit total; the GPA
      // itself is unaffected by the unit.
      unitNote: "学分与每周课时的默认换算：一门课每周上 5 节、持续一学期，计 0.5 学分；其他节数按比例折算（如 4 节 = 0.4 学分）。这只影响学分合计，不影响 GPA；学校的学分规定若不同，请直接按学分输入。",
      gradeN: "{n} 年级",
      colGradeYear: "年级",
      colTerm: "学期",
      termFall: "上学期",
      termSpring: "下学期",
      periodMeta: "{w} {unit} · {n} 门课程",
      periodNoGrades: "{w} {unit} · 尚无成绩",
      colCourse: "课程",
      colWeight: "学分",
      colPeriods: "每周课时",
      colGrade: "成绩",
      colLevel: "课程级别",
      colType: "类别",
      colPoints: "绩点",
      // Full Chinese names in the dropdown, the same words as the scale's
      // column heads: most Chinese parents do not know what CP or AP means
      // (Rick, 2026-09-17). Longer, so the column is wider.
      levelCP: "普通课",
      levelHonors: "荣誉课",
      levelAP: "大学先修课",
      levelDual: "双学分课",
      academic: "学术",
      nonAcademic: "非学术",
      gradeNone: "—",
      gradePass: "P",
      gradePlaceholder: "如 91",
      addCourse: "添加课程",
      addPeriod: "添加学期",
      removePeriod: "删除该学期",
      removePeriodConfirm: "删除该学期及其中的 {n} 门课程？",
      cumulative: "累计 GPA",
      unweightedTag: "/ 4.0 · 不加权",
      math: "{p} 绩点 ÷ {w} {unit}",
      weighted: "加权 GPA",
      totalCredits: "总学分",
      print: "打印 / PDF",
      clear: "清空",
      clearConfirm: "清空所有课程与成绩？评分标准会保留。",
      confirmOk: "确定",
      confirmCancel: "取消",
      scaleTitle: "评分标准",
      scaleGrade: "等级",
      scaleMin: "起始分",
      // Column heads name the course kinds in full (Rick, 2026-09-16); the row
      // dropdown keeps the short CP / 荣誉 / AP / 双学分 with levelsNote as its tooltip.
      // "课", not "课程" — Chinese readers get it (Rick, 2026-09-17).
      scaleCP: "普通课",
      scaleHonors: "荣誉课",
      scaleAP: "双学分课 / 大学先修课",
      scaleNote: "P = 通过，计学分不计绩点；非学术课程同样只计学分。",
      scaleEdit: "编辑",
      scaleEditTitle: "编辑评分标准",
      scaleEditHint: "起始分为该等级的最低百分制分数；普通课 / 荣誉课 / 双学分课·大学先修课 为各级别课程的绩点。修改后所有课程绩点即时重算。",
      scaleAdd: "添加等级",
      scaleReset: "恢复默认",
      done: "完成",
      // The column heads are the switches: 学分 | 课时 and 字母 | 百分.
      settingLetter: "字母成绩",
      settingPercent: "百分数成绩",
      settingCredits: "学分",
      settingPeriods: "课时/周",
      unitCredits: "学分",
      unitPeriods: "课时/周",
      studentLabel: "学生姓名（可选）",
      schoolLabel: "学校或机构名称（可选）",
      printSchool: "学校 / 机构",
      printTitle: "G.P.A. 成绩计算表",
      printStudent: "学生",
      printedOn: "打印日期",
    },
  },
  en: {
    brandTag: "Rebuilding the C-education ecosystem with online resources",
    brandValues: ["Open", "Autonomous", "Collaborative"],
    menuLabel: "Menu",
    comingSoon: "Coming soon",
    langBtn: "中文",
    steps: ["Pedagogy", "Learning Stage", "Track", "Credit Requirements", "Curriculum Map", "Courses", "Submit"],
    stepsShort: ["Pedagogy", "Learning Stage", "Curriculum Map", "Courses", "Submit"],
    step0Title: "Step 2: Choose a learning stage",
    step0Hint: "Stage names follow the pedagogy you chose; every card shows the grades it covers.",
    stageNeedPedagogy: "Choose a pedagogy first.",
    step1Title: "Choose a graduation track",
    step1Hint: "Only {stage} chooses a graduation track. Pick one; click a card for details.",
    modes: {
      international: { name: "International Track", desc: "English-language curriculum aimed at overseas university admission." },
      domestic: { name: "Domestic Track", desc: "Primarily Chinese-language curriculum." },
      hybrid: { name: "Hybrid 2+2 Track", desc: "High school combined with community-college dual-enrollment credits (2+2)." },
    },
    step2Title: "Step 1: Choose your pedagogy",
    step2Hint: "Which approach do you use to educate your child? This decides what the stages are called and which courses follow.",
    pedagogies: {
      classical: { name: "Classical", desc: "Grammar, Dialectic, Rhetoric." },
      nonclassical: { name: "Non-Classical", desc: "A conventional curriculum built on a biblical worldview." },
    },
    step3Title: "Graduation credit requirements",
    step3Hint: "Credit requirements for your selected track. Please read carefully, then continue.",
    reqSubject: "Subject",
    reqCredits: "Credits required",
    creditsUnit: "credits",
    creditsUnitOne: "credit",
    reqAvailable: "available",
    totalCredits: "Total credits",
    serviceHours: "Community service (hours)",
    policyTitle: "Graduation policy notes",
    mapTitle: "Curriculum Map",
    mapHint: "Grades across, subjects down: each cell is the planned curriculum for that subject in that year. A green mark means Fengchao offers a course for it now; tap any cell to see everything in it.",
    mapMore: "+{n}",
    mapAvail: "{n} available",
    mapPlanned: "Planned curriculum",
    mapCourses: "Available on Fengchao",
    mapNoCourses: "No course for this subject and grade yet.",
    mapEmpty: "The curriculum map for this stage is coming soon.",
    step4Title: "Choose courses",
    step4Hint: "Click a card for full details; use the Select button to add it to your order. Combine filters as needed; sorted by price (low to high).",
    step4HintShort: "Courses for this stage. Click a card for details; use the Select button to add it to your order.",
    filters: { subject: "Subject", grade: "Grade", language: "Language", classType: "Class type", teacher: "Teacher", all: "All" },
    clearGrades: "Clear",
    searchLabel: "Quick search",
    searchPh: "Type a keyword: Chinese, math, biology…",
    resultCount: "courses",
    cardName: "Course",
    cardCode: "Course ID",
    cardAbout: "About",
    cardTeacher: "Teacher",
    cardTime: "Schedule",
    noCourses: "No courses match the current filters.",
    noCoursesTrack: "Courses for this stage are coming soon.",
    priceTBD: "Price TBD",
    scheduleTBD: "Time TBD",
    classes: "classes",
    select: "Select",
    selectedBtn: "Selected ✓",
    details: "View details",
    selected: "Selected",
    coursesUnit: "course(s)",
    total: "Total",
    nextStep: "Next",
    back: "Back",
    confirmSelection: "Confirm selection",
    cartTitle: "Selected courses",
    cartLabel: "Cart",
    cartView: "View",
    cartEmpty: "No courses selected yet.",
    cartSavedToday: "chosen today",
    cartSavedYesterday: "chosen yesterday",
    cartSavedDays: "chosen {n} days ago",
    cartDropped: "{n} of them are no longer offered and have been removed.",
    dCode: "Course ID",
    dSubject: "Subject",
    dGrades: "Grades",
    dLanguage: "Language",
    dClassType: "Class type",
    dNumClasses: "Number of classes",
    dCreditHours: "Credit hours",
    dSchedule: "Schedule",
    dTeachers: "Teacher(s)",
    dPrice: "Price",
    dSchool: "Course Deliverer",
    dTextbooks: "Textbook(s)",
    dPrereq: "Prerequisite",
    dAcademic: "Academic course",
    dComments: "Notes",
    dSyllabus: "Syllabus",
    dDescription: "Description",
    dDownload: "Download",
    dClose: "Close",
    yes: "Yes",
    minutesUnit: "min",
    tTeacher: "Teacher Profile",
    tExpertise: "Expertise",
    tSubjects: "Subjects",
    tLanguages: "Languages",
    tCourseTypes: "Course types",
    tGrades: "Grade levels",
    tOrg: "Organization",
    tCourses: "Courses taught",
    step5Title: "Review and submit",
    step5Hint: "Review your selection and enter contact details. After submitting, we will contact you by email; payment and admission are handled directly with the hive offering each course.",
    orderSummary: "Order summary",
    remove: "Remove",
    emailLabel: "Contact email (required)",
    emailPh: "example@gmail.com",
    emailNote: "Please use an international provider such as Gmail, Outlook, or Yahoo. QQ, 163, Sina and similar mailboxes are not supported.",
    teamsLabel: "EquipMe Teams account (optional)",
    teamsPh: "Your Teams account",
    submitOrder: "Submit order",
    submitting: "Submitting…",
    doneTitle: "Order submitted!",
    doneDesc: "We have received your course order and will contact you by email. Please keep your order ID:",
    doneAgain: "Confirm",
    stepNeedEarlier: "Complete the earlier steps first",
    stepNeedCart: "Choose at least one course first",
    errEmail: "Please enter a valid email address.",
    errEmailDomain: "QQ, 163, Sina and similar mailboxes are not supported — please use Gmail, Outlook, Yahoo or another international provider.",
    errEmpty: "Please select at least one course.",
    errRate: "Too many submissions; please try again later.",
    errNotify: "Your order could not be delivered — our notification system is temporarily unavailable. Please try again shortly, or contact us directly.",
    errSnapshot: "Course data is temporarily unavailable. Please try again shortly.",
    errCourseGone: "A course in your order is no longer available. Please go back to the course list and reselect.",
    errGeneric: "Submission failed; please try again.",
    loadErr: "Course data has not been published yet. Please check back soon.",
    loading: "Loading…",
    gpa: {
      title: "G.P.A. Calculator",
      hint: "Grades as letters or percentages; the grading scale is editable; non-academic courses are left out of the GPA; printable, nothing is uploaded.",
      sheetHint: "Non-academic courses (Bible, art, PE, music…) are usually assessed formatively and left out of the G.P.A. — mark them Other under Type; their credits still count in the total.",
      tabs: ["Grading scale", "Courses & grades"],
      startStep1Hint: "The default is the common US high-school scale (A from 93, Honors +0.5, AP / Dual Enrollment +1.0). If your school uses different cutoffs, edit it first, then continue.",
      scope: "High-school courses only",
      next: "Next",
      levelsNote: "CP = College Prep (regular); Honors; AP = Advanced Placement; Dual Enrollment = high-school courses earning college credit.",
      unitNote: "Default conversion between credits and periods per week: a course meeting five times a week for one semester earns 0.5 credit; other counts in proportion (4 periods = 0.4). This affects only the credit total, never the GPA; if your school awards credit differently, enter credits directly.",
      gradeN: "Grade {n}",
      colGradeYear: "Grade",
      colTerm: "Term",
      termFall: "Fall",
      termSpring: "Spring",
      periodMeta: "{w} {unit} · {n} courses",
      periodNoGrades: "{w} {unit} · no grades yet",
      colCourse: "Course",
      colWeight: "Credits",
      colPeriods: "Periods per week",
      colGrade: "Grade",
      colLevel: "Course level",
      colType: "Type",
      colPoints: "Points",
      levelCP: "CP",
      levelHonors: "Honors",
      levelAP: "AP",
      levelDual: "Dual Enr.",
      academic: "Acad.",
      nonAcademic: "Other",
      gradeNone: "—",
      gradePass: "P",
      gradePlaceholder: "e.g. 91",
      addCourse: "Add course",
      addPeriod: "Add semester",
      removePeriod: "Remove this semester",
      removePeriodConfirm: "Remove this semester and its {n} courses?",
      cumulative: "Cumulative GPA",
      unweightedTag: "/ 4.0 · unweighted",
      math: "{p} points ÷ {w} {unit}",
      weighted: "Weighted GPA",
      totalCredits: "Total credits",
      print: "Print / PDF",
      clear: "Clear",
      clearConfirm: "Clear every course and grade? The grading scale is kept.",
      confirmOk: "OK",
      confirmCancel: "Cancel",
      scaleTitle: "Grading scale",
      scaleGrade: "Grade",
      scaleMin: "From",
      scaleCP: "College Prep",
      scaleHonors: "Honors",
      scaleAP: "AP / Dual Enrollment",
      scaleNote: "P = pass: credit, no grade points; non-academic courses likewise count credit only.",
      scaleEdit: "Edit",
      scaleEditTitle: "Edit grading scale",
      scaleEditHint: "From = the lowest percentage for that letter; CP / Honors / AP·Dual are the grade points for each course level. Every course recalculates as you edit.",
      scaleAdd: "Add grade",
      scaleReset: "Restore defaults",
      done: "Done",
      settingLetter: "Letter",
      settingPercent: "Percent",
      settingCredits: "Credits",
      settingPeriods: "Periods/wk",
      unitCredits: "credits",
      unitPeriods: "periods/wk",
      studentLabel: "Student name (optional)",
      schoolLabel: "School or institution (optional)",
      printSchool: "School / institution",
      printTitle: "G.P.A. Calculation Sheet",
      printStudent: "Student",
      printedOn: "Printed",
    },
  },
};

// NOTE: window.SUBJECT_GROUPS was removed 2026-08-27. It existed to collapse
// ~20 fine-grained Airtable subjects into 6 broad areas for the filter
// dropdown. That is no longer needed: the base now tags every course with one
// of a small set of real categories (Math, Chinese, English, Science, Social
// Studies, ESL, Bible/Theology), each carrying its own English and Chinese
// name, so the filter is built straight from the data. Ordering lives in
// SUBJECT_ORDER in assets/app.js.
//
// 2026-09-02: the base grew a second, coarser grouping on top of this — the
// Course Subject table's "Subject filter"/"学科筛选键值" fields — so several
// real categories (e.g. Chinese Literature / Chinese Writing / Chinese
// Language Art) can share one "Chinese" filter bucket while each course still
// shows its own precise subject name. The FILTER dropdown/matching uses that
// grouping (subjectFilterKey()/subjectFilterLabel() in assets/app.js); course
// cards, the detail view and search results still use the plain subject name
// (subjectLabel()). SUBJECT_ORDER above is keyed by the filter bucket name.

// Grade stages for the grade filter. The Grades table has 17 rows (Pre-K
// through "Associate of Arts Degree"), far too many for one dropdown — parents
// think in stages. Boundaries are taken from the base's own course coding, not
// invented: G7 is where the CH-MS-/SCI-MS- (middle school) courses start, G9
// where the -HS- courses start, and the Grades table's own English equivalency
// column maps "Associate of Arts Degree" to "1st Year College".
//
// Only the page language is shown, never both at once. All five stages are
// always offered, whether or not courses are tagged into them yet. Course cards
// and the detail view still show the exact grades from Airtable — this grouping
// is for the filter only. A grade not listed here still appears in the filter
// under its own name, so adding a row in Airtable can never hide courses.
//
// `groups` (optional) merges several of a stage's grades into ONE filter entry,
// for grades parents don't distinguish between when choosing a course. K1/K2/K3
// are the case that prompted it: a parent thinks "K", not "K2". A grade that is
// in no group is offered on its own. A group's `key` is the stored filter value,
// so it must not collide with a real grade name or a stage key.
// The three learning stages a parent chooses between, in order. This is the
// site's top-level division of the curriculum and it decides the shape of the
// rest of the wizard: only `rhetoric` has graduation tracks and credit
// requirements, because G9 is where tracks begin. The boundaries were chosen so
// the stage a parent picks lines up exactly with that seam (decided 2026-09-11).
//
// Each stage carries TWO name sets. Classical families read the trivium
// (文法 / 逻辑 / 修辞); everyone else reads the conventional school names
// (小学 / 初中 / 高中). They are alternative vocabularies for the same division,
// not translations of each other — which is the evidence the division is right:
// both systems land on it independently. `range` is shown on every card in both
// vocabularies, so a parent who does not know the trivium still cannot pick the
// wrong one.
//
// `grades` is the authoritative grade set for the stage: it scopes the catalog,
// the grade filter and (later) the curriculum map. A course belongs to a stage
// when its own grades intersect this set.
//
// The DESCRIPTION belongs to the name set, not to the stage (Rick, 2026-09-11).
// The trivium is not just three labels — it is a claim about how a child learns
// at each age, so "逻辑思辨与论证训练" describes 逻辑阶段, not 初中. A family
// reading 小学 / 初中 / 高中 has not signed up for that pedagogy and must not be
// told their child's middle-school years are for dialectic training. One shared
// description cannot serve both; each vocabulary carries its own.
window.LEARNING_STAGES = [
  {
    key: "grammar",
    range: "K–G6",
    grades: ["Pre-K", "K1", "K2", "K3", "G1", "G2", "G3", "G4", "G5", "G6"],
    classical: {
      zh: "文法阶段", en: "Grammar Stage",
      descZh: "幼儿园至六年级：文法阶段重在记诵与基本功——中文母语课、科学启蒙、英语基础等，直接浏览选课。",
      descEn: "Kindergarten through Grade 6: the Grammar stage builds memory and fundamentals — Chinese language arts, early science, English foundations. Browse the catalog directly.",
    },
    standard: {
      zh: "小学", en: "Elementary",
      descZh: "幼儿园至六年级：中文母语课、科学启蒙、英语基础等，直接浏览选课。",
      descEn: "Kindergarten through Grade 6: Chinese language arts, early science, English foundations — browse the catalog directly.",
    },
  },
  {
    key: "dialectic",
    range: "G7–G8",
    grades: ["G7", "G8"],
    classical: {
      zh: "逻辑阶段", en: "Dialectic Stage",
      descZh: "七至八年级：逻辑思辨与论证训练，直接浏览选课。",
      descEn: "Grades 7–8: reasoning, argument and analysis — browse the catalog directly.",
    },
    standard: {
      zh: "初中", en: "Middle School",
      descZh: "七至八年级：初中各科课程，直接浏览选课。",
      descEn: "Grades 7–8: the middle-school subjects — browse the catalog directly.",
    },
  },
  {
    key: "rhetoric",
    range: "G9–G12",
    grades: ["G9", "G10", "G11", "G12", "Associate of Arts Degree"],
    classical: {
      zh: "修辞阶段", en: "Rhetoric Stage",
      descZh: "九至十二年级：先选择毕业路径，查看毕业学分要求后选课。",
      descEn: "Grades 9–12: choose a graduation track and review its credit requirements, then pick courses.",
    },
    standard: {
      zh: "高中", en: "High School",
      descZh: "九至十二年级：先选择毕业路径，查看毕业学分要求后选课。",
      descEn: "Grades 9–12: choose a graduation track and review its credit requirements, then pick courses.",
    },
  },
];

window.GRADE_STAGES = [
  {
    key: "preschool", zh: "幼儿", en: "Preschool",
    members: ["Pre-K", "K1", "K2", "K3"],
    // K1/K2/K3 are offered as a single "K" — parents choose between
    // kindergarten and Grade 1, not between K1 and K2.
    groups: [{ key: "K", zh: "K", en: "K", members: ["K1", "K2", "K3"] }],
    // `hidden` keeps a grade OUT OF THE FILTER while leaving it in `members`,
    // which is what places its courses in a level (see courseInLevel). Pre-K is
    // not offered as a choice: a Pre-K course still appears in the K-8 catalog
    // under 全部/All, it just isn't separately filterable. Dropping the grade
    // from `members` instead would strand those courses in no level at all.
    hidden: ["Pre-K"],
  },
  { key: "elementary",  zh: "小学",     en: "Elementary",    members: ["G1", "G2", "G3", "G4", "G5", "G6"] },
  { key: "middle",      zh: "初中",     en: "Middle School", members: ["G7", "G8"] },
  { key: "high",        zh: "高中",     en: "High School",   members: ["G9", "G10", "G11", "G12"] },
  { key: "college-prep", zh: "大学预科", en: "Pre-College",  members: ["Associate of Arts Degree"] },
];

// The class-type filter's three fixed choices, in display order. Like
// GRADE_STAGES this list is fixed rather than data-derived: all three are
// always offered, so the filter doesn't change shape between tracks (no K-8
// course is currently Prerecorded, which used to make 录播课 disappear there).
// `value` is the English string as it appears in Airtable and is the stable
// filter key; comparisons are dash/case normalized, so the Unicode minus in
// "Self−Paced Course" still matches.
//
// "Live or Recorded Course" is deliberately absent — courses carrying it stay
// visible under 全部/All and still show their real type on the card.
// Subject labels that should not use the Chinese name from Airtable. Keyed by
// the English subject name. Renaming 科目 to "ESL" in the base would make this
// entry unnecessary.
// Weekdays. The Course table's "Day of Week" is a multiple select holding
// English names, so the Chinese side is supplied here rather than in Airtable.
// `enShort` keeps the compact course card from wrapping; the detail view uses
// the full name. Saturday and Sunday are included so adding them as options in
// Airtable needs no code change.
window.WEEKDAYS = {
  Monday:    { zh: "周一", en: "Monday",    enShort: "Mon" },
  Tuesday:   { zh: "周二", en: "Tuesday",   enShort: "Tue" },
  Wednesday: { zh: "周三", en: "Wednesday", enShort: "Wed" },
  Thursday:  { zh: "周四", en: "Thursday",  enShort: "Thu" },
  Friday:    { zh: "周五", en: "Friday",    enShort: "Fri" },
  Saturday:  { zh: "周六", en: "Saturday",  enShort: "Sat" },
  Sunday:    { zh: "周日", en: "Sunday",    enShort: "Sun" },
};
// Canonical week order, so display never depends on the order the options were
// picked in Airtable.
window.WEEKDAY_ORDER = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];

// ---------------------------------------------------------------------------
// Site menus. Items with a `url` link out (external links open in a new tab;
// `mailto:` opens the mail client). Items without one are placeholders for
// features that still need a form, storage, an approval step and a write back
// into Airtable — they render disabled with a "coming soon" tag rather than
// linking nowhere, so the menu shows the full plan without pretending the
// feature exists.
// A top-level entry with its own `url` and no `items` is a plain link in the
// nav bar rather than a dropdown — used for destinations that have nothing to
// group under them (教材 / Textbooks).
window.SITE_MENUS = [
  { zh: "教材", en: "Textbooks", url: "https://www.equipme.cloud/product-types/" },
  {
    zh: "教育工具", en: "Tools",
    items: [
      // First in the list (Rick, 2026-09-17). Moved out of 教育服务 on
      // 2026-08-29 — a tool, not a service; live since 2026-09-16 as an
      // in-site page (assets/gpa.js), routed in place by renderNav().
      { zh: "G.P.A. 计算器",    en: "G.P.A. Calculator",              url: "/gpa" },
      { zh: "微软教育版 Teams 申请", en: "Apply for Microsoft Teams for Education", url: "https://forms.cloud.microsoft/Pages/ResponsePage.aspx?id=YjX6OPezEUazbzF-ulKacADKLAZmiVxPnCKPmH-ambpURUFKRUtTSU8ySDBTSUdKNVZOWEZUU0xNSS4u" },
      { zh: "联系我们",         en: "Contact Us",                     url: "mailto:info@fengchao.life" },
    ],
  },
  {
    zh: "教育服务", en: "Services",
    items: [
      { zh: "大学项目",       en: "College Programs" },
      { zh: "国际C学校",      en: "International C-Schools" },
      { zh: "标化考试",       en: "Standardized Tests" },
      { zh: "双学分课程",     en: "Dual-Enrollment Courses" },
      { zh: "成绩单认证（仅对蜂巢团体开放）", en: "Transcript Certification (Hive groups only)" },
    ],
  },
  {
    zh: "蜂巢生态", en: "Hive Ecosystem",
    items: [
      { zh: "我要教课",     en: "I Want to Teach" },
      { zh: "我要找课",     en: "Find a Course" },
      { zh: "加入已有蜂巢", en: "Join an Existing Hive" },
      { zh: "创建新蜂巢",   en: "Start a New Hive" },
    ],
  },
  // Last, right of 蜂巢生态 (Rick, 2026-09-21). Customer-facing pages only —
  // anything administrative stays out of this repo.
  {
    zh: "帮助", en: "Help",
    items: [
      // A real page, not an SPA route: renderNav()'s click handler lets a
      // root-relative .html href load normally instead of routing it.
      { zh: "Teams 安装和身份验证", en: "Teams Setup & Sign-in", url: "/help/teams-setup.html" },
    ],
  },
];

window.SUBJECT_LABEL_ZH = { "ESL": "ESL" };

window.CLASS_TYPES = [
  { value: "Live Course",       zh: "直播课",         en: "Live Course" },
  { value: "Prerecorded Course", zh: "录播课",        en: "Prerecorded Course" },
  { value: "Self-Paced Course", zh: "自定义进度课程", en: "Self-Paced Course" },
];

// Bilingual labels for the requirements table rows (fixed field set).
window.REQ_LABELS = {
  math: { zh: "数学", en: "Math" },
  science: { zh: "科学", en: "Science" },
  english: { zh: "英语", en: "English" },
  chinese: { zh: "中文", en: "Chinese" },
  social: { zh: "社会学", en: "Social Studies" },
  // 修辞/Rhetoric was deleted from the base 2026-09-03, so it is no longer
  // named here. The Track table's column was renamed to match on 2026-09-11
  // ("Bible & Theology Credits"); the config matches either spelling.
  bible: { zh: "圣经 / 神学", en: "Bible / Theology" },
  speaking: { zh: "公众演讲", en: "Public Speaking" },
  secondLang: { zh: "第二外语", en: "Second Foreign Language" },
  fineArts: { zh: "艺术", en: "Fine Arts" },
  pe: { zh: "体育", en: "Physical Education" },
  elective: { zh: "选修", en: "Electives" },
};

// Which Course Subject rows satisfy each graduation-requirement row, used to
// list the actual available courses under each row on the requirements page
// (renderStep3 in assets/app.js). Keyed by the REQ_LABELS keys above, which are
// also the keys the sync publishes in each track's `credits` object.
//
// Matched against the course's **Subject**, not its "Subject filter" bucket,
// and that distinction is load-bearing: History buckets under Social Studies
// for catalog filtering, but History is an elementary subject and must NOT
// count toward the high-school Social Studies requirement. Bucket-matching
// would silently pull it in.
//
// Matching is tolerant (see reqCourses/normSubj in assets/app.js): case,
// whitespace and full-width punctuation are ignored, either language matches,
// and any one of the listed spellings is enough — so renaming a subject in
// Airtable does not have to break this immediately.
//
// Policy, confirmed by Rick 2026-09-03, for HIGH SCHOOL programs:
//   · ESL counts toward Electives, NOT English.
//   · History is elementary-only; excluded from Social Studies.
//   · Rhetoric was deleted from the base.
//   · Public Speaking and Physical Education have no subject of their own, so
//     they are deliberately absent below — those rows show their credit
//     requirement with no course list, rather than repeating the elective list.
// A key that is missing here, or whose subjects match nothing currently
// available, renders no course list at all.
//
// NOTE: Music, Art and Third Language were added to Airtable on 2026-09-03 but
// do not appear in the snapshot yet. The sync only publishes subjects that at
// least one course is actually tagged with (see api/sync/index.js), so the
// Fine Arts and Second Foreign Language rows stay bare until courses carry
// those subjects and a re-sync runs. That is expected, not a bug.
window.REQ_SUBJECTS = {
  math:       ["Math", "数学"],
  science:    ["Science", "科学"],
  // "English Foundations" was renamed "English Language Art" 2026-09-07; both
  // are listed so a snapshot from either side of the rename resolves.
  english:    ["English Language Art", "English Foundations", "English Writing", "English Literature",
               "英文基础", "英文写作", "英文文学"],
  chinese:    ["Chinese Language Art", "Chinese Writing", "Chinese Literature",
               "中文基础", "中文写作", "中文文学"],
  social:     ["Social Studies", "社科"],
  // Added 2026-09-03. This row was left unmapped on the understanding that
  // no Public Speaking subject existed -- then "EWR-HS-302 Introduction to
  // Public Speaking" appeared in the base. Listing the spellings costs
  // nothing if no such subject exists: the row simply stays bare, exactly as
  // it does today. Note the course code prefix is EWR (English Writing), so
  // if that course is tagged English Writing rather than Public Speaking it
  // will surface under the English requirement instead -- worth checking.
  speaking:   ["Public Speaking", "公众演讲", "演讲"],
  // The one row matched by Subject FILTER as well as by subject name (Rick,
  // 2026-09-13). The combined "Bible/Theology" subject was split into separate
  // Bible / Theology rows, which left this list matching nothing at all and the
  // row showing no available courses even though three Bible courses exist —
  // the third silent rename to break this page. The "Bible" bucket is the
  // durable key: whatever Rick tags into it counts toward the credit, and the
  // names below keep working whether or not Theology and Rhetoric are moved
  // into that bucket too. The old combined spellings stay for an old snapshot.
  bible:      { buckets:  ["Bible", "圣经"],
                subjects: ["Bible", "Theology", "Rhetoric", "圣经", "神学", "修辞学",
                           "Bible/Theology", "圣经/神学"] },
  // The subject is "Third Languages" (plural) / 第二外语 — the singular
  // spellings that used to be here matched nothing, so the four Third Languages
  // courses appeared under no requirement row at all. Old spellings kept as
  // tolerance in case the row is renamed back.
  // Latin moved out of Third Languages into its own "Classical Language" subject
  // (2026-09-11), which left Latin I/II under no requirement row at all. A
  // classical track's 2 second-language credits are exactly what Latin is for,
  // so the subject is listed here; the trailing-L typo spelling is tolerated.
  secondLang: ["Third Languages", "第二外语", "Classical Language", "Classical LanguageL", "拉丁语",
               "Third Language", "第三语言", "第三外语"],
  fineArts:   ["Music", "Art", "音乐", "艺术", "美术"],
  pe:         ["PE", "体育"],
  // Only courses whose SUBJECT is Electives. ESL used to be listed here, which
  // is why three ESL courses showed up under 选修 on the requirements page —
  // ESL is its own subject and is not a graduation requirement, so it now
  // appears on no requirement row (the catalog is unaffected). If ESL should
  // count toward electives, tag those courses Electives in Airtable rather than
  // re-adding the mapping here.
  // Singular "Elective/选修" is the subject's name today; the plural spellings
  // are kept as tolerance, exactly as with Third Language(s) before it.
  elective:   ["Elective", "选修", "Electives", "选修课"],
};

// ---- G.P.A. calculator data (assets/gpa.js) --------------------------------
// One grading scale with a grade-point column per course level, the structure
// of CEFF's SIS table (Title / Breakoff / Standard GP / Honors-AP GP) widened
// to three levels. Breakoffs are the common US 93/90/87… cutoffs; the level
// columns carry the conventional +0.5 (Honors) and +1.0 (AP/IB) bumps, and D/F
// get no bump. One set of breakoffs for every level on purpose: a 90 is an A-
// in any course; the level changes the points, not the letter (Rick, 2026-09-16).
// `min` is the lowest percentage for that letter; F's 0 catches everything below D.
window.GPA_SCALE_DEFAULT = [
  { g: "A",  min: 93, cp: 4.0, h: 4.5, ap: 5.0 },
  { g: "A-", min: 90, cp: 3.7, h: 4.2, ap: 4.7 },
  { g: "B+", min: 87, cp: 3.3, h: 3.8, ap: 4.3 },
  { g: "B",  min: 83, cp: 3.0, h: 3.5, ap: 4.0 },
  { g: "B-", min: 80, cp: 2.7, h: 3.2, ap: 3.7 },
  { g: "C+", min: 77, cp: 2.3, h: 2.8, ap: 3.3 },
  { g: "C",  min: 73, cp: 2.0, h: 2.5, ap: 3.0 },
  { g: "C-", min: 70, cp: 1.7, h: 2.2, ap: 2.7 },
  { g: "D",  min: 65, cp: 1.0, h: 1.0, ap: 1.0 },
  { g: "F",  min: 0,  cp: 0,   h: 0,   ap: 0 },
];
