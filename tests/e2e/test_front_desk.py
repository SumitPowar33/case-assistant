"""The front desk in a real browser: information taken down in the informant's words, golden-hour steps, read over and
signed (BNSS 173(1)), then the FIR registered from it with the same text. Fictional data only."""
import datetime as dt
from zoneinfo import ZoneInfo

from playwright.sync_api import expect

from test_case_flow import form
from test_load_data import setup_station, sign_in

WORDS = "Fictional caller said he was from the bank and took Rs 40,000 by UPI."


def test_a_complaint_is_written_down_read_over_signed_and_becomes_an_fir(core, page):
    accounts = setup_station(core, "desk", roles=("front_desk",))
    sign_in(page, "front_desk.desk", accounts["front_desk.desk"])
    now = dt.datetime.now(ZoneInfo("Asia/Kolkata")).replace(second=0, microsecond=0)
    received, registered = now - dt.timedelta(hours=2), now - dt.timedelta(minutes=30)
    iso = lambda t: t.strftime("%Y-%m-%dT%H:%M")

    page.get_by_role("link", name="Front desk").click()
    expect(page.get_by_text("No open complaints.")).to_be_visible()
    take = form(page, "Take a complaint")
    take.get_by_label("Received (date and time, IST)").fill(iso(received))
    take.get_by_label("Informant's name").fill("Fictional Informant")
    take.get_by_label("Kind").select_option("cyber_financial_fraud")
    take.get_by_label("Information as given (in the informant's words)").fill(WORDS)
    take.get_by_role("button", name="Save").click()

    main = page.get_by_role("main")
    expect(page.get_by_role("heading", name="Complaint of Fictional Informant")).to_be_visible()
    expect(main.locator("blockquote")).to_have_text(WORDS)
    expect(main).to_contain_text("overdue, was due")                       # received two hours ago: the 60-minute steps are late
    step = main.locator("li", has_text="1930")
    step.locator("summary", has_text="Mark as done").click()
    step.get_by_label("Note (for example the acknowledgement number)").fill("Fictional ack 2026-77")
    step.get_by_role("button", name="Save").click()
    expect(main.locator("li", has_text="1930")).to_contain_text("Fictional ack 2026-77")
    expect(main).to_contain_text("An FIR can be registered once the informant has signed.")

    sign = form(page, "Read over to the informant and signed")
    sign.get_by_label("Read over in").select_option("mr")
    sign.get_by_role("button", name="Save").click()
    expect(main).to_contain_text("Read over to the informant in Marathi, admitted correct and signed")
    expect(page.get_by_label("Copy for the informant")).to_contain_text(WORDS)   # the free copy (BNSS 173(2)) carries the signed words

    fir = form(page, "Register the FIR from this complaint")
    fir.get_by_label("Year").fill(str(registered.year))
    fir.get_by_label("FIR number").fill("601")
    fir.get_by_label("General diary entry").fill("GD-601")
    fir.get_by_label("Registered (date and time, IST)").fill(iso(registered))
    fir.get_by_label("Sections").fill("BNS 318(4)")
    fir.get_by_role("button", name="Save").click()

    expect(page.get_by_role("heading", name=f"FIR 601/{registered.year}")).to_be_visible()
    expect(main).to_contain_text(WORDS)                                     # the signed words, unchanged
    page.get_by_role("link", name="Front desk").click()
    expect(page.get_by_text("No open complaints.")).to_be_visible()
