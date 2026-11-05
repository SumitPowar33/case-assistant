"""The old law to new law finder in a real browser against the real core: any signed-in officer finds the BNS section of an IPC
section from the national pack, the table says it is a draft, the buttons keep one law, and a section that only partly matches is
marked. Fictional data only (section numbers are the public numbers of the Acts)."""
from playwright.sync_api import expect

from test_load_data import setup_station, sign_in


def test_an_officer_finds_the_new_section_for_an_old_one(core, page):
    accounts = setup_station(core, "law", roles=("front_desk",))
    sign_in(page, "front_desk.law", accounts["front_desk.law"])
    page.get_by_role("navigation", name="Main").get_by_role("link", name="Old to new law").click()
    expect(page.get_by_role("heading", name="Old law to new law")).to_be_visible()
    expect(page.get_by_text("DRAFT: a prosecutor has not checked this table")).to_be_visible()
    page.get_by_label("Section number or offence").fill("420")
    row = page.get_by_role("row").filter(has_text="IPC 420")
    expect(row).to_contain_text("BNS 318")
    expect(page.get_by_role("row")).to_have_count(2)   # the header and the one section found
    page.get_by_label("Section number or offence").fill("")
    page.get_by_role("button", name="IEA → BSA").click()
    expect(page.get_by_role("row").filter(has_text="IEA 65B")).to_contain_text("BSA 63")
    expect(page.get_by_role("row").filter(has_text="IEA 65B").get_by_text("partly matches")).to_be_visible()
    expect(page.get_by_role("row").filter(has_text="IPC 420")).to_have_count(0)
    page.get_by_role("button", name="All").click()
    expect(page.get_by_role("row").filter(has_text="IPC 420")).to_have_count(1)
