package in.caseassistant;

import java.util.UUID;
import org.springframework.security.oauth2.jwt.JwtEncoder;

/** Real signed tokens for tests, made the same way as at login. */
final class TestAuth {
    private TestAuth() {}

    static String bearer(JwtEncoder encoder, UUID userId) {
        return "Bearer " + SecurityConfig.issue(encoder, userId, "test", "Fictional Test User");
    }
}
