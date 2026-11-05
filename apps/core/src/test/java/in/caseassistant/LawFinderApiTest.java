package in.caseassistant;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.test.web.servlet.MockMvc;

/** GET /api/law-finder: any signed-in officer reads the draft old-to-new law table; nobody without a token. Fictional data only. */
@SpringBootTest
@AutoConfigureMockMvc
class LawFinderApiTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcClient db;
    @Autowired JwtEncoder tokens;

    @Test
    void anySignedInOfficerReadsTheTableAndItSaysItIsADraft() throws Exception {
        db.sql("truncate police_station, state_pack, app_user cascade").update();
        db.sql("insert into state_pack (code, name, version, languages) values ('IN','National','1',array['en'])").update();
        UUID st = db.sql("insert into police_station (state_code, district_id, name) values ('IN',district_id_of('IN','North'),'Fictional North PS') returning id").query(UUID.class).single();
        String front = TestAuth.bearer(tokens, db.sql("insert into app_user (station_id, full_name, rank, role) values (?,'HC Fictional Desk','HC','front_desk') returning id")
                .param(st).query(UUID.class).single());
        mvc.perform(get("/api/law-finder").header("Authorization", front)).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("draft"))
                .andExpect(jsonPath("$.note").value(org.hamcrest.Matchers.containsString("Advisory only")))
                .andExpect(jsonPath("$.entries[?(@.law=='IPC' && @.from=='302')].to").value("103"))
                .andExpect(jsonPath("$.entries[?(@.law=='CrPC' && @.from=='173')].newLaw").value("BNSS"))
                .andExpect(jsonPath("$.entries[?(@.law=='IEA' && @.from=='65B')].partial").value(true));
        mvc.perform(get("/api/law-finder")).andExpect(status().isUnauthorized());
    }
}
