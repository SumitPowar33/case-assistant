-- Correction of the time of arrest (29 Oct 2026). The memo keeps the time as first written; a correction is a new row with
-- a written reason and the newest one counts (same pattern as V15/V16). The time sets the IST day that the remand and the
-- release are checked against, and the order of arrests of one person (earlier custody days, V19), so everything that
-- reads the time must read it from arrest_current.
CREATE TABLE arrest_time_correction (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  arrest_id   uuid NOT NULL REFERENCES arrest(id),
  supersedes  uuid UNIQUE REFERENCES arrest_time_correction(id),
  arrested_at timestamptz NOT NULL,
  reason      text NOT NULL CHECK (char_length(btrim(reason)) >= 10),
  recorded_by uuid NOT NULL REFERENCES app_user(id),
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX arrest_time_correction_first ON arrest_time_correction (arrest_id) WHERE supersedes IS NULL;

-- The time as it stands now: the newest time correction, else the memo as first written.
CREATE OR REPLACE VIEW arrest_current AS
SELECT a.id, a.person_id, coalesce(t.arrested_at, a.arrested_at) AS arrested_at,
       coalesce(c.first_remand_on, CASE WHEN c.id IS NULL THEN a.first_remand_on END) AS first_remand_on,
       coalesce(c.max_punishment, a.max_punishment) AS max_punishment,
       CASE WHEN c.id IS NULL THEN a.released_on ELSE c.released_on END AS released_on,
       CASE WHEN c.id IS NULL THEN a.release_basis ELSE c.release_basis END AS release_basis,
       c.id AS correction_id,
       t.id AS time_correction_id
FROM arrest a
LEFT JOIN arrest_correction c ON c.arrest_id = a.id
  AND NOT EXISTS (SELECT 1 FROM arrest_correction n WHERE n.supersedes = c.id)
LEFT JOIN arrest_time_correction t ON t.arrest_id = a.id
  AND NOT EXISTS (SELECT 1 FROM arrest_time_correction n WHERE n.supersedes = t.id);

-- A new time may not put the arrest after a remand or release already on record, and not in the future.
CREATE FUNCTION arrest_time_correction_rules() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE cur arrest_current%ROWTYPE;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'arrest_time_correction rows are kept as written (%)', TG_OP;
  END IF;
  IF NEW.supersedes IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM arrest_time_correction c WHERE c.id = NEW.supersedes AND c.arrest_id = NEW.arrest_id) THEN
    RAISE EXCEPTION 'a correction must replace a correction of the same arrest' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.arrested_at > now() + interval '5 minutes' THEN
    RAISE EXCEPTION 'the time of arrest cannot be in the future' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO cur FROM arrest_current WHERE id = NEW.arrest_id;
  IF ist_date(NEW.arrested_at) > cur.first_remand_on OR ist_date(NEW.arrested_at) > cur.released_on THEN
    RAISE EXCEPTION 'the time of arrest cannot be after the first remand or the release already recorded' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER arrest_time_correction_kept BEFORE INSERT OR UPDATE OR DELETE ON arrest_time_correction
FOR EACH ROW EXECUTE FUNCTION arrest_time_correction_rules();

-- Later remand/release corrections are checked against the time now in force, not the memo's first time.
CREATE OR REPLACE FUNCTION arrest_correction_rules() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE arrested date;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'arrest_correction rows are kept as written (%)', TG_OP;
  END IF;
  IF NEW.supersedes IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM arrest_correction c WHERE c.id = NEW.supersedes AND c.arrest_id = NEW.arrest_id) THEN
    RAISE EXCEPTION 'a correction must replace a correction of the same arrest' USING ERRCODE = 'check_violation';
  END IF;
  SELECT ist_date(arrested_at) INTO arrested FROM arrest_current WHERE id = NEW.arrest_id;
  IF NEW.first_remand_on < arrested OR NEW.released_on < arrested THEN
    RAISE EXCEPTION 'the first remand and the release cannot be before the day of arrest' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
