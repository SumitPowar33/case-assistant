-- Incoming 112 events (item 15, plan section 6): a call the station learns of, written by hand until the state's ERSS
-- interface exists (the feed will insert rows into call112_event with a source of its own, in a later migration; its
-- format is not invented here). Everything is kept as written: the duty officer acknowledges an event once, and one click
-- opens it once as a complaint at the front desk or as a general diary entry of the station.
CREATE TABLE general_diary_entry (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id  uuid NOT NULL REFERENCES police_station(id),
  entry_no    integer NOT NULL CHECK (entry_no > 0),
  entry_text  text NOT NULL CHECK (char_length(btrim(entry_text)) > 0),
  recorded_by uuid NOT NULL REFERENCES app_user(id),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (station_id, entry_no)
);

CREATE TABLE call112_event (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id     uuid NOT NULL REFERENCES police_station(id),
  received_at    timestamptz NOT NULL,
  place          text NOT NULL CHECK (char_length(btrim(place)) > 0 AND char_length(place) <= 300),
  kind           text NOT NULL CHECK (kind IN ('crime_in_progress','violence','woman_in_distress','child_in_distress','accident','missing_person','fire_medical','dispute','other')),
  vehicle        text CHECK (vehicle IS NULL OR char_length(vehicle) <= 100),
  caller_name    text CHECK (caller_name IS NULL OR char_length(caller_name) <= 200),
  caller_contact text CHECK (caller_contact IS NULL OR char_length(caller_contact) <= 100),
  details        text NOT NULL CHECK (char_length(btrim(details)) > 0 AND char_length(details) <= 2000),
  entered_by     uuid NOT NULL REFERENCES app_user(id),
  entered_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (received_at <= entered_at)
);
CREATE INDEX call112_event_station_time ON call112_event (station_id, received_at DESC);

CREATE TABLE call112_ack (
  event_id     uuid PRIMARY KEY REFERENCES call112_event(id),
  acknowledged_by uuid NOT NULL REFERENCES app_user(id),
  acknowledged_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE call112_opened (
  event_id     uuid PRIMARY KEY REFERENCES call112_event(id),
  complaint_id uuid UNIQUE REFERENCES complaint(id),
  diary_id     uuid UNIQUE REFERENCES general_diary_entry(id),
  opened_by    uuid NOT NULL REFERENCES app_user(id),
  opened_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((complaint_id IS NULL) <> (diary_id IS NULL))
);

-- An event is opened only after the duty officer acknowledged it.
CREATE FUNCTION call112_opened_after_ack() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM call112_ack WHERE event_id = NEW.event_id) THEN
    RAISE EXCEPTION 'A 112 event is opened only after it was acknowledged';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER call112_opened_after_ack BEFORE INSERT ON call112_opened FOR EACH ROW EXECUTE FUNCTION call112_opened_after_ack();

CREATE TRIGGER general_diary_entry_kept BEFORE UPDATE OR DELETE ON general_diary_entry FOR EACH ROW EXECUTE FUNCTION forbid_change_kept();
CREATE TRIGGER call112_event_kept BEFORE UPDATE OR DELETE ON call112_event FOR EACH ROW EXECUTE FUNCTION forbid_change_kept();
CREATE TRIGGER call112_ack_kept BEFORE UPDATE OR DELETE ON call112_ack FOR EACH ROW EXECUTE FUNCTION forbid_change_kept();
CREATE TRIGGER call112_opened_kept BEFORE UPDATE OR DELETE ON call112_opened FOR EACH ROW EXECUTE FUNCTION forbid_change_kept();
