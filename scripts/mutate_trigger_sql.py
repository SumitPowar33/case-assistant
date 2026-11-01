"""Mutation test of the database's keep-as-written and masking rules (TESTING.md, "Not covered yet" 6; run once a
month, not by scripts/test-all.sh). Records of a case are kept as written by triggers (no change, no delete, only the
facts the law lets be added later), and the identity of a protected victim is masked by person_masked and the
person_public view. This changes one thing at a time in the newest definition of each of them, runs apps/core/db-tests
on that copy, and lists every change the tests did not notice ("survived"):
  - a refusal (RAISE EXCEPTION) taken out, so the row goes through;
  - a comparison or test turned round (= and <>, < and <=, IS NULL and IS NOT NULL, AND and OR, EXISTS and NOT EXISTS,
    IS DISTINCT FROM and IS NOT DISTINCT FROM, a NOT dropped), one name taken out of a list of names ('victim', ...),
    a CASE WHEN that never applies;
  - a trigger dropped, or one of its events (INSERT, UPDATE, DELETE) taken out.
The legal numbers are mutated by scripts/mutate_legal_sql.py. Needs PostgreSQL as the database tests do.
Usage: python scripts/mutate_trigger_sql.py [--list] [--jobs N] [--only NAME]
"""
import argparse
import os
import re
import shutil
import subprocess
import sys
import tempfile
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from mutate_legal_sql import MIGRATIONS, ROOT, newest, strip_strings  # noqa: E402

# not trigger functions, but the rules of masking a victim's identity and of what a certificate correction may change
EXTRA = ("person_masked", "person_public", "certificate_correction_matches", "chargesheet_filed_for")
# each operator: a pattern on the body with its strings blanked, and what the match becomes
OPS = [
    (re.compile(r"RAISE EXCEPTION[^;]*;"), lambda s: ["NULL;"]),
    (re.compile(r"(?<![<>!:=])=(?![=>])"), lambda s: ["<>"]),
    (re.compile(r"<>"), lambda s: ["="]),
    (re.compile(r"<=|>=|(?<![<>=!-])[<>](?![=>])"), lambda s: [{"<": "<=", "<=": "<", ">": ">=", ">=": ">"}[s]]),
    (re.compile(r"\bIS NOT NULL\b"), lambda s: ["IS NULL"]),
    (re.compile(r"\bIS NULL\b"), lambda s: ["IS NOT NULL"]),
    (re.compile(r"\bIS NOT DISTINCT FROM\b"), lambda s: ["IS DISTINCT FROM"]),
    (re.compile(r"\bIS DISTINCT FROM\b"), lambda s: ["IS NOT DISTINCT FROM"]),
    (re.compile(r"\bAND\b"), lambda s: ["OR"]),
    (re.compile(r"\bOR\b"), lambda s: ["AND"]),
    (re.compile(r"(?<!IS )\bNOT (?!NULL|DISTINCT)"), lambda s: [""]),
    (re.compile(r"(?<!NOT )\bEXISTS\b"), lambda s: ["NOT EXISTS"]),
    (re.compile(r"\bCASE WHEN\b"), lambda s: ["CASE WHEN false AND"]),
]
NAMES = re.compile(r"\bIN \(('\s*'(?:,\s*'\s*')+)\)")          # IN ('victim', 'complainant') with the strings blanked
URL = os.environ.get("DATABASE_URL", "postgresql://caseapp:caseapp@localhost/caseapp_test")
# changes that cannot alter what the rule does; each says why (checked by hand, 1 Nov 2026)
EQUIVALENT = [
    ("allow_only_withdrawal", "line 27: RAISE EXCEPTION", "a delete then has no NEW row, so the withdrawal check below refuses it"),
    ("arrest_allow_only_remand", "line 26: RAISE EXCEPTION", "a delete then has no NEW row, so the kept-as-written check below refuses it"),
    ("arrest_time_correction_rules", "line 42: > -> >=", "a time exactly five minutes ahead of now() cannot be written in a test"),
]
TRIGGER = re.compile(r"CREATE TRIGGER (\w+)\s+(BEFORE|AFTER) (.+?) ON .+?;", re.S)


def functions():
    """Names of every trigger function a trigger still uses, then the masking and certificate rules."""
    gone, live = dropped(), set()
    for f in MIGRATIONS.glob("V*__*.sql"):
        for m in TRIGGER.finditer(f.read_text(encoding="utf-8")):
            if m[1] not in gone:
                live.add(re.search(r"EXECUTE FUNCTION (\w+)", m[0])[1])
    return sorted(live) + [e for e in EXTRA if e not in live]


def dropped():
    """Triggers a later migration drops (and does not create again)."""
    return {n for f in MIGRATIONS.glob("V*__*.sql") for n in re.findall(r"DROP TRIGGER (\w+)", f.read_text(encoding="utf-8"))}


def where(text, at, what):
    """The change with its line number and the line it is on, for the report."""
    line = text[text.rfind("\n", 0, at) + 1:text.find("\n", at)].strip()
    return f"line {text.count(chr(10), 0, at) + 1}: {what}   [{line[:70]}]"


def run(f, mutated):
    """'killed', 'SURVIVED', or 'invalid' when the changed migrations do not even apply (not a test of the tests)."""
    import psycopg
    with tempfile.TemporaryDirectory() as d:
        for m in MIGRATIONS.glob("*.sql"):
            shutil.copy(m, d)
        Path(d, f.name).write_text(mutated, encoding="utf-8")
        schema = "m_" + uuid.uuid4().hex[:10]
        with psycopg.connect(URL, autocommit=True) as conn:
            conn.execute(f"CREATE SCHEMA {schema}")
            conn.execute(f"SET search_path TO {schema}, public")
            try:
                for m in sorted(Path(d).glob("V*__*.sql"), key=lambda p: int(p.name[1:].split("__")[0])):
                    conn.execute(m.read_text(encoding="utf-8"))
            except psycopg.Error:
                return "invalid"
            finally:
                conn.execute(f"DROP SCHEMA {schema} CASCADE")
        r = subprocess.run([sys.executable, "-m", "pytest", "-q", "-x", "-p", "no:cacheprovider", str(ROOT / "apps/core/db-tests")],
                           env={**os.environ, "MIGRATIONS_DIR": d}, capture_output=True, text=True)
        return "killed" if r.returncode else "SURVIVED"


def body_mutants(name):
    f, start, end = newest(name)
    text = f.read_text(encoding="utf-8")
    head = text.find("$$", start)
    begin = head + 2 if -1 < head < end else text.find(" AS", start) + 3   # the body of a function, the query of a view
    body = strip_strings(text[begin:end])
    # the message part of a refusal (RAISE ... USING ERRCODE = ...) is not a rule: only the whole refusal is taken out
    quiet = re.sub(OPS[0][0], lambda m: " " * len(m[0]), body)
    seen = set()
    for pattern, change in OPS:
        for m in pattern.finditer(body if pattern is OPS[0][0] else quiet):
            a, b = begin + m.start(), begin + m.end()
            if m[0] == "AND" and re.search(r"BETWEEN\s+\S+\s+$", body[:m.start()]):
                continue
            for c in change(m[0]):
                if (a, b, c) not in seen:
                    seen.add((a, b, c))
                    yield name, f, text[:a] + c + text[b:], where(text, a, f"{' '.join(text[a:b].split())[:50]} -> {c or '(dropped)'}")
    for m in NAMES.finditer(body):
        items = [(begin + m.start(1) + i.start(), begin + m.start(1) + i.end()) for i in re.finditer(r"'\s*'", m[1])]
        for k, (a, b) in enumerate(items):
            kept = ", ".join(text[x:y] for j, (x, y) in enumerate(items) if j != k)
            lo, hi = items[0][0], items[-1][1]
            yield name, f, text[:lo] + kept + text[hi:], where(text, a, f"{text[a:b]} taken out of IN ({text[lo:hi]})")


def trigger_mutants():
    gone = dropped()
    for f in sorted(MIGRATIONS.glob("V*__*.sql")):
        text = f.read_text(encoding="utf-8")
        for m in TRIGGER.finditer(text):
            if m[1] in gone:
                continue
            yield m[1], f, text[:m.start()] + text[m.end():], where(text, m.start(), "trigger dropped")
            events = m[3].split(" OR ")
            for k in range(len(events) if len(events) > 1 else 0):
                rest = " OR ".join(e for j, e in enumerate(events) if j != k)
                a, b = m.start(3), m.end(3)
                yield m[1], f, text[:a] + rest + text[b:], where(text, m.start(), f"{events[k].split()[0]} taken out of {m[3]}")


def mutants(only=None):
    for m in [*(x for name in functions() for x in body_mutants(name)), *trigger_mutants()]:
        if (not only or m[0] == only) and not any(m[0] == n and m[3].startswith(w) for n, w, _ in EQUIVALENT):
            yield m


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--jobs", type=int, default=os.cpu_count() or 1)
    ap.add_argument("--only")
    ap.add_argument("--again", metavar="REPORT", help="run only the changes a previous run's report lists as survived")
    args = ap.parse_args()
    all_ = list(mutants(args.only))
    if args.again:
        report = Path(args.again).read_text(encoding="utf-8")
        all_ = [m for m in all_ if f"survived: {m[0]} ({m[1].name}): {m[3]}" in report]
    if args.list:
        for name, f, _, what in all_:
            print(f"{name:32} {f.name:48} {what}")
        return
    survived, invalid, done = [], 0, 0

    def one(m):
        return m, run(m[1], m[2])

    with ThreadPoolExecutor(args.jobs) as pool:
        for (name, f, _, what), result in pool.map(one, all_):
            done += 1
            print(f"[{done}/{len(all_)}] {result:8} {name}: {what}", flush=True)
            invalid += result == "invalid"
            if result == "SURVIVED":
                survived.append(f"{name} ({f.name}): {what}")
    counted = len(all_) - invalid
    print(f"\n{counted - len(survived)} of {counted} changes noticed by the database tests ({invalid} did not apply)")
    for s in survived:
        print("  survived:", s)
    sys.exit(1 if survived else 0)


if __name__ == "__main__":
    main()
