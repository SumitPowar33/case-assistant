"""V70: a 112 event is kept as written, acknowledged once, opened once as a complaint or a general diary entry (never
both) and only after the acknowledgement; a station's general diary numbers are unique. Fictional data."""
import psycopg
import pytest

from test_schema import db, one, seed_case  # noqa: F401  (db is the fixture)

EVENT = ("INSERT INTO call112_event(station_id,received_at,place,kind,details,entered_by) "
         "VALUES (%s, now() - interval '5 minutes', 'Fictional Chowk', %s, 'Fictional dispute', %s) RETURNING id")
DIARY = "INSERT INTO general_diary_entry(station_id,entry_no,entry_text,recorded_by) VALUES (%s,%s,'Fictional entry',%s) RETURNING id"


def test_an_event_needs_a_place_details_and_a_known_kind_and_cannot_be_from_the_future(db):
    st, io, fir = seed_case(db)
    one(db, EVENT, st, "accident", io)
    with pytest.raises(psycopg.errors.CheckViolation):
        db.execute(EVENT, (st, "dance", io))
    for sql in ("INSERT INTO call112_event(station_id,received_at,place,kind,details,entered_by) VALUES (%s, now(), ' ', 'other', 'x', %s)",
                "INSERT INTO call112_event(station_id,received_at,place,kind,details,entered_by) VALUES (%s, now(), 'p', 'other', ' ', %s)",
                "INSERT INTO call112_event(station_id,received_at,place,kind,details,entered_by) VALUES (%s, now() + interval '1 day', 'p', 'other', 'x', %s)"):
        with pytest.raises(psycopg.errors.CheckViolation):
            db.execute(sql, (st, io))


def test_events_acknowledgements_and_openings_are_kept(db):
    st, io, fir = seed_case(db)
    ev = one(db, EVENT, st, "accident", io)[0]
    db.execute("INSERT INTO call112_ack(event_id,acknowledged_by) VALUES (%s,%s)", (ev, io))
    d = one(db, DIARY, st, 1, io)[0]
    db.execute("INSERT INTO call112_opened(event_id,diary_id,opened_by) VALUES (%s,%s,%s)", (ev, d, io))
    for sql in ("UPDATE call112_event SET place='x' WHERE id=%s", "DELETE FROM call112_event WHERE id=%s"):
        with pytest.raises(psycopg.errors.RaiseException):
            db.execute(sql, (ev,))
    for sql in ("UPDATE call112_ack SET acknowledged_by=acknowledged_by WHERE event_id=%s", "DELETE FROM call112_ack WHERE event_id=%s",
                "UPDATE call112_opened SET opened_by=opened_by WHERE event_id=%s", "DELETE FROM call112_opened WHERE event_id=%s"):
        with pytest.raises(psycopg.errors.RaiseException):
            db.execute(sql, (ev,))
    for sql in ("UPDATE general_diary_entry SET entry_text='x' WHERE id=%s", "DELETE FROM general_diary_entry WHERE id=%s"):
        with pytest.raises(psycopg.errors.RaiseException):
            db.execute(sql, (d,))


def test_an_event_is_acknowledged_once_and_opened_once_and_only_after_the_acknowledgement(db):
    st, io, fir = seed_case(db)
    ev = one(db, EVENT, st, "accident", io)[0]
    d = one(db, DIARY, st, 1, io)[0]
    with pytest.raises(psycopg.errors.RaiseException):
        db.execute("INSERT INTO call112_opened(event_id,diary_id,opened_by) VALUES (%s,%s,%s)", (ev, d, io))
    db.execute("INSERT INTO call112_ack(event_id,acknowledged_by) VALUES (%s,%s)", (ev, io))
    with pytest.raises(psycopg.errors.UniqueViolation):
        db.execute("INSERT INTO call112_ack(event_id,acknowledged_by) VALUES (%s,%s)", (ev, io))
    db.execute("INSERT INTO call112_opened(event_id,diary_id,opened_by) VALUES (%s,%s,%s)", (ev, d, io))
    d2 = one(db, DIARY, st, 2, io)[0]
    with pytest.raises(psycopg.errors.UniqueViolation):
        db.execute("INSERT INTO call112_opened(event_id,diary_id,opened_by) VALUES (%s,%s,%s)", (ev, d2, io))


def test_an_opening_is_a_complaint_or_a_diary_entry_never_both_or_neither(db):
    st, io, fir = seed_case(db)
    ev = one(db, EVENT, st, "accident", io)[0]
    db.execute("INSERT INTO call112_ack(event_id,acknowledged_by) VALUES (%s,%s)", (ev, io))
    c = one(db, "INSERT INTO complaint(station_id,received_at,mode,informant_name,kind,text_original,text_language,recorded_by) "
                "VALUES (%s, now() - interval '1 minute','phone','Fictional Caller','other_crime','Fictional text','en',%s) RETURNING id", st, io)[0]
    d = one(db, DIARY, st, 1, io)[0]
    with pytest.raises(psycopg.errors.CheckViolation):
        db.execute("INSERT INTO call112_opened(event_id,complaint_id,diary_id,opened_by) VALUES (%s,%s,%s,%s)", (ev, c, d, io))
    with pytest.raises(psycopg.errors.CheckViolation):
        db.execute("INSERT INTO call112_opened(event_id,opened_by) VALUES (%s,%s)", (ev, io))
    db.execute("INSERT INTO call112_opened(event_id,complaint_id,opened_by) VALUES (%s,%s,%s)", (ev, c, io))


def test_the_diary_number_is_unique_per_station_and_positive(db):
    st, io, fir = seed_case(db)
    one(db, DIARY, st, 1, io)
    with pytest.raises(psycopg.errors.UniqueViolation):
        db.execute(DIARY, (st, 1, io))
    with pytest.raises(psycopg.errors.CheckViolation):
        db.execute(DIARY, (st, 0, io))
    other = one(db, "INSERT INTO police_station(state_code,district_id,name) VALUES ('IN',district_id_of('IN','South'),'Fictional Far PS') RETURNING id")[0]
    one(db, "INSERT INTO app_user(station_id,full_name,rank,role) VALUES (%s,'Fictional Far','SI','io') RETURNING id", other)
    one(db, DIARY, other, 1, io)   # numbering is per station
