"""The keep-as-written and masking rules at their edges: each test here was written because scripts/mutate_trigger_sql.py
changed a rule (took out a refusal, turned a comparison round, dropped a trigger event) and no database test noticed.
All data below is fictional.
"""
import datetime as dt
import uuid

import psycopg
import pytest

from test_schema import db, one, seed_case  # noqa: F401  (db is the fixture)

KEPT = psycopg.errors.RaiseException


def _item(db, fir, label="D-1"):
    return one(db, """INSERT INTO evidence_item(fir_id,label,description,kind,seized_at,seizure_memo)
                      VALUES (%s,%s,'Demo KYC form','document','2026-08-20 10:00+05:30','SM-1') RETURNING id""", fir, label)[0]


def _readiness_row(db, table, fir, io):
    """One live row of each readiness table that can only be withdrawn."""
    if table == "ingredient_evidence":
        return one(db, "INSERT INTO ingredient_evidence(fir_id,charge_id,ingredient_id,evidence_item_id,linked_by) VALUES (%s,'cheating','delivery',%s,%s) RETURNING id",
                   fir, _item(db, fir), io)[0]
    if table == "accused_link":
        acc = one(db, "INSERT INTO person(fir_id,role,label,full_name) VALUES (%s,'accused','A1','Demo Accused') RETURNING id", fir)[0]
        return one(db, "INSERT INTO accused_link(fir_id,person_id,link_type,evidence_item_id,linked_by) VALUES (%s,%s,'kyc_identification',%s,%s) RETURNING id",
                   fir, acc, _item(db, fir), io)[0]
    return one(db, "INSERT INTO readiness_override(fir_id,gap_key,reason,decided_by) VALUES (%s,'ingredient:cheating/delivery','Demo reason for the gap',%s) RETURNING id",
               fir, io)[0]


@pytest.mark.parametrize("table", ["ingredient_evidence", "accused_link", "readiness_override"])
def test_a_readiness_record_is_only_withdrawn_once_with_who_and_a_reason(db, table):
    st, io, fir = seed_case(db)
    row = _readiness_row(db, table, fir, io)
    withdraw = f"UPDATE {table} SET withdrawn_at=now(), withdrawn_by=%s, withdrawn_reason=%s WHERE id=%s"
    with pytest.raises(KEPT):
        db.execute(f"DELETE FROM {table} WHERE id=%s", (row,))
    with pytest.raises(KEPT):   # who withdrew it is needed
        db.execute(f"UPDATE {table} SET withdrawn_at=now(), withdrawn_reason='Linked to the wrong item' WHERE id=%s", (row,))
    with pytest.raises(KEPT):   # when is needed
        db.execute(f"UPDATE {table} SET withdrawn_by=%s, withdrawn_reason='Linked to the wrong item' WHERE id=%s", (io, row))
    with pytest.raises(KEPT):   # a reason of 10 characters, not 9 (spaces around do not count)
        db.execute(withdraw, (io, "  123456789  ", row))
    with pytest.raises(KEPT):   # nothing else may change with the withdrawal
        db.execute(f"UPDATE {table} SET withdrawn_at=now(), withdrawn_by=%s, withdrawn_reason='Linked to the wrong item', fir_id=fir_id, id=gen_random_uuid() WHERE id=%s", (io, row))
    db.execute(withdraw, (io, "1234567890", row))
    assert one(db, f"SELECT withdrawn_by, withdrawn_reason FROM {table} WHERE id=%s", row) == (io, "1234567890")
    with pytest.raises(KEPT):   # withdrawn once: not again, not changed
        db.execute(withdraw, (io, "A second reason, later on", row))
    with pytest.raises(KEPT):
        db.execute(f"DELETE FROM {table} WHERE id=%s", (row,))


def _other_fir(db, fir, no=215):
    return one(db, """INSERT INTO fir(station_id,fir_year,fir_no,gd_entry_no,registered_at,information_received_at,
                      contents_original,contents_language,action_taken) SELECT station_id,2026,%s,'GD-18',registered_at,
                      information_received_at,'Other demo text','mr','investigate' FROM fir WHERE id=%s RETURNING id""", no, fir)[0]


def _arrest(db, fir, io, label, remand=None):
    acc = one(db, "INSERT INTO person(fir_id,role,label,full_name) VALUES (%s,'accused',%s,'Demo Accused') RETURNING id", fir, label)[0]
    return one(db, """INSERT INTO arrest(person_id,arrested_at,place,grounds,informed_name,arresting_officer,max_punishment,
                      first_remand_on,remand_recorded_by,remand_recorded_at)
                      VALUES (%s,'2026-09-01 10:00+05:30','Demo place','{x}','Demo relative',%s,'life',%s,%s,%s) RETURNING id""",
               acc, io, remand, io if remand else None, dt.datetime.now(dt.timezone.utc) if remand else None)[0]


CORRECTIONS = {   # table: (make the parent record on a case, insert a correction of it superseding a given row)
    "arrest_correction": (
        lambda db, fir, io, n: _arrest(db, fir, io, f"A{n}"),
        "INSERT INTO arrest_correction(arrest_id,supersedes,first_remand_on,max_punishment,reason,recorded_by) VALUES (%s,%s,'2026-09-02','life','remand date was typed wrong',%s) RETURNING id"),
    "arrest_memo_correction": (
        lambda db, fir, io, n: _arrest(db, fir, io, f"A{n}"),
        "INSERT INTO arrest_memo_correction(arrest_id,supersedes,place,grounds,informed_name,reason,recorded_by) VALUES (%s,%s,'Demo market','{y}','Demo friend','place was the market',%s) RETURNING id"),
    "arrest_time_correction": (
        lambda db, fir, io, n: _arrest(db, fir, io, f"A{n}"),
        "INSERT INTO arrest_time_correction(arrest_id,supersedes,arrested_at,reason,recorded_by) VALUES (%s,%s,'2026-09-01 08:00+05:30','arrest was earlier that morning',%s) RETURNING id"),
    "closure_correction": (
        lambda db, fir, io, n: one(db, "INSERT INTO closure_report(fir_id,filed_on,court,report_no,ground,reason,recorded_by) VALUES (%s,'2026-10-01','Demo Court','FR-1','untraced','accused not traced',%s) RETURNING id", fir, io)[0],
        "INSERT INTO closure_correction(closure_id,supersedes,filed_on,court,report_no,ground,reason,correction_reason,recorded_by) VALUES (%s,%s,'2026-10-02','Demo Court','FR-1A','other','corrected report text','wrong report number entered',%s) RETURNING id"),
}


@pytest.mark.parametrize("table", sorted(CORRECTIONS))
def test_a_correction_replaces_only_a_correction_of_the_same_record(db, table):
    st, io, fir = seed_case(db)
    make, ins = CORRECTIONS[table]
    other_fir = _other_fir(db, fir) if table == "closure_correction" else fir
    mine, theirs = make(db, fir, io, 1), make(db, other_fir, io, 2)
    first = one(db, ins, mine, None, io)[0]
    foreign = one(db, ins, theirs, None, io)[0]
    with pytest.raises(psycopg.errors.CheckViolation):   # a real correction, but of another record
        db.execute(ins, (mine, foreign, io))
    one(db, ins, mine, first, io)   # its own: fine


def test_a_chargesheet_correction_replaces_only_a_chargesheet_of_the_same_case(db):
    st, io, fir = seed_case(db)
    other = _other_fir(db, fir)
    ins = "INSERT INTO chargesheet(fir_id,filed_on,court,report_no,recorded_by,supersedes,correction_reason) VALUES (%s,'2026-10-16','Demo Court',%s,%s,%s,%s) RETURNING id"
    mine = one(db, ins, fir, "CS-1", io, None, None)[0]
    theirs = one(db, ins, other, "CS-9", io, None, None)[0]
    with pytest.raises(psycopg.errors.CheckViolation):
        db.execute(ins, (fir, "CS-2", io, theirs, "replaces a chargesheet of another case"))
    one(db, ins, fir, "CS-2", io, mine, "filing date was wrong, it was the 16th")


def test_a_chargesheet_may_be_filed_on_the_day_the_fir_was_registered(db):
    st, io, fir = seed_case(db)   # registered 18 Aug 2026, 11:00 IST
    one(db, "INSERT INTO chargesheet(fir_id,filed_on,court,report_no,recorded_by) VALUES (%s,'2026-08-18','Demo Court','CS-1',%s) RETURNING id", fir, io)


def test_remand_and_release_corrections_may_fall_on_the_day_of_arrest(db):
    st, io, fir = seed_case(db)
    ar = _arrest(db, fir, io, "A1")   # arrested 1 Sep 2026 IST
    ins = "INSERT INTO arrest_correction(arrest_id,supersedes,first_remand_on,max_punishment,released_on,release_basis,reason,recorded_by) VALUES (%s,%s,%s,'life',%s,%s,%s,%s) RETURNING id"
    c1 = one(db, ins, ar, None, "2026-09-01", None, None, "remanded the same day", io)[0]
    one(db, ins, ar, c1, "2026-09-01", "2026-09-01", "bail", "released on bail the same day", io)
    with pytest.raises(psycopg.errors.CheckViolation):   # but the release not the day before
        db.execute(ins, (ar, None, "2026-09-01", "2026-08-31", "bail", "released before the arrest", io))


def test_an_arrest_time_correction_is_never_in_the_future_even_without_a_remand(db):
    st, io, fir = seed_case(db)
    ar = _arrest(db, fir, io, "A1")   # no remand, no release on record
    ins = "INSERT INTO arrest_time_correction(arrest_id,arrested_at,reason,recorded_by) VALUES (%s,%s,'the time was typed wrong',%s) RETURNING id"
    with pytest.raises(psycopg.errors.CheckViolation):
        db.execute(ins, (ar, dt.datetime.now(dt.timezone.utc) + dt.timedelta(hours=1), io))
    one(db, ins, ar, dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=1), io)   # an hour ago is fine


def test_an_arrest_time_correction_may_fall_on_the_day_of_the_remand_or_release(db):
    st, io, fir = seed_case(db)
    ar = _arrest(db, fir, io, "A1", remand="2026-09-02")
    db.execute("UPDATE arrest SET released_on='2026-09-02', release_basis='bail', release_recorded_by=%s, release_recorded_at=now() WHERE id=%s", (io, ar))
    ins = "INSERT INTO arrest_time_correction(arrest_id,supersedes,arrested_at,reason,recorded_by) VALUES (%s,%s,%s,'arrest was a day later',%s) RETURNING id"
    with pytest.raises(psycopg.errors.CheckViolation):   # the day after them
        db.execute(ins, (ar, None, "2026-09-03 00:30+05:30", io))
    one(db, ins, ar, None, "2026-09-02 23:00+05:30", io)   # the same IST day as the remand and the release


def _kept_rows(db, st, io, fir):
    """One row of each log or record the mutation run found could lose a trigger event unnoticed: {table: (update, delete)}."""
    one(db, "INSERT INTO fir_io_assignment(fir_id,from_io,to_io,assigned_by) VALUES (%s,NULL,%s,%s) RETURNING id", fir, io, io)
    one(db, "INSERT INTO sign_in_attempt(username_tried,user_id,outcome) VALUES ('demo.io',%s,'ok') RETURNING id", io)
    acc = one(db, "INSERT INTO person(fir_id,role,label,full_name) VALUES (%s,'accused','A1','Demo Accused') RETURNING id", fir)[0]
    acc2 = one(db, "INSERT INTO person(fir_id,role,label,full_name) VALUES (%s,'accused','A2','Demo Accused') RETURNING id", fir)[0]
    db.execute("INSERT INTO account_holder(person_id,fir_id,basis,marked_by) VALUES (%s,%s,'Demo bank reply',%s)", (acc, fir, io))
    cs = one(db, "INSERT INTO chargesheet(fir_id,filed_on,court,report_no,recorded_by) VALUES (%s,'2026-10-15','Demo Court','CS-1',%s) RETURNING id", fir, io)[0]
    db.execute("INSERT INTO chargesheet_accused VALUES (%s,%s)", (cs, acc))
    closure = one(db, "INSERT INTO closure_report(fir_id,filed_on,court,report_no,ground,reason,recorded_by) VALUES (%s,'2026-10-01','Demo Court','FR-1','untraced','accused not traced',%s) RETURNING id", fir, io)[0]
    one(db, "INSERT INTO closure_correction(closure_id,filed_on,court,report_no,ground,reason,correction_reason,recorded_by) VALUES (%s,'2026-10-02','Demo Court','FR-1A','other','corrected report text','wrong report number entered',%s) RETURNING id", closure, io)
    db.execute("INSERT INTO closure_decision(closure_id,decision,decided_on,recorded_by) VALUES (%s,'accepted','2026-10-05',%s)", (closure, io))
    db.execute("INSERT INTO case_playbook(fir_id,playbook_id,playbook_version,chosen_by) VALUES (%s,'cyber_fraud','1',%s)", (fir, io))
    return {
        "fir_io_assignment": ("UPDATE fir_io_assignment SET reason='changed afterwards, quietly'", "DELETE FROM fir_io_assignment"),
        "sign_in_attempt": ("UPDATE sign_in_attempt SET outcome='wrong_password'", "DELETE FROM sign_in_attempt"),
        "account_holder": ("UPDATE account_holder SET basis='Another basis entirely'", "DELETE FROM account_holder"),
        "chargesheet_accused": (f"UPDATE chargesheet_accused SET person_id='{acc2}'", "DELETE FROM chargesheet_accused"),
        "closure_correction": ("UPDATE closure_correction SET court='Elsewhere'", "DELETE FROM closure_correction"),
        "closure_decision": ("UPDATE closure_decision SET decision='further_investigation'", "DELETE FROM closure_decision"),
        "case_playbook_choice": ("UPDATE case_playbook_choice SET playbook_id='theft'", "DELETE FROM case_playbook_choice"),
    }


@pytest.mark.parametrize("table", ["fir_io_assignment", "sign_in_attempt", "account_holder", "chargesheet_accused",
                                   "closure_correction", "closure_decision", "case_playbook_choice"])
@pytest.mark.parametrize("change", ["update", "delete"])
def test_logs_and_records_are_neither_changed_nor_deleted(db, table, change):
    st, io, fir = seed_case(db)
    sql = _kept_rows(db, st, io, fir)[table][change == "delete"]
    with pytest.raises(KEPT):
        db.execute(sql)


@pytest.mark.parametrize("table", ["account_holder", "accused_link"])
def test_only_an_accused_of_the_case_is_an_account_holder_or_carries_an_accused_link(db, table):
    st, io, fir = seed_case(db)
    item = _item(db, fir)
    insert = {"account_holder": "INSERT INTO account_holder(person_id,fir_id,basis,marked_by) VALUES (%s,%s,'Demo bank reply',%s)",
              "accused_link": f"INSERT INTO accused_link(fir_id,person_id,link_type,evidence_item_id,linked_by) VALUES (%s,%s,'kyc_identification','{item}',%s)"}[table]
    args = (lambda p: (p, fir, io)) if table == "account_holder" else (lambda p: (fir, p, io))
    acc = one(db, "INSERT INTO person(fir_id,role,label,full_name) VALUES (%s,'accused','A1','Demo Accused') RETURNING id", fir)[0]
    for role in ("victim", "witness", "complainant"):   # an accused exists in the case, but this person is not one
        p = one(db, "INSERT INTO person(fir_id,role,label,full_name) VALUES (%s,%s,%s,'Demo Person') RETURNING id", fir, role, role[0].upper() + "1")[0]
        with pytest.raises(psycopg.errors.CheckViolation):
            db.execute(insert, args(p))
    db.execute(insert, args(acc))


def test_a_hash_may_be_recorded_later_on_an_item_seized_without_one(db):
    st, io, fir = seed_case(db)
    item = _item(db, fir)   # a document, seized without a hash
    db.execute("UPDATE evidence_item SET sha256=%s WHERE id=%s", ("c" * 64, item))
    with pytest.raises(KEPT):
        db.execute("UPDATE evidence_item SET sha256=%s WHERE id=%s", ("d" * 64, item))


def test_a_crpc_notice_is_refused_for_an_fir_registered_on_1_july_2024_itself(db):
    st, io, fir = seed_case(db)
    notice = """INSERT INTO notice(fir_id,kind,addressee,items_requested,body,signed_by,issued_at,status)
                VALUES (%s,'CrPC_160','Demo Witness','{}','Demo body',%s,'2024-07-10 10:00+05:30','sent') RETURNING id"""
    fir_on = lambda no, at: one(db, """INSERT INTO fir(station_id,fir_year,fir_no,gd_entry_no,registered_at,information_received_at,
                      contents_original,contents_language,action_taken) VALUES (%s,2024,%s,'GD-1',%s,%s,'Demo old complaint','en','investigate')
                      RETURNING id""", st, no, at, at)[0]
    with pytest.raises(psycopg.errors.CheckViolation):   # 00:10 IST on 1 July is still 30 June in UTC
        db.execute(notice, (fir_on(301, "2024-07-01 00:10+05:30"), io))
    one(db, notice, fir_on(302, "2024-06-30 23:50+05:30"), io)


@pytest.mark.parametrize("table", ["closure_report", "closure_correction"])
def test_a_closure_report_may_be_filed_on_the_day_the_fir_was_registered(db, table):
    st, io, fir = seed_case(db)   # registered 18 Aug 2026
    ins = "INSERT INTO closure_report(fir_id,filed_on,court,report_no,ground,reason,recorded_by) VALUES (%s,%s,'Demo Court','FR-1','untraced','accused not traced',%s) RETURNING id"
    if table == "closure_report":
        one(db, ins, fir, "2026-08-18", io)
        return
    closure = one(db, ins, fir, "2026-10-01", io)[0]
    one(db, "INSERT INTO closure_correction(closure_id,filed_on,court,report_no,ground,reason,correction_reason,recorded_by) VALUES (%s,'2026-08-18','Demo Court','FR-1A','other','corrected report text','the date was the day of the FIR',%s) RETURNING id",
        closure, io)


SIGNED = """INSERT INTO complaint(station_id,received_at,mode,informant_name,kind,text_original,text_language,recorded_by,
            signed_at,signed_recorded_by,outcome,fir_id,outcome_at,outcome_by)
            VALUES (%s,%s,%s,'Demo Informant','other','Demo information as given','mr',%s,%s,%s,%s,%s,%s,%s) RETURNING id"""


def test_a_complaint_entered_already_signed_is_checked_as_well(db):
    st, io, fir = seed_case(db)   # this FIR has other text
    with pytest.raises(psycopg.errors.CheckViolation):   # e-information signed after three days
        db.execute(SIGNED, (st, "2026-08-10 10:30+05:30", "electronic", io, "2026-08-14 10:30+05:30", io, None, None, None, None))
    with pytest.raises(psycopg.errors.CheckViolation):   # an FIR that does not carry its text
        db.execute(SIGNED, (st, "2026-08-18 10:30+05:30", "written", io, "2026-08-18 10:40+05:30", io, "fir", fir, "2026-08-18 11:00+05:30", io))
    one(db, SIGNED, st, "2026-08-10 10:30+05:30", "electronic", io, "2026-08-12 10:30+05:30", io, None, None, None, None)


ENQUIRY = """UPDATE complaint SET enquiry_at=%s, enquiry_by=%s, enquiry_permitted_by='Demo DSP', enquiry_reason='Demo: punishable 3 to 7 years'
             WHERE id=%s"""


def test_a_closed_complaint_cannot_go_to_a_preliminary_enquiry_afterwards(db):
    st, io, fir = seed_case(db)
    c = one(db, SIGNED, st, "2026-08-18 10:30+05:30", "written", io, "2026-08-18 10:40+05:30", io, None, None, None, None)[0]
    db.execute("UPDATE complaint SET outcome='ncr', outcome_reason='Demo: non-cognizable, entered in the NCR', outcome_at='2026-08-18 12:00+05:30', outcome_by=%s WHERE id=%s", (io, c))
    with pytest.raises(KEPT):   # even dated before the closing, so the table's own date check passes
        db.execute(ENQUIRY, ("2026-08-18 11:00+05:30", io, c))


def test_an_open_complaint_goes_to_an_enquiry_then_closes_and_its_contact_may_still_be_updated(db):
    st, io, fir = seed_case(db)
    c = one(db, SIGNED, st, "2026-08-18 10:30+05:30", "written", io, "2026-08-18 10:40+05:30", io, None, None, None, None)[0]
    db.execute(ENQUIRY, ("2026-08-18 11:00+05:30", io, c))
    db.execute("UPDATE complaint SET outcome='no_offence', outcome_reason='Demo: the enquiry found no offence', outcome_at='2026-08-25 12:00+05:30', outcome_by=%s WHERE id=%s", (io, c))
    db.execute("UPDATE complaint SET informant_contact='Demo contact' WHERE id=%s", (c,))


def test_an_arrest_time_correction_may_be_five_minutes_ahead_of_the_clock_but_not_more(db):
    # now() is the time the transaction started, so the same statement can write the exact edge
    st, io, fir = seed_case(db)
    ar = _arrest(db, fir, io, "A1")
    ins = "INSERT INTO arrest_time_correction(arrest_id,arrested_at,reason,recorded_by) VALUES (%s,{},'the device clock was fast',%s)"
    with pytest.raises(psycopg.errors.CheckViolation):
        db.execute(ins.format("now() + interval '5 minutes 1 second'"), (ar, io))
    db.execute(ins.format("now() + interval '5 minutes'"), (ar, io))


# ---- a signed complaint keeps every field the informant signed, and the signature, outcome and enquiry are each
# ---- recorded once (BNSS 173(1)); found by leaving one column out of the trigger's kept-as-written comparison

def _signed_complaint(db):
    st, io, fir = seed_case(db)
    db.execute("INSERT INTO police_station(state_code,district_id,name) VALUES ('IN',district_id_of('IN','Demo City'),'Demo Second PS')")
    db.execute("INSERT INTO app_user(full_name,rank,role,station_id) VALUES ('Demo Clerk','HC','front_desk',%s)", (st,))
    c = one(db, SIGNED, st, "2026-08-18 10:30+05:30", "written", io, "2026-08-18 10:40+05:30", io, None, None, None, None)[0]
    return st, io, c


CLERK = "(SELECT id FROM app_user WHERE full_name='Demo Clerk')"


@pytest.mark.parametrize("change", [
    "text_original='Changed words'", "text_language='en'", "received_at='2026-08-18 10:20+05:30'", "mode='electronic'",
    "informant_name='Demo Other'", "kind='theft'", "station_id=(SELECT id FROM police_station WHERE name='Demo Second PS')",
    "signed_at='2026-08-18 10:50+05:30'", f"signed_recorded_by={CLERK}", "read_back_language='en'",
])
def test_a_signed_complaint_keeps_each_signed_field_and_its_signature(db, change):
    st, io, c = _signed_complaint(db)
    with pytest.raises(KEPT):
        db.execute(f"UPDATE complaint SET {change} WHERE id=%s", (c,))


@pytest.mark.parametrize("change", [
    "outcome='no_offence'", "outcome_reason='Demo: another reason entirely'", "outcome_at='2026-08-19 10:00+05:30'", f"outcome_by={CLERK}",
])
def test_the_outcome_of_a_complaint_is_recorded_once_field_by_field(db, change):
    st, io, c = _signed_complaint(db)
    db.execute("UPDATE complaint SET outcome='ncr', outcome_reason='Demo: non-cognizable, entered in the NCR', outcome_at='2026-08-18 12:00+05:30', outcome_by=%s WHERE id=%s", (io, c))
    with pytest.raises(KEPT):
        db.execute(f"UPDATE complaint SET {change} WHERE id=%s", (c,))


def test_the_fir_a_complaint_became_is_kept(db):
    st, io, c = _signed_complaint(db)
    same = """INSERT INTO fir(station_id,fir_year,fir_no,gd_entry_no,registered_at,information_received_at,contents_original,
              contents_language,action_taken) VALUES (%s,2026,%s,'GD-18','2026-08-18 11:00+05:30','2026-08-18 10:30+05:30',
              'Demo information as given','mr','investigate') RETURNING id"""
    f1, f2 = one(db, same, st, 215)[0], one(db, same, st, 216)[0]
    db.execute("UPDATE complaint SET outcome='fir', fir_id=%s, outcome_at='2026-08-18 11:00+05:30', outcome_by=%s WHERE id=%s", (f1, io, c))
    with pytest.raises(KEPT):
        db.execute("UPDATE complaint SET fir_id=%s WHERE id=%s", (f2, c))


@pytest.mark.parametrize("change", [
    "enquiry_at='2026-08-19 10:00+05:30'", f"enquiry_by={CLERK}", "enquiry_permitted_by='Demo DSP Two'",
    "enquiry_reason='Demo: another reason entirely'",
])
def test_a_preliminary_enquiry_is_recorded_once_field_by_field(db, change):
    st, io, c = _signed_complaint(db)
    db.execute(ENQUIRY, ("2026-08-18 11:00+05:30", io, c))
    with pytest.raises(KEPT):
        db.execute(f"UPDATE complaint SET {change} WHERE id=%s", (c,))


def test_a_sign_out_is_kept_as_written(db):
    # weekly test audit 7 Nov 2026: V38 had no database test
    st, io, fir = seed_case(db)
    jti = one(db, "INSERT INTO signed_out_token(jti,user_id,expires_at) VALUES (gen_random_uuid(),%s,now() + interval '8 hours') RETURNING jti", io)[0]
    with pytest.raises(psycopg.errors.RaiseException):   # a sign-out cannot be taken back, so the old token stays refused
        db.execute("DELETE FROM signed_out_token WHERE jti=%s", (jti,))
    with pytest.raises(psycopg.errors.RaiseException):
        db.execute("UPDATE signed_out_token SET expires_at=now() WHERE jti=%s", (jti,))
