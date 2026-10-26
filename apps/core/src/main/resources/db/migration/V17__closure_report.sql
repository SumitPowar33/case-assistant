-- Closure report (final report that no chargesheet will be filed), 26 Oct 2026.
-- Recorded once per case and kept as written. It ends the BNSS 193(2) two-month limit (the investigation is over).
-- It does NOT end the custody limit: an accused still in custody stays on the deadline list until the release is recorded.
-- The Magistrate may accept it or order further investigation; that decision is not modelled here.

CREATE TABLE closure_report (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fir_id              uuid NOT NULL UNIQUE REFERENCES fir(id),
  filed_on            date NOT NULL,
  court               text NOT NULL CHECK (btrim(court) <> ''),
  report_no           text NOT NULL CHECK (btrim(report_no) <> ''),
  ground              text NOT NULL CHECK (ground IN ('untraced','insufficient_evidence','false_complaint','civil_nature','other')),
  reason              text NOT NULL CHECK (length(btrim(reason)) >= 10),
  informant_informed_on date,
  recorded_by         uuid NOT NULL REFERENCES app_user(id),
  recorded_at         timestamptz NOT NULL DEFAULT now(),
  CHECK (informant_informed_on IS NULL OR informant_informed_on >= filed_on)
);

CREATE FUNCTION closure_report_rules() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'closure reports are kept as written (%)', TG_OP;
  END IF;
  IF NEW.filed_on < (SELECT ist_date(registered_at) FROM fir WHERE id = NEW.fir_id) THEN
    RAISE EXCEPTION 'a closure report cannot be filed before the FIR was registered';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER closure_report_kept BEFORE INSERT OR UPDATE OR DELETE ON closure_report FOR EACH ROW EXECUTE FUNCTION closure_report_rules();

CREATE OR REPLACE VIEW case_deadline AS
SELECT f.id AS fir_id, 'chargesheet_custody' AS kind,
       min(chargesheet_last_day(a.first_remand_on, a.max_punishment)) AS due_on,
       'BNSS 187(3), from first remand of an accused in custody' AS basis
FROM fir f JOIN person p ON p.fir_id = f.id JOIN arrest_current a ON a.person_id = p.id
WHERE a.first_remand_on IS NOT NULL AND a.released_on IS NULL AND chargesheet_filed_for(p.id) IS NULL
GROUP BY f.id
UNION ALL
SELECT f.id, 'sexual_offence_investigation', sexual_offence_last_day(ist_date(f.registered_at)), 'BNSS 193(2)'
FROM fir f WHERE bnss_193_2_applies(f.id)
  AND NOT EXISTS (SELECT 1 FROM chargesheet c WHERE c.fir_id = f.id
                  AND NOT EXISTS (SELECT 1 FROM chargesheet n WHERE n.supersedes = c.id))
  AND NOT EXISTS (SELECT 1 FROM closure_report r WHERE r.fir_id = f.id)
UNION ALL
SELECT f.id, 'victim_progress_update', (ist_date(f.registered_at) + 90), 'BNSS 193(3)(ii), 90 days'
FROM fir f
UNION ALL
SELECT n.fir_id, 'notice_reply:' || n.addressee, n.reply_due_on, n.kind
FROM notice n WHERE n.status IN ('sent','reply_incomplete') AND n.reply_due_on IS NOT NULL;
