-- A4 (left-for part): the text of a bank's or telecom's reply is kept with the reply the officer logs, so the reply can be
-- read again, is searchable in "Ask the case file", and joins the case file. Optional: a reply by post or by hand may be
-- logged with ticks only. The row stays kept as written (trigger notice_reply_kept, V34).
ALTER TABLE notice_reply ADD COLUMN reply_text text CHECK (reply_text IS NULL OR length(reply_text) BETWEEN 1 AND 30000);
