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
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

/** Changes proposed to a state's pack and their approval ({@link PackChangeController}). Fictional data only. */
@SpringBootTest
@AutoConfigureMockMvc
class PackChangeApiTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcClient db;
    @Autowired JwtEncoder tokens;
    UUID inStation, otherStation, admin, otherAdmin, platformAdmin, prosecutor, otherProsecutor, strayProsecutor, io;

    UUID user(String role, UUID st, String name) {
        return db.sql("insert into app_user (station_id, full_name, rank, role, username) values (?,?,'SI',?,?) returning id")
                .params(st, name, role, name.toLowerCase().replace(' ', '.')).query(UUID.class).single();
    }

    UUID station(String state, String name) {
        return db.sql("insert into police_station (state_code, district_id, name) values (?, district_id_of(?,'Testpur'), ?) returning id")
                .params(state, state, name).query(UUID.class).single();
    }

    @BeforeEach
    void setUp() {
        db.sql("truncate pack_change cascade").update();
        db.sql("truncate fir, complaint, police_station, state_pack, app_user cascade").update();
        db.sql("insert into state_pack (code, name, version, languages) values ('IN','National','1',array['en']), ('MH','Maharashtra','3.2',array['mr','hi','en'])").update();
        inStation = station("IN", "Fictional National PS");
        otherStation = station("MH", "Fictional Maharashtra PS");
        admin = user("state_admin", inStation, "Fictional Setup Officer");
        otherAdmin = user("state_admin", otherStation, "Fictional Other Setup Officer");
        platformAdmin = user("state_admin", null, "Fictional Platform Admin");
        prosecutor = user("prosecutor", inStation, "Fictional Prosecutor One");
        otherProsecutor = user("prosecutor", otherStation, "Fictional Prosecutor Two");
        strayProsecutor = user("prosecutor", null, "Fictional Prosecutor Stray");
        io = user("io", inStation, "SI Fictional Asha");
    }

    ResultActions call(UUID who, String method, String url, String body) throws Exception {
        var b = method.equals("GET") ? get(url) : post(url).contentType(MediaType.APPLICATION_JSON).content(body);
        return mvc.perform(who == null ? b : b.header("Authorization", TestAuth.bearer(tokens, who)));
    }

    String change(String state) {
        return "{\"state\":\"" + state + "\",\"title\":\"Fictional playbook v1.5\",\"body\":\"Adds a fictional front desk step before the FIR is typed.\",\"testedNote\":\"Tried on 40 fictional closed cases\"}";
    }

    UUID propose(UUID who, String state) throws Exception {
        var r = call(who, "POST", "/api/pack-changes", change(state)).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return UUID.fromString(new com.fasterxml.jackson.databind.ObjectMapper().readTree(r).get("id").asText());
    }

    @Test
    void theSetupOfficerProposesAndAnotherPersonOfTheStateApproves() throws Exception {
        UUID id = propose(admin, "IN");
        call(prosecutor, "GET", "/api/pack-changes", null).andExpect(status().isOk())
                .andExpect(jsonPath("$.pack.code").value("IN")).andExpect(jsonPath("$.changes.length()").value(1))
                .andExpect(jsonPath("$.changes[0].title").value("Fictional playbook v1.5")).andExpect(jsonPath("$.changes[0].can_decide").value(true))
                .andExpect(jsonPath("$.changes[0].decision").isEmpty()).andExpect(jsonPath("$.can_propose").value(false));
        call(admin, "GET", "/api/pack-changes", null).andExpect(jsonPath("$.changes[0].can_decide").value(false)).andExpect(jsonPath("$.can_propose").value(true));
        call(prosecutor, "POST", "/api/pack-changes/" + id + "/decision", "{\"decision\":\"approve\",\"note\":\"Checked with the Directorate (fictional)\"}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.decision").value("approved"));
        call(admin, "GET", "/api/pack-changes", null).andExpect(jsonPath("$.changes[0].decision").value("approved"))
                .andExpect(jsonPath("$.changes[0].decided_by_name").value("Fictional Prosecutor One")).andExpect(jsonPath("$.changes[0].can_decide").value(false));
        // decided once: neither a second answer nor a change of the answer
        call(prosecutor, "POST", "/api/pack-changes/" + id + "/decision", "{\"decision\":\"return\",\"note\":\"Changed my mind, long enough\"}").andExpect(status().isConflict());
    }

    @Test
    void sendingBackNeedsAReasonAndNobodyDecidesTheirOwnChange() throws Exception {
        UUID id = propose(admin, "IN");
        String url = "/api/pack-changes/" + id + "/decision";
        call(prosecutor, "POST", url, "{\"decision\":\"return\",\"note\":\"short\"}").andExpect(status().isBadRequest());
        call(prosecutor, "POST", url, "{\"decision\":\"return\"}").andExpect(status().isBadRequest());
        call(prosecutor, "POST", url, "{\"decision\":\"maybe\"}").andExpect(status().isBadRequest());
        call(prosecutor, "POST", url, "{\"decision\":\"return\",\"note\":\"Please add the second link rule\"}").andExpect(status().isOk()).andExpect(jsonPath("$.decision").value("returned"));
        // a person who holds both permissions still cannot answer their own proposal
        db.sql("update app_user set role = 'prosecutor' where id = ?").param(admin).update();
        UUID mine = db.sql("insert into pack_change (state_code, title, body, drafted_by) values ('IN','Fictional own change','Fictional body long enough to be accepted',?) returning id").param(prosecutor).query(UUID.class).single();
        call(prosecutor, "POST", "/api/pack-changes/" + mine + "/decision", "{\"decision\":\"approve\"}").andExpect(status().isForbidden());
    }

    @Test
    void theDatabaseRefusesAnOwnDecisionAChangeAfterwardsAndADeletion() {
        UUID mine = db.sql("insert into pack_change (state_code, title, body, drafted_by) values ('IN','Fictional own change','Fictional body long enough to be accepted',?) returning id").param(prosecutor).query(UUID.class).single();
        org.junit.jupiter.api.Assertions.assertThrows(Exception.class, () -> db.sql("insert into pack_change_decision (change_id, decision, decided_by) values (?, 'approved', ?)").params(mine, prosecutor).update());
        db.sql("insert into pack_change_decision (change_id, decision, decided_by) values (?, 'approved', ?)").params(mine, otherProsecutor).update();
        org.junit.jupiter.api.Assertions.assertThrows(Exception.class, () -> db.sql("update pack_change_decision set decision = 'returned', note = 'a long enough note' where change_id = ?").param(mine).update());
        org.junit.jupiter.api.Assertions.assertThrows(Exception.class, () -> db.sql("delete from pack_change_decision where change_id = ?").param(mine).update());
        org.junit.jupiter.api.Assertions.assertThrows(Exception.class, () -> db.sql("update pack_change set title = 'Changed afterwards' where id = ?").param(mine).update());
        org.junit.jupiter.api.Assertions.assertThrows(Exception.class, () -> db.sql("delete from pack_change where id = ?").param(mine).update());
        // a short title, a short body, and a sent-back decision with no reason
        org.junit.jupiter.api.Assertions.assertThrows(Exception.class, () -> db.sql("insert into pack_change (state_code, title, body, drafted_by) values ('IN','abc','Fictional body long enough to be accepted',?)").param(admin).update());
        UUID other = db.sql("insert into pack_change (state_code, title, body, drafted_by) values ('IN','Fictional second change','Fictional body long enough to be accepted',?) returning id").param(admin).query(UUID.class).single();
        org.junit.jupiter.api.Assertions.assertThrows(Exception.class, () -> db.sql("insert into pack_change_decision (change_id, decision, decided_by) values (?, 'returned', ?)").params(other, prosecutor).update());
    }

    @Test
    void aStateSeesAndDecidesItsOwnChangesOnly() throws Exception {
        UUID id = propose(admin, "IN");
        call(admin, "POST", "/api/pack-changes", change("MH")).andExpect(status().isForbidden());
        call(otherAdmin, "GET", "/api/pack-changes?state=IN", null).andExpect(status().isForbidden());
        call(otherAdmin, "GET", "/api/pack-changes", null).andExpect(status().isOk()).andExpect(jsonPath("$.pack.code").value("MH")).andExpect(jsonPath("$.changes.length()").value(0));
        // another state's approver gets the same answer as for a change that does not exist; a prosecutor with no station decides nothing
        String url = "/api/pack-changes/" + id + "/decision", yes = "{\"decision\":\"approve\"}";
        call(otherProsecutor, "POST", url, yes).andExpect(status().isNotFound());
        call(prosecutor, "POST", "/api/pack-changes/" + UUID.randomUUID() + "/decision", yes).andExpect(status().isNotFound());
        call(strayProsecutor, "POST", url, yes).andExpect(status().isNotFound());
        // weekly review 7 Nov: only an admin without a station is the platform admin; a prosecutor without one reads no state
        call(strayProsecutor, "GET", "/api/pack-changes", null).andExpect(status().isForbidden());
        call(strayProsecutor, "GET", "/api/pack-changes?state=IN", null).andExpect(status().isForbidden());
        call(strayProsecutor, "GET", "/api/pack-changes?state=MH", null).andExpect(status().isForbidden());
    }

    @Test
    void thePlatformAdminProposesForAnyStateAndNobodyElseWithoutThePermission() throws Exception {
        propose(platformAdmin, "MH");
        call(platformAdmin, "GET", "/api/pack-changes?state=MH", null).andExpect(jsonPath("$.changes.length()").value(1)).andExpect(jsonPath("$.can_propose").value(true));
        call(platformAdmin, "GET", "/api/pack-changes?state=ZZ", null).andExpect(status().isNotFound());
        call(platformAdmin, "POST", "/api/pack-changes", change("ZZ")).andExpect(status().isNotFound());
        call(io, "POST", "/api/pack-changes", change("IN")).andExpect(status().isForbidden());
        call(prosecutor, "POST", "/api/pack-changes", change("IN")).andExpect(status().isForbidden());
        call(io, "GET", "/api/pack-changes", null).andExpect(status().isForbidden());
        call(io, "POST", "/api/pack-changes/" + UUID.randomUUID() + "/decision", "{\"decision\":\"approve\"}").andExpect(status().isForbidden());
        call(admin, "POST", "/api/pack-changes/" + UUID.randomUUID() + "/decision", "{\"decision\":\"approve\"}").andExpect(status().isForbidden());
        call(null, "GET", "/api/pack-changes", null).andExpect(status().isUnauthorized());
        call(null, "POST", "/api/pack-changes", change("IN")).andExpect(status().isUnauthorized());
    }

    @Test
    void aProposalIsChecked() throws Exception {
        call(admin, "POST", "/api/pack-changes", change("in")).andExpect(status().isBadRequest());
        call(admin, "POST", "/api/pack-changes", "{\"state\":\"IN\",\"title\":\"abc\",\"body\":\"Fictional body long enough to be accepted\"}").andExpect(status().isBadRequest());
        call(admin, "POST", "/api/pack-changes", "{\"state\":\"IN\",\"title\":\"Fictional title\",\"body\":\"too short\"}").andExpect(status().isBadRequest());
        call(admin, "POST", "/api/pack-changes", "{\"state\":\"IN\",\"title\":\"Fictional title\",\"body\":\"Fictional body long enough to be accepted\",\"testedNote\":\"abc\"}").andExpect(status().isBadRequest());
        // a blank tested note is the same as none
        call(admin, "POST", "/api/pack-changes", "{\"state\":\"IN\",\"title\":\"Fictional title\",\"body\":\"Fictional body long enough to be accepted\",\"testedNote\":\"   \"}").andExpect(status().isCreated());
        assertThat(db.sql("select count(*) from pack_change where tested_note is null").query(Long.class).single()).isEqualTo(1);
    }

    /** The branches the tests of session 75 left out (coverage of 7 Nov: 8 missed in PackChangeController). */
    @Test
    void theRemainingPathsOfTheListAndTheOptionalNotes() throws Exception {
        call(platformAdmin, "GET", "/api/pack-changes", null).andExpect(status().isBadRequest());
        call(admin, "GET", "/api/pack-changes?state=IN", null).andExpect(status().isOk()).andExpect(jsonPath("$.pack.code").value("IN"));
        call(admin, "POST", "/api/pack-changes", "{\"state\":\"IN\",\"title\":\"Fictional title\",\"body\":\"Fictional body long enough to be accepted\"}")
                .andExpect(status().isCreated());
        UUID id = db.sql("select id from pack_change").query(UUID.class).single();
        assertThat(db.sql("select tested_note from pack_change where id = ?").param(id).query(String.class).optional()).isEmpty();
        call(prosecutor, "POST", "/api/pack-changes/" + id + "/decision", "{\"decision\":\"approve\",\"note\":\"   \"}").andExpect(status().isOk());
        assertThat(db.sql("select note from pack_change_decision where change_id = ?").param(id).query(String.class).optional()).isEmpty();
        // the approver's own proposal and a decided change are both shown without the decide button
        db.sql("insert into pack_change (state_code, title, body, drafted_by) values ('IN','Fictional own change','Fictional body long enough to be accepted',?)").param(prosecutor).update();
        call(prosecutor, "GET", "/api/pack-changes", null).andExpect(jsonPath("$.changes.length()").value(2))
                .andExpect(jsonPath("$.changes[0].title").value("Fictional own change")).andExpect(jsonPath("$.changes[0].can_decide").value(false))
                .andExpect(jsonPath("$.changes[1].decision").value("approved")).andExpect(jsonPath("$.changes[1].can_decide").value(false));
    }
}
