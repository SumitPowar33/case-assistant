# Case Assistant – build plan (demo phase)

Owner: Sumit (product decisions). Builder: Claude, nightly sessions 21:00–04:00 IST.
Rule: fictional data only until a police sponsor, a data agreement and state servers exist.

## Decisions (22 Oct 2026)
- Stack: Java 21 + Spring Boot (main app, modular monolith) + Python FastAPI (AI and language services) + PostgreSQL. Web UI: server-rendered via Spring with a small JS layer, or a separate React app (decide in week 1).
- States: all of India. Core uses the central BNSS/BSA forms ("national pack"); each state is a pack on top (language, forms, deadlines, playbooks). First packs: National, then Maharashtra (Marathi), then others one by one. Every screen must work in any of the 10 languages from day one.
- AI: Claude and Gemini, switchable in the UI.

## Phase 1 goal (about 6 weeks)
A working web app with real code and fictional data for the 5 core modules:
1. Front-desk complaint (speech/typed text, read-back, golden-hour checklist)
2. Notices (BNSS 94 drafts, reply checks incl. BSA 63(4) Part A/B)
3. Evidence register (custody log, hashes, 63(4) builder)
4. Readiness check (charge ingredients → evidence, gaps, override with reason)
5. Language tool (transliteration in 10 languages, glossary)

## AI providers
- One "AI gateway" module; every AI call goes through it and is logged (feature, provider, model, prompt version, who accepted/edited/rejected).
- Providers at launch: Anthropic Claude and Google Gemini. The admin chooses a default provider and model per feature in Settings; an officer can switch per request where allowed.
- Later: on-prem open models (Sarvam, IndicConformer, IndicTrans2, IndicXlit) as a third provider type, so real data never leaves the state.
- API keys live in environment secrets, never in code or chat.

## Weekly rhythm
| Week | Work |
|---|---|
| 1 | Repo, stack, CI, auth stub, data model from official forms, AI gateway with Claude + Gemini, settings UI |
| 2 | Language tool (port tested engine), front-desk complaint |
| 3 | Notices + reply checks |
| 4 | Evidence register + 63(4) certificate |
| 5 | Readiness check + override flow, audit log |
| 6 | End-to-end demo case, tests, demo script |

## Each night
1. Read docs/PROGRESS.md and open questions.
2. Do the next task; write tests; run them.
3. Commit to a branch, open/update a PR.
4. Update docs/PROGRESS.md: done, next, questions for Sumit.
