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

    // English translation beside a statement (AI feature A3, V52)
    static final String REQ = "7d0c3f1e-2b4a-4c55-9a77-0f1e2d3c4b5a";

    UUID statement(UUID person) throws Exception {
        record(io, fir, person, "मी २८ तारखेला ४०,००० रुपये पाठवले.").andExpect(status().isCreated());
        return db.sql("select id from witness_statement where person_id = ?").param(person).query(UUID.class).single();
    }

    ResultActions translate(String who, UUID firId, UUID statementId, String text, String aiText) throws Exception {
        return mvc.perform(post("/api/firs/" + firId + "/statements/" + statementId + "/translation").header("Authorization", who)
                .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(Map.of("text", text, "aiText", aiText, "aiRequestId", REQ))));
    }

    @Test
    void aCheckedTranslationIsKeptBesideTheOriginalOnceWithWhatTheAiDrafted() throws Exception {
        UUID s = statement(person(fir, "witness", "W1", "Fictional Son"));
        mvc.perform(get("/api/firs/" + fir + "/statements").header("Authorization", io))
                .andExpect(jsonPath("$.statements[0].translated_text").doesNotExist()).andExpect(jsonPath("$.statements[0].masked").value(false));
        translate(io, fir, s, "  I sent Rs 40,000 on the 28th. ", "I sent Rs 4,000 on the 28th.").andExpect(status().isCreated());
        mvc.perform(get("/api/firs/" + fir + "/statements").header("Authorization", io)).andExpect(status().isOk())
                .andExpect(jsonPath("$.statements[0].original_text").value("मी २८ तारखेला ४०,००० रुपये पाठवले."))
                .andExpect(jsonPath("$.statements[0].translated_text").value("I sent Rs 40,000 on the 28th."))
                .andExpect(jsonPath("$.statements[0].translation_corrected").value(true))
                .andExpect(jsonPath("$.statements[0].translation_checked_by_name").value("Fictional io"))
                .andExpect(jsonPath("$.statements[0].translation_checked_at").exists());
        assertThat(db.sql("select ai_request_id::text from statement_translation").query(String.class).single()).isEqualTo(REQ);
        translate(io, fir, s, "Another translation", "Another translation").andExpect(status().isConflict())
                .andExpect(status().reason("This statement already has a checked translation."));
        assertThatThrownBy(() -> db.sql("update statement_translation set translated_text = 'changed'").update()).hasMessageContaining("kept as written");
        assertThatThrownBy(() -> db.sql("delete from statement_translation").update()).hasMessageContaining("kept as written");
    }

    @Test
    void noTranslationOfAnEnglishStatementOrOfAProtectedCaseOrMaskedPerson() throws Exception {
        UUID w = person(fir, "witness", "W1", "Fictional Witness");
        mvc.perform(post("/api/firs/" + fir + "/statements").header("Authorization", io).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("personId", w.toString(), "language", "en", "medium", "written", "text", "Said in English.")))).andExpect(status().isCreated());
        UUID english = db.sql("select id from witness_statement where language = 'en'").query(UUID.class).single();
        translate(io, fir, english, "Said in English.", "Said in English.").andExpect(status().isBadRequest())
                .andExpect(status().reason("A statement made in English is not translated."));
        UUID masked = person(fir, "witness", "W2", "Fictional Masked");
        db.sql("update person set identity_masked = true where id = ?").param(masked).update();
        UUID ms = statement(masked);
        translate(io, fir, ms, "x words", "x words").andExpect(status().isBadRequest())
                .andExpect(status().reason("A statement of a protected victim's case or of a masked person is not sent for translation."));
        UUID plain = statement(person(fir, "witness", "W3", "Fictional Plain"));
        db.sql("insert into fir_section (fir_id, act, section) values (?, 'BNS', '124(1)')").param(fir).update();   // acid attack: protected
        translate(io, fir, plain, "x words", "x words").andExpect(status().isBadRequest());
        assertThat(db.sql("select count(*) from statement_translation").query(Long.class).single()).isZero();
    }

    @Test
    void onlyTheCaseTeamTranslatesAStatementOfItsOwnCaseWithEveryFieldGiven() throws Exception {
        UUID s = statement(person(fir, "witness", "W1", "Fictional Son"));
        translate(outsider, fir, s, "Words", "Words").andExpect(status().isForbidden());
        translate(desk, fir, s, "Words", "Words").andExpect(status().isForbidden());
        UUID other = fir(3);
        translate(io, other, s, "Words", "Words").andExpect(status().isNotFound());        // the statement is not of that case
        translate(io, fir, UUID.randomUUID(), "Words", "Words").andExpect(status().isNotFound());
        translate(io, fir, s, " ", "Words").andExpect(status().isBadRequest());
        translate(io, fir, s, "Words", "").andExpect(status().isBadRequest());
        translate(io, fir, s, "x".repeat(40001), "Words").andExpect(status().isBadRequest());
        mvc.perform(post("/api/firs/" + fir + "/statements/" + s + "/translation").header("Authorization", io).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("text", "Words", "aiText", "Words")))).andExpect(status().isBadRequest());
        assertThat(db.sql("select count(*) from statement_translation").query(Long.class).single()).isZero();
    }
}
