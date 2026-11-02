package in.caseassistant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.test.web.servlet.MockMvc;

/** The dashboard (design board 1): the deadlines of exactly the cases the user is on the team of. Fictional data only. */
@SpringBootTest
@AutoConfigureMockMvc
class DashboardApiTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcClient db;
    @Autowired JwtEncoder tokens;
    @Autowired CaseTeam team;
    @Autowired ObjectMapper json;
    int no = 0;

    UUID station(String district) {
        return db.sql("insert into police_station (state_code, district_id, name) values ('IN',district_id_of('IN',?),?) returning id").params(district, "Fictional " + district + " PS").query(UUID.class).single();
    }

    UUID user(UUID station, String role) {
        return db.sql("insert into app_user (station_id, full_name, rank, role) values (?,?,'X',?) returning id").params(station, "Fictional " + role, role).query(UUID.class).single();
    }

    UUID fir(UUID station, UUID io, int daysAgo) {
        return db.sql("""
                insert into fir (station_id, fir_year, fir_no, gd_entry_no, registered_at, information_received_at, contents_original, contents_language, action_taken, io_id)
                values (?,2026,?,'GD-1',now() - make_interval(days => ?),now() - make_interval(days => ?, hours => 1),'Fictional complaint','en','investigate',?) returning id""")
                .params(station, ++no, daysAgo, daysAgo, io).query(UUID.class).single();
    }

    JsonNode board(UUID user) throws Exception {
        return json.readTree(mvc.perform(get("/api/dashboard").header("Authorization", TestAuth.bearer(tokens, user))).andReturn().getResponse().getContentAsString());
    }

    @Test
    void eachAccountSeesTheDeadlinesOfItsOwnCasesOnly() throws Exception {
        db.sql("truncate fir, police_station, state_pack, app_user cascade").update();
        db.sql("insert into state_pack (code, name, version, languages) values ('IN','National','1',array['en'])").update();
        UUID north = station("North"), south = station("South");
        UUID io = user(north, "io"), otherIo = user(north, "io"), sho = user(north, "sho"), desk = user(north, "front_desk"), farIo = user(south, "io");
        UUID mine = fir(north, io, 85);         // the 90-day victim update falls due within the week
        fir(north, otherIo, 10);
        fir(south, farIo, 10);
        for (UUID u : List.of(io, otherIo, sho, desk, farIo)) {
            var answer = board(u);
            Set<String> shown = new HashSet<>();
            answer.get("deadlines").forEach(d -> shown.add(d.get("fir_id").asText()));
            Set<String> onTeam = new HashSet<>(db.sql("select id::text from fir where " + team.includesSql("fir.id")).param(u).query(String.class).list());
            assertThat(onTeam).as("account " + u).containsAll(shown);
            assertThat(answer.get("cases").asInt()).as("account " + u).isEqualTo(onTeam.size());
        }
        var mineBoard = board(io);
        assertThat(mineBoard.get("cases").asInt()).isEqualTo(1);
        var first = mineBoard.get("deadlines").get(0);
        assertThat(first.get("fir_id").asText()).isEqualTo(mine.toString());
        assertThat(first.get("fir_no").asInt()).isEqualTo(1);
        assertThat(first.get("kind").asText()).isEqualTo("victim_progress_update");
        assertThat(mineBoard.get("due_in_7_days").asInt()).isEqualTo(1);
        assertThat(board(sho).get("cases").asInt()).isEqualTo(2);              // every case of the station
        assertThat(board(desk).get("deadlines")).isEmpty();                     // the front desk is not on case teams
        assertThat(board(farIo).get("cases").asInt()).isEqualTo(1);
    }
}
