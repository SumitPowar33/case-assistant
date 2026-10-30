"""Contract between the web app and the core: every call the web app makes names a route (and method) the core really has.

A renamed or removed route fails here, not on a screen. Read from the source of both sides, so it needs no running server.
"""
import pathlib
import re

ROOT = pathlib.Path(__file__).parents[2]
JAVA = sorted((ROOT / "apps/core/src/main/java").rglob("*.java"))
WEB = [p for p in sorted((ROOT / "apps/web/src").glob("*.ts*")) if ".test." not in p.name]

MAPPING = re.compile(r'@(Get|Post|Put|Delete|Patch)Mapping(?:\(\s*(?:value\s*=\s*)?"([^"]*)"[^)]*\))?')
CLASS_BASE = re.compile(r'@RequestMapping\(\s*"([^"]*)"')


def core_routes():
    routes = set()
    for path in JAVA:
        text = path.read_text(encoding="utf-8")
        base = (CLASS_BASE.search(text) or [None, ""])[1]
        for method, sub in MAPPING.findall(text):
            pattern = re.sub(r"\{[^/}]+\}", "[^/]+", base + sub)
            routes.add((method.upper(), re.compile(pattern + "$")))
    return routes


def web_calls():
    calls = []
    call = re.compile(r"""(?P<fn>send|getText|get|useLoad)\s*(?:<[^()]*?>)?\(\s*(?P<q>[`'"])(?P<url>/[^`'"]*)(?P=q)(?P<rest>[^)]{0,80})""")
    section = re.compile(r"""path=\{`(?P<url>/[^`]*)`\}""")
    for path in WEB:
        text = path.read_text(encoding="utf-8")
        for m in call.finditer(text):
            method = "GET"
            if m["fn"] == "send":
                method = "PUT" if "'PUT'" in m["rest"] else "POST"
            calls.append((path.name, method, m["url"]))
        calls += [(path.name, "GET", m["url"]) for m in section.finditer(text)]
    return calls


def shape(url):
    url = url.split("?")[0]
    url = re.sub(r"\$\{[^}]*\}", "x", url)
    return url.split("${")[0]   # a call that goes on with a nested template (a query part) is cut there


def test_there_are_routes_and_calls_to_check():
    assert len(core_routes()) > 50 and len(web_calls()) > 50


def test_every_web_call_has_a_core_route():
    routes = core_routes()
    missing = [f"{f}: {method} /api{url}" for f, method, url in web_calls()
               if not any(m == method and rx.match("/api" + shape(url)) for m, rx in routes)]
    assert not missing, "\n".join(missing)
