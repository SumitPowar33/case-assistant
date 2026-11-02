package in.caseassistant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

/** Findings of the security review of 2 Nov 2026, each kept fixed by a test. Fictional data only. */
@SpringBootTest
@AutoConfigureMockMvc
class HardeningApiTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcClient db;
    @Autowired ObjectMapper json;
    @Autowired JwtEncoder tokens;
    @Autowired PasswordEncoder passwords;
    UUID station, clerkId;
    String clerk, sho, admin;
    /** 35 Devanagari letters: 35 characters, 105 bytes in UTF-8 (a password is checked on its first 72 bytes only). */
    static final String LONG_MARATHI = "पासवर्ड".repeat(5);

    UUID userId(String role, UUID st, String username) {
        return db.sql("insert into app_user (station_id, username, password_hash, full_name, rank, role) values (?,?,?,?,'HC',?) returning id")
                .params(st, username, passwords.encode("fictional-pass-123"), "Fictional " + role, role).query(UUID.class).single();
    }

    @BeforeEach
    void setUp() {
        db.sql("truncate fir, police_station, state_pack, app_user, sign_in_attempt cascade").update();
        db.sql("insert into state_pack (code, name, version, languages) values ('IN','National','1',array['en'])").update();
        station = db.sql("insert into police_station (state_code, district_id, name) values ('IN',district_id_of('IN','North'),'Fictional North PS') returning id").query(UUID.class).single();
        clerkId = userId("front_desk", station, "clerk.one");
        clerk = TestAuth.bearer(tokens, clerkId);
        sho = TestAuth.bearer(tokens, userId("sho", station, "sho.one"));
        admin = TestAuth.bearer(tokens, userId("state_admin", null, "admin.one"));
    }

    ResultActions send(String who, String path, Object body) throws Exception {
        return mvc.perform(post(path).header("Authorization", who).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body)));
    }

    Map<String, Object> complaint(String name, String text) {
        var m = new HashMap<String, Object>();
        m.put("stationId", station);
        m.put("receivedAt", Instant.now().minusSeconds(600).toString());
        m.put("mode", "oral");
        m.put("informantName", name);
        m.put("kind", "cyber_financial_fraud");
        m.put("text", text);
        m.put("textLanguage", "en");
        return m;
    }

    @Test
    void aDatabaseRefusalNeverShowsTheSqlOrTheDatabaseMessage() throws Exception {
        // a NUL character cannot be stored in PostgreSQL text; the answer used to be a 500 quoting the SQL statement
        String body = send(clerk, "/api/complaints", complaint("Fictional\u0000Informant", "Fictional text."))
                .andExpect(status().isBadRequest()).andReturn().getResponse().getContentAsString();
        assertThat(body).doesNotContainIgnoringCase("sql").doesNotContainIgnoringCase("insert into").doesNotContain("UTF8")
                .contains("The database refused");
        assertThat(db.sql("select count(*) from complaint").query(Long.class).single()).isZero();
    }

    @Test
    void anUnexpectedErrorAnswersWithAReferenceOnly() {
        var handler = new ApiErrors();
        var answer = handler.unexpected(new IllegalStateException("secret internal detail from the database driver"));
        assertThat(answer.getStatusCode().value()).isEqualTo(500);
        assertThat(answer.getBody().get("error")).doesNotContain("secret internal detail").contains("Reference");
    }

    @Test
    void aBodyOverOneMegabyteIsRefusedBeforeItIsRead() throws Exception {
        String big = "x".repeat(1_100_000);
        send(clerk, "/api/complaints", complaint("Fictional Informant", big)).andExpect(status().isPayloadTooLarge());
        assertThat(db.sql("select count(*) from complaint").query(Long.class).single()).isZero();
        // the longest complaint text allowed (50,000 letters of an Indian script, 150 KB) still goes in
        send(clerk, "/api/complaints", complaint("Fictional Informant", "\u0915".repeat(50_000))).andExpect(status().isCreated());
    }

    @Test
    void aBodyOfUnknownLengthIsCountedAndStopsAtTheCap() throws Exception {
        var req = new org.springframework.mock.web.MockHttpServletRequest("POST", "/api/complaints") {
            @Override public long getContentLengthLong() { return -1; }   // sent chunked: no length up front
        };
        req.setContent(new byte[(int) BodyLimit.LIMIT + 10]);
        var read = new long[1];
        new BodyLimit().doFilter(req, new org.springframework.mock.web.MockHttpServletResponse(), (r, s) -> {
            var in = r.getInputStream();
            byte[] buf = new byte[8192];
            org.assertj.core.api.Assertions.assertThatThrownBy(() -> { int n; while ((n = in.read(buf, 0, buf.length)) > 0) read[0] += n; })
                    .isInstanceOf(java.io.IOException.class).hasMessageContaining("over");
        });
        assertThat(read[0]).isLessThanOrEqualTo(BodyLimit.LIMIT);
        // the same body with its length given is refused at once
        var told = new org.springframework.mock.web.MockHttpServletRequest("POST", "/api/complaints");
        told.setContent(new byte[(int) BodyLimit.LIMIT + 10]);
        var res = new org.springframework.mock.web.MockHttpServletResponse();
        new BodyLimit().doFilter(told, res, (r, s) -> { throw new AssertionError("must not reach the app"); });
        assertThat(res.getStatus()).isEqualTo(413);
        assertThat(BodyLimit.limitFor("/api/imports")).isEqualTo(BodyLimit.IMPORT_LIMIT);
        assertThat(BodyLimit.limitFor("/api/imports/x/commit")).isEqualTo(BodyLimit.LIMIT);
    }

    @Test
    void anImportFileMayBeLargerThanOtherRequests() throws Exception {
        String csv = "fir_no,year,brief\n" + ("1,2026," + "z".repeat(500) + "\n").repeat(4_000);   // 2 MB in 4,000 rows
        assertThat(csv.length()).isGreaterThan(2_000_000);
        send(sho, "/api/imports/inspect", Map.of("profile", "fir-generic", "csv", csv)).andExpect(status().isOk());
    }

    @Test
    void aPasswordLongerThan72BytesIsRefusedWithAPlainAnswer() throws Exception {
        // bcrypt reads only 72 bytes: 25 Devanagari letters already fill them. It used to be a 500 for a new account and a password change.
        assertThat(LONG_MARATHI.getBytes(java.nio.charset.StandardCharsets.UTF_8).length).isGreaterThan(72);
        var u = Map.of("username", "io.new", "password", LONG_MARATHI, "fullName", "Fictional New IO", "rank", "SI", "role", "io", "stationId", station);
        send(admin, "/api/users", u).andExpect(status().isBadRequest())
                .andExpect(status().reason(org.hamcrest.Matchers.containsString("72 bytes")));
        send(clerk, "/api/me/password", Map.of("currentPassword", "fictional-pass-123", "newPassword", LONG_MARATHI))
                .andExpect(status().isBadRequest()).andExpect(status().reason(org.hamcrest.Matchers.containsString("72 bytes")));
        // a Devanagari password that fits works
        String fits = "पासवर्ड".repeat(3);   // 21 letters, 63 bytes
        send(clerk, "/api/me/password", Map.of("currentPassword", "fictional-pass-123", "newPassword", fits)).andExpect(status().isOk());
    }

    String loginFrom(String address, String username, String password, int expected) throws Exception {
        return mvc.perform(post("/api/login").with(r -> { r.setRemoteAddr(address); return r; }).contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("username", username, "password", password))))
                .andExpect(status().is(expected)).andReturn().getResponse().getContentAsString();
    }

    @Test
    void signingOutEndsTheTokenOnTheServerNotOnlyInTheBrowser() throws Exception {
        String first = "Bearer " + json.readTree(loginFrom("10.1.1.1", "clerk.one", "fictional-pass-123", 200)).get("token").asText();
        String second = "Bearer " + json.readTree(loginFrom("10.1.1.2", "clerk.one", "fictional-pass-123", 200)).get("token").asText();
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/me").header("Authorization", first)).andExpect(status().isOk());
        mvc.perform(post("/api/logout").header("Authorization", first)).andExpect(status().isNoContent());
        // the copied token is dead at once (it used to work for the rest of its 8 hours); the officer's other sign-in is not
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/me").header("Authorization", first)).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/logout").header("Authorization", first)).andExpect(status().isUnauthorized());
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/me").header("Authorization", second)).andExpect(status().isOk());
        assertThat(db.sql("select count(*) from signed_out_token where user_id = ?").param(clerkId).query(Long.class).single()).isOne();
    }

    @Test
    void aTokenWithoutAnIdIsRefused() throws Exception {
        var claims = org.springframework.security.oauth2.jwt.JwtClaimsSet.builder().issuer("case-assistant").subject(clerkId.toString())
                .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(600)).build();
        String noId = tokens.encode(org.springframework.security.oauth2.jwt.JwtEncoderParameters.from(
                org.springframework.security.oauth2.jwt.JwsHeader.with(org.springframework.security.oauth2.jose.jws.MacAlgorithm.HS256).build(), claims)).getTokenValue();
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/me").header("Authorization", "Bearer " + noId))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void oneAddressTryingManyUsernamesIsStopped() throws Exception {
        // a password tried on many accounts from one machine: 5 per username never trips the username lock
        for (int i = 0; i < AuthController.MAX_WRONG_PER_ADDRESS; i++)
            loginFrom("10.6.6.6", "officer" + (i % 10) + ".nobody", "Spring2026!pass", 401);
        String body = loginFrom("10.6.6.6", "clerk.one", "fictional-pass-123", 429);   // even a right password, from there
        assertThat(body).contains("this computer");
        loginFrom("10.7.7.7", "clerk.one", "fictional-pass-123", 200);                  // the officer elsewhere is not locked out
        assertThat(db.sql("select count(*) from sign_in_attempt where client_ip = '10.6.6.6' and outcome = 'locked'").query(Long.class).single()).isOne();
    }

    @Test
    void aUnitSeesItsOwnPolicyChangesHoweverBusyOtherUnitsAre() throws Exception {
        // the list took the newest 200 changes of the whole installation and only then kept the user's own units
        UUID far = db.sql("insert into police_station (state_code, district_id, name) values ('IN',district_id_of('IN','South'),'Fictional South PS') returning id").query(UUID.class).single();
        UUID farSho = userId("sho", far, "sho.far");
        UUID mySho = db.sql("select id from app_user where username = 'sho.one'").query(UUID.class).single();
        db.sql("insert into policy_setting (level, state_code, station_id, key, value, reason, set_by, set_at) values ('station','IN',?,'victim_update_days','30','Fictional order of my station',?, now() - interval '1 day')")
                .params(station, mySho).update();
        for (int i = 0; i < 205; i++)
            db.sql("insert into policy_setting (level, state_code, station_id, key, value, reason, set_by) values ('station','IN',?,'victim_update_days','30','Fictional order of the far station',?)")
                    .params(far, farSho).update();
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/policy-settings").header("Authorization", sho))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].reason").value("Fictional order of my station"));
    }

    @Test
    void aBadQueryParameterIsAPlain400NotA500() throws Exception {
        // limit=abc cannot become an int; it used to reach the unexpected-error handler (500) by its NumberFormatException cause
        String body = mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/firs?limit=abc").header("Authorization", sho))
                .andExpect(status().isBadRequest()).andReturn().getResponse().getContentAsString();
        assertThat(body).doesNotContain("abc").doesNotContainIgnoringCase("exception").contains("parameter");
        // the real range check still answers 400 too, and a good value still works
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/firs?limit=0").header("Authorization", sho)).andExpect(status().isBadRequest());
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/firs?limit=50").header("Authorization", sho)).andExpect(status().isOk());
    }
}
