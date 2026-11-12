-- Freezing a bank account (debit freeze) as a seizure under BNSS 106: the officer sends the bank a notice of kind BNSS_106
-- naming the accounts (through the existing notices: draft, sign, send, replies), then records two steps, each once and kept
-- as written: the report of the seizure to the Magistrate (BNSS 106(3), "forthwith"; the deadline below, a unit may make it
-- earlier with the policy freeze_report_days) and the release of the freeze (the court's order or the reason). The amounts
-- the bank actually holds stay in the money trail (money_hold). FreezeController.
ALTER TABLE notice DROP CONSTRAINT notice_kind_check;
ALTER TABLE notice ADD CONSTRAINT notice_kind_check CHECK (kind IN ('BNSS_94','BNSS_35_3','BNSS_179','BNSS_106','follow_up','CrPC_91','CrPC_41A','CrPC_160'));
ALTER TABLE notice DROP CONSTRAINT notice_items_listed;
ALTER TABLE notice ADD CONSTRAINT notice_items_listed CHECK (kind NOT IN ('BNSS_94','CrPC_91','BNSS_106') OR cardinality(items_requested) > 0);

CREATE TABLE freeze_step (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notice_id    uuid NOT NULL REFERENCES notice(id),
  kind         text NOT NULL CHECK (kind IN ('reported', 'released')),
  on_date      date NOT NULL,
  reference    text NOT NULL CHECK (length(btrim(reference)) BETWEEN 3 AND 200),   -- the court, or the order or letter
  reason       text CHECK (reason IS NULL OR length(btrim(reason)) BETWEEN 10 AND 1000),
  recorded_by  uuid NOT NULL REFERENCES app_user(id),
  recorded_at  timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (notice_id, kind),
  CHECK (kind <> 'released' OR reason IS NOT NULL)
);

-- a step belongs to a BNSS 106 notice that was sent, is not before it was issued nor after today, and a release follows a report
CREATE FUNCTION freeze_step_fits() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE n notice;
BEGIN
  SELECT * INTO n FROM notice WHERE id = NEW.notice_id;
  IF n.kind <> 'BNSS_106' OR n.status IN ('draft', 'cancelled') THEN
    RAISE EXCEPTION 'A freeze step belongs to a BNSS 106 notice that was sent';
  END IF;
  IF NEW.on_date < ist_date(n.issued_at) OR NEW.on_date > ist_date(clock_timestamp()) THEN
    RAISE EXCEPTION 'The date must be between the day the notice was issued and today';
  END IF;
  IF NEW.kind = 'released' AND NOT EXISTS (SELECT 1 FROM freeze_step WHERE notice_id = NEW.notice_id AND kind = 'reported') THEN
    RAISE EXCEPTION 'Record the report to the Magistrate before the release';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER freeze_step_fits BEFORE INSERT ON freeze_step FOR EACH ROW EXECUTE FUNCTION freeze_step_fits();
CREATE TRIGGER freeze_step_kept BEFORE UPDATE OR DELETE ON freeze_step FOR EACH ROW EXECUTE FUNCTION forbid_change_kept();

-- the deadlines of V33, and the report of a freeze to the Magistrate until it is recorded
CREATE OR REPLACE VIEW case_deadline AS
SELECT f.id AS fir_id, 'chargesheet_custody' AS kind, min(arrest_last_day(a.id)) AS due_on,
       'BNSS 187(3), from first remand of an accused in custody' AS basis
FROM fir f JOIN person p ON p.fir_id = f.id JOIN arrest_current a ON a.person_id = p.id
WHERE a.first_remand_on IS NOT NULL AND a.released_on IS NULL AND chargesheet_filed_for(p.id) IS NULL AND NOT f.concluded
GROUP BY f.id
UNION ALL
SELECT f.id, 'production_before_magistrate', ist_date(min(a.arrested_at) + interval '24 hours'),
       'BNSS 58, 24 hours from arrest (journey time excluded): by '
         || to_char((min(a.arrested_at) + interval '24 hours') AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY HH24:MI') || ' IST'
FROM fir f JOIN person p ON p.fir_id = f.id JOIN arrest_current a ON a.person_id = p.id JOIN arrest ar ON ar.id = a.id
WHERE a.first_remand_on IS NULL AND a.released_on IS NULL AND ar.import_batch_id IS NULL
  AND chargesheet_filed_for(p.id) IS NULL AND NOT f.concluded
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
WHERE n.status IN ('sent','reply_incomplete') AND n.reply_due_on IS NOT NULL AND NOT f.concluded
UNION ALL
SELECT n.fir_id, 'freeze_report', ist_date(n.issued_at) + effective_policy_days(f.station_id, 'freeze_report_days', 1),
       'BNSS 106(3), report the seizure to the Magistrate: ' || array_to_string(n.items_requested, ', ')
FROM notice n JOIN fir f ON f.id = n.fir_id
WHERE n.kind = 'BNSS_106' AND n.status <> 'draft' AND n.status <> 'cancelled' AND NOT f.concluded
  AND NOT EXISTS (SELECT 1 FROM freeze_step s WHERE s.notice_id = n.id);
