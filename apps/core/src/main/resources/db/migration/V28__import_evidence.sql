-- Loading existing evidence (seizure) records from a file (30 Oct 2026, Sumit's answer of the same day). Same four steps as
-- the FIR, arrests and chargesheets loads. An item is attached to an FIR already in the system; nothing else is created.
ALTER TABLE import_batch DROP CONSTRAINT import_batch_entity_check;
ALTER TABLE import_batch ADD CONSTRAINT import_batch_entity_check CHECK (entity IN ('fir','arrest','chargesheet','evidence'));

ALTER TABLE evidence_item
  ADD COLUMN import_batch_id uuid REFERENCES import_batch(id),
  ADD COLUMN source_hash text;
CREATE INDEX evidence_item_import_batch ON evidence_item (import_batch_id) WHERE import_batch_id IS NOT NULL;

-- An evidence item stays on the register: it can be described better (V2 keeps the SHA-256 fixed), never removed.
-- The only delete is the undo of the import that added it, once that batch is marked undone. (The FIR undo cannot
-- reach here: it is refused while an evidence item points at one of its FIRs.)
CREATE FUNCTION evidence_item_kept() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.import_batch_id IS NOT NULL AND (SELECT status FROM import_batch WHERE id = OLD.import_batch_id) = 'undone' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'evidence items stay on the register (item %)', OLD.label;
END $$;

CREATE TRIGGER evidence_item_no_delete BEFORE DELETE ON evidence_item FOR EACH ROW EXECUTE FUNCTION evidence_item_kept();
