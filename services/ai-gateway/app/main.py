"""AI gateway: the only door through which the app talks to any AI model.

- Each request names a feature; the admin's settings decide provider + model for that feature.
- An officer may override the provider for one request only if the feature allows it.
- Every request, error and human decision (accepted / edited / rejected) is written to the audit log.
- Output is always returned as a *draft* for a person to review; the gateway never acts on it.
- Every /v1 call needs the core app's login token; the audit log records the signed-in user, not a name
  sent in the request.
- A state admin's settings and audit log are their own state's (the core app gives the user's state); the platform
  admin (no station, so no state) sets the installation's defaults and reads every row.
- Callers cannot add their own instructions: the safety rules are the only system text a model gets.
- Residency: when the policy "ai_cloud_allowed" of the user's unit is 0 (the core app says so on every sign-in check),
  no text goes to a cloud provider; the refusal is logged. Only providers on the state's own servers may answer. Only the state admin changes settings or reads the audit log.
"""
from __future__ import annotations

import hashlib
import os
import re
import threading
import time
import uuid
from collections import deque
from datetime import datetime, timedelta, timezone

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from .auth import CaseCheck, CaseNotOpen, ChainAnchor, CoreCheck, CoreUnavailable, TokenError, verify
from .embedder import EmbedderError, from_env as embedder_from_env
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


# A model name goes into the provider's request path (Gemini: .../models/{model}:generateContent), so only plain names
# are taken: no "/", "?", ":" or "..", which would send the state's API key to another method of that API.
MODEL_NAME = r"^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$"
# Each draft is paid for, so one officer's token (or a stolen one) may ask for at most this many in the window.
DRAFTS_PER_WINDOW = 20
DRAFT_WINDOW_SECONDS = 600


class DraftLimit:
    """At most `limit` drafts per officer in any `window` seconds, kept in memory (a restart forgets it)."""

    def __init__(self, limit: int, window: float, clock=time.monotonic):
        self.limit, self.window, self.clock = limit, window, clock
        self.seen: dict[str, deque] = {}
        self.lock = threading.Lock()

    def wait(self, who: str) -> int:
        """0 and counted when this request may go ahead; otherwise the seconds until it may."""
        now = self.clock()
        with self.lock:
            q = self.seen.setdefault(who, deque())
            while q and q[0] <= now - self.window:
                q.popleft()
            if len(q) >= self.limit:
                return max(1, int(q[0] + self.window - now) + 1)
            q.append(now)
            if len(self.seen) > 10000:   # forget officers with nothing in the window
                self.seen = {k: v for k, v in self.seen.items() if v and v[-1] > now - self.window}
            return 0


# "Ask the case file" never answers guilt, truth or prediction questions (CLAUDE.md hard rules). The browser refuses them first
# (apps/web/src/askFile.ts, same patterns); this is the second check, so a caller that skips the screen is refused and logged too.
# Only the officer's question is read, never the case pieces below it.
# The question runs from its line to the case pieces (a question may have line breaks). A case_qa prompt without the line
# is read whole: a caller that does not say which part is the question gets the strict reading (weekly review 14 Nov).
QUESTION_LINE = re.compile(r"question from the investigating officer:(.*?)(?=\n\s*\n|\n\s*pieces of this case file|\Z)", re.I | re.S)
# Kept the same as apps/web/src/askFile.ts (tests/repo_rules/test_question_guard_same.py). The Hindi and Marathi words are an
# unreviewed draft list (decision 5 of 2 Nov: a Marathi-speaking prosecutor reviews legal words).
REFUSED_QUESTIONS = {
    "guilt": re.compile(r"\b(guilty|guilt|innocent|innocence|culprit|criminal|convict\w*|doshi|nirdosh|gunahgar)\b|\b(who|whom) (did"
                         r"|committed|is behind|is responsible)\b|\bdid (he|she|they|it|[a-z]\d) (do|commit)\b|\bdid (the )?\w+ (do it"
                         r"|do this|commit)\b|\b(is|are|was|were) (he|she|they|[a-z]\d|the (accused|suspect)) (really "
                         r"|actually )?responsible\b|दोषी|निर्दोष|गुन्हेगार|गुनहगार"
                         r"|अपराधी|मुजरिम|गुनाहगार|किसने (यह |ये |वह )?(किया|की|किए)|कौन (है )?(ज़िम्मेदार|जिम्मेदार|जिम्मेवार)|(ज़िम्मेदार|जिम्मेदार|जबाबदार|जबाबदारी) (है|हैं|था|थी|आहे|होता|होती)|(उसने|उन्होंने|आरोपी ने) (ही )?अपराध किया|(त्याने|तिने|त्यांनी|आरोपीने) (हा |ही )?गुन्हा केला|कोणी (हे |ते |हा )?(केले|केलं|केला)|(कोणाचा|किसका) दोष", re.I),
    "truth": re.compile(r"\b(lying|liar|lies|lie|truthful|truthfully|credible|credibility|believable|trustworthy|honest|dishonest"
                         r"|reliable|unreliable|reliability|jhooth|jhoot|jhuth)\b|\b(is|are|was|were) (he|she|they|[a-z]\d|the (witness"
                         r"|victim|accused|complainant)) (telling|speaking)\b|\btelling the truth\b|\b(can|could|should) (we|i) (trust"
                         r"|believe|rely on)\b|\b(is|are|was|were) (the |his |her |this |that )?(\w+ ){0,2}(true|false|untrue"
                         r"|fabricated)\b|झूठ|खोटं|खोटे बोल|सच बोल|खरं बोल"
                         r"|झूठा|झूठी|झूठे|सच (बोल|कह|है|हैं|था|थी)|सच्चा|सच्ची|सत्य बोल|विश्वसनीय|भरोसेमंद|भरोसा कर|विश्वास कर|विश्वासार्ह|विश्वास ठेव|खरे आहे|खरं आहे|खोटे आहे|खोटं आहे|खोटा आहे|खोटी आहे|खोटे बोलत|खोटं बोलत|खरे बोलत|खरं बोलत", re.I),
    "predict": re.compile(r"\b(will|would|might|likely|going to|chance|probability|probable)\b.{0,40}\b(commit|reoffend|re-offend|offend"
                           r"|flee|abscond|escape|repeat|do it again|do this again|run away|tamper\w*|threaten\w*|harm)\b|\bflight risk\b"
                           r"|\b(is|are) (he|she|they|[a-z]\d|the (accused|suspect)) (\w+ )?dangerous\b"
                           r"|(फरार|फ़रार) (हो|होगा|होगी|होने)|भाग (जाएगा|जाएगी|सकता|सकती|जाने)|भागने की (संभावना|आशंका)|(दोबारा|फिर से|पुन्हा|परत) (अपराध|गुन्हा)|गुन्हा करेल|अपराध करेगा|अपराध करेगी|पळून (जाईल|जाण्याची|जाऊ शकतो|जाऊ शकते)|फरार होण्याची|(खतरनाक|धोकादायक) (है|होगा|होगी|आहे|ठरेल)|(संभावना|आशंका).{0,30}(भाग|फरार|अपराध|धमकी|सबूत)|(शक्यता|भीती).{0,30}(पळ|फरार|गुन्हा|धमक|पुरावा)|(धमक|पळून|फरार|गुन्हा)[^ ]*( [^ ]+){0,3} (शक्यता|भीती)", re.I),
}


def refused_question(feature: str, prompt: str) -> str | None:
    """'guilt', 'truth' or 'predict' when a case_qa question asks what the app never answers, else None."""
    if feature != "case_qa":
        return None
    m = QUESTION_LINE.search(prompt)
    question = m.group(1) if m else prompt
    return next((why for why, rx in REFUSED_QUESTIONS.items() if rx.search(question)), None)


# Weekly review of 14 Nov 2026: the screens did not offer these on a protected case, but the gateway took any text. Now every
# feature that reads a case names the FIR (its id, as case_ref) and the core app says whether the officer is on its case team
# and whether its victim's identity is protected (BNS 72, BNS 124). The features below send the FIR text or statements, so
# they are refused on a protected case. case_qa is still allowed there (question 1 of session 92), victim_update,
# notice_draft and supervisor_brief send no victim details; law_explain and app_help (the app's own screens) read no case.
NO_CASE_FEATURES = {"law_explain", "app_help"}
NOT_ON_PROTECTED = {"fir_extract", "section_suggest", "statement_translate", "reply_check", "chargesheet_draft"}
UUID_RE = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")


class GenerateIn(BaseModel):
    model_config = ConfigDict(extra="forbid")   # an unknown field (e.g. a caller's own "system" text) is refused, not ignored
    feature: str = Field(max_length=60)
    prompt: str = Field(min_length=1, max_length=60000)
    # Which prompt template the caller used, e.g. "notice_draft/bnss94@1". Logged with every request.
    prompt_version: str = Field(min_length=1, max_length=80, pattern=r"^[\w./@-]+$")
    case_ref: str | None = Field(default=None, max_length=200)
    provider: str | None = Field(default=None, max_length=20)  # officer override, if allowed
    model: str | None = Field(default=None, pattern=MODEL_NAME)
    max_tokens: int = Field(default=1024, ge=1, le=8192)


class EmbedIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    texts: list[str] = Field(min_length=1, max_length=64)
    kind: str = Field(default="passage", pattern=r"^(passage|query)$")
    case_ref: str = Field(max_length=200)


MAX_EMBED_CHARS = 2000      # a piece of the case file is at most 500 characters; a question at most 500
EMBEDS_PER_WINDOW = 120     # calls per officer in DRAFT_WINDOW_SECONDS (a case file of 500 pieces is 8 calls)


class DecisionIn(BaseModel):
    request_id: str = Field(max_length=64)
    decision: str = Field(max_length=10)  # accepted | edited | rejected
    feature: str = Field(max_length=60)
    case_ref: str | None = Field(default=None, max_length=200)
    note: str = Field(default="", max_length=2000)


class SettingIn(BaseModel):
    provider: str = Field(max_length=20)
    model: str | None = Field(default=None, pattern=MODEL_NAME)
    officer_may_switch: bool = True


def create_app(store: Store | None = None, providers: dict[str, Provider] | None = None,
               auth_secret: str | None = None, core_check=None, anchor=None, case_check=None, embedder=None) -> FastAPI:
    secret = auth_secret if auth_secret is not None else os.environ.get("AUTH_SECRET", "")
    if len(secret) < 32:
        raise RuntimeError("AUTH_SECRET must be set (at least 32 characters, the same value as the core app)")
    # Asks the core app if the user is still active and the password unchanged (see auth.CoreCheck).
    core_check = core_check or CoreCheck(os.environ.get("CORE_URL", "http://localhost:8080"))
    # whether the officer may send this case's text (see NOT_ON_PROTECTED)
    case_check = case_check or CaseCheck(os.environ.get("CORE_URL", "http://localhost:8080"))
    # the chain head is also kept in the core app's database (auth.ChainAnchor)
    anchor = anchor or ChainAnchor(os.environ.get("CORE_URL", "http://localhost:8080"), secret)
    store = store or Store(os.environ.get("AI_GATEWAY_DB", "ai-gateway.sqlite3"), os.environ.get("AI_AUDIT_KEY") or None)
    providers = providers or {"claude": ClaudeProvider(), "gemini": GeminiProvider(), "fake": FakeProvider()}
    # no published API description: it answered anyone without sign-in (pentest round 2)
    app = FastAPI(title="Case Assistant AI gateway", version="0.1.0", docs_url=None, redoc_url=None, openapi_url=None)
    drafts = DraftLimit(DRAFTS_PER_WINDOW, DRAFT_WINDOW_SECONDS)
    embeds = DraftLimit(EMBEDS_PER_WINDOW, DRAFT_WINDOW_SECONDS)
    embedder = embedder or embedder_from_env()

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
        return {**claims, "token": token, "role": me["role"], "permissions": permissions if isinstance(permissions, list) else [],
                "ai_cloud_allowed": me.get("ai_cloud_allowed") is True,
                "state": me.get("state_code") if isinstance(me.get("state_code"), str) else None}

    def log(u: dict, action: str, feature: str | None, case_ref: str | None, detail: dict) -> int:
        seq = store.log(u["sub"], action, feature, case_ref, detail, u["state"])
        anchor_head(u)
        return seq

    def anchor_head(u: dict) -> None:
        head = store.head()   # the newest row, which may be another request's: the head only moves forward
        if head:
            anchor.report(u["token"], *head)

    def admin(u: dict = Depends(user)) -> dict:
        # by permission from the packs (roles.json), never by role name
        if "admin.manage" not in u["permissions"]:
            raise HTTPException(403, "only the state admin can do this")
        return u

    @app.get("/health")
    def health():
        # open and cheap: says only that the gateway runs (the chain check is on /v1/audit, for admins)
        return {"ok": True}

    @app.get("/v1/features")
    def features(_: dict = Depends(user)):
        return {"features": FEATURES, "providers": sorted(PROVIDERS), "default_models": DEFAULT_MODELS}

    @app.get("/v1/settings")
    def get_settings(u: dict = Depends(user)):
        return store.get_settings(u["state"])

    @app.put("/v1/settings/{feature}")
    def put_setting(feature: str, body: SettingIn, u: dict = Depends(admin)):
        try:
            out = store.set_setting(feature, body.provider, body.model, body.officer_may_switch, u["sub"], u["state"])
            anchor_head(u)
            return out
        except KeyError:
            raise HTTPException(404, f"unknown feature {feature}")
        except ValueError as e:
            raise HTTPException(422, str(e))

    @app.post("/v1/generate")
    def generate(body: GenerateIn, u: dict = Depends(user)):
        request_id = str(uuid.uuid4())

        def refuse(status: int, message: str, headers: dict | None = None, **detail):
            # every refusal is logged, with who asked and why it was refused (the text itself is not kept)
            log(u, "ai_refused", body.feature, body.case_ref, {"request_id": request_id, "status": status, "reason": message, **detail})
            raise HTTPException(status, message, headers=headers)

        # the log counts across restarts and copies on the same file; the memory count also stops a burst sent at once
        wait = 60 if store.drafts_since(str(u["sub"]), DRAFT_WINDOW_SECONDS) >= DRAFTS_PER_WINDOW else drafts.wait(str(u["sub"]))
        if wait:
            refuse(429, f"Too many AI drafts in a short time ({DRAFTS_PER_WINDOW} in {DRAFT_WINDOW_SECONDS // 60} minutes). "
                        f"Try again in {wait} seconds.", headers={"Retry-After": str(wait)})

        settings = store.get_settings(u["state"])
        if body.feature not in settings:
            refuse(404, f"unknown feature {body.feature}")
        s = settings[body.feature]
        provider_name, model = s["provider"], s["model"]
        wants_provider = bool(body.provider) and body.provider != provider_name
        wants_model = bool(body.model) and body.model != model
        if (wants_provider or wants_model) and not s["officer_may_switch"]:
            refuse(403, "this feature's provider and model are fixed by the admin", provider=body.provider, model=body.model)
        if wants_provider:
            if body.provider not in PROVIDERS:
                refuse(422, f"unknown provider {body.provider}")
            provider_name, model = body.provider, body.model or DEFAULT_MODELS[body.provider]
        elif body.model:
            model = body.model
        if getattr(providers.get(provider_name), "cloud", True) and not u["ai_cloud_allowed"]:
            refuse(403, "Your unit's policy keeps case text on the state's servers, so a cloud AI provider "
                        f"({provider_name}) cannot be used. Ask the admin to set an on-premises provider for this feature.",
                   provider=provider_name, model=model)
        why = refused_question(body.feature, body.prompt)
        if why:
            refuse(422, f"This question asks about {why}, which the app does not answer. Ask what the file says.", question_refused=why)
        if body.feature not in NO_CASE_FEATURES:
            if not body.case_ref or not UUID_RE.match(body.case_ref):
                refuse(422, "this feature reads a case: name the FIR (its id) in case_ref")
            try:
                case = case_check(u["token"], body.case_ref)
            except CaseNotOpen:
                refuse(404, "no case of your case team with that id")
            except CoreUnavailable as e:
                refuse(503, str(e))
            if case["victim_protected"] and body.feature in NOT_ON_PROTECTED:
                refuse(403, "The victim's identity in this case is protected, so its text is not sent to an AI model.", victim_protected=True)
        system = SAFETY_SYSTEM
        # The text itself is not kept (it may name people); its hash proves later which exact text was sent.
        versions = {"prompt_version": body.prompt_version, "safety_version": SAFETY_VERSION,
                    "prompt_sha256": hashlib.sha256(f"{system}\n\n{body.prompt}".encode()).hexdigest()}
        try:
            out = providers[provider_name].complete(model=model, system=system, prompt=body.prompt, max_tokens=body.max_tokens)
        except Exception as e:  # a timeout or a broken answer too: the text may already have left, so it is logged
            error = str(e) if isinstance(e, ProviderError) else f"{provider_name} could not be reached ({type(e).__name__})"
            log(u, "ai_error", body.feature, body.case_ref,
                {"request_id": request_id, "provider": provider_name, "model": model, **versions, "error": error})
            raise HTTPException(502, error)
        log(u, "ai_request", body.feature, body.case_ref, {
            "request_id": request_id, "provider": out.provider, "model": out.model, **versions,
            "prompt_chars": len(body.prompt), "output_chars": len(out.text),
            "input_tokens": out.input_tokens, "output_tokens": out.output_tokens})
        return {"request_id": request_id, "draft": out.text, "provider": out.provider, "model": out.model,
                "label": "AI draft - check before use"}

    @app.post("/v1/embed")
    def embed(body: EmbedIn, u: dict = Depends(user)):
        """Vectors for pieces of one case or for a question, made on this server (item 17). Never a cloud provider, so the
        unit's "no cloud" policy does not stop it; the case check and the log are the same as for a draft. The text is not kept."""
        def refuse(status: int, message: str, headers: dict | None = None):
            log(u, "ai_refused", "embed", body.case_ref, {"status": status, "reason": message})
            raise HTTPException(status, message, headers=headers)

        if not UUID_RE.match(body.case_ref):
            refuse(422, "name the FIR (its id) in case_ref")
        if any(len(t) > MAX_EMBED_CHARS or not t.strip() for t in body.texts):
            refuse(422, f"each text must have words and at most {MAX_EMBED_CHARS} characters")
        wait = embeds.wait(str(u["sub"]))
        if wait:
            refuse(429, f"Too many requests in a short time. Try again in {wait} seconds.", headers={"Retry-After": str(wait)})
        try:
            case_check(u["token"], body.case_ref)
        except CaseNotOpen:
            refuse(404, "no case of your case team with that id")
        except CoreUnavailable as e:
            refuse(503, str(e))
        try:
            vectors = embedder.embed(body.texts, body.kind)
        except EmbedderError as e:
            refuse(503, str(e))
        log(u, "ai_embed", "embed", body.case_ref, {"model": embedder.name, "kind": body.kind, "texts": len(body.texts),
                                                  "chars": sum(len(t) for t in body.texts),
                                                  "texts_sha256": hashlib.sha256("\n".join(body.texts).encode()).hexdigest()})
        return {"model": embedder.name, "dim": len(vectors[0]), "min_similarity": embedder.min_similarity, "vectors": vectors}

    @app.post("/v1/decisions")
    def decision(body: DecisionIn, u: dict = Depends(user)):
        if body.decision not in {"accepted", "edited", "rejected"}:
            raise HTTPException(422, "decision must be accepted, edited or rejected")
        req = store.find_request(body.request_id)
        # only the officer who asked for the draft decides on it, once, for the case it was drafted for
        if req is None or req["actor"] != u["sub"]:
            raise HTTPException(404, "no AI request with that id")
        if req["feature"] != body.feature:
            raise HTTPException(422, "feature does not match the AI request")
        if req["case_ref"] != body.case_ref:
            raise HTTPException(422, "case does not match the AI request")
        if store.decided(body.request_id):
            raise HTTPException(409, "a decision on this AI draft is already logged")
        seq = log(u, body.decision, body.feature, body.case_ref, {"request_id": body.request_id, "note": body.note})
        return {"logged": seq}

    @app.get("/v1/ai-use")
    def ai_use(case_ref: str, u: dict = Depends(user)):
        """What the AI was asked in one case and what the officers did with it (A9, board 20): counts per feature and the
        newest events, from the log, without any text. Only the case team (the same check as a draft)."""
        if not UUID_RE.match(case_ref):
            raise HTTPException(422, "name the FIR (its id) in case_ref")
        try:
            case_check(u["token"], case_ref)
        except CaseNotOpen:
            raise HTTPException(404, "no case of your case team with that id")
        except CoreUnavailable as e:
            raise HTTPException(503, str(e))
        return {"case_ref": case_ref, "features": store.ai_use(case_ref), "events": store.case_events(case_ref)}

    @app.get("/v1/ai-use/summary")
    def ai_use_summary(days: int = 30, u: dict = Depends(user)):
        """Counts per feature for the user's state over the last `days` days (board 20's monthly counts). No case, no officer, no text.
        Whoever may read the audit log of protected details (a permission from the packs) may read it."""
        if "audit.read_protected" not in u["permissions"]:
            raise HTTPException(403, "your role cannot read the audit log")
        days = min(max(days, 1), 366)
        since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat(timespec="seconds")
        return {"days": days, "features": store.ai_use(None, u["state"], since)}

    @app.get("/v1/audit")
    def audit(limit: int = 100, u: dict = Depends(admin)):
        try:
            kept = anchor.newest(u["token"])
        except CoreUnavailable as e:
            raise HTTPException(503, str(e))
        # intact = every link and the file's own head check, and the file holds the head the core app keeps
        return {"chain_ok": store.verify_chain() and store.agrees_with(kept), "anchored_seq": kept.get("seq"),
                "rows": store.audit_rows(min(max(limit, 1), 500), u["state"])}

    return app


app = create_app() if os.environ.get("AI_GATEWAY_AUTOSTART", "1") == "1" else None
