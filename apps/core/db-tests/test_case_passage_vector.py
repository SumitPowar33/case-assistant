"""V58: vectors of the pieces of a case file are kept per case, model and text hash, and go with the case. All data is fictional."""
import psycopg
import pytest

from test_schema import db, one, seed_case  # noqa: F401  (db is the fixture)


def put(db, fir, model="m/1", h="aaaaaaaa", vec=(0.5, 0.5)):
    db.execute("INSERT INTO case_passage_vector(fir_id, model, text_hash, vec) VALUES (%s,%s,%s,%s)", (fir, model, h, list(vec)))


def test_a_vector_is_kept_and_read_back_and_goes_with_its_case(db):
    st, io, fir = seed_case(db)
    put(db, fir)
    assert one(db, "SELECT vec FROM case_passage_vector WHERE fir_id=%s", fir)[0] == pytest.approx([0.5, 0.5])
    db.execute("DELETE FROM fir WHERE id=%s", (fir,))
    assert one(db, "SELECT count(*) FROM case_passage_vector")[0] == 0


def test_one_vector_per_case_model_and_text(db):
    st, io, fir = seed_case(db)
    put(db, fir)
    put(db, fir, model="m/2")            # another model is another row
    with pytest.raises(psycopg.errors.UniqueViolation):
        put(db, fir)


@pytest.mark.parametrize("kwargs", [dict(model="has space"), dict(model=""), dict(h="XYZ"), dict(h="abc"), dict(h="g" * 16),
                                    dict(vec=()), dict(vec=[0.1] * 1025)])
def test_bad_rows_are_refused(db, kwargs):
    st, io, fir = seed_case(db)
    with pytest.raises(psycopg.errors.CheckViolation):
        put(db, fir, **kwargs)
