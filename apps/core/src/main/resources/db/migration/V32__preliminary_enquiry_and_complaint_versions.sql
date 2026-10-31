-- BNSS 173(3) (decided 31 Oct 2026 after research, see docs/PROGRESS.md): for an offence punishable with 3 years or more
-- but less than 7 years the officer in charge may, with the prior permission of an officer not below the rank of DSP,
-- hold a preliminary enquiry "within a period of fourteen days" to see whether there is a prima facie case. It is a step
-- on the way, not an outcome: it ends in an FIR (from the same signed text) or in a closing outcome with a reason. The
-- statute does not say from when the 14 days run; we count from the receipt of the information, the earliest and so
-- the safest reading. The permission is recorded as given (name and rank of the DSP or above).
ALTER TABLE complaint
  ADD COLUMN enquiry_permitted_by text,
  ADD COLUMN enquiry_reason       text,
  ADD COLUMN enquiry_at           timestamptz,
  ADD COLUMN enquiry_by           uuid REFERENCES app_user(id);

-- earlier enquiries were recorded as the outcome: move them to the enquiry columns so they can still end in an FIR
ALTER TABLE complaint DISABLE TRIGGER complaint_rules;
UPDATE complaint SET enquiry_permitted_by = 'not recorded (entered before 1 Nov 2026)', enquiry_reason = outcome_reason,
                     enquiry_at = outcome_at, enquiry_by = outcome_by,
                     outcome = NULL, outcome_reason = NULL, outcome_at = NULL, outcome_by = NULL
WHERE outcome = 'preliminary_enquiry';
ALTER TABLE complaint ENABLE TRIGGER complaint_rules;

ALTER TABLE complaint DROP CONSTRAINT complaint_outcome_check;
ALTER TABLE complaint ADD CONSTRAINT complaint_outcome_check
  CHECK (outcome IN ('fir','ncr','transferred','no_offence','not_signed_in_time'));
ALTER TABLE complaint ADD CONSTRAINT complaint_enquiry_complete
  CHECK ((enquiry_at IS NULL) = (enquiry_by IS NULL) AND (enquiry_at IS NULL) = (enquiry_permitted_by IS NULL)
         AND (enquiry_at IS NULL) = (enquiry_reason IS NULL));
ALTER TABLE complaint ADD CONSTRAINT complaint_enquiry_explained
  CHECK (enquiry_at IS NULL OR (length(btrim(enquiry_permitted_by)) >= 3 AND length(btrim(enquiry_reason)) >= 10 AND signed_at IS NOT NULL));
ALTER TABLE complaint ADD CONSTRAINT complaint_enquiry_before_outcome
  CHECK (enquiry_at IS NULL OR outcome_at IS NULL OR outcome_at >= enquiry_at);

-- Corrections made while the text is read over, before the informant signs: the earlier wording is kept, not lost.
CREATE TABLE complaint_version (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_id       uuid NOT NULL REFERENCES complaint(id),
  informant_name     text NOT NULL,
  informant_contact  text,
  kind               text NOT NULL,
  text_original      text NOT NULL,
  text_language      text NOT NULL,
  replaced_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  replaced_by        uuid NOT NULL REFERENCES app_user(id)
);
CREATE INDEX complaint_version_complaint ON complaint_version (complaint_id, replaced_at);
CREATE FUNCTION complaint_version_kept() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'earlier wordings of a complaint are kept (%)', TG_OP;
END $$;
CREATE TRIGGER complaint_version_kept BEFORE UPDATE OR DELETE ON complaint_version FOR EACH ROW EXECUTE FUNCTION complaint_version_kept();

CREATE OR REPLACE FUNCTION complaint_rules() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'complaints are kept';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.signed_at IS NOT NULL AND (NEW.text_original, NEW.text_language, NEW.received_at, NEW.mode, NEW.informant_name, NEW.kind, NEW.station_id)
         IS DISTINCT FROM (OLD.text_original, OLD.text_language, OLD.received_at, OLD.mode, OLD.informant_name, OLD.kind, OLD.station_id) THEN
      RAISE EXCEPTION 'a signed complaint is kept as the informant signed it';
    END IF;
    IF OLD.signed_at IS NOT NULL AND (NEW.signed_at, NEW.read_back_language, NEW.signed_recorded_by)
         IS DISTINCT FROM (OLD.signed_at, OLD.read_back_language, OLD.signed_recorded_by) THEN
      RAISE EXCEPTION 'a signature is recorded once';
    END IF;
    IF OLD.outcome IS NOT NULL AND (NEW.outcome, NEW.outcome_reason, NEW.fir_id, NEW.outcome_at, NEW.outcome_by)
         IS DISTINCT FROM (OLD.outcome, OLD.outcome_reason, OLD.fir_id, OLD.outcome_at, OLD.outcome_by) THEN
      RAISE EXCEPTION 'the outcome of a complaint is recorded once';
    END IF;
    IF OLD.enquiry_at IS NOT NULL AND (NEW.enquiry_at, NEW.enquiry_by, NEW.enquiry_permitted_by, NEW.enquiry_reason)
         IS DISTINCT FROM (OLD.enquiry_at, OLD.enquiry_by, OLD.enquiry_permitted_by, OLD.enquiry_reason) THEN
      RAISE EXCEPTION 'a preliminary enquiry is recorded once';
    END IF;
    IF OLD.outcome IS NOT NULL AND OLD.enquiry_at IS NULL AND NEW.enquiry_at IS NOT NULL THEN
      RAISE EXCEPTION 'a closed complaint cannot go to a preliminary enquiry';
    END IF;
  END IF;
  -- e-information counts only when signed within three days (BNSS 173(1)(ii))
  IF NEW.mode = 'electronic' AND NEW.signed_at IS NOT NULL AND NEW.signed_at > NEW.received_at + interval '3 days' THEN
    RAISE EXCEPTION 'electronic information must be signed within three days of receipt' USING ERRCODE = 'check_violation';
  END IF;
  -- an FIR from this complaint is of the same station and carries the signed text unchanged
  IF NEW.fir_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM fir f WHERE f.id = NEW.fir_id AND f.station_id = NEW.station_id
                                            AND f.contents_original = NEW.text_original AND f.information_received_at = NEW.received_at) THEN
    RAISE EXCEPTION 'the FIR must be of the same station and carry the complaint as signed' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
