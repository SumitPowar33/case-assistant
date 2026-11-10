-- Acting charge (decision 2 of 2 Nov 2026, from BNSS 2(1)(r)): when the officer in charge of a station is absent, an
-- officer of that station holds the officer-in-charge role for a limited time. It is given by the SP of the district
-- or the state admin, with a reason and an end of at most 90 days; it ends by itself or when it is ended early; nobody
-- gives it to themselves. The row is kept as written; ending it is a second row. Both steps are also in admin_action.
CREATE TABLE acting_charge (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES app_user(id),
  station_id  uuid NOT NULL REFERENCES police_station(id),
  role        text NOT NULL REFERENCES role(code),
  reason      text NOT NULL CHECK (char_length(btrim(reason)) >= 10),
  starts_at   timestamptz NOT NULL DEFAULT clock_timestamp(),
  ends_at     timestamptz NOT NULL,
  granted_by  uuid NOT NULL REFERENCES app_user(id),
  CHECK (ends_at > starts_at AND ends_at <= starts_at + interval '90 days'),
  CHECK (granted_by <> user_id)
);
CREATE INDEX acting_charge_user ON acting_charge (user_id, ends_at DESC);
CREATE INDEX acting_charge_station ON acting_charge (station_id, ends_at DESC);

CREATE TABLE acting_charge_end (
  charge_id  uuid PRIMARY KEY REFERENCES acting_charge(id),
  reason     text NOT NULL CHECK (char_length(btrim(reason)) >= 10),
  ended_by   uuid NOT NULL REFERENCES app_user(id),
  ended_at   timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- The officer must be posted at the station of the charge when it is given.
CREATE FUNCTION acting_charge_at_own_station() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_user WHERE id = NEW.user_id AND active AND station_id = NEW.station_id) THEN
    RAISE EXCEPTION 'An acting charge goes to an active officer posted at that station';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER acting_charge_at_own_station BEFORE INSERT ON acting_charge FOR EACH ROW EXECUTE FUNCTION acting_charge_at_own_station();
CREATE TRIGGER acting_charge_kept BEFORE UPDATE OR DELETE ON acting_charge FOR EACH ROW EXECUTE FUNCTION forbid_change_kept();
CREATE TRIGGER acting_charge_end_kept BEFORE UPDATE OR DELETE ON acting_charge_end FOR EACH ROW EXECUTE FUNCTION forbid_change_kept();

ALTER TABLE admin_action DROP CONSTRAINT admin_action_action_check;
ALTER TABLE admin_action ADD CONSTRAINT admin_action_action_check
  CHECK (action IN ('user_created','user_disabled','user_enabled','user_unlocked','user_changed','station_created','acting_started','acting_ended'));
ALTER TABLE admin_action ADD CONSTRAINT admin_action_acting_explained
  CHECK (action NOT IN ('acting_started','acting_ended') OR (char_length(btrim(reason)) >= 10 AND detail IS NOT NULL AND station_id IS NOT NULL));
