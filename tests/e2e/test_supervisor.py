"""Supervisor review in a real browser: the SHO sees the station's open case with its nearest deadline and a final report
waiting for a decision, and opens that report; the IO has no such screen and the server refuses them. Fictional data only."""
from playwright.sync_api import expect

from test_load_data import setup_station, sign_in


def test_the_sho_reviews_the_station_and_the_io_has_no_such_screen(core, page):
    api, _, _ = core
    accounts = setup_station(core, "sup")
    io = api.token("io.sup", accounts["io.sup"])
    _, me = api.call("GET", "/api/me", token=io)
    status, fir = api.call("POST", "/api/firs", {
        "stationId": me["station_id"], "firYear": 2026, "firNo": 31, "gdEntryNo": "GD-31", "registeredAt": "2026-10-30T10:00:00+05:30",
        "informationReceivedAt": "2026-10-30T09:30:00+05:30", "contentsOriginal": "Fictional information about a fictional loss.",
        "contentsLanguage": "en", "actionTaken": "investigate", "ioId": me["id"]}, io)
    assert status == 201, fir
    assert api.call("GET", "/api/supervisor", token=io)[0] == 403

    sign_in(page, "io.sup", accounts["io.sup"])
    expect(page.get_by_role("link", name="Supervisor review")).to_have_count(0)
    page.get_by_role("button", name="Sign out").click()

    sign_in(page, "sho.sup", accounts["sho.sup"])
    page.get_by_role("link", name="Supervisor review").click()
    expect(page.get_by_role("heading", name="Supervisor review")).to_be_visible()
    table = page.get_by_role("table", name="Open cases by nearest deadline")
    row = table.get_by_role("row").filter(has_text="FIR 31/2026")
    expect(row).to_contain_text("Fictional IO")
    expect(row).to_contain_text("Not started")
    row.get_by_role("link", name="Open the report").click()
    expect(page.get_by_role("heading", name="Final report")).to_be_visible()
