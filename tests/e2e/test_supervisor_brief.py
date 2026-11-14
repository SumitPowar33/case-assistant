"""AI briefing on the Supervisor review (A9) in a real browser against the real core and the real gateway with the offline
`fake` provider. The admin sets the feature `supervisor_brief` to `fake`. The SHO of the demo station opens the Supervisor
review and asks for a briefing on the demo case in Marathi: the request goes through the real gateway, which asks the core
whether the SHO is on the case team (logged there), and carries only numbered facts of the table and the readiness check,
never a name. The offline provider only echoes the prompt, so the test puts a model's answer in its draft, built from the
facts it was sent: a sentence resting on the FIR's fact is shown with that fact, one that rates the IO is not, and the SHO
marks the briefing useful. Fictional data only."""
import json
import re

from playwright.sync_api import expect, sync_playwright

from test_admin_scripts import admin_web  # noqa: F401  (the fixture: core with the demo case, gateway, web app)
from test_load_data import sign_in


def test_the_sho_asks_for_an_ai_briefing_on_a_case_and_the_decision_is_logged(admin_web):  # noqa: F811
    web, admin, password, demo = admin_web
    posts, prompts = [], []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1280, "height": 900})
        page.set_default_timeout(15000)
        page.on("request", lambda r: posts.append((r.url.rsplit("/", 1)[-1], r.post_data)) if "/ai/v1/" in r.url and r.method == "POST" else None)
        page.goto(web)
        sign_in(page, admin, password)
        page.locator("header select").first.select_option("en")
        page.evaluate("location.hash = '#/settings'")
        name = "Brief the supervisor on a case near its deadline"
        page.get_by_label(f"Provider for {name}").select_option("fake")
        page.get_by_role("button", name=f"Save {name}").click()
        expect(page.get_by_text(f"Saved: {name} now uses fake")).to_be_visible()
        page.get_by_role("button", name="Sign out").click()

        def model_answer(route):
            real = route.fetch()   # the real gateway checks the case team, answers and logs the request
            body = real.json()
            assert real.status == 200 and body["provider"] == "fake", body
            prompts.append(body["draft"])
            first = re.search(r"^F1: (FIR \d+/\d+)", body["draft"], re.M).group(1)
            body["draft"] = json.dumps([
                {"text": f"{first} is open and needs the supervisor's attention.", "facts": ["F1"]},
                {"text": "The IO has been careless with this case.", "facts": ["F1"]},
            ])
            route.fulfill(response=real, json=body)

        page.route("**/ai/v1/generate", model_answer)
        sign_in(page, "sho.adminui", demo["accounts"]["sho.adminui"])
        page.get_by_role("link", name="Supervisor review").click()
        table = page.get_by_role("table", name="Open cases by nearest deadline")
        table.get_by_role("row").nth(1).get_by_role("button", name="AI briefing").click()
        brief = page.get_by_role("region", name=re.compile("AI briefing on FIR"))
        brief.get_by_label("Language of the briefing").select_option("mr")
        brief.get_by_role("button", name="Brief me with AI").click()
        expect(brief.get_by_text("is open and needs the supervisor's attention.")).to_be_visible()
        expect(brief.get_by_text(re.compile(r"^From: FIR \d+/\d+, sections: "))).to_be_visible()
        expect(brief.get_by_text("careless")).to_have_count(0)
        expect(brief.get_by_role("note")).to_contain_text("1 that rated an officer")
        brief.get_by_role("button", name="Useful", exact=True).click()
        expect(brief.get_by_text("Your answer (all kept) is logged.")).to_be_visible()

        assert [k for k, _ in posts] == ["generate", "decisions"], posts
        sent = json.loads(posts[0][1])
        assert sent["feature"] == "supervisor_brief" and sent["case_ref"] == demo["fir_id"] and "in Marathi" in sent["prompt"]
        assert json.loads(posts[1][1])["decision"] == "accepted"
        # no name reaches the gateway: not the IO's, nor any person of the demo case
        assert "Fictional Investigator" not in prompts[0] and "Fictional Station Head" not in prompts[0]
        assert "Fictional" not in sent["prompt"], sent["prompt"]
        expect(page.get_by_role("alert")).to_have_count(0)
        browser.close()
