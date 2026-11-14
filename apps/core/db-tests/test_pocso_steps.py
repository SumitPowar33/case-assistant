"""V56: POCSO case mode, the legal steps of a POCSO case and their 24-hour deadlines. All data is fictional."""
import psycopg
import pytest

from test_schema import add_section, db, one, seed_case  # noqa: F401  (db is the fixture)


def kinds(db, fir):
    return {r[0]: (r[1], r[2]) for r in db.execute("SELECT kind, due_on, basis FROM case_deadline WHERE fir_id=%s", (fir,))}


def child_victim(db, fir, age=12):
    db.execute("INSERT INTO person(fir_id,role,label,identity_known,age_years) VALUES (%s,'victim','V1',false,%s)", (fir, age))


@pytest.mark.parametrize("act,section,age,pocso", [
    ("POCSO Act", "4", None, True), ("POCSO Act", "12", 30, True),        # a POCSO section is enough, whatever the age
    ("BNS", "64(1)", 12, True), ("BNS", "79", 17, True), ("BNS", "74", 15, True),
    ("IPC", "354A", 16, True), ("IPC", "376(2)", 9, True), ("IPC", "509", 11, True),
    ("BNS", "64(1)", 18, False), ("BNS", "64(1)", None, False),         # adult or age not recorded
    ("BNS", "63", 12, False), ("BNS", "80", 12, False), ("BNS", "303(2)", 12, False),   # not a sexual offence
    ("BNS", "124(1)", 12, False),                                          # acid attack: masked, but not POCSO
    ("IPC", "355", 12, False), ("IT Act", "67", 12, False),
])
def test_which_cases_are_pocso_cases(db, act, section, age, pocso):
    st, io, fir = seed_case(db)
    if age is not None:
        child_victim(db, fir, age)
    add_section(db, fir, act, section)
    assert one(db, "SELECT pocso_case(%s)", fir)[0] is pocso
    assert ("pocso_cwc_court_report" in kinds(db, fir)) is pocso


def test_a_child_witness_or_accused_does_not_make_a_pocso_case(db):
    st, io, fir = seed_case(db)
    db.execute("INSERT INTO person(fir_id,role,label,full_name,age_years) VALUES (%s,'witness','W1','Fictional Child',10), (%s,'accused','A1','Fictional Youth',16)", (fir, fir))
    add_section(db, fir, "BNS", "64(1)")
    assert one(db, "SELECT pocso_case(%s)", fir)[0] is False


def test_the_fir_flag_with_a_child_victim_is_a_pocso_case_before_any_section(db):
    st, io, fir = seed_case(db, sexual=True)
    assert one(db, "SELECT pocso_case(%s)", fir)[0] is False
    child_victim(db, fir)
    assert one(db, "SELECT pocso_case(%s)", fir)[0] is True


def test_the_two_24_hour_steps_count_from_the_information_in_india_time(db):
    st, io, fir = seed_case(db)          # information received 18 Aug 2026 10:30 IST, registered 11:00
    add_section(db, fir, "POCSO Act", "8")
    k = kinds(db, fir)
    for kind, basis in (("pocso_cwc_court_report", "POCSO 19(6)"), ("pocso_medical_examination", "POCSO 27; BNSS 184(1)")):
        due, text = k[kind]
        assert str(due) == "2026-08-19"
        assert text == basis + ", 24 hours from the information: by 19 Aug 2026 10:30 IST"
    # information received late in the evening in India (after 18:30 UTC): the day is still India's
    db.execute("UPDATE fir SET information_received_at = '2026-08-18 23:50+05:30', registered_at = '2026-08-18 23:55+05:30' WHERE id=%s", (fir,))
    due, text = kinds(db, fir)["pocso_cwc_court_report"]
    assert str(due) == "2026-08-19" and text.endswith("by 19 Aug 2026 23:50 IST")


def test_a_step_recorded_ends_only_its_own_deadline_and_steps_without_a_limit_end_none(db):
    st, io, fir = seed_case(db)
    add_section(db, fir, "POCSO Act", "4")
    ins = "INSERT INTO pocso_step(fir_id,step,done_at,recorded_by) VALUES (%s,%s,'2026-08-18 15:00+05:30',%s)"
    for step in ("statement_chosen_place", "magistrate_statement", "support_person", "interim_compensation"):
        db.execute(ins, (fir, step, io))
    assert {"pocso_cwc_court_report", "pocso_medical_examination"} <= set(kinds(db, fir))
    db.execute(ins, (fir, "medical_examination", io))
    assert "pocso_medical_examination" not in kinds(db, fir) and "pocso_cwc_court_report" in kinds(db, fir)
    db.execute(ins, (fir, "cwc_court_report", io))
    assert not {"pocso_cwc_court_report", "pocso_medical_examination"} & set(kinds(db, fir))
    assert "sexual_offence_investigation" in kinds(db, fir)          # BNSS 193(2) stays until the final report


def test_a_concluded_case_has_no_pocso_deadline(db):
    st, io, fir = seed_case(db)
    add_section(db, fir, "POCSO Act", "4")
    db.execute("UPDATE fir SET concluded = true WHERE id=%s", (fir,))
    assert not any(k.startswith("pocso_") for k in kinds(db, fir))


def test_a_step_is_kept_as_written(db):
    st, io, fir = seed_case(db)
    add_section(db, fir, "POCSO Act", "4")
    sid = one(db, "INSERT INTO pocso_step(fir_id,step,done_at,recorded_by) VALUES (%s,'cwc_court_report','2026-08-18 15:00+05:30',%s) RETURNING id", fir, io)[0]
    with pytest.raises(psycopg.errors.RaiseException, match="kept as written"):
        db.execute("UPDATE pocso_step SET done_at = '2026-08-18 16:00+05:30' WHERE id=%s", (sid,))
    with pytest.raises(psycopg.errors.RaiseException, match="kept as written"):
        db.execute("DELETE FROM pocso_step WHERE id=%s", (sid,))
    # a mistake is answered by recording the step again
    db.execute("INSERT INTO pocso_step(fir_id,step,done_at,recorded_by) VALUES (%s,'cwc_court_report','2026-08-18 16:00+05:30',%s)", (fir, io))
    assert one(db, "SELECT count(*) FROM pocso_step WHERE fir_id=%s", fir)[0] == 2


def test_a_step_is_refused_on_a_case_that_is_not_pocso_before_the_information_or_in_the_future(db):
    st, io, fir = seed_case(db)
    ins = "INSERT INTO pocso_step(fir_id,step,done_at,recorded_by) VALUES (%s,%s,%s,%s)"
    with pytest.raises(psycopg.errors.CheckViolation, match="not a POCSO case"):
        db.execute(ins, (fir, "cwc_court_report", "2026-08-18 15:00+05:30", io))
    add_section(db, fir, "POCSO Act", "4")
    with pytest.raises(psycopg.errors.CheckViolation, match="before the information"):
        db.execute(ins, (fir, "cwc_court_report", "2026-08-18 10:29+05:30", io))
    db.execute(ins, (fir, "cwc_court_report", "2026-08-18 10:30+05:30", io))        # the minute of the information is fine
    with pytest.raises(psycopg.errors.CheckViolation):
        db.execute(ins, (fir, "cwc_court_report", "2999-01-01 10:00+05:30", io))
    with pytest.raises(psycopg.errors.CheckViolation):
        db.execute(ins, (fir, "lie_detector", "2026-08-18 15:00+05:30", io))
