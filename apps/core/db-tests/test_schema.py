"""Applies V1__core.sql to a throwaway PostgreSQL database and checks the legal rules it encodes.

Run: DATABASE_URL=postgresql://user:pass@localhost/db python -m pytest -q apps/core/db-tests
All data below is fictional.
"""
import datetime as dt
import os
import pathlib
import uuid

import psycopg
import pytest

MIGRATION = pathlib.Path(__file__).parents[1] / "src/main/resources/db/migration/V1__core.sql"
URL = os.environ.get("DATABASE_URL", "postgresql://caseapp:caseapp@localhost/caseapp_test")


@pytest.fixture()
def db():
    schema = "t_" + uuid.uuid4().hex[:10]
    conn = psycopg.connect(URL, autocommit=True)
    conn.execute(f"CREATE SCHEMA {schema}")
    conn.execute(f"SET search_path TO {schema}, public")
    conn.execute(MIGRATION.read_text())
    yield conn
    conn.execute(f"DROP SCHEMA {schema} CASCADE")
    conn.close()


def one(conn, sql, *args):
    return conn.execute(sql, args).fetchone()


def seed_case(conn, sexual=False):
    conn.execute("INSERT INTO state_pack VALUES ('IN','National pack','1.0','{en,hi}','pilot')")
    st = one(conn, "INSERT INTO police_station(state_code,district,name) VALUES ('IN','Demo City','Demo City Cyber PS') RETURNING id")[0]
    io = one(conn, "INSERT INTO app_user(full_name,rank,role,station_id) VALUES ('A. Deshmukh','SI','io',%s) RETURNING id", st)[0]
    fir = one(conn, """INSERT INTO fir(station_id,fir_year,fir_no,gd_entry_no,registered_at,information_received_at,
                       contents_original,contents_language,action_taken,io_id,sexual_offence)
                       VALUES (%s,2026,214,'GD-17','2026-08-18 11:00+05:30','2026-08-18 10:30+05:30',
                       'Demo complaint text','mr','investigate',%s,%s) RETURNING id""", st, io, sexual)[0]
    return st, io, fir


def test_fir_number_unique_per_station_and_year(db):
    st, io, fir = seed_case(db)
    with pytest.raises(psycopg.errors.UniqueViolation):
        db.execute("""INSERT INTO fir(station_id,fir_year,fir_no,gd_entry_no,registered_at,information_received_at,
                      contents_original,contents_language,action_taken) VALUES (%s,2026,214,'GD-18',now(),now(),'x','mr','investigate')""", (st,))


def test_zero_fir_needs_outside_place_and_refusal_needs_reason(db):
    st, io, fir = seed_case(db)
    with pytest.raises(psycopg.errors.CheckViolation):
        db.execute("""INSERT INTO fir(station_id,fir_year,fir_no,gd_entry_no,registered_at,information_received_at,
                      contents_original,contents_language,action_taken,is_zero_fir) VALUES (%s,2026,215,'GD-19',now(),now(),'x','mr','transferred',true)""", (st,))
    with pytest.raises(psycopg.errors.CheckViolation):
        db.execute("""INSERT INTO fir(station_id,fir_year,fir_no,gd_entry_no,registered_at,information_received_at,
                      contents_original,contents_language,action_taken) VALUES (%s,2026,216,'GD-20',now(),now(),'x','mr','refused')""", (st,))


def test_victim_identity_masked_in_public_view(db):
    st, io, fir = seed_case(db, sexual=True)
    db.execute("""INSERT INTO person(fir_id,role,label,full_name,phone,address_present,identity_masked)
                  VALUES (%s,'victim','V1','Demo Name','9000000000','Demo address',true)""", (fir,))
    name, phone, addr = one(db, "SELECT display_name, phone, address_present FROM person_public WHERE label='V1'")
    assert name == "Victim V1" and phone is None and addr is None


def test_electronic_item_needs_valid_hash(db):
    st, io, fir = seed_case(db)
    with pytest.raises(psycopg.errors.CheckViolation):
        db.execute("""INSERT INTO evidence_item(fir_id,label,description,kind,seized_at,seizure_memo)
                      VALUES (%s,'214/E-03','Phone','electronic',now(),'214/S-03')""", (fir,))
    with pytest.raises(psycopg.errors.CheckViolation):
        db.execute("""INSERT INTO evidence_item(fir_id,label,description,kind,seized_at,seizure_memo,sha256)
                      VALUES (%s,'214/E-03','Phone','electronic',now(),'214/S-03','not-a-hash')""", (fir,))


def test_custody_log_is_append_only(db):
    st, io, fir = seed_case(db)
    item = one(db, """INSERT INTO evidence_item(fir_id,label,description,kind,seized_at,seizure_memo,seal_no)
                      VALUES (%s,'214/E-04','SIM cards','physical',now(),'214/S-03','214/E-04') RETURNING id""", fir)[0]
    db.execute("""INSERT INTO custody_event(item_id,at,handed_by,received_by,location,purpose,seal_intact)
                  VALUES (%s,now(),'SI Deshmukh','HC Pawar','Rack B-3','deposit',true)""", (item,))
    with pytest.raises(psycopg.errors.RaiseException):
        db.execute("UPDATE custody_event SET seal_intact=false")
    with pytest.raises(psycopg.errors.RaiseException):
        db.execute("DELETE FROM custody_event")


def test_63_4_readiness_needs_both_parts_and_matching_hash(db):
    st, io, fir = seed_case(db)
    h = "9f2c" + "0" * 56 + "a41e"
    item = one(db, """INSERT INTO evidence_item(fir_id,label,description,kind,seized_at,seizure_memo,sha256)
                      VALUES (%s,'214/E-11','Bank statement','electronic',now(),'N-01',%s) RETURNING id""", fir, h)[0]
    cert = """INSERT INTO certificate_63_4(item_id,part,signer_name,device_type,hash_algo,hash_value,signed_at,place)
              VALUES (%s,%s,'Demo signer','server','SHA256',%s,now(),'Demo City')"""
    db.execute(cert, (item, "A", h))
    assert one(db, "SELECT has_part_a, has_part_b, court_ready FROM electronic_item_readiness") == (True, False, False)
    db.execute(cert, (item, "B", h.upper()))
    assert one(db, "SELECT court_ready FROM electronic_item_readiness")[0] is True
    db.execute("UPDATE certificate_63_4 SET hash_value=%s WHERE part='B'", ("1" * 64,))
    assert one(db, "SELECT hashes_match, court_ready FROM electronic_item_readiness") == (False, False)


@pytest.mark.parametrize("remand,punishment,expected", [
    ("2026-09-12", "less_than_10_years", "2026-11-10"),   # day 1 = 12 Sep, day 60 = 10 Nov
    ("2026-09-12", "10_years_or_more", "2026-12-10"),     # day 90
    ("2026-09-12", "life", "2026-12-10"),
    ("2027-12-31", "less_than_10_years", "2028-02-28"),   # across a year end and before leap day
])
def test_chargesheet_last_day(db, remand, punishment, expected):
    assert one(db, "SELECT chargesheet_last_day(%s::date, %s)", remand, punishment)[0] == dt.date.fromisoformat(expected)


def test_deadlines_view(db):
    st, io, fir = seed_case(db, sexual=True)
    a2 = one(db, "INSERT INTO person(fir_id,role,label,full_name) VALUES (%s,'accused','A2','Demo Accused') RETURNING id", fir)[0]
    db.execute("""INSERT INTO arrest(person_id,arrested_at,place,grounds,informed_name,arresting_officer,first_remand_on,max_punishment)
                  VALUES (%s,'2026-09-12 07:00+05:30','Demo place','{proper investigation}','Demo relative',%s,'2026-09-12','less_than_10_years')""", (a2, io))
    db.execute("""INSERT INTO notice(fir_id,kind,addressee,items_requested,body,signed_by,issued_at,reply_due_on,status)
                  VALUES (%s,'BNSS_94','Bank of Demo','{statements}','Demo body',%s,now(),'2026-10-30','sent')""", (fir, io))
    rows = dict(db.execute("SELECT kind, due_on FROM case_deadline").fetchall())
    assert rows["chargesheet_custody"] == dt.date(2026, 11, 10)
    assert rows["sexual_offence_investigation"] == dt.date(2026, 10, 18)
    assert rows["victim_progress_update"] == dt.date(2026, 11, 16)
    assert rows["notice_reply:Bank of Demo"] == dt.date(2026, 10, 30)


def test_notice_must_be_signed_before_sent(db):
    st, io, fir = seed_case(db)
    with pytest.raises(psycopg.errors.CheckViolation):
        db.execute("INSERT INTO notice(fir_id,kind,addressee,items_requested,body,status) VALUES (%s,'BNSS_94','Bank','{x}','b','sent')", (fir,))
    with pytest.raises(psycopg.errors.CheckViolation):
        db.execute("INSERT INTO notice(fir_id,kind,addressee,body) VALUES (%s,'BNSS_94','Bank','b')", (fir,))
