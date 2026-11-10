# Accounts, roles, policies and extension (decided 28 Oct 2026)

Decided by Claude after research, at Sumit's request ("research, then decide yourself"). Sumit can overrule any line.

## 1. What a "tenant" is here
A tenant is **one state's police installation**. Each state has its own laws on top of the national ones, its own servers (docs/PLAN.md: real data stays on state servers), its own data agreement and its own people. Inside one installation the structure is a tree: **state, district, police station**. Every account sits at a station (or, for the platform admin only, nowhere).

Research (shared-schema with row-level security vs schema-per-tenant vs database-per-tenant): row-level security suits hundreds of small tenants; separate schemas or databases suit a few large tenants that need hard isolation, their own retention rules and clean exports. Our tenants are at most about 36 states and union territories, large, and legally separate. So:

- **Production: one deployment (application + PostgreSQL) per state.** No `tenant_id` column and no cross-state data in one database. Isolation is physical, which is what a data agreement with a state police expects.
- **Demo / hosted trial: several fictional states in one database is allowed**, and is kept safe by the same rule the code already follows: every query that lists or changes accounts or stations is bounded by the caller's state (done 28 Oct, see section 5). Real data never goes into such a database.
- Row-level security in PostgreSQL stays a later defence-in-depth option (it must be tested with a non-superuser role, because a superuser bypasses it).

## 2. Who may do what (roles and permissions)
The model is Odoo's, reduced to what an audit can follow.

| Odoo | Here | Where |
|---|---|---|
| Group (`res.groups`) | **Role** (`io`, `sho`, `sp`, `front_desk`, `malkhana`, `prosecutor`, `state_admin`, and any role a pack adds) | `packs/{module}/roles.json`, table `role` |
| Access right (`ir.model.access`) | **Permission** name a role holds (`fir.register`, `case.lead`, `evidence.custody`, `admin.manage`, `policy.set`, `fir.read_station`) | `roles.json`, checked in `CaseTeam` / `PolicyController` |
| Record rule (`ir.rule`) | **Case scope** of a role: `none` (only cases where the person is the named IO), `station`, `district` | `roles.json`, one SQL predicate in `CaseTeam` |
| Multi-company rule | **State scope** of an admin: bounded to the state of their own station | `AdminController.scope` |
| Field-level groups | Victim-identity masking and withheld complaint text | existing, unchanged |
| Implied groups | **Not used.** Each role lists its permissions in full, so one file shows exactly what a role can do. | |

Rules the loader enforces at start-up (and `RolesTest`, `packs/tests` check):
- A pack can **add** a role or **add** permissions to a role. It can never remove a permission, widen a role's case scope, or change whether a station is required.
- Every permission a role names must be declared by some pack. Role codes are `[a-z_]` only, so they are safe in SQL.
- Case access is always: the named IO, plus the roles whose scope covers the station or district of the FIR. Everything under `/api/firs/{id}/...` is readable only by that case team (404 otherwise); evidence also by the station's malkhana; the FIR itself also by the station's front desk.
- The screens and the AI gateway decide what to show or allow by the `permissions` and `case_scope` that `/api/login` and `/api/me` give from these files, never by role name (repo rule `test_no_role_names.py`).
- Admins: a state admin works only inside the state of their own station, and every admin account made through the API must have a station. An admin with **no station** is the platform admin of the installation (the first account, from `BOOTSTRAP_ADMIN_*`) and works in every state.

## 3. Modules: how to customise without touching the core (the "Odoo" part)
A **module is a pack folder**: `packs/IN` (national), `packs/MH` (Maharashtra), `packs/MH-Pune` if ever needed. A module is **data, not code**:

| File | What a module adds |
|---|---|
| `roles.json` | roles and permissions |
| `policies.json` | policies a unit may tighten (section 4) |
| `punishments.json` | highest punishment per section (suggests 60 or 90 days; draft until a prosecutor checks it). A state module may only add sections the national table does not name, and they hold only for FIRs of its own state; a national section cannot be re-classed (lighter or heavier) or exempted (refused at start-up, 1 Nov 2026) |
| `playbooks/*.json` | charge ingredients and readiness rules |
| `glossary.json` | legal terms: the English term, the law, a short meaning, and one word in every Indian language of the national module (shown on the language tool; a screen label named in `screen_keys` must be that word). A state module may only add terms (1 Nov 2026) |
| `module.json` | id (= folder name, the state code), name, version, languages, `depends` (every module but `IN` depends on `IN`). At start-up each module gets its `state_pack` row (status untouched), so a fresh installation can add stations at once (`Modules`) |

Why data and not uploaded code: this runs on police servers with sensitive data. Code that arrives at run time cannot be reviewed, tested or audited. A new kind of behaviour is written as code in the repository, tested, reviewed and released; a new *setting* of existing behaviour is a pack file that anyone can read. Every pack file is validated at start-up (the application refuses to start on a bad one) and by `packs/tests`. Adding a role or policy is: write the JSON, add the pack test case, release. No Java change.

`module.json` manifest done 30 Oct 2026. Planned next for modules: effective-from dates on legal rules (section 5, item 8).

## 4. Policies of a state, district or station
Each state, district and station may have its own policy, but only **in the stricter direction** than the unit above, inside the bounds the pack sets, with a written reason (10+ characters). Every change is kept (nothing is edited or deleted; the newest per unit counts). The **strictest of state, district and station applies**, and no value can pass the legal default (for example the 90 days for the victim update, BNSS 193(3)(ii), can only become shorter).

Who may set a policy: the state admin for their state; the SP for their district and its stations; the SHO for their own station (role permission `policy.set` plus the role's case scope). `GET /api/policies` shows each policy with its value in force; `POST /api/policy-settings` sets one; `GET /api/policy-settings` shows the history of the units you manage.

A **state module** can also set a stricter value for its whole state in its own `policies.json` (`state_values`: value and reason; only between the policy's minimum and the national default). The application writes these to `pack_policy` at start-up (V27); `effective_policy_days` and the tighten-only check treat the module as the unit above the state admin, so nobody in that state can go looser. First use: Maharashtra, `import_self_approval` = 0 (a second person approves every import).

Live now: `ai_cloud_allowed` (1 = case text may go to a cloud AI provider; a unit may set 0, then the AI gateway refuses Claude and Gemini for everyone of that unit and logs the refusal; only a provider on the state's own servers may answer. The core app gives the value in `GET /api/me`, which the gateway reads on every sign-in check; an answer without it counts as 0). `victim_update_days` (changes the due date on the deadline list and says "earlier by unit policy") and `session_hours` (length of a sign-in). `import_self_approval` (1 = the person who checked an import file may also approve it; a unit may set 0, then a second authorised person must approve). Policies are added only when the code that obeys them is added in the same change.

## 5. Other factors thought through, in order of when to deal with them
Done on 28 Oct 2026 because they were found while doing this: a state admin could manage every state's accounts and stations (fixed, tested); the IO history of any FIR was readable by any signed-in user (fixed; the new security test walks every route so a new one cannot miss the rule); roles were a fixed database list (now a table filled from the packs); promoting someone to state admin silently removed their station, which would have made them an all-state admin (the station is now kept).

Next (needs code, order of importance):
1. ~~Jurisdiction as data~~ (done 29 Oct 2026, V23). A district is a row (`district`: id, state, name; unique per state ignoring letter case and spaces). Stations (`district_id`) and district policies point at its id, so a spelling difference or a rename can no longer change who sees what. The API still takes and shows the district name; `district_id_of(state, name)` finds or creates it. State codes in policies now reference `state_pack`.
2. ~~Pagination and limits~~ (done). `GET /api/firs` is paged (`limit` 1 to 200, `offset`). Since 1 Nov 2026 it finds the FIRs from the user's own reach (the cases naming them as IO, index V36; the stations they read whole, the station's unique index) instead of checking every FIR: an SP's page took 8 s at 210,000 FIRs, now milliseconds (`tests/e2e/test_load_lists.py`, 150,000 FIRs). The other lists are per case, so they stay small.
3. **AI residency per state.** Policy `ai_cloud_allowed` and the gateway refusing a cloud provider when it is 0: done 30 Oct 2026. AI settings and the AI audit log per state: done 31 Oct 2026 (a state admin sets and reads only their state's; the platform admin sets the installation's defaults). Still to do: per-state API keys, and a real on-premises provider (today only the offline `fake` counts as on the state's servers).
4. ~~**Audit of reads.**~~ (done 2 Nov 2026, V37). Every answer that shows a protected victim's real name, phone or address (people of a case whose victim is protected or a person masked by hand), the FIR text of a protected case, or a protected complaint's text and informant (opened, or the name in the front-desk list) adds a line to `protected_read` (reader, station, FIR and its number, complaint, what) before it is sent; a line that cannot be written stops the answer. Kept as written; no foreign key to the FIR, so an import undo does not take the reads with it. One opening of a screen is one line: the same reader, record and kind within a minute is not logged again (the FIR screen loads the people four times). `GET /api/protected-reads?stationId=` and the Protected reads screen for holders of `audit.read_protected` (national pack: SHO for the station, SP for the district, state admin for the state, platform admin everywhere). Reading the log shows no victim detail and is not itself logged.
5. **Account lifecycle.** Transfers are logged; still missing: acting charge during leave (a temporary role with an end date), deputation to another station, and what happens to open cases when an SHO is transferred. Decided 2 Nov 2026 (PROGRESS.md, decision 2, from BNSS 2(1)(r)): open cases stay with their named IO; acting SHO = a temporary role given by the SP or state admin with an end date of at most 90 days and a reason, ending by itself, never self-given; a transferred IO's open FIRs go on the SHO's "IO has left the station" list until reassigned. Built 8 Nov 2026 (session 78): the IO is on the case team only while posted at the FIR's station (`CaseTeam`), and the open FIRs of an IO who moved or whose account was closed are listed on the Supervisor review (`io_left` of `GET /api/supervisor`). Acting charge built 10 Nov 2026 (session 85, V53, `ActingChargeController`): `POST /api/acting-charges` (a holder of `acting.grant` in reach of the officer's station; the role must hold `acting.allowed`; last day today to today+89, India date; reason of 10+ characters; never to oneself), `POST /api/acting-charges/{id}/end`, `GET /api/acting-charges?stationId=`. While it runs the officer holds the role at their own station only (case reach, permissions, policy rights); it stops by itself, and when the officer is moved or the account closed. Both steps are in the admin log. Left: a screen, and IO choice and registering by acting officers.
6. **Case transfer between stations** (zero FIR to the real station, or a district transfer): the case team follows the station, so the move needs its own recorded step.
7. **Per-state keys, backups, retention.** Encryption keys per state, restore drills, no hard deletes, legal hold.
8. **Law versions.** A BNSS amendment must not change old cases: rules get an effective-from date.
10. **Pack changes and their approval** (done 7 Nov 2026, V46, board 21). A change to a state's pack is written down (`pack_change`) by the holder of `pack.propose` (national pack: the state admin; the platform admin, who has no state, for any state) and decided once (`pack_change_decision`: approved, or sent back with a reason of 10+ characters) by the holder of `pack.approve` (national pack: the prosecutor) whose police station is in the same state. Nobody decides their own proposal (API and trigger); another state's change answers 404; an account with no station decides nothing. Both tables are kept as written. The decision is a record: pack files change only with a release, so the tighten-only rules stay in force.
9. **Approval steps as policy.** Today an IO's correction needs no SHO confirmation (Sumit, 28 Oct). If a state wants that, it becomes a policy flag, not a code fork.
10. **Export / CCTNS exchange**, offline stations (queue and sync), per-state default language and forms, accessibility checks.

## 6. How to onboard a new state (runbook, to be automated later)
1. Create `packs/XX/` with `roles.json` (only additions), `policies.json` if needed, playbooks, punishments. Run the pack tests.
2. Deploy a separate installation for that state with its own database, `AUTH_SECRET`, API keys and `BOOTSTRAP_ADMIN_*`.
3. The platform admin adds the state's stations and its first state admin (with a station, so the admin is bound to the state).
4. The state admin adds accounts; SPs and SHOs set their unit policies.
