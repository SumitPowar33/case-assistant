"""Applies every Flyway migration (V1, V2, ...) to a throwaway PostgreSQL database and checks the legal rules it encodes.

Run: DATABASE_URL=postgresql://user:pass@localhost/db python -m pytest -q apps/core/db-tests
All data below is fictional.
"""
import datetime as dt
import os
import pathlib
import uuid

import psycopg
import pytest

MIGRATIONS = sorted((pathlib.Path(__file__).parents[1] / "src/main/resources/db/migration").glob("V*__*.sql"),
                    key=lambda p: int(p.name[1:].split("__")[0]))
URL = os.environ.get("DATABASE_URL", "postgresql://caseapp:caseapp@localhost/caseapp_test")


@pytest.fixture()
def db():
    schema = "t_" + uuid.uuid4().hex[:10]
    conn = psycopg.connect(URL, autocommit=True)
    conn.execute(f"CREATE SCHEMA {schema}")
    conn.execute(f"SET search_path TO {schema}, public")
    for m in MIGRATIONS:
        conn.execute(m.read_text())
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
    b = one(db, "SELECT id FROM certificate_63_4 WHERE part='B'")[0]
    with pytest.raises(psycopg.errors.RaiseException):
        db.execute("UPDATE certificate_63_4 SET hash_value=%s WHERE part='B'", ("1" * 64,))
    with pytest.raises(psycopg.errors.RaiseException):
        db.execute("DELETE FROM certificate_63_4")
    fix = """INSERT INTO certificate_63_4(item_id,part,signer_name,device_type,hash_algo,hash_value,signed_at,place,supersedes,correction_reason)
             VALUES (%s,%s,'Demo signer','server',%s,%s,now(),'Demo City',%s,%s) RETURNING id"""
    b2 = one(db, fix, item, "B", "SHA256", "1" * 64, b, "typing error in hash")[0]   # a wrong correction
    assert one(db, "SELECT hashes_match, court_ready FROM electronic_item_readiness") == (False, False)
    one(db, fix, item, "B", "SHA256", h, b2, "hash re-read from the device")          # corrected again
    assert one(db, "SELECT court_ready FROM electronic_item_readiness")[0] is True


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
    db.execute("""INSERT INTO arrest(person_id,arrested_at,place,grounds,informed_name,arresting_officer,first_remand_on,max_punishment,
                  remand_recorded_by,remand_recorded_at)
                  VALUES (%s,'2026-09-12 07:00+05:30','Demo place','{proper investigation}','Demo relative',%s,'2026-09-12','less_than_10_years',%s,now())""", (a2, io, io))
    db.execute("""INSERT INTO notice(fir_id,kind,addressee,items_requested,body,signed_by,issued_at,reply_due_on,status)
                  VALUES (%s,'BNSS_94','Bank of Demo','{statements}','Demo body',%s,now(),'2026-10-30','sent')""", (fir, io))
    rows = dict(db.execute("SELECT kind, due_on FROM case_deadline").fetchall())
    assert rows["chargesheet_custody"] == dt.date(2026, 11, 10)
    assert rows["sexual_offence_investigation"] == dt.date(2026, 10, 18)
    assert rows["victim_progress_update"] == dt.date(2026, 11, 16)
    assert rows["notice_reply:Bank of Demo"] == dt.date(2026, 10, 30)


ARREST = """INSERT INTO arrest(person_id,arrested_at,place,grounds,informed_name,arresting_officer,max_punishment,recorded_by)
             VALUES (%s,'2026-09-12 00:30+05:30','Demo place','{proper investigation}','Demo relative',%s,'life',%s) RETURNING id"""


def test_arrest_only_of_an_accused_and_kept_as_written(db):
    st, io, fir = seed_case(db)
    w1 = one(db, "INSERT INTO person(fir_id,role,label,full_name) VALUES (%s,'witness','W1','Demo Witness') RETURNING id", fir)[0]
    with pytest.raises(psycopg.errors.RaiseException):
        db.execute(ARREST, (w1, io, io))
    a1 = one(db, "INSERT INTO person(fir_id,role,label,full_name) VALUES (%s,'accused','A1','Demo Accused') RETURNING id", fir)[0]
    arrest = one(db, ARREST, a1, io, io)[0]
    with pytest.raises(psycopg.errors.RaiseException):
        db.execute("UPDATE arrest SET max_punishment='less_than_10_years'")
    with pytest.raises(psycopg.errors.CheckViolation):  # 11 Sep is before the arrest day in IST (12 Sep, 00:30 IST = 11 Sep UTC)
        db.execute("UPDATE arrest SET first_remand_on='2026-09-11', remand_recorded_by=%s, remand_recorded_at=now()", (io,))
    with pytest.raises(psycopg.errors.CheckViolation):  # who recorded the remand is needed
        db.execute("UPDATE arrest SET first_remand_on='2026-09-13'")
    db.execute("UPDATE arrest SET first_remand_on='2026-09-12', remand_recorded_by=%s, remand_recorded_at=now()", (io,))
    assert one(db, "SELECT due_on FROM case_deadline WHERE kind='chargesheet_custody'")[0] == dt.date(2026, 12, 10)
    with pytest.raises(psycopg.errors.RaiseException):  # only once
        db.execute("UPDATE arrest SET first_remand_on='2026-09-13', remand_recorded_at=now()")
    with pytest.raises(psycopg.errors.RaiseException):
        db.execute("DELETE FROM arrest WHERE id=%s", (arrest,))


def test_release_and_chargesheet_stop_the_custody_limit(db):
    st, io, fir = seed_case(db, sexual=True)
    remanded = """INSERT INTO arrest(person_id,arrested_at,place,grounds,informed_name,arresting_officer,max_punishment,
                  first_remand_on,remand_recorded_by,remand_recorded_at)
                  VALUES (%s,%s,'Demo place','{proper investigation}','Demo relative',%s,%s,%s,%s,now()) RETURNING id"""
    a1 = one(db, "INSERT INTO person(fir_id,role,label,full_name) VALUES (%s,'accused','A1','Demo One') RETURNING id", fir)[0]
    a2 = one(db, "INSERT INTO person(fir_id,role,label,full_name) VALUES (%s,'accused','A2','Demo Two') RETURNING id", fir)[0]
    r1 = one(db, remanded, a1, "2026-09-01 10:00+05:30", io, "less_than_10_years", "2026-09-01", io)[0]   # last day 30 Oct
    one(db, remanded, a2, "2026-09-12 10:00+05:30", io, "less_than_10_years", "2026-09-12", io)         # last day 10 Nov
    due = lambda kind: [r[0] for r in db.execute("SELECT due_on FROM case_deadline WHERE kind=%s", (kind,))]
    assert due("chargesheet_custody") == [dt.date(2026, 10, 30)]
    with pytest.raises(psycopg.errors.CheckViolation):   # release before the arrest day
        db.execute("UPDATE arrest SET released_on='2026-08-31', release_basis='bail', release_recorded_by=%s, release_recorded_at=now() WHERE id=%s", (io, r1))
    with pytest.raises(psycopg.errors.CheckViolation):   # a release needs its basis
        db.execute("UPDATE arrest SET released_on='2026-09-05', release_recorded_by=%s, release_recorded_at=now() WHERE id=%s", (io, r1))
    db.execute("UPDATE arrest SET released_on='2026-09-05', release_basis='bail', release_recorded_by=%s, release_recorded_at=now() WHERE id=%s", (io, r1))
    assert due("chargesheet_custody") == [dt.date(2026, 11, 10)]   # A1 is out on bail: A2's limit is next
    with pytest.raises(psycopg.errors.RaiseException):   # the release is recorded once
        db.execute("UPDATE arrest SET released_on='2026-09-06', release_recorded_at=now() WHERE id=%s", (r1,))
    with pytest.raises(psycopg.errors.RaiseException):   # the memo itself stays as written
        db.execute("UPDATE arrest SET place='Elsewhere' WHERE id=%s", (r1,))
    assert due("sexual_offence_investigation") == [dt.date(2026, 10, 18)]
    with pytest.raises(psycopg.errors.RaiseException):   # before the FIR was registered (18 Aug)
        db.execute("INSERT INTO chargesheet(fir_id,filed_on,court,report_no,recorded_by) VALUES (%s,'2026-08-17','Demo Court','CS-1',%s)", (fir, io))
    cs = one(db, "INSERT INTO chargesheet(fir_id,filed_on,court,report_no,recorded_by) VALUES (%s,'2026-10-15','Demo Court','CS-1',%s) RETURNING id", fir, io)[0]
    w1 = one(db, "INSERT INTO person(fir_id,role,label,full_name) VALUES (%s,'witness','W1','Demo Witness') RETURNING id", fir)[0]
    with pytest.raises(psycopg.errors.RaiseException):   # only accused of this case
        db.execute("INSERT INTO chargesheet_accused VALUES (%s,%s)", (cs, w1))
    db.execute("INSERT INTO chargesheet_accused VALUES (%s,%s)", (cs, a2))
    assert due("chargesheet_custody") == [] and due("sexual_offence_investigation") == []
    assert due("victim_progress_update") == [dt.date(2026, 11, 16)]
    with pytest.raises(psycopg.errors.RaiseException):
        db.execute("UPDATE chargesheet SET filed_on='2026-10-16'")
    with pytest.raises(psycopg.errors.RaiseException):
        db.execute("DELETE FROM chargesheet_accused")


def test_corrections_replace_without_changing_the_old_record(db):
    st, io, fir = seed_case(db, sexual=True)
    a1 = one(db, "INSERT INTO person(fir_id,role,label,full_name) VALUES (%s,'accused','A1','Demo One') RETURNING id", fir)[0]
    ar = one(db, """INSERT INTO arrest(person_id,arrested_at,place,grounds,informed_name,arresting_officer,max_punishment,
                    first_remand_on,remand_recorded_by,remand_recorded_at)
                    VALUES (%s,'2026-09-01 10:00+05:30','Demo place','{x}','Demo relative',%s,'less_than_10_years','2026-09-02',%s,now())
                    RETURNING id""", a1, io, io)[0]
    due = lambda kind: [r[0] for r in db.execute("SELECT due_on FROM case_deadline WHERE kind=%s", (kind,))]
    current = lambda: one(db, "SELECT first_remand_on, max_punishment, released_on FROM arrest_current WHERE id=%s", ar)
    assert due("chargesheet_custody") == [dt.date(2026, 10, 31)] and current()[2] is None
    ins = "INSERT INTO arrest_correction(arrest_id,supersedes,first_remand_on,max_punishment,released_on,release_basis,reason,recorded_by) VALUES (%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id"
    with pytest.raises(psycopg.errors.CheckViolation):   # remand before the arrest day
        db.execute(ins, (ar, None, "2026-08-31", "life", None, None, "wrong date typed", io))
    with pytest.raises(psycopg.errors.CheckViolation):   # a reason is needed
        db.execute(ins, (ar, None, "2026-09-03", "life", None, None, "typo", io))
    c1 = one(db, ins, ar, None, "2026-09-03", "life", None, None, "remand was on the 3rd, not the 2nd", io)[0]
    assert current() == (dt.date(2026, 9, 3), "life", None)
    assert due("chargesheet_custody") == [dt.date(2026, 12, 1)]   # 90 days from 3 Sep
    assert one(db, "SELECT first_remand_on FROM arrest WHERE id=%s", ar)[0] == dt.date(2026, 9, 2)   # the memo is untouched
    with pytest.raises(psycopg.errors.UniqueViolation):   # the first correction can only be made once
        db.execute(ins, (ar, None, "2026-09-04", "life", None, None, "second first correction", io))
    c2 = one(db, ins, ar, c1, "2026-09-03", "life", "2026-09-10", "bail", "release was recorded in error before", io)[0]
    assert current()[2] == dt.date(2026, 9, 10) and due("chargesheet_custody") == []
    one(db, ins, ar, c2, "2026-09-03", "life", None, None, "release was recorded on the wrong arrest", io)
    assert current()[2] is None and due("chargesheet_custody") == [dt.date(2026, 12, 1)]
    with pytest.raises(psycopg.errors.UniqueViolation):   # c2 has already been replaced
        db.execute(ins, (ar, c2, "2026-09-03", "life", None, None, "replacing it a second time", io))
    with pytest.raises(psycopg.errors.RaiseException):
        db.execute("UPDATE arrest_correction SET reason='something else entirely'")
    with pytest.raises(psycopg.errors.RaiseException):
        db.execute("DELETE FROM arrest_correction")

    cs = one(db, "INSERT INTO chargesheet(fir_id,filed_on,court,report_no,recorded_by) VALUES (%s,'2026-10-15','Demo Court','CS-1',%s) RETURNING id", fir, io)[0]
    db.execute("INSERT INTO chargesheet_accused VALUES (%s,%s)", (cs, a1))
    assert due("chargesheet_custody") == [] and due("sexual_offence_investigation") == []
    cins = "INSERT INTO chargesheet(fir_id,filed_on,court,report_no,recorded_by,supersedes,correction_reason) VALUES (%s,%s,'Demo Court','CS-1',%s,%s,%s) RETURNING id"
    with pytest.raises(psycopg.errors.CheckViolation):
        db.execute(cins, (fir, "2026-10-16", io, cs, "typo"))
    cs2 = one(db, cins, fir, "2026-10-16", io, cs, "filing date was wrong, it was the 16th")[0]
    with pytest.raises(psycopg.errors.UniqueViolation):   # one chargesheet is replaced once
        db.execute(cins, (fir, "2026-10-17", io, cs, "replacing it a second time"))
    with pytest.raises(psycopg.errors.UniqueViolation):   # a plain new chargesheet cannot reuse a number
        db.execute("INSERT INTO chargesheet(fir_id,filed_on,court,report_no,recorded_by) VALUES (%s,'2026-10-16','Demo Court','CS-1',%s)", (fir, io))
    # The replacement names nobody yet, so the accused is not covered and the limit runs again.
    assert due("chargesheet_custody") == [dt.date(2026, 12, 1)]
    db.execute("INSERT INTO chargesheet_accused VALUES (%s,%s)", (cs2, a1))
    assert due("chargesheet_custody") == [] and one(db, "SELECT chargesheet_filed_for(%s)", a1)[0] == dt.date(2026, 10, 16)


def test_notice_must_be_signed_before_sent(db):
    st, io, fir = seed_case(db)
    with pytest.raises(psycopg.errors.CheckViolation):
        db.execute("INSERT INTO notice(fir_id,kind,addressee,items_requested,body,status) VALUES (%s,'BNSS_94','Bank','{x}','b','sent')", (fir,))
    with pytest.raises(psycopg.errors.CheckViolation):
        db.execute("INSERT INTO notice(fir_id,kind,addressee,body) VALUES (%s,'BNSS_94','Bank','b')", (fir,))


def add_section(conn, fir, act, section):
    conn.execute("INSERT INTO fir_section(fir_id,act,section) VALUES (%s,%s,%s)", (fir, act, section))


def test_victim_masked_by_section_even_without_the_flag(db):
    st, io, fir = seed_case(db, sexual=False)
    db.execute("""INSERT INTO person(fir_id,role,label,full_name,phone) VALUES
                  (%s,'victim','V1','Demo Name','9000000000'), (%s,'complainant','C1','Demo Parent','9000000002'),
                  (%s,'witness','W1','Demo Witness','9000000003')""", (fir, fir, fir))
    assert one(db, "SELECT display_name FROM person_public WHERE label='V1'")[0] == "Demo Name"
    add_section(db, fir, "BNS", "64(1)")
    rows = {r[0]: r[1:] for r in db.execute("SELECT label, display_name, phone, identity_masked FROM person_public")}
    assert rows["V1"] == ("Victim V1", None, True)
    assert rows["C1"] == ("Complainant C1", None, True)
    assert rows["W1"] == ("Demo Witness", "9000000003", False)


def test_any_pocso_section_masks_the_victim(db):
    st, io, fir = seed_case(db)
    db.execute("INSERT INTO person(fir_id,role,label,full_name) VALUES (%s,'victim','V1','Demo Child')", (fir,))
    add_section(db, fir, "POCSO Act", "12")
    assert one(db, "SELECT display_name FROM person_public")[0] == "Victim V1"


@pytest.mark.parametrize("act,section,applies", [
    ("BNS", "64(1)", True), ("BNS", "70(2)", True), ("BNS", "69", False),
    ("POCSO Act", "6", True), ("POCSO Act", "12", False), ("BNS", "318(4)", False),
])
def test_bnss_193_2_follows_the_listed_sections(db, act, section, applies):
    st, io, fir = seed_case(db, sexual=True)
    add_section(db, fir, act, section)
    kinds = [r[0] for r in db.execute("SELECT kind FROM case_deadline")]
    assert ("sexual_offence_investigation" in kinds) is applies


def test_deadlines_count_the_indian_calendar_day(db):
    st, io, fir = seed_case(db)
    db.execute("SET TIME ZONE 'UTC'")
    db.execute("UPDATE fir SET registered_at='2026-10-01 01:00+05:30', information_received_at='2026-10-01 00:30+05:30'")
    due = one(db, "SELECT due_on FROM case_deadline WHERE kind='victim_progress_update'")[0]
    assert due == dt.date(2026, 12, 30)   # 1 Oct IST + 90 days, not 30 Sep (UTC date)


def test_evidence_hash_cannot_change_once_recorded(db):
    st, io, fir = seed_case(db)
    db.execute("""INSERT INTO evidence_item(fir_id,label,description,kind,seized_at,seizure_memo,sha256)
                  VALUES (%s,'214/E-12','Phone','electronic',now(),'N-02',%s)""", (fir, "a" * 64))
    with pytest.raises(psycopg.errors.RaiseException):
        db.execute("UPDATE evidence_item SET sha256=%s", ("b" * 64,))
    db.execute("UPDATE evidence_item SET description='Phone (black)'")   # other fields may still be corrected


def test_login_fields_need_a_clean_unique_username(db):
    st, io, fir = seed_case(db)
    with pytest.raises(psycopg.errors.CheckViolation):
        db.execute("UPDATE app_user SET password_hash='{bcrypt}x'")              # a password needs a username
    with pytest.raises(psycopg.errors.CheckViolation):
        db.execute("UPDATE app_user SET username='Has Spaces'")
    db.execute("UPDATE app_user SET username='a.deshmukh', password_hash='{bcrypt}x'")
    with pytest.raises(psycopg.errors.UniqueViolation):
        db.execute("INSERT INTO app_user(full_name,rank,role,username) VALUES ('B. Fictional','HC','front_desk','a.deshmukh')")
    assert one(db, "SELECT active FROM app_user WHERE id=%s", io)[0] is True


def test_63_4_corrections_must_follow_the_rules_and_other_hashes_are_not_trusted(db):
    st, io, fir = seed_case(db)
    h = "ab" * 32
    ins = """INSERT INTO evidence_item(fir_id,label,description,kind,seized_at,seizure_memo,sha256)
             VALUES (%s,%s,'Phone','electronic',now(),'N-01',%s) RETURNING id"""
    item, other = one(db, ins, fir, "E-1", h)[0], one(db, ins, fir, "E-2", h)[0]
    cert = """INSERT INTO certificate_63_4(item_id,part,signer_name,device_type,hash_algo,hash_value,signed_at,place,supersedes,correction_reason)
              VALUES (%s,%s,'Demo signer','phone',%s,%s,now(),'Demo City',%s,%s) RETURNING id"""
    a = one(db, cert, item, "A", "SHA256", h, None, None)[0]
    one(db, cert, item, "B", "MD5", "c" * 32, None, None)
    assert one(db, "SELECT court_ready FROM electronic_item_readiness WHERE id=%s", item)[0] is False   # MD5 cannot be checked
    with pytest.raises(psycopg.errors.UniqueViolation):
        one(db, cert, item, "A", "SHA256", h, None, None)                    # a second original Part A
    with pytest.raises(psycopg.errors.CheckViolation):
        one(db, cert, item, "A", "SHA256", h, a, "  ")                       # a correction needs a reason
    with pytest.raises(psycopg.errors.CheckViolation):
        one(db, cert, item, "B", "SHA256", h, a, "wrong part")               # must be the same part
    with pytest.raises(psycopg.errors.CheckViolation):
        one(db, cert, other, "A", "SHA256", h, a, "wrong item")              # and the same item
    one(db, cert, item, "A", "SHA256", h, a, "signer's designation added")
    with pytest.raises(psycopg.errors.UniqueViolation):
        one(db, cert, item, "A", "SHA256", h, a, "second correction of the same one")


def test_account_holders_and_accused_links_stay_inside_their_case(db):
    st, io, fir = seed_case(db)
    other = one(db, """INSERT INTO fir(station_id,fir_year,fir_no,gd_entry_no,registered_at,information_received_at,
                       contents_original,contents_language,action_taken) SELECT station_id,2026,215,'GD-18',registered_at,
                       information_received_at,'Other demo text','mr','investigate' FROM fir WHERE id=%s RETURNING id""", fir)[0]
    acc = one(db, "INSERT INTO person(fir_id,role,label,full_name) VALUES (%s,'accused','A1','Demo Accused') RETURNING id", fir)[0]
    item = one(db, """INSERT INTO evidence_item(fir_id,label,description,kind,seized_at,seizure_memo)
                      VALUES (%s,'D-1','Demo KYC form','document','2026-08-20 10:00+05:30','SM-1') RETURNING id""", fir)[0]
    with pytest.raises(psycopg.errors.ForeignKeyViolation):  # accused of this case, marked under another FIR
        db.execute("INSERT INTO account_holder(person_id,fir_id,basis,marked_by) VALUES (%s,%s,'Demo bank reply',%s)", (acc, other, io))
    db.execute("INSERT INTO account_holder(person_id,fir_id,basis,marked_by) VALUES (%s,%s,'Demo bank reply',%s)", (acc, fir, io))
    db.execute("""INSERT INTO accused_link(fir_id,person_id,link_type,evidence_item_id,linked_by)
                  VALUES (%s,%s,'kyc_identification',%s,%s)""", (fir, acc, item, io))
    with pytest.raises(psycopg.errors.RaiseException):
        db.execute("DELETE FROM account_holder")


def test_admin_log_needs_reasons_and_is_kept_as_written(db):
    st, io, fir = seed_case(db)
    admin = one(db, "INSERT INTO app_user(full_name,rank,role) VALUES ('Demo Admin','Admin','state_admin') RETURNING id")[0]
    with pytest.raises(psycopg.errors.CheckViolation):  # disabling needs a reason of 10+ characters
        db.execute("INSERT INTO admin_action(actor_id,action,user_id,reason) VALUES (%s,'user_disabled',%s,'  short  ')", (admin, io))
    with pytest.raises(psycopg.errors.CheckViolation):  # a station action names a station, not a user
        db.execute("INSERT INTO admin_action(actor_id,action,user_id) VALUES (%s,'station_created',%s)", (admin, io))
    with pytest.raises(psycopg.errors.CheckViolation):  # a user action names a user
        db.execute("INSERT INTO admin_action(actor_id,action,station_id) VALUES (%s,'user_created',%s)", (admin, st))
    db.execute("INSERT INTO admin_action(actor_id,action,user_id,reason) VALUES (%s,'user_unlocked',%s,'Officer called from the station')", (admin, io))
    db.execute("INSERT INTO sign_in_attempt(username_tried,user_id,outcome) VALUES ('demo.io',%s,'unlocked_by_admin')", (io,))
    with pytest.raises(psycopg.errors.RaiseException):
        db.execute("UPDATE admin_action SET reason = 'changed afterwards'")
    with pytest.raises(psycopg.errors.RaiseException):
        db.execute("DELETE FROM admin_action")


def test_memo_corrections_replace_without_changing_the_memo(db):
    st, io, fir = seed_case(db)
    a1 = one(db, "INSERT INTO person(fir_id,role,label,full_name) VALUES (%s,'accused','A1','Demo One') RETURNING id", fir)[0]
    ar = one(db, """INSERT INTO arrest(person_id,arrested_at,place,grounds,informed_name,arresting_officer,max_punishment)
                    VALUES (%s,'2026-09-01 10:00+05:30','Demo place','{x}','Demo relative',%s,'life') RETURNING id""", a1, io)[0]
    now = lambda: one(db, "SELECT place, grounds, informed_name, memo_correction_id FROM arrest_memo_current WHERE id=%s", ar)
    assert now() == ("Demo place", ["x"], "Demo relative", None)
    ins = "INSERT INTO arrest_memo_correction(arrest_id,supersedes,place,grounds,informed_name,reason,recorded_by) VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING id"
    with pytest.raises(psycopg.errors.CheckViolation):   # a reason is needed
        db.execute(ins, (ar, None, "Demo market", ["y"], "Demo friend", "typo", io))
    with pytest.raises(psycopg.errors.CheckViolation):   # grounds are needed
        db.execute(ins, (ar, None, "Demo market", [], "Demo friend", "grounds were left out", io))
    c1 = one(db, ins, ar, None, "Demo market", ["y"], "Demo friend", "place was the market", io)[0]
    assert now()[:3] == ("Demo market", ["y"], "Demo friend")
    assert one(db, "SELECT place FROM arrest WHERE id=%s", ar)[0] == "Demo place"   # the memo is untouched
    with pytest.raises(psycopg.errors.UniqueViolation):   # the first correction can only be made once
        db.execute(ins, (ar, None, "Demo lane", ["y"], "Demo friend", "second first correction", io))
    one(db, ins, ar, c1, "Demo lane", ["y", "z"], "Demo friend", "place was the lane", io)
    assert now()[:2] == ("Demo lane", ["y", "z"])
    with pytest.raises(psycopg.errors.UniqueViolation):   # c1 has already been replaced
        db.execute(ins, (ar, c1, "Demo lane", ["y"], "Demo friend", "replacing it a second time", io))
    with pytest.raises(psycopg.errors.RaiseException):
        db.execute("UPDATE arrest_memo_correction SET reason='something else entirely'")
    with pytest.raises(psycopg.errors.RaiseException):
        db.execute("DELETE FROM arrest_memo_correction")
