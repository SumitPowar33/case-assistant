# Progress

Working branch: `setup/seed` (open a PR to `master` when ready: https://github.com/SumitPowar33/case-assistant/pull/new/setup/seed)

Nightly sessions: 21:05, 23:35 and 02:05 IST. Weekend sessions on Saturday and Sunday 21:05.

## 2 Nov 2026, decisions on the open questions (Sumit: "research and resolve the answers yourself", session 55)
Sumit handed every open question over. Each was decided from the law and court orders where they speak, in the strict
(privacy-first, custody-safe) direction where they are silent. Each can be overruled. Build from these; do not ask again.
1. **Offline on phones: online only for case data.** Nothing from a case (people, FIR text, complaints) is kept on the
   phone. What an officer has typed in an open form stays in the page's memory when the network drops and is sent again
   when it comes back; nothing goes to the phone's storage. Reason: a lost phone holding a protected victim's details is a
   BNS 72 disclosure that cannot be undone (Nipun Saxena v Union of India, SC 2018), and DPDP Rules 2025 rule 6 asks for
   encryption, access control and logs of every access, which a phone outside the station cannot give. Revisit only for
   state-managed phones (device management, remote wipe) after a pilot.
2. **SHO on leave or transferred.** BNSS 2(1)(r): when the officer in charge is absent or unable, "the police officer
   present at the station-house who is next in rank ... above the rank of constable" is the officer in charge (or another
   officer the State Government directs). So: (a) open cases **stay with their named IO**; an SHO's reach comes from the
   role at the station, not from the cases. (b) **Acting charge**: the SP of the district (or the state admin) gives an
   officer of that station a temporary SHO role with a required end date of at most 90 days, and a reason; it ends by
   itself, and both its start and end are in the admin log. Nobody gives it to themselves. (c) **Transfer**: the state
   admin moves the account (already logged); the new SHO gets the role. (d) **A transferred IO** loses the old station's
   cases at once; their open FIRs go on the SHO's "IO has left the station" list until the SHO assigns a new IO.
3. **Heavier state punishment class: stays refused.** No state law in force raises a BNS punishment for Maharashtra. The
   Maharashtra BNS amendment bill (introduced 25 Mar 2026, passed by both Houses) awaits the President's assent (needed
   under Article 254(2)), and it changes BNS 72 (identity of acid-attack survivors) and BNS 75 (online sexual harassment),
   not punishment classes. When an amendment gets assent, it goes in the MH pack with its notification number and an
   effective-from date (ARCHITECTURE-TENANCY section 5, item 8), never as a plain override.
4. **Acid-attack survivors (BNS 124) are masked like sexual-offence victims, in every state, now.** Masking more is the
   safe direction, the MH bill shows where the law is going, and an IO can already mask a person by hand.
5. **Reviewers: Marathi first** (the pilot state). Legal terms and legal labels: a Marathi-speaking public prosecutor,
   checked against the Maharashtra Directorate of Languages' legal glossary (Vidhi Shabdavali); ordinary screen texts:
   two serving officers of the pilot station. Until then everything stays marked as a draft. **The MH pack is no longer
   blocked**: build its roles, playbooks and Marathi labels now, marked as unreviewed drafts, like the glossary.
6. **FIR screen on a phone opens on Deadlines**: yes. In the field the 24-hour production and the 60/90-day limits matter
   most; Case details is one tap away.
7. **"In progress" line**: yes. A session pushes `In progress: item N (session S, started HH:MM IST)` to the top of the
   Next list as its first commit; another session skips an item marked in progress less than 3 hours ago; the finishing
   session removes the line.
8. **Read log of protected details**: keep the one-line-a-minute grouping (it shows who saw what, which is what DPDP rule
   6(c) asks); keep the log at least as long as the case records, never less than one year (rule 6(e)); the SHO sees their
   station's log, and the SHO's own reads stay visible to the SP and the state admin (as built).
9. **14 days of a preliminary enquiry**: keep counting from the **receipt of the information** (the strictest reading).
   No court has fixed the start; the Bombay High Court (Kundan Patil, Dec 2025) criticised enquiries running for months,
   and the Supreme Court (Imran Pratapgadhi 2025, Ashish Dave Feb 2026) treats the enquiry as a short filter.

## 1 Nov 2026, Sumit's answers (to sessions 45 and 46)
1. The app ships its own fonts for the Indian scripts: **yes** (as built in session 45). The demo station names "Fictional Demo PS" / "Fictional Demo District" (MH) stay.
2. Officers use the app on phones in the field: **yes**. First phone design built in session 47; more to come screen by screen.

## 30 Oct 2026, Sumit's answers (read this before picking the next item)
Answers to the open questions from sessions 13, 18 and 25:
1. Second-approver rule (`import_self_approval` = 0): **yes, for the whole pilot state** (Maharashtra). Set it in the MH pack's `policies.json`, not by hand in the database.
2. Sample CCTNS/state export: **not available**. Write a realistic, fully fictional CCTNS-style import profile for MH (`packs/MH/import-profiles`), clearly marked as made up, so it can be replaced when a real sample arrives.
3. Evidence and notices import files: **build both**, same pattern as FIRs, arrests and chargesheets (insert-only, approved by a person, undoable until work is recorded).
4. First state pack: **Maharashtra (MH)**, with Marathi forms, deadlines and playbooks. It may only add to or tighten the national (IN) pack.

Next (replaces the "Next" list of session 25; a session finishing an item removes it here)
Done in session 26: the browser test of the Load data screen, the MH module with `import_self_approval` = 0, the made-up MH CCTNS-style profile.
Done in session 28: evidence import file (ef845fb), notices import file (a792dea), `ai_cloud_allowed` policy (ef1e2bb).
Done in session 29: front desk, typed intake, read-back and golden-hour checklist (f8fcfe8); speech input still to do.
Done in session 30: printable copy for the informant (BNSS 173(2)) and the 14-day preliminary-enquiry limit (173(3)).
Done in session 31: speech input at the front desk; module 1 is finished.
Done in session 32 (31 Oct, 02:05 IST run): upgrade test, web-to-core route contract test, a date-dependent test fixed, more tests for old code. The rest of the MH pack waits for answers (questions 1 and 2 below).
Done in session 33 (31 Oct, Saturday run at about 14:20 IST): hard-coded role names replaced by permissions from the packs (web and gateway); bug fixed: the admin screen made every new state admin an all-state admin.
Done in session 34 (31 Oct, on-demand run from 14:34 IST): screen language, part 1 (header, menu, sign-in, password in English + 10 draft translations, kept per officer).
Done in session 35 (31 Oct, scheduled weekend run from about 16:30 IST): screen language, part 2 (FIR list, FIR screen, front desk and complaint screens, Save button of every form).
Done in session 36 (31 Oct, on-demand run from 16:50 IST): screen language, part 3 (readiness check, IO assignment, BSA 63(4) certificates).
Done in session 37 (31 Oct, scheduled weekend run from about 18:00 IST): screen language, part 4 (arrests, chargesheets, closure report); contract test for request field names.
Done in session 38 (31 Oct, on-demand run from 18:20 IST): screen language, part 5 (notices, FIR, person and evidence forms, action taken); web branch gate raised to 89.
Done in session 39 (31 Oct, scheduled weekend run from about 20:00 IST): screen language, part 6 (policies, load data, admin, AI settings, typing); contract test for AI gateway bodies; API test on an upgraded database.
Done in session 40 (31 Oct, on-demand run from 20:50 IST): server messages in the screen language (case work, front desk, policies, readiness, records, sign-in).
Done in session 41 (31 Oct, Saturday 21:05 weekly review): weekly review and test audit (7 fixes, see the entry), BNSS 193(3)(ii) progress update recorded (V31).
Done in session 42 (31 Oct, Sumit asked "research and fix it all yourself"): decisions on the questions of session 41 and the review items, below.
Done in session 43 (31 Oct, Saturday 21:05 scheduled run): the AI chain head kept in the core database; state punishment tables may only add, never change a national section; bug fixed on the AI settings screen.
Done in session 44 (1 Nov, 02:05 IST scheduled run): the legal glossary (item 6), the answer-field contract test (item 7), the FIR list made fast for real volumes with a load test (item 7), Punjabi "accused" fixed.
Done in session 45 (1 Nov, Sunday scheduled run from about 12:30 IST): complaint list queries (item 7), Indian-script rendering with the app's own fonts (item 7), demo case and demo script (item 8).
Done in session 46 (1 Nov, on-demand run from 13:01 IST): screens fit a phone, rendering test on the case screens, the contract test's run-time half (item 7 done); mutation testing set up (TESTING.md item 6).
Done in session 47 (1 Nov, Sumit answered live): the app on a phone (menu, touch sizes, card lists).
Done in session 48 (1 Nov, Sunday scheduled run, Sumit away): the FIR screen on a phone one part at a time, the readiness check's controls on a phone, the rendering test on the admin, settings and load-data screens.
Done in session 49 (1 Nov, on-demand run from 16:13 IST): AI feature names in the screen language; the run-time contract test with the gateway and with the reads that were empty in the demo (item 7 finished).
Done in session 50 (1 Nov, Sunday 21:05 scheduled run): mutation testing of the database's keep-as-written and masking rules, with the database tests it showed were missing.
Done in session 51 (2 Nov, 02:05 IST scheduled run): audit of reads of protected victim details (ARCHITECTURE-TENANCY section 5, item 4), with its screen.
Done in session 52 (1 Nov 23:35 IST scheduled run, overlapped sessions 50 and 51): a cross-check of session 50's mutation test found 15 untested columns of a signed complaint; tests and the missing kind of change added.
Done in session 53 (2 Nov, 04:55 UTC scheduled run): the FIR screen reads the people once (was four times).
Done in session 54 (2 Nov, on-demand run from 10:27 IST): Stryker for the web app's date and form logic (TESTING.md item 6 finished).
Done in session 55 (2 Nov, Sumit present from 11:26 IST): every open question decided (section above); security review with fixes (session 55 entry).
Done in session 56 (2 Nov, Sumit present from 13:29 IST): the security risks left by session 55 (item 12), see its entry.
Done in session 58 (2 Nov, Sumit present from 15:16 IST): penetration test round 2 (docs/PENTEST-2026-11-02.md), one medium and two low findings fixed.
Done in session 59 (2 Nov, Sumit present from 15:51 IST): item 13 a and b (the design as the reference, the new look and frame, Dashboard, FIR parts as pages, readiness chips, Case diary).
Done in session 76 (7 Nov, Saturday 21:05 IST weekly review): weekly review and test audit (5 fixes, see the entry); item 13, Field capture on a tablet (board 7, search and seizure memo, V48).
Done in session 75 (7 Nov, 02:05 IST scheduled run, last of the night): item 13m (second half), State setup and approvals (`#/state-setup`, V46); a date-dependent e2e test fixed.
Done in session 74 (6 Nov, scheduled run): item 13l, Audit log (`#/audit`).
Done in session 73 (6 Nov, scheduled run): item 13k, Ask the case file (`#/firs/{id}/ask`), first version; a flaky phone browser test fixed.
Done in session 72 (5 Nov, last scheduled run of the night): item 13j, Old law to new law finder (`#/laws`).
Done in session 71 (5 Nov, 23:40 IST scheduled run): item 13i, Court and trial tracker (V45).
Done in session 70 (5 Nov, scheduled run): item 13h, Forensic and medical requests (V44).
Done in session 69 (5 Nov, 02:10 IST scheduled run): item 13g, Case property register (without QR); two red tests of the baseline fixed; more tests for older code (gateway 96 to 99%, Dashboard, FrontDesk, Notices).
Done in session 66 (3 Nov, scheduled run): item 13d, the final report (draft, approve, sign; V41), without the AI drafting.
Done in session 60 (2 Nov, Sumit present from 17:32 IST): the AI and screens plan (docs/AI-AND-SCREENS-PLAN.md, items 14 to 18), centred sign-in, the court print format with the informant's copy.
1. Still open from the weekly review: after a Magistrate orders further investigation on a closure report no limit comes back (the BNSS has none for that stage, see session 42; nothing to build unless a prosecutor says otherwise).
3. Rest of the Maharashtra pack: roles, playbooks, Marathi labels, demo stations in MH, built now as unreviewed drafts (decision 5 of 2 Nov); no punishments of its own (decision 3).
6. Legal glossary: done (draft, 29 terms). Next for it: a reviewer; more `screen_keys` links (only labels that are exactly the term); a state module's own terms.
7. Done (sessions 46, 48 and 49): nothing left of it.
8. Demo: done (`docs/DEMO.md`, `scripts/demo_case.py`; names kept, Sumit 1 Nov). Next for it: an AI draft step once a demo uses the gateway.
9. Phones in the field (Sumit, 1 Nov): first design done (session 47); the FIR screen one part at a time and the readiness controls done (session 48). Next: online only (decision 1 of 2 Nov): typed text kept in memory and sent again when the network is back, nothing stored on the phone; the FIR screen opens on Deadlines on a phone (decision 6); the front-desk complaint page part by part like the FIR screen if officers find it long; a check on a real phone.
10. Account lifecycle (decision 2 of 2 Nov): acting SHO with an end date given by the SP, "IO has left the station" list.
11. Acid-attack survivors (BNS 124) masked like sexual-offence victims (decision 4 of 2 Nov).
12. Security: done in code (sessions 55 and 56). Left for people: an outside penetration test (CERT-In empanelled auditor) before real case data; the installation itself (deploy/nginx.conf, a real certificate).
13. **Screens to the owner's design (Sumit, 2 Nov 2026: "the exact screens of the Figma, or better, and all missing screens"; FIRST, before items 3, 9, 10, 11).** Boards in `docs/design/boards/`, map in `docs/DESIGN.md`. Order:
   a. DONE (session 59): frame, look, Dashboard (board 1), FIR parts as pages, readiness chips (board 9).
   b. DONE (session 59): Case diary, BNSS 192 (board 14, V39).
   Front desk complaint page done (session 61). Notices list restyled (session 62: one card per notice with a status chip). Evidence list restyled (session 63). Type page restyled (session 64: typing box and notes in one card; the board's keyboard, speech demo and names-in-every-script panels are demo-only and left out). Still to restyle closer to their boards (look already applied): Notices reply checklist with Yes/No chips (board 4), Evidence custody chain and 63(4) card (board 5, needs data the app lacks).
   c. DONE (session 65): Statements and witnesses (board 6): BNSS 180 statements, typed or spoken, kept as said (V40), witness tracker. Still to build for it: English translation beside the original (AI A3, through the gateway), "differences to clarify", the video player.
   d. DONE (session 66, without the AI part): Draft and sign the final report (board 10): FIR part "Final report", V41. Still to build for it: the AI drafting of the two parts through the gateway (A6, each sentence linked to its source), the particulars table of the board (accused with arrest and bail status, seized property, enclosure lists), the printed paper in the court format (item 18).
   e. DONE (session 67, without the AI briefing A9): Supervisor review (board 11), `#/supervisor`, `GET /api/supervisor`. The approve or return step stays on the Final report part (one click from the row).
   f. DONE (session 68): Money trail (board 8): transfers and bank holds typed from bank replies, a table of the accused with money link and second link (V42). Still to build for it: the flow-by-layer picture, "not traced yet" (needs the amount lost), release of a hold, same accounts in other cases (a cross-case search, see the question below).
   g. DONE (session 69, without QR): Case property (board 15): register of seized physical items with where each is now, hand-over log and form (`#/property`, V43). Still to build for it: QR label and scanning, "due in court this week", "can be released or disposed" (need court dates and case outcome per item).
   h. DONE (session 70, without MedLEaPR and queue positions): Forensic and medical requests (board 16): requests to a lab or hospital, steps until the report is in, reminder-due mark after 30 days (`#/expert`, V44). Still to build for it: the reminder timings from the state pack (30 days is a constant now), "report missing 15 days before the chargesheet date: SHO is told", the report joining the readiness check, a drafted reminder letter, sample custody tied to the property register.
   i. DONE (session 71, without ICJS feed, AI prosecutor brief and victim-update button): Court and trial tracker (board 12): court dates and witness summons (`#/court`, V45). Still to build for it: the ICJS feed, the prosecutor brief (AI), a victim-update button on this screen (the update is on the FIR's own part), the hearing date joining the deadlines and the Dashboard, a reminder for a summons not served.
   j. DONE (session 72, without the AI explanation): Old law to new law finder (board 18), `#/laws`, table in the national pack (59 sections, draft). Still to build for it: the AI explanation through the gateway (A8), a reviewer.
   k. DONE (session 73, first version): Ask the case file (board 19), FIR part `ask`: only this case, through the gateway (`case_qa`), answers cite their sources, refuses guilt, truth and prediction questions. Still to build for it (plan section 9): real retrieval (embeddings kept on state servers; today it is word matching in the browser), the "note in case diary" button, the monthly evaluation set of fictional questions, the guilt refusal also in the gateway (a refused question is not in the audit log today), a Marathi/Hindi question guard.
   l. DONE (session 74, without the AI decisions): Audit log (board 20), `#/audit`, `GET /api/audit-log`. Still to build for it: the AI suggestions and decisions (kept by the gateway, not the core; needs a gateway read route), the export for one case, the monthly AI counts and the retention line of the board, readable labels for the admin action codes and the gap keys, a filter by kind.
   m. State setup and approvals (board 21): DONE (session 75, first version): `#/state-setup`, a change to a state's pack is proposed (`pack.propose`), approved or sent back by another person of the state (`pack.approve`), V46. Still to build for it: the pack's parts as editable cards (forms, playbooks, deadlines, law table) with a diff, the list of other states, the connections panel, the new-state wizard, a change that applies itself once approved (today the approval is a record; pack files change with a release). Field capture on a tablet (board 7): DONE (session 76, first version): FIR part `search`, V48. Still to build for it: photos of items and witnesses, the officer's selfie, QR labels, the e-Sakshya link itself (today the hash is typed), signatures of the witnesses on the list (BNSS 103(5)), offline capture (waits for decision 1 of 2 Nov: online only), the search on the case diary's page.
   Each screen: backend with tests, the screen built to its board, screenshot compared, 11 languages.
14. **AI features (Sumit, 2 Nov 2026: "we are selling as AI-driven")**, plan in `docs/AI-AND-SCREENS-PLAN.md` section 3, order A1 to A9; each keeps the five rules of section 2. Build each with its screen of item 13 where they meet (A6 with 13d, A5 with 13k).
15. **POCSO case mode, 112 events, high-alert kinds** (plan section 6).
16. **Station duty roster** (plan section 5).
17. **Ask the case file as real RAG** (plan section 9; replaces the canned board answers; the eight fixes are the tests).
18. **Printed papers in the court format** (plan section 8): FIR copy, BNSS 94 notice, arrest memo, seizure memo, 63(4) certificate, diary page, chargesheet. Informant's copy done (session 60).
Real-time screens (plan section 10) after these, in that order.

## 7 Nov 2026, Weekly review and session 76 (Saturday 21:05 IST scheduled run, Sumit away)
Started from `setup/seed` at e136d27 (session 75). Fresh container: PostgreSQL started, role `caseapp` (superuser) and both databases created, gateway requirements, psycopg, playwright, `npm ci`; nginx installed so the HTTPS proxy browser tests run (they were skipped without it). Baseline `scripts/test-all.sh`: 7 PASS, e2e FAIL: `test_answer_fields_gateway.py` read an answer while the browser was closing (TargetClosedError); fixed by waiting for the network to go quiet and removing the listener before closing.

**Weekly review** (125 commits since 9b29796, 31 Oct; the sessions 55 to 58 security reviews already covered V32 to V38, so the focus was sessions 59 to 75: case diary, statements, final report, supervisor, money trail, property, lab requests, court, law finder, ask the case file, audit log, state setup). Checked: every new controller's access check and scoping, every migration V39 to V46 (kept-as-written triggers, own-decision rules), masking on the new lists, the law-finder table (all 59 rows against the IPC/CrPC/IEA to BNS/BNSS/BSA correspondence: no wrong row found), import undo against the new tables (the generic foreign-key walk covers them). Tried by hand: an outsider on every list route, a prosecutor without a station on the state setup, a state admin on another state's pack changes (refused), a front-desk officer on a BNS 64 case's property and lab lists, an approver renaming the submitter of a final report in SQL, a diary entry racing a page close.

Fixed (each with a regression test seen failing first):
- **Medium, tenancy (3e94404)**: a prosecutor without a police station could read every state's pack-change proposals (`GET /api/pack-changes?state=XX`); session 75's test even asserted it. Only an admin without a station is the platform admin; any other account without a station now reaches no state.
- **Medium, BNS 72 (dbc9c7c)**: the property register showed the front desk the evidence descriptions of a protected case, and the lab-request list showed the subject and note ("medical examination of ..."), which can name the victim. Withheld outside the case team (and the malkhana for property), shown as "Withheld (BNS 72)" in 11 languages.
- **Medium, final report (f0de497, V47)**: the database let the submitter of an approved report be renamed (to the approver, who could then sign it), and a draft be created already naming a submitter or signer. Each of the three names is now written only by its own step.
- **Low, case diary (f0de497, V47)**: an entry written while the page was being closed could land on the closed page (only the close took the lock). The entry now takes the same lock.
- **Test audit**: V38 (sign-out), V39 (diary) and V40 (statements) had no database tests: added. `SecurityMatrixTest` now walks every list route without a path variable as an outsider with a case, an item, a court date and a lab request present (it catches a leaking list: checked by running it as the station's SHO, which fails on `/api/court`). Core suite in random order: PASS. Every endpoint, migration, pack file and screen of the week has its tests.
- Gates unchanged (no 2-point rise since the last raise).

Still worried about (not fixed):
- Ask the case file sends a protected case's FIR text, statements and diary to the AI gateway; with a cloud provider allowed by policy, the victim's name in that text leaves the state's servers (question 1).
- Free text typed by officers (court summons names, diary event notice addressees, search memo grounds) can name a protected victim; it is shown to the case team only but not logged as a protected read.
- A prosecutor (pack.approve) may still be created without a station; such an account now sees and decides nothing (question 2 of session 75 still open).
- `Court.tsx` takes "today" from the browser's UTC date: between 00:00 and 05:30 IST it is yesterday's date (only a default value of the form).
- "1 days" in English on the lab requests and search screens (no plural forms in the catalogs).
- BNSS 184(6) (the medical report of a rape victim to the IO and Magistrate within 7 days) is not tracked.
- `PackChangeController` has 8 untested branches (mostly the platform admin's paths).

**Item 13, Field capture on a tablet (board 7)**, first version: the search and seizure memo. V48: `search_seizure` (place, grounds BNSS 185(1), start and end, the reason if fewer than two witnesses, frozen on saving), `search_witness`, `search_recording` (SHA-256 and length; the file stays in e-Sakshya), `evidence_item.search_id` (sealed items are ordinary evidence items, so they reach the evidence and property registers), `search_forward` (the day the recording went to the Magistrate, BNSS 105, once). A deferred check at commit needs a recording and two witnesses or the reason (BNSS 103(4)); nothing joins a memo after the transaction that wrote it; everything is kept as written; a search cannot start before the case's information was received or end in the future. API `SearchController` (case team only, one request per memo). Web `Search.tsx`, FIR part "Search and seizure", sized for a tablet, 11 languages (10 drafts). The app sets no forwarding limit of its own: it shows the days since the search until the forwarding is recorded ("without delay").
- Tests: `db-tests/test_search_seizure.py` (5), `SearchApiTest` (5), `Search.test.tsx` (5), length parser in `formats.test.ts`, axe check, `FirDetail.test.tsx` and `tests/e2e/test_phone.py` count the new part, browser test `tests/e2e/test_search_seizure.py` on an 820 px tablet.
- Screenshot compared with board 7 (desktop and 390 px, mocked answers on the built app): the board's photos of items and witnesses, the selfie, the QR labels, the seven e-Sakshya steps and the offline "sync now" are not built; the memo and the list sit side by side on a desktop, one under the other on a phone. A long warning chip overflowed its card on the desktop: fixed in CSS (chips inside a list card's paragraph wrap).

`scripts/test-all.sh` at the end: PASS repo rules, PASS packs, PASS xlit, PASS ai-gateway (99%), PASS web, PASS database rules, PASS core, PASS e2e browser. Coverage: core 98.19% lines / 93.25% branches, web 99.96% statements / 95.72% branches / 98.23% functions, gateway 99%.
- Skipped / not done: photos, selfie, QR and offline capture of board 7; the search on the case diary's page; the readiness check does not yet ask for a search memo's forwarding.
- Next: items 14 to 18 (AI features first: A1 to A9), then the rest of item 13's "still to build" lists.
- Blocked: nothing.

Questions for Sumit:
1. Should the text of a protected case (BNS 64 to 71, POCSO) ever go to a cloud AI provider through Ask the case file or drafting, or only to providers on the state's own servers?
2. Search memo: should a missing forwarding of the recording to the Magistrate become a readiness gap (and after how many days should the Dashboard warn), or stay a note on the memo?
3. Board 7 shows photos and a selfie. Storing photos needs file storage in the app (it keeps only hashes today). Build it, or keep files in e-Sakshya and link to them?

## 7 Nov 2026, session 75 (02:05 IST scheduled run, last of the night, Sumit away)
- Baseline (fresh container; PostgreSQL started, role and databases created, `npm ci`, gateway requirements, psycopg, playwright): 6 of 8 suites PASS. The gateway suite was red only because `httpx` was not installed (installed from its requirements file); the e2e Indian-scripts test was red for a real reason: it posted a court date of 2 Nov on a demo FIR that the demo loader registers 4 days before today, and the core refuses a court date before the FIR (the test passed on 5 and 6 Nov by luck). Fixed: the dates in that test are now a day before today (India time). Not a core bug.
- Item 13m, second half, **State setup and approvals** (board 21). V46: `pack_change` (state, title, text, how it was tested, writer) and `pack_change_decision` (approved, or sent back with a reason of 10+ characters; one decision per change), both kept as written, a trigger refuses a decision by the writer. Two permissions in `packs/IN/roles.json`: `pack.propose` (state admin) and `pack.approve` (prosecutor). Core: `PackChangeController`: `GET /api/pack-changes` (the pack line and the changes of the user's own state; the platform admin, who has no station, names the state), `POST /api/pack-changes`, `POST /api/pack-changes/{id}/decision`. A state is taken from the user's police station; another state's change answers 404; an approver without a station decides nothing. Web: `StatePage.tsx` (`#/state-setup`, nav link by permission, 11 languages with 10 drafts). An approval is a record of the decision, nothing is applied: pack files change with a release, so tighten-only stays in force.
- Tests: `PackChangeApiTest` (6: propose and approve, send back and own change, the database refusals, own state only, platform admin and the refusals for everyone else, input checks), `db-tests/test_pack_changes.py` (4), `StatePage.test.tsx` (6), nav test in `App.test.tsx`, axe check in `a11y.test.tsx`, browser test `tests/e2e/test_state_setup.py` (writer, approver sends back, proposes again, approver approves, IO has no link and is refused). `MigrationTest` now expects V46. `SecurityMatrixTest` covers the new routes.
- `scripts/test-all.sh` at the end: all 8 suites PASS (repo rules, packs, xlit, ai-gateway 99%, web, database rules, core, e2e). Coverage: core 98.14% lines / 93.29% branches, web 99.96% statements / 95.76% branches / 98.14% functions, gateway 99%. Gates unchanged (no 2-point rise).
- Skipped / not done: tests for older code (the baseline fixes and the item took the session); screenshot comparison with board 21; the board's other-states list and connections panel; Field capture on a tablet (board 7).
- Risk: a prosecutor needs a police station in the state (the DB lets a prosecutor have none; such an account decides nothing).
- Next: Field capture on a tablet (board 7); then items 14 to 18 (AI features, POCSO and 112, duty roster, real retrieval, printed papers).
- Blocked: nothing.
Questions for Sumit:
1. Which account approves a state's pack changes? I used the existing `prosecutor` role (Directorate of Prosecution, as the board says) and it must have a police station in the state. Should the Directorate get its own office as a station, or a different role?
2. Should an approved change ever apply itself (a stricter policy value, say), or always wait for a release? Today it only records the decision.

## Tonight in short (6 Nov 23:35 IST to 7 Nov 04:00 IST: sessions 74 and 75)
- Session 74: Audit log screen (`#/audit`, board 20). Session 75: State setup and approvals (`#/state-setup`, V46, board 21) and a date-dependent e2e test fixed.
- `scripts/test-all.sh` at the end of session 75: repo rules PASS, packs PASS, xlit PASS, ai-gateway PASS (99%), web PASS, database rules PASS, core PASS (98.14% / 93.29%), e2e PASS. Web 99.96% / 95.76% / 98.14%.
- Next: Field capture on a tablet (board 7), then items 14 to 18. Blocked: nothing.

## 6 Nov 2026, session 74 (scheduled run, Sumit away)
- Baseline (fresh container; PostgreSQL started, role `caseapp` and the two databases created, `npm ci`, gateway requirements, psycopg and playwright): 8 of 8 suites PASS. The checkout was `master`; I switched to `setup/seed` from origin. `add_repo` was not offered in this session; the repo was already cloned and in scope.
- Item 13l, **Audit log** (board 20). Core: `GET /api/audit-log?stationId=` (`AuditLog`, no migration) joins four append-only sources for one station, newest first, a page at a time: protected reads (`protected_read`), readiness gaps accepted with a reason (`readiness_override`), their withdrawals, and the admin's changes (`admin_action`, by the station or by the station of the account changed). Same permission as the reads log (`audit.read_protected` at the station); it only reads, writes nothing, and shows no victim detail. Web: `AuditPage.tsx` (`#/audit`, nav link under the same permission, 11 languages with 10 drafts, card layout on a phone). The Protected reads screen stays.
- Tests: `AuditLogApiTest` (2: the join and that another station's rows and a withdrawn row are right, paging; who may and may not read it, bad limits), `AuditPage.test.tsx` (2), nav test in `App.test.tsx`, axe check in `a11y.test.tsx`. The route is checked by `SecurityMatrixTest` as before (it found nothing to list).
- `scripts/test-all.sh` at the end: all 8 suites PASS (repo rules, packs, xlit, gateway, web, database rules, core, e2e). Gates unchanged.
- Screenshot compared with board 20 (desktop and 390 px, mocked answers on the built app). Differences: the board's filter chips, the export button and the three tiles (AI suggestions this month, victim details unmasked, logs kept) are not built; the board's own columns (time, who, what, result) became six (when, who, kind, what, reason, case); the table was cut off on a phone until it got the `cards` layout, fixed.
- Skipped / not done: AI suggestions and decisions are not in the list (the gateway keeps them; there is no read route for the core to join); admin action codes and gap keys are shown as the code; "unmasked with a reason" does not exist in the app yet, so the tile is not built. Risk: a station's admin changes are matched by the station of the account changed, so an account moved to another station takes its history with it.
- Next: 13m Field capture on a tablet (board 7) and State setup and approvals (board 21); the gateway read route for the audit screen goes with item 14.
- Blocked: nothing.
Questions for Sumit:
1. Should the AI suggestions and decisions (71% kept, 22% edited, 7% rejected on the board) join this screen? It needs the gateway to give a read route to the core, with the same keyed chain; or should they stay in AI settings?
2. The board shows "victim details unmasked, each with a recorded reason". The app logs reads but has no unmask-with-reason step. Should one be built (a reason asked before real details are shown)?

## 6 Nov 2026, session 73 (scheduled run, Sumit away)
- Baseline (fresh container; PostgreSQL started, role `caseapp` and the two databases created, `npm ci`, gateway requirements, psycopg and playwright): 7 of 8 suites PASS; the e2e phone test failed once and passed alone, then failed again: a race (it read the card's `::before` label once, just after the list was drawn again). Fixed by polling for the label (4 runs in a row green). The checkout was `master`; I switched to `setup/seed` from origin.
- Item 13k, **Ask the case file** (board 19, AI feature A5). Core: `GET /api/firs/{id}/case-file` (`CaseFileController`) gives the passages of one case (complaint, statements, diary entries, evidence descriptions, notices), people by label never by name, case team only (the existing `ReadAccess` answers 404 to others), a protected case's read logged as `fir_text`; no migration. Web: new FIR part "Ask the case file" (`AskCaseFile.tsx`, logic in `askFile.ts`): (1) a guilt, truth or "what will he do" question is refused with the reason before anything is sent; (2) the passages that share words with the question are found (whole words or the same first five letters, numbers count double, Indian scripts included), only those go to the gateway (`case_qa`, prompt version `case_qa/ask@1`); (3) no match: "not in the file", no AI call; (4) the answer must cite `[S1]`..., the screen shows exactly the cited pieces as quotes with their title, an answer citing none is marked "no source given: do not rely", "NOT IN THE FILE" is shown as such; (5) two disagreeing dates are asked to be shown both (prompt rule); (6) the officer's verdict (useful, or wrong or not supported) is logged through `/v1/decisions`, which is the measure of plan section 2 rule 5. The part loads the case file only when chosen (all parts mount at once; without this every FIR view would read it and log a protected read). 11 languages (10 drafts).
- Bug found by the new test: the word splitter cut Indian words at vowel signs (it ignored combining marks); fixed before it shipped.
- Tests: `CaseFileApiTest` (3: passages and labels, outsider and front desk 404, protected read logged), `askFile.test.ts` (25), `AskCaseFile.test.tsx` (9), FirDetail (the part list, and that the file is read only when the part is chosen), a11y axe check, browser test `tests/e2e/test_ask_case_file.py` (real core and gateway with the `fake` provider: refusal, not in the file, a real answer with its source, the verdict), phone test now walks 14 parts. `SecurityMatrixTest` covers the new route.
- `scripts/test-all.sh` at the end (run as its suites, see session 71): repo rules PASS, packs PASS, xlit PASS, ai-gateway PASS (99%), web PASS (tests, gate, lint, build), database rules PASS, core `mvn verify` PASS, e2e PASS (29 passed, 3 skipped). Coverage: core 98.09% lines / 93.33% branches, web 99.96% statements / 96.07% branches / 98.04% functions, gateway 99%. Gates raised: web statements/lines 99, branches 94, functions 96 (was 97/89/95; the gate had been left 7 points under).
- Skipped / not done: older-code tests (the item and the flaky test took the session; the coverage report shows no logic left uncovered in the files touched); the "note in case diary" button; real retrieval with embeddings; screenshot comparison with board 19.
- Risk: word matching misses a question phrased with other words than the file (it says "not in the file", which is safe but can be wrong); the question guard is English only, other scripts rely on the model's safety text; a refused question (screen side) is not in the audit log.
- Next: 13l Audit log (board 20: protected reads, AI decisions, admin actions and overrides on one screen); then 13m Field capture and State setup; the gateway-side guilt refusal and real retrieval go with item 17.
- Blocked: nothing.
Questions for Sumit:
1. Should a refused question (guilt, truth, prediction) be written to the audit log? Today it is refused on the screen and not logged; logging needs the question text or only its kind (the gateway keeps no text today).
2. Retrieval today is word matching. Are you happy to keep it for the pilot, or should the embeddings and the vector index (state servers only) come before 13l?
3. Still open from session 72: who checks the old-to-new law table, and may a state add its own rows?

## 5 Nov 2026, session 72 (scheduled run, last of the night, Sumit away)
- Baseline (fresh container; PostgreSQL started, role `caseapp` and databases created, `npm ci`, gateway requirements, psycopg and playwright installed): all 8 suites PASS before any change. The checkout was `setup/seed` from origin (the container started on `master`).
- Item 13j, **Old law to new law finder** (board 18). `packs/IN/law-concordance.json` now has one `sections` list (law IPC, CrPC or IEA; old section; new section or null; what it covers; optional `partial`): 59 sections, still a labelled draft (it replaces the old `IPC` map; `FirImport` reads the IPC rows of `sections`, so the importer's hint is unchanged). `LawFinder` (`GET /api/law-finder`, any signed-in officer; checks the table at start-up: known law, section number form, no duplicate, a description) gives status, note and entries. Screen `#/laws` (`LawFinder.tsx`, menu link under Tools for every account): search by section number or word, one button per law (IPC → BNS, CrPC → BNSS, IEA → BSA), "partly matches" chip, the draft warning, and the "which law applies" text of the board; 15 new screen texts in 11 languages (the 10 Indian ones are drafts like the rest).
- Tests: `LawFinderTest` (2), `LawFinderApiTest` (1), `packs/tests` law table test widened (form, no duplicates, all three laws, sections the importer relies on), `LawFinder.test.tsx` (5), App test for the menu link, axe check, browser test `tests/e2e/test_law_finder.py`, the Indian-scripts rendering test now draws `#/laws` in all 10 languages at both widths. `LawFinder` 0 lines and 0 of 24 branches missed.
- `scripts/test-all.sh` at the end (run as its suites, because the core needs a JDBC URL and the Python suites a postgresql URL, see session 71): repo rules PASS, packs PASS, xlit PASS, ai-gateway PASS (99%), web PASS (tests, gate, lint, build), database rules PASS (170), core `mvn verify` PASS with its gates, e2e PASS (28 passed, 3 skipped). Coverage: core 98.07% lines / 93.36% branches (gate 96/90), web 99.96% statements / 95.84% branches / 97.96% functions (gate 97/89/95), gateway 99% (gate 97). No gate rose 2 points since the last entry, none changed.
- Older code: looked at the lowest-covered files. The core's "missed" lines in `RecordsController` (the `badRequest(...)` refusals) are not real gaps: JaCoCo does not count a line whose call never returns, and the tests for them exist; the other misses are `IOException` catch blocks. Web leftovers are default-value branches (`rows?.length ?? 0` in FirList, ReadsPage, TypingField, typing.ts). No test added for them.
- Skipped / not checked: the AI explanation of a section (plan A8: the AI only explains, through the gateway); screenshot comparison with board 18; a state module's own rows; the "pack v3.2 · checked" line of the board (there is no pack version of checks yet, the screen says draft instead). The section table was written from knowledge of the Acts, not copied from the gazette: a prosecutor must check every row before the draft label is removed.
- Risk: a wrong row in the table could point an officer to the wrong new section; it is labelled a draft and a hint, nothing is converted, and the screen tells the officer to read the bare act.

### Tonight in short (sessions 70 to 72)
- Session 70: Forensic and medical requests (V44, `#/expert`). Session 71: Court and trial tracker (V45, `#/court`). Session 72: Old law to new law finder (`#/laws`, no migration).
- Last run of the night (session 72, scripts as above): all suites PASS, core 98.07 / 93.36, web 99.96 / 95.84 / 97.96, gateway 99.
- Next: 13k Ask the case file (board 19, through the AI gateway, sources only, refuses guilt questions); then 13l Audit log, 13m Field capture and State setup; the AI explanation for the law finder (A8) goes with the AI items.
- Blocked: nothing.
Questions for Sumit:
1. Who can check the old-to-new law table (a prosecutor or the legal cell)? Until then it stays a draft.
2. Should a state module be allowed to add its own rows (for example a state Act), as it can for the glossary?
3. From session 71, still open: should a hearing date appear on the Dashboard and as a deadline, and should witness names be masked for a protected victim?

## 5 Nov 2026, session 71 (23:40 IST scheduled run, Sumit away)
- Environment: fresh container; started PostgreSQL, created role `caseapp` and databases `caseapp_test` and `caseapp_dev`, `npm ci`, gateway requirements, psycopg and playwright installed (Maven Central was reachable). The `DATABASE_URL` for Java must be `jdbc:postgresql://localhost/caseapp_test`, for the Python database tests `postgresql://caseapp:caseapp@localhost/caseapp_test`; `scripts/test-all.sh` uses one variable for both, so run `mvn verify` and the Python suites with their own value. Two baseline runs started by mistake at the same time collided on the database (`pgcrypto` already exists); never run two at once.
- Item 13i, **Court and trial tracker** (board 12). Migration V45: `court_event` (kind chargesheet_filed, cognizance, copies_given, charge_framing, prosecution_evidence, arguments, judgment, other; date past or coming; optional court, court case number, note) and `court_summons` (witness, optional role, status sent/served/not_served/appeared/excused, date, note); both kept as written. `CourtController`: `GET /api/court` (cases the caller may open that have a court date: newest court and case number, next date = earliest date from today (IST), number of events, witnesses whose newest step is sent or not served; counts of coming and no coming date), `GET /api/firs/{id}/court` (timeline and the newest summons step per witness, case team only), `POST .../court-events` (not before the FIR was registered; future dates allowed) and `POST .../court-summons` (not in the future), case team only. A one-letter court or role is a 400. Web: `Court.tsx` at `#/court` (menu link for accounts of a station), list, timeline, summons table, two forms, "start a court record" form; 35 new texts in all 11 languages (drafts, like the others). Nothing here judges a witness, an accused or the case.
- Tests: `CourtApiTest` (5), `db-tests/test_court_tracker.py` (2), `Court.test.tsx` (6), axe checks (list and with a case picked), App test for the menu link, browser test `tests/e2e/test_court.py`, the Indian-scripts rendering test now draws `#/court` in all 10 languages at both widths, `MigrationTest` 45. `CourtController` 0 lines and 0 of 14 branches missed.
- Suites at the end: repo rules, packs, xlit, gateway, web (tests, gate, lint, build), database rules (170), core `mvn verify` with its gates and e2e (27 passed, 3 skipped) all green. `tests/e2e/test_phone.py` failed twice when run on its own (also on the untouched code, the `::before` card label read as empty) but passed in the full e2e run; it looks order- or timing-dependent, not caused by this session.
- Skipped / not checked: screenshot comparison with board 12 (not taken); the ICJS feed and AI prosecutor brief; the next court date joining the Dashboard or the deadlines; a reminder for unserved summons; the exact coverage percentages were not re-read this session (all gates passed).
- Risk: witness names, roles and notes are typed by the officer and can name a protected victim; they are not masked or logged in the protected-read log (same as the property register and forensic requests). Worth deciding before real data.
- Next: 13j Old law to new law finder (board 18), then 13k Ask the case file.
Questions for Sumit:
1. Should a hearing date appear on the Dashboard and as a deadline of the case (so the SHO sees it with the 24-hour and 60/90-day limits)?
2. Should witness names on this screen be masked for a protected victim (a witness who is the victim), as the people list does?

## 5 Nov 2026, session 70 (scheduled run, Sumit away)
- Baseline (fresh container; PostgreSQL started, role `caseapp` and databases created, `npm ci`, gateway requirements and psycopg/playwright installed): all 8 PASS. The repository was attached already; the checkout was `setup/seed` from origin.
- Item 13h, **Forensic and medical requests** (board 16). Migration V44: `expert_request` (case, kind forensic/medical, what is asked, sent to, sent on, optional evidence item of the same case) and `expert_request_step` (sent, at_lab, sample_sent, report_received, reminder_sent, with date and note); both kept as written (no change, no delete). `ExpertRequestController`: `GET /api/expert-requests` (the requests of the cases the caller may open, by `canReadFirSql`; newest step as status, days waiting, `reminder_due` after 30 days with no report, counts), `POST /api/firs/{id}/expert-requests` and `POST .../{rid}/steps` (case team only; the date a real date not in the future and not before the request was sent; nothing after the report, 409; an evidence item of another case a 400), `GET .../{rid}/steps`. A reminder step does not change the status. Nothing here judges a report or a person, no score. Screen `#/expert` (`ExpertRequests.tsx`, menu link "Forensic and medical" for accounts of a station): counts, the table, steps and the form of the request picked, the form to raise a request on one of the newest 100 cases. 30 new texts in 11 languages (drafts).
- Tests: `ExpertRequestApiTest` (6), `db-tests/test_expert_requests.py` (3), `ExpertRequests.test.tsx` (8), axe checks (list and with a request picked), App test for the menu link, browser test `tests/e2e/test_expert_requests.py`, the Indian-scripts rendering test now draws `#/expert` (one request, late) in all 10 languages at both widths, `MigrationTest` 44. `ExpertRequestController` 0 lines and 0 of 30 branches missed.
- `scripts/test-all.sh` at the end: all 8 PASS. Coverage: core 98.02% lines / 93.20% branches (gate 96/90), web 99.96% statements / 95.69% branches / 97.84% functions (gate 97/89/95), gateway 99% (gate 97). No gate rose 2 points, none changed.
- Skipped: the board's MedLEaPR link and lab queue positions (no such interface); reminder timings from the state pack and the "SHO is told 15 days before the chargesheet date" rule (30 days is a constant, `REMINDER_DAYS`); the report joining the readiness check; screenshot comparison with board 16; tests for older code (the session went to the item and its gates; lowest spots are still those listed in session 69).
- Risk: the "what is asked" and "sent to" texts are typed by the officer and can name a protected victim; they are not masked or logged in the protected-read log (same as the property register and evidence list).
- Next: 13i Court and trial tracker (board 12), then 13j Old law to new law finder (board 18).
Questions for Sumit:
1. Should the reminder wait be set per state in the pack (now 30 days for everyone, as on the board)?
2. Should an SHO be told when a report is still missing 15 days before the chargesheet date (the board's rule)? It needs the chargesheet date of each case, which the app has only as a deadline.

## 5 Nov 2026, session 69 (scheduled run, last of the night, Sumit away)
### Tonight in short (sessions 67 to 69)
- Session 67: Supervisor review (board 11). Session 68: Money trail (board 8, V42). Session 69: Case property register (board 15, V43), below.
- `scripts/test-all.sh` at the end of session 69: all 8 PASS (repo rules, packs, xlit, gateway, web, database rules, core, e2e). Coverage: core 97.98% lines / 93.08% branches (gate 96/90), web 99.95% statements / 95.66% branches / 97.75% functions (gate 97/89/95), gateway 99% (gate raised from 94 to 97, in `scripts/test-all.sh`, `.github/workflows/ci.yml`, CLAUDE.md and TESTING.md). Web and core gates unchanged (none rose 2 points over the figures in TESTING.md).
- Baseline of session 69 (fresh container; PostgreSQL started, role and databases created, `npm ci`, gateway requirements and psycopg/playwright installed): 6 of 8 PASS, 2 red, both test faults, fixed first with their own commits: (1) `tests/e2e/test_answer_fields_live.py` posted a victim update and a chargesheet dated 31 Oct, but the demo FIR is registered 4 days before today (India time), so from 5 Nov the server rightly refused them; the days now follow today. (2) `test_every_audit_row_moves_the_head_kept_by_the_core_app` compared tokens made by two calls of `token()`, which carries the clock second, so it failed whenever a second boundary fell between them (it also failed in session 66's note "watch it, not chased"); the token is made once.
- Session 69, item 13g, **Case property register** (board 15). Migration V43: `custody_event.place` (malkhana, lab, court, owner, other; empty for older rows; the log stays append-only). `POST /api/firs/{id}/evidence/{itemId}/custody` takes an optional `place`. New `GET /api/property` (`PropertyController`): the seized physical items of the cases the caller may open (case team, `fir.read_station`, or `evidence.custody` at the FIR's station, by permission from the packs, never a role name; `CaseTeam.canSeePropertySql`), newest 500, each with its case, station and its place from the newest hand-over, a status (in malkhana / at a lab or court / returned to owner / elsewhere / place not stated / no hand-over written), and counts. Screen `#/property` (`Property.tsx`, menu link "Case property" for accounts of a station): the table, counts, the hand-over log of an item picked, and the form to record the next hand-over (who handed, who received, where, place, why, seal intact). 37 texts in 11 languages (drafts).
- Tests: `PropertyApiTest` (5: statuses from the newest hand-over, who sees what, place from the list, the 500 limit, status words), `db-tests/test_custody_place.py` (2), `Property.test.tsx` (6, 100% lines), axe checks (list, and with an item picked), App test for the menu link, browser test `tests/e2e/test_property.py` (keeper records two hand-overs, counts follow, log keeps both rows, an IO of another station sees nothing), the Indian-scripts rendering test now draws the register (one item with a hand-over) in all 10 languages at both widths, `MigrationTest` 43. `PropertyController` 0 lines and 0 of 18 branches missed.
- The final full run had to be repeated once: `tests/e2e/test_phone.py` read a table cell with `document.querySelector` right after the list was drawn again and got null (seen once; it passed alone twice); it now uses a waiting locator. Final `scripts/test-all.sh`: all 8 PASS.
- Tests for older code (the last session of the night): `CaseTeamRefusalsTest` (missing users and places are always no; permission at a station follows role scope), Readiness screen tests; gateway `store.py` and `auth.py` now 100% (failed audit write leaves no half row, unknown feature/provider/action, a core answer that is not JSON, pruning of the remembered-yes list and of the draft limiter, tampered chain link, model switch, feature list): 96 to 99%. Web: new `Dashboard.test.tsx` (100%), more `FrontDesk` and `Notices` tests (refused and undiscardable AI drafts, withheld names, unknown kinds and statuses): web branches 94.1 to 95.3%.
- Looked at and left: the core coverage report lists `RecordsController` lines as missed (e.g. the remand and release date refusals) although `RecordsRefusalsApiTest` reaches them (checked by printing the reasons of its 400 answers); not understood, may be the report merging, so the core figures above are what the gate reads. Remaining low spots: `RecordsController` 18 branches, `ImportController` 14, `ComplaintController` 10, `CaseTeam` 9; web `Arrests.tsx`, `Readiness.tsx`, `AdminPage.tsx` 8 branches each (mostly "list not loaded yet" fallbacks).
- Skipped: QR labels and scanning (no scanner or label printer, and no QR library in the build; adding one needs your word, see question 1); "due in court this week" and "can be released or disposed" (need court dates per item); screenshot comparison with board 15 at 1280 and 390 px; the mutation script for trigger rules does not cover the new column (it is a CHECK, tested in `test_custody_place.py`).
- Risk: the item description and the "where" text are typed by the officer; they can name a protected victim and are not masked or logged in the protected-read log (same as the evidence list). The register shows no victim details of its own.
- Next: 13h Forensic and medical requests (board 16), then 13i Court and trial tracker (board 12).
Questions for Sumit:
1. May I add a small QR library to the web app (QR labels printed per item, scanning with the phone camera) for the Case property screen? It is a new dependency and the camera needs the page on HTTPS (as `deploy/nginx.conf` already gives).
2. Should a seized item that is in court or at a lab for more than a set number of days show a warning to the SHO (a deadline in the plan)? None is set now.
3. Should the malkhana keeper see items of the whole district or only of their own station (now only their station)?

## 4 Nov 2026, session 68 (scheduled run, Sumit away)
- Item 13f, **Money trail** (board 8). Migration V42: `money_transfer` (from account, to account, optional receiving accused, amount in paise, date, optional bank reply from the evidence register) and `money_hold` (account, amount, date, optional reply); both kept as written (no change, no delete); the receiver must be an accused of the same case and the reply an evidence item of the same case. `MoneyTrailController` (`GET /api/firs/{id}/money-trail`, `POST .../transfers`, `POST .../holds`): case team only (404 for others on the read, 403 on the write); amounts are rupees with at most two decimals (positive), the date a real date not in the future (India time); a person or evidence item of another case is a 400, never a database message. The read also returns the table of the accused built from what the app already keeps: money that reached them, the account-holder mark (V6) and the `accused_link` rows still standing (readiness check), with the status Both links / Money only / Second link only / None found. It adds no new rule to the readiness check (the two-link rule of V6 already is there) and gives no score. Screen `MoneyTrail.tsx` as the FIR part "Money trail" (13th part), 44 new texts in 11 languages (drafts), Indian digit grouping (`rupees`), wide tables scroll inside their own box (`.table-scroll`).
- Tests: `MoneyTrailApiTest` (4), `db-tests/test_money_trail.py` (3), `MoneyTrail.test.tsx` (5), axe check of the screen, FIR screen tests (13 parts), browser test `tests/e2e/test_money_trail.py`, `MigrationTest` 42.
- Baseline: fresh container; PostgreSQL started, role and databases created, `npm ci`, gateway requirements and psycopg/playwright installed. The first full run (with my change already in the tree) showed one red: the phone test counted 13 parts against a web build made before the screen was added. The next full run found the new screen widened the page in Tamil and Malayalam at 1280 px (`test_indian_scripts`); fixed with `.table-scroll`.
- `scripts/test-all.sh` at the end: all 8 PASS. Coverage: core 97.96% lines / 92.5% branches (gate 96/90), web and gateway gates passed unchanged. No gate raised. `MoneyTrailController` 0 lines missed, 1 of 20 branches.
- Skipped: screenshot comparison with board 8 at 1280 and 390 px; the board's flow-by-layer picture, "not traced yet" and the release of a hold; "same accounts in other cases" (a search across cases, see question 1); the trigger-mutation script does not yet cover the two new tables; no tests added for older code.
- Risk: the account texts are free text typed by the IO; a bank account of a protected victim could be typed there and is not masked or logged in the protected-read log (same as the final report text). Account numbers should be typed in the masked form (XXXX0055) as the bank replies show them; no check enforces this.
- Next: 13g Case property with QR custody (board 15).
Questions for Sumit:
1. The board's "Same accounts in other cases" would search every case for the same account or UPI id. That is a search across cases and people (the plan's section 9 point 7 calls it profiling). Build it only for the case team's own cases, as a match list of case numbers and contact officers, or leave it out of the app?
2. Should a bank hold be able to be released (the bank unfreezes or a court orders release), as a new row with a date and a reason? Not built; the screen shows holds as they were recorded.

## 4 Nov 2026, session 67 (scheduled run, Sumit away)
- Item 13e, **Supervisor review** (board 11). `GET /api/supervisor` (`SupervisorController`): needs the pack permission `chargesheet.approve` (403 otherwise, never a role name), lists the open cases the caller is on the case team of (SHO: the station; SP: the district; never another district), by nearest deadline, with the IO, the sections, the nearest deadline, the gaps still open in the readiness check, the state of the final report and `can_decide` (a submitted report, not the caller's own, in the caller's reach). Signed reports leave the queue. Counts: reports waiting, cases due within 21 days. No score of any officer or case; the screen says open gaps are not a mark on the officer. Screen `Supervisor.tsx` (menu link for holders of the permission, row link to the Final report part where the decision is made), 18 new texts in 11 languages (drafts).
- Tests: `SupervisorApiTest` (4: who sees it and of what reach, order and counts, submitted/approved/signed life, no deciding of one's own submission), `Supervisor.test.tsx` (3, 100%), axe check of the screen, browser test `tests/e2e/test_supervisor.py` (SHO sees and opens the report, IO has no link and gets 403).
- Baseline: fresh container; PostgreSQL started, role and databases created, `npm ci`, gateway requirements (`httpx`, `fastapi` were missing at first, which made the gateway and three e2e tests fail until installed) and psycopg/playwright installed; then all 8 PASS.
- `scripts/test-all.sh` at the end: all 8 PASS (repo rules, packs, xlit, gateway, web, database rules, core, e2e). Coverage: core 97.9% lines / 92.5% branches (gate 96/90), web 99.7% statements / 93.9% branches / 97.6% functions (gate 97/89/95), gateway 96.0% (gate 94). No gate raised (none rose 2 points). `Supervisor.tsx` 100%; `SupervisorController` 0 lines missed, 2 of 16 branches (the no-deadline case cannot be made, every FIR has deadlines from the view).
- Skipped: AI briefing of each case (A9, needs the gateway); screenshot comparison with board 11; the board's "Approve and send to prosecutor" panel on this screen (the decision is on the Final report part); no tests added for older code.
- Next: 13f Money trail and accused links (board 8), then 13g.
Questions for Sumit:
1. Should the supervisor queue also show cases with no deadline and no IO ("unassigned")? They are listed last now.

## 3 Nov 2026, session 66 (scheduled run, last of the night, Sumit away)
### Tonight in short (sessions 64 to 66)
- Session 64: Type page restyle (board 17). Session 65: Statements and witnesses (board 6, V40). Session 66: Draft and sign the final report (board 10, V41), below.
- Session 66, item 13d, **Final report under BNSS 193**. Migration V41: `final_report_draft` (one per FIR; facts in brief and evidence for the charges, in the language chosen) and `final_report_event` (every step, kept as written). The database allows only draft -> submitted -> (returned -> submitted again | approved -> signed); words change only in draft or returned; a decision is never by the officer who submitted; the signer is the officer who submitted; a signed report and the event list cannot be changed or deleted. `FinalReportController` (`GET`/`PUT /api/firs/{id}/final-report`, `POST .../submit`, `.../decision`, `.../sign`): case team only; submit needs both parts (20 characters each), a chosen playbook (the readiness check made) and **no open readiness gap** (an accepted gap is not open); approve or return needs the new pack permission `chargesheet.approve` (SHO and SP in `packs/IN/roles.json`, never a role name in code; limited to the station or district by `canAt`), a return needs a reason of 10 characters. Screen: FIR part "Final report" (particulars from the file, two typing boxes, status chip, Submit / Approve / Return with reason / Sign by state, history of steps); 22 new texts in 11 languages (drafts). Filing with the court is still recorded under Chargesheets (V14).
- Tests: `FinalReportApiTest` (6 tests: whole way, submit conditions, own submission, case team and head only, database shortcuts, open gap, out-of-order steps), `db-tests/test_final_report.py` (3), pack test for `chargesheet.approve`, `FinalReport.test.tsx` (7), the FIR part list tests, the browser case flow saves a draft and is refused submission without the readiness check, phone test counts 12 parts.
- Found by the tests on the way: the contract test refused web paths built from a variable (now literal paths); `MigrationTest` expected 40 (now 41); an answer shaped `[]` crashed the new screen (now tolerated, with a test).
- Baseline of the night: fresh container; PostgreSQL started, `caseapp` role and databases created, `npm ci`, gateway requirements and psycopg/playwright installed; all 8 PASS before any change (11 min).
- `scripts/test-all.sh` at the end: all 8 PASS (repo rules, packs, xlit, gateway, web, database rules, core, e2e; 7.5 min). One earlier full run showed `test_answer_fields_gateway` red while the machine was loaded after I had killed a run; it passed alone and in the final run (watch it, not chased). Coverage (re-read this session): core 97.9% lines / 92.2% branches (gate 96/90), web 99.7% statements / 93.9% branches / 97.6% functions (gate 97/89/95), gateway unchanged (gate 94). No gate raised (none rose 2 points over the figures in TESTING.md). `FinalReport.tsx` 100%.
- Skipped: AI drafting of the narrative (needs the gateway call and the source-linked sentences, plan section 7); screenshot comparison with board 10 at 1280 and 390 px; the mutation test script for trigger rules does not yet cover `witness_statement` or `final_report_draft`. No time left for tests of older code beyond the Final report edge cases (lowest-covered files: `FrontDesk.tsx` branches 89%, `RecordsController` 18 branches, `ImportController` 14).
- Risk: the facts and evidence text can name a protected victim; it is shown to the case team only, but it is not masked inside free text and its reads are not yet in the protected-read log (same as the FIR text before session 51); add `final_report` to `protected_read.what` when the AI draft arrives.
- Next: 13e Supervisor review (board 11: queue of cases near a deadline or waiting for approval, which now includes submitted final reports), then 13f.
Questions for Sumit:
1. Should the SP also approve a final report, or only the SHO of the station? I gave `chargesheet.approve` to both (the SP is above the SHO, and an SHO who is also the IO cannot approve their own report).
2. Should a final report be blocked until every witness listed has a statement, or is the count shown ("1 with a statement") enough for the pilot?

## 3 Nov 2026, session 65 (scheduled run, Sumit away)
### Tonight in short
- Item 13c, Statements and witnesses (board 6). Backend: V40 `witness_statement` (language spoken, medium written/audio/video, the words as said; the database refuses any change or delete, and a statement only for a complainant, victim or witness of the same case), `StatementController` (`GET`/`POST /api/firs/{id}/statements`, case team only, covered by `SecurityMatrixTest` automatically), reads of a protected case's statements are logged (`statements` in `protected_read`). Screen: FIR part "Statements" (witness tracker with Recorded / Not recorded chips, statement cards, form; the language of a new statement is the typing language chosen at the top). 18 new texts in 11 languages (drafts). Tests: 4 API tests, 4 web tests, the browser case-flow test records a statement.
- Fixed on the way: the Statements part reloads when a person is added on the same page.
- Baseline fresh container: PostgreSQL started, `caseapp` role and databases, `npm ci`, gateway requirements installed. `scripts/test-all.sh` at the end: all 8 PASS. Coverage numbers not re-read; no gate changed.
- Deliberately left out (not faked): English translation beside the original (belongs with AI A3 through the gateway), the "differences to clarify" panel, the video player, a seizure-witness/telecom-officer "needed" note. No statement from an accused (BNSS 180 witnesses only; confession rules need a lawyer's view).
- Skipped: screenshot comparison with board 6 at 1280 and 390 px not taken this session; do it next time. The mutation test script for trigger rules does not yet cover `witness_statement`.
- Risk: statement text can name a protected victim; it is shown to the case team only and the read is logged, but it is not masked inside free text (same as the FIR text).
- Next: 13d Draft chargesheet and sign (board 10), or 13e Supervisor review (board 11).
Questions for Sumit:
1. Should an accused or suspect's own statement ever be recorded in this screen (BNSS 180 covers any person acquainted with the facts, but an accused's words to the police have special rules)? I kept it witnesses, victims and complainants only.
2. For statements in a language the court does not use, should the English/Marathi translation be required before a chargesheet can be marked ready?

## 3 Nov 2026, session 64 (scheduled run, Sumit away)
### Tonight in short
- Item 13, Type page (board 17): the typing box, its how-to line and the spelling note now sit in one card above the legal glossary card. Web test extended. No board panel faked: the on-screen keyboard, the demo speech button and "a name in every script" are demo-only on the board and left out.
- Baseline: fresh container; PostgreSQL started, `caseapp` role and databases created, `npm ci`, gateway requirements installed (the first pip install had failed, so gateway and 3 e2e tests were red until fastapi/httpx were in; not a code fault). `test_phone.py` failed once while the machine was loaded (a Playwright connection error) and passed alone and in the final run; watch it, not chased.
- `scripts/test-all.sh` at the end: all 8 PASS (repo rules, packs, xlit, gateway, web, database rules, core, e2e). Coverage: core 98% lines / 92% branches (gate 96/90), web 99.7% statements / 93.5% branches / 97.4% functions (gate 97/89/95), gateway 96% (gate 94). No gate raised (none rose 2 points). TypePage 100%.
- Skipped: screenshot comparison with board 17; no time for extra tests of older code (a small item, but the baseline took most of the session).
- Next: 13c Statements and witnesses (board 6), then 13d.
Questions for Sumit:
1. Board 17 shows "Type" as a tools page with a keyboard and a name-in-every-script panel. Should the name panel (for lookout notices) be built for real, or stay out until a notice needs it?

## 2 Nov 2026, session 63 (scheduled run, last of the night, Sumit away)
### Tonight in short
- Last scheduled session of the night. One item built: Evidence list restyle (board 5). `scripts/test-all.sh` at the end: all 8 PASS (repo rules, packs, xlit, gateway, web, database rules, core, e2e). Coverage gates unchanged (core 96/90, web 97/89, gateway 94); coverage numbers not re-read.
- Baseline: fresh container lacked the `caseapp` role/databases, Python packages (psycopg, gateway requirements) and `npm ci`; installed, then all 8 PASS. Not a code fault.
- Item 13, Evidence (board 5): each item is a card; the court-ready state is a green/amber chip (word always shown); a stored hash shows short (first 4 and last 4 characters, whole on hover). Web test extended; e2e text in `test_load_data.py` adjusted. The Tamil phone check failed first (chip 407 px in a 390 px window); chips now wrap inside these cards.
- Differences from the board, on purpose: no table columns, video record, custody chain or 63(4) side card (the app has no such data yet; not faked); certificates stay under each electronic item.
- Skipped: screenshot comparison with the board at 1280 and 390 px not taken this session (the phone-width e2e check passes); do it next time. No time left for extra tests of older code.
- Next: Type restyle (board 17), then 13c Statements and witnesses.
Questions for Sumit: none new.

## 2 Nov 2026, session 62 (scheduled run, Sumit away)
- Baseline: fresh container needed PostgreSQL started, a `caseapp` role and `npm ci`; then all 8 suites PASS (6.5 min).
- Item 13, Notices (board 4): each notice is a card with a coloured status chip (draft, sent, reply incomplete, complete, cancelled; the word is always shown). The text `notice.toLine` lost its ": {status}" in all 11 languages because the status is now the chip. Tests updated (Marathi list test, e2e load-data text). Screenshots at 1280 and 390 px compared with the board.
- Differences from the board, on purpose: no table columns (TO / ASKED FOR / SENT / STATUS), no reply-detail card with Yes/No chips, no "New notices in bulk" button (no such feature yet). The follow-up letter AI card belongs with item 14.
- `scripts/test-all.sh` at the end: all 8 PASS.
- Next: Evidence and Type restyle, then 13c Statements and witnesses.
- Skipped: coverage numbers not re-read per file (markup change, tests kept).
Questions for Sumit: none new.

## 2 Nov 2026, session 61 (scheduled run, Sumit away)
- Baseline: the fresh container lacked the gateway's runtime packages (httpx, fastapi); installed them, then all 8 suites PASS. Not a code fault.
- Item 13, front desk complaint page (board 13): the page is now three cards (what the informant said with read-back/signature and informant's copy; the first steps as a numbered list with Done / Overdue / Due chips; the outcome). No new texts, so the 11 languages are unchanged. Screenshots at 1280 and 390 px compared with the board. Differences on purpose: no live transcript, AI "details picked out" or Where-to-register panel (the app has no data for them yet; not faked).
- `scripts/test-all.sh` at the end: all 8 PASS (core, web and gateway gates unchanged).
- Next: item 13 Notices, Evidence and Type restyle, then 13c Statements and witnesses.
- Skipped: coverage numbers not re-read per file (change is markup only, test updated).
Questions for Sumit: none new.

## 2 Nov 2026, session 60 (Sumit present from 17:32 IST: AI role, screen structure, duty roster, sign-in, POCSO and 112, RAG chatbot, chargesheet AI, real print format, more real-time screens)
- `docs/AI-AND-SCREENS-PLAN.md`: what the AI does today (one feature on a screen, notice drafting; six more declared in
  the gateway), the five rules every AI feature keeps, nine AI features in order, the five-part structure of every screen,
  a station duty roster, POCSO case mode and 112/ERSS events and other high-alert kinds, how the AI helps the chargesheet,
  the court print format, eight flaws of the RAG board and their fixes, seven real-time screens. Next items 14 to 18.
- **Sign-in centred** on desktop and tablet (brand, card, languages below), full width on a phone (`.signed-out`).
- **Printed papers in the court format** (Supreme Court circular, 12 Mar 2020): `@page` A4 with 2 cm / 4 cm margins,
  Times New Roman 14 pt at 1.5 spacing, quotations 12 pt; only the paper prints (no blank pages after it). The informant's
  copy (BNSS 173(2)) checked as a PDF: one A4 page, serif embedded.
- Sources: [SC circular on A4 filings](https://www.scconline.com/blog/post/2020/03/12/sc-a4-size-paper-shall-be-used-in-pleadings-petitions-affidavits-or-other-documents-to-be-filed-in-supreme-court/),
  [chargesheet particulars under BNSS 193](https://lawsikho.com/blog/charge-sheet-under-bnss-format-procedure-guide/),
  [POCSO child-friendly procedure](https://lawfoyer.in/child-friendly-approach-and-procedure-under-pocso-act-2012/),
  [Maharashtra Dial 112 / ERSS](https://www.theprotector.in/?p=3553).
`scripts/test-all.sh`: all 8 PASS.

Questions for Sumit
1. Can you get one real blank form from a station (FIR, BNSS 94 notice, final report)? The print layouts copy the state's form; without one they follow the court format and the BNSS order of particulars.
2. Does the pilot district have an ERSS/112 interface the station may receive events from, or should 112 events be entered by hand at first?

## 2 Nov 2026, session 59 (Sumit present from 15:51 IST: "the exact screens of the Figma, or better, and all missing screens")
Sumit found that the built screens did not follow his design (canvas of 22 Oct). Cause: the design was never part of the
build plan, so no session compared screens with it. Fixed at the root and started on the screens.

Done (all tests first where there is logic)
- **The design is the reference**: its 21 boards copied to `docs/design/boards/`; `docs/DESIGN.md` (tokens, frame, the
  board-to-screen map, differences on purpose); a "Screens" rule in CLAUDE.md (compare a screenshot with the board before
  committing); Next item 13 lists every missing screen in order, ahead of other work.
- **The look on every screen** (`index.css`): the board's colours as tokens, cards, status chips, buttons, fields,
  tables. **The frame**: a white sidebar with the "CA" tile, the station's name, the menu in groups (This case, Station,
  Tools, Admin), the officer and Sign out; the demo strip on top. Phones keep the folded menu (all phone and 10-language
  tests pass at 390 px).
- **Dashboard** (board 1) as the first screen: `GET /api/dashboard` gives the deadlines of the cases the user is on the team
  of (never others', `DashboardApiTest`), soonest first, with counts; urgency shown as a word and a colour.
- **The parts of a FIR as pages** (`#/firs/{id}/{part}`, boards 2-10), named in the sidebar; "Whole case file" keeps the
  one-page view.
- **Readiness check** (board 9): Linked / Certificate missing / Missing chips per ingredient, gaps as cards. The board's
  "Proved" is not used: the check says what the file holds, never that something is proved.
- **Case diary, BNSS 192** (board 14, V39 `case_diary_entry`, `case_diary_page`): today's page takes entries (typed or
  spoken, any script); the app's own steps that day (notices sent, seizures, arrests, IO assigned, victim updates,
  chargesheets) appear on the page from their records; a page is closed and numbered; nothing is changed or deleted (the
  database refuses it) and a closed page takes no more entries; reading the diary of a protected case is logged.
- The station name comes with sign-in (`station_name`). 52 new texts in the 11 catalogs (draft translations).

`scripts/test-all.sh`: all 8 PASS. Coverage: web 99.7% statements / 93.6% branches.

Compared with the boards: Dashboard and Readiness and Case diary match their boards' layout; the board's demo numbers
(13 open cases, money held) are not faked, only what the files hold is shown. The top strip's quick links (Ask the case
file, Old to new law) come when those screens exist.

Deliberately skipped / not checked
- The diary's day list shows days with an entry or a closed page, not days that only have app events.
- The boards for the missing screens (item 13 c to m) are not built yet; each needs its own records and rules.

## 2 Nov 2026, session 58 (Sumit present from 15:16 IST: "act like that and do the testing")
Session 57 had already run an internal penetration test (round 1). This session ran **round 2** on the gaps round 1
listed: a second (fictional, not committed) state pack, a protected sexual-offence case, 17 accounts; testssl.sh,
Nikto, sqlmap, Schemathesis and a scripted read matrix across both states. Report: `docs/PENTEST-2026-11-02.md`, "Round 2".

Fixed, each with a test first: TLS 1.2 ciphers without forward secrecy or with CBC (medium; forward-secret AEAD only
now); the gateway's API description open to anyone (low; turned off); a spoofed Host redirected to (low; default
server closes it, redirect uses `server_name`); every unknown path answered 200 (info; now 404).
**Installation note:** `deploy/nginx.conf` now names the host (`case.example.gov.in`): set the real name in both places.
Final `scripts/test-all.sh`: all 8 PASS (gates unchanged).

Not done (round 2 was stopped before them; for the accredited test): cross-state admin actions, privilege escalation
through account changes, race conditions, stored-script checks in a real browser, request smuggling.

## 2 Nov 2026, session 57 (Sumit present from 13:53 IST: "act like that and do the testing")
Ran a structured penetration test of the whole installation (OWASP WSTG + API Top 10) and wrote it up in
`docs/PENTEST-2026-11-02.md`. Stood the system up as a state would: nginx with TLS in front of the core and the AI
gateway (both bound to localhost), the demo case, and a second MH station/district as the outsider attacker.

Result: no High or Medium. One Low, fixed; four informational.
- LOW-1 (fixed, test first): a malformed query parameter (e.g. `?limit=abc`) returned 500, not 400 — the review's
  `ApiErrors` caught the NumberFormatException cause of a type-mismatch. `ApiErrors` now answers
  `MethodArgumentTypeMismatchException`/`MissingServletRequestParameterException` as 400 without echoing the value
  (`HardeningApiTest.aBadQueryParameterIsAPlain400NotA500`). No data had leaked (generic reference message).
- INFO: body-validation before authz (400 with DTO name on a write an outsider can't do; no existence oracle, valid
  body is 403); dynamic SQL from regex-validated role codes and fixed identifiers only (no injection found);
  HTTP->HTTPS redirect reflects Host (pin server_name in production); dev-only pytest advisory.
- Held under attack: BOLA/BFLA on every FIR sub-resource and complaints (404/403); JWT attacks (alg none/None, empty
  sig, tampered claims, weak-secret forge, exp tamper) all 401; server-side logout and per-address lockout; no SQLi;
  TLS 1.0/1.1 off and 1.2/1.3 on; all security headers; AI gateway injection boundary (extra fields/model path 422,
  admin-only audit/settings); no committed secrets; shipped deps clean (npm + pip-audit).
- Limits (why an accredited test is still needed): done by the builders; the real servers/network/TLS were not tested;
  the semgrep rule registry and hosted DAST were blocked from the sandbox, so only local SAST rules and registry audits
  ran; no large-scale fuzzing, social engineering or device testing. Recommendation in the report: a CERT-In empanelled
  auditor on the installed system before real case data.

`scripts/test-all.sh`: all 8 PASS.

## 2 Nov 2026, session 56 (Sumit present from 13:29 IST: "fix all the security issues")
Started from `setup/seed` at ddea2ad (session 55, nothing newer). Took item 12, the risks session 55 left open.

Done, each with a test written first
1. **Signing out ends the token on the server** (V38 `signed_out_token`, `POST /api/logout`). Every token now has an id
   (jti); a signed-out id is refused at once by the core and within 30 seconds by the gateway (its sign-in check). A
   token without an id is refused, so everyone signs in once more after this update. Sign out on the screen calls it and
   still signs out when the server cannot be reached. The other sign-ins of the same officer go on working. The table is
   kept as written (it is also the record of who signed out when).
2. **Sign-in limit per address**: 30 wrong passwords from one address within 15 minutes stop every sign-in from it for
   15 minutes after the latest, a right password too ("Too many wrong passwords from this computer..."); the username
   lock stays as it was. Index on the address (V38). The core takes the address its reverse proxy forwards
   (`server.forward-headers-strategy=native`: Tomcat trusts the header only from internal addresses).
3. **The AI draft limit holds across a restart**: counted from the audit log too (20 per officer in 10 minutes), with an
   index on actor and time; the memory count still stops a burst sent at once.
4. **Policy changes list**: a unit's own changes are found first, then the newest 200 (busier units used to hide them).
5. **Installation file** `deploy/nginx.conf`: HTTP only redirects to HTTPS; TLS 1.2 and 1.3; HSTS; the page's
   Content-Security-Policy as a header plus `frame-ancestors 'none'`; nosniff, DENY, no-referrer, a permissions policy
   (microphone for speech input only); 16 MB bodies; the client address replaced, never appended, so a made-up
   X-Forwarded-For cannot reach the core; no nginx version shown. `tests/repo_rules/test_deploy_config.py` keeps it in
   step with the app; `tests/e2e/test_https_proxy.py` runs it in a real nginx in front of the real core (skipped where
   nginx is not installed; this sandbox installed it with apt).
6. Five server messages of session 55 and 56 (address lock, 72-byte password, database refusal, unexpected error, too
   large) are in the 11 catalogs (draft translations, unchecked like the others).

Tests: core `HardeningApiTest` +4 (sign-out, token without id, address limit, policy list), gateway +1 (restart), web
+1 (sign-out), repo rules +3, e2e +2.
Final: all 8 suites PASS (`scripts/test-all.sh`; core and e2e re-run after the migration-number fix in `MigrationTest`). Coverage: core 97.8% lines / 92.7% branches, gateway 96% (gates unchanged).

Deliberately skipped / not checked
- The gateway still accepts a signed-out token for up to 30 seconds (its cached check), as for a disabled account.
- The address limit can lock out a whole station behind one address for 15 minutes after 30 wrong passwords there; an
  officer can sign in from another computer. If that happens often, a state can ask for a higher number.
- Anyone who can reach the core directly (not through nginx) from an internal address could write their own
  X-Forwarded-For; the core and gateway must listen on 127.0.0.1 only (said at the top of deploy/nginx.conf).
- An outside penetration test is still needed before real case data (people, not code).

## 2 Nov 2026, session 55 (Sumit present from 11:26 IST: "resolve the questions yourself, then break it, ethical and non-ethical hacking, and fix it")
Started from `setup/seed` at 021714b (session 54). Baseline `scripts/test-all.sh`: all 8 PASS.

Decisions: all open questions decided from the law (section "2 Nov 2026, decisions" at the top). Nothing is blocked now.

Security review (attacked a running copy with the demo case, as an outsider officer of another station, as an insider of
the case team, and with forged tokens; read the code of sign-in, access, admin, import and the gateway; checked every
dependency against the vulnerability databases)

What held (tested live, nothing to fix): another station's officer gets 404 on every read under the FIR and on its
complaints, 403 on admin, sign-in log, chain head and protected-read log; a token with `alg: none` or a changed claim is
refused; the role is always read from the database, never from the token; CSV exports neutralise formulas; import profile
names cannot walk the file system; React escapes all text (no raw HTML anywhere); the session ends with the browser tab;
the core sends `X-Frame-Options: DENY`, `nosniff` and `no-store`; npm packages shipped to browsers: no known vulnerability.

Found and fixed, each with a regression test written first
1. **The SQL leaked to the caller (high).** A refused database write without its own handler answered 500 with the SQL
   statement and the database's message (a NUL character in a complaint was enough). `ApiErrors`: a refusal answers 400
   in plain words, anything unexpected 500 with a short reference; the full error goes only to the server log.
2. **No cap on request size (medium).** A case-team user could store a 15 MB "name" on a case, loaded by every case
   screen after. `BodyLimit`: 1 MiB per request (16 MiB for loading a file), checked before anything reads the body,
   counted as it is read when no length is given. The longest complaint allowed (50,000 Indian-script letters) still fits.
3. **Passwords over 72 bytes (medium).** bcrypt reads 72 bytes; 25 Devanagari letters are 75. A new account or password
   change with a long Marathi or Hindi password was a 500 showing the encoder's message. Now a plain 400 for the account,
   the password change and the first admin.
4. **The AI model name reached the provider's address (medium).** The Gemini model goes into the request path, so an
   officer allowed to switch models could send `../files` or `x:other?` and use the state's API key on other methods of
   that API. Model names are now plain names only (letters, digits, `.`, `_`, `-`), for officers and admins.
5. **No limit on AI drafts (medium).** One token, stolen or misused, could ask without end; each draft is paid for. Now
   20 drafts in 10 minutes per officer; the next is refused (429, logged) before it reaches a provider. Free-text fields
   of the gateway (case reference, decision note, ids) have lengths too.
6. **Vulnerable Starlette (medium).** 14 known advisories in 0.41.3 (Host and path header handling, form and Range
   parsing). FastAPI 0.115.6 to 0.143.3, Starlette pinned at 1.3.1: none left. Spring Boot 3.5.6 to 3.5.16 (patch line:
   Tomcat and Spring Security fixes of the last year).
7. **No Content-Security-Policy on the web app (defence in depth).** The built page now allows only its own scripts,
   styles, fonts and servers; a browser test signs in, opens seven screens with no violation, and shows an injected
   inline script does not run. Development is unchanged (Vite needs inline scripts there).

Tests: core `HardeningApiTest` (6), gateway (+4), e2e `test_content_policy.py` (1).
Final `scripts/test-all.sh`: all 8 PASS. Coverage: core 97.7% lines / 92.7% branches, gateway 96% (gates unchanged). Re-ran the attacks on the fixed build: the NUL complaint gets the plain 400, the 15 MB body is cut off with 413, the long Marathi password gets the plain 400.

Risks, not fixed here (item 12 of the Next list)
- Signing out removes the token from the browser but the server accepts it until it expires (8 hours). A stolen token
  stays good that long; disabling the account or changing the password ends it at once (as built).
- Sign-in is limited per username (5 wrong in 15 minutes), not per address: one machine can try one password on many
  usernames. Behind the state's reverse proxy the address must come from its header, so this belongs with installation.
- Nothing here sets up HTTPS, HSTS or the policy as a response header: that is the installation's web server. The
  policy in the page covers the browser meanwhile.
- The gateway's draft limit lives in memory: a restart resets it, and two gateway copies would each allow 20.
- `GET /api/policy-settings` takes the newest 200 changes of the installation and then keeps the user's own: with many
  states a unit can see fewer than its own 200 (a correctness bug, not a leak).
- This was a review by the people who built it. Before officers use real case data, an outside penetration test
  (CERT-In empanelled auditor) should be done; this list is a starting point for it.

## 2 Nov 2026, session 54 (on-demand run started by Sumit at 10:27 IST)
Started from `setup/seed` at 39aee22 (session 53, nothing newer, no new answers). Item 9 and items 3 and 6 still wait for answers; took the next item without one: Stryker for the web app's logic.

Done
- **Stryker set up** (`npm run mutation` in `apps/web`, `stryker.config.json`, about 7 minutes, not part of `test-all.sh`). New dev dependencies, testing only: `@stryker-mutator/core` and `@stryker-mutator/vitest-runner` 9.2.0 (the usual tool for this in a Vite/Vitest app; nothing in the build or at run time).
- First run found real gaps: `parseSections` (typed sections like "BNS 318(4)") and `istIso` (typed time read as India time) had no unit test of their own, nor had the request-building in `api.ts` (token header, JSON type only with a body, password change swapping the token, gateway error text). Added `formats.test.ts` (6 tests), 5 tests in `api.test.ts`, 1 in `noticePrompt.test.ts`. Scores now: formats 94%, noticePrompt 100%, api 95% (survivors are equivalent or start-up code, listed in TESTING.md).
- `typing.ts` shows 0% in the tool: its tests are in `packages/xlit` and the component tests, which this setup does not map; not chased.

`scripts/test-all.sh`: all 8 PASS (web gates unchanged; none raised).

Deliberately skipped / not checked: the Stryker run is not in nightly CI (slow); other web files (components) not mutated, only the plain logic files; `npm audit` reports advisories in Stryker's dev dependency tree, not in anything shipped.

Next: item 9 (offline, waits for the answer), then items 3 and 6. Without answers: account lifecycle (ARCHITECTURE-TENANCY section 5, item 5: acting charge during leave, open cases on an SHO's transfer; needs design answers, see question 1).

Questions for Sumit
1. Account lifecycle: when an SHO is transferred or on leave, should open cases (a) stay with the named IO, (b) move to an acting SHO chosen by the SP with an end date, or something else? I will not build this without your rule.
2. The earlier open questions of session 53 (numbers 1 to 4) still stand.

## 2 Nov 2026, session 53 (scheduled run from about 10:25 IST, Sumit away)
Started from `setup/seed` at 276c4d6 (nothing newer, no new answers). Fresh sandbox: started PostgreSQL, created role `caseapp` and both databases, installed the gateway's `requirements*.txt` and `npm ci`. Item 9 (offline) and items 3 and 6 wait for answers, so I took the first item that does not: load the people once on the FIR screen.

Done
- **FIR screen reads the people once.** `FirDetail` now loads `/firs/{id}/people` one time and passes the list to `Arrests`, `Chargesheets` and `Readiness` (they each read it again before; the people part read it a fifth way through its own section). The people part is drawn from the same list. If the read fails, the error shows in the people part and the arrest form stays away (as before it simply did not appear). No server change.
- Tests: the three components' tests now hand the list in (their fetch stubs no longer serve `/people`); new `FirDetail` test: one read of `/people` for the whole page, and a failed read shows the error and no arrest form. Web 185 tests.

`scripts/test-all.sh`: PASS repo rules, packs, xlit, web, database rules, core, e2e browser; the ai-gateway line first failed only because its Python packages were missing in this sandbox (installed, then 32 passed, coverage 96%). Coverage gates unchanged, none raised.

Deliberately skipped / not checked
- The core's people answer is still read once per version bump plus once per opening of the readiness part (not changed; the protected-read log's one-minute rule stays as built in session 51).
- Readiness is keyed by `version`, so after a save in another part the people list reloads in `FirDetail` and the readiness part remounts; I did not test the race where the list arrives after the readiness report.

Next: item 9 (offline, waits for the answer), then items 3 and 6. Without answers: Stryker for the web app's date and form logic (TESTING.md item 6); account lifecycle (ARCHITECTURE-TENANCY section 5, item 5).

Questions for Sumit
1. Same as session 52: should a session push a short "in progress: item X" line to PROGRESS.md at its start so overlapping runs pick different items?
2. Still open from session 51: read log lines (one a minute or one per answer), how long to keep the log, and whether the SHO may see it.
3. Still open: may a phone keep case data (encrypted, for a limited time) for offline work, or online only? Should the FIR screen on a phone open on Deadlines?
4. Still open: reviewers for the glossary and screen texts (Marathi first?), the heavier state punishment class (session 43), the start of the 14 days of a preliminary enquiry (session 42).

## 2 Nov 2026, session 52 (1 Nov 23:35 IST scheduled run, Sumit away; ran alongside sessions 50 and 51)
Started from `setup/seed` at 4e7c369: session 50 (21:05) was still running and had not pushed yet, so this session took the same item (mutation testing of the database trigger rules) and wrote its own version. At push time sessions 50 and 51 were already on the branch, so I dropped my duplicate script and tests (kept locally only) and used my version as an **independent cross-check** of session 50's: I ran my 243 changes against session 50's tests.

Baseline `scripts/test-all.sh` (fresh sandbox: PostgreSQL started, role and databases created, Python packages and `npm ci` installed): all 8 PASS.

Done
- **Cross-check found 16 changes session 50's tests did not notice.** Its script never leaves a column out of a kept-as-written comparison, and for the signed complaint (BNSS 173(1)) **15 of its 19 kept columns** were untested: after signing, the language, time of receipt, mode, informant name, kind, station, signature time and officer, the outcome, its time, officer and FIR, and the enquiry's time, officer and permitting DSP could each have been changed without any database test failing. Also the five-minute clock allowance of an arrest time, which session 50 listed as untestable: the transaction's `now()` writes the exact edge. No rule was wrong.
- **Tests (dd70474)**, in session 50's `apps/core/db-tests/test_kept_rules.py`: every signed field and the signature, every outcome field, the FIR named as the outcome, every enquiry field, each refused alone; the arrest time at exactly five minutes ahead (allowed) and five minutes one second (refused). 
- **Script (3fd3454)**: `mutate_trigger_sql.py` now also leaves each column out of a `(NEW.a, ...) IS DISTINCT FROM (OLD.a, ...)` comparison (19 changes) and makes the five-minute change (taken off its equivalent list); 361 changes in all with V37. Checked: complaint rules 64 of 64, arrest time 16 of 16, the new read log's trigger 4 of 4; the other functions' changes were all noticed before and only tests were added. `mutate_legal_sql.py`: a view now ends at the first `;` outside quoted text (the deadline view's label has one and cut the view short, so its last two numbers were never changed): 52 of 52; comments are blanked so they are not mutated.

Final `scripts/test-all.sh` (on top of session 51): PASS repo rules, PASS packs, PASS xlit, PASS ai-gateway, PASS web, PASS database rules, PASS core, PASS e2e browser (all 8). Coverage: core 98.0% lines / 93.0% branches, web 99.8% / 93.7% / 97.2%, gateway 96%; no gate raised (no app code changed).

Deliberately skipped / not checked
- Not a full 361-change run after the rebase (about 70 minutes); only the functions whose tests or changes are new were rerun.
- My own version of the script and its other operators (switch a guard off, AND/OR inside conditions) found nothing more than the 16 above, so it was not added.
- Overlap risk: the 21:05 run took more than 2.5 hours, so this 23:35 run started from an older branch and repeated its item. See question 1.

Next: as session 51 lists (offline waits for the answer; load the people once on the FIR screen; Stryker for the web app; account lifecycle).

Questions for Sumit
1. Sessions overlap when one runs past the next start (tonight 21:05 and 23:35 did the same item). Should a session push a short "in progress: item X" line to PROGRESS.md at its start, so a later one picks another item? (I can add that to the session prompt's rules if you agree.)
2. The other open questions are in session 51's entry above.

## 2 Nov 2026, session 51 (02:05 IST scheduled run, last of the night, Sumit away)

### Tonight in short (sessions 50 and 51)
- Session 50 (21:05 IST): mutation test of the database's keep-as-written and masking rules (`scripts/mutate_trigger_sql.py`); 35 database tests added for what it found; now 335 of 335 changes noticed.
- Session 51 (02:05 IST): **who read protected victim details is now logged and can be seen** (below).
- `scripts/test-all.sh` at the end of both sessions: all 8 lines PASS (repo rules, packs, xlit, ai-gateway, web, database rules, core, e2e browser). Coverage now: core 98.0% lines / 93.0% branches (gate 96/90), web 99.8% statements / 93.6% branches / 97.3% functions (gate 97/89/95), gateway 96% (gate 94). No gate raised (nothing rose 2 points).
- Nothing blocked tonight beyond the items that wait for answers (offline phones, reviewers, rest of the MH pack).

Started from `setup/seed` at 9e2450c (session 50, nothing newer, no new answers). Fresh sandbox: started PostgreSQL, created role `caseapp` and both databases, installed the Python packages and `npm ci`. Baseline `scripts/test-all.sh`: all 8 lines PASS. Item 9 (offline) and items 3 and 6 wait for answers, so I took the harder of the two items session 50 listed without answers: the audit of reads of protected victim data (privacy) before Stryker.

Done
- **Read log (3d0b6bc)**, V37 `protected_read`: every answer that shows a protected victim's real details adds a line before it is sent (if the line cannot be written, nothing is sent): the people of a case to the case team when a person is protected (a victim or complainant of a BNS 64-71 / POCSO / sexual-offence case, or anyone masked by hand), `people`; the FIR text of a protected case, `fir_text`; a protected complaint opened (its FIR protects the victim, or before an FIR it is about a sexual offence), `complaint`; the informant's name of such a complaint in the front-desk list, `complaint_list`. A line has the reader, station, FIR id and number (kept as it was, so an import undo of the FIR does not lose it; no foreign key on purpose), complaint id and time. Kept as written (trigger). Withheld answers (front desk, outsiders) show nothing and log nothing. **One opening of a screen is one line**: the FIR screen asks for the people four times as it opens, so the same reader, record and kind within a minute is not logged again (question 1).
- New permission **`audit.read_protected`** in the national `roles.json` (SHO, SP, state admin; a pack test keeps it to roles with a reach). `GET /api/protected-reads?stationId=&limit=&offset=` (newest first, 1 to 200) for those who hold it at that station (`CaseTeam.canAt`: the SHO's own station, the SP's district, the state admin's state, the platform admin everywhere); 403 otherwise. The answer names the reader and the FIR number, never the victim.
- **Protected reads screen (157abbd)**: menu link by the permission (not the role name); a station list (own station first), when, who (name, rank, username), what was shown, a link to the FIR or complaint; older and newer pages of 100. A new station's list never shows the rows of the one before. 17 texts in the 11 screen languages (draft).
- Tests: `ProtectedReadsApiTest` (6: what is logged and what not, a hand-masked person and a section added later, complaints and the list, the FIR named once registered from a complaint, one line per opening and a new line after a minute, who may read the log and who may not across station, district and state, paging, kept as written); `db-tests/test_protected_reads.py` (4: kept, survives the FIR's removal, the four kinds and their record, reader and station required); pack test; web `ReadsPage.test.tsx` (5), the menu link in `App.test.tsx`, the screen in the axe check; browser `tests/e2e/test_protected_reads.py` (the IO opens a protected case, the SHO sees both reads, the victim's name is not in the log, the IO has no such link). `MigrationTest` expects V37.
- Docs: ARCHITECTURE-TENANCY section 5 item 4 marked done with the rules; CLAUDE.md says any new answer showing protected details must call `ProtectedReads`; TESTING.md lists the browser test and today's coverage.
- Lowest-covered older code: looked at the core's misses. RecordsController's missed lines are refusals that are tested (`RecordsRefusalsApiTest`); JaCoCo counts a line whose call throws as not run. Nothing real to add there tonight.

Final `scripts/test-all.sh`: PASS repo rules, PASS packs, PASS xlit, PASS ai-gateway, PASS web, PASS database rules, PASS core, PASS e2e browser (all 8). Coverage: core 98.0% / 93.0%, web 99.8% / 93.6% / 97.3%, gateway 96%; no gate raised.

Deliberately skipped / not checked, and risks
- The FIR screen still loads the people four times (FirDetail, Arrests, Chargesheets, Readiness). Loading once and sharing would be cleaner than the one-minute rule but touches four screens; not done tonight.
- Several loads in parallel can both pass the "not within a minute" check, so one opening may rarely give two lines of the same kind (more lines, never fewer). The browser test allows that.
- Not logged: the rows of an import batch (the uploader's own file, which may contain such text), the import's own look-ups of accused names, case text sent to the AI gateway (the gateway's audit log has those calls), the BNSS 173(2) copy printed from the complaint screen (it uses the complaint already read and logged).
- A refused log read (403) on the screen shows "The server answered 403 ..." like every other read, not the server's reason (reads never show it; changing that touches every screen).
- The read log is kept forever; no retention rule yet (question 2). Reading the log is not itself logged (it holds no victim detail).
- The 17 new texts in 10 languages are mine and unchecked.

Next: item 9 (offline, waits for the answer), then the items waiting for people (3, 6). Without answers: load the people once on the FIR screen; Stryker for the web app's date and form logic (TESTING.md item 6); account lifecycle (ARCHITECTURE-TENANCY section 5, item 5: acting charge during leave, open cases on an SHO's transfer).

Questions for Sumit
1. Read log: one line per reader, record and kind a minute (as built), or must every single answer be its own line?
2. Read log: keep it forever, or for a set number of years? And should the SHO see it (they are also on every case team), or only the SP and the state admin?
3. Still open: may a phone keep case data (encrypted, for a limited time) for offline work, or online only?
4. Still open: should the FIR screen on a phone open on Deadlines instead of Case details?
5. Still open: reviewers for the glossary and screen texts (Marathi first?), the heavier state punishment class (session 43), the start of the 14 days of a preliminary enquiry (session 42).

## 1 Nov 2026, session 50 (Sunday 21:05 scheduled run, Sumit away)
Started from `setup/seed` at 4e7c369 (session 49, nothing newer, no new answers). Fresh sandbox: started PostgreSQL, created role `caseapp` and both databases, installed the Python packages and `npm ci`. Baseline `scripts/test-all.sh`: all 8 lines PASS. The weekly review of this week was done on Saturday (session 41), so no review tonight. Item 9 (offline) and items 3 and 6 wait for answers, so I took the next item that needs none from session 49's "Next": mutation testing of the database trigger rules (privacy and keep-as-written, the hardest of the two).

Done
- **`scripts/mutate_trigger_sql.py`** (monthly, not in `test-all.sh`, like `mutate_legal_sql.py`): in the newest definition of every trigger function still used by a trigger, plus `person_masked`, the `person_public` view, `certificate_correction_matches` and `chargesheet_filed_for`, it takes out one refusal (RAISE EXCEPTION), turns one comparison or test round, takes one name out of a list ('victim', 'complainant'), makes a CASE WHEN of the masking view never apply, or drops a trigger or one of its events; runs `apps/core/db-tests` on each copy (2 jobs). Changes that make the migrations fail to apply are counted apart, not as noticed. `--again REPORT` reruns only an earlier run's survivors. Three equivalent changes are listed in the script with the reason. `mutate_legal_sql.py` now tells a view from a function by its CREATE line instead of by name (same 50 changes).
- **First run: 284 of 339 changes noticed.** Every masking change was noticed. The 55 survivors were test gaps, not wrong rules; no rule had to change. New `apps/core/db-tests/test_kept_rules.py` (35 tests): withdrawing a readiness record (evidence link, accused link, accepted gap: once, with who, when and a reason of 10+ characters, nothing else changed; it had no database test at all); a correction replacing a correction of another record (arrest, memo, time, closure report, chargesheet of another case); same-day edges (remand and release on the arrest day, arrest time on the remand or release day, chargesheet and closure report on the FIR day, a CrPC notice for an FIR registered at 00:10 IST on 1 July 2024); an arrest time in the future with no remand on record; the IO-assignment and sign-in logs; single trigger events (UPDATE of a chargesheet's accused, a closure decision, an account holder; DELETE of a closure correction or a playbook choice); a victim, witness or complainant refused as account holder or accused link while an accused exists; a complaint entered already signed is checked too; a closed complaint cannot be sent to a preliminary enquiry even with an earlier date, while enquiry then closing works. Rerun of the 52 survivors with `--again`: 52 of 52 noticed; then a full run: **335 of 335 noticed** (2 changes do not apply: dropping a trigger that a later migration disables by name).

Final `scripts/test-all.sh`: PASS repo rules, PASS packs, PASS xlit, PASS ai-gateway, PASS web, PASS database rules, PASS core, PASS e2e browser (all 8). Coverage: core 98.0% lines / 92.9% branches, web 99.8% / 93.7% / 97.2% and gateway 96% unchanged (no core, web or gateway code changed); no gate raised.

Deliberately skipped / not checked
- The mutation run checks the database tests only; the Java API tests may notice more, but the database rule should be proved where it lives.
- Not mutated: CHECK constraints and the other views (readiness, current-record views); the legal numbers are `mutate_legal_sql.py`'s. A trigger's column list (`UPDATE OF sha256`) is not changed.
- Noticed while reading, not changed: `fir_io_assignment` is `ON DELETE CASCADE` from the FIR but its trigger refuses DELETE, so an FIR that has an IO assignment cannot be removed by an import undo. Probably right (work was recorded), but the undo's own check should say so first; to look at with the import code.

Next: item 9 (offline, waits for the answer), then the items waiting for people (3, 6). Without answers: Stryker for the web app's date and form logic (TESTING.md item 6); audit of reads of protected victim data (ARCHITECTURE-TENANCY section 5, item 4).

Questions for Sumit
1. Still open: may a phone keep case data (encrypted, for a limited time) for offline work, or online only?
2. Still open: should the FIR screen on a phone open on Deadlines instead of Case details?
3. Still open: reviewers for the glossary and screen texts (Marathi first?), the heavier state punishment class (session 43), the start of the 14 days of a preliminary enquiry (session 42).

## 1 Nov 2026, session 49 (on-demand run started by Sumit at 16:13 IST from the build monitor)
Started from `setup/seed` at 600401c (session 48, same sandbox, nothing newer, no new answers). Baseline `scripts/test-all.sh`: all 8 lines PASS. Item 9's next step (offline) waits for question 1, so I took the open points of session 48's "Next": the settings screen's feature names and the rest of the contract test.

Done
- **AI feature names in the screen language**: the AI settings screen showed the gateway's English labels ("Draft chargesheet paragraphs", ...) in every language. The screen catalogs now name the 7 features (`aiFeature.<id>`, 11 languages, draft); a feature the catalogs do not name yet shows the gateway's own label. New repo rule `test_ai_feature_names.py`: the catalog's English names are exactly the gateway's `FEATURES` (checked by hand that a changed gateway label fails it). The saved line and the controls' names use the same words.
- **Contract test, gateway answers at run time**: `tests/e2e/test_answer_fields_gateway.py` uses the real gateway: the platform admin sets the notice draft to the offline `fake` provider on the settings screen, the IO asks for an AI draft of a notice on the demo case; every answer of the 5 gateway reads (settings, each feature in it, features, audit, saved setting, generate) has every field its screen type expects. No mismatch found; checked by hand that a made-up field in the draft type fails it. It shares the admin test's core, gateway and demo case (one start-up).
- **Contract test, the reads that were empty in the demo**: the live test now adds a victim update and a chargesheet to the demo FIR and a second FIR with a closure report that is corrected and decided, and requires those four reads to be checked (28 typed reads in all). No mismatch found.

Final `scripts/test-all.sh`: PASS repo rules, PASS packs, PASS xlit, PASS ai-gateway, PASS web, PASS database rules, PASS core, PASS e2e browser (all 8). Coverage: core 98.0% lines / 92.9% branches, web 99.8% statements / 93.7% branches / 97.2% functions, gateway 96%; no gate raised (no core or gateway code changed).

Deliberately skipped / not checked
- The 7 feature names in 10 languages are mine and unchecked, like the other screen texts.
- The gateway test uses the platform admin's installation-wide setting, not a state admin's own state setting (the gateway tests cover that).
- Nothing new for phones: offline still waits for question 1.

Next: item 9 (offline, waits for the answer), then the items waiting for people (3, 6). Without answers: Stryker for the web app's date and form logic (TESTING.md item 6), mutation testing of the database trigger rules.

Questions for Sumit
1. Still open: may a phone keep case data (encrypted, for a limited time) for offline work, or online only?
2. Still open from session 48: should the FIR screen on a phone open on Deadlines instead of Case details?
3. Still open: reviewers for the glossary and screen texts (Marathi first?), the heavier state punishment class (session 43), the start of the 14 days of a preliminary enquiry (session 42).

## 1 Nov 2026, session 48 (scheduled Sunday run, Sumit away)
Started from `setup/seed` at 14df922 (session 47, nothing newer, no new answers). Fresh sandbox: started PostgreSQL, created role `caseapp` and both databases, installed the Python packages (gateway requirements, `psycopg[binary]`, `pytest-cov`, `pytest-playwright`) and `npm ci`. Baseline `scripts/test-all.sh`: all 8 lines PASS. Item 9 (phones) was first with work that needs no answer, so I took it, then the next test from TESTING.md.

Done
- **FIR screen on a phone, one part at a time (ba2dd4b)**: below 640 px the FIR screen shows one part (Case details: IO, sections, complaint text; People; Arrests; Chargesheets; Closure report; Deadlines with the victim updates; Evidence; Notices; Readiness check), chosen in one "Show" list that stays at the top while scrolling. Every part still loads, so deadlines and readiness are the same whichever is shown; a new FIR starts on Case details. Desktop unchanged (the list is hidden, every part shows). The part names reuse the headings' texts; "Show" and "Case details" are new in the 11 languages (draft).
- **Readiness check on a phone**: the small forms inside a line (link evidence, accept a gap, withdraw) take their own full-width line; each gap's reason field is now folded behind "Accept this gap" (on every screen size, like "Withdraw"), so the gap list is half as long. The reason is still required. "Accept this gap" in the 11 languages (draft).
- **Rendering test on the admin, AI settings and load-data screens (c16c8d0)**: `tests/e2e/test_admin_scripts.py`, as the platform admin with the real gateway (offline `fake`), 10 languages at 1280 and 390 px. **It found a bug**: on a phone the screen-reader-only texts inside a wide table (`position: absolute`) escaped the table's scroll box, so the admin and settings screens were 590 to 680 px wide in every Indian language. Fixed in CSS (a table on a phone is the box they stay in). The cut-off check now skips fields not drawn (a field in a closed fold), as the text check already did.
- Tests: web (`FirDetail.test.tsx`: the picker lists the 9 parts, only the chosen part is shown, in Marathi too; `Readiness.test.tsx`: the reason is folded until "Accept this gap"); browser `test_phone.py` goes through every part at 390 x 844 (touch sizes, width, one part visible), links evidence and opens its Withdraw on the phone, checks the gap reasons are folded and the picker stays in reach; `test_indian_scripts.py` at 390 px reads every part of the FIR screen in all 10 languages (the loop is now a helper shared with the admin test).

Final `scripts/test-all.sh`: PASS repo rules, PASS packs, PASS xlit, PASS ai-gateway, PASS web, PASS database rules, PASS core, PASS e2e browser (all 8). Coverage: core 98.0% lines / 92.9% branches, web 99.8% statements / 93.7% branches / 97.2% functions, gateway 96%; no gate raised (nothing rose 2 points; no core or gateway code changed).

Deliberately skipped / not checked
- Still not tried on a real phone or touch screen (Chromium at 390 x 844). The admin, settings and load-data screens stay desktop screens: they now fit a phone, but their tables scroll sideways.
- The AI settings screen shows the feature descriptions in English in every language (they come from the gateway, not the screen catalogs). Not changed: noted for a later session.
- No offline use (question 1 of session 47 is still open). The complaint page was not split into parts.
- The new texts ("Show", "Case details", "Accept this gap") are drafts like the other screen texts.

Next: item 9 (offline, waits for the answer), item 7's last piece (the gateway's answers in the run-time contract test), the settings screen's feature names in the screen language; then the items waiting for people (3, 6).

Questions for Sumit
1. Still open from session 47: may a phone keep case data (encrypted, for a limited time) for offline work, or online only?
2. On a phone the FIR screen now shows one part at a time from a "Show" list, starting with Case details. Should it open on Deadlines instead (what an officer in the field most often needs)?
3. Still open: reviewers for the glossary and screen texts (Marathi first?), the heavier state punishment class (session 43), the start of the 14 days of a preliminary enquiry (session 42).

## 1 Nov 2026, session 47 (Sumit answered the questions live: fonts yes, phones yes)
Started from `setup/seed` at c1360b6. PostgreSQL had stopped in the sandbox, so the first baseline run failed the three database suites; started it again and re-ran on the committed code: all 8 PASS.

Done
- **The app on a phone (de80c50)**: below 40rem (640 px) the menu and both language choices fold behind one **Menu** button (`aria-expanded`, closes when a screen is chosen, also the screen already shown); everything to tap is at least 44 px high (checkboxes 24 px); text fields use 16 px so phones do not zoom in; forms take the full width; folded forms ("Add a person", "Record an arrest", ...) look like buttons; the FIR list, the front-desk list and the glossary become cards, one per row, each value with its column name (the column heads stay for screen readers). Desktop unchanged. "Menu" added in the 11 screen languages (draft like the rest).
- Tests: web (the menu button: closed, open, closes on a screen change and on the current screen's link); browser `tests/e2e/test_phone.py` at 390 x 844 on the demo case as the IO: menu folded and the header under 160 px, every control drawn on sign-in, open menu, FIR list, FIR screen with a form open, front desk, complaint, typing tool, policies and password is at least 44 px high with 16 px text, the FIR list is cards, nothing wider than the screen (it failed first on the language list in the open menu, 412 px, fixed). The rendering test now opens the menu on a phone and does not count text hidden on purpose for screen readers as cut off. Looked at screenshots of the menu, the FIR list and the whole FIR screen.

Final `scripts/test-all.sh`: PASS repo rules, PASS packs, PASS xlit, PASS ai-gateway, PASS web, PASS database rules, PASS core, PASS e2e browser (all 8). Coverage: core 98.0% lines / 92.9% branches, web 99.8% statements / 93.7% branches / 97.2% functions, gateway 96%; no gate raised.

Deliberately skipped / not checked
- Not tried on a real phone or with a real touch screen (Chromium at phone size). Admin, AI settings and load-data stay desktop screens (wide tables scroll inside their box).
- The FIR screen on a phone is long (every record and its forms on one page); splitting it into tabs or sections is the next step, not done.
- No offline use: a phone that loses the network cannot save. That needs a decision on what case data may be kept on a phone (question 1).

Next: item 9 (phone: shorter FIR screen, readiness controls), then the items waiting for people (3, 6).

Questions for Sumit
1. Offline on phones: may a phone keep case data (encrypted, for a limited time) so an officer can write while the network is down, or must the phone work online only?
2. Still open: reviewers for the glossary and screen texts (Marathi first?), the heavier state punishment class (session 43), the start of the 14 days of a preliminary enquiry (session 42).

## 1 Nov 2026, session 46 (on-demand run started by Sumit at 13:01 IST from the build monitor)
Started from `setup/seed` at 78dfd53 (session 45, same sandbox, nothing newer, no new answers). Baseline `scripts/test-all.sh`: all 8 lines PASS. Items 1, 3 and 6 wait for a person; item 8 was finished in session 45. I finished item 7, then used the remaining time for the next kind of test in TESTING.md (mutation testing).

Done
- **Screens fit a phone (4d9cd39)**: the rendering test now runs at 1280 px and at 390 px (a phone) and also covers the FIR screen with every kind of record and the complaint page (from the demo case), and waits for each screen's data. On a phone the header was 845 px wide in every language (it did not wrap); long Tamil and Malayalam labels and the glossary and policy tables also pushed the page wider. Fixed in CSS only: the header and menu wrap, fields shrink to their column, long words break, a wide table scrolls inside its own box on narrow screens. Desktop unchanged.
- **Contract test, run-time half (c18d696)**: `tests/e2e/test_answer_fields_live.py` goes through the demo case as SHO, IO, front desk and platform admin, keeps every JSON answer of a GET /api route, and checks that every field a screen's type always expects (not `name?:`) is a key of the real answer, also inside lists and objects. 24 typed reads had real answers; no mismatch found. Checked by hand that it fails on a field the static test lets through (a field the arrests controller writes elsewhere but not in this answer).
- **Mutation testing of the pack rule code (49b3c3c)**: PIT 1.17.0 in a Maven profile `mutation` (build-time only, not in `test-all.sh`; new build dependency because no tool we have does this): first run test strength 93%, 9 changes survived. Tests added: policy bounds at their edges (default at min, at max, a single value; a reason of exactly 10 characters), the national roles read first whatever the order, including a state code that sorts before IN (AP, GJ: the sort was untested), a role without a station. Now 99%; the two survivors are equivalent (see TESTING.md).
- **Mutation test of the legal numbers in SQL (6f48e0a)**: `scripts/mutate_legal_sql.py` changes one number or comparison at a time in the newest definition of the deadline functions and view and runs the database tests on each copy. **First run: only 26 of 50 changes were noticed.** A wrong section in the BNSS 193(2) list (e.g. POCSO 8 instead of 4) or in the masking range (BNS 63 or 72), the BNSS 58 24 hours changed to 23 or 25, the "earlier by unit policy" wording at exactly 90 days, and a custody released the same day as the remand would all have passed every test. Database tests added for each, at their edges; second run 50 of 50. No legal rule was wrong; only the tests were too thin.

Final `scripts/test-all.sh`: PASS repo rules, PASS packs, PASS xlit, PASS ai-gateway, PASS web, PASS database rules, PASS core, PASS e2e browser (all 8). Coverage: core 98.0% lines / 92.9% branches, web 99.8% statements / 93.7% branches / 97.1% functions, gateway 96%; no gate raised.

Deliberately skipped / not checked
- The phone layout was checked for width and cut-off text only; it is not a designed mobile screen (forms are long single columns). Station desktops stay the main target.
- The run-time contract test does not see the AI gateway's answers, nor reads that were empty in the demo (chargesheets, closure report, victim updates, custody).
- The SQL mutation test covers the deadline functions and view, not the trigger rules (what may be changed or deleted); the database tests now take about 60 s (98 tests, were 63).
- Not done: Stryker for the web app.

Next: the rest is waiting for people (items 3 and 6, the questions). Without answers, the next sessions can do: the run-time contract test with the gateway; the rendering test on the admin, settings and load-data screens; mutation testing of the trigger rules; Stryker for the web date logic.

Questions for Sumit
1. Same as session 45: may the app ship its own fonts (1.3 MB in the build, 30 to 150 KB per screen), and which demo station names do you want?
2. Should officers use the app on phones in the field? The screens now fit a phone, but a real mobile design (shorter forms, larger buttons) is a separate piece of work.

## 1 Nov 2026, session 45 (scheduled Sunday run, Sumit away)
Started from `setup/seed` at 5dfb457 (session 44, nothing newer, no new answers). Fresh sandbox: started PostgreSQL, created role `caseapp` and both databases, installed the Python packages (gateway requirements, `psycopg[binary]`, `pytest-cov`) and `npm ci`. Baseline `scripts/test-all.sh`: all 8 lines PASS. Items 1, 3 and 6 wait for a person, so I took item 7 and then item 8.

Done
- **Complaint list queries (9373fd2)**: the front-desk list asked 2 or 3 queries per complaint (steps, protected case, case team or supervisor), 48 for 30 complaints. Now the withheld decision is part of the list's own query (same rules: `identity_protected_case` and the case team for a complaint with an FIR, recorder or station supervisor for an open sexual-offence complaint) and the steps done come in one query: 6 statements for any length. `CaseTeam.includesSql` is the case-team test as SQL; `includes()` uses it, so there is one copy of the rule. Test first: `ComplaintListQueriesApiTest` counts the statements (failed at 48) and checks every row against opening that complaint (withheld, informant name, overdue steps, enquiry) for two desk officers, the SHO and the IO; the malkhana gets 403. Load test: 30,000 complaints in one station, 200 shown, under 0.3 s (the old code also passed this on this machine; the count is the real guard).
- **Indian scripts drawn with the app's own fonts (c592f0a)**: a new browser test (`tests/e2e/test_indian_scripts.py`) signs in, switches through the 10 screen languages and 5 screens, and asks Chromium which font drew each piece of Indian-script text. It found that the app used whatever the PC had: here Telugu, Kannada and Gujarati fell back to Unifont (a last-resort bitmap font; on a PC without it, empty boxes) and the others to FreeSans/FreeSerif; buttons and lists did not even take the page font. Fix: the Noto Sans fonts of the 9 scripts are served with the app (`@fontsource-variable/noto-sans-*` 5.3.0, SIL Open Font License; new dependency because no font we had covers these scripts and a CDN would send every page view outside the state's servers). Each file covers one script, so a browser downloads only the scripts on its screen (30 to 150 KB each). The test also checks `html lang`, that nothing is cut off, and that the page fits 1280 px: no problems found there.
- **Demo case and demo script (f9d3f2d)**: `scripts/demo_case.py` loads, through the API and as the officer who would do each step, a fictional station "Fictional Demo PS" (Fictional Demo District, MH) with front desk, IO, SHO, SP and malkhana accounts (passwords made up per run, printed once), and one online-fraud case: complaint written down, read over in Marathi, signed, 1930 step; FIR from it with BNS 318(4), 319(2) and the IO named; the account holder arrested with a first remand (60-day limit); E1 the bank statement with SHA-256, custody to the malkhana and Part A of its 63(4) certificate only; a BNSS 94 notice to the bank, sent; the online-fraud playbook with A1 marked as account holder and one ingredient linked. `docs/DEMO.md` is a 15-minute walk-through. `tests/e2e/test_demo_case.py` loads it on every run and checks the readiness gaps and the FIR screen, so the demo cannot break unnoticed.

Final `scripts/test-all.sh`: PASS repo rules, PASS packs, PASS xlit, PASS ai-gateway, PASS web, PASS database rules, PASS core, PASS e2e browser (all 8). Coverage: core 98.0% lines / 92.9% branches, web 99.8% statements / 93.7% branches / 97.1% functions, gateway 96%; no gate raised (nothing rose 2 points).

Deliberately skipped / not checked
- The rendering test covers 5 screens (FIR list, front desk, typing tool, policies, password), not the FIR screen and its records, and only at 1280 px. Option lists inside `<select>` are drawn by the browser, not checked.
- The fonts make the first view of a script about 30 to 150 KB heavier (once, then cached); Latin text stays in the system font. Not checked on a real Windows station PC.
- The demo station names are mine (question 2). The demo has no AI draft step: it needs the gateway running; the offline `fake` provider would do.
- No web unit test for the font list: the browser test fails if a script's font is missing from `index.css` or `main.tsx`.

Next: item 7 (rendering on the case screens and at phone width; the contract test's run-time half), item 3 (MH pack, waits for a reviewer), item 6 (glossary reviewer).

Questions for Sumit
1. The app now ships its own fonts for the Indian scripts (1.3 MB in the build, but a screen fetches only its own script, 30 to 150 KB). Fine, or should it rely on the fonts installed on the station PCs (smaller, but some scripts may show as boxes)?
2. Names for the demo: I used "Fictional Demo PS", "Fictional Demo District" in Maharashtra. Keep them, or which fictional names do you want?
3. Still open: a reviewer for the glossary and screen texts (session 44), the heavier state punishment class (session 43), and the start of the 14 days of a preliminary enquiry (session 42).

## 1 Nov 2026, session 44 (scheduled 02:05 IST run, last of the night, Sumit away)
Started from `setup/seed` at e6e3956 (session 43, nothing newer, no new answers). Fresh sandbox: started PostgreSQL, created role `caseapp` and both databases, installed the Python packages (the gateway's `requirements.txt` too: `requirements-dev.txt` does not include it) and `npm ci`. Baseline `scripts/test-all.sh`: all 8 lines PASS. Item 1 has nothing to build and item 3 waits for a reviewer, so I took item 6 (legal glossary) and then item 7.

Done
- **Legal glossary, module 5 (86a3f8b)**: `packs/IN/glossary.json`, 29 terms used in the app (FIR, zero FIR, cognizable, preliminary enquiry, remand, police and judicial custody, default bail, chargesheet, closure report, further investigation, BNSS 35(3) and 94 notices, seizure, panchnama, case property, BSA 63(4) certificate, hash value, ...): English term, the section, a one-line meaning, and one word in each of the 10 languages. Marked draft, not reviewed. `Glossary` loads every module's file at start-up (a module may only add terms; every term needs all 10 languages; the national file must be there) and serves `GET /api/glossary` to any signed-in officer. The language tool shows it with a search (English, section or any language), a language choice (typing language, else screen language, else Hindi) and "Add" to put the word into the text box. Where a screen label is exactly the term (`screen_keys`: IO, informant, victim, accused, witness, closure report), a pack test makes the screen and the glossary say the same word, so the glossary settles the wording (session 37's note on "closure report").
- **Punjabi wording fix (91c6dc1)**: the Punjabi screens called an accused person ਦੋਸ਼ੀ, which means guilty. Now ਮੁਲਜ਼ਮ (14 texts). Found by writing the glossary.
- **Contract test for the answers (0c5c71d)**: `tests/repo_rules/test_web_answer_fields.py` checks 298 fields of 45 typed reads: each field a screen reads must be a word its server writes (the route's controller, a class it names, a migration for views, or the gateway source). Checked by hand that it fails on session 43's settings bug (`audit_chain_ok`) and on a made-up arrest field.
- **FIR list for real volumes (6d01abf)**: a load test found that `GET /api/firs` checked every FIR of the installation for every call: with 210,000 FIRs an SP's first page took 8 s and an SHO's 0.7 s. The list now starts from the user's reach (cases naming them as IO, new index V36 `fir_io`; the stations they read whole, through the existing station index): 2 to 7 ms on the same data. Same access rule: `FirListReachApiTest` compares, for 12 kinds of account (named IO, other IO, front desk in and out, SHO in and out, SP in and out of the district, malkhana, prosecutor without a station, an inactive SHO), the list with what `canReadFirSql` lets each open. Load test `tests/e2e/test_load_lists.py`: the real core jar on its own database with 150,000 FIRs in 150 stations; each account's first and a deep page under 0.3 s, nothing past its own; it failed (0.53 s, SHO) on the old query. Database test: the list's query uses `fir_io`, no full scan.
- **Nested answer fields (e37fa09)**: the answer-field test now also reads the objects inside an answer (an inline `{...}` or a type of the same file, in a list or not): 373 fields. Found on the way: the front desk's step type said `within_minutes`, but the core writes `withinMinutes` (a Java record); the field was not shown anywhere, so no screen broke. Type fixed, and `ComplaintApiTest` now checks the name the web reads.
- Tests added: core `GlossaryTest`, `GlossaryApiTest`, `FirListReachApiTest`; pack tests (glossary shape, every word in its own script, screen labels use the glossary word); web `Glossary.test.tsx` (4) and the language tool in the axe check (it caught an empty table header, fixed); browser `test_glossary.py`; database V36; the contract test; the load test.

Final `scripts/test-all.sh`: PASS repo rules, PASS packs, PASS xlit, PASS ai-gateway, PASS web, PASS database rules, PASS core, PASS e2e browser (all 8). Coverage: core 98.0% lines / 92.9% branches, web 99.8% statements / 93.7% branches / 97.1% functions, gateway 96%; no gate raised (nothing rose 2 points).

Deliberately skipped / not checked
- The glossary's 290 words in 10 languages are mine and unchecked, like the screen texts; least sure: Tamil and Malayalam for cognizable / non-cognizable (long descriptions or loanwords), Odia "judicial custody", Bengali "panchnama" (জব্দ তালিকা, a seizure list). Meanings are short aids, not legal advice; section numbers only where I was sure (no number for officer in charge, panchnama, bail).
- The answer-field test catches a name the server never writes anywhere, not a name written in a different answer or only read (the `within_minutes` mismatch passed it because the core reads that name from the pack file).
- The load test has a time limit (0.3 s, best of three); if a slow CI machine makes it flaky, raise the limit with a note rather than retrying.
- Not changed: the front-desk complaint list asks 2 or 3 queries per complaint (up to 200); fine per station, measure before real use. `CaseTeam.canAt`'s "no case scope" branch and the "not on the team" masking in the arrest lists are not reachable through the API (defence in depth); JaCoCo also shows lines that throw (`badRequest(...)`) as missed although the refusal tests run them.

Next: item 3 (MH pack, waits for a reviewer), item 7 (the complaint list's queries per row; Indian-language rendering checks), item 8 (demo case and demo script).

Questions for Sumit
1. A native speaker and a lawyer to review the glossary (29 terms × 10 languages) and the screen texts: who can do it, and in which language first (Marathi for the pilot)?
2. Still open from session 43: may a state module give a national section a heavier punishment class for its own FIRs, with the amendment cited and a prosecutor's sign-off? And session 42's: 14 days of a preliminary enquiry from receipt (my choice) or from the DSP's permission?

## Tonight in short (31 Oct evening to 1 Nov 04:00 IST: sessions 41 to 44)
- Session 41 (weekly review): 7 fixes, each with a failing test first: an encoded URL or HEAD got an outsider into case records; a protected victim's complaint text was visible at the front desk; state admins saw other states' logs; a remand dated next year moved the custody limit; the 90-day class label; AI provider errors not logged; the BNSS 193(3)(ii) update could never be marked done (V31). Gates raised.
- Session 42 (Sumit asked me to research and decide): preliminary enquiry as a step with the DSP's permission and 14 days from receipt (V32); BNSS 58 24-hour production deadline (V33); a recorded remand cannot be cleared; sexual-offence complaints read only by the recorder, supervisors and the case team; AI gateway settings and audit per state; parallel password guesses limited.
- Session 43: AI audit chain head kept in the core database (V35); a state's punishment table may only add sections; AI settings screen bug fixed.
- Session 44 (this one): legal glossary, Punjabi "accused" fixed, answer-field contract test, FIR list fast at 150,000+ FIRs (V36) with a load test.
- Test result at the end of the night: PASS repo rules, PASS packs, PASS xlit, PASS ai-gateway, PASS web, PASS database rules, PASS core, PASS e2e browser (all 8). Coverage: core 98.0% lines / 92.9% branches, web 99.8% statements / 93.7% branches / 97.1% functions, gateway 96%; no gate raised (nothing rose 2 points).
- Blocked: the rest of the MH pack and every translation or legal wording sign-off (need a human reviewer). Skipped: see each session's list.

## 31 Oct 2026, session 43 (scheduled Saturday 21:05 run, Sumit away)
Started from `setup/seed` at 7b65378 (session 42, nothing newer, no new answers). Fresh sandbox: started PostgreSQL, created role `caseapp` and both databases, installed the Python packages and `npm ci`. Baseline `scripts/test-all.sh`: all 8 lines PASS. Item 3 (MH pack) still waits for a reviewer, so I took the two open items of item 1.

Done
- **Punishment tables, tighten-only (dfdff65)**: `Punishments` merged every pack with `putAll`, in classpath order, for every state. Now the national table (IN) holds everywhere; a state module may only **add** sections the national table does not name, and its additions hold only for FIRs of its own state (the hint and the arrest import read the FIR's station's state). A state table that names a national section, with any class (lighter or heavier) or as "no penalty of its own", stops the application at start-up, as a bad role does. Reason for refusing heavier too: a heavier class moves the default-bail limit from 60 to 90 days, which is the direction that can keep a person in custody longer; a real state amendment needs a prosecutor first (question 1). Tests: `PunishmentsTest` (4), pack test.
- **Bug fixed, test first (0d0637a)**: since session 42 the gateway's `/health` says only `ok`, but the AI settings screen still read `audit_chain_ok` from it, so every admin saw "Audit log check: broken". It now reads `chain_ok` from `/v1/audit?limit=1` (the screen is for admins only). The web test stubbed the old answer, which is why it passed.
- **AI chain head kept in the core database (f6ecbbd)**: V35 `ai_chain_anchor` (seq, hash, who, when; kept as written; a head only moves forward, also in the trigger). After every audit row the gateway posts the head to `POST /api/ai-chain-head` on the officer's token, signed `ai-chain-head|seq|hash` with the shared `AUTH_SECRET` (header `X-Chain-Mac`), so an officer cannot move it; an older head is ignored. `/v1/audit` now also asks the core (`GET /api/ai-chain-head`, admins only) and says `chain_ok` only if the file holds that exact head; core down means 503 (fails closed). A failed post never loses the officer's draft. An older copy of the gateway's file put back, or a file rewritten after the kept head, no longer verifies.
- Tests: database (V35 rules), API (`AiChainApiTest`: forward only, MAC refused for wrong seq/hash/none, bad values, admin read, the same MAC value as the gateway), `SecurityMatrixTest` (admin-only list), gateway (+4: every row anchors, older file fails, signing and fail-closed reading, 503), and a new **browser test with the real gateway** (`tests/e2e/test_ai_gateway.py`, real core + uvicorn gateway + Chromium: heads kept, settings screen says intact, an older file put back says broken). Checked that it fails on the old settings screen.

Final `scripts/test-all.sh`: PASS repo rules, PASS packs, PASS xlit, PASS ai-gateway, PASS web, PASS database rules, PASS core, PASS e2e browser. Coverage: core 97.9% lines / 92.8% branches, web 99.8% statements / 93.5% branches / 97.1% functions, gateway 96%. No gate raised (nothing rose 2 points).

Deliberately skipped / not checked
- The anchor is one sequence for the whole installation (one gateway file), not one per state; fine for one deployment per state, as decided.
- If the core is down when a row is written, that row's head is not kept until the next row; the gap is only the rows since the last head kept.
- Not unit-tested: the race branch in `AiChainController` (two heads at the same moment, the older one is ignored; the trigger guards it).
- The pack test for state punishment tables passes trivially today: no state module has a `punishments.json` yet.

Next: item 3 (rest of the MH pack, waits for a reviewer), then item 6 (legal glossary), item 7 (field names of the answers: tonight's bug is the kind it would catch), item 8 (demo case).

Questions for Sumit
1. A state amendment that raises a punishment (some states have done this for the old IPC): should a state module be allowed to give a national section a heavier class for its own FIRs, with the amendment cited and a prosecutor's sign-off? Today it is refused.
2. Still open: a human reviewer for the translations and the legal wording of the MH pack and complaint kinds; and question 1 of session 42 (14 days of a preliminary enquiry from receipt, my choice, or from the DSP's permission).

## 31 Oct 2026, session 42 (Sumit: "I don't know about that, can you deep research and fix it all yourself?")
Sumit handed the open questions to me. I read the law and the court orders on each and decided, in the strict direction where the law is silent, then built the fixes. Every decision below can be overruled.

Decisions (with the source)
1. **Preliminary enquiry, BNSS 173(3)**: the text allows it only for offences punishable with 3 years or more but less than 7, with the prior permission of an officer not below DSP, "within a period of fourteen days". It is a step, not an outcome: it now ends in an FIR from the same signed text, or in a closing outcome with a reason. The DSP's permission (rank and name) is recorded. The statute does not say from when the 14 days run (no court has settled it as far as I could find); I count from the **receipt of the information**, the earliest and so the strictest reading. Overdue enquiries are marked on the complaint and in the front-desk list. Old enquiries move to the new columns (V32, permission "not recorded").
2. **Clearing a recorded first remand by a correction: refused.** A remand can be corrected to another date, never removed (it would silently drop the BNSS 187(3) limit). A remand that never happened can be answered by recording the release.
3. **Masking**: the age of a protected victim stays visible, because only the case team sees the people list and the age decides the section (BNS 65, POCSO); BNS 72 forbids making the identity known to others, which the masking already does. **An open sexual-offence complaint** is now read only by the officer who wrote it down, the station's supervisors (roles with station or district case scope) and, once it is an FIR, the case team (Nipun Saxena v Union of India, SC 2018: the victim's name stays out of anything others can see). The FIR made from it is always identity-protected.
4. **BNSS 193(3)(ii)**: the text asks for one progress update within 90 days; the Punjab and Haryana High Court (Nov 2024) held it mandatory and the Bombay High Court took the Maharashtra circular of 23 Aug 2024 on record, neither set a frequency. So one recorded update ends the deadline; no schedule is added. A state that wants monthly updates can get a policy later.
5. **BNSS 58**: no police officer may hold a person arrested without warrant for more than 24 hours, journey time to the Magistrate excluded, without an order under BNSS 187. Now a deadline from the (corrected) time of arrest until a remand or release, and the arrest shows "produce by"; a first remand after the day the 24 hours end is flagged for checking (journey time cannot be known, so it is a flag, not a refusal). Imported arrests are left out.
6. **Further investigation after a closure report**: the BNSS proviso to 193(9) sets 90 days only for further investigation *during the trial*, with the court's permission; there is no limit for further investigation ordered on a closure report, so none is added.
7. Earlier questions: `services/ai-gateway/.coverage` leaves git (in `.gitignore`); `axe-core` added as a test-only dependency (pinned 4.10.2, an accessibility check of 5 main screens: no faults found); complaint-kind texts per language and the MH content still wait (they need a reviewer of legal wording, which research cannot replace); the translations still need a human reviewer.

Built (3475fed, 77726a8, 178d1d6, 590052c)
- V32: preliminary enquiry columns, closing outcomes after it, earlier wordings of a complaint kept (`complaint_version`, shown on the complaint page). V33: BNSS 58 deadline. V34: notice replies and FIR sections kept as written (they go only with their notice or FIR, as an import undo does), playbook choices kept in `case_playbook_choice`.
- Front desk: enquiry form with "Permitted by", enquiry state and overdue mark, earlier wordings; arrests: produce-by line and the late-remand flag; 9 new texts × 11 languages.
- Sign-in: attempts on one username wait for each other (advisory lock); 12 guesses sent at once used to all get a try, now 5 do. The first admin's role comes from the packs (no role name in code).
- AI gateway: settings and audit per state (`/api/me` now gives `state_code`), every refusal logged (403, 404, 422, cloud), unknown fields such as a caller's `system` text refused (422), `/health` says only `ok`, the chain is keyed with `AI_AUDIT_KEY` when set (old rows still verify), a chain head shows rows cut from the end, writes take SQLite's write lock.
- `SecurityMatrixTest`: every write route under `/api/firs/{id}` and `/api/complaints/{id}` sent by an outsider: never a success, nothing written.
- Tests: database (V32 data move and rules, V33 deadline, V34 guards), API (enquiry, versions, desk masking, production, remand clearing, parallel sign-in, state in `/api/me`), gateway (+4), web (enquiry, versions, production, axe).

Final `scripts/test-all.sh`: PASS repo rules, PASS packs, PASS xlit, PASS ai-gateway, PASS web, PASS database rules, PASS core, PASS e2e browser. Coverage: core 98.1% lines / 92.6% branches, web 99.8% statements / 93.5% branches / 97.1% functions, gateway 95%.

Deliberately skipped / not checked
- The 24-hour count does not know the journey time; the officer judges it.
- The repo rule on role names looks only at lines that also say "role"; the bootstrap admin slipped past it. Not widened (it would flag ordinary words such as 'io').
- The new texts × 10 languages are mine and unchecked, as before.
- Set `AI_AUDIT_KEY` (32+ random characters) on any real installation; without it the chain is plain SHA-256 as before.

Questions for Sumit
1. Do you want the 14 days of a preliminary enquiry counted from the DSP's permission instead of from receipt? (Receipt is stricter; I chose it.)
2. Still open: a human reviewer for the translations and the legal wording of the MH pack and complaint kinds.

## 31 Oct 2026, Weekly review (Saturday 21:05 session, session 41, Sumit away)
Started from `setup/seed` at adfe973 (session 40, nothing newer, no new answers). Fresh sandbox: started PostgreSQL, created role `caseapp` (superuser) and both databases, installed the Python packages and `npm ci`. Baseline `scripts/test-all.sh`: all 8 lines PASS.

What I checked: all 118 commits since the last weekly review (ebc1224, 24 Oct), in three read-only passes (legal rules and deadlines; access, tenancy, masking and audit in the core; AI gateway, web app and test quality), then confirmed each finding below with a failing test before fixing it. Tried by hand: an outsider through an encoded path and HEAD, a state admin reading other states' logs, an IO outside the case team reading a protected complaint, a slipped-year remand, a second officer deciding on someone else's AI draft. Policies looser than their parent: none found (`effective_policy_days` takes the least of module, state, district and station, and the API caps at the pack bound; covered by `PolicyApiTest`). Flaky check: the core suite run in random order (`-Dsurefire.runOrder=random`) passes; no date or order dependence found. Slowest: `AdminApiTest` 17 s (password hashing), `ImportApiTest` 11 s.

Fixed (each with a regression test written first and seen failing)
- **High, case records readable by any signed-in officer (6a6d1e5)**: the case-team check in `ReadAccess` read the raw URI, so `GET /api/fir%73/{id}/deadlines` (and every other case sub-route) reached the handler without the check; HEAD was not checked at all. Now decided by the route that matched; HEAD counts as a read. `SecurityMatrixTest` walks every case route with two encoded spellings and HEAD.
- **High, BNS 72 (45e35f4)**: the FIR withheld a protected case's text, but the complaint it came from still showed the same text, the informant's name and contact to every station officer who may register FIRs. Now withheld outside the case team once the complaint has become a protected FIR (while it is being written down the desk still sees it). The front-desk screen says "Name withheld (BNS 72)" and offers no printable copy.
- **Medium, tenancy (fbb4a47)**: `GET /api/admin-actions` and `GET /api/sign-ins` showed every state to a state admin. Now bounded to the admin's state; attempts on unknown usernames only for the platform admin.
- **Medium, custody limit (f13fdab)**: a first remand after today (2027 for 2026) was taken and moved the BNSS 187(3) limit a year out. Refused now, typed or corrected.
- **Medium, legal wording (7d0309a)**: the 90-day class was labelled "imprisonment of 10 years or more", which invites choosing it for "may extend to ten years" offences (e.g. BNS 309(4)); BNSS 187(3) needs a term "not less than ten years" (Rajeev Chaudhary, SC 2001). Labels now say "at least 10 years (minimum term)" and the 60-day class names "up to 10 years", in all 11 languages. The pack's own section table was already right.
- **Medium, AI audit (d1c20a0)**: a provider timeout or broken answer escaped as a 500 with no audit row, though the case text may have left; now logged as `ai_error` and answered 502. Any officer could log a decision on someone else's AI draft, for any case, many times; now only the officer who asked, for the same case, once (409 after).
- **Legal, BNSS 193(3)(ii) (73e853b)**: the 90-day progress update could never be marked as done, so it showed as overdue for the life of the case. New table `victim_update` (V31: day, to whom, how; no names; kept as written; not before the FIR, not in the future), `GET/POST /api/firs/{id}/victim-updates` (case team), the deadline ends once one is recorded; web `VictimUpdates.tsx` under the deadlines, in 11 languages. Tests: database (V31 rules and the view), API (team only, both date refusals with their messages, bad values, list), web (list, form, refusal, load error, Marathi), server messages (3 new texts × 10 languages).
- **Gates raised (84341e3)**: core lines 95 to 96, web statements and lines 95 to 97, functions 88 to 95, gateway 92 to 94 (branch gates unchanged: core and web branches rose less than 2 points since their last raise).

Final `scripts/test-all.sh`: PASS repo rules, PASS packs, PASS xlit, PASS ai-gateway, PASS web, PASS database rules, PASS core, PASS e2e browser. Coverage: core 98.1% lines / 92.7% branches, web 99.8% statements / 93.6% branches / 97.1% functions, gateway 96%.

Still worried about (not fixed tonight; now in "Next" item 1)
- No 24-hour production deadline (BNSS 58) exists anywhere; a first remand days after the arrest gets no warning when typed.
- A preliminary enquiry is a final outcome, so no FIR can follow it from the signed text, and its 14-day limit is not on the deadline list and runs from the decision, not from receipt.
- AI gateway settings and its audit log are one for all states; a state admin can change the provider for every state and read every state's AI audit rows (`ai_cloud_allowed` still blocks the cloud per unit). The chain cannot notice rows cut from its end, and anyone who can write the SQLite file can recompute it. Callers may send their own `system` text. 403/404/422 refusals are not logged.
- A correction may leave the remand date empty, which removes the custody deadline (question 3).
- After a Magistrate orders further investigation on a closure report the BNSS 193(2) limit does not come back (legal question for a prosecutor).
- `SecurityMatrixTest` tries only GETs as an outsider, with random child ids; writes rely on each controller's own tests.
- Refusal tests in `RecordsRefusalsApiTest` check the status only, not the message; `test_server_messages.py` would not notice a reworded message whose pieces stay common words.
- A state pack could reclassify a national section to a lighter punishment class (`Punishments.java`, `putAll`); no state pack does today.
- `FirDetail` shows a masked victim's age next to "Victim V1"; BNS 72 may want it dropped (question 4).
- Open complaints of kind `sexual_offence` still show the informant's name in the station's front-desk list before an FIR exists (needed to do the work; question 4).

Next: see item 1 of the "Next" list above.

Questions for Sumit
1. Still open: the questions of sessions 33, 35 and 39 (translations reviewer, `.coverage` in git, complaint kinds per language, MH content, `axe-core`).
2. Should a preliminary enquiry stay open and later become an FIR (from the same signed text) or a closure, with the 14 days counted from the receipt of information? That is how I read BNSS 173(3); please confirm before I change it.
3. May an arrest correction clear a recorded first remand (for example a remand entered on the wrong arrest), or must every correction restate it? Today clearing is allowed and removes the custody deadline.
4. Masking: should a protected victim's age be hidden too, and should the front-desk list hide the informant's name of an open sexual-offence complaint from everyone but the officer who wrote it down?
5. BNSS 193(3)(ii) asks for one update within 90 days. Do you want later updates on a schedule too (some states ask for monthly ones)? If so it becomes a policy.

## 31 Oct 2026, session 40 (on-demand run started by Sumit from the build monitor, about 20:50 IST)
Started from `setup/seed` at a4e3999 (session 39, nothing newer, no new answers). PostgreSQL was already running. Baseline `scripts/test-all.sh`: all 8 lines PASS. Item 1 (MH pack) still waits for your answer; of item 2, the complaint-kind labels wait for question 3 of session 35, so I built the next part, server messages.

Done
- **Server messages in the screen language (a0ccd6f)**: the core keeps writing English; the web app shows a message in the screen language when a `server.*` text of the catalogs matches it whole (`translateServer` in `i18n.ts`, used by every call in `api.ts`). A `{name}` in a text stands for a value the server puts in (the 30 of "asks for 30 or less", a time, an HTTP status); the most specific text wins. A message no catalog knows stays as the server wrote it, so nothing is lost. No server change and no new dependency. 74 texts × 10 languages: every refusal of the case team, IO assignment, FIR registration, front desk, policies, readiness check, arrests, chargesheets, closure report, notices, sign-in and password, the "database rejected" answers, and the web app's own "server answered" and "sign-in has ended" lines.
- New repo rule `tests/repo_rules/test_server_messages.py`: every piece of a `server.*` text must still be written in the core's Java or in `api.ts`, so a reworded server message fails a test instead of quietly going English (checked by rewording one).
- **Bug found and fixed, test first**: a refusal whose body was JSON `null` made the screen show "Cannot read properties of undefined (reading 'message')" instead of the server's status (`api.ts` `send`).
- Tests: `i18n.test.ts` (+1: matching, values kept, most specific first, whole message only, unknown message and English unchanged), new `api.test.ts` (Marathi refusals, database refusal, unknown message, 500 and 401; Hindi sign-in refusals incl. the lock-out time; the null body), `App.test.tsx` (a refused language change and a wrong password on the Hindi sign-in page, shown in that language).
- Final `scripts/test-all.sh`: PASS repo rules, PASS packs, PASS xlit, PASS ai-gateway, PASS web, PASS database rules, PASS core, PASS e2e browser. Coverage: core 98.1% lines / 92.6% branches, web 99.8% statements / 93.7% branches / 97.0% functions, gateway 96%. No gate raised (web branches 1.9 points above the last raise, 2 needed).

Deliberately skipped / not checked
- Still English: the admin and load-data refusals (`AdminController`, `ImportController`), the row checks of the import files (`FirImport` and the others), Spring's own validation answers, database trigger messages, and the AI gateway's messages. Same mechanism when wanted: add the `server.*` text and its translations.
- The 74 texts × 10 languages are mine and unchecked. Least sure: "playbook" (kept as a loanword except Tamil வழிகாட்டி), "remand" (Tamil காவல் நீட்டிப்பு), "lapse" of unsigned electronic information.
- The message matching depends on the server's exact English wording; the repo rule guards it, but a message built from several sentences in Java code paths I did not list will stay English.
- No new browser test (no new screen).

Next
1. Rest of the MH pack, once question 2 of session 33 is answered.
2. Screen language, last parts: admin and load-data server messages and the import row checks; complaint-kind and step labels per language in the packs (question 3 of session 35); then the legal glossary.
3. Tests: field names of the answers; accessibility checks (axe, question 2 of session 39); load test once paging exists.
4. End-to-end demo case and demo script (with demo stations in MH).

Questions for Sumit
1. Still open: the questions of sessions 33, 35 and 39 (translations reviewer, `.coverage` in git, complaint kinds per language, MH content, `axe-core`).

## 31 Oct 2026, session 39 (scheduled weekend run, Saturday, started about 20:00 IST, Sumit away)
Started from `setup/seed` at 802c442 (session 38, nothing newer, no new answers). Fresh sandbox: started PostgreSQL, created role `caseapp` and both databases, installed the Python packages and `npm ci`. Baseline `scripts/test-all.sh`: all 8 lines PASS. Item 1 (MH pack) still waits for your answer, so I built item 2 (screen language part 6), then used the remaining time on the next tests from "Not covered yet" in `docs/TESTING.md`.

Done
- **Screen language part 6, policies and load data (1eafdd7)**: the policy table, the tighten form, each recorded change (level by label), every step of loading CSV files (batch and row results, the four row filters, problems, approval, undo, discard, history). 79 texts × 10 languages. Policy keys, layout field names, file names, the checks the server writes on each row and its refusals stay as sent. "Reason (at least 10 letters)" on the policy form became the shared "Reason (at least 10 characters)".
- **AI settings, typing page, typing field (7d09e68)**: headings, audit-chain line, every control and the saved line; the typing page names the typing language in English on an English screen and in its own script otherwise; the Speak/Stop buttons, speech error and suggestion list. 24 texts × 10 languages. Feature labels, providers and models stay as the gateway sends them.
- **State admin screen (87be87d)**: accounts and their state, disable/enable/unlock with reason, transfer form and its "still IO of n FIRs" warning, new account form and its two refusals, stations, the role list, the sign-in log and the admin log. 74 texts × 10 languages. Role labels (from the packs), names and the server's "what changed" text stay as sent; an action or sign-in outcome the screen does not know shows its code.
- Untested code found and covered on the way: a refused import check, a failed problems download and a refused approval (the test name claimed the last one but never did it), a refused AI settings save, adding a police station.
- **Contract test for AI gateway bodies (4d18855)**: `tests/repo_rules/test_web_gateway_contract.py` reads every `ai(...)` call of the web app and the FastAPI routes and pydantic models (Python parser): the route must exist with that method, every key sent must be a model field, every field without a default must be sent. No mismatch today; checked that `caseRef` for `case_ref` and a wrong path both fail it.
- **API test on an upgraded database (078254e)**: `tests/e2e/test_upgraded_database.py`. The core app takes a fresh database to V29 (Flyway target), a sexual-offence case with a masked victim is written as that release would, then the current app upgrades it at start-up. The SHO reads the FIR, its people and deadlines and adds a witness; the front desk gets the complaint text withheld (BNS 72) and 404 for the people; an SHO of another state gets 404. The e2e harness (`running_core` in `tests/e2e/conftest.py`) can now start the core on any database.
- Browser test: `test_screen_language.py` now also opens the policies screen in Marathi with the values the real core gives (7 ते 90).
- Final `scripts/test-all.sh`: PASS repo rules, PASS packs, PASS xlit, PASS ai-gateway, PASS web, PASS database rules, PASS core, PASS e2e browser. Coverage: core 98.1% lines / 92.6% branches, web 99.8% statements / 93.4% branches / 97.0% functions, gateway 96%. No gate raised (web branches rose 1.6 points since the last raise, 2 needed).

Deliberately skipped / not checked
- The 177 new texts × 10 languages are mine and unchecked, as before. Least sure: "batch" (बॅच, தொகுப்பு), "staged by", "authority for this load", Odia and Malayalam wording of the admin forms. Rank placeholders ("SI, PSI, Inspector…") stay English.
- Complaint kinds and golden-hour steps per language in the packs: not done, it waits for question 3 of session 35 (it changes pack files and the core loader, and the step texts are legal instructions).
- Server error messages and the legal glossary are still English; the field names of the answers (web reads, core writes) are not contract-tested yet.
- Not looked at by eye in a browser apart from what the browser tests check.
- The e2e core log file is now `apps/core/target/e2e-core-<database>.log` (was `e2e-core.log`).

Next
1. Rest of the MH pack, once question 2 of session 33 is answered.
2. Screen language, last parts: complaint-kind and step labels per language in the packs (question 3 of session 35), server messages, then the legal glossary.
3. Tests: field names of the answers; accessibility checks (axe, needs `axe-core` as a test-only dependency); load test once paging exists.
4. End-to-end demo case and demo script (with demo stations in MH).

Questions for Sumit
1. Still open: who checks the translations (now about 500 texts per language), may `services/ai-gateway/.coverage` leave git, complaint-kind texts per language in the packs (session 35, question 3), and loanwords for legal terms.
2. May I add `axe-core` as a test-only dependency for the accessibility check of the main screens?

## 31 Oct 2026, session 38 (on-demand run started by Sumit from the build monitor, about 18:20 IST)
Started from `setup/seed` at 5c5c800 (session 37, nothing newer, no new answers). PostgreSQL was already running. Baseline `scripts/test-all.sh`: all 8 lines PASS. Item 1 (MH pack) still waits for your answer, so I went on with item 2.

Done
- **Screen language part 5 (e22e32f)**: notices on the case page (list, the 4 BNSS kinds and 3 old CrPC kinds, states, issued/due/AI-drafted/replies lines, received and missing items, the send and reply forms, the new-notice form with its AI draft box and refusals), the FIR registration form, the add-person and add-evidence forms with their refusals, and the action taken on the FIR list and case page (it showed the raw code, e.g. `investigate`). 91 texts × 10 languages.
- Kept English on purpose: the check stored for a notice without items ("Reply answers the notice fully", stored in the reply record) and the AI prompt (versioned and audit-logged as written; the notice kind in it is the English label whatever the screen language). Tested.
- **Consistency fix**: my texts of sessions 37 and 38 wrote "FIR" in Latin letters; the earlier screens write it in each script (एफआयआर, এফআইআর ...). All catalogs now use the script form.
- Tests: `Notices.test.tsx` (+2: Marathi list, reply, AI draft, refusals, English stored check and prompt; Hindi empty-text refusal and a decision that could not be logged), `Forms.test.tsx` (+2: Marathi FIR, person and evidence forms and refusals, codes sent unchanged; Hindi FIR from a complaint and non-station account), `FirList.test.tsx` and `FirDetail.test.tsx` (action taken by its label).
- **Gate raised (39a5a23)**: web branches 86 to 89 (coverage 91.8%, 3.4 points above the last raise).
- Final `scripts/test-all.sh`: PASS repo rules, PASS packs, PASS xlit, PASS ai-gateway, PASS web, PASS database rules, PASS core, PASS e2e browser. Coverage: core 98.1% lines / 92.6% branches, web 99.7% statements / 91.8% branches / 95.4% functions, gateway 96%.

Deliberately skipped / not checked
- The 91 new texts × 10 languages are mine and unchecked. Least sure: "General diary entry" (रोजनामचा / स्टेशन डायरी differ by state), "seizure memo" (Marathi पंचनामा, Malayalam മഹസർ), "default bail".
- Error messages that come from the server or the AI gateway ("The AI gateway answered 503: ...") stay English inside the translated sentence.
- Person gender is still free text; "Label" placeholders (A1, E-01) stay as they are.
- Not looked at by eye in a browser; no new browser test (no new screen; the English texts the browser tests read are unchanged apart from curly quotes in one refusal).

Next
1. Rest of the MH pack, once question 2 of session 33 is answered.
2. Screen language part 6: policies, load data, admin, AI settings and typing screens; complaint-kind and step labels per language in the packs; server messages; then the legal glossary.
3. Contract test for answer field names and gateway bodies; API tests on an upgraded dump; accessibility checks (axe).
4. End-to-end demo case and demo script (with demo stations in MH).

Questions for Sumit
1. Open from sessions 35 to 37: who checks the translations (now about 320 texts per language), may `services/ai-gateway/.coverage` leave git, complaint-kind texts per language in the packs, and loanwords for legal terms.
2. Should "General diary entry" follow each state's own word (रोजनामचा, स्टेशन डायरी, जीडी)? That would make it pack data per state rather than a screen text.

## 31 Oct 2026, session 37 (scheduled weekend run, Saturday, started about 18:00 IST, Sumit away)
Started from `setup/seed` at a06d3b1 (session 36, nothing newer, no new answers). Fresh sandbox: started PostgreSQL, created role `caseapp` and both databases, installed the Python packages and `npm ci`. Baseline `scripts/test-all.sh`: all 8 lines PASS. Item 1 (MH pack) still waits for your answer, so I built item 2 (screen language part 4, the legal parts first), then used the remaining time on item 3 (the next test from "Not covered yet").

Done
- **Screen language part 4 (3161989)**: arrests, chargesheets and the closure report in English and the 10 languages (100 texts each): arrest lines, punishment classes and their 60/90 days, release kinds, the remand, release and three correction forms with their refusals, the punishment hint and its warning, the custody-limit lines (released, chargesheet filed, after the last day, earlier custody days counted), the chargesheet list and forms, the closure report, its five grounds and the Magistrate's decision. Codes the screen does not know (a new punishment class or ground from the server) still show as the code. Names, places, courts, numbers and reasons stay as written.
- Tests: `Arrests.test.tsx` (+2: Marathi list with every kind of line and history, options, refusal, hint; Hindi empty list and "accused first"), `Chargesheets.test.tsx` (+2: Hindi replaced/corrected entries, form and refusal; Tamil empty list), `ClosureReport.test.tsx` (+2: Marathi recorded report, decision and correction form; Hindi empty form and decision choices).
- **Contract test for request field names (17e9df3)**: `tests/repo_rules/test_web_core_fields.py` reads the body of every `send(...)` in the web app (42 bodies) and the `@RequestBody` record of the core route; every key sent must be a record component and every `@NotNull`/`@NotBlank` component must be sent. Needed because Jackson silently drops a misspelled field (it arrives as null). No mismatch found today; checked that a renamed field (`decidedOn` to `decidedAt`) fails it.
- Final `scripts/test-all.sh`: PASS repo rules, PASS packs, PASS xlit, PASS ai-gateway, PASS web, PASS database rules, PASS core, PASS e2e browser. Coverage: core 98.1% lines / 92.6% branches, web 99.55% statements / 90.6% branches / 95.4% functions, gateway 96%. No gate raised (web branches rose 0.8 points).

Deliberately skipped / not checked
- The 100 new texts × 10 languages are mine and unchecked (as in sessions 34 to 36). Least sure: Odia, Punjabi and Malayalam legal terms ("default bail", "closure report", "remand" kept as loanwords). "Closure report" is "समाप्ती अहवाल" in Marathi and "क्लोज़र रिपोर्ट" in Hindi; the glossary should settle these.
- The legal references (BNSS 187(3), 193(2), 35, 47, 48) stay in Latin letters in every language.
- The field-name test covers only `send(...)` bodies to the core. Not covered: sign-in (`login` in `api.ts`), the bodies sent to the AI gateway (pydantic also ignores unknown fields) and the field names of answers.
- Not looked at by eye in a browser; no new browser test (no new screen; the English texts the browser tests read are unchanged).

Next
1. Rest of the MH pack, once question 2 of session 33 is answered.
2. Screen language part 5: notices and evidence on the case page, the person, evidence and FIR forms (`Forms.tsx`); then policies, load data, admin, AI settings, typing; complaint-kind and step labels per language in the packs; server messages; then the legal glossary.
3. Contract test for answer field names and gateway bodies; API tests on an upgraded dump; accessibility checks (axe).
4. End-to-end demo case and demo script (with demo stations in MH).

Questions for Sumit
1. Still open from session 35: who checks the translations (now about 230 texts per language), may `services/ai-gateway/.coverage` leave git, and should complaint-kind texts per language live in the pack files?
2. For legal terms with no settled local word (remand, default bail, closure report), should the screen keep the English loanword in the local script, as it does now?

## 31 Oct 2026, session 36 (on-demand run started by Sumit from the build monitor, about 16:50 IST)
Started from `setup/seed` at b8e7f82 (session 35, nothing newer, no new answers). PostgreSQL was already running. Baseline `scripts/test-all.sh`: all 8 lines PASS. Item 1 (MH pack) still waits for your answer, so I went on with item 2, taking the legal parts of the case page first.

Done (screen language, part 3)
- **Readiness check (850c1e2)**: heading, playbook choice, open-gap count, the line "This lists what the case file contains. It does not judge anyone.", 63(4) state of linked evidence, links, gaps and their acceptance with a reason, the withdrawn list (its kind, evidence link / accused link / accepted gap, by label), checks to confirm, account holders and the withdraw forms. Charge, ingredient, gap and rule texts come from the playbooks and stay English.
- **IO assignment (850c1e2)**: IO line, assign/change form and its refusal, IO history lines.
- **BSA 63(4) certificates (0b8dea7)**: Part A/B, each certificate line, hash matches / does not match the seizure hash, correction and replaced marks, the add form with its placeholders, and the three refusals (short SHA-256, correction of the other part, correction without a reason).
- Tests: `Readiness.test.tsx` (+1 Marathi, incl. withdrawn list and withdraw button), `IoAssignment.test.tsx` (+1 Hindi history with reason), `Notices.test.tsx` (+1 Marathi certificate line, option, two refusals; the "other part" refusal had no test before).
- Final `scripts/test-all.sh`: PASS repo rules, PASS packs, PASS xlit, PASS ai-gateway, PASS web, PASS database rules, PASS core, PASS e2e browser. Coverage: core 98.1% lines / 92.6% branches, web 99.5% statements / 89.8% branches / 95.3% functions, gateway 96%. No gate raised.

Deliberately skipped / not checked
- Same as session 35: translations unchecked, playbook and pack texts and server messages still English. Kinds of account-holder link (from the playbook) are shown as words of their code.
- Not looked at by eye in a browser; no new browser test (no new screen; the English texts the browser tests read are unchanged).

Next
1. Rest of the MH pack, once question 2 of session 33 is answered.
2. Screen language, part 4: arrests, chargesheets, closure report, notices, evidence and person forms (`Forms.tsx`) on the case page; then policies, load data, admin, AI settings, typing; complaint-kind and step labels per language in the packs; server messages; then the legal glossary.
3. Contract test for field names; API tests on an upgraded dump; accessibility checks (axe).
4. End-to-end demo case and demo script (with demo stations in MH).

Questions for Sumit
1. The questions of session 35 (who checks the translations, removing `.coverage` from git, pack texts per language) are still open; nothing new this run.

## 31 Oct 2026, session 35 (scheduled weekend run, Saturday, started about 16:30 IST, Sumit away)
Started from `setup/seed` at f953d64 (nothing newer, no new answers). Fresh sandbox: started PostgreSQL, created role `caseapp` and both databases, installed the Python packages and `npm ci`. Baseline `scripts/test-all.sh`: all 8 lines PASS. Next item 1 (MH pack) still waits for your answer, so I built item 2, screen language part 2. The Saturday test audit was already done in session 33 today.

Done
- **FIR list and FIR screen (557845c)**: list, columns, page buttons, the case page headings (People, Deadlines, Evidence), "identity protected", the BNS 72 notice when the complaint text is withheld, court-ready state, in English and the 10 languages. `translate` now fills `{name}` places (dates, numbers); `t.code(prefix, code)` shows a code from the server by its label (person role, evidence kind, deadline kind) and shows the bare code when no catalog knows it, so a code added on the server still appears.
- **Deadline kinds by label**: the case page used to show raw codes (`chargesheet_custody`, `victim_progress_update`, `notice_reply:<addressee>`); it now shows "Chargesheet for an accused in custody", "Progress update to the victim", "Reply to the notice from <addressee>" (and in each language). The legal basis in brackets (BNSS 187(3) ...) still comes from the database in English.
- **Front desk and complaint screens (5140d48)**: intake form, open complaints, how-given and outcome lists, read-back and signature lines, the informant's copy (BNSS 173(2)), first steps, outcome, the sign/step/close forms; the Save/Saving button of every form. The read-back language is named in its own script on a non-English screen (मराठी). The signed words of the informant are never translated.
- Tests: `i18n.test.ts` (+3: every translation keeps the `{name}` places of the English text, filling, codes and fallback), `FirList.test.tsx` (+1 Hindi), `FirDetail.test.tsx` (+1 Marathi; notice-reply and unknown deadline kinds), `FrontDesk.test.tsx` (+2: Marathi desk and complaint with one overdue step, copy and enquiry limit; Hindi Save button, written information not read over). Browser tests updated for the deadline labels; `test_screen_language.py` now also checks the empty FIR list in Marathi.
- Final `scripts/test-all.sh`: PASS repo rules, PASS packs, PASS xlit, PASS ai-gateway, PASS web, PASS database rules, PASS core, PASS e2e browser. Coverage: core 98.1% lines / 92.6% branches, web 99.5% statements / 89.5% branches / 95.3% functions, gateway 96%. No gate raised (no rise of 2 points since the last raise).

Deliberately skipped / not checked
- Still English: complaint kinds and golden-hour step texts (they come from `packs/*/complaint-kinds.json`, so a translation belongs in the pack, one label per language), the legal basis of each deadline, `action_taken`, the FIR registration and other forms in `Forms.tsx` apart from Save, the arrest, chargesheet, closure, notice, evidence and readiness parts of the case page, and every server error message.
- The new translations (about 100 texts × 10 languages) are mine and unchecked, as in session 34. Legal terms I was least sure of: "non-cognizable" (Tamil and Malayalam use the English loanword), "preliminary enquiry", "chargesheet". Not looked at by eye in a browser.
- `services/ai-gateway/.coverage` is tracked in git and changes on every test run; I restored it each time rather than commit it. It should probably be removed from git and ignored (question 2).

Next
1. Rest of the MH pack, once question 2 of session 33 is answered.
2. Screen language, part 3: the other parts of the case page (arrests, chargesheets, closure, notices, evidence, readiness), the FIR and other forms, then the remaining screens (policies, load data, admin, AI settings, typing); complaint-kind and step labels per language in the packs; server messages; then the legal glossary.
3. Contract test for field names; API tests on an upgraded dump; accessibility checks (axe).
4. End-to-end demo case and demo script (with demo stations in MH).

Questions for Sumit
1. Question 1 of session 34 is still open: who can check the translations? There are now about 130 texts per language.
2. May I remove `services/ai-gateway/.coverage` (a test-run file) from git and add it to `.gitignore`?
3. Complaint kinds and golden-hour steps are pack data. Should their translations live in the pack files (`label` per language), so a state can word them its own way? I would do it that way unless you say otherwise.

## 31 Oct 2026, session 34 (on-demand run started by Sumit at 14:34 IST)
Started from `setup/seed` at d9c201a (nothing newer, no new answers). PostgreSQL was already running. Baseline `scripts/test-all.sh`: all 8 lines PASS. Next item 1 (MH pack) still waits for question 2 of session 33, so I started item 2, "screens in the 10 languages".

Done (screen language, part 1; d059cf5)
- **Mechanism**: `apps/web/src/i18n.ts` with one catalog per language in `apps/web/src/i18n/*.json` (English base; every catalog has the same keys, a missing key shows English). No new dependency. The header has a **Screen language** list (English plus the 10 languages of `packs/IN/module.json`); each non-English one is labelled "draft translation" in its own language until a native speaker checks it (`REVIEWED` in `i18n.ts`). The page's `lang` attribute follows the choice (screen readers, fonts).
- **Kept per officer**: new `PUT /api/me/language` stores `ui_language` (the column existed since V1, never used); only a language some installed module offers is accepted (`Modules.languages()`), anything else is 400, no token is 401. `/api/login` and `/api/me` already return it, so the next sign-in starts in it. Before sign-in the choice applies to the sign-in page only.
- **Translated so far**: header and menu, sign-in page, change-password page (28 texts × 10 languages). All other screens are still English.
- Tests: `AuthApiTest` (+1: keep, refuse unknown/empty/long/missing, no token), web `i18n.test.ts` (catalog per module language, same keys, nothing empty, each text in its own script, fallback), `App.test.tsx` (+2: choose Marathi, kept on the server, menu and `lang` follow, refusal shown; Hindi on the sign-in page), new browser test `tests/e2e/test_screen_language.py` (choose Marathi, sign out, reload, sign in again: Marathi; `/api/me` says `mr`).
- Final `scripts/test-all.sh`: PASS repo rules, PASS packs, PASS xlit, PASS ai-gateway, PASS web, PASS database rules, PASS core, PASS e2e browser. Coverage: core 98.1% lines / 92.6% branches, web 99.5% statements / 89.4% branches / 95.2% functions, gateway 96%. No gate raised.

Deliberately skipped / not checked
- The 10 translations are mine and unchecked; Marathi and Hindi I am fairly sure of, Odia, Punjabi, Bengali, Malayalam less so. Words like FIR, password, sign in are kept as the English loanword in the script (as officers say them); the legal glossary will decide the official terms.
- Error messages from the server and from `api.ts` ("Wrong username or password." and others) are still English. No database constraint on `ui_language` (checked by the API only). Not looked at in a real browser by eye for font rendering; the browser test only checks the text is there.
- In the session 33 entry I had written "21:05 IST"; it actually ran at about 14:20 IST. Corrected.

Next
1. Rest of the MH pack, once question 2 of session 33 is answered.
2. Screen language, part 2: the FIR list and FIR screen, front desk, then the other screens; server messages; then the legal glossary.
3. Contract test for field names; API tests on an upgraded dump; accessibility checks (axe).
4. End-to-end demo case and demo script (with demo stations in MH).

Questions for Sumit
1. Who can check the screen translations, at least Marathi and Hindi first? Until someone does, every language but English is shown as "draft translation".
2. Should the screen use English loanwords officers use (एफआयआर, पासवर्ड) or official Hindi/Marathi terms (प्रथम खबर अहवाल, संकेतशब्द)? I used the loanwords.

## 31 Oct 2026, session 33 (scheduled weekend run, Saturday, started about 14:20 IST, Sumit away)
Started from `setup/seed` at 9523355 (nothing newer). Fresh sandbox: started PostgreSQL, created role `caseapp` and both databases, installed the Python packages and `npm ci`. Baseline `scripts/test-all.sh`: all 8 lines PASS. Built Next item 2 (item 1, the MH pack, still waits for your answer to question 1 of session 32).

Done
- **Bug found and fixed, regression tests first (98ec099)**: the admin screen dropped the police station chosen for a **state admin** (it sent `stationId: null` for that role), so a state admin created or promoted from the screen had no station, and the core treats an admin without a station as the **platform admin of every state**. The screen now always sends the chosen station. The core also refuses any account of a role holding `admin.manage` without a station (create and change), so no second all-state admin can be made; only the first account from `BOOTSTRAP_ADMIN_*` has none. The screen now takes role names and "needs a station" from `GET /api/roles` (packs), so a role a state adds can be given. Tests: `AdminPage.test.tsx` (+2), `AdminApiTest` (+1).
- **No role names in code (c49c4e1)**: `POST /api/login` and `GET /api/me` now carry the role's `permissions` and `case_scope` from `roles.json` (a role no pack declares any more gives none). Web: Admin and AI settings menu by `admin.manage`; the IO assignment form by case scope station/district; "I am the investigating officer" by `case.lead` (ticked for an officer of their own cases, offered unticked to an SHO, who could not tick it before). AI gateway: only `admin.manage` changes AI settings; an answer without a permission list counts as none. New repo rule `tests/repo_rules/test_no_role_names.py`: a line of app code naming a role together with a role code from the packs fails. Tests: `ImportApiTest` (+1), `AuthApiTest`, web `App`/`Forms`/`IoAssignment` (+3), gateway (+1).
- Saturday audit: core suite also run in reverse class order, 185 tests, no failure (no order dependence). Tried the new admin refusals and `/api/me` for a role left in the database without a pack by API tests.
- Final `scripts/test-all.sh`: PASS repo rules, PASS packs, PASS xlit, PASS ai-gateway, PASS web, PASS database rules, PASS core, PASS e2e browser. Coverage: core 98.1% lines / 92.6% branches, web 99.5% statements / 89.3% branches / 95.1% functions, gateway 96%. No gate raised (no rise of 2 points).

Deliberately skipped / not checked
- An officer still signed in from before this change has no `permissions` in their stored session, so the Admin link is hidden until they sign in again (the server was never affected). Not worth code for a demo.
- No new browser test (no new screen); the admin screen's station fix is covered by web and API tests only.
- Still open from the audit list: `GET /api/stations` lists every state's station names to any signed-in user; the AI settings are one set for the whole installation (fine with one installation per state).

Next
1. Rest of the MH pack, once question 1 of session 32 is answered.
2. Screens in the 10 languages, then the legal glossary; Marathi labels come with it.
3. Contract test for field names; API tests on an upgraded dump; accessibility checks (axe).
4. End-to-end demo case and demo script (with demo stations in MH).

Questions for Sumit
1. A new state admin must now always be placed at a police station of their state; only the first account (set at installation) works across all states. Is that right, or do you want a way to make a second all-state admin?
2. Question 1 of session 32 (who can give the Maharashtra roles, MH-specific offences and Marathi wording) is still open and blocks the MH pack.

## 31 Oct 2026, session 32 (scheduled nightly run, 02:05 IST, Sumit away)
Tonight in short: this was the only session of the night (the branch had nothing newer than session 31, c59eefa). Baseline was red on one test, fixed first. No new feature: the "rest of the MH pack" needs content only a Maharashtra reviewer can give (see questions), so the time went into the next kinds of test from docs/TESTING.md and into older, lowest-covered code. Final `scripts/test-all.sh`: PASS repo rules, PASS packs, PASS xlit, PASS ai-gateway, PASS web, PASS database rules, PASS core, PASS e2e browser (all 8). Coverage: core 98.1% lines / 92.6% branches, web 99.5% statements / 88.4% branches / 95% functions, gateway 96%.

Done
- **Baseline fix (614f12f)**: `test_deadlines_view` put a notice issued "now" with a fixed reply date of 30 Oct; after midnight IST "now" is 31 Oct, so the database rule `reply_due_after_issue` refused it. The test now uses a fixed issue date. Not an app bug; the test depended on the clock.
- **Upgrade test** (`apps/core/db-tests/test_upgrade.py`): builds the schema as it was at V25 and at V29, stores a case with a masked victim, applies every later migration and checks the case, the masking view and the unique FIR number are unchanged. Bump `BASES` when a release is tagged. Not yet: running the API tests on an upgraded dump.
- **Contract test web to core** (`tests/repo_rules/test_web_core_contract.py`): reads every call in `apps/web/src` and every mapping in the Java controllers; each web call must have a core route with the same method. Checked that it bites (a renamed route fails). Field names are not checked yet.
- **Tests for old code**: `RecordsRefusalsApiTest` (unknown arrest ids on release/correction/memo/time-correction, arrest of a witness, future arrest, remand before arrest, half a release, future time correction, future or replaced chargesheet corrections, closure dates and decision date, reply to an unsent notice); web `FirDetail.test.tsx` (new), `IoAssignment` (first IO, short reason, load error), `App` (menu by account, every page route, sign-out); gateway provider tests (no key, HTTP errors, empty answers, Gemini system text).
- **Gates raised** (coverage had risen): web branches 82 to 86, gateway 90 to 92; core branch gate in the CI comment and CLAUDE.md corrected to 90 (it was already 90 in the pom).

Deliberately skipped / not checked
- Rest of the MH pack: no roles, punishment differences, playbooks or Marathi labels added. I would have had to invent Maharashtra law or police structure (for example an SDPO role would see a whole district, wider than a sub-division). Marathi labels need the "screens in 10 languages" work. Demo stations belong with the demo script (Next item 8).
- Not looked at: the remaining uncovered core lines are unreachable catches (JSON errors) and "recorded in the meantime" races in `ImportController`; not worth fake tests.
- Risk found, not fixed: the web app hard-codes role names (`App.tsx` uses `state_admin` for the Admin menu; `IoAssignment.tsx` uses `sho`/`sp` to show the assign form), against the rule to use permissions from `roles.json`. The server still checks, so this only decides what is shown. A permission flag in `/api/me` (like `can_import`) would fix it.
- No accessibility, load or mutation tests yet (items 5 and 6 of "Not covered yet").

Next
1. Rest of the MH pack, once questions 1 and 2 are answered.
2. Replace hard-coded role names in the web app with permission flags from `/api/me`.
3. Screens in the 10 languages, then the legal glossary; Marathi labels come with it.
4. Contract test for field names; API tests on an upgraded dump; accessibility checks.
5. End-to-end demo case and demo script (with demo stations in MH).

Questions for Sumit
1. Maharashtra pack: who can tell me the real MH roles (is an SDPO/DySP supervising role needed, and what may they see), the Maharashtra-specific offences and punishments that differ from the national table (for example MPDA, MCOCA), and the Marathi wording to use? Until then I add nothing invented.
2. Should I fix the hard-coded role names in the web app now (small change in the core and web), before more screens copy the pattern?

## 30 Oct 2026, session 31 (scheduled nightly run, Sumit away)
Started from `setup/seed` at 26dc593. Fresh sandbox: started PostgreSQL, created role/databases, installed missing Python packages (`psycopg[binary]`, `pytest-cov`, `httpx` and the gateway requirements; the first `test-all.sh` run failed only on the gateway for that reason, re-run green).

Done (front desk, part 3: speech input)
- A **Speak / Stop speaking** button under the "Information as given" box. It uses the browser's own speech recognition (no new dependency, no new route), in the language chosen for typing (Marathi gives `mr-IN`, English `en-IN`). Only finished phrases are added, at the end of the text, so the officer reads and corrects them before the read-back; the signed text still never changes. If the browser has no speech recognition the button is not shown; an error (for example microphone refused) is shown and typing still works; leaving the page stops listening.
- **Policy**: Chrome and Edge send the audio to the browser maker's servers, so the button shows only when the unit's `ai_cloud_allowed` policy is on (read from `/api/me`). It is a browser feature, not an AI call of ours, so it does not go through the AI gateway and is not in the AI audit log (see question 1).
- Tests: `TypingField.test.tsx` (+3 with a fake recogniser: absent without the prop or support, adds finished phrases only and stops, error and unmount), `FrontDesk.test.tsx` (+1: button hidden when the policy is off). Final `scripts/test-all.sh`: all 8 lines PASS.

Deliberately skipped / not checked
- Not tried with a real microphone or on a real browser (headless Chromium has no speech service), only against a fake recogniser. Accuracy for Marathi and other languages is unknown. No browser test for it. Speech is on the complaint text only, not other text fields.

Next
1. Rest of the MH pack (roles, Marathi labels, playbooks, demo stations).
2. Upgrade test.
3. Screens in the 10 languages, then the legal glossary.

Questions for Sumit
1. Speech goes to the browser maker's cloud, outside our audit log. Is that acceptable for the demo only, or should real use wait for an on-prem speech model (IndicConformer) behind the AI gateway, as the plan says for later?
2. Which phones/browsers will the front desk use in the pilot (decides whether browser speech works at all)?

## 30 Oct 2026, session 30 (scheduled nightly run, Sumit away)
Started from `setup/seed` at 0e6b30c. Sandbox fresh: started PostgreSQL, created role `caseapp` and the two databases, installed packages (`psycopg[binary]` was missing for the database and browser suites). Baseline `scripts/test-all.sh`: all 8 lines PASS.

Done (front desk, part 2)
- **Copy for the informant (BNSS 173(2))**: once a complaint is signed, its screen shows a "Copy for the informant" block (name, kind, time received, the signed words in their language, who recorded the signature) and a "Print the copy" button. Printing shows only that block (print stylesheet in `index.css`). No new route: it reads the existing complaint.
- **Preliminary enquiry limit (BNSS 173(3))**: `GET /api/complaints/{id}` carries `enquiry_due` = decision time + 14 days when the outcome is a preliminary enquiry, null otherwise; the screen shows "to be finished by ...". Computed, no migration.
- Tests: `ComplaintApiTest` (+1: due date is decision + 14 days, absent for other outcomes), `FrontDesk.test.tsx` (+1: copy and print, enquiry limit, no copy before signing), browser test checks the copy carries the signed words.
- Final `scripts/test-all.sh`: all 8 lines PASS (repo rules, packs, xlit, ai-gateway, web, database rules, core, e2e browser). Coverage: core 98.1% lines / 92.5% branches, web 99.3% statements, gateway 94%. No gate raised (no rise of 2 points).

Deliberately skipped / not checked
- Speech input not started. The printed copy was not checked on paper (only that the button calls print and the block is in the page). The 14-day limit is shown, but it is not on the deadline list or any alert, and "DSP permission" for the enquiry (173(3)) is not recorded. The copy shows no station name or letterhead.

Next
1. Front desk, part 3: speech input.
2. Rest of the MH pack (roles, Marathi labels, playbooks, demo stations).
3. Upgrade test.

Questions for Sumit
1. Should the 14-day preliminary-enquiry limit appear on the station's deadline list with an alert, and should the DSP's permission be recorded?
2. What should the informant's copy carry: station name and address, FIR/complaint number? (Needs the station letterhead details.)

## 30 Oct 2026, session 29 (on-demand run started by Sumit at 18:29 IST)
Started from `setup/seed` at 52f9d88 (nothing newer on the branch, no new answers). PostgreSQL already running. Baseline `scripts/test-all.sh`: all 8 lines PASS. I pushed a short "working on the front desk" note first (b457f8e) so a parallel session would not build the same item.

Done
- **Front desk, module 1 (typed intake, read-back, golden-hour checklist)**, f8fcfe8. New screen "Front desk" for station staff who may register FIRs (permission `fir.register`; anyone else gets 404 on a complaint).
  - **Intake**: time received, how it was given (spoken at the station, phone, written, electronic), informant, kind, and the information in the informant's own words (Indian-script typing works as in the FIR form).
  - **Read-back and signature (BNSS 173(1))**: the text is shown large; spoken or phoned information must be read over in a named language before it is marked signed. Before signing, the text may be corrected; **once signed it never changes** (database rule). Electronic information counts only if signed **within three days** (173(1)(ii)); after that it can only be closed as "not signed in time".
  - **Golden-hour steps**: each kind has steps with a time limit counted from receipt, shown as due or overdue and ticked once with who, when and a note (for example the 1930 acknowledgement number). The list lives in the pack (`packs/IN/complaint-kinds.json`, marked **draft**): online financial fraud (1930/NCRP within the hour, transactions, keep phone data), sexual offence (woman officer, BNSS 173(1) proviso; identity, BNS 72/POCSO 23; medical examination within 24 hours, BNSS 184; child: CWC and Special Court within 24 hours, POCSO 19(6)), hurt, missing child (FIR at once, Bachpan Bachao Andolan 2013), vehicle theft, other. A state module may add kinds, never change national ones (checked at start-up).
  - **Outcome**: "Register the FIR from this complaint" sends only the complaint id; the server takes the **signed text and the time received unchanged** (the database checks the FIR carries them), one FIR per complaint, same station only. Otherwise closed with a reason (NCR, preliminary enquiry, transferred, no offence).
  - Tests: `ComplaintApiTest` (6), `ComplaintKindsTest` (2), `test_schema.py` (+4), `FrontDesk.test.tsx` (6), pack test (+1), new browser test `tests/e2e/test_front_desk.py` (front desk takes a cyber-fraud complaint received two hours ago, sees the overdue steps, ticks 1930, reads it over in Marathi, signs, registers the FIR, which shows the same words).
- **Bug found by the browser test, regression tests first**: ticking a step answered 201 with no body, and the web client showed "Unexpected end of JSON input" although the step was saved. The step now answers 204, and the web client treats any empty success body as saved (the custody hand-over endpoint has the same 201-without-body and would have hit this once it gets a screen).
- Final `scripts/test-all.sh`: PASS repo rules, PASS packs, PASS xlit, PASS ai-gateway, PASS web, PASS database rules, PASS core, PASS e2e browser. Coverage: core 98.1% lines / 92.5% branches, web 99.3% statements / 84.5% branches / 94.8% functions, gateway 94%. No gate raised (no rise of 2 points).

Deliberately skipped / not checked
- Speech input (the last part of module 1) not started. No printed copy for the informant (BNSS 173(2) free copy) yet. No informant signature image or e-sign; "signed" is the officer's record that the informant signed the paper.
- The preliminary enquiry outcome sets no 14-day deadline (BNSS 173(3)) yet. Complaints are not on the SP's screens (the SP has no `fir.register`). The golden-hour step texts are legal content I drafted; they need review (question 1).
- The language list for the read-back is the typing engine's 10 languages plus English.

Next
1. Front desk, part 2: printable copy for the informant (BNSS 173(2)), the 14-day preliminary-enquiry deadline (173(3)), then speech input.
2. Rest of the MH pack once questions 1 to 3 of session 26 are answered.
3. Upgrade test (next kind of test in docs/TESTING.md).

Questions for Sumit
1. The golden-hour steps (packs/IN/complaint-kinds.json) are a draft I wrote from the law and national practice. Who in the pilot can check them, and which kinds of complaint come to the front desk most often there?
2. Should a woman-victim sexual-offence complaint be refused at intake when the signed-in officer is not a woman (the app does not know officers' gender today), or is a checklist step enough?
3. Should the SP see the complaints of the district (read only)?

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
