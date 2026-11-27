-- A 112 event sent to an officer on beat or patrol duty (item 16): the duty officer picks one who is on duty now, and the
-- app keeps who sent which event to whom, on which roster entry and when. Nothing leaves the app (no SMS, no radio): the
-- officer reads it on the 112 screen and the dashboard. An event may go to several officers, to each once. Kept as written.
CREATE TABLE call112_sent (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      uuid NOT NULL REFERENCES call112_event(id),
  assignment_id uuid NOT NULL REFERENCES duty_assignment(id),
  officer_id    uuid NOT NULL REFERENCES app_user(id),
  sent_by       uuid NOT NULL REFERENCES app_user(id),
  sent_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (event_id, officer_id)
);

-- Only after the acknowledgement, and only on a beat or patrol duty of that officer at the event's station that has not
-- been taken back. Which shift is running now is checked by the app.
CREATE FUNCTION call112_sent_on_duty() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM call112_ack WHERE event_id = NEW.event_id) THEN
    RAISE EXCEPTION 'A 112 event is sent to an officer only after it was acknowledged';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM duty_assignment a JOIN call112_event e ON e.station_id = a.station_id
                 WHERE e.id = NEW.event_id AND a.id = NEW.assignment_id AND a.officer_id = NEW.officer_id
                   AND a.post IN ('beat', 'patrol')
                   AND NOT EXISTS (SELECT 1 FROM duty_assignment_cancel c WHERE c.assignment_id = a.id)) THEN
    RAISE EXCEPTION 'A 112 event is sent to an officer on a beat or patrol duty of its police station';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER call112_sent_on_duty BEFORE INSERT ON call112_sent FOR EACH ROW EXECUTE FUNCTION call112_sent_on_duty();
CREATE TRIGGER call112_sent_kept BEFORE UPDATE OR DELETE ON call112_sent FOR EACH ROW EXECUTE FUNCTION forbid_change_kept();
