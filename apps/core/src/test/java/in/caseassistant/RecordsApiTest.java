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
class RecordsApiTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcClient db;
    @Autowired org.springframework.security.oauth2.jwt.JwtEncoder tokens;
    UUID fir, io;
    String auth;
    static final String SHA = "b".repeat(64);

    @BeforeEach
    void setUp() {
        db.sql("truncate fir, police_station, state_pack, app_user cascade").update();
        db.sql("insert into state_pack (code, name, version, languages) values ('IN','National','1',array['en'])").update();
        UUID station = db.sql("insert into police_station (state_code, district, name) values ('IN','Testpur','Testpur City') returning id")
                .query(UUID.class).single();
        io = db.sql("insert into app_user (station_id, full_name, rank, role) values (?,'SI Asha Rao','SI','io') returning id")
                .param(station).query(UUID.class).single();
        fir = db.sql("""
                insert into fir (station_id, fir_year, fir_no, gd_entry_no, registered_at, information_received_at,
                  contents_original, contents_language, action_taken, io_id)
                values (?,2026,9,'GD-5','2026-10-01T10:00Z','2026-10-01T09:00Z','Fictional complaint','en','investigate',?)
                returning id""").params(station, io).query(UUID.class).single();
        auth = TestAuth.bearer(tokens, io);
    }

    String send(String path, String body, int expected) throws Exception {
        return mvc.perform(post("/api/firs/" + fir + path).header("Authorization", auth).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().is(expected)).andReturn().getResponse().getContentAsString();
    }

    String idOf(String json) {
        return json.replaceAll(".*\"id\":\"([^\"]+)\".*", "$1");
    }

    @Test
    void arrestGivesChargesheetDeadlineAndNeedsGrounds() throws Exception {
        String pid = idOf(send("/people", "{\"role\":\"accused\",\"label\":\"A1\",\"identityKnown\":true,\"fullName\":\"Fictional Accused\"}", 201));
        String arrest = """
                {"personId":"%s","arrestedAt":"2026-09-12T08:00:00Z","place":"Testpur","grounds":["to prevent further offence"],
                 "informedName":"Fictional Relative","firstRemandOn":"2026-09-12","maxPunishment":"less_than_10_years"}""".formatted(pid);
        send("/arrests", arrest, 201);
        mvc.perform(get("/api/firs/" + fir + "/deadlines").header("Authorization", auth)).andExpect(jsonPath("$[?(@.kind=='chargesheet_custody')].due_on").value("2026-11-10"));
        mvc.perform(get("/api/firs/" + fir + "/arrests").header("Authorization", auth))
                .andExpect(jsonPath("$[0].person_label").value("A1"))
                .andExpect(jsonPath("$[0].arresting_officer_name").value("SI Asha Rao"))   // the signed-in officer
                .andExpect(jsonPath("$[0].grounds[0]").value("to prevent further offence"))
                .andExpect(jsonPath("$[0].chargesheet_last_day").value("2026-11-10"))
                .andExpect(jsonPath("$[0].informed_name").value("Fictional Relative"));
        send("/arrests", arrest.replace("[\"to prevent further offence\"]", "[]"), 400);
        send("/arrests", arrest.replace("[\"to prevent further offence\"]", "[\" \"]"), 400);
        send("/arrests", arrest.replace(pid, UUID.randomUUID().toString()), 404);
        send("/arrests", arrest.replace("2026-09-12T08:00:00Z", "2099-01-01T08:00:00Z"), 400);   // in the future
        send("/arrests", arrest.replace("\"2026-09-12\"", "\"2026-09-11\""), 400);             // remand before arrest
        String witness = idOf(send("/people", "{\"role\":\"witness\",\"label\":\"W1\",\"identityKnown\":true,\"fullName\":\"Fictional Witness\"}", 201));
        mvc.perform(post("/api/firs/" + fir + "/arrests").header("Authorization", auth).contentType(MediaType.APPLICATION_JSON)
                .content(arrest.replace(pid, witness))).andExpect(status().isBadRequest())
                .andExpect(status().reason(org.hamcrest.Matchers.startsWith("Only an accused can be arrested")));
    }

    @Test
    void firstRemandIsRecordedOnceAndDecidesTheDeadline() throws Exception {
        String pid = idOf(send("/people", "{\"role\":\"accused\",\"label\":\"A2\",\"identityKnown\":false}", 201));
        // 00:30 IST on 12 Sep is still 11 Sep in UTC: the arrest day is 12 Sep.
        String arrest = idOf(send("/arrests", """
                {"personId":"%s","arrestedAt":"2026-09-12T00:30:00+05:30","place":"Testpur","grounds":["proper investigation"],
                 "informedName":"Fictional Friend","informedContact":"Fictional contact","maxPunishment":"life"}""".formatted(pid), 201));
        mvc.perform(get("/api/firs/" + fir + "/deadlines").header("Authorization", auth)).andExpect(jsonPath("$[?(@.kind=='chargesheet_custody')]").isEmpty());
        send("/arrests/" + arrest + "/first-remand", "{\"firstRemandOn\":\"2026-09-11\"}", 400);
        send("/arrests/" + UUID.randomUUID() + "/first-remand", "{\"firstRemandOn\":\"2026-09-13\"}", 404);
        send("/arrests/" + arrest + "/first-remand", "{\"firstRemandOn\":\"2026-09-13\"}", 204);
        send("/arrests/" + arrest + "/first-remand", "{\"firstRemandOn\":\"2026-09-14\"}", 409);
        mvc.perform(get("/api/firs/" + fir + "/arrests").header("Authorization", auth))
                .andExpect(jsonPath("$[0].chargesheet_last_day").value("2026-12-11"))   // 90 days, 13 Sep is day 1
                .andExpect(jsonPath("$[0].remand_recorded_by_name").value("SI Asha Rao"));
        // someone outside the case team cannot read the case at all (404), and cannot write to it
        UUID other = db.sql("insert into app_user (full_name, rank, role) values ('Fictional Prosecutor','APP','prosecutor') returning id")
                .query(UUID.class).single();
        mvc.perform(get("/api/firs/" + fir + "/arrests").header("Authorization", TestAuth.bearer(tokens, other)))
                .andExpect(status().isNotFound());
        mvc.perform(post("/api/firs/" + fir + "/arrests/" + arrest + "/first-remand").header("Authorization", TestAuth.bearer(tokens, other))
                .contentType(MediaType.APPLICATION_JSON).content("{\"firstRemandOn\":\"2026-09-13\"}")).andExpect(status().isForbidden());
    }

    @Test
    void closureReportIsRecordedOnceEndsTheTwoMonthLimitButNotTheCustodyLimit() throws Exception {
        db.sql("update fir set sexual_offence = true").update();
        String a1 = idOf(send("/people", "{\"role\":\"accused\",\"label\":\"A1\",\"identityKnown\":false}", 201));
        send("/arrests", """
                {"personId":"%s","arrestedAt":"2026-10-02T10:00:00+05:30","place":"Testpur","grounds":["proper investigation"],
                 "informedName":"Fictional Relative","firstRemandOn":"2026-10-02","maxPunishment":"less_than_10_years"}""".formatted(a1), 201);
        mvc.perform(get("/api/firs/" + fir + "/deadlines").header("Authorization", auth))
                .andExpect(jsonPath("$[?(@.kind=='sexual_offence_investigation')]").isNotEmpty());
        String c = "{\"filedOn\":\"%s\",\"court\":\"Fictional JMFC Court\",\"reportNo\":\"FR-1\",\"ground\":\"%s\",\"reason\":\"%s\"%s}";
        send("/closure-report", c.formatted("2026-09-30", "untraced", "accused could not be traced", ""), 400);          // before the FIR
        send("/closure-report", c.formatted("2099-10-20", "untraced", "accused could not be traced", ""), 400);       // future
        send("/closure-report", c.formatted("2026-10-20", "guilty", "accused could not be traced", ""), 400);         // not a listed ground
        send("/closure-report", c.formatted("2026-10-20", "untraced", "short", ""), 400);                              // reason too short
        send("/closure-report", c.formatted("2026-10-20", "untraced", "accused could not be traced", ",\"informantInformedOn\":\"2026-10-19\""), 400);
        send("/closure-report", c.formatted("2026-10-20", "untraced", "accused could not be traced", ",\"informantInformedOn\":\"2026-10-21\""), 201);
        send("/closure-report", c.formatted("2026-10-22", "untraced", "accused could not be traced", ""), 409);        // once per case
        mvc.perform(get("/api/firs/" + fir + "/deadlines").header("Authorization", auth))
                .andExpect(jsonPath("$[?(@.kind=='sexual_offence_investigation')]").isEmpty())
                .andExpect(jsonPath("$[?(@.kind=='chargesheet_custody')]").isNotEmpty());
        mvc.perform(get("/api/firs/" + fir + "/closure-report").header("Authorization", auth))
                .andExpect(jsonPath("$[0].ground").value("untraced")).andExpect(jsonPath("$[0].informant_informed_on").value("2026-10-21"))
                .andExpect(jsonPath("$[0].recorded_by_name").value("SI Asha Rao"));
    }

    @Test
    void closureReportCanBeCorrectedAndTheMagistratesDecisionRecordedOnce() throws Exception {
        String c = "{\"filedOn\":\"%s\",\"court\":\"Fictional JMFC Court\",\"reportNo\":\"%s\",\"ground\":\"untraced\",\"reason\":\"accused could not be traced\"%s}";
        String fix = "{\"filedOn\":\"%s\",\"court\":\"Fictional JMFC Court\",\"reportNo\":\"FR-1A\",\"ground\":\"other\",\"reason\":\"corrected written reason\",\"correctionReason\":\"%s\"}";
        send("/closure-report/corrections", fix.formatted("2026-10-20", "report number was wrong"), 404);          // nothing to correct yet
        send("/closure-report/decision", "{\"decision\":\"accepted\",\"decidedOn\":\"2026-10-22\"}", 404);
        send("/closure-report", c.formatted("2026-10-20", "FR-1", ""), 201);
        send("/closure-report/corrections", fix.formatted("2026-10-20", "short"), 400);                         // reason too short
        send("/closure-report/corrections", fix.formatted("2099-10-20", "report number was wrong"), 400);      // future
        send("/closure-report/corrections", fix.formatted("2026-09-30", "report number was wrong"), 400);      // before the FIR
        send("/closure-report/corrections", fix.formatted("2026-10-20", "report number was wrong"), 201);
        send("/closure-report/corrections", fix.formatted("2026-10-21", "the date was also wrong"), 201);
        mvc.perform(get("/api/firs/" + fir + "/closure-report").header("Authorization", auth))
                .andExpect(jsonPath("$[0].report_no").value("FR-1A")).andExpect(jsonPath("$[0].filed_on").value("2026-10-21"))
                .andExpect(jsonPath("$[0].corrected").value(true)).andExpect(jsonPath("$[0].decision").doesNotExist());
        mvc.perform(get("/api/firs/" + fir + "/closure-report/corrections").header("Authorization", auth))
                .andExpect(jsonPath("$.length()").value(2)).andExpect(jsonPath("$[0].correction_reason").value("report number was wrong"));
        send("/closure-report/decision", "{\"decision\":\"guilty\",\"decidedOn\":\"2026-10-22\"}", 400);
        send("/closure-report/decision", "{\"decision\":\"accepted\",\"decidedOn\":\"2026-10-20\"}", 400);   // before the (corrected) filing day
        send("/closure-report/decision", "{\"decision\":\"accepted\",\"decidedOn\":\"2099-10-22\"}", 400);
        send("/closure-report/decision", "{\"decision\":\"further_investigation\",\"decidedOn\":\"2026-10-22\",\"note\":\"order no. 5 of the fictional court\"}", 201);
        send("/closure-report/decision", "{\"decision\":\"accepted\",\"decidedOn\":\"2026-10-23\"}", 409);   // once
        mvc.perform(get("/api/firs/" + fir + "/closure-report").header("Authorization", auth))
                .andExpect(jsonPath("$[0].decision").value("further_investigation")).andExpect(jsonPath("$[0].decision_note").value("order no. 5 of the fictional court"));
    }

    @Test
    void closureReportIsRefusedWhileAChargesheetStands() throws Exception {
        String a1 = idOf(send("/people", "{\"role\":\"accused\",\"label\":\"A1\",\"identityKnown\":false}", 201));
        send("/chargesheets", "{\"filedOn\":\"2026-10-20\",\"court\":\"Fictional JMFC Court\",\"reportNo\":\"CS-1\",\"accusedIds\":[\"" + a1 + "\"]}", 201);
        send("/closure-report", "{\"filedOn\":\"2026-10-21\",\"court\":\"Fictional JMFC Court\",\"reportNo\":\"FR-1\",\"ground\":\"other\",\"reason\":\"written reason here\"}", 409);
    }

    @Test
    void releaseAndChargesheetEndTheCustodyLimitAndAreRecordedOnce() throws Exception {
        String memo = """
                {"personId":"%s","arrestedAt":"%s","place":"Testpur","grounds":["proper investigation"],
                 "informedName":"Fictional Relative","firstRemandOn":"%s","maxPunishment":"less_than_10_years"}""";
        String a1 = idOf(send("/people", "{\"role\":\"accused\",\"label\":\"A1\",\"identityKnown\":false}", 201));
        String a2 = idOf(send("/people", "{\"role\":\"accused\",\"label\":\"A2\",\"identityKnown\":false}", 201));
        String r1 = idOf(send("/arrests", memo.formatted(a1, "2026-10-02T10:00:00+05:30", "2026-10-02"), 201));   // last day 30 Nov
        send("/arrests", memo.formatted(a2, "2026-10-05T10:00:00+05:30", "2026-10-05"), 201);                     // last day 3 Dec
        var deadline = jsonPath("$[?(@.kind=='chargesheet_custody')].due_on");
        mvc.perform(get("/api/firs/" + fir + "/deadlines").header("Authorization", auth)).andExpect(deadline.value("2026-11-30"));
        send("/arrests/" + r1 + "/release", "{\"releasedOn\":\"2026-10-01\",\"basis\":\"bail\"}", 400);   // before the arrest
        send("/arrests/" + r1 + "/release", "{\"releasedOn\":\"2099-10-01\",\"basis\":\"bail\"}", 400);   // future
        send("/arrests/" + r1 + "/release", "{\"releasedOn\":\"2026-10-09\",\"basis\":\"mercy\"}", 400);
        send("/arrests/" + r1 + "/release", "{\"releasedOn\":\"2026-10-09\",\"basis\":\"bail\"}", 204);
        send("/arrests/" + r1 + "/release", "{\"releasedOn\":\"2026-10-10\",\"basis\":\"bail\"}", 409);
        mvc.perform(get("/api/firs/" + fir + "/deadlines").header("Authorization", auth)).andExpect(deadline.value("2026-12-03"));
        String cs = "{\"filedOn\":\"%s\",\"court\":\"Fictional JMFC Court\",\"reportNo\":\"%s\",\"accusedIds\":[%s]}";
        send("/chargesheets", cs.formatted("2026-09-30", "CS-1", "\"" + a2 + "\""), 400);                  // before the FIR
        send("/chargesheets", cs.formatted("2026-10-20", "CS-1", ""), 400);                                  // names nobody
        String witness = idOf(send("/people", "{\"role\":\"witness\",\"label\":\"W1\",\"identityKnown\":false}", 201));
        send("/chargesheets", cs.formatted("2026-10-20", "CS-1", "\"" + witness + "\""), 400);
        send("/chargesheets", cs.formatted("2026-10-20", "CS-1", "\"" + a2 + "\""), 201);
        send("/chargesheets", cs.formatted("2026-10-21", "CS-1", "\"" + a1 + "\""), 400);                  // same number twice
        mvc.perform(get("/api/firs/" + fir + "/deadlines").header("Authorization", auth)).andExpect(jsonPath("$[?(@.kind=='chargesheet_custody')]").isEmpty());
        mvc.perform(get("/api/firs/" + fir + "/chargesheets").header("Authorization", auth))
                .andExpect(jsonPath("$[0].accused").value("A2")).andExpect(jsonPath("$[0].recorded_by_name").value("SI Asha Rao"));
        mvc.perform(get("/api/firs/" + fir + "/arrests").header("Authorization", auth))
                .andExpect(jsonPath("$[0].released_on").value("2026-10-09")).andExpect(jsonPath("$[0].release_basis").value("bail"))
                .andExpect(jsonPath("$[1].chargesheet_filed_on").value("2026-10-20"))
                .andExpect(jsonPath("$[1].chargesheet_last_day").value("2026-12-03"));
    }

    @Test
    void wrongRemandReleaseAndChargesheetAreFixedByCorrectionsThatKeepTheOldRecord() throws Exception {
        String a1 = idOf(send("/people", "{\"role\":\"accused\",\"label\":\"A1\",\"identityKnown\":false}", 201));
        String arrest = idOf(send("/arrests", """
                {"personId":"%s","arrestedAt":"2026-10-02T10:00:00+05:30","place":"Testpur","grounds":["proper investigation"],
                 "informedName":"Fictional Relative","firstRemandOn":"2026-10-02","maxPunishment":"less_than_10_years"}""".formatted(a1), 201));
        var deadline = jsonPath("$[?(@.kind=='chargesheet_custody')].due_on");
        mvc.perform(get("/api/firs/" + fir + "/deadlines").header("Authorization", auth)).andExpect(deadline.value("2026-11-30"));
        String fix = "{\"firstRemandOn\":%s,\"maxPunishment\":\"%s\",\"releasedOn\":%s,\"releaseBasis\":%s,\"reason\":\"%s\"}";
        String why = "remand was on the 4th";
        send("/arrests/" + arrest + "/corrections", fix.formatted("\"2026-10-01\"", "life", "null", "null", why), 400);              // before the arrest
        send("/arrests/" + arrest + "/corrections", fix.formatted("\"2026-10-04\"", "life", "null", "null", "typo"), 400);         // reason too short
        send("/arrests/" + arrest + "/corrections", fix.formatted("\"2026-10-04\"", "life", "\"2026-10-09\"", "null", why), 400);  // release needs a basis
        send("/arrests/" + arrest + "/corrections", fix.formatted("\"2026-10-04\"", "life", "\"2099-10-09\"", "\"bail\"", why), 400); // future
        send("/arrests/" + UUID.randomUUID() + "/corrections", fix.formatted("\"2026-10-04\"", "life", "null", "null", why), 404);
        send("/arrests/" + arrest + "/corrections", fix.formatted("\"2026-10-04\"", "life", "null", "null", why), 201);
        mvc.perform(get("/api/firs/" + fir + "/deadlines").header("Authorization", auth)).andExpect(deadline.value("2027-01-01"));   // 90 days from 4 Oct
        send("/arrests/" + arrest + "/corrections", fix.formatted("\"2026-10-04\"", "life", "\"2026-10-09\"", "\"bail\"", "release was entered on the right day"), 201);
        mvc.perform(get("/api/firs/" + fir + "/deadlines").header("Authorization", auth)).andExpect(jsonPath("$[?(@.kind=='chargesheet_custody')]").isEmpty());
        send("/arrests/" + arrest + "/release", "{\"releasedOn\":\"2026-10-10\",\"basis\":\"bail\"}", 409);   // use a correction now
        mvc.perform(get("/api/firs/" + fir + "/arrests").header("Authorization", auth))
                .andExpect(jsonPath("$[0].corrected").value(true)).andExpect(jsonPath("$[0].released_on").value("2026-10-09"))
                .andExpect(jsonPath("$[0].first_remand_on").value("2026-10-04"));
        mvc.perform(get("/api/firs/" + fir + "/arrests/corrections").header("Authorization", auth))
                .andExpect(jsonPath("$.length()").value(2)).andExpect(jsonPath("$[0].reason").value(why));

        String cs = "{\"filedOn\":\"2026-10-20\",\"court\":\"Fictional JMFC Court\",\"reportNo\":\"CS-1\",\"accusedIds\":[\"%s\"]}";
        String first = idOf(send("/chargesheets", cs.formatted(a1), 201));
        String csFix = "{\"filedOn\":\"2026-10-21\",\"court\":\"Fictional JMFC Court\",\"reportNo\":\"CS-1\",\"accusedIds\":[%s],\"reason\":\"%s\"}";
        send("/chargesheets/" + first + "/corrections", csFix.formatted("\"" + a1 + "\"", "typo"), 400);
        send("/chargesheets/" + first + "/corrections", csFix.formatted("", "date was the 21st, not the 20th"), 400);    // names nobody
        send("/chargesheets/" + UUID.randomUUID() + "/corrections", csFix.formatted("\"" + a1 + "\"", "date was the 21st, not the 20th"), 404);
        send("/chargesheets/" + first + "/corrections", csFix.formatted("\"" + a1 + "\"", "date was the 21st, not the 20th"), 201);
        send("/chargesheets/" + first + "/corrections", csFix.formatted("\"" + a1 + "\"", "replacing it a second time"), 409);
        mvc.perform(get("/api/firs/" + fir + "/chargesheets").header("Authorization", auth))
                .andExpect(jsonPath("$.length()").value(2)).andExpect(jsonPath("$[0].replaced").value(true))
                .andExpect(jsonPath("$[1].replaced").value(false)).andExpect(jsonPath("$[1].filed_on").value("2026-10-21"));
        mvc.perform(get("/api/firs/" + fir + "/arrests").header("Authorization", auth)).andExpect(jsonPath("$[0].chargesheet_filed_on").value("2026-10-21"));
        mvc.perform(post("/api/firs/" + fir + "/arrests/" + arrest + "/corrections").header("Authorization", TestAuth.bearer(tokens, UUID.randomUUID()))
                .contentType(MediaType.APPLICATION_JSON).content(fix.formatted("null", "life", "null", "null", why))).andExpect(status().is4xxClientError());
    }

    @Test
    void wrongPlaceGroundsOrInformedPersonAreFixedByMemoCorrectionsThatKeepTheOldMemo() throws Exception {
        String a1 = idOf(send("/people", "{\"role\":\"accused\",\"label\":\"A1\",\"identityKnown\":false}", 201));
        String arrest = idOf(send("/arrests", """
                {"personId":"%s","arrestedAt":"2026-10-02T10:00:00+05:30","place":"Testpur","grounds":["proper investigation"],
                 "informedName":"Fictional Relative","informedContact":"000","maxPunishment":"less_than_10_years"}""".formatted(a1), 201));
        String fix = "{\"place\":\"%s\",\"grounds\":[%s],\"informedName\":\"Fictional Friend\",\"reason\":\"%s\"}";
        String why = "place was the market, not the road";
        send("/arrests/" + arrest + "/memo-corrections", fix.formatted("Testpur Market", "\"to prevent escape\"", "typo"), 400);
        send("/arrests/" + arrest + "/memo-corrections", fix.formatted("Testpur Market", "", why), 400);       // no grounds
        send("/arrests/" + arrest + "/memo-corrections", fix.formatted(" ", "\"to prevent escape\"", why), 400);   // no place
        send("/arrests/" + UUID.randomUUID() + "/memo-corrections", fix.formatted("Testpur Market", "\"to prevent escape\"", why), 404);
        send("/arrests/" + arrest + "/memo-corrections", fix.formatted("Testpur Market", "\"to prevent escape\"", why), 201);
        send("/arrests/" + arrest + "/memo-corrections", fix.formatted("Testpur Bus Stand", "\"to prevent escape\",\"proper investigation\"", "second look at the memo"), 201);
        mvc.perform(get("/api/firs/" + fir + "/arrests").header("Authorization", auth))
                .andExpect(jsonPath("$[0].memo_corrected").value(true)).andExpect(jsonPath("$[0].place").value("Testpur Bus Stand"))
                .andExpect(jsonPath("$[0].grounds.length()").value(2)).andExpect(jsonPath("$[0].informed_name").value("Fictional Friend"))
                .andExpect(jsonPath("$[0].informed_contact").doesNotExist());
        mvc.perform(get("/api/firs/" + fir + "/arrests/memo-corrections").header("Authorization", auth))
                .andExpect(jsonPath("$.length()").value(2)).andExpect(jsonPath("$[0].place").value("Testpur Market")).andExpect(jsonPath("$[0].reason").value(why));
        mvc.perform(post("/api/firs/" + fir + "/arrests/" + arrest + "/memo-corrections").header("Authorization", TestAuth.bearer(tokens, UUID.randomUUID()))
                .contentType(MediaType.APPLICATION_JSON).content(fix.formatted("X", "\"y\"", why))).andExpect(status().is4xxClientError());
    }

    @Test
    void electronicEvidenceNeedsHashAndBecomesCourtReadyWithBothCertificates() throws Exception {
        String base = "\"label\":\"E-01\",\"description\":\"Fictional phone\",\"kind\":\"electronic\",\"seizedAt\":\"2026-10-02T10:00:00Z\",\"seizureMemo\":\"SM-1\"";
        send("/evidence", "{" + base + "}", 400);
        String item = idOf(send("/evidence", "{" + base + ",\"sha256\":\"" + SHA.toUpperCase() + "\"}", 201));
        send("/evidence", "{" + base + ",\"sha256\":\"" + SHA + "\"}", 400); // duplicate label
        String cert = "{\"part\":\"%s\",\"signerName\":\"Fictional Signer\",\"deviceType\":\"phone\",\"hashAlgo\":\"SHA256\","
                + "\"hashValue\":\"%s\",\"signedAt\":\"2026-10-03T10:00:00Z\",\"place\":\"Testpur\"}";
        send("/evidence/" + item + "/certificates", cert.formatted("A", SHA), 201);
        String wrongB = idOf(send("/evidence/" + item + "/certificates", cert.formatted("B", "c".repeat(64)), 201));
        mvc.perform(get("/api/firs/" + fir + "/evidence").header("Authorization", auth)).andExpect(jsonPath("$[0].court_ready").value(false));
        send("/evidence/" + item + "/certificates", cert.formatted("A", SHA), 400); // part A twice
        String fix = cert.formatted("B", SHA).replace("}", ",\"supersedes\":\"" + wrongB + "\"%s}");
        send("/evidence/" + item + "/certificates", fix.formatted(""), 400); // a correction needs a reason
        send("/evidence/" + item + "/certificates", fix.formatted(",\"correctionReason\":\"hash re-read from the device\""), 201);
        mvc.perform(get("/api/firs/" + fir + "/evidence").header("Authorization", auth)).andExpect(jsonPath("$[0].court_ready").value(true));
    }

    @Test
    void noticeNeedsSignerToBeSentAndReplyChecksSetStatus() throws Exception {
        String n = "{\"kind\":\"BNSS_94\",\"addressee\":\"Fictional Bank Nodal Officer\",\"itemsRequested\":[\"statement\",\"Part B certificate\"],\"body\":\"Please produce.\"%s}";
        send("/notices", n.formatted(",\"status\":\"sent\""), 400); // sent without an issue date
        send("/notices", n.replace("\"itemsRequested\":[\"statement\",\"Part B certificate\"],", ""). formatted(""), 400); // 94 needs items
        String id = idOf(send("/notices", n.formatted(",\"issuedAt\":\"2026-10-05T10:00:00Z\",\"replyDueOn\":\"2026-10-12\",\"status\":\"sent\""), 201));
        send("/notices/" + id + "/replies", "{\"receivedAt\":\"2026-10-10T10:00:00Z\",\"channel\":\"email\",\"checksJson\":\"[{\\\"item\\\":\\\"statement\\\",\\\"present\\\":true},{\\\"item\\\":\\\"Part B certificate\\\",\\\"present\\\":false}]\"}", 201);
        mvc.perform(get("/api/firs/" + fir + "/notices").header("Authorization", auth)).andExpect(jsonPath("$[0].status").value("reply_incomplete"))
                .andExpect(jsonPath("$[0].replies").value(1));
        send("/notices/" + id + "/replies", "{\"receivedAt\":\"2026-10-11T10:00:00Z\",\"channel\":\"post\",\"checksJson\":\"[{\\\"item\\\":\\\"Part B certificate\\\",\\\"present\\\":true}]\"}", 201); // brings only the missing item
        mvc.perform(get("/api/firs/" + fir + "/notices").header("Authorization", auth)).andExpect(jsonPath("$[0].status").value("complete"));
        send("/notices/" + UUID.randomUUID() + "/replies", "{\"receivedAt\":\"2026-10-11T10:00:00Z\",\"channel\":\"post\"}", 404);
        // the signer is the signed-in officer, not a name from the request
        org.assertj.core.api.Assertions.assertThat(db.sql("select signed_by from notice where id = ?::uuid").param(id).query(UUID.class).single()).isEqualTo(io);
    }

    @Test
    void onlyTheCaseTeamAddsRecords() throws Exception {
        UUID station = db.sql("select station_id from fir where id = ?").param(fir).query(UUID.class).single();
        UUID clerk = db.sql("insert into app_user (station_id, full_name, rank, role) values (?,'HC Fictional Clerk','HC','front_desk') returning id")
                .param(station).query(UUID.class).single();
        auth = TestAuth.bearer(tokens, clerk);
        send("/people", "{\"role\":\"witness\",\"label\":\"W1\"}", 403);
        send("/notices", "{\"kind\":\"BNSS_94\",\"addressee\":\"Fictional Bank\",\"itemsRequested\":[\"statement\"],\"body\":\"Please produce.\"}", 403);
        mvc.perform(post("/api/firs/" + UUID.randomUUID() + "/people").header("Authorization", TestAuth.bearer(tokens, io))
                .contentType(MediaType.APPLICATION_JSON).content("{\"role\":\"witness\",\"label\":\"W1\"}")).andExpect(status().isForbidden());
        org.assertj.core.api.Assertions.assertThat(db.sql("select count(*) from person").query(Long.class).single()).isZero();
    }

    @Test
    void emptyOrPartialChecksNeverCloseANotice() throws Exception {
        String n = "{\"kind\":\"BNSS_94\",\"addressee\":\"Fictional Telecom Nodal Officer\",\"itemsRequested\":[\"CDR\",\"Part A certificate\"],"
                + "\"body\":\"Please produce.\",\"issuedAt\":\"2026-10-05T10:00:00Z\",\"status\":\"%s\"}";
        send("/notices", n.formatted("complete"), 400); // a notice cannot be created already complete
        String id = idOf(send("/notices", n.formatted("sent"), 201));
        String reply = "{\"receivedAt\":\"2026-10-10T10:00:00Z\",\"channel\":\"email\"%s}";
        send("/notices/" + id + "/replies", reply.formatted(""), 201);
        mvc.perform(get("/api/firs/" + fir + "/notices").header("Authorization", auth)).andExpect(jsonPath("$[0].status").value("reply_incomplete"));
        // every ticked check is present, but the Part A certificate was never checked
        send("/notices/" + id + "/replies", reply.formatted(",\"checksJson\":\"[{\\\"item\\\":\\\"CDR\\\",\\\"present\\\":true}]\""), 201);
        mvc.perform(get("/api/firs/" + fir + "/notices").header("Authorization", auth)).andExpect(jsonPath("$[0].status").value("reply_incomplete"));
        send("/notices/" + id + "/replies", reply.formatted(",\"checksJson\":\"{\\\"present\\\":true}\""), 400); // not a list
        mvc.perform(get("/api/firs/" + fir + "/notices").header("Authorization", auth)).andExpect(jsonPath("$[0].replies").value(2));
    }

    @Test
    void draftIsSentBySignedInOfficerAndListShowsWhatIsStillMissing() throws Exception {
        String id = idOf(send("/notices", "{\"kind\":\"BNSS_94\",\"addressee\":\"Fictional Bank Nodal Officer\",\"itemsRequested\":[\"statement; Jan-Mar\",\"KYC\"],\"body\":\"Please produce.\"}", 201));
        String reply = "{\"receivedAt\":\"2026-10-10T10:00:00Z\",\"channel\":\"email\",\"checksJson\":\"[{\\\"item\\\":\\\"KYC\\\",\\\"present\\\":true}]\"}";
        send("/notices/" + id + "/replies", reply, 409); // a draft was never sent
        send("/notices/" + id + "/send", "{\"issuedAt\":\"2026-10-05T10:00:00Z\",\"replyDueOn\":\"2026-10-04\"}", 400); // due before issue
        send("/notices/" + id + "/send", "{\"issuedAt\":\"2026-10-05T10:00:00Z\",\"replyDueOn\":\"2026-10-12\"}", 204);
        send("/notices/" + id + "/send", "{\"issuedAt\":\"2026-10-06T10:00:00Z\"}", 409); // only once
        send("/notices/" + id + "/replies", reply, 201);
        mvc.perform(get("/api/firs/" + fir + "/notices").header("Authorization", auth))
                .andExpect(jsonPath("$[0].status").value("reply_incomplete"))
                .andExpect(jsonPath("$[0].items_requested[0]").value("statement; Jan-Mar"))
                .andExpect(jsonPath("$[0].items_missing.length()").value(1))
                .andExpect(jsonPath("$[0].items_missing[0]").value("statement; Jan-Mar"))
                .andExpect(jsonPath("$[0].signed_by_name").value("SI Asha Rao"))
                .andExpect(jsonPath("$[0].ai_drafted").value(false));
        send("/notices", "{\"kind\":\"BNSS_94\",\"addressee\":\"Fictional Telecom\",\"itemsRequested\":[\"CDR\"],\"body\":\"Checked AI draft.\",\"aiRequestId\":\"%s\"}"
                .formatted(UUID.randomUUID()), 201);
        mvc.perform(get("/api/firs/" + fir + "/notices").header("Authorization", auth))
                .andExpect(jsonPath("$[?(@.addressee=='Fictional Telecom')].ai_drafted").value(org.hamcrest.Matchers.contains(true)));
        org.assertj.core.api.Assertions.assertThat(db.sql("select signed_by from notice where id = ?::uuid").param(id).query(UUID.class).single()).isEqualTo(io);
    }

    @Test
    void certificatesAreListedWithTheCorrectionThatReplacedThem() throws Exception {
        String item = idOf(send("/evidence", "{\"label\":\"E-02\",\"description\":\"Fictional laptop\",\"kind\":\"electronic\",\"seizedAt\":\"2026-10-02T10:00:00Z\",\"seizureMemo\":\"SM-2\",\"sha256\":\"" + SHA + "\"}", 201));
        String cert = "{\"part\":\"A\",\"signerName\":\"Fictional Signer\",\"deviceType\":\"laptop\",\"hashAlgo\":\"SHA256\",\"hashValue\":\"%s\",\"signedAt\":\"%s\",\"place\":\"Testpur\"%s}";
        String first = idOf(send("/evidence/" + item + "/certificates", cert.formatted("c".repeat(64), "2026-10-03T10:00:00Z", ""), 201));
        String fix = idOf(send("/evidence/" + item + "/certificates", cert.formatted(SHA, "2026-10-04T10:00:00Z",
                ",\"supersedes\":\"" + first + "\",\"correctionReason\":\"hash re-read from the device\""), 201));
        mvc.perform(get("/api/firs/" + fir + "/evidence/" + item + "/certificates").header("Authorization", auth))
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].replaced_by").value(fix))
                .andExpect(jsonPath("$[1].supersedes").value(first))
                .andExpect(jsonPath("$[1].replaced_by").doesNotExist());
        mvc.perform(get("/api/firs/" + fir + "/evidence/" + UUID.randomUUID() + "/certificates").header("Authorization", auth)).andExpect(status().isNotFound());
    }
}
