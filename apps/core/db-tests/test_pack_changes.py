"""V46: a proposed change to a state's pack and its decision are kept as written; nobody decides their own proposal; a
change is decided once; sending back needs a reason. All data is fictional."""
import psycopg
import pytest

from test_schema import db, one, seed_case  # noqa: F401  (db is the fixture)

CHANGE = "INSERT INTO pack_change(state_code,title,body,tested_note,drafted_by) VALUES ('IN',%s,%s,%s,%s) RETURNING id"
DECIDE = "INSERT INTO pack_change_decision(change_id,decision,note,decided_by) VALUES (%s,%s,%s,%s)"
BODY = "Adds a fictional front desk step before the FIR is typed."


def people(db):
    st, io, fir = seed_case(db)
    other = one(db, "INSERT INTO app_user(full_name,rank,role,station_id) VALUES ('B. Fictional','PP','prosecutor',%s) RETURNING id", st)[0]
    return io, other


def test_a_proposal_and_its_decision_are_kept_as_written(db):
    io, other = people(db)
    c = one(db, CHANGE, "Fictional playbook v1.5", BODY, None, io)[0]
    db.execute(DECIDE, (c, "approved", None, other))
    for sql in ("UPDATE pack_change SET title='Changed title afterwards' WHERE id=%s", "DELETE FROM pack_change WHERE id=%s"):
        with pytest.raises(psycopg.errors.RaiseException):
            db.execute(sql, (c,))
    for sql in ("UPDATE pack_change_decision SET decision='returned', note='A long enough reason' WHERE change_id=%s", "DELETE FROM pack_change_decision WHERE change_id=%s"):
        with pytest.raises(psycopg.errors.RaiseException):
            db.execute(sql, (c,))


def test_nobody_decides_their_own_proposal_and_a_change_is_decided_once(db):
    io, other = people(db)
    c = one(db, CHANGE, "Fictional playbook v1.5", BODY, None, io)[0]
    with pytest.raises(psycopg.errors.RaiseException):
        db.execute(DECIDE, (c, "approved", None, io))
    db.execute(DECIDE, (c, "returned", "Add the second link rule", other))
    with pytest.raises(psycopg.errors.UniqueViolation):
        db.execute(DECIDE, (c, "approved", None, other))


def test_lengths_and_the_reason_for_sending_back_are_checked(db):
    io, other = people(db)
    for title, body, tested in (("abc", BODY, None), ("x" * 121, BODY, None), ("Fictional title", "too short", None),
                                ("Fictional title", "y" * 2001, None), ("Fictional title", BODY, "abc"), ("Fictional title", BODY, "z" * 501)):
        with pytest.raises(psycopg.errors.CheckViolation):
            db.execute(CHANGE, (title, body, tested, io))
    one(db, CHANGE, "Fictional title", BODY, "Tried on fictional cases", io)
    c = one(db, CHANGE, "Fictional other title", BODY, None, io)[0]
    for note in (None, "   ", "too short"):
        with pytest.raises(psycopg.errors.CheckViolation):
            db.execute(DECIDE, (c, "returned", note, other))
    with pytest.raises(psycopg.errors.CheckViolation):
        db.execute(DECIDE, (c, "maybe", None, other))
    db.execute(DECIDE, (c, "returned", "Add the second link rule", other))


def test_the_state_must_have_a_pack(db):
    io, other = people(db)
    with pytest.raises(psycopg.errors.ForeignKeyViolation):
        db.execute("INSERT INTO pack_change(state_code,title,body,drafted_by) VALUES ('ZZ','Fictional title',%s,%s)", (BODY, io))
