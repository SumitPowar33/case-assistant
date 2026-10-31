"""A case typed by hand in a real browser: an IO registers an FIR, adds the accused, records the arrest with its first
remand and sees the deadlines the law sets. Fictional data only."""
import datetime as dt

from playwright.sync_api import expect

from test_load_data import setup_station, sign_in


def form(page, title):
    """Opens one of the folding forms (Register a new FIR, Add a person, ...) and returns it."""
    page.locator("summary", has_text=title).click()
    return page.locator("details", has=page.locator("summary", has_text=title)).locator("form")


def test_an_io_registers_an_fir_adds_the_accused_records_the_arrest_and_sees_the_deadlines(core, page):
    accounts = setup_station(core, "flow", roles=("io",))
    sign_in(page, "io.flow", accounts["io.flow"])
    today = dt.date.today()
    registered, remand = today - dt.timedelta(days=2), today - dt.timedelta(days=1)

    fir = form(page, "Register a new FIR")
    fir.get_by_label("Year").fill(str(registered.year))
    fir.get_by_label("FIR number").fill("501")
    fir.get_by_label("General diary entry").fill("GD-77")
    fir.get_by_label("Information received (date and time, IST)").fill(f"{registered}T09:30")
    fir.get_by_label("Registered (date and time, IST)").fill(f"{registered}T10:00")
    fir.get_by_label("Information as given (in the informant's words)").fill("Fictional complaint: a fictional phone was taken at a bus stop.")
    fir.get_by_label("Sections").fill("BNS 303(2)")
    expect(fir.get_by_label("I am the investigating officer")).to_be_checked()
    fir.get_by_role("button", name="Save").click()

    expect(page.get_by_role("heading", name=f"FIR 501/{registered.year}")).to_be_visible()
    main = page.get_by_role("main")
    expect(main).to_contain_text("Sections: BNS 303(2)")
    expect(main).to_contain_text("Fictional complaint: a fictional phone was taken at a bus stop.")
    expect(main).to_contain_text("Add the person as an accused first; only an accused can be arrested.")

    person = form(page, "Add a person")
    person.get_by_label("Role").select_option("accused")
    person.get_by_label("Label").fill("A1")
    person.get_by_label("Full name (leave empty if not known)").fill("Fictional Accused Alpha")
    person.get_by_role("button", name="Save").click()
    expect(main).to_contain_text("A1 (accused): Fictional Accused Alpha")

    arrest = form(page, "Record an arrest (BNSS 35 memo)")
    arrest.get_by_label("Arrested (date and time, IST)").fill(f"{registered}T18:00")
    arrest.get_by_label("Place of arrest").fill("Fictional bus stand")
    arrest.get_by_label("Grounds of arrest told to the person (one per line)").fill("Fictional theft of a phone")
    arrest.get_by_label("Relative or friend informed (BNSS 48)").fill("Fictional Relative")
    arrest.get_by_label("Date of first remand (if already known)").fill(str(remand))
    arrest.get_by_role("button", name="Save").click()

    # BNSS 187(3): less than 10 years, so 60 days counted from the first remand (the remand day is day 1)
    last_day = remand + dt.timedelta(days=59)
    expect(main).to_contain_text("A1: arrested")
    expect(main).to_contain_text(f"chargesheet within 60 days, last day {last_day}")
    deadlines = page.locator("section", has=page.get_by_role("heading", name="Deadlines", exact=True))
    expect(deadlines).to_contain_text(f"Chargesheet for an accused in custody: by {last_day} (BNSS 187(3)")
    expect(deadlines).to_contain_text(f"Progress update to the victim: by {registered + dt.timedelta(days=90)} (BNSS 193(3)(ii), 90 days)")

    # the FIR is on the list of the IO
    page.get_by_role("link", name="← All FIRs").click()
    expect(page.get_by_role("link", name=f"501/{registered.year}", exact=True)).to_be_visible()
