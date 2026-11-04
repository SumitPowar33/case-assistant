"""V43: the place of a hand-over is one of a fixed list or empty; the custody log stays append-only. All data is fictional."""
import psycopg
import pytest

from test_schema import db, one, seed_case  # noqa: F401  (db is the fixture)

EVENT = "INSERT INTO custody_event(item_id,at,handed_by,received_by,location,purpose,seal_intact,place) VALUES (%s,now(),'SI A','HC B','Store','keep',true,%s) RETURNING id"


def _item(db, fir):
    return one(db, "INSERT INTO evidence_item(fir_id,label,description,kind,seized_at,seizure_memo) VALUES (%s,'E-01','Demo knife','physical',now(),'SM-1') RETURNING id", fir)[0]


def test_place_is_from_the_list_or_empty(db):
    st, io, fir = seed_case(db)
    item = _item(db, fir)
    for place in ("malkhana", "lab", "court", "owner", "other", None):
        one(db, EVENT, item, place)
    with pytest.raises(psycopg.errors.CheckViolation):
        db.execute(EVENT, (item, "moon"))


def test_the_log_stays_append_only_with_the_new_column(db):
    st, io, fir = seed_case(db)
    event = one(db, EVENT, _item(db, fir), "malkhana")[0]
    for sql in ("UPDATE custody_event SET place='lab' WHERE id=%s", "DELETE FROM custody_event WHERE id=%s"):
        with pytest.raises(psycopg.errors.RaiseException):
            db.execute(sql, (event,))
