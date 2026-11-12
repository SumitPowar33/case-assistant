package in.caseassistant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.hamcrest.Matchers;
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

/** Freezing bank accounts (V57). Fictional banks and accounts only. */
@SpringBootTest
@AutoConfigureMockMvc
class FreezeApiTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcClient db;
    @Autowired JwtEncoder tokens;
    @Autowired ObjectMapper json;
    UUID station, io, fir;
    String bearer;
    final LocalDate today = LocalDate.now(ZoneId.of("Asia/Kolkata"));

    ResultActions postJson(String path, Object body) throws Exception {
        return mvc.perform(post("/api/firs/" + fir + path).header("Authorization", bearer).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body)));
    }

    UUID freezeNotice(boolean send) throws Exception {
        String id = json.readTree(postJson("/notices", Map.of("kind", "BNSS_106", "addressee", "Nodal Officer, Fictional Bank",
                "itemsRequested", List.of("FICT 0000 4471", "FICT00005588"), "body", "Debit-freeze the accounts listed under BNSS 106."))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asText();
        if (send) postJson("/notices/" + id + "/send", Map.of("issuedAt", today.minusDays(3) + "T10:00:00+05:30")).andExpect(status().isNoContent());
        return UUID.fromString(id);
    }

    @BeforeEach
    void setUp() {
        db.sql("truncate fir, police_station, state_pack, app_user cascade").update();
        db.sql("insert into state_pack (code, name, version, languages) values ('IN','National','1',array['en'])").update();
        station = db.sql("insert into police_station (state_code, district_id, name) values ('IN',district_id_of('IN','Testpur'),'Testpur City') returning id").query(UUID.class).single();
        io = db.sql("insert into app_user (station_id, full_name, rank, role) values (?,'SI Fictional Asha','SI','io') returning id").param(station).query(UUID.class).single();
        bearer = TestAuth.bearer(tokens, io);
        fir = db.sql("""
                insert into fir (station_id, fir_year, fir_no, gd_entry_no, registered_at, information_received_at,
                  contents_original, contents_language, action_taken, io_id)
                values (?,2026,5,'GD-1',?::timestamptz,?::timestamptz,'Fictional complaint','en','investigate',?) returning id""")
                .params(station, today.minusDays(10) + "T10:00:00Z", today.minusDays(10) + "T09:00:00Z", io).query(UUID.class).single();
    }

    @Test
    void aSentFreezeNoticeIsDueForTheMagistrateUntilReportedThenItsReleaseIsRecordedWithAReason() throws Exception {
        UUID n = freezeNotice(true);
        db.sql("insert into money_hold (fir_id, account, amount_paise, held_on, recorded_by) values (?,'fict00004471',620000,?,?), (?,'OTHER0001',100,?,?)")
                .params(fir, today.minusDays(2), io, fir, today.minusDays(2), io).update();
        mvc.perform(get("/api/firs/" + fir + "/deadlines").header("Authorization", bearer))
                .andExpect(jsonPath("$[?(@.kind=='freeze_report')].due_on").value(Matchers.hasItem(today.minusDays(2).toString())))
                .andExpect(jsonPath("$[?(@.kind=='freeze_report')].basis").value(Matchers.hasItem(Matchers.containsString("FICT 0000 4471, FICT00005588"))));
        mvc.perform(get("/api/firs/" + fir + "/freezes").header("Authorization", bearer))
                .andExpect(jsonPath("$[0].held_paise").value(620000))
                .andExpect(jsonPath("$[0].report_due_on").value(today.minusDays(2).toString()))
                .andExpect(jsonPath("$[0].steps.reported").doesNotExist());

        postJson("/freezes/" + n + "/steps", Map.of("kind", "released", "onDate", today.toString(), "reference", "Order 12/2026", "reason", "Fictional court order to release"))
                .andExpect(status().isBadRequest()).andExpect(status().reason("Record the report to the Magistrate before the release."));
        postJson("/freezes/" + n + "/steps", Map.of("kind", "reported", "onDate", today.minusDays(4).toString(), "reference", "Fictional JMFC Court"))
                .andExpect(status().isBadRequest());   // before the notice was issued
        postJson("/freezes/" + n + "/steps", Map.of("kind", "reported", "onDate", today.minusDays(2).toString(), "reference", "Fictional JMFC Court"))
                .andExpect(status().isCreated());
        postJson("/freezes/" + n + "/steps", Map.of("kind", "reported", "onDate", today.toString(), "reference", "Fictional JMFC Court"))
                .andExpect(status().isBadRequest()).andExpect(status().reason("The report to the Magistrate is already recorded."));
        mvc.perform(get("/api/firs/" + fir + "/deadlines").header("Authorization", bearer))
                .andExpect(jsonPath("$[?(@.kind=='freeze_report')]").isEmpty());
        postJson("/freezes/" + n + "/steps", Map.of("kind", "released", "onDate", today.toString(), "reference", "Order 12/2026", "reason", "short"))
                .andExpect(status().isBadRequest());
        postJson("/freezes/" + n + "/steps", Map.of("kind", "released", "onDate", today.toString(), "reference", "Order 12/2026", "reason", "Fictional court order to release the amount"))
                .andExpect(status().isCreated());
        mvc.perform(get("/api/firs/" + fir + "/freezes").header("Authorization", bearer))
                .andExpect(jsonPath("$[0].steps.reported.reference").value("Fictional JMFC Court"))
                .andExpect(jsonPath("$[0].steps.released.reason").value("Fictional court order to release the amount"))
                .andExpect(jsonPath("$[0].steps.released.recorded_by").value("SI Fictional Asha"));
        assertThatThrownBy(() -> db.sql("update freeze_step set reference = 'x'").update()).hasMessageContaining("kept");
    }

    @Test
    void aStationMayAskForTheReportOnTheDayTheNoticeWasIssued() throws Exception {
        db.sql("insert into policy_setting (level, state_code, station_id, key, value, reason, set_by) values ('station','IN',?,'freeze_report_days','0','Fictional station order',?)")
                .params(station, io).update();
        freezeNotice(true);
        mvc.perform(get("/api/firs/" + fir + "/freezes").header("Authorization", bearer))
                .andExpect(jsonPath("$[0].report_due_on").value(today.minusDays(3).toString()));
    }

    @Test
    void aDraftIsNotAFreezeTheNoticeNamesAccountsAndOnlyTheCaseTeamRecords() throws Exception {
        UUID draft = freezeNotice(false);
        mvc.perform(get("/api/firs/" + fir + "/freezes").header("Authorization", bearer)).andExpect(jsonPath("$.length()").value(0));
        postJson("/freezes/" + draft + "/steps", Map.of("kind", "reported", "onDate", today.toString(), "reference", "Fictional JMFC Court"))
                .andExpect(status().isBadRequest()).andExpect(status().reason("Sign and send the freeze notice to the bank first."));
        postJson("/notices", Map.of("kind", "BNSS_106", "addressee", "Fictional Bank", "body", "No accounts named.")).andExpect(status().isBadRequest());
        postJson("/freezes/" + UUID.randomUUID() + "/steps", Map.of("kind", "reported", "onDate", today.toString(), "reference", "Fictional JMFC Court"))
                .andExpect(status().isNotFound());
        postJson("/freezes/" + draft + "/steps", Map.of("kind", "lifted", "onDate", today.toString(), "reference", "Fictional"))
                .andExpect(status().isBadRequest());
        UUID clerk = db.sql("insert into app_user (station_id, full_name, rank, role) values (?,'HC Fictional Desk','HC','front_desk') returning id").param(station).query(UUID.class).single();
        mvc.perform(get("/api/firs/" + fir + "/freezes").header("Authorization", TestAuth.bearer(tokens, clerk))).andExpect(status().is4xxClientError());
        assertThat(db.sql("select count(*) from freeze_step").query(Integer.class).single()).isZero();
    }
}
