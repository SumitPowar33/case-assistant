# Progress

Working branch: `setup/seed` (open a PR to `master` when ready: https://github.com/SumitPowar33/case-assistant/pull/new/setup/seed)

Nightly sessions: 21:05, 23:35 and 02:05 IST.

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
