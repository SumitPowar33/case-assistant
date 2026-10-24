package in.caseassistant;

import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * The case team is the FIR's investigating officer, or an SHO/SP. Only they see protected victim details
 * (BNS 72, POCSO 23). A missing user is never on the team. The X-User-Id header stands in for login.
 */
@Component
class CaseTeam {
    private final JdbcClient db;

    CaseTeam(JdbcClient db) {
        this.db = db;
    }

    boolean includes(UUID userId, UUID firId) {
        return userId != null && db.sql("""
                select exists (select 1 from app_user u, fir f
                  where u.id = ? and f.id = ? and (f.io_id = u.id or u.role in ('sho','sp')))""")
                .params(userId, firId).query(Boolean.class).single();
    }

    boolean identityProtected(UUID firId) {
        return db.sql("select identity_protected_case(?)").param(firId).query(Boolean.class).single();
    }
}
