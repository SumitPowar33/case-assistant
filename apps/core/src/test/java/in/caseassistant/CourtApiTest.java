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

/** Court and trial tracker (V45, design board 12): who sees and writes what, the next date, the newest summons status. Fictional data only. */
@SpringBootTest
@AutoConfigureMockMvc
class CourtApiTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcClient db;
    @Autowired org.springframework.security.oauth2.jwt.JwtEncoder tokens;
    UUID station, otherStation, fir, otherFir;
    String io, otherIo, malkhana, farMalkhana, desk, sho;

    UUID user(UUID st, String role) {
        return db.sql("insert into app_user (station_id, full_name, rank, role) values (?,?,'SI',?) returning id").params(st, "Fictional " + role, role).query(UUID.class).single();
    }

    UUID fir(UUID st, int no, UUID ioId) {
        return db.sql("""
                insert into fir (station_id, fir_year, fir_no, gd_entry_no, registered_at, information_received_at, contents_original, contents_language, action_taken, io_id)
                values (?,2026,?,'GD-1','2026-10-01T10:00Z','2026-10-01T09:00Z','Fictional complaint','en','investigate',?) returning id""").params(st, no, ioId).query(UUID.class).single();
    }

    @BeforeEach
    void setUp() {
        db.sql("truncate fir, police_station, state_pack, app_user cascade").update();
        db.sql("insert into state_pack (code, name, version, languages) values ('IN','National','1',array['en'])").update();
        station = db.sql("insert into police_station (state_code, district_id, name) values ('IN',district_id_of('IN','North'),'Fictional North PS') returning id").query(UUID.class).single();
        otherStation = db.sql("insert into police_station (state_code, district_id, name) values ('IN',district_id_of('IN','South'),'Fictional South PS') returning id").query(UUID.class).single();
        UUID ioId = user(station, "io"), otherIoId = user(otherStation, "io");
        io = TestAuth.bearer(tokens, ioId);
        otherIo = TestAuth.bearer(tokens, otherIoId);
        malkhana = TestAuth.bearer(tokens, user(station, "malkhana"));
        farMalkhana = TestAuth.bearer(tokens, user(otherStation, "malkhana"));
        desk = TestAuth.bearer(tokens, user(station, "front_desk"));
        sho = TestAuth.bearer(tokens, user(station, "sho"));
        fir = fir(station, 1, ioId);
        otherFir = fir(otherStation, 1, otherIoId);
    }

    String days(int fromToday) {
        return java.time.LocalDate.now(java.time.ZoneId.of("Asia/Kolkata")).plusDays(fromToday).toString();
    }

    ResultActions event(String who, UUID firId, String kind, String date, String extra) throws Exception {
        return mvc.perform(post("/api/firs/" + firId + "/court-events").header("Authorization", who).contentType(MediaType.APPLICATION_JSON)
                .content("{\"kind\":\"" + kind + "\",\"date\":\"" + date + "\"" + extra + "}"));
    }

    ResultActions summons(String who, UUID firId, String witness, String status, String date) throws Exception {
        return mvc.perform(post("/api/firs/" + firId + "/court-summons").header("Authorization", who).contentType(MediaType.APPLICATION_JSON)
                .content("{\"witness\":\"" + witness + "\",\"role\":\" \",\"status\":\"" + status + "\",\"date\":\"" + date + "\"}"));
    }

    @Test
    void theNextDateIsTheEarliestComingOneAndTheListShowsTheNewestCourtAndCaseNumber() throws Exception {
        event(io, fir, "chargesheet_filed", days(-10), ",\"court\":\"Fictional Court 4\",\"caseNo\":\"CC 1/2026\"").andExpect(status().isCreated());
        event(io, fir, "prosecution_evidence", days(40), "").andExpect(status().isCreated());
        event(io, fir, "charge_framing", days(12), ",\"court\":\"  \",\"note\":\"Brief ready\"").andExpect(status().isCreated());
        mvc.perform(get("/api/court").header("Authorization", io)).andExpect(status().isOk())
                .andExpect(jsonPath("$.cases[0].next_date").value(days(12))).andExpect(jsonPath("$.cases[0].court").value("Fictional Court 4"))
                .andExpect(jsonPath("$.cases[0].case_no").value("CC 1/2026")).andExpect(jsonPath("$.cases[0].events").value(3))
                .andExpect(jsonPath("$.counts.coming").value(1));
        mvc.perform(get("/api/firs/" + fir + "/court").header("Authorization", io)).andExpect(jsonPath("$.events.length()").value(3))
                .andExpect(jsonPath("$.events[0].kind").value("chargesheet_filed")).andExpect(jsonPath("$.events[1].note").value("Brief ready"));
    }

    @Test
    void aCaseWithOnlyPastDatesHasNoNextDateAndACaseWithNoEventIsNotListed() throws Exception {
        event(io, fir, "judgment", days(-1), "").andExpect(status().isCreated());
        mvc.perform(get("/api/court").header("Authorization", io)).andExpect(jsonPath("$.cases.length()").value(1))
                .andExpect(jsonPath("$.cases[0].next_date").isEmpty()).andExpect(jsonPath("$.counts.coming").value(0)).andExpect(jsonPath("$.counts.no_date").value(1));
        event(io, fir, "other", days(0), "").andExpect(status().isCreated());   // today is still "coming"
        mvc.perform(get("/api/court").header("Authorization", io)).andExpect(jsonPath("$.cases[0].next_date").value(days(0)));
    }

    @Test
    void theNewestSummonsStepOfEachWitnessIsTheCurrentOneAndSentOrNotServedCountAsOpen() throws Exception {
        event(io, fir, "chargesheet_filed", days(-3), "").andExpect(status().isCreated());
        summons(io, fir, "Fictional Witness A", "sent", days(-2)).andExpect(status().isCreated());
        summons(io, fir, "Fictional Witness B", "sent", days(-2)).andExpect(status().isCreated());
        summons(io, fir, "fictional witness a ", "served", days(-1)).andExpect(status().isCreated());   // same witness, any case or spacing
        summons(io, fir, "Fictional Witness C", "not_served", days(-1)).andExpect(status().isCreated());
        mvc.perform(get("/api/firs/" + fir + "/court").header("Authorization", io)).andExpect(jsonPath("$.summons.length()").value(3))
                .andExpect(jsonPath("$.summons[?(@.witness=='fictional witness a')].status").value("served"))
                .andExpect(jsonPath("$.summons[0].role").isEmpty());
        mvc.perform(get("/api/court").header("Authorization", io)).andExpect(jsonPath("$.cases[0].summons_open").value(2));
    }

    @Test
    void badInputIsRefusedWithFriendly400s() throws Exception {
        event(io, fir, "verdict", days(1), "").andExpect(status().isBadRequest());
        event(io, fir, "other", "tomorrow", "").andExpect(status().isBadRequest());
        event(io, fir, "other", "2026-09-30", "").andExpect(status().isBadRequest());   // before the FIR was registered (1 Oct 2026)
        event(io, fir, "other", days(1), ",\"court\":\"x\"").andExpect(status().isBadRequest());   // a one-letter court name is a mistake
        summons(io, fir, "Fictional Witness", "lost", days(-1)).andExpect(status().isBadRequest());
        summons(io, fir, "Fictional Witness", "sent", days(2)).andExpect(status().isBadRequest());   // a step is something that happened
        summons(io, fir, "x", "sent", days(-1)).andExpect(status().isBadRequest());
        summons(io, fir, "Fictional Witness", "sent", "soon").andExpect(status().isBadRequest());
    }

    @Test
    void onlyTheCaseTeamWritesAndReadersSeeOnlyTheirOwnCases() throws Exception {
        event(otherIo, fir, "other", days(1), "").andExpect(status().isForbidden());
        summons(desk, fir, "Fictional Witness", "sent", days(-1)).andExpect(status().isForbidden());   // reads the station, is not on the case team
        event(sho, fir, "other", days(1), "").andExpect(status().isCreated());
        event(otherIo, otherFir, "other", days(2), "").andExpect(status().isCreated());
        mvc.perform(get("/api/firs/" + fir + "/court").header("Authorization", otherIo)).andExpect(status().isNotFound());
        for (String who : new String[] {io, sho, desk})
            mvc.perform(get("/api/court").header("Authorization", who)).andExpect(jsonPath("$.cases.length()").value(1)).andExpect(jsonPath("$.cases[0].station").value("Fictional North PS"));
        mvc.perform(get("/api/court").header("Authorization", otherIo)).andExpect(jsonPath("$.cases[0].station").value("Fictional South PS"));
        mvc.perform(get("/api/court")).andExpect(status().isUnauthorized());
    }
}
