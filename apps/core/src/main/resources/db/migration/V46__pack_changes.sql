-- State setup and approvals (design board 21, session 75): a change to a state's pack (a playbook, a form, a deadline
-- rule) is first written down as a proposal, then approved or sent back by another person who holds the approval
-- permission in the same state. Both rows are kept as written. An approval is a record of the decision: the pack files
-- themselves change only with a release (docs/ARCHITECTURE-TENANCY.md). Nobody decides their own proposal.
CREATE TABLE pack_change (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state_code  text NOT NULL REFERENCES state_pack(code),
  title       text NOT NULL CHECK (length(btrim(title)) BETWEEN 5 AND 120),
  body        text NOT NULL CHECK (length(btrim(body)) BETWEEN 20 AND 2000),
  tested_note text CHECK (tested_note IS NULL OR length(btrim(tested_note)) BETWEEN 5 AND 500),
  drafted_by  uuid NOT NULL REFERENCES app_user(id),
  drafted_at  timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX pack_change_state ON pack_change (state_code, drafted_at DESC);

CREATE TABLE pack_change_decision (
  change_id  uuid PRIMARY KEY REFERENCES pack_change(id),   -- one decision per proposal; a new proposal answers a returned one
  decision   text NOT NULL CHECK (decision IN ('approved', 'returned')),
  note       text CHECK (note IS NULL OR length(btrim(note)) <= 1000),
  decided_by uuid NOT NULL REFERENCES app_user(id),
  decided_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (decision = 'approved' OR length(btrim(coalesce(note, ''))) >= 10)
);

CREATE FUNCTION pack_change_not_own() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.decided_by = (SELECT drafted_by FROM pack_change WHERE id = NEW.change_id) THEN
    RAISE EXCEPTION 'Nobody decides their own pack change';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER pack_change_not_own BEFORE INSERT ON pack_change_decision FOR EACH ROW EXECUTE FUNCTION pack_change_not_own();
CREATE TRIGGER pack_change_kept BEFORE UPDATE OR DELETE ON pack_change FOR EACH ROW EXECUTE FUNCTION forbid_change_kept();
CREATE TRIGGER pack_change_decision_kept BEFORE UPDATE OR DELETE ON pack_change_decision FOR EACH ROW EXECUTE FUNCTION forbid_change_kept();
