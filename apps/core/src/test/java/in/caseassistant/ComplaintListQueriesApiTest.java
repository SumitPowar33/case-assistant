package in.caseassistant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.lang.reflect.Proxy;
import java.sql.Connection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.config.BeanPostProcessor;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.datasource.DelegatingDataSource;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.test.web.servlet.MockMvc;

/**
 * The front-desk complaint list (up to 200 rows) asks the database a fixed number of questions, not two or three per
 * complaint (session 44 note), and still says for each row exactly what opening that complaint says: withheld or not
 * (BNS 72) and how many golden-hour steps are overdue. Fictional data only.
 */
@SpringBootTest
@AutoConfigureMockMvc
class ComplaintListQueriesApiTest {
    static final AtomicInteger STATEMENTS = new AtomicInteger();

    /** Counts every statement the application prepares. */
    @TestConfiguration
    static class Counting {
        @Bean
        static BeanPostProcessor countStatements() {
            return new BeanPostProcessor() {
                @Override
                public Object postProcessAfterInitialization(Object bean, String name) {
                    if (!(bean instanceof DataSource ds)) return bean;
                    return new DelegatingDataSource(ds) {
                        @Override
                        public Connection getConnection() throws java.sql.SQLException {
                            Connection c = super.getConnection();
                            return (Connection) Proxy.newProxyInstance(Connection.class.getClassLoader(), new Class<?>[] {Connection.class}, (p, m, args) -> {
                                if (m.getName().startsWith("prepare") || m.getName().equals("createStatement")) STATEMENTS.incrementAndGet();
                                try {
                                    return m.invoke(c, args);
                                } catch (java.lang.reflect.InvocationTargetException e) {
                                    throw e.getCause();
                                }
                            });
                        }
                    };
                }
            };
        }
    }

    @Autowired MockMvc mvc;
    @Autowired JdbcClient db;
    @Autowired ObjectMapper json;
    @Autowired JwtEncoder tokens;

    String user(String role, UUID st) {
        return TestAuth.bearer(tokens, db.sql("insert into app_user (station_id, full_name, rank, role) values (?,?,'HC',?) returning id")
                .params(st, "Fictional " + role, role).query(UUID.class).single());
    }

    UUID complaint(String who, UUID station, String kind, int minutesAgo) throws Exception {
        var m = new HashMap<String, Object>();
        m.put("stationId", station);
        m.put("receivedAt", java.time.Instant.now().minusSeconds(60L * minutesAgo).toString());
        m.put("mode", "written");
        m.put("informantName", "Fictional Informant " + minutesAgo);
        m.put("kind", kind);
        m.put("text", "Fictional information number " + minutesAgo);
        m.put("textLanguage", "en");
        return UUID.fromString(json.readTree(post(who, "/api/complaints", m)).get("id").asText());
    }

    String post(String who, String path, Object body) throws Exception {
        var r = mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post(path).header("Authorization", who)
                .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body))).andReturn().getResponse();
        assertThat(r.getStatus()).as(path + " " + r.getContentAsString()).isLessThan(300);
        return r.getContentAsString();
    }

    @Test
    @SuppressWarnings("unchecked")
    void theListAsksAFixedNumberOfQueriesAndAgreesWithEachComplaint() throws Exception {
        db.sql("truncate fir, police_station, state_pack, app_user cascade").update();
        db.sql("insert into state_pack (code, name, version, languages) values ('IN','National','1',array['en'])").update();
        UUID station = db.sql("insert into police_station (state_code, district_id, name) values ('IN',district_id_of('IN','North'),'Fictional North PS') returning id").query(UUID.class).single();
        String clerk = user("front_desk", station), colleague = user("front_desk", station), sho = user("sho", station), io = user("io", station), malkhana = user("malkhana", station);
        String[] kinds = {"cyber_financial_fraud", "sexual_offence", "other"};
        int firNo = 0;
        for (int i = 0; i < 30; i++) {
            String by = i % 2 == 0 ? clerk : colleague;   // each desk officer writes down half of them
            UUID c = complaint(by, station, kinds[i % 3], 10 + i * 50);
            if (i % 4 == 0 && i % 3 < 2) post(by, "/api/complaints/" + c + "/steps", Map.of("stepId", i % 3 == 0 ? "report_1930" : "woman_officer"));
            if (i % 5 == 0) {   // signed and registered as an FIR; every other one with a sexual-offence section (protected)
                post(by, "/api/complaints/" + c + "/sign", Map.of());
                var fir = new HashMap<String, Object>(Map.of("stationId", station, "firYear", 2026, "firNo", ++firNo, "gdEntryNo", "GD-" + firNo,
                        "registeredAt", java.time.Instant.now().toString(), "actionTaken", "investigate", "complaintId", c));
                if (i % 10 == 0) fir.put("sections", List.of(Map.of("act", "BNS", "section", "64")));
                post(by, "/api/firs", fir);
            }
        }
        for (String who : new String[] {clerk, colleague, sho, io, malkhana}) {
            STATEMENTS.set(0);
            var answer = mvc.perform(get("/api/complaints").header("Authorization", who)).andReturn().getResponse();
            int asked = STATEMENTS.get();
            if (who.equals(malkhana)) {   // the malkhana does not register FIRs: no list
                assertThat(answer.getStatus()).isEqualTo(403);
                continue;
            }
            assertThat(answer.getStatus()).isEqualTo(200);
            List<Map<String, Object>> rows = json.readValue(answer.getContentAsString(), List.class);
            assertThat(rows).hasSize(30);
            assertThat(asked).as("statements for a list of 30").isLessThanOrEqualTo(8);
            for (var row : rows) {
                var one = (Map<String, Object>) json.readValue(mvc.perform(get("/api/complaints/" + row.get("id")).header("Authorization", who))
                        .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(), Map.class);
                assertThat(row.get("withheld")).as("withheld " + row.get("id")).isEqualTo(one.get("withheld"));
                assertThat(row.get("informant_name")).isEqualTo(one.get("informant_name"));
                long overdue = ((List<Map<String, Object>>) one.get("steps")).stream().filter(s -> Boolean.TRUE.equals(s.get("overdue"))).count();
                assertThat(((Number) row.get("steps_overdue")).longValue()).as("overdue " + row.get("id")).isEqualTo(overdue);
                assertThat(row.get("enquiry_overdue")).isEqualTo(one.get("enquiry_overdue"));
            }
            assertThat(rows.stream().map(r -> r.get("withheld")).distinct().count()).as(who + " sees both kinds").isGreaterThan(who.equals(sho) ? 0 : 1);
        }
    }
}
