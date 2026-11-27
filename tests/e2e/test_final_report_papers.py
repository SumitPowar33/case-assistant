"""The papers that go with the final report (item 18, BNSS 193(6) and (8)) in a real browser against the real core, on the
demo case: the Final report part lists them with what is still expected (the bank's reply) and what is not on file (Part B
of the 63(4) certificate), and the printed report carries the custody sequence of the electronic device and the index of
the papers, on A4 pages with nothing else of the screen. Fits a desktop and a phone. Fictional data only."""
import shutil
import subprocess
import sys
from pathlib import Path

from conftest import ROOT, no_tour
from playwright.sync_api import expect, sync_playwright

from test_admin_scripts import admin_web  # noqa: F401  (the fixture: core with the demo case, gateway, web app)
from test_load_data import sign_in

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
from demo_case import Core  # noqa: E402


def test_the_final_report_lists_and_prints_the_papers_that_go_with_it(admin_web, tmp_path):  # noqa: F811
    web, _, _, demo = admin_web
    core = Core(web)
    io = core.token("io.adminui", demo["accounts"]["io.adminui"])
    shots = ROOT / "apps/core/target"
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = no_tour(browser.new_page(viewport={"width": 1280, "height": 900}))
        page.set_default_timeout(15000)
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(web)
        sign_in(page, "io.adminui", demo["accounts"]["io.adminui"])
        page.locator("header select").first.select_option("en")
        page.evaluate(f"location.hash = '#/firs/{demo['fir_id']}/finalReport'")
        listed = page.get_by_role("region", name="Papers that go with the report")
        expect(listed.get_by_text("BSA 63(4) certificate of item E1")).to_be_visible()
        expect(listed.get_by_text("Part B missing")).to_be_visible()
        expect(listed.get_by_text("Reply awaited")).to_be_visible()
        expect(listed.get_by_text("Nodal Officer, Fictional Demo Bank")).to_be_visible()
        listed.screenshot(path=shots / "report-papers-1280.png")

        page.get_by_role("button", name="Print for the court").click()
        paper = page.get_by_role("article", name="Final report (charge-sheet)")
        expect(paper).to_contain_text("Sequence of custody of electronic devices:")
        expect(paper).to_contain_text("Handed over by SI Fictional Investigator to HC Fictional Store Keeper")
        expect(paper).to_contain_text("Index of papers sent with this report:")
        paper.screenshot(path=shots / "report-paper-1280.png")
        page.emulate_media(media="print")
        expect(page.locator("header")).to_be_hidden()
        expect(listed).to_be_hidden()
        pdf = tmp_path / "report.pdf"
        page.pdf(path=pdf, prefer_css_page_size=True)
        (shots / "final-report.pdf").write_bytes(pdf.read_bytes())
        if shutil.which("pdftotext"):
            text = subprocess.run(["pdftotext", "-layout", str(pdf), "-"], capture_output=True, text=True, check=True).stdout
            pages = [t for t in text.split("\f") if t.strip()]
            number = core.call("GET", f"/api/firs/{demo['fir_id']}", token=io)["fir_no"]
            assert all(f"FIR {number}/" in one for one in pages), [one[:200] for one in pages]
            assert "Index of papers sent with this report" in text and "Sequence of custody of electronic devices" in text
            assert "BSA 63(4) certificate of item E1" in text and "Part B" in text   # the state wraps in its narrow column
            assert "make indexed copies" not in text and "Sign out" not in text and "Papers that go with the report" not in text
        page.emulate_media(media="screen")

        page.set_viewport_size({"width": 390, "height": 844})
        assert page.evaluate("document.documentElement.scrollWidth") <= 390
        page.screenshot(path=shots / "report-papers-390.png", full_page=True)
        expect(page.get_by_role("alert")).to_have_count(0)
        browser.close()
    assert not errors, f"errors in the page: {errors}"
