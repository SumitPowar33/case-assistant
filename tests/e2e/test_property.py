"""Case property register in a real browser: the malkhana keeper sees the station's seized items from one screen, records a
hand-over to a lab with a broken seal, the item moves from "in malkhana" to "at a lab or court", the log keeps both rows; an IO of
another station sees nothing of it. Fictional data only."""
from playwright.sync_api import expect

from test_load_data import setup_station, sign_in


def test_the_malkhana_keeper_records_a_hand_over_and_the_register_follows(core, page):
    api, _, _ = core
    accounts = setup_station(core, "prp", roles=("io", "malkhana"))
    other = setup_station(core, "prq", roles=("io",))
    io = api.token("io.prp", accounts["io.prp"])
    _, me = api.call("GET", "/api/me", token=io)
    status, fir = api.call("POST", "/api/firs", {
        "stationId": me["station_id"], "firYear": 2026, "firNo": 51, "gdEntryNo": "GD-51", "registeredAt": "2026-10-30T10:00:00+05:30",
        "informationReceivedAt": "2026-10-30T09:30:00+05:30", "contentsOriginal": "Fictional information about a fictional theft.",
        "contentsLanguage": "en", "actionTaken": "investigate", "ioId": me["id"]}, io)
    assert status == 201, fir
    status, item = api.call("POST", f"/api/firs/{fir['id']}/evidence", {
        "label": "P1", "description": "Fictional iron rod", "kind": "physical", "seizedAt": "2026-10-30T12:00:00+05:30",
        "seizureMemo": "Seizure memo SM-9 (fictional)"}, io)
    assert status == 201, item
    status, _ = api.call("POST", f"/api/firs/{fir['id']}/evidence", {
        "label": "E1", "description": "Fictional phone", "kind": "electronic", "seizedAt": "2026-10-30T12:00:00+05:30",
        "seizureMemo": "Seizure memo SM-10 (fictional)", "sha256": "a" * 64}, io)
    assert status == 201

    sign_in(page, "malkhana.prp", accounts["malkhana.prp"])
    page.goto(page.url.split("#")[0] + "#/property")
    expect(page.get_by_role("heading", name="Case property (malkhana)")).to_be_visible()
    table = page.get_by_role("table", name="Seized items")
    expect(table.get_by_role("row")).to_have_count(2)   # the header and the physical item; the phone is evidence, not property
    expect(table.get_by_role("row").filter(has_text="P1")).to_contain_text("No hand-over written")
    expect(page.get_by_text("In malkhana: 0")).to_be_visible()

    table.get_by_role("button", name="P1").click()
    page.get_by_label("Handed over by").fill("SI Fictional Investigator")
    page.get_by_label("Received by", exact=True).fill("HC Fictional Store")
    page.get_by_label("Where", exact=True).fill("Fictional malkhana")
    page.get_by_label("Why", exact=True).fill("Safe keeping")
    page.get_by_role("button", name="Save hand-over").click()
    expect(page.get_by_text("In malkhana: 1")).to_be_visible()

    page.get_by_label("Handed over by").fill("HC Fictional Store")
    page.get_by_label("Received by", exact=True).fill("Fictional lab clerk")
    page.get_by_label("Where", exact=True).fill("Fictional forensic lab")
    page.get_by_label("Place now").select_option("lab")
    page.get_by_label("Why", exact=True).fill("Fingerprint analysis")
    page.get_by_label("Seal intact").uncheck()
    page.get_by_role("button", name="Save hand-over").click()
    expect(page.get_by_text("At a lab or court: 1")).to_be_visible()
    expect(page.get_by_text("In malkhana: 0")).to_be_visible()
    expect(table.get_by_role("row").filter(has_text="P1")).to_contain_text("Fictional forensic lab")
    expect(table.get_by_role("row").filter(has_text="P1")).to_contain_text("Seal not intact")
    log = page.get_by_role("table", name="Hand-overs of P1")
    expect(log.get_by_role("row")).to_have_count(3)   # the log only grows: the first row is still there
    expect(log.get_by_role("row").nth(1)).to_contain_text("Safe keeping")

    # the IO of another station has no such case: an empty register
    page.get_by_role("button", name="Sign out").click()
    sign_in(page, "io.prq", other["io.prq"])
    page.goto(page.url.split("#")[0] + "#/property")
    expect(page.get_by_text("No seized property to show.")).to_be_visible()
