"""V74: a duty swap exchanges the asker's own duty for another officer's duty of the same station, both still standing and
not passed, neither already in a waiting request; it is approved only while both still stand; request and decision are
kept as written. Fictional data."""
import psycopg
import pytest

from test_schema import db, one, seed_case  # noqa: F401  (db is the fixture)

ADD = ("INSERT INTO duty_assignment(station_id,officer_id,on_date,kind,shift,post,recorded_by) "
       "VALUES (%s,%s,ist_date(now()) + %s,%s,%s,%s,%s) RETURNING id")
ASK = "INSERT INTO duty_swap(give_id,take_id,reason,asked_by) VALUES (%s,%s,%s,%s) RETURNING id"
DECIDE = "INSERT INTO duty_swap_decision(swap_id,approved,note,decided_by) VALUES (%s,%s,%s,%s)"
BACK = "INSERT INTO duty_assignment_cancel(assignment_id,reason,cancelled_by) VALUES (%s,'Sent to court that day',%s)"
WHY = "A family function that evening"


def station_with_two(db):
    st, io, fir = seed_case(db)
    other = one(db, "INSERT INTO app_user(station_id,full_name,rank,role) VALUES (%s,'Fictional Bela','SI','io') RETURNING id", st)[0]
    return st, io, other


def duty(db, st, officer, days=1, kind="duty", shift="morning", post="beat"):
    if kind != "duty":
        shift = post = None
    return one(db, ADD, st, officer, days, kind, shift, post, officer)[0]


def refused(db, give, take, asker, text):
    with pytest.raises(psycopg.errors.RaiseException, match=text):
        db.execute(ASK, (give, take, WHY, asker))


def test_the_two_are_duties_of_two_officers_of_one_station_and_the_first_is_the_askers_own(db):
    st, a, b = station_with_two(db)
    mine, theirs = duty(db, st, a), duty(db, st, b, 2)
    far = one(db, "INSERT INTO police_station(state_code,district_id,name) VALUES ('IN',district_id_of('IN','South'),'Fictional Far PS') RETURNING id")[0]
    stranger = one(db, "INSERT INTO app_user(station_id,full_name,rank,role) VALUES (%s,'Fictional Far','SI','io') RETURNING id", far)[0]
    refused(db, theirs, mine, a, "asker's own duty")       # not the asker's to give
    refused(db, mine, duty(db, st, a, 3), a, "another officer")
    refused(db, mine, duty(db, far, stranger, 2), a, "same station")
    refused(db, mine, mine, a, "another officer")
    one(db, ASK, mine, theirs, WHY, a)


def test_only_duties_that_stand_and_have_not_passed_can_be_swapped(db):
    st, a, b = station_with_two(db)
    today, theirs = duty(db, st, a, 0), duty(db, st, b, 2)
    for bad in (duty(db, st, b, -1), duty(db, st, b, 3, "leave"), duty(db, st, b, 4, "weekly_off")):
        refused(db, today, bad, a, "stand on the roster")
    refused(db, duty(db, st, a, -1), theirs, a, "stand on the roster")
    gone = duty(db, st, b, 5)
    db.execute(BACK, (gone, b))
    refused(db, today, gone, a, "stand on the roster")
    one(db, ASK, today, theirs, WHY, a)       # today's duty may still be swapped


def test_a_duty_waits_in_one_request_at_a_time(db):
    st, a, b = station_with_two(db)
    a1, a2, b1, b2 = duty(db, st, a, 1), duty(db, st, a, 2), duty(db, st, b, 3), duty(db, st, b, 4)
    first = one(db, ASK, a1, b1, WHY, a)[0]
    refused(db, a1, b2, a, "waits for a decision")
    refused(db, a2, b1, a, "waits for a decision")
    refused(db, b1, a2, b, "waits for a decision")        # also from the other side
    one(db, ASK, a2, b2, WHY, a)
    db.execute(DECIDE, (first, False, "Both are needed as rostered", a))
    third = one(db, ASK, a1, b1, WHY, a)[0]               # refused, so it may be asked again
    db.execute(BACK, (a1, a))                             # a request that lost a duty waits no more and holds nothing
    one(db, ASK, duty(db, st, a, 6), b1, WHY, a)
    assert third


def test_a_decision_is_one_a_refusal_says_why_and_an_approval_needs_both_duties(db):
    st, a, b = station_with_two(db)
    mine, theirs = duty(db, st, a), duty(db, st, b, 2)
    swap = one(db, ASK, mine, theirs, WHY, a)[0]
    for note in (None, "no", "          x"):
        with pytest.raises(psycopg.errors.CheckViolation):
            db.execute(DECIDE, (swap, False, note, a))
    db.execute(BACK, (theirs, b))
    with pytest.raises(psycopg.errors.RaiseException, match="not approved once"):
        db.execute(DECIDE, (swap, True, None, a))
    db.execute(DECIDE, (swap, False, "The other duty was taken back", a))
    with pytest.raises(psycopg.errors.UniqueViolation):
        db.execute(DECIDE, (swap, False, "The other duty was taken back", a))
    passed = one(db, ASK, mine, duty(db, st, b, 3), WHY, a)[0]
    db.execute(DECIDE, (passed, True, None, a))


def test_a_request_gives_a_reason_and_request_and_decision_are_kept(db):
    st, a, b = station_with_two(db)
    mine, theirs = duty(db, st, a), duty(db, st, b, 2)
    for reason in ("short", " " * 20, "x" * 501):
        with pytest.raises(psycopg.errors.CheckViolation):
            db.execute(ASK, (mine, theirs, reason, a))
    swap = one(db, ASK, mine, theirs, WHY, a)[0]
    db.execute(DECIDE, (swap, True, None, a))
    for sql in ("UPDATE duty_swap SET reason = 'Changed afterwards, long enough' WHERE id=%s", "DELETE FROM duty_swap WHERE id=%s",
                "UPDATE duty_swap_decision SET approved = true, note = 'Changed' WHERE swap_id=%s", "DELETE FROM duty_swap_decision WHERE swap_id=%s"):
        with pytest.raises(psycopg.errors.RaiseException):
            db.execute(sql, (swap,))
