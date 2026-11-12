"""AI fact check of the FIR text (board 2, A1) in a real browser against the real core and the real gateway with the offline
`fake` provider. The admin sets the feature to `fake`; the IO opens the demo case's details and asks for the facts. The request
goes through the real gateway (logged there); the offline provider only echoes the prompt, so the browser test puts a model's
answer in place of its draft: two facts that point at the FIR text and one that does not. The IO corrects and confirms one,
marks one wrong, finishes the check (the decision reaches the gateway's log), and the confirmed fact is read back from the
core with its quote after a reload. Fictional data only."""
from conftest import no_tour
import json

from playwright.sync_api import expect, sync_playwright

from test_admin_scripts import admin_web  # noqa: F401  (the fixture: core with the demo case, gateway, web app)
from test_load_data import sign_in

ANSWER = [
    {"kind": "amount", "value": "Rs 40,000", "quote": "Rs 40,000 went out of my account"},
    {"kind": "upi", "value": "UPI", "quote": "by UPI"},
    {"kind": "phone", "value": "9800000000", "quote": "a code sent to my phone"},   # no number in the quote: not shown
]


def test_an_officer_confirms_the_facts_the_ai_found_in_the_fir(admin_web):  # noqa: F811
    web, admin, password, demo = admin_web
    sent = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = no_tour(browser.new_page(viewport={"width": 1280, "height": 900}))
        page.set_default_timeout(15000)
        page.on("request", lambda r: sent.append(r.url.rsplit("/", 1)[-1]) if "/ai/v1/" in r.url else None)
        page.goto(web)
        sign_in(page, admin, password)
        page.locator("header select").first.select_option("en")
        page.evaluate("location.hash = '#/settings'")
        name = "Pull facts out of an FIR or complaint"
        page.get_by_label(f"Provider for {name}").select_option("fake")
        page.get_by_role("button", name=f"Save {name}").click()
        expect(page.get_by_text(f"Saved: {name} now uses fake")).to_be_visible()
        page.get_by_role("button", name="Sign out").click()

        def model_answer(route):
            real = route.fetch()   # the real gateway answers and logs the request
            body = real.json()
            assert body["provider"] == "fake" and "Rs 40,000 went out of my account" in body["draft"]
            body["draft"] = "```json\n" + json.dumps(ANSWER) + "\n```"
            route.fulfill(response=real, json=body)

        page.route("**/ai/v1/generate", model_answer)
        sign_in(page, "io.adminui", demo["accounts"]["io.adminui"])
        page.evaluate(f"location.hash = '#/firs/{demo['fir_id']}/case'")
        expect(page.get_by_role("heading", name="AI fact check")).to_be_visible()
        expect(page.get_by_text("No fact of this FIR is confirmed yet.")).to_be_visible()
        page.get_by_role("button", name="Find facts with AI").click()
        expect(page.get_by_text("AI draft · check each fact")).to_be_visible()
        expect(page.get_by_text("1 answers of the AI did not point at words of the FIR text and are not shown.")).to_be_visible()
        amount = page.get_by_role("listitem", name="Amount: Rs 40,000")
        expect(amount.locator("mark")).to_have_text("Rs 40,000 went out of my account")
        amount.get_by_label("Value").fill("Rs 40,000 (one transfer)")
        amount.get_by_role("button", name="Confirm").click()
        expect(amount.get_by_text("Confirmed", exact=True)).to_be_visible()
        page.get_by_role("listitem", name="UPI id: UPI").get_by_role("button", name="Wrong").click()
        page.get_by_role("button", name="Finish the check").click()
        expect(page.get_by_text("Your decision (partly kept or corrected) is logged.")).to_be_visible()
        assert sent.count("generate") == 1 and "decisions" in sent

        page.reload()
        expect(page.get_by_role("heading", name="AI fact check")).to_be_visible()
        expect(page.get_by_text("Rs 40,000 (one transfer)")).to_be_visible()
        expect(page.get_by_text("(corrected; the AI read Rs 40,000)")).to_be_visible()
        expect(page.locator("q", has_text="Rs 40,000 went out of my account")).to_be_visible()
        expect(page.get_by_role("alert")).to_have_count(0)
        browser.close()
