-- Readiness check (25 Oct 2026): charge ingredients from the case's playbook -> evidence -> gaps.
-- The officer picks the playbook and links each piece of evidence to the ingredient it proves. The app only
-- lists what is linked and what is missing; it never scores the case or the people in it.
-- A gap can be accepted with a written reason. Overrides are never edited or deleted, so the record stays.

CREATE TABLE case_playbook (
  fir_id           uuid PRIMARY KEY REFERENCES fir(id) ON DELETE CASCADE,
  playbook_id      text NOT NULL,
  playbook_version text NOT NULL,
  chosen_by        uuid NOT NULL REFERENCES app_user(id),
  chosen_at        timestamptz NOT NULL DEFAULT now()
);

-- Lets a link require that the evidence belongs to the same FIR.
ALTER TABLE evidence_item ADD CONSTRAINT evidence_item_id_fir UNIQUE (id, fir_id);

CREATE TABLE ingredient_evidence (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fir_id           uuid NOT NULL REFERENCES fir(id) ON DELETE CASCADE,
  charge_id        text NOT NULL,
  ingredient_id    text NOT NULL,
  evidence_item_id uuid NOT NULL,
  note             text,
  linked_by        uuid NOT NULL REFERENCES app_user(id),
  linked_at        timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (evidence_item_id, fir_id) REFERENCES evidence_item(id, fir_id),
  UNIQUE (fir_id, charge_id, ingredient_id, evidence_item_id)
);

CREATE TABLE readiness_override (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fir_id      uuid NOT NULL REFERENCES fir(id),
  gap_key     text NOT NULL,                        -- e.g. 'ingredient:cheating/delivery', 'certificate:<item id>'
  reason      text NOT NULL CHECK (length(btrim(reason)) >= 10),
  decided_by  uuid NOT NULL REFERENCES app_user(id),
  decided_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fir_id, gap_key)
);

CREATE FUNCTION forbid_override_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'readiness overrides are kept as written (%)', TG_OP;
END $$;

CREATE TRIGGER readiness_override_kept
BEFORE UPDATE OR DELETE ON readiness_override
FOR EACH ROW EXECUTE FUNCTION forbid_override_change();
