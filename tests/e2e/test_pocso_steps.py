"""POCSO case mode in a real browser (item 15, V56): the IO opens a fictional POCSO case on the Deadlines part, sees the
two 24-hour steps in the deadlines and every step red, records the report to the Child Welfare Committee and the Special
Court, and that step turns done while its deadline goes; a case without a POCSO section shows no steps; an officer
outside the case team is refused. Fictional data only."""
from playwright.sync_api import expect

from test_load_data import setup_station, sign_in


def new_fir(api, io, me, no, sections):
    status, fir = api.call("POST", "/api/firs", {
        "stationId": me["station_id"], "firYear": 2026, "firNo": no, "gdEntryNo": f"GD-{no}", "registeredAt": "2026-10-30T10:00:00+05:30",
        "informationReceivedAt": "2026-10-30T09:30:00+05:30", "contentsOriginal": "Fictional information.",
        "contentsLanguage": "en", "actionTaken": "investigate", "ioId": me["id"], "sections": sections}, io)
    assert status == 201, fir
    return fir


def test_the_io_records_a_pocso_step_and_its_deadline_goes(core, page):
    api, _, _ = core
    accounts = setup_station(core, "pcs")
    io = api.token("io.pcs", accounts["io.pcs"])
    _, me = api.call("GET", "/api/me", token=io)
    fir = new_fir(api, io, me, 51, [{"act": "POCSO Act", "section": "8"}])
    plain = new_fir(api, io, me, 52, [{"act": "BNS", "section": "303(2)"}])
    other = setup_station(core, "pcs2", roles=("io",))
    far = api.token("io.pcs2", other["io.pcs2"])
    assert api.call("GET", f"/api/firs/{fir['id']}/pocso", token=far)[0] == 404
    assert api.call("POST", f"/api/firs/{fir['id']}/pocso-steps", {"step": "cwc_court_report", "doneAt": "2026-10-30T12:00:00+05:30"}, far)[0] in (403, 404)

    sign_in(page, "io.pcs", accounts["io.pcs"])
    page.evaluate(f"location.hash = '#/firs/{plain['id']}/deadlines'")
    expect(page.get_by_role("heading", name="Progress updates to the informant or victim (BNSS 193(3)(ii))")).to_be_visible()
    expect(page.get_by_role("heading", name="POCSO case: steps the law asks for")).to_have_count(0)

    page.evaluate(f"location.hash = '#/firs/{fir['id']}/deadlines'")
    steps = page.get_by_role("region", name="POCSO case: steps the law asks for")
    expect(steps).to_be_visible()
    expect(page.get_by_text("Report to the Child Welfare Committee and the Special Court (24 hours): by 2026-10-31")).to_be_visible()
    expect(page.get_by_text("Medical examination of the child (24 hours): by 2026-10-31")).to_be_visible()
    expect(steps.locator(".chip.c-crit")).to_have_count(6)
    first = steps.get_by_role("listitem").first
    expect(first).to_contain_text("Due by 31 Oct 2026, 9:30 am IST")

    steps.get_by_text("Record a step done").click()
    steps.get_by_label("Step").select_option("cwc_court_report")
    steps.get_by_label("Done at").fill("2026-10-30T15:45")
    steps.get_by_role("button", name="Save").click()
    expect(first).to_contain_text("Done 30 Oct 2026, 3:45 pm IST (recorded by")
    expect(steps.locator(".chip.c-crit")).to_have_count(5)
    expect(page.get_by_text("Report to the Child Welfare Committee and the Special Court (24 hours): by 2026-10-31")).to_have_count(0)
    expect(page.get_by_text("Medical examination of the child (24 hours): by 2026-10-31")).to_be_visible()

    # on a phone the steps and the form fit the screen
    page.set_viewport_size({"width": 390, "height": 844})
    expect(steps).to_be_visible()
    assert page.evaluate("document.documentElement.scrollWidth") <= 390
