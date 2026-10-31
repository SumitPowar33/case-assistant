"""The Load data screen in a real browser: FIRs, then their arrests, chargesheets, evidence and notices, each checked and approved by a
person; the loaded records then show on the FIR screens. Fictional data only."""
import re
import secrets

from playwright.sync_api import expect

FIRS = ("FIR No,Registration Date,Sections,Brief Facts,IO,Complainant,Victim,Accused,GD No,Status\n"
        "1,05/03/2024 10:00,IPC 379,Fictional phone theft at a bus stop,io.e2e,Fictional Complainant,,"
        "Fictional Accused One; Fictional Accused Two,GD-1,open\n"
        "2,06/03/2024 11:00,IPC 379,Fictional bicycle theft,io.e2e,Fictional Complainant Two,,,GD-2,open\n"
        "3,31/02/2024,IPC 379,A date that does not exist,,,,,GD-3,open\n")
ARRESTS = ("FIR No,Accused,Arrested On,Place,Grounds,Person Informed,Arrested By,First Remand,Released,Release Type,Punishment Class\n"
           "1,Fictional Accused One,06/03/2024 18:30,Fictional Chowk,Theft,Fictional Relative,io.e2e,07/03/2024,,,less_than_10_years\n"
           "1,Fictional Accused Two,06/03/2024,,,,,07/03/2024,15/03/2024,bail,less_than_10_years\n"
           "9,Fictional Accused One,06/03/2024,,,,,,,,less_than_10_years\n")
CHARGESHEETS = ("FIR No,Report No,Filed On,Court,Accused\n"
                "1,CS-1/2024,20/04/2024,Fictional JMFC Court,Fictional Accused One; Fictional Accused Two\n")
EVIDENCE = ("FIR No,Item No,Type,Description,Date of Seizure,Panchnama,Seal No,Hash\n"
            "1,1/E-01,physical,Fictional iron rod,06/03/2024 12:00,Fictional panchnama 1,S-1,\n"
            "1,1/E-02,electronic,Fictional phone,06/03/2024 12:30,Fictional panchnama 1,S-2," + "ab" * 32 + "\n"
            "1,1/E-03,electronic,Fictional laptop without a hash,06/03/2024,,,\n")
NOTICES = ("FIR No,Under Section,Issued To,Date of Issue,Documents Called For,Reply By,Status,Issued By,Notice Text\n"
           "1,CrPC 91,Fictional Bank Ltd,10/03/2024 11:00,Account statement; KYC form,20/03/2024,pending,io.e2e,Fictional notice text\n"
           "1,BNSS 94,Fictional Telecom Ltd,12/03/2024 11:00,Call records,,pending,io.e2e,Fictional notice text\n")


def setup_station(core, tag, state="IN", roles=("sho", "io")):
    """A fresh station with an SHO (may load data) and an IO (may not); made by the platform admin over the API.
    Returns the passwords by username: {role}.{tag}."""
    api, admin, password = core
    token = api.token(admin, password)
    status, body = api.call("POST", "/api/stations", {"stateCode": state, "district": "Fictional E2E District",
                                                      "name": f"Fictional {tag} PS"}, token)
    assert status == 201, body
    accounts = {}
    for role in roles:
        username, pw = f"{role}.{tag}", secrets.token_urlsafe(18)
        status, body2 = api.call("POST", "/api/users", {"username": username, "password": pw, "fullName": f"Fictional {role.upper()}",
                                                        "rank": "Inspector", "role": role, "stationId": body["id"]}, token)
        assert status == 201, body2
        accounts[username] = pw
    return accounts


def sign_in(page, username, password):
    page.get_by_label("Username").fill(username)
    page.get_by_label("Password").fill(password)
    page.get_by_role("button", name="Sign in").click()
    expect(page.get_by_role("navigation", name="Main")).to_be_visible()


def load(page, layout, filename, csv, expect_counts):
    """Steps 1 to 4 of the screen for one file; returns after the approval message."""
    page.get_by_label("File layout").select_option(label=layout)
    page.get_by_label("CSV file").set_input_files({"name": filename, "mimeType": "text/csv", "buffer": csv.encode()})
    page.get_by_role("button", name="Read the file").click()
    expect(page.get_by_role("form", name="Match the columns")).to_be_visible()
    page.get_by_role("button", name="Check the file").click()
    result = page.get_by_label("Result")
    expect(result.get_by_role("heading", name=f"Result for {filename}")).to_be_visible()
    expect(result).to_contain_text(expect_counts)
    page.get_by_label(re.compile("^Authority for this load")).fill("Fictional order no. E2E/1 of the SP")
    page.get_by_role("button", name=re.compile("^Approve and load")).click()
    expect(page.get_by_role("status")).to_have_text("The records were loaded.")


def test_load_firs_then_arrests_then_chargesheets(core, page):
    accounts = setup_station(core, "e2e")
    sign_in(page, "sho.e2e", accounts["sho.e2e"])
    page.get_by_role("link", name="Load data").click()
    expect(page.get_by_role("heading", name="Load existing records")).to_be_visible()
    expect(page.get_by_text("No file has been loaded yet.")).to_be_visible()

    load(page, "FIR list (CSV), generic", "old-firs.csv", FIRS, "3 rows: 2 ready")
    expect(page.get_by_text("Loaded 2 FIRs, approved by")).to_be_visible()
    load(page, "Arrests (CSV), generic - load the FIRs first", "old-arrests.csv", ARRESTS, "1 with errors")
    load(page, "Chargesheets (CSV), generic - load the FIRs first", "old-chargesheets.csv", CHARGESHEETS, "1 rows: 1 ready")
    load(page, "Evidence register (CSV), generic - load the FIRs first", "old-evidence.csv", EVIDENCE, "1 with errors")
    expect(page.get_by_text("Loaded 2 evidence items, approved by")).to_be_visible()
    load(page, "Notices (CSV), generic - load the FIRs first", "old-notices.csv", NOTICES, "1 with errors")   # no BNSS notice in March 2024

    # the history lists all five loads, each with an undo form
    for name in ("old-firs.csv", "old-arrests.csv", "old-chargesheets.csv", "old-evidence.csv", "old-notices.csv"):
        expect(page.get_by_role("button", name=f"Undo {name}")).to_be_visible()

    # the loaded records on the FIR screens
    page.get_by_role("link", name="FIRs").click()
    expect(page.get_by_role("table", name="FIRs").get_by_role("row")).to_have_count(3)  # header + 2 FIRs
    page.get_by_role("link", name="1/2024", exact=True).click()
    expect(page.get_by_role("heading", name="FIR 1/2024")).to_be_visible()
    main = page.get_by_role("main")
    expect(main).to_contain_text("Fictional phone theft at a bus stop")
    expect(main).to_contain_text("A1 (accused): Fictional Accused One")
    expect(main).to_contain_text("A1: arrested 6 Mar 2024, 6:30 pm IST at Fictional Chowk by Fictional IO")
    expect(main).to_contain_text("A2: arrested 6 Mar 2024, 12:00 am IST at Not in the old record, officer not in the old record")
    expect(main).to_contain_text("First remand 2024-03-07 (recorded by Fictional SHO): chargesheet within 60 days, last day 2024-05-05")
    expect(main).to_contain_text("Chargesheet naming A1 filed on 2024-04-20.")
    evidence = page.locator("section", has=page.get_by_role("heading", name="Evidence", exact=True))
    expect(evidence).to_contain_text("1/E-01 (physical)")
    expect(evidence).to_contain_text("1/E-02 (electronic) · not court-ready yet (BSA 63(4))")   # imported without its certificate
    expect(evidence).not_to_contain_text("1/E-03")                                              # no hash, not loaded
    expect(main).to_contain_text("CrPC 91 (old law): produce documents to Fictional Bank Ltd: sent, waiting for reply")
    expect(main).not_to_contain_text("Fictional Telecom Ltd")
    deadlines = page.locator("section", has=page.get_by_role("heading", name="Deadlines", exact=True))
    expect(deadlines).not_to_contain_text("Loading")
    expect(deadlines).to_contain_text("Progress update to the victim: by 2024-06-03 (BNSS 193(3)(ii), 90 days)")
    expect(deadlines).to_contain_text("Reply to the notice from Fictional Bank Ltd: by 2024-03-20 (CrPC_91)")
    expect(deadlines).not_to_contain_text("Chargesheet for an accused in custody")  # the chargesheet ended the custody clock

    # undo the chargesheets: the custody clock of the accused runs again
    page.get_by_role("link", name="Load data").click()
    undo = page.get_by_role("form", name="Undo old-chargesheets.csv")
    undo.get_by_label("Reason to undo old-chargesheets.csv").fill("Fictional wrong court file was loaded")
    undo.get_by_role("button", name="Undo old-chargesheets.csv").click()
    expect(page.get_by_role("status")).to_have_text("The batch was undone and its chargesheets removed.")
    expect(page.get_by_role("button", name="Undo old-chargesheets.csv")).to_have_count(0)
    page.get_by_role("link", name="FIRs").click()
    page.get_by_role("link", name="1/2024", exact=True).click()
    expect(main).not_to_contain_text("Chargesheet naming A1")
    # A1 is still in custody (A2 was released on bail), so the 60-day clock from the first remand is back
    expect(deadlines).to_contain_text("Chargesheet for an accused in custody: by 2024-05-05 (BNSS 187(3), from first remand of an accused in custody)")


def test_an_officer_without_the_right_to_load_data_is_refused(core, page):
    accounts = setup_station(core, "e2e2")
    sign_in(page, "io.e2e2", accounts["io.e2e2"])
    expect(page.get_by_role("link", name="Policies")).to_be_visible()
    expect(page.get_by_role("link", name="Load data")).to_have_count(0)
    page.goto(page.url.split("#")[0] + "#/import")   # typed by hand: the server still refuses
    expect(page.get_by_role("alert")).to_contain_text("The server answered 403")


MH_FIRS = ("FIR_NUM,FIR_REG_DT,ACT_SEC,थोडक्यात हकीकत,आरोपी,CASE_STAGE\n"
           "7,12-03-2024 09:15,IPC 379,Fictional theft of a fictional bicycle,Fictional Accused Seven,pending\n")


def test_maharashtra_uses_its_own_layout_and_a_second_person_approves(core, page):
    accounts = setup_station(core, "pune", state="MH", roles=("sho", "sp"))
    sign_in(page, "sho.pune", accounts["sho.pune"])
    page.get_by_role("link", name="Load data").click()
    layout = page.get_by_label("File layout")
    page.get_by_label("CSV file").set_input_files({"name": "mh-firs.csv", "mimeType": "text/csv", "buffer": MH_FIRS.encode()})
    layout.select_option(label="FIR list (CSV), Maharashtra CCTNS-style - MADE-UP layout, replace with a real sample")
    page.get_by_role("button", name="Read the file").click()
    match = page.get_by_role("form", name="Match the columns")
    expect(match.get_by_label("fir_no *")).to_have_value("FIR_NUM")       # matched by the made-up layout's names
    expect(match.get_by_label("accused_names")).to_have_value("आरोपी")      # and by a Marathi heading
    page.get_by_role("button", name="Check the file").click()
    expect(page.get_by_label("Result")).to_contain_text("1 rows")
    page.get_by_label(re.compile("^Authority for this load")).fill("Fictional order no. MH/1 of the SP")
    page.get_by_role("button", name=re.compile("^Approve and load")).click()
    expect(page.get_by_role("alert")).to_contain_text("a second authorised person must approve")   # the Maharashtra module
    page.get_by_role("button", name="Sign out").click()

    sign_in(page, "sp.pune", accounts["sp.pune"])
    page.get_by_role("link", name="Load data").click()
    page.get_by_role("button", name="Open mh-firs.csv").click()
    page.get_by_label(re.compile("^Authority for this load")).fill("Fictional order no. MH/1 of the SP")
    page.get_by_role("button", name=re.compile("^Approve and load")).click()
    expect(page.get_by_role("status")).to_have_text("The records were loaded.")
    expect(page.get_by_text("Loaded 1 FIRs, approved by Fictional SP")).to_be_visible()
