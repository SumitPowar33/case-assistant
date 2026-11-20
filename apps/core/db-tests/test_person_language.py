"""V62: the language a person reads is optional and one of the app's eleven codes. All data is fictional."""
import psycopg
import pytest

from test_schema import db, one, seed_case  # noqa: F401  (db is the fixture)

CODES = ["en", "hi", "mr", "bn", "pa", "gu", "or", "ta", "te", "kn", "ml"]


def test_a_person_may_have_no_language(db):
    st, io, fir = seed_case(db)
    pid = one(db, "INSERT INTO person(fir_id,role,label,full_name) VALUES (%s,'victim','V1','Fictional Victim') RETURNING id", fir)[0]
    assert one(db, "SELECT language FROM person WHERE id=%s", pid)[0] is None


@pytest.mark.parametrize("code", CODES)
def test_each_app_language_is_accepted(db, code):
    st, io, fir = seed_case(db)
    pid = one(db, "INSERT INTO person(fir_id,role,label,full_name,language) VALUES (%s,'victim','V1','Fictional Victim',%s) RETURNING id", fir, code)[0]
    assert one(db, "SELECT language FROM person WHERE id=%s", pid)[0] == code


@pytest.mark.parametrize("bad", ["", "EN", "english", "xx"])
def test_any_other_value_is_refused(db, bad):
    st, io, fir = seed_case(db)
    with pytest.raises(psycopg.errors.CheckViolation):
        db.execute("INSERT INTO person(fir_id,role,label,full_name,language) VALUES (%s,'victim','V1','Fictional Victim',%s)", (fir, bad))
