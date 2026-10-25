-- State admin screens (25 Oct 2026).
-- Every change the state admin makes to accounts and stations is recorded here, with who did it and, for
-- disabling, enabling and unlocking an account, a written reason. Rows are kept as written.
-- Disabling an account also moves app_user.password_changed_at, so tokens issued before the account was
-- disabled never come back to life if it is enabled again; the officer simply signs in again.

CREATE TABLE admin_action (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    uuid NOT NULL REFERENCES app_user(id),
  action      text NOT NULL CHECK (action IN ('user_created','user_disabled','user_enabled','user_unlocked','station_created')),
  user_id     uuid REFERENCES app_user(id),
  station_id  uuid REFERENCES police_station(id),
  reason      text,
  at          timestamptz NOT NULL DEFAULT now(),
  CHECK ((action = 'station_created') = (station_id IS NOT NULL AND user_id IS NULL)),
  CHECK (action = 'station_created' OR user_id IS NOT NULL),
  CHECK (action NOT IN ('user_disabled','user_enabled','user_unlocked') OR char_length(btrim(reason)) >= 10)
);
CREATE INDEX admin_action_recent ON admin_action (at DESC);

CREATE FUNCTION forbid_admin_action_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'the admin log is kept as written (%)', TG_OP;
END $$;

CREATE TRIGGER admin_action_kept BEFORE UPDATE OR DELETE ON admin_action
FOR EACH ROW EXECUTE FUNCTION forbid_admin_action_change();

-- An unlock by the state admin ends a lock the same way a successful sign-in does.
ALTER TABLE sign_in_attempt DROP CONSTRAINT sign_in_attempt_outcome_check;
ALTER TABLE sign_in_attempt ADD CONSTRAINT sign_in_attempt_outcome_check
  CHECK (outcome IN ('ok','wrong_password','locked','password_changed','wrong_current_password','unlocked_by_admin'));
