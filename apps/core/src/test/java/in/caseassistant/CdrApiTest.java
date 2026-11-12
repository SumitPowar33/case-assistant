package in.caseassistant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Map;
import java.util.UUID;
import org.hamcrest.Matchers;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

/** Call detail records (V56). Fictional numbers only (90000 xxxxx). */
@SpringBootTest
@AutoConfigureMockMvc
class CdrApiTest {
    static final String ONE = """
            Target No,B Party No,Date,Time,Duration,Call Type,First Cell ID,IMEI
            9000011111,+91 90000 22222,03/09/2026,21:10:00,120,MOC,404-10-1234-5678,35000000000001
            9000011111,9000022222,03/09/2026,23:40:00,0:01:15,MTC,404-10-1234-5678,35000000000001
            9000011111,VK-FICTBK,04/09/2026,09:00:00,0,SMT,,
            9000011111,9000077777,04/09/2026,10:00:00,30,MOC,404-10-9999-0001,
            9000011111,9000077777,not a date,10:00:00,30,MOC,,
            9000099999,9000077777,04/09/2026,10:00:00,30,MOC,,
            """;
    static final String TWO = "﻿A Party,B Party,Date Time,Duration,Call Type\n"
            + "9000022222,9000011111,2026-09-03 21:10:00,120,MTC\n9000022222,9000077777,2026-09-03 22:00:00,60,Outgoing\n";

    @Autowired MockMvc mvc;
    @Autowired JdbcClient db;
    @Autowired JwtEncoder tokens;
    @Autowired ObjectMapper json;
    UUID station, io, fir;
    String bearer;

    UUID item(String label, String kind, String content) {
        return db.sql("insert into evidence_item (fir_id, label, description, kind, seized_at, seizure_memo, sha256) values (?,?,'Fictional CDR file',?,'2026-09-10T10:00Z','Fictional memo',?) returning id")
                .params(fir, label, kind, content == null ? null : CdrController.sha256(content.getBytes(StandardCharsets.UTF_8))).query(UUID.class).single();
    }

    ResultActions load(UUID item, String target, String content, String who) throws Exception {
        return mvc.perform(post("/api/firs/" + fir + "/cdr").header("Authorization", who).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("evidenceItemId", item, "target", target, "filename", "fictional-cdr.csv",
                        "contentBase64", Base64.getEncoder().encodeToString(content.getBytes(StandardCharsets.UTF_8))))));
    }

    @BeforeEach
    void setUp() {
        db.sql("truncate fir, police_station, state_pack, app_user cascade").update();
        db.sql("insert into state_pack (code, name, version, languages) values ('IN','National','1',array['en'])").update();
        station = db.sql("insert into police_station (state_code, district_id, name) values ('IN',district_id_of('IN','Testpur'),'Testpur City') returning id").query(UUID.class).single();
        io = db.sql("insert into app_user (station_id, full_name, rank, role) values (?,'SI Fictional Asha','SI','io') returning id").param(station).query(UUID.class).single();
        bearer = TestAuth.bearer(tokens, io);
        fir = db.sql("""
                insert into fir (station_id, fir_year, fir_no, gd_entry_no, registered_at, information_received_at,
                  contents_original, contents_language, action_taken, io_id)
                values (?,2026,3,'GD-1','2026-09-05T10:00Z','2026-09-05T09:00Z','Fictional complaint','en','investigate',?) returning id""")
                .params(station, io).query(UUID.class).single();
        db.sql("insert into person (fir_id, role, label, full_name, phone) values (?,'accused','A1','Fictional One','9000011111'), (?,'accused','A2','Fictional Two','+91-90000-22222')")
                .params(fir, fir).update();
    }

    @Test
    void aSeizedFileIsLoadedLineByLineAndUnreadableLinesAreCountedNotGuessed() throws Exception {
        UUID e1 = item("E1", "electronic", ONE);
        load(e1, "+91 90000 11111", ONE, bearer).andExpect(status().isCreated())
                .andExpect(jsonPath("$.lines").value(4)).andExpect(jsonPath("$.skipped").value(2))
                .andExpect(jsonPath("$.problems[0]").value("Line 6: date not readable"))
                .andExpect(jsonPath("$.problems[1]").value("Line 7: another subscriber's line (9000099999)"));
        assertThat(db.sql("select other || '|' || duration_s || '|' || direction || '|' || kind from cdr_call order by line").query(String.class).list())
                .containsExactly("9000022222|120|out|call", "9000022222|75|in|call", "VK-FICTBK|0|in|sms", "9000077777|30|out|call");
        load(e1, "9000011111", ONE, bearer).andExpect(status().isBadRequest()).andExpect(status().reason(Matchers.containsString("already loaded")));
        assertThatThrownBy(() -> db.sql("update cdr_call set duration_s = 1").update()).hasMessageContaining("kept as written");
        assertThatThrownBy(() -> db.sql("delete from cdr_file").update()).hasMessageContaining("kept as written");
    }

    @Test
    void onlyTheExactSeizedFileOfAnElectronicItemOfThisCaseByTheCaseTeam() throws Exception {
        UUID e1 = item("E1", "electronic", ONE);
        load(e1, "9000011111", ONE + "9000011111,9000077777,04/09/2026,11:00:00,5,MOC,,\n", bearer).andExpect(status().isBadRequest())
                .andExpect(status().reason(Matchers.containsString("not the one recorded as E1")));
        load(item("P1", "physical", null), "9000011111", ONE, bearer).andExpect(status().isBadRequest());
        load(e1, "12345", ONE, bearer).andExpect(status().isBadRequest());
        String noType = "B Party No,Date,Duration\n9000022222,03/09/2026,5\n";
        load(item("E2", "electronic", noType), "9000011111", noType, bearer).andExpect(status().isBadRequest())
                .andExpect(status().reason(Matchers.containsString("These columns were not found: type")));
        UUID clerk = db.sql("insert into app_user (station_id, full_name, rank, role) values (?,'HC Fictional Desk','HC','front_desk') returning id").param(station).query(UUID.class).single();
        load(e1, "9000011111", ONE, TestAuth.bearer(tokens, clerk)).andExpect(status().isForbidden());
        mvc.perform(get("/api/firs/" + fir + "/cdr").header("Authorization", TestAuth.bearer(tokens, clerk))).andExpect(status().isNotFound());
        assertThat(db.sql("select count(*) from cdr_file").query(Integer.class).single()).isZero();
    }

    @Test
    void theAnalysisCountsContactsCellsDaysAndNumbersFilesShareNamingPeopleOfTheCaseByLabelAndLogsTheRead() throws Exception {
        load(item("E1", "electronic", ONE), "9000011111", ONE, bearer).andExpect(status().isCreated());
        load(item("E2", "electronic", TWO), "9000022222", TWO, bearer).andExpect(status().isCreated()).andExpect(jsonPath("$.skipped").value(0));
        mvc.perform(get("/api/firs/" + fir + "/cdr").header("Authorization", bearer))
                .andExpect(jsonPath("$.files.length()").value(2))
                .andExpect(jsonPath("$.files[0].evidence").value("E1"))
                .andExpect(jsonPath("$.files[0].target_person").value("A1"))
                .andExpect(jsonPath("$.files[0].contacts[0].other").value("9000022222"))
                .andExpect(jsonPath("$.files[0].contacts[0].calls").value(2))
                .andExpect(jsonPath("$.files[0].contacts[0].seconds").value(195))
                .andExpect(jsonPath("$.files[0].contacts[0].person").value("A2"))
                .andExpect(jsonPath("$.files[0].contacts[?(@.other=='VK-FICTBK')].sms").value(1))
                .andExpect(jsonPath("$.files[0].cells[0].cell").value("404-10-1234-5678"))
                .andExpect(jsonPath("$.files[0].cells[0].events").value(2))
                .andExpect(jsonPath("$.files[0].days[0].day").value("2026-09-03"))
                .andExpect(jsonPath("$.files[0].days[0].events").value(2))
                .andExpect(jsonPath("$.common[?(@.number=='9000077777')].targets[*]").value(Matchers.containsInAnyOrder("9000011111", "9000022222")))
                .andExpect(jsonPath("$.common[?(@.number=='9000011111')].person").value("A1"));
        assertThat(db.sql("select files from cdr_read").query(Integer.class).single()).isEqualTo(2);
        UUID sho = db.sql("insert into app_user (station_id, full_name, rank, role) values (?,'Insp Fictional Sho','Insp','sho') returning id").param(station).query(UUID.class).single();
        mvc.perform(get("/api/audit-log?stationId=" + station).header("Authorization", TestAuth.bearer(tokens, sho)))
                .andExpect(jsonPath("$[?(@.kind=='cdr_read')].what").value(Matchers.hasItem("2")));
    }

    @Test
    void numbersDurationsAndAFileTheSizeOfAnImportAreRead() {
        assertThat(CdrController.number("+91 90000-11111")).isEqualTo("9000011111");
        assertThat(CdrController.number(" vk-fictbk ")).isEqualTo("VK-FICTBK");
        assertThat(CdrController.seconds("75")).isEqualTo(75);
        assertThat(CdrController.seconds("01:02:03")).isEqualTo(3723);
        assertThat(CdrController.seconds("1:15")).isEqualTo(75);
        assertThat(CdrController.seconds("1.5 min")).isNull();
        assertThat(BodyLimit.limitFor("/api/firs/" + UUID.randomUUID() + "/cdr")).isEqualTo(BodyLimit.IMPORT_LIMIT);
        assertThat(BodyLimit.limitFor("/api/firs/" + UUID.randomUUID() + "/cdr/x")).isEqualTo(BodyLimit.LIMIT);
    }
}
