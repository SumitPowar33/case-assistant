"""Text from a scan or photo of a bank's or a company's reply (A4), read on the state's own server so no page leaves it.
Same rule as the embeddings and the speech model. Two backends:
- `local`: Tesseract OCR (open source, Apache 2.0; Hindi and Marathi language data exist), run as the `tesseract` program;
  a PDF is read from its own text first (`pdftotext`, poppler-utils) and, when it has none (a scanned PDF), drawn page by
  page (`pdftoppm`) and read. The programs and the language data are a deployment step (docs/DEPLOY-OCR.md); until they
  are there the route answers 503 and the officer types or pastes the reply.
- `fake`: offline, for tests and demos only (OCR_BACKEND=fake): a file whose bytes after the file signature are plain text
  "shows" that text; any other bytes give a fixed notice. It reads nothing.
"""
from __future__ import annotations

import os
import subprocess
import tempfile
from pathlib import Path

# the file kinds taken, by their first bytes (the name and the declared type are the sender's word only)
SIGNATURES = {b"%PDF-": "pdf", b"\x89PNG\r\n\x1a\n": "png", b"\xff\xd8\xff": "jpeg", b"II*\x00": "tiff", b"MM\x00*": "tiff"}
MAX_PAGES = 30          # a bank's reply runs to a few pages; a longer PDF is read up to here (the answer says how many pages were read)
TIMEOUT_SECONDS = 120   # per program run; a page that takes longer is a file the server should not chew on


class ScanReaderError(Exception):
    """The reader cannot answer (programs or language data missing, a file it cannot read)."""


def kind_of(data: bytes) -> str | None:
    return next((k for sig, k in SIGNATURES.items() if data.startswith(sig)), None)


class FakeScanReader:
    name = "fake-ocr"

    def read(self, data: bytes, kind: str) -> tuple[str, int]:
        sig = next(s for s, k in SIGNATURES.items() if data.startswith(s))
        try:
            text = data[len(sig):].decode("utf-8").strip()
        except UnicodeDecodeError:
            text = ""
        return text or f"[offline stand-in: no OCR read this {kind} of {len(data)} bytes]", 1


class LocalScanReader:
    """Tesseract on this server. The file goes to a private temporary folder for the programs and is removed at once."""

    def __init__(self, languages: str | None = None):
        self.wanted = (languages or os.environ.get("OCR_LANGUAGES", "eng+hin+mar")).split("+")
        self.name = "tesseract"

    def _run(self, args: list[str]) -> str:
        try:
            out = subprocess.run(args, capture_output=True, timeout=TIMEOUT_SECONDS, check=True)
        except FileNotFoundError:
            raise ScanReaderError(f"the OCR program {args[0]} is not installed on this server")
        except subprocess.TimeoutExpired:
            raise ScanReaderError("the file took too long to read")
        except subprocess.CalledProcessError as e:
            raise ScanReaderError(f"the file could not be read ({args[0]} stopped with code {e.returncode})")
        return out.stdout.decode("utf-8", "replace")

    def languages(self) -> str:
        """The wanted languages whose data is installed (English at least), so one missing language does not stop the rest."""
        listed = self._run(["tesseract", "--list-langs"]).split()
        have = [lang for lang in self.wanted if lang in listed]
        if "eng" not in have:
            raise ScanReaderError("the OCR language data for English is not installed on this server")
        return "+".join(have)

    def read(self, data: bytes, kind: str) -> tuple[str, int]:
        langs = self.languages()
        with tempfile.TemporaryDirectory() as tmp:   # mode 0700, removed with everything in it
            src = Path(tmp) / f"in.{kind}"
            src.write_bytes(data)
            if kind != "pdf":
                return self._run(["tesseract", str(src), "-", "-l", langs]).strip(), 1
            pages = [p for p in self._run(["pdftotext", "-layout", "-l", str(MAX_PAGES), str(src), "-"]).split("\f") if p.strip()]
            if sum(len(p.strip()) for p in pages) >= 20:   # a PDF made by a computer carries its own text: no OCR needed
                return "\n\n".join(p.strip() for p in pages), len(pages)
            self._run(["pdftoppm", "-r", "300", "-gray", "-png", "-l", str(MAX_PAGES), str(src), str(Path(tmp) / "page")])
            drawn = sorted(Path(tmp).glob("page*.png"))
            return "\n\n".join(self._run(["tesseract", str(p), "-", "-l", langs]).strip() for p in drawn).strip(), len(drawn)


def from_env():
    return FakeScanReader() if os.environ.get("OCR_BACKEND", "local") == "fake" else LocalScanReader()
