package in.caseassistant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
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

/** Statements of witnesses under BNSS 180 (V40, design board 6). Fictional data only. */
@SpringBootTest
@AutoConfigureMockMvc
class StatementApiTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcClient db;
    @Autowired ObjectMapper json;
    @Autowired JwtEncoder tokens;
    UUID station, fir, ioId;
    String io, outsider, desk;

    UUID user(UUID st, String role) {
        return db.sql("insert into app_user (station_id, full_name, rank, role) values (?,?,'SI',?) returning id").params(st, "Fictional " + role, role).query(UUID.class).single();
    }

    UUID fir(int no) {
        return db.sql("""
                insert into fir (station_id, fir_year, fir_no, gd_entry_no, registered_at, information_received_at, contents_original, contents_language, action_taken, io_id)
                values (?,2026,?,'GD-1',now() - interval '2 days',now() - interval '2 days 1 hour','Fictional complaint','en','investigate',?) returning id""")
                .params(station, no, ioId).query(UUID.class).single();
    }

    @BeforeEach
    void setUp() {
        db.sql("truncate fir, police_station, state_pack, app_user cascade").update();
        db.sql("insert into state_pack (code, name, version, languages) values ('IN','National','1',array['en'])").update();
        station = db.sql("insert into police_station (state_code, district_id, name) values ('IN',district_id_of('IN','North'),'Fictional North PS') returning id").query(UUID.class).single();
        UUID far = db.sql("insert into police_station (state_code, district_id, name) values ('IN',district_id_of('IN','South'),'Fictional South PS') returning id").query(UUID.class).single();
        ioId = user(station, "io");
        io = TestAuth.bearer(tokens, ioId);
        outsider = TestAuth.bearer(tokens, user(far, "io"));
        desk = TestAuth.bearer(tokens, user(station, "front_desk"));
        fir = fir(1);
    }

    UUID person(UUID firId, String role, String label, String name) {
        return db.sql("insert into person (fir_id, role, label, full_name) values (?,?,?,?) returning id").params(firId, role, label, name).query(UUID.class).single();
    }

    ResultActions record(String who, UUID firId, Object person, String text) throws Exception {
        return mvc.perform(post("/api/firs/" + firId + "/statements").header("Authorization", who).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("personId", String.valueOf(person), "language", "mr", "medium", "video", "text", text))));
    }

    @Test
    void aStatementIsKeptAsSaidAndTheTrackerShowsWhoIsStillToBeRecorded() throws Exception {
        UUID son = person(fir, "witness", "W1", "Fictional Son");
        person(fir, "witness", "W2", "Fictional Nodal Officer");
        person(fir, "accused", "A1", "Fictional Accused");
        record(io, fir, son, "१९ ऑगस्टला दुपारी मी घरी आलो तेव्हा बाबा व्हिडिओ कॉलवर होते.").andExpect(status().isCreated());
        mvc.perform(get("/api/firs/" + fir + "/statements").header("Authorization", io)).andExpect(status().isOk())
                .andExpect(jsonPath("$.witnesses.length()").value(2))                       // the accused is not a witness
                .andExpect(jsonPath("$.witnesses[0].label").value("W1")).andExpect(jsonPath("$.witnesses[0].statements").value(1))
                .andExpect(jsonPath("$.witnesses[1].statements").value(0))
                .andExpect(jsonPath("$.statements[0].original_text").value("१९ ऑगस्टला दुपारी मी घरी आलो तेव्हा बाबा व्हिडिओ कॉलवर होते."))
                .andExpect(jsonPath("$.statements[0].language").value("mr")).andExpect(jsonPath("$.statements[0].recorded_by_name").value("Fictional io"));
        assertThatThrownBy(() -> db.sql("update witness_statement set original_text = 'changed words'").update()).hasMessageContaining("kept as written");
        assertThatThrownBy(() -> db.sql("delete from witness_statement").update()).hasMessageContaining("kept as written");
    }

    @Test
    void onlyAPersonOfThisCaseWhoIsNotAnAccusedHasAStatement() throws Exception {
        UUID accused = person(fir, "accused", "A1", "Fictional Accused");
        UUID other = person(fir(2), "witness", "W1", "Fictional Other");
        record(io, fir, accused, "Not recorded here").andExpect(status().isBadRequest());
        record(io, fir, other, "A witness of another case").andExpect(status().isBadRequest());
        record(io, fir, "not-an-id", "Text for nobody").andExpect(status().isBadRequest());
        record(io, fir, UUID.randomUUID(), "Text for an unknown person").andExpect(status().isBadRequest());
        mvc.perform(post("/api/firs/" + fir + "/statements").header("Authorization", io).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("personId", other.toString(), "language", "MR!", "medium", "tape", "text", "ab")))).andExpect(status().isBadRequest());
        assertThat(db.sql("select count(*) from witness_statement").query(Long.class).single()).isZero();
    }

    @Test
    void onlyTheCaseTeamReadsOrWritesStatements() throws Exception {
        UUID w = person(fir, "witness", "W1", "Fictional Witness");
        record(outsider, fir, w, "Line from another station").andExpect(status().isForbidden());
        record(desk, fir, w, "Line from the front desk").andExpect(status().isForbidden());
        mvc.perform(get("/api/firs/" + fir + "/statements").header("Authorization", outsider)).andExpect(status().isNotFound());
        mvc.perform(get("/api/firs/" + fir + "/statements").header("Authorization", desk)).andExpect(status().isNotFound());
        assertThat(db.sql("select count(*) from witness_statement").query(Long.class).single()).isZero();
    }

    @Test
    void readingStatementsOfAProtectedCaseIsLogged() throws Exception {
        db.sql("insert into fir_section (fir_id, act, section) values (?, 'BNS', '64(1)')").param(fir).update();
        UUID w = person(fir, "victim", "V1", "Fictional Victim");
        record(io, fir, w, "Fictional account naming nobody.").andExpect(status().isCreated());
        mvc.perform(get("/api/firs/" + fir + "/statements").header("Authorization", io)).andExpect(status().isOk());
        assertThat(db.sql("select count(*) from protected_read where what = 'statements' and fir_id = ?").param(fir).query(Long.class).single()).isOne();
    }
}
