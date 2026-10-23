# Progress

Working branch: `setup/seed` (open a PR to `master` when ready: https://github.com/SumitPowar33/case-assistant/pull/new/setup/seed)

Nightly sessions: 21:05, 23:35 and 02:05 IST.

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
