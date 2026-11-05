"""V44: forensic and medical requests and their steps are kept as written and tied to the same case. All data is fictional."""
import psycopg
import pytest

from test_schema import db, one, seed_case  # noqa: F401  (db is the fixture)

REQ = "INSERT INTO expert_request(fir_id,kind,subject,sent_to,sent_on,evidence_item_id,recorded_by) VALUES (%s,%s,'Phone extraction','Demo Lab','2026-09-03',%s,%s) RETURNING id"
STEP = "INSERT INTO expert_request_step(request_id,fir_id,status,on_date,recorded_by) VALUES (%s,%s,%s,'2026-09-04',%s) RETURNING id"


def test_rows_are_kept_as_written(db):
    st, io, fir = seed_case(db)
    r = one(db, REQ, fir, "forensic", None, io)[0]
    s = one(db, STEP, r, fir, "at_lab", io)[0]
    for sql, args in (("UPDATE expert_request SET subject='x1' WHERE id=%s", (r,)), ("DELETE FROM expert_request WHERE id=%s", (r,)),
                      ("UPDATE expert_request_step SET status='sent' WHERE id=%s", (s,)), ("DELETE FROM expert_request_step WHERE id=%s", (s,))):
        with pytest.raises(psycopg.errors.RaiseException):
            db.execute(sql, args)


def test_kind_status_and_texts_are_checked(db):
    st, io, fir = seed_case(db)
    with pytest.raises(psycopg.errors.CheckViolation):
        db.execute(REQ, (fir, "dental", None, io))
    r = one(db, REQ, fir, "medical", None, io)[0]
    for status in ("sent", "at_lab", "sample_sent", "report_received", "reminder_sent"):
        one(db, STEP, r, fir, status, io)
    with pytest.raises(psycopg.errors.CheckViolation):
        db.execute(STEP, (r, fir, "lost", io))
    with pytest.raises(psycopg.errors.CheckViolation):
        db.execute("INSERT INTO expert_request(fir_id,kind,subject,sent_to,sent_on,recorded_by) VALUES (%s,'medical',' x ','Demo Lab','2026-09-03',%s)", (fir, io))


def test_a_step_and_an_evidence_item_belong_to_the_same_case(db):
    st, io, fir = seed_case(db)
    other = one(db, """INSERT INTO fir(station_id,fir_year,fir_no,gd_entry_no,registered_at,information_received_at,contents_original,contents_language,action_taken)
                       VALUES (%s,2026,215,'GD-18',now(),now(),'x','mr','investigate') RETURNING id""", st)[0]
    item = one(db, "INSERT INTO evidence_item(fir_id,label,description,kind,seized_at,seizure_memo) VALUES (%s,'E-01','Demo','physical',now(),'SM-1') RETURNING id", other)[0]
    with pytest.raises(psycopg.errors.ForeignKeyViolation):
        db.execute(REQ, (fir, "forensic", item, io))
    r = one(db, REQ, fir, "forensic", None, io)[0]
    with pytest.raises(psycopg.errors.ForeignKeyViolation):
        db.execute(STEP, (r, other, "at_lab", io))
