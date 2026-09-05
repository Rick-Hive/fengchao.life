// UI strings. Data values from Airtable are already bilingual and shown as-is.
window.I18N = {
  zh: {
    brandTag: "以线上资源推动C教育生态重建",
    brandValues: ["开放", "自治", "协作"],
    menuLabel: "菜单",
    comingSoon: "即将上线",
    langBtn: "EN",
    steps: ["学段", "毕业路径", "教育理念", "毕业学分要求", "选择课程", "提交订单"],
    stepsK8: ["学段", "教育理念", "选择课程", "提交订单"],
    step0Title: "第一步：请选择学段",
    step0Hint: "请选择孩子所处的学段。小学与初中课程可直接浏览选课；高中课程需先选择毕业路径。",
    levels: {
      k8: { name: "小学 · 初中（K–G8）", desc: "幼儿园至八年级课程：中文母语课、科学系列、英语等，直接进入课程列表。" },
      hs: { name: "高中（G9–G12）", desc: "九至十二年级课程：先选择毕业路径与教育理念，查看毕业学分要求后选课。" },
    },
    step1Title: "请选择毕业路径",
    step1Hint: "三种路径只能选择一种。点击卡片查看说明并选择。",
    modes: {
      international: { name: "国际路径", desc: "以英文课程为主的国际方向，面向海外大学申请。" },
      domestic: { name: "国内路径", desc: "以中文课程为主的国内方向。" },
      hybrid: { name: "混合 2+2 路径", desc: "高中与社区大学双学分（Dual-Enrollment）结合的 2+2 方向。" },
    },
    step2Title: "请选择教育理念",
    step2Hint: "请选择您为孩子采用的教育方式。",
    pedagogies: {
      classical: { name: "古典教育", desc: "包含神学与修辞（Theology & Rhetoric）课程的古典基督教教育传统。" },
      nonclassical: { name: "非古典教育", desc: "以圣经（Bible）课程为核心的常规课程体系。" },
    },
    step3Title: "毕业学分要求",
    step3Hint: "以下为所选路径的毕业学分要求，请仔细阅读后点击下一步。",
    reqSubject: "学科",
    reqCredits: "所需学分",
    reqAvailable: "门可选",
    totalCredits: "总学分",
    serviceHours: "社区服务（小时）",
    policyTitle: "毕业政策说明",
    step4Title: "选择课程",
    step4Hint: "点击卡片查看课程详情；点击“选择”按钮加入订单。可组合筛选，价格从低到高排列。",
    step4HintK8: "以下为小学与初中（K–G8）课程。点击卡片查看详情；点击“选择”按钮加入订单。",
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
    noCoursesTrack: "该学段/路径的课程即将上线，敬请期待。",
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
    dSchool: "开课机构",
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
  },
  en: {
    brandTag: "Rebuilding the C-education ecosystem through online resources",
    brandValues: ["Open", "Autonomous", "Collaborative"],
    menuLabel: "Menu",
    comingSoon: "Coming soon",
    langBtn: "中文",
    steps: ["Level", "Track", "Pedagogy", "Credit Requirements", "Courses", "Submit"],
    stepsK8: ["Level", "Pedagogy", "Courses", "Submit"],
    step0Title: "Step 1: Choose a school level",
    step0Hint: "Elementary and middle school courses can be browsed directly; high school starts with a graduation track.",
    levels: {
      k8: { name: "Elementary & Middle (K–G8)", desc: "Kindergarten through Grade 8: Chinese language arts, science series, English and more — go straight to the catalog." },
      hs: { name: "High School (G9–G12)", desc: "Grades 9–12: choose a graduation track and pedagogy, review credit requirements, then pick courses." },
    },
    step1Title: "Choose a graduation track",
    step1Hint: "Only one track can be selected. Click a card to see details and choose.",
    modes: {
      international: { name: "International Track", desc: "English-language curriculum aimed at overseas university admission." },
      domestic: { name: "Domestic Track", desc: "Primarily Chinese-language curriculum." },
      hybrid: { name: "Hybrid 2+2 Track", desc: "High school combined with community-college dual-enrollment credits (2+2)." },
    },
    step2Title: "Choose your pedagogy",
    step2Hint: "Which approach do you use to educate your child?",
    pedagogies: {
      classical: { name: "Classical", desc: "Classical Christian tradition, including Theology & Rhetoric courses." },
      nonclassical: { name: "Non-Classical", desc: "Conventional curriculum centered on Bible courses." },
    },
    step3Title: "Graduation credit requirements",
    step3Hint: "Credit requirements for your selected track. Please read carefully, then continue.",
    reqSubject: "Subject",
    reqCredits: "Credits required",
    reqAvailable: "available",
    totalCredits: "Total credits",
    serviceHours: "Community service (hours)",
    policyTitle: "Graduation policy notes",
    step4Title: "Choose courses",
    step4Hint: "Click a card for full details; use the Select button to add it to your order. Combine filters as needed; sorted by price (low to high).",
    step4HintK8: "Elementary & middle school (K–G8) courses. Click a card for details; use the Select button to add it to your order.",
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
    noCoursesTrack: "Courses for this level/track are coming soon.",
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
    dSchool: "School / Institution",
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
window.GRADE_STAGES = [
  {
    key: "preschool", zh: "幼儿", en: "Preschool",
    members: ["Pre-K", "K1", "K2", "K3"],
    groups: [{ key: "K", zh: "K", en: "K", members: ["K1", "K2", "K3"] }],
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
    zh: "教育工具", en: "Educational Tools",
    items: [
      { zh: "微软教育版 Teams", en: "Microsoft Teams for Education", url: "https://forms.cloud.microsoft/r/TeG4ZH4U4E" },
      { zh: "学生信息系统",     en: "Student Information System",     url: "https://bridge.opensis.com/" },
      { zh: "Moodle LMS",       en: "Moodle LMS",                     url: "https://learn.qiaoliang.online/" },
      { zh: "数字版权管理和分发系统", en: "Digital Rights Management & Distribution", url: "https://view.protectedpdf.com/portal/BES/LogIn" },
      // Moved out of 教育服务 (Rick, 2026-08-29): it is a tool, not a service.
      { zh: "G.P.A. 计算器",    en: "G.P.A. Calculator" },
      { zh: "联系我们",         en: "Contact Us",                     url: "mailto:contact@fengchao.life" },
    ],
  },
  {
    zh: "教育服务", en: "Educational Services",
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
  // named here. The Track table's column is still "Bible & Theology & Rhetoric
  // Credits" — that is the data source's name, not what parents are shown.
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
  english:    ["English Foundations", "English Writing", "English Literature",
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
  bible:      ["Bible/Theology", "圣经/神学"],
  secondLang: ["Third Language", "第三语言", "第三外语"],
  fineArts:   ["Music", "Art", "音乐", "艺术", "美术"],
  elective:   ["Electives", "选修课", "ESL"],
};
