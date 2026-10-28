"""Checks every playbook in packs/*/playbooks is well formed. Stdlib only."""
import json
import pathlib
import re

import pytest

ROOT = pathlib.Path(__file__).parents[1]
PLAYBOOKS = sorted(ROOT.glob("*/playbooks/*.json"))
ID = re.compile(r"^[a-z][a-z0-9_]*$|^[a-z][a-z0-9-]*$")
NOTICE_KINDS = {"BNSS_94", "BNSS_35_3", "BNSS_179", "follow_up"}  # must match V1__core.sql
SEVERITIES = {"critical", "high", "medium"}


def test_there_is_at_least_one_playbook():
    assert PLAYBOOKS


@pytest.mark.parametrize("path", PLAYBOOKS, ids=lambda p: p.name)
def test_playbook_shape(path):
    pb = json.loads(path.read_text(encoding="utf-8"))
    for key in ("id", "version", "status", "charges", "rules", "tasks"):
        assert key in pb, key
    assert pb["status"] in {"draft", "approved", "retired"}
    if pb["status"] == "draft":
        assert pb.get("review_note"), "draft playbooks must say who must review them"
    seen = set()
    for ch in pb["charges"]:
        assert ID.match(ch["id"]) and ch["id"] not in seen
        seen.add(ch["id"])
        assert re.match(r"^(BNS|IT Act|NDPS Act|POCSO Act|BNSS|BSA) ", ch["law"]), ch["law"]
        assert ch["ingredients"], ch["id"]
        ing_ids = [i["id"] for i in ch["ingredients"]]
        assert len(ing_ids) == len(set(ing_ids))
        for ing in ch["ingredients"]:
            assert ing["text"] and ing["proof"]
    rule_ids = [r["id"] for r in pb["rules"]]
    assert len(rule_ids) == len(set(rule_ids))
    for r in pb["rules"]:
        assert r["severity"] in SEVERITIES and r["text"]
    task_ids = [t["id"] for t in pb["tasks"]]
    assert len(task_ids) == len(set(task_ids))
    for t in pb["tasks"]:
        if "notice_kind" in t:
            assert t["notice_kind"] in NOTICE_KINDS


def test_no_ai_judgement_words():
    """Playbooks guide evidence collection; they must never score guilt or credibility."""
    banned = re.compile(r"\b(guilty|credib\w*|truthful|liar|probability of guilt|risk score)\b", re.I)
    for path in PLAYBOOKS:
        assert not banned.search(path.read_text(encoding="utf-8")), path.name


def test_punishment_tables_use_known_classes():
    classes = {"death", "life", "10_years_or_more", "less_than_10_years"}  # must match V1__core.sql
    for path in ROOT.glob("*/punishments.json"):
        t = json.loads(path.read_text(encoding="utf-8"))
        assert t["status"] != "draft" or t.get("review_note"), "draft tables must say who reviews them"
        assert t["sections"] and set(t["sections"].values()) <= classes
        assert not set(t["sections"]) & set(t.get("no_penalty_of_their_own", []))
