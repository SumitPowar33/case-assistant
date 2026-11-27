package in.caseassistant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
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
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/** Incoming 112 events (item 15, V70): who writes, who reads, acknowledging, opening once, and the withheld kinds. Fictional data only. */
@SpringBootTest
@AutoConfigureMockMvc
class Call112ApiTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcClient db;
    @Autowired JwtEncoder tokens;
    @Autowired ObjectMapper json;
    UUID station, far;
    String desk, sho, io, farDesk;

    UUID user(UUID st, String role, String name) {
        return db.sql("insert into app_user (station_id, full_name, rank, role) values (?,?,'SI',?) returning id").params(st, name, role).query(UUID.class).single();
    }

    @BeforeEach
    void setUp() {
        db.sql("truncate fir, police_station, state_pack, app_user cascade").update();
        db.sql("insert into state_pack (code, name, version, languages) values ('IN','National','1',array['en'])").update();
        station = db.sql("insert into police_station (state_code, district_id, name) values ('IN',district_id_of('IN','North'),'Fictional North PS') returning id").query(UUID.class).single();
        far = db.sql("insert into police_station (state_code, district_id, name) values ('IN',district_id_of('IN','South'),'Fictional South PS') returning id").query(UUID.class).single();
        desk = TestAuth.bearer(tokens, user(station, "front_desk", "Fictional Desk"));
        sho = TestAuth.bearer(tokens, user(station, "sho", "Fictional Sho"));
        io = TestAuth.bearer(tokens, user(station, "io", "Fictional Asha"));
        farDesk = TestAuth.bearer(tokens, user(far, "front_desk", "Fictional Far Desk"));
    }

    ResultActions call(MockHttpServletRequestBuilder b, String who, String body) throws Exception {
        b.header("Authorization", who);
        if (body != null) b.contentType(MediaType.APPLICATION_JSON).content(body);
        return mvc.perform(b);
    }

    String event(UUID st, String kind, Instant at) {
        return "{\"stationId\":\"" + st + "\",\"receivedAt\":\"" + at + "\",\"place\":\"Fictional Chowk, North Road\",\"kind\":\"" + kind
                + "\",\"vehicle\":\"Fictional Van 3\",\"callerName\":\"Fictional Caller\",\"callerContact\":\"9000000000\",\"details\":\"Fictional dispute over a parked cart.\"}";
    }

    String add(String who, String kind) throws Exception {
        String r = call(post("/api/calls-112"), who, event(station, kind, Instant.now().minusSeconds(600))).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return json.readTree(r).get("id").asText();
    }

    JsonNode list(String who) throws Exception {
        return json.readTree(call(get("/api/calls-112?stationId=" + station), who, null).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }

    @Test
    void theDutyOfficerWritesAnEventAndEveryoneAtTheStationReadsIt() throws Exception {
        add(desk, "dispute");
        add(sho, "accident");
        var seen = list(io);   // a plain IO reads, does not write
        assertThat(seen.get("rows")).hasSize(2);
        assertThat(seen.get("can_handle").asBoolean()).isFalse();
        assertThat(list(desk).get("can_handle").asBoolean()).isTrue();
        var row = seen.get("rows").get(0);
        assertThat(row.get("place").asText()).isEqualTo("Fictional Chowk, North Road");
        assertThat(row.get("caller_name").asText()).isEqualTo("Fictional Caller");
        assertThat(row.get("withheld").asBoolean()).isFalse();
        assertThat(row.get("acknowledged_at").isNull()).isTrue();
        call(post("/api/calls-112"), io, event(station, "dispute", Instant.now().minusSeconds(60))).andExpect(status().isForbidden());
    }

    @Test
    void anOutsiderOfAnotherStationCannotReadWriteOrTouchAnEvent() throws Exception {
        String id = add(desk, "dispute");
        call(get("/api/calls-112?stationId=" + station), farDesk, null).andExpect(status().isForbidden());
        call(post("/api/calls-112"), farDesk, event(station, "dispute", Instant.now().minusSeconds(60))).andExpect(status().isForbidden());
        call(post("/api/calls-112/" + id + "/acknowledge"), farDesk, null).andExpect(status().isNotFound());
        call(post("/api/calls-112/" + id + "/open"), farDesk, "{\"as\":\"diary\"}").andExpect(status().isNotFound());
        call(post("/api/calls-112/" + UUID.randomUUID() + "/acknowledge"), desk, null).andExpect(status().isNotFound());
    }

    @Test
    void aBadEventIsRefused() throws Exception {
        call(post("/api/calls-112"), desk, event(station, "dispute", Instant.now().plusSeconds(3600))).andExpect(status().isBadRequest());
        call(post("/api/calls-112"), desk, event(station, "dance", Instant.now().minusSeconds(60))).andExpect(status().isBadRequest());
        call(post("/api/calls-112"), desk, event(station, "dispute", Instant.now().minusSeconds(60)).replace("\"place\":\"Fictional Chowk, North Road\"", "\"place\":\" \"")).andExpect(status().isBadRequest());
        call(post("/api/calls-112"), desk, event(station, "dispute", Instant.now().minusSeconds(60)).replace("Fictional dispute over a parked cart.", " ")).andExpect(status().isBadRequest());
    }

    @Test
    void aSecondAcknowledgementIsRefusedAndAnEventIsOpenedOnlyAfterIt() throws Exception {
        String id = add(desk, "dispute");
        call(post("/api/calls-112/" + id + "/open"), sho, "{\"as\":\"diary\"}").andExpect(status().isConflict());
        call(post("/api/calls-112/" + id + "/acknowledge"), sho, null).andExpect(status().isNoContent());
        call(post("/api/calls-112/" + id + "/acknowledge"), desk, null).andExpect(status().isConflict());
        var row = list(io).get("rows").get(0);
        assertThat(row.get("acknowledged_by_name").asText()).isEqualTo("Fictional Sho");
        call(post("/api/calls-112/" + id + "/acknowledge"), io, null).andExpect(status().isNotFound());   // not the duty officer
    }

    @Test
    void anEventOpensOnceAsAComplaintAtTheFrontDeskWithTheTextAsWritten() throws Exception {
        String id = add(desk, "dispute");
        call(post("/api/calls-112/" + id + "/acknowledge"), desk, null).andExpect(status().isNoContent());
        call(post("/api/calls-112/" + id + "/open"), desk, "{\"as\":\"complaint\",\"textLanguage\":\"en\"}").andExpect(status().isBadRequest());   // no kind
        call(post("/api/calls-112/" + id + "/open"), desk, "{\"as\":\"complaint\",\"complaintKind\":\"nothing\",\"textLanguage\":\"en\"}").andExpect(status().isBadRequest());
        call(post("/api/calls-112/" + id + "/open"), desk, "{\"as\":\"complaint\",\"complaintKind\":\"cyber_financial_fraud\"}").andExpect(status().isBadRequest());   // no language
        call(post("/api/calls-112/" + id + "/open"), desk, "{\"as\":\"sms\"}").andExpect(status().isBadRequest());
        String r = call(post("/api/calls-112/" + id + "/open"), desk, "{\"as\":\"complaint\",\"complaintKind\":\"cyber_financial_fraud\",\"textLanguage\":\"en\"}")
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        UUID complaint = UUID.fromString(json.readTree(r).get("complaintId").asText());
        var c = db.sql("select mode, informant_name, informant_contact, text_original, text_language, station_id, signed_at from complaint where id = ?").param(complaint).query().singleRow();
        assertThat(c).containsEntry("mode", "phone").containsEntry("informant_name", "Fictional Caller").containsEntry("informant_contact", "9000000000")
                .containsEntry("text_original", "Fictional dispute over a parked cart.").containsEntry("station_id", station);
        assertThat(c.get("signed_at")).isNull();   // the informant still reads it over and signs at the front desk
        assertThat(list(io).get("rows").get(0).get("complaint_id").asText()).isEqualTo(complaint.toString());
        call(post("/api/calls-112/" + id + "/open"), desk, "{\"as\":\"diary\"}").andExpect(status().isConflict());
    }

    @Test
    void aCallerWithoutANameIsWrittenAsOneAndAComplaintNeedsAFrontDeskRole() throws Exception {
        String body = event(station, "accident", Instant.now().minusSeconds(60)).replace("\"callerName\":\"Fictional Caller\",", "");
        String id = json.readTree(call(post("/api/calls-112"), sho, body).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asText();
        call(post("/api/calls-112/" + id + "/acknowledge"), sho, null).andExpect(status().isNoContent());
        call(post("/api/calls-112/" + id + "/open"), sho, "{\"as\":\"complaint\",\"complaintKind\":\"cyber_financial_fraud\",\"textLanguage\":\"mr\"}").andExpect(status().isCreated());
        assertThat(db.sql("select informant_name from complaint").query(String.class).single()).isEqualTo("Caller of 112 (name not given)");
    }

    @Test
    void anEventOpensAsTheStationsNextGeneralDiaryEntryWithoutCallerOrDetails() throws Exception {
        String a = add(desk, "accident"), b = add(desk, "fire_medical");
        for (String id : new String[] {a, b}) call(post("/api/calls-112/" + id + "/acknowledge"), desk, null).andExpect(status().isNoContent());
        call(post("/api/calls-112/" + a + "/open"), desk, "{\"as\":\"diary\"}").andExpect(status().isCreated());
        call(post("/api/calls-112/" + b + "/open"), desk, "{\"as\":\"diary\"}").andExpect(status().isCreated());
        var entries = db.sql("select entry_no, entry_text from general_diary_entry where station_id = ? order by entry_no").param(station).query().listOfRows();
        assertThat(entries).extracting(r -> r.get("entry_no")).containsExactly(1, 2);
        String text = (String) entries.get(0).get("entry_text");
        assertThat(text).contains("Fictional Chowk, North Road").contains("accident").contains("Fictional Van 3").doesNotContain("Fictional Caller").doesNotContain("9000000000").doesNotContain("parked cart");
        var rows = list(io).get("rows");
        assertThat(rows.get(0).get("diary_no").asInt() + rows.get(1).get("diary_no").asInt()).isEqualTo(3);
    }

    @Test
    void aCallAboutAWomanOrAChildShowsCallerAndDetailsOnlyToItsWriterAndTheSupervisors() throws Exception {
        add(desk, "woman_in_distress");
        var asIo = list(io).get("rows").get(0);
        assertThat(asIo.get("withheld").asBoolean()).isTrue();
        assertThat(asIo.get("caller_name").isNull() && asIo.get("caller_contact").isNull() && asIo.get("details").isNull()).isTrue();
        assertThat(asIo.get("place").asText()).isEqualTo("Fictional Chowk, North Road");   // where and what kind stay visible to send help
        assertThat(list(desk).get("rows").get(0).get("details").asText()).startsWith("Fictional dispute");   // the officer who wrote it
        assertThat(list(sho).get("rows").get(0).get("caller_name").asText()).isEqualTo("Fictional Caller");   // the officer in charge
        assertThat(list(sho).get("rows").get(0).get("withheld").asBoolean()).isFalse();
    }

    /** A roster entry in the shift running now (written to the table: before 6 am the running night shift is yesterday's). */
    UUID onDutyNow(UUID officer, UUID at, String post) {
        String[] now = DutyRosterController.shiftAt(LocalDateTime.now(ZoneId.of("Asia/Kolkata")));
        return db.sql("insert into duty_assignment (station_id, officer_id, on_date, kind, shift, post, recorded_by) values (?,?,?,'duty',?,?,?) returning id")
                .params(at, officer, LocalDate.parse(now[1]), now[0], post, officer).query(UUID.class).single();
    }

    String to(UUID officer) {
        return "{\"officerId\":\"" + officer + "\"}";
    }

    @Test
    void anAcknowledgedEventIsSentToBeatAndPatrolOfficersOnDutyNowOnceEach() throws Exception {
        UUID beat = user(station, "io", "Fictional Beat"), car = user(station, "io", "Fictional Patrol"), house = user(station, "io", "Fictional House");
        UUID entry = onDutyNow(beat, station, "beat");
        onDutyNow(car, station, "patrol");
        onDutyNow(house, station, "station_house");
        String id = add(desk, "dispute");
        String url = "/api/calls-112/" + id + "/send";
        call(post(url), desk, to(beat)).andExpect(status().isConflict());   // not acknowledged yet
        call(post("/api/calls-112/" + id + "/acknowledge"), desk, null).andExpect(status().isNoContent());
        assertThat(list(desk).get("rows").get(0).get("sent")).isEmpty();
        call(post(url), desk, to(house)).andExpect(status().isBadRequest());
        call(post(url), desk, to(UUID.randomUUID())).andExpect(status().isBadRequest());
        call(post(url), desk, "{}").andExpect(status().isBadRequest());
        call(post(url), desk, to(beat)).andExpect(status().isNoContent());
        call(post(url), desk, to(beat)).andExpect(status().isConflict());
        call(post("/api/calls-112/" + id + "/open"), desk, "{\"as\":\"diary\"}").andExpect(status().isCreated());
        call(post(url), sho, to(car)).andExpect(status().isNoContent());   // more help, also after the event was opened

        var sent = list(TestAuth.bearer(tokens, beat)).get("rows").get(0).get("sent");
        assertThat(sent).extracting(s -> s.get("full_name").asText() + " " + s.get("to_you").asBoolean())
                .containsExactly("Fictional Beat true", "Fictional Patrol false");
        assertThat(sent.get(0).get("officer_id").asText()).isEqualTo(beat.toString());
        assertThat(sent.get(0).get("sent_at").isNull()).isFalse();
        var kept = db.sql("select assignment_id, sent_by from call112_sent where officer_id = ?").param(beat).query().singleRow();
        assertThat(kept.get("assignment_id")).isEqualTo(entry);
    }

    @Test
    void onlyTheDutyOfficerSendsAndOnlyToTheEventsStation() throws Exception {
        UUID beat = user(station, "io", "Fictional Beat"), away = user(far, "io", "Fictional Away");
        UUID entry = onDutyNow(beat, station, "beat");
        onDutyNow(away, far, "beat");
        String id = add(desk, "dispute");
        call(post("/api/calls-112/" + id + "/acknowledge"), desk, null).andExpect(status().isNoContent());
        String url = "/api/calls-112/" + id + "/send";
        call(post(url), io, to(beat)).andExpect(status().isNotFound());
        call(post(url), farDesk, to(beat)).andExpect(status().isNotFound());
        call(post(url), TestAuth.bearer(tokens, beat), to(beat)).andExpect(status().isNotFound());
        call(post(url), desk, to(away)).andExpect(status().isBadRequest());
        db.sql("insert into duty_assignment_cancel (assignment_id, reason, cancelled_by) values (?, 'Written by mistake', ?)").params(entry, beat).update();
        call(post(url), desk, to(beat)).andExpect(status().isBadRequest());
        mvc.perform(post(url)).andExpect(status().isUnauthorized());
    }

    @Test
    void anOfficerSentACallAboutAWomanSeesNoMoreThanTheRestOfTheStation() throws Exception {
        UUID beat = user(station, "io", "Fictional Beat");
        onDutyNow(beat, station, "beat");
        String id = add(desk, "woman_in_distress");
        call(post("/api/calls-112/" + id + "/acknowledge"), desk, null).andExpect(status().isNoContent());
        call(post("/api/calls-112/" + id + "/send"), desk, to(beat)).andExpect(status().isNoContent());
        var row = list(TestAuth.bearer(tokens, beat)).get("rows").get(0);
        assertThat(row.get("sent").get(0).get("to_you").asBoolean()).isTrue();
        assertThat(row.get("withheld").asBoolean()).isTrue();
        assertThat(row.get("caller_name").isNull() && row.get("caller_contact").isNull() && row.get("details").isNull()).isTrue();
        assertThat(row.get("place").asText()).isEqualTo("Fictional Chowk, North Road");
    }

    @Test
    void noTokenIsRefused() throws Exception {
        mvc.perform(get("/api/calls-112?stationId=" + station)).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/calls-112")).andExpect(status().isUnauthorized());
    }
}
