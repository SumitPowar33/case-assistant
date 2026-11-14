"""V55 (weekly review of 14 Nov 2026): no AI result is taken on a case whose victim's identity is protected, for the
facts of the FIR text (A1), sections from the playbooks (A2) and the narrative of the final report (A6). What was
written before the case became protected stays as written; nothing without an AI request changes. All data is fictional."""
import psycopg
import pytest

from test_schema import db, one, seed_case  # noqa: F401  (db is the fixture)

REQ = "7d0c3f1e-2b4a-4c55-9a77-0f1e2d3c4b5a"
REFUSED = psycopg.errors.CheckViolation
FACT = """INSERT INTO fir_fact(fir_id,kind,value,ai_value,quote,ai_request_id,confirmed_by)
          VALUES (%s,'amount','Rs 40,000','Rs 40,000','Demo complaint text',%s,%s)"""
SECTION = """INSERT INTO fir_section(fir_id,act,section,chosen_by,added_at,reason,ai_request_id)
             VALUES (%s,'BNS','319(2)',%s,clock_timestamp(),'The text says the caller posed as a bank officer',%s)"""
TEXT = "A fictional text of more than twenty characters."

PROTECT = [
    "UPDATE fir SET identity_protected = true WHERE id=%s",
    "INSERT INTO fir_section(fir_id,act,section) VALUES (%s,'BNS','64(1)')",
    "INSERT INTO fir_section(fir_id,act,section) VALUES (%s,'BNS','124(2)')",
    "UPDATE fir SET sexual_offence = true WHERE id=%s",
]


def _draft(db, fir, io):
    return one(db, "INSERT INTO final_report_draft(fir_id,language,facts_text,evidence_text,created_by) VALUES (%s,'en',%s,%s,%s) RETURNING id",
               fir, TEXT, TEXT, io)[0]


def test_on_an_ordinary_case_each_ai_result_is_taken(db):
    st, io, fir = seed_case(db)
    db.execute(FACT, (fir, REQ, io))
    db.execute(SECTION, (fir, io, REQ))
    db.execute("INSERT INTO final_report_event(draft_id,by_user,action,ai_request) VALUES (%s,%s,'saved',%s)", (_draft(db, fir, io), io, REQ))
    assert one(db, "SELECT (SELECT count(*) FROM fir_fact) + (SELECT count(*) FROM fir_section) + (SELECT count(*) FROM final_report_event)")[0] == 3


@pytest.mark.parametrize("protect", PROTECT)
def test_on_a_protected_case_no_ai_result_is_taken(db, protect):
    st, io, fir = seed_case(db)
    d = _draft(db, fir, io)
    db.execute(protect, (fir,))
    for sql, args in ((FACT, (fir, REQ, io)), (SECTION, (fir, io, REQ)),
                      ("INSERT INTO final_report_event(draft_id,by_user,action,ai_request) VALUES (%s,%s,'saved',%s)", (d, io, REQ))):
        with pytest.raises(REFUSED, match="not taken on a case whose victim"):
            with db.transaction():
                db.execute(sql, args)


def test_a_sexual_offence_case_from_the_start_is_refused_too(db):
    st, io, fir = seed_case(db, sexual=True)
    with pytest.raises(REFUSED):
        db.execute(FACT, (fir, REQ, io))


def test_without_an_ai_request_a_protected_case_is_written_as_before(db):
    st, io, fir = seed_case(db, sexual=True)
    d = _draft(db, fir, io)
    db.execute("INSERT INTO final_report_event(draft_id,by_user,action) VALUES (%s,%s,'saved')", (d, io))
    db.execute("INSERT INTO fir_section(fir_id,act,section) VALUES (%s,'BNS','64(1)')", (fir,))
    assert one(db, "SELECT count(*) FROM fir_section WHERE fir_id=%s", fir)[0] == 1


def test_what_was_taken_before_the_case_became_protected_stays(db):
    st, io, fir = seed_case(db)
    db.execute(FACT, (fir, REQ, io))
    db.execute("UPDATE fir SET identity_protected = true WHERE id=%s", (fir,))
    assert one(db, "SELECT count(*) FROM fir_fact WHERE fir_id=%s", fir)[0] == 1
