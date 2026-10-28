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
import org.springframework.test.web.servlet.MockMvc;

/** All names and numbers here are fictional. */
@SpringBootTest
@AutoConfigureMockMvc
class FirApiTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcClient db;
    @Autowired ObjectMapper json;
    @Autowired org.springframework.security.oauth2.jwt.JwtEncoder tokens;
    UUID station;
    String clerk;

    @BeforeEach
    void setUp() {
        db.sql("truncate fir, police_station, state_pack, app_user cascade").update();
        db.sql("insert into state_pack (code, name, version, languages) values ('IN','National','1',array['en'])").update();
        station = db.sql("insert into police_station (state_code, district, name, cctns_code) "
                + "values ('IN','Testpur','Testpur City Station','TP001') returning id").query(UUID.class).single();
        clerk = TestAuth.bearer(tokens, db.sql("insert into app_user (station_id, full_name, rank, role) values (?,'HC Fictional Clerk','HC','front_desk') returning id")
                .param(station).query(UUID.class).single());
    }

    Map<String, Object> body(int no) {
        return Map.of("stationId", station, "firYear", 2026, "firNo", no, "gdEntryNo", "GD-14",
                "registeredAt", "2026-10-01T10:00:00Z", "informationReceivedAt", "2026-10-01T09:30:00Z",
                "contentsOriginal", "Online payment fraud of Rs 40,000 by a caller.", "contentsLanguage", "en",
                "actionTaken", "investigate",
                "sections", new Object[] {Map.of("act", "BNS", "section", "318(4)")});
    }

    @Test
    void createThenReadBack() throws Exception {
        var res = mvc.perform(post("/api/firs").header("Authorization", clerk).contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(body(1))))
                .andExpect(status().isCreated()).andReturn();
        String id = json.readTree(res.getResponse().getContentAsString()).get("id").asText();
        mvc.perform(get("/api/firs/" + id).header("Authorization", clerk)).andExpect(status().isOk())
                .andExpect(jsonPath("$.sections[0].section").value("318(4)"));
        mvc.perform(get("/api/firs").header("Authorization", clerk)).andExpect(jsonPath("$.length()").value(1));
    }

    @Test
    void databaseRulesBecomeFriendlyErrors() throws Exception {
        var zeroWithoutPlace = new java.util.HashMap<>(body(2));
        zeroWithoutPlace.put("zeroFir", true);
        mvc.perform(post("/api/firs").header("Authorization", clerk).contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(zeroWithoutPlace)))
                .andExpect(status().isBadRequest());
        var blank = new java.util.HashMap<>(body(3));
        blank.put("contentsOriginal", " ");
        mvc.perform(post("/api/firs").header("Authorization", clerk).contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(blank)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void unknownFirIs404() throws Exception {
        mvc.perform(get("/api/firs/" + UUID.randomUUID()).header("Authorization", clerk)).andExpect(status().isNotFound());
        assertThat(db.sql("select count(*) from fir").query(Long.class).single()).isZero();
    }

    @Test
    void onlyStaffOfTheStationRegisterItsFirs() throws Exception {
        UUID other = db.sql("insert into police_station (state_code, district, name) values ('IN','Otherpur','Otherpur Station') returning id")
                .query(UUID.class).single();
        String outsider = TestAuth.bearer(tokens, db.sql("insert into app_user (station_id, full_name, rank, role) values (?,'SI Fictional Outsider','SI','io') returning id")
                .param(other).query(UUID.class).single());
        String prosecutor = TestAuth.bearer(tokens, db.sql("insert into app_user (station_id, full_name, rank, role) values (?,'APP Fictional','APP','prosecutor') returning id")
                .param(station).query(UUID.class).single());
        for (String who : new String[] {outsider, prosecutor}) {
            mvc.perform(post("/api/firs").header("Authorization", who).contentType(MediaType.APPLICATION_JSON)
                    .content(json.writeValueAsString(body(4)))).andExpect(status().isForbidden());
        }
        mvc.perform(post("/api/firs").contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body(4))))
                .andExpect(status().isUnauthorized());
        mvc.perform(get("/api/firs")).andExpect(status().isUnauthorized());
        assertThat(db.sql("select count(*) from fir").query(Long.class).single()).isZero();
    }

    UUID user(String name, String role, UUID at) {
        return db.sql("insert into app_user (station_id, full_name, rank, role) values (?,?,'SI',?) returning id")
                .params(at, name, role).query(UUID.class).single();
    }

    org.springframework.test.web.servlet.ResultActions assign(String bearer, String fir, String body) throws Exception {
        return mvc.perform(post("/api/firs/" + fir + "/io").header("Authorization", bearer).contentType(MediaType.APPLICATION_JSON).content(body));
    }

    @Test
    void theShoAssignsAndChangesTheIoWithAReasonAndEveryAssignmentIsKept() throws Exception {
        UUID io1 = user("SI Fictional One", "io", station), io2 = user("SI Fictional Two", "io", station);
        UUID otherStation = db.sql("insert into police_station (state_code, district, name) values ('IN','Testpur','Other PS') returning id")
                .query(UUID.class).single();
        UUID elsewhere = user("SI Elsewhere", "io", otherStation);
        String sho = TestAuth.bearer(tokens, user("PI Fictional SHO", "sho", station));
        String fir = json.readTree(mvc.perform(post("/api/firs").header("Authorization", clerk).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(body(5)))).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asText();
        String to = "{\"ioId\":\"%s\"%s}";
        assign(clerk, fir, to.formatted(io1, "")).andExpect(status().isForbidden());
        assign(sho, fir, to.formatted(elsewhere, "")).andExpect(status().isBadRequest());   // not of this station
        assign(sho, fir, to.formatted(io1, "")).andExpect(status().isNoContent());           // first IO: no reason needed
        mvc.perform(get("/api/firs/" + fir).header("Authorization", clerk)).andExpect(jsonPath("$.io_name").value("SI Fictional One"));
        assign(TestAuth.bearer(tokens, io1), fir, to.formatted(io2, ",\"reason\":\"Fictional leave of IO\"")).andExpect(status().isForbidden());
        assign(sho, fir, to.formatted(io1, ",\"reason\":\"Fictional leave of IO\"")).andExpect(status().isConflict());
        assign(sho, fir, to.formatted(io2, "")).andExpect(status().isBadRequest()).andExpect(status().reason(org.hamcrest.Matchers.startsWith("Give the reason")));
        assign(sho, fir, to.formatted(io2, ",\"reason\":\"Fictional leave of IO\"")).andExpect(status().isNoContent());
        // the old IO is off the case team at once; the new one is on it
        mvc.perform(get("/api/firs/" + fir + "/io-candidates").header("Authorization", TestAuth.bearer(tokens, io1))).andExpect(status().isNotFound());
        mvc.perform(get("/api/firs/" + fir + "/io-candidates").header("Authorization", TestAuth.bearer(tokens, io2)))
                .andExpect(jsonPath("$[*].full_name").value(org.hamcrest.Matchers.contains("PI Fictional SHO", "SI Fictional One", "SI Fictional Two")));
        mvc.perform(get("/api/firs/" + fir + "/io-history").header("Authorization", clerk)).andExpect(status().isNotFound());
        mvc.perform(get("/api/firs/" + fir + "/io-history").header("Authorization", TestAuth.bearer(tokens, io2)))
                .andExpect(jsonPath("$[0].from_name").value("SI Fictional One"))
                .andExpect(jsonPath("$[0].to_name").value("SI Fictional Two"))
                .andExpect(jsonPath("$[0].reason").value("Fictional leave of IO"))
                .andExpect(jsonPath("$[1].assigned_by_name").value("PI Fictional SHO"));
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> db.sql("update fir_io_assignment set reason = 'changed later'").update())
                .hasMessageContaining("kept as written");
    }

    @Test
    void anFirCanNameOnlyAnIoOfItsOwnStation() throws Exception {
        UUID otherStation = db.sql("insert into police_station (state_code, district, name) values ('IN','Testpur','Other PS') returning id")
                .query(UUID.class).single();
        var b = new java.util.HashMap<>(body(6));
        b.put("ioId", user("SI Elsewhere", "io", otherStation));
        mvc.perform(post("/api/firs").header("Authorization", clerk).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(b)))
                .andExpect(status().isBadRequest());
        b.put("ioId", user("SI Here", "io", station));
        mvc.perform(post("/api/firs").header("Authorization", clerk).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(b)))
                .andExpect(status().isCreated());
        assertThat(db.sql("select count(*) from fir_io_assignment").query(Long.class).single()).isEqualTo(1);
    }
}
