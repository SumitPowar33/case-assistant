# Case Assistant

AI case assistant for Indian police, from FIR to court. Works in Indian languages, keeps the officer in charge, and helps build court-ready investigations under BNS, BNSS and BSA.

Demo phase: fictional data only.

- `docs/PLAN.md` – build plan and decisions
- `docs/research/official-forms.md` – fields of official FIR, BNSS and BSA forms
- `services/ai-gateway` – AI gateway: Claude + Gemini, per-feature settings, audit log
- `apps/core` – main app (Java/Spring to come); database schema and its tests are in place
- `packs/` – national and state packs: playbooks, rules, tasks
- `packages/xlit` – English-letters to Indian-script typing engine (run `node packages/xlit/xlit.test.js`)
