// The role model (api/shared/roles.js) and the roles endpoint's validation.
//
// Run with:  node test/roles.test.js
//
// 普通用户 / 域管理员（IT） / 域蜂巢管理员 / Staff by function: which domains each
// sees and what each may do; old names still work; only known roles can be
// assigned; the system administrator carries `admin` for the route rules.
const assert = require("assert");
const path = require("path");
const Module = require("module");

const realResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (request === "@azure/storage-blob") return "@azure/storage-blob";
  return realResolve.call(this, request, parent, ...rest);
};
require.cache["@azure/storage-blob"] = { id: "@azure/storage-blob", filename: "@azure/storage-blob", loaded: true, exports: { BlobServiceClient: { fromConnectionString() { throw new Error("no storage in test"); } } } };
process.env.HIVE_ADMINS = "boot@fengchao.life";
delete process.env.STORAGE_CONNECTION_STRING;

const R = require(path.join(__dirname, "..", "api", "shared", "roles.js"));

(async () => {
  // Assignable names.
  assert.ok(R.isAssignable("domain_it:bes.qiaoliang.online"));
  assert.ok(R.isAssignable("domain_hive:bes.qiaoliang.online"));
  assert.ok(R.isAssignable("staff:sales") && R.isAssignable("staff:sysadmin"));
  assert.ok(R.isAssignable("admin"));
  assert.ok(!R.isAssignable("crm_entry"), "the order-entry role is gone");
  assert.ok(!R.isAssignable("domain_it:bad"), "a domain needs a dot");
  assert.ok(!R.isAssignable("staff:ceo"), "unknown staff function");
  assert.ok(!R.isAssignable("coordinator"), "old name is honoured but no longer handed out");

  // Who sees which domains.
  assert.deepStrictEqual(R.managedDomains([]), []);
  assert.deepStrictEqual(R.managedDomains(["domain_hive:a.edu", "domain_it:b.org"]), ["a.edu", "b.org"]);
  assert.deepStrictEqual(R.managedDomains(["staff:finance"]), ["*"]);
  assert.deepStrictEqual(R.managedDomains(["coordinator"]), ["*"]);
  assert.deepStrictEqual(R.managedDomains(["domain_admin:a.edu"]), ["a.edu"]);

  // What each may do.
  const IT = ["domain_it:a.edu"], HIVE = ["domain_hive:a.edu"], SALES = ["staff:sales"], SYS = ["staff:sysadmin"], OLD = ["domain_admin:a.edu"];
  assert.ok(R.can(IT, "view", "a.edu") && R.can(IT, "methods", "a.edu") && !R.can(IT, "people", "a.edu") && !R.can(IT, "admin"));
  assert.ok(!R.can(IT, "view", "b.org"), "IT of a.edu sees nothing of b.org");
  assert.ok(R.can(HIVE, "view", "a.edu") && R.can(HIVE, "people", "a.edu") && !R.can(HIVE, "methods", "a.edu"));
  assert.ok(R.can(SALES, "view", "anything.edu") && R.can(SALES, "people", "anything.edu") && !R.can(SALES, "methods", "anything.edu") && !R.can(SALES, "admin"));
  assert.ok(R.can(SYS, "view", "x") && R.can(SYS, "methods", "x") && R.can(SYS, "people", "x") && R.can(SYS, "admin"));
  assert.ok(R.can(["admin"], "admin"));
  assert.ok(R.can(OLD, "methods", "a.edu") && R.can(OLD, "people", "a.edu"), "old domain_admin = IT + Hive");
  assert.ok(R.can(["domain_it:a.edu", "domain_hive:a.edu"], "methods", "a.edu") && R.can(["domain_it:a.edu", "domain_hive:a.edu"], "people", "a.edu"));
  assert.ok(!R.can([], "view", "a.edu"), "普通用户 sees no domain");

  // Labels.
  assert.strictEqual(R.roleLabel("staff:community"), "Staff · 教育社区经理");
  assert.strictEqual(R.roleLabel("domain_hive:a.edu", "en"), "Domain Hive administrator · a.edu");
  assert.strictEqual(R.roleLabel("domain_it:a.edu"), "域管理员（IT） · a.edu");

  // Entra's administrator roles at sign-in: User Administrator → 域管理员（IT）of the
  // account's own domain; Global Administrator (tenant-wide) → system administrator;
  // nothing at Entra → nothing added; Graph trouble → Hive's roles only.
  const graphMod = require(path.join(__dirname, "..", "api", "shared", "graph.js"));
  const calls = [];
  let assignments = [{ roleDefinitionId: "fe930be7-5e62-47db-91af-98c3a49a38b1", directoryScopeId: "/administrativeUnits/au1" }];
  graphMod.graph = async (m, url) => {
    calls.push(url);
    if (/^\/users\//.test(url)) return { id: "u-1" };
    if (/roleAssignments/.test(url)) { if (assignments instanceof Error) throw assignments; return { value: assignments }; }
    throw new Error("unexpected " + url);
  };
  assert.deepStrictEqual(await R.rolesFor("Test.Admin@sciencebug.net", true), ["domain_it:sciencebug.net"]);
  assert.ok(/principalId eq 'u-1'/.test(calls[1]), "assignments are looked up by the account's object id");
  assignments = [{ roleDefinitionId: "62e90394-69f5-4237-9190-012177145e10", directoryScopeId: "/" }];
  assert.deepStrictEqual((await R.rolesFor("ga@sciencebug.net", true)).sort(), ["admin", "staff:sysadmin"]);
  assignments = [{ roleDefinitionId: "62e90394-69f5-4237-9190-012177145e10", directoryScopeId: "/administrativeUnits/au1" }];
  assert.deepStrictEqual(await R.rolesFor("ga-au@sciencebug.net", true), ["domain_it:sciencebug.net"], "a scoped Global Administrator is IT of their domain only");
  assignments = [{ roleDefinitionId: "b0f54661-2d74-4c50-afa3-1ec803f12efe", directoryScopeId: "/" }]; // Billing Administrator
  assert.deepStrictEqual(await R.rolesFor("billing@sciencebug.net", true), []);
  assignments = new Error("Graph down");
  assert.deepStrictEqual(await R.rolesFor("test.admin@sciencebug.net", true), [], "Graph trouble adds nothing and does not throw");
  assert.deepStrictEqual(await R.rolesFor("boot@fengchao.life", true), ["admin"]);
  calls.length = 0;
  assert.deepStrictEqual(await R.rolesFor("test.admin@sciencebug.net"), [], "without the flag Graph is not asked");
  assert.strictEqual(calls.length, 0);

  // The bootstrap account is admin; a sysadmin entry would also carry `admin`.
  assert.deepStrictEqual(await R.rolesFor("Boot@fengchao.life"), ["admin"]);
  assert.deepStrictEqual(await R.rolesFor("nobody@fengchao.life"), []);

  console.log("roles: all assertions passed");
})().catch((e) => { console.error(e); process.exit(1); });
