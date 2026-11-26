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
    UUID fir, ioId, ioStation;
    String io, sho, outsider, frontDesk;

    @BeforeEach
    void setUp() {
        db.sql("truncate fir, police_station, state_pack, app_user cascade").update();
        db.sql("insert into state_pack (code, name, version, languages) values ('IN','National','1',array['en'])").update();
        UUID station = db.sql("insert into police_station (state_code, district_id, name) values ('IN',district_id_of('IN','Testpur'),'Testpur City') returning id")
                .query(UUID.class).single();
        ioStation = station;
        ioId = db.sql("insert into app_user (station_id, full_name, rank, role) values (?,'SI Fictional Woman','SI','io') returning id")
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
    String readiness() {
        return "/api/firs/" + fir + "/readiness";
    }

    @Test
    void aChildVictimInASexualOffenceFirWithoutAPocsoSectionIsAReadinessGapUntilTheSectionIsAdded() throws Exception {
        db.sql("insert into fir_section (fir_id, act, section) values (?, 'BNS', '64(1)')").param(fir).update();
        mvc.perform(get(readiness()).header("Authorization", io)).andExpect(status().isOk())
                .andExpect(jsonPath("$.gaps[?(@.key == 'pocso-section')]").isEmpty())   // no child victim yet: not a POCSO case
                .andExpect(jsonPath("$.gaps[?(@.key =~ /pocso-step:.*/)]").isEmpty());
        db.sql("insert into person (fir_id, role, label, identity_known, age_years) values (?, 'victim', 'V1', false, 15)").param(fir).update();
        mvc.perform(get(readiness()).header("Authorization", io))
                .andExpect(jsonPath("$.gaps[?(@.key == 'pocso-section')].severity").value("high"))
                .andExpect(jsonPath("$.gaps[?(@.key == 'pocso-section')].text").value(org.hamcrest.Matchers.hasItem(org.hamcrest.Matchers.containsString("no POCSO Act section"))))
                .andExpect(jsonPath("$.openGaps").value(7));
        pocsoSection();
        mvc.perform(get(readiness()).header("Authorization", io))
                .andExpect(jsonPath("$.gaps[?(@.key == 'pocso-section')]").isEmpty())
                .andExpect(jsonPath("$.openGaps").value(6));
    }

    @Test
    void eachPocsoStepNotRecordedIsAGapAndARecordedOrAcceptedStepIsNot() throws Exception {
        pocsoSection();
        mvc.perform(get(readiness()).header("Authorization", io))
                .andExpect(jsonPath("$.gaps[0].key").value("pocso-step:cwc_court_report"))
                .andExpect(jsonPath("$.gaps[0].text").value(org.hamcrest.Matchers.containsString("POCSO 19(6)")))
                .andExpect(jsonPath("$.gaps[5].key").value("pocso-step:interim_compensation"))
                .andExpect(jsonPath("$.openGaps").value(6));
        record(io, "{\"step\":\"medical_examination\",\"doneAt\":\"2026-10-01T12:00:00+05:30\"}").andExpect(status().isCreated());
        mvc.perform(post(readiness() + "/overrides").header("Authorization", io).contentType(MediaType.APPLICATION_JSON)
                .content("{\"gapKey\":\"pocso-step:interim_compensation\",\"reason\":\"The family did not want it asked for; recorded in the case diary\"}"))
                .andExpect(status().isCreated());
        mvc.perform(get(readiness()).header("Authorization", io))
                .andExpect(jsonPath("$.gaps[?(@.key == 'pocso-step:medical_examination')]").isEmpty())
                .andExpect(jsonPath("$.gaps[?(@.key == 'pocso-step:interim_compensation')].override.reason").isNotEmpty())
                .andExpect(jsonPath("$.openGaps").value(4));
        mvc.perform(get(readiness()).header("Authorization", outsider)).andExpect(status().isNotFound());
    }

    @Test
    void aRecordedStepIsOnThatDaysCaseDiaryPageAndNotOnAnotherDay() throws Exception {
        pocsoSection();
        record(io, "{\"step\":\"support_person\",\"doneAt\":\"2026-10-01T16:00:00+05:30\"}").andExpect(status().isCreated());
        mvc.perform(get("/api/firs/" + fir + "/diary?date=2026-10-01").header("Authorization", io))
                .andExpect(jsonPath("$.events[?(@.what=='pocso_step')].detail").value("support_person"));
        mvc.perform(get("/api/firs/" + fir + "/diary?date=2026-10-02").header("Authorization", io))
                .andExpect(jsonPath("$.events[?(@.what=='pocso_step')]").isEmpty());
        mvc.perform(get("/api/firs/" + fir + "/diary?date=2026-10-01").header("Authorization", outsider)).andExpect(status().isNotFound());
    }

    @Test
    void theDashboardListsAPocsoCaseWithOpenStepsUntilEveryStepIsRecorded() throws Exception {
        mvc.perform(get("/api/dashboard").header("Authorization", io)).andExpect(jsonPath("$.pocso_open.length()").value(0));   // not a POCSO case
        pocsoSection();
        mvc.perform(get("/api/dashboard").header("Authorization", io)).andExpect(jsonPath("$.pocso_open.length()").value(1))
                .andExpect(jsonPath("$.pocso_open[0].fir_no").value(31)).andExpect(jsonPath("$.pocso_open[0].open_steps").value(6));
        record(io, "{\"step\":\"support_person\",\"doneAt\":\"2026-10-01T16:00:00+05:30\"}");
        record(sho, "{\"step\":\"support_person\",\"doneAt\":\"2026-10-01T17:00:00+05:30\"}");     // the same step again counts once
        mvc.perform(get("/api/dashboard").header("Authorization", io)).andExpect(jsonPath("$.pocso_open[0].open_steps").value(5));
        mvc.perform(get("/api/dashboard").header("Authorization", outsider)).andExpect(jsonPath("$.pocso_open.length()").value(0));   // not on the team
        for (String st : new String[] {"cwc_court_report", "medical_examination", "statement_chosen_place", "magistrate_statement", "interim_compensation"})
            record(io, "{\"step\":\"" + st + "\",\"doneAt\":\"2026-10-01T18:00:00+05:30\",\"takenBy\":" + (st.equals("statement_chosen_place") ? "\"" + ioId + "\"" : "null") + "}")
                    .andExpect(status().isCreated());
        mvc.perform(get("/api/dashboard").header("Authorization", io)).andExpect(jsonPath("$.pocso_open.length()").value(0));
    }

    UUID childStatement(String role, int age) {
        UUID person = db.sql("insert into person (fir_id, role, label, identity_known, age_years) values (?, ?, 'V1', false, ?) returning id")
                .params(fir, role, age).query(UUID.class).single();
        return db.sql("insert into witness_statement (fir_id, person_id, recorded_by, language, medium, original_text) values (?,?,?,'mr','video','Fictional words of the child') returning id")
                .params(fir, person, ioId).query(UUID.class).single();
    }

    @Test
    void theStatementAtTheChildsPlaceNamesTheOfficerAndTheReadinessCheckWantsAWomanOfficerFromTheRecord() throws Exception {
        pocsoSection();
        String at = "\"doneAt\":\"2026-10-01T18:00:00+05:30\"";
        record(io, "{\"step\":\"statement_chosen_place\"," + at + "}").andExpect(status().isBadRequest())
                .andExpect(status().reason("Name the officer who took the statement (POCSO 24: a woman officer)."));
        record(io, "{\"step\":\"medical_examination\"," + at + ",\"takenBy\":\"" + ioId + "\"}").andExpect(status().isBadRequest())
                .andExpect(status().reason("Only the statement at the child's place names who took it."));
        UUID other = db.sql("insert into police_station (state_code, district_id, name) values ('IN',district_id_of('IN','Testpur'),'Other PS') returning id")
                .query(UUID.class).single();
        UUID away = db.sql("insert into app_user (station_id, full_name, rank, role, gender) values (?,'SI Fictional Away','SI','io','female') returning id")
                .param(other).query(UUID.class).single();
        record(io, "{\"step\":\"statement_chosen_place\"," + at + ",\"takenBy\":\"" + away + "\"}").andExpect(status().isBadRequest())
                .andExpect(status().reason("The officer must be posted at this police station."));
        // no gender on the account: a gap, and the screen is told "not recorded as a woman" without any gender being sent
        record(io, "{\"step\":\"statement_chosen_place\"," + at + ",\"takenBy\":\"" + ioId + "\"}").andExpect(status().isCreated());
        mvc.perform(get("/api/firs/" + fir + "/pocso").header("Authorization", io))
                .andExpect(jsonPath("$.steps[2].taken_by_name").value("SI Fictional Woman")).andExpect(jsonPath("$.steps[2].woman_officer").value(false))
                .andExpect(jsonPath("$.officers.length()").value(4)).andExpect(jsonPath("$.officers[0].gender").doesNotExist())
                .andExpect(jsonPath("$.steps[0].taken_by_name").doesNotExist()).andExpect(jsonPath("$.steps[0].woman_officer").doesNotExist());
        mvc.perform(get(readiness()).header("Authorization", io))
                .andExpect(jsonPath("$.gaps[?(@.key == 'pocso-woman-officer')].severity").value("high"))
                .andExpect(jsonPath("$.gaps[?(@.key == 'pocso-step:statement_chosen_place')]").isEmpty());
        db.sql("update app_user set gender = 'male' where id = ?").param(ioId).update();
        mvc.perform(get(readiness()).header("Authorization", io)).andExpect(jsonPath("$.gaps[?(@.key == 'pocso-woman-officer')]").isNotEmpty());
        // the gap can be accepted in writing; once the admin has set the gender (or the step is recorded again with a woman) it is gone
        db.sql("update app_user set gender = 'female' where id = ?").param(ioId).update();
        mvc.perform(get(readiness()).header("Authorization", io)).andExpect(jsonPath("$.gaps[?(@.key == 'pocso-woman-officer')]").isEmpty());
        mvc.perform(get("/api/firs/" + fir + "/pocso").header("Authorization", io)).andExpect(jsonPath("$.steps[2].woman_officer").value(true));
        // the latest record counts: recorded again with an officer who is not a woman
        UUID man = db.sql("insert into app_user (station_id, full_name, rank, role, gender) values (?,'SI Fictional Man','SI','io','male') returning id")
                .param(ioStation).query(UUID.class).single();
        record(io, "{\"step\":\"statement_chosen_place\"," + at + ",\"takenBy\":\"" + man + "\"}").andExpect(status().isCreated());
        mvc.perform(get(readiness()).header("Authorization", io)).andExpect(jsonPath("$.gaps[?(@.key == 'pocso-woman-officer')]").isNotEmpty());
        mvc.perform(post(readiness() + "/overrides").header("Authorization", io).contentType(MediaType.APPLICATION_JSON)
                .content("{\"gapKey\":\"pocso-woman-officer\",\"reason\":\"No woman officer at the station that day; a woman doctor was present\"}"))
                .andExpect(status().isCreated());
        mvc.perform(get(readiness()).header("Authorization", io)).andExpect(jsonPath("$.gaps[?(@.key == 'pocso-woman-officer')].override.reason").isNotEmpty());
    }

    @Test
    void aStepReusesTheChildsOneRecordedStatementAndASecondStatementIsAGap() throws Exception {
        pocsoSection();
        UUID first = childStatement("victim", 12);
        String at = "\"doneAt\":\"2026-10-01T18:00:00+05:30\"";
        record(io, "{\"step\":\"magistrate_statement\"," + at + ",\"statementId\":\"" + first + "\"}").andExpect(status().isCreated());
        record(io, "{\"step\":\"support_person\"," + at + ",\"statementId\":\"" + first + "\"}").andExpect(status().isBadRequest())
                .andExpect(status().reason("Only a statement step names the recorded statement."));
        record(io, "{\"step\":\"magistrate_statement\"," + at + ",\"statementId\":\"" + UUID.randomUUID() + "\"}").andExpect(status().isBadRequest())
                .andExpect(status().reason("The statement must be one of a child victim of this FIR."));
        record(io, "{\"step\":\"magistrate_statement\"," + at + ",\"statementId\":\"" + childStatement("witness", 10) + "\"}").andExpect(status().isBadRequest());
        mvc.perform(get("/api/firs/" + fir + "/pocso").header("Authorization", io))
                .andExpect(jsonPath("$.steps[3].statement_id").value(first.toString())).andExpect(jsonPath("$.steps[3].statement_medium").value("video"))
                .andExpect(jsonPath("$.child_statements.length()").value(1)).andExpect(jsonPath("$.child_statements[0].original_text").doesNotExist());
        mvc.perform(get(readiness()).header("Authorization", io)).andExpect(jsonPath("$.gaps[?(@.key == 'pocso-repeat-statement')]").isEmpty());
        // a second statement of the same child: the child is asked to repeat the account
        UUID child = db.sql("select person_id from witness_statement where id = ?").param(first).query(UUID.class).single();
        db.sql("insert into witness_statement (fir_id, person_id, recorded_by, language, medium, original_text) values (?,?,?,'mr','written','Fictional second statement')")
                .params(fir, child, ioId).update();
        mvc.perform(get(readiness()).header("Authorization", io)).andExpect(jsonPath("$.gaps[?(@.key == 'pocso-repeat-statement')].severity").value("high"));
    }
}
