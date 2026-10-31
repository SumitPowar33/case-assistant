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
    @Autowired Modules modules;
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

    /** Regression (found by the browser test, 30 Oct 2026): a fresh installation had no state_pack rows, so no station could be added. */
    @Test
    void theModulesOfThePacksAreStatePacksFromStartUp() throws Exception {
        db.sql("truncate fir, police_station, state_pack, app_user cascade").update();
        modules.sync();
        modules.sync();   // again at the next start: no duplicate, status kept
        assertThat(db.sql("select code || ' ' || status || ' ' || array_to_string(languages, ',') from state_pack").query(String.class).list())
                .containsExactlyInAnyOrder("IN draft en,hi,mr,gu,bn,pa,or,ta,te,kn,ml", "MH draft mr,en,hi");
        auth.ensureAdmin("admin.one", ADMIN_PW);
        admin = "Bearer " + token("admin.one", ADMIN_PW);
        post(admin, "/api/stations", "{\"stateCode\":\"IN\",\"district\":\"Demo District\",\"name\":\"Demo Fresh PS\"}")
                .andExpect(status().isCreated());
        mvc.perform(get("/api/state-packs").header("Authorization", admin))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].code").value("IN")).andExpect(jsonPath("$[0].name").value("National (BNSS, BNS, BSA)"));
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

    /**
     * An admin's station decides their state. A new or promoted admin without one would manage every state, so it is
     * refused; only the first account (from BOOTSTRAP_ADMIN_*) has no station.
     */
    @Test
    void anAdminAlwaysNeedsAStationSoNoSecondAllStateAdminCanBeMade() throws Exception {
        String admin2 = "{\"username\":\"admin.two\",\"password\":\"fictional-admin-pass-2\",\"fullName\":\"Admin Two\",\"rank\":\"Admin\",\"role\":\"state_admin\"%s}";
        for (String noStation : new String[] {"", ",\"stationId\":null"})
            post(admin, "/api/users", admin2.formatted(noStation)).andExpect(status().isBadRequest())
                    .andExpect(status().reason(Matchers.containsString("would manage every state")));
        // a prosecutor needs no station and holds no admin permission: still allowed without one
        post(admin, "/api/users", """
                {"username":"pp.one","password":"%s","fullName":"PP One","rank":"APP","role":"prosecutor"}""".formatted(IO_PW))
                .andExpect(status().isCreated());
        UUID io = createIo();
        var promote = org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put("/api/users/" + io).header("Authorization", admin)
                .contentType(MediaType.APPLICATION_JSON);
        mvc.perform(promote.content("{\"role\":\"state_admin\",\"rank\":\"Admin\",\"stationId\":null,\"reason\":\"Fictional posting order 7\"}"))
                .andExpect(status().isBadRequest());
        assertThat(db.sql("select role || ' ' || (station_id is not null) from app_user where id = ?").param(io).query(String.class).single())
                .isEqualTo("io true");
        mvc.perform(promote.content("{\"role\":\"state_admin\",\"rank\":\"Admin\",\"stationId\":\"%s\",\"reason\":\"Fictional posting order 7\"}"
                .formatted(station))).andExpect(status().isOk());
        assertThat(db.sql("select count(*) from app_user where station_id is null and role = 'state_admin'").query(Long.class).single()).isEqualTo(1);
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

    ResultActions put(String bearer, String path, String body) throws Exception {
        return mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put(path)
                .header("Authorization", bearer).contentType(MediaType.APPLICATION_JSON).content(body));
    }

    @Test
    void aTransferChangesRoleOrStationWithAReasonLogsItAndEndsOldTokens() throws Exception {
        UUID io = createIo();
        String old = "Bearer " + token("si.fictional", IO_PW);
        UUID other = UUID.fromString(json.readTree(post(admin, "/api/stations",
                        "{\"stateCode\":\"IN\",\"district\":\"Demo District\",\"name\":\"Demo City PS\"}")
                .andReturn().getResponse().getContentAsString()).get("id").asText());
        db.sql("""
                insert into fir (station_id, fir_year, fir_no, gd_entry_no, registered_at, information_received_at,
                  contents_original, contents_language, action_taken, io_id)
                values (?,2026,7,'GD-1',now(),now(),'Fictional complaint','en','investigate',?)""").params(station, io).update();
        String change = "{\"role\":\"%s\",\"rank\":\"%s\",\"stationId\":%s,\"reason\":\"%s\"}";
        String to = "\"" + other + "\"";
        put(admin, "/api/users/" + io, change.formatted("sho", "PI", to, "short")).andExpect(status().isBadRequest());
        put(admin, "/api/users/" + io, change.formatted("sho", "PI", "null", "Fictional transfer order 12")).andExpect(status().isBadRequest())
                .andExpect(status().reason("Choose the police station for this role."));
        put(admin, "/api/users/" + io, change.formatted("sho", "PI", "\"" + UUID.randomUUID() + "\"", "Fictional transfer order 12"))
                .andExpect(status().isBadRequest());
        put(old, "/api/users/" + io, change.formatted("sho", "PI", to, "Fictional transfer order 12")).andExpect(status().isForbidden());
        put(admin, "/api/users/" + io, change.formatted("io", "SI", "\"" + station + "\"", "Fictional transfer order 12"))
                .andExpect(status().isConflict()).andExpect(status().reason("Nothing to change."));
        put(admin, "/api/users/" + UUID.randomUUID(), change.formatted("io", "SI", to, "Fictional transfer order 12")).andExpect(status().isNotFound());
        put(admin, "/api/users/" + io, change.formatted("sho", "PI", to, "Fictional transfer order 12")).andExpect(status().isOk())
                .andExpect(jsonPath("$.changed").value("role io to sho; rank SI to PI; station Demo Cyber PS to Demo City PS"))
                .andExpect(jsonPath("$.firsAsIo").value(1));
        mvc.perform(get("/api/me").header("Authorization", old)).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/me").header("Authorization", "Bearer " + token("si.fictional", IO_PW)))
                .andExpect(jsonPath("$.role").value("sho"));
        mvc.perform(get("/api/admin-actions").header("Authorization", admin))
                .andExpect(jsonPath("$[0].action").value("user_changed"))
                .andExpect(jsonPath("$[0].reason").value("Fictional transfer order 12"))
                .andExpect(jsonPath("$[0].detail").value("role io to sho; rank SI to PI; station Demo Cyber PS to Demo City PS"));
        // a state admin keeps the station given, so stays inside that state; the admin cannot change their own account
        put(admin, "/api/users/" + io, change.formatted("state_admin", "PI", to, "Fictional posting to headquarters")).andExpect(status().isOk())
                .andExpect(jsonPath("$.changed").value("role sho to state_admin"));
        UUID me = db.sql("select id from app_user where username = 'admin.one'").query(UUID.class).single();
        put(admin, "/api/users/" + me, change.formatted("io", "SI", to, "Fictional change of own role")).andExpect(status().isConflict());
    }

    @Test
    void anUnknownRoleIsRefusedAndTheRoleListComesFromThePacks() throws Exception {
        post(admin, "/api/users", ("{\"username\":\"who.is\",\"password\":\"fictional-io-pass-22\",\"fullName\":\"Fictional Who\","
                + "\"rank\":\"SI\",\"role\":\"wizard\",\"stationId\":\"%s\"}").formatted(station)).andExpect(status().isBadRequest());
        mvc.perform(get("/api/roles").header("Authorization", admin)).andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(7))
                .andExpect(jsonPath("$[?(@.code=='sho')].station_required").value(true))
                .andExpect(jsonPath("$[?(@.code=='state_admin')].permissions[*]").value(Matchers.hasItem("admin.manage")));
        post(admin, "/api/users", ("{\"username\":\"io.plain\",\"password\":\"fictional-io-pass-22\",\"fullName\":\"SI Fictional Plain\","
                + "\"rank\":\"SI\",\"role\":\"io\",\"stationId\":\"%s\"}").formatted(station)).andExpect(status().isCreated());
        mvc.perform(get("/api/roles").header("Authorization", "Bearer " + token("io.plain", IO_PW))).andExpect(status().isForbidden());
    }

    /** A state admin (one with a station) works only in their own state; the platform admin (no station) works in all. */
    @Test
    void aStateAdminCannotTouchAnotherStatesAccountsOrStations() throws Exception {
        db.sql("insert into state_pack (code, name, version, languages) values ('MH','Maharashtra','1',array['mr'])").update();
        UUID mhStation = UUID.fromString(json.readTree(post(admin, "/api/stations",
                "{\"stateCode\":\"MH\",\"district\":\"Demo District\",\"name\":\"Demo MH PS\"}")
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asText());
        String ioBody = "{\"username\":\"%s\",\"password\":\"fictional-io-pass-22\",\"fullName\":\"SI Fictional %s\",\"rank\":\"SI\",\"role\":\"io\",\"stationId\":\"%s\"}";
        post(admin, "/api/users", ioBody.formatted("io.in", "In", station)).andExpect(status().isCreated());
        UUID mhIo = UUID.fromString(json.readTree(post(admin, "/api/users", ioBody.formatted("io.mh", "Mh", mhStation))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asText());
        post(admin, "/api/users", ("{\"username\":\"admin.in\",\"password\":\"fictional-admin-pass-2\",\"fullName\":\"Admin Fictional In\","
                + "\"rank\":\"Admin\",\"role\":\"state_admin\",\"stationId\":\"%s\"}").formatted(station)).andExpect(status().isCreated());
        String inAdmin = "Bearer " + token("admin.in", "fictional-admin-pass-2");

        mvc.perform(get("/api/users").header("Authorization", inAdmin)).andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.username=='io.mh')]").isEmpty()).andExpect(jsonPath("$[?(@.username=='io.in')]").isNotEmpty());
        mvc.perform(get("/api/users").header("Authorization", admin)).andExpect(jsonPath("$[?(@.username=='io.mh')]").isNotEmpty());
        post(inAdmin, "/api/stations", "{\"stateCode\":\"MH\",\"district\":\"Other\",\"name\":\"Sneaky PS\"}").andExpect(status().isForbidden());
        post(inAdmin, "/api/stations", "{\"stateCode\":\"IN\",\"district\":\"Demo District\",\"name\":\"Demo Second PS\"}").andExpect(status().isCreated());
        // the same district written differently is the same district, never a second one
        post(inAdmin, "/api/stations", "{\"stateCode\":\"IN\",\"district\":\"  demo DISTRICT \",\"name\":\"Demo Third PS\"}").andExpect(status().isCreated());
        assertThat(db.sql("select count(*) from district where state_code = 'IN' and lower(name) = 'demo district'").query(Long.class).single()).isEqualTo(1);
        post(inAdmin, "/api/users", ioBody.formatted("io.sneak", "Sneak", mhStation)).andExpect(status().isBadRequest());
        post(inAdmin, "/api/users", ioBody.formatted("io.nostation", "None", "").replace("\"stationId\":\"\"", "\"stationId\":null"))
                .andExpect(status().isBadRequest());
        for (String action : new String[] {"disable", "enable", "unlock"})
            post(inAdmin, "/api/users/" + mhIo + "/" + action, REASON).andExpect(status().isNotFound());
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put("/api/users/" + mhIo).header("Authorization", inAdmin)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"role\":\"io\",\"rank\":\"PSI\",\"stationId\":\"%s\",\"reason\":\"Fictional promotion order\"}".formatted(station)))
                .andExpect(status().isNotFound());
        assertThat(db.sql("select active from app_user where id = ?").param(mhIo).query(Boolean.class).single()).isTrue();

        // regression (weekly review 31 Oct): the admin log and the sign-in log showed every state to a state admin
        post(admin, "/api/users/" + mhIo + "/disable", "{\"reason\":\"Fictional MH disable reason\"}").andExpect(status().isNoContent());
        login("io.mh", "wrong-fictional-pass");
        login("io.in", "wrong-fictional-pass");
        login("no.such.user", "wrong-fictional-pass");
        String log = mvc.perform(get("/api/admin-actions").header("Authorization", inAdmin)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(log).contains("io.in", "Demo Second PS").doesNotContain("io.mh", "Demo MH PS", "Fictional MH disable reason");
        assertThat(mvc.perform(get("/api/admin-actions").header("Authorization", admin)).andReturn().getResponse().getContentAsString())
                .contains("io.mh", "Demo MH PS", "Fictional MH disable reason");
        String signIns = mvc.perform(get("/api/sign-ins").header("Authorization", inAdmin)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(signIns).contains("io.in").doesNotContain("io.mh", "no.such.user");
        mvc.perform(get("/api/sign-ins?username=io.mh").header("Authorization", inAdmin)).andExpect(jsonPath("$.length()").value(0));
        assertThat(mvc.perform(get("/api/sign-ins").header("Authorization", admin)).andReturn().getResponse().getContentAsString())
                .contains("io.in", "io.mh", "no.such.user");
    }
}
