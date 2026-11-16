"""Text embeddings for "Ask the case file" (item 17, decision on question 1 of session 92).

The text is turned into a vector on the state's own server, so no case text leaves it. Two backends:
- `local`: a small open multilingual model run with sentence-transformers (default `intfloat/multilingual-e5-small`,
  set by EMBED_MODEL). The package and the model weights are a deployment step (docs/DEPLOY-EMBEDDINGS.md); until they
  are there the route answers 503 and the screen ranks by words only.
- `fake`: deterministic, offline, words and their first letters hashed into a fixed number of slots. For tests and
  demos only; it finds shared words and word starts, not meaning (EMBED_BACKEND=fake).
"""
from __future__ import annotations

import hashlib
import math
import os
import unicodedata

# small words that every question and every piece holds would make all texts look alike (the same list as apps/web/src/askFile.ts)
STOP = frozenset("the a an of to in on at is was were are be by for and or with what when where who which how many much did does do it this that from as about case file there any me tell say said says".split())


def words(text: str) -> list[str]:
    """Lower-case words in any script: letters, the vowel signs of Indian scripts (marks) and digits. (\\w would cut a word at each vowel sign.)"""
    out, cur = [], []
    for ch in text.lower():
        if ch == "_" or unicodedata.category(ch)[0] in "LMN":
            cur.append(ch)
        elif cur:
            out.append("".join(cur))
            cur = []
    if cur:
        out.append("".join(cur))
    return out


class EmbedderError(Exception):
    """The embedding model cannot answer (not installed, weights missing)."""


class FakeEmbedder:
    name = "fake-hash-256"
    dim = 256
    min_similarity = 0.25   # the lowest cosine the screen counts as a match for this model

    def embed(self, texts: list[str], kind: str = "passage") -> list[list[float]]:
        return [self._one(t) for t in texts]

    def _one(self, text: str) -> list[float]:
        v = [0.0] * self.dim
        for w in words(text):
            if w in STOP:
                continue
            for feature, weight in ((w, 1.0), (w[:5], 0.5)) if len(w) > 5 else ((w, 1.0),):
                h = int.from_bytes(hashlib.sha256(feature.encode()).digest()[:8], "big")
                v[h % self.dim] += weight if (h >> 40) & 1 else -weight
        n = math.sqrt(sum(x * x for x in v))
        return [x / n for x in v] if n else v


class LocalEmbedder:
    """sentence-transformers on this server. The e5 models want "query: " and "passage: " in front of the text."""

    def __init__(self, model: str | None = None):
        self.name = model or os.environ.get("EMBED_MODEL", "intfloat/multilingual-e5-small")
        self._model = None
        self.dim = 0
        # e5 models give 0.7 to 0.8 even for unrelated texts, so the floor is high; tune it on the evaluation set (docs/DEPLOY-EMBEDDINGS.md)
        self.min_similarity = float(os.environ.get("EMBED_MIN_SIMILARITY", "0.80"))

    def embed(self, texts: list[str], kind: str = "passage") -> list[list[float]]:
        if self._model is None:
            try:
                from sentence_transformers import SentenceTransformer   # not in requirements.txt: a deployment step
                self._model = SentenceTransformer(self.name, local_files_only=os.environ.get("EMBED_OFFLINE", "1") == "1")
            except Exception as e:   # not installed, or the weights are not on this server
                raise EmbedderError(f"the embedding model {self.name} is not installed on this server ({type(e).__name__})")
        prefix = "query: " if kind == "query" else "passage: "
        out = self._model.encode([prefix + t for t in texts], normalize_embeddings=True)
        self.dim = len(out[0]) if len(out) else self.dim
        return [[float(x) for x in row] for row in out]


def from_env():
    return FakeEmbedder() if os.environ.get("EMBED_BACKEND", "local") == "fake" else LocalEmbedder()
