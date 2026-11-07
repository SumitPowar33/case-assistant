"""V49: acid-attack survivors are protected like sexual-offence victims (decision 4 of 2 Nov 2026). All data is fictional."""
import psycopg
import pytest

from test_schema import add_section, db, one, seed_case  # noqa: F401  (db is the fixture)


@pytest.mark.parametrize("act,section,protected", [
    ("BNS", "63", False), ("BNS", "64(1)", True), ("BNS", "71", True), ("BNS", "72", False),
    ("BNS", "123", False), ("BNS", "124(1)", True), ("BNS", "124(2)", True), ("BNS", "125", False),
    ("IPC", "326", False), ("IPC", "326A", True), ("IPC", "326 B", True), ("IPC", "326-a", True),
    ("IPC", "326AB", False), ("IPC", "3260", False), ("IPC", "375", False), ("IPC", "376(1)", True), ("IPC", "377", False),
    ("BNS", "326A", False), ("POCSO Act", "12", True),
])
def test_the_sections_that_protect_the_victim(db, act, section, protected):
    st, io, fir = seed_case(db)
    db.execute("INSERT INTO person(fir_id,role,label,full_name,phone) VALUES (%s,'victim','V1','Fictional Survivor','9000000000')", (fir,))
    add_section(db, fir, act, section)
    assert one(db, "SELECT identity_protected_case(%s)", fir)[0] is protected
    name, phone = one(db, "SELECT display_name, phone FROM person_public WHERE fir_id=%s", fir)
    assert (name, phone) == (("Victim V1", None) if protected else ("Fictional Survivor", "9000000000"))


def test_an_acid_attack_is_masked_but_does_not_start_the_two_month_limit(db):
    st, io, fir = seed_case(db)
    add_section(db, fir, "BNS", "124(1)")
    assert one(db, "SELECT identity_protected_case(%s), bnss_193_2_applies(%s)", fir, fir) == (True, False)
    assert "sexual_offence_investigation" not in [r[0] for r in db.execute("SELECT kind FROM case_deadline WHERE fir_id=%s", (fir,))]


def test_the_fir_flag_protects_before_any_section_and_is_never_removed(db):
    st, io, fir = seed_case(db)
    db.execute("INSERT INTO person(fir_id,role,label,full_name) VALUES (%s,'complainant','C1','Fictional Parent'), (%s,'witness','W1','Fictional Witness')", (fir, fir))
    assert one(db, "SELECT identity_protected_case(%s)", fir)[0] is False
    db.execute("UPDATE fir SET identity_protected = true WHERE id=%s", (fir,))
    assert one(db, "SELECT identity_protected_case(%s), bnss_193_2_applies(%s)", fir, fir) == (True, False)
    rows = dict(db.execute("SELECT label, display_name FROM person_public WHERE fir_id=%s", (fir,)).fetchall())
    assert rows == {"C1": "Complainant C1", "W1": "Fictional Witness"}
    db.execute("UPDATE fir SET identity_protected = true WHERE id=%s", (fir,))   # setting it again is fine
    db.execute("UPDATE fir SET io_id = io_id WHERE id=%s", (fir,))               # other columns still change
    with pytest.raises(psycopg.errors.RaiseException):
        db.execute("UPDATE fir SET identity_protected = false WHERE id=%s", (fir,))
    assert one(db, "SELECT identity_protected FROM fir WHERE id=%s", fir)[0] is True


def test_an_unprotected_fir_may_stay_unprotected(db):
    st, io, fir = seed_case(db)
    db.execute("UPDATE fir SET identity_protected = false WHERE id=%s", (fir,))
    assert one(db, "SELECT identity_protected_case(%s)", fir)[0] is False
