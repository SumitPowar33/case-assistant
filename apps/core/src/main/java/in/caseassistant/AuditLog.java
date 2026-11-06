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
 * One audit screen (board 20): for a police station, newest first, the reads of protected victim details, the
 * readiness gaps a person accepted with a reason (and their withdrawals) and the admin's changes to accounts and the
 * station. Only reads of the existing append-only tables; nothing is written here. Same permission as the reads log.
 * The AI suggestions and decisions are kept by the AI gateway and are not in this list.
 */
@RestController
class AuditLog {
    private final JdbcClient db;
    private final CaseTeam team;

    AuditLog(JdbcClient db, CaseTeam team) {
        this.db = db;
        this.team = team;
    }

    @GetMapping("/api/audit-log")
    List<Map<String, Object>> list(@AuthenticationPrincipal Jwt jwt, @RequestParam UUID stationId,
            @RequestParam(defaultValue = "100") int limit, @RequestParam(defaultValue = "0") int offset) {
        if (limit < 1 || limit > 200 || offset < 0)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "limit must be 1 to 200 and offset 0 or more");
        if (!team.canAt(CaseTeam.user(jwt), ProtectedReads.PERMISSION, stationId))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only those who audit this police station see its audit log.");
        return db.sql("""
                select * from (
                  select 'protected_read' as kind, r.at, u.full_name as who_name, u.rank as who_rank, r.what, null::text as reason, r.fir_id, r.fir_ref
                  from protected_read r join app_user u on u.id = r.reader where r.station_id = :st
                  union all
                  select 'override', o.decided_at, u.full_name, u.rank, o.gap_key, o.reason, f.id, f.fir_year || '/' || f.fir_no
                  from readiness_override o join fir f on f.id = o.fir_id join app_user u on u.id = o.decided_by where f.station_id = :st
                  union all
                  select 'override_withdrawn', o.withdrawn_at, u.full_name, u.rank, o.gap_key, o.withdrawn_reason, f.id, f.fir_year || '/' || f.fir_no
                  from readiness_override o join fir f on f.id = o.fir_id join app_user u on u.id = o.withdrawn_by where f.station_id = :st and o.withdrawn_at is not null
                  union all
                  select 'admin_action', a.at, u.full_name, u.rank, a.action, a.reason, null::uuid, null::text
                  from admin_action a join app_user u on u.id = a.actor_id left join app_user t on t.id = a.user_id
                  where a.station_id = :st or t.station_id = :st
                ) x order by at desc, kind limit :lim offset :off""")
                .param("st", stationId).param("lim", limit).param("off", offset).query().listOfRows();
    }
}
