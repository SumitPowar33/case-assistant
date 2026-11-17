# Writing down recorded statements: deployment step (A3, priority 5)

Same rule as the embeddings (`docs/DEPLOY-EMBEDDINGS.md`): the speech model runs behind the AI gateway on the state's own
server, so no recording leaves it. The code is built and tested with an offline stand-in; this file is what the
installation has to add. The build container could not download model weights, so the real model has **not** been run.

## What runs where
- `POST /v1/transcribe?case_ref=<FIR id>&language=<hi|mr|en|...>` on the gateway (`services/ai-gateway/app/transcriber.py`):
  the body is the recording itself (at most 15 MB, about 15 minutes; the web server allows 16 MB and waits up to 5 minutes).
  Same sign-in and case-team check as a draft; never a cloud provider, so the unit's "no cloud" policy does not stop it and a
  protected case's recording may be written down (it stays on this server); limited to 12 recordings per officer in 10
  minutes. The recording and the text are not kept; the log (`ai_transcribe`) holds only the recording's SHA-256, its size,
  the model and the length of the text.
- On the Statements part, with "How it was recorded" set to audio, the officer picks the file; the text appears in the
  statement box as a draft ("listen again and correct"). Saving logs `accepted` (unchanged) or `edited`; "Discard the draft"
  logs `rejected`. The saved statement is the officer's text, kept as said like any other; the recording itself stays in
  e-Sakshya or wherever the station keeps it (nothing stores audio in this app).
- Without the model the route answers 503 and the officer types the statement.

## Steps for an installation
1. On the gateway's server: `pip install faster-whisper` (CPU is enough). Not in `requirements.txt` on purpose.
2. Download a multilingual Whisper model once, on a machine that may reach the internet, and copy it to the server (for
   example `Systran/faster-whisper-small` or `-medium`; MIT licence; covers Hindi and Marathi). `small` is the default;
   Marathi accuracy is better with `medium` or `large-v3` on a server with the CPU for it.
3. Set `TRANSCRIBE_MODEL=/opt/models/faster-whisper-small` (a folder, or a model name in the Hugging Face cache);
   `TRANSCRIBE_OFFLINE=1` (default) reads the weights from disk and never fetches.
4. Check: post a short fictional recording to `/v1/transcribe` and read `"model"` and `"text"` in the answer.
5. Before the feature is switched on for a state: measure the word error rate on a set of fictional recordings in Hindi and
   Marathi spoken by the pilot station's own officers (with their consent), and set the model size from it. A transcript is
   always a draft; the officer listens and corrects it.

`TRANSCRIBE_BACKEND=fake` selects the offline stand-in (demos and tests only: a recording whose bytes are plain text "says"
that text; it hears nothing).
