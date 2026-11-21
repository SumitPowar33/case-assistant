"""The report to the Magistrate on a section added during the investigation (A2, V64) in a real browser against the real
core. The IO of the demo case adds IT Act 66D by hand with a reason; the Case details part now shows the report card and
the readiness check lists the section as a gap. The IO drafts the report from the case (no AI), names the court, records
it as sent; after a reload the report is listed with its court and day, nothing waits, the gap is gone and the case
diary shows the step. Fictional data only."""
from playwright.sync_api import expect, sync_playwright

from test_admin_scripts import admin_web  # noqa: F401  (the fixture: core with the demo case, gateway, web app)
from test_load_data import sign_in

REASON = "The caller posed as the bank and used a phone code (FIR text)"
COURT = "Court of the Fictional Judicial Magistrate First Class"


def test_the_io_reports_an_added_section_to_the_magistrate(admin_web):  # noqa: F811
    web, admin, password, demo = admin_web
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1280, "height": 900})
        page.set_default_timeout(15000)
        page.goto(web)
        sign_in(page, "io.adminui", demo["accounts"]["io.adminui"])
        page.locator("header select").first.select_option("en")
        page.evaluate(f"location.hash = '#/firs/{demo['fir_id']}/case'")
        expect(page.get_by_role("heading", name="AI section suggestion")).to_be_visible()
        expect(page.get_by_role("heading", name="Report to the Magistrate on added sections")).to_have_count(0)

        own = page.locator("details", has_text="Add a section that is not in the playbooks")
        own.locator("summary").click()
        own.locator("select").select_option("IT Act")
        own.locator("input").fill("66D")
        own.locator("textarea").fill(REASON)
        own.get_by_role("button", name="Add section").click()
        expect(page.get_by_text("Waiting for a report: IT Act 66D")).to_be_visible()

        page.evaluate(f"location.hash = '#/firs/{demo['fir_id']}/readiness'")
        expect(page.get_by_text("IT Act 66D was added on", exact=False)).to_be_visible()

        page.evaluate(f"location.hash = '#/firs/{demo['fir_id']}/case'")
        card = page.locator("section", has=page.get_by_role("heading", name="Report to the Magistrate on added sections"))
        record = card.get_by_role("button", name="Record as sent")
        expect(record).to_be_disabled()
        card.get_by_label("Court").fill(COURT)
        card.get_by_role("button", name="Draft the report").click()
        text = card.get_by_label("Text of the report as sent")
        value = text.input_value()
        assert COURT in value and "1. IT Act 66D (added on " in value and REASON in value
        record.click()
        expect(card.get_by_text("The report is recorded.")).to_be_visible()

        page.reload()
        expect(card.get_by_text(f"sent to {COURT} on", exact=False)).to_be_visible()
        expect(card.get_by_text("Every added section has been reported.")).to_be_visible()
        page.evaluate(f"location.hash = '#/firs/{demo['fir_id']}/readiness'")
        expect(page.get_by_role("heading", name="Readiness check")).to_be_visible()
        expect(page.get_by_text("IT Act 66D was added on", exact=False)).to_have_count(0)
        page.evaluate(f"location.hash = '#/firs/{demo['fir_id']}/diary'")
        expect(page.get_by_text("Report on added sections sent to the Magistrate", exact=False)).to_be_visible()
        expect(page.get_by_role("alert")).to_have_count(0)
        browser.close()
