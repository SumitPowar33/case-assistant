-- Weekly review of 14 Nov 2026: the AI features A1 (facts of the FIR text), A2 (sections from the playbooks) and A6
-- (narrative of the final report) are not offered on a case whose victim's identity is protected (BNS 72, BNS 124),
-- because the FIR text or statements would have to go to the AI provider. Only the web app kept to that; the core took
-- their results anyway. Now the database refuses a record that names an AI request on such a case, as V52 does for a
-- statement's translation. Records made before the case became protected stay as written.
CREATE FUNCTION ai_result_not_on_protected() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE f uuid;
BEGIN
  IF TG_TABLE_NAME = 'final_report_event' THEN
    SELECT fir_id INTO f FROM final_report_draft WHERE id = NEW.draft_id;
  ELSE
    f := NEW.fir_id;
  END IF;
  IF identity_protected_case(f) THEN
    RAISE EXCEPTION 'an AI result is not taken on a case whose victim''s identity is protected' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER fir_fact_not_on_protected BEFORE INSERT ON fir_fact FOR EACH ROW
  EXECUTE FUNCTION ai_result_not_on_protected();
CREATE TRIGGER fir_section_ai_not_on_protected BEFORE INSERT ON fir_section FOR EACH ROW WHEN (NEW.ai_request_id IS NOT NULL)
  EXECUTE FUNCTION ai_result_not_on_protected();
CREATE TRIGGER final_report_ai_not_on_protected BEFORE INSERT ON final_report_event FOR EACH ROW WHEN (NEW.ai_request IS NOT NULL)
  EXECUTE FUNCTION ai_result_not_on_protected();
