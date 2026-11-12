-- AI drafting of the final report's narrative (AI feature A6, design board 10, session 91).
-- The officer may take sentences the AI gateway drafted (feature chargesheet_draft) from the case file into the facts in
-- brief and the evidence; each sentence carries a mark of its source, and the officer reads and rewrites the words before
-- saving. A save that takes such sentences names the gateway's request, so the report's steps show which save used an
-- AI draft and the gateway's own log holds the request and the officer's decision. Only a save names one.
ALTER TABLE final_report_event ADD COLUMN ai_request uuid,
  ADD CONSTRAINT final_report_event_ai_saved CHECK (ai_request IS NULL OR action = 'saved');
