"""V41: the final report draft's states and the list of steps, checked straight in the database. All data is fictional."""
import psycopg
import pytest

from test_schema import db, one, seed_case  # noqa: F401  (db is the fixture)

REFUSED = (psycopg.errors.RaiseException, psycopg.errors.CheckViolation)
TEXT = "A fictional text of more than twenty characters."


def _draft(db, fir, io):
    return one(db, "INSERT INTO final_report_draft(fir_id,language,facts_text,evidence_text,created_by) VALUES (%s,'en',%s,%s,%s) RETURNING id", fir, TEXT, TEXT, io)[0]


def _user(db, st, role="sho"):
    return one(db, "INSERT INTO app_user(station_id,full_name,rank,role) VALUES (%s,'Demo Other','SI',%s) RETURNING id", st, role)[0]


def test_the_only_way_through_the_states(db):
    st, io, fir = seed_case(db)
    other = _user(db, st)
    d = _draft(db, fir, io)
    for bad in ("approved", "signed", "returned"):
        with pytest.raises(REFUSED):
            db.execute("UPDATE final_report_draft SET status=%s, decided_by=%s WHERE id=%s", (bad, other, d))
    db.execute("UPDATE final_report_draft SET status='submitted', submitted_by=%s WHERE id=%s", (io, d))
    db.execute("UPDATE final_report_draft SET status='returned', decided_by=%s WHERE id=%s", (other, d))
    db.execute("UPDATE final_report_draft SET status='submitted', submitted_by=%s WHERE id=%s", (io, d))
    db.execute("UPDATE final_report_draft SET status='approved', decided_by=%s WHERE id=%s", (other, d))
    with pytest.raises(REFUSED):   # approved cannot go back to a draft
        db.execute("UPDATE final_report_draft SET status='draft' WHERE id=%s", (d,))
    with pytest.raises(REFUSED):   # the signer is the officer who submitted it
        db.execute("UPDATE final_report_draft SET status='signed', signed_by=%s WHERE id=%s", (other, d))
    db.execute("UPDATE final_report_draft SET status='signed', signed_by=%s WHERE id=%s", (io, d))
    with pytest.raises(REFUSED):
        db.execute("UPDATE final_report_draft SET updated_at=now() WHERE id=%s", (d,))


def test_a_decision_by_the_submitter_and_a_submission_without_words_are_refused(db):
    st, io, fir = seed_case(db)
    d = _draft(db, fir, io)
    db.execute("UPDATE final_report_draft SET status='submitted', submitted_by=%s WHERE id=%s", (io, d))
    with pytest.raises(REFUSED):
        db.execute("UPDATE final_report_draft SET status='approved', decided_by=%s WHERE id=%s", (io, d))
    with pytest.raises(REFUSED):
        db.execute("UPDATE final_report_draft SET status='approved' WHERE id=%s", (d,))   # nobody named


def test_the_words_change_only_in_a_draft_or_when_returned_and_steps_are_kept(db):
    st, io, fir = seed_case(db)
    other = _user(db, st)
    d = _draft(db, fir, io)
    db.execute("UPDATE final_report_draft SET facts_text=%s WHERE id=%s", (TEXT + " More.", d))
    db.execute("UPDATE final_report_draft SET status='submitted', submitted_by=%s WHERE id=%s", (io, d))
    with pytest.raises(REFUSED):
        db.execute("UPDATE final_report_draft SET facts_text='quietly changed while waiting' WHERE id=%s", (d,))
    with pytest.raises(REFUSED):
        db.execute("DELETE FROM final_report_draft WHERE id=%s", (d,))
    db.execute("UPDATE final_report_draft SET status='returned', decided_by=%s WHERE id=%s", (other, d))
    db.execute("UPDATE final_report_draft SET evidence_text=%s WHERE id=%s", (TEXT + " Added.", d))
    ev = one(db, "INSERT INTO final_report_event(draft_id,by_user,action) VALUES (%s,%s,'saved') RETURNING id", d, io)[0]
    with pytest.raises(REFUSED):   # a return needs a reason
        db.execute("INSERT INTO final_report_event(draft_id,by_user,action) VALUES (%s,%s,'returned')", (d, other))
    with pytest.raises(REFUSED):
        db.execute("UPDATE final_report_event SET action='signed' WHERE id=%s", (ev,))
    with pytest.raises(REFUSED):
        db.execute("DELETE FROM final_report_event WHERE id=%s", (ev,))
