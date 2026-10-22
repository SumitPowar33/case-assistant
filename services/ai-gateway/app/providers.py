"""AI providers behind one interface. Every provider takes plain text in and returns plain text out.

Claude (Anthropic Messages API) and Gemini (Google Generative Language API) are real network providers.
`fake` is an offline provider for tests and for demos without API keys.
"""
from __future__ import annotations

import os
from dataclasses import dataclass

import httpx


class ProviderError(Exception):
    """Raised when a provider cannot answer (missing key, HTTP error, empty reply)."""


@dataclass
class Completion:
    text: str
    provider: str
    model: str
    input_tokens: int | None = None
    output_tokens: int | None = None


class Provider:
    name = "base"

    def complete(self, *, model: str, system: str, prompt: str, max_tokens: int) -> Completion:  # pragma: no cover
        raise NotImplementedError


class ClaudeProvider(Provider):
    name = "claude"
    url = "https://api.anthropic.com/v1/messages"

    def __init__(self, api_key: str | None = None, client: httpx.Client | None = None):
        self.api_key = api_key if api_key is not None else os.environ.get("ANTHROPIC_API_KEY", "")
        self.client = client or httpx.Client(timeout=60)

    def complete(self, *, model, system, prompt, max_tokens):
        if not self.api_key:
            raise ProviderError("ANTHROPIC_API_KEY is not set")
        body = {"model": model, "max_tokens": max_tokens, "messages": [{"role": "user", "content": prompt}]}
        if system:
            body["system"] = system
        r = self.client.post(self.url, json=body, headers={
            "x-api-key": self.api_key, "anthropic-version": "2023-06-01", "content-type": "application/json"})
        if r.status_code != 200:
            raise ProviderError(f"Claude returned HTTP {r.status_code}: {r.text[:300]}")
        data = r.json()
        text = "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text")
        if not text:
            raise ProviderError("Claude returned no text")
        usage = data.get("usage", {})
        return Completion(text, self.name, data.get("model", model), usage.get("input_tokens"), usage.get("output_tokens"))


class GeminiProvider(Provider):
    name = "gemini"
    base = "https://generativelanguage.googleapis.com/v1beta/models"

    def __init__(self, api_key: str | None = None, client: httpx.Client | None = None):
        self.api_key = api_key if api_key is not None else os.environ.get("GEMINI_API_KEY", "")
        self.client = client or httpx.Client(timeout=60)

    def complete(self, *, model, system, prompt, max_tokens):
        if not self.api_key:
            raise ProviderError("GEMINI_API_KEY is not set")
        body = {"contents": [{"role": "user", "parts": [{"text": prompt}]}],
                "generationConfig": {"maxOutputTokens": max_tokens}}
        if system:
            body["systemInstruction"] = {"parts": [{"text": system}]}
        r = self.client.post(f"{self.base}/{model}:generateContent", json=body,
                             headers={"x-goog-api-key": self.api_key, "content-type": "application/json"})
        if r.status_code != 200:
            raise ProviderError(f"Gemini returned HTTP {r.status_code}: {r.text[:300]}")
        data = r.json()
        cands = data.get("candidates") or []
        parts = (cands[0].get("content", {}).get("parts", []) if cands else [])
        text = "".join(p.get("text", "") for p in parts)
        if not text:
            raise ProviderError("Gemini returned no text")
        usage = data.get("usageMetadata", {})
        return Completion(text, self.name, model, usage.get("promptTokenCount"), usage.get("candidatesTokenCount"))


class FakeProvider(Provider):
    """Deterministic offline provider: echoes a marked draft so tests and keyless demos work."""
    name = "fake"

    def complete(self, *, model, system, prompt, max_tokens):
        return Completion(f"[demo draft] {prompt[:max_tokens]}", self.name, model, len(prompt.split()), 0)
