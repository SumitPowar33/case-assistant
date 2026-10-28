"""Checks the hard rules in CLAUDE.md on the whole repository, so a breach fails the build. Stdlib only."""
import pathlib
import re
import subprocess

ROOT = pathlib.Path(__file__).parents[2]
SKIP_DIRS = {"node_modules", "dist", "target", ".git", "__pycache__", ".pytest_cache", "site"}
TEXT = {".java", ".py", ".ts", ".tsx", ".js", ".json", ".sql", ".md", ".yml", ".yaml", ".properties", ".xml", ".html", ".sh"}


def files(*roots):
    for root in roots:
        for p in (ROOT / root).rglob("*"):
            if p.is_file() and p.suffix in TEXT and not SKIP_DIRS & set(p.parts) and p.name != "package-lock.json":
                yield p


def hits(pattern, *roots, exclude=()):
    rx = re.compile(pattern)
    return [str(p.relative_to(ROOT)) for p in files(*roots) if not any(e in p.parts for e in exclude)
            and rx.search(p.read_text(encoding="utf-8", errors="ignore"))]


def test_model_vendors_are_called_only_from_the_ai_gateway():
    bad = hits(r"api\.anthropic\.com|generativelanguage\.googleapis\.com|anthropic\.Anthropic|google\.generativeai",
               "apps", "packages", "packs", "tests")
    assert bad == [], f"direct model calls outside services/ai-gateway: {bad}"


def test_no_secret_looks_committed():
    bad = hits(r"sk-ant-[A-Za-z0-9_-]{10,}|AIza[0-9A-Za-z_-]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----",
               "apps", "services", "packages", "packs", "docs", "tests", ".github")
    assert bad == [], f"secret-like text in: {bad}"


def test_no_forbidden_feature_names_in_code():
    bad = hits(r"(?i)facial_?recognition|face_?recognition|credibility_?score|guilt_?score|crime_?prediction|predict_?offender",
               "apps", "services", "packages", exclude=("tests", "db-tests"))
    assert bad == [], f"features the rules forbid: {bad}"


def test_commits_carry_no_ai_attribution():
    log = subprocess.run(["git", "log", "--format=%an <%ae>%n%B%x00"], cwd=ROOT, capture_output=True, text=True).stdout
    if not log:
        return   # not a git checkout (a source archive)
    for commit in filter(None, log.split("\x00")):
        assert not re.search(r"(?im)^co-authored-by:|claude\.ai/code|generated with \[?claude", commit), commit[:200]


def test_progress_file_names_the_working_branch():
    assert re.search(r"(?m)^Working branch: `[^`]+`", (ROOT / "docs/PROGRESS.md").read_text(encoding="utf-8"))
