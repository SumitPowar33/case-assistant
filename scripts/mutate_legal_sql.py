"""Mutation test of the legal numbers in the database (TESTING.md, "Not covered yet" 6; run once a month, not by
scripts/test-all.sh). The day counts of the law live in SQL functions and the deadline view: 60 or 90 days (BNSS
187(3)), 24 hours (BNSS 58), two months (BNSS 193(2)), 90 days (BNSS 193(3)(ii)), the day of remand counted as day 1,
earlier custody counted. This changes one number or one comparison at a time in the newest definition of each of them,
runs apps/core/db-tests on that copy, and lists every change the tests did not notice ("survived"). Needs PostgreSQL as
the database tests do. Usage: python scripts/mutate_legal_sql.py [--list]
"""
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = ROOT / "apps/core/src/main/resources/db/migration"
# the functions and the view that hold legal day counts and section rules
LEGAL = ("chargesheet_last_day", "arrest_last_day", "earlier_custody_days", "sexual_offence_last_day", "ist_date",
         "effective_policy_days", "bnss_193_2_applies", "section_no", "identity_protected_case", "case_deadline")
# a whole number outside quotes, an interval such as '24 hours', or a comparison
TOKEN = re.compile(r"'(\d+) (hours?|days?|months?)'|(?<![\w.'])(\d+)(?![\w.'])|<=|>=|(?<![<>=!])[<>](?![=>])")
SWAP = {"<": "<=", "<=": "<", ">": ">=", ">=": ">"}


def newest(name):
    """(file, start, end) of the newest CREATE of the function or view."""
    found = None
    for f in sorted(MIGRATIONS.glob("V*__*.sql"), key=lambda p: int(p.name[1:].split("__")[0])):
        text = f.read_text(encoding="utf-8")
        for m in re.finditer(r"CREATE (?:OR REPLACE )?(?:FUNCTION|VIEW) " + name + r"\b", text):
            end = text.find("$$;", m.end())
            end = text.find(";", m.end()) + 1 if end == -1 or name == "case_deadline" else end + 3
            found = (f, m.start(), end)
    return found


def strip_strings(text):
    """The text with the inside of every quoted string blanked, except the intervals ('24 hours')."""
    keep = re.compile(r"'\d+ (?:hours?|days?|months?)'")
    return re.sub(r"'[^']*'", lambda m: m[0] if keep.fullmatch(m[0]) else "'" + " " * (len(m[0]) - 2) + "'", text)


def mutants():
    for name in LEGAL:
        f, start, end = newest(name)
        text = f.read_text(encoding="utf-8")
        body = strip_strings(text[start:end])
        for m in TOKEN.finditer(body):
            a, b = start + m.start(), start + m.end()
            if m[1]:
                n = int(m[1])
                changes = [f"'{n + 1} {m[2]}'", f"'{n - 1} {m[2]}'"] if n > 1 else [f"'{n + 1} {m[2]}'"]
            elif m[3]:
                n = int(m[3])
                if text[max(0, a - 1):a] == "$" or n > 400 or re.search(r"SELECT\s+$", text[max(0, a - 10):a], re.I):   # $1, years, EXISTS (SELECT 1
                    continue
                changes = [str(n + 1), str(n - 1)] if n > 0 else [str(n + 1)]
            else:
                changes = [SWAP[m[0]]]
            for c in changes:
                yield name, f, text[:a] + c + text[b:], f"{text[a:b]} -> {c}"


def run(f, mutated):
    with tempfile.TemporaryDirectory() as d:
        for m in MIGRATIONS.glob("*.sql"):
            shutil.copy(m, d)
        Path(d, f.name).write_text(mutated, encoding="utf-8")
        r = subprocess.run([sys.executable, "-m", "pytest", "-q", "-x", "-p", "no:cacheprovider", str(ROOT / "apps/core/db-tests")],
                           env={**os.environ, "MIGRATIONS_DIR": d}, capture_output=True, text=True)
        return r.returncode != 0


def main():
    all_ = list(mutants())
    if "--list" in sys.argv:
        for name, f, _, what in all_:
            print(f"{name:26} {f.name:50} {what}")
        return
    survived = []
    for i, (name, f, mutated, what) in enumerate(all_, 1):
        killed = run(f, mutated)
        print(f"[{i}/{len(all_)}] {'killed  ' if killed else 'SURVIVED'} {name}: {what}", flush=True)
        if not killed:
            survived.append(f"{name} ({f.name}): {what}")
    print(f"\n{len(all_) - len(survived)} of {len(all_)} changes noticed by the database tests")
    for s in survived:
        print("  survived:", s)
    sys.exit(1 if survived else 0)


if __name__ == "__main__":
    main()
