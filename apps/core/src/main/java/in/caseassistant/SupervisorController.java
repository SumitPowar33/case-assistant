package in.caseassistant;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * Supervisor review (design board 11): the open cases of the supervisor's reach (the SHO's station, the SP's district)
 * by the nearest deadline, with the gaps still open in the readiness check and whether a final report waits for their
 * decision. It lists facts from the files; it scores no officer and no case. Needs the permission
 * {@code chargesheet.approve}; the cases are exactly those the user may read as case team (CaseTeam).
 */
@RestController
class SupervisorController {
    static final String APPROVE = "chargesheet.approve";
    private static final int LIMIT = 50;

    private final JdbcClient db;
    private final CaseTeam team;
    private final ReadinessController readiness;

    SupervisorController(JdbcClient db, CaseTeam team, ReadinessController readiness) {
        this.db = db;
        this.team = team;
        this.readiness = readiness;
    }

    @GetMapping("/api/supervisor")
    Map<String, Object> queue(@AuthenticationPrincipal Jwt jwt) {
        UUID me = CaseTeam.user(jwt);
        if (!team.can(me, APPROVE)) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only a supervisor can review the cases of a station.");
        var rows = db.sql("""
                select fir.id, fir.fir_no, fir.fir_year, fir.station_id, io.full_name as io_name, io.rank as io_rank,
                       (select coalesce(string_agg(s.act || ' ' || s.section, ', ' order by s.act, s.section), '') from fir_section s where s.fir_id = fir.id) as sections,
                       d.kind as deadline_kind, d.due_on, d.due_on - ist_date(now()) as days_left,
                       r.status as report_status, r.submitted_by
                from fir left join app_user io on io.id = fir.io_id
                left join lateral (select kind, due_on from case_deadline where fir_id = fir.id and due_on is not null order by due_on limit 1) d on true
                left join final_report_draft r on r.fir_id = fir.id
                where %s and %s and coalesce(r.status, '') <> 'signed'
                order by d.due_on nulls last, fir.fir_year, fir.fir_no limit %d""".formatted(team.readableFirsSql(), team.includesSql("fir.id"), LIMIT))
                .params(me, me, me).query().listOfRows();
        var cases = new ArrayList<Map<String, Object>>();
        long waiting = 0, soon = 0;
        for (var r : rows) {
            var c = new LinkedHashMap<String, Object>(r);
            UUID id = (UUID) r.get("id");
            c.put("open_gaps", readiness.openGaps(id));
            boolean submitted = "submitted".equals(r.get("report_status"));
            // the same rule as the decision itself: never the officer who submitted, and only where the role reaches the station
            boolean mayDecide = submitted && !me.equals(r.get("submitted_by")) && team.canAt(me, APPROVE, (UUID) r.get("station_id"));
            c.put("can_decide", mayDecide);
            c.remove("submitted_by");
            c.remove("station_id");
            if (submitted) waiting++;
            if (r.get("days_left") != null && ((Number) r.get("days_left")).intValue() <= 21) soon++;
            cases.add(c);
        }
        var out = new LinkedHashMap<String, Object>();
        out.put("waiting_approval", waiting);
        out.put("due_in_21_days", soon);
        out.put("cases", cases);
        return out;
    }
}
