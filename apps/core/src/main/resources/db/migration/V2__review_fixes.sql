-- Weekly review fixes (24 Oct 2026).
-- 1. Victim identity protection no longer depends only on a hand-ticked box: it also applies to every
--    victim and complainant in an FIR with a BNS 64-71 section (BNS 72) or any POCSO Act section (POCSO 23).
-- 2. BNSS 193(2) two-month limit follows the sections it names (BNS 64-68, 70, 71; POCSO 4, 6, 8, 10).
--    BNS 69 is masked but not on the 193(2) list. If no section is recorded yet, the sexual_offence flag decides.
-- 3. Deadline dates are counted on the Indian calendar day (IST), not the database server's time zone.
-- 4. Once an evidence item has a SHA-256, it can never be changed.

-- Leading section number: '64(1)' -> 64, '318(4)' -> 318.
CREATE FUNCTION section_no(section text) RETURNS int
LANGUAGE sql IMMUTABLE AS $$ SELECT substring(section from '^\s*(\d+)')::int $$;

CREATE FUNCTION identity_protected_case(p_fir uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT coalesce((SELECT sexual_offence FROM fir WHERE id = p_fir), false)
      OR EXISTS (SELECT 1 FROM fir_section s WHERE s.fir_id = p_fir
                 AND ((s.act = 'BNS' AND section_no(s.section) BETWEEN 64 AND 71) OR s.act = 'POCSO Act'))
$$;

CREATE FUNCTION person_masked(p_role text, p_identity_masked boolean, p_fir uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT p_identity_masked OR (p_role IN ('victim', 'complainant') AND identity_protected_case(p_fir))
$$;

CREATE OR REPLACE VIEW person_public AS
SELECT p.id, p.fir_id, p.role, p.label, p.identity_known,
       CASE WHEN m.masked THEN initcap(p.role) || ' ' || coalesce(p.label, 'X') ELSE p.full_name END AS display_name,
       CASE WHEN m.masked THEN NULL ELSE p.phone END            AS phone,
       CASE WHEN m.masked THEN NULL ELSE p.address_present END  AS address_present,
       p.age_years, p.gender, m.masked AS identity_masked
FROM person p CROSS JOIN LATERAL (SELECT person_masked(p.role, p.identity_masked, p.fir_id) AS masked) m;

CREATE FUNCTION bnss_193_2_applies(p_fir uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN EXISTS (SELECT 1 FROM fir_section WHERE fir_id = p_fir)
    THEN EXISTS (SELECT 1 FROM fir_section s WHERE s.fir_id = p_fir
                 AND ((s.act = 'BNS' AND section_no(s.section) IN (64, 65, 66, 67, 68, 70, 71))
                   OR (s.act = 'POCSO Act' AND section_no(s.section) IN (4, 6, 8, 10))))
    ELSE coalesce((SELECT sexual_offence FROM fir WHERE id = p_fir), false)
  END
$$;

CREATE FUNCTION ist_date(t timestamptz) RETURNS date
LANGUAGE sql IMMUTABLE AS $$ SELECT (t AT TIME ZONE 'Asia/Kolkata')::date $$;

CREATE OR REPLACE VIEW case_deadline AS
SELECT f.id AS fir_id, 'chargesheet_custody' AS kind,
       min(chargesheet_last_day(a.first_remand_on, a.max_punishment)) AS due_on,
       'BNSS 187(3), from first remand of an accused in custody' AS basis
FROM fir f JOIN person p ON p.fir_id = f.id JOIN arrest a ON a.person_id = p.id
WHERE a.first_remand_on IS NOT NULL
GROUP BY f.id
UNION ALL
SELECT f.id, 'sexual_offence_investigation', sexual_offence_last_day(ist_date(f.registered_at)), 'BNSS 193(2)'
FROM fir f WHERE bnss_193_2_applies(f.id)
UNION ALL
SELECT f.id, 'victim_progress_update', (ist_date(f.registered_at) + 90), 'BNSS 193(3)(ii), 90 days'
FROM fir f
UNION ALL
SELECT n.fir_id, 'notice_reply:' || n.addressee, n.reply_due_on, n.kind
FROM notice n WHERE n.status IN ('sent','reply_incomplete') AND n.reply_due_on IS NOT NULL;

CREATE FUNCTION forbid_hash_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.sha256 IS NOT NULL AND NEW.sha256 IS DISTINCT FROM OLD.sha256 THEN
    RAISE EXCEPTION 'evidence_item.sha256 cannot change once recorded (item %)', OLD.label;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER evidence_hash_fixed
BEFORE UPDATE OF sha256 ON evidence_item
FOR EACH ROW EXECUTE FUNCTION forbid_hash_change();
