"""Speech to text for a recorded statement (A3, priority 5), made on the state's own server so no recording leaves it.
Same rule as the embeddings (embedder.py). Two backends:
- `local`: faster-whisper (an open speech model; Hindi and Marathi included), set by TRANSCRIBE_MODEL (a folder or a model
  name). The package and the weights are a deployment step (docs/DEPLOY-TRANSCRIPTION.md); until they are there the route
  answers 503 and the officer types the statement.
- `fake`: offline, for tests and demos only (TRANSCRIBE_BACKEND=fake): a recording whose bytes are plain text "says" that
  text; any other bytes give a fixed notice. It hears nothing.
"""
from __future__ import annotations

import os
import tempfile


class TranscriberError(Exception):
    """The speech model cannot answer (not installed, weights missing, a recording it cannot read)."""


class FakeTranscriber:
    name = "fake-speech"

    def transcribe(self, audio: bytes, language: str | None) -> str:
        try:
            text = audio.decode("utf-8").strip()
        except UnicodeDecodeError:
            text = ""
        return text or f"[offline stand-in: no speech model heard this recording of {len(audio)} bytes]"


class LocalTranscriber:
    """faster-whisper on this server. The recording is written to a private temporary file for the model and removed at once."""

    def __init__(self, model: str | None = None):
        self.name = model or os.environ.get("TRANSCRIBE_MODEL", "small")
        self._model = None

    def transcribe(self, audio: bytes, language: str | None) -> str:
        if self._model is None:
            try:
                from faster_whisper import WhisperModel   # not in requirements.txt: a deployment step
                self._model = WhisperModel(self.name, device="cpu", compute_type="int8",
                                           local_files_only=os.environ.get("TRANSCRIBE_OFFLINE", "1") == "1")
            except Exception as e:   # not installed, or the weights are not on this server
                raise TranscriberError(f"the speech model {self.name} is not installed on this server ({type(e).__name__})")
        with tempfile.NamedTemporaryFile(suffix=".audio") as f:   # mode 0600, deleted on close
            f.write(audio)
            f.flush()
            try:
                segments, _ = self._model.transcribe(f.name, language=language)
                return " ".join(s.text.strip() for s in segments).strip()
            except Exception as e:   # a file the model cannot decode
                raise TranscriberError(f"the recording could not be read ({type(e).__name__})")


def from_env():
    return FakeTranscriber() if os.environ.get("TRANSCRIBE_BACKEND", "local") == "fake" else LocalTranscriber()
