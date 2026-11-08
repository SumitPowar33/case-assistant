-- AI fact check of the FIR text (design board 2, AI feature A1, session 79). The AI gateway (feature fir_extract) lists
-- facts it read in the FIR text; the officer confirms each one, or corrects its value, before it is kept here. Only
-- confirmed facts are stored, each with the exact words of the FIR text it comes from, so every fact points at its
-- source. The FIR text is never overwritten (V1), so the quote stays true. Kept as written: a wrong fact is answered by
-- a note in the case diary, never by a change. People's names are not a kind: the facts are dates, times, places,
-- money and the numbers that identify accounts, phones and payments.

CREATE TABLE fir_fact (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fir_id        uuid NOT NULL REFERENCES fir(id) ON DELETE CASCADE,
  kind          text NOT NULL CHECK (kind IN ('date', 'time', 'place', 'amount', 'utr', 'phone', 'account', 'upi')),
  value         text NOT NULL CHECK (length(btrim(value)) BETWEEN 1 AND 200),
  ai_value      text NOT NULL CHECK (length(btrim(ai_value)) BETWEEN 1 AND 200),   -- what the AI read; differs from value when corrected
  quote         text NOT NULL CHECK (length(quote) BETWEEN 1 AND 500 AND btrim(quote) <> ''),
  ai_request_id uuid NOT NULL,                                                     -- the gateway's request, for its audit log
  confirmed_by  uuid NOT NULL REFERENCES app_user(id),
  confirmed_at  timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE UNIQUE INDEX fir_fact_once ON fir_fact (fir_id, kind, lower(btrim(value)));

-- the quote must be words of this FIR's text, exactly as written
CREATE FUNCTION fir_fact_quoted() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM fir WHERE id = NEW.fir_id AND strpos(contents_original, NEW.quote) > 0) THEN
    RAISE EXCEPTION 'the quote of a fact must be words of the FIR text' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER fir_fact_quoted BEFORE INSERT ON fir_fact FOR EACH ROW EXECUTE FUNCTION fir_fact_quoted();
CREATE TRIGGER fir_fact_kept BEFORE UPDATE OR DELETE ON fir_fact FOR EACH ROW EXECUTE FUNCTION forbid_change_kept();
