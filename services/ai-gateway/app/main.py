"""AI gateway: the only door through which the app talks to any AI model.

- Each request names a feature; the admin's settings decide provider + model for that feature.
- An officer may override the provider for one request only if the feature allows it.
- Every request, error and human decision (accepted / edited / rejected) is written to the audit log.
- Output is always returned as a *draft* for a person to review; the gateway never acts on it.
- Every /v1 call needs the core app's login token; the audit log records the signed-in user, not a name
  sent in the request.
- Residency: when the policy "ai_cloud_allowed" of the user's unit is 0 (the core app says so on every sign-in check),
  no text goes to a cloud provider; the refusal is logged. Only providers on the state's own servers may answer. Only the state admin changes settings or reads the audit log.
"""
from __future__ import annotations

import hashlib
import os
import uuid

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from .auth import CoreCheck, CoreUnavailable, TokenError, verify
from .providers import ClaudeProvider, FakeProvider, GeminiProvider, Provider, ProviderError
from .store import DEFAULT_MODELS, FEATURES, PROVIDERS, Store

# Change SAFETY_VERSION whenever SAFETY_SYSTEM changes, so the audit log shows which rules a draft was made under.
SAFETY_VERSION = "safety-1"
SAFETY_SYSTEM = (
    "You assist an Indian police investigating officer. Use only the material given. "
    "If the material does not say something, say it is not in the documents; never guess. "
    "Never judge guilt or whether a person is truthful. Write plainly. "
    "Your output is a draft that an officer will check."
)


class GenerateIn(BaseModel):
    feature: str
    prompt: str = Field(min_length=1, max_length=60000)
    # Which prompt template the caller used, e.g. "notice_draft/bnss94@1". Logged with every request.
    prompt_version: str = Field(min_length=1, max_length=80, pattern=r"^[\w./@-]+$")
    system: str = ""
    case_ref: str | None = None
    provider: str | None = None  # officer override, if allowed
    model: str | None = None
    max_tokens: int = Field(default=1024, ge=1, le=8192)


class DecisionIn(BaseModel):
    request_id: str
    decision: str  # accepted | edited | rejected
    feature: str
    case_ref: str | None = None
    note: str = ""


class SettingIn(BaseModel):
    provider: str
    model: str | None = None
    officer_may_switch: bool = True


def create_app(store: Store | None = None, providers: dict[str, Provider] | None = None,
               auth_secret: str | None = None, core_check=None) -> FastAPI:
    secret = auth_secret if auth_secret is not None else os.environ.get("AUTH_SECRET", "")
    if len(secret) < 32:
        raise RuntimeError("AUTH_SECRET must be set (at least 32 characters, the same value as the core app)")
    # Asks the core app if the user is still active and the password unchanged (see auth.CoreCheck).
    core_check = core_check or CoreCheck(os.environ.get("CORE_URL", "http://localhost:8080"))
    store = store or Store(os.environ.get("AI_GATEWAY_DB", "ai-gateway.sqlite3"))
    providers = providers or {"claude": ClaudeProvider(), "gemini": GeminiProvider(), "fake": FakeProvider()}
    app = FastAPI(title="Case Assistant AI gateway", version="0.1.0")

    def user(authorization: str = Header(default="")) -> dict:
        scheme, _, token = authorization.partition(" ")
        if scheme.lower() != "bearer" or not token:
            raise HTTPException(401, "sign in first", headers={"WWW-Authenticate": "Bearer"})
        token = token.strip()
        try:
            claims = verify(token, secret)
            me = core_check(token, str(claims["sub"]))
        except TokenError as e:
            raise HTTPException(401, str(e), headers={"WWW-Authenticate": "Bearer"})
        except CoreUnavailable as e:
            raise HTTPException(503, str(e))
        # the role, its permissions and the unit's AI policy as the core app has them now, not as they were when the
        # token was issued; an answer without the policy counts as "no cloud", without permissions as none (fails closed)
        permissions = me.get("permissions")
        return {**claims, "role": me["role"], "permissions": permissions if isinstance(permissions, list) else [],
                "ai_cloud_allowed": me.get("ai_cloud_allowed") is True}

    def admin(u: dict = Depends(user)) -> dict:
        # by permission from the packs (roles.json), never by role name
        if "admin.manage" not in u["permissions"]:
            raise HTTPException(403, "only the state admin can do this")
        return u

    @app.get("/health")
    def health():
        return {"ok": True, "providers": sorted(providers), "audit_chain_ok": store.verify_chain()}

    @app.get("/v1/features")
    def features(_: dict = Depends(user)):
        return {"features": FEATURES, "providers": sorted(PROVIDERS), "default_models": DEFAULT_MODELS}

    @app.get("/v1/settings")
    def get_settings(_: dict = Depends(user)):
        return store.get_settings()

    @app.put("/v1/settings/{feature}")
    def put_setting(feature: str, body: SettingIn, u: dict = Depends(admin)):
        try:
            return store.set_setting(feature, body.provider, body.model, body.officer_may_switch, u["sub"])
        except KeyError:
            raise HTTPException(404, f"unknown feature {feature}")
        except ValueError as e:
            raise HTTPException(422, str(e))

    @app.post("/v1/generate")
    def generate(body: GenerateIn, u: dict = Depends(user)):
        settings = store.get_settings()
        if body.feature not in settings:
            raise HTTPException(404, f"unknown feature {body.feature}")
        s = settings[body.feature]
        provider_name, model = s["provider"], s["model"]
        wants_provider = bool(body.provider) and body.provider != provider_name
        wants_model = bool(body.model) and body.model != model
        if (wants_provider or wants_model) and not s["officer_may_switch"]:
            raise HTTPException(403, "this feature's provider and model are fixed by the admin")
        if wants_provider:
            if body.provider not in PROVIDERS:
                raise HTTPException(422, f"unknown provider {body.provider}")
            provider_name, model = body.provider, body.model or DEFAULT_MODELS[body.provider]
        elif body.model:
            model = body.model
        request_id = str(uuid.uuid4())
        if getattr(providers.get(provider_name), "cloud", True) and not u["ai_cloud_allowed"]:
            store.log(u["sub"], "ai_refused", body.feature, body.case_ref,
                      {"request_id": request_id, "provider": provider_name, "model": model, "reason": "ai_cloud_allowed is off for the user's unit"})
            raise HTTPException(403, "Your unit's policy keeps case text on the state's servers, so a cloud AI provider "
                                     f"({provider_name}) cannot be used. Ask the admin to set an on-premises provider for this feature.")
        system = SAFETY_SYSTEM + ("\n\n" + body.system if body.system else "")
        # The text itself is not kept (it may name people); its hash proves later which exact text was sent.
        versions = {"prompt_version": body.prompt_version, "safety_version": SAFETY_VERSION,
                    "prompt_sha256": hashlib.sha256(f"{system}\n\n{body.prompt}".encode()).hexdigest()}
        try:
            out = providers[provider_name].complete(model=model, system=system, prompt=body.prompt, max_tokens=body.max_tokens)
        except ProviderError as e:
            store.log(u["sub"], "ai_error", body.feature, body.case_ref,
                      {"request_id": request_id, "provider": provider_name, "model": model, **versions, "error": str(e)})
            raise HTTPException(502, str(e))
        store.log(u["sub"], "ai_request", body.feature, body.case_ref, {
            "request_id": request_id, "provider": out.provider, "model": out.model, **versions,
            "prompt_chars": len(body.prompt), "output_chars": len(out.text),
            "input_tokens": out.input_tokens, "output_tokens": out.output_tokens})
        return {"request_id": request_id, "draft": out.text, "provider": out.provider, "model": out.model,
                "label": "AI draft - check before use"}

    @app.post("/v1/decisions")
    def decision(body: DecisionIn, u: dict = Depends(user)):
        if body.decision not in {"accepted", "edited", "rejected"}:
            raise HTTPException(422, "decision must be accepted, edited or rejected")
        req = store.find_request(body.request_id)
        if req is None:
            raise HTTPException(404, "no AI request with that id")
        if req["feature"] != body.feature:
            raise HTTPException(422, "feature does not match the AI request")
        seq = store.log(u["sub"], body.decision, body.feature, body.case_ref, {"request_id": body.request_id, "note": body.note})
        return {"logged": seq}

    @app.get("/v1/audit")
    def audit(limit: int = 100, _: dict = Depends(admin)):
        return {"chain_ok": store.verify_chain(), "rows": store.audit_rows(min(max(limit, 1), 500))}

    return app


app = create_app() if os.environ.get("AI_GATEWAY_AUTOSTART", "1") == "1" else None
