package in.caseassistant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDate;
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

/**
 * Acting charge (decision 2 of 2 Nov 2026): who gives it, what it may and may not do, and how it ends. Fictional data only.
 */
@SpringBootTest
@AutoConfigureMockMvc
class ActingChargeApiTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcClient db;
    @Autowired JwtEncoder tokens;
    @Autowired PolicyController policies;
    @Autowired CaseTeam team;
    @Autowired ObjectMapper json;
    UUID station, near, far, ioId, otherIoId, spId, stateAdminId, deskId, fir, farFir;
    String io, otherIo, sp, spFar, stateAdmin, desk;
    int no = 0;

    UUID user(UUID st, String role) {
        return db.sql("insert into app_user (station_id, full_name, rank, role) values (?,?,'SI',?) returning id").params(st, "Fictional " + role, role).query(UUID.class).single();
    }

    UUID fir(UUID st, UUID io) {
        return db.sql("""
                insert into fir (station_id, fir_year, fir_no, gd_entry_no, registered_at, information_received_at, contents_original, contents_language, action_taken, io_id)
                values (?,2026,?,'GD-1',now(),now() - interval '1 hour','Fictional complaint','en','investigate',?) returning id""")
                .params(st, ++no, io).query(UUID.class).single();
    }

    @BeforeEach
    void setUp() {
        db.sql("truncate fir, police_station, state_pack, app_user cascade").update();
        db.sql("insert into state_pack (code, name, version, languages) values ('IN','National','1',array['en'])").update();
        station = db.sql("insert into police_station (state_code, district_id, name) values ('IN',district_id_of('IN','North'),'Fictional North PS') returning id").query(UUID.class).single();
        near = db.sql("insert into police_station (state_code, district_id, name) values ('IN',district_id_of('IN','North'),'Fictional North Two PS') returning id").query(UUID.class).single();
        far = db.sql("insert into police_station (state_code, district_id, name) values ('IN',district_id_of('IN','South'),'Fictional South PS') returning id").query(UUID.class).single();
        ioId = user(station, "io");
        otherIoId = user(station, "io");
        spId = user(near, "sp");
        stateAdminId = user(far, "state_admin");
        deskId = user(station, "front_desk");
        io = TestAuth.bearer(tokens, ioId);
        otherIo = TestAuth.bearer(tokens, otherIoId);
        sp = TestAuth.bearer(tokens, spId);
        spFar = TestAuth.bearer(tokens, user(far, "sp"));
        stateAdmin = TestAuth.bearer(tokens, stateAdminId);
        desk = TestAuth.bearer(tokens, deskId);
        fir = fir(station, otherIoId);   // a case of another IO at the station
        farFir = fir(far, null);
    }

    ResultActions call(MockHttpServletRequestBuilder b, String who, String body) throws Exception {
        b.header("Authorization", who);
        if (body != null) b.contentType(MediaType.APPLICATION_JSON).content(body);
        return mvc.perform(b);
    }

    String charge(UUID user, String role, LocalDate endsOn, String reason) {
        return "{\"userId\":\"" + user + "\",\"role\":\"" + role + "\",\"endsOn\":\"" + endsOn + "\",\"reason\":\"" + reason + "\"}";
    }

    LocalDate today() {
        return db.sql("select (now() at time zone 'Asia/Kolkata')::date").query(LocalDate.class).single();
    }

    UUID give(String by, UUID user, int days) throws Exception {
        String body = call(post("/api/acting-charges"), by, charge(user, "sho", today().plusDays(days), "SHO on leave for a family event"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return UUID.fromString(json.readTree(body).get("id").asText());
    }

    boolean canOpen(String who) throws Exception {
        return mvc.perform(get("/api/firs/" + fir).header("Authorization", who)).andReturn().getResponse().getStatus() == 200;
    }

    @Test
    void withoutACharge_anIoDoesNotSeeAnotherIosCase() throws Exception {
        assertThat(canOpen(io)).isFalse();
        assertThat(canOpen(otherIo)).isTrue();
    }

    @Test
    void theSpGivesAnOfficerOfAStationInTheDistrictTheSho_roleAndItShowsInEveryReach() throws Exception {
        give(sp, ioId, 10);
        assertThat(canOpen(io)).isTrue();                                  // the case team now, by the station role
        call(get("/api/firs"), io, null).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1));
        call(get("/api/supervisor"), io, null).andExpect(status().isOk()).andExpect(jsonPath("$.cases.length()").value(1));
        call(get("/api/me"), io, null).andExpect(status().isOk())
                .andExpect(jsonPath("$.case_scope").value("station"))
                .andExpect(jsonPath("$.permissions[?(@=='chargesheet.approve')]").isNotEmpty())
                .andExpect(jsonPath("$.permissions[?(@=='fir.register')]").isNotEmpty())
                .andExpect(jsonPath("$.acting[0].role").value("sho"))
                .andExpect(jsonPath("$.can_import").value(true));
        assertThat(team.supervisesStation(ioId, station)).isTrue();
        // it reaches the station of the charge only, not the district and not another station
        assertThat(canOpenFar(io)).isFalse();
        assertThat(team.supervisesStation(ioId, near)).isFalse();
        // and it does not make the officer able to give an acting charge: the SHO role has no acting.grant
        call(post("/api/acting-charges"), io, charge(otherIoId, "sho", today().plusDays(3), "Passing it on without right")).andExpect(status().isForbidden());
    }

    boolean canOpenFar(String who) throws Exception {
        return mvc.perform(get("/api/firs/" + farFir).header("Authorization", who)).andReturn().getResponse().getStatus() == 200;
    }

    @Test
    void theStateAdminOfTheStateMayGiveItToo_butNotTheSpOfAnotherDistrict() throws Exception {
        call(post("/api/acting-charges"), spFar, charge(ioId, "sho", today().plusDays(5), "SP of another district tries")).andExpect(status().isForbidden());
        assertThat(canOpen(io)).isFalse();
        give(stateAdmin, ioId, 5);
        assertThat(canOpen(io)).isTrue();
    }

    @Test
    void refusals_whoGivesToWhomForWhichRoleAndFor() throws Exception {
        LocalDate in10 = today().plusDays(10);
        String ok = "SHO on leave for a family event";
        call(post("/api/acting-charges"), io, charge(otherIoId, "sho", in10, ok)).andExpect(status().isForbidden());
        call(post("/api/acting-charges"), desk, charge(otherIoId, "sho", in10, ok)).andExpect(status().isForbidden());
        call(post("/api/acting-charges"), sp, charge(spId, "sho", in10, ok)).andExpect(status().isForbidden());            // never to oneself
        call(post("/api/acting-charges"), stateAdmin, charge(stateAdminId, "sho", in10, ok)).andExpect(status().isForbidden());
        call(post("/api/acting-charges"), sp, charge(UUID.randomUUID(), "sho", in10, ok)).andExpect(status().isForbidden()); // no such officer
        call(post("/api/acting-charges"), sp, charge(ioId, "sp", in10, ok)).andExpect(status().isBadRequest());             // a role without acting.allowed
        call(post("/api/acting-charges"), sp, charge(ioId, "state_admin", in10, ok)).andExpect(status().isBadRequest());
        call(post("/api/acting-charges"), sp, charge(ioId, "nosuchrole", in10, ok)).andExpect(status().isBadRequest());
        call(post("/api/acting-charges"), sp, charge(ioId, "sho", in10, "too short")).andExpect(status().isBadRequest());
        call(post("/api/acting-charges"), sp, "{\"userId\":\"" + ioId + "\",\"role\":\"sho\",\"reason\":\"" + ok + "\"}").andExpect(status().isBadRequest());
        assertThat(db.sql("select count(*) from acting_charge").query(Long.class).single()).isZero();
    }

    @Test
    void theLastDayIsTodayOrLaterAndWithinNinetyDays() throws Exception {
        String ok = "SHO on leave for a family event";
        call(post("/api/acting-charges"), sp, charge(ioId, "sho", today().minusDays(1), ok)).andExpect(status().isBadRequest());
        call(post("/api/acting-charges"), sp, charge(ioId, "sho", today().plusDays(90), ok)).andExpect(status().isBadRequest());
        call(post("/api/acting-charges"), sp, charge(ioId, "sho", today().plusDays(89), ok)).andExpect(status().isCreated());   // 90 days counting today
        long hours = db.sql("select extract(epoch from (ends_at - starts_at)) / 3600 from acting_charge").query(Long.class).single();
        assertThat(hours).isLessThanOrEqualTo(90 * 24);
        // today is allowed: it runs to the end of today, India time
        call(post("/api/acting-charges"), sp, charge(otherIoId, "sho", today(), ok)).andExpect(status().isCreated());
    }

    @Test
    void anOfficerWhoAlreadyHoldsTheRole_aRunningCharge_aClosedAccount_areRefused() throws Exception {
        UUID sho = user(station, "sho");
        String ok = "SHO on leave for a family event";
        call(post("/api/acting-charges"), sp, charge(sho, "sho", today().plusDays(3), ok)).andExpect(status().isConflict());
        give(sp, ioId, 5);
        call(post("/api/acting-charges"), sp, charge(ioId, "sho", today().plusDays(6), ok)).andExpect(status().isConflict());
        db.sql("update app_user set active = false where id = ?").param(otherIoId).update();
        call(post("/api/acting-charges"), sp, charge(otherIoId, "sho", today().plusDays(6), ok)).andExpect(status().isConflict());
    }

    @Test
    void itEndsByItselfAfterItsLastDay_andNotBeforeItStarts() throws Exception {
        give(sp, ioId, 10);
        assertThat(canOpen(io)).isTrue();
        // the clock moves by moving the charge's own times, as the row cannot be changed: a past charge and a future one are inserted
        db.sql("alter table acting_charge disable trigger acting_charge_kept").update();
        db.sql("update acting_charge set starts_at = now() - interval '5 days', ends_at = now() - interval '1 minute'").update();
        assertThat(canOpen(io)).isFalse();
        call(get("/api/me"), io, null).andExpect(jsonPath("$.case_scope").value("none")).andExpect(jsonPath("$.acting.length()").value(0));
        db.sql("update acting_charge set starts_at = now() + interval '1 hour', ends_at = now() + interval '2 days'").update();
        db.sql("alter table acting_charge enable trigger acting_charge_kept").update();
        assertThat(canOpen(io)).isFalse();
    }

    @Test
    void theSpEndsItEarlyWithAReason_itIsFinalAndLeavesTheOfficerWithTheirOwnRole() throws Exception {
        UUID id = give(sp, ioId, 20);
        call(post("/api/acting-charges/" + id + "/end"), io, "{\"reason\":\"I would end my own charge\"}").andExpect(status().isNotFound());
        call(post("/api/acting-charges/" + id + "/end"), spFar, "{\"reason\":\"Another district tries this\"}").andExpect(status().isNotFound());
        call(post("/api/acting-charges/" + UUID.randomUUID() + "/end"), sp, "{\"reason\":\"No such charge at all\"}").andExpect(status().isNotFound());
        call(post("/api/acting-charges/" + id + "/end"), sp, "{\"reason\":\"short\"}").andExpect(status().isBadRequest());
        assertThat(canOpen(io)).isTrue();
        call(post("/api/acting-charges/" + id + "/end"), sp, "{\"reason\":\"The SHO is back from leave\"}").andExpect(status().isNoContent());
        assertThat(canOpen(io)).isFalse();
        call(post("/api/acting-charges/" + id + "/end"), sp, "{\"reason\":\"Ending it a second time\"}").andExpect(status().isConflict());
        call(get("/api/me"), io, null).andExpect(jsonPath("$.case_scope").value("none"));
        // it can be given again afterwards
        give(sp, ioId, 3);
        assertThat(canOpen(io)).isTrue();
    }

    @Test
    void aFinishedChargeCannotBeEnded() throws Exception {
        UUID id = give(sp, ioId, 1);
        db.sql("alter table acting_charge disable trigger acting_charge_kept").update();
        db.sql("update acting_charge set starts_at = now() - interval '2 days', ends_at = now() - interval '1 minute'").update();
        db.sql("alter table acting_charge enable trigger acting_charge_kept").update();
        call(post("/api/acting-charges/" + id + "/end"), sp, "{\"reason\":\"Ending a finished charge\"}").andExpect(status().isConflict());
    }

    @Test
    void theListIsForTheGrantorsOfThatStationAndShowsTheStateOfEachCharge() throws Exception {
        UUID ended = give(sp, ioId, 20);
        call(post("/api/acting-charges/" + ended + "/end"), sp, "{\"reason\":\"The SHO is back from leave\"}").andExpect(status().isNoContent());
        give(sp, otherIoId, 5);
        call(get("/api/acting-charges?stationId=" + station), sp, null).andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[?(@.id=='" + ended + "')].status").value("ended"))
                .andExpect(jsonPath("$[?(@.status=='running')].full_name").isNotEmpty())
                .andExpect(jsonPath("$[?(@.id=='" + ended + "')].ended_reason").value("The SHO is back from leave"))
                .andExpect(jsonPath("$[0].granted_by_name").value("Fictional sp"));
        call(get("/api/acting-charges?stationId=" + station), stateAdmin, null).andExpect(status().isOk());
        call(get("/api/acting-charges?stationId=" + station), spFar, null).andExpect(status().isForbidden());
        call(get("/api/acting-charges?stationId=" + station), io, null).andExpect(status().isForbidden());
        call(get("/api/acting-charges?stationId=" + station), desk, null).andExpect(status().isForbidden());
    }

    @Test
    void theOptionsAreTheActiveOfficersOfTheStationAndTheRolesThatMayBeHeld_forGrantorsOnly() throws Exception {
        db.sql("update app_user set active = false where id = ?").param(otherIoId).update();
        call(get("/api/acting-charges/options?stationId=" + station), sp, null).andExpect(status().isOk())
                .andExpect(jsonPath("$.officers[?(@.id=='" + ioId + "')].full_name").value("Fictional io"))
                .andExpect(jsonPath("$.officers[?(@.id=='" + otherIoId + "')]").isEmpty())
                .andExpect(jsonPath("$.roles[?(@.code=='sho')].label").isNotEmpty())
                .andExpect(jsonPath("$.roles[?(@.code=='io')]").isEmpty());
        call(get("/api/acting-charges/options?stationId=" + station), stateAdmin, null).andExpect(status().isOk());
        call(get("/api/acting-charges/options?stationId=" + station), spFar, null).andExpect(status().isForbidden());
        call(get("/api/acting-charges/options?stationId=" + station), io, null).andExpect(status().isForbidden());
    }

    @Test
    void startAndEndAreInTheAdminLogAndOnTheAuditScreen() throws Exception {
        UUID id = give(sp, ioId, 20);
        call(post("/api/acting-charges/" + id + "/end"), sp, "{\"reason\":\"The SHO is back from leave\"}").andExpect(status().isNoContent());
        assertThat(db.sql("select action from admin_action where station_id = ? order by at").param(station).query(String.class).list())
                .containsExactly("acting_started", "acting_ended");
        assertThat(db.sql("select detail from admin_action where action = 'acting_started'").query(String.class).single()).startsWith("sho until ");
        call(get("/api/audit-log?stationId=" + station), sp, null).andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.what=='acting_ended')]").isNotEmpty())
                .andExpect(jsonPath("$[?(@.what=='acting_started')]").isNotEmpty());
    }

    @Test
    void anActingShoMayTightenTheirStationsPolicyOnlyWhileItRuns() throws Exception {
        UUID id = give(sp, ioId, 20);
        assertThat(policies.mayManage(ioId, "station", "IN", null, station)).isTrue();
        assertThat(policies.mayManage(ioId, "station", "IN", null, near)).isFalse();
        assertThat(policies.mayManage(ioId, "district", "IN", null, station)).isFalse();
        call(post("/api/acting-charges/" + id + "/end"), sp, "{\"reason\":\"The SHO is back from leave\"}").andExpect(status().isNoContent());
        assertThat(policies.mayManage(ioId, "station", "IN", null, station)).isFalse();
    }

    @Test
    void aChargeDoesNotFollowAnOfficerWhoIsMovedToAnotherStation() throws Exception {
        give(sp, ioId, 20);
        db.sql("update app_user set station_id = ? where id = ?").params(near, ioId).update();
        assertThat(canOpen(io)).isFalse();
        assertThat(team.activeRoles(ioId)).containsExactly("io");
    }

    @Test
    void aClosedAccountHoldsNothing() throws Exception {
        give(sp, ioId, 20);
        db.sql("update app_user set active = false where id = ?").param(ioId).update();
        assertThat(team.activeRoles(ioId)).isEmpty();
        assertThat(team.activeRoles(null)).isEmpty();
    }

    @Test
    void anActingShoMayBeChosenAsIoAndRegisterFirsWhileItRuns_andNotAfter() throws Exception {
        UUID keeper = user(station, "malkhana");   // a role with neither "case.lead" nor "fir.register"
        assertThat(team.canBeIo(keeper, station)).isFalse();
        assertThat(team.canRegisterAt(keeper, station)).isFalse();
        UUID id = give(sp, keeper, 10);
        assertThat(team.canBeIo(keeper, station)).isTrue();
        assertThat(team.canBeIo(keeper, near)).isFalse();                  // only at the station of the charge
        assertThat(team.canRegisterAt(keeper, station)).isTrue();
        assertThat(team.canRegisterAt(keeper, near)).isFalse();
        call(get("/api/firs/" + fir + "/io-candidates"), sp, null).andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.id=='" + keeper + "')]").isNotEmpty());
        call(post("/api/firs/" + fir + "/io"), sp, "{\"ioId\":\"" + keeper + "\",\"reason\":\"Acting SHO takes the case\"}").andExpect(status().is2xxSuccessful());
        call(post("/api/acting-charges/" + id + "/end"), sp, "{\"reason\":\"The SHO is back from leave\"}").andExpect(status().isNoContent());
        assertThat(team.canBeIo(keeper, station)).isFalse();
        assertThat(team.canRegisterAt(keeper, station)).isFalse();
        call(get("/api/firs/" + fir + "/io-candidates"), sp, null).andExpect(jsonPath("$[?(@.id=='" + keeper + "')]").isEmpty());
    }
}
