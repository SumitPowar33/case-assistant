"""Freezing a bank account in a real browser against the real core: a BNSS 106 notice naming the accounts is sent to a
fictional bank, its report to the Magistrate shows as a deadline of the case until the IO records it on the Money trail
part, and the release is then recorded with the order and a reason. Fictional data only."""
from datetime import datetime, timedelta, timezone

from playwright.sync_api import expect

from test_load_data import setup_station, sign_in

IST = timezone(timedelta(hours=5, minutes=30))


def test_the_io_records_the_report_and_the_release_of_a_freeze(core, page):
    api, _, _ = core
    accounts = setup_station(core, "frz")
    io = api.token("io.frz", accounts["io.frz"])
    _, me = api.call("GET", "/api/me", token=io)
    today = datetime.now(IST).date()
    status, fir = api.call("POST", "/api/firs", {
        "stationId": me["station_id"], "firYear": 2026, "firNo": 71, "gdEntryNo": "GD-71", "registeredAt": f"{today - timedelta(days=5)}T10:00:00+05:30",
        "informationReceivedAt": f"{today - timedelta(days=5)}T09:30:00+05:30", "contentsOriginal": "Fictional information about a fictional online fraud.",
        "contentsLanguage": "en", "actionTaken": "investigate", "ioId": me["id"]}, io)
    assert status == 201, fir
    status, notice = api.call("POST", f"/api/firs/{fir['id']}/notices", {
        "kind": "BNSS_106", "addressee": "Nodal Officer, Fictional Bank", "itemsRequested": ["FICT 0000 4471"], "body": "Debit-freeze the account listed.",
        "status": "sent", "issuedAt": f"{today - timedelta(days=1)}T11:00:00+05:30"}, io)
    assert status == 201, notice
    _, deadlines = api.call("GET", f"/api/firs/{fir['id']}/deadlines", token=io)
    assert [d["due_on"] for d in deadlines if d["kind"] == "freeze_report"] == [str(today)]

    sign_in(page, "io.frz", accounts["io.frz"])
    page.goto(page.url.split("#")[0] + f"#/firs/{fir['id']}/money")
    card = page.get_by_role("listitem", name="To Nodal Officer, Fictional Bank")
    expect(card.get_by_text(f"Report to the Magistrate due by {today}")).to_be_visible()
    card.get_by_text("Record the report to the Magistrate").click()
    card.get_by_label("Date").fill(str(today))
    card.get_by_label("Court of the Magistrate").fill("Fictional JMFC Court")
    card.get_by_role("button", name="Save").click()
    expect(card.get_by_text(f"Reported to Fictional JMFC Court on {today}")).to_be_visible()
    card.get_by_text("Record the release").click()
    card.get_by_label("Date").fill(str(today))
    card.get_by_label("Order or letter").fill("Fictional order 12/2026")
    card.get_by_label("Reason for the release").fill("Fictional court order to release the amount")
    card.get_by_role("button", name="Save").click()
    expect(card.get_by_text("Fictional court order to release the amount", exact=False)).to_be_visible()
    _, deadlines = api.call("GET", f"/api/firs/{fir['id']}/deadlines", token=io)
    assert not [d for d in deadlines if d["kind"] == "freeze_report"]
