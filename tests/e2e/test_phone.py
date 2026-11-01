"""The app on a phone (Sumit, 1 Nov 2026: officers use it in the field): a 390 x 844 screen with touch, the demo case.
The menu folds away behind one button; everything to tap is at least 44 px high (checkboxes 24 px), text fields use
16 px so the phone does not zoom in; the FIR and complaint lists are cards, one per row, each value with its column
name; nothing makes the page wider than the screen. Fictional data only."""
import sys

from playwright.sync_api import expect

from conftest import ROOT

sys.path.insert(0, str(ROOT / "scripts"))
from demo_case import load_demo  # noqa: E402

# every control in the page that is drawn and too small to tap, or a text field in a font the phone zooms into
SMALL = """() => {
  const out = []
  for (const el of document.querySelectorAll('button, select, input, textarea, summary, nav a, table.cards a')) {
    if (!el.checkVisibility() || el.closest('.visually-hidden')) continue
    const r = el.getBoundingClientRect(), s = getComputedStyle(el)
    const box = el.type === 'checkbox' || el.type === 'radio' ? 24 : 44
    const name = el.tagName.toLowerCase() + ' ' + (el.textContent || el.getAttribute('aria-label') || el.name || '').trim().slice(0, 30)
    if (r.height < box - 0.5) out.push(`${name}: ${Math.round(r.height)} px high`)
    if (/^(input|select|textarea)$/i.test(el.tagName) && box === 44 && parseFloat(s.fontSize) < 16) out.push(`${name}: font ${s.fontSize}`)
  }
  return { small: out, pageWidth: document.documentElement.scrollWidth }
}"""


def test_an_officer_can_use_the_case_on_a_phone(core, page):
    api, admin, password = core
    demo = load_demo(api.base, admin, password, tag="phone")
    page.set_viewport_size({"width": 390, "height": 844})
    problems = []

    def check(where):
        page.wait_for_load_state("networkidle")
        expect(page.get_by_text("Loading…", exact=True)).to_have_count(0)
        seen = page.evaluate(SMALL)
        problems.extend(f"{where}: {p}" for p in seen["small"])
        if seen["pageWidth"] > 390:
            problems.append(f"{where}: the page is {seen['pageWidth']} px wide")

    check("sign-in")
    page.get_by_label("Username").fill("io.phone")
    page.get_by_label("Password").fill(demo["accounts"]["io.phone"])
    page.get_by_role("button", name="Sign in").click()

    # the menu is one button; the header stays short
    menu = page.get_by_role("button", name="Menu")
    expect(menu).to_have_attribute("aria-expanded", "false")
    expect(page.get_by_role("navigation", name="Main")).to_be_hidden()
    assert page.locator("header").bounding_box()["height"] < 160
    menu.click()
    nav = page.get_by_role("navigation", name="Main")
    expect(nav).to_be_visible()
    check("menu open")
    nav.get_by_role("link", name="FIRs").click()
    expect(nav).to_be_hidden()   # choosing a screen folds the menu again

    # the FIR list: one card per FIR, each value with its column name, no sideways scrolling
    card = page.locator("table.cards tbody tr").first
    expect(card).to_contain_text("1/")
    assert page.evaluate("getComputedStyle(document.querySelector('table.cards tr td'), '::before').content").startswith('"FIR')
    assert card.bounding_box()["width"] <= 390 - 16
    check("FIR list")

    card.get_by_role("link").click()
    expect(page.get_by_role("main")).to_contain_text("Rs 40,000 went out of my account by UPI")
    check("FIR screen")
    page.locator("summary").first.click()   # a folded form, open
    check("FIR screen, form open")

    for screen in ("#/front-desk", f"#/complaints/{demo['complaint_id']}", "#/type", "#/policies", "#/password"):
        page.evaluate(f"location.hash = '{screen}'")
        check(screen.split("/")[1])
    assert not problems, "\n".join(problems)
