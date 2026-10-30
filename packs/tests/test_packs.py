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


def test_roles_files_use_declared_permissions_and_valid_scopes():
    files = sorted(ROOT.glob("*/roles.json"))
    assert files
    declared = set()
    for path in files:
        declared |= set(json.loads(path.read_text(encoding="utf-8"))["permissions"])
    for path in files:
        data = json.loads(path.read_text(encoding="utf-8"))
        for code, role in data["roles"].items():
            assert re.fullmatch(r"[a-z][a-z_]{1,29}", code), code
            assert role["case_scope"] in {"none", "station", "district"}, code
            assert isinstance(role["station_required"], bool) and role["label"]
            assert set(role["permissions"]) <= declared, code


def test_policies_have_a_default_inside_their_bounds():
    for path in ROOT.glob("*/policies.json"):
        data = json.loads(path.read_text(encoding="utf-8"))
        assert data["policies"]
        for key, p in data["policies"].items():
            assert re.fullmatch(r"[a-z][a-z_.]{1,59}", key), key
            assert p["label"] and p["min"] <= p["default"] <= p["max"], key


IMPORT_FIELDS = {  # must match what FirImport.check, ArrestImport.check and ChargesheetImport.check read
    "fir": {"fir_no", "fir_year", "registered_at", "information_received_at", "gd_entry_no", "sections", "complaint_text",
            "io_username", "complainant_name", "victim_names", "accused_names", "witness_names", "status", "zero_fir",
            "outside_limits_place", "source_key"},
    "arrest": {"fir_no", "fir_year", "accused_name", "accused_label", "arrested_at", "place", "grounds", "informed_name",
               "informed_contact", "arresting_officer", "first_remand_on", "max_punishment", "released_on", "release_basis",
               "source_key"},
    "chargesheet": {"fir_no", "fir_year", "report_no", "filed_on", "court", "accused_names", "source_key"}}
IMPORT_REQUIRED = {"fir": {"fir_no", "registered_at"}, "arrest": {"fir_no", "accused_name", "arrested_at"},
                   "chargesheet": {"fir_no", "report_no", "filed_on", "accused_names"}}


def test_import_profiles_name_known_fields_and_do_not_share_aliases():
    files = sorted(ROOT.glob("*/import-profiles/*.json"))
    assert files
    for path in files:
        p = json.loads(path.read_text(encoding="utf-8"))
        assert p["entity"] in IMPORT_FIELDS and p["id"] == path.stem and p["label"]
        assert set(p["fields"]) <= IMPORT_FIELDS[p["entity"]], path
        assert IMPORT_REQUIRED[p["entity"]] <= {k for k, f in p["fields"].items() if f.get("required")}, "key fields stay required"
        seen = {}
        for field, f in p["fields"].items():
            assert f["aliases"], field
            for alias in f["aliases"]:
                key = re.sub(r"[\s_\-]+", "", alias.lower())
                assert seen.setdefault(key, field) == field, f"alias {alias!r} is used for two fields"


def test_law_concordance_is_a_labelled_draft_hint():
    for path in ROOT.glob("*/law-concordance.json"):
        t = json.loads(path.read_text(encoding="utf-8"))
        assert t["status"] == "draft" and "Advisory" in t["note"]
        assert t["IPC"] and all(re.fullmatch(r"\d+[A-Z]?", k) and re.fullmatch(r"\d+(\(\d+\))?", v) for k, v in t["IPC"].items())


def test_only_supervising_roles_and_the_state_admin_may_load_records():
    roles = json.loads((ROOT / "IN/roles.json").read_text(encoding="utf-8"))["roles"]
    assert {c for c, r in roles.items() if "import.run" in r["permissions"]} == {"sho", "sp", "state_admin"}


PACK_DIRS = sorted(p for p in ROOT.iterdir() if p.is_dir() and p.name not in {"tests", "__pycache__"})


@pytest.mark.parametrize("folder", PACK_DIRS, ids=lambda p: p.name)
def test_every_pack_has_a_module_manifest(folder):
    """packs/{id}/module.json: the same rules the core app checks at start-up (Modules.java)."""
    m = json.loads((folder / "module.json").read_text(encoding="utf-8"))
    assert m["id"] == folder.name and re.fullmatch(r"[A-Z]{2,3}", m["id"])  # must match state_pack.code in V1__core.sql
    assert m["name"].strip() and str(m["version"]).strip()
    assert m["languages"] and all(re.fullmatch(r"[a-z]{2,3}", lang) for lang in m["languages"])
    known = {p.name for p in PACK_DIRS}
    assert set(m.get("depends", [])) <= known - {m["id"]}
    assert m["id"] == "IN" or "IN" in m["depends"], "every module builds on the national module"
    roles = folder / "roles.json"
    if roles.exists():
        assert json.loads(roles.read_text(encoding="utf-8"))["module"] == m["id"]


def test_the_national_module_is_there():
    assert (ROOT / "IN" / "module.json").exists()
