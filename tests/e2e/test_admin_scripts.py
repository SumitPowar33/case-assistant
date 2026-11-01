"""Indian-language rendering of the admin's screens (TESTING.md, "Not covered yet" 5): State admin, AI settings and Load
data, in the 10 languages, on a desktop (1280 px) and a phone (390 px), as the platform admin. The settings screen reads
the real AI gateway (offline `fake` provider), so it shows its features, providers and the audit check, not an error.
Same checks as test_indian_scripts.py: the page says its language, every Indian-script text is drawn with the app's own
fonts, nothing is cut off, nothing makes the page wider than the window. Fictional data; keys made up for this run."""
import secrets
import sys

import pytest
from playwright.sync_api import expect, sync_playwright

from conftest import ROOT, running_core, serving_web
from test_ai_gateway import running_gateway
from test_indian_scripts import language_problems
from test_load_data import sign_in

sys.path.insert(0, str(ROOT / "scripts"))
from demo_case import load_demo  # noqa: E402

DB = "caseapp_e2e_admin_ui"
SCREENS = ("#/admin", "#/settings", "#/import")


@pytest.fixture(scope="module")
def admin_web(tmp_path_factory):
    """Core with the demo station and its accounts (so the admin's lists are not empty), the gateway, the web app."""
    secret = secrets.token_urlsafe(48)
    with running_core(DB, secret=secret) as (api, admin, password):
        demo = load_demo(api.base, admin, password, tag="adminui")
        with running_gateway(api.base, secret, tmp_path_factory.mktemp("gw") / "gateway.sqlite3", "e2e-gateway-admin-ui.log") as gw:
            with serving_web(api.base, gw.base) as web:
                yield web, admin, password, demo


@pytest.mark.parametrize("width", (1280, 390))
def test_the_admin_screens_are_drawn_with_real_glyphs_and_fit(admin_web, width):
    web, admin, password, _ = admin_web
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": width, "height": 900})
        page.set_default_timeout(15000)
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(web)
        sign_in(page, admin, password)
        if page.locator(".menu-toggle").is_visible():   # a phone: the language choice is in the folded menu
            page.locator(".menu-toggle").click()
        page.locator("header select").first.select_option("en")   # the language is kept per officer, from the last run too
        expect(page.locator("html")).to_have_attribute("lang", "en")
        # each screen has its data (no error from a server), in English first
        for screen, sees in zip(SCREENS, ("Fictional Adminui PS", "Audit log check: intact.", "Load existing records")):
            page.evaluate(f"location.hash = '{screen}'")
            expect(page.get_by_role("main")).to_contain_text(sees)
            expect(page.get_by_role("alert")).to_have_count(0)
        problems = language_problems(page, [(s, None) for s in SCREENS], width)
        browser.close()
    assert not errors, f"errors in the page: {errors}"
    assert not problems, "\n".join(problems[:40]) + f"\n({len(problems)} in all)"
