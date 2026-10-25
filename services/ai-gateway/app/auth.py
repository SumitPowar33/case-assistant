"""Checks the login tokens issued by the core app (apps/core, POST /api/login).

They are HS256 JWTs signed with the shared AUTH_SECRET. Only the standard library is needed for that.
A good signature is not enough: the user may have been disabled, or may have changed their password, after the
token was issued. So every token is also shown to the core app (GET /api/me), which refuses such tokens; a yes is
remembered for a short time only. If the core app cannot be reached, the gateway refuses (fails closed).
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import threading
import time

import httpx


class TokenError(ValueError):
    pass


class CoreUnavailable(RuntimeError):
    pass


def _b64(part: str) -> bytes:
    return base64.urlsafe_b64decode(part + "=" * (-len(part) % 4))


def verify(token: str, secret: str, now: float | None = None) -> dict:
    """Returns the token's claims, or raises TokenError. Needs a subject and an unexpired 'exp'."""
    try:
        header_b64, payload_b64, sig_b64 = token.split(".")
        header = json.loads(_b64(header_b64))
        payload = json.loads(_b64(payload_b64))
        sig = _b64(sig_b64)
    except (ValueError, TypeError) as e:
        raise TokenError("malformed token") from e
    if header.get("alg") != "HS256":
        raise TokenError("unsupported token algorithm")
    expected = hmac.new(secret.encode(), f"{header_b64}.{payload_b64}".encode(), hashlib.sha256).digest()
    if not hmac.compare_digest(sig, expected):
        raise TokenError("bad signature")
    exp = payload.get("exp")
    if not isinstance(exp, (int, float)) or exp <= (time.time() if now is None else now):
        raise TokenError("token expired")
    if not payload.get("sub"):
        raise TokenError("token has no subject")
    return payload


class CoreCheck:
    """Asks the core app whether a token still belongs to an active user with the current password.

    Returns the user as the core app sees them now (id, role, ...). A yes is kept for `ttl` seconds, so a
    disabled user or an old password stops working at the gateway within that time.
    """

    def __init__(self, base_url: str, client: httpx.Client | None = None, ttl: float = 30.0, clock=time.monotonic):
        self.url = base_url.rstrip("/") + "/api/me"
        self.client = client or httpx.Client(timeout=5.0)
        self.ttl = ttl
        self.clock = clock
        self._ok: dict[str, tuple[float, dict]] = {}
        self._lock = threading.Lock()

    def __call__(self, token: str, subject: str) -> dict:
        key = hashlib.sha256(token.encode()).hexdigest()  # the token itself is not kept
        now = self.clock()
        with self._lock:
            hit = self._ok.get(key)
            if hit and hit[0] > now:
                return hit[1]
        try:
            r = self.client.get(self.url, headers={"Authorization": "Bearer " + token})
        except httpx.HTTPError as e:
            raise CoreUnavailable("cannot reach the core app to check the sign-in") from e
        if r.status_code in (401, 403):
            raise TokenError("signed out: the user is disabled or the password has changed")
        if r.status_code != 200:
            raise CoreUnavailable(f"core app answered {r.status_code} to the sign-in check")
        try:
            me = r.json()
        except ValueError as e:
            raise CoreUnavailable("core app gave an unreadable answer to the sign-in check") from e
        if not isinstance(me, dict) or str(me.get("id")) != subject or not me.get("role"):
            raise TokenError("token does not match the signed-in user")
        with self._lock:
            if len(self._ok) > 5000:
                self._ok = {k: v for k, v in self._ok.items() if v[0] > now}
            self._ok[key] = (now + self.ttl, me)
        return me
