"""AI translation of a statement (board 6, A3) in a real browser against the real core and the real gateway with the offline
`fake` provider. The admin sets the feature to `fake`; the IO has a Marathi statement of the demo case's complainant (recorded
through the API, as the screen would). The IO asks for an English translation: the request goes through the real gateway
(logged there); the offline provider only echoes the prompt, so the test puts a model's answer in its draft, with an amount
that differs from the original. The screen lists the number of the original the draft lacks; the IO corrects it and saves
the translation as checked (the decision reaches the gateway's log). After a reload the translation is read back from the
core under the original, which is unchanged, and no AI button is left. Fictional data only."""
from conftest import no_tour
import sys
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

from test_admin_scripts import admin_web  # noqa: F401  (the fixture: core with the demo case, gateway, web app)
from test_load_data import sign_in

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
from demo_case import Core  # noqa: E402

ORIGINAL = "मी २८ ऑक्टोबरला ४०,००० रुपये पाठवले."
DRAFT = "I sent Rs 4,000 on 28 October."


def test_an_officer_checks_and_saves_the_ai_translation_of_a_statement(admin_web):  # noqa: F811
    web, admin, password, demo = admin_web
    core = Core(web)
    io = core.token("io.adminui", demo["accounts"]["io.adminui"])
    case = f"/api/firs/{demo['fir_id']}"
    complainant = next(w for w in core.call("GET", f"{case}/statements", token=io)["witnesses"] if w["role"] == "complainant")
    core.call("POST", f"{case}/statements", {"personId": complainant["person_id"], "language": "mr", "medium": "written", "text": ORIGINAL}, io)
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
        name = "Translate statements (original always kept)"
        page.get_by_label(f"Provider for {name}").select_option("fake")
        page.get_by_role("button", name=f"Save {name}").click()
        expect(page.get_by_text(f"Saved: {name} now uses fake")).to_be_visible()
        page.get_by_role("button", name="Sign out").click()

        def model_answer(route):
            real = route.fetch()   # the real gateway answers and logs the request
            body = real.json()
            assert body["provider"] == "fake" and ORIGINAL in body["draft"]
            body["draft"] = DRAFT
            route.fulfill(response=real, json=body)

        page.route("**/ai/v1/generate", model_answer)
        sign_in(page, "io.adminui", demo["accounts"]["io.adminui"])
        page.evaluate(f"location.hash = '#/firs/{demo['fir_id']}/statements'")
        expect(page.get_by_text(ORIGINAL)).to_be_visible()
        page.get_by_role("button", name="Translate into English with AI").click()
        expect(page.get_by_text("AI draft · read it against the original")).to_be_visible()
        expect(page.get_by_text("Numbers of the original not in the draft: 40000. Check them before saving.")).to_be_visible()
        box = page.get_by_label("English translation (correct it where it differs from the original)")
        expect(box).to_have_value(DRAFT)
        box.fill("I sent Rs 40,000 on 28 October.")
        page.get_by_role("button", name="Save as checked").click()
        expect(page.get_by_text("English translation, checked")).to_be_visible()
        assert sent.count("generate") == 1 and "decisions" in sent

        page.reload()
        expect(page.get_by_text("I sent Rs 40,000 on 28 October.")).to_be_visible()
        expect(page.get_by_text(ORIGINAL)).to_be_visible()
        expect(page.get_by_text("corrected from the AI draft")).to_be_visible()
        expect(page.get_by_role("button", name="Translate into English with AI")).to_have_count(0)
        expect(page.get_by_role("alert")).to_have_count(0)
        browser.close()
    saved = core.call("GET", f"{case}/statements", token=io)["statements"]
    assert [s["original_text"] for s in saved] == [ORIGINAL] and saved[0]["translation_corrected"] is True
