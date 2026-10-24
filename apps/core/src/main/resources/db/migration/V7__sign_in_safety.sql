-- Sign-in safety (25 Oct 2026).
-- Every sign-in attempt is recorded (never the password). After 5 wrong passwords for a username within
-- 15 minutes, that username is locked for 15 minutes; the same applies to usernames that do not exist, so
-- the lock does not reveal which accounts exist. Attempts made while locked are recorded but do not extend
-- the lock, so nobody can keep an officer locked out for ever by guessing.
-- Changing the password ends every token issued before the change.

CREATE TABLE sign_in_attempt (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username_tried text NOT NULL,
  user_id        uuid REFERENCES app_user(id),             -- null when no such user
  outcome        text NOT NULL CHECK (outcome IN ('ok','wrong_password','locked','password_changed','wrong_current_password')),
  client_ip      text,
  at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sign_in_attempt_recent ON sign_in_attempt (username_tried, at DESC);

CREATE FUNCTION forbid_sign_in_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'the sign-in log is kept as written (%)', TG_OP;
END $$;

CREATE TRIGGER sign_in_attempt_kept BEFORE UPDATE OR DELETE ON sign_in_attempt
FOR EACH ROW EXECUTE FUNCTION forbid_sign_in_change();

ALTER TABLE app_user ADD COLUMN password_changed_at timestamptz;
