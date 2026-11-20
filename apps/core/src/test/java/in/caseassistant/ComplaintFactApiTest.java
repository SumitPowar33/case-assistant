package in.caseassistant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HashMap;
import java.util.Map;
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

/** Facts of a signed complaint confirmed at the front desk (V61, design board 2, AI feature A1). Fictional data only. */
@SpringBootTest
@AutoConfigureMockMvc
class ComplaintFactApiTest {
    static final String TEXT = "Fictional caller took Rs 40,000 by UPI pretending to be from the bank.";
    static final String REQ = "7d0c3f1e-2b4a-4c55-9a77-0f1e2d3c4b5a";

    @Autowired MockMvc mvc;
    @Autowired JdbcClient db;
    @Autowired ObjectMapper json;
    @Autowired JwtEncoder tokens;
    UUID station;
    String clerk, otherClerk, sho, malkhana;

    String user(String role, UUID st, String name) {
        return TestAuth.bearer(tokens, db.sql("insert into app_user (station_id, full_name, rank, role) values (?,?,'HC',?) returning id")
                .params(st, name, role).query(UUID.class).single());
    }

    @BeforeEach
    void setUp() {
        db.sql("truncate fir, police_station, state_pack, app_user cascade").update();
        db.sql("insert into state_pack (code, name, version, languages) values ('IN','National','1',array['en'])").update();
        station = db.sql("insert into police_station (state_code, district_id, name) values ('IN',district_id_of('IN','North'),'Fictional North PS') returning id").query(UUID.class).single();
        UUID other = db.sql("insert into police_station (state_code, district_id, name) values ('IN',district_id_of('IN','North'),'Fictional Other PS') returning id").query(UUID.class).single();
        clerk = user("front_desk", station, "HC Fictional Clerk");
        otherClerk = user("front_desk", other, "HC Fictional Far Clerk");
        sho = user("sho", station, "Insp Fictional SHO");
        malkhana = user("malkhana", station, "HC Fictional Malkhana");
    }

    UUID take(String kind, boolean sign) throws Exception {
        var m = new HashMap<String, Object>();
        m.put("stationId", station);
        m.put("receivedAt", Instant.now().minus(10, ChronoUnit.MINUTES).toString());
        m.put("mode", "written");
        m.put("informantName", "Fictional Informant");
        m.put("kind", kind);
        m.put("text", TEXT);
        m.put("textLanguage", "en");
        UUID c = UUID.fromString(json.readTree(mvc.perform(post("/api/complaints").header("Authorization", clerk).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(m))).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asText());
        if (sign) mvc.perform(post("/api/complaints/" + c + "/sign").header("Authorization", clerk).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isNoContent());
        return c;
    }

    static String fact(String kind, String value, String aiValue, String quote) {
        return "{\"kind\":\"" + kind + "\",\"value\":\"" + value + "\",\"aiValue\":\"" + aiValue + "\",\"quote\":\"" + quote + "\",\"aiRequestId\":\"" + REQ + "\"}";
    }

    ResultActions confirm(UUID c, String who, String body) throws Exception {
        return mvc.perform(post("/api/complaints/" + c + "/facts").header("Authorization", who).contentType(MediaType.APPLICATION_JSON).content(body));
    }

    @Test
    void theFrontDeskConfirmsFactsOfASignedComplaintAndACorrectionIsShownAsOne() throws Exception {
        UUID c = take("cyber_financial_fraud", true);
        mvc.perform(get("/api/complaints/" + c + "/ai-check").header("Authorization", clerk)).andExpect(status().isOk())
                .andExpect(jsonPath("$.victim_protected").value(false));
        confirm(c, clerk, fact("amount", "Rs 40,000", "Rs 40,000", "Rs 40,000 by UPI")).andExpect(status().isCreated());
        confirm(c, sho, fact("upi", "UPI", "by UPI", "by UPI")).andExpect(status().isCreated());
        mvc.perform(get("/api/complaints/" + c + "/facts").header("Authorization", clerk)).andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].kind").value("amount")).andExpect(jsonPath("$[0].corrected").value(false))
                .andExpect(jsonPath("$[0].quote").value("Rs 40,000 by UPI")).andExpect(jsonPath("$[0].ai_request_id").value(REQ))
                .andExpect(jsonPath("$[0].confirmed_by_name").value("HC Fictional Clerk"))
                .andExpect(jsonPath("$[1].ai_value").value("by UPI")).andExpect(jsonPath("$[1].corrected").value(true));
        confirm(c, sho, fact("amount", " rs 40,000 ", "Rs 40,000", "Rs 40,000")).andExpect(status().isConflict())
                .andExpect(status().reason("This fact is already confirmed for this complaint."));
        assertThat(db.sql("select count(*) from protected_read").query(Long.class).single()).isZero();
    }

    @Test
    void anUnsignedComplaintTakesNoFactsAndAQuoteMustBeItsWords() throws Exception {
        UUID c = take("other", false);
        confirm(c, clerk, fact("amount", "Rs 40,000", "Rs 40,000", "Rs 40,000")).andExpect(status().isConflict())
                .andExpect(status().reason("The informant has not signed the text yet."));
        mvc.perform(post("/api/complaints/" + c + "/sign").header("Authorization", clerk).contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isNoContent());
        confirm(c, clerk, fact("amount", "Rs 50,000", "Rs 50,000", "Rs 50,000 by UPI")).andExpect(status().isBadRequest())
                .andExpect(status().reason("The quote of a fact must be words of the complaint text, exactly as written."));
        confirm(c, clerk, fact("amount", "Rs 40,000", "Rs 40,000", "rs 40,000")).andExpect(status().isBadRequest());
        confirm(c, clerk, fact("name", "A", "A", "caller")).andExpect(status().isBadRequest());
        confirm(c, clerk, fact("amount", " ", "Rs 40,000", "Rs 40,000")).andExpect(status().isBadRequest());
        confirm(c, clerk, fact("amount", "Rs 40,000", "Rs 40,000", "Rs 40,000").replace(REQ, "not-an-id")).andExpect(status().isBadRequest());
        confirm(c, clerk, "{\"kind\":\"amount\",\"value\":\"Rs 40,000\",\"aiValue\":\"Rs 40,000\",\"quote\":\"Rs 40,000\"}").andExpect(status().isBadRequest());
        assertThat(db.sql("select count(*) from complaint_fact").query(Long.class).single()).isZero();
    }

    @Test
    void onlyStaffWhoMayRegisterAtTheStationReadOrConfirm() throws Exception {
        UUID c = take("other", true);
        for (String who : new String[] {otherClerk, malkhana}) {
            confirm(c, who, fact("amount", "Rs 40,000", "Rs 40,000", "Rs 40,000")).andExpect(status().isNotFound());
            mvc.perform(get("/api/complaints/" + c + "/facts").header("Authorization", who)).andExpect(status().isNotFound());
            mvc.perform(get("/api/complaints/" + c + "/ai-check").header("Authorization", who)).andExpect(status().isNotFound());
        }
        mvc.perform(get("/api/complaints/" + c + "/facts")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/complaints/" + c + "/ai-check")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/complaints/" + c + "/facts").contentType(MediaType.APPLICATION_JSON).content(fact("upi", "UPI", "UPI", "by UPI")))
                .andExpect(status().isUnauthorized());
        assertThat(db.sql("select count(*) from complaint_fact").query(Long.class).single()).isZero();
    }

    @Test
    void informationAboutAProtectedVictimIsNotSentToTheAiAndItsOldFactsAreReadLogged() throws Exception {
        UUID c = take("sexual_offence", true);
        // the officer who wrote it down is told it is protected (the gateway then refuses); another clerk is refused outright
        mvc.perform(get("/api/complaints/" + c + "/ai-check").header("Authorization", clerk)).andExpect(jsonPath("$.victim_protected").value(true));
        String second = user("front_desk", station, "HC Fictional Second Clerk");
        mvc.perform(get("/api/complaints/" + c + "/ai-check").header("Authorization", second)).andExpect(status().isForbidden());
        mvc.perform(get("/api/complaints/" + c + "/facts").header("Authorization", second)).andExpect(status().isForbidden());
        confirm(c, second, fact("amount", "Rs 40,000", "Rs 40,000", "Rs 40,000")).andExpect(status().isForbidden());
        confirm(c, clerk, fact("amount", "Rs 40,000", "Rs 40,000", "Rs 40,000")).andExpect(status().isBadRequest());
        // no facts yet: nothing of the text is shown, nothing logged
        mvc.perform(get("/api/complaints/" + c + "/facts").header("Authorization", clerk)).andExpect(jsonPath("$.length()").value(0));
        assertThat(db.sql("select count(*) from protected_read").query(Long.class).single()).isZero();
        // a fact kept before the kind was protected is read-logged
        UUID who = db.sql("select id from app_user where full_name = 'HC Fictional Clerk'").query(UUID.class).single();
        db.sql("insert into complaint_fact (complaint_id, kind, value, ai_value, quote, ai_request_id, confirmed_by) values (?,'amount','Rs 40,000','Rs 40,000','Rs 40,000',?,?)")
                .params(c, UUID.fromString(REQ), who).update();
        mvc.perform(get("/api/complaints/" + c + "/facts").header("Authorization", sho)).andExpect(jsonPath("$.length()").value(1));
        assertThat(db.sql("select count(*) from protected_read where complaint_id = ?").param(c).query(Long.class).single()).isOne();
    }

    UUID register(UUID c, int no, Object sections) throws Exception {
        var m = new HashMap<String, Object>(Map.of("stationId", station, "firYear", 2026, "firNo", no, "gdEntryNo", "GD-" + no,
                "registeredAt", Instant.now().toString(), "actionTaken", "investigate", "complaintId", c));
        if (sections != null) m.put("sections", sections);
        return UUID.fromString(json.readTree(mvc.perform(post("/api/firs").header("Authorization", clerk).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(m))).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asText());
    }

    @Test
    void theFactsConfirmedOnTheComplaintCarryOverToItsFirAsConfirmed() throws Exception {
        UUID c = take("cyber_financial_fraud", true);
        confirm(c, clerk, fact("amount", "Rs 40,000", "Rs 40,000", "Rs 40,000 by UPI")).andExpect(status().isCreated());
        confirm(c, clerk, fact("upi", "UPI", "by UPI", "by UPI")).andExpect(status().isCreated());
        UUID f = register(c, 7, null);
        var rows = db.sql("select kind, value, ai_value, quote, ai_request_id::text r, confirmed_by from fir_fact where fir_id = ? order by kind").param(f).query().listOfRows();
        assertThat(rows).hasSize(2);
        assertThat(rows.get(0)).containsEntry("kind", "amount").containsEntry("quote", "Rs 40,000 by UPI").containsEntry("r", REQ);
        assertThat(rows.get(1)).containsEntry("value", "UPI").containsEntry("ai_value", "by UPI");
        assertThat(db.sql("select count(*) from complaint_fact where complaint_id = ?").param(c).query(Long.class).single()).isEqualTo(2);
    }

    @Test
    void aComplaintWithoutFactsOrAFirThatProtectsTheVictimCarriesNothingOverAndStillRegisters() throws Exception {
        UUID none = take("other", true);
        register(none, 8, null);
        UUID c = take("cyber_financial_fraud", true);
        confirm(c, clerk, fact("amount", "Rs 40,000", "Rs 40,000", "Rs 40,000")).andExpect(status().isCreated());
        UUID f = register(c, 9, java.util.List.of(Map.of("act", "BNS", "section", "64")));
        assertThat(db.sql("select count(*) from fir_fact").query(Long.class).single()).isZero();
        assertThat(db.sql("select count(*) from fir where id = ?").param(f).query(Long.class).single()).isOne();
    }
}
