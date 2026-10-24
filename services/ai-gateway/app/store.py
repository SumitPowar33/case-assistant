"""Settings (which provider/model each feature uses) and a tamper-evident audit log.

Demo storage is SQLite; the same tables move to PostgreSQL in the Java app later.
The audit log is append-only and hash-chained: each row stores the SHA-256 of the previous row,
so editing or deleting any row breaks `verify_chain()`.
"""
from __future__ import annotations

import hashlib
import json
import sqlite3
import threading
from datetime import datetime, timezone

FEATURES = {
    # feature id: human label. Every AI call must name one of these.
    "fir_extract": "Pull facts out of an FIR or complaint",
    "notice_draft": "Draft BNSS 94 notices and follow-up letters",
    "reply_check": "Check bank and telecom replies",
    "statement_translate": "Translate statements (original always kept)",
    "chargesheet_draft": "Draft chargesheet paragraphs",
    "case_qa": "Answer questions about the case file",
    "victim_update": "Draft the 90-day victim update",
}
PROVIDERS = {"claude", "gemini", "fake"}
DEFAULT_MODELS = {"claude": "claude-sonnet-5-5", "gemini": "gemini-3.7-flash", "fake": "fake-1"}
AUDIT_ACTIONS = {"ai_request", "ai_error", "accepted", "edited", "rejected", "settings_changed"}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class Store:
    def __init__(self, path: str = ":memory:"):
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.lock = threading.Lock()
        with self.lock:
            self.db.executescript("""
            CREATE TABLE IF NOT EXISTS feature_settings (
              feature TEXT PRIMARY KEY, provider TEXT NOT NULL, model TEXT NOT NULL,
              officer_may_switch INTEGER NOT NULL DEFAULT 1);
            CREATE TABLE IF NOT EXISTS audit (
              seq INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, actor TEXT NOT NULL,
              action TEXT NOT NULL, feature TEXT, case_ref TEXT, detail TEXT NOT NULL,
              prev_hash TEXT NOT NULL, hash TEXT NOT NULL);
            """)
            for f in FEATURES:
                self.db.execute("INSERT OR IGNORE INTO feature_settings VALUES (?,?,?,1)", (f, "claude", DEFAULT_MODELS["claude"]))
            self.db.commit()

    # ---- settings ----
    def get_settings(self) -> dict:
        rows = self.db.execute("SELECT feature, provider, model, officer_may_switch FROM feature_settings").fetchall()
        return {f: {"label": FEATURES[f], "provider": p, "model": m, "officer_may_switch": bool(s)} for f, p, m, s in rows}

    def set_setting(self, feature: str, provider: str, model: str | None, officer_may_switch: bool, actor: str) -> dict:
        if feature not in FEATURES:
            raise KeyError(feature)
        if provider not in PROVIDERS:
            raise ValueError(f"unknown provider {provider}")
        model = model or DEFAULT_MODELS[provider]
        with self.lock:
            self.db.execute("UPDATE feature_settings SET provider=?, model=?, officer_may_switch=? WHERE feature=?",
                            (provider, model, int(officer_may_switch), feature))
            self.db.commit()
        self.log(actor, "settings_changed", feature, None, {"provider": provider, "model": model, "officer_may_switch": officer_may_switch})
        return self.get_settings()[feature]

    # ---- audit ----
    def log(self, actor: str, action: str, feature: str | None, case_ref: str | None, detail: dict) -> int:
        if action not in AUDIT_ACTIONS:
            raise ValueError(action)
        with self.lock:
            last = self.db.execute("SELECT hash FROM audit ORDER BY seq DESC LIMIT 1").fetchone()
            prev = last[0] if last else "0" * 64
            at = _now()
            payload = json.dumps(detail, ensure_ascii=False, sort_keys=True)
            h = hashlib.sha256("|".join([prev, at, actor, action, feature or "", case_ref or "", payload]).encode()).hexdigest()
            cur = self.db.execute("INSERT INTO audit(at,actor,action,feature,case_ref,detail,prev_hash,hash) VALUES (?,?,?,?,?,?,?,?)",
                                  (at, actor, action, feature, case_ref, payload, prev, h))
            self.db.commit()
            return cur.lastrowid

    def find_request(self, request_id: str) -> dict | None:
        """The audit row of a successful AI request, so decisions can only refer to real drafts."""
        row = self.db.execute("SELECT feature, case_ref FROM audit WHERE action='ai_request' "
                              "AND json_extract(detail, '$.request_id') = ?", (request_id,)).fetchone()
        return {"feature": row[0], "case_ref": row[1]} if row else None

    def audit_rows(self, limit: int = 100) -> list[dict]:
        rows = self.db.execute("SELECT seq,at,actor,action,feature,case_ref,detail,hash FROM audit ORDER BY seq DESC LIMIT ?", (limit,)).fetchall()
        return [{"seq": s, "at": a, "actor": ac, "action": act, "feature": f, "case_ref": c, "detail": json.loads(d), "hash": h}
                for s, a, ac, act, f, c, d, h in rows]

    def verify_chain(self) -> bool:
        prev = "0" * 64
        for at, actor, action, feature, case_ref, detail, prev_hash, h in self.db.execute(
                "SELECT at,actor,action,feature,case_ref,detail,prev_hash,hash FROM audit ORDER BY seq"):
            if prev_hash != prev:
                return False
            calc = hashlib.sha256("|".join([prev, at, actor, action, feature or "", case_ref or "", detail]).encode()).hexdigest()
            if calc != h:
                return False
            prev = h
        return True
