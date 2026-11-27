"""Incoming 112 events in a real browser: the front desk writes a call down, the duty officer acknowledges it and opens it as a
complaint, another call is entered in the general diary, a call about a woman in distress is withheld from an IO, and an IO
has no form or buttons. Fictional data only."""
import datetime

import psycopg
from playwright.sync_api import expect

from conftest import DB, PG, ROOT

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


def beat_duty_now(username):
    """A beat duty in the shift running now, written to the table: before 6 am that shift is yesterday's night, which the
    app no longer lets anyone write."""
    now = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=5, minutes=30)))
    shift = "morning" if 6 <= now.hour < 14 else "evening" if 14 <= now.hour < 22 else "night"
    day = now.date() - datetime.timedelta(days=1 if now.hour < 6 else 0)
    with psycopg.connect(dbname=DB, **PG) as c:
        c.execute("insert into duty_assignment(station_id,officer_id,on_date,kind,shift,post,recorded_by) "
                  "select station_id, id, %s, 'duty', %s, 'beat', id from app_user where username = %s", (day, shift, username))


def test_a_call_is_written_acknowledged_and_opened_and_a_sensitive_one_is_withheld(core, page):
    accounts = setup_station(core, "c12", roles=("front_desk", "io"))
    beat_duty_now("io.c12")
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
    # the call is sent to the officer on the beat now (item 16)
    to = woman.get_by_label("Officer on beat or patrol")
    expect(woman.get_by_role("button", name="Send to this officer")).to_be_disabled()
    to.select_option(value=to.locator("option", has_text="Fictional IO").get_attribute("value"))
    woman.get_by_role("button", name="Send to this officer").click()
    expect(woman).to_contain_text("Sent to Fictional IO (Inspector) on")
    expect(woman.get_by_label("Officer on beat or patrol")).to_have_count(0)   # nobody else is on the beat
    page.screenshot(path=ROOT / "apps/core/target/calls-sent-1280.png", full_page=True)
    page.set_viewport_size({"width": 390, "height": 844})
    assert page.evaluate("document.documentElement.scrollWidth") <= 390
    page.screenshot(path=ROOT / "apps/core/target/calls-sent-390.png", full_page=True)
    page.set_viewport_size({"width": 1280, "height": 900})

    # an IO of the station sees where and what, not the caller or details of the call about the woman, and has no buttons
    page.get_by_role("button", name="Sign out").click()
    sign_in(page, "io.c12", accounts["io.c12"])
    page.goto(page.url.split("#")[0] + "#/")
    expect(page.get_by_text("112 call sent to you: Woman in distress, Fictional Chowk, North Road")).to_be_visible()
    page.screenshot(path=ROOT / "apps/core/target/dashboard-112-1280.png", full_page=True)
    page.set_viewport_size({"width": 390, "height": 844})
    assert page.evaluate("document.documentElement.scrollWidth") <= 390
    page.screenshot(path=ROOT / "apps/core/target/dashboard-112-390.png", full_page=True)
    page.set_viewport_size({"width": 1280, "height": 900})
    page.goto(page.url.split("#")[0] + "#/calls-112")
    expect(page.get_by_role("heading", name="Incoming 112 events")).to_be_visible()
    woman = page.get_by_role("listitem").filter(has_text="Woman in distress")
    expect(woman).to_contain_text("Fictional Chowk, North Road")
    expect(woman).to_contain_text("Sent to you on")
    expect(woman).to_contain_text("Caller and details are shown only to the officer who wrote this event")
    expect(page.get_by_text("asks for help")).to_have_count(0)
    expect(page.get_by_text("Fictional dispute over a parked cart.")).to_be_visible()   # an ordinary call is read by the station
    expect(page.get_by_role("button", name="Acknowledge")).to_have_count(0)
    expect(page.get_by_role("heading", name="Write down a 112 call")).to_have_count(0)
