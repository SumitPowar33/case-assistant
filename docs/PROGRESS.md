# Progress

Working branch: `setup/seed` (open a PR to `master` when ready: https://github.com/SumitPowar33/case-assistant/pull/new/setup/seed)

Nightly sessions: 21:05, 23:35 and 02:05 IST.

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
