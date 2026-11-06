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
}
