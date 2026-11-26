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

/** The FIR copy paper's data (item 18, {@link FirCopyController}). Fictional data only. */
@SpringBootTest
@AutoConfigureMockMvc
class FirCopyApiTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcClient db;
    @Autowired ObjectMapper json;
    @Autowired JwtEncoder tokens;
    UUID station, io, sho, desk, outsider, fir;

    UUID user(UUID st, String role, String name) {
        return db.sql("insert into app_user (station_id, full_name, rank, role) values (?,?,'SI',?) returning id").params(st, name, role).query(UUID.class).single();
    }

    UUID station(String district, String name) {
        return db.sql("insert into police_station (state_code, district_id, name) values ('IN', district_id_of('IN',?), ?) returning id")
                .params(district, name).query(UUID.class).single();
    }

    UUID fir(int no, String registered) {
        return db.sql("""
                insert into fir (station_id, fir_year, fir_no, gd_entry_no, registered_at, information_received_at, occurrence_from, occurrence_place,
                  contents_original, contents_language, action_taken, io_id)
                values (?, 2026, ?, 'GD-7', ?::timestamptz, ?::timestamptz - interval '1 hour', ?::timestamptz - interval '2 days',
                  'Fictional Market Road', 'Fictional information as given', 'en', 'investigate', ?) returning id""")
                .params(station, no, registered, registered, registered, io).query(UUID.class).single();
    }

    @BeforeEach
    void setUp() {
        db.sql("truncate fir, complaint, police_station, state_pack, app_user cascade").update();
        db.sql("insert into state_pack (code, name, version, languages) values ('IN','National','1',array['en'])").update();
        station = station("North", "Fictional North PS");
        io = user(station, "io", "SI Fictional First");
        sho = user(station, "sho", "Insp Fictional Head");
        desk = user(station, "front_desk", "HC Fictional Desk");
        outsider = user(station("South", "Fictional South PS"), "io", "SI Fictional Far");
        fir = fir(5, "2026-10-01T10:00:00Z");
        db.sql("insert into fir_io_assignment (fir_id, to_io, assigned_by) values (?,?,?)").params(fir, io, sho).update();
        db.sql("insert into fir_section (fir_id, act, section) values (?,'BNS','318(4)'), (?,'BNS','319(2)')").params(fir, fir).update();
    }

    void person(UUID firId, String role, String label, String name, boolean masked) {
        db.sql("""
                insert into person (fir_id, role, label, full_name, parentage, age_years, gender, address_present, phone, identity_masked)
                values (?,?,?,?,'S/o Fictional Parent', 52, 'M', 'Fictional Lane', '9000000001', ?)""")
                .params(firId, role, label, name, masked).update();
    }

    JsonNode copy(UUID who, UUID firId) throws Exception {
        return json.readTree(mvc.perform(get("/api/firs/" + firId + "/copy").header("Authorization", TestAuth.bearer(tokens, who)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }

    @Test
    void theCopyHoldsTheReportAsRegisteredNotWhatCameLater() throws Exception {
        person(fir, "complainant", "C1", "Fictional Complainant", false);
        person(fir, "accused", "A1", "Fictional Accused Later", false);
        db.sql("insert into fir_section (fir_id, act, section, added_at, chosen_by, reason) values (?,'IT Act','66D', now(), ?, 'Fictional reason for the added section')")
                .params(fir, io).update();
        // another officer takes over later
        UUID second = user(station, "io", "SI Fictional Second");
        db.sql("update fir set io_id = ? where id = ?").params(second, fir).update();
        db.sql("insert into fir_io_assignment (fir_id, from_io, to_io, assigned_by, reason, at) values (?,?,?,?,'Fictional transfer of duty', now() + interval '1 minute')")
                .params(fir, io, second, sho).update();

        var out = copy(second, fir);
        var head = out.get("head");
        assertThat(out.get("withheld").asBoolean()).isFalse();
        assertThat(head.get("sections").asText()).isEqualTo("BNS 318(4), BNS 319(2)");
        assertThat(head.get("later_sections").asInt()).isEqualTo(1);
        assertThat(head.get("io_name").asText()).isEqualTo("SI Fictional First");
        assertThat(head.get("law").asText()).isEqualTo("bnss");
        assertThat(head.get("station").asText()).isEqualTo("Fictional North PS");
        assertThat(head.get("district").asText()).isEqualTo("North");
        assertThat(head.get("gd_entry_no").asText()).isEqualTo("GD-7");
        assertThat(head.get("contents_original").asText()).isEqualTo("Fictional information as given");
        assertThat(head.get("occurrence_place").asText()).isEqualTo("Fictional Market Road");
        // a typed FIR: the complainant of the case is the informant; the accused are not listed
        assertThat(out.get("complaint").isNull()).isTrue();
        assertThat(out.get("informants")).hasSize(1);
        assertThat(out.get("informants").get(0).get("name").asText()).isEqualTo("Fictional Complainant");
        assertThat(out.get("informants").get(0).get("contact").asText()).isEqualTo("9000000001");
        assertThat(out.toString()).doesNotContain("Accused Later").doesNotContain("66D").doesNotContain("Second");
    }

    @Test
    void anFirFromASignedComplaintNamesWhoSignedIt() throws Exception {
        db.sql("""
                insert into complaint (station_id, received_at, mode, informant_name, informant_contact, kind, text_original, text_language, recorded_by,
                  signed_at, signed_recorded_by, outcome, fir_id, outcome_at, outcome_by)
                values (?, '2026-10-01T09:00Z', 'written', 'Fictional Informant', '9000000002', 'other_crime', 'Fictional information as given', 'en', ?,
                  now(), ?, 'fir', ?, now(), ?)""").params(station, desk, desk, fir, desk).update();
        person(fir, "complainant", "C1", "Fictional Complainant", false);
        var out = copy(io, fir);
        assertThat(out.get("complaint").get("name").asText()).isEqualTo("Fictional Informant");
        assertThat(out.get("complaint").get("mode").asText()).isEqualTo("written");
        assertThat(out.get("complaint").get("contact").asText()).isEqualTo("9000000002");
        assertThat(out.get("complaint").get("signed_recorded_by_name").asText()).isEqualTo("HC Fictional Desk");
        assertThat(out.get("informants")).isEmpty();
    }

    @Test
    void anFirOfBeforeJuly2024InIndiaIsUnderTheCrpc() throws Exception {
        // 18:29 UTC on 30 June is 23:59 IST of that day; 18:30 UTC is 1 July in India
        assertThat(copy(sho, fir(6, "2024-06-30T18:29:00Z")).get("head").get("law").asText()).isEqualTo("crpc");
        assertThat(copy(sho, fir(7, "2024-06-30T18:30:00Z")).get("head").get("law").asText()).isEqualTo("bnss");
        // an FIR with no officer assigned yet names none
        assertThat(copy(sho, fir(8, "2026-10-01T10:00:00Z")).get("head").get("io_name").isNull()).isTrue();
    }

    @Test
    void onAProtectedCaseOrWithAMaskedPersonNoNamePlaceOrTextLeavesTheServer() throws Exception {
        person(fir, "complainant", "C1", "Fictional Complainant", false);
        db.sql("update fir set sexual_offence = true, action_taken = 'refused', action_reason = 'Fictional reason naming the person', is_zero_fir = true, outside_limits_place = 'Fictional Far Village' where id = ?")
                .param(fir).update();
        UUID masked = fir(9, "2026-10-01T10:00:00Z");   // an ordinary case with one person masked by hand
        person(masked, "complainant", "C1", "Fictional Complainant", false);
        person(masked, "witness", "W1", "Fictional Hidden Witness", true);
        db.sql("""
                insert into complaint (station_id, received_at, mode, informant_name, kind, text_original, text_language, recorded_by,
                  signed_at, signed_recorded_by, outcome, fir_id, outcome_at, outcome_by)
                values (?, '2026-10-01T09:00Z', 'written', 'Fictional Informant', 'other_crime', 'Fictional information as given', 'en', ?,
                  now(), ?, 'fir', ?, now(), ?)""").params(station, desk, desk, masked, desk).update();
        for (UUID each : new UUID[] {fir, masked}) {
            var out = copy(sho, each);
            assertThat(out.get("withheld").asBoolean()).isTrue();
            assertThat(out.get("complaint").isNull()).isTrue();
            assertThat(out.get("informants")).isEmpty();
            for (String hidden : new String[] {"contents_original", "occurrence_place", "outside_limits_place", "action_reason"})
                assertThat(out.get("head").get(hidden).isNull()).as(hidden).isTrue();
            assertThat(out.toString()).doesNotContain("Complainant").doesNotContain("Informant").doesNotContain("Witness").doesNotContain("Market Road")
                    .doesNotContain("information as given").doesNotContain("Far Village").doesNotContain("naming the person").doesNotContain("9000000001");
            assertThat(out.get("head").get("sections").asText()).isNotNull();
        }
    }

    @Test
    void onlyTheCaseTeamTakesACopy() throws Exception {
        for (UUID who : new UUID[] {outsider, desk, user(station, "io", "SI Fictional Other")})
            mvc.perform(get("/api/firs/" + fir + "/copy").header("Authorization", TestAuth.bearer(tokens, who))).andExpect(status().isNotFound());
        mvc.perform(get("/api/firs/" + fir + "/copy")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/firs/" + UUID.randomUUID() + "/copy").header("Authorization", TestAuth.bearer(tokens, sho))).andExpect(status().isNotFound());
    }
}
