package in.caseassistant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.test.web.servlet.MockMvc;

/**
 * GET /api/firs finds the FIRs through the user's own reach (load test, 1 Nov 2026), so it must list exactly the FIRs
 * that opening one allows (CaseTeam.canReadFirSql): for every kind of account, in and out of the station and district,
 * named IO or not, active or not. Fictional data only.
 */
@SpringBootTest
@AutoConfigureMockMvc
class FirListReachApiTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcClient db;
    @Autowired JwtEncoder tokens;
    @Autowired CaseTeam team;
    @Autowired ObjectMapper json;

    UUID station(String district, String name) {
        return db.sql("insert into police_station (state_code, district_id, name) values ('IN',district_id_of('IN',?),?) returning id").params(district, name).query(UUID.class).single();
    }

    UUID user(UUID station, String role) {
        return db.sql("insert into app_user (station_id, full_name, rank, role) values (?,?,'X',?) returning id").params(station, "Fictional " + role, role).query(UUID.class).single();
    }

    int no = 0;

    void fir(UUID station, UUID io) {
        db.sql("""
                insert into fir (station_id, fir_year, fir_no, gd_entry_no, registered_at, information_received_at, contents_original, contents_language, action_taken, io_id)
                values (?,2026,?,'GD-1',now() - make_interval(mins => ?),now() - make_interval(mins => ?, hours => 1),'Fictional complaint','en','investigate',?)""")
                .params(station, ++no, no, no, io).update();
    }

    @Test
    void everyAccountListsExactlyTheFirsItMayOpen() throws Exception {
        db.sql("truncate fir, police_station, state_pack, app_user cascade").update();
        db.sql("insert into state_pack (code, name, version, languages) values ('IN','National','1',array['en'])").update();
        UUID north = station("North", "Fictional North PS"), north2 = station("North", "Fictional Second North PS"), south = station("South", "Fictional South PS");
        UUID ioNorth = user(north, "io"), ioElsewhere = user(south, "io");
        List<UUID> accounts = new java.util.ArrayList<>(List.of(ioNorth, ioElsewhere, user(north, "io"), user(north, "front_desk"), user(south, "front_desk"),
                user(north, "sho"), user(north2, "sho"), user(north, "sp"), user(south, "sp"), user(north, "malkhana"), user(null, "prosecutor")));
        UUID retired = user(north, "sho");
        db.sql("update app_user set active = false where id = ?").param(retired).update();
        accounts.add(retired);
        for (UUID st : List.of(north, north2, south)) {
            fir(st, null);
            fir(st, st.equals(south) ? ioElsewhere : ioNorth);
        }
        fir(north2, ioNorth);       // the IO named on a case of another station of the district
        fir(south, ioNorth);        // and of another district
        Set<String> seen = new HashSet<>();
        for (UUID u : accounts) {
            var answer = mvc.perform(get("/api/firs?limit=200").header("Authorization", TestAuth.bearer(tokens, u))).andReturn().getResponse();
            if (u.equals(retired)) assertThat(answer.getStatus()).isEqualTo(401);   // an inactive account is refused before the list
            List<Map<String, Object>> rows = answer.getStatus() == 401 ? List.of() : json.readValue(answer.getContentAsString(), List.class);
            Set<String> listed = new HashSet<>(rows.stream().map(r -> (String) r.get("id")).toList());
            Set<String> mayOpen = new HashSet<>(db.sql("select id::text from fir where " + team.canReadFirSql()).param(u).query(String.class).list());
            assertThat(listed).as("account " + u).isEqualTo(mayOpen);
            assertThat(rows).hasSize(listed.size());
            seen.add(listed.size() + "");
        }
        assertThat(seen.size()).as("the accounts see different numbers of FIRs").isGreaterThan(3);
    }
}
