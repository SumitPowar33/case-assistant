-- Loading existing chargesheets from a file (29 Oct 2026, after arrests). Same four steps as the FIR and arrests loads.
-- An imported chargesheet names the accused it covers, so it ends their BNSS 187(3) custody limit and the BNSS 193(2)
-- limit of the case, exactly as one typed in the app. It stays as written; the only way out is the undo of its batch.
ALTER TABLE import_batch DROP CONSTRAINT import_batch_entity_check;
ALTER TABLE import_batch ADD CONSTRAINT import_batch_entity_check CHECK (entity IN ('fir','arrest','chargesheet'));

ALTER TABLE chargesheet
  ADD COLUMN import_batch_id uuid REFERENCES import_batch(id),
  ADD COLUMN source_hash text;
CREATE INDEX chargesheet_import_batch ON chargesheet (import_batch_id) WHERE import_batch_id IS NOT NULL;

CREATE OR REPLACE FUNCTION chargesheet_rules() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- the undo of an import removes what that import added, nothing else (OLD is read in separate branches: each table has its own columns)
  IF TG_OP = 'DELETE' THEN
    IF TG_TABLE_NAME = 'chargesheet' THEN
      IF OLD.import_batch_id IS NOT NULL AND (SELECT status FROM import_batch WHERE id = OLD.import_batch_id) = 'undone' THEN
        RETURN OLD;
      END IF;
    ELSIF EXISTS (SELECT 1 FROM chargesheet c JOIN import_batch b ON b.id = c.import_batch_id
                  WHERE c.id = OLD.chargesheet_id AND b.status = 'undone') THEN
      RETURN OLD;
    END IF;
  END IF;
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION '% rows are kept as written (%)', TG_TABLE_NAME, TG_OP;
  END IF;
  IF TG_TABLE_NAME = 'chargesheet' THEN
    IF NEW.filed_on < (SELECT ist_date(registered_at) FROM fir WHERE id = NEW.fir_id) THEN
      RAISE EXCEPTION 'a chargesheet cannot be filed before the FIR was registered';
    END IF;
    IF NEW.supersedes IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM chargesheet c WHERE c.id = NEW.supersedes AND c.fir_id = NEW.fir_id) THEN
      RAISE EXCEPTION 'a correction must replace a chargesheet of the same case' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NOT EXISTS (SELECT 1 FROM person p JOIN chargesheet c ON c.fir_id = p.fir_id
                    WHERE p.id = NEW.person_id AND c.id = NEW.chargesheet_id AND p.role = 'accused') THEN
    RAISE EXCEPTION 'a chargesheet names only accused of its own case (person %)', NEW.person_id;
  END IF;
  RETURN NEW;
END $$;
