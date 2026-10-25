-- The state admin changes an account's role, rank or police station (26 Oct 2026).
-- Each change needs a written reason; the admin log keeps what it was and what it became (detail).

ALTER TABLE admin_action ADD COLUMN detail text;
ALTER TABLE admin_action DROP CONSTRAINT admin_action_action_check;
ALTER TABLE admin_action ADD CONSTRAINT admin_action_action_check
  CHECK (action IN ('user_created','user_disabled','user_enabled','user_unlocked','user_changed','station_created'));
ALTER TABLE admin_action ADD CONSTRAINT admin_action_change_explained
  CHECK (action <> 'user_changed' OR (char_length(btrim(reason)) >= 10 AND detail IS NOT NULL));
