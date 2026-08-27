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
    subjects:     { id: "tblvQaPpgBRZSuT48", display: "Subject Name" },
    grades:       { id: "tblQBtt6PSLLGeULf", display: "Title/年级名称" },
    teachers:     { id: "tbltGNxS4Hdy2YiGA", display: "Name / 姓名" },
    classPeriods: { id: "tblaC1VEnTdYvCFOo" },
    textbooks:    { id: "tblboTRWTZ8cKvv1a" },
    schools:      { id: "tblRVfq00Q5QKkR5h" },
  },

  trackFields: {
    trackId: "Track ID",
    name: "Track Name",
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
    description: "Course Description/课程描述",
    classType: "Class Type/课程类型",
    grades: "Grade/年级",
    language: "Teaching Language/授课语言",
    price: "Course Price/课程价格",
    numClasses: "Number of Classes/课时数",
    teachers: "Teacher/授课老师",
    classTime: "Class time/上课时间",   // now a LINK to Class Periods
    subjects: "Subject/学科",
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
  },

  snapshotBlob: {
    container: process.env.SNAPSHOT_CONTAINER || "site-data",
    name: "snapshot.json",
  },

  assetsBlob: {
    container: process.env.ASSETS_CONTAINER || "site-assets",
  },
};
