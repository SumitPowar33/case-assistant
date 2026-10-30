-- A state module (packs/{state}/policies.json, "state_values") may set a stricter value of a national policy for its whole
-- state, e.g. Maharashtra: a second person approves every import. The rows are written by the application at start-up from
-- the pack files (a reviewed release), never by hand; a state admin, district or station can only go stricter still.
CREATE TABLE pack_policy (
  state_code  text NOT NULL REFERENCES state_pack(code) ON DELETE CASCADE,
  key         text NOT NULL CHECK (key ~ '^[a-z][a-z_.]{1,59}$'),
  value       int  NOT NULL,
  reason      text NOT NULL CHECK (length(btrim(reason)) >= 10),
  PRIMARY KEY (state_code, key)
);

-- The strictest of: the fallback (legal or national default), the state module's value, and the newest setting of the
-- state, the district and the station.
CREATE OR REPLACE FUNCTION effective_policy_days(station uuid, policy_key text, fallback int) RETURNS int LANGUAGE sql STABLE AS $$
  SELECT least(fallback, coalesce(min(v), fallback),
               coalesce((SELECT pp.value FROM police_station s JOIN pack_policy pp ON pp.state_code = s.state_code AND pp.key = policy_key
                         WHERE s.id = station), fallback)) FROM (
    SELECT DISTINCT ON (p.level, p.district_id, p.station_id) p.value::int AS v
    FROM police_station s
    JOIN policy_setting p ON p.key = policy_key AND p.state_code = s.state_code
     AND ((p.level = 'station' AND p.station_id = s.id) OR (p.level = 'district' AND p.district_id = s.district_id) OR p.level = 'state')
    WHERE s.id = station
    ORDER BY p.level, p.district_id, p.station_id, p.set_at DESC) newest
$$;
