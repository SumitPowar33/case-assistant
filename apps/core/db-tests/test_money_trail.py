"""V42: money transfers and holds are kept as written and tied to the same case, checked straight in the database. All data is fictional."""
import psycopg
import pytest

from test_schema import db, one, seed_case  # noqa: F401  (db is the fixture)

REFUSED = (psycopg.errors.RaiseException, psycopg.errors.CheckViolation, psycopg.errors.ForeignKeyViolation)
TRANSFER = "INSERT INTO money_transfer(fir_id,from_account,to_account,to_person_id,amount_paise,transferred_on,evidence_item_id,recorded_by) VALUES (%s,'Demo A/c XXXX0055','Demo A/c XXXX4471',%s,%s,'2026-08-19',%s,%s) RETURNING id"
HOLD = "INSERT INTO money_hold(fir_id,account,amount_paise,held_on,evidence_item_id,recorded_by) VALUES (%s,'Demo A/c XXXX4471',%s,'2026-09-03',%s,%s) RETURNING id"


def _person(db, fir, role):
    return one(db, "INSERT INTO person(fir_id,role,label,full_name) VALUES (%s,%s,'X1','Demo Person') RETURNING id", fir, role)[0]


def test_rows_are_kept_as_written(db):
    st, io, fir = seed_case(db)
    t = one(db, TRANSFER, fir, _person(db, fir, "accused"), 100, None, io)[0]
    h = one(db, HOLD, fir, 100, None, io)[0]
    for sql, args in (("UPDATE money_transfer SET amount_paise=1 WHERE id=%s", (t,)), ("DELETE FROM money_transfer WHERE id=%s", (t,)),
                      ("UPDATE money_hold SET amount_paise=1 WHERE id=%s", (h,)), ("DELETE FROM money_hold WHERE id=%s", (h,))):
        with pytest.raises(psycopg.errors.RaiseException):
            db.execute(sql, args)


def test_amount_and_accounts_are_checked(db):
    st, io, fir = seed_case(db)
    for amount in (0, -5):
        with pytest.raises(psycopg.errors.CheckViolation):
            db.execute(TRANSFER, (fir, None, amount, None, io))
    with pytest.raises(psycopg.errors.CheckViolation):
        db.execute(HOLD, (fir, 0, None, io))
    with pytest.raises(psycopg.errors.CheckViolation):
        db.execute("INSERT INTO money_hold(fir_id,account,amount_paise,held_on,recorded_by) VALUES (%s,' x ',5,'2026-09-03',%s)", (fir, io))


def test_the_receiver_is_an_accused_and_everything_belongs_to_the_same_case(db):
    st, io, fir = seed_case(db)
    other = one(db, """INSERT INTO fir(station_id,fir_year,fir_no,gd_entry_no,registered_at,information_received_at,contents_original,contents_language,action_taken)
                       VALUES (%s,2026,215,'GD-18',now(),now(),'x','mr','investigate') RETURNING id""", st)[0]
    with pytest.raises(REFUSED):   # a witness cannot be the receiving person
        db.execute(TRANSFER, (fir, _person(db, fir, "witness"), 100, None, io))
    with pytest.raises(REFUSED):   # an accused of another case
        db.execute(TRANSFER, (fir, _person(db, other, "accused"), 100, None, io))
    ev = one(db, "INSERT INTO evidence_item(fir_id,label,description,kind,seized_at,seizure_memo) VALUES (%s,'E-1','Demo reply','document',now(),'memo') RETURNING id", other)[0]
    with pytest.raises(REFUSED):   # evidence of another case
        db.execute(HOLD, (fir, 100, ev, io))
