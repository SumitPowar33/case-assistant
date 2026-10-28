package in.caseassistant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpMethod;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

/**
 * Walks every route the application serves, so a new endpoint cannot ship without a sign-in rule: nothing answers
 * without a token except the login, and a signed-in outsider cannot read any case under /api/firs/{id}. Fictional data.
 */
@SpringBootTest
@AutoConfigureMockMvc
class SecurityMatrixTest {
    static final Set<String> PUBLIC = Set.of("POST /api/login");
    static final Set<String> ADMIN_ONLY = Set.of("GET /api/users", "GET /api/admin-actions", "GET /api/sign-ins", "GET /api/roles");

    @Autowired MockMvc mvc;
    @Autowired JdbcClient db;
    @Autowired JwtEncoder tokens;
    @Autowired RequestMappingHandlerMapping routes;
    String outsider;
    UUID fir;

    record Route(String method, String path) {
        String key() {
            return method + " " + path;
        }
    }

    List<Route> all() {
        var out = new ArrayList<Route>();
        routes.getHandlerMethods().forEach((info, handler) -> {
            if (info.getPathPatternsCondition() == null) return;
            for (var pattern : info.getPathPatternsCondition().getPatternValues())
                for (var m : info.getMethodsCondition().getMethods())
                    if (pattern.startsWith("/api")) out.add(new Route(m.name(), pattern));
        });
        return out;
    }

    String fill(String path) {
        return path.replaceAll("\\{firId}|\\{id}", fir.toString()).replaceAll("\\{[^}]+}", UUID.randomUUID().toString());
    }

    @BeforeEach
    void setUp() {
        db.sql("truncate fir, police_station, state_pack, app_user cascade").update();
        db.sql("insert into state_pack (code, name, version, languages) values ('IN','National','1',array['en'])").update();
        UUID station = db.sql("insert into police_station (state_code, district, name) values ('IN','North','Fictional North PS') returning id").query(UUID.class).single();
        UUID other = db.sql("insert into police_station (state_code, district, name) values ('IN','South','Fictional South PS') returning id").query(UUID.class).single();
        fir = db.sql("""
                insert into fir (station_id, fir_year, fir_no, gd_entry_no, registered_at, information_received_at,
                  contents_original, contents_language, action_taken)
                values (?,2026,9,'GD-5','2026-10-01T10:00Z','2026-10-01T09:00Z','Fictional complaint','en','investigate')
                returning id""").param(station).query(UUID.class).single();
        outsider = TestAuth.bearer(tokens, db.sql("insert into app_user (station_id, full_name, rank, role) values (?,'SI Fictional Far','SI','io') returning id")
                .param(other).query(UUID.class).single());
    }

    @Test
    void theApplicationHasRoutesAndEveryPublicOneIsOnTheList() {
        var keys = all().stream().map(Route::key).toList();
        assertThat(keys.size()).isGreaterThan(40);
        assertThat(keys).containsAll(PUBLIC);
    }

    @Test
    void nothingAnswersWithoutATokenExceptThePublicRoutes() throws Exception {
        for (Route r : all()) {
            if (PUBLIC.contains(r.key())) continue;
            int status = mvc.perform(request(HttpMethod.valueOf(r.method()), fill(r.path()))).andReturn().getResponse().getStatus();
            assertThat(status).as(r.key()).isEqualTo(401);
        }
    }

    @Test
    void aSignedInOutsiderCannotReadAnyCaseRecord() throws Exception {
        int checked = 0;
        for (Route r : all()) {
            if (!r.method().equals("GET") || !r.path().startsWith("/api/firs/{")) continue;
            int status = mvc.perform(request(HttpMethod.GET, fill(r.path())).header("Authorization", outsider)).andReturn().getResponse().getStatus();
            assertThat(status).as(r.key()).isEqualTo(404);
            checked++;
        }
        assertThat(checked).isGreaterThan(15);
    }

    @Test
    void adminRoutesRefuseAnOrdinaryOfficer() throws Exception {
        for (String key : ADMIN_ONLY) {
            var parts = key.split(" ");
            assertThat(all().stream().map(Route::key)).as("route exists: " + key).contains(key);
            int status = mvc.perform(request(HttpMethod.valueOf(parts[0]), parts[1]).header("Authorization", outsider)).andReturn().getResponse().getStatus();
            assertThat(status).as(key).isEqualTo(403);
        }
    }
}
