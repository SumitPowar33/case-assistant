"""A scanned reply read on the state's own server (A4) in a real browser against the real core and the real gateway with the
offline OCR stand-in (a file whose bytes after its signature are text "shows" that text). The IO picks the bank's scanned
PDF on the reply form, reads the text in the reply box, corrects the OCR's mistake and saves; the reply is kept with the
corrected text (a passage of the case file), and the gateway's log holds the file's hash and the decision, never the text.
Fictional data only."""
import json
import sys
import urllib.request
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

from test_admin_scripts import admin_web  # noqa: F401  (the fixture: core with the demo case, gateway, web app)
from test_load_data import sign_in

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
from demo_case import Core  # noqa: E402

READ = "Sir, the acount statement for September 2026 is enclosed."
CORRECTED = "Sir, the account statement for September 2026 is enclosed."


def test_an_officer_corrects_and_saves_a_scanned_reply_read_by_the_ocr(admin_web, tmp_path):  # noqa: F811
    web, admin, password, demo = admin_web
    core = Core(web)
    io = core.token("io.adminui", demo["accounts"]["io.adminui"])
    case = f"/api/firs/{demo['fir_id']}"
    notice = core.call("POST", f"{case}/notices", {
        "kind": "BNSS_94", "addressee": "Nodal Officer, Fictional Scan Bank", "itemsRequested": ["Account statement"],
        "body": "Please produce the items listed.", "status": "sent", "issuedAt": "2026-10-05T10:00:00+05:30", "replyDueOn": "2026-10-12"}, io)
    scan = tmp_path / "reply.pdf"
    scan.write_bytes(b"%PDF-" + READ.encode())
    sent = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1280, "height": 900})
        page.set_default_timeout(15000)
        page.on("request", lambda r: sent.append(r.url.rsplit("/", 1)[-1].split("?")[0]) if "/ai/v1/" in r.url else None)
        page.goto(web)
        sign_in(page, "io.adminui", demo["accounts"]["io.adminui"])
        page.locator("header select").first.select_option("en")
        page.evaluate(f"location.hash = '#/firs/{demo['fir_id']}/notices'")
        card = page.locator("li.card", has_text="Nodal Officer, Fictional Scan Bank")
        form = card.locator("details", has_text="Log a reply")
        form.locator("summary").click()
        form.get_by_label("Read a scan or photo of the reply (AI draft)").set_input_files(str(scan))
        expect(form.get_by_text("The text of 1 page(s) was read into the box.")).to_be_visible()
        box = form.get_by_label("Text of the reply (pasted; saved with the reply")
        expect(box).to_have_value(READ)
        shots = Path(__file__).resolve().parents[2] / "apps/core/target/screens"   # to compare with board 4 (build output, not kept)
        shots.mkdir(parents=True, exist_ok=True)
        # the open form is a panel at the screen edge (index.css); the details element itself has no box
        form.locator(".record-form").screenshot(path=str(shots / "reply-scan-1280.png"))
        page.set_viewport_size({"width": 390, "height": 844})
        form.locator(".record-form").screenshot(path=str(shots / "reply-scan-390.png"))
        assert page.evaluate("document.documentElement.scrollWidth") <= 390   # nothing wider than a phone
        page.set_viewport_size({"width": 1280, "height": 900})
        box.fill(CORRECTED)
        form.get_by_label("Received (date and time, IST)").fill("2026-10-11T15:00")
        form.get_by_label("Account statement", exact=True).check()
        form.get_by_role("button", name="Save").click()
        expect(card.get_by_text("Account statement: received")).to_be_visible()
        for _ in range(50):   # the decision is sent just after the save answers
            if "decisions" in sent:
                break
            page.wait_for_timeout(100)
        assert "read-scan" in sent and "decisions" in sent
        browser.close()
    mine = next(n for n in core.call("GET", f"{case}/notices", token=io) if n["id"] == notice["id"])
    assert mine["status"] == "complete" and mine["replies"] == 1
    kept = [x for x in core.call("GET", f"{case}/case-file", token=io)["passages"] if x["kind"] == "reply" and "Scan Bank" in x["title"]]
    assert [x["text"] for x in kept] == [CORRECTED]
    req = urllib.request.Request(f"{web}/ai/v1/ai-use?case_ref={demo['fir_id']}", headers={"Authorization": f"Bearer {io}"})
    with urllib.request.urlopen(req) as r:
        use = json.load(r)
    row = next(f for f in use["features"] if f["feature"] == "reply_scan")
    assert (row["asked"], row["edited"], row["accepted"], row["rejected"]) == (1, 1, 0, 0)
    assert "statement for September" not in json.dumps(use)
