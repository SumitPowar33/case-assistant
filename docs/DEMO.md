# Demo script (about 15 minutes)

One fictional police station and one online-fraud case, from the front desk to the readiness check. Everything is made
up: names, account, bank, amounts. Use a demo installation only, never one with real data.

## Before the demo
1. Start a demo installation (core app, web app; the AI gateway with the offline `fake` provider is enough) on a fresh
   database, with `BOOTSTRAP_ADMIN_USERNAME` and `BOOTSTRAP_ADMIN_PASSWORD` set.
2. Load the case: `CORE_URL=http://localhost:8080 BOOTSTRAP_ADMIN_USERNAME=... BOOTSTRAP_ADMIN_PASSWORD=... python scripts/demo_case.py`
   It prints five accounts of "Fictional Demo PS" (Fictional Demo District, Maharashtra) with passwords made up for this
   run: `front_desk.demo`, `io.demo`, `sho.demo`, `sp.demo`, `malkhana.demo`. Write them down; they are not stored.
3. The case is dated from today: information received 4 days ago, the account holder arrested 3 days ago, first remand
   2 days ago. `tests/e2e/test_demo_case.py` loads it on every test run, so the steps below keep working.

## 1. The front desk (sign in as `front_desk.demo`), 4 minutes
- Open **Front desk**. Take a new complaint live: kind "Online financial fraud", mode "Spoken at the station". Choose
  Marathi as the typing language and type in English letters (or press **Speak**): the words appear in Marathi.
- Point out: the text is the informant's own words; it is read over and signed (BNSS 173(1)); after signing it cannot
  be changed, earlier wordings before signing are kept. The **First steps** of the first hour are counted from the time
  of receipt (report on 1930 within the hour, so the bank can hold the money).
- Print the **Copy for the informant** (BNSS 173(2), free of cost).
- The loaded case went the same way: its complaint was signed, the 1930 step recorded, and FIR 1 registered from it, so
  it is no longer in the open list.

## 2. The case (sign in as `io.demo`), 6 minutes
- **FIRs**: open FIR 1. The FIR carries the signed text unchanged; sections BNS 318(4) and 319(2).
- **Arrests**: A1 was arrested 3 days ago; the first remand starts the BNSS 187(3) limit: chargesheet within 60 days
  (punishment less than 10 years), last day shown. **Deadlines** also shows the 90-day progress update to the victim
  (BNSS 193(3)(ii)) and the 24-hour production rule (BNSS 58) is met by the remand.
- **Evidence**: E1, the bank statement, with its SHA-256, the hand-over to the malkhana, and Part A of its BSA 63(4)
  certificate. Part B (the expert) is missing on purpose.
- **Notices**: the BNSS 94 notice to the bank's nodal officer, sent, with the reply date.

## 3. The readiness check, 3 minutes
- **Readiness check** on the same FIR, with the online-fraud playbook (a draft until the Directorate of Prosecution
  reviews it). Only "money was delivered" has evidence (E1). The open gaps: the other ingredients of both charges, the
  missing Part B of E1's certificate, and the rule that an account holder needs a second, independent link (SIM or
  device, KYC, CCTV, login IP, or their own statement).
- Say it plainly: it lists what the case file contains; it does not judge anyone. A gap can be accepted only with a
  written reason by a person, and that is recorded.

## 4. Language and rules, 2 minutes
- Switch the **screen language** in the header (any of the 10 languages; drafts until a native speaker reviews them).
- **Type**: the language tool with the legal glossary (29 terms in 10 languages, a draft).
- **Policies** (sign in as `sho.demo`): a station may only make a rule stricter, never looser than the state or the law.

## What not to say
- No guilt, credibility or "risk" scores exist, and none will: the AI drafts, a person decides.
- The legal content (playbooks, golden-hour steps, punishments, translations) is a draft until reviewed.
