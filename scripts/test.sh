#!/usr/bin/env bash
# Run every unit test (test/*.test.js) and stop at the first failure. Used by the
# deploy workflow before anything is uploaded, and locally: bash scripts/test.sh
set -euo pipefail
cd "$(dirname "$0")/.."
node scripts/build-management.js
fail=0
for t in test/*.test.js; do
  if out=$(node "$t" 2>&1); then echo "ok   $t"; else echo "FAIL $t"; echo "$out" | tail -40; fail=1; fi
done
exit $fail
