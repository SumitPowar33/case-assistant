-- Jurisdiction as data (docs/ARCHITECTURE-TENANCY.md, section 5 item 1). A district used to be plain text on the
-- station, and the SP's reach and the district policies were a text match: a spelling difference or a renamed
-- district would silently give or take away access. Now a district is a row with an id; stations and district
-- policies point at it. Names are unique per state ignoring case and surrounding spaces.
CREATE TABLE district (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state_code  text NOT NULL REFERENCES state_pack(code),
  name        text NOT NULL CHECK (name = btrim(name) AND name <> '')
);
CREATE UNIQUE INDEX district_name_per_state ON district (state_code, lower(name));

INSERT INTO district (state_code, name)
SELECT state_code, min(btrim(district)) FROM police_station GROUP BY state_code, lower(btrim(district));

-- The id of a district by name, created when it is new (an existing one is found whatever its letter case).
CREATE FUNCTION district_id_of(state text, district_name text) RETURNS uuid LANGUAGE sql AS $$
  INSERT INTO district (state_code, name) VALUES (state, btrim(district_name))
  ON CONFLICT (state_code, lower(name)) DO UPDATE SET name = district.name
  RETURNING id
$$;

ALTER TABLE police_station ADD COLUMN district_id uuid REFERENCES district(id);
UPDATE police_station s SET district_id = d.id FROM district d
 WHERE d.state_code = s.state_code AND lower(d.name) = lower(btrim(s.district));
ALTER TABLE police_station ALTER COLUMN district_id SET NOT NULL;
ALTER TABLE police_station DROP COLUMN district;
CREATE INDEX police_station_district ON police_station (district_id);

-- Policy settings are kept as written; the migration alone may add the id to the old rows.
ALTER TABLE policy_setting DISABLE TRIGGER policy_setting_kept;
ALTER TABLE policy_setting ADD COLUMN district_id uuid REFERENCES district(id);
UPDATE policy_setting p SET district_id = d.id FROM district d
 WHERE p.district IS NOT NULL AND d.state_code = p.state_code AND lower(d.name) = lower(btrim(p.district));
ALTER TABLE policy_setting DROP COLUMN district;   -- also drops its index and the old check
ALTER TABLE policy_setting ENABLE TRIGGER policy_setting_kept;
ALTER TABLE policy_setting ADD FOREIGN KEY (state_code) REFERENCES state_pack(code);
ALTER TABLE policy_setting ADD CHECK (
     (level = 'state'    AND district_id IS NULL     AND station_id IS NULL)
  OR (level = 'district' AND district_id IS NOT NULL AND station_id IS NULL)
  OR (level = 'station'  AND station_id IS NOT NULL  AND district_id IS NULL));
CREATE INDEX policy_setting_lookup ON policy_setting (key, level, state_code, district_id, station_id, set_at DESC);

CREATE OR REPLACE FUNCTION effective_policy_days(station uuid, policy_key text, fallback int) RETURNS int LANGUAGE sql STABLE AS $$
  SELECT least(fallback, coalesce(min(v), fallback)) FROM (
    SELECT DISTINCT ON (p.level, p.district_id, p.station_id) p.value::int AS v
    FROM police_station s
    JOIN policy_setting p ON p.key = policy_key AND p.state_code = s.state_code
     AND ((p.level = 'station' AND p.station_id = s.id) OR (p.level = 'district' AND p.district_id = s.district_id) OR p.level = 'state')
    WHERE s.id = station
    ORDER BY p.level, p.district_id, p.station_id, p.set_at DESC) newest
$$;
