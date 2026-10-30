"""Upgrade test: a database holding a case at an earlier release takes every later migration without losing or changing it.

The earlier release is the schema after migration BASE (bump BASE when a release is tagged, so the test always starts from the
last release that has real data). All data below is fictional.
"""
import uuid

import psycopg
import pytest

from test_schema import MIGRATIONS, URL, one, seed_case

BASES = (25, 29)


def number(m):
    return int(m.name[1:].split("__")[0])


@pytest.fixture(params=BASES, ids=lambda b: f"from_V{b}")
def old_release(request):
    schema = "u_" + uuid.uuid4().hex[:10]
    conn = psycopg.connect(URL, autocommit=True)
    conn.execute(f"CREATE SCHEMA {schema}")
    conn.execute(f"SET search_path TO {schema}, public")
    for m in MIGRATIONS:
        if number(m) <= request.param:
            conn.execute(m.read_text())
    yield conn, request.param
    conn.execute(f"DROP SCHEMA {schema} CASCADE")
    conn.close()


def test_a_case_survives_the_later_migrations(old_release):
    conn, base = old_release
    st, io, fir = seed_case(conn)
    conn.execute("""INSERT INTO person(fir_id,role,label,full_name,identity_masked) VALUES (%s,'victim','V1','Demo Name',true)""", (fir,))
    before = one(conn, "SELECT fir_no, fir_year, contents_original, registered_at, io_id FROM fir WHERE id=%s", fir)
    for m in MIGRATIONS:
        if number(m) > base:
            conn.execute(m.read_text())
    assert one(conn, "SELECT fir_no, fir_year, contents_original, registered_at, io_id FROM fir WHERE id=%s", fir) == before
    assert one(conn, "SELECT count(*) FROM person WHERE fir_id=%s", fir)[0] == 1
    assert one(conn, "SELECT display_name FROM person_public WHERE fir_id=%s", fir)[0] == "Victim V1"
    with pytest.raises(psycopg.errors.UniqueViolation):   # the old FIR still holds its number
        conn.execute("""INSERT INTO fir(station_id,fir_year,fir_no,gd_entry_no,registered_at,information_received_at,
                        contents_original,contents_language,action_taken) VALUES (%s,2026,214,'GD-99',now(),now(),'x','mr','investigate')""", (st,))
