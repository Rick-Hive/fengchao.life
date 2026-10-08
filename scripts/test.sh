#!/usr/bin/env bash
# Run every unit test (test/*.test.js) and stop at the first failure. Used by the
# deploy workflow before anything is uploaded, and locally: bash scripts/test.sh
set -euo pipefail
cd "$(dirname "$0")/.."
node scripts/build-management.js
fail=0
# jsdom is an optional dependency of the grade-filter test (it drives the real page);
# without it that test is skipped, not failed. The deploy workflow installs it.
has_jsdom=0; node -e "require.resolve('jsdom')" >/dev/null 2>&1 && has_jsdom=1
for t in test/*.test.js; do
  if [ "$has_jsdom" = 0 ] && grep -q 'require("jsdom")' "$t"; then echo "skip $t (needs jsdom: npm i -g jsdom@24)"; continue; fi
  if out=$(node "$t" 2>&1); then echo "ok   $t"; else echo "FAIL $t"; echo "$out" | tail -40; fail=1; fi
done
exit $fail
