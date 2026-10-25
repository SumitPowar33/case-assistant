-- Release from custody and the filing of the chargesheet (26 Oct 2026).
-- The BNSS 187(3) 60/90-day limit is about an accused kept in custody without a chargesheet. It stops running
-- for an accused when they are released (on bail or otherwise) or when a chargesheet (police report, BNSS 193(3))
-- naming them is filed. The BNSS 193(2) two-month limit ends when a chargesheet is filed in the case.
-- Both facts are recorded once and kept as written; the arrest list still shows the last day and the dates.

ALTER TABLE arrest
  ADD COLUMN released_on date,
  ADD COLUMN release_basis text CHECK (release_basis IN ('bail','default_bail','other')),
  ADD COLUMN release_recorded_by uuid REFERENCES app_user(id),
  ADD COLUMN release_recorded_at timestamptz,
  ADD CONSTRAINT arrest_release_complete CHECK ((released_on IS NULL) = (release_basis IS NULL)
    AND (released_on IS NULL OR (release_recorded_by IS NOT NULL AND release_recorded_at IS NOT NULL))),
  ADD CONSTRAINT arrest_release_not_before_arrest CHECK (released_on IS NULL OR released_on >= ist_date(arrested_at));

-- The memo is kept as written. Two facts may be added later, each once: the first remand, and the release.
CREATE OR REPLACE FUNCTION arrest_allow_only_remand() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  r CONSTANT text[] := ARRAY['first_remand_on','remand_recorded_by','remand_recorded_at'];
  b CONSTANT text[] := ARRAY['released_on','release_basis','release_recorded_by','release_recorded_at'];
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'arrest memos are kept as written (DELETE)';
  END IF;
  IF (to_jsonb(NEW) - r - b) IS DISTINCT FROM (to_jsonb(OLD) - r - b)
     OR ((to_jsonb(NEW) - b) IS DISTINCT FROM (to_jsonb(OLD) - b) AND (OLD.first_remand_on IS NOT NULL OR NEW.first_remand_on IS NULL))
     OR ((to_jsonb(NEW) - r) IS DISTINCT FROM (to_jsonb(OLD) - r) AND (OLD.released_on IS NOT NULL OR NEW.released_on IS NULL)) THEN
    RAISE EXCEPTION 'arrest memos are kept as written (only the first remand and the release may be added, once each)';
  END IF;
  RETURN NEW;
END $$;

CREATE TABLE chargesheet (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fir_id       uuid NOT NULL REFERENCES fir(id),
  filed_on     date NOT NULL,
  court        text NOT NULL CHECK (btrim(court) <> ''),
  report_no    text NOT NULL CHECK (btrim(report_no) <> ''),
  recorded_by  uuid NOT NULL REFERENCES app_user(id),
  recorded_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fir_id, report_no)
);

CREATE TABLE chargesheet_accused (
  chargesheet_id uuid NOT NULL REFERENCES chargesheet(id),
  person_id      uuid NOT NULL REFERENCES person(id),
  PRIMARY KEY (chargesheet_id, person_id)
);

CREATE FUNCTION chargesheet_rules() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION '% rows are kept as written (%)', TG_TABLE_NAME, TG_OP;
  END IF;
  IF TG_TABLE_NAME = 'chargesheet' THEN
    IF NEW.filed_on < (SELECT ist_date(registered_at) FROM fir WHERE id = NEW.fir_id) THEN
      RAISE EXCEPTION 'a chargesheet cannot be filed before the FIR was registered';
    END IF;
  ELSIF NOT EXISTS (SELECT 1 FROM person p JOIN chargesheet c ON c.fir_id = p.fir_id
                    WHERE p.id = NEW.person_id AND c.id = NEW.chargesheet_id AND p.role = 'accused') THEN
    RAISE EXCEPTION 'a chargesheet names only accused of its own case (person %)', NEW.person_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER chargesheet_kept BEFORE INSERT OR UPDATE OR DELETE ON chargesheet FOR EACH ROW EXECUTE FUNCTION chargesheet_rules();
CREATE TRIGGER chargesheet_accused_kept BEFORE INSERT OR UPDATE OR DELETE ON chargesheet_accused FOR EACH ROW EXECUTE FUNCTION chargesheet_rules();

-- The first chargesheet naming this accused, if any.
CREATE FUNCTION chargesheet_filed_for(p_person uuid) RETURNS date
LANGUAGE sql STABLE AS $$
  SELECT min(c.filed_on) FROM chargesheet c JOIN chargesheet_accused ca ON ca.chargesheet_id = c.id WHERE ca.person_id = p_person
$$;

CREATE OR REPLACE VIEW case_deadline AS
SELECT f.id AS fir_id, 'chargesheet_custody' AS kind,
       min(chargesheet_last_day(a.first_remand_on, a.max_punishment)) AS due_on,
       'BNSS 187(3), from first remand of an accused in custody' AS basis
FROM fir f JOIN person p ON p.fir_id = f.id JOIN arrest a ON a.person_id = p.id
WHERE a.first_remand_on IS NOT NULL AND a.released_on IS NULL AND chargesheet_filed_for(p.id) IS NULL
GROUP BY f.id
UNION ALL
SELECT f.id, 'sexual_offence_investigation', sexual_offence_last_day(ist_date(f.registered_at)), 'BNSS 193(2)'
FROM fir f WHERE bnss_193_2_applies(f.id) AND NOT EXISTS (SELECT 1 FROM chargesheet c WHERE c.fir_id = f.id)
UNION ALL
SELECT f.id, 'victim_progress_update', (ist_date(f.registered_at) + 90), 'BNSS 193(3)(ii), 90 days'
FROM fir f
UNION ALL
SELECT n.fir_id, 'notice_reply:' || n.addressee, n.reply_due_on, n.kind
FROM notice n WHERE n.status IN ('sent','reply_incomplete') AND n.reply_due_on IS NOT NULL;
