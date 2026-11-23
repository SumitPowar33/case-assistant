"""V66: a duty roster entry is for an active officer posted at the station, a duty has a shift and a post and a weekly off
or leave has neither, entries are kept as written, and taking one back is a second row with a reason. Fictional data."""
import psycopg
import pytest

from test_schema import db, one, seed_case  # noqa: F401  (db is the fixture)

ADD = ("INSERT INTO duty_assignment(station_id,officer_id,on_date,kind,shift,post,recorded_by) "
       "VALUES (%s,%s,current_date,%s,%s,%s,%s) RETURNING id")


def test_a_duty_needs_a_shift_and_a_post_and_an_absence_has_neither(db):
    st, io, fir = seed_case(db)
    one(db, ADD, st, io, "duty", "night", "lock_up", io)
    one(db, ADD, st, io, "leave", None, None, io)
    for bad in (("duty", None, "beat"), ("duty", "morning", None), ("leave", "morning", None), ("weekly_off", None, "beat"),
                ("duty", "dawn", "beat"), ("duty", "morning", "dance"), ("sleep", None, None)):
        with pytest.raises(psycopg.errors.CheckViolation):
            db.execute(ADD, (st, io, *bad, io))


def test_it_names_an_active_officer_posted_at_that_station(db):
    st, io, fir = seed_case(db)
    other = one(db, "INSERT INTO police_station(state_code,district_id,name) VALUES ('IN',district_id_of('IN','South'),'Fictional Far PS') RETURNING id")[0]
    with pytest.raises(psycopg.errors.RaiseException):
        db.execute(ADD, (other, io, "duty", "morning", "beat", io))
    db.execute("UPDATE app_user SET active = false WHERE id = %s", (io,))
    with pytest.raises(psycopg.errors.RaiseException):
        db.execute(ADD, (st, io, "duty", "morning", "beat", io))


def test_an_entry_is_kept_and_taking_it_back_is_a_second_row_with_a_reason(db):
    st, io, fir = seed_case(db)
    a = one(db, ADD, st, io, "duty", "morning", "beat", io)[0]
    for sql in ("UPDATE duty_assignment SET post = 'patrol' WHERE id=%s", "DELETE FROM duty_assignment WHERE id=%s"):
        with pytest.raises(psycopg.errors.RaiseException):
            db.execute(sql, (a,))
    with pytest.raises(psycopg.errors.CheckViolation):
        db.execute("INSERT INTO duty_assignment_cancel(assignment_id,reason,cancelled_by) VALUES (%s,'short',%s)", (a, io))
    db.execute("INSERT INTO duty_assignment_cancel(assignment_id,reason,cancelled_by) VALUES (%s,'Sent to court that day',%s)", (a, io))
    with pytest.raises(psycopg.errors.UniqueViolation):
        db.execute("INSERT INTO duty_assignment_cancel(assignment_id,reason,cancelled_by) VALUES (%s,'Taking it back again',%s)", (a, io))
    for sql in ("UPDATE duty_assignment_cancel SET reason = 'Changed afterwards, long enough' WHERE assignment_id=%s", "DELETE FROM duty_assignment_cancel WHERE assignment_id=%s"):
        with pytest.raises(psycopg.errors.RaiseException):
            db.execute(sql, (a,))
