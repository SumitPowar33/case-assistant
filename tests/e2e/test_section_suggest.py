"""AI section suggestion (A2) in a real browser against the real core and the real gateway with the offline `fake`
provider. The admin sets the feature to `fake`; the IO opens the demo case's details and asks for sections. The request
goes through the real gateway (logged there); the offline provider only echoes the prompt, so the browser test puts a
model's answer in place of its draft: the two sections the FIR already has, IT Act 66D with two ingredients and the FIR's
words, and a charge that is not in the playbooks. The IO adds IT Act 66D with a reason; the core keeps it with the
gateway's request, the FIR's chips and the case diary show it, and the decision reaches the gateway's log. Fictional
data only."""
from conftest import no_tour
import json

from playwright.sync_api import expect, sync_playwright

from test_admin_scripts import admin_web  # noqa: F401  (the fixture: core with the demo case, gateway, web app)
from test_load_data import sign_in

ANSWER = [
    {"charge": "cyber-fraud/cheating", "ingredients": [{"id": "delivery", "quote": "Rs 40,000 went out of my account"}]},
    {"charge": "cyber-fraud/it_personation", "ingredients": [
        {"id": "computer_resource", "quote": "a code sent to my phone"},
        {"id": "personation", "quote": "a caller said he was from my bank"}]},
    {"charge": "cyber-fraud/extortion", "ingredients": [{"id": "threat", "quote": "my account would be blocked"}]},  # no such charge
]
REASON = "The caller posed as the bank and used a phone code (FIR text)"


def test_an_officer_adds_a_section_the_ai_suggested_from_the_playbook(admin_web):  # noqa: F811
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
        name = "Suggest sections from the playbooks"
        page.get_by_label(f"Provider for {name}").select_option("fake")
        page.get_by_role("button", name=f"Save {name}").click()
        expect(page.get_by_text(f"Saved: {name} now uses fake")).to_be_visible()
        page.get_by_role("button", name="Sign out").click()

        def model_answer(route):
            real = route.fetch()   # the real gateway answers and logs the request
            body = real.json()
            assert body["provider"] == "fake" and "Below are charges" in body["draft"]
            body["draft"] = json.dumps(ANSWER)
            route.fulfill(response=real, json=body)

        page.route("**/ai/v1/generate", model_answer)
        sign_in(page, "io.adminui", demo["accounts"]["io.adminui"])
        page.evaluate(f"location.hash = '#/firs/{demo['fir_id']}/case'")
        expect(page.get_by_role("heading", name="AI section suggestion")).to_be_visible()
        expect(page.get_by_text("The FIR does not record when the offence happened.", exact=False)).to_be_visible()
        page.get_by_role("button", name="Suggest sections with AI").click()
        expect(page.get_by_text("AI draft · you choose the sections")).to_be_visible()
        expect(page.get_by_text("1 answers of the AI did not point at a charge, an ingredient or words of the FIR text and are not shown.")).to_be_visible()
        expect(page.get_by_role("listitem", name="BNS 318(4)").get_by_text("Already in the FIR")).to_be_visible()
        it = page.get_by_role("listitem", name="IT Act 66D")
        expect(it.locator("mark")).to_have_text(["a code sent to my phone", "a caller said he was from my bank"])
        expect(it.get_by_text("A phone, app or computer was used", exact=False)).to_be_visible()   # the playbook's words
        add = it.get_by_role("button", name="Add to the FIR")
        expect(add).to_be_disabled()
        it.get_by_label("Why this section (at least 10 characters)").fill(REASON)
        add.click()
        expect(it.get_by_text("Added to the FIR")).to_be_visible()
        expect(page.locator(".page-head .chips").get_by_text("IT Act 66D")).to_be_visible()   # the FIR's own sections now
        page.get_by_role("button", name="Finish the check").click()
        expect(page.get_by_text("Your decision (all kept) is logged.")).to_be_visible()
        assert sent.count("generate") == 1 and "decisions" in sent

        page.reload()
        expect(page.get_by_text(REASON)).to_be_visible()
        expect(page.get_by_text("added during the investigation by", exact=False)).to_be_visible()
        page.evaluate(f"location.hash = '#/firs/{demo['fir_id']}/diary'")
        expect(page.get_by_text("Section added to the FIR", exact=False)).to_be_visible()
        expect(page.get_by_role("alert")).to_have_count(0)
        browser.close()
