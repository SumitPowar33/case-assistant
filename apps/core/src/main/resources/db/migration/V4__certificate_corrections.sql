-- BSA 63(4) certificates are signed documents (25 Oct 2026).
-- 1. A certificate can never be edited or deleted. A mistake is fixed by a new certificate that names the one it
--    replaces (`supersedes`) and says why. Each certificate can be replaced once, by one for the same item and part.
-- 2. Readiness uses only the current certificate of each part (the newest in its chain).
-- 3. Readiness no longer counts a non-SHA-256 hash as "matching": the app can only check SHA-256 against the
--    item's recorded hash, so any other algorithm keeps the item not court-ready until a person sorts it out.

ALTER TABLE certificate_63_4
  ADD COLUMN supersedes        uuid UNIQUE REFERENCES certificate_63_4(id),
  ADD COLUMN correction_reason text,
  ADD CONSTRAINT correction_has_reason
    CHECK ((supersedes IS NULL) = (correction_reason IS NULL OR btrim(correction_reason) = '')),
  DROP CONSTRAINT certificate_63_4_item_id_part_key;

-- One original certificate per item and part; later ones must be corrections.
CREATE UNIQUE INDEX certificate_63_4_one_original ON certificate_63_4 (item_id, part) WHERE supersedes IS NULL;

CREATE FUNCTION certificate_correction_matches() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.supersedes IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM certificate_63_4 c WHERE c.id = NEW.supersedes AND c.item_id = NEW.item_id AND c.part = NEW.part) THEN
    RAISE EXCEPTION 'a correction must replace a certificate for the same item and part' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER certificate_correction_same_item
BEFORE INSERT ON certificate_63_4
FOR EACH ROW EXECUTE FUNCTION certificate_correction_matches();

CREATE FUNCTION forbid_certificate_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'a signed 63(4) certificate cannot be changed (%); add a correction instead', TG_OP;
END $$;

CREATE TRIGGER certificate_63_4_signed
BEFORE UPDATE OR DELETE ON certificate_63_4
FOR EACH ROW EXECUTE FUNCTION forbid_certificate_change();

CREATE OR REPLACE VIEW electronic_item_readiness AS
WITH current_cert AS (
  SELECT c.* FROM certificate_63_4 c
  WHERE NOT EXISTS (SELECT 1 FROM certificate_63_4 n WHERE n.supersedes = c.id)
)
SELECT e.id, e.fir_id, e.label,
       bool_or(c.part = 'A') IS TRUE AS has_part_a,
       bool_or(c.part = 'B') IS TRUE AS has_part_b,
       coalesce(bool_and(c.hash_algo = 'SHA256' AND lower(c.hash_value) = e.sha256), false) IS TRUE AS hashes_match,
       (bool_or(c.part = 'A') IS TRUE AND bool_or(c.part = 'B') IS TRUE
        AND coalesce(bool_and(c.hash_algo = 'SHA256' AND lower(c.hash_value) = e.sha256), false) IS TRUE) AS court_ready
FROM evidence_item e LEFT JOIN current_cert c ON c.item_id = e.id
WHERE e.kind = 'electronic'
GROUP BY e.id, e.fir_id, e.label;
