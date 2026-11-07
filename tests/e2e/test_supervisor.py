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


def test_a_transferred_io_loses_the_case_and_the_sho_sees_it_waiting_for_a_new_io(core, page):
    """Decision 2(d) of 2 Nov 2026: the state admin moves the IO to another station; the IO's next sign-in reaches none of
    the old station's cases, and the SHO's review lists the case until a new IO is assigned."""
    api, admin, password = core
    accounts = setup_station(core, "lft")
    other = setup_station(core, "lft2", roles=("sho",))
    root = api.token(admin, password)
    io = api.token("io.lft", accounts["io.lft"])
    _, me = api.call("GET", "/api/me", token=io)
    _, far = api.call("GET", "/api/me", token=api.token("sho.lft2", other["sho.lft2"]))
    status, fir = api.call("POST", "/api/firs", {
        "stationId": me["station_id"], "firYear": 2026, "firNo": 41, "gdEntryNo": "GD-41", "registeredAt": "2026-10-30T10:00:00+05:30",
        "informationReceivedAt": "2026-10-30T09:30:00+05:30", "contentsOriginal": "Fictional information about a fictional theft.",
        "contentsLanguage": "en", "actionTaken": "investigate", "ioId": me["id"]}, io)
    assert status == 201, fir
    assert api.call("PUT", f"/api/users/{me['id']}", {"role": "io", "rank": "Inspector", "stationId": far["station_id"],
                                                       "reason": "Fictional transfer order E2E/7"}, root)[0] == 200
    io = api.token("io.lft", accounts["io.lft"])
    assert api.call("GET", f"/api/firs/{fir['id']}", token=io)[0] == 404
    assert api.call("GET", "/api/firs", token=io)[1] == []

    sign_in(page, "sho.lft", accounts["sho.lft"])
    page.get_by_role("link", name="Supervisor review").click()
    table = page.get_by_role("table", name="Cases whose IO has left the station")
    row = table.get_by_role("row").filter(has_text="FIR 41/2026")
    expect(row).to_contain_text("Now at Fictional lft2 PS")
    row.get_by_role("link", name="Assign a new IO").click()
    expect(page.get_by_role("heading", name="FIR 41/2026")).to_be_visible()

    sho = api.token("sho.lft", accounts["sho.lft"])
    status, io2 = api.call("POST", "/api/users", {"username": "io2.lft", "password": "Fictional-pass-E2E-41", "fullName": "Fictional IO Two",
                                                  "rank": "Inspector", "role": "io", "stationId": me["station_id"]}, root)
    assert status == 201, io2
    assert api.call("POST", f"/api/firs/{fir['id']}/io", {"ioId": io2["id"], "reason": "Former IO transferred out"}, sho)[0] == 204
    page.goto(page.url.split("#")[0] + "#/supervisor")
    expect(page.get_by_role("heading", name="Supervisor review")).to_be_visible()
    expect(page.get_by_role("table", name="Cases whose IO has left the station")).to_have_count(0)
