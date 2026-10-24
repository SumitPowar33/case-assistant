package in.caseassistant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.test.web.servlet.MockMvc;

/** Fictional users and passwords only. */
@SpringBootTest
@AutoConfigureMockMvc
class AuthApiTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcClient db;
    @Autowired ObjectMapper json;
    @Autowired AuthController auth;
    @Autowired JwtEncoder tokens;
    static final String ADMIN_PW = "fictional-admin-pass-1";

    @BeforeEach
    void setUp() {
        db.sql("truncate fir, police_station, state_pack, app_user cascade").update();
        auth.ensureAdmin("Admin.One", ADMIN_PW);
    }

    String login(String user, String pw, int expected) throws Exception {
        return mvc.perform(post("/api/login").contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(java.util.Map.of("username", user, "password", pw))))
                .andExpect(status().is(expected)).andReturn().getResponse().getContentAsString();
    }

    @Test
    void loginGivesATokenThatOpensTheApi() throws Exception {
        var body = json.readTree(login("admin.one", ADMIN_PW, 200));
        assertThat(body.at("/user/role").asText()).isEqualTo("state_admin");
        assertThat(body.at("/user/password_hash").isMissingNode()).isTrue();
        String token = "Bearer " + body.get("token").asText();
        mvc.perform(get("/api/me").header("Authorization", token)).andExpect(jsonPath("$.username").value("admin.one"));
        mvc.perform(get("/api/me")).andExpect(status().isUnauthorized());
    }

    @Test
    void wrongPasswordUnknownUserAndInactiveUserGetTheSameAnswer() throws Exception {
        String wrong = login("admin.one", "not-the-password", 401);
        assertThat(login("nobody.here", ADMIN_PW, 401)).isEqualTo(wrong);
        db.sql("update app_user set active = false").update();
        assertThat(login("admin.one", ADMIN_PW, 401)).isEqualTo(wrong);
        login("", "", 400);
    }

    @Test
    void onlyTheStateAdminCreatesUsersAndTheyCanSignIn() throws Exception {
        String admin = "Bearer " + json.readTree(login("admin.one", ADMIN_PW, 200)).get("token").asText();
        String user = """
                {"username":"si.fictional","password":"fictional-io-pass-22","fullName":"SI Fictional","rank":"SI","role":"io"}""";
        mvc.perform(post("/api/users").header("Authorization", admin).contentType(MediaType.APPLICATION_JSON).content(user))
                .andExpect(status().isCreated());
        mvc.perform(post("/api/users").header("Authorization", admin).contentType(MediaType.APPLICATION_JSON).content(user))
                .andExpect(status().isBadRequest()); // same username twice
        mvc.perform(post("/api/users").header("Authorization", admin).contentType(MediaType.APPLICATION_JSON)
                .content(user.replace("si.fictional", "si.short").replace("fictional-io-pass-22", "short")))
                .andExpect(status().isBadRequest());
        String io = "Bearer " + json.readTree(login("si.fictional", "fictional-io-pass-22", 200)).get("token").asText();
        mvc.perform(post("/api/users").header("Authorization", io).contentType(MediaType.APPLICATION_JSON)
                .content(user.replace("si.fictional", "si.second"))).andExpect(status().isForbidden());
        String hash = db.sql("select password_hash from app_user where username = 'si.fictional'").query(String.class).single();
        assertThat(hash).startsWith("{bcrypt}").doesNotContain("fictional-io-pass-22");
    }

    @Test
    void forgedExpiredOrUnknownUserTokensAreRefused() throws Exception {
        UUID admin = db.sql("select id from app_user").query(UUID.class).single();
        var other = new NimbusJwtEncoder(new com.nimbusds.jose.jwk.source.ImmutableSecret<>(
                new javax.crypto.spec.SecretKeySpec("another-key-another-key-another-key!".getBytes(), "HmacSHA256")));
        var claims = JwtClaimsSet.builder().subject(admin.toString()).expiresAt(Instant.now().plusSeconds(600)).build();
        var header = JwsHeader.with(MacAlgorithm.HS256).build();
        String forged = other.encode(JwtEncoderParameters.from(header, claims)).getTokenValue();
        var expired = JwtClaimsSet.builder().subject(admin.toString()).issuedAt(Instant.now().minusSeconds(40000))
                .expiresAt(Instant.now().minusSeconds(3600)).build();
        String old = tokens.encode(JwtEncoderParameters.from(header, expired)).getTokenValue();
        for (String t : new String[] {forged, old, TestAuth.bearer(tokens, UUID.randomUUID()).substring(7), "not.a.token"}) {
            mvc.perform(get("/api/me").header("Authorization", "Bearer " + t)).andExpect(status().isUnauthorized());
        }
        mvc.perform(get("/api/me").header("Authorization", TestAuth.bearer(tokens, admin))).andExpect(status().isOk());
    }

    @Test
    void bootstrapNeedsALongPasswordAndNeverOverwrites() {
        assertThatThrownBy(() -> auth.ensureAdmin("admin.two", "short")).isInstanceOf(IllegalStateException.class);
        String before = db.sql("select password_hash from app_user").query(String.class).single();
        auth.ensureAdmin("admin.one", "a-different-long-password");
        assertThat(db.sql("select password_hash from app_user").query(String.class).single()).isEqualTo(before);
        auth.ensureAdmin("", "");
        assertThat(db.sql("select count(*) from app_user").query(Long.class).single()).isEqualTo(1);
    }

    @Test
    void fiveWrongPasswordsLockTheUsernameForFifteenMinutesKnownOrNot() throws Exception {
        for (int i = 0; i < 5; i++) login("admin.one", "not-the-password", 401);
        var locked = mvc.perform(post("/api/login").contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(java.util.Map.of("username", "ADMIN.ONE", "password", ADMIN_PW))))
                .andExpect(status().isTooManyRequests()).andReturn().getResponse();
        assertThat(locked.getContentAsString()).contains("Try again after").contains("IST");
        assertThat(Integer.parseInt(locked.getHeader("Retry-After"))).isBetween(1, 900);
        // unknown usernames lock the same way, so the lock does not show which accounts exist
        for (int i = 0; i < 5; i++) login("nobody.here", "guess-" + i, 401);
        login("nobody.here", "guess-6", 429);
        // attempts made while locked do not count; older wrong passwords have expired
        db.sql("truncate sign_in_attempt").update();
        for (int i = 0; i < 5; i++)
            db.sql("insert into sign_in_attempt (username_tried, outcome, at) values ('admin.one','wrong_password', now() - interval '20 minutes')").update();
        db.sql("insert into sign_in_attempt (username_tried, outcome) values ('admin.one','locked')").update();
        login("admin.one", ADMIN_PW, 200);
    }

    @Test
    void aSuccessfulSignInClearsEarlierWrongPasswords() throws Exception {
        for (int i = 0; i < 4; i++) login("admin.one", "not-the-password", 401);
        login("admin.one", ADMIN_PW, 200);
        for (int i = 0; i < 4; i++) login("admin.one", "not-the-password", 401);
        login("admin.one", ADMIN_PW, 200);
    }

    @Test
    void everyAttemptIsLoggedWithoutThePasswordAndOnlyTheAdminReadsTheLog() throws Exception {
        login("admin.one", "not-the-password", 401);
        String admin = "Bearer " + json.readTree(login("admin.one", ADMIN_PW, 200)).get("token").asText();
        String log = mvc.perform(get("/api/sign-ins").param("username", " Admin.One ").header("Authorization", admin))
                .andExpect(status().isOk()).andExpect(jsonPath("$[*].outcome").value(org.hamcrest.Matchers.contains("ok", "wrong_password")))
                .andReturn().getResponse().getContentAsString();
        assertThat(log).doesNotContain("not-the-password").doesNotContain(ADMIN_PW);
        UUID io = db.sql("insert into app_user (full_name, rank, role) values ('SI Fictional','SI','io') returning id").query(UUID.class).single();
        mvc.perform(get("/api/sign-ins").header("Authorization", TestAuth.bearer(tokens, io))).andExpect(status().isForbidden());
        assertThatThrownBy(() -> db.sql("delete from sign_in_attempt").update()).hasMessageContaining("kept as written");
    }

    @Test
    void changingThePasswordEndsEveryOlderToken() throws Exception {
        String old = "Bearer " + json.readTree(login("admin.one", ADMIN_PW, 200)).get("token").asText();
        String change = "{\"currentPassword\":\"%s\",\"newPassword\":\"%s\"}";
        String newPw = "fictional-admin-pass-2";
        mvc.perform(post("/api/me/password").header("Authorization", old).contentType(MediaType.APPLICATION_JSON)
                .content(change.formatted("wrong-current-pass", newPw))).andExpect(status().isForbidden());
        mvc.perform(post("/api/me/password").header("Authorization", old).contentType(MediaType.APPLICATION_JSON)
                .content(change.formatted(ADMIN_PW, "short"))).andExpect(status().isBadRequest());
        mvc.perform(post("/api/me/password").header("Authorization", old).contentType(MediaType.APPLICATION_JSON)
                .content(change.formatted(ADMIN_PW, ADMIN_PW))).andExpect(status().isBadRequest());
        String fresh = "Bearer " + json.readTree(mvc.perform(post("/api/me/password").header("Authorization", old)
                .contentType(MediaType.APPLICATION_JSON).content(change.formatted(ADMIN_PW, newPw)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).get("token").asText();
        mvc.perform(get("/api/me").header("Authorization", old)).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/me").header("Authorization", fresh)).andExpect(status().isOk());
        login("admin.one", ADMIN_PW, 401);
        String again = "Bearer " + json.readTree(login("admin.one", newPw, 200)).get("token").asText();
        mvc.perform(get("/api/me").header("Authorization", again)).andExpect(status().isOk());
        assertThat(db.sql("select outcome from sign_in_attempt order by at").query(String.class).list())
                .containsExactly("ok", "wrong_current_password", "password_changed", "wrong_password", "ok");
    }
}
