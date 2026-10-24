-- Withdrawing readiness records (25 Oct 2026).
-- A wrong evidence link, a wrong accused link or an accepted gap can be withdrawn with a written reason.
-- Nothing is deleted: the row stays with who withdrew it, when and why, and the readiness report lists it
-- under "withdrawn". A withdrawn row cannot be changed again; the same link or acceptance can be made anew.

ALTER TABLE ingredient_evidence
  ADD COLUMN withdrawn_at timestamptz, ADD COLUMN withdrawn_by uuid REFERENCES app_user(id), ADD COLUMN withdrawn_reason text;
ALTER TABLE accused_link
  ADD COLUMN withdrawn_at timestamptz, ADD COLUMN withdrawn_by uuid REFERENCES app_user(id), ADD COLUMN withdrawn_reason text;
ALTER TABLE readiness_override
  ADD COLUMN withdrawn_at timestamptz, ADD COLUMN withdrawn_by uuid REFERENCES app_user(id), ADD COLUMN withdrawn_reason text;

-- Only one live row per link or gap; withdrawn rows stay beside it.
ALTER TABLE ingredient_evidence DROP CONSTRAINT ingredient_evidence_fir_id_charge_id_ingredient_id_evidence_key;
CREATE UNIQUE INDEX ingredient_evidence_live ON ingredient_evidence (fir_id, charge_id, ingredient_id, evidence_item_id) WHERE withdrawn_at IS NULL;
ALTER TABLE accused_link DROP CONSTRAINT accused_link_person_id_link_type_evidence_item_id_key;
CREATE UNIQUE INDEX accused_link_live ON accused_link (person_id, link_type, evidence_item_id) WHERE withdrawn_at IS NULL;
ALTER TABLE readiness_override DROP CONSTRAINT readiness_override_fir_id_gap_key_key;
CREATE UNIQUE INDEX readiness_override_live ON readiness_override (fir_id, gap_key) WHERE withdrawn_at IS NULL;

-- The only change allowed: filling in the withdrawal once, with who and a reason of 10+ characters.
CREATE FUNCTION allow_only_withdrawal() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  w CONSTANT text[] := ARRAY['withdrawn_at','withdrawn_by','withdrawn_reason'];
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION '% rows are kept as written (DELETE)', TG_TABLE_NAME;
  END IF;
  IF OLD.withdrawn_at IS NOT NULL THEN
    RAISE EXCEPTION '% rows are kept as written (already withdrawn)', TG_TABLE_NAME;
  END IF;
  IF NEW.withdrawn_at IS NULL OR NEW.withdrawn_by IS NULL OR length(btrim(coalesce(NEW.withdrawn_reason, ''))) < 10
     OR (to_jsonb(NEW) - w) IS DISTINCT FROM (to_jsonb(OLD) - w) THEN
    RAISE EXCEPTION '% rows are kept as written (only a withdrawal with a reason may be added)', TG_TABLE_NAME;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER readiness_override_kept ON readiness_override;
DROP TRIGGER accused_link_kept ON accused_link;
CREATE TRIGGER ingredient_evidence_withdraw_only BEFORE UPDATE OR DELETE ON ingredient_evidence FOR EACH ROW EXECUTE FUNCTION allow_only_withdrawal();
CREATE TRIGGER accused_link_withdraw_only BEFORE UPDATE OR DELETE ON accused_link FOR EACH ROW EXECUTE FUNCTION allow_only_withdrawal();
CREATE TRIGGER readiness_override_withdraw_only BEFORE UPDATE OR DELETE ON readiness_override FOR EACH ROW EXECUTE FUNCTION allow_only_withdrawal();
