package in.caseassistant;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MockMvc;

/** What the AI gateway asks before a case's text goes to a model (weekly review 14 Nov 2026). Fictional data only. */
@SpringBootTest
@AutoConfigureMockMvc
class AiCaseApiTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcClient db;
    @Autowired org.springframework.security.oauth2.jwt.JwtEncoder tokens;
    UUID station, fir;
    String io, sho, desk, otherIo;

    UUID user(UUID st, String role) {
        return db.sql("insert into app_user (station_id, full_name, rank, role) values (?,?,'SI',?) returning id").params(st, "Fictional " + role, role).query(UUID.class).single();
    }

    @BeforeEach
    void setUp() {
        db.sql("truncate fir, police_station, state_pack, app_user cascade").update();
        db.sql("insert into state_pack (code, name, version, languages) values ('IN','National','1',array['en'])").update();
        station = db.sql("insert into police_station (state_code, district_id, name) values ('IN',district_id_of('IN','North'),'Fictional North PS') returning id").query(UUID.class).single();
        UUID other = db.sql("insert into police_station (state_code, district_id, name) values ('IN',district_id_of('IN','South'),'Fictional South PS') returning id").query(UUID.class).single();
        UUID ioId = user(station, "io");
        io = TestAuth.bearer(tokens, ioId);
        sho = TestAuth.bearer(tokens, user(station, "sho"));
        desk = TestAuth.bearer(tokens, user(station, "front_desk"));
        otherIo = TestAuth.bearer(tokens, user(other, "io"));
        fir = db.sql("""
                insert into fir (station_id, fir_year, fir_no, gd_entry_no, registered_at, information_received_at, contents_original, contents_language, action_taken, io_id)
                values (?,2026,1,'GD-1',now(),now() - interval '1 hour','Fictional complaint','en','investigate',?) returning id""")
                .params(station, ioId).query(UUID.class).single();
    }

    @Test
    void theCaseTeamLearnsWhetherTheVictimIsProtected_andNothingElse() throws Exception {
        mvc.perform(get("/api/firs/" + fir + "/ai-check").header("Authorization", io)).andExpect(status().isOk())
                .andExpect(jsonPath("$.victim_protected").value(false)).andExpect(jsonPath("$.length()").value(1));
        db.sql("insert into fir_section (fir_id, act, section) values (?, 'BNS', '124(1)')").param(fir).update();
        mvc.perform(get("/api/firs/" + fir + "/ai-check").header("Authorization", sho)).andExpect(status().isOk())
                .andExpect(jsonPath("$.victim_protected").value(true));
    }

    @Test
    void anyoneElseGets404AndNoTokenGets401() throws Exception {
        mvc.perform(get("/api/firs/" + fir + "/ai-check").header("Authorization", otherIo)).andExpect(status().isNotFound());
        mvc.perform(get("/api/firs/" + fir + "/ai-check").header("Authorization", desk)).andExpect(status().isNotFound());
        mvc.perform(get("/api/firs/" + UUID.randomUUID() + "/ai-check").header("Authorization", io)).andExpect(status().isNotFound());
        mvc.perform(get("/api/firs/" + fir + "/ai-check")).andExpect(status().isUnauthorized());
    }
}
