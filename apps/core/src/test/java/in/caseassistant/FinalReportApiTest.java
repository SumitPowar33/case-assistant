package in.caseassistant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
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

/** Draft and sign the final report, BNSS 193 (V41, design board 10). Fictional data only. */
@SpringBootTest
@AutoConfigureMockMvc
class FinalReportApiTest {
    static final String FACTS = "On a fictional date the complainant lost money to a fictional caller.";
    static final String EVIDENCE = "Fictional bank statement and fictional call records link the accused.";

    @Autowired MockMvc mvc;
    @Autowired JdbcClient db;
    @Autowired JwtEncoder tokens;
    UUID station, fir, ioId, shoId;
    String io, sho, outsider, desk, otherIo;

    UUID user(UUID st, String role) {
        return db.sql("insert into app_user (station_id, full_name, rank, role) values (?,?,'SI',?) returning id").params(st, "Fictional " + role, role).query(UUID.class).single();
    }

    @BeforeEach
    void setUp() throws Exception {
        db.sql("truncate fir, police_station, state_pack, app_user cascade").update();
        db.sql("insert into state_pack (code, name, version, languages) values ('IN','National','1',array['en'])").update();
        station = db.sql("insert into police_station (state_code, district_id, name) values ('IN',district_id_of('IN','North'),'Fictional North PS') returning id").query(UUID.class).single();
        UUID far = db.sql("insert into police_station (state_code, district_id, name) values ('IN',district_id_of('IN','South'),'Fictional South PS') returning id").query(UUID.class).single();
        ioId = user(station, "io");
        shoId = user(station, "sho");
        io = TestAuth.bearer(tokens, ioId);
        sho = TestAuth.bearer(tokens, shoId);
        otherIo = TestAuth.bearer(tokens, user(station, "io"));
        outsider = TestAuth.bearer(tokens, user(far, "sho"));
        desk = TestAuth.bearer(tokens, user(station, "front_desk"));
        fir = db.sql("""
                insert into fir (station_id, fir_year, fir_no, gd_entry_no, registered_at, information_received_at, contents_original, contents_language, action_taken, io_id)
                values (?,2026,1,'GD-1',now() - interval '2 days',now() - interval '2 days 1 hour','Fictional complaint','en','investigate',?) returning id""")
                .params(station, ioId).query(UUID.class).single();
    }

    ResultActions call(MockHttpServletRequestBuilder b, String who, String body) throws Exception {
        b.header("Authorization", who);
        if (body != null) b.contentType(MediaType.APPLICATION_JSON).content(body);
        return mvc.perform(b);
    }

    String url(String tail) {
        return "/api/firs/" + fir + "/final-report" + tail;
    }

    String words(String facts, String evidence) {
        return "{\"language\":\"en\",\"facts\":\"" + facts + "\",\"evidence\":\"" + evidence + "\"}";
    }

    void playbook() throws Exception {
        call(put("/api/firs/" + fir + "/playbook"), io, "{\"playbookId\":\"cyber-fraud\"}").andExpect(status().isNoContent());
    }

    void submitted() throws Exception {
        playbook();
        call(put(url("")), io, words(FACTS, EVIDENCE)).andExpect(status().isOk());
        call(post(url("/submit")), io, null).andExpect(status().isOk());
    }

    @Test
    void theWholeWayFromDraftToSignature() throws Exception {
        call(get(url("")), io, null).andExpect(status().isOk()).andExpect(jsonPath("$.draft").doesNotExist())
                .andExpect(jsonPath("$.canApprove").value(false)).andExpect(jsonPath("$.readinessChecked").value(false));
        call(get(url("")), sho, null).andExpect(jsonPath("$.canApprove").value(true));
        submitted();
        call(put(url("")), io, words(FACTS + " More.", EVIDENCE)).andExpect(status().isConflict());         // no change once submitted
        call(post(url("/sign")), io, null).andExpect(status().isConflict());                                  // not approved yet
        call(post(url("/decision")), io, "{\"decision\":\"approve\"}").andExpect(status().isForbidden());    // an IO does not approve
        call(post(url("/decision")), sho, "{\"decision\":\"return\"}").andExpect(status().isBadRequest());     // a reason is needed
        call(post(url("/decision")), sho, "{\"decision\":\"return\",\"note\":\"Add the call records to the evidence.\"}").andExpect(status().isOk());
        call(put(url("")), io, words(FACTS, EVIDENCE + " Call records added.")).andExpect(status().isOk());   // returned: words change again
        call(post(url("/submit")), io, null).andExpect(status().isOk());
        call(post(url("/decision")), sho, "{\"decision\":\"approve\"}").andExpect(status().isOk());
        call(post(url("/sign")), otherIo, null).andExpect(status().isForbidden());
        call(post(url("/sign")), io, null).andExpect(status().isOk());
        call(get(url("")), sho, null).andExpect(jsonPath("$.draft.status").value("signed"))
                .andExpect(jsonPath("$.draft.signed_by_name").value("Fictional io")).andExpect(jsonPath("$.draft.decided_by_name").value("Fictional sho"))
                .andExpect(jsonPath("$.events.length()").value(7))
                .andExpect(jsonPath("$.events[?(@.action=='returned')].note").value("Add the call records to the evidence."));
        call(put(url("")), io, words(FACTS, "Changed after signing")).andExpect(status().isConflict());
        assertThatThrownBy(() -> db.sql("update final_report_draft set facts_text = 'changed after the signature'").update()).hasMessageContaining("kept as written");
        assertThatThrownBy(() -> db.sql("delete from final_report_draft").update()).hasMessageContaining("never deleted");
        assertThatThrownBy(() -> db.sql("update final_report_event set note = 'changed note over ten'").update()).hasMessageContaining("kept as written");
        assertThatThrownBy(() -> db.sql("delete from final_report_event").update()).hasMessageContaining("kept as written");
    }

    @Test
    void submittingNeedsBothPartsAWrittenPlaybookCheckAndNoOpenGap() throws Exception {
        call(post(url("/submit")), io, null).andExpect(status().isConflict());                                // no draft yet
        call(put(url("")), io, words("short", "")).andExpect(status().isOk());
        call(post(url("/submit")), io, null).andExpect(status().isConflict());
        call(put(url("")), io, words(FACTS, EVIDENCE)).andExpect(status().isOk());
        call(post(url("/submit")), io, null).andExpect(status().isConflict());                                // readiness not checked
        playbook();
        call(get(url("")), io, null).andExpect(jsonPath("$.readinessChecked").value(true)).andExpect(jsonPath("$.openGaps").value(0));
        call(post(url("/submit")), io, null).andExpect(status().isOk());
        call(post(url("/submit")), io, null).andExpect(status().isConflict());                                // twice
    }

    @Test
    void nobodyApprovesTheirOwnSubmission() throws Exception {
        playbook();
        call(put(url("")), sho, words(FACTS, EVIDENCE)).andExpect(status().isOk());
        call(post(url("/submit")), sho, null).andExpect(status().isOk());
        call(post(url("/decision")), sho, "{\"decision\":\"approve\"}").andExpect(status().isForbidden());
        assertThatThrownBy(() -> db.sql("update final_report_draft set status = 'approved', decided_by = submitted_by").update()).hasMessageContaining("someone other");
        call(post(url("/decision")), sho, "{\"decision\":\"nonsense\"}").andExpect(status().isBadRequest());
    }

    @Test
    void onlyTheCaseTeamTouchesTheDraftAndOnlyTheHeadDecides() throws Exception {
        for (String who : new String[] {outsider, desk}) {
            call(get(url("")), who, null).andExpect(status().isNotFound());
            call(put(url("")), who, words(FACTS, EVIDENCE)).andExpect(status().isForbidden());
            call(post(url("/submit")), who, null).andExpect(status().isForbidden());
            call(post(url("/decision")), who, "{\"decision\":\"approve\"}").andExpect(status().isForbidden());
            call(post(url("/sign")), who, null).andExpect(status().isForbidden());
        }
        call(post(url("/decision")), sho, "{\"decision\":\"approve\"}").andExpect(status().isConflict());     // nothing submitted
        call(put(url("")), io, "{\"language\":\"EN!\"}").andExpect(status().isBadRequest());
        assertThat(db.sql("select count(*) from final_report_draft").query(Long.class).single()).isZero();
    }

    @Test
    void theDatabaseRefusesAShortcutThroughTheStates() throws Exception {
        call(put(url("")), io, words(FACTS, EVIDENCE)).andExpect(status().isOk());
        assertThatThrownBy(() -> db.sql("update final_report_draft set status = 'approved'").update()).hasMessageContaining("cannot go from");
        assertThatThrownBy(() -> db.sql("update final_report_draft set status = 'signed'").update()).hasMessageContaining("cannot go from");
        assertThatThrownBy(() -> db.sql("update final_report_draft set status = 'submitted'").update()).hasMessageContaining("named officer");
        assertThatThrownBy(() -> db.sql("update final_report_draft set fir_id = gen_random_uuid()").update()).isInstanceOf(Exception.class);
        assertThatThrownBy(() -> db.sql("insert into final_report_draft (fir_id, language, created_by, status) select id, 'en', io_id, 'signed' from fir").update()).hasMessageContaining("starts as a draft");
        submitted();
        db.sql("update final_report_draft set status = 'approved', decided_by = ?").param(shoId).update();
        assertThatThrownBy(() -> db.sql("update final_report_draft set status = 'signed', signed_by = ?").param(shoId).update()).hasMessageContaining("submitted the final report signs");
        assertThatThrownBy(() -> db.sql("update final_report_draft set evidence_text = 'a quiet change of the evidence'").update()).hasMessageContaining("only while");
    }

    @Test
    void anOpenGapOfTheReadinessCheckStopsTheSubmission() throws Exception {
        db.sql("insert into fir_section (fir_id, act, section) values (?, 'BNS', '318(4)')").param(fir).update();
        playbook();
        call(put(url("")), io, words(FACTS, EVIDENCE)).andExpect(status().isOk());
        call(get(url("")), io, null).andExpect(jsonPath("$.openGaps").value(org.hamcrest.Matchers.greaterThan(0)))
                .andExpect(jsonPath("$.particulars.sections").value("BNS 318(4)"));
        call(post(url("/submit")), io, null).andExpect(status().isConflict());
        assertThat(db.sql("select status from final_report_draft").query(String.class).single()).isEqualTo("draft");
    }
}
