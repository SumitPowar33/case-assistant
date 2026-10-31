-- BNSS 58 (decided 31 Oct 2026 after research): no police officer shall detain a person arrested without warrant for more
-- than 24 hours, exclusive of the journey time to the Magistrate's Court, without a special order of a Magistrate under
-- BNSS 187. Shown as a deadline from the (corrected) time of arrest until a first remand or a release is on record.
-- The journey time cannot be known here, so the deadline is the 24 hours and the basis says the journey is excluded.
-- Arrests loaded from old records are left out: their production happened long ago and the old record may not say.
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
WHERE n.status IN ('sent','reply_incomplete') AND n.reply_due_on IS NOT NULL AND NOT f.concluded;
