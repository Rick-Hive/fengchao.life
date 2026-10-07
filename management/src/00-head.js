// management/src/00-head.js — The file header and the IIFE that wraps everything: one closure, built from these parts.
// Part of management.js: scripts/build-management.js concatenates management/src/*.js in name order
// into management/management.js (one closure; every part sees every other's functions). Edit here, not the built file.
// 蜂巢 管理中心 (/management/) — one page, hash-routed. Views:
//   #/account          我的账号: profile, password links, sign-in methods, log downloads
//   #/teams            我的 Teams: a Teams-style list with filter chips and live search
//   #/domain/users     本域管理 › 用户: Entra-style table of the domain's accounts
//   #/domain/groups    本域管理 › Teams 群组: domain → groups, collapsible
//   #/system/roles     系统 › 角色分配
//   #/system/sync      系统 › 数据同步
// What a person sees in the sidebar follows their roles (/api/me/summary →
// roles; /api/domain/domains → which domains they manage).
(function () {
  "use strict";

