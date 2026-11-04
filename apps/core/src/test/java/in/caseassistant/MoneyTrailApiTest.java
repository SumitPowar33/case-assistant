package in.caseassistant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.LinkedHashMap;
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

/** Money trail (V42, design board 8): transfers, holds and the table of the accused. Fictional data only. */
@SpringBootTest
@AutoConfigureMockMvc
class MoneyTrailApiTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcClient db;
    @Autowired ObjectMapper json;
    @Autowired JwtEncoder tokens;
    UUID station, fir, ioId;
    String io, outsider, desk;

    UUID user(UUID st, String role) {
        return db.sql("insert into app_user (station_id, full_name, rank, role) values (?,?,'SI',?) returning id").params(st, "Fictional " + role, role).query(UUID.class).single();
    }

    UUID fir(int no) {
        return db.sql("""
                insert into fir (station_id, fir_year, fir_no, gd_entry_no, registered_at, information_received_at, contents_original, contents_language, action_taken, io_id)
                values (?,2026,?,'GD-1',now() - interval '2 days',now() - interval '2 days 1 hour','Fictional complaint','en','investigate',?) returning id""")
                .params(station, no, ioId).query(UUID.class).single();
    }

    @BeforeEach
    void setUp() {
        db.sql("truncate fir, police_station, state_pack, app_user cascade").update();
        db.sql("insert into state_pack (code, name, version, languages) values ('IN','National','1',array['en'])").update();
        station = db.sql("insert into police_station (state_code, district_id, name) values ('IN',district_id_of('IN','North'),'Fictional North PS') returning id").query(UUID.class).single();
        UUID far = db.sql("insert into police_station (state_code, district_id, name) values ('IN',district_id_of('IN','South'),'Fictional South PS') returning id").query(UUID.class).single();
        ioId = user(station, "io");
        io = TestAuth.bearer(tokens, ioId);
        outsider = TestAuth.bearer(tokens, user(far, "io"));
        desk = TestAuth.bearer(tokens, user(station, "front_desk"));
        fir = fir(1);
    }

    UUID person(UUID firId, String role, String label, String name) {
        return db.sql("insert into person (fir_id, role, label, full_name) values (?,?,?,?) returning id").params(firId, role, label, name).query(UUID.class).single();
    }

    UUID evidence(UUID firId, String label) {
        return db.sql("""
                insert into evidence_item (fir_id, label, description, kind, seized_at, seizure_memo)
                values (?,?,'Fictional bank reply','document',now(),'Fictional memo') returning id""").params(firId, label).query(UUID.class).single();
    }

    ResultActions transfer(String who, UUID firId, String to, Object toPerson, Object amount, String date, Object evidence) throws Exception {
        var body = new LinkedHashMap<String, Object>();
        body.put("from", "Fictional Victim A/c XXXX0055");
        body.put("to", to);
        body.put("toPersonId", toPerson);
        body.put("amount", amount);
        body.put("date", date);
        body.put("evidenceId", evidence);
        return mvc.perform(post("/api/firs/" + firId + "/money-trail/transfers").header("Authorization", who).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body)));
    }

    ResultActions hold(String who, UUID firId, Object amount, String date, Object evidence) throws Exception {
        var body = new LinkedHashMap<String, Object>();
        body.put("account", "Fictional A/c XXXX4471");
        body.put("amount", amount);
        body.put("date", date);
        body.put("evidenceId", evidence);
        return mvc.perform(post("/api/firs/" + firId + "/money-trail/holds").header("Authorization", who).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body)));
    }

    @Test
    void transfersAndHoldsAreKeptAndTheTableShowsWhatReachedEachAccused() throws Exception {
        UUID a2 = person(fir, "accused", "A2", "Fictional Holder");
        UUID a3 = person(fir, "accused", "A3", "Fictional Receiver");
        person(fir, "accused", "A1", "Fictional Caller");
        UUID reply = evidence(fir, "214/E-01");
        transfer(io, fir, "Fictional A/c XXXX4471", a2, 224000.50, "2026-08-19", reply).andExpect(status().isCreated());
        transfer(io, fir, "Fictional A/c XXXX9020", a3, 160000, "2026-08-25", null).andExpect(status().isCreated());
        transfer(io, fir, "Fictional A/c XXXX1188", null, 102000, "2026-09-01", "").andExpect(status().isCreated());
        hold(io, fir, 62000, "2026-09-03", reply).andExpect(status().isCreated());
        // A2 also has an independent link: the SIM seized (V6); A3 has only the money
        db.sql("insert into account_holder (person_id, fir_id, basis, marked_by) values (?,?,'Bank reply: receiving account',?)").params(a2, fir, ioId).update();
        db.sql("insert into accused_link (fir_id, person_id, link_type, evidence_item_id, linked_by) values (?,?,'sim_or_device',?,?)").params(fir, a2, reply, ioId).update();

        mvc.perform(get("/api/firs/" + fir + "/money-trail").header("Authorization", io)).andExpect(status().isOk())
                .andExpect(jsonPath("$.evidence.length()").value(1)).andExpect(jsonPath("$.evidence[0].label").value("214/E-01"))
                .andExpect(jsonPath("$.transfers.length()").value(3))
                .andExpect(jsonPath("$.transfers[0].amount_paise").value(22400050)).andExpect(jsonPath("$.transfers[0].evidence_label").value("214/E-01"))
                .andExpect(jsonPath("$.transfers[0].to_person").value("A2"))
                .andExpect(jsonPath("$.transferred_paise").value(22400050L + 16000000L + 10200000L))
                .andExpect(jsonPath("$.holds.length()").value(1)).andExpect(jsonPath("$.held_paise").value(6200000))
                .andExpect(jsonPath("$.accused.length()").value(3))
                .andExpect(jsonPath("$.accused[0].label").value("A1")).andExpect(jsonPath("$.accused[0].status").value("none"))
                .andExpect(jsonPath("$.accused[1].label").value("A2")).andExpect(jsonPath("$.accused[1].status").value("both"))
                .andExpect(jsonPath("$.accused[1].received_paise").value(22400050)).andExpect(jsonPath("$.accused[1].second_links").value(1))
                .andExpect(jsonPath("$.accused[2].label").value("A3")).andExpect(jsonPath("$.accused[2].status").value("money_only"));
        assertThatThrownBy(() -> db.sql("update money_transfer set amount_paise = 1").update()).hasMessageContaining("kept as written");
        assertThatThrownBy(() -> db.sql("delete from money_hold").update()).hasMessageContaining("kept as written");
    }

    @Test
    void anAccusedWithOnlyAnIndependentLinkIsShownAsSuch() throws Exception {
        UUID a1 = person(fir, "accused", "A1", "Fictional Caller");
        UUID e = evidence(fir, "214/E-02");
        db.sql("insert into accused_link (fir_id, person_id, link_type, evidence_item_id, linked_by) values (?,?,'login_ip',?,?)").params(fir, a1, e, ioId).update();
        mvc.perform(get("/api/firs/" + fir + "/money-trail").header("Authorization", io)).andExpect(status().isOk())
                .andExpect(jsonPath("$.accused[0].status").value("second_only")).andExpect(jsonPath("$.accused[0].received_paise").value(0));
    }

    @Test
    void badEntriesAreRefusedAndNothingIsKept() throws Exception {
        UUID witness = person(fir, "witness", "W1", "Fictional Witness");
        UUID otherAccused = person(fir(2), "accused", "A1", "Fictional Other");
        UUID otherEvidence = evidence(fir(3), "300/E-01");
        transfer(io, fir, "Fictional A/c XXXX1", witness, 100, "2026-08-19", null).andExpect(status().isBadRequest());          // not an accused
        transfer(io, fir, "Fictional A/c XXXX1", otherAccused, 100, "2026-08-19", null).andExpect(status().isBadRequest());     // another case
        transfer(io, fir, "Fictional A/c XXXX1", null, 100, "2026-08-19", otherEvidence).andExpect(status().isBadRequest());    // another case's evidence
        transfer(io, fir, "Fictional A/c XXXX1", "not-an-id", 100, "2026-08-19", null).andExpect(status().isBadRequest());
        transfer(io, fir, "Fictional A/c XXXX1", null, 100, "2026-08-19", "not-an-id").andExpect(status().isBadRequest());
        transfer(io, fir, "Fictional A/c XXXX1", null, 0, "2026-08-19", null).andExpect(status().isBadRequest());               // no amount
        transfer(io, fir, "Fictional A/c XXXX1", null, 100.123, "2026-08-19", null).andExpect(status().isBadRequest());          // more than paise
        transfer(io, fir, "Fictional A/c XXXX1", null, 100, "2099-01-01", null).andExpect(status().isBadRequest());              // future
        transfer(io, fir, "Fictional A/c XXXX1", null, 100, "19/08/2026", null).andExpect(status().isBadRequest());             // not a date
        transfer(io, fir, "x", null, 100, "2026-08-19", null).andExpect(status().isBadRequest());                                 // account too short
        hold(io, fir, 100, "2099-01-01", null).andExpect(status().isBadRequest());
        hold(io, fir, 100, "2026-09-03", otherEvidence).andExpect(status().isBadRequest());
        hold(io, fir, -5, "2026-09-03", null).andExpect(status().isBadRequest());
        assertThat(db.sql("select count(*) from money_transfer").query(Long.class).single()).isZero();
        assertThat(db.sql("select count(*) from money_hold").query(Long.class).single()).isZero();
    }

    @Test
    void onlyTheCaseTeamReadsOrWrites() throws Exception {
        transfer(outsider, fir, "Fictional A/c XXXX1", null, 100, "2026-08-19", null).andExpect(status().isForbidden());
        transfer(desk, fir, "Fictional A/c XXXX1", null, 100, "2026-08-19", null).andExpect(status().isForbidden());
        hold(outsider, fir, 100, "2026-09-03", null).andExpect(status().isForbidden());
        hold(desk, fir, 100, "2026-09-03", null).andExpect(status().isForbidden());
        mvc.perform(get("/api/firs/" + fir + "/money-trail").header("Authorization", outsider)).andExpect(status().isNotFound());
        mvc.perform(get("/api/firs/" + fir + "/money-trail").header("Authorization", desk)).andExpect(status().isNotFound());
        mvc.perform(get("/api/firs/" + fir + "/money-trail")).andExpect(status().isUnauthorized());
        assertThat(db.sql("select count(*) from money_transfer").query(Long.class).single()).isZero();
    }
}
