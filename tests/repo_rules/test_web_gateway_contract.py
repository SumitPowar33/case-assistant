"""Contract between the web app and the AI gateway: every ai(...) call of the web app goes to a route the gateway has,
with that method, and every key of the body it sends is a field of the pydantic model the route reads, and every field
without a default is sent. Pydantic ignores an unknown field, so a misspelled one would be dropped without any error
(for example a misspelled case_ref would leave the audit log without the case). Read from the source of both sides with
the Python parser, so it needs no running gateway.
"""
import ast
import re

from test_web_core_contract import ROOT, WEB, shape
from test_web_core_fields import closing, split_top

GATEWAY = ROOT / "services/ai-gateway/app/main.py"
METHODS = {"get", "post", "put", "delete", "patch"}


def models(tree):
    """model name -> (fields, fields without a default) for every class whose base is BaseModel."""
    out = {}
    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef) and any(isinstance(b, ast.Name) and b.id == "BaseModel" for b in node.bases):
            fields, required = set(), set()
            for item in node.body:
                if isinstance(item, ast.AnnAssign) and isinstance(item.target, ast.Name):
                    fields.add(item.target.id)
                    v = item.value
                    field_call = isinstance(v, ast.Call) and getattr(v.func, "id", "") == "Field"
                    has_default = v is not None and (not field_call or v.args or any(k.arg in ("default", "default_factory") for k in v.keywords))
                    if not has_default:
                        required.add(item.target.id)
            out[node.name] = (fields, required)
    return out


def gateway_routes():
    """(METHOD, path regex) -> name of the body model, or None for a route that reads no body."""
    tree = ast.parse(GATEWAY.read_text(encoding="utf-8"))
    known = models(tree)
    routes = {}
    for node in ast.walk(tree):
        if not isinstance(node, ast.FunctionDef):
            continue
        for d in node.decorator_list:
            if isinstance(d, ast.Call) and isinstance(d.func, ast.Attribute) and d.func.attr in METHODS and d.args:
                path = d.args[0].value
                body = next((a.annotation.id for a in node.args.args if isinstance(a.annotation, ast.Name) and a.annotation.id in known), None)
                routes[(d.func.attr.upper(), re.compile(re.sub(r"\{[^/}]+\}", "[^/]+", path) + "$"))] = body
    return routes, known


def web_ai_calls():
    """(file, METHOD, url, body keys or None) for every ai(...) call of the web app."""
    out = []
    for path in WEB:
        text = path.read_text(encoding="utf-8")
        for m in re.finditer(r"\bai\s*(?:<[^()]*?>)?\(", text):
            if text[m.start() - 9:m.start()].endswith("function "):
                continue   # the definition in api.ts
            args = split_top(text[m.end():closing(text, m.end() - 1) - 1])
            url = args[0].strip()[1:-1]
            method, keys = "GET", None
            if len(args) > 1:
                options = {p.split(":", 1)[0].strip(): p.split(":", 1)[1].strip() for p in split_top(args[1].strip()[1:-1]) if ":" in p}
                method = options.get("method", "'GET'").strip("'\"")
                if "body" in options:
                    body = options["body"]
                    assert body.startswith("{"), f"{path.name}: the body of ai('{url}') must be an object written in the call"
                    keys = {re.match(r"\s*(\w+)", p)[1] for p in split_top(body[1:-1]) if p.strip() and not p.strip().startswith("...")}
            out.append((path.name, method, url, keys))
    return out


def test_there_are_calls_and_routes_to_check():
    routes, known = gateway_routes()
    assert len(web_ai_calls()) >= 5 and len(routes) >= 6 and {"GenerateIn", "DecisionIn", "SettingIn"} <= set(known)


def test_every_ai_call_reaches_a_gateway_route_and_sends_exactly_the_fields_its_model_reads():
    routes, known = gateway_routes()
    problems = []
    for f, method, url, keys in web_ai_calls():
        match = [body for (m, rx), body in routes.items() if m == method and rx.match(shape(url))]
        if not match:
            problems.append(f"{f}: {method} {url} has no route in the AI gateway")
            continue
        model = match[0]
        if model is None:
            if keys:
                problems.append(f"{f}: {method} {url} sends {sorted(keys)}, but the gateway route reads no body")
            continue
        fields, required = known[model]
        keys = keys or set()
        if keys - fields:
            problems.append(f"{f}: {method} {url} sends {sorted(keys - fields)}, which {model} does not have (it has {sorted(fields)})")
        if required - keys:
            problems.append(f"{f}: {method} {url} leaves out required {sorted(required - keys)} of {model}")
    assert not problems, "\n".join(problems)


def test_the_model_reader_knows_defaults_and_required_fields():
    tree = ast.parse("class A(BaseModel):\n a: str\n b: str = ''\n c: int = Field(min_length=1)\n d: int = Field(default=3)\n"
                     " e: int = Field(5, ge=1)\n f: list = Field(default_factory=list)\nclass B(Other):\n x: int\n")
    assert models(tree) == {"A": ({"a", "b", "c", "d", "e", "f"}, {"a", "c"})}
