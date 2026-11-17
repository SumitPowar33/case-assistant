package in.caseassistant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.simple.JdbcClient;

/** Start-up writes each state module's laws to state_act (V57) and stops on a name recorded for another state. Fictional states. */
@SpringBootTest
class ModulesSyncApiTest {
    @Autowired Modules modules;
    @Autowired JdbcClient db;

    @Test
    void theStateLawsOfTheModulesAreWrittenOnceAndAnotherStatesRowStopsTheStart() {
        db.sql("truncate fir, police_station, state_pack, app_user cascade").update();
        modules.sync();
        modules.sync();   // a second start changes nothing
        assertThat(db.sql("select state_code from state_act where act = 'MPID Act'").query(String.class).list()).containsExactly("MH");
        assertThat(db.sql("select act from state_act where state_code = 'MH' order by act collate \"C\"").query(String.class).list()).containsExactly("MCOC Act", "MPID Act", "Maharashtra Prohibition Act");
        db.sql("truncate state_pack cascade").update();
        db.sql("insert into state_pack (code, name, version, languages) values ('KA','Fictional KA','1',array['kn'])").update();
        db.sql("insert into state_act (act, state_code) values ('MPID Act','KA')").update();
        assertThatThrownBy(modules::sync).hasMessageContaining("MH: MPID Act is recorded in this database as a law of another state");
        db.sql("truncate state_pack cascade").update();
        modules.sync();
    }
}
