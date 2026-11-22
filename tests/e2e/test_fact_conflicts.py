"""Documents disagree (board 2, A1, session 123) in a real browser against the real core and the real gateway with the offline
`fake` provider. A fictional bank's reply to the demo case's notice gives another amount than the FIR. The IO asks to compare
the FIR with the case's documents: the browser reads the case file from the core and sends the FIR and the documents (not the
statements) through the real gateway (feature fact_conflicts, logged there). The offline provider only echoes the prompt, so
the test puts a model's answer in its draft: the real conflict, and one whose quote is not in the reply (not shown). Both
values are shown with their sources; the IO notes the conflict in the case diary, which holds both values, and the decision
reaches the gateway's log. Fictional data only."""
import json
import re
import sys
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

from test_admin_scripts import admin_web  # noqa: F401  (the fixture: core with the demo case, gateway, web app)
from test_load_data import sign_in

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
from demo_case import Core  # noqa: E402

REPLY = "Debit of Rs 45,000 by UPI from the account of the customer to an unknown account (fictional)."


def test_an_officer_sees_two_documents_disagree_and_notes_it_in_the_case_diary(admin_web):  # noqa: F811
    web, admin, password, demo = admin_web
    core = Core(web)
    io = core.token("io.adminui", demo["accounts"]["io.adminui"])
    case = f"/api/firs/{demo['fir_id']}"
    notice = core.call("POST", f"{case}/notices", {
        "kind": "BNSS_94", "addressee": "Nodal Officer, Fictional Conflict Bank", "itemsRequested": ["Account statement"],
        "body": "Please produce the items listed.", "status": "sent", "issuedAt": "2026-10-05T10:00:00+05:30", "replyDueOn": "2026-10-12"}, io)
    core.call("POST", f"{case}/notices/{notice['id']}/replies", {
        "receivedAt": "2026-10-11T15:00:00+05:30", "channel": "email", "replyText": REPLY,
        "checksJson": json.dumps([{"item": "Account statement", "present": True}])}, io)
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
        name = "Point out facts on which the FIR and other documents disagree"
        page.get_by_label(f"Provider for {name}").select_option("fake")
        page.get_by_role("button", name=f"Save {name}").click()
        expect(page.get_by_text(f"Saved: {name} now uses fake")).to_be_visible()
        page.get_by_role("button", name="Sign out").click()

        prompts = []

        def model_answer(route):
            real = route.fetch()   # the real gateway answers and logs the request
            body = real.json()
            prompt = json.loads(route.request.post_data)["prompt"]
            prompts.append(prompt)
            assert body["provider"] == "fake"
            reply = re.search(r"Source (D\d+):\n<<<\nReply to notice", prompt).group(1)
            body["draft"] = json.dumps([
                {"kind": "amount", "topic": "amount that went out by UPI", "a": {"source": "FIR", "value": "Rs 40,000", "quote": "Rs 40,000 went out"},
                 "b": {"source": reply, "value": "Rs 45,000", "quote": "Debit of Rs 45,000"}},
                {"kind": "amount", "topic": "a made-up amount", "a": {"source": "FIR", "value": "Rs 40,000", "quote": "Rs 40,000 went out"},
                 "b": {"source": reply, "value": "Rs 50,000", "quote": "Debit of Rs 50,000"}},
            ])
            route.fulfill(response=real, json=body)

        page.route("**/ai/v1/generate", model_answer)
        sign_in(page, "io.adminui", demo["accounts"]["io.adminui"])
        page.evaluate(f"location.hash = '#/firs/{demo['fir_id']}/case'")
        card = page.get_by_label("Documents disagree", exact=True)
        card.get_by_role("button", name="Compare the FIR with the case's documents using AI").click()
        expect(card.get_by_text("amount that went out by UPI")).to_be_visible()
        expect(card.get_by_text("a made-up amount")).to_have_count(0)
        expect(card.get_by_text("Rs 45,000", exact=True)).to_be_visible()
        expect(card.get_by_text("Rs 40,000", exact=True)).to_be_visible()
        expect(card.get_by_text(re.compile(r"^Reply to notice BNSS_94 from Nodal Officer, Fictional Conflict Bank"))).to_be_visible()
        assert len(prompts) == 1 and REPLY in prompts[0] and "Rs 40,000 went out of my account" in prompts[0]
        card.get_by_role("button", name="Note in case diary to confirm").click()
        expect(card.get_by_text("Noted in the case diary.")).to_be_visible()
        assert sent.count("generate") == 1 and "decisions" in sent
        expect(page.get_by_role("alert")).to_have_count(0)
        browser.close()
    diary = core.call("GET", f"{case}/diary", token=io)
    assert any("Documents disagree (amount that went out by UPI)" in e["text"] and "Rs 40,000" in e["text"] and "Rs 45,000" in e["text"]
               for e in diary["entries"]), diary
