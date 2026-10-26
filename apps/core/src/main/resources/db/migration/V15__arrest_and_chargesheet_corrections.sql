-- Corrections (26 Oct 2026). The arrest memo, a remand date, a release and a chargesheet are kept as written.
-- A mistake is fixed by a new record that names the one it replaces and says why (same pattern as 63(4)
-- certificates, V4). The old record stays; the deadlines use only the current one.

-- Arrest: a correction restates the four facts the 60/90-day limit depends on. The newest correction is current.
CREATE TABLE arrest_correction (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  arrest_id        uuid NOT NULL REFERENCES arrest(id),
  supersedes       uuid UNIQUE REFERENCES arrest_correction(id),
  first_remand_on  date,
  max_punishment   text NOT NULL CHECK (max_punishment IN ('death','life','10_years_or_more','less_than_10_years')),
  released_on      date,
  release_basis    text CHECK (release_basis IN ('bail','default_bail','other')),
  reason           text NOT NULL CHECK (char_length(btrim(reason)) >= 10),
  recorded_by      uuid NOT NULL REFERENCES app_user(id),
  recorded_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT arrest_correction_release_complete CHECK ((released_on IS NULL) = (release_basis IS NULL))
);
-- The first correction of an arrest has no predecessor; every later one replaces the newest.
CREATE UNIQUE INDEX arrest_correction_first ON arrest_correction (arrest_id) WHERE supersedes IS NULL;

CREATE FUNCTION arrest_correction_rules() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE arrested date;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'arrest_correction rows are kept as written (%)', TG_OP;
  END IF;
  IF NEW.supersedes IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM arrest_correction c WHERE c.id = NEW.supersedes AND c.arrest_id = NEW.arrest_id) THEN
    RAISE EXCEPTION 'a correction must replace a correction of the same arrest' USING ERRCODE = 'check_violation';
  END IF;
  SELECT ist_date(arrested_at) INTO arrested FROM arrest WHERE id = NEW.arrest_id;
  IF NEW.first_remand_on < arrested OR NEW.released_on < arrested THEN
    RAISE EXCEPTION 'the first remand and the release cannot be before the day of arrest' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER arrest_correction_kept BEFORE INSERT OR UPDATE OR DELETE ON arrest_correction
FOR EACH ROW EXECUTE FUNCTION arrest_correction_rules();

-- One row per arrest with the facts as they stand now (the newest correction, else the memo as first written).
CREATE VIEW arrest_current AS
SELECT a.id, a.person_id, a.arrested_at,
       coalesce(c.first_remand_on, CASE WHEN c.id IS NULL THEN a.first_remand_on END) AS first_remand_on,
       coalesce(c.max_punishment, a.max_punishment) AS max_punishment,
       CASE WHEN c.id IS NULL THEN a.released_on ELSE c.released_on END AS released_on,
       CASE WHEN c.id IS NULL THEN a.release_basis ELSE c.release_basis END AS release_basis,
       c.id AS correction_id
FROM arrest a
LEFT JOIN arrest_correction c ON c.arrest_id = a.id
  AND NOT EXISTS (SELECT 1 FROM arrest_correction n WHERE n.supersedes = c.id);

-- Chargesheet: a correction is a new chargesheet that replaces one; the old one stays but no longer counts.
ALTER TABLE chargesheet
  ADD COLUMN supersedes        uuid UNIQUE REFERENCES chargesheet(id),
  ADD COLUMN correction_reason text,
  ADD CONSTRAINT chargesheet_correction_has_reason
    CHECK ((supersedes IS NULL) = (correction_reason IS NULL OR char_length(btrim(correction_reason)) < 10)),
  DROP CONSTRAINT chargesheet_fir_id_report_no_key;
CREATE UNIQUE INDEX chargesheet_one_original ON chargesheet (fir_id, report_no) WHERE supersedes IS NULL;

CREATE OR REPLACE FUNCTION chargesheet_rules() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION '% rows are kept as written (%)', TG_TABLE_NAME, TG_OP;
  END IF;
  IF TG_TABLE_NAME = 'chargesheet' THEN
    IF NEW.filed_on < (SELECT ist_date(registered_at) FROM fir WHERE id = NEW.fir_id) THEN
      RAISE EXCEPTION 'a chargesheet cannot be filed before the FIR was registered';
    END IF;
    IF NEW.supersedes IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM chargesheet c WHERE c.id = NEW.supersedes AND c.fir_id = NEW.fir_id) THEN
      RAISE EXCEPTION 'a correction must replace a chargesheet of the same case' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NOT EXISTS (SELECT 1 FROM person p JOIN chargesheet c ON c.fir_id = p.fir_id
                    WHERE p.id = NEW.person_id AND c.id = NEW.chargesheet_id AND p.role = 'accused') THEN
    RAISE EXCEPTION 'a chargesheet names only accused of its own case (person %)', NEW.person_id;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION chargesheet_filed_for(p_person uuid) RETURNS date
LANGUAGE sql STABLE AS $$
  SELECT min(c.filed_on) FROM chargesheet c JOIN chargesheet_accused ca ON ca.chargesheet_id = c.id
  WHERE ca.person_id = p_person AND NOT EXISTS (SELECT 1 FROM chargesheet n WHERE n.supersedes = c.id)
$$;

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
UNION ALL
SELECT f.id, 'victim_progress_update', (ist_date(f.registered_at) + 90), 'BNSS 193(3)(ii), 90 days'
FROM fir f
UNION ALL
SELECT n.fir_id, 'notice_reply:' || n.addressee, n.reply_due_on, n.kind
FROM notice n WHERE n.status IN ('sent','reply_incomplete') AND n.reply_due_on IS NOT NULL;
