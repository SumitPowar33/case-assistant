-- Policies of a state, district or police station (Sumit, 28 Oct 2026). Each unit can set its own value for the
-- policies a pack declares (packs/{module}/policies.json), but only in the stricter direction, inside the pack's
-- bounds, with a written reason. Every change is kept; the newest per unit and key counts. The most specific unit wins:
-- station, then district, then state, then the pack's default.
CREATE TABLE policy_setting (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level       text NOT NULL CHECK (level IN ('state','district','station')),
  state_code  text NOT NULL,
  district    text,
  station_id  uuid REFERENCES police_station(id),
  key         text NOT NULL CHECK (key ~ '^[a-z][a-z_.]{1,59}$'),
  value       text NOT NULL CHECK (btrim(value) <> ''),
  reason      text NOT NULL CHECK (length(btrim(reason)) >= 10),
  set_by      uuid NOT NULL REFERENCES app_user(id),
  set_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((level = 'state'    AND district IS NULL     AND station_id IS NULL)
      OR (level = 'district' AND district IS NOT NULL AND station_id IS NULL)
      OR (level = 'station'  AND station_id IS NOT NULL AND district IS NULL))
);
CREATE INDEX policy_setting_lookup ON policy_setting (key, level, state_code, district, station_id, set_at DESC);

CREATE FUNCTION policy_setting_kept() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'policy settings are kept as written (%); add a newer one instead', TG_OP;
END $$;
CREATE TRIGGER policy_setting_kept BEFORE UPDATE OR DELETE ON policy_setting FOR EACH ROW EXECUTE FUNCTION policy_setting_kept();

-- The value in force for a police station, for a number where lower means stricter: the strictest of the newest
-- setting of its state, its district and itself, and never above the pack's default (given as fallback).
CREATE FUNCTION effective_policy_days(station uuid, policy_key text, fallback int) RETURNS int LANGUAGE sql STABLE AS $$
  SELECT least(fallback, coalesce(min(v), fallback)) FROM (
    SELECT DISTINCT ON (p.level, p.district, p.station_id) p.value::int AS v
    FROM police_station s
    JOIN policy_setting p ON p.key = policy_key AND p.state_code = s.state_code
     AND ((p.level = 'station' AND p.station_id = s.id) OR (p.level = 'district' AND p.district = s.district) OR p.level = 'state')
    WHERE s.id = station
    ORDER BY p.level, p.district, p.station_id, p.set_at DESC) newest
$$;

-- The 90-day update to the victim (BNSS 193(3)(ii)) stays the legal limit; a unit may ask for an earlier internal date.
CREATE OR REPLACE VIEW case_deadline AS
SELECT f.id AS fir_id, 'chargesheet_custody' AS kind,
       min(arrest_last_day(a.id)) AS due_on,
       'BNSS 187(3), from first remand of an accused in custody' AS basis
FROM fir f JOIN person p ON p.fir_id = f.id JOIN arrest_current a ON a.person_id = p.id
WHERE a.first_remand_on IS NOT NULL AND a.released_on IS NULL AND chargesheet_filed_for(p.id) IS NULL
GROUP BY f.id
UNION ALL
SELECT f.id, 'sexual_offence_investigation', sexual_offence_last_day(ist_date(f.registered_at)), 'BNSS 193(2)'
FROM fir f WHERE bnss_193_2_applies(f.id)
  AND NOT EXISTS (SELECT 1 FROM chargesheet c WHERE c.fir_id = f.id
                  AND NOT EXISTS (SELECT 1 FROM chargesheet n WHERE n.supersedes = c.id))
  AND NOT EXISTS (SELECT 1 FROM closure_report r WHERE r.fir_id = f.id)
UNION ALL
SELECT f.id, 'victim_progress_update', ist_date(f.registered_at) + e.days,
       'BNSS 193(3)(ii), 90 days' || CASE WHEN e.days < 90 THEN '; earlier by unit policy: ' || e.days || ' days' ELSE '' END
FROM fir f CROSS JOIN LATERAL (SELECT effective_policy_days(f.station_id, 'victim_update_days', 90) AS days) e
UNION ALL
SELECT n.fir_id, 'notice_reply:' || n.addressee, n.reply_due_on, n.kind
FROM notice n WHERE n.status IN ('sent','reply_incomplete') AND n.reply_due_on IS NOT NULL;
