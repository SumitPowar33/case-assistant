package in.caseassistant;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MockMvc;

/** Fictional data only. */
@SpringBootTest
@AutoConfigureMockMvc
class CaseApiTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcClient db;
    @Autowired org.springframework.security.oauth2.jwt.JwtEncoder tokens;
    UUID fir, item;
    String malkhana, outsider, sho;

    @BeforeEach
    void setUp() {
        db.sql("truncate fir, police_station, state_pack, app_user cascade").update();
        db.sql("insert into state_pack (code, name, version, languages) values ('IN','National','1',array['en'])").update();
        UUID station = db.sql("insert into police_station (state_code, district, name) values ('IN','Testpur','Testpur City') returning id")
                .query(UUID.class).single();
        fir = db.sql("""
                insert into fir (station_id, fir_year, fir_no, gd_entry_no, registered_at, information_received_at,
                  contents_original, contents_language, action_taken)
                values (?,2026,9,'GD-5','2026-10-01T10:00Z','2026-10-01T09:00Z','Fictional complaint','en','investigate')
                returning id""").param(station).query(UUID.class).single();
        item = db.sql("insert into evidence_item (fir_id,label,description,kind,seized_at,seizure_memo,sha256) "
                        + "values (?,'E-01','Fictional phone','electronic','2026-10-02T10:00Z','SM-1',?) returning id")
                .params(fir, "a".repeat(64)).query(UUID.class).single();
        malkhana = TestAuth.bearer(tokens, db.sql("insert into app_user (station_id, full_name, rank, role) values (?,'HC Fictional Store','HC','malkhana') returning id")
                .param(station).query(UUID.class).single());
        sho = TestAuth.bearer(tokens, db.sql("insert into app_user (station_id, full_name, rank, role) values (?,'Insp Fictional Head','Insp','sho') returning id")
                .param(station).query(UUID.class).single());
        outsider = TestAuth.bearer(tokens, db.sql("insert into app_user (station_id, full_name, rank, role) values (?,'SI Fictional Other','SI','io') returning id")
                .param(station).query(UUID.class).single());
    }

    @Test
    void victimUpdateDeadlineIs90DaysAfterRegistration() throws Exception {
        mvc.perform(get("/api/firs/" + fir + "/deadlines").header("Authorization", sho)).andExpect(status().isOk())
                .andExpect(jsonPath("$[0].kind").value("victim_progress_update"))
                .andExpect(jsonPath("$[0].due_on").value("2026-12-30"));
    }

    @Test
    void onlyTheCaseTeamReadsTheCaseAndMalkhanaReadsEvidence() throws Exception {
        for (String who : new String[] {malkhana, outsider})
            mvc.perform(get("/api/firs/" + fir + "/deadlines").header("Authorization", who)).andExpect(status().isNotFound());
        mvc.perform(get("/api/firs/" + fir + "/evidence").header("Authorization", malkhana)).andExpect(status().isOk());
        mvc.perform(get("/api/firs/" + fir + "/evidence").header("Authorization", outsider)).andExpect(status().isNotFound());
        mvc.perform(get("/api/firs/" + fir + "/evidence").header("Authorization", sho)).andExpect(status().isOk());
    }

    @Test
    void electronicItemIsNotCourtReadyWithoutCertificates() throws Exception {
        mvc.perform(get("/api/firs/" + fir + "/evidence").header("Authorization", malkhana))
                .andExpect(jsonPath("$[0].court_ready").value(false));
    }

    @Test
    void custodyLogOnlyGrows() throws Exception {
        String body = """
                {"at":"2026-10-03T11:00:00Z","handedBy":"SI Asha Rao","receivedBy":"Malkhana HC Dev Nair",
                 "location":"Malkhana","purpose":"deposit","sealIntact":true}""";
        mvc.perform(post("/api/firs/" + fir + "/evidence/" + item + "/custody").header("Authorization", malkhana)
                .contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isCreated());
        mvc.perform(get("/api/firs/" + fir + "/evidence/" + item + "/custody").header("Authorization", malkhana))
                .andExpect(jsonPath("$.length()").value(1)).andExpect(jsonPath("$[0].seal_intact").value(true));
        mvc.perform(post("/api/firs/" + fir + "/evidence/" + UUID.randomUUID() + "/custody").header("Authorization", malkhana)
                .contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isNotFound());
        mvc.perform(post("/api/firs/" + fir + "/evidence/" + item + "/custody").header("Authorization", malkhana)
                .contentType(MediaType.APPLICATION_JSON).content("{\"at\":\"2026-10-03T11:00:00Z\"}"))
                .andExpect(status().isBadRequest());
        // an IO who is not on this case cannot write to its custody log
        mvc.perform(post("/api/firs/" + fir + "/evidence/" + item + "/custody").header("Authorization", outsider)
                .contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isForbidden());
        mvc.perform(get("/api/firs/" + fir + "/evidence/" + item + "/custody").header("Authorization", malkhana))
                .andExpect(jsonPath("$.length()").value(1));
    }
}
