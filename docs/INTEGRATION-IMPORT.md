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
- **Audit.** Each batch keeps who staged it, who approved it and the authority, file name and SHA-256, counts, who undid it and why. Batches cannot be deleted.
- **Privacy (DPDP Act).** The police exemption covers only notified bodies, and purpose limitation, storage limitation and security safeguards still apply: import only what the file needs, restrict who can do it, log it, purge staging. Real data only after a data agreement.

- **Same-name accused.** At check time an accused whose name (case, spaces, dots and commas ignored) matches an accused of another FIR of the same station, or of an earlier row of the same file, gets a warning naming that FIR. Nothing is merged and the row can still be imported. Other stations and other roles are not compared.

## FIR file columns
`fir_no`, `registered_at` (required); `fir_year`, `information_received_at`, `gd_entry_no`, `sections` (`IPC 420/34; BNS 318(4)`), `complaint_text`, `io_username`, `complainant_name`, `victim_names`, `accused_names`, `witness_names` (names separated by `;`), `status`, `zero_fir`, `outside_limits_place`, `source_key`. A state module adds a profile with its own column names in `packs/{state}/import-profiles/`.

## Not built yet
Separate files for arrests, chargesheets, evidence and notices keyed by FIR; fuzzy (spelling-variant) duplicate people and duplicates across stations (only exact normalised names are flagged); a four-eyes option (stager is not the approver); a direct state-database connector; Excel files; paging beyond 500 rows in the screen; purge of old batches after a retention period.
