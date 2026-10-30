-- Loading existing notices from a file (30 Oct 2026, Sumit's answer of the same day). Same four steps as the other loads.
-- An old notice is kept under the law it was issued under: CrPC 91, 41A and 160 notices stay CrPC notices (the BNSS
-- equivalents are 94, 35(3) and 179), exactly as old offences stay under the IPC. Nothing is converted.
ALTER TABLE import_batch DROP CONSTRAINT import_batch_entity_check;
ALTER TABLE import_batch ADD CONSTRAINT import_batch_entity_check CHECK (entity IN ('fir','arrest','chargesheet','evidence','notice'));

ALTER TABLE notice
  ADD COLUMN import_batch_id uuid REFERENCES import_batch(id),
  ADD COLUMN source_hash text;
CREATE INDEX notice_import_batch ON notice (import_batch_id) WHERE import_batch_id IS NOT NULL;

ALTER TABLE notice DROP CONSTRAINT notice_kind_check;
ALTER TABLE notice ADD CONSTRAINT notice_kind_check CHECK (kind IN ('BNSS_94','BNSS_35_3','BNSS_179','follow_up','CrPC_91','CrPC_41A','CrPC_160'));
-- a notice to produce lists what it asks for, under either code
ALTER TABLE notice DROP CONSTRAINT notice_check1;
ALTER TABLE notice ADD CONSTRAINT notice_items_listed CHECK (kind NOT IN ('BNSS_94','CrPC_91') OR cardinality(items_requested) > 0);
-- a sent notice names who signed it; only an imported one may leave that empty when the old record does not say
ALTER TABLE notice DROP CONSTRAINT notice_check;
ALTER TABLE notice ADD CONSTRAINT notice_sent_signed CHECK (status = 'draft' OR (issued_at IS NOT NULL AND (signed_by IS NOT NULL OR import_batch_id IS NOT NULL)));
-- the BNSS came into force on 1 July 2024: no BNSS notice before that day; a CrPC notice may follow it (BNSS 531 savings)
ALTER TABLE notice ADD CONSTRAINT notice_bnss_from_july_2024
  CHECK (kind NOT LIKE 'BNSS%' OR issued_at IS NULL OR issued_at >= '2024-07-01 00:00+05:30');
-- and a CrPC notice belongs only to an FIR registered before that day (investigations already running continue under the CrPC)
CREATE FUNCTION notice_code_fits_fir() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.kind LIKE 'CrPC%' AND (SELECT ist_date(registered_at) FROM fir WHERE id = NEW.fir_id) >= DATE '2024-07-01' THEN
    RAISE EXCEPTION 'a CrPC notice belongs only to an FIR registered before 1 July 2024' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER notice_code_fits_fir BEFORE INSERT OR UPDATE OF kind, fir_id ON notice FOR EACH ROW EXECUTE FUNCTION notice_code_fits_fir();

-- A concluded case has no live deadlines: the notice reply deadline was the one part of the view that did not say so.
CREATE OR REPLACE VIEW case_deadline AS
SELECT f.id AS fir_id, 'chargesheet_custody' AS kind, min(arrest_last_day(a.id)) AS due_on,
       'BNSS 187(3), from first remand of an accused in custody' AS basis
FROM fir f JOIN person p ON p.fir_id = f.id JOIN arrest_current a ON a.person_id = p.id
WHERE a.first_remand_on IS NOT NULL AND a.released_on IS NULL AND chargesheet_filed_for(p.id) IS NULL AND NOT f.concluded
GROUP BY f.id
UNION ALL
SELECT f.id, 'sexual_offence_investigation', sexual_offence_last_day(ist_date(f.registered_at)), 'BNSS 193(2)'
FROM fir f WHERE bnss_193_2_applies(f.id) AND NOT f.concluded
  AND NOT EXISTS (SELECT 1 FROM chargesheet c WHERE c.fir_id = f.id
                  AND NOT EXISTS (SELECT 1 FROM chargesheet n WHERE n.supersedes = c.id))
  AND NOT EXISTS (SELECT 1 FROM closure_report r WHERE r.fir_id = f.id)
UNION ALL
SELECT f.id, 'victim_progress_update', ist_date(f.registered_at) + e.days,
       'BNSS 193(3)(ii), 90 days' || CASE WHEN e.days < 90 THEN '; earlier by unit policy: ' || e.days || ' days' ELSE '' END
FROM fir f CROSS JOIN LATERAL (SELECT effective_policy_days(f.station_id, 'victim_update_days', 90) AS days) e
WHERE NOT f.concluded
UNION ALL
SELECT n.fir_id, 'notice_reply:' || n.addressee, n.reply_due_on, n.kind
FROM notice n JOIN fir f ON f.id = n.fir_id
WHERE n.status IN ('sent','reply_incomplete') AND n.reply_due_on IS NOT NULL AND NOT f.concluded;
