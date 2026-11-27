-- Duty swaps (item 16, plan section 5: "swaps with the SHO's approval"): an officer asks to exchange one of their own
-- duties for a colleague's, and the officer in charge approves or refuses. The request and the decision are kept as
-- written. On approval the core takes the two entries back and writes two new ones in the same transaction (V66).
CREATE TABLE duty_swap (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  give_id  uuid NOT NULL REFERENCES duty_assignment(id),
  take_id  uuid NOT NULL REFERENCES duty_assignment(id),
  reason   text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 10 AND 500),
  asked_by uuid NOT NULL REFERENCES app_user(id),
  asked_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX duty_swap_give ON duty_swap (give_id);
CREATE INDEX duty_swap_take ON duty_swap (take_id);

CREATE TABLE duty_swap_decision (
  swap_id    uuid PRIMARY KEY REFERENCES duty_swap(id),
  approved   boolean NOT NULL,
  note       text CHECK (note IS NULL OR char_length(note) <= 500),
  decided_by uuid NOT NULL REFERENCES app_user(id),
  decided_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (approved OR coalesce(char_length(btrim(note)) >= 10, false))
);

-- A duty can still be swapped while it stands on the roster and its day (India time) has not passed.
CREATE FUNCTION duty_swappable(entry uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM duty_assignment a WHERE a.id = entry AND a.kind = 'duty' AND a.on_date >= ist_date(now())
                 AND NOT EXISTS (SELECT 1 FROM duty_assignment_cancel c WHERE c.assignment_id = a.id))
$$;

-- The two entries are duties that can still be swapped, of two officers of one station, the first the asker's own; and
-- neither is in a request that waits for its decision (a request one of whose duties has passed or gone waits no more).
CREATE FUNCTION duty_swap_of_two_duties() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- both entries locked, in one order, so that two requests naming one of them cannot both pass
  PERFORM 1 FROM duty_assignment WHERE id IN (NEW.give_id, NEW.take_id) ORDER BY id FOR UPDATE;
  IF NOT EXISTS (SELECT 1 FROM duty_assignment g JOIN duty_assignment t ON t.id = NEW.take_id
                 WHERE g.id = NEW.give_id AND g.officer_id = NEW.asked_by AND t.officer_id <> g.officer_id AND t.station_id = g.station_id) THEN
    RAISE EXCEPTION 'A swap exchanges the asker''s own duty for a duty of another officer of the same station';
  END IF;
  IF NOT (duty_swappable(NEW.give_id) AND duty_swappable(NEW.take_id)) THEN
    RAISE EXCEPTION 'Only duties that stand on the roster and have not passed can be swapped';
  END IF;
  IF EXISTS (SELECT 1 FROM duty_swap s
             WHERE ARRAY[s.give_id, s.take_id] && ARRAY[NEW.give_id, NEW.take_id]
               AND duty_swappable(s.give_id) AND duty_swappable(s.take_id)
               AND NOT EXISTS (SELECT 1 FROM duty_swap_decision d WHERE d.swap_id = s.id)) THEN
    RAISE EXCEPTION 'One of the duties is already in a swap request that waits for a decision';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER duty_swap_of_two_duties BEFORE INSERT ON duty_swap FOR EACH ROW EXECUTE FUNCTION duty_swap_of_two_duties();

-- An approval needs both duties still to be there; a refusal may be written at any time.
CREATE FUNCTION duty_swap_still_possible() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.approved AND NOT EXISTS (SELECT 1 FROM duty_swap s WHERE s.id = NEW.swap_id AND duty_swappable(s.give_id) AND duty_swappable(s.take_id)) THEN
    RAISE EXCEPTION 'A swap is not approved once one of its duties has passed or been taken back';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER duty_swap_still_possible BEFORE INSERT ON duty_swap_decision FOR EACH ROW EXECUTE FUNCTION duty_swap_still_possible();

CREATE TRIGGER duty_swap_kept BEFORE UPDATE OR DELETE ON duty_swap FOR EACH ROW EXECUTE FUNCTION forbid_change_kept();
CREATE TRIGGER duty_swap_decision_kept BEFORE UPDATE OR DELETE ON duty_swap_decision FOR EACH ROW EXECUTE FUNCTION forbid_change_kept();
