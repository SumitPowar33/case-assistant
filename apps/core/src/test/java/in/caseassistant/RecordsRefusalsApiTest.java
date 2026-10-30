package in.caseassistant;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MockMvc;

/** The refusals of the record routes (unknown ids, impossible dates, wrong roles of people). Fictional data only. */
@SpringBootTest
@AutoConfigureMockMvc
class RecordsRefusalsApiTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcClient db;
    @Autowired org.springframework.security.oauth2.jwt.JwtEncoder tokens;
    UUID fir;
    String auth, accused, arrest;

    @BeforeEach
    void setUp() throws Exception {
        db.sql("truncate fir, police_station, state_pack, app_user cascade").update();
        db.sql("insert into state_pack (code, name, version, languages) values ('IN','National','1',array['en'])").update();
        UUID station = db.sql("insert into police_station (state_code, district_id, name) values ('IN',district_id_of('IN','Testpur'),'Testpur City') returning id")
                .query(UUID.class).single();
        UUID io = db.sql("insert into app_user (station_id, full_name, rank, role) values (?,'SI Asha Rao','SI','io') returning id")
                .param(station).query(UUID.class).single();
        fir = db.sql("""
                insert into fir (station_id, fir_year, fir_no, gd_entry_no, registered_at, information_received_at,
                  contents_original, contents_language, action_taken, io_id)
                values (?,2026,9,'GD-5','2026-10-01T10:00Z','2026-10-01T09:00Z','Fictional complaint','en','investigate',?)
                returning id""").params(station, io).query(UUID.class).single();
        auth = TestAuth.bearer(tokens, io);
        accused = idOf(send("/people", "{\"role\":\"accused\",\"label\":\"A1\",\"identityKnown\":false}", 201));
        arrest = idOf(send("/arrests", arrestBody(accused, "2026-10-02T10:00:00+05:30"), 201));
    }

    String arrestBody(String person, String at) {
        return """
                {"personId":"%s","arrestedAt":"%s","place":"Testpur","grounds":["proper investigation"],
                 "informedName":"Fictional Relative","maxPunishment":"less_than_10_years"}""".formatted(person, at);
    }

    String send(String path, String body, int expected) throws Exception {
        return mvc.perform(post("/api/firs/" + fir + path).header("Authorization", auth).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().is(expected)).andReturn().getResponse().getContentAsString();
    }

    static String idOf(String json) {
        return json.replaceAll(".*\"id\":\"([^\"]+)\".*", "$1");
    }

    @Test
    void unknownArrestsAreNotFoundOnEveryRoute() throws Exception {
        String none = "/arrests/" + UUID.randomUUID();
        send(none + "/release", "{\"releasedOn\":\"2026-10-09\",\"basis\":\"bail\"}", 404);
        send(none + "/corrections", "{\"maxPunishment\":\"life\",\"reason\":\"fixing the class\"}", 404);
        send(none + "/memo-corrections", "{\"place\":\"X\",\"grounds\":[\"g\"],\"informedName\":\"Y\",\"reason\":\"fixing the memo\"}", 404);
        send(none + "/time-corrections", "{\"arrestedAt\":\"2026-10-02T09:00:00+05:30\",\"reason\":\"fixing the time\"}", 404);
    }

    @Test
    void anArrestNeedsAnAccusedAndAPastTimeAndARemandNotBeforeIt() throws Exception {
        String witness = idOf(send("/people", "{\"role\":\"witness\",\"label\":\"W1\",\"identityKnown\":false}", 201));
        send("/arrests", arrestBody(witness, "2026-10-02T10:00:00+05:30"), 400);
        send("/arrests", arrestBody(accused, "2099-10-02T10:00:00+05:30"), 400);
        send("/arrests", arrestBody(accused, "2026-10-02T10:00:00+05:30").replace("\"maxPunishment\"", "\"firstRemandOn\":\"2026-10-01\",\"maxPunishment\""), 400);
    }

    @Test
    void correctionsRefuseImpossibleDatesAndHalfAReleaseAndTimeInTheFuture() throws Exception {
        String c = "{\"maxPunishment\":\"life\",\"reason\":\"fixing the facts\"%s}";
        send("/arrests/" + arrest + "/corrections", c.formatted(",\"releasedOn\":\"2026-10-09\""), 400);                      // date without how
        send("/arrests/" + arrest + "/corrections", c.formatted(",\"releasedOn\":\"2026-10-01\",\"releaseBasis\":\"bail\""), 400);   // before the arrest
        send("/arrests/" + arrest + "/corrections", c.formatted(",\"releasedOn\":\"2099-10-01\",\"releaseBasis\":\"bail\""), 400);   // future
        send("/arrests/" + arrest + "/time-corrections", "{\"arrestedAt\":\"2099-10-02T09:00:00+05:30\",\"reason\":\"fixing the time\"}", 400);
    }

    @Test
    void chargesheetsAndClosuresRefuseFutureOrImpossibleDatesAndReplacedOnes() throws Exception {
        String cs = "{\"filedOn\":\"%s\",\"court\":\"Fictional JMFC Court\",\"reportNo\":\"CS-1\",\"accusedIds\":[\"" + accused + "\"]%s}";
        send("/chargesheets", cs.formatted("2099-01-01", ""), 400);
        String id = idOf(send("/chargesheets", cs.formatted("2026-10-20", ""), 201));
        String fix = cs.formatted("2026-10-21", ",\"reason\":\"court corrected the date\"");
        send("/chargesheets/" + id + "/corrections", cs.formatted("2099-01-01", ",\"reason\":\"court corrected the date\""), 400);
        send("/chargesheets/" + id + "/corrections", fix, 201);
        send("/chargesheets/" + id + "/corrections", fix, 409);   // already replaced: correct the newest
    }

    @Test
    void closureDatesAndDecisionsAreChecked() throws Exception {
        String cr = "{\"filedOn\":\"%s\",\"court\":\"Fictional JMFC Court\",\"reportNo\":\"CR-1\",\"ground\":\"untraced\",\"reason\":\"accused could not be traced\"%s}";
        send("/closure-report", cr.formatted("2099-01-01", ""), 400);                                    // future
        send("/closure-report", cr.formatted("2026-09-30", ""), 400);                                    // before the FIR
        send("/closure-report", cr.formatted("2026-10-20", ",\"informantInformedOn\":\"2026-10-19\""), 400);   // informant told before filing
        send("/closure-report", cr.formatted("2026-10-20", ",\"informantInformedOn\":\"2099-01-01\""), 400);
        send("/closure-report", cr.formatted("2026-10-20", ""), 201);
        send("/closure-report", cr.formatted("2026-10-21", ""), 409);                                    // only one per case
        String d = "{\"decision\":\"accepted\",\"decidedOn\":\"%s\"}";
        send("/closure-report/decision", d.formatted("2099-01-01"), 400);
        send("/closure-report/decision", d.formatted("2026-10-19"), 400);                               // before the filing day
    }

    @Test
    void aReplyCannotBeLoggedAgainstANoticeThatWasNeverSent() throws Exception {
        String draft = idOf(send("/notices", "{\"kind\":\"BNSS_94\",\"addressee\":\"Fictional Bank\",\"itemsRequested\":[\"statement\"],\"body\":\"Please produce.\"}", 201));
        send("/notices/" + draft + "/replies", "{\"receivedAt\":\"2026-10-11T10:00:00Z\",\"channel\":\"post\"}", 409);
    }
}
