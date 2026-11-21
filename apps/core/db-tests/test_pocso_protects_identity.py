"""V63 (weekly review of 21 Nov 2026): a POCSO case by age is protected like any POCSO case; the medical examination may be
recorded before the information; an imported FIR has no 24-hour POCSO deadline. All data is fictional."""
import psycopg
import pytest

from test_schema import add_section, db, one, seed_case  # noqa: F401  (db is the fixture)

REQ = "7d0c3f1e-2b4a-4c55-9a77-0f1e2d3c4b5a"
FACT = """INSERT INTO fir_fact(fir_id,kind,value,ai_value,quote,ai_request_id,confirmed_by)
          VALUES (%s,'amount','Rs 40,000','Rs 40,000','Demo complaint text',%s,%s)"""


def victim(db, fir, age, role="victim"):
    return one(db, "INSERT INTO person(fir_id,role,label,full_name,phone,age_years) VALUES (%s,%s,'V1','Fictional Child','9000000001',%s) RETURNING id",
               fir, role, age)[0]


@pytest.mark.parametrize("act,section", [("BNS", "75(1)"), ("BNS", "79"), ("IPC", "354"), ("IPC", "509")])
def test_a_child_victim_of_a_sexual_offence_fir_is_masked_before_any_pocso_section(db, act, section):
    st, io, fir = seed_case(db)
    add_section(db, fir, act, section)
    p = victim(db, fir, 15)
    assert one(db, "SELECT pocso_case(%s), identity_protected_case(%s)", fir, fir) == (True, True)
    assert one(db, "SELECT display_name, phone, identity_masked FROM person_public WHERE id=%s", p) == ("Victim V1", None, True)
    with pytest.raises(psycopg.errors.CheckViolation):    # and no AI result is taken (V55)
        db.execute(FACT, (fir, REQ, io))


@pytest.mark.parametrize("age,role,act,section", [
    (18, "victim", "BNS", "75(1)"),        # an adult victim of the same offence
    (15, "witness", "BNS", "75(1)"),       # a child who is not the victim
    (15, "victim", "BNS", "303(2)"),       # a child victim of a theft
])
def test_without_a_child_victim_of_a_sexual_offence_nothing_changes(db, age, role, act, section):
    st, io, fir = seed_case(db)
    add_section(db, fir, act, section)
    p = victim(db, fir, age, role)
    assert one(db, "SELECT identity_protected_case(%s)", fir)[0] is False
    assert one(db, "SELECT display_name FROM person_public WHERE id=%s", p)[0] == "Fictional Child"
    db.execute(FACT, (fir, REQ, io))


def test_the_medical_examination_may_be_before_the_information_the_report_may_not(db):
    st, io, fir = seed_case(db)          # information received 18 Aug 2026 10:30 IST
    add_section(db, fir, "POCSO Act", "4")
    ins = "INSERT INTO pocso_step(fir_id,step,done_at,recorded_by) VALUES (%s,%s,'2026-08-18 08:00+05:30',%s)"
    db.execute(ins, (fir, "medical_examination", io))                 # the hospital examined the child, then told the police
    for step in ("cwc_court_report", "statement_chosen_place", "magistrate_statement", "support_person", "interim_compensation"):
        with pytest.raises(psycopg.errors.CheckViolation, match="before the information"):
            db.execute(ins, (fir, step, io))
    assert "pocso_medical_examination" not in {r[0] for r in db.execute("SELECT kind FROM case_deadline WHERE fir_id=%s", (fir,))}


def test_an_imported_fir_has_no_24_hour_pocso_deadline_but_its_steps_stay_open(db):
    st, io, fir = seed_case(db)
    add_section(db, fir, "POCSO Act", "4")
    b = one(db, """INSERT INTO import_batch(station_id,entity,profile,filename,file_sha256,complaint_language,rows_total,created_by)
                   VALUES (%s,'fir','fir-generic','f.csv','00','en',1,%s) RETURNING id""", st, io)[0]
    kinds = lambda: {r[0] for r in db.execute("SELECT kind FROM case_deadline WHERE fir_id=%s", (fir,))}  # noqa: E731
    assert {"pocso_cwc_court_report", "pocso_medical_examination"} <= kinds()
    db.execute("UPDATE fir SET import_batch_id = %s WHERE id=%s", (b, fir))
    assert not any(k.startswith("pocso_") for k in kinds())
    assert "sexual_offence_investigation" in kinds()                   # the other deadlines of the case are unchanged
    assert one(db, "SELECT pocso_case(%s)", fir)[0] is True
