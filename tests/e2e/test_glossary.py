"""The legal glossary in a real browser against the real core: the national pack's terms reach the language tool, in the
chosen language, marked as a draft, and a word goes into the text box. Fictional data only."""
from playwright.sync_api import expect

from test_load_data import setup_station, sign_in


def test_an_officer_finds_a_legal_term_in_marathi_and_adds_it_to_the_text(core, page):
    accounts = setup_station(core, "gloss", roles=("io",))
    sign_in(page, "io.gloss", accounts["io.gloss"])
    page.goto(page.url.split("#")[0] + "#/type")
    expect(page.get_by_role("heading", name="Legal glossary")).to_be_visible()
    expect(page.get_by_text("Draft: these terms have not been checked")).to_be_visible()
    glossary = page.locator("section", has=page.get_by_role("heading", name="Legal glossary"))
    glossary.get_by_label("Language").select_option("mr")
    glossary.get_by_label("Find a term").fill("default bail")
    expect(page.get_by_role("cell", name="BNSS 187(3)")).to_be_visible()
    expect(glossary.get_by_role("row")).to_have_count(2)   # the header and the one term found
    page.get_by_role("button", name="Add डिफॉल्ट जामीन to the text").click()
    expect(page.get_by_label("Text", exact=True)).to_have_value("डिफॉल्ट जामीन")
