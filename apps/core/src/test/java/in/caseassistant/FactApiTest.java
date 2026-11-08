package in.caseassistant;

import static org.assertj.core.api.Assertions.assertThat;
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
import org.springframework.test.web.servlet.ResultActions;

/** Facts of the FIR text confirmed by the officer (V50, design board 2, AI feature A1). Fictional data only. */
@SpringBootTest
@AutoConfigureMockMvc
class FactApiTest {
    static final String TEXT = "On 28 October 2026 a caller said he was from my bank. Rs 40,000 went out of my account by UPI.";
    static final String REQ = "7d0c3f1e-2b4a-4c55-9a77-0f1e2d3c4b5a";

    @Autowired MockMvc mvc;
    @Autowired JdbcClient db;
    @Autowired org.springframework.security.oauth2.jwt.JwtEncoder tokens;
    UUID station, fir;
    String io, sho, desk, otherIo;

    UUID user(UUID st, String role) {
        return db.sql("insert into app_user (station_id, full_name, rank, role) values (?,?,'SI',?) returning id").params(st, "Fictional " + role, role).query(UUID.class).single();
    }

    @BeforeEach
    void setUp() {
        db.sql("truncate fir, police_station, state_pack, app_user cascade").update();
        db.sql("insert into state_pack (code, name, version, languages) values ('IN','National','1',array['en'])").update();
        station = db.sql("insert into police_station (state_code, district_id, name) values ('IN',district_id_of('IN','North'),'Fictional North PS') returning id").query(UUID.class).single();
        UUID other = db.sql("insert into police_station (state_code, district_id, name) values ('IN',district_id_of('IN','South'),'Fictional South PS') returning id").query(UUID.class).single();
        UUID ioId = user(station, "io");
        io = TestAuth.bearer(tokens, ioId);
        sho = TestAuth.bearer(tokens, user(station, "sho"));
        desk = TestAuth.bearer(tokens, user(station, "front_desk"));
        otherIo = TestAuth.bearer(tokens, user(other, "io"));
        fir = firWith(ioId, false);
    }

    UUID firWith(UUID ioId, boolean protectedCase) {
        return db.sql("""
                insert into fir (station_id, fir_year, fir_no, gd_entry_no, registered_at, information_received_at, contents_original, contents_language, action_taken, io_id, identity_protected)
                values (?,2026,(select coalesce(max(fir_no),0)+1 from fir),'GD-1','2026-10-29T10:00Z','2026-10-29T09:00Z',?,'en','investigate',?,?) returning id""")
                .params(station, TEXT, ioId, protectedCase).query(UUID.class).single();
    }

    static String fact(String kind, String value, String aiValue, String quote) {
        return "{\"kind\":\"" + kind + "\",\"value\":\"" + value + "\",\"aiValue\":\"" + aiValue + "\",\"quote\":\"" + quote + "\",\"aiRequestId\":\"" + REQ + "\"}";
    }

    ResultActions confirm(UUID firId, String who, String body) throws Exception {
        return mvc.perform(post("/api/firs/" + firId + "/facts").header("Authorization", who).contentType(MediaType.APPLICATION_JSON).content(body));
    }

    @Test
    void theTeamConfirmsAFactWithTheWordsItComesFromAndACorrectionIsShownAsOne() throws Exception {
        confirm(fir, io, fact("amount", "Rs 40,000", "Rs 40,000", "Rs 40,000 went out of my account")).andExpect(status().isCreated());
        confirm(fir, sho, fact("date", "2026-10-28", "28 October 2026", "On 28 October 2026")).andExpect(status().isCreated());
        mvc.perform(get("/api/firs/" + fir + "/facts").header("Authorization", io)).andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].kind").value("amount")).andExpect(jsonPath("$[0].corrected").value(false))
                .andExpect(jsonPath("$[0].quote").value("Rs 40,000 went out of my account")).andExpect(jsonPath("$[0].ai_request_id").value(REQ))
                .andExpect(jsonPath("$[0].confirmed_by_name").value("Fictional io"))
                .andExpect(jsonPath("$[1].value").value("2026-10-28")).andExpect(jsonPath("$[1].ai_value").value("28 October 2026"))
                .andExpect(jsonPath("$[1].corrected").value(true));
        // the same fact again (letter case and spaces aside) is a conflict, not a second row
        confirm(fir, sho, fact("amount", " rs 40,000 ", "Rs 40,000", "Rs 40,000")).andExpect(status().isConflict())
                .andExpect(status().reason("This fact is already confirmed for this case."));
    }

    @Test
    void aQuoteThatIsNotTheFirTextExactlyIsRefused() throws Exception {
        confirm(fir, io, fact("amount", "Rs 50,000", "Rs 50,000", "Rs 50,000 went out")).andExpect(status().isBadRequest())
                .andExpect(status().reason("The quote of a fact must be words of the FIR text, exactly as written."));
        confirm(fir, io, fact("amount", "Rs 40,000", "Rs 40,000", "rs 40,000 went out")).andExpect(status().isBadRequest());   // letter case counts
        assertThat(db.sql("select count(*) from fir_fact").query(Long.class).single()).isZero();
    }

    @Test
    void everyFieldIsChecked() throws Exception {
        confirm(fir, io, fact("name", "A1", "A1", "a caller")).andExpect(status().isBadRequest());           // people are not a kind
        confirm(fir, io, fact("amount", " ", "Rs 40,000", "Rs 40,000")).andExpect(status().isBadRequest());
        confirm(fir, io, fact("amount", "Rs 40,000", "", "Rs 40,000")).andExpect(status().isBadRequest());
        confirm(fir, io, fact("amount", "Rs 40,000", "Rs 40,000", "")).andExpect(status().isBadRequest());
        confirm(fir, io, fact("amount", "x".repeat(201), "Rs 40,000", "Rs 40,000")).andExpect(status().isBadRequest());
        confirm(fir, io, fact("amount", "Rs 40,000", "Rs 40,000", "x".repeat(501))).andExpect(status().isBadRequest());
        confirm(fir, io, fact("amount", "Rs 40,000", "Rs 40,000", "Rs 40,000").replace(REQ, "not-an-id")).andExpect(status().isBadRequest());
        confirm(fir, io, "{\"kind\":\"amount\",\"value\":\"Rs 40,000\",\"aiValue\":\"Rs 40,000\",\"quote\":\"Rs 40,000\"}").andExpect(status().isBadRequest());
        assertThat(db.sql("select count(*) from fir_fact").query(Long.class).single()).isZero();
    }

    @Test
    void onlyTheCaseTeamReadsOrConfirms() throws Exception {
        confirm(fir, io, fact("amount", "Rs 40,000", "Rs 40,000", "Rs 40,000")).andExpect(status().isCreated());
        confirm(fir, desk, fact("upi", "UPI", "UPI", "by UPI")).andExpect(status().isForbidden());
        confirm(fir, otherIo, fact("upi", "UPI", "UPI", "by UPI")).andExpect(status().isForbidden());
        mvc.perform(get("/api/firs/" + fir + "/facts").header("Authorization", desk)).andExpect(status().isNotFound());
        mvc.perform(get("/api/firs/" + fir + "/facts").header("Authorization", otherIo)).andExpect(status().isNotFound());
        mvc.perform(get("/api/firs/" + fir + "/facts")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/firs/" + fir + "/facts").contentType(MediaType.APPLICATION_JSON).content(fact("upi", "UPI", "UPI", "by UPI")))
                .andExpect(status().isUnauthorized());
        assertThat(db.sql("select count(*) from fir_fact").query(Long.class).single()).isOne();
    }

    @Test
    void aProtectedCaseSaysSoAndReadingItsFactsIsLoggedAsAReadOfItsText() throws Exception {
        UUID ioId = db.sql("select io_id from fir where id = ?").param(fir).query(UUID.class).single();
        UUID protectedFir = firWith(ioId, true);
        // no facts yet: nothing of the text is shown, nothing logged
        mvc.perform(get("/api/firs/" + protectedFir + "/facts").header("Authorization", io)).andExpect(jsonPath("$.length()").value(0));
        assertThat(db.sql("select count(*) from protected_read").query(Long.class).single()).isZero();
        confirm(protectedFir, io, fact("amount", "Rs 40,000", "Rs 40,000", "Rs 40,000")).andExpect(status().isCreated());
        mvc.perform(get("/api/firs/" + protectedFir + "/facts").header("Authorization", sho)).andExpect(jsonPath("$.length()").value(1));
        assertThat(db.sql("select what from protected_read where fir_id = ?").param(protectedFir).query(String.class).list()).containsExactly("fir_text");
        mvc.perform(get("/api/firs/" + protectedFir).header("Authorization", io)).andExpect(jsonPath("$.victim_protected").value(true));
        mvc.perform(get("/api/firs/" + fir).header("Authorization", io)).andExpect(jsonPath("$.victim_protected").value(false))
                .andExpect(jsonPath("$.case_team").value(true));
        mvc.perform(get("/api/firs/" + fir).header("Authorization", desk)).andExpect(jsonPath("$.case_team").value(false));
        // an ordinary case's facts are not a protected read
        confirm(fir, io, fact("amount", "Rs 40,000", "Rs 40,000", "Rs 40,000")).andExpect(status().isCreated());
        mvc.perform(get("/api/firs/" + fir + "/facts").header("Authorization", io)).andExpect(jsonPath("$.length()").value(1));
        assertThat(db.sql("select count(*) from protected_read where fir_id = ?").param(fir).query(Long.class).single()).isZero();
    }
}
