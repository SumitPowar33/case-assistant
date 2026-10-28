package in.caseassistant;

import com.nimbusds.jose.jwk.source.ImmutableSecret;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.security.web.SecurityFilterChain;

/**
 * Login tokens: HS256 JWTs signed with AUTH_SECRET, valid for one 8-hour shift. The AI gateway checks the
 * same tokens with the same secret. Every request except POST /api/login needs a token, and the user must
 * still be active in the database (so disabling a user takes effect at once). A state single sign-on can
 * later replace the login endpoint by swapping the JwtDecoder; the rest of the app only reads the token.
 */
@Configuration
class SecurityConfig {
    static final Duration TOKEN_LIFE = Duration.ofHours(8);

    @Bean
    SecretKey authKey(@Value("${auth.secret}") String secret) {
        if (secret.length() < 32) throw new IllegalStateException("AUTH_SECRET must be at least 32 characters");
        return new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
    }

    @Bean
    JwtEncoder jwtEncoder(SecretKey key) {
        return new NimbusJwtEncoder(new ImmutableSecret<>(key));
    }

    @Bean
    JwtDecoder jwtDecoder(SecretKey key, JdbcClient db) {
        NimbusJwtDecoder decoder = NimbusJwtDecoder.withSecretKey(key).macAlgorithm(MacAlgorithm.HS256).build();
        decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(JwtValidators.createDefault(), jwt -> {
            boolean ok;
            try {
                // the user must be active, and a token from before the last password change no longer counts
                var changed = db.sql("select password_changed_at from app_user where id = ? and active")
                        .param(UUID.fromString(jwt.getSubject())).query().listOfRows();
                ok = !changed.isEmpty() && (changed.get(0).get("password_changed_at") == null
                        || Objects.equals(passwordStamp((java.sql.Timestamp) changed.get(0).get("password_changed_at")),
                                jwt.getClaim(PASSWORD_STAMP) instanceof Number n ? n.longValue() : null));
            } catch (IllegalArgumentException | NullPointerException e) {
                ok = false;
            }
            return ok ? OAuth2TokenValidatorResult.success()
                    : OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token", "user is not active or the password has changed", null));
        }));
        return decoder;
    }

    @Bean
    PasswordEncoder passwordEncoder() {
        return PasswordEncoderFactories.createDelegatingPasswordEncoder();
    }

    @Bean
    SecurityFilterChain api(HttpSecurity http) throws Exception {
        return http
                .csrf(c -> c.disable()) // bearer tokens in a header, no cookies: nothing for CSRF to ride on
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(a -> a
                        .requestMatchers(HttpMethod.POST, "/api/login").permitAll()
                        .requestMatchers("/error").permitAll()
                        .anyRequest().authenticated())
                .oauth2ResourceServer(o -> o.jwt(Customizer.withDefaults()))
                .build();
    }

    /** Claim naming the password the token was issued under (when the password was last changed). */
    static final String PASSWORD_STAMP = "pwd";

    static Long passwordStamp(java.sql.Timestamp changedAt) {
        return changedAt == null ? null : changedAt.toInstant().toEpochMilli();
    }

    static String issue(JwtEncoder encoder, UUID userId, String role, String name) {
        return issue(encoder, userId, role, name, null);
    }

    static String issue(JwtEncoder encoder, UUID userId, String role, String name, java.sql.Timestamp passwordChangedAt) {
        return issue(encoder, userId, role, name, passwordChangedAt, TOKEN_LIFE);
    }

    /** {@code life} comes from the unit's "session_hours" policy (see {@link Policies}); never longer than TOKEN_LIFE. */
    static String issue(JwtEncoder encoder, UUID userId, String role, String name, java.sql.Timestamp passwordChangedAt, Duration life) {
        Instant now = Instant.now();
        var builder = JwtClaimsSet.builder().issuer("case-assistant").subject(userId.toString())
                .issuedAt(now).expiresAt(now.plus(life.compareTo(TOKEN_LIFE) > 0 ? TOKEN_LIFE : life)).claim("role", role).claim("name", name);
        if (passwordChangedAt != null) builder.claim(PASSWORD_STAMP, passwordStamp(passwordChangedAt));
        JwtClaimsSet claims = builder.build();
        return encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims)).getTokenValue();
    }
}
