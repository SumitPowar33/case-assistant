-- English translation beside a statement (design board 6, AI feature A3, session 81). The AI gateway (feature
-- statement_translate) drafts an English translation of a statement recorded in an Indian language; the officer reads
-- it against the original, corrects it if needed, and only then is it kept here, beside the statement, never in its
-- place: the statement stays as said in the language spoken (V40). What the AI drafted is kept too, so the audit shows
-- what the officer changed. One checked translation per statement, kept as written (a wrong one is answered in the
-- case diary). Not for a statement of a case that protects the victim's identity, or of a person masked by hand: its
-- words would have gone to the AI provider.

CREATE TABLE statement_translation (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_id    uuid NOT NULL UNIQUE REFERENCES witness_statement(id),
  language        text NOT NULL DEFAULT 'en' CHECK (language = 'en'),
  translated_text text NOT NULL CHECK (length(btrim(translated_text)) BETWEEN 1 AND 40000),
  ai_text         text NOT NULL CHECK (length(btrim(ai_text)) BETWEEN 1 AND 40000),   -- the AI's draft; differs when corrected
  ai_request_id   uuid NOT NULL,                                                     -- the gateway's request, for its audit log
  checked_by      uuid NOT NULL REFERENCES app_user(id),
  checked_at      timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE FUNCTION statement_translation_check() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s record;
BEGIN
  SELECT w.fir_id, w.language, p.identity_masked INTO s
    FROM witness_statement w JOIN person p ON p.id = w.person_id WHERE w.id = NEW.statement_id;
  IF s.language = 'en' THEN
    RAISE EXCEPTION 'a statement made in English is not translated into English' USING ERRCODE = 'check_violation';
  END IF;
  IF s.identity_masked OR identity_protected_case(s.fir_id) THEN
    RAISE EXCEPTION 'a statement of a protected victim''s case or a masked person is not sent for translation' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER statement_translation_checked BEFORE INSERT ON statement_translation FOR EACH ROW EXECUTE FUNCTION statement_translation_check();
CREATE TRIGGER statement_translation_kept BEFORE UPDATE OR DELETE ON statement_translation FOR EACH ROW EXECUTE FUNCTION forbid_change_kept();
