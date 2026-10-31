-- AI audit chain head kept outside the AI gateway (weekly review, 31 Oct 2026). The gateway keeps its hash-chained
-- audit log in its own file, with the chain head in the same file, so a whole older copy of that file put back would
-- still verify. After every row the gateway reports the new head here; an older or rewritten file then disagrees with
-- the newest head kept in this database. Kept as written: rows are only added, each with a higher sequence number.
CREATE TABLE ai_chain_anchor (
  seq          bigint PRIMARY KEY CHECK (seq > 0),
  hash         text NOT NULL CHECK (hash ~ '^[0-9a-f]{64}$'),
  reported_by  uuid NOT NULL REFERENCES app_user(id),
  reported_at  timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE FUNCTION ai_chain_anchor_rules() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'the AI audit chain head is kept as written (%)', TG_OP;
  END IF;
  IF EXISTS (SELECT 1 FROM ai_chain_anchor WHERE seq >= NEW.seq) THEN
    RAISE EXCEPTION 'an AI audit chain head only moves forward' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ai_chain_anchor_kept BEFORE INSERT OR UPDATE OR DELETE ON ai_chain_anchor FOR EACH ROW EXECUTE FUNCTION ai_chain_anchor_rules();
