package in.caseassistant;

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

/** Fictional people only. */
@SpringBootTest
@AutoConfigureMockMvc
class PeopleApiTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcClient db;
    @Autowired org.springframework.security.oauth2.jwt.JwtEncoder tokens;
    UUID fir, io, clerk, station;

    @BeforeEach
    void setUp() {
        db.sql("truncate fir, police_station, state_pack, app_user cascade").update();
        db.sql("insert into state_pack (code, name, version, languages) values ('IN','National','1',array['en'])").update();
        station = db.sql("insert into police_station (state_code, district, name) values ('IN','Testpur','Testpur City') returning id")
                .query(UUID.class).single();
        io = db.sql("insert into app_user (full_name, rank, role) values ('Officer Asha Rao','SI','io') returning id").query(UUID.class).single();
        clerk = db.sql("insert into app_user (full_name, rank, role) values ('Clerk Dev Nair','HC','front_desk') returning id").query(UUID.class).single();
        fir = db.sql("""
                insert into fir (station_id, fir_year, fir_no, gd_entry_no, registered_at, information_received_at,
                  contents_original, contents_language, action_taken, io_id, sexual_offence)
                values (?,2026,7,'GD-3','2026-10-01T10:00Z','2026-10-01T09:00Z','Fictional complaint','en','investigate',?,true)
                returning id""").params(station, io).query(UUID.class).single();
        db.sql("insert into person (fir_id, role, label, full_name, phone, identity_masked) "
                + "values (?, 'victim', 'V1', 'Meera Test', '9000000001', true)").param(fir).update();
    }

    @Test
    void caseTeamSeesTheRealName() throws Exception {
        mvc.perform(get("/api/firs/" + fir + "/people").header("Authorization", TestAuth.bearer(tokens, io)))
                .andExpect(jsonPath("$[0].display_name").value("Meera Test"))
                .andExpect(jsonPath("$[0].phone").value("9000000001"));
    }

    @Test
    void everyoneElseSeesTheMaskedVictim() throws Exception {
        mvc.perform(get("/api/firs/" + fir + "/people").header("Authorization", TestAuth.bearer(tokens, clerk))).andExpect(status().isOk())
                .andExpect(jsonPath("$[0].display_name").value("Victim V1"))
                .andExpect(jsonPath("$[0].phone").doesNotExist());
        mvc.perform(get("/api/firs/" + fir + "/people")).andExpect(status().isUnauthorized());
    }

    @Test
    void shoOfTheStationAndSpOfTheDistrictAreOnTheTeamOthersAreNot() throws Exception {
        UUID otherDistrict = db.sql("insert into police_station (state_code, district, name) values ('IN','Otherpur','Otherpur City') returning id")
                .query(UUID.class).single();
        UUID sameDistrict = db.sql("insert into police_station (state_code, district, name) values ('IN','Testpur','Testpur Rural') returning id")
                .query(UUID.class).single();
        String[][] cases = {{"sho", station.toString(), "Meera Test"}, {"sp", sameDistrict.toString(), "Meera Test"},
                {"sho", sameDistrict.toString(), "Victim V1"}, {"sp", otherDistrict.toString(), "Victim V1"}};
        for (String[] c : cases) {
            UUID u = db.sql("insert into app_user (station_id, full_name, rank, role) values (?::uuid,'Fictional Officer','Insp',?) returning id")
                    .params(c[1], c[0]).query(UUID.class).single();
            mvc.perform(get("/api/firs/" + fir + "/people").header("Authorization", TestAuth.bearer(tokens, u)))
                    .andExpect(jsonPath("$[0].display_name").value(c[2]));
        }
        db.sql("update app_user set active = false where id = ?").param(io).update();
        mvc.perform(get("/api/firs/" + fir + "/people").header("Authorization", TestAuth.bearer(tokens, io)))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void sectionAloneProtectsTheVictimAndWithholdsTheComplaintText() throws Exception {
        db.sql("update fir set sexual_offence = false").update();
        db.sql("update person set identity_masked = false").update();
        mvc.perform(get("/api/firs/" + fir).header("Authorization", TestAuth.bearer(tokens, clerk)))
                .andExpect(jsonPath("$.contents_original").value("Fictional complaint"))
                .andExpect(jsonPath("$.contents_withheld").value(false));
        db.sql("insert into fir_section (fir_id, act, section) values (?, 'BNS', '64(1)')").param(fir).update();
        mvc.perform(get("/api/firs/" + fir + "/people").header("Authorization", TestAuth.bearer(tokens, clerk)))
                .andExpect(jsonPath("$[0].display_name").value("Victim V1"))
                .andExpect(jsonPath("$[0].identity_masked").value(true));
        mvc.perform(get("/api/firs/" + fir + "/people").header("Authorization", TestAuth.bearer(tokens, io)))
                .andExpect(jsonPath("$[0].display_name").value("Meera Test"))
                .andExpect(jsonPath("$[0].identity_masked").value(true));
        mvc.perform(get("/api/firs/" + fir).header("Authorization", TestAuth.bearer(tokens, clerk)))
                .andExpect(jsonPath("$.contents_original").doesNotExist())
                .andExpect(jsonPath("$.contents_withheld").value(true));
        mvc.perform(get("/api/firs/" + fir).header("Authorization", TestAuth.bearer(tokens, io)))
                .andExpect(jsonPath("$.contents_original").value("Fictional complaint"));
    }
}
