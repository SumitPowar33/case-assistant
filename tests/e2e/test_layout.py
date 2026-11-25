"""The layout of every screen the IO can open, on a desktop (1440 px) and a phone (390 px), on the demo case: nothing
sticks out of the page or of the content column, and every form opened from its button is a panel inside the screen
whose title fits its head, whose fields stay inside it, whose labels each name a field and whose Save button is in
view. Fictional data only."""
import sys

from playwright.sync_api import expect

from conftest import ROOT
from test_load_data import sign_in

sys.path.insert(0, str(ROOT / "scripts"))
from demo_case import load_demo  # noqa: E402

# the problems on the screen now, opening each form panel in turn (and closing it again)
AUDIT = """async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms))
  const vw = document.documentElement.clientWidth, vh = innerHeight, out = []
  const text = (el) => (el.textContent || el.getAttribute('aria-label') || el.name || '').trim().slice(0, 30)
  if (document.documentElement.scrollWidth > vw) out.push(`page ${document.documentElement.scrollWidth} px wide`)
  const main = document.querySelector('main').getBoundingClientRect()
  // inside a box that scrolls sideways (a wide table on a phone, index.css) is not out of the page
  const scrolled = (el) => { for (let p = el.parentElement; p; p = p.parentElement) if (/auto|scroll|hidden/.test(getComputedStyle(p).overflowX)) return true; return false }
  for (const el of document.querySelectorAll('main *')) {
    if (!el.checkVisibility() || el.closest('details:has(> .record-form)') || scrolled(el)) continue
    const r = el.getBoundingClientRect()
    if (r.width && r.right > main.right + 1) { out.push(`${el.tagName.toLowerCase()} "${text(el)}" sticks out of the page`); break }
  }
  for (const d of document.querySelectorAll('details:has(> .record-form)')) {
    if (!d.checkVisibility()) continue
    const head = d.querySelector(':scope > summary'), name = text(head)
    d.open = true
    await sleep(100)
    const f = d.querySelector(':scope > .record-form'), fr = f.getBoundingClientRect()
    if (fr.left < 0 || fr.right > vw + 1) out.push(`${name}: the panel is off the screen`)
    if (f.scrollWidth > f.clientWidth + 1) out.push(`${name}: the panel scrolls sideways`)
    for (const c of f.querySelectorAll('input, select, textarea, button, label, fieldset, table, p')) {
      const r = c.getBoundingClientRect()
      if (c.checkVisibility() && (r.right > fr.right + 1 || r.left < fr.left - 1)) { out.push(`${name}: "${text(c)}" is outside the panel`); break }
    }
    const range = document.createRange()
    range.selectNodeContents(head)
    const title = range.getBoundingClientRect()
    if (title.bottom > fr.top + 1 || title.left < fr.left - 1) out.push(`${name}: the title does not fit the panel's head`)
    for (const l of f.querySelectorAll('label')) if (l.checkVisibility() && !l.control) { out.push(`${name}: label "${text(l)}" names no field`); break }
    const save = [...f.querySelectorAll('button[type=submit]')].filter((b) => b.checkVisibility()).at(-1)
    if (!save) out.push(`${name}: no Save button`)
    else if (save.getBoundingClientRect().bottom > vh) out.push(`${name}: Save is below the screen`)
    d.open = false
  }
  return out
}"""


def test_every_screen_and_form_fits_on_a_desktop_and_a_phone(core, page):
    api, admin, password = core
    demo = load_demo(api.base, admin, password, tag="layout")
    sign_in(page, "io.layout", demo["accounts"]["io.layout"])
    page.goto(page.url.split("#")[0] + f"#/firs/{demo['fir_id']}")
    expect(page.get_by_role("main")).to_contain_text("Rs 40,000 went out of my account by UPI")
    # the screens of the menu (on a phone folded away, still in the page), with the open case's parts
    screens = page.eval_on_selector_all("#header-menu nav a", "as => [...new Set(as.map((a) => a.getAttribute('href')))]")
    assert len(screens) > 15 and any(s.endswith("/evidence") for s in screens), screens

    problems = []
    for width, height in ((1440, 900), (390, 844)):
        page.set_viewport_size({"width": width, "height": height})
        for href in screens:
            page.evaluate("h => { location.hash = h }", href)
            page.wait_for_load_state("networkidle")
            expect(page.get_by_text("Loading…", exact=True)).to_have_count(0)
            problems += [f"{width} px {href.replace(demo['fir_id'], 'FIR')}: {p}" for p in page.evaluate(AUDIT)]
    assert not problems, "\n".join(problems)
