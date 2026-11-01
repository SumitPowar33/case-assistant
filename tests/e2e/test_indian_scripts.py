"""Indian-language rendering (TESTING.md, "Not covered yet" 5): every screen language drawn in a real browser. For each
of the 10 languages and the main screens: the page says its language (lang), every piece of Indian-script text that is
drawn uses the app's own fonts (so no empty boxes, whatever fonts the PC has), and nothing is cut off or makes the page
wider than a desktop window. Before 1 Nov 2026 (session 45) the screens used whatever font the machine had: on this
machine Telugu, Kannada and Gujarati fell back to Unifont, a last-resort bitmap font; without it they are empty boxes.
Fictional data only."""

from playwright.sync_api import expect

from test_load_data import setup_station, sign_in

# the scripts of the 10 languages of the national module (Unicode blocks)
SCRIPTS = {"hi": "ऀ-ॿ", "mr": "ऀ-ॿ", "bn": "ঀ-৿", "pa": "਀-੿", "gu": "઀-૿",
           "or": "଀-୿", "ta": "஀-௿", "te": "ఀ-౿", "kn": "ಀ-೿", "ml": "ഀ-ൿ"}
SCREENS = ("#/", "#/front-desk", "#/type", "#/policies", "#/password")
WIDTH = 1280   # a station desktop

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
  for (const el of document.body.querySelectorAll('*')) {
    const s = getComputedStyle(el)
    if ((s.overflowX === 'hidden' || s.overflowX === 'clip' || s.textOverflow === 'ellipsis') && el.scrollWidth > el.clientWidth + 1
        && !el.classList.contains('visually-hidden')) clipped.push(el.textContent.trim().slice(0, 40))
  }
  return { marked, clipped, pageWidth: document.documentElement.scrollWidth }
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


def test_every_screen_language_is_drawn_with_real_glyphs_and_fits(core, page):
    accounts = setup_station(core, "scripts", roles=("sho",))
    page.set_viewport_size({"width": WIDTH, "height": 900})
    sign_in(page, "sho.scripts", accounts["sho.scripts"])
    cdp = page.context.new_cdp_session(page)
    cdp.send("DOM.enable")
    cdp.send("CSS.enable")
    problems = []
    for lang, script in SCRIPTS.items():
        page.locator("header select").first.select_option(lang)   # its label is in the language chosen
        expect(page.locator("html")).to_have_attribute("lang", lang)
        for screen in SCREENS:
            page.evaluate(f"location.hash = '{screen}'")
            page.wait_for_load_state("networkidle")
            page.evaluate("document.fonts.ready")
            seen = read_screen(page, cdp, script)
            if not seen["marked"]:
                problems.append(f"{lang} {screen}: no text in the language at all")
            for text, fonts in zip(seen["marked"], seen["fonts"]):
                ours = [f for f in fonts if f["isCustomFont"] and f["familyName"].startswith("Noto Sans")]
                if not ours:   # drawn with a font of the machine, or with no font at all (empty boxes)
                    problems.append(f"{lang} {screen}: {text!r} drawn with {[f['familyName'] for f in fonts] or 'no font'}")
            problems += [f"{lang} {screen}: cut off: {t!r}" for t in seen["clipped"]]
            if seen["pageWidth"] > WIDTH:
                problems.append(f"{lang} {screen}: the page is {seen['pageWidth']} px wide in a {WIDTH} px window")
    assert not problems, "\n".join(problems[:40]) + f"\n({len(problems)} in all)"
