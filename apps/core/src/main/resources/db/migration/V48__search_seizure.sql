-- Search and seizure memo (design board 7, session 76), written when the search is over and frozen when it is saved.
-- BNSS 185(1): the officer records in writing the grounds for the search. BNSS 103(4): two or more independent and
-- respectable inhabitants of the locality witness it (if none could be had, the reason is written down). BNSS 103(5):
-- a list of the things seized, signed by the witnesses. BNSS 105: the search and the seizure are recorded by
-- audio-video electronic means and the recording is forwarded without delay to the Magistrate (BNSS 185(5): copies of
-- the record to the Magistrate). The recording files stay in e-Sakshya; the app keeps their SHA-256 and length.
-- Everything is kept as written. The witnesses, the recordings and the seized items of a memo are written in the same
-- transaction as the memo (its frozen_at is that transaction's now()); nothing is added to a frozen memo afterwards.
CREATE TABLE search_seizure (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fir_id            uuid NOT NULL REFERENCES fir(id) ON DELETE CASCADE,
  place             text NOT NULL CHECK (length(btrim(place)) BETWEEN 3 AND 300),
  grounds           text NOT NULL CHECK (length(btrim(grounds)) BETWEEN 10 AND 2000),
  started_at        timestamptz NOT NULL,
  ended_at          timestamptz NOT NULL,
  no_witness_reason text CHECK (no_witness_reason IS NULL OR length(btrim(no_witness_reason)) BETWEEN 10 AND 1000),
  recorded_by       uuid NOT NULL REFERENCES app_user(id),
  frozen_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, fir_id),
  CHECK (ended_at >= started_at),
  CHECK (ended_at <= frozen_at + interval '5 minutes')   -- written once the search is over, never ahead of time
);
CREATE INDEX search_seizure_case ON search_seizure (fir_id, started_at);

CREATE TABLE search_witness (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  search_id uuid NOT NULL,
  fir_id    uuid NOT NULL,
  name      text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 160),
  address   text NOT NULL CHECK (length(btrim(address)) BETWEEN 5 AND 300),
  FOREIGN KEY (search_id, fir_id) REFERENCES search_seizure(id, fir_id) ON DELETE CASCADE
);

CREATE TABLE search_recording (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  search_id   uuid NOT NULL,
  fir_id      uuid NOT NULL,
  sha256      text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  seconds     integer NOT NULL CHECK (seconds BETWEEN 1 AND 86400),
  esakshya_id text CHECK (esakshya_id IS NULL OR length(btrim(esakshya_id)) BETWEEN 2 AND 60),
  UNIQUE (search_id, sha256),
  FOREIGN KEY (search_id, fir_id) REFERENCES search_seizure(id, fir_id) ON DELETE CASCADE
);

-- the items seized in a search are ordinary evidence items of the case (evidence register, property register, custody)
ALTER TABLE evidence_item ADD COLUMN search_id uuid;
ALTER TABLE evidence_item ADD CONSTRAINT evidence_item_search FOREIGN KEY (search_id, fir_id) REFERENCES search_seizure(id, fir_id);

-- BNSS 105: when the recording was sent to the Magistrate (once per memo)
CREATE TABLE search_forward (
  search_id    uuid PRIMARY KEY,
  fir_id       uuid NOT NULL,
  forwarded_on date NOT NULL,
  forwarded_to text NOT NULL CHECK (length(btrim(forwarded_to)) BETWEEN 3 AND 160),
  recorded_by  uuid NOT NULL REFERENCES app_user(id),
  recorded_at  timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (forwarded_on <= ist_date(recorded_at)),
  FOREIGN KEY (search_id, fir_id) REFERENCES search_seizure(id, fir_id) ON DELETE CASCADE
);

CREATE FUNCTION search_forward_check() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.forwarded_on < (SELECT ist_date(started_at) FROM search_seizure WHERE id = NEW.search_id) THEN
    RAISE EXCEPTION 'a recording is sent to the Magistrate after the search, not before' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER search_forward_checked BEFORE INSERT ON search_forward FOR EACH ROW EXECUTE FUNCTION search_forward_check();

-- a witness, a recording or a seized item joins a memo only in the transaction that writes the memo
CREATE FUNCTION search_part_with_memo() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.search_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM search_seizure s WHERE s.id = NEW.search_id AND s.frozen_at = now()) THEN
    RAISE EXCEPTION 'a search memo is frozen when it is saved; nothing is added to it afterwards' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER search_witness_with_memo BEFORE INSERT ON search_witness FOR EACH ROW EXECUTE FUNCTION search_part_with_memo();
CREATE TRIGGER search_recording_with_memo BEFORE INSERT ON search_recording FOR EACH ROW EXECUTE FUNCTION search_part_with_memo();
CREATE TRIGGER evidence_item_with_memo BEFORE INSERT ON evidence_item FOR EACH ROW EXECUTE FUNCTION search_part_with_memo();

-- a memo is of a search made after the information was received, and an item's memo never changes
CREATE FUNCTION search_seizure_check() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.started_at < (SELECT information_received_at FROM fir WHERE id = NEW.fir_id) THEN
    RAISE EXCEPTION 'a search of this case cannot start before its information was received' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER search_seizure_checked BEFORE INSERT ON search_seizure FOR EACH ROW EXECUTE FUNCTION search_seizure_check();

CREATE FUNCTION evidence_item_search_kept() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.search_id IS DISTINCT FROM OLD.search_id THEN
    RAISE EXCEPTION 'the search memo of a seized item does not change';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER evidence_item_search_kept BEFORE UPDATE ON evidence_item FOR EACH ROW EXECUTE FUNCTION evidence_item_search_kept();

-- when the transaction ends: at least one recording (BNSS 105), and two witnesses or the reason there are fewer (BNSS 103(4))
CREATE FUNCTION search_memo_complete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM search_recording r WHERE r.search_id = NEW.id) THEN
    RAISE EXCEPTION 'a search memo needs the audio-video recording of the search (BNSS 105)' USING ERRCODE = 'check_violation';
  END IF;
  IF (SELECT count(*) FROM search_witness w WHERE w.search_id = NEW.id) < 2 AND NEW.no_witness_reason IS NULL THEN
    RAISE EXCEPTION 'a search memo needs two witnesses of the locality, or the reason there are fewer (BNSS 103(4))' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER search_memo_complete AFTER INSERT ON search_seizure DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION search_memo_complete();

CREATE TRIGGER search_seizure_kept BEFORE UPDATE OR DELETE ON search_seizure FOR EACH ROW EXECUTE FUNCTION forbid_change_kept();
CREATE TRIGGER search_witness_kept BEFORE UPDATE OR DELETE ON search_witness FOR EACH ROW EXECUTE FUNCTION forbid_change_kept();
CREATE TRIGGER search_recording_kept BEFORE UPDATE OR DELETE ON search_recording FOR EACH ROW EXECUTE FUNCTION forbid_change_kept();
CREATE TRIGGER search_forward_kept BEFORE UPDATE OR DELETE ON search_forward FOR EACH ROW EXECUTE FUNCTION forbid_change_kept();
