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
                 "informedName":"Fictional Relative","arrestingOfficer":"%s","firstRemandOn":"2026-09-12","maxPunishment":"less_than_10_years"}""".formatted(pid, io);
        send("/arrests", arrest, 201);
        mvc.perform(get("/api/firs/" + fir + "/deadlines").header("Authorization", auth)).andExpect(jsonPath("$[?(@.kind=='chargesheet_custody')].due_on").value("2026-11-10"));
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
                .andExpect(jsonPath("$[0].signed_by_name").value("SI Asha Rao"));
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
