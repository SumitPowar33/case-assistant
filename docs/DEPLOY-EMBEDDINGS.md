# Embeddings for "Ask the case file": deployment step (item 17)

Sumit's decision (16 Nov 2026, question 1 of session 92): a small open multilingual embedding model runs behind the AI
gateway on the state's own server, so no case text leaves it. The code is built and tested with an offline stand-in; this
file is what the installation has to add. The session that built it could not download the model weights (the build
container cannot reach huggingface.co), so the real model has **not** been run yet.

## What runs where
- `POST /v1/embed` on the gateway (`services/ai-gateway/app/embedder.py`): vectors for up to 64 texts (pieces of one case, or
  the officer's question). Needs the same sign-in and case-team check as a draft, is never sent to a cloud provider (so the
  unit's "no cloud" policy does not stop it), is logged as `ai_embed` with a hash of the texts and no text, and is limited to
  120 calls per officer in 10 minutes.
- The core keeps the vectors (`case_passage_vector`, V58, `GET/PUT /api/firs/{id}/case-file/vectors`), by the hash of each
  piece's text, so only new or changed pieces are embedded again. The ranking (BM25 over words plus cosine over vectors, fused
  by reciprocal rank) is in the browser, `apps/web/src/askFile.ts` `retrieve`.
- Without the model the route answers 503 and the screen ranks by words alone and says "Found by words only".

## Steps for an installation
1. On the gateway's server: `pip install sentence-transformers` (CPU is enough; it pulls PyTorch, about 2 GB) in the
   gateway's environment. It is not in `requirements.txt` on purpose: only an installation that runs the model needs it.
2. Download the weights once, on a machine that may reach the internet, and copy them to the gateway's server:
   `huggingface-cli download intfloat/multilingual-e5-small --local-dir /opt/models/multilingual-e5-small` (about 470 MB,
   MIT licence, covers Hindi, Marathi and the other Indian languages the app uses).
3. Set `EMBED_MODEL=/opt/models/multilingual-e5-small` (a folder, or the model's name if it is in the Hugging Face cache) and,
   only on a server with no internet, leave `EMBED_OFFLINE=1` (the default: the weights are read from disk, never fetched).
4. Check: `POST /v1/embed` with a case id and one text returns `"model"` and a 384-number vector.
5. **Tune `EMBED_MIN_SIMILARITY`** (default 0.80). The e5 models give 0.7 to 0.8 even for unrelated text, so the floor is
   high; the right number is found by running `apps/web/src/askFile.eval.test.ts`'s questions with the real model and
   choosing the lowest value that still sends nothing for the three questions the file has no words for. Until it is
   tuned, a question may send a piece that is only vaguely related; the answer's "NOT IN THE FILE" rule and its source check still apply.
6. Score the real model's answers on the set (the same questions, a real provider instead of the stand-in) before the
   feature is switched on for a state: the monthly evaluation of plan section 9.

`EMBED_BACKEND=fake` selects the offline stand-in (demos and tests only: it finds shared words and word starts, not meaning).

## Why vectors are not in pgvector (decision for Sumit, reversible)
Sumit asked for pgvector. The test database (the CI image `postgres:16`) has no pgvector, and a case file has a few hundred
pieces, so the core keeps the vectors as `real[]` and the browser compares them for the one case being asked about.
When a search across cases is built (it needs its own privacy decision), a `vector` column and an index can be added to the
same table in one migration and the comparison moved into SQL. Nothing else changes.
