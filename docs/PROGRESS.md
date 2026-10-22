# Progress

## 23 Oct 2026, session 1
Done
- Seeded repo: plan, official forms research, typing engine (77 tests passing).
- AI gateway (Python FastAPI): Claude and Gemini providers plus offline `fake`; admin chooses provider and model per feature; officer can override per request unless the admin locks it; every request, error and decision (accepted/edited/rejected) is written to a hash-chained audit log. 9 tests passing; live smoke test passed with the `fake` provider.
- CI workflow runs both test suites on every push and PR.

Blocked
- Push access: Claude's GitHub app needs access to this repo (owner to reconnect).
- Java build: Maven Central is not reachable from the build environment; owner to allow `repo.maven.apache.org`, `repo1.maven.org`, `plugins.gradle.org`, `services.gradle.org`.
- Live Claude/Gemini calls need `ANTHROPIC_API_KEY` and `GEMINI_API_KEY` as environment secrets. Gemini default model id `gemini-3.7-flash` is unverified until a key is available.

Next
1. Java 21 / Spring Boot skeleton in `apps/core`: case, person, document, notice, evidence tables from `docs/research/official-forms.md`.
2. Settings screen for AI provider per feature (calls the gateway).
3. Language tool: serve the xlit engine to the web app.

Questions for Sumit
1. Web UI: Spring server pages (simpler) or a separate React app (richer)? My suggestion: React, because the typing tool and canvas designs are interactive.
