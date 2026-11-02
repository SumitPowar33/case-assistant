-- Security review follow-up (2 Nov 2026).
-- Signing out ends the token on the server, not only in the browser: every token carries an id (jti), and a token whose
-- id is listed here is refused at once by the core app and within 30 seconds by the AI gateway (its sign-in check).
-- Kept as written: it is also the record of who signed out when.
CREATE TABLE signed_out_token (
  jti         uuid PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES app_user(id),
  expires_at  timestamptz NOT NULL,             -- when the token would have ended anyway
  signed_out_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER signed_out_token_kept BEFORE UPDATE OR DELETE ON signed_out_token
FOR EACH ROW EXECUTE FUNCTION forbid_sign_in_change();

-- Wrong passwords are also counted per client address across usernames (one machine trying one password on many
-- accounts); this index answers that count.
CREATE INDEX sign_in_attempt_by_address ON sign_in_attempt (client_ip, at DESC);
