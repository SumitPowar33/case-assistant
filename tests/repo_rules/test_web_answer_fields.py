"""Contract between the web app and its servers, part 3: the field names of the answers the screens read.

A screen reads an answer through a TypeScript type (useLoad<T>, get<T>). If the server stops writing a field, or never
wrote it under that name, the screen shows nothing or the wrong thing without any error (31 Oct 2026: the AI settings
screen read audit_chain_ok, which the gateway no longer wrote, and told every admin the audit chain was broken). Here
every field of the type a screen reads must be a name the server side writes: a word in the controller of the route, in
a class that controller names, or in a migration (a view read with select *); for the AI gateway, in its source.
This cannot see whether that word is written into this very answer, so it catches a name the server never writes at
all, which is how such a field breaks. Read from the source of both sides, so it needs no running server.
"""
import re

from test_web_core_contract import JAVA, ROOT, WEB, shape
from test_web_core_fields import closing

MAPPING = re.compile(r'@(Get)Mapping(?:\(\s*(?:value\s*=\s*)?"([^"]*)"[^)]*\))?')
CLASS_BASE = re.compile(r'@RequestMapping\(\s*"([^"]*)"')
CALL = re.compile(r"""\b(?:useLoad|get|ai)\s*<(?P<type>[^()]*?)>\(\s*(?P<q>[`'"])(?P<url>/[^`'"]*)(?P=q)""")
MIGRATIONS = " ".join(p.read_text(encoding="utf-8") for p in sorted((ROOT / "apps/core/src/main/resources/db/migration").glob("*.sql")))
GATEWAY = " ".join(p.read_text(encoding="utf-8") for p in sorted((ROOT / "services/ai-gateway/app").glob("*.py")))
CLASSES = {p.stem: p for p in JAVA}


def fields(literal):
    """Top-level field names of a TypeScript object type literal '{ a: string; b?: number }'."""
    body = re.sub(r"/\*.*?\*/|//[^\n]*", "", literal[1:-1], flags=re.S)
    names, depth, cur = [], 0, ""
    for ch in body + ";":
        if ch in "{[(<":
            depth += 1
        elif ch in "}])>":
            depth -= 1
        if depth == 0 and ch in ";,\n":
            m = re.match(r"\s*(?:readonly\s+)?(\w+)\??\s*:", cur)
            if m:
                names.append(m[1])
            cur = ""
        else:
            cur += ch
    return names


def type_literal(name, text):
    """The object literal of `type Name = {...}` (or `& {...}` parts of it) in this file, or None."""
    m = re.search(r"\btype\s+" + name + r"\s*=\s*", text)
    if not m:
        return None
    out, i = [], m.end()
    while True:
        while text[i] in " \n":
            i += 1
        if text[i] == "{":
            end = closing(text, i)
            out.append(text[i:end])
            i = end
        else:
            ref = re.match(r"(\w+)", text[i:])
            if not ref:
                break
            inner = type_literal(ref[1], text)
            out += [inner] if inner else []
            i += len(ref[1])
        rest = re.match(r"\s*&\s*", text[i:])
        if not rest:
            break
        i += rest.end()
    return " ".join(out) or None


def read_types():
    """(file, url, type text) of every call that reads an answer through a type."""
    out = []
    for path in WEB:
        text = path.read_text(encoding="utf-8")
        for m in CALL.finditer(text):
            t = m["type"].strip().removesuffix("[]").strip()
            t = re.sub(r"^Record<\s*string\s*,\s*(\w+)\s*>$", r"\1", t)   # a map of id -> T: the fields of T
            literal = t if t.startswith("{") else type_literal(t, text)
            if literal is None:
                imported = re.search(r"import\s+(?:type\s+)?\{[^}]*\b" + re.escape(t) + r"\b[^}]*\}\s+from\s+'\./(\w+)'", text)
                if imported:
                    literal = type_literal(t, (path.parent / (imported[1] + ".tsx")).read_text(encoding="utf-8")) if (path.parent / (imported[1] + ".tsx")).exists() else None
            assert literal, f"{path.name}: the type {t} read from {m['url']} was not found"
            out.append((path.name, m["url"], literal))
    return out


def handlers():
    """(GET path regex, text the answer comes from) for every GET route of the core."""
    out = []
    for path in JAVA:
        text = path.read_text(encoding="utf-8")
        base = (CLASS_BASE.search(text) or [None, ""])[1]
        named = {c for c in re.findall(r"\b([A-Z]\w+)\b", text) if c in CLASSES and CLASSES[c] != path}
        source = text + " ".join(CLASSES[c].read_text(encoding="utf-8") for c in named)
        for _, sub in MAPPING.findall(text):
            out.append((re.compile(re.sub(r"\{[^/}]+\}", "[^/]+", base + sub) + "$"), source))
    return out


def test_there_are_typed_answers_to_check():
    assert len(read_types()) > 30
    assert fields("{ a: string; b?: { c: number }, /** d */ d: Array<{ e: 1 }>\n f: x }") == ["a", "b", "d", "f"]


def test_every_field_a_screen_reads_is_written_by_its_server():
    routes = handlers()
    missing, checked = [], 0
    for name, url, literal in read_types():
        if url.startswith("/v1/") or url == "/health":   # the AI gateway
            source = GATEWAY
        else:
            source = next((s for rx, s in routes if rx.match("/api" + shape(url))), None)
            assert source, f"{name}: no GET route for {url}"
            source += MIGRATIONS
        for field in fields(literal):
            checked += 1
            if not re.search(r"\b" + field + r"\b", source):
                missing.append(f"{name}: {url} reads '{field}', which the server never writes")
    assert not missing, "\n".join(missing)
    assert checked > 150
