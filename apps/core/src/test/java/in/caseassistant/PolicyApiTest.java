package in.caseassistant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

/** Policies of a state, district and station. Fictional states, districts, stations and officers only. */
@SpringBootTest
@AutoConfigureMockMvc
class PolicyApiTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcClient db;
    @Autowired ObjectMapper json;
    @Autowired JwtEncoder tokens;
    @Autowired AuthController auth;
    UUID s1, s2, s3;
    String stateAdmin, platformAdmin, sp, sho1, sho2, io;

    UUID station(String district, String name) {
        return db.sql("insert into police_station (state_code, district, name) values ('IN',?,?) returning id").params(district, name)
                .query(UUID.class).single();
    }

    String user(String role, UUID station, String name) {
        return TestAuth.bearer(tokens, db.sql("insert into app_user (station_id, full_name, rank, role) values (?,?,'Insp',?) returning id")
                .params(station, name, role).query(UUID.class).single());
    }

    @BeforeEach
    void setUp() {
        db.sql("truncate fir, police_station, state_pack, app_user, policy_setting cascade").update();
        db.sql("insert into state_pack (code, name, version, languages) values ('IN','National','1',array['en'])").update();
        s1 = station("North", "Fictional North PS");
        s2 = station("North", "Fictional North Two PS");
        s3 = station("South", "Fictional South PS");
        stateAdmin = user("state_admin", s1, "Fictional State Admin");
        platformAdmin = user("state_admin", null, "Fictional Platform Admin");
        sp = user("sp", s1, "Fictional SP North");
        sho1 = user("sho", s1, "Fictional SHO One");
        sho2 = user("sho", s2, "Fictional SHO Two");
        io = user("io", s1, "Fictional IO");
    }

    ResultActions set(String who, String level, Object station, String district, String key, int value) throws Exception {
        var body = new java.util.LinkedHashMap<String, Object>();
        body.put("level", level);
        body.put("stateCode", "IN");
        body.put("district", district);
        body.put("stationId", station);
        body.put("key", key);
        body.put("value", value);
        body.put("reason", "Fictional internal order 7");
        return mvc.perform(post("/api/policy-settings").header("Authorization", who).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(body)));
    }

    int effective(UUID station, String key) {
        return db.sql("select effective_policy_days(?, ?, ?)").params(station, key, key.equals("session_hours") ? 8 : 90).query(Integer.class).single();
    }

    @Test
    void everyoneSeesThePoliciesWithTheirDefaults() throws Exception {
        mvc.perform(get("/api/policies").header("Authorization", io)).andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.key=='victim_update_days')].effective").value(90))
                .andExpect(jsonPath("$[?(@.key=='session_hours')].max").value(8));
        mvc.perform(get("/api/policies")).andExpect(status().isUnauthorized());
    }

    @Test
    void aShoTightensTheirOwnStationOnly() throws Exception {
        set(sho1, "station", s1, null, "victim_update_days", 30).andExpect(status().isCreated());
        assertThat(effective(s1, "victim_update_days")).isEqualTo(30);
        assertThat(effective(s2, "victim_update_days")).isEqualTo(90);
        set(sho1, "station", s2, null, "victim_update_days", 30).andExpect(status().isForbidden());
        set(sho1, "district", null, "North", "victim_update_days", 30).andExpect(status().isForbidden());
        set(sho1, "state", null, null, "victim_update_days", 30).andExpect(status().isForbidden());
        set(io, "station", s1, null, "victim_update_days", 30).andExpect(status().isForbidden());
    }

    @Test
    void aSpTightensTheirDistrictAndItsStationsNotAnotherDistrict() throws Exception {
        set(sp, "district", null, "North", "victim_update_days", 60).andExpect(status().isCreated());
        assertThat(effective(s2, "victim_update_days")).isEqualTo(60);
        assertThat(effective(s3, "victim_update_days")).isEqualTo(90);
        set(sp, "station", s2, null, "victim_update_days", 45).andExpect(status().isCreated());
        set(sp, "station", s3, null, "victim_update_days", 45).andExpect(status().isForbidden());
        set(sp, "district", null, "South", "victim_update_days", 45).andExpect(status().isForbidden());
        set(sp, "state", null, null, "victim_update_days", 45).andExpect(status().isForbidden());
    }

    @Test
    void aUnitCanNeverBeLooserThanTheOneAboveAndTheStrictestAlwaysApplies() throws Exception {
        set(sp, "district", null, "North", "victim_update_days", 60).andExpect(status().isCreated());
        set(sho2, "station", s2, null, "victim_update_days", 75).andExpect(status().isConflict());
        set(sho2, "station", s2, null, "victim_update_days", 60).andExpect(status().isCreated());
        set(sho1, "station", s1, null, "victim_update_days", 20).andExpect(status().isCreated());
        // the state later asks for 45: the station that chose 20 keeps its stricter value; the other district-wide 60 becomes 45
        set(stateAdmin, "state", null, null, "victim_update_days", 45).andExpect(status().isCreated());
        assertThat(effective(s1, "victim_update_days")).isEqualTo(20);
        assertThat(effective(s2, "victim_update_days")).isEqualTo(45);
        assertThat(effective(s3, "victim_update_days")).isEqualTo(45);
        // a district may no longer ask for more than the state does
        set(sp, "district", null, "North", "victim_update_days", 50).andExpect(status().isConflict());
        // the newest setting of a unit replaces its older one, in either direction, inside what is above
        set(sho1, "station", s1, null, "victim_update_days", 40).andExpect(status().isCreated());
        assertThat(effective(s1, "victim_update_days")).isEqualTo(40);
        assertThat(db.sql("select count(*) from policy_setting").query(Long.class).single()).isEqualTo(5);
    }

    @Test
    void valuesStayInsideThePackBoundsAndNeedAReasonAndAKnownUnit() throws Exception {
        set(platformAdmin, "state", null, null, "victim_update_days", 3).andExpect(status().isBadRequest());
        set(platformAdmin, "state", null, null, "victim_update_days", 91).andExpect(status().isBadRequest());
        set(platformAdmin, "state", null, null, "no_such_policy", 5).andExpect(status().isBadRequest());
        set(platformAdmin, "station", UUID.randomUUID(), null, "victim_update_days", 30).andExpect(status().isBadRequest());
        set(platformAdmin, "district", null, "Nowhere", "victim_update_days", 30).andExpect(status().isBadRequest());
        mvc.perform(post("/api/policy-settings").header("Authorization", platformAdmin).contentType(MediaType.APPLICATION_JSON)
                .content("{\"level\":\"state\",\"stateCode\":\"IN\",\"key\":\"victim_update_days\",\"value\":30,\"reason\":\"short\"}"))
                .andExpect(status().isBadRequest());
        assertThat(db.sql("select count(*) from policy_setting").query(Long.class).single()).isZero();
    }

    @Test
    void theHistoryShowsOnlyTheUnitsTheUserManagesAndKeepsEveryChange() throws Exception {
        set(sho1, "station", s1, null, "victim_update_days", 30).andExpect(status().isCreated());
        set(sho2, "station", s2, null, "victim_update_days", 30).andExpect(status().isCreated());
        set(sp, "district", null, "North", "session_hours", 4).andExpect(status().isCreated());
        mvc.perform(get("/api/policy-settings").header("Authorization", sho1)).andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].station_name").value("Fictional North PS")).andExpect(jsonPath("$[0].set_by_name").value("Fictional SHO One"));
        mvc.perform(get("/api/policy-settings").header("Authorization", sp)).andExpect(jsonPath("$.length()").value(3));
        mvc.perform(get("/api/policy-settings").header("Authorization", io)).andExpect(jsonPath("$.length()").value(0));
        mvc.perform(get("/api/policy-settings").header("Authorization", stateAdmin)).andExpect(jsonPath("$.length()").value(3));
        assertThat(db.sql("select count(*) from policy_setting").query(Long.class).single()).isEqualTo(3);
    }

    @Test
    void theVictimUpdateDeadlineFollowsThePolicyButNeverPassesTheLegalNinetyDays() throws Exception {
        UUID fir = db.sql("""
                insert into fir (station_id, fir_year, fir_no, gd_entry_no, registered_at, information_received_at,
                  contents_original, contents_language, action_taken)
                values (?,2026,9,'GD-5','2026-10-01T10:00Z','2026-10-01T09:00Z','Fictional complaint','en','investigate')
                returning id""").param(s1).query(UUID.class).single();
        String due = "select due_on::text || ' ' || basis from case_deadline where fir_id = ? and kind = 'victim_progress_update'";
        assertThat(db.sql(due).param(fir).query(String.class).single()).isEqualTo("2026-12-30 BNSS 193(3)(ii), 90 days");
        set(sho1, "station", s1, null, "victim_update_days", 30).andExpect(status().isCreated());
        assertThat(db.sql(due).param(fir).query(String.class).single())
                .isEqualTo("2026-10-31 BNSS 193(3)(ii), 90 days; earlier by unit policy: 30 days");
    }

    @Test
    void theSignInLengthFollowsThePolicy() throws Exception {
        auth.ensureAdmin("admin.one", "fictional-admin-pass-1");
        String admin = "Bearer " + json.readTree(mvc.perform(post("/api/login").contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("username", "admin.one", "password", "fictional-admin-pass-1"))))
                .andReturn().getResponse().getContentAsString()).get("token").asText();
        mvc.perform(post("/api/users").header("Authorization", admin).contentType(MediaType.APPLICATION_JSON)
                .content(("{\"username\":\"io.short\",\"password\":\"fictional-io-pass-22\",\"fullName\":\"SI Fictional Short\",\"rank\":\"SI\","
                        + "\"role\":\"io\",\"stationId\":\"%s\"}").formatted(s1))).andExpect(status().isCreated());
        String login = json.writeValueAsString(Map.of("username", "io.short", "password", "fictional-io-pass-22"));
        mvc.perform(post("/api/login").contentType(MediaType.APPLICATION_JSON).content(login)).andExpect(jsonPath("$.expiresInSeconds").value(28800));
        set(sho1, "station", s1, null, "session_hours", 2).andExpect(status().isCreated());
        mvc.perform(post("/api/login").contentType(MediaType.APPLICATION_JSON).content(login)).andExpect(jsonPath("$.expiresInSeconds").value(7200));
    }
}
