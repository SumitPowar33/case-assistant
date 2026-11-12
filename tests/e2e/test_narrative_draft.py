"""AI draft of the final report's narrative (A6, board 10) in a real browser against the real core and the real gateway with
the offline `fake` provider. The admin sets the feature to `fake`; the IO has a statement of the demo case's complainant
(recorded through the API, as the screen would). On the Final report part the IO asks for a draft: the request goes
through the real gateway (logged there) with the FIR text and the statement; the offline provider only echoes the prompt,
so the test puts a model's answer in its draft: one sentence from the FIR, one from the statement, one that judges guilt
and one whose quote is in no piece of the file. Only the two grounded sentences are shown; the IO ticks both, they go
into the two parts with their sources, the decision reaches the gateway's log, and the save names the request: after a
reload the words are kept and the step shows it took AI-drafted sentences. Fictional data only."""
from conftest import no_tour
import json
import re
import sys
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

from test_admin_scripts import admin_web  # noqa: F401  (the fixture: core with the demo case, gateway, web app)
from test_load_data import sign_in

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
from demo_case import Core  # noqa: E402

STATEMENT = "The caller knew my fictional account number and asked for the code that came on my phone."
ANSWER = [
    {"part": "facts", "text": "The informant stated that a caller said he was from her bank.", "source": "FIR", "quote": "a caller said he was from my bank"},
    {"part": "evidence", "text": "In her statement the informant said the caller asked for the code sent to her phone.", "source": "S1",
     "quote": "asked for the code that came on my phone"},
    {"part": "evidence", "text": "The accused is clearly guilty of cheating.", "source": "FIR", "quote": "a caller said he was from my bank"},
    {"part": "facts", "text": "A sentence the file does not hold.", "source": "S1", "quote": "a stranger came to my house"},
]


def test_an_officer_takes_ai_drafted_sentences_with_their_sources_into_the_final_report(admin_web):  # noqa: F811
    web, admin, password, demo = admin_web
    core = Core(web)
    io = core.token("io.adminui", demo["accounts"]["io.adminui"])
    case = f"/api/firs/{demo['fir_id']}"
    complainant = next(w for w in core.call("GET", f"{case}/statements", token=io)["witnesses"] if w["role"] == "complainant")
    core.call("POST", f"{case}/statements", {"personId": complainant["person_id"], "language": "en", "medium": "written", "text": STATEMENT}, io)
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
        name = "Draft chargesheet paragraphs"
        page.get_by_label(f"Provider for {name}").select_option("fake")
        page.get_by_role("button", name=f"Save {name}").click()
        expect(page.get_by_text(f"Saved: {name} now uses fake")).to_be_visible()
        page.get_by_role("button", name="Sign out").click()

        def model_answer(route):
            real = route.fetch()   # the real gateway answers and logs the request
            body = real.json()
            assert body["provider"] == "fake" and STATEMENT in body["draft"] and "a caller said he was from my bank" in body["draft"]
            body["draft"] = json.dumps(ANSWER)
            route.fulfill(response=real, json=body)

        page.route("**/ai/v1/generate", model_answer)
        sign_in(page, "io.adminui", demo["accounts"]["io.adminui"])
        page.evaluate(f"location.hash = '#/firs/{demo['fir_id']}/finalReport'")
        page.get_by_label("Facts in brief").fill("Written by the officer first.")
        page.get_by_role("button", name="Draft with AI from the file").click()
        expect(page.get_by_text("AI draft · tick the sentences to take")).to_be_visible()
        expect(page.get_by_text("1 sentences gave an opinion on guilt, truthfulness or proof and are not shown.")).to_be_visible()
        expect(page.get_by_text("1 sentences of the AI did not point at words of the piece they named and are not shown.")).to_be_visible()
        expect(page.get_by_text("The accused is clearly guilty of cheating.")).to_have_count(0)
        panel = page.get_by_label("AI draft · tick the sentences to take")
        expect(panel.locator("mark")).to_have_text(["a caller said he was from my bank", "asked for the code that came on my phone"])
        for box in panel.get_by_role("checkbox").all():
            box.check()
        page.get_by_role("button", name="Take the ticked sentences into the draft").click()
        expect(page.get_by_text("Your decision (all kept) is logged.", exact=False)).to_be_visible()
        facts = "Written by the officer first.\n\nThe informant stated that a caller said he was from her bank. (FIR)"
        expect(page.get_by_label("Facts in brief")).to_have_value(facts)
        expect(page.get_by_label("Evidence for the charges")).to_have_value(
            re.compile(r"^In her statement the informant said the caller asked for the code sent to her phone\. \(statement of .+, \d+ \w+ 20\d\d\)$"))
        page.get_by_role("button", name="Save draft").click()
        expect(page.get_by_text("with AI-drafted sentences")).to_be_visible()
        assert sent.count("generate") == 1 and sent.count("decisions") == 1

        page.reload()
        expect(page.get_by_label("Facts in brief")).to_have_value(facts)
        expect(page.get_by_text("with AI-drafted sentences")).to_have_count(1)
        expect(page.get_by_role("alert")).to_have_count(0)
        browser.close()
