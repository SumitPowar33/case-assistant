package in.caseassistant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
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

/** The front desk: complaints written down, read over, signed, golden-hour steps, outcome, FIR from a complaint. Fictional data only. */
@SpringBootTest
@AutoConfigureMockMvc
class ComplaintApiTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcClient db;
    @Autowired ObjectMapper json;
    @Autowired JwtEncoder tokens;
    UUID station, other;
    String clerk, sho, sp, malkhana, otherClerk;

    String user(String role, UUID st, String name) {
        return TestAuth.bearer(tokens, db.sql("insert into app_user (station_id, full_name, rank, role) values (?,?,'HC',?) returning id")
                .params(st, name, role).query(UUID.class).single());
    }

    @BeforeEach
    void setUp() {
        db.sql("truncate fir, police_station, state_pack, app_user cascade").update();
        db.sql("insert into state_pack (code, name, version, languages) values ('IN','National','1',array['en'])").update();
        station = db.sql("insert into police_station (state_code, district_id, name) values ('IN',district_id_of('IN','North'),'Fictional North PS') returning id").query(UUID.class).single();
        other = db.sql("insert into police_station (state_code, district_id, name) values ('IN',district_id_of('IN','North'),'Fictional Other PS') returning id").query(UUID.class).single();
        clerk = user("front_desk", station, "HC Fictional Clerk");
        sho = user("sho", station, "Insp Fictional SHO");
        sp = user("sp", station, "Fictional SP");
        malkhana = user("malkhana", station, "HC Fictional Malkhana");
        otherClerk = user("front_desk", other, "HC Fictional Far Clerk");
    }

    ResultActions send(String who, String method, String path, Object body) throws Exception {
        var req = method.equals("PUT") ? put(path) : post(path);
        return mvc.perform(req.header("Authorization", who).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body)));
    }

    Map<String, Object> complaint(String mode, String kind, Instant received) {
        var m = new HashMap<String, Object>();
        m.put("stationId", station);
        m.put("receivedAt", received.toString());
        m.put("mode", mode);
        m.put("informantName", "Fictional Informant");
        m.put("informantContact", "Fictional contact");
        m.put("kind", kind);
        m.put("text", "Fictional caller took Rs 40,000 by UPI pretending to be from the bank.");
        m.put("textLanguage", "en");
        return m;
    }

    UUID take(String mode, String kind, Instant received) throws Exception {
        return UUID.fromString(json.readTree(send(clerk, "POST", "/api/complaints", complaint(mode, kind, received)).andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString()).get("id").asText());
    }

    Map<String, Object> fir(UUID complaint) {
        var m = new HashMap<String, Object>();
        m.put("stationId", station);
        m.put("firYear", 2026);
        m.put("firNo", 31);
        m.put("gdEntryNo", "GD-31");
        m.put("registeredAt", Instant.now().toString());
        m.put("actionTaken", "investigate");
        m.put("complaintId", complaint);
        return m;
    }

    @Test
    void spokenInformationIsWrittenDownReadOverSignedAndBecomesAnFirWithTheSameText() throws Exception {
        UUID c = take("oral", "cyber_financial_fraud", Instant.now().minus(10, ChronoUnit.MINUTES));
        mvc.perform(get("/api/complaints/" + c).header("Authorization", clerk)).andExpect(status().isOk())
                .andExpect(jsonPath("$.kind_label").value(org.hamcrest.Matchers.containsString("financial fraud")))
                .andExpect(jsonPath("$.steps.length()").value(3)).andExpect(jsonPath("$.steps[0].overdue").value(false))
                .andExpect(jsonPath("$.recorded_by_name").value("HC Fictional Clerk")).andExpect(jsonPath("$.sign_by").value((Object) null));
        // corrected while it is read over
        var fix = Map.of("informantName", "Fictional Informant", "kind", "cyber_financial_fraud", "text", "Fictional caller took Rs 45,000 by UPI.", "textLanguage", "en");
        send(clerk, "PUT", "/api/complaints/" + c, fix).andExpect(status().isNoContent());
        send(clerk, "POST", "/api/firs", fir(c)).andExpect(status().isConflict());                       // not signed yet
        send(clerk, "POST", "/api/complaints/" + c + "/sign", Map.of()).andExpect(status().isBadRequest());  // read over in which language?
        send(clerk, "POST", "/api/complaints/" + c + "/sign", Map.of("readBackLanguage", "mr")).andExpect(status().isNoContent());
        send(clerk, "POST", "/api/complaints/" + c + "/sign", Map.of("readBackLanguage", "mr")).andExpect(status().isConflict());
        send(clerk, "PUT", "/api/complaints/" + c, fix).andExpect(status().isConflict());                   // signed text stays
        // the FIR takes the signed text and the time received, whatever the request says
        var body = fir(c);
        body.put("contentsOriginal", "Something else entirely");
        body.put("informationReceivedAt", "2020-01-01T00:00:00Z");
        String id = json.readTree(send(clerk, "POST", "/api/firs", body).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asText();
        var f = db.sql("select contents_original, contents_language from fir where id = ?").param(UUID.fromString(id)).query().singleRow();
        assertThat(f.get("contents_original")).isEqualTo("Fictional caller took Rs 45,000 by UPI.");
        mvc.perform(get("/api/complaints/" + c).header("Authorization", clerk)).andExpect(jsonPath("$.outcome").value("fir"))
                .andExpect(jsonPath("$.fir_no").value(31)).andExpect(jsonPath("$.read_back_language").value("mr"))
                .andExpect(jsonPath("$.signed_by_name").value("HC Fictional Clerk"));
        body.put("firNo", 32);
        send(clerk, "POST", "/api/firs", body).andExpect(status().isConflict());                             // one FIR per complaint
        send(clerk, "POST", "/api/complaints/" + c + "/outcome", Map.of("outcome", "ncr", "reason", "Fictional second thoughts")).andExpect(status().isConflict());
    }

    @Test
    void aWrittenComplaintNeedsNoReadBackAndCanBeClosedWithAReason() throws Exception {
        UUID c = take("written", "other", Instant.now().minus(1, ChronoUnit.HOURS));
        send(clerk, "POST", "/api/complaints/" + c + "/outcome", Map.of("outcome", "ncr", "reason", "Fictional: non-cognizable")).andExpect(status().isConflict());
        send(clerk, "POST", "/api/complaints/" + c + "/sign", Map.of()).andExpect(status().isNoContent());
        assertThat(db.sql("select read_back_language from complaint where id = ?").param(c).query(String.class).optional()).isEmpty();
        send(clerk, "POST", "/api/complaints/" + c + "/outcome", Map.of("outcome", "ncr", "reason", "short")).andExpect(status().isBadRequest());
        send(clerk, "POST", "/api/complaints/" + c + "/outcome", Map.of("outcome", "not_signed_in_time", "reason", "Fictional: not signed in time")).andExpect(status().isBadRequest());
        send(clerk, "POST", "/api/complaints/" + c + "/outcome", Map.of("outcome", "ncr", "reason", "Fictional: non-cognizable, entered in the NCR register")).andExpect(status().isNoContent());
        mvc.perform(get("/api/complaints?open=true").header("Authorization", clerk)).andExpect(jsonPath("$.length()").value(0));
        mvc.perform(get("/api/complaints").header("Authorization", clerk)).andExpect(jsonPath("$[0].outcome").value("ncr"));
    }

    /** BNSS 173(3): a preliminary enquiry is a step with a DSP's permission; its 14 days run from receipt; it ends in an FIR or an outcome. */
    @Test
    void aPreliminaryEnquiryNeedsPermissionRunsFourteenDaysFromReceiptAndEndsInAnFirOrAnOutcome() throws Exception {
        Instant received = Instant.now().minus(15, ChronoUnit.DAYS).truncatedTo(ChronoUnit.SECONDS);
        UUID c = take("written", "other", received);
        mvc.perform(get("/api/complaints/" + c).header("Authorization", clerk)).andExpect(jsonPath("$.enquiry_due").value((Object) null));
        var enquiry = new HashMap<String, Object>(Map.of("outcome", "preliminary_enquiry", "reason", "Fictional: offence punishable 3 to 7 years"));
        send(clerk, "POST", "/api/complaints/" + c + "/outcome", enquiry).andExpect(status().isConflict());           // not signed
        send(clerk, "POST", "/api/complaints/" + c + "/sign", Map.of()).andExpect(status().isNoContent());
        mvc.perform(post("/api/complaints/" + c + "/outcome").header("Authorization", clerk).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(enquiry))).andExpect(status().isBadRequest())
                .andExpect(status().reason("Name the officer (DSP or above) who permitted the preliminary enquiry (BNSS 173(3))."));
        enquiry.put("permittedBy", "DSP Fictional Sub-Division");
        send(clerk, "POST", "/api/complaints/" + c + "/outcome", enquiry).andExpect(status().isNoContent());
        send(clerk, "POST", "/api/complaints/" + c + "/outcome", enquiry).andExpect(status().isConflict());           // once
        var seen = json.readTree(mvc.perform(get("/api/complaints/" + c).header("Authorization", clerk)).andExpect(jsonPath("$.outcome").value((Object) null))
                .andExpect(jsonPath("$.enquiry_permitted_by").value("DSP Fictional Sub-Division")).andExpect(jsonPath("$.enquiry_overdue").value(true))
                .andReturn().getResponse().getContentAsString());
        assertThat(Instant.parse(seen.get("enquiry_due").asText())).isEqualTo(received.plus(14, ChronoUnit.DAYS));
        mvc.perform(get("/api/complaints?open=true").header("Authorization", clerk)).andExpect(jsonPath("$[0].enquiry_overdue").value(true));
        // the enquiry found a prima facie case: the FIR takes the signed text
        send(clerk, "POST", "/api/firs", fir(c)).andExpect(status().isCreated());
        mvc.perform(get("/api/complaints/" + c).header("Authorization", clerk)).andExpect(jsonPath("$.outcome").value("fir"))
                .andExpect(jsonPath("$.enquiry_overdue").value(false)).andExpect(jsonPath("$.enquiry_permitted_by").value("DSP Fictional Sub-Division"));
        // or it found none: closed with a reason
        UUID n = take("written", "other", Instant.now().minus(1, ChronoUnit.HOURS));
        send(clerk, "POST", "/api/complaints/" + n + "/sign", Map.of()).andExpect(status().isNoContent());
        send(clerk, "POST", "/api/complaints/" + n + "/outcome", enquiry).andExpect(status().isNoContent());
        mvc.perform(get("/api/complaints/" + n).header("Authorization", clerk)).andExpect(jsonPath("$.enquiry_overdue").value(false));
        send(clerk, "POST", "/api/complaints/" + n + "/outcome", Map.of("outcome", "no_offence", "reason", "Fictional: enquiry found no prima facie case")).andExpect(status().isNoContent());
        // a closed complaint cannot go to an enquiry afterwards
        send(clerk, "POST", "/api/complaints/" + n + "/outcome", enquiry).andExpect(status().isConflict());
    }

    @Test
    void correctionsBeforeSigningKeepTheEarlierWording() throws Exception {
        UUID c = take("oral", "other", Instant.now());
        var fix = Map.of("informantName", "Fictional Informant", "kind", "other", "text", "Fictional corrected words.", "textLanguage", "en");
        send(clerk, "PUT", "/api/complaints/" + c, fix).andExpect(status().isNoContent());
        mvc.perform(get("/api/complaints/" + c).header("Authorization", clerk)).andExpect(jsonPath("$.text_original").value("Fictional corrected words."))
                .andExpect(jsonPath("$.versions.length()").value(1))
                .andExpect(jsonPath("$.versions[0].text_original").value(org.hamcrest.Matchers.startsWith("Fictional caller took Rs 40,000")))
                .andExpect(jsonPath("$.versions[0].replaced_by_name").value("HC Fictional Clerk"));
        send(clerk, "POST", "/api/complaints/" + c + "/sign", Map.of("readBackLanguage", "en")).andExpect(status().isNoContent());
        send(clerk, "PUT", "/api/complaints/" + c, fix).andExpect(status().isConflict());
        assertThat(db.sql("select count(*) from complaint_version where complaint_id = ?").param(c).query(Long.class).single()).isEqualTo(1);
    }

    @Test
    void anOpenSexualOffenceComplaintIsReadOnlyByItsRecorderAndTheStationsSupervisors() throws Exception {
        // BNS 72; Nipun Saxena v Union of India (2018): the information names the victim before any FIR exists
        UUID c = take("written", "sexual_offence", Instant.now().minus(5, ChronoUnit.MINUTES));
        String colleague = user("front_desk", station, "HC Fictional Colleague");
        mvc.perform(get("/api/complaints/" + c).header("Authorization", colleague)).andExpect(jsonPath("$.withheld").value(true))
                .andExpect(jsonPath("$.text_original").value((Object) null)).andExpect(jsonPath("$.versions.length()").value(0));
        assertThat(mvc.perform(get("/api/complaints").header("Authorization", colleague)).andReturn().getResponse().getContentAsString()).doesNotContain("Fictional Informant");
        send(colleague, "POST", "/api/complaints/" + c + "/sign", Map.of()).andExpect(status().isForbidden());
        send(colleague, "PUT", "/api/complaints/" + c, Map.of("informantName", "X", "kind", "other", "text", "Changed", "textLanguage", "en")).andExpect(status().isForbidden());
        mvc.perform(get("/api/complaints/" + c).header("Authorization", sho)).andExpect(jsonPath("$.withheld").value(false));
        send(clerk, "POST", "/api/complaints/" + c + "/sign", Map.of()).andExpect(status().isNoContent());
        send(colleague, "POST", "/api/firs", fir(c)).andExpect(status().isForbidden());
        send(colleague, "POST", "/api/complaints/" + c + "/outcome", Map.of("outcome", "no_offence", "reason", "Fictional reason text")).andExpect(status().isForbidden());
        String id = json.readTree(send(clerk, "POST", "/api/firs", fir(c)).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asText();
        // the FIR protects the victim's identity even though no section was given yet
        assertThat(db.sql("select identity_protected_case(?::uuid)").param(id).query(Boolean.class).single()).isTrue();
    }

    @Test
    void electronicInformationLapsesUnlessSignedWithinThreeDays() throws Exception {
        UUID late = take("electronic", "other", Instant.now().minus(4, ChronoUnit.DAYS));
        mvc.perform(get("/api/complaints/" + late).header("Authorization", clerk)).andExpect(jsonPath("$.sign_by").isNotEmpty());
        send(clerk, "POST", "/api/complaints/" + late + "/sign", Map.of()).andExpect(status().isConflict());
        send(clerk, "POST", "/api/complaints/" + late + "/outcome", Map.of("outcome", "not_signed_in_time", "reason", "Fictional: informant never came to sign")).andExpect(status().isNoContent());
        UUID fresh = take("electronic", "other", Instant.now().minus(2, ChronoUnit.DAYS));
        send(clerk, "POST", "/api/complaints/" + fresh + "/sign", Map.of("readBackLanguage", "mr")).andExpect(status().isNoContent());
        assertThat(db.sql("select read_back_language from complaint where id = ?").param(fresh).query(String.class).optional()).as("only spoken information is read over").isEmpty();
    }

    @Test
    void goldenHourStepsAreDueFromReceiptAndRecordedOnce() throws Exception {
        UUID c = take("oral", "cyber_financial_fraud", Instant.now().minus(2, ChronoUnit.HOURS));
        mvc.perform(get("/api/complaints/" + c).header("Authorization", clerk)).andExpect(jsonPath("$.steps[0].id").value("report_1930"))
                .andExpect(jsonPath("$.steps[0].overdue").value(true)).andExpect(jsonPath("$.steps[0].basis").isNotEmpty());
        mvc.perform(get("/api/complaints?open=true").header("Authorization", clerk)).andExpect(jsonPath("$[0].steps_overdue").value(3));
        send(clerk, "POST", "/api/complaints/" + c + "/steps", Map.of("stepId", "report_1930", "note", "Fictional acknowledgement 2026-1")).andExpect(status().isNoContent());   // 204: an empty 201 broke the web client
        send(clerk, "POST", "/api/complaints/" + c + "/steps", Map.of("stepId", "report_1930")).andExpect(status().isConflict());
        send(clerk, "POST", "/api/complaints/" + c + "/steps", Map.of("stepId", "medical_exam")).andExpect(status().isBadRequest());   // not a step of this kind
        mvc.perform(get("/api/complaints/" + c).header("Authorization", clerk)).andExpect(jsonPath("$.steps[0].overdue").value(false))
                .andExpect(jsonPath("$.steps[0].done_by_name").value("HC Fictional Clerk")).andExpect(jsonPath("$.steps[0].note").value("Fictional acknowledgement 2026-1"));
        mvc.perform(get("/api/complaint-kinds").header("Authorization", malkhana)).andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.id=='other')]").isNotEmpty());
    }

    @Test
    void onlyStaffWhoRegisterFirsAtTheStationSeeOrTouchItsComplaints() throws Exception {
        UUID c = take("oral", "other", Instant.now());
        for (String outsider : new String[] {otherClerk, sp, malkhana})
            mvc.perform(get("/api/complaints/" + c).header("Authorization", outsider)).andExpect(status().isNotFound());
        send(otherClerk, "POST", "/api/complaints/" + c + "/sign", Map.of("readBackLanguage", "en")).andExpect(status().isNotFound());
        send(otherClerk, "POST", "/api/complaints/" + c + "/steps", Map.of("stepId", "x1")).andExpect(status().isNotFound());
        send(otherClerk, "POST", "/api/complaints", complaint("oral", "other", Instant.now())).andExpect(status().isForbidden());
        mvc.perform(get("/api/complaints").header("Authorization", malkhana)).andExpect(status().isForbidden());
        mvc.perform(get("/api/complaints").header("Authorization", otherClerk)).andExpect(jsonPath("$.length()").value(0));
        mvc.perform(get("/api/complaints/" + c).header("Authorization", sho)).andExpect(status().isOk());
        // an FIR at another station cannot take this complaint
        send(clerk, "POST", "/api/complaints/" + c + "/sign", Map.of("readBackLanguage", "en")).andExpect(status().isNoContent());
        var body = fir(c);
        body.put("stationId", other);
        send(otherClerk, "POST", "/api/firs", body).andExpect(status().isBadRequest());
        body.put("complaintId", UUID.randomUUID());
        body.put("stationId", station);
        send(clerk, "POST", "/api/firs", body).andExpect(status().isBadRequest());
    }

    @Test
    void onAProtectedCaseTheComplaintTextAndInformantAreWithheldFromStationStaffOutsideTheCaseTeam() throws Exception {
        // regression (weekly review 31 Oct): the FIR withheld the text (BNS 72) but the complaint it came from still showed it
        UUID c = take("written", "sexual_offence", Instant.now().minus(5, ChronoUnit.MINUTES));
        mvc.perform(get("/api/complaints/" + c).header("Authorization", clerk)).andExpect(jsonPath("$.withheld").value(false))
                .andExpect(jsonPath("$.informant_name").value("Fictional Informant"));   // still being written down: the desk needs it
        send(clerk, "POST", "/api/complaints/" + c + "/sign", Map.of()).andExpect(status().isNoContent());
        var body = fir(c);
        body.put("sections", java.util.List.of(Map.of("act", "BNS", "section", "64")));
        send(clerk, "POST", "/api/firs", body).andExpect(status().isCreated());
        for (String who : new String[] {clerk, user("io", station, "SI Fictional Not On Case")}) {
            mvc.perform(get("/api/complaints/" + c).header("Authorization", who)).andExpect(status().isOk())
                    .andExpect(jsonPath("$.withheld").value(true)).andExpect(jsonPath("$.text_original").value((Object) null))
                    .andExpect(jsonPath("$.informant_name").value((Object) null)).andExpect(jsonPath("$.informant_contact").value((Object) null));
            String list = mvc.perform(get("/api/complaints").header("Authorization", who)).andReturn().getResponse().getContentAsString();
            assertThat(list).doesNotContain("Fictional Informant").contains("\"withheld\":true");
        }
        mvc.perform(get("/api/complaints/" + c).header("Authorization", sho)).andExpect(jsonPath("$.withheld").value(false))   // case team
                .andExpect(jsonPath("$.text_original").value(org.hamcrest.Matchers.startsWith("Fictional caller")));
        // an unprotected case keeps showing it to the desk
        UUID plain = take("written", "other", Instant.now());
        send(clerk, "POST", "/api/complaints/" + plain + "/sign", Map.of()).andExpect(status().isNoContent());
        var b2 = fir(plain);
        b2.put("firNo", 77);
        send(clerk, "POST", "/api/firs", b2).andExpect(status().isCreated());
        mvc.perform(get("/api/complaints/" + plain).header("Authorization", clerk)).andExpect(jsonPath("$.withheld").value(false))
                .andExpect(jsonPath("$.informant_name").value("Fictional Informant"));
    }

    @Test
    void badComplaintsAreRefused() throws Exception {
        var future = complaint("oral", "other", Instant.now().plus(1, ChronoUnit.HOURS));
        send(clerk, "POST", "/api/complaints", future).andExpect(status().isBadRequest());
        send(clerk, "POST", "/api/complaints", complaint("oral", "no_such_kind", Instant.now())).andExpect(status().isBadRequest());
        send(clerk, "POST", "/api/complaints", complaint("fax", "other", Instant.now())).andExpect(status().isBadRequest());
        var blank = complaint("oral", "other", Instant.now());
        blank.put("text", " ");
        send(clerk, "POST", "/api/complaints", blank).andExpect(status().isBadRequest());
        UUID c = take("oral", "other", Instant.now());
        send(clerk, "PUT", "/api/complaints/" + c, Map.of("informantName", "x", "kind", "no_such_kind", "text", "t", "textLanguage", "en")).andExpect(status().isBadRequest());
        // an FIR typed without a complaint still needs its text, language and time received
        var bare = fir(c);
        bare.remove("complaintId");
        send(clerk, "POST", "/api/firs", bare).andExpect(status().isBadRequest());
    }
}
