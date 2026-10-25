# Case Assistant – rules for every Claude session

Owner and decision-maker: Sumit Powar. Read `docs/PLAN.md` and `docs/PROGRESS.md` first, every session.

## Hard rules
- Fictional data only. Never put real names, phone numbers, accounts or case details in code, tests, fixtures or commits.
- The AI drafts; a person decides. Never build features that judge guilt, score credibility, predict who will commit crime, or use facial recognition.
- Every AI call goes through `services/ai-gateway` and is audit-logged. No direct model calls elsewhere.
- Never commit secrets. API keys and the login signing key come from environment variables (`ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `AUTH_SECRET`; the first admin from `BOOTSTRAP_ADMIN_USERNAME`/`BOOTSTRAP_ADMIN_PASSWORD`).
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
- `services/ai-gateway` – Python FastAPI. Claude + Gemini (+ offline `fake`) behind one API; per-feature provider settings; hash-chained audit log. Every token is also checked with the core app (`CORE_URL`, `GET /api/me`; a yes is kept 30 s; core down = refused). Tests: `python -m pytest -q` in that folder.
- `packages/xlit` – English-letters to Indian-script typing engine. Tests: `node packages/xlit/xlit.test.js`.
- `apps/core` – Java 21 / Spring Boot main app; Flyway migrations in `src/main/resources/db/migration`. Tests (need PostgreSQL): `mvn -f apps/core/pom.xml test` and `python -m pytest -q apps/core/db-tests`.
- `apps/web` – React + TypeScript (Vite). Tests: `npm test` and `npm run build` in that folder.
- `packs` – state packs and playbooks. Tests: `python -m pytest -q packs/tests`.
- `docs/` – plan, progress, research.

## End of every session
Update `docs/PROGRESS.md`: what was done, what is next, questions for Sumit (numbered, short).
