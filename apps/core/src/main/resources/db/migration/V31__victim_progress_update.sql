-- BNSS 193(3)(ii) (weekly review, 31 Oct 2026): within 90 days the police inform the informant or the victim of the
-- progress of the investigation, by any means including electronic communication. Until now the deadline could not be
-- marked as done, so it showed as overdue for the life of the case. The update given is recorded here, kept as written
-- (a mistake is answered by recording the right one), and no names are stored: only to whom, how and when.
CREATE TABLE victim_update (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fir_id       uuid NOT NULL REFERENCES fir(id),
  given_on     date NOT NULL,
  told_to      text NOT NULL CHECK (told_to IN ('informant','victim')),
  means        text NOT NULL CHECK (means IN ('in_person','phone','sms','email','letter','other')),
  recorded_by  uuid NOT NULL REFERENCES app_user(id),
  recorded_at  timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (given_on <= ist_date(recorded_at))
);
CREATE INDEX victim_update_fir ON victim_update (fir_id);

CREATE FUNCTION victim_update_rules() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'a progress update to the victim is kept as written (%)', TG_OP;
  END IF;
  IF NEW.given_on < (SELECT ist_date(registered_at) FROM fir WHERE id = NEW.fir_id) THEN
    RAISE EXCEPTION 'a progress update cannot be before the FIR was registered' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER victim_update_kept BEFORE INSERT OR UPDATE OR DELETE ON victim_update FOR EACH ROW EXECUTE FUNCTION victim_update_rules();

-- the view of V29, with the victim update hidden once one is recorded
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
WHERE NOT f.concluded AND NOT EXISTS (SELECT 1 FROM victim_update v WHERE v.fir_id = f.id)
UNION ALL
SELECT n.fir_id, 'notice_reply:' || n.addressee, n.reply_due_on, n.kind
FROM notice n JOIN fir f ON f.id = n.fir_id
WHERE n.status IN ('sent','reply_incomplete') AND n.reply_due_on IS NOT NULL AND NOT f.concluded;
