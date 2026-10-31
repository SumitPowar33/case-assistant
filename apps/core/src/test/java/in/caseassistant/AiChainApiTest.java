package in.caseassistant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

/** The AI gateway's chain head kept in the core database (V35): only the gateway reports, it only moves forward, admins read it. */
@SpringBootTest
@AutoConfigureMockMvc
class AiChainApiTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcClient db;
    @Autowired JwtEncoder tokens;
    @Value("${auth.secret}") String secret;
    String admin, io;
    static final String H1 = "a".repeat(64), H2 = "b".repeat(64), H3 = "c".repeat(64);

    String user(String role, UUID station) {
        return TestAuth.bearer(tokens, db.sql("insert into app_user (station_id, full_name, rank, role) values (?,'Fictional User','Insp',?) returning id")
                .params(station, role).query(UUID.class).single());
    }

    @BeforeEach
    void setUp() {
        db.sql("truncate fir, police_station, state_pack, app_user cascade").update();
        db.sql("insert into state_pack (code, name, version, languages) values ('IN','National','1',array['en'])").update();
        UUID station = db.sql("insert into police_station (state_code, district_id, name) values ('IN',district_id_of('IN','North'),'Fictional North PS') returning id")
                .query(UUID.class).single();
        admin = user("state_admin", station);
        io = user("io", station);
    }

    ResultActions report(String bearer, long seq, String hash, String mac) throws Exception {
        var req = post("/api/ai-chain-head").header("Authorization", bearer).contentType(MediaType.APPLICATION_JSON)
                .content("{\"seq\":" + seq + ",\"hash\":\"" + hash + "\"}");
        return mvc.perform(mac == null ? req : req.header("X-Chain-Mac", mac));
    }

    String mac(long seq, String hash) {
        return AiChainController.mac(secret.getBytes(StandardCharsets.UTF_8), seq, hash);
    }

    @Test
    void theGatewayReportsHeadsThatOnlyMoveForwardAndAnAdminReadsTheNewest() throws Exception {
        mvc.perform(get("/api/ai-chain-head").header("Authorization", admin)).andExpect(status().isOk()).andExpect(content().json("{}"));
        report(io, 2, H1, mac(2, H1)).andExpect(status().isOk()).andExpect(jsonPath("$.kept").value(true));
        report(io, 5, H2, mac(5, H2)).andExpect(status().isOk()).andExpect(jsonPath("$.kept").value(true));
        report(io, 4, H3, mac(4, H3)).andExpect(status().isOk()).andExpect(jsonPath("$.kept").value(false));   // late, older
        report(io, 5, H3, mac(5, H3)).andExpect(status().isOk()).andExpect(jsonPath("$.kept").value(false));   // same seq, other hash
        mvc.perform(get("/api/ai-chain-head").header("Authorization", admin)).andExpect(status().isOk())
                .andExpect(jsonPath("$.seq").value(5)).andExpect(jsonPath("$.hash").value(H2));
        assertThat(db.sql("select count(*) from ai_chain_anchor").query(Long.class).single()).isEqualTo(2);
    }

    @Test
    void anOfficerWithoutTheGatewaysKeyCannotReportAHead() throws Exception {
        report(io, 9, H1, null).andExpect(status().isForbidden())
                .andExpect(status().reason("Only the AI gateway can report its audit chain head."));
        report(io, 9, H1, mac(9, H2)).andExpect(status().isForbidden());    // a mac of another hash
        report(io, 9, H1, mac(8, H1)).andExpect(status().isForbidden());    // a mac of another seq
        report(io, 9, H1, "0".repeat(64)).andExpect(status().isForbidden());
        report("Bearer nonsense", 9, H1, mac(9, H1)).andExpect(status().isUnauthorized());
        assertThat(db.sql("select count(*) from ai_chain_anchor").query(Long.class).single()).isZero();
    }

    @Test
    void theCoreChecksTheSameMacAsTheGateway() {
        // the same value test_the_chain_anchor_signs_each_head_and_fails_closed_on_reading expects from the gateway
        assertThat(AiChainController.mac("test-only-signing-key-not-used-anywhere-else".getBytes(StandardCharsets.UTF_8), 7, "a".repeat(64)))
                .isEqualTo("6eaa19a834b909aadf19904690dff595b17cf8ee28e7030e9af1549523ff9598");
    }

    @Test
    void badHeadsAreRefusedAndOnlyAnAdminReads() throws Exception {
        report(io, 0, H1, mac(0, H1)).andExpect(status().isBadRequest());
        report(io, 3, "ABC", mac(3, "ABC")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/ai-chain-head").header("Authorization", io)).andExpect(status().isForbidden());
    }

    @Test
    void theDatabaseKeepsHeadsAsWrittenAndOnlyForward() {
        UUID by = db.sql("select id from app_user where role = 'io'").query(UUID.class).single();
        db.sql("insert into ai_chain_anchor (seq, hash, reported_by) values (3, ?, ?)").params(H1, by).update();
        assertThatThrownBy(() -> db.sql("insert into ai_chain_anchor (seq, hash, reported_by) values (2, ?, ?)").params(H2, by).update())
                .hasMessageContaining("only moves forward");
        assertThatThrownBy(() -> db.sql("update ai_chain_anchor set hash = ?").param(H2).update()).hasMessageContaining("kept as written");
        assertThatThrownBy(() -> db.sql("delete from ai_chain_anchor").update()).hasMessageContaining("kept as written");
    }
}
