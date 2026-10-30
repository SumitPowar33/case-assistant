-- Front desk (module 1, 30 Oct 2026): information given at the police station before any FIR exists.
-- BNSS 173(1): information given orally is reduced to writing, read over to the informant and signed by them; information
-- given electronically is taken on record once the informant signs it within three days. The written text is the
-- informant's own words: once signed it never changes, and an FIR registered from it takes that text unchanged.
CREATE TABLE complaint (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id          uuid NOT NULL REFERENCES police_station(id),
  received_at         timestamptz NOT NULL,
  mode                text NOT NULL CHECK (mode IN ('oral','phone','written','electronic')),
  informant_name      text NOT NULL CHECK (length(btrim(informant_name)) > 0),
  informant_contact   text,
  kind                text NOT NULL CHECK (kind ~ '^[a-z][a-z_]{1,59}$'),   -- a kind from packs/*/complaint-kinds.json
  text_original       text NOT NULL CHECK (length(btrim(text_original)) > 0),
  text_language       text NOT NULL,
  recorded_by         uuid NOT NULL REFERENCES app_user(id),
  recorded_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  -- read over (oral, phone) and signed by the informant
  read_back_language  text,
  signed_at           timestamptz,
  signed_recorded_by  uuid REFERENCES app_user(id),
  -- what became of it
  outcome             text CHECK (outcome IN ('fir','ncr','preliminary_enquiry','transferred','no_offence','not_signed_in_time')),
  outcome_reason      text,
  fir_id              uuid UNIQUE REFERENCES fir(id),
  outcome_at          timestamptz,
  outcome_by          uuid REFERENCES app_user(id),
  CHECK (received_at <= recorded_at),
  CHECK ((signed_at IS NULL) = (signed_recorded_by IS NULL)),
  CHECK (mode NOT IN ('oral','phone') OR signed_at IS NULL OR read_back_language IS NOT NULL),
  CHECK ((outcome IS NULL) = (outcome_at IS NULL) AND (outcome IS NULL) = (outcome_by IS NULL)),
  CHECK ((outcome = 'fir') = (fir_id IS NOT NULL)),
  CHECK (outcome IS NULL OR outcome = 'not_signed_in_time' OR signed_at IS NOT NULL),
  CHECK (outcome <> 'not_signed_in_time' OR (mode = 'electronic' AND signed_at IS NULL)),
  CHECK (outcome IS NULL OR outcome = 'fir' OR length(btrim(coalesce(outcome_reason, ''))) >= 10)
);
CREATE INDEX complaint_station_open ON complaint (station_id, received_at DESC);

CREATE FUNCTION complaint_rules() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'complaints are kept';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.signed_at IS NOT NULL AND (NEW.text_original, NEW.text_language, NEW.received_at, NEW.mode, NEW.informant_name, NEW.kind, NEW.station_id)
         IS DISTINCT FROM (OLD.text_original, OLD.text_language, OLD.received_at, OLD.mode, OLD.informant_name, OLD.kind, OLD.station_id) THEN
      RAISE EXCEPTION 'a signed complaint is kept as the informant signed it';
    END IF;
    IF OLD.signed_at IS NOT NULL AND (NEW.signed_at, NEW.read_back_language, NEW.signed_recorded_by)
         IS DISTINCT FROM (OLD.signed_at, OLD.read_back_language, OLD.signed_recorded_by) THEN
      RAISE EXCEPTION 'a signature is recorded once';
    END IF;
    IF OLD.outcome IS NOT NULL AND (NEW.outcome, NEW.outcome_reason, NEW.fir_id, NEW.outcome_at, NEW.outcome_by)
         IS DISTINCT FROM (OLD.outcome, OLD.outcome_reason, OLD.fir_id, OLD.outcome_at, OLD.outcome_by) THEN
      RAISE EXCEPTION 'the outcome of a complaint is recorded once';
    END IF;
  END IF;
  -- e-information counts only when signed within three days (BNSS 173(1)(ii))
  IF NEW.mode = 'electronic' AND NEW.signed_at IS NOT NULL AND NEW.signed_at > NEW.received_at + interval '3 days' THEN
    RAISE EXCEPTION 'electronic information must be signed within three days of receipt' USING ERRCODE = 'check_violation';
  END IF;
  -- an FIR from this complaint is of the same station and carries the signed text unchanged
  IF NEW.fir_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM fir f WHERE f.id = NEW.fir_id AND f.station_id = NEW.station_id
                                            AND f.contents_original = NEW.text_original AND f.information_received_at = NEW.received_at) THEN
    RAISE EXCEPTION 'the FIR must be of the same station and carry the complaint as signed' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER complaint_rules BEFORE INSERT OR UPDATE OR DELETE ON complaint FOR EACH ROW EXECUTE FUNCTION complaint_rules();

-- Golden-hour checklist: each step of the complaint's kind that someone has done, once, with who and when.
CREATE TABLE complaint_step (
  complaint_id uuid NOT NULL REFERENCES complaint(id),
  step_id      text NOT NULL CHECK (step_id ~ '^[a-z][a-z0-9_]{1,59}$'),
  done_at      timestamptz NOT NULL,
  done_by      uuid NOT NULL REFERENCES app_user(id),
  note         text CHECK (length(note) <= 2000),
  PRIMARY KEY (complaint_id, step_id)
);
CREATE FUNCTION complaint_step_kept() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'checklist steps are kept as recorded (%)', TG_OP;
END $$;
CREATE TRIGGER complaint_step_kept BEFORE UPDATE OR DELETE ON complaint_step FOR EACH ROW EXECUTE FUNCTION complaint_step_kept();
