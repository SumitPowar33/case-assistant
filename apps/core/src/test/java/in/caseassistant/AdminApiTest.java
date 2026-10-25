package in.caseassistant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Map;
import java.util.UUID;
import org.hamcrest.Matchers;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

/** State admin screens: accounts, stations, unlock, admin log. Fictional users, stations and passwords only. */
@SpringBootTest
@AutoConfigureMockMvc
class AdminApiTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcClient db;
    @Autowired ObjectMapper json;
    @Autowired AuthController auth;
    static final String ADMIN_PW = "fictional-admin-pass-1";
    static final String IO_PW = "fictional-io-pass-22";
    static final String REASON = "{\"reason\":\"Fictional officer transferred out\"}";
    String admin;
    UUID station;

    @BeforeEach
    void setUp() throws Exception {
        db.sql("truncate fir, police_station, state_pack, app_user cascade").update();
        db.sql("insert into state_pack (code, name, version, languages) values ('IN','National','1',array['en'])").update();
        auth.ensureAdmin("admin.one", ADMIN_PW);
        admin = "Bearer " + token("admin.one", ADMIN_PW);
        station = UUID.fromString(json.readTree(post(admin, "/api/stations",
                        "{\"stateCode\":\"IN\",\"district\":\"Demo District\",\"name\":\"Demo Cyber PS\",\"cctnsCode\":\"DEMO-01\"}")
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asText());
    }

    ResultActions post(String bearer, String path, String body) throws Exception {
        return mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post(path)
                .header("Authorization", bearer).contentType(MediaType.APPLICATION_JSON).content(body));
    }

    int login(String user, String pw) throws Exception {
        return mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/login")
                        .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(Map.of("username", user, "password", pw))))
                .andReturn().getResponse().getStatus();
    }

    String token(String user, String pw) throws Exception {
        return json.readTree(mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/login")
                        .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(Map.of("username", user, "password", pw))))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).get("token").asText();
    }

    UUID createIo() throws Exception {
        String body = """
                {"username":"si.fictional","password":"%s","fullName":"SI Fictional","rank":"SI","role":"io","stationId":"%s"}"""
                .formatted(IO_PW, station);
        return UUID.fromString(json.readTree(post(admin, "/api/users", body).andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString()).get("id").asText());
    }

    @Test
    void stationRolesNeedAStationAndOnlyTheAdminCreatesStations() throws Exception {
        post(admin, "/api/users", """
                {"username":"si.nostation","password":"%s","fullName":"SI None","rank":"SI","role":"io"}""".formatted(IO_PW))
                .andExpect(status().isBadRequest()).andExpect(status().reason("Choose the police station for this role."));
        post(admin, "/api/users", """
                {"username":"si.badrole","password":"%s","fullName":"SI Bad","rank":"SI","role":"king","stationId":"%s"}"""
                .formatted(IO_PW, station)).andExpect(status().isBadRequest());
        post(admin, "/api/users", """
                {"username":"si.ghost","password":"%s","fullName":"SI Ghost","rank":"SI","role":"io","stationId":"%s"}"""
                .formatted(IO_PW, UUID.randomUUID())).andExpect(status().isBadRequest());
        createIo();
        String io = "Bearer " + token("si.fictional", IO_PW);
        post(io, "/api/stations", "{\"stateCode\":\"IN\",\"district\":\"D\",\"name\":\"Other PS\"}").andExpect(status().isForbidden());
        post(admin, "/api/stations", "{\"stateCode\":\"MH\",\"district\":\"D\",\"name\":\"Unknown state PS\"}").andExpect(status().isBadRequest());
        post(admin, "/api/stations", "{\"stateCode\":\"IN\",\"district\":\"D\",\"name\":\"Same code\",\"cctnsCode\":\"DEMO-01\"}")
                .andExpect(status().isBadRequest());
        // any signed-in user may list stations and state packs; only the admin lists users
        mvc.perform(get("/api/stations").header("Authorization", io)).andExpect(jsonPath("$[*].name").value(Matchers.contains("Demo Cyber PS")));
        mvc.perform(get("/api/state-packs").header("Authorization", io)).andExpect(jsonPath("$[0].code").value("IN"));
        mvc.perform(get("/api/users").header("Authorization", io)).andExpect(status().isForbidden());
        mvc.perform(get("/api/admin-actions").header("Authorization", io)).andExpect(status().isForbidden());
        String users = mvc.perform(get("/api/users").header("Authorization", admin)).andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.username=='si.fictional')].station_name").value("Demo Cyber PS"))
                .andReturn().getResponse().getContentAsString();
        assertThat(users).doesNotContain("password_hash").doesNotContain("bcrypt");
    }

    @Test
    void disablingEndsTokensForGoodAndEnablingNeedsAFreshSignIn() throws Exception {
        UUID io = createIo();
        String old = "Bearer " + token("si.fictional", IO_PW);
        post(admin, "/api/users/" + io + "/disable", "{\"reason\":\"short\"}").andExpect(status().isBadRequest());
        post(old, "/api/users/" + io + "/disable", REASON).andExpect(status().isForbidden());
        post(admin, "/api/users/" + io + "/disable", REASON).andExpect(status().isNoContent());
        post(admin, "/api/users/" + io + "/disable", REASON).andExpect(status().isConflict());
        mvc.perform(get("/api/me").header("Authorization", old)).andExpect(status().isUnauthorized());
        assertThat(login("si.fictional", IO_PW)).isEqualTo(401);
        post(admin, "/api/users/" + io + "/enable", REASON).andExpect(status().isNoContent());
        post(admin, "/api/users/" + io + "/enable", REASON).andExpect(status().isConflict());
        // the token from before the account was disabled stays dead; a new sign-in works
        mvc.perform(get("/api/me").header("Authorization", old)).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/me").header("Authorization", "Bearer " + token("si.fictional", IO_PW))).andExpect(status().isOk());
        post(admin, "/api/users/" + UUID.randomUUID() + "/enable", REASON).andExpect(status().isNotFound());
    }

    @Test
    void theAdminCannotDisableThemselves() throws Exception {
        UUID me = db.sql("select id from app_user where username = 'admin.one'").query(UUID.class).single();
        post(admin, "/api/users/" + me + "/disable", REASON).andExpect(status().isConflict())
                .andExpect(status().reason("You cannot disable your own account."));
        assertThat(db.sql("select active from app_user where id = ?").param(me).query(Boolean.class).single()).isTrue();
    }

    @Test
    void unlockEndsALockOnlyWhenThereIsOne() throws Exception {
        UUID io = createIo();
        post(admin, "/api/users/" + io + "/unlock", REASON).andExpect(status().isConflict());
        for (int i = 0; i < 5; i++) assertThat(login("si.fictional", "not-the-password")).isEqualTo(401);
        assertThat(login("si.fictional", IO_PW)).isEqualTo(429);
        mvc.perform(get("/api/users").header("Authorization", admin))
                .andExpect(jsonPath("$[?(@.username=='si.fictional')].locked_until").value(Matchers.contains(Matchers.notNullValue())));
        post(admin, "/api/users/" + io + "/unlock", REASON).andExpect(status().isNoContent());
        assertThat(login("si.fictional", IO_PW)).isEqualTo(200);
        mvc.perform(get("/api/sign-ins").param("username", "si.fictional").header("Authorization", admin))
                .andExpect(jsonPath("$[0:2].outcome").value(Matchers.contains("ok", "unlocked_by_admin")));
    }

    @Test
    void everyAdminChangeIsLoggedWithItsReasonAndKeptAsWritten() throws Exception {
        UUID io = createIo();
        post(admin, "/api/users/" + io + "/disable", REASON).andExpect(status().isNoContent());
        mvc.perform(get("/api/admin-actions").header("Authorization", admin))
                .andExpect(jsonPath("$[*].action").value(Matchers.contains("user_disabled", "user_created", "station_created")))
                .andExpect(jsonPath("$[0].reason").value("Fictional officer transferred out"))
                .andExpect(jsonPath("$[0].actor_name").value("State Admin"))
                .andExpect(jsonPath("$[0].username").value("si.fictional"))
                .andExpect(jsonPath("$[2].station_name").value("Demo Cyber PS"));
        assertThatThrownBy(() -> db.sql("update admin_action set reason = 'changed later'").update()).hasMessageContaining("kept as written");
        assertThatThrownBy(() -> db.sql("delete from admin_action").update()).hasMessageContaining("kept as written");
    }
}
