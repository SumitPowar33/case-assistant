"""The duty roster at work (item 16) in a real browser against the real core, on the demo station: the officer in charge
sees that a court date falls on the investigating officer's leave, the front desk sees who is on duty now and the 112
screen who is on beat and patrol. Fits a desktop and a phone. Fictional data only."""
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

from conftest import ROOT, no_tour
from playwright.sync_api import expect, sync_playwright

from test_admin_scripts import admin_web  # noqa: F401  (the fixture: core with the demo case, gateway, web app)
from test_load_data import sign_in

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
from demo_case import Core  # noqa: E402


def test_the_roster_warns_of_a_court_date_and_the_desk_sees_who_is_on_duty(admin_web):  # noqa: F811
    web, _, _, demo = admin_web
    core = Core(web)
    token = lambda user: core.token(user, demo["accounts"][user])
    sho, io, desk = token("sho.adminui"), token("io.adminui"), token("front_desk.adminui")
    station = core.call("GET", "/api/me", token=sho)["station_id"]
    officer = {t: core.call("GET", "/api/me", token=t)["id"] for t in (io, desk)}
    now = datetime.now(timezone(timedelta(hours=5, minutes=30)))
    today, court_day = now.date().isoformat(), (now.date() + timedelta(days=2)).isoformat()
    entry = lambda who, on, **more: core.call("POST", "/api/duty-roster", {"stationId": station, "officerId": officer[who], "date": on, **more}, sho)
    core.call("POST", f"/api/firs/{demo['fir_id']}/court-events", {"kind": "prosecution_evidence", "date": court_day, "court": "Fictional Magistrate Court"}, io)
    entry(io, court_day, kind="leave")
    for shift in ("morning", "evening", "night"):
        entry(desk, today, kind="duty", shift=shift, post="beat")
    shots = ROOT / "apps/core/target"
    with sync_playwright() as p:
        browser = p.chromium.launch()
        errors = []

        def signed_in(user):
            page = no_tour(browser.new_page(viewport={"width": 1280, "height": 900}))
            page.set_default_timeout(15000)
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.goto(web)
            sign_in(page, user, demo["accounts"][user])
            page.locator("header select").first.select_option("en")
            return page

        def shoot(page, name):
            expect(page.get_by_role("alert")).to_have_count(0)
            page.screenshot(path=shots / f"{name}-1280.png", full_page=True)
            page.set_viewport_size({"width": 390, "height": 844})
            assert page.evaluate("document.documentElement.scrollWidth") <= 390, name
            page.screenshot(path=shots / f"{name}-390.png", full_page=True)

        page = signed_in("sho.adminui")
        page.evaluate("location.hash = '#/roster'")
        warned = page.get_by_role("region", name="Court dates to check (1)")
        expect(warned).to_contain_text("Investigating officer SI Fictional Investigator (SI) is rostered: Leave")
        expect(warned.get_by_role("link", name="Court date in FIR")).to_have_attribute("href", "#/court")
        shoot(page, "roster-court")

        page = signed_in("front_desk.adminui")
        for screen, title, name in (("#/front-desk", "On duty now", "desk-duty"), ("#/calls-112", "On beat and patrol now", "calls-duty")):
            page.set_viewport_size({"width": 1280, "height": 900})
            page.evaluate(f"location.hash = '{screen}'")
            on_duty = page.get_by_role("region", name=title)
            expect(on_duty).to_be_visible()
            if now.hour >= 6:   # before 6 am the shift running is last night's, which can no longer be written
                expect(on_duty).to_contain_text("HC Fictional Desk (HC): Beat")
            shoot(page, name)
        browser.close()
    assert not errors, f"errors in the page: {errors}"
