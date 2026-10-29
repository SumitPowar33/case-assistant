package in.caseassistant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.LinkedHashMap;
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
import org.springframework.test.web.servlet.ResultActions;

/** Loading existing FIRs from a file. Fictional states, stations, officers and people only. */
@SpringBootTest
@AutoConfigureMockMvc
class ImportApiTest {
    static final String HEAD = "FIR No,Registration Date,Sections,Brief Facts,IO,Complainant,Victim,Accused,GD No,Status\n";
    static final String GOOD = HEAD
            + "1,05/03/2024 10:00,IPC 379,Fictional phone theft,io.one,Fictional Complainant,,Fictional Accused One; Fictional Accused Two,GD-1,open\n"
            + "2,06/03/2024 11:00,IPC 376,Fictional case,io.one,Fictional Complainant Two,Fictional Victim,,GD-2,closed\n";

    @Autowired MockMvc mvc;
    @Autowired JdbcClient db;
    @Autowired ObjectMapper json;
    @Autowired JwtEncoder tokens;
    UUID s1, s2, s3, sx, ioUser;
    String sho1, sho2, sp, stateAdmin, platformAdmin, io, otherStateAdmin;

    UUID station(String state, String district, String name) {
        return db.sql("insert into police_station (state_code, district_id, name) values (?,district_id_of(?,?),?) returning id").params(state, state, district, name).query(UUID.class).single();
    }

    UUID user(String role, UUID station, String name, String username) {
        return db.sql("insert into app_user (station_id, full_name, rank, role, username) values (?,?,'Insp',?,?) returning id")
                .params(station, name, role, username).query(UUID.class).single();
    }

    String bearer(UUID user) {
        return TestAuth.bearer(tokens, user);
    }

    @BeforeEach
    void setUp() {
        db.sql("truncate fir, police_station, state_pack, app_user, import_batch cascade").update();
        db.sql("insert into state_pack (code, name, version, languages) values ('IN','National','1',array['en']), ('XX','Other','1',array['en'])").update();
        s1 = station("IN", "North", "Fictional North PS");
        s2 = station("IN", "North", "Fictional North Two PS");
        s3 = station("IN", "South", "Fictional South PS");
        sx = station("XX", "East", "Fictional East PS");
        ioUser = user("io", s1, "Fictional IO One", "io.one");
        io = bearer(ioUser);
        sho1 = bearer(user("sho", s1, "Fictional SHO One", "sho.one"));
        sho2 = bearer(user("sho", s2, "Fictional SHO Two", "sho.two"));
        sp = bearer(user("sp", s1, "Fictional SP North", "sp.north"));
        stateAdmin = bearer(user("state_admin", s1, "Fictional State Admin", "admin.in"));
        platformAdmin = bearer(user("state_admin", null, "Fictional Platform Admin", "admin.all"));
        otherStateAdmin = bearer(user("state_admin", sx, "Fictional Other State Admin", "admin.xx"));
    }

    ResultActions send(String who, String path, Object body) throws Exception {
        return mvc.perform(post(path).header("Authorization", who).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body)));
    }

    Map<String, Object> stageBody(UUID station, String csv) {
        var m = new LinkedHashMap<String, Object>();
        m.put("stationId", station);
        m.put("profile", "fir-generic");
        m.put("complaintLanguage", "en");
        m.put("filename", "old-firs.csv");
        m.put("csv", csv);
        return m;
    }

    UUID stage(String who, UUID station, String csv) throws Exception {
        var out = json.readTree(send(who, "/api/imports", stageBody(station, csv)).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        return UUID.fromString(out.get("id").asText());
    }

    ResultActions commit(String who, UUID batch) throws Exception {
        return send(who, "/api/imports/" + batch + "/commit", Map.of("authority", "Order 12/2026 of the Fictional SP"));
    }

    @Test
    void anAccusedWithTheSameNameAsOneInAnotherFirIsFlaggedNotMerged() throws Exception {
        commit(sho1, stage(sho1, s1, GOOD)).andExpect(status().isOk());
        String next = HEAD + "5,10/03/2024 10:00,IPC 379,Fictional theft,,,,fictional  ACCUSED one.,GD-5,open\n"
                + "6,11/03/2024 10:00,IPC 379,Fictional theft,,,,Fictional Accused One,GD-6,open\n"
                + "7,12/03/2024 10:00,IPC 379,Fictional theft,,,,Fictional Other Person,GD-7,open\n";
        UUID b = stage(sho1, s1, next);
        mvc.perform(get("/api/imports/" + b).header("Authorization", sho1)).andExpect(jsonPath("$.rows_warning").value(2)).andExpect(jsonPath("$.rows_ok").value(1));
        mvc.perform(get("/api/imports/" + b + "/rows?status=warning").header("Authorization", sho1))
                .andExpect(jsonPath("$[0].messages[?(@.field=='accused_names')].text").value(org.hamcrest.Matchers.hasItem(org.hamcrest.Matchers.containsString("FIR 2024/1"))))
                .andExpect(jsonPath("$[1].messages[?(@.field=='accused_names')].text").value(org.hamcrest.Matchers.hasItem(org.hamcrest.Matchers.containsString("FIR 2024/1"))));
        commit(sho1, b).andExpect(status().isOk()).andExpect(jsonPath("$.rows_imported").value(3));
        assertThat(db.sql("select count(*) from person where full_name = 'Fictional Accused One'").query(Long.class).single()).isEqualTo(2);
        assertThat(db.sql("select count(*) from person where role = 'accused' and import_batch_id = ?").param(b).query(Long.class).single()).isEqualTo(3);
    }

    @Test
    void theSameNameInAnotherStationIsNotFlagged() throws Exception {
        commit(sho1, stage(sho1, s1, GOOD)).andExpect(status().isOk());
        UUID b = stage(sho2, s2, HEAD + "1,10/03/2024 10:00,IPC 379,Fictional theft,,,,Fictional Accused One,GD-5,open\n");
        mvc.perform(get("/api/imports/" + b).header("Authorization", sho2)).andExpect(jsonPath("$.rows_warning").value(0)).andExpect(jsonPath("$.rows_ok").value(1));
    }

    @Test
    void theColumnsAreSuggestedFromTheHeader() throws Exception {
        send(sho1, "/api/imports/inspect", Map.of("profile", "fir-generic", "csv", GOOD)).andExpect(status().isOk())
                .andExpect(jsonPath("$.rows").value(2)).andExpect(jsonPath("$.suggested.fir_no").value("FIR No"))
                .andExpect(jsonPath("$.suggested.io_username").value("IO")).andExpect(jsonPath("$.required[0]").exists());
        mvc.perform(get("/api/imports/profiles").header("Authorization", sho1)).andExpect(status().isOk()).andExpect(jsonPath("$[?(@.id=='fir-generic')]").isNotEmpty());
    }

    @Test
    void aFileIsStagedAndCheckedAndNothingReachesTheCasesYet() throws Exception {
        String csv = GOOD + "3,31/02/2024,,,,,,,,\n1,07/03/2024,,,,,,,,\n4,08/03/2024 09:00,,,,,,,,,,extra\n";
        UUID b = stage(sho1, s1, csv);
        mvc.perform(get("/api/imports/" + b).header("Authorization", sho1)).andExpect(jsonPath("$.status").value("staged"))
                .andExpect(jsonPath("$.rows_total").value(5)).andExpect(jsonPath("$.rows_ok").value(2)).andExpect(jsonPath("$.rows_error").value(3))
                .andExpect(jsonPath("$.created_by_name").value("Fictional SHO One")).andExpect(jsonPath("$.file_sha256").value(ImportController.sha(csv)));
        assertThat(db.sql("select count(*) from fir").query(Long.class).single()).isZero();
        mvc.perform(get("/api/imports/" + b + "/rows?status=error").header("Authorization", sho1)).andExpect(jsonPath("$.length()").value(3))
                .andExpect(jsonPath("$[0].messages[0].level").value("error")).andExpect(jsonPath("$[0].raw.['FIR No']").value("3"));
        mvc.perform(get("/api/imports/" + b + "/rows").header("Authorization", sho1)).andExpect(jsonPath("$.length()").value(5));
        String errors = mvc.perform(get("/api/imports/" + b + "/errors.csv").header("Authorization", sho1)).andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith("text/csv")).andReturn().getResponse().getContentAsString();
        assertThat(errors).contains("\"row\",\"status\",\"field\",\"problem\"").contains("same FIR number as row 1").contains("more values than the header");
        mvc.perform(get("/api/imports").header("Authorization", sho1)).andExpect(jsonPath("$.length()").value(1));
    }

    @Test
    void approvingImportsTheGoodRowsWithPeopleSectionsAndTheIo() throws Exception {
        UUID b = stage(sho1, s1, GOOD + "9,xx,,,,,,,,\n");
        commit(sho1, b).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("imported")).andExpect(jsonPath("$.rows_imported").value(2))
                .andExpect(jsonPath("$.approved_by_name").value("Fictional SHO One")).andExpect(jsonPath("$.authority_note").value("Order 12/2026 of the Fictional SP"));
        var firs = db.sql("select fir_no, io_id, concluded, contents_language, gd_entry_no, import_batch_id from fir order by fir_no").query().listOfRows();
        assertThat(firs).hasSize(2);
        assertThat(firs.get(0)).containsEntry("io_id", ioUser).containsEntry("concluded", false).containsEntry("contents_language", "en").containsEntry("gd_entry_no", "GD-1");
        assertThat(firs.get(1)).containsEntry("concluded", true);
        assertThat(db.sql("select count(*) from person where import_batch_id = ?").param(b).query(Long.class).single()).isEqualTo(5);
        assertThat(db.sql("select count(*) from fir_section").query(Long.class).single()).isEqualTo(2);
        assertThat(db.sql("select count(*) from fir_io_assignment").query(Long.class).single()).isZero();
        assertThat(db.sql("select count(*) from import_row where batch_id = ? and (raw is not null or parsed is not null)").param(b).query(Long.class).single())
                .as("personal data leaves staging").isZero();
        assertThat(db.sql("select count(*) from import_row where batch_id = ? and status = 'imported'").param(b).query(Long.class).single()).isEqualTo(2);
        commit(sho1, b).andExpect(status().isConflict());
    }

    @Test
    void legacyRapeCasesAreMaskedAndConcludedCasesHaveNoLiveDeadlines() throws Exception {
        commit(sho1, stage(sho1, s1, GOOD));
        UUID masked = db.sql("select id from fir where fir_no = 2").query(UUID.class).single();
        UUID open = db.sql("select id from fir where fir_no = 1").query(UUID.class).single();
        assertThat(db.sql("select display_name from person_public where fir_id = ? and role = 'victim'").param(masked).query(String.class).single()).isEqualTo("Victim V1");
        assertThat(db.sql("select identity_protected_case(?)").param(open).query(Boolean.class).single()).isFalse();
        assertThat(db.sql("select count(*) from case_deadline where fir_id = ?").param(masked).query(Long.class).single()).isZero();
        assertThat(db.sql("select count(*) from case_deadline where fir_id = ? and kind = 'victim_progress_update'").param(open).query(Long.class).single()).isEqualTo(1);
    }

    @Test
    void theSameFileAgainIsSkippedAndADifferentRowWithTheSameNumberIsNeverOverwritten() throws Exception {
        commit(sho1, stage(sho1, s1, GOOD));
        String changed = HEAD + "1,05/03/2024 10:00,IPC 379,A different story,io.one,,,,GD-1,open\n" + GOOD.substring(GOOD.indexOf("\n2,") + 1);
        UUID again = stage(sho1, s1, changed);
        mvc.perform(get("/api/imports/" + again).header("Authorization", sho1)).andExpect(jsonPath("$.rows_duplicate").value(2)).andExpect(jsonPath("$.rows_ok").value(0));
        mvc.perform(get("/api/imports/" + again + "/rows?status=duplicate").header("Authorization", sho1))
                .andExpect(jsonPath("$[0].messages[*].text").value(org.hamcrest.Matchers.hasItem(org.hamcrest.Matchers.containsString("differs"))))
                .andExpect(jsonPath("$[1].messages[*].text").value(org.hamcrest.Matchers.hasItem(org.hamcrest.Matchers.containsString("Already imported"))));
        commit(sho1, again).andExpect(status().isConflict());
        assertThat(db.sql("select contents_original from fir where fir_no = 1").query(String.class).single()).isEqualTo("Fictional phone theft");
    }

    @Test
    void anFirTakenBetweenStagingAndApprovalIsSkippedNotOverwritten() throws Exception {
        UUID b = stage(sho1, s1, GOOD);
        db.sql("""
                insert into fir (station_id, fir_year, fir_no, gd_entry_no, registered_at, information_received_at, contents_original, contents_language, action_taken)
                values (?,2024,1,'GD-X','2024-03-05T04:00Z','2024-03-05T04:00Z','Fictional live FIR','en','investigate')""").param(s1).update();
        commit(sho1, b).andExpect(jsonPath("$.rows_imported").value(1));
        assertThat(db.sql("select contents_original from fir where fir_no = 1").query(String.class).single()).isEqualTo("Fictional live FIR");
        assertThat(db.sql("select count(*) from import_row where batch_id = ? and status = 'skipped'").param(b).query(Long.class).single()).isEqualTo(1);
    }

    @Test
    void whoMayLoadRecordsForWhichStation() throws Exception {
        send(io, "/api/imports", stageBody(s1, GOOD)).andExpect(status().isForbidden());
        send(sho1, "/api/imports", stageBody(s2, GOOD)).andExpect(status().isForbidden());
        send(sho2, "/api/imports", stageBody(s1, GOOD)).andExpect(status().isForbidden());
        send(sp, "/api/imports", stageBody(s3, GOOD)).andExpect(status().isForbidden());
        send(otherStateAdmin, "/api/imports", stageBody(s1, GOOD)).andExpect(status().isForbidden());
        send(stateAdmin, "/api/imports", stageBody(sx, GOOD)).andExpect(status().isForbidden());
        for (String who : new String[] {sp, stateAdmin, platformAdmin}) send(who, "/api/imports", stageBody(s2, GOOD)).andExpect(status().isCreated());
        send(platformAdmin, "/api/imports", stageBody(sx, GOOD)).andExpect(status().isCreated());
        send(io, "/api/imports/inspect", Map.of("profile", "fir-generic", "csv", GOOD)).andExpect(status().isForbidden());
        mvc.perform(get("/api/imports/profiles").header("Authorization", io)).andExpect(status().isForbidden());
    }

    @Test
    void aBatchIsInvisibleToThoseWhoMayNotLoadForItsStation() throws Exception {
        UUID b = stage(sho1, s1, GOOD);
        for (String who : new String[] {sho2, io, otherStateAdmin}) {
            mvc.perform(get("/api/imports/" + b).header("Authorization", who)).andExpect(status().isNotFound());
            mvc.perform(get("/api/imports/" + b + "/rows").header("Authorization", who)).andExpect(status().isNotFound());
            mvc.perform(get("/api/imports/" + b + "/errors.csv").header("Authorization", who)).andExpect(status().isNotFound());
            commit(who, b).andExpect(status().isNotFound());
            send(who, "/api/imports/" + b + "/discard", Map.of()).andExpect(status().isNotFound());
            send(who, "/api/imports/" + b + "/undo", Map.of("reason", "Wrong file uploaded")).andExpect(status().isNotFound());
            mvc.perform(get("/api/imports").header("Authorization", who)).andExpect(jsonPath("$.length()").value(0));
        }
        mvc.perform(get("/api/imports").header("Authorization", sp)).andExpect(jsonPath("$.length()").value(1));
        mvc.perform(get("/api/imports")).andExpect(status().isUnauthorized());
    }

    @Test
    void badRequestsAreRefusedBeforeAnythingIsStored() throws Exception {
        send(sho1, "/api/imports", stageBody(s1, "")).andExpect(status().isBadRequest());
        send(sho1, "/api/imports", stageBody(s1, HEAD)).andExpect(status().isBadRequest());
        send(sho1, "/api/imports", stageBody(s1, "a,b\n\"x,1")).andExpect(status().isBadRequest());
        send(sho1, "/api/imports", stageBody(s1, "Colour,Size\nred,big")).andExpect(status().isBadRequest());
        var body = stageBody(s1, GOOD);
        body.put("profile", "nope");
        send(sho1, "/api/imports", body).andExpect(status().isBadRequest());
        body.put("profile", "fir-generic");
        body.put("mapping", Map.of("fir_no", "FIR No", "registered_at", "No such column"));
        send(sho1, "/api/imports", body).andExpect(status().isBadRequest());
        body.put("mapping", Map.of("fir_no", "FIR No", "registered_at", "Registration Date"));
        send(sho1, "/api/imports", body).andExpect(status().isCreated());
        body.put("complaintLanguage", "English!");
        send(sho1, "/api/imports", body).andExpect(status().isBadRequest());
        send(sho1, "/api/imports/inspect", Map.of("profile", "nope", "csv", GOOD)).andExpect(status().isBadRequest());
        send(sho1, "/api/imports", stageBody(s1, HEAD + "1,05/03/2024\n".repeat(ImportController.MAX_ROWS + 1))).andExpect(status().isPayloadTooLarge());
        assertThat(db.sql("select count(*) from import_batch").query(Long.class).single()).isEqualTo(1);
    }

    @Test
    void approvalNeedsTheAuthorityAndAtLeastOneGoodRow() throws Exception {
        UUID b = stage(sho1, s1, GOOD);
        send(sho1, "/api/imports/" + b + "/commit", Map.of("authority", "short")).andExpect(status().isBadRequest());
        UUID bad = stage(sho1, s1, HEAD + "x,y\n");
        commit(sho1, bad).andExpect(status().isConflict());
        assertThat(db.sql("select status from import_batch where id = ?").param(bad).query(String.class).single()).isEqualTo("staged");
    }

    @Test
    void aStagedBatchCanBeDiscardedAndItsDataIsRemoved() throws Exception {
        UUID b = stage(sho1, s1, GOOD);
        send(sho1, "/api/imports/" + b + "/discard", Map.of()).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("discarded"));
        assertThat(db.sql("select count(*) from import_row where batch_id = ? and (raw is not null or parsed is not null)").param(b).query(Long.class).single()).isZero();
        send(sho1, "/api/imports/" + b + "/discard", Map.of()).andExpect(status().isConflict());
        commit(sho1, b).andExpect(status().isConflict());
        assertThat(db.sql("select count(*) from fir").query(Long.class).single()).isZero();
    }

    @Test
    void anImportCanBeUndoneUntilWorkIsRecordedOnIt() throws Exception {
        UUID b = stage(sho1, s1, GOOD);
        send(sho1, "/api/imports/" + b + "/undo", Map.of("reason", "Wrong file uploaded")).andExpect(status().isConflict());
        commit(sho1, b);
        send(sho1, "/api/imports/" + b + "/undo", Map.of("reason", "short")).andExpect(status().isBadRequest());
        UUID fir = db.sql("select id from fir where fir_no = 1").query(UUID.class).single();
        db.sql("insert into fir_io_assignment (fir_id, to_io, assigned_by) values (?,?,?)").params(fir, ioUser, ioUser).update();
        send(sho1, "/api/imports/" + b + "/undo", Map.of("reason", "Wrong file uploaded")).andExpect(status().isConflict());
        assertThat(db.sql("select status from import_batch where id = ?").param(b).query(String.class).single()).isEqualTo("imported");
        assertThat(db.sql("select count(*) from fir").query(Long.class).single()).isEqualTo(2);
    }

    @Test
    void undoRefusesWhenSomeoneAddedAPersonAndOtherwiseRemovesTheBatch() throws Exception {
        UUID b = stage(sho1, s1, GOOD);
        commit(sho1, b);
        UUID fir = db.sql("select id from fir where fir_no = 1").query(UUID.class).single();
        db.sql("insert into person (fir_id, role, full_name) values (?, 'witness', 'Fictional Added Witness')").param(fir).update();
        send(sho1, "/api/imports/" + b + "/undo", Map.of("reason", "Wrong file uploaded")).andExpect(status().isConflict());
        db.sql("delete from person where full_name = 'Fictional Added Witness'").update();
        send(sho1, "/api/imports/" + b + "/undo", Map.of("reason", "Wrong file uploaded")).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("undone"))
                .andExpect(jsonPath("$.undone_by_name").value("Fictional SHO One")).andExpect(jsonPath("$.undo_reason").value("Wrong file uploaded"));
        assertThat(db.sql("select count(*) from fir").query(Long.class).single()).isZero();
        assertThat(db.sql("select count(*) from person").query(Long.class).single()).isZero();
        send(sho1, "/api/imports/" + b + "/undo", Map.of("reason", "Wrong file uploaded")).andExpect(status().isConflict());
    }

    @Test
    void batchRecordsCannotBeDeleted() {
        UUID b = db.sql("""
                insert into import_batch (station_id, entity, profile, filename, file_sha256, complaint_language, rows_total, created_by)
                values (?,'fir','fir-generic','f.csv','00','en',0,?) returning id""").params(s1, ioUser).query(UUID.class).single();
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> db.sql("delete from import_batch where id = ?").param(b).update()).hasMessageContaining("kept as written");
    }

    // ---- arrests file ----------------------------------------------------------------------------------------------

    static final String AHEAD = "FIR No,Accused,Arrested On,Place,Grounds,Person Informed,Arrested By,First Remand,Released,Release Type,Punishment Class\n";
    static final String ARRESTS = AHEAD
            + "1,Fictional Accused One,06/03/2024 18:30,Fictional Chowk,Theft,Fictional Relative,io.one,07/03/2024,,,less_than_10_years\n"
            + "1,Fictional Accused Two,06/03/2024,,,,,07/03/2024,15/03/2024,bail,less_than_10_years\n"
            + "2,Fictional Stranger,06/03/2024,,,,,,,,less_than_10_years\n"
            + "9,Fictional Accused One,06/03/2024,,,,,,,,less_than_10_years\n";

    UUID stageArrests(String who, UUID station, String csv) throws Exception {
        var body = stageBody(station, csv);
        body.put("profile", "arrest-generic");
        body.put("filename", "old-arrests.csv");
        return UUID.fromString(json.readTree(send(who, "/api/imports", body).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asText());
    }

    UUID firId(int no) {
        return db.sql("select id from fir where fir_no = ?").param(no).query(UUID.class).single();
    }

    @Test
    void arrestsAreCheckedAgainstTheFirsAndLoadedAsTheOldRecordHasThem() throws Exception {
        commit(sho1, stage(sho1, s1, GOOD)).andExpect(status().isOk());
        UUID b = stageArrests(sho1, s1, ARRESTS);
        mvc.perform(get("/api/imports/" + b).header("Authorization", sho1)).andExpect(jsonPath("$.entity").value("arrest"))
                .andExpect(jsonPath("$.rows_warning").value(2)).andExpect(jsonPath("$.rows_error").value(2));
        assertThat(db.sql("select count(*) from arrest").query(Long.class).single()).as("nothing before approval").isZero();
        mvc.perform(get("/api/imports/" + b + "/rows?status=error").header("Authorization", sho1))
                .andExpect(jsonPath("$[0].messages[0].text").value(org.hamcrest.Matchers.containsString("No accused of this name")))
                .andExpect(jsonPath("$[1].messages[0].text").value(org.hamcrest.Matchers.containsString("Load the FIR file first")));
        commit(sho1, b).andExpect(status().isOk()).andExpect(jsonPath("$.rows_imported").value(2));
        assertThat(db.sql("select count(*) from arrest where import_batch_id = ?").param(b).query(Long.class).single()).isEqualTo(2);
        var one = db.sql("""
                select a.*, ist_date(a.arrested_at) as day from arrest a join person p on p.id = a.person_id where p.full_name = 'Fictional Accused One'""").query().singleRow();
        assertThat(one.get("place")).isEqualTo("Fictional Chowk");
        assertThat(one.get("arresting_officer")).isEqualTo(ioUser);
        assertThat(one.get("first_remand_on").toString()).isEqualTo("2024-03-07");
        assertThat(one.get("remand_recorded_by")).as("the approver entered it").isNotNull();
        assertThat(one.get("released_on")).isNull();
        assertThat(one.get("source_hash")).isNotNull();
        var two = db.sql("select a.* from arrest a join person p on p.id = a.person_id where p.full_name = 'Fictional Accused Two'").query().singleRow();
        assertThat(two.get("place")).isEqualTo(ArrestImport.MISSING);
        assertThat(two.get("arresting_officer")).isNull();
        assertThat(two.get("release_basis")).isEqualTo("bail");
        assertThat(two.get("release_recorded_by")).isNotNull();
        // the case page lists both, the one without an arresting officer too
        mvc.perform(get("/api/firs/" + firId(1) + "/arrests").header("Authorization", sho1)).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[?(@.place=='Fictional Chowk')].arresting_officer_name").value("Fictional IO One"))
                .andExpect(jsonPath("$[?(@.place=='Not in the old record')].arresting_officer_name").value((Object) null));
        // the accused still in custody shows the 60/90-day deadline; the released one does not count
        assertThat(db.sql("select count(*) from case_deadline where fir_id = ? and kind = 'chargesheet_custody'").param(firId(1)).query(Long.class).single()).isEqualTo(1);
        assertThat(db.sql("select raw is null and parsed is null from import_row where batch_id = ? limit 1").param(b).query(Boolean.class).single()).isTrue();
    }

    @Test
    void anArrestInAConcludedOldCaseStartsNoClock() throws Exception {
        commit(sho1, stage(sho1, s1, HEAD + "3,05/03/2024 10:00,IPC 379,Fictional theft,,,,Fictional Accused Three,GD-3,disposed\n")).andExpect(status().isOk());
        commit(sho1, stageArrests(sho1, s1, AHEAD + "3,Fictional Accused Three,06/03/2024,,,,,07/03/2024,,,less_than_10_years\n")).andExpect(status().isOk());
        assertThat(db.sql("select count(*) from arrest").query(Long.class).single()).isEqualTo(1);
        assertThat(db.sql("select count(*) from case_deadline where fir_id = ? and kind = 'chargesheet_custody'").param(firId(3)).query(Long.class).single()).isZero();
    }

    @Test
    void theSameArrestAgainIsSkippedAndNeverChanged() throws Exception {
        commit(sho1, stage(sho1, s1, GOOD));
        commit(sho1, stageArrests(sho1, s1, ARRESTS));
        UUID again = stageArrests(sho1, s1, ARRESTS);
        mvc.perform(get("/api/imports/" + again).header("Authorization", sho1)).andExpect(jsonPath("$.rows_duplicate").value(2)).andExpect(jsonPath("$.rows_error").value(2));
        mvc.perform(get("/api/imports/" + again + "/rows?status=duplicate").header("Authorization", sho1))
                .andExpect(jsonPath("$[0].messages[*].text").value(org.hamcrest.Matchers.hasItem(org.hamcrest.Matchers.containsString("same content"))));
        UUID differs = stageArrests(sho1, s1, AHEAD + "1,Fictional Accused One,06/03/2024 09:00,Elsewhere,,,,,,,less_than_10_years\n");
        mvc.perform(get("/api/imports/" + differs + "/rows?status=duplicate").header("Authorization", sho1))
                .andExpect(jsonPath("$[0].messages[*].text").value(org.hamcrest.Matchers.hasItem(org.hamcrest.Matchers.containsString("already recorded"))));
        send(sho1, "/api/imports/" + differs + "/commit", Map.of("authority", "Order 13/2026 of the Fictional SP")).andExpect(status().isConflict());
                assertThat(db.sql("select count(*) from arrest").query(Long.class).single()).isEqualTo(2);
    }

    @Test
    void theSameAccusedTwiceOnOneDayInOneFileIsAnError() throws Exception {
        commit(sho1, stage(sho1, s1, GOOD));
        UUID b = stageArrests(sho1, s1, AHEAD + "1,Fictional Accused One,06/03/2024 09:00,,,,,,,,less_than_10_years\n1,Fictional Accused One,06/03/2024 21:00,,,,,,,,less_than_10_years\n");
        mvc.perform(get("/api/imports/" + b).header("Authorization", sho1)).andExpect(jsonPath("$.rows_error").value(1)).andExpect(jsonPath("$.rows_warning").value(1));
    }

    @Test
    void anArrestBatchCanBeUndoneAndLoadedAgain() throws Exception {
        commit(sho1, stage(sho1, s1, GOOD));
        String row = AHEAD + "1,Fictional Accused One,06/03/2024 18:30,,,,,,,,less_than_10_years\n";
        UUID b = stageArrests(sho1, s1, row);
        commit(sho1, b).andExpect(status().isOk());
        // the FIR batch cannot be undone while an arrest hangs on its people
        UUID firBatch = db.sql("select id from import_batch where entity = 'fir'").query(UUID.class).single();
        send(sho1, "/api/imports/" + firBatch + "/undo", Map.of("reason", "Wrong file uploaded")).andExpect(status().isConflict());
        send(sho1, "/api/imports/" + b + "/undo", Map.of("reason", "Wrong file uploaded")).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("undone")).andExpect(jsonPath("$.undo_reason").value("Wrong file uploaded"));
        assertThat(db.sql("select count(*) from arrest").query(Long.class).single()).isZero();
        assertThat(db.sql("select count(*) from fir").query(Long.class).single()).isEqualTo(2);
        commit(sho1, stageArrests(sho1, s1, row)).andExpect(status().isOk());
        assertThat(db.sql("select count(*) from arrest").query(Long.class).single()).isEqualTo(1);
    }

    @Test
    void anArrestBatchCannotBeUndoneOnceARemandWasRecordedOnAnImportedArrest() throws Exception {
        commit(sho1, stage(sho1, s1, GOOD));
        UUID b = stageArrests(sho1, s1, AHEAD + "1,Fictional Accused One,06/03/2024 18:30,,,,,,,,less_than_10_years\n");
        commit(sho1, b).andExpect(status().isOk());
        UUID arrest = db.sql("select id from arrest").query(UUID.class).single();
        send(sho1, "/api/firs/" + firId(1) + "/arrests/" + arrest + "/first-remand", Map.of("firstRemandOn", "2024-03-07")).andExpect(status().isNoContent());
        send(sho1, "/api/imports/" + b + "/undo", Map.of("reason", "Wrong file uploaded")).andExpect(status().isConflict());
        assertThat(db.sql("select status from import_batch where id = ?").param(b).query(String.class).single()).isEqualTo("imported");
        assertThat(db.sql("select count(*) from arrest").query(Long.class).single()).isEqualTo(1);
    }

    @Test
    void anArrestBatchCannotBeUndoneOnceACorrectionWasRecorded() throws Exception {
        commit(sho1, stage(sho1, s1, GOOD));
        UUID b = stageArrests(sho1, s1, AHEAD + "1,Fictional Accused One,06/03/2024 18:30,,,,,07/03/2024,,,less_than_10_years\n");
        commit(sho1, b).andExpect(status().isOk());
        UUID arrest = db.sql("select id from arrest").query(UUID.class).single();
        db.sql("insert into arrest_correction (arrest_id, first_remand_on, max_punishment, reason, recorded_by) values (?, '2024-03-08', 'life', 'Fictional correction reason', ?)")
                .params(arrest, ioUser).update();
        send(sho1, "/api/imports/" + b + "/undo", Map.of("reason", "Wrong file uploaded")).andExpect(status().isConflict());
        assertThat(db.sql("select count(*) from arrest").query(Long.class).single()).isEqualTo(1);
    }

    @Test
    void arrestsCanOnlyBeLoadedByTheStationsOwnLeadersAndTheProfilesAreListed() throws Exception {
        var body = stageBody(s1, ARRESTS);
        body.put("profile", "arrest-generic");
        send(sho2, "/api/imports", body).andExpect(status().isForbidden());
        send(io, "/api/imports", body).andExpect(status().isForbidden());
        send(sho1, "/api/imports/inspect", Map.of("profile", "arrest-generic", "csv", ARRESTS)).andExpect(status().isOk())
                .andExpect(jsonPath("$.suggested.accused_name").value("Accused")).andExpect(jsonPath("$.suggested.first_remand_on").value("First Remand"))
                .andExpect(jsonPath("$.suggested.arresting_officer").value("Arrested By"));
        mvc.perform(get("/api/imports/profiles").header("Authorization", sho1)).andExpect(jsonPath("$[?(@.id=='arrest-generic')].entity").value("arrest"))
                .andExpect(jsonPath("$[?(@.id=='fir-generic')].entity").value("fir"));
    }
}
