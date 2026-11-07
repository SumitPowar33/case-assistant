"""V48: the search and seizure memo (BNSS 103, 105, 185), checked straight in the database. All data is fictional."""
import psycopg
import pytest

from test_schema import db, one, seed_case  # noqa: F401  (db is the fixture)

REFUSED = (psycopg.errors.RaiseException, psycopg.errors.CheckViolation)
SHA = "ab" * 32
START, END = "2026-10-21 07:00+05:30", "2026-10-21 07:40+05:30"


def _memo(db, fir, io, witnesses=2, recordings=1, reason=None, start=START, end=END):
    """Writes one memo in one transaction, as the API does; returns its id."""
    with db.transaction():
        s = one(db, """INSERT INTO search_seizure(fir_id,place,grounds,started_at,ended_at,no_witness_reason,recorded_by)
                       VALUES (%s,'Fictional house, Demo City','Information that the stolen phones are kept here',%s,%s,%s,%s) RETURNING id""",
                fir, start, end, reason, io)[0]
        for i in range(witnesses):
            db.execute("INSERT INTO search_witness(search_id,fir_id,name,address) VALUES (%s,%s,%s,'Fictional lane, Demo City')", (s, fir, f"Fictional Witness {i}"))
        for i in range(recordings):
            db.execute("INSERT INTO search_recording(search_id,fir_id,sha256,seconds) VALUES (%s,%s,%s,221)", (s, fir, f"{i:02x}" * 32))
    return s


def test_a_memo_needs_its_recording_and_two_witnesses_or_the_reason(db):
    st, io, fir = seed_case(db)
    s = _memo(db, fir, io)
    assert one(db, "SELECT count(*) FROM search_witness WHERE search_id=%s", s)[0] == 2
    with pytest.raises(REFUSED):   # BNSS 105: no recording
        _memo(db, fir, io, recordings=0)
    with pytest.raises(REFUSED):   # BNSS 103(4): one witness and no reason
        _memo(db, fir, io, witnesses=1)
    _memo(db, fir, io, witnesses=0, reason="No one of the locality agreed to come; two attempts")
    assert one(db, "SELECT count(*) FROM search_seizure WHERE fir_id=%s", fir)[0] == 2   # the refused ones left nothing behind


def test_nothing_joins_a_frozen_memo_and_nothing_in_it_changes(db):
    st, io, fir = seed_case(db)
    s = _memo(db, fir, io)
    with pytest.raises(REFUSED):
        db.execute("INSERT INTO search_witness(search_id,fir_id,name,address) VALUES (%s,%s,'Fictional Late','Fictional lane, Demo City')", (s, fir))
    with pytest.raises(REFUSED):
        db.execute("INSERT INTO search_recording(search_id,fir_id,sha256,seconds) VALUES (%s,%s,%s,10)", (s, fir, SHA))
    with pytest.raises(REFUSED):
        db.execute("""INSERT INTO evidence_item(fir_id,label,description,kind,seized_at,seizure_memo,search_id)
                      VALUES (%s,'E-09','Fictional late item','physical','2026-10-21 07:30+05:30','SM-9',%s)""", (fir, s))
    item = one(db, """INSERT INTO evidence_item(fir_id,label,description,kind,seized_at,seizure_memo)
                      VALUES (%s,'E-10','Fictional item','physical','2026-10-21 07:30+05:30','SM-10') RETURNING id""", fir)[0]
    with pytest.raises(REFUSED):   # an item seized otherwise is not moved into a memo afterwards
        db.execute("UPDATE evidence_item SET search_id=%s WHERE id=%s", (s, item))
    for sql in ("UPDATE search_seizure SET place='Fictional other place' WHERE id=%s", "DELETE FROM search_seizure WHERE id=%s",
                "UPDATE search_witness SET name='Fictional Changed' WHERE search_id=%s", "DELETE FROM search_witness WHERE search_id=%s",
                "UPDATE search_recording SET seconds=1 WHERE search_id=%s", "DELETE FROM search_recording WHERE search_id=%s"):
        with pytest.raises(REFUSED):
            db.execute(sql, (s,))


def test_an_item_seized_in_the_search_is_written_with_the_memo(db):
    st, io, fir = seed_case(db)
    with db.transaction():
        s = one(db, """INSERT INTO search_seizure(fir_id,place,grounds,started_at,ended_at,no_witness_reason,recorded_by)
                       VALUES (%s,'Fictional house','Fictional grounds of the search',%s,%s,'Fictional reason for no witnesses',%s) RETURNING id""", fir, START, END, io)[0]
        db.execute("INSERT INTO search_recording(search_id,fir_id,sha256,seconds) VALUES (%s,%s,%s,60)", (s, fir, SHA))
        db.execute("""INSERT INTO evidence_item(fir_id,label,description,kind,seized_at,seizure_memo,seal_no,search_id)
                      VALUES (%s,'E-03','Fictional phone, black','physical',%s,'Search memo','214/E-03',%s)""", (fir, END, s))
    assert one(db, "SELECT search_id FROM evidence_item WHERE label='E-03'")[0] == s


def test_times_hashes_and_the_case_are_checked(db):
    st, io, fir = seed_case(db)
    with pytest.raises(REFUSED):   # ends before it starts
        _memo(db, fir, io, start=END, end=START)
    with pytest.raises(REFUSED):   # before the information of the case was received (18 Aug 2026, 10:30)
        _memo(db, fir, io, start="2026-08-18 09:00+05:30", end="2026-08-18 09:30+05:30")
    with pytest.raises(REFUSED):   # written ahead of time
        _memo(db, fir, io, start="2026-10-21 07:00+05:30", end="2099-01-01 00:00+05:30")
    with pytest.raises(REFUSED):   # a hash is 64 hex characters
        with db.transaction():
            s = one(db, "INSERT INTO search_seizure(fir_id,place,grounds,started_at,ended_at,no_witness_reason,recorded_by) VALUES (%s,'Fictional house','Fictional grounds','2026-10-21 07:00+05:30','2026-10-21 07:10+05:30','Fictional reason, none came',%s) RETURNING id", fir, io)[0]
            db.execute("INSERT INTO search_recording(search_id,fir_id,sha256,seconds) VALUES (%s,%s,'ABC',60)", (s, fir))
    other = one(db, """INSERT INTO fir(station_id,fir_year,fir_no,gd_entry_no,registered_at,information_received_at,contents_original,contents_language,action_taken,io_id)
                       VALUES (%s,2026,215,'GD-18','2026-08-19 11:00+05:30','2026-08-19 10:30+05:30','Demo text','mr','investigate',%s) RETURNING id""", st, io)[0]
    with pytest.raises(psycopg.errors.ForeignKeyViolation):   # a witness of a memo of another case
        with db.transaction():
            s = one(db, "INSERT INTO search_seizure(fir_id,place,grounds,started_at,ended_at,no_witness_reason,recorded_by) VALUES (%s,'Fictional house','Fictional grounds',%s,%s,'Fictional reason, none came',%s) RETURNING id", fir, START, END, io)[0]
            db.execute("INSERT INTO search_recording(search_id,fir_id,sha256,seconds) VALUES (%s,%s,%s,60)", (s, fir, SHA))
            db.execute("INSERT INTO search_witness(search_id,fir_id,name,address) VALUES (%s,%s,'Fictional Witness','Fictional lane, Demo City')", (s, other))


def test_the_recording_is_sent_to_the_magistrate_once_after_the_search(db):
    st, io, fir = seed_case(db)
    s = _memo(db, fir, io)
    add = "INSERT INTO search_forward(search_id,fir_id,forwarded_on,forwarded_to,recorded_by) VALUES (%s,%s,%s,'Fictional JMFC, Demo City',%s)"
    with pytest.raises(REFUSED):   # before the search
        db.execute(add, (s, fir, "2026-10-20", io))
    with pytest.raises(REFUSED):   # in the future
        db.execute(add, (s, fir, "2099-01-01", io))
    db.execute(add, (s, fir, "2026-10-21", io))
    with pytest.raises(psycopg.errors.UniqueViolation):
        db.execute(add, (s, fir, "2026-10-22", io))
    with pytest.raises(REFUSED):
        db.execute("UPDATE search_forward SET forwarded_on='2026-10-22' WHERE search_id=%s", (s,))
    with pytest.raises(REFUSED):
        db.execute("DELETE FROM search_forward WHERE search_id=%s", (s,))
