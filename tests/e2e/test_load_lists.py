"""Load test of the FIR list (TESTING.md, "Not covered yet" 4): the real core jar on its own throwaway database with
150,000 FIRs in 150 stations. Every kind of account gets its first page and a deep page quickly, and only its own FIRs.
Before 1 Nov 2026 the list checked every FIR of the installation for every call: an SP's page took 8 s at 210,000 FIRs,
an SHO's 0.7 s. The front-desk complaint list (200 of 30,000 complaints) asked 2 or 3 queries per row until 1 Nov 2026
(session 45); ComplaintListQueriesApiTest counts them. All data is fictional."""
import time

import psycopg

from conftest import PG, running_core
from test_load_data import setup_station

DB = "caseapp_load"
LIMIT_SECONDS = 0.3   # best of three calls, HTTP included; today a few milliseconds


def test_the_fir_and_complaint_lists_stay_fast_and_bounded_with_150000_firs():
    with running_core(DB) as core:
        api = core[0]
        accounts = setup_station(core, "load", roles=("sho", "sp", "front_desk", "io"))
        with psycopg.connect(dbname=DB, autocommit=True, **PG) as c:
            own = c.execute("SELECT id, district_id FROM police_station WHERE name = 'Fictional load PS'").fetchone()
            io = c.execute("SELECT id FROM app_user WHERE username = 'io.load'").fetchone()[0]
            # 20 more stations in the same district, 129 in other districts, 1,000 FIRs each; half of our station's name the IO
            c.execute("""INSERT INTO police_station(state_code,district_id,name)
                         SELECT 'IN', CASE WHEN g <= 20 THEN %s ELSE district_id_of('IN','Fictional Load District '||(g%%13)) END, 'Fictional Load PS '||g
                         FROM generate_series(1,149) g""", (own[1],))
            c.execute("""INSERT INTO fir(station_id,fir_year,fir_no,gd_entry_no,registered_at,information_received_at,contents_original,contents_language,action_taken,io_id)
                         SELECT s.id, 2026, g, 'GD-'||g, now() - make_interval(mins => g), now() - make_interval(mins => g, hours => 1),
                           'Fictional complaint', 'en', 'investigate', CASE WHEN s.id = %s AND g %% 2 = 0 THEN %s END
                         FROM police_station s, generate_series(1,1000) g""", (own[0], io))
            c.execute("ANALYZE")
            assert c.execute("SELECT count(*) FROM fir").fetchone()[0] == 150_000
        expected = {"sho.load": 1000, "front_desk.load": 1000, "io.load": 500, "sp.load": 21_000}
        for username, total in expected.items():
            token = api.token(username, accounts[username])
            for offset in (0, total - 51):
                best, page = None, None
                for _ in range(3):
                    start = time.perf_counter()
                    status, page = api.call("GET", f"/api/firs?limit=51&offset={offset}", token=token)
                    took = time.perf_counter() - start
                    assert status == 200, page
                    best = took if best is None else min(best, took)
                assert len(page) == 51, (username, offset)
                assert best < LIMIT_SECONDS, f"{username} offset {offset}: {best:.3f} s"
            status, last = api.call("GET", f"/api/firs?limit=51&offset={total}", token=token)
            assert status == 200 and last == [], (username, "nothing past the officer's own FIRs")

        # the front-desk complaint list: 30,000 complaints of a busy station over years, 200 shown, with golden-hour steps
        with psycopg.connect(dbname=DB, autocommit=True, **PG) as c:
            desk = c.execute("SELECT id FROM app_user WHERE username = 'front_desk.load'").fetchone()[0]
            c.execute("""INSERT INTO complaint(station_id,received_at,mode,informant_name,kind,text_original,text_language,recorded_by)
                         SELECT %s, now() - make_interval(mins => g), 'written', 'Fictional informant '||g,
                           (array['cyber_financial_fraud','sexual_offence','other'])[1 + g %% 3], 'Fictional information', 'en', %s
                         FROM generate_series(1,30000) g""", (own[0], desk))
            c.execute("""INSERT INTO complaint_step(complaint_id,step_id,done_at,done_by)
                         SELECT id, 'report_1930', now(), %s FROM complaint WHERE kind = 'cyber_financial_fraud'""", (desk,))
            c.execute("ANALYZE")
        for username in ("front_desk.load", "sho.load"):
            token = api.token(username, accounts[username])
            best = None
            for _ in range(3):
                start = time.perf_counter()
                status, rows = api.call("GET", "/api/complaints", token=token)
                took = time.perf_counter() - start
                assert status == 200 and len(rows) == 200, (username, status)
                best = took if best is None else min(best, took)
            assert best < LIMIT_SECONDS, f"{username} complaint list: {best:.3f} s"
