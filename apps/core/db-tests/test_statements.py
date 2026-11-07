"""V40: statements under BNSS 180, checked straight in the database. All data is fictional."""
import psycopg
import pytest

from test_schema import db, one, seed_case  # noqa: F401  (db is the fixture)

REFUSED = (psycopg.errors.RaiseException, psycopg.errors.CheckViolation)


def _person(db, fir, role, label):
    return one(db, "INSERT INTO person(fir_id,role,label,full_name) VALUES (%s,%s,%s,'Fictional Person') RETURNING id", fir, role, label)[0]


def test_only_a_complainant_victim_or_witness_of_the_same_case_gives_a_statement(db):
    st, io, fir = seed_case(db)
    other_fir = one(db, """INSERT INTO fir(station_id,fir_year,fir_no,gd_entry_no,registered_at,information_received_at,contents_original,contents_language,action_taken,io_id)
                          VALUES (%s,2026,215,'GD-18','2026-08-19 11:00+05:30','2026-08-19 10:30+05:30','Demo text','mr','investigate',%s) RETURNING id""", st, io)[0]
    sql = "INSERT INTO witness_statement(fir_id,person_id,recorded_by,language,medium,original_text) VALUES (%s,%s,%s,'mr','written','Fictional words as said')"
    for role, label in (("complainant", "C1"), ("victim", "V1"), ("witness", "W1")):
        db.execute(sql, (fir, _person(db, fir, role, label), io))
    with pytest.raises(REFUSED):   # an accused's statement to the police is not recorded here
        db.execute(sql, (fir, _person(db, fir, "accused", "A1"), io))
    with pytest.raises(REFUSED):   # a witness of another case
        db.execute(sql, (fir, _person(db, other_fir, "witness", "W1"), io))


def test_a_statement_is_checked_and_kept_as_said(db):
    st, io, fir = seed_case(db)
    w = _person(db, fir, "witness", "W1")
    base = "INSERT INTO witness_statement(fir_id,person_id,recorded_by,language,medium,original_text) VALUES (%s,%s,%s,%s,%s,%s)"
    for lang, medium, text in (("Marathi", "written", "Fictional words"), ("mr", "phone", "Fictional words"), ("mr", "written", " a "), ("mr", "written", "x" * 20001)):
        with pytest.raises(REFUSED):
            db.execute(base, (fir, w, io, lang, medium, text))
    s = one(db, base + " RETURNING id", fir, w, io, "mr", "audio", "Fictional words as said")[0]
    with pytest.raises(REFUSED):
        db.execute("UPDATE witness_statement SET original_text='quietly changed' WHERE id=%s", (s,))
    with pytest.raises(REFUSED):
        db.execute("DELETE FROM witness_statement WHERE id=%s", (s,))
