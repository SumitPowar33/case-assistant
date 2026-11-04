"""Money trail in a real browser: the IO records a transfer to an accused and a bank hold on the FIR's Money trail page; the
totals and the table of the accused follow, and a refused entry is shown. Fictional data only."""
from playwright.sync_api import expect

from test_load_data import setup_station, sign_in


def test_the_io_records_a_transfer_and_a_hold_and_sees_the_table_of_the_accused(core, page):
    api, _, _ = core
    accounts = setup_station(core, "mon")
    io = api.token("io.mon", accounts["io.mon"])
    _, me = api.call("GET", "/api/me", token=io)
    status, fir = api.call("POST", "/api/firs", {
        "stationId": me["station_id"], "firYear": 2026, "firNo": 41, "gdEntryNo": "GD-41", "registeredAt": "2026-10-30T10:00:00+05:30",
        "informationReceivedAt": "2026-10-30T09:30:00+05:30", "contentsOriginal": "Fictional information about a fictional online fraud.",
        "contentsLanguage": "en", "actionTaken": "investigate", "ioId": me["id"]}, io)
    assert status == 201, fir
    status, person = api.call("POST", f"/api/firs/{fir['id']}/people", {"role": "accused", "label": "A2", "identityKnown": True, "fullName": "Fictional Holder"}, io)
    assert status == 201, person

    sign_in(page, "io.mon", accounts["io.mon"])
    page.goto(page.url.split("#")[0] + f"#/firs/{fir['id']}/money")
    expect(page.get_by_role("heading", name="Money trail: where the money went")).to_be_visible()
    expect(page.get_by_text("No transfer has been recorded yet.")).to_be_visible()

    page.get_by_label("From account").fill("Fictional Victim A/c XXXX0055")
    page.get_by_label("To account").fill("Fictional A/c XXXX4471")
    page.get_by_label("Received by (an accused)").select_option(label="A2 · Fictional Holder")
    page.get_by_label("Amount in rupees").first.fill("224000.50")
    page.get_by_label("Date of the bank entry").first.fill("2099-01-01")
    page.get_by_role("button", name="Save transfer").click()
    expect(page.get_by_role("alert")).to_contain_text("future")
    page.get_by_label("Date of the bank entry").first.fill("2026-08-19")
    page.get_by_role("button", name="Save transfer").click()
    expect(page.get_by_text("Moved out: Rs 2,24,000.50")).to_be_visible()

    page.get_by_label("Account held").fill("Fictional A/c XXXX4471")
    page.get_by_label("Amount in rupees").nth(1).fill("6200")
    page.get_by_label("Date of the bank entry").nth(1).fill("2026-09-03")
    page.get_by_role("button", name="Save hold").click()
    expect(page.get_by_text("Frozen by banks: Rs 6,200")).to_be_visible()

    table = page.get_by_role("table", name="Link to each accused")
    expect(table.get_by_role("row").filter(has_text="A2")).to_contain_text("Rs 2,24,000.50 credited")
    expect(table.get_by_role("row").filter(has_text="A2")).to_contain_text("Money only")
