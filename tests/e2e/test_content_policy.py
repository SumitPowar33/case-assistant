"""The built web app carries a Content-Security-Policy (security review, 2 Nov 2026): only the app's own scripts, styles,
fonts and servers, so text that ever slipped into a page as markup could not run or send case data elsewhere. The real
screens must work under it: no violation while an officer signs in and opens the main screens. Fictional data only."""
from playwright.sync_api import expect

from test_load_data import setup_station, sign_in


def test_the_app_runs_under_its_content_security_policy(core, page):
    policy = page.locator('meta[http-equiv="Content-Security-Policy"]').get_attribute("content")
    for rule in ("default-src 'self'", "script-src 'self'", "object-src 'none'", "base-uri 'none'", "connect-src 'self'"):
        assert rule in policy
    assert "unsafe-inline" not in policy.split("style-src")[0] and "unsafe-eval" not in policy
    page.evaluate("window.__violations = []; document.addEventListener('securitypolicyviolation', e => window.__violations.push(e.violatedDirective + ' ' + e.blockedURI))")
    accounts = setup_station(core, "csp", roles=("sho",))
    sign_in(page, "sho.csp", accounts["sho.csp"])
    for screen in ("#/firs", "#/front-desk", "#/type", "#/policies", "#/import", "#/reads", "#/password"):
        page.goto(page.url.split("#")[0] + screen)
        expect(page.locator("main")).to_be_visible()
    # an inline script put into the page is refused by the browser
    page.evaluate("const s = document.createElement('script'); s.textContent = 'window.__ran = 1'; document.body.appendChild(s)")
    assert page.evaluate("window.__ran") is None
    assert [v for v in page.evaluate("window.__violations") if not v.startswith("script-src")] == []
