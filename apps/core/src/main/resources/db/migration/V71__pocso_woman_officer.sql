-- POCSO left-overs (item 15, plan section 6).
-- 1. An officer's gender is an optional field, set only by an admin (it is not on the sign-in token and no officer sees
--    another's). Its only use is the check that a woman officer took the child's statement under POCSO 24.
-- 2. A POCSO step may name the officer who took the child's statement (POCSO 24 step only) and the one recorded statement
--    of the child it relies on (the statement steps only): the child is not asked to repeat the account, so a second
--    statement form is not offered; the step points at the first.
ALTER TABLE app_user ADD COLUMN gender text CHECK (gender IN ('female', 'male', 'other'));
ALTER TABLE pocso_step ADD COLUMN taken_by uuid REFERENCES app_user(id);
ALTER TABLE pocso_step ADD COLUMN statement_id uuid REFERENCES witness_statement(id);

CREATE OR REPLACE FUNCTION pocso_step_rules() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'a step of a POCSO case is kept as written (%)', TG_OP;
  END IF;
  IF NOT pocso_case(NEW.fir_id) THEN
    RAISE EXCEPTION 'the FIR is not a POCSO case' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.step <> 'medical_examination' AND NEW.done_at < (SELECT information_received_at FROM fir WHERE id = NEW.fir_id) THEN
    RAISE EXCEPTION 'a step cannot be before the information was received' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.taken_by IS NOT NULL AND NEW.step <> 'statement_chosen_place' THEN
    RAISE EXCEPTION 'only the statement at the child''s place names who took it' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.statement_id IS NOT NULL AND NEW.step NOT IN ('statement_chosen_place', 'magistrate_statement') THEN
    RAISE EXCEPTION 'only a statement step names the recorded statement' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.statement_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM witness_statement w JOIN person p ON p.id = w.person_id
       WHERE w.id = NEW.statement_id AND w.fir_id = NEW.fir_id AND p.role = 'victim' AND p.age_years < 18) THEN
    RAISE EXCEPTION 'the statement must be one of a child victim of this FIR' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
