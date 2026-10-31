"""Contract between the web app and the core, part 2: the field names of every request body the web app sends.

The core reads a body into a Java record. Jackson ignores a field the record does not have, so a misspelled or renamed
field would arrive as null without any error. Here every key of every object the web app sends must be a component of
the record the route reads, and every component marked @NotNull or @NotBlank must be sent. Read from the source of both
sides (like test_web_core_contract.py), so it needs no running server.
"""
import re

from test_web_core_contract import JAVA, WEB, shape

MAPPING = re.compile(r'@(Post|Put|Patch)Mapping(?:\(\s*(?:value\s*=\s*)?"([^"]*)"[^)]*\))?')
CLASS_BASE = re.compile(r'@RequestMapping\(\s*"([^"]*)"')
BODY = re.compile(r"@RequestBody\s+(?:@\w+\s+)*(\w+)\s+\w+")
REQUIRED = ("@NotNull", "@NotBlank", "@NotEmpty")


def split_top(text, angle=False):
    """Splits at commas where no bracket, string or template is open (and no <generic> when angle, for Java types)."""
    parts, depth, cur, quote = [], 0, "", None
    for ch in text:
        if quote:
            quote = None if ch == quote else quote
        elif ch in "'\"`":
            quote = ch
        elif ch in "([{" or (angle and ch == "<"):
            depth += 1
        elif (ch in ")]}" or (angle and ch == ">")) and depth:
            depth -= 1
        elif ch == "," and depth == 0:
            parts.append(cur)
            cur = ""
            continue
        cur += ch
    return parts + [cur] if cur.strip() else parts


def closing(text, start):
    """Index just after the bracket that closes text[start]."""
    pairs = {"(": ")", "{": "}", "[": "]"}
    stack, quote, i = [], None, start
    while i < len(text):
        ch = text[i]
        if quote:
            if ch == "\\":
                i += 1
            elif ch == quote:
                quote = None
        elif ch in "'\"`":
            quote = ch
        elif ch in pairs:
            stack.append(pairs[ch])
        elif stack and ch == stack[-1]:
            stack.pop()
            if not stack:
                return i + 1
        i += 1
    raise ValueError("unclosed bracket")


def records():
    """record name -> {file: (components, required components)}; nested records are looked up in their own file first."""
    found = {}
    for path in JAVA:
        text = path.read_text(encoding="utf-8")
        for m in re.finditer(r"\brecord\s+(\w+)\s*\(", text):
            body = text[m.end() - 1 + 1:closing(text, m.end() - 1) - 1]
            comps, required = set(), set()
            for part in split_top(body, angle=True):
                renamed = re.search(r'@JsonProperty\("([^"]+)"\)', part)
                name = renamed[1] if renamed else re.findall(r"\w+", part)[-1]
                comps.add(name)
                if any(a in part for a in REQUIRED):
                    required.add(name)
            found.setdefault(m[1], {})[path.name] = (comps, required)
    return found


def core_bodies():
    """(method, url regex) -> (record name, file) for every route that reads a body."""
    routes = {}
    for path in JAVA:
        text = path.read_text(encoding="utf-8")
        base = (CLASS_BASE.search(text) or [None, ""])[1]
        for m in MAPPING.finditer(text):
            signature = text[m.end():text.index("{", text.index("(", m.end()))]
            body = BODY.search(signature)
            if body:
                pattern = re.sub(r"\{[^/}]+\}", "[^/]+", base + (m[2] or ""))
                routes[(m[1].upper(), re.compile(pattern + "$"))] = (body[1], path.name)
    return routes


def web_bodies():
    """(file, method, url, keys) for every send(...) whose body is an object written in the call."""
    out = []
    for path in WEB:
        text = path.read_text(encoding="utf-8")
        for m in re.finditer(r"\bsend\s*(?:<[^()]*?>)?\(", text):
            args = split_top(text[m.end():closing(text, m.end() - 1) - 1])
            if len(args) < 3 or not args[0].strip()[:1] in "`'\"" or not args[2].strip().startswith("{"):
                continue
            url = args[0].strip()[1:-1]
            method = args[1].strip().strip("'\"")
            keys = {re.match(r"\s*(\w+)", p)[1] for p in split_top(args[2].strip()[1:-1]) if p.strip() and not p.strip().startswith("...")}
            out.append((path.name, method, url, keys))
    return out


def body_record(method, url, routes, recs):
    for (m, rx), (name, java_file) in routes.items():
        if m == method and rx.match("/api" + shape(url)):
            by_file = recs[name]
            return name, by_file.get(java_file) or next(iter(by_file.values()))
    return None, None


def test_there_are_bodies_to_check():
    assert len(web_bodies()) > 30 and len(core_bodies()) > 30


def test_every_field_the_web_app_sends_is_read_by_the_core_and_every_required_one_is_sent():
    routes, recs = core_bodies(), records()
    problems = []
    for f, method, url, keys in web_bodies():
        name, rec = body_record(method, url, routes, recs)
        if rec is None:
            if keys:   # an empty {} to a route that reads no body is fine
                problems.append(f"{f}: {method} {url} sends {sorted(keys)}, but the core route reads no body")
            continue
        comps, required = rec
        if keys - comps:
            problems.append(f"{f}: {method} {url} sends {sorted(keys - comps)}, which {name} does not have (it has {sorted(comps)})")
        if required - keys:
            problems.append(f"{f}: {method} {url} leaves out required {sorted(required - keys)} of {name}")
    assert not problems, "\n".join(problems)


def test_the_parsers_read_what_they_should():
    assert split_top("a, f(b, c), { d, e }, 'x,y', g: x > 1 ? h(i, j) : k") == ["a", " f(b, c)", " { d, e }", " 'x,y'", " g: x > 1 ? h(i, j) : k"]
    assert split_top("Map<String, String> m, int n", angle=True) == ["Map<String, String> m", " int n"]
    text = "record R(@NotBlank String a, @JsonProperty(\"b_c\") List<String> bc, Integer n) {}"
    assert closing(text, text.index("(")) == text.index(")", text.index("Integer")) + 1
