"""V53: an acting charge (a temporary officer-in-charge role) is kept as written, lasts at most 90 days, is never given to
oneself, goes only to an active officer posted at that station, and is ended by a second row with a reason. Its start and
end are also admin actions. All data is fictional."""
import psycopg
import pytest

from test_schema import db, one, seed_case  # noqa: F401  (db is the fixture)

GIVE = ("INSERT INTO acting_charge(user_id,station_id,role,reason,ends_at,granted_by) "
        "VALUES (%s,%s,'sho',%s,now() + %s::interval,%s) RETURNING id")
REASON = "SHO is on leave for ten days"


def people(db):
    st, io, fir = seed_case(db)
    sp = one(db, "INSERT INTO app_user(full_name,rank,role,station_id) VALUES ('S. Fictional','SP','sp',%s) RETURNING id", st)[0]
    return st, io, sp


def test_a_charge_runs_at_most_ninety_days(db):
    st, io, sp = people(db)
    one(db, GIVE, io, st, REASON, "90 days", sp)
    with pytest.raises(psycopg.errors.CheckViolation):
        db.execute(GIVE, (io, st, REASON, "91 days", sp))


def test_a_charge_ends_after_it_starts(db):
    st, io, sp = people(db)
    with pytest.raises(psycopg.errors.CheckViolation):
        db.execute(GIVE, (io, st, REASON, "-1 minute", sp))


def test_nobody_gives_it_to_themselves_and_a_reason_is_needed(db):
    st, io, sp = people(db)
    with pytest.raises(psycopg.errors.CheckViolation):
        db.execute(GIVE, (sp, st, REASON, "5 days", sp))
    with pytest.raises(psycopg.errors.CheckViolation):
        db.execute(GIVE, (io, st, "too short", "5 days", sp))


def test_it_goes_only_to_an_active_officer_posted_at_that_station(db):
    st, io, sp = people(db)
    other = one(db, "INSERT INTO police_station(state_code,district_id,name) VALUES ('IN',district_id_of('IN','South'),'Fictional Far PS') RETURNING id")[0]
    with pytest.raises(psycopg.errors.RaiseException):
        db.execute(GIVE, (io, other, REASON, "5 days", sp))
    db.execute("UPDATE app_user SET active = false WHERE id = %s", (io,))
    with pytest.raises(psycopg.errors.RaiseException):
        db.execute(GIVE, (io, st, REASON, "5 days", sp))


def test_the_charge_and_its_end_are_kept_as_written_and_ended_once(db):
    st, io, sp = people(db)
    c = one(db, GIVE, io, st, REASON, "5 days", sp)[0]
    db.execute("INSERT INTO acting_charge_end(charge_id,reason,ended_by) VALUES (%s,'The SHO is back from leave',%s)", (c, sp))
    for sql in ("UPDATE acting_charge SET reason = 'Changed afterwards, long enough' WHERE id=%s", "DELETE FROM acting_charge WHERE id=%s"):
        with pytest.raises(psycopg.errors.RaiseException):
            db.execute(sql, (c,))
    for sql in ("UPDATE acting_charge_end SET reason = 'Changed afterwards, long enough' WHERE charge_id=%s", "DELETE FROM acting_charge_end WHERE charge_id=%s"):
        with pytest.raises(psycopg.errors.RaiseException):
            db.execute(sql, (c,))
    with pytest.raises(psycopg.errors.UniqueViolation):
        db.execute("INSERT INTO acting_charge_end(charge_id,reason,ended_by) VALUES (%s,'Ending it a second time',%s)", (c, sp))


def test_the_end_needs_a_reason(db):
    st, io, sp = people(db)
    c = one(db, GIVE, io, st, REASON, "5 days", sp)[0]
    with pytest.raises(psycopg.errors.CheckViolation):
        db.execute("INSERT INTO acting_charge_end(charge_id,reason,ended_by) VALUES (%s,'short',%s)", (c, sp))


def test_the_admin_log_takes_the_two_actions_with_a_reason_detail_and_station(db):
    st, io, sp = people(db)
    ins = "INSERT INTO admin_action(actor_id,action,user_id,station_id,reason,detail) VALUES (%s,%s,%s,%s,%s,%s)"
    db.execute(ins, (sp, "acting_started", io, st, REASON, "sho until 2026-11-20"))
    db.execute(ins, (sp, "acting_ended", io, st, "The SHO is back from leave", "sho"))
    for bad in ((sp, "acting_started", io, st, "short", "sho"), (sp, "acting_started", io, st, REASON, None), (sp, "acting_ended", io, None, REASON, "sho")):
        with pytest.raises(psycopg.errors.CheckViolation):
            db.execute(ins, bad)
