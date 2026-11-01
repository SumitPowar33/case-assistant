package in.caseassistant;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * Who read protected victim details (BNS 72, POCSO 23): the real name, phone and address of a protected victim, or the
 * complaint text and informant that name them. The screens that show them call {@link #fir} or {@link #complaints}
 * before answering, so a read that cannot be logged is not sent. The log (V37) is kept as written and is read by
 * whoever holds {@code audit.read_protected} for the station (packs roles.json: by the role's case scope, or the
 * admin's state).
 */
@RestController
class ProtectedReads {
    static final String PERMISSION = "audit.read_protected";
    private final JdbcClient db;
    private final CaseTeam team;

    ProtectedReads(JdbcClient db, CaseTeam team) {
        this.db = db;
        this.team = team;
    }

    /**
     * One read of a protected FIR's people ({@code people}) or text ({@code fir_text}). A screen loads the same record
     * several times when it opens (the FIR screen asks for the people four times), so a read by the same person of the
     * same record and kind within {@link #SAME_OPENING} of their last logged one is the same opening and not logged again.
     */
    void fir(UUID reader, UUID firId, String what) {
        db.sql("""
                insert into protected_read (reader, station_id, fir_id, fir_ref, what)
                select ?, f.station_id, f.id, f.fir_year || '/' || f.fir_no, ? from fir f where f.id = ? and not exists (
                  select 1 from protected_read r where r.reader = ? and r.fir_id = f.id and r.what = ? and r.at > now() - ?::interval)""")
                .params(reader, what, firId, reader, what, SAME_OPENING).update();
    }

    static final String SAME_OPENING = "1 minute";

    /** Reads of protected complaints: one complaint opened ({@code complaint}) or names in the list ({@code complaint_list}); same opening as {@link #fir}. */
    void complaints(UUID reader, List<UUID> ids, String what) {
        if (ids.isEmpty()) return;
        db.sql("""
                insert into protected_read (reader, station_id, fir_id, fir_ref, complaint_id, what)
                select ?, c.station_id, c.fir_id, f.fir_year || '/' || f.fir_no, c.id, ? from complaint c left join fir f on f.id = c.fir_id
                where c.id = any(?) and not exists (
                  select 1 from protected_read r where r.reader = ? and r.complaint_id = c.id and r.what = ? and r.at > now() - ?::interval)""")
                .params(reader, what, ids.toArray(UUID[]::new), reader, what, SAME_OPENING).update();
    }

    /** The reads at one station, newest first, for those who may audit it. */
    @GetMapping("/api/protected-reads")
    List<Map<String, Object>> list(@AuthenticationPrincipal Jwt jwt, @RequestParam UUID stationId,
            @RequestParam(defaultValue = "100") int limit, @RequestParam(defaultValue = "0") int offset) {
        if (limit < 1 || limit > 200 || offset < 0)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "limit must be 1 to 200 and offset 0 or more");
        if (!team.canAt(CaseTeam.user(jwt), PERMISSION, stationId))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only those who audit this police station see who read protected details.");
        return db.sql("""
                select r.id, r.at, r.what, r.fir_id, r.fir_ref, r.complaint_id, u.full_name as reader_name, u.rank as reader_rank, u.username as reader_username
                from protected_read r join app_user u on u.id = r.reader where r.station_id = ? order by r.at desc, r.id limit ? offset ?""")
                .params(stationId, limit, offset).query().listOfRows();
    }
}
