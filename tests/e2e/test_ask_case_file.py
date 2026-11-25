"""Ask the case file (board 19) in a real browser against the real core and the real gateway with the offline `fake` provider.
The admin sets the feature to `fake`; the IO opens the demo case's Ask part: a question about guilt is refused, only the
question goes to the gateway, which refuses and logs it, a question the file has no words for says "not in the file" and nothing is sent, and a question the complaint answers
reaches the gateway with the matching passage, shows the passage as the source, and the verdict is written to the audit log.
The case diary part then counts the AI use of the case. The meaning search runs too, with the gateway's offline embedder: the question and the pieces are embedded, the core keeps the
vectors, and the next question embeds only itself. Fictional data only."""
from conftest import no_tour
from playwright.sync_api import expect, sync_playwright

from test_admin_scripts import admin_web  # noqa: F401  (the fixture: core with the demo case, gateway, web app)
from test_load_data import sign_in


def test_an_officer_asks_the_case_file(admin_web):  # noqa: F811
    web, admin, password, demo = admin_web
    sent = []
    embeds = []   # what each embedding call was for: the question, or the pieces of the case file
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = no_tour(browser.new_page(viewport={"width": 1280, "height": 900}))
        page.set_default_timeout(15000)
        page.on("request", lambda r: sent.append(r.url.rsplit("/", 1)[-1]) if "/ai/v1/" in r.url else None)
        page.on("request", lambda r: embeds.append(r.post_data_json["kind"]) if r.url.endswith("/ai/v1/embed") else None)
        page.on("request", lambda r: sent.append("vectors-" + r.method) if "/case-file/vectors" in r.url else None)
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
        # the refused question alone went to the gateway, which refused it too and logged it (weekly review 21 Nov); the
        # question the file has no words for sent nothing
        assert sent.count("generate") == 1

        assert embeds == ["query", "passage"] and "vectors-PUT" in sent   # the pieces were embedded once and kept in the core
        question.fill("How much money went out of my account by UPI?")
        page.get_by_role("button", name="Ask", exact=True).click()
        expect(page.get_by_text("AI draft · check each source")).to_be_visible()
        expect(page.get_by_text("Where this comes from")).to_be_visible()
        expect(page.locator("q").first).to_contain_text("Rs 40,000")
        assert sent.count("generate") == 2
        assert embeds == ["query", "passage", "query"]   # the pieces' vectors came from the core this time
        expect(page.get_by_text("Found by words only")).to_have_count(0)
        page.get_by_role("button", name="Useful").click()
        expect(page.get_by_text("Your verdict (useful) is logged.")).to_be_visible()
        assert "decisions" in sent
        # the case diary part counts it: one draft asked, one kept, and the meaning searches (A9, board 20)
        page.evaluate(f"location.hash = '#/firs/{demo['fir_id']}/diary'")
        expect(page.get_by_role("heading", name="AI use in this case")).to_be_visible()
        row = page.get_by_role("row").filter(has_text="Answer questions about the case file")
        expect(row.locator("td").nth(1)).to_have_text("1")   # asked
        expect(row.locator("td").nth(2)).to_have_text("1")   # kept
        expect(row.locator("td").nth(5)).to_have_text("1")   # refused: the question about guilt
        expect(page.get_by_role("row").filter(has_text="Search the case file by meaning").locator("td").nth(7)).to_have_text("3")
        browser.close()
