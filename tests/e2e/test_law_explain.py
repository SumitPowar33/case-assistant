"""AI explanation on the old law to new law finder (A8) in a real browser against the real core and the real gateway with
the offline `fake` provider. The admin sets the feature `law_explain` to `fake`. An officer finds IPC 420 in the table and
asks for an explanation: the request goes through the real gateway (logged there) and carries only the two section numbers
and the table's description, no case and no case reference. The offline provider only echoes the prompt, so the test puts
a model's answer in its draft. The first answer gives an opinion on guilt and is not shown (its rejection is logged); the
second is shown with the numbers that are not in the table listed, and the officer marks it helpful. Fictional data only."""
import json

from playwright.sync_api import expect, sync_playwright

from test_admin_scripts import admin_web  # noqa: F401  (the fixture: core with the demo case, gateway, web app)
from test_load_data import sign_in

ANSWERS = ["The person who did this is guilty.", "BNS 318 took the place of IPC 420. It was reworded in 2023. Read the section in the Act."]


def test_an_officer_asks_the_ai_to_explain_a_law_section_and_the_decision_is_logged(admin_web):  # noqa: F811
    web, admin, password, demo = admin_web
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
        name = "Explain an old-to-new law section in plain words"
        page.get_by_label(f"Provider for {name}").select_option("fake")
        page.get_by_role("button", name=f"Save {name}").click()
        expect(page.get_by_text(f"Saved: {name} now uses fake")).to_be_visible()
        page.get_by_role("button", name="Sign out").click()

        def model_answer(route):
            real = route.fetch()   # the real gateway answers and logs the request
            body = real.json()
            assert body["provider"] == "fake" and "IPC section 420" in body["draft"]
            body["draft"] = next(answers)
            route.fulfill(response=real, json=body)

        page.route("**/ai/v1/generate", model_answer)
        sign_in(page, "io.adminui", demo["accounts"]["io.adminui"])
        page.evaluate("location.hash = '#/laws'")
        page.get_by_label("Section number or offence").fill("420")
        page.get_by_role("row").filter(has_text="IPC 420").get_by_role("button", name="Explain in plain words").click()
        expect(page.get_by_role("heading", name="AI explanation of IPC 420 → BNS 318")).to_be_visible()
        page.get_by_label("Language of the explanation").select_option("hi")
        page.get_by_role("button", name="Explain with AI").click()
        expect(page.get_by_text("gave an opinion on guilt or truthfulness")).to_be_visible()
        expect(page.get_by_text("is guilty")).to_have_count(0)
        page.get_by_role("button", name="Explain with AI").click()
        expect(page.get_by_text("BNS 318 took the place of IPC 420.", exact=False)).to_be_visible()
        expect(page.get_by_text("not in the table: 2023.", exact=False)).to_be_visible()
        page.get_by_role("button", name="Helpful", exact=True).click()
        expect(page.get_by_text("Your answer (all kept) is logged.")).to_be_visible()

        assert [k for k, _ in posts] == ["generate", "decisions", "generate", "decisions"], posts
        first = json.loads(posts[0][1])
        assert first["feature"] == "law_explain" and "case_ref" not in first and "in Hindi" in first["prompt"]
        assert "IPC section 420" in first["prompt"] and "BNS section 318" in first["prompt"]
        assert [json.loads(b)["decision"] for k, b in posts if k == "decisions"] == ["rejected", "accepted"]
        expect(page.get_by_role("alert")).to_have_count(0)
        browser.close()
