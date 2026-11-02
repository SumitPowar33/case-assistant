"""deploy/nginx.conf in a real nginx in front of the real core and the built web app (security review, 2 Nov 2026): plain
HTTP goes to HTTPS, every answer carries the security headers once, and the core sees the client's own address, not
one the client wrote into X-Forwarded-For. Skipped where nginx is not installed. Fictional data only."""
import shutil
import ssl
import subprocess
import time
import urllib.error
import urllib.request

import pytest

from conftest import DIST, ROOT, free_port

NGINX = shutil.which("nginx")
pytestmark = pytest.mark.skipif(NGINX is None, reason="nginx is not installed here")


@pytest.fixture
def proxy(core, tmp_path):
    api, admin, password = core
    subprocess.run(["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=localhost",
                    "-keyout", tmp_path / "key.pem", "-out", tmp_path / "cert.pem"], check=True, capture_output=True)
    http, https = free_port(), free_port()
    conf = (ROOT / "deploy/nginx.conf").read_text(encoding="utf-8")
    for old, new in [("listen 80 default_server;", f"listen 127.0.0.1:{http} default_server;"),
                     ("listen 443 ssl default_server;", f"listen 127.0.0.1:{https} ssl default_server;"),
                     ("server_name case.example.gov.in;", "server_name localhost;"), ("listen 80;", f"listen 127.0.0.1:{http};"), ("listen [::]:80;", ""), ("listen 443 ssl;", f"listen 127.0.0.1:{https} ssl;"),
                     ("listen [::]:443 ssl;", ""), ("/etc/case-assistant/tls/fullchain.pem", str(tmp_path / "cert.pem")),
                     ("/etc/case-assistant/tls/privkey.pem", str(tmp_path / "key.pem")), ("/srv/case-assistant/web", str(DIST)),
                     ("http://127.0.0.1:8080", api.base)]:
        assert old in conf, old
        conf = conf.replace(old, new)   # every occurrence (both blocks name the host)
    (tmp_path / "site.conf").write_text(conf)
    (tmp_path / "nginx.conf").write_text(f"""daemon off; pid {tmp_path}/nginx.pid; error_log {tmp_path}/error.log;
events {{}}
http {{ access_log off; client_body_temp_path {tmp_path}; proxy_temp_path {tmp_path}; fastcgi_temp_path {tmp_path};
       uwsgi_temp_path {tmp_path}; scgi_temp_path {tmp_path}; include {tmp_path}/site.conf; }}""")
    proc = subprocess.Popen([NGINX, "-p", str(tmp_path), "-c", str(tmp_path / "nginx.conf")], stderr=subprocess.PIPE)
    time.sleep(1)
    assert proc.poll() is None, proc.stderr.read().decode()
    yield http, https, api, admin, password
    proc.terminate()
    proc.wait(timeout=10)


def fetch(url, data=None, headers=None):
    ctx = ssl.create_default_context()
    ctx.check_hostname, ctx.verify_mode = False, ssl.CERT_NONE   # the test's own certificate
    req = urllib.request.Request(url, data=data, headers={"content-type": "application/json", **(headers or {})})

    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *a, **kw):
            return None
    opener = urllib.request.build_opener(NoRedirect, urllib.request.HTTPSHandler(context=ctx))
    try:
        res = opener.open(req, timeout=10)
    except urllib.error.HTTPError as e:
        res = e
    return res.status, res.headers, res.read()


def test_the_installation_serves_https_only_with_its_security_headers(proxy):
    http, https, api, admin, password = proxy
    status, headers, _ = fetch(f"http://localhost:{http}/#/firs")
    assert status == 301 and headers["Location"].startswith("https://")
    for path in ("/", "/api/me"):                     # the page, and an answer of the core (a 401 here)
        status, headers, _ = fetch(f"https://localhost:{https}{path}")
        assert status in (200, 401)
        assert headers["Strict-Transport-Security"].startswith("max-age=")
        assert "frame-ancestors 'none'" in headers["Content-Security-Policy"]
        assert headers.get_all("X-Frame-Options") == ["DENY"] and headers.get_all("X-Content-Type-Options") == ["nosniff"]
        assert headers["Referrer-Policy"] == "no-referrer" and "nginx/" not in headers.get("Server", "")


def test_the_core_sees_the_real_client_address_not_a_made_up_one(proxy):
    http, https, api, admin, password = proxy
    status, _, _ = fetch(f"https://localhost:{https}/api/login", b'{"username":"proxy.nobody","password":"wrong-password-1"}',
                         {"X-Forwarded-For": "203.0.113.9"})
    assert status == 401
    log = api.call("GET", "/api/sign-ins?username=proxy.nobody", token=api.token(admin, password))[1]
    assert [r["client_ip"] for r in log] == ["127.0.0.1"]


def test_another_host_name_gets_no_answer_and_unknown_paths_are_404(proxy):
    """Pentest round 2: a spoofed Host was redirected to that host; any path answered 200 with the app page."""
    http, https, *_ = proxy
    with pytest.raises((urllib.error.URLError, ConnectionError, OSError)):
        fetch(f"http://127.0.0.1:{http}/", headers={"Host": "attacker.example"})   # closed without an answer (444)
    with pytest.raises((urllib.error.URLError, ssl.SSLError, OSError)):
        fetch(f"https://127.0.0.1:{https}/")                                     # no name: handshake refused
    assert fetch(f"https://localhost:{https}/.git/config")[0] == 404
    assert fetch(f"https://localhost:{https}/")[0] == 200
