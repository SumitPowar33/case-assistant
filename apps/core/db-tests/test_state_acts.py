"""V57: laws of a state module (state_act) and the act of an FIR section. All data is fictional."""
import psycopg
import pytest

from test_schema import add_section, db, one, seed_case  # noqa: F401  (db is the fixture)


def mh_fir(db):
    """A fictional MH station and FIR next to the IN case of seed_case."""
    db.execute("INSERT INTO state_pack VALUES ('MH','Maharashtra','1','{mr}','draft')")
    st = one(db, "INSERT INTO police_station(state_code,district_id,name) VALUES ('MH',district_id_of('MH','Demo Pune'),'Demo Pune PS') RETURNING id")[0]
    return one(db, """INSERT INTO fir(station_id,fir_year,fir_no,gd_entry_no,registered_at,information_received_at,
                      contents_original,contents_language,action_taken) VALUES (%s,2026,7,'GD-2','2026-08-18 11:00+05:30',
                      '2026-08-18 10:30+05:30','Demo deposit complaint','mr','investigate') RETURNING id""", st)[0]


@pytest.mark.parametrize("act", ["BNS", "IPC", "IT Act", "NDPS Act", "POCSO Act", "Arms Act", "SC/ST Act", "Other"])
def test_the_national_acts_hold_for_an_fir_of_any_state(db, act):
    st, io, fir = seed_case(db)
    add_section(db, fir, act, "3")
    add_section(db, mh_fir(db), act, "3")


def test_a_state_law_holds_only_for_an_fir_of_its_own_state(db):
    st, io, fir = seed_case(db)
    mh = mh_fir(db)
    db.execute("INSERT INTO state_act(act,state_code) VALUES ('MPID Act','MH')")
    add_section(db, mh, "MPID Act", "3")
    with pytest.raises(psycopg.errors.CheckViolation, match="not a law of the state of this FIR"):
        add_section(db, fir, "MPID Act", "3")                 # an IN station's FIR


def test_an_act_no_module_names_is_refused_as_before(db):
    st, io, fir = seed_case(db)
    with pytest.raises(psycopg.errors.CheckViolation):
        add_section(db, mh_fir(db), "MPID Act", "3")          # not named yet
    with pytest.raises(psycopg.errors.CheckViolation):
        add_section(db, fir, "BNSS", "173")
    with pytest.raises(psycopg.errors.CheckViolation):
        add_section(db, fir, "bns", "318(4)")                  # letter case matters, as in V1


@pytest.mark.parametrize("act", ["BNS", "IT Act", "Other", "mpid Act", "MPID", "MPID Act 1999", "MPID  Act", " MPID Act",
                                 "A" * 37 + " Act", "MPID Act;"])
def test_a_state_law_is_not_a_national_act_and_is_named_like_an_act(db, act):
    db.execute("INSERT INTO state_pack VALUES ('MH','Maharashtra','1','{mr}','draft')")
    with pytest.raises(psycopg.errors.CheckViolation):
        db.execute("INSERT INTO state_act(act,state_code) VALUES (%s,'MH')", (act,))


def test_a_state_law_names_a_known_state_and_belongs_to_one_state(db):
    with pytest.raises(psycopg.errors.ForeignKeyViolation):
        db.execute("INSERT INTO state_act(act,state_code) VALUES ('MPID Act','MH')")
    db.execute("INSERT INTO state_pack VALUES ('MH','Maharashtra','1','{mr}','draft'), ('KA','Karnataka','1','{kn}','draft')")
    db.execute("INSERT INTO state_act(act,state_code) VALUES ('MPID Act','MH'), ('KPID Act','KA')")
    with pytest.raises(psycopg.errors.UniqueViolation):
        db.execute("INSERT INTO state_act(act,state_code) VALUES ('MPID Act','KA')")


def test_a_state_law_once_named_is_kept_as_written(db):
    db.execute("INSERT INTO state_pack VALUES ('MH','Maharashtra','1','{mr}','draft'), ('KA','Karnataka','1','{kn}','draft')")
    db.execute("INSERT INTO state_act(act,state_code) VALUES ('MPID Act','MH')")
    for sql in ("UPDATE state_act SET state_code='KA'", "UPDATE state_act SET act='MPIDX Act'", "DELETE FROM state_act"):
        with pytest.raises(psycopg.errors.RaiseException, match="kept as written"):
            db.execute(sql)
