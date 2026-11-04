# Case Assistant – rules for every Claude session

Owner and decision-maker: Sumit Powar. Read `docs/PLAN.md` and `docs/PROGRESS.md` first, every session.

## Hard rules
- Fictional data only. Never put real names, phone numbers, accounts or case details in code, tests, fixtures or commits.
- The AI drafts; a person decides. Never build features that judge guilt, score credibility, predict who will commit crime, or use facial recognition.
- Every AI call goes through `services/ai-gateway` and is audit-logged. No direct model calls elsewhere.
- Never commit secrets. API keys and the login signing key come from environment variables (`ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `AUTH_SECRET`, `AI_AUDIT_KEY` for the gateway's keyed audit chain; the first admin from `BOOTSTRAP_ADMIN_USERNAME`/`BOOTSTRAP_ADMIN_PASSWORD`).
- Work on a branch, open a PR, never push to `master` directly.
- Run the tests before every commit; do not commit red tests.
- Commits are authored as Sumit Powar. Do not add any Claude/AI name, co-author line or session link to commits, PRs or files.

## Write the least code that works (Ponytail rule)
First read the code the change touches and trace the real flow. Then, before writing anything, go down this list and stop at the first answer that fully meets the need:
1. Does this need to exist at all? (Build only what the current task in docs/PROGRESS.md asks for.)
2. Does the codebase already have it? Reuse it.
3. Does the language's standard library handle it?
4. Does the platform handle it (Spring Boot, PostgreSQL, React, browser)?
5. Does a dependency we already have handle it? Do not add a new dependency without saying why in PROGRESS.md.
6. Can it be one line?
7. Only then write the minimum that works, plus one small test when the code has logic (a branch, loop, parser, deadline, money or security).

Never cut these to save lines: input validation at trust boundaries, error handling that prevents data loss, security and access control, audit logging, victim-identity masking, accessibility basics, or anything Sumit explicitly asked for.
No speculative abstractions, no unused options or config, no layers "for later", no copy-paste duplicates.
At the end of each session, note in PROGRESS.md anything you deliberately skipped or did not check, and any risks.

## Layout
- Login: `POST /api/login` on the core app gives an 8-hour token; the core app and the AI gateway both check it with the same `AUTH_SECRET`.
- `services/ai-gateway` – Python FastAPI. Claude + Gemini (+ offline `fake`) behind one API; per-feature provider settings; hash-chained audit log (keyed with `AI_AUDIT_KEY`, settings and audit per state; after every row the chain head goes to the core, `POST /api/ai-chain-head` signed with `AUTH_SECRET`, V35, so an older copy of the gateway's file fails the check). Every token is also checked with the core app (`CORE_URL`, `GET /api/me`; a yes is kept 30 s; core down = refused). A unit's policy `ai_cloud_allowed` = 0 (from `/api/me`) makes it refuse cloud providers. Tests: `python -m pytest -q` in that folder.
- `packages/xlit` – English-letters to Indian-script typing engine. Tests: `node packages/xlit/xlit.test.js`.
- `apps/core` – Java 21 / Spring Boot main app; Flyway migrations in `src/main/resources/db/migration`. Tests (need PostgreSQL): `mvn -f apps/core/pom.xml test` and `python -m pytest -q apps/core/db-tests`. Monthly mutation tests: `python scripts/mutate_legal_sql.py` (legal numbers in SQL), `python scripts/mutate_trigger_sql.py` (keep-as-written and masking rules in SQL) and `mvn -P mutation ... pitest-maven:mutationCoverage` (pack rule code); see `docs/TESTING.md`.
- `apps/web` – React + TypeScript (Vite). Tests: `npm test` and `npm run build` in that folder. Indian scripts are drawn with the app's own Noto Sans fonts (`@fontsource-variable/noto-sans-*`, imported in `main.tsx`, named in `index.css`); a new script needs both.
- `packs` – modules, one folder per state or the nation (`IN`): `module.json` (id, name, version, languages, depends; gives the `state_pack` row), `roles.json`, `policies.json` (a state module may add `state_values`: stricter values for its own state), `punishments.json`, `playbooks/`, `glossary.json` (legal terms in the 10 languages, `GET /api/glossary`, shown on the language tool; a draft until reviewed). Data, not code. A module may add roles, permissions and policies, never remove or loosen the national ones. Tests: `python -m pytest -q packs/tests`.
- `tests/e2e` – browser tests (Playwright, Chromium) against the real core jar, a throwaway database and the built web app: `python -m pytest -q tests/e2e`.
- `tests/repo_rules` – the hard rules of this file checked on the whole repo: `python -m pytest -q tests/repo_rules`.
- Loading existing data: CSV import in four steps for FIRs, arrests, chargesheets, evidence and notices (`ImportController`, `FirImport`, `ArrestImport`, `ChargesheetImport`, `EvidenceImport`, `NoticeImport`, V22, V24, V25, V28, V29, `packs/*/import-profiles`); design in `docs/INTEGRATION-IMPORT.md`. Insert-only, approved by a person, undoable until work is recorded.
- Front desk (module 1): `ComplaintController`, `ComplaintKinds`, V30, `packs/*/complaint-kinds.json` (golden-hour steps, draft), web `FrontDesk.tsx`. Information is written down, read over and signed (BNSS 173(1)); the signed text never changes, and an FIR registered from it (`POST /api/firs` with `complaintId`) takes it unchanged.
- Reads of protected victim details are logged (`ProtectedReads`, V37, `protected_read`): any new answer that shows a protected victim's real details or the text naming them must call `ProtectedReads.fir` or `.complaints` before it is sent. The log is read on the Protected reads screen (permission `audit.read_protected`).
- Statements under BNSS 180 (`StatementController`, V40, web `Statements.tsx`): kept as said in the language spoken, never changed; the tracker is read from the case's people; reads of a protected case's statements are logged (`statements`).
- Money trail (`MoneyTrailController`, V42, web `MoneyTrail.tsx`): transfers and bank holds typed from bank replies in the evidence register, kept as written; the table of the accused reads the money that reached each one next to the existing account-holder marks and `accused_link` rows (readiness check, V6). Money alone is never shown as proof; no score.
- Demo: `scripts/demo_case.py` loads one fictional station (MH) and one online-fraud case through the API; `docs/DEMO.md` is the demo script; `tests/e2e/test_demo_case.py` loads it on every run.
- Hardening (security review, 2 Nov 2026): request bodies are capped (`BodyLimit`: 1 MiB, 16 MiB for an import); an error never shows SQL or a Java message (`ApiErrors`); passwords are at most 72 bytes (bcrypt); the gateway takes plain model names only and 20 drafts per officer in 10 minutes; the built web page carries a Content-Security-Policy (`vite.config.ts`, checked by `tests/e2e/test_content_policy.py`). Every token has an id; `POST /api/logout` ends it (V38 `signed_out_token`); 30 wrong passwords from one address lock that address for 15 minutes; the installation's web server is `deploy/nginx.conf` (HTTPS, headers, forwarded address; `tests/repo_rules/test_deploy_config.py`, `tests/e2e/test_https_proxy.py`). Keep them when adding routes or fields.
- `docs/` – plan, progress, research, `ARCHITECTURE-TENANCY.md` (accounts, roles, policies, modules: read before touching access), `TESTING.md` (what every change must test).

## Testing rule (Sumit, 28 Oct 2026)
Every piece of code gets tests (unit, functional, database, security as `docs/TESTING.md` lists), and **the whole suite runs every day**: `scripts/test-all.sh` (add `--no-db` only when PostgreSQL cannot start; say so in PROGRESS.md). Run it before you start (baseline) and before every commit. Coverage gates (core 96/90, web 97/89, gateway 94) may only go up. A bug gets a regression test first. A new route is covered by `SecurityMatrixTest`; list it there if it is public or admin-only.

## Screens (Sumit, 2 Nov 2026)
Every screen follows its board in `docs/design/boards/` (map and tokens in `docs/DESIGN.md`). Before committing a screen,
take a screenshot of it (desktop and 390 px) and compare it with its board; note any difference in PROGRESS.md. Use the
shared classes in `index.css` (`.card`, `.chip`, `.btn`), never new colours.

## Who may see and do what
Case access comes from the role's data in `packs/*/roles.json` (case team = the named IO plus roles scoped to the station or district). A state admin works only inside their own state; an admin without a station is the platform admin. A state, district or station may only tighten a policy (`policies.json`), never loosen what is above it. Do not hard-code role names in new code: use a permission from `roles.json`.

## Start of every session
After the baseline, push `In progress: item N (session S, started HH:MM IST)` at the top of the Next list in `docs/PROGRESS.md` as the first commit. Skip an item another session marked in progress less than 3 hours ago. Remove the line when you finish.

## End of every session
Update `docs/PROGRESS.md`: what was done, what is next, questions for Sumit (numbered, short).
