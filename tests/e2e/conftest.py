"""End-to-end browser tests: the real core app on a throwaway database, the built web app, Chromium (Playwright).

What runs: a fresh PostgreSQL database `caseapp_e2e` (dropped and created for each run), the core jar
(apps/core/target/core-*.jar; built with `mvn -DskipTests package` if missing) on a free port, and the built web app
(apps/web/dist; `npm run build`) served by a small server here that passes /api to the core, as Vite does in development.
All data is fictional. The signing key and passwords are made up for each run and never stored.
"""
import contextlib
import glob
import http.server
import json
import os
import secrets
import socket
import subprocess
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

import psycopg
import pytest

ROOT = Path(__file__).resolve().parents[2]
DIST = ROOT / "apps/web/dist"
DB = "caseapp_e2e"
PG = dict(host=os.environ.get("PGHOST", "localhost"), user=os.environ.get("DATABASE_USER", "caseapp"),
          password=os.environ.get("DATABASE_PASSWORD", "caseapp"))


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def core_jar():
    jars = [j for j in glob.glob(str(ROOT / "apps/core/target/core-*.jar")) if not j.endswith("-plain.jar")]
    if not jars:
        subprocess.run(["mvn", "-B", "-q", "-DskipTests", "-f", str(ROOT / "apps/core/pom.xml"), "package"], check=True)
        jars = glob.glob(str(ROOT / "apps/core/target/core-*.jar"))
    return jars[0]


class Api:
    """Plain HTTP calls to the core app, for setting up accounts and checking what the screens did."""

    def __init__(self, base):
        self.base = base

    def call(self, method, path, body=None, token=None):
        req = urllib.request.Request(self.base + path, method=method, data=None if body is None else json.dumps(body).encode())
        req.add_header("content-type", "application/json")
        if token:
            req.add_header("authorization", "Bearer " + token)
        try:
            with urllib.request.urlopen(req, timeout=10) as res:
                text = res.read().decode()
                return res.status, (json.loads(text) if text else None)
        except urllib.error.HTTPError as e:
            return e.code, e.read().decode()

    def token(self, username, password):
        status, body = self.call("POST", "/api/login", {"username": username, "password": password})
        assert status == 200, body
        return body["token"]


@contextlib.contextmanager
def running_core(db, *args, fresh=True):
    """The core jar on database db (dropped and made again when fresh), started with the extra args;
    yields (Api, bootstrap admin username, password) once the admin can sign in."""
    if fresh:
        with psycopg.connect(dbname="postgres", autocommit=True, **PG) as c:
            c.execute(f"drop database if exists {db} with (force)")
            c.execute(f"create database {db}")
    port = free_port()
    admin, password = "e2e.admin", secrets.token_urlsafe(18)
    env = {**os.environ, "DATABASE_URL": f"jdbc:postgresql://{PG['host']}/{db}", "AUTH_SECRET": secrets.token_urlsafe(48),
           "BOOTSTRAP_ADMIN_USERNAME": admin, "BOOTSTRAP_ADMIN_PASSWORD": password}
    log = open(ROOT / f"apps/core/target/e2e-core-{db}.log", "w")
    proc = subprocess.Popen(["java", "-jar", core_jar(), f"--server.port={port}", *args], env=env, stdout=log, stderr=subprocess.STDOUT)
    api = Api(f"http://127.0.0.1:{port}")
    try:
        deadline = time.time() + 90
        while True:
            if proc.poll() is not None:
                pytest.fail(f"the core app stopped at start-up, see {log.name}")
            try:
                if api.call("POST", "/api/login", {"username": admin, "password": password})[0] == 200:
                    break
            except OSError:
                pass
            if time.time() > deadline:
                pytest.fail(f"the core app did not start in 90 s, see {log.name}")
            time.sleep(0.5)
        yield api, admin, password
    finally:
        proc.terminate()
        proc.wait(timeout=30)
        log.close()


@pytest.fixture(scope="session")
def core():
    """The core app on a fresh database; yields (Api, bootstrap admin username, password)."""
    with running_core(DB) as c:
        yield c


@pytest.fixture(scope="session")
def web(core):
    """The built web app on a free port; /api goes to the core app. Yields its base URL."""
    if not (DIST / "index.html").exists():
        subprocess.run(["npm", "run", "build"], cwd=ROOT / "apps/web", check=True)
    target = core[0].base

    class Handler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *a, **kw):
            super().__init__(*a, directory=str(DIST), **kw)

        def log_message(self, *a):
            pass

        def proxy(self):
            length = int(self.headers.get("content-length") or 0)
            req = urllib.request.Request(target + self.path, method=self.command, data=self.rfile.read(length) if length else None)
            for h in ("authorization", "content-type"):
                if self.headers.get(h):
                    req.add_header(h, self.headers[h])
            try:
                res = urllib.request.urlopen(req, timeout=30)
            except urllib.error.HTTPError as e:
                res = e
            body = res.read()
            try:
                self.send_response(res.status)
                self.send_header("content-type", res.headers.get("content-type", "application/octet-stream"))
                self.send_header("content-length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            except (BrokenPipeError, ConnectionResetError):
                pass  # the browser left the page (or closed) before the answer came

        def do_GET(self):
            self.proxy() if self.path.startswith("/api/") else super().do_GET()

        def do_POST(self):
            self.proxy()

        def do_PUT(self):
            self.proxy()

    server = http.server.ThreadingHTTPServer(("127.0.0.1", free_port()), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{server.server_address[1]}"
    server.shutdown()


@pytest.fixture
def page(web):
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        browser = p.chromium.launch()
        pg = browser.new_page()
        pg.set_default_timeout(15000)
        errors = []
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.goto(web)
        yield pg
        browser.close()
        assert not errors, f"errors in the page: {errors}"
