package in.caseassistant;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The officer's dashboard (design board 1): the open deadlines of the cases the user is on the team of (the same team
 * that may read a case's deadlines, CaseTeam), soonest first, with counts for the tiles. Nothing here names a person.
 */
@RestController
class DashboardController {
    private final JdbcClient db;
    private final CaseTeam team;

    DashboardController(JdbcClient db, CaseTeam team) {
        this.db = db;
        this.team = team;
    }

    @GetMapping("/api/dashboard")
    Map<String, Object> dashboard(@AuthenticationPrincipal Jwt jwt) {
        UUID me = CaseTeam.user(jwt);
        // the user's reach first (indexed), then the team rule on those FIRs only
        String mine = "select fir.id from fir where " + team.readableFirsSql() + " and " + team.includesSql("fir.id");
        List<UUID> firs = db.sql(mine).params(me, me, me).query(UUID.class).list();
        UUID[] ids = firs.toArray(UUID[]::new);
        var deadlines = db.sql("""
                select d.fir_id, f.fir_no, f.fir_year, d.kind, d.due_on, d.basis, d.due_on - ist_date(now()) as days_left
                from case_deadline d join fir f on f.id = d.fir_id
                where d.fir_id = any(?) and d.due_on is not null order by d.due_on, f.fir_year, f.fir_no limit 50""")
                .param(ids).query().listOfRows();
        long week = deadlines.stream().filter(d -> ((Number) d.get("days_left")).intValue() <= 7).count();
        long notices = db.sql("select count(*) from notice where fir_id = any(?) and status = 'sent'").param(ids).query(Long.class).single();
        var out = new LinkedHashMap<String, Object>();
        out.put("cases", firs.size());
        out.put("due_in_7_days", week);
        out.put("notices_waiting", notices);
        out.put("deadlines", deadlines);
        return out;
    }
}
