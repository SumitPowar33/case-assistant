"""Court and trial tracker in a real browser: the IO starts a court record on a case with a date, adds a coming hearing and the
summons to a witness, the list shows the next date and the open summons, and an IO of another station sees nothing.
Fictional data only."""
import datetime

from playwright.sync_api import expect

from test_load_data import setup_station, sign_in


def test_the_io_follows_the_court_dates_and_the_summons_of_a_case(core, page):
    api, _, _ = core
    accounts = setup_station(core, "crt", roles=("io",))
    other = setup_station(core, "cru", roles=("io",))
    io = api.token("io.crt", accounts["io.crt"])
    _, me = api.call("GET", "/api/me", token=io)
    status, fir = api.call("POST", "/api/firs", {
        "stationId": me["station_id"], "firYear": 2026, "firNo": 62, "gdEntryNo": "GD-62", "registeredAt": "2026-10-30T10:00:00+05:30",
        "informationReceivedAt": "2026-10-30T09:30:00+05:30", "contentsOriginal": "Fictional information about a fictional cheque forgery.",
        "contentsLanguage": "en", "actionTaken": "investigate", "ioId": me["id"]}, io)
    assert status == 201, fir
    coming = (datetime.date.today() + datetime.timedelta(days=20)).isoformat()

    sign_in(page, "io.crt", accounts["io.crt"])
    page.goto(page.url.split("#")[0] + "#/court")
    expect(page.get_by_role("heading", name="Court and trial tracker")).to_be_visible()
    expect(page.get_by_text("None yet.")).to_be_visible()

    start = page.get_by_role("heading", name="Start a court record").locator("xpath=ancestor::form")
    start.locator("select").first.select_option(label="FIR 62/2026")   # the case picker (its label holds the options)
    start.get_by_label("Stage").select_option("chargesheet_filed")
    start.get_by_label("Date").fill("2026-11-02")
    start.get_by_label("Court", exact=True).fill("Fictional Court 4")
    start.get_by_label("Court case number").fill("CC 62/2026")
    start.get_by_role("button", name="Save date").click()
    table = page.get_by_role("table", name="Cases in court")
    row = table.get_by_role("row").filter(has_text="FIR 62/2026")
    expect(row).to_contain_text("Fictional Court 4")
    expect(row).to_contain_text("CC 62/2026")
    expect(page.get_by_text("No coming date: 1")).to_be_visible()

    row.get_by_role("button", name="FIR 62/2026").click()
    add = page.get_by_role("heading", name="Add a court date").locator("xpath=ancestor::form")
    add.get_by_label("Stage").select_option("charge_framing")
    add.get_by_label("Date").fill(coming)
    add.get_by_role("button", name="Save date").click()
    expect(row).to_contain_text(coming)
    expect(page.get_by_text("Coming dates: 1")).to_be_visible()

    summons = page.get_by_role("heading", name="Record a summons step").locator("xpath=ancestor::form")
    summons.get_by_label("Witness").fill("Fictional Bank Officer")
    summons.get_by_label("Status").select_option("sent")
    summons.get_by_role("button", name="Save summons step").click()
    expect(row).to_contain_text("Not yet served: 1")
    summons.get_by_label("Witness").fill("fictional bank officer")
    summons.get_by_label("Status").select_option("served")
    summons.get_by_role("button", name="Save summons step").click()
    expect(row).not_to_contain_text("Not yet served")
    witnesses = page.get_by_role("table", name="Summons to witnesses")
    expect(witnesses.get_by_role("row")).to_have_count(2)   # one row per witness, the newest step
    expect(witnesses).to_contain_text("Served")
    expect(page.get_by_role("table", name="Timeline of court dates").get_by_role("row")).to_have_count(3)

    # the IO of another station has no such case: an empty list
    page.get_by_role("button", name="Sign out").click()
    sign_in(page, "io.cru", other["io.cru"])
    page.goto(page.url.split("#")[0] + "#/court")
    expect(page.get_by_text("None yet.")).to_be_visible()
