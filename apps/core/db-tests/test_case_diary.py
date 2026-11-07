"""V39 and V47: the case diary under BNSS 192, checked straight in the database. All data is fictional."""
import threading

import psycopg
import pytest

from test_schema import URL, db, one, seed_case  # noqa: F401  (db is the fixture)

REFUSED = (psycopg.errors.RaiseException, psycopg.errors.CheckViolation)


def test_an_entry_is_written_on_its_own_day_and_kept_as_written(db):
    st, io, fir = seed_case(db)
    e = one(db, "INSERT INTO case_diary_entry(fir_id,author,text) VALUES (%s,%s,'Visited the fictional bank branch') RETURNING id, diary_date = ist_date(at)", fir, io)
    assert e[1] is True
    for days in (-1, 1):   # never back-dated or forward-dated
        with pytest.raises(REFUSED):
            db.execute("INSERT INTO case_diary_entry(fir_id,author,text,diary_date) VALUES (%s,%s,'Fictional entry',ist_date(now()) + %s)", (fir, io, days))
    with pytest.raises(REFUSED):   # too short
        db.execute("INSERT INTO case_diary_entry(fir_id,author,text) VALUES (%s,%s,'  a ')", (fir, io))
    with pytest.raises(REFUSED):
        db.execute("UPDATE case_diary_entry SET text='quietly changed' WHERE id=%s", (e[0],))
    with pytest.raises(REFUSED):
        db.execute("DELETE FROM case_diary_entry WHERE id=%s", (e[0],))


def test_a_closed_page_takes_no_entry_and_is_kept_with_its_number(db):
    st, io, fir = seed_case(db)
    db.execute("INSERT INTO case_diary_entry(fir_id,author,text) VALUES (%s,%s,'Fictional first entry')", (fir, io))
    db.execute("INSERT INTO case_diary_page(fir_id,diary_date,page_no,closed_by) VALUES (%s,ist_date(now()),1,%s)", (fir, io))
    with pytest.raises(REFUSED):
        db.execute("INSERT INTO case_diary_entry(fir_id,author,text) VALUES (%s,%s,'Fictional late entry')", (fir, io))
    with pytest.raises(psycopg.errors.UniqueViolation):   # one page number per case
        db.execute("INSERT INTO case_diary_page(fir_id,diary_date,page_no,closed_by) VALUES (%s,ist_date(now()) - 1,1,%s)", (fir, io))
    with pytest.raises(REFUSED):
        db.execute("INSERT INTO case_diary_page(fir_id,diary_date,page_no,closed_by) VALUES (%s,ist_date(now()) - 2,0,%s)", (fir, io))
    with pytest.raises(REFUSED):
        db.execute("UPDATE case_diary_page SET page_no=7 WHERE fir_id=%s", (fir,))
    with pytest.raises(REFUSED):
        db.execute("DELETE FROM case_diary_page WHERE fir_id=%s", (fir,))


def test_an_entry_written_while_the_page_is_being_closed_waits_and_is_refused(db):
    # weekly review 7 Nov 2026 (V47): the entry did not wait for the close, so it could land on a page closed a moment later
    st, io, fir = seed_case(db)
    db.execute("INSERT INTO case_diary_entry(fir_id,author,text) VALUES (%s,%s,'Fictional first entry')", (fir, io))
    path = db.execute("SHOW search_path").fetchone()[0]
    closer, writer = psycopg.connect(URL), psycopg.connect(URL, autocommit=True)
    try:
        for c in (closer, writer):
            c.execute(f"SET search_path TO {path}")
        closer.execute("INSERT INTO case_diary_page(fir_id,diary_date,page_no,closed_by) VALUES (%s,ist_date(now()),1,%s)", (fir, io))   # not committed yet
        result = {}

        def write():
            try:
                writer.execute("INSERT INTO case_diary_entry(fir_id,author,text) VALUES (%s,%s,'Fictional entry at the same moment')", (fir, io))
                result["ok"] = True
            except psycopg.Error as e:
                result["error"] = e

        t = threading.Thread(target=write)
        t.start()
        t.join(1.0)
        assert t.is_alive(), "the entry must wait for the close to finish"
        closer.commit()
        t.join(10)
        assert isinstance(result.get("error"), psycopg.errors.CheckViolation)
        assert one(db, "SELECT count(*) FROM case_diary_entry WHERE fir_id=%s", fir)[0] == 1
    finally:
        closer.close()
        writer.close()
