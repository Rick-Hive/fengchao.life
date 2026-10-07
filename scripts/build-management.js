#!/usr/bin/env node
// Build management/management.js from management/src/*.js.
//
// The management centre is one hash-routed page whose script is a single closure:
// every page's functions see the helpers, the state and each other without a
// module system or a bundler (the site is served as static files). For
// maintainability the closure is kept as parts — one file per page — and
// concatenated here, in file-name order (00-head … 99-tail), into the file
// index.html loads. The built file is not committed: the deploy workflow and
// scripts/test.sh run this first. Usage:  node scripts/build-management.js [--check]
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const srcDir = path.join(root, "management", "src");
const out = path.join(root, "management", "management.js");

const parts = fs.readdirSync(srcDir).filter((f) => /^\d\d-[a-z-]+\.js$/.test(f)).sort();
if (!parts.length) { console.error("build-management: no parts in " + srcDir); process.exit(1); }
if (parts[0] !== "00-head.js" || parts[parts.length - 1] !== "99-tail.js") { console.error("build-management: parts must start with 00-head.js and end with 99-tail.js, got " + parts.join(", ")); process.exit(1); }

const built = parts.map((f) => {
  const text = fs.readFileSync(path.join(srcDir, f), "utf8");
  return text.endsWith("\n") ? text : text + "\n";
}).join("");

// A sanity check that the parts still close what they open: the head opens the
// closure, the tail closes it, and every part parses on its own as a fragment of it.
if (!/\(function \(\) \{\s*\n\s*"use strict";/.test(built) || !/\}\)\(\);\s*$/.test(built)) { console.error("build-management: the head must open the closure and the tail close it"); process.exit(1); }
try { new Function(built); } catch (err) { console.error("build-management: the built file does not parse: " + err.message); process.exit(1); }

if (process.argv.includes("--check")) {
  const current = fs.existsSync(out) ? fs.readFileSync(out, "utf8") : "";
  if (current !== built) { console.error("build-management: management/management.js is stale — run node scripts/build-management.js"); process.exit(1); }
  console.log("build-management: up to date (" + parts.length + " parts)");
} else {
  fs.writeFileSync(out, built);
  console.log("build-management: wrote management/management.js from " + parts.length + " parts, " + built.split("\n").length + " lines");
}
