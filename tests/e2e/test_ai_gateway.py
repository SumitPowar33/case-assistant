"""The real AI gateway against the real core app: every audit row moves the chain head the core keeps (V35), the
admin's settings screen shows the check, and an older copy of the gateway's audit file put back fails it.
Offline `fake` provider only; fictional data; the signing keys are made up for this run."""
import contextlib
import os
import secrets
import shutil
import subprocess
import time
import urllib.request

import psycopg
from playwright.sync_api import expect, sync_playwright

from conftest import PG, ROOT, Api, free_port, running_core, serving_web
from test_load_data import sign_in

DB = "caseapp_e2e_ai"


@contextlib.contextmanager
def running_gateway(core_base, secret, path, log_name):
    port = free_port()
    env = {**os.environ, "AUTH_SECRET": secret, "CORE_URL": core_base, "AI_GATEWAY_DB": str(path),
           "AI_AUDIT_KEY": "e2e-only-audit-key-" + "x" * 20, "AI_GATEWAY_AUTOSTART": "1"}
    log = open(ROOT / f"apps/core/target/{log_name}", "w")
    proc = subprocess.Popen(["python", "-m", "uvicorn", "app.main:app", "--port", str(port)], cwd=ROOT / "services/ai-gateway",
                            env=env, stdout=log, stderr=subprocess.STDOUT)
    gw = Api(f"http://127.0.0.1:{port}")
    try:
        deadline = time.time() + 30
        while True:
            assert proc.poll() is None, f"the AI gateway stopped at start-up, see {log.name}"
            try:
                with urllib.request.urlopen(gw.base + "/health", timeout=2):
                    break
            except OSError:
                assert time.time() < deadline, f"the AI gateway did not start in 30 s, see {log.name}"
                time.sleep(0.3)
        yield gw
    finally:
        proc.terminate()
        proc.wait(timeout=30)
        log.close()


def ask(gw, token):
    status, body = gw.call("POST", "/v1/generate", {"feature": "case_qa", "prompt": "Fictional question", "prompt_version": "e2e@1",
                                                     "provider": "fake"}, token)
    assert status == 200, body
    return body


def anchored():
    with psycopg.connect(dbname=DB, **PG) as c:
        return c.execute("select max(seq) from ai_chain_anchor").fetchone()[0]


def settings_screen_says(web, admin, password, text):
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.set_default_timeout(15000)
        page.goto(web)
        sign_in(page, admin, password)
        page.get_by_role("link", name="AI settings").click()
        expect(page.get_by_text(text)).to_be_visible()
        browser.close()


def test_the_core_keeps_the_gateways_chain_head_and_an_older_audit_file_fails_the_check(tmp_path):
    secret = secrets.token_urlsafe(48)
    audit_file, copy = tmp_path / "gateway.sqlite3", tmp_path / "older-copy.sqlite3"
    with running_core(DB, secret=secret) as (api, admin, password):
        token = api.token(admin, password)
        with running_gateway(api.base, secret, audit_file, "e2e-gateway-1.log") as gw:
            ask(gw, token)
            assert anchored() == 1
            shutil.copy(audit_file, copy)   # someone keeps a copy of the file here
            draft = ask(gw, token)
            assert gw.call("POST", "/v1/decisions", {"request_id": draft["request_id"], "decision": "rejected", "feature": "case_qa"}, token)[0] == 200
            assert anchored() == 3
            status, audit = gw.call("GET", "/v1/audit", None, token)
            assert status == 200 and audit["chain_ok"] is True and audit["anchored_seq"] == 3
            # an officer cannot move the head without the gateway's key
            assert api.call("POST", "/api/ai-chain-head", {"seq": 99, "hash": "a" * 64}, token)[0] == 403
            with serving_web(api.base, gw.base) as web:
                settings_screen_says(web, admin, password, "Audit log check: intact.")
        shutil.copy(copy, audit_file)       # ... and puts it back
        with running_gateway(api.base, secret, audit_file, "e2e-gateway-2.log") as gw:
            status, audit = gw.call("GET", "/v1/audit", None, token)
            assert status == 200 and audit["chain_ok"] is False and audit["anchored_seq"] == 3
            with serving_web(api.base, gw.base) as web:
                settings_screen_says(web, admin, password, "Audit log check: broken.")
