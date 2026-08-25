// Central configuration: Airtable table IDs and field names.
// Field names were captured from the live "Hive/蜂巢" base on 2026-08-25.
// If a field is renamed in Airtable, fix it HERE only.

module.exports = {
  baseId: process.env.AIRTABLE_BASE_ID || "appgYiHg9pm6hcRgv",

  tables: {
    tracks:   { id: "tbltFG1wvhlxdMNCm", display: "Track ID" },
    courses:  { id: "tblWTiOgX1pM40U4A", display: "Course Name/课程名称" },
    subjects: { id: "tblvQaPpgBRZSuT48", display: "Subject Name" },
    grades:   { id: "tblQBtt6PSLLGeULf", display: "Title/年级名称" },
    teachers: { id: "tbltGNxS4Hdy2YiGA", display: "Name / 姓名" },
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

  courseFields: {
    code: "Course ID/课程编号",
    name: "Course Name/课程名称",
    tracks: "Graduation Track/毕业路径",
    description: "Course Description/课程描述",
    classType: "Class Type/课程类型",
    grades: "Grade/年级",
    language: "Teaching Language/授课语言",
    price: "Course Price/课程价格",
    numClasses: "Number of Classes/课时数",
    teachers: "Teacher/授课老师",
    classTime: "Class time/上课时间",
    subjects: "Subject/学科",
    school: "School or Institution/学校或机构",
    available: "Available/可用？",
  },

  snapshotBlob: {
    container: process.env.SNAPSHOT_CONTAINER || "site-data",
    name: "snapshot.json",
  },
};
