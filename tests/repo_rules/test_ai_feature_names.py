"""The AI settings screen names each gateway feature in the screen language (`aiFeature.<id>` in the screen catalogs,
SettingsPage.tsx); the gateway sends only an English label. This keeps the two in step: every feature of the gateway
has a name in the catalogs with the gateway's own English words, and the catalogs name no feature the gateway lacks.
"""
import ast
import json

from test_web_core_contract import ROOT

CATALOG = ROOT / "apps/web/src/i18n/en.json"


def gateway_features():
    tree = ast.parse((ROOT / "services/ai-gateway/app/store.py").read_text(encoding="utf-8"))
    for node in tree.body:
        if isinstance(node, ast.Assign) and any(getattr(t, "id", None) == "FEATURES" for t in node.targets):
            return ast.literal_eval(node.value)
    raise AssertionError("FEATURES not found in the gateway's store.py")


def test_every_gateway_feature_has_its_name_in_the_screen_catalogs_and_no_other():
    features = gateway_features()
    names = {k.split(".", 1)[1]: v for k, v in json.loads(CATALOG.read_text(encoding="utf-8")).items() if k.startswith("aiFeature.")}
    assert names == features
