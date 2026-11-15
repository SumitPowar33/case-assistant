package in.caseassistant;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.util.UUID;
import org.hamcrest.Matchers;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MockMvc;

/**
 * A state module's playbook and laws hold only for FIRs of its own state (item 3, V57): the Maharashtra deposit-fraud
 * playbook and the MPID Act. Fictional data only.
 */
@SpringBootTest
@AutoConfigureMockMvc
class StatePlaybookApiTest {
    static final String REQ = "7d0c3f1e-2b4a-4c55-9a77-0f1e2d3c4b5a";
    static final String REASON = "The text says the scheme kept the deposits and paid nothing back";

    @Autowired MockMvc mvc;
    @Autowired JdbcClient db;
    @Autowired org.springframework.security.oauth2.jwt.JwtEncoder tokens;
    UUID mhFir, inFir;
    String mhIo, inIo, platform;

    UUID user(UUID st, String role) {
        return db.sql("insert into app_user (station_id, full_name, rank, role) values (?,?,'SI',?) returning id").params(st, "Fictional " + role, role).query(UUID.class).single();
    }

    UUID fir(UUID station, UUID io) {
        return db.sql("""
                insert into fir (station_id, fir_year, fir_no, gd_entry_no, registered_at, information_received_at, contents_original, contents_language, action_taken, io_id)
                values (?,2026,1,'GD-1','2026-10-29T10:00Z','2026-10-29T09:00Z','A fictional scheme took deposits and did not pay back.','en','investigate',?) returning id""")
                .params(station, io).query(UUID.class).single();
    }

    @BeforeEach
    void setUp() {
        db.sql("truncate fir, police_station, state_pack, app_user cascade").update();
        db.sql("insert into state_pack (code, name, version, languages) values ('IN','National','1',array['en']), ('MH','Maharashtra','1',array['mr'])").update();
        db.sql("insert into state_act (act, state_code) values ('MPID Act','MH'), ('MCOC Act','MH')").update();   // as Modules writes it at start-up
        UUID mh = db.sql("insert into police_station (state_code, district_id, name) values ('MH',district_id_of('MH','Fictional Pune'),'Fictional Pune PS') returning id").query(UUID.class).single();
        UUID in = db.sql("insert into police_station (state_code, district_id, name) values ('IN',district_id_of('IN','North'),'Fictional North PS') returning id").query(UUID.class).single();
        UUID a = user(mh, "io"), b = user(in, "io");
        mhIo = TestAuth.bearer(tokens, a);
        inIo = TestAuth.bearer(tokens, b);
        platform = TestAuth.bearer(tokens, db.sql("insert into app_user (full_name, rank, role) values ('Fictional Platform','Admin','state_admin') returning id").query(UUID.class).single());
        mhFir = fir(mh, a);
        inFir = fir(in, b);
    }

    @Test
    void eachOfficerIsOfferedTheNationalPlaybooksAndOnlyTheirOwnStates() throws Exception {
        mvc.perform(get("/api/playbooks").header("Authorization", mhIo)).andExpect(status().isOk())
                .andExpect(jsonPath("$[*].id").value(Matchers.containsInAnyOrder("cyber-fraud", "mh-deposit-fraud", "mh-organised-crime")))
                .andExpect(jsonPath("$[?(@.id == 'mh-deposit-fraud')].module").value("MH"))
                .andExpect(jsonPath("$[?(@.id == 'cyber-fraud')].module").value("IN"));
        mvc.perform(get("/api/playbooks").header("Authorization", inIo))
                .andExpect(jsonPath("$[*].id").value(Matchers.contains("cyber-fraud")));
        mvc.perform(get("/api/playbooks").header("Authorization", platform))   // no station: every module's
                .andExpect(jsonPath("$[*].id").value(Matchers.containsInAnyOrder("cyber-fraud", "mh-deposit-fraud", "mh-organised-crime")));
    }

    @Test
    void aStatePlaybookIsChosenOnlyForAnFirOfItsState() throws Exception {
        mvc.perform(put("/api/firs/" + mhFir + "/playbook").header("Authorization", mhIo).contentType(MediaType.APPLICATION_JSON)
                .content("{\"playbookId\":\"mh-deposit-fraud\"}")).andExpect(status().isNoContent());
        mvc.perform(put("/api/firs/" + inFir + "/playbook").header("Authorization", inIo).contentType(MediaType.APPLICATION_JSON)
                .content("{\"playbookId\":\"mh-deposit-fraud\"}")).andExpect(status().isUnprocessableEntity())
                .andExpect(status().reason(Matchers.containsString("another state")));
        mvc.perform(put("/api/firs/" + inFir + "/playbook").header("Authorization", inIo).contentType(MediaType.APPLICATION_JSON)
                .content("{\"playbookId\":\"cyber-fraud\"}")).andExpect(status().isNoContent());
        // the MPID charge is checked in the readiness report once its section is in the FIR
        db.sql("insert into fir_section (fir_id, act, section) values (?, 'MPID Act', '3')").param(mhFir).update();
        mvc.perform(get("/api/firs/" + mhFir + "/readiness").header("Authorization", mhIo)).andExpect(status().isOk())
                .andExpect(jsonPath("$.charges[?(@.id == 'mpid_default')].law").value("MPID Act 3"));
    }

    @Test
    void theSectionChargesAreThoseOfTheFirsStateAndAStateLawIsAddedOnlyThere() throws Exception {
        mvc.perform(get("/api/firs/" + mhFir + "/sections").header("Authorization", mhIo)).andExpect(status().isOk())
                .andExpect(jsonPath("$.charges[?(@.charge_id == 'mpid_default')].act").value("MPID Act"))
                .andExpect(jsonPath("$.charges[?(@.charge_id == 'mpid_default')].playbook_id").value("mh-deposit-fraud"));
        mvc.perform(get("/api/firs/" + inFir + "/sections").header("Authorization", inIo))
                .andExpect(jsonPath("$.charges[?(@.playbook_id == 'mh-deposit-fraud')]").isEmpty())
                .andExpect(jsonPath("$.charges[?(@.playbook_id == 'cyber-fraud')]").isNotEmpty());
        String body = "{\"playbookId\":\"mh-deposit-fraud\",\"chargeId\":\"mpid_default\",\"reason\":\"" + REASON + "\",\"aiRequestId\":\"" + REQ + "\"}";
        mvc.perform(post("/api/firs/" + inFir + "/sections").header("Authorization", inIo).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isUnprocessableEntity());
        mvc.perform(post("/api/firs/" + mhFir + "/sections").header("Authorization", mhIo).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.act").value("MPID Act")).andExpect(jsonPath("$.section").value("3"));
    }

    @Test
    void anFirIsRegisteredWithAStateLawOnlyInThatState() throws Exception {
        mvc.perform(get("/api/me").header("Authorization", mhIo)).andExpect(jsonPath("$.acts").value(Matchers.hasItems("BNS", "IT Act", "MPID Act")));
        mvc.perform(get("/api/me").header("Authorization", inIo)).andExpect(jsonPath("$.acts").value(Matchers.not(Matchers.hasItem("MPID Act"))))
                .andExpect(jsonPath("$.acts").value(Matchers.hasItem("POCSO Act")));
        UUID inStation = db.sql("select station_id from fir where id = ?").param(inFir).query(UUID.class).single();
        UUID mhStation = db.sql("select station_id from fir where id = ?").param(mhFir).query(UUID.class).single();
        String fir = """
                {"stationId":"%s","firYear":2026,"firNo":9,"gdEntryNo":"GD-9","registeredAt":"2026-10-30T10:00:00Z","informationReceivedAt":"2026-10-30T09:00:00Z",
                 "contentsOriginal":"A fictional scheme kept the deposits.","contentsLanguage":"en","actionTaken":"investigate","sections":[{"act":"MPID Act","section":"3"}]}""";
        mvc.perform(post("/api/firs").header("Authorization", inIo).contentType(MediaType.APPLICATION_JSON).content(fir.formatted(inStation)))
                .andExpect(status().is4xxClientError());
        mvc.perform(post("/api/firs").header("Authorization", mhIo).contentType(MediaType.APPLICATION_JSON).content(fir.formatted(mhStation)))
                .andExpect(status().isCreated());
    }

    @Test
    void theOrganisedCrimePlaybookHoldsOnlyInMaharashtraAndAsksForTheApprovalsOfTheAct() throws Exception {
        mvc.perform(put("/api/firs/" + inFir + "/playbook").header("Authorization", inIo).contentType(MediaType.APPLICATION_JSON)
                .content("{\"playbookId\":\"mh-organised-crime\"}")).andExpect(status().isUnprocessableEntity());
        mvc.perform(put("/api/firs/" + mhFir + "/playbook").header("Authorization", mhIo).contentType(MediaType.APPLICATION_JSON)
                .content("{\"playbookId\":\"mh-organised-crime\"}")).andExpect(status().isNoContent());
        // an MCOC section is taken only on an FIR of Maharashtra (V57 trigger)
        assertThatThrownBy(() -> db.sql("insert into fir_section (fir_id, act, section) values (?, 'MCOC Act', '3(1)(ii)')").param(inFir).update())
                .hasMessageContaining("not a law of the state");
        db.sql("insert into fir_section (fir_id, act, section) values (?, 'MCOC Act', '3(1)(ii)')").param(mhFir).update();
        mvc.perform(get("/api/firs/" + mhFir + "/readiness").header("Authorization", mhIo)).andExpect(status().isOk())
                .andExpect(jsonPath("$.charges[*].law").value(Matchers.contains("MCOC Act 3(1)(ii)")))
                .andExpect(jsonPath("$.gaps[?(@.key == 'ingredient:mcoc_organised_crime/continuing_unlawful_activity')].severity").value("critical"))
                .andExpect(jsonPath("$.checksToConfirm[?(@.source == 'MCOC Act 23(1)(a)')].severity").value("critical"))
                .andExpect(jsonPath("$.checksToConfirm[?(@.source == 'MCOC Act 23(2)')].severity").value("critical"));
        mvc.perform(get("/api/firs/" + mhFir + "/sections").header("Authorization", mhIo))
                .andExpect(jsonPath("$.charges[?(@.charge_id == 'mcoc_member')].act").value("MCOC Act"))
                .andExpect(jsonPath("$.charges[?(@.charge_id == 'mcoc_member')].law").value("MCOC Act 3(4)"));
        mvc.perform(get("/api/firs/" + inFir + "/sections").header("Authorization", inIo))
                .andExpect(jsonPath("$.charges[?(@.playbook_id == 'mh-organised-crime')]").isEmpty());
    }
}
