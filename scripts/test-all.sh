#!/usr/bin/env bash
# Runs every test suite with its coverage gate and prints one summary. Used by the nightly build sessions and by CI.
# Needs PostgreSQL for the core and database suites (DATABASE_URL, default: caseapp@localhost/caseapp_test).
# Usage: scripts/test-all.sh [--no-db]   (--no-db skips the three suites that need PostgreSQL)
set -u
cd "$(dirname "$0")/.."
NO_DB=0; [ "${1:-}" = "--no-db" ] && NO_DB=1
RESULTS=()
run() {  # run "name" command...
  local name="$1"; shift
  if "$@" > "/tmp/test-all-$$.log" 2>&1; then RESULTS+=("PASS  $name"); else RESULTS+=("FAIL  $name"); tail -25 "/tmp/test-all-$$.log"; fi
}
run "repo rules (CLAUDE.md hard rules)"        python -m pytest -q tests/repo_rules
run "packs (roles, policies, playbooks, tables)" python -m pytest -q packs/tests
run "xlit (typing engine)"                      node packages/xlit/xlit.test.js
run "ai-gateway (unit + API, coverage >= 92%)"  bash -c 'cd services/ai-gateway && python -m pytest -q --cov=app --cov-branch --cov-fail-under=92'
run "web (tests, coverage gate, lint, build)"   bash -c 'cd apps/web && npm run coverage && npx eslint . && npm run build'
if [ $NO_DB = 0 ]; then
  run "database rules (migrations V1..Vn)"      python -m pytest -q apps/core/db-tests
  run "core (unit + API + security, coverage gate)" mvn -B -q -f apps/core/pom.xml verify
  # after core and web: it uses the jar and the built web app they just made, and its own throwaway database
  run "e2e browser (real core + web, Chromium)"  python -m pytest -q tests/e2e
fi
echo; echo "=== summary ==="; printf '%s\n' "${RESULTS[@]}"
rm -f "/tmp/test-all-$$.log"
printf '%s\n' "${RESULTS[@]}" | grep -q '^FAIL' && exit 1 || exit 0
