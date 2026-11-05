"""V45: court events and witness summons are kept as written and checked. All data is fictional."""
import psycopg
import pytest

from test_schema import db, one, seed_case  # noqa: F401  (db is the fixture)

EVENT = "INSERT INTO court_event(fir_id,kind,on_date,court,case_no,recorded_by) VALUES (%s,%s,'2026-12-18',%s,%s,%s) RETURNING id"
SUMMONS = "INSERT INTO court_summons(fir_id,witness,role,status,on_date,recorded_by) VALUES (%s,%s,'Seizure witness',%s,'2026-12-01',%s) RETURNING id"


def test_rows_are_kept_as_written(db):
    st, io, fir = seed_case(db)
    e = one(db, EVENT, fir, "charge_framing", "Fictional Court 4", "CC 1/2026", io)[0]
    s = one(db, SUMMONS, fir, "Fictional Witness", "sent", io)[0]
    for sql, args in (("UPDATE court_event SET kind='other' WHERE id=%s", (e,)), ("DELETE FROM court_event WHERE id=%s", (e,)),
                      ("UPDATE court_summons SET status='served' WHERE id=%s", (s,)), ("DELETE FROM court_summons WHERE id=%s", (s,))):
        with pytest.raises(psycopg.errors.RaiseException):
            db.execute(sql, args)


def test_kinds_statuses_and_texts_are_checked(db):
    st, io, fir = seed_case(db)
    for kind in ("chargesheet_filed", "cognizance", "copies_given", "charge_framing", "prosecution_evidence", "arguments", "judgment", "other"):
        one(db, EVENT, fir, kind, None, None, io)
    for status in ("sent", "served", "not_served", "appeared", "excused"):
        one(db, SUMMONS, fir, "Fictional Witness", status, io)
    with pytest.raises(psycopg.errors.CheckViolation):
        db.execute(EVENT, (fir, "verdict", None, None, io))
    with pytest.raises(psycopg.errors.CheckViolation):
        db.execute(EVENT, (fir, "other", " x ", None, io))
    with pytest.raises(psycopg.errors.CheckViolation):
        db.execute(SUMMONS, (fir, "Fictional Witness", "lost", io))
    with pytest.raises(psycopg.errors.CheckViolation):
        db.execute(SUMMONS, (fir, " x ", "sent", io))
