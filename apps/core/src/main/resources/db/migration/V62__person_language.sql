-- A7, the rest: the language a person reads and speaks, kept on the person's record (optional). The 90-day letter to the
-- victim or informant opens in it, so the officer does not pick it again for every case. Same eleven codes as the app.
ALTER TABLE person ADD COLUMN language text
  CHECK (language IN ('en','hi','mr','bn','pa','gu','or','ta','te','kn','ml'));
