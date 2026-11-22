# Reading scanned replies (OCR): deployment step (A4)

Same rule as the embeddings and the speech model (`docs/DEPLOY-EMBEDDINGS.md`, `docs/DEPLOY-TRANSCRIPTION.md`): the OCR
runs behind the AI gateway on the state's own server, so no page of a bank's or a company's reply leaves it. Tests use an
offline stand-in. The build container had Tesseract 5.3.4 with English and Hindi data (no Marathi), and two gateway tests
ran the real programs on drawn fictional pages (an image and a scanned PDF); they are skipped where the programs are absent,
as in CI. How well it reads real bank letters in Hindi and Marathi has **not** been measured.

## What runs where
- `POST /v1/read-scan?case_ref=<FIR id>` on the gateway (`services/ai-gateway/app/scanreader.py`): the body is the file
  itself, at most 15 MB, known by its first bytes as PDF, PNG, JPEG or TIFF (anything else: 415). Same sign-in and
  case-team check as a draft; never a cloud provider, so the unit's "no cloud" policy does not stop it and a protected case's
  reply may be read (it stays on this server); at most 30 files per officer in 10 minutes. A PDF made by a computer is read
  from its own text (`pdftotext`); a scanned PDF is drawn at 300 dpi page by page (`pdftoppm`, at most 30 pages) and read
  with Tesseract. The file and the text are not kept; the log (`ai_transcribe`, feature `reply_scan`) holds only the file's
  SHA-256, its size and kind, the number of pages and the length of the text.
- On the Notices part, in "Log a reply", the officer picks the file; its text fills the reply's box as a draft ("read it
  against the paper and correct it"). Saving logs `accepted` (unchanged) or `edited`; "Discard the text read" or picking
  another file logs `rejected`. The saved text is the officer's, kept with the reply (V59) and searchable in Ask the case
  file; the AI reply reader can then tick the items (not on a protected case, because that one may use a cloud provider).
- Without the programs the route answers 503 and the officer types or pastes the reply.

## Steps for an installation
1. On the gateway's server: `apt install tesseract-ocr tesseract-ocr-hin tesseract-ocr-mar poppler-utils` (Ubuntu/Debian;
   Apache 2.0 and GPL programs, run as separate programs, not linked into the gateway). Nothing is added to
   `requirements.txt`.
2. Set `OCR_LANGUAGES` to the language data to use, joined by `+` (default `eng+hin+mar`). Languages whose data is not
   installed are skipped; English must be there.
3. Check: post a fictional scanned page to `/v1/read-scan` and read `"pages"` and `"text"` in the answer.
4. Before the feature is relied on for a state: read a set of fictional bank and telecom letters (typed in English, Hindi
   and Marathi, printed, scanned and photographed with a station's phone) and count the wrong account numbers, amounts and
   dates. The text is always a draft; the officer reads it against the paper, and a number in it is never taken as read
   without that check.

`OCR_BACKEND=fake` selects the offline stand-in (demos and tests only: a file whose bytes after its signature are plain text
"shows" that text; it reads nothing).
