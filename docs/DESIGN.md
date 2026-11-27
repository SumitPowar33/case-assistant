# Design: the screens follow the board

The owner's design is the canvas "Case Assistant: FIR to Court screens" (22 Oct 2026,
https://claude.ai/artifact/J2rrwZNTnB1vK8oo2nnS9F). A copy of its 21 boards is in `docs/design/boards/` (static HTML, all
names and numbers in them fictional). **Every screen is built to its board and compared with it before it is
committed** (CLAUDE.md, "Screens"). Where the app differs on purpose, the difference is listed at the end.

## Look (tokens, `apps/web/src/index.css` `:root`)
Every colour, size, space, radius and shadow of a screen is a token; a new one is added to `:root` and to this list,
never written inline. The tokens keep the board's colours and give each a role.

**Colour roles**
| Role | Tokens | Used for |
|---|---|---|
| Ground | `--ground` `#F4F6F8` | the page behind the cards |
| Surface | `--surface` `#FFFFFF`, `--surface-2` `#F7F9FB` (sunken) | cards, panels, fields; table heads, quotes, read-only fields |
| Lines | `--line` `#DDE3EA`, `--line-soft` `#EEF1F4`, `--line-strong` `#C3CCD6` | card borders; rows inside a card; a secondary button's border |
| Field | `--field` `#808C99` (hover `--field-hover` `#5B6775`) | text fields, lists, check boxes: 3.4:1 on white (WCAG 1.4.11) |
| Text | `--text` `#16202A`, `--text-2` `#3B4754`, `--muted` `#5B6775` (5.3:1 on the ground) | body; secondary; captions, hints |
| Primary | `--primary` `#1F4E8C`, hover `--primary-dark` `#163B6B`, pressed `--primary-press` `#102C52`, `--selected` `#DCE7F5`, `--on-primary` white | the one main action, links, the selected menu item |
| Focus | `--focus` `#2B6CD4` | the keyboard ring, 3 px with a 2 px gap; 5:1 on white and on the ground |
| Hover | `--hover` `#EEF2F6` | a neutral control or menu item under the pointer |
| Scrim | `--scrim` (text colour at 45 %) | the page dimmed behind a side panel |

Status pairs (background / ink, each 6:1 or more): critical `#FBE7E5/#9B1C13` (border `--crit-line`, soft box
`--crit-soft`), warning `#FDF0DC/#8A4B06` (border `--warn-line`, `--warn-ink` `#6E3B05` for the demo chip), ok `#E6F4EC/#155D35`, info
`#E3ECF7/#163B6B`, neutral `#EEF1F4/#3B4754`, AI `#EEE9FA/#4B2E91` (border `--ai-line`, draft box `--ai-soft`).
Colour never carries meaning alone: the chip always has a word.

**Type** (`--fs-*`): 11 menu group and calendar month, in capitals (`2xs`), 12 caption and table head (`xs`), 13 label (`sm`), 14 control and table (`md`), 15 body (`body`),
17 section title h2 (`lg`), 20 figure (`xl`), 26 page title h1 (`2xl`), 30 dashboard tile (`3xl`). Line heights
`--lh-tight` 1.25 (titles, buttons), `--lh-snug` 1.35 (fields, h2), `--lh-body` 1.5. Weights 600 (`--fw-semi`) and 700
(`--fw-bold`). Numbers in tables and tiles are tabular. The board uses IBM Plex Sans; the app keeps **Noto Sans**
(system Latin + the bundled Noto Indian scripts), because Plex has no Bengali, Gurmukhi, Gujarati, Odia, Tamil, Telugu,
Kannada or Malayalam.

**Space** (`--sp-*`, 4 px steps): 4, 8, 12, 16, 20, 24, 32, 40, 48. Cards 20 x 24 px inside on a desktop, 14 px on a
phone; 20 px between the cards of a screen.

**Shape and depth**: radius `--r-sm` 6, `--r-md` 8 (controls), `--r-lg` 12 (cards), `--r-pill` (chips). Shadows
`--shadow-1` (a card or a button on the ground, barely there), `--shadow-2` (floating: the tour, the sign-in card),
`--shadow-3` (the side panel). A card inside a card has no shadow.

**Controls**: `--control` 40 px high on a desktop, `--touch` 44 px on a phone (and every tap target there).
- Buttons, 8 px radius: secondary (default) white with a `--line-strong` border, hover `--hover`; primary
  (`button[type=submit]`, `.btn-p`) filled `--primary`, hover darker, pressed darkest; disabled at 55 %.
- Text fields and lists: `--field` border, darker on hover, `--primary` while typing, `--surface-2` when read-only or
  disabled, `--crit` when `aria-invalid`; lists draw their own chevron; check boxes and radios in `--primary`.
- Chips (`.chip` + `.c-crit` `.c-warn` `.c-ok` `.c-info` `.c-neu` `.c-ai`): pill, 12 px semibold, 22 px high; critical
  and AI chips carry a hairline border of their colour.
- Tables: head in `--surface-2`, 12 px capitals in `--muted`; rows divided by `--line-soft`; the row under the pointer
  in `--surface-2`; `table.cards` is a card (and one card per row on a phone).

## Dashboard (board 1, `Dashboard.tsx`)
- Page head: the date, "Welcome, ..." (h1) and one sentence with the count due in 7 days.
- Tiles: label on top, figure at the bottom (figures line up when a label wraps); a figure that asks for action is red
  and its tile carries a 3 px red line along the top.
- Two columns from 1024 px up (`.dash-grid`: the rest and 300–360 px), one below. "Needs your attention" lines up its
  chips, texts and buttons in three columns (CSS subgrid); the first line's button is the screen's one primary button.
  "Coming deadlines" draws each date as a small calendar leaf, red within 3 days and amber within 7 (the words "n days
  left" say it too).
- "FIRs" is one card (`FirList inCard`, `section.cases`): an h2 and "Register a new FIR" in its head, the table flush
  with the card's edges. On a phone the card goes and its rows are the usual row cards.
- Empty lists say so in one muted, centred line (`.empty`).

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
| 2 | Intake · FIR intake and fact check | FIR screen, part "Case details" | restyled; AI fact check, first version (session 79: one document, the FIR text; no conflicts across documents, no cross-case links); AI section suggestion below it (session 80, A2; board 3 shows the sections on the plan part) |
| 3 | Playbook · plan, sections, deadlines | FIR part "Deadlines" | restyled; plan of tasks still to build |
| 4 | Notices | FIR part "Notices" | restyled |
| 5 | Evidence, custody, 63(4) | FIR part "Evidence" | restyled |
| 6 | Statements and witnesses | FIR part "Statements" | built 3 Nov (session 65): witness tracker and statements kept as said (V40); translation, differences to clarify and the video player still to build |
| 7 | Field seizure on tablet | FIR part `search` (`Search.tsx`) | first version (session 76): memo, witnesses, recording hash, sealed items, forwarding; no photos, selfie, QR or offline sync |
| 8 | Money trail and accused links | — | to build |
| 9 | Readiness check | FIR part "Readiness check" | restyled with status chips (session 59) |
| 10 | Draft chargesheet and sign | FIR part "Final report": draft, submit, approve or return, sign (V41); AI draft (A6, session 91); court print with the custody sequence and the index of papers; "Papers that go with the report" is the board's annexures card (session 138): one line per kind, open ones named with their chip. Differences: no Export Word or PDF buttons (the browser prints), no "I have read every AI paragraph" tick (sentences are ticked one by one as they are taken), no AI paragraph shown blocked | built (sessions 66, 91, 138) |
| 11 | Supervisor review | `#/supervisor` (permission `chargesheet.approve`): open cases by nearest deadline, open gaps, final report waiting; AI briefing per case (A9, session 100) | built (session 67; A9 session 100); the board's "AI use in this case" counts are not built (they need a gateway read route) |
| 12 | Court and trial tracker | `#/court` (`Court.tsx`) | built (session 71): dates and witness summons; no ICJS feed, prosecutor brief or victim-update button |
| 13 | Front desk: voice complaint, golden hour | `#/front-desk`, `#/complaints/{id}` | restyled |
| 14 | Case diary (BNSS 192) | FIR part "Case diary" (`#/firs/{id}/diary`, V39) | built 2 Nov (session 59) |
| 15 | Case property with QR custody | custody inside Evidence | own screen to build |
| 16 | Forensic and medical requests | `#/expert` | built (session 70) |
| 17 | Type in any language | `#/type` | restyled |
| 18 | Old law to new law finder | `#/laws` (`LawFinder.tsx`, `GET /api/law-finder`) | built (session 72): IPC, CrPC and Evidence Act sections beside BNS, BNSS and BSA from `packs/IN/law-concordance.json` (draft); no AI explanation yet |
| 19 | Ask the case file | FIR part "Ask the case file" (`#/firs/{id}/ask`, `GET /api/firs/{id}/case-file`) | built 6 Nov (session 73), first version: keyword retrieval in the browser |
| 20 | Audit log | `#/audit` (session 74; AI entries and case export session 135; one filtered list and the court paper session 137, `GET /v1/ai-events`, `GET /api/audit-log?kind=`, `POST /api/audit-log/exports`) | built: one list of the station's log and the AI drafts and decisions, narrowed by filter buttons, then one case's export as a CSV file or a court paper, and the state's AI counts. Differences: the filters are Everything, AI, Protected details read, Gap accepted, Case audit exported, Record checks and Admin change (the board has All, AI, Victim details, Overrides, Exports), the export form is under the list and asks which court or inquiry asked, no "logs kept 7 years" line (no retention is set), no month tiles |
| 21 | State setup and approvals | Policies, Admin; `#/state-setup` (`StatePage.tsx`, `GET/POST /api/pack-changes`, V46) | built (session 75): the pack in one line, changes proposed to it, approved or sent back by another person of the state. No editing of forms or playbooks on the screen, no list of other states, no connections panel; an approval records the decision, the pack files change with a release |

Screens the board does not have (kept, in the same look): Policies, Load data, Protected reads, Admin, AI settings,
Change password.

## Differences on purpose
- A form opened from its button is a panel from the right (one field to a row), not a box inside the page; the board draws forms inline.
- Fonts: Noto, not Plex (above).
- Text-field borders are darker than the board's `#C3CCD6` (`--field` `#808C99`), and the keyboard ring is blue, not amber: the board's values are under 3:1 on white (WCAG 1.4.11). Secondary buttons keep `#C3CCD6`.
- The board's numbers and names are examples; the app shows only what the case file holds. A board panel whose data the
  app does not have yet is left out rather than faked.
- Words that judge are not used: the board's "Proved" in the readiness check is shown as **"Linked"** (the check says what
  the file contains, never that something is proved; CLAUDE.md hard rules).

## Printed papers
Every paper the app prints follows the courts' format (Supreme Court circular of 12 Mar 2020): A4, Times New Roman 14 pt,
1.5 line spacing, quotations 12 pt single-spaced, margins 4 cm left and right and 2 cm top and bottom, black on white,
heading centred in bold capitals, numbered paragraphs in the order of the state's form, the officer's name, rank and
signature block at the end. `index.css` (`@page`, `.print-copy`) holds it; a new paper reuses `.print-copy`.
A paper that may run over several pages is wrapped in `PaperPages.tsx`: the FIR number and police station are the head of
a layout table, which the browser repeats on every printed page (the final report, the FIR copy, the case diary page;
`tests/e2e/test_fir_copy.py` reads the PDF page by page).
Plan and list of papers: `docs/AI-AND-SCREENS-PLAN.md` section 8.
