# Progress

Working branch: `setup/seed` (open a PR to `master` when ready: https://github.com/SumitPowar33/case-assistant/pull/new/setup/seed)

Nightly sessions: 21:05, 23:35 and 02:05 IST. Weekend sessions on Saturday and Sunday 21:05.

## 30 Oct 2026, Sumit's answers (read this before picking the next item)
Answers to the open questions from sessions 13, 18 and 25:
1. Second-approver rule (`import_self_approval` = 0): **yes, for the whole pilot state** (Maharashtra). Set it in the MH pack's `policies.json`, not by hand in the database.
2. Sample CCTNS/state export: **not available**. Write a realistic, fully fictional CCTNS-style import profile for MH (`packs/MH/import-profiles`), clearly marked as made up, so it can be replaced when a real sample arrives.
3. Evidence and notices import files: **build both**, same pattern as FIRs, arrests and chargesheets (insert-only, approved by a person, undoable until work is recorded).
4. First state pack: **Maharashtra (MH)**, with Marathi forms, deadlines and playbooks. It may only add to or tighten the national (IN) pack.

Next (replaces the "Next" list of session 25; a session finishing an item removes it here)
Done in session 26: the browser test of the Load data screen, the MH module with `import_self_approval` = 0, the made-up MH CCTNS-style profile.
Done in session 28: evidence import file (ef845fb), notices import file (a792dea), `ai_cloud_allowed` policy (ef1e2bb).
3. Rest of the Maharashtra pack: roles, punishments only where the state differs, playbooks, Marathi labels, demo stations in MH (waits for questions 1 to 3 of session 26).
5. Module 1, front-desk complaint: typed intake, read-back, golden-hour checklist, then speech input.
6. Screens in the 10 languages, then the legal glossary.
7. Upgrade test, contract test web-to-core, load and accessibility checks.
8. End-to-end demo case and demo script.

## 30 Oct 2026, session 28 (scheduled weekend build, Sumit away; ran at the same time as session 27)
Started from `setup/seed` at ec72a29. Sandbox fresh: started PostgreSQL, created role `caseapp` and the two databases, installed packages, `npm ci`. Baseline `scripts/test-all.sh`: all 8 lines PASS.

Done
- **Evidence register import** (Next item 1, ef845fb; session 27 saw it and kept this one). Layout "Evidence register (CSV), generic": an item is attached to an FIR of the chosen station by number (and year); label, kind (physical, electronic, document) and seizure date are required. Never guessed: an **electronic item without the SHA-256 taken at seizure is an error** (the hash cannot be made up; type it by hand with its 63(4) certificate); a missing description or panchnama reference is "Not in the old record" with a warning; a seizure dated before the FIR is a warning only (a recovery can lead to an FIR). Repeats by FIR + label (case and spaces ignored). Undo is refused once a custody hand-over, a 63(4) certificate or a readiness/accused link hangs on an item. **New rule V28: an evidence item can no longer be deleted at all** (it could be, by direct SQL), except by the undo of the import that added it. Imported electronic items show "not court-ready yet" until their certificate is recorded.
- **Notices import** (Next item 2, a792dea). Layout "Notices (CSV), generic". Legal logic, all also enforced by the database (V29): old notices **keep their law** (new kinds CrPC 91, 41A, 160, shown as "old law", never converted to BNSS 94, 35(3), 179, and not offered when typing a new notice); **no BNSS notice before 1 July 2024**; **a CrPC notice only for an FIR registered before 1 July 2024** (it may be issued after that day, BNSS 531 savings); a notice to produce (BNSS 94, CrPC 91) must list its items. The **status is never guessed** because it decides the reply deadline (unknown value = error; empty = "sent" with a warning). The signer may be empty only for an imported notice. A notice imported as complete shows nothing missing. Undo refused once a reply is recorded.
- **Bug fixed on the way (V29)**: a concluded case still showed the reply date of an open notice on its deadline list; now a concluded case has no live deadline of any kind (database test).
- **`ai_cloud_allowed` policy** (Next item 4, ef1e2bb). National policy, default 1; a state, district or station may set 0 (tighten-only, like every policy). `GET /api/me` now carries `ai_cloud_allowed` for the user's unit, and the AI gateway, which reads `/api/me` on every sign-in check, refuses Claude and Gemini with 403 when it is off and writes an `ai_refused` row to the audit chain; nothing is sent. It fails closed: a core answer without the field counts as "no cloud". Only the offline `fake` provider counts as on the state's servers today. Tests: `PolicyApiTest` (+1: district sets 0, its stations see false, another district and the platform admin see true, a station cannot set it back), gateway (+2).
- Less code: one FIR lookup (`ArrestImport.firOf`) and one staging routine (`keyedRows`) now serve chargesheets, evidence and notices instead of copies.
- Tests: `EvidenceImportTest` (6), `NoticeImportTest` (6), `ImportApiTest` (+11: load, repeats, item or notice recorded meanwhile, signer left, undo and its refusals, who may load, a CrPC notice cannot be typed for a new FIR), `test_schema.py` (+4: evidence kept, CrPC/BNSS dates, imported notice without signer, concluded case), web (+2), pack test (two new layouts), browser test `test_load_data.py` now also loads evidence and notices and checks them on the FIR screen.
- Final `scripts/test-all.sh` (after merging session 27's work): PASS repo rules, PASS packs, PASS xlit, PASS ai-gateway, PASS web, PASS database rules, PASS core, PASS e2e browser. After the policy change too: all 8 PASS. Coverage: core 97.9% lines / 92.9% branches, web 99.3% statements / 83.9% branches / 94.4% functions, gateway 94%. No gate raised (core branches +1.4 since the last raise, web unchanged).

Deliberately skipped / not checked
- Custody hand-overs and 63(4) certificates of old items, and replies of old notices, are not loaded (only the item or notice itself). A notice imported as "partly replied" therefore lists all its items as missing until replies are logged.
- No delete guard for notices (only evidence got one); notices were never deletable from the app.
- The deadline list shows the basis of an old notice as `CrPC_91` (code, not the label).
- Not seen in a browser by hand (the browser test covers the screens used).

- `ai_cloud_allowed`: no per-state API keys yet and no real on-premises provider; the web screens do not hide the provider choice when cloud is off (the gateway's refusal message is shown instead). The gateway's admin check still uses the role name `state_admin` (older code, see question 4 of session 26).

Next
1. Front-desk complaint (module 1): typed intake, read-back, golden-hour checklist.
2. Rest of the MH pack once questions 1 to 3 of session 26 are answered.
3. Upgrade test (next kind of test in docs/TESTING.md after the browser tests).

Blocked
- Live Claude/Gemini calls wait for API keys (using `fake`). MH roles, punishments and playbooks wait for questions 1 to 3 of session 26.

Questions for Sumit
1. Old notices of CrPC days are kept as CrPC 91, 41A and 160 (not converted). Do your pilot stations also have old notices under other sections (for example CrPC 41(1) arrest notices, 160 to women at home, or 175 summons) that the file should accept?
2. Should a notice imported as "partly replied" carry which items were already received (a column such as `items_received`), or is it enough that the officer ticks them in the app?
3. With `ai_cloud_allowed` = 0 no AI drafting works today, because there is no on-premises model yet. Should the pilot state start with cloud allowed (fictional data only), and which on-premises model should come first when real data arrives?
4. (Same as session 27's question) Two sessions built the evidence import at the same time this evening. Please keep only one session running at a time, or tell on-demand runs to do testing work only.

## 30 Oct 2026, session 27 (on-demand run started by Sumit at about 17:50 IST)
Started from `setup/seed` at ec72a29. PostgreSQL was already running from session 26. Baseline `scripts/test-all.sh`: all 8 lines PASS.

Done
- Built the evidence import (Next item 1), but another session pushed its own evidence import (ef845fb) while I was testing mine. I kept theirs, discarded mine (still on a local branch only, never pushed) and did not start the notices file, so the two sessions do not build the same thing twice. Note: after this switch the test database still had my V28, so Flyway refused to start ("checksum mismatch for migration 28"); I dropped and re-created `caseapp_test`. The next session does not need to do anything; the sandbox starts empty.
- Instead, the next kind of test from "Not covered yet": a **browser test of a case typed by hand** (`tests/e2e/test_case_flow.py`). An IO signs in, registers an FIR (dates two days ago), adds the accused, records the arrest with the first remand, and the screen shows the 60-day chargesheet limit counted from the remand (BNSS 187(3)) and the 90-day victim update (BNSS 193(3)(ii)); the FIR is on the IO's list. That first item of "Not covered yet" in docs/TESTING.md is now done.
- Final `scripts/test-all.sh`: PASS repo rules, PASS packs, PASS xlit, PASS ai-gateway, PASS web, PASS database rules, PASS core, PASS e2e browser. Coverage unchanged by this test-only change (core about 97.8% lines / 92.4% branches, web 99.3% / 83.9%, gateway 94%); no gate raised.

Deliberately skipped / not checked
- Notices import file: left to the session that did the evidence file, to avoid a second duplicate.
- The browser test uses the sandbox's UTC date to pick dates two days back; it is safe at any hour, but the expected dates are computed in the test, not read from a fixed table.

Next
1. Notices import file (unless the other session already pushed it).
2. Questions 1 to 4 of session 26 are still open.

Questions for Sumit
1. Two sessions ran at the same time this evening (this on-demand run and another one), and both built the evidence import. Should on-demand runs only do testing work (no Next items) when a scheduled session may be running, or should only one session run at a time?

## 30 Oct 2026, session 26 (scheduled weekend build, Sumit away)
Started from `setup/seed` at 73d2322; your answers (1dff508) arrived on the branch during the session and I followed their Next list. Sandbox empty again: started PostgreSQL, created role `caseapp` and the two databases, installed packages, `npm ci`. Baseline `scripts/test-all.sh`: all 7 lines PASS.

Done
- **End-to-end browser test** (Next item 1; first item of "Not covered yet"): `tests/e2e` (pytest + Playwright, Chromium). It drops and creates a throwaway database `caseapp_e2e`, starts the real core jar on a free port with a made-up signing key and admin password, serves the built web app with a small proxy for `/api`, and the platform admin creates the station and accounts over the API. Three tests: (1) an SHO loads FIRs, then arrests, then chargesheets through the four steps (a bad date and an unknown FIR are skipped), the FIR screen shows the people, arrests, remand, chargesheet and deadlines, undoing the chargesheets brings the 60-day custody clock back for the accused still in custody; (2) an IO sees no Load data link and is refused when typing the address; (3) Maharashtra, below. New line in `scripts/test-all.sh` (runs after core and web, uses their jar and build).
- **Bug found by the browser test, fixed with a regression test first**: a fresh installation had no `state_pack` row, so the admin could not add any police station (the API tests hid this by inserting the row themselves). Fix: a module manifest `packs/{id}/module.json` (id = folder name, name, version, languages, `depends`; every module but `IN` depends on `IN`), checked at start-up (`Modules`), which writes each module's `state_pack` row (status untouched). Tests: `ModulesTest` (6), `AdminApiTest` (fresh install), pack test.
- **Maharashtra module, first part** (Next item 2): `packs/MH/module.json` (Marathi, English, Hindi) and `packs/MH/policies.json` with your decision `import_self_approval` = 0 for the whole state. New mechanism, because a pack could not set a value before: a state module may give a **stricter value for its own state** (`state_values`, with a reason; only between the minimum and the national default; the national module cannot). V27 adds `pack_policy` (written from the pack files at start-up) and `effective_policy_days` now takes it into account, so deadlines and the approval check agree; the tighten-only check treats the module as the unit above the state admin, so nobody in MH can set it back to 1. Tests: `PoliciesTest` (+2), `ImportApiTest` (MH: SHO refused, SP approves, state admin cannot loosen, other states unaffected), `test_schema.py` (+1), pack tests (+2), `MigrationTest` expects V27.
- **Made-up CCTNS-style FIR layout for MH** (Next item 3): `packs/MH/import-profiles/fir-mh-cctns-fictional.json`, labelled MADE-UP in the screen, capital-letter column names and Marathi headings (गुन्हा क्रमांक, दाखल दिनांक, आरोपी, थोडक्यात हकीकत ...). A state's layout is now **only for that state's stations**: the server refuses it elsewhere, the screen offers it only when such a station is chosen, and the station list starts at the user's own station. Profile ids must be unique across modules (start-up refusal and pack test). Tests: `FirImportTest` (+2), `ImportApiTest` (+1), `ImportPage.test.tsx` (+1), browser test 3 (Pune SHO loads the MH file, cannot approve it; the SP approves).
- Final `scripts/test-all.sh`: PASS repo rules, PASS packs, PASS xlit, PASS ai-gateway, PASS web, PASS database rules, PASS core, PASS e2e browser. Coverage: core 97.8% lines / 92.0% branches, web 99.3% statements / 83.9% branches / 94.4% functions, gateway 94%. No gate raised (no rise of 2 points since the last raise). `Modules` 100%, `Policies` 100% lines and branches.

Deliberately skipped / not checked
- MH roles, punishments, playbooks and Marathi labels: not written, because they are legal and organisational content I should not invent (questions 1 and 2). No demo stations in MH (question 3).
- The Policies page still shows the national default next to the value in force; for MH it shows default 1, in force 0, without saying the state module set it. The policy history does not list module values (they are in the pack file and `pack_policy`).
- The made-up layout is FIRs only (no MH arrests or chargesheets layout). A file with a byte-order mark sent straight to the API would not match the first column name (the browser strips it).
- Risks seen, not changed: `GET /api/stations` lists every station of every state to any signed-in user (names only, no case data); `App.tsx` decides the Admin link by the role name `state_admin` (older code, against the "no role names" rule). Both small; question 4.

Next
1. Evidence import file (Next item 4 above), then notices import file.
2. Rest of the MH pack once questions 1 to 3 are answered.
3. More browser tests: register an FIR by hand, add a person, record an arrest, see the deadline list.

Blocked
- Live Claude/Gemini calls wait for API keys (using `fake`). MH roles, punishments and playbooks wait for questions 1 and 2.

Questions for Sumit
1. Maharashtra roles: should the MH module add any role of its own (for example a station duty officer, "ठाणे अंमलदार"), or keep the national roles only?
2. Maharashtra punishments and playbooks: which state laws should come first (for example MCOCA or the Maharashtra Police Act), and who can check them as a prosecutor before they leave draft?
3. Demo stations in MH: which fictional district and station names do you want for demos (e.g. "Fictional Pune Rural / Demo Pune PS")?
4. May I limit `GET /api/stations` to the user's own state (the platform admin still sees all), and replace the role-name check for the Admin link with the `admin.manage` permission?

## 29 Oct 2026, session 25 (scheduled nightly build, last of the night, Sumit away)
Started from `setup/seed` at 69e0d83 (sandbox empty again: started PostgreSQL, created role `caseapp` and the two databases, installed packages, `npm ci`). Baseline `scripts/test-all.sh`: all 7 lines PASS.

Tonight in short
- Session 23: paging for the FIR list.
- Session 24: jurisdiction as data (V23), arrests import (V24), chargesheets import (V25), second-approver policy, policy form hidden for people who cannot set policies.
- Session 25 (this one): correction of time of arrest (V26), plus extra tests for older code.
- Final `scripts/test-all.sh`: PASS repo rules, PASS packs, PASS xlit, PASS ai-gateway, PASS web, PASS database rules, PASS core. Coverage: core 97.7% lines / 91.5% branches, web 99.3% statements / 83.7% branches / 94% functions, gateway 94%. Core branch gate raised 88 to 90 (coverage had risen more than 2 points).

Done
- Next item 1, my pick: **correction of time of arrest** (V26, table `arrest_time_correction`). Same pattern as the other corrections: the memo keeps the time as first written; a new row with a written reason (10+ characters) replaces the newest one. The view `arrest_current` now gives the time in force (plus `time_correction_id`), so the order of arrests of one person (earlier custody days, V19) and the checks on remand and release use the corrected time. The database refuses a time in the future or one whose IST day is after a first remand or release already on record, and the remand/release correction trigger now compares with the corrected day. API: `POST /api/firs/{id}/arrests/{arrestId}/time-corrections` (case team only), `GET .../arrests/time-corrections` (history); the arrest list shows the corrected time and `time_corrected`. Web: "Correct the time of arrest" form and the history line on each arrest. An imported arrest that is later corrected cannot be undone (the existing undo guard sees the new table through its foreign key).
- Tests: `RecordsApiTest` (time correction: bad reason, future, after the remand on record, unknown arrest, history, later remand correction uses the new day, outsider refused), `test_schema.py` (kept as written, one first correction, chain, trigger rules, remand check), `Arrests.test.tsx` (+1), `MigrationTest` now expects V26.
- Older code: `PolicyApiTest` (no station named, no/blank/unknown state, no district, a state admin of another state, inactive or unknown user, a role with no reach) and `ImportApiTest` (over-long arrest and chargesheet rows, mapping that misses required fields or names a column that is not in the file).

Deliberately skipped / not checked
- Not seen in a real browser. The duplicate check of imports (same accused and IST day) still uses the time as first written; it only matters for rows loaded later.
- Not built: evidence and notices files; end-to-end browser test (Playwright, first item of "Not covered yet" in docs/TESTING.md); upgrade test; contract test web-to-core. Remaining uncovered core branches are mostly impossible error handlers (JSON write failures) and a race (a row changed between check and approval).

Next
1. End-to-end browser test of the Load data screen (FIRs, arrests, chargesheets in order) with Playwright.
2. `ai.cloud_allowed` policy and the gateway refusing a cloud provider when it is off.
3. Evidence and notices files keyed by FIR, if you want them (question 3 below).

Blocked
- Live Claude/Gemini calls wait for API keys (using `fake`).

Questions for Sumit
1. Should the second-approver policy (`import_self_approval` = 0) be switched on for the state or district you will pilot in?
2. Can you get a sample (fictional or masked) export from a pilot department's CCTNS or state system, so I can write a real state profile?
3. Evidence and notices import files: build them, or leave imports as they are (FIRs, arrests, chargesheets) and move to the browser test and `ai.cloud_allowed`?

## 29 Oct 2026, session 24 (scheduled nightly build, Sumit away)
Started from `setup/seed` at 1eeb2bc. The sandbox was empty: started PostgreSQL, created role `caseapp` (superuser) and databases `caseapp_test`/`caseapp_dev`, installed `psycopg[binary]` and the gateway requirements, `npm ci`. Baseline `scripts/test-all.sh`: all 7 lines PASS.

Done
- Jurisdiction as data (V23): new `district` table (id, state, name; unique per state ignoring letter case and spaces). `police_station.district_id` and `policy_setting.district_id` replace the free-text district; state codes in policies now reference `state_pack`. Old rows are moved by the migration (two spellings of one district become one). The SP's reach (`CaseTeam`), district policies and station creation use the id. The API still takes and returns the district name (web unchanged); `district_id_of(state, name)` finds or creates it.
- Sumit answered later the same night: arrests first, decide the other open points myself. Built, in this order:
  1. **Arrests import** (V24, `ArrestImport`, profile `arrest-generic`): a file keyed by FIR number (and year) of the chosen station, one row per arrest, same stage/check/approve/undo flow. The accused must already be in the FIR (nobody is created from this file); missing place/grounds/person informed are stored as "Not in the old record" with a warning; the arresting officer may be empty (allowed in the database only for imported arrests); the class of punishment comes from the file or, with a warning, from the FIR's sections; date-order checks; repeat key = accused + IST day. Undo deletes the batch's arrests (database allows the delete only after the batch is marked undone) and is refused after a correction, or after a remand or release was recorded on an imported arrest. V24 also fixes a real gap: the custody deadline view ignored `concluded`, so an old concluded case would have shown a 60/90-day clock.
  2. **Chargesheets import** (V25, `ChargesheetImport`, profile `chargesheet-generic`): same idea; it names accused already in the FIR and ends their custody clock and the 193(2) clock like a typed chargesheet. Undo refused after a correction. Done so imported old arrests do not show a false running clock.
  3. **Second approver** (your open question 3, my decision): policy `import_self_approval`, default 1 (same person may approve). A state, district or station can set it to 0 through the Policies page; then the person who checked a file cannot approve it. Default left permissive so small stations are not blocked.
  4. **Policy form hidden** (open question 2, my decision) for people without the right to set policies (`can_set_policy` in login and `/api/me`); the values in force stay visible to everyone. The server check is unchanged.
- Web: wording follows the file type (FIRs, arrests, chargesheets); an arrest without an officer reads "officer not in the old record".
- Tests: unit (`ArrestImportTest` 8, `ChargesheetImportTest` 5), API (import suite now 30 tests: arrests, chargesheets, duplicates, undo guards, second approver, `can_set_policy`), database (arrest and chargesheet delete rules, V23 backfill), web (+4), pack test now checks all three layouts. Final `scripts/test-all.sh`: all 7 lines PASS. Coverage: core 97% lines / 90% branches, web 99% / 84% branches / 94% functions, gateway 94%. Raised gates: core branches 85 to 88, web branches 80 to 82.

Deliberately skipped / not checked
- Not seen in a real browser. The "language of the complaint text" box still shows for arrest and chargesheet files (it is ignored there). No screen to rename a district (database only); I judged it low value, so question 4 of the earlier list is dropped unless you want it.
- Imported arrests: a row with a first remand and no release date in an open case is treated as still in custody (the row warns about it); if the old export simply omits release dates, the officer must add them, or the deadline list will show false deadlines. A person whose session was opened before this release has no `can_set_policy` until they sign in again, so they will not see the policy form until then.
- Not built: evidence and notices files; fuzzy duplicate people; a real state export profile (needs a sample layout from a department); end-to-end browser test; `ai.cloud_allowed`.

Next
1. Evidence and notices files keyed by FIR (same pattern), or correction of time of arrest: your pick.
2. End-to-end browser test of the Load data screen with the three files in order (FIRs, arrests, chargesheets).
3. `ai.cloud_allowed` policy and the gateway refusing a cloud provider when it is off.

Blocked
- Live Claude/Gemini calls wait for API keys (using `fake`).

Questions for Sumit
1. Should the second-approver policy be switched on (value 0) for the state or district you will pilot in? Default stays "same person may approve".
2. Can you get a sample (fictional or masked) export from a pilot department's CCTNS or state system? A real column layout lets me write a state profile instead of the generic ones.
3. Next after imports: evidence and notices files, or correction of time of arrest?

## 29 Oct 2026, session 23 (scheduled nightly build, Sumit away)
Started from `setup/seed` at 349c122. The sandbox was empty: started PostgreSQL, created role `caseapp` and databases `caseapp_test`/`caseapp_dev`, installed `psycopg[binary]`, the gateway `requirements.txt` (note: `requirements-dev.txt` alone lacks fastapi/httpx) and `npm ci`. Baseline `scripts/test-all.sh`: all 7 lines PASS. (Hint: do not export `DATABASE_URL` as a postgresql:// URL for the whole shell; Spring reads it and fails with "url must start with jdbc".)

Done
- Paging for the FIR list: `GET /api/firs?limit=&offset=` (default 100, limit 1 to 200, offset 0 or more, otherwise 400; newest first, id as tie-break). Web FirList shows 50 per page with Newer/Older buttons (it asks for 51 rows to know whether a next page exists). No migration, no new dependency.
- Tests: `FirApiTest.listIsPagedNewestFirstAndRefusesBadBounds`; new `FirList.test.tsx` (3); `App.test.tsx` stub updated for the new URL.
- Final `scripts/test-all.sh`: PASS repo rules, PASS packs, PASS xlit, PASS ai-gateway, PASS web, PASS database rules, PASS core. Coverage: core 97% lines / 89% branches, web 99% statements / 83.5% branches / 94% functions, gateway 94%. No gate raised (no rise of 2 points).

Deliberately skipped / not checked
- Item 1 (arrests import) still waits for your answer. Jurisdiction as data (district table) not started: it needs a migration touching stations, access scope and policies, so I did not squeeze it into the remaining time. Not seen in a real browser. No total count is returned (the web uses the extra-row trick).

Next
1. Import phase 2: arrests file keyed by FIR (needs question 1 of session 22).
2. Jurisdiction as data (district table with ids; stations point at it).
3. end-to-end browser test; `ai.cloud_allowed` policy.

Blocked
- Item 1 waits for your answer. Live Claude/Gemini calls wait for API keys (using `fake`).

Questions for Sumit
1. (Open) Arrests first or chargesheets first for the import files?
2. (Open) Hide the policy form for people who cannot set policies?
3. (Open) Second person to approve an import?

## 28 Oct 2026, session 22 (scheduled nightly build, last of the night, Sumit away)
Started from `setup/seed` at the session 21 commit. PostgreSQL was started and the `caseapp` role and `caseapp_test`/`caseapp_dev` databases were created (the sandbox starts empty each night). Baseline `scripts/test-all.sh`: all 7 lines PASS.

Tonight in short
- Session 21 (earlier tonight): import duplicate-person warning for accused names.
- Session 22 (this one): web screens for policies and the role list. Next item 1 (arrests import) was skipped because it waits for your answer to question 1.
- Final `scripts/test-all.sh`: PASS repo rules, PASS packs, PASS xlit, PASS ai-gateway, PASS web, PASS database rules, PASS core. Coverage: core 97% lines / 89% branches, web 99% statements / 83% branches / 94% functions, gateway 94%. I raised two gates because coverage had risen: core branches 80 to 85, web branches 78 to 80.

Done
- Policies page (`PoliciesPage`, link "Policies" for every signed-in user): shows the value in force at your own station with its allowed range, a form to make a policy stricter for a state, district or station (with a written reason), and the recent changes you may see. The server still decides who may set what and refuses a looser value; its message is shown. No new endpoint, no new dependency.
- Role list on the admin page (read only, from `GET /api/roles`: role, whether a station is needed, permissions). It reads the packs, so no role names are hard-coded.
- Tests: `PoliciesPage.test.tsx` (5), one role-list test in `AdminPage.test.tsx`, one routing test in `App.test.tsx`; the new page has 100% coverage.

Deliberately skipped / not checked
- Not seen in a real browser. The policy form lets any signed-in user open the page and see policies; saving is refused by the server for anyone without the right (the history list then shows only what they may manage). No hide-the-form logic by permission yet.
- Not built: jurisdiction as data, paging for the FIR list, correction of time of arrest, end-to-end browser test, `ai.cloud_allowed`. No time left for older-code test additions beyond the above.

Next
1. Import phase 2: arrests file keyed by FIR, once you confirm the columns (question 1 below).
2. Jurisdiction as data (district table with ids) and paging for the FIR list.
3. end-to-end browser test; `ai.cloud_allowed` policy.

Blocked
- Item 1 waits for your answer. Live Claude/Gemini calls wait for API keys (using `fake`).

Questions for Sumit
1. Arrests first (who, when, remand dates, release, keyed by FIR number and year), or chargesheets first?
2. Should the policy form be hidden for people who cannot set policies, or is the server refusal enough for now?
3. (Still open) Second person to approve an import? Weekday 11:35 pm schedule testing prompt?

## 28 Oct 2026, session 21 (scheduled nightly build, Sumit away)
Started from `setup/seed` at d30c844. Baseline `scripts/test-all.sh` was green (PostgreSQL started locally; the Java tests use the default JDBC URL, the Python db tests need `DATABASE_URL=postgresql://...`).

Done
- Import phase 2, first slice: duplicate-person warning. When a file is checked, an accused whose name matches an accused of another FIR of the same station (or of an earlier row of the same file) gets a warning naming that FIR. Names are compared with case, spaces, dots and commas ignored. Nothing is merged and the row can still be imported; the message holds no personal data. Code: `ImportController.stage`, `FirImport.sameName`. No migration, no new dependency.
- Tests: 2 new API tests (flagged across FIRs and within the file, not merged; other station not flagged). Doc updated (`docs/INTEGRATION-IMPORT.md`). Full suite: all PASS.

Deliberately skipped / not checked
- Not built: separate people/arrest/chargesheet files keyed by FIR (needs your answer to question 1). Spelling-variant matching and matching across stations are not done; only exact normalised names. Only the accused role is compared (common witness and complainant names would only add noise).
- Risk: common names will produce warnings that are false alarms; the officer decides.

Next
1. Import phase 2 proper: arrests (and people details) file keyed by FIR, once you confirm the columns.
2. Web screens: policies and the role list. Jurisdiction as data and paging for the FIR list.
3. end-to-end browser test; `ai.cloud_allowed` policy.

Questions for Sumit
1. For the next import file, should I start with arrests (who, when, remand dates, release) keyed by FIR number and year? Or chargesheets first?
2. Should a same-name warning also compare complainants/witnesses, or accused only (as now)?
3. (Still open) Second person to approve an import? Weekday 11:35 pm schedule testing prompt?

## 28 Oct 2026, session 20 (Sumit present: loading existing data)
Sumit asked for an integration screen to load existing data, researched and designed in depth. Design and research: `docs/INTEGRATION-IMPORT.md`.

Decisions (Claude's, after research; Sumit can overrule)
- File-based CSV import first: CCTNS has no public API or schema and every state runs its own system. A direct connector comes later per state.
- Four deliberate steps (choose and match columns, check, approve with the authority, undo while untouched). Insert-only: an existing FIR is never changed. Missing facts are marked, never invented.
- New permission `import.run` (SHO own station, SP own district, state admin own state, platform admin any).

Done
- V22: `import_batch`, `import_row`, FIR columns (`import_batch_id`, `source_key`, `source_hash`, `concluded`), IPC 376 now masks victims and starts the 193(2) clock, concluded cases have no live deadlines.
- Core: `Csv`, `FirImport` (row checks), `ImportController` (profiles, inspect, stage, rows, errors.csv, commit, discard, undo, history), `CaseTeam.canAt`; `/api/me` and login return `can_import`. Pack data: `import-profiles/fir-generic.json`, `law-concordance.json` (draft, hint only).
- Web: "Load data" page (`ImportPage`).
- Tests: `CsvTest`, `FirImportTest`, `ImportApiTest` (14 cases incl. permissions, duplicates, undo guard, purge), security matrix additions, db tests, pack tests, web tests. Found and fixed a real bug on the way (jsonb reorders keys, which made the repeat-file fingerprint differ).
- Stopped tracking `apps/web/coverage` (generated); added to `.gitignore`.
- Full suite `scripts/test-all.sh`: all PASS.

Deliberately skipped / not checked
- Only the FIR file is built; people, arrests, chargesheets, evidence come later, keyed by FIR. No fuzzy duplicate-person matching across FIRs (the audits' main finding). No four-eyes rule (the same person may stage and approve). No retention purge of old batches. No Excel files. Not seen in a real browser.
- Risk: the IPC 376 rule treats every IPC 376 sub-section as 193(2)/masked; IPC 354 and others are not included. Prosecutor to confirm. The IPC-to-BNS table is a draft hint.
- Risk: undo relies on the database catalogue to find dependent tables; tables that reference FIRs without a foreign key would not be seen.

Next
1. Import phase 2: people/arrests/chargesheets files keyed by FIR, and duplicate-person warnings.
2. Web screens: policies and the role list. Jurisdiction as data and paging for the FIR list.
3. end-to-end browser test; `ai.cloud_allowed` policy.

Questions for Sumit
1. Should approving an import need a second person (the stager cannot approve their own batch)? I left it as one person for now.
2. Which real export format will your first state give us (columns, file type)? I can add a matching profile as soon as I see a sample with fictional or masked values.
3. Which old IPC sections beyond 376 must keep victim masking (for example 354 series)?
4. (Still open from session 19) Apply the testing prompt to the weekday 11:35 pm schedule?

## 28 Oct 2026, session 19 (Sumit present: tenancy, roles, policies, tests)
Sumit asked me to research and decide on multi-account permissions, an Odoo-like way to customise, per-state/district/station policy, thinking ahead, and a full test phase every day. Full design: `docs/ARCHITECTURE-TENANCY.md` and `docs/TESTING.md`.

Decisions (Claude's, after research; Sumit can overrule)
- A tenant is one state's installation (own servers and database in production). Inside it: state, district, station.
- Roles and permissions are data in `packs/*/roles.json` (Odoo groups / access rights / record rules, reduced). A pack can add roles and permissions, never remove or widen.
- Modules are pack folders: data only, validated at start-up. No code uploaded at run time on police servers.
- Each state, district and station can tighten a policy (never loosen), with a reason; the strictest applies; history kept. Live: `victim_update_days`, `session_hours`.

Done
- Found and fixed two real leaks: a state admin could manage every state's accounts and stations; the IO history of any FIR was readable by any signed-in user. Promoting someone to state admin no longer removes their station.
- V20 roles table filled from the packs; V21 policy settings and the policy-aware victim-update deadline; `Roles`, `Policies`, `PolicyController`, `ReadAccess` (case records readable only by the case team, evidence also by malkhana, FIR also by the station front desk).
- Earlier today: read access (case team only), punishment-table suggestion and warning, re-arrest custody days (V19).
- Tests: new `SecurityMatrixTest` (every route), `RolesTest`, `PoliciesTest`, `PolicyApiTest`, state-scoping test, db tests, pack tests, `tests/repo_rules`. Coverage gates now enforced: core 95/80 (today 97/85), web 95/78 (99/81), gateway 90 (94). `scripts/test-all.sh` runs everything: all PASS. CI now runs the gates and a nightly run.
- Schedule: four of the six nightly prompts now include a testing phase (baseline, build with tests, final run, coverage). The weekday 11:35 pm prompt was NOT changed (the update was declined); see question 1.

Deliberately skipped / not checked
- No web screens yet for roles or policies (API only). Not seen in a real browser.
- Policies are tighten-only integers; no other types yet. `ai.cloud_allowed` and the other ideas in section 5 of the tenancy doc are not built.
- The end-to-end browser test, upgrade test, load test and mutation tests (docs/TESTING.md, "Not covered yet") are not written.
- `GET /api/stations` and `/api/state-packs` are still open to every signed-in user (names only).

Next
1. Web screens: policies (view, tighten with reason) and the role list for the admin.
2. Jurisdiction as data (district table with ids) and paging for the FIR list.
3. Correction of the time of arrest, with a reason.
4. End-to-end browser test, then the upgrade test.
5. `ai.cloud_allowed` policy enforced in the AI gateway.

Blocked
- Live Claude/Gemini calls wait for API keys (using `fake`).

Questions for Sumit
1. Weekday 11:35 pm schedule still has the old prompt because you declined that one change. Should I apply the testing-phase prompt to it too?
2. Should SHOs be allowed to set their own station's policies (now yes), or only the SP and state admin?
3. Which policies do you want first beyond the two live ones (examples: supervisor review every N days, AI cloud on/off, minimum password length)?
4. Still open: after the Magistrate orders further investigation, does the 193(2) limit start again?

## 28 Oct 2026, session 18 (Sumit present, answered questions one by one)
Started from `setup/seed` at 9007bb2 (session 17). Sumit answered the open questions in chat; I built what they unblocked.

Sumit's answers (decisions)
1. Who may read a case: the case team only (IO, SHO of the station, SP of the district). Others get "not found".
2. Re-arrest: earlier custody days are added (they count towards the 60/90 days).
3. Highest punishment: suggest from the sections and warn on a different choice; a prosecutor checks the table.
4. BNSS 193(2) end rule: Sumit asked me to research. The Act's text (sub-sections 2, 3, 9) only ties the two months to completing the investigation; it says nothing about several accused. I kept today's rule (the first chargesheet ends the limit) and flag it for the prosecutor.
5. SHO may be the IO: yes (already how it works).
6. IO's correction needs no SHO confirmation (already how it works).
7. Corrections are allowed after the chargesheet, with reason and history (already how it works).
8. The time of arrest may be corrected, with a reason, visible to SHO/SP. NOT built yet (Next 1).
9. A closure report does not stop the custody limit (already how it works).

Done
- Read access (code only, no migration): `ReadAccess` interceptor makes every GET under `/api/firs/{id}/...` need the case team (404 otherwise); evidence also lets the station's malkhana staff in. `GET /api/firs` lists only FIRs you may read; `GET /api/firs/{id}` is for the case team and the front desk of the FIR's station (they register it). Writes were already team-only.
- Highest punishment: `packs/IN/punishments.json` (draft table of 17 sections, flagged for a prosecutor), `GET /api/firs/{id}/punishment-hint` suggests the heaviest class only when every section is in the table (BNS 3(5) has no penalty of its own and is ignored). The arrest form shows the suggestion and a warning when the chosen class differs; the officer decides. No new dependency.
- Re-arrest (migration V19): `earlier_custody_days` and `arrest_last_day`; days from first remand to release (both included) of each earlier arrest of the same person are taken off the 60/90, never going before the new first remand. Used by the deadline list and the arrest list; the arrest list says how many days were counted.
- Tests: core (with changed and 2 new tests), db 33 (1 new), packs 4 (1 new), web 58 (2 new), web build and lint pass; gateway 16, xlit 77.

Deliberately skipped / not checked
- Not seen in a real browser. The punishment table was written from memory of the BNS: please have a prosecutor check every line before it is trusted.
- The front desk of a station can read FIRs of that station (needed to register); I did not give them the records under it.
- Re-arrest counts only earlier arrests that have both a first remand and a release recorded.
- Read-access duplicates the team test in SQL once (`CaseTeam.CAN_READ_FIR`); I left `includes` as it was.

Next
1. Correction of the time of arrest, with a reason (the custody deadline is worked out again, with a visible note).
2. Admin password reset (needs session 13 question 4).
3. AI draft for the follow-up notice (needs session 8 question 4).
4. Re-check read access and the arrest form in a real browser.

Blocked
- Live Claude/Gemini calls wait for API keys (using `fake`).

Questions for Sumit
1. Still unanswered: after the Magistrate orders further investigation, does the 193(2) limit start again, and from which day?
2. Should the state admin reset a forgotten password, or the SP? (session 13 question 4)
3. Is it right to send a bank's or telecom company's name to the AI in a BNSS 94 draft, but never a person's name? (session 13 question 3)
4. Should I load Maharashtra ("MH") as the first state pack? (session 13 question 5)
5. When a notice reply brings only some items, should the app suggest a follow-up notice draft? (session 8 question 4)

## 28 Oct 2026, session 17 (scheduled nightly build)
Started from `setup/seed` at 4fe9464 (session 16). No answers from Sumit yet, no GitHub issues or comments, so every item in Next is still blocked. I built nothing and invented no feature.

Tests re-run (no database needed): gateway 16 (install both requirements.txt and requirements-dev.txt first), xlit 77, packs 3, web 56. All green. Core and database suites not re-run (no code changed since session 15).

Deliberately skipped / not checked
- No code, no new dependency, nothing committed except these notes.

Next
1. Read access rules once question 1 is answered.
2. Admin password reset (if question 4 of session 9 is yes).
3. AI draft for the follow-up notice (if question 4 of session 8 is yes).
4. Highest punishment from the sections, if question 3 is yes.
5. Otherwise: Sumit names the next feature.

Blocked
- Live Claude/Gemini calls wait for API keys (using `fake`).
- Items 1-4 wait for Sumit's answers.

Questions for Sumit
1. Please answer the open questions listed in session 14, or name the next feature. Until then the nightly sessions will only re-run tests.
2. Should I pause the nightly schedule until you reply?

## 27 Oct 2026, session 16 (scheduled nightly build, last of the night)
Tonight in short
- Session 13: closure report (case ends without a chargesheet).
- Session 14: correction of a closure report and the Magistrate's decision on it.
- Session 15: browser check of the corrections and closure screens (all worked, no errors).
- Session 16 (this one): no new feature. Every item left in Next needs an answer from Sumit, and I will not invent features meanwhile.

Started from `setup/seed` at 74e1367 (session 15). I only re-ran the tests that need no database: gateway 16 (needed its Python packages installed first), xlit 77, packs 3, web 56. All green. The core and database suites were not re-run tonight (no code changed since session 15, where they were green).

Deliberately skipped / not checked
- No code, no new dependency, nothing committed except these notes.

Next
1. Read access rules once question 1 is answered.
2. Admin password reset (if question 4 of session 9 is yes).
3. AI draft for the follow-up notice (if question 4 of session 8 is yes).
4. Highest punishment from the sections, if question 3 is yes.
5. Otherwise: Sumit names the next feature.

Blocked
- Live Claude/Gemini calls wait for API keys (using `fake`).
- Items 1-4 wait for Sumit's answers.

Questions for Sumit
1. Please answer the open questions listed in session 14 (who may read a case; re-arrest day counting; highest punishment table; BNSS 193(2) end rule; SHO as IO; IO correction needing SHO confirmation; correction after the chargesheet; correcting the time of arrest; closure report and the custody limit).
2. After the Magistrate orders further investigation, should the 193(2) limit start again, and from which day?
3. Should correction forms close by themselves after a save?
4. If you cannot answer these soon, which new feature should the nightly sessions build instead?

## 27 Oct 2026, session 15 (scheduled nightly build)
Started from `setup/seed` at f203574 (session 14). Local PostgreSQL had to be started and the test role created first. Items 1-4 of Next still wait for Sumit, so I took item 5 (browser check). No code changed tonight.

Done
- Real-browser check (headless Chromium against the running core app, a local dev database and the Vite web app; fictional case, SI Asha Rao as IO, one accused arrested). All of these worked with no browser console errors:
  - Closure report: form opens, report recorded and shown.
  - Correction of the closure report: form starts from the current values; saving shows the new number (CR-1A) and a history line with the reason.
  - Magistrate's decision: recorded once and shown ("Magistrate accepted the report on 2026-10-25. Order 7"); the decision form disappears afterwards.
  - Arrest memo correction: form starts from the current place; saving shows the new place and a "Memo corrected ... Reason: ..." line.
- Core tests re-run on the real database: green. Other suites unchanged since session 14.

Small things noticed (not changed)
- After saving, the correction forms stay open (plain collapsible sections). Harmless.
- The check was by script, not by eye: layout and Marathi/Hindi typing in the corrected fields were not looked at.

Deliberately skipped / not checked
- Release, chargesheet corrections and the deadline list were not re-checked in a browser (earlier sessions covered them with stubbed tests only).

Next
1. Read access rules once question 1 is answered.
2. Admin password reset (if question 4 of session 9 is yes).
3. AI draft for the follow-up notice (if question 4 of session 8 is yes).
4. Highest punishment from the sections, if question 3 is yes.
5. The planned items are used up. Waiting for Sumit to name the next feature; I will not invent features meanwhile.

Blocked
- Live Claude/Gemini calls wait for API keys (using `fake`).
- Items 1-4 wait for Sumit's answers.

Questions for Sumit
1. Please answer the open questions from sessions 9-14 (listed in session 14), or name the next feature.
2. Should correction forms close by themselves after a save?

## 27 Oct 2026, session 14 (scheduled nightly build, 21:05 IST)
Started from `setup/seed` at 1f62454 (session 13). Local PostgreSQL had to be started and the test role created first. Items 1-4 of Next still wait for Sumit, so I took item 5.

Done
- Correction of a closure report and the Magistrate's decision on it (migration V18). A correction restates the whole report (date, court, number, ground, reason, informant date) with a written reason of 10+ characters; the first report is never edited, the newest correction counts, older ones stay (same pattern as the other corrections). The same date rules as the first entry apply. `POST/GET /api/firs/{id}/closure-report/corrections`; `GET .../closure-report` now returns the current values, `corrected`, and the decision.
- The Magistrate's decision (accepted, or further investigation ordered) with the date (not before the filing day, not in the future) and an optional order number/note. Recorded once and kept as written (database trigger); `POST .../closure-report/decision`. It changes no deadline, and a chargesheet can still be recorded afterwards.
- Web: on the FIR page the closure section now shows the current report, the decision (or a form to record it), a "Correct this closure report" form that starts from the current values, and the correction history with reasons.
- Tests: gateway 16, xlit 77, db 32 (1 new), packs 3, core 49 (1 new; migration check now expects V18), web 56 (2 new); web build and lint pass.

Deliberately skipped / not checked
- Not checked in a real browser (unit tests with stubbed requests and real database tests only). The browser check of the corrections and closure screens is still open.
- A wrong decision cannot be corrected (kept as written). "Further investigation ordered" does not re-open the 193(2) two-month limit and does not remove the closure report; I did not guess the rule (question 2).
- A correction is open to any case-team member, like the other corrections. No new dependency.

Next
1. Read access rules once question 1 is answered.
2. Admin password reset (if question 4 of session 9 is yes).
3. AI draft for the follow-up notice (if question 4 of session 8 is yes).
4. Highest punishment from the sections, if question 3 is yes.
5. If all of 1-4 are still waiting: a browser check of the corrections, closure and decision screens; then ask Sumit what the next real feature should be (the planned items are used up).

Blocked
- Live Claude/Gemini calls wait for API keys (using `fake`).
- Items 1-4 above wait for Sumit's answers.

Questions for Sumit
1. Still open (sessions 9-13): who may read a case; re-arrest day counting; highest punishment table; BNSS 193(2) end rule; SHO as IO; whether an IO's correction needs SHO confirmation; whether a correction is allowed after the chargesheet is filed; whether the time of arrest may be corrected; whether a closure report should also stop the custody limit.
2. When the Magistrate orders further investigation after a closure report, should the 193(2) two-month limit start again (and from which day)? Today nothing changes.
3. I am running out of planned items that do not need your answers. Please answer the open questions above, or name the next feature you want.

## 27 Oct 2026, session 13 (scheduled nightly build, last of the night)
Tonight in short
- Session 11: corrections of a wrong arrest remand date, punishment class, release and chargesheet (old record always kept, reason required).
- Session 12: correction of the arrest memo itself (place, grounds told, person informed).
- Session 13 (this one): the closure report, so a case that ends without a chargesheet can be recorded.

Started from `setup/seed` at 45873b3 (session 12). Local PostgreSQL had to be started and the test role created first. Items 1-4 of Next still wait for Sumit, so I took item 5 (closure report).

Done
- Closure report (migration V17, `POST/GET /api/firs/{id}/closure-report`). Recorded once per case and kept as written (database trigger; no edit, no delete). It holds the filing date, court, report number, a ground from a fixed list (accused not traced, not enough evidence, complaint found false, civil in nature, other), a written reason of 10+ characters and, if already done, the date the informant was told (not before the filing day, not in the future). The filing date cannot be before the FIR or in the future. Only the case team can record it.
  - Effect: it ends the BNSS 193(2) two-month limit (investigation is over). It does NOT end the custody limit: an accused still in custody stays on the deadline list until the release is recorded.
  - It is refused (409) while a current chargesheet exists in the case.
  - Web: "Closure report" section on the FIR page: a form while none is recorded, the recorded report afterwards.
- Tests: gateway 16, xlit 77, db 31, packs 3, core 48 (2 new closure tests; the migration check now expects V17), web 54 (2 new); web build and lint pass.

Deliberately skipped / not checked
- Not checked in a real browser (unit tests with stubbed requests and the real database tests only). The browser check of the corrections screens from session 12's Next 5 is still not done.
- No correction of a closure report and no "Magistrate accepted / ordered further investigation" step; a wrong entry cannot be fixed yet. A chargesheet can still be recorded after a closure report (further investigation); I did not block it.
- The 90-day victim update deadline is not changed by a closure report; the informant date is only stored.
- No new dependency.

Next
1. Read access rules once question 1 is answered.
2. Admin password reset (if question 4 of session 9 is yes).
3. AI draft for the follow-up notice (if question 4 of session 8 is yes).
4. Highest punishment from the sections, if question 3 is yes.
5. If all of 1-4 are still waiting: correction of a closure report and the Magistrate's decision on it (accepted / further investigation ordered), then a browser check of the corrections and closure screens.

Blocked
- Live Claude/Gemini calls wait for API keys (using `fake`).
- Items 1-4 above wait for Sumit's answers.

Questions for Sumit
1. Still open (sessions 9-12): who may read a case; re-arrest day counting; highest punishment table; BNSS 193(2) end rule; SHO as IO; whether an IO's correction needs SHO confirmation; whether a correction is allowed after the chargesheet is filed; whether the time of arrest may ever be corrected.
2. Should a closure report also stop the custody limit, or keep it until the release is recorded (what I did)?
3. Should the Magistrate's decision on a closure report (accepted, or further investigation ordered) be recorded in the app?

## 26 Oct 2026, session 12 (scheduled nightly build)
Started from `setup/seed` at 9cd7eb5 (session 11). Local PostgreSQL had to be started and the test user created first.

Done
- Correction of the arrest memo itself (Next 5): place, grounds told to the person (BNSS 47) and the relative/friend informed (BNSS 48). Same pattern as the other corrections: the memo is never edited; a correction is a new row with a reason of 10+ characters, the newest counts, the old ones stay. Migration V16 (`arrest_memo_correction`, view `arrest_memo_current`). The person arrested, the time and the arresting officer cannot be corrected (the time sets the IST day the custody limit is checked against).
  - `POST .../arrests/{id}/memo-corrections`, `GET .../arrests/memo-corrections`. The arrest list now shows the current memo and says `memo_corrected`. The informed person's name and contact are hidden from people outside the case team, in the list and in the history.
  - Web: "Correct the place, grounds or informed person" on each arrest (starts from the current memo; grounds use the typing field) and the memo correction history with reasons.
- Tests: gateway 16, xlit 77, db 30, packs 3, core 46, web 52; web build and lint pass.

Deliberately skipped / not checked
- Not checked in a real browser (unit tests with stubbed requests and the real database tests only).
- No new dependency. The memo correction is open to any case-team member, like the other corrections.
- The correction history shows all memo corrections of an arrest, not only the newest.

Next
1. Read access rules once question 1 is answered.
2. Admin password reset (if question 4 of session 9 is yes).
3. AI draft for the follow-up notice (if question 4 of session 8 is yes).
4. Highest punishment from the sections, if question 3 is yes.
5. If all of 1-4 are still waiting: a browser check of the corrections screens, then a closure report (record that a case was closed without a chargesheet).

Blocked
- Live Claude/Gemini calls wait for API keys (using `fake`).
- Items 1-4 above wait for Sumit's answers.

Questions for Sumit
1. Still open (sessions 9-11): who may read a case; re-arrest day counting; highest punishment table; BNSS 193(2) end rule; SHO as IO; whether an IO's correction needs SHO confirmation; whether a correction is allowed after the chargesheet is filed.
2. Should the time of arrest (not only place and grounds) ever be correctable? It would move the custody-limit day, so I left it out.

## 26 Oct 2026, session 11 (scheduled nightly build)
Started from `setup/seed` at e7733d0 (session 10). Local PostgreSQL had to be started and the test user created first.

Done
- Corrections of a wrong arrest remand date, punishment class, release or chargesheet (Next 1). Nothing is ever edited or deleted; a correction is a new record with a written reason (10+ characters), same pattern as 63(4) certificates. Migration V15.
  - Arrest: a correction restates the four facts the custody limit uses (first remand, highest punishment, release date and basis) and replaces the newest earlier version. Leaving the release empty says the person was not released (so a release entered on the wrong arrest can be undone). The memo itself stays as written. The deadline list and the arrest list use the newest version; once an arrest has a correction, the old "record the first remand / release" buttons are closed and only corrections work. `POST .../arrests/{id}/corrections`, `GET .../arrests/corrections` (history). The arrest list says `corrected`.
  - Chargesheet: a correction is a new chargesheet (date, court, number, accused named) that replaces the current one. The old entry stays, shown struck through with "replaced by a later entry"; only the current entries stop the 60/90-day limit and the BNSS 193(2) limit. A chargesheet can be replaced once; the newest is corrected next. `POST .../chargesheets/{id}/corrections`.
  - Only the case team can correct; the same date rules as before apply (remand and release not before the arrest day, release and filing not in the future).
  - Web: "Correct the remand, punishment or release" on each arrest (starts from what is recorded, shows the correction history with reasons) and "Correct this chargesheet entry" on each current chargesheet.
- Tests: gateway 16, xlit 77, db 29, packs 3, core 45, web 51; web build and lint pass.

Deliberately skipped / not checked
- Not checked in a real browser this run (only unit tests with stubbed requests and the real database tests).
- A correction of the arrest memo itself (place, grounds, time, the person) is not possible; only the four deadline facts. A wrong memo would need a separate rule.
- A chargesheet cannot be withdrawn without naming a replacement; a closure report is still not recorded.
- Corrections of the arrest are not limited to a role (any case-team member can correct); the reason and name are kept.
- The correction history shows all corrections of an arrest, not only the newest.

Next
1. Read access rules once question 1 is answered.
2. Admin password reset (if question 4 of session 9 is yes).
3. AI draft for the follow-up notice (if question 4 of session 8 is yes).
4. Highest punishment from the sections, if question 3 is yes.
5. If all of 1-4 are still waiting: correction of the arrest memo itself (place, grounds, informed person) with a reason, and a browser check of the corrections.

Blocked
- Live Claude/Gemini calls wait for API keys (using `fake`).
- Items 1-4 above wait for Sumit's answers.

Questions for Sumit
1. Still open (session 10, questions 1-5): who may read a case; re-arrest day counting; highest punishment table; BNSS 193(2) end rule; SHO as IO.
2. Corrections today can be made by any member of the case team. Should an IO's correction of a remand date or release need the SHO to confirm it?
3. Should a correction be allowed after the chargesheet is filed, or only before?

## 26 Oct 2026, session 10 (weekend, Sunday night, 02:05 IST run, last of the night)
Tonight in short
- Session 8 (21:05): AI gateway checks every token with the core app (disabled users and old tokens refused); web forms for notices, replies and 63(4) certificates.
- Session 9: state admin screens (accounts, disable/enable/unlock with a reason, stations, sign-in log, admin log); AI draft of a notice through the gateway with accept/edit/reject logged.
- Session 10 (this one): arrests in the web app with stricter legal rules; release from custody and chargesheets now stop the 60/90-day limit; IO can be assigned and changed by the SHO/SP; state admin can change an account's role, rank or station.

Started from `setup/seed` at 2c1670f (session 9). All suites green before any change.

Done
- Arrests (Next 1). Core: only an accused can be arrested; the signed-in officer is recorded as the arresting officer (the API no longer takes an officer id); arrest time cannot be in the future; the first remand cannot be before the arrest day (IST) and can be recorded later, once ("Record the first remand"); the memo is kept as written (database trigger). `GET .../arrests` lists each arrest with its own BNSS 187(3) last day. The relative or friend informed (BNSS 48) is shown only to the case team. Web: "Arrests" section on the FIR page (accused only, grounds one per line with the TypingField, India time, highest punishment with 60/90 days shown). Migration V11.
- Release and chargesheet (legal logic from the weekly review's "still worried" list). Release from custody (bail, default bail, otherwise) is recorded once per arrest; a chargesheet (court, number, accused it names) is recorded and kept as written, supplementary ones as new entries. The custody limit stops for an accused who is released or named in a filed chargesheet; the BNSS 193(2) two-month limit stops when any chargesheet is filed. The arrest list keeps showing the last day and says if the chargesheet came after it. Web: "Record release from custody" and a "Chargesheets" section. Migration V14.
- Assign or change the IO (found while doing Next 3: an FIR registered at the front desk had no way to get an IO). The SHO of the station or the district SP assigns the IO; changing from one IO to another needs a reason; only an active IO or SHO of the FIR's station can be IO (also checked when an FIR is registered with an IO). Every assignment is kept; the FIR page shows the IO and the IO history. The old IO leaves the case team at once. Migration V13.
- Admin: change an account's role, rank or police station with a reason (Next 3, without the password reset). The admin log keeps what changed ("role io to sho; station A to B"); the officer's older tokens end; the answer says how many FIRs still name the officer as IO, so the SHO can give those cases to someone else. The admin cannot change their own account. Migration V12.
- Checked against the running core app and the web app in a real browser with fictional users: SHO registers an FIR and assigns the IO, IO adds an accused, records an arrest and the first remand (last day 11 Nov shown), records a release on bail; the custody deadline leaves the deadline list.
- Tests: gateway 16, xlit 77, db 28, packs 3, core 44, web 49; web build and lint pass.

Deliberately skipped / not checked
- The officer chooses the highest punishment (60 or 90 days); the app does not work it out from the sections, because the national pack has no punishment table yet (question 3).
- A wrong arrest memo, remand date, release or chargesheet cannot be withdrawn or corrected yet (all kept as written). A wrong first remand date gives a wrong deadline until a correction step exists.
- A re-arrest after release (for example bail cancelled) is a new arrest memo; its own remand starts a new 60/90 count. Whether the earlier custody days should be added is not handled (question 2).
- Closure reports (no accused named) are not recorded; a chargesheet must name at least one accused.
- Admin password reset still waits for question 4 of session 9. No edit of an account's name, no edit of a station.
- When an IO is transferred to another station, their FIRs are not moved automatically; the SHO must give them to another IO.
- The fresh demo database has no state pack; I added the "IN" row by hand for the browser check (question 5 of session 9 still open).

Next
1. Correction of a wrong arrest memo, remand date, release or chargesheet: a new record that names the one it replaces, with a reason (same pattern as 63(4) certificates).
2. Read access rules once question 1 is answered.
3. Admin password reset (if question 4 of session 9 is yes).
4. AI draft for the follow-up notice (if question 4 of session 8 is yes).
5. Highest punishment from the sections, if question 3 is yes.

Blocked
- Live Claude/Gemini calls still wait for API keys (unchanged; using `fake`).
- Read access (question 1), password reset (session 9 question 4), follow-up notice draft (session 8 question 4).

Questions for Sumit
1. Still open: who may read a case? Every signed-in user can still open any FIR (victim details and the arrested person's relative stay hidden).
2. For the prosecutor: when an accused is released and re-arrested in the same case, should the 60/90 days count again from the new remand, or add the earlier custody days?
3. Should I add the highest punishment for each section to the national pack (e.g. BNS 318(4) up to 7 years), so the app suggests 60 or 90 days and warns if the officer picks differently? A prosecutor should check the table.
4. For the prosecutor: is it right that the BNSS 193(2) two-month limit ends when the first chargesheet is filed, even if some accused are still under investigation?
5. Can an SHO be made IO of a case at their own station (allowed now), or only officers with the IO role?

## 25 Oct 2026, session 9 (weekend, Sunday 21:05 run, second session tonight)
Started from `setup/seed` at b0211f6 (session 8). All suites green before any change.

Done
- State admin screens (Next 1). New "Admin" page (state admin only) and `AdminController`:
  - Accounts: list (station, active / locked until / disabled; never a password hash), create, disable, enable, unlock. Disable, enable and unlock need a written reason (10+ characters). The admin cannot disable their own account, so one active state admin always remains.
  - Disabling also ends every token issued before it for good: if the account is enabled again, the officer must sign in again (old tokens do not come back to life).
  - Unlock ends a sign-in lock before its 15 minutes are up; it is written to the sign-in log as "unlocked by the state admin" and counts like a successful sign-in for the lock rule. Only a locked account can be unlocked.
  - Station roles (IO, front desk, SHO, SP, malkhana) must have a police station when the account is created (before, an IO without a station could be created and could never register an FIR).
  - Police stations: list (any signed-in user; no case data in it) and add (state admin; the state must be a loaded state pack; CCTNS code unique). `GET /api/state-packs` lists the packs.
  - Admin log: every account and station change, who made it, when, and the reason; kept as written (database trigger). `GET /api/admin-actions`. Migration V10.
  - `POST /api/users` moved from `AuthController` to `AdminController`; `AuthController` now only signs in, says who you are and changes your own password.
- AI draft of a notice (Next 2). In "Write a notice", "Draft the text with AI" asks the AI gateway (feature `notice_draft`, prompt version `notice_draft/notice@1`, template in `apps/web/src/noticePrompt.ts`). Only the notice's own facts are sent: kind, FIR number and sections, the items, and the addressee only for BNSS 94 (usually a bank or telecom company). Never the complaint text, never names of people: for BNSS 35(3), 179 and follow-up notices the addressee is left as a blank for the officer. The draft is shown apart in a dashed box marked "AI draft - check before use"; it goes into the notice text only when the officer clicks "Use this draft", and they can edit it. When the notice is saved, its `ai_request_id` is kept and the gateway's audit log gets the decision: accepted (used unchanged), edited, or rejected (discarded or not used). The notice list says "text drafted with AI, checked by the officer". Gateway errors now show the gateway's reason (for example "ANTHROPIC_API_KEY is not set").
- Checked in a real browser with fictional demo users: admin adds a station and an IO, five wrong passwords lock the IO, admin unlocks with a reason, disables with a reason; IO drafts a BNSS 94 notice with the `fake` provider, edits it, saves; gateway audit shows `ai_request` then `edited`, chain intact.
- Tests: gateway 16, xlit 77, db 26, packs 3, core 39, web 41; web build and lint pass.

Deliberately skipped / not checked
- No admin password reset for a forgotten password, no edit of an account (name, rank, role, station) and no edit of a station. A wrong account can be disabled and a new one made.
- The account list asks the lock state once per account (one small query each); fine for a demo, slow for thousands of accounts.
- The AI prompt is built in the browser. A signed-in officer could send other text to `notice_draft`; it is still audit-logged (hash, prompt version, user). Moving prompt building to the server is a later step if wanted.
- The core app does not check that an `ai_request_id` really exists in the gateway (the two do not talk about AI requests). If the decision cannot be logged after the notice is saved, the officer sees a message; the notice is not saved twice.
- A draft that was asked for and then left (page closed without saving) has no decision in the log.
- With no API keys, the default provider (Claude) answers 502; the state admin must switch `notice_draft` to `fake` for a keyless demo.

Next
1. Web form for arrests (BNSS 35 memo; feeds the 60/90-day deadline).
2. Read access rules once question 1 is answered.
3. Admin: reset a forgotten password (officer must change it at next sign-in), edit an account's role or station (with reason, logged).
4. AI draft for the follow-up notice when a reply brings only some items (if question 4 of session 8 is yes).

Blocked
- Live Claude/Gemini calls still wait for API keys (unchanged; using `fake`).

Questions for Sumit
1. Still open: who may read a case? Every signed-in user can still open any FIR (victim details stay hidden).
2. Still open: should the SHO or SP approve when an IO accepts or withdraws a gap?
3. Is it right to send a bank's or telecom company's name to the AI in a BNSS 94 draft, but never a person's name?
4. Should the state admin be able to reset a forgotten password, or should that go through the SP?
5. A station can only be added for a state whose pack is loaded (only the national pack "IN" exists). Should I load Maharashtra ("MH") as the first state pack so demo stations can be in Maharashtra?

## 25 Oct 2026, session 8 (weekend, Sunday 21:05)
No weekly review tonight: this week's review was done on Saturday 24 Oct. I re-read last night's sign-in and readiness code before building on it (notes below).

Done
- AI gateway checks every token with the core app (Next 2). After the signature check, the gateway asks the core app (`GET /api/me`, address in `CORE_URL`, default `http://localhost:8080`) whether the token still belongs to an active user whose password has not changed since. A disabled user or a token from before a password change is refused (401). A yes is remembered for 30 seconds (by a hash of the token, never the token itself), so a disabled user stops working at the gateway within 30 seconds. If the core app cannot be reached the gateway refuses (503): it never lets a token through unchecked. The role used for "state admin only" is now the role the core app has now, not the one written in the token. Checked live: core app + gateway, password changed, old token refused at the gateway, new token works.
- Notices in the web app (Next 1). Write a notice (kind, addressee, items to produce one per line, text with the TypingField), save it as a draft or sign and send at once. "Sign and send this notice" for drafts; the signer is always the signed-in officer. "Log a reply": the officer ticks which of the outstanding items the reply brought; the list shows each item as received or not received yet. Notices without an items list get one check, "Reply answers the notice fully".
- Core API for that: `POST .../notices/{id}/send` (drafts only, once); the notices list now gives the items as a real list (an item may contain ";"), the items still missing and the signer's name; a reply cannot be logged against a draft or cancelled notice (409); a reply due date before the issue day (IST) is refused (migration V9).
- 63(4) certificates in the web app (Next 1). Under each electronic item: its certificates (part, signer, device, place, IST time, whether the hash matches the seizure SHA-256, corrections and what replaced what) and "Add a 63(4) certificate". A correction picks the current certificate it replaces (same part only) and needs a reason of 10+ characters; replaced certificates cannot be replaced again. New `GET .../evidence/{item}/certificates`.
- Checked in a real browser with fictional demo users and a fictional case: write, send, reply (one item missing shown), add a Part A certificate (hash matches; item still not court-ready without Part B).
- Tests: gateway 16, xlit 77, db 25, packs 3, core 34, web 34; web build and lint pass.

Review notes on last night's code (no change needed)
- Sign-in lock, password stamp in the token and withdrawals behave as described; the stamp is compared at millisecond precision on both sides, so it cannot drift.
- The reply rule still matches items by exact text; the web form now sends the exact item names, so this is safe as long as replies come through the form.

Deliberately skipped / not checked
- The 30-second memory in the gateway means a just-disabled user can still use AI features for up to 30 seconds. Every gateway call costs one call to the core app after that.
- No form for arrests yet; no cancel of a notice; no edit of a draft notice (write a new one). AI drafting of notices is not wired into the form yet (the gateway is ready; needs a prompt template and the accept/edit/reject step).
- A certificate whose hash does not match is saved (that is what the paper says); the screen and the readiness check show it as not matching. The officer must sort it out with a correction.
- Read access is still open to every signed-in user (question 1).

Next
1. State admin screens: users (create, disable), stations, sign-in log, unlock.
2. AI draft of a BNSS 94 notice in the notice form, through the gateway, with accept/edit/reject logged and `ai_request_id` saved on the notice.
3. Web form for arrests (BNSS 35 memo; feeds the 60/90-day deadline).
4. Read access rules once question 1 is answered.

Blocked
- Live Claude/Gemini calls still wait for API keys (unchanged; using `fake`).

Questions for Sumit
1. Still open: who may read a case? Now every signed-in user can open any FIR (victim details stay hidden).
2. Still open: should the SHO or SP approve when an IO accepts or withdraws a gap?
3. Is 30 seconds right for how long the AI gateway trusts a checked sign-in? Shorter is safer but makes every AI call slower.
4. When a notice reply brings only some items, should the app suggest a follow-up notice for the rest (as a draft for the officer)?

## 25 Oct 2026, session 7 (weekend, 02:05, last of the night)
Tonight in short
- 21:05: weekly review of everything so far, 7 fixes (IST deadline dates, victim masking by section, complaint text withheld, BNSS 193(2) by section, fixed evidence hash, stricter notice completion, AI admin lock covers the model); typing tool in the web app; AI settings screen.
- 23:35: login and roles (tokens, case team rules, AI gateway checks the same token); 63(4) certificates can no longer be edited; first readiness check (playbook, evidence per ingredient, gaps, accept a gap with a reason).
- 02:05: account-holder second link in the readiness check; sign-in safety (lock, log, password change); withdraw a wrong link or an accepted gap; web forms to register an FIR and add people and evidence.

Done
- Account-holder second link (Next 2). The case team marks an accused as an account holder, with the basis (for example "Bank reply to notice N-3"), and links evidence to each accused by link type (SIM or device, KYC identification, CCTV of withdrawal, login IP, own statement; the list comes from the playbook rule). Each account holder without such a link is a critical gap; it can be accepted with a reason like any gap. Electronic evidence linked this way also needs its 63(4) certificate. Only accused people can be marked or linked; records from another case are refused by the database. The rule is no longer in "checks for a person to confirm". Migration V6.
- Sign-in safety (Next 3). Every sign-in attempt is logged (username tried, result, IP, time; never the password). 5 wrong passwords within 15 minutes lock that username for 15 minutes; unknown usernames lock the same way, so the lock does not show which accounts exist; attempts made while locked do not extend the lock. The answer says when to try again (IST). Users can change their own password (current password needed; 12+ characters); every older token stops working at once and the tab gets a new one. The state admin can read the sign-in log (`GET /api/sign-ins`). Migration V7. Web: "Password" page; the lock message is shown on sign-in.
- Withdrawals (Next 4). A wrong evidence link, a wrong accused link or an accepted gap can be withdrawn with a reason (10+ characters). Nothing is deleted: the row keeps who withdrew it, when and why; the database allows only that one change, once. The report lists withdrawn records; the same link or acceptance can be made again. Migration V8. Web: "Withdraw" next to each link and accepted gap.
- Web forms (part of Next 1): register an FIR at the officer's own station (sections typed as "BNS 318(4), IT Act 66D", times read as IST, an IO can name themselves as IO, information typed with the TypingField in any of the 10 scripts), add a person, add evidence (SHA-256 required for electronic items). Dates on screen are now always shown in IST. Readiness forms clear after saving.
- Checked in a real browser against the running core app with fictional demo users: register FIR, add accused and evidence, choose playbook, mark account holder, add and withdraw a link, change password.
- Tests: gateway 12, xlit 77, db 25, packs 3, core 32, web 29; web build and lint pass.

Deliberately skipped / not checked
- An account holder cannot be un-marked yet (the mark is kept as written). If a person's role is changed later in the database, an existing mark is not re-checked (there is no edit of people yet).
- The lock counts per username, not per IP; many usernames from one machine are not slowed down. Two guesses at exactly the same moment can both pass the limit. Behind a proxy the log records the proxy's IP (X-Forwarded-For is not read on purpose until we know the server set-up).
- No admin "unlock now" and no screen for the sign-in log yet (API only).
- The AI gateway still cannot see a password change or a disabled user; old tokens keep working there until they expire (max 8 hours).
- Forms not built yet: notices, notice replies, 63(4) certificates, arrests. No edit of people or evidence. Users and stations still only through the API.
- AI gateway and packs not changed tonight (tests re-run, green).

Next
1. Web forms for notices (BNSS 94 items list), notice replies and 63(4) certificates (Part A/B), using `TypingField`.
2. AI gateway: refuse tokens of disabled users and tokens issued before a password change (ask the core app, or keep a short list).
3. State admin screens: users (create, disable), stations, sign-in log, unlock.
4. Read access rules once question 1 is answered.

Blocked
- Live Claude/Gemini calls still wait for API keys (unchanged; using `fake`).

Questions for Sumit
1. Still open: who may read a case? Now every signed-in user can open any FIR (victim details stay hidden).
2. Still open: should the SHO or SP approve when an IO accepts a gap? And the same for withdrawing an accepted gap?
3. Is 5 wrong passwords then 15 minutes locked right for the demo? Should the state admin be able to unlock early?
4. Still open: should I add a script that creates fictional demo users and one fictional cyber-fraud case for the demo?

## 24 Oct 2026, session 6 (weekend, 23:35)
Done
- Login and roles (Next 1). `POST /api/login` (username + password, bcrypt) gives an 8-hour signed token (HS256, `AUTH_SECRET`); `GET /api/me`; `POST /api/users` for the state admin only. The first admin comes from `BOOTSTRAP_ADMIN_USERNAME`/`BOOTSTRAP_ADMIN_PASSWORD` at start-up, so no password is in the code. Wrong user, wrong password and disabled user all get the same answer. A disabled user is refused at once even with a valid token. `X-User-Id` is gone; every API needs a token. New dependency: Spring Security resource server (the platform's own token checking; a state single sign-on can replace our login later by swapping one bean).
- Who may do what: case team = the IO, the SHO of the FIR's station and the SP of its district (before: any SHO/SP anywhere). Only the case team adds people, arrests, evidence, notices, replies and certificates; custody also by the station's malkhana staff; FIRs only by front desk/IO/SHO of that station. A sent notice is signed by the signed-in officer, not a name in the request.
- AI gateway checks the same token (standard library only). The audit log records the signed-in user, not a name sent in the request. Only the state admin changes AI settings or reads the audit log. Each request must name its prompt version; the log keeps it, the safety-rules version and a SHA-256 of the exact text (not the text itself).
- 63(4) certificates (Next 4): can never be edited or deleted; a correction is a new certificate that names the one it replaces, with a reason. Readiness uses only the current certificates and accepts only SHA-256 that matches the item (an MD5 certificate is no longer counted as "matching").
- Readiness check (Next 3): the case team picks the playbook; links each evidence item to the charge ingredient it proves; the report lists, for each charge in the FIR that the playbook covers, the linked evidence and the gaps (ingredient with nothing linked; electronic evidence without a full 63(4) certificate). A gap can be accepted only with a written reason (10+ characters); it stays listed with who accepted it, and can never be edited or deleted. Rules the app cannot check yet are listed for a person to confirm. FIR sections the playbook does not cover are listed. No score or percentage anywhere.
- Web: sign-in page, token on every call, sign out, AI settings link only for the state admin; readiness section on the FIR page. Checked in a real browser against the running core app and gateway (fictional demo users).
- Migrations V3 (login), V4 (certificate corrections), V5 (readiness). Tests: gateway 12, xlit 77, db 24, packs 3, core 26, web 16; web build passes.

Deliberately skipped / not checked
- No limit on repeated wrong passwords yet, and no record of sign-ins. Needed before any pilot.
- The token is kept in the browser tab's session storage (gone when the tab closes); a script injected into the page could read it.
- The AI gateway cannot see that a user was disabled; their token keeps working there until it expires (max 8 hours).
- Reading (FIR list, FIR detail, deadlines, evidence, readiness) is open to every signed-in user; only writes and victim details are limited. See question 1.
- Readiness: a wrong link cannot be removed yet; an accepted gap cannot be withdrawn; the account-holder "second link" rule is listed for a person to confirm, not checked (the data does not yet say which accused is an account holder). Sections must match the playbook exactly ("BNS 318" does not match "BNS 318(4)").
- No screens yet for users, stations or creating FIRs/evidence (Next 1). Demo users are created through the API.

Next
1. Web forms to create FIRs, people, evidence, notices and 63(4) certificates, using `TypingField`.
2. Account-holder second-link rule in the readiness check (mark an accused as account holder; link evidence per accused).
3. Sign-in safety: lock after repeated wrong passwords, sign-in log, password change.
4. Remove a wrong readiness link (kept in history) and withdraw an accepted gap.

Blocked
- Live Claude/Gemini calls still wait for API keys (unchanged; using `fake`).

Questions for Sumit
1. Who may read a case? Now every signed-in user can open any FIR (victim details stay hidden). Should it be only the same station, the district for SP and prosecutors, and nobody for the state admin?
2. Should the SHO or SP have to approve a gap that the IO accepts, or is the IO's written reason enough?
3. For the demo, should I add a script that creates fictional demo users and one fictional cyber-fraud case?

## 24 Oct 2026, Weekly review (Saturday 21:05 session)
Checked: every commit from the seed (c200043) to 2a14ea2. Schema and deadlines, victim masking, the custody log, all core APIs, the AI gateway (routing, admin lock, audit chain), the web pages, the playbook and the tests. All suites were green before any change.

Fixed (each with tests)
1. Deadline dates were taken in the database server's time zone (UTC). An FIR registered between 00:00 and 05:30 IST got every deadline one day early. Dates are now counted on the IST calendar day (`V2__review_fixes.sql`).
2. Victim masking depended only on a hand-ticked box. A victim in an FIR under BNS 64-71, or under any POCSO section, was shown in full if the box was missed. Masking now also follows the sections, and covers the complainant too (often the victim or a parent).
3. `GET /api/firs/{id}` returned the complaint text (which names the victim) to anyone. On protected cases the text is now withheld from everyone outside the case team (`contents_withheld: true`); the web page says so.
4. The BNSS 193(2) two-month limit came from the same box. It now follows the sections the law lists (BNS 64-68, 70, 71; POCSO 4, 6, 8, 10). BNS 69 is masked but has no 193(2) limit. With no section recorded yet, the box still decides.
5. An evidence item's SHA-256 could be changed after seizure. It is now fixed once recorded (database trigger).
6. A notice reply with no checks marked the notice complete. Now a BNSS 94 notice is complete only when every requested item has been ticked present in some reply; a bad check list returns 400 and nothing is saved. A notice can no longer be created as `complete`.
7. AI gateway: when the admin locked a feature, an officer could still swap the model. The lock now covers the model too. Decisions (accepted/edited/rejected) must now refer to a real AI request of the same feature.

Still worried about
- No login: anyone can create records, change AI settings and read the AI audit log. This is the biggest gap.
- 63(4) certificates can still be edited after signing; a correction should be a new certificate. Readiness counts a non-SHA-256 certificate hash as "matching" without checking it.
- The AI audit log cannot detect deletion of its newest rows, and fields are joined with "|" before hashing. Prompt version is not logged yet (the plan asks for it).
- The 60/90-day deadline ignores bail/release and chargesheet filing; one deadline per case (earliest), not per accused.
- Old IPC sections (e.g. 376) are not recognised for masking or the two-month limit.
- Age and gender of a masked victim are still shown to everyone.

## 24 Oct 2026, session 5 (weekend)
Done
- Weekly review and fixes above (migration V2, db tests 12 to 22, core tests 12 to 14, gateway tests extended).
- Language tool (Next 1): `TypingField` in `apps/web` turns English letters into the chosen script while typing: space, Enter or punctuation puts in the top suggestion, a click picks another, Esc keeps English. Typing language picker in the header (English + 10 languages); "Type" page with "Convert all". `packages/xlit` is now an ES module with a `.d.ts` so the web app imports it directly (no copy). Checked in a real browser.
- AI settings screen (Next 2): `#/settings` lists each feature with provider, model and the officer-may-switch lock, saves through the AI gateway and shows whether the audit chain is intact. Dev server proxies `/ai` to the gateway on port 8000. Checked against a running gateway.
- Tests: gateway 9, xlit 77, db 22, packs 3, core 14, web 11; web build passes.

Deliberately skipped / not checked
- The typing language is not remembered between visits and is not taken from the user's `ui_language` yet (needs login).
- The TypingField is not yet used in any form, because there are no create forms yet (Next 4).
- No UI strings translated yet; one old lint warning remains (FirList exports a helper).

Next
1. Login and roles in `apps/core` (and the same identity for the AI gateway): replaces `X-User-Id`; only the case team creates records on a case; only the state admin changes AI settings.
2. Web forms to create FIRs, notices and evidence, using `TypingField`.
3. Readiness check (charge ingredients from the playbook to evidence, gaps, override with reason).
4. Make 63(4) certificates unchangeable after signing; log the prompt version in the AI gateway.

Blocked
- Live Claude/Gemini calls still wait for API keys (unchanged; using `fake`).

Questions for Sumit
1. Masking now also hides the complainant in sexual-offence and POCSO cases. Is that right, or only the victim?
2. Login: a simple username and password for the demo, or should it look like a state single sign-on from the start?
3. BNSS 193(2) "within two months": the app shows the same date two months later (18 Aug to 18 Oct). Please confirm with the prosecutor, as for the 60/90 days.

## 23 Oct 2026, session 4 (nightly, last of the night)
Tonight in short
- Session 1: repo, AI gateway, schema, playbook. Session 2: Spring Boot app, FIR/people/deadline/evidence/custody APIs. Session 3: create-APIs for people, arrests, evidence, notices, replies, 63(4) certificates. Session 4: first web screens.

Done
- `apps/web` (React + TypeScript, Vite): Vite template removed; header with the "fictional data, AI drafts, a person decides" banner; FIR list (`#/`) and FIR detail (`#/firs/{id}`) showing sections, original text, people (victim identity shown as protected when the API masks it), deadlines, evidence with court-ready flag. Loading, empty and error states. Plain hash routing, no router library. Dev server proxies `/api` to the core app on port 8080.
- 3 web tests (vitest + Testing Library + jsdom; added only as dev dependencies for testing). New `web` job in CI. Gateway 9, xlit 77, packs 3 pass; web 3 pass; build passes.

Deliberately skipped / not checked
- Core Java tests and DB tests were not re-run (no Java change tonight). Not tested against a live core app in a browser, only with a mocked API.
- No Marathi/other-language UI strings yet; no styling beyond basics; one lint warning (shared date helper in FirList).
- Still no login; `VITE_USER_ID` stands in for the user.

Next
1. Language tool in the web app using `packages/xlit` (typing box usable in every text field).
2. AI settings screen calling `services/ai-gateway`.
3. Login and roles in `apps/core`.
4. Web forms to create FIRs, notices and evidence.

Questions for Sumit
1. Should the first UI language switch (English/Marathi/Hindi) come before or after the typing tool?

## 23 Oct 2026, session 3 (nightly)
Done
- `apps/core`: new `RecordsController` with `POST` for people, arrests (BNSS 35 memo, feeds the 60/90-day deadline), evidence items (electronic needs SHA-256), notices (BNSS 94/35(3)/179; `sent` needs signer and date, so a person signs; `ai_request_id` links to the AI audit log), notice replies (officer's checks set status `complete` or `reply_incomplete`), BSA 63(4) certificates (Part A/B; court-ready flag updates). `GET /notices` lists notices with reply counts. Database rules return 400; unknown case/person/item returns 404.
- 3 new Java tests (12 total). All suites green: gateway 9, xlit 77, db 12, packs 3, core 12.

Deliberately skipped / not checked
- Still no real login (`X-User-Id` stand-in) and no authorisation on the new POSTs: any caller can create records. Must be added with login.
- No edit/PATCH endpoints; no reply-check generation from the AI yet (the officer ticks the checks).
- Notice status moves only on replies; there is no "mark sent" step after a draft yet.
- `add_repo` tool was not available this run; the repo was already cloned and pushable.

Next
1. React app `apps/web`: layout and navigation; FIR list and FIR detail pages using the core API.
2. Language tool in the web app using `packages/xlit`.
3. AI settings screen calling `services/ai-gateway`.
4. Login and roles in `apps/core`.

Questions for Sumit
1. Should a notice that gets a complete reply close automatically (as now), or should the officer confirm closing it?

## 23 Oct 2026, session 2 (nightly)
Done
- `apps/core`: Spring Boot 3.5 / Java 21 (Maven). Flyway applies the existing `V1__core.sql` unchanged.
- REST APIs (plain SQL through Spring `JdbcClient`, not JPA, to keep the code small): `POST/GET /api/firs`, `GET /api/firs/{id}` (with sections); `GET /api/firs/{id}/people` (case team = the IO or an SHO/SP sees real details, everyone else, including no user, sees the masked victim view); `GET /api/firs/{id}/deadlines`; `GET /api/firs/{id}/evidence` (with court-ready flag); `GET/POST .../evidence/{item}/custody` (append only).
- 9 Java tests on real PostgreSQL 16 (migration, FIR rules, masking, deadlines, custody); new `core` job in CI.
- All suites green: gateway 9, xlit 77, db 12, packs 3, core 9.

Deliberately skipped / not checked
- Real login: `X-User-Id` header is a stand-in so the masking rule can be tested; it must not ship as-is.
- JPA entities (JdbcClient is smaller; say if you want JPA). No Testcontainers: tests use a local/CI PostgreSQL via `DATABASE_URL`.
- APIs for notices, arrests, certificates and creating people/evidence are not built yet. No PATCH/edit of FIRs.
- Web app in `apps/web` is only the Vite template so far.

Next
1. Remaining core APIs: create people/arrests/evidence items, notices and replies, 63(4) certificates.
2. React app `apps/web`: layout and navigation; FIR list and FIR detail pages using the core API.
3. Language tool in the web app using `packages/xlit`.
4. AI settings screen calling `services/ai-gateway`.

Questions for Sumit
1. Are you happy with plain SQL (JdbcClient) instead of JPA for the Java app?

## 23 Oct 2026, session 1
Done
- Seeded repo: plan, official forms research, typing engine (77 tests passing).
- AI gateway (Python FastAPI): Claude and Gemini providers plus offline `fake`; admin chooses provider and model per feature; officer can override per request unless the admin locks it; every request, error and decision (accepted/edited/rejected) is written to a hash-chained audit log. 9 tests passing; live smoke test passed with the `fake` provider.
- CI workflow runs all test suites on every push and PR (gateway, typing engine, database, playbooks).
- Core database schema `apps/core/.../V1__core.sql` (Flyway format for Spring Boot), from the official forms: FIR (IIF-1 fields, Zero FIR), people with victim masking view (BNS 72), arrest memo, BNSS 94/35(3)/179 notices and replies, evidence items with SHA-256, append-only custody log, BSA 63(4) Part A/B certificates with a court-ready view, statutory deadlines (BNSS 187(3) 60/90 days counting the remand day, BNSS 193(2) two months, 90-day victim update, notice replies). 12 tests on real PostgreSQL 16.
- National pack, cyber-fraud playbook v1.0.0-draft: 5 charges with legal ingredients, 4 rules (incl. second link for account holders, 63(4) certificates), 11 tasks. Validation tests, including a check that no playbook scores guilt or credibility.

Blocked
- Live Claude/Gemini calls need `ANTHROPIC_API_KEY` and `GEMINI_API_KEY`. Sumit will give them after development; keep using the `fake` provider until then and do not ask again before the demo is ready. Gemini default model id `gemini-3.7-flash` is unverified until a key is available.

Decisions (23 Oct, 10:05)
- Maven Central and Gradle are now reachable: Java build unblocked.
- Web UI: React + TypeScript in `apps/web` (Vite), talking to the Spring Boot API. Spring serves only JSON APIs.

Next
1. Java 21 / Spring Boot skeleton in `apps/core` (Maven): Flyway runs the existing `V1__core.sql`; JPA entities and REST APIs for FIR, people (masked view for non-team users), notices, evidence and custody, deadlines. Tests with Testcontainers or the local PostgreSQL.
2. React + TypeScript app `apps/web`: layout and navigation from the design canvas; FIR list and FIR detail pages using the core API.
3. Language tool in the web app using `packages/xlit` (typing box usable in every text field).
4. AI settings screen (provider and model per feature) calling `services/ai-gateway`.

Questions for Sumit
0. (For the prosecutor later) Deadline counting: the schema counts the day of first remand as day 1, so A2 remanded 12 Sep gives a last day of 10 Nov. The demo screens say 11 Nov; I will fix the screens unless the prosecutor says otherwise.
