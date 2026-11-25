"""Incoming 112 events in a real browser: the front desk writes a call down, the duty officer acknowledges it and opens it as a
complaint, another call is entered in the general diary, a call about a woman in distress is withheld from an IO, and an IO
has no form or buttons. Fictional data only."""
import datetime

from playwright.sync_api import expect

from test_load_data import setup_station, sign_in


def write_call(page, kind_label, details):
    form = page.get_by_role("heading", name="Write down a 112 call").locator("xpath=ancestor::form")
    form.get_by_label("Time received").fill((datetime.datetime.now() - datetime.timedelta(minutes=10)).strftime("%Y-%m-%dT%H:%M"))
    form.get_by_label("Place").fill("Fictional Chowk, North Road")
    form.get_by_label("Kind of call").select_option(label=kind_label)
    form.get_by_label("Vehicle sent").fill("Fictional Van 3")
    form.get_by_label("Caller (as given)").fill("Fictional Caller")
    form.get_by_label("What the caller said").fill(details)
    form.get_by_role("button", name="Save event").click()


def test_a_call_is_written_acknowledged_and_opened_and_a_sensitive_one_is_withheld(core, page):
    accounts = setup_station(core, "c12", roles=("front_desk", "io"))
    sign_in(page, "front_desk.c12", accounts["front_desk.c12"])
    page.goto(page.url.split("#")[0] + "#/calls-112")
    expect(page.get_by_role("heading", name="Incoming 112 events")).to_be_visible()
    expect(page.get_by_text("No 112 events yet.")).to_be_visible()

    write_call(page, "Dispute", "Fictional dispute over a parked cart.")
    expect(page.get_by_text("Fictional dispute over a parked cart.")).to_be_visible()   # saved and listed before the next is written
    write_call(page, "Woman in distress", "Fictional woman asks for help at the fictional chowk.")
    expect(page.get_by_text("Fictional woman asks for help")).to_be_visible()
    dispute = page.get_by_role("listitem").filter(has_text="Fictional dispute over a parked cart.")
    expect(dispute).to_contain_text("Fictional Van 3")
    expect(dispute).to_contain_text("Written by Fictional FRONT_DESK")   # the officer who wrote it still reads it

    dispute.get_by_role("button", name="Acknowledge").click()
    expect(dispute).to_contain_text("Acknowledged by Fictional FRONT_DESK")
    expect(dispute.get_by_role("button", name="Acknowledge")).to_have_count(0)
    expect(dispute.get_by_role("button", name="Open as a complaint")).to_be_disabled()   # a kind first
    expect(dispute.get_by_label("Kind of complaint").locator("option")).not_to_have_count(1)
    dispute.get_by_label("Kind of complaint").select_option(index=1)
    dispute.get_by_role("button", name="Open as a complaint").click()
    link = dispute.get_by_role("link", name="Opened as a complaint at the front desk")
    expect(link).to_be_visible()
    expect(dispute.get_by_role("button", name="Enter in the general diary")).to_have_count(0)   # opened once only
    link.click()
    expect(page.get_by_text("Fictional dispute over a parked cart.").first).to_be_visible()   # the complaint carries the text as written

    page.goto(page.url.split("#")[0] + "#/calls-112")
    woman = page.get_by_role("listitem").filter(has_text="Woman in distress")
    woman.get_by_role("button", name="Acknowledge").click()
    woman.get_by_role("button", name="Enter in the general diary").click()
    expect(woman).to_contain_text("Entered as general diary entry no. 1")

    # an IO of the station sees where and what, not the caller or details of the call about the woman, and has no buttons
    page.get_by_role("button", name="Sign out").click()
    sign_in(page, "io.c12", accounts["io.c12"])
    page.goto(page.url.split("#")[0] + "#/calls-112")
    expect(page.get_by_role("heading", name="Incoming 112 events")).to_be_visible()
    woman = page.get_by_role("listitem").filter(has_text="Woman in distress")
    expect(woman).to_contain_text("Fictional Chowk, North Road")
    expect(woman).to_contain_text("Caller and details are shown only to the officer who wrote this event")
    expect(page.get_by_text("asks for help")).to_have_count(0)
    expect(page.get_by_text("Fictional dispute over a parked cart.")).to_be_visible()   # an ordinary call is read by the station
    expect(page.get_by_role("button", name="Acknowledge")).to_have_count(0)
    expect(page.get_by_role("heading", name="Write down a 112 call")).to_have_count(0)
