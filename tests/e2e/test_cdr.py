"""Call records in a real browser against the real core: the operator's file is seized as an electronic item with its
SHA-256, the IO loads it on the FIR's Call records part, a changed copy is refused, and the analysis names an accused of the
case by label. Fictional numbers only (90000 xxxxx)."""
import hashlib

from playwright.sync_api import expect

from test_load_data import setup_station, sign_in

CDR = ("Target No,B Party No,Date,Time,Duration,Call Type,First Cell ID\n"
       "9000011111,9000022222,03/09/2026,21:10:00,120,MOC,404-10-1234-5678\n"
       "9000011111,9000022222,03/09/2026,23:40:00,75,MTC,404-10-1234-5678\n"
       "9000011111,9000077777,04/09/2026,10:00:00,30,MOC,404-10-9999-0001\n")


def test_the_io_loads_the_seized_cdr_file_and_reads_its_analysis(core, page, tmp_path):
    api, _, _ = core
    accounts = setup_station(core, "cdr")
    io = api.token("io.cdr", accounts["io.cdr"])
    _, me = api.call("GET", "/api/me", token=io)
    status, fir = api.call("POST", "/api/firs", {
        "stationId": me["station_id"], "firYear": 2026, "firNo": 61, "gdEntryNo": "GD-61", "registeredAt": "2026-09-05T10:00:00+05:30",
        "informationReceivedAt": "2026-09-05T09:30:00+05:30", "contentsOriginal": "Fictional information about a fictional offence.",
        "contentsLanguage": "en", "actionTaken": "investigate", "ioId": me["id"]}, io)
    assert status == 201, fir
    for label, phone in (("A1", "9000011111"), ("A2", "9000022222")):
        status, person = api.call("POST", f"/api/firs/{fir['id']}/people", {"role": "accused", "label": label, "identityKnown": True,
                                                                            "fullName": f"Fictional {label}", "phone": phone}, io)
        assert status == 201, person
    status, item = api.call("POST", f"/api/firs/{fir['id']}/evidence", {
        "label": "E1", "description": "CDR of 9000011111 from Fictional Telecom", "kind": "electronic", "seizedAt": "2026-09-10T10:00:00+05:30",
        "seizureMemo": "Fictional memo", "sha256": hashlib.sha256(CDR.encode()).hexdigest()}, io)
    assert status == 201, item
    changed, seized = tmp_path / "changed.csv", tmp_path / "fictional-cdr.csv"
    changed.write_text(CDR + "9000011111,9000077777,04/09/2026,11:00:00,5,MOC,\n")
    seized.write_text(CDR)

    sign_in(page, "io.cdr", accounts["io.cdr"])
    page.goto(page.url.split("#")[0] + f"#/firs/{fir['id']}/cdr")
    expect(page.get_by_role("heading", name="Call records")).to_be_visible()
    page.get_by_text("Load a call records file").click()
    page.get_by_label("Number whose records these are").fill("9000011111")
    page.get_by_label("CDR file (CSV)").set_input_files(str(changed))
    page.get_by_role("button", name="Load", exact=True).click()
    expect(page.get_by_role("status")).to_contain_text("not the one recorded as E1")
    page.get_by_label("CDR file (CSV)").set_input_files(str(seized))
    page.get_by_role("button", name="Load", exact=True).click()
    expect(page.get_by_role("status")).to_contain_text("3 records loaded, 0 lines could not be read.")

    page.get_by_role("button", name="Show the analysis").click()
    card = page.get_by_role("region", name="E1: records of 9000011111 (A1)")
    expect(card.get_by_role("rowheader", name="9000022222 (A2)")).to_be_visible()
    expect(card.get_by_role("rowheader", name="404-10-1234-5678")).to_be_visible()
    expect(card.get_by_text("2026-09-03: 2")).to_be_visible()
