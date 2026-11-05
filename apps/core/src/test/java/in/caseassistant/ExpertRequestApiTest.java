package in.caseassistant;

import static org.assertj.core.api.Assertions.assertThat;
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

/** Forensic and medical requests (V44, design board 16): who sees and writes what, the steps, the reminder mark. Fictional data only. */
@SpringBootTest
@AutoConfigureMockMvc
class ExpertRequestApiTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcClient db;
    @Autowired org.springframework.security.oauth2.jwt.JwtEncoder tokens;
    UUID station, otherStation, fir, otherFir;
    String io, otherIo, malkhana, farMalkhana, desk, sho;

    UUID user(UUID st, String role) {
        return db.sql("insert into app_user (station_id, full_name, rank, role) values (?,?,'SI',?) returning id").params(st, "Fictional " + role, role).query(UUID.class).single();
    }

    UUID fir(UUID st, int no, UUID ioId) {
        return db.sql("""
                insert into fir (station_id, fir_year, fir_no, gd_entry_no, registered_at, information_received_at, contents_original, contents_language, action_taken, io_id)
                values (?,2026,?,'GD-1','2026-10-01T10:00Z','2026-10-01T09:00Z','Fictional complaint','en','investigate',?) returning id""").params(st, no, ioId).query(UUID.class).single();
    }

    UUID item(UUID firId, String label, String kind) {
        return db.sql("""
                insert into evidence_item (fir_id, label, description, kind, seized_at, seizure_memo, sha256)
                values (?,?,'Fictional item',?,'2026-10-02T10:00Z','SM-1',?) returning id""").params(firId, label, kind, "electronic".equals(kind) ? "a".repeat(64) : null).query(UUID.class).single();
    }

    @BeforeEach
    void setUp() {
        db.sql("truncate fir, police_station, state_pack, app_user cascade").update();
        db.sql("insert into state_pack (code, name, version, languages) values ('IN','National','1',array['en'])").update();
        station = db.sql("insert into police_station (state_code, district_id, name) values ('IN',district_id_of('IN','North'),'Fictional North PS') returning id").query(UUID.class).single();
        otherStation = db.sql("insert into police_station (state_code, district_id, name) values ('IN',district_id_of('IN','South'),'Fictional South PS') returning id").query(UUID.class).single();
        UUID ioId = user(station, "io"), otherIoId = user(otherStation, "io");
        io = TestAuth.bearer(tokens, ioId);
        otherIo = TestAuth.bearer(tokens, otherIoId);
        malkhana = TestAuth.bearer(tokens, user(station, "malkhana"));
        farMalkhana = TestAuth.bearer(tokens, user(otherStation, "malkhana"));
        desk = TestAuth.bearer(tokens, user(station, "front_desk"));
        sho = TestAuth.bearer(tokens, user(station, "sho"));
        fir = fir(station, 1, ioId);
        otherFir = fir(otherStation, 1, otherIoId);
    }

    String body(String kind, String date, UUID evidence) {
        return "{\"kind\":\"" + kind + "\",\"subject\":\"Phone extraction, fictional\",\"sentTo\":\"Fictional Lab\",\"date\":\"" + date + "\""
                + (evidence == null ? "" : ",\"evidenceId\":\"" + evidence + "\"") + "}";
    }

    String ago(int days) {
        return java.time.LocalDate.now(java.time.ZoneId.of("Asia/Kolkata")).minusDays(days).toString();
    }

    UUID send(String who, UUID firId, String kind, int daysAgo) throws Exception {
        String res = mvc.perform(post("/api/firs/" + firId + "/expert-requests").header("Authorization", who).contentType(MediaType.APPLICATION_JSON).content(body(kind, ago(daysAgo), null)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return UUID.fromString(res.replaceAll(".*\"id\":\"([^\"]+)\".*", "$1"));
    }

    ResultActions step(String who, UUID firId, UUID id, String status, String date, String note) throws Exception {
        String n = note == null ? "" : ",\"note\":\"" + note + "\"";
        return mvc.perform(post("/api/firs/" + firId + "/expert-requests/" + id + "/steps").header("Authorization", who).contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\"" + status + "\",\"date\":\"" + date + "\"" + n + "}"));
    }

    @Test
    void aRequestStartsAsSentAndFollowsItsNewestStep() throws Exception {
        UUID r = send(io, fir, "forensic", 5);
        mvc.perform(get("/api/expert-requests").header("Authorization", io)).andExpect(status().isOk())
                .andExpect(jsonPath("$.requests[0].status").value("sent")).andExpect(jsonPath("$.requests[0].days_waiting").value(5))
                .andExpect(jsonPath("$.requests[0].reminder_due").value(false)).andExpect(jsonPath("$.counts.open").value(1));
        step(io, fir, r, "sample_sent", ago(4), "   ").andExpect(status().isCreated());   // a blank note is no note
        step(io, fir, r, "at_lab", ago(3), "Queue 14").andExpect(status().isCreated());
        mvc.perform(get("/api/expert-requests").header("Authorization", io)).andExpect(jsonPath("$.requests[0].status").value("at_lab"))
                .andExpect(jsonPath("$.requests[0].note").value("Queue 14"));
        step(io, fir, r, "report_received", ago(0), null).andExpect(status().isCreated());
        mvc.perform(get("/api/expert-requests").header("Authorization", io)).andExpect(jsonPath("$.requests[0].status").value("report_received"))
                .andExpect(jsonPath("$.requests[0].days_waiting").isEmpty()).andExpect(jsonPath("$.counts.open").value(0)).andExpect(jsonPath("$.counts.report_received").value(1));
        mvc.perform(get("/api/firs/" + fir + "/expert-requests/" + r + "/steps").header("Authorization", io)).andExpect(jsonPath("$.length()").value(4));
        step(io, fir, r, "at_lab", ago(0), null).andExpect(status().isConflict());   // nothing after the report
    }

    @Test
    void aRequestWithNoReplyAfterThirtyDaysIsMarkedAndAReminderStepKeepsTheStatus() throws Exception {
        UUID late = send(io, fir, "medical", 31), fresh = send(io, fir, "medical", 29);
        mvc.perform(get("/api/expert-requests").header("Authorization", io)).andExpect(jsonPath("$.counts.reminder_due").value(1))
                .andExpect(jsonPath("$.requests[?(@.id=='" + late + "')].reminder_due").value(true))
                .andExpect(jsonPath("$.requests[?(@.id=='" + fresh + "')].reminder_due").value(false));
        step(io, fir, late, "reminder_sent", ago(0), "Reminder sent to the hospital").andExpect(status().isCreated());
        mvc.perform(get("/api/expert-requests").header("Authorization", io)).andExpect(jsonPath("$.requests[?(@.id=='" + late + "')].status").value("sent"));
    }

    @Test
    void refusalsAreFriendly400sAnd403sAnd404s() throws Exception {
        UUID e = item(otherFir, "F-01", "physical");
        String bad = "{\"kind\":\"x\",\"subject\":\"ok\",\"sentTo\":\"ok\",\"date\":\"" + ago(1) + "\"}";
        mvc.perform(post("/api/firs/" + fir + "/expert-requests").header("Authorization", io).contentType(MediaType.APPLICATION_JSON).content(bad)).andExpect(status().isBadRequest());
        for (String date : new String[] {java.time.LocalDate.now().plusDays(3).toString(), "yesterday"})
            mvc.perform(post("/api/firs/" + fir + "/expert-requests").header("Authorization", io).contentType(MediaType.APPLICATION_JSON).content(body("forensic", date, null))).andExpect(status().isBadRequest());
        mvc.perform(post("/api/firs/" + fir + "/expert-requests").header("Authorization", io).contentType(MediaType.APPLICATION_JSON).content(body("forensic", ago(1), e))).andExpect(status().isBadRequest());
        mvc.perform(post("/api/firs/" + fir + "/expert-requests").header("Authorization", io).contentType(MediaType.APPLICATION_JSON).content(body("forensic", ago(1), null).replace("}", ",\"evidenceId\":\"nope\"}")))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/firs/" + fir + "/expert-requests").header("Authorization", io).contentType(MediaType.APPLICATION_JSON).content(body("forensic", ago(1), null).replace("}", ",\"evidenceId\":\" \"}")))
                .andExpect(status().isCreated());   // blank id means none
        UUID r = send(io, fir, "forensic", 4);
        step(io, fir, r, "at_lab", ago(9), null).andExpect(status().isBadRequest());   // before it was sent
        step(io, fir, r, "at_lab", ago(-2), null).andExpect(status().isBadRequest());   // in the future
        step(io, fir, r, "sent", ago(1), null).andExpect(status().isBadRequest());   // "sent" is only the first step
        step(io, fir, UUID.randomUUID(), "at_lab", ago(1), null).andExpect(status().isNotFound());
        step(io, otherFir, r, "at_lab", ago(1), null).andExpect(status().isForbidden());
    }

    @Test
    void onlyTheCaseTeamWritesAndStationReadersSeeOnlyTheirStation() throws Exception {
        UUID r = send(io, fir, "forensic", 2);
        mvc.perform(post("/api/firs/" + fir + "/expert-requests").header("Authorization", otherIo).contentType(MediaType.APPLICATION_JSON).content(body("forensic", ago(1), null))).andExpect(status().isForbidden());
        step(desk, fir, r, "at_lab", ago(1), null).andExpect(status().isForbidden());   // reads the station, is not on the case team
        step(sho, fir, r, "at_lab", ago(1), null).andExpect(status().isCreated());   // the SHO is on the case team
        mvc.perform(get("/api/firs/" + fir + "/expert-requests/" + r + "/steps").header("Authorization", otherIo)).andExpect(status().isNotFound());
        send(otherIo, otherFir, "medical", 1);
        for (String who : new String[] {io, sho, desk})
            mvc.perform(get("/api/expert-requests").header("Authorization", who)).andExpect(jsonPath("$.requests.length()").value(1)).andExpect(jsonPath("$.requests[0].station").value("Fictional North PS"));
        mvc.perform(get("/api/expert-requests").header("Authorization", otherIo)).andExpect(jsonPath("$.requests.length()").value(1)).andExpect(jsonPath("$.requests[0].station").value("Fictional South PS"));
        mvc.perform(get("/api/expert-requests").header("Authorization", TestAuth.bearer(tokens, user(station, "io")))).andExpect(jsonPath("$.requests.length()").value(0));
        mvc.perform(get("/api/expert-requests")).andExpect(status().isUnauthorized());
    }

    @Test
    void anEvidenceItemOfTheCaseCanBeNamed() throws Exception {
        UUID e = item(fir, "E-09", "electronic");
        mvc.perform(post("/api/firs/" + fir + "/expert-requests").header("Authorization", io).contentType(MediaType.APPLICATION_JSON).content(body("forensic", ago(1), e))).andExpect(status().isCreated());
        mvc.perform(get("/api/expert-requests").header("Authorization", io)).andExpect(jsonPath("$.requests[0].evidence_label").value("E-09"));
    }
}
