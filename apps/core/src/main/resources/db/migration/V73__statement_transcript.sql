-- Which statements were written down from a recording (AI features A3 and priority 5). When the officer saves a
-- statement from the speech model's draft, the gateway's request id is kept with it, so the file shows it was first
-- written by the model and then checked by the officer, and the gateway's log of that request (the recording's hash and
-- sizes, and whether the draft was changed) can be found. The recording and the draft are not kept. A statement taken
-- in writing has no recording. Statements saved before this column carry nothing: the app cannot know. The column is
-- kept as written with the rest of the statement (V40).
ALTER TABLE witness_statement ADD COLUMN transcript_request uuid;
ALTER TABLE witness_statement ADD CONSTRAINT witness_statement_transcript_medium CHECK (transcript_request IS NULL OR medium <> 'written');
