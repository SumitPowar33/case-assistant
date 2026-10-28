-- Re-arrest in the same case (Sumit, 28 Oct 2026): custody days already spent before an earlier release count towards
-- the 60/90 days. Counted from the first remand to the day of release, both days included, for each earlier arrest of the
-- same person that has both dates. Draft rule: a prosecutor should confirm it.
CREATE FUNCTION earlier_custody_days(arrest uuid) RETURNS integer LANGUAGE sql STABLE AS $$
  SELECT coalesce(sum(e.released_on - e.first_remand_on + 1), 0)::integer
  FROM arrest_current a JOIN arrest_current e ON e.person_id = a.person_id AND e.arrested_at < a.arrested_at
  WHERE a.id = arrest AND e.first_remand_on IS NOT NULL AND e.released_on >= e.first_remand_on
$$;

-- Last day for the chargesheet of one arrest: the usual 60/90 days from its first remand, less the earlier custody days,
-- and never before the first remand itself.
CREATE FUNCTION arrest_last_day(arrest uuid) RETURNS date LANGUAGE sql STABLE AS $$
  SELECT greatest(a.first_remand_on, chargesheet_last_day(a.first_remand_on, a.max_punishment) - earlier_custody_days(a.id))
  FROM arrest_current a WHERE a.id = arrest AND a.first_remand_on IS NOT NULL
$$;

CREATE OR REPLACE VIEW case_deadline AS
SELECT f.id AS fir_id, 'chargesheet_custody' AS kind,
       min(arrest_last_day(a.id)) AS due_on,
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
