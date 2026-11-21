"""Numbers of an FIR seen in other FIRs of its station (board 2, A1, V65) in a real browser against the real core. Two more
FIRs are registered at the demo station, both with the demo IO: the same phone, written two ways, is confirmed as a fact of
each, and a masked account of one. The IO opens the first FIR's details: the phone is listed as also in the second FIR,
whose number opens it, and the masked account is not linked. The SHO sees the same link; a front desk officer is refused.
Fictional data only."""
import datetime as dt
import re
import sys

from playwright.sync_api import expect, sync_playwright

from conftest import ROOT, running_core, serving_web

sys.path.insert(0, str(ROOT / "scripts"))
from demo_case import load_demo  # noqa: E402
from test_load_data import sign_in  # noqa: E402

DB = "caseapp_e2e_fact_links"
REQ = "7d0c3f1e-2b4a-4c55-9a77-0f1e2d3c4b5a"


def test_the_io_sees_a_phone_of_this_fir_in_another_fir_of_the_station():
    with running_core(DB) as (api, admin, password):
        demo = load_demo(api.base, admin, password, tag="links")
        tok = {u: api.token(u, p) for u, p in demo["accounts"].items()}
        io, desk = tok["io.links"], tok["front_desk.links"]
        status, me = api.call("GET", "/api/me", token=io)
        assert status == 200, me
        station = me["station_id"]
        now = dt.datetime.now(dt.timezone.utc).replace(microsecond=0)

        def fir(no, text):
            status, body = api.call("POST", "/api/firs", {
                "stationId": station, "firYear": now.year, "firNo": no, "gdEntryNo": f"GD-{no}", "registeredAt": now.isoformat(),
                "informationReceivedAt": now.isoformat(), "contentsOriginal": text, "contentsLanguage": "en",
                "actionTaken": "investigate", "ioId": me["id"]}, desk)
            assert status == 201, body
            return body["id"]

        def fact(fir_id, kind, value):
            status, body = api.call("POST", f"/api/firs/{fir_id}/facts", {"kind": kind, "value": value, "aiValue": value, "quote": value, "aiRequestId": REQ}, io)
            assert status == 201, body

        first = fir(41, "A caller on +91 98765 41207 asked for a code; money went to A/c XXXX4471.")
        second = fir(42, "The same caller rang from 098765-41207.")
        fact(first, "phone", "+91 98765 41207")
        fact(first, "account", "XXXX4471")
        fact(second, "phone", "098765-41207")
        status, links = api.call("GET", f"/api/firs/{first}/facts/links", token=tok["sho.links"])
        assert status == 200 and [link["firs"][0]["id"] for link in links] == [second], links
        assert api.call("GET", f"/api/firs/{first}/facts/links", token=desk)[0] == 404

        with serving_web(api.base) as web, sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(viewport={"width": 1280, "height": 900})
            page.set_default_timeout(15000)
            page.goto(web)
            sign_in(page, "io.links", demo["accounts"]["io.links"])
            page.locator("header select").first.select_option("en")
            page.evaluate(f"location.hash = '#/firs/{first}/case'")
            card = page.locator(".card", has=page.get_by_role("heading", name="Numbers also in other FIRs of this station"))
            expect(card).to_be_visible()
            expect(card.get_by_role("listitem")).to_have_count(1)
            expect(card.get_by_role("listitem")).to_contain_text("+91 98765 41207")
            expect(card).not_to_contain_text("XXXX4471")
            card.get_by_role("link", name=f"FIR 42/{now.year}").click()
            expect(page).to_have_url(re.compile(f"#/firs/{second}$"))
            browser.close()
