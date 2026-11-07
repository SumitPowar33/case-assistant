package in.caseassistant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
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

/** Search and seizure memo (V48, design board 7): who writes and reads it, what it must hold, the BNSS 105 forwarding. Fictional data only. */
@SpringBootTest
@AutoConfigureMockMvc
class SearchApiTest {
    static final String SHA = "ab".repeat(32), SHA2 = "cd".repeat(32);

    @Autowired MockMvc mvc;
    @Autowired JdbcClient db;
    @Autowired org.springframework.security.oauth2.jwt.JwtEncoder tokens;
    UUID station, fir;
    String io, sho, desk, malkhana, otherIo;

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
        malkhana = TestAuth.bearer(tokens, user(station, "malkhana"));
        otherIo = TestAuth.bearer(tokens, user(other, "io"));
        fir = db.sql("""
                insert into fir (station_id, fir_year, fir_no, gd_entry_no, registered_at, information_received_at, contents_original, contents_language, action_taken, io_id)
                values (?,2026,214,'GD-1','2026-10-01T10:00Z','2026-10-01T09:00Z','Fictional complaint','en','investigate',?) returning id""").params(station, ioId).query(UUID.class).single();
    }

    static String at(int daysAgo, int hour) {
        return OffsetDateTime.now(ZoneId.of("Asia/Kolkata")).minusDays(daysAgo).withHour(hour).withMinute(0).withSecond(0).withNano(0).toString();
    }

    static String memo(String start, String end, String witnesses, String reason, String recordings, String items) {
        return "{\"place\":\"Fictional house, A2's residence\",\"grounds\":\"Information that the fictional stolen phones are kept here\","
                + "\"startedAt\":\"" + start + "\",\"endedAt\":\"" + end + "\"" + (reason == null ? "" : ",\"noWitnessReason\":\"" + reason + "\"")
                + ",\"witnesses\":" + witnesses + ",\"recordings\":" + recordings + ",\"items\":" + items + "}";
    }

    static final String TWO = "[{\"name\":\"Fictional Neighbour\",\"address\":\"Fictional lane 1\"},{\"name\":\"Fictional Shopkeeper\",\"address\":\"Fictional lane 2\"}]";
    static final String CLIP = "[{\"sha256\":\"" + SHA + "\",\"seconds\":221,\"esakshyaId\":\"ES-7731\"}]";
    static final String ITEMS = "[{\"label\":\"E-03\",\"description\":\"Fictional phone, black\",\"kind\":\"physical\",\"sealNo\":\"214/E-03\"},"
            + "{\"label\":\"E-04\",\"description\":\"Fictional SIM cards, 6\",\"kind\":\"physical\",\"sealNo\":\"214/E-04\"}]";

    ResultActions write(String who, String body) throws Exception {
        return mvc.perform(post("/api/firs/" + fir + "/searches").header("Authorization", who).contentType(MediaType.APPLICATION_JSON).content(body));
    }

    String good() {
        return memo(at(1, 7), at(1, 8), TWO, null, CLIP, ITEMS);
    }

    UUID save(String body) throws Exception {
        String res = write(io, body).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return UUID.fromString(res.replaceAll(".*\"id\":\"([^\"]+)\".*", "$1"));
    }

    ResultActions forward(String who, UUID id, String date) throws Exception {
        return mvc.perform(post("/api/firs/" + fir + "/searches/" + id + "/forwarded").header("Authorization", who).contentType(MediaType.APPLICATION_JSON)
                .content("{\"date\":\"" + date + "\",\"to\":\"Fictional JMFC, North\"}"));
    }

    @Test
    void aMemoIsFrozenWithItsWitnessesRecordingAndItemsAndTheItemsJoinTheEvidence() throws Exception {
        UUID id = save(good());
        mvc.perform(get("/api/firs/" + fir + "/searches").header("Authorization", io)).andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1)).andExpect(jsonPath("$[0].id").value(id.toString()))
                .andExpect(jsonPath("$[0].witnesses.length()").value(2)).andExpect(jsonPath("$[0].recordings[0].sha256").value(SHA))
                .andExpect(jsonPath("$[0].recordings[0].esakshya_id").value("ES-7731")).andExpect(jsonPath("$[0].items.length()").value(2))
                .andExpect(jsonPath("$[0].items[0].seal_no").value("214/E-03")).andExpect(jsonPath("$[0].forwarded_on").isEmpty())
                .andExpect(jsonPath("$[0].days_since").value(1)).andExpect(jsonPath("$[0].recorded_by_name").value("Fictional io"));
        // the items are ordinary evidence of the case: in the evidence register and the property register
        mvc.perform(get("/api/firs/" + fir + "/evidence").header("Authorization", io)).andExpect(jsonPath("$.length()").value(2));
        mvc.perform(get("/api/property").header("Authorization", malkhana)).andExpect(jsonPath("$.items.length()").value(2));
        assertThat(db.sql("select seizure_memo from evidence_item where label = 'E-03'").query(String.class).single()).startsWith("Search memo ");
        // the SHO is on the case team and writes one too
        write(sho, memo(at(1, 9), at(1, 10), TWO, null, "[{\"sha256\":\"" + SHA2 + "\",\"seconds\":60}]", "[]")).andExpect(status().isCreated());
    }

    @Test
    void theRecordingIsSentToTheMagistrateOnceAfterTheSearch() throws Exception {
        UUID id = save(good());
        LocalDate today = LocalDate.now(ZoneId.of("Asia/Kolkata"));
        forward(io, id, today.minusDays(2).toString()).andExpect(status().isBadRequest()).andExpect(status().reason("The recording is sent after the search, not before."));
        forward(io, id, today.plusDays(1).toString()).andExpect(status().isBadRequest());
        forward(io, id, "21/10/2026").andExpect(status().isBadRequest());
        forward(desk, id, today.toString()).andExpect(status().isForbidden());
        forward(io, UUID.randomUUID(), today.toString()).andExpect(status().isNotFound());
        forward(io, id, today.toString()).andExpect(status().isCreated()).andExpect(jsonPath("$.forwarded_on").value(today.toString()));
        forward(sho, id, today.toString()).andExpect(status().isConflict());
        mvc.perform(get("/api/firs/" + fir + "/searches").header("Authorization", io))
                .andExpect(jsonPath("$[0].forwarded_on").value(today.toString())).andExpect(jsonPath("$[0].forwarded_to").value("Fictional JMFC, North"));
    }

    @Test
    void aMemoNeedsItsRecordingWitnessesAndSaneTimes() throws Exception {
        String one = "[{\"name\":\"Fictional Neighbour\",\"address\":\"Fictional lane 1\"}]";
        write(io, memo(at(1, 7), at(1, 8), TWO, null, "[]", "[]")).andExpect(status().isBadRequest())
                .andExpect(status().reason("Add the audio-video recording of the search (BNSS 105): its SHA-256 and length."));
        write(io, memo(at(1, 7), at(1, 8), TWO, null, null, "[]").replace(",\"recordings\":null", "")).andExpect(status().isBadRequest());
        write(io, memo(at(1, 7), at(1, 8), one, null, CLIP, "[]")).andExpect(status().isBadRequest())
                .andExpect(status().reason("Name two witnesses of the locality, or write why there are fewer (BNSS 103(4), at least 10 characters)."));
        write(io, memo(at(1, 7), at(1, 8), one, "short", CLIP, "[]")).andExpect(status().isBadRequest());
        write(io, memo(at(1, 7), at(1, 8), "[]", "Nobody of the locality agreed to come", CLIP, "[]").replace(",\"witnesses\":[]", "")).andExpect(status().isCreated());
        write(io, memo(at(1, 8), at(1, 7), TWO, null, CLIP, "[]")).andExpect(status().isBadRequest()).andExpect(status().reason("The search cannot end before it started."));
        write(io, memo(at(0, 0), at(-1, 8), TWO, null, CLIP, "[]")).andExpect(status().isBadRequest());
        write(io, memo("2026-09-30T10:00:00+05:30", "2026-09-30T11:00:00+05:30", TWO, null, CLIP, "[]")).andExpect(status().isBadRequest())
                .andExpect(status().reason("A search of this case cannot start before its information was received."));
        write(io, memo(at(1, 7), at(1, 8), TWO, null, "[{\"sha256\":\"" + SHA + "\",\"seconds\":0}]", "[]")).andExpect(status().isBadRequest());
        write(io, memo(at(1, 7), at(1, 8), TWO, null, "[{\"sha256\":\"" + SHA + "\",\"seconds\":90000}]", "[]")).andExpect(status().isBadRequest());
        write(io, memo(at(1, 7), at(1, 8), TWO, null, "[{\"sha256\":\"" + SHA + "\",\"seconds\":5},{\"sha256\":\"" + SHA.toUpperCase() + "\",\"seconds\":6}]", "[]"))
                .andExpect(status().isBadRequest()).andExpect(status().reason("The same recording is listed twice."));
        write(io, memo(at(1, 7), at(1, 8), TWO, null, "[{\"sha256\":\"abc\",\"seconds\":5}]", "[]")).andExpect(status().isBadRequest());
        write(io, memo(at(1, 7), at(1, 8), TWO, null, CLIP, "[null]")).andExpect(status().isBadRequest());
        write(io, "{\"place\":\"x\"}").andExpect(status().isBadRequest());
        assertThat(db.sql("select count(*) from search_seizure").query(Long.class).single()).isEqualTo(1);
    }

    @Test
    void anItemIsCheckedAndARefusedItemLeavesNothingBehind() throws Exception {
        write(io, memo(at(1, 7), at(1, 8), TWO, null, CLIP, "[{\"label\":\"E-05\",\"description\":\"Fictional laptop\",\"kind\":\"electronic\"}]"))
                .andExpect(status().isBadRequest()).andExpect(status().reason("An electronic item needs the SHA-256 taken at seizure."));
        write(io, memo(at(1, 7), at(1, 8), TWO, null, CLIP, "[{\"label\":\"E-05\",\"description\":\"Fictional laptop\",\"kind\":\"electronic\",\"sha256\":\"" + SHA2.toUpperCase() + "\"}]"))
                .andExpect(status().isCreated());
        assertThat(db.sql("select sha256 from evidence_item where label = 'E-05'").query(String.class).single()).isEqualTo(SHA2);
        write(io, memo(at(1, 9), at(1, 10), TWO, null, CLIP, "[{\"label\":\"E-05\",\"description\":\"Fictional again\",\"kind\":\"physical\"}]"))
                .andExpect(status().isConflict());
        write(io, memo(at(1, 9), at(1, 10), TWO, null, CLIP, "[{\"label\":\"E-06\",\"description\":\"Fictional\",\"kind\":\"weapon\"}]")).andExpect(status().isBadRequest());
        assertThat(db.sql("select count(*) from search_seizure").query(Long.class).single()).isEqualTo(1);
        assertThat(db.sql("select count(*) from search_witness").query(Long.class).single()).isEqualTo(2);
    }

    @Test
    void onlyTheCaseTeamWritesAndReads() throws Exception {
        UUID id = save(good());
        for (String who : new String[] {desk, malkhana})
            write(who, good()).andExpect(status().isForbidden());
        write(otherIo, good()).andExpect(status().isForbidden());
        for (String who : new String[] {desk, malkhana, otherIo})
            mvc.perform(get("/api/firs/" + fir + "/searches").header("Authorization", who)).andExpect(status().isNotFound());
        forward(otherIo, id, LocalDate.now(ZoneId.of("Asia/Kolkata")).toString()).andExpect(status().isForbidden());
        mvc.perform(get("/api/firs/" + fir + "/searches")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/firs/" + fir + "/searches").contentType(MediaType.APPLICATION_JSON).content(good())).andExpect(status().isUnauthorized());
    }
}
