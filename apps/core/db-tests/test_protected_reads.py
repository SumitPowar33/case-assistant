"""V37: the log of reads of protected victim details is kept as written, survives the FIR it names, and says what was read.
All data below is fictional.
"""
import psycopg
import pytest

from test_schema import db, one, seed_case  # noqa: F401  (db is the fixture)


def _read(db, st, io, fir, what="people", complaint=None):
    return one(db, "INSERT INTO protected_read(reader,station_id,fir_id,fir_ref,complaint_id,what) VALUES (%s,%s,%s,'2026/214',%s,%s) RETURNING id",
               io, st, fir, complaint, what)[0]


def test_a_read_is_kept_as_written(db):
    st, io, fir = seed_case(db, sexual=True)
    row = _read(db, st, io, fir)
    for sql in ("UPDATE protected_read SET at = at - interval '1 day' WHERE id=%s", "UPDATE protected_read SET what='fir_text' WHERE id=%s",
                "DELETE FROM protected_read WHERE id=%s"):
        with pytest.raises(psycopg.errors.RaiseException, match="kept as written"):
            db.execute(sql, (row,))
    assert one(db, "SELECT count(*), min(what) FROM protected_read") == (1, "people")


def test_the_read_stays_when_the_fir_it_names_is_removed(db):
    # an import undo may remove an FIR that was already read: the read must stay, with the FIR number as it was
    st, io, fir = seed_case(db, sexual=True)
    _read(db, st, io, fir)
    db.execute("DELETE FROM fir WHERE id=%s", (fir,))
    assert one(db, "SELECT fir_id, fir_ref FROM protected_read") == (fir, "2026/214")


def test_what_was_read_is_one_of_the_four_and_names_its_record(db):
    st, io, fir = seed_case(db, sexual=True)
    c = one(db, """INSERT INTO complaint(station_id,received_at,mode,informant_name,kind,text_original,text_language,recorded_by)
                   VALUES (%s,now(),'written','Demo Informant','sexual_offence','Demo words','en',%s) RETURNING id""", st, io)[0]
    with pytest.raises(psycopg.errors.CheckViolation):
        _read(db, st, io, fir, what="search")
    with pytest.raises(psycopg.errors.CheckViolation):   # neither an FIR nor a complaint
        _read(db, st, io, None)
    with pytest.raises(psycopg.errors.CheckViolation):   # a complaint read names its complaint
        _read(db, st, io, fir, what="complaint")
    with pytest.raises(psycopg.errors.CheckViolation):   # an FIR read is not a complaint read
        _read(db, st, io, fir, what="people", complaint=c)
    for what in ("people", "fir_text"):
        _read(db, st, io, fir, what=what)
    for what in ("complaint", "complaint_list"):
        _read(db, st, io, None, what=what, complaint=c)
    assert one(db, "SELECT count(*) FROM protected_read")[0] == 4


def test_a_read_needs_a_reader_and_a_station(db):
    st, io, fir = seed_case(db, sexual=True)
    with pytest.raises(psycopg.errors.NotNullViolation):
        _read(db, st, None, fir)
    with pytest.raises(psycopg.errors.NotNullViolation):
        _read(db, None, io, fir)
