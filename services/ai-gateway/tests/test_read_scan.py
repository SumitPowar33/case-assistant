"""POST /v1/read-scan (A4): the text of a scanned or photographed reply, read by OCR on the state's own server."""
import hashlib
import os
import shutil
import subprocess

os.environ["AI_GATEWAY_AUTOSTART"] = "0"

import pytest
from fastapi.testclient import TestClient

from app import main as gateway_main
from app import scanreader
from app.main import create_app
from app.scanreader import FakeScanReader, LocalScanReader, ScanReaderError, from_env, kind_of
from app.store import Store
from test_gateway import (CASE, NOT_MINE, PROTECTED, SECRET, core_says_active, token,  # noqa: F401
                          no_core_for_the_case_check, no_core_for_the_chain_head)

PNG = b"\x89PNG\r\n\x1a\n"
# the stand-in "reads" a file whose bytes after the signature are text (a fictional bank's reply)
REPLY = PNG + "Fictional Bank: account XXXX4417 statement 01-08-2026 to 31-08-2026 enclosed. 63(4) certificate enclosed.".encode()


def client(reader=None):
    store = Store(":memory:")
    app = create_app(store, {}, SECRET, core_says_active, scanreader=reader or FakeScanReader())
    return TestClient(app, headers={"Authorization": "Bearer " + token("io-1", "state_admin")}), store


def post(c, data=REPLY, case=CASE):
    return c.post(f"/v1/read-scan?case_ref={case}", content=data, headers={"Content-Type": "application/octet-stream"})


def test_the_scan_is_read_as_a_draft_and_logged_without_its_text():
    c, store = client()
    r = post(c)
    assert r.status_code == 200
    out = r.json()
    assert out["text"].startswith("Fictional Bank: account XXXX4417") and out["model"] == "fake-ocr" and out["pages"] == 1
    assert "against the paper" in out["label"]
    row = store.audit_rows(1)[0]
    assert row["action"] == "ai_transcribe" and row["feature"] == "reply_scan" and row["case_ref"] == CASE
    assert row["detail"]["file_sha256"] == hashlib.sha256(REPLY).hexdigest() and row["detail"]["kind"] == "png"
    assert row["detail"]["request_id"] == out["request_id"]
    # words of the reply that no random id or hash in the row can spell by chance ("4417" alone once did, and failed the run)
    assert "XXXX4417" not in str(row) and "Fictional Bank" not in str(row)
    assert store.verify_chain()


def test_the_officer_decides_on_it_once_and_the_counts_show_it():
    c, _ = client()
    rid = post(c).json()["request_id"]
    d = {"request_id": rid, "decision": "accepted", "feature": "reply_scan", "case_ref": CASE}
    assert c.post("/v1/decisions", json=d).status_code == 200
    assert c.post("/v1/decisions", json=d).status_code == 409
    use = c.get(f"/v1/ai-use?case_ref={CASE}").json()
    assert use["features"] == [{"feature": "reply_scan", "label": "Read a scanned reply (OCR on this server)",
                                "asked": 1, "accepted": 1, "edited": 0, "rejected": 0, "refused": 0, "failed": 0, "embedded": 0}]


def test_a_protected_case_is_allowed_because_nothing_leaves_the_server():
    c, _ = client()
    assert post(c, case=PROTECTED).status_code == 200


def test_only_pdf_and_image_files_are_taken_by_their_first_bytes():
    assert [kind_of(b) for b in (b"%PDF-1.7", PNG, b"\xff\xd8\xff\xe0", b"II*\x00", b"MM\x00*", b"GIF89a", b"<html>")] == \
        ["pdf", "png", "jpeg", "tiff", "tiff", None, None]
    c, store = client()
    r = post(c, b"<html>a page named reply.pdf</html>")
    assert r.status_code == 415 and store.audit_rows(1)[0]["action"] == "ai_refused"


def test_refusals_are_logged():
    c, store = client()
    cases = [(post(c, case=NOT_MINE), 404), (post(c, case="not-a-uuid"), 422), (post(c, data=b""), 422)]
    for r, status in cases:
        assert r.status_code == status
    assert [r["action"] for r in store.audit_rows(3)] == ["ai_refused"] * 3
    assert TestClient(c.app).post(f"/v1/read-scan?case_ref={CASE}", content=REPLY).status_code == 401


def test_a_too_large_file_is_refused(monkeypatch):
    monkeypatch.setattr(gateway_main, "MAX_SCAN_BYTES", 10)
    c, _ = client()
    r = post(c, PNG + b"x" * 3)
    assert r.status_code == 413 and "file is longer" in r.json()["detail"]


def test_a_burst_is_slowed(monkeypatch):
    monkeypatch.setattr(gateway_main, "SCANS_PER_WINDOW", 1)
    c, _ = client()
    assert [post(c).status_code for _ in range(2)] == [200, 429]


def test_a_file_the_stand_in_cannot_read_gets_a_notice():
    c, _ = client()
    assert "no OCR read this jpeg" in post(c, b"\xff\xd8\xff\xfe\xff").json()["text"]


class Broken:
    name = "broken"

    def read(self, data, kind):
        raise ScanReaderError("the OCR program tesseract is not installed on this server")


def test_a_reader_that_is_not_installed_gives_503_and_is_logged():
    c, store = client(Broken())
    r = post(c)
    assert r.status_code == 503 and "not installed" in r.json()["detail"]
    assert store.audit_rows(1)[0]["action"] == "ai_refused"


def fake_run(answers, seen):
    """Stands in for subprocess.run: answers by program name, keeps each command (and the files it was given)."""
    def run(args, capture_output, timeout, check):
        seen.append(args)
        out = answers[args[0]]
        if isinstance(out, BaseException):
            raise out
        if args[0] == "pdftoppm":   # draws two pages into the folder it is given
            for n in (1, 2):
                open(f"{args[-1]}-{n}.png", "wb").write(PNG)
            out = ""
        return subprocess.CompletedProcess(args, 0, out.encode() if isinstance(out, str) else out(args).encode(), b"")
    return run


def test_the_local_reader_uses_the_installed_languages_and_reads_an_image(monkeypatch):
    seen = []
    monkeypatch.setattr(scanreader.subprocess, "run", fake_run({"tesseract": lambda a: "eng\nhin\n" if a[1] == "--list-langs" else " Reply text \n"}, seen))
    assert LocalScanReader("eng+hin+mar").read(PNG, "png") == ("Reply text", 1)
    assert seen[1][-2:] == ["-l", "eng+hin"] and seen[1][1].endswith("in.png") and not os.path.exists(seen[1][1])


def test_a_pdf_with_its_own_text_is_not_ocred_and_a_scanned_pdf_is_drawn_page_by_page(monkeypatch):
    seen = []
    pdf_text = {"tesseract": lambda a: "eng\n" if a[1] == "--list-langs" else "page words", "pdftotext": "First page of the reply\fSecond page\f"}
    monkeypatch.setattr(scanreader.subprocess, "run", fake_run(pdf_text, seen))
    assert LocalScanReader("eng").read(b"%PDF-1.4", "pdf") == ("First page of the reply\n\nSecond page", 2)
    assert [a[0] for a in seen] == ["tesseract", "pdftotext"]
    seen.clear()
    monkeypatch.setattr(scanreader.subprocess, "run", fake_run({**pdf_text, "pdftotext": "\f \f", "pdftoppm": ""}, seen))
    assert LocalScanReader("eng").read(b"%PDF-1.4", "pdf") == ("page words\n\npage words", 2)
    assert [a[0] for a in seen] == ["tesseract", "pdftotext", "pdftoppm", "tesseract", "tesseract"]
    assert "-l" in seen[2] and str(scanreader.MAX_PAGES) in seen[2]


@pytest.mark.parametrize("error, message", [
    (FileNotFoundError(), "not installed"),
    (subprocess.TimeoutExpired("tesseract", 1), "too long"),
    (subprocess.CalledProcessError(1, "tesseract"), "could not be read"),
])
def test_program_failures_are_clear_errors(monkeypatch, error, message):
    monkeypatch.setattr(scanreader.subprocess, "run", fake_run({"tesseract": error}, []))
    with pytest.raises(ScanReaderError, match=message):
        LocalScanReader().read(PNG, "png")


def test_without_english_language_data_it_says_so(monkeypatch):
    monkeypatch.setattr(scanreader.subprocess, "run", fake_run({"tesseract": "hin\n"}, []))
    with pytest.raises(ScanReaderError, match="English is not installed"):
        LocalScanReader().read(PNG, "png")


def test_the_backend_is_chosen_by_the_environment(monkeypatch):
    monkeypatch.setenv("OCR_BACKEND", "fake")
    assert isinstance(from_env(), FakeScanReader)
    monkeypatch.setenv("OCR_BACKEND", "local")
    monkeypatch.setenv("OCR_LANGUAGES", "eng+mar")
    assert from_env().wanted == ["eng", "mar"]


@pytest.mark.skipif(not shutil.which("tesseract"), reason="Tesseract is a deployment step; not installed here")
def test_the_real_tesseract_reads_a_drawn_reply(tmp_path):
    """Runs the real program where it is installed (the build container has it; CI does not)."""
    image = pytest.importorskip("PIL.Image")
    draw_mod = pytest.importorskip("PIL.ImageDraw")
    font_mod = pytest.importorskip("PIL.ImageFont")
    font = next((p for p in ["/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"] if os.path.exists(p)), None)
    if not font:
        pytest.skip("no font to draw the test page with")
    page = image.new("L", (1400, 200), 255)
    draw_mod.Draw(page).text((40, 60), "Account 50100417 statement enclosed", fill=0, font=font_mod.truetype(font, 48))
    page.save(tmp_path / "p.png")
    text, pages = LocalScanReader("eng").read((tmp_path / "p.png").read_bytes(), "png")
    assert "50100417" in text and "statement" in text and pages == 1


@pytest.mark.skipif(not (shutil.which("tesseract") and shutil.which("pdftoppm")), reason="OCR programs are a deployment step")
def test_the_real_programs_read_a_scanned_pdf(tmp_path):
    """A PDF that is only a picture of a page (as a scanner makes it): pdftotext finds nothing, so the page is drawn and read."""
    image = pytest.importorskip("PIL.Image")
    draw_mod = pytest.importorskip("PIL.ImageDraw")
    font_mod = pytest.importorskip("PIL.ImageFont")
    page = image.new("L", (1400, 200), 255)
    draw_mod.Draw(page).text((40, 60), "UTR 412345678901 credited", fill=0,
                             font=font_mod.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 48))
    page.save(tmp_path / "scan.pdf")
    text, pages = LocalScanReader("eng").read((tmp_path / "scan.pdf").read_bytes(), "pdf")
    assert "412345678901" in text and pages == 1


def test_when_the_core_cannot_check_the_case_the_file_is_refused():
    def down(tok, case_ref, kind):
        raise gateway_main.CoreUnavailable("cannot reach the core app to check the case")
    store = Store(":memory:")
    c = TestClient(create_app(store, {}, SECRET, core_says_active, case_check=down, scanreader=FakeScanReader()),
                   headers={"Authorization": "Bearer " + token("io-1", "state_admin")})
    assert post(c).status_code == 503 and store.audit_rows(1)[0]["action"] == "ai_refused"
