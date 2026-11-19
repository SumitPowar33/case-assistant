-- A2, the rest: a section the officer adds by hand, outside the playbooks (session 116). The AI request is optional now:
-- a section from the AI's suggestion keeps its request; a section chosen by the officer alone keeps none. Who added it,
-- when and why (10 to 2000 characters) stay required for every section added after registration; the registration's
-- and the import's sections keep all four empty, as before. The law check (V51) and the state-law check (V57) still apply.
ALTER TABLE fir_section DROP CONSTRAINT fir_section_added_whole;
ALTER TABLE fir_section ADD CONSTRAINT fir_section_added_whole CHECK (
    (added_at IS NULL AND reason IS NULL AND ai_request_id IS NULL)
    OR (added_at IS NOT NULL AND reason IS NOT NULL AND chosen_by IS NOT NULL));
