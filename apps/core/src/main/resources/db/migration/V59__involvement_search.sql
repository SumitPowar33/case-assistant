-- Earlier records (previous involvement): the case team of an FIR checks whether one of its accused or suspects is an accused
-- or suspect in another FIR of the same state, by the same phone number, the same name and parentage, or an account the
-- money trail links to them (InvolvementController). Each check is kept as written, with how many records it found, and is
-- read on the station's audit screen. Nothing else is stored: the matches are read fresh from the cases each time.
CREATE TABLE involvement_search (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  searcher   uuid NOT NULL REFERENCES app_user(id),
  fir_id     uuid NOT NULL REFERENCES fir(id),
  person_id  uuid NOT NULL REFERENCES person(id),
  matches    int NOT NULL CHECK (matches >= 0)
);
CREATE INDEX involvement_search_fir ON involvement_search (fir_id, at DESC);

CREATE FUNCTION forbid_involvement_search_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Checks of earlier records are kept as written (%)', TG_OP;
END $$;
CREATE TRIGGER involvement_search_kept BEFORE UPDATE OR DELETE ON involvement_search
FOR EACH ROW EXECUTE FUNCTION forbid_involvement_search_change();
