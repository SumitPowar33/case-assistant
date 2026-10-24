package in.caseassistant;

import com.nimbusds.jose.jwk.source.ImmutableSecret;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
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
            boolean active;
            try {
                active = db.sql("select exists (select 1 from app_user where id = ? and active)")
                        .param(UUID.fromString(jwt.getSubject())).query(Boolean.class).single();
            } catch (IllegalArgumentException | NullPointerException e) {
                active = false;
            }
            return active ? OAuth2TokenValidatorResult.success()
                    : OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token", "user is not active", null));
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

    static String issue(JwtEncoder encoder, UUID userId, String role, String name) {
        Instant now = Instant.now();
        JwtClaimsSet claims = JwtClaimsSet.builder().issuer("case-assistant").subject(userId.toString())
                .issuedAt(now).expiresAt(now.plus(TOKEN_LIFE)).claim("role", role).claim("name", name).build();
        return encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims)).getTokenValue();
    }
}
