-- A notice's reply cannot be due before the day it was issued (India calendar day) (25 Oct 2026).
ALTER TABLE notice ADD CONSTRAINT reply_due_after_issue
  CHECK (reply_due_on IS NULL OR issued_at IS NULL OR reply_due_on >= (issued_at AT TIME ZONE 'Asia/Kolkata')::date);
