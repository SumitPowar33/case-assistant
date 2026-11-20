"""V61: facts of a signed complaint confirmed by the officer (AI fact check at the front desk, board 2). All data is fictional."""
import psycopg
import pytest

from test_schema import db, one, seed_case  # noqa: F401  (db is the fixture)

REQ = "7d0c3f1e-2b4a-4c55-9a77-0f1e2d3c4b5a"
TEXT = "On 28 October 2026 a caller took Rs 40,000 by UPI."


def complaint(db, st, io, signed=True, fir=None):
    cid = one(db, """INSERT INTO complaint(station_id,received_at,mode,informant_name,kind,text_original,text_language,recorded_by)
                     VALUES (%s,'2026-08-18 10:00+05:30','written','Demo Informant','other',%s,'en',%s) RETURNING id""", st, TEXT, io)[0]
    if signed:
        db.execute("UPDATE complaint SET signed_at=now(), signed_recorded_by=%s WHERE id=%s", (io, cid))
    if fir:
        db.execute("UPDATE complaint SET fir_id=%s, outcome='fir', outcome_at=now(), outcome_by=%s WHERE id=%s", (fir, io, cid))
    return cid


def add(db, cid, io, kind="amount", value="Rs 40,000", quote="Rs 40,000 by UPI", ai_value=None):
    return one(db, """INSERT INTO complaint_fact(complaint_id,kind,value,ai_value,quote,ai_request_id,confirmed_by)
                      VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING id""", cid, kind, value, ai_value or value, quote, REQ, io)[0]


def test_only_a_signed_complaint_takes_facts(db):
    st, io, fir = seed_case(db)
    with pytest.raises(psycopg.errors.CheckViolation, match="only a signed complaint"):
        add(db, complaint(db, st, io, signed=False), io)
    add(db, complaint(db, st, io), io)


def test_a_fact_quotes_words_of_its_own_complaint_exactly(db):
    st, io, fir = seed_case(db)
    cid, other = complaint(db, st, io), complaint(db, st, io)
    db.execute("UPDATE complaint SET text_original='Other words' WHERE id=%s AND signed_at IS NULL", (other,))
    add(db, cid, io, quote=TEXT)
    for wrong in ("rs 40,000", "Rs 40,000  by UPI", "elsewhere"):
        with pytest.raises(psycopg.errors.CheckViolation, match="words of the complaint"):
            add(db, cid, io, kind="phone", value="1", quote=wrong)


@pytest.mark.parametrize("column,value", [
    ("kind", "name"), ("value", " "), ("value", "x" * 201), ("ai_value", ""), ("quote", " "), ("quote", "x" * 501),
])
def test_each_column_is_checked(db, column, value):
    st, io, fir = seed_case(db)
    row = {"kind": "amount", "value": "Rs 1", "ai_value": "Rs 1", "quote": "Rs 40,000"} | {column: value}
    with pytest.raises(psycopg.errors.CheckViolation):
        db.execute("""INSERT INTO complaint_fact(complaint_id,kind,value,ai_value,quote,ai_request_id,confirmed_by)
                      VALUES (%s,%s,%s,%s,%s,%s,%s)""", (complaint(db, st, io), row["kind"], row["value"], row["ai_value"], row["quote"], REQ, io))


def test_the_same_fact_is_kept_once_and_as_written(db):
    st, io, fir = seed_case(db)
    cid = complaint(db, st, io)
    add(db, cid, io)
    add(db, cid, io, kind="upi", value="Rs 40,000")
    with pytest.raises(psycopg.errors.UniqueViolation):
        add(db, cid, io, value="  rs 40,000 ")
    for change in ("UPDATE complaint_fact SET value='Rs 1'", "DELETE FROM complaint_fact"):
        with pytest.raises(psycopg.errors.RaiseException):
            db.execute(change)


def fir_of(db, st, io, no, sexual):
    return one(db, """INSERT INTO fir(station_id,fir_year,fir_no,gd_entry_no,registered_at,information_received_at,
                     contents_original,contents_language,action_taken,io_id,sexual_offence)
                     VALUES (%s,2026,%s,'GD-30',now(),'2026-08-18 10:00+05:30',%s,'en','investigate',%s,%s) RETURNING id""", st, no, TEXT, io, sexual)[0]


def test_an_ai_result_is_not_taken_when_the_fir_protects_the_victim(db):
    st, io, fir = seed_case(db)
    add(db, complaint(db, st, io, fir=fir_of(db, st, io, 300, False)), io)   # an ordinary FIR: taken
    protected = complaint(db, st, io, fir=fir_of(db, st, io, 301, True))
    with pytest.raises(psycopg.errors.CheckViolation, match="protected"):
        add(db, protected, io)
