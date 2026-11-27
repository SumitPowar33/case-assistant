"""V75: a 112 event is sent to an officer only after it was acknowledged, only on a beat or patrol duty of that officer at
the event's station that still stands, to each officer once; what was sent is kept as written. Fictional data."""
import psycopg
import pytest

from test_call112 import EVENT
from test_schema import db, one, seed_case  # noqa: F401  (db is the fixture)

DUTY = ("INSERT INTO duty_assignment(station_id,officer_id,on_date,kind,shift,post,recorded_by) "
        "VALUES (%s,%s,ist_date(now()),'duty',%s,%s,%s) RETURNING id")
SEND = "INSERT INTO call112_sent(event_id,assignment_id,officer_id,sent_by) VALUES (%s,%s,%s,%s)"
ACK = "INSERT INTO call112_ack(event_id,acknowledged_by) VALUES (%s,%s)"


def officer(db, st, name):
    return one(db, "INSERT INTO app_user(station_id,full_name,rank,role) VALUES (%s,%s,'HC','io') RETURNING id", st, name)[0]


def refused(db, text, *params):
    with pytest.raises(psycopg.errors.RaiseException, match=text):
        db.execute(SEND, params)


def test_an_event_goes_to_a_beat_or_patrol_officer_once_and_only_after_the_acknowledgement(db):
    st, io, fir = seed_case(db)
    bela, chand = officer(db, st, "Fictional Bela"), officer(db, st, "Fictional Chand")
    ev = one(db, EVENT, st, "accident", io)[0]
    beat = one(db, DUTY, st, bela, "morning", "beat", io)[0]
    patrol = one(db, DUTY, st, chand, "morning", "patrol", io)[0]
    refused(db, "only after it was acknowledged", ev, beat, bela, io)
    db.execute(ACK, (ev, io))
    db.execute(SEND, (ev, beat, bela, io))
    db.execute(SEND, (ev, patrol, chand, io))
    with pytest.raises(psycopg.errors.UniqueViolation):
        db.execute(SEND, (ev, beat, bela, io))


def test_the_duty_must_be_that_officers_beat_or_patrol_duty_at_the_events_station_and_still_stand(db):
    st, io, fir = seed_case(db)
    bela, chand = officer(db, st, "Fictional Bela"), officer(db, st, "Fictional Chand")
    ev = one(db, EVENT, st, "accident", io)[0]
    db.execute(ACK, (ev, io))
    beat = one(db, DUTY, st, bela, "morning", "beat", io)[0]
    refused(db, "beat or patrol duty", ev, beat, chand, io)   # somebody else's duty
    house = one(db, DUTY, st, chand, "morning", "station_house", io)[0]
    refused(db, "beat or patrol duty", ev, house, chand, io)
    far = one(db, "INSERT INTO police_station(state_code,district_id,name) SELECT state_code,district_id,'Fictional Far PS' "
                  "FROM police_station WHERE id=%s RETURNING id", st)[0]
    away = officer(db, far, "Fictional Dev")
    far_beat = one(db, DUTY, far, away, "morning", "beat", io)[0]
    one(db, EVENT, far, "accident", io)   # the far station has an event too: it is this event's station that counts
    refused(db, "beat or patrol duty", ev, far_beat, away, io)
    db.execute("INSERT INTO duty_assignment_cancel(assignment_id,reason,cancelled_by) VALUES (%s,'Sent to court that day',%s)", (beat, io))
    refused(db, "beat or patrol duty", ev, beat, bela, io)


def test_what_was_sent_is_kept(db):
    st, io, fir = seed_case(db)
    ev = one(db, EVENT, st, "accident", io)[0]
    db.execute(ACK, (ev, io))
    beat = one(db, DUTY, st, io, "morning", "beat", io)[0]
    db.execute(SEND, (ev, beat, io, io))
    for sql in ("UPDATE call112_sent SET sent_by=sent_by WHERE event_id=%s", "DELETE FROM call112_sent WHERE event_id=%s"):
        with pytest.raises(psycopg.errors.RaiseException):
            db.execute(sql, (ev,))
