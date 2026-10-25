-- Arrest memo rules (BNSS 35, 47, 48), 26 Oct 2026.
-- Only an accused can be arrested. The memo is kept as written: the one change allowed later is recording the
-- first remand once (it is usually the next day, after the arrest memo is made). The first remand cannot be
-- before the arrest day (IST), because the BNSS 187(3) 60/90 days run from it.

ALTER TABLE arrest
  ADD COLUMN recorded_by uuid REFERENCES app_user(id),
  ADD COLUMN recorded_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN remand_recorded_by uuid REFERENCES app_user(id),
  ADD COLUMN remand_recorded_at timestamptz,
  ADD CONSTRAINT arrest_remand_not_before_arrest CHECK (first_remand_on IS NULL OR first_remand_on >= ist_date(arrested_at)),
  ADD CONSTRAINT arrest_remand_recorded_by CHECK (first_remand_on IS NULL OR (remand_recorded_by IS NOT NULL AND remand_recorded_at IS NOT NULL));

CREATE FUNCTION arrest_only_accused() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM person WHERE id = NEW.person_id AND role = 'accused') THEN
    RAISE EXCEPTION 'only an accused can be arrested (person %)', NEW.person_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER arrest_of_accused BEFORE INSERT ON arrest FOR EACH ROW EXECUTE FUNCTION arrest_only_accused();

CREATE FUNCTION arrest_allow_only_remand() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  r CONSTANT text[] := ARRAY['first_remand_on','remand_recorded_by','remand_recorded_at'];
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'arrest memos are kept as written (DELETE)';
  END IF;
  IF OLD.first_remand_on IS NOT NULL OR NEW.first_remand_on IS NULL OR (to_jsonb(NEW) - r) IS DISTINCT FROM (to_jsonb(OLD) - r) THEN
    RAISE EXCEPTION 'arrest memos are kept as written (only the first remand may be added, once)';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER arrest_kept BEFORE UPDATE OR DELETE ON arrest FOR EACH ROW EXECUTE FUNCTION arrest_allow_only_remand();
