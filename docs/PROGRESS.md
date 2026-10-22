# Progress

## 23 Oct 2026, session 1
Done
- Seeded repo: plan, official forms research, typing engine (77 tests passing).
- AI gateway (Python FastAPI): Claude and Gemini providers plus offline `fake`; admin chooses provider and model per feature; officer can override per request unless the admin locks it; every request, error and decision (accepted/edited/rejected) is written to a hash-chained audit log. 9 tests passing; live smoke test passed with the `fake` provider.
- CI workflow runs all test suites on every push and PR (gateway, typing engine, database, playbooks).
- Core database schema `apps/core/.../V1__core.sql` (Flyway format for Spring Boot), from the official forms: FIR (IIF-1 fields, Zero FIR), people with victim masking view (BNS 72), arrest memo, BNSS 94/35(3)/179 notices and replies, evidence items with SHA-256, append-only custody log, BSA 63(4) Part A/B certificates with a court-ready view, statutory deadlines (BNSS 187(3) 60/90 days counting the remand day, BNSS 193(2) two months, 90-day victim update, notice replies). 12 tests on real PostgreSQL 16.
- National pack, cyber-fraud playbook v1.0.0-draft: 5 charges with legal ingredients, 4 rules (incl. second link for account holders, 63(4) certificates), 11 tasks. Validation tests, including a check that no playbook scores guilt or credibility.

Blocked
- Push access: Claude's GitHub app needs access to this repo (owner to reconnect).
- Java build: Maven Central is not reachable from the build environment; owner to allow `repo.maven.apache.org`, `repo1.maven.org`, `plugins.gradle.org`, `services.gradle.org`.
- Live Claude/Gemini calls need `ANTHROPIC_API_KEY` and `GEMINI_API_KEY` as environment secrets. Gemini default model id `gemini-3.7-flash` is unverified until a key is available.

Next
1. Java 21 / Spring Boot skeleton in `apps/core`: case, person, document, notice, evidence tables from `docs/research/official-forms.md`.
2. Settings screen for AI provider per feature (calls the gateway).
3. Language tool: serve the xlit engine to the web app.

Questions for Sumit
0. (For the prosecutor later) Deadline counting: the schema counts the day of first remand as day 1, so A2 remanded 12 Sep gives a last day of 10 Nov. The demo screens say 11 Nov; I will fix the screens unless the prosecutor says otherwise.
1. Web UI: Spring server pages (simpler) or a separate React app (richer)? My suggestion: React, because the typing tool and canvas designs are interactive.
