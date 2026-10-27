-- Correction of a closure report and the Magistrate's decision on it (27 Oct 2026).
-- Same pattern as V15/V16: the report stays as written; a correction is a new row with a written reason, the newest counts.
-- The decision (accepted / further investigation ordered) is recorded once and kept as written. It changes no deadline.
CREATE TABLE closure_correction (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  closure_id            uuid NOT NULL REFERENCES closure_report(id),
  supersedes            uuid UNIQUE REFERENCES closure_correction(id),
  filed_on              date NOT NULL,
  court                 text NOT NULL CHECK (btrim(court) <> ''),
  report_no             text NOT NULL CHECK (btrim(report_no) <> ''),
  ground                text NOT NULL CHECK (ground IN ('untraced','insufficient_evidence','false_complaint','civil_nature','other')),
  reason                text NOT NULL CHECK (length(btrim(reason)) >= 10),
  informant_informed_on date,
  correction_reason     text NOT NULL CHECK (length(btrim(correction_reason)) >= 10),
  recorded_by           uuid NOT NULL REFERENCES app_user(id),
  recorded_at           timestamptz NOT NULL DEFAULT now(),
  CHECK (informant_informed_on IS NULL OR informant_informed_on >= filed_on)
);
CREATE UNIQUE INDEX closure_correction_first ON closure_correction (closure_id) WHERE supersedes IS NULL;

CREATE FUNCTION closure_correction_rules() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'closure_correction rows are kept as written (%)', TG_OP;
  END IF;
  IF NEW.supersedes IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM closure_correction c WHERE c.id = NEW.supersedes AND c.closure_id = NEW.closure_id) THEN
    RAISE EXCEPTION 'a correction must replace a correction of the same closure report' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.filed_on < (SELECT ist_date(f.registered_at) FROM closure_report r JOIN fir f ON f.id = r.fir_id WHERE r.id = NEW.closure_id) THEN
    RAISE EXCEPTION 'a closure report cannot be filed before the FIR was registered' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER closure_correction_kept BEFORE INSERT OR UPDATE OR DELETE ON closure_correction
FOR EACH ROW EXECUTE FUNCTION closure_correction_rules();

-- The closure report as it stands now: the newest correction, else the report as first written.
CREATE VIEW closure_report_current AS
SELECT r.id, r.fir_id,
       coalesce(c.filed_on, r.filed_on) AS filed_on,
       coalesce(c.court, r.court) AS court,
       coalesce(c.report_no, r.report_no) AS report_no,
       coalesce(c.ground, r.ground) AS ground,
       coalesce(c.reason, r.reason) AS reason,
       CASE WHEN c.id IS NULL THEN r.informant_informed_on ELSE c.informant_informed_on END AS informant_informed_on,
       c.id IS NOT NULL AS corrected
FROM closure_report r
LEFT JOIN closure_correction c ON c.closure_id = r.id
  AND NOT EXISTS (SELECT 1 FROM closure_correction n WHERE n.supersedes = c.id);

CREATE TABLE closure_decision (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  closure_id  uuid NOT NULL UNIQUE REFERENCES closure_report(id),
  decision    text NOT NULL CHECK (decision IN ('accepted','further_investigation')),
  decided_on  date NOT NULL,
  note        text,
  recorded_by uuid NOT NULL REFERENCES app_user(id),
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION closure_decision_rules() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'closure decisions are kept as written (%)', TG_OP;
END $$;
CREATE TRIGGER closure_decision_kept BEFORE UPDATE OR DELETE ON closure_decision FOR EACH ROW EXECUTE FUNCTION closure_decision_rules();
