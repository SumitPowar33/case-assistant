-- State laws (item 3, the Maharashtra module). A state module may name laws of its own state in its module.json ("acts",
-- for example the Maharashtra Protection of Interest of Depositors (in Financial Establishments) Act 1999 as "MPID Act").
-- The application writes them here at start-up (Modules). A section of a state law may be added only to an FIR of a
-- police station of that state; the national acts of V1 hold everywhere, as before. Rows are kept as written: a law
-- once named stays, so the sections already recorded under it stay valid.
CREATE TABLE state_act (
  act        text PRIMARY KEY CHECK (act ~ '^[A-Z][A-Za-z/-]*( [A-Za-z/-]+)* Act$' AND length(act) <= 40
                                     AND act NOT IN ('BNS','IPC','IT Act','NDPS Act','POCSO Act','Arms Act','SC/ST Act','Other')),
  state_code text NOT NULL REFERENCES state_pack(code),
  added_at   timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION state_act_kept() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'a state law once named is kept as written (%)', TG_OP;
END $$;
CREATE TRIGGER state_act_kept BEFORE UPDATE OR DELETE ON state_act FOR EACH ROW EXECUTE FUNCTION state_act_kept();

-- the act of a section: a national act, or a law of the state of the FIR's police station
ALTER TABLE fir_section DROP CONSTRAINT fir_section_act_check;

CREATE FUNCTION fir_section_act_of_state() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.act IN ('BNS','IPC','IT Act','NDPS Act','POCSO Act','Arms Act','SC/ST Act','Other') THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM state_act a JOIN police_station s ON s.state_code = a.state_code
                 JOIN fir f ON f.station_id = s.id WHERE f.id = NEW.fir_id AND a.act = NEW.act) THEN
    RAISE EXCEPTION 'the act % is not a law of the state of this FIR', NEW.act USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER fir_section_act_of_state BEFORE INSERT ON fir_section FOR EACH ROW EXECUTE FUNCTION fir_section_act_of_state();
