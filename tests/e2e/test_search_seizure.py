"""Search and seizure memo in a real browser on a tablet (board 7): the IO writes the memo once the search is over (place,
grounds, two witnesses, the video's hash and length, one sealed item), freezes it, sees it listed with "not yet sent to the
Magistrate", records the day it was sent; the item is in the evidence part and the property register. An IO of another
station reads nothing of it. Fictional data only."""
import datetime as dt

from playwright.sync_api import expect

from test_load_data import setup_station, sign_in

IST = dt.timezone(dt.timedelta(hours=5, minutes=30))


def test_the_io_freezes_a_search_memo_on_a_tablet_and_records_the_forwarding(core, page):
    api, _, _ = core
    accounts = setup_station(core, "srch", roles=("io", "malkhana"))
    other = setup_station(core, "srci", roles=("io",))
    io = api.token("io.srch", accounts["io.srch"])
    _, me = api.call("GET", "/api/me", token=io)
    yesterday = (dt.datetime.now(IST) - dt.timedelta(days=1)).date()
    status, fir = api.call("POST", "/api/firs", {
        "stationId": me["station_id"], "firYear": 2026, "firNo": 61, "gdEntryNo": "GD-61",
        "registeredAt": f"{yesterday - dt.timedelta(days=2)}T10:00:00+05:30", "informationReceivedAt": f"{yesterday - dt.timedelta(days=2)}T09:30:00+05:30",
        "contentsOriginal": "Fictional information about fictional stolen phones.", "contentsLanguage": "en", "actionTaken": "investigate", "ioId": me["id"]}, io)
    assert status == 201, fir

    page.set_viewport_size({"width": 820, "height": 1180})   # a tablet held upright
    sign_in(page, "io.srch", accounts["io.srch"])
    page.goto(page.url.split("#")[0] + f"#/firs/{fir['id']}/search")
    expect(page.get_by_role("heading", name="Search and seizure memo (BNSS 103, 105, 185)")).to_be_visible()
    expect(page.get_by_text("No search memo yet.")).to_be_visible()
    page.get_by_label("Place searched").fill("Fictional house, Demo lane")
    page.get_by_label("Grounds for the search (BNSS 185(1))").fill("Fictional information that the phones are kept here")
    page.get_by_label("Search started (IST)").fill(f"{yesterday}T07:00")
    page.get_by_label("Search ended (IST)").fill(f"{yesterday}T07:40")
    for n, (name, address) in enumerate((("Fictional Neighbour", "Fictional lane 1"), ("Fictional Shopkeeper", "Fictional lane 2")), 1):
        group = page.get_by_role("group", name=f"Witness {n}")
        group.get_by_label("Name").fill(name)
        group.get_by_label("Present address").fill(address)
    rec = page.get_by_role("group", name="Recording 1")
    rec.get_by_label("Length (minutes:seconds)").fill("3:41")
    rec.get_by_label("SHA-256 of the file").fill("9f" * 32)
    page.get_by_role("button", name="Add an item").click()
    item = page.get_by_role("group", name="Item 1")
    item.get_by_label("Label").fill("E-03")
    item.get_by_label("Description").fill("Fictional phone, black")
    item.get_by_label("Seal number").fill("61/E-03")
    page.get_by_role("button", name="Save and freeze the memo").click()

    memo = page.locator("li.card", has_text="Fictional house, Demo lane")
    expect(memo).to_contain_text("Witnesses: Fictional Neighbour, Fictional Shopkeeper")
    expect(memo).to_contain_text("Video, 3:41")
    expect(memo).to_contain_text("61/E-03")
    expect(memo).to_contain_text("Recording not yet sent to the Magistrate: 1 days since the search")
    forward = memo.get_by_role("form", name="Record that the recording was sent")
    forward.get_by_label("Date sent").fill(str(yesterday))
    forward.get_by_label("Sent to (Magistrate)").fill("Fictional JMFC, Demo City")
    forward.get_by_role("button", name="Record that the recording was sent").click()
    expect(memo).to_contain_text(f"Recording sent to Fictional JMFC, Demo City on {yesterday}")
    assert page.evaluate("document.documentElement.scrollWidth") <= 820   # nothing wider than the tablet

    page.goto(page.url.split("#")[0] + f"#/firs/{fir['id']}/evidence")
    expect(page.locator("li.card strong", has_text="E-03").first).to_be_visible()

    # the malkhana of the station sees the sealed item in the register; an IO of another station reads no memo
    status, register = api.call("GET", "/api/property", token=api.token("malkhana.srch", accounts["malkhana.srch"]))
    assert status == 200 and [i["label"] for i in register["items"]] == ["E-03"]
    status, _ = api.call("GET", f"/api/firs/{fir['id']}/searches", token=api.token("io.srci", other["io.srci"]))
    assert status == 404
