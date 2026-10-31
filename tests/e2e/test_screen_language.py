"""The screen language in a real browser against the real core: chosen in the header, kept for the officer, and the next
sign-in starts in it. Fictional data only."""
from playwright.sync_api import expect

from test_load_data import setup_station, sign_in


def test_an_officer_chooses_marathi_and_the_next_sign_in_starts_in_marathi(core, page):
    accounts = setup_station(core, "lang", roles=("io",))
    sign_in(page, "io.lang", accounts["io.lang"])
    page.get_by_label("Screen language").select_option("mr")
    nav = page.get_by_role("navigation")
    expect(nav.get_by_role("link", name="एफआयआर")).to_be_visible()
    expect(page.locator("html")).to_have_attribute("lang", "mr")

    page.get_by_role("button", name="साइन आउट").click()
    expect(page.get_by_role("heading", name="साइन इन")).to_be_visible()   # this page keeps the language chosen on it
    page.reload()
    expect(page.get_by_role("heading", name="Sign in")).to_be_visible()
    page.get_by_label("Username").fill("io.lang")
    page.get_by_label("Password").fill(accounts["io.lang"])
    page.get_by_role("button", name="Sign in").click()
    expect(nav.get_by_role("link", name="धोरणे")).to_be_visible()
    expect(page.get_by_text("अजून एकही एफआयआर नाही.")).to_be_visible()   # the FIR list of a new station, in Marathi
    nav.get_by_role("link", name="धोरणे").click()   # the policies screen with the values the real core gives
    expect(page.get_by_role("heading", name="धोरणे")).to_be_visible()
    expect(page.get_by_text("तुमच्या स्वतःच्या ठाण्यात लागू")).to_be_visible()
    expect(page.get_by_role("cell", name="7 ते 90")).to_be_visible()   # victim update days: 7 to the legal 90 (BNSS 193(3)(ii))
    api = core[0]
    status, me = api.call("GET", "/api/me", token=api.token("io.lang", accounts["io.lang"]))
    assert status == 200 and me["ui_language"] == "mr"
