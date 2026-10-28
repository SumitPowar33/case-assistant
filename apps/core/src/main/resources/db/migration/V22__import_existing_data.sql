-- Loading existing (legacy) records from a file (Sumit, 28 Oct 2026). A file is staged, checked row by row and
-- shown to a person; nothing reaches the case tables until an authorised officer approves the batch. Imports only
-- add records, never change an existing one. Every batch is kept: who staged it, who approved it, on what authority.
CREATE TABLE import_batch (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id    uuid NOT NULL REFERENCES police_station(id),
  entity        text NOT NULL CHECK (entity IN ('fir')),
  profile       text NOT NULL,
  filename      text NOT NULL,
  file_sha256   text NOT NULL,
  complaint_language text NOT NULL,
  status        text NOT NULL DEFAULT 'staged' CHECK (status IN ('staged','imported','undone','discarded')),
  rows_total    int NOT NULL,
  rows_ok       int NOT NULL DEFAULT 0,
  rows_warning  int NOT NULL DEFAULT 0,
  rows_error    int NOT NULL DEFAULT 0,
  rows_duplicate int NOT NULL DEFAULT 0,
  rows_imported int,
  created_by    uuid NOT NULL REFERENCES app_user(id),
  created_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
  approved_by   uuid REFERENCES app_user(id),
  approved_at   timestamptz,
  authority_note text CHECK (authority_note IS NULL OR length(btrim(authority_note)) >= 10),
  undone_by     uuid REFERENCES app_user(id),
  undone_at     timestamptz,
  undo_reason   text CHECK (undo_reason IS NULL OR length(btrim(undo_reason)) >= 10),
  CHECK ((status = 'imported') = (approved_by IS NOT NULL) OR status = 'undone'),
  CHECK ((status = 'undone') = (undone_by IS NOT NULL))
);
CREATE INDEX import_batch_recent ON import_batch (created_at DESC);

-- Staging. raw and parsed hold personal data, so they are emptied as soon as the batch is imported or discarded.
CREATE TABLE import_row (
  batch_id  uuid NOT NULL REFERENCES import_batch(id) ON DELETE CASCADE,
  row_no    int  NOT NULL,
  status    text NOT NULL CHECK (status IN ('ok','warning','error','duplicate','imported','skipped')),
  messages  jsonb NOT NULL DEFAULT '[]',
  source_key text,
  raw       jsonb,
  parsed    jsonb,
  PRIMARY KEY (batch_id, row_no)
);

CREATE FUNCTION import_batch_kept() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'import batches are kept as written (%)', TG_OP;
END $$;
CREATE TRIGGER import_batch_kept BEFORE DELETE ON import_batch FOR EACH ROW EXECUTE FUNCTION import_batch_kept();

ALTER TABLE fir
  ADD COLUMN import_batch_id uuid REFERENCES import_batch(id),
  ADD COLUMN source_key  text,           -- the id the old system used, when the file has one
  ADD COLUMN source_hash text,           -- fingerprint of the imported row, to tell a repeat from a conflict
  ADD COLUMN concluded   boolean NOT NULL DEFAULT false;   -- already concluded in the old system: no live deadlines
ALTER TABLE person ADD COLUMN import_batch_id uuid REFERENCES import_batch(id);
CREATE INDEX fir_import_batch ON fir (import_batch_id) WHERE import_batch_id IS NOT NULL;

-- Old FIRs carry IPC sections. IPC 376 (rape, including 376A-376E) is masked and timed like BNS 63-71.
CREATE OR REPLACE FUNCTION identity_protected_case(p_fir uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT coalesce((SELECT sexual_offence FROM fir WHERE id = p_fir), false)
      OR EXISTS (SELECT 1 FROM fir_section s WHERE s.fir_id = p_fir
                 AND ((s.act = 'BNS' AND section_no(s.section) BETWEEN 64 AND 71)
                   OR (s.act = 'IPC' AND section_no(s.section) = 376)
                   OR s.act = 'POCSO Act'))
$$;

CREATE OR REPLACE FUNCTION bnss_193_2_applies(p_fir uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN EXISTS (SELECT 1 FROM fir_section WHERE fir_id = p_fir)
    THEN EXISTS (SELECT 1 FROM fir_section s WHERE s.fir_id = p_fir
                 AND ((s.act = 'BNS' AND section_no(s.section) IN (64, 65, 66, 67, 68, 70, 71))
                   OR (s.act = 'IPC' AND section_no(s.section) = 376)
                   OR (s.act = 'POCSO Act' AND section_no(s.section) IN (4, 6, 8, 10))))
    ELSE coalesce((SELECT sexual_offence FROM fir WHERE id = p_fir), false)
  END
$$;

CREATE OR REPLACE VIEW case_deadline AS
SELECT f.id AS fir_id, 'chargesheet_custody' AS kind,
       min(arrest_last_day(a.id)) AS due_on,
       'BNSS 187(3), from first remand of an accused in custody' AS basis
FROM fir f JOIN person p ON p.fir_id = f.id JOIN arrest_current a ON a.person_id = p.id
WHERE a.first_remand_on IS NOT NULL AND a.released_on IS NULL AND chargesheet_filed_for(p.id) IS NULL
GROUP BY f.id
UNION ALL
SELECT f.id, 'sexual_offence_investigation', sexual_offence_last_day(ist_date(f.registered_at)), 'BNSS 193(2)'
FROM fir f WHERE bnss_193_2_applies(f.id) AND NOT f.concluded
  AND NOT EXISTS (SELECT 1 FROM chargesheet c WHERE c.fir_id = f.id
                  AND NOT EXISTS (SELECT 1 FROM chargesheet n WHERE n.supersedes = c.id))
  AND NOT EXISTS (SELECT 1 FROM closure_report r WHERE r.fir_id = f.id)
UNION ALL
SELECT f.id, 'victim_progress_update', ist_date(f.registered_at) + e.days,
       'BNSS 193(3)(ii), 90 days' || CASE WHEN e.days < 90 THEN '; earlier by unit policy: ' || e.days || ' days' ELSE '' END
FROM fir f CROSS JOIN LATERAL (SELECT effective_policy_days(f.station_id, 'victim_update_days', 90) AS days) e
WHERE NOT f.concluded
UNION ALL
SELECT n.fir_id, 'notice_reply:' || n.addressee, n.reply_due_on, n.kind
FROM notice n WHERE n.status IN ('sent','reply_incomplete') AND n.reply_due_on IS NOT NULL;
