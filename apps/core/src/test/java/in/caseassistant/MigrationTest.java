package in.caseassistant;

import static org.assertj.core.api.Assertions.assertThat;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.simple.JdbcClient;

@SpringBootTest
class MigrationTest {
    @Autowired JdbcClient db;
    @Autowired Flyway flyway;

    @Test
    void flywayAppliesTheCoreSchema() {
        assertThat(flyway.info().current().getVersion().getVersion()).isEqualTo("22");
        assertThat(db.sql("select count(*) from fir").query(Long.class).single()).isGreaterThanOrEqualTo(0);
    }
}
