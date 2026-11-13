"""AI draft of the 90-day letter to the victim (A7) in a real browser against the real core and the real gateway with the
offline `fake` provider. The admin sets the feature to `fake`. On the Deadlines part the IO ticks one step and asks for a
letter in Marathi: the request goes through the real gateway (logged there) and carries only the FIR number, its day and
the ticked step, nothing of the FIR text. The offline provider only echoes the prompt, so the test puts a model's answer
in its draft. The first answer promises an arrest and is not shown (and its rejection is logged); the second is shown,
the IO changes it, uses it, and the decision reaches the gateway. Fictional data only."""
import json
import sys
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

from test_admin_scripts import admin_web  # noqa: F401  (the fixture: core with the demo case, gateway, web app)
from test_load_data import sign_in

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
from demo_case import Core  # noqa: E402

ANSWERS = ["An arrest will definitely follow.", "आपली तक्रार नोंदवली आहे. तपास सुरू आहे."]


def test_an_officer_drafts_the_victim_letter_with_ai_and_the_decision_is_logged(admin_web):  # noqa: F811
    web, admin, password, demo = admin_web
    core = Core(web)
    io = core.token("io.adminui", demo["accounts"]["io.adminui"])
    fir = core.call("GET", f"/api/firs/{demo['fir_id']}", token=io)
    posts = []
    answers = iter(ANSWERS)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1280, "height": 900})
        page.set_default_timeout(15000)
        page.on("request", lambda r: posts.append((r.url.rsplit("/", 1)[-1], r.post_data)) if "/ai/v1/" in r.url and r.method == "POST" else None)
        page.goto(web)
        sign_in(page, admin, password)
        page.locator("header select").first.select_option("en")
        page.evaluate("location.hash = '#/settings'")
        name = "Draft the 90-day victim update"
        page.get_by_label(f"Provider for {name}").select_option("fake")
        page.get_by_role("button", name=f"Save {name}").click()
        expect(page.get_by_text(f"Saved: {name} now uses fake")).to_be_visible()
        page.get_by_role("button", name="Sign out").click()

        def model_answer(route):
            real = route.fetch()   # the real gateway answers and logs the request
            body = real.json()
            assert body["provider"] == "fake" and f"{fir['fir_no']}/{fir['fir_year']}" in body["draft"]
            body["draft"] = next(answers)
            route.fulfill(response=real, json=body)

        page.route("**/ai/v1/generate", model_answer)
        sign_in(page, "io.adminui", demo["accounts"]["io.adminui"])
        page.evaluate(f"location.hash = '#/firs/{demo['fir_id']}/deadlines'")
        expect(page.get_by_role("heading", name="AI draft of the 90-day letter to the victim or informant")).to_be_visible()
        page.get_by_label("Statements of people who know about the matter have been recorded").check()
        page.get_by_label("Language of the letter").select_option("mr")
        page.get_by_role("button", name="Draft the letter with AI").click()
        expect(page.get_by_text("promised a result")).to_be_visible()
        expect(page.get_by_label("Letter to the victim or informant", exact=True)).to_have_count(0)
        page.get_by_role("button", name="Draft the letter with AI").click()
        letter = page.get_by_label("Letter to the victim or informant", exact=True)
        expect(letter).to_have_value(ANSWERS[1])
        letter.fill(ANSWERS[1] + " संपर्क करा.")
        page.get_by_role("button", name="Use this letter").click()
        expect(page.get_by_text("Your decision (partly kept or corrected) is logged.", exact=False)).to_be_visible()

        kinds = [k for k, _ in posts]
        assert kinds == ["generate", "decisions", "generate", "decisions"], kinds
        prompt = json.loads(posts[0][1])["prompt"]
        assert f"the FIR number is {fir['fir_no']}/{fir['fir_year']}" in prompt and "in Marathi" in prompt
        assert fir["contents_original"] not in prompt and "banks" not in prompt
        assert [json.loads(b)["decision"] for k, b in posts if k == "decisions"] == ["rejected", "edited"]
        expect(page.get_by_role("alert")).to_have_count(0)
        browser.close()
