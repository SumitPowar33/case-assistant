"""The questions "Ask the case file" refuses are refused alike in the browser and in the AI gateway (weekly review 14 Nov
2026): the three patterns of apps/web/src/askFile.ts are the gateway's REFUSED_QUESTIONS, character for character."""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def web_patterns():
    src = (ROOT / "apps/web/src/askFile.ts").read_text(encoding="utf-8")
    return {why: re.search(rf"^const {name} = /(.*)/i$", src, re.M).group(1)
            for why, name in (("guilt", "GUILT"), ("truth", "TRUTH"), ("predict", "PREDICT"))}


def gateway_patterns():
    src = (ROOT / "services/ai-gateway/app/main.py").read_text(encoding="utf-8")
    block = src[src.index("REFUSED_QUESTIONS = {"):]
    block = block[:block.index("\n}\n")]
    out = {}
    for why, body in re.findall(r'"(\w+)": re\.compile\((.*?), re\.I\)', block, re.S):
        out[why] = "".join(re.findall(r'r"((?:[^"\\]|\\.)*)"', body))
    return out


def test_the_browser_and_the_gateway_refuse_the_same_questions():
    web, gateway = web_patterns(), gateway_patterns()
    assert set(web) == set(gateway) == {"guilt", "truth", "predict"}
    for why in web:
        assert web[why] == gateway[why], why
