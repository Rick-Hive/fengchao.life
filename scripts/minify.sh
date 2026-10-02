#!/usr/bin/env bash
# Minify the site's JS and CSS in place. Run by the deploy workflow on the
# checked-out tree, so the repository keeps readable sources and the site
# serves compact files (Rick, 2026-10-02, speed from the mainland). Needs
# terser and csso-cli on PATH (the workflow installs them with npx).
set -euo pipefail
cd "$(dirname "$0")/.."
total_before=0; total_after=0
for f in assets/*.js management/*.js; do
  b=$(wc -c < "$f")
  npx --yes terser@5 "$f" --compress --mangle --ecma 2017 --comments false -o "$f.min" && mv "$f.min" "$f"
  a=$(wc -c < "$f"); total_before=$((total_before+b)); total_after=$((total_after+a))
  echo "$f: $b -> $a"
done
for f in assets/*.css management/*.css; do
  b=$(wc -c < "$f")
  npx --yes csso-cli@4 "$f" -o "$f.min" && mv "$f.min" "$f"
  a=$(wc -c < "$f"); total_before=$((total_before+b)); total_after=$((total_after+a))
  echo "$f: $b -> $a"
done
echo "total: $total_before -> $total_after bytes"
