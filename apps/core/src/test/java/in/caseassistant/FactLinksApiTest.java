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
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

/** Identifiers of an FIR seen in other FIRs of its station (board 2, A1, V65). Fictional data only. */
@SpringBootTest
@AutoConfigureMockMvc
class FactLinksApiTest {
    static final String REQ = "7d0c3f1e-2b4a-4c55-9a77-0f1e2d3c4b5a";

    @Autowired MockMvc mvc;
    @Autowired JdbcClient db;
    @Autowired org.springframework.security.oauth2.jwt.JwtEncoder tokens;
    UUID north, south, ioA, ioB, fir1, fir2, fir3;
    String a, b, sho, desk, southIo;

    UUID user(UUID st, String role) {
        return db.sql("insert into app_user (station_id, full_name, rank, role) values (?,?,'SI',?) returning id").params(st, "Fictional " + role, role).query(UUID.class).single();
    }

    UUID fir(UUID station, UUID io, String text, boolean protectedCase) {
        return db.sql("""
                insert into fir (station_id, fir_year, fir_no, gd_entry_no, registered_at, information_received_at, contents_original, contents_language, action_taken, io_id, identity_protected)
                values (?,2026,(select coalesce(max(fir_no),0)+1 from fir),'GD-1','2026-10-29T10:00Z','2026-10-29T09:00Z',?,'en','investigate',?,?) returning id""")
                .params(station, text, io, protectedCase).query(UUID.class).single();
    }

    void fact(UUID firId, String kind, String value, UUID by) {
        db.sql("insert into fir_fact (fir_id, kind, value, ai_value, quote, ai_request_id, confirmed_by) values (?,?,?,?,?,?,?)")
                .params(firId, kind, value, value, value, UUID.fromString(REQ), by).update();
    }

    int no(UUID firId) {
        return db.sql("select fir_no from fir where id = ?").param(firId).query(Integer.class).single();
    }

    ResultActions links(UUID firId, String who) throws Exception {
        return mvc.perform(get("/api/firs/" + firId + "/facts/links").header("Authorization", who));
    }

    @BeforeEach
    void setUp() {
        db.sql("truncate fir, police_station, state_pack, app_user cascade").update();
        db.sql("insert into state_pack (code, name, version, languages) values ('IN','National','1',array['en'])").update();
        north = db.sql("insert into police_station (state_code, district_id, name) values ('IN',district_id_of('IN','North'),'Fictional North PS') returning id").query(UUID.class).single();
        south = db.sql("insert into police_station (state_code, district_id, name) values ('IN',district_id_of('IN','South'),'Fictional South PS') returning id").query(UUID.class).single();
        ioA = user(north, "io");
        ioB = user(north, "io");
        UUID ioSouth = user(south, "io");
        a = TestAuth.bearer(tokens, ioA);
        b = TestAuth.bearer(tokens, ioB);
        sho = TestAuth.bearer(tokens, user(north, "sho"));
        desk = TestAuth.bearer(tokens, user(north, "front_desk"));
        southIo = TestAuth.bearer(tokens, ioSouth);
        fir1 = fir(north, ioA, "A call came from +91 98765 41207. Rs 40,000 went to A/c SBIN00123456789 by UTR 612345678901.", false);
        fact(fir1, "phone", "+91 98765 41207", ioA);
        fact(fir1, "account", "SBIN00123456789", ioA);
        fact(fir1, "utr", "612345678901", ioA);
        fir2 = fir(north, ioB, "The caller used 098765-41207.", false);       // B's case: the same phone
        fact(fir2, "phone", "098765-41207", ioB);
        fir3 = fir(north, ioA, "Money went to sbin 0012-3456/789.", false);   // A's own case: the same account
        fact(fir3, "account", "sbin 0012-3456/789", ioA);
        // not links: another station, a masked number, another kind with the same digits
        UUID far = fir(south, ioSouth, "Call from 9876541207.", false);
        fact(far, "phone", "9876541207", ioSouth);
        UUID masked = fir(north, ioB, "A/c XXXX56789 and 98XXX 41207.", false);
        fact(masked, "account", "XXXX56789", ioB);
        fact(masked, "phone", "98XXX 41207", ioB);
        UUID otherKind = fir(north, ioB, "Ref 9876541207.", false);
        fact(otherKind, "utr", "9876541207", ioB);
    }

    @Test
    void theIoSeesTheirOwnLinkedCaseByNumberAndOnlyACountOfOthers() throws Exception {
        links(fir1, a).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].kind").value("phone")).andExpect(jsonPath("$[0].value").value("+91 98765 41207"))
                .andExpect(jsonPath("$[0].firs.length()").value(0)).andExpect(jsonPath("$[0].others").value(1))
                .andExpect(jsonPath("$[1].kind").value("account"))
                .andExpect(jsonPath("$[1].firs.length()").value(1)).andExpect(jsonPath("$[1].firs[0].id").value(fir3.toString()))
                .andExpect(jsonPath("$[1].firs[0].fir_no").value(no(fir3))).andExpect(jsonPath("$[1].firs[0].fir_year").value(2026))
                .andExpect(jsonPath("$[1].others").value(0));
        // the other FIR's own values are not sent
        String body = links(fir1, a).andReturn().getResponse().getContentAsString();
        assertThat(body).doesNotContain("098765-41207").doesNotContain("sbin 0012");
    }

    @Test
    void theShoOfTheStationSeesEveryLinkByNumberAndTheLinkWorksBothWays() throws Exception {
        links(fir1, sho).andExpect(jsonPath("$[0].firs[0].id").value(fir2.toString())).andExpect(jsonPath("$[0].others").value(0));
        links(fir2, b).andExpect(jsonPath("$.length()").value(1)).andExpect(jsonPath("$[0].value").value("098765-41207"))
                .andExpect(jsonPath("$[0].firs.length()").value(0)).andExpect(jsonPath("$[0].others").value(1));
        links(fir2, sho).andExpect(jsonPath("$[0].firs[0].id").value(fir1.toString()));
    }

    @Test
    void noLinkFromOrToACaseThatProtectsTheVictimsIdentity() throws Exception {
        UUID hidden = fir(north, ioA, "A call from 9876541207.", false);
        fact(hidden, "phone", "9876541207", ioA);
        links(fir1, a).andExpect(jsonPath("$[0].firs[0].id").value(hidden.toString()));
        db.sql("update fir set identity_protected = true where id = ?").param(hidden).update();
        links(fir1, a).andExpect(jsonPath("$[0].firs.length()").value(0)).andExpect(jsonPath("$[0].others").value(1));
        links(hidden, a).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
        assertThat(db.sql("select count(*) from protected_read").query(Long.class).single()).isZero();
    }

    @Test
    void aFactWithoutAMatchIsNotListedAndACaseWithoutFactsHasNoLinks() throws Exception {
        links(fir1, a).andExpect(jsonPath("$[?(@.kind == 'utr')]").isEmpty());
        UUID empty = fir(north, ioA, "Nothing here.", false);
        links(empty, a).andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void onlyTheCaseTeamAsks() throws Exception {
        links(fir1, desk).andExpect(status().isNotFound());
        links(fir1, southIo).andExpect(status().isNotFound());
        links(fir1, b).andExpect(status().isNotFound());
        mvc.perform(get("/api/firs/" + fir1 + "/facts/links")).andExpect(status().isUnauthorized());
    }
}
