-- A1, the rest: identifiers seen in other FIRs of the station (design board 2, "2 of these numbers also appear in FIR
-- 198/2026 at this station", session 122). A confirmed fact of kind phone, account, UTR or UPI id (V50) is compared with
-- the confirmed facts of the other FIRs of the same station by one key, so "+91 98765 41207" and "098765-41207" are the
-- same phone. A value that is masked ("XXXX4471", "98XXX 41207", "****"), too short or not of its kind's shape has no key
-- and is never linked: a part of a number would link cases that have nothing to do with each other. Nothing is stored;
-- the link is read when asked (FactController.links), so it follows the facts and the case team as they are.
CREATE FUNCTION fact_identifier_key(kind text, value text) RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE
    WHEN value ~ '[*•]' THEN NULL
    WHEN kind = 'phone' THEN
      CASE WHEN value ~ '^[+0-9 ().-]+$' AND length(regexp_replace(value, '[^0-9]', '', 'g')) BETWEEN 10 AND 13
           THEN right(regexp_replace(value, '[^0-9]', '', 'g'), 10) END
    WHEN kind IN ('account', 'utr') THEN
      CASE WHEN value ~* 'xx' THEN NULL
           WHEN value ~ '^[A-Za-z0-9 /-]+$' AND length(regexp_replace(value, '[^A-Za-z0-9]', '', 'g'))
                BETWEEN (CASE kind WHEN 'account' THEN 8 ELSE 10 END) AND 35
           THEN upper(regexp_replace(value, '[^A-Za-z0-9]', '', 'g')) END
    WHEN kind = 'upi' THEN
      CASE WHEN lower(btrim(value)) ~ '^[a-z0-9._-]{2,255}@[a-z0-9.-]{2,64}$' AND lower(btrim(value)) !~ '^x+@'
           THEN lower(btrim(value)) END
  END
$$;

CREATE INDEX fir_fact_identifier ON fir_fact (fact_identifier_key(kind, value)) WHERE fact_identifier_key(kind, value) IS NOT NULL;
