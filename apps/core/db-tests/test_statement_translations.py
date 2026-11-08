"""V52: English translations beside statements (AI feature A3), checked straight in the database. All data is fictional."""
import psycopg
import pytest

from test_schema import db, one, seed_case  # noqa: F401  (db is the fixture)

REFUSED = (psycopg.errors.RaiseException, psycopg.errors.CheckViolation)
REQ = "7d0c3f1e-2b4a-4c55-9a77-0f1e2d3c4b5a"
ADD = "INSERT INTO statement_translation(statement_id,translated_text,ai_text,ai_request_id,checked_by) VALUES (%s,%s,%s,%s,%s) RETURNING id"


def _statement(db, fir, io, language="mr", role="witness", masked=False):
    p = one(db, "INSERT INTO person(fir_id,role,label,full_name,identity_masked) VALUES (%s,%s,'W1','Fictional Person',%s) RETURNING id", fir, role, masked)[0]
    return one(db, """INSERT INTO witness_statement(fir_id,person_id,recorded_by,language,medium,original_text)
                      VALUES (%s,%s,%s,%s,'written','Fictional words as said') RETURNING id""", fir, p, io, language)[0]


def test_a_checked_translation_is_kept_once_beside_its_statement_as_written(db):
    st, io, fir = seed_case(db)
    s = _statement(db, fir, io)
    t = one(db, ADD, s, "Fictional words as said, in English", "Fictional words, in English", REQ, io)[0]
    assert one(db, "SELECT language, translated_text <> ai_text FROM statement_translation WHERE id=%s", t) == ("en", True)
    with pytest.raises(psycopg.errors.UniqueViolation):
        db.execute(ADD, (s, "Again", "Again", REQ, io))
    for change in ("UPDATE statement_translation SET translated_text='quietly changed'", "UPDATE statement_translation SET checked_by=checked_by",
                   "DELETE FROM statement_translation"):
        with pytest.raises(REFUSED):
            db.execute(change)
    # the statement itself is still the words as said
    assert one(db, "SELECT original_text FROM witness_statement WHERE id=%s", s)[0] == "Fictional words as said"


@pytest.mark.parametrize("column,value", [
    ("translated_text", " "), ("translated_text", "x" * 40001), ("ai_text", ""), ("ai_text", "x" * 40001), ("language", "hi"), ("language", "EN"),
])
def test_each_column_is_checked(db, column, value):
    st, io, fir = seed_case(db)
    s = _statement(db, fir, io)
    row = {"translated_text": "Words", "ai_text": "Words", "language": "en"} | {column: value}
    with pytest.raises(REFUSED):
        db.execute("INSERT INTO statement_translation(statement_id,language,translated_text,ai_text,ai_request_id,checked_by) VALUES (%s,%s,%s,%s,%s,%s)",
                   (s, row["language"], row["translated_text"], row["ai_text"], REQ, io))


def test_the_longest_texts_are_taken(db):
    st, io, fir = seed_case(db)
    db.execute(ADD, (_statement(db, fir, io), "x" * 40000, "y" * 40000, REQ, io))


def test_every_field_is_required(db):
    st, io, fir = seed_case(db)
    s = _statement(db, fir, io)
    for args in ((s, "W", "W", None, io), (s, "W", "W", REQ, None), (None, "W", "W", REQ, io), (s, None, "W", REQ, io), (s, "W", None, REQ, io)):
        with pytest.raises(psycopg.errors.NotNullViolation):
            db.execute(ADD, args)


def test_no_english_into_english(db):
    st, io, fir = seed_case(db)
    with pytest.raises(psycopg.errors.CheckViolation):
        db.execute(ADD, (_statement(db, fir, io, language="en"), "Words", "Words", REQ, io))
    db.execute(ADD, (_statement(db, fir, io, language="hi"), "Words", "Words", REQ, io))


def test_no_translation_on_a_protected_case_or_for_a_masked_person(db):
    st, io, fir = seed_case(db)
    with pytest.raises(psycopg.errors.CheckViolation):   # a person masked by hand, on an ordinary case
        db.execute(ADD, (_statement(db, fir, io, masked=True), "Words", "Words", REQ, io))
    plain = _statement(db, fir, io)                       # another person of the same case may be translated
    db.execute(ADD, (plain, "Words", "Words", REQ, io))
    for protect in ("INSERT INTO fir_section(fir_id,act,section) VALUES (%s,'BNS','64(1)')",
                    "INSERT INTO fir_section(fir_id,act,section) VALUES (%s,'BNS','124(2)')",
                    "INSERT INTO fir_section(fir_id,act,section) VALUES (%s,'POCSO Act','4')",
                    "UPDATE fir SET identity_protected = true WHERE id=%s"):
        st2, io2, fir2 = _other_case(db, st, io)
        db.execute(protect, (fir2,))
        with pytest.raises(psycopg.errors.CheckViolation):   # a witness of a protected case, not only the victim
            db.execute(ADD, (_statement(db, fir2, io2), "Words", "Words", REQ, io2))
    _, _, sexual = _other_case(db, st, io, sexual=True)
    with pytest.raises(psycopg.errors.CheckViolation):
        db.execute(ADD, (_statement(db, sexual, io, role="complainant"), "Words", "Words", REQ, io))


_n = [300]


def _other_case(db, st, io, sexual=False):
    _n[0] += 1
    fir = one(db, """INSERT INTO fir(station_id,fir_year,fir_no,gd_entry_no,registered_at,information_received_at,contents_original,contents_language,action_taken,io_id,sexual_offence)
                     VALUES (%s,2026,%s,'GD-18','2026-08-19 11:00+05:30','2026-08-19 10:30+05:30','Demo text','mr','investigate',%s,%s) RETURNING id""", st, _n[0], io, sexual)[0]
    return st, io, fir
