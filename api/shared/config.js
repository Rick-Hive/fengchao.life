// Central configuration: Airtable table IDs and field names.
// Field names were captured from the live "Hive/蜂巢" base (2026-08-25, re-verified 2026-08-26).
// If a field is renamed in Airtable, fix it HERE only.
// NOTE: `re:` entries are regex prefixes used where Airtable's UI truncates the
// exact name — the sync matches the first field whose name matches the regex.

module.exports = {
  baseId: process.env.AIRTABLE_BASE_ID || "appgYiHg9pm6hcRgv",

  tables: {
    tracks:       { id: "tbltFG1wvhlxdMNCm", display: "Track ID" },
    courses:      { id: "tblWTiOgX1pM40U4A", display: "Course Name/课程名称" },
    // Course Subject table. "Subject Name" is English, "学科" is Chinese —
    // two separate columns, so a subject resolves to a language pair. The
    // Chinese column was renamed from "科目" to "学科" during the 2026-08-29
    // table restructuring (12 consolidated categories); the old name is kept
    // below only as a comment so the history isn't lost. The "Abbreviation/
    // 简写" column was removed from this table in the same restructuring —
    // abbreviations for the ~20 fine-grained subject codes now live in their
    // own "Course Abbreviation/课程简写" table, which nothing on the site
    // reads (subject.abbr was never displayed anywhere), so `abbr` below is
    // left pointing at a name that will simply resolve empty going forward.
    // "Subject filter" / "学科筛选键值" were added 2026-09-02: several
    // fine-grained subjects (e.g. Chinese Literature / Chinese Writing /
    // Chinese Language Art) can share one coarser filter bucket ("Chinese")
    // without losing their precise name on the course card/detail view. See
    // subjectFilterKey()/subjectFilterLabel() in assets/app.js.
    subjects:     { id: "tblvQaPpgBRZSuT48", display: "Subject Name", displayZh: "学科", abbr: "Abbreviation/简写", filterEn: "Subject filter", filterZh: "学科筛选键值" },
    grades:       { id: "tblQBtt6PSLLGeULf", display: "Title/年级名称" },
    teachers:     { id: "tbltGNxS4Hdy2YiGA", display: "Name / 姓名" },
    classPeriods: { id: "tblaC1VEnTdYvCFOo" },
    textbooks:    { id: "tblboTRWTZ8cKvv1a" },
    schools:      { id: "tblRVfq00Q5QKkR5h" },
    // Customer-facing message copy (order confirmation email, Teams
    // notification), edited in Airtable rather than in code so wording changes
    // don't need a deploy. Addressed BY NAME, not by table id, so creating a
    // table with this name is all that's needed — no config change. The sync
    // treats a missing table as "not set up yet" and the API falls back to the
    // built-in defaults in api/shared/messages.js, so the site keeps working
    // whether or not this table exists.
    templates:    { id: process.env.AIRTABLE_TEMPLATES_TABLE || "Message Templates/消息模板", optional: true },
  },

  // One row per (key, language). Body/Subject support {{placeholders}} —
  // see PLACEHOLDERS in api/shared/messages.js for the list.
  templateFields: {
    key: /^(Key|键|模板)/i,
    language: /^(Language|语言)/i,
    subject: /^(Subject|标题|主题)/i,
    body: /^(Body|正文|内容)/i,
  },

  trackFields: {
    trackId: "Track ID",
    // "毕业路径" (added 2026-09-02) is the Chinese name of the track, alongside
    // the existing English-only "Track Name" — same split-column pattern as
    // Course Name/课程名称 etc. `name` stays the English side.
    name: "Track Name",
    nameZh: "毕业路径",
    totalCredits: "Total Credits/总学分",
    serviceHours: "Community Service Hours/社区服务小时",
    comments: "Comments/备注",
    // subject-credit columns shown on the requirements page, in display order
    credits: [
      { field: "Math Credits", key: "math" },
      { field: "Science Credits", key: "science" },
      { field: "English Credits", key: "english" },
      { field: "Chinese Credits", key: "chinese" },
      { field: "Social Studies Credits", key: "social" },
      { field: "Bible & Theology & Rhetoric Credits", key: "bible" },
      { field: "Public Speaking Credits", key: "speaking" },
      { field: "Second Foreign Languages", key: "secondLang" },
      { field: "Fine Arts", key: "fineArts" },
      { field: "Physical Education", key: "pe" },
      { field: "Elective/选修", key: "elective" },
    ],
  },

  // The pseudo-track that tags all K–G8 (non-graduation-track) courses.
  k8TrackId: 7,

  courseFields: {
    code: "Course ID/课程编号",
    // Course Name was split into two separate fields (2026-08-27): English and
    // Chinese are now distinct columns, not one bilingual "EN/ZH" field. The
    // site picks whichever matches the current page language (see courseName()
    // in assets/app.js), falling back to the other if one is blank.
    nameEn: "Course Name",
    nameZh: "课程名称",
    tracks: "Graduation Track/毕业路径",
    // Course Description was split into two separate fields (2026-08-28), same
    // pattern as Course Name / Class Type / Teaching Language: the site picks
    // whichever matches the current page language, falling back to the other.
    descriptionEn: "Course Description",
    descriptionZh: "课程描述",
    // Number field, e.g. 0.5 / 1.0 — added 2026-08-28.
    creditHours: "Credit Hours",
    // Class Type and Teaching Language were each split into two single-language
    // fields (2026-08-27), same as Course Name. Verified live values:
    //   Class Type        Live Course / Live or Recorded Course /
    //                     Prerecorded Course / Self-Paced Course
    //   课程类型            直播课 / 直播或录播课 / 录播课 / 自定义进度课程
    //   Teaching Language English / Chinese      授课语言  英语 / 中文
    classTypeEn: "Class Type",
    classTypeZh: "课程类型",
    grades: "Grade/年级",
    languageEn: "Teaching Language",
    languageZh: "授课语言",
    price: "Course Price/课程价格",
    numClasses: "Number of Classes/课时数",
    teachers: "Teacher/授课老师",
    classTime: "Class time/上课时间",   // now a LINK to Class Periods
    // Multiple select on the Course table: Monday…Friday (English values).
    // Weekdays are a property of the course, not of the class period, so they
    // are read here and rendered alongside every period's time.
    daysOfWeek: "Day of Week",
    // "Subject" (EN) and "学科" (ZH) are TWO independent link fields that both
    // point at the same Course Subject table — 学科 just displays the 科目
    // column instead of the primary field. Both carry record IDs via the API,
    // so the sync reads both and unions them by record ID; the language pair
    // comes from the linked subject record, not from which field it came in on.
    subjects: "Subject",
    subjectsZh: "学科",
    textbooks: "Textbook SKU/教材编码", // LINK to Textbook table
    school: "School or Institution/学校或机构",
    available: "Available/可用？",
    // regex-matched (UI truncation / uncertain punctuation):
    re: {
      syllabus: /^Syllabus/i,            // attachment field
      prerequisite: /^Presiquisite|^Prerequisite/i, // text ("N/A", spelling as in base)
      academic: /^Academic Course/i,     // checkbox
      comments: /^Comments/i,            // long text
      // Pedagogy checkbox (2026-08-27, requested but NOT YET ADDED to the
      // base) — same pattern as "Academic Course?": a plain checkbox, checked
      // for Classical courses, left blank for Non-Classical (the default).
      // Needed so K-8 can filter by pedagogy the same way HS does via track,
      // even though K-8 has no graduation track split. Until this field
      // exists in Airtable, f() finds nothing and every course reads as
      // Non-Classical (blank), which is the correct default, not an error.
      classical: /^Classical Course/i,
    },
  },

  // Teachers table: ONLY these fields are ever written into the public snapshot.
  // Email, Teams Account and Additional Information are intentionally excluded.
  teacherFields: {
    id: /^Teacher ID/i,
    name: /^Name/i,
    photo: /^Photo/i,          // attachment -> mirrored to blob storage
    bio: /^Biography/i,
    expertise: /^Expertise/i,
    subjects: /^Subject\(s\)/i,
    languages: /^Language\(s\)/i,
    courseTypes: /^Course Type/i,
    gradeLevels: /^Grade Level/i,
    organization: /^Organization/i,
  },

  classPeriodFields: {
    number: /^Class Number/i,
    title: /^Title/i,
    shortName: /^Short Name/i,
    start: /^Start Time/i,
    end: /^End Time/i,
    minutes: /^Length/i,
    // Single line text, e.g. "10:50 - 11:35". This is the field the Course
    // table's "Class time/上课时间" link shows, so it is what parents expect to
    // see; the site prefers it over composing the range from start/end.
    range: /^Class Start-?End/i,
  },

  // Textbook table: public-safe fields only (sales/order fields never synced).
  textbookFields: {
    sku: /^Textbook SKU/i,
    nameEn: /^Textbook English Name/i,
    nameZh: /^Textbook Chinese Name/i,
    price: /^Textbook Price/i,
  },

  // Schools table: public-safe fields only (domain/contact fields never synced).
  schoolFields: {
    name: /^Name\//i,
    abbr: /Abbreviation$/i,
    // Where this hive's orders are delivered. BOTH ARE PRIVATE: they are synced
    // into snapshot.private, which /api/data strips before serving the public
    // site. Never move them into the course objects.
    teamsChannelId: /^(Teams\s*Channel|频道)/i,
    notifyEmail: /^(Notify\s*Email|通知邮箱)/i,
  },

  snapshotBlob: {
    container: process.env.SNAPSHOT_CONTAINER || "site-data",
    name: "snapshot.json",
  },

  assetsBlob: {
    container: process.env.ASSETS_CONTAINER || "site-assets",
  },

  // Fallback Teams channel for order notifications.
  //
  // The flow posts each hive's notification to the channel id carried on its
  // route, with no fallback of its own — so a hive whose "Teams Channel ID" cell
  // is blank would make that loop iteration fail and the order would go
  // unannounced. This is the safety net: when a hive has no channel of its own,
  // its notification is posted here instead, and the payload marks the route so
  // the message itself says where it should have gone.
  //
  // Set DEFAULT_TEAMS_CHANNEL_ID to the "General" channel id of the Hive Orders
  // team (Teams → channel → Get link to channel; take the segment after
  // /channel/ and URL-decode it: %3A → ":", %40 → "@"). Left unset, behaviour is
  // as before — a blank cell breaks that hive's post — and the sync warns.
  defaultTeamsChannelId: process.env.DEFAULT_TEAMS_CHANNEL_ID || "",
};
