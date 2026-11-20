"""The real AI gateway asks the real core app about the case before any case text goes to a model (weekly review of
14 Nov 2026): the IO of the demo case gets a draft; once the victim's identity is protected the FIR text is refused for
fir_extract but Ask the case file still answers; the front desk and the platform admin, who are not on the case team,
are refused for that case; every refusal is in the gateway's audit log. Offline `fake` provider only; fictional data."""
import secrets
import sys

import psycopg

from conftest import PG, ROOT, running_core
from test_ai_gateway import running_gateway

sys.path.insert(0, str(ROOT / "scripts"))
from demo_case import load_demo  # noqa: E402

DB = "caseapp_e2e_ai_case"


def test_the_gateway_sends_a_case_s_text_only_for_its_team_and_not_when_the_victim_is_protected(tmp_path):
    secret = secrets.token_urlsafe(48)
    with running_core(DB, secret=secret) as (api, admin, password):
        demo = load_demo(api.base, admin, password, tag="aicheck")
        fir = demo["fir_id"]
        root = api.token(admin, password)
        io, desk = (api.token(f"{r}.aicheck", demo["accounts"][f"{r}.aicheck"]) for r in ("io", "front_desk"))
        with running_gateway(api.base, secret, tmp_path / "gateway.sqlite3", "e2e-gateway-case-check.log") as gw:
            for feature in ("fir_extract", "case_qa"):
                assert gw.call("PUT", f"/v1/settings/{feature}", {"provider": "fake"}, root)[0] == 200

            def ask(feature, token, case_ref=fir):
                return gw.call("POST", "/v1/generate", {"feature": feature, "prompt": "Fictional FIR text", "prompt_version": "e2e@1",
                                                         "case_ref": case_ref}, token)[0]

            assert ask("fir_extract", io) == 200
            assert ask("fir_extract", desk) == 404 and ask("fir_extract", root) == 404   # not on the case team
            assert ask("fir_extract", io, case_ref="FIR 1/2026") == 422                 # the FIR is named by its id
            # A1 at the front desk (session 117): the signed complaint's own check, with the desk's token
            complaint = demo["complaint_id"]

            def ask_complaint(token):
                return gw.call("POST", "/v1/generate", {"feature": "fir_extract", "prompt": "Fictional text", "prompt_version": "e2e@1",
                                                         "case_ref": complaint, "case_kind": "complaint"}, token)[0]
            assert ask_complaint(desk) == 200
            with psycopg.connect(dbname=DB, **PG) as c:
                c.execute("update fir set identity_protected = true where id = %s", (fir,))
            assert ask("fir_extract", io) == 403
            assert ask("case_qa", io) == 200                                           # still allowed (question 1 of session 92)
            status, audit = gw.call("GET", "/v1/audit", None, root)
            assert status == 200 and audit["chain_ok"] is True
            refused = [r for r in audit["rows"] if r["action"] == "ai_refused"]
            assert [r["detail"]["status"] for r in refused] == [403, 422, 404, 404]   # newest first
            assert refused[0]["case_ref"] == fir and refused[0]["detail"]["victim_protected"] is True
            # once its FIR protects the victim the complaint's text is withheld from a clerk who is not on the case team
            assert ask_complaint(desk) == 404
