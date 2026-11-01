-- Audit of reads of protected victim details (ARCHITECTURE-TENANCY section 5, item 4; 2 Nov 2026).
-- Writes and AI calls were logged, reads were not. Every answer that shows a protected victim's name, phone or address
-- (BNS 72, POCSO 23), or the complaint text that names them, to the case team or the station's supervisors adds one row
-- here before it is sent. The rows are kept as written; nobody edits or removes them, not even an import undo.
-- No foreign key to the FIR or complaint: an import undo may remove an FIR that was read, and its reads must stay.
-- fir_ref keeps the FIR number as it was when it was read.

CREATE TABLE protected_read (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  at           timestamptz NOT NULL DEFAULT now(),
  reader       uuid NOT NULL REFERENCES app_user(id),
  station_id   uuid NOT NULL REFERENCES police_station(id),
  fir_id       uuid,
  fir_ref      text,
  complaint_id uuid,
  what         text NOT NULL CHECK (what IN ('people', 'fir_text', 'complaint', 'complaint_list')),
  CHECK (fir_id IS NOT NULL OR complaint_id IS NOT NULL),
  CHECK (what IN ('complaint', 'complaint_list') = (complaint_id IS NOT NULL))
);
CREATE INDEX protected_read_station ON protected_read (station_id, at DESC);
-- the same opening of a screen is logged once (ProtectedReads.SAME_OPENING): the reader's last reads are looked up
CREATE INDEX protected_read_reader ON protected_read (reader, at DESC);

CREATE FUNCTION forbid_protected_read_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Reads of protected details are kept as written (%)', TG_OP;
END $$;
CREATE TRIGGER protected_read_kept BEFORE UPDATE OR DELETE ON protected_read
FOR EACH ROW EXECUTE FUNCTION forbid_protected_read_change();
