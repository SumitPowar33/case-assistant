"""V59: the text of a reply is kept with the reply, optional, at most 30,000 characters, and kept as written. All data is fictional."""
import psycopg
import pytest

from test_schema import db, one, seed_case  # noqa: F401  (db is the fixture)


def notice(db, fir, io):
    return one(db, """INSERT INTO notice (fir_id, kind, addressee, items_requested, body, issued_at, reply_due_on, status, signed_by)
                      VALUES (%s,'BNSS_94','Fictional Bank',ARRAY['Statement'],'b',now(),current_date+7,'sent',%s) RETURNING id""", fir, io)[0]


def reply(db, n, text):
    db.execute("INSERT INTO notice_reply (notice_id, received_at, channel, reply_text) VALUES (%s, now(), 'email', %s)", (n, text))


def test_a_reply_may_carry_its_text_or_none(db):
    st, io, fir = seed_case(db)
    n = notice(db, fir, io)
    reply(db, n, None)
    reply(db, n, "Fictional reply: statement attached.")
    assert one(db, "SELECT count(*) FROM notice_reply WHERE reply_text IS NULL")[0] == 1
    assert one(db, "SELECT count(*) FROM notice_reply WHERE reply_text LIKE '%%statement attached%%'")[0] == 1


@pytest.mark.parametrize("text", ["", "x" * 30001])
def test_an_empty_or_too_long_text_is_refused(db, text):
    st, io, fir = seed_case(db)
    n = notice(db, fir, io)
    with pytest.raises(psycopg.errors.CheckViolation):
        reply(db, n, text)


def test_the_text_is_kept_as_written(db):
    st, io, fir = seed_case(db)
    n = notice(db, fir, io)
    reply(db, n, "Fictional reply")
    with pytest.raises(psycopg.errors.RaiseException):
        db.execute("UPDATE notice_reply SET reply_text = 'changed'")
