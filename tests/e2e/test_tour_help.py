"""The tour and the help chat in a real browser against the real core and the real gateway with the offline `fake` provider.
An officer's first sign-in starts the tour, which opens each screen of the menu; once ended it does not start again. The help
chat sends the question with the screens only (no case reference) as feature app_help and links the screens the answer
names. Fictional data only."""
import json

from playwright.sync_api import expect, sync_playwright

from conftest import no_tour
from test_admin_scripts import admin_web  # noqa: F401  (the fixture: core with the demo case, gateway, web app)
from test_load_data import sign_in


def test_the_tour_starts_once_and_the_help_chat_answers_from_the_screens(admin_web):  # noqa: F811
    web, admin, password, demo = admin_web
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = no_tour(browser.new_page(viewport={"width": 1280, "height": 900}))
        page.set_default_timeout(15000)
        page.goto(web)
        sign_in(page, admin, password)
        page.locator("header select").first.select_option("en")
        page.evaluate("location.hash = '#/settings'")
        name = "Help with using the app"
        page.get_by_label(f"Provider for {name}").select_option("fake")
        page.get_by_role("button", name=f"Save {name}").click()
        expect(page.get_by_text(f"Saved: {name} now uses fake")).to_be_visible()
        page.close()

        page = browser.new_page(viewport={"width": 1280, "height": 900})
        page.set_default_timeout(15000)
        sent = []
        page.on("request", lambda r: sent.append(json.loads(r.post_data)) if r.url.endswith("/ai/v1/generate") else None)
        page.goto(web)
        sign_in(page, "io.adminui", demo["accounts"]["io.adminui"])
        tour = page.get_by_role("dialog", name="Welcome to Case Assistant")
        expect(tour).to_be_visible()
        page.get_by_role("button", name="Next").click()
        expect(page.get_by_role("dialog", name="Dashboard")).to_be_visible()
        page.get_by_role("button", name="Next").click()
        expect(page.get_by_role("dialog", name="FIRs")).to_be_visible()
        assert page.evaluate("location.hash") == "#/firs"
        page.get_by_role("button", name="End the tour").click()
        expect(page.get_by_role("dialog")).to_have_count(0)
        page.reload()
        expect(page.get_by_role("button", name="Help")).to_be_visible()
        expect(page.get_by_role("dialog")).to_have_count(0)   # seen on this browser: not again by itself

        page.get_by_role("button", name="Help").click()
        page.get_by_label("Your question").fill("How do I take a complaint at the front desk?")
        page.get_by_role("button", name="Ask", exact=True).click()
        expect(page.get_by_text("AI answer · check it on the screen")).to_be_visible()
        expect(page.get_by_role("link", name="Open Dashboard")).to_have_attribute("href", "#/")
        assert len(sent) == 1 and sent[0]["feature"] == "app_help" and "case_ref" not in sent[0]
        assert demo["fir_id"] not in sent[0]["prompt"]   # the screens only: no FIR is open, none is sent
        browser.close()
