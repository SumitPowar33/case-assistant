"""Loads the demo case into a running core app: one fictional police station in Maharashtra with its staff, and one
online-fraud case from the front desk to the readiness check, as docs/DEMO.md walks through it. Everything is made up.

Usage (against a demo database, never one with real data):
    CORE_URL=http://localhost:8080 BOOTSTRAP_ADMIN_USERNAME=... BOOTSTRAP_ADMIN_PASSWORD=... python scripts/demo_case.py [tag]

It signs in as the platform admin, adds the station and the accounts, then does each step as the officer who would.
The accounts' passwords are made up for this run and printed once; they are not stored anywhere. `tag` (default
"demo") makes the usernames ({role}.{tag}) and the station name unique, so it can be loaded again under another tag.
"""
import datetime as dt
import hashlib
import json
import os
import secrets
import sys
import urllib.error
import urllib.request

IST = dt.timezone(dt.timedelta(hours=5, minutes=30))
ROLES = ("front_desk", "io", "sho", "sp", "malkhana")
# the bank statement the victim brought, as a file; its SHA-256 is what the 63(4) certificate must state
STATEMENT = b"Fictional Demo Bank - statement of account XXXX1234 - 28 Oct 2026 - UPI debit Rs 40,000 to fictional UPI ID\n"


class Core:
    def __init__(self, base):
        self.base = base.rstrip("/")

    def call(self, method, path, body=None, token=None):
        req = urllib.request.Request(self.base + path, method=method, data=None if body is None else json.dumps(body).encode())
        req.add_header("content-type", "application/json")
        if token:
            req.add_header("authorization", "Bearer " + token)
        try:
            with urllib.request.urlopen(req, timeout=20) as res:
                text = res.read().decode()
                return json.loads(text) if text else None
        except urllib.error.HTTPError as e:
            raise SystemExit(f"{method} {path} refused ({e.code}): {e.read().decode()[:500]}") from None

    def token(self, username, password):
        return self.call("POST", "/api/login", {"username": username, "password": password})["token"]


def at(day, hour, minute=0):
    """An IST time on a date, as the API takes it."""
    return dt.datetime.combine(day, dt.time(hour, minute), IST).isoformat()


def load_demo(base, admin, admin_password, tag="demo", today=None):
    """Loads the station, the accounts and the case; returns {"accounts": {username: password}, "fir_id", "complaint_id"}."""
    core = Core(base)
    today = today or dt.datetime.now(IST).date()
    received, arrested = today - dt.timedelta(days=4), today - dt.timedelta(days=3)

    root = core.token(admin, admin_password)
    station = core.call("POST", "/api/stations", {"stateCode": "MH", "district": "Fictional Demo District", "name": f"Fictional {tag.title()} PS"}, root)["id"]
    accounts, people = {}, {}
    for role in ROLES:
        username, password = f"{role}.{tag}", secrets.token_urlsafe(12)
        name = {"front_desk": "HC Fictional Desk", "io": "SI Fictional Investigator", "sho": "PI Fictional Station Head",
                "sp": "Fictional Superintendent", "malkhana": "HC Fictional Store Keeper"}[role]
        people[role] = core.call("POST", "/api/users", {"username": username, "password": password, "fullName": name, "rank": name.split()[0],
                                                         "role": role, "stationId": station}, root)["id"]
        accounts[username] = password
    desk, io, malkhana = (core.token(f"{r}.{tag}", accounts[f"{r}.{tag}"]) for r in ("front_desk", "io", "malkhana"))

    # 1. Front desk: the information written down as the informant says it, read over in Marathi, signed; first golden-hour step
    complaint = core.call("POST", "/api/complaints", {
        "stationId": station, "receivedAt": at(received, 10, 15), "mode": "oral", "informantName": "Fictional Informant Demo",
        "informantContact": "Fictional contact, not a real number", "kind": "cyber_financial_fraud", "textLanguage": "en",
        "text": "On 28 October 2026 a caller said he was from my bank and that my account would be blocked. He asked me to share "
                "a code sent to my phone. After I shared it, Rs 40,000 went out of my account by UPI to an account I do not know."}, desk)["id"]
    core.call("POST", f"/api/complaints/{complaint}/sign", {"readBackLanguage": "mr"}, desk)
    core.call("POST", f"/api/complaints/{complaint}/steps", {"stepId": "report_1930", "note": "Reported on the national helpline 1930 (fictional acknowledgement)"}, desk)

    # 2. FIR registered from the signed text, with the sections, and the IO named
    fir = core.call("POST", "/api/firs", {
        "stationId": station, "firYear": received.year, "firNo": 1, "gdEntryNo": "GD-12", "registeredAt": at(received, 11, 0),
        "actionTaken": "investigate", "ioId": people["io"], "complaintId": complaint,
        "sections": [{"act": "BNS", "section": "318(4)"}, {"act": "BNS", "section": "319(2)"}]}, desk)["id"]
    case = f"/api/firs/{fir}"

    # 3. IO: the people, the arrest of the account holder with the first remand (60-day limit, BNSS 187(3))
    def person(role, label, name):
        return core.call("POST", f"{case}/people", {"role": role, "label": label, "identityKnown": True, "fullName": name}, io)["id"]
    person("complainant", "C1", "Fictional Informant Demo")
    accused = person("accused", "A1", "Fictional Account Holder Demo")
    core.call("POST", f"{case}/arrests", {
        "personId": accused, "arrestedAt": at(arrested, 18, 0), "place": "Fictional bus stand, Demo town",
        "grounds": ["The money taken from the informant was received in the account of the person arrested"],
        "informedName": "Fictional Relative Demo", "firstRemandOn": (arrested + dt.timedelta(days=1)).isoformat(),
        "maxPunishment": "less_than_10_years"}, io)

    # 4. Evidence: the bank statement, its custody to the malkhana, and Part A of its BSA 63(4) certificate (Part B missing)
    digest = hashlib.sha256(STATEMENT).hexdigest()
    item = core.call("POST", f"{case}/evidence", {
        "label": "E1", "description": "Bank statement of the informant's account (electronic, fictional)", "kind": "electronic",
        "seizedAt": at(received, 12, 30), "seizureMemo": "Seizure memo SM-1 (fictional)", "sha256": digest}, io)["id"]
    core.call("POST", f"{case}/evidence/{item}/custody", {
        "at": at(received, 13, 0), "handedBy": "SI Fictional Investigator", "receivedBy": "HC Fictional Store Keeper",
        "location": "Malkhana, Fictional Demo PS", "purpose": "Safe keeping", "sealIntact": True}, malkhana)
    core.call("POST", f"{case}/evidence/{item}/certificates", {
        "part": "A", "signerName": "Fictional Informant Demo", "deviceType": "Mobile phone (fictional)", "hashAlgo": "SHA256",
        "hashValue": digest, "signedAt": at(received, 12, 45), "place": "Fictional Demo PS"}, io)

    # 5. A BNSS 94 notice to the bank for the account holder's records, sent with a reply date
    core.call("POST", f"{case}/notices", {
        "kind": "BNSS_94", "addressee": "Nodal Officer, Fictional Demo Bank", "status": "sent",
        "itemsRequested": ["Account opening form and KYC of the receiving account", "Statement of the receiving account, 1 to 31 Oct 2026",
                           "IP addresses and devices used to log in"],
        "body": "Under BNSS 94 you are required to produce the documents listed for the investigation of FIR 1 (fictional demo case).",
        "issuedAt": at(received, 16, 0), "replyDueOn": (today + dt.timedelta(days=3)).isoformat()}, io)

    # 6. Readiness check: the online-fraud playbook, A1 marked as the account holder (needs a second link), one ingredient
    #    linked to the statement; the other gaps stay for the demo
    core.call("PUT", f"{case}/playbook", {"playbookId": "cyber-fraud"}, io)
    core.call("PUT", f"{case}/people/{accused}/account-holder", {"basis": "The informant's money was received in the account of A1 (fictional)"}, io)
    core.call("POST", f"{case}/readiness/links", {"chargeId": "cheating", "ingredientId": "delivery", "evidenceItemId": item,
                                                    "note": "The statement shows the Rs 40,000 UPI debit"}, io)
    return {"accounts": accounts, "fir_id": fir, "complaint_id": complaint}


def main():
    base, admin, password = os.environ.get("CORE_URL", "http://localhost:8080"), os.environ.get("BOOTSTRAP_ADMIN_USERNAME"), os.environ.get("BOOTSTRAP_ADMIN_PASSWORD")
    if not admin or not password:
        raise SystemExit("Set BOOTSTRAP_ADMIN_USERNAME and BOOTSTRAP_ADMIN_PASSWORD (the platform admin of this demo installation).")
    out = load_demo(base, admin, password, *(sys.argv[1:2] or []))
    print("Demo case loaded. Accounts (passwords made up for this run; write them down now):")
    for username, pw in out["accounts"].items():
        print(f"  {username:20} {pw}")


if __name__ == "__main__":
    main()
