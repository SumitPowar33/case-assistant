-- Statements of witnesses under BNSS 180 (design board 6, session 65).
-- The words are kept as the person said them, in the language spoken; nothing is changed or removed. A mistake is
-- corrected by recording a new statement. Only a complainant, victim or witness of the same case can have one
-- (an accused's statement to the police is not recorded here). Translations come later with the AI gateway.

CREATE TABLE witness_statement (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fir_id        uuid NOT NULL REFERENCES fir(id),
  person_id     uuid NOT NULL REFERENCES person(id),
  recorded_at   timestamptz NOT NULL DEFAULT clock_timestamp(),
  recorded_by   uuid NOT NULL REFERENCES app_user(id),
  language      text NOT NULL CHECK (language ~ '^[a-z]{2,3}$'),
  medium        text NOT NULL CHECK (medium IN ('written', 'audio', 'video')),
  original_text text NOT NULL CHECK (length(btrim(original_text)) BETWEEN 3 AND 20000)
);
CREATE INDEX witness_statement_case ON witness_statement (fir_id, recorded_at);

CREATE FUNCTION witness_statement_check() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'a statement is kept as written (%)', TG_OP;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM person p WHERE p.id = NEW.person_id AND p.fir_id = NEW.fir_id AND p.role IN ('complainant', 'victim', 'witness')) THEN
    RAISE EXCEPTION 'a statement belongs to a complainant, victim or witness of the same case' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER witness_statement_checked BEFORE INSERT OR UPDATE OR DELETE ON witness_statement FOR EACH ROW EXECUTE FUNCTION witness_statement_check();

-- reading statements of a protected case is logged like its people and diary (V37)
ALTER TABLE protected_read DROP CONSTRAINT protected_read_what_check;
ALTER TABLE protected_read ADD CONSTRAINT protected_read_what_check CHECK (what IN ('people', 'fir_text', 'complaint', 'complaint_list', 'diary', 'statements'));
