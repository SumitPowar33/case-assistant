"""V65: the key that links an identifier of one FIR with the same identifier in another FIR of the station. Fictional data."""
import pytest

from test_schema import db, one  # noqa: F401  (db is the fixture)


def key(db, kind, value):
    return one(db, "SELECT fact_identifier_key(%s, %s)", kind, value)[0]


@pytest.mark.parametrize("value", ["+91 98765 41207", "098765-41207", "9876541207", "(+91) 98765.41207", "91-98765-41207"])
def test_a_phone_is_its_last_ten_digits_however_written(db, value):
    assert key(db, "phone", value) == "9876541207"


@pytest.mark.parametrize("value", ["98XXX 41207", "98*** 41207", "9876 5412", "1234567890123456", "call 9876541207", "98765•41207", "+91 98765 41207 ext"])
def test_a_masked_short_long_or_worded_phone_has_no_key(db, value):
    assert key(db, "phone", value) is None


def test_ten_and_thirteen_digits_are_the_edges_of_a_phone(db):
    assert key(db, "phone", "1234567890") == "1234567890"
    assert key(db, "phone", "1234567890123") == "4567890123"
    assert key(db, "phone", "123456789") is None
    assert key(db, "phone", "12345678901234") is None


@pytest.mark.parametrize("kind", ["account", "utr"])
def test_an_account_or_utr_ignores_spaces_dashes_slashes_and_letter_case(db, kind):
    assert key(db, kind, "sbin 0012-3456/789") == "SBIN00123456789"
    assert key(db, kind, "SBIN00123456789") == "SBIN00123456789"


@pytest.mark.parametrize("value", ["XXXX4471", "xx12345678", "1234**5678", "12345678.9", "1" * 36])
def test_a_masked_or_odd_account_has_no_key(db, value):
    assert key(db, "account", value) is None


def test_an_account_needs_eight_characters_and_a_utr_ten(db):
    assert key(db, "account", "12345678") == "12345678"
    assert key(db, "account", "1234567") is None
    assert key(db, "utr", "1234567890") == "1234567890"
    assert key(db, "utr", "123456789") is None
    assert key(db, "utr", "1" * 35) == "1" * 35
    assert key(db, "utr", "1" * 36) is None
    assert key(db, "utr", "NEFTX123456789") == "NEFTX123456789"   # one X is a letter of the number, not a mask


def test_a_upi_id_is_lower_case_and_needs_its_shape(db):
    assert key(db, "upi", " Demo.Payee@okdemo ") == "demo.payee@okdemo"
    for bad in ("demo payee@okdemo", "demopayee", "@okdemo", "d@okdemo", "xxxx@okdemo", "de**@okdemo", "a@b@c"):
        assert key(db, "upi", bad) is None, bad
    assert key(db, "upi", "alex@okdemo") == "alex@okdemo"   # an x inside a name is a letter, not a mask


@pytest.mark.parametrize("kind", ["date", "time", "place", "amount"])
def test_other_kinds_are_never_linked(db, kind):
    assert key(db, kind, "9876541207") is None


def test_the_key_is_indexed_for_the_station_look_up(db):
    assert one(db, "SELECT count(*) FROM pg_indexes WHERE indexname = 'fir_fact_identifier' AND schemaname = current_schema()")[0] == 1
