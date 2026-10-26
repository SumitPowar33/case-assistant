-- Corrections of the arrest memo itself (26 Oct 2026): place, grounds told, and the person informed (BNSS 47, 48).
-- Same pattern as V15: the memo stays as written; a correction is a new row with a written reason and the newest counts.
-- The person arrested, the time of arrest and the arresting officer cannot be corrected here; the time sets the
-- IST day the custody limit is checked against.
CREATE TABLE arrest_memo_correction (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  arrest_id        uuid NOT NULL REFERENCES arrest(id),
  supersedes       uuid UNIQUE REFERENCES arrest_memo_correction(id),
  place            text NOT NULL CHECK (char_length(btrim(place)) > 0),
  grounds          text[] NOT NULL CHECK (cardinality(grounds) > 0),
  informed_name    text NOT NULL CHECK (char_length(btrim(informed_name)) > 0),
  informed_contact text,
  reason           text NOT NULL CHECK (char_length(btrim(reason)) >= 10),
  recorded_by      uuid NOT NULL REFERENCES app_user(id),
  recorded_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX arrest_memo_correction_first ON arrest_memo_correction (arrest_id) WHERE supersedes IS NULL;

CREATE FUNCTION arrest_memo_correction_rules() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'arrest_memo_correction rows are kept as written (%)', TG_OP;
  END IF;
  IF NEW.supersedes IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM arrest_memo_correction c WHERE c.id = NEW.supersedes AND c.arrest_id = NEW.arrest_id) THEN
    RAISE EXCEPTION 'a correction must replace a correction of the same arrest' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER arrest_memo_correction_kept BEFORE INSERT OR UPDATE OR DELETE ON arrest_memo_correction
FOR EACH ROW EXECUTE FUNCTION arrest_memo_correction_rules();

-- The memo as it stands now: the newest correction, else the memo as first written.
CREATE VIEW arrest_memo_current AS
SELECT a.id,
       coalesce(c.place, a.place) AS place,
       coalesce(c.grounds, a.grounds) AS grounds,
       coalesce(c.informed_name, a.informed_name) AS informed_name,
       CASE WHEN c.id IS NULL THEN a.informed_contact ELSE c.informed_contact END AS informed_contact,
       c.id AS memo_correction_id
FROM arrest a
LEFT JOIN arrest_memo_correction c ON c.arrest_id = a.id
  AND NOT EXISTS (SELECT 1 FROM arrest_memo_correction n WHERE n.supersedes = c.id);
