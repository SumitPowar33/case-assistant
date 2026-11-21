-- Weekly review of 21 Nov 2026, three fixes to the POCSO case mode (V56):
-- 1. A child victim of a sexual-offence FIR (a POCSO case by age, pocso_case) is protected like any POCSO case (POCSO 23,
--    BNS 72): before, a FIR under BNS 75 or IPC 354 with a victim of 15 and no POCSO section yet showed the child's name
--    unmasked, unlogged, and took AI results. identity_protected_case now also answers true for a POCSO case.
-- 2. The medical examination may be recorded as done before the police received the information: a hospital examines the
--    child first and then informs the police (POCSO 19(1)); the report to the CWC and the Special Court still cannot be.
-- 3. An imported FIR (an old case of the earlier system) gets no 24-hour POCSO deadline: those 24 hours ended long ago,
--    as the BNSS 58 production deadline is not shown for an imported arrest. Its steps are still shown open until recorded.

CREATE OR REPLACE FUNCTION identity_protected_case(p_fir uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT coalesce((SELECT sexual_offence OR identity_protected FROM fir WHERE id = p_fir), false)
      OR EXISTS (SELECT 1 FROM fir_section s WHERE s.fir_id = p_fir
                 AND ((s.act = 'BNS' AND (section_no(s.section) BETWEEN 64 AND 71 OR section_no(s.section) = 124))
                   OR (s.act = 'IPC' AND (section_no(s.section) = 376 OR s.section ~* '^\s*326\s*-?\s*[ab]($|[^a-z0-9])'))
                   OR s.act = 'POCSO Act'))
      OR pocso_case(p_fir)
$$;

CREATE OR REPLACE FUNCTION pocso_step_rules() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'a step of a POCSO case is kept as written (%)', TG_OP;
  END IF;
  IF NOT pocso_case(NEW.fir_id) THEN
    RAISE EXCEPTION 'the FIR is not a POCSO case' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.step <> 'medical_examination' AND NEW.done_at < (SELECT information_received_at FROM fir WHERE id = NEW.fir_id) THEN
    RAISE EXCEPTION 'a step cannot be before the information was received' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

-- the view of V56, without the 24-hour POCSO deadlines of an imported FIR
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
WHERE NOT f.concluded AND f.import_batch_id IS NULL AND pocso_case(f.id)
  AND NOT EXISTS (SELECT 1 FROM pocso_step p WHERE p.fir_id = f.id AND p.step = st.step);
