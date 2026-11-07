package in.caseassistant;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

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

/** Supervisor review (design board 11): who sees the queue, in what order, what waits for a decision. Fictional data only. */
@SpringBootTest
@AutoConfigureMockMvc
class SupervisorApiTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcClient db;
    @Autowired JwtEncoder tokens;
    @Autowired CaseTeam team;
    UUID station, far, ioId, shoId, soon, later, none;
    String io, sho, spOther, desk;
    int no = 0;

    UUID user(UUID st, String role) {
        return db.sql("insert into app_user (station_id, full_name, rank, role) values (?,?,'SI',?) returning id").params(st, "Fictional " + role, role).query(UUID.class).single();
    }

    UUID fir(UUID st, UUID io, int daysAgo) {
        return db.sql("""
                insert into fir (station_id, fir_year, fir_no, gd_entry_no, registered_at, information_received_at, contents_original, contents_language, action_taken, io_id)
                values (?,2026,?,'GD-1',now() - make_interval(days => ?),now() - make_interval(days => ?, hours => 1),'Fictional complaint','en','investigate',?) returning id""")
                .params(st, ++no, daysAgo, daysAgo, io).query(UUID.class).single();
    }

    @BeforeEach
    void setUp() {
        db.sql("truncate fir, police_station, state_pack, app_user cascade").update();
        db.sql("insert into state_pack (code, name, version, languages) values ('IN','National','1',array['en'])").update();
        station = db.sql("insert into police_station (state_code, district_id, name) values ('IN',district_id_of('IN','North'),'Fictional North PS') returning id").query(UUID.class).single();
        far = db.sql("insert into police_station (state_code, district_id, name) values ('IN',district_id_of('IN','South'),'Fictional South PS') returning id").query(UUID.class).single();
        ioId = user(station, "io");
        shoId = user(station, "sho");
        io = TestAuth.bearer(tokens, ioId);
        sho = TestAuth.bearer(tokens, shoId);
        desk = TestAuth.bearer(tokens, user(station, "front_desk"));
        spOther = TestAuth.bearer(tokens, user(far, "sp"));
        later = fir(station, ioId, 10);   // the 90-day victim update falls due in about 80 days
        soon = fir(station, ioId, 85);    // ... in about 5 days
        none = fir(station, null, 0);     // no IO, deadlines far away
    }

    ResultActions call(MockHttpServletRequestBuilder b, String who, String body) throws Exception {
        b.header("Authorization", who);
        if (body != null) b.contentType(MediaType.APPLICATION_JSON).content(body);
        return mvc.perform(b);
    }

    @Test
    void onlyASupervisorSeesTheQueueAndOnlyOfTheirOwnReach() throws Exception {
        call(get("/api/supervisor"), io, null).andExpect(status().isForbidden());
        call(get("/api/supervisor"), desk, null).andExpect(status().isForbidden());
        call(get("/api/supervisor"), spOther, null).andExpect(status().isOk()).andExpect(jsonPath("$.cases.length()").value(0));
        call(get("/api/supervisor"), sho, null).andExpect(status().isOk()).andExpect(jsonPath("$.cases.length()").value(3));
    }

    @Test
    void casesComeByNearestDeadlineWithTheIoAndTheCounts() throws Exception {
        call(get("/api/supervisor"), sho, null).andExpect(status().isOk())
                .andExpect(jsonPath("$.cases[0].id").value(soon.toString()))
                .andExpect(jsonPath("$.cases[0].fir_no").value(2))
                .andExpect(jsonPath("$.cases[0].io_name").value("Fictional io"))
                .andExpect(jsonPath("$.cases[0].deadline_kind").value("victim_progress_update"))
                .andExpect(jsonPath("$.cases[0].days_left").value(5))
                .andExpect(jsonPath("$.cases[0].open_gaps").value(0))
                .andExpect(jsonPath("$.cases[0].can_decide").value(false))
                .andExpect(jsonPath("$.cases[1].id").value(later.toString()))
                .andExpect(jsonPath("$.cases[2].id").value(none.toString()))
                .andExpect(jsonPath("$.cases[2].io_name").doesNotExist())
                .andExpect(jsonPath("$.cases[0].submitted_by").doesNotExist())
                .andExpect(jsonPath("$.due_in_21_days").value(1))
                .andExpect(jsonPath("$.waiting_approval").value(0));
    }

    @Test
    void aSubmittedReportWaitsForADecisionAndALeavesTheQueueOnceSigned() throws Exception {
        String url = "/api/firs/" + soon + "/final-report";
        call(put("/api/firs/" + soon + "/playbook"), io, "{\"playbookId\":\"cyber-fraud\"}").andExpect(status().isNoContent());
        call(put(url), io, "{\"language\":\"en\",\"facts\":\"" + FinalReportApiTest.FACTS + "\",\"evidence\":\"" + FinalReportApiTest.EVIDENCE + "\"}").andExpect(status().isOk());
        call(post(url + "/submit"), io, null).andExpect(status().isOk());
        call(get("/api/supervisor"), sho, null).andExpect(jsonPath("$.waiting_approval").value(1))
                .andExpect(jsonPath("$.cases[0].report_status").value("submitted")).andExpect(jsonPath("$.cases[0].can_decide").value(true));
        call(get("/api/supervisor"), spOther, null).andExpect(jsonPath("$.waiting_approval").value(0));
        call(post(url + "/decision"), sho, "{\"decision\":\"approve\"}").andExpect(status().isOk());
        call(get("/api/supervisor"), sho, null).andExpect(jsonPath("$.waiting_approval").value(0))
                .andExpect(jsonPath("$.cases[0].report_status").value("approved")).andExpect(jsonPath("$.cases[0].can_decide").value(false));
        call(post(url + "/sign"), io, null).andExpect(status().isOk());
        call(get("/api/supervisor"), sho, null).andExpect(jsonPath("$.cases.length()").value(2))
                .andExpect(jsonPath("$.cases[?(@.id=='" + soon + "')]").isEmpty());
        db.sql("update app_user set station_id = ? where id = ?").params(far, ioId).update();   // a signed case needs no new IO
        call(get("/api/supervisor"), sho, null).andExpect(jsonPath("$.io_left.length()").value(1))
                .andExpect(jsonPath("$.io_left[0].id").value(later.toString()));
    }

    @Test
    void aSupervisorCannotDecideTheirOwnSubmission() throws Exception {
        UUID mine = fir(station, shoId, 20);
        call(put("/api/firs/" + mine + "/playbook"), sho, "{\"playbookId\":\"cyber-fraud\"}").andExpect(status().isNoContent());
        call(put("/api/firs/" + mine + "/final-report"), sho, "{\"language\":\"en\",\"facts\":\"" + FinalReportApiTest.FACTS + "\",\"evidence\":\"" + FinalReportApiTest.EVIDENCE + "\"}").andExpect(status().isOk());
        call(post("/api/firs/" + mine + "/final-report/submit"), sho, null).andExpect(status().isOk());
        call(get("/api/supervisor"), sho, null).andExpect(jsonPath("$.cases[?(@.id=='" + mine + "')].can_decide").value(false))
                .andExpect(jsonPath("$.waiting_approval").value(1));
    }
    /** Decision 2(d) of 2 Nov 2026: a transferred IO loses the old station's cases at once; they wait on the SHO's list. */
    @Test
    void aTransferredIoLosesTheCasesAndTheyWaitOnTheShosListUntilANewIo() throws Exception {
        call(get("/api/firs/" + soon), io, null).andExpect(status().isOk());
        call(get("/api/supervisor"), sho, null).andExpect(jsonPath("$.io_left.length()").value(0));
        db.sql("update app_user set station_id = ? where id = ?").params(far, ioId).update();   // the state admin moves the account
        call(get("/api/firs/" + soon), io, null).andExpect(status().isNotFound());
        org.junit.jupiter.api.Assertions.assertFalse(team.includes(ioId, soon));    // nor may they add to the case
        org.junit.jupiter.api.Assertions.assertFalse(team.canReadFir(ioId, soon));
        call(get("/api/firs"), io, null).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
        call(get("/api/firs/" + soon + "/people"), io, null).andExpect(status().is4xxClientError());
        call(get("/api/firs/" + soon + "/diary"), io, null).andExpect(status().is4xxClientError());
        call(get("/api/supervisor"), sho, null).andExpect(status().isOk())
                .andExpect(jsonPath("$.io_left.length()").value(2))
                .andExpect(jsonPath("$.io_left[0].id").value(later.toString()))
                .andExpect(jsonPath("$.io_left[0].fir_no").value(1))
                .andExpect(jsonPath("$.io_left[1].id").value(soon.toString()))
                .andExpect(jsonPath("$.io_left[0].io_name").value("Fictional io"))
                .andExpect(jsonPath("$.io_left[0].io_station_name").value("Fictional South PS"))
                .andExpect(jsonPath("$.io_left[0].io_active").value(true))
                .andExpect(jsonPath("$.io_left[?(@.id=='" + none + "')]").isEmpty());
        call(get("/api/supervisor"), spOther, null).andExpect(jsonPath("$.io_left.length()").value(0));
        UUID newIo = user(station, "io");
        call(post("/api/firs/" + soon + "/io"), sho, "{\"ioId\":\"" + newIo + "\",\"reason\":\"Former IO transferred to South PS\"}")
                .andExpect(status().isNoContent());
        call(get("/api/supervisor"), sho, null).andExpect(jsonPath("$.io_left.length()").value(1))
                .andExpect(jsonPath("$.io_left[0].id").value(later.toString()));
        call(get("/api/firs/" + soon), TestAuth.bearer(tokens, newIo), null).andExpect(status().isOk());
    }

    @Test
    void anIoWhoseAccountWasClosedIsListedToo() throws Exception {
        db.sql("update app_user set active = false where id = ?").param(ioId).update();
        call(get("/api/supervisor"), sho, null).andExpect(jsonPath("$.io_left.length()").value(2))
                .andExpect(jsonPath("$.io_left[0].io_active").value(false))
                .andExpect(jsonPath("$.io_left[0].io_station_name").value("Fictional North PS"));
    }
}
