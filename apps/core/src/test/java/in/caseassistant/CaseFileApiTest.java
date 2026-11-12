package in.caseassistant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.test.web.servlet.MockMvc;

/** The passages "Ask the case file" may answer from (board 19): one case, its team only, labels not names. Fictional data only. */
@SpringBootTest
@AutoConfigureMockMvc
class CaseFileApiTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcClient db;
    @Autowired ObjectMapper json;
    @Autowired JwtEncoder tokens;
    UUID station, fir, other, ioId;
    String io, outsider, desk;

    UUID user(UUID st, String role) {
        return db.sql("insert into app_user (station_id, full_name, rank, role) values (?,?,'SI',?) returning id").params(st, "Fictional " + role, role).query(UUID.class).single();
    }

    UUID fir(int no, String text) {
        return db.sql("""
                insert into fir (station_id, fir_year, fir_no, gd_entry_no, registered_at, information_received_at, contents_original, contents_language, action_taken, io_id)
                values (?,2026,?,'GD-1',now() - interval '2 days',now() - interval '2 days 1 hour',?,'en','investigate',?) returning id""")
                .params(station, no, text, ioId).query(UUID.class).single();
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
        fir = fir(1, "Fictional complaint: a transfer of Rs 5,000 on 21 August 2026.");
        other = fir(2, "Fictional second case: a lost bicycle.");
    }

    JsonNode read(UUID id, String who) throws Exception {
        return json.readTree(mvc.perform(get("/api/firs/" + id + "/case-file").header("Authorization", who)).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString()).get("passages");
    }

    @Test
    void theTeamGetsThePassagesOfThisCaseOnlyAndPeopleAreNamedByLabel() throws Exception {
        UUID w = db.sql("insert into person (fir_id, role, label, full_name) values (?, 'witness', 'W1', 'Fictional Witness Name') returning id").param(fir).query(UUID.class).single();
        db.sql("insert into witness_statement (fir_id, person_id, recorded_by, language, medium, original_text) values (?,?,?,'en','written','Fictional: I saw the transfer on 22 August.')").params(fir, w, ioId).update();
        db.sql("insert into case_diary_entry (fir_id, author, text) values (?,?,'Fictional diary line about the bank.')").params(fir, ioId).update();
        db.sql("insert into evidence_item (fir_id,label,description,kind,seized_at,seizure_memo,sha256) values (?,'E-01','Fictional phone','electronic','2026-10-02T10:00Z','SM-1',?)").params(fir, "a".repeat(64)).update();
        db.sql("insert into notice (fir_id, kind, addressee, items_requested, body, issued_at, reply_due_on, status, signed_by) values (?, 'BNSS_94', 'Nodal Officer, Fictional Bank', array['Statement'], 'Fictional notice body', now(), current_date + 7, 'sent', ?)").params(fir, ioId).update();
        db.sql("insert into evidence_item (fir_id,label,description,kind,seized_at,seizure_memo,sha256) values (?,'E-09','Fictional item of the other case','electronic','2026-10-02T10:00Z','SM-9',?)").params(other, "b".repeat(64)).update();

        JsonNode p = read(fir, io);
        assertThat(p).hasSize(5);
        assertThat(p.get(0).get("kind").asText()).isEqualTo("complaint");
        assertThat(p.get(0).get("text").asText()).contains("Rs 5,000");
        assertThat(p.get(1).get("title").asText()).startsWith("Statement of W1, recorded ");
        assertThat(p.get(1).get("text").asText()).contains("22 August");
        assertThat(p.get(2).get("title").asText()).startsWith("Case diary, ");
        assertThat(p.get(3).get("title").asText()).isEqualTo("Evidence E-01");
        assertThat(p.get(4).get("title").asText()).isEqualTo("Notice BNSS_94 to Nodal Officer, Fictional Bank (sent)");
        assertThat(p.toString()).doesNotContain("Fictional Witness Name").doesNotContain("E-09").doesNotContain("bicycle");
        // ids are unique and in order
        assertThat(p.get(0).get("id").asText()).isEqualTo("P1");
        assertThat(p.get(4).get("id").asText()).isEqualTo("P5");
    }

    @Test
    void onlyTheCaseTeamReadsThem() throws Exception {
        mvc.perform(get("/api/firs/" + fir + "/case-file").header("Authorization", outsider)).andExpect(status().isNotFound());
        mvc.perform(get("/api/firs/" + fir + "/case-file").header("Authorization", desk)).andExpect(status().isNotFound());
        mvc.perform(get("/api/firs/" + fir + "/case-file")).andExpect(status().isUnauthorized());
    }

    @Test
    void readingAProtectedCaseIsLogged() throws Exception {
        db.sql("insert into fir_section (fir_id, act, section) values (?, 'BNS', '64(1)')").param(fir).update();
        read(fir, io);
        assertThat(db.sql("select count(*) from protected_read where what = 'fir_text' and fir_id = ?").param(fir).query(Long.class).single()).isOne();
        read(other, io);   // an ordinary case is not logged
        assertThat(db.sql("select count(*) from protected_read where fir_id = ?").param(other).query(Long.class).single()).isZero();
    }

    @Test
    void aCheckedEnglishTranslationComesAfterTheStatementsWithItsOwnTitle() throws Exception {
        // session 92 (item 17): an English question can find a statement made in Marathi through its checked translation
        UUID w = db.sql("insert into person (fir_id, role, label, full_name) values (?, 'witness', 'W2', 'Fictional Cashier Name') returning id").param(fir).query(UUID.class).single();
        UUID st = db.sql("insert into witness_statement (fir_id, person_id, recorded_by, language, medium, original_text) values (?,?,?,'mr','written','मी बँकेत रोखपाल आहे.') returning id")
                .params(fir, w, ioId).query(UUID.class).single();
        db.sql("insert into statement_translation (statement_id, translated_text, ai_text, ai_request_id, checked_by) values (?, 'I am a cashier at the bank.', 'I am a cashier at the bank.', gen_random_uuid(), ?)")
                .params(st, ioId).update();
        JsonNode p = read(fir, io);
        assertThat(p).hasSize(3);
        assertThat(p.get(1).get("kind").asText()).isEqualTo("statement");
        assertThat(p.get(2).get("kind").asText()).isEqualTo("translation");
        assertThat(p.get(2).get("title").asText()).startsWith("English translation of the statement of W2, recorded ");
        assertThat(p.get(2).get("text").asText()).isEqualTo("I am a cashier at the bank.");
        assertThat(p.toString()).doesNotContain("Fictional Cashier Name");
        assertThat(read(other, io).toString()).doesNotContain("cashier");
    }

    @Test
    void expertRequestsCourtEventsAndSearchMemosAreAlsoPassagesOfThisCaseOnly() throws Exception {
        // session 93 (item 17)
        UUID req = db.sql("insert into expert_request (fir_id, kind, subject, sent_to, sent_on, recorded_by) values (?, 'forensic', 'Fictional phone image', 'Fictional Regional Lab', date '2026-09-01', ?) returning id")
                .params(fir, ioId).query(UUID.class).single();
        db.sql("insert into expert_request_step (request_id, fir_id, status, on_date, note, recorded_by) values (?,?,'sent',date '2026-09-01',null,?)").params(req, fir, ioId).update();
        db.sql("insert into expert_request_step (request_id, fir_id, status, on_date, note, recorded_by) values (?,?,'report_received',date '2026-09-20','Fictional: report says the chat was deleted',?)").params(req, fir, ioId).update();
        db.sql("insert into court_event (fir_id, kind, on_date, court, case_no, note, recorded_by) values (?, 'cognizance', date '2026-10-05', 'Fictional JMFC Court', 'CC 12/2026', 'Fictional: next date 3 Dec', ?)").params(fir, ioId).update();
        db.sql("insert into court_event (fir_id, kind, on_date, recorded_by) values (?, 'other', date '2026-10-06', ?)").params(fir, ioId).update();
        db.sql("""
                with m as (insert into search_seizure (fir_id, place, grounds, started_at, ended_at, no_witness_reason, recorded_by)
                           values (?, 'Fictional shop, Demo Road', 'Fictional grounds: phone believed kept here', now() - interval '3 hours', now() - interval '2 hours', 'Fictional: no resident agreed to witness', ?)
                           returning id)
                insert into search_recording (search_id, fir_id, sha256, seconds) select id, ?, ?, 600 from m""").params(fir, ioId, fir, "c".repeat(64)).update();
        // the same kinds in another case must not appear
        UUID req2 = db.sql("insert into expert_request (fir_id, kind, subject, sent_to, sent_on, recorded_by) values (?, 'medical', 'Fictional bicycle injury', 'Fictional Hospital', date '2026-09-01', ?) returning id")
                .params(other, ioId).query(UUID.class).single();
        db.sql("insert into expert_request_step (request_id, fir_id, status, on_date, recorded_by) values (?,?,'sent',date '2026-09-01',?)").params(req2, other, ioId).update();

        JsonNode p = read(fir, io);
        assertThat(p).hasSize(5);
        assertThat(p.get(1).get("kind").asText()).isEqualTo("expert");
        assertThat(p.get(1).get("title").asText()).isEqualTo("Request to Fictional Regional Lab (forensic), sent 01 Sep 2026");
        assertThat(p.get(1).get("text").asText()).isEqualTo("Fictional phone image | sent 01 Sep 2026; report_received 20 Sep 2026: Fictional: report says the chat was deleted");
        assertThat(p.get(2).get("kind").asText()).isEqualTo("court");
        assertThat(p.get(2).get("title").asText()).isEqualTo("Court event cognizance, 05 Oct 2026");
        assertThat(p.get(2).get("text").asText()).isEqualTo("Fictional JMFC Court | case no CC 12/2026 | Fictional: next date 3 Dec");
        assertThat(p.get(3).get("title").asText()).isEqualTo("Court event other, 06 Oct 2026");
        assertThat(p.get(3).get("text").asText()).isEmpty();
        assertThat(p.get(4).get("kind").asText()).isEqualTo("search");
        assertThat(p.get(4).get("text").asText()).isEqualTo("Fictional shop, Demo Road | Fictional grounds: phone believed kept here | no witness: Fictional: no resident agreed to witness");
        assertThat(p.toString()).doesNotContain("bicycle injury").doesNotContain("Fictional Hospital");
        assertThat(read(other, io).get(1).get("title").asText()).isEqualTo("Request to Fictional Hospital (medical), sent 01 Sep 2026");
    }

    @Test
    void theMoneyTrailsTransfersAndHoldsArePassagesOfThisCaseOnly() throws Exception {
        // session 94 (item 17): amounts in rupees, a receiving accused by label, the bank reply named when linked
        UUID acc = db.sql("insert into person (fir_id, role, label, full_name) values (?, 'accused', 'A1', 'Fictional Accused Name') returning id").param(fir).query(UUID.class).single();
        UUID ev = db.sql("insert into evidence_item (fir_id,label,description,kind,seized_at,seizure_memo,sha256) values (?,'E-02','Fictional bank reply','document','2026-10-02T10:00Z','SM-2',?) returning id")
                .params(fir, "d".repeat(64)).query(UUID.class).single();
        db.sql("insert into money_transfer (fir_id, from_account, to_account, to_person_id, amount_paise, transferred_on, evidence_item_id, recorded_by) values (?, 'XX1111', 'XX2222', ?, 1250050, date '2026-08-21', ?, ?)")
                .params(fir, acc, ev, ioId).update();
        db.sql("insert into money_transfer (fir_id, from_account, to_account, amount_paise, transferred_on, recorded_by) values (?, 'XX2222', 'XX3333', 500, date '2026-08-22', ?)").params(fir, ioId).update();
        db.sql("insert into money_hold (fir_id, account, amount_paise, held_on, recorded_by) values (?, 'XX3333', 10000000, date '2026-08-25', ?)").params(fir, ioId).update();
        db.sql("insert into money_hold (fir_id, account, amount_paise, held_on, recorded_by) values (?, 'XX9999', 100, date '2026-08-25', ?)").params(other, ioId).update();

        JsonNode p = read(fir, io);
        assertThat(p).hasSize(5);
        assertThat(p.get(2).get("kind").asText()).isEqualTo("money");
        assertThat(p.get(2).get("title").asText()).isEqualTo("Transfer on 21 Aug 2026");
        assertThat(p.get(2).get("text").asText()).isEqualTo("Rs 12,500.50 from account XX1111 to account XX2222 (A1) | bank reply E-02");
        assertThat(p.get(3).get("text").asText()).isEqualTo("Rs 5.00 from account XX2222 to account XX3333");
        assertThat(p.get(4).get("title").asText()).isEqualTo("Bank hold on 25 Aug 2026");
        assertThat(p.get(4).get("text").asText()).isEqualTo("Rs 100,000.00 held in account XX3333");
        assertThat(p.toString()).doesNotContain("Fictional Accused Name").doesNotContain("XX9999");
        assertThat(read(other, io).get(1).get("text").asText()).isEqualTo("Rs 1.00 held in account XX9999");
    }
}
