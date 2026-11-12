package in.caseassistant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;
import org.hamcrest.Matchers;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.test.web.servlet.MockMvc;

/** Earlier records of an accused (V55). Fictional people and accounts only. */
@SpringBootTest
@AutoConfigureMockMvc
class InvolvementApiTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcClient db;
    @Autowired JwtEncoder tokens;
    UUID station, io, fir, accused;
    int firNo = 1;

    UUID fir(UUID at, UUID ioId) {
        int no = firNo++;
        return db.sql("""
                insert into fir (station_id, fir_year, fir_no, gd_entry_no, registered_at, information_received_at,
                  contents_original, contents_language, action_taken, io_id)
                values (?,2026,?,'GD-1',?::timestamptz,'2026-01-01T09:00Z','Fictional complaint','en','investigate',?) returning id""")
                .params(at, no, java.time.Instant.parse("2026-01-02T10:00:00Z").plusSeconds(86400L * no).toString(), ioId).query(UUID.class).single();
    }

    UUID person(UUID firId, String role, String label, String name, String parentage, String phone) {
        return db.sql("insert into person (fir_id, role, label, full_name, parentage, phone) values (?,?,?,?,?,?) returning id")
                .params(firId, role, label, name, parentage, phone).query(UUID.class).single();
    }

    void paid(UUID firId, UUID to, String account) {
        db.sql("insert into money_transfer (fir_id, from_account, to_account, to_person_id, amount_paise, transferred_on, recorded_by) values (?,?,?,?,100000,'2026-01-01',?)")
                .params(firId, "FICT0000001", account, to, io).update();
    }

    @BeforeEach
    void setUp() {
        db.sql("truncate fir, police_station, state_pack, app_user cascade").update();
        db.sql("insert into state_pack (code, name, version, languages) values ('IN','National','1',array['en']), ('MH','Fictional State','1',array['en'])").update();
        station = db.sql("insert into police_station (state_code, district_id, name) values ('IN',district_id_of('IN','Testpur'),'Testpur City') returning id").query(UUID.class).single();
        io = db.sql("insert into app_user (station_id, full_name, rank, role) values (?,'SI Fictional Asha','SI','io') returning id").param(station).query(UUID.class).single();
        fir = fir(station, io);
        accused = person(fir, "accused", "A1", "Ravi Fictional", "S/o Fictional Father", "+91 90000 11111");
    }

    @Test
    void findsAnAccusedOrSuspectElsewhereInTheStateByPhoneNameAndParentageOrAccountAndLogsTheCheck() throws Exception {
        UUID otherStation = db.sql("insert into police_station (state_code, district_id, name) values ('IN',district_id_of('IN','Otherpur'),'Otherpur City') returning id").query(UUID.class).single();
        UUID otherState = db.sql("insert into police_station (state_code, district_id, name) values ('MH',district_id_of('MH','Farpur'),'Farpur City') returning id").query(UUID.class).single();
        UUID byName = fir(otherStation, null);
        person(byName, "accused", "A2", "  ravi   FICTIONAL ", "s/o fictional father", null);
        UUID byPhone = fir(station, io);   // the same IO: may open it
        person(byPhone, "suspect", "S1", "Another Fictional", null, "9000011111");
        UUID byAccount = fir(otherStation, null);
        UUID payee = person(byAccount, "accused", "A1", "Third Fictional", null, null);
        UUID me = accused;
        paid(fir, me, "fict 0000 9999");
        paid(byAccount, payee, "FICT00009999");
        person(fir(otherState, null), "accused", "A1", "Ravi Fictional", "S/o Fictional Father", "9000011111");   // another state
        person(fir(station, null), "witness", "W1", "Ravi Fictional", "S/o Fictional Father", "9000011111");        // not accused
        person(fir(station, null), "accused", "A1", "Ravi Fictional", "S/o Other Fictional", "9000022222");        // name alone

        mvc.perform(get("/api/firs/" + fir + "/people/" + accused + "/involvement").header("Authorization", TestAuth.bearer(tokens, io)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.records.length()").value(3))
                .andExpect(jsonPath("$.truncated").value(false))
                .andExpect(jsonPath("$.records[?(@.fir_id=='" + byName + "')].matched_on[0]").value("name_parentage"))
                .andExpect(jsonPath("$.records[?(@.fir_id=='" + byName + "')].can_open").value(false))
                .andExpect(jsonPath("$.records[?(@.fir_id=='" + byPhone + "')].matched_on[0]").value("phone"))
                .andExpect(jsonPath("$.records[?(@.fir_id=='" + byPhone + "')].can_open").value(true))
                .andExpect(jsonPath("$.records[?(@.fir_id=='" + byAccount + "')].matched_on[0]").value("account"))
                .andExpect(jsonPath("$.records[?(@.fir_id=='" + byAccount + "')].station").value("Otherpur City"));
        assertThat(db.sql("select matches from involvement_search where person_id = ?").param(accused).query(Integer.class).single()).isEqualTo(3);
        mvc.perform(get("/api/audit-log?stationId=" + station).header("Authorization", TestAuth.bearer(tokens,
                        db.sql("insert into app_user (station_id, full_name, rank, role) values (?,'Insp Fictional Sho','Insp','sho') returning id").param(station).query(UUID.class).single())))
                .andExpect(jsonPath("$[?(@.kind=='involvement_search')].what").value(Matchers.hasItem("A1: 3")));
        assertThatThrownBy(() -> db.sql("update involvement_search set matches = 0").update()).hasMessageContaining("kept as written");
        assertThatThrownBy(() -> db.sql("delete from involvement_search").update()).hasMessageContaining("kept as written");
    }

    @Test
    void nothingMatchesOnASharedEmptyOrShortPhoneAndTheCheckIsStillLogged() throws Exception {
        db.sql("update person set phone = '100', parentage = null where id = ?").param(accused).update();
        person(fir(station, null), "accused", "A1", "Ravi Fictional", null, "100");
        person(fir(station, null), "accused", "A1", "Someone Fictional", null, null);
        mvc.perform(get("/api/firs/" + fir + "/people/" + accused + "/involvement").header("Authorization", TestAuth.bearer(tokens, io)))
                .andExpect(jsonPath("$.records.length()").value(0));
        assertThat(db.sql("select count(*) from involvement_search where matches = 0").query(Integer.class).single()).isEqualTo(1);
    }

    @Test
    void onlyTheCaseTeamChecksAndOnlyAnAccusedOrSuspect() throws Exception {
        UUID victim = person(fir, "victim", "V1", "Fictional Victim", null, "9000033333");
        mvc.perform(get("/api/firs/" + fir + "/people/" + victim + "/involvement").header("Authorization", TestAuth.bearer(tokens, io)))
                .andExpect(status().isBadRequest());
        mvc.perform(get("/api/firs/" + fir + "/people/" + UUID.randomUUID() + "/involvement").header("Authorization", TestAuth.bearer(tokens, io)))
                .andExpect(status().isNotFound());
        UUID clerk = db.sql("insert into app_user (station_id, full_name, rank, role) values (?,'HC Fictional Desk','HC','front_desk') returning id").param(station).query(UUID.class).single();
        mvc.perform(get("/api/firs/" + fir + "/people/" + accused + "/involvement").header("Authorization", TestAuth.bearer(tokens, clerk)))
                .andExpect(status().isNotFound());   // as for any case one is not on: nothing is revealed
        assertThat(db.sql("select count(*) from involvement_search").query(Integer.class).single()).isZero();
    }
}
