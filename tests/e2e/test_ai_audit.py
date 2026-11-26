"""The Audit log with the AI's entries and the export of one case, as a file and as a court paper (board 20), in a real browser against the real core and
the real gateway with the offline `fake` provider. The IO asks the case file a question, keeps the draft, and asks one the
app refuses; the station's SHO sees both on the Audit screen, in one list with the application's entries, with the IO's name,
the result and the model, narrows the list with its filters, saves the case's entries as a file with a reason, prints them as
a court paper with the FIR number on every page, and the log then shows the exports. The IO has no such screen. Fictional
data only."""
import csv
import io
import re
import shutil
import subprocess

from conftest import ROOT, Api, no_tour
from playwright.sync_api import expect, sync_playwright

from test_admin_scripts import admin_web  # noqa: F401  (the fixture: core with the demo case, gateway, web app)
from test_load_data import sign_in


def test_the_station_head_sees_the_ai_entries_and_saves_one_cases_audit(admin_web, tmp_path):  # noqa: F811
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

        # the IO also accepts one readiness gap in writing, so the log has a gap to name in words
        api = Api(web)
        status, body = api.call("POST", f"/api/firs/{demo['fir_id']}/readiness/overrides",
                                {"gapKey": "ingredient:cheating/deception", "reason": "Fictional reason: the statement is awaited"},
                                api.token("io.adminui", demo["accounts"]["io.adminui"]))
        assert status == 201, body

        sign_in(page, "sho.adminui", demo["accounts"]["sho.adminui"])
        page.evaluate("location.hash = '#/audit'")
        table = page.get_by_role("table", name="Audit log of this police station, newest first")
        # everything in one list, newest first: the accepted gap (the latest) above the AI's entries
        gap = "No evidence linked for an ingredient: The victim was deceived (BNS 318(4))"
        expect(table.get_by_role("row").filter(has_text="Gap accepted")).to_contain_text(gap)
        everything = table.inner_text()
        assert everything.index("Gap accepted") < everything.index("Question about guilt")
        page.get_by_role("button", name="AI drafts and decisions", exact=True).click()
        expect(table.get_by_role("row").filter(has_text="Gap accepted")).to_have_count(0)
        expect(table.get_by_role("row").filter(has_text="Refused")).to_contain_text("Question about guilt")
        kept = table.get_by_role("row").filter(has_text="Kept")
        expect(kept).to_contain_text("SI Fictional Investigator (SI)")
        expect(kept).to_contain_text(name)
        asked = table.get_by_role("row").filter(has_text="Draft asked")
        expect(asked).to_contain_text("fake-1")
        expect(asked.get_by_role("link", name=re.compile(r"^FIR "))).to_have_attribute("href", f"#/firs/{demo['fir_id']}")
        assert "How much money" not in table.inner_text() and "Is the caller" not in table.inner_text()
        page.locator("label", has_text=re.compile(r"^Show")).locator("select").select_option("refused")
        expect(table.get_by_role("row")).to_have_count(2)   # the head and the refused question
        page.screenshot(path=shots / "audit-ai-1280.png", full_page=True)
        page.get_by_role("button", name="Gap accepted", exact=True).click()
        expect(table.get_by_role("row")).to_have_count(2)
        expect(table.get_by_role("row").nth(1)).to_contain_text("Reason: Fictional reason: the statement is awaited")
        page.get_by_role("button", name="Everything", exact=True).click()
        expect(table.get_by_role("row").filter(has_text="Draft asked")).to_have_count(1)
        page.screenshot(path=shots / "audit-all-1280.png", full_page=True)

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
        assert [r[5] for r in entries if r[4] == "Gap accepted"] == [f"{gap} [ingredient:cheating/deception]"]
        assert "How much money" not in text and "Fictional Account Holder" not in text
        expect(page.get_by_text(f"Saved {got.value.suggested_filename}.")).to_be_visible()
        expect(table.get_by_role("row").filter(has_text="Case audit exported")).to_contain_text("Fictional Sessions Court")

        # the same entries as a court paper: only the paper prints, with the FIR and station at the head of every page
        page.get_by_label("Which court or inquiry asked").fill("Fictional Inquiry Officer asked for a signed paper")
        page.get_by_role("button", name="Print as a court paper").click()
        paper = page.get_by_role("article", name="Audit entries of one case")
        expect(paper).to_contain_text("Signature of the officer who took the export")
        expect(paper).to_contain_text(gap)
        expect(paper).to_contain_text("Fictional Inquiry Officer asked")
        assert "How much money" not in paper.inner_text() and "Fictional Account Holder" not in paper.inner_text()
        expect(table.get_by_role("row").filter(has_text="Case audit exported")).to_have_count(2)
        paper.screenshot(path=shots / "audit-paper-1280.png")
        page.emulate_media(media="print")
        expect(page.locator("header")).to_be_hidden()
        expect(table).to_be_hidden()
        expect(page.get_by_role("button", name="Save the file")).to_be_hidden()
        pdf = tmp_path / "audit.pdf"
        page.pdf(path=pdf, prefer_css_page_size=True)
        (shots / "audit-paper.pdf").write_bytes(pdf.read_bytes())
        if shutil.which("pdftotext"):
            printed = subprocess.run(["pdftotext", "-layout", str(pdf), "-"], capture_output=True, text=True, check=True).stdout
            pages = [t for t in printed.split("\f") if t.strip()]
            assert 1 <= len(pages) <= 4, len(pages)
            assert all(re.search(r"FIR \d{4}/1, Fictional", one) for one in pages), [one[:200] for one in pages]
            assert "Sign out" not in printed and "Save the file" not in printed and "Everything" not in printed
        page.emulate_media(media="screen")
        expect(page.get_by_role("alert")).to_have_count(0)
        page.set_viewport_size({"width": 390, "height": 844})
        assert page.evaluate("document.documentElement.scrollWidth") <= 390
        page.screenshot(path=shots / "audit-ai-390.png", full_page=True)
        browser.close()
    assert not errors, f"errors in the page: {errors}"
