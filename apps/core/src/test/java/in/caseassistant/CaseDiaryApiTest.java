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

/** The case diary under BNSS 192 (V39, design board 14). Fictional data only. */
@SpringBootTest
@AutoConfigureMockMvc
class CaseDiaryApiTest {
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

    ResultActions write(String who, UUID firId, String text) throws Exception {
        return mvc.perform(post("/api/firs/" + firId + "/diary").header("Authorization", who).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("text", text))));
    }

    @Test
    void theIoWritesTodaysPageClosesItAndNothingIsChangedAfter() throws Exception {
        write(io, fir, "Visited the fictional bank branch; the manager will give the CCTV of 28 Oct tomorrow.").andExpect(status().isCreated());
        db.sql("insert into notice (fir_id, kind, addressee, items_requested, body, issued_at, reply_due_on, status, signed_by) values (?, 'BNSS_94', 'Nodal Officer, Fictional Bank', array['Fictional statement'], 'Fictional body', now(), current_date + 7, 'sent', ?)").params(fir, ioId).update();
        mvc.perform(get("/api/firs/" + fir + "/diary").header("Authorization", io)).andExpect(status().isOk())
                .andExpect(jsonPath("$.today").value(true)).andExpect(jsonPath("$.page").value((Object) null))
                .andExpect(jsonPath("$.entries[0].text").value(org.hamcrest.Matchers.startsWith("Visited the fictional bank")))
                .andExpect(jsonPath("$.entries[0].author_name").value("Fictional io"))
                .andExpect(jsonPath("$.events[0].what").value("notice_sent"))       // the app's own step, not typed again
                .andExpect(jsonPath("$.events[0].detail").value("BNSS_94 · Nodal Officer, Fictional Bank"));
        mvc.perform(post("/api/firs/" + fir + "/diary/close").header("Authorization", io)).andExpect(jsonPath("$.page_no").value(1));
        mvc.perform(post("/api/firs/" + fir + "/diary/close").header("Authorization", io)).andExpect(status().isConflict());
        write(io, fir, "A late line for a closed page").andExpect(status().isConflict());
        mvc.perform(get("/api/firs/" + fir + "/diary").header("Authorization", io))
                .andExpect(jsonPath("$.page.page_no").value(1)).andExpect(jsonPath("$.days[0].page_no").value(1));
        // kept as written, even straight in the database
        assertThatThrownBy(() -> db.sql("update case_diary_entry set text = 'changed'").update()).hasMessageContaining("kept as written");
        assertThatThrownBy(() -> db.sql("delete from case_diary_page").update()).hasMessageContaining("kept as written");
        assertThatThrownBy(() -> db.sql("insert into case_diary_entry (fir_id, diary_date, at, author, text) values (?, current_date - 3, now(), ?, 'back-dated line')")
                .params(fir, ioId).update()).hasMessageContaining("check");
    }

    @Test
    void anEmptyDayCannotBeClosedAndPagesAreNumberedPerCase() throws Exception {
        UUID second = fir(2);
        mvc.perform(post("/api/firs/" + second + "/diary/close").header("Authorization", io)).andExpect(status().isConflict());
        write(io, second, "Fictional entry on the second case.").andExpect(status().isCreated());
        mvc.perform(post("/api/firs/" + second + "/diary/close").header("Authorization", io)).andExpect(jsonPath("$.page_no").value(1));
        write(io, fir, "ab").andExpect(status().isBadRequest());                     // too short to be an entry
    }

    @Test
    void onlyTheCaseTeamReadsOrWritesTheDiary() throws Exception {
        write(outsider, fir, "Fictional line from another station").andExpect(status().isForbidden());
        write(desk, fir, "Fictional line from the front desk").andExpect(status().isForbidden());
        mvc.perform(get("/api/firs/" + fir + "/diary").header("Authorization", outsider)).andExpect(status().isNotFound());
        mvc.perform(get("/api/firs/" + fir + "/diary").header("Authorization", desk)).andExpect(status().isNotFound());
        mvc.perform(post("/api/firs/" + fir + "/diary/close").header("Authorization", outsider)).andExpect(status().isForbidden());
        assertThat(db.sql("select count(*) from case_diary_entry").query(Long.class).single()).isZero();
    }

    @Test
    void readingTheDiaryOfAProtectedCaseIsLogged() throws Exception {
        db.sql("insert into fir_section (fir_id, act, section) values (?, 'BNS', '64(1)')").param(fir).update();
        write(io, fir, "Fictional entry naming nobody in particular.").andExpect(status().isCreated());
        mvc.perform(get("/api/firs/" + fir + "/diary").header("Authorization", io)).andExpect(status().isOk());
        assertThat(db.sql("select count(*) from protected_read where what = 'diary' and fir_id = ?").param(fir).query(Long.class).single()).isOne();
    }
}
