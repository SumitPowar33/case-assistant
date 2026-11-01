"""Audit of reads of protected victim details in a real browser: the IO opens a case that protects the victim's identity
(BNS 72), the SHO of the station then sees on the Protected reads screen that the IO saw the victim's real details and the
FIR text; the IO has no such screen. Fictional data only."""
from playwright.sync_api import expect

from test_load_data import setup_station, sign_in


def test_the_sho_sees_who_read_a_protected_victims_details(core, page):
    api, _, _ = core
    accounts = setup_station(core, "reads")
    io = api.token("io.reads", accounts["io.reads"])
    _, me = api.call("GET", "/api/me", token=io)
    status, fir = api.call("POST", "/api/firs", {
        "stationId": me["station_id"], "firYear": 2026, "firNo": 72, "gdEntryNo": "GD-72", "registeredAt": "2026-10-30T10:00:00+05:30",
        "informationReceivedAt": "2026-10-30T09:30:00+05:30", "contentsOriginal": "Fictional information naming a fictional victim.",
        "contentsLanguage": "en", "actionTaken": "investigate", "ioId": me["id"], "sexualOffence": True}, io)
    assert status == 201, fir
    status, body = api.call("POST", f"/api/firs/{fir['id']}/people", {"role": "victim", "label": "V1", "identityKnown": True,
                                                                     "fullName": "Fictional Victim Kiran", "identityMasked": False}, io)
    assert status == 201, body

    sign_in(page, "io.reads", accounts["io.reads"])
    expect(page.get_by_role("link", name="Protected reads")).to_have_count(0)
    page.get_by_role("link", name="72/2026").click()
    main = page.get_by_role("main")
    expect(main).to_contain_text("Fictional Victim Kiran")
    expect(main).to_contain_text("Fictional information naming a fictional victim.")
    page.get_by_role("button", name="Sign out").click()

    sign_in(page, "sho.reads", accounts["sho.reads"])
    page.get_by_role("link", name="Protected reads").click()
    expect(page.get_by_role("heading", name="Who read protected victim details")).to_be_visible()
    expect(page.get_by_label("Police station")).to_have_value(me["station_id"])
    table = page.get_by_role("table", name="Reads at this police station, newest first")
    # one opening of the FIR screen is one line per kind (the screen's parallel loads may rarely add a second, never none)
    for what in ("People of the case", "FIR text"):
        rows = table.get_by_role("row").filter(has_text="Fictional IO").filter(has_text=what)
        expect(rows.first).to_contain_text("FIR 2026/72")
        assert rows.count() <= 2
    expect(table).not_to_contain_text("Fictional Victim Kiran")
    # the link opens the case; that read, by the SHO, is then in the log too
    table.get_by_role("link", name="FIR 2026/72").first.click()
    expect(main).to_contain_text("Fictional Victim Kiran")
    page.go_back()
    for what in ("People of the case", "FIR text"):
        expect(table.get_by_role("row").filter(has_text="Fictional SHO").filter(has_text=what).first).to_be_visible()
