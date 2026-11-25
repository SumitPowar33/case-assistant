"""V71: an officer's optional gender, and the POCSO steps that name who took the child's statement and the one recorded
statement the step relies on. All data is fictional."""
import psycopg
import pytest

from test_schema import add_section, db, one, seed_case  # noqa: F401  (db is the fixture)

INS = "INSERT INTO pocso_step(fir_id,step,done_at,recorded_by,taken_by,statement_id) VALUES (%s,%s,'2026-08-19 10:00+05:30',%s,%s,%s)"


def child_statement(db, fir, io, age=12, role="victim"):
    p = one(db, "INSERT INTO person(fir_id,role,label,full_name,identity_known,age_years) VALUES (%s,%s,'V1',%s,%s,%s) RETURNING id",
            fir, role, None if role == "victim" else "Fictional Child", role != "victim", age)[0]
    return one(db, "INSERT INTO witness_statement(fir_id,person_id,recorded_by,language,medium,original_text) "
                   "VALUES (%s,%s,%s,'mr','video','Fictional words of the child') RETURNING id", fir, p, io)[0]


@pytest.mark.parametrize("g", ["female", "male", "other", None])
def test_gender_is_optional_and_one_of_three_words(db, g):
    st, io, fir = seed_case(db)
    db.execute("UPDATE app_user SET gender=%s WHERE id=%s", (g, io))
    assert one(db, "SELECT gender FROM app_user WHERE id=%s", io)[0] == g


def test_any_other_gender_text_is_refused(db):
    st, io, fir = seed_case(db)
    with pytest.raises(psycopg.errors.CheckViolation):
        db.execute("UPDATE app_user SET gender='woman' WHERE id=%s", (io,))


def test_a_step_names_who_took_the_statement_and_the_statement_it_relies_on(db):
    st, io, fir = seed_case(db)
    add_section(db, fir, "POCSO Act", "4")
    s = child_statement(db, fir, io)
    db.execute(INS, (fir, "statement_chosen_place", io, io, s))
    db.execute(INS, (fir, "magistrate_statement", io, None, s))
    db.execute(INS, (fir, "medical_examination", io, None, None))
    assert one(db, "SELECT count(*) FROM pocso_step WHERE fir_id=%s", fir)[0] == 3


def test_only_the_place_statement_names_who_took_it(db):
    st, io, fir = seed_case(db)
    add_section(db, fir, "POCSO Act", "4")
    for step in ("magistrate_statement", "medical_examination", "support_person"):
        with pytest.raises(psycopg.errors.CheckViolation, match="names who took it"):
            db.execute(INS, (fir, step, io, io, None))


def test_only_a_statement_step_names_the_recorded_statement(db):
    st, io, fir = seed_case(db)
    add_section(db, fir, "POCSO Act", "4")
    s = child_statement(db, fir, io)
    for step in ("cwc_court_report", "medical_examination", "support_person", "interim_compensation"):
        with pytest.raises(psycopg.errors.CheckViolation, match="names the recorded statement"):
            db.execute(INS, (fir, step, io, None, s))


def test_the_statement_must_be_a_child_victims_of_this_fir(db):
    st, io, fir = seed_case(db)
    add_section(db, fir, "POCSO Act", "4")
    with pytest.raises(psycopg.errors.CheckViolation, match="child victim"):
        db.execute(INS, (fir, "magistrate_statement", io, None, child_statement(db, fir, io, age=30)))   # an adult victim
    with pytest.raises(psycopg.errors.CheckViolation, match="child victim"):
        db.execute(INS, (fir, "magistrate_statement", io, None, child_statement(db, fir, io, age=10, role="witness")))
    st2, io2, fir2 = other_fir(db, st, io)
    add_section(db, fir2, "POCSO Act", "4")
    with pytest.raises(psycopg.errors.CheckViolation, match="child victim"):
        db.execute(INS, (fir2, "magistrate_statement", io2, None, child_statement(db, fir, io)))        # another FIR's statement


def other_fir(db, st, io):
    fir = one(db, """INSERT INTO fir(station_id,fir_year,fir_no,gd_entry_no,registered_at,information_received_at,
                     contents_original,contents_language,action_taken,io_id)
                     VALUES (%s,2026,215,'GD-18','2026-08-18 11:00+05:30','2026-08-18 10:30+05:30','Demo text','mr','investigate',%s) RETURNING id""", st, io)[0]
    return st, io, fir
