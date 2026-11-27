package in.caseassistant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
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

/** Station duty roster (item 16, V66): who writes it, who reads it, the clashes and the take-back. Fictional data only. */
@SpringBootTest
@AutoConfigureMockMvc
class DutyRosterApiTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcClient db;
    @Autowired JwtEncoder tokens;
    @Autowired ObjectMapper json;
    @Autowired DutyRosterController controller;
    UUID station, far, io1, io2, shoId, farIo;
    String sho, io, spNear, farToken;
    final LocalDate today = LocalDate.now(ZoneId.of("Asia/Kolkata"));

    UUID user(UUID st, String role, String name) {
        return db.sql("insert into app_user (station_id, full_name, rank, role) values (?,?,'SI',?) returning id").params(st, name, role).query(UUID.class).single();
    }

    @BeforeEach
    void setUp() {
        db.sql("truncate fir, police_station, state_pack, app_user cascade").update();
        db.sql("insert into state_pack (code, name, version, languages) values ('IN','National','1',array['en'])").update();
        station = db.sql("insert into police_station (state_code, district_id, name) values ('IN',district_id_of('IN','North'),'Fictional North PS') returning id").query(UUID.class).single();
        far = db.sql("insert into police_station (state_code, district_id, name) values ('IN',district_id_of('IN','South'),'Fictional South PS') returning id").query(UUID.class).single();
        shoId = user(station, "sho", "Fictional Sho");
        io1 = user(station, "io", "Fictional Asha");
        io2 = user(station, "io", "Fictional Bela");
        farIo = user(far, "io", "Fictional Far");
        sho = TestAuth.bearer(tokens, shoId);
        io = TestAuth.bearer(tokens, io1);
        farToken = TestAuth.bearer(tokens, farIo);
        spNear = TestAuth.bearer(tokens, user(station, "sp", "Fictional Sp"));
    }

    ResultActions call(MockHttpServletRequestBuilder b, String who, String body) throws Exception {
        b.header("Authorization", who);
        if (body != null) b.contentType(MediaType.APPLICATION_JSON).content(body);
        return mvc.perform(b);
    }

    String entry(UUID st, UUID officer, LocalDate on, String kind, String shift, String post) {
        return "{\"stationId\":\"" + st + "\",\"officerId\":\"" + officer + "\",\"date\":\"" + on + "\",\"kind\":\"" + kind + "\""
                + (shift == null ? "" : ",\"shift\":\"" + shift + "\"") + (post == null ? "" : ",\"post\":\"" + post + "\"") + "}";
    }

    JsonNode roster(String who) throws Exception {
        return json.readTree(call(get("/api/duty-roster?stationId=" + station), who, null).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }

    @Test
    void theShiftOfAnIndiaTimeAndTheDayItBelongsTo() {
        assertThat(DutyRosterController.shiftAt(LocalDateTime.of(2026, 11, 24, 6, 0))).containsExactly("morning", "2026-11-24");
        assertThat(DutyRosterController.shiftAt(LocalDateTime.of(2026, 11, 24, 13, 59))).containsExactly("morning", "2026-11-24");
        assertThat(DutyRosterController.shiftAt(LocalDateTime.of(2026, 11, 24, 14, 0))).containsExactly("evening", "2026-11-24");
        assertThat(DutyRosterController.shiftAt(LocalDateTime.of(2026, 11, 24, 22, 0))).containsExactly("night", "2026-11-24");
        assertThat(DutyRosterController.shiftAt(LocalDateTime.of(2026, 11, 25, 2, 30))).containsExactly("night", "2026-11-24");
    }

    @Test
    void theOfficerInChargeWritesAndEveryoneAtTheStationReads() throws Exception {
        call(post("/api/duty-roster"), sho, entry(station, io1, today, "duty", "morning", "front_desk")).andExpect(status().isCreated());
        call(post("/api/duty-roster"), sho, entry(station, io1, today, "duty", "evening", "beat")).andExpect(status().isCreated());   // another shift is fine
        call(post("/api/duty-roster"), sho, entry(station, io2, today.plusDays(1), "weekly_off", null, null)).andExpect(status().isCreated());
        var rows = roster(io).get("rows");   // a plain IO reads it
        assertThat(rows).hasSize(3);
        assertThat(rows.get(0).get("full_name").asText()).isEqualTo("Fictional Asha");
        assertThat(rows.get(0).get("shift").asText()).isEqualTo("morning");
        assertThat(rows.get(2).get("kind").asText()).isEqualTo("weekly_off");
        assertThat(roster(io).get("can_manage").asBoolean()).isFalse();
        assertThat(roster(sho).get("can_manage").asBoolean()).isTrue();
        assertThat(call(get("/api/duty-roster/options?stationId=" + station), sho, null).andExpect(status().isOk()).andReturn().getResponse().getContentAsString())
                .contains("Fictional Asha").contains("Fictional Bela");
    }

    @Test
    void whoIsOnDutyNowFollowsTheShiftRunningNow() throws Exception {
        String[] now = DutyRosterController.shiftAt(LocalDateTime.now(ZoneId.of("Asia/Kolkata")));
        // yesterday's night may be the shift running now (small hours), so rows are written straight into the table
        for (String s : new String[] {"morning", "evening", "night"}) {
            UUID who = s.equals(now[0]) ? io1 : io2;
            db.sql("insert into duty_assignment (station_id, officer_id, on_date, kind, shift, post, recorded_by) values (?,?,?::date,'duty',?,'station_house',?)")
                    .params(station, who, now[1], s, shoId).update();
        }
        var n = json.readTree(call(get("/api/duty-roster?stationId=" + station + "&from=" + LocalDate.parse(now[1]).minusDays(1)), io, null).andReturn().getResponse().getContentAsString()).get("now");
        assertThat(n.get("shift").asText()).isEqualTo(now[0]);
        assertThat(n.get("on_duty")).hasSize(1);
        assertThat(n.get("on_duty").get(0).get("full_name").asText()).isEqualTo("Fictional Asha");
    }

    /** Regression: from midnight to 6 am the night shift is yesterday's, which a list that starts today does not hold. */
    @Test
    void inTheSmallHoursTheOfficersOfLastNightsShiftAreOnDuty() {
        db.sql("insert into duty_assignment (station_id, officer_id, on_date, kind, shift, post, recorded_by) values (?,?,?,'duty','night','patrol',?)")
                .params(station, io1, today.minusDays(1), shoId).update();
        db.sql("insert into duty_assignment (station_id, officer_id, on_date, kind, shift, post, recorded_by) values (?,?,?,'duty','night','beat',?)")
                .params(station, io2, today, shoId).update();
        assertThat(controller.onDuty(station, today.atTime(2, 30))).extracting(r -> r.get("full_name")).containsExactly("Fictional Asha");
        assertThat(controller.onDuty(station, today.atTime(22, 30))).extracting(r -> r.get("full_name")).containsExactly("Fictional Bela");
        assertThat(controller.onDuty(far, today.atTime(2, 30))).isEmpty();
    }

    UUID caseWithCourtDate(int no, UUID officer, LocalDate on) {
        UUID fir = db.sql("""
                insert into fir (station_id, fir_year, fir_no, gd_entry_no, registered_at, information_received_at, contents_original, contents_language, action_taken, io_id)
                values (?,2026,?,'GD-1','2026-10-01T10:00Z','2026-10-01T09:00Z','Fictional complaint','en','investigate',?) returning id""").params(station, no, officer).query(UUID.class).single();
        db.sql("insert into court_event (fir_id, kind, on_date, court, recorded_by) values (?,'prosecution_evidence',?,'Fictional Court',?)").params(fir, on, officer).update();
        return fir;
    }

    void put(UUID officer, LocalDate on, String kind, String shift, String post) throws Exception {
        call(post("/api/duty-roster"), sho, entry(station, officer, on, kind, shift, post)).andExpect(status().isCreated());
    }

    @Test
    void aCourtDateTheRosterDoesNotAllowForIsListedForThoseWhoMayOpenTheCase() throws Exception {
        UUID day = caseWithCourtDate(11, io1, today.plusDays(3));
        db.sql("insert into court_event (fir_id, kind, on_date, recorded_by) values (?,'other',?,?)").params(day, today.plusDays(3), io1).update();   // the same day twice: one line
        caseWithCourtDate(12, io2, today.plusDays(4));
        caseWithCourtDate(13, io1, today.plusDays(5));
        caseWithCourtDate(14, io1, today.plusDays(6));   // nothing rostered that day: nothing to compare with
        put(io1, today.plusDays(3), "duty", "morning", "station_house");
        put(io1, today.plusDays(3), "duty", "evening", "beat");
        put(io2, today.plusDays(4), "leave", null, null);
        put(io1, today.plusDays(5), "duty", "morning", "beat");
        put(io1, today.plusDays(5), "duty", "evening", "court");   // court duty that day: the date is allowed for

        var found = roster(sho).get("court_clashes");
        assertThat(found).extracting(c -> c.get("fir_no").asText() + " " + c.get("on_date").asText() + " " + c.get("kind").asText() + " " + c.get("shift").asText())
                .containsExactly("11 " + today.plusDays(3) + " duty morning", "12 " + today.plusDays(4) + " leave null");
        assertThat(found.get(0).get("fir_id").asText()).isEqualTo(day.toString());
        assertThat(found.get(0).get("full_name").asText()).isEqualTo("Fictional Asha");
        // an investigating officer is told of their own cases only; an officer with neither the case nor the station's FIRs, of none
        assertThat(roster(io).get("court_clashes")).extracting(c -> c.get("fir_no").asText()).containsExactly("11");
        UUID other = user(station, "io", "Fictional Chitra");
        assertThat(roster(TestAuth.bearer(tokens, other)).get("court_clashes")).isEmpty();
    }

    @Test
    void aPassedCourtDateATakenBackEntryAndAnOfficerWhoIsNoLongerTheCasesIoAreNoClash() throws Exception {
        caseWithCourtDate(21, io1, today.minusDays(1));
        db.sql("insert into duty_assignment (station_id, officer_id, on_date, kind, recorded_by) values (?,?,?,'leave',?)").params(station, io1, today.minusDays(1), shoId).update();
        caseWithCourtDate(22, io1, today.plusDays(2));
        String made = call(post("/api/duty-roster"), sho, entry(station, io1, today.plusDays(2), "leave", null, null)).andReturn().getResponse().getContentAsString();
        var past = json.readTree(call(get("/api/duty-roster?stationId=" + station + "&from=" + today.minusDays(5)), sho, null).andReturn().getResponse().getContentAsString());
        assertThat(past.get("court_clashes")).extracting(c -> c.get("fir_no").asText()).containsExactly("22");
        call(post("/api/duty-roster/" + json.readTree(made).get("id").asText() + "/cancel"), sho, "{\"reason\":\"Leave withdrawn for court\"}").andExpect(status().isNoContent());
        assertThat(roster(sho).get("court_clashes")).isEmpty();
        put(io1, today.plusDays(2), "weekly_off", null, null);
        assertThat(roster(sho).get("court_clashes")).hasSize(1);
        var later = json.readTree(call(get("/api/duty-roster?stationId=" + station + "&from=" + today.plusDays(3)), sho, null).andReturn().getResponse().getContentAsString());
        assertThat(later.get("court_clashes")).isEmpty();   // a list that starts later warns of nothing before its first day
        db.sql("update fir set io_id = ? where id = (select id from fir where fir_no = 22)").param(io2).update();
        assertThat(roster(sho).get("court_clashes")).isEmpty();
    }

    @Test
    void anOfficerSinceMovedOrClosedIsNeitherOnDutyNorWarnedAbout() throws Exception {
        db.sql("insert into duty_assignment (station_id, officer_id, on_date, kind, shift, post, recorded_by) values (?,?,?,'duty','morning','beat',?)")
                .params(station, io1, today, shoId).update();
        caseWithCourtDate(31, io1, today);
        assertThat(controller.onDuty(station, today.atTime(9, 0))).hasSize(1);
        assertThat(roster(sho).get("court_clashes")).hasSize(1);
        db.sql("update app_user set station_id = ? where id = ?").params(far, io1).update();
        assertThat(controller.onDuty(station, today.atTime(9, 0))).isEmpty();
        assertThat(roster(sho).get("court_clashes")).isEmpty();
        db.sql("update app_user set station_id = ?, active = false where id = ?").params(station, io1).update();
        assertThat(controller.onDuty(station, today.atTime(9, 0))).isEmpty();
        assertThat(roster(sho).get("court_clashes")).isEmpty();
        assertThat(roster(sho).get("rows")).hasSize(1);   // the entry itself stays in the roster, to be taken back
    }

    @Test
    void aPlainOfficerAndTheSpCannotWriteAndAnOutsiderCannotRead() throws Exception {
        call(post("/api/duty-roster"), io, entry(station, io2, today, "duty", "morning", "beat")).andExpect(status().isForbidden());
        call(post("/api/duty-roster"), spNear, entry(station, io2, today, "duty", "morning", "beat")).andExpect(status().isForbidden());
        call(post("/api/duty-roster"), farToken, entry(station, io2, today, "duty", "morning", "beat")).andExpect(status().isForbidden());
        call(get("/api/duty-roster?stationId=" + station), farToken, null).andExpect(status().isForbidden());
        call(get("/api/duty-roster/options?stationId=" + station), io, null).andExpect(status().isForbidden());
        assertThat(db.sql("select count(*) from duty_assignment").query(Integer.class).single()).isZero();
    }

    @Test
    void anActingOfficerInChargeWritesTheRosterToo() throws Exception {
        UUID acting = io2;
        db.sql("insert into acting_charge (user_id, station_id, role, reason, ends_at, granted_by) values (?,?,'sho','The SHO is on leave this week',now() + interval '3 days',?)")
                .params(acting, station, user(station, "sp", "Fictional Giver")).update();
        call(post("/api/duty-roster"), TestAuth.bearer(tokens, acting), entry(station, io1, today, "duty", "night", "patrol")).andExpect(status().isCreated());
    }

    @Test
    void aNoteIsKeptWithoutOuterSpacesABlankOneNotAtAllAndAnEmptyStartDayMeansToday() throws Exception {
        String made = entry(station, io1, today, "leave", null, null);
        call(post("/api/duty-roster"), sho, made.replace("}", ",\"note\":\"  Fictional family function  \"}")).andExpect(status().isCreated());
        call(post("/api/duty-roster"), sho, entry(station, io2, today, "weekly_off", null, null).replace("}", ",\"note\":\"   \"}")).andExpect(status().isCreated());
        var answer = json.readTree(call(get("/api/duty-roster?stationId=" + station + "&from="), io, null).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertThat(answer.get("from").asText()).isEqualTo(today.toString());
        assertThat(answer.get("rows").get(0).get("note").asText()).isEqualTo("Fictional family function");
        assertThat(answer.get("rows").get(1).get("note").isNull()).isTrue();
        assertThat(answer.get("now").get("on_duty")).isEmpty();   // leave and a weekly off put nobody on duty
        call(get("/api/duty-roster?stationId=" + station + "&from=tomorrow"), io, null).andExpect(status().isBadRequest());
        call(post("/api/duty-roster"), sho, entry(station, shoId, today, "leave", "morning", "beat")).andExpect(status().isBadRequest());
    }

    @Test
    void validationAndClashes() throws Exception {
        call(post("/api/duty-roster"), sho, entry(station, io1, today.minusDays(1), "duty", "morning", "beat")).andExpect(status().isBadRequest());
        call(post("/api/duty-roster"), sho, entry(station, io1, today.plusDays(61), "duty", "morning", "beat")).andExpect(status().isBadRequest());
        call(post("/api/duty-roster"), sho, entry(station, io1, today, "duty", null, "beat")).andExpect(status().isBadRequest());
        call(post("/api/duty-roster"), sho, entry(station, io1, today, "duty", "morning", null)).andExpect(status().isBadRequest());
        call(post("/api/duty-roster"), sho, entry(station, io1, today, "leave", "morning", null)).andExpect(status().isBadRequest());
        call(post("/api/duty-roster"), sho, entry(station, io1, today, "weekly_off", null, "beat")).andExpect(status().isBadRequest());
        call(post("/api/duty-roster"), sho, entry(station, io1, today, "sleeping", null, null)).andExpect(status().isBadRequest());
        call(post("/api/duty-roster"), sho, entry(station, io1, today, "duty", "dawn", "beat")).andExpect(status().isBadRequest());
        call(post("/api/duty-roster"), sho, entry(station, io1, today, "duty", "morning", "dance")).andExpect(status().isBadRequest());
        call(post("/api/duty-roster"), sho, "{\"stationId\":\"" + station + "\",\"officerId\":\"" + io1 + "\",\"date\":\"31 Nov\",\"kind\":\"leave\"}").andExpect(status().isBadRequest());
        call(post("/api/duty-roster"), sho, entry(station, farIo, today, "duty", "morning", "beat")).andExpect(status().isBadRequest());   // posted elsewhere
        db.sql("update app_user set active = false where id = ?").param(io2).update();
        call(post("/api/duty-roster"), sho, entry(station, io2, today, "duty", "morning", "beat")).andExpect(status().isBadRequest());   // closed account
        call(post("/api/duty-roster"), sho, entry(station, io1, today, "duty", "morning", "beat")).andExpect(status().isCreated());
        call(post("/api/duty-roster"), sho, entry(station, io1, today, "duty", "morning", "patrol")).andExpect(status().isConflict());   // same shift twice
        call(post("/api/duty-roster"), sho, entry(station, io1, today, "leave", null, null)).andExpect(status().isConflict());           // leave over a duty
        call(post("/api/duty-roster"), sho, entry(station, io1, today.plusDays(1), "leave", null, null)).andExpect(status().isCreated());
        call(post("/api/duty-roster"), sho, entry(station, io1, today.plusDays(1), "duty", "evening", "beat")).andExpect(status().isConflict());   // duty on leave
        call(post("/api/duty-roster"), sho, entry(station, io1, today.plusDays(1), "weekly_off", null, null)).andExpect(status().isConflict());
    }

    @Test
    void anEntryTakenBackNeedsAReasonStaysOnRecordAndFreesTheShift() throws Exception {
        String made = call(post("/api/duty-roster"), sho, entry(station, io1, today, "duty", "morning", "beat")).andReturn().getResponse().getContentAsString();
        String id = json.readTree(made).get("id").asText();
        call(post("/api/duty-roster/" + id + "/cancel"), io, "{\"reason\":\"Changed my mind, long enough\"}").andExpect(status().isNotFound());   // not the roster's writer
        call(post("/api/duty-roster/" + id + "/cancel"), farToken, "{\"reason\":\"Changed my mind, long enough\"}").andExpect(status().isNotFound());
        call(post("/api/duty-roster/" + id + "/cancel"), sho, "{\"reason\":\"short\"}").andExpect(status().isBadRequest());
        call(post("/api/duty-roster/" + id + "/cancel"), sho, "{\"reason\":\"Officer sent to court that day\"}").andExpect(status().isNoContent());
        call(post("/api/duty-roster/" + id + "/cancel"), sho, "{\"reason\":\"Officer sent to court that day\"}").andExpect(status().isConflict());
        call(post("/api/duty-roster/" + UUID.randomUUID() + "/cancel"), sho, "{\"reason\":\"Officer sent to court that day\"}").andExpect(status().isNotFound());
        assertThat(roster(sho).get("rows")).isEmpty();
        assertThat(db.sql("select count(*) from duty_assignment").query(Integer.class).single()).isEqualTo(1);   // kept
        call(post("/api/duty-roster"), sho, entry(station, io1, today, "duty", "morning", "patrol")).andExpect(status().isCreated());
    }
}
