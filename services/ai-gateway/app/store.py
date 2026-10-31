"""Settings (which provider/model each feature uses, per state) and a tamper-evident audit log.

Demo storage is SQLite; the same tables move to PostgreSQL in the Java app later.
The audit log is append-only and hash-chained: each row stores the hash of the previous row, so editing or deleting
a row breaks `verify_chain()`. With a key (AI_AUDIT_KEY) each hash is an HMAC, so someone who can write the file
cannot recompute the chain; a separate chain head (last row and its hash, also keyed) shows rows cut from the end, and the core app keeps
the head too (auth.ChainAnchor), so an older copy of the whole file put back no longer verifies.
Rows written before the key existed stay verifiable with plain SHA-256 (column `alg`).
Writes take SQLite's write lock (BEGIN IMMEDIATE), so several gateway processes on one file cannot fork the chain.
"""
from __future__ import annotations

import hashlib
import hmac
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
AUDIT_ACTIONS = {"ai_request", "ai_error", "ai_refused", "accepted", "edited", "rejected", "settings_changed"}
GENESIS = "0" * 64


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class Store:
    def __init__(self, path: str = ":memory:", key: str | None = None):
        # autocommit mode: every write below opens its own BEGIN IMMEDIATE transaction
        self.db = sqlite3.connect(path, check_same_thread=False, isolation_level=None)
        self.key = key.encode() if key else None
        self.lock = threading.Lock()
        with self.lock:
            self.db.executescript("""
            CREATE TABLE IF NOT EXISTS feature_settings (
              feature TEXT PRIMARY KEY, provider TEXT NOT NULL, model TEXT NOT NULL,
              officer_may_switch INTEGER NOT NULL DEFAULT 1);
            CREATE TABLE IF NOT EXISTS state_settings (
              state TEXT NOT NULL, feature TEXT NOT NULL, provider TEXT NOT NULL, model TEXT NOT NULL,
              officer_may_switch INTEGER NOT NULL DEFAULT 1, PRIMARY KEY (state, feature));
            CREATE TABLE IF NOT EXISTS audit (
              seq INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, actor TEXT NOT NULL,
              action TEXT NOT NULL, feature TEXT, case_ref TEXT, detail TEXT NOT NULL,
              prev_hash TEXT NOT NULL, hash TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS chain_head (id INTEGER PRIMARY KEY CHECK (id = 1), seq INTEGER NOT NULL, hash TEXT NOT NULL, mac TEXT NOT NULL);
            """)
            cols = {r[1] for r in self.db.execute("PRAGMA table_info(audit)")}
            if "alg" not in cols:
                self.db.execute("ALTER TABLE audit ADD COLUMN alg TEXT NOT NULL DEFAULT 'sha256'")
            if "state" not in cols:
                self.db.execute("ALTER TABLE audit ADD COLUMN state TEXT")
            for f in FEATURES:
                self.db.execute("INSERT OR IGNORE INTO feature_settings VALUES (?,?,?,1)", (f, "claude", DEFAULT_MODELS["claude"]))

    def _hash(self, alg: str, text: str) -> str:
        if alg == "hmac1":
            if not self.key:
                raise ValueError("an HMAC row needs AI_AUDIT_KEY")
            return hmac.new(self.key, text.encode(), hashlib.sha256).hexdigest()
        return hashlib.sha256(text.encode()).hexdigest()

    @staticmethod
    def _text(alg, prev, at, actor, action, feature, case_ref, detail, state) -> str:
        parts = [prev, at, actor, action, feature or "", case_ref or "", detail]
        if alg != "sha256" or state is not None:   # rows from before the state column hash without it
            parts.append(state or "")
        return "|".join(parts)

    def _head_mac(self, seq: int, h: str) -> str:
        return self._hash("hmac1" if self.key else "sha256", f"head|{seq}|{h}")

    # ---- settings ----
    def get_settings(self, state: str | None = None) -> dict:
        """The installation's defaults, with the state's own choices on top (a state admin sets only their state's)."""
        out = {f: {"label": FEATURES[f], "provider": p, "model": m, "officer_may_switch": bool(sw)}
               for f, p, m, sw in self.db.execute("SELECT feature, provider, model, officer_may_switch FROM feature_settings")}
        if state:
            for f, p, m, sw in self.db.execute("SELECT feature, provider, model, officer_may_switch FROM state_settings WHERE state=?", (state,)):
                out[f] = {"label": FEATURES[f], "provider": p, "model": m, "officer_may_switch": bool(sw)}
        return out

    def set_setting(self, feature: str, provider: str, model: str | None, officer_may_switch: bool, actor: str,
                    state: str | None = None) -> dict:
        if feature not in FEATURES:
            raise KeyError(feature)
        if provider not in PROVIDERS:
            raise ValueError(f"unknown provider {provider}")
        model = model or DEFAULT_MODELS[provider]
        with self.lock:
            if state:
                self.db.execute("INSERT INTO state_settings VALUES (?,?,?,?,?) ON CONFLICT (state, feature) DO UPDATE SET "
                                "provider=excluded.provider, model=excluded.model, officer_may_switch=excluded.officer_may_switch",
                                (state, feature, provider, model, int(officer_may_switch)))
            else:
                self.db.execute("UPDATE feature_settings SET provider=?, model=?, officer_may_switch=? WHERE feature=?",
                                (provider, model, int(officer_may_switch), feature))
        self.log(actor, "settings_changed", feature, None, {"provider": provider, "model": model, "officer_may_switch": officer_may_switch}, state)
        return self.get_settings(state)[feature]

    # ---- audit ----
    def log(self, actor: str, action: str, feature: str | None, case_ref: str | None, detail: dict, state: str | None = None) -> int:
        if action not in AUDIT_ACTIONS:
            raise ValueError(action)
        alg = "hmac1" if self.key else "sha256"
        with self.lock:
            self.db.execute("BEGIN IMMEDIATE")   # one writer at a time, across processes too
            try:
                last = self.db.execute("SELECT hash FROM audit ORDER BY seq DESC LIMIT 1").fetchone()
                prev = last[0] if last else GENESIS
                at = _now()
                payload = json.dumps(detail, ensure_ascii=False, sort_keys=True)
                h = self._hash(alg, self._text(alg, prev, at, actor, action, feature, case_ref, payload, state))
                cur = self.db.execute("INSERT INTO audit(at,actor,action,feature,case_ref,detail,prev_hash,hash,alg,state) VALUES (?,?,?,?,?,?,?,?,?,?)",
                                      (at, actor, action, feature, case_ref, payload, prev, h, alg, state))
                seq = cur.lastrowid
                self.db.execute("INSERT INTO chain_head VALUES (1,?,?,?) ON CONFLICT (id) DO UPDATE SET seq=excluded.seq, hash=excluded.hash, mac=excluded.mac",
                                (seq, h, self._head_mac(seq, h)))
                self.db.execute("COMMIT")
            except BaseException:
                self.db.execute("ROLLBACK")
                raise
            return seq

    def find_request(self, request_id: str) -> dict | None:
        """The audit row of a successful AI request, so decisions can only refer to real drafts."""
        row = self.db.execute("SELECT feature, case_ref, actor FROM audit WHERE action='ai_request' "
                              "AND json_extract(detail, '$.request_id') = ?", (request_id,)).fetchone()
        return {"feature": row[0], "case_ref": row[1], "actor": row[2]} if row else None

    def decided(self, request_id: str) -> bool:
        return self.db.execute("SELECT 1 FROM audit WHERE action IN ('accepted','edited','rejected') "
                               "AND json_extract(detail, '$.request_id') = ?", (request_id,)).fetchone() is not None

    def audit_rows(self, limit: int = 100, state: str | None = None) -> list[dict]:
        """Newest first; a state admin passes their state and sees only its rows (the platform admin passes None)."""
        rows = self.db.execute("SELECT seq,at,actor,action,feature,case_ref,detail,hash,state FROM audit WHERE ? IS NULL OR state = ? "
                               "ORDER BY seq DESC LIMIT ?", (state, state, limit)).fetchall()
        return [{"seq": s, "at": a, "actor": ac, "action": act, "feature": f, "case_ref": c, "detail": json.loads(d), "hash": h, "state": st}
                for s, a, ac, act, f, c, d, h, st in rows]

    def head(self) -> tuple[int, str] | None:
        """The last row's sequence number and hash (None before the first row)."""
        row = self.db.execute("SELECT seq, hash FROM audit ORDER BY seq DESC LIMIT 1").fetchone()
        return (row[0], row[1]) if row else None

    def agrees_with(self, anchor: dict) -> bool:
        """Whether this file holds the head the core app keeps (an older copy of the file, or one rewritten after it, does not)."""
        if not anchor:
            return True   # nothing anchored yet
        row = self.db.execute("SELECT hash FROM audit WHERE seq = ?", (anchor.get("seq"),)).fetchone()
        return row is not None and isinstance(anchor.get("hash"), str) and hmac.compare_digest(row[0], anchor["hash"])

    def verify_chain(self) -> bool:
        prev, seq, keyed = GENESIS, 0, False
        for seq, at, actor, action, feature, case_ref, detail, prev_hash, h, alg, state in self.db.execute(
                "SELECT seq,at,actor,action,feature,case_ref,detail,prev_hash,hash,alg,state FROM audit ORDER BY seq"):
            if prev_hash != prev:
                return False
            keyed = keyed or alg != "sha256"
            try:
                if not hmac.compare_digest(self._hash(alg, self._text(alg, prev, at, actor, action, feature, case_ref, detail, state)), h):
                    return False
            except ValueError:   # an HMAC row but no key to check it with
                return False
            prev = h
        head = self.db.execute("SELECT seq, hash, mac FROM chain_head WHERE id = 1").fetchone()
        if head is None:
            return not keyed   # rows from before the head existed are checked by their links only
        return head[0] == seq and head[1] == prev and hmac.compare_digest(head[2], self._head_mac(head[0], head[1]))
