package in.caseassistant;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

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

/** Fictional cyber-fraud case using the national cyber-fraud playbook. */
@SpringBootTest
@AutoConfigureMockMvc
class ReadinessApiTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcClient db;
    @Autowired JwtEncoder tokens;
    UUID fir, statement, phone;
    String io, clerk;
    static final String SHA = "d".repeat(64);

    @BeforeEach
    void setUp() {
        db.sql("truncate fir, police_station, state_pack, app_user cascade").update();
        db.sql("insert into state_pack (code, name, version, languages) values ('IN','National','1',array['en'])").update();
        UUID station = db.sql("insert into police_station (state_code, district, name) values ('IN','Testpur','Testpur Cyber') returning id")
                .query(UUID.class).single();
        UUID ioId = db.sql("insert into app_user (station_id, full_name, rank, role) values (?,'SI Fictional Kale','SI','io') returning id")
                .param(station).query(UUID.class).single();
        io = TestAuth.bearer(tokens, ioId);
        clerk = TestAuth.bearer(tokens, db.sql("insert into app_user (station_id, full_name, rank, role) values (?,'HC Fictional Desk','HC','front_desk') returning id")
                .param(station).query(UUID.class).single());
        fir = db.sql("""
                insert into fir (station_id, fir_year, fir_no, gd_entry_no, registered_at, information_received_at,
                  contents_original, contents_language, action_taken, io_id)
                values (?,2026,31,'GD-9','2026-10-01T10:00Z','2026-10-01T09:00Z','Fictional caller posed as a bank officer','en','investigate',?)
                returning id""").params(station, ioId).query(UUID.class).single();
        for (String s : new String[] {"318(4)", "319(2)", "3(5)"})
            db.sql("insert into fir_section (fir_id, act, section) values (?, 'BNS', ?)").params(fir, s).update();
        statement = item("S-01", "document", null);
        phone = item("E-01", "electronic", SHA);
    }

    UUID item(String label, String kind, String sha) {
        return db.sql("insert into evidence_item (fir_id,label,description,kind,seized_at,seizure_memo,sha256) "
                + "values (?,?,'Fictional item',?,'2026-10-02T10:00Z','SM-1',?) returning id").params(fir, label, kind, sha).query(UUID.class).single();
    }

    ResultActions call(org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder req, String who, String body) throws Exception {
        if (who != null) req.header("Authorization", who);
        if (body != null) req.contentType(MediaType.APPLICATION_JSON).content(body);
        return mvc.perform(req);
    }

    ResultActions report() throws Exception {
        return call(get("/api/firs/" + fir + "/readiness"), clerk, null).andExpect(status().isOk());
    }

    String link(String charge, String ing, UUID item) {
        return "{\"chargeId\":\"%s\",\"ingredientId\":\"%s\",\"evidenceItemId\":\"%s\"}".formatted(charge, ing, item);
    }

    @Test
    void withoutAPlaybookThereIsNothingToCheck() throws Exception {
        report().andExpect(jsonPath("$.playbook").doesNotExist()).andExpect(jsonPath("$.openGaps").value(0));
        call(get("/api/playbooks"), clerk, null).andExpect(jsonPath("$[0].id").value("cyber-fraud"));
        call(put("/api/firs/" + fir + "/playbook"), io, "{\"playbookId\":\"no-such\"}").andExpect(status().isUnprocessableEntity());
        call(put("/api/firs/" + fir + "/playbook"), clerk, "{\"playbookId\":\"cyber-fraud\"}").andExpect(status().isForbidden());
    }

    @Test
    void chargesComeFromTheFirSectionsAndEveryIngredientNeedsEvidence() throws Exception {
        call(put("/api/firs/" + fir + "/playbook"), io, "{\"playbookId\":\"cyber-fraud\"}").andExpect(status().isNoContent());
        report().andExpect(jsonPath("$.playbook.status").value("draft"))
                .andExpect(jsonPath("$.charges[*].law").value(Matchers.contains("BNS 318(4)", "BNS 319(2)")))
                .andExpect(jsonPath("$.sectionsNotInPlaybook").value(Matchers.contains("BNS 3(5)")))
                .andExpect(jsonPath("$.openGaps").value(5)) // 3 cheating + 2 personation ingredients
                .andExpect(jsonPath("$.checksToConfirm[*].id").value(Matchers.hasItem("account_holder_second_link")))
                .andExpect(jsonPath("$..score").doesNotExist());

        call(post("/api/firs/" + fir + "/readiness/links"), io, link("cheating", "deception", statement)).andExpect(status().isCreated());
        call(post("/api/firs/" + fir + "/readiness/links"), io, link("cheating", "deception", statement)).andExpect(status().isBadRequest()); // twice
        call(post("/api/firs/" + fir + "/readiness/links"), io, link("cheating", "no_such", statement)).andExpect(status().isUnprocessableEntity());
        call(post("/api/firs/" + fir + "/readiness/links"), io, link("intimidation", "threat", statement)).andExpect(status().isUnprocessableEntity()); // in the playbook, but not a section of this FIR
        call(post("/api/firs/" + fir + "/readiness/links"), clerk, link("cheating", "inducement", statement)).andExpect(status().isForbidden());
        report().andExpect(jsonPath("$.openGaps").value(4))
                .andExpect(jsonPath("$.charges[0].ingredients[0].evidence[0].label").value("S-01"));

        // electronic evidence counts as linked but brings its own certificate gap until Part A and B are in
        call(post("/api/firs/" + fir + "/readiness/links"), io, link("cheating", "delivery", phone)).andExpect(status().isCreated());
        report().andExpect(jsonPath("$.openGaps").value(4))
                .andExpect(jsonPath("$.gaps[?(@.key=='certificate:" + phone + "')].severity").value("critical"));
        String cert = "{\"part\":\"%s\",\"signerName\":\"Fictional Signer\",\"deviceType\":\"phone\",\"hashAlgo\":\"SHA256\","
                + "\"hashValue\":\"" + SHA + "\",\"signedAt\":\"2026-10-03T10:00:00Z\",\"place\":\"Testpur\"}";
        for (String part : new String[] {"A", "B"})
            call(post("/api/firs/" + fir + "/evidence/" + phone + "/certificates"), io, cert.formatted(part)).andExpect(status().isCreated());
        report().andExpect(jsonPath("$.openGaps").value(3))
                .andExpect(jsonPath("$.charges[0].ingredients[2].evidence[0].courtReady").value(true));
    }

    @Test
    void evidenceFromAnotherCaseCannotBeLinked() throws Exception {
        call(put("/api/firs/" + fir + "/playbook"), io, "{\"playbookId\":\"cyber-fraud\"}");
        UUID otherFir = db.sql("""
                insert into fir (station_id, fir_year, fir_no, gd_entry_no, registered_at, information_received_at,
                  contents_original, contents_language, action_taken)
                select station_id, 2026, 32, 'GD-10', registered_at, information_received_at, 'Other fictional case', 'en', 'investigate'
                from fir where id = ? returning id""").param(fir).query(UUID.class).single();
        UUID foreign = db.sql("insert into evidence_item (fir_id,label,description,kind,seized_at,seizure_memo) "
                + "values (?,'X-01','Fictional','document','2026-10-02T10:00Z','SM-9') returning id").param(otherFir).query(UUID.class).single();
        call(post("/api/firs/" + fir + "/readiness/links"), io, link("cheating", "deception", foreign)).andExpect(status().isBadRequest());
    }

    @Test
    void aGapCanBeAcceptedOnlyWithAReasonAndTheRecordStays() throws Exception {
        call(put("/api/firs/" + fir + "/playbook"), io, "{\"playbookId\":\"cyber-fraud\"}");
        String key = "ingredient:personation/no_such_officer";
        String body = "{\"gapKey\":\"%s\",\"reason\":\"%s\"}";
        call(post("/api/firs/" + fir + "/readiness/overrides"), io, body.formatted(key, "short")).andExpect(status().isBadRequest());
        call(post("/api/firs/" + fir + "/readiness/overrides"), io, body.formatted("ingredient:made/up", "a reason long enough")).andExpect(status().isUnprocessableEntity());
        call(post("/api/firs/" + fir + "/readiness/overrides"), clerk, body.formatted(key, "a reason long enough")).andExpect(status().isForbidden());
        String reason = "Agency letter requested on 5 Oct; reply pending, prosecutor informed";
        call(post("/api/firs/" + fir + "/readiness/overrides"), io, body.formatted(key, reason)).andExpect(status().isCreated());
        call(post("/api/firs/" + fir + "/readiness/overrides"), io, body.formatted(key, reason)).andExpect(status().isUnprocessableEntity()); // already accepted
        report().andExpect(jsonPath("$.openGaps").value(4))
                .andExpect(jsonPath("$.gaps[?(@.key=='" + key + "')].override.reason").value(reason))
                .andExpect(jsonPath("$.gaps[?(@.key=='" + key + "')].override.decidedBy").value("SI Fictional Kale"));
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> db.sql("delete from readiness_override").update())
                .hasMessageContaining("kept as written");
    }
}
