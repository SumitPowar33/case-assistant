"""The API on an upgraded database: a database made by the release at migration BASE, holding a protected case written
then, is upgraded by the current core app at start-up, and the case is read and worked on through the API as if it were
new. The database tests (apps/core/db-tests/test_upgrade.py) check the rows survive the migrations; this checks the
application still reads and protects them. Bump BASE with the BASES there when a release is tagged. Fictional data only."""
import os
import secrets
import subprocess
import time

import psycopg
import pytest

from conftest import PG, ROOT, core_jar, running_core

DB = "caseapp_upgrade"
BASE = 29


def migrate_to_base():
    """A fresh database taken to migration BASE by the core app itself (Flyway target), as a release at BASE would leave it."""
    with psycopg.connect(dbname="postgres", autocommit=True, **PG) as c:
        c.execute(f"drop database if exists {DB} with (force)")
        c.execute(f"create database {DB}")
    env = {"DATABASE_URL": f"jdbc:postgresql://{PG['host']}/{DB}", "AUTH_SECRET": secrets.token_urlsafe(48)}
    with open(ROOT / f"apps/core/target/e2e-core-{DB}-base.log", "w") as log:
        proc = subprocess.Popen(["java", "-jar", core_jar(), "--server.port=0", f"--spring.flyway.target={BASE}"],
                                env={**os.environ, **env}, stdout=log, stderr=subprocess.STDOUT)
        try:
            deadline = time.time() + 90
            while time.time() < deadline:
                try:
                    with psycopg.connect(dbname=DB, **PG) as c:
                        done = c.execute("select max(version::int) from flyway_schema_history where success").fetchone()[0]
                    if done == BASE:
                        return
                except psycopg.Error:
                    pass   # the history table is not there yet
                if proc.poll() is not None:
                    break
                time.sleep(0.5)
            pytest.fail(f"the database did not reach V{BASE}, see {log.name}")
        finally:
            proc.terminate()
            proc.wait(timeout=30)


def seed_old_case():
    """A sexual-offence case written at BASE: station, IO, FIR with a masked victim and an accused. Returns (station, fir)."""
    with psycopg.connect(dbname=DB, autocommit=True, **PG) as c:
        c.execute("insert into state_pack values ('IN','National pack','1.0','{en,hi}','pilot') on conflict do nothing")
        st = c.execute("insert into police_station(state_code,district_id,name) values ('IN',district_id_of('IN','Old Fictional District'),"
                       "'Old Fictional PS') returning id").fetchone()[0]
        io = c.execute("insert into app_user(full_name,rank,role,station_id) values ('Old Fictional IO','SI','io',%s) returning id", (st,)).fetchone()[0]
        fir = c.execute("""insert into fir(station_id,fir_year,fir_no,gd_entry_no,registered_at,information_received_at,
                           contents_original,contents_language,action_taken,io_id,sexual_offence)
                           values (%s,2026,7,'GD-7','2026-09-01 11:00+05:30','2026-09-01 10:30+05:30',
                           'Fictional complaint text naming the victim','mr','investigate',%s,true) returning id""", (st, io)).fetchone()[0]
        c.execute("insert into person(fir_id,role,label,full_name,identity_masked) values (%s,'victim','V1','Fictional Victim Name',true)", (fir,))
        c.execute("insert into person(fir_id,role,label,full_name) values (%s,'accused','A1','Fictional Accused Name')", (fir,))
    return str(st), str(fir)


@pytest.fixture(scope="module")
def upgraded():
    migrate_to_base()
    station, fir = seed_old_case()
    with running_core(DB, fresh=False) as core:   # the current app upgrades the database at start-up
        yield core, station, fir


def account(core, station, role, tag="old"):
    api, admin, password = core
    username, pw = f"{role}.{tag}", secrets.token_urlsafe(18)
    status, body = api.call("POST", "/api/users", {"username": username, "password": pw, "fullName": f"Fictional {role.upper()}",
                                                   "rank": "Inspector", "role": role, "stationId": station}, api.token(admin, password))
    assert status == 201, body
    return api.token(username, pw)


def test_the_database_is_at_the_latest_migration_after_start_up(upgraded):
    latest = max(int(p.name[1:].split("__")[0]) for p in (ROOT / "apps/core/src/main/resources/db/migration").glob("V*__*.sql"))
    with psycopg.connect(dbname=DB, **PG) as c:
        assert c.execute("select max(version::int) from flyway_schema_history where success").fetchone()[0] == latest > BASE


def test_the_case_team_reads_and_works_on_the_old_case(upgraded):
    (api, _, _), station, fir = upgraded
    sho = account(upgraded[0], station, "sho")
    status, firs = api.call("GET", "/api/firs", token=sho)
    assert status == 200 and [(f["fir_no"], f["fir_year"], f["sexual_offence"]) for f in firs] == [(7, 2026, True)]
    status, one = api.call("GET", f"/api/firs/{fir}", token=sho)
    assert status == 200 and one["contents_original"] == "Fictional complaint text naming the victim" and not one["contents_withheld"]
    assert one["io_name"] == "Old Fictional IO" and one["sections"] == []
    status, people = api.call("GET", f"/api/firs/{fir}/people", token=sho)
    assert status == 200 and {(p["label"], p["display_name"], p["identity_masked"]) for p in people} == {
        ("V1", "Fictional Victim Name", True), ("A1", "Fictional Accused Name", False)}
    status, deadlines = api.call("GET", f"/api/firs/{fir}/deadlines", token=sho)
    assert status == 200 and "victim_progress_update" in {d["kind"] for d in deadlines}
    status, body = api.call("POST", f"/api/firs/{fir}/people", {"role": "witness", "label": "W1", "fullName": "Fictional Witness"}, sho)
    assert status == 201, body


def test_the_old_protected_case_stays_protected(upgraded):
    (api, _, _), station, fir = upgraded
    desk = account(upgraded[0], station, "front_desk")
    status, one = api.call("GET", f"/api/firs/{fir}", token=desk)
    assert status == 200 and one["contents_withheld"] is True and one["contents_original"] is None   # BNS 72
    status, _ = api.call("GET", f"/api/firs/{fir}/people", token=desk)
    assert status == 404   # outside the case team
    status, body = api.call("GET", f"/api/firs/{fir}", token=account(upgraded[0], station_of_another_state(upgraded[0]), "sho", "other"))
    assert status == 404, body


def station_of_another_state(core):
    """A station in Maharashtra (the MH module gives its state_pack row at start-up), made by the platform admin."""
    api, admin, password = core
    status, body = api.call("POST", "/api/stations", {"stateCode": "MH", "district": "Fictional Pune", "name": "Fictional Other PS"},
                            api.token(admin, password))
    assert status == 201, body
    return body["id"]
