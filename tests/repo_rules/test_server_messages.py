"""The screen shows a server's English message in the screen language when a `server.*` text of the catalogs matches it
whole (apps/web/src/i18n.ts, translateServer). This keeps those texts in step with what the servers and the web app's
own calls (api.ts) actually write: each piece of a text between its {name} places must be written in that source, so a
reworded message fails here instead of quietly showing English on every other screen language.
"""
import json
import re

from test_web_core_contract import JAVA, ROOT

CATALOG = ROOT / "apps/web/src/i18n/en.json"
SOURCES = [*JAVA, ROOT / "apps/web/src/api.ts"]


def pieces(text):
    return [p for p in re.split(r"\{\w+\}", text) if p.strip()]


def test_every_server_text_is_written_by_a_server_or_by_the_web_app_calls():
    texts = {k: v for k, v in json.loads(CATALOG.read_text(encoding="utf-8")).items() if k.startswith("server.")}
    assert len(texts) > 60
    source = "\n".join(p.read_text(encoding="utf-8") for p in SOURCES)
    missing = [f"{k}: {p!r}" for k, v in texts.items() for p in pieces(v) if p not in source]
    assert not missing, "server texts no server writes any more:\n" + "\n".join(missing)


def test_a_server_text_has_words_besides_its_places():
    assert pieces("The server answered {status} for {path}") == ["The server answered ", " for "]
    assert pieces("{a}") == []
