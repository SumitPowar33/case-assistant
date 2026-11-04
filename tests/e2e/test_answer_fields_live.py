"""Contract between the web app and the core, the run-time half (TESTING.md, "Not covered yet" 3): the answers the core
really sends while the screens are used. tests/repo_rules/test_web_answer_fields.py reads the source and so only knows
that the server writes a field name somewhere; a name written in another answer, or only read, passes it (session 44's
`within_minutes`). Here the browser goes through the demo case's screens as the case team, the front desk and the
platform admin, every JSON answer of a GET /api route is kept, and every field the screen's type says is always there
(not `name?:`) must be a key of that answer, also inside the objects and lists it holds. Fictional data only."""
import datetime as dt
import re
import sys

from playwright.sync_api import expect

from conftest import ROOT
from test_load_data import sign_in

sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(ROOT / "tests/repo_rules"))
from demo_case import load_demo  # noqa: E402
from test_web_answer_fields import closing, members, read_types, type_literal  # noqa: E402


def url_pattern(url):
    """The web app's URL template (`/firs/${id}/arrests`) as a regex for a real /api path."""
    path = url.split("?")[0]
    parts = re.split(r"\$\{[^}]*\}", path)
    return re.compile("^/api" + "[^/]+".join(re.escape(p) for p in parts) + "$")


def inner_literal(kind, text):
    """The object type inside a field's type: an inline {...} (also in a list), or a type of the same file."""
    i = kind.find("{")
    if i != -1:
        return kind[i:closing(kind, i)]
    for ref in re.findall(r"\b([A-Z]\w*)\b", kind):
        found = type_literal(ref, text)
        if found:
            return found
    return None


def missing_fields(value, literal, text, where, depth=0):
    """Where the answer lacks a field the type says is always there."""
    if isinstance(value, list):
        return [m for v in value for m in missing_fields(v, literal, text, where + "[]", depth)]
    if not isinstance(value, dict) or depth > 3:
        return []
    out = []
    for name, kind in members(literal):
        optional = re.search(r"\b" + name + r"\?\s*:", literal)
        if name not in value:
            if not optional:
                out.append(f"{where}.{name}")
            continue
        inner = inner_literal(kind, text)
        if inner and isinstance(value[name], (dict, list)):
            out += missing_fields(value[name], inner, text, f"{where}.{name}", depth + 1)
    return out


def me_io(api, token):
    return api.call("GET", "/api/me", token=token)[1]["id"]


def test_every_field_a_screen_expects_is_in_the_real_answer(core, page):
    api, admin, password = core
    demo = load_demo(api.base, admin, password, tag="live")
    # one complaint still open, so the front desk's list has a row to check
    desk = api.token("front_desk.live", demo["accounts"]["front_desk.live"])
    status, me = api.call("GET", "/api/me", token=desk)
    status, _ = api.call("POST", "/api/complaints", {"stationId": me["station_id"], "receivedAt": "2026-10-30T10:00:00+05:30", "mode": "written",
                                                     "informantName": "Fictional Second Informant", "kind": "other", "text": "Fictional lost wallet.",
                                                     "textLanguage": "en"}, desk)
    assert status == 201
    # records the demo leaves empty, so their reads have an answer to check: a victim update and a chargesheet on the demo
    # FIR, and a second FIR closed by a closure report that was corrected once and decided by the Magistrate
    io = api.token("io.live", demo["accounts"]["io.live"])
    case = f"/api/firs/{demo['fir_id']}"
    status, people = api.call("GET", f"{case}/people", token=io)
    accused = [p["id"] for p in people if p["role"] == "accused"]
    # the demo FIR is registered a few days before today (India time), so these days follow today, not a fixed date
    today = dt.datetime.now(dt.timezone(dt.timedelta(hours=5, minutes=30))).date().isoformat()
    for path, body in ((f"{case}/victim-updates", {"givenOn": today, "toldTo": "informant", "means": "phone"}),
                       (f"{case}/chargesheets", {"filedOn": today, "court": "Fictional JMFC Court", "reportNo": "CS-1/2026",
                                                 "accusedIds": accused})):
        status, body = api.call("POST", path, body, io)
        assert status == 201, (path, body)
    status, fir2 = api.call("POST", "/api/firs", {"stationId": me["station_id"], "firYear": 2026, "firNo": 2, "gdEntryNo": "GD-20",
                                                   "registeredAt": "2026-10-20T10:00:00+05:30", "actionTaken": "investigate", "ioId": me_io(api, io),
                                                   "contentsOriginal": "Fictional theft of a bicycle.", "contentsLanguage": "en",
                                                   "informationReceivedAt": "2026-10-20T09:30:00+05:30", "sections": [{"act": "BNS", "section": "303(2)"}]}, desk)
    assert status == 201, fir2
    closed = f"/api/firs/{fir2['id']}/closure-report"
    report = {"filedOn": "2026-10-30", "court": "Fictional JMFC Court", "reportNo": "CR-1/2026", "ground": "untraced",
              "reason": "Fictional: no trace of the bicycle after search.", "informantInformedOn": "2026-10-30"}
    for path, body in ((closed, report),
                       (f"{closed}/corrections", {**report, "reportNo": "CR-2/2026", "correctionReason": "Fictional: report number typed wrong"}),
                       (f"{closed}/decision", {"decision": "accepted", "decidedOn": "2026-10-31", "note": "Fictional order"})):
        status, body = api.call("POST", path, body, io)
        assert status in (200, 201), (path, body)
    answers = []

    def keep(response):
        path = response.url.split("://", 1)[1].split("/", 1)[1].split("?")[0]
        if response.request.method == "GET" and path.startswith("api/") and response.ok and "json" in (response.headers.get("content-type") or ""):
            answers.append(("/" + path, response.json()))
    page.on("response", keep)

    fir, complaint = f"#/firs/{demo['fir_id']}", f"#/complaints/{demo['complaint_id']}"
    visits = {"sho.live": ("#/", fir, complaint, "#/front-desk", "#/policies", "#/type", "#/import"),
              "io.live": (fir, f"#/firs/{fir2['id']}"), "front_desk.live": ("#/front-desk", complaint)}
    for username, screens in visits.items():
        sign_in(page, username, demo["accounts"][username])
        for screen in screens:
            page.evaluate(f"location.hash = '{screen}'")
            page.wait_for_load_state("networkidle")
            expect(page.get_by_text("Loading…", exact=True)).to_have_count(0)
        page.get_by_role("button", name="Sign out").click()
    sign_in(page, admin, password)
    for screen in ("#/admin", "#/policies"):
        page.evaluate(f"location.hash = '{screen}'")
        page.wait_for_load_state("networkidle")
        expect(page.get_by_text("Loading…", exact=True)).to_have_count(0)

    reads = [(name, url, url_pattern(url), literal, text) for name, url, literal, text in read_types() if not url.startswith(("/v1/", "/health"))]
    problems, checked = [], set()
    for path, body in answers:
        for name, url, rx, literal, text in reads:
            if rx.match(path) and body not in ([], {}):
                checked.add(url)
                problems += [f"{name}: {url} expects {m}, not in the answer of {path}" for m in missing_fields(body, literal, text, "answer")]
    assert not problems, "\n".join(sorted(set(problems)))
    for url in ("/firs/${firId}/chargesheets", "/firs/${firId}/closure-report", "/firs/${firId}/closure-report/corrections",
                "/firs/${firId}/victim-updates"):
        assert url in checked, f"{url} had no real answer to check"
    assert len(checked) >= 28, f"only {len(checked)} typed reads had a real answer to check: {sorted(checked)}"
