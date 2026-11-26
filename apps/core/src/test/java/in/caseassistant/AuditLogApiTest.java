package in.caseassistant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.test.web.servlet.MockMvc;

/** The joined audit log of a station ({@link AuditLog}). Fictional data only. */
@SpringBootTest
@AutoConfigureMockMvc
class AuditLogApiTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcClient db;
    @Autowired JwtEncoder tokens;
    @Autowired Playbooks playbooks;
    UUID station, other, io, sho, otherSho, fir, otherFir;

    UUID user(String role, UUID st, String name) {
        return db.sql("insert into app_user (station_id, full_name, rank, role, username) values (?,?,'SI',?,?) returning id")
                .params(st, name, role, name.toLowerCase().replace(' ', '.')).query(UUID.class).single();
    }

    UUID station(String name) {
        return db.sql("insert into police_station (state_code, district_id, name) values ('IN', district_id_of('IN','Testpur'), ?) returning id")
                .param(name).query(UUID.class).single();
    }

    UUID fir(UUID st, int no, UUID ioId) {
        return db.sql("""
                insert into fir (station_id, fir_year, fir_no, gd_entry_no, registered_at, information_received_at,
                  contents_original, contents_language, action_taken, io_id)
                values (?,2026,?,'GD-1','2026-10-01T10:00Z','2026-10-01T09:00Z','Fictional complaint text','en','investigate',?) returning id""")
                .params(st, no, ioId).query(UUID.class).single();
    }

    @BeforeEach
    void setUp() {
        db.sql("truncate fir, complaint, police_station, state_pack, app_user cascade").update();
        db.sql("insert into state_pack (code, name, version, languages) values ('IN','National','1',array['en'])").update();
        station = station("Fictional Testpur City PS");
        other = station("Fictional Testpur Rural PS");
        io = user("io", station, "SI Fictional Asha");
        sho = user("sho", station, "Insp Fictional SHO");
        otherSho = user("sho", other, "Insp Fictional Other SHO");
        fir = fir(station, 7, io);
        otherFir = fir(other, 9, user("io", other, "SI Fictional Ravi"));
    }

    String log(UUID who, UUID st) throws Exception {
        return mvc.perform(get("/api/audit-log?stationId=" + st).header("Authorization", TestAuth.bearer(tokens, who)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
    }

    @Test
    void joinsReadsOverridesWithdrawalsAndAdminChangesOfThisStationOnly() throws Exception {
        db.sql("insert into protected_read (reader, station_id, fir_id, fir_ref, what) values (?,?,?,'2026/7','people')").params(io, station, fir).update();
        db.sql("insert into readiness_override (fir_id, gap_key, reason, decided_by) values (?, 'ingredient:cheating/delivery', 'Fictional reason to accept', ?)").params(fir, sho).update();
        db.sql("insert into readiness_override (fir_id, gap_key, reason, decided_by, withdrawn_at, withdrawn_by, withdrawn_reason) values (?, 'certificate:x', 'Fictional first reason', ?, now(), ?, 'Fictional withdrawal reason')")
                .params(fir, sho, sho).update();
        db.sql("insert into admin_action (actor_id, action, user_id, reason) values (?, 'user_disabled', ?, 'Fictional reason: left the force')").params(sho, io).update();
        // another station's rows must not appear
        db.sql("insert into readiness_override (fir_id, gap_key, reason, decided_by) values (?, 'ingredient:other/x', 'Fictional other reason', ?)").params(otherFir, otherSho).update();
        db.sql("insert into protected_read (reader, station_id, fir_id, fir_ref, what) values (?,?,?,'2026/9','fir_text')").params(otherSho, other, otherFir).update();

        var rows = new com.fasterxml.jackson.databind.ObjectMapper().readTree(log(sho, station));
        java.util.List<String> kinds = new java.util.ArrayList<>();
        rows.forEach(r -> kinds.add(r.get("kind").asText()));
        assertThat(kinds).containsExactlyInAnyOrder("protected_read", "override", "override", "override_withdrawn", "admin_action");
        String body = rows.toString();
        assertThat(body).contains("Fictional withdrawal reason").contains("user_disabled").contains("2026/7")
                .doesNotContain("Fictional other reason").doesNotContain("2026/9");
        // newest first
        for (int i = 1; i < rows.size(); i++) assertThat(rows.get(i - 1).get("at").asText()).isGreaterThanOrEqualTo(rows.get(i).get("at").asText());
        // the other station's SHO sees only their own two rows
        assertThat(new com.fasterxml.jackson.databind.ObjectMapper().readTree(log(otherSho, other))).hasSize(2);
        // paging
        mvc.perform(get("/api/audit-log?stationId=" + station + "&limit=2&offset=4").header("Authorization", TestAuth.bearer(tokens, sho)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1));
    }

    @Test
    void onlyThoseWhoAuditTheStationReadIt() throws Exception {
        String url = "/api/audit-log?stationId=" + station;
        for (UUID who : new UUID[] {io, otherSho, user("front_desk", station, "HC Fictional Clerk")})
            mvc.perform(get(url).header("Authorization", TestAuth.bearer(tokens, who))).andExpect(status().isForbidden());
        mvc.perform(get(url)).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/audit-log").header("Authorization", TestAuth.bearer(tokens, sho))).andExpect(status().isBadRequest());
        for (String bad : new String[] {"&limit=0", "&limit=201", "&offset=-1"})
            mvc.perform(get(url + bad).header("Authorization", TestAuth.bearer(tokens, sho))).andExpect(status().isBadRequest());
    }

    String as(UUID who) {
        return TestAuth.bearer(tokens, who);
    }

    /** A complaint at the desk with the text and time of the test's FIRs, so an FIR may be registered from it. */
    UUID complaint(UUID st, UUID by) {
        return db.sql("""
                insert into complaint (station_id, received_at, mode, informant_name, kind, text_original, text_language, recorded_by)
                values (?, '2026-10-01T09:00Z', 'written', 'Fictional Informant', 'other_crime', 'Fictional complaint text', 'en', ?) returning id""")
                .params(st, by).query(UUID.class).single();
    }

    /** The complaint signed by the informant and the FIR registered from it. */
    void registeredAs(UUID complaint, UUID firId, UUID by) {
        db.sql("update complaint set signed_at = now(), signed_recorded_by = ?, outcome = 'fir', fir_id = ?, outcome_at = now(), outcome_by = ? where id = ?")
                .params(by, firId, by, complaint).update();
    }

    com.fasterxml.jackson.databind.JsonNode json(String body) throws Exception {
        return new com.fasterxml.jackson.databind.ObjectMapper().readTree(body);
    }

    @Test
    void theCasesOfAStationAreNumbersOnlyForItsAuditorsAndTheAiGatewayAsksWithTheOfficersToken() throws Exception {
        UUID second = fir(station, 12, io);
        UUID waiting = complaint(station, sho);
        UUID registered = complaint(station, sho);
        registeredAs(registered, fir, sho);
        complaint(other, otherSho);
        var all = json(mvc.perform(get("/api/audit-log/cases?stationId=" + station).header("Authorization", as(sho))).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
        java.util.List<String> got = new java.util.ArrayList<>();
        all.forEach(r -> got.add(r.get("kind").asText() + " " + r.get("id").asText() + " " + r.get("ref").asText("-")));
        // the newest FIR first, a complaint beside the FIR it became, the one still waiting at the end
        assertThat(got).containsExactly("fir " + second + " 2026/12", "fir " + fir + " 2026/7", "complaint " + registered + " 2026/7", "complaint " + waiting + " -");
        assertThat(all.toString()).doesNotContain("Fictional complaint").doesNotContain("Informant").doesNotContain(otherFir.toString());
        // one case: the FIR and the complaint it came from
        var one = json(mvc.perform(get("/api/audit-log/cases?stationId=" + station + "&firId=" + fir).header("Authorization", as(sho))).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
        assertThat(one).hasSize(2);
        mvc.perform(get("/api/audit-log/cases?stationId=" + station + "&firId=" + otherFir).header("Authorization", as(sho))).andExpect(status().isNotFound());
        for (UUID who : new UUID[] {io, otherSho, user("front_desk", station, "HC Fictional Clerk")})
            mvc.perform(get("/api/audit-log/cases?stationId=" + station).header("Authorization", as(who))).andExpect(status().isForbidden());
        mvc.perform(get("/api/audit-log/cases?stationId=" + station)).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/audit-log/cases").header("Authorization", as(sho))).andExpect(status().isBadRequest());
    }

    @Test
    void officersAreNamedOnlyForAnAuditorAndOnlyWithinTheStationsState() throws Exception {
        db.sql("insert into state_pack (code, name, version, languages) values ('MH','Maharashtra','1',array['mr'])").update();
        UUID far = db.sql("insert into police_station (state_code, district_id, name) values ('MH', district_id_of('MH','Farpur'), 'Fictional Far PS') returning id").query(UUID.class).single();
        UUID stranger = user("io", far, "SI Fictional Stranger");
        UUID colleague = user("io", other, "SI Fictional Colleague");
        String url = "/api/audit-log/people?stationId=" + station + "&id=" + io + "&id=" + colleague + "&id=" + stranger + "&id=" + UUID.randomUUID();
        String body = mvc.perform(get(url).header("Authorization", as(sho))).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(json(body)).hasSize(2);
        assertThat(body).contains("SI Fictional Asha").contains("SI Fictional Colleague").doesNotContain("Stranger").doesNotContain("role").doesNotContain("username");
        mvc.perform(get(url).header("Authorization", as(io))).andExpect(status().isForbidden());
        mvc.perform(get(url).header("Authorization", as(otherSho))).andExpect(status().isForbidden());
        mvc.perform(get(url)).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/audit-log/people?stationId=" + station).header("Authorization", as(sho))).andExpect(status().isBadRequest());
        String many = "/api/audit-log/people?stationId=" + station + "&id=" + java.util.stream.Stream.generate(() -> UUID.randomUUID().toString()).limit(201)
                .collect(java.util.stream.Collectors.joining("&id="));
        mvc.perform(get(many).header("Authorization", as(sho))).andExpect(status().isBadRequest());
    }

    org.springframework.test.web.servlet.ResultActions export(UUID who, UUID firId, String reason) throws Exception {
        return mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/audit-log/exports")
                .header("Authorization", as(who)).contentType("application/json")
                .content("{\"firId\":\"" + firId + "\",\"reason\":\"" + reason + "\"}"));
    }

    long exports() {
        return db.sql("select count(*) from audit_export").query(Long.class).single();
    }

    @Test
    void anExportHoldsOneCaseOldestFirstAndIsItselfInTheLog() throws Exception {
        UUID registered = complaint(station, sho);
        registeredAs(registered, fir, sho);
        db.sql("insert into protected_read (reader, station_id, fir_id, fir_ref, what, at) values (?,?,?,'2026/7','fir_text', now() - interval '3 hours')").params(io, station, fir).update();
        db.sql("insert into protected_read (reader, station_id, complaint_id, what, at) values (?,?,?,'complaint', now() - interval '4 hours')").params(sho, station, registered).update();
        db.sql("insert into readiness_override (fir_id, gap_key, reason, decided_by) values (?, 'ingredient:cheating/delivery', 'Fictional reason to accept', ?)").params(fir, sho).update();
        UUID second = fir(station, 12, io);
        db.sql("insert into readiness_override (fir_id, gap_key, reason, decided_by) values (?, 'ingredient:other/x', 'Fictional second-case reason', ?)").params(second, sho).update();
        db.sql("insert into admin_action (actor_id, action, user_id, reason) values (?, 'user_disabled', ?, 'Fictional admin reason here')").params(sho, io).update();

        var out = json(export(sho, fir, "  Fictional Sessions Court asked  ").andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertThat(out.get("fir_ref").asText()).isEqualTo("2026/7");
        assertThat(out.get("station_name").asText()).isEqualTo("Fictional Testpur City PS");
        assertThat(out.get("exported_by_name").asText()).isEqualTo("Insp Fictional SHO");
        assertThat(out.get("reasons_withheld").asBoolean()).isFalse();
        java.util.List<String> kinds = new java.util.ArrayList<>();
        out.get("rows").forEach(r -> kinds.add(r.get("kind").asText() + " " + r.get("what").asText()));
        assertThat(kinds).containsExactly("protected_read complaint", "protected_read fir_text", "override ingredient:cheating/delivery", "audit_export case");
        assertThat(out.get("rows").get(3).get("reason").asText()).isEqualTo("Fictional Sessions Court asked");
        assertThat(out.toString()).doesNotContain("second-case").doesNotContain("admin reason");
        // the station's log shows the export, and a second export holds the first
        assertThat(log(sho, station)).contains("audit_export").contains("Fictional Sessions Court asked");
        assertThat(json(export(sho, fir, "Fictional second request").andReturn().getResponse().getContentAsString()).get("rows")).hasSize(5);
        assertThat(exports()).isEqualTo(2);
    }

    @Test
    void onlyAnAuditorOfTheStationExportsItsCaseAndNeedsAReason() throws Exception {
        for (UUID who : new UUID[] {io, otherSho, user("front_desk", station, "HC Fictional Clerk")})
            export(who, fir, "Fictional court asked for it").andExpect(status().isNotFound());
        export(sho, UUID.randomUUID(), "Fictional court asked for it").andExpect(status().isNotFound());
        export(sho, fir, "short    ").andExpect(status().isBadRequest());
        export(sho, fir, "x".repeat(501)).andExpect(status().isBadRequest());
        export(sho, fir, "   ").andExpect(status().isBadRequest());
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/audit-log/exports")
                .contentType("application/json").content("{}")).andExpect(status().isUnauthorized());
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/audit-log/exports")
                .header("Authorization", as(sho)).contentType("application/json").content("{}")).andExpect(status().isBadRequest());
        assertThat(exports()).isZero();
    }

    @Test
    void onAProtectedCaseSomeoneOutsideTheCaseTeamGetsNoWrittenReasons() throws Exception {
        db.sql("update fir set sexual_offence = true where id = ?").param(fir).update();
        db.sql("insert into readiness_override (fir_id, gap_key, reason, decided_by) values (?, 'certificate:x', 'Fictional reason naming a person', ?)").params(fir, sho).update();
        db.sql("insert into state_pack (code, name, version, languages) values ('MH','Maharashtra','1',array['mr'])").update();
        // the platform admin audits every station but is on no case team
        UUID platform = db.sql("insert into app_user (full_name, rank, role, username) values ('Fictional Platform Admin','Admin','state_admin','platform') returning id").query(UUID.class).single();
        var outside = json(export(platform, fir, "Fictional inquiry asked").andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertThat(outside.get("reasons_withheld").asBoolean()).isTrue();
        assertThat(outside.get("rows")).hasSize(2);
        outside.get("rows").forEach(r -> assertThat(r.get("reason").isNull()).isTrue());
        var team = json(export(sho, fir, "Fictional court asked for it").andReturn().getResponse().getContentAsString());
        assertThat(team.get("reasons_withheld").asBoolean()).isFalse();
        assertThat(team.toString()).contains("Fictional reason naming a person");
    }

    @Test
    void anAcceptedGapSaysWhatItWasAboutByLabelAndNeverByName() throws Exception {
        db.sql("insert into case_playbook (fir_id, playbook_id, playbook_version, chosen_by) values (?, 'cyber-fraud', '1', ?)").params(fir, io).update();
        UUID holder = db.sql("insert into person (fir_id, role, label, full_name) values (?,'accused','A2','Fictional Holder Name') returning id")
                .param(fir).query(UUID.class).single();
        UUID item = db.sql("""
                insert into evidence_item (fir_id, label, description, kind, seized_at, seizure_memo, sha256)
                values (?, '7/E-01', 'Fictional phone description', 'electronic', '2026-10-02T10:00Z', 'SM-1', repeat('a', 64)) returning id""")
                .param(fir).query(UUID.class).single();
        UUID notice = db.sql("""
                insert into notice (fir_id, kind, addressee, items_requested, body, status, signed_by, issued_at, reply_due_on)
                values (?, 'BNSS_94', 'Fictional Bank', array['statement'], 'Fictional notice body', 'sent', ?, '2026-10-03T20:00Z', '2026-10-10') returning id""")
                .params(fir, io).query(UUID.class).single();
        // the stored key of each kind of gap, and what the log says it was about
        var expected = new java.util.LinkedHashMap<String, String>();
        expected.put("second-link:" + holder, "A2");
        expected.put("certificate:" + item, "7/E-01");
        expected.put("notice-certificate:" + notice, "4 Oct 2026"); // 20:00 UTC is already the next day in India
        expected.put("section-report:IT Act 66D", "IT Act 66D");
        expected.put("pocso-step:support_person", "support_person");
        expected.put("pocso-section", null);
        expected.put("certificate:" + UUID.randomUUID(), null); // the record is gone: the key alone is left
        expected.put("ingredient:no-such/charge", null);
        for (String key : expected.keySet())
            db.sql("insert into readiness_override (fir_id, gap_key, reason, decided_by) values (?,?,'Fictional reason to accept',?)").params(fir, key, sho).update();
        var charge = playbooks.get("cyber-fraud").orElseThrow().charges().get(0);
        String ingredientKey = "ingredient:" + charge.id() + "/" + charge.ingredients().get(0).id();
        db.sql("insert into readiness_override (fir_id, gap_key, reason, decided_by) values (?,?,'Fictional reason to accept',?)").params(fir, ingredientKey, sho).update();
        expected.put(ingredientKey, charge.ingredients().get(0).text() + " (" + charge.law() + ")");
        // a row that is not a gap says nothing more
        db.sql("insert into protected_read (reader, station_id, fir_id, fir_ref, what) values (?,?,?,'2026/7','people')").params(io, station, fir).update();

        for (String body : new String[] {log(sho, station), export(sho, fir, "Fictional court asked for it").andReturn().getResponse().getContentAsString()}) {
            var parsed = json(body);
            var rows = parsed.isArray() ? parsed : parsed.get("rows");
            var about = new java.util.HashMap<String, String>();
            rows.forEach(r -> {
                assertThat(r.has("about")).isTrue();
                assertThat(r.has("playbook_id")).isFalse();
                about.put(r.get("what").asText(), r.get("about").isNull() ? null : r.get("about").asText());
            });
            expected.forEach((key, value) -> assertThat(about).containsEntry(key, value));
            assertThat(about).containsEntry("people", null);
            assertThat(body).doesNotContain("Holder Name").doesNotContain("phone description").doesNotContain("Fictional Bank");
        }
    }
}
