package in.caseassistant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
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

/** The vectors of the pieces of a case file (item 17, V58): kept per case and model, for the case team only. Fictional data only. */
@SpringBootTest
@AutoConfigureMockMvc
class CaseVectorApiTest {
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

    static final String H1 = "aaaaaaaaaaaaaaaa", H2 = "bbbbbbbbbbbbbbbb", H3 = "cccccccccccccccc";

    String keep(String who, UUID id, String model, String keep, String items, int status) throws Exception {
        return mvc.perform(put("/api/firs/" + id + "/case-file/vectors").header("Authorization", who).contentType(MediaType.APPLICATION_JSON)
                .content("{\"model\":\"" + model + "\",\"keep\":" + keep + ",\"items\":" + items + "}")).andExpect(status().is(status))
                .andReturn().getResponse().getContentAsString();
    }

    JsonNode read(String who, UUID id, String model) throws Exception {
        return json.readTree(mvc.perform(get("/api/firs/" + id + "/case-file/vectors?model=" + model).header("Authorization", who)).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
    }

    @Test
    void theTeamKeepsAndReadsVectorsAndAnOldOneIsReplaced() throws Exception {
        keep(io, fir, "m/1", "[\"" + H1 + "\",\"" + H2 + "\"]", "[{\"hash\":\"" + H1 + "\",\"vec\":[0.5,-0.25,1.0]},{\"hash\":\"" + H2 + "\",\"vec\":[0,0,1]}]", 200);
        JsonNode out = read(io, fir, "m/1");
        assertThat(out.get("items")).hasSize(2);
        assertThat(out.get("items").get(0).get("vec").get(1).asDouble()).isEqualTo(-0.25);
        keep(io, fir, "m/1", "[\"" + H1 + "\",\"" + H2 + "\"]", "[{\"hash\":\"" + H1 + "\",\"vec\":[1,2,3]}]", 200);
        assertThat(read(io, fir, "m/1").get("items").get(0).get("vec").get(2).asDouble()).isEqualTo(3.0);
        assertThat(read(io, fir, "m/1").get("items")).hasSize(2);
    }

    @Test
    void vectorsOfPiecesThatAreGoneAreRemovedAndAnotherCaseIsNotTouched() throws Exception {
        keep(io, fir, "m/1", "[\"" + H1 + "\",\"" + H2 + "\"]", "[{\"hash\":\"" + H1 + "\",\"vec\":[1]},{\"hash\":\"" + H2 + "\",\"vec\":[2]}]", 200);
        keep(io, other, "m/1", "[\"" + H1 + "\"]", "[{\"hash\":\"" + H1 + "\",\"vec\":[3]}]", 200);
        String out = keep(io, fir, "m/1", "[\"" + H2 + "\"]", "[]", 200);
        assertThat(json.readTree(out).get("removed").asInt()).isOne();
        assertThat(read(io, fir, "m/1").get("items")).hasSize(1);
        keep(io, fir, "m/1", "[]", "[]", 200);
        assertThat(read(io, fir, "m/1").get("items")).isEmpty();
        assertThat(read(io, other, "m/1").get("items")).hasSize(1);   // the other case keeps its own
        db.sql("delete from fir where id = ?").param(other).update();
        assertThat(db.sql("select count(*) from case_passage_vector").query(Long.class).single()).isZero();
    }

    /** Weekly review 21 Nov: a case holds the vectors of one model; a write under a new name removes the others, so model names
     * cannot be used to fill the database. */
    @Test
    void aCaseKeepsTheVectorsOfOneModelOnly() throws Exception {
        keep(io, fir, "m/1", "[\"" + H1 + "\"]", "[{\"hash\":\"" + H1 + "\",\"vec\":[1]}]", 200);
        String out = keep(io, fir, "m/2", "[\"" + H1 + "\"]", "[{\"hash\":\"" + H1 + "\",\"vec\":[3]}]", 200);
        assertThat(json.readTree(out).get("removed").asInt()).isOne();
        assertThat(read(io, fir, "m/1").get("items")).isEmpty();
        assertThat(read(io, fir, "m/2").get("items")).hasSize(1);
        assertThat(db.sql("select count(*) from case_passage_vector where fir_id = ?").param(fir).query(Long.class).single()).isOne();
    }

    /** Weekly review 21 Nov: vectors are made from the text of a protected case, so the team's read of them is logged as the text's is. */
    @Test
    void readingTheVectorsOfAProtectedCaseIsLogged() throws Exception {
        keep(io, fir, "m/1", "[\"" + H1 + "\"]", "[{\"hash\":\"" + H1 + "\",\"vec\":[1]}]", 200);
        read(io, fir, "m/1");
        assertThat(db.sql("select count(*) from protected_read").query(Long.class).single()).isZero();   // not protected: nothing logged
        db.sql("update fir set identity_protected = true where id = ?").param(fir).update();
        read(io, fir, "m/1");
        assertThat(db.sql("select count(*) from protected_read where fir_id = ? and reader = ?").params(fir, ioId).query(Long.class).single()).isOne();
        read(io, fir, "m/none");   // no vectors read: nothing to log
        assertThat(db.sql("select count(*) from protected_read").query(Long.class).single()).isOne();
    }

    @Test
    void badBodiesAreRefused() throws Exception {
        String ok = "{\"hash\":\"" + H1 + "\",\"vec\":[1,2]}";
        keep(io, fir, "m/1", "[]", "[" + ok + ",{\"hash\":\"" + H2 + "\",\"vec\":[1]}]", 400);            // two lengths
        keep(io, fir, "m/1", "[]", "[{\"hash\":\"" + H1 + "\",\"vec\":[]}]", 400);                         // empty vector
        keep(io, fir, "m/1", "[]", "[{\"hash\":\"{x}\",\"vec\":[1]}]", 400);                               // a hash that is not hex
        keep(io, fir, "m/1", "[\"a,b\"]", "[]", 400);                                                         // keep that is not a hash
        keep(io, fir, "m bad", "[]", "[]", 400);                                                              // a model name with a space
        keep(io, fir, "m/1", "[]", "[" + ok.replace(H1, H3) + "]", 200);
        String many = "[" + ("{\"hash\":\"" + H1 + "\",\"vec\":[1]},").repeat(64) + "{\"hash\":\"" + H1 + "\",\"vec\":[1]}]";
        keep(io, fir, "m/1", "[]", many, 400);                                                                 // 65 items
        keep(io, fir, "m/1", "[]", "[{\"hash\":\"" + H1 + "\",\"vec\":[" + "1,".repeat(1024) + "1]}]", 400);   // 1025 numbers
        mvc.perform(get("/api/firs/" + fir + "/case-file/vectors?model=m%20x").header("Authorization", io)).andExpect(status().isBadRequest());
    }

    @Test
    void onlyTheCaseTeamReadsOrWrites() throws Exception {
        keep(io, fir, "m/1", "[\"" + H1 + "\"]", "[{\"hash\":\"" + H1 + "\",\"vec\":[1]}]", 200);
        for (String who : new String[] {outsider, desk}) {
            mvc.perform(get("/api/firs/" + fir + "/case-file/vectors?model=m/1").header("Authorization", who)).andExpect(status().isNotFound());
            keep(who, fir, "m/1", "[]", "[]", 403);   // a write by a user outside the case team is refused as other writes are
        }
        assertThat(read(io, fir, "m/1").get("items")).hasSize(1);
        mvc.perform(get("/api/firs/" + fir + "/case-file/vectors?model=m/1")).andExpect(status().isUnauthorized());
    }
}
