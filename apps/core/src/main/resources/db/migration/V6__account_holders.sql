-- Account-holder second link (25 Oct 2026).
-- Money landing in an account is not enough to charge the account holder. The case team marks which accused
-- are account holders (a fact from the bank reply, not a judgment of the person) and links, per accused, the
-- evidence for each independent link (SIM or device, KYC identification, CCTV, login IP, own statement).
-- The readiness check lists every account holder who has no such link yet. Both tables are append-only.

CREATE TABLE account_holder (
  person_id   uuid PRIMARY KEY,
  fir_id      uuid NOT NULL REFERENCES fir(id) ON DELETE CASCADE,
  basis       text NOT NULL CHECK (length(btrim(basis)) >= 5),   -- e.g. 'Bank reply to notice N-3: receiving account'
  marked_by   uuid NOT NULL REFERENCES app_user(id),
  marked_at   timestamptz NOT NULL DEFAULT now()
);

-- Lets a row require that the person belongs to the same FIR.
ALTER TABLE person ADD CONSTRAINT person_id_fir UNIQUE (id, fir_id);
ALTER TABLE account_holder ADD FOREIGN KEY (person_id, fir_id) REFERENCES person(id, fir_id);

CREATE TABLE accused_link (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fir_id           uuid NOT NULL REFERENCES fir(id) ON DELETE CASCADE,
  person_id        uuid NOT NULL,
  link_type        text NOT NULL,                    -- one of the playbook rule's requires_any (checked by the app)
  evidence_item_id uuid NOT NULL,
  note             text,
  linked_by        uuid NOT NULL REFERENCES app_user(id),
  linked_at        timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (person_id, fir_id) REFERENCES person(id, fir_id),
  FOREIGN KEY (evidence_item_id, fir_id) REFERENCES evidence_item(id, fir_id),
  UNIQUE (person_id, link_type, evidence_item_id)
);

-- Only accused people can be account holders or carry accused links.
CREATE FUNCTION require_accused() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM person WHERE id = NEW.person_id AND role = 'accused') THEN
    RAISE EXCEPTION 'person % is not an accused in this case', NEW.person_id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER account_holder_accused BEFORE INSERT ON account_holder FOR EACH ROW EXECUTE FUNCTION require_accused();
CREATE TRIGGER accused_link_accused BEFORE INSERT ON accused_link FOR EACH ROW EXECUTE FUNCTION require_accused();

CREATE FUNCTION forbid_change_kept() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% rows are kept as written (%)', TG_TABLE_NAME, TG_OP;
END $$;

CREATE TRIGGER account_holder_kept BEFORE UPDATE OR DELETE ON account_holder FOR EACH ROW EXECUTE FUNCTION forbid_change_kept();
CREATE TRIGGER accused_link_kept BEFORE UPDATE OR DELETE ON accused_link FOR EACH ROW EXECUTE FUNCTION forbid_change_kept();
