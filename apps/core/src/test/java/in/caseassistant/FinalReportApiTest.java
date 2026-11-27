package in.caseassistant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
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
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/** Draft and sign the final report, BNSS 193 (V41, design board 10). Fictional data only. */
@SpringBootTest
@AutoConfigureMockMvc
class FinalReportApiTest {
    static final String FACTS = "On a fictional date the complainant lost money to a fictional caller.";
    static final String EVIDENCE = "Fictional bank statement and fictional call records link the accused.";

    @Autowired MockMvc mvc;
    @Autowired JdbcClient db;
    @Autowired JwtEncoder tokens;
    UUID station, fir, ioId, shoId;
    String io, sho, outsider, desk, otherIo;

    UUID user(UUID st, String role) {
        return db.sql("insert into app_user (station_id, full_name, rank, role) values (?,?,'SI',?) returning id").params(st, "Fictional " + role, role).query(UUID.class).single();
    }

    @BeforeEach
    void setUp() throws Exception {
        db.sql("truncate fir, police_station, state_pack, app_user cascade").update();
        db.sql("insert into state_pack (code, name, version, languages) values ('IN','National','1',array['en'])").update();
        station = db.sql("insert into police_station (state_code, district_id, name) values ('IN',district_id_of('IN','North'),'Fictional North PS') returning id").query(UUID.class).single();
        UUID far = db.sql("insert into police_station (state_code, district_id, name) values ('IN',district_id_of('IN','South'),'Fictional South PS') returning id").query(UUID.class).single();
        ioId = user(station, "io");
        shoId = user(station, "sho");
        io = TestAuth.bearer(tokens, ioId);
        sho = TestAuth.bearer(tokens, shoId);
        otherIo = TestAuth.bearer(tokens, user(station, "io"));
        outsider = TestAuth.bearer(tokens, user(far, "sho"));
        desk = TestAuth.bearer(tokens, user(station, "front_desk"));
        fir = db.sql("""
                insert into fir (station_id, fir_year, fir_no, gd_entry_no, registered_at, information_received_at, contents_original, contents_language, action_taken, io_id)
                values (?,2026,1,'GD-1',now() - interval '2 days',now() - interval '2 days 1 hour','Fictional complaint','en','investigate',?) returning id""")
                .params(station, ioId).query(UUID.class).single();
    }

    ResultActions call(MockHttpServletRequestBuilder b, String who, String body) throws Exception {
        b.header("Authorization", who);
        if (body != null) b.contentType(MediaType.APPLICATION_JSON).content(body);
        return mvc.perform(b);
    }

    String url(String tail) {
        return "/api/firs/" + fir + "/final-report" + tail;
    }

    String words(String facts, String evidence) {
        return "{\"language\":\"en\",\"facts\":\"" + facts + "\",\"evidence\":\"" + evidence + "\"}";
    }

    void playbook() throws Exception {
        call(put("/api/firs/" + fir + "/playbook"), io, "{\"playbookId\":\"cyber-fraud\"}").andExpect(status().isNoContent());
    }

    void submitted() throws Exception {
        playbook();
        call(put(url("")), io, words(FACTS, EVIDENCE)).andExpect(status().isOk());
        call(post(url("/submit")), io, null).andExpect(status().isOk());
    }

    @Test
    void theWholeWayFromDraftToSignature() throws Exception {
        call(get(url("")), io, null).andExpect(status().isOk()).andExpect(jsonPath("$.draft").doesNotExist())
                .andExpect(jsonPath("$.canApprove").value(false)).andExpect(jsonPath("$.readinessChecked").value(false));
        call(get(url("")), sho, null).andExpect(jsonPath("$.canApprove").value(true));
        submitted();
        call(put(url("")), io, words(FACTS + " More.", EVIDENCE)).andExpect(status().isConflict());         // no change once submitted
        call(post(url("/sign")), io, null).andExpect(status().isConflict());                                  // not approved yet
        call(post(url("/decision")), io, "{\"decision\":\"approve\"}").andExpect(status().isForbidden());    // an IO does not approve
        call(post(url("/decision")), sho, "{\"decision\":\"return\"}").andExpect(status().isBadRequest());     // a reason is needed
        call(post(url("/decision")), sho, "{\"decision\":\"return\",\"note\":\"Add the call records to the evidence.\"}").andExpect(status().isOk());
        call(put(url("")), io, words(FACTS, EVIDENCE + " Call records added.")).andExpect(status().isOk());   // returned: words change again
        call(post(url("/submit")), io, null).andExpect(status().isOk());
        call(post(url("/decision")), sho, "{\"decision\":\"approve\"}").andExpect(status().isOk());
        call(post(url("/sign")), otherIo, null).andExpect(status().isForbidden());
        call(post(url("/sign")), io, null).andExpect(status().isOk());
        call(get(url("")), sho, null).andExpect(jsonPath("$.draft.status").value("signed"))
                .andExpect(jsonPath("$.draft.signed_by_name").value("Fictional io")).andExpect(jsonPath("$.draft.decided_by_name").value("Fictional sho"))
                .andExpect(jsonPath("$.events.length()").value(7))
                .andExpect(jsonPath("$.events[?(@.action=='returned')].note").value("Add the call records to the evidence."));
        call(put(url("")), io, words(FACTS, "Changed after signing")).andExpect(status().isConflict());
        assertThatThrownBy(() -> db.sql("update final_report_draft set facts_text = 'changed after the signature'").update()).hasMessageContaining("kept as written");
        assertThatThrownBy(() -> db.sql("delete from final_report_draft").update()).hasMessageContaining("never deleted");
        assertThatThrownBy(() -> db.sql("update final_report_event set note = 'changed note over ten'").update()).hasMessageContaining("kept as written");
        assertThatThrownBy(() -> db.sql("delete from final_report_event").update()).hasMessageContaining("kept as written");
    }

    @Test
    void submittingNeedsBothPartsAWrittenPlaybookCheckAndNoOpenGap() throws Exception {
        call(post(url("/submit")), io, null).andExpect(status().isConflict());                                // no draft yet
        call(put(url("")), io, words("short", "")).andExpect(status().isOk());
        call(post(url("/submit")), io, null).andExpect(status().isConflict());
        call(put(url("")), io, words(FACTS, EVIDENCE)).andExpect(status().isOk());
        call(post(url("/submit")), io, null).andExpect(status().isConflict());                                // readiness not checked
        playbook();
        call(get(url("")), io, null).andExpect(jsonPath("$.readinessChecked").value(true)).andExpect(jsonPath("$.openGaps").value(0));
        call(post(url("/submit")), io, null).andExpect(status().isOk());
        call(post(url("/submit")), io, null).andExpect(status().isConflict());                                // twice
    }

    @Test
    void eachPartNeedsTwentyCharactersAndAReturnNeedsAReasonOfTenWhateverIsWrongWithIt() throws Exception {
        playbook();
        for (String[] w : new String[][] {{FACTS, "too short"}, {"too short", EVIDENCE}, {FACTS, "   "}, {"   ", EVIDENCE}}) {
            call(put(url("")), io, words(w[0], w[1])).andExpect(status().isOk());
            call(post(url("/submit")), io, null).andExpect(status().isConflict());
        }
        call(put(url("")), io, words(FACTS, EVIDENCE)).andExpect(status().isOk());
        call(post(url("/submit")), io, null).andExpect(status().isOk());
        for (String note : new String[] {"", "   ", "too short", null})
            call(post(url("/decision")), sho, note == null ? "{\"decision\":\"return\"}" : "{\"decision\":\"return\",\"note\":\"" + note + "\"}").andExpect(status().isBadRequest());
        call(get(url("")), sho, null).andExpect(jsonPath("$.draft.status").value("submitted"));   // still waiting for a decision
    }

    @Test
    void nobodyApprovesTheirOwnSubmission() throws Exception {
        playbook();
        call(put(url("")), sho, words(FACTS, EVIDENCE)).andExpect(status().isOk());
        call(post(url("/submit")), sho, null).andExpect(status().isOk());
        call(post(url("/decision")), sho, "{\"decision\":\"approve\"}").andExpect(status().isForbidden());
        assertThatThrownBy(() -> db.sql("update final_report_draft set status = 'approved', decided_by = submitted_by").update()).hasMessageContaining("someone other");
        call(post(url("/decision")), sho, "{\"decision\":\"nonsense\"}").andExpect(status().isBadRequest());
    }

    @Test
    void onlyTheCaseTeamTouchesTheDraftAndOnlyTheHeadDecides() throws Exception {
        for (String who : new String[] {outsider, desk}) {
            call(get(url("")), who, null).andExpect(status().isNotFound());
            call(put(url("")), who, words(FACTS, EVIDENCE)).andExpect(status().isForbidden());
            call(post(url("/submit")), who, null).andExpect(status().isForbidden());
            call(post(url("/decision")), who, "{\"decision\":\"approve\"}").andExpect(status().isForbidden());
            call(post(url("/sign")), who, null).andExpect(status().isForbidden());
        }
        call(post(url("/decision")), sho, "{\"decision\":\"approve\"}").andExpect(status().isConflict());     // nothing submitted
        call(put(url("")), io, "{\"language\":\"EN!\"}").andExpect(status().isBadRequest());
        assertThat(db.sql("select count(*) from final_report_draft").query(Long.class).single()).isZero();
    }

    @Test
    void theDatabaseRefusesAShortcutThroughTheStates() throws Exception {
        call(put(url("")), io, words(FACTS, EVIDENCE)).andExpect(status().isOk());
        assertThatThrownBy(() -> db.sql("update final_report_draft set status = 'approved'").update()).hasMessageContaining("cannot go from");
        assertThatThrownBy(() -> db.sql("update final_report_draft set status = 'signed'").update()).hasMessageContaining("cannot go from");
        assertThatThrownBy(() -> db.sql("update final_report_draft set status = 'submitted'").update()).hasMessageContaining("named officer");
        assertThatThrownBy(() -> db.sql("update final_report_draft set fir_id = gen_random_uuid()").update()).isInstanceOf(Exception.class);
        assertThatThrownBy(() -> db.sql("insert into final_report_draft (fir_id, language, created_by, status) select id, 'en', io_id, 'signed' from fir").update()).hasMessageContaining("starts as a draft");
        submitted();
        db.sql("update final_report_draft set status = 'approved', decided_by = ?").param(shoId).update();
        assertThatThrownBy(() -> db.sql("update final_report_draft set status = 'signed', signed_by = ?").param(shoId).update()).hasMessageContaining("submitted the final report signs");
        assertThatThrownBy(() -> db.sql("update final_report_draft set evidence_text = 'a quiet change of the evidence'").update()).hasMessageContaining("only while");
    }

    @Test
    void anOpenGapOfTheReadinessCheckStopsTheSubmission() throws Exception {
        db.sql("insert into fir_section (fir_id, act, section) values (?, 'BNS', '318(4)')").param(fir).update();
        playbook();
        call(put(url("")), io, words(FACTS, EVIDENCE)).andExpect(status().isOk());
        call(get(url("")), io, null).andExpect(jsonPath("$.openGaps").value(org.hamcrest.Matchers.greaterThan(0)))
                .andExpect(jsonPath("$.particulars.sections").value("BNS 318(4)"));
        call(post(url("/submit")), io, null).andExpect(status().isConflict());
        assertThat(db.sql("select status from final_report_draft").query(String.class).single()).isEqualTo("draft");
    }

    @Test
    void stepsOutOfOrderAreRefusedAndMissingPartsAreSavedEmpty() throws Exception {
        call(post(url("/sign")), io, null).andExpect(status().isConflict());                                  // no draft at all
        call(put(url("")), io, "{\"language\":\"mr\"}").andExpect(status().isOk());                       // both parts missing: saved empty
        call(get(url("")), io, null).andExpect(jsonPath("$.draft.facts_text").value("")).andExpect(jsonPath("$.draft.language").value("mr"));
        call(post(url("/decision")), sho, "{\"decision\":\"approve\"}").andExpect(status().isConflict());   // a draft is not submitted
        call(put(url("")), io, "{\"language\":\"en\",\"facts\":\"  " + FACTS + "  \",\"evidence\":\"" + EVIDENCE + "\"}").andExpect(status().isOk());
        call(get(url("")), io, null).andExpect(jsonPath("$.draft.facts_text").value(FACTS)).andExpect(jsonPath("$.draft.language").value("en"));
        playbook();
        call(post(url("/submit")), io, null).andExpect(status().isOk());
        call(post(url("/decision")), sho, "{\"decision\":\"return\",\"note\":\"         \"}").andExpect(status().isBadRequest());
        call(post(url("/decision")), sho, "{\"decision\":\"approve\",\"note\":\"Looks complete to me.\"}").andExpect(status().isOk());
        call(post(url("/decision")), sho, "{\"decision\":\"approve\"}").andExpect(status().isConflict());   // already decided
        call(get(url("")), sho, null).andExpect(jsonPath("$.events[?(@.action=='approved')].note").value("Looks complete to me."));
    }

    @Test
    void aSaveThatTookAiSentencesNamesTheGatewayRequestOnlyThatSave() throws Exception {
        // A6 (V54): the step of a save that took AI-drafted sentences shows the gateway's request; other saves show none
        String req = "6f1c1d1e-0000-4000-8000-000000000054";
        call(put(url("")), io, "{\"language\":\"en\",\"facts\":\"" + FACTS + "\",\"evidence\":\"\",\"aiRequestId\":\"" + req + "\"}").andExpect(status().isOk());
        call(put(url("")), io, words(FACTS, EVIDENCE)).andExpect(status().isOk());
        call(put(url("")), io, "{\"language\":\"en\",\"facts\":\"" + FACTS + "\",\"evidence\":\"\",\"aiRequestId\":\"not-a-request\"}").andExpect(status().isBadRequest());
        call(get(url("")), io, null).andExpect(jsonPath("$.events.length()").value(2))
                .andExpect(jsonPath("$.events[0].ai_request").value(req)).andExpect(jsonPath("$.events[1].ai_request").doesNotExist());
        call(put(url("")), desk, words(FACTS, EVIDENCE)).andExpect(status().isForbidden());   // the front desk is not on the case team
    }

    // weekly review 14 Nov: A6 is not used on a protected case, so a save naming an AI request is refused there (V55)
    @Test
    void onAProtectedCaseASaveThatNamesAnAiRequestIsRefused_aPlainSaveIsTaken() throws Exception {
        db.sql("update fir set identity_protected = true where id = ?").param(fir).update();
        String req = "6f1c1d1e-0000-4000-8000-000000000055";
        call(put(url("")), io, "{\"language\":\"en\",\"facts\":\"" + FACTS + "\",\"evidence\":\"\",\"aiRequestId\":\"" + req + "\"}").andExpect(status().isBadRequest());
        call(put(url("")), io, words(FACTS, EVIDENCE)).andExpect(status().isOk());
        UUID draft = db.sql("select id from final_report_draft where fir_id = ?").param(fir).query(UUID.class).single();
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> db.sql("insert into final_report_event (draft_id, by_user, action, ai_request) values (?,?,'saved',?)")
                .params(draft, ioId, UUID.fromString(req)).update()).hasMessageContaining("not taken on a case whose victim");
        assertThat(db.sql("select count(*) from final_report_event where ai_request is not null").query(Long.class).single()).isZero();
    }

    UUID person(String role, String label, boolean masked) {
        return db.sql("insert into person (fir_id, role, label, full_name, identity_masked) values (?,?,?,?,?) returning id")
                .params(fir, role, label, "Fictional " + label, masked).query(UUID.class).single();
    }

    UUID item(String label, String kind) {
        return db.sql("insert into evidence_item (fir_id, label, description, kind, seized_at, seizure_memo, sha256) values (?,?,?,?,now() - interval '1 day','SM-1',?) returning id")
                .params(fir, label, "Fictional " + label, kind, kind.equals("electronic") ? "a".repeat(64) : null).query(UUID.class).single();
    }

    void certificate(UUID item, String part, String hash) {
        db.sql("insert into certificate_63_4 (item_id, part, signer_name, device_type, hash_algo, hash_value, signed_at, place) values (?,?,'Fictional Signer','Phone','SHA256',?,now(),'Fictional Demo')")
                .params(item, part, hash).update();
    }

    UUID notice(String kind, String status, String addressee) {
        return db.sql("insert into notice (fir_id, kind, addressee, items_requested, body, status, signed_by, issued_at) values (?,?,?,array['Statement'],'Fictional notice',?,?,case when ? = 'draft' then null else now() end) returning id")
                .params(fir, kind, addressee, status, ioId, status).query(UUID.class).single();
    }

    /** One of every paper that goes with the report, some on file and some still expected. */
    void aFileOfEveryPaper() {
        UUID w = person("witness", "W1", false), a = person("accused", "A1", false);
        db.sql("insert into complaint (station_id, received_at, mode, informant_name, kind, text_original, text_language, recorded_by, signed_at, signed_recorded_by, outcome, fir_id, outcome_at, outcome_by) select station_id, information_received_at, 'written', 'Fictional Informant', 'other', contents_original, 'en', io_id, information_received_at, io_id, 'fir', id, registered_at, io_id from fir where id = ?")
                .params(fir).update();
        db.sql("insert into witness_statement (fir_id, person_id, recorded_by, language, medium, original_text) values (?,?,?,'en','written','Fictional statement')").params(fir, w, ioId).update();
        db.sql("insert into arrest (person_id, arrested_at, place, grounds, informed_name, arresting_officer, max_punishment) values (?,now() - interval '1 day','Fictional Road',array['Fictional ground'],'Fictional Relative',?,'less_than_10_years')")
                .params(a, ioId).update();
        UUID phone = item("E1", "electronic"), disk = item("E2", "electronic"), drive = item("E3", "electronic");
        item("E4", "physical");
        certificate(phone, "A", "a".repeat(64));
        certificate(phone, "B", "a".repeat(64));
        certificate(disk, "A", "a".repeat(64));
        certificate(drive, "A", "b".repeat(64));
        certificate(drive, "B", "b".repeat(64));
        db.sql("insert into custody_event (item_id, at, handed_by, received_by, location, purpose, seal_intact, place) values (?,now() - interval '20 hours','Fictional Seizer','Fictional Keeper','Fictional malkhana','Safe keeping',true,'malkhana')").param(phone).update();
        db.sql("insert into custody_event (item_id, at, handed_by, received_by, location, purpose, seal_intact, place) values (?,now() - interval '2 hours','Fictional Keeper','Fictional Analyst','Fictional laboratory','Examination',false,'lab')").param(phone).update();
        notice("BNSS_94", "complete", "Fictional Bank One");
        notice("BNSS_94", "reply_incomplete", "Fictional Bank Two");
        notice("BNSS_94", "sent", "Fictional Bank Three");
        notice("BNSS_35_3", "sent", "Fictional Person");
        notice("BNSS_94", "draft", "Fictional Draft Bank");
        UUID lab = db.sql("insert into expert_request (fir_id, kind, subject, sent_to, sent_on, evidence_item_id, recorded_by) values (?,'forensic','Phone extraction','Fictional FSL',current_date - 1,?,?) returning id")
                .params(fir, phone, ioId).query(UUID.class).single();
        db.sql("insert into expert_request_step (request_id, fir_id, status, on_date, recorded_by) values (?,?,'report_received',current_date,?)").params(lab, fir, ioId).update();
        db.sql("insert into expert_request (fir_id, kind, subject, sent_to, sent_on, recorded_by) values (?,'medical','Examination','Fictional Hospital',current_date - 1,?)").params(fir, ioId).update();
    }

    @Test
    void theIndexOfPapersSentWithTheReportSaysWhatIsOnFileExpectedAndMissing() throws Exception {
        call(get(url("")), io, null).andExpect(jsonPath("$.enclosures.length()").value(1)).andExpect(jsonPath("$.enclosures[0].kind").value("fir"))
                .andExpect(jsonPath("$.enclosures[0].ref").value("1/2026")).andExpect(jsonPath("$.enclosures[0].state").value("ok"));
        aFileOfEveryPaper();
        // a memo, its recording and its seized item are written together (V48)
        UUID search = db.sql("""
                with s as (insert into search_seizure (fir_id, place, grounds, started_at, ended_at, no_witness_reason, recorded_by)
                           values (?,'Fictional House','Fictional grounds for the search',now() - interval '3 hours',now() - interval '2 hours','No witness could be had in time',?) returning id, fir_id),
                     r as (insert into search_recording (search_id, fir_id, sha256, seconds) select id, fir_id, repeat('c', 64), 60 from s),
                     e as (insert into evidence_item (fir_id, label, description, kind, seized_at, seizure_memo, search_id)
                           select fir_id, 'E5', 'Fictional bag', 'physical', now() - interval '2 hours', 'SM-2', id from s)
                select id from s""").params(fir, ioId).query(UUID.class).single();
        String body = call(get(url("/print")), io, null).andExpect(status().isOk()).andExpect(jsonPath("$.namesWithheld").value(false))
                .andReturn().getResponse().getContentAsString();
        java.util.List<java.util.Map<String, Object>> rows = com.jayway.jsonpath.JsonPath.read(body, "$.enclosures");
        assertThat(rows.stream().map(r -> r.get("kind") + "|" + r.get("ref") + "|" + r.get("detail") + "|" + r.get("state") + "|" + r.get("note"))).containsExactly(
                "fir|1/2026|null|ok|null",
                "complaint|null|null|ok|null",
                "statement|W1|null|ok|null",
                "arrest_memo|A1|null|ok|null",
                "search_memo|E5|null|wait|recording_not_sent",
                "notice|BNSS_94|Fictional Bank One|ok|null",
                "notice|BNSS_94|Fictional Bank Two|wait|reply_incomplete",
                "notice|BNSS_94|Fictional Bank Three|wait|no_reply",
                "notice|BNSS_35_3|Fictional Person|ok|null",
                "expert_forensic|E1|Fictional FSL|ok|null",
                "expert_medical|null|Fictional Hospital|wait|report_awaited",
                "certificate|E1|null|ok|null",
                "certificate|E2|null|missing|part_b",
                "certificate|E3|null|missing|hash");
        // the custody of the electronic devices only, each hand-over in order; an item never handed over still has its seizure
        call(get(url("/print")), io, null).andExpect(jsonPath("$.custody.length()").value(4))
                .andExpect(jsonPath("$.custody[0].label").value("E1")).andExpect(jsonPath("$.custody[0].received_by").value("Fictional Keeper"))
                .andExpect(jsonPath("$.custody[1].place").value("lab")).andExpect(jsonPath("$.custody[1].seal_intact").value(false))
                .andExpect(jsonPath("$.custody[2].label").value("E2")).andExpect(jsonPath("$.custody[2].at").value((Object) null));
        db.sql("insert into search_forward (search_id, fir_id, forwarded_on, forwarded_to, recorded_by) values (?,?,current_date,'Fictional Magistrate',?)").params(search, fir, ioId).update();
        call(get(url("")), io, null).andExpect(jsonPath("$.enclosures[?(@.kind=='search_memo')].state").value("ok"))
                .andExpect(jsonPath("$.enclosures[?(@.kind=='search_memo')].on_date").exists());
    }

    @Test
    void onAProtectedCaseTheListsCarryNoNames() throws Exception {
        aFileOfEveryPaper();
        db.sql("update fir set identity_protected = true").update();
        theListsCarryNoNames();
    }

    @Test
    void withAPersonMaskedByHandTheListsCarryNoNames() throws Exception {
        aFileOfEveryPaper();
        db.sql("update person set identity_masked = true where label = 'W1'").update();
        theListsCarryNoNames();
    }

    void theListsCarryNoNames() throws Exception {
        String body = call(get(url("/print")), io, null).andExpect(status().isOk()).andExpect(jsonPath("$.namesWithheld").value(true))
                .andExpect(jsonPath("$.enclosures[?(@.kind=='statement')].ref").value("W1"))
                .andExpect(jsonPath("$.custody[1].place").value("lab"))
                .andReturn().getResponse().getContentAsString();
        java.util.List<Object> free = com.jayway.jsonpath.JsonPath.read(body, "$.enclosures[*].detail");
        assertThat(free).containsOnlyNulls();
        for (String key : new String[] {"handed_by", "received_by", "location"})
            assertThat(com.jayway.jsonpath.JsonPath.<java.util.List<Object>>read(body, "$.custody[*]." + key)).hasSize(4).containsOnlyNulls();
        assertThat(body).doesNotContain("Fictional Bank", "Fictional Keeper", "Fictional laboratory", "Fictional Hospital", "Fictional Informant");
        // the Final report part's list is the same one, withheld the same way
        call(get(url("")), io, null).andExpect(jsonPath("$.enclosures[?(@.kind=='notice')].detail").value(org.hamcrest.Matchers.everyItem(org.hamcrest.Matchers.nullValue())));
    }

    @Test
    void aSexualOffenceInvestigationWithoutAMedicalReportSaysSo() throws Exception {
        String missing = "$.enclosures[?(@.kind=='medical_report')]";
        // BNS 69 is not in the list of BNSS 193(3)(i)(h), nor is a theft
        db.sql("insert into fir_section (fir_id, act, section) values (?,'BNS','69'), (?,'BNS','303(2)')").params(fir, fir).update();
        call(get(url("")), io, null).andExpect(jsonPath(missing).isEmpty());
        int no = 10;
        for (String[] s : new String[][] {{"BNS", "64(1)"}, {"BNS", "70(2)"}, {"BNS", "71"}, {"IPC", "376(2)(n)"}, {"IPC", "376D"}}) {
            fir = db.sql("""
                    insert into fir (station_id, fir_year, fir_no, gd_entry_no, registered_at, information_received_at, contents_original, contents_language, action_taken, io_id)
                    select station_id, fir_year, ?, gd_entry_no, registered_at, information_received_at, contents_original, contents_language, action_taken, io_id from fir order by fir_no limit 1 returning id""")
                    .param(no++).query(UUID.class).single();   // a section is kept as written, so each is tried on an FIR of its own
            db.sql("insert into fir_section (fir_id, act, section) values (?,?,?)").params(fir, s[0], s[1]).update();
            call(get(url("")), io, null).andExpect(jsonPath(missing + ".note").value("no_medical")).andExpect(jsonPath(missing + ".state").value("missing"));
        }
        UUID r = db.sql("insert into expert_request (fir_id, kind, subject, sent_to, sent_on, recorded_by) values (?,'medical','Examination','Fictional Hospital',current_date - 1,?) returning id")
                .params(fir, ioId).query(UUID.class).single();
        call(get(url("")), io, null).andExpect(jsonPath(missing + ".note").value("no_medical"));   // asked for, not received
        db.sql("insert into expert_request_step (request_id, fir_id, status, on_date, recorded_by) values (?,?,'report_received',current_date,?)").params(r, fir, ioId).update();
        call(get(url("")), io, null).andExpect(jsonPath(missing).isEmpty());
    }

    @Test
    void thePrintGathersTheCourtFormFromTheRecordsAndNamesAProtectedVictimOnlyByLabel() throws Exception {
        db.sql("update fir set sexual_offence = true where id = ?").param(fir).update();
        db.sql("insert into person (fir_id, role, label, full_name, parentage, age_years, gender, address_present, identity_masked) values (?, 'victim', 'V1', 'Fictional Victim', 'D/o Fictional', 19, 'F', 'Fictional Lane', true)").param(fir).update();
        UUID a1 = db.sql("insert into person (fir_id, role, label, full_name, parentage, age_years, gender, address_present) values (?, 'accused', 'A1', 'Fictional Accused', 'S/o Fictional Father', 30, 'M', 'Fictional Street') returning id").param(fir).query(UUID.class).single();
        db.sql("insert into person (fir_id, role, label, full_name) values (?, 'accused', 'A2', 'Fictional Absconder')").param(fir).update();
        db.sql("insert into evidence_item (fir_id, label, description, kind, seized_at, seizure_memo, seal_no) values (?, 'E1', 'Fictional knife', 'physical', now() - interval '1 day', 'SM-1', 'SEAL-1')").param(fir).update();
        UUID cs = db.sql("insert into chargesheet (fir_id, filed_on, court, report_no, recorded_by) values (?, current_date, 'Fictional JMFC Court', 'CS-1/2026', ?) returning id").params(fir, ioId).query(UUID.class).single();
        db.sql("insert into chargesheet_accused (chargesheet_id, person_id) values (?, ?)").params(cs, a1).update();
        call(get(url("/print")), io, null).andExpect(status().isOk())
                .andExpect(jsonPath("$.head.station").value("Fictional North PS"))
                .andExpect(jsonPath("$.head.district").value("North"))
                .andExpect(jsonPath("$.head.report_no").value("CS-1/2026"))
                .andExpect(jsonPath("$.head.io_name").value("Fictional io"))
                .andExpect(jsonPath("$.people[?(@.label=='V1')].masked").value(true))
                .andExpect(jsonPath("$.people[?(@.label=='V1')].name").value(org.hamcrest.Matchers.contains((Object) null)))
                .andExpect(jsonPath("$.people[?(@.label=='V1')].address").value(org.hamcrest.Matchers.contains((Object) null)))
                .andExpect(jsonPath("$.people[?(@.label=='A1')].parentage").value("S/o Fictional Father"))
                .andExpect(jsonPath("$.people[?(@.label=='A1')].sent_up").value(true))
                .andExpect(jsonPath("$.people[?(@.label=='A2')].sent_up").value(false))
                .andExpect(jsonPath("$.property[0].seal_no").value("SEAL-1"));
        call(get(url("/print")), desk, null).andExpect(status().is4xxClientError());
        call(get(url("/print")), outsider, null).andExpect(status().is4xxClientError());
    }
}
