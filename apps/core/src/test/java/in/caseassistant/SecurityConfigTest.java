package in.caseassistant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

/** The sign-in key (CLAUDE.md: it comes from the environment): the application does not start with a short one. */
class SecurityConfigTest {
    @Test
    void aSigningKeyShorterThanThirtyTwoCharactersIsRefused() {
        var config = new SecurityConfig();
        for (String weak : new String[] {"", "secret", "x".repeat(31)})
            assertThatThrownBy(() -> config.authKey(weak)).isInstanceOf(IllegalStateException.class).hasMessageContaining("at least 32 characters")
                    .hasMessageNotContaining("secret");
        assertThat(config.authKey("x".repeat(32)).getAlgorithm()).isEqualTo("HmacSHA256");
    }
}
