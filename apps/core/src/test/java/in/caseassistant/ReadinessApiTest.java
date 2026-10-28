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
        return call(get("/api/firs/" + fir + "/readiness"), io, null).andExpect(status().isOk());
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
                .andExpect(jsonPath("$.checksToConfirm[*].id").value(Matchers.hasItem("bank_officer_witness")))
                .andExpect(jsonPath("$.checksToConfirm[*].id").value(Matchers.not(Matchers.hasItem("account_holder_second_link"))))
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

    UUID person(String role, String label) {
        return db.sql("insert into person (fir_id, role, label, full_name) values (?,?,?,?) returning id")
                .params(fir, role, label, "Fictional " + label).query(UUID.class).single();
    }

    @Test
    void everyAccountHolderNeedsAnIndependentSecondLink() throws Exception {
        UUID a1 = person("accused", "A1"), a2 = person("accused", "A2"), w1 = person("witness", "W1");
        String holder = "/api/firs/" + fir + "/people/%s/account-holder";
        String basis = "{\"basis\":\"Bank reply to notice N-3: receiving account\"}";
        call(post("/api/firs/" + fir + "/readiness/accused-links"), io, "{\"personId\":\"%s\",\"linkType\":\"own_statement\",\"evidenceItemId\":\"%s\"}"
                .formatted(a1, statement)).andExpect(status().isUnprocessableEntity()); // no playbook yet
        call(put("/api/firs/" + fir + "/playbook"), io, "{\"playbookId\":\"cyber-fraud\"}");

        call(put(holder.formatted(a1)), clerk, basis).andExpect(status().isForbidden());
        call(put(holder.formatted(a1)), io, "{\"basis\":\"x\"}").andExpect(status().isBadRequest());
        call(put(holder.formatted(w1)), io, basis).andExpect(status().isBadRequest()); // only an accused
        call(put(holder.formatted(a1)), io, basis).andExpect(status().isNoContent());
        call(put(holder.formatted(a1)), io, "{\"basis\":\"A later, different basis\"}").andExpect(status().isNoContent()); // already marked: the first basis stays
        call(put(holder.formatted(a2)), io, basis).andExpect(status().isNoContent());
        report().andExpect(jsonPath("$.openGaps").value(7)) // 5 ingredients + 2 account holders
                .andExpect(jsonPath("$.secondLinkRule.requiresAny").value(Matchers.hasItem("kyc_identification")))
                .andExpect(jsonPath("$.accountHolders[*].name").value(Matchers.contains("A1 Fictional A1", "A2 Fictional A2")))
                .andExpect(jsonPath("$.accountHolders[0].basis").value("Bank reply to notice N-3: receiving account"))
                .andExpect(jsonPath("$.gaps[?(@.key=='second-link:" + a1 + "')].severity").value("critical"))
                .andExpect(jsonPath("$..score").doesNotExist());

        String link = "{\"personId\":\"%s\",\"linkType\":\"%s\",\"evidenceItemId\":\"%s\"}";
        String url = "/api/firs/" + fir + "/readiness/accused-links";
        call(post(url), io, link.formatted(a1, "money_received", phone)).andExpect(status().isUnprocessableEntity()); // not an independent link
        call(post(url), io, link.formatted(w1, "kyc_identification", phone)).andExpect(status().isBadRequest());
        call(post(url), clerk, link.formatted(a1, "kyc_identification", phone)).andExpect(status().isForbidden());
        call(post(url), io, link.formatted(a1, "kyc_identification", phone)).andExpect(status().isCreated());
        // A1's gap closes; the KYC record is electronic, so its certificate gap opens until Part A and B are in
        report().andExpect(jsonPath("$.openGaps").value(7))
                .andExpect(jsonPath("$.gaps[?(@.key=='second-link:" + a1 + "')]").isEmpty())
                .andExpect(jsonPath("$.gaps[?(@.key=='certificate:" + phone + "')]").isNotEmpty())
                .andExpect(jsonPath("$.accountHolders[0].links[0].linkType").value("kyc_identification"));

        String reason = "A2's KYC request sent to the bank on 6 Oct; prosecutor informed";
        call(post("/api/firs/" + fir + "/readiness/overrides"), io, "{\"gapKey\":\"second-link:%s\",\"reason\":\"%s\"}".formatted(a2, reason))
                .andExpect(status().isCreated());
        report().andExpect(jsonPath("$.openGaps").value(6))
                .andExpect(jsonPath("$.gaps[?(@.key=='second-link:" + a2 + "')].override.reason").value(reason));

        org.assertj.core.api.Assertions.assertThatThrownBy(() -> db.sql("delete from accused_link").update()).hasMessageContaining("kept as written");
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> db.sql("update account_holder set basis = 'changed later'").update())
                .hasMessageContaining("kept as written");
    }

    @Test
    void aWrongLinkOrAnAcceptedGapIsWithdrawnWithAReasonAndStaysOnRecord() throws Exception {
        call(put("/api/firs/" + fir + "/playbook"), io, "{\"playbookId\":\"cyber-fraud\"}");
        String linkId = com.jayway.jsonpath.JsonPath.read(call(post("/api/firs/" + fir + "/readiness/links"), io, link("cheating", "deception", statement))
                .andReturn().getResponse().getContentAsString(), "$.id");
        report().andExpect(jsonPath("$.openGaps").value(4)).andExpect(jsonPath("$.charges[0].ingredients[0].evidence[0].linkId").value(linkId));
        String url = "/api/firs/" + fir + "/readiness/links/" + linkId + "/withdraw";
        String why = "{\"reason\":\"%s\"}";
        call(post(url), io, why.formatted("too short")).andExpect(status().isBadRequest());
        call(post(url), io, why.formatted("          x")).andExpect(status().isBadRequest());
        call(post(url), clerk, why.formatted("Linked to the wrong ingredient")).andExpect(status().isForbidden());
        call(post("/api/firs/" + fir + "/readiness/people/" + linkId + "/withdraw"), io, why.formatted("Linked to the wrong ingredient")).andExpect(status().isNotFound());
        call(post(url), io, why.formatted("Linked to the wrong ingredient")).andExpect(status().isNoContent());
        call(post(url), io, why.formatted("Linked to the wrong ingredient")).andExpect(status().isNotFound()); // already withdrawn
        report().andExpect(jsonPath("$.openGaps").value(5))
                .andExpect(jsonPath("$.charges[0].ingredients[0].evidence").isEmpty())
                .andExpect(jsonPath("$.withdrawn[0].what").value("evidence link"))
                .andExpect(jsonPath("$.withdrawn[0].reason").value("Linked to the wrong ingredient"))
                .andExpect(jsonPath("$.withdrawn[0].withdrawn_by").value("SI Fictional Kale"));
        call(post("/api/firs/" + fir + "/readiness/links"), io, link("cheating", "deception", statement)).andExpect(status().isCreated()); // can be made anew

        String key = "ingredient:personation/no_such_officer";
        String accept = "{\"gapKey\":\"" + key + "\",\"reason\":\"Agency letter pending, prosecutor told\"}";
        String overrideId = com.jayway.jsonpath.JsonPath.read(call(post("/api/firs/" + fir + "/readiness/overrides"), io, accept)
                .andReturn().getResponse().getContentAsString(), "$.id");
        report().andExpect(jsonPath("$.gaps[?(@.key=='" + key + "')].override.id").value(overrideId));
        call(post("/api/firs/" + fir + "/readiness/overrides/" + overrideId + "/withdraw"), io, why.formatted("Agency replied; the letter is now on file"))
                .andExpect(status().isNoContent());
        report().andExpect(jsonPath("$.gaps[?(@.key=='" + key + "')].override").value(Matchers.contains((Object) null)))
                .andExpect(jsonPath("$.withdrawn[1].what").value("accepted gap"));
        call(post("/api/firs/" + fir + "/readiness/overrides"), io, accept).andExpect(status().isCreated()); // can be accepted again

        org.assertj.core.api.Assertions.assertThatThrownBy(() -> db.sql("delete from ingredient_evidence").update()).hasMessageContaining("kept as written");
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> db.sql("update ingredient_evidence set note = 'changed', withdrawn_at = now(), "
                + "withdrawn_by = linked_by, withdrawn_reason = 'a long enough reason'").update()).hasMessageContaining("kept as written");
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> db.sql("update readiness_override set withdrawn_reason = 'rewritten later on' "
                + "where withdrawn_at is not null").update()).hasMessageContaining("already withdrawn");
    }
}
