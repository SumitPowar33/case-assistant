"""The demo case (scripts/demo_case.py, docs/DEMO.md) loads on the real core and shows in the browser what the demo
script says: the signed complaint and its FIR, the arrest with its 60-day limit, the evidence with only Part A of its
63(4) certificate, the BNSS 94 notice, and the readiness check with its gaps. If a change breaks the demo, this fails
before a demo does. Fictional data only."""
import datetime as dt
import sys

from playwright.sync_api import expect

from conftest import ROOT
from test_load_data import sign_in

sys.path.insert(0, str(ROOT / "scripts"))
from demo_case import IST, load_demo  # noqa: E402


def test_the_demo_case_loads_and_the_screens_show_what_the_demo_script_says(core, page):
    api, admin, password = core
    out = load_demo(api.base, admin, password, tag="demoe2e")
    accounts = out["accounts"]
    today = dt.datetime.now(IST).date()
    remand = today - dt.timedelta(days=2)

    # the readiness check as the core gives it: gaps left on purpose for the demo
    token = api.token("io.demoe2e", accounts["io.demoe2e"])
    status, readiness = api.call("GET", f"/api/firs/{out['fir_id']}/readiness", token=token)
    assert status == 200, readiness
    gaps = {g["key"].split(":")[0] for g in readiness["gaps"]}
    assert readiness["openGaps"] == len(readiness["gaps"]) >= 6, readiness["gaps"]
    assert {"ingredient", "certificate"} <= gaps and any("second" in g["text"] or "link" in g["key"] for g in readiness["gaps"] if g["key"].split(":")[0] not in ("ingredient", "certificate")), readiness["gaps"]
    assert [i["evidence"][0]["label"] for c in readiness["charges"] for i in c["ingredients"] if i["evidence"]] == ["E1"]

    sign_in(page, "io.demoe2e", accounts["io.demoe2e"])
    page.get_by_role("link", name=f"1/{(today - dt.timedelta(days=4)).year}", exact=True).click()
    main = page.get_by_role("main")
    expect(main).to_contain_text("Sections: BNS 318(4), BNS 319(2)")
    expect(main).to_contain_text("Rs 40,000 went out of my account by UPI")
    expect(main).to_contain_text("A1: arrested")
    expect(main).to_contain_text(f"chargesheet within 60 days, last day {remand + dt.timedelta(days=59)}")
    expect(main).to_contain_text("Nodal Officer, Fictional Demo Bank")
    expect(main).to_contain_text("E1 is electronic evidence without a complete BSA 63(4) certificate")
    expect(main).to_contain_text("No evidence linked for: The victim was deceived")

    # the front desk of the station reads the FIR registered from its signed complaint (the open list is empty: done)
    page.get_by_role("button", name="Sign out").click()
    sign_in(page, "front_desk.demoe2e", accounts["front_desk.demoe2e"])
    page.get_by_role("link", name="Front desk").click()
    expect(page.get_by_text("No open complaints.")).to_be_visible()
    page.get_by_role("link", name="FIRs").click()
    page.get_by_role("link", name=f"1/{(today - dt.timedelta(days=4)).year}", exact=True).click()
    expect(page.get_by_role("main")).to_contain_text("Rs 40,000 went out of my account by UPI")
