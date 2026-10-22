-- Case Assistant core schema, version 1 (national pack).
-- Field names follow the official forms in docs/research/official-forms.md:
-- CCTNS IIF-1 (FIR), BNSS 35 arrest memo, BNSS 94/35(3)/179 notices, seizure memo, BSA 63(4) certificate.
-- Flyway-style file name so the Spring Boot app picks it up unchanged.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------- reference data ----------
CREATE TABLE state_pack (
  code        text PRIMARY KEY CHECK (code ~ '^[A-Z]{2,3}$'),   -- 'IN' = national pack, 'MH' = Maharashtra ...
  name        text NOT NULL,
  version     text NOT NULL,
  languages   text[] NOT NULL CHECK (cardinality(languages) > 0),
  status      text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pilot','live','retired'))
);

CREATE TABLE police_station (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state_code  text NOT NULL REFERENCES state_pack(code),
  district    text NOT NULL,
  name        text NOT NULL,
  cctns_code  text UNIQUE
);

CREATE TABLE app_user (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name   text NOT NULL,
  rank        text NOT NULL,                      -- SI, PSI, HC, Inspector, SP ...
  role        text NOT NULL CHECK (role IN ('io','front_desk','sho','sp','prosecutor','malkhana','state_admin')),
  station_id  uuid REFERENCES police_station(id),
  ui_language text NOT NULL DEFAULT 'en'
);

-- ---------- FIR (CCTNS IIF-1) ----------
CREATE TABLE fir (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id              uuid NOT NULL REFERENCES police_station(id),
  fir_year                int  NOT NULL CHECK (fir_year BETWEEN 2000 AND 2100),
  fir_no                  int  NOT NULL CHECK (fir_no > 0),
  gd_entry_no             text NOT NULL,                       -- IIF-1 needs a General Diary entry first
  registered_at           timestamptz NOT NULL,
  information_received_at timestamptz NOT NULL,
  is_zero_fir             boolean NOT NULL DEFAULT false,
  outside_limits_place    text,                                -- Zero FIR: where it happened
  occurrence_known        boolean NOT NULL DEFAULT true,
  occurrence_from         timestamptz,
  occurrence_to           timestamptz,
  occurrence_place        text,
  contents_original       text NOT NULL,                       -- the complaint text, never overwritten
  contents_language       text NOT NULL,
  action_taken            text NOT NULL CHECK (action_taken IN ('investigate','refused','self_investigation','transferred')),
  action_reason           text,
  io_id                   uuid REFERENCES app_user(id),
  sexual_offence          boolean NOT NULL DEFAULT false,      -- BNS 64-71 / POCSO 4,6,8,10: 2-month limit + victim masking
  UNIQUE (station_id, fir_year, fir_no),
  CHECK (occurrence_to IS NULL OR occurrence_from IS NULL OR occurrence_to >= occurrence_from),
  CHECK (NOT is_zero_fir OR outside_limits_place IS NOT NULL),
  CHECK (action_taken NOT IN ('refused','self_investigation') OR action_reason IS NOT NULL),
  CHECK (information_received_at <= registered_at)
);

CREATE TABLE fir_section (
  fir_id   uuid NOT NULL REFERENCES fir(id) ON DELETE CASCADE,
  act      text NOT NULL CHECK (act IN ('BNS','IPC','IT Act','NDPS Act','POCSO Act','Arms Act','SC/ST Act','Other')),
  section  text NOT NULL CHECK (section <> ''),
  chosen_by uuid REFERENCES app_user(id),                       -- the officer decides; AI only suggests
  PRIMARY KEY (fir_id, act, section)
);

-- ---------- people in the case ----------
CREATE TABLE person (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fir_id             uuid NOT NULL REFERENCES fir(id) ON DELETE CASCADE,
  role               text NOT NULL CHECK (role IN ('complainant','victim','accused','witness','suspect')),
  label              text,                                      -- 'A2', 'W5' ...
  identity_known     boolean NOT NULL DEFAULT true,
  full_name          text,
  alias              text,
  parentage          text,
  age_years          int CHECK (age_years BETWEEN 0 AND 120),
  gender             text,
  phone              text,
  address_present    text,
  address_permanent  text,
  nationality        text,
  identity_masked    boolean NOT NULL DEFAULT false,            -- BNS 72: victim identity in sexual offences
  CHECK (NOT identity_known OR full_name IS NOT NULL)
);

-- Anyone outside the authorised case team reads people through this view.
CREATE VIEW person_public AS
SELECT id, fir_id, role, label, identity_known,
       CASE WHEN identity_masked THEN 'Victim ' || coalesce(label, 'X') ELSE full_name END AS display_name,
       CASE WHEN identity_masked THEN NULL ELSE phone END            AS phone,
       CASE WHEN identity_masked THEN NULL ELSE address_present END  AS address_present,
       age_years, gender, identity_masked
FROM person;

-- ---------- arrest (BNSS 35 memo) ----------
CREATE TABLE arrest (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id           uuid NOT NULL REFERENCES person(id),
  arrested_at         timestamptz NOT NULL,
  place               text NOT NULL,
  grounds             text[] NOT NULL CHECK (cardinality(grounds) > 0),
  informed_name       text NOT NULL,                             -- person told of the arrest
  informed_contact    text,
  arresting_officer   uuid NOT NULL REFERENCES app_user(id),
  first_remand_on     date,                                     -- the 60/90 days run from here
  max_punishment      text NOT NULL CHECK (max_punishment IN ('death','life','10_years_or_more','less_than_10_years'))
);

-- ---------- notices (BNSS 94, 35(3), 179) ----------
CREATE TABLE notice (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fir_id          uuid NOT NULL REFERENCES fir(id) ON DELETE CASCADE,
  kind            text NOT NULL CHECK (kind IN ('BNSS_94','BNSS_35_3','BNSS_179','follow_up')),
  addressee       text NOT NULL,
  items_requested text[] NOT NULL DEFAULT '{}',
  body            text NOT NULL,
  ai_request_id   uuid,                                          -- set if an AI draft was used (see ai-gateway audit)
  signed_by       uuid REFERENCES app_user(id),
  issued_at       timestamptz,
  reply_due_on    date,
  status          text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','reply_incomplete','complete','cancelled')),
  CHECK (status = 'draft' OR (signed_by IS NOT NULL AND issued_at IS NOT NULL)),
  CHECK (kind <> 'BNSS_94' OR cardinality(items_requested) > 0)
);

CREATE TABLE notice_reply (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notice_id    uuid NOT NULL REFERENCES notice(id) ON DELETE CASCADE,
  received_at  timestamptz NOT NULL,
  channel      text NOT NULL CHECK (channel IN ('email','portal','post','by_hand')),
  checks       jsonb NOT NULL DEFAULT '[]'                       -- [{"item":"Part B certificate","present":false}, ...]
);

-- ---------- evidence, custody, certificates ----------
CREATE TABLE evidence_item (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fir_id        uuid NOT NULL REFERENCES fir(id) ON DELETE CASCADE,
  label         text NOT NULL,                                   -- '214/E-03'
  description   text NOT NULL,
  kind          text NOT NULL CHECK (kind IN ('physical','electronic','document')),
  seized_at     timestamptz NOT NULL,
  seizure_memo  text NOT NULL,
  esakshya_id   text,                                            -- BNSS 105 / 176 / 185 recording
  seal_no       text,
  sha256        text CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  UNIQUE (fir_id, label),
  CHECK (kind <> 'electronic' OR sha256 IS NOT NULL)
);

-- Chain of custody: one row per hand-over. Rows can never be changed or removed.
CREATE TABLE custody_event (
  id             bigserial PRIMARY KEY,
  item_id        uuid NOT NULL REFERENCES evidence_item(id),
  at             timestamptz NOT NULL,
  handed_by      text NOT NULL,
  received_by    text NOT NULL,
  location       text NOT NULL,
  purpose        text NOT NULL,
  seal_intact    boolean NOT NULL
);

CREATE FUNCTION forbid_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'custody_event rows are append-only (%)', TG_OP;
END $$;

CREATE TRIGGER custody_event_append_only
BEFORE UPDATE OR DELETE ON custody_event
FOR EACH ROW EXECUTE FUNCTION forbid_change();

CREATE TABLE certificate_63_4 (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id      uuid NOT NULL REFERENCES evidence_item(id),
  part         char(1) NOT NULL CHECK (part IN ('A','B')),       -- A: party in charge of the device; B: expert
  signer_name  text NOT NULL,
  device_type  text NOT NULL,
  device_ids   text,                                            -- make/model/serial/IMEI/MAC/cloud id
  hash_algo    text NOT NULL CHECK (hash_algo IN ('SHA256','SHA1','MD5','Other')),
  hash_value   text NOT NULL,
  signed_at    timestamptz NOT NULL,
  place        text NOT NULL,
  UNIQUE (item_id, part)
);

-- An electronic item is court-ready only with both parts and a matching SHA-256.
CREATE VIEW electronic_item_readiness AS
SELECT e.id, e.fir_id, e.label,
       bool_or(c.part = 'A') IS TRUE AS has_part_a,
       bool_or(c.part = 'B') IS TRUE AS has_part_b,
       coalesce(bool_and(c.hash_algo <> 'SHA256' OR lower(c.hash_value) = e.sha256), true) AS hashes_match,
       (bool_or(c.part = 'A') IS TRUE AND bool_or(c.part = 'B') IS TRUE
        AND coalesce(bool_and(c.hash_algo <> 'SHA256' OR lower(c.hash_value) = e.sha256), true)) AS court_ready
FROM evidence_item e LEFT JOIN certificate_63_4 c ON c.item_id = e.id
WHERE e.kind = 'electronic'
GROUP BY e.id, e.fir_id, e.label;

-- ---------- statutory deadlines ----------
-- BNSS 187(3): 90 days if the offence is punishable with death, life or 10 years or more; otherwise 60 days.
-- The day of first remand counts as day 1 (Supreme Court, ED v Kapil Wadhawan, 2023). Confirm with the prosecutor.
CREATE FUNCTION chargesheet_last_day(first_remand date, max_punishment text) RETURNS date
LANGUAGE sql IMMUTABLE AS $$
  SELECT first_remand + (CASE WHEN max_punishment IN ('death','life','10_years_or_more') THEN 90 ELSE 60 END) - 1
$$;

-- BNSS 193(2): investigation of BNS 64-71 / POCSO 4,6,8,10 to finish within two months of the information being recorded.
CREATE FUNCTION sexual_offence_last_day(information_recorded date) RETURNS date
LANGUAGE sql IMMUTABLE AS $$ SELECT (information_recorded + interval '2 months')::date $$;

CREATE VIEW case_deadline AS
SELECT f.id AS fir_id, 'chargesheet_custody' AS kind,
       min(chargesheet_last_day(a.first_remand_on, a.max_punishment)) AS due_on,
       'BNSS 187(3), from first remand of an accused in custody' AS basis
FROM fir f JOIN person p ON p.fir_id = f.id JOIN arrest a ON a.person_id = p.id
WHERE a.first_remand_on IS NOT NULL
GROUP BY f.id
UNION ALL
SELECT f.id, 'sexual_offence_investigation', sexual_offence_last_day(f.registered_at::date), 'BNSS 193(2)'
FROM fir f WHERE f.sexual_offence
UNION ALL
SELECT f.id, 'victim_progress_update', (f.registered_at::date + 90), 'BNSS 193(3)(ii), 90 days'
FROM fir f
UNION ALL
SELECT n.fir_id, 'notice_reply:' || n.addressee, n.reply_due_on, n.kind
FROM notice n WHERE n.status IN ('sent','reply_incomplete') AND n.reply_due_on IS NOT NULL;
