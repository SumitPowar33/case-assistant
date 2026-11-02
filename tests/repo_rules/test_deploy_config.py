"""The web server file for an installation (deploy/nginx.conf) stays in step with the app (security review, 2 Nov 2026):
the same Content-Security-Policy as the built page, HTTPS only, the body cap of an import, and the client address
forwarded as nginx saw it. tests/e2e/test_https_proxy.py also runs it in a real nginx."""
import re

from test_web_core_contract import ROOT

CONF = (ROOT / "deploy/nginx.conf").read_text(encoding="utf-8")
VITE = (ROOT / "apps/web/vite.config.ts").read_text(encoding="utf-8")
BODY_LIMIT = (ROOT / "apps/core/src/main/java/in/caseassistant/BodyLimit.java").read_text(encoding="utf-8")


def page_policy():
    return "; ".join(re.findall(r'"([^"]+)"', re.search(r"CONTENT_POLICY = \[(.*?)\]\.join", VITE, re.S).group(1)))


def test_the_header_policy_is_the_page_policy_plus_framing():
    header = re.search(r'add_header Content-Security-Policy "([^"]+)" always;', CONF).group(1)
    assert header == page_policy() + "; frame-ancestors 'none'"


def test_https_only_with_modern_tls():
    assert "return 301 https://$host$request_uri;" in CONF
    assert re.search(r"add_header Strict-Transport-Security \"max-age=(\d+)\" always;", CONF)
    assert "ssl_protocols TLSv1.2 TLSv1.3;" in CONF and "TLSv1.1" not in CONF and "TLSv1 " not in CONF
    assert "server_tokens off;" in CONF


def test_the_import_cap_and_the_forwarded_address_match_the_core():
    mib = int(re.search(r"IMPORT_LIMIT = (\d+)L << 20", BODY_LIMIT).group(1))
    assert f"client_max_body_size {mib}m;" in CONF
    # replaced, never appended ($proxy_add_x_forwarded_for would keep an address the client made up)
    assert CONF.count("proxy_set_header X-Forwarded-For $remote_addr;") == 2 and "proxy_add_x_forwarded_for" not in CONF
    assert "proxy_pass http://127.0.0.1:8080;" in CONF and "proxy_pass http://127.0.0.1:8000/;" in CONF
