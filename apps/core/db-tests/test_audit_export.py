"""V72: the export of one case's audit entries is itself kept: who, when, which case and why. It needs a reason of 10 to
500 characters, stays as written, and outlives the FIR it names (an import undo). Fictional data."""
import psycopg
import pytest

from test_schema import db, one, seed_case  # noqa: F401  (db is the fixture)

EXPORT = "INSERT INTO audit_export(exported_by,station_id,fir_id,fir_ref,reason) VALUES (%s,%s,%s,%s,%s) RETURNING id"
WHY = "Fictional court asked for it"


def test_an_export_needs_a_case_number_and_a_reason_of_10_to_500_characters(db):
    st, io, fir = seed_case(db)
    one(db, EXPORT, io, st, fir, "2026/1", WHY)
    one(db, EXPORT, io, st, fir, "2026/1", "x" * 10)
    one(db, EXPORT, io, st, fir, "2026/1", "x" * 500)
    for ref, reason in (("2026/1", "x" * 9), ("2026/1", "         a         "), ("2026/1", "x" * 501), (" ", WHY)):
        with pytest.raises(psycopg.errors.CheckViolation):
            db.execute(EXPORT, (io, st, fir, ref, reason))


def test_an_export_is_kept_as_written(db):
    st, io, fir = seed_case(db)
    x = one(db, EXPORT, io, st, fir, "2026/1", WHY)[0]
    for sql in ("UPDATE audit_export SET reason='Fictional other reason' WHERE id=%s", "DELETE FROM audit_export WHERE id=%s"):
        with pytest.raises(psycopg.errors.RaiseException):
            db.execute(sql, (x,))


def test_the_record_does_not_depend_on_the_fir_still_existing_but_names_a_real_officer_and_station(db):
    st, io, fir = seed_case(db)
    gone = "00000000-0000-4000-8000-000000000001"
    one(db, EXPORT, io, st, gone, "2026/99", WHY)
    with pytest.raises(psycopg.errors.ForeignKeyViolation):
        db.execute(EXPORT, (gone, st, fir, "2026/1", WHY))
    with pytest.raises(psycopg.errors.ForeignKeyViolation):
        db.execute(EXPORT, (io, gone, fir, "2026/1", WHY))
