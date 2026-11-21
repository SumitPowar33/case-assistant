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
import org.springframework.test.web.servlet.ResultActions;

/** POCSO case mode (V56): the steps of a POCSO case and their deadlines. Fictional data only. */
@SpringBootTest
@AutoConfigureMockMvc
class PocsoApiTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcClient db;
    @Autowired org.springframework.security.oauth2.jwt.JwtEncoder tokens;
    UUID fir;
    String io, sho, outsider, frontDesk;

    @BeforeEach
    void setUp() {
        db.sql("truncate fir, police_station, state_pack, app_user cascade").update();
        db.sql("insert into state_pack (code, name, version, languages) values ('IN','National','1',array['en'])").update();
        UUID station = db.sql("insert into police_station (state_code, district_id, name) values ('IN',district_id_of('IN','Testpur'),'Testpur City') returning id")
                .query(UUID.class).single();
        UUID ioId = db.sql("insert into app_user (station_id, full_name, rank, role) values (?,'SI Fictional Woman','SI','io') returning id")
                .param(station).query(UUID.class).single();
        io = TestAuth.bearer(tokens, ioId);
        fir = db.sql("""
                insert into fir (station_id, fir_year, fir_no, gd_entry_no, registered_at, information_received_at,
                  contents_original, contents_language, action_taken, io_id)
                values (?,2026,31,'GD-8','2026-10-01T05:00Z','2026-10-01T04:30Z','Fictional complaint','en','investigate',?)
                returning id""").params(station, ioId).query(UUID.class).single();
        sho = TestAuth.bearer(tokens, db.sql("insert into app_user (station_id, full_name, rank, role) values (?,'Insp Fictional Head','Insp','sho') returning id")
                .param(station).query(UUID.class).single());
        outsider = TestAuth.bearer(tokens, db.sql("insert into app_user (station_id, full_name, rank, role) values (?,'SI Fictional Other','SI','io') returning id")
                .param(station).query(UUID.class).single());
        frontDesk = TestAuth.bearer(tokens, db.sql("insert into app_user (station_id, full_name, rank, role) values (?,'HC Fictional Desk','HC','front_desk') returning id")
                .param(station).query(UUID.class).single());
    }

    void pocsoSection() {
        db.sql("insert into fir_section (fir_id, act, section) values (?, 'POCSO Act', '8')").param(fir).update();
    }

    ResultActions record(String who, String body) throws Exception {
        return mvc.perform(post("/api/firs/" + fir + "/pocso-steps").header("Authorization", who).contentType(MediaType.APPLICATION_JSON).content(body));
    }

    @Test
    void aCaseWithoutAPocsoSectionOrChildVictimHasNoSteps() throws Exception {
        mvc.perform(get("/api/firs/" + fir + "/pocso").header("Authorization", io)).andExpect(status().isOk())
                .andExpect(jsonPath("$.pocso").value(false)).andExpect(jsonPath("$.steps.length()").value(0));
        record(io, "{\"step\":\"cwc_court_report\",\"doneAt\":\"2026-10-01T10:00:00+05:30\"}").andExpect(status().isBadRequest())
                .andExpect(status().reason("This FIR is not a POCSO case."));
    }

    @Test
    void aChildVictimInASexualOffenceFirMakesItAPocsoCase() throws Exception {
        db.sql("insert into fir_section (fir_id, act, section) values (?, 'BNS', '64(1)')").param(fir).update();
        db.sql("insert into person (fir_id, role, label, identity_known, age_years) values (?, 'victim', 'V1', false, 14)").param(fir).update();
        mvc.perform(get("/api/firs/" + fir + "/pocso").header("Authorization", io)).andExpect(jsonPath("$.pocso").value(true))
                .andExpect(jsonPath("$.steps.length()").value(6));
    }

    @Test
    void theStepsAreListedInOrderWithTheLawAndOnlyTheTwo24HourStepsHaveADueTime() throws Exception {
        pocsoSection();
        mvc.perform(get("/api/firs/" + fir + "/pocso").header("Authorization", io)).andExpect(status().isOk())
                .andExpect(jsonPath("$.pocso").value(true))
                .andExpect(jsonPath("$.steps[0].step").value("cwc_court_report")).andExpect(jsonPath("$.steps[0].basis").value("POCSO 19(6)"))
                .andExpect(jsonPath("$.steps[0].limit_hours").value(24))
                .andExpect(jsonPath("$.steps[0].due_at").value(org.hamcrest.Matchers.startsWith("2026-10-02T04:30")))
                .andExpect(jsonPath("$.steps[1].step").value("medical_examination")).andExpect(jsonPath("$.steps[1].limit_hours").value(24))
                .andExpect(jsonPath("$.steps[2].step").value("statement_chosen_place")).andExpect(jsonPath("$.steps[2].due_at").doesNotExist())
                .andExpect(jsonPath("$.steps[2].limit_hours").doesNotExist())
                .andExpect(jsonPath("$.steps[5].step").value("interim_compensation"))
                .andExpect(jsonPath("$.steps[0].done_at").doesNotExist());
        mvc.perform(get("/api/firs/" + fir + "/deadlines").header("Authorization", io))
                .andExpect(jsonPath("$[?(@.kind=='pocso_cwc_court_report')].due_on").value("2026-10-02"))
                .andExpect(jsonPath("$[?(@.kind=='pocso_medical_examination')]").isNotEmpty());
    }

    @Test
    void recordingAStepEndsItsDeadlineAndTheLatestRecordCounts() throws Exception {
        pocsoSection();
        record(io, "{\"step\":\"cwc_court_report\",\"doneAt\":\"2026-10-01T16:00:00+05:30\"}").andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").isNotEmpty());
        record(sho, "{\"step\":\"cwc_court_report\",\"doneAt\":\"2026-10-01T17:00:00+05:30\"}").andExpect(status().isCreated());
        mvc.perform(get("/api/firs/" + fir + "/pocso").header("Authorization", io))
                .andExpect(jsonPath("$.steps[0].done_at").value(org.hamcrest.Matchers.startsWith("2026-10-01T11:30")))
                .andExpect(jsonPath("$.steps[0].recorded_by_name").value("Insp Fictional Head"))
                .andExpect(jsonPath("$.steps[1].done_at").doesNotExist());
        mvc.perform(get("/api/firs/" + fir + "/deadlines").header("Authorization", io))
                .andExpect(jsonPath("$[?(@.kind=='pocso_cwc_court_report')]").isEmpty())
                .andExpect(jsonPath("$[?(@.kind=='pocso_medical_examination')]").isNotEmpty());
    }

    @Test
    void onlyTheCaseTeamRecordsOrReadsAndBadStepsOrTimesAreRefused() throws Exception {
        pocsoSection();
        String ok = "{\"step\":\"medical_examination\",\"doneAt\":\"2026-10-01T12:00:00+05:30\"}";
        record(outsider, ok).andExpect(status().isForbidden());
        record(frontDesk, ok).andExpect(status().isForbidden());
        mvc.perform(get("/api/firs/" + fir + "/pocso").header("Authorization", outsider)).andExpect(status().isNotFound());
        mvc.perform(get("/api/firs/" + fir + "/pocso").header("Authorization", frontDesk)).andExpect(status().isNotFound());
        mvc.perform(get("/api/firs/" + fir + "/pocso")).andExpect(status().isUnauthorized());
        record(io, ok.replace("medical_examination", "lie_detector")).andExpect(status().isBadRequest());
        record(io, "{\"step\":\"medical_examination\"}").andExpect(status().isBadRequest());
        String report = ok.replace("medical_examination", "cwc_court_report");
        record(io, report.replace("2026-10-01T12:00", "2026-10-01T09:59")).andExpect(status().isBadRequest())
                .andExpect(status().reason("A step cannot be before the information was received."));
        // weekly review 21 Nov: a hospital may examine the child before it informs the police (POCSO 19(1))
        record(io, ok.replace("2026-10-01T12:00", "2026-10-01T09:59")).andExpect(status().isCreated());
        record(io, ok.replace("2026-10-01T12:00", "2999-01-01T12:00")).andExpect(status().isBadRequest())
                .andExpect(status().reason("The time a step was done cannot be in the future."));
        record(io, ok.replace("2026-10-01T12:00", "2026-10-01T10:00")).andExpect(status().isCreated());   // the minute of the information
        record(io, ok).andExpect(status().isCreated());
    }
}
