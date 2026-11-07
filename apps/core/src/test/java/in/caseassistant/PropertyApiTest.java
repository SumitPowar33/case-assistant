package in.caseassistant;

import static org.assertj.core.api.Assertions.assertThat;
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

/** Case property register (V43, design board 15): who sees which items, where each one is, the hand-over place. Fictional data only. */
@SpringBootTest
@AutoConfigureMockMvc
class PropertyApiTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcClient db;
    @Autowired org.springframework.security.oauth2.jwt.JwtEncoder tokens;
    UUID station, otherStation, fir, otherFir;
    String io, otherIo, malkhana, farMalkhana, desk, sho;

    UUID user(UUID st, String role) {
        return db.sql("insert into app_user (station_id, full_name, rank, role) values (?,?,'SI',?) returning id").params(st, "Fictional " + role, role).query(UUID.class).single();
    }

    UUID fir(UUID st, int no, UUID ioId) {
        return db.sql("""
                insert into fir (station_id, fir_year, fir_no, gd_entry_no, registered_at, information_received_at, contents_original, contents_language, action_taken, io_id)
                values (?,2026,?,'GD-1','2026-10-01T10:00Z','2026-10-01T09:00Z','Fictional complaint','en','investigate',?) returning id""").params(st, no, ioId).query(UUID.class).single();
    }

    UUID item(UUID firId, String label, String kind) {
        return db.sql("""
                insert into evidence_item (fir_id, label, description, kind, seized_at, seizure_memo, sha256)
                values (?,?,'Fictional item',?,'2026-10-02T10:00Z','SM-1',?) returning id""").params(firId, label, kind, "electronic".equals(kind) ? "a".repeat(64) : null).query(UUID.class).single();
    }

    @BeforeEach
    void setUp() {
        db.sql("truncate fir, police_station, state_pack, app_user cascade").update();
        db.sql("insert into state_pack (code, name, version, languages) values ('IN','National','1',array['en'])").update();
        station = db.sql("insert into police_station (state_code, district_id, name) values ('IN',district_id_of('IN','North'),'Fictional North PS') returning id").query(UUID.class).single();
        otherStation = db.sql("insert into police_station (state_code, district_id, name) values ('IN',district_id_of('IN','South'),'Fictional South PS') returning id").query(UUID.class).single();
        UUID ioId = user(station, "io"), otherIoId = user(otherStation, "io");
        io = TestAuth.bearer(tokens, ioId);
        otherIo = TestAuth.bearer(tokens, otherIoId);
        malkhana = TestAuth.bearer(tokens, user(station, "malkhana"));
        farMalkhana = TestAuth.bearer(tokens, user(otherStation, "malkhana"));
        desk = TestAuth.bearer(tokens, user(station, "front_desk"));
        sho = TestAuth.bearer(tokens, user(station, "sho"));
        fir = fir(station, 1, ioId);
        otherFir = fir(otherStation, 1, otherIoId);
    }

    ResultActions handOver(String who, UUID firId, UUID itemId, String place) throws Exception {
        String p = place == null ? "" : ",\"place\":\"" + place + "\"";
        return mvc.perform(post("/api/firs/" + firId + "/evidence/" + itemId + "/custody").header("Authorization", who).contentType(MediaType.APPLICATION_JSON)
                .content("{\"at\":\"2026-10-03T11:00:00Z\",\"handedBy\":\"SI Fictional\",\"receivedBy\":\"HC Fictional Store\",\"location\":\"Fictional place\",\"purpose\":\"test\",\"sealIntact\":true" + p + "}"));
    }

    @Test
    void theRegisterListsPhysicalItemsWithTheirPlaceFromTheNewestHandOver() throws Exception {
        UUID inStore = item(fir, "E-01", "physical"), atLab = item(fir, "E-02", "physical"), back = item(fir, "E-03", "physical");
        UUID moved = item(fir, "E-04", "physical"), noPlace = item(fir, "E-05", "physical"), untouched = item(fir, "E-06", "physical");
        item(fir, "E-07", "electronic");   // not property: it has a hash and certificates, not a place
        handOver(io, fir, inStore, "malkhana").andExpect(status().isCreated());
        handOver(io, fir, atLab, "malkhana").andExpect(status().isCreated());
        handOver(io, fir, atLab, "lab").andExpect(status().isCreated());   // the newest hand-over decides
        handOver(io, fir, back, "court").andExpect(status().isCreated());
        handOver(io, fir, back, "owner").andExpect(status().isCreated());
        handOver(io, fir, moved, "other").andExpect(status().isCreated());
        handOver(io, fir, noPlace, null).andExpect(status().isCreated());   // a hand-over written before places existed
        mvc.perform(get("/api/property").header("Authorization", io)).andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(6))
                .andExpect(jsonPath("$.truncated").value(false))
                .andExpect(jsonPath("$.counts.in_malkhana").value(1)).andExpect(jsonPath("$.counts.out").value(1))
                .andExpect(jsonPath("$.counts.released").value(1)).andExpect(jsonPath("$.counts.other").value(1))
                .andExpect(jsonPath("$.counts.not_stated").value(1)).andExpect(jsonPath("$.counts.not_logged").value(1))
                .andExpect(jsonPath("$.items[?(@.label=='E-02')].status").value("out"))
                .andExpect(jsonPath("$.items[?(@.label=='E-02')].station").value("Fictional North PS"))
                .andExpect(jsonPath("$.items[?(@.label=='E-06')].status").value("not_logged"))
                .andExpect(jsonPath("$.items[?(@.label=='E-07')]").isEmpty());
    }

    @Test
    void whoSeesWhat() throws Exception {
        item(fir, "E-01", "physical");
        item(otherFir, "F-01", "physical");
        // the IO and the SHO of the station, the front desk (reads the station's FIRs) and its malkhana: this station only
        for (String who : new String[] {io, sho, desk, malkhana})
            mvc.perform(get("/api/property").header("Authorization", who)).andExpect(jsonPath("$.items.length()").value(1)).andExpect(jsonPath("$.items[0].label").value("E-01"));
        for (String who : new String[] {otherIo, farMalkhana})
            mvc.perform(get("/api/property").header("Authorization", who)).andExpect(jsonPath("$.items.length()").value(1)).andExpect(jsonPath("$.items[0].label").value("F-01"));
        // an IO of the same station who is not on the case and has no station-wide role sees nothing
        String stranger = TestAuth.bearer(tokens, user(station, "io"));
        mvc.perform(get("/api/property").header("Authorization", stranger)).andExpect(jsonPath("$.items.length()").value(0));
        mvc.perform(get("/api/property")).andExpect(status().isUnauthorized());
    }

    @Test
    void theDescriptionOfAProtectedCasesItemIsWithheldFromTheFrontDesk() throws Exception {
        // weekly review 7 Nov: the register let the front desk read the evidence descriptions of a BNS 64 case, which can name the victim
        db.sql("insert into fir_section (fir_id, act, section) values (?, 'BNS', '64(1)')").param(fir).update();
        db.sql("insert into evidence_item (fir_id, label, description, kind, seized_at, seizure_memo) values (?, 'E-02', 'Fictional clothes of the victim', 'physical', '2026-10-02T10:00Z', 'SM-2')").param(fir).update();
        mvc.perform(get("/api/property").header("Authorization", desk)).andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].label").value("E-02")).andExpect(jsonPath("$.items[0].description").isEmpty())
                .andExpect(jsonPath("$.items[0].withheld").value(true));
        // the case team and the station's malkhana (who hold the item and see it in the evidence register) still read it
        for (String who : new String[] {io, sho, malkhana})
            mvc.perform(get("/api/property").header("Authorization", who)).andExpect(jsonPath("$.items[0].description").value("Fictional clothes of the victim"))
                    .andExpect(jsonPath("$.items[0].withheld").value(false));
        // an ordinary case is not withheld from the front desk
        mvc.perform(get("/api/property").header("Authorization", farMalkhana)).andExpect(jsonPath("$.items.length()").value(0));
        item(otherFir, "F-01", "physical");
        mvc.perform(get("/api/property").header("Authorization", TestAuth.bearer(tokens, user(otherStation, "front_desk"))))
                .andExpect(jsonPath("$.items[0].description").value("Fictional item")).andExpect(jsonPath("$.items[0].withheld").value(false));
    }

    @Test
    void theHandOverPlaceMustBeOneOfTheList() throws Exception {
        UUID i = item(fir, "E-01", "physical");
        handOver(io, fir, i, "moon").andExpect(status().isBadRequest());
        handOver(malkhana, fir, i, "malkhana").andExpect(status().isCreated());
        handOver(otherIo, fir, i, "lab").andExpect(status().isForbidden());
        mvc.perform(get("/api/firs/" + fir + "/evidence/" + i + "/custody").header("Authorization", io))
                .andExpect(jsonPath("$.length()").value(1)).andExpect(jsonPath("$[0].place").value("malkhana"));
    }

    @Test
    void theListStopsAtTheLimitAndSaysSo() throws Exception {
        db.sql("insert into evidence_item (fir_id, label, description, kind, seized_at, seizure_memo) select ?, 'P-' || g, 'Fictional item', 'physical', now(), 'SM' from generate_series(1, ?) g")
                .params(fir, PropertyController.LIMIT + 3).update();
        String body = mvc.perform(get("/api/property").header("Authorization", io)).andExpect(jsonPath("$.truncated").value(true))
                .andExpect(jsonPath("$.items.length()").value(PropertyController.LIMIT)).andReturn().getResponse().getContentAsString();
        assertThat(body).doesNotContain("full_name");
    }

    @Test
    void statusWordsFollowThePlace() {
        assertThat(PropertyController.status(null, false)).isEqualTo("not_logged");
        assertThat(PropertyController.status(null, true)).isEqualTo("not_stated");
        assertThat(PropertyController.status("malkhana", true)).isEqualTo("in_malkhana");
        assertThat(PropertyController.status("lab", true)).isEqualTo("out");
        assertThat(PropertyController.status("court", true)).isEqualTo("out");
        assertThat(PropertyController.status("owner", true)).isEqualTo("released");
        assertThat(PropertyController.status("other", true)).isEqualTo("other");
    }
}
