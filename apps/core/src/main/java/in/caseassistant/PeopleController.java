package in.caseassistant;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

/**
 * People in a case. Only the case team (see {@link CaseTeam}) sees real details; everyone else,
 * reads the masked view (BNS 72, POCSO 23).
 */
@RestController
class PeopleController {
    private final JdbcClient db;
    private final CaseTeam team;

    PeopleController(JdbcClient db, CaseTeam team) {
        this.db = db;
        this.team = team;
    }

    @GetMapping("/api/firs/{firId}/people")
    List<Map<String, Object>> people(@PathVariable UUID firId, @AuthenticationPrincipal Jwt jwt) {
        String sql = team.includes(CaseTeam.user(jwt), firId)
                ? "select id, role, label, full_name as display_name, phone, address_present, age_years, gender, "
                        + "person_masked(role, identity_masked, fir_id) as identity_masked from person where fir_id = ? order by label"
                : "select id, role, label, display_name, phone, address_present, age_years, gender, identity_masked "
                        + "from person_public where fir_id = ? order by label";
        return db.sql(sql).param(firId).query().listOfRows();
    }
}
