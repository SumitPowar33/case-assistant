-- Call detail records (CDR) of a case (CdrController). The operator's file is first an electronic item of the evidence
-- register (with its SHA-256); loading it here checks the file against that hash and keeps each record line by line, as
-- written. One load per evidence item. Reads of the records are logged (cdr_read): they hold the numbers of people who are
-- not part of the case. Nothing here can be changed or removed.
CREATE TABLE cdr_file (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fir_id           uuid NOT NULL REFERENCES fir(id),
  evidence_item_id uuid NOT NULL UNIQUE,
  target           text NOT NULL CHECK (target ~ '^[0-9]{10}$'),   -- whose records: the last ten digits
  filename         text NOT NULL CHECK (length(btrim(filename)) BETWEEN 1 AND 200),
  lines            int NOT NULL CHECK (lines > 0),
  skipped          int NOT NULL CHECK (skipped >= 0),
  loaded_by        uuid NOT NULL REFERENCES app_user(id),
  loaded_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (evidence_item_id, fir_id) REFERENCES evidence_item(id, fir_id)
);

CREATE TABLE cdr_call (
  file_id     uuid NOT NULL REFERENCES cdr_file(id),
  line        int NOT NULL CHECK (line > 0),                       -- the line of the file it was read from
  other       text NOT NULL CHECK (length(other) BETWEEN 1 AND 40),
  at          timestamptz NOT NULL,
  duration_s  int NOT NULL CHECK (duration_s >= 0),
  direction   text NOT NULL CHECK (direction IN ('in', 'out')),
  kind        text NOT NULL CHECK (kind IN ('call', 'sms')),
  cell        text CHECK (length(cell) <= 60),
  imei        text CHECK (length(imei) <= 20),
  PRIMARY KEY (file_id, line)
);
CREATE INDEX cdr_call_other ON cdr_call (other);

CREATE TABLE cdr_read (
  id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  reader  uuid NOT NULL REFERENCES app_user(id),
  fir_id  uuid NOT NULL REFERENCES fir(id),
  files   int NOT NULL CHECK (files >= 0)
);
CREATE INDEX cdr_read_fir ON cdr_read (fir_id, at DESC);

CREATE FUNCTION forbid_cdr_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Call records and their reads are kept as written (%)', TG_OP;
END $$;
CREATE TRIGGER cdr_file_kept BEFORE UPDATE OR DELETE ON cdr_file FOR EACH ROW EXECUTE FUNCTION forbid_cdr_change();
CREATE TRIGGER cdr_call_kept BEFORE UPDATE OR DELETE ON cdr_call FOR EACH ROW EXECUTE FUNCTION forbid_cdr_change();
CREATE TRIGGER cdr_read_kept BEFORE UPDATE OR DELETE ON cdr_read FOR EACH ROW EXECUTE FUNCTION forbid_cdr_change();
