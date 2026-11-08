# Design: the screens follow the board

The owner's design is the canvas "Case Assistant: FIR to Court screens" (22 Oct 2026,
https://claude.ai/artifact/J2rrwZNTnB1vK8oo2nnS9F). A copy of its 21 boards is in `docs/design/boards/` (static HTML, all
names and numbers in them fictional). **Every screen is built to its board and compared with it before it is
committed** (CLAUDE.md, "Screens"). Where the app differs on purpose, the difference is listed at the end.

## Look (tokens, `apps/web/src/index.css` `:root`)
- Ground `#F4F6F8`; surfaces white with a `#DDE3EA` border and 12 px radius (`.card`, every `section` of a screen).
- Text `#16202A`, secondary `#3B4754`, muted `#5B6775`. Primary `#1F4E8C` (hover `#163B6B`), selected nav `#DCE7F5`.
- Status chips (`.chip`): critical `#FBE7E5/#9B1C13`, warning `#FDF0DC/#8A4B06`, ok `#E6F4EC/#155D35`,
  info `#E3ECF7/#163B6B`, neutral `#EEF1F4/#3B4754`, AI `#EEE9FA/#4B2E91`. Colour never carries meaning alone: the chip
  always has a word.
- Buttons 44 px high, 8 px radius: primary filled, secondary white with a `#C3CCD6` border.
- Type: the board uses IBM Plex Sans; the app keeps **Noto Sans** (system Latin + the bundled Noto Indian scripts),
  because Plex has no Bengali, Gurmukhi, Gujarati, Odia, Tamil, Telugu, Kannada or Malayalam. Sizes follow the board:
  h1 26–28 px, h2 16–17 px, body 14–15 px, labels 12–13 px.

## Frame (every signed-in screen)
- Left sidebar (white, 220–248 px): the "CA" tile, "Case Assistant" and the user's station; the menu in groups; at the
  bottom the officer's name and role, and Sign out. On a phone it folds behind the Menu button.
- When a FIR is open, the sidebar shows a "CASE FIR n/yyyy" group with the parts of the case as separate pages.
- Top strip over the content: the "demo, fictional data" chip and quick links (Type in Marathi, Old to new law).
- Content column up to 1180 px, 24–32 px padding; each screen opens with a breadcrumb, an h1 and one plain sentence.

## Boards and screens

| # | Board | Screen in the app | State |
|---|---|---|---|
| 1 | Main · Officer dashboard | `#/` Dashboard | built 2 Nov (session 59) |
| 2 | Intake · FIR intake and fact check | FIR screen, part "Case details" | restyled; AI fact check, first version (session 79: one document, the FIR text; no conflicts across documents, no cross-case links) |
| 3 | Playbook · plan, sections, deadlines | FIR part "Deadlines" | restyled; plan of tasks still to build |
| 4 | Notices | FIR part "Notices" | restyled |
| 5 | Evidence, custody, 63(4) | FIR part "Evidence" | restyled |
| 6 | Statements and witnesses | FIR part "Statements" | built 3 Nov (session 65): witness tracker and statements kept as said (V40); translation, differences to clarify and the video player still to build |
| 7 | Field seizure on tablet | FIR part `search` (`Search.tsx`) | first version (session 76): memo, witnesses, recording hash, sealed items, forwarding; no photos, selfie, QR or offline sync |
| 8 | Money trail and accused links | — | to build |
| 9 | Readiness check | FIR part "Readiness check" | restyled with status chips (session 59) |
| 10 | Draft chargesheet and sign | FIR part "Final report": draft, submit, approve or return, sign (V41); AI drafting and print to build | partly built |
| 11 | Supervisor review | `#/supervisor` (permission `chargesheet.approve`): open cases by nearest deadline, open gaps, final report waiting; AI briefing (A9) to build | partly built (session 67) |
| 12 | Court and trial tracker | `#/court` (`Court.tsx`) | built (session 71): dates and witness summons; no ICJS feed, prosecutor brief or victim-update button |
| 13 | Front desk: voice complaint, golden hour | `#/front-desk`, `#/complaints/{id}` | restyled |
| 14 | Case diary (BNSS 192) | FIR part "Case diary" (`#/firs/{id}/diary`, V39) | built 2 Nov (session 59) |
| 15 | Case property with QR custody | custody inside Evidence | own screen to build |
| 16 | Forensic and medical requests | `#/expert` | built (session 70) |
| 17 | Type in any language | `#/type` | restyled |
| 18 | Old law to new law finder | `#/laws` (`LawFinder.tsx`, `GET /api/law-finder`) | built (session 72): IPC, CrPC and Evidence Act sections beside BNS, BNSS and BSA from `packs/IN/law-concordance.json` (draft); no AI explanation yet |
| 19 | Ask the case file | FIR part "Ask the case file" (`#/firs/{id}/ask`, `GET /api/firs/{id}/case-file`) | built 6 Nov (session 73), first version: keyword retrieval in the browser |
| 20 | Audit log | `#/audit` (session 74); protected reads, AI audit in AI settings | built without the AI decisions |
| 21 | State setup and approvals | Policies, Admin; `#/state-setup` (`StatePage.tsx`, `GET/POST /api/pack-changes`, V46) | built (session 75): the pack in one line, changes proposed to it, approved or sent back by another person of the state. No editing of forms or playbooks on the screen, no list of other states, no connections panel; an approval records the decision, the pack files change with a release |

Screens the board does not have (kept, in the same look): Policies, Load data, Protected reads, Admin, AI settings,
Change password.

## Differences on purpose
- Fonts: Noto, not Plex (above).
- The board's numbers and names are examples; the app shows only what the case file holds. A board panel whose data the
  app does not have yet is left out rather than faked.
- Words that judge are not used: the board's "Proved" in the readiness check is shown as **"Linked"** (the check says what
  the file contains, never that something is proved; CLAUDE.md hard rules).

## Printed papers
Every paper the app prints follows the courts' format (Supreme Court circular of 12 Mar 2020): A4, Times New Roman 14 pt,
1.5 line spacing, quotations 12 pt single-spaced, margins 4 cm left and right and 2 cm top and bottom, black on white,
heading centred in bold capitals, numbered paragraphs in the order of the state's form, the officer's name, rank and
signature block at the end. `index.css` (`@page`, `.print-copy`) holds it; a new paper reuses `.print-copy`.
Plan and list of papers: `docs/AI-AND-SCREENS-PLAN.md` section 8.
