-- Loading existing arrests from a file (Sumit, 29 Oct 2026: arrests before chargesheets). Same four steps as the FIR
-- load (stage, check, approve, undo). An imported arrest is the memo as the old record has it. What the old record does
-- not say is marked "Not in the old record" (place, grounds, person informed) or left empty (the arresting officer) and
-- never invented. Nothing in the file is changed later: the memo stays as written (V11, V14).
ALTER TABLE import_batch DROP CONSTRAINT import_batch_entity_check;
ALTER TABLE import_batch ADD CONSTRAINT import_batch_entity_check CHECK (entity IN ('fir','arrest'));

ALTER TABLE arrest
  ADD COLUMN import_batch_id uuid REFERENCES import_batch(id),
  ADD COLUMN source_hash text,                       -- fingerprint of the imported row, to tell a repeat from a conflict
  ALTER COLUMN arresting_officer DROP NOT NULL,
  ADD CONSTRAINT arrest_officer_named CHECK (arresting_officer IS NOT NULL OR import_batch_id IS NOT NULL);
CREATE INDEX arrest_import_batch ON arrest (import_batch_id) WHERE import_batch_id IS NOT NULL;

-- As before, the memo is kept as written: only the first remand and the release may be added, once each. The one new
-- way out is the undo of an import (the batch is marked undone first, in the same transaction).
CREATE OR REPLACE FUNCTION arrest_allow_only_remand() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  r CONSTANT text[] := ARRAY['first_remand_on','remand_recorded_by','remand_recorded_at'];
  b CONSTANT text[] := ARRAY['released_on','release_basis','release_recorded_by','release_recorded_at'];
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.import_batch_id IS NOT NULL AND (SELECT status FROM import_batch WHERE id = OLD.import_batch_id) = 'undone' THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'arrest memos are kept as written (DELETE)';
  END IF;
  IF (to_jsonb(NEW) - r - b) IS DISTINCT FROM (to_jsonb(OLD) - r - b)
     OR ((to_jsonb(NEW) - b) IS DISTINCT FROM (to_jsonb(OLD) - b) AND (OLD.first_remand_on IS NOT NULL OR NEW.first_remand_on IS NULL))
     OR ((to_jsonb(NEW) - r) IS DISTINCT FROM (to_jsonb(OLD) - r) AND (OLD.released_on IS NOT NULL OR NEW.released_on IS NULL)) THEN
    RAISE EXCEPTION 'arrest memos are kept as written (only the first remand and the release may be added, once each)';
  END IF;
  RETURN NEW;
END $$;

-- An old, concluded case gets no live deadline, and that includes the 60/90 days of an imported arrest.
CREATE OR REPLACE VIEW case_deadline AS
SELECT f.id AS fir_id, 'chargesheet_custody' AS kind,
       min(arrest_last_day(a.id)) AS due_on,
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
FROM notice n WHERE n.status IN ('sent','reply_incomplete') AND n.reply_due_on IS NOT NULL;
