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
        UUID station = db.sql("insert into police_station (state_code, district_id, name) values ('IN',district_id_of('IN','Testpur'),'Testpur City') returning id")
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

    org.springframework.test.web.servlet.ResultActions update(String who, String body) throws Exception {
        return mvc.perform(post("/api/firs/" + fir + "/victim-updates").header("Authorization", who).contentType(MediaType.APPLICATION_JSON).content(body));
    }

    /** BNSS 193(3)(ii): once the progress update is recorded the 90-day deadline is done; nothing else changes. */
    @Test
    void aRecordedProgressUpdateEndsTheVictimUpdateDeadline() throws Exception {
        String ok = "{\"givenOn\":\"2026-10-20\",\"toldTo\":\"victim\",\"means\":\"phone\"}";
        update(outsider, ok).andExpect(status().isForbidden());
        update(malkhana, ok).andExpect(status().isForbidden());
        update(sho, ok.replace("2026-10-20", "2026-09-30")).andExpect(status().isBadRequest())
                .andExpect(status().reason("The update cannot be before the FIR was registered."));
        String tomorrow = java.time.LocalDate.now(java.time.ZoneId.of("Asia/Kolkata")).plusDays(1).toString();
        update(sho, ok.replace("2026-10-20", tomorrow)).andExpect(status().isBadRequest())
                .andExpect(status().reason("The day the update was given cannot be in the future."));
        update(sho, ok.replace("victim\"", "neighbour\"")).andExpect(status().isBadRequest());
        update(sho, ok.replace("phone", "pigeon")).andExpect(status().isBadRequest());
        update(sho, "{\"toldTo\":\"victim\",\"means\":\"phone\"}").andExpect(status().isBadRequest());
        mvc.perform(get("/api/firs/" + fir + "/victim-updates").header("Authorization", sho)).andExpect(jsonPath("$.length()").value(0));
        mvc.perform(get("/api/firs/" + fir + "/deadlines").header("Authorization", sho)).andExpect(jsonPath("$[?(@.kind=='victim_progress_update')]").isNotEmpty());
        update(sho, ok).andExpect(status().isCreated()).andExpect(jsonPath("$.id").isNotEmpty());
        mvc.perform(get("/api/firs/" + fir + "/deadlines").header("Authorization", sho)).andExpect(jsonPath("$[?(@.kind=='victim_progress_update')]").isEmpty());
        mvc.perform(get("/api/firs/" + fir + "/victim-updates").header("Authorization", sho)).andExpect(jsonPath("$[0].given_on").value("2026-10-20"))
                .andExpect(jsonPath("$[0].told_to").value("victim")).andExpect(jsonPath("$[0].means").value("phone"))
                .andExpect(jsonPath("$[0].recorded_by_name").value("Insp Fictional Head"));
        mvc.perform(get("/api/firs/" + fir + "/victim-updates").header("Authorization", outsider)).andExpect(status().isNotFound());
    }

    /** A7: the letter's generic steps are read from the case as yes/no only; a masked person's statement does not count. */
    @Test
    void progressStepsAreFourYesNoAnswersReadFromTheCase() throws Exception {
        String url = "/api/firs/" + fir + "/progress-steps";
        mvc.perform(get(url).header("Authorization", sho)).andExpect(status().isOk()).andExpect(jsonPath("$.evidence").value(true))
                .andExpect(jsonPath("$.statements").value(false)).andExpect(jsonPath("$.enquiries").value(false)).andExpect(jsonPath("$.expert").value(false));
        UUID me = db.sql("select id from app_user where role = 'sho'").query(UUID.class).single();
        UUID w = db.sql("insert into person (fir_id, role, label, full_name, identity_masked) values (?, 'witness', 'W1', 'Fictional Witness', true) returning id").param(fir).query(UUID.class).single();
        db.sql("insert into witness_statement (fir_id, person_id, recorded_by, language, medium, original_text) values (?,?,?,'en','written','Fictional statement')").params(fir, w, me).update();
        mvc.perform(get(url).header("Authorization", sho)).andExpect(jsonPath("$.statements").value(false));
        db.sql("update person set identity_masked = false where id = ?").param(w).update();
        db.sql("insert into notice (fir_id, kind, addressee, items_requested, body, issued_at, reply_due_on, status, signed_by) values (?, 'BNSS_94', 'Fictional Bank', array['Statement'], 'Fictional body', now(), current_date + 7, 'sent', ?)").params(fir, me).update();
        db.sql("insert into expert_request (fir_id, kind, subject, sent_to, sent_on, recorded_by) values (?, 'forensic', 'Fictional phone', 'Fictional Lab', date '2026-10-03', ?)").params(fir, me).update();
        mvc.perform(get(url).header("Authorization", sho)).andExpect(jsonPath("$.statements").value(true)).andExpect(jsonPath("$.enquiries").value(true))
                .andExpect(jsonPath("$.expert").value(true));
        for (String who : new String[] {malkhana, outsider}) mvc.perform(get(url).header("Authorization", who)).andExpect(status().isNotFound());
    }

    /** A7: the letter opens in the language kept on the victim's record, else the informant's; one code, no name; a wrong code is refused. */
    @Test
    void victimLanguageIsReadFromThePersonsRecord() throws Exception {
        String url = "/api/firs/" + fir + "/victim-language";
        mvc.perform(get(url).header("Authorization", sho)).andExpect(status().isOk()).andExpect(jsonPath("$.language").isEmpty());
        String person = "{\"role\":\"%s\",\"label\":\"%s\",\"identityKnown\":true,\"fullName\":\"Fictional Person\",\"language\":%s}";
        java.util.function.BiFunction<String, String, org.springframework.test.web.servlet.ResultActions> add = (role, lang) -> {
            try {
                return mvc.perform(post("/api/firs/" + fir + "/people").header("Authorization", sho).contentType(MediaType.APPLICATION_JSON)
                        .content(person.formatted(role, role.substring(0, 1).toUpperCase() + "1", lang)));
            } catch (Exception e) { throw new IllegalStateException(e); }
        };
        add.apply("witness", "\"ta\"").andExpect(status().isCreated());
        add.apply("complainant", "\"hi\"").andExpect(status().isCreated());
        add.apply("victim", "\"klingon\"").andExpect(status().isBadRequest());
        add.apply("victim", "null").andExpect(status().isCreated());
        mvc.perform(get(url).header("Authorization", sho)).andExpect(jsonPath("$.language").value("hi"));
        add.apply("victim", "\"mr\"").andExpect(status().isCreated());
        mvc.perform(get(url).header("Authorization", sho)).andExpect(jsonPath("$.language").value("mr"));
        for (String who : new String[] {malkhana, outsider}) mvc.perform(get(url).header("Authorization", who)).andExpect(status().isNotFound());
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
    void punishmentHintIsTheHeaviestKnownSectionAndEmptyWhenOneIsUnknown() throws Exception {
        String url = "/api/firs/" + fir + "/punishment-hint";
        for (String s : new String[] {"318(4)", "3(5)"}) db.sql("insert into fir_section (fir_id, act, section) values (?, 'BNS', ?)").params(fir, s).update();
        mvc.perform(get(url).header("Authorization", sho)).andExpect(jsonPath("$.suggested").value("less_than_10_years"))
                .andExpect(jsonPath("$.sections.length()").value(1));
        db.sql("insert into fir_section (fir_id, act, section) values (?, 'BNS', '103(1)')").param(fir).update();
        mvc.perform(get(url).header("Authorization", sho)).andExpect(jsonPath("$.suggested").value("death"));
        db.sql("insert into fir_section (fir_id, act, section) values (?, 'BNS', '999(9)')").param(fir).update();
        mvc.perform(get(url).header("Authorization", sho)).andExpect(jsonPath("$.suggested").doesNotExist())
                .andExpect(jsonPath("$.unknown[0]").value("BNS 999(9)"));
        mvc.perform(get(url).header("Authorization", outsider)).andExpect(status().isNotFound());
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
