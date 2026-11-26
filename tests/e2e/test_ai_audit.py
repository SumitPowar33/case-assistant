"""The Audit log with the AI's entries and the export of one case (board 20), in a real browser against the real core and
the real gateway with the offline `fake` provider. The IO asks the case file a question, keeps the draft, and asks one the
app refuses; the station's SHO sees both on the Audit screen with the IO's name, the result and the model, saves the case's
entries as a file with a reason, and the log then shows the export. The IO has no such screen. Fictional data only."""
import csv
import io
import re

from conftest import ROOT, no_tour
from playwright.sync_api import expect, sync_playwright

from test_admin_scripts import admin_web  # noqa: F401  (the fixture: core with the demo case, gateway, web app)
from test_load_data import sign_in


def test_the_station_head_sees_the_ai_entries_and_saves_one_cases_audit(admin_web):  # noqa: F811
    web, admin, password, demo = admin_web
    shots = ROOT / "apps/core/target"
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = no_tour(browser.new_page(viewport={"width": 1280, "height": 900}))
        page.set_default_timeout(15000)
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(web)
        sign_in(page, admin, password)
        page.locator("header select").first.select_option("en")
        page.evaluate("location.hash = '#/settings'")
        name = "Answer questions about the case file"
        page.get_by_label(f"Provider for {name}").select_option("fake")
        page.get_by_role("button", name=f"Save {name}").click()
        expect(page.get_by_text(f"Saved: {name} now uses fake")).to_be_visible()
        page.get_by_role("button", name="Sign out").click()

        sign_in(page, "io.adminui", demo["accounts"]["io.adminui"])
        page.evaluate(f"location.hash = '#/firs/{demo['fir_id']}/ask'")
        question = page.get_by_label("Your question")
        question.fill("How much money went out of my account by UPI?")
        page.get_by_role("button", name="Ask", exact=True).click()
        expect(page.get_by_text("AI draft · check each source")).to_be_visible()
        page.get_by_role("button", name="Useful", exact=True).click()
        expect(page.get_by_text("Your verdict (useful) is logged.")).to_be_visible()
        question.fill("Is the caller guilty?")
        page.get_by_role("button", name="Ask", exact=True).click()
        expect(page.get_by_text("does not say who is guilty or innocent")).to_be_visible()
        expect(page.get_by_role("link", name="Audit log")).to_have_count(0)
        page.get_by_role("button", name="Sign out").click()

        sign_in(page, "sho.adminui", demo["accounts"]["sho.adminui"])
        page.evaluate("location.hash = '#/audit'")
        table = page.get_by_role("table", name="AI entries on this station's cases, newest first")
        expect(table.get_by_role("row").filter(has_text="Refused")).to_contain_text("Question about guilt")
        kept = table.get_by_role("row").filter(has_text="Kept")
        expect(kept).to_contain_text("SI Fictional Investigator (SI)")
        expect(kept).to_contain_text(name)
        asked = table.get_by_role("row").filter(has_text="Draft asked")
        expect(asked).to_contain_text("fake-1")
        expect(asked.get_by_role("link", name=re.compile(r"^FIR "))).to_have_attribute("href", f"#/firs/{demo['fir_id']}")
        assert "How much money" not in table.inner_text() and "Is the caller" not in table.inner_text()
        page.get_by_label("Show").select_option("refused")
        expect(table.get_by_role("row")).to_have_count(2)   # the head and the refused question
        page.screenshot(path=shots / "audit-ai-1280.png", full_page=True)

        page.get_by_label("Which court or inquiry asked").fill("Fictional Sessions Court asked for the record")
        with page.expect_download() as got:
            page.get_by_role("button", name="Save the file").click()
        assert re.fullmatch(r"audit-FIR-\d{4}-1\.csv", got.value.suggested_filename)
        text = got.value.path().read_text(encoding="utf-8-sig")
        rows = list(csv.reader(io.StringIO(text)))
        head = rows.index(["Time", "Recorded by", "Officer", "Rank", "Entry", "Detail", "Reason"])
        entries = [r for r in rows[head + 1:] if r]
        ai = [(r[2], r[4]) for r in entries if r[1] == "AI gateway" and "Answer questions" in r[5]]
        assert ai == [("SI Fictional Investigator", "AI: asked"), ("SI Fictional Investigator", "AI: accepted"), ("SI Fictional Investigator", "AI: refused")]
        assert entries[-1][4] == "Case audit exported" and entries[-1][6] == "Fictional Sessions Court asked for the record"
        assert [r[0] for r in entries] == sorted(r[0] for r in entries)
        assert "How much money" not in text and "Fictional Account Holder" not in text
        expect(page.get_by_text(f"Saved {got.value.suggested_filename}.")).to_be_visible()
        log = page.get_by_role("table", name="Audit log of this police station, newest first")
        expect(log.get_by_role("row").filter(has_text="Case audit exported")).to_contain_text("Fictional Sessions Court")
        expect(page.get_by_role("alert")).to_have_count(0)
        page.set_viewport_size({"width": 390, "height": 844})
        assert page.evaluate("document.documentElement.scrollWidth") <= 390
        page.screenshot(path=shots / "audit-ai-390.png", full_page=True)
        browser.close()
    assert not errors, f"errors in the page: {errors}"
