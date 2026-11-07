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


def test_who_submitted_decided_and_signed_is_written_by_that_step_only(db):
    # weekly review 7 Nov 2026 (V47): renaming the submitter of an approved report to the approver let the approver sign it
    st, io, fir = seed_case(db)
    sho = _user(db, st)
    with pytest.raises(REFUSED):   # a new draft names nobody
        db.execute("INSERT INTO final_report_draft(fir_id,language,facts_text,evidence_text,created_by,submitted_by) VALUES (%s,'en',%s,%s,%s,%s)", (fir, TEXT, TEXT, io, sho))
    d = _draft(db, fir, io)
    for col in ("submitted_by", "decided_by", "signed_by"):   # not in a draft either
        with pytest.raises(REFUSED):
            db.execute(f"UPDATE final_report_draft SET {col}=%s WHERE id=%s", (sho, d))
    db.execute("UPDATE final_report_draft SET status='submitted', submitted_by=%s WHERE id=%s", (io, d))
    with pytest.raises(REFUSED):   # a decider named without a decision
        db.execute("UPDATE final_report_draft SET decided_by=%s WHERE id=%s", (sho, d))
    db.execute("UPDATE final_report_draft SET status='approved', decided_by=%s WHERE id=%s", (sho, d))
    with pytest.raises(REFUSED):   # the submitter renamed after the approval
        db.execute("UPDATE final_report_draft SET submitted_by=%s WHERE id=%s", (sho, d))
    with pytest.raises(REFUSED):   # the same, together with the signature
        db.execute("UPDATE final_report_draft SET status='signed', submitted_by=%s, signed_by=%s WHERE id=%s", (sho, sho, d))
    with pytest.raises(REFUSED):   # the decider renamed after the decision
        db.execute("UPDATE final_report_draft SET decided_by=%s WHERE id=%s", (_user(db, st, "sp"), d))
    db.execute("UPDATE final_report_draft SET status='signed', signed_by=%s WHERE id=%s", (io, d))
    assert one(db, "SELECT submitted_by, decided_by, signed_by FROM final_report_draft WHERE id=%s", d) == (io, sho, io)


def test_a_returned_report_submitted_again_clears_the_decider_and_may_name_a_new_submitter(db):
    st, io, fir = seed_case(db)
    sho, sp = _user(db, st), _user(db, st, "sp")
    d = _draft(db, fir, io)
    db.execute("UPDATE final_report_draft SET status='submitted', submitted_by=%s WHERE id=%s", (io, d))
    db.execute("UPDATE final_report_draft SET status='returned', decided_by=%s WHERE id=%s", (sho, d))
    with pytest.raises(REFUSED):   # submitted again, the old decider cannot be swapped for another
        db.execute("UPDATE final_report_draft SET status='submitted', submitted_by=%s, decided_by=%s WHERE id=%s", (io, sp, d))
    db.execute("UPDATE final_report_draft SET status='submitted', submitted_by=%s, decided_by=NULL WHERE id=%s", (sho, d))
    assert one(db, "SELECT submitted_by, decided_by FROM final_report_draft WHERE id=%s", d) == (sho, None)
    db.execute("UPDATE final_report_draft SET status='approved', decided_by=%s WHERE id=%s", (sp, d))
