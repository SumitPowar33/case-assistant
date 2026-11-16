"""GET /v1/ai-use and /v1/ai-use/summary (A9, board 20): what the AI was asked and what people did with it, from the log."""
import os

os.environ["AI_GATEWAY_AUTOSTART"] = "0"

import pytest
from fastapi.testclient import TestClient

from app.embedder import FakeEmbedder
from app.main import create_app
from app.providers import FakeProvider
from app.store import Store
from test_gateway import (CASE, NOT_MINE, SECRET, core_says_active, token,  # noqa: F401
                          no_core_for_the_case_check, no_core_for_the_chain_head)


def make(role="state_admin", sub="io-1", check=core_says_active):
    store = Store(":memory:")
    app = create_app(store, {"fake": FakeProvider()}, SECRET, check, embedder=FakeEmbedder())
    return TestClient(app, headers={"Authorization": "Bearer " + token(sub, role)}), store


def draft(c, feature="case_qa", case=CASE, prompt="What does the statement say?"):
    return c.post("/v1/generate", json={"feature": feature, "case_ref": case, "prompt": prompt, "prompt_version": "v1", "provider": "fake"})


def test_counts_per_feature_for_one_case_and_the_newest_events():
    c, store = make()
    c.put("/v1/settings/case_qa", json={"provider": "fake", "officer_may_switch": True})
    ids = [draft(c).json()["request_id"] for _ in range(3)]
    for rid, d in zip(ids, ["accepted", "edited", "rejected"]):
        assert c.post("/v1/decisions", json={"request_id": rid, "decision": d, "feature": "case_qa", "case_ref": CASE, "note": "Secret fictional note"}).status_code == 200
    assert draft(c, prompt="Is he guilty?").status_code == 422
    c.post("/v1/embed", json={"case_ref": CASE, "texts": ["a", "b"]})
    draft(c, case="0f6c1c9a-1111-4a2b-9c3d-0000000000aa", prompt="Another case")   # another case: not counted here
    out = c.get("/v1/ai-use", params={"case_ref": CASE}).json()
    assert out["case_ref"] == CASE
    assert out["features"] == [
        {"feature": "case_qa", "label": "Answer questions about the case file", "asked": 3, "accepted": 1, "edited": 1, "rejected": 1,
         "refused": 1, "failed": 0, "embedded": 0},
        {"feature": "embed", "label": "Search the case file by meaning", "asked": 0, "accepted": 0, "edited": 0, "rejected": 0,
         "refused": 0, "failed": 0, "embedded": 1}]
    assert [e["action"] for e in out["events"]] == ["ai_refused", "rejected", "edited", "accepted", "ai_request", "ai_request", "ai_request"]
    assert all(set(e) == {"at", "feature", "label", "action"} for e in out["events"])
    assert "Secret fictional" not in str(out) and "guilty" not in str(out)


def test_an_empty_case_has_no_rows():
    c, _ = make()
    assert c.get("/v1/ai-use", params={"case_ref": CASE}).json() == {"case_ref": CASE, "features": [], "events": []}


def test_only_the_case_team_and_a_real_id():
    c, _ = make()
    assert c.get("/v1/ai-use", params={"case_ref": NOT_MINE}).status_code == 404
    assert c.get("/v1/ai-use", params={"case_ref": "not-an-id"}).status_code == 422
    assert c.get("/v1/ai-use").status_code == 422
    assert TestClient(c.app).get("/v1/ai-use", params={"case_ref": CASE}).status_code == 401


def test_a_core_that_cannot_be_reached_gives_503(monkeypatch):
    from app import main as gateway_main

    class Down:
        def __init__(self, *a, **k): pass
        def __call__(self, token, fir_id): raise gateway_main.CoreUnavailable("core is down")
    monkeypatch.setattr(gateway_main, "CaseCheck", Down)
    c, _ = make()
    assert c.get("/v1/ai-use", params={"case_ref": CASE}).status_code == 503


def test_the_summary_is_for_the_users_state_only_and_needs_the_audit_permission():
    store = Store(":memory:")
    store.log("u1", "ai_request", "case_qa", CASE, {"request_id": "r1"}, "MH")
    store.log("u2", "ai_request", "case_qa", CASE, {"request_id": "r2"}, "KA")
    store.log("u1", "rejected", "case_qa", CASE, {"request_id": "r1"}, "MH")
    mh = lambda tok, sub: {**core_says_active(tok, sub), "state_code": "MH"}
    app = create_app(store, {}, SECRET, mh, embedder=FakeEmbedder())
    sho = TestClient(app, headers={"Authorization": "Bearer " + token("s1", "sho")})
    out = sho.get("/v1/ai-use/summary").json()
    assert out["days"] == 30 and [(f["feature"], f["asked"], f["rejected"]) for f in out["features"]] == [("case_qa", 1, 1)]
    assert set(out) == {"days", "features"}
    assert sho.get("/v1/ai-use/summary?days=0").json()["days"] == 1
    assert sho.get("/v1/ai-use/summary?days=99999").json()["days"] == 366
    io = TestClient(app, headers={"Authorization": "Bearer " + token("i1", "io")})
    assert io.get("/v1/ai-use/summary").status_code == 403


def test_rows_older_than_the_window_are_not_counted():
    store = Store(":memory:")
    store.log("u1", "ai_request", "case_qa", CASE, {"request_id": "r1"}, "MH")
    store.db.execute("UPDATE audit SET at = '2020-01-01T00:00:00+00:00'")
    assert store.ai_use(None, "MH", "2026-01-01T00:00:00+00:00") == []
    assert store.ai_use(None, "MH")[0]["asked"] == 1
