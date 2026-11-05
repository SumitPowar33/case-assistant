"""Forensic and medical requests in a real browser: the IO raises a lab request on a case, records the lab's receipt and the report,
the list follows each newest step, nothing can be added after the report, and an IO of another station sees nothing of it.
Fictional data only."""
from playwright.sync_api import expect

from test_load_data import setup_station, sign_in


def test_the_io_raises_a_request_follows_its_steps_and_the_report_closes_it(core, page):
    api, _, _ = core
    accounts = setup_station(core, "exr", roles=("io",))
    other = setup_station(core, "exs", roles=("io",))
    io = api.token("io.exr", accounts["io.exr"])
    _, me = api.call("GET", "/api/me", token=io)
    status, fir = api.call("POST", "/api/firs", {
        "stationId": me["station_id"], "firYear": 2026, "firNo": 61, "gdEntryNo": "GD-61", "registeredAt": "2026-10-30T10:00:00+05:30",
        "informationReceivedAt": "2026-10-30T09:30:00+05:30", "contentsOriginal": "Fictional information about a fictional cheque forgery.",
        "contentsLanguage": "en", "actionTaken": "investigate", "ioId": me["id"]}, io)
    assert status == 201, fir

    sign_in(page, "io.exr", accounts["io.exr"])
    page.goto(page.url.split("#")[0] + "#/expert")
    expect(page.get_by_role("heading", name="Forensic and medical requests")).to_be_visible()
    expect(page.get_by_text("None yet.")).to_be_visible()

    form = page.get_by_role("heading", name="New request").locator("xpath=ancestor::form")
    form.get_by_label("Case").select_option(label="FIR 61/2026")
    form.get_by_label("Kind").select_option("forensic")
    form.get_by_label("What is asked").fill("Handwriting comparison (fictional)")
    form.get_by_label("Sent to").fill("Fictional Document Examiner")
    form.get_by_role("button", name="Record request").click()
    table = page.get_by_role("table", name="Forensic and medical requests")
    row = table.get_by_role("row").filter(has_text="Handwriting comparison")
    expect(row).to_contain_text("FIR 61/2026")
    expect(row.locator(".chip", has_text="Sent")).to_be_visible()
    expect(page.get_by_text("Open: 1")).to_be_visible()

    table.get_by_role("button", name="Handwriting comparison (fictional)").click()
    step = page.get_by_role("heading", name="Record the next step").locator("xpath=ancestor::form")
    step.get_by_label("Status").select_option("at_lab")
    step.get_by_label("Note").fill("Queue 3")
    step.get_by_role("button", name="Save step").click()
    expect(row.locator(".chip", has_text="Received at lab or hospital")).to_be_visible()
    step.get_by_label("Status").select_option("report_received")
    step.get_by_role("button", name="Save step").click()
    expect(row.locator(".chip", has_text="Report received")).to_be_visible()
    expect(page.get_by_text("Report received: 1", exact=True)).to_be_visible()
    expect(page.get_by_text("Open: 0")).to_be_visible()
    log = page.get_by_role("table", name="Steps of this request: Handwriting comparison (fictional)")
    expect(log.get_by_role("row")).to_have_count(4)   # header, sent, at lab, report: the log only grows
    expect(page.get_by_role("heading", name="Record the next step")).to_have_count(0)   # nothing after the report

    # the IO of another station has no such case: an empty list
    page.get_by_role("button", name="Sign out").click()
    sign_in(page, "io.exs", other["io.exs"])
    page.goto(page.url.split("#")[0] + "#/expert")
    expect(page.get_by_text("None yet.")).to_be_visible()
