package in.caseassistant;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.bind.annotation.*;

/**
 * People in a case. Only the case team (the investigating officer, or an SHO/SP) sees real details;
 * everyone else, including requests with no user, reads the masked view (BNS 72).
 * The X-User-Id header is a stand-in until real login is built.
 */
@RestController
class PeopleController {
    private final JdbcClient db;

    PeopleController(JdbcClient db) {
        this.db = db;
    }

    @GetMapping("/api/firs/{firId}/people")
    List<Map<String, Object>> people(@PathVariable UUID firId, @RequestHeader(value = "X-User-Id", required = false) UUID userId) {
        boolean team = userId != null && db.sql("""
                select exists (select 1 from app_user u, fir f
                  where u.id = ? and f.id = ? and (f.io_id = u.id or u.role in ('sho','sp')))""")
                .params(userId, firId).query(Boolean.class).single();
        String sql = team
                ? "select id, role, label, full_name as display_name, phone, address_present, age_years, gender, identity_masked "
                        + "from person where fir_id = ? order by label"
                : "select id, role, label, display_name, phone, address_present, age_years, gender, identity_masked "
                        + "from person_public where fir_id = ? order by label";
        return db.sql(sql).param(firId).query().listOfRows();
    }
}
