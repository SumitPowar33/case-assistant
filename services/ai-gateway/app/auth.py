"""Checks the login tokens issued by the core app (apps/core, POST /api/login).

They are HS256 JWTs signed with the shared AUTH_SECRET. Only the standard library is needed for that.
The gateway cannot see whether a user was disabled after the token was issued; tokens last one shift (8 hours).
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time


class TokenError(ValueError):
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
