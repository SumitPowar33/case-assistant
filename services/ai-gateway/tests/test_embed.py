"""POST /v1/embed (item 17): vectors made on the state's own server for pieces of one case and for a question."""
import math
import os

os.environ["AI_GATEWAY_AUTOSTART"] = "0"

import pytest
from fastapi.testclient import TestClient

from app import main as gateway_main
from app.embedder import EmbedderError, FakeEmbedder, LocalEmbedder, from_env
from app.main import create_app
from app.store import Store
from test_gateway import (CASE, NOT_MINE, PROTECTED, SECRET, core_says_active, token,  # noqa: F401
                          no_core_for_the_case_check, no_core_for_the_chain_head)


def client(embedder=None, sub="io-1", role="state_admin"):
    store = Store(":memory:")
    app = create_app(store, {}, SECRET, core_says_active, embedder=embedder or FakeEmbedder())
    return TestClient(app, headers={"Authorization": "Bearer " + token(sub, role)}), store


def cos(a, b):
    return sum(x * y for x, y in zip(a, b))


def test_vectors_are_unit_length_and_deterministic():
    c, store = client()
    body = {"case_ref": CASE, "texts": ["The caller asked for an OTP.", "The caller asked for an OTP."]}
    r = c.post("/v1/embed", json=body)
    assert r.status_code == 200
    out = r.json()
    assert out["model"] == "fake-hash-256" and out["dim"] == 256 and out["min_similarity"] == 0.25 and len(out["vectors"]) == 2
    assert out["vectors"][0] == out["vectors"][1]
    assert math.isclose(cos(out["vectors"][0], out["vectors"][0]), 1.0, rel_tol=1e-9)
    assert c.post("/v1/embed", json=body).json() == out


def test_shared_words_are_closer_than_unrelated_ones():
    v = FakeEmbedder().embed(["transfer of money to the account", "money was transferred to an account", "the weather in the hills"])
    assert cos(v[0], v[1]) > 0.3 > cos(v[0], v[2])


def test_the_vector_equals_the_one_the_web_tests_stand_in_use():
    # apps/web/src/askFile.eval.test.ts has the same text and the same numbers
    v = FakeEmbedder().embed(['The caller asked for the code; money went out of the bank account XXXX4471. मी बँकेत रोखपाल आहे.'])[0]
    assert [[i, round(x, 6)] for i, x in enumerate(v) if x] == [[16, 0.267261], [22, -0.267261], [46, 0.267261], [55, 0.267261], [68, -0.267261], [70, -0.267261], [91, 0.267261], [137, -0.133631], [159, 0.267261], [170, 0.267261], [176, -0.133631], [181, 0.267261], [196, 0.267261], [202, -0.267261], [213, 0.133631], [236, -0.133631], [255, 0.267261]]


def test_works_in_an_indian_script_and_an_empty_text_has_a_zero_vector():
    v = FakeEmbedder().embed(["आरोपीने पैसे पाठवले", "पैसे पाठवले गेले", "   "])
    assert cos(v[0], v[1]) > 0.3 and all(x == 0 for x in v[2])


def test_each_call_is_logged_with_a_hash_and_no_text():
    c, store = client()
    c.post("/v1/embed", json={"case_ref": CASE, "texts": ["Secret fictional text"], "kind": "query"})
    row = store.audit_rows(1)[0]
    assert row["action"] == "ai_embed" and row["feature"] == "embed" and row["case_ref"] == CASE
    assert row["detail"]["texts"] == 1 and row["detail"]["kind"] == "query" and len(row["detail"]["texts_sha256"]) == 64
    assert "Secret" not in str(row)
    assert store.verify_chain()


def test_does_not_count_as_a_draft():
    c, store = client()
    c.post("/v1/embed", json={"case_ref": CASE, "texts": ["a b"]})
    assert store.drafts_since("io-1", 600) == 0


def test_a_protected_case_is_allowed_because_nothing_leaves_the_server():
    c, _ = client()
    assert c.post("/v1/embed", json={"case_ref": PROTECTED, "texts": ["a piece"]}).status_code == 200


def test_refusals_are_logged():
    c, store = client()
    for body, status in [({"case_ref": NOT_MINE, "texts": ["x y"]}, 404), ({"case_ref": "not-a-uuid", "texts": ["x y"]}, 422),
                         ({"case_ref": CASE, "texts": ["x" * 2001]}, 422), ({"case_ref": CASE, "texts": ["  "]}, 422)]:
        assert c.post("/v1/embed", json=body).status_code == status
    assert [r["action"] for r in store.audit_rows(4)] == ["ai_refused"] * 4


def test_bad_bodies_are_not_accepted():
    c, _ = client()
    for body in [{"case_ref": CASE, "texts": []}, {"case_ref": CASE, "texts": ["a"] * 65}, {"case_ref": CASE, "texts": ["a"], "kind": "other"},
                 {"case_ref": CASE, "texts": ["a"], "system": "own rules"}, {"texts": ["a"]}]:
        assert c.post("/v1/embed", json=body).status_code == 422


def test_needs_sign_in():
    c, _ = client()
    assert TestClient(c.app).post("/v1/embed", json={"case_ref": CASE, "texts": ["a"]}).status_code == 401


def test_a_burst_is_slowed(monkeypatch):
    monkeypatch.setattr(gateway_main, "EMBEDS_PER_WINDOW", 2)
    c, _ = client()
    codes = [c.post("/v1/embed", json={"case_ref": CASE, "texts": ["a b"]}).status_code for _ in range(3)]
    assert codes == [200, 200, 429]


def test_the_limit_is_per_officer():
    from app.main import DraftLimit
    lim = DraftLimit(2, 600)
    assert [lim.wait("a"), lim.wait("a"), lim.wait("b")][:2] == [0, 0] and lim.wait("a") > 0 and lim.wait("b") == 0


class Broken:
    name = "broken"
    min_similarity = 1.0

    def embed(self, texts, kind="passage"):
        raise EmbedderError("the embedding model broken is not installed on this server")


def test_a_model_that_is_not_installed_gives_503_and_is_logged():
    c, store = client(Broken())
    r = c.post("/v1/embed", json={"case_ref": CASE, "texts": ["a b"]})
    assert r.status_code == 503 and "not installed" in r.json()["detail"]
    assert store.audit_rows(1)[0]["action"] == "ai_refused"


def test_the_local_model_without_its_package_says_so(monkeypatch):
    monkeypatch.setitem(__import__("sys").modules, "sentence_transformers", None)   # import fails
    with pytest.raises(EmbedderError, match="not installed"):
        LocalEmbedder("some/model").embed(["a"])


def test_the_local_model_prefixes_and_normalises(monkeypatch):
    seen = []

    class Model:
        def __init__(self, name, local_files_only):
            seen.append((name, local_files_only))

        def encode(self, texts, normalize_embeddings):
            seen.append((texts, normalize_embeddings))
            return [[0.6, 0.8] for _ in texts]

    import types, sys
    monkeypatch.setitem(sys.modules, "sentence_transformers", types.SimpleNamespace(SentenceTransformer=Model))
    e = LocalEmbedder("some/model")
    assert e.min_similarity == 0.8
    assert e.embed(["one"], "query") == [[0.6, 0.8]] and e.embed(["two"]) == [[0.6, 0.8]] and e.dim == 2
    assert seen[0] == ("some/model", True) and seen[1] == (["query: one"], True) and seen[2] == (["passage: two"], True)


def test_the_backend_is_chosen_by_the_environment(monkeypatch):
    monkeypatch.setenv("EMBED_BACKEND", "fake")
    assert isinstance(from_env(), FakeEmbedder)
    monkeypatch.setenv("EMBED_BACKEND", "local")
    monkeypatch.setenv("EMBED_MODEL", "x/y")
    assert from_env().name == "x/y"
