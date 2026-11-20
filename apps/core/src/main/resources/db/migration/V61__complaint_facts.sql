-- AI fact check of a signed complaint at the front desk, before an FIR exists (design board 2, AI feature A1, session 117).
-- Same rules as fir_fact (V50): the officer confirms each fact the AI read, or corrects its value; only confirmed facts are
-- kept, each with the exact words of the signed complaint it comes from (the text is fixed once signed, V30, so the quote
-- stays true), kept as written. Only a signed complaint takes facts. An AI result is not taken when the complaint's FIR
-- protects the victim's identity (as V55); a complaint of a protected kind (sexual offence, acid attack) is refused by the
-- core, which knows the kinds from the packs.
CREATE TABLE complaint_fact (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_id  uuid NOT NULL REFERENCES complaint(id) ON DELETE CASCADE,
  kind          text NOT NULL CHECK (kind IN ('date', 'time', 'place', 'amount', 'utr', 'phone', 'account', 'upi')),
  value         text NOT NULL CHECK (length(btrim(value)) BETWEEN 1 AND 200),
  ai_value      text NOT NULL CHECK (length(btrim(ai_value)) BETWEEN 1 AND 200),
  quote         text NOT NULL CHECK (length(quote) BETWEEN 1 AND 500 AND btrim(quote) <> ''),
  ai_request_id uuid NOT NULL,
  confirmed_by  uuid NOT NULL REFERENCES app_user(id),
  confirmed_at  timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE UNIQUE INDEX complaint_fact_once ON complaint_fact (complaint_id, kind, lower(btrim(value)));

CREATE FUNCTION complaint_fact_ok() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c complaint%ROWTYPE;
BEGIN
  SELECT * INTO c FROM complaint WHERE id = NEW.complaint_id;
  IF c.signed_at IS NULL THEN
    RAISE EXCEPTION 'only a signed complaint takes facts' USING ERRCODE = 'check_violation';
  END IF;
  IF strpos(c.text_original, NEW.quote) = 0 THEN
    RAISE EXCEPTION 'the quote of a fact must be words of the complaint text' USING ERRCODE = 'check_violation';
  END IF;
  IF c.fir_id IS NOT NULL AND identity_protected_case(c.fir_id) THEN
    RAISE EXCEPTION 'an AI result is not taken on a case whose victim''s identity is protected' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER complaint_fact_ok BEFORE INSERT ON complaint_fact FOR EACH ROW EXECUTE FUNCTION complaint_fact_ok();
CREATE TRIGGER complaint_fact_kept BEFORE UPDATE OR DELETE ON complaint_fact FOR EACH ROW EXECUTE FUNCTION forbid_change_kept();
