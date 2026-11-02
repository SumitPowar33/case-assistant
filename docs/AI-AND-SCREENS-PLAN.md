# AI, screens and printed papers: the plan (Sumit, 2 Nov 2026)

Sumit asked: what the AI does and how to make it stronger (the product is sold as AI-driven); a clear structure for
every screen; a duty schedule per station; a centred sign-in; screens for POCSO, 112 and other high-alert cases; a RAG
chatbot; how AI helps with the chargesheet; printed papers in the real format; more screens that use real-time data.
This file is the plan the build sessions follow (Next list items 13 to 18 in PROGRESS.md).

## 1. The AI today, honestly
- One AI gateway (`services/ai-gateway`): Claude, Gemini or an offline stand-in, chosen per feature by the state admin,
  every request and every officer decision (kept, edited, rejected) in a tamper-evident log, cloud refused where the
  unit's policy keeps data on state servers, 20 drafts per officer per 10 minutes.
- Seven features are declared (`fir_extract`, `notice_draft`, `reply_check`, `statement_translate`, `chargesheet_draft`,
  `case_qa`, `victim_update`), but **only notice drafting is on a screen**. Everything else in the app is rules and
  records, not AI. Selling it as AI-driven today would overstate it.

## 2. What "AI-driven" should mean here (and its limits)
The AI reads and writes; the law and a person decide. Each AI feature below follows the same five rules, already in the
gateway, and every new screen must keep them:
1. **Draft, never decide.** Output is marked "AI draft" until an officer accepts or edits it; the decision is logged.
2. **Grounded.** It answers only from the case file, and every sentence shows its source (document, page, line). If the
   file does not say, it says so.
3. **No judging people.** It never says who is guilty or truthful, never scores credibility, never predicts crime
   (hard rule). Questions like "is A3 guilty?" are refused with the reason.
4. **Original kept.** Statements stay in the language spoken; translations sit beside them, never replace them.
5. **Measured.** The audit log already counts kept / edited / rejected per feature: a feature officers keep rejecting is
   switched off or fixed. This is the honest proof of "AI-driven".

## 3. AI features, in build order (each: gateway feature, screen, tests)
| # | Feature | What the officer gets | Where |
|---|---|---|---|
| A1 | Fact extraction (`fir_extract`) | From the signed complaint: date, time, place, amounts, UTR numbers, phone and account numbers, as a checklist to confirm, each pointing at the words it came from | Front desk, FIR intake (boards 2, 13) |
| A2 | Section suggestion | The BNS sections whose ingredients the facts may meet, from the playbooks, as suggestions with the ingredient text; the officer chooses | FIR intake (board 2) |
| A3 | Statement transcription and translation (`statement_translate`) | Spoken statement to text in the speaker's language, English beside it, read-back text | Statements (board 6) |
| A4 | Reply reader (`reply_check`) | A bank or telecom reply checked against what the notice asked for: what came, what is missing, Part B certificate present or not | Notices (board 4) |
| A5 | Ask the case file (`case_qa`), RAG | See section 6 | Board 19 |
| A6 | Chargesheet drafting (`chargesheet_draft`) | See section 7 | Board 10 |
| A7 | Victim update letter (`victim_update`) | The 90-day BNSS 193(3)(ii) letter in the victim's language, plain words, no protected detail | Deadlines |
| A8 | Old law to new law | IPC/CrPC/IEA section to BNS/BNSS/BSA, from a table in the national pack (data, not AI) with the AI only explaining | Board 18 |
| A9 | Supervisor briefing | For the SHO/SP: a short, sourced summary of each case near a deadline, what is missing, and who must act | Board 11 |

Also: an Indian-language model option (an on-premises provider for states that refuse cloud, PROGRESS item on AI
residency), and a monthly report of AI use per feature for the state.

## 4. The structure of every screen (so an officer always knows where they are)
Every screen has the same five parts, top to bottom (CLAUDE.md "Screens", DESIGN.md):
1. **Where am I**: breadcrumb (FIR 214/2026 / Evidence).
2. **What is this**: one heading and one plain sentence.
3. **What needs me now**: status chips and the urgent items first (deadline, missing certificate, gap).
4. **The work**: the records, each as a card, with its actions next to it.
5. **What the AI suggests**: in a separate, marked panel ("AI draft · check each one"), never mixed into the record.
On a phone the same order, one column; long screens open one part at a time.

## 5. Duty schedule per station (new, item 16)
Not in the app today. Proposed **Station duty roster**: shifts (morning, evening, night), posts (station house, front
desk, beat, patrolling vehicle, court duty, lock-up guard, bandobast), who is on which, leave and weekly off, swaps with
the SHO's approval. Uses: the front desk sees who the duty officer is; 112 calls go to the officer on beat; the
dashboard warns when a court date clashes with an officer's duty. Rules come from the state pack (each state's police
manual differs). Real-time: who is on duty now.

## 6. POCSO, 112 and other high-alert cases (item 15)
**POCSO case mode** (a case is POCSO when a POCSO section or a child victim is recorded):
- Clock of legal steps shown in red until done: report to the Child Welfare Committee and the Special Court within
  24 hours (POCSO s.19(6)); medical examination (s.27, woman doctor for a girl, parent or trusted adult present);
  statement at the child's home or chosen place, by a woman officer, not in uniform (s.24); statement before the
  Magistrate (BNSS 183); support person (POCSO Rules 2020, rule 4); interim compensation application; investigation to
  finish within two months of the information (BNSS 193(2)).
- Stricter masking: the child's name, school, parents and address never shown outside the case team, never printed on any
  paper that leaves the file (already the rule for protected victims; POCSO s.23, BNS 72).
- The child is never asked to repeat the account: one recorded statement, reused.
**112 / ERSS link**: Dial 112 calls are taken by the state's centre and dispatched by the district control room
(ERSS/CAD). Proposed **Incoming 112 events** screen: the station receives the event (time, place on the map, type,
vehicle sent) from the state's ERSS through an agreed interface, the duty officer acknowledges, and one click opens a
complaint or a general diary entry from it. Needs the state's ERSS interface; until then, a manual entry form.
**Other high-alert kinds**: missing child (golden hours, alerts to railway and bus stations, TrackChild), acid attack,
kidnapping for ransom, custodial death (magistrate inquiry BNSS 196), and the 24-hour production limit already built.
Each gets its own golden-hour checklist in `complaint-kinds.json`, like online fraud today.

## 7. How the AI helps with the chargesheet (item 13d)
The final report under BNSS 193 is assembled, not invented:
1. The app fills every particular it already holds (FIR, sections, accused with arrest and bail status, witnesses,
   seized property, 63(4) certificates, custody chain, the BNSS 193(3)(i) electronic sequence).
2. The readiness check must have no open gap, or the SHO's written acceptance of each.
3. The AI drafts only the narrative paragraphs (facts in brief; the evidence for each ingredient of each charge), each
   sentence linked to the statement or document it comes from, in the court's language.
4. The officer reads each paragraph and accepts or rewrites it (logged); the SHO approves; the officer signs.
5. The paper prints in the court format (section 8), with the enclosure lists and indexed copies for the accused
   (BNSS 193(8)).
It never writes the IO's opinion on guilt; that line is the officer's own.

## 8. Printed papers: the real format (DESIGN.md "Printed papers")
Courts in India follow the Supreme Court's circular of 12 March 2020 (followed by the High Courts): **A4 paper, Times
New Roman 14 pt, 1.5 line spacing, quotations 12 pt single-spaced, margins 4 cm left and right, 2 cm top and bottom,
printed on both sides.** Every printed paper of the app follows it:
- Black on white, no screen colours, buttons or menus.
- Heading centred, bold, capitals (e.g. "FINAL REPORT UNDER SECTION 193 BNSS"); then the particulars as numbered
  paragraphs in the order of the state's form; the officer's name, rank and signature block at the end, place and date.
- Indian scripts print in Noto (bundled); a state that prescribes another face (Maharashtra offices often use Mangal or
  Kokila) sets it in its pack.
- Page numbers "Page x of y" at the foot; the FIR number on every page.
Done now: the informant's copy (BNSS 173(2)) prints this way on one A4 page.
To do: the FIR copy, BNSS 94 notices, the arrest memo (BNSS 36), the seizure memo, the 63(4) certificate, the case diary
page, the chargesheet with its enclosure lists. Each uses the state's form layout once a sample form is supplied.

## 9. Ask the case file (RAG chatbot), and the flaws to avoid (item 17)
Design (board 19) is right in principle. Flaws found in the board, and the fix:
1. **Answers are canned** in the board (four fixed questions). Real version: index every document of the case (FIR,
   statements, replies, memos, diary) per case, retrieve the passages, answer only from them.
2. **No access rule in the board.** Retrieval must run inside the case team's rights; protected passages are masked
   for anyone else, and every answer that shows a protected detail is logged (as the protected-read log does now).
3. **Sources by name only.** Each answer must quote the passage with document, page and line, and open it on click.
4. **No "not in the file" test.** The model must say "not in the file" when retrieval finds nothing; tested with
   questions whose answers are absent.
5. **Guilt questions.** Refused with the reason (hard rule), tested.
6. **Contradictions.** When two documents disagree (the board's example: 21 vs 22 August), show both, never choose one.
7. **Scope.** One case at a time. No search across cases or people (that would become profiling).
8. **Evaluation.** A fixed set of fictional questions with known answers, run monthly; answers with wrong or missing
   sources are counted.
Built on the gateway (feature `case_qa`), the embeddings and index kept on state servers.

## 10. More screens that use real-time data (proposals, in value order)
1. **Station live board**: who is on duty, open 112 events, people in custody with their 24-hour production clock,
   complaints waiting at the front desk.
2. **Custody clock**: every arrested person, hours since arrest, production due, remand status, colour by urgency.
3. **Money hold tracker**: for online fraud, the 1930/NCRP acknowledgement and the bank holds, updated as banks reply.
4. **Notice reply tracker**: every BNSS 94 notice past its reply date, by bank or telecom, with one-click follow-up.
5. **Court calendar**: hearings and witness summons per officer, clashes with the duty roster.
6. **Case property movement**: malkhana items out to FSL or court and not yet back.
7. **District view for the SP**: deadlines at risk across stations, readiness gaps, no names of victims.
Each is fed by records the app already keeps or by an agreed state interface (ERSS, NCRP, CCTNS, ICJS); none needs
personal data beyond the case team's rights.

Sources: Supreme Court circular on A4 filings (12 Mar 2020); BNSS 173, 183, 193; POCSO Act ss.19, 23, 24, 27 and POCSO
Rules 2020; ERSS/Dial 112 (MHA). Links in PROGRESS.md, session 60.
