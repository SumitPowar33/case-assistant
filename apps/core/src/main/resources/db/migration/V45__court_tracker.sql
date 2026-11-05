-- Court and trial tracker (design board 12, session 71): the dates of a case in court (chargesheet filed, cognizance,
-- charge, evidence, judgment, any other hearing; past or coming) and the summons to each witness. Both are kept as
-- written (a mistake is answered by a new row with a note, never by a change). The next date is the earliest coming one.
-- Nothing here judges a witness, an accused or the case.
CREATE TABLE court_event (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fir_id      uuid NOT NULL REFERENCES fir(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('chargesheet_filed', 'cognizance', 'copies_given', 'charge_framing', 'prosecution_evidence',
                                            'arguments', 'judgment', 'other')),
  on_date     date NOT NULL,
  court       text CHECK (court IS NULL OR length(btrim(court)) BETWEEN 2 AND 160),
  case_no     text CHECK (case_no IS NULL OR length(btrim(case_no)) BETWEEN 1 AND 60),
  note        text CHECK (note IS NULL OR length(note) <= 500),
  recorded_by uuid NOT NULL REFERENCES app_user(id),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX court_event_case ON court_event (fir_id, on_date);

CREATE TABLE court_summons (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fir_id      uuid NOT NULL REFERENCES fir(id) ON DELETE CASCADE,
  witness     text NOT NULL CHECK (length(btrim(witness)) BETWEEN 2 AND 160),
  role        text CHECK (role IS NULL OR length(btrim(role)) BETWEEN 2 AND 100),
  status      text NOT NULL CHECK (status IN ('sent', 'served', 'not_served', 'appeared', 'excused')),
  on_date     date NOT NULL,
  note        text CHECK (note IS NULL OR length(note) <= 500),
  recorded_by uuid NOT NULL REFERENCES app_user(id),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX court_summons_case ON court_summons (fir_id, lower(btrim(witness)), recorded_at);

CREATE TRIGGER court_event_kept BEFORE UPDATE OR DELETE ON court_event FOR EACH ROW EXECUTE FUNCTION forbid_change_kept();
CREATE TRIGGER court_summons_kept BEFORE UPDATE OR DELETE ON court_summons FOR EACH ROW EXECUTE FUNCTION forbid_change_kept();
