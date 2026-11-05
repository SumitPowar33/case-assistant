-- Forensic and medical requests (design board 16, session 70): a request sent to a lab or a hospital, and the steps it
-- goes through until the report is back. Both tables are kept as written (a mistake is answered by a new step with a
-- note, never by a change); the status of a request is its newest step. Nothing here judges a report or a person.
CREATE TABLE expert_request (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fir_id           uuid NOT NULL REFERENCES fir(id) ON DELETE CASCADE,
  kind             text NOT NULL CHECK (kind IN ('forensic', 'medical')),
  subject          text NOT NULL CHECK (length(btrim(subject)) BETWEEN 2 AND 200),
  sent_to          text NOT NULL CHECK (length(btrim(sent_to)) BETWEEN 2 AND 160),
  sent_on          date NOT NULL,
  evidence_item_id uuid,
  recorded_by      uuid NOT NULL REFERENCES app_user(id),
  recorded_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (id, fir_id),
  FOREIGN KEY (evidence_item_id, fir_id) REFERENCES evidence_item(id, fir_id)
);
CREATE INDEX expert_request_case ON expert_request (fir_id, sent_on);

CREATE TABLE expert_request_step (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id  uuid NOT NULL,
  fir_id      uuid NOT NULL,
  status      text NOT NULL CHECK (status IN ('sent', 'at_lab', 'sample_sent', 'report_received', 'reminder_sent')),
  on_date     date NOT NULL,
  note        text CHECK (note IS NULL OR length(note) <= 500),
  recorded_by uuid NOT NULL REFERENCES app_user(id),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (request_id, fir_id) REFERENCES expert_request(id, fir_id) ON DELETE CASCADE
);
CREATE INDEX expert_request_step_newest ON expert_request_step (request_id, recorded_at);

CREATE TRIGGER expert_request_kept BEFORE UPDATE OR DELETE ON expert_request FOR EACH ROW EXECUTE FUNCTION forbid_change_kept();
CREATE TRIGGER expert_request_step_kept BEFORE UPDATE OR DELETE ON expert_request_step FOR EACH ROW EXECUTE FUNCTION forbid_change_kept();
