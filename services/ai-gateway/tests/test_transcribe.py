"""POST /v1/transcribe (A3, priority 5): a recorded statement written down on the state's own server."""
import hashlib
import os
import sys
import types

os.environ["AI_GATEWAY_AUTOSTART"] = "0"

import pytest
from fastapi.testclient import TestClient

from app import main as gateway_main
from app.main import create_app
from app.store import Store
from app.transcriber import FakeTranscriber, LocalTranscriber, TranscriberError, from_env
from test_gateway import (CASE, NOT_MINE, PROTECTED, SECRET, core_says_active, token,  # noqa: F401
                          no_core_for_the_case_check, no_core_for_the_chain_head)

SPEECH = "मी रात्री नऊ वाजता घरी होतो.".encode()   # the stand-in "hears" a recording whose bytes are text


def client(transcriber=None, sub="io-1", role="state_admin"):
    store = Store(":memory:")
    app = create_app(store, {}, SECRET, core_says_active, transcriber=transcriber or FakeTranscriber())
    return TestClient(app, headers={"Authorization": "Bearer " + token(sub, role)}), store


def post(c, audio=SPEECH, case=CASE, language="mr"):
    return c.post(f"/v1/transcribe?case_ref={case}&language={language}", content=audio, headers={"Content-Type": "application/octet-stream"})


def test_the_recording_is_written_down_as_a_draft_and_logged_without_text():
    c, store = client()
    r = post(c)
    assert r.status_code == 200
    out = r.json()
    assert out["text"] == SPEECH.decode() and out["model"] == "fake-speech" and "listen and correct" in out["label"]
    row = store.audit_rows(1)[0]
    assert row["action"] == "ai_transcribe" and row["feature"] == "statement_transcribe" and row["case_ref"] == CASE
    assert row["detail"]["audio_sha256"] == hashlib.sha256(SPEECH).hexdigest() and row["detail"]["audio_bytes"] == len(SPEECH)
    assert row["detail"]["request_id"] == out["request_id"] and "नऊ" not in str(row)
    assert store.verify_chain()


def test_the_officer_may_decide_on_it_once_and_the_counts_show_it():
    c, store = client()
    rid = post(c).json()["request_id"]
    d = {"request_id": rid, "decision": "edited", "feature": "statement_transcribe", "case_ref": CASE}
    assert c.post("/v1/decisions", json=d).status_code == 200
    assert c.post("/v1/decisions", json=d).status_code == 409
    use = c.get(f"/v1/ai-use?case_ref={CASE}").json()
    assert use["features"] == [{"feature": "statement_transcribe", "label": "Write down a recording (speech model on this server)",
                                "asked": 1, "accepted": 0, "edited": 1, "rejected": 0, "refused": 0, "failed": 0, "embedded": 0}]
    assert [e["action"] for e in use["events"]] == ["edited", "ai_transcribe"]
    assert use["events"][0]["label"].startswith("Write down")


def test_it_is_not_a_draft_for_the_draft_limit():
    c, store = client()
    post(c)
    assert store.drafts_since("io-1", 600) == 0


def test_a_recording_that_is_not_speech_gets_a_notice():
    c, _ = client()
    assert "no speech model heard" in post(c, b"\xff\xfe\x00\x01").json()["text"]


def test_a_protected_case_is_allowed_because_nothing_leaves_the_server():
    c, _ = client()
    assert post(c, case=PROTECTED).status_code == 200


def test_refusals_are_logged():
    c, store = client()
    cases = [(post(c, case=NOT_MINE), 404), (post(c, case="not-a-uuid"), 422), (post(c, language="Marathi"), 422), (post(c, audio=b""), 422)]
    for r, status in cases:
        assert r.status_code == status
    assert [r["action"] for r in store.audit_rows(4)] == ["ai_refused"] * 4


def test_a_too_long_recording_is_refused_by_its_declared_and_by_its_real_size(monkeypatch):
    monkeypatch.setattr(gateway_main, "MAX_AUDIO_BYTES", 10)
    c, store = client()
    assert post(c, audio=b"x" * 11).status_code == 413
    # a body that does not say its length (chunked) is cut off as it is read
    r = c.post(f"/v1/transcribe?case_ref={CASE}", content=iter([b"x" * 6, b"x" * 6]))
    assert r.status_code == 413
    assert [r["action"] for r in store.audit_rows(2)] == ["ai_refused"] * 2


def test_needs_sign_in():
    c, _ = client()
    assert TestClient(c.app).post(f"/v1/transcribe?case_ref={CASE}", content=b"x").status_code == 401


def test_a_burst_is_slowed(monkeypatch):
    monkeypatch.setattr(gateway_main, "TRANSCRIBES_PER_WINDOW", 2)
    c, _ = client()
    assert [post(c).status_code for _ in range(3)] == [200, 200, 429]


class Broken:
    name = "broken"

    def transcribe(self, audio, language):
        raise TranscriberError("the speech model broken is not installed on this server")


def test_a_model_that_is_not_installed_gives_503_and_is_logged():
    c, store = client(Broken())
    r = post(c)
    assert r.status_code == 503 and "not installed" in r.json()["detail"]
    assert store.audit_rows(1)[0]["action"] == "ai_refused"


def test_the_local_model_without_its_package_says_so(monkeypatch):
    monkeypatch.setitem(sys.modules, "faster_whisper", None)
    with pytest.raises(TranscriberError, match="not installed"):
        LocalTranscriber("some/model").transcribe(b"x", "mr")


def test_the_local_model_gets_a_private_file_and_joins_the_segments(monkeypatch):
    seen = []

    class Model:
        def __init__(self, name, device, compute_type, local_files_only):
            seen.append((name, device, compute_type, local_files_only))

        def transcribe(self, path, language):
            seen.append((open(path, "rb").read(), language))
            return [types.SimpleNamespace(text=" एक "), types.SimpleNamespace(text="दोन ")], None

    monkeypatch.setitem(sys.modules, "faster_whisper", types.SimpleNamespace(WhisperModel=Model))
    t = LocalTranscriber("some/model")
    assert t.transcribe(b"abc", "hi") == "एक दोन" and t.transcribe(b"d", None) == "एक दोन"
    assert seen[0] == ("some/model", "cpu", "int8", True) and seen[1] == (b"abc", "hi") and seen[2] == (b"d", None)


def test_a_recording_the_model_cannot_decode_is_a_clear_error(monkeypatch):
    class Model:
        def __init__(self, *a, **k):
            pass

        def transcribe(self, path, language):
            raise ValueError("bad file")

    monkeypatch.setitem(sys.modules, "faster_whisper", types.SimpleNamespace(WhisperModel=Model))
    with pytest.raises(TranscriberError, match="could not be read"):
        LocalTranscriber("m").transcribe(b"x", None)


def test_the_backend_is_chosen_by_the_environment(monkeypatch):
    monkeypatch.setenv("TRANSCRIBE_BACKEND", "fake")
    assert isinstance(from_env(), FakeTranscriber)
    monkeypatch.setenv("TRANSCRIBE_BACKEND", "local")
    monkeypatch.setenv("TRANSCRIBE_MODEL", "x/y")
    assert from_env().name == "x/y"
