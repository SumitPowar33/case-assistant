-- Assigning or changing the investigating officer of an FIR (26 Oct 2026).
-- An FIR registered at the front desk has no IO yet; the SHO (or the district SP) assigns one. A change of IO
-- (transfer, leave, workload) needs a written reason. Every assignment is kept as written.

CREATE TABLE fir_io_assignment (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fir_id       uuid NOT NULL REFERENCES fir(id) ON DELETE CASCADE,
  from_io      uuid REFERENCES app_user(id),
  to_io        uuid NOT NULL REFERENCES app_user(id),
  assigned_by  uuid NOT NULL REFERENCES app_user(id),
  reason       text,
  at           timestamptz NOT NULL DEFAULT now(),
  CHECK (from_io IS DISTINCT FROM to_io),
  CHECK (from_io IS NULL OR char_length(btrim(reason)) >= 10)
);
CREATE INDEX fir_io_assignment_fir ON fir_io_assignment (fir_id, at);

CREATE FUNCTION forbid_io_assignment_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'IO assignments are kept as written (%)', TG_OP;
END $$;
CREATE TRIGGER fir_io_assignment_kept BEFORE UPDATE OR DELETE ON fir_io_assignment
FOR EACH ROW EXECUTE FUNCTION forbid_io_assignment_change();
