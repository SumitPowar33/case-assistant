-- The FIR list finds an officer's cases by the IO named on them (CaseTeam.readableFirsSql); without this index that
-- part read every FIR. Cases of whole stations use the (station_id, fir_year, fir_no) unique index. Load test, 1 Nov 2026.
CREATE INDEX fir_io ON fir (io_id) WHERE io_id IS NOT NULL;
