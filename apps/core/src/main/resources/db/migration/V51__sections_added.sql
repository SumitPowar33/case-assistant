-- Sections added to an FIR during the investigation (AI feature A2, session 80). The AI gateway (feature section_suggest)
-- reads the FIR text against the charges of the playbooks and suggests the sections whose ingredients the text may
-- describe; the officer chooses. A section the officer adds is kept here with who added it, when, why and the gateway's
-- request, beside the sections given at registration (those keep added_at, reason and ai_request_id empty). Rows stay
-- as written (fir_section_kept, V34): a section is never edited or taken out here.
ALTER TABLE fir_section
  ADD COLUMN added_at      timestamptz,
  ADD COLUMN reason        text CHECK (reason IS NULL OR length(btrim(reason)) BETWEEN 10 AND 2000),
  ADD COLUMN ai_request_id uuid,
  ADD CONSTRAINT fir_section_added_whole CHECK (
    (added_at IS NULL AND reason IS NULL AND ai_request_id IS NULL)
    OR (added_at IS NOT NULL AND reason IS NOT NULL AND ai_request_id IS NOT NULL AND chosen_by IS NOT NULL));

-- Which law the offence of an FIR falls under. The BNS came into force on 1 July 2024 (00:00 India time); an offence
-- committed before it stays under the IPC (BNS 358(2); Constitution Article 20(1): no heavier law after the act).
--   'new'     the offence began on or after 1 July 2024
--   'old'     it ended before 1 July 2024 (or, its time not recorded, the information came before that day)
--   'spans'   it began before and went on after 1 July 2024 (a person decides, with the prosecutor)
--   'unknown' its time is not recorded and the information came on or after 1 July 2024
CREATE FUNCTION fir_offence_law(p_fir uuid) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN occurrence_from >= c THEN 'new'
    WHEN occurrence_from IS NOT NULL AND occurrence_to >= c THEN 'spans'
    WHEN occurrence_from IS NOT NULL OR occurrence_to < c OR information_received_at < c THEN 'old'
    ELSE 'unknown' END
  FROM fir, (SELECT timestamptz '2024-07-01 00:00+05:30' AS c) cutoff WHERE id = p_fir
$$;

-- A section added during the investigation must be of the law the offence falls under: no BNS section for an offence
-- under the IPC, no IPC section for an offence under the BNS. Sections given at registration or by an import are not
-- checked here (they are the record as it was made).
CREATE FUNCTION fir_section_added_law() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.act = 'BNS' AND fir_offence_law(NEW.fir_id) = 'old' THEN
    RAISE EXCEPTION 'the offence of this FIR is under the IPC (before 1 July 2024); a BNS section cannot be added' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.act = 'IPC' AND fir_offence_law(NEW.fir_id) = 'new' THEN
    RAISE EXCEPTION 'the offence of this FIR is under the BNS (from 1 July 2024); an IPC section cannot be added' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER fir_section_added_law BEFORE INSERT ON fir_section FOR EACH ROW WHEN (NEW.added_at IS NOT NULL)
  EXECUTE FUNCTION fir_section_added_law();
