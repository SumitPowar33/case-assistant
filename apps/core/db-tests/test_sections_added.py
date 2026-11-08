"""V51: sections added to an FIR during the investigation (AI section suggestion, A2), and which law the offence falls
under (BNS from 1 July 2024 India time, IPC before). All data is fictional."""
import psycopg
import pytest

from test_schema import db, one, seed_case  # noqa: F401  (db is the fixture)

REQ = "7d0c3f1e-2b4a-4c55-9a77-0f1e2d3c4b5a"
REASON = "The text says the caller posed as a bank officer"


def add(db, fir, io, act="BNS", section="319(2)", reason=REASON, req=REQ):
    db.execute("""INSERT INTO fir_section(fir_id,act,section,chosen_by,added_at,reason,ai_request_id)
                  VALUES (%s,%s,%s,%s,clock_timestamp(),%s,%s)""", (fir, act, section, io, reason, req))


def law(db, fir):
    return one(db, "SELECT fir_offence_law(%s)", fir)[0]


def times(db, fir, received, start=None, end=None):
    db.execute("UPDATE fir SET information_received_at=%s, registered_at=greatest(registered_at,%s::timestamptz), occurrence_from=%s, occurrence_to=%s WHERE id=%s",
               (received, received, start, end, fir))


@pytest.mark.parametrize("received,start,end,expected", [
    ("2026-08-18 10:30+05:30", None, None, "unknown"),                       # time of the offence not recorded
    ("2024-07-01 00:00+05:30", None, None, "unknown"),                       # information on the first day of the BNS
    ("2024-06-30 23:59+05:30", None, None, "old"),                           # information the minute before: the offence too
    ("2024-07-01 05:29+05:30", None, None, "unknown"),                       # 30 June in UTC, 1 July in India
    ("2026-08-18 10:30+05:30", "2024-07-01 00:00+05:30", None, "new"),       # the first minute
    ("2026-08-18 10:30+05:30", "2024-06-30 23:59+05:30", None, "old"),       # the last minute of the IPC
    ("2026-08-18 10:30+05:30", "2024-06-30 23:59+05:30", "2024-06-30 23:59+05:30", "old"),
    ("2026-08-18 10:30+05:30", "2024-06-20 10:00+05:30", "2024-07-01 00:00+05:30", "spans"),
    ("2026-08-18 10:30+05:30", "2024-06-20 10:00+05:30", "2024-07-10 10:00+05:30", "spans"),
    ("2026-08-18 10:30+05:30", "2024-07-02 10:00+05:30", "2024-07-10 10:00+05:30", "new"),
    ("2026-08-18 10:30+05:30", None, "2024-06-30 23:59+05:30", "old"),       # only the end known, before
    ("2026-08-18 10:30+05:30", None, "2024-07-01 00:00+05:30", "unknown"),   # only the end known, after: could have begun before
])
def test_the_law_of_the_offence_follows_1_july_2024_in_india_time(db, received, start, end, expected):
    st, io, fir = seed_case(db)
    times(db, fir, received, start, end)
    assert law(db, fir) == expected


def test_an_added_section_keeps_who_when_why_and_the_ai_request(db):
    st, io, fir = seed_case(db)
    add(db, fir, io)
    row = one(db, "SELECT chosen_by, added_at IS NOT NULL, reason, ai_request_id::text FROM fir_section WHERE fir_id=%s", fir)
    assert row == (io, True, REASON, REQ)
    # a section of the registration has none of them
    db.execute("INSERT INTO fir_section(fir_id,act,section) VALUES (%s,'BNS','318(4)')", (fir,))


@pytest.mark.parametrize("change", [
    "reason=NULL", "ai_request_id=NULL", "chosen_by=NULL", "reason='too short'", "reason=repeat('x',2001)", "reason='          x'",
])
def test_an_added_section_is_all_or_nothing_and_its_reason_is_10_to_2000_characters(db, change):
    st, io, fir = seed_case(db)
    cols = {"chosen_by": "%(io)s", "reason": "%(reason)s", "ai_request_id": "%(req)s"}
    name, value = change.split("=", 1)
    cols[name] = value
    with pytest.raises(psycopg.errors.CheckViolation):
        db.execute(f"""INSERT INTO fir_section(fir_id,act,section,chosen_by,added_at,reason,ai_request_id)
                       VALUES (%(fir)s,'BNS','319(2)',{cols['chosen_by']},clock_timestamp(),{cols['reason']},{cols['ai_request_id']})""",
                   {"fir": fir, "io": io, "reason": REASON, "req": REQ})


@pytest.mark.parametrize("column", ["reason", "ai_request_id"])
def test_a_registration_section_cannot_carry_a_reason_or_request_without_the_time_it_was_added(db, column):
    st, io, fir = seed_case(db)
    with pytest.raises(psycopg.errors.CheckViolation):
        db.execute(f"INSERT INTO fir_section(fir_id,act,section,{column}) VALUES (%s,'BNS','318(4)',%s)",
                   (fir, REASON if column == "reason" else REQ))


def test_a_bns_section_cannot_be_added_for_an_offence_under_the_ipc(db):
    st, io, fir = seed_case(db)
    times(db, fir, "2026-08-18 10:30+05:30", "2024-06-30 23:59+05:30")
    with pytest.raises(psycopg.errors.CheckViolation, match="IPC"):
        add(db, fir, io)
    add(db, fir, io, act="IPC", section="420")       # the old law is taken
    add(db, fir, io, act="IT Act", section="66D")    # an act the BNS did not replace is taken
    # the registration's own sections are the record as made: not checked here
    db.execute("INSERT INTO fir_section(fir_id,act,section) VALUES (%s,'BNS','318(4)')", (fir,))


def test_an_ipc_section_cannot_be_added_for_an_offence_under_the_bns(db):
    st, io, fir = seed_case(db)
    times(db, fir, "2026-08-18 10:30+05:30", "2024-07-01 00:00+05:30")
    with pytest.raises(psycopg.errors.CheckViolation, match="BNS"):
        add(db, fir, io, act="IPC", section="420")
    add(db, fir, io)
    db.execute("INSERT INTO fir_section(fir_id,act,section) VALUES (%s,'IPC','420')", (fir,))   # an import's record as made


@pytest.mark.parametrize("law_of", ["spans", "unknown"])
def test_either_law_may_be_added_when_a_person_must_decide(db, law_of):
    st, io, fir = seed_case(db)
    if law_of == "spans":
        times(db, fir, "2026-08-18 10:30+05:30", "2024-06-20 10:00+05:30", "2024-07-10 10:00+05:30")
    assert law(db, fir) == law_of
    add(db, fir, io)
    add(db, fir, io, act="IPC", section="420")


def test_an_added_section_is_kept_as_written_and_once(db):
    st, io, fir = seed_case(db)
    add(db, fir, io)
    with pytest.raises(psycopg.errors.UniqueViolation):
        add(db, fir, io)
    for sql in ("UPDATE fir_section SET reason='another reason here' WHERE fir_id=%s", "DELETE FROM fir_section WHERE fir_id=%s"):
        with pytest.raises(psycopg.errors.RaiseException):
            db.execute(sql, (fir,))


def test_an_added_sexual_offence_section_protects_the_victim(db):
    st, io, fir = seed_case(db)
    assert one(db, "SELECT identity_protected_case(%s)", fir)[0] is False
    add(db, fir, io, section="64(1)")
    assert one(db, "SELECT identity_protected_case(%s)", fir)[0] is True
