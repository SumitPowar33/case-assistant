-- Weekly review, 31 Oct 2026: three tables could be changed in the database without a trace.
-- A reply to a notice and the sections of an FIR are kept as written; they go only with their notice or FIR (the undo
-- of an import removes those, and only before any work was recorded on them). The playbook chosen for a case may be
-- changed, but every choice, who made it and when, is kept in case_playbook_choice.
CREATE FUNCTION kept_unless_parent_gone() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_gone boolean := false;
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- plpgsql does not promise to stop at the first false condition, so each parent is looked up on its own
    IF TG_ARGV[0] = 'notice' THEN
      parent_gone := NOT EXISTS (SELECT 1 FROM notice WHERE id = OLD.notice_id);
    ELSE
      parent_gone := NOT EXISTS (SELECT 1 FROM fir WHERE id = OLD.fir_id);
    END IF;
  END IF;
  IF parent_gone THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION '% is kept as written (%)', TG_TABLE_NAME, TG_OP;
END $$;
CREATE TRIGGER notice_reply_kept BEFORE UPDATE OR DELETE ON notice_reply FOR EACH ROW EXECUTE FUNCTION kept_unless_parent_gone('notice');
CREATE TRIGGER fir_section_kept BEFORE UPDATE OR DELETE ON fir_section FOR EACH ROW EXECUTE FUNCTION kept_unless_parent_gone('fir');
CREATE TRIGGER case_playbook_kept BEFORE DELETE ON case_playbook FOR EACH ROW EXECUTE FUNCTION kept_unless_parent_gone('fir');

CREATE TABLE case_playbook_choice (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fir_id           uuid NOT NULL REFERENCES fir(id) ON DELETE CASCADE,
  playbook_id      text NOT NULL,
  playbook_version text NOT NULL,
  chosen_by        uuid NOT NULL REFERENCES app_user(id),
  chosen_at        timestamptz NOT NULL
);
CREATE INDEX case_playbook_choice_fir ON case_playbook_choice (fir_id, chosen_at);
-- the choices before today are kept as they stand now (the earlier ones were overwritten and are lost)
INSERT INTO case_playbook_choice (fir_id, playbook_id, playbook_version, chosen_by, chosen_at)
SELECT fir_id, playbook_id, playbook_version, chosen_by, chosen_at FROM case_playbook;

CREATE FUNCTION case_playbook_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO case_playbook_choice (fir_id, playbook_id, playbook_version, chosen_by, chosen_at)
  VALUES (NEW.fir_id, NEW.playbook_id, NEW.playbook_version, NEW.chosen_by, NEW.chosen_at);
  RETURN NEW;
END $$;
CREATE TRIGGER case_playbook_history AFTER INSERT OR UPDATE ON case_playbook FOR EACH ROW EXECUTE FUNCTION case_playbook_history();
CREATE TRIGGER case_playbook_choice_kept BEFORE UPDATE OR DELETE ON case_playbook_choice FOR EACH ROW EXECUTE FUNCTION kept_unless_parent_gone('fir');
