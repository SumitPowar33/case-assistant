"""Ask the case file (board 19) in a real browser against the real core and the real gateway with the offline `fake` provider.
The admin sets the feature to `fake`; the IO opens the demo case's Ask part: a question about guilt is refused and nothing is
sent, a question the file has no words for says "not in the file" and nothing is sent, and a question the complaint answers
reaches the gateway with the matching passage, shows the passage as the source, and the verdict is written to the audit log.
Fictional data only."""
from playwright.sync_api import expect, sync_playwright

from test_admin_scripts import admin_web  # noqa: F401  (the fixture: core with the demo case, gateway, web app)
from test_load_data import sign_in


def test_an_officer_asks_the_case_file(admin_web):  # noqa: F811
    web, admin, password, demo = admin_web
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
        name = "Answer questions about the case file"
        page.get_by_label(f"Provider for {name}").select_option("fake")
        page.get_by_role("button", name=f"Save {name}").click()
        expect(page.get_by_text(f"Saved: {name} now uses fake")).to_be_visible()
        page.get_by_role("button", name="Sign out").click()

        sign_in(page, "io.adminui", demo["accounts"]["io.adminui"])
        page.evaluate(f"location.hash = '#/firs/{demo['fir_id']}/ask'")
        expect(page.get_by_role("heading", name="Ask the case file")).to_be_visible()
        question = page.get_by_label("Your question")

        question.fill("Is the caller guilty?")
        page.get_by_role("button", name="Ask", exact=True).click()
        expect(page.get_by_text("does not say who is guilty or innocent")).to_be_visible()
        question.fill("What colour was the motorcycle?")
        page.get_by_role("button", name="Ask", exact=True).click()
        expect(page.get_by_text("Nothing was sent to the AI.")).to_be_visible()
        assert "generate" not in sent

        question.fill("How much money went out of my account by UPI?")
        page.get_by_role("button", name="Ask", exact=True).click()
        expect(page.get_by_text("AI draft · check each source")).to_be_visible()
        expect(page.get_by_text("Where this comes from")).to_be_visible()
        expect(page.locator("q").first).to_contain_text("Rs 40,000")
        assert sent.count("generate") == 1
        page.get_by_role("button", name="Useful").click()
        expect(page.get_by_text("Your verdict (useful) is logged.")).to_be_visible()
        assert "decisions" in sent
        browser.close()
