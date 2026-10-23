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
    UUID station;

    @BeforeEach
    void setUp() {
        db.sql("truncate fir, police_station, state_pack cascade").update();
        db.sql("insert into state_pack (code, name, version, languages) values ('IN','National','1',array['en'])").update();
        station = db.sql("insert into police_station (state_code, district, name, cctns_code) "
                + "values ('IN','Testpur','Testpur City Station','TP001') returning id").query(UUID.class).single();
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
        var res = mvc.perform(post("/api/firs").contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(body(1))))
                .andExpect(status().isCreated()).andReturn();
        String id = json.readTree(res.getResponse().getContentAsString()).get("id").asText();
        mvc.perform(get("/api/firs/" + id)).andExpect(status().isOk())
                .andExpect(jsonPath("$.sections[0].section").value("318(4)"));
        mvc.perform(get("/api/firs")).andExpect(jsonPath("$.length()").value(1));
    }

    @Test
    void databaseRulesBecomeFriendlyErrors() throws Exception {
        var zeroWithoutPlace = new java.util.HashMap<>(body(2));
        zeroWithoutPlace.put("zeroFir", true);
        mvc.perform(post("/api/firs").contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(zeroWithoutPlace)))
                .andExpect(status().isBadRequest());
        var blank = new java.util.HashMap<>(body(3));
        blank.put("contentsOriginal", " ");
        mvc.perform(post("/api/firs").contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(blank)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void unknownFirIs404() throws Exception {
        mvc.perform(get("/api/firs/" + UUID.randomUUID())).andExpect(status().isNotFound());
        assertThat(db.sql("select count(*) from fir").query(Long.class).single()).isZero();
    }
}
