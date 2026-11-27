"""The playbooks' Marathi draft texts (item 3) in a real browser against the real core, on the demo case: an IO whose
screen is in Marathi opens the readiness check and reads each ingredient, charge and check in Marathi under the English
text, with a note that nobody has reviewed the translation. In English no translation shows. Fits a desktop and a phone.
Fictional data only."""
from conftest import ROOT, no_tour
from playwright.sync_api import expect, sync_playwright

from test_admin_scripts import admin_web  # noqa: F401  (the fixture: core with the demo case, gateway, web app)
from test_load_data import sign_in


def test_an_officer_reads_the_readiness_check_with_the_marathi_draft_under_the_english(admin_web):  # noqa: F811
    web, _, _, demo = admin_web
    shots = ROOT / "apps/core/target"
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = no_tour(browser.new_page(viewport={"width": 1280, "height": 900}))
        page.set_default_timeout(15000)
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(web)
        sign_in(page, "io.adminui", demo["accounts"]["io.adminui"])
        language = page.locator("header select").first
        language.select_option("en")
        page.evaluate(f"location.hash = '#/firs/{demo['fir_id']}/readiness'")
        english = page.get_by_text("The victim was deceived", exact=False).first
        expect(english).to_be_visible()
        expect(page.locator(".pb-text")).to_have_count(0)

        language.select_option("mr")
        marathi = page.locator(".pb-text", has_text="पीडिताची फसवणूक झाली").first
        expect(marathi).to_be_visible()
        expect(marathi).to_have_attribute("lang", "mr")
        expect(english).to_be_visible()   # the English text holds and stays
        expect(page.locator("h3 + .pb-text").first).to_have_text("फसवणूक करून अप्रामाणिकपणे मालमत्ता सुपूर्द करण्यास प्रवृत्त करणे")
        expect(page.get_by_text("कोणीही न तपासलेला मसुदा अनुवाद", exact=False)).to_be_visible()
        expect(page.locator(".pb-text", has_text="बँकेच्या नोडल अधिकाऱ्याचा जबाब नोंदवा")).to_be_visible()
        expect(page.get_by_role("alert")).to_have_count(0)
        page.screenshot(path=shots / "playbook-mr-1280.png", full_page=True)
        page.set_viewport_size({"width": 390, "height": 844})
        assert page.evaluate("document.documentElement.scrollWidth") <= 390
        page.screenshot(path=shots / "playbook-mr-390.png", full_page=True)
        assert not errors, errors
        browser.close()
