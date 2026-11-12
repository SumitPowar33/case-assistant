"""Contract between the web app and the AI gateway, the run-time half (TESTING.md, "Not covered yet" 3): the answers the
real gateway sends while the screens use it. The platform admin opens AI settings and sets the notice draft to the
offline `fake` provider (PUT /v1/settings/notice_draft); the IO opens the demo case's notices and asks for an AI draft
(POST /v1/generate). Every answer of a gateway route a screen reads with ai<T> must have every field T says is always
there; /v1/settings is a map of features, so each feature's entry is checked. Fictional data only."""
import re
import sys

from playwright.sync_api import expect, sync_playwright

from conftest import ROOT, no_tour
from test_admin_scripts import admin_web  # noqa: F401  (the fixture: core with the demo case, gateway, web app)
from test_answer_fields_live import missing_fields, url_pattern
from test_load_data import sign_in

sys.path.insert(0, str(ROOT / "tests/repo_rules"))
from test_web_answer_fields import read_types  # noqa: E402

MAPS = {"/v1/settings"}   # answers typed Record<string, T>: T is each value's type


def test_every_field_a_screen_expects_is_in_the_gateways_real_answer(admin_web):  # noqa: F811
    web, admin, password, demo = admin_web
    answers = []

    def keep(response):
        path = response.url.split("://", 1)[1].split("/", 1)[1].split("?")[0]
        if path.startswith("ai/") and response.ok and "json" in (response.headers.get("content-type") or ""):
            answers.append(("/" + path[3:], response.json()))

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = no_tour(browser.new_page(viewport={"width": 1280, "height": 900}))
        page.set_default_timeout(15000)
        page.on("response", keep)
        page.goto(web)
        sign_in(page, admin, password)
        page.locator("header select").first.select_option("en")
        page.evaluate("location.hash = '#/settings'")
        name = "Draft BNSS 94 notices and follow-up letters"
        page.get_by_label(f"Provider for {name}").select_option("fake")
        page.get_by_role("button", name=f"Save {name}").click()
        expect(page.get_by_text(f"Saved: {name} now uses fake")).to_be_visible()
        page.get_by_role("button", name="Sign out").click()

        sign_in(page, "io.adminui", demo["accounts"]["io.adminui"])
        page.evaluate(f"location.hash = '#/firs/{demo['fir_id']}'")
        notices = page.locator("section", has=page.get_by_role("heading", name="Notices", exact=True))
        notices.locator("summary", has_text="Write a notice").click()
        notices.get_by_label("To", exact=True).fill("Fictional Bank Ltd, nodal officer")
        notices.get_by_role("button", name="Draft the text with AI").click()
        expect(notices.get_by_text("AI draft")).to_be_visible()
        # an answer still arriving while the browser closes cannot be read (TargetClosedError, seen 7 Nov): let the reads
        # finish, then stop listening before closing
        page.wait_for_load_state("networkidle")
        page.remove_listener("response", keep)
        browser.close()

    reads = [(name, url, url_pattern(url).pattern.replace("^/api", "^"), literal, text) for name, url, literal, text in read_types()
             if url.startswith("/v1/")]
    problems, checked = [], set()
    for path, body in answers:
        for name, url, rx, literal, text in reads:
            if re.match(rx, path):
                checked.add(url.split("?")[0])
                values = list(body.values()) if url in MAPS else [body]
                for v in values:
                    problems += [f"{name}: {url} expects {m}, not in the answer of {path}" for m in missing_fields(v, literal, text, "answer")]
    assert not problems, "\n".join(sorted(set(problems)))
    assert checked == {"/v1/settings", "/v1/features", "/v1/audit", "/v1/settings/${feature}", "/v1/generate"}, sorted(checked)
