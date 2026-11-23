-- Station duty roster (item 16, plan section 5): who is on which shift and post, and who is off or on leave. An entry is
-- kept as written; taking it back is a second row with a reason (the same way as an acting charge, V53). An officer is
-- on one post in one shift of a day; an officer who is off or on leave that day has no duty that day.
CREATE TABLE duty_assignment (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id  uuid NOT NULL REFERENCES police_station(id),
  officer_id  uuid NOT NULL REFERENCES app_user(id),
  on_date     date NOT NULL,
  kind        text NOT NULL CHECK (kind IN ('duty', 'weekly_off', 'leave')),
  shift       text CHECK (shift IN ('morning', 'evening', 'night')),
  post        text CHECK (post IN ('station_house', 'front_desk', 'beat', 'patrol', 'court', 'lock_up', 'bandobast')),
  note        text CHECK (note IS NULL OR char_length(note) <= 300),
  recorded_by uuid NOT NULL REFERENCES app_user(id),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((kind = 'duty' AND shift IS NOT NULL AND post IS NOT NULL) OR (kind <> 'duty' AND shift IS NULL AND post IS NULL))
);
CREATE INDEX duty_assignment_station_day ON duty_assignment (station_id, on_date);
CREATE INDEX duty_assignment_officer_day ON duty_assignment (officer_id, on_date);

CREATE TABLE duty_assignment_cancel (
  assignment_id uuid PRIMARY KEY REFERENCES duty_assignment(id),
  reason        text NOT NULL CHECK (char_length(btrim(reason)) >= 10),
  cancelled_by  uuid NOT NULL REFERENCES app_user(id),
  cancelled_at  timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- The officer must be an active officer posted at the station of the entry.
CREATE FUNCTION duty_at_own_station() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_user WHERE id = NEW.officer_id AND active AND station_id = NEW.station_id) THEN
    RAISE EXCEPTION 'A duty entry is for an active officer posted at that station';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER duty_at_own_station BEFORE INSERT ON duty_assignment FOR EACH ROW EXECUTE FUNCTION duty_at_own_station();
CREATE TRIGGER duty_assignment_kept BEFORE UPDATE OR DELETE ON duty_assignment FOR EACH ROW EXECUTE FUNCTION forbid_change_kept();
CREATE TRIGGER duty_assignment_cancel_kept BEFORE UPDATE OR DELETE ON duty_assignment_cancel FOR EACH ROW EXECUTE FUNCTION forbid_change_kept();
