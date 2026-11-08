"""V50: facts of the FIR text confirmed by the officer (AI fact check, board 2). All data is fictional."""
import psycopg
import pytest

from test_schema import db, one, seed_case  # noqa: F401  (db is the fixture)

REQ = "7d0c3f1e-2b4a-4c55-9a77-0f1e2d3c4b5a"


def add(db, fir, io, kind="amount", value="Rs 40,000", quote="complaint", ai_value=None):
    return one(db, """INSERT INTO fir_fact(fir_id,kind,value,ai_value,quote,ai_request_id,confirmed_by)
                      VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING id""", fir, kind, value, ai_value or value, quote, REQ, io)[0]


def test_a_fact_quotes_words_of_its_own_fir_text_exactly(db):
    st, io, fir = seed_case(db)   # text: 'Demo complaint text'
    add(db, fir, io, quote="Demo complaint text")
    add(db, fir, io, kind="place", value="Demo", quote="complaint")   # any part of it
    for wrong in ("demo complaint", "Demo  complaint", "Demo complaint text!", "elsewhere"):
        with pytest.raises(psycopg.errors.CheckViolation):
            add(db, fir, io, kind="phone", value="1", quote=wrong)
    # the words of another FIR's text do not count
    other = one(db, """INSERT INTO fir(station_id,fir_year,fir_no,gd_entry_no,registered_at,information_received_at,
                       contents_original,contents_language,action_taken) VALUES (%s,2026,215,'GD-18',now(),now(),'Other text','en','investigate') RETURNING id""", st)[0]
    with pytest.raises(psycopg.errors.CheckViolation):
        add(db, other, io, quote="Demo complaint text")


@pytest.mark.parametrize("column,value", [
    ("kind", "name"), ("kind", "person"), ("value", " "), ("value", "x" * 201), ("ai_value", ""), ("quote", " "), ("quote", "x" * 501),
])
def test_each_column_is_checked(db, column, value):
    st, io, fir = seed_case(db)
    row = {"kind": "amount", "value": "Rs 1", "ai_value": "Rs 1", "quote": "complaint"} | {column: value}
    with pytest.raises(psycopg.errors.CheckViolation):
        db.execute("""INSERT INTO fir_fact(fir_id,kind,value,ai_value,quote,ai_request_id,confirmed_by)
                      VALUES (%s,%s,%s,%s,%s,%s,%s)""", (fir, row["kind"], row["value"], row["ai_value"], row["quote"], REQ, io))


def test_every_kind_of_the_list_is_taken(db):
    st, io, fir = seed_case(db)
    for i, kind in enumerate(("date", "time", "place", "amount", "utr", "phone", "account", "upi")):
        add(db, fir, io, kind=kind, value=f"v{i}")
    assert one(db, "SELECT count(*) FROM fir_fact WHERE fir_id=%s", fir)[0] == 8


def test_the_same_fact_is_kept_once_ignoring_case_and_spaces(db):
    st, io, fir = seed_case(db)
    add(db, fir, io, value="Rs 40,000")
    add(db, fir, io, kind="upi", value="Rs 40,000")   # another kind is another fact
    with pytest.raises(psycopg.errors.UniqueViolation):
        add(db, fir, io, value="  rs 40,000 ")


def test_a_confirmed_fact_is_kept_as_written(db):
    st, io, fir = seed_case(db)
    add(db, fir, io)
    for change in ("UPDATE fir_fact SET value='Rs 1'", "UPDATE fir_fact SET quote='Demo'", "DELETE FROM fir_fact"):
        with pytest.raises(psycopg.errors.RaiseException):
            db.execute(change)
    assert one(db, "SELECT value, quote FROM fir_fact")[0:2] == ("Rs 40,000", "complaint")
