// Moved out of admin/index.html so the Content-Security-Policy can drop 'unsafe-inline' for scripts (2026-10-22).
// This page moved into the hub; keep old bookmarks working.
if (location.hostname === "www.fengchao.life") location.replace("https://fengchao.life/management/#/system/roles");
else location.replace("/management/#/system/roles");
