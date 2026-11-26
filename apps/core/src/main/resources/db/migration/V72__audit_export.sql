-- The export of one case's audit entries (board 20: "a court or an inquiry can be given an export for any case"). Taking
-- one is itself an audit entry: who, when, which case, and why (which court or inquiry asked). Kept as written. No foreign
-- key to the FIR: an import undo may remove an FIR that was exported, and the record must stay (as protected_read, V37).
CREATE TABLE audit_export (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  exported_by uuid NOT NULL REFERENCES app_user(id),
  station_id  uuid NOT NULL REFERENCES police_station(id),
  fir_id      uuid NOT NULL,
  fir_ref     text NOT NULL CHECK (char_length(btrim(fir_ref)) > 0),
  reason      text NOT NULL CHECK (char_length(btrim(reason)) >= 10 AND char_length(reason) <= 500)
);
CREATE INDEX audit_export_station ON audit_export (station_id, at DESC);
CREATE TRIGGER audit_export_kept BEFORE UPDATE OR DELETE ON audit_export FOR EACH ROW EXECUTE FUNCTION forbid_change_kept();
