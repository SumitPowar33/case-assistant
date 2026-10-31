# Testing: what is tested, how, and when

Rule of this project (Sumit, 28 Oct 2026): **every piece of code gets tests, and the whole test phase runs every day.** `scripts/test-all.sh` is the single command; every nightly build session and CI run it.

## The suites
| Kind | Suite | What it proves | Command |
|---|---|---|---|
| Repository rules | `tests/repo_rules` | Every route the web app calls exists in the core or the AI gateway, and every field it sends is read there (contract); the hard rules of CLAUDE.md hold on the whole repo: no model calls outside `services/ai-gateway`, no secrets, no forbidden features (guilt/credibility scoring, prediction, facial recognition), no AI attribution in commits; no app code decides by role name | `python -m pytest -q tests/repo_rules` |
| Data / contract | `packs/tests` | Every pack file (roles, policies, punishment table, playbooks) is well formed and consistent with the database lists | `python -m pytest -q packs/tests` |
| Unit | `packages/xlit`, `RolesTest`, `PoliciesTest`, web component tests, gateway tests | Pure logic: typing engine, role merge rules, policy bounds, forms | see CLAUDE.md |
| Database / legal rules | `apps/core/db-tests` | Every migration V1..Vn on a clean schema; legal day-counting; append-only tables; constraints; upgrade from an earlier release | `python -m pytest -q apps/core/db-tests` |
| Functional / API | `apps/core/src/test` (`*ApiTest`) | Each endpoint with real tokens against PostgreSQL: happy path, every validation, every refusal | `mvn -f apps/core/pom.xml verify` |
| Security | `SecurityMatrixTest` | Walks **every route**: nothing answers without a token (except login); a signed-in outsider reads no case record (404); admin routes refuse ordinary officers | same as above |
| Access / tenancy | `AdminApiTest`, `PolicyApiTest`, `PeopleApiTest`, `FirApiTest` | State admin bounded to own state; policies tighten-only; case team reads | same |
| Web | `apps/web/src/*.test.tsx` | Screens with stubbed requests; lint; production build | `npm run coverage && npm run lint && npm run build` |
| End-to-end browser | `tests/e2e` | The real core jar on a throwaway database (`caseapp_e2e`), the built web app and Chromium (Playwright): Load data with FIRs, arrests, chargesheets, evidence and notices, the records on the FIR screen, undo, refusal of an officer without the right; a case typed by hand (FIR, accused, arrest with remand, deadlines); the front desk (complaint written down, golden-hour step, read over and signed, FIR from it); the real AI gateway against the real core (`test_ai_gateway.py`: the chain head kept in the core, the settings screen's audit check, an older audit file put back fails it) | `python -m pytest -q tests/e2e` (after `mvn verify` and `npm run build`) |
| Integration (gateway to core) | `services/ai-gateway/tests` | Token checks, audit hash chain, provider switching | `python -m pytest -q` |

## Coverage gates (they only go up)
| Part | Gate | Today (29 Oct) |
|---|---|---|
| Core (JaCoCo, `mvn verify`) | lines 96%, branches 90% | 98.1% / 92.7% (31 Oct, weekly review) |
| Web (vitest) | statements 97%, branches 89%, functions 95% | 99.8% / 93.6% / 97.0% (31 Oct, weekly review) |
| AI gateway (pytest-cov) | 94% incl. branches | 96% (31 Oct, weekly review) |
The gate fails the build below the number. When coverage rises by 2 points or more, raise the gate in the same commit.

## What every change must include
1. A **unit test** for any branch, loop, parser, deadline, money or security logic.
2. A **functional test** for any endpoint: success, each validation error, each refusal (wrong role, outsider, no token).
3. A **database test** for any migration, trigger, view or function, including the old behaviour that must not change.
4. A **web test** for any screen change, and a **pack test** for any pack file change.
5. For any new route: it is already covered by `SecurityMatrixTest`; if it is public or admin-only, add it to the lists there.
6. A bug found by any means gets a **regression test first**, then the fix.

## Daily routine (every nightly session, in this order)
1. Pull the branch. Start PostgreSQL if it is not running.
2. `scripts/test-all.sh` before touching code: this is the baseline. If red, fixing it is the first job.
3. Build the day's item with its tests.
4. `scripts/test-all.sh` again. Commit only when everything is green.
5. Look at the coverage report of the files you touched (`apps/core/target/site/jacoco/index.html`, `apps/web/coverage`); add tests for any missed line that has logic.
6. Note in docs/PROGRESS.md: the summary lines of `scripts/test-all.sh`, the coverage numbers, and any test you skipped and why.
7. Saturday: a **test audit** instead of new features (see below).

## Weekly test audit (Saturday session)
- List the endpoints, migrations, pack files and screens added this week and check each has the tests in the list above.
- Try to break the access rules by hand: a new route read as an outsider, a station admin acting on another state, a policy looser than its parent.
- Check the slowest tests and flaky tests (run the core suite twice with a different order) and fix the cause, never retry blindly.
- Re-measure the coverage and raise the gates.

## Not covered yet (planned, in this order)
1. **End-to-end browser test**: done 30 Oct 2026 (`tests/e2e`: Load data screen, and a case typed by hand in `test_case_flow.py`). Add a browser test with every new screen.
2. **Upgrade test**: done 31 Oct 2026 (`apps/core/db-tests/test_upgrade.py`: a case with a masked victim stored at V25 and V29 takes every later migration unchanged). API on an upgraded database done 31 Oct 2026 (`tests/e2e/test_upgraded_database.py`: the core app takes a fresh database to V29 (Flyway target), a protected case is written as that release would, then the current app upgrades it at start-up and the case team reads and adds to the case, the front desk gets the complaint text withheld and no people, another state gets 404). Bump `BASES` there and `BASE` in the e2e test when a release is tagged.
3. **Contract test between the web app and the core**: routes and methods done 31 Oct 2026 (`tests/repo_rules/test_web_core_contract.py` reads the calls in `apps/web/src` and the mappings in the Java controllers, so a renamed or removed route fails a test, not a screen). Request field names done 31 Oct 2026 (`tests/repo_rules/test_web_core_fields.py`: every key of every body the web app sends with `send(...)` is a component of the Java record the route reads, and every `@NotNull`/`@NotBlank` component is sent; Jackson would otherwise drop a misspelled field silently). Bodies sent to the AI gateway done 31 Oct 2026 (`tests/repo_rules/test_web_gateway_contract.py`: every `ai(...)` call reaches a gateway route with that method, every key it sends is a field of the pydantic model the route reads, and every field without a default is sent). Still to do: the field names of the answers.
4. **Load test** of the list endpoints once paging exists.
5. **Accessibility check** of the main screens (axe) and Indian-language rendering checks.
6. **Mutation testing** (PIT for the core, Stryker for the web) once a month on the legal-rule code, to see whether the tests would notice a wrong number.
Until these exist, a session notes in PROGRESS.md what it checked by hand in a browser.
