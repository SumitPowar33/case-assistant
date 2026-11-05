"""Indian-language rendering (TESTING.md, "Not covered yet" 5): every screen language drawn in a real browser. For each
of the 10 languages and the main screens: the page says its language (lang), every piece of Indian-script text that is
drawn uses the app's own fonts (so no empty boxes, whatever fonts the PC has), and nothing is cut off or makes the page
wider than the window, on a desktop (1280 px) and a phone (390 px). Before 1 Nov 2026 (session 45) the screens used whatever font the machine had: on this
machine Telugu, Kannada and Gujarati fell back to Unifont, a last-resort bitmap font; without it they are empty boxes.
The case screens use the demo case (scripts/demo_case.py). On a phone the header did not wrap
(845 px wide) and long Tamil or Malayalam form labels and tables pushed the page wider until session 46. Fictional data only."""

import pytest
from playwright.sync_api import expect

import json
import sys

from conftest import ROOT
from test_load_data import sign_in

sys.path.insert(0, str(ROOT / "scripts"))
from demo_case import load_demo  # noqa: E402

# the scripts of the 10 languages of the national module (Unicode blocks)
SCRIPTS = {"hi": "ऀ-ॿ", "mr": "ऀ-ॿ", "bn": "ঀ-৿", "pa": "਀-੿", "gu": "઀-૿",
           "or": "଀-୿", "ta": "஀-௿", "te": "ఀ-౿", "kn": "ಀ-೿", "ml": "ഀ-ൿ"}
SCREENS = ("#/", "#/front-desk", "#/type", "#/policies", "#/password", "#/property", "#/expert")
WIDTHS = (1280, 390)   # a station desktop, a phone

# wraps every drawn text node in the script (not those in a closed <details>) in a span[data-script] (CDP reports fonts only for the text directly inside an
# element laid out inline; a label laid out as a grid reports none) and gives what is cut off and how wide the page is
MARK = """(range) => {
  const re = new RegExp('[' + range + ']'), marked = [], clipped = []
  window.__wrapped = []
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  const texts = []
  for (let t = walk.nextNode(); t; t = walk.nextNode())
    if (re.test(t.textContent) && t.parentElement.checkVisibility() && !t.parentElement.closest('option, select, textarea, script, style')) texts.push(t)
  for (const t of texts) {
    const span = document.createElement('span')
    span.dataset.script = ''
    t.before(span)
    span.append(t)
    window.__wrapped.push(span)
    marked.push(t.textContent.trim().slice(0, 40))
  }
  // only what is drawn (not a field in a closed <details>); text kept for screen readers only (.visually-hidden, the column heads of a card list on a phone)
  const hiddenOnPurpose = (el) => { for (let a = el; a && a !== document.body; a = a.parentElement) if (getComputedStyle(a).clip !== 'auto') return true; return false }
  for (const el of document.body.querySelectorAll('*')) {
    const s = getComputedStyle(el)
    if ((s.overflowX === 'hidden' || s.overflowX === 'clip' || s.textOverflow === 'ellipsis') && el.scrollWidth > el.clientWidth + 1
        && el.checkVisibility() && !hiddenOnPurpose(el)) clipped.push(el.textContent.trim().slice(0, 40))
  }
  // the innermost elements that reach past the window's right edge: what makes the page too wide
  const wide = [...document.body.querySelectorAll('*')].filter(el => el.getBoundingClientRect().right > innerWidth + 1
    && ![...el.children].some(c => c.getBoundingClientRect().right > innerWidth + 1)
    && !el.closest('.visually-hidden')).map(el => el.tagName.toLowerCase() + (el.className ? '.' + el.className : '') + ' ' + el.textContent.trim().slice(0, 30))
  return { marked, clipped, wide: [...new Set(wide)].slice(0, 5), pageWidth: document.documentElement.scrollWidth }
}"""
# puts the text nodes back where they were, so the page (React) finds them unchanged
UNMARK = "() => { for (const span of window.__wrapped || []) span.replaceWith(...span.childNodes); window.__wrapped = [] }"


def read_screen(page, cdp, script):
    """MARK, then the fonts drawing each marked text in document order; read again if the screen changed meanwhile
    (a list that finished loading, a clock)."""
    for _ in range(5):
        seen = page.evaluate(MARK, script)
        try:
            root = cdp.send("DOM.getDocument", {"depth": 0})["root"]["nodeId"]
            nodes = cdp.send("DOM.querySelectorAll", {"nodeId": root, "selector": "[data-script]"})["nodeIds"]
            seen["fonts"] = [cdp.send("CSS.getPlatformFontsForNode", {"nodeId": n})["fonts"] for n in nodes]
        except Exception:   # a node went away
            page.wait_for_timeout(300)
            continue
        finally:
            page.evaluate(UNMARK)
        if len(nodes) == len(seen["marked"]):
            return seen
    raise AssertionError("the screen kept changing while it was read")


@pytest.mark.parametrize("width", WIDTHS)
def test_every_screen_language_is_drawn_with_real_glyphs_and_fits(core, page, width):
    api, admin, password = core
    demo = load_demo(api.base, admin, password, tag=f"scripts{width}")   # a case with records, so the FIR screen is full
    # one seized item with a hand-over, so the case property register has a row to draw in every language
    io = api.token(f"io.scripts{width}", demo["accounts"][f"io.scripts{width}"])
    item = api.call("POST", f"/api/firs/{demo['fir_id']}/evidence", {"label": "P1", "description": "Fictional iron rod", "kind": "physical",
                                                                     "seizedAt": "2026-10-30T12:00:00+05:30", "seizureMemo": "Seizure memo SM-9 (fictional)"}, io)[1]
    assert api.call("POST", f"/api/firs/{demo['fir_id']}/evidence/{item['id']}/custody", {
        "at": "2026-10-30T13:00:00+05:30", "handedBy": "SI Fictional", "receivedBy": "HC Fictional Store", "location": "Fictional lab",
        "purpose": "Analysis", "sealIntact": False, "place": "lab"}, io)[0] == 201
    # and one lab request with a late reminder mark, so the requests screen has a row too
    assert api.call("POST", f"/api/firs/{demo['fir_id']}/expert-requests", {
        "kind": "forensic", "subject": "Fictional handwriting comparison", "sentTo": "Fictional examiner", "date": "2026-08-01"}, io)[0] == 201
    screens = SCREENS + (f"#/firs/{demo['fir_id']}", f"#/complaints/{demo['complaint_id']}")
    fir = f"#/firs/{demo['fir_id']}"
    views = [(sc, None) for sc in screens]
    if width < 640:
        views[screens.index(fir) + 1:screens.index(fir) + 1] = [(fir, i) for i in range(1, 9)]
    page.set_viewport_size({"width": width, "height": 900})
    sign_in(page, f"sho.scripts{width}", demo["accounts"][f"sho.scripts{width}"])
    problems = language_problems(page, views, width)
    assert not problems, "\n".join(problems[:40]) + f"\n({len(problems)} in all)"


def language_problems(page, views, width):
    """Signed in already: for each of the 10 languages, chosen in the header, every view (a screen, or a part of the FIR
    screen on a phone) read for its lang, its fonts, cut-off text and page width; gives the problems found."""
    cdp = page.context.new_cdp_session(page)
    cdp.send("DOM.enable")
    cdp.send("CSS.enable")
    problems = []
    for lang, script in SCRIPTS.items():
        if page.locator(".menu-toggle").is_visible():   # a phone: the language choice is in the folded menu
            page.locator(".menu-toggle").click()
        page.locator("header select").first.select_option(lang)   # its label is in the language chosen
        expect(page.locator("html")).to_have_attribute("lang", lang)
        catalog = json.loads((ROOT / f"apps/web/src/i18n/{lang}.json").read_text())
        loading = catalog.get("common.loading") or "Loading…"
        for screen, part in views:
            if part is None:
                page.evaluate(f"location.hash = '{screen}'")
            else:   # a phone shows one part of the FIR screen at a time (FirDetail.tsx): read each
                page.locator(".fir-parts select").select_option(index=part)
                screen = f"{screen} part {part}"
            page.wait_for_load_state("networkidle")
            expect(page.get_by_text(loading, exact=True)).to_have_count(0)   # the screen's data has arrived
            page.evaluate("document.fonts.ready")
            seen = read_screen(page, cdp, script)
            if not seen["marked"]:
                problems.append(f"{lang} {screen}: no text in the language at all")
            for text, fonts in zip(seen["marked"], seen["fonts"]):
                ours = [f for f in fonts if f["isCustomFont"] and f["familyName"].startswith("Noto Sans")]
                if not ours:   # drawn with a font of the machine, or with no font at all (empty boxes)
                    problems.append(f"{lang} {screen}: {text!r} drawn with {[f['familyName'] for f in fonts] or 'no font'}")
            problems += [f"{lang} {screen}: cut off: {t!r}" for t in seen["clipped"]]
            if seen["pageWidth"] > width:
                problems.append(f"{lang} {screen}: the page is {seen['pageWidth']} px wide in a {width} px window: {seen['wide']}")
    return problems
