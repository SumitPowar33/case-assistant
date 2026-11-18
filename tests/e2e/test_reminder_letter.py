"""AI reminder letter for a missing item (board 4, A4) in a real browser against the real core and the real gateway with the
offline `fake` provider. A fictional bank's reply brought one of two items. The IO asks for a reminder: the request goes
through the real gateway (feature notice_draft) and carries the FIR number and the numbered missing item only, not the item
already received and not the reply's text. The offline provider only echoes the prompt, so the test puts a model's letter in
its draft; the IO edits it and saves it as a draft follow-up notice that names the AI request, and the decision reaches the
gateway's log. Fictional data only."""
import json
import sys
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

from test_admin_scripts import admin_web  # noqa: F401  (the fixture: core with the demo case, gateway, web app)
from test_load_data import sign_in

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
from demo_case import Core  # noqa: E402

LETTER = "Kindly send the KYC documents asked for in our earlier notice."


def test_an_officer_drafts_a_reminder_for_a_missing_item_edits_it_and_saves_a_follow_up(admin_web):  # noqa: F811
    web, admin, password, demo = admin_web
    core = Core(web)
    io = core.token("io.adminui", demo["accounts"]["io.adminui"])
    case = f"/api/firs/{demo['fir_id']}"
    notice = core.call("POST", f"{case}/notices", {
        "kind": "BNSS_94", "addressee": "Nodal Officer, Fictional Reminder Bank", "itemsRequested": ["Account statement", "KYC documents"],
        "body": "Please produce the items listed.", "status": "sent", "issuedAt": "2026-10-05T10:00:00+05:30", "replyDueOn": "2026-10-12"}, io)
    core.call("POST", f"{case}/notices/{notice['id']}/replies", {
        "receivedAt": "2026-10-11T15:00:00+05:30", "channel": "email", "replyText": "SECRET-REPLY-WORDS statement attached",
        "checksJson": json.dumps([{"item": "KYC documents", "present": False}, {"item": "Account statement", "present": True}])}, io)
    asked = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1280, "height": 900})
        page.set_default_timeout(15000)
        page.goto(web)
        sign_in(page, admin, password)
        page.locator("header select").first.select_option("en")
        page.evaluate("location.hash = '#/settings'")
        name = "Draft BNSS 94 notices and follow-up letters"
        page.get_by_label(f"Provider for {name}").select_option("fake")
        page.get_by_role("button", name=f"Save {name}").click()
        expect(page.get_by_text(f"Saved: {name} now uses fake")).to_be_visible()
        page.get_by_role("button", name="Sign out").click()

        def model_answer(route):
            if route.request.method != "POST":
                return route.continue_()
            asked.append(route.request.post_data_json)
            real = route.fetch()   # the real gateway answers and logs the request
            body = real.json()
            assert body["provider"] == "fake"
            body["draft"] = LETTER
            route.fulfill(response=real, json=body)

        page.route("**/ai/v1/generate", model_answer)
        sign_in(page, "io.adminui", demo["accounts"]["io.adminui"])
        page.evaluate(f"location.hash = '#/firs/{demo['fir_id']}/notices'")
        card = page.locator("li.card", has_text="Nodal Officer, Fictional Reminder Bank")
        card.get_by_role("button", name="Draft a reminder letter with AI").click()
        box = card.get_by_role("region", name="AI draft")
        expect(box.get_by_label("Text of the notice")).to_have_value(LETTER)
        box.get_by_label("Text of the notice").fill(LETTER + " Reply within seven days.")
        box.get_by_role("button", name="Save as a follow-up notice (draft)").click()
        expect(page.locator("li.card", has_text="Follow-up").filter(has_text="Nodal Officer, Fictional Reminder Bank")).to_be_visible()
        browser.close()
    prompt = asked[0]["prompt"]
    assert asked[0]["feature"] == "notice_draft" and asked[0]["prompt_version"] == "notice_draft/reminder@1"
    assert "1. KYC documents" in prompt and "Account statement" not in prompt and "SECRET-REPLY-WORDS" not in prompt
    saved = core.call("GET", f"{case}/notices", token=io)
    mine = next(n for n in saved if n["kind"] == "follow_up" and n["addressee"] == "Nodal Officer, Fictional Reminder Bank")
    assert mine["status"] == "draft" and mine["items_requested"] == ["KYC documents"] and mine["ai_drafted"] is True
