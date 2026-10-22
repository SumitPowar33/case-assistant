# Case Assistant – rules for every Claude session

Owner and decision-maker: Sumit Powar. Read `docs/PLAN.md` and `docs/PROGRESS.md` first, every session.

## Hard rules
- Fictional data only. Never put real names, phone numbers, accounts or case details in code, tests, fixtures or commits.
- The AI drafts; a person decides. Never build features that judge guilt, score credibility, predict who will commit crime, or use facial recognition.
- Every AI call goes through `services/ai-gateway` and is audit-logged. No direct model calls elsewhere.
- Never commit secrets. API keys come from environment variables (`ANTHROPIC_API_KEY`, `GEMINI_API_KEY`).
- Work on a branch, open a PR, never push to `master` directly.
- Run the tests before every commit; do not commit red tests.

## Layout
- `services/ai-gateway` – Python FastAPI. Claude + Gemini (+ offline `fake`) behind one API; per-feature provider settings; hash-chained audit log. Tests: `python -m pytest -q` in that folder.
- `packages/xlit` – English-letters to Indian-script typing engine. Tests: `node packages/xlit/xlit.test.js`.
- `apps/core` (to come) – Java 21 / Spring Boot main app.
- `docs/` – plan, progress, research.

## End of every session
Update `docs/PROGRESS.md`: what was done, what is next, questions for Sumit (numbered, short).
