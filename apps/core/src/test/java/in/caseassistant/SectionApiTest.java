package in.caseassistant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
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

/** Sections added to an FIR from the playbooks' charges (V51, AI feature A2). Fictional data only. */
@SpringBootTest
@AutoConfigureMockMvc
class SectionApiTest {
    static final String REQ = "7d0c3f1e-2b4a-4c55-9a77-0f1e2d3c4b5a";
    static final String REASON = "The text says the caller used a phone and posed as the bank";

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
        fir = db.sql("""
                insert into fir (station_id, fir_year, fir_no, gd_entry_no, registered_at, information_received_at, contents_original, contents_language, action_taken, io_id)
                values (?,2026,1,'GD-1','2026-10-29T10:00Z','2026-10-29T09:00Z','A caller said he was from my bank.','en','investigate',?) returning id""")
                .params(station, ioId).query(UUID.class).single();
        db.sql("insert into fir_section (fir_id, act, section) values (?, 'BNS', '318(4)')").param(fir).update();
    }

    static String choice(String charge, String reason) {
        return "{\"playbookId\":\"cyber-fraud\",\"chargeId\":\"" + charge + "\",\"reason\":\"" + reason + "\",\"aiRequestId\":\"" + REQ + "\"}";
    }

    ResultActions add(String who, String body) throws Exception {
        return mvc.perform(post("/api/firs/" + fir + "/sections").header("Authorization", who).contentType(MediaType.APPLICATION_JSON).content(body));
    }

    @Test
    void theTeamSeesThePlaybookChargesAndAddsOneWithAReason() throws Exception {
        mvc.perform(get("/api/firs/" + fir + "/sections").header("Authorization", io)).andExpect(status().isOk())
                .andExpect(jsonPath("$.law").value("unknown"))   // the FIR does not say when the offence happened
                .andExpect(jsonPath("$.sections.length()").value(1))
                .andExpect(jsonPath("$.sections[0].added_at").isEmpty()).andExpect(jsonPath("$.sections[0].reason").isEmpty())
                .andExpect(jsonPath("$.charges[?(@.charge_id == 'cheating')].in_fir").value(true))
                .andExpect(jsonPath("$.charges[?(@.charge_id == 'it_personation')].in_fir").value(false))
                .andExpect(jsonPath("$.charges[?(@.charge_id == 'it_personation')].act").value("IT Act"))
                .andExpect(jsonPath("$.charges[?(@.charge_id == 'it_personation')].law").value("IT Act 66D"))
                .andExpect(jsonPath("$.charges[?(@.charge_id == 'it_personation')].playbook_id").value("cyber-fraud"))
                .andExpect(jsonPath("$.charges[?(@.charge_id == 'it_personation')].ingredients[0].id").value("computer_resource"))
                .andExpect(jsonPath("$.charges[?(@.charge_id == 'it_personation')].label").value("Cheating by personation using a computer resource"));
        add(io, choice("it_personation", "  " + REASON + "  ")).andExpect(status().isCreated())
                .andExpect(jsonPath("$.act").value("IT Act")).andExpect(jsonPath("$.section").value("66D"));
        add(sho, choice("personation", REASON)).andExpect(status().isCreated());
        mvc.perform(get("/api/firs/" + fir + "/sections").header("Authorization", sho))
                .andExpect(jsonPath("$.sections.length()").value(3))
                .andExpect(jsonPath("$.sections[1].act").value("IT Act")).andExpect(jsonPath("$.sections[1].reason").value(REASON))
                .andExpect(jsonPath("$.sections[1].chosen_by_name").value("Fictional io")).andExpect(jsonPath("$.sections[1].added_at").isNotEmpty())
                .andExpect(jsonPath("$.sections[2].chosen_by_name").value("Fictional sho"))
                .andExpect(jsonPath("$.charges[?(@.charge_id == 'it_personation')].in_fir").value(true));
        // the FIR, the readiness check and the case diary read the new sections
        mvc.perform(get("/api/firs/" + fir).header("Authorization", io)).andExpect(jsonPath("$.sections.length()").value(3));
        mvc.perform(get("/api/firs/" + fir + "/diary").header("Authorization", io))
                .andExpect(jsonPath("$.events[?(@.what == 'section_added')].detail").value(org.hamcrest.Matchers.containsInAnyOrder("IT Act 66D", "BNS 319(2)")));
        assertThat(db.sql("select ai_request_id::text from fir_section where act = 'IT Act'").query(String.class).single()).isEqualTo(REQ);
        // a section already in the FIR is not added twice, the registration's own included
        add(io, choice("cheating", REASON)).andExpect(status().isConflict()).andExpect(status().reason("This section is already in the FIR."));
        add(io, choice("personation", REASON)).andExpect(status().isConflict());
        // kept as written
        assertThatThrownBy(() -> db.sql("delete from fir_section where act = 'IT Act'").update()).hasMessageContaining("kept");
    }

    @Test
    void everyFieldIsChecked() throws Exception {
        add(io, choice("it_personation", "too short")).andExpect(status().isBadRequest());
        add(io, choice("it_personation", "         x")).andExpect(status().isBadRequest())
                .andExpect(status().reason("Give a reason of at least 10 characters."));
        add(io, choice("it_personation", "x".repeat(2001))).andExpect(status().isBadRequest());
        add(io, choice("it_personation", REASON).replace(REQ, "not-an-id")).andExpect(status().isBadRequest());
        add(io, "{\"playbookId\":\"cyber-fraud\",\"chargeId\":\"it_personation\",\"reason\":\"" + REASON + "\"}").andExpect(status().isBadRequest());
        add(io, choice("", REASON)).andExpect(status().isBadRequest());
        add(io, choice("murder", REASON)).andExpect(status().isUnprocessableEntity()).andExpect(status().reason("No such charge in the playbooks."));
        add(io, choice("it_personation", REASON).replace("cyber-fraud", "no-such-playbook")).andExpect(status().isUnprocessableEntity());
        assertThat(db.sql("select count(*) from fir_section").query(Long.class).single()).isOne();
    }

    @Test
    void aBnsSectionIsRefusedForAnOffenceUnderTheIpcAndTakenForOneFromThe1stOfJuly2024() throws Exception {
        db.sql("update fir set occurrence_from = '2024-06-30T23:59+05:30' where id = ?").param(fir).update();
        mvc.perform(get("/api/firs/" + fir + "/sections").header("Authorization", io)).andExpect(jsonPath("$.law").value("old"));
        add(io, choice("personation", REASON)).andExpect(status().isUnprocessableEntity()).andExpect(status().reason(
                "The offence of this FIR is before 1 July 2024, so the IPC applies, not the BNS (BNS 358). Find the IPC section in the law finder."));
        add(io, choice("it_personation", REASON)).andExpect(status().isCreated());   // the IT Act was not replaced
        db.sql("update fir set occurrence_from = '2024-07-01T00:00+05:30' where id = ?").param(fir).update();
        mvc.perform(get("/api/firs/" + fir + "/sections").header("Authorization", io)).andExpect(jsonPath("$.law").value("new"));
        add(io, choice("personation", REASON)).andExpect(status().isCreated());
    }

    @Test
    void onlyTheCaseTeamReadsOrAdds() throws Exception {
        add(desk, choice("it_personation", REASON)).andExpect(status().isForbidden());
        add(otherIo, choice("it_personation", REASON)).andExpect(status().isForbidden());
        mvc.perform(get("/api/firs/" + fir + "/sections").header("Authorization", desk)).andExpect(status().isNotFound());
        mvc.perform(get("/api/firs/" + fir + "/sections").header("Authorization", otherIo)).andExpect(status().isNotFound());
        mvc.perform(get("/api/firs/" + fir + "/sections")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/firs/" + fir + "/sections").contentType(MediaType.APPLICATION_JSON).content(choice("it_personation", REASON)))
                .andExpect(status().isUnauthorized());
        mvc.perform(get("/api/firs/" + UUID.randomUUID() + "/sections").header("Authorization", io)).andExpect(status().isNotFound());
        assertThat(db.sql("select count(*) from fir_section").query(Long.class).single()).isOne();
    }

    // weekly review 14 Nov: the AI is not used on a protected case, so the core does not take its suggestion there either
    @Test
    void onAProtectedCaseNoSuggestedSectionIsAdded_byTheApiOrTheDatabase() throws Exception {
        db.sql("update fir set identity_protected = true where id = ?").param(fir).update();
        add(io, choice("personation", REASON)).andExpect(status().isBadRequest());
        assertThatThrownBy(() -> db.sql("insert into fir_section (fir_id, act, section, added_at, reason, ai_request_id, chosen_by) values (?, 'BNS', '319(2)', now(), ?, ?, (select io_id from fir where id = ?))")
                .params(fir, REASON, UUID.fromString(REQ), fir).update()).hasMessageContaining("not taken on a case whose victim");
        // a section of the FIR as registered is still written as before
        db.sql("insert into fir_section (fir_id, act, section) values (?, 'BNS', '64')").param(fir).update();
        assertThat(db.sql("select count(*) from fir_section where fir_id = ?").param(fir).query(Long.class).single()).isEqualTo(2);
    }

    // A2, the rest (V60): a section outside the playbooks, chosen by the officer alone
    ResultActions own(String who, String act, String section, String reason) throws Exception {
        return mvc.perform(post("/api/firs/" + fir + "/sections/own").header("Authorization", who).contentType(MediaType.APPLICATION_JSON)
                .content("{\"act\":\"" + act + "\",\"section\":\"" + section + "\",\"reason\":\"" + reason + "\"}"));
    }

    @Test
    void aSectionOutsideThePlaybooksIsAddedWithAReasonAndNoAiRequest() throws Exception {
        mvc.perform(get("/api/firs/" + fir + "/sections").header("Authorization", io))
                .andExpect(jsonPath("$.acts").value(org.hamcrest.Matchers.hasItems("BNS", "IPC", "NDPS Act", "Other")));
        own(io, "NDPS Act", " 21(b) ", "  The seized powder tested positive in the field kit  ").andExpect(status().isCreated())
                .andExpect(jsonPath("$.act").value("NDPS Act")).andExpect(jsonPath("$.section").value("21(b)"));
        mvc.perform(get("/api/firs/" + fir + "/sections").header("Authorization", sho)).andExpect(jsonPath("$.sections.length()").value(2))
                .andExpect(jsonPath("$.sections[1].section").value("21(b)")).andExpect(jsonPath("$.sections[1].reason").value("The seized powder tested positive in the field kit"))
                .andExpect(jsonPath("$.sections[1].chosen_by_name").value("Fictional io"));
        assertThat(db.sql("select ai_request_id is null from fir_section where act = 'NDPS Act'").query(Boolean.class).single()).isTrue();
        mvc.perform(get("/api/firs/" + fir + "/diary").header("Authorization", io))
                .andExpect(jsonPath("$.events[?(@.what == 'section_added')].detail").value("NDPS Act 21(b)"));
        own(io, "NDPS Act", "21(b)", REASON).andExpect(status().isConflict()).andExpect(status().reason("This section is already in the FIR."));
        own(io, "BNS", "318(4)", REASON).andExpect(status().isConflict());   // the registration's own
        // kept as written
        assertThatThrownBy(() -> db.sql("delete from fir_section where act = 'NDPS Act'").update()).hasMessageContaining("kept");
    }

    @Test
    void aSectionByHandIsChecked() throws Exception {
        own(io, "BNS", "103(1)", "too short").andExpect(status().isBadRequest());
        own(io, "BNS", "103(1)", "         x").andExpect(status().isBadRequest()).andExpect(status().reason("Give a reason of at least 10 characters."));
        own(io, "BNS", "103(1)", "x".repeat(2001)).andExpect(status().isBadRequest());
        own(io, "", "103(1)", REASON).andExpect(status().isBadRequest());
        own(io, "BNS", "", REASON).andExpect(status().isBadRequest());
        own(io, "Made Up Act", "5", REASON).andExpect(status().isUnprocessableEntity()).andExpect(status().reason("This law is not one a section of this FIR can be under."));
        own(io, "MPID Act", "3", REASON).andExpect(status().isUnprocessableEntity());   // a law of a state, and this FIR is of no such state
        for (String bad : new String[] {"abc", "(1)", "103 1", "1".repeat(31), "-5", "5;drop"})
            own(io, "BNS", bad, REASON).andExpect(status().isUnprocessableEntity()).andExpect(status().reason("Write the section as a number, like 103(1) or 21(b)."));
        mvc.perform(post("/api/firs/" + fir + "/sections/own").header("Authorization", io).contentType(MediaType.APPLICATION_JSON).content("{\"act\":\"BNS\",\"reason\":\"" + REASON + "\"}"))
                .andExpect(status().isBadRequest());
        assertThat(db.sql("select count(*) from fir_section").query(Long.class).single()).isOne();
    }

    @Test
    void theLawOfTheOffenceDecidesBetweenBnsAndIpcForASectionByHand() throws Exception {
        db.sql("update fir set occurrence_from = '2024-06-30T23:59+05:30' where id = ?").param(fir).update();
        own(io, "BNS", "103(1)", REASON).andExpect(status().isUnprocessableEntity()).andExpect(status().reason(
                "The offence of this FIR is before 1 July 2024, so the IPC applies, not the BNS (BNS 358). Find the IPC section in the law finder."));
        own(io, "IPC", "302", REASON).andExpect(status().isCreated());
        db.sql("update fir set occurrence_from = '2024-07-01T00:00+05:30' where id = ?").param(fir).update();
        own(io, "IPC", "420", REASON).andExpect(status().isUnprocessableEntity()).andExpect(status().reason(
                "The offence of this FIR is from 1 July 2024, so the BNS applies, not the IPC (BNS 358)."));
        own(io, "BNS", "103(1)", REASON).andExpect(status().isCreated());
        // an offence under the BNS and the IPC, or an unknown date, may take either (a person decides with the prosecutor)
        db.sql("update fir set occurrence_from = '2024-06-01T00:00+05:30', occurrence_to = '2024-08-01T00:00+05:30' where id = ?").param(fir).update();
        own(io, "IPC", "420", REASON).andExpect(status().isCreated());
    }

    @Test
    void aSectionByHandIsAllowedOnAProtectedCaseBecauseNoAiIsUsedButOnlyTheTeamAdds() throws Exception {
        db.sql("update fir set identity_protected = true where id = ?").param(fir).update();
        own(io, "BNS", "64(1)", REASON).andExpect(status().isCreated());
        own(desk, "BNS", "65(1)", REASON).andExpect(status().isForbidden());
        own(otherIo, "BNS", "65(1)", REASON).andExpect(status().isForbidden());
        mvc.perform(post("/api/firs/" + fir + "/sections/own").contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/firs/" + UUID.randomUUID() + "/sections/own").header("Authorization", io).contentType(MediaType.APPLICATION_JSON)
                .content("{\"act\":\"BNS\",\"section\":\"64\",\"reason\":\"" + REASON + "\"}")).andExpect(status().isForbidden());
        assertThat(db.sql("select count(*) from fir_section").query(Long.class).single()).isEqualTo(2);
    }
}
