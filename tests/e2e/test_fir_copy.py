"""The FIR copy as paper (item 18) in a real browser against the real core. The IO shows the FIR as paper and prints it: a
long information runs over several A4 pages with the FIR number on every page and nothing else of the screen, and a long
case diary page prints the same way. A FIR whose
victim's identity is protected gives a paper with no name, place or text. Fictional data only."""
import datetime as dt
import re
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

TEXT = "\n".join(f"Fictional line {n}: the caller said the account would be blocked and asked for a code sent to the phone."
                 for n in range(1, 121))


def test_the_fir_copy_prints_with_its_number_on_every_page(admin_web, tmp_path):  # noqa: F811
    web, admin, password, demo = admin_web
    core = Core(web)
    io = core.token("io.adminui", demo["accounts"]["io.adminui"])
    first = core.call("GET", f"/api/firs/{demo['fir_id']}", token=io)
    now = dt.datetime.now(dt.timezone(dt.timedelta(hours=5, minutes=30))).replace(microsecond=0)
    new = {"stationId": first["station_id"], "firYear": now.year, "gdEntryNo": "GD-41", "registeredAt": now.isoformat(),
           "informationReceivedAt": (now - dt.timedelta(hours=1)).isoformat(), "contentsOriginal": TEXT, "contentsLanguage": "en",
           "actionTaken": "investigate", "ioId": first["io_id"], "sections": [{"act": "BNS", "section": "318(4)"}]}
    long_fir = core.call("POST", "/api/firs", {**new, "firNo": 4101}, io)["id"]
    protected = core.call("POST", "/api/firs", {**new, "firNo": 4102, "sexualOffence": True,
                                                "contentsOriginal": "Fictional words that name the victim"}, io)["id"]
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
        page.evaluate(f"location.hash = '#/firs/{long_fir}/case'")
        page.get_by_role("button", name="Show the FIR as paper").click()
        paper = page.get_by_role("article", name="First information report, paper copy")
        expect(paper).to_contain_text("Under section 173 of the Bharatiya Nagarik Suraksha Sanhita")
        expect(paper).to_contain_text("Fictional line 120:")
        paper.screenshot(path=shots / "fir-copy-1280.png")
        page.emulate_media(media="print")
        expect(page.locator("header")).to_be_hidden()
        expect(page.get_by_role("button", name="Print the FIR copy")).to_be_hidden()
        pdf = tmp_path / "fir-copy.pdf"
        page.pdf(path=pdf, prefer_css_page_size=True)
        (shots / "fir-copy.pdf").write_bytes(pdf.read_bytes())
        count = len(re.findall(rb"/Type\s*/Page[^s]", pdf.read_bytes()))
        assert 3 <= count <= 8, count   # 120 lines at the court's size; nothing else of the screen takes paper
        if shutil.which("pdftotext"):
            text = subprocess.run(["pdftotext", "-layout", str(pdf), "-"], capture_output=True, text=True, check=True).stdout
            pages = [t for t in text.split("\f") if t.strip()]
            assert len(pages) == count, (len(pages), count)
            for number, one in enumerate(pages, 1):
                assert f"FIR 4101/{now.year}" in one, (number, one[:300])
            assert "Fictional line 1:" in text and "Fictional line 120:" in text
            assert all(text.count(f"Fictional line {n}:") == 1 for n in (1, 60, 120))   # not printed twice, as on screen and paper
            assert "Sign out" not in text and "Show the FIR as paper" not in text
        page.emulate_media(media="screen")

        # a long diary page prints the same way, with the FIR number and station at the head of every page
        for n in range(1, 61):
            core.call("POST", f"/api/firs/{long_fir}/diary", {"text": f"Fictional entry {n}: visited the fictional branch and noted what was said."}, io)
        page.evaluate(f"location.hash = '#/firs/{long_fir}/diary'")
        page.reload()   # the diary was read when the FIR screen opened, before these entries
        page.get_by_role("button", name="Show this page as paper").click()
        expect(page.get_by_label("Case diary page, paper copy")).to_contain_text("Fictional entry 60:")
        page.emulate_media(media="print")
        page.pdf(path=pdf, prefer_css_page_size=True)
        if shutil.which("pdftotext"):
            text = subprocess.run(["pdftotext", "-layout", str(pdf), "-"], capture_output=True, text=True, check=True).stdout
            pages = [t for t in text.split("\f") if t.strip()]
            assert 2 <= len(pages) <= 8, len(pages)
            assert all(f"FIR 4101/{now.year}" in one for one in pages), [one[:200] for one in pages]
            assert "Fictional entry 1:" in text and "Fictional entry 60:" in text and "Add what you saw" not in text
        page.emulate_media(media="screen")

        page.evaluate(f"location.hash = '#/firs/{protected}/case'")
        page.get_by_role("button", name="Show the FIR as paper").click()
        expect(paper.get_by_role("note")).to_contain_text("withheld on this paper")
        expect(paper).to_contain_text("FIR 4102/")
        expect(paper).not_to_contain_text("name the victim")
        page.set_viewport_size({"width": 390, "height": 844})
        assert page.evaluate("document.documentElement.scrollWidth") <= 390
        page.screenshot(path=shots / "fir-copy-390.png", full_page=True)
        expect(page.get_by_role("alert")).to_have_count(0)
        browser.close()
    assert not errors, f"errors in the page: {errors}"
