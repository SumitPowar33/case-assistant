"""CLAUDE.md: access follows permissions from packs/*/roles.json; never decide by a role name in code.

Any line of app code that mentions a role and a role code from the packs together (for example role === 'sho') fails.
Tests and the pack files themselves may name roles. Java builds role lists from the packs (Roles.with, Roles.scoped).
"""
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).parents[2]
CODES = sorted({code for f in ROOT.glob("packs/*/roles.json") for code in json.loads(f.read_text(encoding="utf-8"))["roles"]})
SOURCES = [p for p in sorted((ROOT / "apps/web/src").glob("*.ts*")) if ".test." not in p.name] \
    + sorted((ROOT / "services/ai-gateway/app").glob("*.py")) + sorted((ROOT / "apps/core/src/main/java").rglob("*.java"))
LITERAL = re.compile(r"""['"](%s)['"]""" % "|".join(map(re.escape, CODES)))


def offending(lines):
    return [(n, line.strip()) for n, line in enumerate(lines, 1) if re.search(r"role", line, re.I) and LITERAL.search(line)]


def test_the_rule_bites():
    assert offending(["  const admin = session?.user.role === 'state_admin'"])
    assert offending(['if u.get("role") != "state_admin":'])
    assert offending(["const supervisor = ['sho', 'sp'].includes(user.role)"])
    assert not offending(["return send(`/firs/${firId}/io`, 'POST', { ioId: f.get('io'), reason })"])


def test_no_app_code_decides_by_role_name():
    assert "state_admin" in CODES and "sho" in CODES
    found = [f"{p.relative_to(ROOT)}:{n}: {line}" for p in SOURCES for n, line in offending(p.read_text(encoding="utf-8").splitlines())]
    assert found == [], "decide by a permission or case scope from roles.json, not by role name:\n" + "\n".join(found)
