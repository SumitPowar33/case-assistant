"""GET /v1/ai-events (board 20): the AI drafts and decisions on a station's cases, with who and which model, for those
who audit the station; the core app says which cases those are. Never any text."""
import os

os.environ["AI_GATEWAY_AUTOSTART"] = "0"

import httpx
import pytest
from fastapi.testclient import TestClient

from app.auth import CaseNotOpen, CoreUnavailable, NotAuditor, StationCases
from app.embedder import FakeEmbedder
from app.main import create_app
from app.providers import FakeProvider
from app.store import Store
from test_gateway import (CASE, SECRET, core_says_active, token,  # noqa: F401
                          no_core_for_the_case_check, no_core_for_the_chain_head)

STATION = "0f6c1c9a-2222-4a2b-9c3d-000000000001"
OTHER_CASE = "0f6c1c9a-1111-4a2b-9c3d-0000000000bb"


def make(role="sho", sub="sho-1", cases=lambda tok, station, fir=None: [CASE]):
    store = Store(":memory:", "fictional-audit-key")
    asked = []

    def station_cases(tok, station, fir=None):
        asked.append((tok, station, fir))
        return cases(tok, station, fir)

    app = create_app(store, {"fake": FakeProvider()}, SECRET, core_says_active, embedder=FakeEmbedder(), station_cases=station_cases)
    return TestClient(app, headers={"Authorization": "Bearer " + token(sub, role)}), store, asked


def events(c, **params):
    return c.get("/v1/ai-events", params={"station_id": STATION, **params})


def test_the_entries_of_the_stations_cases_newest_first_with_who_and_which_model_and_no_text():
    c, store, asked = make()
    store.log("io-1", "ai_request", "case_qa", CASE, {"request_id": "r1", "provider": "fake", "model": "fake-1", "prompt_sha256": "abc"}, "MH")
    store.log("io-1", "rejected", "case_qa", CASE, {"request_id": "r1", "note": "Secret fictional note"}, "MH")
    store.log("io-1", "ai_embed", "embed", CASE, {"model": "fake-embed"}, "MH")
    store.log("io-1", "ai_transcribe", "reply_scan", CASE.upper(), {"request_id": "r2", "model": "fake-ocr"}, "MH")
    store.log("io-9", "ai_refused", "case_qa", CASE, {"status": 422, "reason": "Secret fictional message", "question_refused": "guilt"}, "MH")
    store.log("io-2", "ai_request", "case_qa", OTHER_CASE, {"request_id": "r3"}, "MH")   # a case of another station
    store.log("u-1", "ai_request", "law_explain", None, {"request_id": "r4"}, "MH")       # no case
    out = events(c).json()["events"]
    assert [(e["actor"], e["result"], e["feature"], e["provider"], e["model"], e["question_refused"]) for e in out] == [
        ("io-9", "refused", "case_qa", None, None, "guilt"),
        ("io-1", "asked", "reply_scan", None, "fake-ocr", None),
        ("io-1", "rejected", "case_qa", None, None, None),
        ("io-1", "asked", "case_qa", "fake", "fake-1", None)]
    assert {e["case_id"] for e in out} == {CASE.lower()}
    assert out[1]["label"] == "Read a scanned reply (OCR on this server)"
    assert set(out[0]) == {"seq", "at", "actor", "result", "feature", "label", "case_id", "provider", "model", "question_refused"}
    assert "Secret fictional" not in str(out) and "abc" not in str(out)
    assert asked[0][1:] == (STATION, None) and asked[0][0].count(".") == 2   # the officer's own token went to the core


def test_narrowed_to_a_result_or_a_case_and_a_page_at_a_time():
    c, store, asked = make()
    for n in range(5):
        store.log("io-1", "ai_request", "case_qa", CASE, {"request_id": f"r{n}"}, "MH")
        store.log("io-1", "accepted", "case_qa", CASE, {"request_id": f"r{n}"}, "MH")
    store.log("io-1", "ai_error", "case_qa", CASE, {"request_id": "e", "provider": "fake", "model": "fake-1", "error": "Fictional boom"}, "MH")
    assert [e["result"] for e in events(c, result="accepted").json()["events"]] == ["accepted"] * 5
    assert [e["result"] for e in events(c, result="failed").json()["events"]] == ["failed"]
    assert events(c, result="edited").json() == {"events": []}
    first, second = events(c, limit=4).json()["events"], events(c, limit=4, offset=4).json()["events"]
    assert len(first) == len(second) == 4 and first[-1]["seq"] > second[0]["seq"]
    assert len(events(c, limit=0, offset=-3).json()["events"]) == 1
    assert len(events(c, limit=999).json()["events"]) == 11
    events(c, fir_id=CASE)
    assert asked[-1][1:] == (STATION, CASE)


def test_who_may_ask_and_what_may_be_asked():
    c, _, asked = make(role="io", sub="io-1")
    assert events(c).status_code == 403 and asked == []   # no audit permission: the core is not even asked
    assert TestClient(c.app).get("/v1/ai-events", params={"station_id": STATION}).status_code == 401
    c, _, asked = make()
    assert c.get("/v1/ai-events").status_code == 422
    assert c.get("/v1/ai-events", params={"station_id": "x"}).status_code == 422
    assert events(c, fir_id="x").status_code == 422
    assert events(c, result="embedded").status_code == 422
    assert asked == []


@pytest.mark.parametrize("error, status", [(NotAuditor("not yours"), 403), (CaseNotOpen("no such case"), 404), (CoreUnavailable("core is down"), 503)])
def test_a_station_the_core_does_not_open_gives_nothing(error, status):
    def refuse(*_):
        raise error
    c, store, _ = make(cases=refuse)
    store.log("io-1", "ai_request", "case_qa", CASE, {"request_id": "r1"}, "MH")
    r = events(c)
    assert r.status_code == status and "events" not in r.json()


def test_a_station_without_cases_has_no_entries():
    c, store, _ = make(cases=lambda *_: [])
    store.log("io-1", "ai_request", "case_qa", CASE, {"request_id": "r1"}, "MH")
    assert events(c).json() == {"events": []}


def test_a_feature_that_reads_no_case_is_never_logged_under_one():
    """Regression: law_explain and app_help are open to every officer without a case check, but a case_ref sent with them
    was written to the log, so anyone could add entries to any case's AI use."""
    c, store, _ = make(role="io", sub="io-1")
    c2, _, _ = make()
    c2.put("/v1/settings/law_explain", json={"provider": "fake"})
    admin = TestClient(c.app, headers={"Authorization": "Bearer " + token("a-1", "state_admin")})
    assert admin.put("/v1/settings/law_explain", json={"provider": "fake", "officer_may_switch": True}).status_code == 200
    r = c.post("/v1/generate", json={"feature": "law_explain", "case_ref": CASE, "prompt": "Explain IPC 420", "prompt_version": "v1", "provider": "fake"})
    assert r.status_code == 200
    assert c.post("/v1/generate", json={"feature": "app_help", "case_ref": CASE, "prompt": "How?", "prompt_version": "v1", "provider": "no-such"}).status_code == 422
    assert store.ai_use(CASE) == [] and store.events_of([CASE]) == []
    assert [row["case_ref"] for row in store.audit_rows() if row["feature"] in ("law_explain", "app_help") and row["action"] != "settings_changed"] == [None, None]
    # and the officer's decision on that draft is logged as before, without a case
    assert c.post("/v1/decisions", json={"request_id": r.json()["request_id"], "decision": "accepted", "feature": "law_explain"}).status_code == 200


def test_a_feature_name_the_gateway_does_not_know_is_not_repeated_as_its_label():
    """A refused request may name any "feature" and any case id: its words must not become a line of a court export."""
    c, store, _ = make()
    store.log("x-1", "ai_refused", "Fictional words typed by a caller", CASE, {"status": 404}, "MH")
    assert [(e["result"], e["label"]) for e in events(c).json()["events"]] == [("refused", "Unknown feature")]


def core(status=200, body=None, text=None, boom=False):
    seen = []

    def handler(request):
        seen.append(request)
        if boom:
            raise httpx.ConnectError("down")
        return httpx.Response(status, text=text) if text is not None else httpx.Response(status, json=body)

    return StationCases("http://core:8080/", httpx.Client(transport=httpx.MockTransport(handler))), seen


def test_the_core_is_asked_with_the_officers_token_and_its_answer_is_checked():
    check, seen = core(body=[{"id": CASE.upper(), "kind": "fir"}, {"id": OTHER_CASE, "kind": "complaint"}])
    assert check("tok", STATION) == [CASE.lower(), OTHER_CASE]
    assert str(seen[0].url) == f"http://core:8080/api/audit-log/cases?stationId={STATION}"
    assert seen[0].headers["authorization"] == "Bearer tok"
    check("tok", STATION, CASE)
    assert seen[1].url.params["firId"] == CASE


@pytest.mark.parametrize("kwargs, error", [
    ({"status": 403, "body": {}}, NotAuditor), ({"status": 404, "body": {}}, CaseNotOpen), ({"status": 500, "body": {}}, CoreUnavailable),
    ({"status": 401, "body": {}}, CoreUnavailable), ({"text": "not json"}, CoreUnavailable), ({"body": {"id": CASE}}, CoreUnavailable),
    ({"body": [{"id": 5}]}, CoreUnavailable), ({"body": ["x"]}, CoreUnavailable), ({"boom": True}, CoreUnavailable)])
def test_anything_but_a_clear_list_refuses(kwargs, error):
    check, _ = core(**kwargs)
    with pytest.raises(error):
        check("tok", STATION)
