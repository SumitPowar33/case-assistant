-- POCSO case mode, first part (item 15, plan section 6). A case is a POCSO case when the FIR has a POCSO Act section, or
-- a victim under 18 is recorded in a sexual-offence FIR (BNS 64-79, IPC 354, 376, 509, or the FIR's sexual-offence flag):
-- the police must then add the POCSO section, and the steps below apply already.
-- The legal steps of such a case are recorded here when done. Two have a limit in the law and join the deadlines until
-- recorded, both counted from the receipt of the information:
--   * report to the Child Welfare Committee and the Special Court within 24 hours (POCSO 19(6));
--   * medical examination of the child within 24 hours (POCSO 27, by BNSS 184(1)).
-- The others have no limit in the law and are shown as open until recorded: statement at the child's home or chosen
-- place by a woman officer (POCSO 24), statement before the Magistrate (BNSS 183; POCSO 25), support person
-- (POCSO Rules 2020, rule 4), interim compensation asked of the Special Court (POCSO 33(8); POCSO Rules 2020, rule 9).
-- A step is kept as written (a mistake is answered by recording it again); no names are stored, only which step, when it
-- was done and who recorded it. The two-month limit of BNSS 193(2) is already a deadline (V2).
CREATE FUNCTION pocso_case(p_fir uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM fir_section s WHERE s.fir_id = p_fir AND s.act = 'POCSO Act')
      OR (EXISTS (SELECT 1 FROM person p WHERE p.fir_id = p_fir AND p.role = 'victim' AND p.age_years < 18)
          AND (coalesce((SELECT sexual_offence FROM fir WHERE id = p_fir), false)
               OR EXISTS (SELECT 1 FROM fir_section s WHERE s.fir_id = p_fir
                          AND ((s.act = 'BNS' AND section_no(s.section) BETWEEN 64 AND 79)
                            OR (s.act = 'IPC' AND section_no(s.section) IN (354, 376, 509))))))
$$;

CREATE TABLE pocso_step (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fir_id       uuid NOT NULL REFERENCES fir(id),
  step         text NOT NULL CHECK (step IN ('cwc_court_report','medical_examination','statement_chosen_place',
                                             'magistrate_statement','support_person','interim_compensation')),
  done_at      timestamptz NOT NULL,
  recorded_by  uuid NOT NULL REFERENCES app_user(id),
  recorded_at  timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (done_at <= recorded_at)
);
CREATE INDEX pocso_step_fir ON pocso_step (fir_id);

CREATE FUNCTION pocso_step_rules() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'a step of a POCSO case is kept as written (%)', TG_OP;
  END IF;
  IF NOT pocso_case(NEW.fir_id) THEN
    RAISE EXCEPTION 'the FIR is not a POCSO case' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.done_at < (SELECT information_received_at FROM fir WHERE id = NEW.fir_id) THEN
    RAISE EXCEPTION 'a step cannot be before the information was received' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pocso_step_kept BEFORE INSERT OR UPDATE OR DELETE ON pocso_step FOR EACH ROW EXECUTE FUNCTION pocso_step_rules();

-- the view of V33, with the two 24-hour steps of a POCSO case until each is recorded
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
SELECT f.id, 'pocso_' || st.step, ist_date(f.information_received_at + interval '24 hours'),
       st.basis || ', 24 hours from the information: by '
         || to_char((f.information_received_at + interval '24 hours') AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY HH24:MI') || ' IST'
FROM fir f CROSS JOIN (VALUES ('cwc_court_report', 'POCSO 19(6)'), ('medical_examination', 'POCSO 27; BNSS 184(1)')) AS st(step, basis)
WHERE NOT f.concluded AND pocso_case(f.id)
  AND NOT EXISTS (SELECT 1 FROM pocso_step p WHERE p.fir_id = f.id AND p.step = st.step);
