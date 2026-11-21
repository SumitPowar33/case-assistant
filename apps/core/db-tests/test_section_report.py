"""V64: the report to the Magistrate on sections added during the investigation (A2). All data is fictional."""
import psycopg
import pytest

from test_schema import db, one, seed_case  # noqa: F401  (db is the fixture)

TEXT = "FIR No. 214/2026: the section IT Act 66D has been added for the reasons given."


def added(db, fir, io, section="66D", at="2026-08-20 01:00+05:30"):
    db.execute("""INSERT INTO fir_section(fir_id,act,section,chosen_by,added_at,reason)
                  VALUES (%s,'IT Act',%s,%s,%s,'The caller used a phone to pose as the bank')""", (fir, section, io, at))


def report(db, fir, io, sent_on="2026-08-21", court="Court of the Demo Magistrate"):
    return one(db, "INSERT INTO section_report(fir_id,court,sent_on,report_text,recorded_by) VALUES (%s,%s,%s,%s,%s) RETURNING id",
               fir, court, sent_on, TEXT, io)[0]


def item(db, rid, fir, section="66D", act="IT Act"):
    db.execute("INSERT INTO section_report_item(report_id,fir_id,act,section) VALUES (%s,%s,%s,%s)", (rid, fir, act, section))


def test_an_added_section_is_reported_once(db):
    st, io, fir = seed_case(db)
    added(db, fir, io)
    item(db, report(db, fir, io), fir)
    with pytest.raises(psycopg.errors.UniqueViolation):
        item(db, report(db, fir, io), fir)


def test_a_section_given_at_registration_or_not_in_the_fir_is_not_reported(db):
    st, io, fir = seed_case(db)
    db.execute("INSERT INTO fir_section(fir_id,act,section) VALUES (%s,'BNS','318(4)')", (fir,))
    rid = report(db, fir, io)
    with pytest.raises(psycopg.errors.CheckViolation, match="only a section added after registration"):
        item(db, rid, fir, act="BNS", section="318(4)")
    with pytest.raises(psycopg.errors.CheckViolation, match="only a section added after registration"):
        item(db, rid, fir, section="66C")          # not in the FIR at all


def test_an_item_belongs_to_a_report_of_the_same_fir(db):
    st, io, fir = seed_case(db)
    other = one(db, """INSERT INTO fir(station_id,fir_year,fir_no,gd_entry_no,registered_at,information_received_at,
                       contents_original,contents_language,action_taken) VALUES (%s,2026,215,'GD-18','2026-08-18 12:00+05:30',
                       '2026-08-18 11:30+05:30','Demo text','mr','investigate') RETURNING id""", st)[0]
    added(db, fir, io)
    with pytest.raises(psycopg.errors.ForeignKeyViolation):
        item(db, report(db, other, io), fir)


def test_not_sent_before_the_section_was_added_india_time(db):
    st, io, fir = seed_case(db)
    added(db, fir, io, at="2026-08-20 00:30+05:30")      # 19 Aug in UTC, 20 Aug in India
    with pytest.raises(psycopg.errors.CheckViolation, match="before the section was added"):
        item(db, report(db, fir, io, sent_on="2026-08-19"), fir)
    item(db, report(db, fir, io, sent_on="2026-08-20"), fir)  # the same day is allowed


def test_not_sent_on_a_later_day(db):
    st, io, fir = seed_case(db)
    with pytest.raises(psycopg.errors.CheckViolation, match="later day"):
        report(db, fir, io, sent_on=one(db, "SELECT ist_date(now()) + 1")[0])
    report(db, fir, io, sent_on=one(db, "SELECT ist_date(now())")[0])


@pytest.mark.parametrize("court,text", [("  ", TEXT), ("x" * 201, TEXT), ("Court", "too short"), ("Court", " " * 50), ("Court", "x" * 20001)])
def test_court_and_text_are_checked(db, court, text):
    st, io, fir = seed_case(db)
    with pytest.raises(psycopg.errors.CheckViolation):
        db.execute("INSERT INTO section_report(fir_id,court,sent_on,report_text,recorded_by) VALUES (%s,%s,'2026-08-21',%s,%s)", (fir, court, text, io))


def test_kept_as_written_and_gone_only_with_the_fir(db):
    st, io, fir = seed_case(db)
    added(db, fir, io)
    rid = report(db, fir, io)
    item(db, rid, fir)
    for sql in ("UPDATE section_report SET court='Other court' WHERE id=%s", "DELETE FROM section_report WHERE id=%s",
                "UPDATE section_report_item SET section='66C' WHERE report_id=%s", "DELETE FROM section_report_item WHERE report_id=%s"):
        with pytest.raises(psycopg.errors.RaiseException, match="kept as written"):
            db.execute(sql, (rid,))
    db.execute("DELETE FROM fir WHERE id=%s", (fir,))
    assert one(db, "SELECT count(*) FROM section_report")[0] == 0
    assert one(db, "SELECT count(*) FROM section_report_item")[0] == 0
