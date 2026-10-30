# Loading existing data (integration screen)

Decided 28 Oct 2026 after research. Screen: **Load data** (`#/import`). Code: `ImportController`, `FirImport`, `Csv`, migration V22, `packs/*/import-profiles`, `packs/*/law-concordance.json`.

## Why a file first
CCTNS has no public data API or published schema; each state runs its own system (for example Tamil Nadu's CIPRUS on PostgreSQL), and ICJS links CCTNS with e-Courts and e-Prisons without public details. So the only route that works for every state today is a **CSV export** that the department prepares. A direct connector for one state can be added later as another profile or a small bridge once a data agreement and a real schema exist.

## What the audits of old systems say (so the importer checks it)
Audit reports on CCTNS found: the same accused or complainant under several IDs; FIRs dated before their General Diary entry; arrests and seizures dated before the FIR; stations mapped wrongly; digitisation that stops short of the years promised; officers keeping access after leaving. The importer therefore checks dates in order, no future dates, repeated numbers, the IO against the station's real officers, and never invents a missing fact.

## The flow (nothing is added to cases until step 4)
1. **Choose** police station, file layout (profile) and complaint language, then pick the CSV. `POST /api/imports/inspect` reads only the header and suggests which column feeds which field. Nothing is stored.
2. **Match the columns.** Profile aliases give the first guess (case, spaces and dashes ignored); the person can change any. FIR number and registration date must be matched.
3. **Check.** `POST /api/imports` stages every row (`import_batch`, `import_row`): ok / warning / error / duplicate, with messages per field. The person filters rows and downloads the problems as CSV (cells starting `= + - @` are defanged against spreadsheet formulas).
4. **Approve** with the authority for the load (order or letter, 10+ characters). One database transaction adds every ready row. Rows with errors and FIRs already present are skipped. Personal data in staging (`raw`, `parsed`) is erased at approval or discard.
5. **Undo** (reason 10+ characters) removes the batch's FIRs and people, but only while nothing else is recorded on them. The guard reads the database catalogue for every table that points at `fir` or `person`, so a new table is protected without an edit; people added later also block it.

## Rules
- **Insert only.** An existing FIR (same station, year, number) is never changed. Same content again = "already imported, skipped"; different content = "differs, not changed, skipped". The fingerprint is a SHA-256 over the sorted, parsed row.
- **No guessing.** Missing GD entry or complaint text is stored as "Not in the old record" with a warning. Date-only values become 00:00 IST with a warning. A missing act is taken as IPC before 1 July 2024 and BNS from then, with a warning. Unreadable sections are kept as "Other" with a warning. An unknown IO username leaves the FIR without an IO (no assignment row is written).
- **IPC to BNS** (`law-concordance.json`, draft) is shown as a note only; nothing is converted. Old offences stay under the IPC.
- **Legacy rape cases stay protected.** IPC 376 (all sub-sections) now masks the victim and complainant and starts the 193(2) clock exactly like BNS 64-71 (V22).
- **Concluded cases** (`status` closed, disposed, chargesheeted, ...) are stored with `concluded = true` and get no live deadlines.
- **Who.** Permission `import.run` (SHO for own station, SP for own district, state admin for own state, platform admin for any), checked per station by `CaseTeam.canAt`. Others get 403, and a batch is a 404 to anyone who may not load for its station.
- **Limits.** 5,000 rows and 5 MB per file; UTF-8; separator comma, semicolon, tab or bar found from the header.
- **Second approver.** Policy `import_self_approval` (default 1). A state, district or station may set it to 0; then the person who checked a file cannot approve it, another authorised person must (403 otherwise).
- **Audit.** Each batch keeps who staged it, who approved it and the authority, file name and SHA-256, counts, who undid it and why. Batches cannot be deleted.
- **Privacy (DPDP Act).** The police exemption covers only notified bodies, and purpose limitation, storage limitation and security safeguards still apply: import only what the file needs, restrict who can do it, log it, purge staging. Real data only after a data agreement.

- **Same-name accused.** At check time an accused whose name (case, spaces, dots and commas ignored) matches an accused of another FIR of the same station, or of an earlier row of the same file, gets a warning naming that FIR. Nothing is merged and the row can still be imported. Other stations and other roles are not compared.

## FIR file columns
`fir_no`, `registered_at` (required); `fir_year`, `information_received_at`, `gd_entry_no`, `sections` (`IPC 420/34; BNS 318(4)`), `complaint_text`, `io_username`, `complainant_name`, `victim_names`, `accused_names`, `witness_names` (names separated by `;`), `status`, `zero_fir`, `outside_limits_place`, `source_key`. A state module adds a profile with its own column names in `packs/{state}/import-profiles/`. Such a profile is only for that state's stations (the screen offers it only there and the server refuses it elsewhere); profile ids are unique across modules. First one: `packs/MH/import-profiles/fir-mh-cctns-fictional.json`, a **made-up** CCTNS-style layout (capital-letter and Marathi headings) until a real masked sample exists.

## Arrests file (second file, 29 Oct 2026)
Same screen, same four steps; choose the layout "Arrests (CSV), generic". Load the FIRs first: an arrest row is matched to an FIR **of the chosen station** by number (and year) and to an accused **already in that FIR**. Code: `ArrestImport`, migration V24, `packs/*/import-profiles/arrest-generic.json`.
- **Columns.** Required: `fir_no`, `accused_name`, `arrested_at`. Optional: `fir_year` (needed only when the number repeats across years), `accused_label` (A1, A2: tells two accused of the same name apart), `place`, `grounds` (separated by `;`), `informed_name`, `informed_contact`, `arresting_officer` (username of an active officer of the station), `first_remand_on`, `released_on`, `release_basis` (bail, default bail, other), `max_punishment` (death, life, 10_years_or_more, less_than_10_years), `source_key`.
- **Nobody is created.** An accused who is not in the FIR (or whose name matches two accused with no label) is an error with the reason; fix the spelling or add the accused to the FIR first. An arrest is never attached to a guessed person.
- **No guessing.** Missing place, grounds and person informed are stored as "Not in the old record" with a warning. A missing arresting officer is left empty (the database allows that only for imported arrests, V24). A date without a time is 00:00 IST with a warning. A missing release basis is stored as "other" with a warning. A missing class of punishment is taken from the FIR's sections only through the draft table, with a warning, because it decides 60 or 90 days; when that is impossible the row is an error.
- **Date checks (errors).** Arrest in the future or before the FIR day; first remand or release before the arrest day or in the future. A warning when the first remand is more than a day after the arrest.
- **Clock.** An open case with a first remand and no release shows the BNSS 187(3) deadline from the import, and the row says so ("shown as still in custody"). A concluded FIR gets no custody deadline (V24 fixes the deadline view, which only the other deadlines honoured before).
- **Repeats.** The key is accused + IST day of arrest. Same key already in the system: same content = "already imported", otherwise "already recorded, not changed"; both skipped. Same key twice in one file is an error.
- **Recorded by.** The approving officer is recorded as having entered the memo, the remand and the release; the arresting officer is only who the file names.
- **Undo.** Deletes the batch's arrests (the only case in which the database lets an arrest memo be deleted: its batch is already marked undone). Refused when a correction exists, or when someone has recorded a first remand or release on an imported arrest after the approval. An FIR batch cannot be undone while arrests hang on its people.

## Chargesheets file (third file, 29 Oct 2026)
Layout "Chargesheets (CSV), generic". Load the FIRs first (and the arrests, if you have them). Code: `ChargesheetImport`, migration V25, `chargesheet-generic.json`. Required columns: `fir_no`, `report_no`, `filed_on`, `accused_names` (separated by `;`, by name or by label A1, A2). Optional: `fir_year`, `court`, `source_key`.
- A chargesheet names accused who are **already in the FIR**; nobody is created. Unknown or ambiguous names are errors; accused of the FIR that are not named get a note (their custody limit is not ended).
- It does what a typed one does: it ends the BNSS 187(3) custody limit of the accused it names and the BNSS 193(2) limit of the case, so an old arrest followed by an old chargesheet shows no false running clock. Load the chargesheets after the arrests.
- Errors: filing date unreadable, in the future or before the FIR day; report number missing or over 60 characters. A missing court is stored as "Not in the old record" with a warning (court names over 200 characters are cut).
- Repeats: same FIR and report number (ignoring case and spaces) already recorded = skipped (same content "already imported", otherwise "not changed"); twice in one file = error. Corrections stay the job of the correction screen, never of an import.
- Undo: removes the batch's chargesheets and their accused lists (again the only case in which the database lets those rows be deleted: the batch is already marked undone). Refused when a correction replaced one of them. An FIR or arrest batch cannot be undone while a chargesheet hangs on its people or FIRs.

## Not built yet
Separate files for evidence and notices keyed by FIR (arrests and chargesheets are done); fuzzy (spelling-variant) duplicate people and duplicates across stations (only exact normalised names are flagged); a direct state-database connector; Excel files; paging beyond 500 rows in the screen; purge of old batches after a retention period.
