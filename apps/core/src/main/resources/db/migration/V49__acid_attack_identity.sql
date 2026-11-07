-- Acid-attack survivors are protected like sexual-offence victims, in every state (decision 4 of 2 Nov 2026).
-- 1. BNS 124 (grievous hurt by acid, and throwing or attempting to throw acid) and, for old FIRs, IPC 326A and 326B
--    protect the victim's and the complainant's identity, as BNS 64-71, IPC 376 and any POCSO section already do.
--    They do not bring the BNSS 193(2) two-month limit: that list is the law's, and acid is not on it.
-- 2. fir.identity_protected: set when the FIR is registered from information of a kind that protects identity
--    (packs/*/complaint-kinds.json, "protects_identity"), so the case is protected before any section is recorded.
--    It is separate from sexual_offence, which also starts the 193(2) limit. Once set it is never cleared.

ALTER TABLE fir ADD COLUMN identity_protected boolean NOT NULL DEFAULT false;

CREATE FUNCTION fir_identity_protected_kept() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.identity_protected AND NOT NEW.identity_protected THEN
    RAISE EXCEPTION 'The victim''s identity protection of an FIR is never removed';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER fir_identity_protected_kept BEFORE UPDATE OF identity_protected ON fir
  FOR EACH ROW EXECUTE FUNCTION fir_identity_protected_kept();

CREATE OR REPLACE FUNCTION identity_protected_case(p_fir uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT coalesce((SELECT sexual_offence OR identity_protected FROM fir WHERE id = p_fir), false)
      OR EXISTS (SELECT 1 FROM fir_section s WHERE s.fir_id = p_fir
                 AND ((s.act = 'BNS' AND (section_no(s.section) BETWEEN 64 AND 71 OR section_no(s.section) = 124))
                   OR (s.act = 'IPC' AND (section_no(s.section) = 376 OR s.section ~* '^\s*326\s*-?\s*[ab]($|[^a-z0-9])'))
                   OR s.act = 'POCSO Act'))
$$;
