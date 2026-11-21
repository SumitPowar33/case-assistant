-- A2, the rest: the report to the Magistrate on sections added during the investigation (session 121). When the IO adds
-- a section after registration (V51, V60), the court that took the FIR's report (BNSS 176(1), CrPC 157 before 1 July
-- 2024) is told of it by a report; the app drafts that report from the case (FIR number, date, sections, the reasons
-- given), the officer edits it, sends it and records here the court, the day it was sent and the text as sent. Each added
-- section is in one report only; a section given at registration or by an import is never in one. Kept as written: a
-- mistake is answered by a case diary entry, as for the section itself. No person's name is put in the drafted text.
CREATE TABLE section_report (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fir_id      uuid NOT NULL REFERENCES fir(id) ON DELETE CASCADE,
  court       text NOT NULL CHECK (length(btrim(court)) BETWEEN 3 AND 200),
  sent_on     date NOT NULL,
  report_text text NOT NULL CHECK (length(btrim(report_text)) BETWEEN 40 AND 20000),
  recorded_by uuid NOT NULL REFERENCES app_user(id),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (id, fir_id)
);
CREATE INDEX section_report_case ON section_report (fir_id, sent_on);

CREATE TABLE section_report_item (
  report_id uuid NOT NULL,
  fir_id    uuid NOT NULL,
  act       text NOT NULL,
  section   text NOT NULL,
  PRIMARY KEY (fir_id, act, section),                                   -- one report per added section
  FOREIGN KEY (report_id, fir_id) REFERENCES section_report (id, fir_id) ON DELETE CASCADE,
  FOREIGN KEY (fir_id, act, section) REFERENCES fir_section (fir_id, act, section) ON DELETE CASCADE
);

-- A report is not sent in the future (India time).
CREATE FUNCTION section_report_ok() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.sent_on > ist_date(clock_timestamp()) THEN
    RAISE EXCEPTION 'a report to the Magistrate cannot be sent on a later day' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER section_report_ok BEFORE INSERT ON section_report FOR EACH ROW EXECUTE FUNCTION section_report_ok();

-- Only a section added after registration is reported, and not on a day before it was added (India time).
CREATE FUNCTION section_report_item_ok() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE added timestamptz;
BEGIN
  SELECT added_at INTO added FROM fir_section WHERE fir_id = NEW.fir_id AND act = NEW.act AND section = NEW.section;
  IF added IS NULL THEN
    RAISE EXCEPTION 'only a section added after registration is reported to the Magistrate' USING ERRCODE = 'check_violation';
  END IF;
  IF (SELECT sent_on FROM section_report WHERE id = NEW.report_id) < ist_date(added) THEN
    RAISE EXCEPTION 'a report cannot be sent before the section was added' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER section_report_item_ok BEFORE INSERT ON section_report_item FOR EACH ROW EXECUTE FUNCTION section_report_item_ok();

CREATE TRIGGER section_report_kept BEFORE UPDATE OR DELETE ON section_report FOR EACH ROW EXECUTE FUNCTION kept_unless_parent_gone('fir');
CREATE TRIGGER section_report_item_kept BEFORE UPDATE OR DELETE ON section_report_item FOR EACH ROW EXECUTE FUNCTION kept_unless_parent_gone('fir');
