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
    UUID fir, io;
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
                  contents_original, contents_language, action_taken)
                values (?,2026,9,'GD-5','2026-10-01T10:00Z','2026-10-01T09:00Z','Fictional complaint','en','investigate')
                returning id""").param(station).query(UUID.class).single();
    }

    String send(String path, String body, int expected) throws Exception {
        return mvc.perform(post("/api/firs/" + fir + path).contentType(MediaType.APPLICATION_JSON).content(body))
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
                 "informedName":"Fictional Relative","arrestingOfficer":"%s","firstRemandOn":"2026-09-12","maxPunishment":"less_than_10_years"}""".formatted(pid, io);
        send("/arrests", arrest, 201);
        mvc.perform(get("/api/firs/" + fir + "/deadlines")).andExpect(jsonPath("$[?(@.kind=='chargesheet_custody')].due_on").value("2026-11-10"));
        send("/arrests", arrest.replace("[\"to prevent further offence\"]", "[]"), 400);
        send("/arrests", arrest.replace(pid, UUID.randomUUID().toString()), 404);
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
        send("/evidence/" + item + "/certificates", cert.formatted("B", "c".repeat(64)), 201);
        mvc.perform(get("/api/firs/" + fir + "/evidence")).andExpect(jsonPath("$[0].court_ready").value(false));
        send("/evidence/" + item + "/certificates", cert.formatted("A", SHA), 400); // part A twice
        db.sql("update certificate_63_4 set hash_value = ? where part = 'B'").param(SHA).update();
        mvc.perform(get("/api/firs/" + fir + "/evidence")).andExpect(jsonPath("$[0].court_ready").value(true));
    }

    @Test
    void noticeNeedsSignerToBeSentAndReplyChecksSetStatus() throws Exception {
        String n = "{\"kind\":\"BNSS_94\",\"addressee\":\"Fictional Bank Nodal Officer\",\"itemsRequested\":[\"statement\",\"Part B certificate\"],\"body\":\"Please produce.\"%s}";
        send("/notices", n.formatted(",\"status\":\"sent\""), 400); // sent without signer and date
        send("/notices", n.replace("\"itemsRequested\":[\"statement\",\"Part B certificate\"],", ""). formatted(""), 400); // 94 needs items
        String id = idOf(send("/notices", n.formatted(",\"signedBy\":\"" + io + "\",\"issuedAt\":\"2026-10-05T10:00:00Z\",\"replyDueOn\":\"2026-10-12\",\"status\":\"sent\""), 201));
        send("/notices/" + id + "/replies", "{\"receivedAt\":\"2026-10-10T10:00:00Z\",\"channel\":\"email\",\"checksJson\":\"[{\\\"item\\\":\\\"statement\\\",\\\"present\\\":true},{\\\"item\\\":\\\"Part B certificate\\\",\\\"present\\\":false}]\"}", 201);
        mvc.perform(get("/api/firs/" + fir + "/notices")).andExpect(jsonPath("$[0].status").value("reply_incomplete"))
                .andExpect(jsonPath("$[0].replies").value(1));
        send("/notices/" + id + "/replies", "{\"receivedAt\":\"2026-10-11T10:00:00Z\",\"channel\":\"post\",\"checksJson\":\"[{\\\"item\\\":\\\"statement\\\",\\\"present\\\":true}]\"}", 201);
        mvc.perform(get("/api/firs/" + fir + "/notices")).andExpect(jsonPath("$[0].status").value("complete"));
        send("/notices/" + UUID.randomUUID() + "/replies", "{\"receivedAt\":\"2026-10-11T10:00:00Z\",\"channel\":\"post\"}", 404);
    }
}
