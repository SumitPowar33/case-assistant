package in.caseassistant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.time.LocalDate;
import java.time.ZoneId;
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

/** The report to the Magistrate on sections added during the investigation (V64, A2). Fictional data only. */
@SpringBootTest
@AutoConfigureMockMvc
class SectionReportApiTest {
    static final String TEXT = "FIR No. 1/2026: the section IT Act 66D has been added for the reasons given below.";
    static final String COURT = "Court of the Fictional Judicial Magistrate";

    @Autowired MockMvc mvc;
    @Autowired JdbcClient db;
    @Autowired org.springframework.security.oauth2.jwt.JwtEncoder tokens;
    UUID station, fir, ioId;
    String io, sho, desk, otherIo;

    UUID user(UUID st, String role) {
        return db.sql("insert into app_user (station_id, full_name, rank, role) values (?,?,'SI',?) returning id").params(st, "Fictional " + role, role).query(UUID.class).single();
    }

    static String today() {
        return LocalDate.now(ZoneId.of("Asia/Kolkata")).toString();
    }

    @BeforeEach
    void setUp() {
        db.sql("truncate fir, police_station, state_pack, app_user cascade").update();
        db.sql("insert into state_pack (code, name, version, languages) values ('IN','National','1',array['en'])").update();
        station = db.sql("insert into police_station (state_code, district_id, name) values ('IN',district_id_of('IN','North'),'Fictional North PS') returning id").query(UUID.class).single();
        UUID other = db.sql("insert into police_station (state_code, district_id, name) values ('IN',district_id_of('IN','South'),'Fictional South PS') returning id").query(UUID.class).single();
        ioId = user(station, "io");
        io = TestAuth.bearer(tokens, ioId);
        sho = TestAuth.bearer(tokens, user(station, "sho"));
        desk = TestAuth.bearer(tokens, user(station, "front_desk"));
        otherIo = TestAuth.bearer(tokens, user(other, "io"));
        fir = db.sql("""
                insert into fir (station_id, fir_year, fir_no, gd_entry_no, registered_at, information_received_at, contents_original, contents_language, action_taken, io_id)
                values (?,2026,1,'GD-1','2026-10-29T10:00Z','2026-10-29T09:00Z','A caller said he was from my bank.','en','investigate',?) returning id""")
                .params(station, ioId).query(UUID.class).single();
        db.sql("insert into fir_section (fir_id, act, section) values (?, 'BNS', '318(4)')").param(fir).update();
    }

    void addSection(String act, String section) {
        db.sql("insert into fir_section (fir_id, act, section, chosen_by, added_at, reason) values (?,?,?,?,clock_timestamp(),'The caller posed as the bank on the phone')")
                .params(fir, act, section, ioId).update();
    }

    static String body(String court, String sentOn, String text, String sections) {
        return "{\"court\":\"" + court + "\",\"sentOn\":\"" + sentOn + "\",\"text\":\"" + text + "\",\"sections\":[" + sections + "]}";
    }

    static String s(String act, String section) {
        return "{\"act\":\"" + act + "\",\"section\":\"" + section + "\"}";
    }

    ResultActions send(String who, String body) throws Exception {
        return mvc.perform(post("/api/firs/" + fir + "/section-reports").header("Authorization", who).contentType(MediaType.APPLICATION_JSON).content(body));
    }

    ResultActions list(String who) throws Exception {
        return mvc.perform(get("/api/firs/" + fir + "/section-reports").header("Authorization", who));
    }

    ResultActions readiness() throws Exception {
        return mvc.perform(get("/api/firs/" + fir + "/readiness").header("Authorization", io));
    }

    @Test
    void anAddedSectionWaitsForItsReportUntilTheTeamRecordsIt() throws Exception {
        list(io).andExpect(status().isOk()).andExpect(jsonPath("$.reports.length()").value(0))
                .andExpect(jsonPath("$.unreported.length()").value(0)).andExpect(jsonPath("$.court").isEmpty());
        readiness().andExpect(jsonPath("$.gaps.length()").value(0)).andExpect(jsonPath("$.openGaps").value(0));
        addSection("IT Act", "66D");
        addSection("BNS", "319(2)");
        list(io).andExpect(jsonPath("$.unreported.length()").value(2))
                .andExpect(jsonPath("$.unreported[0].act").value("IT Act")).andExpect(jsonPath("$.unreported[0].section").value("66D"))
                .andExpect(jsonPath("$.unreported[0].reason").value("The caller posed as the bank on the phone"))
                .andExpect(jsonPath("$.unreported[0].added_at").isNotEmpty());
        // no playbook chosen: the gaps are still listed and counted, so the final report waits for them
        readiness().andExpect(jsonPath("$.playbook").isEmpty()).andExpect(jsonPath("$.openGaps").value(2))
                .andExpect(jsonPath("$.gaps[0].key").value("section-report:IT Act 66D"))
                .andExpect(jsonPath("$.gaps[0].severity").value("high"))
                .andExpect(jsonPath("$.gaps[0].text").value(org.hamcrest.Matchers.startsWith("IT Act 66D was added on ")));

        send(io, body("  " + COURT + "  ", today(), "  " + TEXT + "  ", s("IT Act", "66D"))).andExpect(status().isCreated()).andExpect(jsonPath("$.id").isNotEmpty());
        list(sho).andExpect(jsonPath("$.reports.length()").value(1))
                .andExpect(jsonPath("$.reports[0].court").value(COURT)).andExpect(jsonPath("$.reports[0].sent_on").value(today()))
                .andExpect(jsonPath("$.reports[0].report_text").value(TEXT))
                .andExpect(jsonPath("$.reports[0].recorded_by_name").value("Fictional io"))
                .andExpect(jsonPath("$.reports[0].sections[0].act").value("IT Act")).andExpect(jsonPath("$.reports[0].sections[0].section").value("66D"))
                .andExpect(jsonPath("$.unreported.length()").value(1)).andExpect(jsonPath("$.unreported[0].section").value("319(2)"))
                .andExpect(jsonPath("$.court").value(COURT));
        readiness().andExpect(jsonPath("$.openGaps").value(1)).andExpect(jsonPath("$.gaps[0].key").value("section-report:BNS 319(2)"));
        // the gap can be accepted in writing like any other
        mvc.perform(post("/api/firs/" + fir + "/readiness/overrides").header("Authorization", io).contentType(MediaType.APPLICATION_JSON)
                .content("{\"gapKey\":\"section-report:BNS 319(2)\",\"reason\":\"Sent with the chargesheet instead\"}")).andExpect(status().isCreated());
        readiness().andExpect(jsonPath("$.openGaps").value(0)).andExpect(jsonPath("$.gaps[0].override.reason").value("Sent with the chargesheet instead"));
        // the step is on the day's page of the case diary
        mvc.perform(get("/api/firs/" + fir + "/diary").header("Authorization", io))
                .andExpect(jsonPath("$.events[?(@.what == 'section_reported')].detail").value(COURT));
        // reported once: a second report of the same section is refused
        send(io, body(COURT, today(), TEXT, s("IT Act", "66D"))).andExpect(status().isUnprocessableEntity());
        assertThat(db.sql("select count(*) from section_report").query(Long.class).single()).isEqualTo(1);
    }

    @Test
    void theGapIsAlsoListedBesideThePlaybookCharges() throws Exception {
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put("/api/firs/" + fir + "/playbook").header("Authorization", io)
                .contentType(MediaType.APPLICATION_JSON).content("{\"playbookId\":\"cyber-fraud\"}")).andExpect(status().is2xxSuccessful());
        long before = db.sql("select count(*) from fir_section").query(Long.class).single();
        assertThat(before).isEqualTo(1);
        readiness().andExpect(jsonPath("$.gaps[?(@.key =~ /section-report:.*/)]").isEmpty());
        addSection("IT Act", "66D");
        readiness().andExpect(jsonPath("$.gaps[?(@.key == 'section-report:IT Act 66D')].severity").value("high"));
    }

    @Test
    void theCourtOfTheTrackerIsOfferedFirst() throws Exception {
        db.sql("insert into court_event (fir_id, kind, on_date, court, recorded_by) values (?, 'other', '2026-11-01', 'Court of the Fictional CJM', ?)").params(fir, ioId).update();
        db.sql("insert into court_event (fir_id, kind, on_date, recorded_by) values (?, 'other', '2026-11-02', ?)").params(fir, ioId).update();
        list(io).andExpect(jsonPath("$.court").value("Court of the Fictional CJM"));
    }

    @Test
    void eachWrongReportIsRefused() throws Exception {
        addSection("IT Act", "66D");
        String ok = s("IT Act", "66D");
        send(io, body(COURT, today(), TEXT, "")).andExpect(status().isBadRequest());                       // no section
        send(io, body("ab", today(), TEXT, ok)).andExpect(status().isBadRequest());                       // court too short
        send(io, body("   x   ", today(), TEXT, ok)).andExpect(status().isBadRequest());                  // only spaces around
        send(io, body(COURT, today(), "too short", ok)).andExpect(status().isBadRequest());
        send(io, body(COURT, today(), " ".repeat(38) + "short", ok)).andExpect(status().isBadRequest());  // 40+ only with the spaces
        send(io, body(COURT, LocalDate.parse(today()).plusDays(1).toString(), TEXT, ok)).andExpect(status().isUnprocessableEntity());
        send(io, body(COURT, LocalDate.parse(today()).minusDays(1).toString(), TEXT, ok)).andExpect(status().isUnprocessableEntity())
                .andExpect(status().reason(org.hamcrest.Matchers.containsString("was added on")));
        send(io, body(COURT, today(), TEXT, s("BNS", "318(4)"))).andExpect(status().isUnprocessableEntity());  // given at registration
        send(io, body(COURT, today(), TEXT, s("BNS", "999"))).andExpect(status().isUnprocessableEntity());     // not in the FIR
        send(io, body(COURT, today(), TEXT, s("IT Act", "66C"))).andExpect(status().isUnprocessableEntity());  // same law, other section
        send(io, body(COURT, today(), TEXT, ok + "," + ok)).andExpect(status().isBadRequest());                 // twice
        send(io, body(COURT, today(), TEXT, s("", "66D"))).andExpect(status().isBadRequest());
        send(io, "{\"court\":\"" + COURT + "\",\"text\":\"" + TEXT + "\",\"sections\":[" + ok + "]}").andExpect(status().isBadRequest());  // no date
        assertThat(db.sql("select count(*) from section_report").query(Long.class).single()).isZero();
    }

    @Test
    void onlyTheCaseTeam() throws Exception {
        addSection("IT Act", "66D");
        String b = body(COURT, today(), TEXT, s("IT Act", "66D"));
        send(desk, b).andExpect(status().isForbidden());
        send(otherIo, b).andExpect(status().isForbidden());
        list(desk).andExpect(status().isNotFound());
        list(otherIo).andExpect(status().isNotFound());
        mvc.perform(get("/api/firs/" + UUID.randomUUID() + "/section-reports").header("Authorization", io)).andExpect(status().isNotFound());
        mvc.perform(get("/api/firs/" + fir + "/section-reports")).andExpect(status().isUnauthorized());
        assertThat(db.sql("select count(*) from section_report").query(Long.class).single()).isZero();
        send(sho, b).andExpect(status().isCreated());
    }
}
