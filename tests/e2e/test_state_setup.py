"""State setup and approvals in a real browser: the setup officer of a state writes down a change to the pack, the
approver (another account) sees it waiting and sends it back with a reason, it is proposed again and approved; a station's
IO has no such screen. Fictional data only."""
from playwright.sync_api import expect

from test_load_data import setup_station, sign_in


def test_a_pack_change_is_proposed_by_one_person_and_decided_by_another(core, page):
    accounts = setup_station(core, "stp", roles=("state_admin", "prosecutor", "io"))
    base = None

    sign_in(page, "state_admin.stp", accounts["state_admin.stp"])
    base = page.url.split("#")[0]
    page.goto(base + "#/state-setup")
    expect(page.get_by_role("heading", name="State setup and approvals")).to_be_visible()
    expect(page.get_by_text("No change has been proposed.")).to_be_visible()
    page.get_by_label("Short title").fill("Fictional cyber fraud playbook v1.5")
    page.get_by_label("What changes").fill("Adds a fictional front desk step: send hold requests to banks before typing the FIR.")
    page.get_by_label("How it was tested").fill("Tried on 40 fictional closed cases")
    page.get_by_role("button", name="Send for approval").click()
    card = page.get_by_role("article", name="Fictional cyber fraud playbook v1.5")
    expect(card).to_contain_text("Waiting for a decision")
    expect(card.get_by_role("button", name="Approve")).to_have_count(0)   # the writer cannot decide their own change

    page.get_by_role("button", name="Sign out").click()
    sign_in(page, "prosecutor.stp", accounts["prosecutor.stp"])
    page.goto(base + "#/state-setup")
    card = page.get_by_role("article", name="Fictional cyber fraud playbook v1.5")
    expect(card).to_contain_text("Tried on 40 fictional closed cases")
    expect(page.get_by_label("Short title")).to_have_count(0)   # the approver does not propose
    card.get_by_label("Note").fill("Add the second link rule")
    card.get_by_role("button", name="Send back").click()
    expect(card).to_contain_text("Sent back")
    expect(card).to_contain_text("Add the second link rule")
    expect(card.get_by_role("button", name="Approve")).to_have_count(0)

    page.get_by_role("button", name="Sign out").click()
    sign_in(page, "state_admin.stp", accounts["state_admin.stp"])
    page.goto(base + "#/state-setup")
    page.get_by_label("Short title").fill("Fictional cyber fraud playbook v1.6")
    page.get_by_label("What changes").fill("As v1.5, with the second link rule for an account holder added.")
    page.get_by_role("button", name="Send for approval").click()
    expect(page.get_by_role("article", name="Fictional cyber fraud playbook v1.6")).to_contain_text("Waiting for a decision")

    page.get_by_role("button", name="Sign out").click()
    sign_in(page, "prosecutor.stp", accounts["prosecutor.stp"])
    page.goto(base + "#/state-setup")
    newer = page.get_by_role("article", name="Fictional cyber fraud playbook v1.6")
    newer.get_by_role("button", name="Approve").click()
    expect(newer).to_contain_text("Approved")
    expect(newer).to_contain_text("Decided by Fictional PROSECUTOR")

    # an IO has no link and the server refuses the list
    page.get_by_role("button", name="Sign out").click()
    sign_in(page, "io.stp", accounts["io.stp"])
    expect(page.locator("#header-menu nav").get_by_role("link", name="State setup")).to_have_count(0)
    page.goto(base + "#/state-setup")
    expect(page.get_by_role("alert")).to_be_visible()
