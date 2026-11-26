"""A recorded statement written down (A3, priority 5) in a real browser against the real core and the real gateway with the
offline speech stand-in (a recording whose bytes are text "says" that text). The IO picks the recording on the Statements
part, reads the draft in the statement box, corrects it and saves; the statement is the corrected text, the gateway's log
holds the recording's hash and the decision, and neither the recording nor the text. The saved statement is shown as
written down from a recording (V73). Fictional data only."""
import sys
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

from test_admin_scripts import admin_web  # noqa: F401  (the fixture: core with the demo case, gateway, web app)
from test_load_data import sign_in

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
from demo_case import Core  # noqa: E402

SPOKEN = "I was at home at nine in the evening."


def test_an_officer_corrects_and_saves_a_recording_written_down_by_the_speech_model(admin_web, tmp_path):  # noqa: F811
    web, admin, password, demo = admin_web
    core = Core(web)
    io = core.token("io.adminui", demo["accounts"]["io.adminui"])
    case = f"/api/firs/{demo['fir_id']}"
    recording = tmp_path / "witness.m4a"
    recording.write_bytes(SPOKEN.encode())
    sent = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1280, "height": 900})
        page.set_default_timeout(15000)
        page.on("request", lambda r: sent.append(r.url.rsplit("/", 1)[-1].split("?")[0]) if "/ai/v1/" in r.url else None)
        page.goto(web)
        sign_in(page, "io.adminui", demo["accounts"]["io.adminui"])
        page.locator("header select").first.select_option("en")
        page.evaluate(f"location.hash = '#/firs/{demo['fir_id']}/statements'")
        page.get_by_label("How it was recorded").select_option("audio")
        page.get_by_label("Write down a recording (AI draft)").set_input_files(str(recording))
        expect(page.get_by_text("A draft was written down from the recording.")).to_be_visible()
        box = page.get_by_label("The statement, in the words and language spoken")
        expect(box).to_have_value(SPOKEN)
        box.fill(SPOKEN + " My brother was with me.")
        page.get_by_role("button", name="Save statement").click()
        expect(page.get_by_text(SPOKEN + " My brother was with me.")).to_be_visible()
        expect(page.get_by_text("Written down from the recording by the speech model on this server, then checked by the officer")).to_be_visible()
        for _ in range(50):   # the decision is sent just after the save answers
            if "decisions" in sent:
                break
            page.wait_for_timeout(100)
        assert "transcribe" in sent and "decisions" in sent
        expect(page.get_by_role("alert")).to_have_count(0)
        browser.close()
    saved = core.call("GET", f"{case}/statements", token=io)["statements"]
    assert [(s["medium"], s["original_text"], s["from_recording"]) for s in saved] == [("audio", SPOKEN + " My brother was with me.", True)]
    # the gateway's own count for the case: one recording asked, one decision (edited), no text anywhere
    import json, urllib.request
    req = urllib.request.Request(f"{web}/ai/v1/ai-use?case_ref={demo['fir_id']}", headers={"Authorization": f"Bearer {io}"})
    with urllib.request.urlopen(req) as r:
        use = json.load(r)
    row = next(f for f in use["features"] if f["feature"] == "statement_transcribe")
    assert (row["asked"], row["edited"], row["accepted"], row["rejected"]) == (1, 1, 0, 0)
    assert "home" not in json.dumps(use)
