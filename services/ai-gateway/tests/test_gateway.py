import base64
import hashlib
import hmac
import json
import os
import time

os.environ["AI_GATEWAY_AUTOSTART"] = "0"

import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.providers import ClaudeProvider, FakeProvider, GeminiProvider
from app.store import Store


SECRET = "test-only-signing-key-not-used-anywhere-else"


def token(sub="user-admin", role="state_admin", secret=SECRET, exp_in=600, alg="HS256"):
    """A login token made the way the core app makes it (HS256 JWT). Fictional users only."""
    enc = lambda d: base64.urlsafe_b64encode(json.dumps(d).encode()).rstrip(b"=").decode()
    head = enc({"alg": alg, "typ": "JWT"})
    body = enc({"sub": sub, "role": role, "exp": int(time.time()) + exp_in})
    sig = base64.urlsafe_b64encode(hmac.new(secret.encode(), f"{head}.{body}".encode(), hashlib.sha256).digest()).rstrip(b"=").decode()
    return f"{head}.{body}.{sig}"


def client(store, providers, role="state_admin", sub="user-admin"):
    return TestClient(create_app(store, providers, SECRET), headers={"Authorization": "Bearer " + token(sub, role)})


def mock_client(handler):
    return httpx.Client(transport=httpx.MockTransport(handler))


def claude_ok(request: httpx.Request):
    assert request.url.host == "api.anthropic.com"
    assert request.headers["x-api-key"] == "test-claude"
    assert request.headers["anthropic-version"] == "2023-06-01"
    body = json.loads(request.content)
    assert body["messages"][0]["role"] == "user"
    assert "never guess" in body["system"]
    return httpx.Response(200, json={"model": body["model"], "content": [{"type": "text", "text": "claude draft"}],
                                     "usage": {"input_tokens": 11, "output_tokens": 3}})


def gemini_ok(request: httpx.Request):
    assert request.url.host == "generativelanguage.googleapis.com"
    assert request.url.path.endswith(":generateContent")
    assert request.headers["x-goog-api-key"] == "test-gemini"
    body = json.loads(request.content)
    assert body["contents"][0]["parts"][0]["text"]
    assert "never guess" in body["systemInstruction"]["parts"][0]["text"]
    return httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": "gemini draft"}]}}],
                                     "usageMetadata": {"promptTokenCount": 9, "candidatesTokenCount": 2}})


@pytest.fixture
def setup():
    store = Store(":memory:")
    providers = {"claude": ClaudeProvider("test-claude", mock_client(claude_ok)),
                 "gemini": GeminiProvider("test-gemini", mock_client(gemini_ok)),
                 "fake": FakeProvider()}
    return client(store, providers), store


def test_default_is_claude_and_logged(setup):
    c, store = setup
    r = c.post("/v1/generate", json={"feature": "notice_draft", "prompt": "Draft a BNSS 94 notice", "prompt_version": "test@1", "case_ref": "FIR 214/2026"})
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["draft"] == "claude draft" and j["provider"] == "claude" and j["label"].startswith("AI draft")
    rows = c.get("/v1/audit").json()
    assert rows["chain_ok"] is True
    assert rows["rows"][0]["action"] == "ai_request" and rows["rows"][0]["case_ref"] == "FIR 214/2026"


def test_admin_switches_feature_to_gemini(setup):
    c, _ = setup
    r = c.put("/v1/settings/notice_draft", json={"provider": "gemini"})
    assert r.status_code == 200 and r.json()["provider"] == "gemini" and r.json()["model"] == "gemini-3.7-flash"
    r = c.post("/v1/generate", json={"feature": "notice_draft", "prompt": "x", "prompt_version": "test@1"})
    assert r.json()["draft"] == "gemini draft"


def test_officer_override_allowed_and_blocked(setup):
    c, _ = setup
    r = c.post("/v1/generate", json={"feature": "case_qa", "prompt": "x", "prompt_version": "test@1", "provider": "gemini"})
    assert r.status_code == 200 and r.json()["provider"] == "gemini"
    c.put("/v1/settings/case_qa", json={"provider": "claude", "officer_may_switch": False})
    r = c.post("/v1/generate", json={"feature": "case_qa", "prompt": "x", "prompt_version": "test@1", "provider": "gemini"})
    assert r.status_code == 403
    r = c.post("/v1/generate", json={"feature": "case_qa", "prompt": "x", "prompt_version": "test@1", "model": "another-model"})
    assert r.status_code == 403  # a locked feature's model cannot be swapped either
    r = c.post("/v1/generate", json={"feature": "case_qa", "prompt": "x", "prompt_version": "test@1", "provider": "claude"})
    assert r.status_code == 200  # naming the admin's own choice is fine


def test_unknown_feature_and_provider(setup):
    c, _ = setup
    assert c.post("/v1/generate", json={"feature": "nope", "prompt": "x", "prompt_version": "test@1"}).status_code == 404
    assert c.put("/v1/settings/case_qa", json={"provider": "openai"}).status_code == 422
    assert c.post("/v1/generate", json={"feature": "case_qa", "prompt": "x", "prompt_version": "test@1", "provider": "openai"}).status_code == 422
    assert c.post("/v1/generate", json={"feature": "case_qa", "prompt": "", "prompt_version": "test@1"}).status_code == 422


def test_missing_key_is_502_and_logged():
    store = Store(":memory:")
    c = client(store, {"claude": ClaudeProvider(""), "gemini": GeminiProvider(""), "fake": FakeProvider()})
    r = c.post("/v1/generate", json={"feature": "case_qa", "prompt": "x", "prompt_version": "test@1"})
    assert r.status_code == 502 and "ANTHROPIC_API_KEY" in r.json()["detail"]
    assert store.audit_rows()[0]["action"] == "ai_error"


def test_provider_http_error_is_502():
    bad = mock_client(lambda req: httpx.Response(529, text="overloaded"))
    c = client(Store(":memory:"), {"claude": ClaudeProvider("k", bad), "gemini": GeminiProvider("k", bad), "fake": FakeProvider()})
    r = c.post("/v1/generate", json={"feature": "case_qa", "prompt": "x", "prompt_version": "test@1"})
    assert r.status_code == 502 and "529" in r.json()["detail"]


def test_decisions_logged_and_validated(setup):
    c, _ = setup
    rid = c.post("/v1/generate", json={"feature": "chargesheet_draft", "prompt": "x", "prompt_version": "test@1"}).json()["request_id"]
    assert c.post("/v1/decisions", json={"request_id": rid, "decision": "edited", "feature": "chargesheet_draft"}).status_code == 200
    assert c.post("/v1/decisions", json={"request_id": rid, "decision": "maybe", "feature": "chargesheet_draft"}).status_code == 422
    assert c.post("/v1/decisions", json={"request_id": "made-up", "decision": "accepted", "feature": "chargesheet_draft"}).status_code == 404
    assert c.post("/v1/decisions", json={"request_id": rid, "decision": "accepted", "feature": "case_qa"}).status_code == 422
    actions = [r["action"] for r in c.get("/v1/audit").json()["rows"]]
    assert actions[:2] == ["edited", "ai_request"]


def test_audit_chain_detects_tampering(setup):
    c, store = setup
    c.post("/v1/generate", json={"feature": "case_qa", "prompt": "one", "prompt_version": "test@1"})
    c.post("/v1/generate", json={"feature": "case_qa", "prompt": "two", "prompt_version": "test@1"})
    assert store.verify_chain()
    store.db.execute("UPDATE audit SET actor='someone-else' WHERE seq=1")
    assert not store.verify_chain()


def test_fake_provider_works_offline():
    store = Store(":memory:")
    c = client(store, {"claude": ClaudeProvider(""), "gemini": GeminiProvider(""), "fake": FakeProvider()})
    c.put("/v1/settings/victim_update", json={"provider": "fake"})
    r = c.post("/v1/generate", json={"feature": "victim_update", "prompt": "Progress so far", "prompt_version": "test@1"})
    assert r.status_code == 200 and r.json()["draft"].startswith("[demo draft]")


def test_every_call_needs_a_valid_login_token():
    store = Store(":memory:")
    app = create_app(store, {"fake": FakeProvider()}, SECRET)
    bad = [None, "Basic abc", "Bearer not.a.token", "Bearer " + token(secret="another-secret-another-secret-xx"),
           "Bearer " + token(exp_in=-5), "Bearer " + token(alg="none"), "Bearer " + token(sub="")]
    for h in bad:
        c = TestClient(app, headers={"Authorization": h} if h else {})
        assert c.get("/v1/settings").status_code == 401, h
        assert c.post("/v1/generate", json={"feature": "case_qa", "prompt": "x", "prompt_version": "test@1"}).status_code == 401, h
    assert store.audit_rows() == []
    assert TestClient(app).get("/health").status_code == 200
    with pytest.raises(RuntimeError):
        create_app(Store(":memory:"), {"fake": FakeProvider()}, "too-short")


def test_officer_cannot_change_settings_or_read_audit_and_actor_comes_from_token():
    store = Store(":memory:")
    store.set_setting("case_qa", "fake", None, True, "user-admin")
    officer = client(store, {"fake": FakeProvider()}, role="io", sub="user-io-7")
    assert officer.put("/v1/settings/case_qa", json={"provider": "fake"}).status_code == 403
    assert officer.get("/v1/audit").status_code == 403
    assert officer.get("/v1/settings").status_code == 200
    r = officer.post("/v1/generate", json={"feature": "case_qa", "prompt": "x", "prompt_version": "test@1", "actor": "someone-else"})
    assert r.status_code == 200
    officer.post("/v1/decisions", json={"request_id": r.json()["request_id"], "decision": "rejected", "feature": "case_qa", "actor": "x"})
    rows = store.audit_rows()
    assert [(row["action"], row["actor"]) for row in rows[:2]] == [("rejected", "user-io-7"), ("ai_request", "user-io-7")]


def test_prompt_version_is_required_and_logged_with_a_hash_not_the_text(setup):
    c, store = setup
    assert c.post("/v1/generate", json={"feature": "case_qa", "prompt": "x"}).status_code == 422
    assert c.post("/v1/generate", json={"feature": "case_qa", "prompt": "x", "prompt_version": "bad version!"}).status_code == 422
    r = c.post("/v1/generate", json={"feature": "case_qa", "prompt": "Who is witness W1?", "prompt_version": "case_qa/ask@2"})
    assert r.status_code == 200
    d = store.audit_rows()[0]["detail"]
    assert d["prompt_version"] == "case_qa/ask@2" and d["safety_version"].startswith("safety-")
    assert len(d["prompt_sha256"]) == 64 and "Who is witness" not in json.dumps(store.audit_rows())
