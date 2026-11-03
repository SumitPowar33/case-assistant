-- Draft and sign the final report (chargesheet, BNSS 193) (design board 10, session 66).
-- The officer writes (or later has the AI gateway draft) the narrative parts: the facts in brief and the evidence for
-- each charge. The draft is submitted, the SHO or SP approves it or returns it with a reason, and the officer who
-- submitted it signs it. Nobody approves their own submission. A signed draft is kept as written. Every step is in
-- an append-only event list. Filing with the court is still recorded in `chargesheet` (V14), not here.

CREATE TABLE final_report_draft (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fir_id        uuid NOT NULL UNIQUE REFERENCES fir(id),
  language      text NOT NULL CHECK (language ~ '^[a-z]{2,3}$'),
  facts_text    text NOT NULL DEFAULT '' CHECK (length(facts_text) <= 40000),
  evidence_text text NOT NULL DEFAULT '' CHECK (length(evidence_text) <= 40000),
  status        text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'returned', 'approved', 'signed')),
  created_by    uuid NOT NULL REFERENCES app_user(id),
  updated_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
  submitted_by  uuid REFERENCES app_user(id),
  decided_by    uuid REFERENCES app_user(id),
  signed_by     uuid REFERENCES app_user(id)
);

CREATE TABLE final_report_event (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id   uuid NOT NULL REFERENCES final_report_draft(id),
  at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  by_user    uuid NOT NULL REFERENCES app_user(id),
  action     text NOT NULL CHECK (action IN ('saved', 'submitted', 'approved', 'returned', 'signed')),
  note       text CHECK (note IS NULL OR length(btrim(note)) BETWEEN 10 AND 2000),
  CHECK (action <> 'returned' OR note IS NOT NULL)
);
CREATE INDEX final_report_event_draft ON final_report_event (draft_id, at);

CREATE FUNCTION final_report_draft_check() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'a final report draft is never deleted';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' THEN RAISE EXCEPTION 'a final report draft starts as a draft'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.fir_id <> OLD.fir_id OR NEW.created_by <> OLD.created_by THEN
    RAISE EXCEPTION 'the case and the author of a final report draft do not change';
  END IF;
  IF OLD.status = 'signed' THEN
    RAISE EXCEPTION 'a signed final report is kept as written';
  END IF;
  IF (NEW.facts_text, NEW.evidence_text, NEW.language) IS DISTINCT FROM (OLD.facts_text, OLD.evidence_text, OLD.language)
     AND OLD.status NOT IN ('draft', 'returned') THEN
    RAISE EXCEPTION 'the words of a final report change only while it is a draft or returned (now %)', OLD.status;
  END IF;
  IF NEW.status <> OLD.status AND NOT ((OLD.status, NEW.status) IN
       (('draft', 'submitted'), ('returned', 'submitted'), ('submitted', 'approved'), ('submitted', 'returned'), ('approved', 'signed'))) THEN
    RAISE EXCEPTION 'a final report cannot go from % to %', OLD.status, NEW.status;
  END IF;
  IF NEW.status = 'submitted' AND NEW.status <> OLD.status AND (NEW.submitted_by IS NULL OR length(btrim(NEW.facts_text)) < 20 OR length(btrim(NEW.evidence_text)) < 20) THEN
    RAISE EXCEPTION 'a final report is submitted by a named officer with both the facts and the evidence written';
  END IF;
  IF NEW.status IN ('approved', 'returned') AND NEW.status <> OLD.status AND (NEW.decided_by IS NULL OR NEW.decided_by = NEW.submitted_by) THEN
    RAISE EXCEPTION 'a final report is decided by someone other than the officer who submitted it';
  END IF;
  IF NEW.status = 'signed' AND NEW.signed_by IS DISTINCT FROM NEW.submitted_by THEN
    RAISE EXCEPTION 'the officer who submitted the final report signs it';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER final_report_draft_checked BEFORE INSERT OR UPDATE OR DELETE ON final_report_draft FOR EACH ROW EXECUTE FUNCTION final_report_draft_check();

CREATE FUNCTION final_report_event_kept() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'the steps of a final report are kept as written (%)', TG_OP;
END $$;
CREATE TRIGGER final_report_event_kept BEFORE UPDATE OR DELETE ON final_report_event FOR EACH ROW EXECUTE FUNCTION final_report_event_kept();
