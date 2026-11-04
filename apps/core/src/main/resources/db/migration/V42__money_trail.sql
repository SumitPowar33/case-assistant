-- Money trail (design board 8, session 68): where the money of an online fraud went, and what banks have frozen.
-- Both tables are built only from bank replies already in the evidence register (the row may name the evidence
-- item it came from) and are kept as written: a mistake is answered by a new row and a note, never by a change.
-- Money reaching an account is not proof against its holder; the second link stays in the readiness check
-- (account_holder and accused_link, V6). Nothing here scores a person or a case.

CREATE TABLE money_transfer (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fir_id           uuid NOT NULL REFERENCES fir(id) ON DELETE CASCADE,
  from_account     text NOT NULL CHECK (length(btrim(from_account)) BETWEEN 2 AND 120),
  to_account       text NOT NULL CHECK (length(btrim(to_account)) BETWEEN 2 AND 120),
  to_person_id     uuid,
  amount_paise     bigint NOT NULL CHECK (amount_paise > 0),
  transferred_on   date NOT NULL,
  evidence_item_id uuid,
  recorded_by      uuid NOT NULL REFERENCES app_user(id),
  recorded_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (to_person_id, fir_id) REFERENCES person(id, fir_id),
  FOREIGN KEY (evidence_item_id, fir_id) REFERENCES evidence_item(id, fir_id)
);
CREATE INDEX money_transfer_case ON money_transfer (fir_id, transferred_on);

CREATE TABLE money_hold (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fir_id           uuid NOT NULL REFERENCES fir(id) ON DELETE CASCADE,
  account          text NOT NULL CHECK (length(btrim(account)) BETWEEN 2 AND 120),
  amount_paise     bigint NOT NULL CHECK (amount_paise > 0),
  held_on          date NOT NULL,
  evidence_item_id uuid,
  recorded_by      uuid NOT NULL REFERENCES app_user(id),
  recorded_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (evidence_item_id, fir_id) REFERENCES evidence_item(id, fir_id)
);
CREATE INDEX money_hold_case ON money_hold (fir_id, held_on);

-- the receiving person, when named, is an accused of the same case (the FK keeps the case; this keeps the role)
CREATE FUNCTION money_transfer_check() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.to_person_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM person WHERE id = NEW.to_person_id AND role = 'accused') THEN
    RAISE EXCEPTION 'person % is not an accused in this case', NEW.to_person_id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER money_transfer_accused BEFORE INSERT ON money_transfer FOR EACH ROW EXECUTE FUNCTION money_transfer_check();

CREATE TRIGGER money_transfer_kept BEFORE UPDATE OR DELETE ON money_transfer FOR EACH ROW EXECUTE FUNCTION forbid_change_kept();
CREATE TRIGGER money_hold_kept BEFORE UPDATE OR DELETE ON money_hold FOR EACH ROW EXECUTE FUNCTION forbid_change_kept();
