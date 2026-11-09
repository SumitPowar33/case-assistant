"""AI reply reader (board 4, A4) in a real browser against the real core and the real gateway with the offline `fake`
provider. The admin sets the feature to `fake`; the IO has a sent BNSS 94 notice asking a fictional bank for two items. The
IO pastes the bank's reply and asks the AI: the request goes through the real gateway (logged there); the offline provider only
echoes the prompt, so the test puts a model's answer in its draft, one item with words that are in the reply and one with words
that are not. Only the first is pre-ticked. The IO ticks the second by hand and saves; the reply is recorded with both items,
the notice becomes complete, and the decision reaches the gateway's log. Fictional data only."""
import json
import sys
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

from test_admin_scripts import admin_web  # noqa: F401  (the fixture: core with the demo case, gateway, web app)
from test_load_data import sign_in

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
from demo_case import Core  # noqa: E402

REPLY = "Sir, the account statement for September 2026 is attached. The KYC papers will follow by post."


def test_an_officer_reads_a_banks_reply_with_the_ai_and_decides_each_item(admin_web):  # noqa: F811
    web, admin, password, demo = admin_web
    core = Core(web)
    io = core.token("io.adminui", demo["accounts"]["io.adminui"])
    case = f"/api/firs/{demo['fir_id']}"
    notice = core.call("POST", f"{case}/notices", {
        "kind": "BNSS_94", "addressee": "Nodal Officer, Fictional Bank Ltd", "itemsRequested": ["Account statement", "KYC documents"],
        "body": "Please produce the items listed.", "status": "sent", "issuedAt": "2026-10-05T10:00:00+05:30", "replyDueOn": "2026-10-12"}, io)
    sent = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1280, "height": 900})
        page.set_default_timeout(15000)
        page.on("request", lambda r: sent.append(r.url.rsplit("/", 1)[-1]) if "/ai/v1/" in r.url else None)
        page.goto(web)
        sign_in(page, admin, password)
        page.locator("header select").first.select_option("en")
        page.evaluate("location.hash = '#/settings'")
        name = "Check bank and telecom replies"
        page.get_by_label(f"Provider for {name}").select_option("fake")
        page.get_by_role("button", name=f"Save {name}").click()
        expect(page.get_by_text(f"Saved: {name} now uses fake")).to_be_visible()
        page.get_by_role("button", name="Sign out").click()

        def model_answer(route):
            real = route.fetch()   # the real gateway answers and logs the request
            body = real.json()
            assert body["provider"] == "fake" and REPLY in body["draft"]
            body["draft"] = json.dumps([
                {"item": "Account statement", "present": True, "quote": "the account statement for September 2026 is attached"},
                {"item": "KYC documents", "present": True, "quote": "the KYC documents are enclosed"},
                {"item": "certificate", "present": False, "quote": ""}])
            route.fulfill(response=real, json=body)

        page.route("**/ai/v1/generate", model_answer)
        sign_in(page, "io.adminui", demo["accounts"]["io.adminui"])
        page.evaluate(f"location.hash = '#/firs/{demo['fir_id']}/notices'")
        card = page.locator("li.card", has_text="Nodal Officer, Fictional Bank Ltd")   # the demo case has other notices
        form = card.locator("details", has_text="Log a reply")
        form.locator("summary").click()
        form.get_by_label("Received (date and time, IST)").fill("2026-10-11T15:00")
        form.get_by_label("Text of the reply (pasted; not saved)").fill(REPLY)
        form.get_by_role("button", name="Read the reply with AI").click()
        expect(form.get_by_text("Account statement: found in the reply")).to_be_visible()
        expect(form.get_by_text("KYC documents: not found in the reply")).to_be_visible()
        expect(form.get_by_label("Account statement", exact=True)).to_be_checked()
        expect(form.get_by_label("KYC documents", exact=True)).not_to_be_checked()
        form.get_by_label("KYC documents", exact=True).check()   # the officer reads "will follow by post" differently
        form.get_by_role("button", name="Save").click()
        expect(card.get_by_text("KYC documents: received")).to_be_visible()
        assert sent.count("generate") == 1 and "decisions" in sent
        browser.close()
    saved = core.call("GET", f"{case}/notices", token=io)
    mine = next(n for n in saved if n["id"] == notice["id"])
    assert mine["status"] == "complete" and mine["items_missing"] == [] and mine["replies"] == 1
