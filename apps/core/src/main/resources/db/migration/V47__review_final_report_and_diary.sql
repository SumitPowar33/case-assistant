-- Weekly review of 7 Nov 2026 (session 76).
-- 1. Final report (V41): the officers who submitted, decided and signed are written only by their own step. Before, an
--    approved report's submitter could be changed to the approver, who could then sign it: the approver signing their
--    own decision, which V41 means to refuse. A new draft names nobody.
CREATE OR REPLACE FUNCTION final_report_draft_check() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'a final report draft is never deleted';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' THEN RAISE EXCEPTION 'a final report draft starts as a draft'; END IF;
    IF NEW.submitted_by IS NOT NULL OR NEW.decided_by IS NOT NULL OR NEW.signed_by IS NOT NULL THEN
      RAISE EXCEPTION 'a new final report draft names nobody as having submitted, decided or signed it';
    END IF;
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
  -- who submitted, decided and signed is written by that step only: otherwise the submitter could be renamed after an
  -- approval (to the approver, say), and the approver would then sign their own decision
  IF NEW.submitted_by IS DISTINCT FROM OLD.submitted_by AND NOT (NEW.status = 'submitted' AND OLD.status <> 'submitted') THEN
    RAISE EXCEPTION 'the officer who submitted a final report changes only when it is submitted again';
  END IF;
  IF NEW.decided_by IS DISTINCT FROM OLD.decided_by AND NOT (NEW.status <> OLD.status
       AND (NEW.status IN ('approved', 'returned') OR (NEW.status = 'submitted' AND NEW.decided_by IS NULL))) THEN
    RAISE EXCEPTION 'the officer who decided a final report changes only with a decision (or is cleared when it is submitted again)';
  END IF;
  IF NEW.signed_by IS DISTINCT FROM OLD.signed_by AND NEW.status <> 'signed' THEN
    RAISE EXCEPTION 'the signer of a final report is written only when it is signed';
  END IF;
  IF NEW.status = 'signed' AND NEW.signed_by IS DISTINCT FROM NEW.submitted_by THEN
    RAISE EXCEPTION 'the officer who submitted the final report signs it';
  END IF;
  RETURN NEW;
END $$;

-- 2. Case diary (V39): an entry written while the same day's page is being closed could land on the closed page (the
--    close takes a lock, the entry did not, and neither saw the other's uncommitted row). Both now take the same lock
--    per case (the key the close already uses), so the entry waits and then sees the closed page.
CREATE OR REPLACE FUNCTION case_diary_page_open() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('diary:' || NEW.fir_id::text));
  IF EXISTS (SELECT 1 FROM case_diary_page p WHERE p.fir_id = NEW.fir_id AND p.diary_date = NEW.diary_date) THEN
    RAISE EXCEPTION 'this page of the case diary is closed' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION case_diary_page_lock() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('diary:' || NEW.fir_id::text));
  RETURN NEW;
END $$;
CREATE TRIGGER case_diary_page_locked BEFORE INSERT ON case_diary_page FOR EACH ROW EXECUTE FUNCTION case_diary_page_lock();
