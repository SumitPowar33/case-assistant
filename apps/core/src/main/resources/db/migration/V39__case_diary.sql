-- Case diary under BNSS 192 (design board 14, Sumit 2 Nov 2026).
-- The officer writes what the app cannot know (places visited, what was learnt, why a step was taken); the steps taken
-- in the app (notices sent, seizures, arrests, IO assigned, victim updates, chargesheets) are shown on the same day's page
-- from their own records. Each day is one page: written that day, then closed and page-numbered. Nothing is ever changed
-- or removed; a correction is a new entry on today's page.

CREATE TABLE case_diary_entry (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fir_id      uuid NOT NULL REFERENCES fir(id),
  diary_date  date NOT NULL DEFAULT ist_date(now()),
  at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  author      uuid NOT NULL REFERENCES app_user(id),
  text        text NOT NULL CHECK (length(btrim(text)) BETWEEN 3 AND 5000),
  -- an entry is written on the day it belongs to, never back-dated or forward-dated
  CHECK (diary_date = ist_date(at))
);
CREATE INDEX case_diary_entry_day ON case_diary_entry (fir_id, diary_date, at);

CREATE TABLE case_diary_page (
  fir_id      uuid NOT NULL REFERENCES fir(id),
  diary_date  date NOT NULL,
  page_no     integer NOT NULL CHECK (page_no > 0),
  closed_at   timestamptz NOT NULL DEFAULT clock_timestamp(),
  closed_by   uuid NOT NULL REFERENCES app_user(id),
  PRIMARY KEY (fir_id, diary_date),
  UNIQUE (fir_id, page_no)
);

CREATE FUNCTION case_diary_kept() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'the case diary is kept as written (%)', TG_OP;
END $$;
CREATE TRIGGER case_diary_entry_kept BEFORE UPDATE OR DELETE ON case_diary_entry FOR EACH ROW EXECUTE FUNCTION case_diary_kept();
CREATE TRIGGER case_diary_page_kept BEFORE UPDATE OR DELETE ON case_diary_page FOR EACH ROW EXECUTE FUNCTION case_diary_kept();

-- a closed page takes no more entries
CREATE FUNCTION case_diary_page_open() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM case_diary_page p WHERE p.fir_id = NEW.fir_id AND p.diary_date = NEW.diary_date) THEN
    RAISE EXCEPTION 'this page of the case diary is closed' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER case_diary_entry_page_open BEFORE INSERT ON case_diary_entry FOR EACH ROW EXECUTE FUNCTION case_diary_page_open();

-- reading the diary of a protected case is logged like its people and FIR text (V37)
ALTER TABLE protected_read DROP CONSTRAINT protected_read_what_check;
ALTER TABLE protected_read ADD CONSTRAINT protected_read_what_check CHECK (what IN ('people', 'fir_text', 'complaint', 'complaint_list', 'diary'));
