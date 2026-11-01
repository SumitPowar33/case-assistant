package in.caseassistant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.List;
import java.util.Map;
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

/** Audit of reads of protected victim details (V37, {@link ProtectedReads}). Fictional data only. */
@SpringBootTest
@AutoConfigureMockMvc
class ProtectedReadsApiTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcClient db;
    @Autowired ObjectMapper json;
    @Autowired JwtEncoder tokens;
    UUID station, sameDistrict, otherDistrict, otherState, io, clerk, sho, fir, plainFir;

    UUID user(String role, UUID st, String name) {
        return db.sql("insert into app_user (station_id, full_name, rank, role, username) values (?,?,'SI',?,?) returning id")
                .params(st, name, role, name.toLowerCase().replace(' ', '.')).query(UUID.class).single();
    }

    String as(UUID u) {
        return TestAuth.bearer(tokens, u);
    }

    UUID station(String state, String district, String name) {
        return db.sql("insert into police_station (state_code, district_id, name) values (?,district_id_of(?,?),?) returning id")
                .params(state, state, district, name).query(UUID.class).single();
    }

    UUID fir(int no, boolean sexualOffence) {
        return db.sql("""
                insert into fir (station_id, fir_year, fir_no, gd_entry_no, registered_at, information_received_at,
                  contents_original, contents_language, action_taken, io_id, sexual_offence)
                values (?,2026,?,'GD-1','2026-10-01T10:00Z','2026-10-01T09:00Z','Fictional complaint text','en','investigate',?,?)
                returning id""").params(station, no, io, sexualOffence).query(UUID.class).single();
    }

    @BeforeEach
    void setUp() {
        db.sql("truncate fir, complaint, police_station, state_pack, app_user cascade").update();
        db.sql("insert into state_pack (code, name, version, languages) values ('IN','National','1',array['en']), ('MH','Fictional State','1',array['en'])").update();
        station = station("IN", "Testpur", "Fictional Testpur City PS");
        sameDistrict = station("IN", "Testpur", "Fictional Testpur Rural PS");
        otherDistrict = station("IN", "Otherpur", "Fictional Otherpur PS");
        otherState = station("MH", "Farpur", "Fictional Farpur PS");
        io = user("io", station, "SI Fictional Asha");
        clerk = user("front_desk", station, "HC Fictional Clerk");
        sho = user("sho", station, "Insp Fictional SHO");
        fir = fir(7, true);
        plainFir = fir(8, false);
        db.sql("insert into person (fir_id, role, label, full_name, phone) values (?, 'victim', 'V1', 'Fictional Victim Meera', '9000000001')").param(fir).update();
        db.sql("insert into person (fir_id, role, label, full_name, phone) values (?, 'victim', 'V1', 'Fictional Victim Ravi', '9000000002')").param(plainFir).update();
    }

    List<Map<String, Object>> log() {
        return db.sql("select reader, station_id, fir_id, fir_ref, complaint_id, what from protected_read order by at, what").query().listOfRows();
    }

    @Test
    void theCaseTeamsReadsOfAProtectedVictimAreLoggedOthersAndUnprotectedCasesAreNot() throws Exception {
        mvc.perform(get("/api/firs/" + fir + "/people").header("Authorization", as(io))).andExpect(jsonPath("$[0].display_name").value("Fictional Victim Meera"));
        mvc.perform(get("/api/firs/" + fir).header("Authorization", as(sho))).andExpect(jsonPath("$.contents_original").value("Fictional complaint text"));
        assertThat(log()).containsExactlyInAnyOrder(row(io, fir, "people"), row(sho, fir, "fir_text"));
        // the front desk opens the FIR but gets the text withheld: nothing shown, nothing logged; outsiders get 404
        mvc.perform(get("/api/firs/" + fir).header("Authorization", as(clerk))).andExpect(jsonPath("$.contents_withheld").value(true));
        mvc.perform(get("/api/firs/" + fir + "/people").header("Authorization", as(clerk))).andExpect(status().isNotFound());
        // an unprotected case is read without a log line
        mvc.perform(get("/api/firs/" + plainFir + "/people").header("Authorization", as(io))).andExpect(jsonPath("$[0].display_name").value("Fictional Victim Ravi"));
        mvc.perform(get("/api/firs/" + plainFir).header("Authorization", as(io))).andExpect(status().isOk());
        assertThat(log()).hasSize(2);
        // a person masked by hand (a child witness, say) on an unprotected case is protected too
        db.sql("update person set identity_masked = true where fir_id = ?").param(plainFir).update();
        mvc.perform(get("/api/firs/" + plainFir + "/people").header("Authorization", as(io))).andExpect(status().isOk());
        assertThat(log()).hasSize(3).contains(row(io, plainFir, "people"));
        // and a section alone protects the case: reads are logged from then on
        db.sql("insert into fir_section (fir_id, act, section) values (?, 'BNS', '64(1)')").param(plainFir).update();
        mvc.perform(get("/api/firs/" + plainFir).header("Authorization", as(io))).andExpect(status().isOk());
        assertThat(log()).hasSize(4).contains(row(io, plainFir, "fir_text"));
    }

    Map<String, Object> row(UUID reader, UUID firId, String what) {
        var m = new java.util.HashMap<String, Object>();
        m.put("reader", reader);
        m.put("station_id", station);
        m.put("fir_id", firId);
        m.put("fir_ref", firId == null ? null : firId.equals(fir) ? "2026/7" : "2026/8");
        m.put("complaint_id", null);
        m.put("what", what);
        return m;
    }

    UUID complaint(String kind) throws Exception {
        var body = Map.of("stationId", station, "receivedAt", Instant.now().minusSeconds(300).toString(), "mode", "written",
                "informantName", "Fictional Informant Name", "kind", kind, "text", "Fictional words of the informant.", "textLanguage", "en");
        return UUID.fromString(json.readTree(mvc.perform(post("/api/complaints").header("Authorization", as(clerk)).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(body))).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asText());
    }

    @Test
    void readsOfAProtectedComplaintAndOfItsInformantInTheListAreLogged() throws Exception {
        UUID c = complaint("sexual_offence");
        UUID plain = complaint("other");
        mvc.perform(get("/api/complaints/" + c).header("Authorization", as(clerk))).andExpect(jsonPath("$.withheld").value(false));
        mvc.perform(get("/api/complaints/" + plain).header("Authorization", as(clerk))).andExpect(jsonPath("$.withheld").value(false));
        String list = mvc.perform(get("/api/complaints").header("Authorization", as(sho))).andReturn().getResponse().getContentAsString();
        assertThat(list).doesNotContain("\"protected\"");   // the flag is for the log, not the screen
        var rows = db.sql("select reader, complaint_id, fir_id, what from protected_read order by at, what").query().listOfRows();
        assertThat(rows).hasSize(2);
        assertThat(rows.get(0)).containsEntry("reader", clerk).containsEntry("complaint_id", c).containsEntry("what", "complaint").containsEntry("fir_id", null);
        assertThat(rows.get(1)).containsEntry("reader", sho).containsEntry("complaint_id", c).containsEntry("what", "complaint_list");
        // a colleague at the desk gets it withheld: nothing shown, nothing logged
        UUID colleague = user("front_desk", station, "HC Fictional Colleague");
        mvc.perform(get("/api/complaints/" + c).header("Authorization", as(colleague))).andExpect(jsonPath("$.withheld").value(true));
        mvc.perform(get("/api/complaints").header("Authorization", as(colleague))).andExpect(status().isOk());
        assertThat(log()).hasSize(2);
        // once an FIR is registered from it, the log names the FIR too
        mvc.perform(post("/api/complaints/" + c + "/sign").header("Authorization", as(clerk)).contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isNoContent());
        var firBody = Map.of("stationId", station, "firYear", 2026, "firNo", 31, "gdEntryNo", "GD-31", "registeredAt", Instant.now().toString(),
                "actionTaken", "investigate", "complaintId", c);
        String newFir = json.readTree(mvc.perform(post("/api/firs").header("Authorization", as(clerk)).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(firBody))).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asText();
        mvc.perform(get("/api/complaints/" + c).header("Authorization", as(sho))).andExpect(jsonPath("$.withheld").value(false));
        assertThat(db.sql("select fir_id::text || ' ' || fir_ref from protected_read where reader = ? and what = 'complaint'").param(sho).query(String.class).single())
                .isEqualTo(newFir + " 2026/31");
    }

    @Test
    void theLogIsReadOnlyByThoseWhoAuditTheStation() throws Exception {
        mvc.perform(get("/api/firs/" + fir + "/people").header("Authorization", as(io))).andExpect(status().isOk());
        String url = "/api/protected-reads?stationId=" + station;
        UUID platformAdmin = user("state_admin", null, "Fictional Platform Admin");
        for (UUID who : new UUID[] {sho, user("sp", sameDistrict, "Fictional SP Near"), user("state_admin", otherDistrict, "Fictional State Admin"), platformAdmin})
            mvc.perform(get(url).header("Authorization", as(who))).andExpect(status().isOk())
                    .andExpect(jsonPath("$.length()").value(1))
                    .andExpect(jsonPath("$[0].what").value("people"))
                    .andExpect(jsonPath("$[0].fir_ref").value("2026/7"))
                    .andExpect(jsonPath("$[0].fir_id").value(fir.toString()))
                    .andExpect(jsonPath("$[0].reader_name").value("SI Fictional Asha"))
                    .andExpect(jsonPath("$[0].reader_rank").value("SI"))
                    .andExpect(jsonPath("$[0].reader_username").value("si.fictional.asha"))
                    .andExpect(jsonPath("$[0].at").exists());
        for (UUID who : new UUID[] {io, clerk, user("malkhana", station, "HC Fictional Store"), user("sho", sameDistrict, "Insp Fictional Near SHO"),
                user("sp", otherDistrict, "Fictional SP Far"), user("state_admin", otherState, "Fictional Far State Admin")})
            mvc.perform(get(url).header("Authorization", as(who))).andExpect(status().isForbidden());
        mvc.perform(get(url)).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/protected-reads?stationId=" + UUID.randomUUID()).header("Authorization", as(platformAdmin))).andExpect(status().isForbidden());
        mvc.perform(get("/api/protected-reads").header("Authorization", as(sho))).andExpect(status().isBadRequest());
        for (String bad : new String[] {"&limit=0", "&limit=201", "&offset=-1"})
            mvc.perform(get(url + bad).header("Authorization", as(sho))).andExpect(status().isBadRequest());
        // reading the log shows no victim detail and is not itself a protected read
        String body = mvc.perform(get(url).header("Authorization", as(sho))).andReturn().getResponse().getContentAsString();
        assertThat(body).doesNotContain("Meera").doesNotContain("9000000001").doesNotContain("Fictional complaint text");
        assertThat(log()).hasSize(1);
        // another station's reads are not in this station's log
        assertThat(db.sql("select count(*) from protected_read where station_id = ?").param(sameDistrict).query(Long.class).single()).isZero();
    }

    @Test
    void oneOpeningOfAScreenIsOneLineAndALaterOpeningIsAnother() throws Exception {
        // the FIR screen asks for the people several times as it opens: one line per reader, record and kind a minute
        for (int i = 0; i < 4; i++) mvc.perform(get("/api/firs/" + fir + "/people").header("Authorization", as(io))).andExpect(status().isOk());
        mvc.perform(get("/api/firs/" + fir).header("Authorization", as(io))).andExpect(status().isOk());
        mvc.perform(get("/api/firs/" + fir + "/people").header("Authorization", as(sho))).andExpect(status().isOk());
        assertThat(log()).containsExactlyInAnyOrder(row(io, fir, "people"), row(io, fir, "fir_text"), row(sho, fir, "people"));
        // a read of the same kind more than a minute after the last one is a new opening
        db.sql("insert into protected_read (reader, station_id, fir_id, fir_ref, what, at) values (?,?,?,'2026/8','people', now() - interval '61 seconds')")
                .params(io, station, plainFir).update();
        db.sql("update person set identity_masked = true where fir_id = ?").param(plainFir).update();
        mvc.perform(get("/api/firs/" + plainFir + "/people").header("Authorization", as(io))).andExpect(status().isOk());
        assertThat(db.sql("select count(*) from protected_read where fir_id = ?").param(plainFir).query(Long.class).single()).isEqualTo(2);
        // the same for complaints: opened twice, listed twice
        UUID c = complaint("sexual_offence");
        for (int i = 0; i < 2; i++) {
            mvc.perform(get("/api/complaints/" + c).header("Authorization", as(clerk))).andExpect(status().isOk());
            mvc.perform(get("/api/complaints").header("Authorization", as(clerk))).andExpect(status().isOk());
        }
        assertThat(db.sql("select string_agg(what, ',' order by what) from protected_read where complaint_id = ?").param(c).query(String.class).single())
                .isEqualTo("complaint,complaint_list");
    }

    @Test
    void newestFirstAndPaged() throws Exception {
        for (int i = 3; i >= 1; i--)
            db.sql("insert into protected_read (reader, station_id, fir_id, fir_ref, what, at) values (?,?,?,'2026/7','people', now() - make_interval(hours => ?))")
                    .params(io, station, fir, i).update();
        mvc.perform(get("/api/firs/" + fir).header("Authorization", as(sho))).andExpect(status().isOk());
        String url = "/api/protected-reads?stationId=" + station;
        mvc.perform(get(url).header("Authorization", as(sho))).andExpect(jsonPath("$.length()").value(4))
                .andExpect(jsonPath("$[0].what").value("fir_text")).andExpect(jsonPath("$[0].reader_name").value("Insp Fictional SHO"));
        mvc.perform(get(url + "&limit=2&offset=3").header("Authorization", as(sho))).andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].what").value("people"));
    }

    @Test
    void theLogIsKeptAsWritten() {
        db.sql("insert into protected_read (reader, station_id, fir_id, fir_ref, what) values (?,?,?,'2026/7','people')").params(io, station, fir).update();
        assertThatThrownBy(() -> db.sql("update protected_read set reader = ?").param(sho).update()).hasMessageContaining("kept as written");
        assertThatThrownBy(() -> db.sql("delete from protected_read").update()).hasMessageContaining("kept as written");
        assertThat(log()).hasSize(1);
    }
}
